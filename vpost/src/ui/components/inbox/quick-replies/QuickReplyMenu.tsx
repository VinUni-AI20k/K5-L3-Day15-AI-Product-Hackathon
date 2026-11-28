"use client";

import {
  Button,
  Card,
  Divider,
  HStack,
  Kbd,
  Skeleton,
  Stack,
  Text,
  Token,
} from "@astryxdesign/core";
import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { EmptyState } from "@/ui/components/feedback/EmptyState";
import { useQuickReplies } from "@/ui/hooks/useQuickReplies";
import {
  applyQuickReplyPlaceholders,
  filterQuickReplies,
  type QuickReply,
} from "@/ui/schemas/quick-reply.schema";

import {
  clampActiveIndex,
  processQuickReplyKeyDown,
  quickReplyListboxId,
  quickReplyOptionId,
  syncComposerAriaAttributes,
} from "./quick-reply-menu-state";
import { QuickReplyManageDialog } from "./QuickReplyManageDialog";

import "./quick-reply.css";

/** Returns true when the key was consumed by the menu (composer must then not send). */
export type QuickReplyKeyHandler = (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;

export type QuickReplyMenuProps = {
  /** True while the composer text starts with "/" and the menu should show. */
  open: boolean;
  /** Text typed after the leading "/", used to filter by shortcut/title. */
  query: string;
  /** Customer name for the `{ten_khach}` placeholder (fallback "bạn"). */
  customerName: string | null;
  /** id of the composer textarea, for aria-controls / aria-activedescendant wiring. */
  composerId: string;
  /** Called with the final text (placeholder already replaced). */
  onPick: (text: string) => void;
  onClose: () => void;
  /**
   * The menu registers its key handler here while open (null when closed). The composer
   * calls it first in onKeyDown; if it returns true the composer skips its own handling.
   */
  registerKeyHandler: (handler: QuickReplyKeyHandler | null) => void;
};

export interface QuickReplyMenuViewProps {
  readonly open: boolean;
  readonly query: string;
  readonly customerName: string | null;
  readonly composerId: string;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly totalCount: number;
  readonly items: readonly QuickReply[];
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onPickItem: (item: QuickReply) => void;
  readonly onRetry: () => void;
  readonly onOpenManage: () => void;
}

/**
 * Presentational "/" quick-reply listbox overlay rendered above the composer.
 * Focus stays inside the composer textarea; selection moves via
 * `aria-activedescendant` and `role="option"` / `aria-selected`.
 */
export function QuickReplyMenuView({
  open,
  query,
  customerName,
  composerId,
  isLoading,
  error,
  totalCount,
  items,
  activeIndex,
  onActiveIndexChange,
  onPickItem,
  onRetry,
  onOpenManage,
}: QuickReplyMenuViewProps) {
  if (!open) return null;

  const listboxId = quickReplyListboxId(composerId);
  const clampedIndex = clampActiveIndex(activeIndex, items.length);
  const trimmedQuery = query.trim();

  return (
    <Card
      elevation="med"
      padding={0}
      data-quick-reply-menu="open"
      className="quick-reply-menu-card w-full overflow-hidden"
    >
      <Stack direction="vertical" gap={0}>
        {/* Header bar with management action — aligned to the 16px left edge */}
        <HStack
          gap={2}
          align="center"
          justify="between"
          wrap="wrap"
          className="quick-reply-header"
        >
          <HStack gap={2} align="center" wrap="wrap">
            <Text type="label">Mẫu trả lời nhanh</Text>
            {trimmedQuery.length > 0 ? (
              <Text type="supporting" size="xsm" color="inherit" className="quick-reply-meta-text">
                Lọc theo “/{trimmedQuery}”
              </Text>
            ) : null}
          </HStack>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="quick-reply-touch-target"
            icon={<Settings2 className="size-4" aria-hidden="true" />}
            label="Quản lý mẫu trả lời"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpenManage}
          />
        </HStack>

        <Divider />

        {/* Body: loading | error | empty | filtered listbox */}
        {isLoading && totalCount === 0 ? (
          <Stack
            direction="vertical"
            gap={3}
            padding={4}
            aria-hidden="true"
            data-skeleton="quick-reply-menu"
          >
            {[0, 1, 2].map((idx) => (
              <Stack key={idx} direction="vertical" gap={1.5}>
                <HStack gap={2} align="center">
                  <Skeleton width={68} height={20} index={idx} />
                  <Skeleton width={140} height={16} index={idx} />
                </HStack>
                <Skeleton width="85%" height={14} index={idx} />
              </Stack>
            ))}
          </Stack>
        ) : error && totalCount === 0 ? (
          <Stack direction="vertical" gap={2} padding={4}>
            <ApiErrorNotice
              error={error}
              onRetry={onRetry}
              shouldFocus={false}
              source="Mẫu trả lời nhanh"
            />
          </Stack>
        ) : items.length === 0 ? (
          <Stack direction="vertical" gap={2} padding={4}>
            <EmptyState
              kind={totalCount === 0 ? "first-run" : "no-result"}
              title={
                totalCount === 0
                  ? "Chưa có mẫu trả lời nhanh"
                  : `Không có mẫu khớp “/${trimmedQuery}”`
              }
              description={
                totalCount === 0
                  ? "Tạo sẵn câu trả lời giá bán, phí ship hoặc kích cỡ để chèn nhanh khi gõ /."
                  : "Thử nhập phím tắt khác hoặc mở trình quản lý để tạo mẫu mới."
              }
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="quick-reply-touch-target"
                  icon={<Settings2 className="size-4" aria-hidden="true" />}
                  label="Quản lý mẫu trả lời"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onOpenManage}
                />
              }
            />
          </Stack>
        ) : (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Danh sách mẫu trả lời nhanh"
            className="max-h-64 divide-y divide-border overflow-y-auto"
          >
            {items.map((item, index) => {
              const isSelected = index === clampedIndex;
              const optionId = quickReplyOptionId(composerId, item.id);
              const preview = applyQuickReplyPlaceholders(item.text, customerName);

              return (
                <div
                  key={item.id}
                  id={optionId}
                  role="option"
                  aria-selected={isSelected}
                  data-quick-reply-option={item.shortcut}
                  data-active={isSelected ? "true" : undefined}
                  className="quick-reply-option"
                  onMouseEnter={() => onActiveIndexChange(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onPickItem(item)}
                >
                  <Stack direction="vertical" gap={1}>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Token size="sm" color="purple" label={`/${item.shortcut}`} />
                      <Text type="supporting" weight="semibold">
                        {item.title}
                      </Text>
                    </HStack>
                    <Text type="supporting" color="secondary" maxLines={2}>
                      {preview}
                    </Text>
                  </Stack>
                </div>
              );
            })}
          </div>
        )}

        <Divider />

        {/* Footer keyboard shortcut legend */}
        <HStack
          gap={3}
          align="center"
          justify="between"
          wrap="wrap"
          className="quick-reply-footer"
        >
          <HStack gap={3} align="center" wrap="wrap">
            <HStack gap={1} align="center">
              <Kbd keys="up" />
              <Kbd keys="down" />
              <Text type="supporting" size="xsm" color="inherit" className="quick-reply-meta-text">
                Di chuyển
              </Text>
            </HStack>
            <HStack gap={1} align="center">
              <Kbd keys="enter" />
              <Text type="supporting" size="xsm" color="inherit" className="quick-reply-meta-text">
                Chèn mẫu
              </Text>
            </HStack>
            <HStack gap={1} align="center">
              <Kbd keys="escape" />
              <Text type="supporting" size="xsm" color="inherit" className="quick-reply-meta-text">
                Đóng
              </Text>
            </HStack>
          </HStack>
        </HStack>
      </Stack>
    </Card>
  );
}

/**
 * Slash-command quick-reply menu for the inbox composer.
 * Filters templates over shortcut and title, registers keyboard navigation
 * (ArrowUp/ArrowDown/Enter/Esc) on the composer while open, wires
 * `aria-controls` / `aria-activedescendant`, replaces `{ten_khach}`, and hosts
 * the template management dialog.
 */
export function QuickReplyMenu({
  open,
  query,
  customerName,
  composerId,
  onPick,
  onClose,
  registerKeyHandler,
}: QuickReplyMenuProps) {
  const quickRepliesQuery = useQuickReplies();
  const allItems = useMemo(
    () => quickRepliesQuery.data?.items ?? [],
    [quickRepliesQuery.data?.items],
  );
  const filteredItems = useMemo(
    () => filterQuickReplies(allItems, query),
    [allItems, query],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [lastQueryKey, setLastQueryKey] = useState(`${open ? "1" : "0"}:${query}`);

  const currentQueryKey = `${open ? "1" : "0"}:${query}`;
  if (lastQueryKey !== currentQueryKey) {
    setLastQueryKey(currentQueryKey);
    setActiveIndex(0);
  }

  const isInitialLoading = quickRepliesQuery.isPending && allItems.length === 0;
  const hasInitialError = quickRepliesQuery.isError && allItems.length === 0;

  const clampedIndex = clampActiveIndex(activeIndex, filteredItems.length);
  const activeItem = clampedIndex >= 0 ? filteredItems[clampedIndex] : null;
  const listboxId = quickReplyListboxId(composerId);
  const hasListbox = open && !isInitialLoading && !hasInitialError && filteredItems.length > 0;
  const activeOptionId =
    hasListbox && activeItem ? quickReplyOptionId(composerId, activeItem.id) : null;

  // Keep latest state in a ref so the registered key handler never goes stale.
  const handlerStateRef = useRef({
    open,
    items: filteredItems,
    activeIndex: clampedIndex,
    customerName,
    isLoading: isInitialLoading,
    hasError: hasInitialError,
    onPick,
    onClose,
  });

  useEffect(() => {
    handlerStateRef.current = {
      open,
      items: filteredItems,
      activeIndex: clampedIndex,
      customerName,
      isLoading: isInitialLoading,
      hasError: hasInitialError,
      onPick,
      onClose,
    };
  }, [
    open,
    filteredItems,
    clampedIndex,
    customerName,
    isInitialLoading,
    hasInitialError,
    onPick,
    onClose,
  ]);

  // Register/unregister composer keyboard interceptor while open.
  useEffect(() => {
    if (!open) {
      registerKeyHandler(null);
      return;
    }

    const keyHandler: QuickReplyKeyHandler = (event) => {
      const current = handlerStateRef.current;
      return processQuickReplyKeyDown(event, {
        open: current.open,
        items: current.items,
        activeIndex: current.activeIndex,
        customerName: current.customerName,
        isLoading: current.isLoading,
        hasError: current.hasError,
        onActiveIndexChange: (nextIndex) => setActiveIndex(nextIndex),
        onPick: current.onPick,
        onClose: current.onClose,
      });
    };

    registerKeyHandler(keyHandler);
    return () => registerKeyHandler(null);
  }, [open, registerKeyHandler]);

  // Clean up menu ARIA attributes only when closing, switching composer target,
  // or unmounting after opening — never touch the textarea while closed so we
  // do not fight attributes owned by the composer.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const composerEl = document.getElementById(composerId);
    if (!composerEl) return;

    return () => {
      syncComposerAriaAttributes(composerEl, {
        open: false,
        hasListbox: false,
        listboxId: "",
        activeOptionId: null,
      });
    };
  }, [composerId, open]);

  // Wire aria-haspopup, aria-expanded, aria-controls, and aria-activedescendant while open.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const composerEl = document.getElementById(composerId);
    syncComposerAriaAttributes(composerEl, {
      open: true,
      hasListbox,
      listboxId,
      activeOptionId,
    });
  }, [composerId, open, hasListbox, listboxId, activeOptionId]);

  // Keep the highlighted option scrolled into view on arrow-key navigation.
  useEffect(() => {
    if (!open || !activeOptionId || typeof document === "undefined") return;
    const optionEl = document.getElementById(activeOptionId);
    if (optionEl && typeof optionEl.scrollIntoView === "function") {
      optionEl.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeOptionId]);

  function handlePickItem(item: QuickReply) {
    onPick(applyQuickReplyPlaceholders(item.text, customerName));
  }

  function handleOpenManage() {
    onClose();
    setIsManageOpen(true);
  }

  return (
    <>
      <QuickReplyMenuView
        open={open}
        query={query}
        customerName={customerName}
        composerId={composerId}
        isLoading={isInitialLoading}
        error={quickRepliesQuery.isError ? quickRepliesQuery.error : null}
        totalCount={allItems.length}
        items={filteredItems}
        activeIndex={clampedIndex}
        onActiveIndexChange={setActiveIndex}
        onPickItem={handlePickItem}
        onRetry={() => {
          void quickRepliesQuery.refetch();
        }}
        onOpenManage={handleOpenManage}
      />

      {isManageOpen ? (
        <QuickReplyManageDialog
          isOpen={isManageOpen}
          customerName={customerName}
          onOpenChange={setIsManageOpen}
        />
      ) : null}
    </>
  );
}
