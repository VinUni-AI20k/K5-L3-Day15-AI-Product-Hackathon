"use client";

import {
  Banner,
  Button,
  Divider,
  EmptyState,
  Heading,
  Stack,
  StackItem,
  Text,
} from "@astryxdesign/core";
import { Users } from "lucide-react";
import { useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { presentApiError, toApiError } from "@/ui/components/feedback/present-api-error";
import { InvitePanel } from "@/ui/components/members/InvitePanel";
import { MemberTable } from "@/ui/components/members/MemberTable";
import { MemberTableSkeleton } from "@/ui/components/members/MemberTableSkeleton";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useActiveTenant, useMe } from "@/ui/hooks/useMe";
import { useMembers, useRemoveMember, useUpdateMemberRole } from "@/ui/hooks/useMembers";
import { MEMBERSHIP_ROLE_LABELS, type MembershipRole } from "@/ui/schemas/me.schema";
import { canManageMembers, memberDisplayName, type Member } from "@/ui/schemas/member.schema";
import type { SetPasswordAction } from "@/ui/schemas/password-auth.schema";
import { canAdministerPlatform } from "@/ui/schemas/platform.schema";

/**
 * "Danh sách thành viên" (M2.3): who is in this company and what they may do.
 *
 * Since the wave-1 IA this is a PANEL of the "Thành viên" hub
 * (`/members?tab=members`), not a page of its own: the hub owns the frame, the
 * page's h1 and the tab strip, so this panel starts at h2 and its empty/error
 * boxes at h3 (core-accessibility §1 — one h1 per page, no level skipped).
 *
 * `showInvites` keeps the invite block where it has always been for any caller
 * that still wants one screen with both; the hub passes `false` because it
 * gives "Link mời" a tab of its own.
 *
 * The four mandatory states live in `MemberListBody`:
 *   loading — skeleton with the real columns, delayed 300ms
 *   data    — one row per member, actions behind a confirmation
 *   empty   — practically unreachable (you are always in your own company), so
 *             it reads as the diagnostic it would be, not as an invitation
 *   error   — 4xx (403 thiếu quyền) vs 5xx (thử lại), via `presentApiError`
 *
 * Everything the operator's own role forbids is disabled WITH ITS REASON in the
 * row; the server still decides, and its 403/409 lands in the notice above the
 * table (core-auth-session: quyền ở client là UX, không phải bảo mật).
 */
export function MembersScreen({
  /**
   * Whether this panel also renders the invite block. Default `true` so the
   * screen keeps working as one whole; the hub sets `false` and renders
   * `InvitePanel` in its own tab instead — the panel must never appear twice.
   */
  showInvites = true,
  resetPassword = null,
}: {
  showInvites?: boolean;
  /**
   * `setPasswordAction`, handed down from the page (`ui/` may not import
   * `@/app/*`). Default null so every existing caller keeps compiling and, more
   * importantly, keeps the button OFF unless it was explicitly given.
   */
  resetPassword?: SetPasswordAction | null;
} = {}) {
  const { role: actorRole, tenant, isResolved } = useActiveTenant();
  const me = useMe();
  const members = useMembers();
  const updateRole = useUpdateMemberRole();
  const remove = useRemoveMember();

  /** What the last write did — announced, and shown as a banner. */
  const [outcome, setOutcome] = useState<string | null>(null);

  const items = members.data?.items ?? [];
  const isFirstLoad = members.isPending && members.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);

  /**
   * The reset button belongs to the PLATFORM ladder, not the membership one: a
   * company owner is not allowed to set anybody's password, only VPOST's own
   * super_admin is (`passwordAuth.setPassword` re-reads that standing from the
   * database and refuses everyone else). Reading it here keeps the control off
   * the screen for the people it would only ever answer 403 to.
   */
  const canResetPassword =
    resetPassword !== null && canAdministerPlatform(me.data?.account?.platformRole ?? null);

  const busyMembershipId = updateRole.isPending
    ? (updateRole.variables?.membershipId ?? null)
    : remove.isPending
      ? (remove.variables?.membershipId ?? null)
      : null;

  function handleChangeRole(member: Member, role: MembershipRole) {
    const name = memberDisplayName(member);
    setOutcome(null);
    remove.reset();
    updateRole.reset();
    updateRole.mutate(
      { membershipId: member.membershipId, isYou: member.isYou, role },
      {
        onSuccess: () =>
          setOutcome(
            member.isYou
              ? `Vai trò của bạn trong ${tenant?.name ?? "công ty này"} giờ là ${MEMBERSHIP_ROLE_LABELS[role]}.`
              : `${name} giờ có vai trò ${MEMBERSHIP_ROLE_LABELS[role]}.`,
          ),
      },
    );
  }

  function handleRemove(member: Member) {
    const name = memberDisplayName(member);
    setOutcome(null);
    updateRole.reset();
    remove.reset();
    remove.mutate(
      { membershipId: member.membershipId, isYou: member.isYou },
      {
        onSuccess: () =>
          setOutcome(
            member.isYou
              ? "Bạn đã rời công ty này."
              : `Đã gỡ ${name} khỏi công ty. Muốn thêm lại thì gửi một link mời mới.`,
          ),
      },
    );
  }

  return (
    <Stack direction="vertical" height="100%">
      {/* The live region is ALWAYS mounted, empty most of the time: a region
          that appears together with its text is announced unreliably
          (web-feedback-states §4). */}
      <div
        role="status"
        aria-live="polite"
        className={outcome ? "px-4 pt-4 sm:px-6" : "px-4 sm:px-6"}
      >
        {outcome ? (
          <Banner
            status="success"
            isDismissable
            onDismiss={() => setOutcome(null)}
            title="Đã lưu thay đổi"
            description={outcome}
          />
        ) : null}
      </div>

      {/* A refused write belongs next to the table it was aimed at — 403 (thiếu
          quyền) and 409 LAST_OWNER both land here, never as a toast that
          disappears before it is read. */}
      {updateRole.isError ? (
        <div className="px-4 pt-4 sm:px-6">
          <ApiErrorNotice error={updateRole.error} />
        </div>
      ) : null}
      {remove.isError ? (
        <div className="px-4 pt-4 sm:px-6">
          <ApiErrorNotice error={remove.error} />
        </div>
      ) : null}

      {showInvites ? (
        <div className="px-4 py-6 sm:px-6">
          <InvitePanel actorRole={actorRole} />
        </div>
      ) : null}
      {showInvites ? <Divider /> : null}

      <div className="space-y-2 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            {/* h2: the hub above owns the page's h1 (core-accessibility §1). */}
            <Heading level={2}>Danh sách thành viên</Heading>
            {/* Only once the list is real: "0 thành viên" while loading reads as an
                answer, and an admin would act on it. */}
            {members.data ? (
              <Text type="supporting" color="secondary" role="status" aria-live="polite">
                {items.length} thành viên
              </Text>
            ) : null}
          </div>

          <Button
            variant="secondary"
            size="sm"
            label={members.isFetching ? "Đang tải…" : "Tải lại"}
            isDisabled={members.isFetching}
            onClick={() => void members.refetch()}
          />
        </div>

        {/* Said once, directly below the heading: explains every disabled row
            button before the operator hovers one to find out, without crowding
            the heading and reload button onto one awkward line. */}
        {isResolved && !canManageMembers(actorRole) ? (
          <Text type="supporting" color="secondary" className="max-w-prose">
            Vai trò của bạn ({actorRole ? MEMBERSHIP_ROLE_LABELS[actorRole] : "không rõ"}) chỉ xem
            được danh sách {tenant?.name ?? "công ty này"}.
          </Text>
        ) : null}
      </div>

      <StackItem size="fill">
        <MemberListBody
          isFirstLoad={isFirstLoad}
          showSkeleton={showSkeleton}
          isError={members.isError}
          error={members.error}
          onRetry={() => void members.refetch()}
          items={items}
          actorRole={actorRole}
          busyMembershipId={busyMembershipId}
          onChangeRole={handleChangeRole}
          onRemove={handleRemove}
          resetPassword={canResetPassword ? resetPassword : null}
        />
      </StackItem>
    </Stack>
  );
}

function MemberListBody({
  isFirstLoad,
  showSkeleton,
  isError,
  error,
  onRetry,
  items,
  actorRole,
  busyMembershipId,
  onChangeRole,
  onRemove,
  resetPassword,
}: {
  isFirstLoad: boolean;
  showSkeleton: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  items: readonly Member[];
  actorRole: MembershipRole | null;
  busyMembershipId: string | null;
  onChangeRole: (member: Member, role: MembershipRole) => void;
  onRemove: (member: Member) => void;
  resetPassword: SetPasswordAction | null;
}) {
  // --- Loading (delayed so a fast answer does not flash) -------------------
  if (isFirstLoad) return showSkeleton ? <MemberTableSkeleton /> : null;

  // --- Error, with nothing to fall back on ---------------------------------
  if (isError && items.length === 0) {
    return (
      <div className="px-4 pb-6 sm:px-6">
        <ApiErrorNotice error={error} onRetry={onRetry} />
      </div>
    );
  }

  // --- Empty: you are always a member of the company you are looking at, so
  // an empty list is a symptom, not a starting point.
  if (items.length === 0) {
    return (
      <div className="px-4 pb-6 sm:px-6">
        <div className="border-border bg-card rounded-xl border p-6">
          <EmptyState
            headingLevel={3}
            icon={
              <span
                aria-hidden="true"
                className="bg-accent text-accent-foreground inline-flex size-10 items-center justify-center rounded-lg"
              >
                <Users className="size-5" />
              </span>
            }
            title="Danh sách thành viên đang trống"
            description="Kể cả bạn cũng không có trong danh sách, nhiều khả năng máy chủ trả về thiếu — thử tải lại hoặc báo quản trị viên."
            actions={<Button variant="secondary" label="Tải lại" onClick={onRetry} />}
          />
        </div>
      </div>
    );
  }

  // --- Data, possibly STALE -------------------------------------------------
  // A refetch failed while rows from an earlier answer are still on screen.
  // Hiding that would let an admin change a role against a list the server no
  // longer agrees with.
  return (
    <Stack direction="vertical" height="100%">
      {isError ? (
        <div className="px-4 pb-4 sm:px-6">
          <Banner
            status="warning"
            title="Danh sách bên dưới có thể đã cũ — chưa làm mới được"
            description={`${presentApiError(toApiError(error)).description} Những gì đang hiện là kết quả của lần tải gần nhất; hãy thử lại trước khi đổi quyền của ai.`}
            endContent={<Button variant="secondary" size="sm" label="Thử lại" onClick={onRetry} />}
          />
        </div>
      ) : null}

      <StackItem size="fill">
        <MemberTable
          members={items}
          actorRole={actorRole}
          busyMembershipId={busyMembershipId}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
          resetPassword={resetPassword}
        />
      </StackItem>
    </Stack>
  );
}
