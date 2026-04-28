# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repository is a token usage monitor for a new-api deployment. It has two main parts:

- `server/`: CommonJS Node.js/Express backend that reads new-api data through Prisma and stores aggregated monitoring data in a local SQLite database.
- `web/`: Vite + React dashboard that calls backend APIs under `/api` and renders usage, channels, alerts, performance, model status, token, and error pages.

The root `Dockerfile` builds the frontend, copies `web/dist` into the backend `public/` directory, installs backend dependencies, generates Prisma Client, and runs `server/docker-entrypoint.sh`. Root `docker-compose.yml` exposes the combined app on host port `5173` mapped to container port `3000`.

## Common commands

Run commands from the relevant package directory; there is no root `package.json` workspace.

### Frontend (`web/`)

```sh
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

The Vite dev server proxies `/api` to `http://localhost:3002` in `web/vite.config.js`. If the backend runs on its default local port (`3001` from `server/.env.example`), update the proxy target or start the backend on `3002`.

### Backend (`server/`)

```sh
npm install
npx prisma generate
node index.js
```

`server/package.json` has only the placeholder `npm test` script, so there is currently no backend test command.

### Docker

```sh
docker compose up --build
```

For image-based deployment, `deploy/docker-compose.yml` uses `ghcr.io/glh08/token-monitor:latest`.

## Configuration and data stores

Backend configuration is environment-variable driven. See `server/.env.example` for the expected variables:

- `DATABASE_URL`: required Prisma connection string for the external new-api database. The checked-in Prisma schema defaults to MySQL.
- `PORT`: backend port; local example uses `3001`, root Dockerfile sets `PORT=3000`.
- `ACCESS_PASSWORD`: enables dashboard authentication when set.
- `AUTH_SECRET`: optional signing secret; if omitted, `ACCESS_PASSWORD` is used for token signing.
- `AUTH_TOKEN_TTL_SECONDS`: optional auth token TTL; defaults to 28800 seconds.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`: optional alert notifications.
- `QUOTA_PER_UNIT`: converts new-api quota to cost; defaults to `500000`.
- `MAX_MONITOR_MODELS`: defaults to `50`.
- `SYNC_MAX_BATCHES_PER_RUN`: optional cap for log sync batches; defaults to `100`.

The backend uses two databases:

1. External new-api DB via Prisma (`server/prisma/schema.prisma`) for source tables such as `logs`, `channels`, `tokens`, `models`, `vendors`, and `users`.
2. Local SQLite monitor DB at `server/data/monitor.db` (or `/app/data/monitor.db` in Docker) initialized by `server/db.js`, with aggregate/history tables such as `stats`, `alerts`, `alert_history`, and `channel_snapshots`.

`server/docker-entrypoint.sh` dynamically switches the Prisma datasource provider between MySQL and PostgreSQL based on `DATABASE_URL`, then runs `npx prisma generate` before starting the server.

## Backend architecture

`server/index.js` wires the Express app, auth middleware, REST routes, health/system endpoints, production static file serving, and a WebSocket server for realtime metrics.

Important flows:

- Auth: `server/auth.js` implements optional password-based login. If `ACCESS_PASSWORD` is unset, API auth is disabled. Protected routes are mounted after `/api/auth` in `server/index.js`.
- Sync: `server/syncer.js` uses Prisma to batch-read new-api logs (`type` 2 consume and 5 error), aggregates them hourly by channel/model, and writes into SQLite `stats`. Sync progress is tracked in SQLite `meta` via `last_synced_id`.
- Scheduled jobs: `server/index.js` runs log sync every 5 seconds, realtime metric refresh every 5 seconds, alert checks every 60 seconds, channel snapshots hourly, and old-data cleanup daily.
- Routes: route modules under `server/routes/` provide API areas for stats, logs, channels, tokens, alerts, model status, auth, and admin operations. Many analytics endpoints combine SQLite aggregates with live Prisma lookups to enrich names/status from new-api tables.
- Request validation helpers live in `server/request.js`; prefer those helpers for parsing time ranges, IDs, hours, and model lists in new endpoints.

## Frontend architecture

`web/src/main.jsx` mounts the React app. `web/src/App.jsx` checks auth config/session, renders `Login` when auth is enabled and no valid token exists, then mounts `Layout` with React Router routes.

Key frontend patterns:

- API wrappers live in `web/src/api.js`. They use relative `/api` URLs, attach the stored bearer token from `localStorage`, clear it on `401`, and dispatch an `auth-changed` event.
- Page components live directly under `web/src/` (`Dashboard.jsx`, `Channels.jsx`, `Models.jsx`, `ModelStatus.jsx`, etc.). Shared UI components live under `web/src/components/`.
- Data-fetching hooks live under `web/src/hooks/` for dashboard, channels, model analysis/status, and paginated data.
- Styling is a mix of Tailwind classes and CSS files (`web/src/index.css`, `web/src/App.css`), with Tailwind configured in `web/tailwind.config.js`.

## Notes for future changes

- Ignore `.claude/worktrees/`, `node_modules/`, and `web/dist/` when inspecting source; they are generated or agent worktree artifacts.
- If changing UI behavior, run the Vite dev server and verify the affected screen in a browser in addition to `npm run lint`/`npm run build`.
- If changing Prisma models for PostgreSQL support, remember the checked-in schema is MySQL by default and Docker mutates the provider at startup based on `DATABASE_URL`.
