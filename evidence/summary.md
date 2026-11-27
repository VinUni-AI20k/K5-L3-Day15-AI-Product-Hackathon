# Tổng hợp bằng chứng pain

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).
> **Trạng thái hiện tại (CP2 · 27/11/2026 19:15):** Đã thu thập **6 phản hồi khảo sát thực tế** (`n = 6`, lưu ẩn danh tại `evidence/survey/results.csv`). Vì `n < 10`, chỉ ghi tỉ lệ `x/6`, **không ghi %** và **chưa đạt ngưỡng CP3** (cần ≥20 phiếu khảo sát hoặc ≥3 phỏng vấn sâu).
> **Cập nhật CP3 (27/11/2026):** thêm **6 tình huống thật S1–S6 do TV1 cung cấp** (tóm tắt theo vai, không tên, không trích nguyên văn; xem `docs/HANDOFF-TV4-nguon-nguoi-dung.md` và `eval/benchmark.csv` B21–B30). Đây là nguồn cho cột `source` của benchmark, **không thay thế** 6 phiếu khảo sát hay phỏng vấn; T03 vẫn chưa đạt AC.

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Đào data (x/N, %, cách đếm chạy lại được, ≥5 ví dụ) | ☐ *(không sử dụng data thô BTC cho lát cắt A3)* | `evidence/data-mining.md` |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☐ *(0/3 — đang triển khai)* | `evidence/interviews/` |
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☐ *(6/20 — đang tiếp tục thu thập)* | `evidence/survey/results.csv` |
| Tình huống thật S1–S6 (tóm tắt, TV1 cung cấp) | ⚠️ *không tính ngưỡng R1* | `docs/HANDOFF-TV4-nguon-nguoi-dung.md` · `eval/benchmark.csv` B21–B30 |

## 2. Số chính *(dữ liệu sơ bộ từ khảo sát n = 6, không ghi % vì n < 10)*

- **Khảo sát (`evidence/survey/results.csv`, n = 6, thu từ 18:12 đến 18:30 ngày 27/11/2026):**
  - **Phân bố đối tượng:** Tiểu học `2/6` (`S1, S3`) · Mầm non `1/6` (`S4`) · Trung học cơ sở `1/6` (`S6`) · Cao đẳng/Đại học `1/6` (`S2`) · Lab Coach AI20k `1/6` (`S5`).
  - **Tần suất tạo trò chơi:** `1–2 lần`: `4/6` (`S1, S2, S5, S6`) · `3–5 lần`: `1/6` (`S3`) · `Trên 10 lần`: `1/6` (`S4`).
  - **Công cụ đang sử dụng (chọn nhiều):** Quizizz/Wayground `5/6` · PowerPoint/Google Slides `4/6` · Kahoot `2/6` · Blooket `1/6` · tạo bot trên tele cho học viên thực hành tấn công `1/6`.
  - **Khoảng thời gian chuẩn bị** *(dữ liệu dạng khoảng — không tính trung bình điểm vì không có giá trị phút cụ thể từng người)*:
    - `Từ 10 đến dưới 20 phút`: `3/6` (`S1, S2, S6`)
    - `Từ 20 đến dưới 30 phút`: `1/6` (`S3`)
    - `Từ 30 đến dưới 60 phút`: `1/6` (`S5`)
    - `Từ 60 phút trở lên`: `1/6` (`S4`)
  - **Bước chuẩn bị tốn thời gian / khó khăn (chọn nhiều):** Soạn câu hỏi và đáp án `6/6` · Tìm kiếm công cụ phù hợp `4/6` · Nhập hoặc chuyển đổi bộ câu hỏi `2/6` · Thiết kế giao diện và luật chơi `2/6` · Kiểm tra tính chính xác của nội dung `2/6` · Lựa chọn hình thức tương tác `1/6` · Test bot & set system prompt/guardrails `1/6` (`S5`).
  - **Pain point gặp phải (chọn nhiều):** Hạn chế về thời gian tổ chức `6/6` · Mất nhiều thời gian cấu hình `5/6` · Khó đưa bộ câu hỏi có sẵn vào trò chơi `2/6` · Câu hỏi hoặc đáp án có sai sót `2/6` · Công cụ không phù hợp với mục tiêu bài học `1/6` · Trò chơi gặp lỗi khi sử dụng trên lớp `1/6` · Thiết bị hoặc phần mềm không tương thích `1/6`.
  - **Nhu cầu hình thức tương tác (chọn nhiều):** Chuột hoặc bàn phím `4/6` (`S1, S3, S5, S6`) · Điện thoại cá nhân `2/6` (`S2, S5`) · Trả lời trực tiếp trên lớp `1/6` (`S1`) · Cử chỉ hoặc chuyển động cơ thể `1/6` (`S4`) · Giọng nói `1/6` (`S4`) · Màn hình cảm ứng `1/6` (`S6`).
- **Phỏng vấn:** `0/3` *(chưa có dữ liệu phỏng vấn thực tế)*.

| | Vai | Gặp pain? | Số lần / 1 tháng qua | Lần gần nhất mất | Đang xoay xở bằng |
|---|---|---|---|---|---|
| P1 | *(chờ phỏng vấn)* | | | | |
| P2 | *(chờ phỏng vấn)* | | | | |
| P3 | *(chờ phỏng vấn)* | | | | |

## 3. ≥5 trích dẫn hoặc ví dụ nguyên văn (có nguồn, bỏ tên)

1. `"Các cháu nó hiếu động quá nên bảo tập trung vào trò chơi hơi khó."` — Phiếu khảo sát `S4` (Mầm non)
2. `"Nếu được tăng lương thì tốt, lúc đó tôi sẽ được dùng AI làm cho tiện."` — Phiếu khảo sát `S4` (Mầm non)
3. `"Các LC khóa cũ thỉnh thoảng vẫn hay cho làm Quizz Kahoot cho học viên. Mọi người tham gia cũng khá hào hứng nhưng về sau spam nhiêu quizz quá thành ra nó cũng bị nhàm chán, nên khóa này ko dùng mấy nữa. Hơn nữa là chất lượng câu trả lời cũng chưa được kiểm định kỹ , câu trả lời thiếu thuyết phục, chưa kiểm soát đc hết các bạn cheating"` — Phiếu khảo sát `S5` (Lab Coach AI20k)
4. `"Cần làm tốt khâu chuẩn bị nội dung cho từng Day. Câu hỏi phải thật hay và trọng tâm"` — Phiếu khảo sát `S5` (Lab Coach AI20k)
5. `"Thời gian soạn"` — Phiếu khảo sát `S2` (Cao đẳng/Đại học)

*(Các ô trả lời mở để trống ở `S1, S3, S6` được giữ nguyên trạng thái trống, không suy diễn. 6 tình huống S1–S6 là bản tóm tắt do TV1 cung cấp, **không được cộng vào 5 trích dẫn nguyên văn ở trên**.)*

## 4. Các nguồn có khớp nhau không

Hiện có 1 nguồn sơ bộ (`evidence/survey/results.csv`, `n = 6`) và 6 tình huống tóm tắt S1–S6 do TV1 cung cấp; hai nguồn này cùng hướng nhưng S1–S6 không phải trích nguyên văn. Chưa có nguồn phỏng vấn (`0/3`) để đối chiếu chéo. Sẽ cập nhật sau khi thu thêm khảo sát (đạt ≥20) và/hoặc hoàn tất ≥3 phỏng vấn sâu trước CP3.

## 5. Kết luận & Kiểm chứng sơ bộ giả thuyết

- **Kiểm chứng sơ bộ các giả thuyết trong `evidence/hypothesis.md` (trên mẫu nhỏ `n = 6`, chưa kết luận cuối cùng):**
  1. *Giả thuyết về vấn đề cấu hình & đưa bộ đề vào trò chơi:* **Có tín hiệu ủng hộ mạnh ở khâu cấu hình & soạn bộ đề** — `6/6` gặp khó ở khâu soạn câu hỏi/đáp án và hạn chế thời gian tổ chức; `5/6` mất nhiều thời gian cấu hình; `2/6` khó đưa bộ câu hỏi có sẵn vào trò chơi; `2/6` gặp sai sót câu hỏi/đáp án.
  2. *Giả thuyết về sự cố tương thích / lỗi trên lớp:* **Có tín hiệu xuất hiện nhưng chưa phải đa số trong mẫu nhỏ** — `1/6` (`S6`) gặp lỗi không tương thích thiết bị/phần mềm và `1/6` (`S5`) gặp lỗi trò chơi khi dùng trên lớp.
  3. *Giả thuyết thay thế (điểm nghẽn thực sự nằm ở soạn câu hỏi & thời lượng lớp):* **Rất đáng lưu ý** — `6/6` chọn cả *"Soạn câu hỏi và đáp án"* lẫn *"Hạn chế về thời gian tổ chức"*. Điều này phù hợp trực tiếp với việc MVP v2.2 bổ sung **sinh bộ câu hỏi (`Question Set`) kèm kiểm duyệt HITL** thay vì chỉ chọn vỏ trò chơi.
  4. *Giả thuyết về hình thức tương tác (`Mouse Fallback` & cử chỉ):* **Ủng hộ mạnh `Mouse Fallback`** (`4/6` chọn chuột/bàn phím); nhu cầu cử chỉ/giọng nói xuất hiện rõ ở nhóm Mầm non (`S4`, `1/6`), trong khi nhóm đại học/Lab Coach (`S2, S5`) chuộng điện thoại cá nhân hoặc chuột.
  5. *Tiêu chí giả thuyết `≥30 phút`:* `2/6` (`S4, S5`) tốn `≥30 phút`; `4/6` (`S1, S2, S3, S6`) tốn `10–<30 phút`.
- **Đối chiếu với Problem Statement, Small Slice & MVP v2.2:**
  - Khớp với chiến lược **Reuse-first, Generate-if-needed + Question Generation + HITL + Mouse Fallback** (giảm công cấu hình `5/6`, hỗ trợ soạn & kiểm duyệt câu hỏi `6/6` & `2/6` sai sót đáp án, chống nhàm chán quiz lặp lại như `S5` nêu, đảm bảo chạy được bằng chuột `4/6`).
  - *Lưu ý trung thực:* Chưa có thử nghiệm thực tế đo thời gian *With Agent*, nên **chưa** kết luận sản phẩm đã tiết kiệm thời gian hay chi phí.
- **Hạn chế của mẫu khảo sát hiện tại:**
  - Cỡ mẫu nhỏ (`n = 6`), **chưa đạt ngưỡng CP3 (≥20)**; phân tán qua 5 nhóm đối tượng khác nhau (Mầm non, Tiểu học, THCS, CĐ/ĐH, Lab Coach — trong đó `S5` là Lab Coach AI20k, không thuần giáo viên phổ thông).
  - Thiếu khung thời gian của cột tần suất trong dữ liệu gốc (chưa ghi rõ "trong 1 tuần" hay "trong 1 tháng"), chưa có bộ câu hỏi gốc trong `evidence/survey/questions.md`, và dữ liệu thời gian ở dạng khoảng nên chưa tính được Baseline phút chính xác.
  - Có `3/6` phiếu (`S1, S3, S6`) bỏ trống các ô chia sẻ mở.
- **Baseline bổ sung từ S1:** `10–20 phút` chuẩn bị/trò chơi (tóm tắt tình huống thật, khớp khoảng `3/6` phiếu khảo sát chọn `10–<20 phút`); chưa có tần suất/tháng và With Agent nên chưa tính Impact (T20).
- **Tiến độ CP2 & CP3:**
  - **CP2 (19:30 ngày 27/11):** Đã có bằng chứng đầu thực tế (`n = 6`) và 5 trích dẫn nguyên văn hợp lệ.
  - **CP3 (10:00 ngày 28/11):** Cần thu thêm tối thiểu **14 phiếu khảo sát nữa** (đạt `≥20`) **hoặc** hoàn thành tối thiểu **3 phỏng vấn sâu** (`P1.md`–`P3.md`), kèm `evidence/survey/questions.md`.

## Lịch hẹn (dùng cho CP2 — chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| *(Chưa có lịch hẹn phỏng vấn xác nhận — cập nhật ngay khi có lịch)* | | |
