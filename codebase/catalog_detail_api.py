"""API chi tiết sản phẩm để đối chiếu dữ liệu gốc, ma trận tồn kho màu × size và dữ kiện AI được phép dùng.

Thứ tự gắn router bắt buộc trong `codebase/server.py`:
    app.include_router(catalog_detail_api.router)  # PHẢI đứng TRƯỚC vpost_api.router
    app.include_router(vpost_api.router)

Hợp đồng API theo `.swarm/specs/product-detail.md`:
  GET /api/catalog/products/{code}
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

import agent
import prompts
import rules
import store
import tools
import writing_style


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str, **extra):
        payload = {"code": code, "message": message}
        payload.update(extra)
        super().__init__(status, payload)


def _tenant_guard(request: Request):
    """Dùng chung guard tenant của `vpost_api`, import lười để tránh import vòng."""
    import vpost_api
    return vpost_api._same_tenant(request)


router = APIRouter(prefix="/api", dependencies=[Depends(_tenant_guard)])


_FACT_LABEL_TO_FIELD: dict[str, str] = {
    rules.LABEL["ten_sp"]: "ten_sp",
    rules.LABEL["loai"]: "loai",
    rules.LABEL["gia_ban"]: "gia_ban",
    "Size còn hàng": "size",
    "Màu còn hàng": "mau",
    rules.LABEL["chat_lieu"]: "chat_lieu",
    rules.LABEL["mo_ta"]: "mo_ta",
}
_KNOWN_LABELS_RE = "|".join(re.escape(lbl) for lbl in _FACT_LABEL_TO_FIELD)
_FACT_ENTRY_RE = re.compile(
    r"(?m)^\[(F\d+)\]\s+((?:%s):.*?)(?=\n\[F\d+\]\s+(?:%s):|\Z)" % (_KNOWN_LABELS_RE, _KNOWN_LABELS_RE),
    re.S,
)
_DU_LIEU_BLOCK_RE = re.compile(r"<DU_LIEU>\n(.*?)\n</DU_LIEU>", re.S)


def _opt_str(value) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _dedupe_ci(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in items:
        s = str(raw or "").strip()
        if not s:
            continue
        k = s.lower()
        if k not in seen:
            seen.add(k)
            out.append(s)
    return out


def _stock_for_allowed(stock_res: dict) -> dict:
    """Chuyển kết quả check_stock sang đúng dạng truyền cho rules.allowed_facts.

    Khi sản phẩm hết hàng hoàn toàn / không có trong file tồn (`stock_res["hard"]` có lỗi),
    xóa `colors`/`sizes` để không báo nhầm là "còn hàng".
    """
    if not stock_res.get("hard"):
        return stock_res
    s = dict(stock_res)
    s["dropped_colors"] = list(dict.fromkeys(list(s.get("dropped_colors") or []) + list(s.get("colors") or [])))
    s["dropped_sizes"] = list(dict.fromkeys(list(s.get("dropped_sizes") or []) + list(s.get("sizes") or [])))
    s["colors"] = []
    s["sizes"] = []
    return s


def _build_stock_matrix(row: dict, stock_res: dict) -> dict:
    """Dựng ma trận tồn kho màu × size từ dòng sản phẩm và biến thể tồn khớp trong inventory."""
    variants = stock_res.get("variants") or []
    row_colors = _dedupe_ci(rules.parse_colors(row.get("mau")))
    row_sizes = list(dict.fromkeys(rules.parse_sizes(row.get("size"))))

    colors = row_colors or _dedupe_ci(v.get("mau") for v in variants if (v.get("mau") or "").strip())
    sizes = row_sizes or list(dict.fromkeys(
        str(v.get("size") or "").strip() for v in variants if str(v.get("size") or "").strip()
    ))

    cell_map: dict[tuple[str, str], dict] = {}
    for v in variants:
        c_key = str(v.get("mau") or "").strip().lower()
        s_key = str(v.get("size") or "").strip()
        qty = int(v.get("ton") or 0)
        status = _opt_str(v.get("trang_thai"))
        key = (c_key, s_key)
        if key in cell_map:
            cell_map[key]["qty"] += qty
            if status:
                cell_map[key]["status"] = status
        else:
            cell_map[key] = {"qty": qty, "status": status}

    cells = []
    known_qtys: list[int] = []
    for color in colors:
        c_key = color.lower()
        for size in sizes:
            entry = cell_map.get((c_key, size))
            if entry is None:
                cells.append({
                    "color": color,
                    "size": size,
                    "qty": None,
                    "status": None,
                    "inStock": False,
                })
            else:
                qty = entry["qty"]
                known_qtys.append(qty)
                cells.append({
                    "color": color,
                    "size": size,
                    "qty": qty,
                    "status": entry["status"],
                    "inStock": qty > 0,
                })

    in_stock_colors = [c for c in colors if any(cell["color"] == c and cell["inStock"] for cell in cells)]
    in_stock_sizes = [sz for sz in sizes if any(cell["size"] == sz and cell["inStock"] for cell in cells)]
    total_qty = sum(known_qtys) if known_qtys else None

    return {
        "sizes": sizes,
        "colors": colors,
        "cells": cells,
        "inStockSizes": in_stock_sizes,
        "inStockColors": in_stock_colors,
        "totalQty": total_qty,
    }


def _build_ai_facts(row: dict, stock_res: dict, page: dict, tenant_id: str) -> list[dict]:
    """Sinh đúng danh sách dữ kiện [F1..] bằng cùng pipeline allowed_facts + user_prompt của luồng tạo caption."""
    effective_page = writing_style.apply(page, tenant_id, page["id"])
    eff_glob = agent._effective_glob(effective_page)
    allowed = rules.allowed_facts(row, _stock_for_allowed(stock_res), effective_page, eff_glob)
    prompt_text = prompts.user_prompt(row, allowed, [])
    m = _DU_LIEU_BLOCK_RE.search(prompt_text)
    if not m or not m.group(1).strip():
        return []
    out = []
    for entry in _FACT_ENTRY_RE.finditer(m.group(1)):
        fid = entry.group(1)
        text = entry.group(2)
        label = text.split(":", 1)[0].strip()
        out.append({
            "id": fid,
            "field": _FACT_LABEL_TO_FIELD.get(label, label),
            "text": text,
        })
    return out


@router.get("/catalog/products/{code}")
def catalog_product_detail(code: str):
    """Chi tiết đầy đủ một sản phẩm trong catalog: trường gốc, ảnh, ma trận tồn kho và dữ kiện AI được dùng."""
    clean_code = (code or "").strip()
    row = store.catalog_row(clean_code)
    if not row:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Không có mã %s trong file sản phẩm đã tải" % clean_code)

    import vpost_api

    tenant_id = vpost_api.TENANT_ID
    page, hard, warns, s_inspect, images = vpost_api.inspect(row)
    stock_res = s_inspect if "sizes" in s_inspect else rules.check_stock(row, tools.inventory())

    fields = {
        "giaBan": _opt_str(row.get("gia_ban")),
        "giaBanVnd": rules.parse_price(row.get("gia_ban")),
        "giaTe": _opt_str(row.get("gia_te")),
        "size": _opt_str(row.get("size")),
        "mau": _opt_str(row.get("mau")),
        "chatLieu": _opt_str(row.get("chat_lieu")),
        "moTa": _opt_str(row.get("mo_ta")),
        "prompt": _opt_str(row.get("prompt")),
    }

    return {
        "tenantId": tenant_id,
        "product": {
            "code": row["ma_sp"],
            "name": vpost_api.display_name(row),
            "category": _opt_str(row.get("loai")),
            "pageId": page["id"],
            "pageName": page["name"],
            "fields": fields,
            "images": list(dict.fromkeys(images)),
            "stock": _build_stock_matrix(row, stock_res),
            "aiFacts": _build_ai_facts(row, stock_res, page, tenant_id),
            "warnings": list(warns),
            "blocking": [{"code": err_code, "message": msg} for err_code, msg in hard],
            "composable": not hard,
        },
    }
