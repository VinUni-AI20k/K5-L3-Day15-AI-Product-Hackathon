"""Công cụ của bài toán — NHÓM VIẾT. Điền ở guide bước 2.2 (thiết kế) và 3.2 (code).

Mỗi công cụ là một hàm Python có @tool. Docstring ghi đúng 4 ý như sơ đồ ở spec.md §4:
    tên · input · output · có tác động ra ngoài không (gửi tin, sửa dữ liệu, chấm điểm…)
Khung tự ghi mỗi lần gọi công cụ vào trace (tên, input, output rút gọn, thời gian, lỗi).

Lát cắt của nhóm: giáo viên mô tả game → AI viết một file trình chơi HTML → người duyệt. Luật kiểm của AI Lab (hợp đồng
khối jl-camera + quét cờ cảnh báo) nằm ở ailab/contract.py; công cụ dưới đây gọi lại đúng luật đó, không chép lại.
Công cụ có tác động ra ngoài: KHÔNG tự làm. Ở đây không có công cụ nào lưu, gửi hay chấm điểm: lưu game là việc của
người dùng bấm Chấp nhận trong AI Lab (ailab/server.py), rồi Admin duyệt.
"""
import os
import sys

from tracing import tool, TOOLS  # noqa: F401  (TOOLS: danh sách công cụ đã đăng ký, dùng khi viết vòng lặp agent)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ailab"))
import contract  # noqa: E402  (ailab/contract.py)


@tool
def check_game(html: str) -> dict:
    """check_game — kiểm một file trình chơi HTML do AI viết.
    Input: html (str), toàn bộ file. Output: {"ok": bool, "error": str hoặc None, "name": str, "flags": [{"code","label","reason","line","excerpt"}]}.
    ok=False khi vi phạm hợp đồng (thiếu hoặc sai khối jl-camera, quá 2 MB…); flags là câu hỏi cho người duyệt, không phải lời từ chối.
    Không tác động ra ngoài: chỉ đọc, không lưu gì."""
    manifest, err = contract.parse(html or "")
    if err:
        return {"ok": False, "error": err[1], "name": "", "flags": []}
    return {"ok": True, "error": None, "name": manifest["name"], "flags": contract.scan(html)}
