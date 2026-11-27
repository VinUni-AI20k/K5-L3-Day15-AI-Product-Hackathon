/* views-core.js — các view chính của AI Game Composer: Trang chủ, Thư viện (Mô hình/Trình chơi/
   Bộ đề/Ứng dụng), Quản trị và Đăng nhập. Tách từ app.js cũ, giữ nguyên 100% logic API,
   thay toàn bộ confirm/alert/prompt bằng confirmModal/promptModal + toast, khóa nút khi đang gửi.
   Bổ sung: Trang chủ dashboard giáo viên (Reuse-first, Generate-if-needed), Bộ đề soạn 2 chế độ
   (từng câu / văn bản '|'), Ứng dụng dạng form 3 bước có hướng dẫn.
   Phụ thuộc: dom.js (tiện ích chung) + list-page.js (trang danh sách, preview, bộ chọn). */

import { h, api, ico, btn, errBox, STATUS, fmtStatus, KIND, srcOf, QHELP,
         toast, modal, confirmModal, promptModal, copyText,
         validateQuestionsClient, serializeQuestionsClient } from './dom.js';
import { listPage, previewFrame, cameraTry, imageField, pickField } from './list-page.js';

var KEYS = 'ABCD';

/* ---------- thao tác có xác nhận & khóa nút (thay confirm/alert/window.prompt cũ) ---------- */
function delDo(ctx, noun, name, url) {
  confirmModal('Xoá ' + noun, 'Xoá ' + noun + ' “' + name + '”? Thao tác này không quay lại được.', 'Xoá', true)
    .then(function (ok) {
      if (!ok) return;
      api('DELETE', url).then(function () { toast('Đã xoá ' + noun + ' “' + name + '”.', 'ok'); ctx.route(); })
        .catch(function (e) { toast((e && e.message) || 'Có lỗi, thử lại.', 'err'); });
    });
}

/* gọi một hành động POST: khóa nút trong lúc gửi, toast kết quả, route() làm mới khi xong.
   Không rethrow: lỗi đã báo toast, caller không cần .catch riêng. */
function act(url, body, doneMsg, btnEl, ctx) {
  if (btnEl) btnEl.disabled = true;
  return api('POST', url, body || {}).then(function (d) {
    if (doneMsg) toast(doneMsg, 'ok');
    ctx.route();
    return d;
  }).catch(function (e) {
    toast((e && e.message) || 'Có lỗi, thử lại.', 'err');
    if (btnEl) btnEl.disabled = false;
  });
}

function tagsOf(list, max) {
  var out = list.slice(0, max).map(function (t) { return h('span', { class: 'ail-chip' }, t); });
  if (list.length > max) out.push(h('span', { class: 'ail-chip more' }, '+' + (list.length - max)));
  return out;
}

/* ---------- cấu hình danh sách Mô hình ---------- */
function actionCount(m) { return m.outputs.filter(function (o) { return o.role === 'action'; }).length; }

function modelsCfg(ctx, items, o) {
  o = o || {};
  function can(m) { return (m.mine || ctx.me.role === 'admin') && m.owner !== 'AI Lab'; }
  return {
    noun: 'mô hình', res: 'models', items: items, value: o.value, pick: o.pick, actions: o.actions, canMeta: can,
    onRefresh: function () { ctx.route(); },
    empty: 'Bạn chưa có mô hình nào. Bấm “Tạo mô hình” để làm từ đầu, hoặc “Thêm mô hình” nếu đã có đường dẫn Teachable Machine.',
    text: function (m) { return m.name + ' ' + (m.description || '') + ' ' + m.outputs.map(function (x) { return x.key; }).join(' '); },
    filters: [
      { key: 'src', label: 'Nguồn', values: function (m) { return [srcOf(m)]; }, order: ['AI Lab', 'Của tôi', 'Người dùng khác'] },
      { key: 'kind', label: 'Loại mô hình', values: function (m) { return [KIND[m.kind]]; }, order: [KIND.image, KIND.pose, KIND.audio, KIND.hands] },
      { key: 'n', label: 'Số đáp án', values: function (m) { var n = actionCount(m); return [n === 0 ? 'Chưa có đáp án' : n >= 5 ? '5+ đáp án' : n + ' đáp án']; }, order: ['Chưa có đáp án', '1 đáp án', '2 đáp án', '3 đáp án', '4 đáp án', '5+ đáp án'] },
      { key: 'use', label: 'Sử dụng', values: function (m) { return [m.usedBy ? 'Có ứng dụng dùng' : 'Chưa ứng dụng nào dùng']; }, order: ['Có ứng dụng dùng', 'Chưa ứng dụng nào dùng'] }
    ],
    card: function (m) {
      var usable = actionCount(m) > 0;
      return { icon: m.kind === 'pose' ? 'user' : m.kind === 'hands' ? 'eye' : 'image', pill: usable ? null : 'Chưa dùng được', title: m.name,
        meta: KIND[m.kind] + (m.owner && !m.mine ? ' · ' + m.owner : '') + (m.usedBy ? ' · ' + m.usedBy + ' ứng dụng' : ''), tags: tagsOf(m.outputs.map(function (x) { return x.key; }), 2),
        state: usable ? ['check', '', 'Dùng được'] : ['minus', 'off', 'Chưa dùng được'],
        menu: o.pick || !can(m) ? [] : [{ label: 'Sửa', icon: 'edit', href: '#/models/' + m.id }, { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { delDo(ctx, 'mô hình', m.name, '/api/models/' + m.id); } }] };
    },
    detail: function (m) {
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
        cameraTry(m, box, setScores, cb);
        body.push(box, h('div', { class: 'ail-row' }, cb), h('div', { class: 'ail-row' }, h('span', { class: 'jlps-card-title' }, 'Tự mở camera khi xem trước'), h('label', { class: 'ail-switch' }, auto, h('i'), h('span', { class: 'sr' }, 'Tự mở camera khi xem trước'))));
        if (localStorage.getItem('ail.autocam') === '1') setTimeout(function () { if (cb.isConnected) cb.click(); }, 0);
      } else body.push(h('div', { class: 'ail-cambox' }, ico('image'), h('div', null, m.kind === 'hands' ? 'Bàn tay có sẵn: thử khi chơi một ứng dụng dùng nó.' : 'Mô hình âm thanh mới chỉ lưu, chưa xem trước được ở bản này.')));
      body.push(bars);
      var foot = [];
      if (o.pick) foot.push(btn('Chọn mô hình này', 'check', { cls: 'pri', onclick: function () { o.pick(m); } }));
      else if (can(m)) foot.push(btn('Sửa', 'edit', { href: '#/models/' + m.id }), btn('Xoá', 'trash', { cls: 'bad', onclick: function () { delDo(ctx, 'mô hình', m.name, '/api/models/' + m.id); } }));
      return { title: m.name, sub: KIND[m.kind] + ' · ' + (m.visibility === 'public' ? 'Công khai' : 'Riêng tư') + (m.owner && !m.mine ? ' · ' + m.owner : ''), body: body, footer: foot };
    }
  };
}

/* ---------- cấu hình danh sách Trình chơi ---------- */
function playerKind(p) { var m = p.manifest; return m.inputs ? 'Camera' : (m.questions ? 'Game câu hỏi' : 'Game danh sách'); }

/* các thao tác được phép trên một trình chơi (menu thẻ + chân chi tiết dùng chung) */
function playerActions(ctx, p) {
  var a = [];
  if (!(p.mine || ctx.me.role === 'admin')) return a;
  var base = '/api/players/' + p.id + '/';
  if (p.status === 'draft' || p.status === 'refused') a.push({ label: 'Gửi duyệt', icon: 'send', action: 'submit', msg: 'Đã gửi duyệt “' + p.name + '”.' });
  if (p.status === 'pending') a.push({ label: 'Rút lại', icon: 'undo', action: 'withdraw', msg: 'Đã rút “' + p.name + '” về bản nháp.' });
  if (p.status === 'approved' && !p.sample) a.push({ label: p.visibility === 'public' ? 'Chuyển riêng tư' : 'Công khai', icon: 'globe', action: 'visibility', body: { visibility: p.visibility === 'public' ? 'private' : 'public' }, msg: p.visibility === 'public' ? 'Đã chuyển “' + p.name + '” thành riêng tư.' : 'Đã công khai “' + p.name + '”.' });
  a.push({ label: 'Sửa', icon: 'edit', href: '#/players/' + p.id });
  a.push({ label: 'Xoá', icon: 'trash', cls: 'bad', del: true });
  return a;
}

function playersCfg(ctx, items, o) {
  o = o || {};
  function menu(p) {
    return o.pick ? [] : playerActions(ctx, p).map(function (a) {
      if (a.del) return { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { delDo(ctx, 'trình chơi', p.name, '/api/players/' + p.id); } };
      return { label: a.label, icon: a.icon, cls: a.cls, href: a.href, onclick: a.action ? function () { act('/api/players/' + p.id + '/' + a.action, a.body, a.msg, null, ctx); } : null };
    });
  }
  return {
    noun: 'trình chơi', res: 'players', items: items, value: o.value, pick: o.pick, actions: o.actions,
    canMeta: function (p) { return p.mine || ctx.me.role === 'admin'; },
    onRefresh: function () { ctx.route(); },
    empty: 'Bạn chưa có trình chơi nào. Bấm “Thêm trình chơi” (dán hoặc tải file HTML) hoặc nhờ Trợ lý game tạo giúp.',
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
        tags: p.manifest.inputs ? tagsOf(p.manifest.kinds.map(function (k) { return KIND[k]; }), 2) : [], state: ok ? ['check', '', 'Đã duyệt'] : ['minus', 'warn', STATUS[p.status][0]], menu: menu(p) };
    },
    detail: function (p) {
      var body = [h('div', { class: 'ail-preview' }, previewFrame(p.id)), p.description ? h('p', { class: 'ail-desc' }, p.description) : null,
        h('dl', { class: 'ail-dl' }, h('dt', null, 'Trạng thái'), h('dd', null, fmtStatus(p.status)), h('dt', null, 'Loại'), h('dd', null, playerKind(p)), h('dt', null, 'Người tạo'), h('dd', null, p.mine ? 'Tôi' : (p.owner || 'AI Lab')),
          h('dt', null, 'Cờ xem xét'), h('dd', null, p.flags.length ? p.flags.map(function (f) { return h('span', { class: 'ail-chip warn', style: 'margin:0 4px 4px 0' }, f.label); }) : 'Không có'))];
      if (p.note) body.push(h('div', { class: 'note' }, p.note));
      var foot = o.pick ? [btn('Chọn trình chơi này', 'check', { cls: 'pri', onclick: function () { o.pick(p); } })]
        : playerActions(ctx, p).map(function (a) {
            if (a.del) return btn('Xoá', 'trash', { cls: 'bad', onclick: function () { delDo(ctx, 'trình chơi', p.name, '/api/players/' + p.id); } });
            return btn(a.label, a.icon, { href: a.href, cls: a.cls, onclick: a.action ? function (e) { act('/api/players/' + p.id + '/' + a.action, a.body, a.msg, e.currentTarget, ctx); } : null });
          });
      return { title: p.name, sub: playerKind(p) + (p.owner && !p.mine ? ' · ' + p.owner : ''), body: body, footer: foot };
    }
  };
}

/* ---------- cấu hình danh sách Ứng dụng ---------- */
function appsCfg(ctx, items, players, models, o) {
  o = o || {};
  var pn = {}, mn = {};
  players.forEach(function (p) { pn[p.id] = p.name; });
  models.forEach(function (m) { mn[m.id] = m.name; });
  return {
    noun: 'ứng dụng', res: 'apps', items: items, actions: o.actions,
    canMeta: function (a) { return a.mine || ctx.me.role === 'admin'; },
    onRefresh: function () { ctx.route(); },
    empty: 'Chưa có ứng dụng. Ứng dụng ghép một trình chơi với một mô hình (hoặc nội dung của bạn) thành thứ học sinh chơi được. Bấm “Thêm ứng dụng”, hoặc dùng Trợ lý game để AI ghép giúp.',
    text: function (a) { return a.name + ' ' + (a.description || '') + ' ' + (pn[a.player_id] || '') + ' ' + (mn[a.model_id] || ''); },
    filters: [
      { key: 'share', label: 'Chia sẻ', values: function (a) { return [a.share ? 'Ai có link đều chơi được' : 'Chỉ mình tôi']; }, order: ['Ai có link đều chơi được', 'Chỉ mình tôi'] },
      { key: 'kind', label: 'Dùng mô hình', values: function (a) { return [a.model_id ? 'Có mô hình' : 'Không cần mô hình']; }, order: ['Có mô hình', 'Không cần mô hình'] }
    ],
    card: function (a) {
      return { icon: 'grid', title: a.name, meta: (pn[a.player_id] || 'Trình chơi') + (a.model_id ? ' · ' + (mn[a.model_id] || 'Mô hình') : ''), tags: [a.share ? h('span', { class: 'ail-chip ok' }, 'Chia sẻ') : h('span', { class: 'ail-chip' }, 'Riêng tư')],
        state: ['play', '', 'Chơi được'], menu: [{ label: 'Chơi', icon: 'play', href: '/play/' + a.id, target: '_blank' }, a.mine ? { label: 'Sửa', icon: 'edit', href: '#/apps/' + a.id } : null, { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { delDo(ctx, 'ứng dụng', a.name, '/api/apps/' + a.id); } }] };
    },
    detail: function (a) {
      var link = location.origin + '/play/' + a.id;
      var copy = btn('Chép link', 'link', { onclick: function () {
        copyText(link).then(function (ok) { toast(ok ? 'Đã chép link vào bộ nhớ tạm.' : 'Không chép được tự động — hãy chép tay: ' + link, ok ? 'ok' : 'err'); });
      } });
      return { title: a.name, sub: a.mine ? 'Của tôi' : 'Của ' + (a.owner || ''), body: [a.description ? h('p', { class: 'ail-desc' }, a.description) : null,
        h('dl', { class: 'ail-dl' }, h('dt', null, 'Trình chơi'), h('dd', null, pn[a.player_id] || '—'), h('dt', null, 'Mô hình'), h('dd', null, a.model_id ? (mn[a.model_id] || '—') : 'Không cần'),
          h('dt', null, 'Chia sẻ'), h('dd', null, a.share ? 'Ai có link đều chơi được' : 'Chỉ mình tôi'), a.model_id ? [h('dt', null, 'Độ chắc chắn'), h('dd', null, String(a.sure)), h('dt', null, 'Giữ trong'), h('dd', null, a.hold_ms + ' ms')] : null)],
        footer: [btn('Chơi', 'play', { cls: 'pri', href: '/play/' + a.id, target: '_blank' })].concat(a.share ? [copy] : [], a.mine ? [btn('Sửa', 'edit', { href: '#/apps/' + a.id })] : [], [btn('Xoá', 'trash', { cls: 'bad', onclick: function () { delDo(ctx, 'ứng dụng', a.name, '/api/apps/' + a.id); } })]) };
    }
  };
}

/* ---------- cấu hình danh sách Bộ đề ---------- */
function examsCfg(ctx, items, o) {
  o = o || {};
  function editable(x) { return !(x.builtin && ctx.me.role !== 'admin'); }
  return {
    noun: 'bộ đề', res: 'exams', items: items, actions: o.actions, canMeta: editable,
    onRefresh: function () { ctx.route(); },
    empty: 'Bạn chưa có bộ đề nào. Bấm “Thêm bộ đề” để soạn câu hỏi dùng cho nhiều ứng dụng.',
    text: function (x) { return x.name + ' ' + (x.description || ''); },
    filters: [{ key: 'sub', label: 'Môn học', values: function (x) { return [x.name.indexOf(':') > 0 ? x.name.split(':')[0] : 'Khác']; }, order: ['Toán 12', 'Tiếng Anh 12', 'Tin học 12'] },
      { key: 'n', label: 'Số câu hỏi', values: function (x) { return [x.count <= 5 ? '1–5 câu' : x.count <= 10 ? '6–10 câu' : 'Trên 10 câu']; }, order: ['1–5 câu', '6–10 câu', 'Trên 10 câu'] }],
    card: function (x) {
      return { icon: 'edit', title: x.name, meta: x.count + ' câu hỏi' + (x.owner && !x.mine ? ' · ' + x.owner : ''), tags: [], state: ['check', '', 'Dùng được'],
        menu: !editable(x) ? [] : [{ label: 'Sửa', icon: 'edit', href: '#/exams/' + x.id }, { label: 'Xoá', icon: 'trash', cls: 'bad', onclick: function () { delDo(ctx, 'bộ đề', x.name, '/api/exams/' + x.id); } }] };
    },
    detail: function (x) {
      return { title: x.name, sub: x.count + ' câu hỏi', body: [x.description ? h('p', { class: 'ail-desc' }, x.description) : null,
        h('dl', { class: 'ail-dl' }, h('dt', null, 'Số câu'), h('dd', null, String(x.count)), h('dt', null, 'Người tạo'), h('dd', null, x.mine ? 'Tôi' : (x.owner || '')))],
        footer: !editable(x) ? [] : [btn('Sửa', 'edit', { cls: 'pri', href: '#/exams/' + x.id }), btn('Xoá', 'trash', { cls: 'bad', onclick: function () { delDo(ctx, 'bộ đề', x.name, '/api/exams/' + x.id); } })] };
    }
  };
}

/* ---------- Màn hình thư viện: danh sách + form thêm/sửa ---------- */
export function modelsView(ctx, parts) {
  if (parts[1] === 'new') return modelForm(ctx, null, parts[2] === 'create');
  if (parts[1] && /^\d+$/.test(parts[1])) return modelForm(ctx, parseInt(parts[1], 10));
  api('GET', '/api/models?scope=usable').then(function (d) {
    /* Theo spec.md §4 (Không làm: Không huấn luyện mô hình AI tương tác từ đầu):
       giáo viên chỉ xem danh mục Model Registry có sẵn; Admin mới thấy nút nạp thêm vào Catalog. */
    var actions = ctx.me && ctx.me.role === 'admin'
      ? [btn('Thêm mô hình vào Catalog', 'plus', { href: '#/models/new' })]
      : [];
    ctx.listMount('Mô hình tương tác', listPage(modelsCfg(ctx, d.models, { actions: actions })));
  }).catch(function (e) { ctx.mount(errBox(e)); });
}

export function playersView(ctx, parts) {
  if (parts[1] === 'new') return playerForm(ctx, null);
  if (parts[1] && /^\d+$/.test(parts[1])) return playerForm(ctx, parseInt(parts[1], 10));
  api('GET', '/api/players?scope=usable').then(function (d) {
    /* Giáo viên duyệt Kho mẫu game có sẵn để Reuse; Admin mới thấy nút tải HTML thủ công. */
    var actions = ctx.me && ctx.me.role === 'admin'
      ? [btn('Thêm mẫu game (HTML)', 'plus', { href: '#/players/new' })]
      : [btn('Soạn trò chơi với AI', 'sparkles', { cls: 'pri', href: '#/chat' })];
    ctx.listMount('Kho mẫu game', listPage(playersCfg(ctx, d.players, { actions: actions })));
  }).catch(function (e) { ctx.mount(errBox(e)); });
}

export function examsView(ctx, parts) {
  if (parts[1] === 'new') return examForm(ctx, null);
  if (parts[1] && /^\d+$/.test(parts[1])) return examForm(ctx, parseInt(parts[1], 10));
  api('GET', '/api/exams' + (ctx.me.role === 'admin' ? '?scope=all' : '')).then(function (d) {
    ctx.listMount('Bộ đề', listPage(examsCfg(ctx, d.exams, {
      actions: [btn('Thêm bộ đề', 'plus', { cls: 'pri', href: '#/exams/new' })]
    })));
  }).catch(function (e) { ctx.mount(errBox(e)); });
}

export function appsView(ctx, parts) {
  if (parts[1] === 'new') return appForm(ctx, null);
  if (parts[1] && /^\d+$/.test(parts[1])) return appForm(ctx, parseInt(parts[1], 10));
  Promise.all([api('GET', '/api/apps' + (ctx.me.role === 'admin' ? '?scope=all' : '')),
    api('GET', '/api/players?scope=usable'), api('GET', '/api/models?scope=usable')]).then(function (r) {
    ctx.listMount('Ứng dụng', listPage(appsCfg(ctx, r[0].apps, r[1].players, r[2].models, {
      actions: [btn('Thêm ứng dụng', 'plus', { cls: 'pri', href: '#/apps/new' })]
    })));
  }).catch(function (e) { ctx.mount(errBox(e)); });
}

/* ---------- Bộ đề: form thêm/sửa với trình soạn 2 chế độ ---------- */
var EXAMPLE = '2 + 2 = ? | 3 | 4 | 5 | =B\nThủ đô của Việt Nam là Hà Nội | =Đúng';

/* chuyển văn bản '|' thành trạng thái soạn từng câu (bỏ qua dòng lỗi, báo lại sau) */
function toBuilder(raw) {
  var v = validateQuestionsClient(raw);
  return v.questions.map(function (q) {
    return { type: q.type, text: q.text, choices: q.choices.map(function (c) { return { key: c.key, text: c.text }; }), answer: q.answer };
  });
}
function qValid(q) {
  if (!q.text.trim()) return false;
  if (!q.choices.some(function (c) { return c.key === q.answer; })) return false;
  return q.choices.every(function (c) { return c.text.trim(); });
}
function qErrText(q) {
  if (!q.text.trim()) return 'Chưa nhập nội dung câu hỏi.';
  if (q.choices.some(function (c) { return !c.text.trim(); })) return 'Còn đáp án chưa nhập nội dung.';
  if (!q.choices.some(function (c) { return c.key === q.answer; })) return 'Chưa chọn đáp án đúng.';
  return '';
}

function examForm(ctx, id) {
  var msg = h('div'), wrap = h('div');
  ctx.mount(wrap);
  (id ? api('GET', '/api/exams/' + id) : Promise.resolve(null)).then(function (r) {
    var ex = r && r.exam;
    var name = h('input', { type: 'text', maxlength: 80, required: true, value: ex ? ex.name : '' });
    var desc = h('textarea', { maxlength: 300 }); desc.value = ex ? ex.description : '';
    var img = imageField(ex ? ex.image : '');
    var raw = ex ? ex.content : EXAMPLE;   /* nguồn thật duy nhất: văn bản mẫu '|' */
    var qs = toBuilder(raw);
    var mode = 'builder';
    var modeBar = h('div', { class: 'ail-q-mode-bar' }), editor = h('div'), count = h('span', { class: 'meta', 'aria-live': 'polite' });

    function setMode(next) {
      if (next === mode) return;
      if (next === 'text') { raw = serializeQuestionsClient(qs); mode = 'text'; }
      else {
        var v = validateQuestionsClient(raw);
        if (v.errors.length) toast('Chuyển chế độ: bỏ qua ' + v.errors.length + ' dòng lỗi (xem lại ở chế độ văn bản).', 'info');
        qs = toBuilder(raw); mode = 'builder';
      }
      drawEditor();
    }
    function drawModeBar() {
      modeBar.replaceChildren(
        h('span', { class: 'meta' }, 'Kiểu soạn:'),
        h('div', { class: 'ail-mode-switch', role: 'tablist', 'aria-label': 'Kiểu soạn câu hỏi' },
          [['builder', 'Soạn từng câu'], ['text', 'Chế độ văn bản (|)']].map(function (m) {
            return h('button', { type: 'button', role: 'tab', 'aria-selected': mode === m[0] ? 'true' : 'false', class: mode === m[0] ? 'on' : '', onclick: function () { setMode(m[0]); } }, m[1]);
          })),
        mode === 'builder' ? h('span', { class: 'meta' }, 'Thân thiện: thêm câu, gõ đáp án, bấm tròn để chọn đáp án đúng.') : h('span', { class: 'meta' }, QHELP));
    }

    /* --- chế độ 1: trình soạn từng câu --- */
    function qCard(q, i) {
      var err = h('div', { class: 'ail-line-err', style: qValid(q) ? 'display:none' : '' }, qErrText(q));
      function refresh() { err.style.display = qValid(q) ? 'none' : ''; err.textContent = qErrText(q); drawCount(); }
      var typeSel = h('select', { 'aria-label': 'Loại câu ' + (i + 1), onchange: function (e) {
        if (e.target.value === q.type) return;
        if (e.target.value === 'truefalse') { q.type = 'truefalse'; q.choices = [{ key: 'T', text: 'Đúng' }, { key: 'F', text: 'Sai' }]; q.answer = 'T'; }
        else { q.type = 'single'; q.choices = [{ key: 'A', text: '' }, { key: 'B', text: '' }]; q.answer = 'A'; }
        drawEditor();
      } },
        h('option', { value: 'single', selected: q.type === 'single' }, 'Trắc nghiệm ABCD'),
        h('option', { value: 'truefalse', selected: q.type === 'truefalse' }, 'Đúng – Sai'));
      var text = h('input', { type: 'text', value: q.text, placeholder: 'Nội dung câu hỏi ' + (i + 1), 'aria-label': 'Nội dung câu hỏi ' + (i + 1), oninput: function () { q.text = text.value; refresh(); } });
      function tfRow(k, label) {
        var on = q.answer === k;
        return h('div', { class: 'ail-q-opt-row' + (on ? ' is-correct' : '') },
          h('button', { type: 'button', class: 'mk', 'aria-label': 'Chọn “' + label + '” làm đáp án đúng', 'aria-pressed': on ? 'true' : 'false', onclick: function () { q.answer = k; drawEditor(); } }, ico('check')),
          h('span', { class: 'jlps-choice-label' }, label));
      }
      var opts;
      if (q.type === 'truefalse') opts = h('div', { class: 'ail-q-opts' }, tfRow('T', 'Đúng'), tfRow('F', 'Sai'));
      else {
        opts = h('div', { class: 'ail-q-opts' }, q.choices.map(function (c, j) {
          var on = q.answer === c.key;
          var inp = h('input', { type: 'text', value: c.text, placeholder: 'Đáp án ' + c.key, 'aria-label': 'Đáp án ' + c.key + ' của câu ' + (i + 1), oninput: function () { c.text = inp.value; refresh(); } });
          return h('div', { class: 'ail-q-opt-row' + (on ? ' is-correct' : '') },
            h('button', { type: 'button', class: 'mk', 'aria-label': 'Chọn đáp án ' + c.key + ' làm đúng', 'aria-pressed': on ? 'true' : 'false', onclick: function () { q.answer = c.key; drawEditor(); } }, ico('check')),
            inp,
            q.choices.length > 2 ? h('button', { type: 'button', class: 'ail-btn icon sm ghost', 'aria-label': 'Xoá đáp án ' + c.key, onclick: function () {
              var removedIdx = j;
              var ansIdx = q.choices.findIndex(function (c2) { return c2.key === q.answer; });
              q.choices.splice(removedIdx, 1);
              q.choices = q.choices.map(function (c2, k) { return { key: KEYS[k], text: c2.text }; });
              if (ansIdx === removedIdx) q.answer = KEYS[0];
              else if (ansIdx > removedIdx) q.answer = KEYS[ansIdx - 1];
              drawEditor();
            } }, ico('x')) : null);
        }),
        q.choices.length < 4 ? h('div', null, btn('Thêm đáp án', 'plus', { cls: 'ghost sm', onclick: function () {
          q.choices.push({ key: KEYS[q.choices.length], text: '' });
          drawEditor();
        } })) : null);
      }
      return h('div', { class: 'ail-q-card' + (qValid(q) ? '' : ' is-err') },
        h('div', { class: 'ail-row' }, h('b', null, 'Câu ' + (i + 1)), typeSel, btn('Xoá câu', 'trash', { cls: 'ghost sm', onclick: function () { qs.splice(i, 1); drawEditor(); } })),
        h('label', { class: 'l' }, 'Câu hỏi', text), opts, err);
    }

    /* --- chế độ 2: văn bản '|' + kiểm tra trực tiếp --- */
    function drawTextMode() {
      var ta = h('textarea', { class: 'code', spellcheck: 'false', 'aria-label': 'Câu hỏi theo mẫu |' });
      ta.value = raw;
      var panel = h('div', { class: 'ail-val-list', 'aria-live': 'polite' });
      function check() {
        raw = ta.value;
        var v = validateQuestionsClient(raw);
        var rows = [h('div', { class: v.valid ? 'ok' : 'bad' }, ico(v.valid ? 'checkCircle' : 'xCircle'), ' ' + v.questions.length + ' câu hợp lệ' + (v.errors.length ? ' · ' + v.errors.length + ' dòng lỗi' : ''))];
        v.errors.slice(0, 12).forEach(function (e) { rows.push(h('div', { class: 'bad' }, 'Dòng ' + e.line + ': ' + e.error + (e.text ? ' — “' + (e.text.length > 60 ? e.text.slice(0, 60) + '…' : e.text) + '”' : ''))); });
        if (v.errors.length > 12) rows.push(h('div', { class: 'bad' }, '… và ' + (v.errors.length - 12) + ' dòng lỗi nữa.'));
        panel.replaceChildren.apply(panel, rows);
      }
      ta.addEventListener('input', check);
      check();
      return h('div', null, ta, h('div', { style: 'margin-top:10px' }, panel));
    }

    function drawCount() { count.textContent = 'Hiện có ' + qs.length + ' câu trong trình soạn.'; }
    function drawEditor() {
      drawModeBar();
      if (mode === 'builder') {
        editor.replaceChildren(
          h('div', { class: 'ail-q-list' }, qs.length ? qs.map(qCard) : h('p', { class: 'meta' }, 'Chưa có câu hỏi. Bấm “Thêm câu hỏi” bên dưới.')),
          h('div', { class: 'ail-row', style: 'justify-content:flex-start' },
            btn('Thêm câu hỏi', 'plus', { cls: 'sm', onclick: function () {
              qs.push({ type: 'single', text: '', choices: [{ key: 'A', text: '' }, { key: 'B', text: '' }], answer: 'A' });
              drawEditor();
            } }), count));
      } else editor.replaceChildren(drawTextMode());
    }

    var f = h('form', { class: 'ail-form', style: 'padding:0;background:none;border:0;gap:16px', onsubmit: function (e) {
      e.preventDefault();
      var content = mode === 'text' ? raw : serializeQuestionsClient(qs);
      var v = validateQuestionsClient(content);
      if (v.errors.length || !v.questions.length) {
        if (mode !== 'text') { mode = 'text'; drawEditor(); }
        msg.replaceChildren(errBox({ message: !v.questions.length ? 'Bộ đề cần ít nhất 1 câu hỏi hợp lệ.' : 'Còn ' + v.errors.length + ' dòng chưa hợp lệ — xem chi tiết trong khung kiểm tra bên dưới.' }));
        return;
      }
      var body = { name: name.value, description: desc.value, content: content };
      if (!id || img.changed) body.image = img.value;
      api(id ? 'PUT' : 'POST', id ? '/api/exams/' + id : '/api/exams', body)
        .then(function () { toast(id ? 'Đã lưu bộ đề.' : 'Đã tạo bộ đề.', 'ok'); location.hash = '#/exams'; })
        .catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, id ? 'Sửa bộ đề' : 'Thêm bộ đề'),
      h('p', { class: 'meta' }, 'Bộ đề là nguồn câu hỏi cho ứng dụng; sửa bộ đề thì ứng dụng chơi bản mới nhất.'),
      h('label', { class: 'l' }, 'Tên bộ đề', name),
      h('label', { class: 'l' }, 'Mô tả (không bắt buộc)', desc),
      img.el,
      h('div', null, modeBar, h('div', { style: 'margin-top:12px' }, editor)),
      msg,
      h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, ico('check'), 'Lưu'), h('a', { class: 'ail-btn', href: '#/exams' }, 'Huỷ')));
    wrap.replaceChildren(f);
    drawEditor();
    name.focus();
  }).catch(function (e) { wrap.replaceChildren(errBox(e)); });
}

/* ---------- Ứng dụng: form hướng dẫn 3 bước ---------- */
function stepBox(num, title, note, bodyChildren) {
  return h('section', { class: 'ail-step-box' },
    h('div', { class: 'ail-step-head' }, h('span', { class: 'ail-step-num', 'aria-hidden': 'true' }, String(num)),
      h('h3', null, title), note ? h('span', { class: 'meta' }, note) : null),
    h('div', { class: 'ail-step-body' }, bodyChildren));
}

function appForm(ctx, id) {
  var msg = h('div'), wrap = h('div');
  ctx.mount(wrap);
  Promise.all([api('GET', '/api/players?scope=usable'), api('GET', '/api/models?scope=usable'),
    id ? api('GET', '/api/apps/' + id) : Promise.resolve(null), api('GET', '/api/exams')]).then(function (r) {
    var players = r[0].players.filter(function (p) { return p.status !== 'hidden'; }), models = r[1].models, ex = r[2] && r[2].app;
    /* cfgFactory cho bộ chọn: pickerModal/pickField yêu cầu builder cfg ở nơi gọi (views-core) */
    function pickCfg(kind, opts) {
      return kind === 'model' ? modelsCfg(ctx, models, opts) : playersCfg(ctx, players, opts);
    }
    var name = h('input', { type: 'text', maxlength: 80, required: true, value: ex ? ex.name : '' });
    var desc = h('input', { type: 'text', maxlength: 300, value: ex ? ex.description : '' });
    var player = pickField('player', players, ex ? ex.player_id : null, 'Trình chơi', pickCfg);
    var model = pickField('model', models, ex ? ex.model_id : null, 'Mô hình', pickCfg);
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
      var p = cur();
      if (!p) {
        map.replaceChildren(h('p', { class: 'meta' }, players.length ? 'Chọn một trình chơi ở trên để xem mô hình và nội dung tương thích.' : 'Chưa có trình chơi nào dùng được.'));
        contentWrap.replaceChildren(h('p', { class: 'meta' }, 'Nội dung / bộ đề sẽ hiện sau khi bạn chọn trình chơi.'));
        return;
      }
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
      else contentWrap.replaceChildren(man.content ? h('label', { class: 'l' }, man.content.label, h('small', null, 'Mỗi dòng một mục (tối đa 120 ký tự).'), content) : h('p', { class: 'meta' }, 'Trình chơi này không cần nội dung thêm.'));
    }
    player.onChange(function () { mapping = {}; redraw(); });
    model.onChange(function () { mapping = {}; redraw(); });
    var f = h('form', { class: 'ail-form', style: 'padding:0;background:none;border:0;gap:16px', onsubmit: function (e) {
      e.preventDefault();
      var p = cur();
      api(id ? 'PUT' : 'POST', id ? '/api/apps/' + id : '/api/apps', { name: name.value, description: desc.value, playerId: player.value, modelId: p && p.manifest.inputs ? model.value : null,
        mapping: mapping, content: examSel.value ? '' : content.value, examId: examSel.value || null, sure: parseFloat(sure.value), holdMs: parseInt(hold.value, 10), share: share.checked })
        .then(function () { toast(id ? 'Đã lưu ứng dụng.' : 'Đã tạo ứng dụng.', 'ok'); location.hash = '#/apps'; })
        .catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, id ? 'Sửa ứng dụng' : 'Thêm ứng dụng'),
      h('p', { class: 'meta' }, '3 bước: chọn trình chơi và mô hình → nạp nội dung/bộ đề → chia sẻ và tinh chỉnh camera.'),
      stepBox(1, 'Thông tin & Trình chơi', 'Chuột luôn hoạt động ngay cả khi không dùng camera', [
        h('label', { class: 'l' }, 'Tên ứng dụng', name),
        h('label', { class: 'l' }, 'Mô tả (không bắt buộc)', desc),
        player.el, model.el, map]),
      stepBox(2, 'Bộ đề / Nội dung trò chơi', 'Chọn bộ đề có sẵn hoặc dán câu hỏi theo mẫu |', [contentWrap]),
      stepBox(3, 'Chia sẻ & Tùy chỉnh camera', null, [
        h('div', { class: 'row camopt' }, h('label', { class: 'l' }, 'Độ chắc chắn tối thiểu (0.5–0.99)', sure), h('label', { class: 'l' }, 'Giữ trong (ms)', hold)),
        h('label', { class: 'row' }, share, h('span', null, 'Cho phép ai có link cũng chơi được (không cần đăng nhập)'))]),
      msg,
      h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, ico('check'), 'Lưu'), h('a', { class: 'ail-btn', href: '#/apps' }, 'Huỷ')));
    wrap.replaceChildren(f); redraw(); name.focus();
  }).catch(function (e) { wrap.replaceChildren(errBox(e)); });
}

/* ---------- Mô hình: form thêm/sửa (giữ logic đọc lớp Teachable Machine) ---------- */
function modelForm(ctx, id, create) {
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
      outMsg.replaceChildren(h('p', { class: 'meta' }, 'Đang đọc các lớp từ đường dẫn…'));
      fetch(u + 'metadata.json').then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); }).then(function (m) {
        var labels = m.labels || (m.wordLabels) || [];
        if (!labels.length) throw new Error('x');
        var old = {}; state.outputs.forEach(function (o) { old[o.key] = o.role; });
        state.outputs = labels.map(function (l) { return { key: String(l), role: old[l] || 'action' }; });
        if (m.packageName && /pose/.test(m.packageName)) kind.value = 'pose';
        drawOuts(); outMsg.replaceChildren();
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
      api(id ? 'PUT' : 'POST', id ? '/api/models/' + id : '/api/models', body)
        .then(function () { toast(id ? 'Đã lưu mô hình.' : 'Đã thêm mô hình.', 'ok'); location.hash = '#/models'; })
        .catch(function (x) { msg.replaceChildren(errBox(x)); });
    } },
      h('h2', null, id ? 'Sửa mô hình' : (create ? 'Tạo mô hình' : 'Thêm mô hình')), intro,
      h('label', { class: 'l' }, 'Tên mô hình', name),
      h('label', { class: 'l' }, 'Mô tả (không bắt buộc)', desc),
      h('label', { class: 'l' }, 'Loại', kind, h('small', null, 'Hình ảnh và Tư thế chạy được; Âm thanh mới chỉ lưu, chưa chạy ở bản này.')),
      h('label', { class: 'l' }, 'Đường dẫn mô hình Teachable Machine', url),
      h('div', null, h('button', { class: 'ail-btn', type: 'button', onclick: readClasses }, ico('refresh'), 'Đọc các lớp từ đường dẫn'), outMsg),
      h('div', null, h('strong', null, 'Các lớp (đầu ra)'), outs, h('small', { class: 'meta' }, 'Hành động: học sinh làm để trả lời. Nghỉ / Trống: tư thế chờ, không có người.')),
      h('label', { class: 'l' }, 'Ai dùng được', vis),
      msg, h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, ico('check'), 'Lưu'), h('a', { class: 'ail-btn', href: '#/models' }, 'Huỷ')));
    wrap.replaceChildren(f); name.focus();
  }
  ctx.mount(wrap);
  if (id) api('GET', '/api/models/' + id).then(function (d) { go(d.model); }).catch(function (e) { wrap.replaceChildren(errBox(e)); }); else go();
}

/* ---------- Trình chơi: form thêm/sửa (dán hoặc tải HTML) ---------- */
function playerForm(ctx, id) {
  var msg = h('div'), area = h('textarea', { class: 'code', spellcheck: 'false', 'aria-label': 'Mã HTML của trình chơi', required: true });
  var file = h('input', { type: 'file', accept: '.html,text/html', 'aria-label': 'Chọn file HTML', onchange: function () {
    var f = file.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) return msg.replaceChildren(errBox({ message: 'File lớn hơn 2 MB.' }));
    f.text().then(function (t) { area.value = t; });
  } });
  var f = h('form', { class: 'ail-form', onsubmit: function (e) {
    e.preventDefault();
    api(id ? 'PUT' : 'POST', id ? '/api/players/' + id : '/api/players', { html: area.value })
      .then(function () { toast(id ? 'Đã lưu trình chơi.' : 'Đã thêm trình chơi (bản Nháp — gửi duyệt để công khai).', 'ok'); location.hash = '#/players'; })
      .catch(function (x) { msg.replaceChildren(errBox(x)); });
  } },
    h('h2', null, id ? 'Sửa trình chơi' : 'Thêm trình chơi'),
    h('p', { class: 'meta' }, 'Một file HTML tự đủ, có đúng một khối <script type="application/json" id="jl-camera"> mô tả trình chơi. Trình chơi mới ở trạng thái Nháp; bấm “Gửi duyệt” để Admin xem và công khai.'),
    h('label', { class: 'l' }, 'Tải file .html', file), h('label', { class: 'l' }, 'hoặc dán mã HTML', area), msg,
    h('div', { class: 'row' }, h('button', { class: 'ail-btn pri', type: 'submit' }, ico('check'), 'Lưu'), h('a', { class: 'ail-btn', href: '#/players' }, 'Huỷ')));
  ctx.mount(f);
  if (id) api('GET', '/api/players/' + id).then(function (d) { area.value = d.player.html; }).catch(function (e) { msg.replaceChildren(errBox(e)); });
}

/* ---------- Trang chủ: dashboard giáo viên (Reuse-first, Generate-if-needed) ---------- */
function statCard(label, url) {
  var num = h('div', { class: 'ail-stat-num' }, h('span', { class: 'ail-skel', style: 'width:44px' }));
  var card = h('div', { class: 'ail-stat' }, num, h('div', { class: 'ail-stat-label' }, label));
  api('GET', url).then(function (d) {
    var list = d.apps || d.exams || d.players || d.models || [];
    num.replaceChildren(String(list.length));
  }).catch(function () {
    num.replaceChildren('—');
    card.title = 'Không tải được số liệu này — phần còn lại của trang vẫn dùng được.';
  });
  return card;
}

export function homeView(ctx) {
  var steps = [
    ['1', 'Mô tả yêu cầu', 'Nói cho Trợ lý game biết: môn học, nội dung ôn tập và học sinh chơi thế nào (giơ tay qua camera, bấm chuột, ghép thẻ…).'],
    ['2', 'AI chọn có sẵn hoặc tạo nháp & sinh bộ đề', 'Reuse-first: ưu tiên ghép trình chơi có sẵn trong thư viện; chưa có thì AI mới viết bản nháp (Generate-if-needed) kèm bộ đề theo mẫu |.'],
    ['3', 'Giáo viên xem thử & duyệt', 'Mọi game là bản nháp: bạn xem thử, kiểm tra bộ đề, rồi duyệt. Chỉ game được duyệt mới tới tay học sinh.']
  ];
  var hero = h('section', { class: 'ail-hero' },
    h('div', { class: 'ail-hero-txt' },
      h('h1', { class: 'ail-hero-title' }, 'Xin chào, ' + ctx.me.username + (ctx.me.role === 'admin' ? ' · Admin' : '')),
      h('p', { class: 'ail-hero-sub' }, 'Tạo game học tập cho lớp của bạn cùng AI: mô tả ý tưởng, để AI ghép tài nguyên có sẵn hoặc tạo bản nháp, xem thử rồi duyệt — không cần biết viết code.'),
      h('div', { class: 'ail-hero-points' },
        h('div', { class: 'ail-hero-point' }, ico('check'), h('span', null, h('b', null, 'Reuse-first'), ' — dùng lại trình chơi & bộ đề có sẵn để nhanh và ổn định trên lớp.')),
        h('div', { class: 'ail-hero-point' }, ico('check'), h('span', null, h('b', null, 'Generate-if-needed'), ' — chỉ tạo nháp khi thư viện chưa có, luôn phải duyệt trước khi học sinh dùng.')))),
    h('div', { class: 'ail-hero-cta' },
      btn('Tạo game với AI', 'wand', { cls: 'pri lg', href: '#/chat' }),
      btn('Ghép ứng dụng thủ công', 'grid', { cls: 'lg', href: '#/apps/new' }),
      h('span', { class: 'ail-hero-note' }, 'Hai đường đều đưa bạn tới một ứng dụng chơi được.')));

  var stats = h('div', { class: 'ail-stats', style: 'margin-top:16px' },
    statCard('Ứng dụng', '/api/apps'),
    statCard('Bộ đề', '/api/exams'),
    statCard('Trình chơi dùng được', '/api/players?scope=usable'),
    statCard('Mô hình dùng được', '/api/models?scope=usable'));

  var quickGrid = h('div', { class: 'ail-quick-grid' }, h('div', { class: 'ail-skel', style: 'width:60%' }));
  var quick = h('section', null, h('div', { class: 'ail-row', style: 'margin:22px 0 10px' }, h('h2', null, 'Ứng dụng gần đây'), h('a', { class: 'meta', href: '#/apps' }, 'Xem tất cả →')), quickGrid);
  api('GET', '/api/apps').then(function (d) {
    var apps = (d.apps || []).slice(0, 4);
    if (!apps.length) { quickGrid.replaceChildren(h('p', { class: 'meta' }, 'Chưa có ứng dụng nào — bấm “Tạo game với AI” để bắt đầu.')); return; }
    quickGrid.replaceChildren.apply(quickGrid, apps.map(function (a) {
      return h('div', { class: 'ail-quick' },
        h('span', { class: 'mk' }, ico('grid')),
        h('b', null, a.name),
        h('span', null, (a.description || 'Ứng dụng cho học sinh chơi ngay') + (a.share ? ' · đang chia sẻ' : '')),
        h('div', { class: 'ail-row', style: 'justify-content:flex-start;margin-top:2px' },
          btn('Chơi ngay', 'play', { cls: 'sm pri', href: '/play/' + a.id, target: '_blank' }),
          a.mine ? btn('Sửa', 'edit', { cls: 'ghost sm', href: '#/apps/' + a.id }) : null));
    }));
  }).catch(function (e) { quickGrid.replaceChildren(errBox(e)); });

  var guide = h('section', null, h('h2', { style: 'margin:22px 0 10px' }, 'Reuse-first, Generate-if-needed — 3 bước'),
    h('div', { class: 'ail-steps-guide' }, steps.map(function (s) {
      return h('div', { class: 'ail-step' }, h('span', { class: 'ail-step-num', 'aria-hidden': 'true' }, s[0]), h('div', null, h('b', null, s[1]), h('p', null, s[2])));
    })));

  ctx.mount(h('div', null, hero, stats, quick, guide));
}

/* ---------- Quản trị: hàng đợi duyệt + đã duyệt/ẩn + tài khoản ---------- */
export function adminView(ctx) {
  var q = h('div'), u = h('div');

  function adminAct(url, body, doneMsg, btnEl) { return act(url, body, doneMsg, btnEl, ctx); }
  function tryBtn(p) {
    return h('button', { type: 'button', class: 'ail-btn sm', onclick: function () { modal('Xem thử: ' + p.name, previewFrame(p.id)); } }, ico('play'), 'Thử');
  }
  function approveBtn(p) {
    return h('button', { type: 'button', class: 'ail-btn sm pri', onclick: function (e) { adminAct('/api/players/' + p.id + '/approve', null, 'Đã duyệt & công khai “' + p.name + '”.', e.currentTarget); } }, ico('check'), 'Duyệt & công khai');
  }
  function refuseBtn(p) {
    return h('button', { type: 'button', class: 'ail-btn sm bad', onclick: function () {
      promptModal('Từ chối trình chơi', '“' + p.name + '” sẽ bị từ chối. Người tạo sẽ thấy lý do này.', { minLen: 1, maxLen: 300, confirmLabel: 'Từ chối', fieldLabel: 'Lý do từ chối (1–300 ký tự)', placeholder: 'Ví dụ: Câu hỏi trùng nhau, sửa rồi gửi lại nhé.' })
        .then(function (n) { if (n === null || n === false) return; adminAct('/api/players/' + p.id + '/refuse', { note: n }, 'Đã từ chối “' + p.name + '”.', null); });
    } }, ico('x'), 'Từ chối');
  }
  function hideBtn(p) {
    return h('button', { type: 'button', class: 'ail-btn sm bad', onclick: function () {
      promptModal('Ẩn trình chơi', '“' + p.name + '” sẽ biến mất khỏi danh sách chơi được. Có thể khôi phục sau.', { minLen: 0, maxLen: 300, confirmLabel: 'Ẩn', fieldLabel: 'Lý do ẩn (có thể bỏ trống, tối đa 300 ký tự)' })
        .then(function (n) { if (n === null) return; adminAct('/api/players/' + p.id + '/hide', { note: n }, 'Đã ẩn “' + p.name + '”.', null); });
    } }, ico('eye'), 'Ẩn');
  }
  function restoreBtn(p) {
    return h('button', { type: 'button', class: 'ail-btn sm', onclick: function (e) {
      var b = e.currentTarget; /* giữ tham chiếu trước await — currentTarget = null sau khi dispatch xong */
      confirmModal('Khôi phục trình chơi', 'Đưa “' + p.name + '” trở lại danh sách đã duyệt?', 'Khôi phục').then(function (ok) {
        if (!ok) return; adminAct('/api/players/' + p.id + '/restore', null, 'Đã khôi phục “' + p.name + '”.', b);
      });
    } }, ico('refresh'), 'Khôi phục');
  }

  function loadQ() {
    api('GET', '/api/players?scope=all').then(function (d) {
      var pend = d.players.filter(function (p) { return p.status === 'pending'; });
      var hid = d.players.filter(function (p) { return p.status === 'hidden'; });
      q.replaceChildren(h('h3', null, 'Chờ duyệt (' + pend.length + ')'),
        pend.length ? h('div', { class: 'grid' }, pend.map(function (p) {
          return h('div', { class: 'card' }, h('h3', null, p.name), h('div', { class: 'meta' }, 'của ' + p.owner + (p.source !== 'upload' ? ' · ' + (p.source === 'ai' ? 'AI viết' : 'AI giả') : '')),
            p.flags.length ? h('div', null, p.flags.map(function (f) { return h('span', { class: 'tag warn', title: (f.reason || '') + (f.excerpt ? ' — ' + f.excerpt : '') }, f.label + (f.line ? ' · dòng ' + f.line : '')); })) : h('div', { class: 'tag ok' }, 'Không có cờ'),
            h('div', { class: 'acts' }, tryBtn(p), approveBtn(p), refuseBtn(p)));
        })) : h('div', { class: 'empty' }, 'Không có trình chơi nào chờ duyệt.'),
        h('h3', { style: 'margin-top:20px' }, 'Đã duyệt, có thể ẩn'),
        (function () {
          var pub = d.players.filter(function (p) { return p.status === 'approved' && !p.sample; }).concat(hid);
          return pub.length ? h('div', { class: 'grid' }, pub.map(function (p) {
            return h('div', { class: 'card' }, h('h3', null, p.name), h('div', { class: 'meta' }, 'của ' + p.owner), fmtStatus(p.status),
              h('div', { class: 'acts' }, p.status === 'hidden' ? restoreBtn(p) : hideBtn(p)));
          })) : h('div', { class: 'empty' }, 'Chưa có trình chơi do người dùng tạo đã duyệt hoặc bị ẩn.');
        })());
    }).catch(function (e) { q.replaceChildren(errBox(e)); toast((e && e.message) || 'Không tải được hàng đợi duyệt.', 'err'); });
  }
  function loadU() {
    api('GET', '/api/admin/users').then(function (d) {
      u.replaceChildren(h('details', { style: 'margin-top:24px' },
        h('summary', { style: 'cursor:pointer;font-weight:500;color:var(--jl-text-secondary);padding:6px 0' }, 'Quản lý tài khoản (' + d.users.length + ')'),
        h('table', { class: 'ail-table', style: 'margin-top:8px' },
          h('thead', null, h('tr', null, h('th', null, 'Tên'), h('th', null, 'Vai trò'), h('th', null, ''))),
          h('tbody', null, d.users.map(function (x) {
            var next = x.role === 'admin' ? 'user' : 'admin';
            return h('tr', null, h('td', null, x.username), h('td', null, x.role === 'admin' ? 'Admin' : 'User'),
              h('td', null, x.id === ctx.me.id ? null : h('button', { type: 'button', class: 'ail-btn sm', onclick: function (e) {
                var b = e.currentTarget; /* giữ tham chiếu trước await */
                confirmModal('Đổi vai trò', 'Đổi ' + x.username + ' thành ' + (next === 'admin' ? 'Admin' : 'User') + '?', 'Đổi vai trò').then(function (ok) {
                  if (!ok) return; adminAct('/api/admin/users/' + x.id + '/role', { role: next }, 'Đã đổi vai trò của ' + x.username + '.', b);
                });
              } }, ico('user'), 'Đổi thành ' + (next === 'admin' ? 'Admin' : 'User'))));
          })))));
    }).catch(function (e) { u.replaceChildren(errBox(e)); toast((e && e.message) || 'Không tải được danh sách tài khoản.', 'err'); });
  }
  ctx.mount(h('div', null, h('h2', null, 'Cổng duyệt HITL'), q, u));
  loadQ(); loadU();
}

/* ---------- Đăng nhập / tạo tài khoản ---------- */
export function loginView(ctx) {
  var mode = 'login';
  var appRoot = document.getElementById('app');
  appRoot.className = '';
  var card = h('div', { class: 'login' });
  function draw() {
    var msg = h('div');
    var u = h('input', { type: 'text', autocomplete: 'username', required: true });
    var p = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
    var submit = h('button', { class: 'ail-btn pri lg', type: 'submit' }, ico(mode === 'login' ? 'login' : 'plus'), mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản');
    var f = h('form', { class: 'ail-form', style: 'padding:0;background:none;border:0;gap:12px', onsubmit: function (e) {
      e.preventDefault();
      msg.replaceChildren();
      submit.disabled = true;
      submit.replaceChildren(ico('refresh'), mode === 'login' ? 'Đang đăng nhập…' : 'Đang tạo tài khoản…');
      api('POST', mode === 'login' ? '/api/login' : '/api/register', { username: u.value, password: p.value })
        .then(function (d) { ctx.onLogin(d.user); })
        .catch(function (x) {
          msg.replaceChildren(errBox(x));
          submit.disabled = false;
          submit.replaceChildren(ico(mode === 'login' ? 'login' : 'plus'), mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản');
        });
    } },
      h('div', { class: 'ail-row', style: 'justify-content:center;gap:12px' },
        h('span', { class: 'ail-brand-mark', 'aria-hidden': 'true' },
          (function () {
            var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
            s.innerHTML = '<path d="M12 2.5L20 6v6c0 4.8-3.4 8.3-8 9.5C7.4 20.3 4 16.8 4 12V6l8-3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5l1.6 3.9 3.9 1.6-3.9 1.6-1.6 3.9-1.6-3.9-3.9-1.6 3.9-1.6z" fill="currentColor"/>';
            return s;
          })()),
        h('div', { style: 'text-align:left' },
          h('h1', { style: 'font-size:20px;font-weight:600;line-height:1.2' }, 'AI Game Composer'),
          h('div', { class: 'meta' }, '4ChangLinhNguLam'))),
      h('p', { class: 'meta', style: 'text-align:center' }, 'Tạo, xem thử và kiểm duyệt trò chơi ôn tập tương tác cùng AI.'),
      h('div', { class: 'ail-mode-switch', role: 'tablist', style: 'align-self:center' },
        [['login', 'Đăng nhập'], ['register', 'Tạo tài khoản']].map(function (m) {
          return h('button', { type: 'button', role: 'tab', 'aria-selected': mode === m[0] ? 'true' : 'false', class: mode === m[0] ? 'on' : '', onclick: function () { mode = m[0]; draw(); } }, m[1]);
        })),
      h('label', { class: 'l' }, 'Tên đăng nhập', u),
      h('label', { class: 'l' }, 'Mật khẩu', mode === 'register' ? h('small', null, 'Ít nhất 8 ký tự') : null, p),
      msg, submit);
    card.replaceChildren(f);
    u.focus();
  }
  draw();
  appRoot.replaceChildren(h('div', { class: 'ail-login-wrap' }, card));
}
