# Faza 1: yakuniy reja (2026-10-26)

Foydalanuvchi 2026-10-26 da "savol bo'lmasa, reja asosida boshla" dedi. Shuning uchun `05-faza0-audit.md`
10-bo'limidagi tavsiyalar qabul qilindi. Ish `uch-panel` branchida, `main` jonli saytdagi holat bo'lib qoladi.
Deploy faqat foydalanuvchi ruxsati bilan.

## 1. Qabul qilingan qarorlar

| # | Qaror |
|---|---|
| Q1 | `users.visible_to_employers` (standart: yoqilgan). Korxona ro'yxatida faqat rozilik v2 + shu belgi yoqilgan talabalar. Telegram username va telefon faqat ariza yoki qabul qilingan kontaktdan keyin. `/employer/talent` ham shu qoidaga bo'ysunadi |
| Q2 | i18n asosi hozir (`t()` + uz/ru/en lug'atlar). Yangi ekranlar 3 tilda, eski ekranlar Faza 6 da |
| Q3 | Korxona vazifalari Faza 3 oxirida |
| Q4 | Universitet ro'yxatida o'zini shu universitetga belgilagan hamma, statistika va reytingda faqat tasdiqlanganlar |
| Q5 | Bandlik manbalari: ariza `hired` (avtomatik), korxona tasdig'i, talaba o'zi aytgani ("tasdiqlanmagan", reytingga kirmaydi) |
| Q6 | Admin rollari: owner, admin, moderator, analyst. Foydalanuvchi parolini tiklash faqat owner |
| Q7 | Har faza tugagach, ruxsat bilan, staging testidan keyin deploy |
| Q8 | ishGO (`ishgo-vakansiyalar-namuna.png`) va Career EDU (`career-edu-talaba-namuna.webp`) namunalari olindi |
| Q9 (2026-10-26) | Universitet statistikasi va reytingi hozircha faqat ishga joylashgan va amaliyotga borgan talabalar soni bilan hisoblanadi, sifat mezonlari (mutaxassislikka moslik, ish beruvchi bahosi) bilan emas. Bandlik = tasdiqlangan ish yoki amaliyoti bor tasdiqlangan talabalar / tasdiqlangan talabalar (bitiruvchilar emas, hamma talaba); har talaba bir marta, eng kuchli natija bo'yicha |

## 2. URL xaritasi

Ochiq (kirmasdan): `/` bosh sahifa · `/vakansiyalar`, `/vakansiyalar/:id` · `/korxonalar`, `/korxonalar/:id` ·
`/sohalar`, `/sohalar/:slug` · `/universitetlar`, `/universitetlar/:id` · `/kirish/talaba`, `/kirish/korxona`,
`/kirish/universitet`.

Panellar (kirgandan keyin, rolga qarab):
- Talaba: `/talaba` (Dashboard), `/talaba/yol`, `/talaba/vakansiyalar`, `/talaba/arizalar`, `/talaba/tekshirish`,
  `/talaba/hamjamiyat`, `/talaba/universitetim`, `/talaba/profil`.
- Korxona: `/korxona` (Dashboard), `/korxona/nomzodlar`, `/korxona/vakansiyalar`, `/korxona/talabalar`,
  `/korxona/testlar`, `/korxona/universitetlar`, `/korxona/guruhlar`, `/korxona/profil`.
- Universitet: `/universitet` (Dashboard), `/universitet/talabalar`, `/universitet/tasdiqlash`,
  `/universitet/bandlik`, `/universitet/hamkorlar`, `/universitet/guruhlar`, `/universitet/profil`.
- Admin: `/admin#...` o'zgarmaydi.

Kirgan foydalanuvchi `/` ga kelsa o'z paneliga o'tadi. Telegram Mini App ham shunday. Boshqa rolning paneliga
kirsa, o'z paneliga qaytariladi. Ochiq sahifalar hamma uchun ochiq.

## 3. Ariza holatlari

`new` Yuborildi → `viewed` Ko'rib chiqilmoqda → `shortlisted` Saralandi → `interview` Suhbat → `offer` Taklif →
`hired` Ishga olindi; `rejected` Rad etildi; `withdrawn` Qaytarib olindi.

| Kimdan | Korxona o'tkaza oladi |
|---|---|
| new, viewed | viewed, shortlisted, interview, offer, hired, rejected |
| shortlisted | interview, offer, hired, rejected |
| interview | interview (qayta belgilash), offer, hired, rejected |
| offer | hired, rejected |
| rejected | shortlisted (qayta ko'rib chiqish) |
| hired, withdrawn | hech qaysi |

Talaba: new, viewed, shortlisted, interview, offer holatidan `withdrawn` ga. `withdrawn` dan qayta ariza
berish mumkin (holat `new` ga qaytadi). Har o'tish `application_events` ga yoziladi. Yopilgan vakansiyada ham
korxona holatni o'zgartira oladi (nomzodlar bilan ish davom etadi), lekin yangi ariza qabul qilinmaydi.

## 4. Migratsiyalar (Faza 2)

- `applications`: `interview_at timestamptz`, `interview_place varchar(300)`;
  `application_status_valid` cheklovi yangi holatlar bilan qayta yaratiladi. (Qaytarib olingan vaqt
  `application_events` da saqlanadi, alohida ustun kerak bo'lmadi.)
- Yangi jadval `application_events` (application_id, from_status, to_status, actor, actor_user_id, note, created_at).
- Yangi jadval `notifications` (user_id, kind, text, link, params JSONB, created_at, read_at).
- `users`: `language varchar(5) default 'uz'`, `visible_to_employers boolean default true`.
- `admin_accounts.role` kengaytmasi (moderator, analyst) Faza 5 ga ko'chirildi: o'sha yerda ishlatiladi.

## 5. Faza 2 vazifalari va qabul mezonlari

Backend:
1. Ariza holatlari, o'tish qoidalari, tarix, suhbat maydonlari, qaytarib olish o'chirmaydi.
2. Sayt ichida bildirishnomalar: jadval, `inbox.push()` (bazaga yozadi + Telegram), `/me/notifications`
   endpointlari. Ariza, tasdiqlash, kompaniya, vakansiya, kontakt, test, universitet xodimi xabarlari unga o'tadi.
3. `language` va `visible_to_employers` (PATCH /me).
4. Xavfsizlik: X4 (ko'rinish), X5 (universitet yaratish), X6 (reyting roziligi), X7 (mentor javobi), X8 (yopilganni
   tasdiqlash), X9 (parol tiklash owner'da), X10 (rate limitlar).
5. Testlar: har bir yangi qoida uchun, eski 86 test o'tishi shart.

Frontend:
1. Kichik router (History API) + `Link`. Mavjud ekranlar URL'ga ulanadi, "Orqaga" ishlaydi.
2. i18n: `t()`, `uz/ru/en` lug'atlari, til tanlagich, til `users.language` va localStorage da.
3. Shell: bildirishnoma qo'ng'irog'i (o'qilmaganlar soni) va ro'yxati, til tanlagich.
4. Ariza holatlari: talaba va korxona ekranlarida yangi holatlar, suhbat vaqti va joyi.
5. Profil: "Korxonalarga ko'rinaman" tugmasi.

Qabul: barcha testlar o'tadi, type check va build o'tadi, Telegram Mini App kirishi ishlaydi, eski URL
(`?join`, `?role`) ishlaydi, lokal brauzerda uch rol bilan tekshirilgan.
