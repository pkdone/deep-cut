import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

interface AlbumRow {
  readonly albumKey: string;
  readonly displayTitle: string;
  readonly trackCount: number;
}

function buildAlbumRows(tracks: readonly LocalTrack[]): AlbumRow[] {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    counts.set(t.album, (counts.get(t.album) ?? 0) + 1);
  }
  const rows: AlbumRow[] = [...counts.entries()].map(([albumKey, trackCount]) => ({
    albumKey,
    displayTitle: localAlbumDisplayTitle(albumKey),
    trackCount,
  }));
  rows.sort((a, b) => {
    const aOthers = a.albumKey === UNKNOWN_ALBUM;
    const bOthers = b.albumKey === UNKNOWN_ALBUM;
    if (aOthers !== bOthers) {
      return aOthers ? 1 : -1;
    }
    return a.displayTitle.localeCompare(b.displayTitle);
  });
  return rows;
}

export function LocalArtistPage(): React.ReactElement {
  const { encodedName = '' } = useParams();
  const name = safeDecode(encodedName);
  const pb = usePlayback();
  const [tracks, setTracks] = useState<LocalTrack[]>([]);

  const load = useCallback((): void => {
    void window.deepcut.getLocalTracks().then((raw) => {
      const all = raw as LocalTrack[];
      setTracks(all.filter((t) => t.artist === name));
    });
  }, [name]);

  const albumRows = useMemo(() => buildAlbumRows(tracks), [tracks]);

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
          { label: name },
        ]}
      />
      <h1>{name}</h1>
      <p className="subtitle">
        Local library · {tracks.length} tracks · {albumRows.length} albums
      </p>
      <div className="panel">
        <h2>Albums</h2>
        {albumRows.length === 0 ? (
          <p className="subtitle">No local albums for this artist.</p>
        ) : null}
        {albumRows.map((row) => (
          <div key={row.albumKey} className="list-row">
            <div>
              <Link
                to={`/local-album/${encodeURIComponent(name)}/${encodeURIComponent(row.albumKey)}`}
              >
                {row.displayTitle}
              </Link>
              <span className="subtitle"> · {row.trackCount} tracks</span>
              <span className="badge badge-local">Local</span>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const first = tracks.find(
                  (t) => t.artist === name && t.album === row.albumKey
                );
                if (first !== undefined) {
                  void pb.playRef({
                    source: 'local',
                    localTrackId: first.localTrackId,
                    filePath: first.filePath,
                  });
                }
              }}
            >
              Play
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
