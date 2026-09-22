export type DiscountRule =
  | { type: "PERCENT"; value: number }
  | { type: "FIXED_VND"; value: number };

export type InternalHotelRate = {
  marketScope: string;
  baseNetVnd: number;
  discount?: DiscountRule;
};

function normalizeMarket(value: string) {
  return value.trim().toUpperCase().replace(/[\s_-]+/g, "_");
}

export function isSafeAllMarketRate(rate: InternalHotelRate) {
  const market = normalizeMarket(rate.marketScope);
  return market === "ALL" || market === "ALL_MARKET" || market === "ALL_MARKETS";
}

/**
 * PRIVATE ONLY.
 * Current V0 policy: only ALL MARKET rate blocks are eligible automatically.
 * A single applicable discount may reduce the internal floor. Discount stacking
 * is intentionally unsupported until source rules are normalized explicitly.
 */
export function effectivePrivateNet(rate: InternalHotelRate) {
  if (!isSafeAllMarketRate(rate)) {
    throw new Error("rate_not_all_market");
  }

  const base = Math.max(0, Math.round(rate.baseNetVnd));
  if (!rate.discount) return base;

  if (rate.discount.type === "PERCENT") {
    const pct = Math.min(100, Math.max(0, rate.discount.value));
    return Math.max(0, Math.round(base * (1 - pct / 100)));
  }

  return Math.max(0, base - Math.max(0, Math.round(rate.discount.value)));
}

export function assertPublicSellPrice(sellPriceVnd: number, privateNetVnd: number) {
  const sell = Math.round(sellPriceVnd);
  if (sell < privateNetVnd) throw new Error("sell_below_private_floor");
  return sell;
}
