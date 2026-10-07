# CareerFlow

Telegram WebApp for students: choose a career path, complete weekly tasks, get them verified by
peers and a mentor, and share a CV that contains only verified work.

## Run locally

Needs Docker Desktop. Everything runs in containers named `careerflow-*`; ports 8090 (app) and 5434 (database).

```bash
docker compose up -d --build
```

- App: http://localhost:8090 (with `APP_ENV=dev` a test sign-in replaces Telegram)
- Admin: http://localhost:8090/admin (password: `ADMIN_PASSWORD` in `.env`)
- API docs (dev only): http://localhost:8090/api/docs

Tests:

```bash
docker compose exec -e DATABASE_URL=postgresql+asyncpg://careerflow:careerflow_dev@db:5432/careerflow_test api pytest -q
```

Frontend with hot reload: `cd frontend && npm run dev` (http://localhost:5173, API proxied to 8090).

## Trust rules

| Step | Who | Effect |
|---|---|---|
| Submit | Student | Proof link for a task on their own path |
| Peer review | 2 students on the same path | 2 approvals: task points awarded; 2 rejections: returned |
| Mentor review | Mentor or admin | Approval: +50% bonus, highest trust; rejection: points taken back |
| Review reward | Peer reviewer | +2 points per written review (min. 10 characters) |

The public CV (`/cv/<slug>`) is off until the student turns it on, and lists who verified each item.

## Layout

```
backend/app/core      config, database, security (Telegram initData HMAC, tokens, encryption)
backend/app/models.py tables
backend/app/services  progress rules, CV, encrypted settings, Telegram Bot API
backend/app/api       HTTP routes
frontend/src          React app (Telegram theme), admin page at /admin
docs/                 product notes
```
