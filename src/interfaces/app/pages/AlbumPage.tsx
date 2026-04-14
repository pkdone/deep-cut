import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePlayback } from '../playback/PlaybackProvider.js';
import { LocalLibraryBreadcrumb } from '../components/LocalLibraryBreadcrumb.js';

export function AlbumPage(): React.ReactElement {
  const { albumId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const pb = usePlayback();
  const [data, setData] = useState<{
    name: string;
    artists: { name: string }[];
    tracks: { items: { id: string; name: string; uri: string; duration_ms: number }[] };
  } | null>(null);

  useEffect(() => {
    void window.deepcut.spotifyGetAlbum(albumId).then(setData);
  }, [albumId]);

  const fromArtistId = searchParams.get('artistId');
  const fromArtistName = searchParams.get('artistName');
  const breadcrumb = [
    { label: 'Search', to: '/search' },
    ...(fromArtistId !== null && fromArtistId !== '' && fromArtistName !== null && fromArtistName !== ''
      ? [{ label: fromArtistName, to: `/artist/${encodeURIComponent(fromArtistId)}` }]
      : []),
    { label: data?.name ?? 'Album' },
  ];

  if (!data) {
    return (
      <div>
        <LocalLibraryBreadcrumb segments={breadcrumb} />
        <h1>Album</h1>
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <LocalLibraryBreadcrumb segments={breadcrumb} />
      <h1>{data.name}</h1>
      <p className="subtitle">{data.artists.map((a) => a.name).join(', ')}</p>
      <div className="panel">
        {data.tracks.items.map((t) => (
          <div key={t.id} className="list-row">
            <span>{t.name}</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  void pb.playRef({
                    source: 'spotify',
                    spotifyId: t.id,
                    spotifyUri: t.uri,
                  })
                }
              >
                Play
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  void pb.enqueueRef({
                    source: 'spotify',
                    spotifyId: t.id,
                    spotifyUri: t.uri,
                  })
                }
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
