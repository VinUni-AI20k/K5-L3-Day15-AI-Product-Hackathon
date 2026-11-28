"use client";

import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  HStack,
  Heading,
  IconButton,
  NumberInput,
  Skeleton,
  Stack,
  Tab,
  TabList,
  Text,
  TextArea,
  TextInput,
} from "@astryxdesign/core";
import { Plus, RotateCcw, Ruler, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { presentApiError, toApiError } from "@/ui/components/feedback/present-api-error";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import {
  useCategorySizeChart,
  useDefaultSizeChart,
  useSaveSizeChart,
  useSizeChartCatalogCategories,
} from "@/ui/hooks/useWritingStyle";
import {
  DEFAULT_SIZE_CHART,
  FREESIZE_GUIDANCE_NOTE,
  SIZE_CHART_LIMITS,
  formatWritingStyleDate,
} from "@/ui/schemas/writing-style.schema";
import { isAbortError } from "@/ui/services/abort";

import {
  SIZE_CHART_DEFAULT_TAB,
  addSizeChartRow,
  createDefaultSizeChartDraft,
  doesDraftMatchDefaultSample,
  draftFromSizeChart,
  isNotFoundApiError,
  isSizeChartDraftDirty,
  mapSizeChartServerErrors,
  mergeSizeChartCategories,
  removeSizeChartRow,
  sizeChartFromDraft,
  sizeChartLimitState,
  updateSizeChartRow,
  validateNewCategoryName,
  validateSizeChartDraft,
  type SizeChartCellKey,
  type SizeChartDraft,
  type SizeChartFocusTarget,
  type SizeChartRowErrors,
  type SizeChartTabValue,
} from "./size-chart-state";
import { UNSAVED_CHANGES_DIALOG_COPY } from "./writing-style-dirty-guard";

import "./size-chart.css";

const SAVING_MESSAGE = "Đang lưu bảng size…";

export interface SizeChartSectionViewProps {
  readonly activeTab: SizeChartTabValue;
  readonly categories: readonly string[];
  readonly draft: SizeChartDraft;
  readonly isSample: boolean;
  readonly isInheritedCategory: boolean;
  readonly updatedAt: string | null;
  readonly isLoading: boolean;
  readonly showSkeleton: boolean;
  readonly loadError: unknown;
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly readOnlyReason: string | null;
  readonly tableError: string | null;
  readonly noteError: string | null;
  readonly rowErrors: Readonly<Record<number, SizeChartRowErrors>>;
  readonly unmappedServerErrors: readonly string[];
  readonly focusTarget: (SizeChartFocusTarget & { readonly nonce: number }) | null;
  readonly notice: string | null;
  readonly isAddingCategory: boolean;
  readonly newCategoryInput: string;
  readonly newCategoryError: string | null;
  readonly isRestoreConfirmOpen: boolean;
  readonly pendingTabSwitch: SizeChartTabValue | null;
  readonly onSelectTab: (nextTab: SizeChartTabValue) => void;
  readonly onToggleAddCategory: (open: boolean) => void;
  readonly onChangeNewCategoryInput: (value: string) => void;
  readonly onConfirmAddCategory: () => void;
  readonly onAddRow: () => void;
  readonly onUpdateRow: (
    id: string,
    patch: Partial<{
      size: string;
      weightMin: number | null;
      weightMax: number | null;
      heightMin: number | null;
      heightMax: number | null;
    }>,
  ) => void;
  readonly onRemoveRow: (id: string) => void;
  readonly onChangeNote: (value: string) => void;
  readonly onRequestRestoreSample: () => void;
  readonly onCancelRestoreSample: () => void;
  readonly onConfirmRestoreSample: () => void;
  readonly onCancelTabSwitch: () => void;
  readonly onConfirmTabSwitch: () => void;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onRetryLoad: () => void;
  readonly onDismissNotice: () => void;
}

/**
 * Pure presentational view of the "Bảng size" section on `/writing-style`.
 * Covers default vs per-category tabs, accessible editable table semantics,
 * inline validation, "Khôi phục bảng mẫu" confirmation, dirty-tab guard, and
 * read-only sessions.
 */
export function SizeChartSectionView({
  activeTab,
  categories,
  draft,
  isSample,
  isInheritedCategory,
  updatedAt,
  isLoading,
  showSkeleton,
  loadError,
  isDirty,
  isSaving,
  readOnlyReason,
  tableError,
  noteError,
  rowErrors,
  unmappedServerErrors,
  focusTarget,
  notice,
  isAddingCategory,
  newCategoryInput,
  newCategoryError,
  isRestoreConfirmOpen,
  pendingTabSwitch,
  onSelectTab,
  onToggleAddCategory,
  onChangeNewCategoryInput,
  onConfirmAddCategory,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  onChangeNote,
  onRequestRestoreSample,
  onCancelRestoreSample,
  onConfirmRestoreSample,
  onCancelTabSwitch,
  onConfirmTabSwitch,
  onSave,
  onDiscard,
  onRetryLoad,
  onDismissNotice,
}: SizeChartSectionViewProps) {
  const baseId = useId();
  const headingId = `${baseId}-size-chart-heading`;
  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const tableRegionRef = useRef<HTMLDivElement | null>(null);

  const isDefaultTab = activeTab === SIZE_CHART_DEFAULT_TAB;
  const activeScopeLabel = isDefaultTab ? "Mặc định" : activeTab;
  const isReadOnly = readOnlyReason !== null;
  const isDisabled = isReadOnly || isSaving;
  const disabledMessage = isSaving ? SAVING_MESSAGE : (readOnlyReason ?? undefined);

  const limit = sizeChartLimitState(draft.rows.length);
  const matchesSample = doesDraftMatchDefaultSample(draft);

  const setCellRef = useCallback(
    (rowIndex: number, cell: SizeChartCellKey, node: HTMLElement | null) => {
      cellRefs.current[`${rowIndex}:${cell}`] = node;
    },
    [],
  );

  useEffect(() => {
    if (!focusTarget) return;
    let targetNode: HTMLElement | null = null;
    if (focusTarget.kind === "cell") {
      targetNode = cellRefs.current[`${focusTarget.rowIndex}:${focusTarget.cell}`] ?? null;
    } else if (focusTarget.kind === "note") {
      targetNode = noteRef.current;
    } else if (focusTarget.kind === "table") {
      targetNode = tableRegionRef.current;
    }
    if (!targetNode) return;
    targetNode.focus();
    if (typeof targetNode.scrollIntoView === "function") {
      targetNode.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusTarget]);

  const tableCaption = isDefaultTab
    ? "Bảng size mặc định theo cân nặng và chiều cao"
    : `Bảng size cho loại ${activeTab} theo cân nặng và chiều cao`;

  const restoreTooltip = isSaving
    ? SAVING_MESSAGE
    : isReadOnly
      ? (readOnlyReason ?? undefined)
      : matchesSample
        ? "Bảng hiện tại đã giống bảng size mẫu."
        : undefined;

  const addRowTooltip = isSaving
    ? SAVING_MESSAGE
    : isReadOnly
      ? (readOnlyReason ?? undefined)
      : limit.isAtLimit
        ? `Đã đạt giới hạn tối đa ${SIZE_CHART_LIMITS.maxRows} dòng size.`
        : undefined;

  const saveTooltip = isSaving
    ? SAVING_MESSAGE
    : isReadOnly
      ? (readOnlyReason ?? undefined)
      : !isDirty
        ? "Chưa có thay đổi nào cần lưu."
        : undefined;

  const discardTooltip = isSaving
    ? SAVING_MESSAGE
    : isReadOnly
      ? (readOnlyReason ?? undefined)
      : !isDirty
        ? "Chưa có thay đổi nào để huỷ."
        : undefined;

  return (
    <Card
      padding={5}
      aria-labelledby={headingId}
      data-writing-style="size-chart"
      data-size-chart-tab={activeTab}
    >
      <Stack direction="vertical" gap={4}>
        {/* Section header */}
        <Stack direction="vertical" gap={1.5}>
          <HStack gap={3} justify="between" align="center" wrap="wrap">
            <HStack gap={2} align="center" wrap="wrap">
              <Ruler className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Heading level={2} id={headingId}>
                Bảng size
              </Heading>
              {isDefaultTab ? (
                <Badge
                  variant={isSample ? "info" : "success"}
                  label={isSample ? "Bảng size mẫu" : "Đã tuỳ chỉnh"}
                  data-size-chart-status={isSample ? "sample" : "custom"}
                />
              ) : (
                <Badge
                  variant={isInheritedCategory ? "neutral" : "info"}
                  label={
                    isInheritedCategory
                      ? "Đang dùng bảng mặc định"
                      : `Riêng cho ${activeTab}`
                  }
                  data-size-chart-status={
                    isInheritedCategory ? "category-inherited" : "category-custom"
                  }
                />
              )}
            </HStack>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="size-4" aria-hidden="true" />}
              label="Khôi phục bảng mẫu"
              isDisabled={isDisabled || matchesSample}
              tooltip={restoreTooltip}
              onClick={onRequestRestoreSample}
            />
          </HStack>

          <Text type="supporting" color="secondary" className="max-w-prose">
            Bảng chuẩn cân nặng và chiều cao dùng khi bật tính năng “Tư vấn size” ở mục Tự động
            trả lời bình luận. Áp dụng chung toàn công ty theo bảng mặc định hoặc thiết lập riêng
            cho từng loại sản phẩm.
          </Text>
          <Text type="supporting" color="secondary">
            {FREESIZE_GUIDANCE_NOTE}
          </Text>
        </Stack>

        {/* Default vs per-category tabs */}
        <Stack direction="vertical" gap={3}>
          <HStack gap={3} justify="between" align="center" wrap="wrap">
            <div className="size-chart-tab-scroller min-w-0 flex-1">
              <TabList
                value={activeTab}
                onChange={(next) => onSelectTab(next as SizeChartTabValue)}
                hasDivider
                aria-label="Phạm vi bảng size theo loại sản phẩm"
              >
                <Tab value={SIZE_CHART_DEFAULT_TAB} label="Mặc định" />
                {categories.map((category) => (
                  <Tab key={category} value={category} label={category} />
                ))}
              </TabList>
            </div>

            {!isAddingCategory ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Plus className="size-4" aria-hidden="true" />}
                label="Thêm loại sản phẩm"
                isDisabled={isDisabled}
                tooltip={isDisabled ? disabledMessage : undefined}
                onClick={() => onToggleAddCategory(true)}
              />
            ) : null}
          </HStack>

          {isAddingCategory ? (
            <HStack gap={2} align="start" wrap="wrap" data-size-chart-add-category="true">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <TextInput
                  label="Tên loại sản phẩm"
                  isLabelHidden
                  size="sm"
                  value={newCategoryInput}
                  placeholder="Ví dụ: Váy, Áo sơ mi, Quần…"
                  width="100%"
                  isDisabled={isDisabled}
                  disabledMessage={disabledMessage}
                  status={
                    newCategoryError
                      ? { type: "error", message: newCategoryError }
                      : undefined
                  }
                  statusVariant="detached"
                  onChange={onChangeNewCategoryInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onConfirmAddCategory();
                    } else if (event.key === "Escape") {
                      onToggleAddCategory(false);
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                label="Thêm tab"
                isDisabled={isDisabled}
                tooltip={isDisabled ? disabledMessage : undefined}
                onClick={onConfirmAddCategory}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                label="Huỷ"
                isDisabled={isSaving}
                onClick={() => onToggleAddCategory(false)}
              />
            </HStack>
          ) : null}
        </Stack>

        {/* Polite status region for save / restore feedback */}
        <div role="status" aria-live="polite">
          {notice ? (
            <Banner
              status="success"
              title={notice}
              isDismissable
              onDismiss={onDismissNotice}
            />
          ) : null}
        </div>

        {/* Load states */}
        {isLoading ? (
          showSkeleton ? (
            <SizeChartSkeleton />
          ) : null
        ) : loadError ? (
          <ApiErrorNotice error={loadError} onRetry={onRetryLoad} />
        ) : (
          <Stack direction="vertical" gap={4}>
            {!isDefaultTab && isInheritedCategory ? (
              <Banner
                status="info"
                title={`Chưa có bảng size riêng cho loại “${activeTab}”`}
                description="Bảng bên dưới đang điền sẵn theo bảng mặc định công ty. Chỉnh các dòng cần khác biệt rồi bấm “Lưu bảng size” để áp dụng riêng cho loại này."
              />
            ) : null}

            {tableError ? (
              <Banner
                role="alert"
                status="error"
                title="Bảng size chưa hợp lệ"
                description={tableError}
                data-size-chart-error="table"
              />
            ) : null}

            {unmappedServerErrors.length > 0 ? (
              <Banner
                role="alert"
                status="error"
                title="Không lưu được bảng size"
                description={unmappedServerErrors.join(" · ")}
                data-size-chart-error="server"
              />
            ) : null}

            {/* Row count + Add row */}
            <HStack gap={2} justify="between" align="center" wrap="wrap">
              <HStack gap={2} align="center" wrap="wrap">
                <Badge
                  variant={
                    limit.isOverLimit
                      ? "error"
                      : limit.isAtLimit
                        ? "warning"
                        : "neutral"
                  }
                  label={`${limit.text} dòng`}
                  data-size-chart-row-count={draft.rows.length}
                />
                <Text type="supporting" color="secondary">
                  Cân nặng {SIZE_CHART_LIMITS.weightMin}–{SIZE_CHART_LIMITS.weightMax} kg · Chiều
                  cao {SIZE_CHART_LIMITS.heightMin}–{SIZE_CHART_LIMITS.heightMax} cm (tuỳ chọn)
                </Text>
              </HStack>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="size-4" aria-hidden="true" />}
                label="Thêm dòng"
                isDisabled={isDisabled || limit.isAtLimit}
                tooltip={addRowTooltip}
                onClick={onAddRow}
              />
            </HStack>

            {/* Accessible editable size chart table */}
            <div
              ref={tableRegionRef}
              tabIndex={-1}
              className="size-chart-table-scroll"
              data-size-chart-table="true"
            >
              <table className="size-chart-table" aria-label={tableCaption}>
                <caption className="sr-only">{tableCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="size-chart-col-size">
                      Size
                    </th>
                    <th scope="col" className="size-chart-col-num">
                      Cân nặng từ (kg)
                    </th>
                    <th scope="col" className="size-chart-col-num">
                      Cân nặng đến (kg)
                    </th>
                    <th scope="col" className="size-chart-col-num">
                      Chiều cao từ (cm)
                    </th>
                    <th scope="col" className="size-chart-col-num">
                      Chiều cao đến (cm)
                    </th>
                    <th scope="col" className="size-chart-col-action">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="size-chart-empty-cell">
                        <Stack direction="vertical" gap={2} align="center">
                          <Text type="supporting" color="secondary">
                            Chưa có dòng size nào. Thêm ít nhất 1 dòng hoặc khôi phục bảng mẫu.
                          </Text>
                          <HStack gap={2} align="center" wrap="wrap">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              icon={<Plus className="size-4" aria-hidden="true" />}
                              label="Thêm dòng"
                              isDisabled={isDisabled}
                              tooltip={isDisabled ? disabledMessage : undefined}
                              onClick={onAddRow}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={<RotateCcw className="size-4" aria-hidden="true" />}
                              label="Khôi phục bảng mẫu"
                              isDisabled={isDisabled}
                              tooltip={isDisabled ? disabledMessage : undefined}
                              onClick={onRequestRestoreSample}
                            />
                          </HStack>
                        </Stack>
                      </td>
                    </tr>
                  ) : (
                    draft.rows.map((row, index) => {
                      const err = rowErrors[index];
                      const trimmedSize = row.size.trim();
                      const rowLabel =
                        trimmedSize.length > 0
                          ? `size ${trimmedSize}`
                          : `dòng ${index + 1}`;

                      return (
                        <tr key={row.id} data-size-row={index}>
                          <td>
                            <TextInput
                              ref={(node) => setCellRef(index, "size", node)}
                              label={`Tên size dòng ${index + 1}`}
                              isLabelHidden
                              size="sm"
                              value={row.size}
                              placeholder="Ví dụ: M"
                              width="100%"
                              isDisabled={isDisabled}
                              disabledMessage={disabledMessage}
                              status={
                                err?.size
                                  ? { type: "error", message: err.size }
                                  : undefined
                              }
                              statusVariant="detached"
                              onChange={(value) => onUpdateRow(row.id, { size: value })}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.preventDefault();
                              }}
                            />
                          </td>

                          <td>
                            <NumberInput
                              ref={(node) => setCellRef(index, "weightMin", node)}
                              label={`Cân nặng từ (kg) — ${rowLabel}`}
                              isLabelHidden
                              size="sm"
                              value={row.weightMin}
                              placeholder="40"
                              step={1}
                              hasClear
                              isWheelEnabled={false}
                              width="100%"
                              isDisabled={isDisabled}
                              disabledMessage={disabledMessage}
                              status={
                                err?.weightMin
                                  ? { type: "error", message: err.weightMin }
                                  : undefined
                              }
                              statusVariant="detached"
                              onChange={(value) =>
                                onUpdateRow(row.id, { weightMin: value })
                              }
                            />
                          </td>

                          <td>
                            <NumberInput
                              ref={(node) => setCellRef(index, "weightMax", node)}
                              label={`Cân nặng đến (kg) — ${rowLabel}`}
                              isLabelHidden
                              size="sm"
                              value={row.weightMax}
                              placeholder="46"
                              step={1}
                              hasClear
                              isWheelEnabled={false}
                              width="100%"
                              isDisabled={isDisabled}
                              disabledMessage={disabledMessage}
                              status={
                                err?.weightMax
                                  ? { type: "error", message: err.weightMax }
                                  : undefined
                              }
                              statusVariant="detached"
                              onChange={(value) =>
                                onUpdateRow(row.id, { weightMax: value })
                              }
                            />
                          </td>

                          <td>
                            <NumberInput
                              ref={(node) => setCellRef(index, "heightMin", node)}
                              label={`Chiều cao từ (cm) — ${rowLabel}`}
                              isLabelHidden
                              size="sm"
                              value={row.heightMin}
                              placeholder="145"
                              step={1}
                              hasClear
                              isWheelEnabled={false}
                              width="100%"
                              isDisabled={isDisabled}
                              disabledMessage={disabledMessage}
                              status={
                                err?.heightMin
                                  ? { type: "error", message: err.heightMin }
                                  : undefined
                              }
                              statusVariant="detached"
                              onChange={(value) =>
                                onUpdateRow(row.id, { heightMin: value })
                              }
                            />
                          </td>

                          <td>
                            <NumberInput
                              ref={(node) => setCellRef(index, "heightMax", node)}
                              label={`Chiều cao đến (cm) — ${rowLabel}`}
                              isLabelHidden
                              size="sm"
                              value={row.heightMax}
                              placeholder="155"
                              step={1}
                              hasClear
                              isWheelEnabled={false}
                              width="100%"
                              isDisabled={isDisabled}
                              disabledMessage={disabledMessage}
                              status={
                                err?.heightMax
                                  ? { type: "error", message: err.heightMax }
                                  : undefined
                              }
                              statusVariant="detached"
                              onChange={(value) =>
                                onUpdateRow(row.id, { heightMax: value })
                              }
                            />
                          </td>

                          <td className="size-chart-cell-action">
                            <IconButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 className="size-4" aria-hidden="true" />}
                              label={`Xoá ${rowLabel}`}
                              isDisabled={isDisabled}
                              tooltip={isDisabled ? disabledMessage : `Xoá ${rowLabel}`}
                              onClick={() => onRemoveRow(row.id)}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Optional note */}
            <TextArea
              ref={noteRef}
              label="Ghi chú bảng size (tuỳ chọn)"
              description="Ghi chú nội bộ hoặc lưu ý về form dáng chung (tối đa 300 ký tự)."
              value={draft.note}
              placeholder="Ví dụ: Form tiêu chuẩn Việt Nam, vải ít co giãn."
              rows={2}
              maxLength={SIZE_CHART_LIMITS.noteMaxChars}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={noteError ? { type: "error", message: noteError } : undefined}
              statusVariant="detached"
              onChange={onChangeNote}
            />

            <Divider />

            {/* Save bar consistent with WritingStyleForm */}
            <HStack gap={3} justify="between" align="center" wrap="wrap">
              <div className="min-w-0 flex-1">
                {readOnlyReason ? (
                  <ReadOnlyNotice reason={readOnlyReason} />
                ) : isDirty ? (
                  <HStack gap={2} align="center" wrap="wrap">
                    <Badge variant="warning" label="Chưa lưu" />
                    <Text type="supporting" color="secondary">
                      Bạn có thay đổi bảng size chưa lưu cho “{activeScopeLabel}”.
                    </Text>
                  </HStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    {updatedAt
                      ? `Cập nhật gần nhất: ${formatWritingStyleDate(updatedAt)}`
                      : isDefaultTab
                        ? "Đang dùng bảng size mẫu — chỉnh sửa rồi bấm “Lưu bảng size” để áp dụng."
                        : `Đang dùng bảng mặc định cho loại “${activeTab}”.`}
                  </Text>
                )}
              </div>

              <HStack gap={2} align="center" wrap="wrap">
                <Button
                  type="button"
                  variant="ghost"
                  label="Huỷ thay đổi"
                  isDisabled={isDisabled || !isDirty}
                  tooltip={discardTooltip}
                  onClick={onDiscard}
                />
                <Button
                  type="button"
                  variant="primary"
                  label="Lưu bảng size"
                  isLoading={isSaving}
                  isDisabled={isDisabled || !isDirty}
                  tooltip={saveTooltip}
                  onClick={onSave}
                />
              </HStack>
            </HStack>
          </Stack>
        )}
      </Stack>

      {/* Confirm "Khôi phục bảng mẫu" */}
      <AlertDialog
        isOpen={isRestoreConfirmOpen}
        onOpenChange={(open) => {
          if (!open) onCancelRestoreSample();
        }}
        title="Khôi phục bảng size mẫu?"
        description={`Toàn bộ các dòng hiện tại của bảng “${activeScopeLabel}” sẽ được thay bằng bảng size mẫu chuẩn (S, M, L, XL, 2XL). Bạn vẫn cần bấm “Lưu bảng size” để lưu thay đổi.`}
        actionLabel="Khôi phục bảng mẫu"
        actionVariant="destructive"
        cancelLabel="Giữ nguyên"
        onAction={onConfirmRestoreSample}
      />

      {/* Confirm unsaved changes when switching Default <-> Category tab */}
      <AlertDialog
        isOpen={pendingTabSwitch !== null}
        onOpenChange={(open) => {
          if (!open) onCancelTabSwitch();
        }}
        title={UNSAVED_CHANGES_DIALOG_COPY.title}
        description="Bạn đã chỉnh sửa bảng size nhưng chưa bấm Lưu. Nếu chuyển tab ngay bây giờ, các thay đổi chưa lưu sẽ bị mất."
        actionLabel={UNSAVED_CHANGES_DIALOG_COPY.actionLabel}
        actionVariant="destructive"
        cancelLabel={UNSAVED_CHANGES_DIALOG_COPY.cancelLabel}
        onAction={onConfirmTabSwitch}
      />
    </Card>
  );
}

export function SizeChartSkeleton() {
  return (
    <Stack direction="vertical" gap={3} aria-hidden="true">
      <HStack gap={2} justify="between" align="center">
        <Skeleton width="35%" height={20} index={0} />
        <Skeleton width={112} height={32} index={1} />
      </HStack>
      <Skeleton width="100%" height={40} index={2} />
      <Skeleton width="100%" height={40} index={3} />
      <Skeleton width="100%" height={40} index={4} />
      <Skeleton width="100%" height={40} index={5} />
      <Skeleton width="100%" height={40} index={6} />
    </Stack>
  );
}

export interface SizeChartSectionProps {
  readonly readOnlyReason: string | null;
  /** Incremented by parent screen when operator discards all unsaved edits. */
  readonly resetNonce?: number;
  /** Incremented by parent screen when operator clicks top-level "Tải lại". */
  readonly reloadNonce?: number;
  readonly onDirtyChange?: (isDirty: boolean) => void;
  readonly onSavingChange?: (isSaving: boolean) => void;
}

/**
 * Connected "Bảng size" section wired to `/api/writing-style/size-chart` and
 * `/api/writing-style/size-chart/{category}`.
 */
export function SizeChartSection({
  readOnlyReason,
  resetNonce = 0,
  reloadNonce = 0,
  onDirtyChange,
  onSavingChange,
}: SizeChartSectionProps) {
  const defaultQuery = useDefaultSizeChart();
  const catalogCategoriesQuery = useSizeChartCatalogCategories();
  const saveMutation = useSaveSizeChart();

  const [activeTab, setActiveTab] = useState<SizeChartTabValue>(SIZE_CHART_DEFAULT_TAB);
  const [customCategories, setCustomCategories] = useState<readonly string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const isDefaultTab = activeTab === SIZE_CHART_DEFAULT_TAB;
  const activeCategory = isDefaultTab ? null : activeTab;
  const categoryQuery = useCategorySizeChart(activeCategory);

  const [localEdit, setLocalEdit] = useState<{
    readonly tab: SizeChartTabValue;
    readonly draft: SizeChartDraft;
  } | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Readonly<Record<number, SizeChartRowErrors>>>(
    {},
  );
  const [unmappedServerErrors, setUnmappedServerErrors] = useState<readonly string[]>([]);
  const [focusTarget, setFocusTarget] = useState<
    (SizeChartFocusTarget & { readonly nonce: number }) | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<SizeChartTabValue | null>(null);

  const rowCounterRef = useRef(0);
  const focusNonceRef = useRef(0);
  const prevResetNonceRef = useRef(resetNonce);
  const prevReloadNonceRef = useRef(reloadNonce);

  const categories = useMemo(
    () =>
      mergeSizeChartCategories({
        serverCategories: defaultQuery.data?.categories,
        catalogCategories: catalogCategoriesQuery.data,
        customCategories,
      }),
    [defaultQuery.data?.categories, catalogCategoriesQuery.data, customCategories],
  );

  // Authoritative company default chart (falling back to built-in sample chart on 404).
  const defaultChart = useMemo(
    () => defaultQuery.data?.chart ?? DEFAULT_SIZE_CHART,
    [defaultQuery.data?.chart],
  );

  const defaultNotFound = defaultQuery.isError && isNotFoundApiError(defaultQuery.error);
  const categoryNotFound =
    !isDefaultTab && categoryQuery.isError && isNotFoundApiError(categoryQuery.error);

  const activeServerChart = useMemo(() => {
    if (isDefaultTab) return defaultChart;
    if (categoryQuery.data && !categoryQuery.data.isInherited) {
      return categoryQuery.data.chart;
    }
    if (categoryQuery.data && categoryQuery.data.chart.rows.length > 0) {
      return categoryQuery.data.chart;
    }
    return defaultChart;
  }, [isDefaultTab, defaultChart, categoryQuery.data]);

  const serverDraft = useMemo(
    () => draftFromSizeChart(activeServerChart),
    [activeServerChart],
  );

  const draft =
    localEdit && localEdit.tab === activeTab ? localEdit.draft : serverDraft;

  const isDirty = useMemo(
    () => isSizeChartDraftDirty(serverDraft, draft),
    [serverDraft, draft],
  );

  const isSample = isDefaultTab
    ? defaultNotFound
      ? true
      : (defaultQuery.data?.isSample ?? true)
    : false;
  const isInheritedCategory = !isDefaultTab
    ? categoryNotFound || (categoryQuery.data?.isInherited ?? true)
    : false;
  const updatedAt = isDefaultTab
    ? (defaultQuery.data?.updatedAt ?? null)
    : categoryNotFound
      ? null
      : (categoryQuery.data?.updatedAt ?? null);

  // Notify parent screen for unified dirty/beforeunload/navigation guard.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saveMutation.isPending);
  }, [saveMutation.isPending, onSavingChange]);

  const clearErrors = useCallback(() => {
    setTableError(null);
    setNoteError(null);
    setRowErrors({});
    setUnmappedServerErrors([]);
  }, []);

  // Respond to parent screen discard / reload requests.
  useEffect(() => {
    if (prevResetNonceRef.current === resetNonce) return;
    prevResetNonceRef.current = resetNonce;
    setLocalEdit(null);
    clearErrors();
    setNotice(null);
    setPendingTabSwitch(null);
    setIsRestoreConfirmOpen(false);
    saveMutation.reset();
  }, [resetNonce, clearErrors, saveMutation]);

  useEffect(() => {
    if (prevReloadNonceRef.current === reloadNonce) return;
    prevReloadNonceRef.current = reloadNonce;
    setLocalEdit(null);
    clearErrors();
    void defaultQuery.refetch();
    void catalogCategoriesQuery.refetch();
    if (!isDefaultTab) {
      void categoryQuery.refetch();
    }
  }, [
    reloadNonce,
    clearErrors,
    defaultQuery,
    catalogCategoriesQuery,
    categoryQuery,
    isDefaultTab,
  ]);

  function triggerFocus(target: SizeChartFocusTarget | null) {
    if (!target) return;
    focusNonceRef.current += 1;
    setFocusTarget({ ...target, nonce: focusNonceRef.current });
  }

  function applyDraftChange(nextDraft: SizeChartDraft) {
    setLocalEdit({ tab: activeTab, draft: nextDraft });
    if (notice) setNotice(null);
    if (
      tableError !== null ||
      noteError !== null ||
      Object.keys(rowErrors).length > 0 ||
      unmappedServerErrors.length > 0
    ) {
      clearErrors();
    }
  }

  function applyTabSwitch(nextTab: SizeChartTabValue) {
    setLocalEdit(null);
    setActiveTab(nextTab);
    clearErrors();
    setNotice(null);
    setIsRestoreConfirmOpen(false);
    saveMutation.reset();
  }

  function handleSelectTab(nextTab: SizeChartTabValue) {
    if (nextTab === activeTab) return;
    if (isDirty) {
      setPendingTabSwitch(nextTab);
      return;
    }
    applyTabSwitch(nextTab);
  }

  function handleConfirmTabSwitch() {
    const target = pendingTabSwitch;
    setPendingTabSwitch(null);
    if (!target) return;
    applyTabSwitch(target);
  }

  function handleConfirmAddCategory() {
    const err = validateNewCategoryName(newCategoryInput, categories);
    if (err) {
      setNewCategoryError(err);
      return;
    }
    const cleaned = newCategoryInput.trim();
    setCustomCategories((prev) => [...prev, cleaned]);
    setIsAddingCategory(false);
    setNewCategoryInput("");
    setNewCategoryError(null);
    handleSelectTab(cleaned);
  }

  function handleAddRow() {
    rowCounterRef.current += 1;
    applyDraftChange({
      ...draft,
      rows: addSizeChartRow(draft.rows, `size-new-${rowCounterRef.current}`),
    });
  }

  function handleUpdateRow(
    id: string,
    patch: Partial<{
      size: string;
      weightMin: number | null;
      weightMax: number | null;
      heightMin: number | null;
      heightMax: number | null;
    }>,
  ) {
    applyDraftChange({
      ...draft,
      rows: updateSizeChartRow(draft.rows, id, patch),
    });
  }

  function handleRemoveRow(id: string) {
    applyDraftChange({
      ...draft,
      rows: removeSizeChartRow(draft.rows, id),
    });
  }

  function handleConfirmRestoreSample() {
    setIsRestoreConfirmOpen(false);
    const sampleDraft = createDefaultSizeChartDraft();
    setLocalEdit({ tab: activeTab, draft: sampleDraft });
    clearErrors();
    setNotice(
      "Đã khôi phục bảng size mẫu — bấm “Lưu bảng size” để áp dụng thay đổi.",
    );
  }

  function handleDiscard() {
    setLocalEdit(null);
    clearErrors();
    setNotice(null);
    saveMutation.reset();
  }

  function handleSave() {
    setNotice(null);
    const validation = validateSizeChartDraft(draft);
    if (!validation.isValid) {
      setTableError(validation.tableError);
      setNoteError(validation.noteError);
      setRowErrors(validation.rowErrors);
      setUnmappedServerErrors([]);
      triggerFocus(validation.firstInvalidTarget);
      return;
    }

    const payload = sizeChartFromDraft(draft);
    saveMutation.mutate(
      { category: activeCategory, chart: payload },
      {
        onSuccess: () => {
          setLocalEdit(null);
          clearErrors();
          setNotice(
            activeCategory === null
              ? "Đã lưu bảng size mặc định công ty."
              : `Đã lưu bảng size riêng cho loại “${activeCategory}”.`,
          );
        },
        onError: (error) => {
          if (isAbortError(error)) return;
          const mapped = mapSizeChartServerErrors(error, draft.rows.length);
          if (
            mapped.firstInvalidTarget !== null ||
            mapped.unmappedMessages.length > 0
          ) {
            setTableError(mapped.tableError);
            setNoteError(mapped.noteError);
            setRowErrors(mapped.rowErrors);
            setUnmappedServerErrors(mapped.unmappedMessages);
            triggerFocus(mapped.firstInvalidTarget);
          } else {
            setUnmappedServerErrors([presentApiError(toApiError(error)).description]);
          }
        },
      },
    );
  }

  const isLoading = isDefaultTab
    ? defaultQuery.isPending && defaultQuery.fetchStatus === "fetching"
    : categoryQuery.isPending && categoryQuery.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isLoading);

  const loadError = isDefaultTab
    ? defaultQuery.isError &&
      !isAbortError(defaultQuery.error) &&
      !defaultNotFound
      ? defaultQuery.error
      : null
    : categoryQuery.isError &&
        !isAbortError(categoryQuery.error) &&
        !categoryNotFound
      ? categoryQuery.error
      : null;

  return (
    <SizeChartSectionView
      activeTab={activeTab}
      categories={categories}
      draft={draft}
      isSample={isSample}
      isInheritedCategory={isInheritedCategory}
      updatedAt={updatedAt}
      isLoading={isLoading}
      showSkeleton={showSkeleton}
      loadError={loadError}
      isDirty={isDirty}
      isSaving={saveMutation.isPending}
      readOnlyReason={readOnlyReason}
      tableError={tableError}
      noteError={noteError}
      rowErrors={rowErrors}
      unmappedServerErrors={unmappedServerErrors}
      focusTarget={focusTarget}
      notice={notice}
      isAddingCategory={isAddingCategory}
      newCategoryInput={newCategoryInput}
      newCategoryError={newCategoryError}
      isRestoreConfirmOpen={isRestoreConfirmOpen}
      pendingTabSwitch={pendingTabSwitch}
      onSelectTab={handleSelectTab}
      onToggleAddCategory={(open) => {
        setIsAddingCategory(open);
        if (!open) {
          setNewCategoryInput("");
          setNewCategoryError(null);
        }
      }}
      onChangeNewCategoryInput={(value) => {
        setNewCategoryInput(value);
        if (newCategoryError) setNewCategoryError(null);
      }}
      onConfirmAddCategory={handleConfirmAddCategory}
      onAddRow={handleAddRow}
      onUpdateRow={handleUpdateRow}
      onRemoveRow={handleRemoveRow}
      onChangeNote={(value) => applyDraftChange({ ...draft, note: value })}
      onRequestRestoreSample={() => setIsRestoreConfirmOpen(true)}
      onCancelRestoreSample={() => setIsRestoreConfirmOpen(false)}
      onConfirmRestoreSample={handleConfirmRestoreSample}
      onCancelTabSwitch={() => setPendingTabSwitch(null)}
      onConfirmTabSwitch={handleConfirmTabSwitch}
      onSave={handleSave}
      onDiscard={handleDiscard}
      onRetryLoad={() => {
        if (isDefaultTab) {
          void defaultQuery.refetch();
        } else {
          void categoryQuery.refetch();
        }
      }}
      onDismissNotice={() => setNotice(null)}
    />
  );
}
