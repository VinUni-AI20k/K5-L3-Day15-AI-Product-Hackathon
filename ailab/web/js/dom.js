/* dom.js — lớp dựng DOM dùng chung của AI Lab (ES module, không phụ thuộc thư viện ngoài).
   Tách từ app.js, bổ sung: api 401 hook, toast, modal có quản lý focus đầy đủ,
   confirm/prompt modal dạng Promise, copyText, bộ soạn câu hỏi (Visual Editor).
   Quy ước: mọi nút có biểu tượng đi trước chữ; mọi câu hỏi theo mẫu '|' của ailab/store.py. */

/* ---------- dựng DOM ---------- */
export function h(tag, attrs) {
  var el = document.createElement(tag);
  for (var k in (attrs || {})) {
    var v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
export function add(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
  el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
}

/* ---------- gọi API: kiểm r.ok, đọc JSON an toàn, lỗi mang e.status/e.code, 401 gọi hook ---------- */
var onUnauthorized = null;
export function setOnUnauthorized(fn) { onUnauthorized = typeof fn === 'function' ? fn : null; }
export function api(method, url, body) {
  var opt = { method: method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(url, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok) {
        var e = new Error((d && d.message) || 'Có lỗi, thử lại.');
        e.status = r.status; e.code = d && d.error;
        if (r.status === 401 && onUnauthorized) onUnauthorized(e);
        throw e;
      }
      return d;
    });
  });
}

/* ---------- biểu tượng: SVG stroke 1.8, mọi nút có biểu tượng đi trước chữ (KHÔNG dùng emoji) ---------- */
export var IC = {
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', minus: '<path d="M6 12h12"/>',
  more: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', play: '<path d="M8 5.5v13l11-6.5z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>', logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>', login: '<path d="M14 5h5v14h-5M10 8l-4 4 4 4M6 12h9"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>', shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>', undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10"/>', code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>',
  wand: '<path d="M5 19L17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7z"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  home: '<path d="M4 11.5L12 4l8 7.5"/><path d="M6.5 10v10h11V10"/><path d="M10 20v-5h4v5"/>',
  sparkles: '<path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  mouse: '<rect x="8" y="3" width="8" height="18" rx="4"/><path d="M12 7v4"/>',
  alert: '<path d="M12 4L2.5 20h19z"/><path d="M12 10v4.5"/><path d="M12 17.2v.01"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5a3 3 0 016 0"/><path d="M9 3.5h6V7H9z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>',
  xCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8v.01"/>',
  layers: '<path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
  arrowLeft: '<path d="M20 12H4"/><path d="M10 6l-6 6 6 6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13.5V19a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5.5"/>'
};
export function ico(n) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = IC[n] || IC.more;
  return s;
}
export function btn(label, icon, o) {
  o = o || {};
  var attrs = { type: o.href ? null : 'button', class: 'ail-btn' + (o.cls ? ' ' + o.cls : ''), onclick: o.onclick, href: o.href, target: o.target, rel: o.target ? 'noopener' : null, title: o.title, 'aria-label': o.label };
  return h(o.href ? 'a' : 'button', attrs, icon ? ico(icon) : null, label);
}
export function errBox(e) { return h('div', { class: 'err', role: 'alert' }, (e && e.message) || String(e)); }

/* ---------- nhãn trạng thái & tiện ích dữ liệu ---------- */
export var STATUS = { draft: ['Nháp', 'warn'], pending: ['Chờ duyệt', 'warn'], approved: ['Đã duyệt', 'ok'], refused: ['Bị từ chối', 'bad'], hidden: ['Đã ẩn', 'bad'] };
export function fmtStatus(s) { var m = STATUS[s] || [s, '']; return h('span', { class: 'ail-chip ' + m[1] }, m[0]); }
export var KIND = { image: 'Hình ảnh', pose: 'Tư thế', audio: 'Âm thanh', hands: 'Bàn tay (có sẵn)' };
export function srcOf(x) { return (x.sample || x.owner === 'AI Lab') ? 'AI Lab' : (x.mine ? 'Của tôi' : 'Người dùng khác'); }
/* bỏ dấu + bỏ đ để so khớp tìm kiếm không phân biệt dấu */
export function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }

export var QHELP = 'Mỗi dòng một câu: Câu hỏi | Đáp án A | Đáp án B | Đáp án C | =B   (=B là đáp án đúng). Câu Đúng/Sai: Câu hỏi | =Đúng';

/* ---------- khung chờ (skeleton) + toast: CSS tự chèn 1 lần, không phải sửa file .css ---------- */
var extrasDone = false;
function injectExtras() {
  if (extrasDone) return; extrasDone = true;
  var s = document.createElement('style'); s.id = 'ail-dom-extras';
  s.textContent =
    '.ail-toasts{position:fixed;right:16px;bottom:16px;z-index:200;display:flex;flex-direction:column;gap:8px;max-width:min(360px,90vw)}' +
    '.ail-toast{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--jl-radius-leaf-sm,10px);background:var(--jl-surface-default,#fff);color:var(--jl-text-default,#1a1a2e);box-shadow:var(--jl-shadow-au-lg,0 8px 24px rgba(0,0,0,.18));font-size:14px;cursor:default;animation:ail-toast-in .18s ease}' +
    '.ail-toast svg.i{width:18px;height:18px;flex:none}' +
    '.ail-toast.ok svg{color:#188a4c}.ail-toast.err svg{color:#c23a3a}.ail-toast.info svg{color:#4a5fd0}' +
    '.ail-toast.is-out{opacity:0;transform:translateY(6px);transition:opacity .25s ease,transform .25s ease}' +
    '@keyframes ail-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
    '.ail-skel-card{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--jl-border-default,rgba(20,20,60,.1));border-radius:var(--jl-radius-leaf-md,14px);background:var(--jl-surface-default,#fff)}' +
    '.ail-skel{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--jl-au-skeleton,#ECEBF7) 25%,var(--jl-au-skeleton-hi,#F6F5FC) 50%,var(--jl-au-skeleton,#ECEBF7) 75%);background-size:200% 100%;animation:ail-skel 1.2s ease infinite}' +
    '.ail-skel.thumb{height:84px;border-radius:10px}.ail-skel.w60{width:60%}.ail-skel.w40{width:40%}' +
    '@keyframes ail-skel{from{background-position:200% 0}to{background-position:-200% 0}}' +
    '@media (prefers-reduced-motion:reduce){.ail-toast{animation:none}.ail-skel{animation:none}}' +
    '.modal .box:focus{outline:none}';
  document.head.appendChild(s);
}
export function skeletonCards(n) {
  injectExtras();
  var frag = document.createDocumentFragment();
  for (var i = 0; i < n; i++) frag.appendChild(h('div', { class: 'ail-skel-card', 'aria-hidden': 'true' },
    h('span', { class: 'ail-skel thumb' }), h('span', { class: 'ail-skel w60' }), h('span', { class: 'ail-skel w40' })));
  return frag;
}
export function toast(message, type) {
  injectExtras();
  var box = document.querySelector('.ail-toasts');
  if (!box) { box = h('div', { class: 'ail-toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
  var kind = type === 'ok' || type === 'err' ? type : 'info';
  var t = h('div', { class: 'ail-toast ' + kind }, ico(kind === 'ok' ? 'checkCircle' : kind === 'err' ? 'xCircle' : 'info'), h('span', null, String(message)));
  t.addEventListener('click', function () { t.remove(); });
  box.appendChild(t);
  setTimeout(function () { t.classList.add('is-out'); setTimeout(function () { t.remove(); }, 260); }, 3500);
  return t;
}

/* ---------- modal có quản lý focus đầy đủ: lưu focus, trap Tab, Escape đóng, khôi phục focus ---------- */
function focusablesIn(root) {
  return Array.prototype.filter.call(
    root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    function (el) { return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement; });
}
export function modal(title, body, opts) {
  opts = opts || {};
  var lastFocus = document.activeElement;
  var box;
  var m = h('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || title,
    onclick: function (e) { if (!opts.static && e.target === m) close(); } },
    box = h('div', { class: 'box', tabindex: '-1' },
      h('div', { class: 'bar' }, h('h3', { class: 'sp' }, title),
        h('button', { type: 'button', class: 'ail-btn sm', 'aria-label': 'Đóng hộp thoại', onclick: function () { close(); } }, ico('x'), 'Đóng')),
      body));
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusablesIn(box);
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    var first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (e.shiftKey && (cur === first || cur === box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    else if (cur === m || !box.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  }
  function close() {
    if (!m.isConnected) return;
    m.remove();
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.isConnected) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); } }
    if (opts.onClose) opts.onClose();
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(m);
  var target = opts.focusTo ? (typeof opts.focusTo === 'function' ? opts.focusTo(box) : opts.focusTo) : box;
  if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
  return close;
}
export function confirmModal(title, message, confirmLabel, danger) {
  confirmLabel = confirmLabel || 'Xác nhận';
  return new Promise(function (res) {
    var done = false, close;
    function end(v) { if (done) return; done = true; res(v); close(); }
    var box = h('div', { class: 'ail-form' },
      h('p', { style: 'margin:0' }, message),
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('button', { type: 'button', class: 'ail-btn', onclick: function () { end(false); } }, 'Huỷ'),
        h('button', { type: 'button', class: 'ail-btn ' + (danger ? 'bad' : 'pri'), onclick: function () { end(true); } }, confirmLabel)));
    close = modal(title, box, { cls: 'confirm', focusTo: function (root) { return root.querySelector(danger ? '.ail-btn.bad' : '.ail-btn.pri'); },
      onClose: function () { if (!done) { done = true; res(false); } } });
  });
}
export function promptModal(title, message, opts) {
  opts = opts || {};
  var minLen = opts.minLen != null ? opts.minLen : 1, maxLen = opts.maxLen != null ? opts.maxLen : 300;
  return new Promise(function (res) {
    var done = false, close;
    function end(v) { if (done) return; done = true; res(v); close(); }
    var err = h('div', { class: 'err', role: 'alert', style: 'display:none' });
    var counter = h('span', { class: 'meta', 'aria-live': 'polite' });
    var ta = h('textarea', { maxlength: maxLen, placeholder: opts.placeholder || '', 'aria-label': opts.fieldLabel || 'Nội dung', style: 'min-height:90px' });
    ta.value = opts.initial || '';
    function drawCount() { counter.textContent = ta.value.length + '/' + maxLen + (minLen > 1 ? ' · tối thiểu ' + minLen : ''); }
    ta.addEventListener('input', function () { err.style.display = 'none'; drawCount(); });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } });
    function submit() {
      var v = ta.value.trim();
      if (v.length < minLen) { err.textContent = 'Cần ít nhất ' + minLen + ' ký tự (hiện có ' + v.length + ').'; err.style.display = ''; ta.focus(); return; }
      end(v);
    }
    var box = h('div', { class: 'ail-form' },
      message ? h('p', { style: 'margin:0' }, message) : null,
      h('label', { class: 'l' }, opts.fieldLabel || 'Nội dung', ta, counter), err,
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('button', { type: 'button', class: 'ail-btn', onclick: function () { end(null); } }, 'Huỷ'),
        h('button', { type: 'button', class: 'ail-btn pri', onclick: submit }, opts.confirmLabel || 'Xác nhận')));
    drawCount();
    close = modal(title, box, { cls: 'prompt', focusTo: ta, onClose: function () { if (!done) { done = true; res(null); } } });
  });
}

/* ---------- chép vào clipboard: Clipboard API + fallback execCommand, trả true/false chính xác ---------- */
export function copyText(text) {
  var t = String(text == null ? '' : text);
  function legacy() {
    try {
      var ta = h('textarea', { readonly: true, 'aria-hidden': 'true' });
      ta.value = t;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, t.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t).then(function () { return true; }).catch(function () { return legacy(); });
  }
  return Promise.resolve(legacy());
}

/* ---------- bộ soạn câu hỏi client (khớp parse_questions trong ailab/store.py, thu hẹp 2–4 đáp án A–D) ---------- */
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
var TF_TRUE = ['đúng', 'dung', 'true', 't'], TF_FALSE = ['sai', 'false', 'f'];
var KEYS = 'ABCD';

function parseQ(raw) {
  var questions = [], errors = [];
  var lines = String(raw == null ? '' : raw).split(/\r\n|\n|\r/);
  for (var n = 0; n < lines.length; n++) {
    var line = lines[n].trim();
    if (!line) continue;
    var no = n + 1;
    function fail(msg) { errors.push({ line: no, text: line, error: msg }); }
    var parts = line.split('|').map(function (p) { return p.trim(); });
    var ans = parts.filter(function (p) { return p.charAt(0) === '='; });
    if (parts.length < 2 || ans.length !== 1 || parts[parts.length - 1] !== ans[0] || !parts[0]) { fail('Viết theo mẫu  Câu hỏi | Đáp án A | Đáp án B | =B'); continue; }
    var a = ans[0].slice(1).trim(), body = parts.slice(1, -1), id = 'q' + questions.length;
    if (!body.length) {
      var k = a.toLowerCase();
      if (TF_TRUE.indexOf(k) < 0 && TF_FALSE.indexOf(k) < 0) { fail('Câu Đúng/Sai viết  Câu hỏi | =Đúng  hoặc  =Sai'); continue; }
      questions.push({ id: id, type: 'truefalse', html: '<p>' + escHtml(parts[0]) + '</p>', text: parts[0],
        choices: [{ key: 'T', html: 'Đúng', text: 'Đúng' }, { key: 'F', html: 'Sai', text: 'Sai' }], answer: TF_TRUE.indexOf(k) >= 0 ? 'T' : 'F' });
      continue;
    }
    if (body.length < 2 || body.length > 4) { fail('Mỗi câu trắc nghiệm có 2–4 đáp án (A–D).'); continue; }
    var up = a.toUpperCase(), keys = KEYS.slice(0, body.length);
    if (!/^[A-D]$/.test(up) || keys.indexOf(up) < 0) { fail('Đáp án đúng phải là một trong ' + keys.split('').join(', ') + ' (khớp đáp án có sẵn).'); continue; }
    questions.push({ id: id, type: 'single', html: '<p>' + escHtml(parts[0]) + '</p>', text: parts[0],
      choices: body.map(function (t, i) { return { key: KEYS[i], html: escHtml(t), text: t }; }), answer: up });
  }
  return { questions: questions, errors: errors };
}
export function parseQuestionsClient(raw) { return parseQ(raw); }
export function validateQuestionsClient(raw) {
  var r = parseQ(raw);
  r.valid = r.errors.length === 0;
  return r;
}
export function serializeQuestionsClient(questions) {
  return (questions || []).map(function (q) {
    var text = String(q.text || q.question || '').trim().replace(/\s+/g, ' ');
    var tf = q.type === 'truefalse' || (Array.isArray(q.choices) && q.choices.length === 2 && q.choices[0] && q.choices[0].key === 'T');
    if (tf) {
      var ans = String(q.answer == null ? 'T' : q.answer).toLowerCase();
      var isT = TF_TRUE.indexOf(ans) >= 0 || ans === 'đ';
      return text + ' | =' + (isT ? 'Đúng' : 'Sai');
    }
    var choices = Array.isArray(q.choices) && q.choices.length ? q.choices.map(function (c) { return c && c.text != null ? c.text : c; })
      : (q.answers || q.options || []);
    var key = q.answer;
    if (key == null && q.correctIndex != null) key = KEYS[q.correctIndex];
    return text + ' | ' + choices.join(' | ') + ' | =' + (key || 'A');
  }).join('\n');
}
