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
| **Secrets** | Spotify tokens, LLM keys: stored and refreshed in **main**; renderer receives only **opaque session state** or **masked status** via IPC. |
| **Local files** | Scanning, `fs` access, and optional native decode paths live in **main** / infrastructure; renderer gets **metadata DTOs** and **playback URLs or IPC streams** as designed. |
| **IPC** | Typed channels; **zod**-validate every inbound payload in **interfaces** before calling application services. |
| **LLM calls** | Prefer **main-side** HTTP to avoid CORS and to centralise keys; return parsed DTOs to renderer. |

### 1.3 Cross-cutting modules (likely)

- **`src/shared`**: `app-logger`, small helpers, shared constants; **no** domain vocabulary beyond technical concerns.
- **Optional `src/electron` or `electron/`** at repo root: if the team prefers clear separation, **bootstrap** (`main.ts`, `preload.ts`) may live here with imports into `src/interfaces`—**one** canonical layout should be chosen early and recorded in an ADR (see §7).

### 1.4 Risk-driven allowances

- **Spotify playback**: PRD allows in-app playback **or** fallback to controlling the Spotify app. The implementation plan assumes **try Web Playback / embedded path first**, then **document fallback** (Connect / D-Bus / `playerctl`—**TBD**) in an ADR once researched on Ubuntu 24.04+.
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
| **Data** | MongoDB via **`MONGODB_URI`**; playlists app-owned (not native Spotify playlists) |
| **Core UX** | Home, Search, Artist, Album, Playlist, Now Playing, Settings |
| **Search** | Unified, **grouped by type**, source badges, source filter, **merged duplicates** (fuzzy), default play source Spotify when available |
| **Playback** | In-app preferred; cross-source handoff acceptable; failure → local fuzzy fallback → error → skip |
| **Playlists** | CRUD, reorder, mixed sources, persist |
| **Artist intelligence** | LLM (OpenAI + Anthropic selectable), strict JSON, schema in prompt, **30-day cache**, manual refresh, retry once, partial render on failure |
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
3. **Local library**: folder pick, MP3 scan, tags/artwork, watch + reindex (simple remove/reimport), domain + repos + UI browse path.
4. **Local playback**: Now Playing minimal controls, session fields in DB, **restore on restart** (track, position, context).
5. **Spotify**: OAuth/connect, search API, metadata; attempt **in-app playback**; failure behaviour per PRD; Settings status.
6. **Unified search + merge**: grouped results, filters, fuzzy duplicate merge, Spotify-preferred play on merged rows.
7. **Playlists**: app playlists in MongoDB, mixed playback, reorder/remove.
8. **Artist enrichment**: LLM adapters (OpenAI, Anthropic), JSON schema validation, cache + refresh UI, offline cached read.
9. **Hardening**: media keys, global shortcuts, local logs, `.deb`, E2E suite for PRD flows.

Dependencies: 3 before 4; 5 before 6–7; 8 can overlap 5+ after cache/settings exist. **Exact parallelisation** is flexible; keep slices **vertically shippable** where possible.

---

## 5. Likely files to be created

Illustrative—not exhaustive. Names will evolve with ubiquitous language.

| Area | Examples |
|------|-----------|
| **Config** | `package.json`, `tsconfig.json`, `eslint.config.mjs`, `jest.config.ts`, `.env.example` |
| **Electron** | `src/interfaces/electron-main/main.ts`, `window-manager.ts`, `ipc/register-handlers.ts`, `preload.ts` |
| **UI** | `src/interfaces/app/` React roots, routes, screens (`home`, `search`, `artist`, `album`, `playlist`, `now-playing`, `settings`) |
| **Domain** | `schemas/track.ts`, `playlist.ts`, `playback-session.ts`, `artist-enrichment.ts`, `repositories/*.ts` |
| **Application** | `search-unified.ts`, `manage-playlist.ts`, `restore-session.ts`, `enrich-artist.ts` |
| **Infrastructure** | `persistence/*-repository.ts`, `spotify/client.ts`, `llm/openai.ts`, `llm/anthropic.ts`, `local-library/scanner.ts`, `local-library/watcher.ts` |
| **DB** | `scripts/db-init.ts`, `scripts/db-teardown.ts`, `infrastructure/persistence/init-mongo-database.ts` |
| **Tests** | `src/test/unit/domain/services/fuzzy-match.test.ts`, `src/test/unit/infrastructure/llm/enrichment-parse.test.ts`, `src/test/integration/persistence/*.int.test.ts`, `src/test/e2e/*.spec.ts` |
| **Packaging** | `electron-builder.yml` (or equivalent), `.desktop` file, icons under `resources/` |

---

## 6. Open questions

### 6.1 Product / UX (unresolved in PRD—needs your input)

1. **Spotify “connection” for daily use**: Are you okay requiring **browser OAuth each cold start**, or do you want **long-lived refresh** with a **secure store** (e.g. OS keychain via Electron) as a v1 must-have?
2. **MongoDB for a single-user desktop app**: Is **Atlas-only** acceptable for offline-first local playback (network required for app data), or do you want **embedded/local MongoDB** (e.g. FerretDB, local `mongod`) for v1?
3. **Playback position restore**: Tolerance for **±1–2 s** drift after restart? Any requirement to **persist seek** only on pause vs periodic?
4. **Artist page without cache**: First visit with no cache and **offline**—show **Spotify-only** metadata shell, or **block** the page with a clear message?
5. **LLM cost control**: Max tokens per request, **model names** (e.g. fixed vs user-selectable within provider), and whether to **disable** enrichment if no API key?
6. **Search latency**: Target debounce and **max results** per section to keep Spotify API use reasonable?
7. **Merged duplicates**: When both sources exist but metadata differs wildly, should the UI show **one canonical title** (which source wins) vs a **disambiguation** line—still without per-track override?
8. **Local folder scope**: Symlinks, **hidden** directories, and **max library size** expectations for v1?
9. **Keyboard shortcuts**: Default keymap only, or **user-rebindable** in v1 (PRD lists required actions but not customisability)?

### 6.2 Technical (to resolve during implementation)

- **Electron version** and **security** defaults (`contextIsolation`, `sandbox`, CSP).
- **Local audio**: Node decoder vs Chromium vs native module for gapless/seek—impact on Now Playing.
- **Spotify playback**: Web Playback SDK vs alternative; **Linux** audio routing.
- **Global shortcuts / MPRIS**: `globalShortcut` vs desktop conventions (`org.mpris.MediaPlayer2`).
- **E2E** against real Spotify vs **recorded mocks** for CI.

---

## 7. Validation strategy

| Layer | What to run | Purpose |
|-------|-------------|---------|
| **CI default** | `npm run validate` (aggregate: lint, test, build—as defined in `package.json` when added) | Gate merges; matches project rule |
| **Unit** | Fuzzy matching, enrichment JSON parsing/validation, cache TTL logic, pure domain services | Fast feedback, high-risk logic |
| **Integration** | MongoDB repositories with test DB (`db:init` in fixture), Spotify/LLM **contract tests** with mocked HTTP | Persistence and adapter correctness |
| **E2E** | Playwright (or chosen): connect Spotify (or stub), scan folder, search/play, playlist CRUD, artist page with enrichment | PRD §20.2 flows |
| **Manual** | Ubuntu 24.04+: `.deb` install, media keys, offline aeroplane mode for local+cache | Packaging and desktop integration |

**Definition of done for v1**: PRD **§23 Release Readiness Gate** + green **`npm run validate`** + agreed E2E subset green in CI (with documented secrets strategy for Spotify in CI—often **skipped** or **mocked**).

---

## 8. ADRs worth writing now

Draft these **early** to reduce rework; store as `docs/adr/NNN-title.md` (or `docs/adr/README.md` listing them).

| ADR | Question | Why now |
|-----|----------|---------|
| **ADR-001 Electron process and IPC** | Where main/preload/renderer live; IPC naming; zod at boundary | Touches every feature |
| **ADR-002 MongoDB topology for DeepCut** | Atlas vs local; offline behaviour; single `MONGODB_URI` | Blocks settings and persistence |
| **ADR-003 Spotify auth and token storage** | OAuth flow; secure storage; refresh | Blocks Spotify features |
| **ADR-004 Spotify playback strategy** | Web Playback vs Connect vs hybrid; Linux constraints | Highest delivery risk per PRD |
| **ADR-005 Local audio stack** | How MP3 is decoded and wired to UI/seek | Drives Now Playing and tests |
| **ADR-006 LLM integration** | Provider abstraction; strict JSON; errors/retries; models | Artist enrichment core path |

Optional soon after: **fuzzy matching algorithm** choice, **deb packaging** tool, **E2E** approach.

---

## 9. Document maintenance

- Update this file when **milestones reorder**, **scope** changes, or **major technical choices** land.
- Keep **`.cursor/rules/project.mdc`** aligned with **tooling** (e.g. ESLint) and **non-negotiable boundaries**; put **long narrative** here or in ADRs.
