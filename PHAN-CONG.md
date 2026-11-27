# Phân công Hackathon 404 ERROR

**L3A · Đội #5 · Zone 5 · H210 · Track D3**

Sản phẩm demo giúp người mua biết bước tiếp theo khi hàng nhận được không đúng mô tả. Bản chạy thử đối chiếu mô tả lúc đặt và chính sách để hướng dẫn gửi yêu cầu, xin thêm bằng chứng hoặc đề xuất chuyển nhân viên. Nhân viên giữ quyền quyết định hoàn tiền và đóng khiếu nại.

## Ai chịu trách nhiệm phần nào

| Người | Phần việc chính | Người kiểm |
|---|---|---|
| **Nguyễn Quang Vũ** | Code luồng xử lý trong `codebase/agent.py`, nối model thật và tích hợp demo. | Đức chạy lại luồng từ `run.py`. |
| **Trịnh Công Đức** | Viết spec, code công cụ tra mô tả lúc đặt và chính sách trong `codebase/tools.py`, điều phối tích hợp và nộp checkpoint. | Vũ kiểm công cụ qua luồng sản phẩm. |
| **Nguyễn Tiến Đạt** | Lấy mẫu và phân tích review, quản lý benchmark, chạy đánh giá và mô phỏng chi phí. | Kiệt kiểm cách đếm, nguồn câu thử và đối chiếu kết quả. |
| **Nguyễn Tuấn Kiệt** | Hẹn và phỏng vấn người mua, tổng hợp bằng chứng, viết tiêu chí chấm và phụ trách nội dung slide. | Đạt chấm chéo. Đức đối chiếu số liệu trên slide với repo. |

Các phân công dưới đây là đề xuất để nhóm bắt đầu. Mỗi người góp ít nhất một cuộc trao đổi với người dùng hoặc một câu hỏi phân tích dữ liệu để cùng hiểu bài toán.

## CP1 → CP2 · Trước 19:30 thứ Sáu 27/11

| Bước | Ai làm | Bàn giao cho ai và khi nào |
|---|---|---|
| **1. Lấy bằng chứng đầu** | Đạt ghi cách lấy mẫu, nhãn và mẫu số trước khi đếm review. Kiệt hẹn người mua và ghi lại tình huống đã xảy ra. | **Đạt và Kiệt → cả nhóm.** Bàn giao số đầu hoặc trạng thái thu thập, ví dụ đã bỏ tên và giới hạn của mẫu để cả nhóm xác nhận lát cắt. |
| **2. Chốt giao diện giữa các phần** | Đức và Vũ thống nhất đầu vào, dữ liệu công cụ trả về, các kết quả có thể trả và tình huống cần chuyển nhân viên. Đức vẽ sơ đồ trong `spec.md` §4. | **Đức và Vũ → Đạt và Kiệt.** Chia sẻ ví dụ đầu vào và đầu ra sớm để bộ câu thử viết song song với code. |
| **3a. Code luồng giả lập** | Đức làm công cụ tra mô tả lúc đặt và chính sách trên dữ liệu giả lập. Vũ tích hợp công cụ và chạy luồng qua model giả. | **Đức → Vũ → cặp kiểm thử.** Có lệnh chạy và ví dụ đi qua luồng D3 bằng `python3 run.py`. |
| **3b. Viết câu thử và chuẩn đạt** | Đạt thêm ít nhất 10 câu vào `eval/benchmark.csv`. Kiệt viết metric và cùng Đạt cập nhật `data/DATA_CARD.md`. | **Đạt và Kiệt → Đức và Vũ.** Hai cặp kiểm chéo câu thử và chốt chuẩn đạt bằng số trong `spec.md` §7 trước khi nộp CP2. |
| **4. Tích hợp và nộp** | Cả nhóm chạy thử một ca, cập nhật Canvas và xác nhận phần còn thiếu. Đức nộp CP2. | **Cả nhóm → Đức.** Bản trên GitHub có Canvas cập nhật, sơ đồ, benchmark, metric, Data Card và luồng chạy giả lập. |

## CP2 → CP3 · Trước 10:00 thứ Bảy 28/11

1. **Vũ và Đức làm song song với Đạt và Kiệt.** Vũ nối model thật và thử bằng `python3 run.py eval --try`. Đức rà việc tra đúng mô tả lúc đặt, xử lý thiếu căn cứ và chuyển nhân viên. Đạt mở rộng benchmark lên 20–30 câu, gồm ít nhất 5 câu khó, 2 câu từ chối và ít nhất 1/3 câu từ người dùng hoặc dữ liệu thật. Kiệt tổng hợp ít nhất một nguồn bằng chứng đạt ngưỡng và 5 trích dẫn hoặc ví dụ đã bỏ tên. Kiệt và Đức đưa số liệu có nguồn vào phần impact.
2. **Vũ bàn giao bản chạy thật và Đạt bàn giao bộ câu thử cho cả nhóm.** Cả nhóm chạy lượt 1 trên cùng một commit. Đạt lưu kết quả và run ID. Kiệt cùng Đạt chấm theo metric đã chốt và kiểm chéo 5 đầu ra. Cặp sản phẩm mở lại các ca khó để biết lỗi xảy ra ở đâu.
3. **Vũ quay video 30 giây, Đức nộp CP3.** Kiệt kiểm link video bằng cửa sổ ẩn danh. Đạt gửi kết quả x/N và run ID. Đức kiểm `spec.md` §0–§7 và tài liệu bằng chứng trước khi nộp.

## CP3 → CP4 · Trước 14:30 thứ Bảy 28/11

| Thứ tự | Ai làm | Bàn giao và kiểm |
|---|---|---|
| **1. Chọn lỗi cần sửa** | Cả nhóm đọc đầu ra lượt 1. Đạt và Kiệt ghi ít nhất 3 lỗi vào báo cáo. | **Đạt và Kiệt → Vũ và Đức.** Chốt một nhóm lỗi ưu tiên, kèm mã câu, đầu ra và hậu quả cho người dùng. |
| **2. Sửa và chạy lượt 2** | Vũ và Đức sửa luồng hoặc công cụ theo lỗi đã chọn. Đạt chạy lại cùng bộ thử, Kiệt chấm chéo theo chuẩn CP2. | **Vũ và Đức → Đạt và Kiệt → cả nhóm.** Bàn giao commit đã sửa, kết quả lượt 1 → 2 và lỗi còn lại. |
| **3. Mô phỏng chi phí** | Đạt chuẩn bị persona và thử 10 phiên từ CP3. Vũ hỗ trợ kiểm log model và token. Sau khi có kết quả lượt 2, Đạt chạy hoặc tổng hợp đủ mô phỏng 50 phiên trở lên. | **Đạt → Kiệt và Đức.** Bàn giao chi phí mỗi tác vụ thành công theo tỉ lệ đạt cùng model, 3 kịch bản tháng và 2 mức model. Kiệt so chi phí với impact. |
| **4. Chốt slide và demo** | Kiệt dựng slide song song với lượt 2 rồi thay số cuối. Vũ chuẩn bị 1 ca thường, 1 ca khó và video dự phòng. Đức cùng cả nhóm tập demo. | **Kiệt, Vũ và Đạt → Đức.** Kiểm `demo-slides.pdf` ở thư mục gốc, video mở được, số liệu khớp repo và ghi đúng phòng **H210, Zone 5** trước khi nộp. |

**Sau demo, trước 23:59.** Mỗi người viết một file trong `reflection/`. Đức gom góp ý và cập nhật `spec.md` §10. Nếu chạy thêm, ghi thành lượt mới và giữ kết quả cũ.

## Cách phối hợp

- **Một người giữ mỗi file đang sửa.** Vũ giữ luồng và phần nối model. Đức giữ công cụ và spec. Đạt giữ benchmark và kết quả chạy. Kiệt giữ metric, tổng hợp bằng chứng và slide. Báo trước trên chat nhóm khi cần sửa phần người khác đang làm.
- **Báo trạng thái khi có thứ để bàn giao.** Dùng mẫu `Xong … | Link/commit … | Đã kiểm … | Cần @tên làm tiếp … | Trước …`. Người nhận mở link, chạy hoặc đọc thử rồi xác nhận ngay để phát hiện chỗ thiếu.
- **Dùng nhánh ngắn cho từng phần.** Có thể tách `feat/d3-flow`, `feat/d3-tools` và `eval/d3-benchmark`. Một người xem thay đổi trước khi gộp. Đức giữ bản `main` dùng để nộp, Đạt ghi commit tương ứng với mỗi lượt đánh giá.
- **Chốt trước hạn 15 phút.** Cả nhóm mở các link sẽ nộp, chạy một ca từ thư mục gốc và đối chiếu số. Khi kẹt quá 20 phút, nhắn lỗi cụ thể, lệnh đã chạy và việc đang bị chặn để đồng đội hoặc lab coach hỗ trợ.
- **Giữ bảng điểm kiểm lại được.** Sau CP2 giữ chuẩn đạt đã chốt. Khi so lượt 1 → 2 giữ nguyên bộ câu thử. Giữ API key trong `.env` và chỉ dùng dữ liệu đã ẩn danh hoặc giả lập trong repo.
