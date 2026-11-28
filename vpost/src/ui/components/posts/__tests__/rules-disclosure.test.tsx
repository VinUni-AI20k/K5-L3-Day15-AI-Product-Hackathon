import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RulesDisclosure } from "@/ui/components/posts/RulesDisclosure";

describe("RulesDisclosure (L4)", () => {
  it("renders closed by default with vertical padding meeting the rounded-xl radius/2 rule", () => {
    const html = renderToStaticMarkup(
      <RulesDisclosure>
        <p>Tồn kho được kiểm tra trước khi đăng.</p>
      </RulesDisclosure>,
    );

    expect(html).toContain("Chi tiết quy tắc");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("rounded-xl");
    expect(html).toContain("py-2");
    expect(html).not.toContain("py-1.5");
    expect(html).toContain("Tồn kho được kiểm tra trước khi đăng.");
  });
});
