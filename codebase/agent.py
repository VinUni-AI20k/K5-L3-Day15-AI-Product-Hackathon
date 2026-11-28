"""Workflow mock chỉ đọc; không thực hiện giao dịch hoặc gửi yêu cầu."""
import re
import json
from ai import call_model
from tools import get_order, get_policy


def answer(text: str) -> dict:
    s = text.lower()
    if any(x in s for x in ('dị vật', 'ngộ độc', 'dị ứng')):
        return {'output': 'Chuyển nhân viên ngay: có nguy cơ an toàn; không đề xuất hoàn tiền tự động.'}
    if any(x in s for x in ('số điện thoại', 'địa chỉ', 'bỏ qua chính sách', 'bỏ qua hạn mức')):
        return {'output': 'Từ chối yêu cầu bỏ qua chính sách hoặc tiết lộ thông tin cá nhân; chuyển nhân viên khi cần.'}
    matches = re.findall(r'\bD\d{3}\b', text, re.I)
    if len(set(x.upper() for x in matches)) > 1:
        return {'output': 'Có nhiều mã đơn; vui lòng xác nhận một mã đơn.'}
    if not matches:
        return {'output': 'Vui lòng cung cấp mã đơn và tên món thiếu; chưa có căn cứ xử lý.'}
    try:
        order = get_order(matches[0].upper())
        if not order:
            return {'output': 'Không tìm thấy đơn; vui lòng kiểm tra mã hoặc liên hệ nhân viên.'}
        found = [item for item in order['items'] if item['name'].lower() in s]
        if len(found) != 1:
            return {'output': 'Vui lòng xác nhận đúng một món thiếu thuộc đơn; không tự suy đoán.'}
        item = found[0]
        policy = get_policy()
        # Model giả trả JSON quyết định; mọi giá trị đều được kiểm lại bằng code.
        reply = call_model('D1_MOCK_DECISION', json.dumps({'item': item['name'], 'price': item['price'], 'max_vnd': policy['max_vnd']}, ensure_ascii=False))
        decision = json.loads(reply['text'])
        limit = min(item['price'], policy['max_vnd'])
        amount = decision.get('amount')
        if decision.get('action') != 'propose' or decision.get('item') != item['name'] or type(amount) is not int or not 0 <= amount <= limit:
            return {'output': 'Đề xuất không hợp lệ; chuyển nhân viên, không thực hiện giao dịch.'}
        return {'output': f"Bản nháp mock: món {item['name']}, giá {item['price']} VND; đề xuất tối đa {amount} VND theo chính sách giả lập. Nhân viên quyết định; chưa hoàn tiền."}
    except Exception:
        return {'output': 'Không thể kiểm tra dữ liệu hoặc model; chuyển nhân viên, không thực hiện giao dịch.'}
