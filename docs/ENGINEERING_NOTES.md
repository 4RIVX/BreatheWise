# BreatheWise Engineering Notes

## 1. Architecture & Verified Capabilities

- **Frontend (`src/`)**: React 19, TypeScript (`^5.9.3`), Vite 8, Tailwind CSS, English & Tamil localization (`src/domain/i18n.ts`), and modular single-responsibility sync hooks (`src/hooks/useHouseholdPreferences.ts`, `src/hooks/useRoutinesSync.ts`, `src/hooks/useSmogReports.ts`, `src/hooks/useEcoLogsSync.ts`, `src/hooks/workspaceStorage.ts`, composed via `src/hooks/useWorkspaceSync.ts`).
- **Backend (`server.ts`, `server/`)**: Express 5 on Node.js `>=22.19.0` (pinned by `.nvmrc` and `.node-version`), production Helmet CSP, response compression, exact-origin CORS allowlist, topology-aware rate-limit enforcement, `sharp` image re-encoding, Zod schemas, bounded provider requests, and server-side TTL caching. Production static assets are immutable-cacheable; the SPA document is served with revalidation headers and incomplete builds return `503`.
- **Firebase**: Firebase is optional and currently disabled: `firebase-applet-config.json` contains no credentials. When re-enabled, Firestore rules remain linted with `@firebase/eslint-plugin-security-rules`, and token verification requires `email_verified === true`.
- **Environmental Data Separation**:
  - CPCB / data.gov.in results are pollutant-concentration snapshots for display; the feed has no dependable averaging-period metadata, so it is not described as an official 24-hour AQI. OpenAQ v3 hourly measurements are independently validated for freshness, alignment, and rolling-average completeness before the app calculates Indian AQI using CPCB methodology; upstream `provider`, `owner`, and `licenses` attribution is retained. Both measured sources are displayed separately from regional simulations (`server/providers/openMeteoProvider.ts`).
  - No synthetic AQI, station counts, or emission savings are fabricated when upstream telemetry is unavailable or incomplete.

---

## 2. Engineering Implementation Summary

### 1. Code Quality

- **Architecture**: Clean separation of concerns across domain rules (`src/domain/`), Zod local-storage and Firebase sync hooks (`src/hooks/`), server providers, modular Express routers, AI orchestration, and React UI components.
- **TypeScript**: Strict compiler checks include unused declarations, implicit returns, and switch fallthrough detection. Prettier and ESLint cover application, test, server, build, and Firestore rules test files.
- **Maintainability**: `useWorkspaceSync` is cleanly decomposed into focused household, routine, smog-report, and eco-log hooks with UID-scoped state cleanup on sign-out, single-flight routine seeding, and mount/cancellation guards.

### 2. Security

- **Data Integrity & Auth**: Firebase Auth ID tokens require `email_verified === true` for community reports and photo uploads.
- **CORS & Rate Limiting**: Strict origin allowlist (wildcards prohibited, and production startup fails fast when `ALLOWED_ORIGIN` is empty rather than falling back to localhost dev origins). Distributed Redis REST rate limiting rejects partial credentials and non-HTTPS URLs, enforces mandatory Redis when `DEPLOYMENT_TOPOLOGY=multi-instance` or `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` in production, and fails closed (`503`) on Redis outage (with explicit warning that `single-instance` relies on single-instance deployment limits unless Redis is enabled).
- **Image Sanitization**: Binary decoding and re-encoding via `sharp@0.35.5` strips all EXIF/GPS metadata from user-uploaded smog photos.
- **Browser Security**: Production CSP disallows framing and objects, restricts scripts, styles, connections, and forms to required origins, while API responses use `Cache-Control: no-store`; responses omit `X-Powered-By`.
- **Public Client Key**: A Firebase web API key is a public identifier, not a server secret. If Firebase is re-enabled, restrict it to deployed origins and required Firebase APIs; server credentials stay in environment secrets.
- **Secret Scanning**: GitHub Actions runs Gitleaks with full history. Its narrow allowlist only exempts Firebase web-key syntax in `firebase-applet-config.json`; the current file is blank. The hosted workflow has not yet been triggered from this workspace.
- **Firestore Rules**: Hardened Eight Pillars security rules enforcing payload validation, PII isolation (`authorUid` in private subcollection), and atomic confirmation tracking.
- **Transitive Dependency Audit (`bun audit`)**: Root override pins `@grpc/grpc-js` to `1.14.7` across the dependency tree; `bun audit` reports no known vulnerabilities.

### 3. Efficiency

- **Caching & Pagination**: TTL caching on CPCB and Open-Meteo (`15 min` each) prevents rate limits and redundant network overhead. Bounded pagination (`offset < 2500`) handles large upstream station payloads cleanly.
- **Delivery & Memory**: Self-hosted variable fonts remove Google Fonts requests; the report modal is lazy-loaded; hashed assets receive immutable caching; compressed responses, memoized client calculations, and asynchronous request pipelining reduce delivery and runtime costs. The production server is bundled to plain JavaScript and starts with Node rather than `tsx`.

### 4. Testing

- **Test Coverage**: `236/236` unit, integration, and UI tests across `28` Vitest files, plus `9` Firestore rules emulator tests and `2` Node pure-logic subtests. V8 coverage under Node `22.23.5` is `85.73%` Statements, `75.10%` Branches, `81.44%` Functions, and `88.21%` Lines, enforced by thresholds set one percentage point below these measurements.
- **Regression Suite**: Covers security boundary enforcement, rate-limit topology validation, workspace sync offline/sign-out/race guards, OpenAQ mixed-freshness validation, Indian national AQI rolling averages, eco-mobility emission accounting, indoor air safety logic, and UI modal focus/ARIA contracts.

### 5. Accessibility

- **Semantic HTML & ARIA**: Native interactive elements, modal dialog isolation (`inert` + `aria-hidden="true"` captured and restored cleanly around trigger focus restoration via `useDialogA11y`), Tab/Shift+Tab containment, `Escape` dismissal, body scroll lock, `prefers-reduced-motion` scroll behavior, per-report confirm accessible names with `role="status"` announcements, and WCAG AA text/SVG contrast (`slate-600+`).
- **Live Browser & `axe-core` Verification**: Six Playwright tests scan WCAG 2.0/2.1/2.2 A/AA in Chromium at desktop and mobile, verify Tamil document language, scan the open report dialog, check 44px touch targets, and exercise skip-link and modal keyboard focus behavior. Browser axe scans include color contrast; jsdom scans cover additional component states and assert zero violations at every impact level other than color contrast, which jsdom cannot calculate.

### 6. Problem Statement Alignment

- **Winter Smog Navigation**: Designed specifically to help families and communities navigate severe winter air pollution in Indian urban centers.
- **Core Problem Features**: CPCB pollutant-concentration snapshots, validated OpenAQ measured AQI, Open-Meteo regional forecasts, Family Protection Planner (vulnerable groups guidance), Indoor Air Purifier & ACH calculator, Low-Emission Routines & Eco-Mobility tracker (CEA v22.0 grid factors with illustrative estimate disclosures), and Community Smog Watch reporting with strict privacy protection.

---

## 3. Verification Status Summary

| Verification Item                           | Status     | Observed Result                                                                                                                                                         |
| ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run format:check`                      | `VERIFIED` | Prettier checks application, server, tests, browser suite, documentation, and configuration files.                                                                      |
| `bun run typecheck` and `bun run lint`      | `VERIFIED` | TypeScript and ESLint complete with no errors.                                                                                                                          |
| Vitest `run --coverage` (Node `22.23.5`)    | `VERIFIED` | `28` files, `236/236` tests passed; coverage `85.73%` Stmts / `75.10%` Branch / `81.44%` Funcs / `88.21%` Lines; enforced gate is one point below each measured result. |
| `bun run test:pure`                         | `VERIFIED` | `2/2` independent Node `node:test` subtests passed.                                                                                                                     |
| `bun run build` and Node production startup | `VERIFIED` | Vite assets and `dist-server/server.mjs` build successfully; production starts with Node rather than `tsx`.                                                             |
| `bun audit`                                 | `VERIFIED` | `0` vulnerabilities after pinning `@grpc/grpc-js` to `1.14.7`.                                                                                                          |
| GitHub Actions and Gitleaks                 | `ADDED`    | Full-history CI workflow is configured; its hosted run awaits a push or manual dispatch.                                                                                |
| Playwright WCAG scans and keyboard flows    | `VERIFIED` | Desktop, mobile, Tamil, open modal, 44px targets, skip-link, Escape dismissal, and focus restoration scenarios pass (`6/6`).                                            |
| Firestore Emulator Suite                    | `VERIFIED` | Firestore emulator passes all `9/9` access-control and query-limit tests.                                                                                               |
| Git history scan                            | `VERIFIED` | The removed cloud-log path is not reachable in local branch history; remote synchronization is verified separately.                                                     |
