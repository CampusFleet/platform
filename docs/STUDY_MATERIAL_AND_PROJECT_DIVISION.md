# 🚌 CampusFleet — 4-Member Project Division, Detailed Study Material & Viva Master Guide

> **Official Project Name**: CampusFleet – Smart Campus Transit, Live Telematics & Intelligent Fleet Operations Management System  
> **Live Production Web App**: [https://campusfleet.vercel.app](https://campusfleet.vercel.app)  
> **GitHub Repository**: [https://github.com/CampusFleet/platform](https://github.com/CampusFleet/platform)  
> **Primary Technology Stack**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Supabase PostgreSQL, Leaflet GIS, Vitest  

---

## 📋 Table of Contents
1. [Project Overview & Core Problem Solved](#1-project-overview--core-problem-solved)
2. [Master 4-Member Project Division Matrix](#2-master-4-member-project-division-matrix)
3. [Deep-Dive Study Guide — Aditya Pandey (Team Leader)](#3-deep-dive-study-guide--aditya-pandey-team-leader)
4. [Deep-Dive Study Guide — Gaurang Joshi](#4-deep-dive-study-guide--gaurang-joshi)
5. [Deep-Dive Study Guide — Harsh Kumar](#5-deep-dive-study-guide--harsh-kumar)
6. [Deep-Dive Study Guide — Kartik Bisht (Simplified & High-Scoring Role)](#6-deep-dive-study-guide--kartik-bisht-simplified--high-scoring-role)
7. [Step-by-Step Viva Live Demonstration Script](#7-step-by-step-viva-live-demonstration-script)
8. [Examiner Architectural FAQ & Viva Defense](#8-examiner-architectural-faq--viva-defense)
9. [Generated Document & PDF Assets](#9-generated-document--pdf-assets)

---

## 1. Project Overview & Core Problem Solved

Traditional university campus bus transit faces chronic inefficiencies:
- **Bus Overcrowding & Safety Risks**: First-come-first-serve boarding results in students standing in aisles, overloading vehicles, and creating severe safety hazards.
- **Timetable & Transit Uncertainty**: Students and parents have no visibility into vehicle locations, leading to missed buses or prolonged waiting at bus stops.
- **Manual Paper Manifests & Proxy Attendance**: Conductors use paper checklists prone to manual errors, lost records, and student proxy attendance.
- **Uncoordinated Fleet Operations**: Breakdowns, delays, and vehicle maintenance tickets are managed via ad-hoc phone calls without centralized tracking.

### 🌟 CampusFleet's Five Architectural Innovations
1. **Railway-Inspired Fixed-Seat Allocation (Zero Standing)**: Every confirmed student is assigned a specific physical seat number (e.g. `12A`, `14B`).
2. **Sequential FIFO Waitlist & Instant Auto-Promotion**: When capacity is full, subsequent bookings join a sequential queue (`WL-01`, `WL-02`). If a confirmed seat cancels before the cutoff time, `WL-01` is instantly promoted to `CONFIRMED` with the freed seat.
3. **Real-Time Leaflet GIS Radar & Dynamic Haversine ETA**: Live GPS coordinates broadcast every 15s, combined with vehicle speed and delay offsets, power live countdowns ("Arrives in 7 mins") and metro-style linear station checklists.
4. **Quad-Role Crew Consoles**: Dedicated, purpose-built interfaces for **Students/Parents** (`/portal`), **Drivers** (`/staff/driver`), **Conductors** (`/staff/conductor`), and **Fleet Administrators** (`/admin`).
5. **Anti-Fraud Boarding Passes & Biometric Compliance**: Dynamic QR boarding tokens with live canvas clock animations, paired with on-chip Biometric Hardware Adapter protocol returning signed SHA-256 tokens (**zero raw fingerprint storage** in PostgreSQL).

---

## 2. Master 4-Member Project Division Matrix

| Member Name & Roll No. | Project Role | Modules Owned | Primary Code Files | Viva Defense Specialization |
| :--- | :--- | :--- | :--- | :--- |
| **Aditya Pandey**<br>*(Team Leader)*<br>`2361030` | **Full-Stack Architect & Core Engine Engineer** | • Railway Reservation Engine<br>• FIFO Auto-Promotion<br>• PostgreSQL Relational Schema & RLS<br>• Admin Operations HUD | • [`src/lib/reservation-engine.ts`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/lib/reservation-engine.ts)<br>• [`src/lib/store.ts`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/lib/store.ts)<br>• [`src/lib/types.ts`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/lib/types.ts)<br>• [`src/app/admin/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/admin)<br>• `supabase/migrations/*` | System architecture, concurrency handling, reservation algorithm math, database triggers & manifest cutoff locks. |
| **Gaurang Joshi**<br>`2361165` | **Geospatial Telematics & Student Portal Lead** | • Leaflet GIS Mapping<br>• Dynamic Haversine ETA Math<br>• Linear Station Progress Line<br>• Student/Parent Transit Radar<br>• Emergency SOS Modal | • [`CampusFleetMap.tsx`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/components/maps/CampusFleetMap.tsx)<br>• [`eta-calculator.ts`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/lib/eta-calculator.ts)<br>• [`StationLineProgress.tsx`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/components/ui/StationLineProgress.tsx)<br>• [`/portal/tracker/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/portal/tracker/page.tsx)<br>• [`/portal/booking/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/portal/booking/page.tsx) | Leaflet GIS tile rendering, Haversine formula calculation, live dynamic ETA, metro station checklist & SOS dispatch. |
| **Harsh Kumar**<br>`2361181` | **Staff Consoles & Security / RBAC Lead** | • Driver In-Cabin Console<br>• 15s GPS Telematics Broadcast<br>• Conductor Manifest Desk<br>• Camera QR Scanner Engine<br>• Biometric HW Protocol (Zero Raw) | • [`/staff/driver/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/staff/driver/page.tsx)<br>• [`/staff/conductor/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/staff/conductor/page.tsx)<br>• [`auth-service.ts`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/lib/auth-service.ts)<br>• [`BiometricAndQRScanner.tsx`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/components/scanner/BiometricAndQRScanner.tsx) | Driver 15s GPS broadcast, incident dispatcher, conductor manifest desk, camera QR scanner & zero raw biometric storage. |
| **Kartik Bisht**<br>*(Simple & High-Scoring)*<br>`2361256` | **QA, Student Pass & Maintenance Desk Lead** | • Digital Boarding Pass UI<br>• Light/Dark Theme Engine<br>• Bus Maintenance Desk<br>• 1-Click CSV Compliance Reports<br>• Vitest Automated Testing Suites | • [`/portal/pass/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/portal/pass/page.tsx)<br>• [`BoardingPassCard.tsx`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/components/ticket/BoardingPassCard.tsx)<br>• [`ThemeProvider.tsx`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/components/common/ThemeProvider.tsx)<br>• [`/admin/maintenance/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/admin/maintenance/page.tsx)<br>• [`/admin/reports/*`](file:///Users/adityapandeydev/Desktop/Major%20Project/src/app/admin/reports/page.tsx)<br>• [`vitest.config.ts`](file:///Users/adityapandeydev/Desktop/Major%20Project/vitest.config.ts) | **Simple & High-Scoring**: Digital boarding pass layout, animated live clock, theme engine, maintenance issue desk & Vitest testing. |

---

## 3. Deep-Dive Study Guide — Aditya Pandey (Team Leader)

### A. Technical Responsibilities & Module Ownership
- **System Architecture & App Router Structure**: Configured Next.js 14 App Router, reactive client store (`store.ts`), and TypeScript data contracts (`types.ts`).
- **Railway-Inspired Reservation Engine (`reservation-engine.ts`)**:
  - `getAvailableSeats(bus, activeBookings)`: Evaluates physical layout (e.g. 2x2 40-seater), extracts occupied seats, returns available array.
  - `createBooking()`: Validates subscription, checks manifest cutoff, allocates requested or next available physical seat, or assigns sequential waitlist ticket (`WL-01`).
  - `cancelBookingAndPromoteWaitlist()`: When a confirmed passenger cancels, it frees the seat, locates `WL-01`, auto-promotes it to `CONFIRMED` with the freed seat, and decrements all remaining waitlisted passengers (`WL-02` -> `WL-01`).
  - `isCutoffPassed()`: Locks manifest 45 minutes prior to trip departure.
- **Relational Database Design (Supabase PostgreSQL)**:
  - 26+ relational tables: `trips`, `bookings`, `buses`, `routes`, `stops`, `seats`, `telemetry_logs`, `attendance_logs`, `incident_reports`, `maintenance_tickets`, `subscriptions`.
  - Implemented Row-Level Security (RLS) policies and PL/pgSQL atomic triggers.
- **Admin Operations Center (`/admin`)**: Operations control map HUD, interactive Route Builder with geofencing radius, fleet roster, and manifest locks.

### B. Top Viva Q&A for Aditya Pandey
1. **Q: Why did you implement a Railway-Inspired Reservation Model?**  
   *Ans:* Traditional college buses operate on chaotic first-come-first-serve boarding with students standing in aisles. CampusFleet enforces strict 1 physical seat per confirmed passenger (Zero Standing) and sequential FIFO waitlists, guaranteeing student safety and eliminating bus overcrowding.
2. **Q: How does the FIFO auto-promotion algorithm work?**  
   *Ans:* When `cancelBookingAndPromoteWaitlist()` executes, it mutates the cancelled booking to `CANCELLED`, finds the booking with `status == 'WAITLISTED'` and `waitlistPosition == 1`, changes its status to `CONFIRMED` with the freed `seatNumber`, logs an audit entry, and decrements all subsequent waitlist positions.
3. **Q: How do you prevent race conditions during simultaneous bookings?**  
   *Ans:* We use PostgreSQL atomic transactions and Row-Level Security. Seat availability is checked and updated inside atomic PL/pgSQL functions using `SELECT ... FOR UPDATE` row-level locks so that conflicting concurrent requests cannot reserve the same physical seat.
4. **Q: What is the purpose of the Manifest Cutoff Lock?**  
   *Ans:* 45 minutes before departure, `isCutoffPassed()` evaluates to true and `trip.manifestLocked` is set. This prevents last-minute passenger churn, allowing conductors to generate a finalized manifest for verified boarding.
5. **Q: Why choose Next.js 14 App Router over plain React?**  
   *Ans:* Next.js 14 App Router provides Server Components for fast initial page load, built-in API Route Handlers, automatic code-splitting, and seamless edge deployment on Vercel.

---

## 4. Deep-Dive Study Guide — Gaurang Joshi

### A. Technical Responsibilities & Module Ownership
- **Leaflet GIS Integration (`CampusFleetMap.tsx`)**:
  - Interactive OpenStreetMap map with custom bus markers, pulse animations, stop geofencing circles, and polyline route overlays.
  - Dynamically imported with `next/dynamic` and `ssr: false` to prevent Server-Side Rendering window crashes.
- **Dynamic Haversine Math & ETA Engine (`eta-calculator.ts`)**:
  - `calculateHaversineDistanceKm(lat1, lon1, lat2, lon2)`:
    $$\Delta \text{lat} = \frac{(\text{lat}_2 - \text{lat}_1)\pi}{180}, \quad \Delta \text{lon} = \frac{(\text{lon}_2 - \text{lon}_1)\pi}{180}$$
    $$a = \sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta \text{lon}}{2}\right)$$
    $$c = 2 \cdot \text{atan2}(\sqrt{a}, \sqrt{1 - a}), \quad d = R \cdot c \quad (R = 6371\text{ km})$$
  - `calculateETA()`: Combines Haversine distance with vehicle speed (with a minimum urban floor of 15 km/h) and real-time delay minutes to compute accurate arrival countdowns ("Arrives in 7 mins", "Approaching", "Arriving now").
  - `isWithinGeofence()`: Detects when bus coordinates enter a stop's geofence boundary.
- **Student & Parent Transit Portal (`/portal` & `/portal/tracker`)**:
  - Linear Metro-style station progress line (`StationLineProgress.tsx`): Displays completed stops (green), current active stop (pulsing blue), and upcoming stops (gray).
  - Multi-child switcher for parents managing multiple students across different campus routes.
  - Emergency SOS modal with instant geolocation capture and security broadcast.
- **Shift Booking & Seat Map UI (`/portal/booking`)**: Interactive bus capacity gauge (38/40 filled), 2x2 visual seat grid, and real-time waitlist trigger button.

### B. Top Viva Q&A for Gaurang Joshi
1. **Q: What is the Haversine formula and why is it needed?**  
   *Ans:* The Haversine formula calculates the shortest great-circle distance between two GPS coordinate pairs on a spherical Earth (radius 6371 km). It provides curvature-accurate distances in kilometers, which our ETA calculator uses to compute arrival times.
2. **Q: Why did you use `next/dynamic` with `ssr: false` for the Leaflet Map?**  
   *Ans:* Leaflet requires access to browser-only global objects (`window`, `document`, `navigator`). In Next.js Server-Side Rendering (SSR), these objects do not exist on the server. Using dynamic import with `ssr: false` ensures the component renders strictly on the client side.
3. **Q: How does the dynamic ETA calculator adapt to unexpected traffic delays?**  
   *Ans:* $\text{ETA} = \left(\frac{\text{Distance}}{\text{Speed}}\right) \times 60 + \text{DelayMinutes}$. If a driver reports a 10-minute traffic delay, the calculator immediately incorporates the delay offset, updating all student and parent countdowns.
4. **Q: How does the StationLineProgress component work?**  
   *Ans:* It maps the array of `RouteStop` elements into an interactive vertical subway-style checklist. When a bus passes a stop's geofence, the node transitions to green (Passed) and the next node becomes active (Pulsing blue).
5. **Q: Why choose Leaflet over Google Maps API?**  
   *Ans:* Leaflet is open-source, lightweight (under 40KB), has zero recurring per-request API costs, allows complete CSS customization of transit markers, and supports offline tile caching.

---

## 5. Deep-Dive Study Guide — Harsh Kumar

### A. Technical Responsibilities & Module Ownership
- **Driver In-Cabin Mobile Console (`/staff/driver`)**:
  - 1-tap Trip Lifecycle: Transitions status from `SCHEDULED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED`.
  - 15-Second GPS Telematics Broadcast: Timer interval broadcasting simulated latitude, longitude, speed, and heading to Supabase.
  - Turn-by-turn stop progression checklist with 1-tap stop arrival check-in.
  - Incident Dispatcher: 1-tap reporting of Traffic Jams (+10m delay), Vehicle Breakdown, Fuel Stop, and Delay.
- **Conductor Manifest Desk & Attendance Scanner (`/staff/conductor`)**:
  - Live Passenger Manifest: Roster of confirmed students with assigned seats, boarding stops, and boarding badges (`PENDING`, `BOARDED`, `ABSENT`).
  - Built-in Camera QR Scanner: Uses `html5-qrcode` to scan dynamic boarding passes in under 300ms.
  - Manual Override: Fallback check-in if student device battery dies, requiring a mandatory audit reason.
- **Biometric Hardware Adapter & Security (`BiometricAndQRScanner.tsx`)**:
  - **Zero Raw Biometric Storage**: The device matches fingerprints on-chip and transmits a cryptographically signed token (e.g. `SIG-FP-AES256-VALID-7729`). No fingerprint images are stored in PostgreSQL.
  - Role-Based Access Control (RBAC) in `auth-service.ts`: Guards routes across Student, Driver, Conductor, and Admin roles.

### B. Top Viva Q&A for Harsh Kumar
1. **Q: Why doesn't CampusFleet store raw fingerprint images in the database?**  
   *Ans:* Storing raw biometric images violates data privacy laws and exposes the institution to severe security breach liabilities. CampusFleet uses on-chip verification where the physical biometric device authenticates locally and transmits a cryptographically signed event token.
2. **Q: How does the 15-second driver GPS broadcast work?**  
   *Ans:* The driver console runs an active timer interval that pushes GPS telemetry (latitude, longitude, speed) to Supabase's `telemetry_logs` table every 15 seconds, broadcasting real-time updates to student radars and the admin HUD.
3. **Q: What fallback exists if a student's phone battery is dead?**  
   *Ans:* The conductor uses the 'Manual Override' feature in the manifest desk. The conductor selects the student, chooses an override reason (e.g., 'Device Battery Depleted'), and marks them `BOARDED` with an auditable timestamp and conductor ID.
4. **Q: How does the QR scanner prevent counterfeit or reused screenshot tickets?**  
   *Ans:* The QR token contains `bookingId`, `studentId`, `tripId`, and an encrypted signature. When scanned, the conductor console decodes the JSON payload, checks it against the active trip manifest, and rejects expired or duplicate tickets.
5. **Q: How does Role-Based Access Control (RBAC) protect the application?**  
   *Ans:* Next.js middleware and `auth-service.ts` inspect the user's JWT session role claim. Unauthorized attempts to access `/admin` or `/staff` routes are immediately blocked and redirected to the login gateway.

---

## 6. Deep-Dive Study Guide — Kartik Bisht (Simplified & High-Scoring Role)

> ✨ **Strategy Note for Kartik Bisht**:  
> Kartik has a **clean, visual, and highly defensible role** focused on UI presentation, theme switching, fleet maintenance issue tracking, compliance reports export, and Vitest test suite execution. This guarantees high viva marks with clear, straightforward, and easy-to-explain concepts!

### A. Technical Responsibilities & Module Ownership
- **Digital Boarding Pass UI (`/portal/pass` & `BoardingPassCard.tsx`)**:
  - Airline-style boarding pass card displaying student photo, route badge, boarding stop name, and assigned physical seat (e.g. `12A`).
  - **Live Moving Clock Canvas**: Renders a live ticking digital clock on the ticket canvas. Conductors can instantly spot static screenshot fraud because fake screenshots lack the moving seconds clock!
- **Complete Light / Dark Theme Engine (`ThemeProvider.tsx`)**:
  - System preference detection via `window.matchMedia('(prefers-color-scheme: dark)')`.
  - Light, Dark, and System modes with instant persistence in `localStorage` (`campusfleet_theme`).
  - Accessible WCAG contrast ratios across cards, maps, charts, and digital passes.
- **Fleet Maintenance & Vehicle Issue Desk (`/admin/maintenance`)**:
  - Defect logging desk for drivers and mechanics (e.g., Brake Wear, AC Failure, Tire Replacement).
  - Tracks tickets through lifecycle statuses: `OPEN` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED`.
  - Automatically flags bus status as `MAINTENANCE` when a critical defect is recorded.
- **Analytics Export & Compliance Reports (`/admin/reports`)**:
  - 1-Click CSV Report Generator: Generates downloadable CSV files for daily attendance rosters, route revenue audits, and fleet trip histories.
  - Visualizes monthly transit demand, seat occupancy trends, and fleet fuel efficiency charts using Recharts.
- **Quality Assurance & Vitest Testing Suites (`vitest.config.ts`, `src/test/`)**:
  - Authored and verified all 36 automated unit tests covering seat layout generation, duplicate booking prevention, waitlist queue allocation, and FIFO auto-promotion.
  - Performed responsive cross-device verification on Mobile, Tablet, and Desktop viewports.

### B. Top Viva Q&A for Kartik Bisht (Easy & Direct Answers)
1. **Q: What is displayed on the Digital Boarding Pass and how does it prevent fraud?**  
   *Ans:* The boarding pass displays the student's name, bus number, assigned physical seat (e.g. 12A), boarding stop, and a verified QR code. It prevents fraud using a live animated clock; if a student tries to use a static screenshot, the conductor can immediately tell it's fake because the seconds clock is not moving!
2. **Q: How does the Fleet Maintenance Desk work?**  
   *Ans:* When a driver reports a vehicle issue (such as Brake Wear or AC failure), the maintenance desk logs an `OPEN` ticket and sets the bus status to `MAINTENANCE`. Once mechanics complete the repair, the ticket is marked `RESOLVED` and the bus returns to `ACTIVE` service.
3. **Q: How are compliance reports exported to CSV format?**  
   *Ans:* The system extracts student attendance and trip records from the database, formats the data into comma-separated text (CSV), creates a downloadable Blob object in the browser, and triggers an instant file download for administrators.
4. **Q: How did you test the project for reliability?**  
   *Ans:* We used Vitest to create 36 automated unit tests covering seat allocation, waitlist queueing, and FIFO auto-promotion. All 36 tests pass with 100% success rate, ensuring zero runtime bugs or crashes.
5. **Q: How does the Light/Dark theme engine work?**  
   *Ans:* `ThemeProvider` detects system color preference and allows users to toggle between Light and Dark modes. It applies the `.dark` CSS class to the HTML root and persists the user's preference in `localStorage` under `campusfleet_theme`.

---

## 7. Step-by-Step Viva Live Demonstration Script

Follow this exact 8-step sequence during your project evaluation to demonstrate the full platform to the external examiner:

```
Step 1: Universal Gateway (/)
└── Open https://campusfleet.vercel.app
    └── Highlight modern transit hero, technology badges, and 4 role access portals.

Step 2: Student & Parent Live Radar (/portal)
└── Navigate to Student Portal
    └── Point out "Today's Bus (BUS-01)", dynamic ETA ("Arrives in 7 mins"),
        linear Metro station progress bar, and parent multi-child switcher.

Step 3: Anti-Fraud Digital Boarding Pass (/portal/pass)
└── Click "View Digital Pass"
    └── Show assigned seat (12A), verified QR token, and live moving clock canvas.

Step 4: Shift Booking & FIFO Auto-Promotion Demo (/portal/booking)
└── Show capacity gauge (38/40 Seats Filled)
    ├── 1. Book a seat to fill the bus (40/40 CONFIRMED).
    ├── 2. Book another seat to join the waitlist (Assigned "WL-01").
    └── 3. Cancel the confirmed seat -> WATCH SYSTEM INSTANTLY AUTO-PROMOTE WL-01 TO CONFIRMED!

Step 5: Emergency SOS Dispatch
└── Click red "SOS" button in top bar
    └── Show live GPS coordinates capture and instant high-priority alert dispatch.

Step 6: Driver In-Cabin Console (/staff/driver)
└── Open Driver Console
    ├── 1. Click "Start Trip" & toggle 15s GPS telematics broadcast.
    └── 2. Report a Traffic Delay (+10 mins) -> Watch student ETA update dynamically.

Step 7: Conductor Manifest Desk (/staff/conductor)
└── Open Conductor Console
    ├── 1. Review finalized passenger manifest with assigned seats.
    └── 2. Demonstrate camera QR scanner and Biometric signed token validation.

Step 8: Admin Operations Control HUD (/admin)
└── Open Admin Dashboard
    ├── 1. Review fleet KPIs, route demand charts, and interactive Leaflet route builder.
    ├── 2. Inspect Fleet Maintenance Issue Desk.
    └── 3. Click "Export CSV Compliance Report" to download live attendance records.
```

---

## 8. Examiner Architectural FAQ & Viva Defense

### Q1. Why use Supabase PostgreSQL instead of Firebase / MongoDB?
*Ans:* PostgreSQL provides strict ACID relational guarantees, foreign key integrity, and Row-Level Security (RLS) critical for seat bookings and subscription billing. NoSQL databases (like Firebase or MongoDB) lack atomic multi-table consistency needed for zero-overbooking guarantees during high-concurrency booking rushes.

### Q2. What happens if a student has no internet connectivity at the bus stop?
*Ans:* The digital boarding pass is cached in client-side storage. In addition, the conductor's mobile console downloads the complete trip manifest before departing the terminal, allowing fully offline QR verification with local queue synchronization once connectivity resumes.

### Q3. What is the difference between RAC in Indian Railways and CampusFleet's No-Standing Policy?
*Ans:* In railways, RAC (Reservation Against Cancellation) allows two passengers to share a single berth. In institutional college buses, this is illegal and unsafe. CampusFleet enforces strictly 1 physical seat per confirmed passenger; unconfirmed students are held in a sequential waitlist queue.

### Q4. How is the project hosted and deployed?
*Ans:* The frontend is deployed on Vercel's Edge Serverless Network with automated continuous integration (CI/CD) from GitHub. The backend database is hosted on Supabase managed PostgreSQL with connection pooling and point-in-time recovery.

---

## 9. Generated Document & PDF Assets

The following project study documents are available in the workspace:

1. **📄 Word Document (`.docx`)**:
   - File: `CampusFleet_4_Member_Detailed_Study_Material.docx`
   - Content: Complete formatted study guide with full tables, callout boxes, and technical Q&A.
2. **📑 PDF Document (`.pdf`)**:
   - File: `CampusFleet_4_Member_Study_Material_and_Roles.pdf`
   - Content: Executive 4-page A4 PDF report with custom typography, role cards, Kartik's simplified role highlight, and viva cheat-sheets.
3. **🌐 Web / HTML Study Sheet**:
   - File: `docs/study_guide.html`
   - Content: Standalone printable HTML report.
4. **📖 Markdown Repository Reference**:
   - File: `docs/STUDY_MATERIAL_AND_PROJECT_DIVISION.md`
   - Content: Full GitHub Markdown documentation.

---

### 👥 Team Credits
- **Aditya Pandey (Team Leader)** — Roll No: `2361030` (`adityapandey.230111075@gehu.ac.in`)
- **Gaurang Joshi** — Roll No: `2361165` (`gaurangjoshi.230112011@gehu.ac.in`)
- **Harsh Kumar** — Roll No: `2361181` (`harshkumar.230111394@gehu.ac.in`)
- **Kartik Bisht** — Roll No: `2361256` (`kartikbisht.230111256@gehu.ac.in`)
