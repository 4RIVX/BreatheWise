# BreatheWise Engineering & Evaluation Summary

## 1. Architecture & Verified Capabilities

- **Frontend (`src/`)**: React 19, TypeScript (`^5.9.3`), Vite 8, Tailwind CSS, English & Tamil localization (`src/domain/i18n.ts`).
- **Backend (`server.ts`, `server/`)**: Express 5 on Node.js 22, Helmet, exact-origin CORS allowlist in production (`server/config.ts`), distributed Redis REST rate-limit store (`server/utils/rateLimitStore.ts`), `sharp` binary image decoding/re-encoding (`server/utils/imageSanitizer.ts`), Zod schemas, and server-side TTL caching.
- **Firebase**: Provisioned project `data-blend-vc62s` (Firestore database `ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb`, `asia-south1`), hardened `firestore.rules` linted with `@firebase/eslint-plugin-security-rules`, and strict `email_verified === true` enforcement in token verification (`server/app.ts`).
- **Environmental Data Separation**:
  - Measured ground stations (`server/providers/openAqProvider.ts` for OpenAQ v3 hourly Indian CPCB/SPCB stations and `server/providers/cpcbProvider.ts` for `data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`) are always displayed separately from regional simulations (`server/providers/openMeteoProvider.ts`).
  - No synthetic AQI, station counts, or emission savings are fabricated when upstream telemetry is unavailable or incomplete.

## 2. Remediated Mission F1 & F2 Controls

- **F1 Distributed Rate Limiting & Proxy Security**: Production (`NODE_ENV=production`) refuses startup without `RATE_LIMIT_REDIS_REST_URL` and `RATE_LIMIT_REDIS_REST_TOKEN`. `trust proxy = 1` prevents left-most `X-Forwarded-For` header spoofing. `RedisRestRateLimitStore` enforces fetch timeouts (`finally` cleanup), validates pipeline results/TTLs, and fails closed across `increment`, `decrement`, and `resetKey` with HTTP `503` (`RATE_LIMIT_STORE_UNAVAILABLE`).
- **F1 Lockfile & Git Hygiene**: `bun install --frozen-lockfile` passes (`Bun v1.4.4`, exact `sharp@^0.33.5` and `typescript@^5.9.3` parity across `package.json` and `bun.lock`). `.gitignore` excludes `.env*` (retaining `!.env.example`), Firebase service accounts, emulator artifacts, logs, build caches, and verification artifacts.
- **F1 AI Model & Fallback Integrity**: `.env.example` and `server/config.ts` default `GEMINI_MODEL=gemini-4-hydrogen` and reject explicitly blank production model strings; container runtime overrides `GEMINI_MODEL=gemini-3.8-flash` and `GROQ_MODEL=openai/gpt-oss-20b`. Availability-only failover to Groq triggers cleanly when Gemini returns transient 429/503/network errors, preserving normalized Zod schemas and cryptographic prompt-injection boundaries.
- **F2 Indian National AQI & Rolling Windows**: `src/domain/indianAqi.ts` enforces `>= 16` hourly observations across all criteria pollutants (24h averages and 24h max-8h rolling averages via `computeMax8HourRollingAverageOver24Hours` for CO and O3), explicit unit normalization (`parseCpcbUnit`, rejecting missing/unknown units), per-record freshness + `<= 60 min` cross-pollutant alignment, future-timestamp rejection in `isDataStale`, paginated deduplication & truncation detection in `cpcbProvider.ts`, and `current.time` alignment without index-24 fallbacks in `openMeteoProvider.ts`.
- **F2 Mobility Emission Scopes & Indoor Air Science**: WRI India 2015 factors (`auto_cng = 0.10768`, `suburban_rail = 0.007976`, `city_bus_diesel = 0.015161`) and CEA v22.0 (`0.675 kg CO2/kWh`: `car_ev = 0.108`, `city_bus_electric = 0.017`, `metro_rail = 0.023`) carry `ghgMetric: "CO2"`, direct `sourceUrl` links, and `pageOrTableRef` metadata; incompatible `CO2` vs `CO2e` comparisons return `emissionsAvoidedKg: null` (`src/domain/ecoImpact.ts`). `src/domain/protectionPlanner.ts` and `src/components/IndoorAirCoach.tsx` eliminate fixed midday ventilation directives and ungrounded CDC/NIOSH/ASHRAE ACH attributions while explicitly noting activated carbon capacity limits, inability to remove CO, certified CO alarms, combustion-source safety, and real-world CADR/ACH factors.

## 3. Verification Status Summary

| Verification Item | Status | Observed Result |
|---|---|---|
| `bun install --frozen-lockfile` | `LIVE-VERIFIED` | Exit 0 (`Checked 551 installs across 630 packages (no changes)`). |
| `bun run test` | `TESTED` | 8 files, `72/72` tests passed. |
| `npx --yes tsx --test src/domain/pureLogic.node-test.ts` | `TESTED` | `1/1` passed. |
| `tsc --noEmit && eslint .` | `TESTED` | Exit 0 (`0` TypeScript / ESLint / Firestore rules lint errors). |
| `bun run build` & `bun run format:check` | `TESTED` | Clean production Vite build (`1.10s`) and Prettier formatting. |
| `du -sh --exclude=node_modules --exclude=dist .` | `LIVE-VERIFIED` | `3.3M` (< 10 MB limit). |
| Live Browser & Local Endpoints (`http://localhost:3000`) | `LIVE-VERIFIED` / `BLOCKED` | Health, Open-Meteo (`AQI 68`/`126`), Groq live fallback, and Playwright Chromium DOM (`0` console errors) `LIVE-VERIFIED`; upstream CPCB `ECONNREFUSED` (`BLOCKED`); upstream Gemini `503` (`BLOCKED`). |
| Coverage (`vitest --coverage`) & Firebase Emulator | `NOT RUN` | `@vitest/coverage-v8`, `firebase` CLI, and `firebase.json` unavailable in container. |

Detailed per-requirement audit notes are recorded in `evidence/mission-f1-f2/evidence.md`.
