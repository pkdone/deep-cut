import { useState, type ReactElement } from 'react';
import { usePlayback } from './PlaybackProvider.js';

/**
 * Global modal shown when Web API (remote device) mode needs a Spotify Connect device and none
 * is active. Opens open.spotify.com externally on confirm; the Provider polls and plays once the
 * browser tab registers as a Connect device.
 */
export function SpotifyRemoteDevicePrompt(): ReactElement | null {
  const pb = usePlayback();
  const [busy, setBusy] = useState(false);

  if (!pb.spotifyRemoteDevicePromptOpen) {
    return null;
  }

  const onOpen = (): void => {
    setBusy(true);
    void pb.confirmOpenSpotifyWebPlayer().finally(() => {
      setBusy(false);
    });
  };

  const onCancel = (): void => {
    pb.dismissSpotifyRemoteDevicePrompt();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="No Spotify device available">
      <div className="panel modal-panel">
        <h2>No Spotify device available</h2>
        <p>
          DeepCut uses another Spotify app (desktop, phone, speaker, or the Spotify Web Player in
          your browser) to play audio. Open the Spotify Web Player now and keep the tab open —
          DeepCut will start playback automatically when it appears.
        </p>
        <p className="subtitle">
          If you have not signed into Spotify in your browser yet, sign in once; the browser will
          remember you for future sessions.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            aria-disabled={busy}
            onClick={onOpen}
          >
            {busy ? 'Waiting for Web Player…' : 'Open Spotify Web Player'}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
