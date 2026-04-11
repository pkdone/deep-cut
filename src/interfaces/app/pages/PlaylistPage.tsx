import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import type { Playlist, PlaylistEntry } from '../../../domain/schemas/playlist.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

export function PlaylistPage(): React.ReactElement {
  const { playlistId } = useParams();
  const id = playlistId ?? '';
  const pb = usePlayback();
  const [pl, setPl] = useState<Playlist | null>(null);
  const [name, setName] = useState('');

  const reload = (): void => {
    void window.deepcut.getPlaylists().then((list) => {
      const p = list.find((x) => x.playlistId === id);
      setPl(p ?? null);
      if (p) {
        setName(p.name);
      }
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when id changes
  }, [id]);

  const save = async (): Promise<void> => {
    if (!pl) {
      return;
    }
    await window.deepcut.savePlaylist({
      playlistId: pl.playlistId,
      name: name || pl.name,
      entries: pl.entries,
    });
    reload();
  };

  const removeEntry = (entryId: string): void => {
    if (!pl) {
      return;
    }
    setPl({
      ...pl,
      entries: pl.entries.filter((e) => e.entryId !== entryId),
      updatedAt: new Date(),
    });
  };

  const playAll = (): void => {
    if (!pl || pl.entries.length === 0) {
      return;
    }
    const refs: TrackRef[] = pl.entries.map((e) => e.track);
    void pb.setQueue(refs, 0, { kind: 'playlist', playlistId: pl.playlistId });
  };

  if (!pl && id) {
    return (
      <div>
        <h1>Playlist</h1>
        <p className="subtitle">Not found. Create a new playlist below.</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const newId = uuidv4();
            void window.deepcut
              .savePlaylist({
                playlistId: newId,
                name: 'New playlist',
                entries: [],
              })
              .then(() => {
                window.location.hash = `#/playlist/${newId}`;
              });
          }}
        >
          Create playlist
        </button>
      </div>
    );
  }

  if (!pl) {
    return (
      <div>
        <h1>Playlists</h1>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const newId = uuidv4();
            void window.deepcut
              .savePlaylist({
                playlistId: newId,
                name: 'New playlist',
                entries: [],
              })
              .then(() => {
                window.location.hash = `#/playlist/${newId}`;
              });
          }}
        >
          Create playlist
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Playlist</h1>
      <div className="panel">
        <label>
          Name{' '}
          <input value={name} onChange={(e) => { setName(e.target.value); }} />
        </label>
        <button type="button" className="primary" onClick={() => void save()}>
          Save name
        </button>
        <button type="button" className="ghost" onClick={() => { playAll(); }}>
          Play all
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const ok = window.confirm(
              `Delete playlist "${pl.name}"? This cannot be undone.`
            );
            if (!ok) {
              return;
            }
            void window.deepcut.deletePlaylist(pl.playlistId).then(() => {
              window.location.hash = '#/';
            });
          }}
        >
          Delete playlist
        </button>
      </div>
      <div className="panel">
        <h2>Tracks</h2>
        {pl.entries.map((e: PlaylistEntry) => (
          <div key={e.entryId} className="list-row">
            <div>
              {e.track.source === 'spotify' ? (
                <span>Spotify track</span>
              ) : (
                <span>{e.track.filePath.split('/').pop()}</span>
              )}
            </div>
            <button type="button" className="ghost" onClick={() => { removeEntry(e.entryId); }}>
              Remove
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void pb.playRef(e.track, { kind: 'playlist', playlistId: pl.playlistId })}
            >
              Play
            </button>
          </div>
        ))}
        <p className="subtitle">Add tracks from Search (feature: use Play → Add to playlist in a future pass).</p>
      </div>
    </div>
  );
}
