# DeepCut

Linux desktop music library player (Electron): **music streaming services** + **local MP3**, **MongoDB Atlas** persistence, **LLM** artist enrichment.

## Prerequisites

- Node.js ≥ 22.21.1
- MongoDB Atlas (or compatible) cluster
- Spotify [developer app](https://developer.spotify.com/dashboard) (Client ID + secret; redirect URI `http://127.0.0.1:8888/callback`)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `MONGODB_URI` (single URI with credentials and database name).
3. `npm run db:init` — creates collections and indexes (run once per database).
4. `npm run dev` — start the app in development mode.

### Chromium sandbox (Linux)

Electron ships a setuid helper at `node_modules/electron/dist/chrome-sandbox`. For Chromium’s sandbox to work, that file must be **owned by root** and have mode **4755**. The repo’s `dev` script expects this (plain `electron-vite dev`).

After `npm install`, run once per machine (or again after upgrading the `electron` package, which replaces the file):

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

If you **cannot** use setuid (no sudo), set `ELECTRON_DISABLE_SANDBOX=1` only for dev, for example in `package.json`:

```json
"dev": "ELECTRON_DISABLE_SANDBOX=1 electron-vite dev"
```

If Electron still complains about the sandbox, confirm the path exists and repeat the `chown`/`chmod` after a fresh `npm install`.

## Scripts


| Script                | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Electron + Vite dev                              |
| `npm run build:app`   | Production build to `out/`                       |
| `npm run build`       | Build + Linux `.deb` (requires packaging step)   |
| `npm run validate`    | `lint` + `test` + `build:app`                    |
| `npm run db:init`     | Initialise MongoDB collections                   |
| `npm run db:teardown` | Drop managed collections (`ALLOW_DB_TEARDOWN=1`) |


## Product rules

See `docs/PRD.md` and `docs/IMPLEMENTATION_PLAN.md`.