"use client";

import {
  Badge,
  Button,
  Field,
  HStack,
  IconButton,
  Stack,
  Text,
  TextArea,
  TextInput,
} from "@astryxdesign/core";
import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import {
  charCounterState,
  listLimitState,
  type WritingStyleListFieldKey,
  type WritingStyleListRow,
} from "./writing-style-form";

export interface ListFieldEditorProps {
  readonly fieldKey: WritingStyleListFieldKey;
  readonly label: string;
  readonly description: string;
  readonly inheritedHint: string | null;
  readonly itemLabelPrefix: string;
  readonly placeholder: string;
  readonly rows: readonly WritingStyleListRow[];
  readonly maxItems: number;
  readonly maxChars: number;
  readonly multiline?: boolean;
  readonly error?: string;
  readonly itemErrors?: Readonly<Record<number, string>>;
  readonly isDisabled: boolean;
  readonly disabledMessage?: string;
  readonly onAdd: () => void;
  readonly onChangeRow: (id: string, value: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onRowRef?: (
    fieldKey: WritingStyleListFieldKey,
    index: number,
    node: HTMLInputElement | HTMLTextAreaElement | null,
  ) => void;
  readonly onGroupRef?: (
    fieldKey: WritingStyleListFieldKey,
    node: HTMLDivElement | null,
  ) => void;
}

export function ListFieldEditor({
  fieldKey,
  label,
  description,
  inheritedHint,
  itemLabelPrefix,
  placeholder,
  rows,
  maxItems,
  maxChars,
  multiline = false,
  error,
  itemErrors,
  isDisabled,
  disabledMessage,
  onAdd,
  onChangeRow,
  onRemove,
  onRowRef,
  onGroupRef,
}: ListFieldEditorProps) {
  const baseId = useId();
  const groupId = `${baseId}-group`;
  const labelId = `${baseId}-label`;
  const descId = `${baseId}-desc`;
  const errorId = `${baseId}-err`;

  const limit = listLimitState(rows.length, maxItems);
  const describedBy = [description ? descId : null, error ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(" ");

  const addButtonTooltip = isDisabled
    ? disabledMessage
    : limit.isAtLimit
      ? `Đã đạt giới hạn tối đa ${maxItems} mục.`
      : undefined;

  return (
    <Field
      isGroupLabel
      label={label}
      labelID={labelId}
      description={description}
      descriptionID={descId}
      inputID={groupId}
      width="100%"
      status={error ? { type: "error", message: error, messageID: errorId } : undefined}
      statusVariant="detached"
    >
      <div
        ref={(node) => onGroupRef?.(fieldKey, node)}
        id={groupId}
        tabIndex={-1}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy || undefined}
        data-field-key={fieldKey}
        className="w-full"
      >
        <Stack direction="vertical" gap={3}>
          <HStack gap={2} justify="between" align="center" wrap="wrap">
            <Badge
              variant={
                limit.isOverLimit ? "error" : limit.isAtLimit ? "warning" : "neutral"
              }
              label={`${limit.text} mục`}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" aria-hidden="true" />}
              label={`Thêm ${itemLabelPrefix.toLowerCase()}`}
              isDisabled={isDisabled || limit.isAtLimit}
              tooltip={addButtonTooltip}
              onClick={onAdd}
            />
          </HStack>

          {rows.length === 0 ? (
            <Text type="supporting" color="secondary" display="block">
              {inheritedHint ??
                `Chưa có mục nào. Tối đa ${maxItems} mục, mỗi mục tối đa ${maxChars.toLocaleString("vi-VN")} ký tự.`}
            </Text>
          ) : (
            <Stack direction="vertical" gap={2}>
              {inheritedHint ? (
                <Text type="supporting" color="secondary" display="block">
                  {inheritedHint}
                </Text>
              ) : null}

              {rows.map((row, index) => {
                const rowError = itemErrors?.[index];
                const counter = charCounterState(row.value, maxChars);

                return (
                  <Stack key={row.id} direction="vertical" gap={1}>
                    <HStack gap={2} align="start" width="100%">
                      <div className="min-w-0 flex-1">
                        {multiline ? (
                          <TextArea
                            ref={(node) => onRowRef?.(fieldKey, index, node)}
                            label={`${itemLabelPrefix} ${index + 1}`}
                            isLabelHidden
                            value={row.value}
                            onChange={(value) => onChangeRow(row.id, value)}
                            placeholder={placeholder}
                            rows={4}
                            maxLength={maxChars}
                            width="100%"
                            isDisabled={isDisabled}
                            disabledMessage={disabledMessage}
                            status={
                              rowError ? { type: "error", message: rowError } : undefined
                            }
                            statusVariant="detached"
                          />
                        ) : (
                          <TextInput
                            ref={(node) => onRowRef?.(fieldKey, index, node)}
                            label={`${itemLabelPrefix} ${index + 1}`}
                            isLabelHidden
                            value={row.value}
                            onChange={(value) => onChangeRow(row.id, value)}
                            placeholder={placeholder}
                            width="100%"
                            isDisabled={isDisabled}
                            disabledMessage={disabledMessage}
                            status={
                              rowError ? { type: "error", message: rowError } : undefined
                            }
                            statusVariant="detached"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.preventDefault();
                            }}
                          />
                        )}
                      </div>

                      <IconButton
                        type="button"
                        variant="ghost"
                        size="md"
                        icon={<Trash2 className="size-4" aria-hidden="true" />}
                        label={`Xoá ${itemLabelPrefix.toLowerCase()} ${index + 1}`}
                        isDisabled={isDisabled}
                        tooltip={isDisabled ? disabledMessage : undefined}
                        onClick={() => onRemove(row.id)}
                      />
                    </HStack>

                    {!multiline && counter.visible ? (
                      <HStack justify="end">
                        <Badge
                          variant={counter.isOverLimit ? "error" : "warning"}
                          label={counter.text}
                        />
                      </HStack>
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Stack>
      </div>
    </Field>
  );
}
