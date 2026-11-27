/* ==========================================================================
   SkyBill · Locket Hoá Đơn AI — Logic Front-end thuần ES6 (kết nối CSDL & OCR backend)
   ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "skybill_receipts_v1";
  const TOUR_KEY = "skybill_tour_done_v1";

  const CATEGORIES = [
    "Ăn uống",
    "Đi lại",
    "Mua sắm",
    "Hoá đơn & Tiện ích",
    "Giải trí",
    "Sức khoẻ",
    "Khác",
  ];

  // Dữ liệu mẫu fallback khi mở tĩnh không qua server Python
  const SEED_RECEIPTS = [
    {
      id: "HD-1001",
      date: "2026-10-04",
      time: "08:30",
      merchant: "Tiệm Bánh Mẫu Sáng",
      category: "Ăn uống",
      source: "camera",
      note: "Bữa sáng và cà phê",
      items: [
        { name: "Bánh mì kẹp", price: 35000 },
        { name: "Cà phê sữa đá", price: 29000 },
      ],
      total: 64000,
    },
    {
      id: "HD-1002",
      date: "2026-10-10",
      time: "19:15",
      merchant: "Siêu Thị Xanh Mẫu",
      category: "Mua sắm",
      source: "upload",
      note: "Đồ dùng cá nhân tháng 10",
      items: [
        { name: "Nước giặt 2L", price: 145000 },
        { name: "Khăn giấy & đồ bếp", price: 95000 },
      ],
      total: 240000,
    },
    {
      id: "HD-1003",
      date: "2026-10-15",
      time: "09:05",
      merchant: "Điện Lực Mẫu Khu A",
      category: "Hoá đơn & Tiện ích",
      source: "upload",
      note: "Hoá đơn điện tháng 10",
      items: [{ name: "Tiền điện sinh hoạt", price: 420000 }],
      total: 420000,
    },
    {
      id: "HD-1004",
      date: "2026-10-21",
      time: "18:40",
      merchant: "Xe Công Nghệ Mẫu",
      category: "Đi lại",
      source: "upload",
      note: "Đi học nhóm",
      items: [{ name: "Cước xe 2 chiều", price: 88000 }],
      total: 88000,
    },
    {
      id: "HD-1005",
      date: "2026-10-27",
      time: "20:00",
      merchant: "Rạp Chiếu Phim Mẫu",
      category: "Giải trí",
      source: "camera",
      note: "Xem phim cuối tháng",
      items: [
        { name: "Vé xem phim", price: 95000 },
        { name: "Nước suối", price: 20000 },
      ],
      total: 115000,
    },
    {
      id: "HD-1006",
      date: "2026-10-30",
      time: "12:20",
      merchant: "Cơm Trưa Văn Phòng Mẫu",
      category: "Ăn uống",
      source: "camera",
      note: "Ăn trưa",
      items: [{ name: "Cơm phần + canh", price: 52000 }],
      total: 52000,
    },
    {
      id: "HD-1101",
      date: "2026-11-03",
      time: "12:15",
      merchant: "Bếp Cơm Mẫu 01",
      category: "Ăn uống",
      source: "camera",
      note: "Cơm trưa",
      items: [{ name: "Suất cơm trưa", price: 48000 }],
      total: 48000,
    },
    {
      id: "HD-1102",
      date: "2026-11-08",
      time: "17:20",
      merchant: "Nhà Thuốc Mẫu An Tâm",
      category: "Sức khoẻ",
      source: "camera",
      note: "Mua vitamin & khẩu trang",
      items: [
        { name: "Vitamin C", price: 85000 },
        { name: "Hộp khẩu trang", price: 45000 },
      ],
      total: 130000,
    },
    {
      id: "HD-1103",
      date: "2026-11-15",
      time: "10:10",
      merchant: "Internet & Điện Mẫu",
      category: "Hoá đơn & Tiện ích",
      source: "upload",
      note: "Thanh toán từ app ngân hàng",
      items: [
        { name: "Tiền điện tháng 11", price: 390000 },
        { name: "Cước Internet", price: 180000 },
      ],
      total: 570000,
    },
    {
      id: "HD-1104",
      date: "2026-11-20",
      time: "08:15",
      merchant: "Quán Cà Phê Bầu Trời",
      category: "Ăn uống",
      source: "camera",
      note: "Cà phê sáng",
      items: [{ name: "Bạc xỉu đá", price: 39000 }],
      total: 39000,
    },
    {
      id: "HD-1105",
      date: "2026-11-20",
      time: "19:45",
      merchant: "Siêu Thị Mini Mẫu B",
      category: "Mua sắm",
      source: "upload",
      note: "Mua thêm đồ dùng cuối tuần",
      items: [
        { name: "Sữa tươi 1L", price: 38000 },
        { name: "Bình giữ nhiệt", price: 195000 },
      ],
      total: 233000,
    },
    {
      id: "HD-1106",
      date: "2026-11-23",
      time: "12:30",
      merchant: "Quán Bún Mẫu Hà Nội",
      category: "Ăn uống",
      source: "camera",
      note: "Ăn trưa",
      items: [{ name: "Bún chả đặc biệt", price: 55000 }],
      total: 55000,
    },
    {
      id: "HD-1107",
      date: "2026-11-24",
      time: "08:05",
      merchant: "Xe Bus & Metro Mẫu",
      category: "Đi lại",
      source: "upload",
      note: "Nạp vé tháng",
      items: [{ name: "Vé đi lại tuần", price: 110000 }],
      total: 110000,
    },
    {
      id: "HD-1108",
      date: "2026-11-25",
      time: "20:10",
      merchant: "Lẩu Nướng Mẫu Nhóm",
      category: "Ăn uống",
      source: "camera",
      note: "Liên hoan nhóm học",
      items: [
        { name: "Phần ăn chia nhóm", price: 185000 },
        { name: "Trà chanh", price: 25000 },
      ],
      total: 210000,
    },
    {
      id: "HD-1109",
      date: "2026-11-26",
      time: "09:15",
      merchant: "Tiệm Trà Mẫu Sáng",
      category: "Ăn uống",
      source: "camera",
      note: "Đồ uống sáng",
      items: [{ name: "Trà sữa ít đường", price: 42000 }],
      total: 42000,
    },
    {
      id: "HD-1110",
      date: "2026-11-26",
      time: "18:30",
      merchant: "Nhà Sách Mẫu Tri Thức",
      category: "Mua sắm",
      source: "upload",
      note: "Mua sổ ghi chép và bút",
      items: [
        { name: "Sổ tay bìa cứng", price: 78000 },
        { name: "Bộ bút xanh", price: 42000 },
      ],
      total: 120000,
    },
    {
      id: "HD-1111",
      date: "2026-11-27",
      time: "12:05",
      merchant: "Quán Cơm Gà Mẫu",
      category: "Ăn uống",
      source: "camera",
      note: "Ăn trưa hôm nay",
      items: [
        { name: "Cơm gà xé", price: 48000 },
        { name: "Nước cam ép", price: 22000 },
      ],
      total: 70000,
    },
  ];

  const GUIDE_ITEMS = [
    {
      id: "g-camera",
      title: "1. Chụp ảnh hoá đơn trực tiếp bằng app (tự lưu vào hôm nay)",
      keywords: "chụp ảnh camera locket hôm nay bật cam shutter",
      view: "capture",
      mode: "camera",
      steps: [
        "Mở tab <strong>Chụp HĐ</strong> và chọn chế độ <strong>Chụp ngay bằng app</strong>.",
        "Bấm <strong>Bật camera</strong> (hoặc bấm <strong>Dùng ảnh hoá đơn mẫu</strong> nếu máy không có webcam), đưa hoá đơn vào khung bo tròn.",
        "Bấm nút chụp tròn lớn kiểu Locket — hệ thống tự động gắn ngày <strong>hôm nay</strong> và lưu ảnh vào thư mục <code>CSDL/images/</code>.",
      ],
    },
    {
      id: "g-upload",
      title: "2. Tải ảnh chụp từ app khác & chỉ rõ ngày chi tiêu",
      keywords: "tải ảnh upload app khác momo zalopay ngân hàng chọn ngày hôm qua",
      view: "capture",
      mode: "upload",
      steps: [
        "Chuyển sang chế độ <strong>Tải ảnh từ app khác</strong> trong tab <strong>Chụp HĐ</strong>.",
        "Chọn đúng <strong>ngày hoá đơn phát sinh</strong> ở ô ngày bắt buộc (có thể bấm nhanh <em>Hôm nay</em>, <em>Hôm qua</em>, <em>2 ngày trước</em>).",
        "Kéo thả hoặc chọn ảnh chụp hoá đơn từ máy rồi bấm <strong>Trích xuất hoá đơn bằng AI</strong>.",
      ],
    },
    {
      id: "g-draft",
      title: "3. Kiểm tra bản nháp AI & xử lý hoá đơn mờ (nguyên tắc G10)",
      keywords: "bản nháp duyệt sửa tiền thêm món không rõ mờ g10 xác nhận quality ocr",
      view: "capture",
      mode: "camera",
      steps: [
        "Backend kiểm tra chất lượng ảnh (độ nét, độ loá) và chạy mô hình ONNX OCR tiếng Việt, sau đó tạo bản nháp trong <code>CSDL/drafts.json</code>.",
        "Nếu ảnh mờ hoặc lệch tổng, AI sẽ đánh dấu <strong>\"không rõ\"</strong> để bạn kiểm lại và tự nhập phần thiếu.",
        "Bạn có thể sửa tên cửa hàng, chọn lại danh mục, thêm/xoá món hàng rồi bấm <strong>Xác nhận lưu vào lịch ngày</strong>.",
      ],
    },
    {
      id: "g-calendar",
      title: "4. Bấm vào từng ngày trên Lịch Locket để xem chi tiết hoá đơn",
      keywords: "lịch locket bấm ngày chi tiết hoá đơn bảng tổng kết mục chi thêm vào ngày",
      view: "calendar",
      steps: [
        "Mở tab <strong>Lịch</strong> để xem toàn bộ các ngày trong tháng; ô màu xanh da trời đậm hơn là ngày chi tiêu nhiều hơn.",
        "Bấm vào bất kỳ ô ngày nào để mở bảng bên cạnh: xem <strong>số hoá đơn</strong>, <strong>bảng tổng kết theo mục</strong> và <strong>từng hoá đơn chi tiết</strong>.",
        "Nếu cần bổ sung hoá đơn cho một ngày cũ, bấm ngay nút <strong>+ Thêm vào ngày này</strong>.",
      ],
    },
    {
      id: "g-analytics",
      title: "5. Xem tổng kết Tuần / Tháng / Năm & so sánh tăng/giảm kỳ trước",
      keywords: "phân tích tuần tháng năm so sánh kỳ trước tăng giảm xu hướng biểu đồ",
      view: "analytics",
      steps: [
        "Vào tab <strong>Phân tích</strong> và chọn chu kỳ <strong>Tuần</strong>, <strong>Tháng</strong> hoặc <strong>Năm</strong>.",
        "Xem 4 thẻ chỉ số phía trên: tổng chi kỳ này, mức <strong>tăng/giảm (+/- VND và %)</strong> so với kỳ trước và danh mục lớn nhất.",
        "Đọc biểu đồ cột đối chiếu, bảng biến động từng danh mục và hỏi trực tiếp trợ lý AI phía dưới.",
      ],
    },
    {
      id: "g-edit",
      title: "6. Đổi danh mục hoặc xoá hoá đơn đã lưu",
      keywords: "sửa danh mục xoá hoá đơn nhầm ngày chỉnh sửa",
      view: "calendar",
      steps: [
        "Vào tab <strong>Lịch</strong> và bấm vào ngày chứa hoá đơn cần chỉnh.",
        "Ở góc dưới mỗi thẻ hoá đơn, dùng menu danh mục để đổi nhanh nhóm chi (tổng kết trong <code>CSDL/receipts.json</code> tự cập nhật ngay).",
        "Bấm nút <strong>Xoá</strong> nếu muốn gỡ hoá đơn lưu nhầm.",
      ],
    },
    {
      id: "g-safety",
      title: "7. Nguyên tắc an toàn của AI (vì sao số liệu luôn khớp)",
      keywords: "an toàn code tính toán từ chối đầu tư otp bảo mật",
      view: "analytics",
      steps: [
        "AI không tự cộng trừ tiền: mọi phép tính tổng ngày, tổng kỳ và % chênh lệch kỳ trước đều chạy bằng code.",
        "AI chỉ tạo bản nháp và giải thích xu hướng dựa trên dữ liệu bạn đã xác nhận lưu trong CSDL.",
        "Trợ lý từ chối câu hỏi tư vấn đầu tư, không hỏi OTP/mật khẩu/số thẻ và không xem dữ liệu người khác.",
      ],
    },
  ];

  const TOUR_STEPS = [
    {
      view: "capture",
      mode: "camera",
      target: "#locket-viewfinder",
      title: "1. Chụp nhanh hoá đơn kiểu Locket",
      desc: "Bật camera để chụp ngay hoá đơn trong ngày hôm nay, hoặc dùng ảnh mẫu có sẵn để thử quy trình Quality Gate + ONNX OCR.",
    },
    {
      view: "capture",
      mode: "upload",
      target: "#upload-date-box",
      title: "2. Tải ảnh từ app khác phải chọn ngày",
      desc: "Khi tải ảnh chụp từ app ngân hàng/ví điện tử, hãy chỉ rõ ngày chi tiêu tại đây để hệ thống xếp đúng vào ô lịch.",
    },
    {
      view: "capture",
      mode: "camera",
      target: "#draft-card",
      title: "3. Duyệt bản nháp trước khi lưu",
      desc: "Backend chấm chất lượng ảnh, quét chữ bằng ONNX OCR và lập bản nháp. Bạn luôn kiểm, sửa danh mục hoặc số tiền rồi mới xác nhận lưu vào CSDL.",
    },
    {
      view: "calendar",
      target: "#calendar-grid",
      title: "4. Bấm vào ô ngày trên Lịch Locket",
      desc: "Mỗi ô hiển thị số hoá đơn và mức chi theo sắc độ xanh da trời. Bấm vào một ngày để mở bảng tổng kết và từng hoá đơn chi tiết.",
    },
    {
      view: "analytics",
      target: "#view-analytics .period-controls",
      title: "5. Tổng kết Tuần · Tháng · Năm & Xu hướng",
      desc: "Chuyển đổi Tuần, Tháng, Năm để xem mức tăng/giảm so với kỳ trước và nhận xét xu hướng tiêu dùng.",
    },
    {
      view: "guide",
      target: "#guide-search",
      title: "6. Quên bước nào, tra nhanh bước đó!",
      desc: "Bạn có thể gõ từ khoá tại đây để xem riêng 1 thao tác mà không cần xem lại từ đầu, hoặc bấm 'Chạy lại Tour' trên góc phải bất kỳ lúc nào.",
    },
  ];

  const state = {
    backendConnected: false,
    receipts: loadReceiptsLocal(),
    activeView: "capture",
    captureMode: "camera",
    capturedImageDataUrl: "",
    uploadImageDataUrl: "",
    cameraStream: null,
    draft: null,
    calendarYear: 2026,
    calendarMonth: 10,
    selectedDate: "2026-11-26",
    analyticsPeriod: "month",
    analyticsAnchor: "2026-11-26",
    tourIndex: 0,
    guideQuery: "",
    guideOpenIds: new Set(["g-camera", "g-upload"]),
  };

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function shiftIsoDate(baseIso, deltaDays) {
    const [y, m, d] = baseIso.split("-").map(Number);
    const dt = new Date(y, m - 1, d + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  function formatVnd(amount) {
    const num = Math.round(Number(amount) || 0);
    return num.toLocaleString("vi-VN") + " ₫";
  }

  function formatCompactVnd(amount) {
    const num = Math.round(Number(amount) || 0);
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".0", "") + "tr";
    if (num >= 1000) return Math.round(num / 1000) + "k";
    return num + "đ";
  }

  function formatDisplayDate(iso) {
    if (!iso || !iso.includes("-")) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function loadReceiptsLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_err) {}
    return SEED_RECEIPTS.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) }));
  }

  function saveReceiptsLocal(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_err) {}
  }

  function showToast(msg) {
    const box = document.getElementById("toast-box");
    box.textContent = msg;
    box.classList.remove("hidden");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => box.classList.add("hidden"), 2800);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function syncReceiptsFromBackend() {
    try {
      const res = await fetch("/api/receipts");
      if (!res.ok) return false;
      const data = await res.json();
      if (Array.isArray(data.receipts)) {
        state.backendConnected = true;
        state.receipts = data.receipts;
        saveReceiptsLocal(state.receipts);
        renderCalendar();
        renderDayDetail(state.selectedDate);
        if (state.activeView === "analytics") renderAnalytics();
        return true;
      }
    } catch (_err) {
      state.backendConnected = false;
    }
    return false;
  }

  function createSampleReceiptImage(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 620;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f0f9ff";
    ctx.fillRect(0, 0, 620, 720);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 3;
    ctx.fillRect(42, 36, 536, 648);
    ctx.strokeRect(42, 36, 536, 648);

    ctx.fillStyle = "#072540";
    ctx.font = "bold 28px Inter, Arial, sans-serif";
    ctx.fillText(kind === "upload" ? "BIEN LAI VI DIEN TU MAU" : "QUAN CA PHE MAU SKY", 72, 98);

    ctx.fillStyle = "#0c3b66";
    ctx.font = "20px Inter, Arial, sans-serif";
    ctx.fillText("Ngay: " + formatDisplayDate(todayIso()), 72, 140);

    if (kind === "blurry") {
      ctx.fillStyle = "#bae6fd";
      ctx.fillRect(72, 180, 470, 320);
      ctx.fillStyle = "#075985";
      ctx.font = "bold 22px Inter, Arial, sans-serif";
      ctx.fillText("Anh mo - can kiem tra G10", 130, 340);
    } else if (kind === "upload") {
      ctx.fillStyle = "#072540";
      ctx.font = "22px Inter, Arial, sans-serif";
      ctx.fillText("Cuoc di lai noi thanh", 72, 220);
      ctx.fillText("65.000", 450, 220);
      ctx.fillText("Phi giao hang tai lieu", 72, 276);
      ctx.fillText("32.000", 450, 276);
      ctx.fillStyle = "#0284c7";
      ctx.font = "bold 24px Inter, Arial, sans-serif";
      ctx.fillText("TONG CONG", 72, 360);
      ctx.fillText("97.000", 440, 360);
    } else {
      ctx.fillStyle = "#072540";
      ctx.font = "22px Inter, Arial, sans-serif";
      ctx.fillText("Tra sua O Long Lai", 72, 220);
      ctx.fillText("45.000", 450, 220);
      ctx.fillText("Banh sung bo bo", 72, 276);
      ctx.fillText("35.000", 450, 276);
      ctx.fillStyle = "#0284c7";
      ctx.font = "bold 24px Inter, Arial, sans-serif";
      ctx.fillText("TONG CONG", 72, 360);
      ctx.fillText("80.000", 440, 360);
    }
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
    document.getElementById("view-" + viewName).classList.add("active");

    document.querySelectorAll(".dock-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });

    if (viewName !== "capture") stopCamera();
    if (viewName === "calendar") {
      renderCalendar();
      renderDayDetail(state.selectedDate);
    }
    if (viewName === "analytics") renderAnalytics();
    if (viewName === "guide") renderGuide();
  }

  function setCaptureMode(mode) {
    state.captureMode = mode;
    const camBtn = document.getElementById("mode-camera-btn");
    const upBtn = document.getElementById("mode-upload-btn");
    camBtn.classList.toggle("active", mode === "camera");
    camBtn.setAttribute("aria-selected", String(mode === "camera"));
    upBtn.classList.toggle("active", mode === "upload");
    upBtn.setAttribute("aria-selected", String(mode === "upload"));

    document.getElementById("panel-camera").classList.toggle("active", mode === "camera");
    document.getElementById("panel-upload").classList.toggle("active", mode === "upload");

    if (mode === "upload") stopCamera();
    updateActiveTargetDateLabel();
  }

  function updateActiveTargetDateLabel() {
    const label = document.getElementById("active-target-date");
    if (state.captureMode === "camera") {
      label.textContent = formatDisplayDate(todayIso()) + " (Hôm nay · Tự động)";
    } else {
      const val = document.getElementById("upload-date").value;
      label.textContent = val ? formatDisplayDate(val) : "Chưa chọn ngày (bắt buộc)";
    }
  }

  async function startCamera() {
    const msg = document.getElementById("camera-status-msg");
    msg.classList.add("hidden");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg.textContent = "Trình duyệt không hỗ trợ camera trực tiếp. Hãy bấm 'Dùng ảnh hoá đơn mẫu' hoặc chuyển sang 'Tải ảnh từ app khác'.";
      msg.classList.remove("hidden");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      state.cameraStream = stream;
      const video = document.getElementById("camera-video");
      video.srcObject = stream;
      video.classList.remove("hidden");
      document.getElementById("camera-preview").classList.add("hidden");
      document.getElementById("camera-placeholder").classList.add("hidden");
      document.getElementById("btn-shutter").disabled = false;
      document.getElementById("btn-stop-camera").disabled = false;
    } catch (_err) {
      msg.textContent = "Không truy cập được camera (chưa cấp quyền hoặc thiếu webcam). Bạn có thể bấm 'Dùng ảnh hoá đơn mẫu' bên dưới.";
      msg.classList.remove("hidden");
    }
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((t) => t.stop());
      state.cameraStream = null;
    }
    const video = document.getElementById("camera-video");
    if (video) {
      video.srcObject = null;
      video.classList.add("hidden");
    }
    document.getElementById("btn-shutter").disabled = true;
    document.getElementById("btn-stop-camera").disabled = true;
    if (!state.capturedImageDataUrl) {
      document.getElementById("camera-placeholder").classList.remove("hidden");
    }
  }

  function capturePhotoFromCamera() {
    const video = document.getElementById("camera-video");
    if (!state.cameraStream || !video.videoWidth) return;
    const canvas = document.getElementById("camera-canvas");
    const maxW = 960;
    const ratio = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    setCameraPreview(dataUrl, "clear");
    stopCamera();
    showToast("Đã chụp ảnh hoá đơn cho ngày hôm nay!");
  }

  function setCameraPreview(dataUrl, sampleKind) {
    state.capturedImageDataUrl = dataUrl;
    state.captureSampleKind = sampleKind || "clear";
    const img = document.getElementById("camera-preview");
    img.src = dataUrl;
    img.classList.remove("hidden");
    document.getElementById("camera-placeholder").classList.add("hidden");
    document.getElementById("camera-video").classList.add("hidden");
  }

  function handleUploadFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Vui lòng chọn đúng tệp ảnh hoá đơn.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
      setUploadPreview(ev.target.result, file.name);
    };
    reader.readAsDataURL(file);
  }

  function setUploadPreview(dataUrl, filename) {
    state.uploadImageDataUrl = dataUrl;
    state.uploadFilename = filename || "hoa-don.jpg";
    const img = document.getElementById("upload-preview");
    img.src = dataUrl;
    img.classList.remove("hidden");
    document.getElementById("upload-placeholder").classList.add("hidden");
  }

  function validateReceiptCode(draft) {
    const missing = [];
    if (!draft.merchant || draft.merchant === "không rõ") missing.push("Tên cửa hàng");
    if (!draft.date) missing.push("Ngày chi tiêu");
    if (!draft.items || draft.items.length === 0) missing.push("Danh sách món");
    const calcSum = (draft.items || []).reduce((s, it) => s + (Number(it.price) || 0), 0);
    const hasZeroOrUnknown = (draft.items || []).some(
      (it) => !it.name || it.name.toLowerCase().includes("không rõ") || Number(it.price) <= 0
    );
    if (hasZeroOrUnknown) missing.push("Số tiền/tên món rõ ràng");
    return {
      valid: missing.length === 0 && calcSum > 0,
      missingFields: missing,
      calculatedTotal: calcSum,
    };
  }

  async function extractReceiptToDraft() {
    let targetDate = todayIso();
    let imageData = state.capturedImageDataUrl;
    let source = "camera";
    let filename = "camera-capture.jpg";

    if (state.captureMode === "upload") {
      source = "upload";
      imageData = state.uploadImageDataUrl;
      filename = state.uploadFilename || "upload-receipt.jpg";
      const dateBox = document.getElementById("upload-date-box");
      const chosenDate = document.getElementById("upload-date").value;
      if (!chosenDate) {
        dateBox.classList.add("needs-attention");
        document.getElementById("upload-date").focus();
        showToast("Khi tải ảnh lên, vui lòng chọn rõ ngày chi tiêu!");
        return;
      }
      dateBox.classList.remove("needs-attention");
      targetDate = chosenDate;
    }

    if (!imageData) {
      showToast(
        state.captureMode === "camera"
          ? "Hãy chụp ảnh hoặc bấm 'Dùng ảnh hoá đơn mẫu' trước."
          : "Hãy chọn ảnh hoá đơn cần tải lên trước."
      );
      return;
    }

    const extractBtn = document.getElementById("btn-extract-ai");
    extractBtn.disabled = true;
    extractBtn.textContent = "Đang quét Quality + OCR...";

    try {
      const response = await fetch("/api/receipts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_data_url: imageData,
          receipt_date: targetDate,
          source_mode: source,
          filename: filename,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const serverDraft = data.draft || {};
        state.backendConnected = true;
        state.draft = {
          draft_id: serverDraft.draft_id || "",
          merchant: serverDraft.merchant || "không rõ",
          date: serverDraft.date || targetDate,
          category: serverDraft.category || "Khác",
          note: serverDraft.note || "",
          items: Array.isArray(serverDraft.items) && serverDraft.items.length ? serverDraft.items : [{ name: "không rõ", price: 0 }],
          image_path: serverDraft.image_path || "",
          image: imageData,
          source: source,
          quality_report: data.quality_report || null,
          ocr_engine: data.ocr_engine || "",
          ocr_engine_available: Boolean(data.ocr_engine_available),
          ocr_lines_count: Array.isArray(data.ocr_lines) ? data.ocr_lines.length : 0,
          backend_warnings: (data.validation && data.validation.warnings) || [],
        };
        renderDraftForm();
        document.getElementById("draft-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
        showToast("Đã lưu ảnh vào CSDL và quét xong bản nháp!");
        return;
      }
    } catch (_err) {
      // Fallback sang chế độ cục bộ khi không chạy server Python
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = "Trích xuất hoá đơn bằng AI";
    }

    let extracted;
    if (state.captureMode === "camera" && state.captureSampleKind === "blurry") {
      extracted = {
        merchant: "không rõ",
        date: targetDate,
        category: "Ăn uống",
        note: "Ảnh mờ vùng số tiền — cần bạn bổ sung (G10)",
        items: [{ name: "không rõ (món trên ảnh mờ)", price: 0 }],
        image: imageData,
        source,
      };
    } else if (state.captureMode === "upload") {
      extracted = {
        merchant: "Biên Lai Ví Điện Tử Mẫu",
        date: targetDate,
        category: "Đi lại",
        note: filename ? "Tải từ: " + filename : "Ảnh tải từ app khác",
        items: [
          { name: "Cước đi lại nội thành", price: 65000 },
          { name: "Phí giao hàng tài liệu", price: 32000 },
        ],
        image: imageData,
        source,
      };
    } else {
      extracted = {
        merchant: "Quán Cà Phê Mẫu Sky",
        date: targetDate,
        category: "Ăn uống",
        note: "Chụp trực tiếp bằng SkyBill",
        items: [
          { name: "Trà sữa Ô Long Lài", price: 45000 },
          { name: "Bánh sừng bò bơ", price: 35000 },
        ],
        image: imageData,
        source,
      };
    }

    state.draft = extracted;
    renderDraftForm();
    document.getElementById("draft-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderDraftForm() {
    const emptyEl = document.getElementById("draft-empty");
    const formEl = document.getElementById("draft-form");
    const badgeEl = document.getElementById("draft-status-badge");

    if (!state.draft) {
      emptyEl.classList.remove("hidden");
      formEl.classList.add("hidden");
      badgeEl.textContent = "Chưa có bản nháp";
      return;
    }

    emptyEl.classList.add("hidden");
    formEl.classList.remove("hidden");
    badgeEl.textContent = state.draft.draft_id ? state.draft.draft_id : "DRAFT_PENDING_USER";

    document.getElementById("draft-merchant").value = state.draft.merchant || "";
    document.getElementById("draft-date").value = state.draft.date || todayIso();
    document.getElementById("draft-note").value = state.draft.note || "";

    const chipsWrap = document.getElementById("draft-category-chips");
    chipsWrap.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn" + (state.draft.category === cat ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        state.draft.category = cat;
        renderDraftForm();
      });
      chipsWrap.appendChild(btn);
    });

    const listEl = document.getElementById("draft-items-list");
    listEl.innerHTML = "";
    state.draft.items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "draft-item-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "input-control";
      nameInput.value = item.name;
      nameInput.placeholder = "Tên món / khoản chi";
      nameInput.addEventListener("input", (e) => {
        state.draft.items[idx].name = e.target.value;
        refreshDraftValidationAndTotal();
      });

      const priceInput = document.createElement("input");
      priceInput.type = "number";
      priceInput.min = "0";
      priceInput.step = "1000";
      priceInput.className = "input-control";
      priceInput.value = item.price;
      priceInput.placeholder = "Số tiền";
      priceInput.addEventListener("input", (e) => {
        state.draft.items[idx].price = Number(e.target.value) || 0;
        refreshDraftValidationAndTotal();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-ghost btn-xs";
      delBtn.textContent = "Xoá";
      delBtn.disabled = state.draft.items.length <= 1;
      delBtn.addEventListener("click", () => {
        state.draft.items.splice(idx, 1);
        renderDraftForm();
      });

      row.appendChild(nameInput);
      row.appendChild(priceInput);
      row.appendChild(delBtn);
      listEl.appendChild(row);
    });

    refreshDraftValidationAndTotal();
  }

  function refreshDraftValidationAndTotal() {
    if (!state.draft) return;
    state.draft.merchant = document.getElementById("draft-merchant").value.trim();
    state.draft.date = document.getElementById("draft-date").value;
    state.draft.note = document.getElementById("draft-note").value.trim();

    const check = validateReceiptCode(state.draft);
    document.getElementById("draft-total-display").textContent = formatVnd(check.calculatedTotal);
    document.getElementById("btn-confirm-save").textContent =
      "Xác nhận lưu vào ngày " + formatDisplayDate(state.draft.date);

    const qr = state.draft.quality_report;
    let metaLine = "";
    if (qr && qr.available) {
      metaLine =
        `<div class="muted-xs" style="margin-top:4px;">` +
        `Quality Gate: <strong>${escapeHtml(qr.quality_status)}</strong> ` +
        `(điểm ${qr.overall_score} · độ nét ${qr.blur_score} · độ loá ${qr.glare_score})` +
        (state.draft.ocr_engine_available
          ? ` · ONNX OCR (${escapeHtml(state.draft.ocr_engine)}): đọc ${state.draft.ocr_lines_count} vùng chữ.`
          : " · OCR chưa sẵn sàng ở môi trường Python hiện tại.") +
        `</div>`;
    }

    const box = document.getElementById("draft-validation-box");
    if (check.valid) {
      box.className = "validation-box";
      box.innerHTML =
        "<strong>Kiểm tra code đạt:</strong> Đủ thông tin và khớp tổng tiền <strong>" +
        formatVnd(check.calculatedTotal) +
        "</strong>. Bấm xác nhận để lưu vào CSDL." +
        metaLine;
    } else {
      box.className = "validation-box uncertain";
      box.innerHTML =
        "<strong>Cần bạn kiểm lại (G10 — thu hẹp khi không chắc):</strong> Thiếu hoặc chưa rõ: <strong>" +
        escapeHtml(check.missingFields.join(", ")) +
        "</strong>. Hãy sửa trực tiếp bên dưới trước khi lưu." +
        metaLine;
    }
  }

  async function confirmSaveDraft(ev) {
    ev.preventDefault();
    if (!state.draft) return;
    refreshDraftValidationAndTotal();
    const check = validateReceiptCode(state.draft);
    if (!check.valid) {
      showToast("Vui lòng điền đủ tên món và số tiền > 0 trước khi lưu!");
      return;
    }

    const payload = {
      draft_id: state.draft.draft_id || "",
      user_id: "default_user",
      date: state.draft.date,
      merchant: state.draft.merchant,
      category: state.draft.category || "Khác",
      source: state.draft.source || "camera",
      note: state.draft.note || "",
      image_path: state.draft.image_path || "",
      items: state.draft.items.map((it) => ({ name: it.name.trim(), price: Number(it.price) || 0 })),
    };

    let savedReceipt = null;
    try {
      const res = await fetch("/api/receipts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        savedReceipt = data.receipt;
        state.backendConnected = true;
      }
    } catch (_err) {}

    if (!savedReceipt) {
      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      savedReceipt = {
        id: "HD-" + Date.now().toString().slice(-5),
        date: payload.date,
        time: timeStr,
        merchant: payload.merchant,
        category: payload.category,
        source: payload.source,
        note: payload.note,
        image: state.draft.image || "",
        items: payload.items,
        total: check.calculatedTotal,
      };
    }

    state.receipts.push(savedReceipt);
    saveReceiptsLocal(state.receipts);

    const [y, m] = savedReceipt.date.split("-").map(Number);
    state.calendarYear = y;
    state.calendarMonth = m - 1;
    state.selectedDate = savedReceipt.date;
    state.draft = null;
    renderDraftForm();

    showToast("Đã lưu hoá đơn vào CSDL ngày " + formatDisplayDate(savedReceipt.date) + "!");
    switchView("calendar");
  }

  function getDaySummary(dateIso) {
    const list = state.receipts.filter((r) => r.date === dateIso);
    const total = list.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const byCat = {};
    list.forEach((r) => {
      byCat[r.category] = (byCat[r.category] || 0) + (Number(r.total) || 0);
    });
    const breakdown = Object.entries(byCat)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { date: dateIso, receipts: list, count: list.length, total, breakdown };
  }

  function heatLevel(total) {
    if (total <= 0) return "level-0";
    if (total < 150000) return "level-1";
    if (total < 400000) return "level-2";
    if (total < 800000) return "level-3";
    return "level-4";
  }

  function computeStreak() {
    const datesWithData = new Set(state.receipts.map((r) => r.date));
    if (datesWithData.size === 0) return 0;
    const sorted = Array.from(datesWithData).sort();
    const latest = sorted[sorted.length - 1];
    let streak = 0;
    let cursor = latest;
    while (datesWithData.has(cursor)) {
      streak += 1;
      cursor = shiftIsoDate(cursor, -1);
    }
    return streak;
  }

  function renderCalendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const monthNum = String(month + 1).padStart(2, "0");
    document.getElementById("calendar-month-label").textContent = `Tháng ${month + 1} ${year}`;

    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;

    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement("div");
      empty.className = "day-cell empty";
      grid.appendChild(empty);
    }

    const today = todayIso();
    let monthTotal = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = `${year}-${monthNum}-${String(day).padStart(2, "0")}`;
      const summary = getDaySummary(dateIso);
      monthTotal += summary.total;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-cell " + heatLevel(summary.total);
      if (dateIso === state.selectedDate) btn.classList.add("selected");
      if (dateIso === today) btn.classList.add("today");

      const top = document.createElement("div");
      top.className = "day-top";

      const numSpan = document.createElement("span");
      numSpan.className = "day-num";
      numSpan.textContent = String(day);
      top.appendChild(numSpan);

      if (dateIso === today) {
        const plus = document.createElement("span");
        plus.className = "day-plus";
        plus.textContent = "+";
        plus.title = "Hôm nay · Bấm để xem hoặc thêm hoá đơn";
        top.appendChild(plus);
      }

      btn.appendChild(top);

      if (summary.count > 0) {
        const badge = document.createElement("span");
        badge.className = "day-badge";
        badge.textContent = `${summary.count} HĐ · ${formatCompactVnd(summary.total)}`;
        btn.appendChild(badge);
      }

      btn.addEventListener("click", () => {
        state.selectedDate = dateIso;
        renderCalendar();
        renderDayDetail(dateIso);
      });

      grid.appendChild(btn);
    }

    document.getElementById("stat-total-receipts").textContent = String(state.receipts.length);
    document.getElementById("stat-streak-days").textContent = computeStreak() + " ngày";
    document.getElementById("stat-month-spend").textContent = formatVnd(monthTotal);
  }

  function renderDayDetail(dateIso) {
    const summary = getDaySummary(dateIso);
    document.getElementById("day-detail-badge").textContent =
      dateIso === todayIso() ? "Hôm nay" : "Ngày đã chọn";
    document.getElementById("day-detail-title").textContent = "Ngày " + formatDisplayDate(dateIso);
    document.getElementById("day-receipt-count").textContent = summary.count + " hoá đơn";
    document.getElementById("day-total-spend").textContent = formatVnd(summary.total);

    const breakdownWrap = document.getElementById("day-category-breakdown");
    if (summary.breakdown.length === 0) {
      breakdownWrap.innerHTML = '<p class="muted-sm">Chưa có hoá đơn nào trong ngày này.</p>';
    } else {
      breakdownWrap.innerHTML = summary.breakdown
        .map((row) => {
          const pct = summary.total > 0 ? Math.round((row.amount / summary.total) * 100) : 0;
          return `
            <div class="breakdown-item">
              <div class="breakdown-row">
                <span>${escapeHtml(row.category)} (${pct}%)</span>
                <span>${formatVnd(row.amount)}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    const listWrap = document.getElementById("day-receipts-list");
    if (summary.receipts.length === 0) {
      listWrap.innerHTML =
        '<p class="muted-sm">Bấm <strong>"+ Thêm vào ngày này"</strong> để chụp hoặc tải hoá đơn cho ngày ' +
        formatDisplayDate(dateIso) +
        ".</p>";
      return;
    }

    listWrap.innerHTML = "";
    summary.receipts.forEach((rec) => {
      const card = document.createElement("div");
      card.className = "receipt-card";

      const imgSrc = rec.image_path ? `/csdl/images/${rec.image_path}` : rec.image || "";
      const thumbHtml = imgSrc
        ? `<img src="${escapeHtml(imgSrc)}" alt="Ảnh hoá đơn ${escapeHtml(rec.merchant)}" class="receipt-thumb" />`
        : `<div class="receipt-thumb" style="display:grid;place-items:center;background:#e0f2fe;color:#0369a1;font-size:0.7rem;font-weight:700;">HĐ</div>`;

      const itemsHtml = (rec.items || [])
        .map((it) => `<li>${escapeHtml(it.name)} — <strong>${formatVnd(it.price)}</strong></li>`)
        .join("");

      card.innerHTML = `
        <div class="receipt-card-top">
          <div class="receipt-head-info">
            ${thumbHtml}
            <div>
              <strong>${escapeHtml(rec.merchant)}</strong>
              <div class="muted-xs">${escapeHtml(rec.time || "--:--")} · ${rec.source === "upload" ? "Tải ảnh lên" : "Chụp trực tiếp"}</div>
            </div>
          </div>
          <strong>${formatVnd(rec.total)}</strong>
        </div>
        <ul class="receipt-items-ul">${itemsHtml}</ul>
        ${rec.note ? `<div class="muted-xs">Ghi chú: ${escapeHtml(rec.note)}</div>` : ""}
        <div class="receipt-card-footer">
          <select class="select-inline" aria-label="Đổi danh mục"></select>
          <button type="button" class="btn btn-ghost btn-xs btn-del-receipt">Xoá</button>
        </div>
      `;

      const sel = card.querySelector("select");
      CATEGORIES.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        if (cat === rec.category) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", async (e) => {
        const nextCat = e.target.value;
        rec.category = nextCat;
        saveReceiptsLocal(state.receipts);
        try {
          await fetch(`/api/receipts/${encodeURIComponent(rec.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: nextCat }),
          });
        } catch (_err) {}
        renderDayDetail(dateIso);
        showToast("Đã cập nhật danh mục thành " + rec.category);
      });

      card.querySelector(".btn-del-receipt").addEventListener("click", async () => {
        state.receipts = state.receipts.filter((r) => r.id !== rec.id);
        saveReceiptsLocal(state.receipts);
        try {
          await fetch(`/api/receipts/${encodeURIComponent(rec.id)}`, { method: "DELETE" });
        } catch (_err) {}
        renderCalendar();
        renderDayDetail(dateIso);
        showToast("Đã xoá hoá đơn " + rec.merchant);
      });

      listWrap.appendChild(card);
    });
  }

  function getWeekBounds(anchorIso) {
    const [y, m, d] = anchorIso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const offset = (dt.getDay() + 6) % 7;
    const startIso = shiftIsoDate(anchorIso, -offset);
    const endIso = shiftIsoDate(startIso, 6);
    return { startIso, endIso, label: `Tuần ${formatDisplayDate(startIso)} – ${formatDisplayDate(endIso)}` };
  }

  function getPeriodWindow(periodType, anchorIso, shiftSteps) {
    const [y, m] = anchorIso.split("-").map(Number);
    if (periodType === "week") {
      const shiftedAnchor = shiftIsoDate(anchorIso, shiftSteps * 7);
      const b = getWeekBounds(shiftedAnchor);
      return { ...b, anchor: shiftedAnchor };
    }
    if (periodType === "month") {
      const dt = new Date(y, m - 1 + shiftSteps, 1);
      const yy = dt.getFullYear();
      const mm = dt.getMonth() + 1;
      const lastDay = new Date(yy, mm, 0).getDate();
      const startIso = `${yy}-${String(mm).padStart(2, "0")}-01`;
      const endIso = `${yy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return { startIso, endIso, label: `Tháng ${mm}/${yy}`, anchor: startIso };
    }
    const yy = y + shiftSteps;
    return {
      startIso: `${yy}-01-01`,
      endIso: `${yy}-12-31`,
      label: `Năm ${yy}`,
      anchor: `${yy}-01-01`,
    };
  }

  function aggregateRange(startIso, endIso) {
    const matched = state.receipts.filter((r) => r.date >= startIso && r.date <= endIso);
    const total = matched.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const activeDays = new Set(matched.map((r) => r.date)).size;
    const byCat = {};
    CATEGORIES.forEach((c) => {
      byCat[c] = 0;
    });
    matched.forEach((r) => {
      const cat = CATEGORIES.includes(r.category) ? r.category : "Khác";
      byCat[cat] += Number(r.total) || 0;
    });
    return { receipts: matched, count: matched.length, total, activeDays, byCat };
  }

  function comparePeriodData(periodType, anchorIso) {
    const currWin = getPeriodWindow(periodType, anchorIso, 0);
    const prevWin = getPeriodWindow(periodType, anchorIso, -1);
    const curr = aggregateRange(currWin.startIso, currWin.endIso);
    const prev = aggregateRange(prevWin.startIso, prevWin.endIso);

    const diff = curr.total - prev.total;
    const pct = prev.total > 0 ? Math.round((diff / prev.total) * 100) : null;

    const categoryRows = CATEGORIES.map((cat) => {
      const cVal = curr.byCat[cat] || 0;
      const pVal = prev.byCat[cat] || 0;
      return {
        category: cat,
        current: cVal,
        previous: pVal,
        diff: cVal - pVal,
      };
    }).filter((row) => row.current > 0 || row.previous > 0);

    return { currWin, prevWin, curr, prev, diff, pct, categoryRows };
  }

  function renderAnalytics() {
    const cmp = comparePeriodData(state.analyticsPeriod, state.analyticsAnchor);
    document.getElementById("analytics-period-label").textContent = cmp.currWin.label;

    document.getElementById("kpi-current-total").textContent = formatVnd(cmp.curr.total);
    document.getElementById("kpi-current-range").textContent =
      `${formatDisplayDate(cmp.currWin.startIso)} → ${formatDisplayDate(cmp.currWin.endIso)}`;

    const pctEl = document.getElementById("kpi-delta-pct");
    const vndEl = document.getElementById("kpi-delta-vnd");
    if (cmp.prev.total === 0 && cmp.curr.total === 0) {
      pctEl.textContent = "Chưa có dữ liệu";
      vndEl.textContent = "Chưa có hoá đơn ở hai kỳ này";
    } else if (cmp.prev.total === 0) {
      pctEl.textContent = "Kỳ mới có chi";
      vndEl.textContent = `${cmp.prevWin.label} chưa có hoá đơn để đối chiếu`;
    } else {
      const sign = cmp.diff > 0 ? "↑ +" : cmp.diff < 0 ? "↓ " : "";
      pctEl.textContent = `${sign}${cmp.pct}%`;
      vndEl.textContent = `${cmp.diff >= 0 ? "+" : ""}${formatVnd(cmp.diff)} so với ${cmp.prevWin.label}`;
    }

    document.getElementById("kpi-receipt-count").textContent = cmp.curr.count + " hoá đơn";
    document.getElementById("kpi-prev-count").textContent = `${cmp.prevWin.label}: ${cmp.prev.count} hoá đơn`;

    const avg = cmp.curr.activeDays > 0 ? Math.round(cmp.curr.total / cmp.curr.activeDays) : 0;
    document.getElementById("kpi-daily-avg").textContent = formatVnd(avg);

    const topCat = [...cmp.categoryRows].sort((a, b) => b.current - a.current)[0];
    document.getElementById("kpi-top-cat").textContent =
      topCat && topCat.current > 0 ? `Nhóm lớn nhất: ${topCat.category}` : "Nhóm lớn nhất: chưa có";

    renderSvgComparisonChart(cmp.categoryRows);
    renderAnalyticsTable(cmp.categoryRows);
    renderTrendInsights(cmp);
  }

  function renderSvgComparisonChart(rows) {
    const wrap = document.getElementById("analytics-svg-wrap");
    if (rows.length === 0) {
      wrap.innerHTML =
        '<div class="draft-empty" style="min-height:210px;"><p>Chưa có hoá đơn trong khoảng thời gian này (G10 — không tự ước lượng).</p></div>';
      return;
    }

    const width = Math.max(460, rows.length * 88 + 60);
    const height = 240;
    const padLeft = 56;
    const padBottom = 42;
    const plotH = height - padBottom - 20;
    const maxVal = Math.max(...rows.flatMap((r) => [r.current, r.previous]), 10000);

    const bars = rows
      .map((row, idx) => {
        const groupX = padLeft + idx * 84 + 10;
        const hCurr = Math.max(4, Math.round((row.current / maxVal) * plotH));
        const hPrev = Math.max(4, Math.round((row.previous / maxVal) * plotH));
        const yCurr = 20 + plotH - hCurr;
        const yPrev = 20 + plotH - hPrev;
        const shortCat = row.category.length > 10 ? row.category.slice(0, 9) + "…" : row.category;

        return `
          <g>
            <rect x="${groupX}" y="${yPrev}" width="22" height="${hPrev}" rx="6" fill="#bae6fd" stroke="#7dd3fc"></rect>
            <rect x="${groupX + 26}" y="${yCurr}" width="22" height="${hCurr}" rx="6" fill="#0284c7"></rect>
            <text x="${groupX + 24}" y="${height - 18}" text-anchor="middle" font-size="11" fill="#0c3b66" font-weight="600">${escapeHtml(shortCat)}</text>
            <text x="${groupX + 37}" y="${Math.max(13, yCurr - 5)}" text-anchor="middle" font-size="10" fill="#0369a1" font-weight="700">${formatCompactVnd(row.current)}</text>
          </g>
        `;
      })
      .join("");

    wrap.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Biểu đồ so sánh chi tiêu theo danh mục">
        <line x1="${padLeft - 8}" y1="${20 + plotH}" x2="${width - 12}" y2="${20 + plotH}" stroke="#7dd3fc" stroke-width="1.5"></line>
        <text x="${padLeft - 12}" y="26" text-anchor="end" font-size="10" fill="#0369a1">${formatCompactVnd(maxVal)}</text>
        <text x="${padLeft - 12}" y="${20 + plotH}" text-anchor="end" font-size="10" fill="#0369a1">0</text>
        ${bars}
      </svg>
    `;
  }

  function renderAnalyticsTable(rows) {
    const body = document.getElementById("analytics-table-body");
    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="muted-sm">Chưa có dữ liệu chi tiêu trong kỳ này.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((r) => {
        const cls = r.diff > 0 ? "up" : r.diff < 0 ? "down" : "";
        const prefix = r.diff > 0 ? "↑ +" : r.diff < 0 ? "↓ " : "";
        return `
          <tr>
            <td><strong>${escapeHtml(r.category)}</strong></td>
            <td class="num">${formatVnd(r.current)}</td>
            <td class="num">${formatVnd(r.previous)}</td>
            <td class="num"><span class="delta-pill ${cls}">${prefix}${formatVnd(r.diff)}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderTrendInsights(cmp) {
    const box = document.getElementById("trend-insights-body");
    if (cmp.curr.count === 0) {
      box.innerHTML = `<div class="insight-item">Kỳ <strong>${escapeHtml(cmp.currWin.label)}</strong> chưa có hoá đơn nào. Hệ thống không tự ước lượng số liệu (nguyên tắc G10).</div>`;
      return;
    }

    const items = [];
    const sortedCurr = [...cmp.categoryRows].sort((a, b) => b.current - a.current);
    const top = sortedCurr[0];
    if (top && top.current > 0) {
      const share = Math.round((top.current / cmp.curr.total) * 100);
      items.push(
        `Khoản chi lớn nhất trong <strong>${escapeHtml(cmp.currWin.label)}</strong> là <strong>${escapeHtml(top.category)}</strong> với <strong>${formatVnd(top.current)}</strong> (chiếm ${share}% tổng chi kỳ).`
      );
    }

    if (cmp.prev.count > 0) {
      const dirWord = cmp.diff > 0 ? "tăng" : cmp.diff < 0 ? "giảm" : "giữ nguyên";
      items.push(
        `So với <strong>${escapeHtml(cmp.prevWin.label)}</strong> (${formatVnd(cmp.prev.total)}), tổng chi tiêu <strong>${dirWord} ${formatVnd(Math.abs(cmp.diff))}</strong> (${cmp.pct >= 0 ? "+" : ""}${cmp.pct}%).`
      );

      const biggestShift = [...cmp.categoryRows].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
      if (biggestShift && biggestShift.diff !== 0) {
        const shiftWord = biggestShift.diff > 0 ? "tăng thêm" : "giảm bớt";
        items.push(
          `Xu hướng thay đổi rõ nhất nằm ở nhóm <strong>${escapeHtml(biggestShift.category)}</strong> (${shiftWord} <strong>${formatVnd(Math.abs(biggestShift.diff))}</strong> so với kỳ trước).`
        );
      }
    } else {
      items.push(
        `Kỳ trước (<strong>${escapeHtml(cmp.prevWin.label)}</strong>) chưa có dữ liệu đối chiếu, cần thêm hoá đơn ở kỳ trước để thấy xu hướng tăng/giảm.`
      );
    }

    box.innerHTML = items.map((t) => `<div class="insight-item">${t}</div>`).join("");
  }

  async function handleQaSubmit(question) {
    const q = question.trim();
    if (!q) return;
    const outBox = document.getElementById("qa-answer-box");
    outBox.textContent = "Đang tổng hợp từ công cụ backend...";

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.output) {
          outBox.textContent = data.output;
          return;
        }
      }
    } catch (_err) {}

    const cmp = comparePeriodData(state.analyticsPeriod, state.analyticsAnchor);
    if (cmp.curr.count === 0) {
      outBox.textContent = `Trong ${cmp.currWin.label} chưa có hoá đơn nào được lưu nên chưa thể thống kê (G10).`;
      return;
    }
    const top = [...cmp.categoryRows].sort((a, b) => b.current - a.current)[0];
    outBox.textContent =
      `Số liệu đối chiếu (${cmp.currWin.label}):\n` +
      `• Tổng chi: ${formatVnd(cmp.curr.total)} (${cmp.curr.count} hoá đơn).\n` +
      `• So với ${cmp.prevWin.label}: ${cmp.diff >= 0 ? "tăng +" : "giảm "}${formatVnd(Math.abs(cmp.diff))}` +
      (cmp.pct !== null ? ` (${cmp.pct >= 0 ? "+" : ""}${cmp.pct}%).\n` : ".\n") +
      `• Nhóm chi lớn nhất: ${top ? `${top.category} (${formatVnd(top.current)})` : "chưa có"}.`;
  }

  function renderGuide() {
    const q = state.guideQuery.trim().toLowerCase();
    const listWrap = document.getElementById("guide-steps-list");
    const filtered = GUIDE_ITEMS.filter((item) => {
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q) ||
        item.steps.some((s) => s.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      listWrap.innerHTML =
        '<div class="card"><p class="muted">Không tìm thấy bước hướng dẫn khớp từ khoá "' +
        escapeHtml(state.guideQuery) +
        '". Hãy thử từ khoá ngắn hơn như: chụp, ngày, lịch, tuần.</p></div>';
      return;
    }

    listWrap.innerHTML = "";
    filtered.forEach((item, idx) => {
      const isOpen = q ? true : state.guideOpenIds.has(item.id);
      const card = document.createElement("div");
      card.className = "guide-item" + (isOpen ? " open" : "");

      card.innerHTML = `
        <button type="button" class="guide-trigger" aria-expanded="${isOpen}">
          <div class="guide-trigger-left">
            <span class="guide-num">${idx + 1}</span>
            <span class="guide-title">${escapeHtml(item.title)}</span>
          </div>
          <svg class="guide-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="guide-body">
          <ol>${item.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
          <button type="button" class="btn btn-soft btn-sm btn-go-feature">Đi tới màn hình này &rarr;</button>
        </div>
      `;

      card.querySelector(".guide-trigger").addEventListener("click", () => {
        if (state.guideOpenIds.has(item.id)) {
          state.guideOpenIds.delete(item.id);
        } else {
          state.guideOpenIds.add(item.id);
        }
        renderGuide();
      });

      card.querySelector(".btn-go-feature").addEventListener("click", () => {
        switchView(item.view);
        if (item.mode) setCaptureMode(item.mode);
      });

      listWrap.appendChild(card);
    });
  }

  function startTour(index) {
    state.tourIndex = index || 0;
    document.getElementById("tour-overlay").classList.remove("hidden");
    showTourStep();
  }

  function endTour() {
    document.getElementById("tour-overlay").classList.add("hidden");
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch (_err) {}
  }

  function showTourStep() {
    const step = TOUR_STEPS[state.tourIndex];
    if (!step) {
      endTour();
      return;
    }

    switchView(step.view);
    if (step.mode) setCaptureMode(step.mode);

    document.getElementById("tour-step-badge").textContent = `Bước ${state.tourIndex + 1} / ${TOUR_STEPS.length}`;
    document.getElementById("tour-title").textContent = step.title;
    document.getElementById("tour-desc").textContent = step.desc;
    document.getElementById("tour-prev-btn").disabled = state.tourIndex === 0;
    document.getElementById("tour-next-btn").textContent =
      state.tourIndex === TOUR_STEPS.length - 1 ? "Hoàn tất" : "Tiếp theo";

    const dotsWrap = document.getElementById("tour-dots");
    dotsWrap.innerHTML = TOUR_STEPS.map(
      (_, i) => `<span class="tour-dot ${i === state.tourIndex ? "active" : ""}"></span>`
    ).join("");

    requestAnimationFrame(() => positionTourSpotlight(step.target));
  }

  function positionTourSpotlight(selector) {
    const target = document.querySelector(selector);
    const spot = document.getElementById("tour-spotlight");
    const popover = document.getElementById("tour-popover");

    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const pad = 8;
      spot.style.top = Math.max(8, rect.top - pad) + "px";
      spot.style.left = Math.max(8, rect.left - pad) + "px";
      spot.style.width = Math.min(window.innerWidth - 16, rect.width + pad * 2) + "px";
      spot.style.height = Math.max(44, rect.height + pad * 2) + "px";

      const popH = popover.offsetHeight || 200;
      const popW = popover.offsetWidth || 340;
      let top = rect.bottom + 16;
      if (top + popH > window.innerHeight - 16) {
        top = Math.max(16, rect.top - popH - 16);
      }
      const left = Math.min(window.innerWidth - popW - 14, Math.max(14, rect.left));
      popover.style.top = top + "px";
      popover.style.left = left + "px";
    }, 180);
  }

  function bindEvents() {
    document.querySelectorAll(".dock-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
    document.getElementById("btn-open-guide").addEventListener("click", () => switchView("guide"));
    document.getElementById("btn-restart-tour").addEventListener("click", () => startTour(0));
    document.getElementById("btn-guide-restart-tour").addEventListener("click", () => startTour(0));

    document.getElementById("mode-camera-btn").addEventListener("click", () => setCaptureMode("camera"));
    document.getElementById("mode-upload-btn").addEventListener("click", () => setCaptureMode("upload"));

    document.getElementById("btn-start-camera").addEventListener("click", startCamera);
    document.getElementById("btn-shutter").addEventListener("click", capturePhotoFromCamera);
    document.getElementById("btn-stop-camera").addEventListener("click", stopCamera);
    document.getElementById("btn-sample-clear").addEventListener("click", () => {
      setCameraPreview(createSampleReceiptImage("clear"), "clear");
      showToast("Đã nạp ảnh hoá đơn mẫu cho hôm nay.");
    });
    document.getElementById("btn-sample-blurry").addEventListener("click", () => {
      setCameraPreview(createSampleReceiptImage("blurry"), "blurry");
      showToast("Đã nạp ảnh hoá đơn mờ để thử nguyên tắc G10.");
    });

    document.getElementById("upload-date").addEventListener("change", () => {
      document.getElementById("upload-date-box").classList.remove("needs-attention");
      updateActiveTargetDateLabel();
    });
    document.querySelectorAll("[data-quick-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = Number(btn.dataset.quickDate);
        document.getElementById("upload-date").value = shiftIsoDate(todayIso(), delta);
        document.getElementById("upload-date-box").classList.remove("needs-attention");
        updateActiveTargetDateLabel();
      });
    });

    const fileInput = document.getElementById("upload-file-input");
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleUploadFile(e.target.files[0]);
    });

    const dropzone = document.getElementById("dropzone");
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleUploadFile(e.dataTransfer.files[0]);
    });

    document.getElementById("btn-upload-sample").addEventListener("click", () => {
      setUploadPreview(createSampleReceiptImage("upload"), "bien-lai-vi-mau.jpg");
      if (!document.getElementById("upload-date").value) {
        document.getElementById("upload-date").value = shiftIsoDate(todayIso(), -1);
        updateActiveTargetDateLabel();
      }
      showToast("Đã nạp ảnh biên lai mẫu.");
    });

    document.getElementById("btn-extract-ai").addEventListener("click", extractReceiptToDraft);
    document.getElementById("btn-add-item").addEventListener("click", () => {
      if (!state.draft) return;
      state.draft.items.push({ name: "", price: 0 });
      renderDraftForm();
    });
    ["draft-merchant", "draft-date", "draft-note"].forEach((id) => {
      document.getElementById(id).addEventListener("input", refreshDraftValidationAndTotal);
    });
    document.getElementById("btn-discard-draft").addEventListener("click", () => {
      state.draft = null;
      renderDraftForm();
      showToast("Đã huỷ bản nháp.");
    });
    document.getElementById("draft-form").addEventListener("submit", confirmSaveDraft);

    document.getElementById("btn-prev-month").addEventListener("click", () => {
      state.calendarMonth -= 1;
      if (state.calendarMonth < 0) {
        state.calendarMonth = 11;
        state.calendarYear -= 1;
      }
      renderCalendar();
    });
    document.getElementById("btn-next-month").addEventListener("click", () => {
      state.calendarMonth += 1;
      if (state.calendarMonth > 11) {
        state.calendarMonth = 0;
        state.calendarYear += 1;
      }
      renderCalendar();
    });
    document.getElementById("btn-jump-today").addEventListener("click", () => {
      const t = todayIso();
      const [y, m] = t.split("-").map(Number);
      state.calendarYear = y;
      state.calendarMonth = m - 1;
      state.selectedDate = t;
      renderCalendar();
      renderDayDetail(t);
    });
    document.getElementById("btn-add-for-day").addEventListener("click", () => {
      switchView("capture");
      setCaptureMode("upload");
      document.getElementById("upload-date").value = state.selectedDate;
      updateActiveTargetDateLabel();
      showToast("Đã chọn sẵn ngày " + formatDisplayDate(state.selectedDate) + " để bạn tải hoá đơn.");
    });

    document.querySelectorAll(".period-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".period-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.analyticsPeriod = btn.dataset.period;
        renderAnalytics();
      });
    });
    document.getElementById("btn-period-prev").addEventListener("click", () => {
      state.analyticsAnchor = getPeriodWindow(state.analyticsPeriod, state.analyticsAnchor, -1).anchor;
      renderAnalytics();
    });
    document.getElementById("btn-period-next").addEventListener("click", () => {
      state.analyticsAnchor = getPeriodWindow(state.analyticsPeriod, state.analyticsAnchor, 1).anchor;
      renderAnalytics();
    });
    document.getElementById("qa-form").addEventListener("submit", (e) => {
      e.preventDefault();
      handleQaSubmit(document.getElementById("qa-input").value);
    });
    document.querySelectorAll(".qa-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("qa-input").value = btn.dataset.q;
        handleQaSubmit(btn.dataset.q);
      });
    });

    document.getElementById("guide-search").addEventListener("input", (e) => {
      state.guideQuery = e.target.value;
      renderGuide();
    });
    document.getElementById("btn-expand-all-guide").addEventListener("click", () => {
      const allOpen = state.guideOpenIds.size === GUIDE_ITEMS.length;
      if (allOpen) {
        state.guideOpenIds.clear();
        document.getElementById("btn-expand-all-guide").textContent = "Mở tất cả";
      } else {
        GUIDE_ITEMS.forEach((g) => state.guideOpenIds.add(g.id));
        document.getElementById("btn-expand-all-guide").textContent = "Thu gọn";
      }
      renderGuide();
    });
    document.getElementById("btn-reset-demo-data").addEventListener("click", async () => {
      let resetOk = false;
      try {
        const res = await fetch("/api/receipts/reset-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.receipts)) {
            state.receipts = data.receipts;
            resetOk = true;
          }
        }
      } catch (_err) {}
      if (!resetOk) {
        state.receipts = SEED_RECEIPTS.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) }));
      }
      saveReceiptsLocal(state.receipts);
      renderCalendar();
      renderDayDetail(state.selectedDate);
      renderAnalytics();
      showToast("Đã khôi phục 17 hoá đơn mẫu trong CSDL.");
    });

    document.getElementById("tour-skip-btn").addEventListener("click", endTour);
    document.getElementById("tour-prev-btn").addEventListener("click", () => {
      if (state.tourIndex > 0) {
        state.tourIndex -= 1;
        showTourStep();
      }
    });
    document.getElementById("tour-next-btn").addEventListener("click", () => {
      if (state.tourIndex < TOUR_STEPS.length - 1) {
        state.tourIndex += 1;
        showTourStep();
      } else {
        endTour();
        switchView("capture");
        showToast("Hoàn tất hướng dẫn! Bạn có thể xem lại bất kỳ lúc nào.");
      }
    });
    window.addEventListener("resize", () => {
      if (!document.getElementById("tour-overlay").classList.contains("hidden")) {
        positionTourSpotlight(TOUR_STEPS[state.tourIndex].target);
      }
    });
  }

  async function init() {
    const t = todayIso();
    document.getElementById("camera-today-label").textContent = formatDisplayDate(t);
    const [y, m] = t.split("-").map(Number);
    state.calendarYear = y;
    state.calendarMonth = m - 1;
    state.selectedDate = t;
    state.analyticsAnchor = t;

    updateActiveTargetDateLabel();
    bindEvents();
    renderCalendar();
    renderDayDetail(state.selectedDate);
    renderGuide();

    await syncReceiptsFromBackend();

    let tourDone = false;
    try {
      tourDone = localStorage.getItem(TOUR_KEY) === "1";
    } catch (_err) {
      tourDone = false;
    }
    if (!tourDone) {
      setTimeout(() => startTour(0), 250);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
