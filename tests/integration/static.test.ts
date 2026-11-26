import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { createStaticMiddleware } from "../../server/static.ts";

const temporaryDirectories: string[] = [];

function createBuildDirectory() {
  const distPath = mkdtempSync(path.join(process.cwd(), ".tmp-static-test-"));
  temporaryDirectories.push(distPath);
  return distPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("production static middleware", () => {
  it("serves the cached SPA document with revalidation headers", async () => {
    const distPath = createBuildDirectory();
    const assetsPath = path.join(distPath, "assets");
    mkdirSync(assetsPath);
    writeFileSync(path.join(assetsPath, "app.js"), "export {};");
    writeFileSync(
      path.join(distPath, "index.html"),
      "<!doctype html><title>App</title>"
    );
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/dashboard");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<title>App</title>");
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("serves built assets as immutable for one year", async () => {
    const distPath = createBuildDirectory();
    const assetsPath = path.join(distPath, "assets");
    mkdirSync(assetsPath);
    writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
    writeFileSync(path.join(assetsPath, "app-abc123.js"), "export {};");
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/assets/app-abc123.js");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("public");
    expect(response.headers["cache-control"]).toContain("max-age=31536000");
    expect(response.headers["cache-control"]).toContain("immutable");
  });

  it("serves root-level public files with revalidation caching", async () => {
    const distPath = createBuildDirectory();
    const assetsPath = path.join(distPath, "assets");
    mkdirSync(assetsPath);
    writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
    writeFileSync(path.join(assetsPath, "app-abc123.js"), "export {};");
    writeFileSync(path.join(distPath, "favicon.ico"), "icon");
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/favicon.ico");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("returns JSON 404 responses for unknown API routes", async () => {
    const distPath = createBuildDirectory();
    mkdirSync(path.join(distPath, "assets"));
    writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "API endpoint not found" });
  });

  it("returns 503 instead of a placeholder when build assets are missing", async () => {
    const distPath = createBuildDirectory();
    writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/");

    expect(response.status).toBe(503);
    expect(response.text).toContain("Application assets are unavailable.");
  });

  it("returns 503 when the assets directory exists but is empty", async () => {
    const distPath = createBuildDirectory();
    mkdirSync(path.join(distPath, "assets"));
    writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/");

    expect(response.status).toBe(503);
  });

  it("returns 503 when assets exist but the SPA document is missing", async () => {
    const distPath = createBuildDirectory();
    const assetsPath = path.join(distPath, "assets");
    mkdirSync(assetsPath);
    writeFileSync(path.join(assetsPath, "app-abc123.js"), "export {};");
    const app = express().use(createStaticMiddleware(distPath));

    const response = await request(app).get("/");

    expect(response.status).toBe(503);
  });
});
