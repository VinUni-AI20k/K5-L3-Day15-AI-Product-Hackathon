(function () {
'use strict';
var id = location.pathname.split('/').pop();
var frame = document.getElementById('stage'), title = document.getElementById('title'), status = document.getElementById('status'), camBtn = document.getElementById('cam');
var errBox = document.getElementById('play-error'), errText = document.getElementById('play-error-msg'), retryBtn = document.getElementById('retry');
var HAND = { // MediaPipe Hand Landmarker từ CDN (staging); bản của JULY tự phục vụ ở /vision/, ở đây chưa có
  lib: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
};
var handsAsked = false, landmarker = null, lastHand = 0, handNow = { present: false, fist: false };
var data = null, want = false, running = false, video = null, model = null, stream = null, loopId = 0;
var LIBS = {
  image: ['https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js', 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js'],
  pose: ['https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js', 'https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8/dist/teachablemachine-pose.min.js']
};
function say(t) { status.textContent = t; }
function toFrame(m, transfer) { frame.contentWindow.postMessage(m, '*', transfer || []); }
function st(state) { toFrame({ type: 'camera.status', state: state, source: 'camera' }); }
// Nhắc giáo viên: lỗi camera không chặn lối chơi — fallback chuột luôn bật.
function mouseHint() { return ' Bạn vẫn có thể chơi trọn vẹn bằng chuột ngay bên dưới.'; }
function loadScript(src) {
  return new Promise(function (ok, bad) {
    var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('Không tải được thư viện: ' + src)); };
    document.head.appendChild(s);
  });
}
function init() {
  var m = { type: 'camera.init', mode: 'play', locale: 'vi', theme: 'dark', options: {}, source: 'camera' };
  if (data.manifest.inputs) { m.inputs = data.manifest.inputs.map(function (i) { return { key: i.key, label: i.label }; }); }
  if (data.questions && data.questions.length) m.questions = data.questions;
  if (data.content && data.content.length) m.content = data.content;
  toFrame(m);
}
window.addEventListener('message', function (e) {
  if (e.source !== frame.contentWindow || !e.data) return;
  if (e.data.type === 'ready') { init(); if (data.model) st(running ? 'ready' : 'off'); }
  if (e.data.type === 'camera.want') want = !!e.data.on;
  if (e.data.type === 'hands') {
    handsAsked = e.data.on === true;
    if (handsAsked && running && !landmarker) loadHands().catch(handsFail);
    else if (handsAsked && !running && !(data && data.model && data.model.kind !== 'audio')) toFrame({ type: 'camera.hand', hands: [], available: false });
  }
  if (e.data.type === 'finish') say('Kết thúc: ' + (e.data.correct != null ? e.data.correct + '/' + e.data.total : ''));
});

function handsFail() { toFrame({ type: 'camera.hand', hands: [], available: false }); }
function loadHands() {
  if (landmarker) return Promise.resolve();
  return import(HAND.lib).then(function (mp) {
    return mp.FilesetResolver.forVisionTasks(HAND.wasm).then(function (files) {
      return mp.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: HAND.model }, runningMode: 'VIDEO', numHands: 2 });
    });
  }).then(function (l) { landmarker = l; });
}
// Nắm / xòe từ 21 điểm (cách tính như JULY: khoảng cách đầu ngón so với cỡ bàn tay, có trễ để không nhấp nháy)
function curlOf(lm, aspect) {
  function d(a, b) { return Math.hypot((a.x - b.x) * aspect, a.y - b.y); }
  var size = d(lm[0], lm[9]) || 1e-6, c = 0;
  [8, 12, 16, 20].forEach(function (t) { c += Math.max(0, Math.min(1, (1.75 - d(lm[t], lm[0]) / size) / 0.6)); });
  return c / 4;
}
function readHands(now) {
  var r;
  try { r = landmarker.detectForVideo(video, now); } catch (e) { return; }
  var hands = (r && r.landmarks || []).map(function (lm) { return lm.map(function (p) { return { x: 1 - p.x, y: p.y, z: p.z || 0 }; }); });
  if (handsAsked) toFrame({ type: 'camera.hand', hands: hands, available: true });
  if (!hands.length) { handNow = { present: false, fist: false }; return; }
  var curl = curlOf(hands[0], video.videoWidth / video.videoHeight);
  handNow = { present: true, fist: handNow.present ? (handNow.fist ? curl > 0.4 : curl > 0.6) : curl > 0.6 };
}
function startCamera() {
  camBtn.disabled = true; say('Đang bật camera và nạp mô hình…'); st('loading');
  var kind = data.model.kind;
  if (kind !== 'hands' && !LIBS[kind]) { st('model-failed'); say('Mô hình ' + kind + ' chưa chạy được ở bản này.' + mouseHint()); camBtn.disabled = false; return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { st('no-camera'); say('Trình duyệt không cho dùng camera — cần mở trang bằng https hoặc localhost.' + mouseHint()); camBtn.disabled = false; return; }
  navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }).then(function (s) {
    stream = s;
    video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = s;
    return video.play();
  }).then(function () {
    if (kind === 'hands') return loadHands().then(function () { return null; });
    return LIBS[kind].reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve()).then(function () {
      var base = data.model.url;
      return kind === 'image' ? window.tmImage.load(base + 'model.json', base + 'metadata.json') : window.tmPose.load(base + 'model.json', base + 'metadata.json');
    });
  }).then(function (m) { model = m; running = true; if (handsAsked && kind !== 'hands') loadHands().catch(handsFail); say('Đang chạy'); camBtn.textContent = 'Tắt camera'; camBtn.disabled = false; st('ready'); loop(); })
    .catch(function (err) {
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      var state = denied ? 'denied' : (err && err.name === 'NotFoundError' ? 'no-camera' : 'model-failed');
      var why = denied ? 'Bạn chưa cho phép trang này dùng camera — hãy chọn “Cho phép” khi trình duyệt hỏi.'
        : err && err.name === 'NotFoundError' ? 'Không tìm thấy camera trên máy này.'
        : 'Không bật được camera hoặc nạp mô hình: ' + (err && err.message || err);
      st(state); say(why + mouseHint());
      stop(true); camBtn.disabled = false;
    });
}
function stop(keepStatus) {
  running = false; cancelAnimationFrame(loopId);
  if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
  camBtn.textContent = 'Bật camera';
  if (!keepStatus) { st('off'); say('Camera đã tắt — đang chơi bằng chuột.'); }
}
var rev = {}; // lớp -> ô
var cand = null, since = 0, emitted = false, lastPredict = 0, lastFrame = 0, busy = false;
var canvas = document.createElement('canvas');
function loop() {
  if (!running) return;
  loopId = requestAnimationFrame(loop);
  var now = performance.now();
  if (want && now - lastFrame > 66 && video.videoWidth) {
    lastFrame = now;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    var cx = canvas.getContext('2d'); cx.save(); cx.scale(-1, 1); cx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height); cx.restore();
    createImageBitmap(canvas, { resizeWidth: Math.min(640, canvas.width) }).then(function (b) { toFrame({ type: 'camera.image', image: b }, [b]); }).catch(function () {});
  }
  if (landmarker && video.videoWidth && now - lastHand > 66) { lastHand = now; readHands(now); }
  if (!busy && now - lastPredict > 120) { lastPredict = now; busy = true; predict().then(function () { busy = false; }, function () { busy = false; }); }
}
function predict() {
  var p;
  if (data.model.kind === 'hands') p = Promise.resolve([{ className: 'fist', probability: handNow.present && handNow.fist ? 1 : 0 }, { className: 'open', probability: handNow.present && !handNow.fist ? 1 : 0 }, { className: 'none', probability: handNow.present ? 0 : 1 }]);
  else if (data.model.kind === 'pose') p = model.estimatePose(video).then(function (r) { return model.predict(r.posenetOutput); });
  else p = model.predict(video);
  return p.then(function (preds) {
    var top = preds.reduce(function (a, b) { return b.probability > a.probability ? b : a; });
    var scores = {}; preds.forEach(function (x) { if (rev[x.className]) scores[rev[x.className]] = x.probability; });
    toFrame({ type: 'camera.frame', scores: scores });
    var input = rev[top.className];
    var key = input && top.probability >= data.sure ? input + '|' + top.className : null;
    var t = performance.now();
    if (key !== cand) { cand = key; since = t; emitted = false; if (!key) toFrame({ type: 'camera.empty' }); }
    else if (key && !emitted && t - since >= data.holdMs) {
      emitted = true; toFrame({ type: 'camera.result', input: input, label: top.className, confidence: top.probability });
    }
  });
}
camBtn.addEventListener('click', function () { running ? stop() : startCamera(); });
window.addEventListener('pagehide', function () { stop(true); });

// Lỗi tải / chưa chơi được: gập khung chơi, mở vùng lỗi (có nút Thử lại → loadApp chạy lại được).
function showFail(head, why) {
  title.textContent = head;
  if (errText) errText.textContent = why || 'Có lỗi không rõ nguyên nhân.';
  if (errBox) errBox.hidden = false;
  frame.hidden = true;
  say(head + (why ? ' — ' + why : ''));
}
function loadApp() {
  stop(true); // an toàn khi thử lại giữa chừng: tắt camera cũ, không đổi trạng thái của iframe
  if (errBox) errBox.hidden = true;
  frame.hidden = false;
  title.textContent = 'Đang nạp trò chơi…';
  say('Đang nạp trò chơi…');
  fetch('/api/apps/' + id + '/play', { credentials: 'same-origin' }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.message || 'Không mở được.'); return d; }); }).then(function (d) {
    if (d.unavailable) { showFail('Chưa chơi được', d.reason); return; }
    data = d; title.textContent = d.app.name; document.title = d.app.name + ' — AI Lab';
    Object.keys(d.mapping).forEach(function (k) { rev[d.mapping[k]] = k; });
    if (d.model) { camBtn.hidden = false; say('Bấm “Bật camera” để bắt đầu.'); }
    frame.srcdoc = d.srcdoc;
  }).catch(function (e) { showFail('Không mở được', e.message); });
}
if (retryBtn) retryBtn.addEventListener('click', loadApp);
loadApp();
})();
