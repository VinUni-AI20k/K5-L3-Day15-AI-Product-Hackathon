import { z } from "zod";

/**
 * Contracts for `GET /api/comments/updates` (`.swarm/specs/inbox-contract.md` § Updates feed).
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

export const CommentUpdatesResponseSchema = z.object({
  tenantId: z.string().min(1),
  cursor: z.string().min(1),
  items: z.array(CommentUpdateItemSchema),
  draftsReady: z.array(z.string().min(1)),
});
export type CommentUpdatesResponse = z.infer<typeof CommentUpdatesResponseSchema>;
