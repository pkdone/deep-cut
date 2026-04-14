import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlayback } from '../playback/PlaybackProvider.js';

export function ArtistPage(): ReactElement {
  const { artistId = '' } = useParams();
  const pb = usePlayback();
  const [name, setName] = useState('…');
  const [catalog, setCatalog] = useState<{
    albums: { id: string; name: string; releaseYear?: number }[];
    topTracks: { id: string; name: string; uri: string; durationMs: number }[];
    hasMoreAlbums: boolean;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const a = await window.deepcut.spotifyGetArtist(artistId);
      setName(a?.name ?? artistId);
      const cat = await window.deepcut.spotifyArtistCatalog(artistId);
      setCatalog(cat);
    })();
  }, [artistId]);

  return (
    <div>
      <h1>{name}</h1>

      <div className="panel">
        <h2>From Spotify</h2>
        {catalog ? (
          <>
            <h3>Albums</h3>
            {catalog.albums.map((al) => (
              <div key={al.id} className="list-row">
                <Link to={`/album/${al.id}`}>
                  {al.name} {al.releaseYear ? `(${al.releaseYear})` : ''}
                </Link>
              </div>
            ))}
            {catalog.hasMoreAlbums ? (
              <p className="subtitle">More albums exist on Spotify; this view currently shows the first page.</p>
            ) : null}
            <h3>Top tracks</h3>
            {catalog.topTracks.length > 0 ? (
              catalog.topTracks.map((t) => (
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
              ))
            ) : (
              <p className="subtitle">Top tracks are unavailable from Spotify for this session/region.</p>
            )}
          </>
        ) : (
          <p className="subtitle">Connect Spotify to load catalog.</p>
        )}
      </div>
    </div>
  );
}
