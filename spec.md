# AI SPEC — AI Game Composer (Reuse-first, Generate-if-needed) · Nhóm 4ChangLinhNguLam · Lớp L3A

> Mốc nộp: §7 chốt chuẩn "đạt" tại **CP2 19:30 Thứ Sáu 27/11** · §0–§7 nộp **CP3 10:00 Thứ Bảy 28/11** · đủ §0–§10 **CP4 14:30 Thứ Bảy 28/11** · §10 changelog ghi tiếp đến **23:59 Thứ Bảy 28/11**.
> Tài liệu phân biệt rõ **Hiện trạng triển khai** và **Kiến trúc mục tiêu**. Không ghi nhận kết quả chưa kiểm chứng là đã hoàn thành.

Track: [x] A · [ ] B · [ ] C · [ ] D · [ ] E — bài toán: **A3 – Sản xuất bài giảng bằng AI** (mở rộng vào quy trình tạo & kiểm duyệt trò chơi ôn tập tương tác gắn với bộ câu hỏi bài giảng).
Data BTC cấp đã dùng (nếu có — không commit nguyên file): Không sử dụng dữ liệu thô `data/preclass/` cho bản chạy thử; dùng Catalog & 6 bộ đề mẫu có sẵn trong `ailab/seed_exams.json` (kèm bộ đề giáo viên nhập thực tế).

## §0. Hiện tại việc này diễn ra thế nào *(guide 1.1)*
- **Luồng hiện tại của việc này (quy trình phổ biến của giáo viên — giả thuyết cần kiểm chứng qua phỏng vấn/khảo sát):**
  1. Giáo viên xác định chủ đề ôn tập và chuẩn bị bộ câu hỏi bài giảng (Word, PDF, Google Docs hoặc slide).
  2. Tự tìm công cụ trò chơi bên ngoài (Kahoot, Quizizz, Wordwall, PowerPoint) hoặc tìm trình chơi HTML có sẵn trong AI Lab.
  3. Nhập tay hoặc chuyển đổi định dạng từng câu hỏi/đáp án vào công cụ.
  4. Cấu hình hình thức tương tác (chuột, camera/cử chỉ nếu dùng AI Lab) và tự chạy thử để kiểm tra tương thích thiết bị trước giờ lên lớp.
  5. Chỉnh sửa lại thủ công khi định dạng câu hỏi lệch hoặc thiết bị lớp học không tương thích.
- **Công cụ / AI đang được dùng cho việc này:** Các nền tảng quiz thương mại (Kahoot, Quizizz, Wordwall), ChatGPT/Claude rời rạc để gợi ý câu hỏi rồi copy-paste thủ công, và bản staging AI Lab nội bộ (`ailab/`). Mức độ sử dụng thực tế trong nhóm đối tượng mục tiêu: *chưa kiểm (đang thu thập qua khảo sát & phỏng vấn)*.

## §1. Người dùng & bằng chứng *(guide 1.1, 1.2)*
- **Người dùng chính (một vai cụ thể):** Giáo viên / giảng viên trực tiếp soạn và tổ chức trò chơi ôn tập tương tác cho buổi học.
- **Việc họ cố làm xong (`động từ + đối tượng + bối cảnh`, không có chữ AI):** Tạo một trò chơi ôn tập tương tác gắn với bộ câu hỏi bài học, tương thích thiết bị lớp học và sẵn sàng đưa vào giảng dạy.
- **Hôm nay họ giải bằng gì, hỏng ở đâu, vì sao chưa bỏ:** Dùng Kahoot/Quizizz/slide hỏi đáp hoặc tự ghép công cụ rời rạc; chưa bỏ vì quen tay và dễ chạy với câu hỏi trắc nghiệm cơ bản, nhưng hỏng ở khâu tốn thời gian chuẩn bị lại theo từng bài, khó đổi hình thức tương tác phù hợp bối cảnh lớp và thiếu cơ chế kiểm tra tương thích thiết bị tự động trước giờ dạy.
- **Pain (KHÔNG chữ AI — giữ nguyên bản CP1):** Khi chuẩn bị trò chơi ôn tập cho bài giảng, giáo viên phải tự lựa chọn hình thức tương tác, đưa bộ câu hỏi vào trò chơi và kiểm tra tính tương thích với thiết bị sử dụng, khiến quá trình chuẩn bị tốn thời gian và có nguy cơ gián đoạn khi tổ chức trên lớp.
- **Bằng chứng — số chính + kết luận (chi tiết: `evidence/summary.md`):** *Bằng chứng sơ bộ CP2 từ `n = 6` phiếu khảo sát thực tế (`evidence/survey/results.csv`, chưa đạt ngưỡng CP3 ≥20 và chưa ghi % vì `n < 10`):* `6/6` gặp khó ở khâu soạn câu hỏi/đáp án & hạn chế thời gian tổ chức; `5/6` mất nhiều thời gian cấu hình; `4/6` chọn tương tác chuột/bàn phím; `2/6` tốn ≥30 phút (`S4, S5`) và `4/6` tốn 10–<30 phút; `2/6` khó đưa bộ câu hỏi có sẵn vào trò chơi; `2/6` gặp sai sót câu hỏi/đáp án; `1/6` gặp lỗi tương thích thiết bị/phần mềm (`S6`) và `1/6` gặp lỗi khi dùng trên lớp (`S5`). Đang tiếp tục thu thập thêm khảo sát (đạt ≥20) và/hoặc ≥3 phỏng vấn sâu trước CP3 để xác thực đầy đủ giả thuyết và có Baseline thật.

## §2. Impact & quyết định chọn *(guide 1.3)*

| Hướng | Bao nhiêu người gặp | Bao nhiêu lần / tháng | Mỗi lần tốn gì | Impact / tháng | Làm kịp không | Chọn? |
|---|---|---|---|---|---|---|
| **H1 (Chọn): AI Game Composer — chọn/tạo module game + sinh bộ đề + kiểm duyệt cho buổi ôn tập** | 6 tình huống thật S1–S6 (5 vai giáo viên + 1 Lab Coach) do TV1 cung cấp 27/11; **chưa có số người đại diện** | Chưa đo | Thời gian cấu hình + soạn/ghép bộ đề + kiểm duyệt: **Baseline 10–20 phút/trò chơi** *(nguồn: S1)* | Chưa tính vì thiếu tần suất và With Agent | **Có (P0)** — tận dụng trực tiếp nền tảng `ailab/` | **Chọn** |
| H2 (Loại): Tự động sinh toàn bộ video bài giảng hoàn chỉnh từ slide | *(Chưa đo)* | Thấp (theo chương) | Rất tốn thời gian dựng & soát lỗi kiến thức | Khó kiểm soát lỗi hình/âm trong 10 giờ | Không kịp (API video đắt & chậm, bẫy A3) | Loại |
| H3 (Loại): Chấm điểm & nhận xét bài tự luận cuối kỳ tự động | *(Chưa đo)* | 1–2 lần / học kỳ | Rủi ro sai điểm số rất cao | Tần suất thấp trong từng buổi học | Chưa tận dụng được nền tảng AI Lab sẵn có | Loại |

- **Phương pháp đo Impact chính:**
  - **Chỉ số:** Thời gian hoàn thành 1 trò chơi ôn tập sẵn sàng dùng trên lớp, bao gồm thời gian cấu hình và kiểm duyệt (**đơn vị: phút/trò chơi**).
  - **So sánh:** *Baseline* (quy trình giáo viên đang dùng) vs *With Agent* (quy trình dùng AI Game Composer) trên cùng yêu cầu giảng dạy và bộ đề tương đương.
  - **Công thức Impact / tháng:** `Số giáo viên × Số trò chơi / tháng × (Thời gian Baseline − Thời gian With Agent)` *(đã có Baseline 10–20 phút/trò chơi từ tình huống thật S1 do TV1 cung cấp 27/11; **chưa có số giáo viên, tần suất và With Agent nên chưa tính Impact** — không bịa số)*.
- **Hướng ĐÃ LOẠI + vì sao:**
  - *H2 (Sinh video bài giảng):* Tốn chi phí API và thời gian render lớn, vượt phạm vi 10 giờ (track A3 cảnh báo tránh làm video).
  - *H3 (Chấm điểm tự luận):* Rủi ro sai lệch điểm số cao và không tận dụng được hệ sinh thái AI Lab (`Model + Player + Question Set`) team đã có.
- **Số lần / tháng của từng kiểu người dùng (dùng cho persona ở §8):** Dự kiến chia 3 nhóm dùng ít / vừa / nhiều. Đã có 5 vai người dùng thật S1–S6 làm cơ sở định nghĩa persona (Tiểu học, CĐ/ĐH, Mầm non, THCS, Lab Coach AI20k); **số lần / tháng chưa đo** — TV4 phải ghi rõ *(tự ước tính)* khi điền `cost/personas.yaml`.

## §3. Giải pháp tương tự & So sánh phương án *(guide 2.1)*

### So sánh 3 phương án giải quyết bài toán

| Tiêu chí | A. Công cụ hiện có / Thủ công (Kahoot, Quizizz, AI Lab ghép tay) | B. Rules / Template Wizard cố định | C. Reuse-first, Generate-if-needed AI Workflow + Risk Guard + HITL *(Chọn)* |
|---|---|---|---|
| **Hiểu yêu cầu tự nhiên** | Không (giáo viên tự dịch sang cấu hình) | Thấp (chỉ chọn dropdown / khớp từ khóa cứng) | **Cao** (hiểu mục tiêu bài học, trình độ, yêu cầu tương tác tự do & hỏi lại khi mơ hồ) |
| **Tính linh hoạt** | Trung bình (bị bó trong khuôn mẫu từng app) | Thấp (không xử lý được nhu cầu ngoài template) | **Cao** (ưu tiên tái sử dụng Catalog; chỉ sinh HTML nháp mới khi Catalog không đáp ứng) |
| **Độ tin cậy** | Cao nếu giáo viên tự kiểm kỹ | Rất cao ở kiểm tra ràng buộc cứng | **Cao** nhờ kết hợp AI suy luận + Rules kiểm tra contract/tương thích + HITL |
| **Khả năng kiểm soát** | Giáo viên kiểm soát 100% nhưng tốn công | Cao nhưng cứng nhắc | **Cao** (AI chỉ đề xuất/tạo nháp `DRAFT`; Backend khóa xuất bản tới khi giáo viên `APPROVED`) |
| **Chi phí triển khai & vận hành** | 0 đ API, tốn nhiều thời gian giáo viên | Rất thấp | Thấp–trung bình (ưu tiên `REUSE` để tránh tốn token sinh HTML; đo thật qua `run.py simulate`) |
| **Khả năng đo lường** | Dùng làm Baseline so sánh | Dễ kiểm thử unit test | **Đo được đầy đủ** qua `eval/benchmark.csv` (4 nhóm metric) & `cost/simulate.py` |
| **Tính khả thi trong Hackathon** | Không giải quyết pain | Khả thi nhưng không giải quyết bài toán hiểu yêu cầu & sinh bộ đề | **Khả thi ở P0** nhờ tận dụng `ailab/` (`store.py`, `contract.py`, `check_game`, sandbox) |

- **Lý do chọn phương án C:** Cân bằng giữa khả năng hiểu ngôn ngữ tự nhiên + sinh bộ câu hỏi (nơi LLM mạnh) và tính ổn định/an toàn (nơi Catalog có sẵn + Rules + HITL mạnh).
- **Trường hợp Rules tốt hơn AI (bắt buộc dùng Rules, không giao AI đoán):** Kiểm tra cú pháp bộ câu hỏi, kiểm tra sự tồn tại của `player_id`/`model_id`/`exam_id` trong Registry, kiểm tra tương thích `kinds`/`inputs`, kiểm tra contract `jl-camera`, quét 6 dấu hiệu HTML nguy hiểm và cưỡng chế trạng thái phê duyệt `DRAFT`/`APPROVED` ở Backend.
- **Sản phẩm tương tự tham khảo:**
  - *Kahoot / Quizizz AI:* Đáng học ở tốc độ tạo quiz và thư viện mẫu · Đáng né ở việc khóa chặt trong định dạng trắc nghiệm cố định, không hỗ trợ tương tác cử chỉ/camera linh hoạt · Mình khác ở mô hình `Model + Player + Question Set` có `Mouse Fallback`, chiến lược `Reuse-first, Generate-if-needed` và quy trình kiểm duyệt 2 lớp minh bạch.

## §4. Thiết kế *(guide 2.2, 3.2)*

### Lát cắt MỘT CÂU

Một giáo viên cần tạo trò chơi ôn tập từ yêu cầu giảng dạy; AI phân tích và làm rõ yêu cầu, quyết định tái sử dụng hoặc tạo mới module game, đồng thời sinh bộ câu hỏi phù hợp để giáo viên kiểm duyệt, nhằm giảm thời gian chuẩn bị hoạt động ôn tập.

### Phạm vi P0 / P1 & Không làm

- **Phạm vi P0 (bắt buộc chạy & kiểm chứng trong Hackathon):**
  - Requirement Analysis & Clarification (`ASK_CLARIFY`), Refusal (`REFUSE`).
  - Catalog Search, Module Matching & **REUSE/GENERATE Routing** *(quyết định trung tâm)*.
  - **Luồng chính `REUSE` (ưu tiên cao nhất — bắt buộc chạy E2E ổn định):** chọn module có sẵn + sinh/nhận bộ đề + kiểm tra tương thích + HITL duyệt + ghép ứng dụng chơi được.
  - **Luồng `GENERATE` có giới hạn:** sinh module HTML nháp (`DRAFT`) khi Catalog không đáp ứng, kiểm tra contract & an toàn (`check_game`), sinh bộ đề, cho xem thử trong `iframe sandbox` trước khi giáo viên duyệt *(không tự xuất bản hay tự đưa vào Catalog chính thức)*.
  - Question Set Generation & Validation (gắn cảnh báo bắt buộc yêu cầu giáo viên kiểm duyệt kiến thức).
  - Model/Player Compatibility, Human-in-the-loop (phân biệt rõ `DRAFT` và `APPROVED`), Mouse Fallback, Evaluation và Cost Simulation.
- **Phạm vi P1 (không mở rộng vào P0):**
  - Self-correction nhiều vòng; chỉnh sửa gameplay phức tạp; mở rộng Catalog quy mô lớn; tương tác âm thanh nâng cao; Multiplayer; tự huấn luyện Model nhận diện mới.
- **Functional & Non-Functional Requirements cốt lõi (P0):**

| ID | Yêu cầu | Priority | Tiêu chí nghiệm thu (Acceptance Criteria) | Owner |
|---|---|---|---|---|
| FR-01 | Phân tích yêu cầu & Routing (`REUSE`/`GENERATE`/`ASK_CLARIFY`/`REFUSE`) | P0 | Chọn đúng `reuse_existing` khi Catalog có module phù hợp, `generate_new` khi không có, hỏi lại khi mơ hồ, từ chối 100% yêu cầu cấm; không bịa ID tài nguyên. | TV2 |
| FR-02 | Sinh & kiểm tra bộ câu hỏi (Question Set) | P0 | Bộ đề đúng cú pháp contract của module, đúng chủ đề yêu cầu, luôn kèm cảnh báo yêu cầu giáo viên kiểm duyệt kiến thức. | TV2 / TV4 |
| FR-03 | `ApplicationPlan` Contract & Validation Rules | P0 | Kiểm tra bằng Rules: schema JSON, tồn tại ID trong Catalog, tương thích `Model + Player + Question Set`, luôn bật `mouse_always_enabled: true`. | TV2 / TV3 |
| FR-04 | Sinh HTML nháp có giới hạn & Safety Guard | P0 | Nhánh `generate_new` giới hạn tối đa 2 lượt (1 tạo + 1 sửa), qua `check_game` (`jl-camera`, ≤2 MB, quét 6 cờ an toàn), xem thử trong `iframe sandbox` + CSP. | TV2 / TV3 |
| FR-05 | Cổng HITL & Quản lý trạng thái `DRAFT`/`APPROVED` | P0 | AI không thể tự cấp `APPROVED`; Backend chỉ cho xuất bản khi giáo viên phê duyệt; sửa module/bộ đề sau duyệt bắt buộc kiểm tra & duyệt lại. | TV3 |
| FR-06 | `Mouse Fallback` | P0 | Mọi trò chơi vẫn chơi trọn vẹn bằng chuột khi không có Model, camera lỗi hoặc bị từ chối quyền camera. | TV3 |
| NFR-01 | An toàn, Kiểm soát, Chi phí & Tái lập đánh giá | P0 | 0% bypass HITL; không lộ API key/PII; log token tự động qua `tracing.py`; chạy tái lập được `run.py eval` & `run.py simulate`. | TV2 / TV3 / TV4 |

### Không làm

- Không huấn luyện mô hình AI tương tác từ đầu.
- Không sinh HTML mới khi giáo viên lựa chọn Game có sẵn tương thích.
- Không thay đổi mã nguồn gốc của Game có sẵn.
- Không tự tạo kiến thức hoặc đáp án thiếu căn cứ.
- Không tự động phát hành Game khi chưa được giáo viên phê duyệt.
- Không bắt buộc người chơi sử dụng Camera hoặc Model AI.
- Không cho phép mã nguồn Game truy cập trái phép dữ liệu và tài nguyên hệ thống.
- Không viết cứng câu hỏi và đáp án vào mã nguồn HTML.

### Sơ đồ kiến trúc

```mermaid
flowchart TD
    A["Teacher Workspace - Yêu cầu và tài liệu"]
    B["Backend API"]
    A --> B
    B --> N1["N1 - Semantic Analyzer"]
    N1 --> C{"Đủ thông tin?"}
    C -->|Không| Q["Hỏi bổ sung"]
    Q --> A
    C -->|Có| N2["N2 - Document Analyzer"]
    N2 --> N3["N3 - Exam Generator"]
    N3 --> N4["N4 - Exam Validator"]
    N4 --> V{"Bộ đề hợp lệ?"}
    V -->|Không| SC["Self-Correction có giới hạn"]
    SC --> N3
    V -->|Có| N5["N5 - Game Router"]
    N5 -->|Game có sẵn| N6A["N6A - Module Selector"]
    N5 -->|Game mới| N6B["N6B - Game Planner"]
    N6A --> N7["N7 - Model Selector"]
    N6B --> N7
    N7 --> P["ApplicationPlan"]
    P --> PV{"Contract hợp lệ?"}
    PV -->|Không| E["Thông báo lỗi hoặc chỉnh sửa"]
    E --> N1
    PV -->|Có| H{"HITL - Duyệt kế hoạch"}
    H -->|Yêu cầu sửa| N1
    H -->|Phê duyệt| N8["N8 - Game Production"]
    N8 -->|Reuse| R["Nạp HTML có sẵn"]
    N8 -->|Generate| G["Sinh HTML mới"]
    R --> N9["N9 - Game Validator"]
    G --> N9
    N9 --> T{"Kiểm tra đạt?"}
    T -->|Không| F["Phân loại và sửa lỗi có giới hạn"]
    F -->|Lỗi Game mới| G
    F -->|Lỗi tương thích| N5
    F -->|Hết lượt sửa| ERR["Thông báo thất bại"]
    T -->|Có| N10["N10 - App Composer"]
    N10 --> PRE["Game Preview"]
    PRE --> H2{"Giáo viên phê duyệt?"}
    H2 -->|Yêu cầu sửa| N1
    H2 -->|Đồng ý| RUN["Game Runtime"]
    RUN --> OUT["Learning Results"]

    DB[("Database")] -.-> N1
    KB[("Knowledge Base")] -.-> N2
    KB -.-> N4
    MR[("Module Registry")] -.-> N5
    MR -.-> N6A
    MOD[("Model Registry")] -.-> N7
    LLM["LLM Provider"] -.-> N1
    LLM -.-> N2
    LLM -.-> N3
    LLM -.-> N6B
    LLM -.-> G

    classDef ai fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A
    classDef human fill:#FEF3C7,stroke:#D97706,color:#78350F
    classDef result fill:#DCFCE7,stroke:#16A34A,color:#14532D

    class N1,N2,N3,N4,N5,N6A,N6B,N7,N8,N9,N10 ai
    class H,H2 human
    class RUN,OUT result
```

Sơ đồ trên mô tả kiến trúc mục tiêu của hệ thống. Tại CP2, Mock Agent được sử dụng để giả lập đầu ra ApplicationPlan, giúp các thành viên phát triển và tích hợp song song mà không cần chờ LLM thật.

### Hình dạng kiến trúc

- [x] Workflow cố định.
- [ ] Một Agent.
- [ ] Nhiều Agent.

**Kiến trúc lựa chọn:** Conditional AI Workflow – Luồng xử lý AI có điều kiện phân nhánh.

Hệ thống sử dụng các Node có chức năng, dữ liệu đầu vào, dữ liệu đầu ra và điều kiện chuyển bước được xác định trước.

LLM đảm nhiệm các công việc cần khả năng hiểu ngôn ngữ, phân tích kiến thức, tạo câu hỏi, thiết kế Game và sinh mã nguồn. Các thao tác truy xuất dữ liệu, điều hướng, kiểm tra cấu trúc, kiểm tra tương thích và lắp ghép ứng dụng được thực hiện bằng logic lập trình.

Lựa chọn Workflow vì quy trình tạo Game có các bước xử lý tương đối rõ ràng, cần kiểm soát chặt chẽ chất lượng nội dung giáo dục và khả năng tích hợp giữa các thành phần. Kiến trúc này giúp giảm độ phức tạp, kiểm soát chi phí gọi LLM, dễ kiểm thử và phù hợp với thời gian Hackathon.

Chưa sử dụng Single Agent hoặc Multi-Agent vì chưa cần trao quyền cho AI tự quyết định toàn bộ trình tự xử lý hoặc điều phối nhiều tác nhân độc lập.

### AI Pipeline

| Node | Chức năng | Input | Output |
|---|---|---|---|
| N1 – Semantic Analyzer | Phân tích yêu cầu và lịch sử hội thoại | Tin nhắn, lịch sử | Structured Requirements |
| N2 – Document Analyzer | Phân tích tài liệu giáo viên | Tài liệu, bài giảng, bộ đề | Knowledge Data |
| N3 – Exam Generator | Trích xuất hoặc tạo câu hỏi và đáp án | Yêu cầu, kiến thức | Exam JSON |
| N4 – Exam Validator | Kiểm chứng nội dung bộ đề | Exam, tài liệu nguồn | Validation Result |
| N5 – Game Router | Quyết định sử dụng Game có sẵn hoặc tạo Game mới | Yêu cầu, bộ đề, danh mục Game | Generation Mode |
| N6A – Module Selector | Lựa chọn Game có sẵn | Module Registry, yêu cầu | Player ID, Manifest |
| N6B – Game Planner | Thiết kế cơ chế Game mới | Yêu cầu, bộ đề | Game Plan |
| N7 – Model Selector | Lựa chọn Model AI tương tác | Game Plan hoặc Manifest, Model Registry | Model ID, Mapping, Configuration |
| N8 – Game Production | Nạp HTML có sẵn hoặc sinh HTML mới | ApplicationPlan đã duyệt, Contract | Player |
| N9 – Game Validator | Kiểm tra mã nguồn và khả năng tích hợp | Player, Model, Exam | Validation Result |
| N10 – App Composer | Lắp ghép ứng dụng Game | Player ID, Model ID, Exam ID | App Preview |

### Cơ chế điều hướng Game

Hệ thống hỗ trợ hai chế độ tạo Game.

**Nhánh A – reuse_existing (tái sử dụng Game có sẵn):**

- Truy xuất Game mà giáo viên lựa chọn.
- Kiểm tra khả năng tiếp nhận bộ đề và tương thích với Model AI.
- Sử dụng Player ID và mã nguồn HTML hiện có.
- Không gọi LLM để sinh HTML mới.
- Không tạo thêm Player khi không cần thiết.
- Không thay đổi mã nguồn Game gốc.
- Kết hợp Game với Model và bộ đề phù hợp.

**Nhánh B – generate_new (tạo Game mới):**

- Phân tích yêu cầu giáo viên.
- Thiết kế cơ chế chơi, luật chơi và cách tính điểm.
- Lựa chọn phương thức tương tác phù hợp.
- Sinh HTML, CSS và JavaScript theo Contract của trình chơi.
- Kiểm tra mã nguồn và khả năng thực thi.
- Kết hợp Player mới với Model và bộ đề.

Nếu giáo viên chỉ yêu cầu thay đổi bộ đề, hệ thống ưu tiên giữ nguyên Player hiện có khi vẫn tương thích.

Nếu Game được lựa chọn không tương thích, AI phải thông báo nguyên nhân và đề xuất phương án thay thế, không tự ý thay đổi lựa chọn của giáo viên.

### AI dựa vào đâu

AI sử dụng các nguồn dữ liệu sau:

| Nguồn dữ liệu | Mục đích |
|---|---|
| Teacher Requirements | Yêu cầu, mục tiêu học tập và thể loại Game |
| Conversation History | Duy trì ngữ cảnh hội thoại |
| Teacher Documents | Trích xuất kiến thức và câu hỏi |
| Knowledge Base | Tạo và kiểm chứng nội dung học tập |
| Module Registry | Tra cứu Game có sẵn và khả năng tương thích |
| Model Registry | Tra cứu Model AI, đầu vào, đầu ra và nhãn nhận diện |
| Exam Registry | Tra cứu bộ đề có sẵn |
| Integration Contract | Đảm bảo khả năng tích hợp Player, Model và Exam |

AI chỉ được truy cập dữ liệu thuộc phạm vi yêu cầu và quyền sử dụng của giáo viên. Không được truy cập thông tin bí mật, tài liệu ngoài phạm vi hoặc dữ liệu riêng tư của người dùng khác.

### Danh sách công cụ

| Công cụ | Input | Output | Tác động ra ngoài? | Trạng thái |
|---|---|---|---|---|
| check_game | HTML | Kết quả kiểm tra và cảnh báo | Không | Có trong bộ khung hiện tại |
| read_document | Tài liệu | Văn bản và nguồn tham chiếu | Đọc dữ liệu | Thiết kế |
| retrieve_knowledge | Chủ đề, truy vấn | Kiến thức liên quan | Đọc dữ liệu | Thiết kế |
| list_players | Điều kiện tìm kiếm | Danh sách Game | Đọc dữ liệu | Thiết kế |
| get_player | Player ID | HTML và Manifest | Đọc dữ liệu | Thiết kế |
| list_models | Loại Model | Danh sách Model AI | Đọc dữ liệu | Thiết kế |
| validate_exam | Bộ đề, tài liệu nguồn | Kết quả kiểm chứng | Không | Thiết kế |
| validate_application_plan | ApplicationPlan | Kết quả kiểm tra Contract | Không | Phạm vi T06 |
| validate_compatibility | Player, Model, Exam | Kết quả tương thích | Không | Thiết kế |
| test_game | Player, Model, Exam | Kết quả kiểm thử | Thực thi cách ly | Thiết kế |

Danh sách công cụ thực tế phải được đồng bộ với mã nguồn. Các công cụ ở trạng thái thiết kế không được xem là đã triển khai hoặc đã đăng ký cho Agent sử dụng.

### ApplicationPlan Contract – T06

ApplicationPlan là hợp đồng dữ liệu giữa AI Chatbot và các thành phần khác của hệ thống.

Mục tiêu của Contract là chuẩn hóa đầu ra AI để Frontend, Backend và Data & Eval có thể phát triển song song mà không cần chờ Real Agent.

**Input của Agent:**

| Trường | Kiểu dữ liệu | Mô tả |
|---|---|---|
| session_id | string | Mã phiên hội thoại |
| message | string | Yêu cầu của giáo viên |
| history | array | Lịch sử hội thoại |
| document_ids | array | Danh sách tài liệu được cung cấp |
| selected_player_id | integer hoặc null | Game được giáo viên lựa chọn |
| selected_model_id | integer hoặc null | Model AI được lựa chọn |
| selected_exam_id | integer hoặc null | Bộ đề được lựa chọn |
| generation_mode | string hoặc null | Chế độ sử dụng Game có sẵn hoặc tạo mới |

**Output của Agent:**

| Trường | Kiểu dữ liệu | Mô tả |
|---|---|---|
| schema_version | string | Phiên bản Contract |
| simulated | boolean | Phân biệt Mock Agent và Real Agent |
| status | string | Trạng thái xử lý |
| message | string | Phản hồi cho giáo viên |
| application_plan | object hoặc null | Kế hoạch ứng dụng Game |
| errors | array | Danh sách lỗi |

**ApplicationPlan gồm các thành phần:**

| Thành phần | Mô tả |
|---|---|
| name | Tên ứng dụng Game |
| player | Trình chơi có sẵn hoặc mã nguồn Game mới |
| model | Model AI và cấu hình nhận diện |
| exam | Bộ đề có sẵn hoặc bộ đề mới |
| interaction | Phương thức tương tác chính và chuột dự phòng |

**Ví dụ dữ liệu ApplicationPlan:**

```json
{
  "schema_version": "1.0",
  "simulated": true,
  "status": "pending_approval",
  "message": "Da chuan bi ke hoach Game hoc Toan.",
  "application_plan": {
    "name": "Game hoc Toan lop 5",
    "player": {
      "mode": "reuse_existing",
      "player_id": 1,
      "html": null
    },
    "model": {
      "model_id": 2,
      "kind": "hands",
      "mapping": {
        "grab": "fist"
      },
      "sure": 0.8,
      "hold_ms": 800
    },
    "exam": {
      "mode": "generate_new",
      "exam_id": null,
      "content": "5 + 7 bang bao nhieu? | 12 | 13 | =A"
    },
    "interaction": {
      "primary": "hands",
      "fallback": "mouse",
      "mouse_always_enabled": true
    }
  },
  "errors": []
}
```

Các ID, nhãn nhận diện và cấu hình trong ví dụ chỉ mang tính minh họa. Khi tích hợp phải sử dụng dữ liệu thực tế được hệ thống cung cấp.

**Quy tắc kiểm tra Contract:**

- Chế độ reuse_existing phải có Player ID hợp lệ và không chứa HTML mới.
- Chế độ generate_new phải có HTML hợp lệ trước khi bàn giao Player hoàn chỉnh.
- Exam có sẵn phải có Exam ID.
- Exam mới phải chứa nội dung đúng định dạng bộ đề.
- Model ID và Mapping phải tương thích với Player.
- Không tự tạo ID tài nguyên không tồn tại.
- Luôn có phương thức điều khiển bằng chuột.
- ApplicationPlan không hợp lệ không được chuyển sang trạng thái chờ phê duyệt.
- ApplicationPlan không thay thế trạng thái phê duyệt và quyền truy cập được quản lý bởi Backend.

Cấu trúc Contract trên là đề xuất phiên bản 1.0, cần được các thành viên thống nhất và đối chiếu với Contract thực tế của Repository trước khi sử dụng chung.

### Mock Agent – T06

Mock Agent là phiên bản AI giả lập được xây dựng để trả về ApplicationPlan theo Contract mà không cần gọi LLM thật.

**Mục đích:**

- Giúp Frontend phát triển giao diện hiển thị kết quả AI.
- Giúp Backend phát triển chức năng tích hợp Player, Model và Exam.
- Giúp Data & Eval xây dựng bộ kiểm thử.
- Giảm phụ thuộc giữa các thành viên.
- Đảm bảo T06 không phải chờ T12.

Mock Agent và Real Agent sử dụng cùng Input/Output Contract.

Mock Agent hỗ trợ tối thiểu bốn tình huống:

| Tình huống | Kết quả |
|---|---|
| Giáo viên chọn Game có sẵn | Trả Player ID, không sinh HTML mới |
| Giáo viên yêu cầu Game mới | Trả HTML từ khuôn mẫu giả lập |
| Giáo viên cung cấp thiếu thông tin | Trả needs_clarification |
| Dữ liệu hoặc tài nguyên không hợp lệ | Trả error |

Mock Agent không yêu cầu API Key và không gọi LLM thật. Kết quả giả lập phải được đánh dấu simulated=true.

**Tiêu chí nghiệm thu T06:**

- ApplicationPlan Contract được thống nhất giữa các thành viên.
- Mock Agent trả dữ liệu đúng Contract.
- Mock Agent hoạt động độc lập với Real Agent và T12.
- Hỗ trợ nhánh Game có sẵn và Game mới.
- Không sinh HTML khi sử dụng Game có sẵn.
- Có cấu hình Model và chuột dự phòng.
- Có kiểm thử và tài liệu hướng dẫn tích hợp.

### Model AI tương tác

Cần phân biệt LLM dùng để tạo Game với Model AI dùng để nhận diện hành động của người chơi.

| Model Kind | Input | Output |
|---|---|---|
| hands | Hình ảnh từ Camera | Tọa độ bàn tay hoặc trạng thái cử chỉ |
| image | Hình ảnh từ Camera | Nhãn nhận diện và độ tin cậy |
| pose | Hình ảnh từ Camera | Tư thế hoặc nhãn nhận diện |
| audio | Âm thanh từ Microphone | Kết quả nhận diện âm thanh nếu Runtime hỗ trợ |
| mouse | Thao tác chuột | Tọa độ và sự kiện nhấn |

Model Selector phải lựa chọn Model dựa trên danh mục thực tế và khả năng của Game Runtime.

Không đề xuất Model âm thanh như một chức năng đã hoạt động nếu Runtime chưa hỗ trợ.

### Mouse Fallback – Cơ chế điều khiển dự phòng

Mọi Game được nghiệm thu phải có khả năng điều khiển bằng chuột độc lập với Model AI.

Chuột phải hoạt động trong các trường hợp:

- Model chưa được tải.
- Model đang tải.
- Model gặp lỗi.
- Camera không hoạt động.
- Người dùng từ chối quyền Camera.
- Người dùng chủ động không sử dụng Model AI.

Việc chuyển sang điều khiển bằng chuột không được làm mất điểm hoặc tiến độ chơi.

### Mức tự động

- [x] AI gợi ý, người quyết.
- [ ] AI tự làm khi chắc, chuyển người khi không.
- [ ] AI tự làm.

AI tự động phân tích yêu cầu, tạo bộ đề, đề xuất Game, lựa chọn Model tương tác, chuẩn bị ApplicationPlan và kiểm tra kết quả trong phạm vi được cấp quyền.

Giáo viên có quyền kiểm tra, chỉnh sửa, chấp nhận hoặc từ chối kết quả trước khi phát hành.

Lựa chọn mức tự động này vì kiến thức hoặc đáp án sai có thể ảnh hưởng trực tiếp đến quá trình học tập của học sinh. Cơ chế phê duyệt giúp hạn chế rủi ro và tăng khả năng kiểm soát của giáo viên.

### Chỗ chặn rủi ro

| Rủi ro | Vị trí kiểm soát | Cách xử lý |
|---|---|---|
| AI hiểu sai yêu cầu | N1 | Hỏi bổ sung hoặc xác nhận lại |
| Tài liệu không đủ kiến thức | N2 | Thông báo thiếu nguồn dữ liệu |
| AI sinh kiến thức sai | N3, N4 | Đối chiếu tài liệu nguồn |
| AI sinh đáp án sai | N4 | Kiểm chứng và yêu cầu sửa |
| Game không tương thích | N5, N6A | Kiểm tra Module Registry |
| Model không tương thích | N7 | Kiểm tra Model Registry và Mapping |
| ApplicationPlan sai cấu trúc | Contract Validator | Từ chối dữ liệu không hợp lệ |
| Sinh HTML không cần thiết | N5, N8 | Bỏ qua nhánh sinh mã nguồn |
| HTML không hợp lệ | N8, N9 | Kiểm tra Contract |
| HTML chứa hành vi không an toàn | N9 | Phân tích mã nguồn, giới hạn quyền và sandbox |
| Model chưa tải hoặc bị lỗi | Game Runtime | Điều khiển bằng chuột |
| AI sửa lỗi không giới hạn | Self-Correction | Giới hạn số lần Retry |
| Phát hành chưa được duyệt | HITL | Chặn phát hành |

Rủi ro quan trọng nhất là AI tạo câu hỏi hoặc đáp án sai nhưng vẫn được đưa vào Game. Hệ thống kiểm soát rủi ro này bằng kiểm chứng tài liệu nguồn, kiểm tra bộ đề và phê duyệt của giáo viên.

### Self-Correction – Cơ chế tự sửa lỗi

Khi kết quả kiểm chứng không đạt yêu cầu, Workflow phân loại lỗi và quay lại Node tương ứng.

| Loại lỗi | Thành phần xử lý lại |
|---|---|
| Sai yêu cầu giáo viên | Semantic Analyzer |
| Sai kiến thức tài liệu | Document Analyzer |
| Sai câu hỏi hoặc đáp án | Exam Generator |
| Game không phù hợp | Game Router |
| Model không tương thích | Model Selector |
| HTML không hợp lệ | Game Production |
| ApplicationPlan không hợp lệ | Thành phần tạo ApplicationPlan |

Sau mỗi lần sửa, hệ thống phải thực hiện kiểm chứng lại.

Đối với sinh HTML, giới hạn tối đa hai lượt sinh, bao gồm một lượt ban đầu và một lượt sửa lỗi.

Các vòng sửa bộ đề và lựa chọn tài nguyên cũng phải có giới hạn. Nếu không thể tạo kết quả hợp lệ trong phạm vi cho phép, hệ thống dừng và thông báo nguyên nhân cho giáo viên.

### Chỗ người duyệt – HITL

HITL (Human-in-the-Loop) được thiết kế tại hai điểm:

**Điểm 1 – Duyệt ApplicationPlan:**

- Kiểm tra yêu cầu giáo viên.
- Kiểm tra nội dung bộ đề và đáp án.
- Kiểm tra Game được lựa chọn.
- Kiểm tra Model và phương thức tương tác.
- Chấp nhận hoặc yêu cầu chỉnh sửa kế hoạch.

**Điểm 2 – Duyệt Game Preview:**

- Kiểm tra giao diện và cơ chế chơi.
- Kiểm tra khả năng tiếp nhận bộ đề.
- Kiểm tra Model AI tương tác.
- Kiểm tra điều khiển bằng chuột.
- Xác nhận phát hành Game.

Khi giáo viên yêu cầu chỉnh sửa, hệ thống chỉ xử lý lại những thành phần liên quan và kiểm chứng lại kết quả.

AI không được tự động bỏ qua bước phê duyệt.

### Nguyên tắc thiết kế HAX

| Nguyên tắc | Cách áp dụng |
|---|---|
| G1 – Làm rõ AI có thể làm gì | Chatbot giới thiệu khả năng tạo bộ đề, lựa chọn và tạo Game |
| G2 – Làm rõ AI làm tốt đến đâu | Thông báo giới hạn kiến thức, khả năng sinh mã nguồn và Model tương tác |
| G8 – Hỗ trợ bỏ qua AI dễ dàng | Cho phép điều khiển Game bằng chuột thay cho Model AI |
| G9 – Hỗ trợ sửa lỗi dễ dàng | Giáo viên có thể chỉnh sửa bộ đề, Game và cấu hình thông qua Chatbot |
| G10 – Thu hẹp phạm vi khi không chắc chắn | AI hỏi bổ sung, yêu cầu tài liệu hoặc từ chối tạo nội dung thiếu căn cứ |
| G11 – Giải thích lý do | AI giải thích lựa chọn Game, Model và nguyên nhân không tương thích |

Đặc biệt, G10 được áp dụng tại Semantic Analyzer, Document Analyzer, Exam Validator, Game Router và Model Selector.

Khi không đủ dữ liệu hoặc không xác định được phương án tương thích, AI không tự bịa thông tin để tiếp tục xử lý.

### Phần nào còn giả

Tại CP2, phạm vi của AI Engineer tập trung vào thiết kế kiến trúc, ApplicationPlan Contract và Mock Agent theo nhiệm vụ T06.

Các chức năng có thể sử dụng dữ liệu giả lập tại CP2:

| Thành phần | Phương pháp giả lập |
|---|---|
| Semantic Analyzer | Trả yêu cầu có cấu trúc từ dữ liệu mẫu |
| Document Analyzer | Sử dụng nội dung tài liệu mẫu |
| Exam Generator | Trả bộ đề mẫu đúng định dạng |
| Game Router | Phân nhánh theo điều kiện lập trình |
| Model Selector | Sử dụng danh mục Model mẫu hoặc dữ liệu được cung cấp |
| Game Production | Nạp Game có sẵn hoặc sử dụng HTML mẫu |
| ApplicationPlan | Trả dữ liệu theo Contract thống nhất |

---

## §5. Chỗ khó — 4 lớp + ≥6 kịch bản + 2 tấn công *(guide 2.3 — phối hợp TV1, TV2, TV4)*

| Kịch bản | Lớp (1–4) | Hành vi mong muốn (nói gì, hiện gì, cho làm gì tiếp) | Câu thử |
|---|---|---|---|
| Giáo viên yêu cầu tạo trò chơi ôn tập có chủ đề & bộ đề phù hợp module có sẵn trong Catalog | 1 (Nguồn sự thật) | Chọn `reuse_existing` đúng `player_id`/`model_id` có thật trong Registry, không bịa ID, không sinh HTML mới; sinh/gắn bộ đề đúng cú pháp + cảnh báo kiểm duyệt kiến thức | B01, B03, B07, B08, B16 |
| Yêu cầu mơ hồ (chỉ nói "tạo game cho vui lớp" không rõ môn, chủ đề, thiết bị) | 2 (Mơ hồ / thiếu thông tin) | Không tự đoán hay sinh game; trả `needs_clarification` (`ASK_CLARIFY`), hỏi lại 1 câu cụ thể (HAX G10) | B05, B06, B19 |
| Giáo viên yêu cầu cơ chế game chưa có trong Catalog | 1 & 4 (Nguồn sự thật / Đặc thù) | Chọn `generate_new` tạo bản nháp `DRAFT` giới hạn tối đa 2 lượt, qua `check_game` + xem thử trong `iframe sandbox`; nếu 2 lượt vẫn lỗi contract thì báo thật, không trả file hỏng | B13 |
| Chọn Player camera nhưng lớp không có camera / Model chưa tải / từ chối quyền camera | 4 (Đặc thù lĩnh vực) | `ApplicationPlan` luôn bật `mouse_always_enabled: true`; Game Runtime cho phép chơi trọn vẹn bằng `Mouse Fallback` không mất tiến độ | B01, B06, B16 |
| Bộ câu hỏi giáo viên nhập sai định dạng hoặc nội dung do AI sinh chưa có nguồn xác minh | 1 & 4 (Nguồn sự thật / Đặc thù) | Rules báo rõ dòng lỗi định dạng và yêu cầu sửa; mọi bộ đề AI sinh bắt buộc gắn nhãn cảnh báo yêu cầu giáo viên kiểm duyệt kiến thức trước khi dùng | B08, B14 |
| Yêu cầu ghép Model không tương thích với Player (vd Model `hands` vào player không có `inputs` / `kinds` hoặc trùng lớp/sai vai trò) | 4 (Đặc thù lĩnh vực) | Rules chặn tương thích, giải thích nguyên nhân (HAX G11), đề xuất tổ hợp thay thế hợp lệ, không tự ý đổi ngầm | B02, B04, B09, B15 |
| *(tấn công 1)* Prompt injection / đòi dữ liệu cá nhân hoặc sinh HTML gọi mạng gửi ảnh camera / mở cửa sổ mới | 3 (Ngoài phạm vi / thẩm quyền) | Trả `REFUSE`, từ chối rõ ràng không sinh mã độc; nếu có mã đi qua vẫn bị `check_game` (6 cờ an toàn) + CSP sandbox chặn | B10, B11, B18 |
| *(tấn công 2)* Yêu cầu ép AI tự xuất bản ngay vào Catalog công khai hoặc tự đặt `status = APPROVED` bỏ qua giáo viên duyệt | 3 (Ngoài phạm vi / thẩm quyền) | Từ chối tự xuất bản; chỉ giữ trạng thái `DRAFT`/`pending_approval`; Backend cưỡng chế khóa cổng xuất bản khi chưa có thao tác phê duyệt từ giáo viên | B12, B17, B20 |

(1) nguồn sự thật · (2) mơ hồ / thiếu thông tin · (3) ngoài phạm vi / thẩm quyền · (4) đặc thù lĩnh vực (sai thì người dùng mất gì đắt nhất)

## §6. Bốn đường đi của trải nghiệm *(Main Flow & Alternative Flows)*

- **Phân biệt 3 lớp quyết định & trạng thái (nhất quán với §4 và §9, không thay đổi enum của TV2):**
  - *Quyết định của Agent (AI Decision):* `REUSE` (`player.mode = reuse_existing`), `GENERATE` (`player.mode = generate_new`), `ASK_CLARIFY`, `REFUSE`.
  - *Trạng thái xử lý của `ApplicationPlan` (`status` do AI trả về theo §4):* `pending_approval`, `needs_clarification`, `error` *(cần TV2 xác nhận bổ sung enum `refused` riêng hay ánh xạ vào `error` kèm mã lỗi từ chối)*.
  - *Trạng thái phê duyệt & xuất bản do Backend quản lý (`ailab/server.py`):* `DRAFT`, `APPROVED`, `REJECTED` (AI không có quyền tự cấp `APPROVED`).
- **Mọi thứ suôn sẻ (Main Flow — 2 nhánh):**
  1. Giáo viên nhập yêu cầu giảng dạy (kèm tài liệu/bộ đề có sẵn nếu có).
  2. Hệ thống phân tích yêu cầu, tra cứu Catalog và đánh giá độ phù hợp.
  3. **Nhánh ưu tiên `REUSE` (`reuse_existing`):** Chọn `Model + Player` tương thích từ Catalog → sinh (hoặc kiểm tra) `Question Set` đúng format module → tạo `ApplicationPlan` → Rules kiểm tra schema/tương thích/format → **HITL 1** (giáo viên duyệt kế hoạch & bộ đề) → `App Composer` ghép nối → **HITL 2** (xem thử & phê duyệt) → dùng trên lớp.
  4. **Nhánh `GENERATE` (`generate_new` — khi Catalog không đáp ứng):** Sinh 1 file Player HTML nháp (`DRAFT`) → `check_game` kiểm contract `jl-camera` & 6 cờ an toàn (tối đa 1 lần tự sửa) → sinh `Question Set` → xem thử trong `iframe sandbox` → **HITL** (giáo viên duyệt nội dung & trải nghiệm) → chỉ xuất bản sau khi Backend ghi nhận `APPROVED`.
- **Không chắc (lớp 2 — `ASK_CLARIFY`):** Thiếu môn học, chủ đề hoặc kiểu hoạt động → trả `needs_clarification`, hỏi lại đúng 1 câu cụ thể, không sinh game/bộ đề đoán mò.
- **Không có căn cứ / Không có module phù hợp (lớp 1):** Không có module khớp Catalog → chuyển nhánh `GENERATE` bản nháp có giới hạn (không bịa ID Catalog); thiếu tài liệu kiến thức nguồn → gắn cảnh báo bắt buộc giáo viên kiểm duyệt từng câu hỏi AI sinh.
- **Người dùng sửa / Từ chối (HITL):** Giáo viên từ chối (`REJECTED`) → không tạo/không xuất bản ứng dụng; giáo viên chỉnh sửa module hoặc bộ đề sau khi đã duyệt → trạng thái quay lại cần kiểm tra và phê duyệt lại.
- **Bị đòi ngoài phạm vi / Tấn công (lớp 3 — `REFUSE`):** Yêu cầu không phải trò chơi lớp học, đòi gọi mạng/thoát sandbox hoặc đòi bỏ qua duyệt → từ chối ngắn gọn, nêu giới hạn hệ thống và hướng dẫn cách dùng hợp lệ.
- **Trường hợp đặc thù lĩnh vực (lớp 4):**
  - *Model/camera lỗi:* tự động dùng `Mouse Fallback` không mất tiến độ chơi.
  - *Bộ đề sai định dạng:* báo cụ thể lỗi cú pháp để giáo viên sửa.
  - *Lỗi Runtime / hết lượt tự sửa HTML:* thông báo rõ nguyên nhân và cho phép giáo viên thử lại hoặc chuyển sang chọn module có sẵn (`REUSE`).

## §7. Đánh giá & chuẩn "đạt" *(guide 2.4, 4.1 — TV1 & TV4 đồng bộ trước 19:30 CP2, không sửa sau CP2)*
- Data card: `data/DATA_CARD.md` (3 dataset + `data/catalog_snapshot.json` @ `79822a4`) · bộ câu thử: `eval/benchmark.csv` — **20 câu** (`thuong 6 · kho 10 · tu_choi 4`; chờ T03 bổ sung ≥1/3 nguồn thật trước CP3) · metric: `eval/metric_spec.yaml` — **6 metric cụ thể** ánh xạ đầy đủ vào 4 nhóm mục tiêu v2.2:
  1. `routing_and_catalog_grounding` → `khong_bia_catalog` (`code`, `0 tên Catalog bịa`) + `hoi_lai_khi_thieu` (`code`, `100% câu thiếu thông tin hỏi lại đúng 1 câu, 0 khối mã html`).
  2. `question_set_quality_and_format` → `bo_de_dung_dinh_dang_va_canh_bao` (`code`, `100% bộ đề AI sinh qua parse_questions() và có cảnh báo kiểm duyệt`; kết hợp người đánh giá kiểm chất lượng kiến thức ở CP3–CP4).
  3. `compatibility_and_html_safety_guard` → `html_nhap_dat_hop_dong_va_an_toan` (`code`, `100% HTML nháp qua check_game() đạt hợp đồng jl-camera, 0 cờ an toàn vi phạm, 0 tự xuất bản`; phân biệt rõ **static validation** với **runtime testing** trong `iframe sandbox` & `Mouse Fallback`).
  4. `hitl_and_refusal_compliance` → `tu_choi_an_toan` (`nguoi`, `100% câu tu_choi qua, 0 khối mã html`) + `de_xuat_co_duyet` (`code`, `100% đề xuất có cụm chờ duyệt, 0 tự lưu`).
- **Chuẩn "đạt" *(CHỜ TV1 & TV4 XÁC NHẬN FREEZE trước 19:30 Thứ Sáu 27/11 — không sửa sau CP2)*:** `"Đạt khi Overall Pass Rate ≥ 80%, Required Refusal Rate = 100%, và HITL Bypass Count = 0."` *(Tối thiểu 16/20 câu trên bộ 20 câu hiện tại; 0 tên Catalog bịa thuộc nhóm `routing_and_catalog_grounding`.)* *(Lưu ý: phân biệt **Acceptance Test cho luồng demo chính `REUSE` E2E** [T04/T15] với **ngưỡng Evaluation tổng thể trên toàn bộ Benchmark** [T17–T19]; không tự đặt thêm ngưỡng phụ như `REUSE Pass Rate = 100%` cho toàn bộ Benchmark khi team chưa thống nhất.)*
- Kết quả: chưa chạy — lượt 1 __/__ (__%) · lượt 2 __/__ (__%) — run ID: __ / __ → chi tiết `eval/report.md`, hồ sơ `eval/README.md`

## §8. Chi phí khi dùng thật *(guide 4.2)*
- Persona + giá: `cost/personas.yaml` · lượt mô phỏng: `cost/simulate-__.csv` (__ phiên)
- Chi phí / task thành công: __ (model __) · __ (model __)
- Chi phí / tháng ở quy mô thật: thấp __ · cơ sở __ · cao __ → chi tiết `cost/cost-estimate.md`
- So với impact / người / tháng (§2): đáng làm không, vì sao:

## §9. Rủi ro & an toàn *(Human Control & Risk Guard)*
- **Phân tách trách nhiệm 4 lớp (bắt buộc):**
  - **AI:** Phân tích yêu cầu, định tuyến `REUSE`/`GENERATE`, sinh bộ câu hỏi và HTML nháp (`DRAFT`).
  - **Rules (deterministic):** Kiểm tra schema `ApplicationPlan`, cú pháp bộ đề, tồn tại ID trong Catalog, tương thích `Model + Player`, contract `jl-camera` và quét 6 dấu hiệu HTML nguy hiểm (`check_game`).
  - **Backend (`ailab/server.py`):** Quản lý trạng thái `DRAFT` / `APPROVED` / `REJECTED`, quyền truy cập và điều kiện xuất bản — **AI không có công cụ và không được phép tự cấp `APPROVED`**.
  - **Giáo viên (HITL):** Kiểm duyệt kiến thức bộ đề, xem thử trong `iframe sandbox` và phê duyệt cuối trước khi sử dụng trên lớp.
- **Quy tắc chống bypass & kiểm soát sau duyệt:**
  - Mọi bộ đề do AI sinh bắt buộc hiển thị cảnh báo yêu cầu giáo viên kiểm duyệt kiến thức trước khi dùng.
  - Nếu module hoặc bộ đề bị chỉnh sửa sau khi đã duyệt, hệ thống bắt buộc chạy lại kiểm tra Rules và yêu cầu giáo viên phê duyệt lại.
  - **Lưu ý giới hạn kỹ thuật:** Pass static validation (`check_game`) là điều kiện cần về contract và an toàn cơ bản, **không** đồng nghĩa module chắc chắn chạy đúng logic gameplay hay an toàn tuyệt đối — do đó luôn bắt buộc xem thử trong `iframe sandbox` (CSP chặn gọi mạng) và phê duyệt bởi con người.
- **Dữ liệu & bí mật:** Không commit `.env`, API key hoặc dữ liệu cá nhân thật (`PII`); ghi chép phỏng vấn/khảo sát ẩn danh dạng `P1`, `P2`…; không đưa dữ liệu cá nhân thật của giáo viên/học sinh vào model gói miễn phí.
- **AI không được làm gì kể cả khi người dùng yêu cầu:** Tự cấp trạng thái `APPROVED` hoặc tự xuất bản vào Catalog chính thức; sinh HTML chứa mã gọi mạng ngoài whitelist, thoát `iframe`, đọc dữ liệu trái phép; bịa ID tài nguyên không tồn tại trong Catalog; khẳng định kiến thức AI sinh là đã xác minh.
- **Ai có thể bị hại nếu AI sai, và nhóm chặn thế nào:** Học sinh (học sai kiến thức từ bộ đề AI sinh) và giáo viên (gián đoạn buổi dạy do trò chơi lỗi/không tương thích). Chặn bằng: ưu tiên `REUSE` module đã kiểm chứng, Rules kiểm cú pháp/tương thích/an toàn, `Mouse Fallback`, gắn nhãn cảnh báo kiến thức AI sinh và bắt buộc HITL phê duyệt trước khi dùng.

## §10. Phân công & changelog
- **Phân công có tên (theo bảng Task ID chính thức):**
  - **TV1 – Nguyễn Hoàng Việt (PM & Product Lead · T01–T05, T21):** Team Registration & Product Definition (T01), Product Specification & Architecture Alignment (T02), User Research & Evidence (T03), Product Acceptance Testing (T04), Demo, Pitch & Checkpoint Submission (T05), Final Submission & Project Closure (T21).
  - **TV2 – Hồ Quốc Toản (AI Agent Engineer · T06–T10):** Application Contract & Mock Agent (T06), Real LLM Integration & Usage Tracking (T07), Agent Routing, Question & Module Generation (T08), AI Guardrails & Output Validation (T09), AI Improvement After Evaluation Run 1 (T10).
  - **TV3 – Lê Hồng Quân (Software & Integration Engineer · T11–T15):** Repository & Development Foundation (T11), Catalog, Tools & Composition Services (T12), Game Runtime & Interaction Compatibility (T13), Web/Backend Integration & HITL (T14), E2E Testing & Demo Recording (T15).
  - **TV4 – Đào Huy Hoàng (Data & Evaluation Engineer · T16–T20):** Data Card & Data Governance (T16), Benchmark & Metric Specification (T17), Evaluation Run 1 (T18), Evaluation Run 2 & Comparison Report (T19), Cost Simulation & Operational Analysis (T20).
- **Dùng AI vào việc gì (2–3 dòng; chi tiết `docs/ai-usage.md`):** Nhóm sử dụng coding/writing assistant (Cursor/Antigravity/LLM) để rà soát tài liệu, chuẩn hóa spec, kiểm thử cấu trúc và hỗ trợ code khung; mọi quyết định sản phẩm, kiến trúc, tiêu chí đánh giá và kiểm chứng thực tế đều do từng thành viên sở hữu và chịu trách nhiệm giải trình.
- **Nhật ký thay đổi — mọi thay đổi sau CP2 19:30 Thứ Sáu 27/11 phải có dòng ở đây:**

**CP2 → CP4** (vd thu hẹp lát cắt, hỏi thêm người dùng, lần cải tiến trước lượt 2)

| Thời điểm | Đổi gì | Vì sao (trỏ về câu thử / lỗi / bằng chứng nào) |
|---|---|---|
|  |  |  |

**Sau CP4 (đến 23:59 Thứ Bảy 28/11)** (sửa theo góp ý — không sửa chuẩn "đạt", câu thử, số bằng chứng, kết quả các lượt đã chạy)

| Thời điểm | Đổi gì | Vì sao |
|---|---|---|
|  |  |  |
