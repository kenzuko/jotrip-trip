import type { TripScenario } from "./tripScenario";

export type ScenarioInsight = {
  type: "cost_time_tradeoff" | "cheaper" | "faster" | "similar_total" | "fit" | "stay_context";
  title: string;
  body: string;
  primaryScenarioId: string;
  secondaryScenarioId?: string;
  data: Record<string, number | string>;
};

function moneyShort(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${millions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  }
  return `${Math.round(abs / 1000).toLocaleString("vi-VN")} nghìn`;
}

function minutesHuman(value: number) {
  const abs = Math.abs(Math.round(value));
  if (abs < 60) return `${abs} phút`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

export function explainTopScenarios(
  scenarios: TripScenario[],
): ScenarioInsight[] {
  if (scenarios.length < 2) return [];

  const insights: ScenarioInsight[] = [];
  const a = scenarios[0];
  const b = scenarios[1];

  const costDelta = a.metrics.totalCostVnd - b.metrics.totalCostVnd;
  const timeDelta = a.driveMinutes - b.driveMinutes;
  const fitDelta = a.stayFit - b.stayFit;

  if (Math.abs(costDelta) <= 300_000 && Math.abs(timeDelta) >= 45) {
    const faster = timeDelta < 0 ? a : b;
    const slower = faster.id === a.id ? b : a;
    insights.push({
      type: "similar_total",
      title: "Tổng tiền gần nhau, khác biệt nằm ở thời gian đi xe",
      body: `${faster.hotelName} chỉ chênh tổng chi phí khoảng ${moneyShort(costDelta)} nhưng giảm khoảng ${minutesHuman(timeDelta)} di chuyển so với ${slower.hotelName}.`,
      primaryScenarioId: faster.id,
      secondaryScenarioId: slower.id,
      data: { costDeltaVnd: costDelta, driveDeltaMinutes: timeDelta },
    });
  } else if (costDelta > 0 && timeDelta < 0) {
    insights.push({
      type: "cost_time_tradeoff",
      title: "Trả thêm để đổi lấy ít thời gian trên xe hơn",
      body: `${a.hotelName} cao hơn khoảng ${moneyShort(costDelta)} nhưng giảm khoảng ${minutesHuman(timeDelta)} di chuyển so với ${b.hotelName}.`,
      primaryScenarioId: a.id,
      secondaryScenarioId: b.id,
      data: { costDeltaVnd: costDelta, driveDeltaMinutes: timeDelta },
    });
  } else if (costDelta < 0 && timeDelta <= 0) {
    insights.push({
      type: "cheaper",
      title: "Một phương án đang thắng cả giá lẫn thời gian",
      body: `${a.hotelName} thấp hơn khoảng ${moneyShort(costDelta)} và không làm tăng thời gian di chuyển so với ${b.hotelName}.`,
      primaryScenarioId: a.id,
      secondaryScenarioId: b.id,
      data: { costDeltaVnd: costDelta, driveDeltaMinutes: timeDelta },
    });
  } else if (timeDelta < -45) {
    insights.push({
      type: "faster",
      title: "Khác biệt lớn nhất là quãng đường",
      body: `${a.hotelName} giúp giảm khoảng ${minutesHuman(timeDelta)} di chuyển so với ${b.hotelName}.`,
      primaryScenarioId: a.id,
      secondaryScenarioId: b.id,
      data: { driveDeltaMinutes: timeDelta },
    });
  }

  if (Math.abs(fitDelta) >= 15) {
    const betterFit = fitDelta > 0 ? a : b;
    const other = betterFit.id === a.id ? b : a;
    const contextReason = betterFit.stayContext?.reasons?.[0];
    const otherCaution = other.stayContext?.cautions?.[0];

    if (contextReason) {
      insights.push({
        type: "stay_context",
        title: "Khác biệt không chỉ nằm ở giá phòng",
        body: `${betterFit.hotelName} hợp cách ở của chuyến này hơn vì ${contextReason.charAt(0).toLowerCase() + contextReason.slice(1)}${otherCaution ? ` Trong khi ${other.hotelName}: ${otherCaution.charAt(0).toLowerCase() + otherCaution.slice(1)}` : ""}`,
        primaryScenarioId: betterFit.id,
        secondaryScenarioId: other.id,
        data: { fitDelta: Math.abs(fitDelta) },
      });
    } else {
      insights.push({
        type: "fit",
        title: "Độ hợp với lịch trình khác nhau rõ",
        body: `${betterFit.hotelName} khớp vị trí hoạt động của chuyến này tốt hơn ${other.hotelName}. JoTrip vẫn giữ cả hai nếu chúng còn trade-off đáng cân nhắc.`,
        primaryScenarioId: betterFit.id,
        secondaryScenarioId: other.id,
        data: { fitDelta: Math.abs(fitDelta) },
      });
    }
  }

  return insights.slice(0, 3);
}
