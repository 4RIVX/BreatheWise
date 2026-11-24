# BreatheWise — Mission F1 & F2 Evaluation Evidence Record

Timestamp: 2026-11-24T05:50:00Z
Repository: BreatheWise (Public, main branch)
Firebase Project: `data-blend-vc62s` / `ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb`

---

## 1. F1 Security & Data Integrity Remediation Status

1. **Server-Verified Environmental Context**:
   - Implemented in `server/services/verifiedAirContextBuilder.ts`.
   - Client submission of forged AQI, fake station IDs, or manufactured measured availability flags is completely ignored and overwritten by server-side CPCB and Open-Meteo providers.
   - Station selection does not accept the first station blindly: prioritizes calculable CPCB AQI, freshness, Haversine geographic proximity to the user's validated coordinates, age, and pollutant count.
   - Adversarial tests confirm injected AQI values have zero influence on AI guidance or Q&A responses.

2. **AI Provider & Fallback Configuration**:
   - Configured `AI_PROVIDER=gemini` and `AI_FALLBACK_PROVIDER=groq` in `server/config.ts`.
   - Fallback is strictly restricted to defined provider availability failures: HTTP 429, 503, timeouts, and network failures. Configuration errors and validation failures are not masked.
   - Both providers use identical normalized Zod-validated response schemas (`GuidanceResponseSchema` and `AskResponseSchema`).

3. **CORS, Proxy IP & Fail-Closed Distributed Rate Limiting**:
   - Exact origin allowlist enforced (`allowedOrigins`); wildcard Cloud Run regexes removed from `server/app.ts`.
   - `app.set("trust proxy", 1)` and `req.ip || req.socket.remoteAddress || "unknown"` ensure rate limit keys reflect the real client IP from `X-Forwarded-For` rather than the proxy socket IP.
   - `RedisRestRateLimitStore` uses unshared `bw:dist:api:` / `bw:dist:ai:` prefixes, removes any silent memory fallback, and fails closed with HTTP `503` (`RATE_LIMIT_STORE_UNAVAILABLE`) when Redis is unreachable or errors.

4. **Prompt-Injection Protection**:
   - Trusted system instructions strictly separated from untrusted user queries using cryptographic boundary nonces and control-character filtering in `server/services/aiContext.ts`.

5. **Community Report Privacy**:
   - Public `/smogReports/{reportId}` documents omit `authorUid` and email PII. Ownership isolated to `/smogReports/{reportId}/private/owner`.
   - Concurrency-safe Firestore transactions (`runTransaction`) manage atomic report confirmations.

6. **Image Security**:
   - Sharp binary decoding/re-encoding (`server/utils/imageSanitizer.ts`) enforces MIME type validation, max dimensions (4096px), pixel bombs (16 MP), animated image rejection, polyglot checks, EXIF/GPS metadata stripping, and WebP thumbnail conversion (< 56 KB).
   - `sharp: "^0.33.5"` explicitly declared in `package.json` and resolved in `bun.lock`.

7. **Authentication & Error Privacy**:
   - Strict identity checks: `decoded && decoded.email_verified === true` enforced in both middleware and photo upload handler. Missing `email_verified` is treated as false.
   - Operational logs sanitized to redact email addresses, UIDs, and tenant tokens.

---

## 2. F2 Scientific Accuracy & Environmental Intelligence Status

8. **Indian National AQI Engine & CPCB Observation Completeness**:
   - Official CPCB methodology (`src/domain/indianAqi.ts`) enforces exact breakpoints, 24h/8h averaging periods, minimum 3 valid pollutants including PM2.5 or PM10, and **mandatory** `sampleHoursCount` (`>= 16h` of 24h or `>= 6h` of 8h)—never bypassing observation checks when `sampleHoursCount` is omitted.
   - `cpcbProvider.ts` parses `sample_hours` / `valid_hours` / `observation_hours` and sets `isAveragedPeriodValid` to `true` only when physical plausibility, `min <= avg <= max`, valid timestamp, and verified observation count all hold.

9. **CPCB Station Selection, Freshness & Pagination Rejection**:
   - `verifiedAirContextBuilder.ts` restricts eligible stations strictly to `!s.stale && s.indianAqi.calculable && s.indianAqi.aqi !== null`—even when `preferredStationName` is provided—and ranks eligible stations by Haversine distance, age, and pollutant coverage.
   - When `cpcb.isPaginationComplete === false` (upstream HTTP/parse failure or `totalRecordsReported` truncation), `verifiedAirContextBuilder.ts` withholds measured AQI claims (`measuredSourceAvailable: false`) and reports explicit limitation reasons.

10. **CPCB Pagination & Total Count Tracking**:
    - Offset/limit pagination loop (`maxOffset = 2500`) in `cpcbProvider.ts` tracks HTTP failures (`paginationFailed`), `total` records reported from data.gov.in, and `isPaginationComplete`.

11. **Open-Meteo Forecast Continuity, Rolling Windows & Timestamp Alignment**:
    - Strict Zod `.superRefine` rejects duplicate timestamps, non-chronological hours, mismatched array lengths, and gaps (`Hourly timestamps must be exactly 1 hour apart`).
    - Rolling 24h/8h averages use `computeTimeBoundedRollingAverage`, strictly bounding samples by timestamp `[endMs - (windowHours - 1) * 3_600_000, endMs]`.
    - Weather series (`wind_speed_10m`, `boundary_layer_height`) are matched to air-quality timestamps via `weatherByTime` `Map` lookup rather than raw array index.

12. **CO2 vs CO2e Accounting & Predefined Routine Savings**:
    - `ecoImpact.ts` explicitly separates `ghgMetric` (`"CO2"` vs `"CO2e"` vs `"ZERO"`), keeping CO2-only factors (`city_bus_diesel` `0.015161 kg CO2/p-km`, `metro_rail`, `car_ev`, `city_bus_electric`) labeled accurately as `CO2` and flagging mixed-scope comparisons with `CO2 / CO2e (mixed scope)` and `scopeWarning`.
    - Removed arbitrary predefined savings (`2.1 kg`, `1.4 kg`, `0.4 kg`, `1.8 kg`) from `defaultRoutines.ts`; routines initialize to `0.0`.

13. **Emission Factor Traceability**:
    - Every factor in `EMISSION_FACTORS_INDIA` (`ecoImpact.ts`) includes direct source URLs, publishers (WRI India, CEA, IPCC, DMRC, ARAI), publication years, page/table references, pollutant scope, calculation methods, and limitations.

14. **Indoor Air Quality Science**:
    - Volume ($L \times W \times H$), required CADR, effective ACH, and CFM / $\text{m}^3\text{/h}$ conversions validated in `src/domain/indoorAir.ts`.
    - `IndoorAirCoach.tsx` accurately distinguishes portable HEPA 3–6 ACH particulate decay sizing benchmarks during smog episodes from ASHRAE 62.2 minimum outdoor-air ventilation rates and CDC/NIOSH infectious-aerosol dilution targets, notes HEPA limits against gaseous VOCs/CO (requiring activated carbon), and warns against ozone-generating cleaners.

---

## 3. Verification & Test Results

- **Vitest Unit & Integration Tests (`npm test`)**: **62/62 tests passed** across all 8 test files (`tests/unit/*`, `tests/ui/components.test.tsx`, `tests/integration/api.test.ts`).
- **Node 22 Pure Logic Tests (`npx --yes tsx --test src/domain/pureLogic.node-test.ts`)**: **1/1 passed**.
- **TypeScript Typecheck & ESLint (`npm run lint`)**: **Pass** (`tsc --noEmit && eslint .`, `0` errors).
- **Production Build (`npm run build`)**: **Pass** (`vite build` completed successfully).
