import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Playlist } from '../../../domain/schemas/playlist.js';

export function HomePage(): React.ReactElement {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mongo, setMongo] = useState<string>('…');

  useEffect(() => {
    void window.deepcut.mongoPing().then(
      () => { setMongo('Connected'); },
      () => { setMongo('Error'); }
    );
    void window.deepcut.getPlaylists().then(setPlaylists);
  }, []);

  return (
    <div>
      <h1>Home</h1>
      <p className="subtitle">MongoDB: {mongo}</p>
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
      <p>
        <Link to="/search">Open search</Link>
      </p>
    </div>
  );
}
