import snapshot from "../data/destination-venues-v0.json";

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

export async function loadOpenPqVenues() {
  return {
    expiresAt:Number.MAX_SAFE_INTEGER,
    rows:(snapshot.entities || []) as OpenPqVenue[],
    state:"bundled_test_snapshot" as const,
  };
}
