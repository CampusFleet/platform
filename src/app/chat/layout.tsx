"use client";

import React from "react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { usePathname } from "next/navigation";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col overflow-hidden">
      {/* Desktop Unified Header ONLY (Mobile uses Haveloc-style minimized navbar) */}
      <div className="hidden md:block flex-shrink-0">
        <UnifiedAppHeader
          portalTitle="Messages"
          portalSubtitle="CampusFleet Unified Chat & Commute Broadcast"
          navLinks={[]}
        />
      </div>
      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
