# TalantGo: Faza 0 audit hisoboti (faqat o'qish)

Sana: 2026-10-25. Asos: Master Prompt (21-bo'lim, "First Action"), `docs/04-uch-panel-prompt.md`,
foydalanuvchining MVP ustuvorliklari (1: talaba → vakansiya → ariza → korxona nomzodlar paneli → ariza holati;
2: universitet profili, bog'lanish, bandlik natijalari; 3: ishonchli ma'lumot yig'ilgach reyting va analitika).

Ilova kodi o'zgartirilmadi. Faqat `docs/` ga hujjatlar qo'shildi.

---

## 0. Bazaviy holat (baseline)

| Tekshiruv | Natija | Izoh |
|---|---|---|
| Backend testlari (pytest) | **86 / 86 o'tdi** (175 s) | Lokal Docker, `careerflow_test` bazasi. Prod bazaga tegilmadi |
| Frontend type check (`tsc --noEmit`, strict) | **Xatosiz** | Lokal |
| Frontend production build (`npm run build` = tsc + vite) | **O'tdi** | Docker image ichida qurildi (2026-10-25 23:41). Bitta JS bundle 489 KB (keyinchalik bo'lib yuklash foydali) |
| Lokal API | **Ishlayapti** | `/api/health` → `{"ok":true}`, bosh sahifa 200 |
| Lint | Yo'q | ESLint, Prettier, ruff sozlanmagan |
| Frontend testlari | Yo'q | vitest yoki jest yo'q |
| Server holati | Tekshirilmadi | Faza 0 da serverga tegilmadi |
| Git | Toza, HEAD `84f019d` (2026-10-21) | Yangi fayllar faqat `docs/04-*`, `docs/05-*`, `docs/dizayn-namunalar/` |

Muhit: lokal `careerflow-api` image 2 hafta eski edi (unda `fpdf2` yo'q, API qayta-qayta yiqilardi).
`docker compose build api` bilan qayta qurildi, endi lokal muhit to'liq ishlaydi. Python 3.12 Windowsda ham bor
(`AppData/Local/Programs/Python/Python312`), lekin backend Docker ichida ishlaydi.

## 1. Haqiqiy texnologiyalar

| Qatlam | Texnologiya |
|---|---|
| Backend | Python 3.12, FastAPI ≥0.115, SQLAlchemy 2 (async) + asyncpg, Pydantic 2, PyJWT, cryptography, httpx, Jinja2, fpdf2. Lock fayl yo'q (faqat minimal versiyalar) |
| Baza | PostgreSQL 16. **Alembic yo'q**: har ishga tushishda `create_all` + `core/upgrades.py` dagi 61 ta idempotent SQL + `seed()` |
| Frontend | React 19, Vite 7, TypeScript 5.9 (strict). **Router, i18n, UI kit, chart kutubxonasi yo'q** |
| Autentifikatsiya | O'zimizniki: JWT HS256 (kalit `secrets/instance.key` dan), foydalanuvchi tokeni 7 kun, admin tokeni 12 soat |
| AI | Google Gemini (httpx orqali) |
| Fayllar | Lokal disk `/data/uploads`, imzolangan muddatli havolalar |
| Bildirishnomalar | Faqat Telegram bot xabarlari |
| Deploy | Docker multi-stage (node:22 → python:3.12-slim), umumiy Hetzner server, bitta Caddy bloki, `deploy/server-setup.sh` |
| Testlar | pytest + pytest-asyncio, 15 fayl, 86 test |

Xulosa: **texnologiyani almashtirishga sabab yo'q.** Master promptdagi Next.js, Laravel, Supabase kerak emas.

## 2. Arxitektura va marshrutlar

- **Bitta FastAPI ilova**: 15 router `/api/v1` ostida (~173 endpoint), `pages` routeri prefikssiz (`/cv/{slug}`,
  `/telegram/webhook`). Middleware yo'q (CORS, xavfsizlik headerlari, gzip yo'q). `/api/openapi.json` doim ochiq.
- **SPA berish**: `GET /{path:path}` mavjud faylni yoki `index.html` ni qaytaradi. Shuning uchun yangi URL'lar
  (`/vakansiyalar`, `/korxona/...`) server tomonda qo'shimcha sozlamasiz ishlaydi. Kamchilik: noma'lum
  `GET /api/v1/...` JSON 404 o'rniga 200 + index.html qaytaradi.
- **Frontend marshrutlash**: router yo'q. `main.tsx` faqat `/admin` ni tekshiradi; qolgani `App.tsx` dagi
  holat mashinasi (auth → account_type → signup → 5 tab). Brauzer "Orqaga" tugmasi ishlamaydi, sahifaga to'g'ridan
  havola yo'q, qayta yuklashda doim birinchi tab. Admin sayt `#hash` bilan ishlaydi.
- **Frontend reaksiya qiladigan URL'lar**: `/admin*`, `?join=<kod>`, `?role=employer|university`.

## 3. Ishlayotgan funksiyalar

| Tomon | Ishlaydi |
|---|---|
| Kirish | Telegram Mini App (initData), sayt: bot havolasi + 6 xonali PIN, email + parol, bitta hisobga ikkala usulni ulash |
| Talaba | 5 ta yo'nalish × haftalik vazifalar, fayl topshirish, peer va mentor tekshiruvi, AI birinchi tekshiruv, ball va streak, reyting, guruhlar va chat, vakansiyalar, ariza berish va qaytarib olish, korxona testlari, CV (ochiq havola + PDF), talabalikni tasdiqlash so'rovi, TalantGo AI |
| Korxona | STIR bilan ro'yxatdan o'tish → admin tasdig'i, vakansiya yaratish (admin moderatsiyasi), arizachilar va status (viewed, shortlisted, rejected, hired), talabalar ro'yxati (ism, CV, PDF), anonim talent qidiruvi + kontakt so'rovi, testlar (yaratish, natija, baholash), statistika |
| Universitet | Xodim so'rovi → owner tasdig'i, Ko'rsatkichlar (talabalar soni, tasdiqlangan, faol, ariza statuslari, `hired` soni, top korxonalar, kurs va fakultet kesimi), talabalikni tasdiqlash, talabalar ro'yxati, CSV eksport |
| Mentor | Vazifa qo'shish, chellenjlar (1-3 o'rin, ball), savollarga javob |
| Admin | 20 sahifa (Bosh sahifa, Tasdiqlash navbati, Talabalar, Ishlar, Yo'nalishlar, Chellenjlar, Kompaniyalar, Vakansiyalar, Testlar, Arizalar, Universitetlar, Guruhlar, E'lonlar, Bot, AI, Hisobotlar, Sozlamalar, Adminlar, Audit, Profilim) |

## 4. Foydalanuvchi va ruxsat modeli

- `users` bitta keng jadval: auth + talaba profili + korxona + universitet xodimi maydonlari.
- `account_type`: student / employer / university (bir vaqtda bittasi). `role`: student / mentor.
- Korxona: `users.company_id` (bir korxonaga bir nechta foydalanuvchi bo'lishi mumkin, lekin qo'shishni faqat
  admin qiladi; STIR unikal). Korxona ichida rollar yo'q.
- Universitet xodimi: `staff_university_id`, `staff_status`, `staff_position` (bir kishi = bitta universitet).
- Admin: alohida `admin_accounts` jadvali, rollar faqat `owner` va `admin`.
- Server tomonda guardlar bor: `CurrentUser`, `Employer`, `ApprovedEmployer`, `Staff`, `Mentor`, `AdminActor`,
  `OwnerActor`. Korxona va universitet ma'lumotlari egalik bo'yicha tekshiriladi (asosiy joylarda).
- Bir kishida bir nechta a'zolik (masalan, universitet xodimi + korxona) **yo'q** va hozir kerak emas.

## 5. Ma'lumotlar bazasi: maqsadli obyektlar bilan solishtirish

| Obyekt | Holat | Izoh |
|---|---|---|
| User, StudentProfile | Qisman | `users` ustunlarida. `graduation_year`, ko'nikmalar (ARRAY), tillar, GPA bor |
| Role / Membership | Qisman | `account_type` + `role`, a'zolik jadvali yo'q |
| Company | Bor | Logo maydoni yo'q |
| CompanyMembership | Qisman | `users.company_id`, rollar va taklif qilish yo'q |
| University | Bor (minimal) | Faqat nom, qisqa nom, shahar. Tavsif, logo, sayt, fakultetlar yo'q |
| UniversityMembership | Qisman | Xodim maydonlari `users` da |
| Vacancy (Job) | Bor | Tavsif, talablar, ko'nikmalar, shahar, format, turi (internship/part_time/junior/project), maosh, muddat, amaliyot sifatida hisoblanishi. **Yo'q:** tajriba darajasi, qoralama va arxiv holati |
| Application | Bor | Unikal (job, user). Qaytarib olish qatorni **o'chiradi** |
| ApplicationStatusHistory | Yo'q | Faqat `updated_at` |
| Skill / StudentSkill | Qisman | Erkin matnli ARRAY |
| Portfolio | Qisman | Tasdiqlangan ishlar va chellenjlar shu vazifani bajaradi |
| Resume / CV | Qisman | Ma'lumotdan yaratiladi (HTML + PDF), yuklangan CV fayli yo'q |
| Internship | Qisman | Faqat `Job.kind = internship` |
| Interview, JobOffer | Yo'q | |
| EmploymentOutcome | Yo'q | Faqat `Application.status = hired` |
| Partnership | Yo'q | |
| Notification (sayt ichida) | Yo'q | Telegramsiz foydalanuvchi hech narsa olmaydi |
| SavedVacancy | Yo'q | |
| Complaint / Report | Yo'q | |
| RankingPeriod / Metric / Snapshot | Yo'q | Reyting faqat ball bo'yicha jonli hisoblanadi |
| AuditLog | Qisman | Faqat admin amallari, aktor matn ko'rinishida |
| VerificationRequest | Qisman | Holat obyekt qatorida, tarix yo'q |

Sxema xavfi: `upgrades.py` CHECK cheklovlarini qo'shmaydi. Jadval yaratilgandan keyin modelga qo'shilgan
cheklovlar (masalan, `user_account_type_valid`) prod bazada bo'lmasligi mumkin. Ariza holatlarini kengaytirishda
cheklovni `DROP ... IF EXISTS` + `ADD` bilan yangilash kerak.

## 6. Qayta ishlatiladigan komponentlar va dizayn qoidalari

- **Komponentlar**: `ui.tsx` (Avatar, StatusBadge, Sheet, ErrorText, FileList, toast), `form.tsx`
  (`useRequired`, `Field`, `Req`), `icons.tsx` (28 chiziqli ikon), `Shell` (≥900px sidebar, telefonda pastki
  tablar), admin `LineChart` (SVG, tooltip, jadval rejimi).
- **Komponent emas, lekin takrorlanadi**: `.segmented` ~10 faylda, `.card`, `.kpi`, `.data-table` (faqat admin).
  Yangi ishda `Tabs`, `DataTable`, `KpiCard`, `EmptyState` komponentlariga ajratish foydali.
- **Tokenlar** (`styles.css`): `--brand #16a34a`, `--brand-soft #eaf7ef`, fon `#f4f8f5`, matn `#13261b`,
  `--radius 14px`, Inter. Dark mode yo'q (ataylab, Telegram ranglari majburlangan).
- **Nomuvofiqliklar**: admin grafiklarida ko'k va to'q sariq ranglar, 36 ta qattiq yozilgan hex rang, ~45
  qattiq radius, 307 ta inline `style`, `.segmented` ikki marta e'lon qilingan, bir nechta joyda emoji yoki
  belgi qolgan (yo'nalish ikonkasi standarti, BotLink).
- **Loading / empty / error**: asosiy ekranlarda standart naqsh bor. Yo'q: MentorTools, admin Universities,
  Settings, Queue, GroupsAdmin, ChallengesAdmin, Accounts, Announcements. 27 joyda xato jim yutiladi.

## 7. Maqsadli arxitekturaga nisbatan yetishmaydiganlar

**Workflow A (vakansiya → ishga olish)**: ariza berish, korxona ro'yxati, status va Telegram xabari bor.
Yo'q: ochiq (kirmasdan) vakansiyalar ro'yxati, `under_review`, `interview`, `offer`, `withdrawn` holatlari,
o'tish qoidalari, holat tarixi, sayt ichida bildirishnoma, suhbat vaqti, saqlangan vakansiyalar,
korxona Dashboard voronkasi, talaba Dashboard.

**Workflow B (universitetga bog'lanish)**: bog'lanish, tasdiqlash, faqat o'z universitetini ko'rish bor.
Yo'q: statistikada faqat tasdiqlangan talabalarni sanash, bir talabani bir marta sanash, ishga olingan paytdagi
universitetni qayd qilish, bitiruvchi kogortalari, bandlik natijalari jadvali.

**Workflow C (korxona ↔ universitet hamkorligi)**: **umuman yo'q** (model ham, endpoint ham).

**Boshqa**: ochiq sahifalar (bosh sahifa, korxonalar, sohalar, universitetlar), 3 til, admin darajali rollari,
shikoyatlar, reyting jadvallari, korxona vazifalari (hozir faqat mentor chellenji va korxona testi bor; test
natijasi CV ga ham, ballga ham yozilmaydi).

**i18n hajmi**: frontendda ~1 300-1 400 qattiq yozilgan o'zbekcha matn (screens ~525, admin ~420,
employer ~240, mentor ~78, university ~39, boshqa ~80). Backendda 182 ta xato xabari + ~25 bildirishnoma + bot
matnlari. Sanalar uch xil usulda formatlanadi.

## 8. Xavfsizlik va regressiya xavflari

Kodda tasdiqlangan (CONFIRMED):

| # | Muammo | Joy | Jiddiylik |
|---|---|---|---|
| X1 | Ariza holati o'tishlari tekshirilmaydi: `hired` → `rejected`, `rejected` → `hired`, yopilgan vakansiyada ham o'zgaradi. Tarix yo'q | `api/employer.py:156-166` | Yuqori (statistika ishonchliligi) |
| X2 | Qaytarib olish qatorni o'chiradi: rad etilgan talaba qaytarib olib, qayta ariza bera oladi, korxona bilmaydi | `api/jobs.py:112-120` | O'rta |
| X3 | Universitet statistikasi ariza qatorlarini sanaydi: bir talaba ikki marta ishga olinsa, ikki marta sanaladi; tasdiqlanmagan talabalar ham kiradi; talaba universitetini o'zgartirsa, ishga olinishi yangi universitetga o'tadi | `api/university.py:49-71` | Yuqori (reyting uchun asos) |
| X4 | "Anonim" talent kartalarida haqiqiy `id` bor, `T-00042` = id. `/employer/students/{id}` orqali ism ochiladi. Sababi: 13-oktabrdagi "barcha talabalar ism bilan" qarori va eski anonim model birga yashayapti. Ochiq Telegram username ham telefonni yashirishni ma'nosiz qiladi | `services/career.py:66-79`, `api/employer.py` | Yuqori (maxfiylik, qaror kerak) |
| X5 | Har qanday foydalanuvchi universitet yarata oladi va admin o'chirgan universitetni **qayta faollashtiradi** | `api/people.py:209-224` | O'rta |
| X6 | Reyting (leaderboard) rozilikni tekshirmaydi: ism, guruh, universitet ko'rinadi | `api/people.py:172-195` | Past-o'rta |
| X7 | Har qanday mentor istalgan savol javobini qayta yozadi | `api/work.py:197` | Past |
| X8 | Admin yopilgan vakansiya yoki testni tasdiqlay oladi | `api/admin.py:586`, `api/company_tests.py:476` | Past |
| X9 | Oddiy admin (owner emas) istalgan foydalanuvchi parolini tiklaydi (vaqtinchalik parol ko'rsatiladi) | `api/admin.py:95` | O'rta |
| X10 | Rate limit yo'q: `bot-login` yaratish (kirmasdan baza qatori), admin login, vakansiya/test yaratish (har biri adminlarga xabar), mentor chellenji (hamma talabaga xabar) | `api/auth.py:108` va boshqalar | O'rta |
| X11 | Cheksiz so'rovlar va N+1: `/employer/students` hamma talabani yuklaydi, `/me/applications`, arizachilar ro'yxati, CSV eksportlar; `/challenges`, `/groups`, `/tests` da N+1 | turli | O'rta (o'sish bilan) |
| X12 | Yangi korxona yoki vakansiya haqidagi admin xabarlari Telegram `role=admin` foydalanuvchilarga ketadi, adminlar esa endi `admin_accounts` da: xabar hech kimga yetmasligi mumkin | `api/employer.py:48-51` | O'rta (ehtimoliy) |

Ehtimoliy (POSSIBLE): fayl turi ro'yxati yo'q (faqat hajm cheklangan, xavfli turlar yuklab olinadi, inline
ochilmaydi); foydalanuvchi JWT parol o'zgarganda bekor bo'lmaydi; rate limit bitta jarayon xotirasida;
Gemini xato matni talabaga qaytadi; tasdiqlangan korxona "talabaga qaytish" qilsa `company_id` saqlanib qoladi.

Regressiya xavfi eng yuqori joylar: `App.tsx` (barcha marshrut holati), `api.ts` (607 qator, barcha tip va
endpoint), `employer/EmployerApp.tsx`, `mentor/MentorTools.tsx`, ariza holatlari (bot xabarlari, universitet
statistikasi, testlar ularga bog'liq), Telegram Mini App (`tg.ts` 31 faylda ishlatiladi).

## 9. Tavsiya etilgan arxitektura va reja

### 9.1. Texnik qarorlar (o'zgarmaydigan asos)
- FastAPI + Postgres + React saqlanadi. Yangi og'ir kutubxona qo'shilmaydi.
- **Marshrutlash**: ~60 qatorli o'zimizning History API routeri (`/`, `/vakansiyalar`, `/vakansiya/:id`,
  `/korxonalar`, `/korxona/:id`, `/universitetlar`, `/universitet/:id`, `/talaba/...`, `/korxona-panel/...`,
  `/universitet-panel/...`). Telegram ichida ham ishlaydi. react-router kerak emas.
- **i18n**: kutubxonasiz `t("kalit")` + `uz.json`, `ru.json`, `en.json`; til `users.language` da va
  localStorage da. Backend xatolari `code` + o'zbekcha matn qaytaradi, frontend kod bo'yicha tarjima qiladi.
- **Sxema**: `upgrades.py` davom etadi (Alembic hozir kiritilmaydi), lekin cheklovlarni sinxronlash qadami
  qo'shiladi. Barcha o'zgarishlar additiv, eski ma'lumot saqlanadi.
- **Yangi jadvallar**: `application_events` (holat tarixi), `notifications`, `saved_jobs`, `interviews`
  (yoki ariza maydonlari), `employment_outcomes`, `partnerships`, `complaints`, keyinroq `ranking_periods` va
  `ranking_snapshots`. Mavjudlarga qo'shiladi: `universities` (tavsif, logo, sayt, hudud), `companies` (logo),
  `jobs` (tajriba darajasi, qoralama/arxiv holati), `admin_accounts.role` (moderator, analyst).
- **Ariza holatlari**: `new` (submitted), `viewed` (under review), `shortlisted`, `interview`, `offer`,
  `hired`, `rejected`, `withdrawn`. Eski qiymatlar o'z ma'nosida qoladi, o'tish xaritasi serverda.

### 9.2. Bosqichlar (MVP ustuvorligiga moslangan)

| Faza | Mazmun | Qabul mezoni |
|---|---|---|
| **1. Reja yakuni** | Bu hisobot bo'yicha qarorlar, sahifalar xaritasi, ruxsatlar matritsasi, migratsiyalar ro'yxati | Siz tasdiqladingiz |
| **2. Asos** | Router va URL'lar, i18n infratuzilmasi (yangi ekranlar 3 tilda), Shell: rolga mos menyu + bildirishnoma qo'ng'irog'i, `notifications`, ariza holatlari + tarix + o'tish qoidalari, X1-X12 tuzatishlar, lokal image qayta qurish | 86 eski test + yangi ruxsat testlari o'tadi, Mini App ishlaydi |
| **3. Workflow A (MVP 1)** | Ochiq bosh sahifa (3 panelga kirish), ochiq vakansiyalar ro'yxati va sahifasi, korxona ochiq profili; talaba Dashboard, saqlangan vakansiyalar, arizalar va suhbatlar; korxona Dashboard (voronka), Nomzodlar jadvali va pipeline, suhbat va taklif; bildirishnomalar | Korxona vakansiya → talaba ariza → korxona status → talaba ko'radi + bildirishnoma zanjiri end-to-end testda |
| **4. Universitet (MVP 2)** | Universitet profili, faqat tasdiqlangan + rozilik bergan talabalar statistikasi, `employment_outcomes` (ishga olinganda avtomatik, korxona tasdig'i, talaba aytgani alohida belgi bilan), "Bitiruvchilar qayerda" va filtrlar, hamkorlik (Workflow C), imkoniyatni talabalarga tavsiya qilish, PDF hisobot | Har bir ko'rsatkichning ta'rifi va davri ekranda; bir talaba bir marta sanaladi |
| **5. Reyting va admin (MVP 3)** | Universitet reytingi beta (R formula, vaznlar admin saytda, "ma'lumot yetarli emas", snapshotlar), korxona reytingi; admin darajali rollari, shikoyatlar, bandlik tekshiruvi. Mavjud 20 sahifa o'z joyida | Ma'lumot yetishmasa ball chiqmaydi, metodologiya ochiq |
| **6. Sifat va chiqarish** | Eski ekranlarni RU/EN ga o'tkazish, regressiya, xavfsizlik ko'rigi, mobil ko'rinish, server build, deploy | Hamma testlar, build, 3 tilda asosiy oqimlar |

## 10. Sizning tasdig'ingiz kerak bo'lgan qarorlar

| # | Savol | Variantlar | Tavsiyam |
|---|---|---|---|
| Q1 | Korxona qaysi talabalarni ko'radi? (X4) | a) Hozirgidek: rozilik bergan hamma talaba ism + CV bilan. b) Master prompt: faqat ariza berganlar yoki ko'rinishni o'zi yoqqanlar | **b ga yaqin gibrid**: talaba profilida "Korxonalarga ko'rinaman" tugmasi. Rozilik v2 berganlarda yoqilgan holda boshlanadi, istalgan payt o'chiriladi. Telegram username va telefon faqat ariza yoki qabul qilingan kontaktdan keyin. Soxta anonim rejim olib tashlanadi |
| Q2 | 3 til hozirdanmi? | a) Infratuzilma hozir, yangi ekranlar darhol 3 tilda, eski ekranlar Faza 6 da. b) Hammasi birdaniga. c) Faqat o'zbekcha, tillar keyin | **a**. ~1 600 matnni men tarjima qilaman, rus va ingliz tilini ona tili egasi ko'rib chiqishi kerak |
| Q3 | Korxona talabaga vazifa berishi (birinchi xabaringizdagi talab, master promptda yo'q) MVP ga kiradimi? | a) Faza 3 oxirida (chellenj modeliga `company_id` + auditoriya: hamma, yo'nalish, universitet, tanlangan talabalar; natija CV ga). b) Keyinroq | **a**: biznes modelingizning yuragi |
| Q4 | Universitetning "o'z talabasi" kim? | a) Universitetni o'zi tanlagan hamma. b) Faqat universitet tasdiqlagan | Ro'yxat va tasdiqlash navbatida **hamma**, statistika va reytingda **faqat tasdiqlangan** |
| Q5 | Bandlik ma'lumoti manbalari | Avtomatik (`hired`), korxona tasdig'i, talaba o'zi aytgani, universitet CSV importi | Birinchi uchtasi (talaba aytgani "tasdiqlanmagan" belgisi bilan, reytingga kirmaydi), CSV keyin |
| Q6 | Admin rollari | owner, admin + moderator (tasdiqlash va moderatsiya), analyst (faqat ko'rish) | 4 rol. Parol tiklash faqat owner'da |
| Q7 | Deploy tartibi | a) Har faza tugagach, sizning ruxsatingiz bilan jonli saytga. b) Faqat oxirida | **a**: Faza 2 va 3 dan keyin. Jonli saytda pilot foydalanuvchilar bor, shuning uchun har safar avval serverda staging testi |
| Q8 | ishGO va Career EDU skrinshotlari | Master prompt "Screenshot 1, 2" deb ularga tayanadi, lekin menda ular yo'q | Yuborsangiz, Faza 3 dizayniga qo'shaman. Hozir InternHub, Hiring Flow, Cornell, VeriApp namunalari bor |

Tasdiqlaganingizdan keyin Faza 1 (reja yakuni) boshlanadi. Ungacha ilova kodi o'zgartirilmaydi.
