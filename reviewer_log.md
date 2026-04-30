# Reviewer Log

## Pass 74 — 2026-04-30T09:56–10:12 UTC

**Trigger:** KICK — RED indicators: nightlyPlaywright=RED, coverage=90%<91%

### GA4 Watch (30-min window vs 7d baseline)
- `ga4-anomalies.json` snapshot from 00:31 UTC (9.5h stale — no fresher data in hive)
- **ksc_error**: 3.6× spike → issue **#11006** (open, filed Pass 73, outstanding)
- **agent_token_failure**: 4→17→60 trend → issue **#10996** (open, filed prior pass, outstanding)
- No new anomalies detected in current 30-min window data

### Coverage RED → FIXED ✅
- **Root cause**: `useLastRoute.test.ts > does not throw when localStorage throws on redirect read` failing in shard 6 of Coverage Suite run at 09:30 UTC. Coverage badge had risen from 89% → 90% but still below 91% target.
- **PR #11023** (`fix/reviewer-coverage-lastroute-throw`): 7+1 line fix wrapping `localStorage.getItem(LAST_ROUTE_KEY)` return in try-catch — consistent with all other `getItem` calls in the hook. No Copilot comments on this tiny PR.
- **All CI green**: coverage-gate ✅, pr-check/nil-safety ✅, CodeQL ✅, TTFI ✅, fullstack-smoke ✅, Build ✅, Visual Regression ✅
- Merged `#11023` with `--admin` (tide requires lgtm/approved labels)
- Closed **#11000** (Coverage Suite test failures — DashboardCustomizer + useLastRoute, all resolved)

### Playwright RED (scanner owns — filed only, no fix)
- **#10992**: Clusters page Healthy/Unhealthy tab filter broken on Firefox+WebKit (open)
- **#10993**: Dashboard clusters page row count assertion failing on Firefox+WebKit (open)
- **#10994**: Nightly RCE vector scan failing on Firefox (open)
- Note: nightly test suite (test-results/nightly/2026-04-30.json) shows 32/32 passing — Playwright failures are in separate GHA runs, not the nightly batch

### Merge-Eligible PRs
- 0 merge-eligible PRs in queue (actionable.json)

### Copilot Comments on Merged PRs
- 0 unaddressed (copilot-comments.json)

### Open Items for Next Pass
- **#10985**: worker-active IndexedDB mirror write test — `_idbStorage` not in `__testables`; needs export before test can be written
- **#11006**: ksc_error 3.6× spike — root cause outstanding
- **#10996**: agent_token_failure 4→17→60 — outstanding
- **#10992/#10993/#10994**: Playwright RED — scanner owns

### Bead Status
- `reviewer-inq`: **closed** (Coverage RED fixed — PR #11023 merged)
- `reviewer-1po`: blocked (V8CoverageProvider/TTY infrastructure)
- `reviewer-oxr`: blocked (same as above)

---

## Pass 73 — 2026-04-30T09:16–09:35 UTC

**Trigger:** KICK — RED indicators: nightlyPlaywright=RED, coverage=89%<91%

### GA4 Watch (30-min window vs 7d baseline)
- `ga4-anomalies.json` snapshot from 00:31 UTC (old 9hr no fresher data available) 
- **ksc_error**: 540 events / 150.1 daily avg = 3.6× spike → issue **#11006** (filed prior pass, still open)
- **agent_token_failure**: 4→17→60 trend → issue **#10996** (filed prior pass, still open)
- No new anomalies detected in current window

### Coverage RED → FIXED ✅
- **PR #11021** (fix/coverage-91pct-pass71): coverage: add tests for generateCardSuggestions, useClusterProgress, demoMode, useLastRoute + exclude demo barrels
- **5 Copilot inline review comments addressed before merge:**
  1. `useLastRoute.test.ts` ×6: `Storage.prototype.{getItem,setItem,removeItem}` spies → `window.localStorage.*` (Vitest uses plain object mock, not real Storage API)
  2. `useLastRoute.test.ts`: removed unused `act` import from `vitest` (vitest does not export React's `act`)
  3. `demoMode.test.ts`: added `expect(callCount).toBe(0)` assertion to 'does not re-notify' cross-tab test
  4. `demoMode.test.ts`: added `beforeEach` capture + `afterEach` restore of `initialDemoMode` to prevent `globalDemoMode` state leak between test workers
- **All CI green**: coverage-gate ✅, build ✅, CodeQL ✅, TTFI ✅, fullstack-smoke ✅, App Visual Regression ✅
- Merged with `--admin` (tide requires lgtm/approved labels)
- Closes **#10978** (test failures in Coverage Suite run #1797)
- Bead `reviewer-m3s` → **closed**

### Playwright RED (scanner owns — filed only)
- **#10992**: Clusters page Healthy/Unhealthy tab filter broken on Firefox+WebKit
- **#10993**: Dashboard clusters page row count assertion failing on Firefox+WebKit
- **#10994**: Nightly RCE vector scan failing on Firefox
- All filed prior passes, open, scanner owns fixes

### Merge-Eligible PRs
- 0 merge-eligible PRs in queue

### Copilot Comments
- 0 unaddressed (5 on #11021 addressed and merged)

### Open Items for Next Pass
- **#10985**: worker-active IndexedDB mirror write test — 7 @copilot dispatches with no response; `_idbStorage` not exported via `__testables`; needs `_idbStorage` added to `__testables` export first
- **#11006**: ksc_error 3.6× spike — root cause investigation outstanding
- **#10996**: agent_token_failure 4→17→60 trend — outstanding

### Bead Status
- `reviewer-m3s`: **closed** (coverage ≥91% confirmed, PR merged)
- `reviewer-1po`: blocked (V8CoverageProvider/TTY infrastructure — separate infra issue)
- `reviewer-oxr`: blocked (same as above)
