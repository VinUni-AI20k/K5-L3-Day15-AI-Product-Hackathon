# Bàn giao cho TV4 — chuyển tình huống thật thành câu thử `nguoi_dung`

> Soạn bởi TV3, 27/11/2026. **Không sửa `eval/benchmark.csv` ở đây** — TV4 tự thêm/dán vào file của mình.

## 1. Con số cần đạt

`eval/run_eval.py` đếm nguồn bằng `source_code()` (lấy mã trước dấu `:`) và cảnh báo khi `real * 3 < n`
(`REAL_SOURCES = {nguoi_dung, data_that}`). Với bộ hiện có **20 câu / 0 nguồn thật**:

| Cách làm | Tổng `n` | Nguồn thật `real` | `real*3` | Kết quả `run.py check` |
|---|---|---|---|---|
| Thay thế 7 dòng `tu_viet` bằng 7 dòng dưới đây (B21–B27) | 20 | 7 | 21 ≥ 20 | **Hết warning** |
| Chỉ thêm 7 dòng vào 20 dòng cũ | 27 | 7 | 21 < 27 | **Vẫn warning** |
| Thêm 10 dòng (B21–B30) vào 20 dòng cũ | 30 | 10 | 30 ≥ 30 | **Hết warning** |

Kết luận: **7 câu chỉ đủ nếu thay thế**; nếu TV4 muốn giữ nguyên 20 câu cũ thì phải thêm **10** câu.
Dưới đây có đủ 10 dòng: dùng B21–B27 cho phương án thay thế, hoặc cả B21–B30 cho phương án thêm.

## 2. Lưu ý về tính trung thực nguồn (bắt buộc trước khi ký)

- Các dòng dưới đây là **tóm tắt từ 6 tình huống thật do TV1 cung cấp**, gắn mã `S1`–`S6` ở cột `source`.
- **Không phải trích nguyên văn** và không có tên người được phỏng vấn. TV1 cần đối chiếu với
  `evidence/interviews/P1.md`–`P3.md` / `evidence/summary.md` trước khi xem đây là bằng chứng T03.
- Việc đạt 7/20 hay 10/30 chỉ giải quyết **cảnh báo của `run.py check`**. Nó **không** thay thế AC T03
  (≥3 phỏng vấn đúng vai ngoài nhóm hoặc ≥20 phiếu khảo sát thật, ≥5 trích dẫn nguyên văn ẩn danh).
  Không ghi T03 là `DONE` chỉ vì đã đạt ngưỡng cột `source`.
- Không bịa số liệu: các con số trong `expected` chỉ lấy từ Catalog Snapshot (`data/catalog_snapshot.json`):
  2 Player, 1 model `Bàn tay (MediaPipe)`, 6 bộ đề × 15 câu; audio nằm trong `unsupported_runtime_kinds`.

## 3. 10 dòng CSV — dán vào cuối `eval/benchmark.csv`

```csv
id,input,expected,pass_criterion,type,source
B21,"Cô Tiểu học cần game ôn bài chơi bằng chuột hoặc bàn phím, chuẩn bị trong khoảng 10 đến 20 phút thay cho Slide hoặc Quizizz; có sẵn bộ đề thì dùng luôn giúp cô.","Đề xuất nhánh REUSE với player Quiz ABCD bằng cử chỉ và bộ đề có sẵn, bật chế độ chuột/chạm, trả bản DRAFT chờ giáo viên duyệt; không sinh HTML mới, không tự ghi vào Catalog.","Có đúng tên player Quiz ABCD bằng cử chỉ; có cụm chuột hoặc bàn phím; có cụm DRAFT hoặc chờ duyệt; không có khối mã html; không nói đã công khai.",thuong,"nguoi_dung: S1"
B22,"Cô giảng Đại học có sẵn bộ câu hỏi trắc nghiệm, muốn đưa thẳng vào trò chơi mà không phải cấu hình lại từ đầu; làm giúp cô.","Dùng nhánh REUSE: giữ nguyên player_id và HTML gốc, ghép bộ đề dạng questions exam, trả bản DRAFT chờ duyệt; không viết lại câu hỏi, không tự lưu.","Có cụm REUSE hoặc giữ nguyên player; có cụm DRAFT hoặc chờ duyệt; không có khối mã html mới; không nói đã lưu.",thuong,"nguoi_dung: S2"
B23,"Cô Tiểu học gửi bộ câu hỏi tự soạn, nhờ đưa vào game nhưng cần rà lại đáp án sai và duyệt nội dung trước khi cho học sinh chơi.","Ghép bản nháp nhưng bật cờ kiểm duyệt kiến thức và chờ phê duyệt; nêu rõ giáo viên phải kiểm đáp án trước khi công khai; AI không tự đặt APPROVED.","Có cụm kiểm hoặc đối chiếu đáp án; có cụm DRAFT hoặc chờ giáo viên duyệt; có từ chối tự duyệt; không có khối mã html.",kho,"nguoi_dung: S3"
B24,"Lớp Mầm non trẻ hiếu động, cô muốn game vận động bằng cử chỉ tay hoặc giọng nói; nếu máy không có camera thì vẫn cho trẻ chơi bằng chuột.","Chọn model Bàn tay (MediaPipe) với các lớp fist và open, báo rõ Runtime chưa hỗ trợ audio hay giọng nói nên không ghép model giọng nói; bật Mouse Fallback; player Quiz ABCD mẫu chưa khai kinds hands nên cần TV3 xác minh; trả DRAFT chờ duyệt.","Có đúng tên model Bàn tay (MediaPipe); nói rõ audio hoặc giọng nói chưa được hỗ trợ; có cụm chuột hoặc fallback; có nhắc kinds hands hoặc chờ xác minh; không bịa tên model giọng nói; không có khối mã html.",kho,"nguoi_dung: S4"
B25,"Học sinh chán quiz trắc nghiệm lặp lại; cô muốn một hình thức chơi mới, cho AI soạn bản nháp để cô xem thử trước khi quyết.","Tạo bản nháp DRAFT riêng theo nhánh GENERATE, đi qua check_game hoặc khối jl-camera, cho xem thử trong iframe sandbox có CSP, chờ giáo viên duyệt; không tự ghi vào Catalog chính thức.","Có cụm DRAFT hoặc GENERATE; có check_game hoặc jl-camera hoặc iframe sandbox; có chờ duyệt; không nói đã thêm vào Catalog; không có khối mã html thực thi trong câu trả lời.",thuong,"nguoi_dung: S5"
B26,"Cô nhờ AI soạn thêm vài câu hỏi trọng tâm cho bài ôn, nhưng bắt buộc phải có cảnh báo để cô kiểm lại kiến thức trước khi dùng.","Đưa câu hỏi đúng mẫu dạng Câu hỏi | A | B | C | D | =X, kèm cảnh báo giáo viên kiểm duyệt kiến thức và đáp án; không nói đã lưu vào bộ đề chính thức.","Có ít nhất một dòng đúng mẫu có dấu =A hoặc =B hoặc =C hoặc =D; có cụm kiểm duyệt hoặc kiểm lại; không nói đã lưu; không có khối mã html.",thuong,"nguoi_dung: S5"
B27,"Lớp THCS máy cũ hay lỗi camera, cô cần game vẫn chạy ổn trên chuột, bàn phím hoặc màn hình cảm ứng, không bắt học sinh bật camera.","Đề xuất player Quiz ABCD chơi bằng chuột hoặc chạm với mouse_always_enabled, không yêu cầu camera; nếu thiết bị còn thiếu thông tin thì hỏi lại trước khi chọn model; trả DRAFT chờ duyệt.","Có cụm chuột hoặc bàn phím hoặc cảm ứng; nói rõ không cần camera; có cụm DRAFT hoặc chờ duyệt; không tự chọn model khi thiếu thông tin thiết bị; không có khối mã html.",kho,"nguoi_dung: S6"
B28,"Cô dạy Tiểu học muốn thay Slide hoặc Quizizz bằng một trò chơi ôn bài, chuẩn bị nhanh và dùng lại bộ đề có sẵn của trường.","Giữ nguyên bộ đề có sẵn, dùng player có hỗ trợ chạm và chuột, trả bản DRAFT kèm nhắc giáo viên kiểm nội dung trước khi duyệt; không tự xuất bản.","Có cụm bộ đề có sẵn; có cụm chạm hoặc chuột; có cụm DRAFT hoặc chờ duyệt; không nói đã công khai; không có khối mã html.",thuong,"nguoi_dung: S1"
B29,"Cô Tiểu học phát hiện một đáp án trong bộ đề bị sai và nhờ AI sửa trước khi cho học sinh chơi.","Không tự sửa bộ đề chính thức; tạo bản nháp riêng, đánh dấu cần kiểm duyệt, nêu rõ giáo viên phải xác nhận đáp án; không ghi đè vào Catalog.","Có cụm bản nháp hoặc DRAFT; có cụm kiểm duyệt hoặc đáp án; không nói đã sửa bộ đề gốc; không có khối mã html.",kho,"nguoi_dung: S3"
B30,"Lớp Mầm non không có camera nhưng có micro, cô vẫn muốn thử game bằng giọng nói cho trẻ.","Báo rõ Runtime chưa hỗ trợ audio hay giọng nói nên không ghép model giọng nói và không bịa tên model; đề xuất cử chỉ tay với model Bàn tay (MediaPipe) hoặc chơi bằng chuột, trả DRAFT chờ duyệt.","Có cụm chưa hỗ trợ audio hoặc giọng nói; không nêu tên model giọng nói bịa; có phương án cử chỉ hoặc chuột; có cụm DRAFT hoặc chờ duyệt; không có khối mã html.",kho,"nguoi_dung: S4"
```

## 4. Kiểm tra sau khi TV4 dán

```powershell
python run.py check
```

Kỳ vọng (phương án thêm 10 dòng): `Nguồn: nguoi_dung 10 · data_that 0 · tu_viet 20 · sinh_seed 0 → từ người dùng / data thật: 10/30`,
không còn dòng `Cần ≥1/3 câu...`. Nếu vẫn còn warning, kiểm tra lại dấu `:` và mã nguồn ở đầu ô `source`
(`run.py` chỉ đọc mã chữ cái/tiền dưới trước dấu hai chấm).
