import {
  Button,
  Card,
  Divider,
  Heading,
  Stack,
  StatusDot,
  Text,
} from "@astryxdesign/core";

import { cn } from "@/shared/utils";
import { Badge } from "@/ui/components/ui/badge";
import type { OperatorWaitingProps } from "./first-run.types";

export function OperatorWaitingCard({
  tenantName,
  role,
  signals,
  isReady,
  onCompose,
  onRefresh,
  isRefreshing,
}: OperatorWaitingProps) {
  const isEditor = role === "editor";
  const isViewer = role === "viewer";

  return (
    <Card padding={5} className="border-border bg-card rounded-xl">
      <Stack direction="vertical" gap={4}>
        {/* Header khối chờ */}
        <Stack direction="vertical" gap={1.5}>
          <Stack direction="horizontal" gap={2} align="center" justify="between" wrap="wrap">
            <p className="text-foreground-subtle text-sm font-medium">Không gian làm việc</p>
            <Badge tone={isEditor ? "info" : "neutral"}>
              {isEditor ? "Biên tập viên (editor)" : "Chỉ xem (viewer)"}
            </Badge>
          </Stack>

          <Heading level={2} className="text-foreground text-lg font-semibold">
            {isReady
              ? `Xưởng ${tenantName} đã sẵn sàng làm việc`
              : `Xưởng ${tenantName} đang trong quá trình chuẩn bị`}
          </Heading>

          <Text type="supporting" className="text-muted-foreground text-sm leading-relaxed">
            {isEditor
              ? isReady
                ? "Quản trị viên đã kết nối dữ liệu kho hàng và trang Fanpage. Bạn có thể bắt đầu soạn bài và tạo nội dung ngay bây giờ."
                : "Bạn tham gia với vai trò Biên tập viên. Hệ thống đang chờ Quản trị viên (Chủ shop) kết nối nguồn ảnh Drive và Fanpage bán hàng."
              : "Bạn tham gia với vai trò Người xem (chỉ đọc). Bạn có thể theo dõi tiến độ cấu hình và số liệu hoạt động của xưởng."}
          </Text>
        </Stack>

        <Divider orientation="horizontal" />

        {/* Danh sách 3 tín hiệu trạng thái thời gian thực */}
        <Stack direction="vertical" gap={2}>
          <h3 className="text-foreground text-sm font-semibold">
            Trạng thái hệ thống hiện tại
          </h3>

          <Stack direction="vertical" gap={2}>
            {signals.map((signal, index) => {
              const isSignalReady = signal.state === "ready";

              return (
                <div
                  key={index}
                  data-slot="signal-row"
                  className={cn(
                    "flex flex-col justify-between gap-2 rounded-xl border p-4 sm:flex-row sm:items-center",
                    isSignalReady
                      ? "border-success/30 bg-success/10 text-foreground"
                      : "border-warning/30 bg-warning/10 text-foreground",
                  )}
                >
                  <Stack direction="horizontal" gap={2} align="center">
                    <StatusDot
                      variant={isSignalReady ? "success" : "warning"}
                      label={isSignalReady ? "Đã sẵn sàng" : "Đang chờ admin"}
                      isPulsing={!isSignalReady}
                    />
                    <Text weight="medium" className="text-foreground text-sm">
                      {signal.label}
                    </Text>
                  </Stack>

                  <Stack direction="horizontal" gap={2} align="center">
                    {signal.detail ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {signal.detail}
                      </span>
                    ) : null}

                    <Badge tone={isSignalReady ? "success" : "warning"}>
                      {isSignalReady ? "Sẵn sàng" : "Đang chờ"}
                    </Badge>
                  </Stack>
                </div>
              );
            })}
          </Stack>
        </Stack>

        <Divider orientation="horizontal" />

        {/* Hành động dưới cùng */}
        <Stack direction="horizontal" gap={2} align="center" justify="between" wrap="wrap">
          {/* Nút làm mới trạng thái (dùng chung cho cả editor và viewer) */}
          <Button
            variant="secondary"
            label={isRefreshing ? "Đang kiểm tra..." : "Kiểm tra lại trạng thái"}
            isLoading={isRefreshing}
            onClick={onRefresh}
          />

          {/* Nếu đã sẵn sàng: Editor có nút soạn bài, Viewer tuyệt đối KHÔNG có nút soạn bài */}
          {isReady && isEditor && onCompose ? (
            <Button
              variant="primary"
              label="Bắt đầu soạn bài ngay →"
              onClick={onCompose}
            />
          ) : isReady && isViewer ? (
            <Text type="supporting" className="text-muted-foreground text-xs">
              Tài khoản chỉ xem — không có quyền đăng bài
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  );
}
