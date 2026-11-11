# Face ID boarding

Face ID boarding is split across three CampusFleet repos:

| Repo | Role |
|---|---|
| **platform** (this repo) | Enrollment and consent, gate APIs, matching, boarding decisions, incidents, retention |
| [CampusFleet/face-service](https://github.com/CampusFleet/face-service) | Turns a face image into a template with quality and anti-spoofing checks. Model licence register: `MODELS.md` |
| [CampusFleet/face-gate-agent](https://github.com/CampusFleet/face-gate-agent) | Raspberry Pi agent in each bus. Crops faces at the doors and uploads them here |

## Where things live in this repo

| Area | Files |
|---|---|
| Face service client | `src/lib/face/client.ts` |
| Device signing and auth | `src/lib/gate/device-auth.ts`, `src/middleware.ts` |
| Capture ingest and processing | `src/lib/gate/ingest.ts`, `processor.ts`, `decision.ts`, `evidence.ts` |
| Consent, erasure, retention | `src/lib/biometrics-consent.ts`, `src/lib/biometrics-lifecycle.ts`, `/api/cron/biometric-retention` |
| Pilot metrics | `src/lib/biometrics-metrics.ts`, `/transport-manager/face-metrics` |
| Schema | `supabase/migrations/20261111_face_id_v2_schema.sql` |
| Bench simulator | `scripts/gate-sim.mjs` |

## Contracts shared between repos

Change both sides together:

- **Face service request signing**: `src/lib/face/client.ts` ↔ `face-service/app/auth.py`.
- **Device request signing**: `src/lib/gate/device-auth.ts` ↔ `face-gate-agent/cf_agent/signing.py`. Both test suites check the same fixed vector.
- **Model version**: templates are stored and matched under the face service's `MODEL_VERSION`, and the match threshold is looked up per version in `face_match_config`. A new model version needs a calibrated `face_match_config` row and every student to re-enroll.

## Required environment variables (Vercel)

`FACE_SERVICE_URL`, `FACE_SERVICE_KEY`, `GATE_DEVICE_MASTER_KEY`, `CRON_SECRET`.
