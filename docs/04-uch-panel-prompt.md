# TalantGo: 3 panelli platforma (Talaba, Korxona, Universitet). Ish prompti

> Bu prompt Claude uchun. Holat: **QORALAMA**. Foydalanuvchi qo'shimcha ma'lumot beradi va "boshla" deydi.
> Ungacha kodga tegilmaydi. Foydalanuvchi bergan ma'lumot 8-bo'limga yoziladi, keyin reja yangilanadi.
>
> 2026-10-25: foydalanuvchi dizayn namunalari va arxitektura taklifini berdi (10-bo'lim, fayllar
> `docs/dizayn-namunalar/`). Keyingi qadam: foydalanuvchining asosiy prompti, undan keyin ham avval tahlil.

---

## 0. Rol va asosiy qoidalar

Sen TalantGo'ning bosh project manageri va yetakchi dasturchisisan. Ishni fazalarga bo'lib, har bir fazani
tugallangan, tekshirilgan va ko'rsatsa bo'ladigan holatda topshirasan.

- **Loyiha:** `D:/learning/students_coursmate` (FastAPI + async SQLAlchemy + Postgres, React/Vite).
  LAW.AI, marketplace va boshqa loyihalarga aralashtirilmaydi.
- **Bot hozircha e'tibordan tashqarida.** Asosiy maydon veb-sayt. Telegram Mini App va bot orqali kirish
  avvalgidek ishlashda davom etadi (buzilmasin), lekin botga yangi funksiya qo'shilmaydi.
- **Interfeys tili:** o'zbekcha (lotin). Uslub: yashil va oq, Inter shrifti, chiziqli ikonlar (`src/icons.tsx`),
  emoji yo'q, "AI'da qilingani bilinib turadigan" bezaklar yo'q. Kompyuterda sidebar, telefonda pastki tablar (`Shell`).
- **Biznes model mezoni** (`careerflow-business-model`): bu matching emas. Korxona qanday mutaxassis kerakligini
  aytadi, talabalarga vazifa beradi va ularni tayyorlaydi, eng yaxshilari ishga olinadi. Har bir yangi funksiya
  shu modelga xizmat qilishi kerak. Oddiy job-board funksiyasi ikkinchi darajali.
- Sozlamalar va kalitlar `.env` orqali emas, admin saytidagi forma orqali kiritiladi.

## 1. Maqsad

Platformaning kirish sahifasida 3 ta panel bo'ladi: **Talaba paneli**, **Korxona paneli**, **Universitet paneli**.
Uchala tomon bir-biriga ulanadi:

1. **Universitet** o'z talabalarini ko'radi va **bandlik statistikasi**ni kuzatadi: talabalarning necha foizi
   ishga yoki amaliyotga joylashgan, qaysi korxonalarga, qaysi fakultet/yo'nalishdan, vaqt bo'yicha qanday o'zgargan.
2. **Korxona** universitetlarni (profil, reyting, statistika, talabalari) va talabalarni ko'radi, talabalarga
   **vazifa beradi**, natijani tekshiradi va eng yaxshilarini ishga taklif qiladi.
3. **Talaba** korxonalarni ko'radi: reytingi, nima ish qilishi, qanday vakansiya va vazifalari borligi.
   Korxona vazifalarini bajaradi va natijasi CV'ga yoziladi.

## 2. Hozirgi holat (qaytadan qurilmaydi, ustiga quriladi)

| Qism | Bor | Fayllar |
|---|---|---|
| Kirish | Veb: email+parol yoki "Telegram orqali davom etish" (bir martalik havola + 6 xonali PIN). Yangi hisob `Welcome` ekranida "Ish izlovchi / Ish beruvchi"ni tanlaydi. Universitet faqat `?start=uni` / `?role=university` orqali. | `screens/WebLogin.tsx`, `screens/Welcome.tsx`, `App.tsx`, `api/auth.py`, `services/web_login.py` |
| Talaba | Yo'l (trek + haftalik vazifalar), Vakansiyalar, Testlar, Tekshirish, Hamjamiyat (guruhlar, tengdoshlar, reyting), Profil + CV | `screens/*`, `api/learning.py`, `api/jobs.py` |
| Korxona | STIR bilan ro'yxatdan o'tish, admin tasdiqlaydi. Tablar: Talabalar (reyting, filtr, PDF CV), Vakansiyalarim, Testlar, Guruhlar, Profilim | `screens/employer/*`, `api/employer.py`, `api/company_tests.py` |
| Universitet | Ko'rsatkichlar (talabalar soni, tasdiqlangan, faol, ariza statuslari, `hired` soni, top korxonalar, kurs/fakultet kesimi), Tasdiqlash, Talabalar, Guruhlar, CSV eksport | `screens/university/UniversityApp.tsx`, `api/university.py` |
| Chellenjlar | Faqat mentorlar yaratadi (`Challenge.created_by_id`), korxona emas | `api/challenges.py`, `models.Challenge` |
| Admin sayt | `/admin`: navbat, talabalar, kompaniyalar, vakansiyalar, universitetlar, testlar, chellenjlar va boshqalar | `screens/admin/*`, `api/admin.py` |

Ma'lum cheklovlar:
- "Ishga joylashdi" faqat `Application.status == "hired"` orqali hisoblanadi. Platformadan tashqarida ishga kirgan
  talaba, amaliyot va bitirish yili hisobga olinmaydi, shuning uchun bandlik foizi hozir haqiqiy emas.
- `University` jadvalida faqat `name, short_name, city` bor: logo, tavsif, sayt yo'q.
- Bildirishnomalar faqat Telegram orqali boradi. Telegramsiz (email bilan kirgan) foydalanuvchi hech narsa olmaydi.
  Veb asosiy bo'lgani uchun sayt ichida bildirishnomalar qutisi kerak.
- Router yo'q: `main.tsx` faqat `/admin` yo'lini tekshiradi.

## 3. Nima yetishmaydi

| # | Talab | Hozir | Qilinadigan ish |
|---|---|---|---|
| G1 | Kirishda 3 panel | 1 ta umumiy login, rol keyin tanlanadi | Landing + `/talaba`, `/korxona`, `/universitet` kirish sahifalari, rol ro'yxatdan o'tishda belgilanadi |
| G2 | Universitet o'zi ro'yxatdan o'ta olishi | Faqat maxsus havola orqali | Vebda "Universitet paneli": karyera markazi xodimi ariza beradi, admin tasdiqlaydi |
| G3 | Bandlik foizi | Faqat `hired` soni | Bandlik yozuvlari, bitirish yili, aniq formula, grafiklar, eksport |
| G4 | Korxona universitetlarni ko'radi | Yo'q | Universitetlar katalogi + universitet sahifasi (profil, agregat statistika, talabalari) |
| G5 | Talaba korxonalarni ko'radi | Faqat vakansiya ichida nomi | Korxonalar katalogi + korxona sahifasi (nima qiladi, reyting, vakansiyalar, vazifalar, sharhlar) |
| G6 | Korxona reytingi | Yo'q | Formula (8-bo'limdagi javobga qarab) |
| G7 | Korxona vazifa beradi | Faqat test va vakansiya | Korxona vazifalari: hammaga / yo'nalishga / universitetga / tanlangan talabaga; topshirish, baholash, ball, CV |
| G8 | Universitet reytingi | Yo'q | Ochiq reyting, kichik namunadagi soxta 100%ga qarshi minimal chegara bilan |
| G9 | Veb bildirishnomalar | Faqat Telegram | Sayt ichida bildirishnomalar qutisi (vazifa berildi, ariza statusi, tasdiq) |

## 4. Kim nimani ko'radi (ruxsatlar matritsasi)

Har bir endpoint shu jadvalga qarab yoziladi va testlanadi.

| Ko'ruvchi | Talabalar | Korxonalar | Universitetlar |
|---|---|---|---|
| **Talaba** | O'zini to'liq. Boshqalarni hozirgi qoida bo'yicha (faqat rozilik bergan talabalar, `/peers`) | Ochiq profil, reyting, vakansiyalar, vazifalar, sharhlar | Ochiq profil + agregat statistika + reyting |
| **Korxona** (tasdiqlangan) | Hozirgi qoida: rozilik v2 bo'yicha ism + CV; telefon faqat ariza yoki qabul qilingan kontaktdan keyin | Boshqa korxonalarning ochiq profili | Profil, agregat statistika, talabalari (universitet filtri bilan) |
| **Universitet** (tasdiqlangan xodim) | Faqat o'z talabalari, to'liq (hozirgidek). Boshqa universitet talabalari yo'q | Ochiq profil + o'z talabalari bilan ishlagan korxonalar statistikasi | O'zini to'liq, boshqalarni faqat ochiq reytingda |
| **Kirmagan mehmon** | Yo'q | Hal qilinmagan (8-bo'lim, S6) | Hal qilinmagan (8-bo'lim, S6) |

Hech qachon: universitet boshqa universitet talabasining shaxsiy ma'lumotini ko'rmaydi; reytinglarda N < minimal
chegara bo'lsa foiz ko'rsatilmaydi ("ma'lumot yetarli emas").

## 5. Ma'lumotlar modeli (taklif, 8-bo'limdagi javoblardan keyin aniqlanadi)

Barcha o'zgarishlar additiv, `backend/app/core/upgrades.py` orqali. Eski ma'lumot buzilmaydi.

- **`universities`** + `description`, `website`, `logo_url`, `region`, `is_public`.
- **`users`** (talaba) + `graduation_year` (bitirish yili; kursdan taxminiy hisoblanadi, talaba tuzatadi).
- **`employment_records`** (yangi): `student_id`, `company_id` (platformada bo'lsa) yoki `company_name`,
  `position`, `kind` (full_time / part_time / internship / dual_education), `started_at`, `ended_at`,
  `source` (application_hire / self_report / company / university), `company_confirmed`, `university_confirmed`.
  `Application` `hired` holatiga o'tsa yozuv avtomatik yaratiladi.
- **Korxona vazifalari:** avval mavjud `Challenge`ni kengaytirish ko'rib chiqiladi (`company_id`, `audience`:
  all / track / university / invited, `university_id`, taklif qilingan talabalar ro'yxati, moderatsiya statusi).
  Agar `challenges.py` mantiqiga to'g'ri kelmasa, alohida `company_tasks` + `company_task_submissions` qilinadi.
  Qaror kodni o'qib bo'lgach yoziladi.
- **`company_reviews`** (S2 javobiga bog'liq): talaba bahosi 1-5 + izoh, faqat korxona bilan haqiqiy aloqa
  bo'lgandan keyin (ariza, kontakt, vazifa, ishga olinish), admin moderatsiyasi bilan.
- **`university_partnerships`** (S5 javobiga bog'liq): korxona va universitet hamkorligi (pending / accepted).
- **`notifications`** (yangi): `user_id`, `kind`, `title`, `body`, `link`, `read_at`. Telegram bo'lsa u yerga ham ketadi.

### Hisoblash formulalari (taklif)

- **Bitiruvchilar bandligi** = bitirganidan keyin 6 oy ichida ish yoki amaliyot yozuvi bor bitiruvchilar /
  shu yildagi barcha bitiruvchilar. Ikki raqam: "tasdiqlangan" (korxona yoki universitet tasdiqlagan) va
  "talaba aytgan".
- **Talabalar bandligi** = hozir amaliyot, yarim stavka yoki dual ta'limda bo'lgan talabalar / faol talabalar.
- **Universitet reytingi**: bandlik %, tasdiqlangan talabalar soni, faol talabalar %, korxona vazifalaridagi
  qabul qilingan ishlar. Minimal chegara: 20+ talaba.
- **Korxona reytingi**: yulduzlar (talaba bahosi) va faollik ko'rsatkichlari alohida ko'rsatiladi (arizalarga
  javob foizi, o'rtacha javob vaqti, ishga olinganlar, berilgan vazifalar). Bitta "sirli" raqamga yig'ilmaydi.

## 6. Fazalar va qabul mezonlari

Har bir faza oxirida: testlar o'tadi, foydalanuvchiga skrinshot yoki demo ko'rsatiladi, git commit qilinadi.
Serverga deploy faqat foydalanuvchi "deploy qil" deganidan keyin.

**Faza 0. Tayyorgarlik** (kod yozilmaydi)
- 8-bo'limdagi savollarga javob olish, rejani yangilash, foydalanuvchiga tasdiqlatish.
- Qabul: foydalanuvchi rejani tasdiqladi.

**Faza 1. Kirish sahifasi va 3 panel**
- Kirmagan foydalanuvchi uchun landing: qisqa sarlavha + 3 karta (Talaba paneli, Korxona paneli, Universitet paneli).
- Har bir karta o'z kirish sahifasiga olib boradi (`/talaba`, `/korxona`, `/universitet`): kirish va ro'yxatdan
  o'tish, rol oldindan belgilangan. Email+parol va Telegram usuli saqlanadi.
- Universitet xodimi vebda ariza beradi: universitetni ro'yxatdan tanlaydi, lavozimi, ish emaili; admin tasdiqlaydi.
- Noto'g'ri panel: talaba hisobi bilan "Korxona paneli"ga kirsa, tushunarli xabar va o'z paneliga havola.
- Kirgan foydalanuvchi to'g'ri o'z paneliga tushadi. Telegram Mini App ishlashi o'zgarmaydi.
- Qabul: 3 rolning har biri vebda noldan ro'yxatdan o'tib, o'z paneliga kira oladi; eski hisoblar ishlaydi;
  `/admin` va bot havolalari (`?start=...`) buzilmagan.

**Faza 2. Kataloglar va profil sahifalari**
- Korxonalar katalogi (talaba va universitet uchun): qidiruv, soha, shahar filtrlari; korxona sahifasi:
  tavsif, nima ish qiladi, reyting, ochiq vakansiyalar, faol vazifalar.
- Universitetlar katalogi (korxona va talaba uchun): universitet sahifasi: profil, agregat statistika,
  top yo'nalishlar, (korxona uchun) shu universitet talabalariga o'tish.
- Universitet profilini xodim tahrirlaydi (tavsif, sayt, logo).
- Qabul: 4-bo'limdagi matritsa bo'yicha har bir rol faqat ruxsat berilganni ko'radi; buni pytest tekshiradi.

**Faza 3. Korxona vazifalari**
- Korxona vazifa yaratadi: sarlavha, tavsif, fayl, muddat, ball, kimga (hammaga / yo'nalish / universitet /
  tanlangan talabalar). Talabalar ro'yxatidan to'g'ridan-to'g'ri "Vazifa berish" tugmasi.
- Admin moderatsiyasi (S3 javobiga qarab).
- Talaba vazifani ko'radi (Yo'l yoki alohida "Vazifalar" bo'limi), matn, havola yoki fayl topshiradi.
- Korxona topshiriqlarni ko'radi, qabul yoki rad etadi, izoh va baho beradi, g'oliblarni belgilaydi.
- Natija talaba CV'siga va ballariga yoziladi; korxona eng yaxshisiga kontakt yoki taklif yubora oladi.
- Qabul: vazifa yaratish → topshirish → baholash → CV'da ko'rinish zanjiri test bilan yopilgan.

**Faza 4. Bandlik statistikasi (universitet paneli)**
- `employment_records` + `graduation_year`. Manbalar: `hired` ariza (avtomatik), talaba o'zi qo'shadi
  ("Ishga joylashdim / Amaliyotdaman"), korxona tasdiqlaydi, universitet tasdiqlaydi yoki CSV import qiladi (S1).
- Universitet panelidagi "Ko'rsatkichlar" qayta quriladi: bandlik % (tasdiqlangan va talaba aytgan alohida),
  fakultet / kurs / yo'nalish / bitirish yili kesimida, top ish beruvchilar, oylar bo'yicha grafik, eksport.
- Grafiklar dataviz qoidalari bo'yicha, yashil palitrada.
- Qabul: demo ma'lumotda (faqat dev, prod emas) foizlar qo'lda hisoblangan qiymatga teng; N < chegara bo'lsa foiz
  ko'rsatilmaydi.

**Faza 5. Reytinglar**
- Universitetlar reytingi va korxonalar reytingi (5-bo'lim formulalari, S2 javobiga ko'ra).
- Sharhlar (agar tanlansa): faqat haqiqiy aloqadan keyin, admin moderatsiyasi, korxona javob yoza oladi.
- Qabul: formula ekranda "Qanday hisoblanadi?" izohida ochiq yozilgan; testlar soxta yoki kichik namunani
  reytingga kiritmaydi.

**Faza 6. Bildirishnomalar, admin sayt, sayqal va deploy**
- Sayt ichida bildirishnomalar qutisi (yangi vazifa, topshiriq natijasi, ariza statusi, tasdiq, hamkorlik so'rovi).
- Admin sayt: universitet xodimi arizalari, korxona vazifalari moderatsiyasi, sharhlar, bandlik yozuvlari.
- To'liq regressiya testi, serverda staging tekshiruvi, foydalanuvchi ruxsatidan keyin deploy.

## 7. Texnik qoidalar

- Sxema o'zgarishi faqat additiv, `core/upgrades.py` orqali. Eski ustun yoki jadval o'chirilmaydi.
- Har bir yangi endpoint uchun pytest: ruxsat (kim ko'ra oladi / ko'ra olmaydi) + asosiy oqim.
- Laptop RAM kam (8 GB): `npm run build` yiqilsa, `docker build --target web` ishlatiladi. Lokal Docker o'chiq
  bo'lsa, foydalanuvchidan yoqishni so'rash; yoki serverda `/root/careerflow-staging` image + one-off pytest
  `careerflow_test` bazasiga qarshi. Prod bazaga tegilmaydi.
- Deploy: `bash deploy/server-setup.sh`; o'chirilgan fayllar serverda qo'lda `rm` qilinadi. Server umumiy:
  `lawai`, `marketplace`, `selleverywhere` konteynerlariga tegilmaydi.
- Ichki nomlar (`careerflow` docker loyihasi, DB, `cf_user_token`) o'zgartirilmaydi.
- Matnlarda apostrof bor: patch skriptlari Write tool bilan yoziladi, bash heredoc bilan emas.
- Ochiq sahifalarda shaxsiy ma'lumot (telefon, email) chiqmaydi; URL parametrlarida shaxsiy ma'lumot yo'q.

## 8. Ochiq savollar (foydalanuvchi javobi kutilmoqda)

| # | Savol | Taklifim | Javob |
|---|---|---|---|
| S1 | Bandlik foizi kim bo'yicha: bitiruvchilarmi, barcha talabalarmi? Ma'lumotni kim kiritadi: talaba, korxona, universitet (CSV)? | Ikkalasi alohida ko'rsatiladi; uchala manba, "tasdiqlangan" raqam asosiy | |
| S2 | Korxona reytingi nimadan: talabalar bahosi (yulduz + izoh) yoki faqat faollik? | Ikkalasi alohida, sharhlar faqat haqiqiy aloqadan keyin | |
| S3 | Korxona vazifalari bepulmi yoki tanga/Pro bilanmi? Admin har birini tasdiqlaydimi? | Hozircha bepul; tasdiqlangan korxona vazifasi darhol chiqadi, admin keyin yashira oladi | |
| S4 | Universitet panelida kim ishlaydi: faqat karyera markazimi, dekanat ham? Bir universitetga nechta xodim? | Bir nechta xodim, birinchisini admin tasdiqlaydi, keyingilarni universitetning o'z xodimi | |
| S5 | Korxona va universitet o'rtasida "hamkorlik" tugmasi kerakmi (memorandum, amaliyot joylari)? | Ha, oddiy so'rov + qabul; universitet statistikasida hamkor korxonalar | |
| S6 | Korxona va universitet sahifalari tizimga kirmagan mehmonga ham ochiqmi (landingda reyting)? | Ha, faqat agregat ma'lumot; talabalar ro'yxati faqat kirganlarga | |
| S7 | Muddat bormi (tanlov, demo, universitet bilan uchrashuv)? Qaysi faza birinchi kerak? | Faza 1 → 3 → 4 → 2 → 5 tartibi demo uchun eng kuchli | |
| S8 | Panel nomlari va dizayn bo'yicha istak (masalan, landing qanday ko'rinsin)? | Hozirgi yashil-oq uslub, 3 katta karta | |

## 9. Ish tartibi

1. Foydalanuvchi ma'lumot beradi → 8-bo'lim to'ldiriladi → reja yangilanadi va qisqa ko'rinishda tasdiqlatiladi.
2. "Boshla" buyrug'idan keyin fazalar ketma-ket bajariladi; har faza oxirida qisqa hisobot: nima qilindi,
   qanday tekshirildi, skrinshot, keyingi qadam.
3. Reja tashqarisidagi g'oya chiqsa, so'raladi, o'zboshimchalik bilan qo'shilmaydi.
4. Sotuv taqdimoti yoki boshqa loyihaga tegilmaydi; faqat TalantGo platformasi.

## 10. Foydalanuvchi ma'lumotlari (2026-10-25): dizayn namunalari va arxitektura taklifi

Fayllar: `docs/dizayn-namunalar/` (4 ta panel namunasi, 6 ta arxitektura skrinshoti, `arxitektura-taklif.md`
matni). Foydalanuvchi qoidalari:
- Namunalar aynan nusxa emas, variant. Qulayroq yechim bo'lsa, o'shani qilish mumkin.
- **Admin saytdagi hozirgi sahifalarning birortasi olib tashlanmaydi** (Bosh sahifa, Tasdiqlash navbati,
  Talabalar va mentorlar, Topshirilgan ishlar, Yo'nalishlar, Chellenjlar, Kompaniyalar, Vakansiyalar, Testlar,
  Arizalar, Universitetlar, Guruhlar, E'lonlar, Telegram bot, AI yordamchi, Hisobotlar, Sozlamalar, Adminlar,
  Audit, Profilim). Yangilari faqat qo'shiladi.
- Rang namunadagidek binafsha yoki ko'k emas: TalantGo yashil-oq uslubi saqlanadi.

### 10.1. Namunalardan nima olinadi

| Panel | Namuna | Olinadigan g'oyalar | Olinmaydigan narsalar |
|---|---|---|---|
| Talaba | InternHub | Salomlashish kartasi + o'sish ko'rsatkichi (ball, daraja, streak, keyingi darajagacha progress); tezkor amallar (yo'l xaritasi, amaliyotlar, CV); "Arizalarim" status belgisi bilan; ko'nikmalar progressi (tasdiqlangan ishlar bo'yicha); vakansiya kartalari: "Tasdiqlangan" belgisi, muddat, format, ko'nikma teglari, "Ariza berish" | Yuqoridagi Student/Industry/Admin almashtirgichi (bitta hisob = bitta rol); multfilm avatar; "92% match" kabi asossiz raqam |
| Korxona | Hiring Flow | Voronka KPI kartalari (Arizalar → Saralash → Suhbat → Ishga olindi); nomzodlar jadvali: belgilash katakchasi, ism, lavozim, bosqich (rangli belgi), moslik %, baho, sana, shahar; qidiruv, filtr, sahifalash; o'ng ustunda TalantGo AI tavsiyalari ("Suhbatga taklif qilish") | "AI Score" ni tushuntirishsiz ko'rsatish: moslik ochiq formuladan (yo'nalish, tasdiqlangan ishlar, test natijasi, ko'nikmalar) hisoblanadi va "Qanday hisoblanadi?" izohi bo'ladi |
| Universitet | Cornell "First Destination" | Filtrlar qatori (yil, fakultet, yo'nalish, soha, ta'lim darajasi); halqa diagramma "Bitiruvchilar qayerda" (to'liq ish, yarim stavka, amaliyot, magistratura, ish izlayapti, harbiy xizmat, boshqa); top ish beruvchilar ro'yxati; boshlang'ich maosh o'rtacha va mediana (o'zi aytgan, javoblar 10 tadan kam bo'lsa ko'rsatilmaydi); "Chop etish / PDF" | Ko'p rangli diagramma: yashil palitrada, dataviz qoidalari bo'yicha |
| Admin | VeriApp | Yashil sidebar (bizda bor); KPI kartalari 30 kunlik o'zgarish strelkasi bilan; halqa "Tasdiqlangan / Rad etilgan" nisbati; oylik ustunli grafik; har bir kartada davr tanlash | Hamyon balansi (to'lov hali yo'q); mavjud sahifalarni almashtirish |

### 10.2. Arxitektura taklifi bilan hozirgi kod solishtiruvi

Mos keladi va saqlanadi:
- Bitta tizim, bitta baza, rollar bo'yicha ruxsat. Bizda shunday: bitta FastAPI + Postgres, `users.account_type`
  (student / employer / university), admin alohida `admin_accounts`. Texnologiya almashtirilmaydi
  (taklifdagi Next.js, Laravel, Supabase kerak emas).
- Talaba, korxona, universitet panellari va admin sayt allaqachon bor (2-bo'lim). Ish ular ustiga quriladi.
- Audit jurnali, kompaniya verifikatsiyasi (STIR), vakansiya moderatsiyasi, universitet xodimini tasdiqlash bor.

Yangi bo'ladi (taklifdan qabul qilinadi):
- **Ochiq sahifalar** (kirmagan mehmon uchun): bosh sahifa (3 yo'nalish), vakansiyalar, korxonalar,
  soha yo'nalishlari, universitetlar, universitet profili. Hozir ochiq sahifa faqat `/cv/{slug}`.
- **Saralash bosqichlari:** hozir `new, viewed, shortlisted, rejected, hired`. Qo'shiladi: `interview`
  (suhbat vaqti, joyi yoki havolasi), `offer` (taklif). Eski qiymatlar saqlanadi, CHECK cheklovi `upgrades.py`
  orqali yangilanadi.
- **Talaba paneli:** Dashboard, saqlangan vakansiyalar, "Suhbatlar va takliflar", "Universitetim", maxfiylik
  sozlamalari, bildirishnomalar.
- **Korxona paneli:** Dashboard, hamkorlik va amaliyot dasturlari, hisobotlar, jamoa a'zolari (hozir STIR
  unikal bo'lgani uchun amalda bitta korxonaga bitta hisob; HR hamkasblarni taklif qilish yo'q).
- **Universitet paneli:** bitiruvchilar ro'yxati, hamkorliklar, amaliyot dasturlari, bandlik statistikasi,
  reyting va davrlar bo'yicha taqqoslash.
- **Jarayon B:** universitet korxona imkoniyatini o'z talabalariga "tavsiya qiladi" → talabalarga
  bildirishnoma → kim ariza bergani universitet panelida ko'rinadi.
- **Admin:** darajali rollar (hozir faqat `owner` va `admin`), shikoyatlar moderatsiyasi, bandlik
  ma'lumotlarini tekshirish, reyting davrlari va vaznlarini boshqarish, tarjimalar.

Ziddiyatlar va qaror kerak bo'lgan joylar (foydalanuvchiga beriladi):

| # | Masala | Hozir | Taklifda | Mening tavsiyam |
|---|---|---|---|---|
| Z1 | Korxona kimlarni ko'radi | 2026-10-13 dagi qaroringiz: tasdiqlangan korxona rozilik bergan hamma talabani ism va CV bilan ko'radi, telefon yashirin | Faqat ariza berganlar yoki ko'rinishga ruxsat berganlar | Talaba profilida aniq tanlov: "Barcha tasdiqlangan korxonalarga ko'rinaman" (standart) / "Faqat ariza bergan korxonalarimga". Ikkala fikr ham qondiriladi, biznes model (iste'dodlar bazasi) buzilmaydi |
| Z2 | Tillar | Faqat o'zbekcha, matnlar kod ichida | O'zbek, rus, ingliz | Alohida, oxirgi faza. Avval i18n asosini yangi sahifalardan boshlab qo'yish, tarjima keyin. Hozir uch tilda qilish ishni ikki baravar sekinlashtiradi |
| Z3 | Universitet reytingi formulasi R = 0.35E + 0.25M + 0.15P + 0.15F + 0.10A | Reyting yo'q | 5 mezon | Formula qabul qilinadi, vaznlar admin saytda o'zgartiriladi. M (mutaxassislikka moslik) uchun fakultet → soha xaritasi, F (ish beruvchi fikri) uchun korxona bitiruvchini baholashi kerak; bu ma'lumot paydo bo'lguncha mezon "ma'lumot yetarli emas" deb ko'rsatiladi, reyting "beta" belgisi bilan chiqadi |
| Z4 | Korxona vazifalari (Forage / Riipen modeli) | Faqat mentor chellenjlari | Taklifda alohida aytilmagan, lekin Forage va Riipen tavsiya qilingan | Sizning birinchi talabingiz ("korxona vazifa bera olishi kerak") va biznes modelingiz uchun asosiy. Reja 3-fazasida qoladi |
| Z5 | Bot | Mini App + bot bildirishnomalari | Tilga olinmagan | Bot e'tibordan tashqarida, lekin buzilmaydi. Veb uchun sayt ichida bildirishnomalar qutisi qilinadi |

### 10.3. Rejaga ta'siri (yangilangan fazalar, tasdiqlanmagan)

0. Audit va qarorlar (Z1-Z5, 8-bo'lim savollari).
1. Ochiq bosh sahifa + 3 panelga kirish + universitet xodimining vebdan ro'yxatdan o'tishi.
2. Umumiy qatlam: bildirishnomalar qutisi, saralash bosqichlari (suhbat, taklif), talaba ko'rinish sozlamasi (Z1).
3. Korxona paneli: Dashboard (voronka), nomzodlar jadvali, korxona vazifalari, hamkorlik va amaliyot dasturlari.
4. Universitet paneli: bandlik yozuvlari, "Bitiruvchilar qayerda" statistikasi, filtrlar, hamkorliklar,
   imkoniyatni talabalarga tavsiya qilish, PDF hisobot.
5. Talaba paneli: Dashboard, arizalar va suhbatlar, saqlangan vakansiyalar, Universitetim, korxona vazifalari.
6. Ochiq kataloglar: vakansiyalar, korxonalar, sohalar, universitetlar va ularning profillari.
7. Reytinglar: universitet (R formula, beta), korxona (yulduzlar + faollik alohida).
8. Admin: darajali rollar, shikoyatlar, bandlik tekshiruvi, reyting vaznlari, Dashboard yangi kartalari.
   Mavjud sahifalar o'z joyida qoladi.
9. Tillar (rus, ingliz).
