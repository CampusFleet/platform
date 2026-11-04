import React from "react";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import ClientPortalLayout from "./ClientPortalLayout";
import { cacheGet, cacheSet, getCachedStudentProfile } from "@/lib/redis";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  
  let isSubscribed = false;
  let photoUrl = null;

  if (session && session.role === "student") {
    // 1. Check Redis Cache for instant positive resolution
    const subCacheKey = `student:subscription:${session.userId}`;
    const photoCacheKey = `student:photo:${session.userId}`;

    const cachedProfile = await getCachedStudentProfile(session.userId);
    let cacheHit = false;

    // Fast-path: Only treat as instant cache hit if subscription is confirmed ACTIVE
    if (cachedProfile && cachedProfile.hasActiveSubscription) {
      isSubscribed = true;
      photoUrl = cachedProfile.photoUrl || null;
      cacheHit = true;
    } else {
      const cachedSub = await cacheGet(subCacheKey);
      if (cachedSub === true) {
        isSubscribed = true;
        photoUrl = (await cacheGet(photoCacheKey)) as string | null;
        cacheHit = true;
      }
    }

    if (!cacheHit) {
      // 2. Query Supabase ground truth (students_full) to verify fresh payment or pass approval
      const { data } = await supabaseAdmin.from("students_full")
          .select("has_active_subscription, payment_status, photo_url")
          .or(`user_id.eq.${session.userId},email.ilike.${session.email}`)
          .limit(1)
          .maybeSingle();
          
      if (data) {
          isSubscribed = Boolean(data.has_active_subscription) || data.payment_status === "APPROVED" || data.payment_status === "COMPLETED";
          photoUrl = data.photo_url || null;
          // 3. Cache positive subscription for 1 hour; only cache negative for 5 seconds to prevent locking out newly paid commuters
          await cacheSet(subCacheKey, isSubscribed, isSubscribed ? 3600 : 5);
          if (photoUrl) await cacheSet(photoCacheKey, photoUrl, 3600);
      }
    }
  } else if (session && session.role !== "student") {
    isSubscribed = true; // Admins, Staff, Drivers have inherent access
  }

  return (
    <ClientPortalLayout initialIsSubscribed={isSubscribed} initialPhotoUrl={photoUrl}>
      {children}
    </ClientPortalLayout>
  );
}
