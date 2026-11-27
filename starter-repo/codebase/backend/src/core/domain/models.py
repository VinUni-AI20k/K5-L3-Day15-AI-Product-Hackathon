import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name       = Column(String(255))
    created_at      = Column(DateTime, default=datetime.utcnow)


class AgentSession(Base):
    """Một phiên lập lịch trình du lịch (một thread của graph)."""
    __tablename__ = "agent_sessions"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id     = Column(String(100), nullable=False, unique=True, index=True)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    request_text   = Column(Text, nullable=False)        # tin nhắn gốc của người dùng
    status         = Column(String(30), default="ready")  # ready | running | hotel_pending | ok | ask_back | refused | infeasible | error
    itinerary_text = Column(Text, nullable=True)          # lịch trình / câu trả lời cuối

    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at   = Column(DateTime, nullable=True)

    user = relationship("User")
