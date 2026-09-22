import { loadOpenPqVenues } from "../openPqVenueSource";

type Env = { DB?: D1Database };

export type StayPreference =
  | "food"
  | "cafe"
  | "evening"
  | "walkable"
  | "quiet"
  | "local"
  | "family"
  | "airport";

export type StayContextSignal = {
  key: StayPreference;
  level: "strong" | "moderate" | "limited";
  evidence: "zone_baseline" | "venue_enriched";
  note: string;
};

export type StayContext = {
  zoneCode: string;
  summary: string;
  signals: StayContextSignal[];
  verifiedVenueCounts: {
    food: number;
    cafe: number;
    attraction: number;
  } | null;
  fitScore: number;
  confidence: number;
  reasons: string[];
  cautions: string[];
};

const LEVEL_SCORE = {
  strong: 3,
  moderate: 2,
  limited: 1,
} as const;

const ZONE_BASELINES: Record<string, {
  summary: string;
  signals: Record<StayPreference, { level: StayContextSignal["level"]; note: string }>;
}> = {
  north: {
    summary: "Thuận cho VinWonders, Safari và Grand World; nhiều tiện ích nằm trong các tổ hợp lớn hơn là rải đều ngoài phố.",
    signals: {
      food: { level: "moderate", note: "Có lựa chọn trong khu nghỉ dưỡng/tổ hợp, nhưng không phải kiểu phố ăn uống dày như Dương Đông." },
      cafe: { level: "moderate", note: "Có quán trong các tổ hợp lớn; lựa chọn bên ngoài phụ thuộc vị trí cụ thể." },
      evening: { level: "strong", note: "Grand World tạo lợi thế buổi tối rõ hơn nhiều khu nghỉ dưỡng thuần túy." },
      walkable: { level: "moderate", note: "Đi bộ ổn trong từng tổ hợp, nhưng khoảng cách giữa các cụm trên Bắc đảo vẫn lớn." },
      quiet: { level: "moderate", note: "Tùy khách sạn; resort có thể yên, khu Grand World thì sôi động hơn." },
      local: { level: "limited", note: "Trải nghiệm chủ đạo là resort và tổ hợp du lịch, ít nhịp dân sinh hơn Dương Đông/An Thới." },
      family: { level: "strong", note: "Rất thuận cho gia đình nếu trọng tâm là VinWonders và Safari." },
      airport: { level: "limited", note: "Xa sân bay hơn các khu Bãi Trường và Dương Đông." },
    },
  },
  south: {
    summary: "Thuận Hòn Thơm, Sunset Town, Bãi Khem và Nam đảo; buổi tối có cụm trải nghiệm tập trung quanh Sunset Town.",
    signals: {
      food: { level: "moderate", note: "Có cả khu du lịch mới và khu dân cư An Thới, nhưng chất trải nghiệm khác nhau." },
      cafe: { level: "moderate", note: "Sunset Town có lợi thế cảnh quan; venue cụ thể cần kiểm tra hiện hành." },
      evening: { level: "strong", note: "Show, Cầu Hôn và hoạt động tối tập trung quanh Sunset Town." },
      walkable: { level: "strong", note: "Trong Sunset Town có thể ghép nhiều điểm bằng đi bộ; toàn Nam đảo thì không." },
      quiet: { level: "moderate", note: "Bãi Khem/resort yên hơn, Sunset Town sôi động hơn." },
      local: { level: "moderate", note: "An Thới có nhịp cảng và dân cư, khác hẳn khu Sunset Town." },
      family: { level: "strong", note: "Thuận nếu lịch có cáp treo, công viên nước hoặc Bãi Khem." },
      airport: { level: "moderate", note: "Không xa như Bắc đảo nhưng vẫn kém Bãi Trường về độ tiện sân bay." },
    },
  },
  duong_dong: {
    summary: "Thực dụng nhất cho ăn uống, chợ, local life và buổi tối; không tối ưu nếu lịch chủ yếu nằm hẳn ở Bắc hoặc Nam đảo.",
    signals: {
      food: { level: "strong", note: "Mật độ lựa chọn ăn uống và chợ cao, dễ đổi món mà không phải đi quá xa." },
      cafe: { level: "strong", note: "Nhiều lựa chọn hơn các vùng resort thuần túy." },
      evening: { level: "strong", note: "Chợ đêm, Dinh Cậu và dịch vụ trung tâm tạo nhịp tối rõ." },
      walkable: { level: "strong", note: "Một số cụm trung tâm có thể đi bộ ghép ăn uống, chợ và bờ biển." },
      quiet: { level: "limited", note: "Nhịp đô thị và giao thông cao hơn khu nghỉ dưỡng." },
      local: { level: "strong", note: "Dễ chạm đời sống địa phương, chợ và dịch vụ dân sinh." },
      family: { level: "moderate", note: "Tiện dịch vụ, nhưng không sát các công viên lớn." },
      airport: { level: "strong", note: "Thuận sân bay hơn Bắc đảo và phần lớn Nam đảo." },
    },
  },
  long_beach: {
    summary: "Cân bằng giữa sân bay, nghỉ biển và việc đi Bắc/Nam; tiện cho chuyến ngắn hoặc lịch chưa nghiêng hẳn một phía.",
    signals: {
      food: { level: "moderate", note: "Có lựa chọn dọc Bãi Trường nhưng phân tán theo từng cụm." },
      cafe: { level: "moderate", note: "Có quán và beach club, nhưng không phải nơi nào cũng đi bộ được." },
      evening: { level: "moderate", note: "Có hoàng hôn và dịch vụ resort, nhưng ít tập trung hơn Dương Đông/Sunset Town." },
      walkable: { level: "limited", note: "Bãi Trường rất dài; tên khu giống nhau không có nghĩa mọi điểm gần nhau." },
      quiet: { level: "strong", note: "Nhiều resort có không gian nghỉ dưỡng tốt." },
      local: { level: "limited", note: "Trải nghiệm thiên về resort hơn nhịp dân sinh." },
      family: { level: "strong", note: "Dễ cân bằng nghỉ dưỡng, sân bay và lịch trình nhiều hướng." },
      airport: { level: "strong", note: "Lợi thế rõ về sân bay." },
    },
  },
  north_central: {
    summary: "Yên hơn trung tâm, phù hợp nghỉ dưỡng và hoàng hôn; buổi tối và đi bộ ngoài resort thường ít lựa chọn hơn.",
    signals: {
      food: { level: "moderate", note: "Có nhà hàng/quán rải theo Ông Lang - Cửa Dương, nhưng mật độ không đều." },
      cafe: { level: "moderate", note: "Có lựa chọn đẹp và yên, nhưng không dày." },
      evening: { level: "limited", note: "Ít cụm hoạt động tối tập trung hơn Dương Đông hoặc Sunset Town." },
      walkable: { level: "limited", note: "Nhiều điểm cách nhau bằng xe hơn là đi bộ liên tục." },
      quiet: { level: "strong", note: "Đây là lợi thế nổi bật của Ông Lang và các khu nghỉ dưỡng lân cận." },
      local: { level: "moderate", note: "Có làng/khu dân cư xen resort nhưng không dày dịch vụ." },
      family: { level: "moderate", note: "Hợp nghỉ dưỡng, nhưng lịch nhiều công viên/điểm xa sẽ cần xe." },
      airport: { level: "moderate", note: "Không quá xa trung tâm nhưng kém Bãi Trường." },
    },
  },
  east: {
    summary: "Hợp trải nghiệm làng biển và local life hơn là nightlife; thường cần chủ động xe.",
    signals: {
      food: { level: "moderate", note: "Hải sản và quán địa phương là điểm đáng chú ý hơn cafe/nightlife." },
      cafe: { level: "limited", note: "Không phải thế mạnh chính của khu Đông đảo." },
      evening: { level: "limited", note: "Ít hoạt động tối tập trung." },
      walkable: { level: "limited", note: "Các điểm trải nghiệm phân tán." },
      quiet: { level: "strong", note: "Nhịp chậm và ít đô thị hơn." },
      local: { level: "strong", note: "Làng biển và đời sống cư dân là lợi thế rõ." },
      family: { level: "moderate", note: "Phù hợp đi ngắn theo điểm, không mạnh về tiện ích giải trí tổng hợp." },
      airport: { level: "moderate", note: "Khoảng cách sân bay tùy điểm nhưng nhìn chung không quá bất lợi." },
    },
  },
};

async function verifiedVenueCounts(env: Env, zoneCode: string) {
  const canonical = await loadOpenPqVenues();
  const byId = new Map<string, string>();

  for (const row of canonical.rows) {
    if ((row.status || "REVIEW") !== "ACTIVE") continue;
    if (row.zone_code && row.zone_code !== zoneCode) continue;
    if (!row.verified_at) continue;
    byId.set(row.id, row.category);
  }

  if (!env.DB) {
    const counts = { food: 0, cafe: 0, attraction: 0 };
    for (const category of byId.values()) {
      if (category === "LOCAL_FOOD" || category === "RESTAURANT") counts.food += 1;
      if (category === "CAFE") counts.cafe += 1;
      if (category === "ATTRACTION") counts.attraction += 1;
    }
    return counts.food || counts.cafe || counts.attraction ? counts : null;
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, category
       FROM destination_venues
       WHERE status='ACTIVE'
         AND zone_code=?
         AND category IN ('LOCAL_FOOD','RESTAURANT','CAFE','ATTRACTION')
         AND verified_at IS NOT NULL`,
    ).bind(zoneCode).all<{id:string;category:string}>();

    for (const row of result.results || []) byId.set(row.id, row.category);

    const counts = { food: 0, cafe: 0, attraction: 0 };
    for (const category of byId.values()) {
      if (category === "LOCAL_FOOD" || category === "RESTAURANT") counts.food += 1;
      if (category === "CAFE") counts.cafe += 1;
      if (category === "ATTRACTION") counts.attraction += 1;
    }
    return counts.food || counts.cafe || counts.attraction ? counts : null;
  } catch {
    const counts = { food: 0, cafe: 0, attraction: 0 };
    for (const category of byId.values()) {
      if (category === "LOCAL_FOOD" || category === "RESTAURANT") counts.food += 1;
      if (category === "CAFE") counts.cafe += 1;
      if (category === "ATTRACTION") counts.attraction += 1;
    }
    return counts.food || counts.cafe || counts.attraction ? counts : null;
  }
}

function scorePreference(signal: StayContextSignal, preference: StayPreference) {
  const base = LEVEL_SCORE[signal.level];
  // Quiet is inverse only when the traveler explicitly wants nightlife/evening;
  // otherwise each requested preference uses the same ordinal mapping.
  return base;
}

export async function buildStayContext(
  env: Env,
  zoneCode: string,
  preferences: StayPreference[],
): Promise<StayContext> {
  const baseline = ZONE_BASELINES[zoneCode] || ZONE_BASELINES.long_beach;
  const counts = await verifiedVenueCounts(env, zoneCode);
  const signals: StayContextSignal[] = Object.entries(baseline.signals).map(([key, value]) => ({
    key: key as StayPreference,
    level: value.level,
    evidence:
      counts && (
        (key === "food" && counts.food > 0) ||
        (key === "cafe" && counts.cafe > 0) ||
        (key === "evening" && counts.attraction > 0)
      )
        ? "venue_enriched"
        : "zone_baseline",
    note: value.note,
  }));

  const requested = preferences;
  const picked = signals.filter((signal) => requested.includes(signal.key));
  const ordinalTotal = picked.reduce((sum, signal) => sum + scorePreference(signal, signal.key), 0);
  const max = Math.max(1, picked.length * 3);
  const fitScore = picked.length ? Math.round((ordinalTotal / max) * 100) : 60;

  const reasons = picked
    .filter((signal) => signal.level === "strong")
    .slice(0, 3)
    .map((signal) => signal.note);

  const cautions = picked
    .filter((signal) => signal.level === "limited")
    .slice(0, 3)
    .map((signal) => signal.note);

  return {
    zoneCode,
    summary: baseline.summary,
    signals,
    verifiedVenueCounts: counts,
    fitScore,
    confidence: counts ? 80 : 60,
    reasons,
    cautions,
  };
}
