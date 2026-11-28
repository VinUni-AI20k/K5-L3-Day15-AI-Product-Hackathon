"use client";

import {
  AlertDialog,
  Button,
  Card,
  Dialog,
  DialogHeader,
  Divider,
  Heading,
  HStack,
  IconButton,
  Layout,
  LayoutContent,
  Section,
  Skeleton,
  Stack,
  StackItem,
  Text,
  TextArea,
  TextInput,
  Token,
} from "@astryxdesign/core";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { EmptyState } from "@/ui/components/feedback/EmptyState";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import {
  useCreateQuickReply,
  useDeleteQuickReply,
  useQuickReplies,
  useUpdateQuickReply,
} from "@/ui/hooks/useQuickReplies";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import { formatCommentAbsoluteTime } from "@/ui/schemas/comment.schema";
import {
  applyQuickReplyPlaceholders,
  QUICK_REPLY_CUSTOMER_PLACEHOLDER,
  QUICK_REPLY_SHORTCUT_MAX_LENGTH,
  QUICK_REPLY_TEXT_MAX_LENGTH,
  QUICK_REPLY_TITLE_MAX_LENGTH,
  validateQuickReplyForm,
  type QuickReply,
  type QuickReplyCreateInput,
  type QuickReplyFieldErrors,
  type QuickReplyUpdateInput,
} from "@/ui/schemas/quick-reply.schema";

import {
  buildQuickReplyPatch,
  getDuplicateShortcutMessage,
  hasQuickReplyPatchChanges,
  isQuickReplyDuplicateError,
} from "./quick-reply-menu-state";

import "./quick-reply.css";

export type QuickReplyFormMode =
  | { readonly type: "closed" }
  | { readonly type: "create" }
  | { readonly type: "edit"; readonly item: QuickReply };

export interface QuickReplyFormValues {
  readonly shortcut: string;
  readonly title: string;
  readonly text: string;
}

const EMPTY_FORM_VALUES: QuickReplyFormValues = {
  shortcut: "",
  title: "",
  text: "",
};

export interface QuickReplyManageDialogViewProps {
  readonly isOpen: boolean;
  readonly isLoading: boolean;
  readonly loadError: unknown;
  readonly items: readonly QuickReply[];
  readonly customerName: string | null;
  readonly readOnlyReason: string | null;
  readonly formMode: QuickReplyFormMode;
  readonly formValues: QuickReplyFormValues;
  readonly fieldErrors: QuickReplyFieldErrors;
  readonly isSaving: boolean;
  readonly saveError: unknown;
  readonly deletingItem: QuickReply | null;
  readonly isDeleting: boolean;
  readonly deleteError: unknown;
  readonly statusMessage: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRetryLoad: () => void;
  readonly onStartCreate: () => void;
  readonly onStartEdit: (item: QuickReply) => void;
  readonly onCancelForm: () => void;
  readonly onFormChange: (next: QuickReplyFormValues) => void;
  readonly onSubmitForm: () => void;
  readonly onRequestDelete: (item: QuickReply) => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
}

/**
 * Presentational quick-reply management dialog: lists tenant templates,
 * creates/edits templates with inline shortcut/length/409 validation, and
 * asks for explicit confirmation before deleting.
 */
export function QuickReplyManageDialogView({
  isOpen,
  isLoading,
  loadError,
  items,
  customerName,
  readOnlyReason,
  formMode,
  formValues,
  fieldErrors,
  isSaving,
  saveError,
  deletingItem,
  isDeleting,
  deleteError,
  statusMessage,
  onOpenChange,
  onRetryLoad,
  onStartCreate,
  onStartEdit,
  onCancelForm,
  onFormChange,
  onSubmitForm,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: QuickReplyManageDialogViewProps) {
  const isBusy = isSaving || isDeleting;
  const isReadOnly = readOnlyReason !== null;
  const isDuplicateShortcut = isQuickReplyDuplicateError(saveError);
  const shortcutErrorMessage =
    fieldErrors.shortcut ??
    (isDuplicateShortcut ? getDuplicateShortcutMessage(saveError) : undefined);

  const showPreview = formValues.text.includes(QUICK_REPLY_CUSTOMER_PLACEHOLDER);
  const previewText = showPreview
    ? applyQuickReplyPlaceholders(formValues.text, customerName)
    : "";

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitForm();
  }

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open && isBusy) return;
          onOpenChange(open);
        }}
        purpose="form"
        width={680}
        maxHeight="85vh"
      >
        <Layout
          height="fill"
          header={
            <DialogHeader
              title="Quản lý mẫu trả lời nhanh"
              subtitle={`Gõ / ở đầu ô nhập tin để chèn nhanh. Dùng ${QUICK_REPLY_CUSTOMER_PLACEHOLDER} để tự điền tên khách (mặc định “bạn”).`}
              onOpenChange={isBusy ? undefined : () => onOpenChange(false)}
            />
          }
          content={
            <LayoutContent padding={5} isScrollable>
              <Stack direction="vertical" gap={5}>
                <ReadOnlyNotice reason={readOnlyReason} />

                {/* Toolbar — demotes CTA when form or empty-state owns the single primary slot */}
                <HStack gap={2} align="center" justify="between" wrap="wrap">
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {items.length > 0
                      ? `${items.length} mẫu trả lời đang có`
                      : "Tạo mẫu cho câu hỏi về giá, phí ship, kích cỡ…"}
                  </Text>
                  <Button
                    type="button"
                    variant={formMode.type !== "closed" || items.length === 0 ? "secondary" : "primary"}
                    size="sm"
                    className="quick-reply-touch-target"
                    icon={<Plus className="size-4" aria-hidden="true" />}
                    label="Tạo mẫu mới"
                    isDisabled={isReadOnly || isBusy || formMode.type === "create"}
                    tooltip={
                      readOnlyReason ??
                      (formMode.type === "create"
                        ? "Biểu mẫu tạo mới đang mở bên dưới."
                        : undefined)
                    }
                    onClick={onStartCreate}
                  />
                </HStack>

                {/* Status announcement */}
                {statusMessage ? (
                  <Text
                    type="supporting"
                    size="xsm"
                    color="accent"
                    role="status"
                    aria-live="polite"
                  >
                    {statusMessage}
                  </Text>
                ) : null}

                {deleteError ? (
                  <ApiErrorNotice error={deleteError} shouldFocus={false} />
                ) : null}

                {/* Create / Edit form */}
                {formMode.type !== "closed" ? (
                  <Section variant="muted" padding={5} data-quick-reply-form={formMode.type}>
                    <form onSubmit={handleFormSubmit} noValidate>
                      <Stack direction="vertical" gap={4}>
                        <Heading level={3}>
                          {formMode.type === "create"
                            ? "Tạo mẫu trả lời mới"
                            : `Chỉnh sửa mẫu /${formMode.item.shortcut}`}
                        </Heading>

                        {saveError && !isDuplicateShortcut ? (
                          <ApiErrorNotice error={saveError} shouldFocus={false} />
                        ) : null}

                        <TextInput
                          label="Phím tắt"
                          description={`1–${QUICK_REPLY_SHORTCUT_MAX_LENGTH} ký tự: chữ thường không dấu (a–z), số (0–9), gạch ngang (-) hoặc gạch dưới (_).`}
                          placeholder="vd: bao_gia"
                          value={formValues.shortcut}
                          isRequired
                          hasAutoFocus
                          width="100%"
                          isDisabled={isReadOnly || isSaving}
                          disabledMessage={readOnlyReason ?? undefined}
                          status={
                            shortcutErrorMessage
                              ? { type: "error", message: shortcutErrorMessage }
                              : undefined
                          }
                          statusVariant="detached"
                          onChange={(value) =>
                            onFormChange({ ...formValues, shortcut: value })
                          }
                        />

                        <TextInput
                          label="Tiêu đề"
                          description={`Tối đa ${QUICK_REPLY_TITLE_MAX_LENGTH} ký tự.`}
                          placeholder="vd: Báo giá & phí vận chuyển"
                          value={formValues.title}
                          isRequired
                          width="100%"
                          isDisabled={isReadOnly || isSaving}
                          disabledMessage={readOnlyReason ?? undefined}
                          status={
                            fieldErrors.title
                              ? { type: "error", message: fieldErrors.title }
                              : undefined
                          }
                          statusVariant="detached"
                          onChange={(value) =>
                            onFormChange({ ...formValues, title: value })
                          }
                        />

                        <TextArea
                          label="Nội dung mẫu"
                          description={`Tối đa ${QUICK_REPLY_TEXT_MAX_LENGTH.toLocaleString("vi-VN")} ký tự. Dùng ${QUICK_REPLY_CUSTOMER_PLACEHOLDER} để chèn tên khách.`}
                          placeholder="vd: Chào {ten_khach}, phí ship toàn quốc 30.000đ ạ."
                          value={formValues.text}
                          rows={4}
                          maxLength={QUICK_REPLY_TEXT_MAX_LENGTH}
                          isRequired
                          width="100%"
                          isDisabled={isReadOnly || isSaving}
                          disabledMessage={readOnlyReason ?? undefined}
                          status={
                            fieldErrors.text
                              ? { type: "error", message: fieldErrors.text }
                              : undefined
                          }
                          statusVariant="detached"
                          onChange={(value) =>
                            onFormChange({ ...formValues, text: value })
                          }
                        />

                        {showPreview ? (
                          <div className="quick-reply-preview">
                            <Stack direction="vertical" gap={1}>
                              <Text
                                type="supporting"
                                size="xsm"
                                color="inherit"
                                className="quick-reply-meta-text"
                              >
                                Xem trước khi chèn:
                              </Text>
                              <Text type="supporting">{previewText}</Text>
                            </Stack>
                          </div>
                        ) : null}

                        <HStack gap={2} justify="end" wrap="wrap">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="quick-reply-touch-target"
                            label="Huỷ"
                            isDisabled={isSaving}
                            onClick={onCancelForm}
                          />
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            className="quick-reply-touch-target"
                            icon={<Save className="size-4" aria-hidden="true" />}
                            label={
                              isSaving
                                ? "Đang lưu mẫu…"
                                : formMode.type === "create"
                                  ? "Tạo mẫu"
                                  : "Lưu thay đổi"
                            }
                            isLoading={isSaving}
                            isDisabled={isReadOnly || isSaving}
                            tooltip={readOnlyReason ?? undefined}
                          />
                        </HStack>
                      </Stack>
                    </form>
                  </Section>
                ) : null}

                <Divider />

                {/* Template list */}
                {isLoading && items.length === 0 ? (
                  <Stack direction="vertical" gap={3} aria-hidden="true" data-skeleton="quick-replies">
                    {[0, 1, 2].map((idx) => (
                      <Card key={idx} padding={4}>
                        <Stack direction="vertical" gap={2}>
                          <HStack gap={2} align="center">
                            <Skeleton width={76} height={22} index={idx} />
                            <Skeleton width={180} height={18} index={idx} />
                          </HStack>
                          <Skeleton width="90%" height={14} index={idx} />
                          <Skeleton width={132} height={12} index={idx} />
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                ) : loadError && items.length === 0 ? (
                  <ApiErrorNotice
                    error={loadError}
                    onRetry={onRetryLoad}
                    shouldFocus={false}
                    source="Mẫu trả lời nhanh"
                  />
                ) : items.length === 0 ? (
                  <EmptyState
                    kind="first-run"
                    title="Chưa có mẫu trả lời nhanh nào"
                    description="Tạo mẫu trả lời cho các câu hỏi lặp lại như giá bán, phí giao hàng hay hướng dẫn chọn size."
                    action={
                      formMode.type === "closed" ? (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="quick-reply-touch-target"
                          icon={<Plus className="size-4" aria-hidden="true" />}
                          label="Tạo mẫu đầu tiên"
                          isDisabled={isReadOnly}
                          tooltip={readOnlyReason ?? undefined}
                          onClick={onStartCreate}
                        />
                      ) : undefined
                    }
                  />
                ) : (
                  <Stack direction="vertical" gap={3} data-quick-reply-list="manage">
                    {loadError ? (
                      <ApiErrorNotice
                        error={loadError}
                        onRetry={onRetryLoad}
                        shouldFocus={false}
                      />
                    ) : null}

                    {items.map((item) => (
                      <Card key={item.id} padding={4} data-quick-reply-item={item.id}>
                        <Stack direction="vertical" gap={2}>
                          <HStack gap={2} align="start" justify="between" wrap="wrap">
                            <StackItem size="fill">
                              <HStack gap={2} align="center" wrap="wrap">
                                <Token
                                  size="sm"
                                  color="purple"
                                  label={`/${item.shortcut}`}
                                />
                                <Text type="supporting" weight="semibold">
                                  {item.title}
                                </Text>
                              </HStack>
                            </StackItem>

                            <HStack gap={1} align="center">
                              <IconButton
                                variant="ghost"
                                size="sm"
                                className="quick-reply-touch-target"
                                icon={<Pencil className="size-4" aria-hidden="true" />}
                                label={`Sửa mẫu /${item.shortcut}`}
                                tooltip={readOnlyReason ?? "Sửa mẫu"}
                                isDisabled={isReadOnly || isBusy}
                                onClick={() => onStartEdit(item)}
                              />
                              <IconButton
                                variant="ghost"
                                size="sm"
                                className="quick-reply-touch-target"
                                icon={<Trash2 className="size-4" aria-hidden="true" />}
                                label={`Xoá mẫu /${item.shortcut}`}
                                tooltip={readOnlyReason ?? "Xoá mẫu"}
                                isDisabled={isReadOnly || isBusy}
                                onClick={() => onRequestDelete(item)}
                              />
                            </HStack>
                          </HStack>

                          <Text type="supporting">{item.text}</Text>

                          <Text
                            type="supporting"
                            size="xsm"
                            color="inherit"
                            className="quick-reply-meta-text"
                            hasTabularNumbers
                          >
                            Cập nhật {formatCommentAbsoluteTime(item.updatedAt)}
                          </Text>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Stack>
            </LayoutContent>
          }
        />
      </Dialog>

      {/* Destructive delete confirmation (never opens in read-only mode) */}
      {!isReadOnly && deletingItem ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !isDeleting) onCancelDelete();
          }}
          title={`Xoá mẫu “/${deletingItem.shortcut}”?`}
          description={`Mẫu “${deletingItem.title}” sẽ bị xoá vĩnh viễn khỏi công ty và không thể hoàn tác.`}
          cancelLabel="Huỷ"
          actionLabel={isDeleting ? "Đang xoá…" : "Xoá mẫu"}
          actionVariant="destructive"
          isActionLoading={isDeleting}
          onAction={onConfirmDelete}
        />
      ) : null}
    </>
  );
}

export interface QuickReplyManageDialogProps {
  readonly isOpen: boolean;
  readonly customerName: string | null;
  readonly onOpenChange: (open: boolean) => void;
}

/** Connected management dialog for listing, creating, editing, and deleting templates. */
export function QuickReplyManageDialog({
  isOpen,
  customerName,
  onOpenChange,
}: QuickReplyManageDialogProps) {
  const readOnlyReason = useReadOnlyReason();
  const listQuery = useQuickReplies({ enabled: isOpen });
  const createMutation = useCreateQuickReply();
  const updateMutation = useUpdateQuickReply();
  const deleteMutation = useDeleteQuickReply();

  const [formMode, setFormMode] = useState<QuickReplyFormMode>({ type: "closed" });
  const [formValues, setFormValues] = useState<QuickReplyFormValues>(EMPTY_FORM_VALUES);
  const [fieldErrors, setFieldErrors] = useState<QuickReplyFieldErrors>({});
  const [deletingItem, setDeletingItem] = useState<QuickReply | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const items = listQuery.data?.items ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const saveError =
    formMode.type === "create"
      ? createMutation.isError
        ? createMutation.error
        : null
      : formMode.type === "edit"
        ? updateMutation.isError
          ? updateMutation.error
          : null
        : null;

  function resetMutations() {
    createMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setFormMode({ type: "closed" });
      setFormValues(EMPTY_FORM_VALUES);
      setFieldErrors({});
      setDeletingItem(null);
      setStatusMessage(null);
      resetMutations();
    }
    onOpenChange(open);
  }

  function handleStartCreate() {
    if (readOnlyReason !== null) return;
    resetMutations();
    setStatusMessage(null);
    setFieldErrors({});
    setFormValues(EMPTY_FORM_VALUES);
    setFormMode({ type: "create" });
  }

  function handleStartEdit(item: QuickReply) {
    if (readOnlyReason !== null) return;
    resetMutations();
    setStatusMessage(null);
    setFieldErrors({});
    setFormValues({
      shortcut: item.shortcut,
      title: item.title,
      text: item.text,
    });
    setFormMode({ type: "edit", item });
  }

  function handleCancelForm() {
    resetMutations();
    setFieldErrors({});
    setFormValues(EMPTY_FORM_VALUES);
    setFormMode({ type: "closed" });
  }

  function handleFormChange(next: QuickReplyFormValues) {
    setFormValues(next);
    if (Object.keys(fieldErrors).length > 0) {
      setFieldErrors({});
    }
    if (createMutation.isError) createMutation.reset();
    if (updateMutation.isError) updateMutation.reset();
  }

  function handleSubmitForm() {
    if (readOnlyReason !== null || formMode.type === "closed") return;

    const checked = validateQuickReplyForm(formValues);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      return;
    }

    setFieldErrors({});
    const payload: QuickReplyCreateInput = checked.data;

    if (formMode.type === "create") {
      createMutation.mutate(payload, {
        onSuccess: (res) => {
          setStatusMessage(`Đã tạo mẫu /${res.item.shortcut}.`);
          setFormMode({ type: "closed" });
          setFormValues(EMPTY_FORM_VALUES);
        },
      });
      return;
    }

    const patch: QuickReplyUpdateInput = buildQuickReplyPatch(formMode.item, payload);
    if (!hasQuickReplyPatchChanges(patch)) {
      setFormMode({ type: "closed" });
      setFormValues(EMPTY_FORM_VALUES);
      return;
    }

    updateMutation.mutate(
      { id: formMode.item.id, patch },
      {
        onSuccess: (res) => {
          setStatusMessage(`Đã cập nhật mẫu /${res.item.shortcut}.`);
          setFormMode({ type: "closed" });
          setFormValues(EMPTY_FORM_VALUES);
        },
      },
    );
  }

  function handleConfirmDelete() {
    if (readOnlyReason !== null || !deletingItem) return;
    const target = deletingItem;

    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        setDeletingItem(null);
        setStatusMessage(`Đã xoá mẫu /${target.shortcut}.`);
        if (formMode.type === "edit" && formMode.item.id === target.id) {
          setFormMode({ type: "closed" });
          setFormValues(EMPTY_FORM_VALUES);
        }
      },
      onError: () => {
        setDeletingItem(null);
      },
    });
  }

  return (
    <QuickReplyManageDialogView
      isOpen={isOpen}
      isLoading={listQuery.isPending && items.length === 0}
      loadError={listQuery.isError ? listQuery.error : null}
      items={items}
      customerName={customerName}
      readOnlyReason={readOnlyReason}
      formMode={formMode}
      formValues={formValues}
      fieldErrors={fieldErrors}
      isSaving={isSaving}
      saveError={saveError}
      deletingItem={deletingItem}
      isDeleting={deleteMutation.isPending}
      deleteError={deleteMutation.isError ? deleteMutation.error : null}
      statusMessage={statusMessage}
      onOpenChange={handleOpenChange}
      onRetryLoad={() => {
        void listQuery.refetch();
      }}
      onStartCreate={handleStartCreate}
      onStartEdit={handleStartEdit}
      onCancelForm={handleCancelForm}
      onFormChange={handleFormChange}
      onSubmitForm={handleSubmitForm}
      onRequestDelete={(item) => {
        if (readOnlyReason !== null) return;
        deleteMutation.reset();
        setDeletingItem(item);
      }}
      onCancelDelete={() => setDeletingItem(null)}
      onConfirmDelete={handleConfirmDelete}
    />
  );
}
