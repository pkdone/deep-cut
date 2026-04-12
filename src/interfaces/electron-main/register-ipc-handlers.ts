import { type BrowserWindow, dialog, ipcMain } from 'electron';
import chokidar from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import { fetchArtistEnrichment } from '../../infrastructure/llm/fetch-artist-enrichment.js';
import { pingAnthropic, pingOpenAi } from '../../infrastructure/llm/llm-connectivity-ping.js';
import { isEnrichmentFresh } from '../../application/enrichment-cache-policy.js';
import { buildUnifiedSearch } from '../../application/unified-search.js';
import type { AppSettings } from '../../domain/schemas/app-settings.js';
import type { Playlist } from '../../domain/schemas/playlist.js';
import { playlistSchema } from '../../domain/schemas/playlist.js';
import { scanLocalFolder } from '../../infrastructure/local-library/scan-local-folder.js';
import { getMongoClient } from '../../infrastructure/persistence/mongo-client.js';
import { MongoAppSettingsRepository } from '../../infrastructure/persistence/mongo-app-settings-repository.js';
import { MongoArtistEnrichmentRepository } from '../../infrastructure/persistence/mongo-artist-enrichment-repository.js';
import { MongoLocalTrackRepository } from '../../infrastructure/persistence/mongo-local-track-repository.js';
import { MongoPlaybackSessionRepository } from '../../infrastructure/persistence/mongo-playback-session-repository.js';
import { MongoPlaylistRepository } from '../../infrastructure/persistence/mongo-playlist-repository.js';
import {
  fetchSpotifySearchUrl,
  getArtistAlbums,
  getArtistTopTracks,
  spotifySearch,
  type SpotifySearchApiEntityType,
} from '../../infrastructure/spotify/spotify-api.js';
import { startSpotifyAuthorization } from '../../infrastructure/spotify/spotify-oauth.js';
import { logError, logInfo, logWarn } from '../../shared/app-logger.js';
import { ConfigurationError, ExternalServiceError, ValidationError } from '../../shared/errors.js';
import {
  IPC_CHANNELS,
  addTrackToPlaylistPayload,
  artistEnrichmentPayload,
  savePlaybackPayload,
  savePlaylistPayload,
  saveSettingsPayload,
  unifiedSearchPayload,
  spotifySearchNextPayload,
} from '../ipc-contract.js';

let spotifyAccessToken: string | null = null;
let spotifyExpiresAtMs = 0;

/** Last llmPing IPC result; null if never run or cleared (e.g. LLM set to none). */
let lastLlmPingResult: { ok: boolean; message: string | null } | null = null;

const SPOTIFY_SEARCH_API_TYPE: Record<
  'artists' | 'albums' | 'tracks',
  SpotifySearchApiEntityType
> = {
  artists: 'artist',
  albums: 'album',
  tracks: 'track',
};

function defaultSettings(): AppSettings {
  return {
    localMusicFolders: [],
    llmProvider: 'none',
  };
}

export function registerIpcHandlers(params: {
  getMongoUri: () => string;
  getMainWindow: () => BrowserWindow | null;
  broadcastLibraryUpdated: () => void;
  broadcastLibraryScanState: (scanning: boolean) => void;
}): void {
  const { getMongoUri, getMainWindow, broadcastLibraryUpdated, broadcastLibraryScanState } = params;

  let libraryScanning = false;
  let scanMutex: Promise<void> = Promise.resolve();

  let watchStop: (() => Promise<void>) | null = null;

  const setupWatch = async (folders: readonly string[]): Promise<void> => {
    if (watchStop) {
      await watchStop();
      watchStop = null;
    }
    if (folders.length === 0) {
      return;
    }
    const watcher = chokidar.watch([...folders], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = (): void => {
      if (t) {
        clearTimeout(t);
      }
      t = setTimeout(() => {
        void rescanAllFolders().catch((e: unknown) => {
          logError('Watch rescan failed', { e: String(e) });
        });
      }, 2000);
    };
    watcher.on('all', schedule);
    watchStop = async () => {
      await watcher.close();
    };
  };

  const rescanAllFolders = async (): Promise<void> => {
    const previous = scanMutex;
    let releaseCurrent!: () => void;
    scanMutex = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    await previous;
    libraryScanning = true;
    broadcastLibraryScanState(true);
    try {
      const uri = getMongoUri();
      const client = await getMongoClient(uri);
      const db = client.db();
      const settingsRepo = new MongoAppSettingsRepository(
        db.collection(MongoAppSettingsRepository.collectionName)
      );
      const localRepo = new MongoLocalTrackRepository(
        db.collection(MongoLocalTrackRepository.collectionName)
      );
      const s = (await settingsRepo.get()) ?? defaultSettings();
      const merged: Awaited<ReturnType<typeof scanLocalFolder>> = [];
      for (const root of s.localMusicFolders) {
        const part = await scanLocalFolder(root);
        merged.push(...part);
      }
      const byPath = new Map(merged.map((t) => [t.filePath, t] as const));
      const existing = await localRepo.findAll();
      const toRemove = existing
        .filter((e) => {
          const still = [...byPath.keys()].some((p) => e.filePath === p);
          return !still;
        })
        .map((e) => e.localTrackId);
      await localRepo.removeByIds(toRemove);
      await localRepo.upsertMany([...byPath.values()]);
      broadcastLibraryUpdated();
      logInfo('Library rescan complete', { tracks: byPath.size });
    } finally {
      libraryScanning = false;
      broadcastLibraryScanState(false);
      releaseCurrent();
    }
  };

  ipcMain.handle(IPC_CHANNELS.mongoPing, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    await client.db().command({ ping: 1 });
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.getSettings, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const settingsRepo = new MongoAppSettingsRepository(
      db.collection(MongoAppSettingsRepository.collectionName)
    );
    return (await settingsRepo.get()) ?? defaultSettings();
  });

  ipcMain.handle(IPC_CHANNELS.llmPing, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const settingsRepo = new MongoAppSettingsRepository(
      db.collection(MongoAppSettingsRepository.collectionName)
    );
    const s = (await settingsRepo.get()) ?? defaultSettings();
    if (s.llmProvider === 'none') {
      lastLlmPingResult = null;
      return { ok: false as const, message: 'LLM provider is not selected.' };
    }
    const key =
      s.llmProvider === 'openai' ? s.openaiApiKey?.trim() ?? '' : s.anthropicApiKey?.trim() ?? '';
    if (key === '') {
      lastLlmPingResult = {
        ok: false,
        message: 'API key is missing for the selected provider.',
      };
      return lastLlmPingResult;
    }
    try {
      if (s.llmProvider === 'openai') {
        await pingOpenAi(key);
      } else {
        await pingAnthropic(key);
      }
      lastLlmPingResult = { ok: true, message: null };
      return lastLlmPingResult;
    } catch (e: unknown) {
      let msg: string;
      if (e instanceof ExternalServiceError) {
        msg = e.message;
      } else if (e instanceof Error) {
        msg = e.message;
      } else {
        msg = String(e);
      }
      logWarn('LLM ping failed', { message: msg });
      lastLlmPingResult = { ok: false, message: msg };
      return lastLlmPingResult;
    }
  });

  ipcMain.handle(IPC_CHANNELS.getLlmPingResult, () => lastLlmPingResult);

  ipcMain.handle(IPC_CHANNELS.saveSettings, async (_e, raw: unknown) => {
    const parsed = saveSettingsPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid settings payload');
    }
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const settingsRepo = new MongoAppSettingsRepository(
      db.collection(MongoAppSettingsRepository.collectionName)
    );
    await settingsRepo.save(parsed.data);
    await setupWatch(parsed.data.localMusicFolders);
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.pickMusicFolder, async () => {
    const win = getMainWindow();
    const r = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || r.filePaths.length === 0) {
      return null;
    }
    return r.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.rescanLibrary, async () => {
    await rescanAllFolders();
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.getLibraryScanState, () => ({ scanning: libraryScanning }));

  ipcMain.handle(IPC_CHANNELS.getLocalTracks, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const localRepo = new MongoLocalTrackRepository(db.collection(MongoLocalTrackRepository.collectionName));
    return [...(await localRepo.findAll())];
  });

  ipcMain.handle(IPC_CHANNELS.spotifyStartLogin, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const settingsRepo = new MongoAppSettingsRepository(
      db.collection(MongoAppSettingsRepository.collectionName)
    );
    const s = (await settingsRepo.get()) ?? defaultSettings();
    const cid = s.spotifyClientId?.trim();
    const sec = s.spotifyClientSecret?.trim();
    if (!cid || !sec) {
      throw new ConfigurationError('Set Spotify Client ID and Secret in Settings first.');
    }
    const tokens = await startSpotifyAuthorization({ clientId: cid, clientSecret: sec });
    spotifyAccessToken = tokens.accessToken;
    spotifyExpiresAtMs = tokens.expiresAtMs;
    return { ok: true as const, expiresAtMs: tokens.expiresAtMs };
  });

  ipcMain.handle(IPC_CHANNELS.spotifyLogout, () => {
    spotifyAccessToken = null;
    spotifyExpiresAtMs = 0;
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.spotifyStatus, () => ({
    connected: Boolean(spotifyAccessToken && Date.now() < spotifyExpiresAtMs - 60_000),
    expiresAtMs: spotifyExpiresAtMs,
  }));

  ipcMain.handle(IPC_CHANNELS.getSpotifyAccessToken, () => {
    if (!spotifyAccessToken || Date.now() >= spotifyExpiresAtMs - 60_000) {
      return null;
    }
    return spotifyAccessToken;
  });

  ipcMain.handle(IPC_CHANNELS.spotifyGetArtist, async (_e, artistId: string) => {
    if (!spotifyAccessToken || Date.now() >= spotifyExpiresAtMs - 60_000) {
      return null;
    }
    const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${spotifyAccessToken}` },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as { id: string; name: string };
  });

  ipcMain.handle(IPC_CHANNELS.spotifyGetAlbum, async (_e, albumId: string) => {
    if (!spotifyAccessToken || Date.now() >= spotifyExpiresAtMs - 60_000) {
      return null;
    }
    const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: { Authorization: `Bearer ${spotifyAccessToken}` },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as {
      id: string;
      name: string;
      artists: { name: string }[];
      tracks: { items: { id: string; name: string; uri: string; duration_ms: number }[] };
    };
  });

  ipcMain.handle(IPC_CHANNELS.spotifyArtistCatalog, async (_e, artistId: string) => {
    if (!spotifyAccessToken || Date.now() >= spotifyExpiresAtMs - 60_000) {
      return { albums: [] as { id: string; name: string; releaseYear?: number }[], topTracks: [] as { id: string; name: string; uri: string; durationMs: number }[] };
    }
    const [albums, topTracks] = await Promise.all([
      getArtistAlbums(spotifyAccessToken, artistId),
      getArtistTopTracks(spotifyAccessToken, artistId),
    ]);
    return { albums, topTracks };
  });

  ipcMain.handle(IPC_CHANNELS.unifiedSearch, async (_e, raw: unknown) => {
    const parsed = unifiedSearchPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid search payload');
    }
    const { query, sourceFilter, entityType } = parsed.data;
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const localRepo = new MongoLocalTrackRepository(db.collection(MongoLocalTrackRepository.collectionName));
    const playlistRepo = new MongoPlaylistRepository(db.collection(MongoPlaylistRepository.collectionName));
    const locals = await localRepo.findAll();
    const playlists = await playlistRepo.findAll();
    const appPl = playlists.map((p) => ({ id: p.playlistId, name: p.name }));

    let spotify = null;
    if (sourceFilter !== 'local' && spotifyAccessToken && Date.now() < spotifyExpiresAtMs - 60_000) {
      try {
        spotify = await spotifySearch(
          spotifyAccessToken,
          query,
          SPOTIFY_SEARCH_API_TYPE[entityType]
        );
      } catch (e) {
        logWarn('Spotify search failed', { e: String(e) });
      }
    }

    const built = buildUnifiedSearch({
      spotify: sourceFilter === 'local' ? null : spotify,
      locals,
      appPlaylists: appPl,
      query,
      entityType,
    });

    if (sourceFilter === 'spotify') {
      return {
        ...built,
        tracks: built.tracks.filter((t) => t.spotify !== undefined),
        localArtists: [],
        localAlbums: [],
      };
    }
    if (sourceFilter === 'local') {
      return {
        ...built,
        artists: [],
        albums: [],
        tracks: built.tracks.filter((t) => t.local !== undefined),
        playlists: built.playlists.filter((p) => p.owner === 'DeepCut'),
        spotifyPaging: null,
      };
    }
    return built;
  });

  ipcMain.handle(IPC_CHANNELS.spotifySearchNext, async (_e, raw: unknown) => {
    const parsed = spotifySearchNextPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid spotifySearchNext payload');
    }
    if (!spotifyAccessToken || Date.now() >= spotifyExpiresAtMs - 60_000) {
      throw new ValidationError('Spotify not connected or token expired');
    }
    return fetchSpotifySearchUrl(spotifyAccessToken, parsed.data.url);
  });

  ipcMain.handle(IPC_CHANNELS.getPlaylists, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const playlistRepo = new MongoPlaylistRepository(db.collection(MongoPlaylistRepository.collectionName));
    return [...(await playlistRepo.findAll())];
  });

  ipcMain.handle(IPC_CHANNELS.savePlaylist, async (_e, raw: unknown) => {
    const parsed = savePlaylistPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid playlist');
    }
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const playlistRepo = new MongoPlaylistRepository(db.collection(MongoPlaylistRepository.collectionName));
    const now = new Date();
    const pl: Playlist = playlistSchema.parse({
      playlistId: parsed.data.playlistId,
      name: parsed.data.name,
      entries: parsed.data.entries,
      createdAt: now,
      updatedAt: now,
    });
    const existing = await playlistRepo.findById(pl.playlistId);
    const merged: Playlist = existing
      ? { ...pl, createdAt: existing.createdAt, updatedAt: now }
      : pl;
    await playlistRepo.save(merged);
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.deletePlaylist, async (_e, id: string) => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const playlistRepo = new MongoPlaylistRepository(db.collection(MongoPlaylistRepository.collectionName));
    await playlistRepo.deleteById(id);
    const settingsRepo = new MongoAppSettingsRepository(
      db.collection(MongoAppSettingsRepository.collectionName)
    );
    const s = (await settingsRepo.get()) ?? defaultSettings();
    if (s.lastAddToPlaylistId === id) {
      await settingsRepo.save({ ...s, lastAddToPlaylistId: undefined });
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.addTrackToPlaylist, async (_e, raw: unknown) => {
    const parsed = addTrackToPlaylistPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid add-to-playlist payload');
    }
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const playlistRepo = new MongoPlaylistRepository(db.collection(MongoPlaylistRepository.collectionName));
    const existing = await playlistRepo.findById(parsed.data.playlistId);
    if (!existing) {
      throw new ValidationError('Playlist not found');
    }
    const entry = {
      entryId: uuidv4(),
      track: parsed.data.track,
      addedAt: new Date(),
    };
    const updated: Playlist = playlistSchema.parse({
      ...existing,
      entries: [...existing.entries, entry],
      updatedAt: new Date(),
    });
    await playlistRepo.save(updated);
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.getPlaybackSession, async () => {
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const repo = new MongoPlaybackSessionRepository(
      db.collection(MongoPlaybackSessionRepository.collectionName)
    );
    return (await repo.get()) ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.savePlaybackSession, async (_e, raw: unknown) => {
    const parsed = savePlaybackPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid playback session');
    }
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const repo = new MongoPlaybackSessionRepository(
      db.collection(MongoPlaybackSessionRepository.collectionName)
    );
    await repo.save(parsed.data);
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.getArtistEnrichment, async (_e, raw: unknown) => {
    const parsed = artistEnrichmentPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid artist payload');
    }
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const repo = new MongoArtistEnrichmentRepository(
      db.collection(MongoArtistEnrichmentRepository.collectionName)
    );
    const cached = await repo.get(parsed.data.spotifyArtistId);
    if (!cached) {
      return { kind: 'miss' as const };
    }
    if (!isEnrichmentFresh(cached.cachedAt)) {
      return { kind: 'stale' as const, cached };
    }
    return { kind: 'hit' as const, cached };
  });

  ipcMain.handle(IPC_CHANNELS.refreshArtistEnrichment, async (_e, raw: unknown) => {
    const parsed = artistEnrichmentPayload.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid artist payload');
    }
    const uri = getMongoUri();
    const client = await getMongoClient(uri);
    const db = client.db();
    const settingsRepo = new MongoAppSettingsRepository(
      db.collection(MongoAppSettingsRepository.collectionName)
    );
    const enrichRepo = new MongoArtistEnrichmentRepository(
      db.collection(MongoArtistEnrichmentRepository.collectionName)
    );
    const s = (await settingsRepo.get()) ?? defaultSettings();
    if (s.llmProvider === 'none') {
      throw new ConfigurationError('Select an LLM provider and API key in Settings.');
    }
    const key =
      s.llmProvider === 'openai' ? s.openaiApiKey?.trim() : s.anthropicApiKey?.trim();
    if (!key) {
      throw new ConfigurationError('Missing LLM API key for selected provider.');
    }
    const tokenForEnrich = spotifyAccessToken;
    if (!tokenForEnrich || Date.now() >= spotifyExpiresAtMs - 60_000) {
      throw new ConfigurationError('Spotify not connected; connect before enriching.');
    }

    const run = async (): Promise<void> => {
      const entry = await fetchArtistEnrichment({
        provider: s.llmProvider,
        apiKey: key,
        accessToken: tokenForEnrich,
        spotifyArtistId: parsed.data.spotifyArtistId,
        artistName: parsed.data.artistName,
      });
      await enrichRepo.upsert(entry);
    };

    try {
      await run();
    } catch (e) {
      logWarn('Enrichment retry', { e: String(e) });
      await run();
    }

    const cached = await enrichRepo.get(parsed.data.spotifyArtistId);
    return { ok: true as const, cached };
  });

  void (async () => {
    try {
      const uri = getMongoUri();
      const client = await getMongoClient(uri);
      const db = client.db();
      const settingsRepo = new MongoAppSettingsRepository(
        db.collection(MongoAppSettingsRepository.collectionName)
      );
      const s = (await settingsRepo.get()) ?? defaultSettings();
      await setupWatch(s.localMusicFolders);
    } catch (e) {
      logError('Initial folder watch setup failed', { e: String(e) });
    }
  })();
}
