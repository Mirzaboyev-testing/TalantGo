# Topshiriqlar: musobaqalar, jamoalar va reytinglar

Sana: 2026-11-20. Holat: **qurilmoqda** (qarorlar 5-bo'limda, API shartnomasi 6-bo'limda). So'rov: «Topshiriqlar» bo'limini kuchaytirish:
talaba test va topshiriqlarda boshqalar orasidagi o'rnini, foizini, statistikasini ko'rsin; talabalar jamoa bo'lib
ham bellashsin, jamoa natijalari boshqa jamoalar bilan solishtirilib o'rinlarda ko'rsatilsin; korxona va universitetlar
loyiha/musobaqa bera olsin; reytinglar talabalarga doim ko'rinsin, saytning bosh sahifasida chiqishini admin hal qilsin.

## 1. Hozirgi holat (kod)

| Narsa | Bor | Yo'q |
|---|---|---|
| Korxona topshiriqlari (`Challenge`, `ChallengeEntry`) | individual ish, ball, 1–3 o'rin, top-10 natija | jamoa, statistika (o'rtacha, foiz, mening o'rnim) |
| Korxona testlari (`CompanyTest`, `TestAttempt`) | ball, korxona baholaydi | talaba uchun o'rni, foizi, o'rtacha, taqsimot |
| Hamjamiyat guruhlari (`Group`) | chat, taklif kodi | musobaqa jamoasi emas |
| Reyting | talabalar ballari, universitetlar bandligi | jamoalar reytingi, musobaqa reytingi, bosh sahifa |

## 2. Boshqa platformalardan o'rganilgani

- **Jamoa kodi**: sardor jamoa ochadi, platforma kod beradi, a'zolar shu kod bilan qo'shiladi (masalan, Hack-with-MAIT);
  HackerEarth'da sardor email yoki ishtirokchilar ro'yxatidan taklif qiladi, yoki talaba «a'zo qidirayotgan» jamoaga
  qo'shiladi.
- **Kaggle**: jamoa hajmi har musobaqada alohida (3, 8 yoki cheksiz); birlashish faqat muddatgacha va hajm oshmasa;
  reyting musobaqa paytida oraliq (public), oxirida yakuniy (private).
- **Kontest platformalari** (LeetCode, Codeforces): har natija yonida «N kishidan K-o'rin, eng yaxshi X%».

Xulosa: jamoaga qo'shilishning eng oddiy va xavfsiz yo'li **6 belgili kod + havola** (QR bilan), sardor a'zoni chiqara
oladi va kodni yangilay oladi; jamoa **ro'yxatdan o'tish muddatidan keyin qotadi**; har musobaqa jamoa hajmini
o'zi belgilaydi; bitta talaba bitta musobaqada faqat bitta jamoa uchun chiqadi.

## 3. Taklif etilgan tizim

**Topshiriqlar bo'limi yorliqlari**: Musobaqalar (yangi, birinchi) · Korxona topshiriqlari · Testlar · Jamoam (yangi) ·
Reyting (yangi) · Haftalik dastur · Boshqalarni tekshirish.

**Musobaqa** (`Competition`): tashkilotchi (korxona, universitet yoki Careerup admini), nomi, tavsif, sovrin,
turi `individual` yoki `team` (jamoa hajmi min–max), formati (loyiha/keys topshirish, tashkilotchi 0–100 baholaydi),
ro'yxatdan o'tish muddati, topshirish muddati, kimga (hamma / kasb yo'nalishi / universitet), holati
(e'lon qilingan → davom etmoqda → baholanmoqda → natijalar e'lon qilindi).

**Jamoa** (`Team`): nomi, sardori, a'zolari (2–5), kod, (ixtiyoriy) universitet. Talaba jamoa ochadi → kod/havola →
jamoadoshlar kod kiritib yoki havolani ochib qo'shiladi → sardor jamoani musobaqaga yozadi → bitta topshiriq
jamoa nomidan yuboriladi → ball jamoaga, o'rin ballari har bir a'zoga.

**Reytinglar**:
- Har musobaqada: o'rin, ball, foiz, ishtirokchilar soni, «eng yaxshi X%»; natijalar e'lon qilingach hamma talaba ko'radi.
- Testlarda: talaba o'z natijasi yonida «48 kishidan 5-o'rin · eng yaxshi 10% · o'rtacha 62%» va ball taqsimotini ko'radi.
- Umumiy: talabalar reytingi (ballar) va jamoalar reytingi (musobaqa ballari yig'indisi), universitet bo'yicha filtr.
- Bosh sahifa (sayt): «G'oliblar va top jamoalar» bloki, admin «Sayt kontenti»da yoqadi yoki o'chiradi.

**Tashkilotchilar paneli** (korxona va universitet): musobaqa yaratish, ishtirokchilar, baholash, natijalarni e'lon
qilish. Umumiy komponent talaba sessiyasida yoziladi, korxona va universitet panellariga ularning sessiyalari ulaydi.

## 4. Ish prompti (o'zimga)

> Careerup «Topshiriqlar» bo'limida individual va jamoaviy musobaqalar tizimini qur. Backend: `Competition`,
> `Team`, `TeamMember`, `CompetitionEntry` (individual yoki jamoa), statistika (o'rin, foiz, percentile, o'rtacha)
> testlar va musobaqalar uchun, umumiy talabalar va jamoalar reytingi, bosh sahifa uchun admin sozlamasi.
> Jamoaga qo'shilish: 6 belgili kod va havola, sardor chiqaradi va kodni yangilaydi, ro'yxatdan o'tish muddatidan
> keyin jamoa qotadi, bir talaba bir musobaqada bitta jamoada. Frontend: Topshiriqlar yorliqlari (Musobaqalar,
> Jamoam, Reyting), musobaqa sahifasi (shartlar, jamoa, topshirish, reyting), test natijasida statistika, bosh
> sahifa widgeti, saytdagi reyting bloki. Tashkilotchi komponenti korxona va universitet panellariga beriladi.
> Telefon va kompyuter, uz/ru/en, har backend qoidasiga test, alohida test bazasi, boshqa sessiyalar fayllariga
> faqat nuqtali o'zgartirish, faqat o'z fayllarini commit qilish.

## 5. Qarorlar (2026-11-20)

| Savol | Qaror |
|---|---|
| Jamoa turi | **Ikkalasi**: doimiy jamoa (katta va bosqichli musobaqalar uchun, jamoadoshlarni almashtirish mumkin) va bir martalik jamoa (kichik musobaqa uchun). Bitta talaba doimiy jamoada ham, bir martalik jamoada ham qatnashadi |
| Qo'shilish | 6 belgili kod yoki havola, darhol; sardor a'zoni chiqaradi va kodni yangilaydi |
| Tarkib | Istalgan universitet talabalari |
| Reyting | Jonli, jamoa nomlari va ismlar bilan; yakuniy o'rinlar natijalar e'lon qilingach |

O'zim qaror qildim (keyin o'zgartirish mumkin): bir talaba ko'pi bilan 2 ta doimiy jamoada; bitta musobaqada faqat bitta
jamoa uchun; korxona, universitet va admin musobaqa beradi, oldindan admin tasdig'i yo'q (admin yashira oladi, xuddi
topshiriqlardagidek); test statistikasi ismsiz (o'rin, foiz, percentile, o'rtacha, taqsimot); o'rin ballari 50/30/20
har bir a'zoga, doimiy jamoaga mavsum ballari; bosh sahifa bloki admin sozlamasi bilan.

## 6. API shartnomasi (backend va frontend agentlar uchun bitta manba)

Hamma yo'llar `/api/v1` ostida, JSON. Vaqtlar ISO (UTC). «Talaba» = account_type student; «tashkilotchi» = tasdiqlangan
korxona xodimi, tasdiqlangan universitet xodimi yoki admin.

### Turlar

```
PersonOut   = {user_id, name, photo_url|null, subtitle}                 // subtitle: "TDIU · Iqtisodiyot · 3-kurs"
TeamMember  = PersonOut & {role: "captain"|"member", joined_at}
TeamOut     = {id, name, kind: "persistent"|"one_time", competition_id|null, competition_title|null, description,
               captain_id, members: TeamMember[], size_max, points, competitions_n, wins, created_at,
               mine: bool, is_captain: bool,
               invite_code|null, invite_url|null}                        // kod va havola faqat a'zolarga
StageOut    = {id, order, title, description, starts_at, ends_at, advance_count|null,
               phase: "upcoming"|"open"|"reviewing"|"closed"}
Organizer   = {kind: "company"|"university"|"platform", id|null, name, logo_url|null}
Submission  = {stage_id, proof_url, note, files: {id,url,name}[], score|null, comment, submitted_at, reviewed_at|null,
               submitted_by: string}
MyEntry     = {id, team: TeamOut|null, status: "registered"|"eliminated"|"withdrawn"|"finished",
               place|null, rank|null, total_score|null, submissions: Submission[]}
Competition = {id, title, description, prize, organizer: Organizer, mode: "individual"|"team",
               team_kind: "any"|"persistent"|"one_time", team_min, team_max,
               audience: "all"|"fields"|"university", job_fields: string[], university_id|null,
               registration_ends_at, starts_at, ends_at, status: "draft"|"published"|"results"|"archived",
               phase: "upcoming"|"registration"|"running"|"reviewing"|"finished",   // hisoblanadi
               stages: StageOut[], entries_n, my_entry: MyEntry|null, can_register: bool, why_not: string|null,
               place_points: number[]}                                    // masalan [50, 30, 20]
LeaderRow   = {rank, entry_id, name, subtitle, photo_url|null, team_id|null, members: string[],
               score|null, percent|null, stage_reached, status, place|null, is_me}
Leaderboard = {rows: LeaderRow[], total, my_rank|null, my_percentile|null, average_percent|null, stage_id|null}
TestStats   = {my_score, max_score, percent, rank, of, percentile, average_percent, best_percent,
               distribution: number[10]}                                  // 0-10%, 10-20% … 90-100%, ismsiz
TeamRankRow = {rank, team_id, name, members_n, points, competitions_n, wins, universities: string[]}
```

### Talaba

- `GET /competitions?scope=open|mine|finished` → `Competition[]` (o'ziga ochiq: audience bo'yicha)
- `GET /competitions/{id}` → `Competition`
- `POST /competitions/{id}/register {team_id?}` → `Competition`. Individual: tanasiz. Jamoa: `team_id` (men sardori bo'lgan
  jamoa), a'zolar soni `team_min..team_max`, `team_kind` qoidasi (persistent faqat doimiy, one_time faqat bir martalik,
  any ikkalasi), jamoaning birorta a'zosi shu musobaqada boshqa jamoada bo'lmasligi, ro'yxatdan o'tish muddati.
- `POST /competitions/{id}/withdraw` → `Competition` (sardor yoki individual ishtirokchi, «running»gacha)
- `POST /competitions/{id}/stages/{stage_id}/submit {proof_url, note, file_ids}` → `MyEntry`. Bosqich ochiq, ishtirokchi
  chiqib ketmagan; jamoada istalgan a'zo yuboradi, muddatgacha oxirgisi hisoblanadi; havola yoki fayl majburiy.
- `GET /competitions/{id}/leaderboard?stage_id=` → `Leaderboard` (jonli, ismlar bilan, hamma tizimdagilar ko'radi)
- `GET /tests/{test_id}/stats` → `TestStats` (faqat o'z urinishi baholangan bo'lsa; 404 aks holda)

### Jamoalar

- `GET /teams/mine` → `TeamOut[]` (doimiy va bir martalik, faol a'zoligim)
- `POST /teams {name, kind, competition_id?, description?}` → `TeamOut`. Yaratuvchi sardor. Doimiy: talabada ≤ 2 ta;
  `size_max` 5. Bir martalik: `competition_id` shart, musobaqa `team` rejimida va `team_kind` any|one_time; `size_max` =
  musobaqaning `team_max`; jamoa avtomatik ro'yxatdan o'tmaydi (sardor register qiladi).
- `GET /teams/join/{code}` → `{id, name, kind, members_n, size_max, competition_title|null, captain_name}` (oldindan ko'rish)
- `POST /teams/join {code}` → `TeamOut` (darhol; to'lgan jamoa 409; jamoa ro'yxatdan o'tgan faol musobaqada qo'shiluvchi
  boshqa jamoada bo'lsa 409; arxivlangan 404)
- `POST /teams/{id}/leave` (sardor avval sardorlikni beradi; yolg'iz sardor chiqsa jamoa arxivlanadi)
- `DELETE /teams/{id}/members/{user_id}` (sardor; jamoadoshni almashtirish = chiqarish + yangisi kod bilan qo'shiladi)
- `POST /teams/{id}/captain {user_id}`, `POST /teams/{id}/code` (yangi kod), `PATCH /teams/{id} {name?, description?}`
- `GET /teams/{id}` → `TeamOut` (+ `history: [{competition_id, title, place|null, score|null}]`); kod faqat a'zolarga
- `GET /teams/ranking?university_id=` → `TeamRankRow[]` (doimiy jamoalar, mavsum ballari bo'yicha)

### Tashkilotchi (korxona, universitet: `/organizer/competitions`; admin: `/admin/competitions`, bir xil shakl)

- `GET ""` → `Competition[]` (o'zinikilar; admin — hammasi) + har birida `entries_n`, `to_score` (baholanmagan topshiriqlar)
- `POST "" {title, description, prize, mode, team_kind, team_min, team_max, audience, job_fields, university_id?,
  registration_ends_at, place_points?, stages: [{title, description, starts_at, ends_at, advance_count?}], publish: bool}`
  → `Competition`. Universitet xodimi `audience=university` bo'lsa faqat o'z universiteti. 1–5 bosqich, ketma-ket vaqtlar.
- `PATCH /{id}` (boshlanguncha hammasi; keyin faqat matn, sovrin), `POST /{id}/publish`, `POST /{id}/archive`
- `GET /{id}/entries?stage_id=` → `[{entry_id, name, team: TeamOut|null, members: PersonOut[], status, submission:
  Submission|null, total_score|null}]`
- `POST /{id}/stages/{stage_id}/score {entry_id, score: 0..100, comment}` → yangilangan qator
- `POST /{id}/stages/{stage_id}/close {advance_entry_ids?: int[]}` → bosqich yopiladi; `advance_count` bo'lsa eng yaxshi N
  (yoki berilgan ro'yxat) keyingi bosqichga o'tadi, qolganlari `eliminated`; bildirishnoma.
- `POST /{id}/results` → yakuniy natijalar: o'rinlar (yetgan bosqich ↓, o'sha bosqich bali ↓, jami ball ↓), o'rin
  ballari har bir ishtirokchiga yoki jamoa a'zosiga (`place_points`), doimiy jamoaga mavsum ballari; status `results`.
- Admin: `POST /admin/competitions/{id}/hide` / `restore`; `GET/PUT /admin/competitions/home {show: bool}` (saytning
  bosh sahifasida «G'oliblar va top jamoalar»). Har o'zgartiruvchi admin yo'l uchun `admin_access` RULES (ruxsat "tests").

### Sayt (ochiq)

- `GET /public/competitions/highlights` → `{show: bool, winners: [{competition_id, title, organizer, place, name, kind:
  "student"|"team"}], teams: TeamRankRow[5]}` (`show` false bo'lsa ro'yxatlar bo'sh)

### Bildirishnomalar (Uzbek matn saqlanadi, params ru/en uchun)

`competition_new` (auditoriyaga, e'lon qilinganda), `team_joined` (sardorga: {name, team}), `team_removed` ({team}),
`competition_scored` ({competition, stage, score}), `stage_advanced` / `stage_eliminated` ({competition, stage}),
`competition_results` ({competition, place}). Havolalar: `/talaba/topshiriqlar/musobaqalar?id=<id>`,
jamoa: `/talaba/topshiriqlar/jamoa?id=<id>`, qo'shilish havolasi: `/talaba/topshiriqlar/jamoa?kod=<CODE>`.
Yangi notif.* kalitlaridan keyin `cd frontend && npm run notif-templates`.

Qo'shimcha (2026-11-20): tashkilotchiga `competition_submission` ({competition, stage, name}), musobaqa bo'yicha
birlashadi (`group=comp:<id>`); havola korxonaga `/korxona/musobaqalar?c=<id>`, universitet xodimlariga
`/universitet/musobaqalar?c=<id>`. `CompetitionManager` manzildagi `?c=<id>` ni o'qib, o'sha musobaqani ochadi.
Admin GET yo'llari uchun ham qoida: `("GET", "/admin/competitions", "tests")`; admin menyusida `need: "tests"`.
