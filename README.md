# LMS Kampus PTIK

Greenfield LMS application for the PTIK campus project.

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
# Ganti JWT_SECRET dan CSRF_SECRET dengan nilai acak lokal yang kuat
docker compose up -d postgres
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

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
Sprint 0 foundation is in progress. The API now includes environment validation, request IDs, structured request logs, basic security middleware, database readiness checks, Prisma client lifecycle, and an initial identity/roster migration.

This is not a completed LMS and is not approved for production use. Authentication, authorization, academic workflows, file upload, notifications, rate limiting, CSRF protection, automated tests, backups, and deployment hardening remain outstanding. Do not use real student data.
