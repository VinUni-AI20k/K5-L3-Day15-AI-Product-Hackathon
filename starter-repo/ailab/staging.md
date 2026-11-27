# AI Lab — up để chạy (staging)

AI Lab = **Mô hình · Trình chơi · Ứng dụng · Trợ lý game** (chatbot viết game HTML), chuyển từ JULY Learning sang repo này
và làm lại gọn: **chỉ hai vai Admin và User**, không có hệ phân quyền chi tiết. Mọi thứ nằm trong `ailab/`; không sửa khung
(`codebase/`, `run.py`, `eval/`, `cost/`, `spec.md`), theo `AGENTS.md`.

## Chạy một phát (khuyến nghị)

Từ thư mục gốc repo, trên máy đã có Python 3.10+, bash và curl:

```bash
bash scripts/staging.sh all
```

Một lệnh làm cả chuỗi: tạo `.env` từ `.env.example` nếu chưa có → chạy unittest → chạy server nền → chờ `/health` → chạy bộ kiểm `smoke.sh` → in địa chỉ,
tài khoản và mật khẩu. Dừng bước nào là báo lỗi và thoát khác 0. Kết quả mong đợi cuối cùng:

```
== 1/3 unittest ... OK
== 2/3 chạy server ... Đã chạy → http://127.0.0.1:8800
== 3/3 smoke ... TẤT CẢ QUA
AI Lab đang chạy: http://127.0.0.1:8800
Đăng nhập: admin / <mật khẩu>
```

- **Mật khẩu admin:** chưa đặt `AILAB_ADMIN_PASSWORD` và chưa có DB thì script tự sinh một mật khẩu và in ra **một lần**; hãy chép lại. Muốn tự đặt:
  `AILAB_ADMIN_PASSWORD='đổi-mật-khẩu-này-123' bash scripts/staging.sh all`. Nếu DB đã có sẵn mà không đặt biến này, script bỏ qua smoke (không biết mật khẩu) và vẫn chạy server.
- **Model:** chưa nối model thật thì chatbot ở chế độ **GIẢ** (script in rõ). Nối model xem mục 3.
- **Smoke để lại** vài tài khoản `smoke_user_*` trong DB staging; `SKIP_SMOKE=1 bash scripts/staging.sh all` để bỏ bước này.
- Cổng, địa chỉ, DB: `AILAB_PORT`, `AILAB_HOST`, `AILAB_DB` (bảng ở mục 1).

Các lệnh con còn lại: `up` (chỉ chạy server) · `down` · `restart` · `status` · `test` · `smoke` · `logs` · `backup` · `reset` (chuyển dữ liệu cũ sang `ailab/data/old-<giờ>/`, không xoá).
`bash scripts/staging.sh` không đối số in danh sách này. Các mục 1 đến 8 bên dưới là cách làm tay từng bước, dùng khi cần hiểu hoặc gỡ lỗi.

## 0. Cần gì

- Python **3.10+** (đã thử 3.12). **Không `pip install`**: chỉ thư viện chuẩn, dữ liệu trong một file SQLite.
- `curl` và `bash` nếu chạy `ailab/smoke.sh`.
- Trình duyệt hiện đại. Camera chỉ bật được khi mở bằng **`http://localhost` hoặc HTTPS** (xem mục 6).
- Muốn tải mô hình Teachable Machine và thư viện (tfjs, @teachablemachine) khi chơi: máy chơi cần ra internet (cdn.jsdelivr.net, teachablemachine.withgoogle.com).

## 1. Chạy từ máy sạch

```bash
git clone <repo-của-nhóm> && cd <repo>
python3 --version                      # phải >= 3.10 (Windows: py --version)
AILAB_ADMIN_PASSWORD='đổi-mật-khẩu-này-123' python3 ailab/server.py
```

Lần chạy đầu tạo file DB và tài khoản **admin** (mật khẩu lấy từ `AILAB_ADMIN_PASSWORD`; nếu không đặt, server tự sinh một mật khẩu và
**in ra đúng một lần** trong cửa sổ chạy, hãy chép lại). Server in địa chỉ và cho biết model là **GIẢ** hay thật.

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `AILAB_HOST` | `127.0.0.1` | Địa chỉ nghe. Muốn máy khác trong mạng vào: `0.0.0.0` |
| `AILAB_PORT` | `8800` | Cổng |
| `AILAB_DB` | `ailab/data/ailab.db` | Đường dẫn file SQLite (thư mục được tạo nếu chưa có) |
| `AILAB_ADMIN_PASSWORD` | (tự sinh) | Mật khẩu admin lần đầu |
| `AILAB_COOKIE_SECURE` | (tắt) | Đặt `1` khi chạy sau HTTPS để cookie có cờ Secure |

Thư mục dữ liệu mặc định `ailab/data/` và mọi file `*.db` đã nằm trong `ailab/.gitignore`: **không commit dữ liệu thật, không commit file .db**.

## 2. Tạo tài khoản Admin và User

- **Admin đầu tiên**: tự có ở lần chạy đầu (mục 1). Tạo thêm Admin, hoặc User, bằng dòng lệnh (hỏi mật khẩu nếu bỏ `--password`):
```bash
python3 ailab/server.py create-user cô.lan --admin --password 'mat-khau-it-nhat-8-ky-tu'
python3 ailab/server.py create-user giaovien1 --password 'mat-khau-it-nhat-8-ky-tu'
python3 ailab/server.py set-password admin --password 'mật-khẩu-mới-123'     # quên mật khẩu: đổi ở đây (đăng xuất mọi phiên của tài khoản đó)
```
- **User tự tạo** trên web: trang đăng nhập → “Tạo tài khoản” (mật khẩu >= 8 ký tự). Admin đổi vai trò ở tab **Duyệt & tài khoản**.
- Hai vai: **Admin** (duyệt/ẩn trình chơi, xem mọi thứ, đổi vai trò, ít nhất một Admin luôn còn) và **User** (tạo và sửa đồ của mình).

## 3. Cấu hình model AI cho Trợ lý game (.env)

```bash
cp .env.example .env     # Windows: copy .env.example .env   (.env đã có trong .gitignore, KHÔNG commit, KHÔNG dán key vào code)
# điền MODEL_PROVIDER, MODEL_NAME, API_KEY theo docs/connect-model.md
```

Trợ lý gọi `call_model` trong `codebase/ai.py` (khung của repo). **Hiện nhánh model thật trong `ai.py` chưa được nhóm viết**, nên Trợ lý đang ở
**chế độ giả**: nó dựng game từ hai khuôn có sẵn (Quiz ABCD bằng cử chỉ, Vòng quay), *không* theo sát mô tả của giáo viên, và giao diện ghi rõ “Chế độ giả”.
Khi nhóm nối model thật (xem `docs/connect-model.md`), Trợ lý tự dùng; lỗi gọi model thì tự rơi về chế độ giả và nói rõ lý do. AI Lab không tự nối provider.

### Trợ lý game: chatbot chỉ đề xuất, người dùng quyết

Chatbot không tự lưu game. Mỗi lần trả lời có một **đề xuất** (`reply.proposal`: tên, mô tả, danh sách cờ cảnh báo, nguồn là model giả hay thật).
Mỗi cờ cho biết **vì sao** cảnh báo (`reason`), **ở dòng nào** (`line`) và **đoạn mã gây cờ** (`excerpt`). Cờ là câu hỏi cho người duyệt, không phải lời từ chối.

| Việc | Lệnh API (đã đăng nhập) |
|---|---|
| Xem thử đề xuất (iframe sandbox) | `GET /api/chats/<chatId>/proposals/<index>/try` |
| **Chấp nhận** → thành trình chơi *Nháp* (vẫn chờ Admin duyệt) | `POST /api/chats/<chatId>/proposals/<index>/accept` |
| **Từ chối** → bỏ, không lưu gì | `POST /api/chats/<chatId>/proposals/<index>/reject` |

Một đề xuất chỉ quyết một lần (lần hai trả 409). Sau khi chấp nhận hoặc từ chối, mã html bị bỏ khỏi cuộc trò chuyện.

### Bộ đề và sửa thông tin (tên, mô tả, ảnh)

**Bộ đề** là nguồn câu hỏi dùng lại cho nhiều ứng dụng. Mỗi dòng một câu: `Câu hỏi | Đáp án A | Đáp án B | =B` (Đúng/Sai: `Câu hỏi | =Đúng`). Ứng dụng chọn một bộ đề thay vì dán câu hỏi; **sửa bộ đề thì ứng dụng chơi bản mới nhất**, bộ đề bị xoá thì ứng dụng dùng bản chép lúc lưu. Bộ đề đang có ứng dụng dùng không xoá được (409). Bộ đề của ai người đó thấy, Admin xem hết (`?scope=all`).

| Việc | API (đã đăng nhập) |
|---|---|
| Danh sách, tạo bộ đề | `GET /api/exams` · `POST /api/exams` {name, description, image, content} |
| Xem, sửa nội dung, xoá | `GET` · `PUT` · `DELETE /api/exams/<id>` |
| Chọn bộ đề cho ứng dụng | `POST /api/apps` hoặc `PUT /api/apps/<id>` với `examId` (bỏ `content`) |
| **Sửa tên, mô tả, ảnh** của mô hình, trình chơi, ứng dụng, bộ đề | `POST /api/<models\|players\|apps\|exams>/<id>/meta` {name?, description?, image?} |

Ảnh là data URL png, jpeg hoặc webp, tối đa **300 KB** (giao diện nên thu nhỏ còn khoảng 640 px); `image: ""` là bỏ ảnh. Sửa được: đồ của chính mình, hoặc Admin sửa đồ của bất kỳ ai.
Không sửa được: mô hình có sẵn "Bàn tay" (kể cả Admin), trình chơi mẫu (chỉ Admin sửa thông tin). Sửa tên trình chơi chỉ đổi tên hiển thị, không đổi khối `jl-camera` trong mã.
DB cũ tự được thêm cột mới khi chạy lại, không mất dữ liệu.

### Dữ liệu và ảnh nền có sẵn

- **6 bộ đề có sẵn của AI Lab** (mỗi bộ 15 câu, mọi người dùng được, chỉ Admin sửa): Toán 12 (Đạo hàm và khảo sát hàm số · Nguyên hàm và tích phân), Tiếng Anh 12 (Ngữ pháp · Từ vựng và giao tiếp), Tin học 12 (Cơ sở dữ liệu và SQL · Mạng máy tính và Internet). Nội dung ở `ailab/seed_exams.json`; **do AI soạn, thầy cô cần kiểm lại trước khi dùng thật**. Thêm bộ đề có sẵn: thêm một mục vào file đó rồi chạy lại server (chỉ thêm khi chưa có bộ đề cùng tên).
- **Ảnh nền có sẵn** (`ailab/seed_images/*.jpg`, 640×360): ảnh *chụp màn hình thật* của 5 game đã nhập (Cầu Lông 3D, Sút Penalty 3D, Giải cứu thế giới, Chim Bay Nói, Tết 2027) và của game Quiz ABCD mẫu; riêng Vòng quay và mô hình Bàn tay dùng ảnh minh hoạ vì không có màn hình game để chụp. Gắn theo **tên** mỗi lần chạy: mục chưa có ảnh được điền, mục người dùng đã tự đổi ảnh thì giữ nguyên, ảnh có sẵn đổi bản mới thì tự cập nhật.
- Trợ lý game: nút **Thêm vào Trình chơi** lưu game thành trình chơi *Nháp* (Admin duyệt sau) và hiện nút **Mở trong Trình chơi**; **Không dùng** bỏ đề xuất, không lưu gì.

### Mô hình Bàn tay (MediaPipe)

Mô hình có sẵn "Bàn tay (MediaPipe)" (nắm tay, xòe tay, không có tay) do AI Lab tự tạo ở lần chạy đầu, không sửa hoặc xoá được. Cần camera và **internet**
(`cdn.jsdelivr.net`, `storage.googleapis.com`): bản staging này chưa tự phục vụ file MediaPipe như JULY Learning. Chưa thử với webcam thật.

## 4. Kiểm nhanh sau khi chạy

Mở http://127.0.0.1:8800 (đăng nhập admin). Hoặc chạy cả bộ kiểm bằng một lệnh, ở thư mục gốc repo, trong cửa sổ khác:
```bash
curl -s http://127.0.0.1:8800/health                       # {"ok": true}
BASE=http://127.0.0.1:8800 ADMIN_PASSWORD='đổi-mật-khẩu-này-123' bash ailab/smoke.sh
python3 -m unittest discover -s ailab -p "test_*.py"       # kiểm phần lõi, không cần mạng
```
`smoke.sh` đi qua: health → Admin đăng nhập → User đăng ký (User không vào được trang Admin) → tạo mô hình (từ chối link lạ) →
thêm trình chơi (từ chối HTML sai, trạng thái **Nháp**) → tạo ứng dụng (từ chối thiếu ô, link chơi không cần đăng nhập, có CSP) →
chatbot sinh game (lưu **Nháp**) → User gửi duyệt, không tự duyệt được, Admin duyệt → game vào Cộng đồng → dọn dữ liệu thử.
Thoát 0 và in `TẤT CẢ QUA` là đạt.

**Giao diện** làm theo màn AI Lab của JULY Learning: thanh trên có 4–5 tab (Mô hình · Trình chơi · Ứng dụng · Trợ lý game · Duyệt & tài khoản cho Admin); mỗi màn danh sách có **Bộ lọc** bên trái (Nguồn, Loại, Số đáp án / Trạng thái…, có đếm), lưới thẻ ở giữa (tìm theo tên, phân trang 12/24/48 mỗi trang) và **khung chi tiết** bên phải. Bộ chọn mô hình / trình chơi khi tạo ứng dụng là cùng khung đó mở thành cửa sổ. Token màu, `shell.css` và font Be Vietnam Pro trong `ailab/web/` là **bản chép** từ JULY Learning (`packages/tokens`, `packages/picker-shell`), không sửa tay; chép lại khi bên đó đổi.

**Kiểm bằng tay trên web** (camera thật không kiểm tự động được):
1. **Mô hình → Tạo mô hình**: làm theo 3 bước (huấn luyện ở Teachable Machine, “Upload my model”, dán link, “Đọc các lớp”). **Thêm mô hình**: dán sẵn link. Chọn một thẻ để xem chi tiết; mô hình Hình ảnh / Tư thế có nút **Bật camera** và công tắc “Tự mở camera khi xem trước” ngay ở khung phải.
2. **Trình chơi → Thêm trình chơi**: dán/tải HTML. Chọn một thẻ để chơi thử ngay trong khung chi tiết; menu ⋮ trên thẻ có Gửi duyệt, Công khai, Sửa, Xoá.
3. **Ứng dụng → Thêm ứng dụng**: bấm ô **Trình chơi** và **Mô hình** để mở bộ chọn (lọc, xem trước, “Chọn … này”), gắn ô với lớp, tick “Cho phép ai có link…”, **Chơi** → “Bật camera”.
4. **Trợ lý game**: mô tả game → Trợ lý **đề xuất** (chưa lưu gì) kèm cờ cảnh báo (nhãn, lý do, dòng, đoạn mã) → **Xem thử** → **Chấp nhận** (lúc này mới lưu thành trình chơi **Nháp**) hoặc **Từ chối** → **Gửi duyệt** ở Trình chơi → Admin vào **Duyệt & tài khoản** bấm Duyệt.

## 5. Quy tắc nhóm cần biết (theo AGENTS.md)

- **Game do AI sinh luôn ở trạng thái Nháp** (cả khi giả). Nháp → Gửi duyệt (Chờ duyệt) → Admin Duyệt (Đã duyệt, công khai) hoặc Từ chối (kèm lý do). Sửa bản đã duyệt thì phải duyệt lại. Admin có thể Ẩn / Khôi phục.
- Mỗi trình chơi được quét bằng 6 luật tự động (chuyển trang, mở cửa sổ, gọi mạng, chạy chữ như mã, đọc ảnh camera, thoát khung) và nạp script ngoài cdnjs/jsdelivr/unpkg. **Cờ là câu hỏi cho Admin, không phải lời từ chối.** Khi chạy, trình chơi nằm trong `iframe sandbox="allow-scripts"` với CSP chặt (không gọi mạng được).
- **Phần còn giả hoặc chưa làm** (nói thẳng): model AI của Trợ lý (giả cho đến khi nối); mô hình **Âm thanh** chỉ lưu, chưa chạy; **không** có mô hình “Bàn tay” dựng sẵn, “Nghe và chép lời”, Phòng chơi bằng điện thoại, thử thách, bộ đề, cộng đồng có tìm kiếm/ phân trang; việc **huấn luyện** mô hình vẫn làm ở Teachable Machine (AI Lab chỉ lưu link + các lớp); camera/mô hình **chưa thử với webcam thật** trong phiên làm này (chỉ kiểm giao diện và API).
- Giới hạn: 100 mô hình, 50 trình chơi, 200 ứng dụng mỗi tài khoản; file trình chơi <= 2 MB; đăng nhập sai 10 lần / 5 phút / IP thì tạm khoá. Đây là giá trị thiết kế *(tự ước tính, chưa đo tải)*. Chưa đo số người dùng cùng lúc.

## 6. Chạy nền, HTTPS (cần cho camera khi vào từ máy khác)

```bash
mkdir -p ailab/data     # log và pid để cùng chỗ với DB (ailab/data/ đã bị .gitignore)
AILAB_HOST=127.0.0.1 AILAB_PORT=8800 AILAB_ADMIN_PASSWORD='đổi-mật-khẩu-này-123' nohup python3 ailab/server.py > ailab/data/ailab.log 2>&1 &
echo $! > ailab/data/ailab.pid
```
Trình duyệt chỉ cho bật camera trên **HTTPS hoặc localhost**. Với máy khác trong mạng: đặt một reverse proxy có HTTPS (nginx, Caddy…) trỏ về `127.0.0.1:8800`, chạy server với `AILAB_COOKIE_SECURE=1`. Server này là `http.server` thư viện chuẩn, đủ cho staging nhỏ, **chưa đủ cho tải lớn**.

## 7. Dừng, sao lưu, dọn dữ liệu

- **Dừng**: Ctrl+C ở cửa sổ đang chạy; chạy nền thì `kill $(cat ailab/data/ailab.pid)`.
- **Sao lưu**: dừng server rồi chép file DB (`cp ailab/data/ailab.db ailab-backup.db`). Dữ liệu là một file duy nhất.
- **Dọn sạch** (xoá toàn bộ tài khoản, mô hình, trình chơi, ứng dụng, hội thoại — **không hoàn lại được**): dừng server, `rm -rf ailab/data` (hoặc xoá file `AILAB_DB`), chạy lại; admin và hai trình chơi mẫu được tạo lại.
- Tài khoản `smoke_user_*` do `smoke.sh` tạo vẫn còn sau khi chạy; dọn như trên, hoặc dùng DB tạm (`AILAB_DB=/tmp/ailab-test.db`) khi kiểm.

## 8. Lỗi thường gặp

| Dấu hiệu | Cách xử lý |
|---|---|
| `Address already in use` | Cổng đang bận: đặt `AILAB_PORT=8801` hoặc tắt tiến trình cũ. |
| Quên mật khẩu admin | `python3 ailab/server.py set-password admin --password …` |
| “Bạn cần đăng nhập” liên tục | Cookie bị chặn, hoặc chạy sau HTTPS mà quên `AILAB_COOKIE_SECURE=1` / ngược lại đặt =1 mà vào bằng http. |
| `database is locked` | Hai server cùng dùng một DB, hoặc đang sao lưu lúc chạy: chỉ chạy một server. |
| Camera “chưa được cấp quyền” / không bật | Mở bằng HTTPS hoặc localhost, cho phép camera trong thanh địa chỉ; camera đang bị app khác giữ thì báo “bận”. |
| “Không nạp được mô hình” | Link phải là bản đã “Upload my model” và còn công khai; máy chơi cần vào được teachablemachine.withgoogle.com và cdn.jsdelivr.net. Mô hình Âm thanh chưa chạy. |
| “Không đọc được các lớp” khi Tạo/Thêm mô hình | Link sai hoặc đã xoá; thử mở `<link>metadata.json` trên trình duyệt. |
| Trợ lý trả “Chế độ giả” | Đúng với hiện trạng (mục 3). Sau khi nối model, kiểm `.env` và dòng “Model AI” khi server khởi động. |
| Trợ lý báo “Không gọi được model … dùng chế độ giả” | Hết lượt, sai key, mất mạng, hoặc nhánh provider chưa viết trong `codebase/ai.py`. |
| Thêm trình chơi bị từ chối `no_block` / `many_blocks` / `bad_name`… | Cần đúng một khối `<script type="application/json" id="jl-camera">`, `name` 1–60 ký tự; thông báo trên web nói rõ lý do. |
| Xoá mô hình / trình chơi báo “đang được dùng” | Xoá hoặc đổi ứng dụng đang dùng nó trước. |
