"""TalantGo AI: the in-app helper people ask about the platform, their next step and their studies.

Three audiences, each with its own guide: job seekers (students and mentors), employers (company HR), and
anyone who has not finished signing up yet (they ask how to register and which path to choose).

It runs on the same Gemini key as the review. Every request carries a guide to the whole platform and
a short snapshot of the student's own state, so it can answer "what should I do next?" concretely.
Conversations are stored (api/assistant.py); the person and the admins can read them, nobody else.
"""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from sqlalchemy import func

from ..models import Application, Challenge, CompanyTest, ContactRequest, Job, Role, Status, Submission, Task, TestAttempt, User
from . import bots
from .career import completeness, signup_missing
from .catalog import COMPANY_SIZES, INDUSTRIES, JOB_FIELDS, LEGAL_FORMS
from .progress import current_streak, rank_of, today
from .rules import get_rules

DAILY_LIMIT = 60

STATUS_LABEL = {Status.pending: "tekshirilmoqda", Status.peer_verified: "tasdiqlangan",
                Status.mentor_verified: "mentor tasdiqlagan", Status.rejected: "qaytarilgan, qayta topshirish mumkin"}

GUIDE = """TalantGo nima: talabalar uchun karyera platformasi. Talaba korxonalarning real topshiriqlarini bajaradi (xohlasa haftalik
dasturni ham tanlaydi), ishini korxona, AI yordamchi, tengdoshlar va mentor tekshiradi. Tasdiqlangan ishlar avtomatik CV (portfolio)ga tushadi va har bir ishda
kim tasdiqlagani ko'rinadi. Kompaniyalar shu ishonchli portfolio bo'yicha amaliyot va ish taklif qiladi. Ilova Telegram ichida
(@{bot}) va kompyuterda sayt sifatida ({url}) ishlaydi; saytga Telegram orqali kiriladi. Bildirishnomalar botga keladi.

Bo'limlar (kompyuterda chap menyu, telefonda pastki menyu va "Ko'proq"):
- Bosh sahifa: qidiruv, "Keyingi qadam", statistikalar, sizga mos vakansiyalar, ochiq topshiriqlar, profil to'liqligi.
- Vakansiyalar: amaliyot, yarim stavka, junior va loyiha ishlari; chapdagi filtrlar (ish turi, format, kasb yo'nalishi, to'lanadigan,
  malakaviy amaliyot), "Menga mos" yoki "Eng yangi" tartib, moslik foizi, saqlash (yurakcha) va "Saqlanganlar".
- Topshiriqlar: "Korxona topshiriqlari" (Ochiq, Men topshirganlar, Kelgusi, Tugagan), "Haftalik dastur" (ixtiyoriy yo'nalish tanlash
  va haftalik topshiriqlar), "Boshqalarni tekshirish" (tengdoshlar ishini baholash). Mentorda bu bo'lim Mentor paneli.
- Arizalarim: yuborilgan arizalar holati (Jarayonda, Suhbat va taklif, Yakunlangan), kompaniya testlari, bog'lanish so'rovlari.
- Xabarlar: korxona bilan yozishma. Korxona faqat siz ariza bergan yoki bog'lanish so'roviga rozi bo'lgandan keyin yoza oladi;
  suhbatni "Suhbatni yopish" bilan yopish mumkin.
- Tadbirlar: universitetingiz va korxonalarning karyera kunlari, ochiq eshiklar, vebinarlari; "Ro'yxatdan o'tish". Korxona tadbiriga
  yozilsangiz, korxona ismingizni ko'radi.
- Universitetim: universitet tavsiya qilgan vakansiyalar, e'lonlar, tadbirlar, bandlik ko'rsatkichlari.
- Hamjamiyat: Guruhlar, Tengdoshlar (maqsad bo'yicha qidirish), Reyting.
- Profil va portfolio: rasm va muqova, sarlavha, Portfolio (loyihalar, TalantGo'da tasdiqlangan ishlar), Tajriba (ish va amaliyot;
  platformadagi korxona tasdiqlaydi), Sertifikatlar, Haqida (o'zim haqimda, ko'nikmalar va tillar, o'qish, qanday ish izlayman,
  havolalar), profil to'liqligi va talabalikni tasdiqlash. Yozuvlar belgisi: "TalantGo tasdiqlagan", "Korxona tasdiqlagan", "O'zi kiritgan".
- Sozlamalar (chap menyu pastida): telefon, kirish usullari, til, maxfiylik ("Ishga tayyorman", "Korxonalarga ko'rinaman"), CV ochiq yoki yopiq, PDF.

Korxona topshirig'i: Topshiriqlar -> kartochkani oching -> topshiriq matni va muddat -> o'ngda "Ishni topshirish": fayl (Excel, Word,
PDF, rasm, ZIP; 5 tagacha) va/yoki havola, izoh -> "Yuborish". Muddat tugaguncha yoki baholanguncha ishni yangilash mumkin. Korxona baho,
izoh va 1-3-o'rin beradi; natija profil va CV'ga "TalantGo tasdiqlagan" bo'lib tushadi. Topshiriqda qatnashish ariza hisoblanmaydi.
Haftalik dastur topshirig'i: Topshiriqlar -> "Haftalik dastur" -> topshiriqni oching -> "Fayl tanlash" (Excel, Word, PDF, PowerPoint, rasm, CSV, kod; 5 tagacha,
har biri 10 MB gacha) yoki havola (GitHub, Google Drive, Power BI) -> izoh (ixtiyoriy) -> "Yuborish". Fayl yoki havoladan bittasi yetadi.
Topshiriq ichida "Qanday baholanadi" mezonlari bo'lsa, shunga qarab ishlang.
Tekshiruv: {ai_line} {peers} ta tasdiq (tengdosh yoki AI) yig'ilsa ish tasdiqlanadi, topshiriq balli beriladi va ish CV'ga tushadi.
Mentor tasdiqlasa yana {bonus}% bonus qo'shiladi va ish eng yuqori ishonch darajasini oladi. Mentor rad etsa berilgan ball qaytarib olinadi.
Qaytarilgan ishni izohlarga qarab tuzatib, qayta topshirish mumkin.
Mentorga savol: topshiriq ichidagi "Mentorga savol" bo'limida; javob shu yerda chiqadi va botga keladi, savol-javobni yo'nalishdagi hamma ko'radi.
Tengdoshni tekshirish: Topshiriqlar -> "Boshqalarni tekshirish"da faqat o'z haftalik dasturingizdagi ishlar; kamida 10 belgili yozma izoh kerak; har bir baho uchun +{review_points} ball.
Start topshirig'i: ilovaning o'zida bajariladi. Kerak: ism va familiya, soha yoki sarlavha (5+ belgi), o'zingiz haqingizda (30+ belgi),
kamida 1 ko'nikma va kamida 1 til. CV'ni ochiq qilish, GitHub va LinkedIn ixtiyoriy.
Haftalik seriya: har hafta kamida bitta ish topshirsangiz yoki baholasangiz, seriya davom etadi.
Chellenjlar: Topshiriqlar -> "Korxona topshiriqlari" ro'yxatida. Mentor tashkil qilgan muddatli musobaqa; ish topshirasiz, mentor baholaydi; 1-3-o'rinlar +30, +20, +10 bonus ball oladi, natija CV'ga tushadi.
Talabalikni tasdiqlash: Profil va portfolio -> o'ng ustundagi "Talabalikni tasdiqlashga yuborish" -> universitet karyera markazi yoki admin tasdiqlagach
"Talabalik tasdiqlangan" belgisi profil va CV'da chiqadi. HEMIS talaba raqami ixtiyoriy.
CV: Sozlamalar yoki profilning "Ko'rinish" kartochkasida CV'ni ochiq qilsangiz, havolasini ish beruvchiga yuborish mumkin. Unda tasdiqlangan
ishlar kim tasdiqlagani bilan, o'zingiz qo'shgan tajriba, loyiha va sertifikatlar "o'zi kiritgan" belgisi bilan chiqadi.
Vakansiyalar va kompaniyalar: kompaniyalarni admin STIR bo'yicha tekshiradi. Tasdiqlangan kompaniyalar talabalarni reyting bo'yicha
ism-familiya, universitet, kurs, guruh, natijalar va CV bilan ko'radi va CV'ni PDF qilib yuklab oladi. Telefon raqam faqat talaba
ariza bersa yoki kompaniyaning bog'lanish so'roviga rozi bo'lsa ochiladi. "Ishga tayyorman" yoqilsa, "ish izlayotganlar" ro'yxatida chiqasiz.
Kompaniya testlari: Arizalarim -> "Testlar". Kompaniya test yoki so'rovnoma e'lon qiladi (admin tasdiqlagandan keyin chiqadi).
Testni faqat bir marta ishlash mumkin; vaqt chegarasi bo'lsa, taymer tugaganda javoblar o'zi topshiriladi. Variantli savollar darhol
tekshiriladi, yozma javoblarni kompaniya baholaydi va bot xabar beradi. Natija o'sha kompaniyaga ko'rinadi.
CV'ni PDF qilib yuklab olish: Profil va portfolio -> "CV (PDF)" yoki Sozlamalar.
Do'stlarni taklif qilish: Sozlamalardagi taklif kartochkasidagi havolani yuboring; taklif qilganlar soni hisoblanadi.
Mentorlar: topshiriq qo'shadi, chellenj tashkil qiladi, savollarga javob beradi, ishlarni tekshiradi (Mentor bo'limi).
Kompaniyalar ilovaga birinchi kirganda "Ish beruvchi"ni tanlab ro'yxatdan o'tadi; universitet karyera markazi xodimi maxsus havola orqali kiradi."""


SIGNUP_GUIDE = """TalantGo nima: talabalar uchun karyera platformasi. Talabalar haftalik amaliy topshiriqlar bajarib tasdiqlangan portfolio (CV)
yig'adi, kompaniyalar esa ularni reyting bo'yicha ko'rib, amaliyot va ishga oladi. Ilova Telegram ichida (@{bot}) va kompyuterda sayt
sifatida ({url}) ishlaydi. Talabalar uchun bepul; kompaniyalar uchun asosiy imkoniyatlar ham hozircha bepul.

Ro'yxatdan o'tish: birinchi ekranda ikki tanlov bor.
1) "Ish izlovchi" (talaba). 3 qadam, qizil yulduzcha (*) bilan belgilanganlar majburiy:
   1-qadam "Shaxsiy": ism va familiya; telefon (Telegram orqali ulashish yoki qo'lda +998 raqam, keyin "Saqlash").
   2-qadam "O'qish joyi": universitet (nomini yozib qidiring, qisqa nomi yoki ruscha ham topiladi; ro'yxatda bo'lmasa "Ro'yxatda yo'q:
   ... qo'shish"); fakultet (universitet tanlangach ro'yxat chiqadi, topilmasa "Boshqa" deb o'zi yoziladi); kurs (1-6 yoki
   magistratura); guruh (masalan 114-25).
   3-qadam "Yo'nalish": qaysi kasb yo'nalishlarida ishlay oladi (1-5 ta: {fields}); ish turi (amaliyot, yarim stavka, junior, loyiha);
   qaysi hududda ishlay oladi (viloyat); shaxsiy ma'lumotlarga rozilik. Ixtiyoriy: qaysi tarmoqlar qiziq ({industries}).
   Haftalik dastur (Data Analytics va boshqalar) ro'yxatdan o'tishda so'ralmaydi: xohlasa keyin "Topshiriqlar"da tanlanadi.
   Rasm, ko'nikmalar, tillar, tajriba, loyihalar va sertifikatlar keyin "Profil va portfolio"da to'ldiriladi.
2) "Ish beruvchi" (kompaniya HR). Majburiy: mas'ul shaxsning ism-familiyasi, lavozimi va telefoni; kompaniya nomi; kompaniya turi
   ({legal_forms}); soha ({industries}); xodimlar soni ({sizes}); viloyat / shahar; STIR (9 raqam); kompaniya haqida (kamida 20 belgi);
   rozilik. Ixtiyoriy: sayt, Telegram kanal, email, ofis manzili. "Saqlash va tekshiruvga yuborish"dan keyin admin STIR'ni davlat
   reyestrida tekshiradi (odatda 1 ish kuni), tasdiqlangach botdan xabar keladi va kompaniya paneli ochiladi.
Forma qoidasi: "Saqlash" bosilganda to'ldirilmagan majburiy maydonlar qizil bo'ladi va ilova birinchisiga o'zi olib boradi.
Ish beruvchi paneli: Talabalar (reyting, filtrlar, profil, CV PDF), Vakansiyalarim, Testlar, Guruhlar, Profilim.
Talaba ilovasi: Bosh sahifa, Vakansiyalar, Topshiriqlar, Arizalarim, Xabarlar, Tadbirlar, Universitetim, Hamjamiyat, Profil va portfolio, Sozlamalar.
Maxfiylik: tasdiqlangan kompaniyalar talabaning ismi, o'qishi, natijalari va CV'sini ko'radi; telefon raqami faqat talaba ariza bersa
yoki bog'lanishga rozi bo'lsa ochiladi."""


EMPLOYER_GUIDE = """TalantGo nima: talabalar uchun karyera platformasi. Talabalar haftalik amaliy topshiriqlar bajaradi; ishlarini tengdoshlar,
mentor va AI tekshiradi, tasdiqlangan ishlar avtomatik CV'ga tushadi. Kompaniya shu tasdiqlangan natijalarga qarab nomzod tanlaydi.
Ilova Telegram ichida (@{bot}) va kompyuterda sayt sifatida ({url}) ishlaydi. Bildirishnomalar botga keladi.

Kompaniyani ro'yxatdan o'tkazish: 4 qadam (chapda bosqichlar; chala forma shu qurilmada saqlanib turadi).
1. Mas'ul shaxs: ism-familiya, lavozim, telefon, kompaniyadagi rol: direktor / ta'sischi yoki vakil (xodim). Vakil bo'lsa,
   direktor imzosi bilan vakolat xati yoki ishonchnoma yuklanadi.
2. Kompaniya: nomi, STIR (9 raqam), yuridik shakl (MChJ, AJ, YaTT, Boshqa), kompaniya turi (xususiy, davlat, xorijiy yoki qo'shma,
   startap, notijorat), soha ({industries}), xodimlar soni, viloyat / shahar, kompaniya haqida (kamida 50 belgi),
   logotip (ixtiyoriy: PNG, JPG yoki WEBP).
3. Tekshiruv hujjatlari: guvohnoma yoki ustav (PDF yoki rasm, majburiy, faqat admin ko'radi); ixtiyoriy aloqa: sayt, Telegram kanal,
   HR emaili, ofis manzili.
4. Hamkorlik: hamkorlik turi (kamida bittasi: stajirovka, yarim stavka yoki masofaviy ish, to'liq stavkali junior, real loyihalar,
   namunaviy test, hakaton, dual ta'lim), qaysi yo'nalishdagi talabalar kerak, rozilik, hamkorlar ro'yxatida ko'rinish (ixtiyoriy).
Admin STIR'ni davlat reyestri va hujjat bilan solishtiradi (odatda 1 ish kuni). Kutish ekranida: navbatdagi o'rin, yuborilganiga
qancha bo'ldi, odatiy tekshiruv vaqti, platformadagi talabalar (sohangizda nechtasi), kutish vaqtida tayyorgarlik ro'yxati va
tasdiqdan keyin ochiladigan bo'limlar; ma'lumotlarni shu yerdan tahrirlash mumkin. Rad etilsa, admin izohi chiqadi:
"To'g'rilab qayta yuborish" ni bosing, ariza navbatga qaytadi. Kompaniya nomi yoki STIR keyinroq o'zgarsa, kompaniya qayta tekshiriladi.

Panel bo'limlari (kompyuterda chap menyu guruhlari: Asosiy, Yollash, Talabalarni sinash, Hamkorlik, Kompaniya; telefonda pastki
menyu va "Yana"). Menyudagi qizil raqamlar: ko'rilmagan arizalar, baholanmagan ishlar va testlar, universitet so'rovlari.
- Bosh sahifa: birinchi qadamlar (profil, vakansiya, vazifa, test, universitet bilan hamkorlik), ko'rsatkichlar (faol vakansiyalar,
  kelgan arizalar, suhbatlar, ishga olinganlar; oldingi davr bilan solishtirish), arizalar dinamikasi grafigi, bosqichlar voronkasi,
  vakansiyalar samaradorligi (ko'rishlar, arizalar, konversiya), "E'tibor talab qiladi" ro'yxati, yaqin suhbatlar, ish joyini
  tasdiqlash so'rovlari (talaba shu yerda ishlashini tasdiqlash uning universiteti statistikasiga kiradi), profil to'liqligi.
  Davr: 7, 30, 90 yoki 365 kun.
- Nomzodlar: barcha arizalar doska (bosqichlar ustunlari) yoki jadval ko'rinishida, vakansiya va ism bo'yicha filtr. Kartani bossangiz
  ariza ochiladi: keyingi bosqich, suhbatga taklif (sana va joy), taklif, ishga olish yoki rad etish (talabaga xabar boradi).
  Moslik foizi: ko'nikmalar mosligi 70% va yo'nalish mosligi 30%.
- Vakansiyalarim: holat tablari (e'lon qilingan, tekshiruvda, qaytarilgan, yopilgan); har kartada ko'rishlar, arizalar, konversiya va
  ariza muddati. "Vakansiya qo'shish": majburiy: lavozim, ish turi (amaliyot, yarim stavka, junior, loyiha), format (ofis, masofaviy,
  aralash), shahar, vazifalar (kamida 20 belgi), platforma qoidalarini tasdiqlash (MLM va faqat foizga ishlash emas, talabadan pul
  olinmaydi). Ixtiyoriy: soat, maosh oralig'i, talablar, ko'nikmalar, kasb yo'nalishi, mos yo'nalishlar, ariza muddati, malakaviy
  amaliyot sifatida rasmiylashtirish. Forma yonida talabalar ko'radigan ko'rinish chiqadi. Har bir e'lon admin tekshiruvidan keyin
  chiqadi; tahrirlangan e'lon qayta tekshiriladi.
- Talabalar: barcha talabalar reyting bo'yicha (ball faqat tasdiqlangan ishlar uchun). Chapdagi filtrlar: qidiruv (ism, guruh, fakultet),
  universitet, yo'nalish, soha, kurs, ish turi, "Talabaligi tasdiqlanganlar", "Faqat ish izlayotganlar"; tartib: reyting, test natijasi
  yoki yangilar. "Profil": o'qish, ko'nikmalar, tasdiqlangan ishlar, portfolio, sizning testlaringizdagi natijalar. "CV" PDF yuklab
  oladi. "Vazifa berish" shu talabaga vazifa ochadi. "Bog'lanish so'rovi" (kuniga 20 tagacha): talaba rozi bo'lsa, ismi va kontaktlari
  ochiladi; telefon va Telegram faqat talaba ariza bersa yoki so'rovingizga rozi bo'lsa ko'rinadi. Yuborilgan so'rovlar
  "Bog'lanish so'rovlari" tabida.
- Vazifalar: real ishga o'xshash vazifa (hammaga, yo'nalishga, bitta universitetga yoki tanlangan talabalarga), ball (0–50), tugash
  sanasi, sovrin. Ishlarni baholaysiz: qabul qilish yoki rad etish, baho va izoh, 1–3-o'rin (+30, +20, +10 bonus ball). Qabul qilingan
  ish talabaning CV'siga yoziladi.
- Universitetlar: hamkorlar birinchi, keyin tasdiqlangan talabalari ko'plari; tablar: hammasi, hamkorlar, so'rovlar. Universitet
  sahifasida bandlik ko'rsatkichlari, hamkorlik taklifi va shu universitet talabalarini ko'rish.
- Testlar: "Test yoki so'rovnoma yaratish". Nomi, izoh, kimga ko'rinadi (barcha talabalar, tanlangan yo'nalishlar yoki vakansiyaga
  ariza berganlar), vakansiyaga bog'lash, muddat, vaqt chegarasi (daqiqa). Savol turlari: bitta javobli, bir nechta javobli (to'g'ri
  javoblarni belgilang, avtomatik tekshiriladi), yozma javob (ballni o'zingiz qo'yasiz). Ball 0 bo'lsa, oddiy so'rovnoma savoli.
  "Saqlash va tekshiruvga yuborish" yoki "Qoralama". Admin tasdiqlagach test talabalarga chiqadi va mos talabalarga bot xabar beradi.
  Talaba testni bir marta ishlaydi. "Natijalar": reyting (ball bo'yicha), "Baholash" (yozma javobga ball va izoh, umumiy fikr).
  Kimdir ishlay boshlagach savollarni o'zgartirib bo'lmaydi: yangi test yarating. Testni yopish yoki (natija bo'lmasa) o'chirish mumkin.
- Xabarlar: talaba bilan yozishma. Faqat sizning vakansiyangizga ariza bergan yoki bog'lanish so'rovingizga rozi bo'lgan talabaga
  yozish mumkin (talaba kartochkasida "Xabar yozish"). Talaba suhbatni yopsa, u yozmaguncha xabar yuborib bo'lmaydi.
- Tadbirlar: ochiq eshiklar kuni, vebinar, hakaton e'lon qilish; barcha talabalar "Tadbirlar" bo'limida ko'radi va ro'yxatdan o'tadi,
  ro'yxatdan o'tganlarning ismi, universiteti va kursi sizga ko'rinadi; tadbirni tahrirlash va bekor qilish mumkin.
- Guruhlar: hamjamiyat chatlari.
- Profilim: logotip, kompaniya ma'lumotlari, mas'ul shaxs, hamkorlik, hujjatlar va kirish usullari; profil to'liqligi va kompaniyaning
  ommaviy sahifasiga havola."""

EMPLOYER_RULES = """Siz TalantGo AI: TalantGo platformasining yordamchisisiz. Hozir kompaniya vakili (HR) bilan gaplashyapsiz.
Vazifangiz: kompaniyani ro'yxatdan o'tkazish, panelning har bir bo'limidan foydalanish, vakansiya va test tuzish, nomzod tanlash,
intervyu va stajirovka dasturini tashkil qilish bo'yicha amaliy maslahat berish.
Qoidalar:
- Foydalanuvchi qaysi tilda yozsa, shu tilda javob bering; odatda o'zbek tilida (lotin yozuvida), "siz" deb.
- Qisqa va aniq yozing: odatda 2-8 qator. Qadamlarni "1." "2." yoki "- " bilan yozing. Markdown belgilari (**, #) va emoji ishlatmang.
- Platforma haqida faqat quyidagi qo'llanmaga tayaning. Unda yo'q narsani to'qimang: bilmasangiz, admin bilan bog'lanishni maslahat bering.
- Talabalarning shaxsiy ma'lumotlarini oshkor qilmang va ularni boshqa maqsadda ishlatishni maslahat bermang. Talabadan pul,
  pasport yoki karta ma'lumoti so'rash platforma qoidalariga zid.
- Vakansiya yoki test matnini yozishda yordam so'rasa, tayyor qoralama bering."""

SIGNUP_RULES = """Siz TalantGo AI: TalantGo platformasining yordamchisisiz. Foydalanuvchi hali ro'yxatdan o'tishni tugatmagan.
Vazifangiz: platforma nima ekanini, qaysi yo'lni tanlash kerakligini (talaba bo'lsa "Ish izlovchi", kompaniya bo'lsa "Ish beruvchi")
va formani qanday to'ldirishni qadam-baqadam tushuntirish.
Qoidalar:
- Foydalanuvchi qaysi tilda yozsa, shu tilda javob bering; odatda o'zbek tilida (lotin yozuvida), "siz" deb.
- Qisqa va aniq yozing: odatda 2-8 qator. Qadamlarni "1." "2." yoki "- " bilan yozing. Markdown belgilari (**, #) va emoji ishlatmang.
- Platforma haqida faqat quyidagi qo'llanmaga tayaning. Unda yo'q narsani to'qimang: bilmasangiz, admin bilan bog'lanishni maslahat bering.
- Foydalanuvchining holatidagi "to'ldirilmagan maydonlar" ro'yxatidan foydalanib, nimani to'ldirish qolganini aniq ayting."""

RULES = """Siz TalantGo AI: TalantGo platformasining yordamchisisiz.
Vazifangiz: talabaga platformadan foydalanishni tushuntirish, keyingi qadamni aniq aytish, o'qish va karyera bo'yicha
(Excel, Power BI, SQL, Stata, Python, statistika, CV, intervyu, amaliyot) maslahat berish.
Qoidalar:
- Talaba qaysi tilda yozsa, shu tilda javob bering; odatda o'zbek tilida (lotin yozuvida), "siz" deb.
- Qisqa va aniq yozing: odatda 2-8 qator. Qadamlarni "1." "2." yoki "- " bilan yozing. Markdown belgilari (**, #) va emoji ishlatmang.
- Platforma haqida faqat quyidagi qo'llanmaga tayaning. Unda yo'q narsani to'qimang: bilmasangiz, mentordan
  ("Mentorga savol") yoki admin'dan so'rashni maslahat bering.
- Joriy topshiriqni talaba o'rniga to'liq bajarib bermang: tushuntiring, yo'l-yo'riq va kichik misol bering. Ishni AI, tengdosh va
  mentor tekshiradi, CV'ga faqat o'z ishi tushishi kerak.
- Talabaning holati haqidagi ma'lumot faqat shu talabaniki: undan "keyingi qadam" maslahati uchun foydalaning.
- Mavzudan juda uzoq savollarga (siyosat, shaxsiy masalalar) qisqa va hurmat bilan javob berib, o'qish va karyera mavzusiga qayting."""


def audience(user: User) -> str:
    """student, employer or signup (not finished signing up yet: the questions are about registering)."""
    if user.account_type == "employer":
        return "employer"
    if user.account_type == "university" or signup_missing(user):
        return "signup"
    return "student"


def _lists() -> dict:
    return {"industries": ", ".join(INDUSTRIES.values()), "legal_forms": ", ".join(LEGAL_FORMS.values()),
            "sizes": ", ".join(COMPANY_SIZES.values()), "fields": ", ".join(JOB_FIELDS.values())}


async def system_prompt(session: AsyncSession, user: User, ai_review_on: bool) -> str:
    bot = await bots.username(session) or "talantgo_bot"
    kind = audience(user)
    if kind == "employer":
        guide = EMPLOYER_GUIDE.format(bot=bot, url=settings.public_url, **_lists())
        return (f"{EMPLOYER_RULES}\n\n--- Qo'llanma\n{guide}\n\n--- Kompaniyaning holati (bugun {today().isoformat()})\n"
                f"{await _employer_snapshot(session, user)}")
    if kind == "signup":
        guide = SIGNUP_GUIDE.format(bot=bot, url=settings.public_url, **_lists())
        return f"{SIGNUP_RULES}\n\n--- Qo'llanma\n{guide}\n\n--- Foydalanuvchining holati\n{_signup_snapshot(user)}"
    rules = await get_rules(session)
    guide = GUIDE.format(
        bot=bot, url=settings.public_url, peers=rules.peer_approvals_required, bonus=rules.mentor_bonus_percent,
        review_points=rules.review_points,
        ai_line="ish topshirilgach AI yordamchi bir daqiqa ichida tekshirib izoh yozadi va uning bahosi bitta tengdosh ovozi hisoblanadi;"
                if ai_review_on else "ishni tengdoshlar tekshiradi;")
    return f"{RULES}\n\n--- Qo'llanma\n{guide}\n\n--- Talabaning holati (bugun {today().isoformat()})\n{await _snapshot(session, user)}"


FIELD_LABEL = {
    "full_name": "ism va familiya", "phone": "telefon", "university": "universitet", "faculty": "fakultet / mutaxassislik",
    "course": "kurs", "group": "guruh", "track": "TalantGo yo'nalishi", "work_industries": "qaysi sohada ishlamoqchi",
    "job_types": "ish turi", "job_fields": "qaysi kasb yo'nalishlarida ishlay oladi", "consent": "rozilik", "job_title": "lavozim", "company": "kompaniya ma'lumotlari",
    "name": "kompaniya nomi", "legal_form": "kompaniya turi", "industry": "soha", "size": "xodimlar soni",
    "city": "viloyat / shahar", "stir": "STIR", "description": "kompaniya haqida",
}


def _signup_snapshot(user: User) -> str:
    missing = signup_missing(user)
    if user.account_type == "university":
        state = f"universitet xodimi sifatida so'rov yuborgan; holati: {user.staff_status or 'yuborilmagan'}"
    elif user.consent_at is None and user.track_id is None:
        state = "hali yo'l tanlamagan: birinchi ekranda 'Ish izlovchi' yoki 'Ish beruvchi'ni tanlashi kerak"
    else:
        state = "ish izlovchi formasini to'ldirmoqda"
    lines = [f"Telegram'dagi ismi: {user.full_name}", f"Holati: {state}"]
    if missing and user.account_type != "university":
        lines.append("To'ldirilmagan majburiy maydonlar: " + ", ".join(FIELD_LABEL.get(m, m) for m in missing))
    return "\n".join(lines)


async def _employer_snapshot(session: AsyncSession, user: User) -> str:
    c = user.company
    if c is None:
        return "Kompaniya hali ro'yxatdan o'tkazilmagan."
    status = {"pending": "admin tekshirmoqda", "approved": "tasdiqlangan", "rejected": f"rad etilgan (izoh: {c.review_note or '-'})"}
    lines = [f"Mas'ul shaxs: {user.full_name}, {user.job_title or 'lavozim kiritilmagan'}",
             f"Kompaniya: {c.name}; holati: {status.get(c.status, c.status)}; soha: {INDUSTRIES.get(c.industry, c.industry or '-')}"]
    missing = signup_missing(user)
    if missing:
        lines.append("Profilda to'ldirilmagan majburiy maydonlar: " + ", ".join(FIELD_LABEL.get(m, m) for m in missing))
    jobs = dict((await session.execute(select(Job.status, func.count()).where(Job.company_id == c.id).group_by(Job.status))).all())
    if jobs:
        lines.append("Vakansiyalar: " + ", ".join(f"{k} {v}" for k, v in jobs.items()))
    apps = await session.scalar(select(func.count()).select_from(Application).join(Job).where(
        Job.company_id == c.id, Application.status == "new"))
    if apps:
        lines.append(f"Ko'rilmagan arizalar: {apps}")
    tests = dict((await session.execute(select(CompanyTest.status, func.count()).where(CompanyTest.company_id == c.id)
                                        .group_by(CompanyTest.status))).all())
    if tests:
        lines.append("Testlar: " + ", ".join(f"{k} {v}" for k, v in tests.items()))
    to_grade = await session.scalar(select(func.count()).select_from(TestAttempt).join(CompanyTest, CompanyTest.id == TestAttempt.test_id)
                                    .where(CompanyTest.company_id == c.id, TestAttempt.status == "submitted"))
    if to_grade:
        lines.append(f"Baholashni kutayotgan test javoblari: {to_grade}")
    contacts = await session.scalar(select(func.count()).select_from(ContactRequest).where(ContactRequest.company_id == c.id))
    if contacts:
        lines.append(f"Yuborilgan bog'lanish so'rovlari: {contacts}")
    return "\n".join(lines)


async def _snapshot(session: AsyncSession, user: User) -> str:
    lines = [
        f"Ism: {user.full_name}; rol: {'mentor' if user.role is not Role.student else 'talaba'}",
        f"Yo'nalish: {user.track.title if user.track_id and user.track else 'tanlanmagan'}",
        f"Ball: {user.points}; umumiy o'rin: {await rank_of(session, user)}; haftalik seriya: {current_streak(user)}",
        f"Universitet: {user.university_ref.name if user.university_ref else 'kiritilmagan'}; kurs: {user.course or 'kiritilmagan'}",
        f"Talabalik tasdig'i: {dict(none='so`ralmagan', pending='admin ko`rib chiqmoqda', verified='tasdiqlangan', rejected='rad etilgan').get(user.verification, user.verification)}",
    ]
    info = completeness(user)
    lines.append(f"Profil to'liqligi: {info['percent']}%" + (f"; yetishmaydi: {', '.join(info['missing'])}" if info["missing"] else ""))
    if user.track_id:
        tasks = (await session.execute(select(Task).where(Task.track_id == user.track_id, Task.is_active)
                                       .order_by(Task.sort_order))).scalars().all()
        mine = {s.task_id: s for s in (await session.execute(select(Submission).where(
            Submission.user_id == user.id, Submission.task_id.in_([t.id for t in tasks])))).scalars()}
        lines.append("Topshiriqlar:")
        for t in tasks[:25]:
            sub = mine.get(t.id)
            state = STATUS_LABEL[sub.status] if sub else "hali topshirilmagan"
            lines.append(f"- {'Start' if t.kind == 'profile' else f'{t.week}-hafta'}: {t.title} ({t.points} ball) - {state}")
    now = datetime.now(UTC)
    challenges = (await session.execute(select(Challenge).where(
        Challenge.is_archived.is_(False), Challenge.ends_at > now, Challenge.starts_at <= now,
        (Challenge.track_id.is_(None)) | (Challenge.track_id == user.track_id)).limit(5))).scalars().all()
    if challenges:
        lines.append("Davom etayotgan chellenjlar: " + "; ".join(c.title for c in challenges))
    return "\n".join(lines).replace("`", "'")
