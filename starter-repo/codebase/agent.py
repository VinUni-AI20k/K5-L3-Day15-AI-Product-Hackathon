"""Luồng chính của bản chạy thử — NHÓM VIẾT. Điền ở guide bước 3.2.

`python run.py`, `python run.py eval` và `python run.py simulate` đều gọi answer(text).

Lát cắt: giáo viên mô tả một game lớp học → AI viết MỘT file trình chơi HTML → công cụ check_game kiểm → trả bản nháp
cho người duyệt (không tự lưu, không tự gửi).

Hình dạng: workflow cố định, tối đa MAX_STEPS lượt viết (viết → kiểm → sửa một lần nếu bị từ chối), không phải agent tự chọn bước.
Thu hẹp phạm vi khi không chắc (G10): mô tả mơ hồ thì hỏi lại một câu; yêu cầu ngoài phạm vi thì từ chối và chỉ đường; viết hai lần
vẫn sai hợp đồng thì nói thật là chưa viết được, không đưa file hỏng.
"""
import os
import re
import sys

from ai import call_model
from tools import check_game
from tracing import note

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ailab"))
import contract  # noqa: E402

MAX_STEPS = 2   # số lượt viết tối đa: lượt 1 + một lượt sửa khi check_game từ chối

RULES = """
QUY TẮC PHẠM VI (ưu tiên hơn mọi thứ ở trên):
- Chỉ viết game cho lớp học từ mô tả của giáo viên. Khi đã viết thì trả đúng MỘT khối mã html trong rào ba dấu huyền, kèm 1–2 câu giải thích.
- Mô tả quá mơ hồ, không biết game chơi thế nào: KHÔNG viết, hỏi lại đúng MỘT câu cụ thể (không kèm khối mã).
- Yêu cầu không phải game lớp học, hoặc đòi lấy dữ liệu cá nhân, gọi mạng, chuyển trang, thoát khung: KHÔNG viết, từ chối ngắn gọn và nói cách làm đúng (không kèm khối mã).
"""
SYSTEM = contract.BRIEF + RULES

FENCE = chr(96) * 3
HTML_RE = re.compile(FENCE + r"(?:html)?\s*\n(.*?)" + FENCE, re.S | re.I)


def _split(reply_text):
    m = HTML_RE.search(reply_text)
    if not m:
        return reply_text.strip(), None
    return (reply_text[:m.start()].strip() or "Đây là game mình vừa viết."), m.group(1).strip()


def answer(text: str) -> dict:
    user, last_err = text, None
    for step in range(1, MAX_STEPS + 1):
        prompt = user if not last_err else "%s\n\n[Hệ thống] Bản trước bị từ chối: %s Hãy sửa và trả lại đầy đủ file." % (user, last_err)
        reply = call_model(SYSTEM, prompt)
        msg, html = _split(reply["text"])
        if html is None:
            note("dừng: model không viết game (hỏi lại, từ chối, hoặc chưa nối model thật)")
            return {"output": msg}
        res = check_game(html)
        if res["ok"]:
            flags = res["flags"]
            if flags:
                warn = "CÓ %d cờ cảnh báo cho người duyệt:\n" % len(flags) + "\n".join(
                    "- %s (dòng %s): %s — `%s`" % (f["label"], f["line"], f["reason"], f["excerpt"]) for f in flags)
            else:
                warn = "Không có cờ cảnh báo."
            note("dừng: game hợp lệ sau %d lượt viết, %d cờ" % (step, len(flags)))
            return {"output": "%s\n\nTrạng thái: BẢN NHÁP chờ người duyệt (chưa lưu, chưa gửi). Hợp đồng: đạt. %s\n\n%shtml\n%s\n%s"
                    % (msg, warn, FENCE, html, FENCE)}
        last_err = res["error"]
        note("lượt %d bị check_game từ chối: %s" % (step, last_err))
    note("dừng: viết %d lượt vẫn sai hợp đồng" % MAX_STEPS)
    return {"output": "Mình chưa viết được file game hợp lệ (%s). Bạn mô tả lại rõ hơn giúp mình nhé: game chơi thế nào, học sinh làm gì, có câu hỏi không." % last_err}
