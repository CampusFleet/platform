<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->

<!-- TRANSIT DOMAIN DATA ARCHITECTURE START -->
## Transit Domain Rules: Bus, Shift, Route, and Trip Hierarchy

1. **Hierarchy & Entity Definitions**:
   - **`Bus`**: Physical vehicle asset (`id`, `bus_number`, `registration_no`, `capacity`, `gps_device_id`).
   - **`Shift`**: Temporal transit schedule window (`id`, `name`, `type`, `start_time`, `end_time`, `direction`).
   - **`Route`**: Geographic line/corridor comprising an ordered sequence of physical stops (`route_stops`).
   - **`Trip`**: **Internal operational dispatch instance** combining (`Bus` + `Route` + `Shift` + `Date`).

2. **Public vs. Internal Isolation (Strict Non-Negotiable Rule)**:
   - **`Trip` (`trip_id`, `trip_code`) is strictly for INTERNAL usage**:
     - Used by telematics ingestion, backend dispatch engines, driver console GPS broadcasts, conductor manifests, and audit logging to identify a run at a particular time.
     - **NEVER expose or show raw `trip_id` or `trip_code` to the public or students** in the student portal, commuter pass, ticket UI, or notifications.
   - **Public / Student Facing Presentation**:
     - Commuters must only see human-friendly labels: **Bus Number** (e.g. "Bus 37"), **Shift Name** (e.g. "Morning Pick-Up"), **Route Name** (e.g. "Ganna Center Corridor"), and **Stop Departure Time** (e.g. "07:45 AM").
<!-- TRANSIT DOMAIN DATA ARCHITECTURE END -->

<!-- PROJECT GUIDE START -->
## Working on this repo

**Read `docs/CODEMAP.md` first.** It maps every feature (pages, API routes, lib functions, tables, Redis keys,
known issues) and records decisions already made. `docs/ROUTES.md` is the generated list of pages and routes
(`node tools/gen-route-index.mjs`). Folders may have their own `AGENTS.md`; the nearest one applies.

### Commands
- Type check: `npx tsc --noEmit -p .` (must be 0 errors; if it reports missing `.next/types/...`, run `rm -rf .next/types` first)
- Tests: `npx vitest --run`
- Deploy: push to `main` (Vercel deploys automatically). Database migrations are NOT applied by the deploy: add a file in `supabase/migrations/` and apply it to production yourself.

### Production database
- The live Supabase project is `zdjooiztjzmbiwaknfir` (from `vercel env pull --environment=production`, `POSTGRES_PRISMA_URL`).
- `hwawknnnolbxjvbylqkw` (in the old `.env.production` file) is an outdated copy. Never apply migrations only there.
- Never commit connection strings or keys. Never print secrets in tool output.

### Rules
- Identity comes from the session only. Use `src/lib/security/actor.ts` (`resolveActingStudentId`, `isStaffRole`, `isManageRole`); never trust a `studentId` / `userId` / role in the request.
- Values interpolated into PostgREST `.or()` filters must pass `isSafeId` (`src/lib/security/safe-id.ts`).
- Writes that must succeed together go in one Postgres function called with `.rpc()` (see `delete_user_account`).
- Never show placeholder data as real (no default fee, zone, department, student ID or name). Show "Not set" or an empty state.
- Boarding instructions must come from `transport_settings.validation_locks`, never hard-coded.
- Data access in new code: `db` from `@/lib/supabaseClient` (typed from `src/lib/database.types.ts`; regenerate with `tools/gen-db-types.sh` after a migration).
- Style: typed functions + React components, no new classes. Keep route handlers thin (session → zod → service → response).
- Mobile first: test at 360 px; no fixed pixel widths without `max-w`; use `dvh`, not `vh`.
- When you change a route, page, lib export, table, Redis key or env var, update `docs/CODEMAP.md` in the same commit.
<!-- PROJECT GUIDE END -->
