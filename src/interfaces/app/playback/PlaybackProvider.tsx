import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PlaybackContext as PbCtx, PlaybackSession } from '../../../domain/schemas/playback-session.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';

interface PlaybackState {
  current: TrackRef | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  queue: TrackRef[];
  queueIndex: number;
  context: PbCtx;
  error: string | null;
}

interface PlaybackApi extends PlaybackState {
  playRef: (ref: TrackRef, ctx?: PbCtx) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  setQueue: (tracks: TrackRef[], startIndex: number, ctx: PbCtx) => Promise<void>;
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

export function PlaybackProvider({ children }: { readonly children: ReactNode }): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<PlaybackState>({
    current: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    volume: 0.9,
    queue: [],
    queueIndex: 0,
    context: { kind: 'none' },
    error: null,
  });

  const stopSpotifyPoll = (): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

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
        const j = (await res.json()) as {
          is_playing: boolean;
          progress_ms: number;
          item: { duration_ms: number } | null;
        };
        setState((prev) => ({
          ...prev,
          isPlaying: j.is_playing,
          positionMs: typeof j.progress_ms === 'number' ? j.progress_ms : prev.positionMs,
          durationMs: j.item?.duration_ms ?? prev.durationMs,
        }));
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
      const a = audioRef.current;
      if (!a) {
        return;
      }
      a.src = pathToFileUrl(ref.filePath);
      a.volume = state.volume;
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
    [persistSession, state.volume]
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
        setState((p) => ({ ...p, error: 'Spotify not connected.' }));
        return;
      }
      const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const devicesJson = (await devicesRes.json()) as { devices: { id: string; is_active: boolean }[] };
      const list = devicesJson.devices;
      if (list.length === 0) {
        setState((p) => ({
          ...p,
          error: 'No Spotify device. Open Spotify on this machine or another device.',
        }));
        return;
      }
      const dev = list.find((d) => d.is_active) ?? list[0];
      if (dev.id === '') {
        setState((p) => ({
          ...p,
          error: 'No Spotify device. Open Spotify on this machine or another device.',
        }));
        return;
      }
      const playRes = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${dev.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [ref.spotifyUri] }),
        }
      );
      if (!playRes.ok && playRes.status !== 204) {
        setState((p) => ({ ...p, error: `Spotify play failed (${playRes.status})` }));
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
    [persistSession, startSpotifyPoll]
  );

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
    const endpoint = state.isPlaying ? 'pause' : 'play';
    await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    setState((p) => ({ ...p, isPlaying: !p.isPlaying }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use snapshot of playing state
  }, [state.current, state.isPlaying]);

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
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${String(ms)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    setState((p) => ({ ...p, positionMs: ms }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current]);

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
    const vol = Math.min(1, Math.max(0, v));
    setState((p) => ({ ...p, volume: vol }));
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    const token = await window.deepcut.getSpotifyAccessToken();
    if (token) {
      await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(vol * 100)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }, []);

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
        }
      } else {
        startSpotifyPoll();
      }
    })();
  }, [startSpotifyPoll]);

  const api: PlaybackApi = {
    ...state,
    playRef,
    togglePlay,
    seek,
    next,
    previous,
    setVolume,
    setQueue,
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
