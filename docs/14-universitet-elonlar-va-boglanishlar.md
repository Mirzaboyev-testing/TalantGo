# Universitet paneli: e'lonlar (rasmli) va bog'lanishlar tahlili (2026-11-19)

Foydalanuvchi so'rovi: universitet panelini to'liq ko'rib chiqish; e'lonlarni rasmlari bilan joylash va ularning
talabaga va korxonaga qanday ko'rinishini tekshirish; panelda nima kerak, nima ortiqcha; talaba va korxona bilan
bog'lanishlarni tekshirish; buglarni tuzatish; loyiha menejeri va biznes-tahlilchi ko'zi bilan tizim yaxshi
ishlashi uchun zarur bog'lanishlarni qo'shish. Boshqa 4 sessiya shu papkada ishlayapti; umumiy fayllarda faqat
nuqtali o'zgarish, commit — foydalanuvchi aytganda, hamma sessiya bilan birga.

## 1. Bog'lanishlar xaritasi (kod bo'yicha, 2026-11-19)

| Bog'lanish | Bor | Uzilgan yoki yo'q |
|---|---|---|
| Universitet → talaba: e'lon | matn, fakultet/kurs/guruh/yil filtri, bildirishnoma, "Universitetim"da ko'rinadi | rasm yo'q; turi (yangilik, tadbir, amaliyot...) yo'q; tashqi havola (ro'yxat formasi) qo'yib bo'lmaydi; o'chirib bo'lmaydi |
| Universitet → korxona: e'lon | — | **umuman yo'q**: hamkor korxonaga yarmarka, memorandum, talabalar guruhi haqida xabar berib bo'lmaydi |
| Universitet → ochiq sahifa | nom, shahar, tavsif, sayt, raqamlar | universitet profilda to'ldirgan **logotip, hamkorlik yo'nalishlari, kontaktlar, tashkil topgan yil, talabalar soni** hech qayerda ko'rinmaydi; profil "oldindan ko'rish"i shu sabab chalg'itadi; yangiliklar yo'q |
| Korxona → universitet ro'yxati | kartochkada bosh harflar, talabalar soni, hamkorlik holati | logotip yo'q; universitet yangiliklari yo'q; bildirishnomadan universitetni to'g'ridan-to'g'ri ochib bo'lmaydi |
| Universitet vakansiyani tavsiya qiladi | talabalar (tasdiqlangan, fakultet/kurs) xabar oladi | **korxona bilmaydi**: qaysi universitet uning vakansiyasini nechta talabaga tavsiya qilgani hech qayerda yo'q |
| Hamkorlik | ikki tomondan so'rov/qaror, bildirishnoma | ishlaydi |
| Tasdiqlash (talaba ↔ universitet) | navbat, ommaviy, sabab | ishlaydi |
| Bandlik yozuvlari | universitet va korxona tasdiqlaydi | ishlaydi |
| Tadbirlar | universitet talabalarga, korxona hammaga | universitet yarmarkasiga korxonalarni taklif qilish yo'q (matn maydoni) — keyingi bosqich |
| "Saytda hamkor sifatida ko'rsatish" | saqlanadi | hech kim o'qimaydi → korxona sessiyasi admin hamkor tanlovida birinchi qo'yadi |
| Admin | xodim navbati, universitetni o'chirish | ishlaydi (admin_inbox — bildirishnoma sessiyasi) |

## 2. Qarorlar (nima qilinadi, nima yo'q)

**Hozir (P0–P1):**
1. E'lonlar v2: rasm (6 tagacha), turi, kanallar (talabalar / hamkor korxonalar / ochiq sahifa), tashqi `https://`
   havola, o'chirish, ikki auditoriya bo'yicha qamrov (talaba N, korxona M), yozish paytida "talabaga ko'rinishi /
   korxonaga ko'rinishi / bildirishnoma" jonli ko'rinishi.
2. Bitta umumiy `NewsCard` (galereya + kattalashtirish): talaba "Universitetim", korxona "Universitetlar",
   ochiq universitet sahifasi va universitetning o'z ko'rinishida bir xil ko'rinadi.
3. Ochiq/korxona profili: logotip, hamkorlik yo'nalishlari, kontaktlar, yil, rasmiy talabalar soni, yangiliklar.
4. Korxona: universitet kartochkalarida logotip; "Universitetlar"da yangiliklar lentasi; `?u=<id>` bilan
   bildirishnomadan universitet ochiladi.
5. Tavsiya qilinganda korxona xodimlari bildirishnoma oladi (qaysi universitet, nechta talabaga).
6. Panelni ko'rib chiqishda topilgan buglar (3-bo'lim).

**Keyin (P2, alohida):** yarmarkaga hamkor korxonalarni taklif qilish va ularning "qatnashamiz" javobi;
e'lon ko'rilganlar soni; e'lonni tahrirlash; e'lonni ma'lum korxonalarga tanlab yuborish.

**Kerak emas:** `StudentUniFeed.tsx` (talaba sessiyasi o'z lentasini qilgan, fayl ishlatilmaydi) — o'chiriladi.

## 3. Ish prompti (o'zim uchun)

> Universitet e'lonlarini rasmli qil va ularni uch joyga to'g'ri yetkaz. Backend: `university_announcements`ga
> `photo_ids int[]`, `channels varchar[]` (students/companies/public, kamida bitta), `category varchar(16)`
> (news, career, internship, event, scholarship, other), `status` (published/deleted), `company_recipients int`
> — `upgrades.py`da idempotent ALTER. Rasmlar: xodimning o'zi yuklagan PNG/JPG/WEBP (`files.company_file`,
> LOGO_TYPES), 6 tagacha; ko'rsatishda imzolangan havola (`files.file_out`), chunki `<img>` token yubora olmaydi.
> Havola: ilova ichidagi yo'l yoki `https://` (bo'sh joy, `\`, boshqaruv belgisi yo'q). Talabalar kanali —
> eski filtrlar; korxonalar kanali — qabul qilingan hamkor korxonalarning xodimlari (`company_staff_ids`);
> ochiq kanal — universitetning ochiq sahifasi va korxona ko'rinishi. Bildirishnoma: talabaga eski
> `university_announcement`, korxonaga shu tur `/korxona/universitetlar?u=<id>` havolasi bilan. Kunlik 10 ta
> limit saqlanadi. `DELETE /university/announcements/{id}` — yumshoq o'chirish, lentalardan yo'qoladi.
> `POST /announcements/preview` → `{recipients, companies}`. Talaba lentasi va korxona lentasi
> (`GET /employer/university-news`) faqat ko'rishga haqli e'lonlarni qaytaradi; ochiq profil faqat `public`.
> Frontend: umumiy `NewsCard` (rasm galereyasi, lightbox: Esc/strelkalar, tur chipi, sana, havola tugmasi),
> universitet composeri (kanallar, tur, rasmlar, havola, jonli ko'rinish tablari), tarixda muqova, kanallar,
> qamrov, o'chirish. Ochiq/korxona profili logotip, hamkorlik, kontaktlar bilan. Korxona kartochkasida logo,
> yangiliklar lentasi, `?u=`. Tavsiyada korxonaga xabar. Har bir bug uchun test; uz/ru/en kalitlar;
> 1366/1024/768/375/320 da headless tekshiruv; boshqa sessiyalarning hunklariga tegmaslik.

## 4. Test rejasi

- API: rasm/kanal/tur validatsiyasi, begona fayl, 7-rasm, kanalsiz e'lon, tashqi havola, o'chirish va lentadan
  yo'qolishi, talaba filtri, hamkor bo'lmagan korxona ko'rmasligi, ochiq sahifa faqat `public`, tavsiyada
  korxona bildirishnomasi.
- UI: composer (rasm yuklash, olib tashlash, ko'rinish tablari), tarix, talaba "Universitetim", korxona
  "Universitetlar" va universitet sahifasi, ochiq universitet sahifasi; lightbox; telefon kengligi; uz/ru/en.

## 5. Natija (2026-11-19)

**E'lonlar v2.** `university_announcements`ga `channels`, `category`, `photo_ids`, `company_recipients`, `status`
(upgrades.py'da ALTER). Mantiq `services/uni_news.py`da: kim nimani ko'radi, havola tekshiruvi (ilova yo'li yoki
`https://`), rasm tekshiruvi (o'zi yuklagan PNG/JPG/WEBP, 6 tagacha). Endpointlar: `POST/GET /university/announcements`,
`POST .../preview` → `{recipients, companies}`, `DELETE .../{id}` (yumshoq), `GET /employer/university-news`,
talaba lentasi va ochiq/korxona profilida `news`. Korxonaga bildirishnoma `/korxona/universitetlar?u=<id>`.

**Ko'rinish.** Umumiy `screens/NewsCard.tsx` (galereya 1–4+, kattalashtirish: strelka/Esc, tur chipi, ilova
havolasi ichkarida, tashqi havola brauzerda). Composer: 3 kanal kartochkasi, tur, rasmlar (muqova), havola,
fakultet filtri faqat talabalar kanalida, ikki qamrov, "Talabaga / Korxonaga / Bildirishnoma" jonli ko'rinish;
tarixda muqova, kanallar, qamrov, o'chirish.

**Bog'lanishlar.** Ochiq va korxona universitet sahifasida logotip, hamkorlik yo'nalishlari, kontaktlar, yil,
talabalar soni, fakultetlar soni, yangiliklar; ro'yxatlarda logotip. Tavsiyada korxona xabar oladi
(`job_recommended_company`), korxona vakansiyalar ro'yxatida `recommended_by`, universitet tavsiyani qaytara oladi
(`DELETE /university/jobs/{id}/recommend`). Imkoniyatlarda korxona logotipi va sohalar. Korxona sessiyasi:
`show_as_partner` admin hamkor tanlovida birinchi, `university_hire` bildirishnomasi (ikonka qo'shildi).

**Buglar.** WEBP rasm serverda turi aniqlanmay rad etilardi (`mimetypes.add_type`); talabaga ilova ichidagi
havola yangi oynada ochilardi; ochiq sahifa universitet to'ldirgan ma'lumotlarni ko'rsatmasdi; telefonda faol tab
ko'rinmay qolardi; ishlatilmaydigan `StudentUniFeed.tsx` va `u.feed.*` kalitlari olib tashlandi.

**Tekshiruv.** Universitet testlari 25 ta (yangi: rasmli e'lon uch kanalda, tavsiya → korxona, recommended_by va
qaytarish). Headless Chrome: universitet, talaba, korxona, ochiq sahifa × 1366/768/375 — xato yo'q, rasm buzilmagan,
lightbox ishlaydi; universitet panelining 8 bo'limi va barcha tablari kompyuter va telefonda — konsol xatosi, 4xx/5xx
va gorizontal toshish yo'q; ru tilida composer.

**Keyingi bosqich (P2).** Yarmarkaga hamkor korxonalarni taklif qilish va "qatnashamiz" javobi; e'lonni
tahrirlash; ko'rilganlar soni; e'lonni tanlangan korxonalarga yuborish.
