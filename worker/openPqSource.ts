import seed from "../data/destination-knowledge-v0.json";

type SeedItem = (typeof seed.items)[number];

type OpenPqObject = {
  topic_id?: string;
  title?: string;
  topic_type?: string;
  status?: string;
  canonical_entity_id?: string | null;
  editorial?: {
    short_summary?: string | null;
    practical?: string | null;
    expectation_vs_reality?: string | null;
    before_you_go?: string[];
  };
  operational_refs?: {
    map?: {
      lat?: number;
      lon?: number;
      precision?: string | null;
    };
    address?: string | null;
  };
  updated_at?: string;
};

type CachedKnowledge = {
  expiresAt: number;
  sourceState: "openpq_live" | "bundled_fallback";
  items: SeedItem[];
};

const OPENPQ_RAW =
  "https://raw.githubusercontent.com/kenzuko/jotrip-home/main/data/knowledge/objects.json";

let cache: CachedKnowledge | null = null;

function mergeLive(seedItem: SeedItem, live?: OpenPqObject): SeedItem {
  if (!live || live.status !== "READY_INTERNAL") return seedItem;

  const liveMap = live.operational_refs?.map;
  const map =
    liveMap &&
    Number.isFinite(liveMap.lat) &&
    Number.isFinite(liveMap.lon)
      ? {
          lat: Number(liveMap.lat),
          lon: Number(liveMap.lon),
          precision: liveMap.precision || null,
        }
      : seedItem.map;

  return {
    ...seedItem,
    title: live.title || seedItem.title,
    canonicalEntityId: live.canonical_entity_id ?? seedItem.canonicalEntityId,
    summary: live.editorial?.short_summary ?? seedItem.summary,
    practical: live.editorial?.practical ?? seedItem.practical,
    expectation:
      live.editorial?.expectation_vs_reality ?? seedItem.expectation,
    beforeYouGo: Array.isArray(live.editorial?.before_you_go)
      ? live.editorial!.before_you_go!
      : seedItem.beforeYouGo,
    map,
    address: live.operational_refs?.address ?? seedItem.address,
    updatedAt: live.updated_at || seedItem.updatedAt,
  };
}

export async function loadDestinationKnowledge(): Promise<CachedKnowledge> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  try {
    const response = await fetch(OPENPQ_RAW, {
      headers: { "user-agent": "JoTrip-Trip/1.0" },
    });

    if (!response.ok) {
      throw new Error(`openpq_http_${response.status}`);
    }

    const doc = (await response.json()) as { objects?: OpenPqObject[] };
    const liveById = new Map(
      (doc.objects || [])
        .filter((item) => item.topic_id)
        .map((item) => [String(item.topic_id), item]),
    );

    cache = {
      expiresAt: now + 10 * 60 * 1000,
      sourceState: "openpq_live",
      items: (seed.items as SeedItem[]).map((item) =>
        mergeLive(item, liveById.get(item.id)),
      ),
    };

    return cache;
  } catch (error) {
    console.warn("openpq_knowledge_fallback", error);
    cache = {
      expiresAt: now + 2 * 60 * 1000,
      sourceState: "bundled_fallback",
      items: seed.items as SeedItem[],
    };
    return cache;
  }
}
