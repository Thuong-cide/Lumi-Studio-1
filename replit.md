# Lumière Studio

A SaaS platform for photography studios to manage client photo albums, track selections, and deliver galleries online.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Lumière artifact at `/`)
- API: Express 5 (api-server artifact at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Auth: JWT via HTTP-only cookie (`lumiere_token`)

## Where things live

- `artifacts/lumiere/` — React frontend (all pages: login, register, admin, studio dashboard, public gallery)
- `artifacts/api-server/` — Express backend (auth, admin, studio, photos, drive proxy, public routes)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/db/src/schema/index.ts` — Drizzle ORM schema (admin_users, studios, albums, photos, selections)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas

## Architecture decisions

- JWT stored in HTTP-only cookie (`lumiere_token`) — no localStorage tokens
- Google Drive used as photo storage backend; files served through `/api/drive/proxy/:fileId`
- Public gallery pages require no auth — accessed via `/album/:slug`
- Admin seeded manually via `admin_users` table (no self-registration for admins)
- Zoom fullscreen in gallery uses native touch events only (no external gesture library)

## Product

- **Admin**: Approve/disable studios, view platform stats
- **Studio Dashboard**: Create and manage photo albums, upload images to Google Drive, view client selections
- **Public Gallery**: Clients enter their name, browse photos, heart-select them, add notes — all without an account

## User preferences

- Language: Vietnamese UI throughout
- Zoom fullscreen feature (Lumière v5.1 spec): pinch-to-zoom, double-tap (2.5×), pan, swipe-to-navigate at 1×

## Gotchas

- Admin default credentials: `admin@lumiere.vn` / `admin123456` (change in production)
- Google Drive integration requires: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` env vars
- `JWT_SECRET` env var should be set in production (defaults to a dev secret)
- After any OpenAPI spec change, run codegen before touching frontend hooks
- `SESSION_SECRET` is available as a Replit secret

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
