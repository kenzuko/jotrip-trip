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
};
