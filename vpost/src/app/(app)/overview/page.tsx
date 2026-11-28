import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOperatorSession } from "@/app/_auth/session";
import { OverviewScreen } from "@/ui/components/overview/OverviewScreen";

export const metadata: Metadata = {
  title: "Tổng quan — VPOST",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await getOperatorSession("page:/overview");

  if (!session) redirect("/signin?returnUrl=%2Foverview");

  return (
    <>
      {session.isDevFake ? (
        <p
          role="status"
          className="border-warning/30 bg-warning/10 text-warning-foreground border-b px-4 py-2.5 text-xs font-medium sm:px-6"
        >
          Phiên giả lập DEV — chưa đăng nhập thật. Tắt biến DEV_FAKE_SESSION để dùng đăng nhập Google.
        </p>
      ) : null}

      <OverviewScreen />
    </>
  );
}
