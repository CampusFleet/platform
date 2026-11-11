/**
 * Current biometric consent notice. Bump CONSENT_VERSION whenever the text below changes;
 * students then re-consent on next enrollment. Shown in the enrollment modal and at /privacy/biometrics.
 */
export const CONSENT_VERSION = "FACEID-2026-11-v1";
export const CONSENT_PURPOSE = "BUS_BOARDING_ATTENDANCE";

export const CONSENT_SUMMARY =
  "I agree that Campus Fleet may create a face template from my photos and use it only to record my boarding and alighting on university buses and to detect unauthorised passengers. I can withdraw this consent and delete my face data at any time in Settings. Boarding with my pass, RFID card or conductor scan remains available if I do not consent.";

export const CONSENT_POINTS = [
  "What we collect: 3–5 photos taken during enrollment, turned into a numeric face template on our server; door-camera face crops when you board or leave a bus.",
  "Why: marking bus attendance automatically and alerting staff to people who are not registered for the bus. Not for classroom attendance, marketing or any other purpose.",
  "Where it is stored: university-controlled database and private storage in India. Raw door crops are deleted after 30 days. Your template is deleted when you withdraw consent or leave the university.",
  "Who can see it: only transport security staff, when reviewing an incident. Every view is logged.",
  "Your rights (DPDP Act 2023): withdraw consent, delete your face data, and ask the Data Protection contact any question. Withdrawing never blocks you from using the bus.",
];
