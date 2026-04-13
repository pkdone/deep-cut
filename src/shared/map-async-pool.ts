/**
 * Maps `items` with at most `concurrency` in-flight async operations.
 * Results are in the same order as `items`.
 */
export async function mapAsyncPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const cap = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) {
        return;
      }
      const item = items[i];
      if (item === undefined) {
        throw new Error('mapAsyncPool: missing item at index (expected dense array)');
      }
      results[i] = await fn(item, i);
    }
  };

  const workerCount = Math.min(cap, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker();
    }),
  );
  return results;
}
