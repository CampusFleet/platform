# 🚌 CampusFleet — Complete Code Explanation for PPT Demonstration

> **Project**: Autonomous Campus Transit Intelligence, Satellite Fleet Telematics & Anti-Fraud Digital Attendance System  
> **Engineering Team**:  
> • **Aditya Pandey** — Lead Architect & Full-Stack Engineering  
> • **Harsh Kumar** — Backend Systems & Database Architecture  
> • **Kartik Bisht** — Frontend UI/UX & Mobile PWA Engineering  
> • **Gaurang Joshi** — IoT Telematics & Quality Assurance  
> **Project Guide / Evaluator**: Prof. Rahul (Rahul Sir)  
> **Institution**: Graphic Era Hill University (GEHU), Bhimtal Campus  
> **Live URL**: [https://campusfleet.vercel.app](https://campusfleet.vercel.app)  
> **Repository**: [GitHub — CampusFleet/platform](https://github.com/CampusFleet/platform)

---

## 📌 TABLE OF CONTENTS (PPT Slide Map)

| Slide # | Topic |
|---------|-------|
| 1 | Project Overview & Problem Statement |
| 2 | Technology Stack |
| 3 | System Architecture Diagram |
| 4 | Database Schema (29 Tables) |
| 5 | Authentication & Security (JWT, CSRF, RBAC) |
| 6 | Role-Based Access Control (6 Portals) |
| 7 | RedBus & AbhiBus-Inspired Attendance & Seat Allocation Engine |
| 8 | Route Optimization Algorithms (Dijkstra, Bellman-Ford, A*, Floyd-Warshall, Kruskal's MST) |
| 9 | Real-Time GPS Telematics & Fleet Positioning |
| 10 | ETA Calculator (Haversine Formula) |
| 11 | Student & Parent Portal |
| 12 | Driver Console |
| 13 | Conductor Console (QR-Based Attendance with Location Verification & Biometric Hardware Readiness) |
| 14 | Admin Operations Center |
| 15 | Transport Admin Panel |
| 16 | Transport Manager Panel |
| 17 | Teacher Panel |
| 18 | Payment System & OCR Receipt Verification |
| 19 | Daily Operations Rollover (Automated CRON) |
| 20 | Multi-Language Support (10 Indian Languages) |
| 21 | PWA & Mobile-First Design |
| 22 | Testing with Vitest |
| 23 | Deployment Architecture (Vercel + Supabase) |
| 24 | Future Scope & Conclusion |

---

## 📖 SLIDE 1 — PROJECT OVERVIEW & PROBLEM STATEMENT

### What is CampusFleet?
CampusFleet is a **production-quality, full-stack web application** that digitizes and automates the **entire campus transportation lifecycle** for a university — from **spatial route planning** and **RedBus/AbhiBus-inspired seat allocation** to **live GPS tracking**, **QR-based attendance with real-time location verification**, and **payment processing**.

### Problem It Solves
- **Manual attendance** on campus buses leads to fraud, proxy check-ins, and inaccurate records
- **No live tracking** — parents/students have no idea where the bus is
- **Overbooking** — students fight for seats due to no structured boarding system
- **No centralized management** — routes, schedules, and staff managed on paper
- **Payment collection chaos** — no digital receipts, no verification

### How CampusFleet Solves It
| Problem | CampusFleet Solution |
|---------|---------------------|
| No seat guarantee | RedBus/AbhiBus-style 2×2 physical chassis seat allocation & attendance verification |
| Overbooking | Strict capacity enforcement — 1 seat per confirmed passenger |
| No tracking | Live GPS radar with Delhi Metro / RedBus-style station progression |
| Fraud | Anti-fraud QR digital boarding pass with 30-second rotating cryptographic nonce |
| Manual attendance | Dynamic QR scanner + GPS geofenced location verification (<150m Haversine) • Pluggable Biometric Hardware Adapter ready upon Director approval |
| Paper routes | Interactive map-based route builder with geofencing |
| Payment chaos | OCR-powered receipt scanning with UPI/UTR auto-detection |

---

## 📖 SLIDE 2 — TECHNOLOGY STACK

### Frontend
| Technology | Purpose | File |
|-----------|---------|------|
| **Next.js 14 (App Router)** | React-based full-stack framework with server-side rendering | `next.config.mjs` |
| **React 18** | Component-based UI rendering | `package.json` |
| **TypeScript** | Type-safe JavaScript with compile-time error checking | `tsconfig.json` |
| **Tailwind CSS** | Utility-first responsive CSS styling | `tailwind.config.ts` |
| **Framer Motion** | Smooth animations and micro-interactions | Used across all components |
| **Lucide React** | Modern SVG icon library | Used in all UI components |
| **Recharts** | Data visualization (route demand, attendance charts) | Admin dashboard components |
| **Leaflet + React-Leaflet** | Interactive maps with custom bus markers | `src/components/maps/` |
| **qrcode.react** | QR code generation for digital boarding passes | `src/components/ticket/BoardingPassCard.tsx` |
| **html5-qrcode / jsqr** | Camera-based QR code scanning | `src/components/scanner/` |

### Backend
| Technology | Purpose | File |
|-----------|---------|------|
| **Supabase PostgreSQL** | Cloud-hosted relational database with RLS | `supabase/migrations/` |
| **Supabase Realtime** | WebSocket-based live bus location broadcasting | `src/lib/telematicsService.ts` |
| **Next.js API Routes** | RESTful backend endpoints (26 API route groups) | `src/app/api/` |
| **jose (JWT)** | Secure token signing/verification (HS256) | `src/lib/jwt.ts` |
| **bcryptjs** | Password hashing | `package.json` |
| **Nodemailer** | Email-based OTP delivery | `src/lib/email.ts` |
| **Tesseract.js** | OCR engine for payment receipt scanning | `src/lib/ocrService.ts` |
| **Upstash Redis** | Rate limiting and session caching | `src/lib/redis.ts` |
| **Razorpay** | Payment gateway integration | `package.json` |
| **Zod** | Runtime schema validation for API inputs | `package.json` |
| **Vitest** | Unit testing framework | `vitest.config.ts` |

### Infrastructure
| Service | Role |
|---------|------|
| **Vercel** | Serverless deployment (edge functions, CDN) |
| **Supabase** | Managed PostgreSQL + Realtime + Storage |
| **Upstash** | Serverless Redis |

---

## 📖 SLIDE 3 — SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENTS (7 Roles)                         │
│  Student Portal │ Driver Console │ Conductor │ Admin │ ...   │
│    (React + Next.js SSR + PWA)                               │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌──────────────────────────────────────────────────────────────┐
│               NEXT.JS MIDDLEWARE (Edge)                      │
│  • JWT Verification  • CSRF Protection  • RBAC Guard         │
│  • Cross-Portal Redirect  • Request ID Injection             │
│  File: src/middleware.ts (256 lines)                          │
└───────────────────────┬──────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  API Routes  │ │ Server       │ │ Static       │
│  (26 groups) │ │ Components   │ │ Assets/PWA   │
│  /api/auth   │ │ (SSR Pages)  │ │ manifest.ts  │
│  /api/bookings│ │              │ │              │
│  /api/stops  │ │              │ │              │
└──────┬───────┘ └──────────────┘ └──────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│              SUPABASE CLOUD PLATFORM                         │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │PostgreSQL │  │ Realtime     │  │ Row Level Security   │  │
│  │ 26+ Tables│  │ WebSockets   │  │ (RLS Policies)       │  │
│  │ PL/pgSQL  │  │ (Telematics) │  │ per-role data access │  │
│  └───────────┘  └──────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📖 SLIDE 4 — DATABASE SCHEMA (26+ Tables)

The database is defined in **24 migration files** inside `supabase/migrations/`. Here is the complete table list with purpose:

### Core Auth & RBAC
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User accounts (linked to auth.users) | `id`, `email`, `full_name`, `role` (enum), `phone`, `avatar_url` |
| `permissions` | Granular permission definitions | `code`, `name`, `category` |
| `roles` | System and custom role definitions | `name`, `is_system_role` |
| `role_permissions` | Many-to-many: roles ↔️ permissions | `role_id`, `permission_id` |
| `user_roles` | Many-to-many: users ↔️ roles | `user_id`, `role_id` |

### Fleet & Infrastructure
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `buses` | Vehicle fleet registry | `bus_number`, `registration_no`, `model`, `capacity`, `seat_layout`, `gps_device_id`, `status` (enum) |
| `bus_seats` | Individual seat inventory per bus | `bus_id`, `seat_number` (e.g., "1A"), `deck`, `is_accessible` |
| `stops` | Bus stops with GPS coordinates | `name`, `code`, `latitude`, `longitude`, `geofence_radius_meters` |
| `routes` | Transit corridors/routes | `code`, `name`, `direction` (HOME_TO_CAMPUS etc.), `color`, `total_distance_km` |
| `route_stops` | Ordered stops on each route | `route_id`, `stop_id`, `stop_order`, `arrival_offset_minutes` |
| `shifts` | Daily shift definitions | `name`, `shift_type` (MORNING/EVENING), `start_time`, `end_time`, `booking_cutoff_mins` |
| `campuses` | University campus locations | `name`, `code`, `latitude`, `longitude`, `geofence_radius_meters`, `fleet_capacity` |
| `transit_zones` | Fee zone corridors | `code`, `name`, `semester_fee`, `installments_allowed` |

### People
| Table | Purpose |
|-------|---------|
| `staff` | Driver/conductor/admin staff records with employee codes |
| `students` | Student records with department, semester, primary stop, emergency contacts |
| `guardians` | Parent/guardian records |
| `student_guardians` | Many-to-many student ↔️ guardian links |
| `classes` | Academic class/section definitions |
| `class_teachers` | Teacher ↔️ class assignments |

### Operations
| Table | Purpose |
|-------|---------|
| `trips` | Daily scheduled trip instances (route + bus + shift + crew) |
| `bookings` | Seat reservations with status tracking (CONFIRMED / WAITLISTED / CANCELLED / BOARDED / NO_SHOW) |
| `booking_status_history` | Immutable audit trail of every booking state change |
| `attendance_events` | Check-in records with method (QR / Biometric / Manual) |
| `live_bus_locations` | Real-time GPS coordinates per bus |
| `location_history` | Historical GPS breadcrumb trail |
| `staff_assignments` | Crew-to-trip assignments |

### Financial
| Table | Purpose |
|-------|---------|
| `subscription_plans` | Transport subscription plan definitions |
| `subscriptions` | Student subscription records |
| `payment_transactions` | Payment receipts and transaction records |
| `payment_submissions` | OCR-scanned fee receipt submissions pending approval |

### Maintenance & Audit
| Table | Purpose |
|-------|---------|
| `vehicle_issues` | Reported bus issues (breakdown, delay, fuel) |
| `maintenance_records` | Service/repair history |
| `maintenance_requests` | Maintenance work orders with image attachments |
| `notifications` | In-app notification records |
| `audit_logs` | Immutable system action audit trail |
| `halt_requests` | Student bus halt/stop requests |
| `bus_merge_points` | Configured bus merge/consolidation locations |
| `bus_merge_suggestions` | Dynamic bus merge optimization suggestions |

### Key Database Features
1. **Row Level Security (RLS)**: Every sensitive table has RLS policies — students can only see their own bookings, parents see linked children's data, admins see everything.
2. **PL/pgSQL Atomic Functions**: `rpc_book_bus_seat()` — a database-level atomic function that ensures **no double-booking** even under concurrent requests (race condition prevention).
3. **PostgreSQL Enums**: `user_role_enum`, `booking_status_enum`, `trip_status_enum`, `vehicle_status_enum`, `payment_status_enum`, `attendance_method_enum` — ensuring data integrity at the database level.

---

## 📖 SLIDE 5 — AUTHENTICATION & SECURITY

### File: `src/lib/jwt.ts` (106 lines)

**What it does**: Implements a **custom JWT-based authentication system** independent of Supabase Auth. Supabase is used purely as a database.

**Line-by-line meaning**:
- **Lines 1-4**: Imports the `jose` library for JWT operations (signing, verification)
- **Lines 5-7**: Creates the JWT signing secret from environment variable (or dev fallback). Encoded to `Uint8Array` for `jose` library.
- **Lines 9-14**: Constants — cookie name (`campusfleet_session`), token expiry (24 hours), issuer/audience for validation.
- **Lines 16-24**: `SessionPayload` interface — defines what data is stored in the JWT: userId, email, fullName, role, campusId, avatarUrl.
- **Lines 31-42**: `signToken()` — Creates a new JWT token with:
  - `HS256` algorithm (HMAC-SHA256)
  - Auto-generated `jti` (JWT ID) for uniqueness and revocation support
  - Issued-at timestamp, 24h expiration
  - Issuer (`campusfleet`) and Audience (`campusfleet-app`) claims
- **Lines 48-58**: `verifyToken()` — Decodes and validates a JWT, checking issuer + audience + expiration. Returns `null` if invalid.
- **Lines 63-67**: `getSessionFromRequest()` — Extracts JWT from request cookies for API route handlers.
- **Lines 72-77**: `getSession()` — Extracts JWT from Next.js server-side cookies for server components.
- **Lines 83-96**: `createSessionCookie()` — Generates a secure `Set-Cookie` header with `HttpOnly` (no JS access), `SameSite=Lax` (CSRF protection), and `Secure` (HTTPS only in production).

### File: `src/middleware.ts` (256 lines)

**What it does**: Next.js Edge Middleware that runs **before every request**. Acts as the security gatekeeper.

**Key security features**:
1. **JWT Validation** (Lines 155-157): Reads token from cookie, verifies with `jose`
2. **CSRF Protection** (Lines 130-143): Blocks cross-origin `POST/PUT/PATCH/DELETE` requests by checking the `Origin` header against allowed origins
3. **Cross-Portal Guard** (Lines 200-238): Prevents users from accessing portals they're not authorized for (e.g., a student trying to access `/admin`)
4. **Role-Based Routing** (Lines 38-55): Maps each role to its correct portal path
5. **Request ID Injection** (Line 198): Adds `x-request-id` header for audit trail correlation
6. **Permanent Migration Redirects** (Lines 110-121): Redirects old URLs (`/staff` → `/transport-admin`)

### File: `src/lib/auth-service.ts` (288 lines)

**What it does**: Client-side authentication service with **Google OAuth**, **Email OTP**, session persistence, and profile management.

**Key methods**:
- `signInWithGoogle()` — Redirects to `/api/auth/google` for OAuth flow
- `sendOtp(email)` — Sends a 6-digit OTP to user's email via API
- `verifyOtp(email, token)` — Verifies OTP and establishes session
- `logout()` — Clears JWT cookie and localStorage
- `refreshSession()` — Re-fetches latest session to sync server/client

---

## 📖 SLIDE 6 — ROLE-BASED ACCESS CONTROL (7 Roles)

### File: `src/lib/types.ts` — Line 1
```typescript
export type UserRole = "admin" | "student" | "driver" | "conductor" 
                     | "transport_manager" | "teacher" | "transport_admin";
```

| Role | Portal URL | What They Can Do |
|------|-----------|-----------------|
| **student** | `/portal` | View bus schedule, book seats, track bus live, view digital QR pass, pay fees, SOS |
| **admin** | `/admin` | Full system control — all data CRUD, analytics, route builder, user management |
| **driver** | `/driver` | Start/end trips, broadcast GPS, report incidents (traffic, breakdown), view stop checklist |
| **conductor** | `/conductor` | QR/biometric attendance scanning, view manifest, manual override check-ins |
| **transport_admin** | `/transport-admin` | Manage routes/corridors/stops, fleet management, fee approvals, maintenance, staff, students, billing, reports |
| **transport_manager** | `/transport-manager` | Today's trip overview, crew management, demand analysis, bus merge decisions |
| **teacher** | `/teacher` | View class-wise student transport details, attendance by bus arrival |

### Middleware Enforcement (File: `src/middleware.ts`, Lines 210-218)
```typescript
const allowedPortalsForRole = {
  student: ["/portal"],
  admin: ["/admin", "/transport-admin", "/transport-manager"],  // Admin sees everything
  transport_admin: ["/transport-admin", "/transport-manager"],
  transport_manager: ["/transport-manager"],
  driver: ["/driver", "/conductor"],  // Driver can access conductor too
  conductor: ["/conductor"],
  teacher: ["/teacher"],
};
```
If a user tries to access a portal not in their allowed list, middleware **auto-redirects** them to their correct portal.

---

## 📖 SLIDE 7 — REDBUS & ABHIBUS-INSPIRED ATTENDANCE & SEAT ALLOCATION ENGINE

### Architectural Shift: Why RedBus & AbhiBus Instead of Railways?
Indian Railways (IRCTC) manages trains with multi-tier sleeper berths, RAC (Reservation Against Cancellation), unreserved compartments, and fixed train stations. **A university bus fleet is fundamentally different**: it operates 40-seater commercial buses with 2×2 seat configurations, roadside boarding points, high-altitude mountain ghats, and conductor check-ins.

To solve this, **we reverse-engineered India's two leading bus transit giants — RedBus and AbhiBus** — and adapted their core architectural patterns for university mobility and automated attendance.

---

### 🔍 REVERSE ENGINEERING: RedBus & AbhiBus vs. CampusFleet

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               ARCHITECTURAL COMPARISON & INSPIRATION MATRIX                       │
├─────────────────────┬──────────────────────────┬──────────────────────────┬───────────────────────┤
│ System Dimension    │ RedBus Architecture      │ AbhiBus Architecture     │ CampusFleet Elevation │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Coach Layout Matrix │ 2×2 / 2×1 spatial grid,  │ 2×2 coach layout,        │ Exact 2×2 physical    │
│                     │ driver steering wheel    │ aisle numbering,         │ chassis floorplan     │
│                     │ orientation, entry door. │ driver cabin reference.  │ (1A-1D to 10A-10D).   │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Inventory Locking   │ 10-15 min Redis lock     │ 10-min checkout lock     │ Redis SETNX atomic    │
│                     │ during checkout timer.   │ before seat release.     │ lock during hold.     │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Commute Model       │ Retail e-commerce        │ Retail e-commerce        │ Semester pass holder  │
│                     │ (per-ticket payment).    │ (per-ticket payment).    │ (zero-cost checkout). │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Boarding Discovery  │ Proximity BP/DP sorting  │ Boarding point checklist │ Proximity sorting +   │
│                     │ with scheduled offsets.  │ with landmark distances. │ active shift buses.   │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Live Telematics     │ "YourBus" GPS live map,  │ AbhiBus Live Radar,      │ Satellite Live Radar  │
│                     │ milestone progression.   │ vehicle speed alerts.    │ + Haversine geofence. │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Conductor App       │ redBus Operator console, │ AbhiBus Edge,            │ Conductor Manifest,   │
│                     │ manifest check-off.      │ trip passenger roster.   │ locked KYC photos.    │
├─────────────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┤
│ Innovation: Roaming │ None (checkout timer     │ None (payment checkout   │ Campus Roaming Hold   │
│                     │ only for buying ticket). │ session only).           │ (No bag on seat!).    │
└─────────────────────┴──────────────────────────┴──────────────────────────┴───────────────────────┘
```

#### What We Reverse-Engineered & Adopted from RedBus & AbhiBus:
1. **Visual 2×2 Coach Layout Matrix**:
   - Both RedBus and AbhiBus render a physical bus chassis with driver cabin positioning, aisle spacing, and clear visual indicators for window vs. aisle seats.
   - We implemented this in `src/lib/utils.ts` and `src/components/conductor/ConductorSeatMapView.tsx` — supporting `2x2`, `2x3`, `3x2`, and continuous rear bench (`10M`).
2. **Atomic Distributed Seat Locking**:
   - RedBus prevents multiple users from booking the same seat using distributed in-memory locks with TTL.
   - CampusFleet implements this using **Upstash Redis `SETNX`** and the PostgreSQL **`rpc_book_bus_seat()`** PL/pgSQL atomic transaction with row-level locks.
3. **Dynamic Boarding Point (BP) Discovery**:
   - RedBus and AbhiBus do not board all passengers at a single terminal depot; they provide milestone stops with arrival offset minutes.
   - CampusFleet’s `CommuteBusSelector.tsx` queries active trips for the shift, calculates distance from the student’s zone to nearby boarding points (e.g., *Bhakda & Laldant Road Chauraha 0.4 km away*), and displays all passing fleet buses.
4. **How CampusFleet Elevated the Model for Universities**:
   - **From Ticket Purchases to Automated Attendance**: RedBus charges ₹800 per seat. In CampusFleet, students hold semester transit passes (`subscriptions` table). Selecting a seat is a **digital boarding declaration** that syncs with conductor attendance rosters and faculty arrival feeds.
   - **The Campus Roaming Seat Hold ("Ending Backpack Warfare")**: While RedBus locks a seat for 10 minutes to collect payment, CampusFleet turns this lock into a student-life superpower: students hold their seat digitally in the cloud while studying in the library or eating in the cafeteria ("*Free to roam in canteen/library — no bag needed on seat*"), complete with live radar tracking and a 3-minute sprinting grace window!

---

### Core Implementation: `src/lib/reservation-engine.ts` (227 lines)

#### `createBooking()` Function — Step-by-Step Flow (Lines 50–169):
1. **Subscription Check (Lines 61–67)**: Validates that the commuter has an active, paid semester pass (`subscriptions` table).
2. **Administrative Suspension Check (Lines 69–74)**: Rejects commuters whose bus access is suspended.
3. **Shift Cutoff Check (Lines 76–82)**: Validates that the booking window is open (configurable, default 45 mins before departure).
4. **Shift-Level Mutual Exclusion (Lines 84–114)**: **Strictly 1 active allocation per shift window** per student across the entire university fleet, preventing hoarding or multi-bus abuse.
5. **Seat Capacity Computation (Lines 116–118)**: Calls `getAvailableSeats()` which generates the 2×2 chassis layout, filters out occupied/boarded seats, and returns available inventory.
6. **Seat Assignment (Lines 121–161)**:
   - Assigns preferred physical seat (e.g., `12A`, `32`) if available.
   - Generates unique booking identifier: `BS-{tripCode}-{random4digits}`.
   - Appends audit trail entry into `booking_status_history`.
7. **Capacity Cap (Lines 162–168)**: Enforces certified vehicle capacity — no dangerous mountain overload permitted.

#### PL/pgSQL Atomic Function — `supabase/migrations/20260830_initial_bussync_schema.sql` (Lines 454–540)
```sql
CREATE FUNCTION public.rpc_book_bus_seat(
    p_student_id UUID, p_trip_id UUID, p_boarding_stop_id UUID, p_user_id UUID
) RETURNS JSONB
```
This PostgreSQL function executes within an atomic ACID transaction. Even if 50 students attempt to claim the last seat simultaneously, the database guarantees that exactly one transaction succeeds, preventing race conditions and double-booking.


---

## 📖 SLIDE 8 — ROUTE OPTIMIZATION ALGORITHMS

### File: `src/lib/route-optimizer.ts` (1,141 lines)

This is the **most algorithmically complex file** in the project. It implements **5 graph algorithms** for intelligent route planning:

### Algorithm 1: Graph Builder (Lines 136-176)
**What it does**: Converts all bus routes and stops into a **weighted adjacency list** (graph data structure).
- Each stop = a node
- Each consecutive pair of stops on a route = an edge
- Edge weight = Haversine distance in km between the two stops
- **Bidirectional edges** (buses run both ways)

### Algorithm 2: Dijkstra's Shortest Path (Lines 199-301)
**What it does**: Finds the **shortest distance path** between any two bus stops.

**Data structures used**:
- **Binary Min-Heap** (custom implementation, Lines 80-125): O(log n) insert and extract-min
- **Distance Map**: Stores shortest known distance to each node
- **Previous Node Map**: For path reconstruction

**Time complexity**: O((V + E) log V)

**How it works**:
1. Initialize all distances to infinity, source to 0
2. Push source into min-heap
3. Extract minimum, relax all neighbors
4. If shorter path found, update distance and push to heap
5. Early exit when target is reached
6. Reconstruct path by following `prev` pointers backwards

**Output**: Path (ordered stop IDs), total distance in km, estimated travel time, route IDs used, whether transfer is needed

### Algorithm 3: Bellman-Ford Nearest Stops (Lines 323-434)
**What it does**: Finds the **nearest bus stops** from a student's home location, with a **connectivity bonus** for well-served stops.

**Why Bellman-Ford instead of just sorting by distance?**
- A stop 500m away with 4 bus routes is **better** than a stop 300m away with only 1 route
- The algorithm uses **negative edge weights** (connectivity bonus) which Dijkstra cannot handle
- Bellman-Ford handles negative weights correctly

**How it works**:
1. Creates a virtual "HOME" node connected to all stops via walking distance edges
2. Applies connectivity bonus: `-0.15 km discount per additional bus route` serving that stop
3. Runs Bellman-Ford relaxation: `|V| - 1` iterations
4. Includes negative cycle detection (safety check)
5. Returns stops sorted by adjusted score (lower = better)

**Time complexity**: O(V × E)

### Algorithm 4: A* Search (Lines 626-723)
**What it does**: **Faster point-to-point shortest path** than Dijkstra using a heuristic.

**Heuristic**: Haversine distance to target (admissible — never overestimates road distance)

**Why it's faster**: Explores far fewer nodes than Dijkstra because the heuristic guides the search toward the target, pruning irrelevant directions.

### Algorithm 5: Floyd-Warshall All-Pairs (Lines 748-807)
**What it does**: **Precomputes shortest distances between ALL pairs of stops** in one pass.

**Time complexity**: O(V³) — but after running once, any distance lookup is O(1)

**Used for**: Dashboard analytics — network diameter, average connectivity, hub identification

### Algorithm 6: Kruskal's Minimum Spanning Tree (Lines 921-965)
**What it does**: Finds the **minimum set of connections** needed to keep all stops reachable.

**Uses**: Union-Find (Disjoint Set Union) with path compression and union by rank for cycle detection.

**Purpose**: Admin dashboard shows "minimum infrastructure needed to connect all stops" and identifies redundant routes.

### Combined Route Recommender (Lines 513-607)
**Combines all algorithms**:
1. **Bellman-Ford** → Find top N nearest stops from home
2. **Dijkstra** → For each candidate stop, find shortest path to campus
3. **Score** = `walking_distance × 4 + bus_distance + transfer_penalty + doorstep_bonus`
4. Sort by total score and return ranked recommendations

### Direct Express Engine (Lines 1067-1139)
**Optimization**: When a bus is full or has picked up all passengers, it **skips remaining empty stops** and goes directly to campus — saving 10-15 minutes per trip.

---

## 📖 SLIDE 9 — REAL-TIME GPS TELEMATICS & FLEET POSITIONING

### File: `src/lib/telematicsService.ts` (129 lines)

**What it does**: Broadcasts live bus GPS coordinates using **dual-channel architecture**:

1. **Supabase Realtime WebSocket** (Lines 22-43): Network-level broadcast to all connected clients across devices. Zero database writes — pure in-memory WebSocket messaging.

2. **HTML5 BroadcastChannel** (Lines 46-57): In-memory cross-tab communication within the same browser. Zero disk I/O.

**Key design decision**: GPS pings (every 15 seconds) are **never written to PostgreSQL** on each ping. This saves massive database I/O. Historical locations are batched and written periodically.

### File: `src/lib/fleetPositioning.ts` (317 lines)

**What it does**: Computes the **map position of every bus** in the fleet based on time-of-day and trip state.

**Bus State Machine** (3 states):

| State | Condition | Bus Position |
|-------|-----------|--------------|
| `CAMPUS_PARKED` | Trip completed or idle | Parked in dedicated bay in University Transit Depot |
| `STANDBY_STARTING_POINT` | 1 hour before departure | Positioned at route's first stop (origin) |
| `IN_TRANSIT` | During trip or after departure | Live GPS from driver OR interpolated corridor position |

**Route Interpolation** (Lines 98-128): When no live GPS ping is available, the bus position is **interpolated** along the route corridor based on time progress — giving a realistic "moving bus" effect on the map.

**Campus Depot Slots** (Lines 54-73): Calculates individual parking bay positions within the university campus — 4 rows of 4 bays each, spaced ~35-45 meters apart.

---

## 📖 SLIDE 10 — ETA CALCULATOR (Haversine Formula)

### File: `src/lib/eta-calculator.ts` (70 lines)

### Haversine Distance Formula (Lines 6-23)
Calculates the **great-circle distance** between two GPS coordinates on Earth's surface:

```
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlon/2)
c = 2 × atan2(√a, √(1-a))
distance = R × c    (where R = 6,371 km = Earth's radius)
```

### Geofence Check (Lines 28-36)
Determines if a bus is **within the geofence radius** of a stop (typically 80-150 meters). Used to auto-detect stop arrivals.

### ETA Calculation (Lines 41-69)
```
ETA = (distance / speed) × 60 + delay_minutes
```
- Minimum speed assumed: 15 km/h (urban campus traffic)
- If distance < 200m → "Arriving now"
- If ETA ≤ 2 mins → "Approaching (1-2 mins)"
- Otherwise → "X mins"

---

## 📖 SLIDE 11 — STUDENT & PARENT PORTAL (`/portal`)

### Pages:
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/portal` | Today's bus info, ETA, live status, quick actions |
| Tracker | `/portal/tracker` | Full-screen GPS radar with Delhi Metro-style station line |
| Pass | `/portal/pass` | Anti-fraud QR digital boarding pass with seat number |
| Booking | `/portal/booking` | RedBus & AbhiBus-style 2×2 seat selection with live capacity gauge |
| Payments | `/portal/payments` | Subscription plans, fee payment, OCR receipt upload |
| Profile | `/portal/profile` | Student info, emergency contacts, language preferences |

### Key Features:
- **Live ETA Countdown**: "Your bus arrives in 7 minutes" with real-time updates
- **Metro-style Station Line**: Visual progression showing which stops the bus has crossed
- **Digital Boarding Pass**: QR code containing `bookingId + studentId + tripId + seatNumber` — verified by conductor
- **Seat Map**: Visual bus seat layout showing available/occupied seats
- **Emergency SOS**: Red button that triggers high-priority alert with GPS coordinates to admin
- **Multi-child Switcher**: Parents with multiple children can switch between them
- **10-Language Support**: UI translatable to Hindi, Punjabi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam

---

## 📖 SLIDE 12 — DRIVER CONSOLE (`/driver`)

### Features:
- **Mobile-first cabin console** — designed for in-vehicle use
- **1-tap Trip Start/End** — begins/ends the trip with timestamp
- **GPS Broadcasting**: Every 15 seconds, broadcasts live coordinates via Supabase Realtime WebSockets
- **Stop Checklist**: Turn-by-turn list of stops with check-off capability
- **Incident Reporting**: Quick buttons for Traffic, Breakdown, Fuel, Delay, Emergency reports
- **Halt Request Queue**: See student halt requests and approve/reject them

---

## 📖 SLIDE 13 — CONDUCTOR CONSOLE (`/conductor`)

### Features:
- **Final Passenger Manifest**: Frozen list of confirmed passengers for the trip with locked student KYC photos
- **Active Operational Mode — QR-Based Attendance with Real-Time Location Verification**:
  - Uses device camera with 60 FPS `jsQR` optical decoder to scan student dynamic boarding passes
  - **Location Geofence Validation**: Real-time GPS verification checks that conductor & bus are physically within the designated stop radius (<150m Haversine)
  - **Anti-Spoofing & Anti-Proxy**: Defeats static screenshot sharing via 30-second rotating cryptographic nonce
- **Biometric Hardware Readiness (Architecture Complete — Pending Director Approval)**:
  - Software is architected with a pluggable on-chip Biometric Hardware Adapter (`BiometricAndQRScanner.tsx`)
  - No raw biometric or fingerprint images stored in database (strict privacy compliance)
  - Returns cryptographically signed verification tokens (e.g., `SIG-FP-AES256-VALID-7729`)
  - Ready for rapid fleet-wide hardware installation once Director Sir approves physical scanner procurement
  - Manual override available with mandatory justification reason for edge cases
- **Attendance Recording**: Marks students as `BOARDED` (Present), `ABSENT`, or `NO_SHOW` in sub-50ms
- **Bus Door QR Code**: Generates a bus-specific QR that students can scan for self-check-in with GPS proximity check

---

## 📖 SLIDE 14 — ADMIN OPERATIONS CENTER (`/admin`)

### Features:
- **Live Operations Map**: Leaflet map showing all buses with real-time positions
- **Fleet KPI Dashboard**: Route demand charts, attendance trends, seat occupancy
- **Interactive Route Builder**: Draw routes on map, add/remove stops, set geofence radii
- **Staff RBAC Matrix**: Manage user roles and permissions
- **Student Roster**: Complete student directory with transport details
- **Vehicle Issue Desk**: Track and resolve bus breakdowns/incidents
- **CSV Export Reports**: Generate compliance reports for download
- **Subscription Billing**: Revenue tracking and subscription management

---

## 📖 SLIDE 15 — TRANSPORT ADMIN PANEL (`/transport-admin`)

### Components (14 views):
| Component | File | Purpose |
|-----------|------|---------|
| Routes | `StaffRoutesView.tsx` | Manage corridors, stops, campus locations |
| Corridors | `CorridorsManager.tsx` | Route corridor management with map |
| Stops | `StopsManager.tsx` | Add/edit bus stops with GPS coordinates |
| Buses | `TransportAdminBusesView.tsx` | Fleet management, seat layouts |
| Trips | `TransportAdminTripsView.tsx` | Trip scheduling and management |
| Reservations | `StaffReservationsView.tsx` | Booking oversight and waitlist management |
| Users | `StaffUsersView.tsx` | User account management |
| Students | `StaffStudentsView.tsx` | Student transport records |
| Classes | `StaffClassesView.tsx` | Academic class configuration |
| Billing | `StaffBillingView.tsx` | Fee zone and subscription management |
| Fee Approvals | `StaffFeeApprovalsView.tsx` | Approve/reject payment submissions |
| Maintenance | `StaffMaintenanceView.tsx` | Vehicle maintenance work orders |
| Reports | `StaffReportsView.tsx` | Generate and export reports |
| Campuses | `StaffCampusesView.tsx` | Multi-campus configuration |

---

## 📖 SLIDE 16 — TRANSPORT MANAGER PANEL (`/transport-manager`)

### Components (4 views):
| Component | Purpose |
|-----------|---------|
| `ManagerTodayTripsView` | Real-time overview of all today's active trips |
| `TransportManagerCrewView` | Staff/crew assignment and availability |
| `TransportManagerDemandView` | Route demand analysis and capacity planning |
| `TransportManagerMergesView` | Bus merge point optimization decisions |

---

## 📖 SLIDE 17 — TEACHER PANEL (`/teacher`)

### Component: `TeacherConsoleView.tsx`
- View class-wise student transport arrivals
- See which students arrived by bus today
- Monitor attendance patterns for their assigned classes

---

## 📖 SLIDE 18 — PAYMENT SYSTEM & OCR RECEIPT VERIFICATION

### File: `src/lib/ocrService.ts` (157 lines)

**What it does**: Uses **Tesseract.js** (neural OCR engine) to automatically extract **UPI transaction ID** and **payment amount** from uploaded payment screenshot images.

### Transaction ID Extraction (5 strategies):
1. **Labeled patterns**: "UTR: 123456789012", "UPI Ref No: T2208..."
2. **PhonePe format**: Matches `T{18-24 alphanumeric}` pattern
3. **Standard UPI UTR**: Exact 12-digit number match
4. **Spaced UTR**: "1234 5678 9012" → "123456789012"
5. **Fallback**: Any 10-16 digit number

### Amount Extraction (3 strategies):
1. **Labeled amounts**: "Amount: ₹14,000" or "Paid ₹6,000"
2. **Currency prefix**: "₹14,000" or "Rs. 6,000" or "INR 12000"
3. **Standalone large numbers**: Fallback for unlabeled amounts

### Transit Zones (Fee Structure)
| Zone | Corridor | Semester Fee |
|------|----------|-------------|
| Zone A | Lamachaur & Kaladhungi | ₹14,000 |
| Zone B | Haldwani City & Mukhani | ₹12,000 |
| Zone C | Kathgodam & Bhowali Hills | ₹10,000 |
| Zone D | Campus Local Vicinity | ₹6,000 |

---

## 📖 SLIDE 19 — DAILY OPERATIONS ROLLOVER (Automated CRON)

### File: `src/lib/daily-rollover.ts` (254 lines)

**What it does**: Runs automatically every day (via Vercel CRON at `/api/cron`) to reset the entire transport operations for a new day.

### Rollover Steps:
1. **Check idempotency**: If trips already exist for today → skip (prevents duplicate runs)
2. **Archive yesterday's trips**: Mark incomplete trips as COMPLETED
3. **Mark no-shows**: Any CONFIRMED booking from yesterday that wasn't boarded → NO_SHOW
4. **Generate today's trips**: For each active route × each daily shift → create a SCHEDULED trip with assigned bus, driver, and conductor
5. **Reset bus occupancy**: All buses start at 0% capacity
6. **Expire stale merge suggestions**: Clean up yesterday's pending bus merge suggestions
7. **Audit log**: Record an immutable log entry documenting the entire rollover

---

## 📖 SLIDE 20 — MULTI-LANGUAGE SUPPORT (10 Indian Languages)

### File: `src/lib/translations.ts` (61,709 bytes — the largest file in the project)

Supports **10 languages**:

| Code | Language |
|------|----------|
| `en` | English |
| `hi` | Hindi (हिन्दी) |
| `pa` | Punjabi (ਪੰਜਾਬੀ) |
| `bn` | Bengali (বাংলা) |
| `ta` | Tamil (தமிழ்) |
| `te` | Telugu (తెలుగు) |
| `mr` | Marathi (मराठी) |
| `gu` | Gujarati (ગુજરાતી) |
| `kn` | Kannada (ಕನ್ನಡ) |
| `ml` | Malayalam (മലയാളം) |

Every UI string is translated — buttons, labels, notifications, error messages, status badges.

---

## 📖 SLIDE 21 — PWA & MOBILE-FIRST DESIGN

### File: `src/app/manifest.ts` (1,291 bytes)
Defines the **Progressive Web App** manifest:
- App name, short name, icons
- Theme color, background color
- Display mode: `standalone` (looks like a native app)
- Start URL, scope

### File: `src/lib/usePWAInstall.ts` (3,133 bytes)
Custom React hook for:
- Detecting PWA install prompt
- Tracking installation state
- Handling the "Add to Home Screen" flow

### File: `src/lib/transit-sound.ts` (4,768 bytes)
Transit-style audio feedback:
- Station arrival chimes
- Boarding alert sounds
- Departure notification tones

### Mobile Responsiveness
- **All pages are responsive** — work on phones, tablets, and desktops
- Driver and conductor consoles are specifically **optimized for mobile use** (in-vehicle)
- Student portal uses bottom navigation pattern for thumb-friendly interaction

---

## 📖 SLIDE 22 — TESTING WITH VITEST

### File: `src/lib/route-optimizer.test.ts` (16,286 bytes)
Comprehensive test suite for all graph algorithms:
- Graph building from routes
- Dijkstra shortest path correctness
- Bellman-Ford nearest stops with connectivity bonuses
- A* search optimality
- Floyd-Warshall all-pairs distances
- Kruskal's MST weight and connectivity
- Edge cases: disconnected graphs, single-node paths, negative cycles

### File: `vitest.config.ts`
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

---

## 📖 SLIDE 23 — DEPLOYMENT ARCHITECTURE

### Production Deployment
```
GitHub Repository
      │
      ├──► Vercel (Auto-deploy on push)
      │     ├── Edge Functions (middleware, API routes)
      │     ├── Serverless Functions (Node.js runtime)
      │     ├── Static Assets (CDN-cached globally)
      │     └── CRON Jobs (daily rollover)
      │
      └──► Supabase Cloud
            ├── PostgreSQL Database (26+ tables, RLS)
            ├── Realtime WebSockets (GPS telematics)
            ├── Storage (receipt images, photos)
            └── Edge Functions (database triggers)
```

### Environment Variables Required
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-32-char-secret
```

### Live URLs
- **Production**: https://campusfleet.vercel.app
- **Mirror 1**: https://ridx.vercel.app
- **Mirror 2**: https://campusfleet-live.vercel.app

---

## 📖 SLIDE 24 — FUTURE IMPROVEMENTS, ARCHITECTURAL ROADMAP & CONCLUSION

### Code Statistics
| Metric | Value |
|--------|-------|
| Total Files | 386 |
| Source Files (.ts/.tsx) | 256 |
| Database Tables | 29 |
| API Route Groups | 26 (67 REST endpoints) |
| Database Migrations | 24 |
| Graph Algorithms | 6 (Dijkstra, Bellman-Ford, A*, Floyd-Warshall, Kruskal's MST, Direct Express) |
| User Roles | 7 |
| Supported Languages | 10 |
| Route Optimizer | 1,141 lines |
| Type Definitions | 619 lines |
| Translation File | 61,709 bytes |

### Key Technical Achievements
1. **RedBus & AbhiBus-inspired attendance & seat allocation engine** with atomic concurrency locks (no double-booking)
2. **6 graph algorithms** implemented from scratch (not library imports)
3. **Real-time GPS tracking** with zero-database-write WebSocket architecture
4. **OCR-powered payment verification** with Tesseract.js neural engine
5. **6-portal RBAC** with JWT security, CSRF protection, and cross-portal guards
6. **Dual Attendance Architecture** — Active QR attendance with GPS location verification (<150m anti-spoof), plus pluggable biometric hardware adapter ready for deployment upon Director approval
7. **29 PostgreSQL tables** with Row Level Security policies
8. **PL/pgSQL atomic functions** for concurrent race-condition prevention
9. **10-language support** across all UI surfaces
10. **PWA-ready** with install prompt, offline awareness, transit sounds
11. **Automated daily rollover** via CRON — zero manual intervention
12. **Production-deployed** on Vercel with high-availability mirrors

---

### 🚀 Future Improvements & Architectural Suggestions (Phase 2 Roadmap)

#### 1. Hybrid "Reserve-to-Stop" Auto-Cancelling Seat Allocation & Direct Attendance
- **The Concept**: Combine advance seat reservation with instant walk-in attendance.
  - A student can pre-reserve an unreserved seat up to their designated morning boarding stop (*e.g., Seat 14B at Bhakda Chauraha*).
  - **Auto-Cancellation on Stop No-Show**: If the student does not physically board and mark attendance (via bus-door QR scan + <150m Haversine GPS check) by the time the bus departs their stop, the reservation is **automatically cancelled** and released back to the open seat pool.
  - **Direct Walk-In Attendance**: Commuters who did not pre-reserve can directly board the bus, scan the door QR, and immediately claim any unreserved or released seat.
- **Architectural Trade-Off & Complexity**:
  - *Challenge*: Introduces dual state management (both advance reservation state and real-time attendance state).
  - *Engineering Solution*: Solved via Redis key expiration events and driver cockpit stop-geofence departure webhooks (`POST /api/trips/[tripId]/depart-stop`), ensuring zero seats remain artificially blocked while commuters wait on the road.

#### 2. Student Home Geolocation & AI Nearest Stop / Route Recommender
- **Database Schema Expansion**:
  - Add `home_latitude` and `home_longitude` columns to the `students` table, captured securely during student KYC onboarding.
- **Spatial Shortest-Path Matching**:
  - Uses the Haversine formula and OpenStreetMap road nodes to compute exact walking distances and walking times (in minutes) from the student's residence to all nearby corridor stops.
- **Dynamic Suggestions in Student Portal**:
  - Automatically recommends:
    1. The nearest pickup stop (*e.g., "Gupta Store Halt is 320m (4 min walk) from your home"*).
    2. The optimal departure time and least congested shift bus (*e.g., "Take Bus 8 at 07:35 AM instead of Bus 2 for guaranteed seating"*).
    3. The fastest transit corridor, accounting for current road congestion and weather alerts.
- **Institutional Benefit**: Aggregated student home location clusters give transport managers empirical data to optimize or merge physical bus stops.

#### 3. Offline Mountain Manifest Sync via IndexedDB & Service Workers
- **Himalayan Cellular Dead Zone Resiliency**:
  - Mountain corridors between Kathgodam, Pines, and Bhowali experience intermittent cellular signal loss.
  - Conductor PWA pre-caches the daily passenger manifest and seat allocation matrix inside **IndexedDB** before bus departure.
  - Conductor's 60 FPS camera scanner continues verifying dynamic QR boarding passes completely offline.
  - Validated attendance events are stored in a local IndexedDB buffer queue and automatically synced to PostgreSQL via `/api/sync/state` once cellular connectivity is restored.

#### 4. Physical Fleet Biometric Hardware Rollout (Pending Director Sir's Approval)
- Deploy physical on-chip biometric fingerprint terminals on buses using the existing pluggable `BiometricAndQRScanner.tsx` adapter protocol.
- Ensures zero raw biometric data storage, transmitting only cryptographically signed verification tokens to the database.

---

### Demonstration Walkthrough for Director Sir
1. **Open** https://campusfleet.vercel.app → See the login/gateway
2. **Student Portal** → Show live bus tracker, ETA, station progression
3. **RedBus/AbhiBus Seat Selection** → Select preferred seat (e.g., `12A`, `32`), see live 2×2 layout
4. **Campus Roaming Hold** → Show active seat hold ("No bag needed on seat") with live radar
5. **QR Pass** → Show the anti-fraud digital boarding pass with 30-second rotating HMAC nonce
6. **Driver Console** → Start trip, see autonomous <150m geofencing
7. **Conductor Console** → Scan QR, view passenger manifest with locked photo verification
8. **Admin Panel** → Show fleet map, corridor builder, bus combiner analytics
9. **Payment** → Upload a receipt screenshot, see OCR extract the UPI UTR number
10. **Future Scope** → Present the Hybrid Reserve-to-Stop model and Student Home Geo-Routing!

---

> **Prepared for PPT Presentation to Director Sir**  
> **Engineering Team**: Aditya Pandey, Harsh Kumar, Kartik Bisht, Gaurang Joshi  
> **Total Lines of Code Analyzed**: ~15,000+ lines across 120+ files

