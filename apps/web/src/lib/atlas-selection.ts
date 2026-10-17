/** LRU cycle: every ready postcard appears once before another cycle begins. */
export function choosePostcard(ids: readonly string[], recent: readonly string[], random = Math.random): string | undefined {
  if (!ids.length) return undefined;
  const unseen = ids.filter(id => !recent.includes(id));
  const candidates = unseen.length ? unseen : ids.filter(id => id !== recent.at(-1));
  const pool = candidates.length ? candidates : [...ids];
  const value = random();
  return pool[Math.floor((Number.isFinite(value) && value >= 0 && value < 1 ? value : 0) * pool.length)];
}

export function rememberPostcard(id: string, ids: readonly string[], recent: readonly string[]): string[] {
  const valid = [...new Set(recent.filter(item => ids.includes(item)))];
  return valid.length >= ids.length ? [id] : [...valid.filter(item => item !== id), id];
}
