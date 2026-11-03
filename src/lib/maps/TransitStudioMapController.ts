/**
 * CampusFleet Object-Oriented Transit Studio Map Controller
 * Subclass of BaseMapController for Full-Screen Transit Planning & Corridor GIS
 * 
 * Standards & Design:
 * 1. Fixed Anchor 1: University Campus Terminal (Start)
 * 2. Fixed Anchor 2: Overnight Fleet Staging & Rest Depot (End)
 * 3. Intermediate Stops: Click map to place, drag to relocate, click to inspect & assign zones
 * 4. Commuter Demand Heatmap: Student home coordinates color-coded:
 *    - Green (#10B981): Walkable distance (<500m to nearest bus stop)
 *    - Amber (#F59E0B): Moderate walking distance (500m - 1000m)
 *    - Red (#EF4444): Underserved / long walk (>1000m - needs new stop nearby!)
 * 5. Multi-stop Road Snapping: Live Google Maps Directions along road geometry
 */

import { BaseMapController, MapCoordinates } from "./BaseMapController";
import { calculateHaversineDistanceKm } from "@/lib/eta-calculator";
import { DARK_MAP_STYLES } from "@/components/maps/google/mapStyles";
import { Campus, Stop, Student } from "@/lib/types";

export interface StudioCampusAnchor {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  landmark?: string;
}

export interface StudioRestZoneAnchor {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  landmark?: string;
  fleetCapacity?: number;
}

export interface StudioStop {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  landmark?: string;
  zoneCode?: string;
  dwellMinutes?: number;
  order: number;
  isBusMergeStop?: boolean;
}

export interface StudentDemandPoint {
  id: string;
  name: string;
  studentIdCode?: string;
  department?: string;
  semester?: string;
  latitude: number;
  longitude: number;
  walkDistanceMeters: number;
  walkStatus: "WALKABLE" | "MODERATE" | "UNDERSERVED";
  nearestStopName?: string;
  routeProximityMeters?: number;
  stopDistanceMeters?: number;
}

export interface TransitStudioMapConfig {
  apiKey?: string;
  zoom?: number;
  tileTheme?: "GOOGLE_STREETS" | "CARTO_DARK" | "GOOGLE_HYBRID";
  onStopClick?: (stop: StudioStop) => void;
  onStopMoved?: (stopId: string, lat: number, lng: number) => void;
  onRestZoneClick?: (restZone: StudioRestZoneAnchor) => void;
  onRestZoneMoved?: (lat: number, lng: number) => void;
  onMapClickAddStop?: (lat: number, lng: number) => void;
  onDemandMetricsCalculated?: (metrics: {
    total: number;
    walkable: number;
    moderate: number;
    underserved: number;
    walkablePercent: number;
  }) => void;
  onRouteMetricsCalculated?: (metrics: { distanceKm: number; durationMins: number }) => void;
}

// Crisp inline SVGs for studio markers
function createCampusAnchorSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <defs>
      <filter id="cs" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.45"/>
      </filter>
    </defs>
    <circle cx="24" cy="24" r="22" fill="#047857" fill-opacity="0.2"/>
    <circle cx="24" cy="24" r="17" fill="#059669" stroke="#FFFFFF" stroke-width="2.5" filter="url(#cs)"/>
    <g transform="translate(13, 13) scale(0.9)" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </g>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

function createRestZoneAnchorSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <defs>
      <filter id="rs" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.45"/>
      </filter>
    </defs>
    <circle cx="24" cy="24" r="22" fill="#4338CA" fill-opacity="0.2"/>
    <circle cx="24" cy="24" r="17" fill="#4F46E5" stroke="#FFFFFF" stroke-width="2.5" filter="url(#rs)"/>
    <g transform="translate(14, 14) scale(0.85)" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 17h2l.5-4h-3M4 17h16M5 17l-1.5-6h15M6 5h12a2 2 0 0 1 2 2v10H4V7a2 2 0 0 1 2-2zM9 17v2M15 17v2"/>
      <circle cx="7.5" cy="17.5" r="1.5" fill="#FFFFFF"/>
      <circle cx="16.5" cy="17.5" r="1.5" fill="#FFFFFF"/>
    </g>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

function createStudioStopMarkerSvg(order: number, zoneCode?: string, isSelected = false, isMergeStop = false): string {
  const zoneColor =
    zoneCode === "ZONE_A" ? "#059669" :
    zoneCode === "ZONE_B" ? "#0284C7" :
    zoneCode === "ZONE_C" ? "#7C3AED" :
    "#2563EB";

  const ringColor = isSelected ? "#F59E0B" : isMergeStop ? "#9333EA" : zoneColor;
  const strokeWidth = isSelected ? "3.5" : isMergeStop ? "3" : "2.5";
  const mergeHalo = isMergeStop ? `<circle cx="21" cy="21" r="20" fill="none" stroke="#A855F7" stroke-width="1.8" stroke-dasharray="3,3" opacity="0.85"/>` : "";
  const mergeBadge = isMergeStop ? `<circle cx="33" cy="9" r="6" fill="#9333EA" stroke="#FFFFFF" stroke-width="1.5"/><path d="M30.5 9H35.5M33 6.5L35.5 9L33 11.5" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
    <defs>
      <filter id="ss" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-opacity="0.35"/>
      </filter>
    </defs>
    ${mergeHalo}
    <circle cx="21" cy="21" r="18" fill="none" stroke="${ringColor}" stroke-width="${strokeWidth}" opacity="0.9"/>
    <circle cx="21" cy="21" r="14" fill="${isMergeStop ? "#7E22CE" : zoneColor}" stroke="#FFFFFF" stroke-width="2" filter="url(#ss)"/>
    <text x="21" y="25" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="12" fill="#FFFFFF">${order}</text>
    ${mergeBadge}
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

function createDemandDotSvg(status: "WALKABLE" | "MODERATE" | "UNDERSERVED"): string {
  const fill =
    status === "WALKABLE" ? "#10B981" :
    status === "MODERATE" ? "#F59E0B" :
    "#EF4444";

  const pulseRing =
    status === "UNDERSERVED" ? `<circle cx="12" cy="12" r="11" fill="none" stroke="#EF4444" stroke-width="1.8" opacity="0.6"/>` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <defs>
      <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-opacity="0.3"/>
      </filter>
    </defs>
    ${pulseRing}
    <circle cx="12" cy="12" r="7" fill="${fill}" stroke="#FFFFFF" stroke-width="2" filter="url(#ds)"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

export class TransitStudioMapController extends BaseMapController {
  private googleMaps: any = null;
  private directionsService: any = null;
  private infoWindow: any = null;

  // Anchors
  private campusAnchor: StudioCampusAnchor | null = null;
  private restZoneAnchor: StudioRestZoneAnchor | null = null;
  private campusMarker: any = null;
  private restZoneMarker: any = null;

  // Stops
  private studioStops: StudioStop[] = [];
  private stopMarkersMap = new Map<string, any>();
  private selectedStopId: string | null = null;

  // Student Demand Layer
  private demandPoints: StudentDemandPoint[] = [];
  private demandMarkersMap = new Map<string, any>();
  private isDemandLayerVisible = true;

  // Road Polyline
  private roadPolyline: any = null;
  private roadGlowPolyline: any = null;
  private cachedRoadPath: any[] = [];

  // Studio Mode: ADD_STOP | INSPECT | VIEW
  private studioMode: "ADD_STOP" | "INSPECT" | "VIEW" = "VIEW";

  constructor(private config: TransitStudioMapConfig) {
    super({ zoom: config.zoom ?? 13 });
  }

  /**
   * Initializes native Google Maps with high-speed road tiles & DirectionsService
   */
  public async initialize(container: HTMLElement, initialCoords: MapCoordinates): Promise<void> {
    this.container = container;

    try {
      const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
      setOptions({
        key: this.config.apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        v: "weekly",
      });
      await importLibrary("maps");
      await importLibrary("routes");
      this.googleMaps = (window as any).google;
    } catch (e) {
      console.warn("Failed to load Google Maps via importLibrary, checking window.google:", e);
      if (typeof window !== "undefined" && (window as any).google?.maps) {
        this.googleMaps = (window as any).google;
      }
    }

    if (this.isDestroyed || !this.container) return;

    const mapOptions: any = {
      center: { lat: initialCoords.latitude, lng: initialCoords.longitude },
      zoom: this.options.zoom ?? 13,
      mapTypeId:
        this.config.tileTheme === "GOOGLE_HYBRID"
          ? google.maps.MapTypeId.HYBRID
          : google.maps.MapTypeId.ROADMAP,
      styles: this.config.tileTheme === "CARTO_DARK" ? DARK_MAP_STYLES : [],
      disableDefaultUI: false,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
    };

    const map = new google.maps.Map(this.container, mapOptions);
    this.mapInstance = map;
    this.directionsService = new google.maps.DirectionsService();
    this.infoWindow = new google.maps.InfoWindow();

    // Map Click Listener
    map.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      if (this.studioMode === "ADD_STOP") {
        if (this.config.onMapClickAddStop) {
          this.config.onMapClickAddStop(lat, lng);
        }
      } else {
        if (this.infoWindow) this.infoWindow.close();
      }
    });

    this.updateMapCursor();
  }

  /**
   * Returns current map center coordinates
   */
  public getCenter(): { lat: number; lng: number } {
    if (this.mapInstance && typeof this.mapInstance.getCenter === "function") {
      const c = this.mapInstance.getCenter();
      return { lat: Number(c.lat().toFixed(6)), lng: Number(c.lng().toFixed(6)) };
    }
    return { lat: this.campusAnchor?.latitude || 29.375015, lng: this.campusAnchor?.longitude || 79.529479 };
  }

  /**
   * Sets the Fixed Campus Anchor (Corridor Origin)
   */
  public setCampusAnchor(campus: StudioCampusAnchor): void {
    if (this.isDestroyed || !this.mapInstance || !this.googleMaps) return;
    this.campusAnchor = campus;

    if (this.campusMarker) {
      this.campusMarker.setMap(null);
      this.campusMarker = null;
    }

    const pos = { lat: campus.latitude, lng: campus.longitude };
    const marker = new this.googleMaps.maps.Marker({
      position: pos,
      map: this.mapInstance,
      title: `${campus.name} (University Campus Terminal)`,
      icon: {
        url: createCampusAnchorSvg(),
        scaledSize: new this.googleMaps.maps.Size(46, 46),
        anchor: new this.googleMaps.maps.Point(23, 23),
      },
      zIndex: 100,
    });

    marker.addListener("click", () => {
      this.showInfoWindow(
        pos,
        `<div style="font-family: sans-serif; padding: 4px;">
          <div style="font-size: 10px; font-weight: 800; color: #059669; text-transform: uppercase;">Campus Terminal (Fixed Anchor)</div>
          <div style="font-size: 13px; font-weight: 800; color: #111827; margin-top: 2px;">${campus.name}</div>
          <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">Code: ${campus.code} • ${campus.landmark || "Fleet Hub"}</div>
        </div>`
      );
    });

    this.campusMarker = marker;
    this.recalculateRoutePath();
    this.recalculateDemandWalkability();
  }

  /**
   * Sets the Fixed Rest Zone / Depot Anchor (Corridor Destination)
   */
  public setRestZoneAnchor(restZone: StudioRestZoneAnchor): void {
    if (this.isDestroyed || !this.mapInstance || !this.googleMaps) return;
    this.restZoneAnchor = restZone;

    if (this.restZoneMarker) {
      this.restZoneMarker.setMap(null);
      this.restZoneMarker = null;
    }

    const pos = { lat: restZone.latitude, lng: restZone.longitude };
    const marker = new this.googleMaps.maps.Marker({
      position: pos,
      map: this.mapInstance,
      title: `${restZone.name} (Fleet Rest Depot)`,
      draggable: true,
      icon: {
        url: createRestZoneAnchorSvg(),
        scaledSize: new this.googleMaps.maps.Size(46, 46),
        anchor: new this.googleMaps.maps.Point(23, 23),
      },
      zIndex: 100,
    });

    marker.addListener("click", () => {
      if (this.config.onRestZoneClick) {
        this.config.onRestZoneClick(restZone);
      } else {
        this.showInfoWindow(
          marker.getPosition(),
          `<div style="font-family: -apple-system, sans-serif; padding: 4px;">
            <div style="font-size: 10px; font-weight: 800; color: #4F46E5; text-transform: uppercase;">Fleet Rest Zone & Depot (Fixed Anchor)</div>
            <div style="font-size: 13px; font-weight: 800; color: #111827; margin-top: 2px;">${restZone.name}</div>
            <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">Capacity: ${restZone.fleetCapacity || 25} Vehicles • ${restZone.landmark || "Overnight Depot"}</div>
            <div style="margin-top: 4px; font-size: 10px; color: #4F46E5; font-weight: 600;">Drag marker to relocate depot</div>
          </div>`
        );
      }
    });

    marker.addListener("dragend", (e: any) => {
      const newLat = Number(e.latLng.lat().toFixed(6));
      const newLng = Number(e.latLng.lng().toFixed(6));
      restZone.latitude = newLat;
      restZone.longitude = newLng;
      if (this.config.onRestZoneMoved) {
        this.config.onRestZoneMoved(newLat, newLng);
      }
      this.recalculateRoutePath();
      this.recalculateDemandWalkability();
    });

    this.restZoneMarker = marker;
    this.recalculateRoutePath();
    this.recalculateDemandWalkability();
  }

  /**
   * Updates all intermediate corridor stops
   */
  public setStops(stops: StudioStop[], selectedStopId?: string | null): void {
    if (this.isDestroyed || !this.mapInstance || !this.googleMaps) return;

    this.studioStops = [...stops].sort((a, b) => a.order - b.order);
    this.selectedStopId = selectedStopId || null;

    // Remove existing markers
    this.stopMarkersMap.forEach(marker => marker.setMap(null));
    this.stopMarkersMap.clear();

    // Create fresh draggable markers
    this.studioStops.forEach((stop, idx) => {
      const pos = { lat: stop.latitude, lng: stop.longitude };
      const isSelected = stop.id === this.selectedStopId;

      const marker = new this.googleMaps.maps.Marker({
        position: pos,
        map: this.mapInstance,
        title: `${idx + 1}. ${stop.name}`,
        draggable: true,
        icon: {
          url: createStudioStopMarkerSvg(idx + 1, stop.zoneCode, isSelected, Boolean(stop.isBusMergeStop)),
          scaledSize: new this.googleMaps.maps.Size(40, 40),
          anchor: new this.googleMaps.maps.Point(20, 20),
        },
        zIndex: isSelected ? 90 : 50,
      });

      // Stop Click -> Inspector
      marker.addListener("click", () => {
        if (this.config.onStopClick) {
          this.config.onStopClick(stop);
        }
      });

      // Stop Drag End -> Relocate Stop on Road
      marker.addListener("dragend", (e: any) => {
        const newLat = Number(e.latLng.lat().toFixed(6));
        const newLng = Number(e.latLng.lng().toFixed(6));
        stop.latitude = newLat;
        stop.longitude = newLng;
        if (this.config.onStopMoved) {
          this.config.onStopMoved(stop.id, newLat, newLng);
        }
        this.recalculateRoutePath();
        this.recalculateDemandWalkability();
      });

      this.stopMarkersMap.set(stop.id, marker);
    });

    this.recalculateRoutePath();
    this.recalculateDemandWalkability();
  }

  /**
   * Sets commuter students for the spatial demand layer
   */
  public setDemandStudents(students: Student[]): void {
    if (this.isDestroyed || !this.mapInstance || !this.googleMaps) return;

    // Filter valid students or synthesize localized commuter pins near primary stop
    this.demandPoints = students.map((s, idx) => {
      let lat = s.homeLatitude;
      let lng = s.homeLongitude;

      // Realistic localized spatial fallback if student hasn't completed onboarding pin-drop yet
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        // Base around Haldwani commuter center
        const seed = (s.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) + idx) % 1000;
        const radius = (seed / 1000) * 0.035; // ~3-4 km spread
        const angle = (seed * 137.5 * Math.PI) / 180;
        lat = 29.218 + Math.cos(angle) * radius;
        lng = 79.512 + Math.sin(angle) * radius;
      }

      return {
        id: s.id,
        name: s.fullName || `Student ${idx + 1}`,
        studentIdCode: s.studentIdCode || `ST-${23000000 + idx}`,
        department: s.department || "B.Tech CSE",
        semester: s.semester ? `Sem ${s.semester}` : "Sem 4",
        latitude: lat,
        longitude: lng,
        walkDistanceMeters: 0,
        walkStatus: "WALKABLE",
      };
    });

    this.recalculateDemandWalkability();
  }

  /**
   * Toggles the Student Demand Heatmap / Points layer visibility
   */
  public setDemandLayerVisibility(visible: boolean): void {
    this.isDemandLayerVisible = visible;
    this.demandMarkersMap.forEach(marker => {
      marker.setVisible(visible);
    });
  }

  /**
   * Updates map styles to match light/dark theme dynamically
   */
  public setDarkMode(isDark: boolean): void {
    if (!this.mapInstance || !this.googleMaps) return;
    this.mapInstance.setOptions({
      styles: isDark ? DARK_MAP_STYLES : [],
    });
  }

  /**
   * Sets Studio mode (ADD_STOP, INSPECT, VIEW)
   */
  public setStudioMode(mode: "ADD_STOP" | "INSPECT" | "VIEW"): void {
    this.studioMode = mode;
    this.updateMapCursor();
  }

  private updateMapCursor(): void {
    if (!this.container) return;
    if (this.studioMode === "ADD_STOP") {
      this.container.style.cursor = "crosshair";
    } else {
      this.container.style.cursor = "default";
    }
  }

  /**
   * Computes the shortest perpendicular distance in meters from a coordinate
   * to the active snapped road polyline of the corridor.
   */
  private getDistanceToPathMeters(lat: number, lng: number): number {
    if (!this.cachedRoadPath || this.cachedRoadPath.length < 2) return Infinity;

    let minDistanceKm = Infinity;
    const len = this.cachedRoadPath.length;

    for (let i = 0; i < len - 1; i++) {
      const p1 = this.cachedRoadPath[i];
      const p2 = this.cachedRoadPath[i + 1];
      const lat1 = typeof p1.lat === "function" ? p1.lat() : p1.lat;
      const lng1 = typeof p1.lng === "function" ? p1.lng() : p1.lng;
      const lat2 = typeof p2.lat === "function" ? p2.lat() : p2.lat;
      const lng2 = typeof p2.lng === "function" ? p2.lng() : p2.lng;

      // Fast bounding-box prefilter (0.02 deg ~ 2.2 km)
      const minLat = Math.min(lat1, lat2) - 0.02;
      const maxLat = Math.max(lat1, lat2) + 0.02;
      const minLng = Math.min(lng1, lng2) - 0.02;
      const maxLng = Math.max(lng1, lng2) + 0.02;
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
        continue;
      }

      const dx = lng2 - lng1;
      const dy = lat2 - lat1;
      const lenSq = dx * dx + dy * dy;

      let t = 0;
      if (lenSq > 0) {
        t = ((lng - lng1) * dx + (lat - lat1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }

      const projLat = lat1 + t * dy;
      const projLng = lng1 + t * dx;

      const d = calculateHaversineDistanceKm(lat, lng, projLat, projLng);
      if (d < minDistanceKm) {
        minDistanceKm = d;
      }
    }

    return minDistanceKm === Infinity ? Infinity : Math.round(minDistanceKm * 1000);
  }

  /**
   * Recalculates student walking distances to nearest stop and route corridor in real time.
   * A commuter is considered WALKABLE if:
   *  1) Direct distance to a designated station is <= 500m, OR
   *  2) The active transit corridor road runs directly past them (<= 500m).
   * Colors:
   * 🟢 <= 500m -> WALKABLE (Green)
   * 🟡 500m - 1000m -> MODERATE (Amber)
   * 🔴 > 1000m -> UNDERSERVED (Red)
   */
  private recalculateDemandWalkability(): void {
    if (!this.googleMaps || !this.mapInstance) return;

    // Collect all candidate stops (campus terminal + intermediate stops + rest zone depot)
    const candidateStops: { name: string; lat: number; lng: number }[] = [];
    if (this.campusAnchor) {
      candidateStops.push({ name: `${this.campusAnchor.name} Terminal`, lat: this.campusAnchor.latitude, lng: this.campusAnchor.longitude });
    }
    this.studioStops.forEach(s => {
      candidateStops.push({ name: s.name, lat: s.latitude, lng: s.longitude });
    });
    if (this.restZoneAnchor) {
      candidateStops.push({ name: this.restZoneAnchor.name, lat: this.restZoneAnchor.latitude, lng: this.restZoneAnchor.longitude });
    }

    let walkableCount = 0;
    let moderateCount = 0;
    let underservedCount = 0;

    // Clean up previous markers if list changed
    if (this.demandMarkersMap.size !== this.demandPoints.length) {
      this.demandMarkersMap.forEach(m => m.setMap(null));
      this.demandMarkersMap.clear();
    }

    this.demandPoints.forEach((student) => {
      let minStopDistanceKm = Infinity;
      let closestStopName = this.campusAnchor ? `${this.campusAnchor.name} Terminal` : "Campus Terminal";

      if (candidateStops.length > 0) {
        for (const st of candidateStops) {
          const dist = calculateHaversineDistanceKm(student.latitude, student.longitude, st.lat, st.lng);
          if (dist < minStopDistanceKm) {
            minStopDistanceKm = dist;
            closestStopName = st.name;
          }
        }
      } else {
        minStopDistanceKm = 2.5;
      }

      const stopDistMeters = Math.round(minStopDistanceKm * 1000);
      const routeDistMeters = this.getDistanceToPathMeters(student.latitude, student.longitude);

      // Effective access distance is the closer of nearest stop or active road corridor proximity
      const effectiveDistMeters = Math.min(stopDistMeters, routeDistMeters);

      student.walkDistanceMeters = effectiveDistMeters;
      student.routeProximityMeters = routeDistMeters;
      student.stopDistanceMeters = stopDistMeters;
      student.nearestStopName = closestStopName;

      if (effectiveDistMeters <= 500) {
        student.walkStatus = "WALKABLE";
        walkableCount++;
      } else if (effectiveDistMeters <= 1000) {
        student.walkStatus = "MODERATE";
        moderateCount++;
      } else {
        student.walkStatus = "UNDERSERVED";
        underservedCount++;
      }

      // Render / update marker
      let marker = this.demandMarkersMap.get(student.id);
      const iconUrl = createDemandDotSvg(student.walkStatus);

      if (!marker) {
        marker = new this.googleMaps.maps.Marker({
          position: { lat: student.latitude, lng: student.longitude },
          map: this.mapInstance,
          icon: {
            url: iconUrl,
            scaledSize: new this.googleMaps.maps.Size(22, 22),
            anchor: new this.googleMaps.maps.Point(11, 11),
          },
          visible: this.isDemandLayerVisible,
          zIndex: student.walkStatus === "UNDERSERVED" ? 30 : 10,
        });

        marker.addListener("click", () => {
          const isDirectlyOnRoute = routeDistMeters <= 500;
          const statusBadge =
            student.walkStatus === "WALKABLE"
              ? `<span style="background: #D1FAE5; color: #065F46; padding: 2px 7px; border-radius: 6px; font-weight: 800; font-size: 10px;">🟢 WALKABLE (&lt;500m)</span>`
              : student.walkStatus === "MODERATE"
              ? `<span style="background: #FEF3C7; color: #92400E; padding: 2px 7px; border-radius: 6px; font-weight: 800; font-size: 10px;">🟡 MODERATE (500m-1km)</span>`
              : `<span style="background: #FEE2E2; color: #991B1B; padding: 2px 7px; border-radius: 6px; font-weight: 800; font-size: 10px;">🔴 UNDERSERVED (&gt;1km)</span>`;

          const content = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 4px; min-width: 220px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 4px;">
                <span style="font-size: 10px; font-weight: 800; color: #6B7280; text-transform: uppercase;">Student Demand Pin</span>
                ${statusBadge}
              </div>
              <div style="font-size: 13px; font-weight: 900; color: #111827;">${student.name}</div>
              <div style="font-size: 11px; color: #6B7280; margin-top: 1px;">${student.department} • ${student.semester}</div>
              <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #374151; display: flex; flex-direction: column; gap: 3px;">
                <div>Corridor Proximity: <strong style="${isDirectlyOnRoute ? 'color: #059669;' : ''}">${routeDistMeters < 1000 ? `~${routeDistMeters}m (Along Active Corridor)` : `${(routeDistMeters / 1000).toFixed(1)} km`}</strong></div>
                <div>Nearest Stop: <strong>${student.nearestStopName}</strong> (~${stopDistMeters < 1000 ? `${stopDistMeters}m` : `${(stopDistMeters / 1000).toFixed(1)} km`})</div>
              </div>
              ${isDirectlyOnRoute && stopDistMeters > 500 ? `
                <div style="margin-top: 6px; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 5px 8px; font-size: 10px; color: #065F46; line-height: 1.35;">
                  💡 <strong>Direct Corridor Access:</strong> Bus travels along this road! Click <strong>"Place Stops"</strong> to formalize a boarding stop here.
                </div>
              ` : ''}
            </div>
          `;
          this.showInfoWindow(marker.getPosition(), content);
        });

        this.demandMarkersMap.set(student.id, marker);
      } else {
        marker.setIcon({
          url: iconUrl,
          scaledSize: new this.googleMaps.maps.Size(22, 22),
          anchor: new this.googleMaps.maps.Point(11, 11),
        });
        marker.setZIndex(student.walkStatus === "UNDERSERVED" ? 30 : 10);
        marker.setVisible(this.isDemandLayerVisible);
      }
    });

    const total = this.demandPoints.length;
    const walkablePercent = total > 0 ? Math.round((walkableCount / total) * 100) : 0;

    if (this.config.onDemandMetricsCalculated) {
      this.config.onDemandMetricsCalculated({
        total,
        walkable: walkableCount,
        moderate: moderateCount,
        underserved: underservedCount,
        walkablePercent,
      });
    }
  }

  /**
   * Recalculates road geometry along Google Maps road network
   * from Campus Terminal -> Stop 1 -> ... -> Stop N -> Rest Depot
   */
  public async recalculateRoutePath(): Promise<void> {
    if (!this.googleMaps || !this.mapInstance || !this.directionsService) return;

    const points: { lat: number; lng: number }[] = [];
    if (this.campusAnchor) {
      points.push({ lat: this.campusAnchor.latitude, lng: this.campusAnchor.longitude });
    }
    this.studioStops.forEach(s => {
      points.push({ lat: s.latitude, lng: s.longitude });
    });
    if (this.restZoneAnchor) {
      points.push({ lat: this.restZoneAnchor.latitude, lng: this.restZoneAnchor.longitude });
    }

    if (points.length < 2) {
      this.clearPolylines();
      return;
    }

    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1).map(p => ({
      location: new this.googleMaps.maps.LatLng(p.lat, p.lng),
      stopover: true,
    }));

    const coordsParam = points.map(p => `${p.lat},${p.lng}`).join(";");

    // 1. Primary: High-precision road snapper using official Google Routes API via /api/geo/directions
    try {
      const res = await fetch(`/api/geo/directions?mode=drive&coords=${encodeURIComponent(coordsParam)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.coordinates) && data.coordinates.length >= 2 && data.provider !== "fallback_waypoints") {
          const roadLatLngs = data.coordinates.map((c: [number, number]) => new this.googleMaps.maps.LatLng(c[0], c[1]));
          this.renderOverviewPath(roadLatLngs);
          if (this.config.onRouteMetricsCalculated && data.distanceMeters) {
            const distanceKm = parseFloat((data.distanceMeters / 1000).toFixed(1));
            const durationMins = Math.round((data.durationSeconds || 1800) / 60) + (this.studioStops.length * 2);
            this.config.onRouteMetricsCalculated({ distanceKm, durationMins });
          }
          return;
        }
      }
    } catch (err) {
      console.warn("[TransitStudioMapController] Server road geometry error:", err);
    }

    // 2. Secondary: Client-side DirectionsService fallback
    if (this.directionsService) {
      try {
        this.directionsService.route(
          {
            origin: new this.googleMaps.maps.LatLng(origin.lat, origin.lng),
            destination: new this.googleMaps.maps.LatLng(destination.lat, destination.lng),
            waypoints: waypoints.slice(0, 23), // Google Directions API allows up to 25 total waypoints
            travelMode: this.googleMaps.maps.TravelMode.DRIVING,
          },
          (result: any, status: any) => {
            if (status === "OK" && result?.routes?.[0]?.overview_path) {
              this.renderOverviewPath(result.routes[0].overview_path);

              // Compute total road distance & duration
              let totalMeters = 0;
              let totalSecs = 0;
              result.routes[0].legs?.forEach((leg: any) => {
                totalMeters += leg.distance?.value || 0;
                totalSecs += leg.duration?.value || 0;
              });

              const distanceKm = parseFloat((totalMeters / 1000).toFixed(1));
              const durationMins = Math.round(totalSecs / 60) + (this.studioStops.length * 2);

              if (this.config.onRouteMetricsCalculated) {
                this.config.onRouteMetricsCalculated({ distanceKm, durationMins });
              }
            } else {
              this.renderOverviewPath(points.map(p => new this.googleMaps.maps.LatLng(p.lat, p.lng)));
            }
          }
        );
        return;
      } catch (err) {
        console.warn("[TransitStudioMapController] Client directions error:", err);
      }
    }

    // 3. Last-resort fallback to points
    this.renderOverviewPath(points.map(p => new this.googleMaps.maps.LatLng(p.lat, p.lng)));
  }

  private renderOverviewPath(path: any[]): void {
    this.clearPolylines();
    this.cachedRoadPath = path || [];

    // High-visibility road casing polyline
    this.roadGlowPolyline = new this.googleMaps.maps.Polyline({
      path,
      strokeColor: "#1E40AF",
      strokeOpacity: 0.25,
      strokeWeight: 10,
      map: this.mapInstance,
      zIndex: 2,
    });

    // Core transit corridor polyline
    this.roadPolyline = new this.googleMaps.maps.Polyline({
      path,
      strokeColor: "#2563EB",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map: this.mapInstance,
      zIndex: 3,
    });

    // Re-evaluate demand walkability against the newly snapped road corridor
    this.recalculateDemandWalkability();
  }

  private clearPolylines(): void {
    this.cachedRoadPath = [];
    if (this.roadPolyline) {
      this.roadPolyline.setMap(null);
      this.roadPolyline = null;
    }
    if (this.roadGlowPolyline) {
      this.roadGlowPolyline.setMap(null);
      this.roadGlowPolyline = null;
    }
  }

  private showInfoWindow(position: any, content: string): void {
    if (!this.infoWindow || !this.mapInstance) return;
    this.infoWindow.setContent(content);
    this.infoWindow.setPosition(position);
    this.infoWindow.open(this.mapInstance);
  }

  /**
   * Fits bounds across Campus, Rest Zone, and all intermediate stops
   */
  public fitRouteBounds(): void {
    if (!this.googleMaps || !this.mapInstance) return;
    const bounds = new this.googleMaps.maps.LatLngBounds();

    let hasPoints = false;
    if (this.campusAnchor) {
      bounds.extend({ lat: this.campusAnchor.latitude, lng: this.campusAnchor.longitude });
      hasPoints = true;
    }
    if (this.restZoneAnchor) {
      bounds.extend({ lat: this.restZoneAnchor.latitude, lng: this.restZoneAnchor.longitude });
      hasPoints = true;
    }
    this.studioStops.forEach(s => {
      bounds.extend({ lat: s.latitude, lng: s.longitude });
      hasPoints = true;
    });

    if (hasPoints) {
      this.mapInstance.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
    }
  }

  /**
   * Disposes of all map resources, markers, listeners, and polylines
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.clearPolylines();

    if (this.campusMarker) {
      this.campusMarker.setMap(null);
      this.campusMarker = null;
    }
    if (this.restZoneMarker) {
      this.restZoneMarker.setMap(null);
      this.restZoneMarker = null;
    }

    this.stopMarkersMap.forEach(m => m.setMap(null));
    this.stopMarkersMap.clear();

    this.demandMarkersMap.forEach(m => m.setMap(null));
    this.demandMarkersMap.clear();

    if (this.infoWindow) {
      this.infoWindow.close();
      this.infoWindow = null;
    }

    this.mapInstance = null;
    this.container = null;
  }
}
