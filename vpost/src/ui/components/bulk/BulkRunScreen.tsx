"use client";

import {
  Collapsible,
  Heading,
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  CAPTION_TONES,
  CAPTION_TONE_LABELS,
  DEFAULT_CAPTION_TONE,
} from "@/shared/caption-tone";
import {
  MAX_SPACING_MS,
  MS_PER_MINUTE,
  RECOMMENDED_MIN_SPACING_MS,
  spacingMinutesToMs,
} from "@/shared/publish-spacing";
import { cn } from "@/shared/utils";
import { BulkCodesField } from "@/ui/components/bulk/BulkCodesField";
import { BulkProgressTable } from "@/ui/components/bulk/BulkProgressTable";
import { channelLabelIndex, pruneSelection } from "@/ui/components/channels/channel-option-labels";
import { avatarToneStyle, channelInitials } from "@/ui/components/compose/channel-picker";
import { ChannelPickerDialog } from "@/ui/components/compose/ChannelPickerDialog";
import { EmptyState } from "@/ui/components/feedback/EmptyState";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { SchedulePicker } from "@/ui/components/scheduled/SchedulePicker";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Progress } from "@/ui/components/ui/progress";
import { Select } from "@/ui/components/ui/select";
import { Textarea } from "@/ui/components/ui/textarea";
import { writeGate } from "@/ui/hooks/read-only-gate";
import { useBulkRun } from "@/ui/hooks/useBulkRun";
import { useChannelGroups } from "@/ui/hooks/useChannelGroups";
import { useChannels } from "@/ui/hooks/useChannels";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import { useScheduleChoice } from "@/ui/hooks/useScheduleChoice";
import {
  BULK_CAPTION_MODES,
  BULK_CAPTION_MODE_LABELS,
  BulkRunFormSchema,
  CAPTION_TEMPLATE_VARIABLES,
  findUnknownTemplateVariables,
  parseBulkCodes,
  renderCaptionTemplate,
  type BulkRunFormValues,
} from "@/ui/schemas/bulk.schema";

/**
 * "Chạy hàng loạt" (E10.5): component -> hook -> service -> internal API.
 */

/** Why the run trigger is off before a single code has been typed. */
const EMPTY_CODES_REASON =
  "Chưa có mã nào để chạy — nhập ít nhất một mã sản phẩm vào ô phía trên.";

/**
 * The one sentence about what closing the tab costs, said where the decision is
 * made — beside the trigger, not in an intro paragraph nobody rereads.
 */
const TAB_BOUNDARY_NOTICE =
  "Đóng tab: các lô ĐÃ tạo vẫn đăng tiếp trên máy chủ; các mã CHƯA tạo lô sẽ dừng.";

export function BulkRunScreen() {
  const codesId = useId();
  const templateId = useId();
  const captionModeId = useId();
  const captionToneId = useId();
  const spacingId = useId();
  const detailsId = useId();

  const groups = useChannelGroups();
  const channels = useChannels();
  const run = useBulkRun();
  const schedule = useScheduleChoice();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [channelError, setChannelError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // "Chi tiết" sống ở header nhưng mở khối ở dưới, nên state phải nằm ở đây.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [ranScheduled, setRanScheduled] = useState(false);
  const [previewCodeIndex, setPreviewCodeIndex] = useState(0);
  const [tableFilter, setTableFilter] = useState<"all" | "done" | "issues">("all");

  const form = useForm<BulkRunFormValues>({
    resolver: zodResolver(BulkRunFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      codesText: "",
      captionMode: "ai",
      captionTone: DEFAULT_CAPTION_TONE,
      spacingMinutes: "",
      captionTemplate: "",
    },
  });

  const codesText = useWatch({ control: form.control, name: "codesText" }) ?? "";
  const captionMode = useWatch({ control: form.control, name: "captionMode" }) ?? "ai";
  const captionTone =
    useWatch({ control: form.control, name: "captionTone" }) ?? DEFAULT_CAPTION_TONE;
  const spacingMinutes = useWatch({ control: form.control, name: "spacingMinutes" }) ?? "";
  const captionTemplate = useWatch({ control: form.control, name: "captionTemplate" }) ?? "";

  const parsed = useMemo(() => parseBulkCodes(codesText), [codesText]);
  const unknownVariables = useMemo(
    () => findUnknownTemplateVariables(captionTemplate),
    [captionTemplate],
  );

  const prune = useMemo(
    () => pruneSelection(selected, channels.data?.channels),
    [selected, channels.data],
  );
  const runnableSelection = useMemo(
    () => (prune.changed ? new Set(prune.next) : selected),
    [prune, selected],
  );

  const selectedIds = useMemo(() => [...runnableSelection], [runnableSelection]);
  const groupItems = groups.data?.groups ?? [];
  const { phase, summary, rows, isRunning, toneDropped } = run;

  const shownChannels = selectedIds.slice(0, 5);
  const channelLabels = channelLabelIndex(shownChannels, channels.data?.channels);

  const gate = writeGate(useReadOnlyReason(), isRunning);

  /** Có nhập, là số hợp lệ, lớn hơn 0 và nhỏ hơn mức khuyên dùng. */
  const isBelowRecommendedSpacing = (() => {
    const raw = spacingMinutes.trim();
    if (raw.length === 0) return false;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return false;
    return minutes * MS_PER_MINUTE < RECOMMENDED_MIN_SPACING_MS;
  })();

  const hasNoCodes = parsed.codes.length === 0;
  const runBlockedReason = gate.reason ?? (hasNoCodes ? EMPTY_CODES_REASON : null);

  useEffect(() => {
    if (phase === "finished") summaryRef.current?.focus();
  }, [phase]);

  function toggleGroup(channelIds: readonly string[], checked: boolean) {
    setChannelError(null);
    setSelected((current) => {
      const next = new Set(current);
      for (const channelId of channelIds) {
        if (checked) next.add(channelId);
        else next.delete(channelId);
      }
      return next;
    });
  }

  function handleInsertVariable(varName: string) {
    const current = form.getValues("captionTemplate") || "";
    form.setValue("captionTemplate", `${current}{${varName}}`, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function handleSubmit(values: BulkRunFormValues) {
    if (selectedIds.length === 0) {
      setChannelError("Chọn ít nhất một kênh để đăng.");
      return;
    }
    setChannelError(null);

    const resolved = schedule.resolve();
    if (!resolved.ok) return;
    setRanScheduled(resolved.scheduledAt !== null);

    void run.start({
      codes: parseBulkCodes(values.codesText).codes.map((item) => item.code),
      channelIds: selectedIds,
      captionMode: values.captionMode,
      captionTone: values.captionTone,
      // Rỗng = để máy chủ dùng cấu hình công ty. `0` là lựa chọn thật, nên
      // kiểm bằng độ dài chuỗi chứ không bằng tính chân trị của con số.
      spacingMs:
        values.spacingMinutes.trim().length > 0
          ? spacingMinutesToMs(Number(values.spacingMinutes.trim()))
          : null,
      captionTemplate: values.captionTemplate,
      scheduledAt: resolved.scheduledAt,
    });
  }

  const totalCodesCount = parsed.codes.length;
  const totalChannelsCount = selectedIds.length;
  const estimatedTotalPosts = totalCodesCount * totalChannelsCount;
  const estimatedDurationMinutes = Math.max(1, Math.ceil((estimatedTotalPosts * 4) / 60));
  const progressPercent =
    summary.total > 0 ? Math.min(100, Math.round((summary.processed / summary.total) * 100)) : 0;

  const currentPreviewCode =
    parsed.codes.length > 0
      ? parsed.codes[Math.min(previewCodeIndex, parsed.codes.length - 1)].code
      : "";

  const filteredRows = useMemo(() => {
    if (tableFilter === "done") return rows.filter((r) => r.status === "done");
    if (tableFilter === "issues")
      return rows.filter(
        (r) => r.status === "skipped" || r.status === "error" || r.status === "cancelled",
      );
    return rows;
  }, [rows, tableFilter]);

  return (
    <>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={0}>
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 sm:py-8 xl:max-w-7xl">
              <div className="max-w-prose space-y-1">
                <Heading level={1}>Chạy hàng loạt</Heading>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Nhập danh sách mã sản phẩm, chọn Fanpage và duyệt nội dung trước khi xuất bản.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  aria-expanded={detailsOpen}
                  aria-controls={detailsId}
                  onClick={() => setDetailsOpen((open) => !open)}
                  className="min-h-10 px-4"
                >
                  Chi tiết
                </Button>
              </div>
            </div>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0} isScrollable>
            <div className="relative mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 xl:max-w-7xl">
              <ScopeDisclosure id={detailsId} isOpen={detailsOpen} onOpenChange={setDetailsOpen} />

              {/* Main responsive 2-column layout */}
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
                {/* Cột trái: các thẻ bước của form, mỗi thẻ tự mang ô rail của nó */}
                <div className="min-w-0 lg:col-span-7">
                  <form
                    noValidate
                    className="space-y-6"
                    onSubmit={form.handleSubmit(handleSubmit)}
                  >
                    {/* Step 1: Mã sản phẩm */}
                    <StepCard
                      step="1"
                      title="Mã sản phẩm"
                      description="Nhập danh sách mã hoặc dán trực tiếp một cột từ Google Sheets"
                      railLabel="Mã SP"
                      railDetail={totalCodesCount > 0 ? `${totalCodesCount} mã` : "Chưa nhập"}
                      isDone={totalCodesCount > 0}
                      badge={
                        totalCodesCount > 0 ? (
                          <Badge tone="info" className="font-mono">
                            {totalCodesCount} mã
                          </Badge>
                        ) : undefined
                      }
                    >
                      <BulkCodesField
                        id={codesId}
                        registration={form.register("codesText")}
                        parsed={parsed}
                        error={form.formState.errors.codesText?.message}
                        disabled={isRunning}
                      />
                    </StepCard>

                    {/* Step 2: Kênh đăng (Compose-Style Channel Selector) */}
                    <StepCard
                      step="2"
                      title="Kênh đăng"
                      description="Chọn các Fanpage đích để xuất bản bài viết"
                      railLabel="Kênh"
                      railDetail={
                        totalChannelsCount > 0 ? `${totalChannelsCount} kênh` : "Chưa chọn"
                      }
                      isDone={totalChannelsCount > 0}
                      badge={
                        totalChannelsCount > 0 ? (
                          <Badge tone="info" className="font-mono">
                            {totalChannelsCount} kênh
                          </Badge>
                        ) : undefined
                      }
                    >
                      <div className="space-y-3">
                        {/* Cùng lối chọn kênh với màn Soạn bài: một dòng tóm tắt mở ra
                              hộp thoại chọn — hai màn không được có hai cách chọn kênh. */}
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          disabled={isRunning}
                          className="border-border bg-card hover:bg-sidebar focus-visible:ring-ring focus-visible:ring-offset-background group flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">
                            Facebook
                          </span>

                          {selectedIds.length === 0 ? (
                            <span className="text-muted-foreground text-sm">
                              Chưa chọn kênh nào — bấm để mở danh sách Fanpage
                            </span>
                          ) : (
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              {shownChannels.map((channelId) => {
                                const resolved = channelLabels.get(channelId);
                                const label = resolved?.name ?? channelId;
                                const gone = resolved?.note === "removed";
                                const off = resolved?.note === "disabled";

                                return (
                                  <span
                                    key={channelId}
                                    className="border-border bg-muted flex h-9 items-center gap-2 rounded-full border py-0 pr-3 pl-1 text-xs font-medium"
                                  >
                                    <span
                                      aria-hidden="true"
                                      style={avatarToneStyle(label)}
                                      className="text-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold"
                                    >
                                      {channelInitials(label)}
                                    </span>
                                    <span className="text-foreground max-w-36 truncate text-sm font-medium">
                                      {label}
                                    </span>
                                    {gone || off ? (
                                      <span className="text-warning-foreground text-xs font-medium">
                                        {gone ? "(đã gỡ)" : "(đang tắt)"}
                                      </span>
                                    ) : null}
                                  </span>
                                );
                              })}
                              {selectedIds.length > shownChannels.length ? (
                                <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-1 text-xs font-medium">
                                  +{selectedIds.length - shownChannels.length} kênh khác
                                </span>
                              ) : null}
                            </span>
                          )}

                          <span className="flex-1" />
                          <span className="text-accent-foreground shrink-0 text-sm font-medium group-hover:underline">
                            {selectedIds.length === 0 ? "Chọn kênh" : "Thay đổi"}
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="text-muted-foreground size-4 shrink-0"
                          />
                        </button>

                        {/* Nhóm kênh đã lưu: bật/tắt cả nhóm trong một lần bấm. */}
                        {groupItems.length > 0 ? (
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap">
                            <span className="text-muted-foreground shrink-0 text-xs font-medium">
                              Nhóm có sẵn:
                            </span>
                            {groupItems.map((group) => {
                              const isAllSelected =
                                group.channelIds.length > 0 &&
                                group.channelIds.every((id) => selected.has(id));
                              return (
                                <button
                                  key={group.id}
                                  type="button"
                                  disabled={isRunning}
                                  aria-pressed={isAllSelected}
                                  onClick={() => toggleGroup(group.channelIds, !isAllSelected)}
                                  className={cn(
                                    "focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
                                    isAllSelected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
                                  )}
                                >
                                  {group.name} ({group.channelIds.length})
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        {/* Nói thẳng: thiếu câu này thì danh sách âm thầm tụt về mã kênh
                              và không ai biết đó có phải chuyện bình thường không. */}
                        {channels.isError ? (
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            Không tải được tên Page nên danh sách đang hiện mã kênh. Vẫn chọn và
                            chạy được bình thường.
                          </p>
                        ) : null}

                        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                          <span>
                            {selectedIds.length === 0
                              ? "Chọn ít nhất 1 kênh để tiến hành chạy."
                              : `Đã chọn ${selectedIds.length} kênh · Mỗi mã sẽ tạo ${selectedIds.length} bài.`}
                          </span>
                          <Link
                            href="/channels?tab=groups"
                            className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-9 items-center rounded-md font-medium underline underline-offset-4 transition-opacity duration-150 outline-none hover:opacity-80 focus-visible:ring-2"
                          >
                            Quản lý nhóm kênh
                          </Link>
                        </div>

                        {prune.changed ? (
                          <div
                            role="status"
                            className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-2.5 rounded-xl border p-3.5 text-sm"
                          >
                            <p className="text-xs leading-relaxed">
                              <strong>{prune.removedLabels.length} Page</strong> đã tick sẽ KHÔNG
                              được đăng vì kênh đang tắt hoặc đã bị gỡ:{" "}
                              <span className="font-medium">{prune.removedLabels.join(", ")}</span>.
                              Bật lại ở màn Kênh nếu vẫn muốn đăng.
                            </p>
                          </div>
                        ) : null}

                        {channelError ? (
                          <p role="alert" className="text-destructive text-sm font-medium">
                            {channelError}
                          </p>
                        ) : null}
                      </div>
                    </StepCard>

                    {/* Step 3: Caption */}
                    <StepCard
                      step="3"
                      title="Nội dung caption"
                      description="Chọn cách viết nội dung cho từng bài đăng"
                      railLabel="Caption"
                      railDetail={captionMode === "ai" ? "AI sáng tạo" : "Mẫu chung"}
                      isDone
                    >
                      <fieldset className="space-y-4" aria-describedby={`${captionModeId}-hint`}>
                        <legend className="sr-only">Cách viết caption</legend>

                        {/* Interactive Visual Cards for Caption Mode */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {BULK_CAPTION_MODES.map((mode) => {
                            const isSelected = captionMode === mode;
                            return (
                              <label
                                key={mode}
                                className={cn(
                                  "has-focus-visible:ring-ring relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-colors duration-150 has-focus-visible:ring-2",
                                  isSelected
                                    ? "border-ring bg-accent/60 ring-ring ring-1"
                                    : "border-border bg-card hover:bg-sidebar",
                                  isRunning && "cursor-not-allowed opacity-40",
                                )}
                              >
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        value={mode}
                                        className="accent-ring size-4"
                                        disabled={isRunning}
                                        {...form.register("captionMode")}
                                      />
                                      <span className="text-foreground text-sm font-semibold">
                                        {BULK_CAPTION_MODE_LABELS[mode]}
                                      </span>
                                    </div>
                                    {mode === "ai" ? (
                                      <Badge tone="info">Khuyên dùng</Badge>
                                    ) : (
                                      <Badge tone="neutral">Tiết kiệm</Badge>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground text-xs leading-relaxed">
                                    {mode === "ai"
                                      ? "AI tự động đọc dữ liệu sản phẩm, chất liệu và phong cách để viết caption thu hút riêng cho từng mã."
                                      : "Sử dụng một mẫu chuẩn chung, tự động điền {code} và {name} theo từng sản phẩm mà không cần AI."}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {captionMode === "ai" ? (
                          <div className="space-y-1.5 pt-1">
                            <label
                              htmlFor={captionToneId}
                              className="text-foreground block text-sm font-medium"
                            >
                              Phong cách nội dung
                            </label>
                            <Select
                              id={captionToneId}
                              disabled={isRunning}
                              aria-describedby={`${captionToneId}-hint`}
                              {...form.register("captionTone")}
                              className="h-11 max-w-xs rounded-lg"
                            >
                              {CAPTION_TONES.map((tone) => (
                                <option key={tone} value={tone}>
                                  {CAPTION_TONE_LABELS[tone]}
                                </option>
                              ))}
                            </Select>
                            <p
                              id={`${captionToneId}-hint`}
                              className="text-muted-foreground text-xs leading-relaxed"
                            >
                              {captionTone === DEFAULT_CAPTION_TONE
                                ? "Để AI tự quyết giọng viết — giống hệt cách chạy trước nay."
                                : "Áp dụng cho mọi mã trong lượt chạy này."}
                            </p>
                          </div>
                        ) : null}

                        <p
                          id={`${captionModeId}-hint`}
                          className="text-muted-foreground text-xs leading-relaxed"
                        >
                          Bảo mật: Caption chỉ lấy Tên, Mô tả, Chủng loại, Mùa vụ. Giá bán và số
                          lượng tồn kho không bao giờ đi vào bài đăng.
                        </p>

                        {captionMode === "template" ? (
                          <div className="space-y-4 pt-1">
                            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                              {/* Left side: Template Editor */}
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label
                                    htmlFor={templateId}
                                    className="text-foreground text-sm font-medium"
                                  >
                                    Mẫu caption dùng chung
                                  </label>
                                  {/* Preset buttons */}
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        form.setValue(
                                          "captionTemplate",
                                          "{name} — Mã: {code}\nChất liệu cao cấp, form chuẩn đẹp.\nInbox shop để nhận tư vấn size ngay!",
                                          { shouldValidate: true },
                                        )
                                      }
                                      className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-9 cursor-pointer items-center rounded-md px-1.5 text-xs font-medium outline-none hover:underline focus-visible:ring-2"
                                    >
                                      Mẫu tư vấn
                                    </button>
                                    <span className="text-muted-foreground text-xs" aria-hidden="true">
                                      ·
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        form.setValue(
                                          "captionTemplate",
                                          "BST MỚI VỀ: {name} (Mã {code})\nSố lượng có hạn, kiểm tra hàng trước khi nhận.",
                                          { shouldValidate: true },
                                        )
                                      }
                                      className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-9 cursor-pointer items-center rounded-md px-1.5 text-xs font-medium outline-none hover:underline focus-visible:ring-2"
                                    >
                                      Mẫu BST mới
                                    </button>
                                  </div>
                                </div>

                                <Textarea
                                  id={templateId}
                                  {...form.register("captionTemplate")}
                                  rows={5}
                                  disabled={isRunning}
                                  aria-invalid={
                                    form.formState.errors.captionTemplate ? true : undefined
                                  }
                                  aria-describedby={`${templateId}-hint`}
                                  placeholder={
                                    "{name} — mã {code}\nInbox để được tư vấn size và xem bảng màu mới nhất!"
                                  }
                                  className="rounded-lg font-mono text-sm leading-relaxed"
                                />

                                {/* Interactive Variable Insertion Buttons */}
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="text-muted-foreground text-xs">
                                    Chèn nhanh biến:
                                  </span>
                                  {CAPTION_TEMPLATE_VARIABLES.map((name) => (
                                    <button
                                      key={name}
                                      type="button"
                                      onClick={() => handleInsertVariable(name)}
                                      className="border-border bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
                                    >
                                      {"{" + name + "}"}
                                    </button>
                                  ))}
                                </div>

                                {form.formState.errors.captionTemplate ? (
                                  <p role="alert" className="text-destructive text-sm font-medium">
                                    {form.formState.errors.captionTemplate.message}
                                  </p>
                                ) : null}
                                {unknownVariables.length > 0 ? (
                                  <p role="alert" className="text-warning-foreground text-xs">
                                    Không nhận ra biến{" "}
                                    {unknownVariables.map((name) => `{${name}}`).join(", ")} — sẽ
                                    giữ nguyên chữ trong bài đăng.
                                  </p>
                                ) : null}
                              </div>

                              {/* Right side: Live Facebook Post Mockup */}
                              <div className="border-border bg-sidebar space-y-3 rounded-xl border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-foreground font-medium">
                                    Xem trước bài đăng thực tế
                                  </span>
                                  {parsed.codes.length > 1 ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground text-xs">Mã thử:</span>
                                      <select
                                        aria-label="Chọn mã sản phẩm để xem trước"
                                        value={previewCodeIndex}
                                        onChange={(e) =>
                                          setPreviewCodeIndex(Number(e.target.value))
                                        }
                                        className="border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-offset-sidebar h-9 rounded-lg border px-2.5 font-mono text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                                      >
                                        {parsed.codes.slice(0, 10).map((c, i) => (
                                          <option key={c.code} value={i}>
                                            #{i + 1} {c.code}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground font-mono text-xs">
                                      Mã: {currentPreviewCode || "(chưa có)"}
                                    </span>
                                  )}
                                </div>
                                <div className="border-border bg-card space-y-3 rounded-xl border p-4">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      aria-hidden="true"
                                      className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                                    >
                                      V
                                    </div>
                                    <div>
                                      <p className="text-foreground text-sm leading-tight font-semibold">
                                        Trang của bạn
                                      </p>
                                      <span className="text-foreground-subtle text-xs">
                                        Vừa xong · Công khai
                                      </span>
                                    </div>
                                  </div>
                                  <pre className="text-foreground min-h-16 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap">
                                    {captionTemplate.trim().length > 0
                                      ? renderCaptionTemplate(captionTemplate, {
                                          code: currentPreviewCode || "(mã sản phẩm)",
                                          name: "(tên sản phẩm)",
                                        })
                                      : "Nội dung caption sẽ hiển thị tại đây khi bạn nhập mẫu…"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </fieldset>
                    </StepCard>

                    {/* Step 4: Giờ đăng & Kích hoạt */}
                    <StepCard
                      step="4"
                      title="Thời gian đăng"
                      description="Đăng ngay hoặc hẹn giờ cho toàn bộ danh sách"
                      railLabel="Chạy"
                      railDetail={
                        isRunning
                          ? "Đang chạy"
                          : estimatedTotalPosts > 0
                            ? `${estimatedTotalPosts} bài`
                            : "Chờ cấu hình"
                      }
                      isDone={phase === "finished"}
                      isLast
                    >
                      <SchedulePicker
                        choice={schedule}
                        disabled={isRunning}
                        disabledReason="Lô đang chạy — chờ chạy xong rồi mới đổi được giờ đăng."
                        scopeNote="Áp dụng cho mọi mã và mọi kênh trong lượt chạy này. Các bài không lên cùng lúc — xem khoảng giãn cách ngay dưới."
                      />

                      {/*
                        Giãn cách RIÊNG cho lượt chạy này. Bỏ trống thì máy chủ
                        dùng cấu hình của công ty, đúng hành vi trước nay.
                      */}
                      <div className="border-border space-y-2 border-t pt-5">
                        <label htmlFor={spacingId} className="text-foreground block text-sm font-medium">
                          Giãn cách giữa các bài (phút)
                        </label>
                        <Input
                          id={spacingId}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={MAX_SPACING_MS / MS_PER_MINUTE}
                          step={1}
                          placeholder="Theo cấu hình công ty"
                          disabled={isRunning}
                          aria-describedby={`${spacingId}-hint`}
                          aria-invalid={form.formState.errors.spacingMinutes ? true : undefined}
                          className="h-11 max-w-48 rounded-lg"
                          {...form.register("spacingMinutes")}
                        />
                        <p id={`${spacingId}-hint`} className="text-muted-foreground text-xs leading-relaxed">
                          Nên để tối thiểu {RECOMMENDED_MIN_SPACING_MS / MS_PER_MINUTE} phút. Bỏ
                          trống để dùng cấu hình của công ty; nhập 0 để đăng liên tục.
                        </p>

                        {/* Lời khuyên, KHÔNG phải hàng rào: máy chủ vẫn nhận số
                            nhỏ hơn, nên chỗ này chỉ được nhắc, không được chặn. */}
                        {isBelowRecommendedSpacing ? (
                          <p role="status" className="text-warning-foreground text-xs">
                            Dưới {RECOMMENDED_MIN_SPACING_MS / MS_PER_MINUTE} phút — vẫn chạy được,
                            nhưng các bài lên sát nhau hơn mức khuyên dùng.
                          </p>
                        ) : null}

                        {form.formState.errors.spacingMinutes ? (
                          <p role="alert" className="text-destructive text-xs">
                            {form.formState.errors.spacingMinutes.message}
                          </p>
                        ) : null}
                      </div>

                      <div className="border-border space-y-4 border-t pt-5">
                        {/* Con số của lượt chạy, nói ngay cạnh nút bấm. */}
                        {estimatedTotalPosts > 0 ? (
                          <p className="text-muted-foreground text-sm">
                            Lượt này tạo{" "}
                            <span className="text-foreground font-medium tabular-nums">
                              {estimatedTotalPosts} bài
                            </span>{" "}
                            ({totalCodesCount} mã × {totalChannelsCount} kênh), chạy khoảng{" "}
                            <span className="tabular-nums">~{estimatedDurationMinutes} phút</span>.
                          </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3">
                          {/* Single primary ink CTA of the bulk screen */}
                          <Button
                            type="submit"
                            size="lg"
                            disabled={isRunning || gate.isDisabled || hasNoCodes}
                            className="min-h-11 px-5 shadow-xs disabled:opacity-40"
                          >
                            {isRunning
                              ? "Đang chạy lượt này…"
                              : hasNoCodes
                                ? "Soạn bài để duyệt"
                                : `Soạn bài ${totalCodesCount} mã để duyệt`}
                          </Button>

                          {!isRunning && summary.review > 0 ? (
                            <Button
                              type="button"
                              size="lg"
                              variant="secondary"
                              disabled={summary.approved === 0}
                              onClick={() => void run.publishApproved()}
                              className="min-h-11 px-4 disabled:opacity-40"
                            >
                              {summary.approved === 0
                                ? `Duyệt bài trong bảng (${summary.review} bài chờ)`
                                : schedule.mode === "scheduled"
                                  ? `Hẹn giờ ${summary.approved} bài đã duyệt`
                                  : `Đăng ${summary.approved} bài đã duyệt`}
                            </Button>
                          ) : null}

                          {isRunning ? (
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={run.stop}
                              disabled={phase === "stopping"}
                              className="min-h-11 px-4"
                            >
                              {phase === "stopping" ? "Đang dừng…" : "Dừng lượt chạy"}
                            </Button>
                          ) : null}

                          {phase === "finished" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={run.reset}
                              className="min-h-11 px-4"
                            >
                              Xoá kết quả để chạy lượt mới
                            </Button>
                          ) : null}

                          <ReadOnlyNotice reason={runBlockedReason} className="basis-full" />
                        </div>

                        <p className="text-muted-foreground text-xs leading-relaxed">
                          {TAB_BOUNDARY_NOTICE}
                        </p>
                      </div>
                    </StepCard>
                  </form>
                </div>

                {/* Right column: what the run is doing, right now. */}
                <div className="min-w-0 space-y-5 lg:sticky lg:top-6 lg:col-span-5">
                  <section
                    aria-labelledby="bulk-progress-heading"
                    className={cn(
                      "space-y-4 rounded-xl border p-5 sm:p-6",
                      rows.length === 0
                        ? "border-border bg-sidebar border-dashed"
                        : "border-border bg-card shadow-sm",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2
                        id="bulk-progress-heading"
                        className="text-foreground text-lg font-semibold"
                      >
                        Tiến độ
                      </h2>
                      <div className="flex items-center gap-2">
                        {isRunning ? (
                          <Badge tone="info">
                            <span
                              aria-hidden="true"
                              className="bg-ring size-1.5 rounded-full motion-safe:animate-pulse"
                            />
                            Đang chạy
                          </Badge>
                        ) : phase === "finished" ? (
                          <Badge tone="success">Đã hoàn tất</Badge>
                        ) : null}
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {progressPercent}%
                        </span>
                      </div>
                    </div>

                    <div aria-hidden="true" className="border-border border-t" />

                    {/* Rule 5: máy chủ bỏ tông giọng thì phải nói, không được để
                        ô chọn nói một đằng còn caption viết một nẻo. */}
                    {toneDropped ? (
                      <p
                        role="status"
                        className="border-warning/40 bg-warning/10 text-warning-foreground rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed"
                      >
                        Máy chủ chưa nhận phong cách nội dung nên caption của lượt này được viết
                        bằng giọng mặc định.
                      </p>
                    ) : null}

                    {rows.length === 0 ? (
                      <EmptyState
                        kind="idle"
                        title="Chưa chạy lượt nào"
                        description="Nhập mã, chọn kênh rồi bấm “Soạn bài để duyệt”. Bảng này sẽ hiện trạng thái của từng mã ngay khi bắt đầu."
                        action={
                          <Link
                            href="/posts?tab=log"
                            className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 items-center rounded-md text-sm font-medium underline underline-offset-4 outline-none hover:opacity-80 focus-visible:ring-2"
                          >
                            Xem nhật ký các lượt trước
                          </Link>
                        }
                      />
                    ) : (
                      <div className="space-y-4">
                        {/* Live Progress Card */}
                        <div
                          ref={summaryRef}
                          tabIndex={-1}
                          role={phase === "finished" ? "alert" : undefined}
                          className="border-border bg-sidebar space-y-4 rounded-xl border p-4 outline-none"
                        >
                          {/* Progress bar with percentage */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-medium">
                              <span className="text-foreground">
                                Đã xử lý: {summary.processed}/{summary.total} mã
                              </span>
                              <span className="text-accent-foreground font-mono text-sm font-semibold tabular-nums">
                                {progressPercent}%
                              </span>
                            </div>
                            <Progress
                              value={summary.processed}
                              max={summary.total}
                              label="Tiến độ lượt chạy"
                              valueText={`Đã xử lý ${summary.processed}/${summary.total} mã`}
                            />
                          </div>

                          {/* Metric stats grid */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="border-success/30 bg-success/10 rounded-xl border p-3 text-center">
                              <span className="text-success-foreground block font-mono text-lg font-semibold tabular-nums">
                                {summary.done}
                              </span>
                              <span className="text-success-foreground text-xs font-medium">
                                Thành công
                              </span>
                            </div>
                            <div className="border-warning/30 bg-warning/10 rounded-xl border p-3 text-center">
                              <span className="text-warning-foreground block font-mono text-lg font-semibold tabular-nums">
                                {summary.skipped}
                              </span>
                              <span className="text-warning-foreground text-xs font-medium">
                                Bỏ qua
                              </span>
                            </div>
                            <div className="border-destructive/30 bg-destructive/10 rounded-xl border p-3 text-center">
                              <span className="text-destructive block font-mono text-lg font-semibold tabular-nums">
                                {summary.failed}
                              </span>
                              <span className="text-destructive text-xs font-medium">Lỗi</span>
                            </div>
                          </div>

                          {/* Status sentence */}
                          <p
                            role="status"
                            aria-live="polite"
                            className="text-muted-foreground text-xs leading-relaxed"
                          >
                            {summary.cancelled > 0
                              ? `${summary.cancelled} mã chưa chạy nên không bị ảnh hưởng gì. `
                              : ""}
                            {ranScheduled
                              ? "Các lô đã tạo đang chờ tới giờ hẹn — đổi giờ hoặc huỷ ở "
                              : "Các lô đã tạo chạy tiếp trên máy chủ kể cả khi bạn rời trang — xem ở "}
                            {ranScheduled ? (
                              <Link
                                href="/posts?tab=scheduled"
                                className="text-accent-foreground font-medium underline underline-offset-4 hover:opacity-80"
                              >
                                Bài đã hẹn
                              </Link>
                            ) : (
                              <Link
                                href="/posts?tab=log"
                                className="text-accent-foreground font-medium underline underline-offset-4 hover:opacity-80"
                              >
                                Nhật ký đăng
                              </Link>
                            )}
                            .
                          </p>
                        </div>

                        {/* Filter chips: single scrollable row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div
                            role="group"
                            aria-label="Lọc bảng tiến độ"
                            className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1"
                          >
                            <button
                              type="button"
                              aria-pressed={tableFilter === "all"}
                              onClick={() => setTableFilter("all")}
                              className={cn(
                                "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                                tableFilter === "all"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground hover:bg-muted",
                              )}
                            >
                              Tất cả ({rows.length})
                            </button>
                            <button
                              type="button"
                              aria-pressed={tableFilter === "done"}
                              onClick={() => setTableFilter("done")}
                              className={cn(
                                "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                                tableFilter === "done"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground hover:bg-muted",
                              )}
                            >
                              Thành công ({summary.done})
                            </button>
                            <button
                              type="button"
                              aria-pressed={tableFilter === "issues"}
                              onClick={() => setTableFilter("issues")}
                              className={cn(
                                "focus-visible:ring-ring inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
                                tableFilter === "issues"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground hover:bg-muted",
                              )}
                            >
                              Bỏ qua &amp; Lỗi ({summary.skipped + summary.failed})
                            </button>
                          </div>
                          {tableFilter !== "all" ? (
                            <span className="text-muted-foreground font-mono text-xs tabular-nums">
                              Đang lọc: {filteredRows.length} dòng
                            </span>
                          ) : null}
                        </div>

                        {/* Detail Progress Table */}
                        <BulkProgressTable
                          rows={filteredRows}
                          review={{
                            disabled: isRunning,
                            onEditCaption: run.editCaption,
                            onApprove: run.setApproved,
                            onReject: run.rejectRow,
                          }}
                        />
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </LayoutContent>
        }
      />
      <ChannelPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        applied={runnableSelection}
        onApply={(channelIds) => {
          setChannelError(null);
          setSelected(new Set(channelIds));
        }}
        readOnlyReason={gate.reason}
      />
    </>
  );
}

/**
 * Clean Step Card container with semantic design system hierarchy and step rail.
 */
function StepCard({
  step,
  title,
  description,
  badge,
  railLabel,
  railDetail,
  isDone = false,
  isLast = false,
  children,
}: {
  step: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  /** Chữ ngắn trên dải bước bên trái — không phải tiêu đề thẻ. */
  railLabel: string;
  /** Trạng thái một dòng của bước đó: "Chưa nhập", "3 kênh", "Đang chạy". */
  railDetail: string;
  isDone?: boolean;
  /** Bước cuối không kẻ tiếp đường nối xuống dưới. */
  isLast?: boolean;
  children: ReactNode;
}) {
  const labelId = useId();

  return (
    <div className="flex gap-4">
      <div aria-hidden="true" className="hidden w-16 shrink-0 flex-col items-center lg:flex">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs font-semibold transition-colors duration-150",
            isDone
              ? "border-ring bg-accent text-accent-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {isDone ? <Check className="size-4" strokeWidth={2.5} aria-hidden="true" /> : step}
        </span>
        <span className="text-foreground mt-1.5 text-center text-xs font-medium">{railLabel}</span>
        <span className="text-muted-foreground text-center text-xs leading-tight">
          {railDetail}
        </span>
        {isLast ? null : <span className="bg-border mt-2 w-px flex-1" />}
      </div>

      <section aria-labelledby={labelId} className="min-w-0 flex-1">
        <div className="border-border bg-card space-y-4 rounded-xl border p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-sidebar text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                  Bước {step}
                </span>
                <h2 id={labelId} className="text-foreground text-lg leading-snug font-semibold">
                  {title}
                </h2>
              </div>
              {description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
              ) : null}
            </div>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

/**
 * Structured scope disclosure using design system subtle surface tokens.
 */
function ScopeDisclosure({
  id,
  isOpen,
  onOpenChange,
}: {
  id: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <section
      id={id}
      aria-label="Chi tiết cách chạy hàng loạt"
      className="border-border bg-sidebar rounded-xl border px-4 py-2"
    >
      {/* Astryx standalone <Collapsible> sets padding-block: 0 on its <button>
          and text-box-trim on its wrapper span; a block-flex min-h-10 trigger
          keeps >= 40px touch height and prevents Vietnamese diacritics clipping
          while py-2 on the section satisfies padding >= radius/2 for rounded-xl. */}
      <Collapsible
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={
          <span className="text-foreground flex min-h-10 items-center text-sm leading-5 font-medium">
            Chi tiết
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 px-1 pt-1 pb-2 md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-foreground text-sm font-semibold">Màn này đăng bài ảnh</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Bài video đơn và Reels phải chọn đích rồi kiểm thông số từng clip, nên chúng đi qua
              màn{" "}
              <Link
                href="/compose"
                className="text-accent-foreground font-medium underline underline-offset-4 hover:opacity-80"
              >
                Soạn bài
              </Link>
              .
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-foreground text-sm font-semibold">Chạy tuần tự, đóng tab thì sao</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Mỗi mã lần lượt được tra sản phẩm, lấy caption rồi tạo lô. {TAB_BOUNDARY_NOTICE}
            </p>
          </div>
        </div>
      </Collapsible>
    </section>
  );
}
