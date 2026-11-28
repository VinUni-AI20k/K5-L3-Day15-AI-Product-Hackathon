import { CheckCircle2, Inbox, SearchX, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/utils";

/**
 * Empty state. `kind` exists to stop the classic mistake of showing the same
 * "Chưa có dữ liệu" for four different situations (core-feedback-states §Empty):
 * an operator who filtered nothing out must not think the data was lost.
 *
 * Presentational: the caller supplies the copy and the call to action.
 * Follows the design system pattern: icon tile + title/sentence + one clear action.
 */
export type EmptyKind = "first-run" | "no-result" | "done" | "idle";
export type EmptyHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

function DefaultEmptyIcon({ kind }: { kind: EmptyKind }) {
  switch (kind) {
    case "first-run":
      return <Sparkles className="size-5" aria-hidden="true" />;
    case "no-result":
      return <SearchX className="size-5" aria-hidden="true" />;
    case "done":
      return <CheckCircle2 className="size-5" aria-hidden="true" />;
    case "idle":
      return <Inbox className="size-5" aria-hidden="true" />;
  }
}

export function EmptyState({
  kind,
  title,
  description,
  action,
  icon,
  headingLevel,
  className,
}: {
  kind: EmptyKind;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  /** Optional Lucide icon override; defaults to a semantic icon per `kind`. */
  icon?: ReactNode;
  /**
   * Optional semantic heading level (`h1`–`h6`) for the title so the empty
   * state stays in the document heading outline without changing visual size.
   * Omit to render a plain `<p>`.
   */
  headingLevel?: EmptyHeadingLevel;
  className?: string;
}) {
  const iconTileTone =
    kind === "done"
      ? "bg-success/15 text-success-foreground"
      : "bg-accent text-accent-foreground";

  const TitleTag: "p" | `h${EmptyHeadingLevel}` = headingLevel ? `h${headingLevel}` : "p";

  return (
    <div
      data-empty-kind={kind}
      className={cn(
        "bg-sidebar border-border flex flex-col items-center justify-center rounded-xl border px-6 py-8 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-3 flex size-10 shrink-0 items-center justify-center rounded-lg",
          iconTileTone,
        )}
      >
        {icon ?? <DefaultEmptyIcon kind={kind} />}
      </div>
      <TitleTag className="text-foreground text-base leading-6 font-semibold">{title}</TitleTag>
      <div className="text-muted-foreground mt-1.5 max-w-prose text-sm leading-relaxed">
        {description}
      </div>
      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
