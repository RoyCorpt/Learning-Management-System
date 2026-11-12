# LMS Kampus PTIK

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

Learning management system starter for the PTIK campus project. The current implementation covers authentication/account and roster workflows from Sprint 1, plus classes and memberships from Sprint 2.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma ORM
- Validation: Zod

## Requirements
- Node.js 20+
- Docker Compose (for local PostgreSQL) or PostgreSQL 15+

## Quick start
```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

### Windows PowerShell
Untuk menyalakan PostgreSQL, menunggu database siap, menerapkan migrasi, lalu menjalankan API dan website dalam satu langkah, buka PowerShell di folder proyek dan jalankan:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start-lms.ps1
```
Docker Desktop harus sudah terbuka. Saat terminal menampilkan alamat Vite, buka http://localhost:5173. Biarkan PowerShell tetap terbuka selama aplikasi digunakan; tekan Ctrl+C untuk menghentikan API dan website. Database tetap berjalan di Docker dan dapat dihentikan dengan `docker compose stop postgres`.

Set `STUDENT_EMAIL_DOMAINS` to a comma-separated allowlist. The default is `unimed.ac.id,mhs.unimed.ac.id`. To create the first Admin, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a strong `BOOTSTRAP_ADMIN_PASSWORD` in a trusted shell, run `npm run db:bootstrap-admin -w @lms/api` once, then remove the values from that shell. The command refuses to create an Admin if any Admin already exists. Never commit or log those credentials.

- Frontend: http://localhost:5173
- API liveness: http://localhost:4000/health
- API readiness (checks PostgreSQL): http://localhost:4000/ready

## Workspace
- `apps/web` — web application
- `apps/api` — API service
- `apps/api/prisma` — Prisma schema and SQL migrations
- `packages/shared` — shared types
- `docs` — implementation decisions and traceability notes

## Current status

**As of 2026-11-12:** Sprint 1 is complete. Sprint 2 is **complete and accepted by the team**. Sprint 3 has a contract-design handoff only; Sprint 3 has not started and no Sprint 3 scope has been selected. Sprint 2 evidence and accepted limits are recorded in [`docs/SPRINT-2-ACCEPTANCE.md`](docs/SPRINT-2-ACCEPTANCE.md); its plan is [`docs/SPRINT-2-PLAN.md`](docs/SPRINT-2-PLAN.md).

## Available workflows

- Account access: student registration from one eligible roster entry, login/logout, session and CSRF protections, and forced password change for accounts with a temporary password.
- Admin: create lecturer accounts, import the student roster from CSV, and manage account roles/statuses.
- Classes: lecturers create, list, edit, and close their classes; issue or rotate invitation codes and view their class members. Active students can join open classes with an invitation code and see their memberships.
- Access is checked by the API using the signed-in account and role. Invitation codes are not returned in class listings.

Course materials, file uploads, assignments, submissions, grading, notifications, and password recovery are not implemented in the current scope. This is not a complete LMS.

## Verification record

The team accepted these results; this README update did not rerun the test suites:

| Check | Accepted result |
|---|---|
| Sprint 2 API integration | 17 passed, 2 skipped |
| Focused audit rollback test | 1 passed |
| Standard test suite | 7 passed, 13 skipped |
| Workspace typecheck and web build | Passed |
| Redocly OpenAPI validation | Valid, with 1 localhost warning |
| `git diff --check` | Passed; Git reported LF/CRLF conversion notices |
| Migration checks | Empty temporary PostgreSQL database passed; upgrade from a replayed Sprint 1 baseline with synthetic fixtures passed. This was **not** tested against the team's data-filled Sprint 1 database. |

Skipped tests remain skipped and are not counted as passed. Detailed test and UI evidence is in [`docs/SPRINT-2-ACCEPTANCE.md`](docs/SPRINT-2-ACCEPTANCE.md).

## Operational limits

- The join rate limiter uses in-memory storage per API process. A shared store is required before multi-instance deployment.
- Browser accessibility-tree checks were recorded, but screen-reader audio announcements have not been tested; accessibility has not been fully validated.
- Production HTTPS, origin, cookie, proxy, backup, and other deployment settings still need verification. The project is **not production-ready**.
- Do not place credentials, invitation codes, or real student data in source control, logs, or test fixtures.

## Sprint 3

[`docs/SPRINT-3-CONTRACT-HANDOFF.md`](docs/SPRINT-3-CONTRACT-HANDOFF.md) contains discussion candidates and contract questions only. The team has not chosen Sprint 3 scope or started implementation.
