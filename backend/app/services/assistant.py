"""TalantGo AI: the in-app helper students ask about the platform, their next step and their studies.

It runs on the same Gemini key as the review. Every request carries a guide to the whole platform and
a short snapshot of the student's own state, so it can answer "what should I do next?" concretely.
Conversations are stored (api/assistant.py); the person and the admins can read them, nobody else.
"""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import Challenge, Role, Status, Submission, Task, User
from . import bots
from .career import completeness
from .progress import current_streak, rank_of, today
from .rules import get_rules

DAILY_LIMIT = 60

STATUS_LABEL = {Status.pending: "tekshirilmoqda", Status.peer_verified: "tasdiqlangan",
                Status.mentor_verified: "mentor tasdiqlagan", Status.rejected: "qaytarilgan, qayta topshirish mumkin"}

GUIDE = """TalantGo nima: talabalar uchun karyera platformasi. Talaba yo'nalish (yo'l) tanlaydi, har hafta amaliy topshiriq bajaradi,
ishini AI yordamchi, tengdoshlar va mentor tekshiradi. Tasdiqlangan ishlar avtomatik CV (portfolio)ga tushadi va har bir ishda
kim tasdiqlagani ko'rinadi. Kompaniyalar shu ishonchli portfolio bo'yicha amaliyot va ish taklif qiladi. Ilova Telegram ichida
(@{bot}) va kompyuterda sayt sifatida ({url}) ishlaydi; saytga Telegram orqali kiriladi. Bildirishnomalar botga keladi.

Bo'limlar (pastki menyu yoki kompyuterda chap menyu):
- Yo'l: haftalik topshiriqlar va chellenjlar; ball, haftalik seriya va umumiy o'rin. "yo'lni o'zgartirish" havolasi orqali yo'nalishni almashtirish mumkin.
- Vakansiyalar: amaliyot, yarim stavka, junior va loyiha ishlari; ariza yuborish va arizalar holati.
- Tekshirish (talabada) yoki Mentor (mentorda): tengdoshlar ishini baholash.
- Hamjamiyat: Guruhlar (umumiy hamjamiyat, yo'nalish guruhi avtomatik qo'shiladi, yopiq guruh ochib kod yoki havola bilan taklif qilish mumkin), Tengdoshlar (maqsad bo'yicha qidirish), Reyting (umumiy, yo'nalish, guruh, universitet).
- Profil: shaxsiy ma'lumotlar, karyera profili (universitet, fakultet, kurs, ko'nikmalar, tillar, GitHub va LinkedIn ixtiyoriy), telefon (ko'rsatish ixtiyoriy), talabalikni tasdiqlash, CV.

Topshiriq qanday topshiriladi: Yo'l -> topshiriqni oching -> "Fayl tanlash" (Excel, Word, PDF, PowerPoint, rasm, CSV, kod; 5 tagacha,
har biri 10 MB gacha) yoki havola (GitHub, Google Drive, Power BI) -> izoh (ixtiyoriy) -> "Yuborish". Fayl yoki havoladan bittasi yetadi.
Topshiriq ichida "Qanday baholanadi" mezonlari bo'lsa, shunga qarab ishlang.
Tekshiruv: {ai_line} {peers} ta tasdiq (tengdosh yoki AI) yig'ilsa ish tasdiqlanadi, topshiriq balli beriladi va ish CV'ga tushadi.
Mentor tasdiqlasa yana {bonus}% bonus qo'shiladi va ish eng yuqori ishonch darajasini oladi. Mentor rad etsa berilgan ball qaytarib olinadi.
Qaytarilgan ishni izohlarga qarab tuzatib, qayta topshirish mumkin.
Mentorga savol: topshiriq ichidagi "Mentorga savol" bo'limida; javob shu yerda chiqadi va botga keladi, savol-javobni yo'nalishdagi hamma ko'radi.
Tengdoshni tekshirish: "Tekshirish" bo'limida faqat o'z yo'nalishingizdagi ishlar; kamida 10 belgili yozma izoh kerak; har bir baho uchun +{review_points} ball.
Start topshirig'i: ilovaning o'zida bajariladi. Kerak: ism va familiya, soha yoki sarlavha (5+ belgi), o'zingiz haqingizda (30+ belgi),
kamida 1 ko'nikma va kamida 1 til. CV'ni ochiq qilish, GitHub va LinkedIn ixtiyoriy.
Haftalik seriya: har hafta kamida bitta ish topshirsangiz yoki baholasangiz, seriya davom etadi.
Chellenjlar: Yo'l -> "Chellenjlar". Mentor tashkil qilgan muddatli musobaqa; ish topshirasiz, mentor baholaydi; 1-3-o'rinlar +30, +20, +10 bonus ball oladi, natija CV'ga tushadi.
Talabalikni tasdiqlash: Profil -> universitet, fakultet va kurs to'ldiriladi -> "Talabalikni tasdiqlashga yuborish" -> admin tasdiqlagach
"Talabalik tasdiqlangan" belgisi profil va CV'da chiqadi. HEMIS talaba raqami ixtiyoriy.
CV: Profil bo'limida CV'ni ochiq qilsangiz, uning havolasini ish beruvchiga yuborish mumkin. Unda faqat tasdiqlangan ishlar va chellenj natijalari bor.
Vakansiyalar va kompaniyalar: kompaniyalarni admin STIR bo'yicha tekshiradi. "Ishga tayyorman" yoqilsa, kompaniyalar ismingizsiz (anonim)
profilingizni ko'radi va bog'lanish so'rovi yuboradi; siz qabul qilsangizgina ismingiz va kontaktingiz ochiladi.
Do'stlarni taklif qilish: Yo'l sahifasidagi taklif kartochkasidagi havolani yuboring; taklif qilganlar soni hisoblanadi.
Mentorlar: topshiriq qo'shadi, chellenj tashkil qiladi, savollarga javob beradi, ishlarni tekshiradi (Mentor bo'limi).
Kompaniya HR yoki universitet karyera markazi xodimi maxsus havola orqali ro'yxatdan o'tadi; buni admin beradi."""

RULES = """Siz TalantGo AI: TalantGo platformasining yordamchisisiz.
Vazifangiz: talabaga platformadan foydalanishni tushuntirish, keyingi qadamni aniq aytish, o'qish va karyera bo'yicha
(Excel, Power BI, SQL, Stata, Python, statistika, CV, intervyu, amaliyot) maslahat berish.
Qoidalar:
- Talaba qaysi tilda yozsa, shu tilda javob bering; odatda o'zbek tilida (lotin yozuvida), "siz" deb.
- Qisqa va aniq yozing: odatda 2-8 qator. Qadamlarni "1." "2." yoki "- " bilan yozing. Markdown belgilari (**, #) va emoji ishlatmang.
- Platforma haqida faqat quyidagi qo'llanmaga tayaning. Unda yo'q narsani to'qimang: bilmasangiz, mentordan
  ("Mentorga savol") yoki admin'dan so'rashni maslahat bering.
- Joriy topshiriqni talaba o'rniga to'liq bajarib bermang: tushuntiring, yo'l-yo'riq va kichik misol bering. Ishni AI, tengdosh va
  mentor tekshiradi, CV'ga faqat o'z ishi tushishi kerak.
- Talabaning holati haqidagi ma'lumot faqat shu talabaniki: undan "keyingi qadam" maslahati uchun foydalaning.
- Mavzudan juda uzoq savollarga (siyosat, shaxsiy masalalar) qisqa va hurmat bilan javob berib, o'qish va karyera mavzusiga qayting."""


async def system_prompt(session: AsyncSession, user: User, ai_review_on: bool) -> str:
    rules = await get_rules(session)
    guide = GUIDE.format(
        bot=await bots.username(session) or "talantgo_bot", url=settings.public_url, peers=rules.peer_approvals_required, bonus=rules.mentor_bonus_percent,
        review_points=rules.review_points,
        ai_line="ish topshirilgach AI yordamchi bir daqiqa ichida tekshirib izoh yozadi va uning bahosi bitta tengdosh ovozi hisoblanadi;"
                if ai_review_on else "ishni tengdoshlar tekshiradi;")
    return f"{RULES}\n\n--- Qo'llanma\n{guide}\n\n--- Talabaning holati (bugun {today().isoformat()})\n{await _snapshot(session, user)}"


async def _snapshot(session: AsyncSession, user: User) -> str:
    lines = [
        f"Ism: {user.full_name}; rol: {'mentor' if user.role is not Role.student else 'talaba'}",
        f"Yo'nalish: {user.track.title if user.track_id and user.track else 'tanlanmagan'}",
        f"Ball: {user.points}; umumiy o'rin: {await rank_of(session, user)}; haftalik seriya: {current_streak(user)}",
        f"Universitet: {user.university_ref.name if user.university_ref else 'kiritilmagan'}; kurs: {user.course or 'kiritilmagan'}",
        f"Talabalik tasdig'i: {dict(none='so`ralmagan', pending='admin ko`rib chiqmoqda', verified='tasdiqlangan', rejected='rad etilgan').get(user.verification, user.verification)}",
    ]
    info = completeness(user)
    lines.append(f"Profil to'liqligi: {info['percent']}%" + (f"; yetishmaydi: {', '.join(info['missing'])}" if info["missing"] else ""))
    if user.track_id:
        tasks = (await session.execute(select(Task).where(Task.track_id == user.track_id, Task.is_active)
                                       .order_by(Task.sort_order))).scalars().all()
        mine = {s.task_id: s for s in (await session.execute(select(Submission).where(
            Submission.user_id == user.id, Submission.task_id.in_([t.id for t in tasks])))).scalars()}
        lines.append("Topshiriqlar:")
        for t in tasks[:25]:
            sub = mine.get(t.id)
            state = STATUS_LABEL[sub.status] if sub else "hali topshirilmagan"
            lines.append(f"- {'Start' if t.kind == 'profile' else f'{t.week}-hafta'}: {t.title} ({t.points} ball) - {state}")
    now = datetime.now(UTC)
    challenges = (await session.execute(select(Challenge).where(
        Challenge.is_archived.is_(False), Challenge.ends_at > now, Challenge.starts_at <= now,
        (Challenge.track_id.is_(None)) | (Challenge.track_id == user.track_id)).limit(5))).scalars().all()
    if challenges:
        lines.append("Davom etayotgan chellenjlar: " + "; ".join(c.title for c in challenges))
    return "\n".join(lines).replace("`", "'")
