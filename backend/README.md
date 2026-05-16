# SkillBridge Backend (MySQL)

Backend now prefers **MySQL** and matches your frontend `app.js` fetch flow.
If MySQL is unavailable or credentials are wrong, the server automatically falls back to local `db.json` storage so the app can still run for development.

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
Also set `AUTH_SECRET` to a long random value before using real accounts.

`server.js` auto-loads `.env` (no extra package needed).

## 4) Run backend

```bash
cd backend
npm start
```

Server: `http://localhost:4000`

You can run either:

```bash
npm start
```

or:

```bash
npm run dev
```

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
- `db.json` is used as a local fallback when MySQL is not available in development. Set `ALLOW_JSON_FALLBACK=false` to disable it.
- Protected APIs require the bearer token returned by login/signup.
- Passwords are stored with salted PBKDF2 hashes; old SHA-256 hashes can still log in for compatibility.

## Checks

```bash
npm run check
npm test
```
