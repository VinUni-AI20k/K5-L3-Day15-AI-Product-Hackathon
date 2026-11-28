import { HStack, Heading, Link, Stack, Table, Text } from "@astryxdesign/core";

/**
 * "File cần những cột nào" trên màn Nhập sản phẩm. Tên cột khớp file mẫu do
 * backend sinh (`codebase/vpost_api.py` TEMPLATE_COLUMNS); backend nhận cả tên
 * không dấu, hoa/thường, thứ tự tuỳ ý.
 */
const COLUMNS = [
  { cot: "Mã sản phẩm", muc: "Bắt buộc — dòng không có mã bị bỏ", vidu: "VAY001" },
  { cot: "Giá bán", muc: "Cần để soạn bài", vidu: "890.000đ" },
  { cot: "Size", muc: "Cần để soạn bài", vidu: "S, M, L" },
  { cot: "Ảnh", muc: "Cần để soạn bài", vidu: "Link ảnh Drive, nhiều ảnh thì mỗi link một dòng" },
  { cot: "Màu", muc: "Nên có — thiếu thì bài không nhắc màu", vidu: "Đen, Trắng" },
  { cot: "Chất liệu", muc: "Nên có — thiếu thì bài không nhắc chất liệu", vidu: "Voan" },
  { cot: "Tên sản phẩm, Loại, Giá tệ, Mô tả, Page, Prompt", muc: "Tuỳ chọn", vidu: "" },
];

export function ProductFileSchema() {
  return (
    <Stack direction="vertical" gap={3}>
      <Heading level={2}>File cần những cột nào</Heading>
      <Table
        data={COLUMNS}
        columns={[
          { key: "cot", header: "Cột" },
          { key: "muc", header: "Mức độ" },
          { key: "vidu", header: "Ví dụ" },
        ]}
      />
      <Text type="supporting">
        Thiếu cột hay ô trống vẫn nhập được — sản phẩm đó chỉ bị lọc ra lúc soạn bài. Tên cột không
        phân biệt hoa thường, có dấu hay không dấu; cột thừa được bỏ qua.
      </Text>
      <HStack gap={4} wrap="wrap">
        <Link href="/api/vpost/catalog/template" download="mau-nhap-san-pham.csv" isStandalone>
          Tải file mẫu (.csv)
        </Link>
        <Link href="/api/sample" download="san-pham-mau.xlsx" isStandalone>
          Tải data demo (30 mẫu váy)
        </Link>
      </HStack>
    </Stack>
  );
}
