import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { SpotifyPlaybackMode } from '../../../domain/schemas/app-settings.js';
import type { LocalTrack } from '../../../domain/schemas/local-track.js';
import type { PlaybackContext as PbCtx, PlaybackSession } from '../../../domain/schemas/playback-session.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';
import { SPOTIFY_PLAYBACK_SETTINGS_ERROR_STORAGE_KEY } from '../../../shared/spotify-playback-settings-error.js';
import { INTEGRATION_STATUS_REFRESH_EVENT } from '../integration-status-events.js';

function spotifyArtistLine(j: { artists?: { name?: string }[] }): string {
  const names = j.artists?.map((a) => a.name).filter((n): n is string => Boolean(n)) ?? [];
  return names.join(', ');
}

function basenameFromPath(p: string): string {
  const norm = p.replaceAll('\\', '/');
  const i = norm.lastIndexOf('/');
  const base = i >= 0 ? norm.slice(i + 1) : norm;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

interface PlaybackState {
  current: TrackRef | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  isMuted: boolean;
  queue: TrackRef[];
  queueIndex: number;
  context: PbCtx;
  error: string | null;
  /** Non-blocking UX copy (Web Player adoption, poll mismatch); not cleared by successful finalize like `error`. */
  playbackHint: string | null;
}

interface PlaybackApi extends PlaybackState {
  /** Track title for the Now Playing bar; `null` while loading metadata for the current track. */
  nowPlayingTrackTitle: string | null;
  /** Album name when known from tags (local) or Spotify track metadata. */
  nowPlayingAlbumName: string | null;
  /** Primary artist line for the current track (same source as the Now Playing bar). */
  primaryArtistDisplayName: string | null;
  playRef: (ref: TrackRef, ctx?: PbCtx) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  setQueue: (tracks: TrackRef[], startIndex: number, ctx: PbCtx) => Promise<void>;
  enqueueRef: (ref: TrackRef) => Promise<void>;
  removeQueueEntryAt: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  /**
   * When the current track is Spotify, describes the transport actually in use (Web Playback SDK vs
   * Connect and device name from the API). `null` when not applicable.
   */
  spotifyPlaybackMechanism: string | null;
  /** True when Web API (remote device) mode has no device and the user should be prompted to open Spotify Web Player. */
  spotifyRemoteDevicePromptOpen: boolean;
  /** User confirmed the prompt: open open.spotify.com externally, poll for the new device, then play. */
  confirmOpenSpotifyWebPlayer: () => Promise<void>;
  /** User dismissed the prompt without opening anything. */
  dismissSpotifyRemoteDevicePrompt: () => void;
  /** Clears the in-app playback error and hint banners (does not change Spotify transport). */
  dismissPlaybackError: () => void;
}

const Ctx = createContext<PlaybackApi | null>(null);

function pathToFileUrl(p: string): string {
  const norm = p.replaceAll('\\', '/');
  if (norm.startsWith('file:')) {
    return norm;
  }
  const prefix = norm.startsWith('/') ? 'file://' : 'file:///';
  return prefix + encodeURI(norm);
}

type SpotifyPlayerLike = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (...args: unknown[]) => void) => boolean;
  togglePlay: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayerLike;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

type SpotifyConnectDevice = {
  id: string;
  is_active: boolean;
  is_restricted?: boolean;
  name?: string;
  type?: string;
};

/**
 * Prefer playback on **this machine** when the Web Playback SDK is not used: the Spotify
 * **desktop** client (Linux/macOS/Windows) usually appears as `Computer` with a name that is
 * not the Chrome tab ("Web Player …"). That client should win over a phone. The browser web
 * player is scored lowest — on Linux it often fails DRM (Widevine) even when the API accepts play.
 */
function isSpotifyBrowserWebPlayer(d: SpotifyConnectDevice): boolean {
  const n = d.name ?? '';
  if (/web player/i.test(n)) {
    return true;
  }
  const t = d.type ?? '';
  if (
    t === 'Computer' &&
    /chrome|firefox|edge|safari|brave|chromium|opera|vivaldi/i.test(n) &&
    !/\bspotify\b.*\bfor\b\s+(linux|windows|mac)/i.test(n)
  ) {
    return true;
  }
  return false;
}

/** Higher score = preferred for laptop-first playback. */
function laptopFirstConnectScore(d: SpotifyConnectDevice): number {
  let score = 0;
  if (d.is_active) {
    score += 40;
  }
  const t = d.type ?? '';
  const name = d.name ?? '';
  if (t === 'Computer') {
    if (!isSpotifyBrowserWebPlayer(d)) {
      score += 500;
    } else {
      score += 50;
    }
  } else if (t === 'Speaker') {
    score += 350;
  } else if (t === 'TV') {
    score += 300;
  } else if (t === 'Smartphone') {
    score += 200;
  } else {
    score += 250;
  }
  if (/spotify/i.test(name) && !isSpotifyBrowserWebPlayer(d)) {
    score += 30;
  }
  return score;
}

function pickSpotifyConnectDevice(playable: SpotifyConnectDevice[]): SpotifyConnectDevice | null {
  if (playable.length === 0) {
    return null;
  }
  const sorted = [...playable].sort((a, b) => laptopFirstConnectScore(b) - laptopFirstConnectScore(a));
  return sorted[0] ?? null;
}

/** When any device is active, restrict picking to active devices so a stale inactive desktop entry does not win scoring over an active Web Player or phone. */
function poolConnectDevicesForPick(playable: SpotifyConnectDevice[]): SpotifyConnectDevice[] {
  const active = playable.filter((d) => d.is_active);
  return active.length > 0 ? active : playable;
}

/** After the user agrees to open open.spotify.com, prefer a browser Web Player tab over other active devices (e.g. a phone that still looks "active" but rejects transfer). */
function pickSpotifyConnectDeviceAfterWebPlayerPrompt(playable: SpotifyConnectDevice[]): SpotifyConnectDevice | null {
  if (playable.length === 0) {
    return null;
  }
  const pool = poolConnectDevicesForPick(playable);
  const web = pool.filter(isSpotifyBrowserWebPlayer);
  if (web.length > 0) {
    return pickSpotifyConnectDevice(web);
  }
  return pickSpotifyConnectDevice(pool);
}

function formatConnectDeviceLabel(dev: SpotifyConnectDevice): string {
  const name = dev.name?.trim() ?? '';
  const t = dev.type?.trim() ?? '';
  if (name !== '' && t !== '') {
    return `${name} (${t})`;
  }
  if (name !== '') {
    return name;
  }
  if (t !== '') {
    return t;
  }
  return 'device';
}

/** Human-readable label for the active Spotify transport (Connect vs in-app Web Playback SDK). */
function describeSpotifyMechanismFromPlayerApi(args: {
  device: { id?: string; name?: string; type?: string } | undefined;
  webDeviceId: string | null;
  webInitFailed: boolean;
}): string {
  const { device, webDeviceId, webInitFailed } = args;
  if (
    webDeviceId !== null &&
    webDeviceId !== '' &&
    device?.id === webDeviceId &&
    !webInitFailed
  ) {
    return 'Web Playback SDK (in DeepCut)';
  }
  const name = device?.name?.trim() ?? '';
  const t = device?.type?.trim() ?? '';
  if (name !== '' && t !== '') {
    return `Spotify Connect — ${name} (${t})`;
  }
  if (name !== '') {
    return `Spotify Connect — ${name}`;
  }
  return 'Spotify Connect';
}

/** Poll until GET /me/player reports this device as active (transfer applied). */
async function waitForSpotifyActiveDevice(
  token: string,
  deviceId: string,
  maxAttempts: number
): Promise<{ matched: boolean; lastHttpStatus: number }> {
  let lastHttpStatus = 0;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${token}` },
    });
    lastHttpStatus = r.status;
    if (r.status === 200) {
      const j = (await r.json()) as { device?: { id?: string } };
      if (j.device?.id === deviceId) {
        return { matched: true, lastHttpStatus };
      }
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  return { matched: false, lastHttpStatus };
}

const SPOTIFY_WEB_ADOPTION_POLL_MS = 600;
const SPOTIFY_WEB_ADOPTION_MAX_MS = 22_000;

/**
 * Confirms Spotify's player API sees the given track actively playing on the target Connect device
 * for several consecutive polls (avoids trusting brief optimistic snapshots).
 */
async function verifySpotifyConnectTrackPlayingOnDevice(
  token: string,
  wantUri: string,
  deviceId: string
): Promise<boolean> {
  const requiredStreak = 3;
  let streak = 0;
  const adoptionDeadline = Date.now() + SPOTIFY_WEB_ADOPTION_MAX_MS;
  while (Date.now() < adoptionDeadline) {
    const pr = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (pr.status === 200) {
      const pj = (await pr.json()) as {
        is_playing?: boolean;
        item?: { uri?: string };
        device?: { id?: string };
      };
      const snapshotOk =
        pj.is_playing === true &&
        pj.item?.uri === wantUri &&
        pj.device?.id === deviceId;
      if (snapshotOk) {
        streak++;
        if (streak >= requiredStreak) {
          return true;
        }
      } else {
        streak = 0;
      }
    } else {
      streak = 0;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, SPOTIFY_WEB_ADOPTION_POLL_MS);
    });
  }
  return false;
}

export function PlaybackProvider({ children }: { readonly children: ReactNode }): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(0.9);
  const mutedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spotifyWebPlayerRef = useRef<SpotifyPlayerLike | null>(null);
  const spotifyWebDeviceIdRef = useRef<string | null>(null);
  const spotifyWebInitFailedRef = useRef(false);

  const [state, setState] = useState<PlaybackState>({
    current: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    volume: 0.9,
    isMuted: false,
    queue: [],
    queueIndex: 0,
    context: { kind: 'none' },
    error: null,
    playbackHint: null,
  });

  const [primaryArtistDisplayName, setPrimaryArtistDisplayName] = useState<string | null>(null);
  const [nowPlayingTrackTitle, setNowPlayingTrackTitle] = useState<string | null>(null);
  const [nowPlayingAlbumName, setNowPlayingAlbumName] = useState<string | null>(null);
  const [spotifyPlaybackMode, setSpotifyPlaybackMode] =
    useState<SpotifyPlaybackMode>('web-api-remote');
  const spotifyPlaybackModeRef = useRef<SpotifyPlaybackMode>('web-api-remote');
  const [spotifyPlaybackMechanism, setSpotifyPlaybackMechanism] = useState<string | null>(null);
  const [spotifyRemoteDevicePromptOpen, setSpotifyRemoteDevicePromptOpen] = useState(false);
  const pendingRemotePlayRef = useRef<{
    ref: Extract<TrackRef, { source: 'spotify' }>;
    ctx: PbCtx;
    index: number;
    queue: TrackRef[];
  } | null>(null);
  const currentTrackRef = useRef<TrackRef | null>(null);
  const navigate = useNavigate();
  const lastSpotifySettingsNavMsRef = useRef(0);

  const navigateToSpotifyPlaybackSettings = useCallback((message: string) => {
    setState((p) => ({ ...p, error: message, playbackHint: null }));
    try {
      sessionStorage.setItem(SPOTIFY_PLAYBACK_SETTINGS_ERROR_STORAGE_KEY, message);
    } catch {
      /* ignore quota / private mode */
    }
    const t = Date.now();
    if (t - lastSpotifySettingsNavMsRef.current < 600) {
      return;
    }
    lastSpotifySettingsNavMsRef.current = t;
    void navigate('/settings?tab=spotify');
  }, [navigate]);

  const currentTrack = state.current;

  useEffect(() => {
    const cur = currentTrack;
    if (cur === null) {
      setPrimaryArtistDisplayName(null);
      setNowPlayingTrackTitle(null);
      setNowPlayingAlbumName(null);
      return undefined;
    }
    if (cur.source === 'local') {
      setPrimaryArtistDisplayName(null);
      setNowPlayingTrackTitle(null);
      setNowPlayingAlbumName(null);
      let cancelled = false;
      void window.deepcut.getLocalTracks().then((raw) => {
        if (cancelled) {
          return;
        }
        const tracks = raw as LocalTrack[];
        const t = tracks.find((x) => x.localTrackId === cur.localTrackId);
        if (t === undefined) {
          setPrimaryArtistDisplayName(null);
          setNowPlayingTrackTitle(basenameFromPath(cur.filePath));
          setNowPlayingAlbumName(null);
          return;
        }
        setNowPlayingTrackTitle(t.title);
        const a = t.artist.trim();
        setPrimaryArtistDisplayName(a !== '' ? a : null);
        const alb = t.album.trim();
        setNowPlayingAlbumName(alb !== '' ? alb : null);
      });
      return () => {
        cancelled = true;
      };
    }
    setPrimaryArtistDisplayName(null);
    setNowPlayingTrackTitle(null);
    setNowPlayingAlbumName(null);
    const ac = new AbortController();
    void (async () => {
      const token = await window.deepcut.getSpotifyAccessToken();
      if (!token || ac.signal.aborted) {
        setPrimaryArtistDisplayName(null);
        setNowPlayingTrackTitle('Spotify');
        setNowPlayingAlbumName(null);
        return;
      }
      try {
        const res = await fetch(
          `https://api.spotify.com/v1/tracks/${encodeURIComponent(cur.spotifyId)}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal }
        );
        if (!res.ok) {
          setPrimaryArtistDisplayName(null);
          setNowPlayingTrackTitle('Spotify');
          setNowPlayingAlbumName(null);
          return;
        }
        const j = (await res.json()) as {
          name?: string;
          artists?: { name?: string }[];
          album?: { name?: string };
        };
        const line = spotifyArtistLine(j);
        setNowPlayingTrackTitle(j.name ?? 'Spotify');
        setPrimaryArtistDisplayName(line !== '' ? line : null);
        const albumName = j.album?.name?.trim();
        setNowPlayingAlbumName(albumName !== undefined && albumName !== '' ? albumName : null);
      } catch {
        setPrimaryArtistDisplayName(null);
        setNowPlayingTrackTitle('Spotify');
        setNowPlayingAlbumName(null);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [currentTrack]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    spotifyPlaybackModeRef.current = spotifyPlaybackMode;
  }, [spotifyPlaybackMode]);

  useEffect(() => {
    if (currentTrack?.source !== 'spotify') {
      setSpotifyPlaybackMechanism(null);
    }
  }, [currentTrack]);

  useEffect(() => {
    const apply = (): void => {
      void window.deepcut.getSettings().then((settings) => {
        setSpotifyPlaybackMode(settings.spotifyPlaybackMode);
      });
    };
    apply();
    const onRefresh = (): void => {
      apply();
    };
    window.addEventListener(INTEGRATION_STATUS_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(INTEGRATION_STATUS_REFRESH_EVENT, onRefresh);
    };
  }, []);

  useEffect(() => {
    volumeRef.current = state.volume;
  }, [state.volume]);

  useEffect(() => {
    mutedRef.current = state.isMuted;
  }, [state.isMuted]);

  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (state.current?.source !== 'spotify' || !state.isPlaying) {
        return;
      }
      void window.deepcut.getSpotifyAccessToken().then((token) => {
        if (token === null) {
          return;
        }
        void fetch('https://api.spotify.com/v1/me/player/pause', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        });
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [spotifyPlaybackMode, state]);

  const stopSpotifyPoll = (): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const initSpotifyWebPlayback = useCallback(async (): Promise<boolean> => {
    if (spotifyWebPlayerRef.current !== null) {
      if (spotifyWebInitFailedRef.current) {
        spotifyWebPlayerRef.current.disconnect();
        spotifyWebPlayerRef.current = null;
        spotifyWebDeviceIdRef.current = null;
        spotifyWebInitFailedRef.current = false;
      } else {
        return spotifyWebDeviceIdRef.current !== null;
      }
    }
    const existingScript = document.querySelector('script[data-deepcut-spotify-web-sdk="1"]');
    if (existingScript === null) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.dataset.deepcutSpotifyWebSdk = '1';
      document.head.appendChild(script);
    }
    if (window.Spotify === undefined) {
      await new Promise<void>((resolve) => {
        window.onSpotifyWebPlaybackSDKReady = () => {
          resolve();
        };
      });
    }
    if (window.Spotify === undefined) {
      return false;
    }
    if (typeof navigator.requestMediaKeySystemAccess === 'function') {
      void navigator.requestMediaKeySystemAccess(
        'com.widevine.alpha',
        [{
          initDataTypes: ['cenc'],
          videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
          audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
        }]
      ).then(() => {}).catch(() => {});
    }
    const player = new window.Spotify.Player({
      name: 'DeepCut Web Playback',
      getOAuthToken: (callback) => {
        void window.deepcut.getSpotifyAccessToken().then((token) => {
          if (token !== null) {
            callback(token);
          }
        });
      },
      volume: volumeRef.current,
    });
    player.addListener('ready', (payload) => {
      const readyPayload = payload as { device_id?: string };
      spotifyWebDeviceIdRef.current = readyPayload.device_id ?? null;
    });
    player.addListener('not_ready', () => {
      spotifyWebDeviceIdRef.current = null;
    });
    player.addListener('player_state_changed', (payload) => {
      const statePayload = payload as {
        paused?: boolean;
        position?: number;
        duration?: number;
      } | null;
      if (statePayload === null) {
        return;
      }
      setState((prev) => ({
        ...prev,
        isPlaying: !statePayload.paused,
        positionMs: statePayload.position ?? prev.positionMs,
        durationMs: statePayload.duration ?? prev.durationMs,
      }));
    });
    player.addListener('authentication_error', () => {
      spotifyWebInitFailedRef.current = true;
      spotifyWebDeviceIdRef.current = null;
      player.disconnect();
      spotifyWebPlayerRef.current = null;
      navigateToSpotifyPlaybackSettings(
        'Spotify Web Playback authentication failed. In Settings → Spotify, disconnect and use Connect Spotify again, or switch to Web API (remote device) if you play on another Spotify app.'
      );
    });
    player.addListener('account_error', () => {
      spotifyWebInitFailedRef.current = true;
      spotifyWebDeviceIdRef.current = null;
      player.disconnect();
      spotifyWebPlayerRef.current = null;
      navigateToSpotifyPlaybackSettings(
        'Spotify Web Playback needs a Premium-capable account. In Settings → Spotify, confirm your subscription or choose Web API (remote device) to play on an existing Spotify Connect device.'
      );
    });
    player.addListener('initialization_error', (payload: unknown) => {
      spotifyWebInitFailedRef.current = true;
      spotifyWebDeviceIdRef.current = null;
      player.disconnect();
      spotifyWebPlayerRef.current = null;
      let sdkDetail = '';
      if (payload !== null && typeof payload === 'object' && 'message' in payload) {
        const m = (payload as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim() !== '') {
          const t = m.trim();
          sdkDetail = t.length > 220 ? `${t.slice(0, 220)}…` : t;
        }
      }
      const base =
        'Web Playback SDK failed to initialize (often DRM / Widevine in this environment).';
      const detailPart = sdkDetail !== '' ? ` (${sdkDetail})` : '';
      navigateToSpotifyPlaybackSettings(
        `${base}${detailPart} Settings → Spotify: try Web API (remote device) with the Spotify desktop or mobile app open, or retry after fixing system audio/DRM.`
      );
    });
    const connected = await player.connect();
    if (!connected) {
      return false;
    }
    if (spotifyWebInitFailedRef.current) {
      return false;
    }
    spotifyWebPlayerRef.current = player;
    return true;
  }, [navigateToSpotifyPlaybackSettings]);

  const startSpotifyPoll = useCallback((): void => {
    stopSpotifyPoll();
    pollRef.current = setInterval(() => {
      void (async () => {
        const token = await window.deepcut.getSpotifyAccessToken();
        if (!token) {
          return;
        }
        const res = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return;
        }
        /** Spotify returns 204 when no active playback — body is empty; do not call json(). */
        if (res.status === 204) {
          setState((prev) => {
            if (prev.current?.source !== 'spotify') {
              return prev;
            }
            if (spotifyPlaybackModeRef.current === 'web-playback-sdk') {
              return prev;
            }
            if (!prev.isPlaying) {
              return prev;
            }
            return { ...prev, isPlaying: false, playbackHint: null };
          });
          return;
        }
        const j = (await res.json()) as {
          is_playing: boolean;
          progress_ms: number;
          item: { duration_ms?: number; uri?: string } | null;
          device?: { id?: string; name?: string; type?: string };
        };
        setState((prev) => {
          let nextIsPlaying = j.is_playing;
          let nextPlaybackHint = prev.playbackHint;
          if (
            spotifyPlaybackModeRef.current === 'web-api-remote' &&
            prev.current?.source === 'spotify'
          ) {
            if (j.is_playing) {
              const itemUri = j.item?.uri;
              const matches =
                itemUri !== undefined && itemUri !== '' && itemUri === prev.current.spotifyUri;
              nextIsPlaying = matches;
              if (matches) {
                nextPlaybackHint = null;
              } else {
                nextPlaybackHint =
                  prev.playbackHint ??
                  'Spotify is playing a different track than the one shown in DeepCut, or the Web Player has not started this track yet. Press play once in the Spotify browser tab if nothing is playing there.';
              }
            } else {
              nextIsPlaying = false;
            }
          }
          return {
            ...prev,
            isPlaying: nextIsPlaying,
            playbackHint: nextPlaybackHint,
            positionMs: typeof j.progress_ms === 'number' ? j.progress_ms : prev.positionMs,
            durationMs: j.item?.duration_ms ?? prev.durationMs,
          };
        });
        if (currentTrackRef.current?.source === 'spotify') {
          setSpotifyPlaybackMechanism(
            describeSpotifyMechanismFromPlayerApi({
              device: j.device,
              webDeviceId: spotifyWebDeviceIdRef.current,
              webInitFailed: spotifyWebInitFailedRef.current,
            })
          );
        }
      })();
    }, 1000);
  }, []);

  const persistSession = useCallback(async (s: PlaybackSession): Promise<void> => {
    try {
      await window.deepcut.savePlaybackSession(s);
    } catch {
      /* ignore */
    }
  }, []);

  const playLocal = useCallback(
    async (ref: Extract<TrackRef, { source: 'local' }>, ctx: PbCtx, index: number, queue: TrackRef[]): Promise<void> => {
      stopSpotifyPoll();
      setSpotifyPlaybackMechanism(null);
      const a = audioRef.current;
      if (!a) {
        return;
      }
      a.src = pathToFileUrl(ref.filePath);
      a.volume = volumeRef.current;
      a.muted = mutedRef.current;
      await a.play().catch((e: unknown) => {
        setState((p) => ({ ...p, error: String(e) }));
      });
      setState((prev) => ({
        ...prev,
        current: ref,
        context: ctx,
        queue,
        queueIndex: index,
        isPlaying: true,
        error: null,
        playbackHint: null,
        durationMs: Math.floor(a.duration * 1000) || prev.durationMs,
        positionMs: 0,
      }));
      await persistSession({
        currentTrack: ref,
        positionMs: 0,
        context: ctx,
        updatedAt: new Date(),
      });
    },
    [persistSession]
  );

  const playViaSpotifyConnectImpl = useCallback(
    async (
      token: string,
      ref: Extract<TrackRef, { source: 'spotify' }>,
      explicitDevice: SpotifyConnectDevice | null,
      avoidDeviceId: string | null = null
    ): Promise<{
      response: Response | null;
      targetedDeviceLabel: string | null;
      targetedDeviceId: string | null;
      targetedWasWebPlayer: boolean;
      /** `true` when the Web API returned no playable devices at all. */
      noDevices: boolean;
    }> => {
      let dev: SpotifyConnectDevice | null = explicitDevice;
      if (dev === null) {
        const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!devicesRes.ok) {
          return {
            response: null,
            targetedDeviceLabel: null,
            targetedDeviceId: null,
            targetedWasWebPlayer: false,
            noDevices: false,
          };
        }
        const devicesJson = (await devicesRes.json()) as { devices: SpotifyConnectDevice[] };
        const list = devicesJson.devices;
        if (list.length === 0) {
          return {
            response: null,
            targetedDeviceLabel: null,
            targetedDeviceId: null,
            targetedWasWebPlayer: false,
            noDevices: true,
          };
        }
        const playableAll = list.filter((d) => d.id !== '' && !(d.is_restricted ?? false));
        if (playableAll.length === 0) {
          return {
            response: null,
            targetedDeviceLabel: null,
            targetedDeviceId: null,
            targetedWasWebPlayer: false,
            noDevices: true,
          };
        }
        let playable = playableAll;
        if (avoidDeviceId !== null && avoidDeviceId !== '') {
          const without = playableAll.filter((d) => d.id !== avoidDeviceId);
          if (without.length === 0) {
            return {
              response: null,
              targetedDeviceLabel: null,
              targetedDeviceId: null,
              targetedWasWebPlayer: false,
              noDevices: true,
            };
          }
          playable = without;
        }
        const pool = poolConnectDevicesForPick(playable);
        dev = pickSpotifyConnectDevice(pool);
        if (dev === null) {
          return {
            response: null,
            targetedDeviceLabel: null,
            targetedDeviceId: null,
            targetedWasWebPlayer: false,
            noDevices: true,
          };
        }
      }
      const transferRes = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_ids: [dev.id], play: false }),
      });
      let playResponse: Response | null = null;
      if (transferRes.ok || transferRes.status === 204) {
        await waitForSpotifyActiveDevice(token, dev.id, 25);
        playResponse = await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(dev.id)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ uris: [ref.spotifyUri] }),
          }
        );
      }
      const outcomeResponse = playResponse ?? transferRes;
      return {
        response: outcomeResponse,
        targetedDeviceLabel: formatConnectDeviceLabel(dev),
        targetedDeviceId: dev.id,
        targetedWasWebPlayer: isSpotifyBrowserWebPlayer(dev),
        noDevices: false,
      };
    },
    []
  );

  const finalizeSpotifyPlay = useCallback(
    async (
      playRes: Response,
      ref: Extract<TrackRef, { source: 'spotify' }>,
      ctx: PbCtx,
      index: number,
      queue: TrackRef[]
    ): Promise<void> => {
      if (!playRes.ok && playRes.status !== 204) {
        const status = playRes.status;
        let detail = `Spotify rejected playback (HTTP ${String(status)}).`;
        try {
          const text = await playRes.text();
          if (text.trim() !== '') {
            const j = JSON.parse(text) as { error?: { message?: string } };
            const em = j.error?.message;
            if (em !== undefined && em !== '') {
              detail = `${detail} ${em}`;
            }
          }
        } catch {
          /* keep detail */
        }
        navigateToSpotifyPlaybackSettings(
          `${detail} Check Settings → Spotify for playback mode, Premium, and an active session.`
        );
        return;
      }
      setState((prev) => ({
        ...prev,
        current: ref,
        context: ctx,
        queue,
        queueIndex: index,
        isPlaying: true,
        error: null,
        playbackHint: null,
        positionMs: 0,
        durationMs: 180_000,
      }));
      startSpotifyPoll();
      await persistSession({
        currentTrack: ref,
        positionMs: 0,
        context: ctx,
        updatedAt: new Date(),
      });
    },
    [navigateToSpotifyPlaybackSettings, persistSession, startSpotifyPoll]
  );

  const playSpotify = useCallback(
    async (
      ref: Extract<TrackRef, { source: 'spotify' }>,
      ctx: PbCtx,
      index: number,
      queue: TrackRef[]
    ): Promise<void> => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute('src');
      }
      const token = await window.deepcut.getSpotifyAccessToken();
      if (!token) {
        navigateToSpotifyPlaybackSettings(
          'Spotify is not connected. Open Settings → Spotify and use Connect Spotify.'
        );
        return;
      }
      setSpotifyPlaybackMechanism(null);
      setState((p) => ({ ...p, error: null, playbackHint: null }));
      let playRes: Response;
      if (spotifyPlaybackMode === 'web-playback-sdk') {
        const ready = await initSpotifyWebPlayback();
        for (let attempt = 0; attempt < 50 && !spotifyWebInitFailedRef.current; attempt++) {
          const id = spotifyWebDeviceIdRef.current;
          if (id !== null && id !== '') {
            break;
          }
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 100);
          });
        }
        const webDeviceId = spotifyWebDeviceIdRef.current;
        if (
          !ready ||
          spotifyWebInitFailedRef.current ||
          webDeviceId === null ||
          webDeviceId === ''
        ) {
          navigateToSpotifyPlaybackSettings(
            spotifyWebInitFailedRef.current
              ? 'Web Playback SDK reported an error. Open Settings → Spotify for details, then retry Connect Spotify or switch to Web API (remote device).'
              : 'Web Playback did not become ready (no in-app player device). Under Settings → Spotify: confirm Premium, retry Connect Spotify, or switch to Web API (remote device) if you play on another Spotify app.'
          );
          return;
        }
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ device_ids: [webDeviceId], play: false }),
        });
        playRes = await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(webDeviceId)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ uris: [ref.spotifyUri] }),
          }
        );
        setSpotifyPlaybackMechanism('Web Playback SDK (in DeepCut)');
        await finalizeSpotifyPlay(playRes, ref, ctx, index, queue);
        return;
      }
      let remoteRes = await playViaSpotifyConnectImpl(token, ref, null);
      if (remoteRes.response === null) {
        if (remoteRes.noDevices) {
          pendingRemotePlayRef.current = { ref, ctx, index, queue };
          setState((p) => ({ ...p, error: null, playbackHint: null }));
          setSpotifyRemoteDevicePromptOpen(true);
          return;
        }
        navigateToSpotifyPlaybackSettings(
          'No Spotify Connect device is available for Web API (remote device) mode. Open Spotify on a phone, desktop, or speaker, then try again—or switch to Web Playback SDK in Settings → Spotify.'
        );
        return;
      }
      playRes = remoteRes.response;
      let mechanismLabel = remoteRes.targetedDeviceLabel;
      const retryableRemote =
        !playRes.ok &&
        playRes.status !== 204 &&
        (playRes.status === 502 ||
          playRes.status === 503 ||
          playRes.status === 504 ||
          playRes.status === 404 ||
          playRes.status === 500);
      if (retryableRemote) {
        const failedId = remoteRes.targetedDeviceId;
        remoteRes = await playViaSpotifyConnectImpl(token, ref, null, failedId);
        if (remoteRes.response !== null) {
          playRes = remoteRes.response;
          mechanismLabel = remoteRes.targetedDeviceLabel;
        } else if (remoteRes.noDevices) {
          pendingRemotePlayRef.current = { ref, ctx, index, queue };
          setState((p) => ({ ...p, error: null, playbackHint: null }));
          setSpotifyRemoteDevicePromptOpen(true);
          return;
        }
      }
      if ((playRes.ok || playRes.status === 204) && remoteRes.targetedDeviceId !== null) {
        const adopted = await verifySpotifyConnectTrackPlayingOnDevice(
          token,
          ref.spotifyUri,
          remoteRes.targetedDeviceId
        );
        if (!adopted) {
          setSpotifyPlaybackMechanism(`Spotify Connect — ${mechanismLabel ?? 'device'}`);
          startSpotifyPoll();
          await persistSession({
            currentTrack: ref,
            positionMs: 0,
            context: ctx,
            updatedAt: new Date(),
          });
          setState((p) => ({
            ...p,
            current: ref,
            context: ctx,
            queue,
            queueIndex: index,
            isPlaying: false,
            durationMs: 180_000,
            positionMs: 0,
            playbackHint:
              'Spotify did not confirm this track is playing on the chosen device (often the Web Player needs one play in the browser first). Try that, then press Play in DeepCut again.',
          }));
          return;
        }
      }
      setSpotifyPlaybackMechanism(`Spotify Connect — ${mechanismLabel ?? 'device'}`);
      await finalizeSpotifyPlay(playRes, ref, ctx, index, queue);
    },
    [
      finalizeSpotifyPlay,
      initSpotifyWebPlayback,
      navigateToSpotifyPlaybackSettings,
      persistSession,
      playViaSpotifyConnectImpl,
      spotifyPlaybackMode,
      startSpotifyPoll,
    ]
  );

  const confirmOpenSpotifyWebPlayer = useCallback(async (): Promise<void> => {
    const pending = pendingRemotePlayRef.current;
    setSpotifyRemoteDevicePromptOpen(false);
    if (pending === null) {
      return;
    }
    const webLaunchUrl = `https://open.spotify.com/track/${encodeURIComponent(pending.ref.spotifyId)}`;
    try {
      await window.deepcut.openExternalUrl(webLaunchUrl);
    } catch {
      /* continue; user may have their own tab open already */
    }
    const token = await window.deepcut.getSpotifyAccessToken();
    if (!token) {
      pendingRemotePlayRef.current = null;
      navigateToSpotifyPlaybackSettings(
        'Spotify is not connected. Open Settings → Spotify and use Connect Spotify, then retry.'
      );
      return;
    }
    const pollUntil = Date.now() + 45_000;
    let detected: SpotifyConnectDevice | null = null;
    while (Date.now() < pollUntil) {
      try {
        const r = await fetch('https://api.spotify.com/v1/me/player/devices', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const j = (await r.json()) as { devices: SpotifyConnectDevice[] };
          const playable = j.devices.filter(
            (d) => d.id !== '' && !(d.is_restricted ?? false)
          );
          if (playable.length > 0) {
            const candidate = pickSpotifyConnectDeviceAfterWebPlayerPrompt(playable);
            if (candidate !== null && isSpotifyBrowserWebPlayer(candidate)) {
              detected = candidate;
              break;
            }
          }
        }
      } catch {
        /* transient network; keep polling */
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1500);
      });
    }
    if (detected === null) {
      pendingRemotePlayRef.current = null;
      navigateToSpotifyPlaybackSettings(
        'Spotify Web Player did not appear in Connect within 45s. Keep the browser tab on open.spotify.com, sign in if needed, then try Play again in DeepCut—or switch to Web Playback SDK in Settings.'
      );
      return;
    }
    let connectPlay = await playViaSpotifyConnectImpl(token, pending.ref, detected);
    if (
      connectPlay.response !== null &&
      !connectPlay.response.ok &&
      connectPlay.response.status !== 204 &&
      (connectPlay.response.status === 502 ||
        connectPlay.response.status === 503 ||
        connectPlay.response.status === 504 ||
        connectPlay.response.status === 404 ||
        connectPlay.response.status === 500)
    ) {
      const failedId = connectPlay.targetedDeviceId;
      connectPlay = await playViaSpotifyConnectImpl(token, pending.ref, null, failedId);
    }
    pendingRemotePlayRef.current = null;
    if (connectPlay.response === null) {
      if (connectPlay.noDevices) {
        setState((p) => ({
          ...p,
          playbackHint:
            'Spotify in the browser is not ready yet, or no other device is available. Leave open.spotify.com signed in for a few seconds, then try Play again in DeepCut.',
        }));
        return;
      }
      navigateToSpotifyPlaybackSettings(
        'Spotify rejected playback on the detected device. Try again or pick a different Spotify client in Settings → Spotify.'
      );
      return;
    }
    if (!connectPlay.response.ok && connectPlay.response.status !== 204) {
      setState((p) => ({
        ...p,
        playbackHint:
          'We could not hand off playback to Spotify yet. If your browser opened Spotify, start playback there once, then press Play again in DeepCut.',
      }));
      return;
    }

    const wantUri = pending.ref.spotifyUri;
    const webPlaybackAdopted = await verifySpotifyConnectTrackPlayingOnDevice(
      token,
      wantUri,
      detected.id
    );
    if (!webPlaybackAdopted) {
      setSpotifyPlaybackMechanism(
        `Spotify Connect — ${connectPlay.targetedDeviceLabel ?? 'device'}`
      );
      startSpotifyPoll();
      await persistSession({
        currentTrack: pending.ref,
        positionMs: 0,
        context: pending.ctx,
        updatedAt: new Date(),
      });
      setState((p) => ({
        ...p,
        current: pending.ref,
        context: pending.ctx,
        queue: pending.queue,
        queueIndex: pending.index,
        isPlaying: false,
        playbackHint:
          'The Web Player tab is still finishing setup (DRM or autoplay). Press play once in the Spotify browser tab, then press Play again in DeepCut—no need to pause here first.',
      }));
      return;
    }

    setSpotifyPlaybackMechanism(
      `Spotify Connect — ${connectPlay.targetedDeviceLabel ?? 'device'}`
    );
    await finalizeSpotifyPlay(
      connectPlay.response,
      pending.ref,
      pending.ctx,
      pending.index,
      pending.queue
    );
  }, [
    finalizeSpotifyPlay,
    navigateToSpotifyPlaybackSettings,
    persistSession,
    playViaSpotifyConnectImpl,
    startSpotifyPoll,
  ]);

  const dismissSpotifyRemoteDevicePrompt = useCallback((): void => {
    pendingRemotePlayRef.current = null;
    setSpotifyRemoteDevicePromptOpen(false);
  }, []);

  const dismissPlaybackError = useCallback((): void => {
    setState((p) => ({ ...p, error: null, playbackHint: null }));
  }, []);

  const playRefInternal = useCallback(
    async (ref: TrackRef, ctx: PbCtx, index: number, queue: TrackRef[]): Promise<void> => {
      if (ref.source === 'local') {
        await playLocal(ref, ctx, index, queue);
      } else {
        await playSpotify(ref, ctx, index, queue);
      }
    },
    [playLocal, playSpotify]
  );

  useEffect(() => {
    const a = new Audio();
    audioRef.current = a;
    a.addEventListener('timeupdate', () => {
      setState((prev) => {
        if (prev.current?.source !== 'local') {
          return prev;
        }
        return { ...prev, positionMs: Math.floor(a.currentTime * 1000) };
      });
    });
    a.addEventListener('ended', () => {
      setState((prev) => {
        const nextIdx = prev.queueIndex + 1;
        if (nextIdx < prev.queue.length) {
          const nextTr = prev.queue[nextIdx];
          void playRefInternal(nextTr, prev.context, nextIdx, prev.queue);
          return prev;
        }
        return { ...prev, isPlaying: false, current: null };
      });
    });
    return () => {
      stopSpotifyPoll();
      spotifyWebPlayerRef.current?.disconnect();
      spotifyWebPlayerRef.current = null;
      spotifyWebDeviceIdRef.current = null;
      a.pause();
      audioRef.current = null;
    };
  }, [playRefInternal]);

  useEffect(() => {
    const id = setInterval(() => {
      void (async () => {
        const cur = state.current;
        if (cur?.source === 'local' && audioRef.current) {
          await persistSession({
            currentTrack: cur,
            positionMs: Math.floor(audioRef.current.currentTime * 1000),
            context: state.context,
            updatedAt: new Date(),
          });
        }
      })();
    }, 5000);
    return () => {
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist local position only
  }, [persistSession, state.current, state.context]);

  const playRef = useCallback(
    async (ref: TrackRef, ctx: PbCtx = { kind: 'none' }): Promise<void> => {
      await playRefInternal(ref, ctx, 0, [ref]);
    },
    [playRefInternal]
  );

  const setQueue = useCallback(
    async (tracks: TrackRef[], startIndex: number, ctx: PbCtx): Promise<void> => {
      if (tracks.length === 0) {
        return;
      }
      const idx = Math.min(Math.max(0, startIndex), tracks.length - 1);
      const tr = tracks.at(idx);
      if (tr === undefined) {
        return;
      }
      await playRefInternal(tr, ctx, idx, tracks);
    },
    [playRefInternal]
  );

  const enqueueRef = useCallback(async (ref: TrackRef): Promise<void> => {
    setState((prev) => {
      let baseQueue = prev.queue;
      if (baseQueue.length === 0) {
        baseQueue = prev.current !== null ? [prev.current] : [];
      }
      return {
        ...prev,
        queue: [...baseQueue, ref],
        queueIndex: prev.queue.length === 0 && prev.current !== null ? 0 : prev.queueIndex,
      };
    });
    await Promise.resolve();
  }, []);

  const removeQueueEntryAt = useCallback(async (index: number): Promise<void> => {
    setState((prev) => {
      if (index < 0 || index >= prev.queue.length) {
        return prev;
      }
      const nextQueue = prev.queue.filter((_, idx) => idx !== index);
      let nextQueueIndex = prev.queueIndex;
      if (index < prev.queueIndex) {
        nextQueueIndex = Math.max(0, prev.queueIndex - 1);
      } else if (index === prev.queueIndex) {
        nextQueueIndex = Math.min(prev.queueIndex, Math.max(0, nextQueue.length - 1));
      }
      return {
        ...prev,
        queue: nextQueue,
        queueIndex: nextQueueIndex,
      };
    });
    await Promise.resolve();
  }, []);

  const clearQueue = useCallback(async (): Promise<void> => {
    setState((prev) => ({
      ...prev,
      queue: prev.current === null ? [] : [prev.current],
      queueIndex: 0,
    }));
    await Promise.resolve();
  }, []);

  const togglePlay = useCallback(async (): Promise<void> => {
    const cur = state.current;
    if (!cur) {
      return;
    }
    if (cur.source === 'local') {
      const a = audioRef.current;
      if (!a) {
        return;
      }
      if (state.isPlaying) {
        a.pause();
        setState((p) => ({ ...p, isPlaying: false }));
      } else {
        await a.play();
        setState((p) => ({ ...p, isPlaying: true }));
      }
      return;
    }
    const token = await window.deepcut.getSpotifyAccessToken();
    if (!token) {
      return;
    }
    if (
      spotifyPlaybackMode === 'web-playback-sdk' &&
      spotifyWebPlayerRef.current !== null &&
      spotifyWebDeviceIdRef.current !== null &&
      !spotifyWebInitFailedRef.current
    ) {
      await spotifyWebPlayerRef.current.togglePlay();
      return;
    }
    const endpoint = state.isPlaying ? 'pause' : 'play';
    const transportRes = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (transportRes.ok || transportRes.status === 204) {
      setState((p) => ({ ...p, isPlaying: !p.isPlaying }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use snapshot of playing state
  }, [spotifyPlaybackMode, state.current, state.isPlaying]);

  const seek = useCallback(async (ms: number): Promise<void> => {
    const cur = state.current;
    if (cur?.source === 'local') {
      const a = audioRef.current;
      if (a) {
        a.currentTime = ms / 1000;
        setState((p) => ({ ...p, positionMs: ms }));
      }
      return;
    }
    const token = await window.deepcut.getSpotifyAccessToken();
    if (!token) {
      return;
    }
    if (spotifyPlaybackMode === 'web-playback-sdk' && spotifyWebPlayerRef.current !== null) {
      await spotifyWebPlayerRef.current.seek(ms);
      setState((p) => ({ ...p, positionMs: ms }));
      return;
    }
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${String(ms)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    setState((p) => ({ ...p, positionMs: ms }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyPlaybackMode, state.current]);

  const next = useCallback(async (): Promise<void> => {
    const { queue, queueIndex } = state;
    if (queueIndex + 1 < queue.length) {
      const tr = queue[queueIndex + 1];
      await playRefInternal(tr, state.context, queueIndex + 1, queue);
    }
  }, [playRefInternal, state]);

  const previous = useCallback(async (): Promise<void> => {
    const { queue, queueIndex } = state;
    if (queueIndex > 0) {
      const tr = queue[queueIndex - 1];
      await playRefInternal(tr, state.context, queueIndex - 1, queue);
    }
  }, [playRefInternal, state]);

  const setVolume = useCallback(async (v: number): Promise<void> => {
    if (!Number.isFinite(v)) {
      return;
    }
    const vol = Math.min(1, Math.max(0, v));
    setState((p) => ({ ...p, volume: vol, isMuted: false }));

    const cur = state.current;
    if (cur?.source === 'local' && audioRef.current) {
      const a = audioRef.current;
      a.volume = vol;
      a.muted = false;
    }

    if (cur?.source !== 'spotify') {
      return;
    }
    if (spotifyPlaybackMode === 'web-playback-sdk' && spotifyWebPlayerRef.current !== null) {
      await spotifyWebPlayerRef.current.setVolume(vol);
      return;
    }

    const token = await window.deepcut.getSpotifyAccessToken();
    if (!token) {
      return;
    }
    try {
      await fetch(
        `https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(vol * 100)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    } catch {
      /* ignore network errors */
    }
  }, [spotifyPlaybackMode, state]);

  const toggleMute = useCallback(async (): Promise<void> => {
    const cur = state.current;
    const nextMuted = !state.isMuted;
    setState((p) => ({ ...p, isMuted: nextMuted }));

    if (cur?.source === 'local' && audioRef.current) {
      audioRef.current.muted = nextMuted;
      return;
    }

    if (cur?.source !== 'spotify') {
      return;
    }
    if (spotifyPlaybackMode === 'web-playback-sdk' && spotifyWebPlayerRef.current !== null) {
      await spotifyWebPlayerRef.current.setVolume(nextMuted ? 0 : volumeRef.current);
      return;
    }

    const token = await window.deepcut.getSpotifyAccessToken();
    if (!token) {
      return;
    }
    const pct = nextMuted ? 0 : Math.round(volumeRef.current * 100);
    try {
      await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${pct}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore network errors */
    }
  }, [spotifyPlaybackMode, state]);

  useEffect(() => {
    void (async () => {
      const saved = await window.deepcut.getPlaybackSession();
      if (!saved?.currentTrack) {
        return;
      }
      setState((p) => ({
        ...p,
        current: saved.currentTrack,
        positionMs: saved.positionMs,
        context: saved.context,
      }));
      if (saved.currentTrack.source === 'local') {
        const a = audioRef.current;
        if (a) {
          a.src = pathToFileUrl(saved.currentTrack.filePath);
          a.currentTime = saved.positionMs / 1000;
          a.volume = volumeRef.current;
          a.muted = mutedRef.current;
        }
      } else {
        startSpotifyPoll();
      }
    })();
  }, [startSpotifyPoll]);

  const api: PlaybackApi = {
    ...state,
    nowPlayingTrackTitle,
    nowPlayingAlbumName,
    primaryArtistDisplayName,
    spotifyPlaybackMechanism,
    spotifyRemoteDevicePromptOpen,
    confirmOpenSpotifyWebPlayer,
    dismissSpotifyRemoteDevicePrompt,
    dismissPlaybackError,
    playRef,
    togglePlay,
    seek,
    next,
    previous,
    setVolume,
    toggleMute,
    setQueue,
    enqueueRef,
    removeQueueEntryAt,
    clearQueue,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePlayback(): PlaybackApi {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('usePlayback requires PlaybackProvider');
  }
  return v;
}
