"""Tests for automatic tenant detection from public.tenant when VPOST_TENANT_ID is empty."""
from __future__ import annotations

import logging
import os
import sys
import tempfile

from psycopg import sql
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "codebase"))

import store  # noqa: E402

_pg_skip = os.environ.get("_VPOST_PG_UNAVAILABLE")
if _pg_skip is None:
    _ok, _pg_err = store.check_connection()
    _pg_skip = "" if _ok else _pg_err
if _pg_skip:
    pytest.skip("PostgreSQL unreachable (%s)" % _pg_skip, allow_module_level=True)

import tools  # noqa: E402

if "server" not in sys.modules:
    tools.UPLOADS = tempfile.mkdtemp()

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
import vpost_api  # noqa: E402

TENANT_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
TENANT_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
TENANT_SUSPENDED = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3"
TENANT_ENV = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4"
TENANT_OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5"

_ORIG_LIST_ACTIVE = store.list_active_public_tenants


def _ensure_test_tenant_table():
    """Create an isolated `tenant` table inside the session's test schema (never touches public.tenant)."""
    with store.connect() as c:
        c.execute(
            """create table if not exists tenant(
                 id uuid primary key,
                 name text not null,
                 status text not null default 'active'
               )"""
        )
        c.execute("delete from tenant")


def _drop_test_tenant_table():
    with store.connect() as c:
        c.execute("drop table if exists tenant")


def _insert_tenant(tid: str, name: str, status: str = "active"):
    with store.connect() as c:
        c.execute(
            "insert into tenant(id, name, status) values(%s, %s, %s)",
            (tid, name, status),
        )


@pytest.fixture(autouse=True)
def _isolate_tenant_state(monkeypatch):
    orig_tid = vpost_api.TENANT_ID
    orig_state = vpost_api._tenant_resolution_state
    _ensure_test_tenant_table()
    test_schema = store.schema_name()
    monkeypatch.setattr(
        store,
        "list_active_public_tenants",
        lambda schema=test_schema: _ORIG_LIST_ACTIVE(schema=schema),
    )
    monkeypatch.delenv("VPOST_TENANT_ID", raising=False)
    vpost_api.TENANT_ID = vpost_api.DEFAULT_TENANT_ID
    vpost_api._tenant_resolution_state = "uninitialized"
    try:
        yield
    finally:
        _drop_test_tenant_table()
        vpost_api.TENANT_ID = orig_tid
        vpost_api._tenant_resolution_state = orig_state


def test_single_active_tenant_autodetected_at_startup_and_logged(caplog):
    """Exactly one active tenant (suspended tenants ignored) -> autodetected, logged, enforced by cookie guard."""
    _insert_tenant(TENANT_1, "Shop A", status="active")
    _insert_tenant(TENANT_SUSPENDED, "Shop Suspended", status="suspended")

    with caplog.at_level(logging.INFO, logger="vpost.tenant"):
        resolved = vpost_api.resolve_tenant_id(startup=True)

    assert resolved == TENANT_1
    assert vpost_api.TENANT_ID == TENANT_1
    assert vpost_api._tenant_resolution_state == "single"
    info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    assert any(TENANT_1 in m for m in info_msgs)

    client = TestClient(server.app)
    client.cookies.set(vpost_api.TENANT_COOKIE, TENANT_1)
    r_ok = client.get("/api/channels")
    assert r_ok.status_code == 200 and r_ok.json()["tenantId"] == TENANT_1

    client.cookies.set(vpost_api.TENANT_COOKIE, TENANT_OTHER)
    r_forb = client.get("/api/channels")
    assert r_forb.status_code == 403 and r_forb.json()["code"] == "FORBIDDEN"


def test_zero_active_tenants_keeps_fallback_and_warns_operator(caplog):
    """Zero active tenants (empty table or only suspended, or missing table) -> fallback + clear VPOST_TENANT_ID warning."""
    _insert_tenant(TENANT_SUSPENDED, "Only Suspended", status="suspended")

    with caplog.at_level(logging.WARNING, logger="vpost.tenant"):
        resolved = vpost_api.resolve_tenant_id(startup=True)

    assert resolved == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api.TENANT_ID == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api._tenant_resolution_state == "none"
    warn_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("VPOST_TENANT_ID" in m for m in warn_msgs)

    # Missing tenant table also returns [] cleanly and stays on fallback with warning
    caplog.clear()
    _drop_test_tenant_table()
    vpost_api._tenant_resolution_state = "uninitialized"
    with caplog.at_level(logging.WARNING, logger="vpost.tenant"):
        resolved_missing = vpost_api.resolve_tenant_id(startup=True)
    assert resolved_missing == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api._tenant_resolution_state == "none"
    assert any("VPOST_TENANT_ID" in r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)


def test_several_active_tenants_never_guesses_keeps_fallback_and_warns(monkeypatch, caplog):
    """Multiple active tenants -> keeps fallback, NEVER guesses either tenant, warns operator, does not re-query."""
    _insert_tenant(TENANT_1, "Shop A", status="active")
    _insert_tenant(TENANT_2, "Shop B", status="active")

    calls = []
    test_schema = store.schema_name()

    def tracked_list(schema=test_schema):
        calls.append(schema)
        return _ORIG_LIST_ACTIVE(schema=schema)

    monkeypatch.setattr(store, "list_active_public_tenants", tracked_list)

    with caplog.at_level(logging.WARNING, logger="vpost.tenant"):
        resolved = vpost_api.resolve_tenant_id(startup=True)

    assert resolved == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api.TENANT_ID == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api.TENANT_ID not in (TENANT_1, TENANT_2)
    assert vpost_api._tenant_resolution_state == "multiple"
    warn_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("VPOST_TENANT_ID" in m and "2" in m for m in warn_msgs)
    assert len(calls) == 1

    # Requests with either tenant's cookie are rejected (403); no guessing and no repeated DB lookup
    client = TestClient(server.app)
    for tid in (TENANT_1, TENANT_2):
        client.cookies.set(vpost_api.TENANT_COOKIE, tid)
        r = client.get("/api/channels")
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN"

    # Uncookied request returns fallback tenantId, still no extra DB lookup
    client.cookies.clear()
    r_fb = client.get("/api/channels")
    assert r_fb.status_code == 200 and r_fb.json()["tenantId"] == vpost_api.DEFAULT_TENANT_ID
    assert len(calls) == 1


def test_lazy_reevaluation_picks_up_company_created_after_startup(monkeypatch, caplog):
    """Starts with 0 active tenants -> keeps fallback -> company created later -> lazily detected on next request."""
    calls = []
    test_schema = store.schema_name()

    def tracked_list(schema=test_schema):
        calls.append(schema)
        return _ORIG_LIST_ACTIVE(schema=schema)

    monkeypatch.setattr(store, "list_active_public_tenants", tracked_list)

    # 1. Startup with 0 tenants
    with caplog.at_level(logging.INFO, logger="vpost.tenant"):
        assert vpost_api.resolve_tenant_id(startup=True) == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api._tenant_resolution_state == "none"
    assert len(calls) == 1
    assert sum(1 for r in caplog.records if r.levelno == logging.WARNING) == 1

    # 2. Request while still 0 tenants -> re-checks, stays fallback, does NOT spam duplicate warnings
    client = TestClient(server.app)
    with caplog.at_level(logging.INFO, logger="vpost.tenant"):
        r0 = client.get("/api/channels")
    assert r0.status_code == 200 and r0.json()["tenantId"] == vpost_api.DEFAULT_TENANT_ID
    assert len(calls) == 2
    assert sum(1 for r in caplog.records if r.levelno == logging.WARNING) == 1

    # 3. Company created in DB after backend startup!
    _insert_tenant(TENANT_1, "Created Later Shop", status="active")

    # 4. Next HTTP request carrying the new company's cookie succeeds and propagates to sibling routers!
    client.cookies.set(vpost_api.TENANT_COOKIE, TENANT_1)
    with caplog.at_level(logging.INFO, logger="vpost.tenant"):
        r1 = client.get("/api/channels")
    assert r1.status_code == 200 and r1.json()["tenantId"] == TENANT_1
    assert vpost_api.TENANT_ID == TENANT_1
    assert vpost_api._tenant_resolution_state == "single"
    assert any(TENANT_1 in r.getMessage() for r in caplog.records if r.levelno == logging.INFO)
    calls_after_detect = len(calls)

    # Sibling router (/api/comments/auto-reply-settings) also sees the newly detected tenant without extra DB lookups
    r_sib = client.get("/api/comments/auto-reply-settings")
    assert r_sib.status_code == 200 and r_sib.json()["tenantId"] == TENANT_1
    assert len(calls) == calls_after_detect  # cached after detection!


def test_lazy_reevaluation_when_multiple_companies_created_later_never_guesses(caplog):
    """Starts with 0 active tenants -> 2 companies created before next request -> keeps fallback, warns, never guesses."""
    assert vpost_api.resolve_tenant_id(startup=True) == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api._tenant_resolution_state == "none"

    _insert_tenant(TENANT_1, "Shop 1", status="active")
    _insert_tenant(TENANT_2, "Shop 2", status="active")

    caplog.clear()
    client = TestClient(server.app)
    with caplog.at_level(logging.WARNING, logger="vpost.tenant"):
        r = client.get("/api/me")
    assert r.status_code == 200 and r.json()["activeTenantId"] == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api.TENANT_ID == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api._tenant_resolution_state == "multiple"
    assert any("VPOST_TENANT_ID" in rec.getMessage() for rec in caplog.records if rec.levelno == logging.WARNING)


def test_explicit_vpost_tenant_id_env_takes_precedence_without_db_query(monkeypatch, caplog):
    """When VPOST_TENANT_ID is set, use it directly and never query public.tenant."""
    _insert_tenant(TENANT_1, "Shop A", status="active")
    monkeypatch.setenv("VPOST_TENANT_ID", TENANT_ENV)

    called = []
    monkeypatch.setattr(store, "list_active_public_tenants", lambda *a, **kw: (called.append(True), [])[1])

    with caplog.at_level(logging.INFO, logger="vpost.tenant"):
        resolved = vpost_api.resolve_tenant_id(startup=True)
    assert resolved == TENANT_ENV
    assert vpost_api.TENANT_ID == TENANT_ENV
    assert vpost_api._tenant_resolution_state == "env"
    assert called == []


def test_db_error_at_startup_keeps_fallback_and_retries_lazily(monkeypatch, caplog):
    """Transient DB read error -> fallback + warning, then lazily recovers once DB returns single active tenant."""
    monkeypatch.setattr(store, "list_active_public_tenants", lambda *a, **kw: None)

    with caplog.at_level(logging.WARNING, logger="vpost.tenant"):
        assert vpost_api.resolve_tenant_id(startup=True) == vpost_api.DEFAULT_TENANT_ID
    assert vpost_api._tenant_resolution_state == "none"
    assert any("VPOST_TENANT_ID" in r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)

    # DB recovers with 1 active tenant
    _insert_tenant(TENANT_1, "Recovered Shop", status="active")
    test_schema = store.schema_name()
    monkeypatch.setattr(
        store,
        "list_active_public_tenants",
        lambda schema=test_schema: _ORIG_LIST_ACTIVE(schema=schema),
    )
    assert vpost_api.get_tenant_id() == TENANT_1
    assert vpost_api._tenant_resolution_state == "single"
