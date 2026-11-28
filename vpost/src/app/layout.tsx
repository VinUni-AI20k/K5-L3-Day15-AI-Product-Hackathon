import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";

import {
  COLOR_SCHEME_ATTRIBUTE,
  COLOR_SCHEME_BOOTSTRAP_SCRIPT,
  COLOR_SCHEME_COOKIE,
  DARK_SCHEME_CLASS,
  parseColorSchemeCookie,
  resolveColorSchemeOnServer,
} from "@/shared/color-scheme";

import { Providers } from "./providers";
import "./globals.css";

/**
 * design system primary sans face: Hanken Grotesk ships full `vietnamese` + `latin`
 * subsets in `next/font/google`, so Vietnamese diacritics render natively in
 * the same family across both Tailwind (`--font-sans`) and Astryx
 * (`--font-family-body` / `--font-family-heading`).
 */
const appSans = Hanken_Grotesk({
  variable: "--font-app-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

/** Codes, ids and counts: they line up in a column only in a mono face. */
const appMono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VPOST — Đăng bài tự động",
  description: "Công cụ đăng bài tự động cho Facebook và TikTok",
  // VPOST: ảnh sản phẩm là link Google (lh3.googleusercontent.com) — Google chặn khi có Referer lạ.
  referrer: "no-referrer",
  // Meta Business domain verification for vpost.vannt.asia (must be in server-rendered <head>).
  other: { "facebook-domain-verification": "o40psj52tndat2egji49b1yc4t8ldx" },
};

/**
 * Session-independent, but NOT static: reads the per-viewer colour-scheme
 * cookie here so an explicit light/dark preference arrives on first paint.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();

  const schemeChoice = parseColorSchemeCookie(cookieStore.get(COLOR_SCHEME_COOKIE)?.value);
  const resolvedScheme = resolveColorSchemeOnServer(schemeChoice);

  return (
    <html
      lang="vi"
      /* The bootstrap script below adds `.dark` synchronously before hydration
         whenever the viewer's preference is "system" on a dark OS. Suppress the
         expected root attribute mismatch so React keeps the pre-paint class
         without surfacing a hydration error in the Next dev overlay.
         `suppressHydrationWarning` applies only one level deep (to `<html>`). */
      suppressHydrationWarning
      /* The CHOICE travels too, so the toggle can render "Theo máy" as chosen
         rather than inferring it back from whichever class ended up applied. */
      {...{ [COLOR_SCHEME_ATTRIBUTE]: schemeChoice }}
      className={[
        appSans.variable,
        appMono.variable,
        "h-full antialiased",
        // An explicit choice is settled here, server-side: no script, no flash.
        resolvedScheme === "dark" ? DARK_SCHEME_CLASS : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* "Theo máy" is the ONE case the server cannot answer — the preference
            lives in the operating system, not in the request. This runs
            synchronously, before anything below it is painted, so a viewer on a
            dark desktop never sees a white frame (web-design-tokens §5). It is
            rendered only for that case: an explicit choice already has its
            class and must not pay for a blocking script on every page load. */}
        {resolvedScheme === null ? (
          <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_BOOTSTRAP_SCRIPT }} />
        ) : null}
        {/* Direction contract (new-work §5): the approved "Sổ mẫu vải" brief travels
            with the markup, so any later change can be checked against it. Written
            unaccented on purpose — it must survive any transport that mangles UTF-8. */}
        <div
          hidden
          aria-hidden="true"
          data-direction-contract
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: VPOST la so mau vai cua xuong: moi mau la mot the vai, moi ma san pham mot trang mau; tu choi admin-SaaS card trang + accent tim rai deu.
OWN-WORLD: nen vai moc oklch(0.955 0.013 84), muc am, cham indigo hanh dong, the mau bao hoa canh bac thang, nhan det mono cho ma/so.
STORY: nguoi van hanh mo so mau, thay viec hom nay, rut the soan bai, duyet caption, luon tra loi duoc "vi sao bai nay khong len".
FIRST VIEWPORT: hang so lieu tren nhan det (bam duoc) + viec can chu y + chong the lo dang chay; mot hanh dong chinh "Soan bai moi".
FORM: grounded #4 vong 2, seed e06531fb.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
