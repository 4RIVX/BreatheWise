export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  cachedAtIso: string;
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(defaultTtlMs: number) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): { value: T; cachedAtIso: string } | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return { value: entry.value, cachedAtIso: entry.cachedAtIso };
  }

  set(key: string, value: T, ttlMs: number = this.defaultTtlMs): string {
    const cachedAtIso = new Date().toISOString();
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      cachedAtIso,
    });
    return cachedAtIso;
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatePct: total > 0 ? Math.round((this.hits / total) * 100) : 0,
    };
  }

  clear() {
    this.store.clear();
  }
}
