import express from "express";
import path from "node:path";
import { createApp } from "./server/app.ts";
import { loadServerConfig } from "./server/config.ts";

async function startServer() {
  const config = loadServerConfig();
  const app = createApp({ config });

  if (config.nodeEnv === "production") {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    const fs = await import("node:fs");

    app.get("/healthz", (_req, res) => {
      res.status(200).send("OK");
    });

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }

    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "API endpoint not found" });
        return;
      }
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`
          <!DOCTYPE html>
          <html>
            <head><title>BreatheWise</title></head>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h1>BreatheWise is starting up...</h1>
              <p>The application assets are building or initializing. Please refresh in a moment.</p>
            </body>
          </html>
        `);
      }
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
