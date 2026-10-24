type Entry<T> = { at: number; p: Promise<T> };

export function ttlCache<T>(ttlMs: number) {
  const store = new Map<string, Entry<T>>();
  return (key: string, loader: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.p;
    const p = loader().catch((e) => {
      store.delete(key);
      throw e;
    });
    store.set(key, { at: Date.now(), p });
    return p;
  };
}
