# Talaba paneli v2: ish prompti va reja

Sana: 2026-11-17. Branch: `uch-panel`. Bu hujjat talaba panelini qayta qurish uchun o'zimga yozilgan ish prompti:
maqsad, foydalanuvchi qarorlari, tadqiqot xulosalari, 3 bosqichli reja va qabul mezonlari.

## 1. Prompt (o'zimga)

> TalantGo talaba panelini noutbukda (1280–1536 px) to'liq ekranni ishlatadigan, telefonda to'liq moslashadigan,
> zamonaviy karyera platformasiga aylantir. Ro'yxatdan o'tishdan boshla: faqat korxona va universitetga kerakli
> 8–10 maydonni 3 qadamda so'ra, qolganini profilda progressiv to'ldirt. Universitetni qidiruv + ro'yxat bilan
> tanlat, tanlangan universitetning fakultetlarini avtomatik chiqar. Trek ixtiyoriy bo'lsin, uning o'rniga
> "kasb yo'nalishlari" so'ralsin. Sidebar'ni 9 bo'limga qayta qur. Har bo'lim uchun: bo'sh joy qolmasin
> (8+4 ustunli setka, kartochkalar setkasi), bo'sh holatda doim keyingi harakat tugmasi bo'lsin, bitta asosiy
> "keyingi qadam" ko'rsatilsin. Profilni LinkedIn + Instagram uslubida qil: rasm, muqova, tajriba, portfolio,
> sertifikatlar; ishonch darajalari ko'rinib tursin (universitet tasdiqlagan / korxona tasdiqlagan / o'zi
> kiritgan). Korxona topshiriqlarini Forage/Unstop/Kaggle uslubida bajariladigan qil. Har bosqichdan keyin
> brauzerda 1440, 1280 va 375 px'da tekshir, skrinshot ko'rsat va foydalanuvchi tasdig'ini kut.

## 2. Foydalanuvchi qarorlari (2026-11-17)

| Savol | Qaror |
|---|---|
| Trek (DA, ES, ML, MT, BA) | Ixtiyoriy. Ro'yxatdan o'tishda so'ralmaydi, "Topshiriqlar → Haftalik dastur"da tanlanadi |
| Sohalar | Ikkalasi: kasb yo'nalishi (yangi, 23 ta, majburiy, 1–5) + tarmoq (eski 15 ta, ixtiyoriy) |
| Sidebar | 9 bo'lim: Bosh sahifa, Vakansiyalar, Topshiriqlar, Arizalarim, Xabarlar, Tadbirlar \| Universitetim, Hamjamiyat, Profil va portfolio; pastda Sozlamalar |
| Profil | Rasm + muqova, Tajriba, Portfolio loyihalar (setka), Sertifikatlar |
| Ro'yxatdan o'tish | 3 qadam: Shaxsiy → O'qish joyi → Yo'nalish |
| Majburiy | Ism, telefon, universitet, fakultet, kurs, guruh, kasb yo'nalishi, ish turi, hudud, rozilik |
| Chat | Korxona talabaga faqat u ariza bergan yoki bog'lanishga rozi bo'lgandan keyin yoza oladi; korxona paneliga ham qo'shiladi |
| Fakultetlar | Internetdan yig'ilgan katalog + universitet xodimi va admin tahrirlaydi; ro'yxatda yo'q bo'lsa talaba o'zi yozadi |
| OTMlar | Barcha OTMlar (206 ta) qidiruvda |
| Tadbirlar | Universitet + korxona tadbirlari (korxona paneliga tadbir yaratish qo'shiladi) |
| Portfolio ko'rinishi | Korxonaga ko'rinadi (ariza kartochkasi, ochiq CV), tasdiqlangan / "o'zi kiritgan" belgilari bilan |
| Ish tartibi | 3 bosqich, har biridan keyin ko'rsatish va tasdiq |

## 3. Tadqiqot xulosalari

To'liq hisobot: tadqiqot agenti 2026-11-17 da tuzgan (Handshake, LinkedIn, Internshala, Wellfound, Forage,
Unstop, Devpost, Kaggle, career.edu.uz, hh.uz). Asosiy xulosalar:

- **Forma uzunligi.** Maydonlar soni qadamlar sonidan muhimroq. Baymard: o'rtacha 11,3 maydon, 8 tasi yetarli.
  Imagescape 11 → 4 maydon: konversiya +120%. Lekin Unbounce 9 → 6: −14%, ya'ni kerakli maydonni olib tashlamaslik.
  Inline xato ko'rsatish: +22% muvaffaqiyat, −42% vaqt. Natija: 3 qadam, ~10 maydon, qolgani "kerak bo'lganda".
- **Universitet tanlash.** Bitta qidiruvli combobox, 8 tagacha taklif, mos kelgan qism ajratiladi; lotin, kirill,
  qisqartma va eski nomlar (TATU/ТУИТ, TDIU/ТГЭУ) bilan topiladi. Fakultet: 12 tagacha bo'lsa oddiy ro'yxat,
  ko'p bo'lsa qidiruv, oxirida "Boshqa".
- **Dashboard (1280–1536 px).** 240 px sidebar, kontent 8 + 4 ustun (o'ng ustun 300–340 px): asosiyda bitta
  "keyingi qadam", faol topshiriqlar, tavsiyalar (1280 da 2 tadan, 1440 da 3 tadan), ariza holatlari; o'ng ustunda
  profil kartochkasi va to'liqlik halqasi, muddatlar, tasdiq holati. 1200 dan pastda bitta ustun, 768 dan pastda
  pastki menyu. Bo'sh holatda doim tugma + tavsiya.
- **Topshiriqlar.** Kartochka: logotip ✓, nom, ko'nikma teglari, sovrin va ball, muddat (48 soatdan kam bo'lsa
  qizil), taxminiy vaqt, qatnashchilar soni, talabaning holati. Batafsil sahifa: topshiriq, materiallar,
  topshiriladigan narsalar ro'yxati, baholash mezoni, muddatlar, savol-javob; o'ngda yopishqoq kartochka
  (tugma, holat, 1-2-3 sovrinlar). Holatlar: Qatnashish → Topshirildi (muddatgacha tahrirlanadi) →
  Baholanmoqda → Natija (ball, izoh, o'rin). Natijalar profilga "korxona tasdiqlagan" bo'lib tushadi.
- **Profil.** 4:1 muqova, ustiga chiqqan avatar, ism ✓, sarlavha, universitet · fakultet · kurs, "Ishga tayyor"
  belgisi. Instagram kabi hisoblagichlar: Topshiriqlar / G'alabalar / Ball / Sertifikatlar. Tablar: Portfolio
  (4:3 setka, kompyuterda 3, telefonda 2 ustun), Haqida, Yutuqlar. Uch ishonch darajasi: universitet tasdiqlagan
  (qulflangan), korxona tasdiqlagan (tizim yaratadi), o'zi kiritgan (belgisiz). Ko'nikma yonida dalil:
  "3 ta topshiriqda isbotlangan". To'liqlik halqasi faqat egasiga ko'rinadi, ~35% dan boshlanadi (endowed progress:
  34% vs 19%).

## 4. Bosqichlar

### 1-bosqich (bajarildi, 2026-11-17)

Backend:
- `catalog.JOB_FIELDS` (23 ta kasb yo'nalishi), `/catalog` da `job_fields`.
- Yangi ustunlar: `users.job_fields`, `jobs.job_fields`, `universities.faculties` (`core/upgrades.py`).
- `signup_missing`: trek o'rniga `job_fields`, `job_types`, `city` (viloyatlar ro'yxatidan); trek faqat mentorlar uchun.
- `completeness`: `track` o'rniga `job_fields`.
- `match_score` ochiq formula: ko'nikma 45 + kasb yo'nalishi 30 (trek ham hisoblanadi) + ish turi 15 + tarmoq 10;
  bo'sh tomon yarim ball.
- `seed_catalog.py`: 206 ta OTM va 30 ta universitet fakultetlari; seed faqat yetishmaganini qo'shadi va bo'sh
  fakultet ro'yxatini to'ldiradi (xodim tahrirlaganini bosmaydi). TDPU → O'zMPU nomi alias sifatida.
- Fakultetlarni tahrirlash: `PATCH /university/profile` va `PATCH /admin/universities/{id}` (`clean_faculties`).
- Dashboard: 6 ta tavsiya, `verified_tasks`.
- Korxonaning universitetlar ro'yxatida hamkorlari doim birinchi (200+ universitetda ham ko'rinadi).
- `tests/conftest.py`: baza nomida "test" bo'lmasa, avtomatik `careerflow_test` ga o'tadi (oldin konteynerda dev
  bazaga ulanardi).
- Testlar: `tests/test_student_panel2.py`, yangilangan sign-up testlari.

Frontend:
- `screens/student/StudentSignup.tsx`: 3 qadamli ro'yxatdan o'tish (qoralama qurilmada saqlanadi, eski
  foydalanuvchi yetishmagan maydon turgan qadamdan boshlaydi).
- `screens/student/Combo.tsx`: qidiruvli tanlov (kirill/lotin, aliaslar, klaviatura).
- Yangi sidebar (Asosiy / Men guruhlari), keng layout (`Shell wide`), sidebar'dagi ism profilni ochadi.
- `StudentHome.tsx`: yashil hero (qidiruv, tezkor filtrlar, ball/seriya/o'rin), "Keyingi qadam", 4 ta statistika,
  mos vakansiyalar setkasi, ochiq topshiriqlar (muddat bilan), o'ng ustunda profil halqasi, suhbatlar, arizalar.
- `TasksHub.tsx`: Korxona topshiriqlari / Haftalik dastur (trek tanlash shu yerda) / Boshqalarni tekshirish.
- Vakansiyalar va Arizalarim alohida bo'limlar; kartochkalar setkada.
- Korxona vakansiya formasida "Kasb yo'nalishi (1–3)"; universitet profilida va admin panelida fakultetlar.
- Matnlar: `locales/parts/student2.ts` (uz/ru/en).

### 2-bosqich: Profil va portfolio (bajarildi, 2026-11-17)

Qilingani: `portfolio_items` jadvali (loyiha, sertifikat), tajriba = `employment_outcomes` (+ `ended_on`, `description`,
`PATCH /me/outcomes/{id}`), profil rasmi va muqova (`PUT /me/photo`, `PUT /me/cover`, brauzerda kesish: 512×512 va
1584×396), rasmlar `/api/v1/media/{id}?s=` imzoli doimiy havola bilan, `users.portfolio_n` (har ishga tushishda qayta
sanaladi), yangi completeness (13 band, ro'yxatdan o'tgach ~46%), CV sahifasi va PDF'da tajriba/loyiha/sertifikat,
korxonaning talaba kartochkasida portfolio va ishonch belgilari, "Sozlamalar" alohida bo'lim (sidebar pastida),
`tests/conftest.py` sxemani `DROP SCHEMA` bilan tozalaydi. Testlar: `tests/test_student_panel2.py`.

Dastlabki reja:

- Backend: `profile_items` jadvali (turi: experience / project / certificate; sarlavha, tashkilot, sana oralig'i,
  tavsif, havola, fayllar, rasmlar, `source`: self / company / platform, `confirmed_by`). Tajriba `EmploymentOutcome`
  bilan birlashtiriladi (bir ish ikki marta kiritilmaydi; bandlik statistikasi faqat 4 turni sanaydi).
  Profil rasmi va muqova yuklash (`files`, rasm turlari, o'lcham chegarasi). TalantGo'da tasdiqlangan ishlar va
  korxona topshiriqlari natijalari avtomatik "platforma tasdiqlagan" portfolio elementi bo'lib chiqadi.
- Frontend: LinkedIn uslubidagi sarlavha (muqova 4:1, avatar, ism ✓, sarlavha, "Ishga tayyor"), hisoblagichlar,
  tablar: Portfolio (setka) / Tajriba / Sertifikatlar / Haqida (bio, ko'nikmalar dalil bilan, tillar darajasi,
  havolalar). Har bir element uchun qo'shish/tahrirlash oynasi. Talabalik tasdig'i bloki shu yerda.
- "Sozlamalar" alohida bo'lim: telefon, kirish usullari, maxfiylik (korxonalarga ko'rinish, raqam ko'rinishi),
  til, CV ochiq/yopiq, PDF.
- Korxona tomoni: ariza kartochkasi va ochiq CV'da portfolio, ishonch belgilari bilan.
- Completeness qayta hisoblanadi (rasm, bio, 3 ko'nikma, 1 portfolio, tajriba yoki sertifikat, tasdiq).

### 3-bosqich: Topshiriqlar, Arizalar, Xabarlar, Tadbirlar, qolganlari

- Topshiriqlar: filtrlar (Ochiq / Men qatnashayotgan / Natijalar), kartochka (muddat, sovrin, ball, qatnashchilar),
  batafsil sahifa + yopishqoq o'ng kartochka, "Qatnashaman", topshirish (fayl + havola + izoh, muddatgacha
  tahrirlash), natija va g'oliblar galereyasi. Backend: `ChallengeEntry` fayllari, qatnashish holati.
- Arizalarim: holatlar bo'yicha kanban/ro'yxat, suhbat kalendari, testlar, bog'lanish so'rovlari.
- Xabarlar: talaba ↔ korxona chat (faqat ariza yoki qabul qilingan bog'lanish so'rovidan keyin), universitet
  e'lonlari; korxona panelida ham chat.
- Tadbirlar: universitet va korxona tadbirlari, ro'yxatdan o'tish; korxona paneliga tadbir yaratish.
- Vakansiyalar: chap filtr paneli, saralash, saqlash; Universitetim va Hamjamiyat keng layoutda.

## 5. Qabul mezonlari (har bosqich)

- `npx tsc --noEmit`, `vite build`, to'liq pytest (alohida test bazasida) o'tadi.
- Brauzerda 1440, 1280 va 375 px: gorizontal scroll yo'q, konsolda xato yo'q, bo'sh holatlarda tugma bor.
- uz/ru/en matnlari to'liq (type tekshiruvi).
- Hech narsa commit yoki deploy qilinmaydi, foydalanuvchi aytmaguncha.
