/**
 * CampusFleet Commuter Corridor Map Controller
 * Object-Oriented Leaflet Controller powering the Commuter Portal Cockpit Map
 * Directly inspired by the battle-tested, high-performance OnboardingPinController
 *
 * Core Capabilities:
 * 1. Google Maps High-Res Raster Tiles (0 deprecation warnings, 0 script injection flickering)
 * 2. Tactile Doorstep Home Pin with "Your Home" badge
 * 3. Designated Boarding Stop Pin with "🚏 Boarding: <Stop Name>" badge
 * 4. Google Road-Snapped Pedestrian Walking Path with "🚶 {dist}m • ~{mins}m walk" center tooltip
 * 5. Google Road-Snapped Transit Route Corridor with white casing, route polyline, and stop node dots
 * 6. Realtime Live Bus Vehicle Marker with live telemetry, heading rotation, and speed badge
 * 7. Intelligent framing: Auto-frames the commuter's doorstep & boarding stop at comfortable zoom (15-16)
 * 8. Zero-flicker live updates via marker.setLatLng() and polyline.setLatLngs()
 */

import { BaseMapController, MapCoordinates } from "./BaseMapController";
import { Stop, Route } from "@/lib/types";

export interface CommuterCorridorControllerConfig {
  zoom?: number;
  tileTheme?: "GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK";
  onStopClick?: (stop: Stop) => void;
  onBusClick?: () => void;
}

export class CommuterCorridorController extends BaseMapController {
  private leafletModule: any = null;

  // Layer references
  private tileLayerInstance: any = null;
  private currentTileTheme: "GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK" = "GOOGLE_STREETS";
  private homeMarker: any = null;
  private stopMarker: any = null;
  private walkingPolyline: any = null;
  private routePolyline: any = null;
  private routeCasingPolyline: any = null;
  private routeStopMarkers: any[] = [];
  private busMarker: any = null;
  private deviceGpsMarker: any = null;

  // Active state
  private homeCoords: MapCoordinates | null = null;
  private pickupStop: Stop | null = null;
  private assignedRoute: Route | null = null;
  private stopsCatalog: Stop[] = [];
  private busLocationData: any = null;
  private busDisplayName = "Campus Shuttle";
  private deviceGpsCoords: MapCoordinates | null = null;
  private currentHeadingDeg = 0;
  private currentContinuousHeading = 0;
  private hasInitiallyFittedBounds = false;

  private getShortestAngleDelta(current: number, target: number): number {
    const da = (target - current) % 360;
    return ((2 * da) % 360) - da;
  }

  // Direction caches and AbortControllers
  private walkingAbortController: AbortController | null = null;
  private routeAbortController: AbortController | null = null;
  private walkingRoadCache = new Map<
    string,
    { points: [number, number][]; distanceMeters: number; durationSeconds: number }
  >();
  private routeRoadCache = new Map<string, [number, number][]>();

  constructor(private config: CommuterCorridorControllerConfig = {}) {
    super({ zoom: config.zoom ?? 15 });
  }

  /**
   * Initializes the map with high-resolution Google Maps Streets tiles
   */
  public async initialize(container: HTMLElement, initialCoords: MapCoordinates): Promise<void> {
    this.container = container;
    this.homeCoords = initialCoords;

    const L = await import("leaflet");
    this.leafletModule = L;

    if (this.isDestroyed || !this.container) return;

    // Fix icon asset paths for Leaflet in bundlers
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(this.container, {
      center: [initialCoords.latitude, initialCoords.longitude],
      zoom: this.options.zoom ?? 15,
      zoomControl: false,
      attributionControl: false,
    });

    this.mapInstance = map;

    // Apply configured raster tile theme
    this.setTileTheme(this.config.tileTheme || "GOOGLE_STREETS");

    // Immediately render doorstep home marker
    this.createOrUpdateHomeMarker();
  }

  /**
   * Reflows Leaflet canvas dimensions after container size or fullscreen changes
   */
  public invalidateSize(): void {
    if (this.mapInstance && typeof this.mapInstance.invalidateSize === "function") {
      this.mapInstance.invalidateSize();
    }
  }

  /**
   * Sets or updates the Commuter's Registered Doorstep Home Location Pin
   */
  public setHomeLocation(coords: MapCoordinates | null): void {
    if (this.isDestroyed || !coords || isNaN(coords.latitude) || isNaN(coords.longitude)) return;
    this.homeCoords = coords;
    this.createOrUpdateHomeMarker();
    this.updateWalkingPath();
  }

  /**
   * Sets or updates the Commuter's Assigned Pickup / Boarding Stop
   */
  public setPickupStop(stop: Stop | null, distMeters?: number, walkMins?: number): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    this.pickupStop = stop || null;

    if (this.stopMarker) {
      this.mapInstance.removeLayer(this.stopMarker);
      this.stopMarker = null;
    }

    if (!stop || isNaN(stop.latitude) || isNaN(stop.longitude)) {
      this.clearWalkingLine();
      return;
    }

    const stopIcon = L.divIcon({
      className: "custom-boarding-stop-pin",
      html: `
        <div class="relative flex flex-col items-center select-none" style="transform: translate(-50%, -100%);">
          <div class="px-2.5 py-0.5 rounded-full bg-blue-900/95 dark:bg-blue-950/95 text-white text-[10px] font-bold shadow-xl border border-blue-400/40 whitespace-nowrap mb-1 flex items-center gap-1.5 animate-in fade-in zoom-in duration-150">
            <span>🚏</span>
            <span class="max-w-[160px] truncate">Boarding: ${stop.name}</span>
          </div>
          <div class="relative flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white ring-4 ring-blue-400/40">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"></circle>
                <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
              </svg>
            </div>
            <div class="absolute -bottom-1 w-2.5 h-2.5 rotate-45 bg-blue-700"></div>
          </div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    this.stopMarker = L.marker([stop.latitude, stop.longitude], {
      icon: stopIcon,
      zIndexOffset: 1200,
    }).addTo(this.mapInstance);

    this.stopMarker.on("click", () => {
      this.config.onStopClick?.(stop);
    });

    this.updateWalkingPath(stop, distMeters, walkMins);

    // Initial camera auto-frame
    if (!this.hasInitiallyFittedBounds) {
      this.fitWalkingBounds();
      this.hasInitiallyFittedBounds = true;
    }
  }

  /**
   * Sets the Assigned Transit Route Corridor with road snapping and route stop node dots
   */
  public setAssignedRoute(route: Route | null, allStops: Stop[] = []): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    this.assignedRoute = route || null;
    this.stopsCatalog = allStops;

    // Clean up existing route corridor layers
    if (this.routePolyline) {
      this.mapInstance.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
    if (this.routeCasingPolyline) {
      this.mapInstance.removeLayer(this.routeCasingPolyline);
      this.routeCasingPolyline = null;
    }
    this.routeStopMarkers.forEach((m) => {
      if (this.mapInstance) this.mapInstance.removeLayer(m);
    });
    this.routeStopMarkers = [];

    if (!route) return;

    // Extract ordered stop coordinates along route
    const rawStops = route.stops || [];
    const orderedPoints: [number, number][] = [];

    for (const rs of rawStops) {
      const stopObj =
        rs.stop ||
        this.stopsCatalog.find(
          (s) => s.id === (rs.stopId || (rs as any).stop_id)
        );
      if (stopObj && !isNaN(stopObj.latitude) && !isNaN(stopObj.longitude)) {
        orderedPoints.push([stopObj.latitude, stopObj.longitude]);
      }
    }

    // Fallback to allStops if route has no stops array populated
    if (orderedPoints.length < 2 && allStops.length >= 2) {
      for (const s of allStops.slice(0, 10)) {
        if (!isNaN(s.latitude) && !isNaN(s.longitude)) {
          orderedPoints.push([s.latitude, s.longitude]);
        }
      }
    }

    if (orderedPoints.length < 2) return;

    const corridorColor = route.color || "#2563EB";

    // White route casing
    this.routeCasingPolyline = L.polyline(orderedPoints, {
      color: "#ffffff",
      weight: 7,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(this.mapInstance);

    // High-contrast transit corridor line
    this.routePolyline = L.polyline(orderedPoints, {
      color: corridorColor,
      weight: 4.5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(this.mapInstance);

    // Subtle stop node dots along the corridor
    for (const rs of rawStops) {
      const stopObj =
        rs.stop ||
        this.stopsCatalog.find(
          (s) => s.id === (rs.stopId || (rs as any).stop_id)
        );
      if (
        stopObj &&
        stopObj.id !== this.pickupStop?.id &&
        !isNaN(stopObj.latitude) &&
        !isNaN(stopObj.longitude)
      ) {
        const dotIcon = L.divIcon({
          className: "route-node-marker",
          html: `
            <div class="group relative flex items-center justify-center">
              <div class="w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-600 shadow-sm transition-transform group-hover:scale-150"></div>
            </div>
          `,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });

        const dotMarker = L.marker([stopObj.latitude, stopObj.longitude], {
          icon: dotIcon,
          zIndexOffset: 600,
        }).addTo(this.mapInstance);

        dotMarker.bindTooltip(stopObj.name, {
          direction: "top",
          offset: [0, -6],
          className: "custom-route-stop-tooltip",
        });

        dotMarker.on("click", () => {
          this.config.onStopClick?.(stopObj);
        });

        this.routeStopMarkers.push(dotMarker);
      }
    }

    // Roadway snapping via server Google Routes API
    const routeKey = orderedPoints.map((p) => `${p[0]},${p[1]}`).join(";");
    const cachedRoadRoute = this.routeRoadCache.get(routeKey);

    if (cachedRoadRoute && cachedRoadRoute.length >= 2) {
      this.routeCasingPolyline.setLatLngs(cachedRoadRoute);
      this.routePolyline.setLatLngs(cachedRoadRoute);
      return;
    }

    if (this.routeAbortController) {
      this.routeAbortController.abort();
    }
    const ac = new AbortController();
    this.routeAbortController = ac;

    fetch(`/api/geo/directions?mode=drive&coords=${encodeURIComponent(routeKey)}`, {
      signal: ac.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (
          !this.isDestroyed &&
          !ac.signal.aborted &&
          data.success &&
          Array.isArray(data.coordinates) &&
          data.coordinates.length >= 2
        ) {
          this.routeRoadCache.set(routeKey, data.coordinates);
          if (this.routeCasingPolyline) {
            this.routeCasingPolyline.setLatLngs(data.coordinates);
          }
          if (this.routePolyline) {
            this.routePolyline.setLatLngs(data.coordinates);
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[CommuterCorridorController] Road routing for bus corridor:", err);
        }
      });
  }

  /**
   * Sets or smoothly updates the Live Bus Vehicle Marker without flickering or rebuilding map
   */
  public setLiveBusLocation(busLoc: any, busName = "Campus Shuttle"): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    this.busLocationData = busLoc;
    this.busDisplayName = busName;

    if (!busLoc || isNaN(busLoc.latitude) || isNaN(busLoc.longitude)) {
      if (this.busMarker) {
        this.mapInstance.removeLayer(this.busMarker);
        this.busMarker = null;
      }
      return;
    }

    const lat = Number(busLoc.latitude);
    const lng = Number(busLoc.longitude);
    const speed = Math.round(busLoc.speedKmh ?? busLoc.speed ?? 0);
    const heading = Math.round(busLoc.headingDeg ?? busLoc.heading ?? 0);
    const isMoving = speed > 2;

    const busIconHtml = `
      <div class="relative flex flex-col items-center select-none group" style="transform: translate(-50%, -50%);">
        <div class="px-2.5 py-0.5 rounded-full bg-slate-900/95 dark:bg-zinc-900/95 text-white text-[10px] font-mono font-bold shadow-2xl border border-blue-400/40 whitespace-nowrap mb-1 flex items-center gap-1.5 pointer-events-none">
          <span class="w-2 h-2 rounded-full ${isMoving ? "bg-emerald-400 animate-ping" : "bg-blue-400"}"></span>
          <span>${busName}</span>
          <span class="text-zinc-400 font-normal">• ${isMoving ? `${speed} km/h` : "Live GPS"}</span>
        </div>
        <div class="relative flex items-center justify-center">
          <div class="w-11 h-11 rounded-2xl bg-blue-600 border-2 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-blue-400/40 transition-transform group-hover:scale-110">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6 2 7"></path><path d="M10 6h4"></path><path d="m22 7-2-1"></path>
              <rect width="16" height="16" x="4" y="3" rx="2"></rect>
              <path d="M4 11h16"></path><path d="M8 15h.01"></path><path d="M16 15h.01"></path>
              <path d="M6 19v2"></path><path d="M18 21v-2"></path>
            </svg>
          </div>
          ${
            isMoving && heading
              ? `<div class="absolute -top-2 w-4 h-4 text-blue-500 drop-shadow" style="transform: rotate(${heading}deg);">
                   <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 20l8-4 8 4z"/></svg>
                 </div>`
              : ""
          }
        </div>
      </div>
    `;

    const busIcon = L.divIcon({
      className: "custom-live-bus-marker",
      html: busIconHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const popupHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.45; min-width: 200px; padding: 2px;">
        <strong style="color: #0f172a; font-size: 13px; font-weight: 900;">${busName}</strong>
        <div style="color: #475569; font-size: 11px; margin-top: 2px;">
          ${isMoving ? `In Motion • ${speed} km/h` : "Stationary / Standby"}
        </div>
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
          <a
            href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}"
            target="_blank"
            rel="noopener noreferrer"
            style="color: #0284c7; font-weight: 700; font-size: 11px; text-decoration: none;"
          >
            ↗ Open in Google Maps
          </a>
        </div>
      </div>
    `;

    if (!this.busMarker) {
      this.busMarker = L.marker([lat, lng], {
        icon: busIcon,
        zIndexOffset: 1600,
      }).addTo(this.mapInstance);

      this.busMarker.bindPopup(popupHtml);
      this.busMarker.on("click", () => {
        this.config.onBusClick?.();
      });
    } else {
      this.busMarker.setLatLng([lat, lng]);
      this.busMarker.setIcon(busIcon);
      this.busMarker.setPopupContent(popupHtml);
    }
  }

  /**
   * Sets or updates user's live device location and facing direction (Google Maps Navigation Chevron & Heading Cone)
   */
  public setDeviceGps(coords: MapCoordinates | null, headingDeg?: number | null): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    // Update orientation angle with shortest-path interpolation
    if (headingDeg !== undefined && headingDeg !== null && !isNaN(headingDeg)) {
      const delta = this.getShortestAngleDelta(this.currentContinuousHeading, headingDeg);
      this.currentContinuousHeading += delta;
      this.currentHeadingDeg = (headingDeg % 360 + 360) % 360;
    }

    this.deviceGpsCoords = coords;

    if (!coords || isNaN(coords.latitude) || isNaN(coords.longitude)) {
      if (this.deviceGpsMarker) {
        this.mapInstance.removeLayer(this.deviceGpsMarker);
        this.deviceGpsMarker = null;
      }
      return;
    }

    // If marker already exists, smoothly update coordinates and rotate cone/arrow via CSS transform
    if (this.deviceGpsMarker) {
      this.deviceGpsMarker.setLatLng([coords.latitude, coords.longitude]);
      const el = this.deviceGpsMarker.getElement();
      if (el) {
        const cone = el.querySelector(".user-heading-cone") as HTMLElement | null;
        const arrow = el.querySelector(".user-heading-arrow-disc") as HTMLElement | null;
        if (cone) cone.style.transform = `rotate(${this.currentContinuousHeading}deg)`;
        if (arrow) arrow.style.transform = `rotate(${this.currentContinuousHeading}deg)`;
      }
      return;
    }

    // Google Maps Navigation Marker HTML (Pulsing Radar + Translucent Directional Field-of-View Cone + 3D Arrowhead)
    const navMarkerHtml = `
      <div class="user-location-nav-marker" style="transform: translate(-50%, -50%);">
        <!-- 1. Radar Pulse Accuracy Ring -->
        <div class="user-pulse-ring"></div>

        <!-- 2. Translucent Field-of-View Directional Flashlight Cone -->
        <div class="user-heading-cone" style="transform: rotate(${this.currentContinuousHeading}deg);">
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M42 42 L20 4 A 40 40 0 0 1 64 4 Z" fill="url(#user-nav-cone-gradient)" />
            <defs>
              <radialGradient id="user-nav-cone-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="15%" stop-color="#3B82F6" stop-opacity="0.5" />
                <stop offset="65%" stop-color="#3B82F6" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#3B82F6" stop-opacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        <!-- 3. Google Maps White Circular Disc with 3D Blue Navigation Arrow -->
        <div class="user-heading-arrow-disc shadow-xl" style="transform: rotate(${this.currentContinuousHeading}deg);">
          <svg viewBox="0 0 24 24" class="w-5 h-5 text-blue-600 fill-current drop-shadow-sm">
            <path d="M12 2.5L4.5 20.2l.7.7L12 18l6.8 2.9.7-.7L12 2.5z"/>
          </svg>
        </div>

        <!-- 4. Center Core Pivot Dot -->
        <div class="user-center-dot"></div>
      </div>
    `;

    const gpsIcon = L.divIcon({
      className: "custom-device-nav-marker",
      html: navMarkerHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    this.deviceGpsMarker = L.marker([coords.latitude, coords.longitude], {
      icon: gpsIcon,
      zIndexOffset: 1550,
    }).addTo(this.mapInstance);

    this.deviceGpsMarker.on("click", () => {
      this.recenterOnGps();
    });
  }

  /**
   * Smoothly pans and centers camera on user's live GPS navigation arrow
   */
  public recenterOnGps(): void {
    if (!this.mapInstance || this.isDestroyed) return;
    const target = this.deviceGpsCoords || this.homeCoords;
    if (target && !isNaN(target.latitude) && !isNaN(target.longitude)) {
      this.mapInstance.setView([target.latitude, target.longitude], 17, { animate: true });
    }
  }

  /**
   * Frames the Doorstep Home Pin and Assigned Boarding Stop in view with comfortable padding
   */
  public fitWalkingBounds(): void {
    if (!this.mapInstance || !this.leafletModule || this.isDestroyed) return;
    const L = this.leafletModule;

    const points: [number, number][] = [];

    if (this.homeCoords && !isNaN(this.homeCoords.latitude) && !isNaN(this.homeCoords.longitude)) {
      points.push([this.homeCoords.latitude, this.homeCoords.longitude]);
    }

    if (this.pickupStop && !isNaN(this.pickupStop.latitude) && !isNaN(this.pickupStop.longitude)) {
      points.push([this.pickupStop.latitude, this.pickupStop.longitude]);
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      this.mapInstance.setView(points[0], 16, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points);
    this.mapInstance.fitBounds(bounds, {
      padding: [50, 45],
      maxZoom: 16,
      animate: true,
      duration: 0.45,
    });
  }

  /**
   * Pans directly to Commuter's Registered Doorstep Pin
   */
  public recenterOnHome(): void {
    if (!this.mapInstance || !this.homeCoords || this.isDestroyed) return;
    this.mapInstance.setView(
      [this.homeCoords.latitude, this.homeCoords.longitude],
      16,
      { animate: true }
    );
  }

  /**
   * Pans directly to Live Bus vehicle
   */
  public recenterOnBus(): void {
    if (!this.mapInstance || !this.busLocationData || this.isDestroyed) return;
    this.mapInstance.setView(
      [this.busLocationData.latitude, this.busLocationData.longitude],
      16,
      { animate: true }
    );
  }

  /**
   * Pans directly to Designated Pickup Stop or Target Corridor Stop
   */
  public recenterOnStop(stop?: Stop | null): void {
    const target = stop || this.pickupStop;
    if (!this.mapInstance || !target || isNaN(target.latitude) || isNaN(target.longitude) || this.isDestroyed) return;
    this.mapInstance.setView([target.latitude, target.longitude], 16, { animate: true });
  }

  /**
   * Pans to custom coordinates (e.g. campus terminal landmark)
   */
  public recenterOnCoords(coords: { latitude: number; longitude: number } | null, zoom = 16): void {
    if (!this.mapInstance || !coords || isNaN(coords.latitude) || isNaN(coords.longitude) || this.isDestroyed) return;
    this.mapInstance.setView([coords.latitude, coords.longitude], zoom, { animate: true });
  }

  /**
   * Switches map tile layer theme on the fly (Google Streets, Satellite Hybrid, Carto Dark)
   */
  public setTileTheme(theme: "GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK"): void {
    if (!this.mapInstance || !this.leafletModule || this.isDestroyed) return;
    if (this.currentTileTheme === theme && this.tileLayerInstance) return;
    this.currentTileTheme = theme;
    const L = this.leafletModule;

    if (this.tileLayerInstance) {
      this.mapInstance.removeLayer(this.tileLayerInstance);
      this.tileLayerInstance = null;
    }

    let tileUrl = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
    let subdomains = ["mt0", "mt1", "mt2", "mt3"];
    let maxZoom = 20;

    if (theme === "GOOGLE_HYBRID") {
      tileUrl = "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      subdomains = ["mt0", "mt1", "mt2", "mt3"];
    } else if (theme === "CARTO_DARK") {
      tileUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
      subdomains = ["a", "b", "c", "d"];
    }

    this.tileLayerInstance = L.tileLayer(tileUrl, {
      maxZoom,
      subdomains,
    }).addTo(this.mapInstance);

    if (typeof this.tileLayerInstance.bringToBack === "function") {
      this.tileLayerInstance.bringToBack();
    }
  }

  /**
   * Frames the entire Transit Corridor in view
   */
  public fitCorridorBounds(): void {
    if (!this.mapInstance || !this.leafletModule || this.isDestroyed) return;
    const L = this.leafletModule;

    const points: [number, number][] = [];

    if (this.routePolyline) {
      const latlngs = this.routePolyline.getLatLngs();
      if (Array.isArray(latlngs) && latlngs.length > 0) {
        latlngs.forEach((ll: any) => points.push([ll.lat, ll.lng]));
      }
    }

    if (this.homeCoords) {
      points.push([this.homeCoords.latitude, this.homeCoords.longitude]);
    }

    if (this.busLocationData) {
      points.push([this.busLocationData.latitude, this.busLocationData.longitude]);
    }

    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      this.mapInstance.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 15,
        animate: true,
        duration: 0.5,
      });
    } else {
      this.fitWalkingBounds();
    }
  }

  /**
   * Creates or updates the Doorstep Home Marker
   */
  private createOrUpdateHomeMarker(): void {
    if (!this.mapInstance || !this.leafletModule || !this.homeCoords) return;
    const L = this.leafletModule;

    const pinHtml = `
      <div class="relative flex flex-col items-center select-none group" style="transform: translate(-50%, -100%);">
        <div class="px-2.5 py-0.5 rounded-full bg-slate-900/95 dark:bg-zinc-900/95 text-white text-[10px] font-bold shadow-2xl border border-white/20 whitespace-nowrap mb-1 flex items-center gap-1.5 transition-transform group-hover:scale-105 pointer-events-none">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Your Home</span>
        </div>
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-full bg-emerald-600 border-2 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-emerald-400/40 transform transition-transform group-hover:scale-105">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div class="absolute -bottom-1.5 w-2.5 h-2.5 rotate-45 bg-emerald-700 border-r border-b border-white/70 shadow-sm"></div>
        </div>
        <div class="w-4 h-1.5 rounded-full bg-emerald-800/40 blur-[1px] mt-1"></div>
      </div>
    `;

    const homeIcon = L.divIcon({
      className: "custom-corridor-home-pin",
      html: pinHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    if (!this.homeMarker) {
      this.homeMarker = L.marker(
        [this.homeCoords.latitude, this.homeCoords.longitude],
        {
          icon: homeIcon,
          zIndexOffset: 1500,
        }
      ).addTo(this.mapInstance);
    } else {
      this.homeMarker.setLatLng([this.homeCoords.latitude, this.homeCoords.longitude]);
    }
  }

  /**
   * Draws and road-snaps pedestrian walking line between Home and Pickup Stop
   */
  private updateWalkingPath(
    stop?: Stop | null,
    distMeters?: number,
    walkMins?: number
  ): void {
    if (!this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    const targetStop = stop || this.pickupStop;
    if (!this.homeCoords || !targetStop || isNaN(targetStop.latitude) || isNaN(targetStop.longitude)) {
      this.clearWalkingLine();
      return;
    }

    const homePoint: [number, number] = [this.homeCoords.latitude, this.homeCoords.longitude];
    const stopPoint: [number, number] = [targetStop.latitude, targetStop.longitude];

    // Compute straight-line distance if not provided
    const dLat = (homePoint[0] - stopPoint[0]) * 111000;
    const dLng = (homePoint[1] - stopPoint[1]) * 96000;
    const approxDistMeters = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
    const effectiveDist = distMeters || approxDistMeters || 450;
    const effectiveMins = walkMins || Math.max(1, Math.round(effectiveDist / 80));

    // Instant initial dashed line to prevent lag
    if (!this.walkingPolyline) {
      this.walkingPolyline = L.polyline([homePoint, stopPoint], {
        color: "#10B981",
        weight: 3.5,
        dashArray: "6, 8",
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(this.mapInstance);
    } else {
      this.walkingPolyline.setLatLngs([homePoint, stopPoint]);
    }

    this.walkingPolyline.bindTooltip(
      `🚶 ${effectiveDist}m • ~${effectiveMins}m walk`,
      {
        permanent: true,
        direction: "center",
        className: "custom-walking-tooltip",
      }
    );

    // Query Google Maps Roadway Pedestrian Routing
    const walkKey = `${homePoint[0].toFixed(5)},${homePoint[1].toFixed(5)};${stopPoint[0].toFixed(5)},${stopPoint[1].toFixed(5)}`;
    const cachedWalk = this.walkingRoadCache.get(walkKey);

    if (cachedWalk && cachedWalk.points.length >= 2) {
      this.walkingPolyline.setLatLngs(cachedWalk.points);
      const roadMins = Math.max(1, Math.round(cachedWalk.durationSeconds / 60));
      this.walkingPolyline.setTooltipContent(`🚶 ${cachedWalk.distanceMeters}m • ~${roadMins}m walk`);
      return;
    }

    if (this.walkingAbortController) {
      this.walkingAbortController.abort();
    }
    const ac = new AbortController();
    this.walkingAbortController = ac;

    fetch(`/api/geo/directions?mode=walk&coords=${encodeURIComponent(walkKey)}`, {
      signal: ac.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (
          !this.isDestroyed &&
          !ac.signal.aborted &&
          data.success &&
          Array.isArray(data.coordinates) &&
          data.coordinates.length >= 2
        ) {
          const roadDist = data.distanceMeters || effectiveDist;
          const roadMins = Math.max(1, Math.round((data.durationSeconds || roadDist * 0.75) / 60));

          this.walkingRoadCache.set(walkKey, {
            points: data.coordinates,
            distanceMeters: roadDist,
            durationSeconds: data.durationSeconds || roadMins * 60,
          });

          if (this.walkingPolyline) {
            this.walkingPolyline.setLatLngs(data.coordinates);
            this.walkingPolyline.setTooltipContent(`🚶 ${roadDist}m • ~${roadMins}m walk`);
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[CommuterCorridorController] Walking route error:", err);
        }
      });
  }

  private clearWalkingLine(): void {
    if (this.walkingPolyline && this.mapInstance) {
      this.mapInstance.removeLayer(this.walkingPolyline);
      this.walkingPolyline = null;
    }
  }

  public override destroy(): void {
    if (this.walkingAbortController) this.walkingAbortController.abort();
    if (this.routeAbortController) this.routeAbortController.abort();
    this.clearWalkingLine();
    super.destroy();
  }
}

