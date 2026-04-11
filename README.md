# DeepCut

Linux desktop music player (Electron): **Spotify** + **local MP3**, **MongoDB Atlas** persistence, **LLM** artist enrichment.

## Prerequisites

- Node.js ≥ 22.21.1
- MongoDB Atlas (or compatible) cluster
- Spotify [developer app](https://developer.spotify.com/dashboard) (Client ID + secret; redirect URI `http://127.0.0.1:<port>/callback` is handled by a local server during OAuth)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `MONGODB_URI` (single URI with credentials and database name).
3. `npm run db:init` — creates collections and indexes (run once per database).
4. `npm run dev` — start the app in development mode.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite dev |
| `npm run build:app` | Production build to `out/` |
| `npm run build` | Build + Linux `.deb` (requires packaging step) |
| `npm run validate` | `lint` + `test` + `build:app` |
| `npm run db:init` | Initialise MongoDB collections |
| `npm run db:teardown` | Drop managed collections (`ALLOW_DB_TEARDOWN=1`) |

## Product rules

See `docs/PRD.md` and `docs/IMPLEMENTATION_PLAN.md`.
