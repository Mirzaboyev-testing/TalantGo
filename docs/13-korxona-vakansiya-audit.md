# Korxona paneli: vakansiya yo'li va bog'lanishlar auditi (2026-11-19)

## Vazifa (qayta yozilgan prompt)

Sen Careerup'ning bosh loyiha menejeri va biznes-tahlilchisisan. Korxona panelini to'liq tekshir: korxona
joylagan vakansiya, topshiriq va test talabaga, universitetga va ochiq saytga qanday yetib borishini boshidan
oxirigacha kuzat. Har bir bosqichni lokal serverda haqiqiy hisoblar bilan ochib, skrinshot ol.

1. **Yo'l xaritasi.** Korxona → admin tasdig'i → ochiq sayt (/vakansiyalar) → talaba paneli (ro'yxat, tavsiya,
   filtrlar, saqlash, ariza) → universitet paneli (imkoniyatlar, talabalarga tavsiya) → korxona nomzodlar
   ro'yxati (bosqichlar, xabar, kontakt) → ishga olish → bandlik yozuvi → universitet statistikasi va reyting.
   Har bir o'tishda: kim nimani ko'radi, qanday bildirishnoma oladi, ma'lumot qayerda yo'qoladi.
2. **Ko'rinish.** Bir vakansiyani uch ko'z bilan ko'r: korxona, talaba (kompyuter va telefon), universitet,
   ochiq sayt. Logo, maosh, format, muddat, talablar, "amaliyotga o'tadi" belgisi bir xil va to'g'ri chiqyaptimi.
3. **Bog'lanishlar.** Talaba ↔ korxona (ariza, xabar, kontakt so'rovi, topshiriq, test), korxona ↔ universitet
   (hamkorlik, vakansiyani tavsiya qilish, tadbir, bitiruvchi bandligi). Qaysi bog'lanish uzilgan, qaysi biri
   ikki tomonda ham ko'rinmaydi.
4. **Xatolar.** Holat o'tishlari (tasdiq, rad, yopish, muddat), ruxsatlar (kim ko'radi), shaxsiy ma'lumot
   (telefon faqat rozilik bilan), bo'sh holatlar, telefon o'lchami, uz/ru/en.
5. **Qaror.** Tizim yaxshi ishlashi uchun eng muhim bog'lanishlarni tartib bilan yoz: nima kerak, nima ortiqcha.
   Kichik va aniq tuzatishlarni o'zing qil; katta yangi imkoniyatlarni foydalanuvchiga taklif qil.
6. **Natija.** Skrinshotli hisobot (artifact), testlar, commit. Boshqa sesiyalar ishlayotgan fayllarga ruxsatsiz
   tegma: avval kelishib ol. Deploy faqat foydalanuvchi aytganda.

## Topilmalar va tuzatishlar

Skrinshotli hisobot: https://claude.ai/artifact/EMWCJ7dyokwRbQHts3ikds (shaxsiy, egasi ulashadi).

Tuzatildi (korxona sesiyasi):
- Vakansiya va tadbir formalari holatni eski nusxadan yangilardi: belgilar bir-birini o'chirardi.
- Kasb yo'nalishi (1–3) va bugundan keyingi muddat majburiy; server ham o'tgan muddatni qaytaradi.
- Tahrir qoidasi: faqat muddat yoki soat o'zgarsa e'lon ochiq qoladi, matn o'zgarsa qayta tekshiruv va adminga xabar;
  yopilgan e'lonni tahrir qilib qayta ochish mumkin.
- Muddati o'tgan e'lon "faol" sanalmaydi, alohida holat va "Muddatni uzaytirish".
- E'lon yopilganda jarayondagi arizachilarga xabar; ishga olinganda talabaning universitet xodimlariga xabar.
- Admin navbati: korxona va vakansiyani rad etishda sabab majburiy, vakansiyaning barcha shartlari ko'rinadi;
  tasdiqlash izohi talabalarga yetmaydi.
- Suhbat xabarida ru/en tilida vaqt va joy.
- Nomzod kartasi: kasb yo'nalishlari, "Xabar yozish", ochilganda "ko'rib chiqilmoqda".
- Ochiq sayt: logo, muddat ("31.12 gacha"), kasb yo'nalishi va masofaviy filtr, yo'nalish belgilari.
- Admin hamkor tanlovida saytda ko'rsatishga rozilik bergan tashkilotlar birinchi.

Boshqa sesiyalar: moslik formulasi (yo'nalish 40, ko'nikma 35) va talaba oynasidagi ko'rinish (talaba sesiyasi);
universitet imkoniyatlarida logo va yo'nalish (universitet sesiyasiga topshirildi).

Takliflar: yangi mos e'lon haqida talabaga xabar, muddat eslatmasi va avtomatik yopish, korxonaga "kim tavsiya qildi",
suhbat eslatmasi, topshiriqqa javob haqida korxonaga xabar, "ishga joylashgan"ning bitta ta'rifi, nom o'zgarsa panel
qulflanmasligi, ro'yxatlardagi 200 ta cheklov.

Testlar: backend/tests/test_company_audit.py.
