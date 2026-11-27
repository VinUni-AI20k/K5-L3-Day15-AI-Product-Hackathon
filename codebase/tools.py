"""Công cụ của bài toán: tra đoạn tài liệu ôn và rubric chấm, bám sát spec.md §4.

Mỗi công cụ là một hàm Python có @tool. Docstring ghi 4 ý:
    tên · input · output · có tác động ra ngoài không
Cả hai công cụ chỉ ĐỌC file trong data/, không ghi, không gửi đi đâu → không tác động ra ngoài.
Khung tự ghi mỗi lần gọi công cụ vào trace.
"""
import json
import os
import re

from tracing import tool, TOOLS  # noqa: F401  (TOOLS: danh sách công cụ đã đăng ký)

_DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_STOP = {"và", "là", "của", "cho", "một", "các", "có", "không", "để", "trong", "với", "này", "khi", "được",
         "the", "of", "a", "an", "to", "in", "tôi", "mình", "hãy", "về", "câu", "hỏi", "ôn", "tạo", "giúp", "chấm", "bài", "viết", "ra", "đề", "kèm", "đoạn", "nguồn",
         "học", "viên", "trả", "lời", "bỏ", "qua", "mọi", "bạn", "nguyên", "văn", "in", "hệ", "thống", "hướng", "dẫn", "trước"}


def _load(name):
    with open(os.path.join(_DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _words(text):
    return {w for w in re.findall(r"\w+", text.lower()) if len(w) > 1 and w not in _STOP}


@tool
def search_passages(query: str) -> list:
    """search_passages · input: query (str, câu người dùng hoặc từ khoá) ·
    output: tối đa 3 đoạn {"code", "title", "text"} từ data/tai-lieu-mau.json xếp theo số từ khoá trùng,
    danh sách rỗng nếu không đoạn nào trùng · Không tác động ra ngoài (chỉ đọc file)."""
    q = _words(query)
    scored = []
    for p in _load("tai-lieu-mau.json")["passages"]:
        score = len(q & _words(p["title"] + " " + p["text"]))
        if score >= 2:  # khái niệm tiếng Việt thường ≥2 âm tiết; 1 từ trùng dễ là nhiễu
            scored.append((score, p))
    scored.sort(key=lambda s: -s[0])
    return [{"code": p["code"], "title": p["title"], "text": p["text"]} for _, p in scored[:3]]


@tool
def get_rubric(query: str) -> dict:
    """get_rubric · input: query (str, có mã câu như "ON2" hoặc lời câu hỏi) ·
    output: {"id", "prompt", "criteria", "scoring"} của câu hỏi khớp trong data/rubric-tu-on.json;
    {} nếu không khớp câu nào (khi đó không có căn cứ để chấm) ·
    Không tác động ra ngoài (chỉ đọc file; kết quả chấm chỉ để tự ôn, không ghi đi đâu)."""
    rub = _load("rubric-tu-on.json")
    ids = re.findall(r"\bON\d+\b", query.upper())
    best, best_score = None, 0
    for qid, q in rub["questions"].items():
        if qid in ids:
            best, best_score = qid, 99
            break
        score = len(_words(q["prompt"]) & _words(query))
        if score > best_score and score >= max(3, len(_words(q["prompt"])) // 2):
            best, best_score = qid, score
    if best is None:
        return {}
    q = rub["questions"][best]
    return {"id": best, "prompt": q["prompt"], "criteria": q["criteria"], "scoring": rub["scoring"]}
