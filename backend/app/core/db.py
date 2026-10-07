from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from .config import settings

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    # tests run each case on its own event loop; a pooled asyncpg connection cannot cross loops
    **({"poolclass": NullPool} if settings.app_env == "test" else {}),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
