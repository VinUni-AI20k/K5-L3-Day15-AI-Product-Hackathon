"""T12/T13 phần tĩnh: tools Catalog, validate_compatibility, App Composer, CSP/helper.

Chạy: python -m unittest discover -s ailab -p "test_*.py"
Không cần mạng, không cần API key; dùng DB SQLite tạm.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "codebase"))

import composer  # noqa: E402
import contract  # noqa: E402
import llm  # noqa: E402
import store  # noqa: E402
import tools  # noqa: E402

GOOD_HTML = llm.QUIZ_TEMPLATE.replace("__TITLE__", "Quiz thử T12")
EXAM_LINE = "1 + 1 bằng bao nhiêu? | 1 | 2 | =B\n2 + 2 bằng bao nhiêu? | 3 | 4 | =B"


def plan_reuse():
    return {
        "schema_version": "1.0", "simulated": True, "status": "pending_approval",
        "application_plan": {
            "name": "Ôn Toán",
            "player": {"mode": "reuse_existing", "player_id": 1, "html": None},
            "model": {"model_id": None, "kind": "mouse", "mapping": {}},
            "exam": {"mode": "reuse_existing", "exam_id": 1, "content": None},
            "interaction": {"primary": "mouse", "fallback": "mouse", "mouse_always_enabled": True},
        },
    }


def plan_generate():
    return {
        "schema_version": "1.0", "simulated": True, "status": "APPROVED",
        "application_plan": {
            "name": "Game mới nháp",
            "player": {"mode": "generate_new", "player_id": None, "html": GOOD_HTML},
            "model": {"model_id": None, "kind": "mouse", "mapping": {}},
            "exam": {"mode": "generate_new", "exam_id": None, "content": EXAM_LINE},
            "interaction": {"primary": "mouse", "fallback": "mouse", "mouse_always_enabled": True},
        },
    }


class CatalogAndTools(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._patch = mock.patch.object(store, "DB_PATH", os.path.join(self.tmp, "t.db"))
        self._patch.start()
        store.init("pw123456")

    def tearDown(self):
        self._patch.stop()

    def test_catalog_snapshot_matches_seed(self):
        snap = composer.catalog_snapshot()
        self.assertEqual([p["name"] for p in snap["players"]],
                         ["Quiz ABCD bằng cử chỉ", "Vòng quay chọn tên"])
        self.assertNotIn("hands", snap["players"][0]["kinds"])  # B02: mẫu chưa khai kinds hands
        self.assertEqual(snap["players"][1]["content"]["kind"], "texts")  # B04/B09
        self.assertEqual(snap["models"][0]["kind"], "hands")
        self.assertTrue(all(e["count"] == 15 for e in snap["exams"]))
        self.assertIn("Toán 12: Đạo hàm và khảo sát hàm số", [e["name"] for e in snap["exams"]])
        self.assertNotIn("generated_at", snap)  # snapshot cố định, không đóng dấu thời gian

    def test_tools_registered_with_four_part_docstring(self):
        for name in ("check_game", "list_players", "get_player", "list_models",
                     "validate_compatibility", "compose_application"):
            fn = tools.TOOLS.get(name)
            self.assertTrue(callable(fn), "thiếu @tool %s" % name)
            doc = fn.__doc__ or ""
            self.assertIn(name, doc)
            self.assertIn("Input:", doc)
            self.assertIn("Output:", doc)
            self.assertIn("Không", doc)

    def test_list_and_get_catalog(self):
        exam_only = tools.list_players(questions="exam")
        self.assertTrue(exam_only["ok"])
        self.assertEqual([p["name"] for p in exam_only["players"]], ["Quiz ABCD bằng cử chỉ"])
        self.assertEqual(tools.list_players(questions="texts")["players"][0]["name"], "Vòng quay chọn tên")
        self.assertEqual(tools.list_players(kind="hands")["players"], [])
        got = tools.get_player(1)
        self.assertTrue(got["ok"])
        self.assertIn('id="jl-camera"', got["player"]["html"])
        self.assertEqual(got["player"]["manifest"]["questions"], "exam")
        self.assertFalse(tools.get_player(999)["ok"])
        self.assertEqual(tools.list_models(kind="hands")["models"][0]["name"], "Bàn tay (MediaPipe)")
        self.assertEqual(tools.list_models(kind="audio")["models"], [])

    def test_compatibility_rules(self):
        # B02: quiz mẫu chưa khai kinds hands -> không ghép được với model bàn tay
        r = tools.validate_compatibility(player_id=1, model_id=1, exam_id=1)
        self.assertFalse(r["ok"])
        self.assertTrue(any("kinds" in x and "hands" in x for x in r["reasons"]), r["reasons"])
        # B09: vòng quay không có inputs -> không ghép model, cũng không nhận bộ đề exam
        r = tools.validate_compatibility(player_id=2, model_id=1, exam_id=1)
        self.assertFalse(r["ok"])
        self.assertTrue(any("không có inputs" in x for x in r["reasons"]), r["reasons"])
        self.assertTrue(any("không nhận bộ đề câu hỏi" in x for x in r["reasons"]), r["reasons"])
        # Runtime chưa hỗ trợ audio
        audio = {"id": 99, "name": "Mic", "kind": "audio", "outputs": [{"key": "yes", "role": "action"}]}
        r = composer.validate_compatibility(1, audio, None)
        self.assertFalse(r["ok"])
        self.assertTrue(any("audio" in x for x in r["reasons"]))
        # Sai nhãn / role / dùng trùng lớp
        bad_map = {"A": "fist", "B": "open", "C": "none", "D": "fist"}
        r = tools.validate_compatibility(player_id=1, model_id=1, exam_id=1, mapping=bad_map)
        self.assertFalse(r["ok"])
        self.assertTrue(any("vai trò" in x for x in r["reasons"]), r["reasons"])
        self.assertTrue(any("nhiều hơn một ô" in x for x in r["reasons"]), r["reasons"])
        # Tổ hợp hợp lệ: model image có đủ 4 lớp action, đáp án đề nằm trong A–D
        image = {"id": 98, "name": "Image ABCD", "kind": "image",
                 "outputs": [{"key": k, "role": "action"} for k in "ABCD"]}
        exam = composer._load("exams", 1)
        r = composer.validate_compatibility(1, image, exam)
        self.assertTrue(r["ok"], r["reasons"])


class AppComposer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._patch = mock.patch.object(store, "DB_PATH", os.path.join(self.tmp, "t.db"))
        self._patch.start()
        store.init("pw123456")

    def tearDown(self):
        self._patch.stop()

    def test_reuse_keeps_original_player_and_stays_draft(self):
        res = composer.compose_app(plan_reuse())
        self.assertTrue(res["ok"], res["errors"])
        app = res["app"]
        self.assertEqual(app["status"], "draft")
        self.assertEqual(app["player"]["player_id"], 1)
        self.assertIsNone(app["player"]["html"])
        self.assertTrue(app["player"]["source_html_untouched"])
        self.assertFalse(app["catalog_written"])
        self.assertTrue(app["requires_human_approval"])
        self.assertTrue(app["knowledge_review_required"])
        self.assertEqual(app["exam"]["count"] if "count" in app["exam"] else len(app["exam"]["questions"]), 15)

    def test_reuse_refuses_new_html_and_bad_id(self):
        p = plan_reuse()
        p["application_plan"]["player"]["html"] = GOOD_HTML
        self.assertFalse(composer.compose_app(p)["ok"])
        p = plan_reuse()
        p["application_plan"]["player"]["player_id"] = 999
        self.assertFalse(composer.compose_app(p)["ok"])

    def test_generate_is_separate_draft(self):
        res = composer.compose_app(plan_generate())
        self.assertTrue(res["ok"], res["errors"])
        app = res["app"]
        self.assertEqual(app["status"], "draft")
        self.assertEqual(app["ai_requested_status"], "APPROVED")  # AI xin duyệt nhưng bị hạ cấp
        self.assertIsNone(app["player"]["player_id"])
        self.assertEqual(app["player"]["html"], GOOD_HTML)
        self.assertTrue(app["player"]["catalog_written"] is False)
        self.assertEqual(len(app["exam"]["questions"]), 2)

    def test_mouse_fallback_is_mandatory(self):
        p = plan_reuse()
        p["application_plan"]["interaction"]["mouse_always_enabled"] = False
        res = composer.compose_app(p)
        self.assertFalse(res["ok"])
        self.assertTrue(any("mouse_always_enabled" in x for x in res["errors"]))

    def test_tool_compose_application(self):
        res = tools.compose_application(json.dumps(plan_reuse()))
        self.assertTrue(res["ok"], res["errors"])
        self.assertEqual(res["status"], "draft")

    def test_runtime_static_checks(self):
        res = composer.runtime_static_checks()
        self.assertTrue(res["ok"], res["checks"])
        self.assertIn("tĩnh", res["note"])
        self.assertIn("connect-src 'none'", contract.CSP)
        self.assertEqual(len(composer.FALLBACK_CASES), 6)


if __name__ == "__main__":
    unittest.main()
