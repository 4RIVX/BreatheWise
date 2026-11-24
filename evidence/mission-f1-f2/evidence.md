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

3. **CORS & Rate Limiting**:
   - Exact origin allowlist enforced (`allowedOrigins`); wildcard Cloud Run regexes removed from `server/app.ts`.
   - Multi-instance rate limiting implemented with unshared instances for API and AI limiters using `MemoryRateLimitStore` and `RedisRestRateLimitStore`.

4. **Prompt-Injection Protection**:
   - Trusted system instructions strictly separated from untrusted user queries using cryptographic boundary nonces and control-character filtering in `server/services/aiContext.ts`.

5. **Community Report Privacy**:
   - Public `/smogReports/{reportId}` documents omit `authorUid` and email PII. Ownership isolated to `/smogReports/{reportId}/private/owner`.
   - Concurrency-safe Firestore transactions (`runTransaction`) manage atomic report confirmations.

6. **Image Security**:
   - Sharp binary decoding/re-encoding (`server/utils/imageSanitizer.ts`) enforces MIME type validation, max dimensions (4096px), pixel bombs (16 MP), animated image rejection, polyglot checks, EXIF/GPS metadata stripping, and WebP thumbnail conversion (< 56 KB).
   - `sharp: "^0.33.5"` explicitly declared in `package.json`.

7. **Authentication & Error Privacy**:
   - Strict identity checks: `decoded && decoded.email_verified === true` enforced in both middleware and photo upload handler. Missing `email_verified` is treated as false.
   - Operational logs sanitized to redact email addresses, UIDs, and tenant tokens.

---

## 2. F2 Scientific Accuracy & Environmental Intelligence Status

8. **Indian National AQI Engine & CPCB Averaging**:
   - Implemented official CPCB methodology (`src/domain/indianAqi.ts`) with correct pollutant breakpoints, 24-hour averaging for PM2.5/PM10/NO2/SO2/NH3/Pb, 8-hour averaging for CO and O3, minimum 16-hour data completeness criteria, requirement for at least 3 valid pollutants including PM2.5 or PM10, and highest sub-index calculation.
   - `isAveragedPeriodValid` is conditionally computed in `cpcbProvider.ts` based on physical plausibility limits, consistency between minimum, average, and maximum bounds (`p.min <= p.avg && p.avg <= p.max`), and valid timestamp presence.

9. **CPCB Station Selection & Freshness Ranking**:
   - Implemented multi-criteria ranking in `verifiedAirContextBuilder.ts`: stations with calculable AQI, fresh measurements (< 180 min), closer geographic proximity (Haversine formula), lower age, and higher pollutant coverage are prioritized.

10. **CPCB Pagination**:
    - Implemented offset/limit pagination loop in `cpcbProvider.ts` to retrieve complete station listings without truncating at a single page of 100 records.

11. **Open-Meteo Forecast Validation**:
    - Validates timestamp ordering, duplicates, missing hours, and null observations.
    - Forecast window computation in `openMeteoProvider.ts` checks that consecutive hours have an exact 1-hour time gap (`t2 - t1 === 3600000ms`), preventing artificial consecutive windows across missing timestamps. Labelled as `"Lowest Modelled PM2.5 Forecast Window"`.

12. **Environmental Impact & Routine Savings**:
    - Removed arbitrary predefined savings (2.1 kg, 1.4 kg, 0.4 kg, 1.8 kg) from `defaultRoutines.ts`. Routines initialize to 0.0 kg and calculate dynamically when user commute distance and transport mode parameters are supplied.
    - Distinguishes CO, CO2, CO2e, passenger-km, and vehicle-km.

13. **Emission Factor Traceability**:
    - Every factor in `EMISSION_FACTORS_INDIA` (`ecoImpact.ts`) includes direct source URLs, publishers (WRI India, CEA, IPCC, DMRC, ARAI), publication years, page/table references (e.g., Table 4.2, Table 1.1), pollutant scopes (CO2 vs CO2e), calculation methods, and geographic applicability.

14. **Indoor Air Quality Science**:
    - Volume calculations ($L \times W \times H$), required CADR ($Volume \times Target ACH$), effective ACH ($CADR / Volume$), and CFM / $\text{m}^3\text{/h}$ conversions fully validated in `src/domain/indoorAir.ts`.

---

## 3. Verification & Test Results

- **Vitest Unit & Integration Tests**: **54/54 tests passed** across all 8 test files (`tests/unit/*`, `tests/integration/api.test.ts`).
- **Node 22 Pure Logic Tests**: **1/1 passed** (`src/domain/pureLogic.node-test.ts`).
- **TypeScript Typecheck & ESLint (`npm run lint`)**: **Pass** (`tsc --noEmit && eslint .` returned 0 errors).
- **Production Build (`npm run build`)**: **Pass** (`vite build` completed successfully).
- **Repository Size**: **5.1 MB** (< 10 MB limit).
- **Branch Count**: **1** (`main` only).
