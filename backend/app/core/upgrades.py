"""Additive schema changes for databases created by an earlier version.

create_all() makes missing tables but never alters existing ones. Each statement here is idempotent,
so it is safe on a fresh database (where the columns already exist) and on every restart.
Switch to Alembic once a change is not purely additive.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

STATEMENTS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz",
    "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true",
]


async def upgrade(conn: AsyncConnection) -> None:
    for statement in STATEMENTS:
        await conn.execute(text(statement))
