import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import type { UnifiedSearchResult } from '../../../application/unified-search.js';
import { getSearchCap, getSearchDebounceMs } from '../../../application/unified-search.js';
import type { Playlist } from '../../../domain/schemas/playlist.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';
import { localAlbumDisplayTitle } from '../../../shared/local-unknown-meta.js';
import { NewPlaylistModal } from '../components/NewPlaylistModal.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

type PlaylistModalState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'addTrack'; readonly track: TrackRef };

export function SearchPage(): ReactElement {
  const pb = usePlayback();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'spotify' | 'local'>('all');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addToPl, setAddToPl] = useState<string>('');
  const [playlistModal, setPlaylistModal] = useState<PlaylistModalState>({ kind: 'closed' });
  const [modalPlaylistName, setModalPlaylistName] = useState('');
  const [result, setResult] = useState<UnifiedSearchResult | null>(null);
  const debounceMs = useMemo(() => getSearchDebounceMs(), []);
  const cap = useMemo(() => getSearchCap(), []);

  const reloadPlaylists = useCallback((): void => {
    void window.deepcut.getPlaylists().then(setPlaylists);
  }, []);

  const closePlaylistModal = useCallback((): void => {
    setPlaylistModal({ kind: 'closed' });
    setModalPlaylistName('');
  }, []);

  const runSearch = useCallback(async (query: string, f: typeof filter) => {
    const r = (await window.deepcut.unifiedSearch({
      query,
      sourceFilter: f,
    })) as UnifiedSearchResult;
    setResult(r);
  }, []);

  useEffect(() => {
    reloadPlaylists();
  }, [reloadPlaylists]);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(q, filter);
    }, debounceMs);
    return () => { clearTimeout(t); };
  }, [q, filter, runSearch, debounceMs]);

  const confirmPlaylistModal = useCallback((): void => {
    const name = modalPlaylistName.trim();
    if (name.length === 0) {
      return;
    }
    const id = uuidv4();
    if (playlistModal.kind === 'empty') {
      void window.deepcut
        .savePlaylist({
          playlistId: id,
          name,
          entries: [],
        })
        .then(() => {
          reloadPlaylists();
          closePlaylistModal();
        });
      return;
    }
    if (playlistModal.kind === 'addTrack') {
      const ref = playlistModal.track;
      void (async (): Promise<void> => {
        await window.deepcut.savePlaylist({
          playlistId: id,
          name,
          entries: [],
        });
        await window.deepcut.addTrackToPlaylist({
          playlistId: id,
          track: ref,
        });
        reloadPlaylists();
        closePlaylistModal();
      })();
    }
  }, [closePlaylistModal, modalPlaylistName, playlistModal, reloadPlaylists]);

  const modalOpen = playlistModal.kind !== 'closed';
  const modalTitle =
    playlistModal.kind === 'addTrack' ? 'Add to new playlist' : 'New playlist';
  const modalConfirmLabel =
    playlistModal.kind === 'addTrack' ? 'Create and add' : 'Create playlist';

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

      <NewPlaylistModal
        open={modalOpen}
        title={modalTitle}
        confirmLabel={modalConfirmLabel}
        name={modalPlaylistName}
        onNameChange={setModalPlaylistName}
        onConfirm={() => {
          confirmPlaylistModal();
        }}
        onCancel={closePlaylistModal}
      />

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
            {result.localArtists.map((a) => (
              <div key={`local-artist-${a.name}`} className="list-row">
                <div>
                  <Link to={`/local-artist/${encodeURIComponent(a.name)}`}>{a.name}</Link>
                  <span className="subtitle"> · {a.trackCount} tracks</span>
                  <span className="badge badge-local">Local</span>
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
            {result.localAlbums.map((al) => (
              <div key={`local-album-${al.artist}-${al.album}`} className="list-row">
                <div>
                  <Link
                    to={`/local-album/${encodeURIComponent(al.artist)}/${encodeURIComponent(al.album)}`}
                  >
                    {localAlbumDisplayTitle(al.album)}
                  </Link>
                  <span className="subtitle">{al.artist}</span>
                  <span className="subtitle"> · {al.trackCount} tracks</span>
                  <span className="badge badge-local">Local</span>
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Tracks</h2>
            <div
              style={{
                marginBottom: '0.75rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
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
                      if (ref === null) {
                        return;
                      }
                      if (addToPl.length > 0) {
                        void window.deepcut.addTrackToPlaylist({ playlistId: addToPl, track: ref });
                        return;
                      }
                      setPlaylistModal({ kind: 'addTrack', track: ref });
                      setModalPlaylistName('');
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
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setPlaylistModal({ kind: 'empty' });
                  setModalPlaylistName('');
                }}
              >
                Create new playlist
              </button>
              <p className="subtitle" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                Search results below include Spotify playlists and yours when they match the query.
              </p>
            </div>
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
