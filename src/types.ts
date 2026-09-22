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

export type TripBuildResponse = {
  ok: boolean;
  mode?: "planning" | "priced";
  referenceDate?: string;
  activityCostVnd?: number;
  warnings?: string[];
  assumptions?: string[];
  nextNeeded?: string[];
  hotelOfferCount?: number;
  scenarios?: TripScenario[];
};
