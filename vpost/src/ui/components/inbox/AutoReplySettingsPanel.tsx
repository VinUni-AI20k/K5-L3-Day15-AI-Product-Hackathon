"use client";

import {
  Badge,
  Banner,
  Button,
  Card,
  CheckboxList,
  CheckboxListItem,
  Divider,
  HStack,
  Heading,
  Link,
  NumberInput,
  Section,
  Skeleton,
  Stack,
  StackItem,
  StatusDot,
  Text,
} from "@astryxdesign/core";
import { Bot, History, RotateCcw, Save } from "lucide-react";
import { useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import {
  buildAutoReplyUpdatePayload,
  evaluateAutoReplySaveGate,
  isAutoReplyDraftDirty,
  sanitizeAutoReplyIntents,
  settingToAutoReplyDraft,
  validateAutoReplyDraft,
  type AutoReplySettingDraft,
} from "@/ui/components/inbox/auto-reply-state";
import { InboxEmptyState } from "@/ui/components/inbox/InboxEmptyState";
import "@/ui/components/inbox/inbox-surface.css";
import {
  useAutoReplySettings,
  useUpdateAutoReplySetting,
} from "@/ui/hooks/useAutoReply";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import {
  AUTO_REPLY_DAILY_CAP_DEFAULT,
  AUTO_REPLY_DAILY_CAP_MAX,
  AUTO_REPLY_DAILY_CAP_MIN,
  AUTO_REPLY_HOURLY_CAP_DEFAULT,
  AUTO_REPLY_HOURLY_CAP_MAX,
  AUTO_REPLY_HOURLY_CAP_MIN,
  AUTO_REPLY_INTENT_META,
  type AutoReplySetting,
  type AutoReplySettingUpdateInput,
} from "@/ui/schemas/auto-reply.schema";
import { formatCommentAbsoluteTime } from "@/ui/schemas/comment.schema";

export function AutoReplySettingsSkeleton() {
  return (
    <Stack direction="vertical" gap={4} aria-hidden="true">
      {[0, 1].map((idx) => (
        <Card key={idx} padding={5}>
          <Stack direction="vertical" gap={3}>
            <HStack gap={3} align="center" justify="between">
              <Skeleton width={200} height={22} index={idx} />
              <Skeleton width={96} height={22} index={idx} />
            </HStack>
            <Skeleton width="75%" height={18} index={idx} />
            <Skeleton width="100%" height={72} index={idx} />
            <Skeleton width="100%" height={96} index={idx} />
            <HStack gap={3}>
              <Skeleton width="50%" height={44} index={idx} />
              <Skeleton width="50%" height={44} index={idx} />
            </HStack>
            <HStack gap={2}>
              <Skeleton width={120} height={32} index={idx} />
              <Skeleton width={88} height={32} index={idx} />
            </HStack>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

interface PageAutoReplySettingCardProps {
  readonly setting: AutoReplySetting;
  readonly readOnlyReason: string | null;
  readonly isSaving: boolean;
  readonly saveError: unknown;
  readonly savedMessage: string | null;
  /** Optional initial draft override for deterministic render tests. */
  readonly initialDraftOverride?: Partial<AutoReplySettingDraft>;
  readonly onSave: (pageId: string, input: AutoReplySettingUpdateInput) => void;
  readonly onDismissSaved?: (pageId: string) => void;
  readonly onOpenLog?: () => void;
}

function PageAutoReplySettingCard({
  setting,
  readOnlyReason,
  isSaving,
  saveError,
  savedMessage,
  initialDraftOverride,
  onSave,
  onDismissSaved,
  onOpenLog,
}: PageAutoReplySettingCardProps) {
  const serverKey = `${setting.pageId}:${setting.intents.join(",")}:${setting.hourlyCap}:${setting.dailyCap}:${setting.updatedAt ?? ""}`;
  const [lastSyncedKey, setLastSyncedKey] = useState(serverKey);
  const [draft, setDraft] = useState<AutoReplySettingDraft>(() => ({
    ...settingToAutoReplyDraft(setting),
    ...initialDraftOverride,
  }));

  // Reconcile draft synchronously when server setting updates after save/refetch.
  if (lastSyncedKey !== serverKey) {
    setLastSyncedKey(serverKey);
    setDraft(settingToAutoReplyDraft(setting));
  }

  const isDirty = isAutoReplyDraftDirty(setting, draft);
  const validation = validateAutoReplyDraft(draft);
  const gate = evaluateAutoReplySaveGate({
    isDirty,
    isSaving,
    readOnlyReason,
    validation,
  });

  const pageLabel = setting.pageName.trim() || setting.pageId;

  function handleSaveClick() {
    if (!gate.canSave) return;
    onSave(setting.pageId, buildAutoReplyUpdatePayload(draft));
  }

  function handleReset() {
    if (!gate.canReset) return;
    setDraft(settingToAutoReplyDraft(setting));
  }

  return (
    <Card padding={5} data-auto-reply-page={setting.pageId}>
      <Stack direction="vertical" gap={4}>
        {/* Page heading & always-active live status */}
        <HStack gap={3} align="start" justify="between" wrap="wrap">
          <StackItem size="fill">
            <Stack direction="vertical" gap={0.5}>
              <HStack gap={2} align="center" wrap="wrap">
                <Heading level={3}>{pageLabel}</Heading>
                <Badge variant="success" label="Đang bật · chạy thật" />
              </HStack>
              <Text
                type="supporting"
                size="xsm"
                color="inherit"
                className="inbox-meta-text"
              >
                Page ID: {setting.pageId}
                {setting.updatedAt
                  ? ` · Cập nhật lúc ${formatCommentAbsoluteTime(setting.updatedAt)}`
                  : " · Đang dùng cấu hình mặc định"}
              </Text>
            </Stack>
          </StackItem>
        </HStack>

        <Divider />

        {/* Always-active live status explanation & log pointer */}
        <Section variant="muted" padding={3} data-auto-reply-status="active">
          <Stack direction="vertical" gap={1.5}>
            <HStack gap={2} align="center" justify="between" wrap="wrap">
              <HStack gap={2} align="center">
                <StatusDot
                  variant="success"
                  label="Đang bật · chạy thật"
                  aria-hidden="true"
                />
                <Text type="label">Đang bật · chạy thật</Text>
              </HStack>
              {onOpenLog ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="inbox-touch-target"
                  icon={<History className="size-4" aria-hidden="true" />}
                  label="Xem nhật ký tự trả lời"
                  onClick={onOpenLog}
                />
              ) : null}
            </HStack>
            <Text type="supporting" color="secondary">
              Hệ thống tự động trả lời công khai các bình luận khớp loại câu hỏi bên dưới
              trong giới hạn mỗi giờ và mỗi ngày (ghép trực tiếp từ dữ liệu sản phẩm; các câu
              hỏi khác luôn gắn “Cần bạn”). Xem lịch sử câu trả lời đã gửi hoặc bỏ qua ở tab
              “Nhật ký tự trả lời”.
            </Text>
          </Stack>
        </Section>

        {/* Intents checkboxes: Giá / Size / Màu / Tư vấn size */}
        <CheckboxList
          label="Loại câu hỏi cho phép tự trả lời"
          description="Chỉ các loại câu hỏi được chọn mới được tự động trả lời; câu hỏi kèm ship, đổi trả, khuyến mãi hoặc thiếu dữ liệu luôn gắn “Cần bạn”."
          value={[...draft.intents]}
          hasDividers
          isDisabled={!gate.canEdit}
          disabledMessage={gate.editDisabledReason ?? undefined}
          onChange={(values) =>
            setDraft((prev) => ({
              ...prev,
              intents: sanitizeAutoReplyIntents(values),
            }))
          }
        >
          {AUTO_REPLY_INTENT_META.map((item) => (
            <CheckboxListItem
              key={item.value}
              value={item.value}
              label={item.label}
              description={item.description}
            />
          ))}
        </CheckboxList>

        <Text type="supporting" size="xsm" color="secondary">
          Tính năng Tư vấn size sử dụng bảng cân nặng/chiều cao của shop —{" "}
          <Link href="/writing-style" hasUnderline>
            xem hoặc chỉnh Bảng size tại Phong cách viết
          </Link>
          .
        </Text>

        {validation.intentsError ? (
          <Banner
            role="alert"
            status="error"
            title="Chưa chọn loại câu hỏi tự trả lời"
            description={validation.intentsError}
            data-auto-reply-validation="intents"
          />
        ) : null}

        {/* Hourly and daily caps with validation */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberInput
            label="Giới hạn tối đa mỗi giờ"
            description={`Số nguyên từ ${AUTO_REPLY_HOURLY_CAP_MIN} đến ${AUTO_REPLY_HOURLY_CAP_MAX} (mặc định ${AUTO_REPLY_HOURLY_CAP_DEFAULT}).`}
            value={draft.hourlyCap}
            step={1}
            isIntegerOnly
            hasNumberSteppers
            hasClear
            units="tin/giờ"
            width="100%"
            isDisabled={!gate.canEdit}
            disabledMessage={gate.editDisabledReason ?? undefined}
            status={
              validation.hourlyCapError
                ? { type: "error", message: validation.hourlyCapError }
                : undefined
            }
            statusVariant="detached"
            onChange={(nextVal) =>
              setDraft((prev) => ({ ...prev, hourlyCap: nextVal }))
            }
          />

          <NumberInput
            label="Giới hạn tối đa mỗi ngày"
            description={`Số nguyên từ ${AUTO_REPLY_DAILY_CAP_MIN} đến ${AUTO_REPLY_DAILY_CAP_MAX.toLocaleString("vi-VN")} (mặc định ${AUTO_REPLY_DAILY_CAP_DEFAULT.toLocaleString("vi-VN")}).`}
            value={draft.dailyCap}
            step={1}
            isIntegerOnly
            hasNumberSteppers
            hasClear
            units="tin/ngày"
            width="100%"
            isDisabled={!gate.canEdit}
            disabledMessage={gate.editDisabledReason ?? undefined}
            status={
              validation.dailyCapError
                ? { type: "error", message: validation.dailyCapError }
                : undefined
            }
            statusVariant="detached"
            onChange={(nextVal) =>
              setDraft((prev) => ({ ...prev, dailyCap: nextVal }))
            }
          />
        </div>

        {validation.capMismatchWarning ? (
          <Banner status="warning" title={validation.capMismatchWarning} />
        ) : null}

        {/* Per-Page save error */}
        {saveError ? (
          <ApiErrorNotice
            error={saveError}
            shouldFocus={false}
            onRetry={gate.canSave ? handleSaveClick : undefined}
          />
        ) : null}

        {/* Polite live region for save confirmation */}
        <Stack role="status" aria-live="polite" direction="vertical" gap={1}>
          {savedMessage ? (
            <Banner
              status="success"
              title={savedMessage}
              isDismissable
              onDismiss={() => onDismissSaved?.(setting.pageId)}
            />
          ) : null}
        </Stack>

        {/* Actions */}
        <HStack gap={2} align="center" wrap="wrap">
          <Button
            type="button"
            variant="primary"
            size="md"
            className="inbox-touch-target"
            icon={<Save className="size-4" aria-hidden="true" />}
            label={isSaving ? "Đang lưu cài đặt…" : "Lưu cài đặt"}
            isLoading={isSaving}
            isDisabled={!gate.canSave}
            tooltip={gate.saveDisabledReason ?? undefined}
            onClick={handleSaveClick}
          />

          <Button
            type="button"
            variant="ghost"
            size="md"
            className="inbox-touch-target"
            icon={<RotateCcw className="size-4" aria-hidden="true" />}
            label="Đặt lại"
            isDisabled={!gate.canReset}
            tooltip={readOnlyReason ?? undefined}
            onClick={handleReset}
          />

          {!isDirty && !isSaving && readOnlyReason === null ? (
            <Text
              type="supporting"
              size="xsm"
              color="inherit"
              className="inbox-meta-text"
            >
              Chưa có thay đổi nào cần lưu.
            </Text>
          ) : null}
        </HStack>
      </Stack>
    </Card>
  );
}

export interface AutoReplySettingsViewProps {
  readonly isFirstLoad: boolean;
  readonly showSkeleton: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly items: readonly AutoReplySetting[];
  readonly readOnlyReason: string | null;
  readonly savingPageId: string | null;
  readonly saveErrorByPageId: Readonly<Record<string, unknown>>;
  readonly savedMessageByPageId: Readonly<Record<string, string | undefined>>;
  /** Optional test overrides keyed by pageId for deterministic SSR render tests. */
  readonly initialDraftOverrides?: Readonly<
    Record<string, Partial<AutoReplySettingDraft> | undefined>
  >;
  readonly onRetry: () => void;
  readonly onSave: (pageId: string, input: AutoReplySettingUpdateInput) => void;
  readonly onDismissSaved?: (pageId: string) => void;
  readonly onOpenLog?: () => void;
}

/**
 * Presentational view of per-Page auto-reply settings covering loading,
 * empty (no connected Pages), API error, read-only, and validation states.
 */
export function AutoReplySettingsView({
  isFirstLoad,
  showSkeleton,
  isError,
  error,
  items,
  readOnlyReason,
  savingPageId,
  saveErrorByPageId,
  savedMessageByPageId,
  initialDraftOverrides,
  onRetry,
  onSave,
  onDismissSaved,
  onOpenLog,
}: AutoReplySettingsViewProps) {
  return (
    <Stack direction="vertical" gap={5} data-auto-reply="settings-panel">
      <Stack direction="vertical" gap={1}>
        <HStack gap={2} align="center">
          <Bot
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Heading level={2}>Cài đặt tự động trả lời theo Fanpage</Heading>
        </HStack>
        <Text type="supporting" color="secondary">
          Tự động trả lời đang bật ở chế độ chạy thật cho mọi Fanpage đã kết nối. Câu trả lời
          được ghép trực tiếp từ dữ liệu sản phẩm (không dùng AI viết nội dung); mọi trường
          hợp không chắc chắn đều gắn “Cần bạn” chờ nhân viên xử lý.
        </Text>
      </Stack>

      <ReadOnlyNotice reason={readOnlyReason} />

      {isFirstLoad ? (
        showSkeleton ? (
          <AutoReplySettingsSkeleton />
        ) : null
      ) : isError && items.length === 0 ? (
        <ApiErrorNotice error={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <InboxEmptyState
          kind="first-run"
          title="Chưa có Fanpage Facebook nào được kết nối"
          description="Kết nối ít nhất một Fanpage Facebook ở mục Kênh để cấu hình tự động trả lời bình luận."
          action={
            <Link href="/channels" isStandalone>
              Đi tới mục Kênh
            </Link>
          }
        />
      ) : (
        <Stack direction="vertical" gap={4}>
          {isError ? (
            <ApiErrorNotice error={error} shouldFocus={false} onRetry={onRetry} />
          ) : null}

          {items.map((setting) => (
            <PageAutoReplySettingCard
              key={setting.pageId}
              setting={setting}
              readOnlyReason={readOnlyReason}
              isSaving={savingPageId === setting.pageId}
              saveError={saveErrorByPageId[setting.pageId] ?? null}
              savedMessage={savedMessageByPageId[setting.pageId] ?? null}
              initialDraftOverride={initialDraftOverrides?.[setting.pageId]}
              onSave={onSave}
              onDismissSaved={onDismissSaved}
              onOpenLog={onOpenLog}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export interface AutoReplySettingsPanelProps {
  /** Optional override for read-only reason (defaults to `useReadOnlyReason()`). */
  readonly readOnlyReason?: string | null;
  /** Optional callback to switch directly to the auto-reply log tab. */
  readonly onOpenLog?: () => void;
}

/**
 * Connected per-Page auto-reply settings panel mounted inside `InboxAutoReplyDialog`.
 */
export function AutoReplySettingsPanel({
  readOnlyReason: readOnlyReasonProp,
  onOpenLog,
}: AutoReplySettingsPanelProps = {}) {
  const hookReadOnlyReason = useReadOnlyReason();
  const readOnlyReason =
    readOnlyReasonProp !== undefined ? readOnlyReasonProp : hookReadOnlyReason;

  const settingsQuery = useAutoReplySettings();
  const updateMutation = useUpdateAutoReplySetting();

  const [saveErrorByPageId, setSaveErrorByPageId] = useState<Record<string, unknown>>(
    {},
  );
  const [savedMessageByPageId, setSavedMessageByPageId] = useState<
    Record<string, string | undefined>
  >({});

  const items = settingsQuery.data?.items ?? [];
  const isFirstLoad =
    settingsQuery.isPending && settingsQuery.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);

  function handleSave(pageId: string, input: AutoReplySettingUpdateInput) {
    if (readOnlyReason !== null) return;
    setSaveErrorByPageId((prev) => ({ ...prev, [pageId]: undefined }));
    setSavedMessageByPageId((prev) => ({ ...prev, [pageId]: undefined }));

    updateMutation.mutate(
      { pageId, input },
      {
        onSuccess: (res) => {
          const name = res.setting.pageName.trim() || res.setting.pageId;
          setSavedMessageByPageId((prev) => ({
            ...prev,
            [pageId]: `Đã lưu cài đặt tự động trả lời cho ${name}.`,
          }));
        },
        onError: (err) => {
          setSaveErrorByPageId((prev) => ({ ...prev, [pageId]: err }));
        },
      },
    );
  }

  return (
    <AutoReplySettingsView
      isFirstLoad={isFirstLoad}
      showSkeleton={showSkeleton}
      isError={settingsQuery.isError}
      error={settingsQuery.error}
      items={items}
      readOnlyReason={readOnlyReason}
      savingPageId={
        updateMutation.isPending ? (updateMutation.variables?.pageId ?? null) : null
      }
      saveErrorByPageId={saveErrorByPageId}
      savedMessageByPageId={savedMessageByPageId}
      onRetry={() => void settingsQuery.refetch()}
      onSave={handleSave}
      onDismissSaved={(pageId) =>
        setSavedMessageByPageId((prev) => ({ ...prev, [pageId]: undefined }))
      }
      onOpenLog={onOpenLog}
    />
  );
}
