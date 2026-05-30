# Week 1 Implementation Guide

Step-by-step checklist for the MKChain monorepo foundation.

## What was built

| Step | Deliverable |
|------|-------------|
| 1 | `apps/api/` — FastAPI (moved from `backend/`) |
| 2 | `apps/web/` — Next.js 15 auth + dashboard |
| 3 | `infra/supabase/migrations/` — profiles, orgs, memberships |
| 4 | `core/config`, logging, `/health` |
| 5 | JWT middleware + `GET /api/v1/me` |

## Step 1 — Run Supabase migrations

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor.
2. Run in order (copy full file contents each time):
   - `infra/supabase/migrations/001_profiles.sql`
   - `infra/supabase/migrations/002_organizations.sql`
   - `infra/supabase/migrations/003_forensics_tenant.sql` (optional if no forensics tables yet)
   - `infra/supabase/migrations/004_backfill_orgs.sql` (if you have existing users)

3. Verify in Table Editor: `profiles`, `organizations`, `memberships`.

## Step 2 — Configure API

```bash
cd apps/api
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — Supabase connection string (Settings → Database) **or** local Docker URL
- `SUPABASE_JWT_SECRET` — Supabase Settings → API → JWT Secret
- `SUPABASE_URL` — your project URL
- `REQUIRE_AUTH=false` for local dev (legacy `/api/analyze` still works without JWT)

Install and run:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Test:

- http://localhost:8000/health
- http://localhost:8000/docs

## Step 3 — Configure web app

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Edit `.env.local` with Supabase URL + anon key.

Test flow:

1. http://localhost:3000/auth/signup
2. http://localhost:3000/dashboard — should show organization + plan
3. With browser logged in, get session token and call:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" http://localhost:8000/api/v1/me
```

## Step 4 — Docker (optional local DB)

```bash
docker compose up
```

API: http://localhost:8000

## Legacy frontend (Vite)

The Vite app in `frontend/` still points at the old API. Week 2+ will migrate analyze/results pages into `apps/web/`.

## Next: Week 2

- API key generation + hashing
- Upstash Redis rate limits
- `/api-keys` dashboard page
