"use client";

import {
  Divider,
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
  Skeleton,
  Stack,
  StackItem,
} from "@astryxdesign/core";

import "./inbox-surface.css";

const LIST_SKELETON_ROWS = 6;

/** First-load skeleton matching the shape of `ConversationListItem`. */
export function InboxListSkeleton() {
  return (
    <Stack direction="vertical" gap={0} padding={0} aria-hidden="true">
      {Array.from({ length: LIST_SKELETON_ROWS }, (_, row) => (
        <Stack key={row} direction="vertical" gap={0}>
          <HStack gap={3} align="start" paddingInline={4} paddingBlock={3}>
            <Skeleton width={36} height={36} radius="rounded" index={row} />
            <StackItem size="fill">
              <Stack direction="vertical" gap={1.5}>
                <HStack gap={2} align="center" justify="between">
                  <Skeleton width={128} height={16} index={row} />
                  <Skeleton width={52} height={12} index={row} />
                </HStack>
                <Skeleton width="90%" height={14} index={row} />
                <HStack gap={1.5} align="center">
                  <Skeleton width={68} height={20} radius="rounded" index={row} />
                  <Skeleton width={76} height={20} radius="rounded" index={row} />
                </HStack>
              </Stack>
            </StackItem>
          </HStack>
          {row < LIST_SKELETON_ROWS - 1 ? <Divider /> : null}
        </Stack>
      ))}
    </Stack>
  );
}

/** Loading skeleton for an opening chat thread (header + alternating bubbles + composer). */
export function InboxChatSkeleton() {
  return (
    <Layout
      height="fill"
      className="inbox-surface-page"
      header={
        <LayoutHeader hasDivider padding={0} className="inbox-chat-header" aria-hidden="true">
          <Stack direction="vertical" gap={3}>
            <HStack gap={3} align="center" justify="between">
              <HStack gap={3} align="center">
                <Skeleton width={36} height={36} radius="rounded" />
                <Stack direction="vertical" gap={1}>
                  <Skeleton width={150} height={18} />
                  <Skeleton width={110} height={12} />
                </Stack>
              </HStack>
              <HStack gap={2} align="center">
                <Skeleton width={80} height={32} />
                <Skeleton width={32} height={32} />
              </HStack>
            </HStack>
            <Skeleton width="100%" height={60} />
          </Stack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0} isScrollable={false} className="inbox-chat-stream">
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1} align="start">
              <Skeleton width="58%" height={64} radius="rounded" index={0} />
              <Skeleton width={96} height={12} index={0} />
            </Stack>
            <Stack direction="vertical" gap={1} align="end">
              <Skeleton width="52%" height={56} radius="rounded" index={1} />
              <Skeleton width={112} height={12} index={1} />
            </Stack>
            <Stack direction="vertical" gap={1} align="start">
              <Skeleton width="66%" height={72} radius="rounded" index={2} />
              <Skeleton width={96} height={12} index={2} />
            </Stack>
            <Stack direction="vertical" gap={1} align="end">
              <Skeleton width="44%" height={52} radius="rounded" index={3} />
              <Skeleton width={104} height={12} index={3} />
            </Stack>
          </Stack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider padding={0} className="inbox-composer-footer">
          <Stack direction="vertical" gap={3}>
            <Skeleton width="100%" height={84} />
            <HStack gap={2} justify="between" align="center">
              <Skeleton width={140} height={36} />
              <Skeleton width={84} height={36} />
            </HStack>
          </Stack>
        </LayoutFooter>
      }
    />
  );
}

/**
 * Suspense fallback for `/comments` mirroring the 3-column inbox layout so
 * viewport geometry stays steady while search params resolve.
 */
export function InboxFallback() {
  return (
    <Layout
      height="fill"
      className="h-full max-h-dvh overflow-hidden inbox-surface-page"
      start={
        <LayoutPanel
          width={340}
          padding={0}
          hasDivider
          isScrollable={false}
          className="inbox-surface-page"
          aria-hidden="true"
        >
          <Layout
            height="fill"
            className="inbox-surface-page"
            header={
              <LayoutHeader hasDivider padding={0} className="inbox-list-header">
                <Stack direction="vertical" gap={3}>
                  <HStack gap={2} align="center" justify="between">
                    <Skeleton width={116} height={28} />
                    <HStack gap={1.5}>
                      <Skeleton width={32} height={32} />
                      <Skeleton width={32} height={32} />
                      <Skeleton width={32} height={32} />
                      <Skeleton width={32} height={32} />
                    </HStack>
                  </HStack>
                  <Stack direction="vertical" gap={2}>
                    <Skeleton width="100%" height={36} />
                    <Skeleton width="100%" height={36} />
                  </Stack>
                  <HStack gap={1.5} wrap="nowrap" className="overflow-hidden">
                    <Skeleton width={92} height={28} radius="rounded" />
                    <Skeleton width={76} height={28} radius="rounded" />
                    <Skeleton width={64} height={28} radius="rounded" />
                    <Skeleton width={68} height={28} radius="rounded" />
                  </HStack>
                </Stack>
              </LayoutHeader>
            }
            content={
              <LayoutContent padding={0} isScrollable={false} className="inbox-surface-page">
                <InboxListSkeleton />
              </LayoutContent>
            }
          />
        </LayoutPanel>
      }
      content={
        <LayoutContent padding={0} isScrollable={false} className="inbox-surface-page">
          <InboxChatSkeleton />
        </LayoutContent>
      }
    />
  );
}
