import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { Layout } from './Layout.js';
import { HomePage } from './pages/HomePage.js';
import { SearchPage } from './pages/SearchPage.js';
import { ArtistPage } from './pages/ArtistPage.js';
import { AlbumPage } from './pages/AlbumPage.js';
import { PlaylistPage } from './pages/PlaylistPage.js';
import { NowPlayingPage } from './pages/NowPlayingPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { LocalAlbumPage } from './pages/LocalAlbumPage.js';
import { LocalArtistPage } from './pages/LocalArtistPage.js';
import { PlaylistsPage } from './pages/PlaylistsPage.js';
import { SpotifyRemoteDevicePrompt } from './playback/SpotifyRemoteDevicePrompt.js';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function FirstRunGuard(): React.ReactElement | null {
  const navigate = useNavigate();
  const location = useLocation();
  const didInitialGateCheckRef = useRef(false);

  useEffect(() => {
    if (didInitialGateCheckRef.current) {
      return;
    }
    didInitialGateCheckRef.current = true;
    void window.deepcut.getSettings().then((settings) => {
      if (settings.firstRunWizardCompleted || location.pathname !== '/') {
        return;
      }
      void navigate('/settings?tab=spotify&firstRun=1', { replace: true });
    }).catch(() => undefined);
  }, [location.pathname, navigate]);

  return null;
}

export function App(): React.ReactElement {
  return (
    <Layout>
      <FirstRunGuard />
      <SpotifyRemoteDevicePrompt />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/local-artist/:encodedName" element={<LocalArtistPage />} />
        <Route path="/local-album/:encodedArtist/:encodedAlbum" element={<LocalAlbumPage />} />
        <Route path="/artist/:artistId" element={<ArtistPage />} />
        <Route path="/album/:albumId" element={<AlbumPage />} />
        <Route path="/playlist/:playlistId" element={<PlaylistPage />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/now-playing" element={<NowPlayingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
