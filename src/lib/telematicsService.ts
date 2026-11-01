import { LiveBusLocation } from "./types";

export type TelematicsListener = (location: LiveBusLocation) => void;

/**
 * CampusFleet Dedicated Telematics Service
 * 
 * 100% Decoupled from Supabase Realtime WebSockets:
 * - 0 Supabase Realtime messages used (prevents account restriction/limits).
 * - Multi-device synchronization powered by Redis (<5ms) and MongoDB Atlas.
 * - Same-device / cross-tab synchronization powered by zero-cost HTML5 BroadcastChannel.
 */
class TelematicsService {
  private localBroadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<TelematicsListener> = new Set();
  private initialized = false;

  // Throttling timer to prevent flood
  private lastApiPostTime = 0;
  private readonly API_POST_THROTTLE_MS = 2500; // 1 sync per 2.5 seconds to Redis/Mongo

  // Polling mechanism for cross-device live tracking
  private pollingTimer: NodeJS.Timeout | null = null;
  private activePollingBusId: number | string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initChannels();
    }
  }

  private initChannels() {
    if (this.initialized) return;
    this.initialized = true;

    // Native HTML5 BroadcastChannel (Zero-cloud-cost in-memory cross-tab communication)
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        this.localBroadcastChannel = new BroadcastChannel("campusfleet_telematics");
        this.localBroadcastChannel.onmessage = (event) => {
          if (event?.data && typeof event.data.latitude === "number") {
            this.notifyListeners(event.data as LiveBusLocation);
          }
        };
      }
    } catch (e) {
      console.warn("Local BroadcastChannel not supported/available:", e);
    }
  }

  /**
   * Immediately pushes live coordinates to Redis & MongoDB without throttle.
   * Used for initial lock, manual broadcast toggle, or trip start.
   */
  public async pushLiveLocationNow(location: LiveBusLocation): Promise<boolean> {
    this.notifyListeners(location);

    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage(location);
      } catch (e) {
        console.warn("Failed to post to local BroadcastChannel:", e);
      }
    }

    if (!location.busId) return false;
    this.lastApiPostTime = Date.now();
    try {
      const res = await fetch("/api/telematics/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: location.busId,
          tripId: location.tripId,
          driverId: location.driverId,
          driverName: location.driverName,
          busNumber: location.busNumber,
          accuracy: location.accuracy,
          latitude: location.latitude,
          longitude: location.longitude,
          speedKmh: location.speedKmh,
          headingDeg: location.headingDeg,
          currentStopId: location.currentStopId,
          delayMinutes: location.delayMinutes,
          source: location.source || "driver_console",
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Broadcast high-frequency live coordinates.
   * Architecture:
   * 1. In-tab listeners: 0 latency, in-memory (<1ms).
   * 2. Local HTML5 BroadcastChannel: cross-tab in-memory, 0 cloud cost.
   * 3. Redis & MongoDB Telematics API: Persists coordinates and allows other devices to fetch.
   * 4. Zero Supabase Realtime messages (100% quota protection).
   */
  public async broadcastLiveLocation(location: LiveBusLocation): Promise<void> {
    // A. Notify local in-tab listeners immediately (<1ms)
    this.notifyListeners(location);

    // B. Send via local HTML5 BroadcastChannel (cross-tab in-memory, 0 quota cost)
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage(location);
      } catch (e) {
        console.warn("Failed to post to local BroadcastChannel:", e);
      }
    }

    const now = Date.now();

    // C. Persist to Redis (<5ms cache) & MongoDB (24h breadcrumbs)
    if (now - this.lastApiPostTime >= this.API_POST_THROTTLE_MS && location.busId) {
      this.lastApiPostTime = now;
      try {
        fetch("/api/telematics/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            busId: location.busId,
            tripId: location.tripId,
            driverId: location.driverId,
            driverName: location.driverName,
            busNumber: location.busNumber,
            accuracy: location.accuracy,
            latitude: location.latitude,
            longitude: location.longitude,
            speedKmh: location.speedKmh,
            headingDeg: location.headingDeg,
            currentStopId: location.currentStopId,
            delayMinutes: location.delayMinutes,
            source: location.source || "driver_console",
          }),
        }).catch(() => {});
      } catch {
        // Silent fail for offline scenarios
      }
    }
  }

  /**
   * Start polling MongoDB & Redis for a specific bus location.
   * Consumes directly from Redis (<5ms read latency) or MongoDB.
   */
  public startPolling(busId: number | string, intervalMs = 2500): void {
    if (this.pollingTimer && String(this.activePollingBusId) === String(busId)) return;
    this.stopPolling();
    this.activePollingBusId = busId;

    const poll = async () => {
      try {
        const res = await fetch(`/api/telematics/live?busId=${encodeURIComponent(String(busId))}`);
        if (res.ok) {
          const data = await res.json();
          const liveLoc = data.liveLocation || data.location;
          if (data.success && liveLoc && typeof liveLoc.latitude === "number" && typeof liveLoc.longitude === "number") {
            this.notifyListeners({
              busId: Number(liveLoc.busId) || Number(busId) || 0,
              tripId: liveLoc.tripId || "",
              latitude: Number(liveLoc.latitude),
              longitude: Number(liveLoc.longitude),
              speedKmh: Number(liveLoc.speedKmh || 0),
              headingDeg: Number(liveLoc.headingDeg || 0),
              lastPingAt: liveLoc.timestamp || liveLoc.lastPingAt || new Date().toISOString(),
              currentStopId: liveLoc.currentStopId,
              nextStopId: liveLoc.nextStopId,
              estimatedArrivalNextStopMins: liveLoc.estimatedArrivalNextStopMins || 2,
              delayMinutes: Number(liveLoc.delayMinutes || 0),
              busNumber: liveLoc.busNumber,
              driverId: liveLoc.driverId,
              driverName: liveLoc.driverName,
              accuracy: liveLoc.accuracy,
              isStale: liveLoc.isStale,
              ageSeconds: liveLoc.ageSeconds,
              source: liveLoc.source,
            });
          }
        }
      } catch {
        // Network offline
      }
    };

    poll();
    this.pollingTimer = setInterval(poll, intervalMs);
  }

  public stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.activePollingBusId = null;
  }

  /**
   * Subscribe to live location updates from any device or tab.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: TelematicsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(location: LiveBusLocation) {
    this.listeners.forEach((listener) => {
      try {
        listener(location);
      } catch (err) {
        console.error("Error in telematics listener callback:", err);
      }
    });
  }

  public cleanup() {
    this.stopPolling();
    if (this.localBroadcastChannel) {
      this.localBroadcastChannel.close();
      this.localBroadcastChannel = null;
    }
    this.listeners.clear();
    this.initialized = false;
  }
}

export const telematicsService = new TelematicsService();
