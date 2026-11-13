# Attendance / boarding policy

The transport office chooses which boarding methods are on. The setting is stored in
`transport_settings.validation_locks` (`{ faceId, dynamicQr, rfid, staticQr }`), edited in
`/transport-admin/transit` and served by `GET /api/fleet/settings`.

- `policy.tsx`
  - `resolveValidationLocks(mode, locks)`: normalises old single-mode values into the four flags.
  - `getModalityPageRules(mode, locks)`: what each screen should show (labels, which scanners are active).
  - `useAttendancePolicy()`: React hook. Known issue: reads localStorage first and defaults to all-on if the fetch fails.
  - `PolicyStandbyScreen`: shown when a page's method is switched off.
- `strategies/*`: server-side validation per method (`DynamicQrStrategy` checks the HMAC pass from
  `src/lib/security/student-pass.ts`; `StaticQrStrategy` checks bus + geofence; `RfidStrategy`; `FaceIdStrategy` is legacy v1).
- `AttendanceEngine.ts`: runs a strategy and writes the attendance record; `persist.ts`: `persistGateAttendance`.

## Methods and their code paths
| Method | Student side | Crew / device side | API |
|---|---|---|---|
| Dynamic QR pass | `/portal/qr/show` (fetches signed pass) | `QRPassScanner` | `/api/students/pass-token`, `/api/boarding/scan` |
| Bus / seat QR | `/portal/qr/scan` (`StudentSelfScanner`) | `/conductor/bus-qr` (rolling QR) | `/api/boarding/rolling-token`, `/api/students/board-self-service` |
| Face ID | onboarding `FaceIdEnrollmentModal` | `DriverGateCameraConsole` | `/api/biometrics/enroll-v2`, `/api/gate/captures` |
| RFID | — | ESP32 reader | `/api/telematics/rfid` |

## Rules
- Every boarding API must refuse a method whose lock is off (verify when touching a route).
- UI text and buttons must be built from the locks; never hard-code one method's instructions.
- The conductor's manual scan stays available as the fallback.
