# API Authentication Contract

**Version:** 1.3 · **Tanggal:** 2026-11-05 · **Status:** F-01 database tests pass; Node 20 suite and reviewer re-review pending

Base URL is `http://localhost:4000` in local development. JSON errors follow `{ "error": { "code", "message", "requestId"? } }`. Password hashes and submitted passwords are never returned; a generated temporary credential is returned once by Admin provisioning. Session credentials are opaque random tokens; only SHA-256 token digests are stored in `sessions`.

| Method and path | Access | Request / result |
|---|---|---|
| `POST /auth/register` | Public | `{email,nim,password}`. Email normalized and checked against `STUDENT_EMAIL_DOMAINS`, then against one eligible, unused roster entry. The entry is atomically claimed once; creates MAHASISWA/PENDING (`202`). Password min 12 characters. |
| `POST /auth/login` | Public, rate limited | `{email,password}`. On success sets `lms_session` HttpOnly and `lms_csrf` readable cookie, both SameSite Strict; returns safe profile. Generic `401` for invalid, absent, or inactive credentials. |
| `POST /auth/logout` | Active session + CSRF | Send `X-CSRF-Token` equal to CSRF cookie. Revokes current session and clears cookies. |
| `GET /auth/me` | Active session | Returns safe profile, role and `mustChangePassword`. |
| `POST /auth/change-password` | Active session + CSRF | `{currentPassword,newPassword}`. Minimum 12 chars for new password. Hash update, revocation of all active sessions and audit insert run in one transaction; clears cookies on success. A stale concurrent password change returns 409 `PASSWORD_CHANGE_CONFLICT`. |
| `GET /auth/admin/users` | ADMIN session | Returns up to 200 safe account records. Read-only GET does not require CSRF. |
| `POST /auth/admin/roster/import` | ADMIN + CSRF | `{csv}`. Parses UTF-8/UTF-8-BOM semicolon CSV with `nim`, `nama`, `email`, `status`; tolerates only wholly blank leading padding columns and empty lines. Accepts only `layak`, validates configured domains, rejects malformed rows atomically (400) and stored identity conflicts with 409, and returns counts without personal data. |
| `POST /auth/admin/instructors` | ADMIN + CSRF | `{email,fullName}`. Creates DOSEN with generated temporary credential returned once; must change on first sign-in. |
| `PATCH /auth/admin/users/{id}/status` | ADMIN + CSRF | `{status:ACTIVE\|INACTIVE\|PENDING}`. Revokes sessions immediately. |
| `PATCH /auth/admin/users/{id}/role` | ADMIN + CSRF | `{role:ADMIN\|DOSEN\|MAHASISWA}`. Revokes sessions and writes audit event. Assigning DOSEN issues a random one-time temporary password and requires password change. |

All non-public routes deny access unless a valid, unexpired, unrevoked session belongs to an ACTIVE account. Authorization uses the server-side role. CSRF validation binds state-changing requests to the active database session. CORS is restricted to `WEB_ORIGIN`.

Roster import, student registration, password change, bootstrap, and Admin account status/role changes keep their related writes and audit/revocation work in database transactions. Password hashing occurs before its transaction; a database failure rolls back password, session revocation and audit together. Bootstrap and Admin last-active-account checks use Serializable isolation; concurrent-write conflicts return 409. F-01 success and all three PostgreSQL rollback tests passed on 2026-11-05; see the test results for runtime details.

## Environment

`DATABASE_URL` is required. `WEB_ORIGIN` defaults to `http://localhost:5173`; `VITE_API_URL` configures the browser API base and defaults to `http://localhost:4000`. Keep frontend and API on the same site for SameSite Strict session cookies. `COOKIE_SECURE` must be `true` under `NODE_ENV=production`. `TRUST_PROXY` is empty unless the actual reverse proxy address is explicitly configured; do not trust arbitrary forwarded IP headers. `SESSION_TTL_HOURS` defaults to 12 and is limited to 1–168. `STUDENT_EMAIL_DOMAINS` is a comma-separated allowlist, defaulting to `unimed.ac.id,mhs.unimed.ac.id`. Bootstrap-only `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` are read only by `npm run db:bootstrap-admin -w @lms/api`; require a trusted shell and a one-time invocation.

Roster status `layak` sets `student_roster.registration_eligible=true`; it never activates an account. Registration atomically records `registered_at` and `registered_user_id`, creates the Mahasiswa account as PENDING, and rejects any further use of that roster row. Unknown status values are rejected. The Admin interface imports the roster file without logging or returning personal rows.

Login is limited to 10 attempts per IP+normalized identifier and 50 per IP per 15 minutes; signup is limited to 20 per IP per hour. The limiter uses an in-memory store; multi-process deployment needs a shared store before production.

## Deployment prerequisites (not production-tested)

- Serve the web app and API through HTTPS. Terminate TLS at the trusted reverse proxy, redirect HTTP to HTTPS, and prevent direct public access to the API listener.
- Set `NODE_ENV=production` and `COOKIE_SECURE=true`; the API refuses production startup if `COOKIE_SECURE` is false. Browsers must reach the API over HTTPS for the Secure cookies to work.
- Set `WEB_ORIGIN` to the exact trusted web origin, including `https://` and any non-default port. Do not use `*`; keep the web/API on the same site for `SameSite=Strict` cookies.
- Leave `TRUST_PROXY` empty when there is no proxy. When deployed behind one, set only the exact trusted proxy IP/CIDR values; never trust arbitrary forwarded headers or use an unrestricted trust setting. Configure the proxy to overwrite forwarded headers.
- Keep the in-memory rate limiter for single-process development. A shared rate-limit store is mandatory before running multiple API processes or replicas.
- Inject `DATABASE_URL` and the one-time bootstrap credentials through the deployment secret mechanism. Remove bootstrap credentials immediately after the one-time command. Do not put secrets in images, source control, or logs.

These are configuration requirements only; no production or HTTPS deployment has been exercised in this sprint.
