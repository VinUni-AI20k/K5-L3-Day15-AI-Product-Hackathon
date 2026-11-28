"use client";

import { Heading, Stack, Text } from "@astryxdesign/core";

import { CreateTenantForm } from "@/ui/components/tenant/CreateTenantForm";
import type { CreateTenantFormValues } from "@/ui/schemas/tenant-onboarding.schema";

/**
 * Step 01 of the first-run wizard — "Công ty của bạn tên gì?".
 *
 * Deliberately ONE question. An earlier draft of this screen also asked what
 * the team sells, to preselect caption templates and posting hours; nothing in
 * the product consumes that answer yet, and a first screen that collects
 * something it will not use spends trust it has not earned. It comes back when
 * the templates do.
 *
 * The form itself is the same `CreateTenantForm` the switcher's "Tạo công ty
 * mới…" dialog uses (core-component-reuse) — only `slugDisplay` differs: here
 * the URL is a preview line, not a second box to fill in.
 */
export function WizardStepCreate({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (values: CreateTenantFormValues) => void;
  isPending: boolean;
  error: unknown;
}) {
  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1.5}>
        <p className="text-foreground-subtle text-sm font-medium tabular-nums">
          Bước 01 / 02
        </p>
        <Heading level={1}>
          Công ty của bạn tên gì?
        </Heading>
        <Text type="supporting" className="text-muted-foreground text-sm leading-relaxed">
          Tên hiện trên thanh trên cùng và trong mọi báo cáo. Sửa được sau; đường dẫn thì không.
        </Text>
      </Stack>

      <CreateTenantForm
        hasAutoFocus
        slugDisplay="inline"
        submitLabel="Tạo công ty và tiếp tục"
        onSubmit={onSubmit}
        isPending={isPending}
        error={error}
      />

      {/* What founding it makes you, stated before you press the button rather
          than discovered afterwards. */}
      <Text type="supporting" className="text-muted-foreground text-xs">
        Bạn là chủ công ty · múi giờ GMT+7
      </Text>
    </Stack>
  );
}
