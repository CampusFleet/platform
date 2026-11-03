/**
 * CampusFleet Object-Oriented Map Controller Framework
 * Abstract Base Class for Map Lifecycle & Layer Management
 */

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export abstract class BaseMapController {
  protected mapInstance: any = null;
  protected container: HTMLElement | null = null;
  protected isDestroyed = false;

  constructor(protected options: { zoom?: number; minZoom?: number; maxZoom?: number } = {}) {}

  /**
   * Initializes the map within the given DOM container
   */
  public abstract initialize(container: HTMLElement, initialCoords: MapCoordinates): Promise<void>;

  /**
   * Pans map to given coordinate
   */
  public panTo(coords: MapCoordinates, duration = 0.4): void {
    if (!this.mapInstance || this.isDestroyed) return;
    this.mapInstance.panTo([coords.latitude, coords.longitude], {
      animate: true,
      duration,
    });
  }

  /**
   * Sets direct view coordinates and zoom
   */
  public setView(coords: MapCoordinates, zoom?: number): void {
    if (!this.mapInstance || this.isDestroyed) return;
    this.mapInstance.setView(
      [coords.latitude, coords.longitude],
      zoom ?? this.options.zoom ?? 15,
      { animate: true }
    );
  }

  /**
   * Zooms in by 1 level
   */
  public zoomIn(): void {
    if (!this.mapInstance || this.isDestroyed) return;
    this.mapInstance.zoomIn();
  }

  /**
   * Zooms out by 1 level
   */
  public zoomOut(): void {
    if (!this.mapInstance || this.isDestroyed) return;
    this.mapInstance.zoomOut();
  }

  /**
   * Disposes of map instance and all attached layers to prevent memory leaks
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }
    this.container = null;
  }
}

