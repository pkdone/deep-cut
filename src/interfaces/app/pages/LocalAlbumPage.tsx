import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { LocalTrack } from '../../../domain/schemas/local-track.js';
import { UNKNOWN_ALBUM, localAlbumDisplayTitle } from '../../../shared/local-unknown-meta.js';
import { LocalLibraryBreadcrumb } from '../components/LocalLibraryBreadcrumb.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function LocalAlbumPage(): React.ReactElement {
  const { encodedArtist = '', encodedAlbum = '' } = useParams();
  const artist = safeDecode(encodedArtist);
  const album = safeDecode(encodedAlbum);
  const displayAlbumTitle = localAlbumDisplayTitle(album);
  const pb = usePlayback();
  const [tracks, setTracks] = useState<LocalTrack[]>([]);

  const load = useCallback((): void => {
    void window.deepcut.getLocalTracks().then((raw) => {
      const all = raw as LocalTrack[];
      setTracks(
        all.filter((t) => t.artist === artist && t.album === album).sort((a, b) =>
          a.title.localeCompare(b.title)
        )
      );
    });
  }, [artist, album]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return window.deepcut.onLibraryUpdated(load);
  }, [load]);

  return (
    <div>
      <LocalLibraryBreadcrumb
        segments={[
          { label: 'Search', to: '/search' },
          { label: artist, to: `/local-artist/${encodeURIComponent(artist)}` },
          { label: displayAlbumTitle },
        ]}
      />
      <h1>{displayAlbumTitle}</h1>
      <p className="subtitle">
        {artist}
        {album === UNKNOWN_ALBUM ? ' · Tracks without album metadata' : null}
      </p>
      <p className="subtitle">
        Local library · {tracks.length} tracks
      </p>
      <div className="panel">
        <h2>Tracks</h2>
        {tracks.length === 0 ? (
          <p className="subtitle">No local tracks for this album.</p>
        ) : null}
        {tracks.map((t) => (
          <div key={t.localTrackId} className="list-row">
            <div>
              <strong>{t.title}</strong>
              <div className="subtitle">
                {t.artist} — {t.album}
              </div>
              <span className="badge badge-local">Local</span>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  void pb.playRef({
                    source: 'local',
                    localTrackId: t.localTrackId,
                    filePath: t.filePath,
                  });
                }}
              >
                Play
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  void pb.enqueueRef({
                    source: 'local',
                    localTrackId: t.localTrackId,
                    filePath: t.filePath,
                  });
                }}
              >
                Add to Q
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
