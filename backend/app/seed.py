"""Starting tracks for the pilot group (economics & management students plus IT).

Inserted once per track slug. Later edits made in the admin page are never overwritten.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Group, Task, Track, University

POINTS_BY_WEEK = {1: 10, 2: 15, 3: 20, 4: 30}

TRACKS: list[dict] = [
    {
        "slug": "data-analytics", "icon": "📊", "title": "Data Analytics: Excel, SQL, Power BI",
        "description": "Ma'lumotni tozalash, so'rov yozish va biznes uchun dashboard qurish.",
        "tasks": [
            ("Excel: tozalash va pivot jadval",
             "Ochiq datasetni oling (data.gov.uz, stat.uz yoki Kaggle). Dublikat va bo'sh qiymatlarni tozalang, "
             "2 ta pivot jadval va 1 ta grafik tuzing. Qaysi qadamlarni bajarganingizni alohida varaqda yozing.",
             "Fayl havolasi (Google Drive yoki OneDrive, ko'rish ochiq)."),
            ("SQL: 10 ta so'rov",
             "SQLite yoki PostgreSQL'da jadval yarating va SELECT, WHERE, GROUP BY, JOIN ishlatib 10 ta so'rov yozing. "
             "Har biri uchun: savol, so'rov va natija.",
             "GitHub repo yoki Google Doc havolasi."),
            ("Power BI: birinchi dashboard",
             "Kamida 3 ta vizual, 1 ta slicer (filtr) va 1 ta DAX o'lchovi bo'lgan dashboard yarating.",
             "Publish to web havolasi yoki skrinshotlar va .pbix fayl joylangan Drive papkasi."),
            ("Mini-loyiha: biznes savoliga javob",
             "Bitta biznes savolini tanlang, ma'lumotni tahlil qiling va 3 ta aniq xulosa chiqaring. "
             "Natijani 5 slaydli taqdimotga joylang.",
             "Taqdimot havolasi va ishlatilgan fayllar."),
        ],
    },
    {
        "slug": "econometrics", "icon": "📈", "title": "Ekonometrika va statistika: Stata / R",
        "description": "Statistik tahlil, gipotezalarni tekshirish va regressiya modellari.",
        "tasks": [
            ("Tavsifiy statistika",
             "Dataset uchun o'rtacha, median, standart og'ish, gistogramma va korrelyatsiya matritsasini hisoblang. "
             "Natijani 5-6 gapda oddiy tilda tushuntiring.",
             "Stata do-file yoki R skript va natijalar (GitHub yoki Drive)."),
            ("Gipotezalarni tekshirish",
             "Bitta t-test va bitta xi-kvadrat test o'tkazing. Nol gipoteza, p-qiymat va xulosani yozing.",
             "Skript va natijalar havolasi."),
            ("Chiziqli regressiya (OLS)",
             "Regressiya modeli quring, koeffitsiyentlarni talqin qiling, R² va heteroskedastiklik testini ko'rsating.",
             "Skript va 1 betlik izoh."),
            ("Mini-tadqiqot: O'zbekiston ma'lumotlari",
             "stat.uz ma'lumotlari asosida bitta iqtisodiy savolni tahlil qiling va 2-3 betlik hisobot yozing.",
             "Hisobot (PDF) va skript havolasi."),
        ],
    },
    {
        "slug": "machine-learning", "icon": "🤖", "title": "Machine Learning: Python",
        "description": "Python, pandas va scikit-learn bilan bashorat modellari.",
        "tasks": [
            ("Python va pandas: EDA",
             "Google Colab yoki Kaggle'da datasetni yuklang, ma'lumotni o'rganing (EDA) va 3 ta grafik chizing.",
             "Ochiq notebook havolasi (Colab, Kaggle yoki GitHub)."),
            ("Birinchi model",
             "Ma'lumotni train/test ga bo'ling, LinearRegression yoki LogisticRegression o'qiting va metrikani hisoblang.",
             "Notebook havolasi."),
            ("Modellarni taqqoslash",
             "Kamida 3 ta algoritmni cross-validation bilan solishtiring va natijani jadvalda ko'rsating.",
             "Notebook havolasi."),
            ("Kaggle loyiha",
             "Titanic yoki House Prices musobaqasiga submission yuboring va notebookni ochiq qiling.",
             "Kaggle notebook havolasi va olingan ball."),
        ],
    },
    {
        "slug": "finance", "icon": "💼", "title": "Moliyaviy tahlil va biznes",
        "description": "Hisobotlarni o'qish, moliyaviy model va unit-ekonomika.",
        "tasks": [
            ("Moliyaviy hisobotni o'qish",
             "Bitta kompaniyaning (masalan, openinfo.uz dagi aksiyadorlik jamiyati) balans va foyda hisobotidan "
             "5 ta koeffitsiyent hisoblang va ularni izohlang.",
             "Excel fayl havolasi."),
            ("Excel'da moliyaviy model",
             "3 yillik daromad va xarajat prognozini tuzing: optimistik, asosiy va pessimistik ssenariylar bilan.",
             "Excel fayl havolasi."),
            ("Unit-ekonomika",
             "Bitta biznes uchun CAC, LTV va marjani hisoblang. Taxminlaringiz manbasini yozing.",
             "Hisob-kitob fayli havolasi."),
            ("Lean Canvas va pitch",
             "Bitta biznes g'oya uchun 1 betlik Lean Canvas va 5 slaydli pitch tayyorlang.",
             "Taqdimot havolasi."),
        ],
    },
    {
        "slug": "backend", "icon": "⚙️", "title": "Backend: Python va API",
        "description": "Git, Python, REST API va ma'lumotlar bazasi.",
        "tasks": [
            ("Git va GitHub",
             "Repo yarating, README yozing va kamida 5 ta mazmunli commit qiling.",
             "GitHub repo havolasi."),
            ("Python CLI dastur",
             "Ma'lumotni faylga saqlaydigan konsol dastur yozing (masalan, xarajatlar hisobchisi).",
             "GitHub repo havolasi."),
            ("FastAPI bilan REST API",
             "4 ta CRUD endpointli API yozing, /docs sahifasi ishlashi kerak.",
             "GitHub repo havolasi va ishga tushirish yo'riqnomasi."),
            ("API va ma'lumotlar bazasi",
             "API'ni SQLite yoki PostgreSQL'ga ulang. README'da qanday ishga tushirishni yozing.",
             "GitHub repo havolasi."),
        ],
    },
]


# Starting list; admins add the rest in the admin page. (name, short name, city)
UNIVERSITIES: list[tuple[str, str, str]] = [
    ("Toshkent davlat iqtisodiyot universiteti", "TDIU", "Toshkent"),
    ("Muhammad al-Xorazmiy nomidagi Toshkent axborot texnologiyalari universiteti", "TATU", "Toshkent"),
    ("Mirzo Ulug'bek nomidagi O'zbekiston Milliy universiteti", "O'zMU", "Toshkent"),
    ("Islom Karimov nomidagi Toshkent davlat texnika universiteti", "TDTU", "Toshkent"),
    ("Jahon iqtisodiyoti va diplomatiya universiteti", "JIDU", "Toshkent"),
    ("Toshkent davlat yuridik universiteti", "TDYU", "Toshkent"),
    ("O'zbekiston davlat jahon tillari universiteti", "O'zDJTU", "Toshkent"),
    ("Nizomiy nomidagi Toshkent davlat pedagogika universiteti", "TDPU", "Toshkent"),
    ("Toshkent davlat sharqshunoslik universiteti", "TDShU", "Toshkent"),
    ("Toshkent kimyo-texnologiya instituti", "TKTI", "Toshkent"),
    ("Bank-moliya akademiyasi", "BMA", "Toshkent"),
    ("Toshkentdagi Westminster xalqaro universiteti", "WIUT", "Toshkent"),
    ("Toshkentdagi Inha universiteti", "IUT", "Toshkent"),
    ("Toshkentdagi Turin politexnika universiteti", "TTPU", "Toshkent"),
    ("Toshkentdagi Webster universiteti", "Webster", "Toshkent"),
    ("Toshkentdagi Amity universiteti", "Amity", "Toshkent"),
    ("Toshkentdagi Singapur menejmentni rivojlantirish instituti", "MDIS", "Toshkent"),
    ("Yangi O'zbekiston universiteti", "NewUU", "Toshkent"),
    ("Akfa universiteti", "Akfa", "Toshkent"),
    ("TEAM universiteti", "TEAM", "Toshkent"),
    ("Central Asian University", "CAU", "Toshkent"),
    ("Millat Umidi universiteti", "MU", "Toshkent"),
    ("Samarqand davlat universiteti", "SamDU", "Samarqand"),
    ("Buxoro davlat universiteti", "BuxDU", "Buxoro"),
    ("Farg'ona davlat universiteti", "FarDU", "Farg'ona"),
    ("Andijon davlat universiteti", "AnDU", "Andijon"),
    ("Namangan davlat universiteti", "NamDU", "Namangan"),
    ("Qarshi davlat universiteti", "QarDU", "Qarshi"),
    ("Urganch davlat universiteti", "UrDU", "Urganch"),
    ("Qoraqalpoq davlat universiteti", "QDU", "Nukus"),
]


# A first win in 15 minutes, placed before week 1 of every track (sort_order 0).
COMMUNITY_GROUP = "TalantGo hamjamiyati"
OLD_STARTER_DESCRIPTION = ("CareerFlow'da professional profilingizni to'ldiring: qisqa sarlavha, o'zingiz haqingizda 2-3 gap, "
                           "kamida 3 ta ko'nikma va tillar. CV'ingizni ochiq qiling. Ish beruvchi sizni birinchi shu yerda ko'radi. "
                           "15 daqiqalik ish, shu oynaning o'zida bajariladi.")
OLD_STARTER_DESCRIPTION_2 = ("CareerFlow'da professional profilingizni to'ldiring: ism va familiya, sohangiz, o'zingiz haqingizda 1-2 gap, "
                             "ko'nikmalar va tillar. Ish beruvchi sizni birinchi shu yerda ko'radi. "
                             "5 daqiqalik ish, shu oynaning o'zida bajariladi.")
STARTER = ("Start: professional profilingiz",
           "TalantGo'da professional profilingizni to'ldiring: ism va familiya, sohangiz, o'zingiz haqingizda 1-2 gap, "
           "ko'nikmalar va tillar. Ish beruvchi sizni birinchi shu yerda ko'radi. "
           "5 daqiqalik ish, shu oynaning o'zida bajariladi.",
           "Hech narsa yuklash shart emas: profil to'lsa, tizim o'zi tekshiradi va ball beradi.", 5)
OLD_STARTER_TITLE = "Start: professional profilingiz"


async def add_starters(session: AsyncSession) -> None:
    title, description, proof_hint, points = STARTER
    # earlier starters asked for a LinkedIn link: turn them into the in-app profile task
    for task in (await session.execute(select(Task).where(Task.sort_order == 0, Task.kind != "profile",
                                                          Task.title == OLD_STARTER_TITLE))).scalars():
        task.kind, task.description, task.proof_hint = "profile", description, proof_hint
    for task in (await session.execute(select(Task).where(Task.kind == "profile",
                                                          Task.description.in_([OLD_STARTER_DESCRIPTION,
                                                                                OLD_STARTER_DESCRIPTION_2])))).scalars():
        task.description = description
    have = set((await session.execute(select(Task.track_id).where(Task.sort_order == 0))).scalars())
    for track_id in (await session.execute(select(Track.id))).scalars():
        if track_id not in have:
            session.add(Task(track_id=track_id, week=1, sort_order=0, title=title, description=description,
                             proof_hint=proof_hint, points=points, kind="profile"))
    await session.commit()


async def seed(session: AsyncSession) -> None:
    known = set((await session.execute(select(University.name))).scalars())
    session.add_all(University(name=n, short_name=sh, city=c) for n, sh, c in UNIVERSITIES if n not in known)
    existing = set((await session.execute(select(Track.slug))).scalars())
    for order, spec in enumerate(TRACKS):
        if spec["slug"] in existing:
            continue
        track = Track(slug=spec["slug"], icon=spec["icon"], title=spec["title"],
                      description=spec["description"], sort_order=order)
        session.add(track)
        await session.flush()
        for week, (title, description, proof_hint) in enumerate(spec["tasks"], start=1):
            session.add(Task(track_id=track.id, week=week, sort_order=week, title=title,
                             description=description, proof_hint=proof_hint, points=POINTS_BY_WEEK[week]))
    await session.commit()
    await add_starters(session)
    await add_official_groups(session)


async def add_official_groups(session: AsyncSession) -> None:
    """One group for the whole community and one per track; members are added when they open Groups."""
    if not await session.scalar(select(Group.id).where(Group.auto_join_all)):
        session.add(Group(name=COMMUNITY_GROUP, is_private=False, is_official=True, auto_join_all=True,
                          description="Talabalar, mentorlar, universitetlar va kompaniyalar: hamma shu yerda."))
    existing = {g.track_id: g for g in (await session.execute(
        select(Group).where(Group.is_official, Group.track_id.isnot(None)))).scalars()}
    for track in (await session.execute(select(Track))).scalars():
        name = track.title.split(":")[0].strip()          # plain names: no emoji in the interface
        if track.id in existing:
            existing[track.id].name = name
        else:
            session.add(Group(name=name, is_private=False, is_official=True, track_id=track.id,
                              description=f"{track.title} yo'nalishidagilar guruhi"))
    await session.commit()
