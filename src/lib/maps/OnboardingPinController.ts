/**
 * CampusFleet Object-Oriented Onboarding Pin Map Controller
 * Specialized subclass of BaseMapController for Commuter Doorstep Pin Drop
 * 
 * Standards & Road Snapping:
 * 1. Doorstep Home pin (Source) - Draggable & tap-to-teleport
 * 2. Assigned Transit Route Corridor on the road - Snapped to Google Maps Roads
 * 3. Designated Pickup / Boarding Stop on that route (Destination)
 * 4. Pedestrian walking dashed path connecting Home ➔ Pickup Stop snapped to Google Maps sidewalks/streets
 * 5. Intelligent auto-framing (fitBounds) keeping walk & corridor in view
 */

import { BaseMapController, MapCoordinates } from "./BaseMapController";
import { Stop, Route } from "@/lib/types";

export interface OnboardingPinControllerConfig {
  zoom?: number;
  onLocationChange: (coords: MapCoordinates) => void;
}

export class OnboardingPinController extends BaseMapController {
  private homeMarker: any = null;
  private stopMarker: any = null;
  private walkingPolyline: any = null;
  private routePolyline: any = null;
  private routeCasingPolyline: any = null;
  private routeStopMarkers: any[] = [];
  private leafletModule: any = null;

  private currentHomeCoords: MapCoordinates = { latitude: 29.220936, longitude: 79.514496 };
  private currentPickupStop: Stop | null = null;
  private currentAssignedRoute: Route | null = null;
  private stopsCatalog: Stop[] = [];
  private hasInitiallyFittedBounds = false;

  // AbortControllers and In-Memory Route Geometry Cache
  private walkingAbortController: AbortController | null = null;
  private routeAbortController: AbortController | null = null;
  private walkingRoadCache = new Map<
    string,
    { points: [number, number][]; distanceMeters: number; durationSeconds: number }
  >();
  private routeRoadCache = new Map<string, [number, number][]>();

  constructor(private config: OnboardingPinControllerConfig) {
    super({ zoom: config.zoom ?? 15 });
  }

  /**
   * Initializes the map with Google Maps high-res tiles and binds the draggable home marker
   */
  public async initialize(container: HTMLElement, initialCoords: MapCoordinates): Promise<void> {
    this.container = container;
    this.currentHomeCoords = initialCoords;

    const L = await import("leaflet");
    this.leafletModule = L;

    if (this.isDestroyed || !this.container) return;

    // Fix icon asset paths in bundlers
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

    // High-speed Google Maps Streets tile layer
    L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
    }).addTo(map);

    // Map tap/click to relocate home pin smoothly
    map.on("click", (e: any) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      this.setHomePin({ latitude: lat, longitude: lng }, true);
      this.config.onLocationChange({ latitude: lat, longitude: lng });
    });

    this.mapInstance = map;

    // Immediately render the always-on draggable pin
    this.createAndBindHomeMarker();
  }

  /**
   * Updates home pin position, optionally panning the map
   */
  public setHomePin(coords: MapCoordinates, shouldPan = false): void {
    if (this.isDestroyed || !coords || isNaN(coords.latitude) || isNaN(coords.longitude)) return;
    this.currentHomeCoords = coords;

    if (this.homeMarker) {
      this.homeMarker.setLatLng([coords.latitude, coords.longitude]);
      if (shouldPan && this.mapInstance) {
        this.mapInstance.panTo([coords.latitude, coords.longitude], { animate: true, duration: 0.35 });
      }
    } else if (this.mapInstance) {
      this.createAndBindHomeMarker();
    }

    this.updateWalkingLine();
  }

  /**
   * Reflows map dimensions when container or fullscreen mode changes
   */
  public invalidateSize(): void {
    if (this.mapInstance && typeof this.mapInstance.invalidateSize === "function") {
      this.mapInstance.invalidateSize();
    }
  }

  /**
   * Sets the matched pickup stop and connects it to the home pin with a pedestrian walking line
   */
  public setPickupStop(stop?: Stop | null, distMeters?: number, walkMins?: number): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    this.currentPickupStop = stop || null;

    // Clean up previous stop marker
    if (this.stopMarker) {
      this.mapInstance.removeLayer(this.stopMarker);
      this.stopMarker = null;
    }

    if (!stop || isNaN(stop.latitude) || isNaN(stop.longitude)) {
      this.clearWalkingLine();
      return;
    }

    const stopIcon = L.divIcon({
      className: "custom-stop-pin",
      html: `
        <div class="relative flex flex-col items-center select-none" style="transform: translate(-50%, -100%);">
          <div class="px-2.5 py-0.5 rounded-full bg-blue-900/95 dark:bg-blue-950/95 text-white text-[10px] font-bold shadow-xl border border-blue-400/40 whitespace-nowrap mb-1 flex items-center gap-1.5 animate-in fade-in zoom-in duration-150">
            <span>🚏</span>
            <span class="max-w-[140px] truncate">Boarding: ${stop.name}</span>
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

    this.updateWalkingLine(stop, distMeters, walkMins);

    // Initial frame or on first stop resolve
    if (!this.hasInitiallyFittedBounds) {
      this.fitWalkingBounds();
      this.hasInitiallyFittedBounds = true;
    }
  }

  /**
   * Sets the assigned transit route and draws the Google Road-snapped bus corridor on the map
   */
  public setAssignedRoute(route?: Route | null, allStops?: Stop[]): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    this.currentAssignedRoute = route || null;
    if (allStops) this.stopsCatalog = allStops;

    // 1. Clean up existing route corridor layers
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

    // 2. Extract ordered stop coordinates along this route
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

    if (orderedPoints.length < 2) return;

    // 3. Render High-Contrast Google Transit Style Corridor Base (Immediate display)
    const corridorColor = route.color || "#2563EB";

    this.routeCasingPolyline = L.polyline(orderedPoints, {
      color: "#ffffff",
      weight: 7,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(this.mapInstance);

    this.routePolyline = L.polyline(orderedPoints, {
      color: corridorColor,
      weight: 4.5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(this.mapInstance);

    // 4. Subtle stop node dots along the route for other stops (so commuter sees the corridor)
    for (const rs of rawStops) {
      const stopObj =
        rs.stop ||
        this.stopsCatalog.find(
          (s) => s.id === (rs.stopId || (rs as any).stop_id)
        );
      if (
        stopObj &&
        stopObj.id !== this.currentPickupStop?.id &&
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

        this.routeStopMarkers.push(dotMarker);
      }
    }

    // 5. Asynchronously Snap Transit Bus Route to Google Maps Roadway Curves
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
          console.warn("Google road routing for bus route:", err);
        }
      });
  }

  /**
   * Re-centers camera on current home pin
   */
  public recenterOnHome(): void {
    if (!this.mapInstance || this.isDestroyed) return;
    this.mapInstance.setView(
      [this.currentHomeCoords.latitude, this.currentHomeCoords.longitude],
      16,
      { animate: true }
    );
  }

  /**
   * Auto-fits camera to cleanly frame:
   * Source (Home Pin) ➔ Walking Path ➔ Destination (Assigned Boarding Stop)
   */
  public fitWalkingBounds(): void {
    if (!this.mapInstance || !this.leafletModule || this.isDestroyed) return;
    const L = this.leafletModule;

    const points: [number, number][] = [
      [this.currentHomeCoords.latitude, this.currentHomeCoords.longitude],
    ];

    if (
      this.currentPickupStop &&
      !isNaN(this.currentPickupStop.latitude) &&
      !isNaN(this.currentPickupStop.longitude)
    ) {
      points.push([this.currentPickupStop.latitude, this.currentPickupStop.longitude]);
    }

    if (points.length < 2) {
      this.recenterOnHome();
      return;
    }

    const bounds = L.latLngBounds(points);
    this.mapInstance.fitBounds(bounds, {
      padding: [45, 45],
      maxZoom: 16,
      animate: true,
      duration: 0.5,
    });
  }

  /**
   * Uses browser geolocation to locate device and drop home pin
   */
  public async locateCurrentDevice(): Promise<MapCoordinates> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const coords: MapCoordinates = { latitude: lat, longitude: lng };

          this.setHomePin(coords, true);
          this.config.onLocationChange(coords);
          resolve(coords);
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  /**
   * Creates the tactile, draggable teardrop marker (MyJio / Swiggy standard)
   */
  private createAndBindHomeMarker(): void {
    if (!this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    const pinHtml = `
      <div class="relative flex flex-col items-center select-none cursor-grab active:cursor-grabbing group" style="transform: translate(-50%, -100%);">
        <div class="px-2.5 py-0.5 rounded-full bg-slate-900/95 dark:bg-zinc-900/95 text-white text-[10px] font-bold shadow-2xl border border-white/20 whitespace-nowrap mb-1 flex items-center gap-1.5 transition-transform group-hover:scale-105 pointer-events-none">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Your Home</span>
          <span class="text-zinc-400 text-[9px] font-normal">• Drag or tap</span>
        </div>
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-full bg-emerald-600 border-2 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-emerald-400/40 transform transition-transform group-active:scale-110">
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
      className: "custom-onboarding-home-pin",
      html: pinHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const marker = L.marker(
      [this.currentHomeCoords.latitude, this.currentHomeCoords.longitude],
      {
        icon: homeIcon,
        draggable: true,
        autoPan: true,
        zIndexOffset: 1500,
      }
    ).addTo(this.mapInstance);

    marker.on("dragend", (e: any) => {
      const newLatLng = e.target.getLatLng();
      const lat = Number(newLatLng.lat.toFixed(6));
      const lng = Number(newLatLng.lng.toFixed(6));
      this.currentHomeCoords = { latitude: lat, longitude: lng };
      if (this.mapInstance) {
        this.mapInstance.panTo([lat, lng], { animate: true, duration: 0.3 });
      }
      this.config.onLocationChange({ latitude: lat, longitude: lng });
      this.updateWalkingLine();
    });

    this.homeMarker = marker;
  }

  /**
   * Draws and updates the pedestrian walking path between Home Pin (Source) and Assigned Stop (Destination)
   * Exclusively using Google Maps Road / Pedestrian sidewalks & streets
   */
  private updateWalkingLine(
    stop?: Stop | null,
    distMeters?: number,
    walkMins?: number
  ): void {
    if (!this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    const targetStop =
      stop ||
      this.currentPickupStop ||
      (this.stopMarker
        ? {
            latitude: this.stopMarker.getLatLng().lat,
            longitude: this.stopMarker.getLatLng().lng,
          }
        : null);

    if (!targetStop || isNaN(targetStop.latitude) || isNaN(targetStop.longitude)) {
      this.clearWalkingLine();
      return;
    }

    const homePoint: [number, number] = [
      this.currentHomeCoords.latitude,
      this.currentHomeCoords.longitude,
    ];
    const stopPoint: [number, number] = [targetStop.latitude, targetStop.longitude];

    // 1. Initial draft polyline to guarantee instant zero-lag visual feedback
    if (!this.walkingPolyline) {
      this.walkingPolyline = L.polyline([homePoint, stopPoint], {
        color: "#10B981",
        weight: 3.5,
        dashArray: "6, 8",
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(this.mapInstance);
    } else {
      this.walkingPolyline.setLatLngs([homePoint, stopPoint]);
    }

    const defaultDist = distMeters || 450;
    const defaultMins = walkMins || Math.max(1, Math.round(defaultDist / 80));
    this.walkingPolyline.bindTooltip(
      `🚶 ${defaultDist}m • ~${defaultMins}m walk`,
      {
        permanent: true,
        direction: "center",
        className: "custom-walking-tooltip",
      }
    );

    // 2. Asynchronously Query Google Maps Roadway Pedestrian Routing
    const walkKey = `${homePoint[0]},${homePoint[1]};${stopPoint[0]},${stopPoint[1]}`;
    const cachedWalk = this.walkingRoadCache.get(walkKey);

    if (cachedWalk && cachedWalk.points.length >= 2) {
      this.walkingPolyline.setLatLngs(cachedWalk.points);
      const mins = Math.max(1, Math.round(cachedWalk.durationSeconds / 60));
      this.walkingPolyline.bindTooltip(`🚶 ${cachedWalk.distanceMeters}m • ~${mins}m walk`, {
        permanent: true,
        direction: "center",
        className: "custom-walking-tooltip",
      });
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
          const roadPoints = data.coordinates as [number, number][];
          this.walkingRoadCache.set(walkKey, {
            points: roadPoints,
            distanceMeters: data.distanceMeters || defaultDist,
            durationSeconds: data.durationSeconds || defaultMins * 60,
          });

          if (this.walkingPolyline) {
            this.walkingPolyline.setLatLngs(roadPoints);
            const accurateMins = Math.max(
              1,
              Math.round((data.durationSeconds || defaultMins * 60) / 60)
            );
            const accurateDist = data.distanceMeters || defaultDist;
            this.walkingPolyline.bindTooltip(
              `🚶 ${accurateDist}m • ~${accurateMins}m walk`,
              {
                permanent: true,
                direction: "center",
                className: "custom-walking-tooltip",
              }
            );
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Google road walking route:", err);
        }
      });
  }

  private clearWalkingLine(): void {
    if (this.walkingPolyline && this.mapInstance) {
      this.mapInstance.removeLayer(this.walkingPolyline);
      this.walkingPolyline = null;
    }
  }

  /**
   * Clean destruction
   */
  public override destroy(): void {
    if (this.walkingAbortController) {
      this.walkingAbortController.abort();
      this.walkingAbortController = null;
    }
    if (this.routeAbortController) {
      this.routeAbortController.abort();
      this.routeAbortController = null;
    }
    this.clearWalkingLine();
    if (this.routePolyline && this.mapInstance) {
      this.mapInstance.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
    if (this.routeCasingPolyline && this.mapInstance) {
      this.mapInstance.removeLayer(this.routeCasingPolyline);
      this.routeCasingPolyline = null;
    }
    this.routeStopMarkers.forEach((m) => {
      if (this.mapInstance) this.mapInstance.removeLayer(m);
    });
    this.routeStopMarkers = [];

    if (this.homeMarker && this.mapInstance) {
      this.mapInstance.removeLayer(this.homeMarker);
      this.homeMarker = null;
    }
    if (this.stopMarker && this.mapInstance) {
      this.mapInstance.removeLayer(this.stopMarker);
      this.stopMarker = null;
    }
    super.destroy();
  }
}
