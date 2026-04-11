import { Navigate, Route, Routes } from 'react-router-dom';
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

export function App(): React.ReactElement {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/local-artist/:encodedName" element={<LocalArtistPage />} />
        <Route path="/local-album/:encodedArtist/:encodedAlbum" element={<LocalAlbumPage />} />
        <Route path="/artist/:artistId" element={<ArtistPage />} />
        <Route path="/album/:albumId" element={<AlbumPage />} />
        <Route path="/playlist/:playlistId" element={<PlaylistPage />} />
        <Route path="/now-playing" element={<NowPlayingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
