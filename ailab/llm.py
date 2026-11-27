"""Chatbot sinh trình chơi HTML từ mô tả của giáo viên.

Gọi codebase/ai.py call_model (khung của repo). Nếu model đang ở chế độ giả, chưa nối, hoặc lỗi
-> rơi về chế độ giả của riêng ailab/ (dựng game từ khuôn) và báo rõ "giả" cho giao diện.
KHÔNG nối provider ở đây, không đọc API key.
"""
import html as htmllib
import os
import re
import sys

import contract

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "codebase"))

FENCE = chr(96) * 3
HTML_RE = re.compile(FENCE + r"(?:html)?\s*\n(.*?)" + FENCE, re.S | re.I)


def _real_model():
    """Trả call_model nếu model thật đã được nối, ngược lại None."""
    try:
        import ai  # codebase/ai.py
    except Exception:
        return None
    if getattr(ai, "MODEL_PROVIDER", "fake") == "fake":
        return None
    return ai.call_model


def _history_text(messages):
    lines = []
    for m in messages[-12:]:
        who = "Giáo viên" if m["role"] == "user" else "Trợ lý"
        body = m["text"] if m["role"] == "user" else m["text"][:600]
        lines.append("%s: %s" % (who, body))
    return "\n\n".join(lines)


def extract(reply):
    """(lời nhắn, html hoặc None)."""
    m = HTML_RE.search(reply)
    if not m:
        return reply.strip(), None
    return (reply[:m.start()].strip() or "Đây là game mình vừa tạo."), m.group(1).strip()


def generate(messages):
    """messages: [{role:'user'|'bot', text}], cuối là lượt của giáo viên.
    Trả {text, html, simulated, model, error?}. html luôn đã qua contract.parse (hoặc None + error)."""
    call = _real_model()
    if call is None:
        return fake(messages[-1]["text"])
    prompt = _history_text(messages)
    last_err = None
    for attempt in range(2):
        user = prompt if not last_err else prompt + "\n\n[Hệ thống] Bản trước bị từ chối: %s Hãy sửa và trả lại đầy đủ file." % last_err
        try:
            res = call(contract.BRIEF, user)
        except Exception as e:  # hết lượt, sai key, mất mạng…
            out = fake(messages[-1]["text"])
            out["error"] = "Không gọi được model (%s: %s), dùng chế độ giả." % (type(e).__name__, e)
            return out
        text, html = extract(res.get("text", ""))
        if html is None:
            last_err = "Không thấy khối mã html."
            continue
        manifest, err = contract.parse(html)
        if err:
            last_err = err[1]
            continue
        return {"text": text, "html": html, "simulated": False, "model": res.get("model", "")}
    return {"text": "Mình chưa viết được file hợp lệ: %s Bạn mô tả lại rõ hơn giúp mình nhé." % last_err,
            "html": None, "simulated": False, "model": "", "error": last_err}


def _title(prompt):
    t = re.sub(r"\s+", " ", prompt).strip()
    return (t[:48] + "…") if len(t) > 49 else (t or "Game mới")


QUIZ_WORDS = ("câu hỏi", "cau hoi", "quiz", "trắc nghiệm", "trac nghiem", "đáp án", "dap an", "abcd", "camera", "cử chỉ", "tư thế")


def fake(prompt):
    title = htmllib.escape(_title(prompt))
    if any(w in prompt.lower() for w in QUIZ_WORDS):
        html = QUIZ_TEMPLATE.replace("__TITLE__", title)
        msg = "Mình dựng khuôn Quiz ABCD: học sinh trả lời câu hỏi bằng cử chỉ, mỗi đáp án một ô."
    else:
        html = WHEEL_TEMPLATE.replace("__TITLE__", title)
        msg = "Mình dựng khuôn Vòng quay chọn ngẫu nhiên từ danh sách của bạn."
    return {"text": msg, "html": html, "simulated": True, "model": "fake"}


QUIZ_TEMPLATE = r"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<script type="application/json" id="jl-camera">{"name":"__TITLE__","description":"Trả lời câu hỏi bằng cử chỉ A, B, C, D.","questions":"exam","inputs":[{"key":"A","label":"A","required":true},{"key":"B","label":"B","required":true},{"key":"C","label":"C","required":true},{"key":"D","label":"D","required":true}]}</script>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#10223a;color:#fff}
.cam{position:fixed;right:12px;top:12px;width:200px;height:150px;border-radius:12px;overflow:hidden;background:#000}
.cam canvas{width:100%;height:100%;object-fit:cover}
main{max-width:640px;margin:0 auto;padding:24px}
.opt{padding:14px 18px;margin:10px 0;border-radius:12px;background:#1d3a5f;font-size:20px;cursor:pointer}
.ok{background:#1f8a4c}.no{background:#a33}
</style></head><body>
<div class="cam" data-jl-camera></div>
<main><h2 id="q">Đang chờ câu hỏi…</h2><div id="opts"></div></main>
<script>
var qs=[],i=0,right=0,locked=false;
function show(){
  if(i>=qs.length){document.getElementById('q').textContent='Xong! '+right+'/'+qs.length;document.getElementById('opts').innerHTML='';parent.postMessage({type:'finish',correct:right,total:qs.length},'*');return;}
  var q=qs[i];document.getElementById('q').innerHTML=q.html;
  document.getElementById('opts').innerHTML=q.choices.map(function(c){return '<div class="opt" data-k="'+c.key+'"><b>'+c.key+'.</b> '+c.html+'</div>';}).join('');
  locked=false;
}
function pick(k){
  if(locked||!qs[i])return;locked=true;
  var ok=k===qs[i].answer;if(ok)right++;
  var el=document.querySelector('[data-k="'+k+'"]');if(el)el.className='opt '+(ok?'ok':'no');
  setTimeout(function(){i++;show();},1200);
}
document.getElementById('opts').addEventListener('click',function(e){var o=e.target.closest('.opt');if(o)pick(o.getAttribute('data-k'));});
window.addEventListener('message',function(e){var d=e.data;if(!d||e.source!==parent)return;
  if(d.type==='camera.init'){qs=d.questions||[];i=0;right=0;show();}
  if(d.type==='camera.result')pick(d.input);
});
parent.postMessage({type:'ready'},'*');
</script></body></html>"""

WHEEL_TEMPLATE = r"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<script type="application/json" id="jl-camera">{"name":"__TITLE__","description":"Quay để chọn ngẫu nhiên một mục trong danh sách.","content":{"kind":"texts","label":"Danh sách","min":2,"max":100},"setup":true,"demo":{"content":[{"id":"1","text":"An"},{"id":"2","text":"Bình"},{"id":"3","text":"Chi"}]}}</script>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#10223a;color:#fff;text-align:center;padding:32px}
#pick{font-size:56px;min-height:80px;margin:24px 0;font-weight:700}
button{font-size:22px;padding:14px 32px;border:0;border-radius:12px;background:#1f8a4c;color:#fff;cursor:pointer}
#settings{display:none;margin-top:24px;font-size:16px}
</style></head><body>
<div id="pick">?</div><button id="go">Quay</button>
<label id="settings"><input type="checkbox" id="remove"> Bỏ mục đã chọn khỏi vòng quay</label>
<script>
var items=[],remove=true,picked=0,timer=null;
var box=document.getElementById('remove');
box.onchange=function(){remove=box.checked;parent.postMessage({type:'options.change',options:{removePicked:remove}},'*');};
document.getElementById('go').onclick=function(){
  if(!items.length){document.getElementById('pick').textContent='Hết rồi!';parent.postMessage({type:'finish',correct:picked,total:picked},'*');return;}
  clearInterval(timer);var n=0;
  timer=setInterval(function(){
    var j=Math.floor(Math.random()*items.length);document.getElementById('pick').textContent=items[j].text;
    if(++n>12){clearInterval(timer);picked++;if(remove)items.splice(j,1);}
  },80);
};
window.addEventListener('message',function(e){var d=e.data;if(!d||e.source!==parent)return;
  if(d.type==='camera.init'){
    items=(d.content||[]).slice();var o=d.options||{};
    remove=typeof o.removePicked==='boolean'?o.removePicked:true;box.checked=remove;
    document.getElementById('settings').style.display=d.mode==='setup'?'block':'none';
  }
});
parent.postMessage({type:'ready'},'*');
</script></body></html>"""
