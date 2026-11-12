# Database Schema Sprint 1

**Version:** 1.0 · **Tanggal:** 2026-11-01 · **Status:** In Progress

PostgreSQL schema is managed by Prisma at `apps/api/prisma/schema.prisma`. The Sprint 0 `users` and `student_roster` tables remain; Sprint 1 adds `sessions`, `audit_events`, `users.must_change_password`, and roster claim fields.

| Table | Purpose and safeguards |
|---|---|
| `users` | Unique normalized email, Argon2id hash, full name, one of ADMIN/DOSEN/MAHASISWA, ACTIVE/INACTIVE/PENDING status, auth version and forced-password-change flag. Hash excluded from API selections. |
| `student_roster` | Unique NIM and email, name, `registration_eligible`, nullable `registered_at`, and unique nullable `registered_user_id`. `layak` imports as eligible. Registration claims a row once. Eligibility is separate from `users.status`; new accounts remain PENDING until Admin activation. |
| `sessions` | User FK with cascade deletion, unique SHA-256 digest of high-entropy session token, CSRF token digest, expiry, revocation timestamp; indexed by user/status/expiry. Raw session token is not stored. |
| `audit_events` | Action, optional actor/subject IDs, JSON details defaulting empty and creation time. Current auth events omit credentials, hashes, tokens and unnecessary personal data. |

Migrations `20261101093445_auth_sessions_audit` and `20261101093446_student_roster_eligibility_claim` were applied to the configured local PostgreSQL database on 2026-11-01. The latter renames the former roster `active` column to `registration_eligible` while preserving existing values, and adds one-time claim fields; it does not alter `users.status`. This is identity/auth schema only, not the final LMS ERD.
