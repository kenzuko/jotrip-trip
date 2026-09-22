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
      text: "Nếu lịch của nhà mình nằm nhiều ở phía Bắc thì mình xem khu này trước nha. Mình vẫn tính phần buổi tối và đi xe rồi mới nói nên ở đâu.",
    };
  }

  if (item.hotel.area_code === "south") {
    return {
      state: "speaking",
      action: "point",
      target: "map:south",
      text: "Lịch của nhà mình đang có nhiều điểm phía Nam. Mình xem khu này trước, rồi đặt cạnh một hướng khác nếu nó giúp mình nhìn rõ hơn.",
    };
  }

  return {
    state: "speaking",
    action: "point",
    target: "map:center",
    text: "Mình đang nhìn cách đi trước. Chỗ ở nào làm lịch nhẹ hơn thì mình giữ lại để so.",
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
      text: "Mình đặt hai cách đi cạnh nhau cho dễ nhìn nha. Mỗi hướng tiện một kiểu, nhà mình coi phần nào quan trọng hơn thì chọn theo phần đó.",
    };
  }

  if (parsed.parsed.mode === "things_to_do") {
    return {
      state: "speaking",
      action: "point",
      target: "discovery:do",
      text: "Mình xem đúng khu bạn đang hỏi trước nha. Không cần kéo cả Phú Quốc vào làm mình rối thêm.",
    };
  }

  if (parsed.parsed.mode === "where_to_stay") {
    return {
      state: "speaking",
      action: "point",
      target: "hotel:candidate",
      text: "Mình nhìn khu ở với cách đi trước nha. Khi hướng đã hợp rồi mình mới xuống khách sạn với giá.",
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
      text: "Mình xem quán cùng khu hoặc tiện đường trước nha. Không cần chạy vòng xa chỉ vì một chỗ đang nổi.",
    };
  }

  if (parsed.parsed.interests.includes("Ăn uống")) {
    return {
      state: "speaking",
      action: "point",
      target: "discovery:eat",
      text: "Mình coi trước khu này đáng ăn món gì, rồi mới chọn quán nào tiện lịch và dữ liệu còn đủ mới.",
    };
  }

  if (plan?.mode === "planning") {
    const hotelCue = cueForPlanningHotel(plan.planningHotels?.[0]);
    if (hotelCue) return hotelCue;

    return {
      state: "speaking",
      action: "point",
      target: "dates",
      text: "Mình hiểu hướng chuyến đi rồi. Có ngày cụ thể thì mình mới tính tiếp phần phòng, vé và tổng tiền cho chắc.",
    };
  }

  if (plan?.mode === "priced" && plan.scenarios?.length) {
    return {
      state: "confirm",
      action: "point",
      target: "scenario:comparison",
      text: "Mình đã ráp được các phần chính rồi. Giờ mình đặt tổng tiền với thời gian đi lại cạnh nhau cho nhà mình dễ nhìn.",
    };
  }

  return {
    state: "thinking",
    action: "none",
    target: "prompt",
    text: "Để mình ráp cách đi, khu ở và mấy phần ảnh hưởng tới chuyến này nha.",
  };
}
