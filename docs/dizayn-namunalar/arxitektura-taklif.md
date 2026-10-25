# Arxitektura taklifi (foydalanuvchi 2026-10-25 da boshqa AI suhbatidan yubordi)

Manba matn o'zgartirilmasdan saqlangan. Tahlili: `docs/04-uch-panel-prompt.md`, 10-bo'lim.
Rasmlar: `arxitektura-taklif-1..6.png` (shu suhbat skrinshotlari), panel namunalari:
`talaba-paneli-namuna.png`, `korxona-paneli-namuna.webp`, `universitet-paneli-namuna.webp`, `admin-paneli-namuna.png`.

Skrinshotlardagi asosiy fikrlar (1-6 rasm):
- Uchta panelni uchta alohida sayt qilib qurmaslik: bitta tizim, bitta baza, bog'langan jarayonlar.
- ishGO misoli (vakansiya, soha, korxona, statistika bog'langan) + Career EDU misoli (talaba kabineti bitta joyda).
- Yagona platforma: Talaba / Korxona / Universitet + Admin paneli; umumiy qatlam: vakansiya, ariza, nomzod,
  amaliyot, bildirishnoma, reyting, hisobot. O'zbek / Rus / Ingliz, responsive web, yagona autentifikatsiya.
- Xorijiy namunalar: Handshake (uch tomonlama tarmoq), Forage (real ishga o'xshash topshiriqlar),
  Riipen (korxona loyihalari universitet bilan). Eng kuchlisi: uchalasining kombinatsiyasi.
- Universitet reytingi obunachilar soni bo'yicha emas: bandlik, mutaxassislikka moslik, ish beruvchi fikri,
  ma'lumot ishonchliligi (U-Ranking metodologiyasi kabi).
- Yondashuv: avval kodni audit qilish, keyin arxitekturani mavjud loyihaga moslash, so'ng kichik bosqichlar.
  Mavjud backend sababsiz almashtirilmaydi.

---

Bu — mantiqiy arxitektura. Texnik arxitektura (masalan, Next.js, React, Laravel, Supabase yoki boshqa yechimlar) mavjud kod tekshirilgandan keyingina tanlanadi. Hozircha muayyan texnologiyani mavjud deb hisoblamaymiz.

## 2. Sahifalar xaritasi

### Umumiy, tizimga kirmagan foydalanuvchilar uchun

| Sahifa | Vazifasi |
|---|---|
| Bosh sahifa | Platformaning maqsadi va uch tomon uchun yo'nalishlar |
| Vakansiyalar | Qidiruv, soha, joylashuv va tajriba filtrlari |
| Korxonalar | Tasdiqlangan kompaniyalar katalogi |
| Soha yo'nalishlari | Moliya, IT, marketing va boshqa sohalar |
| Universitetlar | OTM katalogi va reytinglar |
| Universitet profili | OTM haqida ma'lumot va tekshirilgan ko'rsatkichlar |
| Kirish / ro'yxatdan o'tish | Hisob yaratish va rolga mos kirish |
| Til va profil sozlamalari | O'zbek, rus va ingliz tillari |

### Talaba paneli
- Dashboard: profil to'liqligi, mos vakansiyalar va arizalar holati.
- Mening profilim: ta'lim, tajriba, ko'nikmalar va kontaktlar.
- CV va portfolio: hujjatlar, loyihalar, sertifikatlar va amaliy topshiriqlar.
- Vakansiyalar: filtrlash va saqlangan vakansiyalar.
- Mening arizalarim: topshirilgan arizalar va ularning holati.
- Amaliyotlar: universitet yoki kompaniya bilan bog'liq imkoniyatlar.
- Suhbatlar va takliflar: suhbat va ish takliflari holati.
- Universitetim: tegishli OTM bilan bog'lanish, agar talaba maqomi tasdiqlangan bo'lsa.
- Bildirishnomalar va maxfiylik sozlamalari.

### Korxona paneli
- Dashboard: vakansiyalar, arizalar, nomzodlar va ishga qabul qilish ko'rsatkichlari.
- Kompaniya profili: tavsif, soha, joylashuv, veb-sayt va verifikatsiya.
- Vakansiyalar: yaratish, tahrirlash, nashr qilish, yopish va arxivlash.
- Nomzodlar: arizalar va qidiruv orqali topilgan nomzodlar.
- Nomzod profili: CV, ko'nikmalar, portfolio va tegishli ruxsatlar doirasidagi ma'lumotlar.
- Saralash: yangi, ko'rib chiqilmoqda, suhbat, taklif, ishga qabul qilindi yoki rad etildi.
- Suhbatlar va ish takliflari.
- Universitetlar bilan hamkorlik va amaliyot dasturlari.
- Hisobotlar va jamoa a'zolari ruxsatlari.

Muhim: "Nomzodlar" sahifasi korxona tizimga kirganidan keyin paydo bo'lishi kerak. Ammo u yerdagi ma'lumotlar vakansiyaga ariza topshirgan yoki ko'rinishiga ruxsat bergan nomzodlar bilan cheklanishi lozim. Barcha talabalarning shaxsiy ma'lumotlari avtomatik ochilmasligi kerak.

### Universitet paneli
- Dashboard: talabalar, bitiruvchilar, arizalar va bandlik ko'rsatkichlari.
- Universitet profili va verifikatsiya.
- Talabalar va bitiruvchilar ro'yxati.
- Talabalarning roziligi asosida profil va karyera natijalari.
- Kompaniyalar bilan hamkorlik.
- Amaliyot dasturlari va ochiq imkoniyatlar.
- Bitiruvchilar bandligi statistikasi.
- Reyting ko'rsatkichlari, davrlar bo'yicha taqqoslash va hisobotlar.

Universitet o'ziga tegishli yoki tegishli ravishda tasdiqlangan talabalar haqidagi ma'lumotlarni ko'rishi kerak. Boshqa universitetlarning maxfiy talaba profillari ochilmaydi.

### Admin paneli
- Foydalanuvchilar va rollarni boshqarish.
- Kompaniya va universitetlarni tekshirish.
- Vakansiyalar va shikoyatlarni moderatsiya qilish.
- Universitet statistikasi uchun ma'lumotlarni tekshirish.
- Reyting davrlari va mezonlarini boshqarish.
- Tarjimalar va umumiy sozlamalar.
- Audit jurnali: muhim amallar kim tomonidan bajarilganini qayd etish.

Admin vakolatlari ham darajalanishi kerak: barcha xodimlarga avtomatik ravishda cheksiz huquq berilmasin.

## 3. Uchta panel qanday bog'lanadi?

Buni faqat dizaynda ko'rsatish yetarli emas. Quyidagi jarayonlar haqiqatan ishlashi kerak.

### Jarayon A — vakansiyadan ishga qabul qilishgacha
1. Korxona vakansiya yaratadi va e'lon qiladi.
2. Talaba vakansiyani topib, CV yoki profilini yuboradi.
3. Ariza korxonaning nomzodlar bo'limida paydo bo'ladi.
4. Korxona arizani ko'rib chiqib, holatini yangilaydi.
5. Talaba arizasining holatini o'z panelida ko'radi va kerakli bildirishnoma oladi.
6. Korxona ishga qabul qilinganini belgilaydi; ruxsat berilgan statistikalar universitet panelida hisobga olinadi.

### Jarayon B — universitet va korxona hamkorligi
1. Korxona amaliyot yoki hamkorlik imkoniyatini yaratadi.
2. Universitet imkoniyatni ko'radi va tegishli talabalariga yetkazadi.
3. Talabalar ariza topshiradi.
4. Korxona tanlov o'tkazadi, universitet esa ruxsat etilgan jarayon va natijalarni kuzatadi.

Har bir jarayonning ma'lumotlar bazasida aniq holatlari, ruxsatlari va xatolarni qayta ishlash qoidalari bo'lishi kerak.

## 4. Universitetlar reytingi qanday ishlashi kerak?

Tavsiya qiladigan boshlang'ich model — beshta mezon. Quyidagi foizlar hozircha taklif; haqiqiy reyting sifatida e'lon qilishdan oldin ma'lumotlarning mavjudligi va ishonchliligini tekshirish zarur.

| Mezon | Boshlang'ich vazn |
|---|---|
| Bitiruvchilarning ishga joylashish darajasi | 35% |
| Mutaxassislik va ish o'rni mosligi | 25% |
| Korxonalar bilan amaliyot va hamkorlik | 15% |
| Ish beruvchilarning tasdiqlangan fikri | 15% |
| Talabalarning tasdiqlangan karyera faolligi | 10% |
| Jami | 100% |

Har bir ko'rsatkich 0–100 oralig'ida baholanadi. Yakuniy ball vaznli yig'indi orqali hisoblanadi.

R = 0.35E + 0.25M + 0.15P + 0.15F + 0.10A

Bu yerda E — bandlik, M — mutaxassislikka moslik, P — amaliyot va hamkorlik, F — ish beruvchilar fikri, A — tasdiqlangan faollik.

Lekin reytingda uchta himoya bo'lishi shart:
1. Ma'lumot yetarli bo'lmasa, universitetga asossiz past ball berilmasin; "ma'lumot yetarli emas" deb ko'rsatilsin.
2. Har bir reyting davri va hisoblash metodologiyasi ochiq ko'rsatilsin.
3. Soxta natijalar, takroriy hisoblar va tasdiqlanmagan bandlik holatlari nazorat qilinsin.

Talabalar soni ko'p universitet avtomatik ravishda eng yuqori o'rinni egallamasligi uchun mutlaq sonlardan ko'ra tegishli foiz va mos taqqoslash guruhlaridan foydalanish kerak.
