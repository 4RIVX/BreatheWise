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

  constructor(params?: {
    sharedHits?: Map<string, BucketRecord>;
    prefix?: string;
  }) {
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

export class RedisRestRateLimitStore implements Store {
  private readonly restUrl: string;
  private readonly restToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private windowMs = 60_000;
  public prefix = "bw:dist:rl:";

  constructor(params: {
    restUrl: string;
    restToken: string;
    fetchImpl?: typeof fetch;
    prefix?: string;
    timeoutMs?: number;
  }) {
    this.restUrl = params.restUrl.replace(/\/+$/, "");
    this.restToken = params.restToken;
    this.fetchImpl = params.fetchImpl ?? fetch;
    this.timeoutMs = params.timeoutMs ?? 2500;
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
      timeoutMs: this.timeoutMs,
    });
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private async executeJsonRequest<T>(path: string, body?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;

    try {
      res = await this.fetchImpl(`${this.restUrl}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
      });
    } catch {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store unreachable or timed out."
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new DistributedRateLimitUnavailableError(
        `Distributed Redis rate-limit store returned HTTP ${res.status}.`
      );
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store returned malformed JSON."
      );
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const scopedKey = `${this.prefix}${key}`;
    const payload = await this.executeJsonRequest<
      Array<{ result?: unknown; error?: unknown }>
    >(
      "/pipeline",
      JSON.stringify([
        ["INCR", scopedKey],
        ["PEXPIRE", scopedKey, String(this.windowMs), "NX"],
        ["PTTL", scopedKey],
      ])
    );

    if (!Array.isArray(payload) || payload.length < 3) {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store returned malformed pipeline response."
      );
    }

    for (const entry of payload) {
      if (entry && typeof entry === "object" && entry.error) {
        throw new DistributedRateLimitUnavailableError(
          "Distributed Redis rate-limit command failed."
        );
      }
    }

    const totalHits = Number(payload[0]?.result);
    if (!Number.isInteger(totalHits) || totalHits < 1) {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store returned malformed counter."
      );
    }

    const rawPttl = payload[2]?.result;
    const pttl = typeof rawPttl === "number" ? rawPttl : Number(rawPttl);
    if (!Number.isFinite(pttl)) {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit store returned invalid TTL."
      );
    }

    const resetMs = pttl > 0 ? pttl : this.windowMs;
    return {
      totalHits,
      resetTime: new Date(Date.now() + resetMs),
    };
  }

  async decrement(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    const payload = await this.executeJsonRequest<{
      result?: unknown;
      error?: unknown;
    }>(`/decr/${encodeURIComponent(scopedKey)}`);
    if (payload && typeof payload === "object" && payload.error) {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit decrement command failed."
      );
    }
  }

  async resetKey(key: string): Promise<void> {
    const scopedKey = `${this.prefix}${key}`;
    const payload = await this.executeJsonRequest<{
      result?: unknown;
      error?: unknown;
    }>(`/del/${encodeURIComponent(scopedKey)}`);
    if (payload && typeof payload === "object" && payload.error) {
      throw new DistributedRateLimitUnavailableError(
        "Distributed Redis rate-limit reset command failed."
      );
    }
  }
}

export function createRateLimitStore(
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
  prefix?: string
): Store {
  if (config.nodeEnv === "production") {
    if (!config.rateLimitRedisRestUrl || !config.rateLimitRedisRestToken) {
      console.warn(
        "WARNING: Distributed Redis rate-limit store is not configured in production. Falling back to in-memory rate limiter."
      );
    }
  }
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
