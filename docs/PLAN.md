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

## Phase 0.5 — Boarding chart ✅ (two follow-ups open)
Rules agreed with the owner:
- Cutoff = each shift's `booking_cutoff_minutes`, edited in Transport Admin → Shifts.
- Absent on the incoming trip → the outgoing seat is **kept**, but the student must confirm it in a
  My Commute popup before the final chart; unconfirmed seats are released at the cutoff.
- Scheduling runs in Postgres (`pg_cron`, every 5 min) because Vercel Hobby crons run only daily.
Steps:
- ✅ `boarding_chart_tick()` + `respond_outgoing_seat()` + pg_cron job (migration `20261113d_boarding_chart.sql`, applied).
- ✅ API `/api/students/outgoing-seat` + popup in My Commute.
- ✅ Daily trip creation by Vercel cron (00:05 IST) instead of the first browser that opens the app.
- ✅ Page-open auto-assign is race-safe (upsert ignoreDuplicates); the chart is the main source.
- ⬜ Rollover gives each bus only one outgoing shift (rotation); students whose class uses the other outgoing shift on that route get no seat. Decide: one trip per route per active outgoing shift.
- ⬜ Notifications when the chart is ready / seat released.

## Phase 1 — Foundation ✅ (remaining items move with Phase 2)
- ✅ Tailwind: `tailwindcss-animate`; `4.5`, `13`, `shadow-xs/2xs`, `backdrop-blur-xs` defined; colour tokens wrapped in `hsl()`.
- ✅ Viewport: zoom allowed, `viewport-fit=cover`; safe-area padding on header, bottom nav, sheets, floating buttons (now above the nav); shells use `dvh` and `overflow-x-clip`; header brand can shrink.
- ✅ Seat card boarding text built from `validation_locks` (no more "scan QR" when only Face ID is on).
- ⬜ Remaining per-screen overflow fixes (fixed `min-w-[…]` tiles, unprefixed 3-col grids) — done screen by screen in Phases 2–4.
- ✅ Shared components in `src/components/ui` (`cn`, Button, Card/CardHeader, Badge, Stat, Field/Input/Select/Textarea, Sheet, EmptyState, Segmented); used by the rebuilt crew screens and the seat-confirmation popup. `no-scrollbar` utility added (was used but undefined).
- ⬜ AppShell / MapLayout / List / Toast primitives — added as Phase 2 screens need them.
- ✅ Generated DB types `src/lib/database.types.ts` (`tools/gen-db-types.sh`) and typed client `db` (new modules use it; it already caught 3 null bugs).
- ✅ New routes validate input with zod.
- ⬜ TanStack Query: introduced with the first Phase 2 screen that needs client caching (not added unused).
- ✅ One rule for subscription access: `getStudentAccess()` (`src/lib/student-access.ts`) used by the portal layout and a new server-side onboarding layout; client no longer second-guesses it (fixes onboarding ↔ portal flicker).
- ✅ Attendance policy rendered by the server into `AttendancePolicyProvider` (portal, conductor and driver layouts; Redis 30 s, invalidated on save); no localStorage, a failed refresh keeps the last value. Settings API takes the actor from the session, not the body.
- ✅ New driver/conductor accounts get a linked staff row automatically (trigger `trg_ensure_crew_staff`, migration `20261113f`; 9 unlinked crew backfilled).

## Phase 2 — Student portal 🔄
- ✅ Single-page onboarding: details → home & pickup → live photo (+ optional Face ID: look straight, turn to a random side, look straight) → summary & pay. No file upload. Data from the server only (`/api/students/onboarding`, `/api/students/pickup-options`, `/api/academic/cascade`); no placeholder address, zone, fee or route. Old 3-step wizard and `FaceIdEnrollmentModal` deleted.
- ✅ Face ID fixes: skin-colour fallback and accessibility bypass removed; head turn measured with the face-service yaw ratio from MediaPipe landmarks (same measure client and server, instead of the transformation matrix); one-time challenge token (`/api/biometrics/challenge`); enroll-v2 rejects frames with no straight or no turned pose.
- ✅ Students who decline Face ID take a live photo only (`/api/students/portrait`, no template).
- ✅ `/api/students/profile` ignores `photoUrl` from students (no more base64 overwrite) and no longer clears zone/stop/emergency contact when they are omitted.
- ✅ Boarding methods follow `validation_locks` everywhere: every boarding API refuses a switched-off method (403 `METHOD_DISABLED`); student text comes from `boardingWays()`; `/portal/qr` lists only active methods; seat card says "Not checked in" instead of "Locked • Scan to Reveal"; QR pass buttons only when the QR pass is on; nav tab renamed "Boarding".
- ✅ Payments page rebuilt: server builds one view model (fee from `getSemesterFee`, same as create-link); "Not set" instead of the Zone B / ₹12000 / ₹14000 fallbacks; history as a list. create-link only redirects back to `/portal/*` (no open redirect).
- ✅ Settings home + stop rebuilt on the onboarding picker (`HomeStopSettings`, `/api/students/home-location` rewritten on `lib/students/home.ts`); it no longer books a seat on an arbitrary trip. `CommuterHomeLocationCard` and `zone-detector` deleted.
- ✅ `store.updateStudentProfile` removed (it wrote defaults and wrote to the DB from the browser). Staff photo replacement goes through `/api/students/[id]/portrait` (private); public `upload-receipt` deleted.
- ✅ Payment records no longer store "ZONE_B" / "Student Commuter" when the value is unknown (webhook, verify-link, reconcile cron).
- ✅ Live radar rebuilt (`/portal/radar`, ~300 lines replacing 1,400): server sends only the student's own ride (`lib/students/ride.ts`; no trip ids, no all-buses/all-staff lists, no first-bus or fake-coordinate fallbacks); one `/api/students/ride/live` call every 5 s while visible replaces the GPS, trip and halt polls; "Ask bus to wait" goes through `/api/students/ride/halt` (trip chosen on the server). `/api/dispatch/halt-requests` POST now requires a reservation on the trip for non-staff. `/api/telematics/live` GET needs a session; riders no longer see trip/driver fields, the all-bus list, history or stats.
- ⬜ Push instead of polling for the radar (Supabase Realtime needs Supabase-signed tokens; our auth is custom). Revisit if polling load matters.
- ⬜ `/api/telematics/live` POST accepts unsigned location updates (open DEVICE_PATH). Require a crew session or a device signature once all GPS hardware signs requests.
- ⬜ Watch `ENROLL_POSE_REJECTED` rows in `biometric_access_log` after release; tune `FACE_ENROLL_TURN_MIN` or set `FACE_ENROLL_POSE_CHECK=off` if real students fail.
- Commute hub, pass/QR, radar (one realtime channel instead of 3 polling loops), payments, settings.
- Boarding text/buttons built from `validation_locks` (fixes "QR scan" shown when only Face ID is on).
- Remove `store` usage from portal; fix onboarding flicker (single redirect rule).

## Phase 3 — Conductor and driver 🔄 (pulled forward on owner request)
- ✅ Crew no longer choose a bus: duty = trips where `driver_id` / `conductor_id` = their staff id (set by transport manager / rollover). `CrewBusSelectorModal` deleted.
- ✅ Crew logins linked to staff rows (migration `20261113e_crew_duty.sql`, 28 rows); unique `staff.user_id`.
- ✅ Server duty module `src/lib/crew/duty.ts` + `/api/crew/duty`, `/api/crew/trip` (driver start/stop/end), `/api/crew/attendance` (`crew_mark_attendance` RPC), `/api/crew/sos` (`vehicle_issues`).
- ✅ Conductor context rewritten on `/api/crew/duty` (8 s poll; no client store, no 300-trip/500-reservation downloads).
- ✅ Seat map shows chart students without a seat; tap student → tap free seat boards them there.
- ✅ Driver console rewritten (`DriverConsole.tsx`, ~350 lines replacing 3,400): assigned trip, start/arrived/end, real GPS only, auto-arrive 150 m, Google Maps navigation, real SOS reports, Face ID door camera when enabled.
- ✅ Drivers can no longer open `/conductor`; conductor's radar is read-only for trip state.
- ✅ Pass scanner no longer verifies locally when the server is unreachable.
- ⬜ Rewrite ManifestTab / HaltRequestsTab / AuditTab / ConductorLiveRadarView UI on shared components (they now run on the new data).
- ⬜ Every boarding API refuses methods whose lock is off.

## Phase 4 — Admin portals ⬜
- Transport admin / manager / admin on shared components; merge duplicates (salary ×2, maintenance ×2, users ×2, campuses ×2, trips ×2).
- Chat: MongoDB → Postgres + Supabase Realtime. Live location: Redis only.
- Teacher gate-pass: hidden until students can create requests (or finish it).

## Phase 5 — Remove legacy ⬜
- Delete `src/lib/store/*`, `/api/db` proxy, `/api/sync/state`, MongoDB, Leaflet.
- Playwright screenshot checks at 360/375/390 px (no horizontal scroll) for student, conductor, driver routes.
