#!/usr/bin/env bash
# Kiểm nhanh AI Lab sau khi server chạy. Chạy từ thư mục gốc repo:
#   BASE=http://127.0.0.1:8800 ADMIN_PASSWORD=... bash ailab/smoke.sh
# Cần: bash, curl, python3. Tạo dữ liệu thử bằng tài khoản smoke_user_<giờ> và dọn sau khi xong.
# Thoát 0 nếu qua hết. (Tài khoản smoke_user_* vẫn còn trong DB: xoá bằng cách dọn data, xem staging.md mục 7.)
set -u
BASE="${BASE:-http://127.0.0.1:8800}"
: "${ADMIN_PASSWORD:?đặt ADMIN_PASSWORD (mật khẩu của tài khoản admin)}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
U="smoke_user_$(date +%s)"; UPW="smoke-pass-1234"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; FAIL=1; }
jq_() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }
call() { # call JAR METHOD PATH [JSON] -> in body, mã HTTP vào $TMP/code
  local jar="$1" m="$2" p="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -o "$TMP/body" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" -H 'Content-Type: application/json' -d "$body" "$BASE$p" > "$TMP/code"
  else
    curl -s -o "$TMP/body" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" "$BASE$p" > "$TMP/code"
  fi
  cat "$TMP/body"
}
expect() { [ "$(cat "$TMP/code")" = "$1" ] && ok "$2" || bad "$2 (cần $1, nhận $(cat "$TMP/code"): $(head -c 200 "$TMP/body"))"; }
A="$TMP/admin.jar"; V="$TMP/user.jar"

echo "1. /health"
curl -s "$BASE/health" | grep -q '"ok": true' && ok "health ok" || bad "health"

echo "2. Đăng nhập Admin"
call "$A" POST /api/login "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null; expect 200 "Admin đăng nhập"
call "$A" GET /api/me | grep -q '"role": "admin"' && ok "vai trò admin" || bad "vai trò admin"

echo "3. Tạo và đăng nhập User"
call "$V" POST /api/register "{\"username\":\"$U\",\"password\":\"$UPW\"}" >/dev/null; expect 200 "đăng ký User (tự đăng nhập)"
call "$V" GET /api/admin/users >/dev/null; expect 403 "User không vào được trang Admin"

echo "4. Tạo mô hình"
MID=$(call "$V" POST /api/models '{"name":"Giơ tay","kind":"image","url":"https://teachablemachine.withgoogle.com/models/abc123/","outputs":[{"key":"Trai","role":"action"},{"key":"Phai","role":"action"},{"key":"Khong","role":"empty"}]}' | jq_ "d['id']"); expect 201 "tạo mô hình (id $MID)"
call "$V" POST /api/models '{"name":"x","kind":"image","url":"http://evil.example/","outputs":[{"key":"A"}]}' >/dev/null; expect 400 "từ chối link không phải Teachable Machine"

echo "5. Thêm trình chơi"
PHTML='<!doctype html><html><head><meta charset="utf-8"><script type="application/json" id="jl-camera">{"name":"Giơ tay A/B","inputs":[{"key":"A","label":"A","required":true},{"key":"B","label":"B","required":true}]}</script></head><body><div data-jl-camera></div><script>parent.postMessage({type:"ready"},"*")</script></body></html>'
PJSON=$(python3 -c "import json,sys; print(json.dumps({'html': sys.argv[1]}))" "$PHTML")
PID=$(call "$V" POST /api/players "$PJSON" | jq_ "d['id']"); expect 201 "thêm trình chơi (id $PID)"
call "$V" POST /api/players '{"html":"<html>không có khối</html>"}' >/dev/null; expect 400 "từ chối HTML thiếu khối jl-camera"
call "$V" GET "/api/players/$PID" | grep -q '"status": "draft"' && ok "trình chơi mới ở trạng thái Nháp" || bad "trạng thái Nháp"

echo "6. Tạo ứng dụng"
AID=$(call "$V" POST /api/apps "{\"name\":\"Ôn tập\",\"playerId\":$PID,\"modelId\":$MID,\"mapping\":{\"A\":\"Trai\",\"B\":\"Phai\"},\"share\":true}" | jq_ "d['id']"); expect 201 "tạo ứng dụng (id $AID)"
call "$V" POST /api/apps "{\"name\":\"Sai\",\"playerId\":$PID,\"modelId\":$MID,\"mapping\":{\"A\":\"Trai\"}}" >/dev/null; expect 400 "từ chối ứng dụng thiếu ô bắt buộc"
CODE=$(curl -s -o "$TMP/play" -w '%{http_code}' "$BASE/api/apps/$AID/play")
[ "$CODE" = 200 ] && grep -q 'Content-Security-Policy' "$TMP/play" && ok "link chơi mở không cần đăng nhập, có CSP" || bad "link chơi (mã $CODE)"

echo "7. Chatbot sinh game HTML"
CJ=$(call "$V" POST /api/chat '{"text":"Game ôn từ vựng, học sinh giơ tay chọn đáp án A hoặc B, có câu hỏi trắc nghiệm"}'); expect 200 "chatbot trả lời"
CID=$(echo "$CJ" | jq_ "d['chatId']"); IDX=$(echo "$CJ" | jq_ "d['reply']['proposal']['index']")
echo "$CJ" | jq_ "'giả' if d['reply']['simulated'] else 'thật'" | sed 's/^/    model: /'
[ "$(echo "$CJ" | jq_ "d['reply']['proposal']['status']")" = "pending" ] && ok "chatbot chỉ đề xuất (chưa lưu gì)" || bad "đề xuất phải ở trạng thái pending"
[ "$(echo "$CJ" | jq_ "'html' in d['reply']['proposal']")" = "False" ] && ok "đề xuất không mang theo mã html" || bad "đề xuất lộ mã html"
[ "$(echo "$CJ" | jq_ "type(d['reply']['proposal']['flags']).__name__")" = "list" ] && ok "đề xuất có danh sách cờ cảnh báo" || bad "thiếu danh sách cờ"
call "$V" GET "/api/chats/$CID/proposals/$IDX/try" >/dev/null; expect 200 "xem thử đề xuất trước khi quyết"
CPID=$(call "$V" POST "/api/chats/$CID/proposals/$IDX/accept" | jq_ "d['playerId']"); expect 200 "Chấp nhận đề xuất"
call "$V" GET "/api/players/$CPID" | grep -q '"status": "draft"' && ok "chấp nhận xong: game AI ở trạng thái Nháp (chờ Admin)" || bad "trạng thái Nháp của game AI"
call "$V" POST "/api/chats/$CID/proposals/$IDX/accept" >/dev/null; expect 409 "không chấp nhận hai lần"
CJ2=$(call "$V" POST /api/chat '{"text":"Game vòng quay chọn tên bạn lên bảng"}'); CID2=$(echo "$CJ2" | jq_ "d['chatId']"); IDX2=$(echo "$CJ2" | jq_ "d['reply']['proposal']['index']")
call "$V" POST "/api/chats/$CID2/proposals/$IDX2/reject" >/dev/null; expect 200 "Từ chối đề xuất"
call "$V" GET "/api/players?scope=mine" | grep -q "\"id\": $((CPID+1))" && bad "đề xuất bị từ chối vẫn thành trình chơi" || ok "từ chối: không lưu gì"
call "$V" POST "/api/chats/$CID2/proposals/$IDX2/accept" >/dev/null; expect 409 "đề xuất đã từ chối thì không chấp nhận được nữa"

echo "8. Duyệt của Admin"
call "$V" POST "/api/players/$CPID/submit" >/dev/null; expect 200 "User gửi duyệt"
call "$V" POST "/api/players/$CPID/approve" >/dev/null; expect 403 "User không tự duyệt được"
call "$A" POST "/api/players/$CPID/approve" >/dev/null; expect 200 "Admin duyệt"
call "$A" GET "/api/players?scope=community" | grep -q "\"id\": $CPID" && ok "game hiện ở Cộng đồng sau khi duyệt" || bad "Cộng đồng"

echo "9. Bộ đề, sửa tên / mô tả / ảnh"
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
EID=$(call "$V" POST /api/exams "{\"name\":\"Đề thử\",\"description\":\"mô tả\",\"content\":\"2+2=? | 3 | 4 | =B\\nThủ đô? | Huế | Hà Nội | =B\",\"image\":\"$PNG\"}" | jq_ "d['id']"); expect 201 "tạo bộ đề (id $EID)"
call "$V" POST /api/exams '{"name":"Sai","content":"không đúng mẫu"}' >/dev/null; expect 400 "từ chối bộ đề sai mẫu câu hỏi"
call "$V" GET /api/exams | grep -q '"count": 2' && ok "danh sách bộ đề có số câu" || bad "danh sách bộ đề"
call "$A" GET /api/exams >/dev/null; call "$A" GET /api/exams | grep -q "\"id\": $EID" && bad "Admin thấy bộ đề của người khác ở danh sách riêng" || ok "bộ đề của User không lẫn vào danh sách của Admin"
call "$V" POST "/api/exams/$EID/meta" '{"name":"Đề thử (sửa)","description":"mô tả mới"}' >/dev/null; expect 200 "sửa tên và mô tả bộ đề"
call "$V" POST "/api/exams/$EID/meta" '{"image":"http://x/y.png"}' >/dev/null; expect 400 "từ chối ảnh sai định dạng"
call "$V" POST "/api/exams/$EID/meta" '{"image":""}' >/dev/null; expect 200 "bỏ ảnh bộ đề"
QHTML="${PHTML/\"inputs\"/\"questions\":\"exam\",\"inputs\"}"
QJSON=$(python3 -c "import json,sys; print(json.dumps({'html': sys.argv[1]}))" "$QHTML")
XPID=$(call "$V" POST /api/players "$QJSON" | jq_ "d['id']"); expect 201 "thêm trình chơi dùng bộ đề (id $XPID)"
SPID=$(call "$A" GET /api/players | jq_ "[p['id'] for p in d['players'] if p['sample']][0]")
XAID=$(call "$V" POST /api/apps "{\"name\":\"Quiz bộ đề\",\"playerId\":$XPID,\"modelId\":$MID,\"mapping\":{\"A\":\"Trai\",\"B\":\"Phai\"},\"examId\":$EID,\"share\":true}" | jq_ "d['id']"); expect 201 "tạo ứng dụng từ bộ đề (id $XAID)"
curl -s "$BASE/api/apps/$XAID/play" | grep -q "Thủ đô" && ok "ứng dụng lấy câu hỏi từ bộ đề" || bad "ứng dụng không lấy câu hỏi từ bộ đề"
call "$V" PUT "/api/exams/$EID" '{"name":"Đề thử","content":"Câu mới? | Một | Hai | =A"}' >/dev/null; expect 200 "sửa nội dung bộ đề"
curl -s "$BASE/api/apps/$XAID/play" | grep -q "Câu mới" && ok "sửa bộ đề thì ứng dụng chơi bản mới" || bad "ứng dụng không theo bộ đề đã sửa"
call "$V" DELETE "/api/exams/$EID" >/dev/null; expect 409 "không xoá được bộ đề đang có ứng dụng dùng"
call "$V" POST "/api/apps/$XAID/meta" "{\"name\":\"Quiz đổi tên\",\"image\":\"$PNG\"}" >/dev/null; expect 200 "sửa tên và ảnh ứng dụng"
call "$V" POST "/api/models/$MID/meta" "{\"description\":\"mô tả mô hình\",\"image\":\"$PNG\"}" >/dev/null; expect 200 "sửa mô tả và ảnh mô hình"
call "$V" POST "/api/players/$PID/meta" "{\"name\":\"Trình chơi đổi tên\",\"image\":\"$PNG\"}" >/dev/null; expect 200 "sửa tên và ảnh trình chơi của mình"
call "$V" POST "/api/players/$SPID/meta" '{"name":"hack"}' >/dev/null; expect 403 "User không sửa được trình chơi mẫu"
HID=$(call "$A" GET /api/models | jq_ "[m['id'] for m in d['models'] if m['kind']=='hands'][0]")
call "$A" POST "/api/models/$HID/meta" '{"name":"hack"}' >/dev/null; expect 403 "mô hình có sẵn không sửa được (kể cả Admin)"
call "$A" POST "/api/models/$MID/meta" '{"name":"admin sửa"}' >/dev/null; expect 200 "Admin sửa được đồ của User"
BEX=$(call "$V" GET /api/exams | jq_ "[e['id'] for e in d['exams'] if e['builtin']][0]"); [ -n "$BEX" ] && ok "User thấy bộ đề có sẵn của AI Lab (id $BEX)" || bad "thiếu bộ đề có sẵn"
call "$V" GET "/api/exams/$BEX" | grep -q '"count": 15' && ok "bộ đề có sẵn có 15 câu" || bad "bộ đề có sẵn không đủ 15 câu"
call "$V" DELETE "/api/exams/$BEX" >/dev/null; expect 403 "User không xoá được bộ đề có sẵn"
call "$V" PUT "/api/exams/$BEX" '{"name":"x","content":"a | b | c | =A"}' >/dev/null; expect 403 "User không sửa được bộ đề có sẵn"
call "$V" POST "/api/exams/$BEX/meta" '{"name":"hack"}' >/dev/null; expect 404 "User không sửa thông tin bộ đề có sẵn"
BAID=$(call "$V" POST /api/apps "{\"name\":\"Từ bộ đề có sẵn\",\"playerId\":$XPID,\"modelId\":$MID,\"mapping\":{\"A\":\"Trai\",\"B\":\"Phai\"},\"examId\":$BEX}" | jq_ "d['id']"); expect 201 "ứng dụng dùng được bộ đề có sẵn"
call "$V" DELETE "/api/apps/$BAID" >/dev/null; expect 200 "xoá ứng dụng từ bộ đề có sẵn"
call "$V" DELETE "/api/apps/$XAID" >/dev/null; expect 200 "xoá ứng dụng thử"
call "$V" DELETE "/api/exams/$EID" >/dev/null; expect 200 "xoá bộ đề thử"
call "$V" DELETE "/api/players/$XPID" >/dev/null; expect 200 "xoá trình chơi dùng bộ đề"

echo "10. Dọn dữ liệu thử"
call "$V" DELETE "/api/apps/$AID" >/dev/null; expect 200 "xoá ứng dụng thử"
call "$V" DELETE "/api/models/$MID" >/dev/null; expect 200 "xoá mô hình thử"
call "$V" DELETE "/api/players/$PID" >/dev/null; expect 200 "xoá trình chơi thử"
call "$V" DELETE "/api/players/$CPID" >/dev/null; expect 200 "xoá game AI thử"
[ "$FAIL" = 0 ] && echo "TẤT CẢ QUA" || echo "CÓ BƯỚC KHÔNG QUA"
exit $FAIL
