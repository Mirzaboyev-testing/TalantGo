# 15. Bildirishnomalar va parol tiklash (2026-11-19)

## Tahlil: nima bor edi

- **Talaba, korxona, universitet:** har bir muhim hodisa ilovadagi qo'ng'iroqchaga yoziladi (`notifications` jadvali).
  Telegram ulangan bo'lsa, botga nusxasi boradi (`services/inbox.py` → `services/notify.py`). Havolalarning hammasi
  to'g'ri bo'limga olib boradi.
- **Admin sayti:** qo'ng'iroqcha yo'q edi, faqat menyudagi son bor edi. Botdagi admin xabarlari eski
  `User.role=admin / is_owner` bo'yicha yuborilardi. Bunday rolni endi hech kim olmaydi, admin hisoblari esa
  Telegram'ga bog'lanmagan. Natijada yangi korxona, vakansiya, test, universitet xodimi haqidagi xabarlar
  **hech kimga bormasdi**. Shikoyatlar va yangi admin so'rovlari haqida umuman xabar yo'q edi.
- **Parol:** "Parolni unutdim" yo'q edi. Owner vaqtinchalik parol berardi, lekin foydalanuvchiga xabar bormasdi,
  eski sessiyalar 7 kun ishlayverardi va yangi parol qo'yish majburiy emasdi. Parolni o'zgartirish boshqa
  qurilmalardagi kirishlarni yopmasdi.
- **Spam:** chatdagi har bir xabar uchun alohida qo'ng'iroqcha qatori va Telegram xabari bor edi. Har bir topshirilgan
  ish haqida yo'nalishdagi barcha talabalarga Telegram borardi.
- **Xatolar:** ro'yxatdan o'tishni tugatgan, lekin yo'nalish tanlamagan talabaga "ro'yxatdan o'tish yakunlanmadi"
  eslatmasi borardi. Dushanba eslatmasi yo'nalishsiz talabalarga bormasdi.
- **Til:** Telegram xabari doim o'zbekcha. Admin e'lonlari faqat Telegram'i bor talabalarga boradi.

## 1-bosqich: qilingan ishlar

### Admin qo'ng'iroqchasi (`services/admin_inbox.py`, `admin_notifications`)
Xabar kimga borishi admin ruxsatlariga qarab tanlanadi (`admin_access.effective`). Owner hammasini oladi.

| Hodisa | Ruxsat | Havola |
|---|---|---|
| Yangi korxona, qayta yuborilgan yoki o'zgargan korxona | companies | queue |
| Yangi vakansiya | jobs | queue |
| Yangi yoki qayta yuborilgan test | tests | tests |
| Universitet xodimi so'rovi | universities | queue |
| Tasdiqlangan xodimi yo'q universitet talabasining tasdiq so'rovi | students | queue |
| Shikoyat | complaints | complaints |
| Yangi admin hisobi so'rovi | faqat owner | accounts |
| Parol tiklash so'rovi | faqat owner | users / accounts |

- Admin saytida qo'ng'iroqcha bor: o'qilmaganlar soni, ro'yxat, "hammasini o'qilgan qilish".
  Har bir xabar kerakli sahifani ochadi.
- Menyuda qo'shimcha sonlar ko'rinadi: shikoyatlar va (owner uchun) parol so'rovlari.
- Botga nusxa hozircha eski `is_owner/role=admin` Telegram foydalanuvchilariga boradi, ilgarigidek.
  Admin hisobini Telegram'ga ulash 3-bosqichda.

### Parol tiklash (`services/password_reset.py`)
1. Kirish sahifasida **"Parolni unutdingizmi?"** tugmasi bor. Foydalanuvchi email yozadi. Akkauntga Telegram ulangan
   bo'lsa, bot 6 xonali kod va havola yuboradi (15 daqiqa amal qiladi, 5 marta xato kiritish mumkin).
   Saytning javobi har doim bir xil, shuning uchun email bor-yo'qligi oshkor bo'lmaydi.
2. **Botda `/parol`** buyrug'i xuddi shu kodni va havolani yuboradi. Havola `/parol-tiklash?t=...` sahifasini ochadi.
   Emaili yo'q akkaunt (masalan, Telegram orqali kirgan korxona yoki universitet xodimi) shu yerda email va parol
   qo'yadi. Shundan keyin kompyuterda saytga kira oladi, Mini App kerak emas.
3. **Telegram ulanmagan bo'lsa,** "Admindan yordam so'rash" formasi bor (ism, telefon, izoh). So'rov owner'ning
   qo'ng'iroqchasiga tushadi. Owner "Talabalar va mentorlar" bo'limida yozilgan ma'lumotni platformadagi bilan
   solishtiradi, telefon qiladi va "Parolni tiklash" ni bosadi.
4. Vaqtinchalik parol bilan kirgan foydalanuvchiga istalgan panelda avval **yangi parol qo'yish ekrani** chiqadi.
5. Parol o'zgarganda yoki tiklanganda **boshqa barcha sessiyalar yopiladi** (`users.token_version`, tokenda
   `id.version`). Eski tokenlar deploydan keyin ham ishlayveradi. Foydalanuvchiga qo'ng'iroqcha va bot orqali
   "Parolingiz o'zgartirildi" xabari boradi.
6. **Admin hisobi:** admin kirish sahifasidan owner'ga so'rov yuboradi. Owner o'z parolini unutsa, serverda
   quyidagi buyruq ishlatiladi:
   `docker compose exec api python -m app.manage reset-admin-password <email>`

### Bot Mini App'siz ishlaydi (`services/bot_commands.py`)
- Korxona va universitet foydalanuvchilariga boradigan bot xabarlarida to'liq matn bo'ladi. Tugma Mini App'ni emas,
  **saytni brauzerda** ochadi. Talabalarda tugma avvalgidek Mini App'ni ochadi.
- Bot buyruqlari:
  - `/bildirishnomalar`: so'nggi 10 ta xabar; ular o'qilgan deb belgilanadi.
  - `/akkaunt`: kirish emaili, panel va holati, saytga kirish havolasi.
  - `/parol`: parolni tiklash.
  - `/yordam`: buyruqlar ro'yxati. Bot boshqa har qanday xabarga ham shu ro'yxat bilan javob beradi.
- Korxona yoki universitet xodimi `/start` bossa, "Saytda ochish" tugmasi ham chiqadi.
- "Kirish usullari" kartasida botning buyruqlari ko'rsatiladi. Universitet panelida yangi **"Kirish va bot"** tabi
  bor: u yerda Telegram'ni ulash va email bilan parol qo'yish mumkin.

## Deploydan keyin
- Admin → Telegram bot → **"Botni ulash"** ni bir marta bosing. Shundan keyin botning yangi buyruqlar menyusi va
  yangilangan tavsifi Telegram'da ko'rinadi.
- Yangi jadvallarni `create_all` o'zi yaratadi. `users` jadvaliga 2 ta ustun `core/upgrades.py` orqali qo'shiladi.

## 2-bosqich: qilingan ishlar (2026-11-19)

### Spam kamaydi
- **Chat.** Bitta suhbat uchun qo'ng'iroqchada bitta o'qilmagan qator turadi: unda oxirgi xabar va
  "· N ta yangi xabar" yozuvi bo'ladi. Telegram'ga bitta suhbat bo'yicha 30 daqiqada ko'pi bilan bitta xabar boradi.
  O'qilgandan keyin kelgan xabar yangi qator ochadi. Buning uchun `notifications.group_key` ustuni va
  `inbox.push(group=...)` qo'shildi.
- **Topshirilgan ishlar.** Har bir topshirilgan ish haqida yo'nalishdagi hamma talabaga boradigan Telegram xabari
  olib tashlandi. Baholashni kutayotgan ishlar soni dushanba dayjestida aytiladi.

### Yangi xabarlar
| Xabar | Kimga | Qachon |
|---|---|---|
| `task_entry_new` | korxona xodimlari | Talaba korxona vazifasiga birinchi marta ish yuborganda. Bitta qatorga yig'iladi ("Jami N ta yangi ish"), Telegram 2 soatda bir marta. Qayta yuborilgan ish uchun avvalgidek alohida `task_resubmitted` boradi. |
| `company_event` | korxonani taniydigan talabalar: unga ariza berganlar, vazifasiga ish yuborganlar, u bilan yozishganlar va hamkor universitet talabalari | Korxona yangi tadbir yaratganda |
| `interview_reminder` | talaba | Suhbatdan taxminan bir kun oldin. Korxona vaqtni o'zgartirsa, yana eslatiladi. |
| `test_deadline` | testni boshlab, tugatmagan talaba | Test muddati tugashidan bir kun oldin, bir marta |
| `task_deadline` | vazifaga ismi bilan taklif qilingan, lekin ish yubormagan talaba | Muddat tugashidan 24 soat oldin, bir marta. Hammaga ochiq vazifalar uchun eslatma yuborilmaydi, shovqin bo'lmasin. |
| `weekly_digest` | ro'yxatdan to'liq o'tgan har bir talaba, yo'nalishi bo'lmasa ham | Dushanba 10:00. Unda: yo'nalishdagi navbatdagi topshiriq, kasb yo'nalishlari bo'yicha yangi vakansiyalar, ochiq korxona vazifalari. Yangilik bo'lmasa, xabar yuborilmaydi. Qo'ng'iroqchaga ham tushadi. |
| `admin_announcement` | tanlangan auditoriya | Admin e'loni |

### Admin e'lonlari
- Auditoriyani tanlash mumkin: talabalar (yo'nalish, universitet yoki guruh bo'yicha), tasdiqlangan korxonalar,
  universitet xodimlari yoki hamma.
- Har bir qabul qiluvchining qo'ng'iroqchasiga tushadi, Telegram'siz bo'lsa ham. Bot sozlanmagan bo'lsa ham e'lon
  qo'ng'iroqchaga yetib boradi.
- Telegram ulanganlarga botdan ham keladi: talabalarda Mini App tugmasi, korxona va universitetlarda "Saytda ochish".
- Admin sahifasida ikkita son ko'rinadi: qo'ng'iroqchaga necha kishiga tushgani va botda necha kishiga yetgani.

### Eslatmalar sikli
`services/reminders.py` har 15 daqiqada ishlaydi (faqat prod'da): haftalik dayjest, suhbat eslatmasi, muddat
eslatmalari va ro'yxatdan o'tishni yakunlash eslatmasi. Har bir eslatma yuborishdan oldin belgilab qo'yiladi
(`interview_reminded_for`, `deadline_reminded_at`), shuning uchun qayta ishga tushganda ikki marta bormaydi.

## Keyingi bosqich (3-bosqich)
- Telegram xabari o'quvchi tilida bo'ladi.
- Panellarda "Bildirishnomalar" sozlamalari: Telegram nusxasini yoqish yoki o'chirish, turkumlarni tanlash.
- Botni bloklagan foydalanuvchilar belgilanadi.
- Eski xabarlar tozalanadi.
- Admin hisobini Telegram'ga ulash mumkin bo'ladi.

## Testlar
- `backend/tests/test_notifications_and_password.py`: ruxsat bo'yicha yo'naltirish, bot kodi va havolasi, 5 marta
  xato kod, owner'ga so'rov, majburiy yangi parol, sessiyalarning yopilishi va bot buyruqlari.
- `backend/tests/test_notifications_phase2.py`: chatni yig'ish va bitta Telegram xabari, vazifa ishlarini yig'ish,
  korxona tadbiri auditoriyasi, suhbat eslatmasi (yangi vaqt bilan qayta), muddat eslatmalari, yo'nalishsiz
  talabaga dayjest va admin e'loni auditoriyalari.
