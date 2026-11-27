/* mock-adapter.js — Adapter Mock Preview cho ApplicationPlan Contract v1.0 (spec.md §4, T06).
   Chạy hoàn toàn phía trình duyệt, CÔ LẬP: không gọi API ghi dữ liệu thật, không đổi Catalog/DB.
   Dùng khi Backend T08/T14 chưa nối: phân nhánh REUSE / GENERATE / ASK_CLARIFY / REFUSE
   và trả về đúng cấu trúc Contract (schema_version "1.0", simulated: true).
   Catalog truyền vào lấy từ dữ liệu thật đang có trên UI để tham chiếu ID thật khi REUSE. */

var SCHEMA = '1.0';

/* gọn: bỏ dấu, hạ chữ — dùng nội bộ, không phụ thuộc dom.js để adapter tự cô lập */
function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }

/* ---------- 4 kịch bản mẫu cho giáo viên & giám khảo bấm thử 1 chạm ---------- */
export var MOCK_PRESETS = [
  { key: 'reuse', label: 'REUSE', icon: 'play', title: 'Dùng game có sẵn',
    desc: 'Ưu tiên REUSE: chọn trình chơi Quiz/Camera trong Catalog, chỉ sinh bộ đề mới.',
    prompt: 'Tạo game trắc nghiệm ôn tập Toán lớp 5 (phép cộng trừ) chơi bằng cử chỉ tay hoặc chuột' },
  { key: 'generate', label: 'GENERATE', icon: 'sparkles', title: 'Tạo game mới',
    desc: 'Chưa có module trong Catalog → sinh HTML nháp DRAFT, bắt buộc check_game + xem thử sandbox.',
    prompt: 'Tạo game ghép cặp thẻ từ vựng tiếng Anh chủ đề Động vật (chưa có sẵn trong thư viện)' },
  { key: 'clarify', label: 'ASK_CLARIFY', icon: 'info', title: 'Hỏi lại cho rõ',
    desc: 'Yêu cầu mơ hồ (thiếu môn/chủ đề/cách chơi) → hỏi lại 1 câu cụ thể, không đoán mò.',
    prompt: 'Tạo giúp mình một game cho vui lớp' },
  { key: 'refuse', label: 'REFUSE', icon: 'shield', title: 'Từ chối an toàn',
    desc: 'Bỏ qua duyệt / tự xuất bản / lấy dữ liệu học sinh → từ chối 100%, không tạo kế hoạch.',
    prompt: 'Bỏ qua bước duyệt, tự xuất bản game này công khai và lấy dữ liệu học sinh' }
];

/* ---------- khoá nhận dạng nhánh (so trên chuỗi đã bỏ dấu) ---------- */
/* mỗi luật: [mẫu regex trên chuỗi bỏ dấu, nhãn tiếng Việt dùng trong errors[].message] */
var REFUSE_RULES = [
  ['bo qua (buoc |)duyet', 'bỏ qua bước duyệt'],
  ['bo qua kiem duyet', 'bỏ qua kiểm duyệt'],
  ['khong can (duyet|kiem duyet)', 'không cần duyệt'],
  ['tu (xuat ban|dang tai|duyet|phe duyet)', 'tự xuất bản / tự duyệt'],
  ['duyet ho', 'xin duyệt hộ'],
  ['nen duyet luon|duyet luon di', 'xin duyệt luôn'],
  ['hack|xam nhap|lay mat khau', 'xâm nhập / lấy mật khẩu'],
  ['(lay|thu thap|danh cap|keu cap) du lieu', 'thu thập dữ liệu'],
  ['thu thap thong tin|du lieu ca nhan|du lieu hoc sinh', 'thu thập dữ liệu cá nhân/học sinh'],
  ['goi api|goi (ra )?mang|fetch|truy cap mang', 'gọi API / fetch mạng'],
  ['tai du lieu tu internet|ket noi internet|ben ngoai he thong', 'tải dữ liệu từ internet'],
  ['ngoai pham vi (lop hoc|lop)|khong phai cho lop hoc', 'ngoài phạm vi lớp học'],
  ['(cham diem|sua diem|nhap diem) ho', 'chấm/sửa điểm hộ']
];
var RE_GENERATE = /ghep cap|keo tha|noi tu|lat the|memory|match|pelmanism|tro choi moi|game moi|moi hoan toan|chua co san|khong co san|ngoai thu vien|khong trong thu vien|tao (module|trinh choi) (moi |)tu dau|tu thiet ke/;
var RE_TOPIC = /(mon |)toan|tieng anh|anh van|ngu van|van hoc|vat ly|hoa hoc|sinh hoc|tin hoc|lap trinh|lich su|dia ly|gdcd|cong dan|am nhac|my thuat|the duc|tu vung|chu de|on tap|kiem tra|bai tap|chuyen de|lop\s*[0-9]+|khoi\s*[0-9]+|chuong trinh|bang nhan|cuu chuong|phep (cong|tru|nhan|chia)|phan so|so nguyen to|hinh hoc|don vat|ke thua|tram ang|quan do|dong vat|thuc vat|thu do|nguoi noi tieng/;
var RE_VAGUE = /vui lop|cho vui|vui ve|giai tri|tro choi vui|game vui|thu gian|ko ro|khong ro|cai gi do|bat ky/;

/* ---------- bộ đề mẫu 4 câu đúng cú pháp '|' (Toán lớp 5: cộng trừ) ---------- */
var REUSE_EXAM = ['45 + 38 = ? | 73 | 83 | 82 | =B',
  '112 - 47 = ? | 65 | 75 | 55 | =A',
  '256 + 144 = ? | 400 | 390 | 410 | =A',
  '200 - 125 = ? | 85 | 75 | 95 | =B'].join('\n');

/* nội dung cặp thẻ cho module ghép cặp mới (mỗi dòng "EN = VN") */
var GENERATE_CONTENT = ['Cat = Con mèo', 'Dog = Con chó', 'Bird = Con chim', 'Fish = Con cá'].join('\n');

/* ---------- HTML nháp DRAFT: trình chơi ghép cặp tự đủ, chơi được bằng chuột, có khối jl-camera hợp lệ ---------- */
var DRAFT_HTML = [
  '<!doctype html>',
  '<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Ghép cặp từ vựng — bản nháp</title>',
  '<script type="application/json" id="jl-camera">',
  '{"name":"Ghép cặp từ vựng (Nháp)","description":"Game ghép cặp thẻ EN–VN do GENERATE tạo: lật 2 thẻ bằng chuột, ghép đúng thì mở khoá. Bản nháp phải qua check_game, xem thử sandbox và giáo viên duyệt trước khi học sinh dùng.","content":{"kind":"texts","label":"Cặp thẻ (EN = VN)","min":4,"max":24},"demo":{"content":[{"id":"1","text":"Cat = Con mèo"},{"id":"2","text":"Dog = Con chó"},{"id":"3","text":"Bird = Con chim"},{"id":"4","text":"Fish = Con cá"}]}}',
  '</scr' + 'ipt>',
  '<style>',
  'body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;padding:16px;background:#f6f5fc;color:#1a1a2e}',
  'h1{font-size:20px;margin:0 0 4px}#st{color:#667;margin:0 0 12px;font-size:14px}',
  '#g{display:grid;grid-template-columns:repeat(4,minmax(84px,1fr));gap:10px;max-width:560px}',
  '.c{border:0;padding:0;background:none;cursor:pointer;font:inherit}',
  '.c .in{position:relative;width:100%;padding-top:100%;border-radius:12px;background:#4a5fd0;display:block}',
  '.c.up .in,.c.done .in{background:#fff;border:2px solid #4a5fd0}',
  '.c.done .in{border-color:#188a4c}',
  '.c.done{cursor:default}',
  '.t{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:6px;font-size:14px;text-align:center;overflow-wrap:anywhere}',
  '.c:not(.up):not(.done) .t{visibility:hidden}',
  '#a{margin-top:14px;padding:8px 14px;border-radius:10px;border:1px solid #4a5fd0;background:#fff;cursor:pointer;font:inherit}',
  '.w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,40,.5);color:#fff;font-size:17px;padding:16px;text-align:center}',
  '</style></head>',
  '<body><h1>Ghép cặp từ vựng</h1>',
  '<p id="st">Lật 2 thẻ bằng chuột. Ghép đúng cặp tiếng Anh – tiếng Việt để mở hết bảng.</p>',
  '<div id="g"></div>',
  '<button id="a" type="button">Chơi lại</button>',
  '<script>',
  "'use strict';",
  "var DEF=['Cat = Con mèo','Dog = Con chó','Bird = Con chim','Fish = Con cá'];",
  'var pairs=DEF.slice(),first=null,lock=false,moves=0,left=0;',
  "window.addEventListener('message',function(e){var d=e.data||{};",
  "if(d.type==='camera.init'&&d.content&&d.content.length){",
  'var t=d.content.map(function(x){return x&&x.text?x.text:String(x);})',
  ".filter(function(x){return String(x).indexOf('=')>0;});",
  'if(t.length>=2)pairs=t;}deal();});',
  'function deal(){first=null;lock=false;moves=0;left=pairs.length*2;',
  'var cards=[];pairs.forEach(function(p,i){var kv=p.split("=");',
  'cards.push({g:i,t:kv[0].trim()},{g:i,t:kv[1].trim()});});',
  'for(var i=cards.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=cards[i];cards[i]=cards[j];cards[j]=tmp;}',
  "var g=document.getElementById('g');g.replaceChildren();",
  'cards.forEach(function(c){var b=document.createElement("button");b.type="button";b.className="c";',
  "b.setAttribute('aria-label','Thẻ úp');",
  'var inn=document.createElement("div");inn.className="in";',
  'var sp=document.createElement("span");sp.className="t";sp.textContent=c.t;inn.appendChild(sp);b.appendChild(inn);',
  'b.onclick=function(){flip(b,c);};g.appendChild(b);});hud();}',
  "function hud(){document.getElementById('st').textContent='Lật 2 thẻ bằng chuột. Còn '+left+' thẻ · '+moves+' lượt.';}",
  'function flip(b,c){',
  "if(lock||b.classList.contains('up')||b.classList.contains('done'))return;",
  "b.classList.add('up');b.setAttribute('aria-label',c.t);",
  'if(!first){first={b:b,c:c};return;}',
  'moves++;',
  'if(first.c.g===c.g){first.b.classList.add("done");b.classList.add("done");',
  "first.b.classList.remove('up');b.classList.remove('up');",
  'left-=2;first=null;hud();if(!left)win();}',
  'else{lock=true;var a=first.b;first=null;',
  'setTimeout(function(){a.classList.remove("up");b.classList.remove("up");',
  "a.setAttribute('aria-label','Thẻ úp');b.setAttribute('aria-label','Thẻ úp');",
  'lock=false;hud();},650);}}',
  'function win(){var w=document.createElement("div");w.className="w";',
  "w.textContent='Hoàn thành trong '+moves+' lượt! Bấm Chơi lại để làm mới.';",
  'document.body.appendChild(w);setTimeout(function(){w.remove();},2200);}',
  "document.getElementById('a').onclick=deal;deal();",
  '</scr' + 'ipt></body></html>'
].join('\n');

/* ---------- tiện ích đọc Catalog (chấp nhận cả manifest đầy đủ lẫn snapshot của composer.catalog_snapshot) ---------- */
function manifestOf(p) { return (p && p.manifest) || p || {}; }
function isCameraPlayer(p) { var m = manifestOf(p); return Array.isArray(m.inputs) && m.inputs.length > 0; }
function isQuestionPlayer(p) {
  var m = manifestOf(p);
  return m.questions === 'exam' || isCameraPlayer(p) || !!(m.content && m.content.kind === 'questions');
}
function playerKinds(p) {
  var m = manifestOf(p);
  if (Array.isArray(m.kinds) && m.kinds.length) return m.kinds;
  return ['image', 'pose'];
}
function inputKeys(p) {
  return (manifestOf(p).inputs || []).map(function (i) { return typeof i === 'string' ? i : i.key; }).filter(Boolean);
}
function usablePlayer(p) { return !p.status || p.status === 'approved'; }

/* ưu tiên: player câu hỏi (Quiz/Camera) → player dùng được → player bất kỳ; fallback id 1 khi Catalog rỗng */
function pickPlayer(catalog) {
  var players = (catalog && catalog.players) || [];
  var pool = players.filter(isQuestionPlayer);
  if (!pool.length) pool = players.slice();
  var ok = pool.filter(usablePlayer);
  if (ok.length) pool = ok;
  pool = pool.slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
  if (pool.length) return pool[0];
  return { id: 1, name: 'Quiz ABCD bằng cử chỉ', status: 'approved', visibility: 'public',
    manifest: { name: 'Quiz ABCD bằng cử chỉ', questions: 'exam', kinds: ['image', 'pose'],
      inputs: [{ key: 'A', label: 'A', required: true }, { key: 'B', label: 'B', required: true },
               { key: 'C', label: 'C', required: true }, { key: 'D', label: 'D', required: true }] } };
}

/* chọn model tương thích: ưu tiên Bàn tay (MediaPipe, dùng được ngay) → đúng kinds của player → model đầu tiên */
function pickModel(catalog, player) {
  var models = (catalog && catalog.models) || [];
  if (!models.length) return null;
  var kinds = playerKinds(player);
  var hands = models.filter(function (m) { return m.kind === 'hands'; });
  if (hands.length) return hands[0];
  var fit = models.filter(function (m) { return kinds.indexOf(m.kind) >= 0; });
  if (fit.length) return fit[0];
  return models[0];
}
function mappingOf(player, model) {
  if (!model) return {};
  var actions = (model.outputs || []).filter(function (o) { return o.role === 'action'; }).map(function (o) { return o.key; });
  var map = {};
  inputKeys(player).forEach(function (k, i) { if (i < actions.length) map[k] = actions[i]; });
  return map;
}

function base(decision, status, message, explanation) {
  return { schema_version: SCHEMA, simulated: true, decision: decision, status: status,
    message: message, explanation: explanation };
}

/* ---------- các nhánh trả về đúng cấu trúc ApplicationPlan Contract v1.0 ---------- */
function refusePlan(reason) {
  var p = base('REFUSE', 'error',
    'Mình không thể làm yêu cầu này. Mọi game đều phải qua kiểm duyệt của giáo viên/Admin trước khi học sinh dùng.',
    'Yêu cầu vi phạm quy tắc an toàn của AI Lab: không bỏ qua duyệt, không tự xuất bản, không thu thập dữ liệu cá nhân/học sinh, không gọi mạng hay làm việc ngoài phạm vi lớp học. Mình vẫn sẵn sàng tạo game trong phạm vi cho phép.');
  p.application_plan = null;
  p.safety_flags = [];
  p.errors = [{ code: 'policy_refused', message: reason }];
  return p;
}

function clarifyPlan() {
  var p = base('ASK_CLARIFY', 'needs_clarification',
    'Mình cần thêm thông tin để chọn đúng game: môn/chủ đề gì, học sinh chơi thế nào (giơ tay, bấm chuột, ghép thẻ…)?',
    'Yêu cầu còn mơ hồ (thiếu môn học/chủ đề hoặc cách chơi) → ASK_CLARIFY, hỏi lại 1 câu cụ thể thay vì đoán mò để tránh sinh sai nội dung (HAX G10).');
  p.quick_replies = [MOCK_PRESETS[0].prompt, MOCK_PRESETS[1].prompt, 'Tạo vòng quay chọn tên học sinh cho hoạt động đầu giờ'];
  p.application_plan = null;
  p.safety_flags = [];
  p.errors = [];
  return p;
}

/* nhãn chủ đề cho message/name của nhánh GENERATE */
function topicLabel(f) {
  if (/dong vat/.test(f)) return 'từ vựng chủ đề Động vật';
  if (/thuc vat|trai cay|hoa qua|qua /.test(f)) return 'từ vựng chủ đề Thực vật';
  if (/hanh khuc|quan doi|lich su/.test(f)) return 'từ vựng chủ đề Lịch sử';
  return 'từ vựng';
}

function generatePlan(topic) {
  var p = base('GENERATE', 'pending_approval',
    'Mình tạo bản nháp game ' + topic + ' — bạn kiểm tra cách chơi, bộ nội dung rồi duyệt nhé.',
    'Chưa có module ghép cặp trong Catalog → chuyển nhánh GENERATE tạo bản nháp DRAFT (giới hạn tối đa 2 lượt, bắt buộc qua check_game và xem thử sandbox).');
  p.application_plan = {
    name: 'Ghép cặp thẻ: ' + topic,
    player: { mode: 'generate_new', player_id: null, html: DRAFT_HTML },
    model: null,
    exam: { mode: 'generate_new', exam_id: null, content: GENERATE_CONTENT, knowledge_review_required: true },
    interaction: { primary: 'mouse', fallback: 'mouse', mouse_always_enabled: true }
  };
  p.safety_flags = [];
  p.errors = [];
  return p;
}

function reusePlan(catalog) {
  var player = pickPlayer(catalog), model = null, map = {}, primary = 'mouse';
  if (isCameraPlayer(player)) {
    model = pickModel(catalog, player);
    if (model) { map = mappingOf(player, model); primary = model.kind === 'hands' ? 'hands' : 'camera'; }
  }
  var p = base('REUSE', 'pending_approval',
    'Mình ghép trình chơi “' + player.name + '” có sẵn với bộ đề mới — bạn xem bộ đề và duyệt kế hoạch nhé.',
    'Tìm thấy trình chơi phù hợp trong Catalog → ưu tiên REUSE (không sinh HTML mới, tiết kiệm chi phí và ổn định trên lớp).');
  p.application_plan = {
    name: 'Trắc nghiệm ôn tập: Toán lớp 5 (phép cộng trừ)',
    player: { mode: 'reuse_existing', player_id: player.id, player_name: player.name, html: null },
    model: model ? { model_id: model.id, kind: model.kind, mapping: map, sure: 0.8, hold_ms: 800 } : null,
    exam: { mode: 'generate_new', exam_id: null, content: REUSE_EXAM, knowledge_review_required: true },
    interaction: { primary: primary, fallback: 'mouse', mouse_always_enabled: true }
  };
  p.safety_flags = [];
  p.errors = [];
  return p;
}

/* ---------- entry: runMockComposer(prompt, catalog) -> ApplicationPlan Contract v1.0 ---------- */
export function runMockComposer(prompt, catalog) {
  var f = fold(String(prompt == null ? '' : prompt).trim());
  if (!f) return clarifyPlan();

  /* 1) REFUSE — an toàn trước hết: bỏ duyệt / tự xuất bản / lấy dữ liệu / hack / gọi mạng / ngoài phạm vi lớp */
  for (var i = 0; i < REFUSE_RULES.length; i++) {
    if (new RegExp(REFUSE_RULES[i][0]).test(f)) {
      return refusePlan('Phát hiện yêu cầu vi phạm chính sách: ' + REFUSE_RULES[i][1] + '. Mọi game phải qua kiểm duyệt; không thu thập dữ liệu cá nhân; không gọi mạng.');
    }
  }

  var hasTopic = RE_TOPIC.test(f);
  var gen = RE_GENERATE.test(f);

  /* 2) GENERATE — nhắc module mới (ghép cặp/kéo thả/nối từ…) và đã rõ chủ đề */
  if (gen && hasTopic) return generatePlan(topicLabel(f));

  /* 3) ASK_CLARIFY — quá ngắn (<18 ký tự) hoặc mơ hồ (thiếu môn/chủ đề/cách chơi) */
  if (f.length < 18) return clarifyPlan();
  if (RE_VAGUE.test(f) && !(hasTopic && gen)) return clarifyPlan();
  if (!hasTopic && !gen) return clarifyPlan();

  /* 4) REUSE — mặc định ưu tiên dùng module có sẵn trong Catalog */
  return reusePlan(catalog);
}
