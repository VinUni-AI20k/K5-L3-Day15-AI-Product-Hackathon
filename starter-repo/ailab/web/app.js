(function () {
'use strict';
var root = document.getElementById('app');
var me = null, llmMode = '', curTab = 'models';

/* ---------- dựng DOM ---------- */
function h(tag, attrs) {
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
function add(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
  el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
}
function api(method, url, body) {
  var opt = { method: method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(url, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok) { var e = new Error(d.message || 'Có lỗi, thử lại.'); e.status = r.status; e.code = d.error; throw e; }
      return d;
    });
  });
}
/* biểu tượng: mọi nút có biểu tượng đi trước chữ (luật UX của JULY) */
var IC = {
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
  wand: '<path d="M5 19L17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7z"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'
};
function ico(n) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = IC[n] || IC.more;
  return s;
}
function btn(label, icon, o) {
  o = o || {};
  var attrs = { type: o.href ? null : 'button', class: 'ail-btn' + (o.cls ? ' ' + o.cls : ''), onclick: o.onclick, href: o.href, target: o.target, rel: o.target ? 'noopener' : null, title: o.title, 'aria-label': o.label };
  return h(o.href ? 'a' : 'button', attrs, icon ? ico(icon) : null, label);
}
/* nút cũ viết bằng chữ: tự thêm biểu tượng theo chữ (mọi nút đều có biểu tượng) */
var AUTO = [[/^Lưu/, 'check'], [/^Huỷ|^Đóng|^Từ chối/, 'x'], [/^Gửi/, 'send'], [/^Chơi|^Thử|^Xem thử/, 'play'], [/^Sửa/, 'edit'], [/^Xoá/, 'trash'], [/^Chép/, 'link'], [/^Duyệt/, 'check'],
  [/^Ẩn/, 'eye'], [/^Khôi phục|^Đọc/, 'refresh'], [/^Công khai|^Chuyển riêng/, 'globe'], [/^Rút/, 'undo'], [/^Đăng nhập/, 'login'], [/^Tạo|^Thêm|^\+/, 'plus'], [/^Xem mã/, 'code'], [/^Đổi/, 'user'], [/^Đăng xuất/, 'logout'], [/^Đã/, 'check']];
var decoQueued = false;
function decorate() {
  decoQueued = false;
  document.querySelectorAll('button.ail-btn, a.ail-btn, .modal button.ail-btn').forEach(function (b) {
    if (b.querySelector('svg') || b.classList.contains('icon')) return;
    var t = b.textContent.trim();
    for (var i = 0; i < AUTO.length; i++) if (AUTO[i][0].test(t)) { b.insertBefore(ico(AUTO[i][1]), b.firstChild); return; }
    if (t) b.insertBefore(ico('chevR'), b.firstChild);
  });
}
new MutationObserver(function () { if (!decoQueued) { decoQueued = true; requestAnimationFrame(decorate); } }).observe(document.body, { childList: true, subtree: true });
function errBox(e) { return h('div', { class: 'err', role: 'alert' }, e.message || String(e)); }
function mount(el) { var m = document.getElementById('main'); m.className = 'ail-main'; m.replaceChildren(h('div', { class: 'ail-page' + (curTab === 'chat' || curTab === 'admin' ? ' wide' : '') }, el)); }
function seg(opts, cur, fn) {
  return h('div', { class: 'ail-seg', style: 'width:max-content' }, opts.map(function (o) {
    return h('a', { href: '#', class: cur === o[0] ? 'on' : '', onclick: function (e) { e.preventDefault(); fn(o[0]); } }, o[1]);
  }));
}
var STATUS = { draft: ['Nháp', 'warn'], pending: ['Chờ duyệt', 'warn'], approved: ['Đã duyệt', 'ok'], refused: ['Bị từ chối', 'bad'], hidden: ['Đã ẩn', 'bad'] };
function fmtStatus(s) { var m = STATUS[s] || [s, '']; return h('span', { class: 'ail-chip ' + m[1] }, m[0]); }
var KIND = { image: 'Hình ảnh', pose: 'Tư thế', audio: 'Âm thanh', hands: 'Bàn tay (có sẵn)' };
function confirmDo(msg, fn) { if (window.confirm(msg)) fn(); }
function srcOf(x) { return (x.sample || x.owner === 'AI Lab') ? 'AI Lab' : (x.mine ? 'Của tôi' : 'Người dùng khác'); }


var QHELP = 'Mỗi dòng một câu: Câu hỏi | Đáp án A | Đáp án B | Đáp án C | =B   (=B là đáp án đúng). Câu Đúng/Sai: Câu hỏi | =Đúng';


/* ---------- thẻ, menu ---------- */
var HUES = ['blue', 'violet', 'mint', 'pink'];
function menuBtn(items) {
  var wrap = h('span', { class: 'ail-rel' }), open = null;
  function close() { if (open) { open.remove(); open = null; document.removeEventListener('click', away, true); } }
  function away(e) { if (open && !wrap.contains(e.target)) close(); }
  var b = h('button', { type: 'button', class: 'ail-btn icon sm', 'aria-label': 'Thêm thao tác', 'aria-haspopup': 'menu', onclick: function (e) {
    e.stopPropagation();
    if (open) return close();
    open = h('div', { class: 'ail-menu', role: 'menu' }, items.filter(Boolean).map(function (it) {
      return h(it.href ? 'a' : 'button', { type: it.href ? null : 'button', role: 'menuitem', class: it.cls || '', href: it.href, target: it.target, rel: it.target ? 'noopener' : null, onclick: function (ev) { ev.stopPropagation(); close(); if (it.onclick) it.onclick(); } }, ico(it.icon || 'chevR'), it.label);
    }));
    wrap.appendChild(open); document.addEventListener('click', away, true);
  } }, ico('more'));
  wrap.appendChild(b);
  return wrap;
}
function itemCard(o) {
  var el = h('div', { class: 'jlps-card is-grid ail-card hue-' + o.hue + (o.selected ? ' is-on' : ''), role: 'option', tabindex: '0', 'aria-selected': o.selected ? 'true' : 'false',
    onclick: o.onSelect, ondblclick: o.onOpen, onkeydown: function (e) { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (e.key === 'Enter' && o.onOpen ? o.onOpen : o.onSelect)(); } } },
    h('div', { class: 'ail-thumb' }, o.image ? h('img', { class: 'ail-thumb-img', src: o.image, alt: '' }) : ico(o.icon || 'image'), o.pill ? h('span', { class: 'ail-pill' }, o.pill) : null),
    h('div', { class: 'ail-card-in' },
      h('div', { class: 'jlps-card-title' }, o.title), o.meta ? h('div', { class: 'jlps-card-sub' }, o.meta) : null,
      h('div', { class: 'ail-tags' }, o.tags || []),
      h('div', { class: 'ail-foot' }, h('span', { class: 'ail-state ' + (o.state ? o.state[1] : ''), title: o.state ? o.state[2] : '', role: 'img', 'aria-label': o.state ? o.state[2] : null }, ico(o.state ? o.state[0] : 'check')), o.menu && o.menu.length ? menuBtn(o.menu) : null)));
  return el;
}
function tagsOf(list, max) {
  var out = list.slice(0, max).map(function (t) { return h('span', { class: 'ail-chip' }, t); });
  if (list.length > max) out.push(h('span', { class: 'ail-chip more' }, '+' + (list.length - max)));
  return out;
}

/* ---------- trang danh sách dùng chung: bộ lọc trái, lưới thẻ, chi tiết phải (cùng bố cục bộ chọn của JULY) ---------- */
var tryState = null;
function stopTry() { if (tryState) { tryState.stop(); tryState = null; } }
function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
function listPage(cfg) {
  var st = { q: '', f: {}, page: 1, size: 12, sel: cfg.value != null && cfg.value !== '' ? String(cfg.value) : null };
  var aside = h('aside', { class: 'jlps-aside', 'aria-label': 'Bộ lọc' }), grid = h('div', { class: 'ail-grid', role: 'listbox', 'aria-label': cfg.noun }),
    foot = h('div', { class: 'jlps-foot' }), detail = h('aside', { class: 'jlps-detail', 'aria-label': 'Chi tiết' });
  var search = h('input', { type: 'text', placeholder: 'Tìm theo tên ' + cfg.noun, 'aria-label': 'Tìm ' + cfg.noun, oninput: function () { st.q = search.value; st.page = 1; draw(); } });
  function matches(it, except) {
    if (st.q && fold(cfg.text(it)).indexOf(fold(st.q)) < 0) return false;
    return cfg.filters.every(function (f) { return f.key === except || !st.f[f.key] || f.values(it).indexOf(st.f[f.key]) >= 0; });
  }
  function active() { return Object.keys(st.f).filter(function (k) { return st.f[k]; }).length; }
  function drawAside() {
    var n = active();
    aside.replaceChildren(h('div', { class: 'jlps-panel' },
      h('div', { class: 'jlps-band' }, h('h2', null, h('span', { class: 'jlps-accent' }, ico('filter')), 'Bộ lọc', n ? h('span', { class: 'jlps-badge' }, n) : null),
        h('div', { class: 'jlps-band-actions' }, n ? h('button', { type: 'button', class: 'jlps-link', onclick: function () { st.f = {}; st.page = 1; draw(); } }, 'Xoá lọc') : null)),
      cfg.filters.map(function (f) {
        var vals = (f.order || []).slice();
        cfg.items.forEach(function (it) { f.values(it).forEach(function (v) { if (vals.indexOf(v) < 0) vals.push(v); }); });
        var pool = cfg.items.filter(function (it) { return matches(it, f.key); });
        return h('details', { class: 'jlps-section', open: true }, h('summary', { class: 'jlps-summary' }, f.label),
          h('div', { class: 'jlps-list', role: 'radiogroup', 'aria-label': f.label }, vals.map(function (v, i) {
            var c = pool.filter(function (it) { return f.values(it).indexOf(v) >= 0; }).length, on = st.f[f.key] === v;
            var inp = h('input', { type: 'radio', name: 'f-' + f.key, checked: on, onclick: function (e) { st.f[f.key] = on ? '' : v; st.page = 1; draw(); } });
            return h('label', { class: 'jlps-choice jlps-hue-' + ['orange', 'sky', 'violet', 'mint'][i % 4] + (on ? ' is-on' : '') + (c === 0 && !on ? ' is-dead' : '') }, inp, h('span', { class: 'ail-radio' }), h('span', { class: 'jlps-choice-label' }, v), h('span', { class: 'jlps-count' }, c));
          })));
      })));
  }
  function pager(total, pages) {
    var a = total ? (st.page - 1) * st.size + 1 : 0, b = Math.min(total, st.page * st.size);
    var nums = [], i;
    for (i = 1; i <= pages; i++) if (pages <= 7 || i === 1 || i === pages || Math.abs(i - st.page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    foot.replaceChildren(h('nav', { class: 'jlps-pagerbar', 'aria-label': 'Phân trang' },
      h('span', { class: 'jlps-pagerbar-summary', 'aria-live': 'polite' }, a + '–' + b + ' trên ' + total + ' ' + cfg.noun),
      h('span', { class: 'jlps-pagerbar-pages' },
        h('button', { type: 'button', 'aria-label': 'Trang trước', disabled: st.page <= 1, onclick: function () { st.page--; draw(); } }, ico('chevL')),
        nums.map(function (n) { return n === '…' ? h('span', { class: 'jlps-pagerbar-gap' }, '…') : h('button', { type: 'button', class: n === st.page ? 'is-on' : '', 'aria-current': n === st.page ? 'page' : null, onclick: function () { st.page = n; draw(); } }, n); }),
        h('button', { type: 'button', 'aria-label': 'Trang sau', disabled: st.page >= pages, onclick: function () { st.page++; draw(); } }, ico('chevR'))),
      h('label', { class: 'jlps-size' }, h('span', { class: 'sr' }, 'Số mục mỗi trang'),
        h('select', { class: 'jlps-select', onchange: function (e) { st.size = parseInt(e.target.value, 10); st.page = 1; draw(); } }, [12, 24, 48].map(function (n) { return h('option', { value: n, selected: n === st.size }, n + ' / trang'); })))));
  }
  function drawDetail(it) {
    stopTry();
    if (!it) return detail.replaceChildren(h('div', { class: 'jlps-detail-empty' }, 'Chọn một ' + cfg.noun + ' để xem chi tiết.'));
    var d = cfg.detail(it), foot = (d.footer || []).slice();
    if (cfg.canMeta && !cfg.pick && cfg.canMeta(it)) foot.push(btn('Sửa thông tin', 'edit', { onclick: function () { metaModal(cfg.res, it); } }));
    detail.replaceChildren(h('div', { class: 'jlps-detail-head' }, h('h3', null, d.title), d.sub ? h('div', { class: 'ail-sub' }, d.sub) : null),
      h('div', { class: 'jlps-detail-body' }, it.image ? h('img', { class: 'ail-detail-img', src: it.image, alt: '' }) : null, d.body),
      foot.length ? h('div', { class: 'jlps-detail-foot' }, h('div', { class: 'ail-row', style: 'justify-content:flex-start;flex-wrap:wrap' }, foot)) : null);
  }
  var lastSel = null;
  function draw() {
    var fl = cfg.items.filter(function (it) { return matches(it, null); }), total = fl.length, pages = Math.max(1, Math.ceil(total / st.size));
    if (st.page > pages) st.page = pages;
    var pg = fl.slice((st.page - 1) * st.size, st.page * st.size);
    if (!fl.some(function (it) { return String(it.id) === st.sel; })) st.sel = pg.length ? String(pg[0].id) : null;
    drawAside();
    grid.replaceChildren();
    if (!pg.length) grid.replaceChildren(h('div', { class: 'ail-empty', style: 'grid-column:1/-1' }, ico('image'), h('div', null, cfg.items.length ? 'Không có ' + cfg.noun + ' nào khớp. Thử bỏ bớt bộ lọc.' : cfg.empty)));
    pg.forEach(function (it, i) {
      var o = cfg.card(it, i);
      o.image = it.image;
      if (cfg.canMeta && !cfg.pick && cfg.canMeta(it)) o.menu = [{ label: 'Sửa thông tin', icon: 'edit', onclick: function () { metaModal(cfg.res, it); } }].concat(o.menu || []);
      o.hue = HUES[(it.id + i) % 4]; o.selected = String(it.id) === st.sel;
      o.onSelect = function () { st.sel = String(it.id); draw(); };
      if (cfg.pick) o.onOpen = function () { cfg.pick(it); };
      grid.appendChild(itemCard(o));
    });
    pager(total, pages);
    var cur = fl.filter(function (it) { return String(it.id) === st.sel; })[0];
    if (String(cur && cur.id) !== lastSel) { lastSel = String(cur && cur.id); drawDetail(cur); }
  }
  var results = h('div', { class: 'jlps-results' }, h('div', { class: 'jlps-box' },
    h('div', { class: 'jlps-head' }, h('div', { class: 'jlps-toolbar' }, h('label', { class: 'jlps-search' }, ico('search'), search), (cfg.actions || []))),
    h('div', { class: 'jlps-scroll is-inset' }, grid), foot));
  var main = h('div', { class: 'jlps-main' }, h('div', { class: 'jlps-frame is-fill' }, h('div', { class: 'jlps-layout' }, aside, results)), detail);
  draw();
  main.redetail = function () { lastSel = null; draw(); };
  return main;
}

/* ---------- thử mô hình bằng camera ngay ở khung chi tiết ---------- */
var TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js';
var LIBS = { image: [TF, 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js'], pose: [TF, 'https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8/dist/teachablemachine-pose.min.js'] };
function loadScript(src) {
  return new Promise(function (ok, bad) {
    if (document.querySelector('script[src="' + src + '"]')) return ok();
    var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('Không tải được thư viện cần cho camera (cần internet).')); };
    document.head.appendChild(s);
  });
}
function cameraTry(m, box, setScores, button) {
  var stream = null, run = false, video = null, timer = 0;
  function idle() { box.className = 'ail-cambox'; box.replaceChildren(ico('image'), h('div', null, 'Chưa có ảnh')); button.replaceChildren(ico('camera'), 'Bật camera'); button.disabled = false; setScores(null); }
  function stop() { run = false; clearTimeout(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; idle(); }
  function start() {
    if (run) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { box.replaceChildren(errBox({ message: 'Trình duyệt chỉ cho dùng camera khi mở bằng https hoặc localhost.' })); return; }
    button.disabled = true; box.replaceChildren(h('div', null, 'Đang bật camera và nạp mô hình…'));
    var model;
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }).then(function (s) {
      stream = s; video = h('video', { playsinline: true, muted: true }); video.muted = true; video.srcObject = s; return video.play();
    }).then(function () { return LIBS[m.kind].reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve()); })
      .then(function () { return m.kind === 'pose' ? window.tmPose.load(m.url + 'model.json', m.url + 'metadata.json') : window.tmImage.load(m.url + 'model.json', m.url + 'metadata.json'); })
      .then(function (mm) { model = mm; run = true; box.className = 'ail-cambox on'; box.replaceChildren(video); button.replaceChildren(ico('x'), 'Tắt camera'); button.disabled = false; tick(); })
      .catch(function (err) {
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        stop(); box.replaceChildren(errBox({ message: denied ? 'Bạn chưa cho phép camera.' : 'Không bật được: ' + (err && err.message || err) }));
      });
    function tick() {
      if (!run) return;
      var p = m.kind === 'pose' ? model.estimatePose(video).then(function (r) { return model.predict(r.posenetOutput); }) : model.predict(video);
      p.then(function (preds) { var o = {}; preds.forEach(function (x) { o[x.className] = x.probability; }); setScores(o); }).catch(function () {}).then(function () { timer = setTimeout(tick, 150); });
    }
  }
  button.onclick = function () { run ? stop() : start(); };
  idle();
  return { stop: stop, start: start };
}


function previewFrame(playerId, onInfo) {
  var wrap = h('div'), frame = h('iframe', { sandbox: 'allow-scripts', title: 'Xem thử trình chơi' });
  wrap.appendChild(h('p', { class: 'meta' }, 'Đang nạp…'));
  api('GET', typeof playerId === 'string' ? playerId : '/api/players/' + playerId + '/try').then(function (d) {
    wrap.replaceChildren(frame);
    if (onInfo) onInfo(d);
    var man = d.manifest;
    function init() {
      var m = { type: 'camera.init', mode: 'play', locale: 'vi', options: {}, theme: 'light' };
      if (man.inputs) { m.inputs = man.inputs.map(function (i) { return { key: i.key, label: i.label }; }); m.questions = d.sampleQuestions; }
      else if (man.questions === 'exam') m.questions = d.sampleQuestions;
      else m.content = (man.demo || {}).content || [];
      frame.contentWindow.postMessage(m, '*');
    }
    window.addEventListener('message', function onMsg(e) {
      if (!frame.isConnected) return window.removeEventListener('message', onMsg);
      if (e.source === frame.contentWindow && e.data && e.data.type === 'ready') init();
    });
    frame.srcdoc = d.srcdoc;
  }).catch(function (e) { wrap.replaceChildren(errBox(e)); });
  return wrap;
}

function modal(title, body) {
  var m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: function (e) { if (e.target === m) close(); } },
    h('div', { class: 'box' }, h('div', { class: 'bar' }, h('h3', { class: 'sp' }, title), h('button', { class: 'ail-btn sm', onclick: close }, 'Đóng')), body));
  function close() { m.remove(); document.removeEventListener('keydown', esc); }
  function esc(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', esc);
  document.body.appendChild(m);
  return close;
}


/* ---------- ảnh + sửa thông tin (tên, mô tả, ảnh) ---------- */
function shrink(file) {
  return new Promise(function (ok, bad) {
    if (!/^image\//.test(file.type)) return bad(new Error('Hãy chọn một file ảnh (png, jpeg, webp).'));
    var url = URL.createObjectURL(file), img = new Image();
    img.onerror = function () { URL.revokeObjectURL(url); bad(new Error('Không đọc được ảnh này.')); };
    img.onload = function () {
      URL.revokeObjectURL(url);
      var k = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement('canvas'), g;
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      var q = 0.85, out;
      do { out = c.toDataURL('image/jpeg', q); q -= 0.1; } while (out.length > 380000 && q > 0.2);
      if (out.length > 380000) bad(new Error('Ảnh vẫn quá lớn sau khi thu nhỏ. Chọn ảnh khác.')); else ok(out);
    };
    img.src = url;
  });
}
function imageField(current) {
  var val = current || '', changed = false, msg = h('div'), prev = h('div', { class: 'ail-imgprev' });
  var file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Chọn ảnh', onchange: function () {
    var f = file.files[0]; if (!f) return;
    shrink(f).then(function (d) { val = d; changed = true; msg.replaceChildren(); draw(); }).catch(function (e) { msg.replaceChildren(errBox(e)); });
  } });
  var rm = h('button', { type: 'button', class: 'ail-btn sm', onclick: function () { val = ''; changed = true; file.value = ''; draw(); } }, 'Bỏ ảnh');
  function draw() { prev.replaceChildren(val ? h('img', { src: val, alt: 'Ảnh đại diện' }) : h('div', { class: 'ail-noimg' }, ico('image'), h('span', null, 'Chưa có ảnh'))); rm.style.display = val ? '' : 'none'; }
  draw();
  return { el: h('div', { class: 'l' }, 'Ảnh đại diện (tự thu nhỏ, tối đa 300 KB)', prev, h('div', { class: 'row' }, file, rm), msg), get value() { return val; }, get changed() { return changed; } };
}
function metaModal(res, it) {
  var name = h('input', { type: 'text', maxlength: 80, required: true, value: it.name }), desc = h('textarea', { maxlength: 300 }), msg = h('div'), close;
  desc.value = it.description || '';
  var img = imageField(it.image);
  var f = h('form', { class: 'ail-form', onsubmit: function (e) {
    e.preventDefault();
    var body = { name: name.value, description: desc.value }; if (img.changed) body.image = img.value;
    api('POST', '/api/' + res + '/' + it.id + '/meta', body).then(function () { close(); route(); }).catch(function (x) { msg.replaceChildren(errBox(x)); });
  } }, h('label', { class: 'l' }, 'Tiêu đề', name), h('label', { class: 'l' }, 'Mô tả', desc), img.el, msg,
    h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, 'Lưu'), h('button', { type: 'button', class: 'ail-btn', onclick: function () { close(); } }, 'Huỷ')));
  close = modal('Sửa thông tin', f); name.focus();
}

/* ---------- cấu hình từng loại ---------- */
function actionCount(m) { return m.outputs.filter(function (o) { return o.role === 'action'; }).length; }
function delModel(m) { confirmDo('Xoá mô hình “' + m.name + '”?', function () { api('DELETE', '/api/models/' + m.id).then(route).catch(function (e) { window.alert(e.message); }); }); }
function modelsCfg(items, o) {
  o = o || {};
  return {
    noun: 'mô hình', res: 'models', canMeta: function (m) { return (m.mine || me.role === 'admin') && m.owner !== 'AI Lab'; }, items: items, value: o.value, pick: o.pick, empty: 'Bạn chưa có mô hình nào. Bấm “Tạo mô hình” để làm từ đầu, hoặc “Thêm mô hình” nếu đã có đường dẫn Teachable Machine.', actions: o.actions,
    text: function (m) { return m.name + ' ' + (m.description || '') + ' ' + m.outputs.map(function (x) { return x.key; }).join(' '); },
    filters: [
      { key: 'src', label: 'Nguồn', values: function (m) { return [srcOf(m)]; }, order: ['AI Lab', 'Của tôi', 'Người dùng khác'] },
      { key: 'kind', label: 'Loại mô hình', values: function (m) { return [KIND[m.kind]]; }, order: [KIND.image, KIND.pose, KIND.audio, KIND.hands] },
      { key: 'n', label: 'Số đáp án', values: function (m) { var n = actionCount(m); return [n === 0 ? 'Chưa có đáp án' : n >= 5 ? '5+ đáp án' : n + ' đáp án']; }, order: ['Chưa có đáp án', '1 đáp án', '2 đáp án', '3 đáp án', '4 đáp án', '5+ đáp án'] },
      { key: 'use', label: 'Sử dụng', values: function (m) { return [m.usedBy ? 'Có ứng dụng dùng' : 'Chưa ứng dụng nào dùng']; }, order: ['Có ứng dụng dùng', 'Chưa ứng dụng nào dùng'] }
    ],
    card: function (m) {
      var usable = actionCount(m) > 0, can = (m.mine || me.role === 'admin') && m.owner !== 'AI Lab';
      return { icon: m.kind === 'pose' ? 'user' : m.kind === 'hands' ? 'eye' : 'image', pill: usable ? null : 'Chưa dùng được', title: m.name,
        meta: KIND[m.kind] + (m.owner && !m.mine ? ' · ' + m.owner : '') + (m.usedBy ? ' · ' + m.usedBy + ' ứng dụng' : ''), tags: tagsOf(m.outputs.map(function (x) { return x.key; }), 2),
        state: usable ? ['check', '', 'Dùng được'] : ['minus', 'off', 'Chưa dùng được'],
        menu: o.pick || !can ? [] : [{ label: 'Sửa', icon: 'edit', href: '#/models/' + m.id }, { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { delModel(m); } }] };
    },
    detail: function (m) {
      var can = (m.mine || me.role === 'admin') && m.owner !== 'AI Lab';
      var bars = h('div', { class: 'ail-bars' }), rows = {};
      m.outputs.forEach(function (x) {
        var fill = h('i'), pc = h('span', { class: 'pc' }, '0%');
        rows[x.key] = { fill: fill, pc: pc };
        bars.appendChild(h('div', { class: 'ail-bar' }, h('span', { class: 'lb', title: x.key }, x.key), h('span', { class: 'tr' }, fill), pc));
      });
      function setScores(s) { m.outputs.forEach(function (x) { var v = s && s[x.key] ? s[x.key] : 0; rows[x.key].fill.style.width = Math.round(v * 100) + '%'; rows[x.key].pc.textContent = Math.round(v * 100) + '%'; }); }
      var body = [m.description ? h('p', { class: 'ail-desc' }, m.description) : null];
      if (m.kind === 'image' || m.kind === 'pose') {
        var box = h('div', { class: 'ail-cambox' }), cb = h('button', { type: 'button', class: 'ail-btn pri', style: 'align-self:flex-start' });
        var auto = h('input', { type: 'checkbox', checked: localStorage.getItem('ail.autocam') === '1', onchange: function (e) { localStorage.setItem('ail.autocam', e.target.checked ? '1' : '0'); } });
        var ts = tryState = cameraTry(m, box, setScores, cb);
        body.push(box, h('div', { class: 'ail-row' }, cb), h('div', { class: 'ail-row' }, h('span', { class: 'jlps-card-title' }, 'Tự mở camera khi xem trước'), h('label', { class: 'ail-switch' }, auto, h('i'), h('span', { class: 'sr' }, 'Tự mở camera khi xem trước'))));
        if (localStorage.getItem('ail.autocam') === '1') setTimeout(function () { if (tryState === ts) ts.start(); }, 0);
      } else body.push(h('div', { class: 'ail-cambox' }, ico('image'), h('div', null, m.kind === 'hands' ? 'Bàn tay có sẵn: thử khi chơi một ứng dụng dùng nó.' : 'Mô hình âm thanh mới chỉ lưu, chưa xem trước được ở bản này.')));
      body.push(bars);
      var foot = [];
      if (o.pick) foot.push(btn('Chọn mô hình này', 'check', { cls: 'pri', onclick: function () { o.pick(m); } }));
      else if (can) foot.push(btn('Sửa', 'edit', { href: '#/models/' + m.id }), btn('Xoá', 'trash', { cls: 'bad', onclick: function () { delModel(m); } }));
      return { title: m.name, sub: KIND[m.kind] + ' · ' + (m.visibility === 'public' ? 'Công khai' : 'Riêng tư') + (m.owner && !m.mine ? ' · ' + m.owner : ''), body: body, footer: foot };
    }
  };
}
function playerKind(p) { var m = p.manifest; return m.inputs ? 'Camera' : (m.questions ? 'Game câu hỏi' : 'Game danh sách'); }
function playerAct(p, action, body) { return api('POST', '/api/players/' + p.id + '/' + action, body).then(route).catch(function (e) { window.alert(e.message); }); }
function playersCfg(items, o) {
  o = o || {};
  function acts(p) {
    var can = p.mine || me.role === 'admin', a = [];
    if (!can) return a;
    if (p.status === 'draft' || p.status === 'refused') a.push({ label: 'Gửi duyệt', icon: 'send', onclick: function () { playerAct(p, 'submit'); } });
    if (p.status === 'pending') a.push({ label: 'Rút lại', icon: 'undo', onclick: function () { playerAct(p, 'withdraw'); } });
    if (p.status === 'approved' && !p.sample) a.push({ label: p.visibility === 'public' ? 'Chuyển riêng tư' : 'Công khai', icon: 'globe', onclick: function () { playerAct(p, 'visibility', { visibility: p.visibility === 'public' ? 'private' : 'public' }); } });
    a.push({ label: 'Sửa', icon: 'edit', href: '#/players/' + p.id });
    a.push({ label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { confirmDo('Xoá trình chơi “' + p.name + '”?', function () { api('DELETE', '/api/players/' + p.id).then(route).catch(function (e) { window.alert(e.message); }); }); } });
    return a;
  }
  return {
    noun: 'trình chơi', res: 'players', canMeta: function (p) { return p.mine || me.role === 'admin'; }, items: items, value: o.value, pick: o.pick, actions: o.actions, empty: 'Bạn chưa có trình chơi nào. Bấm “Thêm trình chơi” (dán hoặc tải file HTML) hoặc nhờ Trợ lý game tạo giúp.',
    text: function (p) { return p.name + ' ' + (p.description || ''); },
    filters: [
      { key: 'src', label: 'Nguồn', values: function (p) { return [srcOf(p)]; }, order: ['AI Lab', 'Của tôi', 'Người dùng khác'] },
      { key: 'kind', label: 'Loại trình chơi', values: function (p) { return [playerKind(p)]; }, order: ['Camera', 'Game danh sách', 'Game câu hỏi'] },
      { key: 'st', label: 'Trạng thái', values: function (p) { return [STATUS[p.status][0]]; }, order: ['Nháp', 'Chờ duyệt', 'Đã duyệt', 'Bị từ chối'] },
      { key: 'vis', label: 'Hiển thị', values: function (p) { return [p.visibility === 'public' ? 'Công khai' : 'Riêng tư']; }, order: ['Công khai', 'Riêng tư'] }
    ],
    card: function (p) {
      var ok = p.status === 'approved';
      return { icon: 'play', pill: ok ? null : STATUS[p.status][0], title: p.name, meta: playerKind(p) + (p.owner && !p.mine ? ' · ' + p.owner : '') + (p.source === 'ai' ? ' · AI viết' : p.source === 'fake' ? ' · AI giả' : ''),
        tags: p.manifest.inputs ? tagsOf(p.manifest.kinds.map(function (k) { return KIND[k]; }), 2) : [], state: ok ? ['check', '', 'Đã duyệt'] : ['minus', 'warn', STATUS[p.status][0]], menu: o.pick ? [] : acts(p) };
    },
    detail: function (p) {
      var body = [h('div', { class: 'ail-preview' }, previewFrame(p.id)), p.description ? h('p', { class: 'ail-desc' }, p.description) : null,
        h('dl', { class: 'ail-dl' }, h('dt', null, 'Trạng thái'), h('dd', null, fmtStatus(p.status)), h('dt', null, 'Loại'), h('dd', null, playerKind(p)), h('dt', null, 'Người tạo'), h('dd', null, p.mine ? 'Tôi' : (p.owner || 'AI Lab')),
          h('dt', null, 'Cờ xem xét'), h('dd', null, p.flags.length ? p.flags.map(function (f) { return h('span', { class: 'ail-chip warn', style: 'margin:0 4px 4px 0' }, f.label); }) : 'Không có'))];
      if (p.note) body.push(h('div', { class: 'note' }, p.note));
      var foot = o.pick ? [btn('Chọn trình chơi này', 'check', { cls: 'pri', onclick: function () { o.pick(p); } })] : acts(p).map(function (a) { return btn(a.label, a.icon, { href: a.href, cls: a.cls, onclick: a.onclick }); });
      return { title: p.name, sub: playerKind(p) + (p.owner && !p.mine ? ' · ' + p.owner : ''), body: body, footer: foot };
    }
  };
}
function appsCfg(items, players, models, o) {
  o = o || {};
  var pn = {}, mn = {};
  players.forEach(function (p) { pn[p.id] = p.name; }); models.forEach(function (m) { mn[m.id] = m.name; });
  function del(a) { confirmDo('Xoá ứng dụng “' + a.name + '”?', function () { api('DELETE', '/api/apps/' + a.id).then(route).catch(function (e) { window.alert(e.message); }); }); }
  return {
    noun: 'ứng dụng', res: 'apps', canMeta: function (a) { return a.mine || me.role === 'admin'; }, items: items, actions: o.actions, empty: 'Chưa có ứng dụng. Ứng dụng ghép một trình chơi với một mô hình (hoặc nội dung của bạn) thành thứ học sinh chơi được. Bấm “Thêm ứng dụng”.',
    text: function (a) { return a.name + ' ' + (a.description || '') + ' ' + (pn[a.player_id] || '') + ' ' + (mn[a.model_id] || ''); },
    filters: [
      { key: 'share', label: 'Chia sẻ', values: function (a) { return [a.share ? 'Ai có link đều chơi được' : 'Chỉ mình tôi']; }, order: ['Ai có link đều chơi được', 'Chỉ mình tôi'] },
      { key: 'kind', label: 'Dùng mô hình', values: function (a) { return [a.model_id ? 'Có mô hình' : 'Không cần mô hình']; }, order: ['Có mô hình', 'Không cần mô hình'] }
    ],
    card: function (a) {
      return { icon: 'grid', title: a.name, meta: (pn[a.player_id] || 'Trình chơi') + (a.model_id ? ' · ' + (mn[a.model_id] || 'Mô hình') : ''), tags: [a.share ? h('span', { class: 'ail-chip ok' }, 'Chia sẻ') : h('span', { class: 'ail-chip' }, 'Riêng tư')],
        state: ['play', '', 'Chơi được'], menu: [{ label: 'Chơi', icon: 'play', href: '/play/' + a.id, target: '_blank' }, a.mine ? { label: 'Sửa', icon: 'edit', href: '#/apps/' + a.id } : null, { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { del(a); } }] };
    },
    detail: function (a) {
      var link = location.origin + '/play/' + a.id;
      var copy = btn('Chép link', 'link', { onclick: function () { if (navigator.clipboard) navigator.clipboard.writeText(link); copy.replaceChildren(ico('check'), 'Đã chép link'); } });
      return { title: a.name, sub: a.mine ? 'Của tôi' : 'Của ' + (a.owner || ''), body: [a.description ? h('p', { class: 'ail-desc' }, a.description) : null,
        h('dl', { class: 'ail-dl' }, h('dt', null, 'Trình chơi'), h('dd', null, pn[a.player_id] || '—'), h('dt', null, 'Mô hình'), h('dd', null, a.model_id ? (mn[a.model_id] || '—') : 'Không cần'),
          h('dt', null, 'Chia sẻ'), h('dd', null, a.share ? 'Ai có link đều chơi được' : 'Chỉ mình tôi'), a.model_id ? [h('dt', null, 'Độ chắc chắn'), h('dd', null, String(a.sure)), h('dt', null, 'Giữ trong'), h('dd', null, a.hold_ms + ' ms')] : null)],
        footer: [btn('Chơi', 'play', { cls: 'pri', href: '/play/' + a.id, target: '_blank' })].concat(a.share ? [copy] : [], a.mine ? [btn('Sửa', 'edit', { href: '#/apps/' + a.id })] : [], [btn('Xoá', 'trash', { cls: 'bad', onclick: function () { del(a); } })]) };
    }
  };
}

/* ---------- bộ chọn (cùng khung bộ chọn của JULY) ---------- */
function pickerModal(kind, items, value, onPick) {
  function done(it) { close(); onPick(it); }
  var cfg = kind === 'model' ? modelsCfg(items, { pick: done, value: value }) : playersCfg(items, { pick: done, value: value });
  var title = kind === 'model' ? 'Chọn mô hình' : 'Chọn trình chơi';
  var m = h('div', { class: 'modal picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: function (e) { if (e.target === m) close(); } },
    h('div', { class: 'box jlps-shell' }, h('div', { class: 'jlps-header' }, h('h2', null, title), h('div', { class: 'jlps-header-end' }, h('button', { type: 'button', class: 'jlps-close', 'aria-label': 'Đóng', onclick: function () { close(); } }, ico('x')))), listPage(cfg)));
  function close() { stopTry(); m.remove(); document.removeEventListener('keydown', esc); }
  function esc(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', esc);
  document.body.appendChild(m);
}
function pickField(kind, items, value, label) {
  var cur = value == null ? '' : String(value), all = items, cb = function () {};
  var button = h('button', { type: 'button', class: 'ail-pick' });
  var el = h('div', { class: 'l' }, label, button);
  function item() { return all.filter(function (x) { return String(x.id) === cur; })[0]; }
  function sub(it) { return kind === 'model' ? KIND[it.kind] : playerKind(it); }
  function draw() {
    var it = item();
    button.replaceChildren(h('span', { class: 'mk' }, ico(kind === 'model' ? 'cube' : 'play')), h('span', { class: 'tx' }, h('b', null, it ? it.name : (kind === 'model' ? 'Chọn mô hình…' : 'Chọn trình chơi…')), it ? h('small', { class: 'meta' }, sub(it)) : null), ico('chevR'));
  }
  button.onclick = function () { pickerModal(kind, all, cur, function (it) { cur = String(it.id); draw(); cb(it); }); };
  draw();
  return { el: el, get value() { return cur; }, setItems: function (a) { all = a; if (cur && !item()) cur = ''; draw(); }, onChange: function (f) { cb = f; } };
}

/* ---------- khung trang và các màn danh sách ---------- */
function shell(cur, isList) {
  var tabs = [['models', 'Mô hình', 'cube'], ['players', 'Trình chơi', 'play'], ['exams', 'Bộ đề', 'edit'], ['apps', 'Ứng dụng', 'grid'], ['chat', 'Trợ lý game', 'chat']];
  if (me.role === 'admin') tabs.push(['admin', 'Duyệt & tài khoản', 'shield']);
  var names = { models: 'Mô hình AI Lab', players: 'Trình chơi AI Lab', exams: 'Bộ đề AI Lab', apps: 'Ứng dụng AI Lab', chat: 'Trợ lý game', admin: 'Duyệt & tài khoản' };
  root.className = 'jlps-shell';
  root.replaceChildren(
    h('header', { class: 'ail-top' }, h('div', { class: 'ail-crumbs' }, 'JULY AI Lab', h('span', null, '/'), h('b', null, names[cur] || 'AI Lab')),
      h('nav', { class: 'ail-seg', 'aria-label': 'Chính' }, tabs.map(function (t) { return h('a', { href: '#/' + t[0], class: cur === t[0] ? 'on' : '', 'aria-current': cur === t[0] ? 'page' : null }, ico(t[2]), t[1]); })),
      h('div', { class: 'ail-who' }, h('span', { class: 'nm' }, me.username + (me.role === 'admin' ? ' · Admin' : '')),
        h('button', { type: 'button', class: 'ail-btn icon sm', 'aria-label': 'Đăng xuất', title: 'Đăng xuất', onclick: function () { api('POST', '/api/logout').then(function () { me = null; loginView(); }); } }, ico('logout')))),
    h('main', { class: 'ail-main' + (isList ? ' is-list' : ''), id: 'main' }));
}
function listMount(title, page) { var m = document.getElementById('main'); m.replaceChildren(h('h1', { class: 'sr' }, title), page); }
function modelsView(parts) {
  if (parts[1] === 'new') return modelForm(null, parts[2] === 'create');
  if (parts[1] && /^\d+$/.test(parts[1])) return modelForm(parseInt(parts[1], 10));
  api('GET', '/api/models?scope=usable').then(function (d) {
    listMount('Mô hình', listPage(modelsCfg(d.models, { actions: [btn('Thêm mô hình', 'plus', { href: '#/models/new' }), btn('Tạo mô hình', 'wand', { cls: 'pri', href: '#/models/new/create' })] })));
  }).catch(function (e) { mount(errBox(e)); });
}
function playersView(parts) {
  if (parts[1] === 'new') return playerForm();
  if (parts[1] && /^\d+$/.test(parts[1])) return playerForm(parseInt(parts[1], 10));
  api('GET', '/api/players?scope=usable').then(function (d) {
    listMount('Trình chơi', listPage(playersCfg(d.players, { actions: [btn('Thêm trình chơi', 'plus', { cls: 'pri', href: '#/players/new' })] })));
  }).catch(function (e) { mount(errBox(e)); });
}

/* ---------- Bộ đề: nguồn câu hỏi dùng chung cho ứng dụng ---------- */
var EXAMPLE = '2 + 2 = ? | 3 | 4 | 5 | =B\nThủ đô của Việt Nam là Hà Nội | =Đúng';
function examsCfg(items, o) {
  o = o || {};
  function del(x) { confirmDo('Xoá bộ đề “' + x.name + '”?', function () { api('DELETE', '/api/exams/' + x.id).then(route).catch(function (e) { window.alert(e.message); }); }); }
  function bucket(x) { return x.count <= 5 ? '1–5 câu' : x.count <= 10 ? '6–10 câu' : 'Trên 10 câu'; }
  return {
    noun: 'bộ đề', res: 'exams', canMeta: function (x) { return !x.builtin || me.role === 'admin'; }, items: items, actions: o.actions,
    empty: 'Bạn chưa có bộ đề nào. Bấm “Thêm bộ đề” để soạn câu hỏi dùng cho nhiều ứng dụng.',
    text: function (x) { return x.name + ' ' + (x.description || ''); },
    filters: [{ key: 'sub', label: 'Môn học', values: function (x) { return [x.name.indexOf(':') > 0 ? x.name.split(':')[0] : 'Khác']; }, order: ['Toán 12', 'Tiếng Anh 12', 'Tin học 12'] }, { key: 'n', label: 'Số câu hỏi', values: function (x) { return [bucket(x)]; }, order: ['1–5 câu', '6–10 câu', 'Trên 10 câu'] }],
    card: function (x) {
      return { icon: 'edit', title: x.name, meta: x.count + ' câu hỏi' + (x.owner && !x.mine ? ' · ' + x.owner : ''), tags: [], state: ['check', '', 'Dùng được'],
        menu: x.builtin && me.role !== 'admin' ? [] : [{ label: 'Sửa', icon: 'edit', href: '#/exams/' + x.id }, { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { del(x); } }] };
    },
    detail: function (x) {
      return { title: x.name, sub: x.count + ' câu hỏi', body: [x.description ? h('p', { class: 'ail-desc' }, x.description) : null,
        h('dl', { class: 'ail-dl' }, h('dt', null, 'Số câu'), h('dd', null, String(x.count)), h('dt', null, 'Người tạo'), h('dd', null, x.mine ? 'Tôi' : (x.owner || '')))],
        footer: x.builtin && me.role !== 'admin' ? [] : [btn('Sửa', 'edit', { cls: 'pri', href: '#/exams/' + x.id }), btn('Xoá', 'trash', { cls: 'bad', onclick: function () { del(x); } })] };
    }
  };
}
function examsView(parts) {
  if (parts[1] === 'new') return examForm(null);
  if (parts[1] && /^\d+$/.test(parts[1])) return examForm(parseInt(parts[1], 10));
  api('GET', '/api/exams' + (me.role === 'admin' ? '?scope=all' : '')).then(function (d) {
    listMount('Bộ đề', listPage(examsCfg(d.exams, { actions: [btn('Thêm bộ đề', 'plus', { cls: 'pri', href: '#/exams/new' })] })));
  }).catch(function (e) { mount(errBox(e)); });
}
function examForm(id) {
  var msg = h('div'), wrap = h('div');
  mount(wrap);
  (id ? api('GET', '/api/exams/' + id) : Promise.resolve(null)).then(function (r) {
    var ex = r && r.exam;
    var name = h('input', { type: 'text', maxlength: 80, required: true, value: ex ? ex.name : '' }), desc = h('textarea', { maxlength: 300 });
    var content = h('textarea', { class: 'code', spellcheck: 'false', required: true, 'aria-label': 'Câu hỏi' }), img = imageField(ex ? ex.image : '');
    desc.value = ex ? ex.description : ''; content.value = ex ? ex.content : EXAMPLE;
    var f = h('form', { class: 'ail-form', onsubmit: function (e) {
      e.preventDefault();
      var body = { name: name.value, description: desc.value, content: content.value }; if (!id || img.changed) body.image = img.value;
      api(id ? 'PUT' : 'POST', id ? '/api/exams/' + id : '/api/exams', body).then(function () { location.hash = '#/exams'; }).catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, id ? 'Sửa bộ đề' : 'Thêm bộ đề'), h('p', { class: 'meta' }, 'Bộ đề là nguồn câu hỏi cho ứng dụng; sửa bộ đề thì ứng dụng chơi bản mới nhất. ' + QHELP),
      h('label', { class: 'l' }, 'Tên bộ đề', name), h('label', { class: 'l' }, 'Mô tả (không bắt buộc)', desc), img.el, h('label', { class: 'l' }, 'Câu hỏi', content), msg,
      h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, 'Lưu'), h('a', { class: 'ail-btn', href: '#/exams' }, 'Huỷ')));
    wrap.replaceChildren(f); name.focus();
  }).catch(function (e) { wrap.replaceChildren(errBox(e)); });
}
function appsView(parts) {
  if (parts[1] === 'new') return appForm(null);
  if (parts[1] && /^\d+$/.test(parts[1])) return appForm(parseInt(parts[1], 10));
  Promise.all([api('GET', '/api/apps' + (me.role === 'admin' ? '?scope=all' : '')), api('GET', '/api/players?scope=usable'), api('GET', '/api/models?scope=usable')]).then(function (r) {
    listMount('Ứng dụng', listPage(appsCfg(r[0].apps, r[1].players, r[2].models, { actions: [btn('Thêm ứng dụng', 'plus', { cls: 'pri', href: '#/apps/new' })] })));
  }).catch(function (e) { mount(errBox(e)); });
}
function route() {
  stopTry();
  if (!me) return loginView();
  var parts = location.hash.replace('#/', '').split('/');
  curTab = parts[0] || 'models';
  var views = { models: modelsView, players: playersView, exams: examsView, apps: appsView, chat: chatView, admin: adminView };
  var isList = ['models', 'players', 'exams', 'apps'].indexOf(curTab) >= 0 && !parts[1];
  shell(curTab, isList);
  (views[curTab] || modelsView)(parts);
}
function start() { if (!location.hash) location.hash = '#/models'; route(); }
window.addEventListener('hashchange', route);


function loginView() {
  var mode = 'login';
  var box = h('div', { class: 'login' });
  function draw() {
    var msg = h('div'), u = h('input', { type: 'text', autocomplete: 'username', required: true }), p = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
    var f = h('form', { class: 'ail-form', onsubmit: function (e) {
      e.preventDefault();
      api('POST', mode === 'login' ? '/api/login' : '/api/register', { username: u.value, password: p.value })
        .then(function (d) { me = d.user; start(); }).catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, 'JULY AI Lab'),
      seg([['login', 'Đăng nhập'], ['register', 'Tạo tài khoản']], mode, function (m) { mode = m; draw(); }),
      h('label', { class: 'l' }, 'Tên đăng nhập', u),
      h('label', { class: 'l' }, 'Mật khẩu', mode === 'register' ? h('small', null, 'Ít nhất 8 ký tự') : null, p),
      msg, h('button', { class: 'ail-btn pri', type: 'submit' }, mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'));
    box.replaceChildren(f); u.focus();
  }
  draw();
  root.replaceChildren(box);
}

function modelForm(id, create) {
  var wrap = h('div'), msg = h('div');
  var state = { name: '', description: '', kind: 'image', url: '', visibility: 'private', outputs: [] };
  function go(d) {
    if (d) state = d;
    var name = h('input', { type: 'text', maxlength: 80, value: state.name, required: true });
    var desc = h('textarea', { maxlength: 300, style: 'min-height:70px' }); desc.value = state.description;
    var kind = h('select', null, Object.keys(KIND).filter(function (k) { return k !== 'hands'; }).map(function (k) { return h('option', { value: k, selected: k === state.kind }, KIND[k]); }));
    var url = h('input', { type: 'text', placeholder: 'https://teachablemachine.withgoogle.com/models/…', value: state.url, required: true });
    var vis = h('select', null, [['private', 'Riêng tư (chỉ mình tôi)'], ['public', 'Công khai (mọi người dùng được)']].map(function (o) { return h('option', { value: o[0], selected: o[0] === state.visibility }, o[1]); }));
    var outs = h('div'), outMsg = h('div');
    function drawOuts() {
      outs.replaceChildren(state.outputs.length ? h('div', null, state.outputs.map(function (o, i) {
        return h('div', { class: 'out' }, h('strong', null, o.key), h('select', { 'aria-label': 'Vai trò của lớp ' + o.key, onchange: function (e) { o.role = e.target.value; } },
          [['action', 'Hành động'], ['rest', 'Nghỉ'], ['empty', 'Trống / không có gì']].map(function (r) { return h('option', { value: r[0], selected: r[0] === o.role }, r[1]); })));
      })) : h('p', { class: 'meta' }, 'Chưa có lớp nào. Bấm “Đọc các lớp từ đường dẫn” sau khi dán link.'));
    }
    function readClasses() {
      outMsg.replaceChildren();
      var u = url.value.trim(); if (u && u.slice(-1) !== '/') u += '/';
      fetch(u + 'metadata.json').then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); }).then(function (m) {
        var labels = m.labels || (m.wordLabels) || [];
        if (!labels.length) throw new Error('x');
        var old = {}; state.outputs.forEach(function (o) { old[o.key] = o.role; });
        state.outputs = labels.map(function (l) { return { key: String(l), role: old[l] || 'action' }; });
        if (m.packageName && /pose/.test(m.packageName)) kind.value = 'pose';
        drawOuts();
      }).catch(function () { outMsg.replaceChildren(errBox({ message: 'Không đọc được các lớp từ link này. Kiểm tra link đã “Upload my model” và còn mở công khai.' })); });
    }
    drawOuts();
    var intro = create ? h('div', { class: 'note' },
      h('strong', null, 'Tạo mô hình từ đầu — 3 bước. '), '1) Mở Teachable Machine, tạo các lớp, chụp/ tải ảnh rồi bấm Train. 2) Bấm “Upload my model” (Share) và chép đường dẫn. 3) Quay lại đây, dán đường dẫn và bấm “Đọc các lớp”. ',
      h('a', { href: 'https://teachablemachine.withgoogle.com/train', target: '_blank', rel: 'noopener' }, 'Mở Teachable Machine ↗'),
      h('div', { class: 'meta' }, 'Việc huấn luyện diễn ra ở Teachable Machine, AI Lab chỉ lưu đường dẫn và các lớp.')) : null;
    var f = h('form', { class: 'ail-form', onsubmit: function (e) {
      e.preventDefault();
      var body = { name: name.value, description: desc.value, kind: kind.value, url: url.value, visibility: vis.value, outputs: state.outputs };
      api(id ? 'PUT' : 'POST', id ? '/api/models/' + id : '/api/models', body).then(function () { location.hash = '#/models'; }).catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, id ? 'Sửa mô hình' : (create ? 'Tạo mô hình' : 'Thêm mô hình')), intro,
      h('label', { class: 'l' }, 'Tên mô hình', name),
      h('label', { class: 'l' }, 'Mô tả (không bắt buộc)', desc),
      h('label', { class: 'l' }, 'Loại', kind, h('small', null, 'Hình ảnh và Tư thế chạy được; Âm thanh mới chỉ lưu, chưa chạy ở bản này.')),
      h('label', { class: 'l' }, 'Đường dẫn mô hình Teachable Machine', url),
      h('div', null, h('button', { class: 'ail-btn', type: 'button', onclick: readClasses }, 'Đọc các lớp từ đường dẫn'), outMsg),
      h('div', null, h('strong', null, 'Các lớp (đầu ra)'), outs, h('small', { class: 'meta' }, 'Hành động: học sinh làm để trả lời. Nghỉ / Trống: tư thế chờ, không có người.')),
      h('label', { class: 'l' }, 'Ai dùng được', vis),
      msg, h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, 'Lưu'), h('a', { class: 'ail-btn', href: '#/models' }, 'Huỷ')));
    wrap.replaceChildren(f); name.focus();
  }
  mount(wrap);
  if (id) api('GET', '/api/models/' + id).then(function (d) { go(d.model); }).catch(function (e) { wrap.replaceChildren(errBox(e)); }); else go();
}

function playerForm(id) {
  var msg = h('div'), area = h('textarea', { class: 'code', spellcheck: 'false', 'aria-label': 'Mã HTML của trình chơi', required: true });
  var file = h('input', { type: 'file', accept: '.html,text/html', 'aria-label': 'Chọn file HTML', onchange: function () {
    var f = file.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) return msg.replaceChildren(errBox({ message: 'File lớn hơn 2 MB.' }));
    f.text().then(function (t) { area.value = t; });
  } });
  var f = h('form', { class: 'ail-form', onsubmit: function (e) {
    e.preventDefault();
    api(id ? 'PUT' : 'POST', id ? '/api/players/' + id : '/api/players', { html: area.value })
      .then(function () { location.hash = '#/players'; }).catch(function (x) { msg.replaceChildren(errBox(x)); });
  } },
    h('h2', null, id ? 'Sửa trình chơi' : 'Thêm trình chơi'),
    h('p', { class: 'meta' }, 'Một file HTML tự đủ, có đúng một khối <script type="application/json" id="jl-camera"> mô tả trình chơi. Trình chơi mới ở trạng thái Nháp; bấm “Gửi duyệt” để Admin xem và công khai.'),
    h('label', { class: 'l' }, 'Tải file .html', file), h('label', { class: 'l' }, 'hoặc dán mã HTML', area), msg,
    h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, 'Lưu'), h('a', { class: 'ail-btn', href: '#/players' }, 'Huỷ')));
  mount(f);
  if (id) api('GET', '/api/players/' + id).then(function (d) { area.value = d.player.html; }).catch(function (e) { msg.replaceChildren(errBox(e)); });
}

function appForm(id) {
  var msg = h('div'), wrap = h('div');
  mount(wrap);
  Promise.all([api('GET', '/api/players?scope=usable'), api('GET', '/api/models?scope=usable'), id ? api('GET', '/api/apps/' + id) : Promise.resolve(null), api('GET', '/api/exams')]).then(function (r) {
    var players = r[0].players.filter(function (p) { return p.status !== 'hidden'; }), models = r[1].models, ex = r[2] && r[2].app;
    var name = h('input', { type: 'text', maxlength: 80, required: true, value: ex ? ex.name : '' });
    var desc = h('input', { type: 'text', maxlength: 300, value: ex ? ex.description : '' });
    var player = pickField('player', players, ex ? ex.player_id : null, 'Trình chơi');
    var model = pickField('model', models, ex ? ex.model_id : null, 'Mô hình');
    var map = h('div'), contentWrap = h('div');
    var sure = h('input', { type: 'number', min: 0.5, max: 0.99, step: 0.01, value: ex ? ex.sure : 0.8 });
    var hold = h('input', { type: 'number', min: 300, max: 5000, step: 100, value: ex ? ex.hold_ms : 800 });
    var share = h('input', { type: 'checkbox', checked: ex && ex.share });
    var content = h('textarea'); content.value = ex ? ex.content : '';
    var exams = r[3].exams, examNote = h('p', { class: 'meta' }, 'Câu hỏi lấy từ bộ đề. Sửa bộ đề ở trang Bộ đề, ứng dụng sẽ chơi bản mới nhất.');
    var examSel = h('select', { 'aria-label': 'Bộ đề', onchange: function () { redraw(); } }, [h('option', { value: '' }, '— dán câu hỏi trực tiếp —')].concat(exams.map(function (x) { return h('option', { value: x.id, selected: !!(ex && ex.exam_id === x.id) }, x.name + ' (' + x.count + ' câu)'); })));
    var mapping = ex ? Object.assign({}, ex.mapping) : {};
    function cur() { return players.filter(function (p) { return String(p.id) === player.value; })[0]; }
    function redraw() {
      var p = cur(); if (!p) { map.replaceChildren(h('p', { class: 'meta' }, 'Chưa có trình chơi nào dùng được.')); return; }
      var man = p.manifest;
      model.setItems(models.filter(function (m) { return !man.kinds || man.kinds.indexOf(m.kind) >= 0; }));
      model.el.style.display = man.inputs ? '' : 'none';
      sure.closest('.camopt').style.display = man.inputs ? '' : 'none';
      if (man.inputs) {
        var m = models.filter(function (x) { return String(x.id) === model.value; })[0];
        map.replaceChildren(m ? h('div', null, h('strong', null, 'Gắn ô của trình chơi với lớp của mô hình'), man.inputs.map(function (i) {
          var sel = h('select', { 'aria-label': 'Lớp cho ô ' + i.label, onchange: function (e) { if (e.target.value) mapping[i.key] = e.target.value; else delete mapping[i.key]; } },
            h('option', { value: '' }, i.required ? '— chọn lớp —' : '— không dùng —'),
            m.outputs.filter(function (o) { return i.accepts.indexOf(o.role) >= 0; }).map(function (o) { return h('option', { value: o.key, selected: mapping[i.key] === o.key }, o.key); }));
          return h('div', { class: 'out' }, h('span', null, 'Ô “' + i.label + '”' + (i.required ? ' *' : '')), sel);
        })) : h('p', { class: 'meta' }, 'Chọn một mô hình để gắn các ô.'));
      } else map.replaceChildren();
      var needs = man.questions === 'exam' || (man.content && man.content.kind === 'questions');
      if (needs) contentWrap.replaceChildren(h('label', { class: 'l' }, 'Bộ đề', examSel), examSel.value ? examNote : h('label', { class: 'l' }, 'Hoặc dán câu hỏi trực tiếp', h('small', null, QHELP), content));
      else contentWrap.replaceChildren(man.content ? h('label', { class: 'l' }, man.content.label, h('small', null, 'Mỗi dòng một mục (tối đa 120 ký tự).'), content) : '');
    }
    player.onChange(function () { mapping = {}; redraw(); });
    model.onChange(function () { mapping = {}; redraw(); });
    var f = h('form', { class: 'ail-form', onsubmit: function (e) {
      e.preventDefault();
      var p = cur();
      api(id ? 'PUT' : 'POST', id ? '/api/apps/' + id : '/api/apps', { name: name.value, description: desc.value, playerId: player.value, modelId: p && p.manifest.inputs ? model.value : null,
        mapping: mapping, content: examSel.value ? '' : content.value, examId: examSel.value || null, sure: parseFloat(sure.value), holdMs: parseInt(hold.value, 10), share: share.checked })
        .then(function () { location.hash = '#/apps'; }).catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, id ? 'Sửa ứng dụng' : 'Thêm ứng dụng'),
      h('label', { class: 'l' }, 'Tên ứng dụng', name), h('label', { class: 'l' }, 'Mô tả (không bắt buộc)', desc),
      player.el, model.el, map, contentWrap,
      h('div', { class: 'row camopt' }, h('label', { class: 'l' }, 'Độ chắc chắn tối thiểu (0.5–0.99)', sure), h('label', { class: 'l' }, 'Giữ trong (ms)', hold)),
      h('label', { class: 'row' }, share, h('span', null, 'Cho phép ai có link cũng chơi được (không cần đăng nhập)')),
      msg, h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, 'Lưu'), h('a', { class: 'ail-btn', href: '#/apps' }, 'Huỷ')));
    wrap.replaceChildren(f); redraw(); name.focus();
  }).catch(function (e) { wrap.replaceChildren(errBox(e)); });
}

function chatView() {
  var chatId = null, msgs = [], busy = false;
  var log = h('div', { class: 'msgs', 'aria-live': 'polite' }), side = h('div', { class: 'list' });
  var input = h('textarea', { style: 'min-height:80px', maxlength: 2000, placeholder: 'Ví dụ: Game ôn bảng cửu chương, học sinh giơ tay trái/phải để chọn đáp án A/B, ai đúng nhiều nhất thắng.', 'aria-label': 'Mô tả game' });
  var send = h('button', { class: 'ail-btn pri', type: 'button' }, 'Gửi');
  function decide(p, action, holder) {
    api('POST', '/api/chats/' + chatId + '/proposals/' + p.index + '/' + action).then(function (r) {
      p.status = r.status; if (r.playerId) p.playerId = r.playerId; drawLog();
    }).catch(function (x) { holder.appendChild(errBox(x)); if (x.status === 409) { p.status = p.status === 'pending' ? 'decided' : p.status; } });
  }
  function proposalCard(p) {
    var holder = h('div', { class: 'cardin' }), flags = p.flags || [];
    holder.appendChild(h('div', { class: 'ail-row' }, h('strong', null, p.name), h('span', { class: 'ail-chip ' + (p.source === 'ai' ? '' : 'warn') }, p.source === 'ai' ? 'AI viết' : 'AI giả (khuôn có sẵn)')));
    if (p.description) holder.appendChild(h('p', { class: 'ail-desc', style: 'margin:4px 0 8px' }, p.description));
    holder.appendChild(h('div', { style: 'font-weight:500;margin:6px 0 4px' }, flags.length ? 'Cờ cần xem (' + flags.length + ')' : 'Không có cờ cảnh báo'));
    flags.forEach(function (f) {
      holder.appendChild(h('div', { class: 'note', style: 'margin:4px 0' },
        h('div', { style: 'font-weight:500' }, f.label + (f.line ? ' · dòng ' + f.line : '')),
        f.reason ? h('div', null, f.reason) : null,
        f.excerpt ? h('pre', { style: 'margin:4px 0 0;padding:6px 8px;border-radius:var(--jl-radius-leaf-xs);background:var(--jl-surface-default);color:var(--jl-text-default);font:var(--jl-font-size-sm) var(--jl-font-mono);white-space:pre-wrap;overflow-wrap:anywhere' }, f.excerpt) : null));
    });
    var row = h('div', { class: 'row', style: 'margin-top:8px' });
    row.appendChild(h('button', { class: 'ail-btn sm', type: 'button', onclick: function () { modal('Xem thử: ' + p.name, previewFrame('/api/chats/' + chatId + '/proposals/' + p.index + '/try')); } }, 'Xem thử'));
    if (p.status === 'pending') {
      row.appendChild(h('button', { class: 'ail-btn sm pri', type: 'button', title: 'Lưu game này vào Trình chơi (bản Nháp, Admin duyệt sau)', onclick: function () { decide(p, 'accept', holder); } }, 'Thêm vào Trình chơi'));
      row.appendChild(h('button', { class: 'ail-btn sm bad', type: 'button', title: 'Bỏ game này, không lưu gì', onclick: function () { decide(p, 'reject', holder); } }, 'Không dùng'));
    } else if (p.status === 'accepted') {
      row.appendChild(h('span', { class: 'ail-chip ok' }, 'Đã thêm vào Trình chơi (Nháp, chờ Admin duyệt)'));
      row.appendChild(h('a', { class: 'ail-btn sm pri', href: '#/players' }, 'Mở trong Trình chơi'));
      if (p.playerId) row.appendChild(h('a', { class: 'ail-btn sm', href: '#/players/' + p.playerId }, 'Xem mã'));
    } else row.appendChild(h('span', { class: 'ail-chip bad' }, p.status === 'rejected' ? 'Đã bỏ, không lưu' : 'Đã quyết định'));
    holder.appendChild(row);
    return holder;
  }
  function drawLog() {
    log.replaceChildren();
    if (!msgs.length) log.appendChild(h('div', { class: 'meta' }, 'Mô tả game bạn muốn: học sinh chơi thế nào, dùng camera hay chỉ chạm, nội dung gì. Trợ lý đề xuất một trình chơi: bạn xem thử và xem các cờ cảnh báo, rồi bấm Thêm vào Trình chơi (lưu thành Nháp) hoặc Không dùng. Admin duyệt rồi mới công khai.'));
    msgs.forEach(function (m) {
      var el = h('div', { class: 'm ' + m.role }, m.text);
      if (m.role === 'bot') {
        if (m.simulated) el.appendChild(h('div', { class: 'meta' }, '⚠ Chế độ giả: chưa nối model nên đây là khuôn có sẵn.'));
        if (m.error) el.appendChild(h('div', { class: 'err' }, m.error));
        if (m.proposal) el.appendChild(proposalCard(m.proposal));
      }
      log.appendChild(el);
    });
    if (busy) log.appendChild(h('div', { class: 'm bot dots', 'aria-label': 'Đang viết game' }, h('span'), h('span'), h('span')));
    log.scrollTop = log.scrollHeight;
  }
  function drawSide() {
    api('GET', '/api/chats').then(function (d) {
      side.replaceChildren.apply(side, [h('button', { class: 'ail-btn', onclick: function () { chatId = null; msgs = []; drawLog(); } }, ico('plus'), 'Cuộc trò chuyện mới')].concat(
        d.chats.map(function (c) { return h('button', { class: 'ail-btn sm', onclick: function () { api('GET', '/api/chats/' + c.id).then(function (x) { chatId = x.id; msgs = x.messages; drawLog(); }); } }, c.title); })));
    });
  }
  function submit() {
    var t = input.value.trim(); if (busy || t.length < 3) return;
    busy = true; send.disabled = true; msgs.push({ role: 'user', text: t }); input.value = ''; drawLog();
    api('POST', '/api/chat', { chatId: chatId, text: t }).then(function (d) { chatId = d.chatId; msgs.push(d.reply); drawSide(); })
      .catch(function (e) { msgs.push({ role: 'bot', text: '', error: e.message }); })
      .then(function () { busy = false; send.disabled = false; drawLog(); input.focus(); });
  }
  send.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); });
  mount(h('div', null, h('div', { class: 'bar' }, h('h2', { class: 'sp sr' }, 'Trợ lý game'), h('span', { class: 'sp' }), h('span', { class: 'tag ' + (llmMode === 'giả' ? 'warn' : 'ok') }, 'Model AI: ' + llmMode)),
    h('div', { class: 'chat' }, side, h('div', null, log, h('div', { class: 'row', style: 'margin-top:10px;align-items:flex-end' }, h('div', { class: 'grow' }, input), send), h('div', { class: 'meta' }, 'Ctrl+Enter để gửi')))));
  drawLog(); drawSide();
}

function adminView() {
  var q = h('div'), u = h('div');
  function loadQ() {
    api('GET', '/api/players?scope=all').then(function (d) {
      var pend = d.players.filter(function (p) { return p.status === 'pending'; });
      var hid = d.players.filter(function (p) { return p.status === 'hidden'; });
      q.replaceChildren(h('h3', null, 'Chờ duyệt (' + pend.length + ')'),
        pend.length ? h('div', { class: 'grid' }, pend.map(function (p) {
          return h('div', { class: 'card' }, h('h3', null, p.name), h('div', { class: 'meta' }, 'của ' + p.owner + (p.source !== 'upload' ? ' · ' + (p.source === 'ai' ? 'AI viết' : 'AI giả') : '')),
            p.flags.length ? h('div', null, p.flags.map(function (f) { return h('span', { class: 'tag warn', title: (f.reason || '') + (f.excerpt ? ' — ' + f.excerpt : '') }, f.label + (f.line ? ' · dòng ' + f.line : '')); })) : h('div', { class: 'tag ok' }, 'Không có cờ'),
            h('div', { class: 'acts' }, h('button', { class: 'ail-btn sm', onclick: function () { modal(p.name, previewFrame(p.id)); } }, 'Thử'),
              h('button', { class: 'ail-btn sm pri', onclick: function () { api('POST', '/api/players/' + p.id + '/approve').then(loadQ).catch(function (e) { q.prepend(errBox(e)); }); } }, 'Duyệt & công khai'),
              h('button', { class: 'ail-btn sm bad', onclick: function () { var n = window.prompt('Lý do từ chối (người tạo sẽ thấy):'); if (n) api('POST', '/api/players/' + p.id + '/refuse', { note: n }).then(loadQ).catch(function (e) { q.prepend(errBox(e)); }); } }, 'Từ chối')));
        })) : h('div', { class: 'empty' }, 'Không có trình chơi nào chờ duyệt.'),
        h('h3', { style: 'margin-top:20px' }, 'Đã duyệt, có thể ẩn'),
        h('div', { class: 'grid' }, d.players.filter(function (p) { return p.status === 'approved' && !p.sample; }).concat(hid).map(function (p) {
          return h('div', { class: 'card' }, h('h3', null, p.name), h('div', { class: 'meta' }, 'của ' + p.owner), fmtStatus(p.status),
            h('div', { class: 'acts' }, p.status === 'hidden'
              ? h('button', { class: 'ail-btn sm', onclick: function () { api('POST', '/api/players/' + p.id + '/restore').then(loadQ); } }, 'Khôi phục')
              : h('button', { class: 'ail-btn sm bad', onclick: function () { var n = window.prompt('Lý do ẩn:') || ''; api('POST', '/api/players/' + p.id + '/hide', { note: n }).then(loadQ); } }, 'Ẩn')));
        })));
    }).catch(function (e) { q.replaceChildren(errBox(e)); });
  }
  function loadU() {
    api('GET', '/api/admin/users').then(function (d) {
      u.replaceChildren(h('h3', { style: 'margin-top:24px' }, 'Tài khoản'), h('table', null, h('tr', null, h('th', null, 'Tên'), h('th', null, 'Vai trò'), h('th')),
        d.users.map(function (x) {
          var next = x.role === 'admin' ? 'user' : 'admin';
          return h('tr', null, h('td', null, x.username), h('td', null, x.role === 'admin' ? 'Admin' : 'User'),
            h('td', null, x.id === me.id ? null : h('button', { class: 'ail-btn sm', onclick: function () { confirmDo('Đổi ' + x.username + ' thành ' + (next === 'admin' ? 'Admin' : 'User') + '?', function () { api('POST', '/api/admin/users/' + x.id + '/role', { role: next }).then(loadU).catch(function (e) { u.prepend(errBox(e)); }); }); } }, 'Đổi thành ' + (next === 'admin' ? 'Admin' : 'User'))));
        })));
    });
  }
  mount(h('div', null, h('h2', null, 'Duyệt & tài khoản'), q, u)); loadQ(); loadU();
}


api('GET', '/api/me').then(function (d) { me = d.user; llmMode = d.llm; start(); }).catch(function () { loginView(); });
})();
