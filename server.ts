import path from "node:path";
import { createApp } from "./server/app.ts";
import { loadServerConfig } from "./server/config.ts";
import { createStaticMiddleware } from "./server/static.ts";

async function startServer() {
  const config = loadServerConfig();
  const app = createApp({ config });

  if (config.nodeEnv === "production") {
    const distPath = path.join(process.cwd(), "dist");

    app.get("/healthz", (_req, res) => {
      res.status(200).send("OK");
    });

    app.use(createStaticMiddleware(distPath));
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  if (
    config.nodeEnv === "production" &&
    config.rateLimitMode === "single-instance-memory"
  ) {
    console.warn(
      "[BreatheWise] Starting in single-instance memory rate-limit mode. Set DEPLOYMENT_TOPOLOGY=multi-instance with RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN for multi-instance Cloud Run scaling."
    );
  }

  app.listen(config.port, config.host, () => {
    console.log(
      `BreatheWise server listening on http://${config.host}:${config.port}`
    );
  });
}

startServer().catch((err) => {
  console.error("Failed to start BreatheWise server:", err);
  process.exit(1);
});
