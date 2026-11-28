"use client";

import {
  Button,
  Dialog,
  DialogHeader,
  HStack,
  Stack,
  Text,
  TextInput,
  ToggleButton,
  Token,
} from "@astryxdesign/core";
import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import {
  CUSTOMER_TAG_COLOR_LABELS,
  CUSTOMER_TAG_COLORS,
  CUSTOMER_TAG_NAME_MAX_LENGTH,
  CUSTOMER_TAG_TOKEN_COLORS,
  validateCustomerTagName,
  type CustomerTagColor,
} from "@/ui/schemas/customer.schema";
import { ApiError } from "@/ui/services/api-error";

import { isCustomerTagDuplicateError } from "./customer-panel-state";

import "./customer-panel.css";

export interface CreateCustomerTagDialogProps {
  readonly isOpen: boolean;
  readonly isSubmitting: boolean;
  readonly error: unknown;
  readonly readOnlyReason: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: { name: string; color: CustomerTagColor }) => void;
  readonly onResetError?: () => void;
}

/**
 * Modal form dialog for creating a new tenant customer tag with a name (1..40)
 * and a color chosen from the contract enum mapped to Astryx `Token` tokens.
 */
export function CreateCustomerTagDialog({
  isOpen,
  isSubmitting,
  error,
  readOnlyReason,
  onOpenChange,
  onSubmit,
  onResetError,
}: CreateCustomerTagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<CustomerTagColor>("blue");
  const [nameError, setNameError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setName("");
      setColor("blue");
      setNameError(null);
    }
  }

  const isDuplicate = isCustomerTagDuplicateError(error);
  const inlineNameError =
    nameError ??
    (isDuplicate
      ? ApiError.is(error) && error.userMessage
        ? error.userMessage
        : "Tên nhãn này đã tồn tại."
      : null);

  const isFormDisabled = readOnlyReason !== null || isSubmitting;

  function handleClose() {
    if (isSubmitting) return;
    onResetError?.();
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isFormDisabled) return;

    const checked = validateCustomerTagName(name);
    if (!checked.ok) {
      setNameError(checked.error);
      return;
    }

    setNameError(null);
    onSubmit({ name: checked.value, color });
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      purpose="form"
      width={460}
    >
      <DialogHeader
        title="Tạo nhãn khách hàng"
        subtitle="Nhãn dùng chung cho toàn bộ hộp thư bình luận của công ty."
        onOpenChange={isSubmitting ? undefined : () => handleClose()}
      />
      <form onSubmit={handleSubmit} noValidate>
        <Stack direction="vertical" gap={4} padding={5}>
          <ReadOnlyNotice reason={readOnlyReason} />

          {error && !isDuplicate ? (
            <ApiErrorNotice error={error} shouldFocus={false} />
          ) : null}

          <TextInput
            label="Tên nhãn"
            description={`Tối đa ${CUSTOMER_TAG_NAME_MAX_LENGTH} ký tự (ví dụ: Khách VIP, Đã chốt đơn).`}
            placeholder="Nhập tên nhãn…"
            value={name}
            isRequired
            hasAutoFocus
            width="100%"
            isDisabled={isFormDisabled}
            disabledMessage={readOnlyReason ?? undefined}
            status={inlineNameError ? { type: "error", message: inlineNameError } : undefined}
            statusVariant="detached"
            onChange={(nextValue) => {
              setName(nextValue);
              if (nameError) setNameError(null);
              if (isDuplicate) onResetError?.();
            }}
          />

          <Stack direction="vertical" gap={2} role="group" aria-label="Chọn màu nhãn">
            <Text type="label">Màu nhãn</Text>
            <HStack gap={2} wrap="wrap">
              {CUSTOMER_TAG_COLORS.map((itemColor) => {
                const isSelected = color === itemColor;
                const label = CUSTOMER_TAG_COLOR_LABELS[itemColor];
                return (
                  <ToggleButton
                    key={itemColor}
                    size="sm"
                    className="customer-touch-target"
                    label={`Màu ${label}`}
                    isPressed={isSelected}
                    isDisabled={isFormDisabled}
                    tooltip={readOnlyReason ?? label}
                    onPressedChange={() => setColor(itemColor)}
                  >
                    <Token
                      size="sm"
                      color={CUSTOMER_TAG_TOKEN_COLORS[itemColor]}
                      label={label}
                      icon={
                        isSelected ? <Check className="size-4" aria-hidden="true" /> : undefined
                      }
                    />
                  </ToggleButton>
                );
              })}
            </HStack>
          </Stack>

          <HStack gap={2} justify="end" wrap="wrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="customer-touch-target"
              label="Huỷ"
              isDisabled={isSubmitting}
              onClick={handleClose}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="customer-touch-target"
              label={isSubmitting ? "Đang tạo nhãn…" : "Tạo nhãn"}
              isLoading={isSubmitting}
              isDisabled={isFormDisabled}
              tooltip={readOnlyReason ?? undefined}
            />
          </HStack>
        </Stack>
      </form>
    </Dialog>
  );
}
