"""Công cụ của bài toán — NHÓM VIẾT. Điền ở guide bước 2.2 (thiết kế) và 3.2 (code).

Mỗi công cụ là một hàm Python có @tool. Docstring ghi đúng 4 ý như sơ đồ ở spec.md §4:
    tên · input · output · có tác động ra ngoài không (gửi tin, sửa dữ liệu, chấm điểm…)
Khung tự ghi mỗi lần gọi công cụ vào trace (tên, input, output rút gọn, thời gian, lỗi).

Lát cắt của nhóm: giáo viên mô tả game → AI viết một file trình chơi HTML → người duyệt. Luật kiểm của AI Lab (hợp đồng
khối jl-camera + quét cờ cảnh báo) nằm ở ailab/contract.py; công cụ dưới đây gọi lại đúng luật đó, không chép lại.
Công cụ có tác động ra ngoài: KHÔNG tự làm. Ở đây không có công cụ nào lưu, gửi hay chấm điểm: lưu game là việc của
người dùng bấm Chấp nhận trong AI Lab (ailab/server.py), rồi Admin duyệt.
"""
import os
import sys

from tracing import tool, TOOLS  # noqa: F401  (TOOLS: danh sách công cụ đã đăng ký, dùng khi viết vòng lặp agent)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ailab"))
import composer  # noqa: E402  (ailab/composer.py — T12)
import contract  # noqa: E402  (ailab/contract.py)


@tool
def check_game(html: str) -> dict:
    """check_game — kiểm một file trình chơi HTML do AI viết.
    Input: html (str), toàn bộ file. Output: {"ok": bool, "error": str hoặc None, "name": str, "flags": [{"code","label","reason","line","excerpt"}]}.
    ok=False khi vi phạm hợp đồng (thiếu hoặc sai khối jl-camera, quá 2 MB…); flags là câu hỏi cho người duyệt, không phải lời từ chối.
    Không tác động ra ngoài: chỉ đọc, không lưu gì."""
    manifest, err = contract.parse(html or "")
    if err:
        return {"ok": False, "error": err[1], "name": "", "flags": []}
    return {"ok": True, "error": None, "name": manifest["name"], "flags": contract.scan(html)}


@tool
def list_players(kind: str = None, questions: str = None, name_contains: str = None, limit: int = 50) -> dict:
    """list_players — tra cứu Player có sẵn trong Catalog để ưu tiên nhánh REUSE.
    Input: kind (str|None) lọc theo kinds trong manifest (vd 'hands'), questions (str|None) lọc 'exam'/'texts',
           name_contains (str|None), limit (int, 1–100).
    Output: {"ok": bool, "players": [{"id","name","kinds","inputs","questions","content","status"}], "error": str|None}.
    Không tác động ra ngoài: chỉ đọc Catalog; không lưu, không sửa, không xuất bản."""
    try:
        snap = composer.catalog_snapshot()
    except composer.ComposerError as exc:
        return {"ok": False, "players": [], "error": str(exc)}
    try:
        cap = max(1, min(100, int(limit)))
    except (TypeError, ValueError):
        cap = 50
    out = []
    for p in snap["players"]:
        if kind and kind not in (p.get("kinds") or []):
            continue
        if questions:
            actual = p.get("questions") or (p.get("content") or {}).get("kind")
            if actual != questions:
                continue
        if name_contains and name_contains.strip().lower() not in (p["name"] or "").lower():
            continue
        out.append({k: p.get(k) for k in ("id", "name", "kinds", "inputs", "questions", "content", "status")})
        if len(out) >= cap:
            break
    return {"ok": True, "players": out, "error": None}


@tool
def get_player(player_id: int) -> dict:
    """get_player — lấy HTML gốc và manifest của một Player theo ID thật trong Catalog.
    Input: player_id (int), ID có trong Catalog; không đoán ID.
    Output: {"ok": bool, "player": {"id","name","manifest","html"} hoặc None, "error": str|None}.
    Không tác động ra ngoài: chỉ đọc; trả HTML để tái dùng nguyên vẹn, không ghi đè file gốc."""
    try:
        row = composer._load("players", player_id)  # nội bộ composer: đọc SQLite, không ghi
    except composer.ComposerError as exc:
        return {"ok": False, "player": None, "error": str(exc)}
    man = composer._json_value(row.get("manifest")) or {}
    return {"ok": True, "player": {"id": row["id"], "name": row["name"], "manifest": man,
                                   "html": row["html"]}, "error": None}


@tool
def list_models(kind: str = None, limit: int = 50) -> dict:
    """list_models — tra cứu Model AI có sẵn trong Catalog (kèm kinds/outputs thật).
    Input: kind (str|None) lọc theo 'hands'/'image'/'pose'/'audio', limit (int, 1–100).
    Output: {"ok": bool, "models": [{"id","name","kind","outputs","url"}], "error": str|None}.
    Không tác động ra ngoài: chỉ đọc Catalog; không nạp model, không lưu, không xuất bản."""
    try:
        snap = composer.catalog_snapshot()
    except composer.ComposerError as exc:
        return {"ok": False, "models": [], "error": str(exc)}
    try:
        cap = max(1, min(100, int(limit)))
    except (TypeError, ValueError):
        cap = 50
    out = []
    for m in snap["models"]:
        if kind and m.get("kind") != kind:
            continue
        out.append({k: m.get(k) for k in ("id", "name", "kind", "outputs", "url")})
        if len(out) >= cap:
            break
    return {"ok": True, "models": out, "error": None}


@tool
def validate_compatibility(player_id: int = None, model_id: int = None, exam_id: int = None,
                           mapping: dict = None, plan: dict = None) -> dict:
    """validate_compatibility — kiểm tổ hợp Model + Player + Question Set bằng Rules.
    Input: player_id/model_id/exam_id (int|None, ID thật trong Catalog; None = chuột hoặc không có đề),
           mapping (dict|None) ánh xạ ô của player sang lớp của model, plan (dict|None) để kiểm mouse_always_enabled.
    Output: {"ok": bool, "reasons": [str], "player": str, "model": str, "exam": str}.
    Không tác động ra ngoài: chỉ đọc Catalog và kiểm Rules; không lưu, không chấm điểm, không xuất bản."""
    raw = plan.get("application_plan") if isinstance(plan, dict) and isinstance(plan.get("application_plan"), dict) else plan
    raw = raw if isinstance(raw, dict) else {}
    if player_id is None:
        player_id = (raw.get("player") or {}).get("player_id") if isinstance(raw.get("player"), dict) else None
    if model_id is None:
        model_id = (raw.get("model") or {}).get("model_id") if isinstance(raw.get("model"), dict) else None
    if exam_id is None:
        exam_id = (raw.get("exam") or {}).get("exam_id") if isinstance(raw.get("exam"), dict) else None
    try:
        p = composer._load("players", player_id) if player_id not in (None, "") else None
        m = composer._load("models", model_id) if model_id not in (None, "") else None
        e = composer._load("exams", exam_id) if exam_id not in (None, "") else None
    except composer.ComposerError as exc:
        return {"ok": False, "reasons": [str(exc)], "player": "", "model": "", "exam": ""}
    return composer.validate_compatibility(p, m, e, mapping=mapping, plan=plan)


@tool
def compose_application(plan: dict) -> dict:
    """compose_application — lắp ApplicationPlan hợp lệ thành ứng dụng BẢN NHÁP (DRAFT).
    Input: plan (dict hoặc chuỗi JSON theo Contract của T06; có thể bọc trong 'application_plan').
    Output: {"ok": bool, "errors": [str], "app": dict|None, "status": "draft"};
            app gồm Model + Player + Question Set, requires_human_approval=True, catalog_written=False.
    Không tác động ra ngoài: KHÔNG ghi Catalog, KHÔNG lưu DB, KHÔNG tự đặt APPROVED hay xuất bản."""
    return composer.compose_app(plan)
