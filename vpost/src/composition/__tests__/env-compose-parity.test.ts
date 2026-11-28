import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Every variable the deploy env files ship must be READ by compose.
 *
 * This test exists because the same bug shipped twice. `vpost/docker-compose.yml`
 * passes environment explicitly rather than through `env_file`, which is a
 * deliberate choice (each container carries only the secrets it uses). The cost
 * is that a variable can live in `vpost/deploy/env/*.env.example`, be filled in
 * on the VPS, and never reach the process — with no error anywhere, because
 * every one of these lists is legal when empty:
 *
 *   - `AUTH_FACEBOOK_ALLOWED_USER_IDS` was missing once and silently disabled
 *     Facebook sign-in in every container (see the comment in compose);
 *   - `AUTH_BOOTSTRAP_ADMINS` was missing again and left the deployment with no
 *     bootstrap admin at all, while `.env` on the box said otherwise.
 *
 * Neither was caught by typecheck, lint, tests or the deploy — the container
 * boots perfectly and just answers "no" to everyone. A string comparison of two
 * files is the only gate that sees it.
 *
 * The root production stack (`deploy/docker-compose.prod.yml` +
 * `deploy/env/prod.env.example`) loads `.env` via `env_file` across every app
 * service AND interpolates structural/required vars explicitly; the second
 * suite locks both halves of that contract plus merge completeness against the
 * root and `vpost/` `.env.example` files.
 */

const VPOST_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_ROOT = join(VPOST_ROOT, "..");

/**
 * Read by `docker compose` itself before any service is rendered, so it is
 * never interpolated into the file. The one legitimate absence.
 */
const COMPOSE_OWN_VARS = new Set(["COMPOSE_PROJECT_NAME"]);

/**
 * Written by CI on every deploy into `.image-tag.env` (never operator-set in
 * `deploy/env/prod.env.example`).
 */
const CI_INJECTED_VARS = new Set(["IMAGE_PREFIX", "IMAGE_TAG"]);

/**
 * Dev-only or compose-derived variables present in local `.env.example` files
 * that `deploy/docker-compose.prod.yml` intentionally hardcodes or omits.
 */
const PROD_COMPOSE_WIRED_OR_DEV_ONLY = new Set([
  "NODE_ENV",
  "LOG_PRETTY",
  "DATABASE_URL",
  "REDIS_URL",
  "VPOST_API_URL",
  "WORKER_HEARTBEAT_FILE",
  "WEB_PORT",
  "CADDY_HTTP_PORT",
  "MINIO_API_PORT",
]);

function parseEnvEntries(filePath: string): Array<{ key: string; value: string }> {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
}

function envVarNames(filePath: string): string[] {
  return parseEnvEntries(filePath).map((entry) => entry.key);
}

function composeInterpolations(filePaths: string[]): Set<string> {
  const text = filePaths.map((file) => readFileSync(file, "utf8")).join("\n");
  return new Set([...text.matchAll(/\$\{([A-Z0-9_]+)/g)].map((match) => match[1]!));
}

describe("vpost deploy env ↔ docker-compose parity", () => {
  const referenced = composeInterpolations([
    join(VPOST_ROOT, "docker-compose.yml"),
    join(VPOST_ROOT, "docker-compose.prod.yml"),
  ]);

  for (const file of ["stg.env.example", "prod.env.example"]) {
    it(`every variable in vpost/deploy/env/${file} is read somewhere in vpost compose`, () => {
      const declared = envVarNames(join(VPOST_ROOT, "deploy", "env", file)).filter(
        (name) => !COMPOSE_OWN_VARS.has(name),
      );

      // Named rather than counted: the failure message has to say WHICH variable
      // silently does nothing, or the next person re-derives this bug by hand.
      const unread = declared.filter((name) => !referenced.has(name));
      expect(unread).toEqual([]);
    });
  }

  it("reads a non-trivial number of variables — a glob that matched nothing would pass", () => {
    expect(envVarNames(join(VPOST_ROOT, "deploy", "env", "stg.env.example")).length).toBeGreaterThan(20);
    expect(referenced.size).toBeGreaterThan(20);
  });
});

interface ComposeService {
  env_file?: Array<string | { path?: string }>;
}

describe("root deploy/env/prod.env.example ↔ deploy/docker-compose.prod.yml parity", () => {
  const prodEnvPath = join(REPO_ROOT, "deploy", "env", "prod.env.example");
  const prodComposePath = join(REPO_ROOT, "deploy", "docker-compose.prod.yml");

  const prodEntries = parseEnvEntries(prodEnvPath);
  const prodVars = new Set(prodEntries.map((entry) => entry.key));
  const composeRefs = composeInterpolations([prodComposePath]);

  it("loads .env via env_file in every application service (migrate, api, web, worker)", () => {
    const parsed = parse(readFileSync(prodComposePath, "utf8")) as {
      services?: Record<string, ComposeService>;
    };
    const services = parsed.services ?? {};

    for (const name of ["migrate", "api", "web", "worker"]) {
      const envFiles = services[name]?.env_file ?? [];
      const paths = envFiles.map((entry) => (typeof entry === "string" ? entry : (entry.path ?? "")));
      expect(paths.some((p) => p.endsWith(".env")), `${name} must load .env via env_file`).toBe(true);
    }
  });

  it("every variable interpolated in deploy/docker-compose.prod.yml is declared in deploy/env/prod.env.example (or CI-injected)", () => {
    const undeclared = [...composeRefs].filter(
      (name) => !CI_INJECTED_VARS.has(name) && !prodVars.has(name),
    );
    expect(undeclared).toEqual([]);
  });

  it("merges every non-dev variable from root .env.example and vpost/.env.example into deploy/env/prod.env.example", () => {
    const sourceVars = new Set([
      ...envVarNames(join(REPO_ROOT, ".env.example")),
      ...envVarNames(join(VPOST_ROOT, ".env.example")),
    ]);
    const missing = [...sourceVars].filter(
      (name) => !PROD_COMPOSE_WIRED_OR_DEV_ONLY.has(name) && !prodVars.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("keeps all secret/credential keys empty in deploy/env/prod.env.example", () => {
    const secretPattern = /(PASSWORD|SECRET|API_KEY|ACCESS_KEY|TOKEN|SERVICE_ACCOUNT_JSON|ENC_KEY)$/;
    const nonEmptySecrets = prodEntries
      .filter(({ key, value }) => secretPattern.test(key) && value.length > 0)
      .map(({ key }) => key);
    expect(nonEmptySecrets).toEqual([]);
  });

  it("covers a non-trivial number of variables", () => {
    expect(prodVars.size).toBeGreaterThan(25);
    expect(composeRefs.size).toBeGreaterThan(15);
  });
});
