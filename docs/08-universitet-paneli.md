# Universitet paneli: tahlil va ish prompti (2026-11-17)

Foydalanuvchi so'rovi: universitet panelini ro'yxatdan o'tishdan boshlab to'liq qayta ishlash; kutish oynasi
qiziqarli bo'lsin; paneldagi bo'sh joylar to'lsin, moslashuvchan bo'lsin; har bir sidebar bo'limi tahlil
qilinib to'ldirilsin; adminga bog'lanadigan joylar bog'lansin; talabalarni qulay filtrlash va saralash.
Namuna: `~/Downloads/Telegram Desktop/TalantGo_ universitet ro'yxatdan o'tishi.html` (3 qadamli forma).
Korxona panelini boshqa sessiya qilmoqda (bir xil papkada): umumiy fayllarga faqat nuqtali o'zgarish.

## 1. Hozirgi holat (kod bo'yicha)

| Joy | Bor | Muammo |
|---|---|---|
| Ro'yxatdan o'tish (`Welcome.tsx` StaffForm) | universitet, lavozim matni, rozilik | telefon, hujjat, "ro'yxatda yo'q universitet", hamkorlik yo'nalishlari, kanallar yo'q; admin faqat ism+lavozimni ko'radi |
| Kutish (`PendingScreen`, korxona bilan umumiy) | "Tekshirilmoqda" kartasi | quruq; holatlar (ma'lumot kerak, rad etildi sababi) yo'q; kutish vaqtida foydali ish yo'q |
| Shell | `.app` max 820px | katta ekranda yarmi bo'sh |
| Ko'rsatkichlar | 3 raqam, 5 progress, ro'yxatlar | harakat talab qiladigan ishlar, grafik, fakultet jadvali, onboarding yo'q |
| Talabalar / Tasdiqlash | qidiruv + karta ro'yxati | fakultet/kurs/guruh/holat/faollik filtri, saralash, jadval, talaba kartasi, ommaviy tasdiqlash, rad sababi shablonlari yo'q |
| Bandlik | yaxshi asos (ulush, top ish beruvchi, yozuvlar) | tor, yozuvlarda filtr yo'q |
| Hamkorlar | so'rovlar ro'yxati, 60 kompaniyadan select | kompaniya katalogi, qidiruv, statistikasi yo'q |
| Imkoniyatlar | vakansiya + tavsiya | filtr yo'q, tavsiya hammaga ketadi (fakultet/kurs tanlab bo'lmaydi) |
| Profil | tavsif, sayt, shahar, viloyat | logo, kontaktlar, Telegram, rasmiy talabalar soni, memorandum, jamoa yo'q |
| Guruhlar | umumiy guruh chati | o'z talabalariga e'lon yuborish yo'q |

## 2. O'xshash platformalar

- **Handshake (career services):** filtrlanadigan First Destination dashboardlari (yil, fakultet, yo'nalish),
  talabalarni segmentlash va segmentga xabar, tadbirlar va yarmarkalar, ish beruvchilar bazasi, NACE hisobot.
- **Symplicity CSM, 12twenty:** ish beruvchilar bilan munosabat (kontakt, tarix, izoh bir joyda), tadbirlar,
  natijalarni bitta hisobot mexanizmida bog'lash, bir tugmada eksport.
- **Mahalliy:** HEMIS (talaba ID manbai), career.edu.uz, PF-209 (dual ta'lim).

Xulosa: universitetga 5 narsa kerak: (1) o'z talabalarini tez topish va segmentlash, (2) talabalikni tez
tasdiqlash, (3) bandlikni ishonchli raqamda ko'rish va rahbariyatga hisobot berish, (4) korxonalar bilan
hamkorlik va imkoniyatlarni talabalarga yetkazish, (5) talabalarga xabar va tadbirlar.

## 3. Foydalanuvchi qarorlari (2026-11-17)

1. Yangi imkoniyatlar: **Talabalarga xabar, Jamoa, Hisobotlar, Tadbirlar** — o'xshashlari birlashtiriladi,
   sidebar ko'paymasin.
2. Bir universitetning keyingi xodimlarini **universitet rahbari** tasdiqlaydi; admin hammasini ko'radi va bekor qila oladi.
3. Email/SMS kod **hozircha yo'q**: hisob mavjud kirish orqali, telefon kiritiladi, admin qo'ng'iroq qiladi.

## 4. Yangi sidebar (8 bo'lim, guruhlangan)

| Guruh | Bo'lim | Ichida |
|---|---|---|
| — | Ko'rsatkichlar | salomlashuv, KPI, "Diqqat talab qiladi", onboarding, fakultetlar jadvali, faollik, yaqin tadbirlar |
| Talabalar | Talabalar | jadval + filtrlar + talaba kartasi; "Tasdiqlash navbati" tabi (badge) — eski Tasdiqlash shu yerga |
| Talabalar | Bandlik va hisobotlar | statistika, ish joyi yozuvlari, **Hisobotlar** tabi (CSV/chop etish) |
| Korxonalar | Hamkorlar | hamkorlar / kelgan / yuborilgan, kompaniyalar katalogi |
| Korxonalar | Imkoniyatlar | vakansiyalar filtri, tavsiya (fakultet/kurs bo'yicha) |
| Korxonalar | Tadbirlar | karyera kuni, yarmarka, hakaton: yaratish, ro'yxatdan o'tganlar |
| Universitet | Xabarlar | **E'lonlar** (filtrlangan talabalarga) + Guruhlar |
| Universitet | Profil va jamoa | profil, logo, kontaktlar, ochiq sahifa ko'rinishi, **Jamoa**, talabalar uchun taklif havolasi |

Eski URL'lar ishlashda davom etadi: `/universitet/tasdiqlash` → Talabalar (navbat), `/universitet/guruhlar` → Xabarlar.

## 5. Ro'yxatdan o'tish va kutish

- 3 qadam: (1) Hisob — kirgan hisob ✓; (2) Universitet va mas'ul shaxs: universitet (qidiruvli; "ro'yxatda yo'q"
  → nomi + viloyat, admin tasdiqlaganda faollashadi), ism, lavozim (ro'yxat + "boshqa"), bo'lim/fakultet,
  ish telefoni, ish emaili, **lavozim hujjati (majburiy)**, hamkorlik yo'nalishlari (kamida 1), memorandum
  (ixtiyoriy), sayt/Telegram/boshqa tarmoq, 2 majburiy + 1 ixtiyoriy rozilik; (3) Holat.
- Holatlar: `pending`, `needs_info` (admin izoh bilan qaytaradi), `rejected` (sabab bilan), `approved`.
- Kutish ekrani: jonli taymlayn (yuborildi → tekshirilmoqda → qaror), har bosqichda nima bo'layotgani,
  "kutish paytida": talabalarga taklif havolasi (QR o'rniga nusxa olish), universitetingizdan platformadagi
  talabalar soni, tasdiqdan keyin ochiladigan imkoniyatlar (qulf bilan), tayyorlab qo'yish ro'yxati.
- Hamkasb (universitetda allaqachon rahbar bor): so'rov rahbarga boradi, ekranda shu aytiladi.

## 6. Backend (API)

- `users`: `staff_role` (lead/member), `staff_department`, `staff_work_email`, `staff_doc_id`,
  `staff_cooperation[]`, `staff_review_note`, `staff_submitted_at`, `staff_reviewed_at`.
- `universities`: `logo_file_id`, `telegram`, `social`, `email`, `phone`, `address`, `students_total`,
  `mou_file_id`, `cooperation[]`, `show_as_partner`, `founded_year`.
- Yangi jadvallar: `university_announcements`, `university_events`, `event_registrations`.
- `/me/staff-request` (kengaytirilgan, qayta yuborish ham), `/admin/staff` (to'liq ma'lumot, hujjat havolasi),
  `/admin/staff/{id}/review` (approve / needs_info / reject + izoh; yangi universitetni faollashtiradi).
- `/university/team*` (rahbar: tasdiqlash, rad, kirishni olish, rahbarlik berish).
- `/university/roster` (filtrlar: q, faculty, course, group, verification, track, open_to_work, cv_public,
  activity, graduation_year, applied, hired; saralash; sahifalash) + `/roster/facets`, `/students/{id}`,
  `/verifications/bulk`, `/export.csv` (shu filtrlar bilan), `/faculties`, `/companies` (katalog),
  `/announcements`, `/events*`, `/me/university/events*` (talaba tomoni), `/public/universities/{id}/logo`.
- Maxfiylik: universitet faqat o'z talabalarini ko'radi; e'lon va tadbir faqat o'z talabalariga; rate limit.

## 7. Tekshiruv

- pytest (alohida `careerflow_test_uni` bazasi), yangi testlar `test_university_panel2.py`.
- `tsc` + vite build; brauzerda har 8 bo'lim desktop (1280) va telefon (375) kengligida.

## 8. Natija (2026-11-17, commit qilinmagan)

- Backend: `services/staff.py` (so'rov, rahbar/xodim, qaror, kirishni olish), `api/university.py` (dashboard v2,
  `/roster` + `/roster/facets`, talaba kartasi, ommaviy tasdiqlash, filtrli CSV, fakultetlar, katalog, jamoa, profil
  v2, logo), `api/uni_comms.py` (e'lonlar, tadbirlar, talaba tomoni `/me/university/*`), `admin.py` `/staff*`.
  Testlar: `tests/test_university_panel2.py` (9 ta); universitet testlari 25/25, to'liq to'plam 131/131 o'tgan.
- Frontend: `screens/university/*` (uapi, ukit, uni.css, UniSignup, UniPending, UniversityApp va 8 bo'lim,
  AdminStaffQueue, StudentUniFeed), matnlar `locales/parts/university*.ts` (uz/ru/en, 592 kalit).
- Testlar alohida bazada: `DATABASE_URL=...careerflow_test_uni` (korxona sessiyasi bilan to'qnashmaslik uchun).
- Lokal demo ma'lumot (faqat dev baza): TDIU rahbari `telegram_id=990001`, kutayotgan hamkasb `990002`,
  32 talaba `991000–991031`, TATU test xodimi `990010`.
- Qolgan ishlar: serverga deploy (alohida ruxsat bilan), eski `api.university` bloki api.ts'da ishlatilmaydi.
