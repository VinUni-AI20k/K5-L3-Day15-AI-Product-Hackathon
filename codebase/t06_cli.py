"""Standalone T06 adapter; protected run.py/agent.py remain unchanged.

Usage: python -m codebase.t06_cli [--input request.json] [--ui]
Web: mock_agent_v1.run(payload, trusted_registry); to_ui_response for display only.
"""
import argparse
import json
import sys

try:
    from . import application_contract, mock_agent_v1
except ImportError:
    import application_contract
    import mock_agent_v1


def main(argv=None):
    parser = argparse.ArgumentParser(description="T06 no-key fixture mock adapter")
    parser.add_argument("--input", help="Input JSON file; defaults to stdin")
    parser.add_argument("--ui", action="store_true", help="Display projection; not a backend Composer payload")
    args = parser.parse_args(argv)
    try:
        if args.input:
            with open(args.input, encoding="utf-8-sig") as stream:
                payload = json.load(stream)
        else:
            payload = json.load(sys.stdin)
        response = mock_agent_v1.run(payload)
    except (OSError, ValueError, TypeError, UnicodeError):
        # Do not print source data, filesystem details, or secrets in parse errors.
        response = mock_agent_v1._reply("ERROR", "Input JSON could not be read.", errors=[application_contract.issue("invalid_input", "Invalid JSON input.")])
    if args.ui:
        response = application_contract.to_ui_response(response)
    print(json.dumps(response, ensure_ascii=True, allow_nan=False))
    return 0 if response.get("decision") != "ERROR" else 1


if __name__ == "__main__":
    raise SystemExit(main())
