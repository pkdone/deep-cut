# ADR-005: Playback volume, mute, and cross-source handoff

## Status

Accepted

## Context

DeepCut plays **local MP3** via an `HTMLAudioElement` in the renderer and **Spotify** via either the **Web Playback SDK** (in-process player device) or **Web API remote device** mode (audio on another Spotify Connect client). The user expects:

- **Global shortcuts** (volume up/down/mute) and the **Now Playing** slider and mute control to stay consistent with what the app is actually changing.
- **Honest UI** when Spotify’s servers or the active device refuse remote volume or mute (common on some speakers, TVs, and phone outputs).
- **Single active stream**: starting playback on one source must not leave the other source playing in parallel.

Spotify’s **`PUT /v1/me/player/volume`** can return **403** when the active device does not allow remote volume control (often surfaced with `reason: VOLUME_CONTROL_DISALLOW` or similar wording in the error body). That does **not** change audible level on the remote device; the app must not imply that it did.

## Decision

### 1. Source-specific control paths

| Current track source | Spotify mode | Where volume / mute are applied |
|----------------------|--------------|-----------------------------------|
| **Local** | (n/a) | `HTMLAudioElement.volume` and `.muted`; React state mirrors the element (including `volumechange` so UI stays aligned with programmatic updates). |
| **Spotify** | `web-playback-sdk` | Web Playback SDK **`setVolume`** on the in-app player (same process as the UI). |
| **Spotify** | `web-api-remote` | Spotify Web API **`PUT /me/player/volume`** (optional `device_id` from last `GET /me/player` poll). Requests are **debounced** (~140 ms) so rapid shortcut presses coalesce to one network call. |

If the user is not on Spotify, remote Spotify volume calls are not made.

### 2. When remote Spotify volume or mute fails

- On **success** (including **204**), update in-app **volume** / **isMuted** state to match what was requested and clear any prior **playback notice** for this topic.
- On **failure** with **device-restricted volume** (403 and body indicating remote volume/mute is disallowed, including `VOLUME_CONTROL_DISALLOW` and equivalent “cannot control device volume” messages):
  - Set a **dismissible `playbackNotice`** string in the top **playback banner** (same chrome as blocking errors, but this is informational, not `error`).
  - **Do not** set **isMuted** to `true` or move **volume** in a way that implies the remote device changed if it did not; the audible level remains under OS / hardware control on the remote client.
- **Do not** clear **`playbackNotice`** from the periodic Spotify **poll** (unlike **`playbackHint`**, which may track transport mismatch). Clearing is user-driven via **Dismiss** (same action as clearing errors/hints where implemented).

### 3. Banner and icon semantics

- **`error`**: blocking playback problems; **`playbackNotice`**: capability / policy messages (e.g. remote volume disallowed) until dismissed; **`playbackHint`**: softer transport / adoption copy that may be updated by polling.
- **Mute icon** and **volume slider** reflect **in-app state** for the current source; they must remain **truthful** relative to what DeepCut can control (no “muted” icon when remote mute was rejected and audio is unchanged).

### 4. Global shortcuts and in-app level

- Volume shortcuts adjust the **in-app** level using the latest stored level (**ref-backed**), not a potentially stale closure over the last render, so the slider moves predictably under rapid keys.
- **Limitation (platform)**: if the desktop delivers volume keys only to the **system mixer** and not to Electron **`globalShortcut`**, loudness may still change via the OS while DeepCut’s slider does not (the app only observes **`HTMLAudioElement`** for local **`volumechange`** events, not OS sink changes).

### 5. Cross-source handoff

- When starting **local** playback while the current session still points at **Spotify**, call **`PUT /v1/me/player/pause`** (with a valid access token) **before** driving local `HTMLAudioElement` playback so the remote Spotify client stops.
- When starting **Spotify** playback, **pause and clear** the local `HTMLAudioElement` so local audio does not continue under a Spotify “current” track.
- During the brief window while local playback is **arming** (`play()` in flight before React state flips to `local`), volume/mute shortcuts must still target the **local element** so they are not misrouted to the Spotify Web API path.

## Consequences

- **Positive**: Documented contract for engineers and support; aligns UI with Spotify’s real remote-control limits; avoids double playback across sources.
- **Trade-offs**: Remote-device volume remains **best-effort** only; users on restrictive devices rely on **system or device-native** volume; optional future **MPRIS** / desktop integration might duplicate or override some of this behaviour on Linux.

## References

- Implementation: `src/interfaces/app/playback/PlaybackProvider.tsx`, `src/interfaces/app/NowPlayingBar.tsx`, `src/interfaces/app/Layout.tsx` (banner order), `src/interfaces/electron-main/main.ts` (global shortcuts).
- Transport choice: [ADR-004 — Spotify playback strategy](./004-spotify-playback-strategy.md).
