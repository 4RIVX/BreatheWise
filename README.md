# BreatheWise

**Understand Your Air. Protect Your People. Breathe Better.**

BreatheWise is an India-first environmental intelligence and household air-pollution protection platform built with React 19, TypeScript, Express (Node.js 22), Google Gemini (`@google/genai`), Firebase Authentication, and Cloud Firestore.

## Architecture & Core Modules

1. **Air Quality Intelligence Dashboard (`src/components/AirQualityDashboard.tsx`, `server/providers/`)**
   - **Measured Station Data (CPCB / data.gov.in)**: Adapter for official resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` using `DATA_GOV_IN_API_KEY`. Validates payloads via Zod, caches for 15 minutes, parses IST timestamps, detects stale readings (> 3 hours), and shows an explicit unavailable state when unconfigured or offline (never fabricates live station values).
   - **Modelled Regional Forecast (Open-Meteo)**: Retrieves live hourly and current PM2.5, PM10, NO2, SO2, O3, CO, temperature, humidity, wind speed, and boundary-layer height from Open-Meteo, always labelled separately as atmospheric simulation rather than monitoring-station telemetry.
   - **Official Indian National AQI Methodology (`src/domain/indianAqi.ts`)**: Implements CPCB 2014 breakpoints across `Good` (0–50), `Satisfactory` (51–100), `Moderate` (101–200), `Poor` (201–300), `Very Poor` (301–400), and `Severe` (401–500), unit conversions (`mg/m3`, `ug/m3`, `ppm`, `ppb`), 24h/8h averaging period checks, minimum 3-pollutant requirement, and mandatory particulate (`PM2.5` or `PM10`) enforcement.

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
3. Run development server (Express + Vite middleware on port 3000):
   ```bash
   bun run dev
   ```
4. Build and run production server (Cloud Run target):
   ```bash
   bun run build
   bun run start
   ```

## Quality & Verification Commands

- Unit, integration, UI & accessibility tests: `bun run test`
- Firestore security rules emulator tests: `bun run test:rules`
- Code coverage report (`@vitest/coverage-v8`): `bun run test:coverage`
- Pure-logic `node:test` check: `bun x tsx --test src/domain/pureLogic.node-test.ts`
- TypeScript & ESLint (including `firestore.rules`): `bun run lint`
- Formatting check: `bun run format:check`
