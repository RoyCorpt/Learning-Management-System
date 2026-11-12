# Sprint 1 Test Plan and Results

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

**Version:** 1.8 · **Tanggal pemeriksaan:** 2026-11-06 · **Status:** PASS — Sprint 1 DoD met; Node 20/official-CSV suite and independent review recorded

Results below were executed on branch `codex/sprint-1-auth`. On 2026-11-05, Docker Desktop reported `lms-ptik-postgres` healthy (PostgreSQL 16, host port 5432); Prisma read-only migration status confirmed all 3 migrations applied. The opt-in API suite ran against this database. The supplied official CSV path was not configured in this run, so that file-specific test remained skipped.

The pre-F-01 13/13 run below is historical only. Updated post-F-01 evidence is recorded per row. Node 26.13.0/npm 11.20.0 was the current shell runtime; Node 20.20.2 was also invoked directly.

| ID | Test case | Current evidence/status |
|---|---|---|
| T00 | Reproducible install / Node compatibility | PASS for the supplied Node 20.20.2 runtime test run: 19/19 tests passed with no skips, including Argon2-dependent API flows. Earlier worker/install failures in the reviewer copy are superseded. The launcher itself was not run end-to-end. |
| T01 | Build all workspaces | PASS after F-01 change: `npm run build` under Node 20.20.2; shared, API and web built, Vite emitted production assets. |
| T02 | Typecheck all workspaces | PASS after F-01 change: `npm run typecheck` under Node 20.20.2. |
| T03 | Automated suite | PASS on Node 20.20.2 per supplied output: 3 files passed; 19 passed, 0 failed, 0 skipped. Includes bootstrap, logout rollback, Admin lifecycle, official `roster_resmi.csv` import/registration, and Argon2-dependent API flows. F-01 PostgreSQL targeted suite separately passed 4/4; F-02 PostgreSQL logout rollback and full Node 24 suite passed 7/1 skipped and 16/2 skipped. |
| T04 | Prisma Client generation | PASS under Node 20.20.2 with `PRISMA_QUERY_ENGINE_LIBRARY` pointing to the bundled `node_modules/@prisma/engines/query_engine-windows.dll.node`; Prisma 6.19.3. Plain generation fails with `EPERM` updating timestamp in `apps/api/node_modules/.cache/prisma/.../libquery-engine`. |
| T05 | Migration deployment status | PASS: Prisma `migrate status` connected to `lms_ptik`; 3 migrations found and schema up to date. This was read-only; no migration was applied during this check. |
| T06 | Dependency audit | PASS: `npm audit` reports 0 vulnerabilities. |
| T07 | `/health` and `/ready` live HTTP smoke | PASS in the Node 26.13.0 full suite with database available; readiness returned HTTP 200 and database check `ok`. |
| T08 | Valid/invalid/unknown/inactive login and generic errors | PASS: valid login works; unknown and inactive accounts produce identical generic 401 response. |
| T09 | Rate limit per identifier and IP | PASS: per-identifier limit returns 429; a separate integration case used distinct identifiers and observed the aggregate per-IP 429. |
| T10 | Logout, expiry and revoked token rejection | PASS: logout requires CSRF, revokes session, and old session receives 401; expired DB session also receives 401. |
| T11 | RBAC cross-role denial, forged role, deny-by-default | PASS: MAHASISWA and DOSEN denied Admin routes; forged `X-Role: ADMIN` does not elevate a Mahasiswa session. |
| T12 | Deactivate user then old session denied | PASS: inactive account's existing session is rejected; Admin status change revokes the target Admin session. Last active Admin guard returns 409. |
| T13 | Official CSV, registration and import consistency | PASS: supplied UTF-8 BOM/semicolon file imported; one eligible identity registered once as MAHASISWA/PENDING; reimport preserved claim; reuse, wrong NIM/domain and unknown status rejected. Partial batch conflict returned 409, made no earlier-row write, and wrote no success audit. Temporary fixtures were cleaned. No roster row values are recorded here. |
| T14 | Bootstrap one-time behavior and secret output | PASS: local DB had no Admin; CLI created one temporary Admin, repeat invocation refused, no password appeared in output, and test cleanup removed account/audit. The bootstrap query initially failed on PostgreSQL `void` result; implementation now uses serializable transaction and passed rehearsal. |
| T15 | Dosen provisioning, password rotation, role/status and audit | PASS: Admin-created Dosen receives a generated credential, `mustChangePassword=true`, successful change invalidates old session; duplicate email returns 409; role change revokes session and audit is present. |
| T16 | CSRF and cookie attributes | PASS: missing and invalid CSRF return 403; session cookie is HttpOnly, CSRF cookie readable, both SameSite Strict. Admin GET succeeds without CSRF; state-changing Admin routes retain CSRF. Production `Secure` guard is code-reviewed; production HTTPS is not configured/tested. |
| T17 | Responsive, keyboard and contrast review | PASS on login, registration and Admin account views: keyboard-only traversal reached brand, mode buttons, labeled inputs, submit controls, file import, role/status selectors and logout in DOM order. Registration mode switch works with Enter; focus remains visible (native 1px dark outline on buttons/links; custom green input border plus 3px ring). Inputs have programmatic labels. Contrast ratios: body 12.43:1; muted text 4.95:1; accent text 4.55:1; labels 7.87:1; primary button 9.63:1; secondary button text 8.55:1; feedback 6.84:1; input and secondary-button borders 3.78:1; native select border 4.54:1; focus border 4.90:1. These meet WCAG 2.1 AA text (4.5:1) and non-text (3:1) thresholds. Card/divider lines measure 1.23:1 / 1.21:1 but are decorative grouping only, not control/state boundaries. Prior 360px inspection found no horizontal overflow. |
| T18 | Secret leakage in logs | PASS: observed request logs contain request ID, method/path/status/duration only; bootstrap output omitted credentials; server error handler records category without exception text. The integration transcript contained no roster values. |
| T19 | Roster parser unit validation | PASS: parser tests cover valid official shape, unexpected header, missing values, duplicate identities, unknown status and disallowed domain. |
| T20 | Admin-only roster import | PASS: Admin import succeeded; MAHASISWA import attempt received 403. |
| T21 | Eligibility separate from account status | PASS: roster eligibility remains true while new account is PENDING; reimport preserves `registered_at` and `registered_user_id`. |
| T22 | Dependency tree and secret-file handling | PASS: `npm ls --depth=0`; `.env` is ignored by `.gitignore` and absent from Git status. No production secret was found in tracked changes. |
| T23 | Diff hygiene and migration state | PASS: `git diff --check` against `4bd8740`; branch remains uncommitted. Current migration state is unverified because PostgreSQL is offline (T05). |
| T24 | F-01 atomic password change and rollback injection | PASS on PostgreSQL 16 using Node 26.13.0: all 4 tests passed. Verified successful password rotation and rollback for failures at user update, session revocation, and audit insert; old credentials/sessions, account flags/version, audit state, and log redaction assertions passed. |

## Remaining verification

- Review production `Secure` cookie, exact origin, TLS and proxy settings in the deployment environment; these are documented but not production-tested.
- Independent re-review is recorded in `SPRINT-1-REVIEW-REPORT.md`; the project owner delegated Sprint acceptance to the team, so no additional owner sign-off is required.
- The supplied Node 20.20.2 full-suite result supersedes the earlier worker startup failure.
- Official roster file-specific coverage passed in the supplied 19/19 Node 20 run.
- In-memory rate-limit storage remains suitable only for a single API process until a shared store is configured.

Sprint 1 is **COMPLETE**. F-01 and F-02 rollback evidence is recorded, and the Node 20.20.2 suite passed 19/19 with the official roster case. Independent review is PASS. No project-owner approval is pending or required.

### Re-review follow-up — 2026-11-06

- Independent reviewer: Yeremia Christopel Sihotang; compared current source to baseline `4bd8740` and reviewed the checklist and latest PostgreSQL evidence.
- Finding F-02 (Medium/P2): logout revoked the session and inserted `AUTH_LOGOUT` audit as separate database operations. If audit insertion failed, the endpoint could return 500 after the session had already been revoked.
- Disposition: `apps/api/src/auth.ts` now performs logout revocation and audit insertion in one Prisma transaction.
- Verification: the logout-related `src/index.test.ts` passed 7 tests/1 skipped and the PostgreSQL-backed full suite passed 16/2 skipped on Node 24.22.1. The project team subsequently supplied the Node 20.20.2 full-suite output: 3 files passed, 19 tests passed, 0 failed, 0 skipped, including the official `roster_resmi.csv` test. Argon2-dependent API flows passed. The prior worker-startup failure is superseded. Reviewer recommendation: PASS; Sprint 1 DoD is complete. The Windows `start-lms.ps1` launcher was not executed end-to-end in this review session, but this is not a Sprint 1 approval gate.
