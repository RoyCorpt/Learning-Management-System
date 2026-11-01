# LMS Kampus PTIK — Implementation Baseline

## Status
Initial greenfield scaffold, version 0.2.0. This is not a completed LMS and is not approved for production use.

## Architecture
- `apps/web`: React + TypeScript + Vite frontend.
- `apps/api`: Express + TypeScript backend.
- `packages/shared`: shared role and API types.
- PostgreSQL via Prisma schema in `apps/api/prisma`.

## Working assumptions
- Roles: `ADMIN`, `DOSEN`, `MAHASISWA`.
- Authorization must be deny-by-default and combine role checks with class ownership/membership checks.
- Admin bootstrap must be a restricted CLI/seed operation, never a public signup endpoint.
- Student self-registration must verify campus email and roster NIM before activation.
- Demo and development data must be fictional. Secrets belong only in environment variables.
- No password-hashing algorithm is approved yet. The current scaffold lists `argon2` as a provisional dependency only; this is not an approved design decision. Resolve CR-01 (bcrypt vs Argon2id, including parameters and migration strategy) before implementing authentication.
- JWT cookie, CSRF, session revocation, rate limiting, email delivery, private file storage, and upload limits are not implemented yet.

## Important unresolved items
1. Reconcile bcrypt vs Argon2id.
2. Approve or reject the design recommendations D-37–D-60 and related Change Requests.
3. Resolve sprint-duration and FR-38/FR-40 document inconsistencies.
4. Verify deployment provider constraints, especially 10 MB upload end-to-end.
5. Define and test email, private object storage, backup/restore, and production observability.

## Local setup
1. Install Node.js 20 or newer and PostgreSQL 15 or newer.
2. Copy `.env.example` to `.env` and set local values.
3. Run `npm install`.
4. Run `npm run dev`.
5. Web: `http://localhost:5173`; API health: `http://localhost:4000/health`.

The current scaffold does not yet expose authentication or academic-domain APIs.
