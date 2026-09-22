import { paretoFrontier } from "./pareto";

export type TripScenario = {
  id: string;
  hotelRef: string;
  hotelName: string;
  hotelCostVnd: number;
  mobilityCostVnd: number;
  activityCostVnd: number;
  otherCostVnd?: number;
  driveMinutes: number;
  stayFit: number;
  confidence: number;
  guestReasons: string[];
  cautions: string[];
  commercialScore?: number; // private tie-break only; never shown to guest
  metrics: {
    totalCostVnd: number;
    driveMinutes: number;
    stayFit: number;
    confidence: number;
  };
};

export type TripScenarioInput = Omit<TripScenario, "metrics">;

export function buildScenario(input: TripScenarioInput): TripScenario {
  const totalCostVnd =
    input.hotelCostVnd +
    input.mobilityCostVnd +
    input.activityCostVnd +
    (input.otherCostVnd || 0);

  return {
    ...input,
    metrics: {
      totalCostVnd,
      driveMinutes: input.driveMinutes,
      stayFit: input.stayFit,
      confidence: input.confidence,
    },
  };
}

/**
 * Guest suitability always comes first.
 * Commercial score is allowed only as a tie-break among already-good options.
 */
export function selectMeaningfulScenarios(
  inputs: TripScenarioInput[],
  options: {
    minimumStayFit?: number;
    minimumConfidence?: number;
    maxResults?: number;
  } = {},
) {
  const minimumStayFit = options.minimumStayFit ?? 50;
  const minimumConfidence = options.minimumConfidence ?? 50;
  const maxResults = options.maxResults ?? 4;

  const valid = inputs
    .map(buildScenario)
    .filter(
      (item) =>
        item.stayFit >= minimumStayFit &&
        item.confidence >= minimumConfidence,
    );

  const frontier = paretoFrontier(valid);

  return frontier
    .sort((a, b) => {
      if (b.stayFit !== a.stayFit) return b.stayFit - a.stayFit;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (
        typeof a.commercialScore === "number" &&
        typeof b.commercialScore === "number" &&
        b.commercialScore !== a.commercialScore
      ) {
        return b.commercialScore - a.commercialScore;
      }
      return a.metrics.totalCostVnd - b.metrics.totalCostVnd;
    })
    .slice(0, maxResults);
}

export function compareScenarios(a: TripScenario, b: TripScenario) {
  return {
    costDeltaVnd: a.metrics.totalCostVnd - b.metrics.totalCostVnd,
    driveDeltaMinutes: a.driveMinutes - b.driveMinutes,
    stayFitDelta: a.stayFit - b.stayFit,
    confidenceDelta: a.confidence - b.confidence,
  };
}
