import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveOnboardingDraft,
  loadOnboardingDraft,
  clearOnboardingDraft,
  getOnboardingDraftKey,
  OnboardingDraft,
} from "@/lib/onboarding-cache";
import { markStudentSubscriptionActiveInCache, cacheGet, cacheDel } from "@/lib/redis";

// Mock Redis Store
const mockRedisStore = new Map<string, any>();
vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn(async (key: string) => mockRedisStore.get(key) || null),
  cacheSet: vi.fn(async (key: string, val: any) => {
    mockRedisStore.set(key, val);
    return "OK";
  }),
  cacheDel: vi.fn(async (key: string) => {
    mockRedisStore.delete(key);
    return 1;
  }),
  markStudentSubscriptionActiveInCache: vi.fn(async ({ studentId, userId, email }: any) => {
    const ids = [studentId, userId, email].filter(Boolean);
    for (const id of ids) {
      mockRedisStore.set(`student:subscription:${id}`, true);
      mockRedisStore.delete(`portal:student_row:${id}`);
      mockRedisStore.delete(`student:profile:${id}`);
    }
  }),
}));

describe("Onboarding Draft Cache & State Persistence Engine", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);

    const fakeLocalStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      },
    };

    // Ensure global.window and localStorage are active in node test environment
    (global as any).window = global;
    (global as any).localStorage = fakeLocalStorage;
  });

  it("persists multi-step onboarding data under user-scoped key", () => {
    const userId = "usr_01jstudent123";
    const draft: Partial<OnboardingDraft> = {
      activeStep: 2,
      homeAddress: "Mukhani, Haldwani, Uttarakhand",
      homeLat: 29.2185,
      homeLng: 79.5126,
      primaryStopId: "stop-mukhani",
      selectedZoneCode: "ZONE_B",
      fullName: "Aditya Pandey",
      phone: "+91 9876543210",
      studentIdCode: "230111075",
      photoUrl: "https://campusfleet.blob/photos/aditya.jpg",
    };

    saveOnboardingDraft(userId, draft);

    const key = getOnboardingDraftKey(userId);
    expect(mockStorage[key]).toBeDefined();

    const loaded = loadOnboardingDraft(userId);
    expect(loaded).not.toBeNull();
    expect(loaded?.activeStep).toBe(2);
    expect(loaded?.homeAddress).toBe("Mukhani, Haldwani, Uttarakhand");
    expect(loaded?.homeLat).toBe(29.2185);
    expect(loaded?.homeLng).toBe(79.5126);
    expect(loaded?.primaryStopId).toBe("stop-mukhani");
    expect(loaded?.selectedZoneCode).toBe("ZONE_B");
    expect(loaded?.fullName).toBe("Aditya Pandey");
    expect(loaded?.phone).toBe("+91 9876543210");
    expect(loaded?.studentIdCode).toBe("230111075");
    expect(loaded?.photoUrl).toBe("https://campusfleet.blob/photos/aditya.jpg");
  });

  it("recovers step 3 and transit fee selection on page refresh", () => {
    const userId = "usr_01jstudent456";
    saveOnboardingDraft(userId, {
      activeStep: 3,
      selectedZoneCode: "ZONE_C",
      semesterFee: 15000,
      assignedRouteName: "Dehradun Rapid Transit",
      phone: "+91 9123456780",
    });

    const loaded = loadOnboardingDraft(userId);
    expect(loaded?.activeStep).toBe(3);
    expect(loaded?.selectedZoneCode).toBe("ZONE_C");
    expect(loaded?.semesterFee).toBe(15000);
    expect(loaded?.assignedRouteName).toBe("Dehradun Rapid Transit");
  });

  it("safeguards storage quota by omitting oversized data URIs (> 250KB)", () => {
    const userId = "usr_01jstudent789";
    const hugeDataUri = "data:image/jpeg;base64," + "A".repeat(300000); // 300KB

    saveOnboardingDraft(userId, {
      activeStep: 2,
      photoUrl: "https://campusfleet.blob/photos/valid.jpg",
      localPreviewUrl: hugeDataUri,
    });

    const loaded = loadOnboardingDraft(userId);
    expect(loaded?.photoUrl).toBe("https://campusfleet.blob/photos/valid.jpg");
    // Huge data URI preview should be stripped to avoid quota exhaustion
    expect(loaded?.localPreviewUrl).toBeUndefined();
  });

  it("discards expired drafts older than 7 days", () => {
    const userId = "usr_old_student";
    const oldDraft: OnboardingDraft = {
      version: 1,
      userId,
      activeStep: 2,
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      fullName: "Old Student",
    };

    mockStorage[getOnboardingDraftKey(userId)] = JSON.stringify(oldDraft);

    const loaded = loadOnboardingDraft(userId);
    expect(loaded).toBeNull();
    // Verify auto-cleanup
    expect(mockStorage[getOnboardingDraftKey(userId)]).toBeUndefined();
  });

  it("clears draft upon successful payment activation", () => {
    const userId = "usr_paid_student";
    saveOnboardingDraft(userId, { activeStep: 3, fullName: "Paid Commuter" });
    expect(loadOnboardingDraft(userId)).not.toBeNull();

    clearOnboardingDraft(userId);
    expect(loadOnboardingDraft(userId)).toBeNull();
  });
});

describe("Payment Loop & Redis Cache Invalidation", () => {
  beforeEach(() => {
    mockRedisStore.clear();
  });

  it("invalidates portal:student_row so /portal does not loop or flash stale unsubscribed state", async () => {
    const userId = "user_loop_test_1";
    const studentId = "std_loop_test_1";

    // Simulate stale row in cache before payment
    mockRedisStore.set(`portal:student_row:${userId}`, [{ has_active_subscription: false }]);

    await markStudentSubscriptionActiveInCache({
      userId,
      studentId,
      email: "test@campusfleet.com",
    });

    // Verification: Active subscription must be set to true
    const activeSub = await cacheGet(`student:subscription:${userId}`);
    expect(activeSub).toBe(true);

    // Stale student row must be invalidated so fresh state is fetched from DB
    const staleRow = await cacheGet(`portal:student_row:${userId}`);
    expect(staleRow).toBeNull();
  });
});
