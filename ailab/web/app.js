/* app.js — entrypoint ES module của AI Game Composer (JULY AI Lab).
   Shell mới khớp style.css: sidebar trái cố định trên desktop (thương hiệu "AI Game Composer",
   nhóm Chính / Thư viện / Quản trị, footer user + Đăng xuất), topbar mobile với nút mở drawer
   (.ail-mobile-btn + .ail-drawer-scrim, đóng bằng Escape hoặc khi chuyển trang).
   Route mặc định khi đăng nhập là #/home (trước đây là #/models). Giữ 100% tương thích mọi
   hash route cũ (#/models, #/players, #/exams, #/apps, #/chat, #/admin, kèm /new, /:id)
   và alias #/assistant -> #/chat. Hết phiên 401 tự động quay về màn đăng nhập. */

import { h, api, ico, toast, setOnUnauthorized } from './js/dom.js';
import { stopTry } from './js/list-page.js';
import { homeView, modelsView, playersView, examsView, appsView, adminView, loginView } from './js/views-core.js';
import { chatView } from './js/views-assistant.js';

var root = document.getElementById('app');
var me = null, llmMode = '', curTab = 'chat';
var railExpanded = sessionStorage.getItem('ail.rail') === '1';

/* ---------- định nghĩa điều hướng (khớp 100% spec.md §4: Teacher Workspace + Thư viện Catalog) ---------- */
var NAV_MAIN = [['chat', 'Soạn trò chơi', 'chat'], ['apps', 'Trò chơi của tôi', 'grid'], ['exams', 'Bộ câu hỏi', 'edit']];
var NAV_CATALOG = [['players', 'Kho mẫu game', 'play'], ['models', 'Mô hình tương tác', 'cube']];
var TITLES = { chat: '', apps: 'Trò chơi của tôi', exams: 'Bộ câu hỏi', players: 'Kho mẫu game', models: 'Mô hình tương tác', admin: 'Quản trị', home: 'Tổng quan' };
var LIST_TABS = ['models', 'players', 'exams', 'apps'];

/* Logo nhóm 4ChangLinhNguLam (huy hiệu 4 cánh + khiên học thuật) */
function teamLogo() {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M12 2.5L20 6v6c0 4.8-3.4 8.3-8 9.5C7.4 20.3 4 16.8 4 12V6l8-3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5l1.6 3.9 3.9 1.6-3.9 1.6-1.6 3.9-1.6-3.9-3.9-1.6 3.9-1.6z" fill="currentColor"/>';
  return s;
}

/* ctx chia cho các view; tạo mới mỗi lần route để me/llmMode luôn tươi */
function ctx() {
  return { me: me, llmMode: llmMode, mount: mount, listMount: listMount, route: route, onLogin: onLogin, openDrawer: openDrawer };
}
function mount(el) {
  var m = document.getElementById('main');
  if (!m) return;
  if (curTab === 'chat') {
    m.className = 'ail-main is-chat';
    m.replaceChildren(el);
    return;
  }
  m.className = 'ail-main';
  m.replaceChildren(h('div', { class: 'ail-page' + (curTab === 'home' || curTab === 'admin' ? ' wide' : '') }, el));
}
function listMount(title, page) {
  var m = document.getElementById('main');
  if (!m) return;
  m.className = 'ail-main is-list';
  m.replaceChildren(h('h1', { class: 'sr' }, title), page);
}

/* ---------- drawer mobile: mở/đóng sidebar trượt, đóng khi chuyển trang hoặc Escape ---------- */
var sidebarEl = null, scrimEl = null, mobileBtn = null;
function drawerOpen() { return !!(sidebarEl && sidebarEl.classList.contains('is-open')); }
function closeDrawer() {
  if (!drawerOpen()) return;
  sidebarEl.classList.remove('is-open');
  if (scrimEl) scrimEl.classList.remove('is-open');
  if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
}
function openDrawer() {
  sidebarEl.classList.add('is-open');
  if (scrimEl) scrimEl.classList.add('is-open');
  if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'true');
}

/* ---------- shell: sidebar (icon-rail thu gọn mặc định) + topbar + vùng nội dung ---------- */
function navGroup(label, items) {
  return h('div', { class: 'ail-nav-group' },
    h('div', { class: 'ail-nav-label' }, label),
    items.map(function (it) {
      return h('a', { href: '#/' + it[0], title: it[1], 'aria-label': it[1], class: 'ail-nav-item' + (curTab === it[0] ? ' on' : ''), 'aria-current': curTab === it[0] ? 'page' : null }, ico(it[2]), h('span', { class: 'ail-nav-text' }, it[1]));
    }));
}

function toggleRail() {
  railExpanded = !railExpanded;
  sessionStorage.setItem('ail.rail', railExpanded ? '1' : '0');
  if (sidebarEl) sidebarEl.classList.toggle('is-collapsed', !railExpanded);
}

function shell(cur, isList) {
  curTab = cur;
  var groups = [navGroup('Chính', NAV_MAIN), navGroup('Thư viện', NAV_CATALOG)];
  var userPop = h('div', { class: 'ail-user-pop is-hidden', role: 'menu' },
    h('div', { class: 'ail-user-pop-head' },
      h('b', null, me.username),
      h('span', null, me.role === 'admin' ? 'Quản trị viên' : 'Giáo viên')),
    h('button', { type: 'button', class: 'ail-btn bad sm', style: 'justify-content:flex-start', role: 'menuitem', onclick: function () { userPop.classList.add('is-hidden'); logout(); } }, ico('logout'), 'Đăng xuất'));
  var userBtn = h('button', { type: 'button', class: 'ail-user-btn', title: me.username + ' — Nhấn để mở tùy chọn tài khoản', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: function (e) {
    e.stopPropagation();
    var open = userPop.classList.toggle('is-hidden');
    userBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
  } },
    h('span', { class: 'ail-user-avatar', 'aria-hidden': 'true' }, String(me.username || '?').charAt(0).toUpperCase()),
    h('span', { class: 'ail-user-txt' },
      h('span', { class: 'ail-user-name', style: 'display:block' }, me.username),
      h('span', { class: 'ail-user-mail', style: 'display:block' }, me.role === 'admin' ? 'Admin' : 'Giáo viên')));
  var footEl = h('div', { class: 'ail-sidebar-foot' }, userBtn, userPop);
  document.addEventListener('click', function onUserAway(e) {
    if (!footEl.isConnected) return document.removeEventListener('click', onUserAway);
    if (!footEl.contains(e.target)) { userPop.classList.add('is-hidden'); userBtn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', function onUserEsc(e) {
    if (!footEl.isConnected) return document.removeEventListener('keydown', onUserEsc);
    if (e.key === 'Escape') { userPop.classList.add('is-hidden'); userBtn.setAttribute('aria-expanded', 'false'); }
  });
  sidebarEl = h('aside', { class: 'ail-sidebar' + (railExpanded ? '' : ' is-collapsed'), id: 'ail-sidebar', 'aria-label': 'Điều hướng chính' },
    h('button', { type: 'button', class: 'ail-brand', title: 'AI Game Composer — Nhấn để mở rộng / thu gọn thanh bên', 'aria-expanded': railExpanded ? 'true' : 'false', onclick: function () {
      if (window.innerWidth <= 900) closeDrawer();
      else toggleRail();
    } },
      h('span', { class: 'ail-brand-mark', 'aria-hidden': 'true' }, teamLogo()),
      h('span', { class: 'ail-brand-txt' },
        h('span', { class: 'ail-brand-name' }, 'AI Game Composer'),
        h('span', { class: 'ail-brand-sub' }, '4ChangLinhNguLam'))),
    h('nav', { class: 'ail-nav' }, groups),
    footEl);
  scrimEl = h('div', { class: 'ail-drawer-scrim', 'aria-hidden': 'true', onclick: closeDrawer });
  mobileBtn = h('button', { type: 'button', class: 'ail-mobile-btn', 'aria-label': 'Mở menu điều hướng', 'aria-expanded': 'false', 'aria-controls': 'ail-sidebar', onclick: function () { drawerOpen() ? closeDrawer() : openDrawer(); } }, ico('menu'));
  var llmOk = llmMode && llmMode !== 'giả';
  var topTitle = TITLES[cur];
  var showTopbar = cur !== 'chat';
  root.className = 'ail-shell';
  root.replaceChildren(sidebarEl,
    h('div', { class: 'ail-content' },
      showTopbar ? h('header', { class: 'ail-topbar' },
        mobileBtn,
        topTitle ? h('h1', { class: 'ail-top-title' }, topTitle) : null,
        h('div', { class: 'ail-top-actions' },
          h('span', { class: 'ail-llm-pill ' + (llmOk ? 'is-ok' : 'is-mock'), title: 'Chế độ model hiện hành' }, 'Model AI: ' + (llmMode || '…')))) : null,
      h('main', { class: 'ail-main' + (isList ? ' is-list' : cur === 'chat' ? ' is-chat' : ''), id: 'main' })),
    scrimEl);
}

/* ---------- phiên đăng nhập ---------- */
function onLogin(user) {
  me = user;
  toast('Đăng nhập thành công. Xin chào, ' + user.username + '!', 'ok');
  api('GET', '/api/me').then(function (d) {
    if (d && d.llm) llmMode = d.llm;
  }).catch(function () {}).then(function () {
    /* hash rỗng: vào thẳng Trợ lý Game #/chat */
    if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/chat';
    else route();
  });
}
function logout() {
  api('POST', '/api/logout').then(function () {
    me = null;
    stopTry();
    toast('Đã đăng xuất.', 'ok');
    loginView(ctx());
  }).catch(function (e) { toast((e && e.message) || 'Không đăng xuất được, thử lại.', 'err'); });
}
/* 401 giữa chừng (hết phiên): quay về màn đăng nhập. 401 ở chính màn đăng nhập
   (sai mật khẩu) thì giữ nguyên form để người dùng thử lại. */
setOnUnauthorized(function () {
  if (!me) return;
  me = null;
  stopTry();
  closeDrawer();
  toast('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 'err');
  loginView(ctx());
});

/* ---------- định tuyến ---------- */
function route() {
  stopTry();
  closeDrawer();
  if (!me) { loginView(ctx()); return; }
  var hash = location.hash.replace(/^#\/?/, '');
  var parts = hash ? hash.split('/') : [];
  var key = parts[0] || 'chat';
  if (key === 'assistant') { location.replace('#/chat'); return; } /* alias cũ → Trợ lý Game */
  var views = { home: homeView, models: modelsView, players: playersView, exams: examsView, apps: appsView, chat: chatView, admin: adminView };
  var view = views[key];
  if (!view) { location.replace('#/chat'); return; } /* hash lạ → về Trợ lý Game */
  var isList = LIST_TABS.indexOf(key) >= 0 && !parts[1];
  shell(key, isList);
  view(ctx(), parts);
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
window.addEventListener('hashchange', route);

function start() {
  if (!location.hash || location.hash === '#') location.hash = '#/chat'; /* vào thẳng Trợ lý Game */
  else route();
}
api('GET', '/api/me').then(function (d) { me = d.user; llmMode = d.llm; start(); }).catch(function () { loginView(ctx()); });
