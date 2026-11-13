"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, QrCode, ScanFace, ScanLine, UserCheck } from "lucide-react";
import { useAttendancePolicy } from "@/lib/attendance";
import { Card } from "@/components/ui";

/**
 * Boarding hub. One card per boarding method the transport office has switched on
 * (transport_settings.validation_locks); nothing is shown for a method that is off.
 */
export default function QRConnectPage() {
  const { locks } = useAttendancePolicy();

  const items: { key: string; icon: React.ReactNode; title: string; text: string; href?: string; action?: string }[] = [];
  if (locks.faceId) {
    items.push({
      key: "face",
      icon: <ScanFace className="w-6 h-6 text-emerald-600" />,
      title: "Face ID at the door",
      text: "Look at the camera above the door as you get on. Nothing to show or scan.",
    });
  }
  if (locks.staticQr) {
    items.push({
      key: "scan",
      icon: <ScanLine className="w-6 h-6 text-green-600" />,
      title: "Scan the bus QR",
      text: "Scan the QR on the bus door or your seat with your phone.",
      href: "/portal/qr/scan",
      action: "Open scanner",
    });
  }
  if (locks.dynamicQr) {
    items.push({
      key: "pass",
      icon: <QrCode className="w-6 h-6 text-blue-600" />,
      title: "Show your QR pass",
      text: "Open your pass and let the conductor scan your screen.",
      href: "/portal/qr/show",
      action: "Show pass",
    });
  }
  if (locks.rfid) {
    items.push({
      key: "rfid",
      icon: <CreditCard className="w-6 h-6 text-indigo-600" />,
      title: "Tap your RFID card",
      text: "Tap your campus card on the reader at the bus door.",
    });
  }

  return (
    <div className="w-full min-h-[calc(100dvh-140px)] px-4 py-6 pb-24 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-3">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">How to board</h1>
          <p className="text-xs text-gray-500 mt-1">
            {items.length > 1 ? "Any of these works. Use the one that is easiest at your bus." : "This is how your bus checks you in."}
          </p>
        </div>

        {items.map((it) => (
          <Card key={it.key} className="flex items-start gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gray-50 dark:bg-zinc-900 flex items-center justify-center">{it.icon}</div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black text-gray-900 dark:text-white">{it.title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{it.text}</p>
              {it.href && (
                <Link
                  href={it.href}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                >
                  {it.action} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </Card>
        ))}

        <Card className="flex items-start gap-3">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-gray-50 dark:bg-zinc-900 flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-gray-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-gray-900 dark:text-white">{items.length ? "If that does not work" : "Conductor check-in"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">The conductor can check you in from the passenger list using your pass photo.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
