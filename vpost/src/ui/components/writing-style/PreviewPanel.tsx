"use client";

import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  HStack,
  Heading,
  Skeleton,
  Spinner,
  Stack,
  Text,
  Typeahead,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import { Sparkles } from "lucide-react";
import { useId } from "react";

import {
  formatPreviewStats,
  type PreviewViewState,
} from "./writing-style-preview";

export interface ProductPreviewMeta {
  readonly code: string;
  readonly name: string;
  readonly meta: string;
  readonly isManual?: boolean;
}

export type ProductPreviewOption = SearchableItem<ProductPreviewMeta>;

export interface PreviewPanelProps {
  readonly scopeLabel: string;
  readonly isDirty: boolean;
  readonly selectedProduct: ProductPreviewOption | null;
  readonly onSelectProduct: (product: ProductPreviewOption | null) => void;
  readonly searchSource: SearchSource<ProductPreviewOption>;
  readonly catalogError: string | null;
  readonly viewState: PreviewViewState;
  readonly announcement: string;
  readonly readOnlyReason: string | null;
  readonly onRunPreview: () => void;
}

export function PreviewPanel({
  scopeLabel,
  isDirty,
  selectedProduct,
  onSelectProduct,
  searchSource,
  catalogError,
  viewState,
  announcement,
  readOnlyReason,
  onRunPreview,
}: PreviewPanelProps) {
  const headingId = useId();
  const isReadOnly = readOnlyReason !== null;
  const isLoading = viewState.status === "loading";
  const hasProduct = selectedProduct !== null && selectedProduct.id.trim().length > 0;

  const previewDisabledTooltip = isReadOnly
    ? (readOnlyReason ?? undefined)
    : isLoading
      ? "Đang viết thử bài đăng…"
      : !hasProduct
        ? "Chọn một sản phẩm trước khi bấm Viết thử."
        : undefined;

  return (
    <Card padding={5} aria-labelledby={headingId}>
      <Stack direction="vertical" gap={4}>
        <Stack direction="vertical" gap={1}>
          <HStack gap={2} justify="between" align="center" wrap="wrap">
            <Heading level={2} id={headingId}>
              Viết thử
            </Heading>
            {isDirty ? <Badge variant="info" label="Đang dùng bản chưa lưu" /> : null}
          </HStack>
          <Text type="supporting" color="secondary">
            Thử ngay phong cách đang nhập cho “{scopeLabel}” trên một sản phẩm thật. Không lưu
            cấu hình và không đăng bài.
          </Text>
        </Stack>

        <Stack direction="vertical" gap={3}>
          <Typeahead<ProductPreviewOption>
            label="Sản phẩm viết thử"
            description="Chọn sản phẩm từ danh mục hoặc gõ mã sản phẩm để kiểm tra."
            searchSource={searchSource}
            value={selectedProduct}
            onChange={onSelectProduct}
            hasEntriesOnFocus
            hasClear
            maxMenuItems={10}
            width="100%"
            placeholder="Tìm theo mã hoặc tên sản phẩm…"
            emptySearchResultsText="Không có sản phẩm khớp trong danh mục"
            isDisabled={isReadOnly || isLoading}
            disabledMessage={
              isReadOnly ? (readOnlyReason ?? undefined) : "Đang viết thử bài đăng…"
            }
            status={catalogError ? { type: "warning", message: catalogError } : undefined}
            statusVariant="detached"
            renderItem={(item) => (
              <Stack direction="vertical" gap={0.5}>
                <HStack gap={2} justify="between" align="center">
                  <Text weight="medium">{item.auxiliaryData?.code ?? item.id}</Text>
                  {item.auxiliaryData?.meta ? (
                    <Text type="supporting" color="secondary">
                      {item.auxiliaryData.meta}
                    </Text>
                  ) : null}
                </HStack>
                <Text type="supporting" color="secondary" maxLines={1}>
                  {item.auxiliaryData?.name ?? item.label}
                </Text>
              </Stack>
            )}
          />

          <Button
            type="button"
            variant="secondary"
            width="100%"
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            label="Viết thử"
            isLoading={isLoading}
            isDisabled={isReadOnly || isLoading || !hasProduct}
            tooltip={previewDisabledTooltip}
            onClick={onRunPreview}
          />
        </Stack>

        <Divider />

        {/* Polite live region so assistive tech hears preview transitions without stealing focus. */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {viewState.status === "idle" ? (
          <EmptyState
            isCompact
            headingLevel={3}
            icon={
              <div className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
            }
            title="Chưa có bản viết thử"
            description="Chọn một sản phẩm rồi bấm “Viết thử” để xem AI viết theo phong cách hiện tại."
          />
        ) : null}

        {viewState.status === "loading" ? (
          <Stack direction="vertical" gap={3} aria-busy="true">
            <HStack gap={2} align="center">
              <Spinner size="sm" />
              <Text type="supporting" color="secondary">
                Đang viết thử theo phong cách đang nhập…
              </Text>
            </HStack>
            <Skeleton width="100%" height={20} index={0} />
            <Skeleton width="100%" height={96} index={1} />
            <Skeleton width="65%" height={16} index={2} />
          </Stack>
        ) : null}

        {viewState.status === "rate-limited" ? (
          <Banner
            status="warning"
            title={viewState.error.title}
            description={
              viewState.error.hint
                ? `${viewState.error.description} ${viewState.error.hint}`
                : viewState.error.description
            }
            endContent={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                label="Thử lại"
                isDisabled={isReadOnly || !hasProduct}
                tooltip={isReadOnly ? (readOnlyReason ?? undefined) : undefined}
                onClick={onRunPreview}
              />
            }
          />
        ) : null}

        {viewState.status === "error" ? (
          <Banner
            status="error"
            title={viewState.error.title}
            description={
              viewState.error.hint
                ? `${viewState.error.description} ${viewState.error.hint}`
                : viewState.error.description
            }
            endContent={
              viewState.error.canRetry ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  label="Thử lại"
                  isDisabled={isReadOnly || !hasProduct}
                  tooltip={isReadOnly ? (readOnlyReason ?? undefined) : undefined}
                  onClick={onRunPreview}
                />
              ) : undefined
            }
          />
        ) : null}

        {viewState.status === "flag" ? (
          <Stack direction="vertical" gap={3}>
            <Banner
              status="warning"
              title="Bài bị gắn cờ kiểm tra"
              description="Bản viết thử chưa đạt kiểm duyệt tự động. Xem các lý do bên dưới để điều chỉnh phong cách hoặc dữ liệu sản phẩm."
              defaultIsExpanded
            >
              {viewState.data.reasons.length > 0 ? (
                <Stack direction="vertical" gap={1.5}>
                  {viewState.data.reasons.map((reason, index) => (
                    <Text key={`${reason.field}-${index}`} type="supporting" display="block">
                      <Text weight="medium">{reason.field}:</Text> {reason.issue}
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Banner>

            {viewState.data.warnings.length > 0 ? (
              <Banner
                status="warning"
                title={`Có ${viewState.data.warnings.length} lưu ý`}
                defaultIsExpanded
              >
                <Stack direction="vertical" gap={1}>
                  {viewState.data.warnings.map((warning, index) => (
                    <Text key={`${warning}-${index}`} type="supporting" display="block">
                      {warning}
                    </Text>
                  ))}
                </Stack>
              </Banner>
            ) : null}

            {viewState.data.post.trim().length > 0 ? (
              <Card variant="muted" padding={5}>
                <Text display="block" className="leading-relaxed break-words whitespace-pre-wrap">
                  {viewState.data.post}
                </Text>
              </Card>
            ) : null}

            <Text type="supporting" color="secondary" hasTabularNumbers>
              {formatPreviewStats(viewState.data)}
            </Text>
          </Stack>
        ) : null}

        {viewState.status === "write" ? (
          <Stack direction="vertical" gap={3}>
            <HStack gap={2} justify="between" align="center" wrap="wrap">
              <Badge variant="success" label="Đạt kiểm tra" />
              {selectedProduct ? (
                <Text type="code" color="secondary">
                  {selectedProduct.auxiliaryData?.code ?? selectedProduct.id}
                </Text>
              ) : null}
            </HStack>

            <Card variant="muted" padding={5}>
              <Text display="block" className="leading-relaxed break-words whitespace-pre-wrap">
                {viewState.data.post}
              </Text>
            </Card>

            {viewState.data.warnings.length > 0 ? (
              <Banner
                status="warning"
                title={`Có ${viewState.data.warnings.length} lưu ý`}
                defaultIsExpanded
              >
                <Stack direction="vertical" gap={1}>
                  {viewState.data.warnings.map((warning, index) => (
                    <Text key={`${warning}-${index}`} type="supporting" display="block">
                      {warning}
                    </Text>
                  ))}
                </Stack>
              </Banner>
            ) : null}

            <Text type="supporting" color="secondary" hasTabularNumbers>
              {formatPreviewStats(viewState.data)}
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
