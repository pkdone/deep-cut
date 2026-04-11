import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UnifiedSearchResult } from '../../../application/unified-search.js';
import { getSearchCap, getSearchDebounceMs } from '../../../application/unified-search.js';
import type { Playlist } from '../../../domain/schemas/playlist.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

export function SearchPage(): React.ReactElement {
  const pb = usePlayback();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'spotify' | 'local'>('all');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addToPl, setAddToPl] = useState<string>('');
  const [result, setResult] = useState<UnifiedSearchResult | null>(null);
  const debounceMs = useMemo(() => getSearchDebounceMs(), []);
  const cap = useMemo(() => getSearchCap(), []);

  const runSearch = useCallback(async (query: string, f: typeof filter) => {
    const r = (await window.deepcut.unifiedSearch({
      query,
      sourceFilter: f,
    })) as UnifiedSearchResult;
    setResult(r);
  }, []);

  useEffect(() => {
    void window.deepcut.getPlaylists().then(setPlaylists);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(q, filter);
    }, debounceMs);
    return () => { clearTimeout(t); };
  }, [q, filter, runSearch, debounceMs]);

  return (
    <div>
      <h1>Search</h1>
      <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <input
          placeholder="Search artists, albums, tracks…"
          value={q}
          onChange={(e) => { setQ(e.target.value); }}
          style={{ flex: '1 1 240px' }}
        />
        <select value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); }}>
          <option value="all">All sources</option>
          <option value="spotify">Spotify</option>
          <option value="local">Local</option>
        </select>
        <span className="subtitle">Max {cap} / section</span>
      </div>

      {result ? (
        <>
          <section className="panel">
            <h2>Artists</h2>
            {result.artists.map((a) => (
              <div key={a.id} className="list-row">
                <div>
                  <Link to={`/artist/${a.id}`}>{a.name}</Link>
                  <span className="badge badge-spotify">Spotify</span>
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Albums</h2>
            {result.albums.map((al) => (
              <div key={al.id} className="list-row">
                <div>
                  <Link to={`/album/${al.id}`}>{al.name}</Link>
                  <span className="subtitle">{al.artists.join(', ')}</span>
                  <span className="badge badge-spotify">Spotify</span>
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Tracks</h2>
            <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label className="subtitle">
                Add to playlist
                <select
                  value={addToPl}
                  onChange={(e) => { setAddToPl(e.target.value); }}
                  style={{ marginLeft: '0.5rem', maxWidth: 220 }}
                >
                  <option value="">—</option>
                  {playlists.map((p) => (
                    <option key={p.playlistId} value={p.playlistId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {result.tracks.map((row, idx) => (
              <div key={`${row.primaryTitle}-${idx}`} className="list-row">
                <div>
                  <strong>{row.primaryTitle}</strong>
                  {row.subtitle ? <div className="subtitle">{row.subtitle}</div> : null}
                  <div className="subtitle">
                    {row.artistLine} — {row.albumLine}
                  </div>
                  <span className="badge badge-both">
                    {(() => {
                      if (row.spotify && row.local) {
                        return 'Spotify + Local';
                      }
                      if (row.spotify) {
                        return 'Spotify';
                      }
                      return 'Local';
                    })()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      if (row.spotify) {
                        void pb.playRef({
                          source: 'spotify',
                          spotifyId: row.spotify.id,
                          spotifyUri: row.spotify.uri,
                        });
                      } else if (row.local) {
                        void pb.playRef({
                          source: 'local',
                          localTrackId: row.local.localTrackId,
                          filePath: row.local.filePath,
                        });
                      }
                    }}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!addToPl}
                    onClick={() => {
                      let ref: TrackRef | null = null;
                      if (row.spotify) {
                        ref = {
                          source: 'spotify',
                          spotifyId: row.spotify.id,
                          spotifyUri: row.spotify.uri,
                        };
                      } else if (row.local) {
                        ref = {
                          source: 'local',
                          localTrackId: row.local.localTrackId,
                          filePath: row.local.filePath,
                        };
                      }
                      if (ref && addToPl) {
                        void window.deepcut.addTrackToPlaylist({ playlistId: addToPl, track: ref });
                      }
                    }}
                  >
                    Add to playlist
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Playlists</h2>
            {result.playlists.map((p) => (
              <div key={p.id} className="list-row">
                <div>
                  <Link to={`/playlist/${p.id}`}>{p.name}</Link>
                  <span className="subtitle">{p.owner}</span>
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
