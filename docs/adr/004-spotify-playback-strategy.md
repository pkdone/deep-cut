# ADR-004: Spotify playback strategy

## Status

Accepted

## Context

DeepCut is an Electron desktop app on Linux. Spotify integration must support:

- **Catalog and control** via the **Spotify Web API** (search, metadata, playlists where applicable, playback state, `me/player` transfer and play).
- **In-app audio** via the **Spotify Web Playback SDK**, which creates a local Spotify Connect device inside the Chromium renderer and relies on Premium and DRM (Widevine) where applicable.

Spotify separates the **`streaming`** OAuth scope (Web Playback SDK) from playback-control scopes such as **`user-modify-playback-state`** and **`user-read-playback-state`**. Using only one stack leaves a gap: Web API alone does not embed audio in the app; Web Playback SDK alone does not replace general Web API usage for search and library flows.

Linux and Electron introduce delivery risk (Widevine, device availability, Premium eligibility).

## Decision

1. **Always use both** Web API and Web Playback SDK together for Spotify features:
   - **Web API** for search, artist/album/track metadata, playlists as implemented, reading and controlling playback state, and targeting devices for play commands.
   - **Web Playback SDK** when the user wants audio **inside DeepCut** by registering an in-browser player device and using Web API `me/player` against that device’s id.

2. **User-selectable playback transport** (`spotifyPlaybackMode` in app settings), persisted in MongoDB:
   - **`web-api-remote`** (**default**): play on an **existing** Spotify Connect device chosen via Web API (`me/player/devices` + transfer + play). Valid Connect devices include the Spotify desktop app, phone, speaker, or the **Spotify Web Player** ([open.spotify.com](https://open.spotify.com/)) running in the user's browser. When no Connect device is available, DeepCut prompts the user (with consent) to open the Spotify Web Player so the browser tab becomes the device; it then polls `/me/player/devices` and plays once detected. Failures **do not** fall back to the Web Playback SDK.
   - **`web-playback-sdk`** (optional): initialize the Web Playback SDK player, then use Web API transfer/play on the SDK device id. Failures **do not** automatically switch to another transport.

3. **Failure handling**: When the **selected** mode cannot complete playback (or the SDK reports a hard error such as authentication, account, or initialization failure), the app **does not** silently try the other mode. The user is directed to **Settings → Spotify** with a **clear, actionable** message (including a dismissible notice on that settings panel when navigated from a failure).

   For `web-api-remote`, the "no device" case is handled by an explicit, user-consented prompt to open the Spotify Web Player — **not** a silent background navigation, iframe, or login-automation attempt.

4. **OAuth**: Request scopes that cover streaming plus playback read/modify plus any playlist scopes the app actually uses; see `src/infrastructure/spotify/spotify-oauth.ts`.

## Consequences

- **Positive**: Clear product story aligned with Spotify's intended split; predictable behaviour; easier support ("change mode in Settings" instead of guessing which transport won). The default (**Web API (remote device)**) is the most reliable path on Linux because Widevine happens in the user's **browser**, not Electron.
- **Negative / trade-offs**: Default mode requires another Spotify client (desktop, phone, speaker, or open.spotify.com tab) to be present. Users who explicitly pick **Web Playback SDK** on Linux may hit Widevine-in-Electron limits and must switch modes manually — no automatic escape hatch.
- **Non-goals**: Automatic cross-mode failover; opening an external Spotify URL as a hidden recovery path when Web Playback SDK mode is selected; any attempt to automate sign-in on open.spotify.com or iframe the Spotify UI.

## Linux / stock Electron (Widevine)

DeepCut ships **stock `electron` from npm** (not a Widevine-patched vendor build). Runtime evidence on at least one Linux host running stock `electron@41.2.0`: `navigator.requestMediaKeySystemAccess('com.widevine.alpha', …)` rejects with `NotSupportedError` ("Unsupported keySystem or supportedConfigurations."), so Spotify's Web Playback SDK emits `initialization_error: Failed to initialize player`. That is **why Web API (remote device) is the default**: the user's **browser** (Chrome, Firefox) typically has a working Widevine CDM out of the box, and **open.spotify.com** is a legitimate Spotify Connect device. App-level levers available for the optional Web Playback SDK path:

- **Production renderer origin**: the packaged app loads the UI from **`app://renderer/`** instead of `file://`, so EME/CDM sees a **privileged standard scheme** closer to a normal HTTPS web app.
- **Optional diagnostics**: environment variable **`DEEPCUT_ELECTRON_RENDERER_SANDBOX=0`** disables the **renderer** `BrowserWindow` sandbox when set; default remains sandboxed. Documented in the project README with the security tradeoff.

**Platform ceiling**: some Linux + stock Chromium combinations still lack a fully satisfactory Widevine path for Spotify even with the levers above. The supported product path on those systems is the default **Web API (remote device)** — optionally using the open.spotify.com tab as the Connect device. A **Phase B** option (not the default codebase path) is a **Widevine-enabled Electron distribution** (e.g. castlabs) with its own signing and supply-chain implications — only if product/engineering accepts that operational cost.
