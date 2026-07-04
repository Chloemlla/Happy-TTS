# Backend Database Guidelines

> DB patterns and conventions. Status: active for runtime-selected Janus control-plane stores.

---

## 1. Stack

- **PostgreSQL (release mode)** — owner profile / project / session / message / event metadata (doc 03 §7).
- **SQLite (dev mode)** — local control-plane store for UI/API testing without Docker or Postgres.
- **Driver: `postgres` for release, `bun:sqlite` for dev**. Janus stores stable lookup columns plus schema-validated JSON bodies for MVP control-plane records.
- **Object store (S3-compatible)** — session logs, artifacts, large files (not in Postgres).
- **Redis** — cache, session-token↔key mapping, PubSub/queue (not the system of record).

> Single-user / personal deployment: **no multi-tenant model, no `tenant_id` column, no row-level tenancy**. Model entities for one owner.

---

## 2. Architecture placement (hard rule)

- **All DB access lives in `contexts/_shared/adapters/store/postgres/`, `contexts/_shared/adapters/store/sqlite/`, or another context-owned `adapters/` folder**, implementing a `contracts/ports` interface.
- `usecases/` depend on the **port**, never on `postgres` or a connection directly. This keeps the one-way dependency rule and makes usecases testable with a mock store.
- Schema/migration definitions live alongside the db adapter, referencing types from `contracts/` where they cross layers.

---

## 3. Conventions

- **Migrations/initialization**: schema changes are forward-only SQL. Dev SQLite and local release adapters may create missing tables during startup, but production release migrations must be reviewed SQL, not hidden in usecases.
- **Naming**: `snake_case` tables/columns; plural table names; string UUID primary keys for runtime records.
- **Transactions**: own the transaction boundary in the **usecase** (it knows the unit of work); the adapter exposes a transactional port method, not ad-hoc `BEGIN` scattered around.
- **Queries**: keep SQL parameterized, typed at the adapter boundary, and indexed for hot access paths such as activity stream session/sequence and model-session token expiry.
- **JSON bodies**: records stored in Postgres `jsonb` or SQLite text JSON must be decoded with shared Zod schemas on read. Do not trust database JSON as already-valid typed data.
- **Runtime mode selection**: `JANUS_RUNTIME_MODE=dev` selects SQLite and local dev runtime adapters; `JANUS_RUNTIME_MODE=release` selects Postgres and Docker-backed runtime adapters. The selection belongs in `entry/composition`, not in usecases.

---

## 4. Common mistakes to avoid

- Importing the db client into a usecase (breaks layering — inject a port).
- Adding a runtime-mode branch inside a usecase (mode selection belongs in entry composition).
- Storing secrets (BYOK keys, Git tokens) in Postgres in plaintext — they belong in the **encrypted key vault** (doc 03 §7, doc 05 §3), never a plain column.
- Putting large blobs (logs, artifacts) in Postgres instead of the object store.
- Adding a tenancy column "just in case" — out of scope for the personal edition (needless complexity).
