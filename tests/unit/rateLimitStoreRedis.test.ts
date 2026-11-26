import { describe, expect, it, vi } from "vitest";
import type { Options } from "express-rate-limit";
import {
  DistributedRateLimitUnavailableError,
  MemoryRateLimitStore,
  RedisRestRateLimitStore,
  createRateLimitStore,
} from "../../server/utils/rateLimitStore.ts";
import type { ServerConfig } from "../../server/config.ts";

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 3000,
    host: "0.0.0.0",
    aiProvider: "gemini",
    aiFallbackProvider: "groq",
    geminiApiKey: "",
    geminiModel: "gemini-4-hydrogen",
    groqApiKey: "",
    groqModel: "llama-3.3-70b-versatile",
    dataGovInApiKey: "",
    openAqApiKey: "",
    allowedOrigins: ["http://localhost:3000"],
    rateLimitRedisRestUrl: "",
    rateLimitRedisRestToken: "",
    deploymentTopology: "single-instance",
    requireDistributedRateLimit: false,
    rateLimitMode: "single-instance-memory",
    aiAnonymousRateLimitMax: 6,
    aiAuthenticatedRateLimitMax: 20,
    requireAiAuth: false,
    nodeEnv: "test",
    ...overrides,
  };
}

const options = { windowMs: 60_000 } as Options;
const pipelineResponse = () =>
  new Response(
    JSON.stringify([{ result: 1 }, { result: true }, { result: 59_000 }]),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

function createStore(fetchImpl: typeof fetch): RedisRestRateLimitStore {
  const store = new RedisRestRateLimitStore({
    restUrl: "https://redis.example.com/",
    restToken: "test-token",
    fetchImpl,
  });
  store.init(options);
  return store;
}

describe("RedisRestRateLimitStore", () => {
  it("increments through the pipeline and returns the hit count and reset time", async () => {
    const fetchImpl = vi.fn(async () =>
      pipelineResponse()
    ) as unknown as typeof fetch;
    const store = createStore(fetchImpl);
    const before = Date.now();

    const info = await store.increment("client-1");

    expect(info.totalHits).toBe(1);
    expect(info.resetTime?.getTime()).toBeGreaterThan(before);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://redis.example.com/pipeline",
      expect.objectContaining({ method: "POST" })
    );
  });

  it.each([
    ["non-array payload", JSON.stringify({ result: 1 })],
    ["short pipeline", JSON.stringify([{ result: 1 }])],
    [
      "command error",
      JSON.stringify([{ error: "ERR" }, { result: true }, { result: 1 }]),
    ],
    [
      "bad counter",
      JSON.stringify([{ result: "abc" }, { result: true }, { result: 1 }]),
    ],
    [
      "bad TTL",
      JSON.stringify([{ result: 1 }, { result: true }, { result: "xyz" }]),
    ],
  ])("rejects a %s", async (_label, body) => {
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    const store = createStore(fetchImpl as unknown as typeof fetch);

    await expect(store.increment("client-1")).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailableError
    );
  });

  it("rejects an HTTP failure", async () => {
    const store = createStore(
      vi.fn(
        async () => new Response("unavailable", { status: 500 })
      ) as unknown as typeof fetch
    );
    await expect(store.increment("client-1")).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailableError
    );
  });

  it("rejects a network failure", async () => {
    const store = createStore(
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch
    );
    await expect(store.increment("client-1")).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailableError
    );
  });

  it("rejects malformed JSON", async () => {
    const store = createStore(
      vi.fn(
        async () => new Response("not-json", { status: 200 })
      ) as unknown as typeof fetch
    );
    await expect(store.increment("client-1")).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailableError
    );
  });

  it("decrements and resets scoped keys", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ result: 1 }), { status: 200 })
    );
    const store = createStore(fetchImpl as unknown as typeof fetch);

    await store.decrement("client/one");
    await store.resetKey("client/one");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(calls[0]?.[0]).toContain("/decr/bw%3Adist%3Arl%3Aclient%2Fone");
    expect(calls[1]?.[0]).toContain("/del/bw%3Adist%3Arl%3Aclient%2Fone");
  });

  it.each(["decrement", "reset"])(
    "surfaces %s command errors",
    async (command) => {
      const store = createStore(
        vi.fn(
          async () =>
            new Response(JSON.stringify({ error: "ERR" }), { status: 200 })
        ) as unknown as typeof fetch
      );
      const operation =
        command === "decrement"
          ? store.decrement("client-1")
          : store.resetKey("client-1");
      await expect(operation).rejects.toBeInstanceOf(
        DistributedRateLimitUnavailableError
      );
    }
  );

  it("creates an isolated store with a prefix", () => {
    const store = createStore(vi.fn() as unknown as typeof fetch);
    const scoped = store.withPrefix("bw:dist:ai:");

    expect(scoped).not.toBe(store);
    expect(scoped.prefix).toBe("bw:dist:ai:");
  });
});

describe("createRateLimitStore", () => {
  it("uses Redis when both credentials are configured", () => {
    const store = createRateLimitStore(
      makeConfig({
        rateLimitRedisRestUrl: "https://redis.example.com",
        rateLimitRedisRestToken: "token",
        rateLimitMode: "distributed-redis",
      })
    );
    expect(store).toBeInstanceOf(RedisRestRateLimitStore);
  });

  it("uses memory for a single-instance deployment without Redis", () => {
    expect(createRateLimitStore(makeConfig())).toBeInstanceOf(
      MemoryRateLimitStore
    );
  });

  it.each([
    { deploymentTopology: "multi-instance" as const },
    { requireDistributedRateLimit: true },
  ])("fails closed for production without required Redis", (overrides) => {
    expect(() =>
      createRateLimitStore(makeConfig({ nodeEnv: "production", ...overrides }))
    ).toThrow(DistributedRateLimitUnavailableError);
  });
});

describe("MemoryRateLimitStore", () => {
  it("counts, decrements, resets a key, and resets all keys", async () => {
    const store = new MemoryRateLimitStore();
    store.init(options);

    expect((await store.increment("client-1")).totalHits).toBe(1);
    expect((await store.increment("client-1")).totalHits).toBe(2);
    await store.decrement("client-1");
    expect((await store.increment("client-1")).totalHits).toBe(2);
    await store.resetKey("client-1");
    expect((await store.increment("client-1")).totalHits).toBe(1);
    await store.resetAll();
    expect((await store.increment("client-1")).totalHits).toBe(1);
  });

  it("expires a bucket after its configured window", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryRateLimitStore();
      store.init(options);
      expect((await store.increment("client-1")).totalHits).toBe(1);
      vi.advanceTimersByTime(60_001);
      expect((await store.increment("client-1")).totalHits).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes expired buckets after the map exceeds its bound", async () => {
    const staleHits = new Map(
      Array.from({ length: 5_001 }, (_, index) => [
        `old:${index}`,
        { totalHits: 1, resetAtMs: Date.now() - 1 },
      ])
    );
    const store = new MemoryRateLimitStore({ sharedHits: staleHits });
    store.init(options);

    await store.increment("fresh");

    expect(staleHits.size).toBe(1);
    expect(staleHits.has("bw:rl:fresh")).toBe(true);
  });
});
