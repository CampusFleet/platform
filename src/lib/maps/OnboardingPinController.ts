/**
 * CampusFleet Object-Oriented Onboarding Pin Map Controller
 * Specialized subclass of BaseMapController for Commuter Doorstep Pin Drop
 * Modeled after MyJio / Uber / Swiggy modern location pickers
 */

import { BaseMapController, MapCoordinates } from "./BaseMapController";
import { Stop } from "@/lib/types";

export interface OnboardingPinControllerConfig {
  zoom?: number;
  onLocationChange: (coords: MapCoordinates) => void;
}

export class OnboardingPinController extends BaseMapController {
  private homeMarker: any = null;
  private stopMarker: any = null;
  private walkingPolyline: any = null;
  private gpsMarker: any = null;
  private leafletModule: any = null;
  private currentHomeCoords: MapCoordinates = { latitude: 29.220936, longitude: 79.514496 };

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
   * Sets the matched pickup stop and connects it to the home pin with a pedestrian walking line
   */
  public setPickupStop(stop?: Stop | null, distMeters?: number, walkMins?: number): void {
    if (this.isDestroyed || !this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

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
          <div class="px-2.5 py-0.5 rounded-full bg-blue-900/95 text-white text-[10px] font-bold shadow-xl border border-blue-400/30 whitespace-nowrap mb-1 flex items-center gap-1">
            <span>🚏</span>
            <span class="max-w-[130px] truncate">${stop.name}</span>
          </div>
          <div class="relative flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white ring-2 ring-blue-400/50">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"></circle>
                <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
              </svg>
            </div>
            <div class="absolute -bottom-1 w-2 h-2 rotate-45 bg-blue-700"></div>
          </div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    this.stopMarker = L.marker([stop.latitude, stop.longitude], {
      icon: stopIcon,
      zIndexOffset: 800,
    }).addTo(this.mapInstance);

    this.updateWalkingLine(stop, distMeters, walkMins);
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
   * Uses browser geolocation to locate device and drop home pin
   */
  public async locateCurrentDevice(): Promise<MapCoordinates> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const coords: MapCoordinates = { latitude: lat, longitude: lng };

          this.setHomePin(coords, true);
          this.config.onLocationChange(coords);
          resolve(coords);
        },
        err => reject(err),
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

    const marker = L.marker([this.currentHomeCoords.latitude, this.currentHomeCoords.longitude], {
      icon: homeIcon,
      draggable: true,
      autoPan: true,
      zIndexOffset: 1500,
    }).addTo(this.mapInstance);

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
   * Draws/updates the pedestrian walking path between Home Pin and Assigned Stop
   */
  private updateWalkingLine(stop?: Stop | null, distMeters?: number, walkMins?: number): void {
    if (!this.mapInstance || !this.leafletModule) return;
    const L = this.leafletModule;

    const targetStop = stop || (this.stopMarker ? { latitude: this.stopMarker.getLatLng().lat, longitude: this.stopMarker.getLatLng().lng } : null);
    if (!targetStop) {
      this.clearWalkingLine();
      return;
    }

    this.clearWalkingLine();

    const line = L.polyline(
      [
        [this.currentHomeCoords.latitude, this.currentHomeCoords.longitude],
        [targetStop.latitude, targetStop.longitude],
      ],
      {
        color: "#10B981",
        weight: 3.5,
        dashArray: "6, 8",
        opacity: 0.85,
        lineCap: "round",
      }
    ).addTo(this.mapInstance);

    if (distMeters && walkMins) {
      line.bindTooltip(`${distMeters}m • ~${walkMins}m walk`, {
        permanent: true,
        direction: "center",
        className: "custom-walking-tooltip",
      });
    }

    this.walkingPolyline = line;
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
    this.clearWalkingLine();
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

