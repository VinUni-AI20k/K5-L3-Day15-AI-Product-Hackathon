import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

from fb_token import upsert_env  # noqa: E402


def test_upsert_env_replaces_adds_and_drops():
    text = "MODEL_NAME=x\n# FB_PAGE_ID=\nFB_USER_TOKEN=short\n# ghi chú = giữ nguyên\n"
    out = upsert_env(text, {"FB_PAGE_ID": "123", "FB_PAGE_TOKEN": "tok"}, drop={"FB_USER_TOKEN"})
    lines = out.splitlines()
    assert "MODEL_NAME=x" in lines and "FB_PAGE_ID=123" in lines and "FB_PAGE_TOKEN=tok" in lines
    assert not any(l.startswith("FB_USER_TOKEN") for l in lines)
    assert "# ghi chú = giữ nguyên" in lines
    assert out.count("FB_PAGE_ID=") == 1
