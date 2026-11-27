"""C03 — Danh mục Player/Model, định tuyến game và chọn model.

Hàm thuần (không DB, không sửa đầu vào) + một hàm chỉ đọc DB (`load_catalog`). Không sinh HTML, không tạo App.
Spec: docs/chatbot/C03_SPEC.md.
"""
import copy
import json

import store

from . import conversation as C
from . import schemas as S

RUNTIME_KINDS = ("image", "pose", "hands")
DEFAULT_KINDS = ("image", "pose")
FORBIDDEN_MSG = "Không thấy game này hoặc bạn không có quyền dùng."
KIND_LABELS = {"questions": "game câu hỏi", "list": "game danh sách (chọn tên/mục)", "other": "game khác"}
MAX_ALTERNATIVES = 3


def _conflict(code, message, options):
    if code not in S.ERROR_CODES:
        raise ValueError("mã lỗi lạ: %s" % code)
    return {"code": code, "message": message, "options": list(options)}


def _kinds_text(kinds):
    return "/".join(kinds) if kinds else "(không có)"


# ---------------------------------------------------------------- 3.1 đọc danh mục
def _rows(c, sql):
    cur = c.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def load_catalog(c, user):
    """Player dùng được + Model nhìn thấy được với `user`. Chỉ đọc, không commit; sắp theo id tăng."""
    players, models = [], []
    for r in _rows(c, "SELECT id, owner_id, name, description, status, visibility, manifest FROM players ORDER BY id"):
        if not store.player_usable(r, user):
            continue
        try:
            man = json.loads(r["manifest"])
        except (TypeError, ValueError):
            continue
        if not isinstance(man, dict):
            continue
        players.append({"id": r["id"], "name": r["name"], "description": r["description"], "ownerId": r["owner_id"],
                        "mine": r["owner_id"] == user["id"], "sample": r["owner_id"] is None,
                        "status": r["status"], "visibility": r["visibility"], "manifest": man})
    for r in _rows(c, "SELECT id, owner_id, name, kind, outputs, visibility FROM models ORDER BY id"):
        if not store.model_visible(r, user):
            continue
        try:
            outs = json.loads(r["outputs"])
        except (TypeError, ValueError):
            outs = []
        outs = [{"key": o.get("key"), "role": o.get("role")} for o in outs if isinstance(o, dict)] if isinstance(outs, list) else []
        models.append({"id": r["id"], "name": r["name"], "kind": r["kind"], "outputs": outs,
                       "mine": r["owner_id"] == user["id"], "builtin": r["owner_id"] == 0, "visibility": r["visibility"]})
    return {"players": players, "models": models}


# ---------------------------------------------------------------- 3.2 mô tả Player
def _inputs(manifest):
    out = []
    for i in (manifest or {}).get("inputs") or []:
        if not isinstance(i, dict):
            continue
        acc = i.get("accepts") or ["action"]
        out.append({"key": i.get("key"), "label": i.get("label") or i.get("key"), "required": bool(i.get("required", False)),
                    "accepts": list(acc)})
    return out


def describe_player(manifest):
    man = manifest or {}
    kind = (man.get("content") or {}).get("kind") if isinstance(man.get("content"), dict) else None
    if man.get("questions") == "exam" or kind == "questions":
        gk = "questions"
    elif kind == "texts":
        gk = "list"
    else:
        gk = "other"
    inputs = _inputs(man)
    needs = "inputs" in man and bool(inputs)
    kinds = list(man.get("kinds") or DEFAULT_KINDS) if needs else []
    return {"gameKind": gk, "needsModel": needs, "inputs": inputs, "requiredCount": sum(1 for i in inputs if i["required"]),
            "kinds": kinds, "runtimeKinds": [k for k in kinds if k in RUNTIME_KINDS]}


# ---------------------------------------------------------------- 3.4 / 3.5 mapping
def _kuhn(lefts, cands, avail):
    """Ghép cặp cực đại (đường tăng). lefts: [key ô] theo thứ tự; cands[ô]: [lớp] theo thứ tự ưu tiên; avail: lớp dùng được."""
    owner = {}  # lớp -> ô

    def augment(l, seen):
        for o in cands[l]:
            if o in avail and o not in seen:
                seen.add(o)
                if o not in owner or augment(owner[o], seen):
                    owner[o] = l
                    return True
        return False

    for l in lefts:
        augment(l, set())
    return {l: o for o, l in owner.items()}


def _match_group(lefts, cands, keyed, avail):
    """Ghép cực đại cho một nhóm ô trên tập lớp `avail`, rồi (theo thứ tự ô) cố định từng cặp trùng key
    nếu việc đó không làm giảm số ô ghép được."""
    best = len(_kuhn(lefts, cands, avail))
    forced = {}
    for l in lefts:
        for o in keyed[l]:
            if o not in avail or o in forced.values():
                continue
            trial = dict(forced, **{l: o})
            rest = [x for x in lefts if x not in trial]
            if len(trial) + len(_kuhn(rest, cands, avail - set(trial.values()))) == best:
                forced = trial
                break
    rest = [x for x in lefts if x not in forced]
    out = dict(forced)
    out.update(_kuhn(rest, cands, avail - set(forced.values())))
    return out


def auto_mapping(manifest, model):
    """Ghép ô ↔ lớp (spec §3.4): ghép cực đại cho ô bắt buộc trước; ô tuỳ chọn chỉ dùng lớp còn lại;
    trong các cách ghép cực đại ưu tiên cặp trùng key (không phân biệt hoa thường). Xác định theo thứ tự
    ô trong manifest và lớp trong model. Không dùng lại lớp, không sửa đầu vào."""
    inputs = [i for i in _inputs(manifest) if isinstance(i["key"], str)]
    outs, seen = [], set()
    for o in (model or {}).get("outputs") or []:
        if isinstance(o, dict) and isinstance(o.get("key"), str) and o["key"] not in seen:
            seen.add(o["key"])
            outs.append(o)
    cands, keyed = {}, {}
    for i in inputs:
        ok = [o["key"] for o in outs if o.get("role") in i["accepts"]]
        keyed[i["key"]] = [k for k in ok if k.lower() == i["key"].lower()]
        cands[i["key"]] = keyed[i["key"]] + [k for k in ok if k not in keyed[i["key"]]]
    avail = {o["key"] for o in outs}
    chosen = _match_group([i["key"] for i in inputs if i["required"]], cands, keyed, avail)
    chosen.update(_match_group([i["key"] for i in inputs if not i["required"]], cands, keyed, avail - set(chosen.values())))
    return {i["key"]: chosen[i["key"]] for i in inputs if i["key"] in chosen}


def validate_mapping(manifest, model, mapping):
    """Luật store.clean_app + runtime. Trả {ok, errors[{input, code, message}], check}."""
    info = describe_player(manifest)
    errors = []

    def err(inp, code, msg):
        errors.append({"input": inp, "code": code, "message": msg})

    raw = mapping if isinstance(mapping, dict) else {}
    if mapping is not None and not isinstance(mapping, dict):
        err(None, "incompatible_model", "Mapping phải là một bảng ô -> lớp.")
    if not info["needsModel"]:
        if model:
            err(None, "incompatible_model", "Game này không đọc camera/model, không gắn model được.")
        for k in sorted(raw, key=str):
            err(k, "incompatible_model", "“%s” không phải ô của game này." % k)
    elif not model:
        err(None, "incompatible_model", "Game này cần một model (%s) để tạo App." % _kinds_text(info["kinds"]))
    else:
        kind = model.get("kind")
        if kind not in info["kinds"]:
            err(None, "incompatible_model", "Game này đọc model loại %s, model “%s” là loại %s."
                % (_kinds_text(info["kinds"]), model.get("name"), kind))
        if kind not in RUNTIME_KINDS:
            err(None, "unsupported_interaction", "Model loại %s chưa chạy được trong game (chỉ lưu); chọn model %s."
                % (kind, _kinds_text(list(RUNTIME_KINDS))))
        outs = {}
        for o in model.get("outputs") or []:
            if isinstance(o, dict) and isinstance(o.get("key"), str):
                outs.setdefault(o["key"], o.get("role"))
        keys = {i["key"] for i in info["inputs"]}
        used = set()
        for i in info["inputs"]:
            o = raw.get(i["key"])
            if not o:
                if i["required"]:
                    err(i["key"], "incompatible_model", "Ô “%s” bắt buộc gắn với một lớp của model." % i["label"])
                continue
            if not isinstance(o, str) or o not in outs:
                err(i["key"], "incompatible_model", "Lớp “%s” không có trong model “%s”." % (o, model.get("name")))
            elif o in used:
                err(i["key"], "incompatible_model", "Lớp “%s” đã gắn vào ô khác; mỗi lớp chỉ dùng một lần." % o)
            elif outs[o] not in i["accepts"]:
                err(i["key"], "incompatible_model", "Lớp “%s” có vai trò %s, ô “%s” chỉ nhận %s."
                    % (o, outs[o], i["label"], "/".join(i["accepts"])))
            if isinstance(o, str):
                used.add(o)
        for k in sorted(raw, key=str):
            if k not in keys:
                err(k, "incompatible_model", "“%s” không phải ô của game này." % k)
    ok = not errors
    check = S.make_check("compatibility", "passed" if ok else "failed", True,
                         "Model và mapping hợp với game." if ok else errors[0]["message"])
    return {"ok": ok, "errors": errors, "check": check}


# ---------------------------------------------------------------- 3.3 chọn model
def _selection(status, reason, model=None, mapping=None, conflicts=()):
    return {"status": status, "modelId": model["id"] if model else None, "kind": model["kind"] if model else None,
            "mapping": dict(mapping or {}), "reason": reason, "conflicts": list(conflicts), "mouse": True}


def _action_count(model, info):
    req_roles = set()
    for i in info["inputs"]:
        if i["required"]:
            req_roles.update(i["accepts"])
    return sum(1 for o in model.get("outputs") or [] if isinstance(o, dict) and o.get("role") in (req_roles or {"action"}))


def select_model(manifest, models, interaction):
    manifest = copy.deepcopy(manifest or {})
    models = copy.deepcopy(models or [])
    inter = interaction or {}
    use = inter.get("useModel")
    requested = [k for k in (inter.get("requestedKinds") or []) if isinstance(k, str)]
    info = describe_player(manifest)

    if not info["needsModel"]:
        # useModel=False thắng requestedKinds còn lưu từ lựa chọn cũ (spec §3.3 luật 1, sửa sau review C03 lần 1).
        if use is True or (use is None and requested):
            msg = "Game này không đọc camera/model; chỉ chơi bằng chuột/chạm."
            return _selection("conflict", msg, conflicts=[_conflict("unsupported_interaction", msg, [
                "Chơi game này chỉ bằng chuột/chạm", "Chọn game camera khác"])])
        return _selection("not_needed", "Game này không cần model; chơi bằng chuột/chạm.")

    need = "model %s có ít nhất %d lớp" % (_kinds_text(info["runtimeKinds"] or info["kinds"]), info["requiredCount"])
    if use is False:
        msg = ("Game này cần %s để tạo App (luật nền tảng); bạn chọn không dùng model. Chuột vẫn chơi được khi chạy."
               % need)
        return _selection("conflict", msg, conflicts=[_conflict("incompatible_model", msg, [
            "Cho phép dùng model cho game này", "Chọn game không cần camera"])])

    if requested and all(k == "audio" for k in requested):
        msg = "Model âm thanh (audio) chưa chạy được trong game (chỉ lưu); không tạo App audio được."
        return _selection("conflict", msg, conflicts=[_conflict("unsupported_interaction", msg, [
            "Dùng model %s thay cho audio" % _kinds_text(info["runtimeKinds"]), "Chọn game không cần camera"])])

    req = [k for k in requested if k != "audio"]
    allowed = [k for k in info["kinds"] if k in RUNTIME_KINDS and (not req or k in req)]
    same_kind = [m for m in models if m.get("kind") in allowed]
    valid = []
    for m in same_kind:
        mp = auto_mapping(manifest, m)
        if validate_mapping(manifest, m, mp)["ok"]:
            valid.append((m, mp))
    if valid:
        first = req[0] if req else None
        valid.sort(key=lambda t: (0 if first and t[0]["kind"] == first else 1, 0 if t[0].get("mine") else 1, t[0]["id"]))
        m, mp = valid[0]
        return _selection("selected", "Chọn model “%s” (%s), gắn %d ô tự động." % (m.get("name"), m["kind"], len(mp)), m, mp)

    if req and not allowed:
        msg = "Game này đọc model %s; bạn yêu cầu %s." % (_kinds_text(info["kinds"]), _kinds_text(req))
        opts = ["Đổi cách điều khiển sang %s" % _kinds_text(info["runtimeKinds"]), "Chọn game khác"]
    elif not same_kind:
        have = sorted({m.get("kind") for m in models if m.get("kind")})
        msg = ("Game này đọc model %s; model bạn dùng được hiện chỉ có loại %s." % (_kinds_text(allowed), _kinds_text(have))
               if have else "Game này đọc model %s; bạn chưa có model nào dùng được." % _kinds_text(allowed))
        opts = ["Huấn luyện/thêm %s" % need, "Chọn game khác hoặc tạo game mới"]
    else:
        parts = ["model “%s” có %d lớp hành động" % (m.get("name"), _action_count(m, info)) for m in
                 sorted(same_kind, key=lambda m: (0 if m.get("mine") else 1, m["id"]))[:3]]
        msg = "%s, game cần %d ô." % ("; ".join(parts), info["requiredCount"])
        msg = msg[0].upper() + msg[1:]
        opts = ["Huấn luyện/thêm %s" % need, "Chọn game khác hoặc tạo game mới"]
    return _selection("conflict", msg, conflicts=[_conflict("incompatible_model", msg, opts)])


# ---------------------------------------------------------------- 3.6 định tuyến
def _strong_question_data(req):
    src = req.get("contentSource") or {}
    return bool(req.get("questionCount") or src.get("kind") in C.QUESTION_SOURCE_KINDS)


def _wanted_for_chosen(req):
    """Loại game giáo viên yêu cầu khi đã chọn Player: chỉ khi có mô tả/tín hiệu rõ; không thì None (không kiểm)."""
    dk = C.description_kind((req.get("gamePreference") or {}).get("description"))
    if dk in ("questions", "list"):
        return dk
    if dk == "ambiguous":
        return C.game_kind(req)
    return "questions" if _strong_question_data(req) else None


def _evaluate(players, models, wanted, interaction):
    """[(player, selection|None, lý do không hợp|None)] cho mọi Player."""
    out = []
    for p in players:
        info = describe_player(p.get("manifest"))
        if info["gameKind"] != wanted:
            out.append((p, None, "“%s” là %s, bạn cần %s." % (p.get("name"), KIND_LABELS[info["gameKind"]],
                                                            KIND_LABELS.get(wanted, wanted))))
            continue
        sel = select_model(p.get("manifest"), models, interaction)
        out.append((p, sel, None if sel["status"] != "conflict" else "“%s”: %s" % (p.get("name"), sel["reason"])))
    return out


def _rank(p):
    return (0 if p.get("sample") else 1, 0 if p.get("status") == "approved" else 1, 0 if p.get("mine") else 1, p.get("id"))


def _fit_reason(p, sel, wanted):
    ctrl = ("chơi bằng chuột/chạm, không cần model" if sel["status"] == "not_needed"
            else "điều khiển bằng model loại %s (chuột vẫn dùng được)" % sel["kind"])
    return "“%s” là %s, %s." % (p.get("name"), KIND_LABELS.get(wanted, wanted), ctrl)


def _route(mode, pid, reason, selection=None, alternatives=(), conflicts=(), questions=()):
    return {"mode": mode, "playerId": pid, "reason": reason, "selection": selection, "alternatives": list(alternatives),
            "conflicts": list(conflicts), "questions": list(questions)}


def route_game(requirements, catalog):
    req = copy.deepcopy(requirements or {})
    cat = copy.deepcopy(catalog or {})
    players = sorted([p for p in cat.get("players") or [] if isinstance(p, dict)], key=lambda p: p.get("id") or 0)
    models = [m for m in cat.get("models") or [] if isinstance(m, dict)]
    gp = req.get("gamePreference") or {}
    inter = req.get("interaction") or {}
    pid = gp.get("playerId")
    mode = gp.get("mode") or "auto"

    if pid is not None:
        chosen = next((p for p in players if p.get("id") == pid), None)
        if chosen is None:
            return _route(None, None, FORBIDDEN_MSG,
                          conflicts=[_conflict("forbidden_resource", FORBIDDEN_MSG,
                                               ["Chọn game khác trong danh mục", "Tạo game mới"])],
                          questions=[{"field": "gamePreference",
                                      "text": "Không thấy game này hoặc bạn không có quyền dùng. Bạn muốn chọn game khác không?"}])
        info = describe_player(chosen.get("manifest"))
        wanted = _wanted_for_chosen(req)
        sel = select_model(chosen.get("manifest"), models, inter)
        conflicts, questions = [], []
        name = chosen.get("name")
        if wanted is not None and info["gameKind"] != wanted:
            msg = "“%s” là %s, nhưng yêu cầu của bạn là %s." % (name, KIND_LABELS[info["gameKind"]], KIND_LABELS[wanted])
            conflicts.append(_conflict("unsupported_interaction", msg,
                                       ["Giữ “%s” và đổi yêu cầu" % name, "Chọn game khác"]))
            questions.append({"field": "gameConflict",
                              "text": "“%s” không hợp yêu cầu %s. Giữ game này và đổi yêu cầu, hay chọn game khác?"
                                      % (name, KIND_LABELS[wanted])})
        if sel["status"] == "conflict":
            conflicts.extend(sel["conflicts"])
            questions.append({"field": "interaction",
                              "text": "%s Giữ “%s” và đổi cách điều khiển/model, hay chọn game khác?" % (sel["reason"], name)})
        alternatives = []
        if conflicts:
            want = wanted or (info["gameKind"] if info["gameKind"] != "other" else None)
            if want:
                fits = [(p, s) for p, s, why in _evaluate(players, models, want, inter) if why is None and p.get("id") != pid]
                fits.sort(key=lambda t: _rank(t[0]))
                alternatives = [{"playerId": p["id"], "name": p.get("name"), "reason": _fit_reason(p, s, want)}
                                for p, s in fits[:MAX_ALTERNATIVES]]
            reason = "Giữ game bạn đã chọn “%s”, nhưng có điểm chưa hợp cần bạn quyết định." % name
        else:
            reason = "Dùng game bạn đã chọn “%s”: %s" % (name, sel["reason"])
        return _route("reuse_existing", pid, reason, sel, alternatives, conflicts, questions)

    if mode == "generate_new":
        return _route("generate_new", None, "Giáo viên yêu cầu tạo game mới.")

    wanted = C.game_kind(req)
    if wanted is None:
        return _route(None, None, "Chưa rõ loại game (câu hỏi hay danh sách).",
                      questions=[{"field": "gamePreference", "text": C.FIELD_QUESTIONS["gamePreference"]}])
    evals = _evaluate(players, models, wanted, inter)
    fits = sorted([(p, s) for p, s, why in evals if why is None], key=lambda t: _rank(t[0]))
    if fits:
        p, s = fits[0]
        alts = [{"playerId": q["id"], "name": q.get("name"), "reason": _fit_reason(q, t, wanted)}
                for q, t in fits[1:1 + MAX_ALTERNATIVES]]
        return _route("reuse_existing", p["id"], "Dùng game có sẵn " + _fit_reason(p, s, wanted), s, alts)

    same_kind = [(p, s, why) for p, s, why in evals if s is not None]
    whys = [why for _, _, why in (same_kind or evals)][:MAX_ALTERNATIVES]
    detail = " ".join(whys) if whys else "Danh mục chưa có game nào dùng được."
    if mode == "auto":
        return _route("generate_new", None, "Không game có sẵn nào hợp: %s Sẽ tạo game mới." % detail)
    code = same_kind[0][1]["conflicts"][0]["code"] if same_kind and same_kind[0][1]["conflicts"] else "unsupported_interaction"
    msg = "Không game có sẵn nào hợp yêu cầu: %s" % detail
    return _route(None, None, msg,
                  conflicts=[_conflict(code, msg, ["Cho phép tạo game mới", "Đổi yêu cầu (vd cho phép dùng model/camera)"])],
                  questions=[{"field": "gamePreference",
                              "text": "Không có game sẵn nào hợp. Cho phép tạo game mới, hay đổi yêu cầu?"}])
