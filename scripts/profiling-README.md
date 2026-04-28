# Backend Profiling

## Quick start

1. `npm run build:backend`
2. `npm run profile:start`
3. Open `GET /api/status/profiling` with an admin JWT

## Commands

- `npm run profile:start`
  Starts the built backend with lightweight request/process profiling enabled.
- `npm run profile:cpu`
  Starts the backend with Node CPU profiling enabled. Output goes to `profiles/`.
- `npm run profile:heap`
  Starts the backend with heap profiling enabled. Output goes to `profiles/`.
- `npm run profile:inspect`
  Starts the backend with the Node inspector on port `9229`.
- `npm run profile:load`
  Runs an internal high-pressure load test and writes the detailed report to MongoDB with a TTL.

## Useful env vars

- `PROFILING_ENABLED=true`
- `PROFILING_SLOW_REQUEST_THRESHOLD_MS=800`
- `PROFILING_REQUEST_SAMPLE_LIMIT=200`
- `PROFILING_SAMPLE_INTERVAL_MS=10000`
- `PROFILING_SUMMARY_LOG_INTERVAL_MS=60000`
- `LOAD_TEST_BASE_URL=http://127.0.0.1:3000`
- `LOAD_TEST_CONCURRENCY=20`
- `LOAD_TEST_DURATION_MS=60000`
- `LOAD_TEST_REQUEST_TIMEOUT_MS=10000`
- `LOAD_TEST_ADMIN_TOKEN=<admin-jwt>`
- `LOAD_TEST_TTL_HOURS=24`

## What you get

- Per-request timing with slow-request warnings in logs
- Top slow routes aggregated in memory
- Recent request samples
- Process CPU and memory snapshots
- Event loop delay percentiles
- MongoDB-backed load-test reports in `load_test_reports`

## Ephemeral load-test reports

`npm run profile:load` writes its report to MongoDB and creates a TTL index on `expiresAt`.
The data is intentionally ephemeral, so Docker does not need a persistent volume for these reports.
