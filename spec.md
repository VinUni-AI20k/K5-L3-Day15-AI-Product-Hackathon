 # AI SPEC — [Tên lát cắt] · Nhóm [tên nhóm] · Phòng [XXX] · Zone [X]

> Mốc nộp: §7 chốt chuẩn "đạt" tại **CP2 19:30 Thứ Sáu 27/11** · §0–§7 nộp **CP3 10:00 Thứ Bảy 28/11** · đủ §0–§10 **CP4 14:30 Thứ Bảy 28/11** · §10 changelog ghi tiếp đến **23:59 Thứ Bảy 28/11**.
> Đầu mỗi mục ghi bước guide (`02-guide.md` trong repo đề) chỉ cách điền. Mỗi mục ngắn, có số và nguồn; chi tiết để ở file được trỏ tới. Xoá dòng hướng dẫn trong ngoặc vuông khi điền xong.

Track: [ ] A · [ ] B · [ ] C · [ ] D · [ ] E — bài toán: [đề gợi ý trong file track, hoặc bài toán nhóm tự mở rộng] __
Data BTC cấp đã dùng (nếu có — không commit nguyên file): __

## §0. Hiện tại việc này diễn ra thế nào *(guide 1.1)*
- Luồng hiện tại của việc này, trong khoá hoặc trên app thật (3–5 bước; ảnh chụp từ tài khoản của mình, đã che thông tin):
- Công cụ / AI đang được dùng cho việc này (nếu có) + nguồn. Không kiểm được thì ghi "chưa kiểm":

## §1. Người dùng & bằng chứng *(guide 1.1, 1.2)*
- Người dùng chính (một vai cụ thể):
- Việc họ cố làm xong (`động từ + đối tượng + bối cảnh`, không có chữ AI):
- Hôm nay họ giải bằng gì, hỏng ở đâu, vì sao chưa bỏ:
- Pain (KHÔNG chữ AI): ai — đang làm gì — vướng đâu — hậu quả gì:
- Bằng chứng — số chính + kết luận (chi tiết: `evidence/summary.md`): __

## §2. Impact & quyết định chọn *(guide 1.3)*

| Hướng | Bao nhiêu người gặp | Bao nhiêu lần / tháng | Mỗi lần tốn gì | Impact / tháng | Làm kịp không | Chọn? |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

- **Impact / tháng** của hướng chọn = __ người × __ lần × __ phút = __ — nguồn từng thừa số: __ (không có nguồn thì ghi rõ *(tự ước tính)*)
- Hướng ĐÃ LOẠI + vì sao (giữ lại, đừng xoá):
- Số lần / tháng của từng kiểu người dùng (dùng cho persona ở §8):

## §3. Giải pháp tương tự *(guide 2.1)*
- [sản phẩm / tính năng gần giống]: một điều đáng học · một điều đáng né · mình khác gì

## §4. Thiết kế *(guide 2.2, 3.2)*
- **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả):
- Không làm (≥3 điều):
- **Sơ đồ kiến trúc đề xuất**

  Người dùng là **học viên tự ôn**, không có đề hay đáp án có sẵn, không có giảng viên duyệt. Vì vậy AI tự sinh đề + rubric từ tài liệu; thay cho người duyệt là ràng buộc code kiểm được (mỗi ý rubric trích nguyên văn tài liệu) và hiện nguồn để học viên tự kiểm. Mỗi lần gọi `answer(text)` là một lượt độc lập: lượt sinh đề lưu đề và trả mã đề, lượt chấm lấy lại rubric theo mã đề. Nhãn *(code)* = bước xác định bằng code, *(AI)* = bước gọi model.

  ```mermaid
  flowchart TD
      U["Học viên gửi yêu cầu"] --> R{"Phân loại yêu cầu (code + AI)"}
      R -->|"Làm hộ bài kiểm tra thật / tấn công prompt / ngoài phạm vi"| X["Kết thúc: từ chối, nêu lý do, gợi ý tự ôn bằng đề sinh từ tài liệu"]
      R -->|"Tạo đề từ tài liệu"| A["Tài liệu một buổi học (đoạn trích / bản viết lại)"]
      R -->|"Nộp câu trả lời kèm mã đề"| P["Lấy đề + rubric theo mã đề (code)"]

      subgraph SINH["Lượt 1 — sinh đề ôn"]
          A --> E["Cắt đoạn, gán mã đoạn (code)"]
          E --> F{"Đủ nội dung để ra câu hỏi?"}
          F -->|Không| G["Kết thúc: báo phần thiếu căn cứ, xin tài liệu rõ hơn"]
          F -->|Có| H["Sinh câu hỏi + rubric: mỗi ý trích NGUYÊN VĂN tài liệu + mã đoạn (AI)"]
          H --> V{"Câu trích có thật trong đoạn mang mã đó? (code)"}
          V -->|"Không"| V2["Bỏ ý / bỏ câu không khớp — G10"]
          V -->|"Có"| Q{"Còn đủ số câu tối thiểu?"}
          V2 --> Q
          Q -->|Không| G2["Kết thúc: báo tài liệu chỉ đủ hỏi X câu, hiện các câu hợp lệ"]
          Q -->|Có| S["Lưu đề trong phiên, trả mã đề + câu hỏi kèm mã đoạn (code)"]
      end

      subgraph CHAM["Lượt 2 — chấm và chỉ ý yếu"]
          P --> P2{"Có mã đề hợp lệ?"}
          P2 -->|Không| P3["Kết thúc: yêu cầu tạo đề trước / nêu mã đề"]
          P2 -->|Có| J{"Dạng câu trả lời"}
          J -->|"Trống"| E1["Kết thúc: yêu cầu nhập câu trả lời"]
          J -->|"Text"| K["Chấm từng ý: đạt / thiếu / mâu thuẫn / chưa rõ (AI)"]
          K --> K2{"Có ý chưa rõ làm đổi nhãn?"}
          K2 -->|"Có"| C2["Kết thúc: hỏi làm rõ đúng ý đó"]
          K2 -->|"Không"| K3["Tổng hợp nhãn đúng / đúng một phần / sai theo luật rubric (code)"]
          J -->|"Code"| L{"Có bộ test + trình chấm cách ly?"}
          L -->|"Không / lỗi hạ tầng"| N["Kết thúc: báo chưa chấm được"]
          L -->|"Có"| M["Chạy test, phân loại: cú pháp / lỗi lúc chạy / vượt thời gian / trượt nhóm test (code)"]
          M --> M2["Giải thích lỗi; bỏ qua chỉ thị chèn trong bài nộp, không đổi kết quả test (AI)"]
          K3 --> W["Lập danh sách ý cần ôn + mã đoạn (code)"]
          M2 --> W
          W --> O["Kết quả tự ôn: nhãn, ý cần ôn, đoạn nguồn — không lưu điểm, không gửi ai"]
          O -.->|"Học viên báo câu sai"| O2["Bỏ câu khỏi đề trong phiên"]
      end
  ```

- **Hình dạng:** [x] workflow cố định · [ ] một agent · [ ] nhiều agent.
  - Thứ tự các bước đã xác định: phân loại yêu cầu → (sinh đề → kiểm trích dẫn → lưu đề) hoặc (lấy rubric → chấm → tổng hợp nhãn → chỉ ý yếu). Nhánh rẽ chỉ theo điều kiện kiểm được (loại yêu cầu, dạng câu trả lời, kết quả kiểm code).
  - Không chọn agent vì không có bước nào cần model tự chọn công cụ; các chỗ rủi ro (trích dẫn, tổng hợp nhãn, kết quả test) do code quyết định để chấm lại được và không bị prompt trong bài nộp điều khiển.
  - **Quyết định AI duy nhất của lát cắt:** xác định học viên còn hổng ý nào trong tài liệu. Sinh đề là bước chuẩn bị, bị ràng buộc bằng trích nguyên văn mà code kiểm được.
- **AI dựa vào đâu** — mỗi công cụ (khớp `codebase/tools.py`):

  | Công cụ | Input | Output | Tác động ra ngoài? |
  |---|---|---|---|
  | `search_passages` | câu người dùng hoặc từ khoá (str) | tối đa 3 đoạn `{code, title, text}`; rỗng nếu không đoạn nào trùng | Không (chỉ đọc `data/tai-lieu-mau.json`) |
  | `get_rubric` | mã câu (vd `ON2`) hoặc lời câu hỏi (str) | rubric của câu khớp (`id`, `prompt`, `criteria`, `scoring`); `{}` nếu không khớp | Không (chỉ đọc `data/rubric-tu-on.json`; điểm chỉ để tự ôn, không ghi đi đâu) |

- **Mức tự động:** [ ] AI gợi ý, người quyết · [ ] AI tự làm khi chắc, chuyển người khi không · [ ] AI tự làm — lý do (sai thì ai chịu gì, sửa đắt hay rẻ):
- **Chỗ chặn rủi ro** (rủi ro lớn nhất của lát cắt bị chặn ở đâu, bằng gì):
- **Chỗ người duyệt** (việc AI không được tự làm):
- **Nguyên tắc thiết kế** (≥3, bắt buộc G10):

  | Nguyên tắc | Chỗ cụ thể trên sơ đồ / trong bản chạy thử |
  |---|---|
  | G10 — thu hẹp phạm vi khi không chắc |  |
  |  |  |
  |  |  |

- Phần nào còn giả (công cụ trả dữ liệu giả, model chế độ giả…) — ghi rõ, không giả làm thật: (1) `data/tai-lieu-mau.json` là 6 đoạn mẫu nhóm tự viết, chưa phải trích từ tài liệu khoá thật; (2) model đang ở chế độ giả cho tới khi nối model thật (CP3); (3) bộ câu thử 15/15 câu là nhóm tự viết, chưa có câu từ người dùng hay data thật.

## §5. Chỗ khó — 4 lớp + ≥6 kịch bản + 2 tấn công *(guide 2.3)*

| Kịch bản | Lớp (1–4) | Hành vi mong muốn (nói gì, hiện gì, cho làm gì tiếp) | Câu thử |
|---|---|---|---|
|  |  |  |  |
| *(tấn công)* |  |  |  |
| *(tấn công)* |  |  |  |

(1) nguồn sự thật · (2) mơ hồ / thiếu thông tin · (3) ngoài phạm vi / thẩm quyền · (4) đặc thù lĩnh vực (sai thì người dùng mất gì đắt nhất)

## §6. Bốn đường đi của trải nghiệm
- Mọi thứ suôn sẻ: · Không chắc (lớp 2): · Không có căn cứ (lớp 1): · Người dùng sửa:
- Bị đòi ngoài phạm vi (lớp 3): · Trường hợp đặc thù lĩnh vực (lớp 4):

## §7. Đánh giá & chuẩn "đạt" *(guide 2.4, 4.1)*
- Data card: `data/DATA_CARD.md` · bộ câu thử: `eval/benchmark.csv` — 15 câu (thuong 5 · kho 6 · tu_choi 4) · metric: `eval/metric_spec.yaml` (5 metric)
- **Chuẩn "đạt"** (chốt **trước 19:30 Thứ Sáu 27/11**, giữ nguyên đến 23:59 Thứ Bảy 28/11): "Đạt khi ≥ 80% câu qua, và 100% câu tu_choi qua"
- Kết quả: lượt 1 __/__ (__%) · lượt 2 __/__ (__%) — run ID: __ / __ → chi tiết `eval/report.md`, hồ sơ `eval/README.md`

## §8. Chi phí khi dùng thật *(guide 4.2)*
- Persona + giá: `cost/personas.yaml` · lượt mô phỏng: `cost/simulate-__.csv` (__ phiên)
- Chi phí / task thành công: __ (model __) · __ (model __)
- Chi phí / tháng ở quy mô thật: thấp __ · cơ sở __ · cao __ → chi tiết `cost/cost-estimate.md`
- So với impact / người / tháng (§2): đáng làm không, vì sao:

## §9. Rủi ro & an toàn
- Dữ liệu: đã ẩn danh gì, không thu gì, không đưa gì vào model gói miễn phí:
- AI **không được** làm gì kể cả khi người dùng yêu cầu:
- Ai có thể bị hại nếu AI sai, và nhóm chặn thế nào:

## §10. Phân công & changelog
- Phân công có tên (theo chặng, chia cặp — guide "Cách chia việc"): __
- Dùng AI vào việc gì (2–3 dòng; chi tiết `docs/ai-usage.md`):
- Nhật ký thay đổi — **mọi thay đổi sau CP2 19:30 Thứ Sáu 27/11 phải có dòng ở đây**:

**CP2 → CP4** (vd thu hẹp lát cắt, hỏi thêm người dùng, lần cải tiến trước lượt 2)

| Thời điểm | Đổi gì | Vì sao (trỏ về câu thử / lỗi / bằng chứng nào) |
|---|---|---|
|  |  |  |

**Sau CP4 (đến 23:59 Thứ Bảy 28/11)** (sửa theo góp ý — không sửa chuẩn "đạt", câu thử, số bằng chứng, kết quả các lượt đã chạy)

| Thời điểm | Đổi gì | Vì sao |
|---|---|---|
|  |  |  |
