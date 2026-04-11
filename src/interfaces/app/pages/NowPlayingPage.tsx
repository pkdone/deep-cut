import { usePlayback } from '../playback/PlaybackProvider.js';

export function NowPlayingPage(): React.ReactElement {
  const pb = usePlayback();
  const cur = pb.current;

  return (
    <div>
      <h1>Now playing</h1>
      {cur ? (
        <div className="panel">
          <p>
            Source:{' '}
            <span className="badge badge-both">{cur.source === 'spotify' ? 'Spotify' : 'Local'}</span>
          </p>
          {cur.source === 'local' ? <p className="subtitle">{cur.filePath}</p> : <p className="subtitle">{cur.spotifyUri}</p>}
          <input
            type="range"
            min={0}
            max={Math.max(pb.durationMs, 1)}
            value={pb.positionMs}
            onChange={(e) => void pb.seek(Number.parseInt(e.target.value, 10))}
            style={{ width: '100%', maxWidth: 400 }}
          />
          <p className="subtitle">
            {Math.floor(pb.positionMs / 1000)}s / {Math.floor(pb.durationMs / 1000)}s
          </p>
        </div>
      ) : (
        <p className="subtitle">Nothing playing.</p>
      )}
      {pb.error ? <p className="error-text">{pb.error}</p> : null}
    </div>
  );
}
