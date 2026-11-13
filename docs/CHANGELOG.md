# Changelog

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

## 2026-11-12 — Sprint 2 selesai/diterima

- Tim menerima implementasi Sprint 2 serta hasil UI yang diuji untuk saat ini; item S2-01–S2-06 dicatat selesai. Rincian hasil dan batas penerimaan ada di `SPRINT-2-ACCEPTANCE.md`.
- Upgrade migrasi yang diterima menggunakan baseline Sprint 1 hasil replay dengan fixture sintetis, bukan salinan database Sprint 1 berisi milik tim.
- Hasil UI diterima tim tanpa mengklaim ada retest independen atau pemeriksaan audio pembaca layar tambahan.
- Shared rate-limit store masih wajib sebelum deployment multi-instance; penerimaan Sprint 2 bukan klaim production-ready.

## 2026-11-01 — Sprint 1 auth slice (In Progress)

- Added Argon2id hashing, opaque DB-backed sessions, CSRF validation, login throttling, authentication and ADMIN middleware, student domain/roster checks, Admin provisioning/account controls, and an authentication UI.
- Added user password-change flag, sessions/audit schema and Prisma migration `20261101093445_auth_sessions_audit`.
- Added `csv-parse` based Admin roster import, `registration_eligible` plus one-time registration claim fields, and migration `20261101093446_student_roster_eligibility_claim`.
- Confirmed allowlist defaults to `unimed.ac.id,mhs.unimed.ac.id`; imported `layak` entries remain separate from PENDING user-account status.
- Added one-time Admin bootstrap command; an integration rehearsal created a temporary Admin, verified repeat refusal and no credential output, then removed the test user and audit row.
- Added API, schema, decision, planning, backlog, test-results and risk documentation.
- Rationale/source: Sprint 1 scope and owner baseline dated 2026-11-01, including the confirmed roster/domain decisions. Dependency changes: `argon2@0.45.1`, `express-rate-limit@8.7.2`, `csv-parse@7.0.3`; final audit reported zero vulnerabilities.
- Review fixes: auth mutation/audit/revocation paths now transact together; bootstrap and Admin last-account guards use serializable transactions; roster conflict is reported as 409 and partial-batch rollback is tested.
- Evidence: final typecheck/build/Prisma generation/deploy check pass; default test run 7 passed/6 skipped; full opt-in test run 13/13 passed, including official roster import, rollback, expiry, CSRF, both rate limits, one-time bootstrap and Dosen/Admin account lifecycle. Current npm audit reports 0 vulnerabilities across 339 dependencies. Test cleanup verified temporary and official-roster records were removed. Sprint remains In Progress pending Node 20, production deployment settings, keyboard/contrast and independent review.

## 2026-11-02 — Sprint 1 finalization checks (In Progress)

- Keyboard-only review passed across login, registration and Admin account controls; input labels, focus sequence and focus visibility were verified. WCAG 2.1 AA text and interactive-boundary contrast ratios were measured and recorded in T17; low-contrast input and secondary-button borders were corrected.
- Admin UI review found authenticated `GET /auth/admin/users` was incorrectly behind CSRF middleware, causing the account list to show a token error. CSRF now applies only to state-changing Admin routes; the GET path works without a CSRF token and has an integration assertion.
- Added deployment requirements for HTTPS/TLS termination, exact `WEB_ORIGIN`, trusted proxy allowlist, `COOKIE_SECURE=true`, one-time secret injection and shared rate-limit storage before multi-process deployment. No production environment was tested.
- Final verification after these changes: `npm run db:generate`, `npm run db:deploy` (no pending migration), typecheck, build, `npm audit` (0 vulnerabilities/339 packages), full opt-in suite 13/13, and default suite 7 passed/6 skipped. Database fixtures were cleaned.
- Sprint remains In Progress pending independent reviewer findings and sign-off. Node 20 verification passed after updating the incompatible Vitest test-runner dependency, with the Node baseline preserved.

## 2026-11-02 — Node 20 verification and reviewer handoff (In Progress)

- Provisioned Node 20.20.2/npm 11.20.0 temporarily; changed only the test-runner dev dependency from Vitest 5.0.5 (engine excludes Node 20) to Vitest 4.1.12 (Node 20 supported). Node baseline unchanged.
- Clean `npm ci` in an isolated copy completed with zero vulnerabilities; Prisma generate/deploy, typecheck, build and full DB + supplied official-roster test suite passed (13/13).
- Created `SPRINT-1-REVIEW-HANDOFF.md` and `SPRINT-1-REVIEW.patch` against baseline `4bd8740`. Independent reviewer feedback is still pending and is not claimed.
- Sprint DoD remains In Progress until reviewer findings/disposition are recorded. HTTPS/origin/proxy/Secure-cookie target checks and shared rate-limit storage before multi-process deployment remain deployment prerequisites.

## 2026-11-04 — F-01 remediation (verification blocked)

- Password hash update, revocation of all active sessions, and `AUTH_PASSWORD_CHANGED` audit insert now use one Prisma transaction. Argon2id hashing remains outside the transaction; a conditional old-hash update returns 409 for stale concurrent password-change requests.
- Added one success integration test and three PostgreSQL-trigger fault-injection cases covering failures at password update, session revocation and audit insertion. The tests assert rollback state, old-session validity on failure, and absence of credentials/hash in logs and audit.
- Prisma Client generation succeeded on Node 20.20.2/Prisma 6.19.3 by setting `PRISMA_QUERY_ENGINE_LIBRARY` to the engine bundled in `@prisma/engines`. Plain generation hits `EPERM` updating the existing cache engine timestamp; no cache or dependency was removed.
- Node 20 typecheck/build and dependency audit passed (0 vulnerabilities). PostgreSQL at `localhost:5432` was unavailable: `db:deploy` could not connect, targeted F-01 tests failed during fixture setup (4/4), and default suite was 6 passed, 10 skipped, 1 DB-readiness failure. No rollback proof is claimed; Sprint remains BLOCKED pending PostgreSQL verification and independent re-review.
# 2026-11-05 — Sprint 1 final verification follow-up

- PostgreSQL Docker container was healthy; Prisma confirmed three migrations applied and schema up to date (read-only check).
- F-01 password-change happy path and all three injected PostgreSQL rollback cases passed (4/4); full opt-in suite passed under Node 26.13.0 (15 passed, 2 skipped).
- Node 20.20.2 full suite remains blocked by Vitest worker processes exiting before test execution. Independent reviewer re-review is still pending; Sprint 1 remains blocked and unaccepted.

