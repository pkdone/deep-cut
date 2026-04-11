import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { NowPlayingBar } from './NowPlayingBar.js';

export function Layout({ children }: { readonly children: ReactNode }): React.ReactElement {
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <strong style={{ marginRight: '1rem' }}>DeepCut</strong>
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/search">Search</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <NavLink to="/now-playing">Now Playing</NavLink>
      </nav>
      <main className="page">{children}</main>
      <NowPlayingBar />
    </div>
  );
}
