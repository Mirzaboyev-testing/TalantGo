# StudentFlow: g'oya va MVP

## Asosiy g'oya
Talaba o'z yo'lini tanlaydi (Backend, AI, Cybersecurity...), ilova uni shu yo'lda
bosqichma-bosqich olib boradi, bir xil yo'ldagi tengdoshlar bilan bog'laydi va
har bir qadamni **isbotlangan** holda portfolioga yozadi. Maqsad: O'zbekistondagi
eng ishonchli talaba portfoliosi va reytingi, u bilan ishga kirish mumkin bo'lsin.

## Ishonch qayerdan keladi (eng muhim qism)
O'zi yozgan "ko'nikmalar" hech narsaga arzimaydi. Portfolioga faqat tekshirilgan narsa tushadi:

| Daraja | Manba | Misol |
|---|---|---|
| Avtomatik | Tizim tekshiradi | GitHub OAuth orqali repo va commitlar, avtomatik tekshiriladigan topshiriqlar |
| Tengdosh | Shu yo'ldagi 2+ talaba baholaydi | Loyihaga code review |
| Mentor | O'qituvchi yoki kompaniya xodimi | Topshiriqni qabul qilish, imzo bilan |
| Kompaniya | Hakaton hakami | Hakaton natijasi |

Har bir yozuvda "kim tasdiqladi" ko'rinib turadi. Reyting faqat tasdiqlangan ballardan hisoblanadi.

## MVP (kursdoshlar bilan sinov)
1. Telegram orqali kirish, profil, yo'l tanlash.
2. Yo'l: haftalik topshiriqlar (milestone), isbot topshirish (GitHub link, demo).
3. Tasdiqlash: tengdosh baholashi va mentor tasdig'i.
4. Ball, streak, guruh ichidagi reyting.
5. Tengdosh topish: bir yo'ldagilar, "Yozish" tugmasi Telegram chatiga olib o'tadi.
6. Avtomatik CV sahifasi: faqat tasdiqlangan yutuqlar, ulashiladigan havola.
7. Admin panel: yo'llar va topshiriqlarni qo'shish, sozlamalar formada.

## Keyingi bosqichlar
- Kompaniyalar va hakatonlar, HR uchun qidiruv.
- AI: yo'l tanlashda maslahat, topshiriqlarni avtomatik tekshirish, CV matnini yozish.
- Story va qisqa videolar (demo uchun).
- Boshqa guruh va universitetlarga kengaytirish.

## Qilinmaydi
- O'z chat tizimi: Telegram'ning o'zi bor.

## Texnik stek
FastAPI, async SQLAlchemy, PostgreSQL, Pydantic v2, Telegram WebApp (React + Vite),
Docker, server: LAW.AI turgan Hetzner serveri (alohida konteynerlar).
Real ishga tushirishda shaxsiy ma'lumotlar O'zbekistondagi serverga ko'chiriladi.
