# Thiết kế — Soạn hàng loạt bài Fanpage từ file sản phẩm (WorkHardToday · Track F)

Ngày: 27/11/2026 · Người viết: Huy (backend + agent + UI) · Trạng thái: chờ duyệt

## 1. Mục đích

Nhân viên soạn bài của shop thời trang (váy nhập Taobao/1688) đang gửi từng sản phẩm vào ChatGPT rồi copy sang Facebook. Mỗi lượt ra vài bài; bài hiện tại gần như cùng một khuôn và không có dữ kiện sản phẩm; mã sản phẩm cuối bài có chỗ sai. Sản phẩm này cho họ tải một file nhiều sản phẩm, nhận lại một bảng bài nháp đúng dữ kiện, duyệt, rồi bài đã duyệt vào lịch đăng của Fanpage.

**Lát cắt (canvas dòng 5):** Một nhân viên soạn bài · tải lên file Excel/CSV nhiều sản phẩm (thông tin + prompt) · AI quyết định với từng dòng: viết bài từ đúng các trường trong file, hay đánh dấu dòng thiếu/mâu thuẫn thay vì bịa · nhân viên duyệt, bài đã duyệt vào lịch đăng Fanpage.

## 2. Mục tiêu · Không làm · Thất bại dù chạy được

**Mục tiêu**
- Tải `.xlsx` / `.csv` → mỗi dòng ra đúng một trong hai: **bài nháp** hoặc **dòng bị đánh dấu** kèm lý do theo từng trường.
- Bài chỉ chứa dữ kiện có trong dòng (giá, size, màu, chất liệu, mô tả), viết theo giọng của page được chọn.
- Nhân viên sửa chữ, duyệt, bỏ, hoặc bảo viết lại từng dòng.
- Bài đã duyệt được gán giờ đăng theo khung giờ của page, xem được trên lịch tuần.
- `python run.py`, `run.py eval`, `run.py simulate` chạy qua cùng một hàm xử lý một dòng.

**Không làm (lát cắt này)**
- Xử lý / sinh ảnh; đăng ngay (chỉ hẹn giờ); kênh khác ngoài Facebook; chatbot tư vấn khách.
- Tự đặt giá, tự tính khuyến mãi (chỉ **kiểm** giá trong file có hợp lệ không).
- Nhiều biến thể / A-B tiêu đề, học từ chỉnh sửa, đăng nhập nhiều người dùng.

**Thất bại dù chạy được**
- Bài có giá, size, màu, chất liệu, "chính hãng", "freeship", "giảm x%" không có trong file.
- Dòng bị đánh dấu hoặc chưa duyệt lọt vào lịch đăng.
- Repo công khai chứa file Excel gốc, tên nhân viên/KOL, mã đơn, page ID, API key, token.

## 3. Ràng buộc

- Python trong `D:\VinAI\.venv`; thêm `fastapi`, `python-multipart`, `openpyxl`, `openai` vào `requirements.txt`.
- Giữ hợp đồng khung: `codebase/agent.py::answer(text) -> {"output"}`, `codebase/ai.py::call_model(...)` có `@model_call`, công cụ có `@tool`. Không sửa `tracing.py`, `eval/run_eval.py`, `cost/simulate.py`, `run.py` (trừ `run_app()` nếu cần).
- Model: OpenAI, key lấy từ `D:\VinAI\.env` chép sang `.env` của repo (đã gitignore). Model nhỏ để chạy thật (thử `gpt-6-luna`, không gọi được thì `gpt-4o-mini`); một model "Vừa" để so chi phí.
- Đề cấm kết nối vào hệ thống thật. Lịch đăng mặc định là **lịch trong app**; chỉ gọi Facebook Graph API (`published=false`, `scheduled_publish_time`) khi `.env` có token của **Fanpage thử của nhóm**.
- File Excel gốc nằm ngoài repo (`D:\VinAI\Hackathon\*.xlsx`). Script đọc từ đó, chỉ ghi ra repo số tổng hợp và dữ liệu đã dựng lại.

## 4. Cách làm đã chọn và các cách đã loại

| Cách | Được | Mất | Chọn |
|---|---|---|---|
| **A. Workflow cố định: code kiểm → 1 lần gọi LLM (quyết định + viết) → code soát bài → viết lại ≤1 lần** | Chấm bằng code được; giá/size/màu luôn do code kiểm; chi phí mỗi dòng cố định (1–2 lần gọi); khớp bảng công cụ CP1 | Không "trông" multi-agent | ✅ |
| B. LangGraph 3 agent (kế hoạch → viết → kiểm) + Qdrant | Khớp techstack gợi ý | Vai "kế hoạch" không có việc (mỗi dòng đã nói cần viết gì); rubric R3 đòi lý do cho từng vai; thêm thư viện, token, giờ build | ✗ |
| C. Một agent tự gọi công cụ | Linh hoạt | Model có thể bỏ qua bước kiểm bằng code; số bước không cố định → khó tính chi phí, khó chấm | ✗ |

## 5. Thiết kế

### 5.1 Luồng một dòng (`process_row`)

```
dòng sản phẩm ──► check_product (code) ──lỗi cứng──► ĐÁNH DẤU (không gọi model)
                        │ ok + cảnh báo
                        ▼
                  check_stock (code) ──hết / không có mã──► ĐÁNH DẤU (không gọi model)
                        │ còn hàng (thu hẹp màu/size còn tồn)
                        ▼
              write_or_flag (LLM, JSON) ──decision=flag──► ĐÁNH DẤU (lý do của model)
                        │ decision=write
                        ▼
                verify_post (code) ──lỗi──► viết lại 1 lần kèm "SỬA LỖI BẮT BUỘC" ──vẫn lỗi──► ĐÁNH DẤU
                        │ sạch
                        ▼
                     BÀI NHÁP ──người duyệt──► schedule_post ──► lịch đăng (app; FB nếu có token)
```

### 5.2 Đầu vào

Một dòng = các trường sau (file mẫu tải được từ UI). Tên cột tiếng Việt quen thuộc của shop (`Mã`, `Tên sản phẩm`, `Giá bán`, `Size`, `Màu 1..5`, `Chất liệu`, `Mô tả`) được nhận qua bảng tên gọi khác.

`ma_sp, ten_sp, loai, gia_ban, gia_te (tuỳ chọn), size, mau, chat_lieu, mo_ta, page, prompt`

### 5.3 `check_product` — luật bằng code

- **Lỗi cứng → đánh dấu:** thiếu `gia_ban` hoặc `size` · giá không đọc được ("1.560.000đ", "1,56tr", "560k" đều đọc được) · giá ≤ 0 hoặc ngoài 50.000–20.000.000đ · `gia_te` có mà `gia_ban < gia_te × 13.500` (giá sàn của shop) · giá dưới giá sàn của page · size không đọc được · `mo_ta` nêu giá / size / chất liệu khác trường tương ứng (so bằng từ điển chất liệu lấy từ sheet "Chất liệu").
- **Cảnh báo (vẫn cho viết, model phải tránh):** thiếu `chat_lieu` hoặc `mau` → bài không được nhắc trường đó.
- **Prompt:** chứa cụm cấm ("chính hãng", "auth", "rẻ nhất", "số 1", "cam kết"…) hoặc dấu hiệu chèn lệnh ("bỏ qua hướng dẫn", "ignore previous"…) → đánh dấu `tu_choi`.

### 5.3b `check_stock` — kiểm kho trước khi soạn (thêm theo yêu cầu 27/11)

- Nguồn: `data/inventory.csv`, mỗi dòng là một biến thể, theo đúng dạng sheet "Đổ tồn" của shop: `ma_sp, mau, size, ton, trang_thai`. `trang_thai` lấy từ cột "Lưu ý nhận sx 1c": `Còn hàng`, `HẾT HÀNG`, `Không nhận sx 1c`, `Thanh toán hết mới nhận sx 1c`. Bản demo là file dựng có seed. Người dùng tải được file tồn mới qua `POST /api/inventory`, thay cho việc nối POS thật.
- Luật (code, chạy sau `check_product`, trước LLM):
  - Mã không có trong kho → **đánh dấu** "không kiểm được tồn".
  - Tổng tồn = 0 → **đánh dấu**:
    - "hết hàng" nếu `trang_thai` là `HẾT HÀNG` hoặc `Không nhận sx 1c`;
    - "hết tồn, chỉ nhận đặt may khi khách thanh toán hết — người quyết có đăng không" nếu `trang_thai` là `Thanh toán hết mới nhận sx 1c`.
  - Còn hàng một phần → **thu hẹp**: chỉ đưa cho model các màu/size còn tồn, cảnh báo biến thể bị bỏ. `verify_post` dùng danh sách đã thu hẹp, nên bài nhắc màu/size đã hết là lỗi.
  - Tồn ≤ 2 ở mọi biến thể còn lại → cảnh báo "sắp hết". Bài không được viết "sẵn nhiều", "đủ size".

### 5.4 `write_or_flag` — một lần gọi LLM

- Đầu vào: khối giọng page + dữ kiện đánh mã `[F1] Giá bán: 890.000đ`, `[F2] Size: S, M, L`… + cảnh báo của bước 5.3 + prompt. Ô của người dùng được bọc trong thẻ `<DU_LIEU>`/`<PROMPT>` và nói rõ là dữ liệu, không phải lệnh.
- Đầu ra JSON (structured output): `{decision: "write"|"flag", flag_reasons: [{field, issue}], post: {hook, body, cta, hashtags}, facts_used: ["F1",…]}`.
- Model đánh dấu khi: prompt đòi thông tin không có trong file, mô tả mâu thuẫn ngữ nghĩa với trường, hoặc prompt mơ hồ đến mức không viết được.

### 5.5 `verify_post` — soát bài bằng code

- Mọi số tiền trong bài phải khớp `gia_ban` (lệch ≤2% vì làm tròn); so theo loại đơn vị (tiền / % / cm / kg) để "45kg" không bị coi là giá.
- Size, màu, chất liệu nhắc trong bài ⊆ trường của dòng (từ điển màu, chất liệu).
- Không có cụm cấm; cụm có điều kiện ("freeship", "giảm x%", "tặng kèm") chỉ được nếu có trong dòng.
- Không có số điện thoại, link lạ. ≤3 emoji là cảnh báo, không chặn. Độ dài 250–1.200 ký tự.
- Mức: `block` (sai dữ kiện, cụm cấm) → viết lại; `warn` → hiện cho người duyệt.

### 5.6 Giọng page

`data/pages.json`: mỗi page có `gu` (lấy từ sheet quy định chọn hàng), xưng hô, emoji tối đa, **lời hứa được phép** (cam kết thật của shop: kiểm hàng trước khi thanh toán, hỗ trợ đổi hàng), từ cấm, giá sàn, khung giờ đăng (lấy từ sheet lịch đăng bài), 2–3 bài mẫu (học giọng, không chép nội dung). Tên page được đổi thành tên dựng. Bài mẫu chọn theo page + loại hàng, không dùng vector DB.

### 5.7 Lịch đăng

- Duyệt → gán khung giờ trống gần nhất của page, từ ≥ 10 phút sau hiện tại (giới hạn của Graph API), mỗi khung 1 bài. Người duyệt đổi được giờ.
- `schedule_post`: luôn ghi vào lịch trong app; nếu có `FB_PAGE_ID` + `FB_PAGE_TOKEN` thì tạo bài hẹn giờ trên Fanpage thử và lưu `fb_post_id`.

### 5.8 Lưu trữ và API

SQLite `data/app.db` (gitignore). Bảng `batches`, `rows`. Trạng thái dòng: `pending → written | flagged → approved | rejected → scheduled | failed`. Giữ `post_text` (máy viết) riêng với `edited_text` (người sửa) để đo tỉ lệ sửa.

| Method | Path | Việc |
|---|---|---|
| POST | `/api/batches` | tải file, tạo dòng, xử lý nền 4 luồng song song |
| GET | `/api/batches`, `/api/batches/{id}` | danh sách lô; các dòng + tiến độ |
| PATCH | `/api/rows/{id}` | sửa bài |
| POST | `/api/rows/{id}/approve` · `/reject` · `/regenerate` | duyệt (gán giờ) · bỏ · viết lại |
| GET | `/api/schedule?page=&week=` | lịch tuần |
| GET | `/api/pages`, `/api/template` | danh sách page; file mẫu |

UI là một trang HTML/CSS/JS thuần do FastAPI phục vụ, gồm 3 màn: **Tải file → Bảng bài nháp (sửa/duyệt) → Lịch tuần**.

### 5.9 Nối với khung chấm

`answer(text)` nhận một dòng (JSON hoặc các dòng `trường: giá trị`), gọi `process_row`. Đầu ra:
- `VIẾT\n<bài>`
- `ĐÁNH DẤU: <trường>: <vấn đề>; …`

Bộ câu thử (Vũ) dùng đúng định dạng này. Chuẩn đạt chấm được bằng code: đúng quyết định viết/đánh dấu, 0% bài có dữ kiện ngoài file.

### 5.10 Dữ liệu (`scripts/build_data.py`, đọc Excel ngoài repo)

- `data/pages.json`, `data/style_examples.json`: bài đã đăng, bỏ dòng mã cuối bài.
- `data/demo_products.xlsx` + `.csv`: ~30 váy dựng có seed, lấy từ phân bố thật (loại váy, khoảng giá, size, màu, chất liệu). ~1/3 số dòng được cài thiếu hoặc mâu thuẫn.
- `evidence/data-mining-numbers.md`: chỉ số tổng hợp, mỗi số kèm cách đếm:
  - số bài, % bài không nêu dữ kiện sản phẩm, % câu mở đầu trùng
  - % mã cuối bài không khớp mã trong bài
  - số đơn giảm sai mức khuyến mãi

## 6. Lấy từ elandhub (chỉ lấy ý và luật, không lấy stack)

| Lấy | Từ | Dùng ở |
|---|---|---|
| Kiểm số theo loại đơn vị + sai số 2%, cụm cấm, số điện thoại | `seeding/verify`, `intake/numbers.ts`, `script-engine/verifier.ts` | 5.5 |
| Sinh → soát bằng code → viết lại kèm "SỬA LỖI BẮT BUỘC" | `content-engine-v3/generate.ts`, `core/verifier.ts` | 5.1 |
| Bộ giọng thương hiệu: lời hứa được phép, từ cấm, xưng hô, bài mẫu bị cắt trước | `seeding/brand/kit.ts` | 5.6 |
| Dữ kiện đánh mã `[F1]` + model trả `facts_used`, code đối chiếu lại | `csbh-block.ts`, `references.ts` | 5.4 |
| Cụm có điều kiện (chỉ được nói khi nguồn có) | `luat-qc-75-keywords.ts` | 5.5 |
| Trạng thái duyệt, `edited_body` tách khỏi `body` | migrations `seeding_posts` | 5.8 |
| Bọc dữ liệu người dùng trong thẻ, tên thẻ khớp lời dặn | `PROMPT_INJECTION_DEFENSE` (sửa lỗi lệch tên thẻ) | 5.4 |

**Không lấy:** vai "đóng giả người dùng thật"; luật "chỉ nói điều tích cực"; so cụm cấm bằng chuỗi con thuần (chặn nhầm câu phủ định).

## 7. Đã chốt sau lượt đọc của người build

**Lấy từ data (có nguồn)**
- `gia_te` = giá nhập trên Taobao/1688, đơn vị **nhân dân tệ**. Luật shop (sheet quy định chọn hàng): "Giá tệ × 13,5" ra **giá sàn** VNĐ (13.500đ/tệ). Giá bán thật cao hơn: data cho thấy giá bán ≈ giá tệ × 15,2. Vậy luật là `gia_ban ≥ gia_te × 13.500`, không bắt bằng.
- Giá sàn theo page có sẵn trong cùng sheet (cột "Giá tệ tối thiểu × 13.500 = Giá bán tối thiểu"):
  - Lady fashion: 50 tệ = 675.000đ
  - phần lớn page: 40 tệ = 540.000đ
  - Heh, Leto: 35 tệ = 472.500đ
  - Aura, Chill: 20 tệ = 270.000đ

  Khi dựng tên page mới, giữ nguyên các mức này.
- Khung giờ đăng của từng page lấy từ sheet "Lịch đăng bài" (vd 8h, 9h, 10h, 11h, 18h…).

**Tôi tự chốt (đổi được)**
- **Page áp cho dòng:** khi tải file, UI bắt chọn page mặc định. Cột `page` của dòng thắng nếu khớp một page trong `pages.json`. Trống hoặc lạ thì dùng page mặc định, kèm cảnh báo.
- **Cụm cấm trong prompt:** bỏ qua khi có "không / đừng / tránh / chớ" đứng trong 3 từ phía trước. Ví dụ "đừng ghi chính hãng" không bị chặn.
- **Chấm bộ câu thử:**
  - `expected` do người ghi tay: quyết định viết hay đánh dấu; nếu đánh dấu thì ghi trường bị đánh dấu.
  - Câu đạt khi đúng quyết định. Với câu đánh dấu, thêm điều kiện: trường bị nêu nằm trong `expected`.
  - Độ bám dữ kiện chấm bằng script riêng `eval/grade.py`. Script đối chiếu bài với giá trị cho phép ghi sẵn trong câu thử, không gọi `verify_post`, để tránh tự chấm cho mình. Người thứ hai chấm tay 5 bài.
  - Vũ là người chốt `metric_spec.yaml`. Mục này chỉ là đề xuất.
- **Mô phỏng chi phí:** 1 phiên = 1 lô file, mỗi lượt = 1 dòng (`turns_per_session` = 5 / 20 / 50 dòng theo persona canvas). Dòng lỗi cứng tốn 0 lần gọi model, và chi phí đo được phản ánh đúng điều đó.
- **Múi giờ:** Asia/Ho_Chi_Minh. Một page hết khung giờ trống trong tuần thì tìm tiếp sang tuần sau, tối đa 30 ngày. Quá 30 ngày thì báo "hết khung giờ", không gán giờ.
- **Model:**
  - `gpt-5.6-luna` chạy chính; đã gọi thử được với key.
  - `gpt-4o-mini` làm mức rẻ để so.
  - `gpt-6-luna` là model suy luận, cần cấp đủ token. Gọi thử với 50 token thì trả về rỗng, nên chưa dùng.

## 8. Để lại cho người build

Câu chữ prompt, bảng từ điển màu/chất liệu, thiết kế giao diện cụ thể, số luồng song song, cách xếp file trong `codebase/`.
