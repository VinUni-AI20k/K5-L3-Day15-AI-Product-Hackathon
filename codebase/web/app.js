"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TZ = "Asia/Ho_Chi_Minh";

const STATUS = {
  pending: "Đang soạn", written: "Chờ duyệt", flagged: "Bị đánh dấu",
  scheduled: "Đã lên lịch", rejected: "Đã bỏ", error: "Lỗi hệ thống",
};
const FIELD = {
  ma_sp: "Mã", ten_sp: "Tên", loai: "Loại", gia_ban: "Giá bán", gia_te: "Giá tệ", size: "Size", mau: "Màu",
  chat_lieu: "Chất liệu", mo_ta: "Mô tả", page: "Page", prompt: "Yêu cầu viết", ton_kho: "Tồn kho",
  bai_viet: "Bài viết", he_thong: "Hệ thống", dong: "Dòng",
};
const FIXABLE = ["gia_ban", "gia_te", "size", "mau", "chat_lieu", "mo_ta", "prompt", "ten_sp"];
const SWATCH = { "nang-tho": "#8c3b5e", "diu-may": "#3f74a3", "pho-xinh": "#c46a1c", "thanh-lich": "#4f6b3a", "tu-tin": "#6d4fa0" };
const FILTERS = [["all", "Tất cả"], ["written", "Chờ duyệt"], ["flagged", "Bị đánh dấu"], ["scheduled", "Đã lên lịch"], ["rejected", "Đã bỏ"]];

const state = { pages: {}, batch: null, sel: null, filter: "all", poll: null, weekOffset: 0, dirty: false };

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  const body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error(body?.detail || body || r.statusText);
  return body;
}
const post = (path, data) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data || {}) });

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}

const fmtSlot = (iso) => new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, weekday: "long", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const pageName = (id) => state.pages[id]?.name || id || "—";

/* ---------------- tabs ---------------- */
function show(view) {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
  if (view === "calendar") loadCalendar();
  if (view === "upload") loadBatches();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

/* ---------------- meta + upload ---------------- */
async function loadMeta() {
  const m = await api("/api/meta");
  $("#meta").innerHTML = `<span>Model <b>${esc(m.model)}</b></span><span>Lên lịch <b>${m.facebook ? "Fanpage thử" : "trong app"}</b></span>`;
  $("#inv-info").innerHTML = `Đang dùng <b>${esc(m.inventory.file)}</b>: ${m.inventory.codes} mã, ${m.inventory.variants} biến thể màu × size.`;
}

async function loadPages() {
  const ps = await api("/api/pages");
  ps.forEach((p) => (state.pages[p.id] = p));
  $("#default-page").innerHTML = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (giá sàn ${(p.floor_vnd / 1000).toLocaleString("vi-VN")}k)</option>`).join("");
  $("#default-page").value = "diu-may";
}

async function loadBatches() {
  const bs = await api("/api/batches");
  $("#batches").innerHTML = bs.length ? bs.map((b) => `<li><button data-id="${b.id}">
      <b>${esc(b.filename)}</b>
      <span class="counts">${b.counts.total} dòng: ${b.counts.written || 0} chờ duyệt, ${b.counts.flagged || 0} bị đánh dấu, ${b.counts.scheduled || 0} đã lên lịch</span>
    </button></li>`).join("") : `<li class="muted">Chưa có file nào.</li>`;
  $("#batches").querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => openBatch(+btn.dataset.id)));
}

const dz = $("#dropzone"), fileIn = $("#file");
fileIn.addEventListener("change", () => ($("#file-name").textContent = fileIn.files[0]?.name || "hoặc bấm để chọn file, tối đa 200 dòng"));
["dragenter", "dragover"].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach((e) => dz.addEventListener(e, () => dz.classList.remove("over")));
dz.addEventListener("drop", (ev) => {
  ev.preventDefault();
  if (ev.dataTransfer.files.length) { fileIn.files = ev.dataTransfer.files; fileIn.dispatchEvent(new Event("change")); }
});

$("#upload-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("#upload-error").textContent = "";
  if (!fileIn.files[0]) return ($("#upload-error").textContent = "Chọn một file .xlsx hoặc .csv trước.");
  const fd = new FormData();
  fd.append("file", fileIn.files[0]);
  fd.append("default_page", $("#default-page").value);
  const btn = $("#upload-btn");
  btn.disabled = true;
  btn.textContent = "Đang gửi file…";
  try {
    const r = await api("/api/batches", { method: "POST", body: fd });
    toast(`Đã nhận ${r.rows} dòng, đang soạn bài`);
    await openBatch(r.id);
  } catch (e) {
    $("#upload-error").textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Soạn bài cho cả file";
  }
});

$("#inv-file").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  $("#inv-error").textContent = "";
  const fd = new FormData();
  fd.append("file", f);
  try {
    const r = await api("/api/inventory", { method: "POST", body: fd });
    toast(`Đã cập nhật tồn: ${r.variants} biến thể`);
    loadMeta();
  } catch (e) {
    $("#inv-error").textContent = e.message;
  }
  ev.target.value = "";
});

/* ---------------- review ---------------- */
async function openBatch(id) {
  state.sel = null;
  state.filter = "all";
  await refreshBatch(id);
  show("review");
  const first = state.batch.rows[0];
  if (first) select(first.id);
}

async function refreshBatch(id = state.batch?.id) {
  if (!id) return;
  state.batch = await api("/api/batches/" + id);
  renderReview();
  clearTimeout(state.poll);
  if (state.batch.rows.some((r) => r.status === "pending")) state.poll = setTimeout(() => refreshBatch(), 1500);
}

function visibleRows() {
  const rows = state.batch?.rows || [];
  if (state.filter === "all") return rows;
  if (state.filter === "flagged") return rows.filter((r) => r.status === "flagged" || r.status === "error");
  return rows.filter((r) => r.status === state.filter);
}

function priceText(d) {
  return d.gia_ban || "—";
}

function renderReview() {
  const b = state.batch;
  const c = b.counts;
  const done = c.total - (c.pending || 0);
  $("#batch-title").textContent = b.filename;
  $("#batch-sub").textContent = `${done}/${c.total} dòng đã xử lý. Page mặc định: ${pageName(b.default_page)}. Đã dùng ${(c.tokens_in + c.tokens_out).toLocaleString("vi-VN")} token.`;

  $("#filters").innerHTML = FILTERS.map(([k, label]) => {
    const n = k === "all" ? c.total : k === "flagged" ? (c.flagged || 0) + (c.error || 0) : c[k] || 0;
    return `<button data-f="${k}" aria-pressed="${state.filter === k}">${label}<span class="n">${n}</span></button>`;
  }).join("");
  $("#filters").querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => { state.filter = btn.dataset.f; renderReview(); }));

  $("#tape").innerHTML = b.rows.map((r) => `<button class="s-${r.status} ${r.status !== "pending" ? "done" : ""} ${r.id === state.sel ? "sel" : ""}"
      data-id="${r.id}" title="Dòng ${r.idx}: ${esc(r.data.ten_sp || r.data.ma_sp)} (${STATUS[r.status]})" aria-label="Dòng ${r.idx}, ${STATUS[r.status]}">
      ${r.idx % 5 === 0 || r.idx === 1 ? `<span class="num">${r.idx}</span>` : ""}<span class="pin"></span></button>`).join("");
  $("#tape").querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => { state.filter = "all"; select(+btn.dataset.id); }));

  const rows = visibleRows();
  $("#rack").innerHTML = rows.length ? rows.map((r) => {
    const why = r.status === "flagged" || r.status === "error" ? (r.reasons[0] ? `${FIELD[r.reasons[0][0]] || r.reasons[0][0]}: ${r.reasons[0][1]}` : "")
      : r.status === "scheduled" ? fmtSlot(r.slot) : r.status === "pending" ? "đang soạn…"
      : r.status === "written" && !r.images.length ? "chưa có ảnh, chưa duyệt được" : pageName(r.page_id);
    return `<li class="s-${r.status}"><button data-id="${r.id}" aria-current="${r.id === state.sel}">
        <span class="dot s-${r.status}" aria-hidden="true"></span>
        <span class="name">${esc(r.data.ten_sp || r.data.ma_sp || "Dòng " + r.idx)}</span>
        <span class="price">${esc(priceText(r.data))}</span>
        <span class="why">${esc(why)}</span>
      </button></li>`;
  }).join("") : `<li class="muted" style="padding:14px">Không có dòng nào ở mục này.</li>`;
  $("#rack").querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => select(+btn.dataset.id)));

  if (state.sel && !state.dirty) renderDetail();
}

function current() {
  return state.batch?.rows.find((r) => r.id === state.sel);
}

function select(id) {
  if (state.dirty && !confirm("Bài đang sửa chưa lưu. Bỏ bản sửa?")) return;
  state.dirty = false;
  state.sel = id;
  renderReview();
  renderDetail();
  $(`#rack button[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
}

function chips(all, kept) {
  if (!all.length) return `<span class="muted">—</span>`;
  return `<span class="chips">${all.map((v) => `<span class="chip ${kept && !kept.includes(v) ? "gone" : ""}" ${kept && !kept.includes(v) ? 'title="Hết hàng, bài không nhắc"' : ""}>${esc(v)}</span>`).join("")}</span>`;
}

function photoGrid(images) {
  if (!images.length) return "";
  const shown = images.slice(0, 4);
  return `<div class="imgs n${shown.length}">${shown.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">
      <img src="${esc(u)}" alt="Ảnh sản phẩm ${i + 1}" loading="lazy" onerror="this.parentElement.remove()">${i === 3 && images.length > 4 ? `<span class="more">+${images.length - 4}</span>` : ""}</a>`).join("")}</div>`;
}

function renderDetail() {
  const r = current();
  const el = $("#detail");
  if (!r) { el.innerHTML = `<p class="empty">Chọn một dòng bên trái.</p>`; return; }
  const d = r.data;
  const bad = new Set(r.reasons.map((x) => x[0]));
  const colors = (d.mau || "").split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
  const keptColors = r.status === "written" || r.status === "scheduled" ? r.colors : null;
  const keptSizes = r.status === "written" || r.status === "scheduled" ? r.sizes : null;
  const val = (f, html) => {
    const raw = d[f];
    if (!raw) return `<dd class="${bad.has(f) ? "empty-val" : "muted"}">${bad.has(f) ? "trống" : "—"}</dd>`;
    return `<dd class="${bad.has(f) ? "bad" : ""}">${html ?? esc(raw)}</dd>`;
  };
  const pid = r.page_id || d.page || state.batch.default_page;
  const sw = SWATCH[pid] || "#888";

  const tag = `<div class="tag"><dl>
      <dt>Giá bán</dt>${val("gia_ban", `<span class="price">${esc(d.gia_ban)}</span>`)}
      <dt>Giá tệ</dt>${val("gia_te")}
      <dt>Size</dt>${val("size", keptSizes ? `${esc(d.size)}<br><span class="small muted">còn: ${esc(keptSizes.join(", "))}</span>` : esc(d.size))}
      <dt>Màu</dt>${d.mau ? `<dd class="${bad.has("mau") ? "bad" : ""}">${chips(colors, keptColors)}</dd>` : val("mau")}
      <dt>Chất liệu</dt>${val("chat_lieu")}
      <dt>Loại</dt>${val("loai")}
      <dt>Mô tả</dt>${val("mo_ta")}
      <dt>Yêu cầu</dt>${val("prompt")}
      <dt>Tồn kho</dt><dd class="${bad.has("ton_kho") ? "bad" : ""}">${bad.has("ton_kho") ? "không soạn" : r.status === "pending" ? "…" : "còn hàng"}</dd>
    </dl></div>`;

  const notes = [
    ...r.reasons.map(([f, m]) => `<li class="reason"><b>${esc(FIELD[f] || f)}:</b> ${esc(m)}</li>`),
    ...r.warnings.map((w) => { const i = w.indexOf(":"); const f = w.slice(0, i); return `<li class="warn"><b>${esc(FIELD[f] || f)}:</b>${esc(w.slice(i + 1))}</li>`; }),
  ].join("");

  const postCard = (editable) => `<div class="post">
      <div class="post-head"><span class="avatar" style="background:${sw}">${esc(pageName(pid).slice(0, 1))}</span>
        <div><b>${esc(pageName(pid))}</b><small>${r.slot ? "Hẹn " + esc(fmtSlot(r.slot)) : "Bản nháp"}</small></div></div>
      ${editable ? `<textarea id="post-text" aria-label="Nội dung bài">${esc(r.text)}</textarea>` : `<div class="ro">${esc(r.text)}</div>`}
      ${photoGrid(r.images)}
    </div>`;
  const canEditPhotos = ["written", "flagged", "rejected", "error"].includes(r.status);
  const photos = canEditPhotos ? `<div class="photos">
      <div class="photos-head"><h3>Ảnh sản phẩm <span class="muted small">${r.images.length}/10</span></h3>
        <label class="btn ghost file-btn"><input type="file" id="img-file" accept="image/jpeg,image/png,image/webp" multiple>Thêm ảnh</label></div>
      ${r.images.length ? `<ul class="thumbs">${r.images.map((u) => `<li><img src="${esc(u)}" alt="" loading="lazy" onerror="this.parentElement.remove()"><button class="rm" data-url="${esc(u)}" aria-label="Xoá ảnh này">×</button></li>`).join("")}</ul>`
        : `<p class="no-photo">Chưa có ảnh. Bài cần ít nhất 1 ảnh sản phẩm mới duyệt được.</p>`}
    </div>` : "";

  let right = "";
  if (r.status === "written") {
    right = `${postCard(true)}
      <p class="check" id="check">${r.edited ? "Đã có bản sửa của bạn." : `Máy đã soát giá, size, màu, chất liệu và cụm cấm (${r.attempts} lần viết).`}</p>
      ${photos}
      <div class="row-actions">
        <button class="btn primary" id="approve" ${r.images.length ? "" : 'disabled title="Thêm ít nhất 1 ảnh trước khi duyệt"'}>Duyệt và lên lịch</button>
        <button class="btn ghost" id="save" disabled>Lưu bản sửa</button>
        <button class="btn ghost" id="regen">Viết lại</button>
        <button class="btn danger" id="reject">Bỏ bài</button>
      </div>
      <details class="when-box"><summary class="small">Chọn giờ đăng khác (mặc định: khung trống gần nhất của page)</summary>
        <div class="when"><input type="datetime-local" id="when"><span class="small muted">Khung của page: ${esc((state.pages[pid]?.slots || []).join(", "))}</span></div>
      </details>
      <p class="kbd"><kbd>A</kbd> duyệt, <kbd>↑</kbd> <kbd>↓</kbd> chuyển dòng</p>`;
  } else if (r.status === "flagged" || r.status === "error") {
    const fix = Array.from(new Set([...r.reasons.map((x) => x[0]).filter((f) => FIXABLE.includes(f)), "prompt"]));
    const stockNote = bad.has("ton_kho") ? `<p class="small">Tồn kho do file tồn quyết định: cập nhật file tồn ở màn Tải file rồi bấm “Sửa và soạn lại”.</p>` : "";
    right = `<div class="fixer">
        <h3>Sửa dữ liệu rồi soạn lại</h3>${stockNote}
        <div class="grid2">${fix.map((f) => `<label class="field"><span>${esc(FIELD[f])}</span>
          ${f === "mo_ta" || f === "prompt" ? `<textarea rows="3" data-f="${f}">${esc(d[f])}</textarea>` : `<input data-f="${f}" value="${esc(d[f])}">`}</label>`).join("")}</div>
        <div class="row-actions">
          <button class="btn primary" id="fix">Sửa và soạn lại</button>
          <button class="btn danger" id="reject">Bỏ dòng này</button>
        </div>
      </div>${photos}`;
  } else if (r.status === "scheduled") {
    right = `${postCard(false)}
      <p class="check ok">Đã lên lịch ${esc(fmtSlot(r.slot))} trên ${esc(pageName(pid))} (${r.schedule_mode === "facebook" ? "đã hẹn giờ trên Facebook" : "lịch trong app"}).</p>
      <div class="row-actions"><button class="btn ghost" id="unschedule">Huỷ lịch</button></div>`;
  } else if (r.status === "rejected") {
    right = `${r.text ? postCard(false) : ""}<div class="row-actions"><button class="btn ghost" id="regen">Soạn lại dòng này</button></div>`;
  } else {
    right = `<p class="muted">Đang kiểm dữ liệu, tồn kho và soạn bài…</p>`;
  }

  el.innerHTML = `<div class="d-head">
      <div><h2>${esc(d.ten_sp || d.ma_sp || "Dòng " + r.idx)}</h2>
        <div class="sub"><span>${esc(d.ma_sp || "chưa có mã")}</span><span><span class="swatch" style="background:${sw}"></span>${esc(pageName(pid))}</span><span>dòng ${r.idx} trong file</span></div></div>
      <span class="status s-${r.status}">${STATUS[r.status]}</span>
    </div>
    ${notes ? `<ul class="notes">${notes}</ul>` : ""}
    <div class="d-grid">${tag}<div style="display:grid;gap:12px">${right}</div></div>`;
  wireDetail(r);
}

function wireDetail(r) {
  const ta = $("#post-text");
  if (ta) ta.addEventListener("input", () => { state.dirty = ta.value !== r.text; $("#save").disabled = !state.dirty; });
  $("#save")?.addEventListener("click", () => saveEdit(r));
  $("#approve")?.addEventListener("click", () => approve(r));
  $("#reject")?.addEventListener("click", () => act(r, "reject", "Đã bỏ"));
  $("#regen")?.addEventListener("click", () => act(r, "regenerate", "Đang soạn lại"));
  $("#unschedule")?.addEventListener("click", () => act(r, "unschedule", "Đã huỷ lịch"));
  $("#img-file")?.addEventListener("change", async (ev) => {
    const fd = new FormData();
    [...ev.target.files].forEach((f) => fd.append("files", f));
    try {
      await api(`/api/rows/${r.id}/images`, { method: "POST", body: fd });
      toast(`Đã thêm ${ev.target.files.length} ảnh`);
      state.dirty = false;
      await refreshBatch();
    } catch (e) { toast(e.message); }
  });
  document.querySelectorAll("#detail .rm").forEach((b) => b.addEventListener("click", () => act(r, "images/remove", "Đã xoá ảnh", { url: b.dataset.url })));
  $("#fix")?.addEventListener("click", async () => {
    const fields = {};
    document.querySelectorAll("#detail [data-f]").forEach((i) => (fields[i.dataset.f] = i.value));
    await act(r, "regenerate", "Đang soạn lại với dữ liệu mới", { fields });
  });
}

async function saveEdit(r) {
  const text = $("#post-text").value;
  try {
    const res = await api("/api/rows/" + r.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    state.dirty = false;
    await refreshBatch();
    const c = $("#check");
    if (c) {
      c.className = "check " + (res.check.block.length ? "bad" : "ok");
      c.textContent = res.check.block.length ? "Bản sửa có chỗ lệch file: " + res.check.block.join("; ") + ". Bạn vẫn có thể duyệt nếu chắc chắn." : "Đã lưu. Bản sửa khớp dữ liệu trong file.";
    }
    return res;
  } catch (e) { toast(e.message); }
}

async function approve(r) {
  if (state.dirty) await saveEdit(r);
  const when = $("#when")?.value;
  try {
    const res = await post(`/api/rows/${r.id}/approve`, when ? { when } : {});
    toast("Đã lên lịch " + fmtSlot(res.slot));
    await refreshBatch();
    const next = visibleRows().find((x) => x.status === "written" && x.id !== r.id);
    if (next) select(next.id);
  } catch (e) { toast(e.message); }
}

async function act(r, action, msg, body) {
  try {
    await post(`/api/rows/${r.id}/${action}`, body);
    state.dirty = false;
    toast(msg);
    await refreshBatch();
  } catch (e) { toast(e.message); }
}

document.addEventListener("keydown", (ev) => {
  if ($("#view-review").hidden || ev.target.closest("input, textarea, select") || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const rows = visibleRows();
  const i = rows.findIndex((r) => r.id === state.sel);
  if (ev.key === "ArrowDown" || ev.key === "j") { ev.preventDefault(); if (rows[i + 1]) select(rows[i + 1].id); }
  if (ev.key === "ArrowUp" || ev.key === "k") { ev.preventDefault(); if (i > 0) select(rows[i - 1].id); }
  if (ev.key === "a" || ev.key === "A") { const r = current(); if (r?.status === "written") approve(r); }
});

/* ---------------- calendar ---------------- */
function ymd(dt) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(dt);
}
async function loadCalendar() {
  const start = new Date(Date.now() + state.weekOffset * 7 * 86400000);
  const res = await api(`/api/schedule?start=${ymd(start)}&days=7`);
  const days = [...Array(7)].map((_, i) => new Date(start.getTime() + i * 86400000));
  const byDay = {};
  res.posts.forEach((p) => (byDay[ymd(new Date(p.slot))] ||= []).push(p));
  $("#cal-sub").textContent = `${res.posts.length} bài đã lên lịch trong 7 ngày từ ${new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(start)}.`;
  $("#legend").innerHTML = Object.values(state.pages).map((p) => `<span><span class="swatch" style="background:${SWATCH[p.id]}"></span>${esc(p.name)}</span>`).join("");
  const today = ymd(new Date());
  $("#week").innerHTML = days.map((dt) => {
    const k = ymd(dt);
    const items = (byDay[k] || []).sort((a, b) => a.slot.localeCompare(b.slot));
    const label = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, weekday: "long" }).format(dt);
    const dm = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(dt);
    return `<section class="day ${k === today ? "today" : ""}"><h3>${esc(label)}<span>${dm}</span></h3>
      ${items.length ? `<ol>${items.map((p) => `<li class="slot" style="border-color:${SWATCH[p.page_id] || "#888"}">
          <time>${new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(p.slot))}</time><b>${esc(p.data.ten_sp || p.data.ma_sp)}</b>
          <p>${esc(pageName(p.page_id))}: ${esc((p.text || "").split("\n")[0])}</p></li>`).join("")}</ol>` : `<p class="none">Chưa có bài.</p>`}
    </section>`;
  }).join("");
}
$("#cal-prev").addEventListener("click", () => { state.weekOffset--; loadCalendar(); });
$("#cal-next").addEventListener("click", () => { state.weekOffset++; loadCalendar(); });
$("#cal-today").addEventListener("click", () => { state.weekOffset = 0; loadCalendar(); });

/* ---------------- start ---------------- */
(async () => {
  try {
    await loadPages();
    await Promise.all([loadMeta(), loadBatches()]);
  } catch (e) {
    toast("Không kết nối được máy chủ: " + e.message);
  }
})();
