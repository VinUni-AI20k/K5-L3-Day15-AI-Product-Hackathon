# Thiết kế — Agent lập lịch trình du lịch 2–3 ngày (Track C)

Ngày: 2026-11-27 · Trạng thái: bản nháp chờ duyệt

Kế hoạch triển khai: `docs/superpowers/plans/2026-11-27-travel-planner.md`

## 1. Mục đích và lý do

**Người dùng:** người muốn đi du lịch ngắn ngày (2–3 ngày, một thành phố) nhưng không tự lên được kế hoạch: không biết chọn điểm nào, ở đâu, đi lại thế nào, xếp sao cho vừa thời gian và ngân sách.

**Việc agent làm:** nhận một đoạn mô tả bằng tiếng Việt (sở thích — khám phá, ẩm thực, ngắm cảnh, chụp ảnh; ngân sách; số ngày / ngày đi; số người, có trẻ nhỏ không), rồi trả về **một lịch trình từng ngày, từng khung giờ**: điểm chơi, quán ăn, khách sạn, cách di chuyển giữa các điểm, tổng chi phí, và lý do chọn. Nếu không xếp được thì nói rõ ràng buộc nào cần nới, không xếp bừa.

**Bối cảnh nộp bài:** hackathon AI20K, Track C. Mốc: chuẩn "đạt" chốt CP2 19:30 27/11; §0–§7 spec CP3 10:00 28/11; đủ CP4 14:30 28/11. Rubric chấm một lát cắt, đo bằng bộ câu thử (`python run.py eval`) và mô phỏng chi phí.

**Lát cắt một câu (đề xuất):** *Một người/nhóm nhỏ định đi Đà Lạt 2–3 ngày · nhập sở thích, ngân sách, số ngày · AI chọn điểm, quán, khách sạn, phương tiện và code xếp giờ thoả mọi ràng buộc, hoặc nói không xếp được · người dùng nhận lịch từng giờ kèm tổng tiền và lý do chọn.*

**Chưa có:** bằng chứng pain (spec §1). Nhóm thu song song (review app du lịch, hỏi người quen vừa đi chơi). Thiết kế này không phụ thuộc vào kết quả đó, nhưng câu thử nên lấy từ đó.

## 2. Mục tiêu / không làm / thất bại dù chạy được

**Mục tiêu**
- Lịch trình 2–3 ngày, một thành phố (Đà Lạt), từ một tin nhắn đầu vào.
- Mọi con số (giá, giờ, thời lượng, tổng tiền, thời gian đi lại) lấy từ dữ liệu / tính bằng code.
- Lịch trả về qua bộ kiểm bằng code: 0 vi phạm.
- Thiếu thông tin bắt buộc (ngân sách, số ngày, số người) thì hỏi lại, không tự đoán.
- Không khả thi thì báo và gợi ý nới ràng buộc cụ thể.
- Thiết kế mở được sang nhiều thành phố (hướng C) mà không viết lại.

**Không làm (bản này)**
- Không đặt phòng, đặt vé, thanh toán thật — chỉ đề xuất.
- Không tìm web thật (bỏ Tavily); không giá thời gian thực.
- Không nhiều thành phố / chặng bay nối nhau (chỉ chừa chỗ).
- Không xếp lại theo thời gian thực như một tính năng riêng; "trễ chuyến / mưa" chỉ là tình huống khó trong bộ câu thử, xử lý bằng cách chạy lại bộ xếp lịch cho phần còn lại.
- Không đăng nhập / lịch sử người dùng cho luồng chấm.

**Thất bại dù chạy được**
- Model tự nhẩm tiền / giờ và sai lệch so với dữ liệu.
- Báo một điểm mở cửa / còn phòng khi dữ liệu nói không.
- Lịch chồng giờ, đến khi đã đóng cửa, vượt ngân sách.
- Đưa điểm không hợp trẻ nhỏ khi nhóm có trẻ nhỏ.
- Tự đoán ngân sách / số ngày thay vì hỏi lại.
- Lịch "đẹp" nhưng không giải thích được vì sao chọn.

## 3. Ràng buộc

- **Hợp đồng khung chấm (không đổi):** `codebase/agent.py` có `answer(text: str) -> {"output": str}`; `codebase/ai.py` có `call_model(system, user) -> {"text","model","tokens_in","tokens_out"}` bọc bởi `@model_call`, token lấy từ `usage` của API; mỗi công cụ là hàm có `@tool` trong `codebase/tools.py`; `codebase/tracing.py` là file khung, **không sửa**. Ba file `agent.py`, `ai.py`, `tools.py`, `tracing.py` hiện đã bị xoá khỏi working tree — phải khôi phục (`git checkout -- starter-repo/codebase/`) rồi viết lại `agent.py`, `ai.py`, `tools.py`.
- **Kiến trúc code theo `codebase/backend/`** (người dùng chọn): LangGraph `StateGraph` với node, `TypedDict` state, interrupt để người dùng chọn (HITL), FastAPI controller, lớp LLM service (Gemini/Ollama). Bỏ phần nghề nghiệp (CV, job, interview, company research).
- **Mọi lần gọi model đi qua `call_model`** trong `codebase/ai.py` để khung đếm được token. Node trong backend không gọi LangChain LLM trực tiếp.
- **Luồng chấm chạy không cần Postgres / Redis:** `answer()` dùng graph compile với checkpointer trong bộ nhớ (hoặc không checkpointer), không interrupt, chạy một mạch.
- Model không tự tính tiền / giờ (bẫy track C). Chỉ dùng dữ liệu tự dựng có seed, mô tả trong `data/DATA_CARD.md`; không dùng dữ liệu thật của người thật.
- Chuẩn "đạt" (`spec.md` §7, `eval/metric_spec.yaml`) chốt trước CP2, không sửa sau.

## 4. Các cách đã cân nhắc

| Cách | Được | Mất | Chọn? |
|---|---|---|---|
| **1. Model chọn điểm, code xếp giờ** — graph cố định: hiểu yêu cầu → tra dữ liệu → model chọn → code xếp & tính → code kiểm → (sửa ≤ N vòng) → model giải thích | Số luôn đúng; đúng luật track; giữ kiểu graph backend | Phải viết bộ xếp giờ đơn giản | **Chọn** |
| 2. Agent tự do + code kiểm cuối | Viết nhanh | Model nhẩm sai, nhiều vòng sửa, tốn token, khó 0 vi phạm | Loại |
| 3. Bộ giải tối ưu (OR-Tools), model chỉ hiểu & giải thích | Lịch tối ưu | Nặng, khó kịp; phần "AI quyết định" mờ | Loại |

Người dùng chọn cách 1. Hình dạng: **workflow cố định có một vòng sửa có giới hạn** (không phải agent tự do) — mỗi bước biết trước, dễ đo; vòng sửa đủ để xử lý vi phạm mà không cần agent tự chọn bước.

## 5. Thiết kế (đã quyết)

### 5.1 Luồng (LangGraph)

```
parse_request ──thiếu thông tin──▶ ask_back ──▶ END
      │ đủ
      ▼
research (tools, chỉ đọc) ──▶ select (model) ──▶ schedule (code) ──▶ validate (code)
                                   ▲                                      │
                                   └──── còn vi phạm & vòng < MAX_REPAIR ─┤
                                                                          │ sạch            │ hết vòng
                                                                          ▼                 ▼
                                                                   explain (model)    infeasible (model+code) ──▶ END
                                                                          ▼
                                                                         END
```

- **parse_request (model):** tin nhắn → `TripRequest` JSON: `city`, `days`, `start_date` (tuỳ chọn), `budget_vnd` (tổng), `adults`, `children` (kèm tuổi nếu có), `interests` ⊂ {kham_pha, am_thuc, ngam_canh, chup_anh}, `pace` (tuỳ chọn), `constraints` tự do. Code kiểm trường bắt buộc: `days`, `budget_vnd`, số người. Thiếu → `ask_back`. Thành phố không có trong dữ liệu → trả lời không hỗ trợ + danh sách thành phố có.
- **research (code + tools):** lấy ứng viên điểm chơi, quán ăn, khách sạn, phương tiện của thành phố, lọc sẵn bằng code theo trẻ nhỏ, ngày trong tuần (giờ mở), ngân sách thô.
- **select (model):** từ danh sách ứng viên (đã có id), chọn cho mỗi ngày: các điểm chơi (theo thứ tự mong muốn), quán ăn trưa/tối, 1 khách sạn cho cả chuyến, phương tiện chính; kèm lý do ngắn mỗi lựa chọn. Chỉ trả id + lý do, **không trả giờ, không trả tiền**. Ở vòng sửa, nhận thêm danh sách vi phạm.
- **schedule (code):** xếp giờ tuần tự mỗi ngày từ giờ bắt đầu (mặc định 08:00) đến giờ kết thúc (mặc định 21:00): cộng thời gian đi lại (`uoc_thoi_gian_di`), thời lượng tham quan, chèn bữa trưa ~11:30–13:30 và tối ~18:00–20:00; nếu đến sớm hơn giờ mở thì chờ; tính tổng tiền = vé × số người theo độ tuổi + ăn ước theo đầu người + phòng × số đêm + di chuyển.
- **validate (code, tool `kiem_lich_trinh`):** trả danh sách vi phạm có mã: `DONG_CUA` (đến/ở ngoài giờ mở), `CHONG_GIO`, `VUOT_NGAN_SACH`, `QUA_GIO_KET_THUC`, `KHONG_HOP_TRE_NHO`, `TRUNG_DIEM`, `ID_KHONG_TON_TAI`.
- **Vòng sửa:** `MAX_REPAIR = 2`. Ghi lý do dừng bằng `note(...)`.
- **explain (model):** nhận lịch đã xếp (JSON, số do code tính) → viết lịch dễ đọc tiếng Việt. Con số trong lời giải thích được **chèn bằng code từ lịch** (template / bảng), model chỉ viết phần lý do — để "mọi con số khớp công cụ: 100%".
- **infeasible:** code tính ràng buộc nào chặn (vd tổng tối thiểu > ngân sách, thời gian không đủ) → nêu số cụ thể và đề xuất nới (tăng ngân sách tối thiểu X, bớt 1 ngày, bỏ khách sạn hạng Y…).

### 5.2 Công cụ (`codebase/tools.py`, đều chỉ đọc, không tác động ra ngoài)

| Công cụ | Input | Output |
|---|---|---|
| `tra_diem_choi(city, co_tre_nho)` | thành phố, bool | điểm: id, tên, loại, nhãn sở thích, giờ mở theo thứ, thời lượng gợi ý, giá vé người lớn/trẻ em, hợp trẻ nhỏ, khu vực/toạ độ |
| `tra_quan_an(city)` | thành phố | quán: id, tên, món, giờ mở, giá trung bình/người, khu vực |
| `tra_khach_san(city, so_dem, so_nguoi)` | | khách sạn: id, tên, hạng, giá/đêm, sức chứa, khu vực, còn phòng (bool theo ngày) |
| `tra_phuong_tien(city)` | | phương tiện: loại (xe máy thuê, taxi, xe buýt…), giá theo ngày hoặc theo km |
| `uoc_thoi_gian_di(a, b, phuong_tien)` | 2 id, loại | phút, tiền (tính từ toạ độ/khoảng cách trong dữ liệu) |
| `kiem_lich_trinh(lich)` | lịch đã xếp | danh sách vi phạm |

### 5.3 Dữ liệu

- File JSON tự dựng có seed trong `starter-repo/data/` theo thành phố: `data/cities/da_lat/{diem_choi,quan_an,khach_san,phuong_tien}.json`. Thêm thành phố = thêm thư mục.
- Cố tình có chỗ khó: điểm đóng cửa thứ Hai, điểm không hợp trẻ nhỏ, khách sạn hết phòng vài ngày, quán chỉ mở tối, điểm xa nhau.
- Ghi nguồn tham khảo (trang công khai) và cách dựng trong `data/DATA_CARD.md`; tên dựng khi cần.

### 5.4 Nối với khung chấm và backend

- `codebase/ai.py::call_model` là chỗ duy nhất gọi model; hỗ trợ `fake` + `gemini` (theo `.env`: `MODEL_PROVIDER`, `MODEL_NAME`, `API_KEY`); token từ `usage_metadata`.
- Node trong backend gọi `call_model` (qua một adapter thay cho `ILLMService`) và gọi công cụ từ `codebase/tools.py`.
- `codebase/agent.py::answer(text)` dựng/lấy graph (không checkpointer Postgres, không interrupt), chạy một mạch, trả `{"output": lịch dạng chữ}`.
- Backend FastAPI (luồng app): giữ cấu trúc controller/repo/graph runner; graph có `interrupt_after=["select"]` để người dùng xác nhận/đổi khách sạn trước khi xếp giờ. Phần này làm sau khi luồng chấm chạy được.

### 5.5 Mở sang hướng C (chỉ chừa chỗ)

- `TripRequest` có `city` → sau đổi thành `legs: [{city, days}]`.
- Thêm công cụ `tra_chang_di(city_a, city_b)` và một node xếp chặng giữa các thành phố trước `schedule`; `schedule` chạy theo từng chặng.

### 5.6 Tình huống khó cho bộ câu thử (gợi ý)

Thiếu ngân sách / số ngày / số người → hỏi lại · ngân sách quá thấp → infeasible + mức tối thiểu · "muốn đi hết" mà chỉ 1 ngày · có trẻ nhỏ · đi ngày điểm chính đóng cửa · khách sạn ưa thích hết phòng · mưa / chuyến bay trễ 4 tiếng ngày đầu → xếp lại phần còn lại · thành phố không có trong dữ liệu · yêu cầu đặt phòng / thanh toán → từ chối, chỉ đề xuất · câu tự xưng nhân viên đòi bỏ qua ngân sách.

### 5.7 Quyết định bổ sung (người thiết kế tự quyết — kiểm lại khi đọc)

- **`answer(text)` không nhớ giữa các lần gọi.** Mỗi câu thử tự đủ thông tin. Câu "trễ chuyến / mưa → xếp lại" ghi luôn yêu cầu gốc + sự cố trong cùng một input (vd "…đi Đà Lạt 3 ngày… Chuyến bay ngày 1 trễ 4 tiếng, đến 12:00"); agent xếp lại từ thời điểm đó. Không có bộ nhớ toàn cục để tránh rò giữa các câu thử. Nhớ hội thoại chỉ có ở luồng app (checkpointer LangGraph theo `thread_id`).
- **Không có ngày đi:** không hỏi lại (ngày không bắt buộc); giả định đi từ **thứ Bảy gần nhất** và ghi rõ giả định trong output. Kiểm giờ mở theo thứ và còn phòng vẫn chạy theo ngày giả định.
- **Ngân sách** = tổng cho cả nhóm, **chi phí tại điểm đến** (vé tham quan, ăn, khách sạn, di chuyển trong thành phố); không gồm vé đến/về thành phố. Câu "mỗi người X" thì code nhân số người. Output ghi rõ ngân sách đã hiểu.

### 5.8 Dọn `codebase/backend/` (người dùng yêu cầu: bỏ phần không dùng)

Phạm vi: luồng app FastAPI **có** trong kế hoạch (người dùng yêu cầu dọn backend để dùng tiếp), làm sau luồng chấm. Backend là thư mục chưa commit — **sao lưu trước khi xoá** (commit nhánh riêng hoặc chép ra ngoài).

**Xoá** (phần nghề nghiệp / rác):
- `api/controller/cv.py`, `api/controller/interview.py`
- `orchestration/nodes/{job_finder,company_researcher,cv_reviewer,interview_nodes}.py`, `orchestration/prompts/*`, `graphs/interview_graph.py`, `state/interview_state.py`
- `application/repositories/{cv_repo,interview_repo}/`, `infrastructure/repositories/{cv_repo,interview_repo}.py`, `application/services/cv_service/`, `infrastructure/services/cv_service.py`
- Model `CVDocument`, `CVUsageHistory`, `InterviewHistoryItem`, `InterviewQAPair`; 3 migration cũ → thay bằng 1 migration đầu (users, agent_sessions)
- Mọi `__pycache__/`, `check_imports.py`; `init_db.py` sửa danh sách bảng
- Thư viện: `tavily-python`, `pypdf`, `python-docx`

**Đã làm (27/11):** đã xoá thêm phần "keo" gắn chặt với luồng nghề nghiệp — controller `agent`, `history`; repo `agent_repo`, `session_history_repo`; `graph_runner`, `session_events`, `stream_service`, `utils/helper.py`, `graphs/`, `state/`. Các file này viết quanh các bước job/interview, Task 9 dựng lại bản du lịch theo cùng khuôn (controller → IRepository → repo → graph runner). Bản gốc sao lưu ở scratchpad `backup/backend-career`.

**Giữ, sửa cho du lịch (kế hoạch ban đầu):** `main.py` (bỏ router cv/interview, đổi tên/mô tả app), `api/config/*` (đổi `CareerAgentException` → tên chung), controller `auth`, `agent`, `history`; repo `user`, `agent`, `session_history` (bỏ phần CV/phỏng vấn, `cv_id`); `session_service`, `stream_service`, `graph_runner`, `session_events` (bỏ sự kiện job/interview); `graph.py`, `state.py` viết lại theo §5.1; `llm_service` thay bằng adapter gọi `codebase/ai.py::call_model`. Đăng nhập (auth) giữ nguyên — đã chạy, dùng chung được.

## 6. Để lại cho người xây

- Cách dựng graph cho luồng chấm (sync wrapper quanh `ainvoke`, đặt `sys.path` để import `backend/src`).
- Thuật toán xếp giờ cụ thể (tham lam theo thứ tự model chọn là đủ).
- Định dạng chữ của lịch trả về, prompt cụ thể.
- Số lượng bản ghi dữ liệu (gợi ý ~20 điểm, ~15 quán, ~8 khách sạn).
- Dọn code nghề nghiệp trong backend: xoá hay để riêng.
