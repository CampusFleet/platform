# API routes

Map of every route: `docs/ROUTES.md` (generated) and `docs/CODEMAP.md` (by feature).

## How access works
1. `src/middleware.ts` runs first for every `/api/*` request (except `/api/auth/*`, which bypasses it).
   It rejects cross-origin writes, then calls `resolveApiAccess()` in `src/lib/security/api-access.ts`:
   - `PUBLIC_PREFIXES`: no session needed; the handler must authenticate (HMAC, CRON_SECRET, OAuth).
   - `DEVICE_PATHS`: device key / signed device OR a session (writes need a staff role).
   - `ROLE_RULES`: longest matching prefix wins. `roles` = all methods, `write` = non-GET only.
   - No rule: any signed-in user.
2. The handler must still scope data to the caller. Middleware only checks the role, not which rows.

## Template for a route handler
```ts
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);              // 1. who
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const body = Schema.safeParse(await req.json());               // 2. validate (zod)
  if (!body.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  const { studentId } = await resolveActingStudentId(session, body.data.studentId); // 3. scope
  const result = await doTheThing(studentId, body.data);         // 4. one service call
  return NextResponse.json({ success: true, ...result });        // 5. respond
}
```

## Rules
- New route → add a `ROLE_RULES` entry if it is not for every signed-in user, and regenerate `docs/ROUTES.md`.
- Never return `trip_code` / `tripCode` to students or teachers (AGENTS.md transit rule).
- `supabaseAdmin` bypasses RLS; every query must filter by the caller's own ids unless the caller is staff.
- Multi-step writes → Postgres function + `.rpc()`, not several sequential `supabaseAdmin` calls.
- Post-response work (blob deletes, notifications) → `waitUntil` from `@vercel/functions`.
- Cron routes check `isAuthorizedCron(req)` and must be listed in `vercel.json` to run.
