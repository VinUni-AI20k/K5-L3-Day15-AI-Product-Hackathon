# T13 — Runtime smoke bằng trình duyệt thật

- Thời gian chạy: 2026-11-27 19:15:40
- Trình duyệt: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (headless)
- Lệnh: `python ailab/runtime_smoke.py`
- Nguồn: `ailab/runtime_smoke.py` (stdlib), `contract.secure()` + `sandbox="allow-scripts"`.

## Mouse Fallback (Quiz ABCD, Question Set động 2 câu)

| Tình huống | Trạng thái gửi vào game | Kết quả |
|---|---|---|
| no_model | none | 2/2 |
| model_loading | loading | 2/2 |
| model_failed | model-failed | 2/2 |
| no_camera | no-camera | 2/2 |
| camera_denied | denied | 2/2 |
| camera_off | off | 2/2 |

## Sandbox + CSP

| Kiểm tra | Kết quả |
|---|---|
| Gọi mạng (`fetch`) | blocked |
| Đọc DOM cha (`parent.document`) | blocked |
| Thoát khung (`window.top.location`) | blocked |
| Đọc cookie | blocked |

## Player thứ 2 — Vòng quay nhận nội dung động

- Số mục nhận được: 3 (cần 3)
- Bấm nút Quay có kết quả: True

## Kết luận

**PASS** 6/6 tình huống chơi hết lượt 2/2; CSP/sandbox chặn cả 4 kiểu truy cập; cả 2 Player nhận dữ liệu động.
