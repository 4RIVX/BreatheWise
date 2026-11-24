import express from "express";
import path from "node:path";
import { createApp } from "./server/app.ts";
import { loadServerConfig } from "./server/config.ts";

async function startServer() {
  const config = loadServerConfig();
  const app = createApp({ config });

  if (config.nodeEnv === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
