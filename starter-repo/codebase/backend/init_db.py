import asyncio

from src.core.domain.models import Base
from src.core.infrastructure.persistence.session import engine


async def init_db():
    print("⏳ Đang kết nối tới PostgreSQL và khởi tạo cấu trúc cơ sở dữ liệu...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Khởi tạo thành công các bảng:")
        for name in Base.metadata.tables:
            print(f"   - {name}")
    except Exception as e:
        print(f"❌ Lỗi khi khởi tạo database: {e}")


if __name__ == "__main__":
    asyncio.run(init_db())
