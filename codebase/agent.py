"""Luồng chính — workflow cố định cho TỪNG dòng sản phẩm (sơ đồ: spec.md §4).

    check_product (code) → check_stock (code) → write_or_flag (1 lần gọi AI, JSON) → verify_post (code)
    → lỗi thì viết lại 1 lần → vẫn lỗi thì đánh dấu.

answer(text) — hợp đồng của khung: text là MỘT dòng sản phẩm (JSON, hoặc các cặp `trường: giá trị`
cách nhau bởi xuống dòng hoặc ` | `). Trả {"output": "VIẾT\\n<bài>"} hoặc {"output": "ĐÁNH DẤU: trường: vấn đề; …"}.
"""
import json
import re

import prompts
import rules
from ai import call_model
from tools import GLOB, check_product, check_stock, page_for, verify_post
from tracing import note

MAX_ATTEMPTS = 2   # 1 lần viết + 1 lần viết lại


def _assemble(d):
    tags = " ".join(h if h.startswith("#") else "#" + h for h in (d.get("hashtags") or [])[:3] if h.strip())
    parts = [d.get("hook", "").strip(), d.get("body", "").strip(), d.get("cta", "").strip(), tags]
    return "\n\n".join(p for p in parts if p)


def _footer(row):
    code = (row.get("ma_sp") or "").strip()
    return GLOB["footer"] + ("\n🔰 Mã: %s" % code if code else "")


def process_row(row, page=None, model=call_model):
    """→ dict: decision, reasons [(trường, vấn đề)], warnings [str], post (kèm khối cam kết), draft, facts_used,
    attempts, colors, sizes, page_id."""
    if page is None:
        page, pwarn = page_for(row)
    else:
        pwarn = None
    res = {"decision": "flag", "reasons": [], "warnings": [], "post": "", "draft": "", "facts_used": [],
           "attempts": 0, "colors": [], "sizes": [], "page_id": page["id"]}
    if pwarn:
        res["warnings"].append("%s: %s" % pwarn)

    c = check_product(row, page)
    res["warnings"] += ["%s: %s" % w for w in c["warn"]]
    if c["hard"]:
        res["reasons"] = c["hard"]
        note("dừng: lỗi cứng ở bước kiểm dòng, không gọi AI")
        return res
    s = check_stock(row)
    res["warnings"] += ["%s: %s" % w for w in s["warn"]]
    if s["hard"]:
        res["reasons"] = s["hard"]
        note("dừng: tồn kho, không gọi AI")
        return res
    res["colors"], res["sizes"] = s["colors"], s["sizes"]

    allowed = rules.allowed_facts(row, s, page, GLOB)
    system = prompts.system_prompt(page, GLOB)
    user = prompts.user_prompt(row, allowed, res["warnings"])
    problems = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        res["attempts"] = attempt
        reply = model(system, user + (prompts.retry_suffix(res["draft"], problems) if problems else ""), prompts.SCHEMA)
        try:
            d = json.loads(reply["text"])
        except (ValueError, TypeError):
            problems = ["trả về không phải JSON hợp lệ"]
            continue
        if d.get("decision") == "flag":
            res["reasons"] = [(r.get("field", "?"), r.get("issue", "")) for r in d.get("flag_reasons") or []] \
                or [("prompt", "AI đánh dấu nhưng không nêu lý do")]
            note("dừng: AI quyết định đánh dấu")
            return res
        res["draft"] = _assemble(d)
        res["facts_used"] = d.get("facts_used") or []
        v = verify_post(res["draft"], allowed)
        if not v["block"]:
            res["decision"] = "write"
            res["post"] = res["draft"] + "\n\n" + _footer(row)
            res["warnings"] += v["warn"]
            note("dừng: bài sạch sau %d lần" % attempt)
            return res
        problems = v["block"]
    res["reasons"] = [("bai_viet", "AI viết %d lần vẫn sai: %s" % (MAX_ATTEMPTS, "; ".join(problems)))]
    note("dừng: vẫn lỗi sau %d lần → đánh dấu" % MAX_ATTEMPTS)
    return res


def parse_row_text(text):
    t = (text or "").strip()
    if t.startswith("{"):
        try:
            return rules.normalize_row(json.loads(t))
        except ValueError:
            pass
    raw = {}
    for part in re.split(r"\n|\s\|\s", t):
        if ":" in part:
            k, v = part.split(":", 1)
            raw[k.strip()] = v.strip()
    return rules.normalize_row(raw)


def format_output(res):
    if res["decision"] == "write":
        return "VIẾT\n" + res["post"]
    return "ĐÁNH DẤU: " + "; ".join("%s: %s" % r for r in res["reasons"])


def answer(text: str) -> dict:
    row = parse_row_text(text)
    if not any(row.values()):
        return {"output": "ĐÁNH DẤU: dong: không đọc được dòng sản phẩm (cần các cặp `trường: giá trị` hoặc JSON)"}
    return {"output": format_output(process_row(row))}
