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
  Section,
  Skeleton,
  Slider,
  Stack,
  StackItem,
  StatusDot,
  Text,
} from "@astryxdesign/core";
import { History, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { InboxEmptyState } from "@/ui/components/inbox/InboxEmptyState";
import "@/ui/components/inbox/inbox-surface.css";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import {
  useModerationSettings,
  useUpdateModerationSetting,
} from "@/ui/hooks/useModeration";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import { formatCommentAbsoluteTime } from "@/ui/schemas/comment.schema";
import {
  AUTO_HIDE_CATEGORY_META,
  COMPLAINT_POLICY_INFO,
  MODERATION_THRESHOLD_MAX,
  MODERATION_THRESHOLD_MIN,
  MODERATION_THRESHOLD_STEP,
  type ModerationSetting,
  type ModerationSettingUpdateInput,
} from "@/ui/schemas/moderation.schema";

import {
  buildSettingUpdatePayload,
  clampModerationThreshold,
  evaluateSettingSaveGate,
  formatModerationThreshold,
  isSettingDraftDirty,
  sanitizeAutoHideCategories,
  settingToDraft,
  type ModerationSettingDraft,
} from "./settings-state";

const THRESHOLD_MARKS = [
  { value: 0.5, label: "0.50" },
  { value: 0.85, label: "0.85 (mặc định)" },
  { value: 1.0, label: "1.00" },
];

export function ModerationSettingsSkeleton() {
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
            <Skeleton width="100%" height={44} index={idx} />
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

interface PageModerationSettingCardProps {
  readonly setting: ModerationSetting;
  readonly readOnlyReason: string | null;
  readonly isSaving: boolean;
  readonly saveError: unknown;
  readonly savedMessage: string | null;
  readonly onSave: (pageId: string, input: ModerationSettingUpdateInput) => void;
  readonly onDismissSaved?: (pageId: string) => void;
  readonly onOpenLog?: () => void;
}

function PageModerationSettingCard({
  setting,
  readOnlyReason,
  isSaving,
  saveError,
  savedMessage,
  onSave,
  onDismissSaved,
  onOpenLog,
}: PageModerationSettingCardProps) {
  const serverKey = `${setting.pageId}:${setting.categories.join(",")}:${setting.threshold}:${setting.updatedAt ?? ""}`;
  const [lastSyncedKey, setLastSyncedKey] = useState(serverKey);
  const [draft, setDraft] = useState<ModerationSettingDraft>(() =>
    settingToDraft(setting),
  );

  // Synchronously reconcile draft when server setting updates (e.g. after save/refetch).
  if (lastSyncedKey !== serverKey) {
    setLastSyncedKey(serverKey);
    setDraft(settingToDraft(setting));
  }

  const isDirty = isSettingDraftDirty(setting, draft);
  const gate = evaluateSettingSaveGate({
    isDirty,
    isSaving,
    readOnlyReason,
  });

  const pageLabel = setting.pageName.trim() || setting.pageId;

  function handleSave() {
    if (!gate.canSave) return;
    onSave(setting.pageId, buildSettingUpdatePayload(draft));
  }

  function handleReset() {
    if (!gate.canReset) return;
    setDraft(settingToDraft(setting));
  }

  return (
    <Card padding={5} data-moderation-page={setting.pageId}>
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
        <Section variant="muted" padding={3} data-moderation-status="active">
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
                  label="Xem nhật ký kiểm duyệt"
                  onClick={onOpenLog}
                />
              ) : null}
            </HStack>
            <Text type="supporting" color="secondary">
              Hệ thống tự động ẩn các bình luận vi phạm thuộc nhóm đã chọn khi đạt ngưỡng độ
              tin cậy (tối đa 20 bình luận/lần đồng bộ và 100 bình luận/ngày mỗi Fanpage; có
              thể Hiện lại bất kỳ lúc nào). Xem lịch sử và hoàn tác tại mục “Nhật ký kiểm
              duyệt” trên thanh công cụ hộp thư.
            </Text>
          </Stack>
        </Section>

        {/* Selectable auto-hide categories (spam, scam, abusive, pii) */}
        <CheckboxList
          label="Nhóm bình luận cho phép tự ẩn"
          description="Chỉ những nhóm được chọn mới bị tự ẩn khi độ tin cậy đạt ngưỡng. Bình luận thuộc nhóm chưa chọn vẫn được gắn nhãn “Cần xem”."
          value={[...draft.categories]}
          hasDividers
          isDisabled={!gate.canEdit}
          disabledMessage={gate.editDisabledReason ?? undefined}
          onChange={(values) =>
            setDraft((prev) => ({
              ...prev,
              categories: sanitizeAutoHideCategories(values),
            }))
          }
        >
          {AUTO_HIDE_CATEGORY_META.map((item) => (
            <CheckboxListItem
              key={item.value}
              value={item.value}
              label={item.label}
              description={item.description}
            />
          ))}
        </CheckboxList>

        {draft.categories.length === 0 ? (
          <Banner
            status="warning"
            title="Chưa chọn nhóm tự ẩn nào"
            description="Tự kiểm duyệt đang bật nhưng chưa chọn nhóm nào — bình luận vi phạm sẽ chỉ được gắn nhãn “Cần xem” thay vì tự ẩn."
          />
        ) : null}

        {/* PHASE2(complaint-autohide): DECIDED (v1) — `complaint` is never auto-hidden
            and backend rejects it with 400 COMPLAINT_AUTOHIDE_DISABLED. Show strictly as
            an informational row ("chỉ đánh dấu, không tự ẩn") with no checkbox/toggle. */}
        <Section
          variant="muted"
          padding={3}
          dividers={["start"]}
          data-moderation-policy="complaint-flag-only"
        >
          <Stack direction="vertical" gap={1}>
            <HStack gap={2} align="center" justify="between" wrap="wrap">
              <Text type="label">{COMPLAINT_POLICY_INFO.label}</Text>
              <Badge
                variant="warning"
                label={COMPLAINT_POLICY_INFO.badgeLabel}
              />
            </HStack>
            <Text type="supporting" color="secondary">
              {COMPLAINT_POLICY_INFO.description}
            </Text>
          </Stack>
        </Section>

        {/* Confidence threshold slider (0.5 - 1.0) */}
        <Slider
          label="Ngưỡng độ tin cậy tối thiểu"
          description="Bình luận khớp luật xác định luôn có độ tin cậy 1.00. Với phân loại AI, hệ thống chỉ tự ẩn khi độ tin cậy từ ngưỡng này trở lên."
          value={draft.threshold}
          min={MODERATION_THRESHOLD_MIN}
          max={MODERATION_THRESHOLD_MAX}
          step={MODERATION_THRESHOLD_STEP}
          valueDisplay="text"
          formatValue={formatModerationThreshold}
          marks={THRESHOLD_MARKS}
          isDisabled={!gate.canEdit}
          disabledMessage={gate.editDisabledReason ?? undefined}
          width="100%"
          onChange={(nextValue: number | [number, number]) => {
            if (typeof nextValue === "number") {
              setDraft((prev) => ({
                ...prev,
                threshold: clampModerationThreshold(nextValue),
              }));
            }
          }}
        />

        {/* Per-Page save error */}
        {saveError ? (
          <ApiErrorNotice
            error={saveError}
            shouldFocus={false}
            onRetry={gate.canSave ? handleSave : undefined}
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
            onClick={handleSave}
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

export interface ModerationSettingsViewProps {
  readonly isFirstLoad: boolean;
  readonly showSkeleton: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly items: readonly ModerationSetting[];
  readonly readOnlyReason: string | null;
  readonly savingPageId: string | null;
  readonly saveErrorByPageId: Readonly<Record<string, unknown>>;
  readonly savedMessageByPageId: Readonly<Record<string, string | undefined>>;
  readonly onRetry: () => void;
  readonly onSave: (pageId: string, input: ModerationSettingUpdateInput) => void;
  readonly onDismissSaved?: (pageId: string) => void;
  readonly onOpenLog?: () => void;
}

/**
 * Presentational view of per-Page auto-moderation settings covering loading,
 * empty (no connected Pages), API error, read-only, and per-Page edit states.
 */
export function ModerationSettingsView({
  isFirstLoad,
  showSkeleton,
  isError,
  error,
  items,
  readOnlyReason,
  savingPageId,
  saveErrorByPageId,
  savedMessageByPageId,
  onRetry,
  onSave,
  onDismissSaved,
  onOpenLog,
}: ModerationSettingsViewProps) {
  return (
    <Stack direction="vertical" gap={5} data-moderation="settings-panel">
      <Stack direction="vertical" gap={1}>
        <HStack gap={2} align="center">
          <ShieldCheck
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Heading level={2}>Cài đặt tự kiểm duyệt theo Fanpage</Heading>
        </HStack>
        <Text type="supporting" color="secondary">
          Tự kiểm duyệt đang bật ở chế độ chạy thật cho mọi Fanpage đã kết nối. Hệ thống chỉ
          tự động ẩn bình luận vi phạm (không tự xoá, không tự trả lời; có thể hiện lại bất
          kỳ lúc nào) và bỏ qua bình luận của chính Page hoặc đã có trả lời.
        </Text>
      </Stack>

      <ReadOnlyNotice reason={readOnlyReason} />

      {isFirstLoad ? (
        showSkeleton ? (
          <ModerationSettingsSkeleton />
        ) : null
      ) : isError && items.length === 0 ? (
        <ApiErrorNotice error={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <InboxEmptyState
          kind="first-run"
          title="Chưa có Fanpage Facebook nào được kết nối"
          description="Kết nối ít nhất một Fanpage Facebook ở mục Kênh để cấu hình quy tắc tự kiểm duyệt bình luận."
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
            <PageModerationSettingCard
              key={setting.pageId}
              setting={setting}
              readOnlyReason={readOnlyReason}
              isSaving={savingPageId === setting.pageId}
              saveError={saveErrorByPageId[setting.pageId] ?? null}
              savedMessage={savedMessageByPageId[setting.pageId] ?? null}
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

export interface ModerationSettingsPanelProps {
  /** Optional override for read-only reason (defaults to `useReadOnlyReason()`). */
  readonly readOnlyReason?: string | null;
  /** Optional callback to switch directly to the moderation log panel. */
  readonly onOpenLog?: () => void;
}

/**
 * Connected per-Page auto-moderation settings panel.
 * Mount directly inside a tab/drawer/section of the "Bình luận" screen.
 */
export function ModerationSettingsPanel({
  readOnlyReason: readOnlyReasonProp,
  onOpenLog,
}: ModerationSettingsPanelProps = {}) {
  const hookReadOnlyReason = useReadOnlyReason();
  const readOnlyReason =
    readOnlyReasonProp !== undefined ? readOnlyReasonProp : hookReadOnlyReason;

  const settingsQuery = useModerationSettings();
  const updateMutation = useUpdateModerationSetting();

  const [saveErrorByPageId, setSaveErrorByPageId] = useState<
    Record<string, unknown>
  >({});
  const [savedMessageByPageId, setSavedMessageByPageId] = useState<
    Record<string, string | undefined>
  >({});

  const items = settingsQuery.data?.items ?? [];
  const isFirstLoad =
    settingsQuery.isPending && settingsQuery.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);

  function handleSave(pageId: string, input: ModerationSettingUpdateInput) {
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
            [pageId]: `Đã lưu cài đặt kiểm duyệt cho ${name}.`,
          }));
        },
        onError: (err) => {
          setSaveErrorByPageId((prev) => ({ ...prev, [pageId]: err }));
        },
      },
    );
  }

  return (
    <ModerationSettingsView
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
