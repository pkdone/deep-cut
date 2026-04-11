import { useEffect, useState, type ReactElement } from 'react';
import type { LocalTrack } from '../../domain/schemas/local-track.js';
import { usePlayback } from './playback/PlaybackProvider.js';

function basenameFromPath(p: string): string {
  const norm = p.replaceAll('\\', '/');
  const i = norm.lastIndexOf('/');
  const base = i >= 0 ? norm.slice(i + 1) : norm;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function SpeakerIcon(): ReactElement {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-slider-icon-svg"
    >
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function SpeakerMutedIcon(): ReactElement {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-slider-icon-svg"
    >
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function spotifyArtistLine(j: { artists?: { name?: string }[] }): string {
  const names = j.artists?.map((a) => a.name).filter((n): n is string => Boolean(n)) ?? [];
  return names.join(', ');
}

export function NowPlayingBar(): ReactElement {
  const pb = usePlayback();
  const cur = pb.current;
  const [trackTitle, setTrackTitle] = useState<string>('Nothing playing');
  const [trackArtist, setTrackArtist] = useState<string>('');

  useEffect(() => {
    if (cur === null) {
      setTrackTitle('Nothing playing');
      setTrackArtist('');
      return undefined;
    }
    if (cur.source === 'local') {
      let cancelled = false;
      setTrackTitle('…');
      setTrackArtist('');
      void window.deepcut.getLocalTracks().then((raw) => {
        if (cancelled) {
          return;
        }
        const tracks = raw as LocalTrack[];
        const t = tracks.find((x) => x.localTrackId === cur.localTrackId);
        if (t !== undefined) {
          setTrackTitle(t.title);
          setTrackArtist(t.artist);
        } else {
          setTrackTitle(basenameFromPath(cur.filePath));
          setTrackArtist('');
        }
      });
      return () => {
        cancelled = true;
      };
    }
    const ac = new AbortController();
    setTrackTitle('…');
    setTrackArtist('');
    void (async (): Promise<void> => {
      try {
        const token = await window.deepcut.getSpotifyAccessToken();
        if (!token) {
          setTrackTitle('Spotify');
          setTrackArtist('');
          return;
        }
        const res = await fetch(
          `https://api.spotify.com/v1/tracks/${encodeURIComponent(cur.spotifyId)}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal }
        );
        if (!res.ok) {
          setTrackTitle('Spotify');
          setTrackArtist('');
          return;
        }
        const j = (await res.json()) as { name?: string; artists?: { name?: string }[] };
        setTrackTitle(j.name ?? 'Spotify');
        setTrackArtist(spotifyArtistLine(j));
      } catch {
        if (!ac.signal.aborted) {
          setTrackTitle('Spotify');
          setTrackArtist('');
        }
      }
    })();
    return () => {
      ac.abort();
    };
  }, [cur]);

  let label = '—';
  if (cur?.source === 'spotify') {
    label = 'Spotify';
  } else if (cur?.source === 'local') {
    label = 'Local';
  }

  return (
    <div className="now-playing-bar">
      <div className="np-meta">
        {cur !== null ? (
          <span
            className={`badge np-meta-source-badge ${cur.source === 'spotify' ? 'badge-spotify' : 'badge-local'}`}
          >
            {label}
          </span>
        ) : null}
        <div className="np-meta-text">
          <h3>{trackTitle}</h3>
          {trackArtist !== '' ? <div className="np-meta-artist">{trackArtist}</div> : null}
        </div>
      </div>
      <div className="np-controls">
        <div className="np-transport">
          <button type="button" className="ghost np-transport-btn" aria-label="Previous track" onClick={() => void pb.previous()}>
            ⏮
          </button>
          <button
            type="button"
            className="primary np-transport-btn"
            aria-label={pb.isPlaying ? 'Pause' : 'Play'}
            onClick={() => void pb.togglePlay()}
          >
            {pb.isPlaying ? '⏸' : '▶'}
          </button>
          <button type="button" className="ghost np-transport-btn" aria-label="Next track" onClick={() => void pb.next()}>
            ⏭
          </button>
        </div>
        <div className="np-sliders">
          <div className="np-slider-row">
            <span className="np-slider-glyph" aria-hidden="true" title="Seek">
              ⏱
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(pb.durationMs, 1)}
              value={pb.positionMs}
              onChange={(e) => void pb.seek(Number.parseInt(e.target.value, 10))}
              aria-label="Seek"
            />
          </div>
          <div className="np-slider-row">
            <button
              type="button"
              className="ghost np-slider-mute-btn np-slider-glyph np-slider-glyph-svg"
              title={pb.isMuted ? 'Unmute' : 'Mute'}
              aria-label={pb.isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={pb.isMuted}
              onClick={() => void pb.toggleMute()}
            >
              {pb.isMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(pb.volume * 100)}
              onChange={(e) => void pb.setVolume(Number.parseInt(e.target.value, 10) / 100)}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--muted)' }}>
        {pb.error ? <span className="error-text">{pb.error}</span> : null}
      </div>
    </div>
  );
}
