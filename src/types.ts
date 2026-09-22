export type ParsedTrip = {
  days?: number;
  nights?: number;
  adults?: number;
  children?: number;
  budgetVnd?: number;
  interests: string[];
  stayPreferences: string[];
  raw: string;
};

export type TripParseResponse = {
  ok: boolean;
  parsed: ParsedTrip;
  assumptions: string[];
  nextNeeded: string[];
  assistantText?: string;
};

export type StayContextSignal = {
  key: string;
  level: "strong" | "moderate" | "limited";
  evidence: "zone_baseline" | "venue_enriched";
  note: string;
};

export type StayContext = {
  zoneCode: string;
  summary: string;
  signals: StayContextSignal[];
  verifiedVenueCounts: { food: number; cafe: number; attraction: number } | null;
  fitScore: number;
  confidence: number;
  reasons: string[];
  cautions: string[];
};

export type TripScenario = {
  id: string;
  hotelRef: string;
  hotelName: string;
  hotelCostVnd: number;
  mobilityCostVnd: number;
  activityCostVnd: number;
  driveMinutes: number;
  stayFit: number;
  confidence: number;
  stayContext?: StayContext;
  guestReasons: string[];
  cautions: string[];
  metrics: {
    totalCostVnd: number;
    driveMinutes: number;
    stayFit: number;
    confidence: number;
  };
};

export type PlanningHotel = {
  hotel: {
    id: string;
    canonical_name: string;
    slug: string;
    address: string | null;
    area_code: string;
    fit_tags: string[];
  };
  spatialFit: "direct" | "balanced" | "neutral";
  reasons: string[];
  cautions: string[];
  stayContext: StayContext;
};

export type ScenarioInsight = {
  type: "cost_time_tradeoff" | "cheaper" | "faster" | "similar_total" | "fit";
  title: string;
  body: string;
  primaryScenarioId: string;
  secondaryScenarioId?: string;
  data: Record<string, number | string>;
};

export type DestinationKnowledge = {
  id: string;
  title: string;
  type: "FOOD" | "PLACE";
  canonicalEntityId: string | null;
  zones: string[];
  summary: string | null;
  practical: string | null;
  expectation: string | null;
  beforeYouGo: string[];
  address: string | null;
};

export type DestinationVenue = {
  id: string;
  name: string;
  category: string;
  zoneCode: string | null;
  address: string | null;
  phone: string | null;
  priceLevel: string | null;
  tags: string[];
  verifiedAt: string | null;
  distanceKm: number | null;
};

export type DestinationContext = {
  ok: boolean;
  zoneCode: string | null;
  daypart: string | null;
  groups: {
    eat: { knowledge: DestinationKnowledge[]; venues: DestinationVenue[]; dataState: string };
    cafe: { venues: DestinationVenue[]; dataState: string };
    do: { knowledge: DestinationKnowledge[]; venues: DestinationVenue[]; dataState: string };
  };
};

export type TripBuildResponse = {
  ok: boolean;
  mode?: "planning" | "priced";
  referenceDate?: string;
  activityCostVnd?: number;
  warnings?: string[];
  assumptions?: string[];
  nextNeeded?: string[];
  hotelOfferCount?: number;
  planningHotels?: PlanningHotel[];
  stayPreferences?: string[];
  destinationContext?: DestinationContext;
  insights?: ScenarioInsight[];
  scenarios?: TripScenario[];
};
