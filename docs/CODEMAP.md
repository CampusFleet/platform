# CampusFleet code map

Read this before changing code. It says where every feature lives, which function does what,
which tables / Redis keys / services each feature touches, and the known traps.

- Last full survey: 2026-11-13, commit `f56debe` (after the Phase 0 cleanup).
- Keep it current: when you add, move or delete a route, page, lib export, table, Redis key or env var,
  update the matching section in the same commit. Run `node tools/gen-route-index.mjs` to regenerate
  `docs/ROUTES.md` (the exact list of pages and API routes).
- Each feature folder may also have its own `AGENTS.md` with local rules; the nearest one wins.

## Rebuild status (see the plan in the chat history / commit log)
| Phase | Status |
|---|---|
| 0. Dead code removal, security fixes | Done (`582cb5d`, `f56debe`) |
| 1. Shared UI components, Tailwind fixes, typed data layer | Done (`2a043c0`, `d03fc0a`) |
| 2. Student portal (single-page onboarding, commute, pass, radar, payments) | In progress: onboarding done |
| 3. Conductor + driver | Partly done (`175141f`) |
| 4. Transport admin / manager / admin (merge duplicate screens) | Planned |
| 5. Remove `src/lib/store/*` and the `/api/db` proxy | Planned |

## Decisions already made (do not reopen without the owner)
- Keep Supabase + `supabase-js` (no Prisma). Add generated types; multi-write operations go in Postgres functions (`.rpc`).
- Keep all four boarding methods (Face ID, conductor scans signed QR pass, student scans bus/seat QR, RFID) behind one server-side policy (`transport_settings.validation_locks`). Screens must read the policy; never hard-code instructions for one method.
- Chat moves from MongoDB to Postgres + Supabase Realtime (Phase 4).
- Live photo + Face ID are captured together on one screen; no photo upload.
- Rebuild in place, one portal at a time; folders move to `src/features/<domain>` as each portal is rebuilt.
- Code style: plain typed functions and React components, not classes. Route handlers stay thin: session → zod validate → service function → response.

## Known open issues found during the survey (fix when touching the area)
- `src/lib/attendance/policy.tsx` `useAttendancePolicy`: reads a stale value from localStorage first and defaults to "all methods on" when the server call fails.
- `src/lib/store/*`: whole-database client cache, cross-tab re-sync storm, 2.5 s "ready" race, fake defaults (fee 12000, ZONE_B). Replaced in Phases 1–5.

## Boarding chart (incoming / outgoing shifts)
Owner rules: cutoff = `shifts.booking_cutoff_minutes` (Transport Admin → Shifts, "Final Boarding Chart");
absent on the morning bus → evening seat kept only if the student confirms it before the cutoff.

| When (IST) | What | Where |
|---|---|---|
| 00:05 daily | Create today's trips | Vercel cron → `GET /api/cron/daily-rollover` → `executeDailyRollover` (`src/lib/daily-rollover.ts`) |
| every 5 min | Provisional chart: reservation for every paid student whose class has the shift today (until cutoff) | pg_cron `boarding-chart-tick` → `boarding_chart_tick()` |
| after shift end | Unboarded → `ABSENT` | same |
| morning absent | Evening reservation `needs_confirmation = true` → popup on My Commute | same; `OutgoingSeatPrompt.tsx`, `/api/students/outgoing-seat` |
| student answers | Keep (`rider_confirmed_at`) or release (`CANCELLED`, `RIDER_DECLINED`) | `respond_outgoing_seat()` RPC |
| departure − cutoff | Unconfirmed seats released (`NOT_CONFIRMED_AFTER_ABSENCE`); `trips.manifest_locked = true` | `boarding_chart_tick()` |

- Migration: `supabase/migrations/20261113d_boarding_chart.sql` (columns `bus_reservations.needs_confirmation`, `rider_confirmed_at`, `cancel_reason`).
- Re-running the tick is safe (unique `(student_id, shift_id, reservation_date)` + `ON CONFLICT DO NOTHING`).
- Pause the job: `select cron.alter_job((select jobid from cron.job where jobname='boarding-chart-tick'), active := false);`
- Known gap: rollover gives each bus one outgoing shift (rotation); students whose class uses the other outgoing shift on that route get no seat (docs/PLAN.md Phase 0.5).
- `GET /api/students/attendance` still creates a reservation for walk-ons; it now upserts with `ignoreDuplicates` (no duplicate-key errors).

## Crew duty (driver + conductor)
- Who works which trip: `trips.driver_id` / `trips.conductor_id` → `staff.id`; `staff.user_id` → `users.id`. Set by the transport manager (`/api/staff/assign-crew`, `TransportManagerCrewView`) or rollover. Crew cannot choose a bus.
- `src/lib/crew/duty.ts`
  - `getCrewDuty(session, tripId?)`: today's trips for the crew member (managers: all), current trip, manifest, attendance, active departure alert, pending halt count.
  - `pickCurrentTrip(trips)`: running → next not ended → last.
  - `loadManifest(trip)`: `bus_reservations` for the trip (not cancelled) + `students_full` names/photos; sorted by stop order.
  - `canActOnTrip(session, tripId, role)`: own assignment or manager.
- Routes: `GET /api/crew/duty`, `POST /api/crew/trip` (START / SET_STOP / END, driver), `POST /api/crew/attendance` (BOARDED / ABSENT + optional seat, conductor → `crew_mark_attendance` RPC), `POST /api/crew/sos` (→ `vehicle_issues`). Middleware: `/api/crew` = STAFF.
- Pages: `/conductor/*` (`ConductorContext` on `/api/crew/duty`, 8 s poll), `/driver` (`DriverConsole.tsx`, 15 s poll, GPS via `telematicsService.broadcastLiveLocation`). Drivers are blocked from `/conductor`.
- Student access rule: `src/lib/student-access.ts` `getStudentAccess()` — used by `src/app/portal/layout.tsx` and `src/app/portal/onboarding/layout.tsx`.

---


## 0. Cross-cutting

### Middleware and resolveApiAccess (`src/middleware.ts`, `src/lib/security/api-access.ts`)

`middleware.ts` handles requests in this order:
1. **L94-101:** static files pass through (any path containing "." outside /api).
2. **L104-115:** 301 redirects `/staff/*` to `/transport-admin/*` and `/transport-head/*` to `/transport-manager/*`.
3. **L120-122:** `/api/auth/*` skips middleware entirely, so it gets no CSRF check and no `x-request-id`. This is deliberate, to keep Set-Cookie intact.
4. **L125-137:** CSRF check on POST/PUT/PATCH/DELETE under /api, done only when an `Origin` header is present. `isOriginAllowed` (L55-88) allows:
   - same host;
   - `NEXT_PUBLIC_APP_URL`;
   - any *.vercel.app → *.vercel.app pair;
   - localhost outside production.
5. **L140-141:** JWT read from cookie `COOKIE_NAME` and checked with `verifyToken` (`src/lib/jwt.ts`).
6. **L144-178:** /api calls `resolveApiAccess(pathname, method)`:
   - **public:** passes. The handler must authenticate.
   - **device:** passes if the request has `x-cf-device` plus `x-cf-signature`, or if `x-device-key` matches `TELEMATICS_DEVICE_KEY` (at least 32 chars, compared with `safeEqual`). Otherwise a session is needed: any role for GET/HEAD, STAFF only for writes.
   - **session:** returns 401 without a session and 403 if `roles` is set and doesn't include `session.role`.
   - All /api calls get an `x-request-id`.
7. **L181-195:** `/` and `/login` redirect a signed-in user to their portal (`getTargetRouteForRole`). Signed-out `/` goes to `/login`.
8. **L198-212:** protected page prefixes (`/portal`, `/admin`, `/transport-admin`, `/transport-manager`, `/driver`, `/conductor`, `/teacher`) redirect to `/login?redirect=` and delete an invalid cookie.
9. **L215-219:** sets headers `x-user-id`, `x-user-email`, `x-user-role` and `x-request-id`.
10. **L231-259:** cross-portal guard (`allowedPortalsForRole`):
    - admin: every portal;
    - transport_admin: transport-admin, transport-manager, portal;
    - driver: driver and conductor;
    - every other role: its own portal only.

`resolveApiAccess` (api-access.ts L93-104) checks in this order:
1. **`PUBLIC_PREFIXES` (L22-30):**
   - `/api/auth`
   - `/api/payments/razorpay/webhook`
   - `/api/webhooks/`
   - `/api/cron/`
   - `/api/photo-proxy`
   - `/api/gate/captures`
   - `/api/gate/heartbeat`

   The test is `matches()` OR a raw `startsWith`, so `/api/authX` and `/api/gate/captures/[id]` also count as public.
2. **`PUBLIC_METHOD_PATHS`:** `GET /api/students/verify`.
3. **`DEVICE_PATHS` (L38):** exact match only, on `/api/telematics/live` and `/api/telematics/rfid`. Sub-paths such as `/rfid/map` and `/rfid/latest-tap` fall through to role rules.
4. **`ROLE_RULES` (L48-82):** the longest matching prefix wins. `roles` applies to all methods. `write` applies only to non-GET/HEAD/OPTIONS, so reads need just a session.
5. **No rule:** any signed-in role.

Role groups:
- `ADMIN` = admin
- `MANAGE` = admin, transport_admin, transport_manager
- `CREW` = conductor, driver
- `STAFF` = MANAGE + CREW
- `TEACHING` = teacher, admin

Handler helpers in `src/lib/security/actor.ts`:
- `isManageRole`, `isStaffRole`.
- `getOwnStudentId(userId)`: `students.id` for the user.
- `resolveActingStudentId(session, requested)`: staff may act on any student, everyone else only on themselves.

`src/lib/security/cron-auth.ts`: `isAuthorizedCron(req)` requires `Authorization: Bearer ${CRON_SECRET}`, compared with timingSafeEqual, and fails closed when the secret is unset.

### Student page-load request flow
1. **Middleware** checks the JWT, enforces the `/portal` guard and sets the `x-user-*` headers.
2. **`src/app/portal/layout.tsx`** (server):
   - calls `getSession()`;
   - reads `getCachedStudentProfile(userId)` (key `student:profile:{id}`), then `student:subscription:{userId}` and `student:photo:{userId}`;
   - on a cache miss, reads `supabaseAdmin.from("students_full")` (L41) and writes the subscription key (TTL 3600 s if subscribed, 5 s if not; L51) and the photo key (3600 s);
   - renders `ClientPortalLayout initialIsSubscribed initialPhotoUrl`.
3. **`src/app/portal/page.tsx`** (server):
   - L25-27: if `student:subscription:{userId}` is present, deletes `portal:student_row:{userId}`;
   - `getOrFetchWithCache` for `portal:student_row:{userId}`, `portal:shared_fleet_data` and `schedule:class:{class_id}:{dow}` (L30, 67, 114).
4. **`ClientPortalLayout.tsx`** (client):
   - imports `store` from `src/lib/store`;
   - subscribes with `store.subscribe` (L71) for user, students, activeChildId and `isReady`;
   - polls `/api/boarding/roaming?studentId=` every 5 s while the tab is visible (L121-165);
   - renders `UnifiedAppHeader`, `MobileBottomNav`, `SOSModal`, `AuthModal`, `BusDepartureAlertModal` and `ContactCrewModal`.
5. **Store bootstrap** (`src/lib/store/index.ts`, on module load in the browser): `loadFromLocalStorage`, `syncFromSupabase`, `initAuthSync`, `initTelematicsSync`, `initCrossTabSync`, `initSupabaseRealtime`, `initStudentPaymentSync`.
6. **`syncFromSupabase`** (`store/sync.ts` L720), each step debounced (L37-45):
   - **`syncMasterData` (L228):** `getCachedState()` (L187) calls `GET /api/sync/state`, which serves `campusfleet:state:*` from Redis. Without a session it skips other DB reads (L184).
   - **`syncLiveTransit` (L404)** and **`syncUserData` (L505):** read through the browser `supabase` client, which goes to the `/api/db/rest/v1/{table}` proxy. GETs issued within ~15 ms are combined into one `POST /api/db/batch` (`src/lib/supabaseClient.ts` L14-24).
   - **L749:** the client calls `fetch("/api/cron/daily-rollover")`.
7. **`initStudentPaymentSync`** (L96): one `GET /api/students/me` call. The 30 s interval was removed (L155).
8. **`initTelematicsSync`** (L167): subscribes to `telematicsService`. Live-radar components start its polling.

---

## 1. Auth / session

**Purpose:** OTP email login and Google OAuth, issuing a JWT cookie session.

**Pages:**
- `src/app/login/page.tsx`
- `src/app/page.tsx`
- `src/components/auth/AuthModal.tsx`

**API routes** (all public at MW; handlers authenticate themselves):

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/auth/send-otp | POST | Stores `auth_otp:{email}` (codeHash, 10 min expiry, 5 attempts; L45-56) and emails it | public | auth_otps |
| /api/auth/verify-otp | POST | Reads and deletes `auth_otp:{email}` (L55-62), creates or finds the user, sets the cookie | public | auth_otps |
| /api/auth/google | GET | Starts OAuth | public | none |
| /api/auth/google/callback | GET | Exchanges the code and sets the cookie | public | none |
| /api/auth/session | GET | Current user; caches role in `user:role:{id}` | H | users, students_full |
| /api/auth/logout | POST | Invalidates role, profile and photo caches; clears the cookie | H (verifyToken) | students |
| /api/auth/update-profile | POST | Updates profile fields | H | users, students |
| /api/auth/delete-account | DELETE | See §2 | H (verifyToken) | rpc delete_user_account |

**Lib:**
- `src/lib/jwt.ts`:
  - `signToken`: issues the JWT.
  - `verifyToken`: validates a token.
  - `getSessionFromRequest(req)`: session from a request.
  - `getSession()`: session via `cookies()`.
  - `createSessionCookie`, `clearSessionCookie`.
- `src/lib/account-service.ts`: `findOrCreateUser` (uses ADMIN_EMAIL).
- `src/lib/email.ts`: `sendOtpEmail` (GMAIL_USER, GMAIL_APP_PASSWORD, SMTP_PASS).
- `src/lib/auth-service.ts`: `authService`, the client singleton the store uses (`store/auth.ts`).
- `src/lib/clear-user-data.ts`: `clearClientUserData`.

**Gotchas:**
- Middleware skips /api/auth completely, so these routes get no x-request-id and no CSRF check (middleware.ts L120).
- `student-pass.ts` and `payroll-crypto.ts` fall back to JWT_SECRET for key material (env grep).

## 2. Users / accounts (including delete-account)

**Purpose:** admin user management, role changes, notification preferences and self-deletion.

**Pages:**
- `src/app/admin/users/page.tsx`
- `src/app/transport-admin/system/users/page.tsx` (`StaffUsersView`)
- `src/components/admin/AdminStaffView.tsx`
- `src/app/account-deleted/page.tsx`

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/admin/users | GET | List users | MW ADMIN | users |
| /api/admin/update-role | POST | Change a user's role | MW ADMIN | users |
| /api/users/update-profile | POST | Update profile | H | users, students, students_full, staff |
| /api/users/notifications | GET, POST | Notification preferences | H | users |
| /api/auth/delete-account | DELETE | Self-delete (read, see below) | H | rpc delete_user_account |

`delete-account` steps:
1. Calls `rpc("delete_user_account",{p_user_id})` (L45).
2. Invalidates the role and profile caches and `student:photo:{userId}` (L59-61).
3. After the response, deletes public Blob URLs, keeping only those whose host matches the token's store, via `del()` with BLOB_READ_WRITE_TOKEN (L69), plus evidence keys via `deleteEvidence` (L70).
4. Clears the cookie (L77-86).

**DB:** migrations `20261113_delete_user_account_fn.sql`, `20261113b_delete_user_account_files.sql`.

**Tests:** `src/test/account-deletion.test.ts`.

## 3. Student profile and onboarding

**Purpose:** KYC (profile, ID, photo), home location, zone and stop selection, pass activation.

**Pages:**
- `src/app/portal/onboarding/page.tsx`: one page, four cards (details → home and pickup → live pass photo → pay). Loads campuses, classes and stop options from the server only; keeps a localStorage draft (no photo); handles the Razorpay return (`verify-link`).
  Components in `src/components/portal/onboarding/*`: `DetailsSection` (class cascade), `HomePickupSection` (address search, GPS, pin map, stop list), `LiveFaceCapture` (camera, see section 9), `OnboardingHeader`, `form.ts` (form type, `formProblems`, `phoneError`).
- `src/app/portal/settings/page.tsx`
- `src/components/common/CommuterHomeLocationCard.tsx`, `CommuterSeatPreferencesCard.tsx`
- `src/app/verify/student/page.tsx`: public ID verification.

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/students/me | GET | Own students_full row | H | students_full |
| /api/students/onboarding | GET, POST | GET campuses; POST saves details, class, home, stop (zone, fee, route resolved on the server) in one upsert | H (student) | students, students_full, users, v_classes_expanded, campuses |
| /api/students/pickup-options | GET | Nearest stops for `lat,lng,campusId` with zone, fee, route. Read-only | H | via `lib/students/pickup` |
| /api/students/portrait | POST | Live pass photo without Face ID (no template); locked after payment | H (student) | users, students_full |
| /api/students/profile | POST | Upsert the student profile (Settings / store). Ignores `photoUrl` from students; never clears zone/stop/emergency contact when omitted | H | students, students_full, transit_zones, users |
| /api/students/home-location | GET, PUT, POST | Home pin, then zone and stop assignment | H | students, routes, route_stops, stops, transit_zones, trips, buses, bus_reservations, users, audit_logs |
| /api/students/[id]/class | PATCH | Set the student's class | H | students, classes, audit_logs |
| /api/students/verify | GET | Non-sensitive ID-card check | public GET | students_full, routes, stops |
| /api/photo-proxy | GET | Proxies images from allow-listed hosts and *.public.blob.vercel-storage.com (L20-35) | public | none |

**Lib:**
- `src/lib/students/onboarding.ts`: `onboardingInput` (zod), `saveOnboarding`, `OnboardingError`.
- `src/lib/students/pickup.ts`: `rankPickupStops` (pure), `resolveZone`, `defaultPickup`, `loadPickupCatalog` (Redis `onboarding:pickup-catalog:v1`, 120 s), `findPickupOptions`, `resolveChosenPickup`. Zone/fee only from the stop's own zone; stops on no active route cannot be chosen; stops without `campus_id` count for a campus within 60 km.
- `src/lib/students/portrait.ts`: `savePortrait`, `portraitKeyFromUrl`, `isPortraitLocked`, `PortraitLockedError`. Deletes the previous portrait blob.
- `src/lib/onboarding-cache.ts`: `getOnboardingDraftKey`, `saveOnboardingDraft`, `loadOnboardingDraft`, `clearOnboardingDraft` (client draft storage).
- `src/lib/zone-detector.ts`: `detectCommuterZoneAndStop` (still used by `CommuterHomeLocationCard`; has hard-coded campus heuristics and a Zone B fallback).
- `src/lib/subscription-utils.ts`: `isStudentSubscriptionActive`, `getSubscriptionRemainingDays`, `getSubscriptionStatusLabel`.
- `src/lib/image-utils.ts`: `getSafePhotoUrl`.
- `src/lib/security/student-scope.ts`: `STUDENT_ADMIN_ROLES`, `resolveStudentScope`.
- Store: `store/crud.ts` L253-394 builds the profile (default zone "ZONE_B", fee fallback 12000 at L261-262) and POSTs `/api/students/profile`.

**Gotcha:** the hard-coded fallbacks `ZONE_B` and 12000 are still at `store/crud.ts` L261-262 and L306 (Settings path), and `home-location` PUT/POST still fall back to the second zone and book a reservation on any trip of the route. Onboarding no longer uses either.

## 4. Academics / classes

**Purpose:** academic hierarchy (course, branch, specialization, section), classes, class teachers and class shift schedules.

**Pages:**
- `src/app/transport-admin/classes/page.tsx` (`StaffClassesView`)
- `src/app/transport-admin/academics/students/page.tsx` (`StaffStudentsView`)
- `src/app/teacher/*`: `TeacherHubDashboard`, `TeacherScheduleShiftView`, `TeacherAttendanceView`, `TeacherCommuteView`, `TeacherGatePassesView`.

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/academic/cascade | GET, POST | Cascading academic lookups | session only, no rule, no H check | academic_courses, academic_branches, academic_specializations, academic_sections, v_classes_expanded |
| /api/classes | GET, POST | List and create classes | MW write MANAGE+teacher | classes, academic_sections, campuses, class_teachers, students, v_classes_expanded, audit_logs |
| /api/classes/[id] | GET, PATCH, DELETE | One class | MW write + H | classes, class_teachers, class_shift_schedules, students, students_full, v_classes_expanded, audit_logs |
| /api/classes/[id]/teachers | GET, POST, DELETE | Assign class teachers | MW write MANAGE+teacher, no H | class_teachers, users, audit_logs |
| /api/classes/teachers | GET | List teacher users | session | users |
| /api/teacher/schedule-shift | GET, POST | Teacher sets class shift schedule and demand | MW TEACHING+TA+TM | class_shift_schedules, class_teachers, shift_demands, shifts, students, v_classes_expanded |
| /api/teacher/today-arrivals | GET | Arrivals for the teacher's classes | same | attendance_records, buses, class_teachers, students_full, trips |
| /api/teacher/early-departures | GET, PATCH | Approve early departures | same | early_departure_requests, class_teachers |

**Gotchas:**
- `/api/academic/cascade` POST has no role rule and the grep found no session check in the handler. Check whether POST writes.
- Any teacher can POST or DELETE on `/api/classes/[id]/teachers` for any class, because only the middleware write rule applies.

## 5. Payments (Razorpay links, approvals, receipts)

**Purpose:** semester fee payment through Razorpay payment links or an uploaded receipt that staff approve; this activates the subscription.

**Pages:**
- `src/app/portal/payments/page.tsx` (`PortalPaymentsView`)
- `src/app/transport-admin/billing/page.tsx` (`StaffBillingView`)
- `src/app/transport-admin/billing/approvals/page.tsx` (`StaffFeeApprovalsView`)

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/payments/razorpay/create-link | POST | Creates a Razorpay payment link (`api.razorpay.com/v1/payment_links`, L110) | H | students_full, transit_zones |
| /api/payments/razorpay/verify-link | POST | Fetches the link status (L50), activates the subscription, `markStudentSubscriptionActiveInCache` (L134) | H | payment_submissions, students, students_full, subscription_plans, subscriptions |
| /api/payments/razorpay/webhook | POST | HMAC-verified webhook (RAZORPAY_WEBHOOK_SECRET) activates the subscription (L108) | public + signature | same plus audit_logs |
| /api/payments/upload-receipt | POST | Uploads a receipt to Blob with `put(..., access:"public")` (L102) | H | none |
| /api/payments/approvals | GET, POST | GET returns own rows (scoped in handler); POST approve/reject, also queries `v1/payments` (L157), cache L310/L390 | MW write MANAGE | payment_submissions, payment_submissions_full, students, students_full, subscription_plans, subscriptions, notifications, audit_logs |
| /api/cron/reconcile-payments | GET | Reconciles pending payments | CRON_SECRET | payment_submissions, students, students_full, subscriptions, subscription_plans, audit_logs |

**Lib:**
- `src/lib/redis.ts`: `markStudentSubscriptionActiveInCache`.
- `src/lib/subscription-utils.ts` (see §3).

**DB views:** `payment_submissions_full`. Migrations: `20260919_multi_receipt_payment.sql`, `20261102_payment_submissions_full_view.sql`.

**Env:** RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID, RAZORPAY_WEBHOOK_SECRET, BLOB_READ_WRITE_TOKEN.

**Gotcha:** receipts are stored in a public Blob (upload-receipt L103).

## 6. Bookings / reservations, seat allocation and daily rollover

**Purpose:** seat reservations per trip, waitlist, seat preferences and partners, switch and cancel, and the daily trip rollover.

**Pages:**
- `src/app/portal/page.tsx`. Components: `UnifiedCommuteHub`, `SmartTransitCockpit`, `src/components/portal/commute/*` (seat selection, confirmed, walking, no-bus, schedule-off stages, `CancelSeatModal`), `SeatPartnerModal`, `src/components/booking/InteractiveBusSeatGrid.tsx`.
- `src/app/transport-admin/academics/reservations/page.tsx` (`StaffReservationsView`)

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/bookings | GET, POST | List and create reservations | H | bus_reservations, bus_reservations_full, special_shift_allocations, students_full, trips, notifications, audit_logs |
| /api/bookings/cancel | POST | Cancel a reservation | H | bus_reservations, students, notifications, audit_logs |
| /api/students/attendance | GET, POST, DELETE, PATCH | Seat claim, cancel and switch through atomic RPCs | H | rpc seat_attendance_transaction, cancel_seat_transaction, switch_seat_transaction; plus attendance_records, bus_reservations, buses, class_shift_schedules, route_stops, shift_demands, shifts, stops, students, transport_settings, trips |
| /api/students/seat-preferences | GET, PUT | Seat preferences | H + resolveStudentScope | bus_reservations, buses, students |
| /api/students/seat-partner-requests | GET, POST | Partner requests | H | seat_partner_requests, bus_reservations, buses, notifications, students, students_full |
| /api/students/switch-requests | GET, POST | Bus switch requests | H | bus_switch_requests, bus_reservations, buses, stops, students_full, transport_settings |
| /api/cron/daily-rollover | GET, POST | `executeDailyRollover`; force needs MANAGE or cron (L10-11, L82-99) | CRON_SECRET or MANAGE | trips, bus_reservations, audit_logs |

**Lib:**
- `src/lib/reservation-engine.ts`:
  - `isCutoffPassed`: booking cutoff check.
  - `getAvailableSeats`: free seats.
  - `createBooking`: in-memory booking with waitlist.
  - `cancelBookingAndPromoteWaitlist`: cancel and promote the next waitlisted rider.
  - `lockFinalManifest`: freeze the manifest.
- `src/lib/seat-allocation-engine.ts`:
  - `parseSeat`, `getSeatRowZone`, `getSeatPosition`: seat geometry.
  - `areSeatsAdjacent`, `calculatePartnerProximity`, `findAdjacentPairs`: adjacency and proximity.
  - `allocateSeatWithPreferences`: pick a seat that fits preferences.
  - `allocateAdjacentPairForPartners`: pick adjacent seats for partners.
- `src/lib/switch-evaluator.ts`: `evaluateSwitchRequest`.
- `src/lib/daily-rollover.ts`: `executeDailyRollover`:
  - marks past SCHEDULED, IN_PROGRESS and DELAYED trips COMPLETED;
  - marks CONFIRMED reservations NO_SHOW;
  - creates today's SCHEDULED trips from routes, shifts, non-MAINTENANCE buses and staff (L34-192).
- `src/lib/trip-resolver.ts`:
  - `getTodayIST`, `getNowMinutesIST`, `parseTimeToMinutes`: time helpers.
  - `scoreTripForNow`, `getBestTripForBus`, `resolveActiveTrip`: active-trip resolution.
  - `mapBusReservationToBooking`, `mergeReservationsIntoBookings`: reservation-to-booking mapping.
- `src/lib/utils.ts`: `parseSeatLayout`, `calculateBusCapacity`, `generateSeatLayout`, `isStartingSeat`, `getTeacherStartingSeats`, `isSeatRestrictedForTeachers`.
- Store: `store/booking.ts` L385 POSTs `/api/bookings` and L490 POSTs `/api/bookings/cancel`. L428 also calls `createBooking` locally.

**DB migrations:** `20261022_atomic_seat_attendance_rpcs.sql`, `20261030_fix_seat_attendance_transaction_types.sql`, `20261102_drop_legacy_bookings_and_promote_reservations.sql`, `20261103_seat_preferences_and_partner_allocation.sql`.

**Gotchas:**
- `vercel.json` schedules only `/api/cron/biometric-retention`. Daily-rollover is triggered by the client from `store/sync.ts` L749 on every store sync.
- `getTodayIST` exists twice: `time-manager.ts` L42 and `trip-resolver.ts` L6.

## 7. Master data: trips, shifts, routes, stops, zones, campuses

**Purpose:** Bus, Shift, Route (ordered `route_stops`) and Trip (Bus + Route + Shift + Date) definitions, plus zones, campuses and rest zones.

**Pages:**
- `src/app/transport-admin/routes/*`: `RoutesContext`, `CorridorsManager`, `CorridorDetailView`, `RouteBuilderModal`, `AllocateBusModal`, `CampusLocationsManager`.
- Transport-admin pages: `shifts` (`TransportAdminShiftsView`), `trips` (`TransportAdminTripsView`), `buses` (`TransportAdminBusesView`), `buses/[busId]/seat-qrs`, `transit`, `settings` (`StaffTransportSettingsView`).
- `src/app/admin/campuses` (`StaffCampusesView`).

**API routes:**

| Route | Methods | Auth | Tables |
|---|---|---|---|
| /api/shifts | GET, POST, PUT, DELETE | MW write MANAGE + H | shifts |
| /api/stops | GET, POST | MW write MANAGE | stops, bus_merge_points, audit_logs |
| /api/stops/[id] | PATCH, DELETE | MW write MANAGE | same |
| /api/zones, /api/zones/[id] | GET, POST, PATCH, DELETE | MW write MANAGE + H | transit_zones, stops |
| /api/campus | GET, POST, PATCH, DELETE | MW write MANAGE | campuses, stops, audit_logs |
| /api/rest-zones | GET, POST, PATCH, DELETE | MW write MANAGE | rest_zones |
| /api/fleet/settings | GET, POST | MW write MANAGE + H | transport_settings, users, audit_logs |
| /api/sync/state | GET | session | Cached master data: routes, stops, shifts, trips, route_stops, buses, transit_zones, campuses, subscription_plans |
| /api/staff/route-analytics | GET | MW MANAGE | bus_reservations, buses, route_stops, routes, students_full, trips |
| /api/webhooks/supabase/invalidate-cache | POST | public + SUPABASE_WEBHOOK_SECRET | Deletes `campusfleet:state:*` per table |

**Lib:**
- `src/lib/route-optimizer.ts`:
  - graph basics: `buildStopGraph`, `getStopConnectivity`;
  - shortest paths: `dijkstraShortestPath`, `bellmanFordNearestStops`, `aStarSearch`, `floydWarshallAllPairs`, `reconstructFloydPath`;
  - network analysis: `kruskalMST`, `computeNetworkStats`;
  - route lookup and planning: `findCorridorsServingStop`, `recommendBestRoute`, `computeDirectExpressRoute`;
  - fleet operations: `reconcileShiftAttendance`, `detectIntraCorridorDisassemblies`, `computeClarkeWrightRouteStitches`, `computeFleetOrchestrationPlan`.
- `src/lib/time-manager.ts`:
  - IST clock: `getNowIST`, `getTodayIST`, `getDayOfWeekIST`, `getCurrentTimeIST`, `getCurrentMinutesIST`;
  - conversion and formatting: `timeStringToMinutes`, `minutesToTimeString`, `formatTimeIST`, `formatMinutesCountdown`;
  - shift and trip status: `getShiftOperationalStatus`, `getActiveShift`, `getNextUpcomingShift`, `isTripCutoffPassed`, `getTripLiveStatus`.
- `src/lib/transit-timing.ts`: `formatTimeWithOffset`, `formatTimeFromDateWithOffset`, `estimateRouteStopTimings`.
- `src/lib/types.ts`: `TRANSIT_ZONES` (L513), `DEFAULT_VALIDATION_LOCKS` (L831).
- `src/lib/transport-admin-data.ts`: `getStaffServerData` (cache `staff:transport_admin_raw_tables_v3`), `getHardwareDeskServerData` (cache `telematics:hardware_desk_server_data`).
- Store: `store/graph.ts` (campus stops, stop graph); `store/getters.ts`; `store/crud.ts` (shifts CRUD through `/api/shifts`, L84-142).

**Gotchas:**
- In invalidate-cache L32-60, `transit_zones` and `campuses` fall through to pushing `campusfleet:state:routes`. Nothing pushes `campusfleet:state:transit_zones`, `campusfleet:state:campuses` or `campusfleet:state:subscription_plans`, so those wait for TTL (MASTER_DATA_PERMANENT, 3600 s). Check the break/fallthrough.
- AGENTS.md forbids showing trip_id or trip_code to students. Student components that read trips (ClientPortalLayout L369-382 finds trips but shows only bus, shift, route, staff and stop) should be audited.

## 8. Boarding / attendance

**Purpose:** validate boarding through dynamic QR pass, rolling bus QR self-scan, static seat QR, Face ID gate or RFID; roaming and departure alerts; halt requests; attendance mode policy and validation locks.

**Pages:**
- Portal QR: `src/app/portal/qr/{page,show,scan}` (`StudentSelfScanner`).
- Portal radar: `src/app/portal/radar` (`FullScreenLiveRadarView`).
- Portal components: `AttendanceLockCard`, `BusDepartureAlertModal`.
- Conductor pages: `src/app/conductor/{scanner,manifest,seat-map,bus-qr,late-requests,audit}`.
- Conductor components: `ConductorContext`, `QRPassScanner`, `tabs/*` (ManifestTab, SeatMapTab, BusQrTab, HaltRequestsTab, AuditTab), `SeatInspectorModal`.
- Transport admin: `src/app/transport-admin/rfid` (`RfidCardIssuanceView`), `esp32` (`ESP32CardHolderIssuanceView`).

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/students/pass-token | GET | Issues the signed dynamic pass (`issueStudentPass`) | H | students |
| /api/boarding/scan | POST | Crew scans a pass and records attendance | MW STAFF | attendance_records, bus_reservations, class_shift_schedules, early_departure_requests, students_full, trips, notifications, audit_logs |
| /api/boarding/rolling-token | GET | Bus rolling-QR payload for the conductor screen | MW STAFF | buses |
| /api/students/board-self-service | POST | Student scans the bus rolling QR (or static seat QR) | H | attendance_records, bus_reservations, buses, students, trips |
| /api/boarding/roaming | GET, POST | Roaming and departure alerts (polled every 5 s by the portal) | H | attendance_records, bus_departure_alerts, bus_reservations, students, trips, notifications, audit_logs |
| /api/attendance/lock | GET, POST | Validation-lock status (GPS proximity, RFID); caches lock and RFID state | H | attendance_records, bus_reservations, buses, students_full, trips |
| /api/conductor/sync | GET | Conductor live state; also reads halt keys | MW STAFF | bus_reservations_full, attendance_records, bus_departure_alerts |
| /api/dispatch/halt-requests | GET, POST, PATCH | Halt requests stored only in Redis `halt_request:{trip}:{student}` | MW write STAFF+student+teacher | students_full |
| /api/students/early-departure | POST, GET | Student early-departure request | H | early_departure_requests, students_full |
| /api/telematics/rfid | POST | ESP32 RFID tap recorded as attendance | device | attendance_records, bus_reservations, buses, students, students_full, trips |
| /api/telematics/rfid/map | POST | Map an RFID UID to a student | MW MANAGE | students, students_full, audit_logs |
| /api/telematics/rfid/latest-tap | GET, DELETE | Latest unmapped tap and hardware status (Redis) | MW STAFF | buses, students_full |
| /api/cron/reconcile-attendance | GET | Calls `merges` POST internally with the cron header | CRON_SECRET | none directly |

**Lib:**
- `src/lib/attendance/AttendanceEngine.ts`: `AttendanceEngine` class and `attendanceEngine` singleton.
- `src/lib/attendance/strategies/*`: `DynamicQrStrategy`, `StaticQrStrategy`, `FaceIdStrategy`, `RfidStrategy`.
- `src/lib/attendance/policy.tsx`:
  - `resolveValidationLocks`: compute active locks;
  - `getModalityPageRules`: page rules per attendance mode;
  - `useAttendancePolicy`: React hook;
  - `broadcastAttendanceModeChange`: broadcast a mode change;
  - `PolicyStandbyScreen`: placeholder screen while policy loads.
- `src/lib/attendance/persist.ts`: `persistGateAttendance`.
- `src/lib/security/student-pass.ts`: `PASS_WINDOW_SECONDS`, `currentPassWindow`, `signStudentPass`, `issueStudentPass`, `verifyStudentPass` (STUDENT_PASS_SECRET or JWT_SECRET).
- `src/lib/rolling-bus-crypto.ts`:
  - `getRollingMasterSecret`, `getBusSecretKey`: key material (BUS_ROLLING_SECRET_KEY);
  - `computeRollingToken`, `generateRollingBusPayload`: token generation;
  - `verifyRollingBusToken`: verification with replay key `replay:bus_qr:{bus}:{block}:{student}`, NX with 120 s TTL (L200-215);
  - constants `DEFAULT_TIME_STEP_SECONDS`, `DEFAULT_TOLERANCE_STEPS`.
- `src/lib/security/safe-id.ts`: `isSafeId`, `isSafeDeviceId`, `orEqFilter`.
- `src/lib/eta-calculator.ts`: `calculateHaversineDistanceKm`, `isWithinGeofence`, `calculateETA`.
- `src/lib/transit-sound.ts`: `primeAudioContext`, `playBusFullAlarm`, `playBoardingConfirmedChime`, `stopAlarm`, `isAlarmRunning`.
- Store `store/booking.ts`: local attendance-record creation (L43-260).

**DB migrations:** `20260920_attendance_architecture.sql`, `20260924_create_halt_requests.sql`, `20261109_attendance_mode_settings.sql`, `20261110_validation_locks_settings.sql`, `20261022_integrate_attendance_reservations_rfid.sql`.

**Gotchas:**
- Halt requests use `redis.keys("halt_request:{tripId}:*")` plus `mget` (halt-requests L34-36, conductor/sync L46-48). KEYS does an O(N) scan.
- A halt_requests table migration exists, but the route stores halt requests only in Redis.
- `DEVICE_PATHS` uses exact match, so `/api/telematics/rfid/map` and `/latest-tap` need a session and are not device-accessible (api-access.ts L97).

## 9. Biometrics / face-service and evidence storage

**Purpose:** consent, Face ID enrollment (embedding from the external face-service), gate camera captures with match decisions, security incidents, retention.

**Pages:**
- `src/app/privacy/biometrics/page.tsx` (`BiometricPrivacyCard`)
- `src/components/portal/onboarding/LiveFaceCapture.tsx`: camera only, no upload. Face ID mode: look straight → turn to the side from the challenge → look straight; frames + portrait to enroll-v2. Photo mode (no consent): one straight capture to `/api/students/portrait`. Pose from MediaPipe landmarks with the face-service yaw ratio (`lib/face/pose.ts`). No skin-colour fallback, no bypass.
- `src/components/driver/DriverGateCameraConsole.tsx`
- Transport manager: `src/app/transport-manager/face-metrics` (`FaceIdMetricsView`), `src/app/transport-manager/security` (`SecurityIncidentsCenterView`, `SecurityThreatAlertBanner`).
- `src/components/transport-admin/GateDevicesPanel.tsx`
- `src/components/conductor/GateOccupancyCard.tsx`

**API routes:**

| Route | Methods | What it does | Auth | Tables |
|---|---|---|---|---|
| /api/biometrics/consent | GET, DELETE | Consent status; withdraw and erase | H | biometric_consents, face_templates, students |
| /api/biometrics/challenge | GET | One-time 5-min enrollment token + random turn side (`lib/face/challenge.ts`, Redis `faceid:challenge:<nonce>`) | H (student) | none |
| /api/biometrics/enroll-v2 | POST | Enroll a face template through the face-service. Needs `challenge`; rejects frames with no straight or no turned pose (`checkEnrollmentPoses`; env `FACE_ENROLL_POSE_CHECK=off`, `FACE_ENROLL_TURN_MIN`, `FACE_ENROLL_FRONTAL_MAX`); saves the portrait via `savePortrait` | H | biometric_access_log, biometric_consents, face_templates, students, users |
| /api/biometrics/evidence/[incidentId] | GET | Streams private evidence | MW MANAGE | biometric_access_log, bus_security_incidents |
| /api/biometrics/metrics | GET | `computeFaceMetrics` and go/no-go | MW MANAGE | none |
| /api/biometrics/portrait/[studentId] | GET | Student portrait | H | students |
| /api/gate/captures | POST | Device-signed or crew-session capture ingest | public + H (`authenticateDevice`) | via lib |
| /api/gate/captures/[id] | GET | Capture detail | public at MW (prefix), H | gate_captures, staff, students, trips |
| /api/gate/heartbeat | POST | Device heartbeat | public + `authenticateDevice` | transport_settings |
| /api/gate/devices | GET, POST, DELETE | Register gate devices | MW MANAGE | gate_devices, buses, audit_logs |
| /api/gate/process | POST | Process pending captures | MW MANAGE | via lib |
| /api/gate/occupancy | GET | Bus occupancy from captures | session | gate_captures |
| /api/ops/stream | GET | SSE of ops events (Redis list) | MW STAFF | none |
| /api/transport-manager/incidents | GET | List incidents | MW MANAGE | via lib |
| /api/transport-manager/incidents/[id] | PATCH | Update incident status | MW MANAGE | via lib |
| /api/cron/biometric-retention | GET | `runBiometricRetention`, scheduled at 30 20 * * * UTC | CRON_SECRET | via lib |

**Lib:**
- `src/lib/face/client.ts`: `FaceServiceError`, `signFaceRequest` (HMAC of "ts\nPOST\n/v1/template\nsha256(body)"), `createFaceTemplate` (POST `${FACE_SERVICE_URL}/v1/template`), `toVectorLiteral`, `cosineDistance`.
- `src/lib/biometrics.ts`:
  - matching: `DEFAULT_FACE_MATCH_THRESHOLD`, `normalizeVector`, `computeCosineDistance`, `saveStudentFaceProfile`, `matchStudentFace`;
  - events and incidents: `recordBusGateEvent`, `reportSecurityIncident`, `getSecurityIncidents`, `updateSecurityIncidentStatus`.
- `src/lib/biometrics-consent.ts`: `CONSENT_VERSION`, `CONSENT_PURPOSE`, `CONSENT_SUMMARY`, `CONSENT_POINTS`.
- `src/lib/biometrics-lifecycle.ts`: retention constants (`EVIDENCE_RETENTION_DAYS`, `INACTIVE_STUDENT_DAYS`, `INTRUDER_FACE_RETENTION_HOURS`), `withdrawAndErase`, `runBiometricRetention`.
- `src/lib/biometrics-metrics.ts`: `computeFaceMetrics`, `GO_CRITERIA`, `goNoGo`.
- `src/lib/gate/device-auth.ts`:
  - MAC helpers: `normalizeMac`, `isValidMac`;
  - signing: `deriveDeviceKey` (GATE_DEVICE_MASTER_KEY), `signDeviceRequest`, `hasDeviceSignature`, `MAX_SKEW_SECONDS`;
  - auth: `authenticateDevice` (nonce `gate:nonce:{device}:{nonce}`, NX, L107), `touchDevice`.
- `src/lib/gate/ingest.ts`: `MAX_BATCH`, `ingestCaptures`, `resolvePhoneDevice`.
- `src/lib/gate/processor.ts`: `getMatchThreshold`, `parseVector`, `processCapture`, `processPending`.
- `src/lib/gate/decision.ts`: `DUPLICATE_WINDOW_S`, `decide`, `distanceMeters`, `stopAtPosition`.
- `src/lib/gate/evidence.ts`: `isJpeg`, `decodeImagePayload`, `storeEvidence` (private Blob, EVIDENCE_READ_WRITE_TOKEN), `readEvidence`, `deleteEvidence`.
- `src/lib/gate/ops-events.ts`: `publishOpsEvent` (INCR `ops:events:seq`, LPUSH and LTRIM `ops:events`), `readOpsEvents`, `latestOpsSeq`.
- `src/lib/gate/phone-capture.ts`: `boxFromLandmarks`, `cropFaceJpeg`, `SteadyFaceTrigger`.
- `src/lib/face-landmarker-loader.ts`: `getFaceLandmarker` (MediaPipe on the client).

**DB:** face_templates, biometric_consents, biometric_access_log, bus_security_incidents, gate_captures, gate_devices. Migrations: `20261109_biometric_face_id_and_gate_telematics.sql`, `20261111_face_id_v2_schema.sql`.

**Gotchas:**
- `ROLE_RULES` lists `/api/biometrics/calibration` and `/api/biometrics/verify-gate`, but neither route exists (dead rules, api-access.ts L55 and L71).
- `/api/gate/captures/[id]` is public at middleware because of the raw `startsWith` (L94). The handler's own session check is the only guard.

## 10. Telematics / live location

**Purpose:** GPS from ESP32 devices or the driver console, stored in Redis (hot) and MongoDB (live location and breadcrumbs), polled by clients.

**Pages:**
- `src/app/driver/*` (`DriverConsoleView`, `DriverLiveRadarView`)
- `src/app/transport-manager/live` (`LiveFleetTelematicsView`)
- `ConductorLiveRadarView`, `SmartTransitCockpit`, `FullScreenLiveRadarView`

**API routes:**

| Route | Methods | What it does | Auth |
|---|---|---|---|
| /api/telematics/live | GET, POST | GET reads `telematics:bus:*`, falling back to Mongo, plus `telematics:rfid:latest:{bus}`. POST writes up to 10 alias keys (L190-213) and Mongo | device (GET any session, write STAFF) |
| /api/telematics/devices | GET, POST | Map a GPS device to a bus; maintains device_bus_map, device_bus_number, device_status, unmapped list, latest_esp32_status | MW MANAGE |

Tables for `/api/telematics/devices`: buses, audit_logs.

**Lib:**
- `src/lib/mongodb.ts`: `getMongoDb`, `saveLiveLocationToMongo`, `getMongoTelemetryStats`, `getLiveLocationFromMongo`, `getAllLiveLocationsFromMongo`, `getBusBreadcrumbsFromMongo`. Collections: `bus_live_locations`, `gps_breadcrumbs`. Env: MONGODB_URI, MONGODB_DB_NAME.
- `src/lib/telematicsService.ts`: `telematicsService` with `startPolling(busId, 2500)`, which hits `/api/telematics/live?busId=` (L150-190), and `subscribe`.

**Gotcha:** each POST to telematics/live writes the same location under many alias keys (`{id}`, lowercase, `bus-{id}`, `Bus {id}`, `{num}`...; L190-213).

## 11. Dispatch / merges / crew / demand

**Purpose:** dispatch configuration, duty blocks, crew assignment, bus merges and merge points, demand.

**Pages:** `src/app/transport-manager/{combine-buses,demand,drivers,trips,page}`. Components: `TransportManagerMergesView`, `TransportManagerDemandView`, `TransportManagerCrewView`, `ManagerTodayTripsView`, `TransportManagerHubView`, `CrewBusSelectorModal`.

**API routes:**

| Route | Methods | Auth | Tables |
|---|---|---|---|
| /api/dispatch | GET, POST | MW STAFF + H | dispatch_configs, buses, audit_logs |
| /api/dispatch/duty-blocks | GET, POST | MW STAFF | trips, buses, routes, shifts, staff, users, audit_logs |
| /api/merges | GET, POST | MW MANAGE; H accepts a session or a cron header (L152-155) | bus_merge_points, bus_merge_suggestions, attendance_reconciliation_runs, attendance_records, bus_reservations, bus_reservations_full, buses, routes, shifts, audit_logs |
| /api/merges/points | GET, POST, DELETE | MW MANAGE, no H | bus_merge_points, routes, stops, audit_logs |
| /api/staff/assign-crew | POST | MW MANAGE | staff, trips, users, audit_logs |

**Lib:** `src/lib/duty-blocks.ts`: `categorizeShifts`, `buildDutyBlocks`, `rotateDutyBlocks`, `autoAssignDutyBlocks`, `reconcileDutyTrips`. The orchestration functions in `route-optimizer.ts` (§7) also belong here.

## 12. Maintenance

**Pages:**
- `src/app/admin/maintenance` (`AdminMaintenanceView`)
- `src/app/transport-admin/maintenance` (`StaffMaintenanceView`)
- Driver checklist inside `DriverConsoleView`

**API routes:**

| Route | Methods | Auth | Tables |
|---|---|---|---|
| /api/maintenance | GET, POST | MW STAFF | maintenance_logs, buses, audit_logs |
| /api/maintenance/requests | GET, POST | MW STAFF | maintenance_requests, audit_logs |
| /api/maintenance/requests/[id] | GET, PATCH | MW STAFF | maintenance_requests, audit_logs |
| /api/maintenance/upload | POST | MW STAFF | Blob `put`, public (L62-63) |

## 13. Salary / payroll

**Pages:**
- `src/app/admin/salary`, `src/app/transport-admin/salary` (`StaffSalaryManagementView`)
- `StaffPayoutCredentialsCard`

**API routes:**

| Route | Methods | Auth | Tables |
|---|---|---|---|
| /api/staff/salary/profile | GET, PUT | MW STAFF + H | staff, staff_payroll_full, staff_salary_configs, staff_salary_payouts |
| /api/staff/salary/admin | GET | MW admin + transport_admin, no H | role_salary_defaults, staff_payroll_full, staff_salary_payouts |
| /api/staff/salary/admin/role-defaults | PUT, POST | same | role_salary_defaults, staff, staff_salary_configs |
| /api/staff/salary/admin/staff-config | PUT | same | same |
| /api/staff/salary/admin/disburse | POST | same | staff_payroll_full, staff_salary_configs, staff_salary_payouts |

**Lib:**
- `src/lib/razorpay-payouts.ts`: `generatePayoutReference`, `getOrCreateContact` (v1/contacts), `getOrCreateFundAccount` (v1/fund_accounts), `executeSalaryPayout` (v1/payouts). Env: RAZORPAYX_ACCOUNT_NUMBER.
- `src/lib/payroll-crypto.ts`: `encryptSensitiveField`, `decryptSensitiveField` (PAYROLL_ENCRYPTION_KEY, falling back to JWT_SECRET or the service key), `maskBankAccount`, `maskUpiId`, `isValidIfsc`, `isValidUpiVpa`.

**Migration:** `20261102_staff_payroll_and_salary_automation.sql`.

## 14. Chat (MongoDB)

**Pages:**
- `src/app/chat/*`
- `src/components/chat/*`: `ChatPortalView`, `GroupDetailsModal`, `MessageActionsMenu`, `settings/*`
- `src/types/chat.ts`

**API routes** (all session; H uses `getSession`):

| Route | Methods |
|---|---|
| /api/chat/conversations | GET, POST, PATCH, DELETE |
| /api/chat/messages | GET, POST, PATCH, DELETE |
| /api/chat/polls | POST |
| /api/chat/reactions | POST |
| /api/chat/settings | GET, PUT |

**Lib:**
- `src/lib/chat-mongodb.ts`:
  - helpers: `PASTEL_AVATARS`, `getInitials`;
  - conversations: `syncConversationsFromDatabase` (builds conversations from Supabase relations), `getUserConversations`, `createConversation`, `updateConversation`, `deleteConversation`;
  - messages: `getConversationMessages`, `sendChatMessage`, `voteChatMessagePoll`, `updateChatMessage`, `deleteChatMessage`, `toggleMessageReaction`;
  - settings: `getChatUserSettings`, `updateChatUserSettings`.
  - Collections: `chat_conversations`, `chat_messages`, `chat_user_settings`.
- `src/lib/chat-audio.ts`: `NOTIFICATION_TONES`, `playNotificationTone`.

**Gotcha:** `CACHE_TTL.CHAT_MESSAGES` and `CACHE_TTL.CHAT_CONVERSATIONS` are defined, but no chat Redis keys turned up in the grep.

## 15. Notifications
- **Tables:** `notifications` rows are written by bookings, bookings/cancel, boarding/scan, boarding/roaming, payments/approvals and seat-partner-requests.
- **Preferences:** `/api/users/notifications` (users table; migration `20260924_add_notification_prefs.sql`).
- **Departure alerts:** `bus_departure_alerts`, through `/api/boarding/roaming` and `BusDepartureAlertModal`.
- **Store seed:** `INITIAL_NOTIFICATIONS` (`store/_base.ts`).

## 16. Geo / maps

**API routes** (session; no role rule):

| Route | Methods | What it does |
|---|---|---|
| /api/geo/directions | GET | Google directions (L112) |
| /api/geo/geocode | GET | Geocoding (L93) |
| /api/geo/reverse-geocode | GET | Google with a fallback (L8-36) |

All three use GOOGLE_MAPS_API_KEY, falling back to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.

**Lib:**
- `src/lib/road-distance.ts`: `getRoadDistance`, `getRoute`, `getDistanceMatrix`, `getProviderInfo`. ROUTING_PROVIDER is google, osrm (OSRM_BASE_URL) or haversine.
- `src/lib/maps/*`: `BaseMapController`, `CommuterCorridorController`, `OnboardingPinController`, `TransitStudioMapController`.
- `src/lib/utils.ts`: `calculateDistanceKm`, `calculateExactDistanceMeters`, `calculateProximityToBus`.
- Components: `src/components/maps/*` (`CampusFleetMap`, `CommuterCorridorMap`, `GoogleTransitMap`, `OnboardingPinMap`, `TransitStudioMap`, `google/*`), `WhereIsMyBusFlowchart`.

## 17. Caching (`src/lib/redis.ts`)
- **Client:** `redis` (Upstash). URL from KV_REST_API_URL, then UPSTASH_REDIS_REST_URL, then REDIS_URL; token from the matching `*_TOKEN` variables.
- **Exports:**
  - `CACHE_TTL`: USER_ROLE 300, OTP 300, HOT_DATA_* 3600 (trips 300), MASTER_DATA_PERMANENT 3600, STUDENT_PROFILE 1800.
  - basics: `cacheGet`, `withJitter`, `cacheSet` (TTL with jitter), `cacheDel`;
  - `getOrFetchWithCache({key, ttl, fetchFn})`: cache-aside with a negative-cache guard;
  - role cache: `getUserRoleKey`, `getCachedUserRole`, `setCachedUserRole`, `invalidateCachedUserRole`;
  - student cache: `getStudentProfileKey`, `getCachedStudentProfile`, `setCachedStudentProfile`, `invalidateCachedStudentProfile(ids[])`, which deletes `student:profile:{id}` (and lowercase), `student:{id}` and `student:subscription:{id}`, and also adds `stud-{userId}`;
  - `markStudentSubscriptionActiveInCache`.

### All Redis key patterns

| Key | Writer | Reader | Invalidated by / TTL |
|---|---|---|---|
| `auth_otp:{email}` | send-otp L54 | verify-otp L55 | verify-otp L62 |
| `user:role:{userId}` | auth/session L65 | auth/session L35 | logout, delete-account |
| `student:profile:{id}` | setCachedStudentProfile | portal/layout L22 | invalidateCachedStudentProfile (logout, delete) |
| `student:subscription:{userId}` | portal/layout L51 (3600 s or 5 s), markStudentSubscriptionActiveInCache (verify-link, webhook, approvals) | portal/layout, portal/page L25 | invalidateCachedStudentProfile |
| `student:photo:{userId}` | portal/layout L52 | portal/layout | logout, delete-account |
| `portal:student_row:{userId}` | portal/page and portal/radar via getOrFetchWithCache | same | portal/page L27 |
| `portal:shared_fleet_data` | portal/page, portal/radar | same | TTL |
| `schedule:class:{classId}:{dow}` | portal/page L115 | same | TTL |
| `driver:shared_fleet_data`, `driver:reservations_recent` | driver/page, driver/radar | same | TTL |
| `conductor:shared_fleet_data`, `conductor:reservations_manifest_v3`, `conductor:students_full`, `conductor:attendance_records` | conductor/layout L39-86 | same | TTL |
| `staff:transport_admin_raw_tables_v3` | transport-admin-data L33 | same | TTL |
| `telematics:hardware_desk_server_data` | transport-admin-data L380 | same | telematics/devices L223 |
| `onboarding:pickup-catalog:v1` | lib/students/pickup `loadPickupCatalog` | pickup-options, students/onboarding | TTL 120 s |
| `faceid:challenge:{nonce}` | lib/face/challenge `consumeFaceChallenge` (SET NX) | enroll-v2 | TTL 5 min (single use) |
| `campusfleet:state:{routes,stops,shifts,trips,stop_routes,buses,transit_zones,campuses,subscription_plans}` | sync/state | sync/state | Supabase webhook (partial, see §7) |
| `telematics:bus:{alias}` (many aliases) | telematics/live POST (120 s), GET warm (60 s), attendance/lock L70 | telematics/live GET | TTL |
| `telematics:rfid:latest:{busId}` | RFID ingest (route not re-read) | telematics/live L110 | TTL |
| `telematics:device_bus_map:{dev}`, `telematics:device_bus_number:{dev}`, `telematics:device_status:{dev}` | telematics/devices, rfid/latest-tap (300 s) | device ingest | devices and latest-tap DELETE |
| `telematics:unmapped_device_list`, `telematics:latest_esp32_status` | devices, latest-tap | devices GET, latest-tap | same |
| `attendance:lock:{id}:{date}`, `attendance:rfid:{id}:{date}` | attendance/lock L474 (7200 s), L542-543 (86400 s) | attendance/lock | TTL |
| `halt_request:{trip}:{student}` | dispatch/halt-requests (keyFor L12) | halt-requests L34, conductor/sync L46 | route PATCH and TTL |
| `replay:bus_qr:{bus}:{block}:{student}` | rolling-bus-crypto L215 (NX, 120 s) | same | TTL |
| `gate:nonce:{device}:{nonce}` | device-auth L107 (NX) | same | TTL |
| `ops:events` (list), `ops:events:seq` | ops-events L23-26 | ops/stream | LTRIM |

## 18. Client store (`src/lib/store/*`) and DB proxy
- **`_base.ts`:** `CampusFleetStore` class and `INITIAL_*` seed arrays (L30-45).
- **`index.ts`:** singleton `store`, plus the bootstrap sequence in §0.
- **`sync.ts`:** prototype methods, listed in §0:
  - debounced syncs;
  - `initCrossTabSync` (L51), `initSupabaseRealtime` (L86), `initStudentPaymentSync` (L96), `initTelematicsSync` (L167);
  - `getCachedState`, `syncMasterData`, `syncLiveTransit`, `syncUserData`, `syncFromSupabase`.
- **`auth.ts`:** `initAuthSync` using `authService`; role-switch helpers.
- **`getters.ts`:** role-scoped getters (`getTrips(user, studentId)`, today's trips in IST, zones by campus, live-status helpers).
- **`graph.ts`:** campus stops, primary campus, stop-graph wrappers over route-optimizer.
- **`crud.ts`:** shift CRUD through `/api/shifts`, special shift allocations, student profile through `/api/students/profile`.
- **`booking.ts`:** local attendance records; booking through `/api/bookings` and `/api/bookings/cancel`.
- **`src/lib/supabaseClient.ts`:** `supabase` (browser client pointed at `/api/db`, with 15 ms read batching into `/api/db/batch`) and `supabaseAdmin` (service role, server only).
- **`/api/db/rest/v1/[table]`** (GET, POST, PATCH, DELETE; H session): applies `db-proxy-policy` and forwards with the service key. Logic: read checks L76-81, staff write rules L106-110, end-user self-PATCH L118, own-student scoping L208.
- **`/api/db/batch`** (POST): runs several proxy GETs in one call through `proxyGet`.
- **`src/lib/security/db-proxy-policy.ts`:** `READABLE_TABLES`, `STAFF_READABLE_TABLES`, `STAFF_WRITE_RULES`, `FORBIDDEN_WRITE_COLUMNS`, `CREW_PATCH_COLUMNS`, `SELF_PATCH_COLUMNS`, `ALWAYS_STRIPPED`, `END_USER_STRIPPED`, `OTHER_RIDER_STRIPPED`, `isManage`, `isStaff`.
- **Other small libs:**
  - `src/lib/id.ts`: `generateTypeId`; the create*Id family (booking, trip, attendance, user, student, staff, payment, gate pass, subscription, request, audit log, halt, message, conversation); `typeIdToUuid`, `uuidToTypeId`, `isValidTypeId`, `getTypeIdTimestamp`.
  - `src/lib/translations.ts`: `LANGUAGE_OPTIONS`, `getTranslation`, `translations`.
  - `src/lib/usePWAInstall.ts`: `usePWAInstall`.
  - `src/lib/utils.ts`: `cn`, `formatCurrency`, `formatTime`, `formatDate`.
  - `src/lib/commute/CommuteTransitEngine.ts`: `CommuteTransitEngine`.

## 19. Cron jobs

| Route | Auth | Scheduled in vercel.json |
|---|---|---|
| /api/cron/biometric-retention | CRON_SECRET | yes, "30 20 * * *" (UTC) |
| /api/cron/daily-rollover | CRON_SECRET or MANAGE session; GET and POST | no; triggered from the client at store/sync.ts L749 |
| /api/cron/reconcile-attendance | CRON_SECRET; calls merges POST through an internal NextRequest that forwards the authorization header (L15-24) | no |
| /api/cron/reconcile-payments | CRON_SECRET | no |

## 20. setInterval polling loops

| File:line | Period | Target |
|---|---|---|
| src/app/portal/ClientPortalLayout.tsx:156 | 5 s, visible tab only | GET /api/boarding/roaming?studentId= |
| src/lib/telematicsService.ts:190 | 2.5 s | GET /api/telematics/live?busId= |

`telematicsService.startPolling` is called from FullScreenLiveRadarView:561, SmartTransitCockpit:308 and ConductorLiveRadarView:238. LiveFleetTelematicsView:129 only subscribes.

| File:line | Period | Target |
|---|---|---|
| src/components/portal/FullScreenLiveRadarView.tsx:452 | see file (period not captured) | GET /api/dispatch/halt-requests?tripId&studentId |
| src/components/portal/FullScreenLiveRadarView.tsx:471 | UI timer | none |
| src/components/portal/AttendanceLockCard.tsx:100 | 10 s | fetchLockStatus, likely /api/attendance/lock |
| src/components/portal/BusDepartureAlertModal.tsx:62 | 1 s | countdown only |
| src/components/chat/ChatPortalView.tsx:205 | 4 s | loadMessages(activeConvId), likely /api/chat/messages |
| src/components/conductor/ConductorContext.tsx:272 | 4 s, visible tab only | refreshLiveState, likely /api/conductor/sync |
| src/components/conductor/tabs/HaltRequestsTab.tsx:59 | 4 s | fetchBusLoc (live location), store fallback |
| src/components/conductor/tabs/HaltRequestsTab.tsx:103 | 3.5 s | GET /api/dispatch/halt-requests?tripId= |
| src/components/conductor/tabs/HaltRequestsTab.tsx:112 | 1 s | hold countdown |
| src/components/conductor/GateOccupancyCard.tsx:30 | 60 s | GET /api/gate/occupancy?busId=, plus EventSource /api/ops/stream?busId= |
| src/components/transport-admin/GateDevicesPanel.tsx:48 | 30 s | GET /api/gate/devices |
| src/components/transport-manager/SecurityIncidentsCenterView.tsx:82 | 30 s | fetchIncidents, plus EventSource /api/ops/stream |
| src/components/transport-manager/SecurityThreatAlertBanner.tsx:89 | 6 s | fetchActiveIncidents, likely /api/transport-manager/incidents |
| src/components/transport-manager/SecurityThreatAlertBanner.tsx:102 | 12 s | siren audio |
| src/lib/transit-sound.ts:104 | 1.6 s | alarm audio |
| src/components/common/CampusTimeProvider.tsx:80 | clock tick | none |
| src/components/common/BusLoadingScreen.tsx:31 | animation | none |
| src/app/portal/qr/show/page.tsx:72 | 1 s | clock for pass rotation |
| src/app/verify/student/page.tsx:49 | 1 s | clock |
| src/lib/store/sync.ts:155 | removed | was syncStudentStatus every 30 s |

## 21. Environment variables
- **Middleware:** NEXT_PUBLIC_APP_URL, NODE_ENV, TELEMATICS_DEVICE_KEY.
- **jwt.ts:** JWT_SECRET.
- **student-pass.ts:** STUDENT_PASS_SECRET, JWT_SECRET.
- **rolling-bus-crypto.ts:** BUS_ROLLING_SECRET_KEY.
- **Supabase:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (supabaseClient.ts, db proxy, payroll-crypto).
- **Redis:** KV_REST_API_URL, KV_REST_API_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL, REDIS_TOKEN (redis.ts).
- **MongoDB:** MONGODB_URI, MONGODB_DB_NAME (mongodb.ts).
- **Blob:** BLOB_READ_WRITE_TOKEN (upload-receipt, maintenance/upload, delete-account); EVIDENCE_READ_WRITE_TOKEN (gate/evidence.ts).
- **Razorpay:** RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID (approvals, create-link, verify-link, razorpay-payouts); RAZORPAY_WEBHOOK_SECRET (webhook); RAZORPAYX_ACCOUNT_NUMBER (payouts).
- **Face service:** FACE_SERVICE_URL, FACE_SERVICE_KEY (face/client.ts).
- **Face ID enrollment:** FACE_CHALLENGE_SECRET (optional, falls back to JWT_SECRET; face/challenge.ts); FACE_ENROLL_POSE_CHECK (`off` disables the head-turn check), FACE_ENROLL_TURN_MIN (default 0.12), FACE_ENROLL_FRONTAL_MAX (default 0.10) (enroll-v2).
- **Gate devices:** GATE_DEVICE_MASTER_KEY (gate/device-auth.ts).
- **Payroll:** PAYROLL_ENCRYPTION_KEY.
- **Cron and webhooks:** CRON_SECRET (cron-auth.ts); SUPABASE_WEBHOOK_SECRET (invalidate-cache).
- **Google OAuth:** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (auth/google*).
- **Maps and routing:** GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (geo routes, road-distance, map components); ROUTING_PROVIDER, OSRM_BASE_URL (road-distance).
- **Email:** GMAIL_USER, GMAIL_APP_PASSWORD, SMTP_PASS (email.ts).
- **Accounts:** ADMIN_EMAIL (account-service.ts).

