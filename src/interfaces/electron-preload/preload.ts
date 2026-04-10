import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../ipc-contract.js';

contextBridge.exposeInMainWorld('deepcut', {
  mongoPing: async () => ipcRenderer.invoke(IPC_CHANNELS.mongoPing),
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  saveSettings: async (s: unknown) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, s),
  pickMusicFolder: async () => ipcRenderer.invoke(IPC_CHANNELS.pickMusicFolder),
  rescanLibrary: async () => ipcRenderer.invoke(IPC_CHANNELS.rescanLibrary),
  getLocalTracks: async () => ipcRenderer.invoke(IPC_CHANNELS.getLocalTracks),
  spotifyStartLogin: async () => ipcRenderer.invoke(IPC_CHANNELS.spotifyStartLogin),
  spotifyLogout: async () => ipcRenderer.invoke(IPC_CHANNELS.spotifyLogout),
  spotifyStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.spotifyStatus),
  unifiedSearch: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.unifiedSearch, p),
  getPlaylists: async () => ipcRenderer.invoke(IPC_CHANNELS.getPlaylists),
  savePlaylist: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.savePlaylist, p),
  deletePlaylist: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.deletePlaylist, id),
  addTrackToPlaylist: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.addTrackToPlaylist, p),
  getPlaybackSession: async () => ipcRenderer.invoke(IPC_CHANNELS.getPlaybackSession),
  savePlaybackSession: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.savePlaybackSession, p),
  getArtistEnrichment: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.getArtistEnrichment, p),
  refreshArtistEnrichment: async (p: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.refreshArtistEnrichment, p),
  getSpotifyAccessToken: async () => ipcRenderer.invoke(IPC_CHANNELS.getSpotifyAccessToken),
  spotifyArtistCatalog: async (artistId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.spotifyArtistCatalog, artistId),
  spotifyGetArtist: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.spotifyGetArtist, id),
  spotifyGetAlbum: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.spotifyGetAlbum, id),
  onLibraryUpdated: (cb: () => void) => {
    const listener = (): void => {
      cb();
    };
    ipcRenderer.on(IPC_CHANNELS.onLibraryUpdated, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onLibraryUpdated, listener);
    };
  },
});
