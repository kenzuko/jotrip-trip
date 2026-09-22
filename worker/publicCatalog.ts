import catalog from "../data/public-activity-seed.json";

type Rate = {
  audience: string;
  price_vnd: number;
  valid_from?: string | null;
  valid_to?: string | null;
  status?: string;
  benefit?: string;
};

type Product = {
  id: string;
  provider?: string;
  name: string;
  schedule?: string;
  status?: string;
  rates?: Rate[];
  confirmed_current_as_of?: string;
};

function inWindow(rate: Rate, date: string) {
  if (rate.valid_from && date < rate.valid_from) return false;
  if (rate.valid_to && date > rate.valid_to) return false;
  return true;
}

function isUsable(rate: Rate) {
  const status = rate.status || "";
  return !status.startsWith("pending") && status !== "content_received_rate_missing";
}

export function quotePublicActivity(
  productId: string,
  audience: string,
  date: string,
) {
  const product = (catalog.products as Product[]).find((p) => p.id === productId);
  if (!product) return { ok: false, error: "product_not_found" };

  const candidates = (product.rates || [])
    .filter((rate) => rate.audience === audience)
    .filter(isUsable)
    .filter((rate) => inWindow(rate, date))
    .sort((a, b) => String(b.valid_from || "").localeCompare(String(a.valid_from || "")));

  const rate = candidates[0];
  if (!rate) {
    return {
      ok: false,
      error: "rate_not_available_for_date_or_audience",
      product: { id: product.id, name: product.name },
    };
  }

  return {
    ok: true,
    product: {
      id: product.id,
      name: product.name,
      provider: product.provider,
      schedule: product.schedule,
    },
    audience,
    date,
    priceVnd: rate.price_vnd,
    benefit: rate.benefit || null,
    validFrom: rate.valid_from || null,
    validTo: rate.valid_to || null,
    sourceStatus: rate.status || null,
    confirmedCurrentAsOf: product.confirmed_current_as_of || null,
  };
}
