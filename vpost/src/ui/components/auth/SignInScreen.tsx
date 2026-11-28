"use client";

import {
  Banner,
  Button,
  Card,
  Divider,
  Heading,
  LinkProvider,
  Stack,
  Tab,
  TabList,
  Text,
  Theme,
} from "@astryxdesign/core";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { PasswordAuthForm } from "@/ui/components/auth/PasswordAuthForm";
import { AppLink } from "@/ui/components/shell/AppLink";
import { ASTRYX_LOCALE, ASTRYX_VI } from "@/ui/i18n/astryx-vi";
import {
  AUTH_MODES,
  AUTH_MODE_LABELS,
  authModeHref,
  type AuthMode,
  type PasswordAuthAction,
} from "@/ui/schemas/password-auth.schema";
// The BUILT theme, same import AppFrame uses — see the note there for why the
// artifact and not the source module.
import { vpostTheme } from "@/ui/theme/vpost";

/**
 * `/signin` — the split sign-in screen (E10).
 *
 * Two halves, one purpose: the left half says what this tool is (an operator
 * who lands here from a middleware redirect may never have seen it), the right
 * half is the only way in.
 *
 * Responsive contract:
 *   >= ~920px  brand column | auth column, 50/50
 *   <  ~920px  one column — brand stacks ABOVE the auth column. It is not
 *              hidden: the five lines below it are the only explanation of what
 *              the operator is signing in to, and hiding them on a phone would
 *              leave a bare pair of buttons.
 *
 * EVERY CONTROL ON THIS SCREEN WORKS (spec §3.7). It once carried a DISABLED
 * email/password block, a dead "Quên mật khẩu" link and a tab strip whose only
 * effect was relabelling that block; commit 521d47b removed the lot, because a
 * preview of a feature with no ticket behind it costs more trust than the empty
 * space costs curiosity. The tab strip is back now for the opposite reason: the
 * password backend exists, both tabs submit, and both sign people in.
 *
 * THE ORDER — password first, providers second, separated by "Hoặc". The
 * password pair is what a brand-new operator without a company Google account
 * has, and Facebook stays visible below because that same round trip also
 * brings the Page tokens back (E5.2).
 *
 * Every form here is a plain `<form action>` with a Server Action, so they all
 * submit before the client bundle loads (web-auth-flows rule 5) — this page is
 * the front door. The tab switch is an ANCHOR for the same reason.
 */

/** Why the product exists, in the operator's words — not feature names. */
const VALUE_POINTS = [
  "Đăng bài Facebook hàng loạt, chạy tự động",
  "AI viết caption riêng cho từng kênh",
  "Kiểm tồn kho trước khi đăng — hết hàng là chặn",
  "Quản lý nhiều kênh, chống đăng trùng",
  "Người duyệt kiểm soát trước khi bài lên",
] as const;

export type SignInScreenProps = {
  /** Already sanitised by `safeReturnUrl` on the server; travels in a hidden field. */
  returnUrl: string;
  /** True when `returnUrl` is the plain home page — then there is nothing to announce. */
  isDefaultReturnUrl: boolean;
  /** Vietnamese sentence for `?error=`, or null when the visit is clean. */
  errorMessage: string | null;
  /** Raw code, only when it has no translation — support needs to hear it. */
  unknownErrorCode: string | null;
  /** The account exists and is queued for an admin. Not a failure. */
  isPendingApproval: boolean;
  /** Which tab the address asks for (`?mode=`), parsed on the server. */
  mode: AuthMode;
  /** `signInWithPasswordAction`, already wrapped as a `useActionState` reducer. */
  signInWithPassword: PasswordAuthAction;
  /** `registerWithPasswordAction`, same wrapping. */
  registerWithPassword: PasswordAuthAction;
  signInWithGoogle: (formData: FormData) => Promise<void>;
  signInWithFacebook: (formData: FormData) => Promise<void>;
};

export function SignInScreen({
  returnUrl,
  isDefaultReturnUrl,
  errorMessage,
  unknownErrorCode,
  isPendingApproval,
  mode,
  signInWithPassword,
  registerWithPassword,
  signInWithGoogle,
  signInWithFacebook,
}: SignInScreenProps) {
  /**
   * The address survives a tab switch because it lives HERE, above both forms
   * (core-auth-flows §"Chuyển giữa ba luồng"). The two forms themselves are
   * separate mounts, so the refusal from the tab being left never bleeds into
   * the one being opened.
   */
  const [email, setEmail] = useState("");

  return (
    /* THE SAME THREE PROVIDERS AppFrame wraps the app in, because this screen
       lives OUTSIDE the `(app)` group and therefore outside AppFrame.
       Without `<Theme theme={vpostTheme}>`, Astryx components fall back to
       the built-in neutral blue accent instead of the VPOST semantic token set.
       `LinkProvider` and the Vietnamese catalog come along for the same reason
       they do in AppFrame — an Astryx `Link` here must route like every other,
       and Astryx's built-in strings must speak Vietnamese on this page too. */
    <LinkProvider component={AppLink}>
      <InternationalizationProvider
        locale={ASTRYX_LOCALE}
        messages={{ [ASTRYX_LOCALE]: ASTRYX_VI }}
      >
        <Theme theme={vpostTheme}>
          <div className="bg-background grid min-h-full w-full flex-1 grid-cols-1 lg:grid-cols-2">
            <BrandColumn />

            {/* THE AUTH COLUMN — one calm island card on the pure page ground. */}
            <div className="bg-background flex flex-col justify-center px-4 py-8 sm:px-6 lg:p-10">
              <Stack
                direction="vertical"
                vAlign="center"
                gap={5}
                className="mx-auto w-full max-w-md"
              >
                <Card elevation="low" padding={6} width="100%">
                  <Stack
                    direction="vertical"
                    gap={5}
                    as="section"
                    aria-label="Tự động hóa cùng VPOST ngay"
                  >
                    <Stack direction="vertical" gap={1.5}>
                      <Heading level={2}>Tự động hóa cùng VPOST ngay</Heading>
                      <Text type="supporting" color="secondary">
                        {mode === "register"
                          ? "Tạo tài khoản để bắt đầu dùng VPOST."
                          : "Chào mừng bạn trở lại. Đăng nhập để tiếp tục soạn và đăng bài."}
                      </Text>
                    </Stack>

                    {/* Neither banner is decoration: they are the only explanation an
                        operator gets for a round trip that ended back here. */}
                    {isPendingApproval ? (
                      // `status="info"` + `role="status"`, never error red: the request
                      // was recorded and is waiting for a human. Someone who reads
                      // "bị từ chối" goes and asks for a second account instead of
                      // waiting five minutes (core-feedback-states).
                      <Banner
                        status="info"
                        role="status"
                        title="Tài khoản đang chờ quản trị viên duyệt"
                        description="Yêu cầu truy cập của bạn đã được ghi nhận. Vui lòng đợi quản trị viên duyệt."
                      />
                    ) : null}

                    {errorMessage ? (
                      <Stack direction="vertical" gap={1.5}>
                        <Banner
                          status="error"
                          role="alert"
                          title="Không đăng nhập được"
                          description={errorMessage}
                        />
                        {unknownErrorCode ? (
                          <Text type="code" size="xsm" color="secondary">
                            Mã lỗi: {unknownErrorCode}
                          </Text>
                        ) : null}
                      </Stack>
                    ) : null}

                    {/* Anchors, not buttons: `/signin?mode=register` is a real address,
                        so the switch works before hydration, survives F5 and Back, and
                        can be sent to a colleague. `TabList` requires `onChange`, but
                        the anchors already own the navigation — handling it a second
                        time is what would navigate twice (the same trap MembersHub
                        documents). AppLink comes from the LinkProvider above, so the
                        move stays client-side and the typed e-mail is preserved. */}
                    <TabList
                      value={mode}
                      onChange={() => undefined}
                      layout="fill"
                      aria-label="Chọn cách vào hệ thống"
                    >
                      {AUTH_MODES.map((value) => (
                        <Tab
                          key={value}
                          value={value}
                          label={AUTH_MODE_LABELS[value]}
                          href={authModeHref(value, returnUrl)}
                        />
                      ))}
                    </TabList>

                    {/* `key` — switching tabs must build a NEW form, not re-label the
                        old one: a refusal from the tab being left has nothing to say
                        about the tab being opened (core-form-architecture §"Đổi ID reset
                        bằng key prop"). The e-mail lives above, so it survives. */}
                    <PasswordAuthForm
                      key={mode}
                      mode={mode}
                      action={mode === "register" ? registerWithPassword : signInWithPassword}
                      returnUrl={returnUrl}
                      email={email}
                      onEmailChange={setEmail}
                    />

                    <Divider label="Hoặc tiếp tục với" />

                    {/* Two independent forms, not one with two buttons: each carries its
                        own Server Action, and a failure of one must not touch the other. */}
                    <Stack direction="vertical" gap={3}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* Both secondary since the password form arrived: the screen
                            gets ONE primary button, and it is the submit of the form the
                            operator is looking at. */}
                        <ProviderForm
                          action={signInWithFacebook}
                          returnUrl={returnUrl}
                          label="Tiếp tục với Facebook"
                          pendingLabel="Đang chuyển sang Facebook…"
                          variant="secondary"
                        />
                        <ProviderForm
                          action={signInWithGoogle}
                          returnUrl={returnUrl}
                          label="Tiếp tục với Google"
                          pendingLabel="Đang chuyển sang Google…"
                          variant="secondary"
                        />
                      </div>

                      {/* One shared line for both buttons. Two separate paragraphs said
                          the same thing twice and pushed the terms line off the fold. */}
                      <Text type="supporting" color="secondary">
                        Liên hệ với VPOST ngay để nhận hỗ trợ.
                      </Text>
                    </Stack>

                    {isDefaultReturnUrl ? null : (
                      <Text type="supporting" color="secondary">
                        Sau khi đăng nhập, bạn sẽ quay lại: <Text type="code">{returnUrl}</Text>
                      </Text>
                    )}

                    <Text type="supporting" size="xsm" color="secondary">
                      Khi tiếp tục, bạn đồng ý với quy định sử dụng nội bộ của VPOST.
                    </Text>
                  </Stack>
                </Card>

                <footer className="w-full text-center lg:text-start">
                  <Text type="supporting" size="xsm" color="secondary">
                    © VPOST 2026. All rights reserved.
                  </Text>
                </footer>
              </Stack>
            </div>
          </div>
        </Theme>
      </InternationalizationProvider>
    </LinkProvider>
  );
}

/**
 * The left half. Pure typography and tokens — no bitmap collage, because the
 * only pictures this product owns are customer product photos and none of them
 * belong on a public sign-in page.
 */
function BrandColumn() {
  return (
    <div className="bg-sidebar border-border flex flex-col justify-center border-b px-4 py-8 sm:px-6 lg:border-e lg:border-b-0 lg:p-12">
      {/* Bounded to the same measure the auth island uses and centred in the
          half, so the two columns read as facing blocks instead of one text
          rail pinned to the window edge. */}
      <Stack direction="vertical" gap={6} className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"
          >
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <Text weight="bold" size="lg">
              VPOST
            </Text>
            <Text type="supporting" size="xsm" color="secondary">
              Đăng bài tự động
            </Text>
          </div>
        </header>

        <Stack direction="vertical" gap={2}>
          <Heading level={1} className="sm:text-4xl sm:leading-tight">
            Bắt đầu ngay hôm nay
          </Heading>
          <Text type="large" color="secondary">
            Công cụ soạn, duyệt và đăng bài đa nền tảng
          </Text>
        </Stack>

        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {VALUE_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-success/15 text-success-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
              >
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <Text className="text-foreground">{point}</Text>
            </li>
          ))}
        </ul>
      </Stack>
    </div>
  );
}

/**
 * One provider = one real `<form action>`.
 *
 * `signIn()` throws NEXT_REDIRECT, so the Server Action must never wrap it in
 * try/catch — swallowing that signal would leave the operator on a page that
 * looks like it did nothing (web-data-fetching rule 4). The action lives in the
 * page; this component only carries it.
 */
function ProviderForm({
  action,
  returnUrl,
  label,
  pendingLabel,
  variant,
}: {
  action: (formData: FormData) => Promise<void>;
  returnUrl: string;
  label: string;
  pendingLabel: string;
  variant: "primary" | "secondary";
}) {
  return (
    // A raw <form>: Astryx has no form primitive, and this element is the whole
    // point — it submits without JavaScript.
    <form action={action}>
      {/* Re-sanitised server-side by `safeReturnUrl` on the way back in: this
          field is client-visible and therefore client-editable. */}
      <input type="hidden" name="returnUrl" value={returnUrl} />
      <ProviderSubmitButton label={label} pendingLabel={pendingLabel} variant={variant} />
    </form>
  );
}

/**
 * The submit button, split out only because `useFormStatus` reads the status of
 * the form it is rendered INSIDE. The OAuth hop takes a visible moment; without
 * this the operator sees a dead button and clicks it again.
 *
 * No hand-rolled live region here: Astryx's Button already renders a
 * `VisuallyHidden` with `aria-live="polite"` while `isLoading`
 * (dist/Button/Button.js:481-484), and sets `aria-label` from `label` in that
 * state — so swapping the label to `pendingLabel` is what gets announced. A
 * second region of our own read the same sentence twice.
 */
function ProviderSubmitButton({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size="lg"
      width="100%"
      label={pending ? pendingLabel : label}
      isLoading={pending}
    />
  );
}
