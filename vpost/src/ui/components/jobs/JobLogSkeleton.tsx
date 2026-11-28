/**
 * Skeleton with the SAME seven columns and row height as `JobLogTable`
 * (web-data-table rule 1: a mismatched skeleton is a layout shift).
 */
export function JobLogSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-card overflow-hidden rounded-xl border motion-safe:animate-pulse"
    >
      <div className="bg-muted/40 border-border h-11 border-b" />
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="border-border flex h-16 items-center gap-4 border-t px-4">
          <div className="bg-muted h-4 w-28 shrink-0 rounded" />
          <div className="bg-muted h-4 w-28 shrink-0 rounded" />
          <div className="bg-muted h-4 w-16 shrink-0 rounded" />
          <div className="bg-muted h-4 w-32 shrink-0 rounded" />
          <div className="bg-muted h-6 w-24 shrink-0 rounded-full" />
          <div className="bg-muted h-4 w-10 shrink-0 rounded" />
          <div className="bg-muted h-4 min-w-0 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}
