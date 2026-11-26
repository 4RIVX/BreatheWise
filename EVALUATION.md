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
- **TypeScript**: Strict typing (`tsc --noEmit`) with Zod schema validation on inputs, persisted local state, `firebase-applet-config.json`, provider error payloads, and API responses. Prettier and ESLint cover application, test, server, build, and Firestore rules test files; the repository-wide format check passes.
- **Maintainability**: `useWorkspaceSync` is cleanly decomposed into focused household, routine, smog-report, and eco-log hooks with UID-scoped state cleanup on sign-out, single-flight routine seeding, and mount/cancellation guards.

### 2. Security
- **Data Integrity & Auth**: Firebase Auth ID tokens require `email_verified === true` for community reports and photo uploads.
- **CORS & Rate Limiting**: Strict origin allowlist (wildcards prohibited, and production startup fails fast when `ALLOWED_ORIGIN` is empty rather than falling back to localhost dev origins). Distributed Redis REST rate limiting rejects partial credentials and non-HTTPS URLs, enforces mandatory Redis when `DEPLOYMENT_TOPOLOGY=multi-instance` or `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` in production, and fails closed (`503`) on Redis outage (with explicit warning that `single-instance` relies on single-instance deployment limits unless Redis is enabled).
- **Image Sanitization**: Binary decoding and re-encoding via `sharp@0.35.5` strips all EXIF/GPS metadata from user-uploaded smog photos.
- **Firestore Rules**: Hardened Eight Pillars security rules enforcing payload validation, PII isolation (`authorUid` in private subcollection), and atomic confirmation tracking.
- **Transitive Dependency Audit (`bun audit`)**: Root override pins `@grpc/grpc-js` to `1.14.7` across the dependency tree; `bun audit` reports no known vulnerabilities.

### 3. Efficiency
- **Caching & Pagination**: TTL caching on CPCB and Open-Meteo (`15 min` each) prevents rate limits and redundant network overhead. Bounded pagination (`offset < 2500`) handles large upstream station payloads cleanly.
- **Bundle & Memory**: Optimized production bundle (`5.3 MB` non-dependency workspace footprint excluding `node_modules` and `dist`, well below `10 MB`) with memoized client calculations and asynchronous request pipelining.

### 4. Testing
- **Test Coverage**: 159 unit, integration, and UI tests across 15 files (`bun run test`), plus 6 Firestore rules emulator tests (`bun run test:rules`) and 2 Node pure-logic subtests. V8 coverage is `77.77%` Statements, `68.51%` Branches, `73.71%` Functions, and `79.92%` Lines, enforced by thresholds set one percentage point below the measured results.
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
| `bun run format:check` | `VERIFIED` | Prettier passes across application, server, unit, integration, UI, and rules tests. |
| `bun run lint` (`tsc --noEmit && eslint .`) | `VERIFIED` | TypeScript and ESLint complete with no errors. |
| `bun run test` & `bun run test:coverage` | `VERIFIED` | 15 files, `159/159` tests passed; coverage `77.77%` Stmts / `68.51%` Branch / `73.71%` Funcs / `79.92%` Lines with an enforced one-point-lower gate. |
| `bun x tsx --test src/domain/pureLogic.node-test.ts` | `VERIFIED` | `2/2` subtests passed. |
| `bun run build` | `VERIFIED` | Production build succeeds with React, Firebase, and app bundles separated; no chunk-size advisory. |
| `bun audit` | `VERIFIED` | `0` vulnerabilities across `619` packages after pinning `@grpc/grpc-js` to `1.14.7`. |
| Live Browser + `axe-core` (`http://localhost:3000`) | `VERIFIED` | `0` console errors, `0` `axe-core` WCAG A/AA violations at `1440x900` & `390x844`, `<html lang="ta">` toggle verified, modal `inert` + focus trap + focus restoration verified, `0` overflow at `1440px`/`720px`/`390px`. Upstream CPCB (`ECONNREFUSED`) and live OpenAQ (`OPENAQ_API_KEY` unset) unavailable in container. |
| Firebase Emulator Suite | `VERIFIED` | `bun run test:rules` started the Firestore emulator and passed all `6/6` rules tests. |
