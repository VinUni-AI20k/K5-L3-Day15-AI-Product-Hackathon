"use client";

import {
  AlertDialog,
  Banner,
  Button,
  HStack,
  Heading,
  Layout,
  LayoutContent,
  LayoutHeader,
  Skeleton,
  Stack,
  Text,
  type SearchSource,
} from "@astryxdesign/core";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { selectableSuggestions } from "@/ui/components/compose/product-suggestions";
import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { presentApiError, toApiError } from "@/ui/components/feedback/present-api-error";
import { useChannels } from "@/ui/hooks/useChannels";
import { useDelayedFlag } from "@/ui/hooks/useDelayedFlag";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import {
  useChannelWritingStyle,
  useDeleteChannelWritingStyle,
  usePreviewWritingStyle,
  useSaveWritingStyle,
  useWritingStyleOverview,
} from "@/ui/hooks/useWritingStyle";
import { abortWithReason, isAbortError } from "@/ui/services/abort";
import { listCatalogProducts } from "@/ui/services/catalog.api";

import { PreviewPanel, type ProductPreviewOption } from "./PreviewPanel";
import { ScopeSelector } from "./ScopeSelector";
import {
  WritingStyleForm,
  type FocusFieldTarget,
} from "./WritingStyleForm";
import {
  UNSAVED_CHANGES_DIALOG_COPY,
  shouldInterceptAnchorNavigation,
  shouldWarnBeforeUnload,
  type PendingDirtyNavigation,
} from "./writing-style-dirty-guard";
import {
  DEFAULT_SCOPE,
  createEmptyDraft,
  draftFromStyle,
  isDraftDirty,
  mapServerFieldErrors,
  styleFromDraft,
  validateWritingStyleDraft,
  type FieldErrorMap,
  type ListItemErrorMap,
  type WritingStyleDraft,
  type WritingStyleScope,
} from "./writing-style-form";
import {
  buildScopeOptions,
  resolveInheritedBase,
} from "./writing-style-inheritance";
import {
  buildPreviewAnnouncement,
  derivePreviewViewState,
} from "./writing-style-preview";

const PRODUCT_PICKER_LIMIT = 10;

export interface WritingStyleProductSearchDeps {
  readonly setCatalogError: (message: string | null) => void;
  readonly fetchProducts?: typeof listCatalogProducts;
}

export interface WritingStyleProductSearchSource extends SearchSource<ProductPreviewOption> {
  /** Aborts any in-flight search with an explicit lifecycle reason (e.g. unmount). */
  readonly dispose: (reason?: string) => void;
}

/**
 * Builds the product picker `SearchSource` backed by `listCatalogProducts`.
 * Exported so unit tests can exercise superseding/cancelling searches without a DOM:
 *  - every abort carries a meaningful `AbortError` reason;
 *  - intentional aborts resolve cleanly to `[]` without setting `catalogError`;
 *  - real API/network errors still populate `catalogError` and offer manual code entry.
 */
export function createWritingStyleProductSearchSource({
  setCatalogError,
  fetchProducts = listCatalogProducts,
}: WritingStyleProductSearchDeps): WritingStyleProductSearchSource {
  let activeController: AbortController | null = null;

  async function runSearch(query: string): Promise<ProductPreviewOption[]> {
    abortWithReason(activeController, "writing-style: product search superseded");
    const controller = new AbortController();
    activeController = controller;

    const q = query.trim();
    try {
      const response = await fetchProducts(
        { filter: { status: "ok", q: q.length > 0 ? q : null }, limit: PRODUCT_PICKER_LIMIT },
        controller.signal,
      );
      if (controller.signal.aborted) return [];
      setCatalogError(null);
      const suggestions = selectableSuggestions(response.items);
      const options: ProductPreviewOption[] = suggestions.map((item) => ({
        id: item.code,
        label: `${item.code} — ${item.name}`,
        auxiliaryData: {
          code: item.code,
          name: item.name,
          meta: item.meta,
        },
      }));

      if (
        q.length > 0 &&
        !options.some((opt) => opt.id.toLowerCase() === q.toLowerCase())
      ) {
        const normalizedCode = q.toUpperCase();
        options.push({
          id: normalizedCode,
          label: `Dùng mã “${normalizedCode}”`,
          auxiliaryData: {
            code: normalizedCode,
            name: "Nhập tay mã sản phẩm để viết thử",
            meta: "Mã nhập tay",
            isManual: true,
          },
        });
      }
      return options;
    } catch (error) {
      if (isAbortError(error, controller.signal)) return [];
      const view = presentApiError(toApiError(error));
      setCatalogError(
        `${view.title}. Bạn vẫn có thể gõ thẳng mã sản phẩm để viết thử.`,
      );
      if (q.length > 0) {
        const normalizedCode = q.toUpperCase();
        return [
          {
            id: normalizedCode,
            label: `Dùng mã “${normalizedCode}”`,
            auxiliaryData: {
              code: normalizedCode,
              name: "Nhập tay mã sản phẩm để viết thử",
              meta: "Mã nhập tay",
              isManual: true,
            },
          },
        ];
      }
      return [];
    } finally {
      if (activeController === controller) activeController = null;
    }
  }

  return {
    bootstrap: () => runSearch(""),
    search: (query) => runSearch(query),
    cancel: () => {
      abortWithReason(activeController, "writing-style: product search cancelled");
      activeController = null;
    },
    dispose: (reason = "writing-style: component unmounted") => {
      abortWithReason(activeController, reason);
      activeController = null;
    },
  };
}

export function WritingStyleScreen() {
  const router = useRouter();
  const readOnlyReason = useReadOnlyReason();

  const overview = useWritingStyleOverview();
  const channels = useChannels();

  const [activeScope, setActiveScope] = useState<WritingStyleScope>(DEFAULT_SCOPE);
  const channelQuery = useChannelWritingStyle(
    activeScope === DEFAULT_SCOPE ? null : activeScope,
  );

  const saveMutation = useSaveWritingStyle();
  const deleteMutation = useDeleteChannelWritingStyle();
  const previewMutation = usePreviewWritingStyle();

  const [localEdit, setLocalEdit] = useState<{
    readonly scope: WritingStyleScope;
    readonly draft: WritingStyleDraft;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [itemErrors, setItemErrors] = useState<ListItemErrorMap>({});
  const [unmappedServerErrors, setUnmappedServerErrors] = useState<readonly string[]>([]);
  const [focusTarget, setFocusTarget] = useState<FocusFieldTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingDirtyNavigation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductPreviewOption | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const focusNonceRef = useRef(0);
  const noticeRef = useRef<HTMLDivElement>(null);

  const scopeOptions = useMemo(
    () => buildScopeOptions(channels.data?.channels ?? [], overview.data),
    [channels.data?.channels, overview.data],
  );

  const activeScopeOption = useMemo(
    () => scopeOptions.find((item) => item.scope === activeScope) ?? scopeOptions[0],
    [scopeOptions, activeScope],
  );
  const activeScopeLabel = activeScopeOption?.label ?? "Mặc định công ty";

  const isChannelScope = activeScope !== DEFAULT_SCOPE;

  // Resolve the server style currently authoritative for `activeScope`.
  const activeServerStyle = useMemo(() => {
    if (!overview.data) return undefined;
    if (!isChannelScope) return overview.data.default;
    if (channelQuery.data && channelQuery.data.channelId === activeScope) {
      return channelQuery.data.style;
    }
    const fromOverview = overview.data.overrides.find(
      (item) => item.channelId === activeScope,
    );
    return fromOverview?.style ?? {};
  }, [overview.data, isChannelScope, channelQuery.data, activeScope]);

  const serverDraft = useMemo(
    () => (activeServerStyle ? draftFromStyle(activeServerStyle) : createEmptyDraft()),
    [activeServerStyle],
  );

  const draft =
    localEdit && localEdit.scope === activeScope ? localEdit.draft : serverDraft;

  const isDirty = useMemo(
    () => isDraftDirty(serverDraft, draft),
    [serverDraft, draft],
  );

  const inheritedStyle = useMemo(
    () => resolveInheritedBase(activeScope, overview.data, channelQuery.data),
    [activeScope, overview.data, channelQuery.data],
  );

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  // Tab close / hard reload guard while dirty.
  useEffect(() => {
    if (!shouldWarnBeforeUnload(isDirty, saveMutation.isPending)) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saveMutation.isPending]);

  // In-app anchor navigation guard (sidebar, top bar, command links) while dirty.
  useEffect(() => {
    if (!shouldWarnBeforeUnload(isDirty, saveMutation.isPending)) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const rawHref = anchor.getAttribute("href") ?? "";
      const shouldBlock = shouldInterceptAnchorNavigation({
        isDirty,
        isSaving: saveMutation.isPending,
        currentHref: window.location.href,
        targetHref: rawHref,
        targetAttr: anchor.getAttribute("target"),
        hasDownloadAttr: anchor.hasAttribute("download"),
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });

      if (!shouldBlock) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingNav({ kind: "route", href: rawHref });
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [isDirty, saveMutation.isPending]);

  const applyScopeSwitch = useCallback(
    (nextScope: WritingStyleScope) => {
      setLocalEdit(null);
      setActiveScope(nextScope);
      setFieldErrors({});
      setItemErrors({});
      setUnmappedServerErrors([]);
      setNotice(null);
      saveMutation.reset();
      deleteMutation.reset();
      previewMutation.reset();
    },
    [saveMutation, deleteMutation, previewMutation],
  );

  const handleRequestScopeChange = useCallback(
    (nextScope: WritingStyleScope) => {
      if (nextScope === activeScope) return;
      if (isDirty) {
        setPendingNav({ kind: "scope", nextScope });
        return;
      }
      applyScopeSwitch(nextScope);
    },
    [activeScope, isDirty, applyScopeSwitch],
  );

  const handleRequestReload = useCallback(() => {
    if (isDirty) {
      setPendingNav({ kind: "reload" });
      return;
    }
    setLocalEdit(null);
    void overview.refetch();
    void channels.refetch();
    if (isChannelScope) void channelQuery.refetch();
  }, [isDirty, overview, channels, isChannelScope, channelQuery]);

  function handleConfirmDiscardNavigation() {
    const action = pendingNav;
    setPendingNav(null);
    if (!action) return;

    if (action.kind === "scope") {
      applyScopeSwitch(action.nextScope);
      return;
    }

    if (action.kind === "reload") {
      setLocalEdit(null);
      setFieldErrors({});
      setItemErrors({});
      setUnmappedServerErrors([]);
      void overview.refetch();
      void channels.refetch();
      if (isChannelScope) void channelQuery.refetch();
      return;
    }

    if (action.kind === "route") {
      setLocalEdit(null);
      router.push(action.href);
      return;
    }

    if (action.kind === "back") {
      setLocalEdit(null);
      router.back();
    }
  }

  function triggerFocus(field: FocusFieldTarget["field"], itemIndex: number | null) {
    focusNonceRef.current += 1;
    setFocusTarget({ field, itemIndex, nonce: focusNonceRef.current });
  }

  function handleChangeDraft(next: WritingStyleDraft) {
    setLocalEdit({ scope: activeScope, draft: next });
    if (notice) setNotice(null);
    if (
      Object.keys(fieldErrors).length > 0 ||
      Object.keys(itemErrors).length > 0 ||
      unmappedServerErrors.length > 0
    ) {
      setFieldErrors({});
      setItemErrors({});
      setUnmappedServerErrors([]);
    }
  }

  function handleDiscardChanges() {
    setLocalEdit(null);
    setFieldErrors({});
    setItemErrors({});
    setUnmappedServerErrors([]);
    saveMutation.reset();
    setNotice(null);
  }

  function handleSubmit() {
    setNotice(null);
    const validation = validateWritingStyleDraft(draft);
    if (!validation.isValid) {
      setFieldErrors(validation.fieldErrors);
      setItemErrors(validation.itemErrors);
      setUnmappedServerErrors([]);
      if (validation.firstInvalidField) {
        triggerFocus(validation.firstInvalidField, validation.firstInvalidItemIndex);
      }
      return;
    }

    const payload = styleFromDraft(draft);
    saveMutation.mutate(
      { scope: activeScope, style: payload },
      {
        onSuccess: () => {
          setLocalEdit(null);
          setFieldErrors({});
          setItemErrors({});
          setUnmappedServerErrors([]);
          setNotice(
            activeScope === DEFAULT_SCOPE
              ? "Đã lưu phong cách viết mặc định công ty."
              : `Đã lưu phong cách viết riêng cho “${activeScopeOption?.channelName ?? activeScope}”.`,
          );
        },
        onError: (error) => {
          if (isAbortError(error)) return;
          const mapped = mapServerFieldErrors(error);
          if (
            mapped.firstInvalidField !== null ||
            mapped.unmappedMessages.length > 0
          ) {
            setFieldErrors(mapped.fieldErrors);
            setItemErrors(mapped.itemErrors);
            setUnmappedServerErrors(mapped.unmappedMessages);
            if (mapped.firstInvalidField) {
              triggerFocus(mapped.firstInvalidField, mapped.firstInvalidItemIndex);
            }
          } else {
            setUnmappedServerErrors([presentApiError(toApiError(error)).description]);
          }
        },
      },
    );
  }

  function handleDeleteOverride(channelId: string) {
    setNotice(null);
    deleteMutation.mutate(
      { channelId },
      {
        onSuccess: () => {
          setLocalEdit(null);
          setFieldErrors({});
          setItemErrors({});
          setUnmappedServerErrors([]);
          previewMutation.reset();
          setNotice(
            `Đã xoá thiết lập riêng của “${activeScopeOption?.channelName ?? channelId}”. Page này hiện dùng Mặc định công ty.`,
          );
        },
      },
    );
  }

  // Product picker SearchSource backed by existing `listCatalogProducts`.
  const productSearchSource = useMemo(
    () =>
      createWritingStyleProductSearchSource({
        setCatalogError,
      }),
    [],
  );

  useEffect(
    () => () => {
      productSearchSource.dispose("writing-style: component unmounted");
    },
    [productSearchSource],
  );

  function handleRunPreview() {
    if (!selectedProduct) return;
    const validation = validateWritingStyleDraft(draft);
    if (!validation.isValid) {
      setFieldErrors(validation.fieldErrors);
      setItemErrors(validation.itemErrors);
      setUnmappedServerErrors([]);
      if (validation.firstInvalidField) {
        triggerFocus(validation.firstInvalidField, validation.firstInvalidItemIndex);
      }
      return;
    }

    previewMutation.mutate(
      {
        channelId: isChannelScope ? activeScope : undefined,
        productCode: selectedProduct.id,
        style: styleFromDraft(draft),
      },
      {
        onError: (error) => {
          if (isAbortError(error)) return;
          const mapped = mapServerFieldErrors(error);
          if (mapped.firstInvalidField !== null) {
            setFieldErrors(mapped.fieldErrors);
            setItemErrors(mapped.itemErrors);
            triggerFocus(mapped.firstInvalidField, mapped.firstInvalidItemIndex);
          }
        },
      },
    );
  }

  const previewViewState = useMemo(
    () =>
      derivePreviewViewState({
        isPending: previewMutation.isPending,
        data: previewMutation.data,
        error:
          previewMutation.isError && !isAbortError(previewMutation.error)
            ? previewMutation.error
            : null,
      }),
    [previewMutation.isPending, previewMutation.data, previewMutation.isError, previewMutation.error],
  );

  const previewAnnouncement = useMemo(
    () => buildPreviewAnnouncement(previewViewState, selectedProduct?.id ?? null),
    [previewViewState, selectedProduct?.id],
  );

  const showInitialSkeleton = useDelayedFlag(
    overview.isPending && overview.fetchStatus === "fetching",
  );
  const showChannelSkeleton = useDelayedFlag(
    isChannelScope && channelQuery.isPending && channelQuery.fetchStatus === "fetching",
  );

  return (
    <Layout
      height="auto"
      header={
        <LayoutHeader hasDivider>
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
            <Stack direction="vertical" gap={1.5}>
              <HStack gap={3} justify="between" align="center" wrap="wrap">
                <Heading level={1}>Phong cách viết</Heading>
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  icon={<RefreshCw className="size-4" aria-hidden="true" />}
                  label="Tải lại cấu hình phong cách viết"
                  isLoading={overview.isFetching || channelQuery.isFetching}
                  isDisabled={overview.isFetching || channelQuery.isFetching}
                  onClick={handleRequestReload}
                >
                  Tải lại
                </Button>
              </HStack>
              <Text type="supporting" color="secondary" className="max-w-prose">
                Cấu hình giọng văn, xưng hô, độ dài, hashtag và bài mẫu cho bài đăng và gợi ý
                trả lời bình luận — áp dụng chung toàn công ty hoặc riêng từng Page.
              </Text>
            </Stack>
          </div>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            <Stack direction="vertical" gap={6}>
              {readOnlyReason ? (
                <Banner
                  status="info"
                  title="Phiên đang ở chế độ chỉ xem"
                  description={readOnlyReason}
                />
              ) : null}

              {notice ? (
                <Banner
                  ref={noticeRef}
                  tabIndex={-1}
                  status="success"
                  title={notice}
                  isDismissable
                  onDismiss={() => setNotice(null)}
                />
              ) : null}

              {deleteMutation.isError && !isAbortError(deleteMutation.error) ? (
                <ApiErrorNotice error={deleteMutation.error} />
              ) : null}

              {showInitialSkeleton ? <WritingStyleSkeleton /> : null}

              {!showInitialSkeleton && overview.isError && !isAbortError(overview.error) ? (
                <ApiErrorNotice
                  error={overview.error}
                  onRetry={() => void overview.refetch()}
                />
              ) : null}

              {!(overview.isError && !isAbortError(overview.error)) && overview.data ? (
                <>
                  <ScopeSelector
                    options={scopeOptions}
                    activeScope={activeScope}
                    isLoadingChannels={channels.isPending}
                    isDeleting={deleteMutation.isPending}
                    readOnlyReason={readOnlyReason}
                    onSelectScope={handleRequestScopeChange}
                    onDeleteOverride={handleDeleteOverride}
                  />

                  {isChannelScope && channelQuery.isError && !isAbortError(channelQuery.error) ? (
                    <ApiErrorNotice
                      error={channelQuery.error}
                      onRetry={() => void channelQuery.refetch()}
                      extraAction={
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          label="Về Mặc định công ty"
                          onClick={() => applyScopeSwitch(DEFAULT_SCOPE)}
                        />
                      }
                    />
                  ) : showChannelSkeleton ? (
                    <WritingStyleSkeleton />
                  ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                      <div className="lg:col-span-7">
                        <WritingStyleForm
                          scopeLabel={activeScopeLabel}
                          isChannelScope={isChannelScope}
                          draft={draft}
                          inheritedStyle={inheritedStyle}
                          fieldErrors={fieldErrors}
                          itemErrors={itemErrors}
                          unmappedServerErrors={unmappedServerErrors}
                          focusTarget={focusTarget}
                          isDirty={isDirty}
                          isSaving={saveMutation.isPending}
                          readOnlyReason={readOnlyReason}
                          onChangeDraft={handleChangeDraft}
                          onSubmit={handleSubmit}
                          onDiscard={handleDiscardChanges}
                        />
                      </div>

                      <div className="lg:sticky lg:top-6 lg:col-span-5 lg:self-start">
                        <PreviewPanel
                          scopeLabel={activeScopeLabel}
                          isDirty={isDirty}
                          selectedProduct={selectedProduct}
                          onSelectProduct={setSelectedProduct}
                          searchSource={productSearchSource}
                          catalogError={catalogError}
                          viewState={previewViewState}
                          announcement={previewAnnouncement}
                          readOnlyReason={readOnlyReason}
                          onRunPreview={handleRunPreview}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              <AlertDialog
                isOpen={pendingNav !== null}
                onOpenChange={(isOpen) => {
                  if (!isOpen) setPendingNav(null);
                }}
                title={UNSAVED_CHANGES_DIALOG_COPY.title}
                description={UNSAVED_CHANGES_DIALOG_COPY.description}
                actionLabel={UNSAVED_CHANGES_DIALOG_COPY.actionLabel}
                actionVariant="destructive"
                cancelLabel={UNSAVED_CHANGES_DIALOG_COPY.cancelLabel}
                onAction={handleConfirmDiscardNavigation}
              />
            </Stack>
          </div>
        </LayoutContent>
      }
    />
  );
}

function WritingStyleSkeleton() {
  return (
    <Stack direction="vertical" gap={6} aria-hidden="true">
      <div className="bg-card border-border rounded-xl border p-5">
        <Stack direction="vertical" gap={3}>
          <Skeleton width="35%" height={18} index={0} />
          <Skeleton width="100%" height={40} index={1} />
          <Skeleton width="55%" height={14} index={2} />
        </Stack>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Stack direction="vertical" gap={6}>
            <div className="bg-card border-border rounded-xl border p-5">
              <Stack direction="vertical" gap={3}>
                <Skeleton width="40%" height={22} index={0} />
                <Skeleton width="100%" height={40} index={1} />
                <Skeleton width="100%" height={76} index={2} />
              </Stack>
            </div>
            <div className="bg-card border-border rounded-xl border p-5">
              <Stack direction="vertical" gap={3}>
                <Skeleton width="45%" height={22} index={3} />
                <Skeleton width="100%" height={84} index={4} />
                <Skeleton width="100%" height={40} index={5} />
              </Stack>
            </div>
          </Stack>
        </div>
        <div className="lg:col-span-5">
          <div className="bg-card border-border rounded-xl border p-5">
            <Stack direction="vertical" gap={3}>
              <Skeleton width="35%" height={22} index={6} />
              <Skeleton width="100%" height={40} index={7} />
              <Skeleton width="100%" height={40} index={8} />
              <Skeleton width="100%" height={120} index={9} />
            </Stack>
          </div>
        </div>
      </div>
    </Stack>
  );
}
