from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.config.exceptions import AppException
from src.api.config.redis_client import get_redis_client
from src.api.config.settings import get_settings
from src.api.controller import auth

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 {settings.APP_NAME} khởi động...")

    # Tạo bảng checkpoint của LangGraph (sync, cần autocommit)
    from src.api.config.checkpointer import setup_checkpointer_tables
    setup_checkpointer_tables()

    # Graph du lịch + router agent: thêm ở Task 9 của kế hoạch.

    redis_client = get_redis_client()
    try:
        await redis_client.ping()  # type: ignore[misc]
        print("✅ Redis: connected")
    except Exception as e:
        print(f"❌ Redis: {e}")

    yield

    from src.api.config.checkpointer import close_checkpointer
    await close_checkpointer()
    print("👋 App đang tắt...")


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI lập lịch trình du lịch",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://54.87.169.221:3000",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": exc.message, "path": str(request.url)},
    )


app.include_router(auth.router, prefix="/api/v1")


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME, "version": "0.1.0"}


@app.get("/", tags=["System"])
async def root():
    return {"message": f"Welcome to {settings.APP_NAME}", "docs": "/docs", "health": "/health"}
