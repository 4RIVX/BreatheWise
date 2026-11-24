import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import type { ServerConfig } from "../config.ts";

interface BucketRecord {
  totalHits: number;
  resetAtMs: number;
}

/**
 * In-process TTL-bounded Store compatible with express-rate-limit.
 * Can also be shared across multiple app instances inside integration tests
 * or single-instance local deployments.
 */
export class MemoryRateLimitStore implements Store {
  public readonly hits: Map<string, BucketRecord>;
  private windowMs = 60_000;
  public prefix = "bw:rl:";

  constructor(params?: { sharedHits?: Map<string, BucketRecord>; prefix?: string }) {
    this.hits = params?.sharedHits ?? new Map<string, BucketRecord>();
    if (params?.prefix) {
      this.prefix = params.prefix;
    }
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    const scopedKey = `${this.prefix}${key}`;
    const existing = this.hits.get(scopedKey);

    if (!existing || now >= existing.resetAtMs) {
      const resetAtMs = now + this.windowMs;
      this.hits.set(scopedKey, { totalHits: 1, resetAtMs });
      if (this.hits.size > 5000) {
        this.pruneExpired(now);
      }
      return { totalHits: 1, resetTime: new Date(resetAtMs) };
    }

    existing.totalHits += 1;
    return {
      totalHits: existing.totalHits,
      resetTime: new Date(existing.resetAtMs),
    };
  }

  async decrement(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    const existing = this.hits.get(scopedKey);
    if (existing && existing.totalHits > 0) {
      existing.totalHits -= 1;
    }
  }

  async resetKey(key: string): Promise<void> {
    this.hits.delete(`${this.prefix}${key}`);
  }

  async resetAll(): Promise<void> {
    this.hits.clear();
  }

  private pruneExpired(now: number): void {
    for (const [k, rec] of this.hits.entries()) {
      if (now >= rec.resetAtMs) {
        this.hits.delete(k);
      }
    }
  }
}

/**
 * Distributed Redis REST (Upstash-compatible) Store for sharing rate-limit
 * counters across multiple Cloud Run instances without paid GCP infrastructure.
 * Falls back safely to local memory if the remote store is transiently unreachable.
 */
export class RedisRestRateLimitStore implements Store {
  private readonly restUrl: string;
  private readonly restToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly fallback = new MemoryRateLimitStore();
  private windowMs = 60_000;
  public prefix = "bw:dist:rl:";

  constructor(params: {
    restUrl: string;
    restToken: string;
    fetchImpl?: typeof fetch;
  }) {
    this.restUrl = params.restUrl.replace(/\/+$/, "");
    this.restToken = params.restToken;
    this.fetchImpl = params.fetchImpl ?? fetch;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const scopedKey = `${this.prefix}${key}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await this.fetchImpl(`${this.restUrl}/pipeline`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", scopedKey],
          ["PEXPIRE", scopedKey, String(this.windowMs), "NX"],
          ["PTTL", scopedKey],
        ]),
      });
      clearTimeout(timer);

      if (!res.ok) {
        return this.fallback.increment(key);
      }

      const payload = (await res.json()) as Array<{ result?: number }>;
      const totalHits = Number(payload?.[0]?.result ?? 1);
      const pttl = Number(payload?.[2]?.result ?? this.windowMs);
      const resetMs = pttl > 0 ? pttl : this.windowMs;

      return {
        totalHits: Number.isFinite(totalHits) ? totalHits : 1,
        resetTime: new Date(Date.now() + resetMs),
      };
    } catch {
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    try {
      await this.fetchImpl(
        `${this.restUrl}/decr/${encodeURIComponent(scopedKey)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.restToken}` },
        }
      );
    } catch {
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    try {
      await this.fetchImpl(
        `${this.restUrl}/del/${encodeURIComponent(scopedKey)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.restToken}` },
        }
      );
    } catch {
      await this.fallback.resetKey(key);
    }
  }
}

export function createRateLimitStore(
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch
): Store {
  if (config.rateLimitRedisRestUrl && config.rateLimitRedisRestToken) {
    return new RedisRestRateLimitStore({
      restUrl: config.rateLimitRedisRestUrl,
      restToken: config.rateLimitRedisRestToken,
      fetchImpl,
    });
  }
  return new MemoryRateLimitStore();
}
