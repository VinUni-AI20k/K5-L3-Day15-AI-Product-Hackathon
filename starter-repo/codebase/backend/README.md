# Backend — Travel Planner

Một tiến trình FastAPI phục vụ API (`/api`) và web React đã build. Không cần database server hay Redis:
trạng thái từng chuyến đi lưu trong SQLite (`var/trips.sqlite`, đổi bằng env `TRIPS_DB`).

Kiến trúc, luồng dữ liệu và trạng thái từng phần: [../../ARCHITECTURE.md](../../ARCHITECTURE.md).

```bash
# từ starter-repo/
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python run.py          # mở http://localhost:8000
```
