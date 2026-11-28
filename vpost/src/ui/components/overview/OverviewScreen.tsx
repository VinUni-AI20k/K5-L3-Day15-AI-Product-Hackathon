"use client";

import { Button as AstryxButton, Dialog, DialogHeader, Heading } from "@astryxdesign/core";
import {
  Activity,
  ArrowRight,
  Calendar,
  Check,
  Circle,
  Clock,
  Flame,
  Heart,
  HelpCircle,
  ImageIcon,
  Layers,
  Link2,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PenLine,
  Plus,
  Star,
  Sun,
  Sunrise,
  Target,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useChannels } from "@/ui/hooks/useChannels";
import { useMe } from "@/ui/hooks/useMe";
import { usePostJobLog } from "@/ui/hooks/usePostJobs";
import { useScheduledJobs } from "@/ui/hooks/useScheduledJobs";
import { accountDisplayName } from "@/ui/schemas/me.schema";
import type { JobLogFilter } from "@/ui/schemas/post-batch.schema";
import type { ScheduledFilter } from "@/ui/schemas/scheduled.schema";

const ALL_SCHEDULED: ScheduledFilter = { channelId: null, from: null, to: null };
const ALL_JOBS: JobLogFilter = { status: null, batchId: null };

const POST_TEMPLATES = [
  {
    id: "step-by-step",
    icon: Layers,
    title: "Phân tích từng bước chi tiết",
    description:
      "Chia nhỏ một chủ đề hoặc tính năng sản phẩm thành các bước rõ ràng, dễ theo dõi.",
  },
  {
    id: "honest-review",
    icon: Star,
    title: "Đánh giá chân thực về sản phẩm",
    description:
      "Chia sẻ trải nghiệm thực tế về sản phẩm/công cụ — ưu điểm, nhược điểm và đối tượng phù hợp.",
  },
  {
    id: "time-saving",
    icon: Clock,
    title: "Hệ thống tiết kiệm thời gian",
    description:
      "Chia sẻ quy trình tự động hóa giúp bạn tối ưu thời gian và vận hành bán hàng mượt mà hơn.",
  },
  {
    id: "retention-tips",
    icon: Heart,
    title: "3 mẹo giữ chân khách hàng",
    description:
      "Mẹo nhanh và thực tế giúp bạn duy trì tương tác và chăm sóc khách hàng mùa cao điểm.",
  },
] as const;

export function OverviewScreen() {
  const me = useMe();
  const channels = useChannels();
  const scheduled = useScheduledJobs(ALL_SCHEDULED);
  const jobs = usePostJobLog(ALL_JOBS);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackGoal, setFeedbackGoal] = useState("");
  const [feedbackObstacle, setFeedbackObstacle] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const displayName = accountDisplayName(me.data, "bạn");

  const timePeriod = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "morning" as const;
    if (hour < 18) return "afternoon" as const;
    return "evening" as const;
  }, []);

  const greetingText =
    timePeriod === "morning"
      ? "Chào buổi sáng"
      : timePeriod === "afternoon"
        ? "Chào buổi chiều"
        : "Chào buổi tối";

  const GreetingIcon =
    timePeriod === "morning" ? Sunrise : timePeriod === "afternoon" ? Sun : Moon;

  const formattedDate = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("vi-VN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, []);

  const connectedChannelsCount = channels.data?.channels.length ?? 0;
  const isChannelConnected = connectedChannelsCount > 0;

  const scheduledCount = scheduled.data?.pages[0]?.items.length ?? 0;
  const hasScheduledPosts = scheduledCount > 0;

  const totalJobsCount = jobs.data?.pages[0]?.items.length ?? 0;
  const hasCreatedPosts = totalJobsCount > 0;

  const isFeedbackIncomplete = !feedbackGoal.trim() || !feedbackObstacle.trim();

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFeedbackIncomplete) return;
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setIsFeedbackOpen(false);
      setFeedbackGoal("");
      setFeedbackObstacle("");
    }, 1500);
  };

  const statItems = [
    {
      label: "Chuỗi tuần",
      value: 0,
      caption: "Tuần liên tiếp duy trì lịch đăng",
      icon: Flame,
    },
    {
      label: "Mục tiêu đăng",
      value: 0,
      caption: "Bài đăng đạt chỉ tiêu trong tuần",
      icon: Target,
    },
    {
      label: "Điểm tương tác",
      value: 0,
      caption: "Tự động cập nhật sau khi có kênh",
      icon: Activity,
    },
  ] as const;

  const onboardingSteps = [
    {
      id: "channels",
      title: "1. Kết nối kênh",
      description: "Kết nối các trang Facebook và TikTok để bắt đầu đăng bài tự động.",
      done: isChannelConnected,
      href: "/channels",
      actionLabel: "Kết nối kênh",
      icon: Plus,
    },
    {
      id: "compose",
      title: "2. Soạn bài viết",
      description: "Lên lịch bài viết đầu tiên của bạn chỉ với vài thao tác.",
      done: hasCreatedPosts || hasScheduledPosts,
      href: "/compose",
      actionLabel: "Soạn bài viết",
      icon: PenLine,
    },
    {
      id: "members",
      title: "3. Làm việc nhóm?",
      description: "Mời đội ngũ cùng tham gia quản lý và phân quyền đăng bài.",
      done: false,
      href: "/members",
      actionLabel: "Mời thành viên",
      icon: UserPlus,
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 pt-6 pb-20 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-xl"
          >
            <GreetingIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <Heading level={1}>
              {greetingText}, {displayName}!
            </Heading>
            <p className="text-foreground-subtle text-sm capitalize">{formattedDate}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Gửi phản hồi"
            onClick={() => setIsFeedbackOpen(true)}
            className="border-border bg-card text-foreground hover:bg-sidebar active:bg-muted focus-visible:ring-ring inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
          >
            <MessageSquarePlus className="text-muted-foreground size-4" aria-hidden="true" />
            <span>Gửi phản hồi</span>
          </button>

          <Link
            href="/compose"
            className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 focus-visible:ring-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
          >
            <PenLine className="size-4" aria-hidden="true" />
            <span>Soạn bài viết</span>
          </Link>
        </div>
      </header>

      <section
        aria-label="Tổng quan hoạt động"
        className="border-border bg-card overflow-hidden rounded-xl border"
      >
        <div className="divide-border grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {statItems.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex flex-col gap-1.5 p-5 sm:p-6">
                <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                  <Icon className="text-foreground-subtle size-4 shrink-0" aria-hidden="true" />
                  <span>{stat.label}</span>
                </div>
                <p className="text-foreground text-2xl font-semibold tabular-nums">{stat.value}</p>
                <p className="text-foreground-subtle text-xs">{stat.caption}</p>
              </div>
            );
          })}
        </div>

        <div className="border-border bg-sidebar flex items-start gap-2.5 border-t px-5 py-3.5 text-sm sm:items-center sm:px-6">
          <Link2 className="text-accent-foreground mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden="true" />
          <p className="text-muted-foreground">
            <Link
              href="/channels"
              className="text-accent-foreground focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Kết nối kênh
            </Link>{" "}
            để bắt đầu theo dõi chuỗi đăng bài, thiết lập mục tiêu và nhiều tính năng khác.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Các bước đầu tiên</Heading>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {onboardingSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className="border-border bg-card hover:border-input flex flex-col justify-between gap-5 rounded-xl border p-5 sm:p-6 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-foreground text-base font-semibold">{step.title}</h3>
                    {step.done ? (
                      <span className="border-success/30 bg-success/15 text-success-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                        <Check className="size-3.5" aria-hidden="true" />
                        Đã xong
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <Circle className="size-3" aria-hidden="true" />
                        Chưa làm
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>

                <div>
                  <Link
                    href={step.href}
                    className="bg-secondary text-secondary-foreground hover:bg-muted/80 active:bg-muted focus-visible:ring-ring inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{step.actionLabel}</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Heading level={2}>Sắp đăng</Heading>
            {hasScheduledPosts ? (
              <Link
                href="/posts?tab=scheduled"
                className="text-accent-foreground focus-visible:ring-ring inline-flex min-h-10 items-center rounded-sm px-1 text-sm font-medium underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                Xem tất cả ({scheduledCount})
              </Link>
            ) : null}
          </div>

          <div className="border-border bg-card flex min-h-56 flex-col items-center justify-center rounded-xl border p-6 text-center">
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-xl"
            >
              <Calendar className="size-5" aria-hidden="true" />
            </span>
            <h3 className="text-foreground mt-4 text-base font-semibold">
              {hasScheduledPosts
                ? `${scheduledCount} bài viết đã được lên lịch`
                : "Chưa có bài viết nào được lên lịch."}
            </h3>
            <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
              {hasScheduledPosts
                ? "Bài viết sẽ tự động xuất bản theo đúng lịch hẹn."
                : "Các bài viết chờ xuất bản sẽ xuất hiện tại đây."}
            </p>
            <Link
              href={hasScheduledPosts ? "/posts?tab=scheduled" : "/compose"}
              className="bg-secondary text-secondary-foreground hover:bg-muted/80 active:bg-muted focus-visible:ring-ring mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
              <span>{hasScheduledPosts ? "Xem lịch đăng" : "Lên lịch bài viết"}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <Heading level={2}>Bình luận</Heading>

          <div className="border-border bg-card flex min-h-56 flex-col items-center justify-center rounded-xl border p-6 text-center">
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-xl"
            >
              <MessageSquare className="size-5" aria-hidden="true" />
            </span>
            <h3 className="text-foreground mt-4 text-base font-semibold">
              Chưa có bình luận nào.
            </h3>
            <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
              Các phản hồi và bình luận mới nhất sẽ hiển thị tại đây.
            </p>
            <Link
              href="/comments"
              className="bg-secondary text-secondary-foreground hover:bg-muted/80 active:bg-muted focus-visible:ring-ring mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
              <span>Mở hộp bình luận</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <Heading level={2}>Mẫu bài viết gợi ý</Heading>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POST_TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
              <Link
                key={template.id}
                href="/compose"
                className="border-border bg-card hover:border-input hover:bg-sidebar active:bg-muted focus-visible:ring-ring group flex flex-col justify-between gap-3 rounded-xl border p-5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
              >
                <div className="space-y-3">
                  <span
                    aria-hidden="true"
                    className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg"
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-foreground group-hover:text-accent-foreground text-base font-semibold motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out">
                    {template.title}
                  </h3>
                  <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                    {template.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <aside aria-label="Trợ giúp" className="fixed right-4 bottom-4 z-30 sm:right-6 sm:bottom-6">
        <Link
          href="/support"
          className="border-border bg-card text-foreground hover:bg-sidebar active:bg-muted focus-visible:ring-ring flex size-11 items-center justify-center rounded-full border shadow-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
        >
          <HelpCircle className="size-5" aria-hidden="true" />
          <span className="sr-only">Trợ giúp</span>
        </Link>
      </aside>

      <Dialog
        isOpen={isFeedbackOpen}
        onOpenChange={setIsFeedbackOpen}
        purpose="form"
        width={480}
      >
        <DialogHeader
          title="Điều gì có thể giúp VPOST phục vụ bạn tốt hơn?"
          onOpenChange={setIsFeedbackOpen}
        />

        <div className="px-6 pb-6">
          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
              <span
                aria-hidden="true"
                className="bg-success/15 text-success-foreground flex size-12 items-center justify-center rounded-full"
              >
                <Check className="size-6" aria-hidden="true" />
              </span>
              <h3 className="text-foreground text-lg font-semibold">
                Cảm ơn bạn đã đóng góp ý kiến!
              </h3>
              <p className="text-muted-foreground text-sm">
                Phản hồi của bạn đã được ghi nhận để cải thiện VPOST.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Gặp sự cố hoặc cần hỗ trợ?{" "}
                <Link
                  href="/support"
                  className="text-accent-foreground focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  Liên hệ hỗ trợ
                </Link>
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <label htmlFor="feedback-goal" className="text-foreground font-medium">
                    Bạn đang cố gắng thực hiện điều gì?
                  </label>
                  <span className="text-foreground-subtle text-xs">Bắt buộc</span>
                </div>
                <textarea
                  id="feedback-goal"
                  required
                  maxLength={300}
                  rows={3}
                  value={feedbackGoal}
                  onChange={(e) => setFeedbackGoal(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-ring w-full resize-none rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                />
                <div className="text-foreground-subtle text-right text-xs tabular-nums">
                  {feedbackGoal.length}/300
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <label htmlFor="feedback-obstacle" className="text-foreground font-medium">
                    Khó khăn bạn gặp phải là gì, và điều gì có thể giúp ích?
                  </label>
                  <span className="text-foreground-subtle text-xs">Bắt buộc</span>
                </div>
                <textarea
                  id="feedback-obstacle"
                  required
                  maxLength={300}
                  rows={3}
                  value={feedbackObstacle}
                  onChange={(e) => setFeedbackObstacle(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-ring w-full resize-none rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                />
                <div className="text-foreground-subtle text-right text-xs tabular-nums">
                  {feedbackObstacle.length}/300
                </div>
              </div>

              <div className="border-border bg-sidebar text-muted-foreground hover:border-input flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm transition-colors duration-150 ease-out">
                <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  Kéo thả hoặc{" "}
                  <span className="text-accent-foreground font-medium underline underline-offset-2">
                    tải tệp lên
                  </span>
                </span>
              </div>

              {isFeedbackIncomplete ? (
                <p className="text-foreground-subtle text-xs">
                  Điền đầy đủ cả hai mục bắt buộc ở trên để bật nút gửi phản hồi.
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <AstryxButton
                  type="button"
                  variant="ghost"
                  label="Đóng"
                  onClick={() => setIsFeedbackOpen(false)}
                />
                <AstryxButton
                  type="submit"
                  variant="primary"
                  label="Gửi phản hồi"
                  isDisabled={isFeedbackIncomplete}
                />
              </div>
            </form>
          )}
        </div>
      </Dialog>
    </div>
  );
}
