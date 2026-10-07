"""The few Bot API calls the app needs: check the token, wire the menu button and webhook, reply /start."""
import hashlib

import httpx

API = "https://api.telegram.org/bot{token}/{method}"


class BotError(RuntimeError):
    pass


async def call(token: str, method: str, **params) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(API.format(token=token, method=method), json=params)
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise BotError(f"Telegram bilan aloqa yo'q: {exc.__class__.__name__}") from exc
    if not data.get("ok"):
        raise BotError(data.get("description", "Telegram xatosi"))
    return data["result"]


def webhook_secret(token: str) -> str:
    """Derived from the token, so it changes when the token does and needs no storage."""
    return hashlib.sha256(f"careerflow-webhook:{token}".encode()).hexdigest()[:48]


async def connect(token: str, public_url: str) -> dict:
    me = await call(token, "getMe")
    await call(token, "setChatMenuButton",
               menu_button={"type": "web_app", "text": "CareerFlow", "web_app": {"url": public_url}})
    await call(token, "setWebhook", url=f"{public_url}/telegram/webhook",
               secret_token=webhook_secret(token), allowed_updates=["message"], drop_pending_updates=True)
    return me


async def send_welcome(token: str, chat_id: int, public_url: str) -> None:
    await call(token, "sendMessage", chat_id=chat_id,
               text=("CareerFlow'ga xush kelibsiz!\n\n"
                     "Yo'lingizni tanlang, har hafta topshiriq bajaring va tengdoshlar hamda mentor "
                     "tasdiqlagan portfolio yig'ing."),
               reply_markup={"inline_keyboard": [[{"text": "Ilovani ochish", "web_app": {"url": public_url}}]]})
