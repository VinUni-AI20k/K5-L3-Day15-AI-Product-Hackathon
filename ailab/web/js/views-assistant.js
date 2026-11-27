/* views-assistant.js — View “Trợ lý game” (ES module), tách từ chatView cũ trong app.js (dòng 716–783).

   Hợp đồng: chatView(ctx) với ctx = { me, llmMode, mount, navigate }.
   - ctx.mount(el)        : gắn nội dung vào vùng chính của shell (đã bọc .ail-page).
   - ctx.navigate('#/x')  : điều hướng hash của shell; thiếu thì fallback location.hash.
   - ctx.llmMode          : cấu hình Model AI hiện hành của máy chủ — CHỈ dùng cho badge cấu hình ở header.
     Không suy luận simulated/source của từng tin nhắn từ llmMode: mỗi response tự mang nhãn của nó
     (m.simulated / p.source / plan.simulated).

   Hai chế độ rạch ròi (mode switch):
   - 'real' (MẶC ĐỊNH): gọi API thật — GET /api/chats, GET /api/chats/:id, POST /api/chat,
     POST /api/chats/:chatId/proposals/:idx/(accept|reject); xem thử qua previewFrame (js/list-page.js).
   - 'mock' : Cô LẬP hoàn toàn qua runMockComposer + MOCK_PRESETS (js/mock-adapter.js) — không gọi API ghi;
     chỉ ĐỌC Catalog (GET players/models) để nhánh REUSE tham chiếu ID thật; bắt buộc banner .ail-banner-mock.

   Xử lý lỗi & trạng thái (khắc phục đầy đủ các lỗi review Codex chỉ ra):
   - drawSide() / mở lịch sử chat: luôn .catch() → hiển thị lỗi + nút “Thử lại”, không thất bại im lặng.
   - submit(): khóa nút Gửi khi đang bận; lỗi mạng/API thì KHÔNG mất nội dung người dùng đã gõ
     (khôi phục input.value khi còn trống + nút “Thử lại” điền lại nội dung).
   - decide(): khóa CẢ HAI nút Accept/Reject trong lúc gửi; toast khi thành công;
     lỗi 409 → tải lại GET /api/chats/:id để đồng bộ state thật từ server.

   HITL 2 bước — KHÔNG BAO GIỜ tự đặt APPROVED hay báo đã xuất bản công khai:
   - Mock : “Duyệt kế hoạch” chỉ tạo bản Nháp trình diễn trong phiên (ghi cục bộ _decided trên message);
            “Yêu cầu chỉnh sửa / Từ chối” ghi nhận lý do cục bộ qua promptModal.
   - Real : nút HITL kế hoạch ở trạng thái chờ (disabled) cho tới khi T08/T14 nối API duyệt kế hoạch.
     Đề xuất legacy (proposal cũ) vẫn dùng accept/reject thật — kết quả luôn là bản NHÁP chờ Admin duyệt. */

import { h, api, ico, btn, errBox, toast, modal, promptModal, QHELP, KIND,
  parseQuestionsClient, validateQuestionsClient, skeletonCards } from './dom.js';
import { runMockComposer, MOCK_PRESETS } from './mock-adapter.js';
import { previewFrame } from './list-page.js';

/* ---------- nhãn tĩnh của ApplicationPlan Contract v1.0 ---------- */
var DECISIONS = {
  REUSE: { badge: 'is-reuse', label: 'Tái sử dụng Catalog', icon: 'check' },
  GENERATE: { badge: 'is-generate', label: 'Tạo mới bản nháp DRAFT', icon: 'sparkles' },
  ASK_CLARIFY: { badge: 'is-ask', label: 'Cần làm rõ', icon: 'info' },
  REFUSE: { badge: 'is-refuse', label: 'Từ chối theo chính sách', icon: 'shield' }
};
/* Không có trạng thái “approved” ở đây: kế hoạch tối đa là pending_approval (HITL 1 chưa quyết). */
var PLAN_STATUS = {
  pending_approval: ['Chờ giáo viên duyệt (HITL 1)', 'warn'],
  needs_clarification: ['Cần thêm thông tin', 'info'],
  error: ['Không tạo kế hoạch', 'bad']
};
/* Gợi ý câu lệnh mẫu 2x2 gọn gàng */
var STARTERS = [
  { icon: 'grid', title: 'Trắc nghiệm Toán lớp 5', sub: 'Tái sử dụng game cử chỉ tay hoặc chuột', prompt: 'Tạo game trắc nghiệm ôn tập Toán lớp 5 (phép cộng trừ) chơi bằng cử chỉ tay hoặc chuột' },
  { icon: 'sparkles', title: 'Ghép thẻ tiếng Anh', sub: 'Tạo mới bản nháp chủ đề Động vật', prompt: 'Tạo game ghép cặp thẻ từ vựng tiếng Anh chủ đề Động vật (chưa có sẵn trong thư viện)' },
  { icon: 'play', title: 'Vòng quay gọi tên', sub: 'Chọn ngẫu nhiên học sinh đầu giờ', prompt: 'Tạo vòng quay chọn tên học sinh cho hoạt động đầu giờ' },
  { icon: 'chat', title: 'Yêu cầu mơ hồ (thử AI hỏi lại)', sub: 'Kiểm tra nhánh ASK_CLARIFY', prompt: 'Tạo giúp mình một game cho vui lớp' }
];
var MOCK_LATENCY = 380; // độ trễ giả lập để hiển thị trạng thái “đang soạn” ở Mock

export function chatView(ctx) {
  ctx = ctx || {};
  var mountFn = typeof ctx.mount === 'function' ? ctx.mount : function (el) {
    var m = document.getElementById('main'); if (m) m.replaceChildren(el);
  };
  var navigateFn = typeof ctx.navigate === 'function' ? ctx.navigate : function (p) { location.hash = p; };
  var llmMode = ctx.llmMode == null ? '' : String(ctx.llmMode);
  var isFakeLlm = llmMode.toLowerCase().indexOf('giả') >= 0;

  /* ---------- trạng thái: tách riêng từng chế độ, không trộn dữ liệu ---------- */
  var mode = 'real'; // 'real' | 'mock'
  var real = { chatId: null, msgs: [], busy: false, chats: [], sideErr: null, openErr: null };
  var mock = { msgs: [], busy: false, catalog: null };

  /* ---------- phần tử gốc ---------- */
  var historyOpen = false;
  var head = h('div', { class: 'ail-chat-head' });
  var log = h('div', { class: 'ail-chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Nội dung trò chuyện' });
  var side = h('aside', { class: 'ail-chat-history is-hidden', 'aria-label': 'Lịch sử trò chuyện' });
  var bannerSlot = h('div', { style: 'padding:0 20px' });
  var input = h('textarea', { rows: 1, maxlength: 2000, 'aria-label': 'Mô tả game bạn muốn tạo',
    placeholder: 'Mô tả game ôn tập bạn muốn tạo (môn, chủ đề, cách chơi)…' });
  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }
  input.addEventListener('input', autoResize);
  var send = h('button', { class: 'ail-send-btn', type: 'button', 'aria-label': 'Gửi', title: 'Gửi (Enter)' }, ico('send'));
  var compose = h('div', { class: 'ail-chat-compose-wrap' },
    h('div', { class: 'ail-chat-compose' }, input, send));
  var main = h('div', { class: 'ail-chat-main' }, head, bannerSlot, log, compose);

  /* ---------- tiện ích nhỏ ---------- */
  function focusInput() { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function simPill(label) {
    return h('span', { class: 'ail-plan-sim', title: 'Nhãn đi kèm riêng từng response — không suy luận từ badge cấu hình Model AI ở header.' },
      ico('alert'), label);
  }
  function srcChip(source) {
    if (source === 'ai') return h('span', { class: 'ail-chip' }, 'AI viết');
    if (source === 'fake') return h('span', { class: 'ail-chip warn' }, 'AI giả (khuôn có sẵn)');
    return source ? h('span', { class: 'ail-chip' }, source) : null;
  }
  function statusChipOf(plan) {
    var s = PLAN_STATUS[plan.status];
    return s ? h('span', { class: 'ail-chip ' + s[1] }, s[0]) : null;
  }
  function flexModalBody(children) { // bọc nội dung cho iframe căng đầy hộp modal
    return h('div', { style: 'display:flex;flex-direction:column;gap:10px;min-height:60vh' }, children);
  }

  /* ================= 1 · Header & Mode Switcher ================= */
  function modeBtn(m, label, title) {
    return h('button', { type: 'button', class: m === mode ? 'on' : '', 'aria-pressed': m === mode ? 'true' : 'false',
      title: title, onclick: function () {
        if (mode === m) return;
        mode = m; drawAll(); focusInput();
      } }, label);
  }
  var histAnchor = h('div', { class: 'ail-hist-anchor' });
  function closeHistory() {
    if (!historyOpen) return;
    historyOpen = false;
    side.classList.add('is-hidden');
    drawHead();
  }
  function toggleHistory(e) {
    if (e) e.stopPropagation();
    historyOpen = !historyOpen;
    side.classList.toggle('is-hidden', !historyOpen);
    drawHead();
  }
  document.addEventListener('click', function onAway(e) {
    if (!main.isConnected) return document.removeEventListener('click', onAway);
    if (historyOpen && !histAnchor.contains(e.target)) closeHistory();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (!main.isConnected) return document.removeEventListener('keydown', onEsc);
    if (historyOpen && e.key === 'Escape') closeHistory();
  });
  function drawHead() {
    var mob = typeof ctx.openDrawer === 'function'
      ? h('button', { type: 'button', class: 'ail-mobile-btn', 'aria-label': 'Mở menu điều hướng', onclick: ctx.openDrawer }, ico('menu'))
      : null;
    var llmOk = llmMode && llmMode !== 'giả';
    histAnchor.replaceChildren(
      btn('Lịch sử', 'chat', { cls: 'sm' + (historyOpen ? ' pri' : ' ghost'), title: 'Mở lịch sử trò chuyện', onclick: toggleHistory }),
      side);
    head.replaceChildren(
      h('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' },
        mob,
        histAnchor,
        btn('Cuộc mới', 'plus', { cls: 'sm', onclick: function () { closeHistory(); newChat(); } })),
      h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
        h('span', { class: 'ail-llm-pill ' + (llmOk ? 'is-ok' : 'is-mock'), title: 'Chế độ model hiện hành' }, 'Model AI: ' + (llmMode || '…')),
        h('div', { class: 'ail-mode-switch', role: 'group', 'aria-label': 'Chế độ hoạt động' },
          modeBtn('real', 'Chế độ thật', 'Gọi API thật (/api/chat).'),
          modeBtn('mock', 'Mock (Plan v1.0)', 'Xem trước ApplicationPlan v1.0 — chờ T08/T14.'))));
  }
  function drawBanner() {
    bannerSlot.replaceChildren();
    bannerSlot.style.padding = mode === 'mock' ? '10px 20px 0' : '0';
    if (mode !== 'mock') return;
    bannerSlot.appendChild(h('div', { class: 'ail-banner-mock', role: 'status' },
      h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, ico('alert'), h('b', null, 'Mock Preview (chờ T08/T14)'), '— không ghi dữ liệu thật'),
      h('div', { class: 'row', style: 'gap:6px' }, MOCK_PRESETS.map(function (pr) {
        return btn(pr.label, pr.icon, { cls: 'sm', title: pr.title + ' — ' + pr.desc, onclick: function () {
          input.value = pr.prompt; submit();
        } });
      }))));
  }

  /* ================= 2 · Lịch sử chat (side) — luôn có .catch() + Thử lại ================= */
  function newChat() {
    if (mode === 'real') { real.chatId = null; real.msgs = []; real.openErr = null; }
    else mock.msgs = [];
    drawLog(); focusInput();
  }
  function drawSideMock() {
    side.replaceChildren(h('b', null, 'Chế độ xem trước Mock'),
      h('p', { class: 'meta' }, 'Lịch sử chat thật được ẩn để tránh nhầm lẫn. Mỗi lượt Mock độc lập, không ghi vào dữ liệu thật.'),
      btn('Phiên Mock mới', 'plus', { onclick: newChat }),
      h('p', { class: 'meta' }, 'Bấm “Chế độ thật (API hiện hành)” để xem lịch sử /api/chats.'));
  }
  function drawSideList() {
    var kids = [
      h('div', { class: 'ail-chat-hist-head' },
        h('b', null, 'Lịch sử trò chuyện'),
        h('button', { type: 'button', class: 'ail-btn ghost icon sm', 'aria-label': 'Đóng lịch sử', onclick: toggleHistory }, ico('x'))),
      btn('Cuộc trò chuyện mới', 'plus', { cls: 'sm', title: 'Bắt đầu mô tả một game mới', onclick: newChat })
    ];
    if (!real.chats.length) kids.push(h('p', { class: 'meta', style: 'padding:6px 4px' }, 'Chưa có cuộc trò chuyện nào.'));
    real.chats.forEach(function (c) {
      var cur = String(c.id) === String(real.chatId);
      kids.push(h('button', { type: 'button', class: 'ail-chat-hist-item' + (cur ? ' on' : ''),
        'aria-current': cur ? 'true' : null, title: c.title || ('Chat #' + c.id),
        onclick: function () { openChat(c.id); } }, ico('chat'), h('span', null, c.title || ('Chat #' + c.id))));
    });
    side.replaceChildren.apply(side, kids);
  }
  function drawSide() {
    if (mode === 'mock') { drawSideMock(); return; }
    side.replaceChildren(h('b', null, 'Lịch sử trò chuyện'),
      btn('Cuộc trò chuyện mới', 'plus', { onclick: newChat }), skeletonCards(2));
    api('GET', '/api/chats').then(function (d) {
      real.chats = (d && d.chats) || []; real.sideErr = null;
      drawSideList();
    }).catch(function (e) {
      real.sideErr = e;
      side.replaceChildren(h('b', null, 'Lịch sử trò chuyện'),
        btn('Cuộc trò chuyện mới', 'plus', { onclick: newChat }),
        errBox(e),
        btn('Thử lại', 'refresh', { cls: 'sm', title: 'Gọi lại GET /api/chats', onclick: drawSide }));
    });
  }
  function syncPlayerStatuses(msgs) {
    var hasAccepted = (msgs || []).some(function (m) { return m.proposal && m.proposal.status === 'accepted' && m.proposal.playerId; });
    if (!hasAccepted) return;
    var scope = ctx.me && ctx.me.role === 'admin' ? 'all' : 'mine';
    api('GET', '/api/players?scope=' + scope).then(function (d) {
      var byId = {};
      ((d && d.players) || []).forEach(function (pl) { byId[String(pl.id)] = pl.status; });
      var changed = false;
      (msgs || []).forEach(function (m) {
        if (m.proposal && m.proposal.playerId && byId[String(m.proposal.playerId)]) {
          m.proposal._playerStatus = byId[String(m.proposal.playerId)];
          changed = true;
        }
      });
      if (changed) drawLog(false);
    }).catch(function () {});
  }
  function openChat(id) {
    closeHistory();
    api('GET', '/api/chats/' + id).then(function (x) {
      real.chatId = x.id; real.msgs = (x && x.messages) || []; real.openErr = null;
      drawLog(true); drawSideList();
      syncPlayerStatuses(real.msgs);
    }).catch(function (e) {
      real.openErr = { id: id, e: e };
      toast('Không mở được cuộc trò chuyện: ' + e.message, 'err');
      drawLog(false);
    });
  }
  /* Đồng bộ state thật từ server — dùng khi decide() gặp 409 (đề xuất đã được xử lý nơi khác). */
  function resyncChat() {
    var targetId = real.chatId;
    if (!targetId) return;
    api('GET', '/api/chats/' + targetId).then(function (x) {
      if (real.chatId !== targetId) return;
      real.chatId = x.id; real.msgs = (x && x.messages) || [];
      toast('Đã tải lại trạng thái mới nhất từ máy chủ.', 'info');
      drawLog(false);
      syncPlayerStatuses(real.msgs);
    }).catch(function (e) { toast('Không đồng bộ được trạng thái: ' + e.message, 'err'); });
  }

  /* ================= Log tin nhắn ================= */
  function emptyState() {
    return h('div', { class: 'ail-empty ail-chat-welcome', style: 'margin:auto;padding:24px 16px' },
      h('span', { class: 'ail-welcome-mark', 'aria-hidden': 'true' }, ico('sparkles')),
      h('h2', { class: 'ail-welcome-title' }, 'Bạn muốn tạo trò chơi ôn tập gì hôm nay?'));
  }
  var THINK_STEPS = ['Đang phân tích yêu cầu…', 'Đang tra cứu thư viện trình chơi…', 'Đang chuẩn bị đề xuất & kiểm tra an toàn…'];
  var thinkTimer = null;
  function stopThink() { if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; } }
  function thinkingEl() {
    var step = 0;
    var lbl = h('span', null, THINK_STEPS[0]);
    stopThink();
    thinkTimer = setInterval(function () {
      if (!lbl.isConnected) return stopThink();
      step = (step + 1) % THINK_STEPS.length;
      lbl.textContent = THINK_STEPS[step];
    }, 1800);
    return h('div', { class: 'm bot', 'aria-live': 'polite' },
      h('span', { class: 'ail-thinking' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')), lbl));
  }
  function msgEl(m) {
    var el = h('div', { class: 'm ' + (m.role === 'user' ? 'user' : 'bot') }, m.text || '');
    if (m.role !== 'bot') return el;
    if (m.simulated) el.appendChild(simPill('Simulated — khuôn có sẵn, chưa gọi model thật'));
    if (m.error) {
      el.appendChild(h('div', { class: 'err', role: 'alert', style: 'margin-top:8px' }, m.error));
      if (m.retryText) el.appendChild(h('div', { class: 'row', style: 'margin-top:8px' },
        btn('Thử lại', 'refresh', { cls: 'sm', title: 'Điền lại nội dung bạn đã gõ và gửi thử',
          onclick: function () { if (!input.value.trim()) input.value = m.retryText; autoResize(); submit(); } })));
      return el;
    }
    if (m.plan) el.appendChild(planCard(m));
    else if (m.proposal) el.appendChild(legacyProposalCard(m));
    return el;
  }
  function drawLog(forceScroll) {
    var wasNearBottom = (log.scrollHeight - log.scrollTop - log.clientHeight) < 120;
    var list = mode === 'real' ? real.msgs : mock.msgs;
    var busy = mode === 'real' ? real.busy : mock.busy;
    main.classList.toggle('is-empty', !list.length && !busy && !(mode === 'real' && real.openErr));
    send.disabled = busy; // khóa nút Gửi khi đang bận (cả hai chế độ)
    stopThink();
    log.replaceChildren();
    if (mode === 'real' && real.openErr) {
      log.appendChild(h('div', { class: 'err', role: 'alert' }, 'Không tải được lịch sử: ' + (real.openErr.e && real.openErr.e.message || 'Có lỗi, thử lại.')));
      log.appendChild(btn('Thử lại', 'refresh', { cls: 'sm', onclick: function () { openChat(real.openErr.id); } }));
    }
    if (!list.length) log.appendChild(emptyState());
    list.forEach(function (m) { log.appendChild(msgEl(m)); });
    if (busy) log.appendChild(thinkingEl());
    if (forceScroll !== false && (forceScroll === true || wasNearBottom || busy)) log.scrollTop = log.scrollHeight;
  }
  function drawAll() { drawHead(); drawBanner(); drawSide(); drawLog(); }

  /* ================= 3a · Gửi tin — Chế độ thật (không mất nội dung khi lỗi) ================= */
  function submit() { if (mode === 'real') submitReal(); else submitMock(); }
  function submitReal() {
    var t = input.value.trim();
    if (real.busy || t.length < 3) return;
    real.busy = true; send.disabled = true;
    real.msgs.push({ role: 'user', text: t });
    input.value = ''; input.style.height = '';
    drawLog(true);
    api('POST', '/api/chat', { chatId: real.chatId, text: t }).then(function (d) {
      real.chatId = d.chatId;
      real.msgs.push(d.reply || { role: 'bot', text: '' });
      drawSide(); // làm mới danh sách tiêu đề chat
    }).catch(function (e) {
      real.msgs.push({ role: 'bot', text: '', error: e.message, retryText: t });
      if (!input.value.trim()) input.value = t; // KHÔNG làm mất nội dung người dùng đã gõ
    }).then(function () {
      real.busy = false; send.disabled = false; drawLog(); focusInput();
    });
  }

  /* ================= 3b · Gửi tin — Mock (cô lập qua runMockComposer) ================= */
  /* Chỉ ĐỌC Catalog thật (không ghi) để nhánh REUSE tham chiếu ID trình chơi đang có trên UI. */
  function ensureCatalog() {
    if (mock.catalog) return Promise.resolve(mock.catalog);
    return Promise.all([
      api('GET', '/api/players?scope=usable').catch(function () { return { players: [] }; }),
      api('GET', '/api/models?scope=usable').catch(function () { return { models: [] }; })
    ]).then(function (r) {
      mock.catalog = { players: (r[0] && r[0].players) || [], models: (r[1] && r[1].models) || [] };
      return mock.catalog;
    });
  }
  function submitMock() {
    var t = input.value.trim();
    if (mock.busy || t.length < 3) return;
    mock.busy = true; send.disabled = true;
    mock.msgs.push({ role: 'user', text: t });
    input.value = ''; input.style.height = '';
    drawLog(true);
    ensureCatalog().then(function (cat) {
      return wait(MOCK_LATENCY).then(function () { return runMockComposer(t, cat); });
    }).then(function (plan) {
      mock.msgs.push({ role: 'bot', text: plan.message || '', plan: plan });
    }).catch(function (e) {
      mock.msgs.push({ role: 'bot', text: '', error: e.message, retryText: t });
      if (!input.value.trim()) input.value = t;
    }).then(function () {
      mock.busy = false; send.disabled = false; drawLog(); focusInput();
    });
  }
  send.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });

  /* ================= 4 · Duyệt đề xuất legacy (Chế độ thật) — decide() ================= */
  function decide(p, action, holder, btns) {
    btns.forEach(function (b) { b.disabled = true; }); // khóa CẢ HAI nút trong lúc gửi
    api('POST', '/api/chats/' + real.chatId + '/proposals/' + p.index + '/' + action).then(function (r) {
      p.status = r.status; if (r.playerId) p.playerId = r.playerId;
      toast(action === 'accept'
        ? 'Đã thêm vào Trình chơi (bản Nháp — chờ Admin duyệt ở HITL 2).'
        : 'Đã bỏ đề xuất này, không lưu gì.', 'ok');
      drawLog();
    }).catch(function (e) {
      if (e.status === 409) { // đã được xử lý nơi khác → tải lại state thật từ server
        toast('Đề xuất đã đổi trạng thái trên máy chủ — đang tải lại cuộc trò chuyện…', 'info');
        resyncChat();
        return;
      }
      btns.forEach(function (b) { b.disabled = false; });
      var old = holder.querySelector('.err'); if (old) old.remove();
      holder.appendChild(errBox(e));
    });
  }
  function legacyProposalCard(m) {
    var p = m.proposal;
    var holder = h('div', { class: 'cardin' });
    holder.appendChild(h('div', { class: 'ail-row' }, h('strong', null, p.name), srcChip(p.source)));
    if (p.description) holder.appendChild(h('p', { class: 'ail-desc', style: 'margin:4px 0 8px' }, p.description));
    var flags = p.flags || [];
    holder.appendChild(h('div', { style: 'font-weight:500;margin:6px 0 4px' },
      flags.length ? 'Cờ cần xem (' + flags.length + ')' : 'Không có cờ cảnh báo'));
    flags.forEach(function (f) {
      holder.appendChild(h('div', { class: 'note', style: 'margin:4px 0' },
        h('div', { style: 'font-weight:500' }, f.label + (f.line ? ' · dòng ' + f.line : '')),
        f.reason ? h('div', null, f.reason) : null,
        f.excerpt ? h('pre', { style: 'margin:4px 0 0;padding:6px 8px;border-radius:var(--jl-radius-sm);background:var(--jl-surface-default);color:var(--jl-text-default);font-family:var(--jl-font-mono,monospace);font-size:var(--jl-font-size-sm);white-space:pre-wrap;overflow-wrap:anywhere' }, f.excerpt) : null));
    });
    var row = h('div', { class: 'row', style: 'margin-top:8px' });
    if (real.chatId != null) {
      row.appendChild(btn('Xem thử', 'play', { cls: 'sm', onclick: function () {
        var w = previewFrame('/api/chats/' + real.chatId + '/proposals/' + p.index + '/try');
        w.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:60vh';
        modal('Xem thử: ' + p.name, flexModalBody([
          h('span', { class: 'meta' }, 'Chạy trong iframe sandbox="allow-scripts" — không chạy cùng nguồn với AI Lab.'),
          w]));
      } }));
    }
    if (p.status === 'pending') {
      var bAcc = btn('Thêm vào Trình chơi', 'check', { cls: 'sm pri', title: 'Lưu thành bản Nháp, Admin duyệt sau (HITL 2)',
        onclick: function () { decide(p, 'accept', holder, [bAcc, bRej]); } });
      var bRej = btn('Không dùng', 'x', { cls: 'sm bad', title: 'Bỏ game này, không lưu gì',
        onclick: function () { decide(p, 'reject', holder, [bAcc, bRej]); } });
      row.appendChild(bAcc); row.appendChild(bRej);
    } else if (p.status === 'accepted') {
      var st = p._playerStatus || 'draft';
      if (st === 'approved') {
        row.appendChild(h('span', { class: 'ail-chip ok' }, 'Đã duyệt & công khai (HITL hoàn tất)'));
        row.appendChild(btn('Ghép thành Ứng dụng', 'grid', { cls: 'sm pri', href: '#/apps/new' }));
      } else if (st === 'pending') {
        row.appendChild(h('span', { class: 'ail-chip warn' }, 'Đang chờ Admin duyệt (HITL 2)'));
        if (ctx.me && ctx.me.role === 'admin' && p.playerId) {
          var bApp = btn('Duyệt & công khai ngay (Admin)', 'check', { cls: 'sm teal', onclick: function () {
            bApp.disabled = true;
            api('POST', '/api/players/' + p.playerId + '/approve').then(function () {
              p._playerStatus = 'approved';
              toast('Đã duyệt & công khai trình chơi!', 'ok');
              drawLog();
            }).catch(function (e) { bApp.disabled = false; toast(e.message, 'err'); });
          } });
          row.appendChild(bApp);
        }
      } else {
        row.appendChild(h('span', { class: 'ail-chip ok' }, 'Đã lưu bản Nháp (HITL 1)'));
        if (p.playerId) {
          var bSub = btn('Gửi duyệt công khai', 'send', { cls: 'sm pri', onclick: function () {
            bSub.disabled = true;
            api('POST', '/api/players/' + p.playerId + '/submit').then(function () {
              p._playerStatus = 'pending';
              toast('Đã gửi duyệt! Chờ Admin phê duyệt (HITL 2).', 'ok');
              drawLog();
            }).catch(function (e) { bSub.disabled = false; toast(e.message, 'err'); });
          } });
          row.appendChild(bSub);
        }
      }
      row.appendChild(btn('Mở trong Trình chơi', 'play', { cls: 'sm ghost', href: '#/players' }));
    } else {
      row.appendChild(h('span', { class: 'ail-chip bad' }, p.status === 'rejected' ? 'Đã bỏ, không lưu' : 'Đã quyết định'));
    }
    holder.appendChild(row);
    return holder;
  }

  /* ================= 5 · Thẻ ApplicationPlan Card (Mock hôm nay, T14 Real sau) ================= */
  function planCard(m) {
    var plan = m.plan || {};
    var ap = plan.application_plan || null;
    var key = DECISIONS[plan.decision] ? plan.decision : 'REFUSE';
    var dec = DECISIONS[key];
    var isMock = mode === 'mock';
    var wrap = h('div', { class: 'cardin' });

    var card = h('div', { class: 'ail-plan-card' },
      h('div', { class: 'ail-plan-head' },
        h('span', { class: 'ail-plan-badge ' + dec.badge }, ico(dec.icon), dec.label),
        ap && ap.name ? h('b', null, ap.name) : null,
        h('span', { class: 'ail-chip', title: 'Phiên bản hợp đồng ApplicationPlan' }, 'Plan v' + (plan.schema_version || '1.0')),
        plan.simulated ? simPill('Simulated — Mock/khuôn, chưa gọi model thật') : null,
        statusChipOf(plan)));
    wrap.appendChild(card);

    /* giải thích ngắn gọn của AI — KHÔNG hiển thị chain-of-thought */
    if (plan.explanation) card.appendChild(h('p', { class: 'meta', style: 'margin:0;padding:12px 18px 2px' }, plan.explanation));
    (plan.errors || []).forEach(function (er) {
      card.appendChild(h('div', { class: 'err', role: 'alert', style: 'margin:10px 18px 0' },
        (er.code ? er.code + ' — ' : '') + (er.message || '')));
    });

    /* ASK_CLARIFY: 1 câu hỏi cụ thể + chip trả lời nhanh (bấm = điền & gửi) */
    if (key === 'ASK_CLARIFY' || !ap) {
      card.appendChild(h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:8px 18px 16px' },
        key !== 'ASK_CLARIFY' ? h('span', { class: 'ail-chip bad' }, 'Không có application_plan — an toàn trước hết.') : null,
        plan.message ? h('p', { style: 'margin:0' }, plan.message) : null,
        key === 'ASK_CLARIFY' ? h('div', { class: 'ail-starters' }, (plan.quick_replies || []).map(function (qr) {
          return h('button', { type: 'button', class: 'ail-starter-chip', title: 'Điền và gửi lại câu trả lời này',
            onclick: function () { input.value = qr; submit(); } }, ico('chevR'), h('span', null, qr));
        })) : null,
        key === 'ASK_CLARIFY' ? h('span', { class: 'meta' }, 'Bấm một gợi ý để điền và gửi lại — AI không đoán mò khi còn mơ hồ.') : null));
      return wrap;
    }

    var qs = null;
    if (ap.exam && ap.exam.content != null) qs = parseQuestionsClient(ap.exam.content);
    card.appendChild(h('div', { class: 'ail-plan-grid' },
      cellPlayer(ap), cellModel(ap), cellQuestions(ap, plan, qs, isMock), cellSafety(ap, plan)));
    if (qs && qs.questions.length) card.appendChild(knowledgeWarn());
    card.appendChild(hitlBar(plan, ap, isMock));
    return wrap;
  }
  function cellPlayer(ap) {
    var p = ap.player || {};
    var reuse = p.mode !== 'generate_new';
    var rows = [reuse
      ? h('span', { class: 'ail-chip teal' }, 'reuse_existing — không sinh HTML mới')
      : h('span', { class: 'ail-chip warn' }, 'generate_new — bản nháp HTML DRAFT')];
    if (reuse) {
      rows.push(h('span', { class: 'meta' }, 'Trình chơi: ' + (p.player_name || '—') + (p.player_id != null ? ' · ID #' + p.player_id : '')));
      rows.push(h('span', { class: 'meta' }, 'Dùng module đã có trong Catalog (đã qua duyệt) — chỉ ghép bộ đề mới, tiết kiệm và ổn định trên lớp.'));
    } else {
      rows.push(h('span', { class: 'meta' }, 'HTML nháp do AI tạo, CHƯA có trong Catalog: bắt buộc check_game, xem thử sandbox và giáo viên duyệt.'));
    }
    return h('div', { class: 'ail-plan-cell' }, h('h4', null, 'Trình chơi'), h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, rows));
  }
  function cellModel(ap) {
    var md = ap.model || null, it = ap.interaction || {};
    var rows = [];
    if (md) {
      rows.push(h('span', { class: 'ail-chip' }, 'Model: ' + (KIND[md.kind] || md.kind || '—') + (md.model_id != null ? ' #' + md.model_id : '')));
      if (md.mapping && Object.keys(md.mapping).length)
        rows.push(h('span', { class: 'meta' }, 'Ánh xạ ô → lớp: ' + Object.keys(md.mapping).map(function (k) { return k + '→' + md.mapping[k]; }).join(', ')));
      if (md.sure != null || md.hold_ms != null)
        rows.push(h('span', { class: 'meta' }, 'Chắc chắn tối thiểu: ' + (md.sure != null ? md.sure : '—') + ' · Giữ dấu hiệu: ' + (md.hold_ms != null ? md.hold_ms + ' ms' : '—')));
    } else {
      rows.push(h('span', { class: 'meta' }, 'Không cần model — chơi bằng chuột/nội dung là đủ.'));
    }
    /* chip nổi bật bắt buộc theo contract: mouse_always_enabled */
    rows.push(it && it.mouse_always_enabled
      ? h('span', { class: 'ail-fallback-pill' }, ico('mouse'), 'Chuột luôn hoạt động (Mouse Fallback)')
      : h('span', { class: 'meta' }, 'Không khai báo mouse_always_enabled — kiểm tra kỹ trước khi dùng cho lớp.'));
    if (it && (it.primary || it.fallback))
      rows.push(h('span', { class: 'meta' }, 'Tương tác chính: ' + (it.primary || '—') + ' · Dự phòng: ' + (it.fallback || '—')));
    return h('div', { class: 'ail-plan-cell' }, h('h4', null, 'Mô hình & Tương tác'), h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, rows));
  }
  function answerLabel(q) {
    if (q.type === 'truefalse') return q.answer === 'T' ? 'Đúng' : 'Sai';
    var c = (q.choices || []).filter(function (x) { return x.key === q.answer; })[0];
    return q.answer + (c && c.text ? ' — ' + c.text : '');
  }
  function questionList(qs) {
    function rowOf(q, i) {
      var ch = q.type === 'truefalse' ? 'Đúng/Sai' : q.choices.map(function (c) { return c.key + '. ' + c.text; }).join(' · ');
      return h('div', null, h('b', null, (i + 1) + '. '), q.text, h('span', { class: 'meta' }, ' — ' + ch + ' · đáp án: ' + answerLabel(q)));
    }
    if (qs.length <= 2) return h('div', { class: 'ail-val-list' }, qs.map(rowOf));
    return h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      h('div', { class: 'ail-val-list' }, qs.slice(0, 2).map(rowOf)),
      h('details', { class: 'ail-q-details' },
        h('summary', null, 'Xem thêm ' + (qs.length - 2) + ' câu hỏi (tổng ' + qs.length + ' câu)'),
        h('div', { class: 'ail-val-list', style: 'margin-top:6px' }, qs.slice(2).map(function (q, idx) { return rowOf(q, idx + 2); }))));
  }
  /* Soạn nhanh bộ đề ngay trên thẻ — chỉ ở Mock Mode; validate tức thì bằng validateQuestionsClient. */
  function questionEditor(plan) {
    var exam = plan.application_plan.exam;
    var box = h('div'), open = false;
    function draw() {
      if (!open) { box.replaceChildren(btn('Chỉnh sửa nhanh bộ đề', 'edit', { cls: 'sm', onclick: function () { open = true; draw(); } })); return; }
      var ta = h('textarea', { class: 'code', spellcheck: 'false', style: 'min-height:140px', 'aria-label': 'Nội dung bộ câu hỏi theo mẫu |' });
      ta.value = exam.content || '';
      var res = h('div', { class: 'ail-val-list', 'aria-live': 'polite' });
      function validate() {
        var r = validateQuestionsClient(ta.value);
        res.replaceChildren(r.valid
          ? h('div', { class: 'ok' }, 'Hợp lệ: ' + r.questions.length + ' câu, đúng cú pháp mẫu “|”.')
          : r.errors.map(function (er) { return h('div', { class: 'bad' }, 'Dòng ' + er.line + ': ' + er.error); }));
        return r;
      }
      ta.addEventListener('input', validate); // kiểm tra cú pháp tức thì khi gõ
      var apply = btn('Dùng bộ đề này', 'check', { cls: 'sm pri', onclick: function () {
        var r = validateQuestionsClient(ta.value);
        if (!r.valid) { validate(); toast('Bộ đề còn dòng chưa hợp lệ — xem danh sách bên dưới.', 'err'); return; }
        exam.content = ta.value; exam.knowledge_review_required = true;
        toast('Đã cập nhật bộ đề trong bản xem trước Mock (chưa ghi dữ liệu thật).', 'ok');
        drawLog();
      } });
      box.replaceChildren(btn('Đóng bộ soạn', 'x', { cls: 'sm', onclick: function () { open = false; draw(); } }),
        h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
          h('small', { class: 'meta' }, QHELP), ta, res),
        h('div', { class: 'row' }, apply));
      validate();
    }
    draw();
    return box;
  }
  function cellQuestions(ap, plan, qs, isMock) {
    var exam = ap.exam || {};
    var rows = [];
    if (exam.mode) rows.push(h('span', { class: 'ail-chip ' + (exam.mode === 'generate_new' ? 'warn' : 'teal') },
      exam.mode === 'generate_new' ? 'Bộ đề mới (chưa lưu vào Bộ đề)' : 'Dùng bộ đề có sẵn' + (exam.exam_id != null ? ' #' + exam.exam_id : '')));
    if (exam.knowledge_review_required) rows.push(h('span', { class: 'meta' }, 'Kiểm duyệt kiến thức: BẮT BUỘC trước khi dùng trên lớp.'));
    if (qs) {
      if (qs.questions.length) rows.push(questionList(qs.questions));
      if (qs.errors.length) rows.push(h('div', { class: 'ail-val-list' },
        qs.errors.map(function (er) { return h('div', { class: 'bad' }, 'Dòng ' + er.line + ': ' + er.error); })));
    } else {
      rows.push(h('span', { class: 'meta' }, 'Kế hoạch không kèm bộ câu hỏi.'));
    }
    rows.push(isMock ? questionEditor(plan)
      : h('span', { class: 'meta' }, 'Chế độ thật: chỉnh sửa bộ đề sau khi kế hoạch được duyệt (T14 sẽ nối API lưu bộ đề).'));
    return h('div', { class: 'ail-plan-cell' }, h('h4', null, 'Bộ câu hỏi'), h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, rows));
  }
  function knowledgeWarn() {
    return h('div', { class: 'ail-knowledge-warn', role: 'note' }, ico('alert'),
      h('span', null, h('b', null, 'Bắt buộc kiểm duyệt kiến thức: '), 'Câu hỏi do AI gợi ý — giáo viên cần kiểm tra lại kiến thức và đáp án trước khi dùng trên lớp.'));
  }
  function cellSafety(ap, plan) {
    var flags = plan.safety_flags || [];
    var rows = [h('span', { class: 'meta' }, 'Quét an toàn: ' + (flags.length ? flags.length + ' cờ cần xem xét.' : 'không có cờ cảnh báo.'))];
    flags.forEach(function (f) {
      rows.push(h('div', { class: 'ail-flag-item' }, ico('alert'),
        h('span', null, (f.label || f.code || 'Cờ cần xem') + (f.reason ? ' — ' + f.reason : ''))));
    });
    rows.push(h('span', { class: 'meta' }, 'HITL 1: bạn duyệt kế hoạch → tạo bản Nháp. HITL 2: Admin duyệt bản Nháp → mới sẵn sàng cho lớp. Không bỏ qua bước nào.'));
    rows.push(h('div', { class: 'row' }, sandboxBtn(ap)));
    return h('div', { class: 'ail-plan-cell' }, h('h4', null, 'An toàn & Phê duyệt (HITL 2 bước)'), h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, rows));
  }
  function sandboxBtn(ap) {
    var p = ap.player || {};
    return btn('Xem thử trong sandbox', 'eye', { cls: 'sm', title: 'Chạy trình chơi trong iframe sandbox="allow-scripts"',
      onclick: function () {
        if (p.mode === 'generate_new' && p.html) {
          modal('Xem thử bản nháp (sandbox)', flexModalBody([
            h('span', { class: 'meta' }, 'Bản nháp DRAFT do AI tạo — iframe sandbox="allow-scripts", không chạy cùng nguồn với AI Lab.'),
            h('iframe', { sandbox: 'allow-scripts', title: 'Xem thử bản nháp DRAFT', srcdoc: p.html })]));
        } else if (p.player_id != null) {
          var w = previewFrame(p.player_id); // previewFrame(urlOrId, onInfo) từ js/list-page.js
          w.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:60vh';
          modal('Xem thử: ' + (p.player_name || 'trình chơi có sẵn'), flexModalBody([
            h('span', { class: 'meta' }, 'Trình chơi từ Catalog chạy trong iframe sandbox="allow-scripts".'),
            w]));
        } else {
          toast('Kế hoạch không có HTML nháp và không có trình chơi để xem thử.', 'err');
        }
      } });
  }
  function hitlBar(plan, ap, isMock) {
    var bar = h('div', { class: 'ail-hitl-bar' });
    var decided = plan._decided; // trạng thái HITL cục bộ của phiên Mock — không bao giờ là 'approved'
    if (decided === 'accepted_mock') {
      bar.appendChild(h('span', { class: 'ail-chip ok' }, 'Đã tạo bản Nháp (bản trình diễn Mock — chưa ghi dữ liệu thật)'));
      bar.appendChild(h('span', { class: 'meta' }, 'Khi T08/T14 nối thật: bản Nháp vào hàng chờ Admin duyệt (HITL 2) trước khi dùng cho lớp.'));
      return bar;
    }
    if (decided === 'rejected_mock') {
      bar.appendChild(h('span', { class: 'ail-chip bad' }, 'Đã yêu cầu chỉnh sửa / từ chối (Mock demo)' + (plan._rejectReason ? ' — ' + plan._rejectReason : '')));
      bar.appendChild(h('span', { class: 'meta' }, 'Gửi một yêu cầu khác để xem nhánh xử lý mới.'));
      return bar;
    }
    bar.appendChild(h('span', { class: 'meta', style: 'margin-right:auto' }, 'Chưa có quyết định của bạn — không có gì được lưu hay công khai.'));
    if (!isMock) {
      /* Chế độ thật: HITL kế hoạch chờ T08/T14 — hiển thị trạng thái rõ thay vì nút disabled gây hiểu nhầm hỏng. */
      bar.appendChild(h('span', { class: 'ail-chip warn' }, ico('shield'), 'HITL 1 — chờ nối API duyệt (T08/T14)'));
      return bar;
    }
    bar.appendChild(btn('Duyệt kế hoạch (HITL 1 — tạo bản Nháp)', 'check', { cls: 'sm pri',
      title: 'Chỉ tạo bản Nháp trình diễn trong phiên Mock — không tự duyệt, không công khai.',
      onclick: function () {
        plan._decided = 'accepted_mock';
        toast('Đã tạo bản Nháp demo (Mock). Bản nháp thật sẽ do Admin duyệt ở HITL 2 khi T08/T14 nối.', 'info');
        drawLog();
      } }));
    bar.appendChild(btn('Yêu cầu chỉnh sửa / Từ chối', 'x', { cls: 'sm bad', title: 'Ghi nhận lý do của bạn trong phiên Mock',
      onclick: function () {
        promptModal('Yêu cầu chỉnh sửa / Từ chối kế hoạch', 'Lý do của bạn (chỉ ghi cục bộ trong phiên Mock, không gửi đi đâu):',
          { confirmLabel: 'Gửi yêu cầu', fieldLabel: 'Lý do', placeholder: 'Ví dụ: bộ câu hỏi chưa đúng chủ đề, cách chơi chưa phù hợp lớp…', maxLen: 300 })
          .then(function (reason) {
            if (reason == null) return;
            plan._decided = 'rejected_mock'; plan._rejectReason = reason;
            toast('Đã ghi nhận yêu cầu chỉnh sửa/từ chối (Mock demo).', 'info');
            drawLog();
          });
      } }));
    return bar;
  }

  /* ---------- gắn vào shell và vẽ lần đầu ---------- */
  mountFn(h('div', { class: 'ail-chat-wrap' }, main));
  drawAll();
}
