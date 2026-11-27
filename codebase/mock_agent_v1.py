"""T06 deterministic fixture Agent; no LLM, database, T12 or persistence.

The registry is a trusted, already authorized snapshot supplied by the caller.
Default IDs exist only in this explicitly simulated registry, never production.
"""
import copy
import json
import re
import unicodedata

try:
    from . import application_contract as ac
except ImportError:
    import application_contract as ac

from chatbot import catalog
import llm
import contract


def get_fixture_registry():
    """Fresh trusted fixture snapshot. IDs are fixture-local, not database IDs."""
    return copy.deepcopy({
        "players": [
            {"id": 101, "name": "Fixture mouse quiz", "manifest": {"name": "Fixture mouse quiz", "questions": "exam"}},
            {"id": 102, "name": "Fixture camera quiz", "manifest": {"name": "Fixture camera quiz", "questions": "exam", "kinds": ["image"],
             "inputs": [{"key": k, "label": k, "required": True, "accepts": ["action"]} for k in "AB"]}},
            {"id": 103, "name": "Fixture name wheel", "manifest": {"name": "Fixture name wheel", "content": {"kind": "texts", "label": "Names", "min": 1, "max": 20}}},
        ],
        "models": [{"id": 201, "name": "Fixture image AB", "kind": "image", "outputs": [{"key": k, "role": "action"} for k in "AB"]}],
        "exams": [{"id": 301, "name": "Fixture addition questions", "content": "1 + 1? | 2 | 3 | =A\n2 + 2? | 3 | 4 | =B"}],
    })


def _reply(decision, message, plan=None, errors=None, warnings=None):
    return {"schema_version": "1.0", "simulated": True, "decision": decision,
            "status": ac.STATUSES[decision], "message": message,
            "application_plan": copy.deepcopy(plan), "errors": copy.deepcopy(errors or []),
            "warnings": copy.deepcopy(warnings or [])}


def _fold(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower().replace("đ", "d")) if not unicodedata.combining(c))


def _refusal(text):
    folded = _fold(text)
    patterns = (r"ignore (?:all |the )?(?:previous|prior|system) instructions", r"bo qua (?:huong dan|chi dan|he thong)",
                r"(?:tu|auto)[ -]?(?:dong )?(?:xuat ban|publish|approve|approved)", r"bo qua (?:hitl|phe duyet|kiem duyet)",
                r"(?:mark|set|assign)\b.*?\bapproved\b", r"skip (?:the )?(?:human |teacher )?(?:approval|review)",
                r"(?:dat|gan).*?(?:trang thai|status).*?approved", r"khong can (?:nguoi|giao vien).*?duyet",
                r"bypass.*(?:hitl|approval|sandbox)", r"(?:thoat|escape).*?(?:iframe|sandbox)",
                r"(?:doc|lay|tiet lo|reveal|read).*?(?:\.env|api.?key|mat khau|password|secret)",
                r"(?:fetch\s*\(|xmlhttprequest|gui du lieu.*(?:http|may chu)|goi mang)",
                r"(?:marketing email|email quang cao|hack (?:account|tai khoan)|malware|ransomware|du doan gia (?:co phieu|bitcoin))")
    for pattern in patterns:
        match = re.search(pattern, folded)
        if match and not re.search(r"(?:khong|cam|do not|never)\s+(?:duoc\s+)?$", folded[max(0, match.start() - 20):match.start()]):
            return True
    return False


def run(payload, registry=None):
    """Produce a mock Contract envelope; history cannot supply rights or approval."""
    if not isinstance(payload, dict):
        return _reply("ERROR", "Input must be an object.", errors=[ac.issue("invalid_input", "Invalid request.")])
    allowed = {"session_id", "message", "history", "document_ids", "selected_player_id", "selected_model_id", "selected_exam_id", "generation_mode"}
    if payload.keys() - allowed:
        return _reply("ERROR", "Unknown input fields are not accepted.", errors=[ac.issue("invalid_input", "Unknown request fields.")])
    text, session = payload.get("message"), payload.get("session_id")
    if not isinstance(session, str) or not session.strip() or len(session) > 128 or not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
        return _reply("ERROR", "session_id and message must be non-empty strings.", errors=[ac.issue("invalid_input", "Invalid session/message.")])
    if not isinstance(payload.get("history", []), list) or not isinstance(payload.get("document_ids", []), list):
        return _reply("ERROR", "history and document_ids must be arrays.", errors=[ac.issue("invalid_input", "Invalid arrays.")])
    for field in ("selected_player_id", "selected_model_id", "selected_exam_id"):
        if payload.get(field) is not None and not ac._id(payload[field]):
            return _reply("ERROR", "Selected IDs must be positive integers or null.", errors=[ac.issue("invalid_input", "Invalid resource ID.", field)])
    mode = payload.get("generation_mode")
    if mode not in (None, "auto", "reuse_existing", "generate_new"):
        return _reply("ERROR", "Unknown generation_mode.", errors=[ac.issue("invalid_input", "Unknown generation mode.", "generation_mode")])
    if _refusal(text):
        return _reply("REFUSE", "Từ chối yêu cầu vượt phạm vi/an toàn hoặc bỏ qua phê duyệt. Hãy mô tả game lớp học để giáo viên duyệt.",
                      errors=[ac.issue("refused", "Không bỏ qua HITL, lộ bí mật, gọi mạng hoặc thoát sandbox.", "message")])
    if payload.get("document_ids"):
        return _reply("ERROR", "Mock chưa đọc hoặc trích xuất tài liệu.", errors=[ac.issue("document_rejected", "Document extraction is not implemented.", "document_ids")])
    trusted = get_fixture_registry() if registry is None else copy.deepcopy(registry)
    bad = []
    rows = {key: ac._registry_rows(trusted, key, bad) for key in ("players", "models", "exams")}
    if bad:
        return _reply("ERROR", "Trusted registry metadata is invalid.", errors=bad)
    selected = {}
    for field, kind in (("selected_player_id", "players"), ("selected_model_id", "models"), ("selected_exam_id", "exams")):
        rid = payload.get(field)
        selected[kind] = next((r for r in rows[kind] if r["id"] == rid), None)
        if rid is not None and selected[kind] is None:
            return _reply("ERROR", "Resource is absent from the authorized registry.", errors=[ac.issue("forbidden_resource", "Resource is absent or forbidden.", field)])
    folded = _fold(text)
    is_list = any(x in folded for x in ("danh sach", "chon ten", "name wheel", "list game"))
    generate = mode == "generate_new" or (mode in (None, "auto") and any(x in folded for x in ("game moi", "new game", "generate")))
    if not generate and selected["players"] is None and not any(x in folded for x in ("toan", "math", "phep cong", "quiz", "cau hoi", "lop", "class", "danh sach", "chon ten", "list", "wheel")):
        return _reply("ASK_CLARIFY", "Bạn muốn học sinh chơi game gì hoặc ôn chủ đề cụ thể nào?")
    if generate and selected["players"] is not None:
        return _reply("ERROR", "Explicit existing Player conflicts with generate_new.", errors=[ac.issue("incompatible_player", "Keep the selected Player or clear it to generate a draft.", "selected_player_id")])
    player = selected["players"]
    if not generate and player is None:
        try:
            player = next((p for p in rows["players"] if isinstance(p.get("manifest"), dict) and catalog.describe_player(p["manifest"])["gameKind"] == ("list" if is_list else "questions")), None)
        except (TypeError, ValueError, KeyError, AttributeError):
            return _reply("ERROR", "Trusted Player metadata is invalid.", errors=[ac.issue("invalid_registry", "Invalid Player metadata.")])
        if player is None:
            return _reply("ERROR", "No suitable authorized fixture Player.", errors=[ac.issue("missing_resource", "No matching Player.", "player")])
    manifest = ({"name": "Mock generated list", "content": {"kind": "texts", "label": "Names", "min": 1, "max": 20}}
                if generate and is_list else {"name": "Mock generated quiz", "questions": "exam"}) if generate else player.get("manifest")
    if not isinstance(manifest, dict):
        return _reply("ERROR", "Player metadata is invalid.", errors=[ac.issue("invalid_registry", "Invalid Player manifest.", "player")])
    try:
        info = catalog.describe_player(manifest)
        chosen_model = selected["models"]
        if chosen_model is None and info["needsModel"]:
            chosen_model = next((m for m in rows["models"] if catalog.select_model(manifest, [m], {"useModel": True})["status"] == "selected"), None)
        selection = catalog.select_model(manifest, [chosen_model] if chosen_model else [], {"useModel": True if chosen_model else False})
    except (TypeError, ValueError, KeyError, AttributeError):
        return _reply("ERROR", "Registry compatibility metadata is invalid.", errors=[ac.issue("invalid_registry", "Invalid compatibility metadata.")])
    if selection["status"] == "conflict":
        return _reply("ERROR", "Chosen Model does not match Player.", errors=[ac.issue("incompatible_model", "No compatible Model/mapping.", "model")])
    model = ({"model_id": chosen_model["id"], "kind": chosen_model["kind"], "mapping": selection["mapping"], "sure": .8, "hold_ms": 800}
             if selection["status"] == "selected" else None)
    exam = selected["exams"]
    if info["gameKind"] == "questions":
        if exam is None:
            if registry is not None or ("selected_exam_id" in payload and payload["selected_exam_id"] is None):
                return _reply("ASK_CLARIFY", "Bạn muốn dùng bộ đề nào trong danh mục được cấp quyền?")
            exam = rows["exams"][0] if rows["exams"] else None
        if exam is None:
            return _reply("ASK_CLARIFY", "Bạn muốn dùng bộ đề nào trong danh mục được cấp quyền?")
        exam_plan = {"mode": "reuse_existing", "exam_id": exam["id"], "content": exam.get("content")}
    else:
        if exam is not None:
            return _reply("ERROR", "List Player does not accept the selected Exam.", errors=[ac.issue("incompatible_exam", "Clear Exam or select a question Player.", "exam")])
        exam_plan = None
    if generate:
        html = (llm.WHEEL_TEMPLATE if is_list else llm.QUIZ_TEMPLATE).replace("__TITLE__", "Simulated T06 draft")
        html = contract.BLOCK_RE.sub(lambda m: '<script type="application/json" id="jl-camera">' + json.dumps(manifest) + '</script>', html, count=1)
        player_plan = {"mode": "generate_new", "player_id": None, "html": html}
    else:
        player_plan = {"mode": "reuse_existing", "player_id": player["id"], "html": None}
    plan = {"name": "Game nháp mô phỏng T06", "player": player_plan, "model": model, "exam": exam_plan,
            "interaction": {"primary": model["kind"] if model else "mouse", "fallback": "mouse", "mouse_always_enabled": True}}
    invalid = ac.validate_application_plan(plan, trusted)
    if invalid:
        return _reply("ERROR", "Mock plan failed Contract validation.", errors=invalid)
    warnings = [{"code": "simulated_fixture", "message": "Mock fixture/template only; not AI generation or production resource IDs."}]
    if exam_plan is not None:
        warnings.append({"code": "knowledge_review_required", "message": "Giáo viên phải kiểm duyệt câu hỏi, đáp án và nguồn; parser/mock không xác minh kiến thức. Bộ đề fixture không phải bằng chứng sinh đề AI thật."})
    return _reply("GENERATE" if generate else "REUSE", "Bản nháp giả lập chờ giáo viên duyệt; chưa lưu hoặc xuất bản.", plan=plan, warnings=warnings)
