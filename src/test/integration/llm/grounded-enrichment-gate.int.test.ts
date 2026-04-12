/**
 * Live LLM integration tests are optional; gated on API keys in `.env.local`.
 * Run: `npm run test:integration`
 *
 * Note: uses `console.warn` (not `app-logger`) so Jest does not load Electron.
 */

const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

if (!hasOpenAi) {
  // eslint-disable-next-line no-console -- integration runner notice for developers
  console.warn(
    'Skipping OpenAI grounded enrichment integration tests: set OPENAI_API_KEY in .env.local (see .env.example).'
  );
}

if (!hasAnthropic) {
  // eslint-disable-next-line no-console -- integration runner notice for developers
  console.warn(
    'Skipping Anthropic grounded enrichment integration tests: set ANTHROPIC_API_KEY in .env.local (see .env.example).'
  );
}

const describeOpenAi = hasOpenAi ? describe : describe.skip;
const describeAnthropic = hasAnthropic ? describe : describe.skip;

describeOpenAi('OpenAI grounded enrichment (live)', () => {
  it('runs retrieval and returns an evidence bundle', async () => {
    const { retrieveArtistEvidenceOpenAi } = await import(
      '../../../infrastructure/llm/grounded/openai-retrieval.js'
    );
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY missing');
    }
    const bundle = await retrieveArtistEvidenceOpenAi({
      apiKey: key,
      enrichmentArtistKey: 'test-artist-key-openai',
      artistDisplayName: 'The Beatles',
    });
    expect(bundle.retrievalDigest.length).toBeGreaterThan(50);
    expect(bundle.retrievalProvider).toBe('openai');
  });
});

describeAnthropic('Anthropic grounded enrichment (live)', () => {
  it('runs retrieval and returns an evidence bundle', async () => {
    const { retrieveArtistEvidenceAnthropic } = await import(
      '../../../infrastructure/llm/grounded/anthropic-retrieval.js'
    );
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY missing');
    }
    const bundle = await retrieveArtistEvidenceAnthropic({
      apiKey: key,
      enrichmentArtistKey: 'test-artist-key-anthropic',
      artistDisplayName: 'The Beatles',
    });
    expect(bundle.retrievalDigest.length).toBeGreaterThan(50);
    expect(bundle.retrievalProvider).toBe('anthropic');
  });
});
