import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ArtistEnrichmentCache } from '../../../domain/schemas/artist-enrichment.js';
import type { BandMemberTenurePeriod } from '../../../domain/schemas/artist-enrichment.js';
import type { TrackRef } from '../../../domain/schemas/track-ref.js';
import {
  artistInsightsBodyForUi,
  artistInsightsWarningsForUi,
} from '../../../domain/services/artist-insights-for-ui.js';
import { usePlayback } from '../playback/PlaybackProvider.js';

function resolvePlaybackPayload(
  trackRef: TrackRef,
  primaryArtistDisplayName: string | null
): { trackRef: TrackRef; primaryArtistDisplayName?: string } {
  return {
    trackRef,
    ...(primaryArtistDisplayName !== null && primaryArtistDisplayName !== ''
      ? { primaryArtistDisplayName }
      : {}),
  };
}

function trackRefIdentity(ref: TrackRef): string {
  if (ref.source === 'local') {
    return `local:${ref.localTrackId}`;
  }
  return `spotify:${ref.spotifyId}`;
}

function RefreshInsightsIcon(): ReactElement {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden={true}>
      <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}

/** Matches status-bar spinner (`np-spin`) for consistent refresh feedback. */
function RefreshInsightsSpinner(): ReactElement {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={true}
      className="np-refresh-spinner"
    >
      <path d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 2.13-1.34 3.94-3.21 4.67l-.96.96C14.55 18.45 13.28 19 12 19c-3.86 0-7-3.14-7-7 0-1.28.55-2.55 1.37-3.79l-1.41-1.41C3.56 9.63 3 11.26 3 13c0 4.97 4.03 9 9 9 1.74 0 3.37-.56 4.75-1.51l.96-.96A6.93 6.93 0 0 0 19 13c0-3.86-3.14-7-7-7z" />
    </svg>
  );
}

/** Formats tenure for UI, e.g. (1987–2003) or (1990–1995, 1998–2001) for boomerang members. */
function formatBandMemberTenure(periods: readonly BandMemberTenurePeriod[]): string {
  return periods
    .map((p) => {
      if (p.endYear === null) {
        return `${String(p.startYear)}–present`;
      }
      return `${String(p.startYear)}–${String(p.endYear)}`;
    })
    .join(', ');
}

function InsightReferenceLink(props: {
  url: string | null | undefined;
  children: ReactNode;
}): ReactElement {
  const { url, children } = props;
  if (url != null && url.length > 0) {
    return (
      <button
        type="button"
        className="np-insights-artist-link np-insights-row-link"
        title="Open reference page in your browser"
        onClick={() => {
          void window.deepcut.openExternalUrl(url);
        }}
      >
        {children}
      </button>
    );
  }
  return <>{children}</>;
}

export function NowPlayingPage(): ReactElement {
  const pb = usePlayback();
  const cur = pb.current;
  const prevTrackIdentityRef = useRef<string | null>(null);
  const insightFetchRunIdRef = useRef(0);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [enrich, setEnrich] = useState<ArtistEnrichmentCache | null>(null);
  const [enrichErr, setEnrichErr] = useState<string | null>(null);
  const [offlineMsg, setOfflineMsg] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [artistImageUrl, setArtistImageUrl] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  useEffect(() => {
    if (cur === null) {
      prevTrackIdentityRef.current = null;
      setResolutionError(null);
      setEnrich(null);
      setEnrichErr(null);
      setOfflineMsg(false);
      setLoadingInsight(false);
      setDisplayName(null);
      setArtistImageUrl(null);
      setHeroImageFailed(false);
      return undefined;
    }

    const identity = trackRefIdentity(cur);
    const trackChanged = prevTrackIdentityRef.current !== identity;
    if (trackChanged) {
      prevTrackIdentityRef.current = identity;
      setLoadingInsight(true);
      setResolutionError(null);
      setEnrich(null);
      setEnrichErr(null);
      setOfflineMsg(false);
      setDisplayName(null);
      setArtistImageUrl(null);
    }

    const runId = ++insightFetchRunIdRef.current;
    void (async () => {
      const resolved = await window.deepcut.resolvePlaybackArtistForEnrichment(
        resolvePlaybackPayload(cur, pb.primaryArtistDisplayName)
      );
      if (insightFetchRunIdRef.current !== runId) {
        return;
      }
      if (resolved.kind === 'error') {
        setLoadingInsight(false);
        setResolutionError(resolved.message ?? resolved.reason);
        return;
      }
      setResolutionError(null);
      setDisplayName(resolved.displayName);
      const imageResult = await window.deepcut.getArtistImage({
        enrichmentArtistKey: resolved.enrichmentArtistKey,
        artistName: resolved.displayName,
      });
      if (insightFetchRunIdRef.current !== runId) {
        return;
      }
      if (imageResult.kind === 'hit') {
        setArtistImageUrl(imageResult.cached.imageUrl);
      } else {
        setArtistImageUrl(null);
      }
      const r = await window.deepcut.getArtistEnrichment({
        enrichmentArtistKey: resolved.enrichmentArtistKey,
        artistName: resolved.displayName,
      });
      if (insightFetchRunIdRef.current !== runId) {
        return;
      }
      if (r.kind === 'hit') {
        setLoadingInsight(false);
        setEnrich(r.cached as ArtistEnrichmentCache);
        setOfflineMsg(false);
        setEnrichErr(null);
        return;
      }
      if (r.kind === 'stale') {
        setLoadingInsight(false);
        setEnrich(r.cached as ArtistEnrichmentCache);
        setOfflineMsg(false);
        setEnrichErr(null);
        return;
      }

      setEnrich(null);
      setEnrichErr(null);
      if (!navigator.onLine) {
        setLoadingInsight(false);
        setOfflineMsg(true);
        return;
      }
      setOfflineMsg(false);
      setLoadingInsight(true);

      try {
        const refreshed = await window.deepcut.refreshArtistEnrichment({
          enrichmentArtistKey: resolved.enrichmentArtistKey,
          artistName: resolved.displayName,
        });
        if (insightFetchRunIdRef.current !== runId) {
          return;
        }
        setEnrich(refreshed.cached as ArtistEnrichmentCache | null);
      } catch (e) {
        if (insightFetchRunIdRef.current !== runId) {
          return;
        }
        setEnrichErr(String(e));
      } finally {
        if (insightFetchRunIdRef.current === runId) {
          setLoadingInsight(false);
        }
      }
    })();

    return () => {
      insightFetchRunIdRef.current += 1;
    };
  }, [cur, pb.primaryArtistDisplayName]);

  const artistLabel =
    displayName ??
    (pb.primaryArtistDisplayName !== null && pb.primaryArtistDisplayName !== ''
      ? pb.primaryArtistDisplayName
      : 'Artist');

  const insightBody = enrich !== null ? artistInsightsBodyForUi(enrich) : null;
  const insightWarnings = enrich !== null ? artistInsightsWarningsForUi(enrich) : [];
  const primaryRefUrl =
    enrich != null &&
    enrich.primaryReference != null &&
    enrich.primaryReference.url.length > 0
      ? enrich.primaryReference.url
      : null;

  const heroImageUrl = artistImageUrl;
  const showHeroPlaceholder = heroImageUrl === null || heroImageFailed;
  const heroVisual = heroImageUrl !== null && !heroImageFailed ? (
    <img
      className="np-insights-hero np-insights-synopsis-hero"
      src={heroImageUrl}
      alt={`${artistLabel} — photo`}
      referrerPolicy="no-referrer"
      onError={() => {
        setHeroImageFailed(true);
      }}
    />
  ) : (
    <div
      className="np-insights-hero np-insights-synopsis-hero np-insights-hero-placeholder"
      aria-label={`${artistLabel} image placeholder`}
      title="Artist image unavailable"
    >
      <svg viewBox="0 0 24 24" aria-hidden={true} focusable={false}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    </div>
  );

  useEffect(() => {
    setHeroImageFailed(false);
  }, [artistImageUrl]);

  useEffect(() => {
    if (enrich == null || insightBody == null) {
      return;
    }
  }, [enrich, heroImageFailed, heroImageUrl, insightBody, primaryRefUrl, showHeroPlaceholder]);

  return (
    <div>
      {cur === null ? <p className="subtitle">Nothing playing.</p> : null}
      {pb.error ? <p className="error-text">{pb.error}</p> : null}

      {cur !== null ? (
        <div className="panel">
          <div className="np-insights-heading-row">
            <div className="np-insights-heading-main">
              <h2 className="np-insights-heading-row-title">
                {primaryRefUrl !== null ? (
                  <button
                    type="button"
                    className="np-insights-artist-link"
                    title="Open primary reference page in your browser"
                    aria-label={`Open reference page for ${artistLabel} in your browser`}
                    onClick={() => {
                      void window.deepcut.openExternalUrl(primaryRefUrl);
                    }}
                  >
                    {artistLabel}
                  </button>
                ) : (
                  artistLabel
                )}
              </h2>
              <button
                type="button"
                className="icon-button"
                title={refreshBusy ? 'Refreshing insights…' : 'Regenerate insights and refresh cache'}
                aria-label={refreshBusy ? 'Refreshing insights' : 'Regenerate insights and refresh cache'}
                aria-busy={refreshBusy}
                disabled={refreshBusy || loadingInsight}
                onClick={() => {
                  void (async () => {
                    setEnrichErr(null);
                    setRefreshBusy(true);
                    try {
                      const resolved = await window.deepcut.resolvePlaybackArtistForEnrichment(
                        resolvePlaybackPayload(cur, pb.primaryArtistDisplayName)
                      );
                      if (resolved.kind === 'error') {
                        setEnrichErr(resolved.message ?? resolved.reason);
                        return;
                      }
                      const r = await window.deepcut.refreshArtistEnrichment({
                        enrichmentArtistKey: resolved.enrichmentArtistKey,
                        artistName: resolved.displayName,
                      });
                      setEnrich(r.cached as ArtistEnrichmentCache | null);
                      const img = await window.deepcut.refreshArtistImage({
                        enrichmentArtistKey: resolved.enrichmentArtistKey,
                        artistName: resolved.displayName,
                      });
                      setArtistImageUrl(img.cached?.imageUrl ?? null);
                    } catch (e) {
                      setEnrichErr(String(e));
                    } finally {
                      setRefreshBusy(false);
                    }
                  })();
                }}
              >
                {refreshBusy ? <RefreshInsightsSpinner /> : <RefreshInsightsIcon />}
              </button>
            </div>
          </div>
          {loadingInsight ? <p className="subtitle">Loading…</p> : null}
          {resolutionError !== null ? <p className="error-text">{resolutionError}</p> : null}
          {offlineMsg && !enrich ? (
            <p className="error-text">
              Artist enrichment is not available offline without a cached copy. Connect to the internet
              and use the refresh control above.
            </p>
          ) : null}
          {enrichErr !== null ? <p className="error-text">{enrichErr}</p> : null}

          {enrich !== null &&
          insightBody !== null &&
          !loadingInsight &&
          resolutionError === null ? (
            <>
              {insightWarnings.length > 0 ? (
                <p className="subtitle np-insights-warnings" role="status">
                  {enrich.validationStatus === 'partial'
                    ? 'Partial insights (generated content may be incomplete). '
                    : null}
                  {insightWarnings.join(' ')}
                </p>
              ) : null}
              <div className="np-insights-body-flow">
                {heroVisual}
                <p className="np-insights-synopsis">{insightBody.synopsis}</p>
                {insightBody.topTracks.length > 0 ? (
                  <>
                    <h3>Ranked Top Tracks</h3>
                    <ol className="np-ranked-list">
                      {[...insightBody.topTracks]
                        .sort((a, b) => a.rank - b.rank)
                        .map((t) => (
                          <li key={`track-${String(t.rank)}-${t.title}`} value={t.rank}>
                            <InsightReferenceLink url={t.primaryReference?.url}>
                              <>
                                {t.title}
                                {t.releaseYear !== undefined ? ` (${t.releaseYear})` : ''}
                              </>
                            </InsightReferenceLink>
                          </li>
                        ))}
                    </ol>
                  </>
                ) : null}
                {insightBody.rankedAlbums.length > 0 ? (
                  <>
                    <h3>Ranked Studio Albums</h3>
                    <ol className="np-ranked-list">
                      {[...insightBody.rankedAlbums]
                        .sort((a, b) => a.rank - b.rank)
                        .map((al) => (
                          <li key={`ranked-${String(al.rank)}-${al.name}`} value={al.rank}>
                            <InsightReferenceLink url={al.primaryReference?.url}>
                              <>
                                {al.name} ({al.releaseYear})
                              </>
                            </InsightReferenceLink>
                          </li>
                        ))}
                    </ol>
                  </>
                ) : null}
                {insightBody.liveAlbums.length === 0 &&
                insightBody.bestOfCompilations.length === 0 &&
                insightBody.raritiesCompilations.length === 0 ? (
                  <p className="subtitle np-insights-empty-categories">
                    No live, best-of, or rarities releases were listed in this summary. Refresh to try again with updated source retrieval.
                  </p>
                ) : null}
                {insightBody.liveAlbums.length > 0 ? (
                  <>
                    <h3>Ranked Live Albums</h3>
                    <ol className="np-ranked-list">
                      {[...insightBody.liveAlbums]
                        .sort((a, b) => a.rank - b.rank)
                        .map((al) => (
                          <li key={`live-${String(al.rank)}-${al.name}`} value={al.rank}>
                            <InsightReferenceLink url={al.primaryReference?.url}>
                              <>
                                {al.name} ({al.releaseYear})
                              </>
                            </InsightReferenceLink>
                          </li>
                        ))}
                    </ol>
                  </>
                ) : null}
                {insightBody.bestOfCompilations.length > 0 ? (
                  <>
                    <h3>Ranked Best-Of Compilations</h3>
                    <ol className="np-ranked-list">
                      {[...insightBody.bestOfCompilations]
                        .sort((a, b) => a.rank - b.rank)
                        .map((al) => (
                          <li key={`best-${String(al.rank)}-${al.name}`} value={al.rank}>
                            <InsightReferenceLink url={al.primaryReference?.url}>
                              <>
                                {al.name} ({al.releaseYear})
                              </>
                            </InsightReferenceLink>
                          </li>
                        ))}
                    </ol>
                  </>
                ) : null}
                {insightBody.raritiesCompilations.length > 0 ? (
                  <>
                    <h3>Ranked Rarities Compilations</h3>
                    <ol className="np-ranked-list">
                      {[...insightBody.raritiesCompilations]
                        .sort((a, b) => a.rank - b.rank)
                        .map((al) => (
                          <li key={`rarities-${String(al.rank)}-${al.name}`} value={al.rank}>
                            <InsightReferenceLink url={al.primaryReference?.url}>
                              <>
                                {al.name} ({al.releaseYear})
                              </>
                            </InsightReferenceLink>
                          </li>
                        ))}
                    </ol>
                  </>
                ) : null}
                {insightBody.bandMembers.length > 0 ? (
                  <>
                    <h3>Band Members</h3>
                    <ul className="np-band-members-list">
                      {insightBody.bandMembers.map((m, idx) => (
                        <li key={`member-${String(idx)}-${m.name}`}>
                          <strong>{m.name}</strong>
                          <span className="np-band-tenure"> ({formatBandMemberTenure(m.periods)})</span>
                          {m.instruments.length > 0 ? (
                            <span className="np-band-instruments">
                              {' '}
                              — {m.instruments.join(', ')}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
