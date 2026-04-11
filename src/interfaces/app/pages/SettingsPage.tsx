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
    <div>
      <h1>Settings</h1>
      <div className="panel">
        <h2>MongoDB</h2>
        <p>Status: {mongo}</p>
        <p className="subtitle">Connection string comes from MONGODB_URI (e.g. .env.local).</p>
      </div>
      <div className="panel">
        <h2>Local music folders</h2>
        <ul>
          {s.localMusicFolders.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
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
      <div className="panel">
        <h2>Spotify API</h2>
        <label>
          Client ID
          <input
            value={s.spotifyClientId ?? ''}
            onChange={(e) => { setS({ ...s, spotifyClientId: e.target.value }); }}
          />
        </label>
        <label>
          Client secret
          <input
            type="password"
            value={s.spotifyClientSecret ?? ''}
            onChange={(e) => { setS({ ...s, spotifyClientSecret: e.target.value }); }}
          />
        </label>
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
      <div className="panel">
        <h2>LLM</h2>
        <select
          value={s.llmProvider}
          onChange={(e) =>
            { setS({ ...s, llmProvider: e.target.value as AppSettings['llmProvider'] }); }
          }
        >
          <option value="none">None</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <label>
          OpenAI API key
          <input
            type="password"
            value={s.openaiApiKey ?? ''}
            onChange={(e) => { setS({ ...s, openaiApiKey: e.target.value }); }}
          />
        </label>
        <label>
          Anthropic API key
          <input
            type="password"
            value={s.anthropicApiKey ?? ''}
            onChange={(e) => { setS({ ...s, anthropicApiKey: e.target.value }); }}
          />
        </label>
        <button type="button" className="primary" onClick={() => void window.deepcut.saveSettings(s)}>
          Save LLM settings
        </button>
      </div>
    </div>
  );
}
