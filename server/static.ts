import express from "express";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function createStaticMiddleware(distPath: string) {
  const assetsPath = path.join(distPath, "assets");
  const indexPath = path.join(distPath, "index.html");
  const assetsAvailable =
    existsSync(assetsPath) &&
    statSync(assetsPath).isDirectory() &&
    readdirSync(assetsPath).length > 0;
  const indexHtml = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : null;
  const router = express.Router();

  if (assetsAvailable) {
    router.use(
      "/assets",
      express.static(assetsPath, {
        immutable: true,
        maxAge: "1y",
      })
    );
  }

  router.use(
    express.static(distPath, {
      index: false,
      setHeaders(response) {
        response.setHeader("Cache-Control", "no-cache");
      },
    })
  );

  router.get(/(.*)/, (request, response) => {
    if (request.path === "/api" || request.path.startsWith("/api/")) {
      response.status(404).json({ error: "API endpoint not found" });
      return;
    }

    if (!assetsAvailable || indexHtml === null) {
      response
        .status(503)
        .type("text")
        .send("Application assets are unavailable.");
      return;
    }

    response.setHeader("Cache-Control", "no-cache");
    response.type("html").send(indexHtml);
  });

  return router;
}
