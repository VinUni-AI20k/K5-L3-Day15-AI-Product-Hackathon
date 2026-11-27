"""Kiểm luồng codebase/agent.py và các nhánh nối model trong codebase/ai.py bằng model GIẢ LẬP (không mạng, không key):
python -m unittest discover -s ailab -p "test_*.py" """
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "codebase"))
sys.path.insert(0, HERE)

import agent  # noqa: E402
import ai  # noqa: E402
import llm  # noqa: E402
import tools  # noqa: E402

F = chr(96) * 3
GOOD = llm.QUIZ_TEMPLATE.replace("__TITLE__", "Quiz thử")
FLAGGED = GOOD.replace("</body>", "<script>\nfetch('https://x.test/a');\n</script></body>")


def fake_model(*texts):
    it = iter(texts)
    return mock.patch.object(agent, "call_model", side_effect=lambda s, u: {"text": next(it), "model": "m", "tokens_in": 1, "tokens_out": 1})


class Agent(unittest.TestCase):
    def test_valid_game_is_a_draft(self):
        with fake_model("Đây nhé.\n" + F + "html\n" + GOOD + "\n" + F):
            out = agent.answer("game quiz ABCD")["output"]
        self.assertIn("BẢN NHÁP chờ người duyệt", out)
        self.assertIn("Không có cờ cảnh báo", out)
        self.assertIn('id="jl-camera"', out)

    def test_flags_are_shown_with_line_and_reason(self):
        with fake_model(F + "html\n" + FLAGGED + "\n" + F):
            out = agent.answer("game quiz ABCD")["output"]
        self.assertIn("cờ cảnh báo", out)
        self.assertIn("Gọi mạng", out)
        self.assertIn("fetch(", out)

    def test_clarifying_question_is_returned_without_game(self):
        with fake_model("Game chơi thế nào, học sinh làm gì?"):
            out = agent.answer("làm game")["output"]
        self.assertEqual(out, "Game chơi thế nào, học sinh làm gì?")

    def test_one_repair_round(self):
        with fake_model(F + "html\n<html></html>\n" + F, F + "html\n" + GOOD + "\n" + F) as m:
            out = agent.answer("game quiz ABCD")["output"]
            self.assertEqual(m.call_count, 2)
        self.assertIn("BẢN NHÁP", out)

    def test_two_bad_files_is_honest_failure(self):
        bad = F + "html\n<html></html>\n" + F
        with fake_model(bad, bad) as m:
            out = agent.answer("game quiz ABCD")["output"]
            self.assertEqual(m.call_count, agent.MAX_STEPS)
        self.assertIn("chưa viết được", out)
        self.assertNotIn("<html>", out)

    def test_tool_check_game(self):
        self.assertTrue(tools.check_game(GOOD)["ok"])
        r = tools.check_game("<p>x</p>")
        self.assertFalse(r["ok"])
        self.assertTrue(r["error"])


class Providers(unittest.TestCase):
    def call(self, provider, response):
        with mock.patch.object(ai, "MODEL_PROVIDER", provider), mock.patch.object(ai, "MODEL_NAME", "m1"), \
             mock.patch.object(ai, "API_KEY", "k"), mock.patch.object(ai, "post_json", return_value=response) as p:
            return ai.call_model("sys", "hello"), p

    def test_gemini(self):
        r, p = self.call("gemini", {"candidates": [{"content": {"parts": [{"text": "xin "}, {"text": "chào"}]}}],
                                    "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 3, "thoughtsTokenCount": 2}})
        self.assertEqual((r["text"], r["tokens_in"], r["tokens_out"], r["model"]), ("xin chào", 7, 5, "m1"))
        self.assertNotIn("k", p.call_args[0][0])  # key không nằm trên URL
        self.assertEqual(p.call_args[0][1], {"x-goog-api-key": "k"})

    def test_openai(self):
        r, _ = self.call("openai", {"choices": [{"message": {"content": "hi"}}], "usage": {"prompt_tokens": 4, "completion_tokens": 2}})
        self.assertEqual((r["text"], r["tokens_in"], r["tokens_out"]), ("hi", 4, 2))

    def test_claude(self):
        r, _ = self.call("anthropic", {"content": [{"type": "text", "text": "hi"}], "usage": {"input_tokens": 5, "output_tokens": 6}})
        self.assertEqual((r["text"], r["tokens_in"], r["tokens_out"]), ("hi", 5, 6))

    def test_unknown_provider_and_missing_key(self):
        with mock.patch.object(ai, "MODEL_PROVIDER", "zzz"):
            with self.assertRaises(NotImplementedError):
                ai.call_model("s", "u")
        with mock.patch.object(ai, "MODEL_PROVIDER", "openai"), mock.patch.object(ai, "API_KEY", ""), mock.patch.object(ai, "MODEL_NAME", "m"):
            with self.assertRaises(RuntimeError):
                ai.call_model("s", "u")


if __name__ == "__main__":
    unittest.main()
