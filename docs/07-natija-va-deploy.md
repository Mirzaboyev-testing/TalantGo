# TalantGo: 3 panelli platforma. Natija va deploy (2026-10-26)

Ish `uch-panel` branchida, `main` jonli saytdagi holat. Har faza alohida commit.

| Faza | Commit | Mazmun |
|---|---|---|
| 0 | (hujjat) | Audit: `docs/05-faza0-audit.md` |
| 1 | (hujjat) | Reja va qarorlar: `docs/06-faza1-reja.md` |
| 2 | `eac039a` | Ariza holatlari va tarix, sayt ichidagi bildirishnomalar, URL router, 3 til asosi, xavfsizlik tuzatishlari |
| 3 | `4e26be1` | Ochiq sayt va 3 panelga kirish, talaba/korxona Dashboard'lari, nomzodlar jadvali, saqlangan vakansiyalar, korxona vazifalari |
| 4 | `58527f3` | Universitet paneli: bandlik statistikasi, hamkorlik, vakansiyani tavsiya qilish, universitet profillari |
| 5 | `96ebf3f` | Reyting (faqat bandlik), shikoyatlar, admin rollari, korxona faolligi |
| 6 | (shu commit) | Eski ekranlar 3 tilda, xavfsizlik ko'rigi tuzatishlari, hujjatlar |

## URL xaritasi

- Ochiq: `/`, `/vakansiyalar`, `/vakansiyalar/:id`, `/korxonalar`, `/korxonalar/:id`, `/universitetlar`,
  `/universitetlar/:id`, `/reyting`, `/kirish`, `/kirish/talaba|korxona|universitet`.
- Talaba: `/talaba` (Bosh sahifa), `/talaba/yol`, `/talaba/vakansiyalar`, `/talaba/arizalar`, `/talaba/saqlangan`,
  `/talaba/tekshirish`, `/talaba/universitetim`, `/talaba/hamjamiyat`, `/talaba/profil`.
- Korxona: `/korxona` (Bosh sahifa), `/korxona/nomzodlar`, `/korxona/vakansiyalar`, `/korxona/talabalar`,
  `/korxona/vazifalar`, `/korxona/universitetlar`, `/korxona/testlar`, `/korxona/guruhlar`, `/korxona/profil`.
- Universitet: `/universitet` (Ko'rsatkichlar), `/universitet/bandlik`, `/universitet/tasdiqlash`, `/universitet/talabalar`,
  `/universitet/hamkorlar`, `/universitet/imkoniyatlar`, `/universitet/profil`, `/universitet/guruhlar`.
- Admin: `/admin#...`. Eski 20 sahifa joyida, yangilari: Shikoyatlar, Bandlik yozuvlari, Hamkorliklar, Reyting.

## Asosiy qoidalar (foydalanuvchi qarorlari)

- Korxona talabalarni ism va CV bilan ko'radi, agar talaba rozilik bergan va "Korxonalarga ko'rinaman" yoqilgan
  bo'lsa. Telefon va Telegram faqat ariza yoki qabul qilingan kontaktdan keyin ochiladi.
- Universitet statistikasi va reytingi hozircha faqat bandlik bo'yicha: tasdiqlangan ish yoki amaliyoti bor
  tasdiqlangan talabalar ulushi. Sifat mezonlari yo'q. 10 kishidan kam bo'lsa foiz va ball ko'rsatilmaydi.
- Talaba o'zi kiritgan ish joyi universitet tasdiqlaguncha hisobga kirmaydi.
- Admin rollari: owner, admin, moderator (faqat moderatsiya), tahlilchi (faqat ko'rish).

## Ma'lum cheklovlar

- Admin sayti faqat o'zbekcha (ichki xodimlar uchun). Foydalanuvchi ekranlari uz/ru/en.
- Rus va ingliz tarjimalari AI yordamida qilingan: ommaviy ishga tushirishdan oldin ona tili egasi ko'rib chiqishi kerak.
- Email orqali xabar yuborilmaydi: Telegram'i yo'q foydalanuvchi bildirishnomalarni faqat saytdagi qo'ng'iroqda ko'radi.
- HEMIS bilan integratsiya yo'q: talabalik universitet xodimi yoki admin tomonidan tasdiqlanadi.
- Korxonalarga yulduzli baho (sharh) qilinmadi: korxona sahifasida faqat faollik faktlari (javob ulushi, ishga olinganlar, vazifalar).
- Reyting 10 tadan ko'p tasdiqlangan talabasi bor universitetlar uchun ball beradi: pilot boshida ko'p universitetda "ma'lumot yetarli emas" chiqadi.
- Telegram bot o'zgartirilmadi. Bildirishnomadagi tugma endi tegishli sahifani ochadi (masalan, `/talaba/arizalar`).
- Lokal `secrets/local-admin-test.txt` paroli lokal bazadagi hisobga mos emas (eskirgan).
- Reyting ishonchliligi: universitet xodimi talabani ham tasdiqlaydi, talabaning o'zi kiritgan ish joyini ham.
  Bu ikki tomonni bitta universitet boshqaradi. Hozircha yumshatildi: faqat universitet tasdig'idagi joylar
  reytingda alohida ko'rsatiladi va xodimning har bir tasdig'i audit jurnaliga yoziladi. Keyingi qadam
  (qaror kerak): reytingda faqat korxona yoki platforma tasdiqlagan joylarni sanash yoki dalil (shartnoma,
  buyruq nusxasi) talab qilish.
- Admin saytida yangi ro'yxatdan o'tgan xodim "admin" roli bilan yaratiladi; ega uni tasdiqlashda kerakli rolni
  (moderator yoki tahlilchi) tanlashi kerak.

## Xavfsizlik ko'rigi (Faza 6) natijasi

Jiddiy IDOR topilmadi. Tuzatilganlar: qaytarib olingan arizadan keyin kontaktlar yopiladi; korxona vazifalarida
ommaviy vazifalar kuniga 2 ta va bitta korxona bitta talabaga 30 kunda ko'pi bilan 100 ball beradi; vazifa
topshirganlarning Telegrami korxonaga ko'rinmaydi; reyting faqat talabalar uchun; ariza holatlari qatorni qulflab
o'zgaradi; ochiq reyting 5 daqiqa keshlanadi; universitet faqat hozirgi talabalarining yozuvlarini ko'radi;
10 kishidan kam bo'lsa ochiq sahifalarda sonlar ham yashiriladi va talaba qo'lda yozgan kompaniya nomlari
chiqmaydi; rol tekshiruvi marshrut shabloniga bog'landi; CHECK cheklovlari faqat kerak bo'lganda qayta
yaratiladi; o'tgan vaqtdagi suhbat, juda uzoq vazifa muddati, uzun veb-sayt manzili rad etiladi; ariza va
hamkorlik so'rovlariga kunlik limit.

## Deploy tartibi (faqat foydalanuvchi ruxsati bilan)

1. Serverda baza zaxirasi: `docker exec careerflow-db-1 pg_dump -U careerflow careerflow > /root/careerflow/backups/pre-uch-panel.sql`.
2. Staging test: kodni `/root/careerflow-staging` ga yuklash, `docker build -t careerflow-staging .`, pytest'ni
   `careerflow_test` bazasiga qarshi bir martalik konteynerda ishga tushirish (prod bazaga tegmaydi).
3. Deploy: kodni `/root/careerflow` ga yuklash va `bash deploy/server-setup.sh`. Migratsiyalar (`core/upgrades.py`)
   ishga tushishda o'zi bajariladi; hammasi additiv, eski ma'lumot saqlanadi.
4. Tekshiruv: `/api/health`, bosh sahifa, uchta panelga kirish, Telegram Mini App orqali kirish, admin sayti, loglar.
5. Orqaga qaytarish: `main` branchini xuddi shu yo'l bilan qayta deploy qilish. Yangi jadvallar va ustunlar
   eski kodga xalaqit bermaydi; zarur bo'lsa 1-qadamdagi zaxiradan tiklash.
