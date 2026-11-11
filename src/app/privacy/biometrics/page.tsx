import type { Metadata } from "next";
import { CONSENT_POINTS, CONSENT_PURPOSE, CONSENT_VERSION } from "@/lib/biometrics-consent";
import { EVIDENCE_RETENTION_DAYS, INACTIVE_STUDENT_DAYS } from "@/lib/biometrics-lifecycle";

export const metadata: Metadata = {
  title: "Face ID privacy notice | Campus Fleet",
  description: "How Campus Fleet uses face recognition for bus boarding, under the Digital Personal Data Protection Act, 2023.",
};

export default function BiometricPrivacyNotice() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10 text-slate-800 dark:text-slate-200 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-black">Face ID for university buses — privacy notice</h1>
        <p className="text-sm text-slate-500">
          Notice version {CONSENT_VERSION} · Purpose code {CONSENT_PURPOSE} · Data Fiduciary: Graphic Era Hill University (transport
          department), operated through Campus Fleet.
        </p>
      </header>

      <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
        {CONSENT_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="text-lg font-bold">Retention</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Door-camera face crops: deleted automatically after {EVIDENCE_RETENTION_DAYS} days.</li>
          <li>Face of an unregistered person: kept at most 24 hours, only to recognise them leaving the bus.</li>
          <li>
            Your face template: until you withdraw consent, or automatically after {INACTIVE_STUDENT_DAYS} days with no bus activity
            (treated as having left or graduated).
          </li>
          <li>Your commuter pass photo is your ID photo for conductors; it is stored privately and is not used for matching.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="text-lg font-bold">Your choices</h2>
        <p>
          Face ID is optional. You can always board using your digital pass, RFID card or a conductor scan. To withdraw consent and
          delete your face data, open <strong>Settings → Face ID &amp; privacy</strong> in the student portal. Deletion takes effect
          immediately: you will no longer be recognised by bus cameras.
        </p>
        <p>
          For questions or grievances, contact the university transport office. Every access to your biometric data by staff is
          recorded and can be reviewed on request.
        </p>
      </section>

      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="text-lg font-bold">Security</h2>
        <p>
          Templates are created only on university-controlled servers in India from photos you or the bus cameras provide; the app
          never accepts a template computed on a phone. Bus devices authenticate with individual keys. Face data is not shared with
          third parties and is not used for any purpose other than bus attendance and passenger safety.
        </p>
      </section>
    </main>
  );
}
