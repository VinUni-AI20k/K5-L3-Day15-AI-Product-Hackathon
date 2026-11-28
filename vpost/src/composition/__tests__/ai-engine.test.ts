/**
 * Which provider adapters a process ends up with (E4, single-provider decision
 * 27/11/2026). This is the branch that decides whether the system boots at all
 * without a Google key, so it gets its own test rather than being implied by the
 * gateway tests.
 */

import { describe, expect, it } from "vitest";

import { FACEBOOK_CONTENT_TEMPLATE_V3 } from "@/adapters/ai/prompt-store/templates/facebook-content";
import type { Database } from "@/adapters/db/client";
import { makeContentEngine } from "@/core/ai/content-engine";
import {
  makeFakeLogger,
  makeFixedClock,
  makeRecordingGenerationLog,
  makeScriptedProvider,
  makeSequentialIds,
  makeStubPolicyStore,
  makeTestPolicy,
} from "@/core/ai/testing";
import { testTenantId } from "@/core/domain/tenant-context.testing";

import { buildProviders, makeAiPolicyStore, makeAiStores, tierModelsVariant } from "../ai-engine";
import { loadAiConfig } from "../config";

const OPENAI_ONLY = { OPENAI_API_KEY: "sk-openai" };

describe("buildProviders", () => {
  it("wires OpenAI alone when no Google key is configured", () => {
    const logger = makeFakeLogger();

    const providers = buildProviders(loadAiConfig(OPENAI_ONLY), logger);

    expect(Object.keys(providers)).toEqual(["openai"]);
    expect(providers.openai?.provider).toBe("openai");
    expect(providers.google).toBeUndefined();
  });

  // `GOOGLE_AI_API_KEY=` in a .env is the normal way to disable a provider; it
  // must take the same road as an absent variable, not a different one.
  it("treats a blank Google key exactly like a missing one", () => {
    const providers = buildProviders(
      loadAiConfig({ ...OPENAI_ONLY, GOOGLE_AI_API_KEY: "  " }),
      makeFakeLogger(),
    );

    expect(Object.keys(providers)).toEqual(["openai"]);
  });

  it("says out loud that Google is not wired, so the missing fallback is visible", () => {
    const logger = makeFakeLogger();

    buildProviders(loadAiConfig(OPENAI_ONLY), logger);

    const warning = logger.entries.find(
      (entry) => entry.level === "warn" && entry.message.includes("GOOGLE_AI_API_KEY"),
    );
    expect(warning).toBeDefined();
    expect(warning?.context).toMatchObject({ wired_providers: ["openai"] });
  });

  it("wires both providers when a Google key IS present — re-enabling needs no code change", () => {
    const providers = buildProviders(
      loadAiConfig({ ...OPENAI_ONLY, GOOGLE_AI_API_KEY: "AIza-paid" }),
      makeFakeLogger(),
    );

    expect(Object.keys(providers).sort()).toEqual(["google", "openai"]);
    expect(providers.google?.provider).toBe("google");
  });
});

/**
 * The label goes into the Redis cache key, so two processes with the same
 * settings must produce the same string and two with different settings must
 * not — otherwise they read each other's routing.
 */
describe("tierModelsVariant", () => {
  it("is 'default' when no tier is overridden", () => {
    expect(tierModelsVariant({})).toBe("default");
    expect(tierModelsVariant({ cheap: undefined, mid: "  " })).toBe("default");
  });

  it("names only the tiers actually set", () => {
    expect(tierModelsVariant({ mid: "openai:gpt-4.1" })).toBe("mid=openai_gpt-4.1");
  });

  // The label is one segment of the Redis key; a raw ":" would add segments and
  // make the tenant-wide invalidation pattern depend on where they land.
  it("never emits the cache key separator", () => {
    expect(tierModelsVariant({ cheap: "openai:gpt-4o-mini", top: "openai:gpt-5" })).not.toContain(
      ":",
    );
  });

  it("is stable regardless of the order the tiers were written in", () => {
    expect(tierModelsVariant({ top: "openai:gpt-5", cheap: "openai:gpt-4o-mini" })).toBe(
      tierModelsVariant({ cheap: "openai:gpt-4o-mini", top: "openai:gpt-5" }),
    );
  });

  it("separates two different swaps", () => {
    expect(tierModelsVariant({ cheap: "openai:gpt-4.1" })).not.toBe(
      tierModelsVariant({ cheap: "openai:gpt-4o-mini" }),
    );
  });
});

/**
 * The tier swap has to reach the YAML store AND the cache key. Losing either
 * half is the bug of 27/11/2026: the model did not change, or another process's
 * routing was served back. Both halves are asserted here on the REAL registry.
 */
describe("makeAiPolicyStore", () => {
  function memoryCache() {
    const store = new Map<string, string>();
    return {
      store,
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async set(key: string, value: string) {
        store.set(key, value);
      },
      async invalidate() {},
    };
  }

  const build = (env: Record<string, string | undefined>, cache?: ReturnType<typeof memoryCache>) =>
    makeAiPolicyStore({
      config: loadAiConfig({ ...OPENAI_ONLY, ...env }),
      clock: makeFixedClock(),
      logger: makeFakeLogger(),
      cache,
    });

  it("resolves the shipped ladder when nothing is overridden", async () => {
    const policy = await build({}).getPolicy({ tenantId: testTenantId("t1"), task: "facebook_content" });

    expect(policy.tiers.cheap[0].model).toBe("gpt-4.1-mini");
  });

  it("routes to the model named by AI_MODEL_CHEAP", async () => {
    const policy = await build({ AI_MODEL_CHEAP: "openai:gpt-4o-mini" }).getPolicy({
      tenantId: testTenantId("t1"),
      task: "facebook_content",
    });

    expect(policy.tiers.cheap[0].model).toBe("gpt-4o-mini");
  });

  it("writes the swap into the cache key so a plain process cannot read it", async () => {
    const cache = memoryCache();

    await build({ AI_MODEL_CHEAP: "openai:gpt-4o-mini" }, cache).getPolicy({
      tenantId: testTenantId("t1"),
      task: "facebook_content",
    });
    await build({}, cache).getPolicy({ tenantId: testTenantId("t1"), task: "facebook_content" });

    expect(cache.store.size).toBe(2);
    const [swapped, plain] = [...cache.store.keys()].sort();
    expect(swapped).toContain("cheap=openai_gpt-4o-mini");
    expect(plain).toContain(":default:");
  });

  it("rejects a model key that is not in the registry", async () => {
    await expect(
      build({ AI_MODEL_TOP: "openai:nope" }).getPolicy({ tenantId: testTenantId("t1"), task: "facebook_content" }),
    ).rejects.toMatchObject({ code: "MODEL_NOT_CONFIGURED" });
  });
});

/**
 * Runtime proof after removing the DB-backed "Mẫu prompt" feature:
 * `makeAiStores` wires the built-in static prompt store directly, so caption
 * generation renders the built-in default template without touching the DB.
 */
describe("makeAiStores — built-in default prompt store", () => {
  function makeUntouchableDb(): Database {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(`Unexpected DB access during prompt lookup: ${String(prop)}`);
        },
      },
    ) as Database;
  }

  it("resolves the built-in default template without touching the database", async () => {
    const stores = makeAiStores({
      logger: makeFakeLogger(),
      clock: makeFixedClock(),
      db: makeUntouchableDb(),
      env: OPENAI_ONLY,
    });

    try {
      const active = await stores.prompts.getActive({
        tenantId: testTenantId("tenant-1"),
        task: "facebook_content",
        platform: "facebook",
      });

      expect(active).toEqual(FACEBOOK_CONTENT_TEMPLATE_V3);
    } finally {
      await stores.close();
    }
  });

  it("drives ContentEngine caption generation end-to-end with the built-in default template", async () => {
    const logger = makeFakeLogger();
    const stores = makeAiStores({
      logger,
      clock: makeFixedClock(),
      db: makeUntouchableDb(),
      env: OPENAI_ONLY,
    });
    const generationLog = makeRecordingGenerationLog();
    const google = makeScriptedProvider("google", [
      {
        kind: "ok",
        output: {
          title: "THANH LỊCH CHO NGÀY HÈ",
          body: "Đầm lụa mềm mát, dáng suông thoải mái cho mọi buổi dạo phố.",
          hashtags: ["#dam", "#lua", "#he2026"],
          claims: [{ field: "material", statement: "lụa mềm mát", sourceText: "lụa mềm mát" }],
          confidence: 0.9,
        },
      },
    ]);

    try {
      const engine = makeContentEngine({
        providers: { google },
        policies: makeStubPolicyStore(makeTestPolicy()),
        prompts: stores.prompts,
        generationLog,
        logger,
        clock: makeFixedClock(),
        ids: makeSequentialIds(),
      });

      const result = await engine.generate({
        tenantId: testTenantId("tenant-1"),
        task: "facebook_content",
        product: {
          name: "Penny",
          description: "Đầm dáng suông chất liệu lụa mềm mát.",
          category: "Đầm",
          season: "Hè 2026",
        },
        platform: "facebook",
        contentType: "photo_post",
        vision: { mode: "none" },
        language: "vi",
        constraints: { hashtagMin: 3, hashtagMax: 5 },
      });

      expect(result.metadata.promptTemplateId).toBe(FACEBOOK_CONTENT_TEMPLATE_V3.id);
      expect(result.metadata.promptVersion).toBe(FACEBOOK_CONTENT_TEMPLATE_V3.version);
      expect(google.calls).toHaveLength(1);
      expect(google.calls[0].system).toBe(FACEBOOK_CONTENT_TEMPLATE_V3.systemPrompt);
      const textPart = google.calls[0].messages[0].parts[0];
      expect(textPart.type === "text" && textPart.text).toContain("Penny");
      expect(generationLog.entries).toHaveLength(1);
      expect(generationLog.entries[0].promptTemplateId).toBe(FACEBOOK_CONTENT_TEMPLATE_V3.id);
      expect(generationLog.entries[0].promptVersion).toBe(FACEBOOK_CONTENT_TEMPLATE_V3.version);
    } finally {
      await stores.close();
    }
  });
});
