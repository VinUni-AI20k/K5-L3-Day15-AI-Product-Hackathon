"""T12 — Catalog Snapshot, kiểm tương thích và App Composer (chỉ đọc / chỉ tạo DRAFT).

Dịch vụ dùng chung cho codebase/tools.py (AI Agent) và ailab/server.py (Backend).
Nguyên tắc: không ghi Catalog, không lưu ứng dụng, không tự đặt APPROVED. Mọi bản
được lắp ở đây là bản nháp (status='draft') chờ giáo viên/Admin duyệt ở T14.

Chỉ dùng thư viện chuẩn. Các luật hợp đồng jl-camera và quét cờ lấy lại từ
ailab/contract.py; luật cú pháp bộ đề lấy lại từ ailab/store.py — không chép lại.
"""
import json
import sqlite3

import contract
import store

SCHEMA_VERSION = "1.0"
MOUSE_KIND = "mouse"
SUPPORTED_MODEL_KINDS = ("hands", "image", "pose")
UNSUPPORTED_RUNTIME_KINDS = ("audio",)
FALLBACK_CASES = (
    "no_model", "model_loading", "model_failed", "no_camera", "camera_denied", "camera_off",
)
HELPER_STATES = ("denied", "busy", "no-camera", "model-failed", "off", "loading")


class ComposerError(Exception):
    """Lỗi đọc Catalog hoặc dữ liệu đầu vào không đúng hình dạng."""


def _json_value(value):
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return None
    return None


def _connect():
    c = store.connect()
    try:
       ok = c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='players'").fetchone()
    except sqlite3.Error:
        ok = None
    if not ok:
        c.close()
        raise ComposerError("Catalog chưa khởi tạo. Chạy `bash scripts/staging.sh all` trước khi dùng tools.")
    return c


def _load(table, rid):
    try:
        ident = int(rid)
    except (TypeError, ValueError):
        raise ComposerError("ID %s không hợp lệ (cần số nguyên)." % rid)
    c = _connect()
    try:
        row = c.execute("SELECT * FROM %s WHERE id=?" % table, (ident,)).fetchone()
    finally:
        c.close()
    if not row:
        raise ComposerError("Không thấy %s #%d trong Catalog." % (table, ident))
    return dict(row)


def _player(value):
    if isinstance(value, (int, str)) and str(value).strip().isdigit():
        value = _load("players", value)
    if not isinstance(value, dict):
        raise ComposerError("Player phải là ID hoặc dict từ Catalog.")
    manifest = _json_value(value.get("manifest"))
    if manifest is None and value.get("html"):
        manifest, err = contract.parse(value["html"])
        if err:
            raise ComposerError(err[1])
    if not isinstance(manifest, dict):
        raise ComposerError("Player thiếu manifest jl-camera hợp lệ.")
    out = {"id": value.get("id"), "name": value.get("name") or manifest.get("name", ""), "manifest": manifest}
    if isinstance(value.get("html"), str):
        out["html"] = value["html"]
    if isinstance(value.get("source"), str):
        out["source"] = value["source"]
    return out


def _model(value):
    if isinstance(value, (int, str)) and str(value).strip().isdigit():
        value = _load("models", value)
    if not isinstance(value, dict):
        raise ComposerError("Model phải là ID hoặc dict từ Catalog.")
    raw = _json_value(value.get("outputs")) or []
    outputs = []
    for o in raw:
        if isinstance(o, dict) and isinstance(o.get("key"), str):
            outputs.append({"key": o["key"], "role": o.get("role") or "action"})
    return {"id": value.get("id"), "name": value.get("name", ""), "kind": value.get("kind"),
            "outputs": outputs, "url": value.get("url", "")}


def _exam(value):
    if isinstance(value, (int, str)) and str(value).strip().isdigit():
        value = _load("exams", value)
    if not isinstance(value, dict):
        raise ComposerError("Exam phải là ID hoặc dict từ Catalog.")
    content = value.get("content") or ""
    if not isinstance(content, str):
        raise ComposerError("Nội dung bộ đề phải là chuỗi.")
    questions = value.get("questions")
    if not isinstance(questions, list):
        try:
            questions = store.parse_questions(content)
        except store.Err:
            questions = []
    return {"id": value.get("id"), "name": value.get("name", ""), "content": content,
            "questions": questions, "count": len(questions)}


def validate_compatibility(player, model=None, exam=None, mapping=None, plan=None):
    """Kiểm Rules tổ hợp Model + Player + Question Set; trả dict, không ghi gì.

    Input: player / model / exam (ID trong Catalog hoặc dict), mapping(dict, tuỳ chọn),
    plan(ApplicationPlan dict, tuỳ chọn để kiểm mouse_always_enabled).
    Output: {"ok": bool, "reasons": [str], "player": tên, "model": tên, "exam": tên}.
    Không tác động ra ngoài: chỉ đọc Catalog, không lưu, không xuất bản."""
    reasons = []
    try:
        p = _player(player)
        m = _model(model) if model is not None else None
        e = _exam(exam) if exam is not None else None
    except ComposerError as exc:
        return {"ok": False, "reasons": [str(exc)], "player": "", "model": "", "exam": ""}

    man = p["manifest"]
    raw_mapping = mapping if mapping is not None else {}
    if raw_mapping is None:
        raw_mapping = {}
    if not isinstance(raw_mapping, dict):
        reasons.append("mapping phải là dict dạng {'ô của player': 'lớp của model'}.")
        raw_mapping = {}

    if m and m["kind"] in UNSUPPORTED_RUNTIME_KINDS:
        reasons.append("Runtime chưa hỗ trợ model audio; dùng hands/image/pose hoặc chơi bằng chuột.")

    if m and m["kind"] != MOUSE_KIND:
        if "inputs" in man:
            kinds = man.get("kinds") or ["image", "pose"]  # mặc định của contract.parse
            if m["kind"] not in kinds:
                reasons.append("Player '%s' khai kinds=%s, không nhận model '%s'; cần player có kinds chứa '%s'."
                               % (p["name"], ", ".join(kinds), m["kind"], m["kind"]))
            outputs = {o["key"]: o["role"] for o in m["outputs"]}
            used = set()
            for item in man["inputs"]:
                key = item.get("key")
                out = raw_mapping.get(key)
                if out in (None, ""):
                    if key in outputs:
                        out = key  # trùng tên thì coi là ánh xạ mặc định
                    elif item.get("required", False):
                        reasons.append("Ô '%s' của player '%s' chưa được gắn với lớp của model."
                                       % (item.get("label") or key, p["name"]))
                        continue
                    else:
                        continue
                if out not in outputs:
                    reasons.append("Lớp '%s' không có trong model '%s' (sai nhãn/input)." % (out, m["name"]))
                elif out in used:
                    reasons.append("Lớp '%s' của model '%s' bị gắn cho nhiều hơn một ô." % (out, m["name"]))
                elif outputs[out] not in (item.get("accepts") or ["action"]):
                    reasons.append("Lớp '%s' có vai trò '%s', không khớp ô '%s' (accepts=%s)."
                                   % (out, outputs[out], item.get("label") or key,
                                      ", ".join(item.get("accepts") or ["action"])))
                else:
                    used.add(out)
        else:
            reasons.append("Player '%s' không có inputs; không ghép model '%s'. Dùng chuột hoặc player có inputs."
                           % (p["name"], m["name"]))

    if e is not None:
        needs_exam = man.get("questions") == "exam" or (man.get("content") or {}).get("kind") == "questions"
        if needs_exam:
            if not e["questions"]:
                reasons.append("Player '%s' cần bộ đề dạng câu hỏi; '%s' không có câu hợp lệ."
                               % (p["name"], e["name"]))
            else:
                input_keys = {i.get("key") for i in man.get("inputs", [])}
                if input_keys:
                    unknown = sorted({q["answer"] for q in e["questions"]} - input_keys)
                    if unknown:
                        reasons.append("Bộ đề '%s' có đáp án %s nhưng player '%s' chỉ nhận %s."
                                       % (e["name"], "/".join(unknown), p["name"], "/".join(sorted(input_keys))))
        elif "content" in man:
            cm = man["content"]
            if e["questions"]:
                reasons.append("Player '%s' nhận content.kind='%s' (danh sách chữ), không nhận bộ đề câu hỏi."
                               % (p["name"], cm.get("kind")))
            lines = [x.strip() for x in e["content"].splitlines() if x.strip()]
            lo, hi = cm.get("min", 1), cm.get("max", 100)
            if not (lo <= len(lines) <= hi):
                reasons.append("'%s' cần %d–%d dòng, bộ đề '%s' có %d dòng."
                               % (cm.get("label") or p["name"], lo, hi, e["name"], len(lines)))

    if isinstance(plan, dict):
        inter = plan.get("interaction") or {}
        if isinstance(inter, dict) and inter:
            if inter.get("mouse_always_enabled") is not True:
                reasons.append("Mouse Fallback: interaction.mouse_always_enabled phải là true.")
            if inter.get("fallback") not in (None, "mouse"):
                reasons.append("Mouse Fallback: interaction.fallback phải là 'mouse'.")

    return {"ok": not reasons, "reasons": reasons, "player": p["name"],
            "model": (m or {}).get("name", ""), "exam": e["name"] if e is not None else ""}


def compose_app(plan):
    """Lắp ApplicationPlan thành ứng dụng DRAFT (Model + Player + Question Set).

    Input: plan (dict hoặc chuỗi JSON, có thể bọc trong 'application_plan').
    Output: {"ok": bool, "errors": [str], "app": dict hoặc None, "status": "draft"}.
    Không tác động ra ngoài: KHÔNG ghi Catalog, KHÔNG lưu DB, KHÔNG tự APPROVED.
    Nhánh REUSE dùng nguyên player_id/HTML gốc; nhánh GENERATE chỉ giữ HTML nháp."""
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except ValueError as exc:
            return {"ok": False, "errors": ["ApplicationPlan không phải JSON hợp lệ: %s" % exc],
                    "app": None, "status": "draft"}
    if not isinstance(plan, dict):
        return {"ok": False, "errors": ["ApplicationPlan phải là dict hoặc chuỗi JSON."],
                "app": None, "status": "draft"}
    raw = plan.get("application_plan") if isinstance(plan.get("application_plan"), dict) else plan
    errors = []
    requested_status = plan.get("status") or raw.get("status") or ""

    inter = raw.get("interaction") or {}
    if not isinstance(inter, dict):
        inter = {}
        errors.append("interaction phải là dict.")
    if inter.get("mouse_always_enabled") is not True:
        errors.append("Mouse Fallback bắt buộc: interaction.mouse_always_enabled phải là true.")

    app_player = None
    p = raw.get("player") or {}
    if not isinstance(p, dict):
        p = {}
        errors.append("player phải là dict.")
    if p.get("mode") == "reuse_existing":
        if p.get("player_id") in (None, ""):
            errors.append("reuse_existing cần player_id có thật trong Catalog.")
        elif p.get("html"):
            errors.append("reuse_existing không được chứa HTML mới (giữ nguyên HTML gốc).")
        else:
            try:
                prow = _player(_load("players", p["player_id"]))
                app_player = {"mode": "reuse_existing", "player_id": int(p["player_id"]),
                              "name": prow["name"], "manifest": prow["manifest"], "html": None,
                              "source_html_untouched": True, "draft": False}
            except ComposerError as exc:
                errors.append(str(exc))
    elif p.get("mode") == "generate_new":
        html = p.get("html")
        if not isinstance(html, str) or not html.strip():
            errors.append("generate_new cần HTML nháp hợp lệ trong player.html.")
        else:
            man, err = contract.parse(html)
            if err:
                errors.append("HTML nháp sai hợp đồng: %s" % err[1])
            else:
                app_player = {"mode": "generate_new", "player_id": None,
                              "name": p.get("name") or man["name"], "manifest": man, "html": html,
                              "draft": True, "catalog_written": False, "flags": contract.scan(html)}
    else:
        errors.append("player.mode phải là 'reuse_existing' hoặc 'generate_new'.")

    app_model = {"mode": "mouse_only", "model_id": None, "name": "Điều khiển bằng chuột",
                 "kind": MOUSE_KIND, "outputs": [], "mapping": {}, "sure": 0.8, "hold_ms": 800}
    md = raw.get("model") or {}
    if not isinstance(md, dict):
        md = {}
        errors.append("model phải là dict.")
    if md.get("model_id") not in (None, ""):
        try:
            mrow = _model(_load("models", md["model_id"]))
            app_model = {"mode": "reuse_existing", "model_id": int(md["model_id"]), "name": mrow["name"],
                         "kind": mrow["kind"], "outputs": mrow["outputs"],
                         "mapping": md.get("mapping") or {}, "sure": md.get("sure", 0.8),
                         "hold_ms": md.get("hold_ms", md.get("holdMs", 800))}
        except ComposerError as exc:
            errors.append(str(exc))

    app_exam = {"mode": "generate_new", "exam_id": None, "name": "Bộ đề từ ApplicationPlan",
                "content": "", "questions": [], "knowledge_review_required": True}
    ed = raw.get("exam") or {}
    if not isinstance(ed, dict):
        ed = {}
        errors.append("exam phải là dict.")
    exam_mode = ed.get("mode") or ("reuse_existing" if ed.get("exam_id") not in (None, "") else "generate_new")
    if exam_mode == "reuse_existing":
        if ed.get("exam_id") in (None, ""):
            errors.append("exam.mode=reuse_existing cần exam_id có thật trong Catalog.")
        else:
            try:
                erow = _exam(_load("exams", ed["exam_id"]))
                app_exam = {"mode": "reuse_existing", "exam_id": int(ed["exam_id"]), "name": erow["name"],
                            "content": erow["content"], "questions": erow["questions"],
                            "knowledge_review_required": True}
            except ComposerError as exc:
                errors.append(str(exc))
    elif exam_mode == "generate_new":
        content = ed.get("content")
        if not isinstance(content, str) or not content.strip():
            errors.append("exam.mode=generate_new cần nội dung bộ đề trong exam.content.")
        else:
            try:
                questions = store.parse_questions(content)
            except store.Err as exc:
                questions = []
                errors.append("Bộ đề mới sai cú pháp: %s" % exc.msg)
            app_exam = {"mode": "generate_new", "exam_id": None,
                        "name": ed.get("name") or "Bộ đề từ ApplicationPlan", "content": content.strip(),
                        "questions": questions, "knowledge_review_required": True}
    else:
        errors.append("exam.mode phải là 'reuse_existing' hoặc 'generate_new'.")

    if app_player and not errors:
        comp = validate_compatibility(app_player, app_model, app_exam,
                                      mapping=app_model["mapping"], plan=raw)
        if not comp["ok"]:
            errors.extend(comp["reasons"])

    if errors:
        return {"ok": False, "errors": errors, "app": None, "status": "draft"}

    app = {
        "schema_version": str(raw.get("schema_version") or plan.get("schema_version") or SCHEMA_VERSION),
        "name": raw.get("name") or "Game từ ApplicationPlan",
        "status": "draft",
        "simulated": bool(plan.get("simulated", False)),
        "ai_requested_status": requested_status if requested_status and requested_status.upper() != "DRAFT" else None,
        "requires_human_approval": True,
        "knowledge_review_required": True,
        "catalog_written": False,
        "player": app_player,
        "model": app_model,
        "exam": app_exam,
        "interaction": {"primary": inter.get("primary") or app_model["kind"], "fallback": "mouse",
                        "mouse_always_enabled": True},
    }
    return {"ok": True, "errors": [], "app": app, "status": "draft"}


def catalog_snapshot():
    """Bản Catalog cố định (không timestamp) cho DATA_CARD.md / benchmark.

    Output: dict gồm players/models/exams + giới hạn Runtime. Chỉ đọc DB."""
    c = _connect()
    try:
        players = []
        for r in c.execute("SELECT id,name,description,manifest,status,source,visibility FROM players ORDER BY id"):
            man = _json_value(r["manifest"]) or {}
            players.append({
                "id": r["id"], "name": r["name"], "description": r["description"],
                "status": r["status"], "source": r["source"], "visibility": r["visibility"],
                "kinds": man.get("kinds"), "inputs": [i["key"] for i in man.get("inputs", [])],
                "questions": man.get("questions"), "content": man.get("content"),
            })
        models = []
        for r in c.execute("SELECT id,name,description,kind,url,outputs,visibility FROM models ORDER BY id"):
            models.append({
                "id": r["id"], "name": r["name"], "description": r["description"],
                "kind": r["kind"], "url": r["url"], "outputs": _json_value(r["outputs"]) or [],
                "visibility": r["visibility"],
            })
        exams = []
        for r in c.execute("SELECT id,name,description,content FROM exams ORDER BY id"):
            try:
                count = len(store.parse_questions(r["content"]))
            except store.Err:
                count = 0
            exams.append({"id": r["id"], "name": r["name"], "description": r["description"],
                          "count": count, "content": r["content"]})
    finally:
        c.close()
    return {
        "schema_version": SCHEMA_VERSION,
        "source": "ailab/store.py (init + seed_exams.json)",
        "players": players,
        "models": models,
        "exams": exams,
        "limits": {
            "player_max_bytes": contract.MAX_BYTES,
            "exam_max_questions": 200,
            "supported_model_kinds": list(SUPPORTED_MODEL_KINDS),
            "unsupported_runtime_kinds": list(UNSUPPORTED_RUNTIME_KINDS),
            "mouse_fallback_required": True,
        },
    }


def runtime_static_checks():
    """T13 phần tĩnh: kiểm CSP/helper/cờ an toàn. KHÔNG thay cho chạy trình duyệt thật."""
    flag_codes = {code for code, _, _ in contract.FLAG_RULES}
    checks = [
        {"id": "csp_connect_none", "ok": "connect-src 'none'" in contract.CSP,
         "detail": "CSP chặn mọi connect-src ngoài whitelist."},
        {"id": "csp_form_and_base_none", "ok": "form-action 'none'" in contract.CSP and "base-uri 'none'" in contract.CSP,
         "detail": "CSP chặn gửi biểu mẫu và đổi base URI."},
        {"id": "sandbox_helper_states", "ok": all(s in contract.HELPER for s in HELPER_STATES),
         "detail": "Helper có thông báo cho 6 trạng thái camera/model."},
        {"id": "mouse_fallback_cases", "ok": len(FALLBACK_CASES) >= 5,
         "detail": "Đã liệt kê 5+ tình huống cần chuyển sang chuột (static)."},
        {"id": "safety_flags", "ok": {"network", "window", "frame", "picture"} <= flag_codes,
         "detail": "Quét cờ gọi mạng/mở cửa sổ/thoát khung/đọc ảnh camera."},
    ]
    return {"ok": all(x["ok"] for x in checks), "checks": checks,
            "note": "Chỉ kiểm tĩnh contract/CSP/helper; runtime thật và mouse fallback phải do TV3 chạy ở T15."}
