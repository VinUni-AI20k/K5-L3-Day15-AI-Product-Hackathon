"use client";

import { Dialog, DialogHeader, Layout, LayoutContent } from "@astryxdesign/core";

import { CustomerPanel } from "@/ui/components/inbox/customer/CustomerPanel";
import { displayCommentAuthor, type InboxThread } from "@/ui/schemas/inbox.schema";

import "./inbox-surface.css";

export interface InboxCustomerSheetProps {
  readonly isOpen: boolean;
  readonly isMobile: boolean;
  readonly thread: InboxThread | null;
  readonly onClose: () => void;
}

/**
 * Side sheet (tablet 768–1023px) or fullscreen sheet (mobile <768px) wrapping
 * `CustomerPanel` with focus trapping, Escape dismissal, and scrollable body.
 */
export function InboxCustomerSheet({
  isOpen,
  isMobile,
  thread,
  onClose,
}: InboxCustomerSheetProps) {
  if (!isOpen || !thread) return null;

  const customerName = displayCommentAuthor(thread.customer.name);

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose="info"
      variant={isMobile ? "fullscreen" : "standard"}
      width={isMobile ? undefined : 380}
      maxHeight={isMobile ? undefined : "100dvh"}
      position={isMobile ? undefined : { top: 0, bottom: 0, end: 0 }}
      className={isMobile ? undefined : "h-dvh"}
    >
      <Layout
        height="fill"
        className="inbox-surface-page"
        header={
          <DialogHeader
            title="Thông tin khách hàng"
            subtitle={customerName}
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
        }
        content={
          <LayoutContent padding={0} isScrollable className="inbox-surface-page">
            <CustomerPanel
              fromId={thread.customer.id}
              fallbackName={thread.customer.name}
              threadId={thread.id}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
