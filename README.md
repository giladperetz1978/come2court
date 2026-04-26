# YomShishi 3x3 PWA

Closed-group app for managing Friday 3v3 basketball games with automatic waitlist logic and push reminders.

## Architecture

- Frontend: React + Vite + TypeScript, mobile-first RTL Hebrew UI, installable PWA.
- Backend: Node.js + Express, SQLite-compatible storage via `sql.js` persisted to disk (`backend/data/yomshishi.sqlite`).
- Registration: one-time by name + email, user id stored in localStorage and used for future actions.
- Group policy: only pre-approved emails can register (`APPROVED_EMAILS`).

## Game Rules Implemented

- OPEN: 0-5 players
- CONFIRMED: 6-9 players
- WAITING: 10-11 players (positions 10-11 in waiting list)
- LOCKED: 12 players (all must attend)
- On drop from 12 to 11, positions 10-11 return to waiting.

## Local Run (No Admin Required)

1. Backend:
   - Copy `backend/.env.example` to `backend/.env` and set values.
   - Run `npm install` in backend.
   - Run `npm run dev` in backend.
2. Frontend:
   - Copy `frontend/.env.example` to `frontend/.env`.
   - Set `VITE_API_BASE_URL`.
   - Run `npm install` in frontend.
   - Run `npm run dev` in frontend.

## Push Notifications

- Generate VAPID keys (example):
  - `npx web-push generate-vapid-keys`
- Put keys in `backend/.env`.
- Trigger reminder endpoint using POST `/api/games/current/remind` with secret from `REMINDER_SECRET`.

## GitHub Pages

- Workflow: `.github/workflows/deploy-pages.yml`
- Required repository variable: `VITE_API_BASE_URL` (public backend URL).

## Contabo Deployment

- Workflow: `.github/workflows/deploy-contabo.yml`
- Add secrets:
  - `CONTABO_HOST`
  - `CONTABO_USER`
  - `CONTABO_SSH_KEY`
