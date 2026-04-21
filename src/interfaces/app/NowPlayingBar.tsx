import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppSettings } from '../../domain/schemas/app-settings.js';
import {
  getLlmIntegrationWarning,
  getLocalFoldersWarning,
  getSpotifyIntegrationWarning,
} from '../../shared/integration-status-messages.js';
import { INTEGRATION_STATUS_REFRESH_EVENT } from './integration-status-events.js';
import { LLM_PING_UPDATED_EVENT } from './llm-ping-events.js';
import { usePlayback } from './playback/PlaybackProvider.js';

function SpeakerIcon(): ReactElement {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-slider-icon-svg"
    >
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function SpeakerMutedIcon(): ReactElement {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-slider-icon-svg"
    >
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function IconAlert(): ReactElement {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-status-icon np-status-icon--warn"
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function IconOk(): ReactElement {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-status-icon np-status-icon--ok"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function IconSpinner(): ReactElement {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-status-icon np-status-spinner"
    >
      <path d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 2.13-1.34 3.94-3.21 4.67l-.96.96C14.55 18.45 13.28 19 12 19c-3.86 0-7-3.14-7-7 0-1.28.55-2.55 1.37-3.79l-1.41-1.41C3.56 9.63 3 11.26 3 13c0 4.97 4.03 9 9 9 1.74 0 3.37-.56 4.75-1.51l.96-.96A6.93 6.93 0 0 0 19 13c0-3.86-3.14-7-7-7z" />
    </svg>
  );
}

type LlmPingState = { ok: boolean; message: string | null } | null;

type MongoDbStatus = null | { ok: true } | { ok: false; message: string };

function IntegrationStatusStrip(): ReactElement {
  const navigate = useNavigate();
  const pb = usePlayback();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [spotifySt, setSpotifySt] = useState<{ connected: boolean; expiresAtMs: number } | null>(
    null
  );
  const [libraryScanning, setLibraryScanning] = useState(false);
  const [llmPing, setLlmPing] = useState<LlmPingState>(null);
  const [mongoDb, setMongoDb] = useState<MongoDbStatus>(null);
  const initialLlmPingDone = useRef(false);

  const refreshIntegration = useCallback(async (): Promise<void> => {
    const [s, st, ping, mongo] = await Promise.all([
      window.deepcut.getSettings(),
      window.deepcut.spotifyStatus(),
      window.deepcut.getLlmPingResult(),
      window.deepcut.mongoPing(),
    ]);
    setSettings(s);
    setSpotifySt(st);
    setLlmPing(ping);
    setMongoDb(mongo);
  }, []);

  useEffect(() => {
    void refreshIntegration();
    void window.deepcut.getLibraryScanState().then((r) => {
      setLibraryScanning(r.scanning);
    });
  }, [refreshIntegration]);

  useEffect(() => {
    const id = setInterval(() => void refreshIntegration(), 45_000);
    const onFocus = (): void => {
      void refreshIntegration();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshIntegration]);

  useEffect(() => {
    /** LLM ping updates cached result in main; reload settings too so warnings/icons match saved keys/provider. */
    const onLlmPingUpdated = (): void => {
      void refreshIntegration();
    };
    window.addEventListener(LLM_PING_UPDATED_EVENT, onLlmPingUpdated);
    return () => {
      window.removeEventListener(LLM_PING_UPDATED_EVENT, onLlmPingUpdated);
    };
  }, [refreshIntegration]);

  useEffect(() => {
    const onIntegrationRefresh = (): void => {
      void refreshIntegration();
    };
    window.addEventListener(INTEGRATION_STATUS_REFRESH_EVENT, onIntegrationRefresh);
    return () => {
      window.removeEventListener(INTEGRATION_STATUS_REFRESH_EVENT, onIntegrationRefresh);
    };
  }, [refreshIntegration]);

  useEffect(() => {
    return window.deepcut.onLibraryScanState((p) => {
      setLibraryScanning(p.scanning);
    });
  }, []);

  useEffect(() => {
    if (settings === null || initialLlmPingDone.current) {
      return;
    }
    const warn = getLlmIntegrationWarning(settings);
    if (warn !== null) {
      setLlmPing(null);
      return;
    }
    initialLlmPingDone.current = true;
    void window.deepcut.llmPing().then((r) => {
      setLlmPing(r);
    });
  }, [settings]);

  const spotifyPayload = spotifySt ?? { connected: false, expiresAtMs: 0 };
  const spotifyWarn =
    settings !== null ? getSpotifyIntegrationWarning(settings, spotifyPayload) : null;
  const llmWarn = settings !== null ? getLlmIntegrationWarning(settings) : null;
  const localWarn = settings !== null ? getLocalFoldersWarning(settings) : null;

  let spotifyHoverBase: string;
  if (settings === null) {
    spotifyHoverBase = 'Open Settings for Spotify.';
  } else if (spotifyWarn !== null) {
    spotifyHoverBase = spotifyWarn;
  } else if (spotifyPayload.connected) {
    spotifyHoverBase = 'Spotify session is active. Open Settings to manage Spotify.';
  } else {
    spotifyHoverBase =
      'Spotify credentials are saved. Use Connect Spotify in Settings to sign in for playback and search.';
  }
  const spotifyLabel =
    pb.current?.source === 'spotify' && pb.spotifyPlaybackMechanism !== null
      ? `Playback: ${pb.spotifyPlaybackMechanism}. ${spotifyHoverBase}`
      : spotifyHoverBase;

  let llmTitle: string;
  let llmBtnClass = 'np-status-btn';
  let llmIcon: ReactElement;
  if (llmWarn !== null) {
    llmTitle = llmWarn;
    llmBtnClass += ' np-status-btn--warn';
    llmIcon = <IconAlert />;
  } else if (llmPing === null) {
    llmTitle = 'Checking LLM connectivity…';
    llmBtnClass += ' np-status-btn--warn';
    llmIcon = <IconSpinner />;
  } else if (!llmPing.ok) {
    llmTitle = llmPing.message ?? 'LLM connectivity check failed. Open Settings.';
    llmBtnClass += ' np-status-btn--error';
    llmIcon = <IconAlert />;
  } else {
    llmTitle = 'LLM is reachable. Open Settings to change provider or keys.';
    llmBtnClass += ' np-status-btn--ok';
    llmIcon = <IconOk />;
  }
  let localLabel = 'Local music folders are configured. Open Settings.';
  if (libraryScanning) {
    localLabel = 'Scanning local library. Open Settings for local folders.';
  } else if (localWarn !== null) {
    localLabel = localWarn;
  }

  let localBtnClass = 'np-status-btn';
  if (libraryScanning) {
    localBtnClass += ' np-status-btn--scanning';
  } else if (localWarn) {
    localBtnClass += ' np-status-btn--warn';
  } else {
    localBtnClass += ' np-status-btn--ok';
  }

  let localIcon: ReactElement;
  if (libraryScanning) {
    localIcon = <IconSpinner />;
  } else if (localWarn !== null) {
    localIcon = <IconAlert />;
  } else {
    localIcon = <IconOk />;
  }

  let dbTitle: string;
  let dbBtnClass = 'np-status-btn';
  let dbIcon: ReactElement;
  if (mongoDb === null) {
    dbTitle = 'Checking database…';
    dbBtnClass += ' np-status-btn--warn';
    dbIcon = <IconSpinner />;
  } else if (mongoDb.ok) {
    dbTitle = 'MongoDB is connected. Open Settings for database status.';
    dbBtnClass += ' np-status-btn--ok';
    dbIcon = <IconOk />;
  } else {
    dbTitle = mongoDb.message;
    dbBtnClass += ' np-status-btn--error';
    dbIcon = <IconAlert />;
  }

  return (
    <div className="np-status-strip" role="group" aria-label="Integration status">
      <button
        type="button"
        className={dbBtnClass}
        title={dbTitle}
        aria-label={dbTitle}
        aria-busy={mongoDb === null}
        onClick={() => {
          void navigate('/settings?tab=database');
        }}
      >
        <span className="np-status-btn-label">DB</span>
        {dbIcon}
      </button>
      <button
        type="button"
        className={llmBtnClass}
        title={llmTitle}
        aria-label={llmTitle}
        onClick={() => {
          void navigate('/settings?tab=llm');
        }}
      >
        <span className="np-status-btn-label">LLM</span>
        {llmIcon}
      </button>
      <button
        type="button"
        className={localBtnClass}
        title={localLabel}
        aria-label={localLabel}
        aria-busy={libraryScanning}
        onClick={() => {
          void navigate('/settings?tab=local');
        }}
      >
        <span className="np-status-btn-label">Local</span>
        {localIcon}
      </button>
      <button
        type="button"
        className={`np-status-btn ${spotifyWarn ? 'np-status-btn--warn' : 'np-status-btn--ok'}`}
        title={spotifyLabel}
        aria-label={spotifyLabel}
        onClick={() => {
          void navigate('/settings?tab=spotify');
        }}
      >
        <span className="np-status-btn-label">Spotify</span>
        {spotifyWarn ? <IconAlert /> : <IconOk />}
      </button>
    </div>
  );
}

export function NowPlayingBar(): ReactElement {
  const pb = usePlayback();
  const pbRef = useRef(pb);
  pbRef.current = pb;
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const lastMuteShortcutMsRef = useRef(0);
  const cur = pb.current;
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    return window.deepcut.onGlobalShortcutTriggered((payload) => {
      const p = pbRef.current;
      const navigate = navigateRef.current;
      if (payload.command === 'togglePlay') {
        void p.togglePlay();
        return;
      }
      if (payload.command === 'next') {
        void p.next();
        return;
      }
      if (payload.command === 'previous') {
        void p.previous();
        return;
      }
      if (payload.command === 'openSettings') {
        void navigate('/settings');
        return;
      }
      if (payload.command === 'focusSearch') {
        void navigate('/search');
        return;
      }
      if (payload.command === 'volumeUp') {
        p.adjustVolumeBy(0.05);
        return;
      }
      if (payload.command === 'volumeDown') {
        p.adjustVolumeBy(-0.05);
        return;
      }
      if (payload.command === 'toggleMute') {
        const now = Date.now();
        if (now - lastMuteShortcutMsRef.current < 420) {
          return;
        }
        lastMuteShortcutMsRef.current = now;
        void p.toggleMute();
        return;
      }
    });
  }, []);

  let trackTitle = 'Nothing playing';
  if (cur !== null) {
    trackTitle = pb.nowPlayingTrackTitle === null ? '…' : pb.nowPlayingTrackTitle;
  }
  const trackArtist = pb.primaryArtistDisplayName ?? '';

  let label = '—';
  if (cur?.source === 'spotify') {
    label = 'Spotify';
  } else if (cur?.source === 'local') {
    label = 'Local';
  }

  return (
    <div className="now-playing-bar">
      <div className="np-meta">
        {cur !== null ? (
          <span
            className={`badge np-meta-source-badge ${cur.source === 'spotify' ? 'badge-spotify' : 'badge-local'}`}
          >
            {label}
          </span>
        ) : null}
        <div className="np-meta-text">
          <h3>{trackTitle}</h3>
          {trackArtist !== '' ? <div className="np-meta-artist">{trackArtist}</div> : null}
        </div>
      </div>
      <div className="np-controls">
        <div className="np-transport">
          <button type="button" className="ghost np-transport-btn" aria-label="Previous track" onClick={() => void pb.previous()}>
            ⏮
          </button>
          <button
            type="button"
            className="primary np-transport-btn"
            aria-label={pb.isPlaying ? 'Pause' : 'Play'}
            onClick={() => void pb.togglePlay()}
          >
            {pb.isPlaying ? '⏸' : '▶'}
          </button>
          <button type="button" className="ghost np-transport-btn" aria-label="Next track" onClick={() => void pb.next()}>
            ⏭
          </button>
          <button
            type="button"
            className="ghost np-transport-btn"
            aria-label="Toggle queue"
            onClick={() => { setQueueOpen((v) => !v); }}
          >
            ☰
          </button>
        </div>
        <div className="np-sliders">
          <div className="np-slider-row">
            <span className="np-slider-glyph" aria-hidden="true" title="Seek">
              ⏱
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(pb.durationMs, 1)}
              value={pb.positionMs}
              onChange={(e) => void pb.seek(Number.parseInt(e.target.value, 10))}
              aria-label="Seek"
            />
          </div>
          <div className="np-slider-row">
            <button
              type="button"
              className="ghost np-slider-mute-btn np-slider-glyph np-slider-glyph-svg"
              title={pb.isMuted ? 'Unmute' : 'Mute'}
              aria-label={pb.isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={pb.isMuted}
              onClick={() => void pb.toggleMute()}
            >
              {pb.isMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(pb.volume * 100)}
              onChange={(e) => void pb.setVolume(Number.parseInt(e.target.value, 10) / 100)}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
      <div className="np-status-column">
        <IntegrationStatusStrip />
      </div>
      {queueOpen ? (
        <div className="np-queue-popover panel" role="dialog" aria-label="Playback queue">
          <div className="np-queue-header">
            <strong>Queue</strong>
            <button type="button" className="ghost" onClick={() => void pb.clearQueue()}>
              Clear queue
            </button>
          </div>
          {pb.queue.length === 0 ? <p className="subtitle">Queue is empty.</p> : null}
          {pb.queue.map((entry, index) => (
            <div key={`${entry.source}-${index}`} className="list-row">
              <span className="subtitle">
                {entry.source === 'spotify'
                  ? `Spotify: ${entry.spotifyId}`
                  : entry.filePath.split('/').at(-1) ?? entry.localTrackId}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove queue item ${index + 1}`}
                onClick={() => { void pb.removeQueueEntryAt(index); }}
              >
                −
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
