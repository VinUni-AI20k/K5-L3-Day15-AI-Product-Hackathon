# PLAN · Track D · Kiểm người bán đồ cũ trước khi chuyển cọc

> Đề xuất chi tiết: [de-xuat-do-cu.md](de-xuat-do-cu.md). Plan này chia việc theo 4 checkpoint. Giả định nhóm 4 người: **A** (đội trưởng, sản phẩm), **B** (bằng chứng), **C** (code), **D** (eval và chi phí). Nhóm 3 người thì gộp việc của B và D.

**Lát cắt:** *Một người mua điện thoại cũ · dán tin đăng và đoạn chat với người bán · AI quyết định "tương đối an toàn / cần kiểm thêm / có dấu hiệu lừa đảo", kèm lý do và bước kiểm · người mua không chuyển cọc cho người bán giả, không bỏ oan người bán thật.*

## Đã có
- [x] 5000 review Chợ Tốt (`evidence/raw-chotot_reviews.csv`, không commit) và script `evidence/scrape_chotot.py`
- [x] Đếm thô: 190/5000 (3,8%) nhắc lừa đảo · 2026: 46/770 (6,0%) · 5 trích dẫn nguyên văn
- [x] Cảnh báo công khai của công an năm 2026 (link trong đề xuất)
- [x] Thiết kế workflow 5 bước, luật cứng, chuẩn "đạt", 12 tình huống khó

---

## Chặng 1 · Ngay bây giờ → CP1 17:00 Thứ Sáu 27/11 (3đ)

| Việc | Ai | Ra file |
|---|---|---|
| Tạo repo công khai `K5-Day15-L3B-<TenNhom>`, chép nội dung `starter-repo/` vào gốc repo, mời thành viên | A | repo |
| Điền `TEAMS.md` đúng format, đội trưởng ở dòng 1, chạy `python run.py check` | A | `TEAMS.md` |
| Điền `canvas.md` đủ 7 dòng (lấy câu ở §0 đề xuất) | A | `canvas.md` |
| **Gửi khảo sát 7 câu** (Google Form) lên Discord lớp và nhóm bạn, mục tiêu ≥25 người | B | link form |
| Hẹn 3 người phỏng vấn: 2 người hay mua đồ cũ, 1 người hay bán | B | lịch hẹn |
| Hỏi lab coach: hướng này tính Track D được không (giáp Track E) | A | — |

**Nộp CP1:** TEAMS.md · Track D + bài toán 1–2 câu (không chữ AI) · lát cắt 1 câu · canvas · link repo (mở thử bằng cửa sổ ẩn danh).

---

## Chặng 2 · 17:00 → CP2 19:30 Thứ Sáu 27/11 (4đ)

| Việc | Ai | Ra file |
|---|---|---|
| Viết định nghĩa nhãn `bi_lua_coc` và cách chọn mẫu (khoảng 500 review có từ khoá + 300 review ngẫu nhiên) **trước khi đếm** | B | `evidence/data-mining.md` |
| Bắt đầu gắn nhãn tay, cho 2 người cùng chấm 30 dòng để kiểm độ khớp | B, D | cột `nhan_tay` |
| Viết `spec.md` §0–§4, có sơ đồ workflow (Mermaid) | A | `spec.md` |
| Dựng data "Chợ Mẫu" có seed: giá tham chiếu, tin đăng, người bán, TK cảnh báo, ~30 đoạn chat | C | `data/*.csv`, `data/chat/` |
| Viết 4 công cụ + luồng 5 bước, chạy được với AI giả | C | `codebase/tools.py`, `agent.py` |
| Viết ≥10 câu thử đầu tiên (có ≥3 câu lấy từ review, `source = data_that: chotot Cxxxx`) | D | `eval/benchmark.csv` |
| Viết `metric_spec.yaml` (6 metric trong đề xuất §5) và `DATA_CARD.md` bản đầu | D | `eval/`, `data/` |
| **Chốt chuẩn "đạt"** trong `spec.md` §7 (từ đây không được sửa) | A + D | `spec.md` §7 |

**Chuẩn "đạt" đề xuất chốt:** *Đạt khi ≥75% câu đúng mức, **và** 0 ca lừa bị báo "tương đối an toàn", **và** ≤1/8 ca người bán thật bị báo lừa, **và** 100% số liệu trong lý do khớp công cụ.*

**Nộp CP2:** canvas cập nhật + dòng "đã đổi gì" · tiến độ bằng chứng · link `spec.md` có sơ đồ · link benchmark ≥10 câu · metric_spec + DATA_CARD · chuẩn "đạt" · `python run.py` chạy hết luồng với AI giả.

---

## Chặng 3 · Tối Thứ Sáu → CP3 10:00 Thứ Bảy 28/11 (4đ)

| Việc | Ai | Ra file |
|---|---|---|
| Nối model thật (`.env` + `codebase/ai.py`), `python run.py eval --try` thấy token > 0. **Nên xong trước khi ngủ** | C | `codebase/ai.py` |
| Gắn nhãn tay xong, đếm x/N và %, chọn ≥5 trích dẫn | B | `evidence/data-mining.md` |
| Đóng khảo sát (≥20 người ngoài nhóm), tổng hợp số. Ghi 3 file phỏng vấn | B | `evidence/survey/`, `evidence/interviews/P1–P3.md` |
| Viết `evidence/summary.md`: số chính + kết luận giả thuyết đúng, sai hay phải đổi | B | `evidence/summary.md` |
| Đủ **20–30 câu thử**: ≥5 `kho`, ≥2 `tu_choi`, ≥1/3 `data_that` hoặc `nguoi_dung` | D | `eval/benchmark.csv` |
| Chạy **lượt 1** (`python run.py eval`), chấm cột `pass` theo metric, `python run.py score` | D | `eval/run-1.csv` |
| Thử mô phỏng chi phí 10 phiên (`python run.py simulate --try`) | D | `cost/simulate-try.csv` |
| Quay **video 30 giây** bản chạy thử gọi AI thật, đưa lên YouTube "Không công khai" | C | link video |
| Hoàn thiện `spec.md` §0–§7, điền bảng impact §2 (có hướng người bán bị loại, số từ cùng bộ review) | A | `spec.md` |

**Nộp CP3:** bằng chứng đạt ngưỡng + ≥5 trích dẫn · bộ câu thử 20–30 câu · video 30 giây · kết quả lượt 1 (x/N) + run ID · `spec.md` §0–§7.

---

## Chặng 4 · 10:00 → CP4 14:30 Thứ Bảy 28/11 (4đ)

| Việc | Ai | Ra file |
|---|---|---|
| Đọc trace các câu trượt ở lượt 1, sửa prompt hoặc luật. **Ghi mỗi thay đổi vào `spec.md` §10** | C | `codebase/`, `spec.md` §10 |
| Chạy **lượt 2**, chấm, so sánh lượt 1 → lượt 2 | D | `eval/run-2.csv`, `eval/report.md` |
| Điền `cost/personas.yaml` (số lần dùng/tháng từ khảo sát, giá 2 model từ `further-reading/model-prices.csv`), chạy `python run.py simulate` (≥50 phiên) | D | `cost/simulate-N.csv`, `cost/cost-estimate.md` |
| *Bonus:* 2–3 người ngoài nhóm dùng thử, ghi log | B | `validation/log.md` |
| Làm slide → `demo-slides.pdf` ở gốc repo: có trang "Đánh giá thế nào" và "Chi phí khi dùng thật". Quay video demo dự phòng | A | `demo-slides.pdf` |

**Nộp CP4:** phòng demo + repo · tích 7 hạng mục · lượt 1 → lượt 2 · chi phí / task thành công + tên model · slide PDF + video dự phòng.

---

## Sau demo → 23:59 Thứ Bảy 28/11
- Sửa theo góp ý, ghi mọi thay đổi vào `spec.md` §10. **Không** sửa chuẩn "đạt", câu thử, số bằng chứng, kết quả các lượt đã chạy.
- Mỗi người một file `reflection/<ten>.md`.

---

## Luật phải nhớ
- **Không commit:** `.env`, API key, `evidence/raw-*.csv` (toàn văn review). Repo chỉ chứa bảng đếm và trích dẫn ≤2 câu mỗi review, không tên người viết.
- Data chạy thử dùng tên và số dựng. Không dùng chat, số tài khoản, số điện thoại thật.
- Người trong nhóm không tính là bằng chứng.
- Kết quả thấp mà trung thực vẫn được đủ điểm. Sửa số hoặc đổi chuẩn "đạt" sau CP2 thì phần đó 0 điểm.

## Rủi ro và phương án dự phòng
| Rủi ro | Dự phòng |
|---|---|
| Khảo sát không đủ 20 người trước CP3 | Bằng chứng chính chuyển sang đào review (gắn nhãn tay đạt ngưỡng x/N). Phỏng vấn 3 người làm nguồn kiểm lại |
| Lab coach nói hướng này thuộc Track E | Báo đổi track trước CP2 (luật cho phép), giữ nguyên thiết kế |
| Gói model miễn phí hết lượt | Thêm `--wait 4` khi chạy eval và simulate, hoặc đổi model rẻ hơn, ghi vào §10 |
| AI báo oan nhiều ca người bán thật | Thêm câu thử "rẻ vì máy xấu" vào lượt 2, chỉnh luật vàng/đỏ, ghi §10 |
