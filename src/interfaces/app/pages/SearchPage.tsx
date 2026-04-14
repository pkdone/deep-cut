import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import type { LocalTrack } from '../../../domain/schemas/local-track.js';
import type {
  SpotifyAlbum,
  SpotifyArtist,
  UnifiedSearchResult,
  UnifiedSearchRow,
  UnifiedSearchSpotifyPaging,
} from '../../../application/unified-search.js';
import {
  filterLocalTracksByQuery,
  getSearchCap,
  getSearchDebounceMs,
  mergeAdditionalSpotifyTracks,
} from '../../../application/unified-search.js';
import type { AppSettings } from '../../../domain/schemas/app-settings.js';
import type { Playlist } from '../../../domain/schemas/playlist.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';
import { uniqueNewPlaylistName } from '../../../shared/playlist-naming.js';
import { localAlbumDisplayTitle } from '../../../shared/local-unknown-meta.js';
import { NewPlaylistModal } from '../components/NewPlaylistModal.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

type PlaylistModalState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'addTrack'; readonly track: TrackRef };

type SectionKey = 'artists' | 'albums' | 'tracks';

type ExtraSpotify = {
  readonly artists: SpotifyArtist[];
  readonly albums: SpotifyAlbum[];
  readonly tracks: UnifiedSearchRow[];
};

type SearchSessionSnapshot = {
  readonly q: string;
  readonly searchEntity: SectionKey;
  readonly filter: 'all' | 'spotify' | 'local';
  readonly sectionPage: Record<SectionKey, number>;
};

const EMPTY_EXTRA: ExtraSpotify = {
  artists: [],
  albums: [],
  tracks: [],
};

/** Select value when there are no playlists yet — creates "New Playlist #n" on add. */
const ADD_TO_NEW_PLAYLIST = '__new__';
const SEARCH_SESSION_KEY = 'deepcut.search.session.v1';

function syncAddToPlaylistSelection(playlists: Playlist[], settings: AppSettings): string {
  if (playlists.length === 0) {
    return ADD_TO_NEW_PLAYLIST;
  }
  const last = settings.lastAddToPlaylistId;
  if (last !== undefined && playlists.some((p) => p.playlistId === last)) {
    return last;
  }
  const first = playlists[0];
  return first.playlistId;
}

function canShowSectionDown(
  page: number,
  totalRows: number,
  pageSize: number,
  nextUrl: string | null | undefined
): boolean {
  if ((page + 1) * pageSize < totalRows) {
    return true;
  }
  return totalRows > 0 && page * pageSize + pageSize >= totalRows && Boolean(nextUrl);
}

function SearchSectionTop({ title }: { readonly title: string }): ReactElement {
  return (
    <div className="search-section-head">
      <h2>{title}</h2>
    </div>
  );
}

function SearchSectionListArea(props: {
  readonly title: string;
  readonly page: number;
  readonly totalRows: number;
  readonly pageSize: number;
  readonly nextUrl: string | null | undefined;
  readonly onUp: () => void;
  readonly onDown: () => void | Promise<void>;
  readonly children: ReactNode;
  /** Left avoids overlapping row action buttons (e.g. Tracks). */
  readonly floatNav?: 'left' | 'right';
}): ReactElement {
  const { title, page, totalRows, pageSize, nextUrl, onUp, onDown, children, floatNav = 'right' } = props;
  const canUp = page > 0;
  const canDown = canShowSectionDown(page, totalRows, pageSize, nextUrl);
  const navClass = floatNav === 'left' ? 'search-section-list-area--nav-left' : '';
  return (
    <div className={['search-section-list-area', navClass].filter(Boolean).join(' ')}>
      <div className="search-section-list-content">{children}</div>
      {canUp ? (
        <button
          type="button"
          className="search-float-btn search-float-btn--up"
          aria-label={`Show previous ${title}`}
          onClick={onUp}
        >
          ▲
        </button>
      ) : null}
      {canDown ? (
        <button
          type="button"
          className="search-float-btn search-float-btn--down"
          onClick={() => void onDown()}
          aria-label={`Show next ${title}`}
        >
          ▼
        </button>
      ) : null}
    </div>
  );
}

export function SearchPage(): ReactElement {
  const pb = usePlayback();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEntity = searchParams.get('entity');
  const initialFilter = searchParams.get('filter');
  const initialQuery = searchParams.get('q');
  const [q, setQ] = useState(() => {
    const raw = sessionStorage.getItem(SEARCH_SESSION_KEY);
    if (raw === null) {
      return '';
    }
    try {
      const parsed = JSON.parse(raw) as SearchSessionSnapshot;
      return parsed.q;
    } catch {
      return '';
    }
  });
  const [searchEntity, setSearchEntity] = useState<SectionKey>(
    initialEntity === 'artists' || initialEntity === 'albums' || initialEntity === 'tracks'
      ? initialEntity
      : 'artists'
  );
  const [filter, setFilter] = useState<'all' | 'spotify' | 'local'>(
    initialFilter === 'all' || initialFilter === 'spotify' || initialFilter === 'local'
      ? initialFilter
      : 'all'
  );
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addToPl, setAddToPl] = useState<string>(ADD_TO_NEW_PLAYLIST);
  const [playlistModal, setPlaylistModal] = useState<PlaylistModalState>({ kind: 'closed' });
  const [modalPlaylistName, setModalPlaylistName] = useState('');
  const [result, setResult] = useState<UnifiedSearchResult | null>(null);
  const [sectionPage, setSectionPage] = useState<Record<SectionKey, number>>({
    artists: (() => {
      const raw = sessionStorage.getItem(SEARCH_SESSION_KEY);
      if (raw === null) {
        return 0;
      }
      try {
        const parsed = JSON.parse(raw) as SearchSessionSnapshot;
        return parsed.sectionPage.artists;
      } catch {
        return 0;
      }
    })(),
    albums: (() => {
      const raw = sessionStorage.getItem(SEARCH_SESSION_KEY);
      if (raw === null) {
        return 0;
      }
      try {
        const parsed = JSON.parse(raw) as SearchSessionSnapshot;
        return parsed.sectionPage.albums;
      } catch {
        return 0;
      }
    })(),
    tracks: (() => {
      const raw = sessionStorage.getItem(SEARCH_SESSION_KEY);
      if (raw === null) {
        return 0;
      }
      try {
        const parsed = JSON.parse(raw) as SearchSessionSnapshot;
        return parsed.sectionPage.tracks;
      } catch {
        return 0;
      }
    })(),
  });
  const [extraSpotify, setExtraSpotify] = useState<ExtraSpotify>(EMPTY_EXTRA);
  const [spotifyPaging, setSpotifyPaging] = useState<UnifiedSearchSpotifyPaging | null>(null);

  const debounceMs = useMemo(() => getSearchDebounceMs(), []);
  const pageSize = useMemo(() => getSearchCap(), []);

  useEffect(() => {
    if (initialQuery !== null) {
      setQ(initialQuery);
    }
    // initial query value should only be applied once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearchParams((params) => {
      if (q.trim() === '') {
        params.delete('q');
      } else {
        params.set('q', q);
      }
      params.set('entity', searchEntity);
      params.set('filter', filter);
      return params;
    }, { replace: true });
  }, [q, searchEntity, filter, setSearchParams]);

  useEffect(() => {
    const snapshot: SearchSessionSnapshot = {
      q,
      searchEntity,
      filter,
      sectionPage,
    };
    sessionStorage.setItem(SEARCH_SESSION_KEY, JSON.stringify(snapshot));
  }, [q, searchEntity, filter, sectionPage]);

  const searchPlaceholder = useMemo(() => {
    if (searchEntity === 'artists') {
      return 'Search artists…';
    }
    if (searchEntity === 'albums') {
      return 'Search albums…';
    }
    return 'Search tracks…';
  }, [searchEntity]);

  const resultsSectionTitle = useMemo(() => {
    if (searchEntity === 'artists') {
      return 'Artists';
    }
    if (searchEntity === 'albums') {
      return 'Albums';
    }
    return 'Tracks';
  }, [searchEntity]);

  const reloadPlaylists = useCallback(async (): Promise<void> => {
    const [pl, s] = await Promise.all([
      window.deepcut.getPlaylists(),
      window.deepcut.getSettings(),
    ]);
    setPlaylists(pl);
    setAddToPl(syncAddToPlaylistSelection(pl, s));
  }, []);

  const persistLastAddToPlaylist = useCallback(async (value: string): Promise<void> => {
    const s = await window.deepcut.getSettings();
    const nextId =
      value === '' || value === ADD_TO_NEW_PLAYLIST ? undefined : value;
    await window.deepcut.saveSettings({ ...s, lastAddToPlaylistId: nextId });
  }, []);

  const addTrackToNewPlaylist = useCallback(
    async (ref: TrackRef): Promise<void> => {
      const existing = await window.deepcut.getPlaylists();
      const name = uniqueNewPlaylistName(existing.map((p) => p.name));
      const newId = uuidv4();
      await window.deepcut.savePlaylist({
        playlistId: newId,
        name,
        entries: [],
      });
      await window.deepcut.addTrackToPlaylist({ playlistId: newId, track: ref });
      const s = await window.deepcut.getSettings();
      await window.deepcut.saveSettings({ ...s, lastAddToPlaylistId: newId });
      await reloadPlaylists();
    },
    [reloadPlaylists]
  );

  const closePlaylistModal = useCallback((): void => {
    setPlaylistModal({ kind: 'closed' });
    setModalPlaylistName('');
  }, []);

  const runSearch = useCallback(async (query: string, f: typeof filter, entity: SectionKey) => {
    const r = (await window.deepcut.unifiedSearch({
      query,
      sourceFilter: query.trim() === '' && f === 'all' ? 'local' : f,
      entityType: entity,
    })) as UnifiedSearchResult;
    setResult(r);
  }, []);

  useEffect(() => {
    void reloadPlaylists();
  }, [reloadPlaylists]);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(q, filter, searchEntity);
    }, debounceMs);
    return () => {
      clearTimeout(t);
    };
  }, [q, filter, searchEntity, runSearch, debounceMs]);

  useEffect(() => {
    setSectionPage({ artists: 0, albums: 0, tracks: 0 });
    setExtraSpotify(EMPTY_EXTRA);
    if (result === null) {
      setSpotifyPaging(null);
      return;
    }
    setSpotifyPaging(result.spotifyPaging);
  }, [result]);

  const confirmPlaylistModal = useCallback((): void => {
    const name = modalPlaylistName.trim();
    if (name.length === 0) {
      return;
    }
    const id = uuidv4();
    if (playlistModal.kind === 'empty') {
      void (async (): Promise<void> => {
        await window.deepcut.savePlaylist({
          playlistId: id,
          name,
          entries: [],
        });
        const s = await window.deepcut.getSettings();
        await window.deepcut.saveSettings({ ...s, lastAddToPlaylistId: id });
        await reloadPlaylists();
        closePlaylistModal();
      })();
      return;
    }
    if (playlistModal.kind === 'addTrack') {
      const ref = playlistModal.track;
      void (async (): Promise<void> => {
        await window.deepcut.savePlaylist({
          playlistId: id,
          name,
          entries: [],
        });
        await window.deepcut.addTrackToPlaylist({
          playlistId: id,
          track: ref,
        });
        const s = await window.deepcut.getSettings();
        await window.deepcut.saveSettings({ ...s, lastAddToPlaylistId: id });
        await reloadPlaylists();
        closePlaylistModal();
      })();
    }
  }, [closePlaylistModal, modalPlaylistName, playlistModal, reloadPlaylists]);

  const artistRows = useMemo(() => {
    if (result === null) {
      return [] as ({ kind: 'spotify'; a: SpotifyArtist } | { kind: 'local'; a: { name: string; trackCount: number } })[];
    }
    const spotify = [...result.artists, ...extraSpotify.artists];
    const rows = [
      ...spotify.map((a) => ({ kind: 'spotify' as const, a })),
      ...result.localArtists.map((a) => ({ kind: 'local' as const, a })),
    ];
    return rows.sort((a, b) => {
      const left = a.kind === 'spotify' ? a.a.name : a.a.name;
      const right = b.kind === 'spotify' ? b.a.name : b.a.name;
      return left.localeCompare(right, undefined, { sensitivity: 'base' });
    });
  }, [result, extraSpotify.artists]);

  const albumRows = useMemo(() => {
    if (result === null) {
      return [] as ({ kind: 'spotify'; al: SpotifyAlbum } | { kind: 'local'; al: { artist: string; album: string; trackCount: number } })[];
    }
    const spotify = [...result.albums, ...extraSpotify.albums];
    const rows = [
      ...spotify.map((al) => ({ kind: 'spotify' as const, al })),
      ...result.localAlbums.map((al) => ({ kind: 'local' as const, al })),
    ];
    return rows.sort((a, b) => {
      const left = a.kind === 'spotify' ? a.al.name : a.al.album;
      const right = b.kind === 'spotify' ? b.al.name : b.al.album;
      return left.localeCompare(right, undefined, { sensitivity: 'base' });
    });
  }, [result, extraSpotify.albums]);

  const trackRows = useMemo(() => {
    if (result === null) {
      return [];
    }
    const rows = [...result.tracks, ...extraSpotify.tracks];
    return rows.sort((a, b) =>
      a.primaryTitle.localeCompare(b.primaryTitle, undefined, { sensitivity: 'base' })
    );
  }, [result, extraSpotify.tracks]);

  const bumpPage = useCallback((key: SectionKey, delta: number) => {
    setSectionPage((p) => ({ ...p, [key]: Math.max(0, p[key] + delta) }));
  }, []);

  const handleArtistDown = useCallback(async (): Promise<void> => {
    if (result === null) {
      return;
    }
    const cap = pageSize;
    const p = sectionPage.artists;
    if ((p + 1) * cap < artistRows.length) {
      bumpPage('artists', 1);
      return;
    }
    const next = spotifyPaging?.artists.next;
    if (!next || filter === 'local') {
      return;
    }
    const data = await window.deepcut.spotifySearchNext({ url: next });
    setExtraSpotify((e) => ({ ...e, artists: [...e.artists, ...data.artists] }));
    setSpotifyPaging((sp) => (sp ? { ...sp, artists: data.paging.artists } : null));
    bumpPage('artists', 1);
  }, [result, pageSize, sectionPage.artists, artistRows.length, spotifyPaging?.artists.next, filter, bumpPage]);

  const handleArtistUp = useCallback(() => {
    bumpPage('artists', -1);
  }, [bumpPage]);

  const handleAlbumDown = useCallback(async (): Promise<void> => {
    if (result === null) {
      return;
    }
    const cap = pageSize;
    const p = sectionPage.albums;
    if ((p + 1) * cap < albumRows.length) {
      bumpPage('albums', 1);
      return;
    }
    const next = spotifyPaging?.albums.next;
    if (!next || filter === 'local') {
      return;
    }
    const data = await window.deepcut.spotifySearchNext({ url: next });
    setExtraSpotify((e) => ({ ...e, albums: [...e.albums, ...data.albums] }));
    setSpotifyPaging((sp) => (sp ? { ...sp, albums: data.paging.albums } : null));
    bumpPage('albums', 1);
  }, [result, pageSize, sectionPage.albums, albumRows.length, spotifyPaging?.albums.next, filter, bumpPage]);

  const handleAlbumUp = useCallback(() => {
    bumpPage('albums', -1);
  }, [bumpPage]);

  const handleTrackDown = useCallback(async (): Promise<void> => {
    if (result === null) {
      return;
    }
    const cap = pageSize;
    const p = sectionPage.tracks;
    if ((p + 1) * cap < trackRows.length) {
      bumpPage('tracks', 1);
      return;
    }
    const next = spotifyPaging?.tracks.next;
    if (!next || filter === 'local') {
      return;
    }
    const data = await window.deepcut.spotifySearchNext({ url: next });
    const locals = (await window.deepcut.getLocalTracks()) as LocalTrack[];
    const localsFiltered = filterLocalTracksByQuery(locals, q);
    const used = new Set(result.usedLocalTrackIds);
    for (const r of extraSpotify.tracks) {
      if (r.local) {
        used.add(r.local.localTrackId);
      }
    }
    const newRows = mergeAdditionalSpotifyTracks(data.tracks, localsFiltered, used);
    setExtraSpotify((e) => ({ ...e, tracks: [...e.tracks, ...newRows] }));
    setSpotifyPaging((sp) => (sp ? { ...sp, tracks: data.paging.tracks } : null));
    bumpPage('tracks', 1);
  }, [
    result,
    pageSize,
    sectionPage.tracks,
    trackRows.length,
    spotifyPaging?.tracks.next,
    filter,
    q,
    extraSpotify.tracks,
    bumpPage,
  ]);

  const handleTrackUp = useCallback(() => {
    bumpPage('tracks', -1);
  }, [bumpPage]);

  const modalOpen = playlistModal.kind !== 'closed';
  const modalTitle =
    playlistModal.kind === 'addTrack' ? 'Add to new playlist' : 'New playlist';
  const modalConfirmLabel =
    playlistModal.kind === 'addTrack' ? 'Create and add' : 'Create playlist';

  const visibleArtists = artistRows.slice(
    sectionPage.artists * pageSize,
    sectionPage.artists * pageSize + pageSize
  );
  const visibleAlbums = albumRows.slice(
    sectionPage.albums * pageSize,
    sectionPage.albums * pageSize + pageSize
  );
  const visibleTracks = trackRows.slice(
    sectionPage.tracks * pageSize,
    sectionPage.tracks * pageSize + pageSize
  );

  return (
    <div>
      <div
        className="panel search-toolbar"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}
      >
        <input
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          style={{ flex: '1 1 240px' }}
        />
        <fieldset className="search-entity-fieldset">
          <legend>Search for</legend>
          <label className="search-entity-label">
            <input
              type="radio"
              name="searchEntity"
              checked={searchEntity === 'artists'}
              onChange={() => {
                setSearchEntity('artists');
              }}
            />{' '}
            Artists
          </label>
          <label className="search-entity-label">
            <input
              type="radio"
              name="searchEntity"
              checked={searchEntity === 'albums'}
              onChange={() => {
                setSearchEntity('albums');
              }}
            />{' '}
            Albums
          </label>
          <label className="search-entity-label">
            <input
              type="radio"
              name="searchEntity"
              checked={searchEntity === 'tracks'}
              onChange={() => {
                setSearchEntity('tracks');
              }}
            />{' '}
            Tracks
          </label>
        </fieldset>
        <select value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); }}>
          <option value="all">All sources</option>
          <option value="spotify">Spotify</option>
          <option value="local">Local</option>
        </select>
        <span className="subtitle">{pageSize} per page</span>
        {q.trim() === '' ? (
          <span className="subtitle">No criteria entered; showing local entities only.</span>
        ) : null}
      </div>

      <NewPlaylistModal
        open={modalOpen}
        title={modalTitle}
        confirmLabel={modalConfirmLabel}
        name={modalPlaylistName}
        onNameChange={setModalPlaylistName}
        onConfirm={() => {
          confirmPlaylistModal();
        }}
        onCancel={closePlaylistModal}
      />

      {result ? (
        <section className="panel search-results-panel">
          <SearchSectionTop title={resultsSectionTitle} />
          {searchEntity === 'tracks' ? (
            <div
              className="search-tracks-toolbar"
              style={{
                marginBottom: '0.75rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <label className="subtitle">
                Add to playlist
                <select
                  value={addToPl}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddToPl(v);
                    void persistLastAddToPlaylist(v);
                  }}
                  style={{ marginLeft: '0.5rem', maxWidth: 220 }}
                >
                  {playlists.length === 0 ? (
                    <option value={ADD_TO_NEW_PLAYLIST}>{'<new>'}</option>
                  ) : (
                    <>
                      <option value="">—</option>
                      {playlists.map((p) => (
                        <option key={p.playlistId} value={p.playlistId}>
                          {p.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            </div>
          ) : null}
          {searchEntity === 'artists' ? (
            <SearchSectionListArea
              title="Artists"
              page={sectionPage.artists}
              totalRows={artistRows.length}
              pageSize={pageSize}
              nextUrl={spotifyPaging?.artists.next}
              onUp={handleArtistUp}
              onDown={handleArtistDown}
            >
              {visibleArtists.map((row) =>
                row.kind === 'spotify' ? (
                  <div key={`spotify-${row.a.id}`} className="list-row">
                    <div>
                      <Link to={`/artist/${row.a.id}`}>{row.a.name}</Link>
                      <span className="badge badge-spotify">Spotify</span>
                    </div>
                  </div>
                ) : (
                  <div key={`local-artist-${row.a.name}`} className="list-row">
                    <div>
                      <Link to={`/local-artist/${encodeURIComponent(row.a.name)}`}>{row.a.name}</Link>
                      <span className="subtitle"> · {row.a.trackCount} tracks</span>
                      <span className="badge badge-local">Local</span>
                    </div>
                  </div>
                )
              )}
            </SearchSectionListArea>
          ) : null}
          {searchEntity === 'albums' ? (
            <SearchSectionListArea
              title="Albums"
              page={sectionPage.albums}
              totalRows={albumRows.length}
              pageSize={pageSize}
              nextUrl={spotifyPaging?.albums.next}
              onUp={handleAlbumUp}
              onDown={handleAlbumDown}
            >
              {visibleAlbums.map((row) =>
                row.kind === 'spotify' ? (
                  <div key={`spotify-album-${row.al.id}`} className="list-row">
                    <div>
                      <Link to={`/album/${row.al.id}`}>{row.al.name}</Link>
                      <span className="subtitle">{row.al.artists.join(', ')}</span>
                      <span className="badge badge-spotify">Spotify</span>
                    </div>
                  </div>
                ) : (
                  <div key={`local-album-${row.al.artist}-${row.al.album}`} className="list-row">
                    <div>
                      <Link
                        to={`/local-album/${encodeURIComponent(row.al.artist)}/${encodeURIComponent(row.al.album)}`}
                      >
                        {localAlbumDisplayTitle(row.al.album)}
                      </Link>
                      <span className="subtitle">{row.al.artist}</span>
                      <span className="subtitle"> · {row.al.trackCount} tracks</span>
                      <span className="badge badge-local">Local</span>
                    </div>
                  </div>
                )
              )}
            </SearchSectionListArea>
          ) : null}
          {searchEntity === 'tracks' ? (
            <SearchSectionListArea
              title="Tracks"
              page={sectionPage.tracks}
              totalRows={trackRows.length}
              pageSize={pageSize}
              nextUrl={spotifyPaging?.tracks.next}
              onUp={handleTrackUp}
              onDown={handleTrackDown}
              floatNav="left"
            >
              {visibleTracks.map((row, idx) => {
                let rowKey: string;
                if (row.spotify) {
                  rowKey = `sp-${row.spotify.id}-${row.local?.localTrackId ?? 'x'}`;
                } else if (row.local) {
                  rowKey = `loc-${row.local.localTrackId}`;
                } else {
                  rowKey = `t-${idx}`;
                }
                return (
                  <div key={rowKey} className="list-row">
                    <div>
                      <strong>{row.primaryTitle}</strong>
                      {row.subtitle ? <div className="subtitle">{row.subtitle}</div> : null}
                      <div className="subtitle">
                        {row.artistLine} — {row.albumLine}
                      </div>
                      {row.spotify ? <span className="badge badge-spotify">Spotify</span> : null}
                      {row.local ? <span className="badge badge-local">Local</span> : null}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          if (row.spotify) {
                            void pb.playRef({
                              source: 'spotify',
                              spotifyId: row.spotify.id,
                              spotifyUri: row.spotify.uri,
                            });
                          } else if (row.local) {
                            void pb.playRef({
                              source: 'local',
                              localTrackId: row.local.localTrackId,
                              filePath: row.local.filePath,
                            });
                          }
                        }}
                      >
                        Play
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          if (row.spotify) {
                            void pb.enqueueRef({
                              source: 'spotify',
                              spotifyId: row.spotify.id,
                              spotifyUri: row.spotify.uri,
                            });
                            return;
                          }
                          if (row.local) {
                            void pb.enqueueRef({
                              source: 'local',
                              localTrackId: row.local.localTrackId,
                              filePath: row.local.filePath,
                            });
                          }
                        }}
                      >
                        Add to Q
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          let ref: TrackRef | null = null;
                          if (row.spotify) {
                            ref = {
                              source: 'spotify',
                              spotifyId: row.spotify.id,
                              spotifyUri: row.spotify.uri,
                            };
                          } else if (row.local) {
                            ref = {
                              source: 'local',
                              localTrackId: row.local.localTrackId,
                              filePath: row.local.filePath,
                            };
                          }
                          if (ref === null) {
                            return;
                          }
                          if (addToPl === ADD_TO_NEW_PLAYLIST) {
                            void addTrackToNewPlaylist(ref);
                            return;
                          }
                          if (addToPl.length > 0) {
                            void window.deepcut.addTrackToPlaylist({ playlistId: addToPl, track: ref });
                            return;
                          }
                          setPlaylistModal({ kind: 'addTrack', track: ref });
                          setModalPlaylistName('');
                        }}
                      >
                        Add to playlist
                      </button>
                    </div>
                  </div>
                );
              })}
            </SearchSectionListArea>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
