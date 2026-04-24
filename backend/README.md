# SkillBridge Backend (MySQL)

Backend now uses **MySQL** (not `db.json`) and matches your frontend `app.js` fetch flow.

## 1) MySQL setup

Create DB + tables:

```bash
mysql -u root -p < backend/schema.sql
```

## 2) Install dependency

```bash
cd backend
npm install
```

This installs `mysql2`.

## 3) Configure connection

Create `.env` file from `.env.example` in `backend/`:

```bash
copy .env.example .env
```

Then edit `.env` with your MySQL password.

`server.js` auto-loads `.env` (no extra package needed).

## 4) Run backend

```bash
cd backend
npm start
```

Server: `http://localhost:4000`

## API Endpoints

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/users/:email`
- `PATCH /api/users/:email`
- `GET /api/gigs?ownerEmail=`
- `POST /api/gigs`
- `GET /api/jobs?category=&ownerEmail=`
- `POST /api/jobs`
- `POST /api/jobs/:jobId/apply`
- `GET /api/orders?email=`
- `PATCH /api/applications/:id`
- `POST /api/support`

## Notes

- Frontend is already wired to `http://localhost:4000/api`.
- Keep backend running while testing frontend pages.
- `db.json` is legacy and no longer used by server.
