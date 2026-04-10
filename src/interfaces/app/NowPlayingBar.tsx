import { Link } from 'react-router-dom';
import { usePlayback } from './playback/PlaybackProvider.js';

export function NowPlayingBar(): React.ReactElement {
  const pb = usePlayback();
  const cur = pb.current;
  let label = '—';
  if (cur?.source === 'spotify') {
    label = 'Spotify';
  } else if (cur?.source === 'local') {
    label = 'Local';
  }
  let title = 'Nothing playing';
  if (cur) {
    title = cur.source === 'local' ? 'Local track' : 'Spotify';
  }

  return (
    <div className="now-playing-bar">
      <div className="np-meta">
        <h3>{title}</h3>
        <p>
          <Link to="/now-playing">Details</Link>
          {' · '}
          <span className="badge badge-both">{label}</span>
        </p>
      </div>
      <div className="np-controls">
        <button type="button" className="ghost" onClick={() => void pb.previous()}>
          Prev
        </button>
        <button type="button" className="primary" onClick={() => void pb.togglePlay()}>
          {pb.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="ghost" onClick={() => void pb.next()}>
          Next
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(pb.durationMs, 1)}
          value={pb.positionMs}
          onChange={(e) => void pb.seek(Number.parseInt(e.target.value, 10))}
          aria-label="Seek"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pb.volume * 100)}
          onChange={(e) => void pb.setVolume(Number.parseInt(e.target.value, 10) / 100)}
          aria-label="Volume"
        />
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--muted)' }}>
        {pb.error ? <span className="error-text">{pb.error}</span> : null}
      </div>
    </div>
  );
}
