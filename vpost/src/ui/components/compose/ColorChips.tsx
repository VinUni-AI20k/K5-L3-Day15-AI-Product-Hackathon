"use client";

import { cn } from "@/shared/utils";
import { colorSwatch } from "@/ui/components/compose/color-swatch";

/**
 * "Màu đưa vào bài" — template lines 65–73: a 20px dot, the colour's name, and
 * a small badge, on a 46px chip.
 *
 * The list comes from the SERVER (`ComposeResponse.availableColors`), already
 * normalised by the data pipeline, so TRANG and TRẮNG arrive as ONE entry and
 * the operator never learns they were ever two (business rule: gộp biến thể).
 *
 * Buttons, not radios: picking a colour re-runs the whole lookup — Sheet, stock
 * gate, album — and a control that fires a request is an action, not a field.
 *
 * A chip the server has refused (`unavailable`) is dimmed and, when pressed,
 * repeats the server's own sentence instead of firing a lookup that is already
 * known to fail. It is NOT `disabled`: a disabled button cannot be focused, so
 * the reason would be unreachable by keyboard and invisible to a screen reader.
 * `aria-disabled` keeps it reachable and lets the press explain itself
 * (core-accessibility §5 — never colour alone, never a dead control).
 */
export function ColorChips({
  colors,
  active,
  albumCount,
  unavailable,
  pending,
  onPick,
  onRefused,
}: {
  colors: readonly string[];
  /** Empty string = "mọi màu có ảnh", the server's own default. */
  active: string;
  /** Photos in the album right now — the only per-colour count that is real. */
  albumCount: number;
  /** colour key → why the last lookup for it was refused. */
  unavailable: Readonly<Record<string, string>>;
  pending: boolean;
  onPick: (color: string) => void;
  /** Called with the reason when a refused chip is pressed. */
  onRefused: (reason: string) => void;
}) {
  if (colors.length === 0) return null;

  const activeKey = active.trim().toLowerCase();

  return (
    <section aria-labelledby="compose-color-heading" className="flex flex-col gap-2.5">
      <h3 id="compose-color-heading" className="text-foreground text-sm font-medium">
        Màu đưa vào bài
      </h3>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        <Chip
          name="Mọi màu có ảnh"
          swatch={null}
          badge={activeKey.length === 0 ? `${albumCount} ảnh` : "tự chọn"}
          selected={activeKey.length === 0}
          reason={null}
          pending={pending}
          onPick={() => onPick("")}
          onRefused={onRefused}
        />

        {colors.map((color) => {
          const key = color.trim().toLowerCase();
          const selected = activeKey === key;
          const reason = unavailable[key] ?? null;

          return (
            <Chip
              key={color}
              name={color}
              swatch={colorSwatch(color)}
              // The only honest per-colour number we have: how many photos the
              // album currently holds, and only while THIS colour is the one
              // composed. Everything else would be a count nobody measured.
              badge={reason ? "chưa có ảnh" : selected ? `${albumCount} ảnh` : "có ảnh"}
              selected={selected}
              reason={reason}
              pending={pending}
              onPick={() => onPick(color)}
              onRefused={onRefused}
            />
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Chọn một màu để tra lại mã và chỉ lấy ảnh của màu đó. Bỏ chọn để hệ thống tự lấy màu có
        nhiều ảnh nhất.
      </p>
    </section>
  );
}

function Chip({
  name,
  swatch,
  badge,
  selected,
  reason,
  pending,
  onPick,
  onRefused,
}: {
  name: string;
  swatch: string | null;
  badge: string;
  selected: boolean;
  reason: string | null;
  pending: boolean;
  onPick: () => void;
  onRefused: (reason: string) => void;
}) {
  const refused = reason !== null;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={refused || pending}
      onClick={() => {
        if (pending) return;
        if (refused) {
          onRefused(reason);
          return;
        }
        onPick();
      }}
      className={cn(
        "focus-visible:ring-ring focus-visible:ring-offset-background flex h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-full border px-3.5 whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        selected
          ? "border-ring bg-accent text-accent-foreground"
          : "border-border bg-card text-foreground hover:bg-[var(--bg-subtle)]",
        (refused || pending) && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        aria-hidden="true"
        style={swatch ? { background: swatch } : undefined}
        className={cn(
          "border-border flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          swatch ? "" : "bg-muted text-muted-foreground",
        )}
      >
        {/* No swatch = we do not know what this colour looks like. The initial
            is honest; an invented hex would not be. */}
        {swatch ? "" : name.trim().charAt(0).toUpperCase()}
      </span>

      <span className="text-foreground text-sm font-medium">{name}</span>

      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
        {badge}
      </span>

      {refused ? <span className="sr-only">— {reason}</span> : null}
    </button>
  );
}
