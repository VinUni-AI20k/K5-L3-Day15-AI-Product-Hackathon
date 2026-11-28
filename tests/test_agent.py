import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "codebase"))

import agent  # noqa: E402
import tools  # noqa: E402

INV = {"T1": [{"mau": "Đen", "size": s, "ton": 3, "trang_thai": "Còn hàng"} for s in "SML"]}
ROW = {"ma_sp": "T1", "ten_sp": "Đầm Test", "loai": "Váy xoè", "gia_ban": "890.000đ", "gia_te": "50", "size": "S-L",
       "mau": "Đen", "chat_lieu": "Voan", "mo_ta": "Váy xoè 2 lớp, kéo khoá sau.",
       "anh": "https://example.com/image.jpg", "page": "diu-may", "prompt": "Viết nhẹ nhàng"}
GOOD = {"decision": "write", "flag_reasons": [], "hook": "Một chiếc đầm voan cho buổi hẹn cuối tuần.",
        "body": "Đầm Test dáng xoè 2 lớp, màu đen, size S, M, L. Giá 890.000đ.", "cta": "Bình luận size để shop tư vấn nhé.",
        "hashtags": ["damxoe"], "facts_used": ["F1", "F3"]}


class FakeModel:
    def __init__(self, *replies):
        self.replies, self.calls = list(replies), 0

    def __call__(self, system, user, schema=None):
        self.calls += 1
        r = self.replies[min(self.calls - 1, len(self.replies) - 1)]
        return {"text": json.dumps(r, ensure_ascii=False), "model": "fake", "tokens_in": 0, "tokens_out": 0}


def setup_function(_):
    tools.inventory = lambda: INV


def test_hard_flag_skips_model():
    m = FakeModel(GOOD)
    res = agent.process_row(dict(ROW, gia_ban=""), model=m)
    assert res["decision"] == "flag" and m.calls == 0 and res["reasons"][0][0] == "gia_ban"


def test_out_of_stock_skips_model():
    tools.inventory = lambda: {"T1": [{"mau": "Đen", "size": s, "ton": 0, "trang_thai": "HẾT HÀNG"} for s in "SML"]}
    m = FakeModel(GOOD)
    res = agent.process_row(dict(ROW), model=m)
    assert res["decision"] == "flag" and m.calls == 0 and res["reasons"][0][0] == "ton_kho"


def test_write_path():
    m = FakeModel(GOOD)
    res = agent.process_row(dict(ROW), model=m)
    assert res["decision"] == "write" and m.calls == 1
    assert "890.000đ" in res["post"] and "🔰 Mã: T1" in res["post"] and "kiểm tra hàng" in res["post"]


def test_retry_then_flag():
    bad = dict(GOOD, body="Đầm Test màu đen, size S, M, L. Giá chỉ 690k.")
    m = FakeModel(bad, bad)
    res = agent.process_row(dict(ROW), model=m)
    assert res["decision"] == "flag" and m.calls == 2 and res["attempts"] == 2


def test_retry_fixes():
    bad = dict(GOOD, body="Đầm Test màu đen, size S đến XL. Giá 890.000đ.")
    m = FakeModel(bad, GOOD)
    res = agent.process_row(dict(ROW), model=m)
    assert res["decision"] == "write" and m.calls == 2


def test_model_flag_passes_reasons():
    m = FakeModel({"decision": "flag", "flag_reasons": [{"field": "prompt", "issue": "đòi thời gian giao hàng"}],
                   "hook": "", "body": "", "cta": "", "hashtags": [], "facts_used": []})
    res = agent.process_row(dict(ROW), model=m)
    assert res["decision"] == "flag" and res["reasons"] == [("prompt", "đòi thời gian giao hàng")]


def test_answer_format():
    out = agent.answer("ma_sp: T1 | ten_sp: Đầm Test | size: S-L | mau: Đen | prompt: viết đi")["output"]
    assert out.startswith("ĐÁNH DẤU: gia_ban")
