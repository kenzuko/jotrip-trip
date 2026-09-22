import catalog from "../data/public-hotels-v0.json";

export type PlanningHotel = {
  id: string;
  canonical_name: string;
  slug: string;
  address: string | null;
  area_code: string;
  fit_tags: string[];
  public_status: string;
};

type MatchResult = {
  hotel: PlanningHotel;
  spatialFit: "direct" | "balanced" | "neutral";
  reasons: string[];
  cautions: string[];
};

function preferredTags(interests: string[]) {
  const tags = new Set<string>();

  if (interests.includes("VinWonders") || interests.includes("Safari")) {
    tags.add("north");
  }
  if (interests.includes("Hòn Thơm") || interests.includes("Sunset Town")) {
    tags.add("south");
  }
  if (interests.includes("Chợ đêm")) {
    tags.add("duong-dong");
    tags.add("local-access");
  }

  return tags;
}

export function matchPlanningHotels(
  interests: string[],
  maxResults = 4,
): MatchResult[] {
  const wanted = preferredTags(interests);
  const hotels = catalog.hotels as PlanningHotel[];

  const scored = hotels
    .map((hotel) => {
      const tagSet = new Set(hotel.fit_tags || []);
      let score = 0;
      const reasons: string[] = [];
      const cautions: string[] = [];

      for (const tag of wanted) {
        if (tagSet.has(tag)) score += 25;
      }

      if (wanted.has("north") && tagSet.has("north")) {
        reasons.push("Cùng khu phía Bắc với VinWonders, Safari và Grand World.");
      }
      if (wanted.has("south") && tagSet.has("south")) {
        reasons.push("Thuận khu phía Nam cho Hòn Thơm và Sunset Town.");
      }
      if (wanted.has("duong-dong") && tagSet.has("duong-dong")) {
        reasons.push("Thuận Dương Đông và các hoạt động buổi tối ở trung tâm.");
      }

      if (wanted.size === 0 && tagSet.has("balanced")) {
        score += 15;
        reasons.push("Vị trí Bãi Trường phù hợp khi lịch trình chưa nghiêng hẳn về Bắc hay Nam.");
      }

      if (wanted.has("north") && tagSet.has("south")) {
        cautions.push("Nếu trọng tâm là VinWonders/Safari, khu phía Nam sẽ phát sinh quãng đường dài hơn.");
      }
      if (wanted.has("south") && tagSet.has("north")) {
        cautions.push("Nếu trọng tâm là Hòn Thơm/Sunset Town, khu phía Bắc sẽ phát sinh quãng đường dài hơn.");
      }

      if (hotel.area_code === "unknown") {
        score -= 20;
        cautions.push("Vị trí công khai của khách sạn chưa được chuẩn hóa trong catalog V0.");
      }

      const spatialFit: MatchResult["spatialFit"] =
        score >= 25 ? "direct" : tagSet.has("balanced") ? "balanced" : "neutral";

      return { hotel, spatialFit, reasons, cautions, score };
    })
    .sort((a, b) => b.score - a.score || a.hotel.canonical_name.localeCompare(b.hotel.canonical_name));

  const direct = scored.filter((item) => item.score > 0);
  const fallback = scored.filter((item) => item.score <= 0 && item.hotel.area_code !== "unknown");

  return [...direct, ...fallback]
    .slice(0, maxResults)
    .map(({ score: _score, ...item }) => item);
}
