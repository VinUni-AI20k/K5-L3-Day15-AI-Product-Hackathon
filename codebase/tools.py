"""Công cụ chỉ đọc dữ liệu giả lập của D1."""
import json
from pathlib import Path
from tracing import tool

DATA = Path(__file__).resolve().parent.parent / 'data' / 'd1_orders.json'

@tool
def get_order(order_id):
    """Input mã đơn; output đơn giả lập hoặc None; không tác động bên ngoài."""
    data = json.loads(DATA.read_text(encoding='utf-8'))
    return next ( (x for x in data['orders'] if x['id'] == order_id), None)

@tool
def get_policy():
    """Input không có; output chính sách giả lập; không tác động bên ngoài."""
    return json.loads(DATA.read_text(encoding='utf-8'))['policy']
