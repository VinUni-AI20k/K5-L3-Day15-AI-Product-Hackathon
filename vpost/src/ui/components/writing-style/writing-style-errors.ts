import {
  presentApiError,
  toApiError,
  type ApiErrorKind,
  type ApiErrorView,
} from "@/ui/components/feedback/present-api-error";
import type { ApiError } from "@/ui/services/api-error";

/**
 * Local error classification for "Phong cách viết", extending shared
 * `presentApiError` without modifying `feedback/*`.
 */

export type WritingStyleErrorContext = "load" | "save" | "delete" | "preview";
export type WritingStyleErrorKind = ApiErrorKind | "rate-limit" | "not-found";

export interface WritingStyleErrorView extends Omit<ApiErrorView, "kind"> {
  readonly kind: WritingStyleErrorKind;
  readonly isRateLimited: boolean;
  readonly apiError: ApiError;
}

export function isWritingStyleRateLimitError(error: ApiError): boolean {
  return error.status === 429 || error.code === "RATE_LIMITED";
}

export function presentWritingStyleError(
  error: unknown,
  context: WritingStyleErrorContext,
): WritingStyleErrorView {
  const apiError = toApiError(error);

  if (isWritingStyleRateLimitError(apiError)) {
    return {
      kind: "rate-limit",
      title: "Bạn đã viết thử quá giới hạn 10 lần/phút",
      description:
        apiError.userMessage ||
        "Mỗi công ty chỉ được viết thử tối đa 10 lần trong 1 phút. Vui lòng đợi một lát rồi thử lại.",
      hint: "Nội dung bạn đang nhập trong biểu mẫu vẫn được giữ nguyên — hãy chờ khoảng 1 phút rồi bấm “Viết thử” lại.",
      canRetry: true,
      isRateLimited: true,
      apiError,
    };
  }

  if (apiError.status === 404 && context !== "preview") {
    return {
      kind: "not-found",
      title: "Không tìm thấy Page này",
      description:
        apiError.userMessage ||
        "Page có thể đã bị gỡ khỏi danh sách kênh hoặc không thuộc công ty đang chọn.",
      hint: "Chọn “Mặc định công ty” hoặc tải lại danh sách Page.",
      canRetry: false,
      isRateLimited: false,
      apiError,
    };
  }

  if (apiError.code === "INVALID_INPUT") {
    return {
      kind: "input",
      title:
        context === "preview"
          ? "Chưa thể viết thử vì có trường chưa hợp lệ"
          : "Một số trường chưa hợp lệ",
      description:
        apiError.userMessage ||
        "Kiểm tra lại các mục đang báo đỏ trong biểu mẫu rồi thao tác lại.",
      canRetry: false,
      isRateLimited: false,
      apiError,
    };
  }

  const shared = presentApiError(apiError);
  return {
    ...shared,
    isRateLimited: false,
    apiError,
  };
}
