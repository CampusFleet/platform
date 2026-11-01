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
    // 1. Check Redis Cache for instant resolution
    const subCacheKey = `student:subscription:${session.userId}`;
    const photoCacheKey = `student:photo:${session.userId}`;

    const cachedProfile = await getCachedStudentProfile(session.userId);
    let cacheHit = false;

    if (cachedProfile) {
      isSubscribed = Boolean(cachedProfile.hasActiveSubscription);
      photoUrl = cachedProfile.photoUrl || null;
      cacheHit = true;
    } else {
      const cachedSub = await cacheGet(subCacheKey);
      const cachedPhoto = await cacheGet(photoCacheKey);

      if (cachedSub !== null) {
        isSubscribed = Boolean(cachedSub);
        photoUrl = cachedPhoto as string | null;
        cacheHit = true;
      }
    }

    if (!cacheHit) {
      // 2. Fallback to Supabase if not in Redis
      const { data } = await supabaseAdmin.from("students_full")
          .select("has_active_subscription, payment_status, photo_url")
          .or(`user_id.eq.${session.userId},email.eq.${session.email}`)
          .limit(1)
          .maybeSingle();
          
      if (data) {
          isSubscribed = Boolean(data.has_active_subscription) || data.payment_status === "APPROVED" || data.payment_status === "COMPLETED";
          photoUrl = data.photo_url || null;
          // 3. Cache it in Redis for 5 minutes
          await cacheSet(subCacheKey, isSubscribed, 300);
          await cacheSet(photoCacheKey, photoUrl, 300);
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
