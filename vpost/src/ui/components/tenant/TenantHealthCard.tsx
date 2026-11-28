"use client";

import { Badge, Card, HStack, Heading, Stack, Text } from "@astryxdesign/core";

import type { TenantHealth } from "@/ui/schemas/tenant-health.schema";

/**
 * Data state of the tenant health screen. Dumb by design: it receives an
 * already-validated object and renders it — no fetching, no branching on
 * business rules (docs/07 §4.1).
 */

const STATUS_LABELS: Record<TenantHealth["status"], string> = {
  active: "Đang hoạt động",
  suspended: "Tạm ngưng",
};

const STATUS_VARIANTS: Record<TenantHealth["status"], "success" | "error"> = {
  active: "success",
  suspended: "error",
};

/**
 * Fixed locale + time zone: the operators are in Vietnam, and reading the
 * browser locale during render would make server and client output differ.
 */
const TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Ho_Chi_Minh",
});

function formatCheckedAt(isoString: string): string {
  const parsed = new Date(isoString);
  // Guard: schema-valid ISO can still be an impossible date (e.g. 2026-02-31).
  if (Number.isNaN(parsed.getTime())) return isoString;
  return TIME_FORMATTER.format(parsed);
}

export interface TenantHealthCardProps {
  data: TenantHealth;
  /** True while a background refresh runs — content stays, nothing is covered. */
  isRefreshing?: boolean;
}

export function TenantHealthCard({ data, isRefreshing = false }: TenantHealthCardProps) {
  return (
    <Card padding={5} aria-busy={isRefreshing}>
      <Stack direction="vertical" gap={4}>
        <HStack gap={3} justify="between" align="center" wrap="wrap">
          <Heading level={3}>{data.name}</Heading>
          <Badge variant={STATUS_VARIANTS[data.status]} label={STATUS_LABELS[data.status]} />
        </HStack>

        <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground font-medium">Mã đơn vị</dt>
          <dd className="text-foreground font-mono text-xs break-all sm:text-sm">
            {data.tenantId}
          </dd>

          <dt className="text-muted-foreground font-medium">Kiểm tra lúc</dt>
          <dd className="text-foreground">
            <time dateTime={data.checkedAt}>{formatCheckedAt(data.checkedAt)}</time>
          </dd>

          <dt className="text-muted-foreground font-medium">Chuỗi kiểm tra</dt>
          <dd className="text-muted-foreground">
            Giao diện → API nội bộ → usecase → cơ sở dữ liệu: thông suốt.
          </dd>
        </dl>

        {isRefreshing ? (
          <Text type="supporting" size="xsm" color="secondary" aria-live="polite">
            Đang làm mới…
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
