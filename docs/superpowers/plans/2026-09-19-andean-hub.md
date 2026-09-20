# Andean Exploration Hub v0.1 Implementation Plan

Goal: integrate the approved six-section Hub into the user's existing desktop checkout.
Architecture: dedicated React screen and Zustand store; existing Tauri JSON-RPC transport; isolated Python market provider/cache and content catalog. No dataset mutation.
Stack: existing React 19, Tailwind 4, Zustand, Tauri 2, FastAPI/Pydantic; standard-library HTTP/SQLite for the provider and persistence.
Spec: approved pyorex-hub-revision.md in the task outputs.

Constraints: retain local edits; no reset, checkout replacement, publish or commits containing unrelated changes. Use daily official BCRP series, clearly dated. No invented current news. Execute inline following the user's go instruction.

## Tasks

- [ ] Backend: first add tests for BCRP normalization, missing/invalid values, cache fallback and recovery, archive persistence and input validation. Implement analysis/hub/{markets,repository,catalog}.py and app/routers/hub_rpc.py. Register methods in rpc.py and analytics_bridge.rs. Fetch only the fixed BCRP HTTPS host, bounded response and timeout. Use asyncio.to_thread for network/storage work. Cache succeeds atomically; preserve last valid data on failures.
- [ ] Contracts/UI: add versioned hub contracts and tests. Create lib/hub-api.ts, stores/hub-store.ts, components/hub/HubScreen.tsx. Add top-level hub nav and #/hub/<section> deep links without replacing the app's existing navigation. Six usable views, search, source links, save/remove archive, explicit loading/error/empty states, dated market table. Add frontend tests for navigation parsing, filtering and store lifecycle.
- [ ] Verify: full Python suite, frontend tests/typecheck/build, Rust check, live BCRP request; start Python and Tauri locally, inspect six views and existing tabs. Document limits if native/UI environment cannot be controlled.
- [ ] Deliver: docs/ANDEAN_HUB.md with setup and changed files; ADR and memory update; output report with exact verification results.

## Review focus

1. Mixed valid/missing series and malformed provider payloads: never silently shift units/series or replace a valid cache with incomplete data.
2. Offline first launch vs disconnected subsequent launch: distinguish empty state from cached dated observations.
3. Rapid refresh/tab changes: deduplicate in-flight requests; preserve archive and selected tab.
4. Repeated saves/removes and restart: SQLite unique ids and transactions; no cross-dataset effects.
5. Existing dirty files: exact anchor patches and checksum guard; no unrelated source overwrites.

## Execution ledger

Baseline: TypeScript passes; 187 Python tests pass; frontend has no tests. Ruling: edit original checkout as explicitly requested, with original-file backups and concurrent-change checks. Ruling: user's go authorizes execution of approved design, so no additional process-only approval round. No new plugin framework or global router dependency.
