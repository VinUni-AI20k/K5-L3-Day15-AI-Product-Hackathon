"""Owner-facing opt-in T06 entrypoint. No protected entrypoint is changed here.

Each input line can be a Spec request JSON object or a plain teacher message.
Only a protected agent.py owner patch, reviewed separately, selects this adapter.
"""
import json

try:
    from .mock_agent_v1 import run
except ImportError:
    from mock_agent_v1 import run


def answer_t06(text):
    """Keep answer(text)->{output:str}; use the already approved Mock Contract."""
    if not isinstance(text, str):
        payload = None
    elif text.lstrip().startswith("{"):
        try:
            payload = json.loads(text)
        except (ValueError, TypeError, RecursionError):
            # Never echo malformed source data or secrets into an error message.
            payload = None
    else:
        payload = {"session_id": "cli", "message": text}
    response = run(payload)
    return {"output": json.dumps(response, ensure_ascii=True, allow_nan=False)}
