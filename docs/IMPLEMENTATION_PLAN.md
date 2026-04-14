# DeepCut — Implementation Plan

This document translates **`docs/PRD.md`** into engineering sequencing, structure, and validation. It is the **milestones and scope** companion to **`.cursor/rules/project.mdc`** (conventions). On conflict, **PRD wins**.

---

## 1. Architecture refinements

### 1.1 Baseline: DDD layers (unchanged from project rules)

- **`src/domain`**: music-domain entities, value objects, aggregates, repository **interfaces**, canonical **Zod** in `src/domain/schemas`, domain services (e.g. fuzzy match policies, enrichment result validation).
- **`src/application`**: use cases—connect Spotify, scan folders, search orchestration, playlist CRUD, playback session restore, request artist enrichment.
- **`src/infrastructure`**: MongoDB repositories, Spotify/LLM HTTP clients, filesystem scanning and file watchers, mapping to persistence documents.
- **`src/interfaces`**: Electron **main**, **preload**, and **renderer** entrypoints, IPC handlers, React routes, window management.

Dependency rule: **interfaces → application → domain**; **infrastructure** depends on **domain** (and **application** where needed for orchestration ports). **Domain** has no inward-breaking imports.

### 1.2 Electron-specific refinement

| Concern | Direction |
|--------|-----------|
| **MongoDB** | Only from **main** (or a dedicated main-side worker module), via **infrastructure** repositories; never from renderer. |
| **Secrets** | **LLM API keys** and other long-lived settings: stored and validated in **main**; renderer receives only **masked status** or non-secret values via IPC. **Spotify (v1):** OAuth in the browser **on each cold start**—tokens may be **in-memory for the session** only (no cross-restart refresh-token persistence required). |
| **Local files** | Scanning, `fs` access, and optional native decode paths live in **main** / infrastructure; renderer gets **metadata DTOs** and **playback URLs or IPC streams** as designed. |
| **IPC** | Typed channels; **zod**-validate every inbound payload in **interfaces** before calling application services. |
| **LLM calls** | Prefer **main-side** HTTP to avoid CORS and to centralise keys; return parsed DTOs to renderer. |

### 1.3 Cross-cutting modules (likely)

- **`src/shared`**: `app-logger`, small helpers, shared constants; **no** domain vocabulary beyond technical concerns.
- **Optional `src/electron` or `electron/`** at repo root: if the team prefers clear separation, **bootstrap** (`main.ts`, `preload.ts`) may live here with imports into `src/interfaces`—**one** canonical layout should be chosen early and recorded in an ADR (see §9).

### 1.4 Risk-driven allowances

- **Spotify playback**: PRD allows in-app playback **or** fallback to controlling the Spotify app. The implementation plan assumes **try Web Playback / embedded path first**, then **document fallback** (Connect / D-Bus / `playerctl`—**TBD**) in an ADR once researched on Ubuntu 24.04+.
- **Local library scale (v1):** design and test with **~2,500 albums** as the nominal local catalogue size; **symlinks are not followed** when scanning.
- **Single process**: no separate daemon unless watch scale or audio constraints force it—justify in an ADR if added.

---

## 2. Repository structure

Target layout (incremental; create as features land):

```text
deep-cut/
├── docs/
│   ├── PRD.md
│   ├── IMPLEMENTATION_PLAN.md      # this file
│   ├── ENGINEERING_RULES.md        # optional; PRD suggests—may mirror .cursor/rules
│   └── adr/                        # Architecture Decision Records (optional folder)
├── scripts/
│   ├── db-init.ts
│   └── db-teardown.ts
├── src/
│   ├── domain/
│   │   ├── aggregates/
│   │   ├── entities/
│   │   ├── events/
│   │   ├── repositories/         # interfaces only
│   │   ├── schemas/              # canonical Zod
│   │   ├── services/             # domain services (fuzzy match, etc.)
│   │   └── value-objects/
│   ├── application/
│   │   └── ...                   # use cases / handlers
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   ├── repositories/
│   │   │   └── schemas/          # documents derived from domain
│   │   ├── spotify/
│   │   ├── llm/
│   │   └── local-library/        # scan, watch, tag read
│   ├── interfaces/
│   │   ├── electron-main/        # or ../electron at root—ADR
│   │   ├── electron-preload/
│   │   └── app/                  # React UI, routes, screens
│   ├── shared/
│   │   └── app-logger.ts
│   └── test/
│       ├── unit/
│       ├── integration/
│       └── e2e/                  # when Playwright (or chosen tool) is added
├── package.json
├── tsconfig.json
├── eslint.config.mjs
└── .env.example
```

**Packaging:** `.deb` build assets (e.g. `electron-builder` config, desktop entry, icons) typically live at **repo root** or **`packaging/`**—add when the packaging milestone starts.

---

## 3. Version 1 scope

Aligned with **`docs/PRD.md`** §3, §14, §22. Summary:

| Area | v1 in scope |
|------|----------------|
| **Platform** | Ubuntu 24.04+; run from repo + **`.deb`** install |
| **Shell** | Electron + TypeScript; single-process model |
| **Sources** | Spotify + **local MP3** only |
| **Data** | **MongoDB Atlas** (or compatible) via **`MONGODB_URI`**; playlists app-owned (not native Spotify playlists); **network required** for app persistence (local playback still works offline with already-indexed files per PRD) |
| **Core UX** | Home, Search, Artist, Album, Playlist, Now Playing, Settings |
| **Search** | Unified, **grouped by type**, source badges, source filter, **merged duplicates** (fuzzy), default play source Spotify when available; **debounce + per-section caps** (tune in implementation) |
| **Playback** | In-app preferred; cross-source handoff acceptable; failure → local fuzzy fallback → error → skip |
| **Playlists** | CRUD, reorder, mixed sources, persist |
| **Artist intelligence** | **Grounded pipeline**: provider **web retrieval** (OpenAI Responses + `web_search`, Anthropic **web search** tool) → normalize evidence → **synthesis** to strict JSON → **Zod** validation → **MongoDB** cache; **Spotify API not used** for Now Playing insight lists; **local + Spotify** share the same pipeline; synopsis **6–8** sentences; **ranked albums**; **10 top tracks**; up to **3** live / **3** best-of / **3** rarities with **years**; **band members**; **30-day cache** by **normalized artist key**, **Now Playing** UI, manual refresh, **synthesis retry once** on invalid output, partial render + warnings when applicable |
| **Offline** | Local library + local playback + **cached** enrichment |
| **Settings** | Folders, Spotify, LLM, MongoDB status, cache, basic prefs |
| **Theme** | Dark only |
| **NFR** | Responsive UI, local log files, graceful degradation |

**Explicit v1 exclusions** (see PRD): other OS/distros, lyrics, tray/notifications, advanced queue UI, metadata editing, non-MP3 local formats, Docker, auto-updates, full a11y beyond keys/shortcuts, provenance UI for LLM, per-track source override.

---

## 4. Milestones (thin vertical slices)

Suggested order (from PRD §25, refined):

1. **Tooling + app shell**: TypeScript, ESLint, Jest, Electron **hello window**, dark theme shell, navigation placeholders, **`npm run validate`**.
2. **MongoDB + settings**: `MONGODB_URI`, `db:init`, connection health in Settings, **ConfigurationError** path, persist minimal settings.
3. **Local library**: folder pick, MP3 scan (**do not follow symlinks**), tags/artwork, watch + reindex (simple remove/reimport), domain + repos + UI browse path; design for **~2,500 albums** local scale assumption.
4. **Local playback**: Now Playing minimal controls, session fields in DB, **restore on restart** (track, position, context).
5. **Spotify**: **browser OAuth on each cold start** with startup auto-connect attempt when credentials exist, search API, metadata; implement mode toggle (`Spotify Connect` default, optional `Web Playback SDK`) with shared fallback behaviour.
6. **Unified search + merge**: grouped results, filters, fuzzy duplicate merge, Spotify-preferred play on merged rows; **Spotify-primary title** with optional **subtitle** for differing local metadata.
7. **Playlists**: app playlists in MongoDB plus hierarchical folder tree, mixed playback, reorder/remove, inline CRUD actions.
8. **Artist enrichment**: Grounded **retrieval + synthesis** adapters (OpenAI Responses + web search, Anthropic Messages + web search); domain split (`ArtistEvidenceBundle`, **`ArtistInsightsRecord`** persisted aggregate with validation status + warnings); JSON validation, cache + refresh on **Now Playing**, offline cached read. **Persistence:** Zod-validated documents in Mongo; **`db:init`** ensures the collection + **unique index** on `enrichmentArtistKey` (no server-side JSON Schema on the payload body yet). **Breaking payload / `docSchemaVersion` changes:** no migration script in-repo; reset dev DB with **`db:teardown`** then **`db:init`**, or drop incompatible cache documents, before relying on the new shape. **Optional live integration tests:** `npm run test:integration` (loads `.env.local` via Jest setup); set **`OPENAI_API_KEY`** / **`ANTHROPIC_API_KEY`** there; **`npm test`** stays keyless and excludes `*.int.test.ts`.
9. **Hardening**: media keys, **fixed-default** global shortcuts, MPRIS integration hook, local logs, `.deb`, Playwright E2E suite for PRD flows.

Dependencies: 3 before 4; 5 before 6–7; 8 can overlap 5+ after cache/settings exist. **Exact parallelisation** is flexible; keep slices **vertically shippable** where possible.

---

## 5. Likely files to be created

Illustrative—not exhaustive. Names will evolve with ubiquitous language.

| Area | Examples |
|------|-----------|
| **Config** | `package.json`, `tsconfig.json`, `eslint.config.mjs`, `jest.config.ts`, `.env.example` |
| **Electron** | `src/interfaces/electron-main/main.ts`, `window-manager.ts`, `ipc/register-handlers.ts`, `preload.ts` |
| **UI** | `src/interfaces/app/` React roots, routes, screens (`home`, `search`, `artist`, `album`, `playlist`, `now-playing`, `settings`) |
| **Domain** | `schemas/track.ts`, `playlist.ts`, `playback-session.ts`, `artist-enrichment-payload.ts`, `artist-insights-record.ts`, `artist-evidence.ts`, `artist-enrichment.ts` (re-exports), `repositories/*.ts`, `services/artist-insights-for-ui.ts` |
| **Application** | `search-unified.ts`, `manage-playlist.ts`, `restore-session.ts`, `enrichment-cache-policy.ts` |
| **Infrastructure** | `persistence/*-repository.ts`, `parse-artist-insights-document.ts`, `spotify/client.ts`, `llm/fetch-artist-enrichment.ts`, `llm/grounded/*`, `local-library/scanner.ts`, `local-library/watcher.ts` |
| **DB** | `scripts/db-init.ts`, `scripts/db-teardown.ts`, `infrastructure/persistence/init-mongo-database.ts` |
| **Tests** | `src/test/unit/domain/services/fuzzy-match.test.ts`, `src/test/unit/infrastructure/llm/enrichment-parse.test.ts`, `src/test/integration/persistence/*.int.test.ts`, `src/test/e2e/*.spec.ts` |
| **Packaging** | `electron-builder.yml` (or equivalent), `.desktop` file, icons under `resources/` |

---

## 6. Resolved product decisions (v1)

| Topic | Decision |
|-------|-----------|
| **Spotify auth** | **Browser OAuth on every cold start**; no requirement to persist refresh tokens across restarts for daily use. |
| **MongoDB** | **Atlas** (hosted); app data paths assume a reachable cluster when online. |
| **Playback position restore** | **Small drift** after restart is acceptable (order of seconds). |
| **Artist enrichment, offline, no cache** | Show a **clear message** that enrichment cannot be generated (alongside normal Spotify metadata shell where applicable). |
| **LLM limits / errors** | **No fixed product token/cost limits** in v1; if the user has not configured a key or the provider fails, show a **visible error** (per PRD failure handling). |
| **Search** | Implement **debouncing** and **per-section result limits**; tune numbers during development. |
| **Merged duplicate display** | **Spotify-first** primary line; **subtitle** (or secondary line) may reflect differing local metadata. |
| **Local scan** | **Do not follow symlinks**; assume on the order of **~2,500 albums** locally for performance assumptions. |
| **Global shortcuts** | **Fixed defaults** only in v1 (no user keymap editor). |
| **Window / layout persistence** | **Do not** persist window size, position, or shell layout in MongoDB or elsewhere for v1 (aligned with PRD §10.8 and §17.3). |

## 7. Open questions (technical)

- **Electron version** and **security** defaults (`contextIsolation`, `sandbox`, CSP).
- **Local audio**: Node decoder vs Chromium vs native module for gapless/seek—impact on Now Playing.
- **Spotify playback**: Web Playback SDK vs alternative; **Linux** audio routing.
- **Global shortcuts / MPRIS**: `globalShortcut` vs desktop conventions (`org.mpris.MediaPlayer2`).
- **E2E** against real Spotify vs **recorded mocks** for CI.

---

## 8. Validation strategy

| Layer | What to run | Purpose |
|-------|-------------|---------|
| **CI default** | `npm run validate` (aggregate: lint, test, build—as defined in `package.json` when added) | Gate merges; matches project rule |
| **Unit** | Fuzzy matching, enrichment JSON parsing/validation, cache TTL logic, pure domain services | Fast feedback, high-risk logic |
| **Integration** | MongoDB repositories with test DB (`db:init` in fixture), Spotify/LLM **contract tests** with mocked HTTP; **optional** `npm run test:integration` for live LLM retrieval (keys in `.env.local`; see `.env.example`) | Persistence and adapter correctness |
| **E2E** | Playwright: smoke route coverage plus core flows (connect Spotify or stub, scan folder, search/play, playlist CRUD, **Now Playing** artist intelligence) | PRD §20.2 flows |
| **Manual** | Ubuntu 24.04+: `.deb` install, media keys, offline aeroplane mode for local+cache | Packaging and desktop integration |

**Definition of done for v1**: PRD **§23 Release Readiness Gate** + green **`npm run validate`** + agreed E2E subset green in CI (with documented secrets strategy for Spotify in CI—often **skipped** or **mocked**).

---

## 9. ADRs worth writing now

Draft these **early** to reduce rework; store as `docs/adr/NNN-title.md` (or `docs/adr/README.md` listing them).

| ADR | Question | Why now |
|-----|----------|---------|
| **ADR-001 Electron process and IPC** | Where main/preload/renderer live; IPC naming; zod at boundary | Touches every feature |
| **ADR-002 MongoDB topology for DeepCut** | **Atlas**; offline behaviour for local playback vs online persistence; single `MONGODB_URI` | Blocks settings and persistence |
| **ADR-003 Spotify auth (v1)** | Browser OAuth each cold start; in-memory session tokens; no cross-restart persistence | Blocks Spotify features |
| **ADR-004 Spotify playback strategy** | Web Playback vs Connect vs hybrid; Linux constraints | Highest delivery risk per PRD |
| **ADR-005 Local audio stack** | How MP3 is decoded and wired to UI/seek | Drives Now Playing and tests |
| **ADR-006 LLM integration** | Provider abstraction; strict JSON; errors/retries; models | Artist enrichment core path |

Optional soon after: **fuzzy matching algorithm** choice, **deb packaging** tool, **E2E** approach.

---

## 10. Document maintenance

- Update this file when **milestones reorder**, **scope** changes, or **major technical choices** land.
- Keep **`.cursor/rules/project.mdc`** aligned with **tooling** (e.g. ESLint) and **non-negotiable boundaries**; put **long narrative** here or in ADRs.
