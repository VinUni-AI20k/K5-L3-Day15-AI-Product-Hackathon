"""C04: prepare Exam drafts, never persist or certify subject knowledge.

Sources must already be authorized by the calling adapter. Metadata remains in
the draft because the legacy Exam text format cannot store provenance.
"""
import copy
import unicodedata

import store


_BREAKS = "\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029"
_META_CODES = {"missing_explanation"}


def _issue(code, message, index=None, field=""):
    return {"code": code, "message": message, "questionIndex": index, "field": field}


def _integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _norm(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _list_game(manifest):
    return (isinstance(manifest, dict) and manifest.get("questions") != "exam"
            and isinstance(manifest.get("content"), dict)
            and manifest["content"].get("kind") == "texts")


def _result(status, exam=None, issues=None, **checks):
    validation = dict.fromkeys(("examFormat", "contentGrounding", "answerReview", "compatibility"), "not_checked")
    validation.update(checks)
    return {"status": status, "exam": copy.deepcopy(exam), "issues": issues or [], "validation": validation}


def validate_exam_questions(draft, *, manifest=None, question_count=None):
    """Return structural, metadata and Player compatibility issues; no mutation."""
    issues = []
    if not isinstance(draft, dict):
        return [_issue("invalid_input", "Bản nháp phải là object.", field="exam")]
    name, desc = draft.get("name"), draft.get("description", "")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        issues.append(_issue("invalid_format", "Tên bộ đề cần 1–80 ký tự.", field="name"))
    if not isinstance(desc, str) or len(desc) > 300:
        issues.append(_issue("invalid_format", "Mô tả tối đa 300 ký tự.", field="description"))
    questions = draft.get("questions")
    if not isinstance(questions, list):
        return issues + [_issue("invalid_input", "questions phải là danh sách.", field="questions")]
    if not 1 <= len(questions) <= 200:
        issues.append(_issue("invalid_question_count", "Bộ đề cần 1–200 câu.", field="questions"))
    if question_count is not None and (not _integer(question_count) or not 1 <= question_count <= 200 or question_count != len(questions)):
        issues.append(_issue("invalid_question_count", "Số câu yêu cầu không hợp lệ hoặc không khớp.", field="questionCount"))
    seen = set()
    for index, q in enumerate(questions):
        if not isinstance(q, dict):
            issues.append(_issue("invalid_format", "Câu hỏi phải là object.", index, "questions"))
            continue
        text = q.get("text")
        if not isinstance(text, str) or not text.strip():
            issues.append(_issue("invalid_format", "Nội dung câu hỏi không được rỗng.", index, "text"))
        else:
            if "|" in text or any(c in text for c in _BREAKS) or text.strip().startswith("="):
                issues.append(_issue("unrepresentable_text", "Nội dung không biểu diễn được trong định dạng bộ đề.", index, "text"))
            token = _norm(text)
            if token in seen:
                issues.append(_issue("duplicate_question", "Câu hỏi bị trùng.", index, "text"))
            seen.add(token)
        choices = q.get("choices")
        if not isinstance(choices, list):
            issues.append(_issue("invalid_format", "choices phải là danh sách.", index, "choices"))
            choices = []
        keys, choice_seen = [], set()
        for choice in choices:
            if not isinstance(choice, dict):
                issues.append(_issue("invalid_format", "Lựa chọn phải là object.", index, "choices"))
                keys.append(None)
                continue
            key, value = choice.get("key"), choice.get("text")
            keys.append(key)
            if not isinstance(value, str) or not value.strip():
                issues.append(_issue("empty_choice", "Lựa chọn không được rỗng.", index, "choices"))
            else:
                if "|" in value or any(c in value for c in _BREAKS) or value.strip().startswith("="):
                    issues.append(_issue("unrepresentable_text", "Lựa chọn không biểu diễn được trong định dạng bộ đề.", index, "choices"))
                token = _norm(value)
                if token in choice_seen:
                    issues.append(_issue("duplicate_choice", "Lựa chọn bị trùng.", index, "choices"))
                choice_seen.add(token)
        kind = q.get("type")
        if kind == "single":
            if not 2 <= len(choices) <= 6 or keys != list("ABCDEF"[:len(choices)]):
                issues.append(_issue("invalid_format", "Câu single cần 2–6 lựa chọn với khóa A..F đúng thứ tự.", index, "choices"))
        elif kind == "truefalse":
            if choices != [{"key": "T", "text": "Đúng"}, {"key": "F", "text": "Sai"}]:
                issues.append(_issue("invalid_format", "Câu Đúng/Sai cần hai lựa chọn T/Đúng và F/Sai.", index, "choices"))
        else:
            issues.append(_issue("invalid_format", "Loại câu hỏi không được hỗ trợ.", index, "type"))
        if not isinstance(q.get("answer"), str) or q["answer"] not in keys:
            issues.append(_issue("invalid_answer", "Đáp án phải thuộc khóa lựa chọn.", index, "answer"))
        if not isinstance(q.get("explanation"), str) or not q["explanation"].strip():
            issues.append(_issue("missing_explanation", "Cần giải thích để giáo viên xem lại.", index, "explanation"))
        if not isinstance(q.get("aiGenerated"), bool):
            issues.append(_issue("invalid_format", "aiGenerated phải là boolean.", index, "aiGenerated"))
    if manifest is not None:
        if not isinstance(manifest, dict):
            issues.append(_issue("incompatible_exam", "Manifest Player không hợp lệ.", field="manifest"))
        elif not _list_game(manifest):
            content_kind = manifest.get("content", {})
            if manifest.get("questions") != "exam" and not (isinstance(content_kind, dict) and content_kind.get("kind") == "questions"):
                issues.append(_issue("incompatible_exam", "Player không khai báo nhận bộ đề câu hỏi.", field="manifest"))
            inputs = manifest.get("inputs", [])
            if not isinstance(inputs, list) or any(not isinstance(x, dict) or not isinstance(x.get("key"), str) for x in inputs):
                issues.append(_issue("incompatible_exam", "Các khóa Player không hợp lệ.", field="manifest"))
            elif inputs:
                available = {x["key"] for x in inputs}
                for index, q in enumerate(questions):
                    if isinstance(q, dict) and isinstance(q.get("choices"), list):
                        if any(not isinstance(x, dict) or not isinstance(x.get("key"), str) or x["key"] not in available for x in q["choices"]):
                            issues.append(_issue("incompatible_exam", "Player không nhận đủ khóa lựa chọn; cần giáo viên chọn cách xử lý.", index, "choices"))
            content = manifest.get("content", {})
            if isinstance(content, dict) and content.get("kind") == "questions":
                lo, hi = content.get("min", 1), content.get("max", 200)
                if not _integer(lo) or not _integer(hi) or not 1 <= lo <= hi <= 200 or not lo <= len(questions) <= hi:
                    issues.append(_issue("incompatible_exam", "Số câu không phù hợp giới hạn Player.", field="questionCount"))
    return issues


def _projection(q):
    return {"type": q["type"], "text": q["text"].strip(),
            "choices": [{"key": c["key"], "text": c["text"].strip()} for c in q["choices"]], "answer": q["answer"]}


def serialize_exam(draft):
    """Serialize with a real parser/cleaner round-trip; raise ValueError on loss."""
    errors = [i for i in validate_exam_questions(draft) if i["code"] not in _META_CODES]
    if errors:
        raise ValueError(errors[0]["message"])
    lines = []
    for q in draft["questions"]:
        if q["type"] == "truefalse":
            lines.append(q["text"].strip() + " | =" + ("Đúng" if q["answer"] == "T" else "Sai"))
        else:
            lines.append(" | ".join([q["text"].strip()] + [c["text"].strip() for c in q["choices"]] + ["=" + q["answer"]]))
    content = "\n".join(lines)
    try:
        store.clean_exam({"name": draft["name"], "description": draft.get("description", ""), "content": content})
        parsed = store.parse_questions(content)
    except store.Err as exc:
        raise ValueError("Bộ đề không qua bộ kiểm tra định dạng nền tảng.") from exc
    if [_projection(q) for q in parsed] != [_projection(q) for q in draft["questions"]]:
        raise ValueError("Round-trip làm thay đổi nội dung câu hỏi.")
    return content


def review_grounding(draft, sources):
    """Check reference integrity only, never factual truth or teacher approval."""
    issues, source_map, ambiguous = [], {}, set()
    if not isinstance(sources, list):
        sources = []
        issues.append(_issue("invalid_source", "sources phải là danh sách đoạn văn được cấp quyền.", field="sources"))
    for source in sources:
        if (not isinstance(source, dict) or not isinstance(source.get("id"), str) or not source["id"].strip()
                or not isinstance(source.get("text"), str) or not source["text"].strip()
                or source.get("kind") not in ("provided_text", "fixture")
                or not isinstance(source.get("label"), str) or not source["label"].strip()):
            issues.append(_issue("invalid_source", "Metadata nguồn không hợp lệ.", field="sources"))
            continue
        sid = source["id"]
        if sid in source_map:
            ambiguous.add(sid)
            issues.append(_issue("invalid_source", "ID nguồn bị trùng.", field="sources"))
        source_map[sid] = source
    questions = draft.get("questions", []) if isinstance(draft, dict) else []
    if not isinstance(questions, list):
        return issues + [_issue("invalid_source", "Không có danh sách câu hỏi để kiểm nguồn.", field="questions")]
    for index, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        if q.get("aiGenerated") is True:
            issues.append(_issue("ai_generated", "Câu AI tự sinh, cần giáo viên kiểm kiến thức/đáp án.", index, "aiGenerated"))
        refs = q.get("sourceRefs")
        if not isinstance(refs, list):
            issues.append(_issue("invalid_source", "sourceRefs phải là danh sách.", index, "sourceRefs"))
            continue
        if not refs and q.get("aiGenerated") is not True:
            issues.append(_issue("missing_source", "Câu hỏi chưa có nguồn căn cứ.", index, "sourceRefs"))
        for ref in refs:
            if not isinstance(ref, dict) or not isinstance(ref.get("sourceId"), str):
                issues.append(_issue("invalid_source", "Tham chiếu nguồn không hợp lệ.", index, "sourceRefs"))
                continue
            source = source_map.get(ref["sourceId"])
            start, end, quote = ref.get("start"), ref.get("end"), ref.get("quote")
            if (source is None or ref["sourceId"] in ambiguous or not _integer(start) or not _integer(end)
                    or not isinstance(quote, str) or not 0 <= start < end <= len(source["text"])
                    or source["text"][start:end] != quote):
                issues.append(_issue("invalid_source", "Nguồn/đoạn trích/vị trí không khớp dữ liệu được cấp.", index, "sourceRefs"))
            elif source["kind"] == "fixture":
                issues.append(_issue("simulated_source", "Nguồn fixture mô phỏng; chưa phải trích xuất PDF/DOCX thật.", index, "sourceRefs"))
    return issues


def prepare_exam(req, sources, existing=None):
    """Prepare a copied draft from supplied questions; no generation or writes."""
    if not isinstance(req, dict):
        return _result("error", issues=[_issue("invalid_input", "Yêu cầu phải là object.", field="request")])
    manifest = req.get("manifest")
    manifest_kind = None
    if _list_game(manifest):
        manifest_kind = "list"
    elif isinstance(manifest, dict):
        content = manifest.get("content")
        if manifest.get("questions") == "exam" or (isinstance(content, dict) and content.get("kind") == "questions"):
            manifest_kind = "questions"
    explicit_kind = "gameKind" in req
    game_kind = req.get("gameKind") if explicit_kind else (manifest_kind or "questions")
    if game_kind not in ("questions", "list"):
        return _result("error", issues=[_issue("invalid_input", "Loại game không hợp lệ.", field="gameKind")])
    if explicit_kind and manifest_kind is not None and game_kind != manifest_kind:
        return _result("needs_revision", issues=[_issue("incompatible_exam", "Loại game yêu cầu không khớp Player đã chọn; cần giáo viên chọn cách xử lý.", field="gameKind")], compatibility="failed")
    if game_kind == "list":
        return _result("not_needed")
    base = existing if isinstance(existing, dict) else {}
    questions = req.get("questions", base.get("questions"))
    if not isinstance(questions, list):
        return _result("error", issues=[_issue("invalid_input", "Cần cung cấp câu hỏi có cấu trúc; chưa có sinh đề tự động.", field="questions")])
    exam = copy.deepcopy({"name": req.get("name", base.get("name")), "description": req.get("description", base.get("description", "")),
                          "questions": questions, "content": None, "examId": None})
    structural = validate_exam_questions(exam, manifest=manifest, question_count=req.get("questionCount"))
    grounding = review_grounding(exam, sources)
    issues = structural + grounding
    try:
        exam["content"] = serialize_exam(exam)
    except ValueError:
        if not any(i["code"] not in _META_CODES | {"incompatible_exam"} for i in structural):
            issues.append(_issue("invalid_format", "Nội dung không qua clean_exam/parser hoặc vượt giới hạn 40000 ký tự.", field="content"))
    return _result("needs_revision" if issues else "draft", exam, issues,
                   examFormat="passed" if exam["content"] is not None and not any(i["code"] not in _META_CODES | {"incompatible_exam"} for i in structural) else "failed",
                   contentGrounding="failed" if grounding else "passed",
                   compatibility=("not_checked" if manifest is None else "failed" if any(i["code"] == "incompatible_exam" for i in structural) else "passed"))


def load_exams(c, user):
    """Read authorized metadata only. Never commit or initialize a database."""
    cur = c.execute("SELECT id, owner_id, name, description, content FROM exams ORDER BY id")
    names = [d[0] for d in cur.description]
    result = []
    for values in cur.fetchall():
        row = dict(zip(names, values))
        if row["owner_id"] not in (user["id"], 0) and user["role"] != "admin":
            continue
        try:
            count = len(store.parse_questions(row["content"]))
        except (store.Err, TypeError, AttributeError):
            count = 0
        result.append({"id": row["id"], "name": row["name"], "description": row["description"], "count": count})
    return result


def select_exam(c, user, exam_id, *, manifest=None, question_count=None):
    """Authorize an existing Exam before producing an unsaved review draft."""
    if not _integer(exam_id) or exam_id <= 0:
        return _result("error", issues=[_issue("invalid_input", "ID bộ đề phải là số nguyên dương.", field="examId")])
    try:
        row = store.get_exam(c, exam_id, user)
    except store.Err:
        return _result("error", issues=[_issue("forbidden_resource", "Không thấy bộ đề hoặc bạn không có quyền dùng.", field="examId")])
    try:
        parsed = store.parse_questions(row["content"])
    except (store.Err, TypeError, AttributeError):
        return _result("needs_revision", issues=[_issue("invalid_format", "Bộ đề đã chọn sai định dạng.", field="content")], examFormat="failed")
    questions = []
    for q in parsed:
        questions.append(dict(_projection(q), id=q["id"], explanation="", sourceRefs=[], aiGenerated=False))
    result = prepare_exam({"name": row["name"], "description": row["description"], "questions": questions,
                           "manifest": manifest, "questionCount": question_count}, [])
    if result["exam"] is not None:
        result["exam"]["examId"] = exam_id
    return result
