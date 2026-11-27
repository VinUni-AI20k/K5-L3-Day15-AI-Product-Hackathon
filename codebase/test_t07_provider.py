"""T07 — kiểm thử provider thật bằng fixture, KHÔNG gọi mạng (urlopen bị patch)."""
import http.client
import io
import json
import os
import pickle
import socket
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
FAKE_ENV = {"MODEL_PROVIDER": "fake"}

# ai đọc biến môi trường lúc import; patch.dict trả os.environ về nguyên trạng sau khi import.
with mock.patch.dict(os.environ, FAKE_ENV):
    import ai
    import agent
    import tracing
    import provider_usage as pu

_env_patch = mock.patch.dict(os.environ, FAKE_ENV)


def setUpModule():
    _env_patch.start()


def tearDownModule():
    _env_patch.stop()

BODY = "SENTINEL-BODY-123"
KEY = "sk-SENTINEL-KEY-456"

OPENAI = {"choices": [{"message": {"content": "xin chào"}}],
          "usage": {"prompt_tokens": 11, "completion_tokens": 22, "total_tokens": 33,
                    "completion_tokens_details": {"reasoning_tokens": 7}}}
ANTHROPIC = {"content": [{"type": "text", "text": "xin chào"}],
             "usage": {"input_tokens": 10, "cache_creation_input_tokens": 5,
                       "cache_read_input_tokens": 3, "output_tokens": 20}}
GEMINI = {"candidates": [{"content": {"parts": [{"text": "xin chào"}]}}],
          "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 8,
                            "thoughtsTokenCount": 4, "totalTokenCount": 24}}
OLLAMA = {"message": {"content": "xin chào"}, "prompt_eval_count": 9, "eval_count": 6}


class FakeResp:
    def __init__(self, payload):
        self._b = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def http_err(code, body=BODY):
    payload = json.dumps({"error": {"message": body}}).encode("utf-8") if body is not None else b""
    return urllib.error.HTTPError("https://x.test/v1?key=" + KEY, code, "msg", {}, io.BytesIO(payload))


def raises_pe(tc, fn, *a):
    with tc.assertRaises(pu.ProviderError) as cm:
        fn(*a)
    return cm.exception


class T07_01_ValidUsage(unittest.TestCase):
    def test_openai_no_double_count_reasoning(self):  # T07-01
        self.assertEqual(pu.extract_usage("openai", OPENAI), (11, 22))

    def test_anthropic_adds_cache(self):  # T07-01
        self.assertEqual(pu.extract_usage("anthropic", ANTHROPIC), (18, 20))
        self.assertEqual(pu.extract_usage("claude", ANTHROPIC), (18, 20))

    def test_anthropic_without_cache(self):  # T07-01
        d = {"usage": {"input_tokens": 4, "output_tokens": 2}}
        self.assertEqual(pu.extract_usage("anthropic", d), (4, 2))

    def test_gemini_adds_thoughts(self):  # T07-01
        self.assertEqual(pu.extract_usage("gemini", GEMINI), (12, 12))

    def test_gemini_only_one_output_field(self):  # T07-01
        d = {"usageMetadata": {"promptTokenCount": 1, "thoughtsTokenCount": 5}}
        self.assertEqual(pu.extract_usage("gemini", d), (1, 5))
        d = {"usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 3}}
        self.assertEqual(pu.extract_usage("gemini", d), (1, 3))

    def test_ollama(self):  # T07-01
        self.assertEqual(pu.extract_usage("ollama", OLLAMA), (9, 6))

    def test_zero_is_valid(self):  # T07-01
        d = {"prompt_eval_count": 0, "eval_count": 0}
        self.assertEqual(pu.extract_usage("ollama", d), (0, 0))


class T07_02_Missing(unittest.TestCase):
    def check(self, provider, data):
        self.assertEqual(raises_pe(self, pu.extract_usage, provider, data).kind, "usage_missing")

    def test_no_usage_block(self):  # T07-02
        self.check("openai", {"choices": []})
        self.check("anthropic", {"content": []})
        self.check("gemini", {"candidates": []})
        self.check("ollama", {"message": {}})

    def test_missing_required_field(self):  # T07-02
        self.check("openai", {"usage": {"prompt_tokens": 1}})
        self.check("openai", {"usage": {"completion_tokens": 1}})
        self.check("anthropic", {"usage": {"input_tokens": 1}})
        self.check("anthropic", {"usage": {"output_tokens": 1}})
        self.check("gemini", {"usageMetadata": {"candidatesTokenCount": 1}})
        self.check("ollama", {"prompt_eval_count": 1})
        # R1: Ollama được vắng prompt_eval_count (prompt nằm trong KV cache) → tokens_in = 0
        self.assertEqual(pu.extract_usage("ollama", {"eval_count": 1}), (0, 1))

    def test_gemini_missing_both_output(self):  # T07-02
        # Chỉ phản hồi CÓ chữ mà vắng cả hai trường output mới là usage_missing
        # (không có chữ → tokens_out = 0, xem test_gemini_safety_prompt_only)
        self.check("gemini", {"candidates": [{"content": {"parts": [{"text": "x"}]}}],
                              "usageMetadata": {"promptTokenCount": 3}})


class T07_03_BadTypes(unittest.TestCase):
    BAD = [True, False, "5", 1.5, 2.0, -1]

    def check(self, provider, make):
        for v in self.BAD:
            with self.subTest(provider=provider, value=repr(v)):
                self.assertEqual(raises_pe(self, pu.extract_usage, provider, make(v)).kind, "bad_response")

    def test_openai(self):  # T07-03
        self.check("openai", lambda v: {"usage": {"prompt_tokens": v, "completion_tokens": 1}})
        self.check("openai", lambda v: {"usage": {"prompt_tokens": 1, "completion_tokens": v}})

    def test_anthropic(self):  # T07-03
        self.check("anthropic", lambda v: {"usage": {"input_tokens": v, "output_tokens": 1}})
        self.check("anthropic", lambda v: {"usage": {"input_tokens": 1, "output_tokens": v}})
        self.check("anthropic", lambda v: {"usage": {"input_tokens": 1, "output_tokens": 1,
                                                      "cache_read_input_tokens": v}})
        self.check("anthropic", lambda v: {"usage": {"input_tokens": 1, "output_tokens": 1,
                                                      "cache_creation_input_tokens": v}})

    def test_gemini(self):  # T07-03
        self.check("gemini", lambda v: {"usageMetadata": {"promptTokenCount": v, "candidatesTokenCount": 1}})
        self.check("gemini", lambda v: {"usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": v}})
        self.check("gemini", lambda v: {"usageMetadata": {"promptTokenCount": 1, "thoughtsTokenCount": v}})

    def test_ollama(self):  # T07-03
        self.check("ollama", lambda v: {"prompt_eval_count": v, "eval_count": 1})
        self.check("ollama", lambda v: {"prompt_eval_count": 1, "eval_count": v})


class T07_04_HttpError(unittest.TestCase):
    def test_status_kind_mapping(self):  # T07-04
        cases = {401: "auth", 403: "auth", 429: "rate_limit", 408: "timeout", 504: "timeout",
                 500: "http", 400: "http", 502: "http"}
        for status, kind in cases.items():
            with self.subTest(status=status):
                body = json.dumps({"error": {"message": BODY, "type": "some_type"}}).encode()
                e = pu.http_error("openai", status, body)
                self.assertIsInstance(e, pu.ProviderError)
                self.assertEqual(e.kind, kind)
                self.assertEqual(e.status, status)
                self.assertEqual(e.provider, "openai")
                self.assertNotIn(BODY, str(e))
                self.assertNotIn(KEY, str(e))
                self.assertIn("HTTP %d" % status, str(e))

    def test_code_extracted_when_valid(self):  # T07-04
        for body, code in [({"error": {"type": "invalid_request_error", "message": BODY}}, "invalid_request_error"),
                           ({"error": {"code": "rate_limit_exceeded", "message": BODY}}, "rate_limit_exceeded"),
                           ({"error": {"status": "RESOURCE_EXHAUSTED", "message": BODY}}, "RESOURCE_EXHAUSTED")]:
            with self.subTest(code=code):
                e = pu.http_error("gemini", 429, json.dumps(body).encode())
                self.assertEqual(e.code, code)
                self.assertIn("(%s)" % code, str(e))
                self.assertNotIn(BODY, str(e))

    def test_code_rejected_when_invalid(self):  # T07-04
        for bad in ["has spaces " + BODY, "x" * 65, "", "a/b", BODY + "!"]:
            with self.subTest(bad=bad[:20]):
                body = json.dumps({"error": {"type": bad, "message": BODY}}).encode()
                e = pu.http_error("openai", 500, body)
                self.assertIsNone(e.code)
                self.assertNotIn(BODY, str(e))

    def test_code_never_message_text(self):  # T07-04
        body = json.dumps({"error": {"message": BODY}}).encode()
        e = pu.http_error("openai", 500, body)
        self.assertIsNone(e.code)

    def test_non_json_body(self):  # T07-04
        for raw in [(BODY).encode(), b"", b"\xff\xfe" + BODY.encode(), b"[1,2]", b'"' + BODY.encode() + b'"']:
            e = pu.http_error("openai", 500, raw)
            self.assertEqual(e.kind, "http")
            self.assertIsNone(e.code)
            self.assertNotIn(BODY, str(e))


class ProviderPatched(unittest.TestCase):
    def setUp(self):
        for name, val in (("MODEL_PROVIDER", "openai"), ("MODEL_NAME", "test-model"), ("API_KEY", KEY)):
            p = mock.patch.object(ai, name, val)
            p.start()
            self.addCleanup(p.stop)
        tracing._case.update(id=None, events=None)
        self.addCleanup(tracing._case.update, id=None, events=None)

    def use(self, provider):
        p = mock.patch.object(ai, "MODEL_PROVIDER", provider)
        p.start()
        self.addCleanup(p.stop)

    def patch_urlopen(self, **kw):
        p = mock.patch("urllib.request.urlopen", **kw)
        m = p.start()
        self.addCleanup(p.stop)
        return m


class T07_05_Transport(ProviderPatched):
    def run_err(self, side_effect):
        self.patch_urlopen(side_effect=side_effect)
        with self.assertRaises(pu.ProviderError) as cm:
            ai.post_json("https://x.test/v1", {"Authorization": "Bearer " + KEY}, {"a": 1}, provider="openai")
        e = cm.exception
        for s in (BODY, KEY):
            self.assertNotIn(s, str(e))
        return e

    def test_timeouts(self):  # T07-05
        for exc in (socket.timeout(), TimeoutError(), urllib.error.URLError(socket.timeout())):
            with self.subTest(exc=type(exc).__name__):
                self.assertEqual(self.run_err(exc).kind, "timeout")

    def test_network(self):  # T07-05
        e = self.run_err(urllib.error.URLError("dns fail"))
        self.assertEqual(e.kind, "network")
        self.assertIsNone(e.status)

    def test_bad_json(self):  # T07-05
        self.patch_urlopen(return_value=FakeResp(("not json " + BODY).encode()))
        with self.assertRaises(pu.ProviderError) as cm:
            ai.post_json("https://x.test/v1", {}, {}, provider="openai")
        self.assertEqual(cm.exception.kind, "bad_response")
        self.assertNotIn(BODY, str(cm.exception))

    def test_http_error_via_post_json(self):  # T07-05
        e = self.run_err(http_err(401))
        self.assertEqual(e.kind, "auth")
        self.assertEqual(e.status, 401)

    def test_no_chained_context_leak(self):  # T07-05
        e = self.run_err(http_err(500))
        self.assertTrue(e.__suppress_context__ or e.__cause__ is None)
        self.assertIsNone(e.__cause__)


class T07_06_CallModel(ProviderPatched):
    def assert_error_trace(self, events):
        """R7a: đúng một event model có lỗi, không fake fallback, không token giả."""
        self.assertEqual([e["kind"] for e in events], ["model"])
        self.assertTrue(events[0].get("error"))
        for e in events:
            self.assertNotEqual(e.get("model"), "fake")
            self.assertEqual(e.get("tokens_in") or 0, 0)
            self.assertEqual(e.get("tokens_out") or 0, 0)

    def test_success_each_provider(self):  # T07-06a
        cases = [("openai", OPENAI, 11, 22), ("anthropic", ANTHROPIC, 18, 20),
                 ("claude", ANTHROPIC, 18, 20), ("gemini", GEMINI, 12, 12), ("ollama", OLLAMA, 9, 6)]
        for prov, payload, tin, tout in cases:
            with self.subTest(provider=prov):
                self.use(prov)
                m = self.patch_urlopen(return_value=FakeResp(payload))
                r = ai.call_model("sys", "user")
                self.assertEqual(set(r), {"text", "model", "tokens_in", "tokens_out"})
                self.assertEqual(r["text"], "xin chào")
                self.assertEqual(r["model"], "test-model")
                self.assertEqual((r["tokens_in"], r["tokens_out"]), (tin, tout))
                self.assertIs(type(r["tokens_in"]), int)
                self.assertIs(type(r["tokens_out"]), int)
                self.assertTrue(m.called)

    def test_trace_records_tokens(self):  # T07-06a
        self.patch_urlopen(return_value=FakeResp(OPENAI))
        tracing.begin("c")
        ai.call_model("s", "u")
        summary, events = tracing.end()
        self.assertEqual((summary["tokens_in"], summary["tokens_out"]), (11, 22))
        self.assertEqual(summary["errors"], [])

    def test_http_errors_trace_and_raise(self):  # T07-06b
        for code in (401, 403, 429, 500, 504):
            with self.subTest(status=code):
                self.patch_urlopen(side_effect=http_err(code))
                tracing.begin("c")
                with self.assertRaises(pu.ProviderError) as cm:
                    ai.call_model("s", "u")
                summary, events = tracing.end()
                self.assertEqual(cm.exception.status, code)
                self.assertTrue(summary["errors"])
                self.assert_error_trace(events)
                self.assertEqual(summary["tokens_in"] + summary["tokens_out"], 0)
                blob = json.dumps([summary, events], ensure_ascii=False) + str(cm.exception)
                self.assertNotIn(BODY, blob)
                self.assertNotIn(KEY, blob)
                self.assertNotIn("fake", summary["models"])

    def test_network_and_timeout_trace(self):  # T07-06b
        for exc in (urllib.error.URLError("dns fail"), urllib.error.URLError(socket.timeout()), TimeoutError()):
            with self.subTest(exc=type(exc).__name__):
                self.patch_urlopen(side_effect=exc)
                tracing.begin("c")
                with self.assertRaises(pu.ProviderError):
                    ai.call_model("s", "u")
                summary, events = tracing.end()
                self.assertTrue(summary["errors"])
                self.assert_error_trace(events)
                self.assertNotIn(KEY, json.dumps(events, ensure_ascii=False))

    def test_missing_usage_raises(self):  # T07-06b
        self.patch_urlopen(return_value=FakeResp({"choices": [{"message": {"content": "x"}}]}))
        tracing.begin("c")
        with self.assertRaises(pu.ProviderError) as cm:
            ai.call_model("s", "u")
        summary, events = tracing.end()
        self.assertEqual(cm.exception.kind, "usage_missing")
        self.assertTrue(summary["errors"])
        self.assert_error_trace(events)

    def test_gemini_no_candidates(self):  # T07-06b
        self.use("gemini")
        for fb in ({"promptFeedback": {"blockReason": "SAFETY"}},
                   {"promptFeedback": {"blockReason": "bad reason " + BODY}, "x": BODY}):
            with self.subTest(fb=list(fb)):
                self.patch_urlopen(return_value=FakeResp(fb))
                with self.assertRaises(pu.ProviderError) as cm:
                    ai.call_model("s", "u")
                self.assertEqual(cm.exception.kind, "bad_response")
                self.assertNotIn(BODY, str(cm.exception))

    def test_malformed_structure(self):  # T07-06b
        self.patch_urlopen(return_value=FakeResp({"usage": {"prompt_tokens": 1, "completion_tokens": 1}}))
        with self.assertRaises(pu.ProviderError) as cm:
            ai.call_model("s", "u")
        self.assertEqual(cm.exception.kind, "bad_response")


class R1_OllamaCache(ProviderPatched):
    def test_missing_prompt_eval_count_is_zero(self):  # R1
        for n in (0, 1, 42):
            with self.subTest(n=n):
                self.assertEqual(pu.extract_usage("ollama", {"eval_count": n}), (0, n))

    def test_present_prompt_eval_count_still_strict(self):  # R1
        for bad in (True, False, "5", 1.5, -1, [], {}):
            with self.subTest(bad=repr(bad)):
                e = raises_pe(self, pu.extract_usage, "ollama", {"prompt_eval_count": bad, "eval_count": 1})
                self.assertEqual(e.kind, "bad_response")

    def test_missing_both_is_usage_missing(self):  # R1
        self.assertEqual(raises_pe(self, pu.extract_usage, "ollama", {}).kind, "usage_missing")

    def test_call_model_without_prompt_eval_count(self):  # R1
        self.use("ollama")
        self.patch_urlopen(return_value=FakeResp({"message": {"content": "ok"}, "eval_count": 6}))
        r = ai.call_model("s", "u")
        self.assertEqual((r["text"], r["tokens_in"], r["tokens_out"]), ("ok", 0, 6))


class R2_EmptyTextKeepsUsage(ProviderPatched):
    def check_empty(self, provider, payload, tin, tout):
        self.use(provider)
        self.patch_urlopen(return_value=FakeResp(payload))
        tracing.begin("c")
        r = ai.call_model("s", "u")
        summary, events = tracing.end()
        self.assertEqual(r, {"text": "", "model": "test-model", "tokens_in": tin, "tokens_out": tout})
        self.assertGreater(tin + tout, 0)
        self.assertEqual((summary["tokens_in"], summary["tokens_out"]), (tin, tout))
        self.assertEqual(summary["errors"], [])
        self.assertEqual([e["kind"] for e in events], ["model"])
        self.assertNotIn("error", events[0])

    def test_openai_refusal(self):  # R2
        payload = dict(OPENAI, choices=[{"message": {"content": None, "refusal": "từ chối"}}])
        self.check_empty("openai", payload, 11, 22)

    def test_anthropic_empty_content(self):  # R2
        self.check_empty("anthropic", dict(ANTHROPIC, content=[]), 18, 20)

    def test_anthropic_no_text_block(self):  # R2
        payload = dict(ANTHROPIC, content=[{"type": "thinking", "thinking": "..."}])
        self.check_empty("claude", payload, 18, 20)

    def test_gemini_safety_without_parts(self):  # R2
        payload = dict(GEMINI, candidates=[{"finishReason": "SAFETY"}])
        self.check_empty("gemini", payload, 12, 12)

    def test_gemini_safety_prompt_only(self):  # R2: SAFETY, không content, chỉ promptTokenCount
        payload = {"candidates": [{"finishReason": "SAFETY"}], "usageMetadata": {"promptTokenCount": 9}}
        self.assertEqual(pu.extract_usage("gemini", payload), (9, 0))
        self.check_empty("gemini", payload, 9, 0)

    def test_gemini_safety_bad_output_type(self):  # R2: trường output có mặt nhưng sai kiểu
        self.use("gemini")
        for key in ("candidatesTokenCount", "thoughtsTokenCount"):
            for bad in (True, False, "5", 1.5, -1):
                with self.subTest(key=key, bad=repr(bad)):
                    payload = {"candidates": [{"finishReason": "SAFETY"}],
                               "usageMetadata": {"promptTokenCount": 9, key: bad}}
                    self.assertEqual(raises_pe(self, pu.extract_usage, "gemini", payload).kind, "bad_response")
                    self.patch_urlopen(return_value=FakeResp(payload))
                    self.assertEqual(raises_pe(self, ai.call_model, "s", "u").kind, "bad_response")

    def test_gemini_max_tokens(self):  # R2
        payload = {"candidates": [{"content": {"role": "model"}, "finishReason": "MAX_TOKENS"}],
                   "usageMetadata": {"promptTokenCount": 12, "thoughtsTokenCount": 30}}
        self.check_empty("gemini", payload, 12, 30)

    def test_gemini_blocked_prompt_no_candidates(self):  # R2
        base = {"promptFeedback": {"blockReason": "SAFETY"}, "usageMetadata": {"promptTokenCount": 12}}
        for payload in (base, dict(base, candidates=[])):
            with self.subTest(has_candidates_key="candidates" in payload):
                self.check_empty("gemini", payload, 12, 0)

    def test_ollama_empty_content(self):  # R2
        self.check_empty("ollama", dict(OLLAMA, message={"content": ""}), 9, 6)

    def check_broken(self, provider, base, variants):
        self.use(provider)
        for label, payload in variants:
            with self.subTest(provider=provider, case=label):
                self.patch_urlopen(return_value=FakeResp(dict(base, **payload)))
                tracing.begin("c")
                with self.assertRaises(pu.ProviderError) as cm:
                    ai.call_model("s", "u")
                summary, events = tracing.end()
                self.assertEqual(cm.exception.kind, "bad_response")
                self.assertTrue(summary["errors"])
                self.assertNotIn(BODY, str(cm.exception) + json.dumps(events, ensure_ascii=False))

    def test_openai_broken_structure(self):  # R2
        self.check_broken("openai", {"usage": OPENAI["usage"]}, [
            ("no choices", {}),
            ("choices dict", {"choices": {"a": BODY}}),
            ("choices str", {"choices": BODY}),
            ("choices empty", {"choices": []}),
            ("choice not dict", {"choices": [1]}),
            ("no message", {"choices": [{}]}),
            ("no content", {"choices": [{"message": {}}]}),
            ("content number", {"choices": [{"message": {"content": 5}}]}),
            ("content dict", {"choices": [{"message": {"content": {"a": BODY}}}]}),
        ])

    def test_anthropic_broken_structure(self):  # R2
        self.check_broken("anthropic", {"usage": ANTHROPIC["usage"]}, [
            ("no content", {}),
            ("content number", {"content": 5}),
            ("content str", {"content": BODY}),
            ("block not dict", {"content": [BODY]}),
            ("text number", {"content": [{"type": "text", "text": 5}]}),
        ])

    def test_gemini_broken_structure(self):  # R2
        self.check_broken("gemini", {"usageMetadata": GEMINI["usageMetadata"]}, [
            ("candidates dict", {"candidates": {"a": BODY}}),
            ("candidate not dict", {"candidates": [5]}),
            ("content number", {"candidates": [{"content": 5}]}),
            ("parts number", {"candidates": [{"content": {"parts": 5}}]}),
            ("part not dict", {"candidates": [{"content": {"parts": [BODY]}}]}),
            ("text number", {"candidates": [{"content": {"parts": [{"text": 5}]}}]}),
        ])

    def test_ollama_broken_structure(self):  # R2
        self.check_broken("ollama", {"prompt_eval_count": 9, "eval_count": 6}, [
            ("no message", {}),
            ("message str", {"message": BODY}),
            ("no content", {"message": {}}),
            ("content number", {"message": {"content": 5}}),
        ])


class R4_ExceptionKinds(ProviderPatched):
    SECRET = BODY + " " + KEY

    def check_kind(self, exc, kind):
        self.patch_urlopen(side_effect=exc)
        tracing.begin("c")
        with self.assertRaises(pu.ProviderError) as cm:
            ai.call_model("s", "u")
        _, events = tracing.end()
        e = cm.exception
        self.assertEqual(e.kind, kind)
        self.assertIsNone(e.__cause__)
        self.assertTrue(e.__suppress_context__)
        blob = str(e) + json.dumps(events, ensure_ascii=False)
        self.assertNotIn(BODY, blob)
        self.assertNotIn(KEY, blob)
        self.assertTrue(events[0].get("error"))
        return e

    def test_config_errors(self):  # R4
        self.assertIn("config", pu.KINDS)
        for exc in (ValueError(self.SECRET), TypeError(self.SECRET), http.client.InvalidURL(self.SECRET)):
            with self.subTest(exc=type(exc).__name__):
                e = self.check_kind(exc, "config")
                self.assertEqual(str(e), "openai config: cấu hình gọi model không hợp lệ (kiểm MODEL_NAME, URL và API_KEY)")

    def test_network_errors(self):  # R4
        for exc in (ConnectionRefusedError(self.SECRET), http.client.RemoteDisconnected(self.SECRET)):
            with self.subTest(exc=type(exc).__name__):
                self.check_kind(exc, "network")

    def test_unknown_exception_not_relabelled(self):  # R4
        boom = RuntimeError("lỗi lạ")
        self.patch_urlopen(side_effect=boom)
        with self.assertRaises(RuntimeError) as cm:
            ai.post_json("https://x.test/v1", {}, {}, provider="openai")
        self.assertIs(cm.exception, boom)
        self.assertNotIsInstance(cm.exception, pu.ProviderError)


class RecordingBody(io.BytesIO):
    """BytesIO ghi lại tham số n của mỗi lần read."""

    def __init__(self, data):
        super().__init__(data)
        self.sizes = []
        self.returned = 0

    def read(self, n=-1):
        self.sizes.append(n)
        out = super().read(n)
        self.returned += len(out)
        return out


def sized_error_body(size):
    head = b'{"error": {"type": "big_code", "message": "' + BODY.encode()
    tail = b'"}}'
    body = head + b"a" * (size - len(head) - len(tail)) + tail
    assert len(body) == size
    return body


class R5_ErrorBodyLimit(ProviderPatched):
    LIMIT = 65536

    def via_post_json(self, body):
        fp = RecordingBody(body)
        self.patch_urlopen(side_effect=urllib.error.HTTPError("https://x.test/v1", 500, "msg", {}, fp))
        with self.assertRaises(pu.ProviderError) as cm:
            ai.post_json("https://x.test/v1", {}, {}, provider="openai")
        self.assertTrue(fp.sizes, "body phải được đọc qua read(n)")
        for n in fp.sizes:
            self.assertIsNotNone(n)
            self.assertTrue(0 <= n <= self.LIMIT + 1, "read(%r)" % n)
        self.assertLessEqual(fp.returned, self.LIMIT + 1)
        self.assertNotIn(BODY, str(cm.exception))
        return cm.exception

    def test_body_within_limit_parsed(self):  # R5
        for size in (200, self.LIMIT - 1, self.LIMIT):
            with self.subTest(size=size):
                body = sized_error_body(size)
                self.assertEqual(pu.http_error("openai", 500, body).code, "big_code")
                self.assertEqual(self.via_post_json(body).code, "big_code")

    def test_body_over_limit_not_parsed(self):  # R5
        for size in (self.LIMIT + 1, self.LIMIT * 3):
            with self.subTest(size=size):
                body = sized_error_body(size)
                self.assertIsNone(pu.http_error("openai", 500, body).code)
                e = self.via_post_json(body)
                self.assertIsNone(e.code)
                self.assertEqual((e.kind, e.status), ("http", 500))

    def test_over_limit_not_truncated_then_parsed(self):  # R5
        # JSON hợp lệ trong 64KB đầu, thêm khoảng trắng cho vượt giới hạn: vẫn không được parse
        body = b'{"error": {"type": "big_code"}}' + b" " * self.LIMIT
        self.assertIsNone(self.via_post_json(body).code)


class R6_Pickle(unittest.TestCase):
    def test_round_trip(self):  # R6
        cases = [pu.ProviderError("openai", "auth", status=401, code="invalid_api_key"),
                 pu.ProviderError("gemini", "bad_response", code="SAFETY", field="candidates"),
                 pu.ProviderError("ollama", "usage_missing", field="eval_count"),
                 pu.ProviderError("openai", "config"),
                 pu.http_error("anthropic", 429, b'{"error": {"type": "rate_limit_error"}}')]
        for e in cases:
            for proto in range(pickle.HIGHEST_PROTOCOL + 1):
                with self.subTest(err=str(e), protocol=proto):
                    r = pickle.loads(pickle.dumps(e, protocol=proto))
                    self.assertIs(type(r), pu.ProviderError)
                    for attr in ("provider", "kind", "status", "code", "field"):
                        self.assertEqual(getattr(r, attr), getattr(e, attr), attr)
                    self.assertEqual(str(r), str(e))


class S1_AgentEmptyReply(unittest.TestCase):
    BAD_GAME = "```html\n<html></html>\n```"
    EMPTY = ["", "   ", "\n\t  \n"]

    def run_answer(self, texts, check_results=()):
        replies = [{"text": t, "model": "m", "tokens_in": 1, "tokens_out": 1} for t in texts]
        with mock.patch.object(agent, "call_model", side_effect=replies) as cm, \
                mock.patch.object(agent, "check_game", side_effect=list(check_results)) as cg, \
                mock.patch("urllib.request.urlopen", side_effect=AssertionError("không được gọi mạng")):
            tracing.begin("s1")
            try:
                res = agent.answer("game đố vui")
            finally:
                _, events = tracing.end()
        self.assertEqual(set(res), {"output"})
        self.assertIsInstance(res["output"], str)
        notes = [e["text"] for e in events if e["kind"] == "note"]
        return res["output"], cm.call_count, cg.call_count, notes

    def test_empty_first_turn(self):  # S1
        for text in self.EMPTY:
            with self.subTest(text=repr(text)):
                out, calls, checks, notes = self.run_answer([text])
                self.assertIn("không trả nội dung", out)
                self.assertIn("diễn đạt lại", out)
                self.assertNotIn("check_game", out)
                self.assertEqual((calls, checks), (1, 0))
                self.assertTrue(any("không trả nội dung" in n for n in notes))

    def test_empty_second_turn_keeps_reject_reason(self):  # S1
        for text in self.EMPTY:
            with self.subTest(text=repr(text)):
                out, calls, checks, notes = self.run_answer(
                    [self.BAD_GAME, text], [{"ok": False, "error": "LY-DO-TU-CHOI-789"}])
                self.assertIn("không trả nội dung", out)
                self.assertIn("LY-DO-TU-CHOI-789", out)
                self.assertEqual((calls, checks), (2, 1))
                self.assertTrue(any("không trả nội dung" in n for n in notes))

    def test_plain_text_unchanged(self):  # S1
        out, calls, checks, _ = self.run_answer(["  Bạn muốn chơi theo đội không?  "])
        self.assertEqual(out, "Bạn muốn chơi theo đội không?")
        self.assertEqual((calls, checks), (1, 0))

    def test_valid_game_unchanged(self):  # S1
        out, calls, checks, _ = self.run_answer([self.BAD_GAME], [{"ok": True, "flags": []}])
        self.assertIn("BẢN NHÁP", out)
        self.assertIn("<html></html>", out)
        self.assertNotIn("không trả nội dung", out)
        self.assertEqual((calls, checks), (1, 1))

    def test_two_rejections_unchanged(self):  # S1
        bad = {"ok": False, "error": "LY-DO-TU-CHOI-789"}
        out, calls, checks, _ = self.run_answer([self.BAD_GAME] * 2, [bad, bad])
        self.assertIn("chưa viết được", out)
        self.assertIn("LY-DO-TU-CHOI-789", out)
        self.assertEqual((calls, checks), (2, 2))


def gemini_400_body(details):
    return json.dumps({"error": {"code": 400, "message": BODY + " " + KEY, "status": "INVALID_ARGUMENT",
                                 "details": details}}).encode("utf-8")


class S2_GeminiBadKey(ProviderPatched):
    def call_with_body(self, body, status=400):
        self.use("gemini")
        self.patch_urlopen(side_effect=urllib.error.HTTPError(
            "https://x.test/v1?key=" + KEY, status, "msg", {}, io.BytesIO(body)))
        tracing.begin("c")
        e = raises_pe(self, ai.call_model, "s", "u")
        _, events = tracing.end()
        blob = str(e) + str(e.code) + json.dumps(events, ensure_ascii=False)
        self.assertNotIn(BODY, blob)
        self.assertNotIn(KEY, blob)
        self.assertTrue(events[0].get("error"))
        return e

    def test_key_reasons_are_auth(self):  # S2
        for reason in ("API_KEY_INVALID", "API_KEY_EXPIRED"):
            with self.subTest(reason=reason):
                body = gemini_400_body([{"@type": "type.googleapis.com/google.rpc.Help"},
                                        {"reason": reason, "metadata": {"x": BODY}}])
                e = self.call_with_body(body)
                self.assertEqual((e.kind, e.status, e.code), ("auth", 400, reason))
                self.assertIn("(%s)" % reason, str(e))

    def test_other_reason_is_http(self):  # S2
        for details in ([{"reason": "FIELD_VIOLATION"}], [{"reason": "bad reason " + BODY}],
                        [{"reason": 5}], [BODY], {"reason": "API_KEY_INVALID"}, BODY, [],
                        [{"message": "API_KEY_INVALID " + BODY}]):
            with self.subTest(details=repr(details)[:50]):
                e = self.call_with_body(gemini_400_body(details))
                self.assertEqual((e.kind, e.status, e.code), ("http", 400, "INVALID_ARGUMENT"))


class S3_OllamaDoneEmpty(ProviderPatched):
    def test_done_empty_without_eval_count(self):  # S3
        for extra, tin in (({"prompt_eval_count": 9}, 9), ({}, 0)):
            with self.subTest(tin=tin):
                payload = dict({"done": True, "message": {"content": ""}}, **extra)
                self.assertEqual(pu.extract_usage("ollama", payload), (tin, 0))
                self.use("ollama")
                self.patch_urlopen(return_value=FakeResp(payload))
                tracing.begin("c")
                r = ai.call_model("s", "u")
                summary, _ = tracing.end()
                self.assertEqual(r, {"text": "", "model": "test-model", "tokens_in": tin, "tokens_out": 0})
                self.assertEqual((summary["tokens_in"], summary["tokens_out"]), (tin, 0))
                self.assertEqual(summary["errors"], [])

    def test_text_or_not_done_is_usage_missing(self):  # S3
        cases = {"has text": {"done": True, "message": {"content": "x"}},
                 "done false": {"done": False, "message": {"content": ""}},
                 "done absent": {"message": {"content": ""}},
                 "done string": {"done": "true", "message": {"content": ""}},
                 "done int": {"done": 1, "message": {"content": ""}}}
        self.use("ollama")
        for label, payload in cases.items():
            with self.subTest(case=label):
                payload = dict(payload, prompt_eval_count=9)
                self.assertEqual(raises_pe(self, pu.extract_usage, "ollama", payload).kind, "usage_missing")
                self.patch_urlopen(return_value=FakeResp(payload))
                self.assertEqual(raises_pe(self, ai.call_model, "s", "u").kind, "usage_missing")

    def test_bad_types_still_bad_response(self):  # S3
        base = {"done": True, "message": {"content": ""}}
        for key in ("eval_count", "prompt_eval_count"):
            for bad in (True, False, "0", 0.0, -1):
                with self.subTest(key=key, bad=repr(bad)):
                    payload = dict(base, **{key: bad})
                    self.assertEqual(raises_pe(self, pu.extract_usage, "ollama", payload).kind, "bad_response")


class S4_ModelNameHint(ProviderPatched):
    HINT = "kiểm MODEL_NAME trong .env"

    def test_hint_only_for_400_404(self):  # S4
        body = json.dumps({"error": {"message": BODY + " " + KEY}}).encode("utf-8")
        for status, has_hint in ((400, True), (404, True), (500, False), (502, False)):
            with self.subTest(status=status):
                self.patch_urlopen(side_effect=urllib.error.HTTPError(
                    "https://x.test/v1", status, "msg", {}, io.BytesIO(body)))
                e = raises_pe(self, ai.call_model, "s", "u")
                self.assertEqual((e.kind, e.status), ("http", status))
                (self.assertIn if has_hint else self.assertNotIn)(self.HINT, str(e))
                self.assertNotIn(BODY, str(e))
                self.assertNotIn(KEY, str(e))


class T07_07_Fake(unittest.TestCase):
    def test_fake_unchanged(self):  # T07-07
        with mock.patch.object(ai, "MODEL_PROVIDER", "fake"), \
                mock.patch("urllib.request.urlopen", side_effect=AssertionError("không được gọi mạng")):
            r = ai.call_model("s", "dòng 1\ndòng cuối")
        self.assertEqual(r["model"], "fake")
        self.assertEqual((r["tokens_in"], r["tokens_out"]), (0, 0))
        self.assertEqual(set(r), {"text", "model", "tokens_in", "tokens_out"})
        self.assertTrue(r["text"].endswith("dòng cuối"))


if __name__ == "__main__":
    unittest.main()
