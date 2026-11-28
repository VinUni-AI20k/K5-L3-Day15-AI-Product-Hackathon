"use client";

import Link from "next/link";

import { TableScrollRegion } from "@/ui/components/posts/TableScrollRegion";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Textarea } from "@/ui/components/ui/textarea";
import type { BulkRunRow } from "@/ui/hooks/useBulkRun";
import {
  BULK_ROW_STATUS_LABELS,
  BULK_ROW_STATUS_TONES,
} from "@/ui/schemas/bulk.schema";

/**
 * Per-code progress of a bulk run (E10.5).
 *
 * One row per code, updated as the loop walks the list — a spinner over the
 * whole thing would hide exactly the information that matters: WHICH code was
 * skipped and WHY (core-bulk-actions §Thất bại một phần).
 *
 * Status is a dye + its NAME, never the dye alone (The Named Status Rule): the
 * tone mapping lives in `bulk.schema` beside the labels, so a status can never
 * gain a colour without gaining a word.
 *
 * Business rule 2: this table shows the product code and name, the outcome and
 * a link to the batch. Never stock, never price — the reason sentence comes
 * from the server and is written for operators.
 *
 * Presentational: no fetching, no business branching.
 */
/** VPOST: thao tác duyệt trên dòng "Chờ duyệt". Không truyền = bảng chỉ đọc như cũ. */
export interface BulkReviewActions {
  disabled: boolean;
  onEditCaption: (index: number, caption: string) => void;
  onApprove: (index: number, approved: boolean) => void;
  onReject: (index: number) => void;
}

function ReviewCell({ row, review }: { row: BulkRunRow; review: BulkReviewActions }) {
  return (
    <span className="flex flex-col gap-2.5">
      {row.media.length > 0 ? (
        <span className="flex flex-wrap gap-2">
          {row.media.slice(0, 4).map((m) => (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài (Drive), không qua next/image
            <img
              key={m.driveFileId}
              src={m.driveFileId}
              alt={m.fileName ?? "Ảnh sản phẩm"}
              className="border-border size-14 rounded-lg border object-cover"
            />
          ))}
        </span>
      ) : null}
      <Textarea
        aria-label={`Bài đăng của mã ${row.code}`}
        value={row.caption ?? ""}
        disabled={review.disabled}
        onChange={(event) => review.onEditCaption(row.index, event.target.value)}
        className="min-h-32 rounded-lg text-sm leading-relaxed"
      />
      <span className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={row.approved ? "default" : "secondary"}
          aria-pressed={row.approved}
          disabled={review.disabled || !row.caption?.trim()}
          onClick={() => review.onApprove(row.index, !row.approved)}
          className="min-h-9 px-3"
        >
          {row.approved ? "Đã duyệt" : "Duyệt bài này"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={review.disabled}
          onClick={() => review.onReject(row.index)}
          className="min-h-9 px-3"
        >
          Bỏ bài
        </Button>
      </span>
    </span>
  );
}

export function BulkProgressTable({
  rows,
  review,
}: {
  rows: readonly BulkRunRow[];
  review?: BulkReviewActions;
}) {
  return (
    <TableScrollRegion aria-label="Bảng tiến độ chạy hàng loạt, cuộn ngang được">
      <table className="w-full min-w-160 border-collapse text-sm">
        <caption className="sr-only">
          Tiến độ chạy hàng loạt: trạng thái từng mã sản phẩm và lô đăng đã tạo
        </caption>
        {/* Declared widths, not content-driven ones: every cell of this table
            fills in WHILE the run walks the list, and columns that resize on
            each row would make the whole table twitch (web-data-table §1). */}
        <colgroup>
          <col className="w-12" />
          <col className="w-32" />
          <col className="w-32" />
          <col className="w-32" />
          <col className="w-auto" />
          <col className="w-36" />
        </colgroup>
        <thead className="border-border bg-sidebar text-muted-foreground border-b text-xs font-medium">
          <tr className="text-left">
            <th scope="col" className="px-3 py-3 whitespace-nowrap">
              #
            </th>
            <th scope="col" className="px-3 py-3 whitespace-nowrap">
              Mã sản phẩm
            </th>
            <th scope="col" className="px-3 py-3 whitespace-nowrap">
              Sản phẩm
            </th>
            <th scope="col" className="px-3 py-3 whitespace-nowrap">
              Trạng thái
            </th>
            <th scope="col" className="px-3 py-3 whitespace-nowrap">
              Lý do / ghi chú
            </th>
            <th scope="col" className="px-3 py-3 whitespace-nowrap">
              Lô đăng
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row, index) => (
            <tr
              key={`${row.code}-${index}`}
              className="border-border hover:bg-sidebar/70 border-t align-top transition-colors duration-150"
            >
              <td className="text-foreground-subtle px-3 py-3 font-mono text-xs tabular-nums">
                {index + 1}
              </td>
              {/* The Mono Ledger Rule, and nowrap: a product code broken across
                  two lines is a different string to the eye reading it back to
                  the Sheet. */}
              <td className="text-foreground px-3 py-3 font-mono text-sm font-semibold whitespace-nowrap">
                {row.code}
              </td>
              <td className="text-foreground px-3 py-3 text-sm font-medium">
                {row.productName ?? "—"}
              </td>
              <td className="px-3 py-3">
                <Badge tone={BULK_ROW_STATUS_TONES[row.status]}>
                  {BULK_ROW_STATUS_LABELS[row.status]}
                </Badge>
              </td>
              <td className="px-3 py-3 text-sm">
                {review && row.status === "review" ? <ReviewCell row={row} review={review} /> : null}
                {row.reason ? (
                  <span className="text-foreground max-w-prose leading-relaxed break-words">
                    {row.reason}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {row.errorCode ? (
                  <span className="text-foreground-subtle mt-1 block font-mono text-xs">
                    Mã lỗi: {row.errorCode}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-sm">
                {row.batchId ? (
                  <Link
                    href={`/batches/${encodeURIComponent(row.batchId)}`}
                    className="text-accent-foreground focus-visible:ring-ring rounded-sm font-medium underline underline-offset-4 transition-opacity duration-150 outline-none hover:opacity-80 focus-visible:ring-2"
                  >
                    Xem lô ({row.channelCount} kênh)
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScrollRegion>
  );
}
