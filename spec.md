# AI SPEC — Soạn hàng loạt và lên lịch bài đăng Facebook cho sản phẩm thời trang · Nhóm WorkHardToday · Phòng [XXX] · Zone [X]

> Mốc nộp: §7 chốt chuẩn "đạt" tại **CP2 19:30 Thứ Sáu 27/11** · §0–§7 nộp **CP3 10:00 Thứ Bảy 28/11** · đủ §0–§10 **CP4 14:30 Thứ Bảy 28/11** · §10 changelog ghi tiếp đến **23:59 Thứ Bảy 28/11**.
> Đầu mỗi mục ghi bước guide (`02-guide.md` trong repo đề) chỉ cách điền. Mỗi mục ngắn, có số và nguồn; chi tiết để ở file được trỏ tới. Xoá dòng hướng dẫn trong ngoặc vuông khi điền xong.

Track: [ ] A · [ ] B · [ ] C · [ ] D · [ ] E · [x] F — bài toán: nhân viên soạn và đăng bài sản phẩm lên Fanpage của công ty bán thời trang đang làm thủ công qua ChatGPT rồi copy sang Facebook (thẻ đề: `canvas.md`)
Data BTC cấp đã dùng (nếu có — không commit nguyên file): không dùng — data từ file vận hành của shop (đã sửa một phần) và phần tự dựng, xem `data/DATA_CARD.md`

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
- **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả): Một nhân viên soạn bài · tải lên file Excel / CSV nhiều sản phẩm · AI quyết định với từng dòng: viết bài Facebook từ đúng dữ kiện trong file, hay đánh dấu dòng thiếu / mâu thuẫn thay vì bịa · nhân viên duyệt bảng bài nháp, bài đã duyệt được đưa vào lịch đăng của Fanpage.
- Không làm (≥3 điều): không đăng ngay / không tự lên lịch khi chưa có người duyệt · không đọc ảnh bằng AI (chỉ kiểm tên file ảnh) · không làm kênh khác ngoài Facebook (Instagram, TikTok…) · không tự đặt giá, khuyến mãi · không trả lời bình luận / tin nhắn khách.
- **Sơ đồ** (Mermaid, GitHub tự vẽ):

```mermaid
flowchart TD
  U["👤 Nhân viên soạn bài<br/>tải file Excel/CSV sản phẩm<br/>màn Chạy hàng loạt: dán mã, chọn kênh, chọn giờ"] --> CAT["Danh mục · code<br/>POST /api/vpost/catalog · read_products · lưu SQLite<br/>mỗi mã một dòng · màn Sản phẩm: đăng được hoặc bị chặn + lý do"]
  CAT -->|"Chạy hàng loạt: từng mã đã dán<br/>Soạn bài: 1 mã (/compose?code=…)"| CP["① compose · check_product · code, không gọi AI<br/>thiếu giá/size · giá sai dạng · dưới giá tệ × 13.500 hoặc giá sàn page<br/>mô tả mâu thuẫn · prompt đòi 'chính hãng'/hãng khác · chèn lệnh<br/><i>căn cứ: pages.json</i>"]
  CP -->|"ok"| CS["② check_stock · code<br/>chỉ giữ màu/size còn tồn<br/><i>căn cứ: inventory.csv</i>"]
  CS -->|"còn hàng"| IM["③ parse_images + check_images · code<br/>bỏ link ảnh hỏng"]
  IM -->|"còn ít nhất 1 ảnh"| W["④ captions · write_or_flag · AI (gpt-5.6-luna)<br/>lần gọi model duy nhất, JSON: viết hay đánh dấu<br/><i>căn cứ: dữ kiện F1, F2… của dòng (đã thu hẹp theo tồn), giọng page (pages.json), bài mẫu (style_examples.json), cột prompt</i>"]
  W -->|"viết"| V["⑤ verify_post · code<br/>giá lệch tối đa 2% · size/màu/chất liệu phải có trong dòng<br/>cụm cấm · hãng khác · freeship/giảm giá chỉ khi file có · không SĐT, link"]
  V -->|"lỗi lần 1: gửi lại danh sách SỬA LỖI BẮT BUỘC"| W
  V -->|"sạch"| D["📝 Bài nháp · Chờ duyệt<br/>code gắn khối cam kết + mã SP"]
  D --> H["👤 Nhân viên duyệt<br/>xem bài + ảnh · sửa · Duyệt hoặc Bỏ<br/>(Soạn bài: thêm hộp xác nhận)"]
  H -->|"Duyệt · bấm 'Hẹn giờ N bài đã duyệt'"| B["⑥ batches · code, chỉ dòng đã duyệt<br/>kiểm tồn lần 2 · khoá trùng mã+màu+kênh+dạng<br/>giờ ít nhất sau 10 phút, giãn cách · verify_post lại bài đã sửa → cảnh báo<br/>mỗi kênh một post_job"]
  B --> SP["⑦ schedule_post · code<br/>chỉ chạy sau nút người bấm"]
  KN["Màn Kênh · OAuth Facebook · code<br/>/api/channels/connect → người tự đăng nhập, bấm cho phép → callback kiểm state<br/>đổi code lấy token dài hạn · lưu token từng Page vào SQLite · bật/tắt, gỡ kênh"] -->|"token Page (kênh fb-…)"| SP
  SP -->|"Page nối qua OAuth, hoặc Fanpage thử trong .env"| FB["Facebook Graph API<br/>tải ảnh dạng chưa đăng → bài hẹn giờ published=false, huỷ được<br/>hoặc đăng ngay"]
  SP -->|"5 page giả (pages.json)"| CAL["📅 Lịch đăng trong app<br/>chỉ ghi lịch · đăng ngay bị chặn: CHANNEL_NOT_CONFIGURED"]
  FB --> BD["Màn Bài đăng · code<br/>đổi giờ · huỷ (bài Facebook gọi delete_fb_post bằng token Page)<br/>nhật ký job, chạy lại"]
  CAL --> BD

  EV["python run.py eval / simulate · code<br/>answer(text), không qua giao diện"] -->|"cùng agent.process_row<br/>(tự chạy lại check_product, check_stock)"| W

  CAT -->|"mã không có trong file: PRODUCT_NOT_FOUND"| F["🚩 Dòng bị đánh dấu / bị chặn<br/>giao diện hiện Lỗi / Bỏ qua + lý do, không lên lịch"]
  CP -->|"lỗi dòng: ROW_DATA_INVALID"| F
  CS -->|"hết hàng, mã không có trong kho: OUT_OF_STOCK"| F
  IM -->|"không còn ảnh: MEDIA_NOT_FOUND"| F
  W -->|"đánh dấu, vd prompt hỏi giờ giao mà file không có"| F
  V -->|"vẫn lỗi sau lần viết lại"| F
  H -->|"Bỏ"| F
  B -->|"hết hàng lần 2 · trùng bài"| F

  classDef code fill:#e3ecf8,stroke:#2f5a8f,color:#14243a
  classDef llm fill:#ece3fa,stroke:#6a3fa0,color:#22123a
  classDef human fill:#fdf0cf,stroke:#9a6700,color:#2b1d00
  classDef stop fill:#fbe1dd,stroke:#b3261e,color:#3a0d0a
  classDef ok fill:#e2f2e2,stroke:#2e7d32,color:#0f2a10
  classDef ext fill:#ffffff,stroke:#6b6b6b,stroke-dasharray:4 3,color:#222222
  class CAT,CP,CS,IM,V,B,SP,BD,EV,KN code
  class W llm
  class U,H human
  class F stop
  class D,CAL ok
  class FB ext
```

  Màu: xanh dương = code xác định · tím = AI (chỗ duy nhất gọi model) · vàng = người · đỏ = chỗ chặn · xanh lá = bài nháp, lịch · viền đứt = tác động ra ngoài (Facebook). Ảnh cho slide: [docs/kien-truc-ai.png](docs/kien-truc-ai.png).
- **Hình dạng:** [x] workflow cố định · [ ] một agent · [ ] nhiều agent — Mỗi dòng sản phẩm luôn đi cùng một chuỗi bước. AI chỉ có một quyết định: viết hay đánh dấu, và viết thế nào. Giá, tồn kho, luật đăng bài là việc sai thì mất tiền, nên do code làm và luôn chạy, không để AI tự chọn có gọi hay không. **Không chọn một agent tự gọi công cụ**: model có thể bỏ qua bước kiểm giá, kiểm tồn, và số bước mỗi dòng không cố định nên khó tính chi phí. **Không chọn nhiều agent** (lập kế hoạch → viết → kiểm duyệt): mỗi dòng đã tự nói cần viết gì, nên vai lập kế hoạch không có việc. Vai kiểm duyệt đã là code `verify_post`, chạy chắc chắn và rẻ hơn một agent.
- **AI dựa vào đâu** — mỗi công cụ (khớp `codebase/tools.py`):

  | Công cụ | Input | Output | Tác động ra ngoài? |
  |---|---|---|---|
  | `read_products` | nội dung file .xlsx/.csv + tên file | danh sách dòng đã chuẩn hoá tên cột · sai định dạng → báo lỗi | Không |
  | `check_product` | 1 dòng + page | lỗi cứng / cảnh báo theo từng trường (giá, size, mâu thuẫn, prompt cấm, chèn lệnh) | Không |
  | `check_stock` | 1 dòng (mã, màu, size) | lỗi hết hàng / mã không có trong kho · màu, size còn tồn · cảnh báo sắp hết | Không (chỉ đọc `data/inventory.csv`) |
  | `check_images` | danh sách link ảnh | ảnh dùng được / ảnh hỏng | Không (chỉ tải thử link ảnh) |
  | `verify_post` | bài + dữ kiện được phép (đã thu hẹp theo tồn) | lỗi chặn / cảnh báo | Không |
  | `save_drafts` | mã lô + kết quả từng dòng | số dòng đã lưu | Không (chỉ ghi SQLite của app). Hiện chưa luồng nào gọi |
  | `schedule_post` | bài đã duyệt + thời điểm (trống = đăng ngay) + ảnh + Page (id, token) | chế độ `app` hoặc `facebook` + id bài trên Page | **Có**, khi kênh là Page nối qua OAuth hoặc `.env` có `FB_PAGE_ID` + `FB_PAGE_TOKEN`: tải ảnh dạng chưa đăng, tạo bài hẹn giờ (`published=false`, huỷ được) hoặc đăng ngay. Chỉ chạy khi người bấm "Hẹn giờ N bài đã duyệt" |
  | `delete_fb_post` | id bài trên Page + token Page | xoá được hay không | **Có**: xoá bài trên Page. Chỉ chạy khi người bấm Huỷ ở màn Bài đăng |

  API → bước trên sơ đồ: `POST /api/posts/compose` = ①–③ (code, không gọi AI) · `POST /api/posts/captions` = ④–⑤ (`agent.process_row`, viết lại tối đa 1 lần) · `POST /api/posts/batches` = ⑥–⑦ (chỉ dòng đã duyệt).

- **Mức tự động:** [x] AI gợi ý, người quyết · [ ] AI tự làm khi chắc, chuyển người khi không · [ ] AI tự làm — lý do: bài sai giá / size / chất liệu đã lên Fanpage thì shop chịu khiếu nại, đổi trả, mất uy tín; sửa sau khi khách đã đặt là đắt. Duyệt một bài nháp chỉ mất vài giây, nên giữ người quyết.
- **Chỗ chặn rủi ro** (rủi ro lớn nhất của lát cắt bị chặn ở đâu, bằng gì): rủi ro lớn nhất là **bài bịa / sai giá, size, ưu đãi**. Chặn 3 lớp bằng code: ① `check_product` + ② `check_stock` chặn trước khi gọi AI (AI không thấy biến thể hết hàng) · ④ `verify_post` kiểm sau khi AI viết (giá lệch > 2%, cụm cấm, freeship / giảm giá không có trong file, nhắc biến thể hết hàng), sai thì bắt viết lại 1 lần rồi đánh dấu · khối cam kết do code gắn, không để AI viết.
- **Chỗ người duyệt** (việc AI không được tự làm): mọi bài trước khi lên lịch — `schedule_post` chỉ chạy từ nút "Duyệt" của nhân viên, `agent.answer()` không gọi; dòng bị đánh dấu không lên lịch được; bài lên Facebook ở dạng hẹn giờ (`published=false`), huỷ được.
- **Nguyên tắc thiết kế** (≥3, bắt buộc G10):

  | Nguyên tắc | Chỗ cụ thể trên sơ đồ / trong bản chạy thử |
  |---|---|
  | G10 — thu hẹp phạm vi khi không chắc | Thiếu / mâu thuẫn dữ kiện → đánh dấu dòng, không viết; chỉ đưa cho AI các màu / size còn tồn (`check_stock`) |
  | Người quyết việc có hậu quả | Nút duyệt trước `schedule_post`; bài hẹn giờ huỷ được |
  | Việc tất định để code làm | Giá, tồn kho, cụm cấm, khối cam kết do code kiểm / gắn; AI chỉ viết câu chữ |
  | Dữ liệu là dữ liệu, không phải lệnh | `check_product` bắt lệnh chèn trước khi gọi AI; SYSTEM prompt dặn bỏ qua lệnh trong dữ kiện |

- Phần nào còn giả (công cụ trả dữ liệu giả, model chế độ giả…) — ghi rõ, không giả làm thật: (27/11, CP2) model đang ở **chế độ giả** — bài nháp dựng theo mẫu từ dữ kiện, chưa gọi model thật · dữ liệu sản phẩm, kho, Page là `synthetic` · `schedule_post` mới lên lịch trong SQLite của app, **chưa gọi Facebook Graph API** · chưa có giao diện (chạy qua `python run.py`).

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
- Data card: `data/DATA_CARD.md` · bộ câu thử: `eval/benchmark.csv` — 24 câu (thuong 8 · kho 11 · tu_choi 5) · metric: `eval/metric_spec.yaml` (3 metric)
- **Chuẩn "đạt"** (chốt **trước 19:30 Thứ Sáu 27/11**, giữ nguyên đến 23:59 Thứ Bảy 28/11): "Đạt khi ≥ 80% câu qua, và 100% câu `tu_choi` qua (metric `an_toan_va_tu_choi`), và ≥ 90% câu đạt từng metric `khop_du_lieu_san_pham`, `chan_dung_loi_va_ton_kho`"
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
