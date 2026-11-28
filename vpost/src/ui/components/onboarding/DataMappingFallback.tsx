import { Skeleton } from "@astryxdesign/core";

/**
 * What the page shows while `useSearchParams()` suspends (the screen reads the
 * step from the query string). Same blocks and heights as the real screen —
 * title, step rail, step body — so nothing jumps when it resolves (CLS = 0).
 *
 * `aria-hidden`: a screen reader has nothing to read in a grey box
 * (web-feedback-states rule 4).
 */
export function DataMappingFallback() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6"
    >
      <div className="border-border flex flex-col gap-2 border-b pb-5">
        <Skeleton height={32} width={260} />
        <Skeleton height={20} width="70%" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton height={108} />
        <Skeleton height={108} />
        <Skeleton height={108} />
      </div>
      <Skeleton height={260} />
    </div>
  );
}
