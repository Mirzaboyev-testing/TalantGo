"""What the bot answers in the chat itself, so nobody depends on the Mini App: companies and universities work on a
computer and may never open it. Every answer is plain text with a button that opens the website in the browser.

/bildirishnomalar  the latest notifications (marked as read)
/akkaunt           the sign-in e-mail, the panel and its status
/parol             a one-time code and link to set a new password, or to add an e-mail and password
/yordam            what the bot can do (also the answer to any other message)
"""
import logging
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ratelimit
from ..core.brand import BRAND
from ..core.config import settings
from ..models import Notification, User
from . import notif_i18n, notify, password_reset, telegram_bot
from .progress import TASHKENT

log = logging.getLogger("careerflow.bot")

# shown in the bot's menu (setMyCommands, sent when the owner presses "Botni ulash")
COMMANDS = [
    ("bildirishnomalar", "So'nggi bildirishnomalar"),
    ("akkaunt", "Kirish emailim va panelim"),
    ("parol", "Parolni tiklash yoki email va parol qo'yish"),
    ("yordam", "Bot nimalar qila oladi"),
]
ALIASES = {"notifications": "bildirishnomalar", "account": "akkaunt", "password": "parol", "help": "yordam"}
PANEL = {"employer": ("korxona", "Korxona"), "university": ("universitet", "Universitet xodimi"),
         "student": ("talaba", "Talaba")}
COMPANY_STATUS = {"approved": "tasdiqlangan", "pending": "tekshiruvda", "rejected": "rad etilgan"}
STAFF_STATUS = {"approved": "tasdiqlangan", "pending": "tekshiruvda", "needs_info": "qo'shimcha ma'lumot so'ralgan",
                "rejected": "tasdiqlanmagan"}
SHOW = 10


def command_of(text: str) -> str:
    """'/akkaunt@careerup_bot' → 'akkaunt'; plain text → ''."""
    if not text.startswith("/"):
        return ""
    name = text.split()[0][1:].split("@")[0].lower()
    return ALIASES.get(name, name)


def _site(user: User) -> str:
    return f"{settings.public_url}/kirish/{PANEL.get(user.account_type, PANEL['student'])[0]}"


def _site_button(user: User | None, text: str = "🌐 Saytga kirish") -> dict:
    url = _site(user) if user else settings.public_url
    return {"inline_keyboard": [[{"text": text, "url": url}]]}


def help_text() -> str:
    lines = [f"{BRAND} boti xabarlarni shu yerga yuboradi. Buyruqlar:", ""]
    lines += [f"/{name} — {about}" for name, about in COMMANDS]
    lines += ["", f"Kompyuterda ishlash: {settings.public_url}"]
    return "\n".join(lines)


NOT_LINKED = ("Bu Telegram'ga Careerup akkaunti bog'lanmagan.\n\n"
              "Saytda email bilan ro'yxatdan o'tgan bo'lsangiz: saytga kiring va «Kirish usullari» bo'limida "
              "«Telegram'ni ulash» ni bosing. Shundan keyin bildirishnomalar shu yerga keladi.\n"
              "Yangi bo'lsangiz: /start")


async def account_text(session: AsyncSession, user: User) -> str:
    _, panel = PANEL.get(user.account_type, PANEL["student"])
    if user.account_type == "employer" and user.company:
        panel += f": {user.company.name} ({COMPANY_STATUS.get(user.company.status, user.company.status)})"
    elif user.account_type == "university" and user.staff_university:
        panel += f": {user.staff_university.short_name} ({STAFF_STATUS.get(user.staff_status, user.staff_status)})"
    email = user.email or "qo'shilmagan"
    password = "o'rnatilgan" if user.password_hash else "yo'q"
    return "\n".join([
        f"👤 {user.full_name}",
        f"Panel: {panel}",
        f"Saytga kirish emaili: {email}",
        f"Parol: {password}",
        "",
        f"Saytga kirish: {_site(user)}",
        "Parolni unutdingizmi yoki email qo'shmoqchimisiz? /parol",
    ])


async def notifications_text(session: AsyncSession, user: User) -> str:
    rows = (await session.execute(select(Notification).where(Notification.user_id == user.id)
                                  .order_by(Notification.id.desc()).limit(SHOW))).scalars().all()
    if not rows:
        return "🔔 Hozircha bildirishnoma yo'q. Yangilari shu yerga keladi."
    unread = [n.id for n in rows if n.read_at is None]
    lines = ["🔔 So'nggi bildirishnomalar" + (f" ({len(unread)} ta yangi)" if unread else "")]
    lang = notif_i18n.lang_of(user)
    for n in rows:
        when = n.created_at.astimezone(TASHKENT).strftime("%d.%m %H:%M")
        text = notif_i18n.render(n.kind, n.params, lang, n.text)
        text = text if len(text) <= 350 else text[:347] + "…"
        lines.append(f"\n{'🆕 ' if n.read_at is None else ''}{when}\n{text}")
    if unread:                                   # read in the bot = read in the bell
        await session.execute(update(Notification).where(Notification.id.in_(unread)).values(read_at=datetime.now(UTC)))
        await session.commit()
    return "\n".join(lines)[:4000]


async def handle(session: AsyncSession, token: str, chat_id: int, sender: dict, text: str) -> None:
    """Answers one private message that is not /start or a website sign-in."""
    command = command_of(text)
    user = (await session.execute(select(User).where(User.telegram_id == int(sender["id"])))).scalar_one_or_none()

    async def reply(body: str, markup: dict | None = None) -> None:
        await telegram_bot.call(token, "sendMessage", chat_id=chat_id, text=body,
                                **({"reply_markup": markup} if markup else {}))

    if command not in ("bildirishnomalar", "akkaunt", "parol"):
        await reply(help_text(), _site_button(user, "🌐 Saytni ochish"))
        return
    if user is None:
        await reply(NOT_LINKED)
        return
    if user.is_blocked:
        await reply("Hisobingiz bloklangan. Savollar bo'lsa, Careerup adminiga yozing.")
        return
    if command == "bildirishnomalar":
        path = "/" + PANEL.get(user.account_type, PANEL["student"])[0]
        await reply(await notifications_text(session, user),
                    notify.markup_for(user.account_type, "", path, notif_i18n.lang_of(user)))
    elif command == "akkaunt":
        await reply(await account_text(session, user), _site_button(user))
    else:
        try:
            ratelimit.limit(f"bot-parol:{user.id}", 3, 15 * 60)
        except HTTPException:
            await reply("Kod yaqinda yuborildi. Yangisini 15 daqiqadan keyin so'rang.")
            return
        if not await password_reset.send_by_bot(session, user):
            await reply("Hozir kod yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.")
