# Đào review Google Play · Shopee VN · D3

- **Nguồn:** review công khai của ứng dụng Shopee VN (`com.shopee.vn`), ngôn ngữ tiếng Việt, vùng Việt Nam, xếp theo mới nhất. Ngày xem và lấy mẫu 27/11/2026. [Google Play](https://play.google.com/store/apps/details?hl=vi&gl=vn&id=com.shopee.vn)
- **Mẫu chính:** 200 review mới nhất, mọi mức sao, từ 24/11 đến 26/11/2026. Đây là mẫu đã định trong [giả thuyết](hypothesis.md).
- **Mẫu bổ sung thăm dò:** 1.000 review 1★ mới nhất (05/11–26/11) và 300 review 2★ mới nhất (19/09–26/11). Mẫu này thiên về phàn nàn và có 104 review trùng với mẫu chính. Báo riêng hai mẫu.

## Cách lọc và đếm

1. Đơn vị đếm là một review. Loại trùng theo mã review trong mỗi mẫu. Giữ thứ tự mới nhất mà công cụ trả về để đối chiếu số thứ tự, bắt đầu từ 1.
2. Đọc từng review trong mẫu chính. Gắn nhãn **D3 có vướng mắc** khi cùng một review mô tả hàng nhận sai với đơn, mô tả hoặc quảng cáo, đồng thời mô tả vướng mắc khi yêu cầu trả hàng, khiếu nại hoặc nhận hoàn tiền. Nhận sai hàng mà review không kể việc xử lý thì chưa đủ. Giao trễ, chưa nhận được hàng, lỗi đặt đơn và đổi kích cỡ theo nhu cầu cũng nằm ngoài nhãn.
3. Trong mẫu bổ sung, dùng hai nhóm từ khóa sau để tìm ứng viên rồi đọc từng review khớp cả hai nhóm. Hạ chữ thường, bỏ dấu và đổi `đ` thành `d` trước khi lọc.

```text
Hàng sai hoặc căn cứ:
\b(?:sai|nham).{0,20}(?:mau|hang|san pham|size|kich thuoc)|(?:giao|gui|nhan).{0,20}(?:nham|sai)|(?:khong|ko|k) (?:dung|giong|nhu).{0,14}(?:mo ta|hang|san pham|quang cao|quan cao|hinh|mau|dat)|khac.{0,10}(?:mo ta|hinh|quang cao)|hang gia|hang fake|bang chung|chung cu|nhu quang cao|nhu quan cao|khong hoat dong|khong bo.at dong
Xử lý:
tra ?hang|hang ?tra|hoan ?tien|khieu ?nai|doi ?tra|doi ?hang|tra ?tien|lay ?hang|gui ?tra|giao ?tra|doi lai tien|cskh|giai quyet|bang chung|chung cu|khong duyet
```

4. **Công thức:** `x = số dòng được xác nhận nhãn D3`, `N = số review trong mẫu, kể cả review không liên quan`, `% = 100 × x/N`. Đối với giả thuyết 30%, mẫu số riêng là số review 1–2★ trong mẫu chính có kể việc khiếu nại do hàng không đúng mô tả, kể cả khi xử lý thuận lợi. Nếu mẫu số này bằng 0, ghi **chưa đủ dữ liệu để kiểm**.
5. **Lấy lại mẫu theo phương pháp:** dùng `google-play-scraper==1.2.7`, gọi `reviews("com.shopee.vn", lang="vi", country="vn", sort=Sort.NEWEST, count=200)` cho mẫu chính. Mẫu thăm dò dùng thêm `filter_score_with=1, count=1000` và `filter_score_with=2, count=300` trong hai lần gọi riêng. Nguồn sắp xếp theo thời gian thực nên lấy lại vào ngày khác sẽ ra mẫu mới. Repo công khai lưu số đếm và trích đoạn ngắn đã bỏ tên.

## Kết quả

| Mẫu | Review có vướng mắc D3 | Tỉ lệ quan sát |
|---|---:|---:|
| Chính, mọi mức sao | 0/200 | 0% trong mẫu |
| Bổ sung, 1★ | 4/1.000 | 0,40% theo cách sàng từ khóa |
| Bổ sung, 2★ | 1/300 | 0,33% theo cách sàng từ khóa |
| Bổ sung, gộp 1–2★ | 5/1.300 | 0,38% theo cách sàng từ khóa |

Mẫu chính gồm 92 review 1★, 12 review 2★, 7 review 3★, 12 review 4★ và 77 review 5★. Có 1 review nêu giao sai nhưng không kể quá trình xử lý. Có 2 review nêu khó khăn khi trả hoặc hoàn tiền nhưng không nói nguyên nhân là hàng sai mô tả. Mẫu số của phép kiểm giả thuyết 30% là **0**, nên chưa thể kết luận.

Mẫu bổ sung có 14 ứng viên khớp từ khóa, 5 trường hợp đạt nhãn sau khi đọc. Chia theo vướng mắc chính, có **1 ca không gửi được yêu cầu**, **3 ca vướng sau khi gửi** và **1 ca bị từ chối**. Tỉ lệ 0,38% là số trường hợp tìm thấy theo cách lọc này. Review dùng cách diễn đạt khác có thể bị bỏ sót.

## 5 ví dụ từ mẫu bổ sung

Các trích đoạn ngắn giữ nguyên chữ của review. Bối cảnh là tóm tắt nội dung người viết tự kể. Cột mã là vị trí trong mẫu theo mức sao.

| Mã | Ngày review | Trích đoạn | Bối cảnh |
|---|---|---|---|
| 1★–342 | 19/11/2026 | “shop bán gửi sai màu” | Người mua cho biết họ không gửi được yêu cầu trả hàng dù cho rằng vẫn còn hạn. |
| 1★–567 | 15/11/2026 | “13 ngày chưa xong” | Người mua tự báo đã chờ hoàn tiền sau khi nhận sai hàng. |
| 1★–653 | 13/11/2026 | “thì shopee ko duyệt” | Người mua kể hàng khác quảng cáo và yêu cầu trả hàng bị từ chối. |
| 1★–697 | 12/11/2026 | “xác minh tùm lum” | Sau khi nhận hàng khác, người mua mô tả vướng mắc ở bước xác minh để nhận tiền hoàn. |
| 2★–77 | 09/11/2026 | “chờ 7 ngày” | Người mua kể sản phẩm khác quảng cáo và chờ lấy hàng trả. |

## Giới hạn

Review là lời tự thuật. Hai mẫu không đại diện cho người mua Shopee. Số ngày chờ là thời gian xử lý theo lời người viết. Để ước tính tác động theo tháng, cần hỏi thêm tần suất và số phút người mua trực tiếp chuẩn bị bằng chứng, kiểm trạng thái hoặc gửi lại yêu cầu.
