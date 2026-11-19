# Talaba postlari (lenta): tahlil va ish prompti

Sana: 2026-11-19. Holat: **1-bosqich qurildi (2026-11-19)**, 2-bosqich keyin. G'oya foydalanuvchidan: talaba o'zi haqida post
joylasin (rasm, video, amaliyotdagi jarayon), Instagram yoki LinkedIn'dagidek repost va izohlar bo'lsin.

## 0. Qarorlar va natija (2026-11-19)

| Savol | Qaror |
|---|---|
| Boshlaymizmi | Ha, 1-bosqich |
| Kim yozadi | Talaba, korxona, universitet; asosiy e'tibor talabalarga |
| Kim ko'radi | Platformadagi hamma (talaba, tasdiqlangan korxona, universitet xodimi) |
| Video, moderatsiya | Video keyin; post darhol chiqadi, 3 ta shikoyatdan keyin yashiriladi, admin hal qiladi |

Qurilgani: `api/feed.py`, `services/feed.py`, `tests/test_feed.py` (9 test); `screens/student/Feed.tsx`, `PostCard`,
`PostComposer`, `PostComments`, `feedKit`, `feed.css`, `locales/parts/feed.ts`, `screens/admin/PostsAdmin.tsx`.
Talaba panelida «Hamjamiyat → Lenta» birinchi yorliq, profilda «Faoliyat». Admin: «Postlar» (ruxsat: complaints).
Korxona va universitet panellariga `<Feed me={me} />` ni ularning sessiyalari ulaydi.

## 1. Kerakmi? (loyiha menejeri nigohi)

**Foydasi**
- Talaba tasdiqlangan ishlardan tashqari *jarayonni* ko'rsatadi: amaliyot kundaligi, loyiha bosqichlari, tadbirdan
  rasm. Korxona uchun bu CV'dan jonliroq signal: faol, muloqotga ochiq, o'sib boryapti.
- Qaytib kirish sababi paydo bo'ladi. Hozir talaba platformaga faqat vakansiya yoki bildirishnoma uchun kiradi;
  lenta har kuni yangi narsa beradi.
- Korxona va universitet uchun bepul ijtimoiy isbot: «bizda amaliyot o'tgan talaba yozdi» degan postlar
  (keyingi bosqichda korxonani belgilash va tasdiqlash).
- Mavjud qismlar bilan yaxshi bog'lanadi: portfolio, tasdiqlangan ishlar, tadbirlar, Hamjamiyat.

**Xavflari**
- *Moderatsiya*: nomaqbul rasm, spam, haqorat, reklama. Shikoyat, yashirish va admin navbati shart; usiz ishga
  tushirib bo'lmaydi.
- *Bo'sh lenta*: foydalanuvchi kam bo'lsa, lenta o'lik ko'rinadi. Yechim: avtomatik «yutuq» postlari
  (ish qabul qilindi, sertifikat, amaliyot boshlandi) va universitet/korxona e'lonlari lentaga tushadi.
- *Saqlash va trafik*: video bitta serverda qimmat (disk, tarmoq). Birinchi bosqichda faqat rasm (siqilgan WEBP),
  video ikkinchi bosqichda qat'iy chegaralar bilan.
- *Diqqat tarqalishi*: Careerup ijtimoiy tarmoq emas, karyera platformasi. Postlar professional bo'lishi kerak
  (LinkedIn uslubi), «stories», cheksiz lenta va boshqa chalg'ituvchi narsalar kerak emas.
- *Shaxsiy ma'lumotlar*: boshqa odamlar tushgan rasmlar, korxona ichki hujjatlari. Post yozish oynasida qisqa
  qoida va «korxona maxfiy ma'lumotini joylamang» eslatmasi kerak.

**Xulosa**: kerak, lekin bosqichma-bosqich va professional formatda. Birinchi bosqich 2–3 kunlik ish.

## 2. Taklif etilgan ko'rinish

- **Hamjamiyat → Lenta** (birinchi yorliq): filtrlar «Hammasi / Universitetim / Yo'nalishim»; yuqorida post yozish
  maydoni.
- **Post turlari** (belgi sifatida): Amaliyotdan, Loyiha, Yutuq, Tadbir, Savol. Matn (2000 belgigacha),
  4 tagacha rasm; 2-bosqichda 1 ta qisqa video.
- **Reaksiyalar**: «Yoqdi» va «Tabriklayman» (LinkedIn'dagidek, sanab boriladi).
- **Izohlar**: bir darajali javoblar bilan; muallif o'z postidagi izohni o'chira oladi.
- **Repost**: 2-bosqichda, o'z izohi bilan ulashish («quote»).
- **Profil**: «Faoliyat» bo'limi, oxirgi 3 ta post va «Hammasi».
- **Avtomatik yutuq posti**: korxona ishni qabul qilganda yoki sertifikat qo'shilganda «Ulashasizmi?» taklifi
  (talaba o'zi tasdiqlaydi, majburan joylanmaydi).
- **Kim ko'radi**: tanlov (savol 2): platformadagi talabalar, tasdiqlangan korxonalar va universitet xodimlari;
  post egasi «faqat universitetim» deb cheklashi mumkin.
- **Moderatsiya**: «Shikoyat qilish» (sabab bilan); 3 ta shikoyatdan keyin post vaqtincha yashiriladi va admin
  navbatiga tushadi; admin yashiradi yoki tiklaydi; spam uchun chegaralar (kuniga 10 post, daqiqasiga 10 izoh);
  taqiqlangan so'zlar ro'yxati.

## 3. Texnik reja (1-bosqich)

**Ma'lumotlar modeli**
- `Post(id, author_id, kind, text, media_ids int[], visibility all|university, status visible|hidden|removed,
  reactions_n, comments_n, created_at, edited_at, repost_of_id NULL)`
- `PostReaction(post_id, user_id, kind like|congrats, created_at)` (post_id, user_id) unikal
- `PostComment(id, post_id, user_id, parent_id NULL, text, status, created_at)`
- `PostReport(id, post_id NULL, comment_id NULL, reporter_id, reason, status open|done, created_at)`
- Rasmlar: mavjud `submission_files` + `kept` + imzolangan `/media/{id}?s=` havolalari (portfolio.claim/release).

**API**
- `GET /feed?scope=all|university|fields&before=<id>` (kursorli sahifalash, 20 tadan)
- `POST /posts`, `PATCH /posts/{id}` (15 daqiqa ichida yoki har doim, belgilash bilan), `DELETE /posts/{id}`
- `POST/DELETE /posts/{id}/reaction`, `GET/POST /posts/{id}/comments`, `DELETE /comments/{id}`
- `POST /posts/{id}/report`, `POST /comments/{id}/report`
- Admin: `GET /admin/posts/reports`, `POST /admin/posts/{id}/hide|restore`. Har bir o'zgartiruvchi admin endpoint uchun
  `services/admin_access.py` RULES'ga qoida qo'shiladi (`test_admin_access.py` tekshiradi).
- Profil: `GET /people/{id}/posts`, `GET /me/posts`.

**Bildirishnomalar**: postimga izoh, izohimga javob, reaksiyalar (soatiga bitta jamlangan), shikoyat natijasi.
Havolalar: `/talaba/hamjamiyat?post=<id>`.

**Frontend**: `screens/student/Feed.tsx` (lenta, yozish oynasi, post kartasi), `PostComments` (sheet), rasm ko'ruvchi
(lightbox), profilda «Faoliyat» bo'limi, admin panelda «Postlar» navbati. Telefon: lenta to'liq kenglikda, kompyuter:
markazda 640 px ustun va o'ngda «Yo'nalishingdagi faol talabalar».

**Testlar**: ko'rinish qoidalari (universitet cheklovi), shikoyat → yashirish, o'chirilgan rasm havolasi ishlamasligi,
chegaralar, admin ruxsatlari.

## 4. Bosqichlar

1. **MVP**: matn + 4 rasm, reaksiyalar, izohlar, o'chirish, shikoyat, admin navbati, lenta filtrlari, profilda
   «Faoliyat», bildirishnomalar.
2. **Kengaytma**: repost (izoh bilan), qisqa video (60 soniya, 30 MB, mp4), korxonani belgilash va korxona tasdig'i,
   avtomatik yutuq posti taklifi, korxona va universitet postlari.
3. **Keyinroq**: heshteglar, qidiruv, kuzatish (follow), lenta tartibini moslash.

## 5. Ish prompti (agentga topshirish uchun)

> Careerup'ga talaba postlari lentasini qo'sh (1-bosqich, docs/12-talaba-postlar.md 3-bo'lim). Stack: FastAPI +
> async SQLAlchemy + Postgres (Docker), React 19 + Vite + TypeScript; matnlar uz/ru/en (`locales/parts/feed.ts`,
> ru/en uz kalitlariga tiplanadi). Mavjud naqshlarga amal qil: fayllar `services/portfolio.claim/release` va imzolangan
> `/media` havolalari bilan; bildirishnomalar `services/inbox.push` orqali; sxema o'zgarishi `core/upgrades.py`'da
> idempotent `ADD COLUMN IF NOT EXISTS`, yangi jadvallar `create_all` bilan; admin o'zgartiruvchi endpointlar uchun
> `services/admin_access.py` RULES qoidasi. Ko'rinish: muallif universiteti cheklovi, bloklangan yoki yashirilgan
> postlar faqat muallif va adminga. Chegaralar: kuniga 10 post, daqiqasiga 10 izoh (`core/ratelimit`). UI: Hamjamiyat →
> «Lenta» birinchi yorliq, post yozish maydoni, karta (muallif avatari `Avatar` + `nameTone`, universitet · fakultet,
> vaqt, tur belgisi, matn, 1–4 rasm setkasi, reaksiyalar, izohlar soni), izohlar sheet'da, rasm lightbox, profilda
> «Faoliyat» bo'limi, admin panelda «Postlar» navbati. Telefon (360 px) va kompyuter (1280–1440 px) uchun moslashuvchan.
> Backend testlari alohida test bazasida (`DATABASE_URL=...careerflow_test_feed`). Commit qilma, boshqa sessiyalar
> fayllariga faqat kichik nuqtali o'zgartirish kirit. Oxirida: o'zgargan fayllar, API, testlar natijasi va
> skrinshotlar.

## 6. Foydalanuvchiga savollar

1. Post kim joylay oladi: faqat talabalar yoki korxona va universitetlar ham?
2. Postlarni kim ko'radi: platformadagi hamma (talaba, korxona, universitet) yoki faqat talabalar?
3. Video birinchi bosqichda kerakmi yoki keyinroq (server yuklamasi)?
4. Moderatsiya: avval joylanib, shikoyat bo'yicha tekshirilsinmi (tavsiya) yoki har bir post admin tasdig'idan
   keyin chiqsinmi?
