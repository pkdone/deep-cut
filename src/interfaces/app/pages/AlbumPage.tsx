import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePlayback } from '../playback/PlaybackProvider.js';

export function AlbumPage(): React.ReactElement {
  const { albumId = '' } = useParams();
  const pb = usePlayback();
  const [data, setData] = useState<{
    name: string;
    artists: { name: string }[];
    tracks: { items: { id: string; name: string; uri: string; duration_ms: number }[] };
  } | null>(null);

  useEffect(() => {
    void window.deepcut.spotifyGetAlbum(albumId).then(setData);
  }, [albumId]);

  if (!data) {
    return (
      <div>
        <h1>Album</h1>
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h1>{data.name}</h1>
      <p className="subtitle">{data.artists.map((a) => a.name).join(', ')}</p>
      <div className="panel">
        {data.tracks.items.map((t) => (
          <div key={t.id} className="list-row">
            <span>{t.name}</span>
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
          </div>
        ))}
      </div>
    </div>
  );
}
