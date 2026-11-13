# Client store (legacy — being removed)

`CampusFleetStore` is a browser singleton (`index.ts`) split across files by prototype augmentation:
`_base.ts` (state, subscribe/notify, cross-tab broadcast), `sync.ts` (loading data), `crud.ts` (writes through the
`/api/db` proxy), `booking.ts`, `auth.ts`, `getters.ts`, `graph.ts`.

It is the main cause of slowness and flicker (see `docs/CODEMAP.md` → "Client store"):
- Loads whole tables into the browser (`/api/sync/state` returns every trip ever).
- `notify()` re-renders every subscriber and makes other tabs re-sync everything.
- Marks itself ready after 2.5 s whether or not data arrived.

## Rules
- Do not add new state, getters or syncs here. New screens fetch from a dedicated API route instead.
- When a portal is rebuilt (Phases 2–4), remove its dependency on the store; delete the store in Phase 5.
- If you must fix a bug here, keep it minimal and note it in `docs/CODEMAP.md`.
