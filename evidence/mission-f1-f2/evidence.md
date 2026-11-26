# BreatheWise — Mission F1 & F2 Independent Verification Evidence

Date: 2026-11-26
Workspace Branch Policy: Single working codebase (no new branches created)
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
| F1.1 Production Distributed Rate Limiting | `loadServerConfig` (`server/config.ts`) and `createRateLimitStore` (`server/utils/rateLimitStore.ts`) require `RATE_LIMIT_REDIS_REST_URL` and `RATE_LIMIT_REDIS_REST_TOKEN` in `NODE_ENV=production` and fail startup if absent. `RedisRestRateLimitStore` enforces `AbortController` timeouts (`finally { clearTimeout(timer); }`), validates pipeline arrays, per-command `error` fields, counters, and TTLs, and converts all errors across `increment`, `decrement`, and `resetKey` to `DistributedRateLimitUnavailableError` -> HTTP `503` (`RATE_LIMIT_STORE_UNAVAILABLE`). `app.set("trust proxy", 1)` + `req.ip` prevent left-most `X-Forwarded-For` spoofing; `bw:dist:api:` and `bw:dist:ai:` isolate buckets. | `IMPLEMENTED`, `TESTED` |
| F1.2 Sharp Security Upgrade, Lockfile Parity & `.gitignore` Hygiene | Upgraded `sharp` to `^0.35.5`, pinned transitive `@grpc/grpc-js` to `1.14.7`, split runtime and development dependencies, and added `.idea/` and cloud-log exclusions to `.gitignore`. `bun audit` reports no known vulnerabilities. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |
| F1.3 Gemini Model Configuration & Orchestration | `.env.example` and `server/config.ts` default `GEMINI_MODEL=gemini-4-hydrogen` and reject explicitly blank `GEMINI_MODEL` / `GROQ_MODEL` in production. Active container runtime injects `GEMINI_MODEL=gemini-3.8-flash` and `GROQ_MODEL=openai/gpt-oss-20b` (verified on live `/api/health`). Availability-only failover triggers Groq cleanly on transient 503/network failures without swallowing config errors. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` (Health) |
| Server-Verified Air Context & Injection Defense | `server/services/verifiedAirContextBuilder.ts` ignores forged client AQI/station payloads; `server/services/aiContext.ts` isolates untrusted user text with cryptographic nonces and URL/tag stripping identically across Gemini and Groq. | `IMPLEMENTED`, `TESTED` |
| Community PII Isolation, Atomic Confirmations, Image Sanitizer & Email Verification | `firestore.rules`, `src/firebase/firestoreService.ts`, `server/utils/imageSanitizer.ts` (`sharp@0.35.5` decode -> WebP EXIF strip), and `server/app.ts` (`email_verified === true`) enforce strict authorization and privacy boundaries. | `IMPLEMENTED`, `TESTED` |

---

## 2. Mission F2 — Scientific Accuracy & Environmental Intelligence Status

| Item | Summary & Files | Status |
|---|---|---|
| F2.1–F2.3 OpenAQ Provenance, Attribution & Independent Sensor Freshness | `server/providers/openAqProvider.ts` and `server/providers/cpcbProvider.ts` remove `"CPCB / OpenAQ v3 Hourly Monitoring Station"` and label OpenAQ feeds `"OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology"` (`feedOrigin: "openaq_v3"`). `OpenAqLocationSchema` parses `provider`, `owner`, and `licenses` metadata and surfaces upstream attribution in `AirQualityDashboard.tsx`, `schemas.ts`, `verifiedAirContextBuilder.ts`, and `aiContext.ts`. Each OpenAQ sensor is evaluated independently for freshness (`<= 180 min`) and cross-sensor alignment (`<= 60 min` against fresh sensors only); stale or unaligned sensors (e.g., 8h-old PM10 alongside 30m-old PM2.5) are flagged and excluded (`isAveragedPeriodValid: false`) before `calculateIndianAqi`. Live CPCB (`api.data.gov.in`) returned `ECONNREFUSED` in sandbox; `OPENAQ_API_KEY` is unconfigured (`false` on `/api/health`). | `IMPLEMENTED`, `TESTED` / Live Upstreams: CPCB `BLOCKED`, OpenAQ `NOT RUN` (no key configured) |
| F2.4 CPCB Pagination Integrity | `server/providers/cpcbProvider.ts` filters by city (not the unsupported state filter), deduplicates records using `(state, city, station, pollutant_id, last_update)`, frees fetch timers in `finally`, and stops after a `20`-second overall request budget. `isPaginationComplete` compares the raw API record count with `total` and remains false on failed pages or `maxOffset` (`2500`) truncation when `total` is omitted. | `IMPLEMENTED`, `TESTED` |
| F2.5 Open-Meteo Validation & Protection Planner | `server/providers/openMeteoProvider.ts` enforces strictly increasing 1h timestamps, aligned `current.time` (no index-24 fallback), `current.time` staleness rejection in `verifiedAirContextBuilder.ts`, and `>= 16h` rolling bounds without backfilling gaps. `src/domain/protectionPlanner.ts` removes hardcoded `"12:30 – 15:30"` and unconditional `"midday hours"` wording and cites O3/NO2 + model uncertainty caveats. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |
| F2.6 Emission Factor Traceability, CO2 Scope & Illustrative Electricity Separation | `src/domain/ecoImpact.ts` preserves WRI India 2015 CO2 factors (`auto_cng = 0.10768`, `suburban_rail = 0.007976`, `city_bus_diesel = 0.015161`) and CEA v22.0 grid intensity (`0.675 kg CO2/kWh`) with direct `sourceUrl` and `pageOrTableRef`, while explicitly marking electricity-derived vehicle factors (`car_ev`, `city_bus_electric`, `metro_rail`) with `isIllustrativeEstimate: true`, `verifiedGridFactorNote`, and `assumptionNote` stating that vehicle `kWh/km` (`0.16`, `0.88`, `0.034`) and `35`-passenger occupancy are illustrative assumptions not established by CEA. `EcoMobilityTracker.tsx` surfaces `"Illustrative Estimate"` badges and separated assumption notes. Incompatible `CO2` vs `CO2e` subtractions return `emissionsAvoidedKg: null`. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |
| F2.7 Indoor Air Science & Safe Ventilation | `src/components/IndoorAirCoach.tsx` details HEPA `>= 99.97%` @ `0.3 um` particulate-only limits, activated carbon dependence on sorbent medium/bed mass/capacity, inability of ordinary carbon filters to reliably remove CO, certified CO alarms and vented combustion-source safety, real-world factors (purifier performance, room air leakage, unit placement, filter condition, room air mixing), illustrative 3–6 ACH sizing benchmarks without CDC/NIOSH/ASHRAE rule attribution, and condition-based ventilation without `"midday convective mixing"`. | `IMPLEMENTED`, `TESTED`, `LIVE-VERIFIED` |

---

## 3. Executed Verification Commands & Observed Results

| Check | Command | Outcome | Notes |
|---|---|---|---|
| Lockfile Regeneration & Frozen Parity | `bun install --frozen-lockfile` | **Passed** | Bun v1.4.5 frozen check passed (`556 installs across 642 packages, no changes`). |
| Dependency Security Audit | `bun audit` | **Passed (0 vulnerabilities)** | No known advisories across 619 packages. |
| Unit, UI & Integration Tests | Vitest `run --coverage` (Node `22.23.5`) | **169/169 Passed** | 18 Vitest test files; coverage `78.15%` statements, `68.84%` branches, `73.93%` functions, and `80.32%` lines. |
| Firestore Rules Emulator | `bun run test:rules` | **6/6 Passed** | Firestore emulator started locally; adversarial access-control and atomicity cases passed. |
| Node Pure Logic Test | `bun x tsx --test src/domain/pureLogic.node-test.ts` | **2/2 Passed** | Independent Node `node:test` verification. |
| TypeScript & ESLint | `bun run lint` | **Passed** | 0 TypeScript and ESLint errors. |
| Formatter Check | `bun run format:check` | **Passed** | Prettier clean across application, server, and all test/config files. |
| Production Build | `bun run build` | **Passed** | React, Firebase, and app chunks emitted without a chunk-size advisory. |
| Workspace Size Check | `du -sh --exclude=node_modules --exclude=dist .` | **3.5 MB** | Well below 10 MB competition threshold. |
| Live Local Server & Browser UI | `curl /api/health` & `playwright-cli` (`1440x900` desktop + `#mobility`) | **LIVE-VERIFIED (0 console errors)** | Verified live health payload, CPCB unavailable state (`ECONNREFUSED`), Open-Meteo `126 Moderate`, and EcoMobility `"Illustrative Estimate"` + separated CEA grid factor / assumption notes in Chromium (`0` console errors/warnings). |
| Test Coverage Report | Vitest `run --coverage` (Node `22.23.5`) | **Passed** | `78.15%` statements, `68.84%` branches, `73.93%` functions, `80.32%` lines; thresholds enforce a one-percentage-point margin below these measured figures. |
| Firebase Emulator Suite | `bun run test:rules` | **Passed** | Firestore emulator completed all 6 rules tests successfully. |
