import { Link, NavLink } from 'react-router-dom';
import type { ReactNode, ReactElement } from 'react';
import { NowPlayingBar } from './NowPlayingBar.js';
import { usePlayback } from './playback/PlaybackProvider.js';

function PlaybackErrorBanner(): ReactElement | null {
  const pb = usePlayback();
  const message = pb.error ?? pb.playbackHint;
  if (message === null || message === '') {
    return null;
  }
  return (
    <div className="playback-error-banner" role="alert" aria-live="assertive">
      <p className="playback-error-banner-text">{message}</p>
      <button type="button" className="ghost playback-error-banner-dismiss" onClick={pb.dismissPlaybackError}>
        Dismiss
      </button>
    </div>
  );
}

export function Layout({ children }: { readonly children: ReactNode }): React.ReactElement {
  return (
    <div className="app-shell">
      <div className="app-top-chrome">
        <PlaybackErrorBanner />
        <nav className="top-nav" aria-label="Main">
          <Link to="/" className="top-nav-brand">
            DeepCut
          </Link>
          <div className="top-nav-links">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/now-playing">Now Playing</NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/playlists">Playlists</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </div>
        </nav>
      </div>
      <main className="page">{children}</main>
      <NowPlayingBar />
    </div>
  );
}
