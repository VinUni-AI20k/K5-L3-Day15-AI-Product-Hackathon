"use client";

import {
  Badge,
  Banner,
  Button,
  Card,
  Field,
  HStack,
  Heading,
  NumberInput,
  SegmentedControl,
  SegmentedControlItem,
  Stack,
  Switch,
  Text,
  TextArea,
  TextInput,
} from "@astryxdesign/core";
import { useCallback, useEffect, useId, useRef } from "react";

import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import {
  WRITING_STYLE_LENGTH_LABELS,
  WRITING_STYLE_LIMITS,
  type WritingStyle,
  type WritingStyleLength,
} from "@/ui/schemas/writing-style.schema";

import { ListFieldEditor } from "./ListFieldEditor";
import {
  addListRow,
  charCounterState,
  removeListRow,
  updateListRow,
  type FieldErrorMap,
  type ListItemErrorMap,
  type WritingStyleDraft,
  type WritingStyleFieldKey,
  type WritingStyleListFieldKey,
} from "./writing-style-form";
import {
  inheritedLengthOptionLabel,
  inheritedListHint,
  inheritedMentionOptionLabel,
  inheritedNumberPlaceholder,
  inheritedTextPlaceholder,
} from "./writing-style-inheritance";

export interface FocusFieldTarget {
  readonly field: WritingStyleFieldKey;
  readonly itemIndex: number | null;
  readonly nonce: number;
}

export interface WritingStyleFormProps {
  readonly scopeLabel: string;
  readonly isChannelScope: boolean;
  readonly draft: WritingStyleDraft;
  readonly inheritedStyle: WritingStyle;
  readonly fieldErrors: FieldErrorMap;
  readonly itemErrors: ListItemErrorMap;
  readonly unmappedServerErrors: readonly string[];
  readonly focusTarget: FocusFieldTarget | null;
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly readOnlyReason: string | null;
  readonly onChangeDraft: (next: WritingStyleDraft) => void;
  readonly onSubmit: () => void;
  readonly onDiscard: () => void;
}

const SAVING_MESSAGE = "Đang lưu phong cách viết…";

function SingleLineCounter({ value, max }: { readonly value: string; readonly max: number }) {
  const counter = charCounterState(value, max);
  if (!counter.visible) return null;
  return (
    <HStack justify="end">
      <Badge variant={counter.isOverLimit ? "error" : "warning"} label={counter.text} />
    </HStack>
  );
}

export function WritingStyleForm({
  scopeLabel,
  isChannelScope,
  draft,
  inheritedStyle,
  fieldErrors,
  itemErrors,
  unmappedServerErrors,
  focusTarget,
  isDirty,
  isSaving,
  readOnlyReason,
  onChangeDraft,
  onSubmit,
  onDiscard,
}: WritingStyleFormProps) {
  const baseId = useId();
  const rowCounterRef = useRef(0);
  const fieldRefs = useRef<Partial<Record<WritingStyleFieldKey, HTMLElement | null>>>({});
  const rowRefs = useRef<
    Partial<Record<WritingStyleListFieldKey, Record<number, HTMLElement | null>>>
  >({});

  const isReadOnly = readOnlyReason !== null;
  const isDisabled = isReadOnly || isSaving;
  const disabledMessage = isSaving ? SAVING_MESSAGE : (readOnlyReason ?? undefined);

  function nextRowId(prefix: string): string {
    rowCounterRef.current += 1;
    return `${prefix}-new-${rowCounterRef.current}`;
  }

  const setFieldRef = useCallback(
    (key: WritingStyleFieldKey, node: HTMLElement | null) => {
      fieldRefs.current[key] = node;
    },
    [],
  );

  const setRowRef = useCallback(
    (
      key: WritingStyleListFieldKey,
      index: number,
      node: HTMLInputElement | HTMLTextAreaElement | null,
    ) => {
      const bucket = rowRefs.current[key] ?? {};
      bucket[index] = node;
      rowRefs.current[key] = bucket;
    },
    [],
  );

  useEffect(() => {
    if (!focusTarget) return;
    let targetNode: HTMLElement | null = null;
    if (
      focusTarget.itemIndex !== null &&
      (focusTarget.field === "hashtags.fixed" ||
        focusTarget.field === "dos" ||
        focusTarget.field === "donts" ||
        focusTarget.field === "extraBanned" ||
        focusTarget.field === "examples")
    ) {
      targetNode = rowRefs.current[focusTarget.field]?.[focusTarget.itemIndex] ?? null;
    }
    if (!targetNode) {
      targetNode = fieldRefs.current[focusTarget.field] ?? null;
    }
    if (!targetNode) return;
    targetNode.focus();
    if (typeof targetNode.scrollIntoView === "function") {
      targetNode.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusTarget]);

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type !== "submit" &&
      target.type !== "button"
    ) {
      event.preventDefault();
    }
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;
    onSubmit();
  }

  const lengthGroupId = `${baseId}-length`;
  const lengthLabelId = `${baseId}-length-label`;
  const lengthDescId = `${baseId}-length-desc`;
  const lengthErrorId = `${baseId}-length-err`;
  const lengthDescribedBy = [lengthDescId, fieldErrors.length ? lengthErrorId : null]
    .filter((item): item is string => item !== null)
    .join(" ");

  const mentionGroupId = `${baseId}-mention`;
  const mentionLabelId = `${baseId}-mention-label`;
  const mentionDescId = `${baseId}-mention-desc`;
  const mentionErrorId = `${baseId}-mention-err`;
  const mentionDescribedBy = [
    mentionDescId,
    fieldErrors.mentionShopName ? mentionErrorId : null,
  ]
    .filter((item): item is string => item !== null)
    .join(" ");

  const mentionSegmentValue =
    draft.mentionShopName === null ? "inherit" : draft.mentionShopName ? "yes" : "no";

  const saveDisabledTooltip = isSaving
    ? SAVING_MESSAGE
    : isReadOnly
      ? (readOnlyReason ?? undefined)
      : !isDirty
        ? "Chưa có thay đổi nào cần lưu."
        : undefined;

  const discardDisabledTooltip = isSaving
    ? SAVING_MESSAGE
    : isReadOnly
      ? (readOnlyReason ?? undefined)
      : !isDirty
        ? "Chưa có thay đổi nào để huỷ."
        : undefined;

  return (
    <form
      noValidate
      onSubmit={handleFormSubmit}
      onKeyDown={handleFormKeyDown}
      aria-label={`Biểu mẫu phong cách viết cho ${scopeLabel}`}
    >
      <Stack direction="vertical" gap={6}>
        {unmappedServerErrors.length > 0 ? (
          <Banner
            status="error"
            title="Không lưu được phong cách viết"
            description={unmappedServerErrors.join(" · ")}
          />
        ) : null}

        {/* 1. Thông tin shop */}
        <Card padding={5} aria-labelledby={`${baseId}-sec-shop`}>
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1}>
              <Heading level={2} id={`${baseId}-sec-shop`}>
                Thông tin shop
              </Heading>
              <Text type="supporting" color="secondary">
                Giúp AI hiểu ngành hàng, khách mục tiêu và sắc thái thương hiệu. Để trống để kế
                thừa mặc định.
              </Text>
            </Stack>

            <Stack direction="vertical" gap={1}>
              <TextInput
                ref={(node) => setFieldRef("shopName", node)}
                label="Tên shop"
                description="Dùng để định hình giọng thương hiệu; bài viết sẽ không tự in tên shop trừ khi bạn bật tùy chọn bên dưới."
                value={draft.shopName}
                onChange={(value) => onChangeDraft({ ...draft, shopName: value })}
                placeholder={inheritedTextPlaceholder(
                  inheritedStyle.shopName,
                  "Ví dụ: Nàng Thơ Boutique",
                )}
                width="100%"
                isDisabled={isDisabled}
                disabledMessage={disabledMessage}
                status={
                  fieldErrors.shopName
                    ? { type: "error", message: fieldErrors.shopName }
                    : undefined
                }
                statusVariant="detached"
              />
              <SingleLineCounter
                value={draft.shopName}
                max={WRITING_STYLE_LIMITS.shopNameMax}
              />
            </Stack>

            {isChannelScope ? (
              <Field
                isGroupLabel
                label="Nhắc tên shop trong bài viết"
                labelID={mentionLabelId}
                description="Mặc định tắt — bài đăng không in tên shop/Page trừ khi cho phép."
                descriptionID={mentionDescId}
                inputID={mentionGroupId}
                width="100%"
                status={
                  fieldErrors.mentionShopName
                    ? {
                        type: "error",
                        message: fieldErrors.mentionShopName,
                        messageID: mentionErrorId,
                      }
                    : undefined
                }
                statusVariant="detached"
              >
                <div
                  ref={(node) => setFieldRef("mentionShopName", node)}
                  id={mentionGroupId}
                  tabIndex={-1}
                  className="max-w-full overflow-x-auto pb-0.5"
                >
                  <SegmentedControl
                    label="Nhắc tên shop trong bài viết"
                    aria-labelledby={mentionLabelId}
                    aria-describedby={mentionDescribedBy || undefined}
                    value={mentionSegmentValue}
                    onChange={(value) => {
                      const next =
                        value === "inherit" ? null : value === "yes";
                      onChangeDraft({ ...draft, mentionShopName: next });
                    }}
                    isDisabled={isDisabled}
                    disabledMessage={disabledMessage}
                  >
                    <SegmentedControlItem
                      value="inherit"
                      label={inheritedMentionOptionLabel(inheritedStyle.mentionShopName)}
                    />
                    <SegmentedControlItem value="no" label="Không nhắc" />
                    <SegmentedControlItem value="yes" label="Có nhắc" />
                  </SegmentedControl>
                </div>
              </Field>
            ) : (
              <Switch
                ref={(node) => setFieldRef("mentionShopName", node)}
                label="Nhắc tên shop trong bài viết"
                description="Mặc định tắt — bài đăng không in tên shop/Page trừ khi bạn bật tùy chọn này."
                value={draft.mentionShopName ?? inheritedStyle.mentionShopName ?? false}
                onChange={(checked) => onChangeDraft({ ...draft, mentionShopName: checked })}
                isDisabled={isDisabled}
                disabledMessage={disabledMessage}
                status={
                  fieldErrors.mentionShopName
                    ? { type: "error", message: fieldErrors.mentionShopName }
                    : undefined
                }
              />
            )}

            <Stack direction="vertical" gap={1}>
              <TextInput
                ref={(node) => setFieldRef("industry", node)}
                label="Ngành hàng"
                description="Thay thế ngành hàng mặc định trong prompt hệ thống (ví dụ: thời trang nữ, mỹ phẩm, đồ gia dụng)."
                value={draft.industry}
                onChange={(value) => onChangeDraft({ ...draft, industry: value })}
                placeholder={inheritedTextPlaceholder(
                  inheritedStyle.industry,
                  "Ví dụ: thời trang nữ",
                )}
                width="100%"
                isDisabled={isDisabled}
                disabledMessage={disabledMessage}
                status={
                  fieldErrors.industry
                    ? { type: "error", message: fieldErrors.industry }
                    : undefined
                }
                statusVariant="detached"
              />
              <SingleLineCounter
                value={draft.industry}
                max={WRITING_STYLE_LIMITS.industryMax}
              />
            </Stack>

            <TextArea
              ref={(node) => setFieldRef("audience", node)}
              label="Đối tượng khách hàng"
              description="Độ tuổi, phong cách sống hoặc nhu cầu mua sắm chính của khách hàng."
              value={draft.audience}
              onChange={(value) => onChangeDraft({ ...draft, audience: value })}
              placeholder={inheritedTextPlaceholder(
                inheritedStyle.audience,
                "Ví dụ: Nữ văn phòng 24–35 tuổi, thích form đứng gọn và chất vải mát",
              )}
              rows={2}
              maxLength={WRITING_STYLE_LIMITS.audienceMax}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={
                fieldErrors.audience
                  ? { type: "error", message: fieldErrors.audience }
                  : undefined
              }
              statusVariant="detached"
            />
          </Stack>
        </Card>

        {/* 2. Giọng văn & xưng hô */}
        <Card padding={5} aria-labelledby={`${baseId}-sec-voice`}>
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1}>
              <Heading level={2} id={`${baseId}-sec-voice`}>
                Giọng văn &amp; xưng hô
              </Heading>
              <Text type="supporting" color="secondary">
                Áp dụng cho cả bài đăng sản phẩm lẫn gợi ý trả lời bình luận khách hàng.
              </Text>
            </Stack>

            <TextArea
              ref={(node) => setFieldRef("voice", node)}
              label="Giọng văn"
              description="Mô tả nhịp điệu, cảm xúc và cách chọn từ đặc trưng của shop."
              value={draft.voice}
              onChange={(value) => onChangeDraft({ ...draft, voice: value })}
              placeholder={inheritedTextPlaceholder(
                inheritedStyle.voice,
                "Ví dụ: Nhẹ nhàng, tinh tế, câu ngắn gọn, tư vấn thật như người bán quen",
              )}
              rows={3}
              maxLength={WRITING_STYLE_LIMITS.voiceMax}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={
                fieldErrors.voice ? { type: "error", message: fieldErrors.voice } : undefined
              }
              statusVariant="detached"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Stack direction="vertical" gap={1}>
                <TextInput
                  ref={(node) => setFieldRef("xungHo", node)}
                  label="Cách gọi khách"
                  description="Ví dụ: nàng, chị, bạn…"
                  value={draft.xungHo}
                  onChange={(value) => onChangeDraft({ ...draft, xungHo: value })}
                  placeholder={inheritedTextPlaceholder(
                    inheritedStyle.xungHo,
                    "Ví dụ: nàng",
                  )}
                  width="100%"
                  isDisabled={isDisabled}
                  disabledMessage={disabledMessage}
                  status={
                    fieldErrors.xungHo
                      ? { type: "error", message: fieldErrors.xungHo }
                      : undefined
                  }
                  statusVariant="detached"
                />
                <SingleLineCounter
                  value={draft.xungHo}
                  max={WRITING_STYLE_LIMITS.xungHoMax}
                />
              </Stack>

              <Stack direction="vertical" gap={1}>
                <TextInput
                  ref={(node) => setFieldRef("selfReference", node)}
                  label="Cách shop tự xưng"
                  description="Ví dụ: shop, mình, em…"
                  value={draft.selfReference}
                  onChange={(value) => onChangeDraft({ ...draft, selfReference: value })}
                  placeholder={inheritedTextPlaceholder(
                    inheritedStyle.selfReference,
                    "Ví dụ: shop",
                  )}
                  width="100%"
                  isDisabled={isDisabled}
                  disabledMessage={disabledMessage}
                  status={
                    fieldErrors.selfReference
                      ? { type: "error", message: fieldErrors.selfReference }
                      : undefined
                  }
                  statusVariant="detached"
                />
                <SingleLineCounter
                  value={draft.selfReference}
                  max={WRITING_STYLE_LIMITS.selfReferenceMax}
                />
              </Stack>
            </div>

            <NumberInput
              ref={(node) => setFieldRef("maxEmoji", node)}
              label="Số emoji tối đa"
              description="Số nguyên từ 0 đến 10 (0 = không dùng emoji). Xoá trống để kế thừa mặc định."
              value={draft.maxEmoji}
              onChange={(value) => onChangeDraft({ ...draft, maxEmoji: value })}
              hasClear
              hasNumberSteppers
              isIntegerOnly
              min={WRITING_STYLE_LIMITS.maxEmojiMin}
              max={WRITING_STYLE_LIMITS.maxEmojiMax}
              placeholder={inheritedNumberPlaceholder(inheritedStyle.maxEmoji, "0–10")}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={
                fieldErrors.maxEmoji
                  ? { type: "error", message: fieldErrors.maxEmoji }
                  : undefined
              }
              statusVariant="detached"
            />
          </Stack>
        </Card>

        {/* 3. Độ dài & cấu trúc */}
        <Card padding={5} aria-labelledby={`${baseId}-sec-length`}>
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1}>
              <Heading level={2} id={`${baseId}-sec-length`}>
                Độ dài &amp; cấu trúc
              </Heading>
              <Text type="supporting" color="secondary">
                Kiểm soát số câu phần thân bài và cách kêu gọi khách nhắn tin hoặc để lại bình
                luận.
              </Text>
            </Stack>

            <Field
              isGroupLabel
              label="Độ dài bài đăng"
              labelID={lengthLabelId}
              description="Ngắn: 1–2 câu · Vừa: 2–4 câu · Dài: 4–6 câu."
              descriptionID={lengthDescId}
              inputID={lengthGroupId}
              width="100%"
              status={
                fieldErrors.length
                  ? { type: "error", message: fieldErrors.length, messageID: lengthErrorId }
                  : undefined
              }
              statusVariant="detached"
            >
              <div
                ref={(node) => setFieldRef("length", node)}
                id={lengthGroupId}
                tabIndex={-1}
                className="max-w-full overflow-x-auto pb-0.5"
              >
                <SegmentedControl
                  label="Độ dài bài đăng"
                  aria-labelledby={lengthLabelId}
                  aria-describedby={lengthDescribedBy || undefined}
                  value={draft.length}
                  onChange={(value) =>
                    onChangeDraft({
                      ...draft,
                      length: value as WritingStyleLength | "",
                    })
                  }
                  isDisabled={isDisabled}
                  disabledMessage={disabledMessage}
                >
                  <SegmentedControlItem
                    value=""
                    label={inheritedLengthOptionLabel(inheritedStyle.length)}
                  />
                  <SegmentedControlItem
                    value="short"
                    label={WRITING_STYLE_LENGTH_LABELS.short}
                  />
                  <SegmentedControlItem
                    value="medium"
                    label={WRITING_STYLE_LENGTH_LABELS.medium}
                  />
                  <SegmentedControlItem
                    value="long"
                    label={WRITING_STYLE_LENGTH_LABELS.long}
                  />
                </SegmentedControl>
              </div>
            </Field>

            <TextArea
              ref={(node) => setFieldRef("ctaStyle", node)}
              label="Phong cách kêu gọi hành động (CTA)"
              description="Không kèm số điện thoại hay đường link ngoài — các luật cứng của hệ thống luôn được ưu tiên."
              value={draft.ctaStyle}
              onChange={(value) => onChangeDraft({ ...draft, ctaStyle: value })}
              placeholder={inheritedTextPlaceholder(
                inheritedStyle.ctaStyle,
                "Ví dụ: Nhắc khách nhắn chiều cao/cân nặng để shop chọn size chuẩn",
              )}
              rows={2}
              maxLength={WRITING_STYLE_LIMITS.ctaStyleMax}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={
                fieldErrors.ctaStyle
                  ? { type: "error", message: fieldErrors.ctaStyle }
                  : undefined
              }
              statusVariant="detached"
            />
          </Stack>
        </Card>

        {/* 4. Hashtag & chân bài */}
        <Card padding={5} aria-labelledby={`${baseId}-sec-hashtags`}>
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1}>
              <Heading level={2} id={`${baseId}-sec-hashtags`}>
                Hashtag &amp; chân bài
              </Heading>
              <Text type="supporting" color="secondary">
                Cố định các hashtag thương hiệu, giới hạn hashtag AI tự gợi ý và tuỳ chỉnh dòng
                cam kết cuối bài.
              </Text>
            </Stack>

            <ListFieldEditor
              fieldKey="hashtags.fixed"
              label="Hashtag cố định"
              description="Chỉ gồm chữ, số, dấu gạch dưới (_) và tối đa 40 ký tự mỗi tag (có thể kèm hoặc không kèm dấu #)."
              inheritedHint={inheritedListHint(inheritedStyle.hashtags?.fixed, {
                itemNoun: "hashtag",
              })}
              itemLabelPrefix="Hashtag"
              placeholder="Ví dụ: #vaycongso"
              rows={draft.hashtagsFixed}
              maxItems={WRITING_STYLE_LIMITS.hashtagsFixedMaxItems}
              maxChars={WRITING_STYLE_LIMITS.hashtagsFixedMaxChars}
              error={fieldErrors["hashtags.fixed"]}
              itemErrors={itemErrors["hashtags.fixed"]}
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              onAdd={() =>
                onChangeDraft({
                  ...draft,
                  hashtagsFixed: addListRow(
                    draft.hashtagsFixed,
                    WRITING_STYLE_LIMITS.hashtagsFixedMaxItems,
                    nextRowId("ht"),
                  ),
                })
              }
              onChangeRow={(id, value) =>
                onChangeDraft({
                  ...draft,
                  hashtagsFixed: updateListRow(draft.hashtagsFixed, id, value),
                })
              }
              onRemove={(id) =>
                onChangeDraft({
                  ...draft,
                  hashtagsFixed: removeListRow(draft.hashtagsFixed, id),
                })
              }
              onRowRef={setRowRef}
              onGroupRef={setFieldRef}
            />

            <NumberInput
              ref={(node) => setFieldRef("hashtags.maxExtra", node)}
              label="Số hashtag bổ sung tối đa"
              description="Số hashtag AI được phép thêm ngoài danh sách cố định (từ 0 đến 5)."
              value={draft.hashtagsMaxExtra}
              onChange={(value) => onChangeDraft({ ...draft, hashtagsMaxExtra: value })}
              hasClear
              hasNumberSteppers
              isIntegerOnly
              min={WRITING_STYLE_LIMITS.hashtagsMaxExtraMin}
              max={WRITING_STYLE_LIMITS.hashtagsMaxExtraMax}
              placeholder={inheritedNumberPlaceholder(
                inheritedStyle.hashtags?.maxExtra,
                "0–5",
              )}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={
                fieldErrors["hashtags.maxExtra"]
                  ? { type: "error", message: fieldErrors["hashtags.maxExtra"] }
                  : undefined
              }
              statusVariant="detached"
            />

            <TextArea
              ref={(node) => setFieldRef("footer", node)}
              label="Chân bài"
              description="Ghi đè dòng chân bài mặc định cuối mỗi bài viết. Để trống để dùng chân bài mặc định."
              value={draft.footer}
              onChange={(value) => onChangeDraft({ ...draft, footer: value })}
              placeholder={inheritedTextPlaceholder(
                inheritedStyle.footer,
                "Ví dụ: Được kiểm tra hàng trước khi thanh toán",
              )}
              rows={3}
              maxLength={WRITING_STYLE_LIMITS.footerMax}
              width="100%"
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              status={
                fieldErrors.footer
                  ? { type: "error", message: fieldErrors.footer }
                  : undefined
              }
              statusVariant="detached"
            />
          </Stack>
        </Card>

        {/* 5. Nên / Không nên */}
        <Card padding={5} aria-labelledby={`${baseId}-sec-dos-donts`}>
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1}>
              <Heading level={2} id={`${baseId}-sec-dos-donts`}>
                Nên / Không nên
              </Heading>
              <Text type="supporting" color="secondary">
                Hướng dẫn cụ thể cho AI. Các luật cứng (giá chính xác, chỉ nói màu/size còn
                hàng, không bịa cam kết, không tên thương hiệu khác) luôn được ưu tiên.
              </Text>
            </Stack>

            <ListFieldEditor
              fieldKey="dos"
              label="Nên làm"
              description="Các điểm cần nhấn mạnh khi giới thiệu sản phẩm."
              inheritedHint={inheritedListHint(inheritedStyle.dos, {
                itemNoun: "mục nên làm",
              })}
              itemLabelPrefix="Mục nên làm"
              placeholder="Ví dụ: Nhấn mạnh chất vải và độ che khuyết điểm nếu có trong dữ liệu"
              rows={draft.dos}
              maxItems={WRITING_STYLE_LIMITS.dosMaxItems}
              maxChars={WRITING_STYLE_LIMITS.dosMaxChars}
              error={fieldErrors.dos}
              itemErrors={itemErrors.dos}
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              onAdd={() =>
                onChangeDraft({
                  ...draft,
                  dos: addListRow(draft.dos, WRITING_STYLE_LIMITS.dosMaxItems, nextRowId("dos")),
                })
              }
              onChangeRow={(id, value) =>
                onChangeDraft({
                  ...draft,
                  dos: updateListRow(draft.dos, id, value),
                })
              }
              onRemove={(id) =>
                onChangeDraft({
                  ...draft,
                  dos: removeListRow(draft.dos, id),
                })
              }
              onRowRef={setRowRef}
              onGroupRef={setFieldRef}
            />

            <ListFieldEditor
              fieldKey="donts"
              label="Không nên làm"
              description="Những cách diễn đạt hoặc thói quen shop muốn tránh."
              inheritedHint={inheritedListHint(inheritedStyle.donts, {
                itemNoun: "mục không nên làm",
              })}
              itemLabelPrefix="Mục không nên"
              placeholder="Ví dụ: Không viết toàn bộ chữ in hoa ở câu mở đầu"
              rows={draft.donts}
              maxItems={WRITING_STYLE_LIMITS.dontsMaxItems}
              maxChars={WRITING_STYLE_LIMITS.dontsMaxChars}
              error={fieldErrors.donts}
              itemErrors={itemErrors.donts}
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              onAdd={() =>
                onChangeDraft({
                  ...draft,
                  donts: addListRow(
                    draft.donts,
                    WRITING_STYLE_LIMITS.dontsMaxItems,
                    nextRowId("donts"),
                  ),
                })
              }
              onChangeRow={(id, value) =>
                onChangeDraft({
                  ...draft,
                  donts: updateListRow(draft.donts, id, value),
                })
              }
              onRemove={(id) =>
                onChangeDraft({
                  ...draft,
                  donts: removeListRow(draft.donts, id),
                })
              }
              onRowRef={setRowRef}
              onGroupRef={setFieldRef}
            />

            <ListFieldEditor
              fieldKey="extraBanned"
              label="Cụm từ cấm bổ sung"
              description="Gộp thêm vào danh sách cụm từ cấm toàn hệ thống — danh sách cấm mặc định của hệ thống không thể gỡ bỏ."
              inheritedHint={inheritedListHint(inheritedStyle.extraBanned, {
                itemNoun: "cụm từ cấm",
                mergesWithParent: true,
              })}
              itemLabelPrefix="Cụm từ cấm"
              placeholder="Ví dụ: xả kho, sập sàn"
              rows={draft.extraBanned}
              maxItems={WRITING_STYLE_LIMITS.extraBannedMaxItems}
              maxChars={WRITING_STYLE_LIMITS.extraBannedMaxChars}
              error={fieldErrors.extraBanned}
              itemErrors={itemErrors.extraBanned}
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              onAdd={() =>
                onChangeDraft({
                  ...draft,
                  extraBanned: addListRow(
                    draft.extraBanned,
                    WRITING_STYLE_LIMITS.extraBannedMaxItems,
                    nextRowId("ban"),
                  ),
                })
              }
              onChangeRow={(id, value) =>
                onChangeDraft({
                  ...draft,
                  extraBanned: updateListRow(draft.extraBanned, id, value),
                })
              }
              onRemove={(id) =>
                onChangeDraft({
                  ...draft,
                  extraBanned: removeListRow(draft.extraBanned, id),
                })
              }
              onRowRef={setRowRef}
              onGroupRef={setFieldRef}
            />
          </Stack>
        </Card>

        {/* 6. Bài mẫu của shop */}
        <Card padding={5} aria-labelledby={`${baseId}-sec-examples`}>
          <Stack direction="vertical" gap={4}>
            <Stack direction="vertical" gap={1}>
              <Heading level={2} id={`${baseId}-sec-examples`}>
                Bài mẫu của shop
              </Heading>
              <Text type="supporting" color="secondary">
                Dán tối đa 5 bài viết cũ ưng ý nhất của shop. AI chỉ học nhịp điệu và cách xuống
                dòng — không sao chép nội dung hay số liệu từ bài mẫu.
              </Text>
            </Stack>

            <ListFieldEditor
              fieldKey="examples"
              label="Danh sách bài mẫu"
              description="Mỗi bài tối đa 1.200 ký tự."
              inheritedHint={inheritedListHint(inheritedStyle.examples, {
                itemNoun: "bài mẫu",
              })}
              itemLabelPrefix="Bài mẫu"
              placeholder="Dán một bài đăng cũ của shop để AI tham khảo nhịp viết…"
              rows={draft.examples}
              maxItems={WRITING_STYLE_LIMITS.examplesMaxItems}
              maxChars={WRITING_STYLE_LIMITS.examplesMaxChars}
              multiline
              error={fieldErrors.examples}
              itemErrors={itemErrors.examples}
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              onAdd={() =>
                onChangeDraft({
                  ...draft,
                  examples: addListRow(
                    draft.examples,
                    WRITING_STYLE_LIMITS.examplesMaxItems,
                    nextRowId("ex"),
                  ),
                })
              }
              onChangeRow={(id, value) =>
                onChangeDraft({
                  ...draft,
                  examples: updateListRow(draft.examples, id, value),
                })
              }
              onRemove={(id) =>
                onChangeDraft({
                  ...draft,
                  examples: removeListRow(draft.examples, id),
                })
              }
              onRowRef={setRowRef}
              onGroupRef={setFieldRef}
            />
          </Stack>
        </Card>

        {/* Save bar */}
        <div className="sticky bottom-4 z-10">
          <Card elevation="low" padding={5}>
            <HStack gap={3} justify="between" align="center" wrap="wrap">
              <div className="min-w-0 flex-1">
                {readOnlyReason ? (
                  <ReadOnlyNotice reason={readOnlyReason} />
                ) : isDirty ? (
                  <HStack gap={2} align="center" wrap="wrap">
                    <Badge variant="warning" label="Chưa lưu" />
                    <Text type="supporting" color="secondary">
                      Bạn có thay đổi chưa lưu cho “{scopeLabel}”.
                    </Text>
                  </HStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    Chưa có thay đổi mới cho “{scopeLabel}”.
                  </Text>
                )}
              </div>

              <HStack gap={2} align="center" wrap="wrap">
                <Button
                  type="button"
                  variant="ghost"
                  label="Huỷ thay đổi"
                  isDisabled={isDisabled || !isDirty}
                  tooltip={discardDisabledTooltip}
                  onClick={onDiscard}
                />
                <Button
                  type="submit"
                  variant="primary"
                  label="Lưu"
                  isLoading={isSaving}
                  isDisabled={isDisabled || !isDirty}
                  tooltip={saveDisabledTooltip}
                />
              </HStack>
            </HStack>
          </Card>
        </div>
      </Stack>
    </form>
  );
}
