"use client";

import type { UseFormRegisterReturn } from "react-hook-form";

import { Textarea } from "@/ui/components/ui/textarea";
import { MAX_BULK_CODES, type ParsedBulkCodes } from "@/ui/schemas/bulk.schema";

/**
 * The "dán mã vào đây" field (E10.5).
 *
 * It reports what the parser understood WHILE the operator types: how many
 * codes, which lines are not codes, how many repeats were dropped. A paste from
 * the Sheet that silently loses three rows is the failure mode this block
 * exists to prevent (core-bulk-actions: never silently drop a selection).
 *
 * Presentational: parsing happens in `ui/schemas/bulk.schema.ts`, the value is
 * owned by the form in the parent.
 */
export function BulkCodesField({
  id,
  registration,
  parsed,
  error,
  disabled,
}: {
  id: string;
  registration: UseFormRegisterReturn;
  parsed: ParsedBulkCodes;
  /** Message from the zod schema (empty, over limit, invalid lines). */
  error?: string;
  disabled?: boolean;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const summaryId = `${id}-summary`;
  const issuesId = `${id}-issues`;

  const describedBy = [
    hintId,
    summaryId,
    error ? errorId : null,
    parsed.invalid.length > 0 ? issuesId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const hasContent = parsed.codes.length > 0 || parsed.invalid.length > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-foreground text-sm font-medium">
          Mã sản phẩm cần đăng
        </label>
        {hasContent ? (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {parsed.codes.length}/{MAX_BULK_CODES} mã
          </span>
        ) : null}
      </div>

      <Textarea
        id={id}
        {...registration}
        rows={7}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        placeholder={"MGKVX6310\nMGKVX6311\nMGKVX6312"}
        className="rounded-lg font-mono text-sm leading-relaxed"
      />

      <p id={hintId} className="text-muted-foreground text-xs leading-relaxed">
        Mỗi dòng một mã, hoặc dán thẳng một cột từ Sheet. Nhiều mã trên cùng một dòng thì ngăn bằng
        dấu phẩy. Tối đa {MAX_BULK_CODES} mã mỗi lượt; mã trùng nhau chỉ chạy một lần.
      </p>

      {/* Accessible text summary for screen readers & quick scanning */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <p
          id={summaryId}
          role="status"
          aria-live="polite"
          className="text-muted-foreground text-xs tabular-nums"
        >
          Đã đọc được {parsed.codes.length} mã hợp lệ
          {parsed.duplicates > 0 ? ` · bỏ ${parsed.duplicates} mã trùng` : ""}
          {parsed.invalid.length > 0 ? ` · ${parsed.invalid.length} dòng chưa đúng` : ""}
          {parsed.overLimit.length > 0 ? ` · ${parsed.overLimit.length} mã vượt giới hạn` : ""}.
        </p>
      </div>

      {/* Parsed code chips preview for quick visual inspection */}
      {parsed.codes.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-foreground font-medium">
              Mã đã nhận diện ({parsed.codes.length}):
            </span>
            <span>Hiển thị tối đa 12 mã đầu</span>
          </div>
          <div className="border-border bg-sidebar flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-xl border p-3">
            {parsed.codes.slice(0, 12).map((item, idx) => (
              <span
                key={`${item.code}-${idx}`}
                className="border-border bg-card text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium"
              >
                <span className="text-foreground-subtle text-xs">#{idx + 1}</span>
                {item.code}
              </span>
            ))}
            {parsed.codes.length > 12 ? (
              <span className="text-muted-foreground self-center px-1.5 py-0.5 text-xs font-medium">
                +{parsed.codes.length - 12} mã khác…
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}

      {parsed.invalid.length > 0 ? (
        <div
          id={issuesId}
          className="border-warning/40 bg-warning/10 max-h-48 overflow-auto rounded-xl border p-3.5"
        >
          <p className="text-warning-foreground text-xs font-medium">
            Các dòng sau không phải mã sản phẩm:
          </p>
          <ul className="mt-1.5 space-y-1">
            {parsed.invalid.map((issue, index) => (
              <li key={`${issue.line}-${index}`} className="text-warning-foreground text-xs">
                <span className="font-medium tabular-nums">Dòng {issue.line}:</span>{" "}
                <span className="font-mono break-all">{issue.raw}</span> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {parsed.overLimit.length > 0 ? (
        <p role="alert" className="text-destructive text-xs font-medium">
          Vượt giới hạn {MAX_BULK_CODES} mã:{" "}
          <span className="font-mono">
            {parsed.overLimit.map((item) => item.code).join(", ")}
          </span>
          . Hãy bỏ bớt rồi chạy lượt sau.
        </p>
      ) : null}
    </div>
  );
}
