"use client";

import {
  AlertDialog,
  Badge,
  Button,
  Card,
  HStack,
  Selector,
  Stack,
  Text,
  type SelectorOptionData,
} from "@astryxdesign/core";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { formatWritingStyleDate } from "@/ui/schemas/writing-style.schema";

import type { WritingStyleScope } from "./writing-style-form";
import type { ScopeOption } from "./writing-style-inheritance";

export interface ScopeSelectorProps {
  readonly options: readonly ScopeOption[];
  readonly activeScope: WritingStyleScope;
  readonly isLoadingChannels?: boolean;
  readonly isDeleting: boolean;
  readonly readOnlyReason: string | null;
  readonly onSelectScope: (nextScope: WritingStyleScope) => void;
  readonly onDeleteOverride: (channelId: string) => void;
}

export function ScopeSelector({
  options,
  activeScope,
  isLoadingChannels = false,
  isDeleting,
  readOnlyReason,
  onSelectScope,
  onDeleteOverride,
}: ScopeSelectorProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isReadOnly = readOnlyReason !== null;
  const activeOption = useMemo(
    () => options.find((option) => option.scope === activeScope) ?? options[0],
    [options, activeScope],
  );

  const optionByScope = useMemo(
    () => new Map(options.map((option) => [option.scope, option])),
    [options],
  );

  const selectorOptions = useMemo<SelectorOptionData[]>(
    () =>
      options.map((option) => ({
        value: option.scope,
        label: option.label,
      })),
    [options],
  );

  const channelOptions = options.filter((option) => option.kind === "channel");
  const overrideCount = channelOptions.filter((option) => option.hasOverride).length;

  return (
    <Card padding={5}>
      <Stack direction="vertical" gap={3}>
        <HStack gap={4} justify="between" align="end" wrap="wrap">
          <div className="w-full min-w-0 sm:min-w-60 sm:flex-1">
            <Selector
              label="Phạm vi áp dụng"
              description="Thiết lập chung cho toàn công ty hoặc ghi đè riêng từng Page."
              options={selectorOptions}
              value={activeScope}
              onChange={onSelectScope}
              hasSearch={options.length > 6}
              searchPlaceholder="Tìm Page…"
              width="100%"
              renderOption={(option) => {
                const meta = optionByScope.get(option.value);
                return (
                  <HStack gap={2} justify="between" align="center" width="100%">
                    <Text maxLines={1}>{option.label ?? option.value}</Text>
                    {meta?.badgeLabel ? (
                      <Badge
                        variant={meta.hasOverride ? "info" : "neutral"}
                        label={meta.badgeLabel}
                      />
                    ) : null}
                  </HStack>
                );
              }}
            />
          </div>

          <HStack gap={2} align="center" wrap="wrap">
            {activeOption?.kind === "channel" && activeOption.badgeLabel ? (
              <Badge
                variant={activeOption.hasOverride ? "info" : "neutral"}
                label={activeOption.badgeLabel}
              />
            ) : (
              <Badge variant="info" label="Mặc định công ty" />
            )}

            {activeOption?.kind === "channel" && activeOption.hasStoredOverride ? (
              <Button
                type="button"
                variant="destructive"
                size="md"
                icon={<Trash2 className="size-4" aria-hidden="true" />}
                label="Xoá thiết lập riêng"
                isLoading={isDeleting}
                isDisabled={isDeleting || isReadOnly}
                tooltip={
                  isReadOnly
                    ? (readOnlyReason ?? undefined)
                    : isDeleting
                      ? "Đang xoá thiết lập riêng…"
                      : undefined
                }
                onClick={() => setConfirmDeleteOpen(true)}
              />
            ) : null}
          </HStack>
        </HStack>

        <HStack gap={3} justify="between" align="center" wrap="wrap">
          <Text type="supporting" color="secondary">
            {activeOption?.updatedAt
              ? `Cập nhật gần nhất: ${formatWritingStyleDate(activeOption.updatedAt)}`
              : activeOption?.kind === "channel"
                ? "Page này chưa có thiết lập riêng — mọi trường để trống sẽ kế thừa từ Mặc định công ty."
                : "Chưa lưu cấu hình riêng — hệ thống đang dùng mặc định gốc."}
          </Text>

          <Text type="supporting" color="secondary">
            {isLoadingChannels
              ? "Đang tải danh sách Page…"
              : channelOptions.length === 0
                ? "Chưa kết nối Page nào"
                : overrideCount > 0
                  ? `${overrideCount}/${channelOptions.length} Page có thiết lập riêng`
                  : `${channelOptions.length} Page đang dùng mặc định công ty`}
          </Text>
        </HStack>
      </Stack>

      {activeOption?.kind === "channel" && activeOption.hasStoredOverride ? (
        <AlertDialog
          isOpen={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title="Xoá thiết lập riêng của Page?"
          description={`Toàn bộ phong cách viết riêng của “${activeOption.channelName ?? activeScope}” sẽ bị xoá và Page này sẽ quay lại dùng “Mặc định công ty”. Thao tác này không thể hoàn tác.`}
          actionLabel="Xoá thiết lập riêng"
          actionVariant="destructive"
          cancelLabel="Giữ lại"
          isActionLoading={isDeleting}
          onAction={() => {
            setConfirmDeleteOpen(false);
            onDeleteOverride(activeOption.scope);
          }}
        />
      ) : null}
    </Card>
  );
}
