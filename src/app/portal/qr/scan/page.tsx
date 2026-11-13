"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StudentSelfScanner } from "@/components/scanner/StudentSelfScanner";
import { useAttendancePolicy, PolicyStandbyScreen } from "@/lib/attendance";

export default function ScanPage() {
  const { rules } = useAttendancePolicy();

  // Policy Guardrail: If door QR self-scanning is inactive under current policy, show standby screen
  if (!rules.isStudentDoorScannerActive) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-black p-4 flex flex-col justify-center items-center">
        <PolicyStandbyScreen
          pageTitle="Bus Door QR Scanner"
          pageFeature="Scanning physical bus door QR codes with your phone camera"
          requiredModeDescription="Use one of the boarding methods below."
          returnHref="/portal"
          returnLabel="Go to My Commute"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in zoom-in-95">
      <Link 
        href="/portal/qr"
        className="absolute top-6 left-6 z-[110] p-3.5 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-xl border border-white/10 shadow-xl transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-6 h-6" />
      </Link>
      <StudentSelfScanner fullScreenMode={true} onSuccess={() => { window.location.href = '/portal'; }} />
    </div>
  );
}
