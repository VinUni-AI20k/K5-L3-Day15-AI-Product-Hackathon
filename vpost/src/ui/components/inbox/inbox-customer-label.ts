import type { InboxMessage, InboxThread } from "@/ui/schemas/inbox.schema";

/**
 * Shared customer display-name and first-message timestamp helpers for the
 * comment inbox. Distinguishes anonymous Facebook commenters (whose `from.id`
 * and `from.name` Facebook hides while the app lacks Advanced Access) using
 * `"Khách Facebook · HH:mm dd/MM"` derived from the thread's first message time.
 */

export const INBOX_ANONYMOUS_CUSTOMER_PREFIX = "Khách Facebook";

/**
 * Passed to Astryx `Avatar`'s `name` prop for anonymous customers so its
 * built-in `getInitials()` always renders `"KF"` while `alt` carries the full
 * `"Khách Facebook · HH:mm dd/MM"` accessible label.
 */
export const INBOX_ANONYMOUS_AVATAR_NAME = "Khách Facebook";

/**
 * Pinned to Vietnam time (`Asia/Ho_Chi_Minh`) so SSR and browser renders match
 * and operators always read local wall-clock times.
 */
const INBOX_CUSTOMER_TIMEZONE = "Asia/Ho_Chi_Minh";

const ANONYMOUS_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: INBOX_CUSTOMER_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  hourCycle: "h23",
});

const ACCESSIBLE_EXCERPT_LIMIT = 40;

export type InboxThreadTimeSource = Pick<InboxThread, "id" | "lastMessage" | "updatedAt"> & {
  readonly createdAt?: string | null;
  readonly firstMessageAt?: string | null;
};

export type InboxMessageTimeSource = Pick<InboxMessage, "id" | "createdAt"> & {
  readonly delivery?: InboxMessage["delivery"];
};

/** Returns `true` when Facebook omitted `customer.name` or sent only whitespace. */
export function isAnonymousCustomerName(
  customerName: string | null | undefined,
): boolean {
  return typeof customerName !== "string" || customerName.trim().length === 0;
}

/**
 * Returns `true` when an already-formatted display label represents an
 * anonymous Facebook customer (`"Khách Facebook"` or `"Khách Facebook · ..."`).
 */
export function isAnonymousCustomerLabel(
  label: string | null | undefined,
): boolean {
  if (typeof label !== "string") return false;
  const trimmed = label.trim();
  return (
    trimmed === INBOX_ANONYMOUS_CUSTOMER_PREFIX ||
    trimmed.startsWith(`${INBOX_ANONYMOUS_CUSTOMER_PREFIX} · `)
  );
}

/**
 * Formats an ISO timestamp into `"HH:mm dd/MM"` (24-hour Vietnam time).
 * Returns `null` for blank or unparseable timestamps.
 */
export function formatAnonymousCustomerTime(
  iso: string | null | undefined,
): string | null {
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (trimmed.length === 0) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  const parts = ANONYMOUS_TIME_FORMATTER.formatToParts(date);
  const rawHour = parts.find((part) => part.type === "hour")?.value;
  const rawMinute = parts.find((part) => part.type === "minute")?.value;
  const rawDay = parts.find((part) => part.type === "day")?.value;
  const rawMonth = parts.find((part) => part.type === "month")?.value;
  if (!rawHour || !rawMinute || !rawDay || !rawMonth) return null;

  const hour = rawHour === "24" ? "00" : rawHour.padStart(2, "0");
  const minute = rawMinute.padStart(2, "0");
  const day = rawDay.padStart(2, "0");
  const month = rawMonth.padStart(2, "0");

  return `${hour}:${minute} ${day}/${month}`;
}

/**
 * Formats a customer display label for list rows, chat header, messages, and toasts:
 * - Returns the trimmed `customerName` when Facebook provides one.
 * - Otherwise returns `"Khách Facebook · HH:mm dd/MM"` using `firstMessageAt`,
 *   degrading to `"Khách Facebook"` if no valid timestamp is available.
 */
export function formatInboxCustomerName(
  customerName: string | null | undefined,
  firstMessageAt?: string | null,
): string {
  const trimmed = typeof customerName === "string" ? customerName.trim() : "";
  if (trimmed.length > 0) return trimmed;

  const formattedTime = formatAnonymousCustomerTime(firstMessageAt);
  return formattedTime
    ? `${INBOX_ANONYMOUS_CUSTOMER_PREFIX} · ${formattedTime}`
    : INBOX_ANONYMOUS_CUSTOMER_PREFIX;
}

function toValidIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function findEarliestMessageTime(
  messages: readonly InboxMessageTimeSource[],
): string | null {
  let earliestIso: string | null = null;
  let earliestMs = Number.POSITIVE_INFINITY;

  for (const message of messages) {
    const iso = toValidIsoTimestamp(message.createdAt);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (ms < earliestMs) {
      earliestMs = ms;
      earliestIso = iso;
    }
  }

  return earliestIso;
}

/**
 * Resolves the first message timestamp of a thread:
 * 1. Explicit `thread.firstMessageAt` or `thread.createdAt` if present.
 * 2. Root message (`msg.id === thread.id`) or earliest persisted message when
 *    thread messages are loaded.
 * 3. `thread.lastMessage.createdAt`, then `thread.updatedAt` when only the
 *    thread list summary is available.
 */
export function resolveThreadFirstMessageAt(
  thread: InboxThreadTimeSource,
  messages?: readonly InboxMessageTimeSource[],
): string | null {
  const explicit =
    toValidIsoTimestamp(thread.firstMessageAt) ?? toValidIsoTimestamp(thread.createdAt);
  if (explicit) return explicit;

  if (messages && messages.length > 0) {
    const rootMessage = messages.find((msg) => msg.id === thread.id);
    const rootTime = toValidIsoTimestamp(rootMessage?.createdAt);
    if (rootTime) return rootTime;

    const persisted = messages.filter(
      (msg) => msg.delivery === undefined || msg.delivery === "sent",
    );
    const earliest = findEarliestMessageTime(persisted.length > 0 ? persisted : messages);
    if (earliest) return earliest;
  }

  return (
    toValidIsoTimestamp(thread.lastMessage.createdAt) ??
    toValidIsoTimestamp(thread.updatedAt)
  );
}

/** Convenience wrapper resolving the display name for an `InboxThread`. */
export function formatThreadCustomerName(
  thread: Pick<InboxThread, "id" | "customer" | "lastMessage" | "updatedAt"> & {
    readonly createdAt?: string | null;
    readonly firstMessageAt?: string | null;
  },
  firstMessageAt?: string | null,
): string {
  return formatInboxCustomerName(
    thread.customer.name,
    firstMessageAt ?? resolveThreadFirstMessageAt(thread),
  );
}

/**
 * Formats an unambiguous Vietnamese row label ("Minh Thư: “Còn size M không?”"
 * or "Khách Facebook · 10:15 27/11: “Còn size M không?”") for bulk checkboxes
 * and screen readers.
 */
export function formatInboxThreadAccessibleContext(
  thread: Pick<InboxThread, "id" | "customer" | "lastMessage" | "updatedAt"> & {
    readonly createdAt?: string | null;
    readonly firstMessageAt?: string | null;
  },
  firstMessageAt?: string | null,
): string {
  const author = formatThreadCustomerName(thread, firstMessageAt);
  const cleaned = thread.lastMessage.text.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return author;
  const excerpt =
    cleaned.length <= ACCESSIBLE_EXCERPT_LIMIT
      ? cleaned
      : `${cleaned.slice(0, ACCESSIBLE_EXCERPT_LIMIT).trimEnd()}…`;
  return `${author}: “${excerpt}”`;
}
