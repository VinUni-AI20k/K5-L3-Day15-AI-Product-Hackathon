"use client";

export function BatchStatusSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6 motion-safe:animate-pulse">
      {/* Top Card Skeleton */}
      <div className="border-border bg-card flex flex-col gap-5 rounded-xl border p-5 sm:p-6">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-2">
            <div className="bg-muted h-5 w-36 rounded-md" />
            <div className="bg-muted h-4 w-72 max-w-full rounded-md" />
          </div>
          <div className="bg-muted h-12 w-40 rounded-xl" />
        </div>

        {/* 6-cell Stat Tape Skeleton */}
        <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((cell) => (
            <div key={cell} className="bg-card flex h-20 flex-col justify-between p-3.5">
              <div className="bg-muted h-3.5 w-20 rounded" />
              <div className="bg-muted h-6 w-10 rounded" />
            </div>
          ))}
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
          <div className="bg-muted h-4 w-32 rounded" />
          <div className="bg-muted h-4 w-32 rounded" />
          <div className="bg-muted h-4 w-32 rounded" />
          <div className="bg-muted h-4 w-32 rounded" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bg-muted h-5 w-44 rounded-md" />
          <div className="bg-muted h-10 w-60 rounded-lg" />
        </div>

        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border bg-sidebar h-10 border-b" />
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="border-border flex items-center justify-between gap-4 border-b p-4 last:border-0"
            >
              <div className="bg-muted h-4 w-40 rounded" />
              <div className="bg-muted h-6 w-24 rounded-full" />
              <div className="bg-muted h-4 w-12 rounded" />
              <div className="bg-muted h-4 w-64 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
