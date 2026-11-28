"use client";

import {
  Button,
  Card,
  HStack,
  Heading,
  IconButton,
  LayoutHeader,
  Link,
  Stack,
  StackItem,
  Text,
  Thumbnail,
  Token,
  VisuallyHidden,
} from "@astryxdesign/core";
import { ArrowLeft, Ban, PanelRight, RotateCcw } from "lucide-react";

import { InboxCustomerAvatar } from "@/ui/components/inbox/InboxCustomerAvatar";
import {
  displayCommentAuthor,
  toSafeFacebookUrl,
  toSafeImageUrl,
  type InboxThread,
} from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

export interface ChatHeaderProps {
  readonly thread: InboxThread;
  readonly readOnlyReason: string | null;
  readonly isTogglingIgnore: boolean;
  readonly showBackButton: boolean;
  readonly isCustomerPanelOpen: boolean;
  readonly onBack?: () => void;
  readonly onIgnore: () => void;
  readonly onUnignore: () => void;
  readonly onToggleCustomerPanel: () => void;
}

/**
 * Fixed header of the center chat column: customer identity, Page name,
 * thread actions (Bỏ qua / Khôi phục, Customer panel toggle), and post card
 * with thumbnail, caption excerpt, product code, and safe Facebook link.
 */
export function ChatHeader({
  thread,
  readOnlyReason,
  isTogglingIgnore,
  showBackButton,
  isCustomerPanelOpen,
  onBack,
  onIgnore,
  onUnignore,
  onToggleCustomerPanel,
}: ChatHeaderProps) {
  const customerName = displayCommentAuthor(thread.customer.name);
  const safePostUrl = toSafeFacebookUrl(thread.postUrl);
  const safeImageUrl = toSafeImageUrl(thread.postImageUrl);
  const rawPostUrlText = thread.postUrl?.trim() ?? "";
  const captionText = thread.postCaption.replace(/\s+/g, " ").trim();
  const isIgnored = thread.status === "ignored";
  const hasPostContext =
    safeImageUrl !== null ||
    thread.productCode.trim().length > 0 ||
    captionText.length > 0 ||
    safePostUrl !== null ||
    rawPostUrlText.length > 0;

  return (
    <LayoutHeader hasDivider padding={0} className="inbox-chat-header">
      <Stack direction="vertical" gap={3} className="min-w-0">
        <HStack gap={2} align="center" justify="between" wrap="wrap">
          <HStack gap={3} align="center" className="min-w-0">
            {showBackButton && onBack ? (
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                className="inbox-touch-target"
                icon={<ArrowLeft className="size-4" aria-hidden="true" />}
                label="Quay lại danh sách hội thoại"
                tooltip="Quay lại danh sách hội thoại"
                onClick={onBack}
              />
            ) : null}

            <InboxCustomerAvatar
              customerId={thread.customer.id}
              name={customerName}
              size="md"
            />

            <Stack direction="vertical" gap={0.5} className="min-w-0">
              <HStack gap={2} align="center" wrap="wrap">
                <Heading level={3}>{customerName}</Heading>
                {thread.needsReply ? (
                  <Token label="Cần trả lời" color="orange" size="sm" />
                ) : null}
                {isIgnored ? <Token label="Đã bỏ qua" color="gray" size="sm" /> : null}
              </HStack>
              <Text
                type="supporting"
                size="xsm"
                color="inherit"
                className="inbox-meta-text"
                maxLines={1}
              >
                {thread.channelName}
              </Text>
            </Stack>
          </HStack>

          <HStack gap={1.5} align="center">
            {isIgnored ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="inbox-touch-target"
                icon={<RotateCcw className="size-4" aria-hidden="true" />}
                label={isTogglingIgnore ? "Đang khôi phục…" : "Khôi phục"}
                isLoading={isTogglingIgnore}
                isDisabled={isTogglingIgnore || readOnlyReason !== null}
                tooltip={readOnlyReason ?? undefined}
                onClick={onUnignore}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="inbox-touch-target"
                icon={<Ban className="size-4" aria-hidden="true" />}
                label={isTogglingIgnore ? "Đang bỏ qua…" : "Bỏ qua"}
                isLoading={isTogglingIgnore}
                isDisabled={isTogglingIgnore || readOnlyReason !== null}
                tooltip={readOnlyReason ?? undefined}
                onClick={onIgnore}
              />
            )}

            <IconButton
              type="button"
              variant={isCustomerPanelOpen ? "secondary" : "ghost"}
              size="sm"
              className="inbox-touch-target"
              icon={<PanelRight className="size-4" aria-hidden="true" />}
              label={
                isCustomerPanelOpen
                  ? "Ẩn thông tin khách hàng"
                  : "Xem thông tin khách hàng"
              }
              tooltip="Thông tin khách hàng"
              aria-expanded={isCustomerPanelOpen}
              onClick={onToggleCustomerPanel}
            />
          </HStack>
        </HStack>

        {/* Post context card (same lg radius scale as all other cards) */}
        {hasPostContext ? (
          <Card
            variant="muted"
            padding={3}
            className="inbox-post-card"
            data-inbox="post-card"
          >
            <HStack gap={3} align="center" className="min-w-0">
              {safeImageUrl ? (
                <Thumbnail
                  src={safeImageUrl}
                  alt={
                    thread.productCode
                      ? `Ảnh bài viết sản phẩm ${thread.productCode}`
                      : "Ảnh bài viết Facebook"
                  }
                  label={thread.productCode || "Ảnh bài viết"}
                />
              ) : null}

              <StackItem size="fill" className="min-w-0">
                <Stack direction="vertical" gap={1} className="min-w-0">
                  <HStack gap={2} align="center" wrap="wrap">
                    {thread.productCode.trim().length > 0 ? (
                      <Token label={thread.productCode.trim()} size="sm" />
                    ) : null}

                    {safePostUrl ? (
                      <Link
                        href={safePostUrl}
                        isExternalLink
                        newTabLabel="(mở ở tab mới)"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inbox-subtle-link"
                      >
                        Xem bài trên Facebook
                        <VisuallyHidden>
                          {thread.productCode ? ` — sản phẩm ${thread.productCode}` : ""}
                        </VisuallyHidden>
                      </Link>
                    ) : rawPostUrlText.length > 0 ? (
                      <Text
                        type="supporting"
                        size="xsm"
                        color="inherit"
                        className="inbox-meta-text"
                        maxLines={1}
                      >
                        {rawPostUrlText}
                      </Text>
                    ) : null}
                  </HStack>

                  {captionText.length > 0 ? (
                    <Text type="supporting" color="secondary" maxLines={2}>
                      {captionText}
                    </Text>
                  ) : null}
                </Stack>
              </StackItem>
            </HStack>
          </Card>
        ) : null}
      </Stack>
    </LayoutHeader>
  );
}
