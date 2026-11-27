"""T06 v1.0 Contract. Reuses committed C03/C04 and the existing check_game tool.

Registry arguments are trusted, caller-authorized snapshots, never client input.
No I02 modules, database, provider or persistence are imported here.
"""
import copy
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for _path in (_HERE, os.path.join(_ROOT, "ailab")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import contract
import store
from chatbot import catalog, exams, schemas
from tools import check_game

DECISIONS = ("REUSE", "GENERATE", "ASK_CLARIFY", "REFUSE", "ERROR")
STATUSES = {"REUSE": "pending_approval", "GENERATE": "pending_approval",
            "ASK_CLARIFY": "needs_clarification", "REFUSE": "error", "ERROR": "error"}
PLAN_KEYS = {"name", "player", "model", "exam", "interaction"}


def issue(code, message, field=""):
    return {"code": code, "message": message, "field": field}


def _id(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _shape(value, required, field, errors, optional=()):
    if not isinstance(value, dict):
        errors.append(issue("invalid_schema", "Expected an object.", field))
        return False
    if not required <= value.keys() or value.keys() - required - set(optional):
        errors.append(issue("invalid_schema", "Missing required or unknown fields.", field))
    return True


def _registry_rows(registry, name, errors):
    rows = registry.get(name) if isinstance(registry, dict) else None
    if not isinstance(rows, list) or any(not isinstance(r, dict) or not _id(r.get("id")) for r in rows):
        errors.append(issue("invalid_registry", "Trusted registry has invalid metadata.", name))
        return []
    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        errors.append(issue("invalid_registry", "Trusted registry has duplicate IDs.", name))
        return []
    return rows


def _exam_questions(content, errors):
    try:
        store.clean_exam({"name": "Contract review", "content": content})
        parsed = store.parse_questions(content)
        questions = [{"type": q["type"], "text": q["text"], "choices": [
            {"key": c["key"], "text": c["text"]} for c in q["choices"]], "answer": q["answer"],
            "explanation": "Structural check only", "sourceRefs": [], "aiGenerated": False} for q in parsed]
        structural = exams.validate_exam_questions({"name": "Contract review", "questions": questions})
        if structural:
            errors.append(issue("invalid_exam", "Question structure is invalid.", "exam.content"))
        return questions
    except (store.Err, ValueError, TypeError, AttributeError):
        errors.append(issue("invalid_exam", "Exam content cannot be parsed.", "exam.content"))
        return []


def validate_application_plan(plan, registry=None):
    """Return issues; [] means structural validity, plus registry checks if supplied.

    Neither result certifies knowledge, runtime, mouse behavior, or human approval.
    """
    errors = []
    if not _shape(plan, PLAN_KEYS, "application_plan", errors):
        return errors
    if not isinstance(plan.get("name"), str) or not 1 <= len(plan["name"].strip()) <= 80:
        errors.append(issue("invalid_schema", "Application name must contain 1–80 characters.", "name"))
    player, model, exam, inter = (plan.get(k) for k in ("player", "model", "exam", "interaction"))
    manifest, chosen_model, questions = None, None, []
    players, models, registered_exams = [], [], []
    if registry is not None:
        players = _registry_rows(registry, "players", errors)
        models = _registry_rows(registry, "models", errors)
        registered_exams = _registry_rows(registry, "exams", errors)
    if _shape(player, {"mode", "player_id", "html"}, "player", errors):
        if player.get("mode") == "reuse_existing":
            if not _id(player.get("player_id")) or player.get("html") is not None:
                errors.append(issue("invalid_player", "Reuse needs a valid ID and html=null.", "player"))
            if registry is not None:
                row = next((r for r in players if r["id"] == player.get("player_id")), None)
                if row is None:
                    errors.append(issue("forbidden_resource", "Player is absent from the authorized registry.", "player.player_id"))
                elif isinstance(row.get("manifest"), dict):
                    manifest = row["manifest"]
                else:
                    errors.append(issue("invalid_registry", "Player manifest is invalid.", "player"))
        elif player.get("mode") == "generate_new":
            if player.get("player_id") is not None or not isinstance(player.get("html"), str):
                errors.append(issue("invalid_player", "Generated draft needs HTML and player_id=null.", "player"))
            else:
                result = check_game(player["html"])
                if not result["ok"]:
                    errors.append(issue("invalid_player", "Generated HTML fails check_game.", "player.html"))
                else:
                    manifest, _ = contract.parse(player["html"])
        else:
            errors.append(issue("invalid_enum", "Unknown player mode.", "player.mode"))
    if model is not None and _shape(model, {"model_id", "kind", "mapping", "sure", "hold_ms"}, "model", errors):
        sure, hold, mapping = model.get("sure"), model.get("hold_ms"), model.get("mapping")
        if (not _id(model.get("model_id")) or model.get("kind") not in catalog.RUNTIME_KINDS
                or not isinstance(mapping, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in mapping.items())
                or not isinstance(sure, (int, float)) or isinstance(sure, bool) or not .5 <= sure <= .99
                or not isinstance(hold, int) or isinstance(hold, bool) or not 300 <= hold <= 5000):
            errors.append(issue("invalid_model", "Invalid model configuration.", "model"))
        if registry is not None:
            chosen_model = next((r for r in models if r["id"] == model.get("model_id")), None)
            if chosen_model is None:
                errors.append(issue("forbidden_resource", "Model is absent from the authorized registry.", "model.model_id"))
            elif chosen_model.get("kind") != model.get("kind"):
                errors.append(issue("incompatible_model", "Model kind differs from registry.", "model.kind"))
    if exam is not None and _shape(exam, {"mode", "exam_id", "content"}, "exam", errors):
        if exam.get("mode") == "reuse_existing":
            if not _id(exam.get("exam_id")):
                errors.append(issue("invalid_exam", "Existing Exam needs a positive ID.", "exam.exam_id"))
            if registry is not None:
                row = next((r for r in registered_exams if r["id"] == exam.get("exam_id")), None)
                if row is None:
                    errors.append(issue("forbidden_resource", "Exam is absent from the authorized registry.", "exam.exam_id"))
                elif row.get("content") != exam.get("content"):
                    errors.append(issue("stale_resource", "Exam content differs from registry.", "exam.content"))
        elif exam.get("mode") == "generate_new":
            if exam.get("exam_id") is not None:
                errors.append(issue("invalid_exam", "New Exam must have exam_id=null.", "exam.exam_id"))
        else:
            errors.append(issue("invalid_enum", "Unknown Exam mode.", "exam.mode"))
        questions = _exam_questions(exam.get("content"), errors)
    if _shape(inter, {"primary", "fallback", "mouse_always_enabled"}, "interaction", errors):
        if (inter.get("primary") not in ("mouse",) + catalog.RUNTIME_KINDS or inter.get("fallback") != "mouse"
                or inter.get("mouse_always_enabled") is not True):
            errors.append(issue("invalid_interaction", "Mouse fallback must always be enabled.", "interaction"))
        if ((model is None and inter.get("primary") != "mouse") or
                (isinstance(model, dict) and inter.get("primary") != model.get("kind"))):
            errors.append(issue("incompatible_model", "Primary control differs from model.", "interaction.primary"))
    if isinstance(manifest, dict):
        try:
            info = catalog.describe_player(manifest)
        except (TypeError, ValueError, KeyError, AttributeError):
            return errors + [issue("invalid_registry", "Player manifest metadata is invalid.", "player")]
        if info["gameKind"] == "questions" and exam is None:
            errors.append(issue("invalid_exam", "This Player requires an Exam.", "exam"))
        elif info["gameKind"] != "questions" and exam is not None:
            errors.append(issue("incompatible_exam", "This Player does not receive an Exam.", "exam"))
        if info["needsModel"] and model is None:
            errors.append(issue("incompatible_model", "This Player requires a Model.", "model"))
        elif not info["needsModel"] and model is not None:
            errors.append(issue("incompatible_model", "This Player does not receive a Model.", "model"))
        if chosen_model and isinstance(model, dict) and isinstance(model.get("mapping"), dict):
            try:
                if not catalog.validate_mapping(manifest, chosen_model, model["mapping"])["ok"]:
                    errors.append(issue("incompatible_model", "Mapping does not match the authorized Player/Model.", "model.mapping"))
            except (TypeError, ValueError, KeyError, AttributeError):
                errors.append(issue("invalid_registry", "Invalid mapping metadata in registry.", "model.mapping"))
        if questions:
            try:
                if exams.validate_exam_questions({"name": "Contract review", "questions": questions}, manifest=manifest):
                    errors.append(issue("incompatible_exam", "Question choices/count do not match Player.", "exam"))
            except (TypeError, ValueError, KeyError, AttributeError):
                errors.append(issue("invalid_registry", "Invalid Player metadata.", "player"))
    return errors


def infer_decision(response):
    """Interpret the six-field Spec envelope without adding or mutating fields.

    This only classifies the branch. The validator must still check the entire
    plan and errors; inference never makes malformed data valid.
    """
    if not isinstance(response, dict):
        return None
    status, plan = response.get("status"), response.get("application_plan")
    if status == "pending_approval" and isinstance(plan, dict):
        player = plan.get("player")
        if isinstance(player, dict):
            if player.get("mode") == "reuse_existing":
                return "REUSE"
            if player.get("mode") == "generate_new":
                return "GENERATE"
    if status == "needs_clarification" and plan is None:
        return "ASK_CLARIFY"
    if status == "error" and plan is None:
        errors = response.get("errors")
        if isinstance(errors, list) and any(isinstance(e, dict) and e.get("code") == "refused" for e in errors):
            return "REFUSE"
        return "ERROR"
    return None


def validate_agent_response(response, registry=None):
    """Validate the six required Spec fields, plus optional decision/warnings.

    Knowledge-review warning policy is intentionally separate so consumers of
    the unextended v1.0 Spec envelope are not required to adopt extensions.
    """
    errors = []
    required = {"schema_version", "simulated", "status", "message", "application_plan", "errors"}
    if not _shape(response, required, "response", errors, optional=("decision", "warnings")):
        return errors
    inferred = infer_decision(response)
    decision = response.get("decision") if "decision" in response else inferred
    if not isinstance(decision, str) or decision not in DECISIONS or decision != inferred:
        errors.append(issue("invalid_enum", "Decision/status combination is invalid.", "status"))
    if response.get("schema_version") != "1.0" or not isinstance(response.get("simulated"), bool):
        errors.append(issue("invalid_schema", "Invalid Contract version or simulated flag.", "response"))
    if not isinstance(response.get("message"), str) or not response["message"].strip():
        errors.append(issue("invalid_schema", "A non-empty response message is required.", "message"))
    for key in ("errors", "warnings"):
        if key == "warnings" and key not in response:
            continue
        rows = response.get(key)
        if not isinstance(rows, list):
            errors.append(issue("invalid_schema", "Expected a list.", key))
        else:
            for row in rows:
                if _shape(row, {"code", "message"}, key, errors, optional=("field",)):
                    if any(not isinstance(row.get(k), str) or not row[k].strip() for k in ("code", "message")) or ("field" in row and not isinstance(row["field"], str)):
                        errors.append(issue("invalid_schema", "Issue fields must be strings.", key))
    if decision in ("REUSE", "GENERATE"):
        errors.extend(validate_application_plan(response.get("application_plan"), registry))
        plan = response.get("application_plan")
        player = plan.get("player") if isinstance(plan, dict) else None
        expected = "reuse_existing" if decision == "REUSE" else "generate_new"
        if isinstance(player, dict) and player.get("mode") != expected:
            errors.append(issue("invalid_enum", "Decision differs from Player mode.", "decision"))
        if response.get("errors"):
            errors.append(issue("invalid_schema", "Pending plans must not contain blocking errors.", "errors"))
    elif response.get("application_plan") is not None:
        errors.append(issue("invalid_schema", "Non-plan decisions require application_plan=null.", "application_plan"))
    if decision in ("REFUSE", "ERROR") and not response.get("errors"):
        errors.append(issue("invalid_schema", "Refusal/error needs an explanatory error.", "errors"))
    return errors


def validate_knowledge_review_policy(response):
    """Optional producer policy, separate from six-field Spec compatibility.

    Mock producers always emit the warning for every Exam. Backend integrations
    can call this check in addition to, not instead of, Contract validation.
    """
    if not isinstance(response, dict):
        return [issue("invalid_schema", "Expected a response object.", "response")]
    plan = response.get("application_plan")
    exam = plan.get("exam") if isinstance(plan, dict) else None
    if isinstance(exam, dict) and exam.get("mode") == "generate_new":
        warnings = response.get("warnings")
        if not isinstance(warnings, list) or not any(isinstance(w, dict) and w.get("code") == "knowledge_review_required" for w in warnings):
            return [issue("knowledge_review_required", "New questions require an explicit teacher knowledge-review warning.", "warnings")]
    return []


def to_ui_response(response):
    """Safe, non-executable UI view. Never send this projection to a Composer."""
    if not isinstance(response, dict):
        return {"view": "ui", "html_omitted": True}
    envelope_spec = {"schema_version": schemas._scalar, "simulated": lambda v: v is True,
                     "decision": schemas._scalar, "status": schemas._scalar, "message": schemas._scalar,
                     "errors": schemas._list_of(schemas._obj({"code": schemas._scalar, "message": schemas._scalar, "field": schemas._scalar})),
                     "warnings": schemas._list_of(schemas._obj({"code": schemas._scalar, "message": schemas._scalar, "field": schemas._scalar}))}
    out = schemas._pick(response, envelope_spec)
    plan = response.get("application_plan")
    if isinstance(plan, dict):
        # Explicit nested whitelist; keep business keys while redacting secrets.
        spec = {"name": schemas._scalar,
                "player": schemas._obj({"mode": schemas._scalar, "player_id": schemas._scalar, "html": lambda v: None}),
                "model": schemas._obj({"model_id": schemas._scalar, "kind": schemas._scalar,
                                       "mapping": lambda v: {schemas.redact(k, 60): schemas.redact(x, 60) for k, x in v.items()
                                                             if isinstance(k, str) and isinstance(x, str)} if isinstance(v, dict) else {},
                                       "sure": schemas._scalar, "hold_ms": schemas._scalar}),
                "exam": schemas._obj({"mode": schemas._scalar, "exam_id": schemas._scalar, "content": lambda v: schemas._scalar(v, 40000)}),
                "interaction": schemas._obj({"primary": schemas._scalar, "fallback": schemas._scalar, "mouse_always_enabled": schemas._scalar})}
        out["application_plan"] = schemas._pick(plan, spec)
    else:
        out["application_plan"] = None
    out.update(view="ui", html_omitted=True)
    return copy.deepcopy(out)
