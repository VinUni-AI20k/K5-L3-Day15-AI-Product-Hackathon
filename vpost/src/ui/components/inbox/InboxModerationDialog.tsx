"use client";

import { Dialog, DialogHeader, Layout, LayoutContent } from "@astryxdesign/core";
import type { ReactNode } from "react";

import { ModerationLog } from "@/ui/components/comments/moderation/ModerationLog";
import { ModerationSettingsPanel } from "@/ui/components/comments/moderation/ModerationSettingsPanel";

import "./inbox-surface.css";

export type InboxModerationPanel = "settings" | "log" | null;

export interface InboxModerationDialogProps {
  readonly activePanel: InboxModerationPanel;
  readonly readOnlyReason: string | null;
  readonly pageNameById?: Readonly<Record<string, string | undefined>>;
  readonly onClose: () => void;
  readonly onOpenLog?: () => void;
  /** Optional test overrides for presentational rendering. */
  readonly settingsContent?: ReactNode;
  readonly logContent?: ReactNode;
}

/**
 * Fullscreen Astryx Dialog reusing the existing `ModerationSettingsPanel` and
 * `ModerationLog` from `components/comments/moderation/*`.
 */
export function InboxModerationDialog({
  activePanel,
  readOnlyReason,
  pageNameById,
  onClose,
  onOpenLog,
  settingsContent,
  logContent,
}: InboxModerationDialogProps) {
  if (activePanel === null) return null;

  const isSettings = activePanel === "settings";

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
          <DialogHeader
            title={isSettings ? "Cài đặt tự kiểm duyệt" : "Nhật ký kiểm duyệt"}
            subtitle={
              isSettings
                ? "Tự kiểm duyệt đang bật · chạy thật theo từng Fanpage Facebook. Điều chỉnh nhóm tự ẩn và ngưỡng độ tin cậy."
                : "Lịch sử mọi thao tác kiểm duyệt tự động và thủ công, hỗ trợ hoàn tác Hiện lại."
            }
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
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
                    <ModerationSettingsPanel
                      readOnlyReason={readOnlyReason}
                      onOpenLog={onOpenLog}
                    />
                  ))
                : (logContent ?? (
                    <ModerationLog
                      pageNameById={pageNameById}
                      readOnlyReason={readOnlyReason}
                    />
                  ))}
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
