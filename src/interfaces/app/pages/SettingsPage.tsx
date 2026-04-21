import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AppSettings } from '../../../domain/schemas/app-settings.js';
import { SPOTIFY_PLAYBACK_SETTINGS_ERROR_STORAGE_KEY } from '../../../shared/spotify-playback-settings-error.js';
import { INTEGRATION_STATUS_REFRESH_EVENT } from '../integration-status-events.js';
import { LLM_PING_UPDATED_EVENT } from '../llm-ping-events.js';

const SETTINGS_TAB_PANELS: Readonly<Record<string, string>> = {
  database: 'settings-panel-database',
  local: 'settings-panel-local',
  spotify: 'settings-panel-spotify',
  llm: 'settings-panel-llm',
};

const SETTINGS_TAB_HEADINGS: Readonly<Record<string, string>> = {
  database: 'settings-heading-database',
  local: 'settings-heading-local',
  spotify: 'settings-heading-spotify',
  llm: 'settings-heading-llm',
};

const HIGHLIGHT_MS = 2000;

export function SettingsPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const [s, setS] = useState<AppSettings | null>(null);
  const [mongo, setMongo] = useState<string>('');
  const [spotifyStatus, setSpotifyStatus] = useState<{ connected: boolean; expiresAtMs: number } | null>(
    null
  );
  const [spotifyAuthBusy, setSpotifyAuthBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [llmPingError, setLlmPingError] = useState<string | null>(null);
  const [spotifyPlaybackErrorBanner, setSpotifyPlaybackErrorBanner] = useState<string | null>(null);
  const saveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSpotifyStatus = useCallback(async (): Promise<void> => {
    const status = await window.deepcut.spotifyStatus();
    setSpotifyStatus(status);
  }, []);

  const showSaveNotice = useCallback((): void => {
    if (saveNoticeTimerRef.current !== null) {
      clearTimeout(saveNoticeTimerRef.current);
    }
    setSaveNotice('Settings saved.');
    saveNoticeTimerRef.current = setTimeout(() => {
      setSaveNotice(null);
      saveNoticeTimerRef.current = null;
    }, 4000);
  }, []);

  const persistSettings = useCallback(
    async (next: AppSettings): Promise<void> => {
      await window.deepcut.saveSettings(next);
      setS(next);
      showSaveNotice();
      window.dispatchEvent(new CustomEvent(INTEGRATION_STATUS_REFRESH_EVENT));
    },
    [showSaveNotice]
  );

  const saveLlmSettings = useCallback(async (): Promise<void> => {
    setLlmPingError(null);
    await persistSettings(s);
    if (s.llmProvider === 'none') {
      window.dispatchEvent(new CustomEvent(LLM_PING_UPDATED_EVENT));
      return;
    }
    const key =
      s.llmProvider === 'openai' ? s.openaiApiKey?.trim() ?? '' : s.anthropicApiKey?.trim() ?? '';
    if (key === '') {
      setLlmPingError('Add an API key for the selected provider, then save again.');
      window.dispatchEvent(new CustomEvent(LLM_PING_UPDATED_EVENT));
      return;
    }
    const r = await window.deepcut.llmPing();
    window.dispatchEvent(new CustomEvent(LLM_PING_UPDATED_EVENT));
    if (!r.ok) {
      setLlmPingError(r.message ?? 'LLM connectivity check failed.');
    }
  }, [s, persistSettings]);

  useEffect(() => {
    return () => {
      if (saveNoticeTimerRef.current !== null) {
        clearTimeout(saveNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void window.deepcut.getSettings().then(setS);
    void window.deepcut.mongoPing().then((r) => {
      setMongo(r.ok ? 'Connected' : r.message);
    });
    void refreshSpotifyStatus();
  }, [refreshSpotifyStatus]);

  useEffect(() => {
    if (s === null) {
      return undefined;
    }
    if (searchParams.get('tab') !== 'spotify') {
      return undefined;
    }
    try {
      const raw = sessionStorage.getItem(SPOTIFY_PLAYBACK_SETTINGS_ERROR_STORAGE_KEY);
      if (raw !== null && raw !== '') {
        sessionStorage.removeItem(SPOTIFY_PLAYBACK_SETTINGS_ERROR_STORAGE_KEY);
        setSpotifyPlaybackErrorBanner(raw);
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }, [searchParams, s]);

  useEffect(() => {
    if (s === null) {
      return undefined;
    }
    if (searchParams.get('firstRun') !== '1' || s.firstRunWizardCompleted === true) {
      return undefined;
    }
    const next = { ...s, firstRunWizardCompleted: true };
    void window.deepcut.saveSettings(next).then(() => {
      setS(next);
    });
    return undefined;
  }, [s, searchParams]);

  useEffect(() => {
    if (s === null) {
      return undefined;
    }
    const tab = searchParams.get('tab');
    if (tab === null || !Object.hasOwn(SETTINGS_TAB_PANELS, tab)) {
      return undefined;
    }
    const panelId = SETTINGS_TAB_PANELS[tab];
    const headingId = SETTINGS_TAB_HEADINGS[tab];

    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    let removeHighlightTimer: ReturnType<typeof setTimeout> | undefined;

    const rafId = requestAnimationFrame(() => {
      const panel = document.getElementById(panelId);
      const heading = document.getElementById(headingId);
      if (panel === null) {
        return;
      }
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.classList.add('settings-panel--highlight');

      focusTimer = window.setTimeout(() => {
        heading?.focus({ preventScroll: true });
      }, 400);

      removeHighlightTimer = window.setTimeout(() => {
        panel.classList.remove('settings-panel--highlight');
      }, HIGHLIGHT_MS);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
      if (removeHighlightTimer !== undefined) {
        clearTimeout(removeHighlightTimer);
      }
      document.getElementById(panelId)?.classList.remove('settings-panel--highlight');
    };
  }, [searchParams, s]);

  if (!s) {
    return <p>Loading…</p>;
  }

  const spotifyConnected = spotifyStatus?.connected ?? false;
  const canConnectSpotify = !spotifyAuthBusy && !spotifyConnected;
  const canDisconnectSpotify = !spotifyAuthBusy && spotifyConnected;
  let spotifySessionStatusText = 'No active Spotify session.';
  if (spotifyAuthBusy) {
    spotifySessionStatusText = 'Updating Spotify session…';
  } else if (spotifyConnected) {
    spotifySessionStatusText = 'Spotify session is connected.';
  }

  return (
    <div className="settings-page">
      {saveNotice !== null ? (
        <div className="settings-save-notice" role="status" aria-live="polite">
          {saveNotice}
        </div>
      ) : null}
      <div id="settings-panel-database" className="panel">
        <h2 id="settings-heading-database" tabIndex={-1}>
          Database
        </h2>
        <p className="subtitle">Controls app data persistence and startup health checks.</p>
        <p>Status: {mongo}</p>
      </div>
      <div id="settings-panel-local" className="panel">
        <h2 id="settings-heading-local" tabIndex={-1}>
          Local music folders
        </h2>
        <p className="subtitle">Configure folders DeepCut scans for local MP3 tracks.</p>
        <ul className="folder-list">
          {s.localMusicFolders.map((f, index) => (
            <li key={`${f}::${index}`} className="folder-list-item">
              <span className="folder-path">{f}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove folder ${f}`}
                onClick={() => {
                  const next = {
                    ...s,
                    localMusicFolders: s.localMusicFolders.filter((_, i) => i !== index),
                  };
                  void persistSettings(next);
                }}
              >
                −
              </button>
            </li>
          ))}
        </ul>
        <div className="settings-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              void window.deepcut.pickMusicFolder().then((p) => {
                if (!p) {
                  return;
                }
                const next = { ...s, localMusicFolders: [...s.localMusicFolders, p] };
                void persistSettings(next);
              });
            }}
          >
            Add folder
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void window.deepcut.rescanLibrary();
            }}
          >
            Rescan library
          </button>
        </div>
      </div>
      <div id="settings-panel-spotify" className="panel">
        <h2 id="settings-heading-spotify" tabIndex={-1}>
          Spotify
        </h2>
        <p className="subtitle">Configure Spotify auth and choose how playback is delivered.</p>
        {spotifyPlaybackErrorBanner !== null ? (
          <div className="panel" role="alert">
            <p className="error-text">{spotifyPlaybackErrorBanner}</p>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSpotifyPlaybackErrorBanner(null);
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="settings-field">
          <label htmlFor="spotify-client-id">Client ID</label>
          <input
            id="spotify-client-id"
            autoComplete="off"
            title="Spotify app Client ID from the Spotify Developer Dashboard."
            value={s.spotifyClientId ?? ''}
            onChange={(e) => { setS({ ...s, spotifyClientId: e.target.value }); }}
          />
        </div>
        <div className="settings-field">
          <label htmlFor="spotify-client-secret">Client secret</label>
          <input
            id="spotify-client-secret"
            type="password"
            autoComplete="off"
            title="Spotify app Client Secret from the Spotify Developer Dashboard."
            value={s.spotifyClientSecret ?? ''}
            onChange={(e) => { setS({ ...s, spotifyClientSecret: e.target.value }); }}
          />
        </div>
        <fieldset className="search-entity-fieldset">
          <legend>Spotify playback</legend>
          <label
            className="search-entity-label"
            title="Uses the Web API only: plays on an existing Spotify Connect device (desktop, phone, speaker, or the Spotify Web Player in your browser)."
          >
            <input
              type="radio"
              name="spotifyPlaybackMode"
              checked={s.spotifyPlaybackMode === 'web-api-remote'}
              onChange={() => {
                void persistSettings({ ...s, spotifyPlaybackMode: 'web-api-remote' });
              }}
            />
            Web API (remote device) (default)
          </label>
          <label
            className="search-entity-label"
            title="Creates an in-app Spotify player (Web Playback SDK) and uses the Web API to play on that device. Requires Widevine DRM inside Electron (often unavailable on Linux)."
          >
            <input
              type="radio"
              name="spotifyPlaybackMode"
              checked={s.spotifyPlaybackMode === 'web-playback-sdk'}
              onChange={() => {
                void persistSettings({ ...s, spotifyPlaybackMode: 'web-playback-sdk' });
              }}
            />
            Web Playback SDK (optional)
          </label>
        </fieldset>
        <p className="subtitle">
          DeepCut always uses the Spotify Web API for search and metadata. Web API (remote device)
          sends playback to another Spotify app (desktop, phone, speaker, or the Spotify Web Player
          in your browser); Web Playback SDK plays audio inside DeepCut when the environment supports
          it. If the selected mode fails, change mode or fix the issue here—DeepCut does not switch
          modes automatically.
        </p>
        <label className="search-entity-label" title="If enabled, startup attempts Spotify login when credentials exist.">
          <input type="checkbox" checked={true} readOnly />
          Auto-connect at startup when credentials are set
        </label>
        <div className="settings-actions">
          <button
            type="button"
            className="primary"
            onClick={() => void persistSettings(s)}
          >
            Save Spotify credentials
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canConnectSpotify}
            aria-disabled={!canConnectSpotify}
            onClick={() => {
              if (!canConnectSpotify) {
                return;
              }
              setSpotifyAuthBusy(true);
              void window.deepcut.spotifyStartLogin()
                .then(async () => {
                  window.dispatchEvent(new CustomEvent(INTEGRATION_STATUS_REFRESH_EVENT));
                  await refreshSpotifyStatus();
                })
                .finally(() => {
                  setSpotifyAuthBusy(false);
                });
            }}
          >
            Connect Spotify
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!canDisconnectSpotify}
            aria-disabled={!canDisconnectSpotify}
            onClick={() => {
              if (!canDisconnectSpotify) {
                return;
              }
              setSpotifyAuthBusy(true);
              void window.deepcut.spotifyLogout()
                .then(async () => {
                  window.dispatchEvent(new CustomEvent(INTEGRATION_STATUS_REFRESH_EVENT));
                  await refreshSpotifyStatus();
                })
                .finally(() => {
                  setSpotifyAuthBusy(false);
                });
            }}
          >
            Disconnect session
          </button>
        </div>
        <p className="subtitle" role="status" aria-live="polite">
          {spotifySessionStatusText}
        </p>
      </div>
      <div id="settings-panel-llm" className="panel">
        <h2 id="settings-heading-llm" tabIndex={-1}>
          LLM
        </h2>
        <p className="subtitle">Controls artist insight provider and API credentials.</p>
        <label className="search-entity-label" title="When disabled, Now Playing only serves cached insights unless manually refreshed.">
          <input
            type="checkbox"
            checked={s.nowPlayingAutoRefreshOnMiss ?? false}
            onChange={(e) => {
              void persistSettings({ ...s, nowPlayingAutoRefreshOnMiss: e.target.checked });
            }}
          />
          Auto-refresh Now Playing insights on cache miss
        </label>
        <div className="settings-field">
          <label htmlFor="llm-provider">Provider</label>
          <select
            id="llm-provider"
            title="Select the LLM provider used for artist enrichment."
            value={s.llmProvider}
            onChange={(e) => {
              setLlmPingError(null);
              setS({ ...s, llmProvider: e.target.value as AppSettings['llmProvider'] });
            }}
          >
            <option value="none">None</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        {s.llmProvider === 'openai' ? (
          <div className="settings-field">
            <label htmlFor="openai-api-key">OpenAI API key</label>
            <input
              id="openai-api-key"
              type="password"
              autoComplete="off"
              value={s.openaiApiKey ?? ''}
              onChange={(e) => { setS({ ...s, openaiApiKey: e.target.value }); }}
            />
          </div>
        ) : null}
        {s.llmProvider === 'anthropic' ? (
          <div className="settings-field">
            <label htmlFor="anthropic-api-key">Anthropic API key</label>
            <input
              id="anthropic-api-key"
              type="password"
              autoComplete="off"
              value={s.anthropicApiKey ?? ''}
              onChange={(e) => { setS({ ...s, anthropicApiKey: e.target.value }); }}
            />
          </div>
        ) : null}
        {s.llmProvider === 'none' ? (
          <p className="subtitle">Select OpenAI or Anthropic to enter an API key.</p>
        ) : null}
        {llmPingError !== null ? (
          <p className="settings-llm-ping-error" role="alert">
            {llmPingError}
          </p>
        ) : null}
        <div className="settings-actions">
          <button type="button" className="primary" onClick={() => void saveLlmSettings()}>
            Save LLM settings
          </button>
        </div>
      </div>
    </div>
  );
}
