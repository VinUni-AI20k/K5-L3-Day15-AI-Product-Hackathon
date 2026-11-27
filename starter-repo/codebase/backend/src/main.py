"""App FastAPI: API dưới /api + web React đã build (codebase/web/dist) ở /.

Chạy: python run.py  (codebase/app.py gọi uvicorn)  ·  hoặc trong codebase/backend: uvicorn src.main:app --reload
Router /api/trips: thêm ở Task 9′. Phục vụ web: Task 11.
"""
from fastapi import FastAPI

app = FastAPI(title="Travel Planner API", version="0.1.0", description="AI lập lịch trình du lịch")


@app.get("/api/health", tags=["System"])
def health() -> dict:
    return {"status": "ok"}
