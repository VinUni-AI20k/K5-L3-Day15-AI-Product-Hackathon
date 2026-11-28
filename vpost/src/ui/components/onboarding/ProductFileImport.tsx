"use client";

import { Banner, Button, FileInput, HStack, Heading, List, ListItem, Text } from "@astryxdesign/core";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiErrorNotice } from "@/ui/components/feedback/ApiErrorNotice";
import { ReadOnlyNotice } from "@/ui/components/feedback/ReadOnlyNotice";
import { ProductFileSchema } from "@/ui/components/onboarding/ProductFileSchema";
import { writeGate } from "@/ui/hooks/read-only-gate";
import { useImportProductFile } from "@/ui/hooks/useCatalogProducts";
import { useReadOnlyReason } from "@/ui/hooks/useReadOnlyReason";
import {
  MAX_PRODUCT_FILE_BYTES,
  PRODUCT_FILE_ACCEPT,
  formatFileBytes,
} from "@/ui/schemas/catalog.schema";

/**
 * "Kết nối dữ liệu" khi VPOST chạy với backend Python (VPOST_API_URL): nhập
 * thẳng file Excel/CSV sản phẩm. Backend đó không có wizard /api/catalog/*.
 *
 * Dòng thiếu giá/size/màu/ảnh VẪN được nhập; màn Sản phẩm đánh dấu "bị chặn"
 * và bước soạn bài từ chối chúng. Chỉ dòng không có mã (hoặc trùng mã) bị bỏ.
 */
export function ProductFileImport() {
  const router = useRouter();
  const upload = useImportProductFile();
  const gate = writeGate(useReadOnlyReason(), upload.isPending);
  // Giữ file đã chọn khi lỗi, để "thử lại" chỉ cần bấm nút, không phải chọn lại.
  const [picked, setPicked] = useState<File | null>(null);
  const result = upload.data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="border-border flex flex-col gap-2 border-b pb-5">
        <Heading level={1}>Nhập sản phẩm</Heading>
        <Text type="supporting">
          Tải file Excel (.xlsx) hoặc CSV chứa danh sách sản phẩm. Hệ thống tự nhận tên cột (mã, giá
          bán, size, màu, chất liệu, ảnh…). Sản phẩm thiếu thông tin vẫn được nhập, chỉ bị lọc ra khi
          soạn bài. File mới thay toàn bộ danh sách sản phẩm đang có.
        </Text>
      </header>

      <ProductFileSchema />

      <ReadOnlyNotice reason={gate.reason} />

      <FileInput
        label="File sản phẩm (.xlsx hoặc .csv)"
        description={`Tối đa ${formatFileBytes(MAX_PRODUCT_FILE_BYTES)}. Mỗi dòng một mã sản phẩm. Kéo thả file vào đây, hoặc bấm để chọn.`}
        mode="dropzone"
        accept={PRODUCT_FILE_ACCEPT}
        maxSize={MAX_PRODUCT_FILE_BYTES}
        value={picked}
        onChange={(files) => setPicked(Array.isArray(files) ? (files[0] ?? null) : files)}
        isDisabled={gate.isDisabled}
        disabledMessage={gate.reason ?? undefined}
        isLoading={upload.isPending}
      />

      {upload.isError ? (
        <ApiErrorNotice error={upload.error} shouldFocus={false} source="Nhập file sản phẩm" />
      ) : null}

      <HStack gap={2} wrap="wrap" align="center">
        <Button
          variant="primary"
          label={upload.isPending ? "Đang nhập…" : "Nhập sản phẩm"}
          isLoading={upload.isPending}
          isDisabled={gate.isDisabled}
          tooltip={gate.reason ?? undefined}
          onClick={() => {
            if (picked) upload.mutate(picked);
          }}
        />
        {picked ? null : <Text type="supporting">Chọn file trước khi bấm nhập.</Text>}
      </HStack>

      {result ? (
        <Banner
          status="success"
          title={`Đã nhập ${String(result.rows)} mã sản phẩm`}
          description={
            result.skipped.length > 0
              ? `Bỏ qua ${String(result.skipped.length)} dòng không có mã hoặc trùng mã. Mã thiếu thông tin vẫn có trong danh sách, ghi lý do ở màn Sản phẩm.`
              : "Mã thiếu thông tin vẫn có trong danh sách, ghi lý do ở màn Sản phẩm."
          }
          endContent={
            <Button
              variant="secondary"
              size="sm"
              label="Xem danh sách sản phẩm"
              onClick={() => router.push("/products")}
            />
          }
          defaultIsExpanded
        >
          {result.skipped.length > 0 ? (
            <List>
              {result.skipped.map((s) => (
                <ListItem key={`${String(s.line)}-${s.reason}`} label={`Dòng ${String(s.line)}: ${s.reason}`} />
              ))}
            </List>
          ) : null}
        </Banner>
      ) : null}
    </div>
  );
}
