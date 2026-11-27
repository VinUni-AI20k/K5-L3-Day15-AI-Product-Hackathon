"""Kiểm tự động phần lõi (không cần mạng, không cần model): python -m unittest discover -s ailab -p "test_*.py" """
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["AILAB_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")

import contract  # noqa: E402
import llm  # noqa: E402
import store  # noqa: E402


class FlagDetail(unittest.TestCase):
    def test_flag_has_reason_line_excerpt(self):
        html = "<html>\n<body>\n<script>var a=1;\nfetch('https://x.test/steal');\n</script></body></html>"
        f = [x for x in contract.scan(html) if x["code"] == "network"][0]
        self.assertEqual(f["line"], 4)
        self.assertIn("fetch(", f["excerpt"])
        self.assertTrue(f["reason"])

    def test_foreign_script_flag(self):
        f = contract.scan('<script src="https://evil.example/x.js"></script>')
        self.assertEqual(f[0]["code"], "script")
        self.assertIn("evil.example", f[0]["label"])
        self.assertEqual(f[0]["line"], 1)

    def test_clean_template_has_no_flags(self):
        self.assertEqual(contract.scan(llm.QUIZ_TEMPLATE.replace("__TITLE__", "T")), [])


class ImageAndExam(unittest.TestCase):
    PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

    def test_image_ok_and_clear(self):
        self.assertEqual(store.clean_image(self.PNG), self.PNG)
        self.assertEqual(store.clean_image(""), "")
        self.assertEqual(store.clean_image(None), "")

    def test_image_refusals(self):
        for bad in ("http://x/y.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,AAAA", "data:image/png;base64,!!!",
                    "data:image/png;base64," + "A" * 500000):
            with self.assertRaises(store.Err):
                store.clean_image(bad)

    def test_exam_needs_valid_questions(self):
        ok = store.clean_exam({"name": "Đề 1", "content": "2+2=? | 3 | 4 | =B"})
        self.assertEqual(ok[0], "Đề 1")
        for bad in ({"name": "", "content": "a | b | c | =A"}, {"name": "x", "content": ""}, {"name": "x", "content": "sai mẫu"}):
            with self.assertRaises(store.Err):
                store.clean_exam(bad)


class SeedImages(unittest.TestCase):
    def test_every_seed_file_is_a_valid_image(self):
        import base64
        for table, names in store.SEED_IMAGES.items():
            for name, fn in names.items():
                with open(os.path.join(store.SEED_DIR, fn), "rb") as f:
                    uri = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
                self.assertEqual(store.clean_image(uri), uri, "%s/%s" % (table, name))


class SeedExams(unittest.TestCase):
    def test_seed_exams_parse_and_are_big(self):
        import json
        with open(store.SEED_EXAMS_FILE, encoding="utf-8") as f:
            items = json.load(f)
        self.assertGreaterEqual(len(items), 5)
        for e in items:
            qs = store.parse_questions(e["content"])
            self.assertGreaterEqual(len(qs), 15, e["name"])
            self.assertTrue(os.path.exists(os.path.join(store.SEED_DIR, e["image"])), e["name"])
            for q in qs:  # đáp án đúng phải nằm trong các lựa chọn
                self.assertIn(q["answer"], [c["key"] for c in q["choices"]])


class Hands(unittest.TestCase):
    def test_hands_kind_allowed_in_player(self):
        html = '<script type="application/json" id="jl-camera">{"name":"T","inputs":[{"key":"grab","label":"Nắm","required":true,"accepts":["action"]}],"kinds":["hands","image"]}</script>'
        m, err = contract.parse(html)
        self.assertIsNone(err)
        self.assertEqual(m["kinds"], ["hands", "image"])


class Contract(unittest.TestCase):
    def test_templates_are_valid(self):
        for tpl in (llm.QUIZ_TEMPLATE, llm.WHEEL_TEMPLATE):
            m, err = contract.parse(tpl.replace("__TITLE__", "T"))
            self.assertIsNone(err)
            self.assertTrue(m["name"])

    def test_refusals(self):
        self.assertEqual(contract.parse("<html></html>")[1][0], "no_block")
        self.assertEqual(contract.parse("x" * (contract.MAX_BYTES + 1))[1][0], "too_big")
        two = '<script type="application/json" id="jl-camera">{}</script>' * 2
        self.assertEqual(contract.parse(two)[1][0], "many_blocks")

    def test_scan_flags(self):
        codes = {f["code"] for f in contract.scan("<script>fetch('x');eval('1');window.open('y')</script>")}
        self.assertTrue({"network", "code", "window"} <= codes)
        self.assertEqual(contract.scan("<script>parent.postMessage({},'*')</script>"), [])

    def test_secure_injects_csp_first(self):
        out = contract.secure("<html><head><title>x</title></head></html>")
        self.assertLess(out.index("Content-Security-Policy"), out.index("<title>"))


class Chat(unittest.TestCase):
    def test_fake_is_valid_and_labelled(self):
        out = llm.generate([{"role": "user", "text": "game câu hỏi trắc nghiệm"}])
        self.assertTrue(out["simulated"])
        self.assertIsNone(contract.parse(out["html"])[1])

    def test_extract(self):
        f = llm.FENCE
        text, html = llm.extract("Xong.\n" + f + "html\n<p>a</p>\n" + f)
        self.assertEqual((text, html), ("Xong.", "<p>a</p>"))


class Questions(unittest.TestCase):
    def test_parse(self):
        qs = store.parse_questions("2+2 | 3 | 4 | =B\nTrời xanh | =Đúng")
        self.assertEqual(qs[0]["answer"], "B")
        self.assertEqual(qs[1]["type"], "truefalse")
        self.assertEqual(qs[1]["answer"], "T")

    def test_bad_line(self):
        with self.assertRaises(store.Err):
            store.parse_questions("thiếu đáp án đúng | a | b")


if __name__ == "__main__":
    unittest.main()
