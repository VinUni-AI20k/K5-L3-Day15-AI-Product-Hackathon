"use client";

import { Token } from "@astryxdesign/core";
import { Bot, CheckCircle2, FileSpreadsheet, MessageSquareText } from "lucide-react";

import { HERO_MOCK_SAMPLE } from "@/ui/components/landing/landing-copy";
import { Badge } from "@/ui/components/ui/badge";

/**
 * Composed hero product preview built purely from VPOST's real design tokens
 * and UI primitives (post preview card + comment chat bubble pair with
 * "Tự động trả lời" and "Cần bạn" signals). No stock artwork or fake claims.
 */
export function LandingHeroVisual() {
  const { post, comments } = HERO_MOCK_SAMPLE;

  return (
    <figure
      aria-label="Minh họa giao diện bài đăng nháp và hộp thư tự động trả lời bình luận trên VPOST"
      className="landing-hero-stage m-0 flex flex-col gap-4"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="landing-caption">{HERO_MOCK_SAMPLE.stageLabel}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FileSpreadsheet className="size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
          <span>{HERO_MOCK_SAMPLE.stageStatus}</span>
        </span>
      </figcaption>

      {/* 1. Post preview card matching ComposeFocus / FacebookPreview patterns */}
      <div className="landing-card-elevated flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
            >
              {post.pageInitials}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {post.pageName}
              </span>
              <span className="landing-caption truncate">{post.meta}</span>
            </div>
          </div>
          <Badge tone="success">{post.stockBadge}</Badge>
        </div>

        <p className="landing-body-small text-foreground">{post.caption}</p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-border bg-sidebar px-2.5 py-1 font-mono text-xs font-medium text-foreground">
            {post.productCodeLabel}: {post.productCodeValue}
          </span>
          {post.factPills.map((fact) => (
            <span
              key={fact}
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {fact}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-success-foreground">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span>{post.verificationNote}</span>
        </div>
      </div>

      {/* 2. Comment chat bubble pair matching Inbox ChatMessageItem patterns */}
      <div className="landing-card-elevated flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{comments.sectionLabel}</span>
        </div>

        <div className="flex flex-col gap-3">
          {/* Customer comment bubble (left) */}
          <div className="flex flex-col items-start gap-1">
            <span className="landing-caption">{comments.customerLabel}</span>
            <div className="landing-bubble-customer max-w-md text-sm leading-relaxed">
              {comments.customerText}
            </div>
          </div>

          {/* Page auto-reply bubble (right) with Astryx "Tự động trả lời" Token */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="landing-caption">{comments.pageLabel}</span>
              <Token
                label={comments.autoReplyTag}
                icon={<Bot className="size-3.5" aria-hidden="true" />}
                color="purple"
                size="sm"
              />
            </div>
            <div className="landing-bubble-page max-w-md text-sm leading-relaxed">
              {comments.pageReplyText}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="landing-caption">{comments.escalationPrompt}</span>
          <Badge tone="warning">{comments.escalationTag}</Badge>
        </div>
      </div>
    </figure>
  );
}
