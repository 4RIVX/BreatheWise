# BreatheWise Engineering & Verification Report

## 1. Architecture & Integration Summary

- **Frontend**: React 19, TypeScript (strict mode), Vite, Tailwind CSS, Lucide React, English + Tamil (`EN` / `தமிழ்`) localization (`src/domain/i18n.ts`).
- **Backend**: Node.js 22 (`node server.ts` compatible without compilation step), Express 5, Helmet, strict CORS allowlist, `express-rate-limit`, Zod request/response validation, and server-side TTL caching (`server/utils/cache.ts`).
- **Firebase**:
  - Provisioned via native AI Studio Firebase integration (`projectId: "data-blend-vc62s"`, database `"ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb"`, region `"asia-south1"`).
  - Hardened Eight-Pillars `firestore.rules` linted with `@firebase/eslint-plugin-security-rules` and deployed via `DeployRules`.
  - Server-side ID token verification (`server/firebaseAdmin.ts`) protects `/api/uploads/smog-photo`, strictly requiring `email_verified === true`.
- **Air-Quality Providers**:
  - Primary measured provider: CPCB / `data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` with offset/limit pagination (up to `maxOffset = 2500`), non-OK HTTP page tracking (`isPaginationComplete`), physical plausibility & min/max consistency checks, and mandatory `sample_hours` validation (`calculateIndianAqi` enforces `>= 16h` for 24h / `>= 6h` for 8h and rejects records lacking hourly observation counts instead of guessing).
  - Secondary modelled provider: Open-Meteo Air Quality & Weather API, displayed separately as atmospheric simulation. Strict 1-hour step continuity is enforced across schemas, rolling 24h/8h averages are time-bounded (`computeTimeBoundedRollingAverage`), and weather fields are matched by timestamp key rather than raw array index.
- **AI Provider & Orchestration (Mission F1)**:
  - Configurable primary provider (`AI_PROVIDER=gemini` or `groq`) and fallback provider (`AI_FALLBACK_PROVIDER=groq`), restricted to availability errors (429, 503, timeouts).
  - Server-verified air context builder (`server/services/verifiedAirContextBuilder.ts`) strictly filters stations to fresh (`<= 180 min`), calculable AQI stations with complete pagination (`isPaginationComplete !== false`), prioritizing proximity (Haversine distance), age, and pollutant count—never bypassing freshness or calculability via `preferredStationName`.
  - Multi-turn untrusted user query isolation with cryptographically secure boundary nonces against prompt injection.

## 2. Security & Privacy Controls Verified (Mission F1)

- **CORS Allowlist**: Wildcard patterns removed; exact allowed origins enforced in production.
- **Distributed Rate Limiting & Proxy IP Extraction**: `trust proxy` (`1`) resolves client IPs via `req.ip` before falling back to `req.socket.remoteAddress`. When Upstash Redis REST is configured, `RedisRestRateLimitStore` uses unshared `api:` / `ai:` prefixes and fails closed with HTTP `503` (`RATE_LIMIT_STORE_UNAVAILABLE`) on store outages rather than silently falling back to per-instance memory.
- **Community Report PII Isolation**: Public `smogReports/{reportId}` documents omit `authorUid` and private PII entirely. Ownership metadata (`authorUid`) is isolated to `/smogReports/{reportId}/private/owner`.
- **Atomic Confirmations**: Report confirmation counts are updated via Firestore transactions (`runTransaction`) preventing lost increments and duplicate confirmations.
- **Image Security**: Full binary decode and re-encoding via `sharp` (`server/utils/imageSanitizer.ts`) supporting JPEG, PNG, and WebP, stripping EXIF/GPS metadata, rejecting animated images, polyglots, and pixel bombs. Declared in both `package.json` and `bun.lock`.
- **Error Log Privacy**: `src/firebase/errorHandling.ts` sanitizes operational logs to redact email addresses, UIDs, and tenant tokens.
- **Email Verification**: Strictly requires `email_verified === true`. Missing `email_verified` is never treated as verified.

## 3. Scientific Accuracy Improvements (Mission F2)

- **Indian National AQI Engine**: Official CPCB 2014 methodology (`src/domain/indianAqi.ts`) with exact breakpoints, 24h/8h averaging periods, mandatory hourly sample count completeness (`16h/24h` or `6h/8h`), minimum 3 valid pollutants including PM2.5 or PM10, and max sub-index calculation.
- **CO2 vs CO2e Accounting & Traceability**: Every factor in `EMISSION_FACTORS_INDIA` (`src/domain/ecoImpact.ts`) includes `ghgMetric` (`"CO2"`, `"CO2e"`, or `"ZERO"`), direct source URLs, publishers, publication years, and page/table references (`city_bus_diesel` at `0.015161 kg CO2/p-km`, `metro_rail`, `car_ev`, `city_bus_electric` explicitly tagged as `CO2`). Mixed-scope comparisons display a `CO2 / CO2e (mixed scope)` label and scope warning.
- **Zeroed Predefined Routine Savings**: Default clean-air routines in `defaultRoutines.ts` initialize to `0.0`, avoiding arbitrary unsupported numbers. Savings are calculated only when user trip distance and transport mode parameters are supplied.
- **Indoor Air Science**: Strict $L \times W \times H$ room volume, CADR, ACH, and CFM / $\text{m}^3\text{/h}$ conversions validated in `src/domain/indoorAir.ts`. `IndoorAirCoach.tsx` accurately distinguishes portable HEPA 3–6 ACH particulate decay sizing benchmarks during smog episodes from ASHRAE 62.2 minimum outdoor-air ventilation rates and CDC/NIOSH infectious-aerosol dilution guidance, plus HEPA mechanical limits (particles vs gaseous VOCs/CO) and ozone-cleaner warnings.
- **Open-Meteo & CPCB Upstream Validation**: Zod `.superRefine` on Open-Meteo schemas enforces strictly increasing timestamps with exact 1-hour spacing, duplicate rejection, and array length consistency. CPCB provider tracks `totalRecordsReported` and `isPaginationComplete` across pages.

## 4. Verified Commands & Results

- **Vitest Unit & Integration Tests (`npm test`)**: `8 test files passed`, `62/62 tests passed` (including `tests/unit/securityAndPrivacy.test.ts`, `tests/unit/ecoImpact.test.ts`, `tests/unit/indianAqi.test.ts`, `tests/ui/components.test.tsx`, and `tests/integration/api.test.ts`).
- **Node 22 Pure Logic Tests (`npx --yes tsx --test src/domain/pureLogic.node-test.ts`)**: `1/1 passed`.
- **TypeScript & ESLint (`npm run lint`)**: `Pass` (`tsc --noEmit && eslint .`, `0` errors).
- **Production Build (`npm run build`)**: `Pass` (`vite build` completed cleanly).
