import type { ArtistEnrichmentCache } from '../schemas/artist-enrichment.js';

export interface ArtistEnrichmentRepository {
  get(enrichmentArtistKey: string): Promise<ArtistEnrichmentCache | null>;
  upsert(entry: ArtistEnrichmentCache): Promise<void>;
  delete(enrichmentArtistKey: string): Promise<void>;
}
