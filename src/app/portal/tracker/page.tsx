import React from "react";
import { Metadata } from "next";
import LiveTrackerView from "@/components/portal/LiveTrackerView";

export const metadata: Metadata = {
  title: "Live GPS Bus Radar | CampusFleet",
  description: "Real-time fleet tracking, geospatial bus telemetry and live progression radar for students",
};

export default function LiveTrackerPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
      <LiveTrackerView isEmbedded={false} />
    </div>
  );
}
