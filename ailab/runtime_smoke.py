"""T13 — kiểm thử runtime bằng trình duyệt thật (Edge/Chrome headless), stdlib only.

Chạy từ thư mục gốc repo:
    python ailab/runtime_smoke.py
    python ailab/runtime_smoke.py --out evidence/runtime-smoke.md

Script phục vụ 3 trang qua HTTP localhost:
  /        trang cha, tạo iframe sandbox="allow-scripts"
  /player  Quiz ABCD từ llm.QUIZ_TEMPLATE + contract.secure(CSP/helper) + driver bấm chuột
  /wheel   Vòng quay từ llm.WHEEL_TEMPLATE + contract.secure + driver nhận content động

Kiểm tra:
  - 6 tình huống fallback (không model / đang nạp / lỗi model / không camera / từ chối quyền / tắt camera)
    đều chơi hết 2 câu, đúng 2/2 bằng chuột.
  - CSP chặn fetch, chặn đọc DOM cha, chặn thoát khung, chặn cookie trong iframe opaque origin.
  - Player thứ 2 (Vòng quay) nhận nội dung động và bấm được nút Quay.

Không dùng model AI, không dùng API key, không ghi vào DB/Catalog. Chỉ đọc template và contract.
"""
import argparse
import datetime
import html as htmlmod
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for _p in (HERE, os.path.join(ROOT, "codebase")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import contract  # noqa: E402
import llm  # noqa: E402

QUESTIONS = [
    {"id": "q1", "type": "single", "html": "1 + 1 bằng bao nhiêu?", "text": "1 + 1 bằng bao nhiêu?",
     "choices": [{"key": k, "html": v} for k, v in zip("ABCD", ("1", "2", "3", "4"))], "answer": "B"},
    {"id": "q2", "type": "single", "html": "Thủ đô của Việt Nam?", "text": "Thủ đô của Việt Nam?",
     "choices": [{"key": k, "html": v} for k, v in zip("ABCD", ("Huế", "Hà Nội", "Đà Nẵng", "Cần Thơ"))],
     "answer": "B"},
]
CONTENT = [{"id": "1", "text": "An"}, {"id": "2", "text": "Bình"}, {"id": "3", "text": "Chi"}]
INPUTS = [{"key": k, "label": k} for k in "ABCD"]
SCENARIOS = (
    ("no_model", None), ("model_loading", "loading"), ("model_failed", "model-failed"),
    ("no_camera", "no-camera"), ("camera_denied", "denied"), ("camera_off", "off"),
)

QUIZ_DRIVER = r"""<script>(function(){
/* Driver kiểm thử: bấm chuột vào đáp án đúng khi nhận camera.init; không sửa luật của player. */
var gen=0;
window.addEventListener('message',function(e){
  var d=e.data; if(!d||e.source!==parent)return;
  if(d.type==='camera.init'){
    gen++; var my=gen, qs=d.questions||[], i=0;
    function step(){
      if(my!==gen||i>=qs.length)return;
      var k=qs[i].answer, el=document.querySelector('[data-k="'+k+'"]');
      if(el)el.click();
      else parent.postMessage({type:'test.error',detail:'không tìm thấy ô '+k},'*');
      i++; setTimeout(step,1400);
    }
    setTimeout(step,60);
  }
});
/* Thăm dò an toàn: mạng/DOM cha/thoát khung/cookie. */
setTimeout(function(){
  var out={};
  try{fetch('/probe').then(function(){out.network='allowed';},function(){out.network='blocked';});}
  catch(e){out.network='blocked';}
  setTimeout(function(){
    if(!('network' in out))out.network='blocked';
    try{parent.document.body;out.parent_dom='allowed';}catch(e){out.parent_dom='blocked';}
    try{window.top.location.href;out.escape='allowed';}catch(e){out.escape='blocked';}
    try{out.cookie=document.cookie?('allowed:'+document.cookie):'blocked';}catch(e){out.cookie='blocked';}
    parent.postMessage({type:'probe',results:out},'*');
  },250);
},100);
})();</script>"""

WHEEL_DRIVER = r"""<script>(function(){
window.addEventListener('message',function(e){
  var d=e.data; if(!d||e.source!==parent)return;
  if(d.type==='camera.init'){
    var items=d.content||[];
    setTimeout(function(){
      var btn=document.getElementById('go'); if(btn)btn.click();
      setTimeout(function(){
        var pick=document.getElementById('pick');
        parent.postMessage({type:'wheel.result',count:items.length,
          picked:!!(pick&&pick.textContent&&pick.textContent!=='?')},'*');
      },500);
    },60);
  }
});
})();</script>"""

HARNESS = r"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Runtime smoke T13</title><style>body{font:14px system-ui}iframe{width:480px;height:360px;border:1px solid #888}</style></head>
<body><h3>T13 runtime smoke</h3><iframe id="f" src="/player" sandbox="allow-scripts"></iframe><pre id="results">PENDING</pre>
<img src="/hold" alt="" hidden>
<script>(function(){
'use strict';
var QS=__QUIZ__, CONTENT=__CONTENT__, INPUTS=__INPUTS__;
var SCENARIOS=[["no_model",null],["model_loading","loading"],["model_failed","model-failed"],
               ["no_camera","no-camera"],["camera_denied","denied"],["camera_off","off"]];
var f=document.getElementById('f'), out=document.getElementById('results');
var rows=[], security=null, wheel=null, idx=0, phase='quiz', done=false;
setTimeout(function(){if(!done)finish({timeout:true,rows:rows});},90000);
function post(m){try{f.contentWindow.postMessage(m,'*');}catch(e){}}
function finish(done_data){if(done)return;done=true;
  var payload=done_data||{quiz:rows,security:security,wheel:wheel};
  out.textContent=JSON.stringify(payload);document.title='DONE';
  try{fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)});}catch(e){}}
function dump(){finish();}
window.addEventListener('message',function(e){
  if(e.source!==f.contentWindow||!e.data)return; var d=e.data;
  if(d.type==='probe'){security=d.results;return;}
  if(d.type==='test.error'){rows.push({scenario:SCENARIOS[idx]?SCENARIOS[idx][0]:'?',error:d.detail});return;}
  if(d.type==='finish'){
    rows.push({scenario:SCENARIOS[idx][0],state:SCENARIOS[idx][1]||'none',correct:d.correct,total:d.total});
    idx++; setTimeout(next,100); return;
  }
  if(d.type==='wheel.result'){wheel=d;dump();return;}
  if(d.type==='ready'){
    if(phase==='quiz')setTimeout(next,100);
    else setTimeout(function(){post({type:'camera.init',mode:'play',content:CONTENT,
      options:{},locale:'vi'});},100);
  }
});
function next(){
  if(phase!=='quiz')return;
  if(idx>=SCENARIOS.length){phase='wheel';f.src='/wheel';return;}
  var s=SCENARIOS[idx];
  if(s[1])post({type:'camera.status',state:s[1],source:'camera'});
  setTimeout(function(){post({type:'camera.init',mode:'play',locale:'vi',
    questions:QS,inputs:INPUTS,options:{}});},100);
}
})();</script></body></html>"""


def find_browser():
    for name in ("msedge", "chrome", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    candidates = (
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/microsoft-edge",
    )
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def _inject(template, driver, title):
    html = template.replace("__TITLE__", title)
    html = contract.secure(html)
    if "</body>" in html:
        return html.replace("</body>", driver + "</body>")
    return html + driver


def run(browser, out_path=None):
    quiz = _inject(llm.QUIZ_TEMPLATE, QUIZ_DRIVER, "Quiz runtime T13")
    wheel = _inject(llm.WHEEL_TEMPLATE, WHEEL_DRIVER, "Vong quay runtime T13")
    harness = (HARNESS.replace("__QUIZ__", json.dumps(QUESTIONS))
               .replace("__CONTENT__", json.dumps(CONTENT))
               .replace("__INPUTS__", json.dumps(INPUTS)))

    seen = []
    reported = {}
    gate = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if self.path.split("?", 1)[0] != "/report":
                self.send_error(404)
                return
            n = int(self.headers.get("Content-Length") or 0)
            try:
                reported["data"] = json.loads(self.rfile.read(n).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                reported["data"] = None
            gate.set()
            body = b"{}"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            seen.append(path)
            if path == "/hold":
                # Giữ request cho tới khi harness báo cáo xong để --dump-dom chụp đúng thời điểm.
                gate.wait(100)
                body = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
                self.send_response(200)
                self.send_header("Content-Type", "image/gif")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/":
                body, csp, ctype = harness.encode("utf-8"), None, "text/html; charset=utf-8"
            elif path == "/player":
                body, csp, ctype = quiz.encode("utf-8"), contract.CSP, "text/html; charset=utf-8"
            elif path == "/wheel":
                body, csp, ctype = wheel.encode("utf-8"), contract.CSP, "text/html; charset=utf-8"
            elif path == "/probe":
                body, csp, ctype = b"{}", None, "application/json"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if csp:
                self.send_header("Content-Security-Policy", csp)
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    profile = tempfile.mkdtemp(prefix="t13-browser-")
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run",
           "--no-default-browser-check", "--disable-extensions",
           "--user-data-dir=" + os.path.join(profile, "profile"),
           "--dump-dom", "http://127.0.0.1:%d/" % port]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=150,
                              encoding="utf-8", errors="replace")
    finally:
        server.shutdown()
        server.server_close()
        shutil.rmtree(profile, ignore_errors=True)

    data = reported.get("data")
    if not data:
        dom = proc.stdout or ""
        match = re.search(r'<pre id="results">(.*?)</pre>', dom, re.S)
        if match:
            try:
                data = json.loads(htmlmod.unescape(match.group(1)).strip())
            except ValueError:
                data = None

    errors = []
    if not data:
        errors.append("không đọc được kết quả JSON từ trình duyệt (proc=%s)" % proc.returncode)
        if dom:
            errors.append("results=%s; DOM đuôi: %s" % (
                (match.group(1)[:500] if match else "NO MATCH"),
                dom[-600:].replace("\n", " ")[:600]))
        if proc.stderr:
            errors.append(proc.stderr.strip()[:400])
    else:
        rows = data.get("quiz") or []
        if len(rows) != len(SCENARIOS):
            errors.append("chạy %d/%d tình huống fallback" % (len(rows), len(SCENARIOS)))
        for row in rows:
            if row.get("correct") != 2 or row.get("total") != 2:
                errors.append("%s: %s/%s (cần 2/2)%s" % (
                    row.get("scenario"), row.get("correct"), row.get("total"),
                    " — " + str(row.get("error")) if row.get("error") else ""))
        sec = data.get("security") or {}
        for key in ("network", "parent_dom", "escape", "cookie"):
            if sec.get(key) != "blocked":
                errors.append("CSP/sandbox: %s = %s (cần blocked)" % (key, sec.get(key)))
        wheel = data.get("wheel") or {}
        if wheel.get("count") != len(CONTENT) or not wheel.get("picked"):
            errors.append("Vòng quay nhận nội dung động: %s" % wheel)

    report = {
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "browser": browser,
        "command": "python ailab/runtime_smoke.py",
        "scenarios": [name for name, _ in SCENARIOS],
        "questions_per_scenario": len(QUESTIONS),
        "http_requests": seen,
        "data": data,
        "errors": errors,
        "pass": not errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if out_path:
        lines = [
            "# T13 — Runtime smoke bằng trình duyệt thật",
            "",
            "- Thời gian chạy: %s" % report["time"],
            "- Trình duyệt: `%s` (headless)" % browser,
            "- Lệnh: `%s`" % report["command"],
            "- Nguồn: `ailab/runtime_smoke.py` (stdlib), `contract.secure()` + `sandbox=\"allow-scripts\"`.",
            "",
            "## Mouse Fallback (Quiz ABCD, Question Set động 2 câu)",
            "",
            "| Tình huống | Trạng thái gửi vào game | Kết quả |",
            "|---|---|---|",
        ]
        for row in (data or {}).get("quiz", []):
            lines.append("| %s | %s | %s/%s |" % (
                row.get("scenario"), row.get("state"), row.get("correct"), row.get("total")))
        sec = (data or {}).get("security") or {}
        wheel = (data or {}).get("wheel") or {}
        lines += [
            "",
            "## Sandbox + CSP",
            "",
            "| Kiểm tra | Kết quả |",
            "|---|---|",
            "| Gọi mạng (`fetch`) | %s |" % sec.get("network", "?"),
            "| Đọc DOM cha (`parent.document`) | %s |" % sec.get("parent_dom", "?"),
            "| Thoát khung (`window.top.location`) | %s |" % sec.get("escape", "?"),
            "| Đọc cookie | %s |" % sec.get("cookie", "?"),
            "",
            "## Player thứ 2 — Vòng quay nhận nội dung động",
            "",
            "- Số mục nhận được: %s (cần %d)" % (wheel.get("count"), len(CONTENT)),
            "- Bấm nút Quay có kết quả: %s" % wheel.get("picked"),
            "",
            "## Kết luận",
            "",
            "**%s** %s" % ("PASS" if not errors else "FAIL",
                           "; ".join(errors) if errors else "6/6 tình huống chơi hết lượt 2/2; CSP/sandbox chặn cả 4 kiểu truy cập; cả 2 Player nhận dữ liệu động."),
            "",
        ]
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print("Đã ghi %s" % out_path)
    return 0 if not errors else 1


def main():
    try:  # console Windows có thể dùng cp1252
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None, help="ghi báo cáo markdown (ví dụ evidence/runtime-smoke.md)")
    parser.add_argument("--browser", default=None, help="đường dẫn Edge/Chrome cụ thể")
    args = parser.parse_args()
    browser = args.browser or find_browser()
    if not browser:
        print("Không tìm thấy Edge/Chrome; hãy truyền --browser <đường dẫn>.")
        return 2
    return run(browser, args.out)


if __name__ == "__main__":
    sys.exit(main())
