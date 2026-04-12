/** Shared JSON shape instructions for synthesis (strict payload). */
export const ENRICHMENT_JSON_INSTRUCTION = [
  'Return a single JSON object with exactly these keys:',
  '- synopsis: string, one opening paragraph of 6 to 8 sentences; each sentence must be fairly long and substantive; no bullet lists inside synopsis; at least ~320 characters total.',
  '- rankedAlbums: array of { name, releaseYear, rank } — notable studio albums only (original studio LPs and core studio releases), ranked by significance (rank 1 = most important). Do not put live albums, compilations, soundtracks, or rarities collections here — use the other arrays for those. Include up to 20 entries; sort ranks from 1 upward without gaps where possible.',
  '- topTracks: array of exactly 10 objects { title, rank, releaseYear? } — ranks 1 through 10 exactly once each; include releaseYear when known for that recording (optional).',
  '- liveAlbums: at most 3 objects { name, releaseYear, rank } — ranks 1–3 within this list only; official live or concert releases.',
  '- bestOfCompilations: at most 3 objects { name, releaseYear, rank } — ranks 1–3 within this list; greatest-hits or anthologies.',
  '- raritiesCompilations: at most 3 objects { name, releaseYear, rank } — ranks 1–3 within this list; B-sides, outtakes, rarities collections.',
  '- bandMembers: array of { name, instruments, periods } — instruments is string array (e.g. ["vocals","guitar"]). periods is non-empty array of { startYear, endYear } where endYear may be null if still in the band; use multiple objects for boomerang members (e.g. 1990–1995 then 1998–2001). Order members from most significant first.',
  'IMPORTANT: rankedAlbums (studio albums only) and topTracks are required — populate rankedAlbums and exactly 10 topTracks. Fill live/best-of/rarities when fitting releases exist, each with distinct ranks 1..n within that array.',
  'Use ONLY the evidence text provided. Do not invent ratings or unsupported facts; prefer omission over fabrication.',
  'releaseYear is a number (e.g. 1993).',
  'Strict JSON only: wrap strings with a single " character; never write \\" before an opening or closing quote — that is invalid JSON.',
].join(' ');
