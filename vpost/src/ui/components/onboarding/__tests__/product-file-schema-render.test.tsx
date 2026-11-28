import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductFileSchema } from "../ProductFileSchema";

/** Bảng cột + link tải trên màn Nhập sản phẩm, kiểm trên HTML thật (vitest chạy node, không jsdom). */
describe("ProductFileSchema", () => {
  const html = renderToStaticMarkup(<ProductFileSchema />);

  it("names the required and compose-needed columns", () => {
    for (const text of ["Mã sản phẩm", "Bắt buộc", "Giá bán", "Size", "Ảnh", "Cần để soạn bài"]) {
      expect(html).toContain(text);
    }
  });

  it("links the template and the demo file", () => {
    expect(html).toContain('href="/api/vpost/catalog/template"');
    expect(html).toContain('href="/api/sample"');
  });
});
