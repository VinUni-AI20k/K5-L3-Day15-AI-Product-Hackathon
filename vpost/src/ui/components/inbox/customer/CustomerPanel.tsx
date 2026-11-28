"use client";

import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  Collapsible,
  CollapsibleGroup,
  Divider,
  DropdownMenu,
  Heading,
  HStack,
  IconButton,
  List,
  ListItem,
  Stack,
  StackItem,
  Text,
  TextArea,
  Token,
  type DropdownMenuOption,
} from "@astryxdesign/core";
import { Check, Copy, Mail, Phone, Plus, Save, Tag, Trash2, UserRound, UserX } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { EmptyState } from "@/ui/components/feedback/EmptyState";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { InboxCustomerAvatar } from "@/ui/components/inbox/InboxCustomerAvatar";
import {
  useCreateCustomerTag,
  useCustomer,
  useCustomerTags,
  useDeleteCustomerTag,
  useSaveCustomerNote,
  useSetCustomerTags,
} from "@/ui/hooks/useCustomer";
import { useNowMs } from "@/ui/hooks/useNowMs";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import { formatCommentAbsoluteTime } from "@/ui/schemas/comment.schema";
import {
  buildInboxThreadHref,
  CUSTOMER_NOTE_MAX_LENGTH,
  CUSTOMER_TAG_COLOR_LABELS,
  CUSTOMER_TAG_TOKEN_COLORS,
  CUSTOMER_TAGS_MAX_PER_CUSTOMER,
  displayCustomerName,
  formatCustomerExcerpt,
  type CustomerDetail,
  type CustomerTag,
  type CustomerTagColor,
} from "@/ui/schemas/customer.schema";

import { CreateCustomerTagDialog } from "./CreateCustomerTagDialog";
import {
  appendCustomerTagId,
  applyNoteDraftEdit,
  copyContactValue,
  createNoteDraftBuffer,
  evaluateNoteSaveGate,
  formatRecentCommentTime,
  IDLE_COPY_FEEDBACK,
  isCustomerNotFoundError,
  removeCustomerTagId,
  syncNoteDraftBuffer,
  toggleCustomerTagId,
  type ContactCopyFeedback,
  type ContactCopyKind,
} from "./customer-panel-state";
import { CustomerPanelSkeleton } from "./CustomerPanelSkeleton";

import "./customer-panel.css";

export type CustomerPanelProps = {
  /** Graph `from.id` of the customer of the open thread. */
  fromId: string;
  /** Display name from the thread, used until the profile loads. */
  fallbackName: string | null;
  /** Open thread id, to mark it in the customer's recent comments. */
  threadId: string;
};

const COPY_FEEDBACK_RESET_MS = 3_500;
const DEFAULT_OPEN_SECTIONS = ["contact", "tags", "note", "recent"];

export interface CustomerPanelViewProps {
  readonly fromId: string;
  readonly fallbackName: string | null;
  readonly threadId: string;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly customer: CustomerDetail | null;
  readonly tenantTags: readonly CustomerTag[];
  readonly nowMs: number;
  readonly readOnlyReason: string | null;
  readonly copyFeedback: ContactCopyFeedback;
  readonly isUpdatingTags: boolean;
  readonly tagError: unknown;
  readonly tagLimitError: string | null;
  readonly isCreateTagOpen: boolean;
  readonly isCreatingTag: boolean;
  readonly createTagError: unknown;
  readonly deletingTag: CustomerTag | null;
  readonly isDeletingTag: boolean;
  readonly deleteTagError: unknown;
  readonly tagStatusMessage: string | null;
  readonly isSavingNote: boolean;
  readonly noteError: unknown;
  readonly noteSavedMessage: string | null;
  readonly onRetry: () => void;
  readonly onCopyContact: (value: string, kind: ContactCopyKind) => void;
  readonly onToggleTag: (tagId: string) => void;
  readonly onRemoveTag: (tagId: string) => void;
  readonly onOpenCreateTag: () => void;
  readonly onCreateTagOpenChange: (open: boolean) => void;
  readonly onCreateTagSubmit: (input: { name: string; color: CustomerTagColor }) => void;
  readonly onResetCreateTagError?: () => void;
  readonly onRequestDeleteTag: (tag: CustomerTag) => void;
  readonly onCancelDeleteTag: () => void;
  readonly onConfirmDeleteTag: () => void;
  readonly onSaveNote: (text: string) => void;
  readonly onNoteEdited?: () => void;
}

/**
 * Presentational customer sidebar panel. Separated from TanStack Query hooks
 * so loading, 404, error, read-only, tag, note, and copy states can be
 * rendered and verified deterministically.
 */
export function CustomerPanelView({
  fromId,
  fallbackName,
  threadId,
  isLoading,
  error,
  customer,
  tenantTags,
  nowMs,
  readOnlyReason,
  copyFeedback,
  isUpdatingTags,
  tagError,
  tagLimitError,
  isCreateTagOpen,
  isCreatingTag,
  createTagError,
  deletingTag,
  isDeletingTag,
  deleteTagError,
  tagStatusMessage,
  isSavingNote,
  noteError,
  noteSavedMessage,
  onRetry,
  onCopyContact,
  onToggleTag,
  onRemoveTag,
  onOpenCreateTag,
  onCreateTagOpenChange,
  onCreateTagSubmit,
  onResetCreateTagError,
  onRequestDeleteTag,
  onCancelDeleteTag,
  onConfirmDeleteTag,
  onSaveNote,
  onNoteEdited,
}: CustomerPanelViewProps) {
  const isMissingCustomerId = fromId.trim().length === 0;
  const displayName = displayCustomerName(
    isMissingCustomerId ? null : customer?.name,
    fallbackName,
  );
  const serverNoteText = customer?.note?.text ?? "";
  const serverNoteKey = `${fromId}:${customer?.note?.updatedAt ?? "none"}:${serverNoteText}`;

  const [noteBuffer, setNoteBuffer] = useState(() =>
    createNoteDraftBuffer(fromId, serverNoteKey, serverNoteText),
  );

  const syncedNoteBuffer = syncNoteDraftBuffer(
    noteBuffer,
    fromId,
    serverNoteKey,
    serverNoteText,
  );
  if (syncedNoteBuffer !== noteBuffer) {
    setNoteBuffer(syncedNoteBuffer);
  }

  const noteGate = evaluateNoteSaveGate({
    text: syncedNoteBuffer.text,
    serverText: serverNoteText,
    isSaving: isSavingNote,
    readOnlyReason,
  });

  const isNotFound = !isMissingCustomerId && !customer && isCustomerNotFoundError(error);
  const hasLoadError = !isMissingCustomerId && !customer && Boolean(error) && !isNotFound;

  const assignedTagIds = new Set((customer?.tags ?? []).map((tag) => tag.id));
  const atTagLimit = assignedTagIds.size >= CUSTOMER_TAGS_MAX_PER_CUSTOMER;

  const tagMenuItems: DropdownMenuOption[] = [
    {
      type: "section",
      title: "Nhãn hiện có",
      items:
        tenantTags.length > 0
          ? tenantTags.map((tag) => {
              const isAssigned = assignedTagIds.has(tag.id);
              return {
                id: tag.id,
                label: tag.name,
                icon: isAssigned ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Tag className="size-4" aria-hidden="true" />
                ),
                endContent: (
                  <Token
                    size="sm"
                    color={CUSTOMER_TAG_TOKEN_COLORS[tag.color]}
                    label={CUSTOMER_TAG_COLOR_LABELS[tag.color]}
                  />
                ),
                hasCloseOnSelect: false,
                isDisabled:
                  readOnlyReason !== null ||
                  isUpdatingTags ||
                  isDeletingTag ||
                  (!isAssigned && atTagLimit),
                onClick: () => onToggleTag(tag.id),
              };
            })
          : [
              {
                id: "no-tenant-tags",
                label: "Chưa có nhãn nào",
                isDisabled: true,
              },
            ],
    },
    { type: "divider" },
    {
      id: "create-customer-tag",
      label: "Tạo nhãn",
      icon: <Plus className="size-4" aria-hidden="true" />,
      isDisabled: readOnlyReason !== null || isCreatingTag || isDeletingTag,
      onClick: onOpenCreateTag,
    },
    ...(tenantTags.length > 0
      ? [
          {
            id: "delete-customer-tag",
            label: "Xoá nhãn",
            icon: <Trash2 className="size-4" aria-hidden="true" />,
            isDisabled: readOnlyReason !== null || isUpdatingTags || isDeletingTag,
            items: tenantTags.map((tag) => ({
              id: `delete-tag-${tag.id}`,
              label: tag.name,
              variant: "destructive" as const,
              icon: <Trash2 className="size-4" aria-hidden="true" />,
              endContent: (
                <Token
                  size="sm"
                  color={CUSTOMER_TAG_TOKEN_COLORS[tag.color]}
                  label={CUSTOMER_TAG_COLOR_LABELS[tag.color]}
                />
              ),
              isDisabled: readOnlyReason !== null || isDeletingTag,
              onClick: () => onRequestDeleteTag(tag),
            })),
          },
        ]
      : []),
  ];

  return (
    <aside
      aria-label="Thông tin khách hàng"
      data-customer-panel={fromId}
      className="customer-panel-surface relative flex h-full flex-col overflow-y-auto"
    >
      {/* Customer header: deterministic accent initials avatar + prominent name */}
      <Stack direction="vertical" gap={3} padding={4}>
        <HStack gap={3} align="center">
          <InboxCustomerAvatar
            customerId={isMissingCustomerId ? null : fromId}
            name={displayName}
            size="md"
          />
          <StackItem size="fill">
            <Stack direction="vertical" gap={0.5}>
              <Heading level={3}>{displayName}</Heading>
              {!isMissingCustomerId && customer ? (
                <Text
                  type="supporting"
                  size="xsm"
                  color="inherit"
                  className="customer-meta-text"
                  hasTabularNumbers
                >
                  {customer.commentCount} bình luận · Lần đầu{" "}
                  {formatRecentCommentTime(customer.firstSeenAt, nowMs).label}
                </Text>
              ) : !isMissingCustomerId && isLoading ? (
                <Text type="supporting" size="xsm" color="inherit" className="customer-meta-text">
                  Đang tải hồ sơ khách hàng…
                </Text>
              ) : null}
            </Stack>
          </StackItem>
        </HStack>

        <ReadOnlyNotice reason={readOnlyReason} />
      </Stack>

      <Divider />

      {/* Polite live region for clipboard copy announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {copyFeedback.announcement}
      </div>

      {/* Body states: missing id | loading skeleton | 404 | error with retry | loaded profile */}
      {isMissingCustomerId ? (
        <Stack direction="vertical" gap={3} padding={4}>
          <EmptyState
            kind="no-result"
            icon={<UserX className="size-5" aria-hidden="true" />}
            title="Không có thông tin khách"
            description="Facebook không cung cấp mã định danh cho tài khoản này do cài đặt quyền riêng tư, nên chưa thể xem hồ sơ, gắn nhãn hay lưu ghi chú."
          />
        </Stack>
      ) : isLoading && !customer ? (
        <CustomerPanelSkeleton />
      ) : isNotFound ? (
        <Stack direction="vertical" gap={3} padding={4}>
          <EmptyState
            kind="no-result"
            icon={<UserRound className="size-5" aria-hidden="true" />}
            title="Chưa có thông tin khách"
            description="Hệ thống chưa ghi nhận bình luận nào từ khách hàng này trong công ty hiện tại."
          />
        </Stack>
      ) : hasLoadError ? (
        <Stack direction="vertical" gap={3} padding={4}>
          <ApiErrorNotice
            error={error}
            onRetry={onRetry}
            shouldFocus={false}
            source="Hồ sơ khách hàng"
          />
        </Stack>
      ) : customer ? (
        <Stack
          direction="vertical"
          gap={0}
          paddingInline={4}
          paddingBlock={0}
          className="customer-collapsible-group"
        >
          <CollapsibleGroup
            type="multiple"
            hasDividers
            density="compact"
            defaultValue={DEFAULT_OPEN_SECTIONS}
          >
            {/* 1. Contact info (detected phones & emails with copy buttons) */}
            <Collapsible
              value="contact"
              trigger={<span className="customer-section-title">Thông tin liên hệ</span>}
            >
              <Stack direction="vertical" gap={2}>
                {customer.phones.length === 0 && customer.emails.length === 0 ? (
                  <Text type="supporting" color="secondary">
                    Chưa phát hiện số điện thoại hoặc email trong bình luận.
                  </Text>
                ) : (
                  <Stack direction="vertical" gap={1}>
                    {customer.phones.map((phone) => {
                      const isCopied =
                        copyFeedback.status === "copied" && copyFeedback.value === phone;
                      return (
                        <HStack
                          key={`phone:${phone}`}
                          gap={2}
                          align="center"
                          justify="between"
                          data-contact-phone={phone}
                          className="customer-contact-row"
                        >
                          <HStack gap={2} align="center">
                            <Phone
                              aria-hidden="true"
                              className="size-4 shrink-0 text-muted-foreground"
                            />
                            <Text type="code" hasTabularNumbers>
                              {phone}
                            </Text>
                          </HStack>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            className="customer-touch-target"
                            icon={
                              isCopied ? (
                                <Check className="size-4" aria-hidden="true" />
                              ) : (
                                <Copy className="size-4" aria-hidden="true" />
                              )
                            }
                            label={
                              isCopied
                                ? `Đã sao chép số điện thoại ${phone}`
                                : `Sao chép số điện thoại ${phone}`
                            }
                            tooltip={isCopied ? "Đã sao chép" : "Sao chép số điện thoại"}
                            onClick={() => onCopyContact(phone, "phone")}
                          />
                        </HStack>
                      );
                    })}

                    {customer.emails.map((email) => {
                      const isCopied =
                        copyFeedback.status === "copied" && copyFeedback.value === email;
                      return (
                        <HStack
                          key={`email:${email}`}
                          gap={2}
                          align="center"
                          justify="between"
                          data-contact-email={email}
                          className="customer-contact-row"
                        >
                          <HStack gap={2} align="center">
                            <Mail
                              aria-hidden="true"
                              className="size-4 shrink-0 text-muted-foreground"
                            />
                            <Text type="code" wordBreak="break-all">
                              {email}
                            </Text>
                          </HStack>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            className="customer-touch-target"
                            icon={
                              isCopied ? (
                                <Check className="size-4" aria-hidden="true" />
                              ) : (
                                <Copy className="size-4" aria-hidden="true" />
                              )
                            }
                            label={
                              isCopied
                                ? `Đã sao chép email ${email}`
                                : `Sao chép email ${email}`
                            }
                            tooltip={isCopied ? "Đã sao chép" : "Sao chép email"}
                            onClick={() => onCopyContact(email, "email")}
                          />
                        </HStack>
                      );
                    })}
                  </Stack>
                )}

                {copyFeedback.status === "copied" ? (
                  <Text type="supporting" size="xsm" color="accent">
                    Đã sao chép
                  </Text>
                ) : copyFeedback.status === "failed" ? (
                  <Banner
                    role="status"
                    status="warning"
                    title="Không thể sao chép tự động"
                    description={copyFeedback.announcement}
                  />
                ) : null}
              </Stack>
            </Collapsible>

            {/* 2. Tags (colored pills + menu listing tenant tags + "Tạo nhãn" + "Xoá nhãn") */}
            <Collapsible
              value="tags"
              trigger={<span className="customer-section-title">Nhãn khách hàng</span>}
            >
              <Stack direction="vertical" gap={3}>
                {customer.tags.length > 0 ? (
                  <HStack gap={2} wrap="wrap" data-customer-tags="list">
                    {customer.tags.map((tag) => (
                      <Token
                        key={tag.id}
                        size="sm"
                        label={tag.name}
                        color={CUSTOMER_TAG_TOKEN_COLORS[tag.color]}
                        isDisabled={isUpdatingTags || isDeletingTag}
                        onRemove={
                          readOnlyReason === null && !isUpdatingTags && !isDeletingTag
                            ? () => onRemoveTag(tag.id)
                            : undefined
                        }
                      />
                    ))}
                  </HStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    Chưa gắn nhãn cho khách hàng này.
                  </Text>
                )}

                {tagLimitError ? (
                  <Banner
                    role="status"
                    status="warning"
                    title="Đã đạt giới hạn nhãn"
                    description={tagLimitError}
                  />
                ) : null}

                {tagError ? (
                  <ApiErrorNotice error={tagError} shouldFocus={false} />
                ) : null}

                {deleteTagError ? (
                  <ApiErrorNotice error={deleteTagError} shouldFocus={false} />
                ) : null}

                {tagStatusMessage ? (
                  <Text
                    type="supporting"
                    size="xsm"
                    color="accent"
                    role="status"
                    aria-live="polite"
                  >
                    {tagStatusMessage}
                  </Text>
                ) : null}

                <HStack gap={2} align="center" wrap="wrap">
                  <DropdownMenu
                    items={tagMenuItems}
                    alignment="start"
                    menuWidth={260}
                    button={{
                      label: isDeletingTag
                        ? "Đang xoá nhãn…"
                        : isUpdatingTags
                          ? "Đang cập nhật nhãn…"
                          : "Gắn nhãn",
                      variant: "secondary",
                      size: "sm",
                      className: "customer-touch-target",
                      icon: <Plus className="size-4" aria-hidden="true" />,
                      isLoading: isUpdatingTags || isDeletingTag,
                      isDisabled: readOnlyReason !== null || isUpdatingTags || isDeletingTag,
                      tooltip: readOnlyReason ?? undefined,
                    }}
                  />
                </HStack>
              </Stack>
            </Collapsible>

            {/* 3. Internal note (accessible label, explicit high-contrast save, 2000 max) */}
            <Collapsible
              value="note"
              trigger={<span className="customer-section-title">Ghi chú nội bộ</span>}
            >
              <Stack direction="vertical" gap={3}>
                {noteError ? (
                  <ApiErrorNotice error={noteError} shouldFocus={false} />
                ) : null}

                <TextArea
                  label="Ghi chú nội bộ"
                  isLabelHidden
                  value={syncedNoteBuffer.text}
                  onChange={(nextValue) => {
                    setNoteBuffer((prev) => applyNoteDraftEdit(prev, nextValue));
                    onNoteEdited?.();
                  }}
                  rows={4}
                  maxLength={CUSTOMER_NOTE_MAX_LENGTH}
                  placeholder="Lưu ý địa chỉ, sở thích, lịch sử chốt đơn…"
                  isDisabled={!noteGate.canEdit}
                  disabledMessage={readOnlyReason ?? undefined}
                  isLoading={isSavingNote}
                  status={
                    noteGate.validationError
                      ? { type: "error", message: noteGate.validationError }
                      : undefined
                  }
                  statusVariant="detached"
                  width="100%"
                />

                <Stack direction="vertical" gap={1.5}>
                  <HStack gap={2} align="center" justify="between" wrap="wrap">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="customer-touch-target"
                      icon={<Save className="size-4" aria-hidden="true" />}
                      label={isSavingNote ? "Đang lưu ghi chú…" : "Lưu ghi chú"}
                      isLoading={isSavingNote}
                      isDisabled={!noteGate.canSave}
                      tooltip={noteGate.saveDisabledReason ?? undefined}
                      onClick={() => onSaveNote(syncedNoteBuffer.text)}
                    />

                    {!noteGate.canSave &&
                    !isSavingNote &&
                    !noteGate.validationError &&
                    readOnlyReason === null &&
                    noteGate.saveDisabledReason ? (
                      <Text
                        type="supporting"
                        size="xsm"
                        color="inherit"
                        className="customer-meta-text"
                      >
                        {noteGate.saveDisabledReason}
                      </Text>
                    ) : null}
                  </HStack>

                  {customer.note?.updatedAt ? (
                    <Text
                      type="supporting"
                      size="xsm"
                      color="inherit"
                      className="customer-meta-text"
                      hasTabularNumbers
                    >
                      Cập nhật {formatCommentAbsoluteTime(customer.note.updatedAt)}
                    </Text>
                  ) : null}
                </Stack>

                {noteSavedMessage ? (
                  <Text
                    type="supporting"
                    size="xsm"
                    color="accent"
                    role="status"
                    aria-live="polite"
                  >
                    {noteSavedMessage}
                  </Text>
                ) : null}
              </Stack>
            </Collapsible>

            {/* 4. Recent comments (open threadId marked current; others link to /comments?thread=<id>) */}
            <Collapsible
              value="recent"
              trigger={
                <span className="customer-section-title">
                  {`Bình luận gần đây (${customer.recentComments.length})`}
                </span>
              }
            >
              {customer.recentComments.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Chưa có bình luận nào khác từ khách hàng này.
                </Text>
              ) : (
                <div className="customer-recent-list">
                  <List density="compact" hasDividers>
                    {customer.recentComments.map((item) => {
                      const isCurrent = item.threadId === threadId;
                      const timeInfo = formatRecentCommentTime(item.createdAt, nowMs);
                      const excerpt = formatCustomerExcerpt(item.text, 120);
                      const postExcerpt = formatCustomerExcerpt(item.postCaption, 72);
                      const channelLabel = item.channelName.trim();

                      return (
                        <ListItem
                          key={item.id}
                          href={isCurrent ? undefined : buildInboxThreadHref(item.threadId)}
                          isSelected={isCurrent}
                          aria-current={isCurrent ? "true" : undefined}
                          data-recent-thread={item.threadId}
                          data-current-thread={isCurrent ? "true" : undefined}
                          label={
                            <Text type="supporting" maxLines={2}>
                              {excerpt || "(Bình luận không có nội dung văn bản)"}
                            </Text>
                          }
                          description={
                            <Stack direction="vertical" gap={0.5}>
                              {postExcerpt ? (
                                <Text
                                  type="supporting"
                                  size="xsm"
                                  color="inherit"
                                  className="customer-meta-text"
                                  maxLines={1}
                                >
                                  Bài viết: {postExcerpt}
                                </Text>
                              ) : null}
                              <Text
                                type="supporting"
                                size="xsm"
                                color="inherit"
                                className="customer-meta-text"
                                hasTabularNumbers
                              >
                                {channelLabel ? `${channelLabel} · ` : null}
                                <time dateTime={item.createdAt} title={timeInfo.absolute}>
                                  {timeInfo.label}
                                </time>
                              </Text>
                            </Stack>
                          }
                          endContent={
                            isCurrent ? <Badge variant="purple" label="Đang xem" /> : undefined
                          }
                        />
                      );
                    })}
                  </List>
                </div>
              )}
            </Collapsible>
          </CollapsibleGroup>
        </Stack>
      ) : null}

      {isCreateTagOpen ? (
        <CreateCustomerTagDialog
          isOpen={isCreateTagOpen}
          isSubmitting={isCreatingTag}
          error={createTagError}
          readOnlyReason={readOnlyReason}
          onOpenChange={onCreateTagOpenChange}
          onSubmit={onCreateTagSubmit}
          onResetError={onResetCreateTagError}
        />
      ) : null}

      {/* Destructive delete confirmation for a tenant tag (never opens in read-only mode) */}
      {readOnlyReason === null && deletingTag ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !isDeletingTag) onCancelDeleteTag();
          }}
          title={`Xoá nhãn “${deletingTag.name}”?`}
          description={`Nhãn “${deletingTag.name}” sẽ bị xoá vĩnh viễn khỏi công ty và gỡ khỏi toàn bộ khách hàng đang gắn nhãn này. Hành động này không thể hoàn tác.`}
          cancelLabel="Huỷ"
          actionLabel={isDeletingTag ? "Đang xoá…" : "Xoá nhãn"}
          actionVariant="destructive"
          isActionLoading={isDeletingTag}
          onAction={onConfirmDeleteTag}
        />
      ) : null}
    </aside>
  );
}

/**
 * Right-hand customer sidebar for the comment inbox: profile header, detected
 * phones/emails with copy buttons, customer tags + creation/deletion dialogs,
 * internal note with explicit save, and recent comments linked to other threads.
 */
export function CustomerPanel({ fromId, fallbackName, threadId }: CustomerPanelProps) {
  const readOnlyReason = useReadOnlyReason();
  const nowMs = useNowMs(30_000);
  const hasCustomerId = fromId.trim().length > 0;

  const customerQuery = useCustomer(fromId);
  const tagsQuery = useCustomerTags({ enabled: hasCustomerId });
  const saveNoteMutation = useSaveCustomerNote();
  const setTagsMutation = useSetCustomerTags();
  const createTagMutation = useCreateCustomerTag();
  const deleteTagMutation = useDeleteCustomerTag();

  const [copyFeedback, setCopyFeedback] = useState<ContactCopyFeedback>(IDLE_COPY_FEEDBACK);
  const [tagLimitError, setTagLimitError] = useState<string | null>(null);
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [deletingTag, setDeletingTag] = useState<CustomerTag | null>(null);
  const [tagStatusMessage, setTagStatusMessage] = useState<string | null>(null);
  const [noteSavedMessage, setNoteSavedMessage] = useState<string | null>(null);
  const [lastFromId, setLastFromId] = useState(fromId);

  if (lastFromId !== fromId) {
    setLastFromId(fromId);
    setCopyFeedback(IDLE_COPY_FEEDBACK);
    setTagLimitError(null);
    setDeletingTag(null);
    setTagStatusMessage(null);
    setNoteSavedMessage(null);
  }

  useEffect(() => {
    if (copyFeedback.status === "idle") return;
    const timer = setTimeout(() => setCopyFeedback(IDLE_COPY_FEEDBACK), COPY_FEEDBACK_RESET_MS);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  const customer = hasCustomerId ? (customerQuery.data?.customer ?? null) : null;
  const tenantTags = tagsQuery.data?.items ?? [];

  async function handleCopyContact(value: string, kind: ContactCopyKind) {
    const feedback = await copyContactValue(value, kind);
    setCopyFeedback(feedback);
  }

  function handleToggleTag(tagId: string) {
    if (!hasCustomerId || !customer || readOnlyReason !== null || deleteTagMutation.isPending) {
      return;
    }
    setTagLimitError(null);
    setTagStatusMessage(null);
    setTagsMutation.reset();
    deleteTagMutation.reset();

    const currentIds = customer.tags.map((tag) => tag.id);
    const result = toggleCustomerTagId(currentIds, tagId);
    if (!result.ok) {
      setTagLimitError(result.error);
      return;
    }

    setTagsMutation.mutate({ fromId, tagIds: result.nextTagIds });
  }

  function handleRemoveTag(tagId: string) {
    if (!hasCustomerId || !customer || readOnlyReason !== null || deleteTagMutation.isPending) {
      return;
    }
    setTagLimitError(null);
    setTagStatusMessage(null);
    setTagsMutation.reset();
    deleteTagMutation.reset();

    const nextTagIds = removeCustomerTagId(
      customer.tags.map((tag) => tag.id),
      tagId,
    );
    setTagsMutation.mutate({ fromId, tagIds: nextTagIds });
  }

  function handleCreateTagSubmit(input: { name: string; color: CustomerTagColor }) {
    if (!hasCustomerId || readOnlyReason !== null) return;
    setTagLimitError(null);
    setTagStatusMessage(null);
    deleteTagMutation.reset();

    createTagMutation.mutate(input, {
      onSuccess: (created) => {
        setIsCreateTagOpen(false);
        if (!customer) return;
        const appended = appendCustomerTagId(
          customer.tags.map((tag) => tag.id),
          created.item.id,
        );
        if (!appended.ok) {
          setTagLimitError(appended.error);
          return;
        }
        setTagsMutation.mutate({ fromId, tagIds: appended.nextTagIds });
      },
    });
  }

  function handleRequestDeleteTag(tag: CustomerTag) {
    if (!hasCustomerId || readOnlyReason !== null || deleteTagMutation.isPending) return;
    setTagLimitError(null);
    setTagStatusMessage(null);
    setTagsMutation.reset();
    deleteTagMutation.reset();
    setDeletingTag(tag);
  }

  function handleCancelDeleteTag() {
    if (deleteTagMutation.isPending) return;
    setDeletingTag(null);
  }

  function handleConfirmDeleteTag() {
    if (!hasCustomerId || readOnlyReason !== null || !deletingTag || deleteTagMutation.isPending) {
      return;
    }
    const target = deletingTag;
    deleteTagMutation.mutate(
      { tagId: target.id, fromId },
      {
        onSuccess: () => {
          setDeletingTag(null);
          setTagStatusMessage(`Đã xoá nhãn “${target.name}”.`);
        },
        onError: () => {
          setDeletingTag(null);
        },
      },
    );
  }

  function handleSaveNote(text: string) {
    if (!hasCustomerId || readOnlyReason !== null) return;
    setNoteSavedMessage(null);
    saveNoteMutation.reset();

    saveNoteMutation.mutate(
      { fromId, text },
      {
        onSuccess: (res) => {
          setNoteSavedMessage(res.note ? "Đã lưu ghi chú." : "Đã xoá ghi chú.");
        },
      },
    );
  }

  return (
    <CustomerPanelView
      fromId={fromId}
      fallbackName={fallbackName}
      threadId={threadId}
      isLoading={hasCustomerId && customerQuery.isLoading}
      error={hasCustomerId && customerQuery.isError ? customerQuery.error : null}
      customer={customer}
      tenantTags={tenantTags}
      nowMs={nowMs}
      readOnlyReason={readOnlyReason}
      copyFeedback={copyFeedback}
      isUpdatingTags={setTagsMutation.isPending}
      tagError={setTagsMutation.isError ? setTagsMutation.error : null}
      tagLimitError={tagLimitError}
      isCreateTagOpen={isCreateTagOpen}
      isCreatingTag={createTagMutation.isPending}
      createTagError={createTagMutation.isError ? createTagMutation.error : null}
      deletingTag={deletingTag}
      isDeletingTag={deleteTagMutation.isPending}
      deleteTagError={deleteTagMutation.isError ? deleteTagMutation.error : null}
      tagStatusMessage={tagStatusMessage}
      isSavingNote={saveNoteMutation.isPending}
      noteError={saveNoteMutation.isError ? saveNoteMutation.error : null}
      noteSavedMessage={noteSavedMessage}
      onRetry={() => {
        if (!hasCustomerId) return;
        void customerQuery.refetch();
      }}
      onCopyContact={(value, kind) => {
        void handleCopyContact(value, kind);
      }}
      onToggleTag={handleToggleTag}
      onRemoveTag={handleRemoveTag}
      onOpenCreateTag={() => {
        createTagMutation.reset();
        deleteTagMutation.reset();
        setTagStatusMessage(null);
        setIsCreateTagOpen(true);
      }}
      onCreateTagOpenChange={(open) => {
        if (!open) createTagMutation.reset();
        setIsCreateTagOpen(open);
      }}
      onCreateTagSubmit={handleCreateTagSubmit}
      onResetCreateTagError={() => createTagMutation.reset()}
      onRequestDeleteTag={handleRequestDeleteTag}
      onCancelDeleteTag={handleCancelDeleteTag}
      onConfirmDeleteTag={handleConfirmDeleteTag}
      onSaveNote={handleSaveNote}
      onNoteEdited={() => {
        if (noteSavedMessage) setNoteSavedMessage(null);
        if (saveNoteMutation.isError) saveNoteMutation.reset();
      }}
    />
  );
}
