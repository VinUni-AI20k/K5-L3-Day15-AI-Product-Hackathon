"""initial users and agent_sessions (travel planner)

Revision ID: 0001_initial_travel
Revises:
Create Date: 2026-11-27 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001_initial_travel'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    op.create_table('agent_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('session_id', sa.String(length=100), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('request_text', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=True),
        sa.Column('itinerary_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_agent_sessions_session_id', 'agent_sessions', ['session_id'], unique=True)
    op.create_index('ix_agent_sessions_user_id', 'agent_sessions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_agent_sessions_user_id', table_name='agent_sessions')
    op.drop_index('ix_agent_sessions_session_id', table_name='agent_sessions')
    op.drop_table('agent_sessions')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
