
class AppException(Exception):
    """Base exception cho toàn bộ app"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, resource: str):
        super().__init__(f"{resource} không tìm thấy", status_code=404)


class UnauthorizedException(AppException):
    def __init__(self):
        super().__init__("Không có quyền truy cập", status_code=401)


class ValidationException(AppException):
    def __init__(self, message: str):
        super().__init__(message, status_code=422)


class LLMUnavailableException(AppException):
    def __init__(self):
        super().__init__(
            message="Dịch vụ AI đang quá tải, vui lòng thử lại sau vài phút.",
            status_code=503,
        )
