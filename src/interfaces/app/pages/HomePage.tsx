import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Playlist } from '../../../domain/schemas/playlist.js';

export function HomePage(): React.ReactElement {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    void window.deepcut.getPlaylists().then(setPlaylists);
  }, []);

  return (
    <div>
      <h1>Home</h1>
      <div className="panel">
        <h2>Playlists</h2>
        {playlists.length === 0 ? <p className="subtitle">No playlists yet — create one from Search or Playlists.</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {playlists.map((p) => (
            <li key={p.playlistId} style={{ marginBottom: '0.5rem' }}>
              <Link to={`/playlist/${p.playlistId}`}>{p.name}</Link>
              <span className="subtitle"> · {p.entries.length} tracks</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
