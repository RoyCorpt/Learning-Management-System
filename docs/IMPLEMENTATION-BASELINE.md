# LMS Kampus PTIK — Implementation Baseline

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

## Status
Scaffold Sprint 0, version 0.2.0. Sprint 1 began under the owner’s internal baseline dated 2026-11-01. This repository is not a completed LMS and is not approved for production use.

## Architecture
- `apps/web`: React + TypeScript + Vite frontend.
- `apps/api`: Express + TypeScript backend.
- `packages/shared`: shared role and API types.
- PostgreSQL via Prisma schema in `apps/api/prisma`.

## Working assumptions
- Roles: `ADMIN`, `DOSEN`, `MAHASISWA`.
- Authorization must be deny-by-default and combine role checks with class ownership/membership checks.
- Admin bootstrap must be a restricted CLI/seed operation, never a public signup endpoint.
- Student registration matches normalized campus email and NIM against an eligible roster row, atomically claims it once, and creates the account as `PENDING`; Admin activation is separate.
- Demo and development data must be fictional. Secrets belong only in environment variables.
- Password hashing: Argon2id (owner decision, 2026-11-01); library `argon2@0.45.1` is installed.
- Admin creates DOSEN accounts; student signup uses configurable `unimed.ac.id,mhs.unimed.ac.id` allowlist and an Admin-imported roster CSV.
- Supplied roster CSV has UTF-8 BOM, semicolon delimiter, four blank leading columns, and effective columns `nim`, `nama`, `email`, `status`. Only `layak` is currently recognized as registration eligible; other status values fail closed.
- Reset password FR-05 remains in the backlog. FR-38 and FR-40 remain outside Sprint 1. Upload limit baseline is 4 MB for its future implementation.
- Cookie/session revocation, CSRF, rate limiting, audit events, account APIs, and authentication UI were added in Sprint 1; see Sprint 1 test results for remaining coverage gaps.

## Important unresolved items
1. Confirm authoritative project revisions A–F and master index; they were not present in the repository file inventory.
2. Verify deployment provider constraints before production deployment.
3. Define and test email, private object storage, backup/restore, and production observability in their applicable sprints.

## Local setup
1. Install Node.js 20 or newer and PostgreSQL 15 or newer.
2. Copy `.env.example` to `.env` and set local values.
3. Run `npm install`.
4. Run `npm run dev`.
5. Web: `http://localhost:5173`; API health: `http://localhost:4000/health`.

The current Sprint 1 branch exposes authentication and account-management APIs. Academic-domain APIs remain outside Sprint 1.
