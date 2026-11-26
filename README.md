# BreatheWise

**Understand Your Air. Protect Your People. Breathe Better.**

BreatheWise is an India-first environmental intelligence and household air-pollution protection platform built with React 19, TypeScript, Express (Node.js `>=22.19.0`), Google Gemini (`@google/genai`), and optional Firebase Authentication and Cloud Firestore integrations.

## Architecture & Core Modules

1. **Air Quality Intelligence Dashboard (`src/components/AirQualityDashboard.tsx`, `server/providers/`)**
   - **CPCB / data.gov.in snapshots**: Adapter for official resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` using `DATA_GOV_IN_API_KEY`. It validates and displays reported pollutant concentrations, caches for 15 minutes, parses IST timestamps, and detects stale readings (> 3 hours); because the feed does not provide dependable averaging-period metadata, it is not presented as an official 24-hour AQI.
   - **Modelled Regional Forecast (Open-Meteo)**: Retrieves live hourly and current PM2.5, PM10, NO2, SO2, O3, CO, temperature, humidity, wind speed, and boundary-layer height from Open-Meteo, always labelled separately as atmospheric simulation rather than monitoring-station telemetry.
   - **Measured AQI from OpenAQ v3**: Computes Indian AQI using CPCB methodology only from OpenAQ hourly measurements that pass sensor freshness, alignment, rolling-average completeness, unit, and pollutant-count validation. `src/domain/indianAqi.ts` implements the CPCB 2014 breakpoints, unit conversions, required averaging periods, minimum 3-pollutant requirement, and mandatory particulate (`PM2.5` or `PM10`) check.

2. **AI Family Guardian (`server/services/geminiService.ts`, `src/components/AiFamilyGuardian.tsx`)**
   - Server-side `@google/genai` calls using `GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-4-hydrogen`).
   - Returns Zod-validated structured JSON guidance plus contextual Q&A grounded strictly in verified air telemetry, household sensitivity profile, and explicit medical/data-limitation disclaimers.

3. **Personalized Daily Protection Planner (`src/domain/protectionPlanner.ts`, `src/components/DailyProtectionPlanner.tsx`)**
   - Supports five sensitivity profiles (family with children, respiratory-sensitive, older adults, daily commuters, general household), household size, commute preference, outdoor window, HEPA availability, and English / Tamil (`EN` / `தமிழ்`) localization without collecting medical records.

4. **Indoor Air Coach (`src/domain/indoorAir.ts`, `src/components/IndoorAirCoach.tsx`)**
   - Transparent room-volume, CADR (m³/h ↔ CFM), and effective Air Changes per Hour (ACH) calculator with visible formulas and explicit scope disclaimer (does not measure actual indoor PM2.5).

5. **Smart Mobility & Eco Impact Tracker + Low-Emission Routines (`src/domain/ecoImpact.ts`, `src/components/EcoMobilityTracker.tsx`, `src/components/LowEmissionRoutines.tsx`)**
   - Versioned India-specific transport emission factors (India GHG Program / WRI India, CEA Grid Baseline v22.0, IPCC) displaying sources, units, publication years, and limitations alongside daily clean-air routine tracking persisted to Firestore. The metro-rail electricity factor is an illustrative CEA-based estimate, not a DMRC-published factor.

6. **Community Smog Watch (`src/components/CommunitySmogWatch.tsx`, `src/components/ReportSmogModal.tsx`, `server/utils/imageSanitizer.ts`)**
   - Firestore-backed anonymous citizen smog observations explicitly marked `UNVERIFIED CITIZEN REPORT`; initial report data is atomically created with `writeBatch`, while subsequent single-user confirmations use `runTransaction` and `/confirmations/{uid}`. Optional JPEG, PNG, and WebP photos receive server-side binary signature verification and EXIF/GPS metadata stripping.

## Setup & Local Development

1. Copy `.env.example` to `.env` or configure Secrets in Google AI Studio:
   - `GEMINI_API_KEY` (server-side secret for AI Family Guardian)
   - `GEMINI_MODEL=gemini-4-hydrogen`
   - `DATA_GOV_IN_API_KEY` (data.gov.in API key for live CPCB station telemetry)
   - `OPENAQ_API_KEY` (OpenAQ v3 API key for verified hourly station measurements)
2. Install dependencies:
   ```bash
   bun install
   ```
   Node.js `>=22.19.0` is required; `.nvmrc` and `.node-version` pin the major version. Bun is the package manager and `bun.lock` is the committed lockfile.
3. Run development server (Express + Vite middleware on port 3000):
   ```bash
   bun run dev
   ```
4. Build and run production server (Cloud Run target):
   ```bash
   bun run build
   bun run start
   ```
   The build compiles the Express entry point to `dist-server/server.mjs`; production starts with Node.js, without `tsx`.

## Firebase Configuration & API Key Safety

- The checked-in `firebase-applet-config.json` is intentionally blank, so Firebase sign-in, cloud routines, eco logs, and community writes remain disabled unless a Firebase project is configured through the supported `VITE_FIREBASE_*` settings.
- A Firebase web API key is a public client identifier, not a server secret. If Firebase is enabled, restrict that key to the deployed web origins and only the Firebase APIs the application uses in Google Cloud Console; never place Gemini, OpenAQ, or data.gov.in credentials in client-side configuration.
- `GEMINI_API_KEY`, `OPENAQ_API_KEY`, and `DATA_GOV_IN_API_KEY` are server-side environment secrets.

## Quality & Verification Commands

- Unit, integration, UI & accessibility tests: `bun run test`
- Browser WCAG and responsive-layout tests: `bun run test:e2e` (install Chromium first with `bunx playwright install chromium`)
- Firestore security rules emulator tests: `bun run test:rules` (requires Java 21)
- Code coverage report (`@vitest/coverage-v8`): `bun run test:coverage`
- All suites: `bun run test:all`
- Pure-logic `node:test` check: `bun run test:pure`
- TypeScript: `bun run typecheck`
- ESLint (including `firestore.rules`): `bun run lint`
- Formatting check: `bun run format:check`
