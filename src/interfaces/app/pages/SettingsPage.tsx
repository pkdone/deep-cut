import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../domain/schemas/app-settings.js';

export function SettingsPage(): React.ReactElement {
  const [s, setS] = useState<AppSettings | null>(null);
  const [mongo, setMongo] = useState<string>('');

  useEffect(() => {
    void window.deepcut.getSettings().then(setS);
    void window.deepcut.mongoPing().then(
      () => { setMongo('Connected'); },
      () => { setMongo('Unreachable — check MONGODB_URI and db:init'); }
    );
  }, []);

  if (!s) {
    return <p>Loading…</p>;
  }

  return (
    <div className="settings-page">
      <div className="panel">
        <h2>Database</h2>
        <p>Status: {mongo}</p>
      </div>
      <div className="panel">
        <h2>Local music folders</h2>
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
                  void window.deepcut.saveSettings(next).then(() => { setS(next); });
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
                void window.deepcut.saveSettings(next).then(() => { setS(next); });
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
      <div className="panel">
        <h2>Spotify API</h2>
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
            onClick={() => void window.deepcut.saveSettings(s)}
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
      <div className="panel">
        <h2>LLM</h2>
        <div className="settings-field">
          <label htmlFor="llm-provider">Provider</label>
          <select
            id="llm-provider"
            value={s.llmProvider}
            onChange={(e) =>
              { setS({ ...s, llmProvider: e.target.value as AppSettings['llmProvider'] }); }
            }
          >
            <option value="none">None</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
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
        <div className="settings-actions">
          <button type="button" className="primary" onClick={() => void window.deepcut.saveSettings(s)}>
            Save LLM settings
          </button>
        </div>
      </div>
    </div>
  );
}
