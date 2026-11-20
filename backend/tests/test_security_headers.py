"""Security headers on every answer and no public API map (2026-11-20 review of the live site)."""
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app.main import FRAME_ANCESTORS, SecurityHeaders


async def test_every_answer_has_the_security_headers(client):
    for path in ("/api/health", "/api/v1/tracks", "/api/v1/me"):                # 200 and 401 alike
        r = await client.get(path)
        assert r.headers["strict-transport-security"] == "max-age=31536000", path
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        # Telegram Web shows the Mini App in an iframe: framing is limited to Telegram, never denied outright
        assert r.headers["content-security-policy"] == FRAME_ANCESTORS
        assert "https://web.telegram.org" in r.headers["content-security-policy"]
        assert "x-frame-options" not in r.headers


async def test_the_api_map_is_closed_outside_development(client):
    for path in ("/api/openapi.json", "/api/docs"):
        assert (await client.get(path)).status_code == 404, path
    # /redoc is an ordinary site path now: the app page (when the build is there) or 404, never the API docs
    r = await client.get("/redoc")
    assert r.status_code in (200, 404) and "redoc" not in r.text.lower()


async def test_an_answer_keeps_its_own_policy():
    """Uploaded files come back with `Content-Security-Policy: sandbox`; the middleware must not replace it."""
    async def file(_):
        return PlainTextResponse("x", headers={"Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff"})
    inner = Starlette(routes=[Route("/f", file)])
    async with AsyncClient(transport=ASGITransport(app=SecurityHeaders(inner)), base_url="http://test") as c:
        r = await c.get("/f")
    assert r.headers["content-security-policy"] == "sandbox"
    assert r.headers.get_list("x-content-type-options") == ["nosniff"]
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
