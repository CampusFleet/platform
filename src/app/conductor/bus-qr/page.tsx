"use client";

import React from "react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { BusQrTab } from "@/components/conductor/tabs/BusQrTab";

export default function BusQrPage() {
  const { activeTrip, bus, route } = useConductorContext();

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
