/* list-page.js — trang danh sách dùng chung của AI Lab (ES module, tách từ app.js dòng 96–328, 440–466).
   Bố cục: bộ lọc trái (.jlps-aside) · lưới thẻ + phân trang (.jlps-results/.jlps-pagerbar) · chi tiết phải (.jlps-detail),
   dùng nguyên lớp jlps-* của shell.css và thành phần dựng sẵn của dom.js.

   Xuất (export): stopTry, menuBtn, itemCard, tagsOf, listPage, cameraTry, previewFrame, imageField, metaModal, pickerModal, pickField.

   Cải tiến so với app.js cũ:
   1. Bộ lọc là <button type="button" class="jlps-choice ail-filter-btn" aria-pressed="true|false"> — Enter/Space
      chuẩn của nút, thay cho mẹo radio "bấm lại để bỏ chọn"; giữ màu hue (jlps-hue-*) và badge đếm (.jlps-count)
      của shell.css; sau khi bấm, focus được trả lại đúng nút vừa bật/tắt.
   2. Menu 3 chấm (menuBtn): aria-expanded, đóng bằng Escape, đóng khi click ngoài (pointerdown), Tab đóng tự nhiên,
      điều hướng mũi tên/Home/End giữa các mục, trả focus về nút khi đóng bằng Escape.
   3. previewFrame: giữ sandbox="allow-scripts" và bắt tay postMessage (ready -> camera.init), kiểm tra
      e.source === frame.contentWindow, có trạng thái loading rõ ràng (role="status") và lỗi thân thiện.
   4. cameraTry: giữ nguyên test sống TeachableMachine image/pose; thông báo riêng cho từng trường hợp:
      thiếu camera, từ chối quyền, camera bị ứng dụng khác dùng, thiếu internet khi nạp thư viện.
   5. metaModal: dùng modal() của dom.js (bẫy focus, Escape, khôi phục focus), khoá nút Lưu khi đang gửi,
      xong thì toast('Đã cập nhật thông tin', 'ok') và gọi onDone(it).
   6. pickerModal: modal .modal.picker, đóng bằng Escape/click ngoài, stopTry() khi đóng, khôi phục focus.
   7. listPage(cfg): hỗ trợ cfg.onMetaUpdated (dự phòng cfg.onRefresh) để refresh sau khi sửa thông tin,
      empty state rõ ràng (biểu tượng + dòng chính + gợi ý) tách bạch "chưa có gì" và "lọc không khớp".

   Hợp đồng cfg của listPage (giữ nguyên từ app.js, thêm 2 trường):
     noun, res, items[], empty?, text(it), filters[{key, label, values(it), order?}], card(it, i), detail(it),
     canMeta?(it), value?, pick?, actions?, onMetaUpdated?(it) | onRefresh?()
   pickField/pickerModal nhận thêm cfgFactory(kind, opts) -> cfg (dựng modelsCfg/playersCfg ở nơi gọi,
   vì các builder đó thuộc trang cấu hình, không thuộc module này). */

import { h, api, ico, btn, errBox, modal, toast, fold, KIND } from './dom.js';

/* ---------- hue: thẻ dùng hue của style.css, ô lọc dùng hue của shell.css ---------- */
var CARD_HUES = ['blue', 'violet', 'mint', 'pink'];
var HUE_CYCLE = ['orange', 'sky', 'violet', 'mint'];

/* ---------- tiện ích focus (mẫu như trong dom.js, dùng cho menu & picker tự dựng) ---------- */
function focusablesIn(root) {
  return Array.prototype.filter.call(
    root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    function (el) { return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement; });
}
function focusEl(el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }

/* ---------- thẻ, menu ---------- */
export function menuBtn(items) {
  var wrap = h('span', { class: 'ail-rel' }), open = null, b;
  function itemsIn() {
    return open ? Array.prototype.filter.call(open.querySelectorAll('[role="menuitem"]'),
      function (x) { return x.offsetWidth > 0 || x.offsetHeight > 0; }) : [];
  }
  function close(refocus) {
    if (!open) return;
    open.remove(); open = null;
    b.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', onKey, true);
    if (refocus) focusEl(b);
  }
  function away(e) { if (open && !wrap.contains(e.target)) close(false); }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    var f = itemsIn();
    if (!f.length) return;
    var cur = f.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); f[(cur + 1) % f.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); f[(cur - 1 + f.length) % f.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); f[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); f[f.length - 1].focus(); }
  }
  function toggle() {
    if (open) return close(false);
    open = h('div', { class: 'ail-menu', role: 'menu', 'aria-label': 'Thao tác' }, (items || []).filter(Boolean).map(function (it) {
      return h(it.href ? 'a' : 'button', { type: it.href ? null : 'button', role: 'menuitem', class: it.cls || '', href: it.href, target: it.target, rel: it.target ? 'noopener' : null,
        onclick: function (ev) { ev.stopPropagation(); close(false); if (it.onclick) it.onclick(); } },
        ico(it.icon || 'chevR'), it.label);
    }));
    b.setAttribute('aria-expanded', 'true');
    wrap.appendChild(open);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', onKey, true);
    var f = itemsIn();
    if (f.length) f[0].focus();
  }
  b = h('button', { type: 'button', class: 'ail-btn icon sm', 'aria-label': 'Thêm thao tác', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: function (e) { e.stopPropagation(); toggle(); } }, ico('more'));
  wrap.appendChild(b);
  return wrap;
}

export function itemCard(o) {
  var el = h('div', { class: 'jlps-card is-grid ail-card hue-' + o.hue + (o.selected ? ' is-on' : ''),
    role: 'option', tabindex: '0', 'aria-selected': o.selected ? 'true' : 'false',
    onclick: o.onSelect, ondblclick: o.onOpen,
    onkeydown: function (e) { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (e.key === 'Enter' && o.onOpen ? o.onOpen : o.onSelect)(); } } },
    h('div', { class: 'ail-thumb' }, o.image ? h('img', { class: 'ail-thumb-img', src: o.image, alt: '' }) : ico(o.icon || 'image'), o.pill ? h('span', { class: 'ail-pill' }, o.pill) : null),
    h('div', { class: 'ail-card-in' },
      h('div', { class: 'jlps-card-title' }, o.title), o.meta ? h('div', { class: 'jlps-card-sub' }, o.meta) : null,
      h('div', { class: 'ail-tags' }, o.tags || []),
      h('div', { class: 'ail-foot' }, h('span', { class: 'ail-state ' + (o.state ? o.state[1] : ''), title: o.state ? o.state[2] : '', role: 'img', 'aria-label': o.state ? o.state[2] : null }, ico(o.state ? o.state[0] : 'check')), o.menu && o.menu.length ? menuBtn(o.menu) : null)));
  return el;
}

export function tagsOf(list, max) {
  var out = (list || []).slice(0, max).map(function (t) { return h('span', { class: 'ail-chip' }, t); });
  if (list && list.length > max) out.push(h('span', { class: 'ail-chip more' }, '+' + (list.length - max)));
  return out;
}

/* ---------- trang danh sách dùng chung: bộ lọc trái, lưới thẻ, chi tiết phải ---------- */
export function listPage(cfg) {
  var st = { q: '', f: {}, page: 1, size: 12, sel: cfg.value != null && cfg.value !== '' ? String(cfg.value) : null };
  var aside = h('aside', { class: 'jlps-aside', 'aria-label': 'Bộ lọc' }), grid = h('div', { class: 'ail-grid', role: 'listbox', 'aria-label': cfg.noun }),
    foot = h('div', { class: 'jlps-foot' }), detail = h('aside', { class: 'jlps-detail', 'aria-label': 'Chi tiết' });
  var search = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Tìm theo tên ' + cfg.noun, 'aria-label': 'Tìm ' + cfg.noun,
    oninput: function () { st.q = search.value; st.page = 1; draw(); } });

  /* gọi lại sau khi sửa thông tin thành công: ưu tiên onMetaUpdated, dự phòng onRefresh */
  function metaDone(it) {
    if (typeof cfg.onMetaUpdated === 'function') cfg.onMetaUpdated(it);
    else if (typeof cfg.onRefresh === 'function') cfg.onRefresh();
  }
  function editMeta(it) { metaModal(cfg.res, it, metaDone); }

  function matches(it, except) {
    if (st.q && fold(cfg.text(it)).indexOf(fold(st.q)) < 0) return false;
    return cfg.filters.every(function (f) { return f.key === except || !st.f[f.key] || f.values(it).indexOf(st.f[f.key]) >= 0; });
  }
  function active() { return Object.keys(st.f).filter(function (k) { return st.f[k]; }).length; }
  function refocusFilter(key, val) {
    var b = aside.querySelectorAll('button.ail-filter-btn'), i;
    for (i = 0; i < b.length; i++) {
      if (b[i].getAttribute('data-fkey') === key && b[i].getAttribute('data-fval') === val) { focusEl(b[i]); return; }
    }
  }
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
          /* nút bấm chuẩn: Enter/Space có sẵn của <button>, aria-pressed báo đang chọn hay không;
             hue (jlps-hue-*) và badge đếm (.jlps-count) lấy từ shell.css, không còn radio ẩn */
          h('div', { class: 'jlps-list', role: 'group', 'aria-label': f.label }, vals.map(function (v, i) {
            var c = pool.filter(function (it) { return f.values(it).indexOf(v) >= 0; }).length, on = st.f[f.key] === v;
            return h('button', { type: 'button', 'data-fkey': f.key, 'data-fval': v,
              class: 'jlps-choice ail-filter-btn jlps-hue-' + HUE_CYCLE[i % 4] + (on ? ' is-on' : '') + (c === 0 && !on ? ' is-dead' : ''),
              'aria-pressed': on ? 'true' : 'false',
              onclick: function () { st.f[f.key] = on ? '' : v; st.page = 1; draw(); refocusFilter(f.key, v); } },
              h('span', { class: 'jlps-choice-dot', 'aria-hidden': 'true' }),
              h('span', { class: 'jlps-choice-label' }, v),
              h('span', { class: 'jlps-count' }, c));
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
  /* empty state: phân biệt rõ "chưa có gì" (dùng cfg.empty) và "lọc/tìm không khớp" (kèm gợi ý bỏ lọc) */
  function emptyState() {
    var none = !cfg.items.length;
    return h('div', { class: 'ail-empty', style: 'grid-column:1/-1', role: 'status' },
      ico(none ? 'image' : 'search'),
      h('div', { class: 'jlps-card-title' }, none ? (cfg.empty || 'Chưa có ' + cfg.noun + ' nào.') : 'Không có ' + cfg.noun + ' nào khớp.'),
      none ? null : h('div', { class: 'meta' }, 'Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm kiếm.'));
  }
  function drawDetail(it) {
    stopTry();
    if (!it) return detail.replaceChildren(h('div', { class: 'jlps-detail-empty' }, 'Chọn một ' + cfg.noun + ' để xem chi tiết.'));
    var d = cfg.detail(it), f = (d.footer || []).slice();
    if (cfg.canMeta && !cfg.pick && cfg.canMeta(it)) f.push(btn('Sửa thông tin', 'edit', { onclick: function () { editMeta(it); } }));
    detail.replaceChildren(h('div', { class: 'jlps-detail-head' }, h('h3', null, d.title), d.sub ? h('div', { class: 'ail-sub' }, d.sub) : null),
      h('div', { class: 'jlps-detail-body' }, it.image ? h('img', { class: 'ail-detail-img', src: it.image, alt: '' }) : null, d.body),
      f.length ? h('div', { class: 'jlps-detail-foot' }, h('div', { class: 'ail-row', style: 'justify-content:flex-start;flex-wrap:wrap' }, f)) : null);
  }
  var lastSel = null;
  function draw() {
    var fl = cfg.items.filter(function (it) { return matches(it, null); }), total = fl.length, pages = Math.max(1, Math.ceil(total / st.size));
    if (st.page > pages) st.page = pages;
    var pg = fl.slice((st.page - 1) * st.size, st.page * st.size);
    if (!fl.some(function (it) { return String(it.id) === st.sel; })) st.sel = pg.length ? String(pg[0].id) : null;
    drawAside();
    grid.replaceChildren();
    if (!pg.length) grid.replaceChildren(emptyState());
    pg.forEach(function (it, i) {
      var o = cfg.card(it, i);
      o.image = it.image;
      if (cfg.canMeta && !cfg.pick && cfg.canMeta(it)) o.menu = [{ label: 'Sửa thông tin', icon: 'edit', onclick: function () { editMeta(it); } }].concat(o.menu || []);
      o.hue = CARD_HUES[(it.id + i) % 4]; o.selected = String(it.id) === st.sel;
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

/* cameraTry tự đăng ký phiên đang chạy để stopTry() (đổi trang, đóng picker) luôn dừng được camera */
var activeTry = null;
export function stopTry() {
  if (activeTry) { var t = activeTry; activeTry = null; t.stop(); }
}

function loadScript(src) {
  return new Promise(function (ok, bad) {
    if (document.querySelector('script[src="' + src + '"]')) return ok();
    var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('Không tải được thư viện cần cho camera (cần internet).')); };
    document.head.appendChild(s);
  });
}

export function cameraTry(m, box, setScores, button) {
  var stream = null, run = false, video = null, timer = 0, handle;
  function idle() { box.className = 'ail-cambox'; box.replaceChildren(ico('image'), h('div', null, 'Chưa có ảnh')); button.replaceChildren(ico('camera'), 'Bật camera'); button.disabled = false; setScores(null); }
  function stop() {
    run = false; clearTimeout(timer);
    if (activeTry === handle) activeTry = null;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; idle();
  }
  function camError(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
      return 'Bạn chưa cho phép dùng camera. Hãy bấm “Cho phép” trên hộp thoại của trình duyệt rồi thử lại.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
      return 'Không tìm thấy camera trên máy này. Hãy gắn hoặc bật camera rồi thử lại.';
    if (name === 'NotReadableError' || name === 'TrackStartError')
      return 'Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi thử lại.';
    return 'Không bật được: ' + ((err && err.message) || err);
  }
  function start() {
    if (run) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { box.replaceChildren(errBox({ message: 'Trình duyệt chỉ cho dùng camera khi mở bằng https hoặc localhost.' })); return; }
    var libs = LIBS[m.kind];
    if (!libs) { box.replaceChildren(errBox({ message: 'Loại mô hình này chưa thử được bằng camera ở bản này.' })); return; }
    button.disabled = true; box.replaceChildren(h('div', { role: 'status' }, 'Đang bật camera và nạp mô hình…'));
    var model;
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }).then(function (s) {
      stream = s; video = h('video', { playsinline: true, muted: true, 'aria-label': 'Hình ảnh từ camera' }); video.muted = true; video.srcObject = s; return video.play();
    }).then(function () { return libs.reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve()); })
      .then(function () { return m.kind === 'pose' ? window.tmPose.load(m.url + 'model.json', m.url + 'metadata.json') : window.tmImage.load(m.url + 'model.json', m.url + 'metadata.json'); })
      .then(function (mm) { model = mm; run = true; box.className = 'ail-cambox on'; box.replaceChildren(video); button.replaceChildren(ico('x'), 'Tắt camera'); button.disabled = false; tick(); })
      .catch(function (err) { stop(); box.replaceChildren(errBox({ message: camError(err) })); });
    function tick() {
      if (!run) return;
      var p = m.kind === 'pose' ? model.estimatePose(video).then(function (r) { return model.predict(r.posenetOutput); }) : model.predict(video);
      p.then(function (preds) { var o = {}; preds.forEach(function (x) { o[x.className] = x.probability; }); setScores(o); }).catch(function () {}).then(function () { timer = setTimeout(tick, 150); });
    }
  }
  button.onclick = function () { run ? stop() : start(); };
  handle = { stop: stop, start: start };
  activeTry = handle;
  idle();
  return handle;
}

/* ---------- xem thử trình chơi trong iframe sandbox, bắt tay postMessage ---------- */
export function previewFrame(playerIdOrUrl, onInfo) {
  var wrap = h('div'), frame = h('iframe', { sandbox: 'allow-scripts', title: 'Xem thử trình chơi' });
  wrap.appendChild(h('p', { class: 'meta', role: 'status', 'aria-live': 'polite' }, 'Đang nạp bản xem thử…'));
  var url = typeof playerIdOrUrl === 'string' ? playerIdOrUrl : '/api/players/' + playerIdOrUrl + '/try';
  api('GET', url).then(function (d) {
    wrap.replaceChildren(frame);
    try { if (onInfo) onInfo(d); } catch (e2) { /* lỗi callback không được che mất bản xem thử đã nạp */ }
    var man = d.manifest;
    function init() {
      var m = { type: 'camera.init', mode: 'play', locale: 'vi', options: {}, theme: 'light' };
      if (man.inputs) { m.inputs = man.inputs.map(function (i) { return { key: i.key, label: i.label }; }); m.questions = d.sampleQuestions; }
      else if (man.questions === 'exam') m.questions = d.sampleQuestions;
      else m.content = (man.demo || {}).content || [];
      frame.contentWindow.postMessage(m, '*');
    }
    function onMsg(e) {
      if (!frame.isConnected) return cleanup();
      if (e.source === frame.contentWindow && e.data && e.data.type === 'ready') init();
    }
    var obs = null;
    function cleanup() {
      window.removeEventListener('message', onMsg);
      if (obs) { obs.disconnect(); obs = null; }
    }
    window.addEventListener('message', onMsg);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      obs = new MutationObserver(function () { if (!wrap.isConnected) cleanup(); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
    wrap.cleanup = cleanup;
    frame.srcdoc = d.srcdoc;
  }).catch(function (e) {
    var msg = e && e.status === 404 ? 'Không tìm thấy bản xem thử (trình chơi có thể đã bị xoá hoặc chưa được duyệt).'
      : 'Không nạp được bản xem thử: ' + ((e && e.message) || e);
    wrap.replaceChildren(errBox({ message: msg }));
  });
  return wrap;
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
export function imageField(current) {
  var val = current || '', changed = false, msg = h('div'), prev = h('div', { class: 'ail-imgprev' });
  var file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Chọn ảnh', onchange: function () {
    var f = file.files[0]; if (!f) return;
    shrink(f).then(function (d) { val = d; changed = true; msg.replaceChildren(); draw(); }).catch(function (e) { msg.replaceChildren(errBox(e)); });
  } });
  var rm = h('button', { type: 'button', class: 'ail-btn sm', onclick: function () { val = ''; changed = true; file.value = ''; draw(); } }, ico('minus'), 'Bỏ ảnh');
  function draw() { prev.replaceChildren(val ? h('img', { src: val, alt: 'Ảnh đại diện' }) : h('div', { class: 'ail-noimg' }, ico('image'), h('span', null, 'Chưa có ảnh'))); rm.style.display = val ? '' : 'none'; }
  draw();
  return { el: h('div', { class: 'l' }, 'Ảnh đại diện (tự thu nhỏ, tối đa 300 KB)', prev, h('div', { class: 'row' }, file, rm), msg), get value() { return val; }, get changed() { return changed; } };
}

export function metaModal(res, it, onDone) {
  var sending = false, close;
  var name = h('input', { type: 'text', maxlength: 80, required: true, value: it.name }), desc = h('textarea', { maxlength: 300 }), msg = h('div');
  desc.value = it.description || '';
  var img = imageField(it.image);
  var save = h('button', { class: 'ail-btn pri', type: 'submit' }, ico('check'), 'Lưu');
  function setSending(on) {
    sending = on; save.disabled = on;
    if (on) save.setAttribute('aria-busy', 'true'); else save.removeAttribute('aria-busy');
  }
  var f = h('form', { class: 'ail-form', onsubmit: function (e) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    var body = { name: name.value, description: desc.value }; if (img.changed) body.image = img.value;
    api('POST', '/api/' + res + '/' + it.id + '/meta', body).then(function () {
      close();
      toast('Đã cập nhật thông tin', 'ok');
      if (typeof onDone === 'function') onDone(it);
    }).catch(function (x) { setSending(false); msg.replaceChildren(errBox(x)); });
  } }, h('label', { class: 'l' }, 'Tiêu đề', name), h('label', { class: 'l' }, 'Mô tả', desc), img.el, msg,
    h('div', { class: 'row', style: 'justify-content:flex-end' }, btn('Huỷ', 'x', { onclick: function () { close(); } }), save));
  close = modal('Sửa thông tin', f, { focusTo: name });
}

/* ---------- bộ chọn (modal .modal.picker chứa cả trang danh sách) ---------- */
export function pickerModal(kind, items, value, onPick, cfgFactory) {
  var lastFocus = document.activeElement, m, box;
  var cfg = typeof cfgFactory === 'function' ? cfgFactory(kind, { pick: pick, value: value }) : null;
  if (!cfg) { toast('Không mở được bộ chọn (' + kind + ').', 'err'); return; }
  var title = 'Chọn ' + (cfg.noun || (kind === 'model' ? 'mô hình' : 'trình chơi'));
  function pick(it) { close(); if (typeof onPick === 'function') onPick(it); }
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
    if (!m || !m.isConnected) return;
    stopTry(); /* dừng camera đang thử trong khung chi tiết trước khi gỡ trang */
    m.remove();
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.isConnected) focusEl(lastFocus);
  }
  m = h('div', { class: 'modal picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
      onclick: function (e) { if (e.target === m) close(); } },
    box = h('div', { class: 'box jlps-shell', tabindex: '-1' },
      h('div', { class: 'jlps-header' }, h('h2', null, title),
        h('div', { class: 'jlps-header-end' }, h('button', { type: 'button', class: 'jlps-close', 'aria-label': 'Đóng bộ chọn', onclick: function () { close(); } }, ico('x')))),
      listPage(cfg)));
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(m);
  var c = m.querySelector('.jlps-close');
  if (c) focusEl(c);
}

function playerKindOf(p) { var m = p.manifest || {}; return m.inputs ? 'Camera' : (m.questions ? 'Game câu hỏi' : 'Game danh sách'); }

export function pickField(kind, items, value, label, cfgFactory) {
  var cur = value == null ? '' : String(value), all = items || [], cb = function () {};
  var button = h('button', { type: 'button', class: 'ail-pick', 'aria-haspopup': 'dialog' });
  var el = h('div', { class: 'l' }, label, button);
  function item() { return all.filter(function (x) { return String(x.id) === cur; })[0]; }
  function sub(it) { return kind === 'model' ? (KIND[it.kind] || it.kind) : playerKindOf(it); }
  function draw() {
    var it = item();
    button.replaceChildren(h('span', { class: 'mk' }, ico(kind === 'model' ? 'cube' : 'play')), h('span', { class: 'tx' }, h('b', null, it ? it.name : (kind === 'model' ? 'Chọn mô hình…' : 'Chọn trình chơi…')), it ? h('small', { class: 'meta' }, sub(it)) : null), ico('chevR'));
  }
  button.onclick = function () { pickerModal(kind, all, cur, function (it) { cur = String(it.id); draw(); cb(it); }, cfgFactory); };
  draw();
  return { el: el, get value() { return cur; }, setItems: function (a) { all = a || []; if (cur && !item()) cur = ''; draw(); }, onChange: function (f) { cb = f; } };
}
