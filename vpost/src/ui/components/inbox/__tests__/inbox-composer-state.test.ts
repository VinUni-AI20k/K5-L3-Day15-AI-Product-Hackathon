import { describe, expect, it } from "vitest";

import {
  clearBlockedDraftFromStorage,
  clearThreadDraftFromStorage,
  computeAutoGrowRows,
  decideComposerKeyAction,
  evaluateInboxComposerGate,
  extractQuickReplyTrigger,
  hasSeenEnterHint,
  isSlashCommandOnly,
  loadBlockedDraftFromStorage,
  loadThreadDraftFromStorage,
  markEnterHintSeen,
  persistBlockedDraftIfEmpty,
  resolveBlockedRestoration,
  resolveInitialComposerText,
  saveBlockedDraftToStorage,
  saveThreadDraftToStorage,
  type ComposerKeyInput,
  type StorageLike,
} from "@/ui/components/inbox/inbox-composer-state";
import type { CommentDraft } from "@/ui/schemas/comment.schema";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
}

function baseKey(overrides: Partial<ComposerKeyInput> = {}): ComposerKeyInput {
  return {
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 13,
    menuConsumed: false,
    isCoarsePointer: false,
    canSend: true,
    ...overrides,
  };
}

describe("composer key handling matrix", () => {
  it("sends on bare Enter on fine pointer when menu is closed and not composing", () => {
    expect(decideComposerKeyAction(baseKey())).toBe("send");
  });

  it("inserts newline on Shift+Enter instead of sending", () => {
    expect(decideComposerKeyAction(baseKey({ shiftKey: true }))).toBe("newline");
  });

  it("inserts newline on Enter for coarse pointer / narrow touch screens", () => {
    expect(decideComposerKeyAction(baseKey({ isCoarsePointer: true }))).toBe("newline");
  });

  it("skips composer handling when QuickReplyMenu consumed the key (Enter/Esc/Arrows)", () => {
    expect(decideComposerKeyAction(baseKey({ menuConsumed: true }))).toBe("menu");
    expect(
      decideComposerKeyAction(baseKey({ key: "Escape", menuConsumed: true })),
    ).toBe("menu");
    expect(
      decideComposerKeyAction(baseKey({ key: "ArrowDown", menuConsumed: true })),
    ).toBe("menu");
  });

  it("passes through during IME composition (isComposing or keyCode 229)", () => {
    expect(decideComposerKeyAction(baseKey({ isComposing: true }))).toBe("passthrough");
    expect(decideComposerKeyAction(baseKey({ keyCode: 229 }))).toBe("passthrough");
  });

  it("swallows bare Enter when cannot send (empty, over-limit, or read-only)", () => {
    expect(decideComposerKeyAction(baseKey({ canSend: false }))).toBe("ignore-enter");
  });

  it("passes through non-Enter keys and modified Enter combos", () => {
    expect(decideComposerKeyAction(baseKey({ key: "a" }))).toBe("passthrough");
    expect(decideComposerKeyAction(baseKey({ ctrlKey: true }))).toBe("passthrough");
    expect(decideComposerKeyAction(baseKey({ metaKey: true }))).toBe("passthrough");
  });

  it("never sends on Enter while QuickReplyMenu is open (even with 0 matches / menuConsumed=false)", () => {
    expect(
      decideComposerKeyAction(
        baseKey({ menuOpen: true, menuConsumed: false, canSend: true }),
      ),
    ).toBe("ignore-enter");
    expect(
      decideComposerKeyAction(
        baseKey({ menuOpen: true, menuConsumed: false, shiftKey: true }),
      ),
    ).toBe("newline");
  });

  it("never sends raw /command-only text on Enter even after the menu is dismissed", () => {
    expect(isSlashCommandOnly("/")).toBe(true);
    expect(isSlashCommandOnly("/baoga")).toBe(true);
    expect(isSlashCommandOnly("  /phi-ship_1  ")).toBe(true);
    expect(isSlashCommandOnly("")).toBe(false);
    expect(isSlashCommandOnly("   ")).toBe(false);
    expect(isSlashCommandOnly("Dạ còn size M ạ")).toBe(false);
    expect(isSlashCommandOnly("/ là dấu gạch chéo")).toBe(false);
    expect(isSlashCommandOnly("/gia\ndòng 2")).toBe(false);

    expect(
      decideComposerKeyAction(
        baseKey({ menuOpen: false, isSlashCommandOnly: true, canSend: true }),
      ),
    ).toBe("ignore-enter");
  });
});

describe("composer draft persistence, prefill, auto-grow, trigger, and gating", () => {
  it("persists per-thread draft text in sessionStorage and safely catches storage errors", () => {
    const store = memoryStorage();
    saveThreadDraftToStorage("t1", "Dạ còn size M", store);
    saveThreadDraftToStorage("t2", "Shop gửi bảng giá", store);

    expect(loadThreadDraftFromStorage("t1", store)).toBe("Dạ còn size M");
    expect(loadThreadDraftFromStorage("t2", store)).toBe("Shop gửi bảng giá");

    clearThreadDraftFromStorage("t1", store);
    expect(loadThreadDraftFromStorage("t1", store)).toBeNull();
    expect(loadThreadDraftFromStorage("t2", store)).toBe("Shop gửi bảng giá");

    expect(hasSeenEnterHint(store)).toBe(false);
    markEnterHintSeen(store);
    expect(hasSeenEnterHint(store)).toBe(true);

    // Throwing storage never crashes
    const broken = throwingStorage();
    expect(() => saveThreadDraftToStorage("t1", "hello", broken)).not.toThrow();
    expect(loadThreadDraftFromStorage("t1", broken)).toBeNull();
    expect(() => clearThreadDraftFromStorage("t1", broken)).not.toThrow();
    expect(hasSeenEnterHint(broken)).toBe(false);
    expect(() => markEnterHintSeen(broken)).not.toThrow();
  });

  it("prefers stored per-thread draft over AI draft and pre-fills unsent AI draft otherwise", () => {
    const aiDraft: CommentDraft = {
      id: "d1",
      status: "draft",
      text: "Nháp AI sẵn có",
      aiText: "Nháp AI sẵn có",
      reasons: [],
      warnings: [],
      errorCode: null,
      userMessage: null,
      updatedAt: "2026-11-27T10:00:00+07:00",
    };

    expect(
      resolveInitialComposerText({
        storedDraft: "Bản đang gõ dở",
        aiDraft,
        hasUserTyped: false,
      }),
    ).toEqual({ text: "Bản đang gõ dở", source: "stored" });

    expect(
      resolveInitialComposerText({
        storedDraft: null,
        aiDraft,
        hasUserTyped: false,
      }),
    ).toEqual({ text: "Nháp AI sẵn có", source: "ai" });

    expect(
      resolveInitialComposerText({
        storedDraft: null,
        aiDraft: { ...aiDraft, status: "sent" },
        hasUserTyped: false,
      }),
    ).toEqual({ text: "", source: "empty" });
  });

  it("computes auto-grow rows, quick-reply slash trigger, and character/read-only gates", () => {
    expect(computeAutoGrowRows("")).toBe(2);
    expect(computeAutoGrowRows("1\n2\n3\n4")).toBe(4);
    expect(computeAutoGrowRows("1\n2\n3\n4\n5\n6\n7\n8")).toBe(6);

    expect(extractQuickReplyTrigger("/gia", false)).toEqual({
      open: true,
      query: "gia",
    });
    expect(extractQuickReplyTrigger("/gia", true)).toEqual({
      open: false,
      query: "",
    });
    expect(extractQuickReplyTrigger("Xin chào /gia", false)).toEqual({
      open: false,
      query: "",
    });
    expect(extractQuickReplyTrigger("/gia\ndong 2", false)).toEqual({
      open: false,
      query: "",
    });

    const nearLimit = evaluateInboxComposerGate({
      text: "a".repeat(1800),
      canComment: true,
      readOnlyReason: null,
      isGeneratingDraft: false,
    });
    expect(nearLimit.showRemainingCount).toBe(true);
    expect(nearLimit.remainingChars).toBe(200);
    expect(nearLimit.canSend).toBe(true);

    const overLimit = evaluateInboxComposerGate({
      text: "a".repeat(2001),
      canComment: true,
      readOnlyReason: null,
      isGeneratingDraft: false,
    });
    expect(overLimit.isOverLimit).toBe(true);
    expect(overLimit.canSend).toBe(false);

    const readOnly = evaluateInboxComposerGate({
      text: "Dạ có sẵn ạ",
      canComment: true,
      readOnlyReason: "Chế độ hỗ trợ chỉ được xem.",
      isGeneratingDraft: false,
    });
    expect(readOnly.canEdit).toBe(false);
    expect(readOnly.canSend).toBe(false);
    expect(readOnly.canGenerateDraft).toBe(false);
    expect(readOnly.sendDisabledReason).toBe("Chế độ hỗ trợ chỉ được xem.");

    const menuOpenGate = evaluateInboxComposerGate({
      text: "/baoga",
      canComment: true,
      readOnlyReason: null,
      isGeneratingDraft: false,
      menuOpen: true,
    });
    expect(menuOpenGate.canEdit).toBe(true);
    expect(menuOpenGate.canSend).toBe(false);
    expect(menuOpenGate.sendDisabledReason).toContain("Esc");
  });

  it("persists 422 BLOCKED text per thread without overwriting newer typed text", () => {
    const store = memoryStorage();

    // Case 1: Operator sent on thread A, switched to thread B, then 422 returned -> stored in thread A's draft
    expect(persistBlockedDraftIfEmpty("tA", "Freeship toàn quốc", store)).toEqual({
      storedInComposerDraft: true,
    });
    expect(loadThreadDraftFromStorage("tA", store)).toBe("Freeship toàn quốc");
    expect(loadBlockedDraftFromStorage("tA", store)).toBeNull();
    expect(loadThreadDraftFromStorage("tB", store)).toBeNull();

    // Case 2: Operator already started typing newer text on thread C before 422 returned -> NEVER overwrite
    saveThreadDraftToStorage("tC", "Dạ còn size M ạ", store);
    expect(persistBlockedDraftIfEmpty("tC", "Freeship toàn quốc", store)).toEqual({
      storedInComposerDraft: false,
    });
    expect(loadThreadDraftFromStorage("tC", store)).toBe("Dạ còn size M ạ");
    expect(loadBlockedDraftFromStorage("tC", store)).toBe("Freeship toàn quốc");

    // Mount restoration prefers stored draft, falls back to blocked text when storage is empty
    expect(
      resolveInitialComposerText({
        storedDraft: null,
        blockedRejectedText: "Freeship toàn quốc",
        aiDraft: null,
        hasUserTyped: false,
      }),
    ).toEqual({ text: "Freeship toàn quốc", source: "blocked" });
    expect(
      resolveInitialComposerText({
        storedDraft: "Dạ còn size M ạ",
        blockedRejectedText: "Freeship toàn quốc",
        aiDraft: null,
        hasUserTyped: false,
      }),
    ).toEqual({ text: "Dạ còn size M ạ", source: "stored" });

    // Live 422 reconciliation restores into empty composer, or preserves separately when operator typed
    expect(
      resolveBlockedRestoration({
        currentText: "",
        rejectedText: "Freeship toàn quốc",
      }),
    ).toEqual({ nextText: "Freeship toàn quốc", preservedBlockedText: null });
    expect(
      resolveBlockedRestoration({
        currentText: "Dạ còn size M ạ",
        rejectedText: "Freeship toàn quốc",
      }),
    ).toEqual({
      nextText: "Dạ còn size M ạ",
      preservedBlockedText: "Freeship toàn quốc",
    });

    // Storage helpers survive throwing storage cleanly
    const broken = throwingStorage();
    expect(() => saveBlockedDraftToStorage("tC", "Freeship", broken)).not.toThrow();
    expect(loadBlockedDraftFromStorage("tC", broken)).toBeNull();
    expect(() => clearBlockedDraftFromStorage("tC", broken)).not.toThrow();
    clearBlockedDraftFromStorage("tC", store);
    expect(loadBlockedDraftFromStorage("tC", store)).toBeNull();
  });
});
