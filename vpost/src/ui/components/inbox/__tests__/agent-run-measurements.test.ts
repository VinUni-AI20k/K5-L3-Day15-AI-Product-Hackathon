import { describe, expect, it } from "vitest";

import { extractTraceMeasurements } from "@/ui/components/inbox/agent-run-state";

describe("extractTraceMeasurements", () => {
  it("never reads measurements from non-measurement step text such as '122 ký tự'", () => {
    const run = {
      steps: [
        { key: "read", label: "Đọc bình luận", status: "ok", detail: "Đã đọc 1 tin nhắn trong hội thoại", at: "2026-11-28T08:49:56Z" },
        { key: "compose", label: "Soạn câu trả lời", status: "ok", detail: "AI đã soạn nháp (122 ký tự, 1 lượt)", at: "2026-11-28T08:49:58Z" },
      ],
    } as unknown as Parameters<typeof extractTraceMeasurements>[0];
    expect(extractTraceMeasurements(run)).toBeNull();
  });
});
