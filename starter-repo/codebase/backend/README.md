### Yêu cầu

- Python 3.12+
- PostgreSQL 14+
- Redis 7+
- Model AI: cấu hình ở `.env` của khung (`starter-repo/.env`: MODEL_PROVIDER, MODEL_NAME, API_KEY), gọi qua `codebase/ai.py`

### Cấu hình `.env`

```env
APP_NAME=Travel Planner API
DEBUG=false

# Database
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/travel_planner

# Redis
REDIS_URL=redis://localhost:6379



# Auth
SECRET_KEY=your_secret_key_min_32_chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

### Cài đặt và khởi chạy

```bash
# Cài dependencies
pip install -r requirements.txt

# Chạy database migration
alembic upgrade head

# Khởi động server
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger UI tự động tại: `http://localhost:8000/docs`

### Alembic (Database Migration)

```bash
# Tạo migration mới
alembic revision --autogenerate -m "mô tả thay đổi"

# Apply migration
alembic upgrade head

# Rollback 1 bước
alembic downgrade -1
```
