/**
 * Authoritative Vietnamese copy constants for the VPOST public landing page (`/`).
 *
 * Rules enforced by `src/ui/components/landing/__tests__/landing-page.test.tsx`:
 *   1. Tone is concrete and calm — zero hype words.
 *   2. Every claim string containing a digit MUST carry an explicit `evidenceSource`
 *      pointing to a real file under `evidence/`.
 *   3. Zero invented customers, logos, testimonials, awards or metrics.
 *   4. Illustrative product-preview data lives in `HERO_MOCK_SAMPLE` (clearly
 *      marked "Minh họa giao diện"), separate from product claims.
 */

export const LANDING_METADATA = {
  title: "VPOST — Đăng bài và trả lời bình luận cho shop online",
  description:
    "Đăng bài bán hàng lên nhiều Fanpage từ file sản phẩm và trả lời bình luận khách nhanh, luôn có người duyệt.",
  canonical: "https://vpost.vannt.asia",
  siteName: "VPOST",
} as const;

export const LANDING_BRAND = {
  name: "VPOST",
  skipToContent: "Tới nội dung chính",
  homeAriaLabel: "VPOST — Về đầu trang",
  primaryNavAriaLabel: "Điều hướng chính",
  footerNavAriaLabel: "Liên kết chân trang",
} as const;

export const LANDING_NAV_LINKS = [
  { href: "#tinh-nang", label: "Tính năng" },
  { href: "#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "#an-toan", label: "An toàn" },
] as const;

export const LANDING_CTA_COPY = {
  signedOut: {
    label: "Đăng nhập",
    href: "/signin",
  },
  signedIn: {
    label: "Vào bảng điều khiển",
    href: "/overview",
  },
  heroSecondary: {
    label: "Xem cách hoạt động",
    href: "#cach-hoat-dong",
  },
  finalRegister: {
    label: "Tạo tài khoản mới",
    href: "/signin?mode=register",
  },
} as const;

export const HERO_COPY = {
  audienceBadge: "Dành cho chủ shop thời trang bán trên Facebook",
  headline:
    "Đăng bài bán hàng lên nhiều Fanpage từ file sản phẩm và trả lời bình luận khách nhanh, luôn có người duyệt.",
  supporting:
    "VPOST đọc trực tiếp giá, size, màu và tồn kho từ bảng tính của shop để soạn bài nháp khớp dữ kiện, đồng thời gom bình luận nhiều Page về một hộp thư dễ xử lý.",
  reassurance:
    "Mặc định tắt tự động trả lời · Mọi bài đăng đều qua bước duyệt của bạn",
} as const;

/**
 * Composed UI preview data (explicitly labelled as an interface illustration,
 * never presented as a real customer or performance claim).
 */
export const HERO_MOCK_SAMPLE = {
  stageLabel: "Minh họa giao diện",
  stageStatus: "Khớp dữ liệu bảng tính",
  post: {
    pageInitials: "TM",
    pageName: "Tiệm May Đan",
    meta: "Bản nháp chờ duyệt · Chọn nhiều Page",
    stockBadge: "Còn hàng",
    productCodeLabel: "Mã SP",
    productCodeValue: "DM-CV-LUA",
    caption:
      "Đầm midi cổ vuông chất liệu cotton lụa thoáng nhẹ, dáng công sở dễ mặc hằng ngày. Giá bán và tồn kho được lấy trực tiếp từ file sản phẩm của shop.",
    factPills: ["Giá: 450.000đ", "Size: S, M, L", "Màu: Đen, Kem"] as const,
    verificationNote: "Đã đối chiếu bảng tính — chờ bạn duyệt",
  },
  comments: {
    sectionLabel: "Hộp thư bình luận",
    customerLabel: "Khách bình luận",
    customerText: "Mẫu này giá bao nhiêu và còn size M màu kem không shop?",
    pageLabel: "Tiệm May Đan",
    autoReplyTag: "Tự động trả lời",
    pageReplyText:
      "Dạ mẫu này giá 450.000đ, màu Kem hiện còn size S và M ạ. Thông tin lấy trực tiếp từ dữ liệu sản phẩm của shop.",
    escalationPrompt: "Khách hỏi phí ship hoặc đổi size?",
    escalationTag: "Cần bạn",
  },
} as const;

export interface PainOutcomeItem {
  readonly id: "manual-time" | "missed-comments" | "wrong-data";
  readonly icon: "clock" | "messages" | "alert";
  readonly painTitle: string;
  readonly painDetail: string;
  readonly outcomeLabel: string;
  readonly outcomeDetail: string;
  readonly evidenceFootnote: string;
  /** Real file(s) in `evidence/` backing the statement and any cited numbers. */
  readonly evidenceSource: string;
}

export const PAIN_OUTCOME_SECTION = {
  id: "van-de-giai-quyet",
  heading: "Những điểm nghẽn thường gặp khi bán thời trang trên Facebook",
  supporting:
    "Ghi nhận từ phỏng vấn người bán hàng online và dữ liệu vận hành thực tế của shop.",
} as const;

export const PAIN_OUTCOME_ITEMS: readonly PainOutcomeItem[] = [
  {
    id: "manual-time",
    icon: "clock",
    painTitle: "Soạn từng bài tay mất nhiều thời gian",
    painDetail:
      "Tự nghĩ nội dung, chọn ảnh rồi lặp lại thao tác đăng từng bài khiến hàng mới dễ bị dồn lại. Phỏng vấn 3/3 người bán online đều gặp vướng mắc này (mất khoảng 15 phút mỗi bài ở nhóm tự đăng).",
    outcomeLabel: "Với VPOST",
    outcomeDetail:
      "Đọc trực tiếp danh sách sản phẩm từ bảng tính và soạn sẵn bài nháp theo lô để bạn rà nhanh rồi đăng lên nhiều Fanpage.",
    evidenceFootnote: "Nguồn: phỏng vấn người bán (evidence/interviews/, evidence/summary.md)",
    evidenceSource: "evidence/interviews/P1.md, evidence/summary.md",
  },
  {
    id: "missed-comments",
    icon: "messages",
    painTitle: "Bình luận hỏi giá, size, màu dễ trôi mất",
    painDetail:
      "Trong 4.671 bài vận hành thực tế đã rà soát, 0% bài AI cũ nêu giá hoặc size trong thân bài — khách phải bình luận hỏi lại và tin dễ bị sót khi nhiều Page cùng chạy.",
    outcomeLabel: "Với VPOST",
    outcomeDetail:
      "Gom bình luận về một hộp thư dạng chat và tự động trả lời đúng giá, size, màu còn hàng khi bạn bật cho từng Page.",
    evidenceFootnote: "Nguồn: phân tích dữ liệu vận hành (evidence/data-mining.md)",
    evidenceSource: "evidence/data-mining.md",
  },
  {
    id: "wrong-data",
    icon: "alert",
    painTitle: "Đăng nhầm mã, thiếu size hoặc lỗi bài đăng",
    painDetail:
      "Copy thủ công giữa bảng tính và Facebook dễ phát sinh sai sót — dữ liệu vận hành thực tế ghi nhận 20/4.650 bài lệch mã cuối bài và 62/4.671 bài đăng bị lỗi.",
    outcomeLabel: "Với VPOST",
    outcomeDetail:
      "Kiểm tồn kho trước khi soạn và trước khi đăng, khóa dữ kiện từ bảng tính và luôn dừng ở bước bạn duyệt trước khi bài lên.",
    evidenceFootnote:
      "Nguồn: phân tích dữ liệu vận hành (evidence/data-mining.md, evidence/summary.md)",
    evidenceSource: "evidence/data-mining.md, evidence/summary.md",
  },
] as const;

export interface FeatureItem {
  readonly id: "multi-page-compose" | "comment-inbox" | "auto-reply" | "writing-style";
  readonly icon: "layers" | "inbox" | "bot" | "pen";
  readonly title: string;
  readonly description: string;
  readonly detail: string;
}

export const FEATURES_SECTION = {
  id: "tinh-nang",
  heading: "Bốn tính năng trọng tâm cho công việc bán hàng hằng ngày",
  supporting:
    "Thiết kế xoay quanh hai việc lặp lại nhiều nhất của shop thời trang: lên bài đều cho các Fanpage và giữ nhịp trả lời bình luận khách.",
} as const;

export const FEATURE_ITEMS: readonly FeatureItem[] = [
  {
    id: "multi-page-compose",
    icon: "layers",
    title: "Soạn bài từ file sản phẩm cho nhiều Page",
    description:
      "Chọn mã sản phẩm từ bảng tính đã đồng bộ, gom ảnh đúng màu và tạo bài nháp cho từng Fanpage. Sản phẩm hết hàng được chặn sớm kèm lý do rõ ràng để không lọt bài sai.",
    detail: "Kiểm tồn kho trước khi soạn và trước khi đăng · Chống đăng trùng",
  },
  {
    id: "comment-inbox",
    icon: "inbox",
    title: "Hộp thư bình luận dạng chat và thông báo nổi",
    description:
      "Bình luận của khách trên nhiều bài và nhiều Page được gom thành từng hội thoại dạng chat quen thuộc. Khi có câu hỏi mới cần xử lý, thông báo nổi hiện ngay kèm nút mở thẳng tới luồng trò chuyện.",
    detail: "Trả lời, thích hoặc ẩn bình luận ngay tại một màn hình",
  },
  {
    id: "auto-reply",
    icon: "bot",
    title: "Tự trả lời giá, size, màu — câu khác gắn “Cần bạn”",
    description:
      "Khi bạn bật cho từng Fanpage, hệ thống tự trả lời câu hỏi về giá, size hoặc màu còn hàng bằng dữ liệu sản phẩm. Các câu hỏi về phí ship, đổi trả, khuyến mãi hay trường hợp thiếu thông tin đều gắn nhãn “Cần bạn”.",
    detail: "Mặc định tắt · Chạy thử kiểm tra trước khi bật chạy thật",
  },
  {
    id: "writing-style",
    icon: "pen",
    title: "Phong cách viết riêng của shop",
    description:
      "Cài đặt cách xưng hô, giọng điệu, cụm từ hay dùng và những từ cần tránh cho toàn shop hoặc riêng từng Fanpage. Bạn có thể xem trước bài mẫu ngay trước khi lưu áp dụng.",
    detail: "Giữ giọng văn nhất quán giữa các nhân viên soạn bài",
  },
] as const;

export interface HowItWorksStep {
  readonly id: "connect-pages" | "sync-catalog" | "draft-approve-publish";
  readonly stepCode: string;
  readonly icon: "link" | "sheet" | "check";
  readonly title: string;
  readonly description: string;
}

export const HOW_IT_WORKS_SECTION = {
  id: "cach-hoat-dong",
  heading: "Cách hoạt động gọn trong ba bước",
  supporting:
    "VPOST bám theo bảng tính và thư mục ảnh sẵn có của shop, không buộc bạn đổi cách lưu dữ liệu đang quen tay.",
} as const;

export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    id: "connect-pages",
    stepCode: "01",
    icon: "link",
    title: "Kết nối Page bằng Facebook",
    description:
      "Đăng nhập và chọn những Fanpage bán hàng bạn muốn đưa vào chung một không gian làm việc của shop.",
  },
  {
    id: "sync-catalog",
    stepCode: "02",
    icon: "sheet",
    title: "Đồng bộ file sản phẩm",
    description:
      "Kết nối bảng tính sản phẩm và thư mục ảnh để VPOST đọc đúng mã hàng, giá bán, size, màu và tình trạng tồn kho.",
  },
  {
    id: "draft-approve-publish",
    stepCode: "03",
    icon: "check",
    title: "AI soạn, bạn duyệt và đăng",
    description:
      "Hệ thống tạo bài nháp đúng phong cách shop và khớp dữ kiện sản phẩm. Bạn kiểm tra lại, sửa nếu cần rồi duyệt đăng.",
  },
] as const;

export interface SafetyItem {
  readonly id: "grounded-facts" | "template-auto-reply" | "human-approval" | "audit-and-kill-switch";
  readonly icon: "database" | "lock" | "user-check" | "history";
  readonly title: string;
  readonly description: string;
}

export const SAFETY_SECTION = {
  id: "an-toan",
  heading: "An toàn cho Fanpage và dữ liệu bán hàng",
  supporting:
    "Không đăng sai còn hơn đăng nhanh: mọi dữ kiện công khai đều được kiểm đối chiếu trước khi ra ngoài.",
  calloutBadge: "Mặc định tắt tự động trả lời",
  calloutTitle: "Bạn luôn giữ quyền bật, thử trước và tắt theo từng Page",
  calloutBody:
    "Khi mới kết nối Fanpage, tính năng tự động trả lời luôn ở trạng thái tắt. Bạn có thể chạy thử để xem trước câu hệ thống sẽ trả lời rồi mới xác nhận bật chạy thật.",
} as const;

export const SAFETY_ITEMS: readonly SafetyItem[] = [
  {
    id: "grounded-facts",
    icon: "database",
    title: "AI chỉ dùng dữ kiện trong file sản phẩm",
    description:
      "Giá bán, size, màu và tồn kho được đọc trực tiếp từ file sản phẩm của shop. Cảnh báo nội bộ và ghi chú sản xuất không được đưa vào nội dung công khai.",
  },
  {
    id: "template-auto-reply",
    icon: "lock",
    title: "Câu tự trả lời ghép từ dữ liệu, không do AI tự viết",
    description:
      "Khi khách hỏi giá, size hoặc màu, câu trả lời được ghép trực tiếp từ dữ liệu sản phẩm gắn với bài viết thay vì để AI tự sáng tác câu chữ.",
  },
  {
    id: "human-approval",
    icon: "user-check",
    title: "Mọi bài đăng và trả lời khác đều cần người duyệt",
    description:
      "AI chỉ dừng ở bản nháp chờ bạn xem và duyệt đăng. Những bình luận ngoài phạm vi giá, size, màu hoặc thiếu dữ liệu luôn gắn nhãn “Cần bạn”.",
  },
  {
    id: "audit-and-kill-switch",
    icon: "history",
    title: "Có nhật ký đầy đủ và nút tắt bất cứ lúc nào",
    description:
      "Từng lượt đăng bài và từng câu tự động trả lời đều lưu nhật ký kèm trạng thái và lý do. Bạn có thể tắt ngay cho từng Page khi cần kiểm soát thủ công.",
  },
] as const;

export const FINAL_CTA_COPY = {
  heading: "Sẵn sàng gom việc đăng bài và trả lời bình luận về một chỗ",
  supporting:
    "Đăng nhập để kết nối Fanpage, đồng bộ file sản phẩm và kiểm tra luồng soạn bài có người duyệt ngay hôm nay.",
} as const;

export const FOOTER_COPY = {
  copyright: "© VPOST",
  signInLabel: "Đăng nhập",
  signInHref: "/signin",
} as const;

export interface ClaimAuditEntry {
  readonly path: string;
  readonly text: string;
  readonly evidenceSource?: string;
}

/**
 * Flattens all public marketing claims so unit tests can assert:
 *   - zero forbidden hype words across the page;
 *   - zero digits in claims unless explicitly paired with a real `evidence/` source.
 */
export function getAllClaimEntries(): readonly ClaimAuditEntry[] {
  const entries: ClaimAuditEntry[] = [
    { path: "metadata.title", text: LANDING_METADATA.title },
    { path: "metadata.description", text: LANDING_METADATA.description },
    { path: "hero.audienceBadge", text: HERO_COPY.audienceBadge },
    { path: "hero.headline", text: HERO_COPY.headline },
    { path: "hero.supporting", text: HERO_COPY.supporting },
    { path: "hero.reassurance", text: HERO_COPY.reassurance },
    { path: "painOutcome.heading", text: PAIN_OUTCOME_SECTION.heading },
    { path: "painOutcome.supporting", text: PAIN_OUTCOME_SECTION.supporting },
    ...PAIN_OUTCOME_ITEMS.flatMap((item) => [
      {
        path: `painOutcome.${item.id}.painTitle`,
        text: item.painTitle,
        evidenceSource: item.evidenceSource,
      },
      {
        path: `painOutcome.${item.id}.painDetail`,
        text: item.painDetail,
        evidenceSource: item.evidenceSource,
      },
      {
        path: `painOutcome.${item.id}.outcomeDetail`,
        text: item.outcomeDetail,
        evidenceSource: item.evidenceSource,
      },
      {
        path: `painOutcome.${item.id}.evidenceFootnote`,
        text: item.evidenceFootnote,
        evidenceSource: item.evidenceSource,
      },
    ]),
    { path: "features.heading", text: FEATURES_SECTION.heading },
    { path: "features.supporting", text: FEATURES_SECTION.supporting },
    ...FEATURE_ITEMS.flatMap((item) => [
      { path: `features.${item.id}.title`, text: item.title },
      { path: `features.${item.id}.description`, text: item.description },
      { path: `features.${item.id}.detail`, text: item.detail },
    ]),
    { path: "howItWorks.heading", text: HOW_IT_WORKS_SECTION.heading },
    { path: "howItWorks.supporting", text: HOW_IT_WORKS_SECTION.supporting },
    ...HOW_IT_WORKS_STEPS.flatMap((step) => [
      { path: `howItWorks.${step.id}.title`, text: step.title },
      { path: `howItWorks.${step.id}.description`, text: step.description },
    ]),
    { path: "safety.heading", text: SAFETY_SECTION.heading },
    { path: "safety.supporting", text: SAFETY_SECTION.supporting },
    { path: "safety.calloutBadge", text: SAFETY_SECTION.calloutBadge },
    { path: "safety.calloutTitle", text: SAFETY_SECTION.calloutTitle },
    { path: "safety.calloutBody", text: SAFETY_SECTION.calloutBody },
    ...SAFETY_ITEMS.flatMap((item) => [
      { path: `safety.${item.id}.title`, text: item.title },
      { path: `safety.${item.id}.description`, text: item.description },
    ]),
    { path: "finalCta.heading", text: FINAL_CTA_COPY.heading },
    { path: "finalCta.supporting", text: FINAL_CTA_COPY.supporting },
  ];

  return entries;
}
