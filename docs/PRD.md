# DeepCut — Product Requirements Document (PRD)

## 1. Document Status

- **Product name:** DeepCut
- **Status:** Draft for implementation
- **Target version:** v1
- **Primary target platform:** Ubuntu Linux 24.04+

---

## 2. Product Overview

### 2.1 Product Vision

DeepCut is a desktop music player unifying Spotify playlists and local music, displaying rich artist intelligence.

### 2.2 Product Summary

DeepCut is a single-user desktop music application for Linux power users who maintain a mixed library of streamed and local music. It combines Spotify playback and metadata with locally indexed MP3 files in one unified application, allowing users to search, browse, play, and build playlists across sources.

Its main differentiator is **artist intelligence on the Now Playing screen** that dynamically generates useful context—including an **LLM-generated synopsis** (a multi-sentence opening paragraph), **ranked notable albums**, **ten ranked top tracks** (with optional release years in the UI), **up to three** notable releases in each of **live albums**, **best-of compilations**, and **rarities compilations** (each with **title and release year**), and a **ranked list of band members** (past and present, with instruments)—for the primary artist of the track currently playing, using a remote frontier LLM.

### 2.3 Primary Target User

DeepCut is aimed initially at:
- the author
- Linux power-user music enthusiasts like the author
- users who actively listen for many hours a day
- users with a split library across Spotify and local audio files
- users who want a better artist-discovery and listening workflow than existing Linux music players or Spotify currently provide

### 2.4 Problem Statement

Existing music listening workflows are fragmented:
- Spotify is good for streaming but does not unify well with local rare or obscure files
- local Linux music players do not integrate Spotify well
- current tools do not provide rich artist-context and ranking intelligence in the listening workflow

DeepCut is intended to solve:
- the split between Spotify and local music libraries
- the inability to build one practical listening workflow across both
- the lack of useful integrated artist intelligence during music exploration

---

## 3. Product Goals, Success Criteria, and Non-Goals

### 3.1 Product Goals

The goals of v1 are:
1. Provide a usable daily-driver desktop player for mixed Spotify and local music listening on Ubuntu.
2. Make cross-source search, playback, and playlisting feel unified.
3. Deliver genuinely useful **Now Playing** artist intelligence that adds value beyond Spotify and typical Linux music players.
4. Keep v1 technically simple enough to build and maintain as a high-quality public codebase, even if real-world Spotify-connected usage remains personal-first.

### 3.2 Success Criteria

v1 is successful if:
1. **DeepCut can replace Lollypop for local playback.**
2. **DeepCut can reliably build and play mixed playlists across Spotify and local music.**
3. **The Now Playing artist intelligence feels genuinely useful rather than gimmicky.**

### 3.3 Non-Goals for v1

DeepCut v1 is **not** intended to:
- replicate all of Spotify’s product surface
- support multiple users, profiles, or Spotify accounts
- support all Linux distributions or non-Linux platforms
- provide lyrics
- provide sophisticated provenance UI for LLM-generated content
- provide in-app metadata editing for local music files
- provide advanced queue-management features
- guarantee seamless source transitions between Spotify and local playback
- support automatic updates
- provide full accessibility coverage
- provide Docker-based local development/runtime
- support local audio formats other than MP3

---

## 4. Platform, Distribution, and Runtime Scope

### 4.1 Supported Platform

v1 supports:
- **Ubuntu 24.04 and newer**

v1 does not target:
- older Ubuntu versions
- other Linux distros as first-class targets
- Windows
- macOS

These may be considered in later versions.

### 4.2 Distribution

v1 must support:
- installation via **`.deb` package**
- direct running from the repository via terminal for development/testing

### 4.3 Update Model

v1 uses:
- **manual installation and manual upgrades**

v1 does not require:
- automatic app updates

### 4.4 Acceptance Criteria

- The application can be launched on **Ubuntu 24.04+**.
- The application can be run:
  - from a packaged `.deb` install
  - directly from the repository for development/testing
- On successful launch, the user can access:
  - Home
  - Search
  - Artist page
  - Album page
  - Playlist page
  - Now Playing
  - Settings
- The application remains responsive during normal navigation.

---

## 5. User Model and Account Model

### 5.1 User Model

DeepCut v1 is a:
- **single-user desktop app**

### 5.2 Account/Profile Model

DeepCut v1 assumes:
- exactly **one active Spotify account**
- exactly **one app profile**
- no app-specific user account system
- no multi-user or multi-profile support

### 5.3 Connected Services

v1 may use:
- Spotify
- one active LLM provider selected by the user from supported providers
- MongoDB / MongoDB Atlas as external persistence

### 5.4 Acceptance Criteria

- The application operates as a **single-user desktop app**.
- The application supports exactly:
  - one active Spotify account
  - one app profile

---

## 6. Music Source Support

### 6.1 Required Sources in v1

DeepCut v1 must support:
- **Spotify**
- **Local MP3 library**

### 6.2 Optional / Future Sources

DeepCut may support in the future:
- YouTube Music uploaded tracks, if technically feasible

This is explicitly not required for v1.

### 6.3 Source Model

The product must provide a **unified source experience**:
- Spotify and local tracks should appear within a unified user experience
- the UI must still visibly indicate track source
- the user must be able to filter by source when needed

---

## 7. Spotify Integration Assumptions and Constraints

### 7.1 Required Capability

DeepCut must be able to use Spotify APIs with the user’s Spotify subscription.

### 7.2 Account Requirement

The user’s **Spotify Premium Family** plan is acceptable for DeepCut’s Spotify use because the relevant technical requirement is Premium access.

### 7.3 Spotify-Related Constraints

DeepCut must be designed with these realities in mind:
- Spotify integration is possible for search, metadata, playlist interaction, and playback
- in-app Spotify playback is the preferred direction
- Spotify developer-access restrictions may limit broad public usability of a Spotify-connected build
- therefore, v1 should be treated as **personal-first / limited-usage by default**, even if the code repository is public

### 7.3.1 Authentication model (v1)

For v1, the user completes **Spotify OAuth in the browser on each cold start** of the application (no requirement to persist refresh tokens across app restarts for daily use).

### 7.4 Playback Preference

DeepCut v1 uses **both** the **Spotify Web API** (search, metadata, playlists as implemented, playback state, `me/player` control) and the **Spotify Web Playback SDK** (optional in-app audio via a browser-local Connect device). The user chooses a **playback delivery** mode in Settings:

- **Web API (remote device)** (**default**): audio plays on an **existing** Spotify Connect device (desktop, phone, speaker, or the Spotify Web Player at open.spotify.com) via Web API only. When no Connect device is active, DeepCut may prompt the user to open the Spotify Web Player so their browser tab becomes the device.
- **Web Playback SDK** (optional): audio plays inside DeepCut when the SDK and Premium requirements are met, including a working Widevine CDM in the Electron runtime (often unavailable on Linux; see ADR-004).

The app **does not** automatically switch between these modes when one fails; the user adjusts Settings → Spotify and retries. Controlling another Spotify app is the normal **remote device** behaviour, not a silent fallback from in-app playback.

### 7.5 Acceptance Criteria

- The user can connect a Spotify account from the app (**OAuth via browser on each cold start** for v1).
- The app shows Spotify connection status in Settings.
- If Spotify authentication fails, the user sees a clear error state.
- The app can retrieve Spotify search results for:
  - artists
  - albums
  - tracks
- The app can retrieve Spotify metadata needed for playback and display.
- The app supports integrated in-app Spotify playback (Web Playback SDK) and optional remote-device playback (Web API), per user selection in Settings.
- If playback fails for the **selected** mode, the app surfaces a **clear, actionable** error and directs the user to **Settings → Spotify** (no automatic cross-mode failover).
- If a Spotify track fails to play, the app:
  - attempts local fallback using fuzzy matching if a local candidate exists
  - otherwise shows an error
  - skips to the next track when appropriate

---

## 8. Local Music Library Support

### 8.1 Local Discovery Model

DeepCut v1 must support:
- selecting one or more local folders
- scanning those folders
- watching those folders for changes
- reading embedded metadata/tags and embedded artwork from files

For v1, the scanner must **not follow symbolic links** when discovering files under configured folders (symlinked directories and files are skipped for indexing).

For capacity planning, v1 targets a local library on the order of **up to ~2,500 albums** (order-of-magnitude assumption; the app should still behave safely if the library is larger, but performance tuning prioritises this band).

### 8.2 Supported Local Format

For v1, local audio format support is limited to:
- **MP3 only**

No other local audio formats are required in v1.

### 8.3 Metadata Editing

For v1:
- imported local metadata is **read-only**
- no in-app metadata/tag editing is required

### 8.4 Change Handling

When files are:
- moved
- deleted
- materially changed

v1 may use:
- **simple remove-and-reimport behaviour**

Sophisticated identity-preserving reconciliation is not required in v1.

### 8.5 Acceptance Criteria

- The user can add one or more local folders for music scanning.
- The user can remove previously configured folders.
- The app scans configured folders for local music.
- v1 only imports **MP3** files.
- Files that are not supported are ignored safely.
- For imported MP3s, the app reads available:
  - track title
  - artist
  - album
  - artwork
- Imported metadata is treated as read-only in v1.
- The app watches configured folders for changes.
- If a supported file is added, it can appear in the indexed library after watch/update processing.
- If a file is deleted or moved, simple remove-and-reimport behaviour is acceptable.
- If a scan fails for a file or folder, the app:
  - does not crash
  - logs the issue
  - shows a usable error indication where appropriate
  - continues scanning remaining items where possible

---

## 9. Unified Library, Search, and Duplicate Handling

### 9.1 Unified Search Model

DeepCut must provide a unified search experience across supported sources.

The user must be able to:
- search across all sources together
- filter search to a single source when needed

### 9.2 Search Result Grouping

Search results must be grouped by type:
- Artists
- Albums
- Tracks
- Playlists

DeepCut must **not** present search as one undifferentiated blended ranked list by default.

### 9.3 Source Visibility

Search results and other relevant track surfaces must show:
- source badges/icons indicating Spotify, Local, and future supported sources

### 9.4 Duplicate Track Handling

When the same song exists across multiple sources:
- it should appear as **one merged entry**
- the merged entry must show multiple available source badges/icons
- the default playback source is **Spotify** when available
- the **primary displayed title (and related primary line metadata)** should come from **Spotify** when a Spotify match exists; when local metadata differs, a **subtitle** (or secondary line) may indicate the local variant without requiring per-track source override (see §9.5)

### 9.5 Source Override

v1 does **not** require:
- user control to override the preferred source on a merged track

### 9.6 Matching Strategy

Duplicate detection and Spotify-to-local fallback must use:
- **fuzzy matching**

Exact metadata identity is not required.

### 9.7 Search performance parameters (v1)

v1 should apply **request debouncing** and **per-section result limits** for unified search so that ordinary typing and browsing stay responsive and Spotify API use stays bounded. Exact numeric values are left to implementation and should be tuned during development.

### 9.8 Acceptance Criteria

- The user can search across Spotify and local library content in one unified flow.
- The user can restrict search to one source when desired.
- Search results are grouped by:
  - Artists
  - Albums
  - Tracks
  - Playlists
- Search results show source badges/icons for each result or merged result.
- Search interaction feels low-latency in normal use.
- The app does not freeze the main UI during ordinary search operations.
- If the same track exists in Spotify and local library, it appears as **one merged entry** rather than separate duplicated entries.
- The merged entry shows all available source badges/icons.
- When the user plays a merged duplicate entry, the app prefers Spotify playback when available.
- v1 does not require a user-facing control to force the local or Spotify source for a merged duplicate.
- Duplicate detection uses fuzzy matching rather than exact identity only.
- Minor metadata differences do not automatically prevent merging.

---

## 10. Playback Requirements

### 10.1 Playback Model

DeepCut v1 should aim for:
- fully integrated in-app playback for Spotify and local tracks where feasible

### 10.2 Cross-Source Transitions

When playback moves between sources:
- a brief handoff/reload is acceptable in v1

Seamless transitions are not required in v1.

### 10.3 Fallback Behaviour on Playback Failure

If a Spotify track cannot be played:
1. attempt fallback to a matching local version if one exists
2. if no local fallback exists, show an error
3. skip to the next track

### 10.4 Now Playing Screen Requirements

The Now Playing experience must include:
- cover art visualisation
- play/pause
- previous
- next
- progress bar / seek
- volume
- mute
- source indicator
- track text
- artist text
- album text
- **artist intelligence** for the **current track’s primary artist** (see §13): synopsis, ranked albums, top 10 tracks, categorized album highlights (live, best-of, rarities; with release years), and band line-up—shown on the **Now Playing** screen only, for both Spotify and local playback where applicable

### 10.5 Hardware / Media Key Support

DeepCut must respond appropriately to:
- play
- pause
- next track
- previous track
- volume up
- volume down
- mute

### 10.6 Global Keyboard Shortcuts

DeepCut must support global keyboard shortcuts for:
- play/pause
- next
- previous
- focus search
- volume up
- volume down
- mute
- open settings

### 10.7 Queue Model

v1 queueing should include:
- a visible queue dropdown for current queue inspection
- queue item removal
- clear queue action

v1 does not require:
- advanced drag-drop queue reordering

### 10.8 Session Restore

On app restart, DeepCut must restore:
- the last playback session
- including last playlist/album/track and playback position

**Playback position** after restore may **drift slightly** (on the order of a few seconds) compared to the exact pre-restart position; v1 does not require sample-accurate restore.

DeepCut does **not** need to restore broader UI state such as:
- window size/state
- last-open screen
- search text
- selected filters

### 10.9 Acceptance Criteria

- The user can:
  - play
  - pause
  - skip next
  - skip previous
  - seek within the current track
  - adjust volume
  - mute audio
- The Now Playing UI shows:
  - cover art visualisation
  - track name
  - artist name
  - album name
  - source indicator
  - progress/seek state
  - volume state
  - artist intelligence for the primary artist of the current track (synopsis, ranked albums, top tracks, categorized highlights, band members) as specified in §13
- Mixed playback across Spotify and local tracks works in playlists.
- Brief handoff/reload between sources is acceptable in v1.
- On restart, the app restores the prior playback session, including:
  - last playlist or album context where applicable
  - last track
  - playback position
- The app is not required to restore:
  - last screen
  - search text
  - selected filters
  - window state

---

## 11. Media Keys and Global Shortcuts

### 11.1 Hardware / Media Keys

DeepCut must respond appropriately to:
- play
- pause
- next
- previous
- volume up
- volume down
- mute

### 11.2 Global Keyboard Shortcuts

DeepCut must support global shortcuts for:
- play/pause
- next
- previous
- focus search
- volume up
- volume down
- mute
- open settings

For v1, shortcuts use **fixed default bindings** only; **user-customisable keymaps** are not required.

### 11.3 Acceptance Criteria

- The app responds appropriately to:
  - play
  - pause
  - next
  - previous
  - volume up
  - volume down
  - mute
- The app supports global shortcuts for:
  - play/pause
  - next
  - previous
  - focus search
  - volume up
  - volume down
  - mute
  - open settings
- Shortcut actions should work consistently during normal app use.
- Failure of an individual shortcut binding should not make playback controls unusable in the UI.
- v1 does not require user-rebindable global shortcuts (fixed defaults only).

---

## 12. Playlist Requirements

### 12.1 Storage Model

Playlists must be stored in:
- DeepCut’s own MongoDB-backed application data model

They must not depend on being native Spotify playlists.

### 12.2 Playlist Composition

Playlists in v1 must support:
- mixed-source entries
- Spotify tracks
- local MP3 tracks

### 12.3 Required Playlist Capabilities

Users must be able to:
- create playlists
- rename playlists
- delete playlists
- add tracks to playlists
- manually reorder playlist entries
- delete playlist entries

### 12.4 Playback Behaviour in Mixed Playlists

Mixed playlists must be playable.

If a Spotify item in a playlist fails:
- fallback to matching local version if available
- otherwise error and skip to next

### 12.5 Acceptance Criteria

- The user can:
  - create playlists
  - rename playlists
  - delete playlists
- The user can:
  - add tracks to playlists
  - remove tracks from playlists
  - reorder playlist entries manually
- A playlist can contain a mix of Spotify and local tracks.
- The playlist remains playable as a single app-level playlist.
- User-created playlists persist across app restarts.

---

## 13. Artist Intelligence Feature

### 13.1 Core Product Differentiator

**Artist intelligence on the Now Playing screen** is a main differentiator of DeepCut.

It must provide insight for the **primary artist of the track currently playing**—beyond what Spotify alone surfaces in a typical playback UI—aggregated and presented while the user is listening.

### 13.2 Mandatory Now Playing Insight Content in v1

The Now Playing experience must include, for that primary artist:
- an **artist synopsis**: an opening paragraph of **6 to 8** fairly substantial sentences, **LLM-synthesized** and **grounded in retrieved web evidence** (via the selected provider’s search/tooling capabilities), then shaped into strict JSON—not copied verbatim from a single third-party feed
- **ranked albums**: a model-ranked list of notable **studio or canonical albums** (name, release year, rank)
- **top 10 tracks**: exactly **ten** ranked tracks (title, rank 1–10; **release year** included in the UI when provided)
- up to **three** entries each (only sections that apply), with **album or compilation title** and **release year** shown in the UI (e.g. title with year in brackets):
  - **live albums** (official live / concert releases)
  - **best-of compilations** (e.g. greatest-hits / career retrospectives)
  - **rarities compilations** (e.g. B-sides, outtakes, rarities-focused releases)
- a **list of people** who have been part of that act (**most significant first**), each with **instruments** and **tenure** as one or more year ranges in the UI (including **boomerang** members with multiple ranges); members are **not** presented as a ranked list

Enrichment is keyed by a **stable normalized identity** derived from the **primary artist name** for the current track (same string the playback UI uses for the artist line). **Spotify-streamed** and **local MP3** tracks use the **same** enrichment pipeline: identity comes from **playback-consistent metadata** (Spotify playback metadata vs **local file tags** for local tracks). **Now Playing insight lists** (synopsis, rankings, discography-style lists) are **not** sourced from Spotify Web API catalog endpoints; they come from **web retrieval + LLM synthesis** (and cache). Lists may still be incomplete or inaccurate (see §13.7 posture elsewhere). Browsing the Spotify catalog on other screens is unrelated to this sourcing rule.

### 13.3 Generation Model

Artist enrichment must:
- be generated on demand
- be cached per artist for **30 days**
- allow immediate manual refresh through a UI button

### 13.4 Supported LLM Providers

v1 must support:
- **OpenAI**
- **Anthropic**

The user must select the active provider in Settings.

For v1, the product does **not** specify fixed **token or cost limits** per enrichment request; implementations should still avoid runaway prompts via sensible defaults. If enrichment cannot run (for example **no API key**, **provider error**, or **network unavailable**), the user sees a **clear visible error** (see §13.8 and §13.9).

### 13.5 Output Format

LLM output must be:
- **strict JSON-shaped**

Implementation may use provider **structured JSON** or **schema-constrained** responses where supported; the app still validates with **Zod** before cache and UI.

The prompt sent by the app must include:
- the **JSON schema** expected in the response

### 13.6 Source Selection for Enrichment

For v1:
- the app runs a **retrieval stage** (provider web search / tools) to gather **evidence**, then a **synthesis stage** that produces strict JSON **using that evidence** (not a single monolithic “search and answer” prompt)
- the app does **not** inject **Spotify Web API** catalog dumps into the LLM for Now Playing insights; **local MP3** and **Spotify** playback use the same pipeline
- the synthesis prompt may describe the information the model is expected to produce (synopsis length and tone, ranked albums, top 10 tracks, categorized compilation lists, band members and instruments)

### 13.7 Provenance

For v1:
- no provenance UI is required

### 13.8 Failure Handling

If artist enrichment fails:
1. retry once
2. then partially render whatever valid data is available
3. show a visible error message explaining the problem

If there is **no cached enrichment** and the user is **offline** (or the LLM endpoint cannot be reached), the app must show a **clear message** that enrichment cannot be generated at this time, rather than an empty or misleading view.

### 13.9 Acceptance Criteria

- Artist enrichment is generated on demand when the user requests refresh from the **Now Playing** screen (or equivalent visible flow for the current track’s primary artist).
- The **Now Playing** screen displays, for that artist:
  - a primary heading that is the **artist name** only (no required suffix such as “Insights”); when a **primary reference URL** (e.g. from retrieval, preferring Wikipedia) is available, that heading may be a **link** that opens the page in the user’s default browser (this is not a full provenance UI)
  - artist synopsis (multi-sentence opening paragraph per §13.2)
  - ranked albums and top 10 tracks (with years when provided)
  - live / best-of / rarities sections as applicable (each ranked within the section), with release years
  - band member list with instruments and tenure year ranges (including multiple spans when applicable)
- The app expects strict JSON output from the LLM.
- The prompt sent to the LLM includes the expected JSON schema.
- The enrichment flow works with:
  - OpenAI
  - Anthropic
- The active provider is determined by the Settings selection.
- If enrichment generation fails:
  - the app retries once
  - then partially renders valid available data if possible
  - and shows a visible error message describing the issue
- Enrichment results are cached per **normalized primary-artist key** for 30 days.
- If cached content exists, it can be displayed without regenerating immediately.
- The user can manually refresh enrichment for the current playback artist immediately.
- v1 is not required to show user-facing provenance/source attribution UI for generated enrichment.
- When **offline** (or LLM unavailable) and **no cache** exists for the artist, the user sees a **clear message** explaining that enrichment is unavailable.

---

## 14. Navigation and Screen Requirements

### 14.1 Required Screens in v1

DeepCut v1 must include:
- Home
- Search
- Artist page
- Album page
- Playlist page
- Now Playing
- Settings

### 14.2 Home Screen

The Home screen must include:
- quick search
- playlist navigator
- now playing as the main content

It must also provide easy navigation to:
- settings
- other major app areas

### 14.3 Search Screen

The Search screen must provide:
- grouped results by type
- source indicators
- source filters
- alphabetical mixed-source ordering within each entity view
- breadcrumb-style navigation continuity for Artist -> Album -> Tracks journeys
- state continuity when navigating away and back (query, filter, workflow context)

### 14.4 Artist and Album Pages

Artist and Album pages should keep actions minimal in v1.

Minimum actions required:
- Play
- Add to Playlist

### 14.5 Settings Screen

Settings must include:
- local music folders
- Spotify connection status/auth
- LLM provider selection and API settings
- MongoDB connection/config status
- cache management
- basic app preferences
- first-run setup guidance with rationale for required fields
- field/tooltips and short section intent copy
- Spotify playback mode selection (**Web API (remote device)** default, **Web Playback SDK** optional; see §7.4)

### 14.6 Acceptance Criteria

- The Home screen includes:
  - quick search
  - playlist navigator
  - now playing as the primary content area
- From Home, the user can easily reach:
  - Settings
  - Search
  - playlists and playback-related flows
- The Search screen provides:
  - grouped results by type
  - source indicators
  - source filters
- Artist and Album pages support at least:
  - Play
  - Add to Playlist
- v1 does not require richer inline action sets such as queue-next, source override, or advanced context actions.
- The Settings screen exposes controls or status for:
  - local music folders
  - Spotify connection/auth status
  - LLM provider selection
  - LLM API settings
  - MongoDB connection/config status
  - cache management
  - basic app preferences
- The user can configure both OpenAI and Anthropic support.
- The user can select exactly one active LLM provider at a time.
- The currently active provider is clearly visible in Settings.
- The app can connect using a single `MONGODB_URI`.
- If MongoDB is unavailable or misconfigured, the app shows a clear error state rather than failing silently.

---

## 15. UX and Visual Design Requirements

### 15.1 Design Direction

DeepCut should have a UI that is:
- visual
- spacious
- like a modern media app

It should not feel like:
- a dense utility interface

### 15.2 Theme

v1 should support:
- **dark theme only**

### 15.3 Lyrics

DeepCut v1 must:
- **not show lyrics**

### 15.4 Notifications and Tray

For v1:
- desktop notifications are deferred
- system tray support is deferred

### 15.5 Sorting and Filtering Within Views

For v1:
- artist album lists and playlist views should remain fixed in presentation/order
- no additional sorting/filter controls are required within those views

### 15.6 Acceptance Criteria

- The UI presents a visual, spacious, modern media-app feel.
- v1 supports dark theme only.
- v1 does not display lyrics.
- v1 does not require system tray support.
- v1 does not require desktop notifications.

---

## 16. Offline Behaviour

### 16.1 Offline-Capable Features

When offline, DeepCut must still allow:
- browsing the local library
- playing local MP3s
- viewing cached artist enrichment data

### 16.2 Offline-Unavailable Features

When offline, it is acceptable for these to be unavailable or degraded:
- Spotify-backed features
- fresh LLM enrichment generation

### 16.3 Acceptance Criteria

- When offline, the user can:
  - browse local library content
  - play local MP3s
  - view cached artist enrichment
- When offline:
  - Spotify features may be unavailable
  - fresh artist enrichment generation may be unavailable
- The app must degrade gracefully without crashing.

---

## 17. Data, Persistence, and Configuration

### 17.1 Database

DeepCut uses:
- **MongoDB**
- likely **MongoDB Atlas**

### 17.2 Connection Configuration

Database access should be configured using:
- a single **`MONGODB_URI`** environment variable

That URI may include:
- credentials
- database name
- address / host details
- likely SRV form

### 17.3 Persistence Scope

All app persistence should live in MongoDB, including:
- library/index data
- playlists
- artist enrichment cache
- playback state
- connected-service settings/config state

v1 does **not** persist **window size, window position, or other shell layout state** in MongoDB (or elsewhere) for restore across restarts—consistent with §10.8 session restore excluding broader UI state.

### 17.4 Secrets and Local Configuration

For v1, DeepCut may rely on:
- environment variables
- local config files

This is acceptable for v1 even though it is not the ideal long-term security model.

### 17.5 Acceptance Criteria

- The application persists app data in MongoDB.
- Restarting the app does not destroy previously created playlists, settings state, indexed library state, or cached artist enrichment data.

---

## 18. Non-Functional Requirements

### 18.1 Responsiveness

DeepCut must feel:
- **low-latency**
- responsive during normal use

Core interactions should feel immediate enough for an all-day desktop music app.

### 18.2 Stability

DeepCut must be stable enough for:
- many hours of daily listening use

### 18.3 Graceful Failure

DeepCut must fail gracefully when:
- Spotify is unavailable
- MongoDB is unavailable
- the LLM provider is unavailable
- the LLM returns invalid or incomplete data
- local scan/watch/import operations fail

Failure handling should favour:
- clear user-visible messages
- partial function where possible
- no silent breakage

### 18.4 Offline Resilience

DeepCut must preserve useful functionality offline for local playback and cached artist content.

### 18.5 Logging

DeepCut must keep:
- **local log files**

Logs should support debugging and troubleshooting beyond terminal/dev-only runs.

Logs should avoid leaking:
- raw credentials
- raw tokens
- full secret-bearing connection strings

### 18.6 Testability and Maintainability

DeepCut must be implemented with a maintainable architecture that:
- avoids speculative complexity
- preserves clear responsibilities
- supports automated testing of high-risk logic

---

## 19. Technical Constraints and Assumptions

### 19.1 Application Shape

DeepCut v1 should be built as:
- a desktop application
- with **Electron** as the preferred implementation direction

### 19.2 Architecture Constraint

v1 should use:
- a **simpler single desktop app process**

No separate local background service/helper should be introduced unless unavoidable.

### 19.3 Language Constraint

The codebase should be:
- **TypeScript-based**

### 19.4 Schema and Validation Approach

DeepCut should use:
- **Zod** for domain models and database schemas

Domain schema definitions should be the canonical source where practical, with persistence schemas derived from them rather than duplicated.

### 19.5 External Dependency Assumptions

DeepCut depends on external services that may fail or impose constraints:
- Spotify APIs and playback capabilities
- MongoDB / MongoDB Atlas availability
- OpenAI / Anthropic API availability and behaviour

The architecture should treat these as:
- failure-prone
- latency-prone
- externally constrained

### 19.6 Design Philosophy

The implementation should prefer:
- simple, bounded, maintainable architecture
- explicit assumptions where behaviour is unclear
- thin vertical slices over speculative framework-building

---

## 20. Quality and Testing Requirements

### 20.1 Unit Tests Required

v1 must include unit tests covering:
- fuzzy matching
- caching behaviour
- LLM response validation/parsing

### 20.2 End-to-End Flows Required

v1 must include a small set of end-to-end UI flows covering:
- connect Spotify
- scan local folders
- search and play a track
- create, edit, and play a mixed playlist
- view **Now Playing** artist intelligence (LLM enrichment) while a track plays

### 20.3 Quality Expectation

DeepCut should be treated as:
- production-grade personal-use software
- not a toy demo

### 20.4 Acceptance Criteria

- Unit tests exist for:
  - fuzzy matching logic
  - caching behaviour
  - LLM response validation/parsing
- End-to-end coverage exists for:
  - connect Spotify
  - scan local folders
  - search and play a track
  - create/edit/play a mixed playlist
  - view **Now Playing** artist intelligence (LLM enrichment) while a track plays
- The application can be validated through the project’s agreed validation/test workflow before being treated as complete.

---

## 21. Risks, Constraints, and Open Product Realities

### 21.1 Spotify Platform Risk

Spotify platform/developer-access restrictions may limit broad public usage of a Spotify-connected DeepCut build.

### 21.2 Playback Risk

Embedded Spotify playback inside Electron/Linux is a delivery risk even if technically supported.

### 21.3 Enrichment Quality Risk

Artist enrichment quality depends heavily on:
- prompt design
- schema design
- model reliability
- source quality chosen by the model

### 21.4 Matching Risk

Fuzzy matching between Spotify and local files may be imperfect where metadata is poor or inconsistent.

### 21.5 Security Trade-Off

Using env vars and local config files for secrets/config is acceptable for v1, but not the ideal long-term approach.

---

## 22. Explicitly Out of Scope for v1

The following are out of scope for v1:
- Windows support
- macOS support
- first-class support for non-Ubuntu Linux distros
- YouTube Music support
- multiple users
- multiple app profiles
- multiple Spotify accounts
- local file metadata editing
- lyrics
- advanced queue UI
- queue reordering/removal UI
- seamless cross-source playback transitions
- accessibility work beyond required keyboard/media-key support
- system tray support
- desktop notifications
- automatic updates
- Docker support
- non-MP3 local audio support
- provenance UI for LLM-generated content
- user-controlled sorting/filtering within artist album lists and playlist views
- per-track source override for merged duplicate entries

---

## 23. Release Readiness Gate for v1

DeepCut v1 is release-ready when all of the following are true:
- the app runs on Ubuntu 24.04+
- Spotify connection works for the target user model
- local MP3 scanning and playback work
- unified search works across supported sources
- merged duplicate handling works to the agreed v1 level
- mixed playlists can be created, edited, persisted, and played
- Now Playing includes all required controls and metadata
- session restore works for playback state
- artist enrichment works with both OpenAI and Anthropic
- enrichment caching and refresh work
- offline local playback and **cached Now Playing artist intelligence** work
- required test coverage exists for agreed v1 scope

---

## 24. Suggested Companion Engineering Document

This PRD captures the product requirements and key technical constraints, but it should be paired with a separate engineering rules document for build agents and contributors.

That companion document should define things such as:
- exact repo structure
- architectural layering rules
- logging conventions
- validation conventions
- test layout
- code-style/linting expectations
- dependency direction rules
- DB-init / schema-management process
- ADR expectations

A good name would be:
- `docs/ENGINEERING_RULES.md`

Note: For eslint try to use at least these rules:

```
      'no-lonely-if': 'error',
      'default-param-last': 'off',
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'error',
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' },
      ],
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
          allowArray: false,
          allowNullish: false,
          allowRegExp: false,
        },
      ],
      'no-console': 'error',
      'no-nested-ternary': 'error',
      'no-negated-condition': 'warn',
      'prefer-regex-literals': 'error',
```

---

## 25. Immediate Follow-On Recommendation

The next useful artifact after this PRD is an implementation plan split into thin vertical slices, for example:
1. app shell + settings + MongoDB connectivity
2. local library scan/index/watch + playback
3. Spotify auth/search/playback
4. unified search + duplicate merging
5. playlists
6. artist enrichment pipeline + **Now Playing** UI
7. packaging/testing hardening

