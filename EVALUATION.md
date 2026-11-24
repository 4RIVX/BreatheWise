# BreatheWise Engineering & Verification Report

## 1. Architecture & Integration Summary

- **Frontend**: React 19, TypeScript (strict mode), Vite, Tailwind CSS, Lucide React, English + Tamil (`EN` / `தமிழ்`) localization (`src/domain/i18n.ts`).
- **Backend**: Node.js 22 (`node server.ts` compatible without compilation step), Express 5, Helmet, strict CORS allowlist, `express-rate-limit`, Zod request/response validation, and server-side TTL caching (`server/utils/cache.ts`).
- **Firebase**:
  - Provisioned via native AI Studio Firebase integration (`projectId: "data-blend-vc62s"`, database `"ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb"`, region `"asia-south1"`).
  - Hardened Eight-Pillars `firestore.rules` linted with `@firebase/eslint-plugin-security-rules` and deployed via `DeployRules`.
  - Server-side ID token verification (`server/firebaseAdmin.ts`) protects `/api/uploads/smog-photo`, strictly requiring `email_verified === true`.
- **Air-Quality Providers**:
  - Primary measured provider: CPCB / `data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` with offset/limit pagination. Evaluates conditional rolling average validity based on physical limits, min/max consistency, and valid timestamps.
  - Secondary modelled provider: Open-Meteo Air Quality & Weather API, displayed separately as atmospheric simulation. Best forecast window checks strict 1-hour consecutive timestamp continuity.
- **AI Provider & Orchestration (Mission F1)**:
  - Configurable primary provider (`AI_PROVIDER=gemini` or `groq`) and fallback provider (`AI_FALLBACK_PROVIDER=groq`), restricted to availability errors (429, 503, timeouts).
  - Server-verified air context builder (`server/services/verifiedAirContextBuilder.ts`) prioritizes stations with calculable AQI, freshness, and geographic proximity (Haversine formula).
  - Multi-turn untrusted user query isolation with cryptographically secure boundary nonces against prompt injection.

## 2. Security & Privacy Controls Verified (Mission F1)

- **CORS Allowlist**: Wildcard patterns removed; exact allowed origins enforced in production.
- **Community Report PII Isolation**: Public `smogReports/{reportId}` documents omit `authorUid` and private PII entirely. Ownership metadata (`authorUid`) is isolated to `/smogReports/{reportId}/private/owner`.
- **Atomic Confirmations**: Report confirmation counts are updated via Firestore transactions (`runTransaction`) preventing lost increments and duplicate confirmations.
- **Image Security**: Full binary decode and re-encoding via `sharp` (`server/utils/imageSanitizer.ts`) supporting JPEG, PNG, and WebP, stripping EXIF/GPS metadata, rejecting animated images, polyglots, and pixel bombs. Explicitly declared in `package.json`.
- **Error Log Privacy**: `src/firebase/errorHandling.ts` sanitizes operational logs to redact email addresses, UIDs, and tenant tokens.
- **Email Verification**: Strictly requires `email_verified === true`. Missing `email_verified` is never treated as verified.

## 3. Scientific Accuracy Improvements (Mission F2)

- **Indian National AQI Engine**: Official CPCB 2014 methodology (`src/domain/indianAqi.ts`) with correct breakpoints, 24h/8h averaging periods, 16h completeness threshold, requirement for 3 valid pollutants including PM2.5 or PM10, and max sub-index calculation.
- **Emission Factor Source Traceability**: Every factor in `EMISSION_FACTORS_INDIA` (`src/domain/ecoImpact.ts`) includes direct source URLs, publishers, publication years, page/table references, and pollutant scopes.
- **Zeroed Predefined Routine Savings**: Default clean-air routines in `defaultRoutines.ts` initialize to 0.0 kg CO2e, avoiding arbitrary unsupported numbers. Savings are calculated only when user trip distance and transport mode parameters are supplied.
- **Indoor Air Science**: Strict $L \times W \times H$ room volume, CADR, ACH, and CFM / $\text{m}^3\text{/h}$ conversions validated in `src/domain/indoorAir.ts`.

## 4. Verified Commands & Results

- **Vitest Unit & Integration Tests**: `8 passed`, `54/54 tests passed` (including `tests/unit/securityAndPrivacy.test.ts`, `tests/unit/ecoImpact.test.ts`, and `tests/integration/api.test.ts`).
- **Node 22 Pure Logic Tests**: `1/1 passed` (`src/domain/pureLogic.node-test.ts`).
- **TypeScript & ESLint (`npm run lint`)**: `Pass` (`tsc --noEmit && eslint .`, `0` errors).
- **Production Build (`npm run build`)**: `Pass` (`vite build` completed cleanly).
- **Repository Size**: `5.1 MB` (< 10 MB limit, main branch only).
