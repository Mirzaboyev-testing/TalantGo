# TalantGo

A platform that connects students, companies and universities in Uzbekistan. Students build verified
experience while they study, companies hire people whose work they have already seen, and universities see
where their students actually get placed.

Try it: Telegram Mini App [@talantgo_bot](https://t.me/talantgo_bot) or the website
https://careerflow.2-28-27-205.sslip.io

## Three panels

| Panel | What it does |
|---|---|
| Student | Career path with weekly tasks, jobs and applications (interview and offer stages), company tasks and tests, "My university", a CV that lists only verified work |
| Company | Hiring funnel, candidates table, vacancies, tasks for students, tests, partnerships with universities; confirms students' job and internship records |
| University | Placement statistics, student verification, student list and CSV export, partnerships with companies, recommending jobs to its students, public university page |
| Admin | Moderation queue, companies, vacancies, universities, complaints, placement records, ranking, roles (owner, admin, moderator, analyst), audit log |

Public pages (no sign-in): home, jobs, companies, universities and the university ranking.
User screens are in Uzbek, Russian and English.

## Trust rules

- Student work gets a first-pass review from Google Gemini, then peers and a mentor confirm it. Only confirmed
  work goes on the CV.
- A student counts as placed only when a company confirmed the job or internship: a hire on the platform, or
  the company confirmed the student's own record. University confirmations are kept but shown apart.
- University placement shares and the ranking stay hidden until a university has at least 10 verified students.
- Companies see a student's name and CV only with the student's consent; phone and Telegram open after an
  application or an accepted contact request.

## Stack

FastAPI, async SQLAlchemy, PostgreSQL 16, React 19 + Vite + TypeScript, Telegram Bot API and Mini App,
Google Gemini. One Docker image serves the API and the built web app.

## Run locally

Needs Docker. Containers are named `careerflow-*` (the product's earlier name); ports 8090 (app) and 5434 (database).

```bash
docker compose up -d --build
```

Settings: copy `.env.example` to `.env` and fill it in (optional locally; see the comments in that file).

- App: http://localhost:8090 (with `APP_ENV=dev` a test sign-in replaces Telegram)
- Admin: http://localhost:8090/admin
- API docs (dev only): http://localhost:8090/api/docs

Tests:

```bash
docker compose exec -e DATABASE_URL=postgresql+asyncpg://careerflow:careerflow_dev@db:5432/careerflow_test api pytest -q
```

Frontend with hot reload: `cd frontend && npm run dev` (http://localhost:5173, API proxied to 8090).

## Layout

```
backend/app/core      config, database, schema upgrades, security (Telegram initData HMAC, tokens, encryption)
backend/app/models.py tables
backend/app/services  applications, placement records, ranking, partnerships, AI review, CV, Telegram bot
backend/app/api       HTTP routes (public, student, company, university, admin)
frontend/src          React app: public site, three panels, admin site at /admin
deploy/               server setup, Caddy block, daily database backup
docs/                 product notes and plans (Uzbek)
```
