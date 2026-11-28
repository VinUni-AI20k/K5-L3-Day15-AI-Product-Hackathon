"use client";

import {
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  Tab,
  TabList,
} from "@astryxdesign/core";
import { History, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AutoReplyLogPanel } from "@/ui/components/inbox/AutoReplyLogPanel";
import { AutoReplySettingsPanel } from "@/ui/components/inbox/AutoReplySettingsPanel";

import "./inbox-surface.css";

export type InboxAutoReplyTab = "settings" | "log";

export interface InboxAutoReplyDialogProps {
  readonly isOpen: boolean;
  readonly readOnlyReason: string | null;
  readonly pageNameById?: Readonly<Record<string, string | undefined>>;
  readonly initialTab?: InboxAutoReplyTab;
  readonly onClose: () => void;
  /** Optional test overrides for presentational rendering. */
  readonly settingsContent?: ReactNode;
  readonly logContent?: ReactNode;
}

/**
 * Fullscreen Astryx Dialog for per-Page auto-reply configuration and log inspection,
 * mirroring the `InboxModerationDialog` pattern.
 */
export function InboxAutoReplyDialog({
  isOpen,
  readOnlyReason,
  pageNameById,
  initialTab = "settings",
  onClose,
  settingsContent,
  logContent,
}: InboxAutoReplyDialogProps) {
  const [activeTab, setActiveTab] = useState<InboxAutoReplyTab>(initialTab);

  if (!isOpen) return null;

  const isSettings = activeTab === "settings";

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose={isSettings ? "form" : "info"}
      variant="fullscreen"
    >
      <Layout
        height="fill"
        header={
          <div className="inbox-surface-page">
            <DialogHeader
              title="Tự động trả lời"
              subtitle="Bật tự động trả lời giá, size, màu theo từng Fanpage với chế độ Chạy thử trước khi Chạy thật."
              onOpenChange={(open) => {
                if (!open) onClose();
              }}
            />
            <div className="px-4 md:px-6">
              <TabList
                value={activeTab}
                onChange={(next) => {
                  if (next === "settings" || next === "log") {
                    setActiveTab(next);
                  }
                }}
                hasDivider
                aria-label="Mục tự động trả lời"
              >
                <Tab
                  value="settings"
                  label="Cài đặt theo Fanpage"
                  icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
                />
                <Tab
                  value="log"
                  label="Nhật ký tự trả lời"
                  icon={<History className="size-4" aria-hidden="true" />}
                />
              </TabList>
            </div>
          </div>
        }
        content={
          <LayoutContent padding={0} isScrollable className="inbox-surface-page">
            <div
              className={
                isSettings
                  ? "mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-6"
                  : "mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-6"
              }
            >
              {isSettings
                ? (settingsContent ?? (
                    <AutoReplySettingsPanel readOnlyReason={readOnlyReason} />
                  ))
                : (logContent ?? (
                    <AutoReplyLogPanel
                      pageNameById={pageNameById}
                      onOpenThread={onClose}
                    />
                  ))}
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
