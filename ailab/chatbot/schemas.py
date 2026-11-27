"""C01 — Cấu trúc dữ liệu và bộ kiểm cho chatbot. Chỉ thư viện chuẩn, không framework.

Nguyên tắc:
- Whitelist (chỉ nhận trường đã biết); trường lạ bị bỏ, không lỗi.
- Trình duyệt và LLM KHÔNG được tự gán quyền, duyệt, trạng thái ready hay ID kết quả.
- Phản hồi công khai không bao giờ chứa HTML của game hay khóa bí mật.
- Giữ tương thích UI cũ: reply.text/role/simulated/model và reply.error là CHUỖI.

Hợp đồng: docs/chatbot/AI_INTEGRATION_CONTRACT.md, quyết định: docs/chatbot/G0_DECISIONS.md.
"""
import copy
import json
import re

SCHEMA_VERSION = 1

ACTIONS = ("message", "confirm_plan", "accept_result", "reject_result", "cancel_plan")
STATUSES = ("clarifying", "awaiting_confirmation", "awaiting_review", "needs_revision", "ready", "error")
INTENTS = ("new_request", "update", "confirm_intent", "reject_intent", "question", "off_topic")
SOURCE_KINDS = ("topic", "document", "existing_exam", "provided_questions")
GAME_MODES = ("auto", "reuse_existing", "generate_new")
INTERACTION_KINDS = ("image", "pose", "hands", "audio")
CHECK_NAMES = ("schema", "permissions", "examFormat", "contentGrounding", "answerReview", "compatibility",
               "htmlContract", "codeSafety", "runtime", "mouseFallback", "teacherApproval")
CHECK_STATUSES = ("passed", "failed", "not_checked")
ERROR_CODES = ("invalid_input", "stale_version", "forbidden_resource", "incompatible_model", "incompatible_exam",
               "unsupported_interaction", "document_rejected", "invalid_model_output", "model_unavailable",
               "validation_failed", "persistence_failed", "legacy")

TEXT_MIN, TEXT_MAX = 3, 2000
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
PROPOSAL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
MAX_DOCUMENTS = 5

# Khóa mà LLM hoặc trình duyệt không bao giờ được tự đặt — nếu xuất hiện thì bị bỏ.
FORBIDDEN_KEYS = ("userId", "user", "role", "teacherApproved", "approval", "approved", "appId", "playUrl",
                  "result", "status", "stateVersion", "proposalId", "version", "playerModeration", "share", "html")


def _err(field, code, message):
    return {"field": field, "code": code, "message": message}


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _opt_str(v, max_len):
    """Chuỗi đã strip, chuỗi rỗng -> None. Sai kiểu hoặc quá dài -> ValueError."""
    if v is None:
        return None
    if not isinstance(v, str):
        raise ValueError("phải là chuỗi")
    v = v.strip()
    if len(v) > max_len:
        raise ValueError("tối đa %d ký tự" % max_len)
    return v or None


def _opt_int(v, lo, hi):
    if v is None:
        return None
    if isinstance(v, str) and v.strip().isdigit():
        v = int(v.strip())
    if not _is_int(v) or not (lo <= v <= hi):
        raise ValueError("phải là số nguyên %d–%d" % (lo, hi))
    return v


def _id_list(v, max_n):
    if v is None:
        return []
    if not isinstance(v, list) or len(v) > max_n or not all(_is_int(x) and x > 0 for x in v):
        raise ValueError("phải là danh sách tối đa %d số nguyên dương" % max_n)
    out = []
    for x in v:
        if x not in out:
            out.append(x)
    return out


# ---------------------------------------------------------------- yêu cầu của giáo viên
def empty_requirements():
    return {
        "subject": None, "gradeOrAudience": None, "topic": None, "learningGoal": None,
        "questionCount": None, "difficulty": None,
        "contentSource": {"kind": None, "documentIds": [], "examId": None},
        "gamePreference": {"mode": "auto", "playerId": None, "description": None},
        "interaction": {"mouse": True, "requestedKinds": [], "useModel": None},
        "constraints": {"durationSeconds": None, "scoring": None, "other": []},
    }


_STR_FIELDS = {"subject": 120, "gradeOrAudience": 120, "topic": 200, "learningGoal": 500, "difficulty": 60}


def validate_requirements_patch(patch):
    """Kiểm một bản vá yêu cầu (một phần). Trả (patch_sạch, errors).

    Chỉ giữ trường được nhắc và hợp lệ; trường sai bị bỏ và ghi vào errors — không làm hỏng trường khác.
    Không có trường nào được xoá dữ liệu cũ chỉ vì vắng mặt (việc hợp nhất làm ở conversation.merge_requirements).
    interaction.mouse luôn True: bản vá không đặt được False.
    """
    errors, out = [], {}
    if patch is None:
        return out, errors
    if not isinstance(patch, dict):
        return out, [_err("requirements", "invalid_input", "Yêu cầu phải là một đối tượng.")]

    def take(path, fn):
        try:
            return True, fn()
        except ValueError as e:
            errors.append(_err(path, "invalid_input", "%s %s." % (path, e)))
            return False, None

    for k, n in _STR_FIELDS.items():
        if k in patch:
            ok, v = take(k, lambda: _opt_str(patch[k], n))
            if ok:
                out[k] = v
    if "questionCount" in patch:
        ok, v = take("questionCount", lambda: _opt_int(patch["questionCount"], 1, 200))
        if ok:
            out["questionCount"] = v

    def sub(name, rules):
        raw = patch.get(name)
        if name not in patch:
            return
        if raw is None:
            return
        if not isinstance(raw, dict):
            errors.append(_err(name, "invalid_input", "%s phải là một đối tượng." % name))
            return
        part = {}
        for key, fn in rules.items():
            if key in raw:
                ok, v = take("%s.%s" % (name, key), lambda: fn(raw[key]))
                if ok:
                    part[key] = v
        if part:
            out[name] = part

    def enum(values, allow_none=True):
        def f(v):
            if v is None and allow_none:
                return None
            if v not in values:
                raise ValueError("chỉ nhận " + ", ".join(values))
            return v
        return f

    def kinds(v):
        if not isinstance(v, list) or any(x not in INTERACTION_KINDS for x in v):
            raise ValueError("chỉ gồm " + ", ".join(INTERACTION_KINDS))
        return [x for i, x in enumerate(v) if x not in v[:i]]

    def opt_bool(v):
        if v is not None and not isinstance(v, bool):
            raise ValueError("phải là true/false hoặc null")
        return v

    def str_list(v):
        if v is None:
            return []
        if not isinstance(v, list) or len(v) > 10 or not all(isinstance(x, str) and len(x.strip()) <= 200 for x in v):
            raise ValueError("phải là danh sách tối đa 10 chuỗi, mỗi chuỗi ≤ 200 ký tự")
        return [x.strip() for x in v if x.strip()]

    sub("contentSource", {"kind": enum(SOURCE_KINDS), "documentIds": lambda v: _id_list(v, MAX_DOCUMENTS),
                          "examId": lambda v: _opt_int(v, 1, 2 ** 31)})
    sub("gamePreference", {"mode": enum(GAME_MODES, allow_none=False), "playerId": lambda v: _opt_int(v, 1, 2 ** 31),
                           "description": lambda v: _opt_str(v, 1000)})
    sub("interaction", {"requestedKinds": kinds, "useModel": opt_bool})
    sub("constraints", {"durationSeconds": lambda v: _opt_int(v, 10, 7200), "scoring": lambda v: _opt_str(v, 200),
                        "other": str_list})
    return out, errors


def normalize_requirements(data):
    """Dữ liệu bất kỳ (state cũ, JSON lưu trong DB) -> TeacherRequirements đầy đủ khóa. Trường sai thành mặc định."""
    req = empty_requirements()
    clean, _ = validate_requirements_patch(data if isinstance(data, dict) else {})
    for k, v in clean.items():
        if isinstance(v, dict):
            req[k].update(v)
        else:
            req[k] = v
    req["interaction"]["mouse"] = True
    return req


# ---------------------------------------------------------------- yêu cầu từ trình duyệt
def validate_request(payload):
    """Đầu vào POST /api/chat hoặc /actions. Trả (request, errors). errors rỗng mới được xử lý.

    request = {action, chatId, text, requestId, expectedVersion, documentIds, proposalId, version}
    Trường lạ (kể cả userId, teacherApproved, status…) bị bỏ qua: quyền lấy từ phiên đăng nhập, không lấy từ client.
    """
    errors = []
    if not isinstance(payload, dict):
        return None, [_err("body", "invalid_input", "Dữ liệu gửi lên phải là một đối tượng JSON.")]
    req = {"action": "message", "chatId": None, "text": None, "requestId": None, "expectedVersion": None,
           "documentIds": [], "proposalId": None, "version": None}

    action = payload.get("action", "message")
    if action in (None, ""):
        action = "message"
    if action not in ACTIONS:
        errors.append(_err("action", "invalid_input", "action chỉ nhận: " + ", ".join(ACTIONS) + "."))
    req["action"] = action

    cid = payload.get("chatId")
    if cid not in (None, "", 0):
        try:
            req["chatId"] = _opt_int(cid, 1, 2 ** 31)
        except ValueError:
            errors.append(_err("chatId", "invalid_input", "chatId không hợp lệ."))

    rid = payload.get("requestId")
    if rid not in (None, ""):
        if not isinstance(rid, str) or not REQUEST_ID_RE.match(rid):
            errors.append(_err("requestId", "invalid_input", "requestId dài 8–64 ký tự: chữ, số, - hoặc _."))
        else:
            req["requestId"] = rid

    ev = payload.get("expectedVersion")
    if ev is not None:
        try:
            req["expectedVersion"] = _opt_int(ev, 0, 2 ** 31)
        except ValueError:
            errors.append(_err("expectedVersion", "invalid_input", "expectedVersion phải là số nguyên ≥ 0."))

    if action == "message":
        text = payload.get("text")
        text = text.strip() if isinstance(text, str) else ""
        if not (TEXT_MIN <= len(text) <= TEXT_MAX):
            errors.append(_err("text", "invalid_input", "Hãy nhắn dài %d–%d ký tự." % (TEXT_MIN, TEXT_MAX)))
        req["text"] = text
        try:
            req["documentIds"] = _id_list(payload.get("documentIds"), MAX_DOCUMENTS)
        except ValueError as e:
            errors.append(_err("documentIds", "invalid_input", "documentIds %s." % e))
    elif action in ACTIONS:
        pid = payload.get("proposalId")
        if not isinstance(pid, str) or not PROPOSAL_ID_RE.match(pid):
            errors.append(_err("proposalId", "invalid_input", "Thiếu hoặc sai proposalId."))
        else:
            req["proposalId"] = pid
        try:
            req["version"] = _opt_int(payload.get("version"), 1, 2 ** 31)
        except ValueError:
            pass
        if req["version"] is None:
            errors.append(_err("version", "invalid_input", "Thao tác này cần version của phương án."))
        if req["chatId"] is None:
            errors.append(_err("chatId", "invalid_input", "Thao tác này cần chatId."))
    return req, errors


# ---------------------------------------------------------------- đầu ra của LLM (phân tích lượt hội thoại)
FENCE = chr(96) * 3
_JSON_FENCE_RE = re.compile(FENCE + r"(?:json)?\s*\n(.*?)" + FENCE, re.S | re.I)


def _extract_json(raw):
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise ValueError("Đầu ra model không phải văn bản.")
    s = raw.strip()
    m = _JSON_FENCE_RE.search(s)
    if m:
        s = m.group(1).strip()
    elif not s.startswith("{"):
        a, b = s.find("{"), s.rfind("}")
        if a < 0 or b <= a:
            raise ValueError("Không thấy đối tượng JSON trong đầu ra model.")
        s = s[a:b + 1]
    try:
        d = json.loads(s)
    except ValueError:
        raise ValueError("JSON trong đầu ra model bị hỏng.")
    if not isinstance(d, dict):
        raise ValueError("Đầu ra model phải là một đối tượng JSON.")
    return d


def validate_model_output(raw):
    """Đầu ra LLM cho một lượt hội thoại -> (output, errors).

    output = {intent, reply, requirementsPatch, assumptions[], questions[{field,text}], route{mode,playerId}|None}
    errors không rỗng ở mức 'invalid_model_output' nghĩa là phải sửa/gọi lại (tối đa 1 lần, G0 §5).
    Model không đặt được duyệt, trạng thái, ID kết quả: các khóa đó bị bỏ và ghi vào output['dropped'].
    """
    try:
        d = _extract_json(raw)
    except ValueError as e:
        return None, [_err("model", "invalid_model_output", str(e))]
    errors = []
    out = {"intent": None, "reply": "", "requirementsPatch": {}, "assumptions": [], "questions": [], "route": None,
           "dropped": sorted(k for k in d if k in FORBIDDEN_KEYS)}

    intent = d.get("intent")
    if intent not in INTENTS:
        errors.append(_err("intent", "invalid_model_output", "intent chỉ nhận: " + ", ".join(INTENTS) + "."))
    out["intent"] = intent if intent in INTENTS else None

    reply = d.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        errors.append(_err("reply", "invalid_model_output", "Thiếu lời nhắn reply cho giáo viên."))
    else:
        out["reply"] = reply.strip()[:4000]

    patch = d.get("requirementsPatch", d.get("requirements"))
    if isinstance(patch, dict):
        patch = {k: v for k, v in patch.items() if k not in FORBIDDEN_KEYS}
    clean, perr = validate_requirements_patch(patch)
    out["requirementsPatch"] = clean
    out["patchErrors"] = perr  # trường sai bị bỏ, không chặn cả lượt

    a = d.get("assumptions") or []
    if isinstance(a, list):
        out["assumptions"] = [x.strip()[:300] for x in a if isinstance(x, str) and x.strip()][:10]

    qs = d.get("questions") or []
    if isinstance(qs, list):
        for q in qs[:5]:
            if isinstance(q, dict) and isinstance(q.get("text"), str) and q["text"].strip():
                f = q.get("field") if isinstance(q.get("field"), str) else None
                out["questions"].append({"field": f, "text": q["text"].strip()[:300]})

    r = d.get("route")
    if isinstance(r, dict):
        mode = r.get("mode")
        pid = r.get("playerId")
        if mode in GAME_MODES and (pid is None or (_is_int(pid) and pid > 0)):
            out["route"] = {"mode": mode, "playerId": pid}  # ID chỉ là gợi ý: catalog đối chiếu lại với danh mục thật
        else:
            out["patchErrors"].append(_err("route", "invalid_input", "route không hợp lệ, đã bỏ."))
    return out, errors


# ---------------------------------------------------------------- kiểm tra và lỗi
def make_check(name, status, required=True, reason="", evidence_ref=None):
    if name not in CHECK_NAMES:
        raise ValueError("check lạ: %s" % name)
    if status not in CHECK_STATUSES:
        raise ValueError("status check lạ: %s" % status)
    return {"name": name, "status": status, "required": bool(required), "reason": reason, "evidenceRef": evidence_ref}


def make_validation(checks, warnings=None):
    """overall: failed nếu có check bắt buộc failed; not_checked nếu còn check bắt buộc chưa kiểm; ngược lại passed.
    Danh sách rỗng -> not_checked (chưa kiểm gì thì không được coi là đạt)."""
    req = [c for c in checks if c["required"]]
    if any(c["status"] == "failed" for c in req):
        overall = "failed"
    elif not req or any(c["status"] == "not_checked" for c in req):
        overall = "not_checked"
    else:
        overall = "passed"
    return {"overall": overall, "checks": list(checks), "warnings": list(warnings or [])}


def make_error(code, stage, message, retryable=False, details=None):
    if code not in ERROR_CODES:
        raise ValueError("mã lỗi lạ: %s" % code)
    return {"code": code, "stage": stage, "message": message, "retryable": bool(retryable), "details": dict(details or {})}


def normalize_failure(v):
    """Lỗi kiểu cũ (chuỗi) hoặc mới (dict) -> ChatError | None. Dùng khi đọc tin nhắn/state cũ."""
    if v in (None, ""):
        return None
    if isinstance(v, str):
        return make_error("legacy", "unknown", v)
    if isinstance(v, dict) and isinstance(v.get("message"), str):
        code = v.get("code") if v.get("code") in ERROR_CODES else "legacy"
        return make_error(code, str(v.get("stage") or "unknown"), v["message"], v.get("retryable") is True,
                          v.get("details") if isinstance(v.get("details"), dict) else None)
    return make_error("legacy", "unknown", "Có lỗi không rõ.")


# ---------------------------------------------------------------- state và phản hồi công khai
def new_state():
    return {"schema": SCHEMA_VERSION, "version": 0, "status": "clarifying", "requirements": empty_requirements(),
            "assumptions": [], "missingFields": [], "questions": [], "proposal": None, "confirmations": {},
            "validation": None, "result": None}


def normalize_state(data):
    """State đọc từ DB (có thể thiếu khóa / phiên bản cũ) -> state đủ khóa. Không ném lỗi với dữ liệu cũ."""
    s = new_state()
    if not isinstance(data, dict):
        return s
    if _is_int(data.get("version")) and data["version"] >= 0:
        s["version"] = data["version"]
    if data.get("status") in STATUSES:
        s["status"] = data["status"]
    s["requirements"] = normalize_requirements(data.get("requirements"))
    for k in ("assumptions", "missingFields", "questions"):
        if isinstance(data.get(k), list):
            s[k] = copy.deepcopy(data[k])
    for k in ("proposal", "validation", "result"):
        if isinstance(data.get(k), dict):
            s[k] = copy.deepcopy(data[k])
    if isinstance(data.get("confirmations"), dict):
        s["confirmations"] = copy.deepcopy(data["confirmations"])
    return s


# ---------------------------------------------------------------- bộ lọc công khai theo WHITELIST
# Mỗi cấp chỉ giữ trường có trong danh sách cho phép. Trường lạ (html, srcdoc, apiKey, token…) tự bị bỏ
# mà không cần biết tên trước. Trường nghiệp vụ như choices[].key, inputs[].key, warnings[].excerpt được giữ.
SECRET_RE = re.compile(r"(?:sk-(?:ant-)?[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|(?i:bearer)\s+[A-Za-z0-9._~+/=-]{8,}"
                       r"|(?i:api[_-]?key)\s*[:=]\s*\S+)")
MAX_PUBLIC_TEXT = 4000
EXCERPT_MAX = 300


def redact(v, max_len=MAX_PUBLIC_TEXT):
    """Chuỗi công khai: che giá trị trông như khóa bí mật (sk-…, AIza…, Bearer …, api_key=…), cắt độ dài."""
    if not isinstance(v, str):
        return None
    return SECRET_RE.sub("[đã che]", v)[:max_len]


def _scalar(v, max_len=MAX_PUBLIC_TEXT):
    if v is None or isinstance(v, bool) or _is_int(v) or isinstance(v, float):
        return v
    if isinstance(v, str):
        return redact(v, max_len)
    return None


def _pick(d, spec):
    """spec: {key: hàm_lọc}. Chỉ giữ khóa có trong spec và có mặt trong d. Không sửa d."""
    if not isinstance(d, dict):
        return None
    out = {}
    for k, fn in spec.items():
        if k in d:
            out[k] = fn(d[k])
    return out


def _list_of(fn, max_n=500):
    def f(v):
        if not isinstance(v, list):
            return []
        return [x for x in (fn(y) for y in v[:max_n]) if x is not None]
    return f


def _obj(spec):
    return lambda v: _pick(v, spec)


def _str_list(v):
    return _list_of(lambda x: redact(x, 300) if isinstance(x, str) else None, 50)(v)


def _str_map(v):
    """mapping {ô của game: lớp của model} — chỉ chuỗi -> chuỗi."""
    if not isinstance(v, dict):
        return {}
    return {k[:60]: x[:60] for k, x in v.items() if isinstance(k, str) and isinstance(x, str)}


S_ = _scalar
# reason: lý do cảnh báo mà contract.scan() trả cho từng cờ — giáo viên cần đọc để quyết định duyệt.
WARNING = {"code": S_, "label": S_, "reason": S_, "message": S_, "line": S_,
           "excerpt": lambda v: _scalar(v, EXCERPT_MAX)}
CHECK = {"name": S_, "status": S_, "required": S_, "reason": S_, "evidenceRef": S_}
VALIDATION = {"overall": S_, "checks": _list_of(_obj(CHECK)), "warnings": _list_of(_obj(WARNING))}
MANIFEST = {
    "name": S_, "description": S_, "kinds": _str_list, "questions": S_, "setup": S_,
    "inputs": _list_of(_obj({"key": S_, "label": S_, "required": S_, "accepts": _str_list})),
    "content": _obj({"kind": S_, "label": S_, "min": S_, "max": S_}),
    "demo": _obj({"content": _list_of(_obj({"id": S_, "text": S_}))}),
}
SOURCE_REF = {
    "sourceId": lambda v: redact(v) if isinstance(v, str) else None,
    "start": lambda v: v if _is_int(v) and v >= 0 else None,
    "end": lambda v: v if _is_int(v) and v >= 0 else None,
    # Legacy references remain readable; C04 offsets are not inferred from them.
    "documentId": S_, "kind": S_, "page": S_, "paragraph": S_, "locator": S_,
    "quote": lambda v: _scalar(v, 500),
}
EXAM_QUESTION = {"id": S_, "type": S_, "text": S_, "answer": S_, "explanation": S_, "uncertain": S_, "note": S_,
                 "aiGenerated": lambda v: v if isinstance(v, bool) else None,
                 "choices": _list_of(_obj({"key": S_, "text": S_})), "sourceRefs": _list_of(_obj(SOURCE_REF))}
PROPOSAL = {
    "proposalId": S_, "version": S_, "status": S_, "kind": S_, "scope": S_, "simulated": S_, "generationMode": S_, "reason": S_,
    "assumptions": _str_list, "changes": _str_list,
    "player": _obj({"playerId": S_, "name": S_, "plan": S_, "manifest": _obj(MANIFEST), "htmlHash": S_,
                    "status": S_, "source": S_}),
    "exam": _obj({"examId": S_, "name": S_, "questionCount": S_, "contentHash": S_, "shared": S_,
                  "questions": _list_of(_obj(EXAM_QUESTION), 200)}),
    "interactionModel": _obj({"modelId": S_, "name": S_, "kind": S_, "mapping": _str_map, "sure": S_,
                              "holdMs": S_, "mouse": S_}),
    "warnings": _list_of(_obj(WARNING)),
    "validation": _obj(VALIDATION),
}
RESULT = {
    "generationMode": S_, "playerId": S_, "examId": S_, "modelId": S_, "appId": S_, "playUrl": S_,
    "controls": _obj({"mouse": S_, "modelKind": S_}),
    "approval": _obj({"teacher": S_, "proposalVersion": S_, "playerModeration": S_}),
}
FAILURE_DETAILS = {"field": S_, "fields": _str_list, "expectedVersion": S_, "currentVersion": S_, "line": S_,
                   "limit": S_, "resource": S_, "resourceId": S_, "reasons": _str_list, "retryAfterSeconds": S_}
FAILURE = {"code": S_, "stage": S_, "message": S_, "retryable": S_, "details": lambda v: _pick(v, FAILURE_DETAILS) or {}}
QUESTION = {"field": S_, "text": S_}


def to_public_proposal(p):
    """GameProposal cho trình duyệt, lọc theo whitelist PROPOSAL. Không chứa HTML; chỉ có htmlHash."""
    return _pick(p, PROPOSAL)


def to_public_validation(v):
    return _pick(v, VALIDATION)


def to_public_result(r):
    return _pick(r, RESULT)


def to_public_failure(f):
    return _pick(f, FAILURE)


def to_public_reply(state, text, simulated, model, failure=None):
    """Tin nhắn bot gửi trình duyệt, tương thích UI cũ.

    - role/text/simulated/model như cũ.
    - error: CHUỖI (chỉ có khi lỗi) — UI cũ đọc được; failure: ChatError có cấu trúc.
    - Mọi phần lồng nhau (proposal, validation, result, failure.details) lọc theo whitelist; chuỗi được che khóa.
    - Không sửa state đầu vào.
    """
    s = normalize_state(state)  # normalize_state đã deepcopy; các bộ lọc tạo đối tượng mới
    f = to_public_failure(normalize_failure(failure))
    reply = {
        "role": "bot",
        "text": redact(text) if isinstance(text, str) else "",
        "simulated": bool(simulated),
        "model": redact(model, 120) if isinstance(model, str) else "",
        "status": s["status"],  # trạng thái do workflow đặt trong state; client không tự đặt được
        "stateVersion": s["version"],
        "requirements": s["requirements"],
        "missingFields": _str_list(s["missingFields"]),
        "questions": _list_of(_obj(QUESTION), 5)(s["questions"]),
        "assumptions": _str_list(s["assumptions"]),
        "proposal": to_public_proposal(s["proposal"]),
        "validation": to_public_validation(s["validation"]),
        "result": to_public_result(s["result"]),
        "failure": f,
    }
    if f:
        reply["error"] = f["message"]
    return reply
