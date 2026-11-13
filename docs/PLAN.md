# CampusFleet rebuild plan

Decision (2026-11-13): **rebuild in place** on the existing Supabase database, one portal at a time.
Keep the visual design. Every phase is deployable on its own (push to `main` → Vercel deploys).
Status: ✅ done · 🔄 in progress · ⬜ planned. Update this file as work lands.

## Phase 0 — Cleanup and security ✅
- ✅ Remove dead code: ~95 one-off scripts, 20 components, 5 libs, 17 API routes, 9 redirect-only pages, 12 packages (−37.8k lines).
- ✅ Gate face evidence uses a private Blob store (`EVIDENCE_READ_WRITE_TOKEN`).
- ✅ Account deletion in one transaction (`delete_user_account`), erases photo/receipts/biometric files, clears every cache.
- ✅ Logout clears browser storage, service-worker caches and Redis profile keys.
- ✅ Riders can no longer read/change other students' data (`roaming`, `halt-requests`, `home-location`, db proxy); `trip_code` hidden from riders.
- ✅ `dispatch` restricted to managers; audit log records the real caller.
- ✅ QR pass uses the server-signed token.
- ✅ No fake profile defaults (student ID 2361030, "B.Tech CSE", "5th").
- ⬜ **Owner action:** rotate the Supabase DB password (committed in old scripts in git history; repo is public).

## Phase 0.5 — Boarding chart 🔄
Rules agreed with the owner:
- Cutoff = each shift's `booking_cutoff_minutes`, edited in Transport Admin → Shifts.
- Absent on the incoming trip → the outgoing seat is **kept**, but the student must confirm it in a
  My Commute popup before the final chart; unconfirmed seats are released at the cutoff.
- Scheduling runs in Postgres (`pg_cron`, every 5 min) because Vercel Hobby crons run only daily.
Steps:
- ✅ `boarding_chart_tick()` + `respond_outgoing_seat()` + pg_cron job (migration `20261113d_boarding_chart.sql`, applied).
- 🔄 API `/api/students/outgoing-seat` + popup in My Commute.
- 🔄 Daily trip creation by Vercel cron instead of the first browser that opens the app.
- 🔄 Stop creating reservations when a student opens a page (duplicate-key errors).
- ⬜ Rollover gives each bus only one outgoing shift (rotation); students whose class uses the other outgoing shift on that route get no seat. Decide: one trip per route per active outgoing shift.
- ⬜ Notifications when the chart is ready / seat released.

## Phase 1 — Foundation 🔄
- 🔄 Tailwind: add `tailwindcss-animate`; define `4.5`, `13`, `shadow-xs`, `backdrop-blur-xs`; fix colour tokens.
- 🔄 Viewport: allow zoom, `viewport-fit=cover`; safe-area padding for header, bottom nav and floating buttons; `dvh` everywhere.
- ⬜ Shared components in `src/components/ui`: AppShell, Header, BottomNav, Sheet, Modal, Button, Card, Stat, Badge, Field/Input/Select, Tabs, List/Table, MapLayout, EmptyState, Toast.
- ⬜ Data layer: TanStack Query + one typed route per screen; generated Supabase types (`supabase gen types`); zod at route boundaries.
- ⬜ One source of truth for "who am I / subscription": `/api/me`, read by the server layout and client.
- ⬜ Attendance policy served with `/api/me` (no localStorage-first, no "all on" fallback).

## Phase 2 — Student portal ⬜
- Single-page onboarding: details → home & pickup → live photo + Face ID (Google-style 3 prompts, random side, server-side pose check, no upload) → summary & pay.
- Face ID fixes: remove skin-colour fallback and accessibility bypass; 3-D head pose from MediaPipe matrices; challenge nonce.
- Commute hub, pass/QR, radar (one realtime channel instead of 3 polling loops), payments, settings.
- Boarding text/buttons built from `validation_locks` (fixes "QR scan" shown when only Face ID is on).
- Remove `store` usage from portal; fix onboarding flicker (single redirect rule).

## Phase 3 — Conductor and driver ⬜
- Manifest from the final boarding chart; walk-ons; remove the local-verification fallback in `QRPassScanner`.
- Every boarding API refuses methods whose lock is off.
- Driver console + gate camera on the new shell.

## Phase 4 — Admin portals ⬜
- Transport admin / manager / admin on shared components; merge duplicates (salary ×2, maintenance ×2, users ×2, campuses ×2, trips ×2).
- Chat: MongoDB → Postgres + Supabase Realtime. Live location: Redis only.
- Teacher gate-pass: hidden until students can create requests (or finish it).

## Phase 5 — Remove legacy ⬜
- Delete `src/lib/store/*`, `/api/db` proxy, `/api/sync/state`, MongoDB, Leaflet.
- Playwright screenshot checks at 360/375/390 px (no horizontal scroll) for student, conductor, driver routes.
