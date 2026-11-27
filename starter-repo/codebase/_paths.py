"""Đặt đường dẫn import cho bản chạy thử.

import _paths  →  thêm codebase/ (ai, tools, tracing, agent) và codebase/backend/ (gói src.*) vào sys.path.
Dùng ở codebase/agent.py và tests/conftest.py. Không có tác động nào khác.
"""
import os
import sys

CODEBASE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(CODEBASE, "backend")

for _p in (CODEBASE, BACKEND):
    if _p not in sys.path:
        sys.path.insert(0, _p)
