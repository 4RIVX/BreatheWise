# BreatheWise — Mission F1 & F2 Independent Verification Evidence

Date: 2026-11-24
Workspace Branch Policy: Single working codebase (non-git extracted archive; no new branches created)
Firebase Project: `data-blend-vc62s` / Database: `ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb`

Status Legend (strictly bounded):
- `IMPLEMENTED`: Source code implemented and audited in workspace
- `TESTED`: Verified by automated unit, integration, or UI tests
- `LIVE-VERIFIED`: Verified against running local/upstream service or headless Chromium
- `NOT RUN`: Command or tool unavailable in container (reason noted)
- `BLOCKED`: External upstream endpoint unreachable or temporarily unavailable in sandbox
- `NOT VERIFIED`: Condition not verified live

---

## 1. Mission F1 — Security & Data Integrity Status

| Item | Summary & Files | Status |
|---|---|---|
| F1.1 Production Distributed Rate Limiting | `loadServerConfig` (`server/config.ts`) and `createRateLimitStore` (`server/utils/rateLimitStore.ts`) require `RATE_LIMIT_REDIS_REST_URL` and `RATE_LIMIT_REDIS_REST_TOKEN` in `NODE_ENV=production` and throw at startup if absent. `RedisRestRateLimitStore` uses `AbortController` timeouts (`finally { clearTimeout(timer); }`), validates pipeline arrays, per-command `error` fields, counters, and TTLs, and converts all errors across `increment`, `decrement`, and `resetKey` to `DistributedRateLimitUnavailableError` -> HTTP `503` (`RATE_LIMIT_STORE_UNAVAILABLE`). `app.set("trust proxy", 1)` + `req.ip` defeat left-most `X-Forwarded-For` spoofing; `bw:dist:api:` and `bw:dist:ai:` prefixes isolate buckets. | `IMPLEMENTED`, `TESTED` |
| F1.2 Lockfile & `.gitignore` Hygiene | `package.json` and `bun.lock` declare matching `sharp@^0.33.5` and `typescript@^5.9.3`. Verified via `bun install --frozen-lockfile` (Bun v1.4.4, 551 installs checked, exit 0). `.gitignore` updated to exclude `node_modules/`, `dist/`, `.vite/`, `.env*` (keeping `!.env.example`), `*service-account*.json`, `.firebase/`, `emulator-data/`, `firebase-export-*`, logs, `.playwright-cli/`, and `coverage/`. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |
| F1.3 Gemini Model Configuration & Orchestration | `.env.example` and `server/config.ts` default `GEMINI_MODEL=gemini-4-hydrogen` and reject explicitly blank `GEMINI_MODEL` / `GROQ_MODEL` in production. Active container runtime injects `GEMINI_MODEL=gemini-3.8-flash` and `GROQ_MODEL=openai/gpt-oss-20b` (observed on live `/api/health`). On live `POST /api/gemini/guidance`, primary Gemini (`gemini-3.8-flash`) returned upstream `HTTP 503 UNAVAILABLE` and cleanly triggered live fallback to Groq (`openai/gpt-oss-20b`). | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` (Health & Groq Fallback) / `BLOCKED` (Live Gemini 503) |
| Server-Verified Air Context & Injection Defense | `server/services/verifiedAirContextBuilder.ts` ignores forged client AQI/station payloads; `server/services/aiContext.ts` isolates untrusted user text with cryptographic nonces and URL/tag stripping identically across Gemini and Groq. | `IMPLEMENTED`, `TESTED` |
| Community PII Isolation, Atomic Confirmations, Image Sanitizer & Email Verification | `firestore.rules`, `src/firebase/firestoreService.ts`, `server/utils/imageSanitizer.ts` (`sharp` decode -> WebP EXIF strip), and `server/app.ts` (`email_verified === true`) enforce strict authorization and privacy boundaries. | `IMPLEMENTED`, `TESTED` |

---

## 2. Mission F2 — Scientific Accuracy & Environmental Intelligence Status

| Item | Summary & Files | Status |
|---|---|---|
| F2.1–F2.3 CPCB 16-Hour Rule, Units & OpenAQ v3 Hourly Integration | `src/domain/indianAqi.ts` enforces `>= 16` hourly observations for all criteria pollutants (24h means and 24h max-8h rolling averages via `computeMax8HourRollingAverageOver24Hours` for CO and O3), rejects missing `sampleHoursCount`, and marks future timestamps (`> maxFutureSkewMinutes`) stale. `server/providers/openAqProvider.ts` queries OpenAQ v3 `/v3/locations` and `/v3/sensors/{id}/hours` to compute real hourly Indian AQI (`OPENAQ_API_KEY` not set in container -> live OpenAQ `NOT VERIFIED`). `server/providers/cpcbProvider.ts` normalizes explicit `pollutant_unit` values, rejects missing/unknown units, and enforces per-record freshness & `<= 60 min` cross-pollutant alignment. Live CPCB (`api.data.gov.in`) returned `ECONNREFUSED` in sandbox. | `IMPLEMENTED`, `TESTED` / Live Upstreams: CPCB `BLOCKED`, OpenAQ `NOT RUN` (no key configured) |
| F2.4 CPCB Pagination Integrity | `server/providers/cpcbProvider.ts` deduplicates records across paginated pages using `(state, city, station, pollutant_id, last_update)`, frees fetch timers in `finally`, and sets `isPaginationComplete = false` on failed pages, unique-record shortfalls vs `total`, or `maxOffset` (`2500`) truncation when `total` is omitted. | `IMPLEMENTED`, `TESTED` |
| F2.5 Open-Meteo Validation & Protection Planner | `server/providers/openMeteoProvider.ts` enforces strictly increasing 1h timestamps, aligned `current.time` (no index-24 fallback), `current.time` staleness rejection in `verifiedAirContextBuilder.ts`, and `>= 16h` rolling bounds without backfilling gaps. `src/domain/protectionPlanner.ts` removes hardcoded `"12:30 – 15:30"` and unconditional `"midday hours"` wording and cites O3/NO2 + model uncertainty caveats. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |
| F2.6 Emission Factor Traceability, CO2 Scope & CEA v22.0 | `src/domain/ecoImpact.ts` uses WRI India 2015 CO2 factors (`auto_cng = 0.10768`, `suburban_rail = 0.007976`, `city_bus_diesel = 0.015161`) and CEA CO2 Baseline Database v22.0 (`0.675 kg CO2/kWh`: `car_ev = 0.108`, `city_bus_electric = 0.017`, `metro_rail = 0.023`), all typed `ghgMetric: "CO2"` with `sourceUrl`, `publisher`, `publicationYear`, and `pageOrTableRef`. `calculateEcoImpact` refuses to subtract incompatible `CO2` vs `CO2e` scopes (`emissionsAvoidedKg: null`, `isScopeIncompatible: true`), rendered safely in `src/components/EcoMobilityTracker.tsx` with clickable source links. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |
| F2.7 Indoor Air Science & Safe Ventilation | `src/components/IndoorAirCoach.tsx` details HEPA `>= 99.97%` @ `0.3 um` particulate-only limits, activated carbon dependence on sorbent medium/bed mass/capacity, inability of ordinary carbon filters to reliably remove CO, certified CO alarms and vented combustion-source safety, real-world factors (purifier performance, room air leakage, unit placement, filter condition, room air mixing), illustrative 3–6 ACH sizing benchmarks without CDC/NIOSH/ASHRAE rule attribution, and condition-based ventilation without `"midday convective mixing"`. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |

---

## 3. Executed Verification Commands & Observed Results

| Check | Command | Outcome | Notes |
|---|---|---|---|
| Frozen Lockfile Parity | `bun install --frozen-lockfile` | **Passed** | Bun v1.4.4 (`Checked 551 installs across 630 packages (no changes)`). |
| Unit, UI & Integration Tests | `bun run test` | **72/72 Passed** | 8 Vitest test files (`vitest v5.1.1`). |
| Node Pure Logic Test | `npx --yes tsx --test src/domain/pureLogic.node-test.ts` | **1/1 Passed** | Independent Node `node:test` verification of AQI, Indoor ACH, and Eco Impact. |
| TypeScript & ESLint | `tsc --noEmit && eslint .` | **Passed** | 0 errors across client, server, and Firestore rules ESLint config. |
| Formatter Check | `bun run format:check` | **Passed** | Prettier clean across all TS/TSX files. |
| Production Build | `bun run build` | **Passed** | `vite build` clean in `1.10s`. |
| Bundle Size Check | `du -sh --exclude=node_modules --exclude=dist .` | **3.3 MB** | Well below 10 MB competition threshold. |
| Dependency Security Audit | `bun audit` | **Completed (5 findings)** | `sharp@0.33.5` pinned per lockfile parity requirement; nested `@grpc/grpc-js` via Firebase SDKs. |
| Live Local Server & Browser UI | `curl /api/health`, `/api/air-quality`, `/api/gemini/guidance` & `playwright-cli` (`1440x900`) | **LIVE-VERIFIED (0 console errors)** | Open-Meteo `LIVE-VERIFIED` (`AQI 68`/`126`); CPCB `BLOCKED` (`ECONNREFUSED`); Gemini `503` triggered live Groq fallback (`openai/gpt-oss-20b`); DOM confirmed updated IndoorAirCoach, EcoMobilityTracker links, and no CDC/ASHRAE/midday text. |
| Test Coverage Report | `npx --no vitest run --coverage` | `NOT RUN` | `@vitest/coverage-v8` dependency is not installed in workspace. |
| Firebase Emulator Suite | `which firebase` / `test -f firebase.json` | `NOT RUN` | `firebase` CLI and `firebase.json` are absent from container; rules linted with `@firebase/eslint-plugin-security-rules`. |
