# Data card — dữ liệu bản chạy thử dùng

> Bản đầu CP2 (27/11). Đủ ở CP3. Một trang, mỗi dataset một mục.
> Không commit nguyên tài liệu khoá, dữ liệu cá nhân thật hay nguyên file data BTC cấp — chỉ đoạn trích ngắn, bản viết lại, hoặc số đã tổng hợp.

## Dataset 1 · Đoạn tài liệu ôn mẫu (`data/tai-lieu-mau.json`) + rubric (`data/rubric-tu-on.json`)

| | |
|---|---|
| Dùng để làm gì | nguồn đoạn tài liệu cho công cụ `search_passages` · rubric chấm cho công cụ `get_rubric` · căn cứ để viết và chấm `eval/benchmark.csv` (metric `trich_dung_nguon`, `cham_khop_dap_an`, `chi_dung_y_yeu`) |
| Từ đâu | nhóm tự viết lại, ngắn, kiến thức nhập môn ML chung; **không** trích nguyên tài liệu khoá. `ON-01`, `ON-02` trùng với `rubric-tu-on.json`; `ON-03`…`ON-06` viết thêm |
| Xử lý những bước gì | viết tay · không có dữ liệu cá nhân nên không cần ẩn danh · không lọc, không chia tập |
| Số dòng / số đoạn | 6 đoạn nguồn (`ON-01`…`ON-06`: hồi quy/phân loại, tập test, quá khớp, validation, gradient descent, chuẩn hoá) · rubric cho 2 câu hỏi (`ON1`: 1 ý; `ON2`: 2 ý) cùng 10 ví dụ trả lời đã gán nhãn |
| Phiên bản / ngày lấy | bản đầu CP2, 27/11 |
| Nhãn | tự viết — không phải `synthetic` sinh bằng model, cũng **không phải bằng chứng pain** |
| Giới hạn | chỉ 6 đoạn và 2 câu có rubric, nên câu chấm trong bộ thử chỉ xoay quanh ON1/ON2. Chưa phải tài liệu khoá thật → câu tìm thấy đoạn trong demo không chứng minh được nó bám tài liệu học viên đang học. Chỉ có câu điền text, chưa có bài nộp code hay trắc nghiệm (nên metric `cham_code_khop_test` hiện chưa có dòng nào áp dụng). Tìm đoạn bằng so khớp từ khoá, sẽ sót khi người dùng diễn đạt khác |

## Dataset 2 · Câu trả lời pre-class của học viên (data BTC cấp, `data/preclass/answers.csv`)

| | |
|---|---|
| Dùng để làm gì | **đào bằng chứng pain** (`evidence/data-mining.md`) · tham khảo kiểu sai để viết câu thử. Công cụ của agent **không** đọc file này |
| Từ đâu | data BTC cấp. File **không có trong repo** (không commit nguyên file data BTC cấp); repo chỉ chứa số đã tổng hợp |
| Xử lý những bước gì | lọc `nguon = pre_post_post` · đếm theo học viên và theo `kc_code` · dữ liệu BTC đã ẩn danh sẵn, nhóm chỉ dùng mã học viên, không đoán danh tính. **Script đếm chưa có trong repo** → cần thêm (vd `evidence/count.py`) để người khác chạy lại ra cùng số |
| Số dòng / số đoạn | theo số đếm sơ bộ ở `canvas.md` dòng 4: 1.970 lượt trả lời · 77 học viên · 20,3% sai · 69/77 học viên sai ≥1 câu · trung vị 4 `kc_code` sai mỗi người. *(Chưa kiểm lại bằng script trong repo — xem cột Giới hạn)* |
| Phiên bản / ngày lấy | bản BTC cấp ngày __ *(cần điền)* |
| Nhãn | thật |
| Giới hạn | data cho biết học viên **sai gì**, không cho biết vì sao hay họ ôn thế nào → phải kiểm bằng phỏng vấn / khảo sát. Chỉ phủ một nhóm học viên của khoá 5, chưa chắc đại diện. Con số ở trên là đếm tay chưa có script nên **chưa phải bằng chứng đạt ngưỡng** cho tới khi có script và ≥5 ví dụ ở `evidence/data-mining.md`. Nếu dùng làm nguồn cho `eval/benchmark.csv`, chỉ đưa vào dạng viết lại hoặc đã tổng hợp |

## Dataset 3 · Bộ câu thử (`eval/benchmark.csv`)

| | |
|---|---|
| Dùng để làm gì | chạy `python run.py eval`, chấm theo `eval/metric_spec.yaml` |
| Từ đâu | nhóm tự viết dựa trên Dataset 1; cột `source` của cả 15 dòng ghi `tu_viet`. Chưa có câu từ người dùng (`nguoi_dung`) hay data thật (`data_that`) |
| Xử lý những bước gì | viết tay · đã xoá 3 dòng mẫu cũ · chưa dùng data sinh tự động |
| Số dòng / số đoạn | 15 câu (thuong 5 · kho 6 · tu_choi 4, trong đó 2 câu tấn công B13, B14) · cần 20–30 câu ở CP3 |
| Phiên bản / ngày lấy | bản đầu CP2, 27/11 |
| Nhãn | tự viết (chưa phải `synthetic` sinh bằng model) |
| Giới hạn | `python run.py check` đang cảnh báo 0/15 câu từ người dùng hoặc data thật (cần ≥1/3). Cần bổ sung bằng câu hỏi/câu trả lời thật của học viên (từ phỏng vấn, khảo sát hoặc data BTC), không tự gán nhãn cho câu tự viết |

**Data `synthetic`:** hiện chưa có dữ liệu sinh bằng model hoặc script. Nếu sinh thêm câu thử hay đoạn nguồn, ghi cách sinh (prompt / script), seed, người kiểm và số dòng đã kiểm tay vào mục tương ứng. Data tự dựng không phải bằng chứng pain.
