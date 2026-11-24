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

export class DistributedRateLimitUnavailableError extends Error {
  constructor(message = "Distributed rate-limit store unavailable.") {
    super(message);
    this.name = "DistributedRateLimitUnavailableError";
  }
}

/**
 * Distributed Redis REST (Upstash-compatible) Store for sharing rate-limit
 * counters across multiple Cloud Run instances without paid GCP infrastructure.
 * Fails closed cleanly with DistributedRateLimitUnavailableError when the shared
 * store is unreachable rather than silently falling back to per-instance memory.
 */
export class RedisRestRateLimitStore implements Store {
  private readonly restUrl: string;
  private readonly restToken: string;
  private readonly fetchImpl: typeof fetch;
  private windowMs = 60_000;
  public prefix = "bw:dist:rl:";

  constructor(params: {
    restUrl: string;
    restToken: string;
    fetchImpl?: typeof fetch;
    prefix?: string;
  }) {
    this.restUrl = params.restUrl.replace(/\/+$/, "");
    this.restToken = params.restToken;
    this.fetchImpl = params.fetchImpl ?? fetch;
    if (params.prefix) {
      this.prefix = params.prefix;
    }
  }

  withPrefix(prefix: string): RedisRestRateLimitStore {
    return new RedisRestRateLimitStore({
      restUrl: this.restUrl,
      restToken: this.restToken,
      fetchImpl: this.fetchImpl,
      prefix,
    });
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const scopedKey = `${this.prefix}${key}`;
    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      res = await this.fetchImpl(`${this.restUrl}/pipeline`, {
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
    } catch {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store unreachable."
      );
    }

    if (!res.ok) {
      throw new DistributedRateLimitUnavailableError(
        `Distributed Redis rate-limit store returned HTTP ${res.status}.`
      );
    }

    const payload = (await res.json()) as Array<{ result?: number }>;
    const totalHits = Number(payload?.[0]?.result);
    if (!Number.isFinite(totalHits)) {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store returned malformed counter."
      );
    }
    const pttl = Number(payload?.[2]?.result ?? this.windowMs);
    const resetMs = Number.isFinite(pttl) && pttl > 0 ? pttl : this.windowMs;

    return {
      totalHits,
      resetTime: new Date(Date.now() + resetMs),
    };
  }

  async decrement(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    const res = await this.fetchImpl(
      `${this.restUrl}/decr/${encodeURIComponent(scopedKey)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.restToken}` },
      }
    );
    if (!res.ok) {
      throw new DistributedRateLimitUnavailableError(
        `Distributed Redis rate-limit decrement failed (HTTP ${res.status}).`
      );
    }
  }

  async resetKey(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    const res = await this.fetchImpl(
      `${this.restUrl}/del/${encodeURIComponent(scopedKey)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.restToken}` },
      }
    );
    if (!res.ok) {
      throw new DistributedRateLimitUnavailableError(
        `Distributed Redis rate-limit reset failed (HTTP ${res.status}).`
      );
    }
  }
}

export function createRateLimitStore(
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
  prefix?: string
): Store {
  if (config.rateLimitRedisRestUrl && config.rateLimitRedisRestToken) {
    return new RedisRestRateLimitStore({
      restUrl: config.rateLimitRedisRestUrl,
      restToken: config.rateLimitRedisRestToken,
      fetchImpl,
      prefix,
    });
  }
  return new MemoryRateLimitStore({ prefix: prefix ?? "mem:" });
}
