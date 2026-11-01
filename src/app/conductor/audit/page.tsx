"use client";

import React from "react";
import { useConductorContext } from "@/components/conductor/ConductorContext";
import { AuditTab } from "@/components/conductor/tabs/AuditTab";

export default function AuditPage() {
  const { attendanceRecords, students, bus, route, refreshLiveState, isSyncing } = useConductorContext();

  return (
    <AuditTab
      attendanceRecords={attendanceRecords}
      students={students}
      bus={bus}
      route={route}
      onRefresh={refreshLiveState}
      isSyncing={isSyncing}
    />
  );
}
