# Client cache (`store`)
`index.ts` exports `store`: a plain module (no class) holding an in-memory copy of `GET /api/client-state`
(server side: `src/lib/client-state-data.ts`). `graph.ts` has the pure stop-network helpers.
The legacy `src/lib/store` and the `/api/db` proxy were deleted in Phase 5 (see `docs/CODEMAP.md` §18).

- Current user comes from `src/lib/auth-service.ts`; logout clears everything (`clearClientUserData`).
- MANAGE roles get the admin data set; everyone else master data + their own row. Never add trips,
  bookings, other people, trip codes or device ids to the non-MANAGE payload.
- Writes call an existing server route, then re-load with `?fresh=1` before returning.

## Rules
- Do not grow this cache. New screens fetch from a dedicated API route (server page or route handler) instead.
- No localStorage, BroadcastChannel or realtime here.
- When a screen stops using a getter, remove the getter (and its data in `client-state-data.ts` if unused).
- Changes to methods or payload → update `docs/CODEMAP.md` §18 in the same change.
