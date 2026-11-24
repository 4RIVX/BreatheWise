# BreatheWise Engineering & Evaluation Summary

## 1. Architecture & Verified Capabilities

- **Frontend (`src/`)**: React 19, TypeScript (`^5.9.3`), Vite 8, Tailwind CSS, English & Tamil localization (`src/domain/i18n.ts`).
- **Backend (`server.ts`, `server/`)**: Express 5 on Node.js 22, Helmet, exact-origin CORS allowlist in production (`server/config.ts`), distributed Redis REST rate-limit store (`server/utils/rateLimitStore.ts`), `sharp` (`^0.35.5`) binary image decoding/re-encoding (`server/utils/imageSanitizer.ts`), Zod schemas, and server-side TTL caching.
- **Firebase**: Provisioned project `data-blend-vc62s` (Firestore database `ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb`, `asia-south1`), hardened `firestore.rules` linted with `@firebase/eslint-plugin-security-rules`, and strict `email_verified === true` enforcement in token verification (`server/app.ts`).
- **Environmental Data Separation**:
  - Measured ground stations (`server/providers/cpcbProvider.ts` for `data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`, and `server/providers/openAqProvider.ts` for OpenAQ v3 hourly measurements labelled `"OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology"` with upstream `provider`, `owner`, and `licenses` attribution) are displayed separately from regional simulations (`server/providers/openMeteoProvider.ts`).
  - No synthetic AQI, station counts, or emission savings are fabricated when upstream telemetry is unavailable or incomplete.

## 2. Remediated Mission F1 & F2 Controls

- **F1 Distributed Rate Limiting & Proxy Security**: Production (`NODE_ENV=production`) refuses startup without `RATE_LIMIT_REDIS_REST_URL` and `RATE_LIMIT_REDIS_REST_TOKEN`. `trust proxy = 1` prevents left-most `X-Forwarded-For` header spoofing. `RedisRestRateLimitStore` enforces fetch timeouts (`finally` cleanup), validates pipeline results/TTLs, and fails closed across `increment`, `decrement`, and `resetKey` with HTTP `503` (`RATE_LIMIT_STORE_UNAVAILABLE`).
- **F1 Sharp Upgrade, Lockfile & Git Hygiene**: `sharp` upgraded to `^0.35.5` (remediating `<0.35.5` Sharp high-severity advisories) and `bun.lock` regenerated via `bun install`. `bun install --frozen-lockfile` passes (`Bun v1.4.4`, `sharp@0.35.5` and `typescript@5.9.3` parity); `bun audit` confirms 0 `sharp` advisories (only 2 transitive `@grpc/grpc-js` advisories inside `firebase` / `firebase-admin`). `.gitignore` excludes `.env*` (retaining `!.env.example`), Firebase service accounts, emulator artifacts, logs, build caches, and verification artifacts.
- **F1 AI Model & Fallback Integrity**: `.env.example` and `server/config.ts` default `GEMINI_MODEL=gemini-4-hydrogen` and reject explicitly blank production model strings; container runtime injects `GEMINI_MODEL=gemini-3.8-flash` and `GROQ_MODEL=openai/gpt-oss-20b`. Availability-only failover to Groq triggers cleanly on transient 429/503/network errors, preserving normalized Zod schemas and cryptographic prompt-injection boundaries.
- **F2 Indian National AQI, OpenAQ Freshness & Rolling Windows**: `src/domain/indianAqi.ts` enforces `>= 16` hourly observations across all criteria pollutants (24h averages and 24h max-8h rolling averages via `computeMax8HourRollingAverageOver24Hours` for CO and O3), explicit unit normalization (`parseCpcbUnit`), future-timestamp rejection in `isDataStale`, paginated deduplication & truncation detection in `cpcbProvider.ts`, and `current.time` alignment without index-24 fallbacks in `openMeteoProvider.ts`. In `openAqProvider.ts`, every pollutant sensor is independently verified for freshness (`<= 180 min`) and cross-sensor alignment (`<= 60 min` against fresh sensors), rejecting stale/unaligned sensors before AQI calculation rather than computing station freshness only from the newest sensor.
- **F2 Mobility Emission Scopes & Indoor Air Science**: WRI India 2015 factors (`auto_cng = 0.10768`, `suburban_rail = 0.007976`, `city_bus_diesel = 0.015161`) and CEA v22.0 (`0.675 kg CO2/kWh`) carry `ghgMetric: "CO2"`, direct `sourceUrl` links, and `pageOrTableRef` metadata; electricity-derived vehicle modes (`car_ev`, `city_bus_electric`, `metro_rail`) explicitly separate the verified CEA grid factor (`0.675 kg CO2/kWh`) from illustrative vehicle consumption/occupancy assumptions (`0.16 kWh/km`, `0.88 kWh/km ÷ 35`, `0.034 kWh/p-km`) via `isIllustrativeEstimate: true` and UI attribution badges (`src/domain/ecoImpact.ts`, `src/components/EcoMobilityTracker.tsx`). Incompatible `CO2` vs `CO2e` comparisons return `emissionsAvoidedKg: null`. `src/domain/protectionPlanner.ts` and `src/components/IndoorAirCoach.tsx` cover HEPA limits, carbon capacity limits, inability to remove CO, certified CO alarms, combustion-source safety, real-world CADR/ACH caveats, and condition-based ventilation.

## 3. Verification Status Summary

| Verification Item | Status | Observed Result |
|---|---|---|
| `bun install --frozen-lockfile` | `LIVE-VERIFIED` | Exit 0 (`Checked 548 installs across 634 packages (no changes)`), `sharp@0.35.5` & `typescript@5.9.3`. |
| `bun audit` | `LIVE-VERIFIED` | `0` Sharp vulnerabilities; `2` transitive `@grpc/grpc-js` advisories inside Firebase packages. |
| `bun run test` | `TESTED` | 8 files, `74/74` tests passed. |
| `npx --yes tsx --test src/domain/pureLogic.node-test.ts` | `TESTED` | `1/1` passed. |
| `tsc --noEmit && eslint .` | `TESTED` | Exit 0 (`0` TypeScript / ESLint / Firestore rules lint errors). |
| `bun run build` & `bun run format:check` | `TESTED` | Clean production Vite build (`1.03s`) and Prettier formatting. |
| `du -sh --exclude=node_modules --exclude=dist .` | `LIVE-VERIFIED` | `3.5M` (< 10 MB limit). |
| Live Browser & Local Endpoints (`http://localhost:3000`) | `LIVE-VERIFIED` / `BLOCKED` | Health, Open-Meteo (`AQI 126`), EcoMobility Illustrative Estimate cards, and Playwright Chromium DOM (`0` console errors) `LIVE-VERIFIED`; upstream CPCB `ECONNREFUSED` (`BLOCKED`); live OpenAQ `NOT RUN` (`OPENAQ_API_KEY` unconfigured). |
| Coverage (`vitest --coverage`) & Firebase Emulator | `NOT RUN` | `@vitest/coverage-v8`, `firebase` CLI, and `firebase.json` unavailable in container. |

Detailed per-requirement audit notes are recorded in `evidence/mission-f1-f2/evidence.md`.
