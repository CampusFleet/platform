import { LiveBusLocation, Stop, FleetBusMarkerData, Campus } from "@/lib/types";

export interface RouteMetrics {
  totalDistanceKm: number;
  totalDurationMins: number;
  sourceProvenance: "google_directions_api";
  isGoogleAuthoritative: true;
  isDegradedFallback: false;
  legs: {
    distanceKm: number;
    durationMins: number;
    distanceText: string;
    durationText: string;
  }[];
}

export interface AuthoritativeGoogleDirectionsEnvelope {
  version: "4.0";
  provider: "google";
  sourceProvenance: "google_directions_api";
  isGoogleAuthoritative: true;
  isDegradedFallback: false;
  cachedAt: number;
  directionsResult: google.maps.DirectionsResult;
}

export interface GoogleTransitMapProps {
  apiKey?: string;
  busLocation?: LiveBusLocation;
  busName?: string;
  tripStatus?: string;
  fleetBuses?: FleetBusMarkerData[];
  focusedBusId?: number;
  onBusClick?: (bus: FleetBusMarkerData) => void;
  stops?: Stop[];
  campuses?: Campus[];
  primaryCampus?: Campus | null;
  routeCoordinates?: [number, number][];
  walkingCoordinates?: [number, number][];
  activeStopIndex?: number;
  shortestPathStopIds?: string[];
  selectedStopId?: string;
  isExpressDirect?: boolean;
  expressReason?: string;
  height?: string;
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  onStopClick?: (stop: Stop) => void;
  draftPinLocation?: [number, number] | null;
  draftGeofenceRadius?: number;
  interactiveMode?: "VIEW" | "PIN_DROP";
  showUserLocation?: boolean;
  showCampusLandmark?: boolean;
  tileTheme?: "GOOGLE_STREETS" | "CARTO_VOYAGER" | "CARTO_DARK" | "GOOGLE_HYBRID" | "AUTO";
  onRouteMetricsCalculated?: (metrics: RouteMetrics) => void;
  onError?: (err: any) => void;
}

