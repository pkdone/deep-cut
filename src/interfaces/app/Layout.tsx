import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { isSearchFlowPathname, SEARCH_LAST_ROUTE_KEY } from '../../shared/search-flow-return-path.js';
import { NowPlayingBar } from './NowPlayingBar.js';
import { usePlayback } from './playback/PlaybackProvider.js';

function PlaybackErrorBanner(): ReactElement | null {
  const pb = usePlayback();
  const message = pb.error ?? pb.playbackNotice ?? pb.playbackHint;
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

function SearchNavLink(): ReactElement {
  const location = useLocation();
  const [searchNavTo, setSearchNavTo] = useState(() => {
    try {
      return sessionStorage.getItem(SEARCH_LAST_ROUTE_KEY) ?? '/search';
    } catch {
      return '/search';
    }
  });

  useEffect(() => {
    const { pathname, search } = location;
    if (!isSearchFlowPathname(pathname)) {
      return;
    }
    const full = `${pathname}${search}`;
    try {
      sessionStorage.setItem(SEARCH_LAST_ROUTE_KEY, full);
    } catch {
      /* ignore */
    }
    setSearchNavTo(full);
  }, [location]);

  return (
    <NavLink
      to={searchNavTo}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
    >
      Search
    </NavLink>
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
            <SearchNavLink />
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
