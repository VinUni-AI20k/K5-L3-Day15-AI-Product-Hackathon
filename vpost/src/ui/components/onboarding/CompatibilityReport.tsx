"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  FileSpreadsheet,
  TrendingDown,
} from "lucide-react";

import { StockCheckSkippedBanner } from "@/ui/components/inventory/StockCheckSkippedBanner";
import { headlineNumber, profileFunnel } from "@/ui/components/onboarding/profile-funnel";
import {
  CATALOG_FIELD_LABELS,
  formatPercent,
  type CatalogProfileReport,
} from "@/ui/schemas/catalog-mapping.schema";

export function CompatibilityReport({
  report,
  headingLevel = 2,
}: {
  report: CatalogProfileReport;
  headingLevel?: 2 | 3;
}) {
  // The card titles below are the report's TOP heading level — it renders no
  // heading of its own — so they follow what the host screen declares instead of
  // being nailed to h3. Wrong nesting is invisible on screen and breaks heading
  // navigation for a screen reader.
  const CardHeading = headingLevel === 2 ? "h2" : "h3";

  const headline = headlineNumber(report);
  const stages = profileFunnel(report);
  const mapIssues = report.fieldMap.issues;

  const totalProducts = report.sheet.productsParsed || report.sheet.totalRows || 0;
  const postableCount = headline.value ?? 0;
  const postableRate = totalProducts > 0 ? Math.round((postableCount / totalProducts) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Hero Stat Headline Card */}
      <div className="border-border bg-card relative overflow-hidden rounded-xl border p-5 sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm font-medium">
              Báo cáo tương thích dữ liệu
            </p>
            {headline.value !== null && (
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ${
                  postableRate >= 80
                    ? "bg-success/15 text-success-foreground"
                    : postableRate >= 40
                      ? "bg-warning/15 text-warning-foreground"
                      : "bg-destructive/10 text-destructive"
                }`}
              >
                Tỷ lệ sẵn sàng: {postableRate}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            {headline.value === null ? (
              <span className="text-muted-foreground text-2xl font-semibold">
                Chưa tính được số mã
              </span>
            ) : (
              <>
                <span className="text-foreground font-mono text-4xl font-semibold tabular-nums md:text-5xl">
                  {headline.value.toLocaleString("vi-VN")}
                </span>
                <span className="text-muted-foreground text-base">
                  mã hợp lệ sẵn sàng đăng ngay trên{" "}
                  <strong className="text-foreground font-mono font-semibold">
                    {report.sheet.productsParsed.toLocaleString("vi-VN")}
                  </strong>{" "}
                  mã đọc được từ bảng tính
                </span>
              </>
            )}
          </div>

          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {headline.unavailableReason ??
              (headline.stockCheckSkipped
                ? "Số mã có đủ dữ liệu trên bảng và tìm thấy ảnh trên Drive. Bạn đang tắt kiểm tồn nên số lượng tồn chưa được trừ — kết quả này có thể cao hơn thực tế."
                : "Số mã có đầy đủ tên, mã sản phẩm, vượt qua kiểm tra tồn kho và đã tìm thấy ảnh tương ứng trên Google Drive.")}
          </p>
        </div>
      </div>

      {headline.stockCheckSkipped ? <StockCheckSkippedBanner reason={null} /> : null}

      {/* 2. Visual Pipeline / Funnel */}
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="text-accent-foreground size-4 shrink-0" aria-hidden="true" />
            <CardHeading className="text-foreground text-base font-semibold">
              Quy trình lọc dữ liệu (Vì sao chỉ ngần này mã)
            </CardHeading>
          </div>
          <span className="text-foreground-subtle text-xs">Phân tích từng giai đoạn</span>
        </div>

        <div className="divide-border flex flex-col divide-y">
          {stages.map((stage, idx) => (
            <div key={stage.key} className="flex flex-col gap-1.5 py-3.5 first:pt-1 last:pb-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
                    {idx + 1}
                  </span>
                  <span className="text-foreground text-sm font-medium">{stage.label}</span>
                </div>
                <span className="text-foreground font-mono text-base font-semibold tabular-nums">
                  {stage.value.toLocaleString("vi-VN")}
                </span>
              </div>

              {stage.loss ? (
                <div className="text-warning-foreground flex items-center gap-1.5 pl-8 text-xs">
                  <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>{stage.loss}</span>
                </div>
              ) : (
                <p className="text-muted-foreground pl-8 text-xs">
                  Không bị mất mã nào ở giai đoạn này.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Mapping Issues (if any) */}
      {mapIssues.length > 0 && (
        <div className="border-destructive/30 bg-destructive/10 flex flex-col gap-3 rounded-xl border p-5 sm:p-6">
          <div className="text-destructive flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>Cần kiểm tra lại ánh xạ cột</span>
          </div>
          <div className="flex flex-col gap-2">
            {mapIssues.map((issue) => (
              <div
                key={`${issue.code}-${issue.column ?? issue.fields.join(",")}`}
                className="border-destructive/20 bg-card flex flex-col gap-1 rounded-lg border p-3.5"
              >
                <span className="text-foreground text-sm font-semibold">
                  {issue.fields.map((field) => CATALOG_FIELD_LABELS[field]).join(" · ")}
                </span>
                <p className="text-muted-foreground text-xs leading-relaxed">{issue.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Top Issues To Fix */}
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <CardHeading className="text-foreground text-base font-semibold">
            Những việc cần xử lý nhất
          </CardHeading>
          <span className="text-foreground-subtle font-mono text-xs">
            {report.topIssues.length} nhóm vấn đề
          </span>
        </div>

        {report.topIssues.length === 0 ? (
          <div className="text-success-foreground flex items-center gap-2 py-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>Dữ liệu rất chuẩn! Không có lỗi nào đáng kể làm gián đoạn việc đăng bài.</span>
          </div>
        ) : (
          <div className="divide-border flex flex-col divide-y">
            {report.topIssues.map((issue) => (
              <div key={issue.reason} className="flex flex-col gap-1.5 py-3.5 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground text-sm font-medium">{issue.detail}</span>
                  <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums">
                    {issue.count} mã
                  </span>
                </div>
                {issue.examples.length > 0 && (
                  <p className="text-foreground-subtle font-mono text-xs">
                    Ví dụ các mã gặp lỗi: {issue.examples.join(", ")}
                    {issue.count > issue.examples.length ? " …" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Sheet & Column Inventory Facts */}
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="text-accent-foreground size-4 shrink-0" aria-hidden="true" />
            <CardHeading className="text-foreground text-base font-semibold">
              Thông tin bảng tính đã quét
            </CardHeading>
          </div>
          <span className="text-foreground-subtle font-mono text-xs">
            Tab “{report.sheetName}”
          </span>
        </div>

        <div className="text-muted-foreground flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            Đã đọc{" "}
            <strong className="text-foreground font-mono font-semibold">
              {report.sheet.columns.length} cột
            </strong>{" "}
            và{" "}
            <strong className="text-foreground font-mono font-semibold">
              {report.sheet.totalRows.toLocaleString("vi-VN")} dòng
            </strong>
            .
            {report.media
              ? ` Thư mục ảnh Drive: quét ${report.media.sampled} file${
                  report.media.capped ? " (lấy mẫu)" : ""
                }, tỷ lệ đọc được mã từ file đạt ${formatPercent(report.media.parseRate)}.`
              : " Chưa liên kết thư mục ảnh Drive."}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {report.sheet.columns.map((column) => (
              <span
                key={column}
                className="border-border bg-sidebar text-foreground rounded-md border px-2.5 py-1 font-mono text-xs"
              >
                {column}
              </span>
            ))}
          </div>

          {report.fieldMap.priceLikeColumns.length > 0 && (
            <p className="text-warning-foreground pt-1 text-xs">
              * Cột trông như giá và không đưa vào caption:{" "}
              {report.fieldMap.priceLikeColumns.join(", ")}
            </p>
          )}

          {report.sheet.conflictingCodes.length > 0 && (
            <p className="text-destructive pt-1 text-xs">
              * Có {report.sheet.conflictingCodes.length} mã bị trùng lặp mang dữ liệu mâu thuẫn:{" "}
              {report.sheet.conflictingCodes.slice(0, 5).join(", ")}
              {report.sheet.conflictingCodes.length > 5 ? "…" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
