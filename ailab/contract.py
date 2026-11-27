"""Hợp đồng của một Trình chơi (player): đọc khối jl-camera, kiểm, quét cờ, chèn helper + CSP.

Một trình chơi là MỘT file .html (tối đa 2 MB) tự đủ. Có hai loại:
  - trình chơi camera: manifest có "inputs" -> đọc đầu ra của một mô hình (ảnh / tư thế)
  - trình chơi game  : manifest KHÔNG có "inputs" -> có "content" (danh sách chữ, hoặc câu hỏi)
Chỉ dùng thư viện chuẩn.
"""
import json
import re

MAX_BYTES = 2 * 1024 * 1024
KINDS = ("image", "pose", "audio", "hands")
ROLES = ("action", "rest", "empty")
BLOCK_RE = re.compile(
    r'<script\b[^>]*\btype\s*=\s*["\']application/json["\'][^>]*\bid\s*=\s*["\']jl-camera["\'][^>]*>(.*?)</script>'
    r'|<script\b[^>]*\bid\s*=\s*["\']jl-camera["\'][^>]*\btype\s*=\s*["\']application/json["\'][^>]*>(.*?)</script>',
    re.S | re.I)
KEY_RE = re.compile(r"^[A-Za-z0-9_-]{1,20}$")

REASONS = {
    "too_big": "File lớn hơn 2 MB.",
    "no_block": 'Thiếu khối <script type="application/json" id="jl-camera">.',
    "many_blocks": "Có nhiều hơn một khối jl-camera.",
    "bad_json": "Khối jl-camera không phải JSON hợp lệ.",
    "bad_name": "name phải dài 1–60 ký tự.",
    "bad_description": "description tối đa 300 ký tự.",
    "bad_inputs": "inputs gồm 1–20 mục, mỗi mục có key (A-Z a-z 0-9 _ -, không trùng), label 1–40 ký tự.",
    "bad_kinds": "kinds chỉ gồm image, pose, audio, hands, không lặp, không rỗng.",
    "bad_questions": 'questions chỉ được là "exam".',
    "bad_content": "content: kind texts hoặc questions, label 1–40 ký tự, min/max hợp lệ.",
    "no_demo": "Trình chơi texts cần demo.content có đủ số mục tối thiểu.",
}


def parse(html):
    """Trả (manifest, None) nếu hợp lệ, hoặc (None, (mã, lời giải thích))."""
    def bad(code):
        return None, (code, REASONS[code])
    if len(html.encode("utf-8")) > MAX_BYTES:
        return bad("too_big")
    blocks = BLOCK_RE.findall(html)
    if not blocks:
        return bad("no_block")
    if len(blocks) > 1:
        return bad("many_blocks")
    raw = blocks[0][0] or blocks[0][1]
    try:
        m = json.loads(raw)
    except ValueError:
        return bad("bad_json")
    if not isinstance(m, dict):
        return bad("bad_json")
    name = m.get("name")
    if not isinstance(name, str) or not (1 <= len(name.strip()) <= 60):
        return bad("bad_name")
    desc = m.get("description", "")
    if not isinstance(desc, str) or len(desc) > 300:
        return bad("bad_description")
    out = {"name": name.strip(), "description": desc}
    inputs = m.get("inputs")
    if inputs is not None:
        if not isinstance(inputs, list) or not (1 <= len(inputs) <= 20):
            return bad("bad_inputs")
        seen, clean = set(), []
        for i in inputs:
            if (not isinstance(i, dict) or not isinstance(i.get("key"), str) or not KEY_RE.match(i["key"])
                    or i["key"] in seen or not isinstance(i.get("label"), str) or not (1 <= len(i["label"]) <= 40)):
                return bad("bad_inputs")
            seen.add(i["key"])
            acc = i.get("accepts", ["action"])
            if not isinstance(acc, list) or not acc or any(a not in ROLES for a in acc):
                return bad("bad_inputs")
            clean.append({"key": i["key"], "label": i["label"], "required": bool(i.get("required", False)),
                          "accepts": acc})
        out["inputs"] = clean
        kinds = m.get("kinds", ["image", "pose"])
        if (not isinstance(kinds, list) or not kinds or len(set(kinds)) != len(kinds)
                or any(k not in KINDS for k in kinds)):
            return bad("bad_kinds")
        out["kinds"] = kinds
        q = m.get("questions")
        if q is not None:
            if q != "exam":
                return bad("bad_questions")
            out["questions"] = "exam"
        return out, None
    # trình chơi game (không có inputs)
    c = m.get("content")
    if c is None and m.get("questions") != "exam":
        return bad("bad_inputs")
    if m.get("questions") == "exam":
        out["questions"] = "exam"
        return out, None
    if (not isinstance(c, dict) or c.get("kind") not in ("texts", "questions") or not isinstance(c.get("label"), str)
            or not (1 <= len(c["label"]) <= 40)):
        return bad("bad_content")
    lo, hi = c.get("min", 1), c.get("max", 100)
    if not (isinstance(lo, int) and isinstance(hi, int) and 1 <= lo <= hi <= 200):
        return bad("bad_content")
    out["content"] = {"kind": c["kind"], "label": c["label"], "min": lo, "max": hi}
    if c["kind"] == "texts":
        demo = (m.get("demo") or {}).get("content")
        if not isinstance(demo, list) or len(demo) < lo:
            return bad("no_demo")
        out["demo"] = {"content": demo}
    out["setup"] = bool(m.get("setup", False))
    return out, None


# Bảy luật xem xét — một cờ là CÂU HỎI cho người duyệt, không phải lời từ chối.
FLAG_RULES = [
    ("navigation", "Chuyển trang đi nơi khác", r"(?:\blocation\s*(?:\.|=)|top\.location|<meta[^>]+http-equiv\s*=\s*[\"']?refresh|<form\b)"),
    ("window", "Mở cửa sổ mới", r"window\.open\s*\("),
    ("network", "Gọi mạng", r"(?:\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource)"),
    ("code", "Chạy chữ như mã", r"(?:\beval\s*\(|new\s+Function\b|setTimeout\s*\(\s*[\"']|setInterval\s*\(\s*[\"'])"),
    ("picture", "Đọc / mã hoá ảnh camera", r"(?:toDataURL|toBlob\s*\(|getImageData|readPixels)"),
    ("frame", "Thoát khỏi khung", r"(?:parent\.(?!postMessage)|window\.top|\btop\.(?!location)|frameElement)"),
]
ALLOWED_CDN = ("cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com")


FLAG_REASONS = {
    "navigation": "Trang có thể đưa học sinh sang nơi khác hoặc gửi biểu mẫu ra ngoài.",
    "window": "Trang có thể mở cửa sổ mới (quảng cáo, trang lạ).",
    "network": "Trang có thể gửi hoặc nhận dữ liệu qua mạng, ảnh camera có nguy cơ bị gửi đi. Khi chạy ở AI Lab lệnh này bị chặn, nhưng người duyệt nên xem lại.",
    "code": "Trang chạy chữ như mã nên khó kiểm tra nội dung thật sự.",
    "picture": "Trang đọc hoặc mã hoá điểm ảnh camera, có thể dùng để lưu hoặc gửi ảnh.",
    "frame": "Trang cố chạm vào trang cha, ngoài khung của nó.",
    "script": "Trang nạp mã từ nơi ngoài danh sách cho phép (cdnjs, jsdelivr, unpkg).",
}


def _where(html, pos, width=160):
    """(số dòng, đoạn trích quanh chỗ khớp) — để người duyệt thấy đúng chỗ bị cảnh báo."""
    line_no = html.count("\n", 0, pos) + 1
    start = html.rfind("\n", 0, pos) + 1
    end = html.find("\n", pos)
    line = html[start:end if end >= 0 else len(html)]
    col = pos - start
    lo = max(0, col - width // 2)
    snippet = line[lo:lo + width].strip()
    return line_no, ("…" if lo > 0 else "") + snippet + ("…" if lo + width < len(line) else "")


def scan(html):
    """Danh sách cờ: mỗi cờ có code, label, reason (vì sao cảnh báo), line (dòng), excerpt (đoạn trích). Cờ là câu hỏi cho người duyệt."""
    flags = []
    for code, label, pat in FLAG_RULES:
        m = re.search(pat, html, re.I)
        if m:
            line, excerpt = _where(html, m.start())
            flags.append({"code": code, "label": label, "reason": FLAG_REASONS[code], "line": line, "excerpt": excerpt})
    for m in re.finditer(r"<script\b[^>]*\bsrc\s*=\s*[\"']([^\"']+)", html, re.I):
        host = re.match(r"(?:https?:)?//([^/]+)", m.group(1))
        if host and host.group(1).lower() not in ALLOWED_CDN:
            line, excerpt = _where(html, m.start())
            flags.append({"code": "script", "label": "Nạp script từ nơi không cho phép: " + host.group(1),
                          "reason": FLAG_REASONS["script"], "line": line, "excerpt": excerpt})
    return flags


CSP = ("default-src 'none'; script-src 'unsafe-inline' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net "
       "https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com "
       "https://cdn.jsdelivr.net; font-src data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
       "img-src data: blob:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'")

HELPER = r"""<script>(function(){
/* Helper của AI Lab: vẽ ảnh camera vào mọi phần tử [data-jl-camera]; chỉ xin ảnh khi có ô đang hiện. */
var boxes=new Map();
function sync(){
  document.querySelectorAll('[data-jl-camera]').forEach(function(el){
    if(!boxes.has(el)){var c=document.createElement('canvas');el.appendChild(c);boxes.set(el,c);}
  });
  var any=false;boxes.forEach(function(c,el){if(!el.isConnected){boxes.delete(el);return;}
    var r=el.getBoundingClientRect();if(r.width>0&&r.height>0&&getComputedStyle(el).display!=='none')any=true;});
  parent.postMessage({type:'camera.want',on:any},'*');
}
function draw(bmp){
  boxes.forEach(function(c,el){var r=el.getBoundingClientRect();if(!r.width||!r.height)return;
    if(c.width!==bmp.width||c.height!==bmp.height){c.width=bmp.width;c.height=bmp.height;}
    c.getContext('2d').drawImage(bmp,0,0);});
  bmp.close&&bmp.close();
}
function note(el,txt){boxes.forEach(function(c,e){if(!e.querySelector('.jl-note')){var n=document.createElement('div');n.className='jl-note';
  n.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:14px system-ui;text-align:center;padding:8px';
  e.style.position=e.style.position||'relative';e.appendChild(n);}e.querySelector('.jl-note').textContent=txt;});}
window.addEventListener('message',function(e){var d=e.data;if(!d||e.source!==parent)return;
  if(d.type==='camera.image'&&d.image)draw(d.image);
  if(d.type==='camera.status'){var m={denied:'Chưa được cấp quyền camera',busy:'Camera đang bận','no-camera':'Không thấy camera','model-failed':'Không nạp được mô hình',off:'Camera đã tắt',loading:'Đang bật camera…',ready:''}[d.state];
    if(m!==undefined)note(null,m);}
});
new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
document.addEventListener('DOMContentLoaded',sync);setInterval(sync,1000);
})();</script>"""


def secure(html):
    """Chèn CSP + helper ngay sau <head> (hoặc đầu file). Chỉ dùng để chạy; bản lưu trong DB giữ nguyên."""
    inject = '<meta http-equiv="Content-Security-Policy" content="%s">%s' % (CSP, HELPER)
    m = re.search(r"<head[^>]*>", html, re.I)
    if m:
        return html[:m.end()] + inject + html[m.end():]
    return inject + html


BRIEF = r"""Bạn viết MỘT file .html tự đủ (tối đa 2 MB), chạy trong iframe sandbox="allow-scripts", dùng cho giáo viên Việt Nam.
Nội dung chữ hiển thị cho học sinh bằng tiếng Việt, rõ ràng, nút to, chạy tốt cả trên điện thoại.

BẮT BUỘC: đúng MỘT khối <script type="application/json" id="jl-camera">...</script>:
  Trình chơi CAMERA (đọc mô hình ảnh/tư thế): {"name","description","inputs":[{"key","label","required":true}], "kinds":["image","pose"], "questions":"exam" (tuỳ chọn)}
     kinds có thể thêm "hands" (bàn tay, MediaPipe, không cần huấn luyện): lớp fist=Nắm tay, open=Xòe tay; trang cũng gửi 21 điểm bàn tay nếu trình chơi gửi {type:"hands",on:true} lên trang cha và nhận message camera.hand {hands:[[{x,y}×21]],available}.
     key của input là ký hiệu đáp án / hành động, vd A,B,C,D hoặc trai,phai.
  Trình chơi GAME (không camera, không inputs): {"name","description","content":{"kind":"texts","label":"Danh sách","min":2,"max":100},"setup":true,"demo":{"content":[{"id":"1","text":"An"},{"id":"2","text":"Bình"}]}}
     hoặc {"name","description","questions":"exam"} khi game dùng câu hỏi trắc nghiệm.

TIN NHẮN (window.addEventListener('message')) — luôn kiểm e.source===parent:
  Trang -> game: camera.init {inputs, content, questions, options, mode:'setup'|'play', locale:'vi'}, camera.status {state}, camera.result {input,label,confidence} (mô hình giữ một đáp án đủ lâu), camera.empty.
  Game -> trang: parent.postMessage({type:'ready'},'*') (gửi một lần sau khi gắn listener), {type:'finish',correct,total} khi hết game, {type:'options.change',options} khi đổi cài đặt (mode setup).
  Ô camera: đặt phần tử <div data-jl-camera></div> (đặt kích thước bằng CSS); trang tự vẽ ảnh camera đã lật gương vào đó. KHÔNG lật lại.
  Câu hỏi (questions): [{id,type:'single'|'truefalse',html,text,choices:[{key,html,text}],answer}]; dùng html qua innerHTML.

CẤM: gọi mạng (fetch, XHR, WebSocket), lưu trữ (localStorage...), mở camera/micro, chuyển trang, mở cửa sổ, eval/new Function, nạp ảnh/âm thanh từ web (nhúng data: trong file), nạp script từ host ngoài cdnjs.cloudflare.com / cdn.jsdelivr.net / unpkg.com. Âm thanh dùng WebAudio. Không đọc/mã hoá ảnh camera ra ngoài.
Game phải chơi được ngay với dữ liệu mẫu (demo) và cũng chơi được bằng chạm/phím khi không có camera.

Ví dụ trình chơi camera tối thiểu (Quiz ABCD):
<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ABCD</title>
<script type="application/json" id="jl-camera">{"name":"Quiz ABCD","description":"Trả lời bằng cử chỉ A, B, C, D.","questions":"exam","inputs":[{"key":"A","label":"A","required":true},{"key":"B","label":"B","required":true},{"key":"C","label":"C","required":true},{"key":"D","label":"D","required":true}]}</script>
<style>body{margin:0;font-family:system-ui;background:#10223a;color:#fff}.cam{position:fixed;right:12px;top:12px;width:200px;height:150px;border-radius:12px;overflow:hidden;background:#000}.cam canvas{width:100%;height:100%;object-fit:cover}main{max-width:640px;margin:0 auto;padding:24px}.opt{padding:12px 16px;margin:8px 0;border-radius:10px;background:#1d3a5f}.ok{background:#1f8a4c}.no{background:#a33}</style></head>
<body><div class="cam" data-jl-camera></div><main><h2 id="q">Đang chờ câu hỏi…</h2><div id="opts"></div></main>
<script>var qs=[],i=0,right=0,locked=false;
function show(){if(i>=qs.length){document.getElementById('q').textContent='Xong! '+right+'/'+qs.length;document.getElementById('opts').innerHTML='';parent.postMessage({type:'finish',correct:right,total:qs.length},'*');return;}
var q=qs[i];document.getElementById('q').innerHTML=q.html;document.getElementById('opts').innerHTML=q.choices.map(function(c){return '<div class="opt" data-k="'+c.key+'"><b>'+c.key+'.</b> '+c.html+'</div>';}).join('');locked=false;}
window.addEventListener('message',function(e){var d=e.data;if(!d||e.source!==parent)return;
if(d.type==='camera.init'){qs=d.questions||[];i=0;right=0;show();}
if(d.type==='camera.result'&&!locked&&qs[i]){locked=true;var ok=d.input===qs[i].answer;if(ok)right++;var el=document.querySelector('[data-k="'+d.input+'"]');if(el)el.className='opt '+(ok?'ok':'no');setTimeout(function(){i++;show();},1200);}});
parent.postMessage({type:'ready'},'*');</script></body></html>

Định dạng trả lời: một đoạn ngắn tiếng Việt (1–3 câu) nói game làm gì và chơi thế nào, rồi MỘT khối mã ba dấu huyền html chứa toàn bộ file. Không giải thích thêm sau khối mã."""
