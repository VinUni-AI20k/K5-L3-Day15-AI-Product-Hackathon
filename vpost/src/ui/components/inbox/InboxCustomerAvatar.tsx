"use client";

import { Avatar } from "@astryxdesign/core";

import { cn } from "@/shared/utils";

import "./inbox-surface.css";

/**
 * Curated design system categorical accent tones (all WCAG AA verified in light and
 * dark mode inside `src/ui/theme/design-tokens.ts`).
 */
export const INBOX_AVATAR_TONES = [
  "purple",
  "blue",
  "teal",
  "green",
  "orange",
  "pink",
  "cyan",
] as const;

export type InboxAvatarTone = (typeof INBOX_AVATAR_TONES)[number];

/**
 * Deterministic FNV-1a hash mapping a customer ID (falling back to name) onto
 * one of the semantic accent avatar tones so the same customer always wears
 * the same initials color across list rows and the chat header.
 */
export function resolveCustomerAvatarTone(
  customerId: string | null | undefined,
  fallbackName?: string | null,
): InboxAvatarTone {
  const seed = (customerId?.trim() || fallbackName?.trim() || "fb").toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % INBOX_AVATAR_TONES.length;
  return INBOX_AVATAR_TONES[index];
}

export interface InboxCustomerAvatarProps {
  readonly customerId?: string | null;
  readonly name: string;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
}

/**
 * Customer initials avatar wrapping Astryx `Avatar` with a deterministic
 * accent-tinted fallback derived from `customerId`.
 */
export function InboxCustomerAvatar({
  customerId,
  name,
  size = "md",
  className,
}: InboxCustomerAvatarProps) {
  const tone = resolveCustomerAvatarTone(customerId, name);
  return (
    <span
      className={cn("inbox-avatar", className)}
      data-avatar-tone={tone}
    >
      <Avatar name={name} size={size} tooltip={false} />
    </span>
  );
}
