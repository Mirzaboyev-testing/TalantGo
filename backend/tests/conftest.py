"""Tests run against a separate `careerflow_test` database in the same PostgreSQL container."""
import os

os.environ["APP_ENV"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://careerflow:careerflow_dev@db:5432/careerflow_test")
os.environ["SECRETS_DIR"] = "/tmp/careerflow-test-secrets"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"

import asyncpg  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import create_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.seed import seed  # noqa: E402


async def _ensure_database() -> None:
    url = make_url(os.environ["DATABASE_URL"])
    conn = await asyncpg.connect(user=url.username, password=url.password, host=url.host,
                                 port=url.port or 5432, database="postgres")
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", url.database):
            await conn.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
async def fresh_db():
    await _ensure_database()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed(session)
    yield


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def make_user():
    async def _make(name: str, role: Role = Role.student, telegram_id: int | None = None) -> dict:
        async with SessionLocal() as session:
            user = User(telegram_id=telegram_id or abs(hash(name)) % 10**9, full_name=name, role=role)
            session.add(user)
            await session.commit()
            return {"id": user.id, "headers": {"Authorization": f"Bearer {create_token(str(user.id), 'user', 1)}"}}
    return _make
