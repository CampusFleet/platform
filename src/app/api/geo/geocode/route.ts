import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/geo/geocode?address=...
 * Forward Geocoding: Converts street address / locality name to latitude & longitude coordinates.
 * 1. Google Maps Geocoding API (if key present in env)
 * 2. OpenStreetMap Nominatim API (open-source fallback)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address")?.trim();

    if (!address) {
      return NextResponse.json(
        { success: false, message: "Missing address query parameter." },
        { status: 400 }
      );
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // 1. Google Geocoding API
    if (googleKey) {
      try {
        const googleRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (googleRes.ok) {
          const data = await googleRes.json();
          if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
            const result = data.results[0];
            return NextResponse.json({
              success: true,
              latitude: result.geometry.location.lat,
              longitude: result.geometry.location.lng,
              formattedAddress: result.formatted_address,
              provider: "google",
            });
          }
        }
      } catch (gErr) {
        console.warn("[geocode] Google API failed or timed out, falling back:", gErr);
      }
    }

    // 2. OpenStreetMap Nominatim Fallback
    try {
      const osmRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            "User-Agent": "CampusFleet-Transit-Geocode/1.0 (transit@campusfleet.local)",
          },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (osmRes.ok) {
        const osmData = await osmRes.json();
        if (Array.isArray(osmData) && osmData.length > 0) {
          const item = osmData[0];
          return NextResponse.json({
            success: true,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
            formattedAddress: item.display_name,
            provider: "osm_nominatim",
          });
        }
      }
    } catch (osmErr) {
      console.warn("[geocode] OSM Nominatim fallback error:", osmErr);
    }

    return NextResponse.json(
      {
        success: false,
        message: `Could not find geographic coordinates for address: "${address}". Please try with city or landmark name.`,
      },
      { status: 404 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to geocode address." },
      { status: 500 }
    );
  }
}

