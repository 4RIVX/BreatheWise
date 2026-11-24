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
- **Gemini AI Integration**:
  - Server-only `@google/genai` integration (`GEMINI_API_KEY` + `GEMINI_MODEL=gemini-4-hydrogen`) with structured JSON schema output validated by `StructuredGuidanceSchema` and prompt-injection framing (`<USER_QUESTION>` + control-character stripping). Returns `503` when `GEMINI_API_KEY` is unconfigured.

## 2. Security & Privacy Controls Verified

- No API keys or service account credentials in client bundles (`VITE_` prefix restricted strictly to Firebase Web config).
- Server-side photo upload endpoint (`POST /api/uploads/smog-photo`) checks verified Firebase ID token, inspects JPEG/PNG/WebP magic bytes, strips JPEG `APP1`/`COM`/`APP3–13`, PNG `eXIf`/`tEXt`/`zTXt`/`iTXt`/`tIME`, and WebP `EXIF`/`XMP ` chunks, and rejects spoofed binaries.
- Public `smogReports` documents omit user email/displayName (`Anonymous Citizen Observer`) and prevent duplicate confirmations via atomic `writeBatch` paired with `/smogReports/{reportId}/confirmations/{uid}` rules.

## 3. Verified Commands & Results

- `npx tsx --test src/domain/pureLogic.node-test.ts`: **Pass** (Indian AQI, Indoor ACH, Eco Impact).
- `npm run test` (Vitest): **Pass** (7 files, 41 tests covering CPCB Indian AQI breakpoints/completeness, unit normalization, Indoor Air Coach, India GHG mobility factors, Zod schemas, binary EXIF stripping, Supertest Express API integration & rate limiting, React Testing Library component interactions, and `axe-core` WCAG checks).
- `npm run lint` (`tsc --noEmit && eslint .`): **Pass** (0 TypeScript errors, 0 ESLint errors across `src/`, `server/`, `server.ts`, `tests/`, and `firestore.rules`).
- `npm run build`: **Pass** (`vite build`).
- Production server verification (`NODE_ENV=production node server.ts`): Verified `/api/health` and live Open-Meteo `/api/air-quality` responses on Node 22.
- Headless Chromium browser verification (`playwright-cli` at `1440x900` and `390x844`): Verified live dashboard separation, city switching (Delhi → Chennai), Data Table toggle, routine completion counter, Tamil language switch, Report Smog accessible modal, zero console errors, and zero horizontal overflow on mobile (`390px`).

## 4. Environment Secrets Needed for Full Live Providers

To activate the two optional key-gated upstream integrations in deployment or AI Studio **Settings > Secrets**:
- `GEMINI_API_KEY`: Enables live Gemini responses on `POST /api/gemini/guidance` and `POST /api/gemini/ask`.
- `DATA_GOV_IN_API_KEY`: Enables live CPCB monitoring-station telemetry on `GET /api/air-quality`.
