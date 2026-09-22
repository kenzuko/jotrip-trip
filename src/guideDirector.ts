import type { PlanningHotel, ScenarioInsight, TripBuildResponse, TripParseResponse } from "./types";

export type GuideTarget =
  | "prompt"
  | "dates"
  | "map:north"
  | "map:south"
  | "map:center"
  | "hotel:candidate"
  | "scenario:comparison"
  | "price:total"
  | "warning"
  | "discovery:eat"
  | "discovery:cafe"
  | "discovery:do";

export type GuideCue = {
  state: "idle" | "thinking" | "speaking" | "compare" | "warning" | "confirm";
  action: "none" | "point" | "compare";
  target: GuideTarget;
  text: string;
};

function cueForPlanningHotel(item?: PlanningHotel): GuideCue | null {
  if (!item) return null;

  if (item.hotel.area_code === "north") {
    return {
      state: "speaking",
      action: "point",
      target: "map:north",
      text: "Chuyến này đang nghiêng về phía Bắc đảo. Mình xem khu này trước nha.",
    };
  }

  if (item.hotel.area_code === "south") {
    return {
      state: "speaking",
      action: "point",
      target: "map:south",
      text: "Các hoạt động bạn chọn đang nghiêng về phía Nam đảo. Mình xem khu này trước.",
    };
  }

  return {
    state: "speaking",
    action: "point",
    target: "map:center",
    text: "Mình đang ưu tiên vị trí để giảm quãng đường cho chuyến này.",
  };
}

function cueForInsight(insight?: ScenarioInsight): GuideCue | null {
  if (!insight) return null;

  if (insight.type === "similar_total" || insight.type === "cost_time_tradeoff") {
    return {
      state: "compare",
      action: "compare",
      target: "scenario:comparison",
      text: insight.body,
    };
  }

  if (insight.type === "cheaper") {
    return {
      state: "confirm",
      action: "point",
      target: "price:total",
      text: insight.body,
    };
  }

  return {
    state: "speaking",
    action: "point",
    target: "scenario:comparison",
    text: insight.body,
  };
}

export function directGuide(
  parsed: TripParseResponse | null,
  plan: TripBuildResponse | null,
): GuideCue {
  if (!parsed) {
    return {
      state: "idle",
      action: "none",
      target: "prompt",
      text: "Bạn định đi Phú Quốc thế nào?",
    };
  }

  if (parsed.parsed.mode === "contact") {
    return {
      state: "confirm",
      action: "point",
      target: "price:total",
      text: "Khi bạn thấy phương án ổn, mình chuyển đúng ngữ cảnh này cho JoTrip kiểm tra booking.",
    };
  }

  if (parsed.parsed.mode === "compare") {
    return {
      state: "compare",
      action: "compare",
      target: "scenario:comparison",
      text: "Mình sẽ đặt các phương án cạnh nhau để nhìn tổng tiền, thời gian và cách sống quanh khu ở.",
    };
  }

  if (parsed.parsed.mode === "things_to_do") {
    return {
      state: "speaking",
      action: "point",
      target: "discovery:do",
      text: "Mình sẽ trả lời đúng khu bạn hỏi, không xổ cả danh sách Phú Quốc.",
    };
  }

  if (parsed.parsed.mode === "where_to_stay") {
    return {
      state: "speaking",
      action: "point",
      target: "hotel:candidate",
      text: "Mình so khu ở trước, rồi mới tới khách sạn và giá.",
    };
  }

  const warning = plan?.warnings?.[0];
  if (warning) {
    return {
      state: "warning",
      action: "point",
      target: "warning",
      text: warning,
    };
  }

  const insightCue = cueForInsight(plan?.insights?.[0]);
  if (insightCue) return insightCue;

  if (parsed.parsed.interests.includes("Cà phê")) {
    return {
      state: "speaking",
      action: "point",
      target: "discovery:cafe",
      text: "Mình sẽ xem quán cà phê trong đúng khu bạn ở, không bắt bạn chạy xa chỉ vì một quán nổi tiếng.",
    };
  }

  if (parsed.parsed.interests.includes("Ăn uống")) {
    return {
      state: "speaking",
      action: "point",
      target: "discovery:eat",
      text: "Mình tách hai chuyện: ở khu này nên ăn món gì, và quán nào đang đủ dữ liệu để gợi ý.",
    };
  }

  if (plan?.mode === "planning") {
    const hotelCue = cueForPlanningHotel(plan.planningHotels?.[0]);
    if (hotelCue) return hotelCue;

    return {
      state: "speaking",
      action: "point",
      target: "dates",
      text: "Mình đã hiểu ý chuyến đi. Chọn ngày để mình tính giá phòng thật.",
    };
  }

  if (plan?.mode === "priced" && plan.scenarios?.length) {
    return {
      state: "confirm",
      action: "point",
      target: "scenario:comparison",
      text: "Mình đã có các phương án có thể so trực tiếp về tổng tiền và thời gian di chuyển.",
    };
  }

  return {
    state: "thinking",
    action: "none",
    target: "prompt",
    text: "Mình đang ráp các phần của chuyến đi.",
  };
}
