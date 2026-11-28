"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { cn } from "@/shared/utils";
import {
  applyChannelGroupSafe,
  avatarToneStyle,
  channelBlockReason,
  channelDropSentences,
  channelInitials,
  draftOnOpenChange,
  filterChannels,
  groupPayloadFrom,
  matchingGroupId,
  publishableChannels,
  selectAllVisible,
  toggleChannelId,
  visibleRows,
} from "@/ui/components/compose/channel-picker";
import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import { useChannelGroups, useCreateChannelGroup } from "@/ui/hooks/useChannelGroups";
import { useChannels } from "@/ui/hooks/useChannels";
import type { ChannelGroup } from "@/ui/schemas/channel-group.schema";

/**
 * "Chọn kênh đăng" — the modal of the ComposeFocus design (template 161–191).
 *
 * Structure, top to bottom, as the mock draws it:
 *   heading (163) · ô "Tìm page" (165) · NHÓM CÓ SẴN + pills + "+ Tạo nhóm"
 *   (166–172) · FACEBOOK · N page + "Chọn tất cả" (173–177) · rows with a
 *   square checkbox, a round initials avatar and the Page name (178–185) ·
 *   "Xem thêm N page" (186) · footer: "Đã chọn N page" · "Lưu thành nhóm" ·
 *   "Xong" (187–191).
 *
 * THE ONE BEHAVIOUR RULE: ticking in here is a DRAFT. Nothing reaches the post
 * until "Xong" is pressed, and Escape or a click outside leaves the previously
 * applied selection exactly as it was. A picker that wrote straight through
 * would mean closing the box by accident changes where a post goes.
 *
 * Radix Dialog does the parts a hand-rolled modal always gets wrong: focus in
 * on open, focus back to the trigger on close, `Esc`, `aria-modal`, and the
 * page behind made inert (core-accessibility).
 *
 * Pressing a group chip ADDS the group to what is ticked (`applyChannelGroup`)
 * instead of replacing it, so two groups can be pressed in a row and a Page
 * ticked by hand survives. A group that cannot be loaded at all does not block
 * the dialog: the row says so and the list underneath still works.
 *
 * The chips are dead until the CHANNEL list has arrived. A press resolves the
 * group against the Pages this tenant owns, so pressing one while that list is
 * empty-because-unknown would read every id as "gone" and empty the selection
 * — the opposite of what the chip promises.
 *
 * What the mock shows and this cannot: follower counts ("128K theo dõi", 184).
 * Nothing in this system stores them — see the handover note; the column shows
 * the channel's on/off state instead, which is a fact we do have and one that
 * decides whether the post can go out at all.
 */
export function ChannelPickerDialog({
  open,
  onOpenChange,
  applied,
  onApply,
  readOnlyReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selection currently on the post. */
  applied: ReadonlySet<string>;
  onApply: (channelIds: string[]) => void;
  /** Support mode: writing is off. Ticking still works, saving a group does not. */
  readOnlyReason?: string | null;
}) {
  const titleId = useId();
  const channels = useChannels();
  const groups = useChannelGroups();
  const createGroup = useCreateChannelGroup();

  const [draft, setDraft] = useState<ReadonlySet<string>>(applied);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Re-seeds the draft every time the modal opens. Adjusting state during
   * render (React's documented alternative to an effect): an effect would let
   * one frame of the previous draft show before it was reset.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setDraft(draftOnOpenChange({ open, wasOpen, applied, draft }));
    if (open) {
      setQuery("");
      setExpanded(false);
      setGroupName(null);
      setGroupError(null);
      setNotice(null);
      createGroup.reset();
    }
  }

  const all = publishableChannels(channels.data?.channels ?? []);
  const filtered = filterChannels(all, query);
  const { rows, hidden } = visibleRows(filtered, expanded);
  const groupItems = groups.data?.groups ?? [];
  const activeGroupId = matchingGroupId(groupItems, draft);
  /**
   * The Pages a group press may actually tick. A disabled Page is listed (so it
   * can explain itself) but cannot be published to, so `applyChannelGroup` is
   * given the publishable ids only and the row below counts what it left out.
   */
  const activeIds = all
    .filter((channel) => channelBlockReason(channel) === null)
    .map((channel) => channel.channelId);

  /**
   * Why the group chips are dead, as a SENTENCE ON SCREEN.
   *
   * It used to be a `title` on a disabled button: a disabled button takes no
   * pointer events in most browsers, so the tooltip never appeared, and it is
   * not focusable, so a keyboard or screen-reader user could not reach the
   * explanation at all. Three grey chips with no reason is a dead end
   * (core-accessibility: ẩn vs vô hiệu hoá — vô hiệu hoá thì phải kèm lý do
   * đọc được).
   */
  const groupsDisabledReason = channels.isPending
    ? "Đang đọc danh sách Page — chờ một chút rồi bấm nhóm."
    : channels.isError
      ? "Chưa đọc được danh sách Page, nên chưa biết nhóm này gồm những Page nào."
      : null;

  /**
   * A Page's name for a sentence, or `null` when there is no Page behind the id
   * any more. `null` is the point: the sentence COUNTS those instead of
   * printing an id nobody can look up.
   */
  const channelName = (channelId: string): string | null => {
    const found = all.find((channel) => channel.channelId === channelId);
    const name = found?.name?.trim();
    return name && name.length > 0 ? name : null;
  };

  /** One group press: union into the draft, then say what could not come. */
  function pressGroup(group: ChannelGroup) {
    const press = applyChannelGroupSafe({
      current: [...draft],
      groupChannelIds: group.channelIds,
      activeChannelIds: activeIds,
      listedChannelCount: all.length,
    });
    if (!press.ok) {
      // A press with no Page list would read every id as "gone" and wipe the
      // draft. The chips are disabled while the list is LOADING or FAILED, but
      // a tenant with zero Pages leaves them live — and a chip that does
      // nothing and says nothing is what this sentence replaces.
      setNotice("Chưa có Page nào để áp nhóm — kết nối Facebook ở màn Kênh trước.");
      return;
    }

    const next = press.next;
    // What the press could not keep, split by WHOSE it was. One count over both
    // would tell an operator their own tick was "một kênh của nhóm", which is
    // the wrong thing to go looking for.
    const fromGroup = group.channelIds.filter((id) => !next.includes(id));
    const alreadyTicked = [...draft].filter(
      (id) => !next.includes(id) && !group.channelIds.includes(id),
    );

    setDraft(new Set(next));
    setNotice(
      channelDropSentences({
        groupName: group.name,
        fromGroup,
        alreadyTicked,
        nameOf: channelName,
      }),
    );
  }

  function saveGroup() {
    // The server's own rules, checked locally with the SAME sentences so the
    // operator is never told two different things about one field.
    const payload = groupPayloadFrom(groupName ?? "", draft);
    if (!payload.ok) {
      setGroupError(payload.message);
      return;
    }
    setGroupError(null);
    createGroup.mutate(payload.value, {
      onSuccess: (group) => {
        setGroupName(null);
        setNotice(`Đã lưu ${group.channelCount} kênh thành nhóm “${group.name}”.`);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={titleId}
        /* `overflow-clip`, NOT `overflow-hidden`: `hidden` is a scroll
           container — it shows no scrollbar but still moves under the browser's
           own `scrollIntoView`, which is how ticking a Page used to scroll the
           whole frame off itself. `clip` creates no scroll container at all. */
        className="border-border bg-popover text-foreground max-w-160 gap-0 overflow-clip rounded-2xl border p-0 shadow-[var(--shadow-pop)]"
      >
        <div className="border-border border-b px-6 py-5">
          <DialogTitle id={titleId} className="text-lg font-semibold">
            Chọn kênh đăng
          </DialogTitle>
          <DialogDescription className="sr-only">
            Tick từng Page hoặc chọn một nhóm có sẵn. Lựa chọn chỉ áp vào bài khi bạn bấm “Xong”.
          </DialogDescription>
        </div>

        {/* `relative` is load-bearing: every row hides its checkbox with
            `sr-only`, which is `position: absolute`. Without a positioned
            ancestor here those inputs anchor to the fixed DialogContent
            instead, escape this box's clipping, and hand the dialog ~1500px of
            invisible scrollable overflow once "Xem thêm N page" is pressed.
            Clicking a row then focuses its hidden input and the browser scrolls
            THE DIALOG into view, leaving an empty card. */}
        <div className="relative flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-6 py-5">
          <label htmlFor={`${titleId}-q`} className="sr-only">
            Tìm page
          </label>
          <input
            id={`${titleId}-q`}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setExpanded(false);
            }}
            placeholder="Tìm page"
            className="border-input bg-card text-foreground placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-ring/40 h-11 rounded-lg border px-4 text-sm transition-colors duration-150 outline-none focus-visible:ring-2"
          />

          {/* --- Nhóm có sẵn (166–172) --------------------------------------- */}
          <section aria-labelledby={`${titleId}-groups`} className="flex flex-col gap-2.5">
            <h3 id={`${titleId}-groups`} className="text-foreground text-sm font-medium">
              Nhóm có sẵn
            </h3>

            {groups.isError ? (
              <ApiErrorNotice error={groups.error} onRetry={() => void groups.refetch()} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {groupItems.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    disabled={groupsDisabledReason !== null}
                    onClick={() => pressGroup(group)}
                    className={cn(
                      "focus-visible:ring-ring focus-visible:ring-offset-background h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                      group.id === activeGroupId
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
                    )}
                  >
                    {group.name}
                    <span className="sr-only">
                      {" "}
                      — thêm {group.channelCount} kênh vào lựa chọn
                      {group.id === activeGroupId ? "; đang chọn đúng nhóm này" : ""}
                    </span>
                  </button>
                ))}

                {groupItems.length === 0 && !groups.isPending ? (
                  <p className="text-muted-foreground text-sm">
                    Chưa có nhóm nào. Tick vài Page rồi bấm “Lưu thành nhóm” để dùng lại lần sau.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setGroupName(groupName === null ? "" : null);
                    setGroupError(null);
                  }}
                  aria-expanded={groupName !== null}
                  className="border-input bg-card text-muted-foreground hover:bg-[var(--bg-subtle)] hover:text-foreground focus-visible:ring-ring h-10 cursor-pointer rounded-full border border-dashed px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
                >
                  + Tạo nhóm
                </button>
              </div>
            )}

            {/* The reason the chips above are dead, where it can be read and
                heard — not in a `title` no disabled button ever shows. */}
            {groupsDisabledReason !== null && groupItems.length > 0 ? (
              <p className="text-muted-foreground text-sm">{groupsDisabledReason}</p>
            ) : null}

            {groupName !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor={`${titleId}-group-name`} className="sr-only">
                    Tên nhóm kênh mới
                  </label>
                  <input
                    id={`${titleId}-group-name`}
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Tên nhóm, ví dụ: Bộ 5 page chính"
                    aria-invalid={Boolean(groupError)}
                    className="border-input bg-card text-foreground placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-ring/40 h-10 min-w-56 flex-1 rounded-lg border px-3.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2"
                  />
                  <button
                    type="button"
                    onClick={saveGroup}
                    disabled={createGroup.isPending || Boolean(readOnlyReason)}
                    title={readOnlyReason ?? undefined}
                    className="border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring h-10 cursor-pointer rounded-lg border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {createGroup.isPending ? "Đang lưu…" : "Lưu nhóm"}
                  </button>
                </div>

                {groupError ? (
                  <p role="alert" className="text-destructive text-xs">
                    {groupError}
                  </p>
                ) : null}
                {readOnlyReason ? (
                  <p className="text-muted-foreground text-xs">{readOnlyReason}</p>
                ) : null}
                {createGroup.isError ? <ApiErrorNotice error={createGroup.error} /> : null}
              </div>
            ) : null}
          </section>

          {/* --- Facebook · N page (173–186) --------------------------------- */}
          <section aria-labelledby={`${titleId}-list`} className="flex flex-col">
            <div className="flex items-center gap-3 pb-2.5">
              <h3 id={`${titleId}-list`} className="text-foreground text-sm font-medium">
                Facebook · {all.length} page
              </h3>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setDraft(selectAllVisible(draft, filtered))}
                disabled={filtered.length === 0}
                className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2 text-sm font-medium transition-colors duration-150 outline-none hover:underline focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Chọn tất cả
              </button>
            </div>

            {channels.isPending ? (
              <ul aria-hidden="true" className="flex flex-col motion-safe:animate-pulse">
                {[0, 1, 2].map((row) => (
                  <li key={row} className="flex h-15 items-center gap-3.5">
                    <span className="bg-muted size-5 rounded-sm" />
                    <span className="bg-muted size-9 rounded-full" />
                    <span className="bg-muted h-4 w-40 rounded" />
                  </li>
                ))}
              </ul>
            ) : channels.isError ? (
              <ApiErrorNotice error={channels.error} onRetry={() => void channels.refetch()} />
            ) : all.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-4">
                <p className="text-foreground text-sm font-medium">Chưa có Page nào</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Bài đăng cần ít nhất một kênh. Kết nối Facebook ở màn Kênh — chỉ làm một lần.
                </p>
                <Link
                  href="/channels"
                  className="text-accent-foreground text-sm font-medium underline underline-offset-4"
                >
                  Mở màn Kênh
                </Link>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">
                Không có Page nào khớp “{query.trim()}”. Xoá bớt từ khoá để xem lại danh sách.
              </p>
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {rows.map((channel) => {
                  const blocked = channelBlockReason(channel);
                  const checked = draft.has(channel.channelId);

                  return (
                    <li key={channel.channelId}>
                      <label
                        className={cn(
                          "flex min-h-15 items-center gap-3.5 rounded-lg px-2 py-2 transition-colors duration-150",
                          blocked
                            ? "cursor-not-allowed opacity-50"
                            : "hover:bg-[var(--bg-subtle)] cursor-pointer",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={checked}
                          disabled={Boolean(blocked)}
                          onChange={(event) =>
                            setDraft((current) =>
                              toggleChannelId(current, channel.channelId, event.target.checked),
                            )
                          }
                        />
                        {/* Drawn box for the sr-only input immediately before it:
                            the native control keeps the role and the keyboard. */}
                        <span
                          aria-hidden="true"
                          className="border-input bg-card peer-checked:border-ring peer-checked:bg-ring peer-checked:text-primary-foreground peer-focus-visible:ring-ring flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-checked:[&>svg]:block"
                        >
                          <Check aria-hidden="true" className="hidden size-3.5" strokeWidth={3} />
                        </span>

                        <span
                          aria-hidden="true"
                          style={avatarToneStyle(channel.name)}
                          className="text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        >
                          {channelInitials(channel.name)}
                        </span>

                        <span className="flex min-w-0 flex-col">
                          <span className="text-foreground truncate text-sm font-medium">
                            {channel.name.trim().length > 0
                              ? channel.name
                              : "(Page chưa có tên)"}
                          </span>
                          {blocked ? (
                            <span className="text-warning-foreground text-xs">{blocked}</span>
                          ) : null}
                        </span>

                        <span className="flex-1" />
                        <span className="text-foreground-subtle shrink-0 text-xs">
                          {channel.status === "active" ? "Đang bật" : "Đã tắt"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {hidden > 0 || expanded ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-accent-foreground focus-visible:ring-ring mt-2 inline-flex min-h-10 cursor-pointer items-center self-start rounded-lg px-2 text-sm font-medium transition-colors duration-150 outline-none hover:underline focus-visible:ring-2"
              >
                {expanded ? "Thu gọn danh sách" : `Xem thêm ${hidden} page`}
              </button>
            ) : null}
          </section>

          {notice ? (
            <p role="status" className="text-muted-foreground text-xs">
              {notice}
            </p>
          ) : null}
        </div>

        {/* --- Footer (187–191) --------------------------------------------- */}
        <div className="border-border bg-[var(--bg-subtle)] flex flex-wrap items-center gap-3 border-t px-6 py-4">
          <p className="text-muted-foreground text-sm">Đã chọn {draft.size} page</p>
          <span className="flex-1" />

          <button
            type="button"
            onClick={() => {
              setGroupName((current) => (current === null ? "" : current));
              setGroupError(null);
            }}
            disabled={draft.size === 0 || Boolean(readOnlyReason)}
            title={readOnlyReason ?? undefined}
            className="border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background h-11 cursor-pointer rounded-lg border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Lưu thành nhóm
          </button>

          <button
            type="button"
            onClick={() => {
              onApply([...draft]);
              onOpenChange(false);
            }}
            className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-background h-11 cursor-pointer rounded-lg px-6 text-sm font-medium shadow-[var(--shadow-button)] transition-colors duration-150 outline-none hover:bg-[var(--button-primary-hover-bg)] focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-[var(--button-primary-pressed-bg)]"
          >
            Xong
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

