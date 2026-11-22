# API Authentication Contract

**Version:** 1.4 · **Tanggal:** 2026-11-22 · **Status:** Hardened for production configuration (CORS, SMTP, PostgreSQL rate limiting, paginated Admin accounts)

Base URL is `http://localhost:3000` in integrated local development. JSON errors follow `{ "error": { "code", "message", "requestId"? } }`. Password hashes and submitted passwords are never returned; a generated temporary credential is returned once by Admin provisioning. Session credentials are opaque random tokens; only SHA-256 token digests are stored in `sessions`.

| Method and path | Access | Request / result |
|---|---|---|
| `POST /auth/register` | Public | `{email,nim,password}`. Email normalized and checked against `STUDENT_EMAIL_DOMAINS`, then against one eligible, unused roster entry. The entry is atomically claimed once; creates MAHASISWA/PENDING (`202`). Password min 12 characters. |
| `POST /auth/login` | Public, rate limited | `{email,password}`. On success sets host-only `lms_session` HttpOnly and `lms_csrf` readable cookie (`SameSite` controlled by `COOKIE_SAME_SITE`, default `lax`, `Secure` in prod); returns safe profile. Generic `401` for invalid, absent, or inactive credentials. |
| `POST /auth/forgot-password` | Public, PostgreSQL rate limited | `{email}` (trimmed & lowercased). Protected by dual PostgreSQL counters (`PASSWORD_RESET_IP_LIMIT` per IP and `PASSWORD_RESET_ACCOUNT_LIMIT` per HMAC-keyed normalized email across IPs). Invalidates prior unused tokens, creates a 32-byte CSPRNG SHA-256 token, and sends `/#resetToken=<token>` via SMTP (`nodemailer`). Returns generic `200` when deliverable or enumeration-safe, `429` with `Retry-After` when throttled, or `503 EMAIL_DELIVERY_FAILED` after invalidating the created token on SMTP failure. Sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| `POST /auth/reset-password/verify` | Public, PostgreSQL rate limited | `{token}` in JSON body (never URL query params). Verifies active, unused, unexpired token for an `ACTIVE` user; returns `{ valid: true }` (`200`) or `400 INVALID_RESET_TOKEN`. Sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| `POST /auth/reset-password` | Public, PostgreSQL rate limited | `{token,newPassword}` (min 12 chars). Atomically claims token inside a DB transaction, updates Argon2id hash, increments `auth_version`, revokes all active sessions, writes `AUTH_PASSWORD_RESET_COMPLETED` audit event, and clears auth cookies. Sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| `POST /auth/logout` | Active session + CSRF | Send `X-CSRF-Token` equal to CSRF cookie. Revokes current session and clears cookies. |
| `GET /auth/me` | Active session | Returns safe profile, role and `mustChangePassword`. |
| `POST /auth/change-password` | Active session + CSRF | `{currentPassword,newPassword}`. Minimum 12 chars for new password. Hash update, revocation of all active sessions and audit insert run in one transaction; clears cookies on success. A stale concurrent password change returns 409 `PASSWORD_CHANGE_CONFLICT`. |
| `GET /auth/admin/users` | ADMIN session | Query: `page` (default `1`), `limit` (default `25`, max `100`), `search` (escaped `ILIKE` on `full_name` and `email`), `role` (`ALL\|ADMIN\|DOSEN\|MAHASISWA`), `status` (`ALL\|ACTIVE\|INACTIVE\|PENDING`). Returns `{ users, pagination: { page, limit, total, totalPages }, totalAccounts }`. Read-only GET does not require CSRF. |
| `POST /auth/admin/roster/import` | ADMIN + CSRF | `{csv}`. Parses UTF-8/UTF-8-BOM semicolon CSV with `nim`, `nama`, `email`, `status`; tolerates only wholly blank leading padding columns and empty lines. Accepts only `layak`, validates configured domains, rejects malformed rows atomically (400) and stored identity conflicts with 409, and returns counts without personal data. |
| `GET /auth/admin/roster/export` | ADMIN session | Exports roster rows as UTF-8 BOM semicolon CSV and writes `ADMIN_ROSTER_EXPORTED` audit event. |
| `POST /auth/admin/instructors` | ADMIN + CSRF | `{email,fullName}`. Creates DOSEN with generated temporary credential returned once; must change on first sign-in. |
| `PATCH /auth/admin/users/{id}/status` | ADMIN + CSRF | `{status:ACTIVE\|INACTIVE\|PENDING}`. Revokes sessions immediately. |
| `PATCH /auth/admin/users/{id}/role` | ADMIN + CSRF | `{role:ADMIN\|DOSEN\|MAHASISWA}`. Revokes sessions and writes audit event. Assigning DOSEN issues a random one-time temporary password and requires password change. |

All non-public routes deny access unless a valid, unexpired, unrevoked session belongs to an ACTIVE account. Authorization uses the server-side role. CSRF validation binds state-changing requests to the active database session.

## CORS, Cookies, and Environment

- `WEB_ORIGIN` (default `http://localhost:3000`) and optional `CORS_ALLOWED_ORIGINS` define the exact origin allowlist (`parseExactOriginUrl`, no wildcards/paths). Requests with an untrusted cross-site `Origin` on `/auth/*` and `/api/*` are rejected with `403 CORS_ORIGIN_DENIED`; credentials (`Access-Control-Allow-Credentials: true`) are only echoed for allowlisted origins.
- `COOKIE_SECURE` must be `true` when `NODE_ENV=production` or when `COOKIE_SAME_SITE=none`. Cookie secure flagging also requires the request itself to be HTTPS (`req.secure` honored only from configured `TRUST_PROXY`).
- `COOKIE_SAME_SITE` defaults to `lax` (supports `lax`, `strict`, `none`). Cookies are host-only (no `Domain` attribute).
- `TRUST_PROXY` defaults to `loopback`, accepts `false`, integer hop count `1–5`, named Express subnets (`loopback`, `linklocal`, `uniquelocal`), or IP/CIDR allowlists, and explicitly rejects `'true'`.
- `NODE_ENV=production` enforces fail-closed startup validation: requires `COOKIE_SECURE=true`, `https://` on `WEB_ORIGIN` and `CORS_ALLOWED_ORIGINS`, `PASSWORD_RESET_DEV_PREVIEW=false`, and valid `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`.
- `SESSION_TTL_HOURS` defaults to `12` (`1–168`). `PASSWORD_RESET_TTL_MINUTES` defaults to `30` (`5–120`).
- `STUDENT_EMAIL_DOMAINS` is a comma-separated allowlist defaulting to `unimed.ac.id,mhs.unimed.ac.id`.

## Rate Limiting

- **Password reset (`forgot-password`, `reset-password/verify`, `reset-password`):** Uses atomic PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` counters in `rate_limit_buckets` with HMAC-SHA256 bucket keys (`RATE_LIMIT_SECRET`). Defaults: `PASSWORD_RESET_IP_LIMIT=20`, `PASSWORD_RESET_ACCOUNT_LIMIT=5`, `PASSWORD_RESET_WINDOW_MINUTES=15`.
- **Login, registration, and class join:** Still use in-memory fixed-window limiters per API process; move these remaining limiters to PostgreSQL/Redis before running multi-instance replicas.

