import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ArtistEnrichmentCache } from '../../../domain/schemas/artist-enrichment.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

export function ArtistPage(): React.ReactElement {
  const { artistId = '' } = useParams();
  const pb = usePlayback();
  const [name, setName] = useState('…');
  const [catalog, setCatalog] = useState<{
    albums: { id: string; name: string; releaseYear?: number }[];
    topTracks: { id: string; name: string; uri: string; durationMs: number }[];
  } | null>(null);
  const [enrich, setEnrich] = useState<ArtistEnrichmentCache | null>(null);
  const [enrichErr, setEnrichErr] = useState<string | null>(null);
  const [offlineMsg, setOfflineMsg] = useState(false);

  useEffect(() => {
    void (async () => {
      const a = await window.deepcut.spotifyGetArtist(artistId);
      setName(a?.name ?? artistId);
      const cat = await window.deepcut.spotifyArtistCatalog(artistId);
      setCatalog(cat);
      const r = await window.deepcut.getArtistEnrichment({
        spotifyArtistId: artistId,
        artistName: a?.name ?? artistId,
      });
      if (r.kind === 'hit') {
        setEnrich(r.cached as ArtistEnrichmentCache);
      } else if (r.kind === 'stale') {
        setEnrich(r.cached as ArtistEnrichmentCache);
      } else {
        setEnrich(null);
        if (!navigator.onLine) {
          setOfflineMsg(true);
        }
      }
    })();
  }, [artistId]);

  return (
    <div>
      <h1>{name}</h1>
      {offlineMsg && !enrich ? (
        <p className="error-text">
          Artist enrichment is not available offline without a cached copy. Connect to the internet and use Refresh.
        </p>
      ) : null}
      {enrichErr ? <p className="error-text">{enrichErr}</p> : null}

      <div className="panel">
        <button
          type="button"
          className="primary"
          onClick={() => {
            void (async () => {
              setEnrichErr(null);
              try {
                const r = await window.deepcut.refreshArtistEnrichment({
                  spotifyArtistId: artistId,
                  artistName: name,
                });
                setEnrich(r.cached as ArtistEnrichmentCache | null);
              } catch (e) {
                setEnrichErr(String(e));
              }
            })();
          }}
        >
          Refresh enrichment
        </button>
      </div>

      {enrich ? (
        <div className="panel">
          <p>{enrich.payload.synopsis}</p>
          <h3>Albums (ranked)</h3>
          <ul>
            {enrich.payload.albums.map((al) => (
              <li key={`${al.name}-${String(al.rank)}`}>
                {al.rank}. {al.name} ({al.releaseYear})
              </li>
            ))}
          </ul>
          <h3>Top tracks</h3>
          <ul>
            {enrich.payload.topTracks.map((t) => (
              <li key={t.rank}>
                {t.rank}. {t.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel">
        <h2>From Spotify</h2>
        {catalog ? (
          <>
            <h3>Albums</h3>
            {catalog.albums.map((al) => (
              <div key={al.id} className="list-row">
                <span>
                  {al.name} {al.releaseYear ? `(${al.releaseYear})` : ''}
                </span>
              </div>
            ))}
            <h3>Top tracks</h3>
            {catalog.topTracks.map((t) => (
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
          </>
        ) : (
          <p className="subtitle">Connect Spotify to load catalog.</p>
        )}
      </div>
    </div>
  );
}
