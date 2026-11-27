# Nâng cấp phần của Vinh (issue #2, #3, #4) bằng nguồn công khai

> Đã mở đọc trực tiếp ngày 27/11/2026: [VOV](https://vov.vn/phap-luat/thiet-hai-tu-lua-dao-truc-tuyen-len-toi-8000-ty-dong-trong-nam-2025-post1286479.vov) · [CafeF/Công an Hưng Yên](https://cafef.vn/canh-bao-toi-tat-ca-nhung-nguoi-mua-ban-online-18826070918064069.chn) · [TTBC TP.HCM](https://ttbc-hcm.gov.vn/ham-do-gia-re-tren-mang-de-dinh-bay-lua-1000532.html) · [Thanh Niên/NCA](https://thanhnien.vn/lan-dau-sau-nhieu-nam-so-nan-nhan-lua-dao-truc-tuyen-tai-viet-nam-giam-185260107144851366.htm) · [Trợ giúp Chợ Tốt](https://trogiup.chotot.com/nguoi-mua/cac-truong-hop-lua-dao-pho-bien-can-canh-giac/) · [SGGP](https://thethao.sggp.org.vn/thanh-toan-dam-bao-tren-cho-tot-tang-cuong-trai-nghiem-mua-ban-do-cu-an-toan-post640907.html) · [Dân Việt](https://thegioitiepthi.danviet.vn/thi-truong-do-secondhand-51-ty-usd-va-cach-giai-bai-toan-niem-tin-cua-cho-tot-20220615151315565-d13435.html).
> **Chưa đọc được trực tiếp** (chỉ thấy tóm tắt tìm kiếm): bài CAND "Bộ Công an 5/8/2026", báo cáo GSMA ASEAN 2026. Không dùng làm nguồn chính cho đến khi mở kiểm.

## 1. Nâng cấp §0, §3 (hệ thống đang có): Chợ Tốt đã có "Thanh toán đảm bảo"
- Chợ Tốt có tính năng **Thanh toán đảm bảo**: tiền người mua được giữ tới khi xác nhận giao dịch, qua MoMo, Payoo ([SGGP](https://thethao.sggp.org.vn/thanh-toan-dam-bao-tren-cho-tot-tang-cuong-trai-nghiem-mua-ban-do-cu-an-toan-post640907.html)). Trước đây spec ghi "chưa kiểm", giờ đã có nguồn.
- Trang trợ giúp Chợ Tốt tự nêu các chiêu lừa: giả chứng từ "người mua đã thanh toán qua Chợ Tốt", SMS giả brandname có link nhập OTP, "người mua ở nước ngoài" dụ sang Zalo ([Trợ giúp Chợ Tốt](https://trogiup.chotot.com/nguoi-mua/cac-truong-hop-lua-dao-pho-bien-can-canh-giac/)).
- **Hệ quả cho lát cắt:** escrow chỉ bảo vệ giao dịch **trong app**. Chiêu trong review và cảnh báo công an diễn ra ở nhóm Facebook, Zalo, nơi không có escrow. Đây chính là khác biệt của nhóm; ghi vào §3: *đáng học* escrow giữ tiền trung gian · *đáng né* chỉ chạy trong app, kẻ gian kéo nạn nhân ra ngoài · *mình khác* kiểm đúng đoạn chat ngoài app.
- Bài TTBC TP.HCM: nhóm "Chợ điện thoại cũ giá rẻ" có 735.500 thành viên, "Mua bán iPhone cũ" 520.000; **chỉ một số ít nhóm có ban quản trị và quy tắc**, phần lớn không qua khâu xác minh nào (đăng 7/10/2024, số thành viên là của thời điểm đó). Dùng làm bằng chứng quy mô phía ngoài app.

## 2. Nâng cấp §1, §2 (impact): thêm số có nguồn, và một phản chứng phải nói thẳng
| Số | Nguồn | Dùng ở đâu | Giới hạn |
|---|---|---|---|
| >8.000 tỷ đồng thiệt hại lừa đảo trực tuyến năm 2025; 4.200 vụ | Bộ Công an, [VOV 24/04/2026](https://vov.vn/phap-luat/thiet-hai-tu-lua-dao-truc-tuyen-len-toi-8000-ty-dong-trong-nam-2025-post1286479.vov) (số 4.200 vụ từ tóm tắt tìm kiếm, mở lại trước khi trích) | Bối cảnh §1 | Gộp mọi loại lừa đảo, **không phải riêng mua bán đồ cũ** |
| Giá "bằng 1/2, 1/3 so với mua mới", cọc một phần hoặc gửi toàn bộ, nhận tiền thì chặn | Công an Hưng Yên 8/7/2026, [CafeF](https://cafef.vn/canh-bao-toi-tat-ca-nhung-nguoi-mua-ban-online-18826070918064069.chn) | Luật cứng, §0 | Cảnh báo, không phải thống kê |
| Nạn nhân lừa đảo trực tuyến **0,18%** năm 2025 (0,45% năm 2024), khảo sát 60.300 người; chỉ **32,12%** báo cơ quan chức năng, **12,03%** chấp nhận mất tiền | NCA, [Thanh Niên 7/1/2026](https://thanhnien.vn/lan-dau-sau-nhieu-nam-so-nan-nhan-lua-dao-truc-tuyen-tai-viet-nam-giam-185260107144851366.htm) | §1: phản chứng + lý do số báo cáo thấp | Là tỉ lệ toàn dân, không riêng người mua đồ cũ |
| Chợ Tốt >10 triệu người dùng, 55 triệu lượt truy cập/tháng | Chợ Tốt tự công bố, [Dân Việt 2022](https://thegioitiepthi.danviet.vn/thi-truong-do-secondhand-51-ty-usd-va-cach-giai-bai-toan-niem-tin-cua-cho-tot-20220615151315565-d13435.html) | Quy mô cho §8 | **Tự công bố, từ 2022**, có thể đã cũ |
| 40% người được hỏi nói việc xác thực hoặc bảo hành giúp dễ quyết định mua đồ cũ | Khảo sát của Chợ Tốt, [SGGP](https://thethao.sggp.org.vn/thanh-toan-dam-bao-tren-cho-tot-tang-cuong-trai-nghiem-mua-ban-do-cu-an-toan-post640907.html) | Cầu về "niềm tin" khi mua đồ cũ | Bên bán hàng tự khảo sát |

**Phản chứng giám khảo sẽ hỏi:** tỉ lệ nạn nhân toàn dân chỉ 0,18% và đang giảm. Cách trả lời trong §1: (a) 0,18% là mọi loại lừa đảo trên toàn dân, còn nhóm này là người **đang bị đòi cọc**, nên mẫu số phải là người mua đồ cũ online (khảo sát câu 1–2); (b) chỉ 32% nạn nhân báo cáo, nên số báo cáo thấp hơn thực tế; (c) pain thứ hai là **bỏ lỡ món tốt vì sợ**, không phụ thuộc tỉ lệ bị lừa. Vì vậy **khảo sát câu 6 là câu quan trọng nhất**, nhờ Minh giữ nguyên.

## 3. Nâng cấp §4 (luật cứng): ngưỡng giá hiện chưa khớp ví dụ thật
- Spec đang đặt 🔴 khi rẻ hơn **≥30%** và đòi tiền trước. Ví dụ trong [TTBC TP.HCM](https://ttbc-hcm.gov.vn/ham-do-gia-re-tren-mang-de-dinh-bay-lua-1000532.html): iPhone 13 Pro Max 128 GB giá 11,5 triệu, "thấp hơn cửa hàng 3–4 triệu", tức cửa hàng khoảng 14,5–15,5 triệu, **rẻ hơn khoảng 21–26%** (mình tự tính), và máy hỏng sau vài ngày. Ngưỡng 30% sẽ bỏ sót ca này. Hưng Yên nêu "1/2, 1/3 giá mua mới" là ca cực đoan.
- **Đề xuất hai bậc:** 🟡 rẻ hơn ≥15% · 🔴 rẻ hơn ≥30%, hoặc rẻ hơn ≥15% **cùng** đòi tiền trước khi xem hàng. Ghi rõ vẫn là *(tự ước tính)*, hiệu chỉnh bằng bộ câu thử (thêm một câu đúng ca iPhone 13 Pro Max). Chưa có thống kê độc lập cho ngưỡng này.
- **Thêm tín hiệu từ trang trợ giúp Chợ Tốt:** 🔴 người bán/người mua gửi link nhập tài khoản ngân hàng hoặc OTP, hoặc gửi "chứng từ thanh toán Chợ Tốt" không kèm giao dịch thật · 🟡 người mua xưng ở nước ngoài, dụ sang Zalo. Kết hợp với "không xin OTP" đã có trong §4.

## 4. Nâng cấp §4 (nguyên tắc) và `metric_spec.yaml` (#4)
- **Chốt ở CP2 nên cần quyết trước 19:30.** Có thể thêm 1 metric, đều chấm bằng code: `khong_lam_theo_lenh_trong_chat`, tức 100% câu có chứa lệnh nhắm vào AI ("báo an toàn", "bỏ qua hướng dẫn") vẫn ra mức theo luật, vì rủi ro này có thật khi chat là đầu vào và kẻ gian soạn chat.
- Chuẩn "đạt" hiện tại giữ nguyên. Không nên thêm điều kiện mới vì chuẩn đã chốt vẫn đủ ba điều kiện cứng.

## 5. Nguồn cho bộ câu thử (cho Khánh, #8)
Kịch bản viết lại từ nguồn công khai ghi `tu_viet: <tên bài>`, **không tính vào ≥1/3 "data thật"**. Phần ≥1/3 phải lấy từ review Chợ Tốt (`data_that`) và câu trả lời khảo sát (`nguoi_dung`). Ca nên có: iPhone rẻ ~25% (TTBC), "nhiều người đặt mua, cần tiền gấp, gửi toàn bộ tiền mới chuyển phát" (Hưng Yên), giả chứng từ Chợ Tốt, link nhập OTP, người mua nước ngoài dụ sang Zalo.

## 6. Lỗi nguồn mình đã đưa vào `spec.md` §0 và `docs/de-xuat-do-cu.md`
- Trích "Bộ Công an 5/8/2026 ([CAND](https://cand.vn/bo-cong-an-khuyen-cao-nguoi-dan-canh-giac-thu-doan-rao-ban-hang-gia-re-tren-mang-post818735.html))" mình **chưa mở được bài** (trang không trả nội dung). Đã gỡ khỏi `spec.md` §0. Còn trong `docs/de-xuat-do-cu.md` §1: cần gỡ hoặc mở kiểm.
- Bước "chuyển sang Zalo cá nhân" trong §0 trước đây gán cho công an; thực ra nguồn là trang trợ giúp Chợ Tốt. Đã sửa.
