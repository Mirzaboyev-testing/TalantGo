import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .api import (admin, admin_auth, assistant, auth, challenges, chat, company_tasks, company_tests, competitions, employer, groups,
                  jobs, learning, events, feed, notifications, pages, people, portfolio, public, site, trust, uni_comms, university,
                  work)
from .core.config import settings
from .core.db import Base, SessionLocal, engine
from .core.upgrades import upgrade
from .seed import seed
from .services import ai_review, reminders
from .core.brand import BRAND

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


# the API map and its docs only on a developer's machine: on the live site they listed every route to anyone
DEV = settings.app_env == "dev"
app = FastAPI(title=f"{BRAND} API", version="0.1.0", lifespan=lifespan, docs_url="/api/docs" if DEV else None,
              redoc_url=None, openapi_url="/api/openapi.json" if DEV else None)

SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}
# no X-Frame-Options: DENY: Telegram Web opens the Mini App in an iframe, so framing stays allowed for Telegram
FRAME_ANCESTORS = "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"


class SecurityHeaders:
    """Adds the headers above to every answer (2026-11-20 review: the site sent none). A header the answer
    already has wins: uploaded files come with their own `Content-Security-Policy: sandbox`."""

    def __init__(self, inner: ASGIApp) -> None:
        self.inner = inner

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.inner(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    if name not in headers:
                        headers.append(name, value)
                if "content-security-policy" not in headers:
                    headers.append("Content-Security-Policy", FRAME_ANCESTORS)
            await send(message)

        await self.inner(scope, receive, send_with_headers)


app.add_middleware(SecurityHeaders)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """A bug answers in JSON with a plain message instead of a bare "Internal Server Error", so the screens say
    what happened rather than "Kutilmagan xato". The traceback is still logged (uvicorn logs the re-raised error)."""
    logging.getLogger("careerup.errors").error("500 on %s %s: %r", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={
        "detail": "Serverda xatolik yuz berdi. Bir daqiqadan keyin qayta urinib ko'ring; takrorlansa, adminga yozing."})


for router in (auth.router, admin_auth.router, public.router, people.router, notifications.router, learning.router, groups.router,
               challenges.router, work.router, assistant.router, jobs.router, employer.router, company_tasks.router,
               university.router, university.public_router, uni_comms.router, uni_comms.student_router, uni_comms.company_router,
               admin.router, company_tests.employer_router, company_tests.student_router, company_tests.admin_router,
               trust.router, trust.admin_router, portfolio.router, chat.router, events.router,
               site.public_router, site.admin_router, feed.router, feed.admin_router, competitions.router,
               competitions.organizer_router, competitions.admin_router, competitions.public_router):
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
