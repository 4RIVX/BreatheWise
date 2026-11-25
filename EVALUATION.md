# BreatheWise Engineering & Evaluation Summary

## 1. Architecture & Verified Capabilities

- **Frontend (`src/`)**: React 19, TypeScript (`^5.9.3`), Vite 8, Tailwind CSS, English & Tamil localization (`src/domain/i18n.ts`), and modular single-responsibility sync hooks (`src/hooks/useHouseholdPreferences.ts`, `src/hooks/useRoutinesSync.ts`, `src/hooks/useSmogReports.ts`, `src/hooks/useEcoLogsSync.ts`, `src/hooks/workspaceStorage.ts`, composed via `src/hooks/useWorkspaceSync.ts`).
- **Backend (`server.ts`, `server/`)**: Express 5 on Node.js 22, Helmet, exact-origin CORS allowlist in production (`server/config.ts`), topology-aware rate-limit enforcement (`DEPLOYMENT_TOPOLOGY=single-instance|multi-instance`, `REQUIRE_DISTRIBUTED_RATE_LIMIT`, HTTPS-validated Redis REST store in `server/utils/rateLimitStore.ts`), `sharp` (`^0.35.5`) binary image decoding/re-encoding (`server/utils/imageSanitizer.ts`), Zod schemas, and server-side TTL caching.
- **Firebase**: Provisioned project `data-blend-vc62s` (Firestore database `ai-studio-breathewise-0d124cc1-42ec-406c-8f70-0818ae6bbdeb`, `asia-south1`), hardened `firestore.rules` linted with `@firebase/eslint-plugin-security-rules`, and strict `email_verified === true` enforcement in token verification (`server/app.ts`).
- **Environmental Data Separation**:
  - Measured ground stations (`server/providers/cpcbProvider.ts` for `data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`, and `server/providers/openAqProvider.ts` for OpenAQ v3 hourly measurements labelled `"OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology"` with upstream `provider`, `owner`, and `licenses` attribution) are displayed separately from regional simulations (`server/providers/openMeteoProvider.ts`).
  - No synthetic AQI, station counts, or emission savings are fabricated when upstream telemetry is unavailable or incomplete.

---

## 2. Six-Parameter Competition Score Optimisation Audit

### 1. Code Quality
- **Architecture**: Clean separation of concerns across domain rules (`src/domain/`), Zod local-storage and Firebase sync hooks (`src/hooks/`), server providers (`server/providers/`), modular Express routers (`server/routes/`), AI orchestration (`server/services/`), and React UI components (`src/components/`).
- **TypeScript**: Strict typing (`tsc --noEmit`) with Zod schema validation on inputs, persisted local state, `firebase-applet-config.json`, provider error payloads, and API responses. Maintained Prettier (`format:check`) and ESLint (`eslint.config.mjs`) cover `src/**/*.{ts,tsx}`, `tests/**/*.{ts,tsx}`, `server.ts`, `server/**/*.ts`, `firestore.rules`, and build/test configs.
- **Maintainability**: `useWorkspaceSync` is cleanly decomposed into focused household, routine, smog-report, and eco-log hooks with UID-scoped state cleanup on sign-out, single-flight routine seeding, and mount/cancellation guards.

### 2. Security
- **Data Integrity & Auth**: Firebase Auth ID tokens require `email_verified === true` for community reports and photo uploads.
- **CORS & Rate Limiting**: Strict origin allowlist (wildcards prohibited in production). Distributed Redis REST rate limiting rejects partial credentials and non-HTTPS URLs, enforces mandatory Redis when `DEPLOYMENT_TOPOLOGY=multi-instance` or `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` in production, and fails closed (`503`) on Redis outage while preserving explicit single-instance Cloud Run startup warnings.
- **Image Sanitization**: Binary decoding and re-encoding via `sharp@0.35.5` strips all EXIF/GPS metadata from user-uploaded smog photos.
- **Firestore Rules**: Hardened Eight Pillars security rules enforcing payload validation, PII isolation (`authorUid` in private subcollection), and atomic confirmation tracking.
- **Transitive Dependency Audit (`bun audit`)**: Reports 2 advisories solely on `@grpc/grpc-js@1.9.16` pinned strictly by upstream `firebase@13.4.0 -> @firebase/firestore@4.20.0` (`"~1.9.0"`); `firebase-admin@14.5.1 -> google-gax` already resolves `@grpc/grpc-js@1.14.7`, browser clients use Web/WebChannel rather than Node gRPC, and server Admin SDK calls `getAuth().verifyIdToken()` over HTTPS.

### 3. Efficiency
- **Caching & Pagination**: TTL caching on CPCB (`15 min`) and Open-Meteo (`30 min`) endpoints prevents rate limits and redundant network overhead. Bounded pagination (`offset < 2500`) handles large upstream station payloads cleanly.
- **Bundle & Memory**: Optimized production bundle (`5.3 MB` non-dependency workspace footprint excluding `node_modules` and `dist`, well below `10 MB`) with memoized client calculations and asynchronous request pipelining.

### 4. Testing
- **Test Coverage**: 89 automated unit, integration, and UI tests across 9 test files (`bun run test`), Node pure-logic tests (`npx tsx --test`), and V8 coverage via `@vitest/coverage-v8` (`bun run test:coverage`: `71.25%` Statements, `62.65%` Branches, `67.02%` Functions, `73.07%` Lines overall; `89.24%` Stmts / `100%` Functions across `src/domain/`).
- **Regression Suite**: Covers security boundary enforcement, rate-limit topology validation, workspace sync offline/sign-out/race guards, OpenAQ mixed-freshness validation, Indian national AQI rolling averages, eco-mobility emission accounting, indoor air safety logic, and UI modal focus/ARIA contracts.

### 5. Accessibility
- **Semantic HTML & ARIA**: Native interactive elements, modal dialog isolation (`inert` + `aria-hidden="true"` captured and restored cleanly around trigger focus restoration via `useDialogA11y`), Tab/Shift+Tab containment, `Escape` dismissal, body scroll lock, `prefers-reduced-motion` scroll behavior, per-report confirm accessible names with `role="status"` announcements, and WCAG AA text/SVG contrast (`slate-600+`).
- **Live Browser & `axe-core` Verification**: Verified in headless Chromium via Playwright (`axe-core` WCAG 2.0/2.1/2.2 A/AA) with `0` violations at desktop (`1440x900`, `26` checks passed) and mobile (`390x844`, `27` checks passed), and zero horizontal overflow across `1440px`, `720px`, and `390px`.

### 6. Problem Statement Alignment
- **Winter Smog Navigation**: Designed specifically to help families and communities navigate severe winter air pollution in Indian urban centers.
- **Core Problem Features**: Real-time verified station monitoring, Open-Meteo regional forecasts, Family Protection Planner (vulnerable groups guidance), Indoor Air Purifier & ACH calculator, Low-Emission Routines & Eco-Mobility tracker (CEA v22.0 grid factors with illustrative estimate disclosures), and Community Smog Watch reporting with strict privacy protection.

---

## 3. Verification Status Summary

| Verification Item | Status | Observed Result |
|---|---|---|
| `bun run format:check` | `VERIFIED` | Exit 0 across `src/**/*.{ts,tsx}`, `tests/**/*.{ts,tsx}`, `server.ts`, `server/**/*.ts`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`. |
| `bun run lint` (`tsc --noEmit && eslint .`) | `VERIFIED` | Exit 0 (`0` TypeScript, ESLint, and `firestore.rules` errors). |
| `bun run test` & `bun run test:coverage` | `VERIFIED` | 9 files, `89/89` tests passed; V8 coverage `71.25%` Stmts / `62.65%` Branch / `67.02%` Funcs / `73.07%` Lines (`89.24%` Stmts in `src/domain/`). |
| `npx --yes tsx --test src/domain/pureLogic.node-test.ts` | `VERIFIED` | `2/2` subtests passed. |
| `bun run build` | `VERIFIED` | Clean production Vite bundle build. |
| `bun audit` | `VERIFIED` | `0` Sharp vulnerabilities; `2` upstream transitive `@grpc/grpc-js` advisories on `firebase -> @firebase/firestore` (`google-gax` already at `1.14.7`). |
| Live Browser + `axe-core` (`http://localhost:3000`) | `VERIFIED` | `0` console errors, `0` `axe-core` WCAG A/AA violations at `1440x900` & `390x844`, `<html lang="ta">` toggle verified, modal `inert` + focus trap + focus restoration verified, `0` overflow at `1440px`/`720px`/`390px`. Upstream CPCB (`ECONNREFUSED`) and live OpenAQ (`OPENAQ_API_KEY` unset) unavailable in container. |
| Firebase Emulator Suite | `NOT RUN` | Local Firebase Emulator binary unavailable in container; Firestore rules checked via `@firebase/eslint-plugin-security-rules` and rule-invariant unit tests. |
