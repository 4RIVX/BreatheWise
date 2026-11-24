# BreatheWise Engineering & Verification Report

## 1. Architecture & Integration Summary

- **Frontend**: React 19, TypeScript (strict mode), Vite, Tailwind CSS, Lucide React, English + Tamil (`EN` / `தமிழ்`) localization (`src/domain/i18n.ts`).
- **Backend**: Node.js 22 (`node server.ts` compatible without compilation step), Express 5, Helmet, strict CORS allowlist, `express-rate-limit`, Zod request/response validation, and server-side TTL caching (`server/utils/cache.ts`).
- **Firebase**:
  - Provisioned via native AI Studio Firebase integration (`projectId: "data-blend-vc62s"`, database `"ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb"`, region `"asia-south1"`).
  - Hardened Eight-Pillars `firestore.rules` linted with `@firebase/eslint-plugin-security-rules` and deployed via `DeployRules`.
  - Server-side ID token verification (`server/firebaseAdmin.ts`) protects `/api/uploads/smog-photo`.
- **Air-Quality Providers**:
  - Primary measured provider: CPCB / `data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`. Returns a structured unavailable state (`MISSING_API_KEY`) when `DATA_GOV_IN_API_KEY` is absent; never generates fictional station values.
  - Secondary modelled provider: Open-Meteo Air Quality & Weather API (`https://air-quality-api.open-meteo.com/v1/air-quality`), always displayed separately as atmospheric simulation.
- **AI Provider & Orchestration (Mission F1)**:
  - Configurable primary provider (`AI_PROVIDER=gemini` or `groq`) and fallback provider (`AI_FALLBACK_PROVIDER=groq`).
  - Server-verified air context builder (`server/services/verifiedAirContextBuilder.ts`) ensures clients cannot submit forged AQI values or spoofed CPCB station data.
  - Multi-turn untrusted user query isolation with cryptographically secure boundary nonces against prompt injection and fake URLs.

## 2. Security & Privacy Controls Verified (Mission F1)

- **CORS Allowlist**: Wildcard patterns removed; exact allowed origins enforced in production.
- **Community Report PII Isolation**: Public `smogReports/{reportId}` documents omit `authorUid` and private PII entirely. Ownership metadata (`authorUid`) is isolated to `/smogReports/{reportId}/private/owner` (readable only by the owner or admin).
- **Atomic Confirmations**: Report confirmation counts are updated via Firestore transactions (`runTransaction`) preventing lost increments and duplicate confirmations.
- **Image Security**: Full binary decode and re-encoding via `sharp` (`server/utils/imageSanitizer.ts`) supporting JPEG, PNG, and WebP, stripping EXIF/GPS metadata, rejecting animated images, polyglots, and pixel bombs.
- **Error Log Privacy**: `src/firebase/errorHandling.ts` sanitizes operational logs to redact email addresses, UIDs, and tenant tokens.

## 3. Verified Commands & Results

- **Vitest Unit & Integration Tests**: `8 passed`, `50/50 tests passed` (including `tests/unit/securityAndPrivacy.test.ts` and `tests/integration/api.test.ts`).
- **Node 22 Pure Logic Tests**: `1/1 passed` (`src/domain/pureLogic.node-test.ts`).
- **TypeScript & ESLint (`npm run lint`)**: `Pass` (`tsc --noEmit && eslint .`, `0` errors).
- **Production Build (`npm run build`)**: `Pass` (`dist/` generated cleanly).
- **Repository Size**: `3.0 MB` (main branch only).

