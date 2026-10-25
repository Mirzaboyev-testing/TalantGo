import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import (admin, admin_auth, assistant, auth, challenges, company_tasks, company_tests, employer, groups, jobs, learning,
                  notifications, pages, people, public, trust, university, work)
from .core.config import settings
from .core.db import Base, SessionLocal, engine
from .core.upgrades import upgrade
from .seed import seed
from .services import ai_review, reminders

logging.basicConfig(level=logging.INFO)
# httpx logs every request URL at INFO, and a Bot API URL contains the bot token
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Pilot stage: tables are created from the models. Switch to Alembic migrations before the
    # second group joins, when the schema has to change under real data.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await upgrade(conn)
    async with SessionLocal() as session:
        await seed(session)
    reminder = asyncio.create_task(reminders.loop()) if settings.app_env == "prod" else None
    await ai_review.resume()
    yield
    if reminder:
        reminder.cancel()
    await engine.dispose()


app = FastAPI(title="TalantGo API", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs" if settings.app_env == "dev" else None, openapi_url="/api/openapi.json")

for router in (auth.router, admin_auth.router, public.router, people.router, notifications.router, learning.router, groups.router,
               challenges.router, work.router, assistant.router, jobs.router, employer.router, company_tasks.router,
               university.router,
               admin.router, company_tests.employer_router, company_tests.student_router, company_tests.admin_router,
               trust.router, trust.admin_router):
    app.include_router(router, prefix="/api/v1")
app.include_router(pages.router)


# Images the bot sends (the welcome banner); Telegram fetches them from this public URL.
app.mount("/media", StaticFiles(directory=Path(__file__).resolve().parent / "assets"), name="media")


@app.get("/api/health", include_in_schema=False)
async def health() -> dict:
    return {"ok": True}


# The Telegram app (React build). Any non-API path falls back to index.html for client routing.
static = Path(settings.static_dir)
if (static / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path.startswith("api/"):            # a mistyped API call gets a JSON 404, not the app page
            raise HTTPException(404, "Bunday API manzili yo'q")
        file = (static / path).resolve()
        if path and file.is_file() and file.is_relative_to(static.resolve()):
            return FileResponse(file)
        return FileResponse(static / "index.html", headers={"Cache-Control": "no-cache"})
