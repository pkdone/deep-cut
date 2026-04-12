import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AppSettings } from '../../../domain/schemas/app-settings.js';
import { LLM_PING_UPDATED_EVENT } from '../llm-ping-events.js';

const SETTINGS_TAB_PANELS: Readonly<Record<string, string>> = {
  local: 'settings-panel-local',
  spotify: 'settings-panel-spotify',
  llm: 'settings-panel-llm',
};

const SETTINGS_TAB_HEADINGS: Readonly<Record<string, string>> = {
  local: 'settings-heading-local',
  spotify: 'settings-heading-spotify',
  llm: 'settings-heading-llm',
};

const HIGHLIGHT_MS = 2000;

export function SettingsPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const [s, setS] = useState<AppSettings | null>(null);
  const [mongo, setMongo] = useState<string>('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [llmPingError, setLlmPingError] = useState<string | null>(null);
  const saveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    void window.deepcut.mongoPing().then(
      () => { setMongo('Connected'); },
      () => { setMongo('Unreachable — check MONGODB_URI and db:init'); }
    );
  }, []);

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

  return (
    <div className="settings-page">
      {saveNotice !== null ? (
        <div className="settings-save-notice" role="status" aria-live="polite">
          {saveNotice}
        </div>
      ) : null}
      <div className="panel">
        <h2>Database</h2>
        <p>Status: {mongo}</p>
      </div>
      <div id="settings-panel-local" className="panel">
        <h2 id="settings-heading-local" tabIndex={-1}>
          Local music folders
        </h2>
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
          Spotify API
        </h2>
        <div className="settings-field">
          <label htmlFor="spotify-client-id">Client ID</label>
          <input
            id="spotify-client-id"
            autoComplete="off"
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
            value={s.spotifyClientSecret ?? ''}
            onChange={(e) => { setS({ ...s, spotifyClientSecret: e.target.value }); }}
          />
        </div>
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
            onClick={() => void window.deepcut.spotifyStartLogin()}
          >
            Connect Spotify (browser OAuth)
          </button>
          <button type="button" className="ghost" onClick={() => void window.deepcut.spotifyLogout()}>
            Disconnect session
          </button>
        </div>
      </div>
      <div id="settings-panel-llm" className="panel">
        <h2 id="settings-heading-llm" tabIndex={-1}>
          LLM
        </h2>
        <div className="settings-field">
          <label htmlFor="llm-provider">Provider</label>
          <select
            id="llm-provider"
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
