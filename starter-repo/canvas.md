# Canvas — SauBa · Track A

> Điền ở guide bước 1.4. CP1 17:00 Thứ Sáu 27/11: nộp bản đầu, đủ 7 dòng (dòng 4 được ghi giả thuyết + nguồn sẽ kiểm).
> CP2 19:30 Thứ Sáu 27/11: cập nhật (số bằng chứng đầu, lát cắt đã chốt) và điền dòng "Đã đổi gì so với CP1".
> Track F: chép thêm thẻ đề của nhóm (khung trong file track F) xuống dưới bảng này.

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | **Track A · EdTech (hướng riêng, gần A1/A4).** Lát cắt: phân tích bài kiểm tra đã chấm của một buổi → xác định nhóm kiến thức yếu → sinh lộ trình ôn tập theo khung giờ rảnh người học nhập. |
| 2 | Người dùng chính (một vai cụ thể — không phải "học viên nói chung") | Học viên AI20K khoá 5 vừa làm xong bài kiểm tra trước/sau buổi (pre/post test) trên trang pre-class, có sai vài câu, và vừa học vừa đi làm nên chỉ rảnh vài khung giờ ngắn trong tuần. |
| 3 | Pain một câu: ai — đang làm gì — vướng đâu — hậu quả | Học viên AI20K — sau khi nhận kết quả bài kiểm tra đã chấm — phải tự dò lại từng câu sai để biết mình hổng ý kiến thức nào và tự xếp lịch ôn cho vừa quỹ giờ ít ỏi — nên mất nhiều thời gian rà soát, ôn dàn trải hoặc bỏ ôn, và mang chỗ hổng sang các buổi sau. |
| 4 | Bằng chứng đầu — CP1: giả thuyết + nguồn sẽ kiểm · CP2: số đầu tiên + 1 trích dẫn | **Giả thuyết:** phần lớn học viên làm bài có sai rải rác ở nhiều ý kiến thức, nhưng không quay lại ôn đúng các ý đó. **Số đếm sơ bộ** (`data/preclass/answers.csv`, `nguon = pre_post_post`): 1.970 lượt trả lời của 77 học viên, 20,3% sai; 69/77 học viên sai ≥1 câu, trung vị 4 ý kiến thức (`kc_code`) sai mỗi người. **Sẽ kiểm:** (a) data: sau khi sai một `kc_code`, bao nhiêu học viên có mở lại bài / xem lại video chứa ý đó (`events.csv`); (b) phỏng vấn ≥4 học viên trong lớp: lần gần nhất sai bài kiểm tra thì làm gì tiếp, mất bao lâu, có lên lịch ôn không; (c) khảo sát nhanh trong lớp về số giờ rảnh/tuần. |
| 5 | **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả) | Một học viên AI20K · đưa bài kiểm tra đã chấm của một buổi và các khung giờ rảnh trong tuần · AI quyết định những ý kiến thức nào cần ôn (kèm câu sai và đoạn bài làm căn cứ) và xếp chúng vào khung giờ nào · học viên nhận một lộ trình ôn vừa quỹ giờ mà tự kiểm được vì sao mỗi mục có mặt. |
| 6 | AI tự làm đến đâu + 1 dòng lý do: sai thì ai chịu gì | **Gợi ý, người học duyệt.** AI tự chẩn đoán và đề xuất lộ trình nháp, mỗi mục kèm câu sai + đoạn bài làm căn cứ; học viên sửa / chấp nhận. AI **không** tự gửi nhắc lịch, không ghi vào lịch cá nhân, không sửa điểm. Lý do: chẩn đoán sai thì học viên ôn nhầm chỗ, tốn giờ vốn đã ít và bỏ sót lỗ hổng thật; hiện căn cứ để học viên tự phát hiện, còn tác động ra ngoài thì chỉ là bản nháp. |
| 7 | Phân công có tên | **Bùi Anh Dũng** (đội trưởng, SE & DevOps): repo, `agent.py`/`ai.py`, nối model, chặn rủi ro, tracing · **Lê Hoàng Anh** (SE): `tools.py` (đọc bài đã chấm, tra ý kiến thức, xếp lịch) + `app.py`, cải tiến lượt 2 · **Vương Xuân Dương** (SE): `eval/` bộ câu thử + metric, `cost/`, `DATA_CARD.md` · **Phan Văn Cường** (BA): phỏng vấn, khảo sát, đào data (`evidence/`), `spec.md`, slide. Cả nhóm: mỗi người hỏi ≥1 học viên. |
| — | *(CP2)* Đã đổi gì so với CP1 | |
