import {
  CUSTOMER_TAGS_MAX_PER_CUSTOMER,
  CustomerDetailResponseSchema,
  CustomerNoteMutationResponseSchema,
  CustomerTagColorSchema,
  CustomerTagDeleteResponseSchema,
  CustomerTagListResponseSchema,
  CustomerTagMutationResponseSchema,
  CustomerTagsUpdateResponseSchema,
  validateCustomerNoteText,
  validateCustomerTagName,
  type CustomerDetailResponse,
  type CustomerNoteMutationResponse,
  type CustomerTagColor,
  type CustomerTagDeleteResponse,
  type CustomerTagListResponse,
  type CustomerTagMutationResponse,
  type CustomerTagsUpdateResponse,
} from "@/ui/schemas/customer.schema";

import { ApiError } from "./api-error";
import { apiRequest } from "./http-client";

/**
 * Data layer for `/api/customers/*` and `/api/customer-tags*`.
 * Every response is parsed with zod via `apiRequest`.
 */

function requireNonEmptyId(raw: string, caller: string, userMessage: string): string {
  const id = raw.trim();
  if (id.length === 0) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `${caller} requires a non-empty id`,
      userMessage,
    });
  }
  return id;
}

export async function getCustomer(
  fromId: string,
  signal?: AbortSignal,
): Promise<CustomerDetailResponse> {
  const id = requireNonEmptyId(fromId, "getCustomer", "Thiếu mã khách hàng.");
  return apiRequest(`/api/customers/${encodeURIComponent(id)}`, {
    schema: CustomerDetailResponseSchema,
    signal,
    malformedMessage:
      "Dữ liệu hồ sơ khách hàng không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

export async function saveCustomerNote(
  params: { fromId: string; text: string },
  signal?: AbortSignal,
): Promise<CustomerNoteMutationResponse> {
  const id = requireNonEmptyId(params.fromId, "saveCustomerNote", "Thiếu mã khách hàng.");
  const check = validateCustomerNoteText(params.text);
  if (!check.ok) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `saveCustomerNote invalid text: ${check.error}`,
      userMessage: check.error,
    });
  }

  return apiRequest(`/api/customers/${encodeURIComponent(id)}/note`, {
    method: "PUT",
    body: { text: check.value },
    schema: CustomerNoteMutationResponseSchema,
    signal,
    malformedMessage:
      "Kết quả lưu ghi chú khách hàng không đúng định dạng. Hãy tải lại để kiểm tra.",
  });
}

export async function listCustomerTags(
  signal?: AbortSignal,
): Promise<CustomerTagListResponse> {
  return apiRequest("/api/customer-tags", {
    schema: CustomerTagListResponseSchema,
    signal,
    malformedMessage:
      "Danh sách nhãn khách hàng không đúng định dạng. Hãy báo quản trị viên kiểm tra máy chủ.",
  });
}

export async function createCustomerTag(
  params: { name: string; color: CustomerTagColor },
  signal?: AbortSignal,
): Promise<CustomerTagMutationResponse> {
  const nameCheck = validateCustomerTagName(params.name);
  if (!nameCheck.ok) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `createCustomerTag invalid name: ${nameCheck.error}`,
      userMessage: nameCheck.error,
    });
  }

  const colorCheck = CustomerTagColorSchema.safeParse(params.color);
  if (!colorCheck.success) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: "createCustomerTag invalid color",
      userMessage: "Màu nhãn không hợp lệ.",
    });
  }

  return apiRequest("/api/customer-tags", {
    method: "POST",
    body: { name: nameCheck.value, color: colorCheck.data },
    schema: CustomerTagMutationResponseSchema,
    signal,
    malformedMessage:
      "Kết quả tạo nhãn khách hàng không đúng định dạng. Hãy tải lại để kiểm tra.",
  });
}

export async function deleteCustomerTag(
  tagId: string,
  signal?: AbortSignal,
): Promise<CustomerTagDeleteResponse> {
  const id = requireNonEmptyId(tagId, "deleteCustomerTag", "Thiếu mã nhãn khách hàng.");
  return apiRequest(`/api/customer-tags/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: CustomerTagDeleteResponseSchema,
    signal,
    malformedMessage:
      "Kết quả xoá nhãn khách hàng không đúng định dạng. Hãy tải lại để kiểm tra.",
  });
}

export async function setCustomerTags(
  params: { fromId: string; tagIds: readonly string[] },
  signal?: AbortSignal,
): Promise<CustomerTagsUpdateResponse> {
  const id = requireNonEmptyId(params.fromId, "setCustomerTags", "Thiếu mã khách hàng.");
  const uniqueIds = Array.from(
    new Set(params.tagIds.map((tagId) => tagId.trim()).filter((tagId) => tagId.length > 0)),
  );
  if (uniqueIds.length > CUSTOMER_TAGS_MAX_PER_CUSTOMER) {
    throw new ApiError({
      code: "INVALID_INPUT",
      status: 0,
      message: `setCustomerTags exceeds ${CUSTOMER_TAGS_MAX_PER_CUSTOMER} tags`,
      userMessage: `Mỗi khách hàng chỉ gắn tối đa ${CUSTOMER_TAGS_MAX_PER_CUSTOMER} nhãn.`,
    });
  }

  return apiRequest(`/api/customers/${encodeURIComponent(id)}/tags`, {
    method: "PUT",
    body: { tagIds: uniqueIds },
    schema: CustomerTagsUpdateResponseSchema,
    signal,
    malformedMessage:
      "Kết quả cập nhật nhãn khách hàng không đúng định dạng. Hãy tải lại để kiểm tra.",
  });
}
