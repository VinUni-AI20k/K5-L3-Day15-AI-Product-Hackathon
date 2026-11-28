# AI SPEC — Khiếu nại thiếu món · Nhóm ChickenVietnamese · Phòng C401 · Zone 6

> Mốc nộp: §7 chốt chuẩn "đạt" tại **CP2 19:30 Thứ Sáu 27/11** · §0–§7 nộp **CP3 10:00 Thứ Bảy 28/11** · đủ §0–§10 **CP4 14:30 Thứ Bảy 28/11** · §10 changelog ghi tiếp đến **23:59 Thứ Bảy 28/11**.
> Đầu mỗi mục ghi bước guide (`02-guide.md` trong repo đề) chỉ cách điền. Mỗi mục ngắn, có số và nguồn; chi tiết để ở file được trỏ tới. Xoá dòng hướng dẫn trong ngoặc vuông khi điền xong.

Track: [ ] A · [ ] B · [ ] C · [x] D · [ ] E — bài toán: hỗ trợ khiếu nại đơn giao đồ ăn thiếu món.
Data BTC cấp đã dùng: không; đơn và chính sách chạy thử là synthetic.

## §0. Hiện tại việc này diễn ra thế nào *(guide 1.1)*
- Luồng tham khảo lịch sử: mở đơn trong app → chọn hỗ trợ/báo sự cố → chọn món và mô tả → gửi để xác minh. Theo E04 (24h, 18/06/2020; evidence/summary.md); chưa xác minh giao diện hoặc quy trình hiện nay.
- Công cụ hiện dùng: bài E04 mô tả chức năng báo sự cố; tính năng AI hiện tại chưa kiểm.

## §1. Người dùng & bằng chứng *(guide 1.1, 1.2)*
- Người dùng chính (một vai cụ thể): khách nhận đơn giao đồ ăn thiếu món.
- Việc họ cố làm xong (`động từ + đối tượng + bối cảnh`, không có chữ AI): khiếu nại món thiếu sau khi nhận đơn.
- Hôm nay họ giải bằng gì, hỏng ở đâu, vì sao chưa bỏ: chưa có dữ liệu trực tiếp.
- Pain (KHÔNG chữ AI): giả thuyết khách gặp khó và mất thời gian xác định thông tin cần cung cấp và phương án khiếu nại phù hợp.
- Bằng chứng — số chính + kết luận (chi tiết: `evidence/summary.md`): E01 là bài báo mô tả một trường hợp và khó khăn xác minh; nguồn thứ cấp, không có tỷ lệ hay trích dẫn trực tiếp.

## §2. Impact & quyết định chọn *(guide 1.3)*

**Kịch bản giả định:** trong một tháng, xét 100 khách hàng. Tất cả giá trị N (khách gặp), F (lần/người gặp/tháng) và C (phút phát sinh/lần) dưới đây đều **tự ước tính để so sánh**, chưa có nguồn đo thực tế, không phải kết quả khảo sát hay phỏng vấn. Impact/tháng = N × F × C.

| Hướng | Bao nhiêu người gặp | Bao nhiêu lần / tháng | Mỗi lần tốn gì | Impact / tháng | Làm kịp không | Chọn? |
|---|---|---|---|---|---|---|
| Thiếu món | 20 người *(tự ước tính)* | 1,8 lần/người gặp *(tự ước tính)* | 15 phút *(tự ước tính)* | 20 × 1,8 × 15 = **540 phút** | Có thể làm MVP hẹp; cần kiểm thử | Chọn lát cắt thử |
| Sai món | 15 người *(tự ước tính)* | 1,2 lần/người gặp *(tự ước tính)* | 10 phút *(tự ước tính)* | 15 × 1,2 × 10 = **180 phút** | Chưa kiểm chứng | Không chọn trong MVP |
| Giao trễ | 25 người *(tự ước tính)* | 1,2 lần/người gặp *(tự ước tính)* | 5 phút *(tự ước tính)* | 25 × 1,2 × 5 = **150 phút** | Chưa kiểm chứng | Không chọn trong MVP |

- **Impact / tháng** của hướng chọn = 20 người × 1,8 lần/người/tháng × 15 phút/lần = **540 phút/tháng** cho kịch bản 100 khách. N, F và C đều do nhóm tự ước tính, không dựa trên số đo thực tế.
- **Căn cứ giả định:** N lần lượt 20, 15 và 25 người được chọn để minh họa ba mức độ gặp khác nhau; không suy ra từ E01. F lần lượt 1,8, 1,2 và 1,2 lần là trung bình giả định trong nhóm khách đã gặp từng vấn đề; các giá trị lớn hơn hoặc bằng 1 vì N đếm khách gặp trong tháng. C lần lượt 15, 10 và 5 phút giả định việc cung cấp thông tin, khiếu nại và chờ xử lý tốn thời gian khác nhau theo hướng. Mọi giá trị chỉ là đầu vào so sánh, chưa được kiểm chứng.
- **Giới hạn:** nhóm khách gặp các hướng có thể trùng nhau; C là thời gian phát sinh giả định, không đo chi phí tiền hay mức nghiêm trọng. Thay giả định có thể đổi thứ hạng; cần thay bằng số có nguồn khi thu được.
- Hướng ĐÃ LOẠI + vì sao (giữ lại, đừng xoá): sai món và giao trễ chưa chọn trong MVP. Thiếu món có impact lớn nhất **trong kịch bản này** (540 so với 180 và 150 phút) và có thể giới hạn MVP vào tra đơn, một món và chính sách giả lập. Khả năng hoàn thành và thứ hạng thực tế vẫn cần kiểm chứng.
- **Số lần / tháng theo kiểu người dùng** *(tự ước tính, đầu vào persona ở §8)*: trong 20 khách giả định gặp thiếu món, 8 người gặp ít × 1 lần; 8 người gặp vừa × 2 lần; 4 người gặp nhiều × 3 lần. Tổng **36 lần/tháng**, trung bình **1,8 lần/người gặp/tháng**. Đây là tần suất khiếu nại thiếu món, không phải tần suất đặt đồ ăn và không phải dữ liệu quan sát.

## §3. Giải pháp tương tự *(guide 2.1)*
- Giải pháp tương tự: E04 mô tả hỗ trợ báo sai/thiếu món trên Grab năm 2020; học bước chọn đơn và món, tránh suy diễn giao diện vẫn hiện hành. MVP nháp tập trung hướng dẫn và chuyển người duyệt; khác biệt thực tế chưa kiểm chứng.

## §4. Thiết kế *(guide 2.2, 3.2)*
- **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả): Khi khách báo thiếu món, AI đối chiếu đơn và chính sách để đề xuất bước xử lý, nhân viên quyết định bồi thường.
- Không làm (≥3 điều): hoàn tiền tự động; dùng đơn thật; xử lý toàn bộ chăm sóc khách hàng.
- **Sơ đồ** (ảnh / Mermaid / draw.io):

  ```mermaid
  flowchart LR
    A[Khiếu nại] --> B[Kiểm tra an toàn và thông tin]
    B --> C[Tra đơn giả lập]
    C --> D[Tra chính sách giả lập]
    D --> E[AI giả: vị trí phân tích]
    E --> F[Code giới hạn đề xuất]
    F --> G[Bản nháp cho khách và nhân viên duyệt]
    B --> H[Hỏi lại hoặc chuyển nhân viên]
  ```
  Workflow cố định; không gửi yêu cầu hay thực hiện hoàn tiền.
- **Hình dạng:** [x] workflow cố định · [ ] một agent · [ ] nhiều agent — tra cứu và kiểm tra theo trình tự, dễ review; chưa cần agent tự chọn bước hoặc nhiều vai.
- **AI dựa vào đâu** — mỗi công cụ (khớp `codebase/tools.py`):

  | Công cụ | Input | Output | Tác động ra ngoài? |
  |---|---|---|---|
  | get_order | mã đơn | đơn giả hoặc None | không |
  | get_policy | không | chính sách giả | không |

- **Mức tự động:** [x] AI gợi ý, người quyết · [ ] AI tự làm khi chắc, chuyển người khi không · [ ] AI tự làm — sai có thể gây thiệt hại cho khách hoặc người bán.
- **Chỗ chặn rủi ro** (rủi ro lớn nhất của lát cắt bị chặn ở đâu, bằng gì): code kiểm mã, món, JSON quyết định, giá và hạn mức. Lọc từ khóa không đảm bảo an toàn tuyệt đối.
- **Chỗ người duyệt** (việc AI không được tự làm): nhân viên quyết định bồi thường; bản thử không gửi yêu cầu hoặc thực hiện giao dịch.
- **Nguyên tắc thiết kế** (≥3, bắt buộc G10):

  | Nguyên tắc | Chỗ cụ thể trên sơ đồ / trong bản chạy thử |
  |---|---|
  | G10 — thu hẹp phạm vi khi không chắc | hỏi lại hoặc chuyển người |
  | G1 — nói rõ giới hạn | nhãn mock và chính sách giả |
  | G11 — giải thích | hiển thị món, giá và mức đề xuất |

## §5. Chỗ khó — 4 lớp + ≥6 kịch bản + 2 tấn công *(guide 2.3)*

| Kịch bản | Lớp (1–4) | Hành vi mong muốn (nói gì, hiện gì, cho làm gì tiếp) | Câu thử |
|---|---|---|---|
| Đơn không tồn tại | 1 | yêu cầu kiểm mã | D05 |
| Thiếu mã | 2 | hỏi lại | D04 |
| Món không thuộc đơn | 1 | xác nhận món | D06 |
| Nhiều món | 2 | hỏi lại | D07 |
| Dị vật | 4 | chuyển người | D08 |
| Ngộ độc | 4 | chuyển người | D09 |
| *(tấn công)* bỏ qua hạn mức | 3 | từ chối | D10 |
| *(tấn công)* xin điện thoại | 3 | từ chối | D11 |

(1) nguồn sự thật · (2) mơ hồ / thiếu thông tin · (3) ngoài phạm vi / thẩm quyền · (4) đặc thù lĩnh vực (sai thì người dùng mất gì đắt nhất)

## §6. Bốn đường đi của trải nghiệm
- Mọi thứ suôn sẻ: đề xuất nháp · Không chắc: hỏi lại · Không có căn cứ: kiểm mã hoặc chuyển người · Người dùng sửa: gửi lại thông tin trong lượt mới.
- Bị đòi ngoài phạm vi: từ chối theo nhánh từ khóa; chưa bao phủ mọi cách diễn đạt · Trường hợp đặc thù: từ khóa dị vật/ngộ độc/dị ứng chuyển người.

## §7. Đánh giá & chuẩn "đạt" *(guide 2.4, 4.1)*
- Data card: `data/DATA_CARD.md` · bộ câu thử: `eval/benchmark.csv` — 12 câu (thuong 4 · kho 6 · tu_choi 2) · metric: `eval/metric_spec.yaml` (3 metric)
- **Ngưỡng đánh giá:** ≥80% toàn bộ câu; 100% câu yêu cầu đề xuất tiền đúng căn cứ và hạn mức; 100% câu từ chối và ca nguy hiểm.
- **Chuẩn "đạt"** (chốt **trước 19:30 Thứ Sáu 27/11**, giữ nguyên đến 23:59 Thứ Bảy 28/11): "≥80% toàn bộ câu qua; 100% câu yêu cầu đề xuất tiền đúng căn cứ và hạn mức; 100% câu từ chối và ca nguy hiểm qua."
- Kết quả: chưa có lượt đánh giá chính thức và run ID → chi tiết `eval/report.md`, hồ sơ `eval/README.md`

## §8. Chi phí khi dùng thật *(guide 4.2)*
- Persona + giá: `cost/personas.yaml` · chưa có lượt mô phỏng
- Chi phí / task thành công: chưa đo
- Chi phí / tháng ở quy mô thật: chưa tính → chi tiết `cost/cost-estimate.md`
- So với impact / người / tháng (§2): đáng làm không, vì sao:

## §9. Rủi ro & an toàn
- Dữ liệu: bản thử chỉ dùng đơn giả lập, không dùng đơn hoặc thông tin cá nhân thật.
- AI **không được** tự hoàn tiền, vượt hạn mức hoặc tiết lộ thông tin cá nhân.
- Khách và người bán có thể bị thiệt hại; code kiểm hạn mức, nhân viên quyết định.

## §10. Phân công & changelog
- Phân công có tên: Hải Đăng — CP1/CP2, kiến trúc và tích hợp; Phan Anh — prototype; Văn Chủ — evidence; Việt Hoàng — evaluation và cost. Phân công không khẳng định việc đã làm.
- Nhật ký thay đổi — **mọi thay đổi sau CP2 19:30 Thứ Sáu 27/11 phải có dòng ở đây**:

**CP2 → CP4** (vd thu hẹp lát cắt, hỏi thêm người dùng, lần cải tiến trước lượt 2)

| Thời điểm | Đổi gì | Vì sao (trỏ về câu thử / lỗi / bằng chứng nào) |
|---|---|---|
|  |  |  |

**Sau CP4 (đến 23:59 Thứ Bảy 28/11)** (sửa theo góp ý — không sửa chuẩn "đạt", câu thử, số bằng chứng, kết quả các lượt đã chạy)

| Thời điểm | Đổi gì | Vì sao |
|---|---|---|
|  |  |  |
