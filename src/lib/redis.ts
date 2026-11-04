import { Redis } from "@upstash/redis";

// Check for Vercel KV / Upstash Redis environment variables
const redisUrl =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_URL;

const redisToken =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_TOKEN;

/**
 * Singleton Redis client instance (Upstash / Vercel KV compatible).
 * Gracefully returns null when credentials are not configured yet,
 * enabling zero-crash local development and seamless cloud activation.
 */
export const redis: Redis | null =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  USER_ROLE: 300, // 5 minutes
  USER_SESSION: 600, // 10 minutes
  OTP: 300, // 5 minutes
  FLEET_STATS: 60, // 1 minute
  HOT_DATA_ROUTES: 3600, // 1 hour (rarely changes)
  HOT_DATA_STOPS: 3600, // 1 hour
  HOT_DATA_SHIFTS: 3600, // 1 hour
  HOT_DATA_TRIPS: 300, // 5 minutes (changes often with active trips)
  MASTER_DATA_PERMANENT: 3600, // 1 hour (auto-heals even if webhooks drop)
  CHAT_MESSAGES: 60, // 1 minute sliding cache for conversation messages
  CHAT_CONVERSATIONS: 30, // 30 seconds cache for user conversation lists
  STUDENT_PROFILE: 1800, // 30 minutes cache for student profile (write-through / cache-aside)
} as const;

/**
 * Get a cached JSON or primitive value from Redis.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await redis.get<T>(key);
    return data ?? null;
  } catch (err) {
    console.warn(`[Redis] cacheGet error for key "${key}":`, err);
    return null;
  }
}

/**
 * Adds randomized jitter (default 0% to 10%) to a TTL.
 * Prevents Cache Stampede / Thundering Herd by spreading expiration across time.
 */
export function withJitter(ttlSeconds: number, jitterPercent = 0.1): number {
  if (ttlSeconds <= 0) return ttlSeconds;
  const maxJitter = Math.floor(ttlSeconds * jitterPercent);
  const jitter = Math.floor(Math.random() * (maxJitter + 1));
  return ttlSeconds + jitter;
}

/**
 * Set a value in Redis with optional TTL and automatic jitter.
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
  addJitter = true
): Promise<boolean> {
  if (!redis) return false;
  try {
    if (ttlSeconds && ttlSeconds > 0) {
      const finalTtl = addJitter ? withJitter(ttlSeconds) : ttlSeconds;
      await redis.set(key, value, { ex: finalTtl });
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (err) {
    console.warn(`[Redis] cacheSet error for key "${key}":`, err);
    return false;
  }
}

export interface CacheFetchOptions<T> {
  key: string;
  ttl: number;
  fetchFn: () => Promise<T>;
  staleIfError?: boolean;
  allowEmpty?: boolean;
  negativeTtl?: number; // Short TTL (in seconds) for empty or null results
}

/**
 * Production-Grade Cache-Aside Pipeline:
 * - Checks Redis cache first (sub-2ms hit)
 * - Fetches from primary source on miss
 * - Automatically applies Anti-Stampede TTL Jitter
 * - Applies Negative Cache Guard to avoid DB hammering
 * - Stale-If-Error: Falls back to existing cache if the primary DB fetch errors
 */
export async function getOrFetchWithCache<T>(options: CacheFetchOptions<T>): Promise<T> {
  const { key, ttl, fetchFn, staleIfError = true, allowEmpty = false, negativeTtl = 30 } = options;

  let cached: T | null = null;
  try {
    cached = await cacheGet<T>(key);
    if (cached !== null) {
      if (Array.isArray(cached)) {
        if (cached.length > 0 || allowEmpty) {
          return cached;
        }
      } else {
        return cached;
      }
    }
  } catch (err) {
    console.warn(`[Cache] Error reading key "${key}", falling back to fetchFn:`, err);
  }

  try {
    const freshData = await fetchFn();
    const isArray = Array.isArray(freshData);
    const hasData = freshData !== null && freshData !== undefined && (!isArray || (freshData as any).length > 0);

    if (hasData || allowEmpty) {
      void cacheSet(key, freshData, ttl, true);
    } else if (negativeTtl > 0) {
      // Negative caching guard: short TTL to prevent repeated DB hammering for empty results
      void cacheSet(key, freshData, negativeTtl, false);
    }

    return freshData;
  } catch (fetchErr) {
    console.error(`[Cache] Primary fetch failed for key "${key}":`, fetchErr);

    // Stale-If-Error: If primary database fails, serve stale cached data to prevent outage
    if (staleIfError && cached !== null) {
      console.warn(`[Cache] Stale-If-Error activated for "${key}". Serving stale data.`);
      return cached;
    }

    throw fetchErr;
  }
}

/**
 * Delete one or more keys from Redis.
 */
export async function cacheDel(key: string): Promise<boolean> {
  if (!redis) return false;
  try {
    await redis.del(key);
    return true;
  } catch (err) {
    console.warn(`[Redis] cacheDel error for key "${key}":`, err);
    return false;
  }
}

// ── User Role & Session Caching Helpers ─────────────────────────────────────

export function getUserRoleKey(userId: string): string {
  return `user:role:${userId}`;
}

export async function getCachedUserRole(userId: string): Promise<string | null> {
  return cacheGet<string>(getUserRoleKey(userId));
}

export async function setCachedUserRole(userId: string, role: string): Promise<void> {
  await cacheSet(getUserRoleKey(userId), role, CACHE_TTL.USER_ROLE);
}

export async function invalidateCachedUserRole(userId: string): Promise<void> {
  await cacheDel(getUserRoleKey(userId));
}

// ── Student Profile Caching Helpers (Write-Through & Cache-Aside) ───────────

export function getStudentProfileKey(identifier: string): string {
  return `student:profile:${identifier}`;
}

export async function getCachedStudentProfile<T = any>(identifier: string): Promise<T | null> {
  return cacheGet<T>(getStudentProfileKey(identifier));
}

export async function setCachedStudentProfile(
  identifier: string,
  profile: any,
  ttl: number = CACHE_TTL.STUDENT_PROFILE
): Promise<void> {
  await cacheSet(getStudentProfileKey(identifier), profile, ttl);
}

export async function invalidateCachedStudentProfile(
  identifiers: (string | null | undefined)[]
): Promise<void> {
  const validIds = identifiers.filter((id): id is string => Boolean(id && id.trim()));
  await Promise.allSettled(
    validIds.flatMap((id) => [
      cacheDel(`student:profile:${id}`),
      cacheDel(`student:profile:${id.toLowerCase()}`),
      cacheDel(`student:${id}`),
      cacheDel(`student:subscription:${id}`),
      cacheDel(`student:subscription:${id.toLowerCase()}`),
    ])
  );
}

/**
 * Fast-write active subscription across all student/user/email identifier aliases in Redis,
 * and busts any stale cached profiles so subsequent requests immediately pass access gates.
 */
export async function markStudentSubscriptionActiveInCache({
  studentId,
  userId,
  email,
}: {
  studentId?: string | null;
  userId?: string | null;
  email?: string | null;
}): Promise<void> {
  const ids = new Set<string>();
  if (studentId) {
    ids.add(studentId);
    ids.add(studentId.replace(/^stud-/, ""));
  }
  if (userId) {
    ids.add(userId);
    ids.add(`stud-${userId}`);
  }
  if (email) {
    ids.add(email);
    ids.add(email.toLowerCase());
  }

  const validIds = Array.from(ids).filter(Boolean);

  await Promise.allSettled([
    // Fast-write subscription: true for all alias keys (1 day TTL)
    ...validIds.map((id) => cacheSet(`student:subscription:${id}`, true, 86400)),
    // Invalidate stale profile data so the DB is re-read with fresh payment status
    ...validIds.flatMap((id) => [
      cacheDel(`student:profile:${id}`),
      cacheDel(`student:${id}`),
    ]),
  ]);
}
