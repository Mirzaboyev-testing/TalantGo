"""The few Bot API calls the app needs: check the token, wire the menu button, webhook and
descriptions, and greet /start with the welcome banner."""
import hashlib

import httpx

API = "https://api.telegram.org/bot{token}/{method}"

# Shown in an empty chat before the user presses Start ("What can this bot do?"), max 512 characters.
DESCRIPTION = (
    "🚀 Kelajagingni biz bilan qur!\n\n"
    "CareerFlow: o'qish davomida haqiqiy tajriba to'playdigan joy.\n\n"
    "🧭 Yo'nalishingni tanla va har hafta topshiriq bajar\n"
    "✅ Ishlaring tengdosh va mentor tomonidan tasdiqlanadi\n"
    "💼 Amaliyot va birinchi ishni top\n\n"
    "Boshlash uchun «Start» tugmasini bos."
)
# Shown on the bot's profile and in shared links, max 120 characters.
SHORT_DESCRIPTION = "Kelajagingni biz bilan qur: tajriba, amaliyot va birinchi ish talabalar uchun."

WELCOME_CAPTION = (
    "<b>🚀 Kelajagingni biz bilan qur!</b>\n\n"
    "CareerFlow: o'qish davomida haqiqiy tajriba to'plab, diplom bilan birga isbotlangan portfolio "
    "olib chiqadigan joy.\n\n"
    "🧭 Yo'nalishingni tanla va har hafta topshiriq bajar\n"
    "✅ Ishlaring tengdosh va mentor tomonidan tasdiqlanadi\n"
    "💼 Amaliyot va birinchi ishni top\n\n"
    "Pastdagi tugmani bos 👇"
)


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
    await call(token, "setMyDescription", description=DESCRIPTION)
    await call(token, "setMyShortDescription", short_description=SHORT_DESCRIPTION)
    return me


async def send_welcome(token: str, chat_id: int, public_url: str, role: str | None = None,
                       join: str | None = None) -> None:
    """role comes from a partner link (?start=hr / ?start=uni); join from a group invite (?start=g<code>)."""
    query = f"role={role}" if role else (f"join={join}" if join else "")
    url = f"{public_url}/?{query}" if query else public_url
    markup = {"inline_keyboard": [[{"text": "🚀 Ilovani ochish", "web_app": {"url": url}}]]}
    try:
        await call(token, "sendPhoto", chat_id=chat_id, photo=f"{public_url}/media/welcome.png",
                   caption=WELCOME_CAPTION, parse_mode="HTML", reply_markup=markup)
    except BotError:
        # Telegram could not fetch the picture (e.g. a local address): the text alone still greets
        await call(token, "sendMessage", chat_id=chat_id, text=WELCOME_CAPTION, parse_mode="HTML",
                   reply_markup=markup)
