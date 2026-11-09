"use client";

import React from "react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { BusQrTab } from "@/components/conductor/tabs/BusQrTab";
import { useAttendancePolicy, PolicyStandbyScreen } from "@/lib/attendance";

export default function BusQrPage() {
  const { activeTrip, bus, route } = useConductorContext();
  const { mode, rules } = useAttendancePolicy();

  // Policy Guardrail: If door QR posters are inactive under current policy, show standby screen
  if (!rules.isConductorBusQrActive) {
    return (
      <PolicyStandbyScreen
        pageTitle="Bus Door QR Generator"
        pageFeature="Physical bus door QR poster generation and rolling token display"
        requiredModeDescription="Generating physical door QR codes is only required when the institutional policy is set to Physical Bus QR or Multi-Modal."
        activeMode={mode}
        returnHref="/conductor/manifest"
        returnLabel="Go to Passenger Manifest"
      />
    );
  }

  if (!activeTrip) {
    return (
      <div className="p-8 text-center text-zinc-500 font-mono">
        No active trip selected. Please select a bus from the top bar.
      </div>
    );
  }

  return (
    <BusQrTab activeTrip={activeTrip} bus={bus} route={route} />
  );
}
