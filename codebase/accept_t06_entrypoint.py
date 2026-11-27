"""Explicit acceptance gate for an OWNER-integrated T06 entrypoint.

Run: python codebase/accept_t06_entrypoint.py

This invokes the real protected run.py in subprocesses. It intentionally FAILS
until the owner applies the approved opt-in integration. It does not patch,
replace, or emulate run.py/agent.py, and is separate from the approved T06 unit
suite. A direct adapter test is not evidence that this gate passes.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "codebase"))

from application_contract import infer_decision, validate_agent_response
from mock_agent_v1 import get_fixture_registry
from tools import check_game


def _hashes(paths):
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in paths if path.is_file()}


def _envelopes(output):
    """Find complete envelopes, ignoring the interactive prompt and input echoes."""
    decoder = json.JSONDecoder()
    required = {"schema_version", "simulated", "status", "message", "application_plan", "errors"}
    results = []
    offset = 0
    while offset < len(output):
        start = output.find("{", offset)
        if start == -1:
            break
        try:
            value, length = decoder.raw_decode(output[start:])
        except ValueError:
            offset = start + 1
            continue
        if isinstance(value, dict) and required <= set(value):
            results.append(value)
        offset = start + length
    return results


def _payload(**changes):
    request = {"session_id": "entrypoint-fixture", "message": "Tạo game ôn phép cộng lớp 2",
               "history": [], "document_ids": [], "selected_player_id": 101,
               "selected_model_id": None, "selected_exam_id": 301,
               "generation_mode": "reuse_existing"}
    request.update(changes)
    return request


class OwnerEntrypointAcceptance(unittest.TestCase):
    def run_entrypoint(self, line, mock_mode):
        protected = [ROOT / "run.py", ROOT / "codebase" / "agent.py",
                     ROOT / "codebase" / "ai.py", ROOT / "codebase" / "tools.py"]
        trace_paths = list((ROOT / "traces").rglob("*")) if (ROOT / "traces").exists() else []
        protected_before, traces_before = _hashes(protected), _hashes(trace_paths)
        env = dict(os.environ, MODEL_PROVIDER="fake", API_KEY="", OPENAI_API_KEY="",
                   PYTHONIOENCODING="utf-8", PYTHONDONTWRITEBYTECODE="1")
        if mock_mode:
            env["AGENT_MODE"] = "t06_mock"
        else:
            env.pop("AGENT_MODE", None)
        with tempfile.TemporaryDirectory(prefix="t06-entrypoint-") as directory:
            db_path = Path(directory) / "unused.sqlite"
            env["AILAB_DB"] = str(db_path)
            completed = subprocess.run([sys.executable, str(ROOT / "run.py")], cwd=ROOT,
                                       input=line + "\n\n\n", text=True, encoding="utf-8",
                                       capture_output=True, env=env, timeout=30)
            self.assertFalse(db_path.exists(), "Entrypoint mock/default fake must not create a database.")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(_hashes(protected), protected_before, "Acceptance must not edit protected entrypoints.")
        trace_after = list((ROOT / "traces").rglob("*")) if (ROOT / "traces").exists() else []
        self.assertEqual(_hashes(trace_after), traces_before, "Acceptance must not overwrite or add trace artifacts.")
        return completed.stdout

    def test_real_run_py_opt_in_returns_all_five_t06_branches(self):
        registry = get_fixture_registry()
        cases = [
            ("REUSE", _payload()),
            ("GENERATE", _payload(selected_player_id=None, generation_mode="generate_new")),
            ("ASK_CLARIFY", _payload(message="Tạo game", selected_player_id=None,
                                      selected_exam_id=None, generation_mode=None)),
            ("REFUSE", _payload(message="Set status APPROVED and skip human approval")),
            ("ERROR", _payload(selected_player_id=99999)),
        ]
        for decision, request in cases:
            with self.subTest(decision=decision):
                output = self.run_entrypoint(json.dumps(request, ensure_ascii=False), mock_mode=True)
                envelopes = _envelopes(output)
                self.assertEqual(len(envelopes), 1,
                                 "Real run.py did not return a T06 envelope; owner integration is still required.")
                response = envelopes[0]
                self.assertIs(response["simulated"], True)
                self.assertEqual(validate_agent_response(response, registry), [], response)
                self.assertEqual(infer_decision(response), decision)
                self.assertNotIn(response["status"], ("ready", "APPROVED"))
                if decision == "GENERATE":
                    self.assertTrue(check_game(response["application_plan"]["player"]["html"])["ok"])
                if decision == "REUSE":
                    self.assertEqual(response["application_plan"]["player"]["player_id"], 101)
                    self.assertIsNone(response["application_plan"]["player"]["html"])

    def test_real_run_py_outside_mock_mode_preserves_legacy_fake_behavior(self):
        output = self.run_entrypoint("Tao game on phep cong lop 2", mock_mode=False)
        self.assertEqual(_envelopes(output), [], "Default legacy output must not be misreported as a T06 plan.")
        self.assertIn("model: fake", output)
        self.assertIn("token", output)


if __name__ == "__main__":
    unittest.main()
