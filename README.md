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

### Spotify playback modes

DeepCut always uses the **Spotify Web API** for search, metadata, and playback control. In
**Settings → Spotify**, pick how audio is actually played:

- **Web API (remote device)** — **default**. Playback happens on an existing **Spotify Connect**
  device: the Spotify desktop app, phone, speaker, or the **Spotify Web Player**
  ([open.spotify.com](https://open.spotify.com/)) in your browser. This is the most reliable path on
  Linux because Widevine is handled by your **browser**, not Electron. DeepCut just sends play
  commands via the Web API.
- **Web Playback SDK** (optional) — plays audio **inside DeepCut** using Spotify's in-app player.
  Requires **Widevine DRM** in Electron's Chromium, which is often unavailable on Linux (stock
  Electron); see "Widevine diagnostics" below.

#### No Spotify device available

If you select **Web API (remote device)** and there is no active Spotify Connect device when you
press Play, DeepCut shows a **"No Spotify device available"** prompt with an **Open Spotify Web
Player** button. Clicking it opens [open.spotify.com](https://open.spotify.com/) in your default
browser — sign in once (cookies persist), keep the tab open, and DeepCut will start playback on
that tab automatically when Spotify registers it as a Connect device (usually within a few
seconds).

**Recommended on Linux:** a modern browser with a working Widevine CDM (for example **Google
Chrome** or **Firefox**) handles open.spotify.com out of the box.

### Widevine diagnostics (Web Playback SDK only)

After `npm run build:app` or `npm run build`, the UI is loaded from **`app://renderer/`** (a
privileged custom scheme), not raw `file://` URLs, so Chromium gets a **standard secure origin**
that EME/Widevine expects.

If Web Playback SDK mode still fails with an initialization error, set
**`DEEPCUT_ELECTRON_RENDERER_SANDBOX=0`** (or `false`) when starting the app to disable the
**renderer process** sandbox only (default remains on). This weakens isolation between the renderer
and OS — use it for diagnosis, then revert for daily use. This is separate from Chromium's setuid
`chrome-sandbox` above.

| Scenario | Suggestion |
| -------- | ---------- |
| `npm run dev` | Renderer is served over **http://localhost** (Vite); Widevine behaviour can differ from packaged `app://`. |
| Packaged / `build:app` | Uses **`app://renderer/`**; compare with dev if playback works in one mode only. |
| Still failing on stock Electron | Stay on **Web API (remote device)** (default). ADR-004 notes an optional Widevine-enabled Electron distribution as a possible Phase B follow-up (out of stock build scope). |

## Scripts


| Script                | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Electron + Vite dev                              |
| `npm run test:e2e`    | Playwright E2E smoke suite                       |
| `npm run test:e2e:headed` | Playwright E2E in headed mode                |
| `npm run build:app`   | Production build to `out/`                       |
| `npm run build`       | Build + Linux `.deb` (requires packaging step)   |
| `npm run validate`    | `lint` + `test` + `build:app`                    |
| `npm run db:init`     | Initialise MongoDB collections                   |
| `npm run db:teardown` | Drop managed collections (`ALLOW_DB_TEARDOWN=1`) |


## Product rules

See `docs/PRD.md` and `docs/IMPLEMENTATION_PLAN.md`.

## Current feature highlights

- Search preserves workflow context and supports alphabetical mixed local/Spotify ordering.
- Settings includes Spotify playback mode selection (**Web API (remote device)** default, **Web
  Playback SDK** optional; no automatic failover between modes), first-run setup guidance, and
  field-level help text.
- Now Playing keeps recent artist tabs and exposes a queue dropdown with remove/clear actions.
- Playlists include a hierarchical manager in the `Playlists` route for folder/playlist create, rename,
  delete, and reorder workflows.
- Electron registers global media shortcuts and a startup MPRIS hook placeholder for Linux integration.