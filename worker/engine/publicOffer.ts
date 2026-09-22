export type PublicDisplayPolicy =
  | "SHOW"
  | "FROM_PRICE"
  | "QUERY_ONLY"
  | "PACKAGE_ONLY"
  | "PRIVATE_ONLY";

export type PricingInputs = {
  effectivePrivateNetVnd: number;
  benchmarkPriceVnd: number;
  publicDisplayPolicy: PublicDisplayPolicy;
  minimumMarginVnd?: number;
  minimumMarginPct?: number;
  targetAdvantagePct?: number;
  targetAdvantageVnd?: number;
  roundToVnd?: number;
};

export type PricingDecision =
  | {
      ok: true;
      sellPriceVnd: number;
      benchmarkPriceVnd: number;
      savingVnd: number;
      grossMarginVnd: number;
      grossMarginPct: number;
      publicDisplayPolicy: PublicDisplayPolicy;
      reason: "priced_below_comparable_market";
    }
  | {
      ok: false;
      reason:
        | "invalid_input"
        | "private_only"
        | "package_only"
        | "benchmark_below_private_floor"
        | "margin_guard_not_met";
      publicDisplayPolicy: PublicDisplayPolicy;
    };

function roundDown(value: number, increment: number) {
  const step = Math.max(1, Math.round(increment));
  return Math.floor(value / step) * step;
}

/**
 * Chooses the HIGHEST profitable JoTrip sell price that still preserves
 * a visible advantage against a comparable market benchmark.
 *
 * It never exposes or returns the private net in a public payload.
 */
export function decidePublicHotelPrice(input: PricingInputs): PricingDecision {
  const floor = Math.round(input.effectivePrivateNetVnd);
  const benchmark = Math.round(input.benchmarkPriceVnd);
  const policy = input.publicDisplayPolicy;

  if (policy === "PRIVATE_ONLY") return { ok: false, reason: "private_only", publicDisplayPolicy: policy };
  if (policy === "PACKAGE_ONLY") return { ok: false, reason: "package_only", publicDisplayPolicy: policy };

  if (!Number.isFinite(floor) || !Number.isFinite(benchmark) || floor <= 0 || benchmark <= 0) {
    return { ok: false, reason: "invalid_input", publicDisplayPolicy: policy };
  }

  if (benchmark <= floor) {
    return { ok: false, reason: "benchmark_below_private_floor", publicDisplayPolicy: policy };
  }

  const advantagePct = Math.max(0, input.targetAdvantagePct ?? 0.03);
  const advantageVnd = Math.max(0, input.targetAdvantageVnd ?? 0);
  const roundTo = Math.max(1, input.roundToVnd ?? 10_000);

  const targetByPct = benchmark * (1 - advantagePct);
  const targetByVnd = benchmark - advantageVnd;
  const targetSell = roundDown(Math.min(targetByPct, targetByVnd), roundTo);

  const minMarginVnd = Math.max(0, input.minimumMarginVnd ?? 0);
  const minMarginPct = Math.max(0, input.minimumMarginPct ?? 0);
  const requiredSell = Math.max(
    floor + minMarginVnd,
    floor * (1 + minMarginPct),
  );

  if (targetSell < requiredSell) {
    return { ok: false, reason: "margin_guard_not_met", publicDisplayPolicy: policy };
  }

  const grossMarginVnd = targetSell - floor;
  const grossMarginPct = grossMarginVnd / targetSell;

  return {
    ok: true,
    sellPriceVnd: targetSell,
    benchmarkPriceVnd: benchmark,
    savingVnd: benchmark - targetSell,
    grossMarginVnd,
    grossMarginPct,
    publicDisplayPolicy: policy,
    reason: "priced_below_comparable_market",
  };
}
