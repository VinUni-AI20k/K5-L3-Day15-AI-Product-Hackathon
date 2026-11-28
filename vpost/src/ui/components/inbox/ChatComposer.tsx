"use client";

import {
  Banner,
  Button,
  HStack,
  LayoutFooter,
  Stack,
  Text,
  TextArea,
} from "@astryxdesign/core";
import { Send, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "@/shared/utils";
import { CommentErrorNotice } from "@/ui/components/comments/CommentErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
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
  resolveBlockedRestoration,
  resolveInitialComposerText,
  saveBlockedDraftToStorage,
  saveThreadDraftToStorage,
} from "@/ui/components/inbox/inbox-composer-state";
import {
  QuickReplyMenu,
  type QuickReplyKeyHandler,
} from "@/ui/components/inbox/quick-replies/QuickReplyMenu";
import {
  COMMENT_REPLY_MAX_LENGTH,
  filterReplyWarnings,
  type InboxThread,
} from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

export interface ComposerBlockedState {
  readonly seq: number;
  readonly reasons: readonly string[];
  readonly rejectedText: string;
}

export interface ChatComposerProps {
  readonly thread: InboxThread;
  readonly canComment: boolean;
  readonly readOnlyReason: string | null;
  readonly isCoarsePointer: boolean;
  readonly isNarrowViewport: boolean;
  readonly isGeneratingDraft: boolean;
  readonly draftError: unknown;
  readonly blockedState: ComposerBlockedState | null;
  /** Optional initial text override (primarily for deterministic render tests). */
  readonly initialTextOverride?: string;
  readonly onSendReply: (text: string) => void;
  readonly onRegenerateDraft: () => void;
  readonly onClearBlocked: () => void;
}

/**
 * Fixed bottom composer for the chat thread.
 * - Auto-grows declaratively via `rows` (no inline styles)
 * - Max 2000 characters with remaining count shown from 1800+
 * - Pre-fills AI draft when operator has not typed; persists per-thread text in sessionStorage
 * - Calls `QuickReplyMenu`'s `registerKeyHandler` FIRST in `onKeyDown`
 * - Enter sends / Shift+Enter newline (Enter = newline on coarse pointer / narrow screens)
 * - Never disabled while sending; clears and refocuses immediately on submit
 * - Shows 422 BLOCKED reasons inline with `aria-invalid` + `aria-describedby`
 */
export function ChatComposer({
  thread,
  canComment,
  readOnlyReason,
  isCoarsePointer,
  isNarrowViewport,
  isGeneratingDraft,
  draftError,
  blockedState,
  initialTextOverride,
  onSendReply,
  onRegenerateDraft,
  onClearBlocked,
}: ChatComposerProps) {
  const fallbackComposerId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quickReplyKeyHandlerRef = useRef<QuickReplyKeyHandler | null>(null);

  const [composerDomId, setComposerDomId] = useState<string | null>(null);
  const [initialBoot] = useState(() => {
    const storedDraft = loadThreadDraftFromStorage(thread.id);
    const storedBlockedDraft = loadBlockedDraftFromStorage(thread.id);
    const initialBlockedText = blockedState?.rejectedText ?? storedBlockedDraft;

    const initialText =
      initialTextOverride !== undefined
        ? initialTextOverride
        : resolveInitialComposerText({
            storedDraft,
            blockedRejectedText: initialBlockedText,
            aiDraft: thread.draft,
            hasUserTyped: false,
          }).text;

    const hasTyped =
      initialTextOverride !== undefined
        ? initialTextOverride.length > 0
        : (storedDraft !== null && storedDraft.length > 0) ||
          (initialBlockedText !== null && initialBlockedText.length > 0);

    const preservedBlocked =
      initialBlockedText !== null &&
      initialBlockedText.trim().length > 0 &&
      initialText.trim().length > 0 &&
      initialText.trim() !== initialBlockedText.trim()
        ? initialBlockedText
        : null;

    return { initialText, hasTyped, preservedBlocked };
  });

  const [hasUserTyped, setHasUserTyped] = useState(initialBoot.hasTyped);
  const [text, setText] = useState<string>(initialBoot.initialText);
  const [preservedBlockedText, setPreservedBlockedText] = useState<string | null>(
    initialBoot.preservedBlocked,
  );
  const [quickReplyDismissed, setQuickReplyDismissed] = useState(false);
  const [hintHidden, setHintHidden] = useState<boolean>(() => hasSeenEnterHint());
  const [pendingRegenerateFill, setPendingRegenerateFill] = useState(false);

  const draftUpdatedAt = thread.draft?.updatedAt ?? null;
  const draftText = thread.draft?.text ?? "";
  const draftStatus = thread.draft?.status ?? null;
  const draftSignature = `${draftUpdatedAt ?? ""}:${draftStatus ?? ""}:${draftText}`;
  const [syncedDraftSignature, setSyncedDraftSignature] = useState(draftSignature);
  const [syncedBlockedSeq, setSyncedBlockedSeq] = useState<number>(
    blockedState?.seq ?? 0,
  );

  // Reconcile newly arrived AI draft during render without cascading effects.
  if (draftSignature !== syncedDraftSignature) {
    setSyncedDraftSignature(draftSignature);
    if (pendingRegenerateFill && !isGeneratingDraft) {
      setPendingRegenerateFill(false);
      if (draftStatus !== "sent" && draftText.trim().length > 0) {
        setText(draftText);
        setHasUserTyped(false);
        setQuickReplyDismissed(false);
      }
    } else if (
      !hasUserTyped &&
      text.length === 0 &&
      draftStatus !== "sent" &&
      draftText.trim().length > 0
    ) {
      setText(draftText);
    }
  }

  // Restore 422 BLOCKED text synchronously when composer is empty, or hold it in
  // the recovery callout without overwriting text the operator already typed.
  if (blockedState && blockedState.seq !== syncedBlockedSeq) {
    setSyncedBlockedSeq(blockedState.seq);
    const outcome = resolveBlockedRestoration({
      currentText: text,
      rejectedText: blockedState.rejectedText,
    });
    if (outcome.preservedBlockedText === null) {
      setText(outcome.nextText);
      setHasUserTyped(true);
      setPreservedBlockedText(null);
    } else {
      setPreservedBlockedText(outcome.preservedBlockedText);
    }
  }

  // Side effect only: focus composer & persist restored/preserved text after 422 BLOCKED.
  useEffect(() => {
    if (preservedBlockedText !== null) {
      saveBlockedDraftToStorage(thread.id, preservedBlockedText);
      return;
    }
    if (!blockedState) return;
    if (text === blockedState.rejectedText && text.length > 0) {
      saveThreadDraftToStorage(thread.id, text);
      clearBlockedDraftFromStorage(thread.id);
    }
    textareaRef.current?.focus();
  }, [blockedState, preservedBlockedText, text, thread.id]);

  // Capture the real DOM id generated by Astryx TextArea via callback ref.
  const handleTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    const domId = node?.id ?? null;
    if (domId) {
      setComposerDomId((prev) => (prev === domId ? prev : domId));
    }
  }, []);

  const registerKeyHandler = useCallback((handler: QuickReplyKeyHandler | null) => {
    quickReplyKeyHandlerRef.current = handler;
  }, []);

  const composerId = composerDomId ?? fallbackComposerId;
  const trigger = extractQuickReplyTrigger(text, quickReplyDismissed);
  const blockedReasons = blockedState?.reasons ?? [];
  const warnings = filterReplyWarnings(thread.draft?.warnings ?? []);
  const gate = evaluateInboxComposerGate({
    text,
    canComment,
    readOnlyReason,
    isGeneratingDraft,
    menuOpen: trigger.open,
  });

  const rows = computeAutoGrowRows(text, 3, 6);
  const enterInsertsNewline = isCoarsePointer || isNarrowViewport;

  const textAreaStatus =
    blockedReasons.length > 0
      ? { type: "error" as const, message: `Nội dung bị chặn: ${blockedReasons.join(" · ")}` }
      : gate.isOverLimit
        ? {
            type: "error" as const,
            message: `Nội dung vượt quá ${COMMENT_REPLY_MAX_LENGTH.toLocaleString("vi-VN")} ký tự.`,
          }
        : undefined;

  function handleChange(nextValue: string) {
    setText(nextValue);
    setHasUserTyped(true);
    if (!nextValue.startsWith("/")) {
      setQuickReplyDismissed(false);
    }
    saveThreadDraftToStorage(thread.id, nextValue);
    if (blockedReasons.length > 0 && preservedBlockedText === null) {
      onClearBlocked();
    }
  }

  function handleRestorePreservedBlocked() {
    if (!preservedBlockedText) return;
    setText(preservedBlockedText);
    setHasUserTyped(true);
    setQuickReplyDismissed(false);
    setPreservedBlockedText(null);
    saveThreadDraftToStorage(thread.id, preservedBlockedText);
    clearBlockedDraftFromStorage(thread.id);
    textareaRef.current?.focus();
  }

  function handleDismissPreservedBlocked() {
    setPreservedBlockedText(null);
    clearBlockedDraftFromStorage(thread.id);
    if (blockedReasons.length > 0) {
      onClearBlocked();
    }
  }

  function submitCurrentText() {
    if (trigger.open || !gate.canSend) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    if (preservedBlockedText === null) {
      onClearBlocked();
      clearBlockedDraftFromStorage(thread.id);
    }
    setText("");
    setHasUserTyped(true);
    setQuickReplyDismissed(false);
    clearThreadDraftFromStorage(thread.id);
    if (!hintHidden) {
      markEnterHintSeen();
      setHintHidden(true);
    }
    onSendReply(trimmed);

    // Refocus immediately so operator can type follow-up replies without delay.
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const textareaEvent = event as unknown as KeyboardEvent<HTMLTextAreaElement>;
    // QuickReplyMenu contract: registerKeyHandler callback MUST run first.
    const menuConsumed = quickReplyKeyHandlerRef.current?.(textareaEvent) ?? false;

    const decision = decideComposerKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      isComposing: Boolean(event.nativeEvent?.isComposing),
      keyCode: event.nativeEvent?.keyCode,
      menuConsumed,
      menuOpen: trigger.open,
      isSlashCommandOnly: isSlashCommandOnly(text),
      isCoarsePointer: enterInsertsNewline,
      canSend: gate.canSend,
    });

    if (decision === "menu") return;
    if (decision === "send") {
      event.preventDefault();
      submitCurrentText();
      return;
    }
    if (decision === "ignore-enter") {
      event.preventDefault();
    }
  }

  function handlePickQuickReply(pickedText: string) {
    setText(pickedText);
    setHasUserTyped(true);
    setQuickReplyDismissed(true);
    saveThreadDraftToStorage(thread.id, pickedText);
    if (blockedReasons.length > 0 && preservedBlockedText === null) {
      onClearBlocked();
    }
    textareaRef.current?.focus();
  }

  function handleCloseQuickReply() {
    setQuickReplyDismissed(true);
    textareaRef.current?.focus();
  }

  function handleRegenerateClick() {
    if (!gate.canGenerateDraft) return;
    setPendingRegenerateFill(true);
    clearThreadDraftFromStorage(thread.id);
    onRegenerateDraft();
  }

  const remainingLabel =
    gate.remainingChars >= 0
      ? `Còn ${gate.remainingChars.toLocaleString("vi-VN")} ký tự`
      : `Vượt ${Math.abs(gate.remainingChars).toLocaleString("vi-VN")} ký tự`;

  return (
    <LayoutFooter hasDivider padding={0} className="inbox-composer-footer">
      <Stack direction="vertical" gap={3} className="relative" data-inbox="composer">
        {/* Flagged AI draft callout above composer (polite status, never alert) */}
        {thread.draft?.status === "flagged" && thread.draft.reasons.length > 0 ? (
          <Banner
            role="status"
            aria-live="polite"
            status="warning"
            title="AI đánh dấu cần nhân viên kiểm tra"
            description="Xem lý do bên dưới rồi chỉnh sửa hoặc tự soạn câu trả lời phù hợp."
            defaultIsExpanded
          >
            <Stack as="ul" role="list" direction="vertical" gap={0.5}>
              {thread.draft.reasons.map((reason, idx) => (
                <Stack as="li" key={`${reason.field}-${idx}`} direction="vertical" gap={0}>
                  <Text type="supporting">
                    {reason.field}: {reason.issue}
                  </Text>
                </Stack>
              ))}
            </Stack>
          </Banner>
        ) : null}

        {/* Non-blocking warnings */}
        {warnings.length > 0 ? (
          <Banner
            role="status"
            aria-live="polite"
            status="info"
            title="Lưu ý thêm cho nháp AI"
            description={warnings.join(" · ")}
          />
        ) : null}

        {/* Draft generation API error */}
        {draftError ? (
          <CommentErrorNotice
            error={draftError}
            shouldFocus={false}
            onRetry={gate.canGenerateDraft ? handleRegenerateClick : undefined}
          />
        ) : null}

        {/* Cannot comment notice */}
        {!canComment ? (
          <Banner
            role="status"
            status="info"
            title="Facebook đã khoá trả lời trên bình luận này."
          />
        ) : null}

        <ReadOnlyNotice reason={readOnlyReason} />

        {/* Preserved 422 BLOCKED text when operator already typed newer text */}
        {preservedBlockedText !== null ? (
          <Banner
            role="status"
            aria-live="polite"
            status="warning"
            title="Tin nhắn bị chặn trước đó đã được giữ lại"
            description="Nội dung bạn đang gõ vẫn được giữ nguyên."
            defaultIsExpanded
            data-inbox="blocked-recovery"
          >
            <Stack direction="vertical" gap={2}>
              <Text type="supporting" className="whitespace-pre-wrap break-words">
                {preservedBlockedText}
              </Text>
              <HStack gap={2} align="center" wrap="wrap">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  label="Khôi phục vào ô nhập"
                  isDisabled={!gate.canEdit}
                  tooltip={gate.editDisabledReason ?? undefined}
                  onClick={handleRestorePreservedBlocked}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  label="Bỏ qua"
                  onClick={handleDismissPreservedBlocked}
                />
              </HStack>
            </Stack>
          </Banner>
        ) : null}

        {/* Slash quick-reply menu (owned by quick-replies task; rendered here) */}
        <QuickReplyMenu
          open={trigger.open}
          query={trigger.query}
          customerName={thread.customer.name}
          composerId={composerId}
          onPick={handlePickQuickReply}
          onClose={handleCloseQuickReply}
          registerKeyHandler={registerKeyHandler}
        />

        {/* Auto-growing Astryx TextArea */}
        <TextArea
          ref={handleTextareaRef}
          label="Trả lời bình luận"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={rows}
          maxLength={gate.showRemainingCount ? COMMENT_REPLY_MAX_LENGTH : undefined}
          placeholder="Nhập trả lời cho khách (gõ / để mở mẫu trả lời nhanh)…"
          isDisabled={!gate.canEdit}
          disabledMessage={gate.editDisabledReason ?? undefined}
          status={textAreaStatus}
          statusVariant="detached"
          width="100%"
          size="md"
        />

        {/* Composer action bar */}
        <HStack gap={2} align="center" justify="between" wrap="wrap">
          <HStack gap={2} align="center" wrap="wrap">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="inbox-touch-target"
              icon={<Sparkles className="size-4" aria-hidden="true" />}
              label={isGeneratingDraft ? "Đang tạo nháp AI…" : "Tạo lại nháp AI"}
              isLoading={isGeneratingDraft}
              isDisabled={!gate.canGenerateDraft}
              tooltip={gate.generateDisabledReason ?? undefined}
              onClick={handleRegenerateClick}
            />

            {!enterInsertsNewline && !hintHidden ? (
              <Text
                type="supporting"
                size="xsm"
                color="inherit"
                className="inbox-meta-text"
                data-inbox="enter-hint"
              >
                Enter để gửi · Shift+Enter để xuống dòng
              </Text>
            ) : null}
          </HStack>

          <HStack gap={2} align="center">
            {gate.showRemainingCount ? (
              <Text
                type="supporting"
                size="xsm"
                color="inherit"
                className={cn(
                  gate.isOverLimit ? "text-destructive font-medium" : "inbox-meta-text",
                )}
                hasTabularNumbers
                data-inbox="remaining-count"
              >
                {remainingLabel}
              </Text>
            ) : null}

            <Button
              type="button"
              variant="primary"
              size="md"
              className="inbox-touch-target"
              icon={<Send className="size-4" aria-hidden="true" />}
              label="Gửi"
              isDisabled={!gate.canSend}
              tooltip={gate.sendDisabledReason ?? undefined}
              onClick={submitCurrentText}
            />
          </HStack>
        </HStack>
      </Stack>
    </LayoutFooter>
  );
}
