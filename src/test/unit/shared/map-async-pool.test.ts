import { mapAsyncPool } from '../../../shared/map-async-pool.js';

describe('mapAsyncPool', () => {
  it('returns empty for empty items', async () => {
    await expect(
      mapAsyncPool([], 4, async (item) => await Promise.resolve(item)),
    ).resolves.toEqual([]);
  });

  it('preserves result order to match input order', async () => {
    const results = await mapAsyncPool([3, 1, 2], 2, async (n) => {
      await new Promise((resolve) => {
        setTimeout(resolve, n * 5);
      });
      return n * 10;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it('uses at least one worker when concurrency is below 1', async () => {
    const results = await mapAsyncPool([1, 2], 0, async (n) => await Promise.resolve(n + 1));
    expect(results).toEqual([2, 3]);
  });
});
