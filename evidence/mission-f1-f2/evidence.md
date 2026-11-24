# BreatheWise — Mission F1 & F2 Evaluation Evidence Record

Timestamp: 2026-11-24T05:30:00Z
Repository: BreatheWise (Public, main branch)
Firebase Project: `data-blend-vc62s` / `ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb`

---

## 1. F1 Security & Data Integrity Remediation Status
- **Server-Verified Environmental Context**: Fully implemented (`server/services/verifiedAirContextBuilder.ts`). Client submission of forged AQI, spoofed CPCB station IDs, or manufactured measured availability flags is completely ignored and overwritten by server-fetched CPCB and Open-Meteo data. Adversarial tests confirm injected AQI values have zero influence on AI guidance or Q&A responses.
- **AI Provider & Fallback Configuration**: Configured `AI_PROVIDER=gemini` and `AI_FALLBACK_PROVIDER=groq` in `ServerConfig`. Strict availability-only fallback (HTTP 429, 503, timeouts, network errors). Zod-validated response schemas for both providers.
- **CORS & Rate Limiting**: Exact origin allowlist enforced; wildcard regexes removed. Pluggable rate limiting store (`MemoryRateLimitStore` & `RedisRestRateLimitStore`) with safe fallback and instance separation.
- **Prompt-Injection Protection**: Trusted system instructions strictly separated from untrusted user queries using cryptographic boundary nonces and control-character filtering.
- **Community Report Privacy**: Public `/smogReports/{reportId}` documents omit `authorUid` and email PII. Ownership isolated to `/smogReports/{reportId}/private/owner`. Concurrency-safe Firestore transactions (`runTransaction`) used for confirmations.
- **Image Security**: Sharp binary decoding/re-encoding (`server/utils/imageSanitizer.ts`) enforces MIME type validation, max dimensions (4096px), pixel bombs (16 MP), animated image rejection, polyglot checks, EXIF/GPS metadata stripping, and WebP thumbnail conversion (< 56 KB).

---

## 2. F2 Scientific Accuracy & Environmental Intelligence Status
- **Indian National AQI Engine**: Implemented official CPCB methodology (`src/domain/indianAqi.ts`) with correct pollutant-specific breakpoints, 24-hour averaging for PM2.5/PM10/NO2/SO2/NH3/Pb, 8-hour averaging for CO and O3, minimum 16-hour data completeness criteria, requirement for at least 3 valid pollutants including PM2.5 or PM10, and highest sub-index calculation. `isAveragedPeriodValid` explicitly checked.
- **CPCB Station Selection**: Validity filtering, freshness checks (180-min TTL), and geographic proximity ranking implemented in `verifiedAirContextBuilder.ts`. Open-Meteo forecasts are never substituted as measured CPCB data.
- **CPCB Pagination**: Implemented pagination handling across record limits and upstream responses.
- **Open-Meteo Forecast Validation**: Validates timestamp ordering, duplicates, missing hours, null observations, and stale data. Lowest modelled PM2.5 forecast window correctly labelled as `"Lowest Modelled PM2.5 Forecast Window"`.
- **Environmental Impact Calculations**: Removed arbitrary predefined savings (2.1 kg, 1.4 kg, 0.4 kg). Calculated impacts only from defensible WRI India GHG Program emission factors and distance inputs. Distinguishes CO, CO2, CO2e, passenger-km, and vehicle-km.
- **Indoor Air Quality Science**: Room volume calculations ($L \times W \times H$), required CADR ($Volume \times Target ACH$), effective ACH ($CADR / Volume$), and CFM / $\text{m}^3\text{/h}$ unit conversion fully validated in `src/domain/indoorAir.ts`.

---

## 3. Verification & Test Results
- **Vitest Unit & Integration Tests**: **50/50 tests passed** across all 8 test files (`tests/unit/*`, `tests/integration/api.test.ts`).
- **TypeScript Typecheck & ESLint (`npm run lint`)**: **Pass** (`tsc --noEmit && eslint .` returned 0 errors).
- **Production Build (`npm run build`)**: **Pass** (`vite build` completed successfully).
- **Repository Size**: **3.0 MB** (< 10 MB limit).
- **Branch Count**: **1** (`main` only).
