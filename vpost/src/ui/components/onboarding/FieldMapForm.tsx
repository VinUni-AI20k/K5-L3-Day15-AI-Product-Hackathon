"use client";

import {
  Banner,
  Button,
  CheckboxInput,
  RadioList,
  RadioListItem,
  Selector,
  TextArea,
  TextInput,
} from "@astryxdesign/core";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Boxes,
  Eye,
} from "lucide-react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { CompatibilityReport } from "@/ui/components/onboarding/CompatibilityReport";
import { MediaSourceFields } from "@/ui/components/onboarding/MediaSourceFields";
import {
  UNMAPPED_OPTION_VALUE,
  blockingIssues,
  columnOptions,
  isRequiredField,
  issueForField,
  priceConfirmationKey,
  priceLikeCaptionAssignments,
  warningIssues,
  stockPolicyFormFromStored,
  toStockPolicy,
  validateFieldMapValues,
  type StockPolicyFormState,
} from "@/ui/components/onboarding/field-map-form";
import {
  blockingMediaIssues,
  mediaProfileFormFromStored,
  toMediaProfile,
  validateMediaProfileForm,
  type MediaProfileFormState,
} from "@/ui/components/onboarding/media-profile-form";
import { useProfilePreview } from "@/ui/hooks/useCatalogMapping";
import {
  CATALOG_CONTENT_FIELDS,
  CATALOG_FIELDS,
  CATALOG_FIELD_HINTS,
  CATALOG_FIELD_LABELS,
  CONFIDENCE_LABELS,
  STOCK_POLICY_HINTS,
  STOCK_POLICY_LABELS,
  STOCK_POLICY_MODES,
  confidenceBand,
  type CatalogField,
  type CatalogFieldMap,
  type CatalogProfileReport,
  type FieldSuggestion,
  type MediaProfileConfig,
  type StockPolicy,
  type StockPolicyMode,
} from "@/ui/schemas/catalog-mapping.schema";

export function FieldMapForm({
  report,
  storedFieldMap,
  storedStockPolicy,
  storedMediaProfile,
  isSaving,
  saveError,
  readOnlyReason,
  onDirtyChange,
  onSave,
  onBack,
  onNext,
}: {
  report: CatalogProfileReport;
  storedFieldMap: CatalogFieldMap | null;
  storedStockPolicy: StockPolicy | null;
  storedMediaProfile: MediaProfileConfig | null;
  isSaving: boolean;
  saveError: unknown;
  readOnlyReason: string | null;
  onDirtyChange: (isDirty: boolean) => void;
  onSave: (payload: {
    fieldMap: CatalogFieldMap;
    stockPolicy: StockPolicy;
    mediaProfile: MediaProfileConfig;
  }) => void;
  onBack?: () => void;
  onNext?: () => void;
}) {
  const columns = report.sheet.columns;
  const suggestions = report.fieldMap.fields;
  const hasStoredMap = storedFieldMap !== null;

  const [values, setValues] = useState<CatalogFieldMap>(
    () => storedFieldMap ?? report.fieldMap.fieldMap,
  );
  const [stockForm, setStockForm] = useState<StockPolicyFormState>(() =>
    stockPolicyFormFromStored(storedStockPolicy),
  );
  const [mediaForm, setMediaForm] = useState<MediaProfileFormState>(() =>
    mediaProfileFormFromStored(
      storedMediaProfile,
      storedFieldMap?.mediaLink ?? null,
      report.mediaProfileSuggestion,
    ),
  );

  const [activeTab, setActiveTab] = useState<"mapping" | "stock" | "media">("mapping");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const isReadOnly = readOnlyReason !== null;
  const hasColumns = columns.length > 0;
  const preview = useProfilePreview();

  const mapIssues = useMemo(() => validateFieldMapValues(values, columns), [values, columns]);
  const blockers = useMemo(() => blockingIssues(mapIssues), [mapIssues]);
  const warnings = useMemo(() => warningIssues(mapIssues), [mapIssues]);

  const priceAssignments = useMemo(() => priceLikeCaptionAssignments(values), [values]);
  const priceKey = useMemo(() => priceConfirmationKey(priceAssignments), [priceAssignments]);
  const [confirmedPriceKey, setConfirmedPriceKey] = useState<string | null>(null);
  const isPriceConfirmed = priceAssignments.length === 0 || confirmedPriceKey === priceKey;

  const stockResult = useMemo(() => toStockPolicy(stockForm), [stockForm]);
  const stockIssues = stockResult.ok ? [] : stockResult.issues;

  const mediaIssues = useMemo(
    () => validateMediaProfileForm(mediaForm, columns, values),
    [mediaForm, columns, values],
  );
  const mediaBlockers = useMemo(() => blockingMediaIssues(mediaIssues), [mediaIssues]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty || isSaving) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isSaving]);

  function setField(field: (typeof CATALOG_FIELDS)[number], next: string | null) {
    setIsDirty(true);
    setValues((current) => ({
      ...current,
      [field]: next === null || next === UNMAPPED_OPTION_VALUE ? null : next,
    }));
  }

  function setStock(patch: Partial<StockPolicyFormState>) {
    setIsDirty(true);
    setStockForm((current) => ({ ...current, ...patch }));
  }

  function setMedia(patch: Partial<MediaProfileFormState>) {
    setIsDirty(true);
    setMediaForm((current) => ({ ...current, ...patch }));
  }

  function autoApplySuggestions() {
    setIsDirty(true);
    const updated = { ...values };
    for (const entry of suggestions) {
      if (entry.column && columns.includes(entry.column)) {
        updated[entry.field] = entry.column;
      }
    }
    setValues(updated);
  }

  function resetToStored() {
    setIsDirty(false);
    setValues(storedFieldMap ?? report.fieldMap.fieldMap);
    setStockForm(stockPolicyFormFromStored(storedStockPolicy));
    setMediaForm(
      mediaProfileFormFromStored(
        storedMediaProfile,
        storedFieldMap?.mediaLink ?? null,
        report.mediaProfileSuggestion,
      ),
    );
  }

  function buildPayload(policy: StockPolicy) {
    return {
      fieldMap: { ...values, mediaLink: mediaForm.mediaLinkColumn },
      stockPolicy: policy,
      mediaProfile: toMediaProfile(mediaForm, storedMediaProfile),
    };
  }

  function runPreview() {
    setHasSubmitted(true);
    if (!hasColumns) return;
    if (blockers.length > 0 || mediaBlockers.length > 0 || !stockResult.ok) return;
    preview.mutate(buildPayload(stockResult.policy));
  }

  function submit() {
    setHasSubmitted(true);
    if (!hasColumns) return;
    if (blockers.length > 0 || mediaBlockers.length > 0 || !stockResult.ok) return;
    if (!isPriceConfirmed) return;
    onSave(buildPayload(stockResult.policy));
    setIsDirty(false);
  }

  const showIssues = hasSubmitted;
  const previewReport = preview.data?.state === "profiled" ? preview.data.report : null;

  // Stats calculation
  const mappedCount = CATALOG_FIELDS.filter((f) => Boolean(values[f])).length;
  const requiredMapped = Boolean(values.code) && Boolean(values.name);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner Status */}
      {hasStoredMap ? (
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="text-success-foreground size-4 shrink-0" aria-hidden="true" />
            <span className="text-foreground text-sm font-medium">
              Đang hiển thị cấu hình ánh xạ đã lưu của đơn vị này.
            </span>
          </div>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {mappedCount}/8 trường đã gán
          </span>
        </div>
      ) : (
        <Banner
          status="info"
          title="Đơn vị chưa lưu ánh xạ — hệ thống đã tự động gợi ý theo tên cột"
          description="Kiểm tra các cột đã chọn bên dưới, điều chỉnh nếu cần rồi bấm “Lưu ánh xạ”. Hệ thống sẽ ghi nhớ vĩnh viễn cho mọi lần đồng bộ sau."
        />
      )}

      <ReadOnlyNotice reason={readOnlyReason} />

      {/* Errors on Submit */}
      {showIssues && blockers.length + mediaBlockers.length > 0 ? (
        <Banner
          status="error"
          title={`Chưa thể lưu: Cần sửa ${blockers.length + mediaBlockers.length} mục bên dưới`}
          description="Vui lòng kiểm tra các ô có đánh dấu lỗi màu đỏ để hoàn tất."
          role="alert"
        />
      ) : null}

      {/* Price Safety Warning Gate */}
      {warnings.length > 0 ? (
        <div className="border-warning/30 bg-warning/10 rounded-xl border p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-warning-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-2">
              <h4 className="text-warning-foreground text-sm font-semibold">
                Phát hiện cột có vẻ là GIÁ TIỀN đang gán vào trường Caption
              </h4>
              <p className="text-foreground text-sm leading-relaxed">
                {warnings.map((issue) => issue.message).join(" ")}
              </p>
              <div className="mt-1">
                <CheckboxInput
                  label="Tôi xác nhận các cột này KHÔNG chứa giá bán / giá buôn bí mật"
                  description={`Xác nhận cho: ${priceAssignments
                    .map((entry) => `“${entry.column}” → ${CATALOG_FIELD_LABELS[entry.field]}`)
                    .join(" · ")}. Nội dung sẽ hiện công khai trong bài đăng.`}
                  value={isPriceConfirmed}
                  isDisabled={isReadOnly || isSaving}
                  disabledMessage={readOnlyReason ?? undefined}
                  onChange={(checked) => setConfirmedPriceKey(checked ? priceKey : null)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Navigation Tabs Header */}
      <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="overflow-x-auto pb-1 sm:pb-0">
          <div className="border-border bg-sidebar inline-flex min-w-max items-center gap-1 rounded-lg border p-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("mapping")}
              className={`focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                activeTab === "mapping"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground active:bg-muted"
              }`}
            >
              <Layers className="size-4 shrink-0" aria-hidden="true" />
              <span>1. Ánh xạ cột</span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-xs font-medium ${
                  requiredMapped
                    ? "bg-success/15 text-success-foreground"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {mappedCount}/8
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("stock")}
              className={`focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                activeTab === "stock"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground active:bg-muted"
              }`}
            >
              <Boxes className="size-4 shrink-0" aria-hidden="true" />
              <span>2. Quy tắc tồn kho</span>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                {STOCK_POLICY_LABELS[stockForm.mode]}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("media")}
              className={`focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                activeTab === "media"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground active:bg-muted"
              }`}
            >
              <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
              <span>3. Nguồn ảnh Drive</span>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        {activeTab === "mapping" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              label="Tự động khớp theo gợi ý"
              onClick={autoApplySuggestions}
            />
            <Button
              variant="ghost"
              size="sm"
              label="Đặt lại ban đầu"
              onClick={resetToStored}
            />
          </div>
        )}
      </div>

      {/* TAB 1: COLUMN MAPPING */}
      {activeTab === "mapping" && (
        <div className="flex flex-col gap-6">
          {columns.length === 0 ? (
            <Banner
              status="error"
              title="Chưa đọc được dòng tiêu đề của bảng tính"
              description="Không có cột nào để chọn. Kiểm tra lại tên tab và quyền chia sẻ ở bước 1 “Nguồn dữ liệu”, rồi chạy lại báo cáo."
            />
          ) : (
            <div className="flex flex-col gap-6">
              {/* Group 1: Required Fields */}
              <div className="border-ring/30 bg-accent/30 flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                      Bắt buộc
                    </span>
                    <h3 className="text-foreground text-base font-semibold">
                      Hai trường nhận diện chính của sản phẩm
                    </h3>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Bắt buộc phải chọn đúng cột trên bảng của bạn — nếu thiếu 1 trong 2 trường này,
                    hệ thống không thể tạo bài đăng.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
                  <FieldCard
                    field="code"
                    values={values}
                    columns={columns}
                    suggestions={suggestions}
                    hasStoredMap={hasStoredMap}
                    showIssues={showIssues}
                    blockers={blockers}
                    warnings={warnings}
                    isReadOnly={isReadOnly}
                    isSaving={isSaving}
                    readOnlyReason={readOnlyReason}
                    onChange={(next) => setField("code", next)}
                  />
                  <FieldCard
                    field="name"
                    values={values}
                    columns={columns}
                    suggestions={suggestions}
                    hasStoredMap={hasStoredMap}
                    showIssues={showIssues}
                    blockers={blockers}
                    warnings={warnings}
                    isReadOnly={isReadOnly}
                    isSaving={isSaving}
                    readOnlyReason={readOnlyReason}
                    onChange={(next) => setField("name", next)}
                  />
                </div>
              </div>

              {/* Group 2: Content & Details */}
              <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-foreground text-base font-semibold">
                    Các trường thông tin bổ trợ (Tùy chọn)
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Nếu bảng tính của bạn có những cột này, hãy chọn tương ứng để bài đăng có đầy đủ
                    mô tả, màu sắc và kiểm tra tồn kho.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
                  {(["stock", "description", "category", "season", "colors", "note"] as const).map(
                    (field) => (
                      <FieldCard
                        key={field}
                        field={field}
                        values={values}
                        columns={columns}
                        suggestions={suggestions}
                        hasStoredMap={hasStoredMap}
                        showIssues={showIssues}
                        blockers={blockers}
                        warnings={warnings}
                        isReadOnly={isReadOnly}
                        isSaving={isSaving}
                        readOnlyReason={readOnlyReason}
                        onChange={(next) => setField(field, next)}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STOCK POLICY */}
      {activeTab === "stock" && (
        <div className="border-border bg-card flex flex-col gap-5 rounded-xl border p-5 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-foreground text-lg font-semibold">Cách đọc ô tồn kho</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Hệ thống kiểm tồn hai lần cho mỗi bài: lúc soạn bài và ngay trước khi đăng. Hãy chọn
              cách đọc đúng với bảng tính của bạn để tránh bài bị chặn nhầm.
            </p>
          </div>

          <RadioList
            label="Chọn chế độ kiểm tra tồn kho"
            value={stockForm.mode}
            onChange={(next) => setStock({ mode: next as StockPolicyMode })}
            isDisabled={isReadOnly || isSaving}
            disabledMessage={readOnlyReason ?? undefined}
          >
            {STOCK_POLICY_MODES.map((mode) => (
              <RadioListItem
                key={mode}
                value={mode}
                label={STOCK_POLICY_LABELS[mode]}
                description={STOCK_POLICY_HINTS[mode]}
              />
            ))}
          </RadioList>

          {stockForm.mode === "textual" && (
            <div className="border-border bg-sidebar flex flex-col gap-4 rounded-xl border p-5">
              <TextInput
                label="Giá trị nghĩa là CÒN hàng"
                description="Cách nhau bằng dấu phẩy (không phân biệt hoa thường/dấu)."
                value={stockForm.inStockText}
                onChange={(next) => setStock({ inStockText: next })}
                isDisabled={isReadOnly || isSaving}
                placeholder="còn hàng, còn, sẵn hàng, sll"
                width="100%"
              />
              <TextInput
                label="Giá trị nghĩa là HẾT hàng"
                description="Giá trị không nằm trong hai danh sách sẽ bị CHẶN để an toàn."
                value={stockForm.outOfStockText}
                onChange={(next) => setStock({ outOfStockText: next })}
                isDisabled={isReadOnly || isSaving}
                placeholder="hết hàng, hết, tạm hết, ngừng bán"
                width="100%"
              />
            </div>
          )}

          {stockForm.mode === "disabled" && (
            <div className="border-destructive/30 bg-destructive/10 flex flex-col gap-3 rounded-xl border p-5">
              <Banner
                status="error"
                title="Cảnh báo: Bỏ chốt chặn theo số tồn kho"
                description="Ô tồn trống, bằng 0 hay không phải số sẽ KHÔNG chặn bài đăng. Ô Lưu ý “HẾT HÀNG” vẫn sẽ chặn. Bắt buộc nhập lý do bên dưới:"
              />
              <TextArea
                label="Vì sao đơn vị không cần kiểm tồn kho từ bảng tính?"
                description="Tối thiểu 10 ký tự. Lý do sẽ được lưu lại lịch sử vận hành."
                value={stockForm.disabledReason}
                onChange={(next) => setStock({ disabledReason: next })}
                isRequired
                rows={3}
                maxLength={500}
                isDisabled={isReadOnly || isSaving}
                placeholder="Ví dụ: Tồn kho quản lý trên phần mềm POS, bảng này chỉ phục vụ marketing đăng bài."
                width="100%"
              />
            </div>
          )}

          {showIssues && stockIssues.length > 0 ? (
            <Banner
              status="error"
              title="Chưa lưu được phần kiểm tồn"
              description={stockIssues.join(" ")}
            />
          ) : null}
        </div>
      )}

      {/* TAB 3: MEDIA SOURCE */}
      {activeTab === "media" && (
        <div className="border-border bg-card rounded-xl border p-5 sm:p-6">
          <MediaSourceFields
            report={report}
            storedKind={storedMediaProfile?.kind ?? null}
            state={mediaForm}
            issues={showIssues ? mediaIssues : mediaIssues.filter((issue) => issue.severity !== "error")}
            isDisabled={isReadOnly || isSaving}
            disabledMessage={readOnlyReason ?? undefined}
            onChange={setMedia}
          />
        </div>
      )}

      {/* Sticky Action Footer */}
      <div className="border-border bg-card/95 sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-md backdrop-blur-md sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          {onBack && (
            <Button
              variant="secondary"
              label="← Bước trước"
              onClick={onBack}
              isDisabled={isSaving}
            />
          )}

          <div className="flex flex-col">
            <span className="text-foreground text-sm font-medium">
              {isSaving
                ? "Đang lưu ánh xạ…"
                : isDirty
                  ? "Có thay đổi chưa lưu"
                  : "Cấu hình đã sẵn sàng"}
            </span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {mappedCount}/8 trường · {requiredMapped ? "Đủ trường bắt buộc" : "Thiếu trường bắt buộc"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            label={preview.isPending ? "Đang chạy thử…" : "Chạy thử kiểm tra số liệu"}
            isLoading={preview.isPending}
            isDisabled={preview.isPending || isSaving || !hasColumns}
            onClick={runPreview}
          />

          <Button
            variant="primary"
            label={isSaving ? "Đang lưu…" : "Lưu ánh xạ"}
            isLoading={isSaving}
            isDisabled={isReadOnly || isSaving || !hasColumns || !isPriceConfirmed || !requiredMapped}
            tooltip={
              readOnlyReason ??
              (!hasColumns
                ? "Chưa đọc được cột nào từ bảng tính."
                : !requiredMapped
                  ? "Cần chọn cột cho Mã sản phẩm và Tên sản phẩm trước."
                  : !isPriceConfirmed
                    ? "Vui lòng tích xác nhận cột giá ở cảnh báo phía trên."
                    : undefined)
            }
            onClick={submit}
          />

          {onNext && (
            <Button
              variant="ghost"
              label="Sang Báo cáo →"
              onClick={onNext}
            />
          )}
        </div>
      </div>

      {/* A disabled button that explains itself only in a tooltip is a dead end
          for touch and for a screen reader. The reason is written out here, in
          the flow, for the one gate the operator can clear from this screen. */}
      {!isPriceConfirmed ? (
        <p className="text-warning-foreground text-xs leading-relaxed font-medium">
          Chưa lưu được: cần tích xác nhận cột trông như cột giá ở phía trên.
        </p>
      ) : null}

      {saveError ? <ApiErrorNotice error={saveError} source="Lưu ánh xạ" /> : null}
      {preview.isError ? (
        <ApiErrorNotice
          error={preview.error}
          onRetry={runPreview}
          source="Báo cáo thử nghiệm"
        />
      ) : null}

      {/* Inline Preview Dry Run Results */}
      {previewReport && (
        <div className="border-ring/30 bg-accent/20 flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
          <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-2">
              <Eye className="text-accent-foreground size-5 shrink-0" aria-hidden="true" />
              <h3 className="text-foreground text-base font-semibold">
                Kết quả chạy thử với ánh xạ bạn đang chỉnh
              </h3>
            </div>
            <span className="text-muted-foreground font-mono text-xs">
              Bản xem trước · Chưa ghi đè vào hệ thống
            </span>
          </div>
          <CompatibilityReport report={previewReport} headingLevel={3} />
        </div>
      )}
    </div>
  );
}

function FieldCard({
  field,
  values,
  columns,
  suggestions,
  hasStoredMap,
  showIssues,
  blockers,
  warnings,
  isReadOnly,
  isSaving,
  readOnlyReason,
  onChange,
}: {
  field: CatalogField;
  values: CatalogFieldMap;
  columns: readonly string[];
  suggestions: readonly FieldSuggestion[];
  hasStoredMap: boolean;
  showIssues: boolean;
  blockers: readonly { field: CatalogField | null; severity: "error" | "warning"; message: string }[];
  warnings: readonly { field: CatalogField | null; severity: "error" | "warning"; message: string }[];
  isReadOnly: boolean;
  isSaving: boolean;
  readOnlyReason: string | null;
  onChange: (next: string | null) => void;
}) {
  const suggestion = suggestions.find((entry) => entry.field === field);
  const band = suggestion ? confidenceBand(suggestion) : "none";
  const issue =
    (showIssues ? issueForField(blockers, field) : null) ??
    issueForField(warnings, field);
  const isRequired = isRequiredField(field);
  const goesIntoCaption = CATALOG_CONTENT_FIELDS.includes(field);
  const currentValue = values[field];
  const isMapped = Boolean(currentValue);

  return (
    <div
      className={`flex flex-col justify-between gap-3 rounded-xl border p-5 transition-colors duration-150 ease-out ${
        issue
          ? "border-destructive/40 bg-destructive/10"
          : isMapped
            ? "border-border bg-card"
            : "border-border bg-sidebar border-dashed"
      }`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-semibold">
              {CATALOG_FIELD_LABELS[field]}
            </span>
            {isRequired ? (
              <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs font-medium">
                Bắt buộc
              </span>
            ) : (
              <span className="text-foreground-subtle text-xs">(Tùy chọn)</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {goesIntoCaption && (
              <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                Caption
              </span>
            )}
            {isMapped ? (
              <span className="text-success-foreground inline-flex items-center gap-1 text-xs font-medium">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Đã gán
              </span>
            ) : isRequired ? (
              <span className="text-destructive inline-flex items-center gap-1 text-xs font-medium">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                Chưa gán
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          {CATALOG_FIELD_HINTS[field]}
        </p>

        {!hasStoredMap && suggestion?.column && (
          <div className="text-muted-foreground flex items-center gap-1.5 pt-1 font-mono text-xs">
            <Sparkles className="text-accent-foreground size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Gợi ý: Cột “{suggestion.column}” ({CONFIDENCE_LABELS[band]})
            </span>
          </div>
        )}
      </div>

      <div className="pt-1">
        <Selector
          label=""
          options={columnOptions(field, columns, values)}
          value={values[field] ?? UNMAPPED_OPTION_VALUE}
          onChange={onChange}
          placeholder="Chọn cột trên bảng tính của bạn…"
          hasSearch={columns.length > 8}
          searchPlaceholder="Tìm tên cột…"
          isDisabled={isReadOnly || isSaving}
          disabledMessage={readOnlyReason ?? undefined}
          status={issue ? { type: issue.severity, message: issue.message } : undefined}
          statusVariant="detached"
          width="100%"
        />
      </div>
    </div>
  );
}
