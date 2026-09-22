export type ParsedTrip = {
  days?: number;
  nights?: number;
  adults?: number;
  children?: number;
  budgetVnd?: number;
  interests: string[];
  raw: string;
};

export type TripParseResponse = {
  ok: boolean;
  parsed: ParsedTrip;
  assumptions: string[];
  nextNeeded: string[];
  assistantText?: string;
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
};

export type ScenarioInsight = {
  type: "cost_time_tradeoff" | "cheaper" | "faster" | "similar_total" | "fit";
  title: string;
  body: string;
  primaryScenarioId: string;
  secondaryScenarioId?: string;
  data: Record<string, number | string>;
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
  insights?: ScenarioInsight[];
  scenarios?: TripScenario[];
};
