export type OpenPqVenue = {
  id: string;
  name: string;
  category: "LOCAL_FOOD" | "RESTAURANT" | "CAFE" | "ATTRACTION";
  zone_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  phone?: string | null;
  tags?: string[];
  opening_hours?: unknown;
  price_level?: string | null;
  source_ref?: string | null;
  source_type?: string | null;
  verified_at?: string | null;
  status?: "ACTIVE" | "CLOSED" | "REVIEW";
};

const URL =
  "https://raw.githubusercontent.com/kenzuko/jotrip-home/main/data/entities/destination-venues.json";

let cache:
  | { expiresAt: number; rows: OpenPqVenue[]; state: "openpq_live" | "unavailable" }
  | null = null;

export async function loadOpenPqVenues() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  try {
    const response = await fetch(URL, {
      headers: { "user-agent": "JoTrip-Trip/1.0" },
    });
    if (!response.ok) throw new Error(`openpq_venue_http_${response.status}`);

    const doc = (await response.json()) as { entities?: OpenPqVenue[] };
    const rows = (doc.entities || []).filter(
      (row) =>
        row?.id &&
        row?.name &&
        ["LOCAL_FOOD", "RESTAURANT", "CAFE", "ATTRACTION"].includes(row.category),
    );

    cache = {
      expiresAt: now + 5 * 60 * 1000,
      rows,
      state: "openpq_live",
    };
    return cache;
  } catch (error) {
    console.warn("openpq_venue_source_unavailable", error);
    cache = {
      expiresAt: now + 60 * 1000,
      rows: [],
      state: "unavailable",
    };
    return cache;
  }
}
