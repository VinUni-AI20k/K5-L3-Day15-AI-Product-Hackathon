"use client";

import {
  Badge,
  Banner,
  Button,
  EmptyState,
  HStack,
  Heading,
  Selector,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  pixel,
  proportional,
} from "@astryxdesign/core";
import type { TableColumn } from "@astryxdesign/core";
import { Link2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { MEMBERSHIP_ROLE_BADGE_TONES } from "@/ui/components/members/role-badge";
import { useCreateInvite, useInvites, useRevokeInvite } from "@/ui/hooks/useInvites";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useNowMs } from "@/ui/hooks/useNowMs";
import {
  ACCESS_ROLE_DESCRIPTIONS,
  type AccessRole,
} from "@/ui/schemas/access-request.schema";
import {
  INVITE_STATUS_LABELS,
  INVITE_STATUS_TONES,
  inviteStatus,
  inviteUsageLabel,
  isInviteRevocable,
  type CreateInviteResponse,
  type Invite,
} from "@/ui/schemas/invite.schema";
import { MEMBERSHIP_ROLE_LABELS, type MembershipRole } from "@/ui/schemas/me.schema";
import { assignableRoles } from "@/ui/schemas/member.schema";
import { formatDateTime } from "@/ui/schemas/post-batch.schema";

/**
 * "Link mời" — the block that adds people now that the approval queue is
 * retired (M2.3/M2.4).
 *
 * SECURITY, and the whole reason this block looks the way it does: the url is a
 * CREDENTIAL and the server returns it exactly ONCE, when it is minted. So it
 * is shown in a panel that says so out loud, with a copy button and the raw
 * text (a blocked clipboard must not be a dead end), and it is never written
 * anywhere it could outlive the screen.
 *
 * Roles offered are only the ones the operator may actually grant (doc 10 §1) —
 * an admin cannot mint an admin link. The server refuses it too; this just
 * stops someone walking into the refusal.
 */
export function InvitePanel({ actorRole }: { actorRole: MembershipRole | null }) {
  const invites = useInvites();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const nowMs = useNowMs();

  const grantable = assignableRoles(actorRole);
  const [role, setRole] = useState<MembershipRole | null>(grantable[0] ?? null);
  const [lastActorRole, setLastActorRole] = useState<MembershipRole | null>(actorRole);

  /**
   * The ladder is known only once `/api/me` answers, and it changes again if the
   * operator's own role changes — so the preselected value has to follow it, and
   * must never sit on a role this operator cannot grant.
   *
   * Adjusting state during render (the documented React alternative to an
   * effect, and the pattern already used in `useDelayedFlag`): an effect here
   * would render one frame with a stale selection first.
   */
  if (lastActorRole !== actorRole) {
    setLastActorRole(actorRole);
    setRole((current) =>
      current !== null && grantable.includes(current) ? current : (grantable[0] ?? null),
    );
  }

  const isFirstLoad = invites.isPending && invites.fetchStatus === "fetching";
  const showSkeleton = useDelayedFlag(isFirstLoad);
  const items = invites.data?.items ?? [];

  const roleOptions = grantable.map((value) => ({
    value,
    label: `${MEMBERSHIP_ROLE_LABELS[value]} — ${ACCESS_ROLE_DESCRIPTIONS[value as AccessRole]}`,
  }));

  return (
    <div className="space-y-8">
      <section className="border-border bg-card space-y-4 rounded-xl border p-5 sm:p-6">
        <div className="max-w-prose space-y-1.5">
          <Heading level={2}>Link mời</Heading>
          <Text type="supporting" color="secondary">
            Gửi link cho người bạn muốn thêm vào công ty. Ai mở link và đăng nhập sẽ vào công ty với
            đúng vai trò bạn chọn — nên chỉ gửi cho người bạn tin.
          </Text>
        </div>

        {grantable.length === 0 ? (
          <Banner
            status="info"
            title="Bạn không tạo được link mời"
            description="Chỉ chủ sở hữu và quản trị viên mới mời được người mới vào công ty."
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-sm">
              <Selector
                label="Vai trò cấp cho người được mời"
                size="md"
                width="100%"
                options={roleOptions}
                value={role ?? undefined}
                onChange={(value) => setRole(value as MembershipRole)}
              />
            </div>
            <Button
              variant="primary"
              size="md"
              label="Tạo link mời"
              isLoading={create.isPending}
              isDisabled={create.isPending || role === null}
              onClick={() => {
                if (role === null) return;
                create.reset();
                create.mutate({ role });
              }}
            />
          </div>
        )}

        {create.isError ? <ApiErrorNotice error={create.error} /> : null}
        {create.isSuccess ? (
          <NewInviteReveal invite={create.data} onDismiss={() => create.reset()} />
        ) : null}
      </section>

      {revoke.isError ? <ApiErrorNotice error={revoke.error} /> : null}

      <InviteListBody
        isFirstLoad={isFirstLoad}
        showSkeleton={showSkeleton}
        isError={invites.isError}
        error={invites.error}
        onRetry={() => void invites.refetch()}
        items={items}
        nowMs={nowMs}
        busyInviteId={revoke.isPending ? (revoke.variables?.inviteId ?? null) : null}
        onRevoke={(inviteId) => {
          revoke.reset();
          revoke.mutate({ inviteId });
        }}
      />
    </div>
  );
}

/**
 * The one and only sighting of the url. Dismissable, because leaving a live
 * credential on screen after it has been sent is its own small risk — and the
 * copy is what the operator came for.
 */
function NewInviteReveal({
  invite,
  onDismiss,
}: {
  invite: CreateInviteResponse;
  onDismiss: () => void;
}) {
  return (
    <Banner
      status="success"
      role="status"
      title={`Đã tạo link mời vai trò ${MEMBERSHIP_ROLE_LABELS[invite.role]}`}
      description={`Link chỉ hiện lần này — chép và gửi ngay. Nếu đóng mà chưa chép, hãy thu hồi link này rồi tạo link khác. Hết hạn ${formatDateTime(invite.expiresAt)}.`}
      defaultIsExpanded
    >
      <Stack direction="vertical" gap={2}>
        {/* Read-only rather than plain text: it stays selectable with the
            keyboard, which is the fallback when the clipboard is blocked. */}
        <TextInput
          label="Link mời vừa tạo"
          isReadOnly
          value={invite.url}
          onChange={() => undefined}
          width="100%"
        />
        <HStack gap={2} align="center" wrap="wrap">
          <CopyInviteUrl url={invite.url} inviteId={invite.id} />
          <Button variant="ghost" size="sm" label="Đã chép xong, ẩn link" onClick={onDismiss} />
        </HStack>
      </Stack>
    </Banner>
  );
}

type CopyState = "idle" | "copied" | "failed";

/**
 * The clipboard is a permission-gated API: absent on insecure origins, blockable
 * by permissions policy. Both the missing-API branch and the rejection branch
 * report failure — and the failure text says what to do instead, because the
 * url is right above and can be selected by hand.
 */
function CopyInviteUrl({ url, inviteId }: { url: string; inviteId: string }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 4_000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      // Never the url itself in a log line — it is a credential.
      console.error("[members] clipboard unavailable", {
        invite_id: inviteId,
        error_code: "CLIPBOARD_UNAVAILABLE",
      });
      setState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (error) {
      // Never swallow: without this the button would look like it worked.
      console.error("[members] copy invite url failed", {
        invite_id: inviteId,
        error_code: "CLIPBOARD_DENIED",
        err: error,
      });
      setState("failed");
    }
  }

  return (
    <HStack gap={2} align="center" wrap="wrap">
      <Button variant="secondary" size="sm" label="Chép link mời" onClick={() => void copy()} />
      <Text type="supporting" role="status" aria-live="polite">
        {state === "copied" ? "Đã chép link vào clipboard." : ""}
        {state === "failed"
          ? "Trình duyệt không cho chép tự động — hãy bôi đen link ở trên rồi chép tay."
          : ""}
      </Text>
    </HStack>
  );
}

/** Table's generic needs an index signature; the fields stay Invite's. */
type InviteRow = Invite & Record<string, unknown>;

function InviteListBody({
  isFirstLoad,
  showSkeleton,
  isError,
  error,
  onRetry,
  items,
  nowMs,
  busyInviteId,
  onRevoke,
}: {
  isFirstLoad: boolean;
  showSkeleton: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  items: readonly Invite[];
  nowMs: number;
  busyInviteId: string | null;
  onRevoke: (inviteId: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // --- Loading (delayed so a fast answer does not flash) --------------------
  if (isFirstLoad) {
    return showSkeleton ? (
      <div className="border-border bg-card overflow-hidden rounded-xl border p-4" aria-hidden="true">
        <Stack direction="vertical" gap={3}>
          <Skeleton width="100%" height={20} />
          <Skeleton width="100%" height={20} />
          <Skeleton width="100%" height={20} />
        </Stack>
      </div>
    ) : null;
  }

  // --- Error, with nothing to fall back on ----------------------------------
  if (isError && items.length === 0) {
    return <ApiErrorNotice error={error} onRetry={onRetry} />;
  }

  // --- Empty ----------------------------------------------------------------
  if (items.length === 0) {
    return (
      <div className="border-border bg-card rounded-xl border p-6">
        <EmptyState
          headingLevel={3}
          icon={
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground inline-flex size-10 items-center justify-center rounded-lg"
            >
              <Link2 className="size-5" />
            </span>
          }
          title="Chưa có link mời nào"
          description="Link mới tạo ở khung phía trên sẽ hiện tại đây để bạn theo dõi và thu hồi khi cần."
        />
      </div>
    );
  }

  const columns: TableColumn<InviteRow>[] = [
    {
      key: "role",
      header: "Vai trò",
      width: pixel(130),
      renderCell: (invite) => (
        <Badge
          variant={MEMBERSHIP_ROLE_BADGE_TONES[invite.role]}
          label={MEMBERSHIP_ROLE_LABELS[invite.role]}
        />
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: pixel(130),
      renderCell: (invite) => {
        const status = inviteStatus(invite, nowMs);
        return <Badge variant={INVITE_STATUS_TONES[status]} label={INVITE_STATUS_LABELS[status]} />;
      },
    },
    {
      key: "usedCount",
      header: "Đã dùng",
      width: pixel(104),
      renderCell: (invite) => (
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {inviteUsageLabel(invite)}
        </Text>
      ),
    },
    {
      key: "expiresAt",
      header: "Hết hạn",
      width: pixel(160),
      renderCell: (invite) => (
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {formatDateTime(invite.expiresAt)}
        </Text>
      ),
    },
    {
      key: "createdByEmail",
      header: "Người tạo",
      width: proportional(1),
      renderCell: (invite) =>
        invite.createdByEmail?.trim() ? (
          <Text type="supporting" color="secondary">
            {invite.createdByEmail}
          </Text>
        ) : (
          <Text type="supporting" color="placeholder">
            Không rõ
          </Text>
        ),
    },
    {
      key: "actions",
      header: "Thao tác",
      width: pixel(260),
      renderCell: (invite) => {
        const status = inviteStatus(invite, nowMs);
        const isBusy = busyInviteId === invite.id;

        if (!isInviteRevocable(status)) {
          // Nothing to take back — and no dead button pretending otherwise.
          return (
            <Text type="supporting" color="placeholder">
              Không cần thu hồi
            </Text>
          );
        }

        if (confirmingId === invite.id) {
          return (
            <div className="border-destructive/30 bg-destructive/10 space-y-2 rounded-lg border p-3">
              <Text type="supporting" role="alert">
                Thu hồi link này? Ai đang giữ link sẽ không dùng được nữa; người đã vào bằng link
                này vẫn ở trong công ty.
              </Text>
              <HStack gap={2} align="center" wrap="wrap">
                <Button
                  size="sm"
                  variant="destructive"
                  label="Xác nhận thu hồi link mời"
                  isLoading={isBusy}
                  isDisabled={isBusy}
                  onClick={() => {
                    setConfirmingId(null);
                    onRevoke(invite.id);
                  }}
                >
                  Thu hồi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  label="Giữ link mời"
                  isDisabled={isBusy}
                  onClick={() => setConfirmingId(null)}
                >
                  Giữ lại
                </Button>
              </HStack>
            </div>
          );
        }

        return (
          <Button
            size="sm"
            variant="ghost"
            label="Thu hồi link mời"
            isLoading={isBusy}
            isDisabled={isBusy}
            onClick={() => setConfirmingId(invite.id)}
          >
            Thu hồi
          </Button>
        );
      },
    },
  ];

  return (
    <Stack direction="vertical" gap={3}>
      {/* Rows kept on screen even when a refetch failed — with the failure said
          out loud, because acting on a stale invite list is exactly the risk. */}
      {isError ? (
        <Banner
          status="warning"
          title="Danh sách link mời có thể đã cũ"
          description="Chưa làm mới được. Những gì đang hiện là kết quả của lần tải gần nhất."
          endContent={<Button variant="secondary" size="sm" label="Thử lại" onClick={onRetry} />}
        />
      ) : null}
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <Table
          data={items as InviteRow[]}
          columns={columns}
          idKey="id"
          density="compact"
          hasHover
          verticalAlign="top"
          textOverflow="truncate"
          rowCount={items.length}
        />
      </div>
    </Stack>
  );
}
