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


def _effective_glob(page=None):
    """Bản sao GLOB có hợp nhất thêm extraBanned của page/writing_style (không bao giờ xoá danh sách cấm toàn cục)."""
    ws = (page or {}).get("writing_style") or {}
    extras = list((page or {}).get("extra_banned") or []) + list(ws.get("extraBanned") or [])
    if not extras:
        return GLOB
    merged = list(GLOB["banned"])
    seen = {p.lower() for p in merged}
    for raw in extras:
        s = str(raw or "").strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            merged.append(s)
    return dict(GLOB, banned=merged)


def _norm_hashtag(h):
    s = str(h or "").strip()
    if not s:
        return ""
    return s if s.startswith("#") else ("#" + s)


def _assemble(d, page=None):
    ws = (page or {}).get("writing_style") or {}
    ht = ws.get("hashtags") if isinstance(ws.get("hashtags"), dict) else {}
    fixed_raw = ht.get("fixed") or []
    max_extra = ht.get("maxExtra")
    max_extra = int(max_extra) if max_extra is not None else 3

    final_tags = []
    seen = set()
    for raw in fixed_raw:
        tag = _norm_hashtag(raw)
        if tag and tag.lower() not in seen:
            seen.add(tag.lower())
            final_tags.append(tag)

    extra_added = 0
    for raw in (d.get("hashtags") or []):
        if extra_added >= max_extra:
            break
        tag = _norm_hashtag(raw)
        if tag and tag.lower() not in seen:
            seen.add(tag.lower())
            final_tags.append(tag)
            extra_added += 1

    tags = " ".join(final_tags)
    parts = [d.get("hook", "").strip(), d.get("body", "").strip(), d.get("cta", "").strip(), tags]
    return "\n\n".join(p for p in parts if p)


def _footer(row, page=None):
    code = (row.get("ma_sp") or "").strip()
    ws = (page or {}).get("writing_style") or {}
    base_footer = (ws.get("footer") or "").strip() or (page or {}).get("footer") or GLOB["footer"]
    return base_footer + ("\n🔰 Mã: %s" % code if code else "")


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

    eff_glob = _effective_glob(page)
    allowed = rules.allowed_facts(row, s, page, eff_glob)
    system = prompts.system_prompt(page, eff_glob)
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
        res["draft"] = _assemble(d, page)
        res["facts_used"] = d.get("facts_used") or []
        v = verify_post(res["draft"], allowed)
        if not v["block"]:
            res["decision"] = "write"
            res["post"] = res["draft"] + "\n\n" + _footer(row, page)
            res["warnings"] += v["warn"]
            note("dừng: bài sạch sau %d lần" % attempt)
            return res
        problems = v["block"]
    res["reasons"] = [("bai_viet", "AI viết %d lần vẫn sai: %s" % (MAX_ATTEMPTS, "; ".join(problems)))]
    note("dừng: vẫn lỗi sau %d lần → đánh dấu" % MAX_ATTEMPTS)
    return res


def draft_comment_reply(comment, post, row, page=None, model=call_model, history=None):
    """Soạn nháp trả lời bình luận khách (1 lần gọi AI + tối đa 1 lần viết lại, không bao giờ ném lỗi do model).

    history (tuỳ chọn): danh sách tin nhắn hội thoại cũ→mới (dict có `message`/`text`, `is_from_page`/`fromPage`).
    → dict: decision ('reply'|'flag'), reply (str), reasons ([{field, issue}]), warnings ([str]),
    facts_used ([str]), attempts (int), model (str), tokens_in (int), tokens_out (int).
    """
    if page is None:
        page, _ = page_for(row or {})
    res = {
        "decision": "flag",
        "reply": "",
        "reasons": [],
        "warnings": [],
        "facts_used": [],
        "attempts": 0,
        "model": "",
        "tokens_in": 0,
        "tokens_out": 0,
    }
    comment_msg = comment.get("message", "") if isinstance(comment, dict) else str(comment or "")
    post_caption = post.get("caption", "") if isinstance(post, dict) else str(post or "")
    clean_comment = rules.scrub_pii(comment_msg)
    clean_caption = rules.scrub_pii(post_caption)

    clean_history = None
    if history is not None:
        clean_history = []
        has_customer_text = False
        for item in history:
            if isinstance(item, dict):
                raw_msg = item.get("message") if "message" in item else item.get("text", "")
                is_page = bool(item.get("is_from_page") if "is_from_page" in item else item.get("fromPage", False))
            else:
                raw_msg = str(item or "")
                is_page = False
            scrubbed = rules.scrub_pii(raw_msg)
            if not is_page and scrubbed.strip():
                has_customer_text = True
            clean_history.append({"is_from_page": is_page, "message": scrubbed})
        if not has_customer_text and not clean_comment.strip():
            res["reasons"] = [{"field": "comment", "issue": "bình luận không có nội dung chữ — nhân viên xem trực tiếp trên Facebook"}]
            note("dừng: hội thoại không có nội dung chữ từ khách, không gọi AI")
            return res
    elif not clean_comment.strip():
        res["reasons"] = [{"field": "comment", "issue": "bình luận không có nội dung chữ — nhân viên xem trực tiếp trên Facebook"}]
        note("dừng: bình luận không có nội dung chữ, không gọi AI")
        return res
    if not row:
        res["reasons"] = [{"field": "catalog", "issue": "không tìm thấy sản phẩm trong catalog — nhân viên tự trả lời"}]
        note("dừng: thiếu dữ liệu sản phẩm, không gọi AI")
        return res

    stock = check_stock(row)
    res["warnings"] += ["%s: %s" % w for w in stock["warn"]]
    if stock["hard"]:
        res["reasons"] = [{"field": f, "issue": m} for f, m in stock["hard"]]
        note("dừng: tồn kho có lỗi cứng, không gọi AI")
        return res

    eff_glob = _effective_glob(page)
    allowed = rules.allowed_facts(row, stock, page, eff_glob)
    system = prompts.comment_system_prompt(page, eff_glob)
    user = prompts.comment_user_prompt(clean_comment, clean_caption, row, allowed, res["warnings"], history=clean_history)
    problems = []
    prev_reply = ""

    for attempt in range(1, MAX_ATTEMPTS + 1):
        res["attempts"] = attempt
        prompt_user = user + (prompts.comment_retry_suffix(prev_reply, problems) if problems else "")
        try:
            out = model(system, prompt_user, prompts.COMMENT_SCHEMA)
        except Exception as e:
            res["reasons"] = [{"field": "model", "issue": "lỗi gọi model: %s" % type(e).__name__}]
            note("dừng: lỗi gọi model ở lần %d → đánh dấu" % attempt)
            return res

        if not isinstance(out, dict):
            problems = ["model không trả về dữ liệu hợp lệ"]
            continue
        if out.get("model"):
            res["model"] = str(out.get("model"))
        try:
            res["tokens_in"] += max(0, int(out.get("tokens_in") or 0))
            res["tokens_out"] += max(0, int(out.get("tokens_out") or 0))
        except (TypeError, ValueError):
            pass

        try:
            d = json.loads(out.get("text") or "")
        except (ValueError, TypeError):
            problems = ["trả về không phải JSON hợp lệ"]
            continue
        if not isinstance(d, dict):
            problems = ["JSON trả về không phải object"]
            continue

        decision = d.get("decision")
        if decision == "flag":
            raw_reasons = d.get("flag_reasons") if isinstance(d.get("flag_reasons"), list) else []
            reasons = [
                {"field": str(r.get("field") or "comment"), "issue": str(r.get("issue") or "")}
                for r in raw_reasons
                if isinstance(r, dict) and (r.get("field") or r.get("issue"))
            ]
            res["reasons"] = reasons or [{"field": "comment", "issue": "AI đánh dấu cần nhân viên kiểm tra"}]
            res["facts_used"] = [str(x) for x in d.get("facts_used")] if isinstance(d.get("facts_used"), list) else []
            note("dừng: AI đánh dấu bình luận")
            return res

        if decision != "reply":
            problems = ["decision không hợp lệ (chỉ nhận 'reply' hoặc 'flag')"]
            continue

        reply_text = d.get("reply")
        if not isinstance(reply_text, str) or not reply_text.strip():
            problems = ["reply trống khi decision='reply'"]
            continue
        reply_text = reply_text.strip()
        prev_reply = reply_text
        res["facts_used"] = [str(x) for x in d.get("facts_used")] if isinstance(d.get("facts_used"), list) else []

        v = verify_post(reply_text, allowed, is_comment=True)
        if not v["block"]:
            res["decision"] = "reply"
            res["reply"] = reply_text
            res["warnings"] += v["warn"]
            note("dừng: nháp bình luận sạch sau %d lần" % attempt)
            return res
        problems = v["block"]

    res["reasons"] = [{"field": "reply", "issue": "AI viết %d lần vẫn sai: %s" % (MAX_ATTEMPTS, "; ".join(problems))}]
    note("dừng: nháp bình luận vẫn lỗi sau %d lần → đánh dấu" % MAX_ATTEMPTS)
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
