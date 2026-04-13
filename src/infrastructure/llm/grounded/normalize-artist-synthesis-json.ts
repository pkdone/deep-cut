/**
 * Coerces and repairs common LLM JSON mistakes before Zod validation.
 * Keeps enrichment resilient without extra network calls.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function coerceInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.trunc(v);
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return Math.trunc(n);
    }
  }
  return fallback;
}

function coerceIntNullable(v: unknown): number | null {
  if (v === null) {
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.trunc(v);
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return Math.trunc(n);
    }
  }
  return null;
}

function normalizeInstruments(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  if (typeof v === 'string' && v.trim().length > 0) {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/** If the model wrapped the payload (e.g. `{ "data": { "synopsis": ... } }`), unwrap once. */
export function unwrapArtistSynthesisObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.synopsis === 'string') {
    return value;
  }
  const wrapperKeys = ['artist', 'data', 'result', 'payload', 'insights', 'enrichment'];
  for (const k of wrapperKeys) {
    const inner = value[k];
    if (isRecord(inner)) {
      if (typeof inner.synopsis === 'string') {
        return inner;
      }
      const deeper = unwrapArtistSynthesisObject(inner);
      if (deeper !== null) {
        return deeper;
      }
    }
  }
  return value;
}

function normalizeRankedAlbumEntry(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length === 0) {
    return null;
  }
  const out: Record<string, unknown> = {
    name,
    releaseYear: coerceInt(raw.releaseYear, 2000),
    rank: Math.max(1, coerceInt(raw.rank, 1)),
  };
  return out;
}

function normalizeCategorizedAlbumEntry(raw: unknown): Record<string, unknown> | null {
  const base = normalizeRankedAlbumEntry(raw);
  if (base === null) {
    return null;
  }
  const r = base.rank as number;
  base.rank = Math.min(3, Math.max(1, r));
  return base;
}

function normalizeTopTrack(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title.length === 0) {
    return null;
  }
  let rank = coerceInt(raw.rank, 1);
  if (rank < 1) {
    rank = 1;
  }
  if (rank > 10) {
    rank = 10;
  }
  const out: Record<string, unknown> = { title, rank };
  if (raw.releaseYear !== undefined && raw.releaseYear !== null) {
    const y = coerceInt(raw.releaseYear, 2000);
    if (y >= 1900 && y <= 2100) {
      out.releaseYear = y;
    }
  }
  return out;
}

function repairPeriod(p: unknown): Record<string, unknown> | null {
  if (!isRecord(p)) {
    return null;
  }
  const startYear = coerceInt(p.startYear, 2000);
  let endYear = coerceIntNullable(p.endYear);
  if (endYear !== null) {
    if (endYear < startYear) {
      endYear = startYear;
    }
  }
  return { startYear, endYear };
}

function normalizeBandMember(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length === 0) {
    return null;
  }
  const instruments = normalizeInstruments(raw.instruments);
  const periodsRaw = Array.isArray(raw.periods) ? raw.periods : [];
  const periods = periodsRaw
    .map((x) => repairPeriod(x))
    .filter((x): x is Record<string, unknown> => x !== null);
  if (periods.length === 0) {
    return null;
  }
  return { name, instruments, periods };
}

/**
 * Returns a plain object closer to our Zod schemas: numeric fields coerced, arrays bounded,
 * invalid nested entries dropped, synopsis defaulted when missing.
 */
export function normalizeArtistSynthesisJson(value: unknown): unknown {
  const unwrapped = unwrapArtistSynthesisObject(value);
  if (unwrapped === null) {
    return value;
  }

  const synopsis =
    typeof unwrapped.synopsis === 'string' && unwrapped.synopsis.trim().length > 0
      ? unwrapped.synopsis.trim()
      : 'Artist insights could not be fully synthesized from the model output.';

  const rankedAlbumsRaw = Array.isArray(unwrapped.rankedAlbums) ? unwrapped.rankedAlbums : [];
  const rankedAlbums = rankedAlbumsRaw
    .map((x) => normalizeRankedAlbumEntry(x))
    .filter((x): x is Record<string, unknown> => x !== null)
    .slice(0, 20);

  const topTracksRaw = Array.isArray(unwrapped.topTracks) ? unwrapped.topTracks : [];
  let topTracks = topTracksRaw
    .map((x) => normalizeTopTrack(x))
    .filter((x): x is Record<string, unknown> => x !== null);
  topTracks.sort((a, b) => (a.rank as number) - (b.rank as number));
  if (topTracks.length > 10) {
    topTracks = topTracks.slice(0, 10);
  }

  const liveRaw = Array.isArray(unwrapped.liveAlbums) ? unwrapped.liveAlbums : [];
  const liveAlbums = liveRaw
    .map((x) => normalizeCategorizedAlbumEntry(x))
    .filter((x): x is Record<string, unknown> => x !== null)
    .slice(0, 3);

  const bestRaw = Array.isArray(unwrapped.bestOfCompilations) ? unwrapped.bestOfCompilations : [];
  const bestOfCompilations = bestRaw
    .map((x) => normalizeCategorizedAlbumEntry(x))
    .filter((x): x is Record<string, unknown> => x !== null)
    .slice(0, 3);

  const rarRaw = Array.isArray(unwrapped.raritiesCompilations)
    ? unwrapped.raritiesCompilations
    : [];
  const raritiesCompilations = rarRaw
    .map((x) => normalizeCategorizedAlbumEntry(x))
    .filter((x): x is Record<string, unknown> => x !== null)
    .slice(0, 3);

  const bandRaw = Array.isArray(unwrapped.bandMembers) ? unwrapped.bandMembers : [];
  const bandMembers = bandRaw
    .map((x) => normalizeBandMember(x))
    .filter((x): x is Record<string, unknown> => x !== null);

  return {
    synopsis,
    rankedAlbums,
    topTracks,
    liveAlbums,
    bestOfCompilations,
    raritiesCompilations,
    bandMembers,
  };
}
