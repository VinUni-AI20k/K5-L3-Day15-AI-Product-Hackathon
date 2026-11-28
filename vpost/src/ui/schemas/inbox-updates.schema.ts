import { z } from "zod";

/**
 * Contracts for `GET /api/comments/updates` (`.swarm/specs/inbox-contract.md` § Updates feed
 * and `.swarm/specs/auto-reply.md` § API).
 * Parsed with zod via `apiRequest` before reaching any hook or UI component.
 */

export const CommentUpdateItemSchema = z.object({
  threadId: z.string().min(1),
  messageId: z.string().min(1),
  customerName: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  text: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  channelName: z.string(),
});
export type CommentUpdateItem = z.infer<typeof CommentUpdateItemSchema>;

export const CommentUpdateNeedYouItemSchema = z.object({
  threadId: z.string().min(1),
  customerName: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  reason: z.string(),
  // Optional because `.swarm/specs/auto-reply.md` § API lists `{threadId, customerName, reason}`
  // while the UI dedupes by `threadId + since` when provided (falling back to `threadId + reason`).
  since: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type CommentUpdateNeedYouItem = z.infer<typeof CommentUpdateNeedYouItemSchema>;

export const CommentUpdateAutoRepliedItemSchema = z.object({
  threadId: z.string().min(1),
  messageId: z.string().min(1),
});
export type CommentUpdateAutoRepliedItem = z.infer<
  typeof CommentUpdateAutoRepliedItemSchema
>;

export const CommentUpdatesResponseSchema = z.object({
  tenantId: z.string().min(1),
  cursor: z.string().min(1),
  items: z.array(CommentUpdateItemSchema),
  draftsReady: z.array(z.string().min(1)),
  // Optional in zod so UI deploys cleanly ahead of backend rollout; default to empty arrays.
  needYou: z.array(CommentUpdateNeedYouItemSchema).optional().default([]),
  autoReplied: z.array(CommentUpdateAutoRepliedItemSchema).optional().default([]),
  runningThreadIds: z.array(z.string().min(1)).optional().default([]),
});
export type CommentUpdatesResponse = z.infer<typeof CommentUpdatesResponseSchema>;
