import type { ArtistEnrichmentCache } from '../schemas/artist-enrichment.js';

export interface ArtistEnrichmentRepository {
  get(spotifyArtistId: string): Promise<ArtistEnrichmentCache | null>;
  upsert(entry: ArtistEnrichmentCache): Promise<void>;
  delete(spotifyArtistId: string): Promise<void>;
}
