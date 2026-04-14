import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../ipc-contract.js';

contextBridge.exposeInMainWorld('deepcut', {
  mongoPing: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.mongoPing) as Promise<
      { ok: true } | { ok: false; message: string }
    >,
  getSettings: async () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  saveSettings: async (s: unknown) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, s),
  pickMusicFolder: async () => ipcRenderer.invoke(IPC_CHANNELS.pickMusicFolder),
  rescanLibrary: async () => ipcRenderer.invoke(IPC_CHANNELS.rescanLibrary),
  getLibraryScanState: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.getLibraryScanState) as Promise<{ scanning: boolean }>,
  getLocalTracks: async () => ipcRenderer.invoke(IPC_CHANNELS.getLocalTracks),
  spotifyStartLogin: async () => ipcRenderer.invoke(IPC_CHANNELS.spotifyStartLogin),
  spotifyLogout: async () => ipcRenderer.invoke(IPC_CHANNELS.spotifyLogout),
  spotifyStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.spotifyStatus),
  unifiedSearch: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.unifiedSearch, p),
  spotifySearchNext: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.spotifySearchNext, p),
  getPlaylists: async () => ipcRenderer.invoke(IPC_CHANNELS.getPlaylists),
  savePlaylist: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.savePlaylist, p),
  getPlaylistTree: async () => ipcRenderer.invoke(IPC_CHANNELS.getPlaylistTree),
  savePlaylistTree: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.savePlaylistTree, p),
  deletePlaylist: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.deletePlaylist, id),
  addTrackToPlaylist: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.addTrackToPlaylist, p),
  removeTrackFromPlaylist: async (p: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeTrackFromPlaylist, p),
  getPlaybackSession: async () => ipcRenderer.invoke(IPC_CHANNELS.getPlaybackSession),
  savePlaybackSession: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.savePlaybackSession, p),
  getArtistEnrichment: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.getArtistEnrichment, p),
  refreshArtistEnrichment: async (p: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.refreshArtistEnrichment, p),
  getArtistImage: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.getArtistImage, p),
  refreshArtistImage: async (p: unknown) => ipcRenderer.invoke(IPC_CHANNELS.refreshArtistImage, p),
  resolvePlaybackArtistForEnrichment: async (p: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.resolvePlaybackArtistForEnrichment, p),
  llmPing: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.llmPing) as Promise<{ ok: boolean; message: string | null }>,
  getLlmPingResult: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.getLlmPingResult) as Promise<{
      ok: boolean;
      message: string | null;
    } | null>,
  getSpotifyAccessToken: async () => ipcRenderer.invoke(IPC_CHANNELS.getSpotifyAccessToken),
  spotifyArtistCatalog: async (artistId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.spotifyArtistCatalog, artistId),
  spotifyGetArtist: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.spotifyGetArtist, id),
  spotifyGetAlbum: async (id: string) => ipcRenderer.invoke(IPC_CHANNELS.spotifyGetAlbum, id),
  openExternalUrl: async (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, url) as Promise<{ ok: boolean }>,
  onLibraryUpdated: (cb: () => void) => {
    const listener = (): void => {
      cb();
    };
    ipcRenderer.on(IPC_CHANNELS.onLibraryUpdated, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onLibraryUpdated, listener);
    };
  },
  onLibraryScanState: (cb: (payload: { scanning: boolean }) => void) => {
    const listener = (_e: unknown, payload: { scanning: boolean }): void => {
      cb(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.libraryScanState, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.libraryScanState, listener);
    };
  },
  onIntegrationAutoConnectState: (
    cb: (payload: { service: 'spotify'; status: 'connected' | 'failed'; message?: string }) => void
  ) => {
    const listener = (
      _e: unknown,
      payload: { service: 'spotify'; status: 'connected' | 'failed'; message?: string }
    ): void => {
      cb(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.integrationAutoConnectState, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.integrationAutoConnectState, listener);
    };
  },
  onGlobalShortcutTriggered: (
    cb: (payload: { command: string }) => void
  ) => {
    const listener = (_e: unknown, payload: { command: string }): void => {
      cb(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.globalShortcutTriggered, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.globalShortcutTriggered, listener);
    };
  },
});
