# Talaba paneli: chuqur tekshiruv va tuzatish rejasi

Sana: 2026-11-19. Branch: `uch-panel`. Bu hujjat talaba qismini to'liq tekshirish natijasi va o'zimga yozilgan ish prompti.

## 1. Prompt (o'zimga)

> O'zingni Careerup loyiha menejeri deb tasavvur qil. Talaba qismini boshidan oxirigacha tekshir: ro'yxatdan
> o'tish, profil, vakansiyalar, arizalar, testlar, topshiriqlar, xabarlar, tadbirlar, universitet, hamjamiyat,
> bildirishnomalar va bot. Har bir bog'lanishni tekshir: korxona yoki universitet biror narsa qilsa, talaba uni
> to'g'ri joyda ko'radimi, bildirishnoma to'g'ri sahifani ochadimi. 2026-11-17 dan beri trek ixtiyoriy. Shuning
> uchun trekka bog'langan har bir mantiqni topib, kasb yo'nalishlariga (job_fields) o'tkaz. Foydalanuvchi aytgan
> 5 ta muammoni birinchi tuzat. Keyin topilgan kamchiliklarni muhimligi bo'yicha tuzat: kompyuter (1280–1440 px)
> va telefon (360–375 px), uz/ru/en. Har bir backend o'zgarishiga test yoz. Boshqa sessiyalar (korxona,
> bildirishnomalar) bilan bitta checkout'da ishlayotganing uchun ularning fayllariga faqat kichik, nuqtali
> o'zgartirish kirit va ularni commit qilma.

## 2. Foydalanuvchi aytgan muammolar (2026-11-19)

| # | Muammo | Sabab (topildi) |
|---|---|---|
| 1 | Profilni tahrirlash bo'limlari yo'q | Tahrirlash bor, lekin 4-yorliq «Haqida»da kichik qalamchalar ortida. Sarlavhada «Tahrirlash» tugmasi yo'q. Telefonda yorliq ekrandan chiqib ketadi |
| 2 | Fakultetlar | 206 tadan faqat 30 tasida ro'yxat bor. Profilda fakultet oddiy matn (ro'yxatdan o'tishdagi tanlov emas). 176 ta universitetda hudud yo'q, qisqa nomi 40 belgida kesilgan va filiallarda bir xil (masalan, 3 ta «Toshkent axborot texnologiyalari») |
| 3 | Ism-familiya avatari rangi | Hammasi bir xil yashil. Endi rang ismdan avtomatik tanlanadi (`nameTone`), har kim har joyda bitta rangda |
| 4 | Admin tasdiqlagan korxona testi talabaga ko'rinmaydi | Testlar faqat «Arizalarim → Testlar»da. Bildirishnoma «Vakansiyalar → Testlar»ga yuboradi (u yerda yo'q). Treki yo'q talabaga e'lon bormaydi. «Yo'nalish bo'yicha» testlar treki yo'q talabaga ko'rinmaydi |
| 5 | Rad etilgandan keyin ish kartasi yopilmaydi | Baholangan ish ham to'liq forma bilan «Hammasi»da qoladi. Endi yig'iladi va o'z bo'limiga (Qabul qilingan / Rad etilgan) o'tadi; ro'yxat «Baholanmagan»dan ochiladi; rad etishda izoh majburiy |

## 2a. Qarorlar (2026-11-19)

| Savol | Qaror |
|---|---|
| Rad etilgan ish | Muddat tugaguncha tuzatib qayta yuboriladi; korxona izohi saqlanadi |
| «Yo'nalish» auditoriyasi | Kasb yo'nalishi (job_fields) bo'yicha; eski trekli testlar ishlayveradi |
| Fakultetlar | Qolgan 176 universitet uchun internetdan yig'ildi (5 agent) |
| Profil | LinkedIn kabi bitta sahifa, tepada «Profilni tahrirlash» |
| Testlar joyi | «Topshiriqlar → Testlar» (`/talaba/topshiriqlar/testlar`), Arizalarim'dan ko'chdi |

## 3. Topilgan kamchiliklar va vazifalar

### P0: foydalanuvchi aytganlar

- [x] Korxona: ish kartasi baholangach yig'iladi, «Baholanmagan»dan chiqib o'z bo'limiga o'tadi, «Qarorni o'zgartirish»; talabaning fakulteti, kursi, rasmi va fayl nomlari ko'rinadi.
- [x] Talaba «Topshiriqlar»: o'z ishlari «Tekshiruvda / Qabul qilingan / Rad etilgan» bo'limlarida.
- [x] Avatar ranglari: `initials()` + `nameTone()` ui.tsx'da. Qolgan joylarga ham qo'llash (profil, sidebar, chat, korxona ro'yxatlari, vakansiya kartalari).
- [x] Testlar: e'lon hamma mos talabaga (trek filtrisiz), havola `/talaba/arizalar/testlar`, «Topshiriqlar»da «Testlar» bo'limi, bosh sahifada ochiq test kartasi, matnlar yangilanadi.
- [x] Profil: sarlavhada «Profilni tahrirlash», bo'limlar ko'rinadigan joyda; fakultet ro'yxatdan o'tishdagidek tanlanadi; universitet qo'shish; telefon ko'rinadi; havolalar kengayadi (Telegram, Behance/Dribbble, sayt).
- [ ] Universitetlar: qisqa nomlar va hududlar tuzatiladi; fakultetlar katalogi kengaytiriladi.

### P1: trek ixtiyoriy bo'lgani ta'siri (backend)

- [x] Korxona test/vazifasi «yo'nalish» auditoriyasi kasb yo'nalishlariga o'tadi (yoki treksizga ham ko'rinadi).
- [x] `reminders.unfinished_signup` → `career.signup_missing()` (hozir ro'yxatdan o'tgan talabaga «yakunlanmadi» deb yozadi); dushanba eslatmasi treksizlarga ham.
- [x] Hamjamiyat → Tengdoshlar: trek yo'q bo'lsa kasb yo'nalishi bo'yicha.
- [x] Reyting «Yo'nalish» bo'limi treksizlarda yashiriladi.
- [x] `match_score`: trek bilan berilgan vakansiyada treksiz talabaga yarim ball.
- [x] Bot tavsifi va eslatma matnlari «yo'nalish tanla» o'rniga yangi oqim.

### P1: bildirishnomalar va bog'lanishlar

- [x] `test_new`, `test_graded` → `/talaba/arizalar/testlar`.
- [x] `challenge_result`: korxona nomi, ball va rad etish sababi matnda; havola aniq topshiriqqa (`/talaba/topshiriqlar?id=`).
- [x] Tajriba tasdig'i (`outcome_review`) → `/talaba/profil`; universitet tadbiri → `/talaba/tadbirlar`.
- [x] Peer review Telegram xabari tugmasi `/talaba/tekshirish`.
- [ ] Korxona tadbirlari haqida talabalarga xabar (`notify` hozir ishlamaydi).

### P2: o'lik joylar va UX

- [x] Bosh sahifa: «Dasturni tanlash» haftalik dasturni ochadi; qidiruv va tavsiya qilingan vakansiyalar panel ichida ochiladi; «Suhbatlar» plitkasi suhbat bosqichini tanlaydi.
- [x] `/talaba/vakansiyalar/saqlangan` saqlanganlarni ochadi; topshiriq va testga to'g'ridan-to'g'ri havola.
- [x] Rad etilgan ishni muddat tugaguncha tuzatib qayta yuborish (qaror: ha, 2026-11-19).
- [x] Talaba topshirig'ida yuklangan fayllar nomi bilan ochiladi va olib tashlanadi.
- [x] Test ishlash: orqaga tugmasi, sana formati, bo'sh holatda keyingi qadam.
- [x] Telefon: pastki menyuda Xabarlar; tepada profil; yorliqlar ko'rinib turadi (o'raladi); chat `dvh`; test taymeri va yuborish paneli menyu ostida qolmaydi.
- [x] Tajriba: korxona nomi va turini tahrirlash (o'zi kiritgan, tasdiqlanmagan yozuvlar).

### P2: xatolar va xavfsizlik

- [x] Topshiriq natijalari (ism + ball) faqat talabalarga; boshqa korxonalarga ko'rinmaydi.
- [x] O'rin boshqaga o'tganda 30 kunlik ball chegarasi chetlab o'tilmaydi.
- [x] `gpa_scale` alohida o'zgarsa 500 xato.
- [ ] Test yopilgan yoki muddati o'tgandan keyin boshlangan urinishni topshirib bo'lmaydi.
- [x] Vakansiya muddati va tadbir sanasi Toshkent vaqtida.
- [x] Korxona tasdig'i olib tashlansa, uning topshiriqlari ham yashiriladi.

### P3: keyinroq (taklif)

Talaba korxona yoki vakansiya ustidan shikoyat qila olishi; vakansiyada korxona profiliga havola; qabul qilingan
bog'lanish so'rovlari ro'yxati; Profil va Sozlamalardagi takroriy ko'rinish tugmalari; ishlatilmaydigan
`Challenges.tsx`.

## 4. Qabul mezonlari

- Foydalanuvchi aytgan 5 muammo brauzerda qayta tekshirilgan (kompyuter va telefon, uz/ru/en).
- Treki yo'q yangi talaba: korxona testi va vazifasini ko'radi, e'lon oladi, Tengdoshlar bo'sh emas.
- Har bir bildirishnoma havolasi mavjud sahifani ochadi.
- `tsc`, `vite build`, backend testlari (alohida test bazada) o'tadi; yangi testlar qo'shilgan.
