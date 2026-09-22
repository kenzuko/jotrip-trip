export type ScenarioMetrics = {
  totalCostVnd: number;
  driveMinutes: number;
  stayFit: number; // 0..100, higher is better
  confidence: number; // 0..100, higher is better
};

export type ScenarioLike = {
  id: string;
  metrics: ScenarioMetrics;
};

function noWorse(a: ScenarioMetrics, b: ScenarioMetrics) {
  return (
    a.totalCostVnd <= b.totalCostVnd &&
    a.driveMinutes <= b.driveMinutes &&
    a.stayFit >= b.stayFit &&
    a.confidence >= b.confidence
  );
}

function strictlyBetterSomewhere(a: ScenarioMetrics, b: ScenarioMetrics) {
  return (
    a.totalCostVnd < b.totalCostVnd ||
    a.driveMinutes < b.driveMinutes ||
    a.stayFit > b.stayFit ||
    a.confidence > b.confidence
  );
}

export function dominates(a: ScenarioLike, b: ScenarioLike) {
  return noWorse(a.metrics, b.metrics) && strictlyBetterSomewhere(a.metrics, b.metrics);
}

export function paretoFrontier<T extends ScenarioLike>(items: T[]) {
  return items.filter(
    (candidate, index) =>
      !items.some(
        (other, otherIndex) =>
          otherIndex !== index && dominates(other, candidate),
      ),
  );
}
