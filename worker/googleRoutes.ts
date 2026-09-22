type Env = {
  GOOGLE_MAPS_API_KEY?: string;
};

export type GoogleRoutePoint = {
  id: string;
  label: string;
  address?: string | null;
  placeId?: string | null;
};

export type GoogleRouteFact = {
  originId: string;
  destinationId: string;
  distanceKm: number;
  minutes: number;
  staticMinutes: number | null;
  trafficAware: boolean;
  source: "google_maps";
  attribution: "Google Maps";
  checkedAt: string;
};

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  condition?: string;
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  status?: { code?: number; message?: string };
};

function waypoint(point: GoogleRoutePoint) {
  if (point.placeId) return { placeId: point.placeId };
  if (point.address) return { address: point.address };
  return null;
}

function seconds(value?: string) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/s$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Server-side Google Maps Routes API adapter.
 *
 * Important:
 * - Do not expose GOOGLE_MAPS_API_KEY to the browser.
 * - Do not persist Google route content to D1 as a permanent route database.
 *   Google Maps Platform restricts caching of most Routes API content.
 * - Place IDs may be stored and should become the preferred canonical locator.
 * - Any Google route fact rendered to a traveler must carry Google Maps attribution.
 */
export async function computeGoogleRouteMatrix(
  env: Env,
  origins: GoogleRoutePoint[],
  destinations: GoogleRoutePoint[],
  options: { trafficAware?: boolean } = {},
) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return {
      ok: false as const,
      error: "google_maps_not_configured",
      facts: [] as GoogleRouteFact[],
    };
  }

  const cleanOrigins = origins.filter((item) => waypoint(item));
  const cleanDestinations = destinations.filter((item) => waypoint(item));

  if (!cleanOrigins.length || !cleanDestinations.length) {
    return {
      ok: false as const,
      error: "route_points_required",
      facts: [] as GoogleRouteFact[],
    };
  }

  const elements = cleanOrigins.length * cleanDestinations.length;
  if (elements > 625 || cleanOrigins.length + cleanDestinations.length > 50) {
    return {
      ok: false as const,
      error: "route_matrix_too_large",
      facts: [] as GoogleRouteFact[],
    };
  }

  const trafficAware = Boolean(options.trafficAware);

  const response = await fetch(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,status,condition,distanceMeters,duration,staticDuration",
      },
      body: JSON.stringify({
        origins: cleanOrigins.map((item) => ({ waypoint: waypoint(item) })),
        destinations: cleanDestinations.map((item) => ({ waypoint: waypoint(item) })),
        travelMode: "DRIVE",
        routingPreference: trafficAware ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
        languageCode: "vi",
        regionCode: "VN",
        units: "METRIC",
      }),
    },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      error: "google_routes_failed",
      status: response.status,
      facts: [] as GoogleRouteFact[],
    };
  }

  const rows = (await response.json()) as MatrixElement[];
  const checkedAt = new Date().toISOString();
  const facts: GoogleRouteFact[] = [];

  for (const row of rows) {
    if (
      row.condition !== "ROUTE_EXISTS" ||
      row.status?.code ||
      row.originIndex == null ||
      row.destinationIndex == null ||
      row.distanceMeters == null
    ) {
      continue;
    }

    const durationSeconds = seconds(row.duration);
    if (durationSeconds == null) continue;

    const staticSeconds = seconds(row.staticDuration);
    const origin = cleanOrigins[row.originIndex];
    const destination = cleanDestinations[row.destinationIndex];
    if (!origin || !destination) continue;

    facts.push({
      originId: origin.id,
      destinationId: destination.id,
      distanceKm: Math.round((row.distanceMeters / 1000) * 10) / 10,
      minutes: Math.max(1, Math.round(durationSeconds / 60)),
      staticMinutes:
        staticSeconds == null ? null : Math.max(1, Math.round(staticSeconds / 60)),
      trafficAware,
      source: "google_maps",
      attribution: "Google Maps",
      checkedAt,
    });
  }

  return {
    ok: true as const,
    facts,
    trafficAware,
    checkedAt,
  };
}
