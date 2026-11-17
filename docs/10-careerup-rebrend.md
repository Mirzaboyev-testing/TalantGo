# Careerup: TalantGo'dan yangi nom va logoga o'tish (2026-11-17)

Nom: **Careerup** ("Career" to'q, "up" yashil). AI: **Careerup AI**. Logo: brend doskasidagi belgi (G/C yoyi va
yuqoriga o'q), SVG qilib qayta chizildi. Kiyim, bino va telefon maketlari faqat g'oya: saytga qo'yilmaydi.

## Tahlil (boshlanishdagi holat)

"TalantGo" 199 joyda, 57 faylda uchraydi:

| Qatlam | Qayerda | Nechta |
|---|---|---|
| Logo belgisi | yashil kvadrat ichida "T" (`brand-mark`): Shell (sidebar, topbar), ommaviy sayt sarlavhasi va pastki qismi, kirish sahifasi, uchala panelning ro'yxatdan o'tish va kutish ekranlari, admin | 13 joy |
| Matnlar (uz/ru/en) | `locales/parts/*` (talaba 60, universitet 21, korxona 6), `uz/ru/en.ts` | ~93 |
| Brauzer | `index.html`: sarlavha, meta, ikonka yo'q | 4 |
| AI | "TalantGo AI": tugma, chat sarlavhasi, backend yo'riqnomalari, AI tekshiruvchi matni | ~20 |
| Bot | nom (`setMyName`), menyu tugmasi, tavsiflar, xush kelibsiz matni va banneri, bot ko'chirish xabarlari, kirish kodlari matnlari | ~15 |
| CV | HTML va PDF: sarlavha, "tasdiqlangan" belgisi, pastki yozuv | 6 |
| Bazadagi ma'lumot | hamjamiyat guruhi nomi "TalantGo hamjamiyati", `users.verified_by = 'TalantGo'` | 2 |
| Admin | sarlavha, sozlamalar matnlari, CSV fayl nomlari, `verified_by` qiymati | ~10 |
| Testlar, hujjatlar, skriptlar | README, docs, `make_avatar.py`, `make_banner.py`, testlar | ~35 |

O'zgarmaydi (ataylab):
- Domen: sotib olinganda bir yo'la almashtiriladi.
- `@talantgo_bot` username: Telegram API buni o'zgartirmaydi. Yangi bot BotFather'da ochiladi, token admin
  sozlamalariga qo'yiladi (foydalanuvchilarni yo'qotmasdan ko'chirish funksiyasi bor).
- Ichki kalitlar: `cf_user_token`, `tg_lang`, `careerflow-*` konteynerlar, webhook kaliti tuzi
  `careerflow-webhook` (o'zgarsa Telegram webhook ishlamay qoladi).
- Tarixiy migratsiya qatorlari (CareerFlow → TalantGo) `upgrades.py` da qoladi.

## Bosqichlar

0. **Brend aktivlari**: `careerup-mark.svg` (oq fon), `careerup-mark-light.svg` (to'q fon), `careerup-icon.svg`
   (to'q kvadrat: favicon, ilova), `careerup-logo.svg` (belgi + yozuv); PNG: 180, 192, 512 (telefon ikonkasi,
   manifest), 640 (bot avatari), 1280×640 (bot xush kelibsiz banneri). Ranglar: #00C853, #0B1F17, #F8FAFC.
   Tugmalar #16a34a da qoladi (oq matn bilan kontrast yetarli; #00C853 da yetmaydi).
1. **Yagona manba**: frontend `brand.ts` (nom, AI nomi) va `BrandLogo` komponenti (belgi + "Career"/"up");
   backend `core/brand.py` (`BRAND`, `AI_NAME`). Hamma joy shulardan oladi: keyingi o'zgarish bitta faylda.
2. **Umumiy qobiq va ommaviy sayt**: `index.html` (sarlavha, tavsif, favicon, apple-touch-icon, theme-color,
   manifest), ommaviy sayt sarlavhasi va pastki qismi, bosh sahifa, kirish sahifalari, Shell sidebar va topbar
   (uchala panelga birdan ta'sir qiladi).
3. **Talaba paneli**: ro'yxatdan o'tish ekrani, talaba matnlari (uz/ru/en), bosh sahifa, topshiriqlar, AI tugmasi.
4. **Korxona paneli**: ro'yxatdan o'tish wizardi, kutish ekrani, korxona matnlari.
5. **Universitet paneli**: ro'yxatdan o'tish, kutish ekrani, universitet matnlari.
6. **Admin**: sarlavha, kirish ekrani, sozlamalar matnlari.
7. **Backend**: bot (nom, menyu, tavsiflar, xush kelibsiz matni, banner), kirish kodlari xabarlari, AI yo'riqnomalari
   va AI tekshiruvchi, CV (HTML, PDF), seed, admin (`verified_by`, CSV fayl nomlari), API sarlavhasi;
   `upgrades.py`: guruh nomi va `verified_by` ma'lumotlarini yangilash (idempotent).
8. **Testlar, hujjatlar, skriptlar**: README, docs, avatar va banner skriptlari, testlardagi matnlar.
9. **Tekshiruv**: `grep TalantGo` faqat tarixiy joylarda qoladi; tsc, build, pytest; brauzerda ommaviy sayt,
   uchala panel va admin (kompyuter va telefon); deploy'dan keyin admin panelida "Botni ulash" (yangi nom va
   tavsif Telegram'ga yuboriladi) va BotFather'da bot avatarini yangilash.
