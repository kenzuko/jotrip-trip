import { buildParseResponse, parseTripText, type TripLanguage } from "./scenario";

export type TripContext = ReturnType<typeof parseTripText>;
export type ResolvedTripTurn = {
  action: "acknowledgement" | "request" | "new_trip";
  parsed: TripContext;
  nextNeeded: string[];
  assumptions: string[];
};

const NEW_TRIP = /(?:^|[.!?\s])(?:chuyến\s+(?:đi\s+)?mới|làm\s+lại\s+(?:từ\s+đầu|chuyến)|bắt\s+đầu\s+lại|new\s+trip|start\s+over|새\s*여행|новая\s+поездка|重新规划|新的旅行)(?:$|[.!?\s])/iu;
const REMOVE = /(?:bỏ|không\s+(?:đi|muốn|thích)|đừng\s+(?:đi|thêm)|remove|skip|drop|取消|不要)/iu;
const REPLACE = /(?:đổi|thay|replace|swap|换成|改成)/iu;
const SPLIT_REPLACE = /(?:thành|sang|bằng|with|for|to|成|为)/iu;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function revisedInterests(previous: string[], text: string, incoming: string[]): string[] {
  if (REMOVE.test(text)) {
    const toRemove = parseTripText(text).interests;
    // "Bỏ Safari, thêm Hòn Thơm" must retain the newly added attraction.
    const split = text.split(/(?:,|;|\bthêm\b|\badd\b)/iu);
    const removed = parseTripText(split[0] || "").interests;
    return unique([...previous.filter(item => !removed.includes(item)), ...incoming.filter(item => !removed.includes(item))]);
  }
  if (REPLACE.test(text) && SPLIT_REPLACE.test(text)) {
    const parts = text.split(SPLIT_REPLACE);
    const before = parseTripText(parts[0] || "").interests;
    const after = parseTripText(parts.slice(1).join(" ") || "").interests;
    if (before.length && after.length) return unique([...previous.filter(item => !before.includes(item)), ...after]);
  }
  return unique([...previous, ...incoming]);
}

export function resolveTripTurn(previous: TripContext | null, text: string): ResolvedTripTurn {
  const input = text.trim();
  const result = buildParseResponse(input);
  if (!input) throw new Error("text_required");
  const fresh = NEW_TRIP.test(input);
  if (result.conversationAction === "acknowledgement") {
    return {
      action: "acknowledgement",
      parsed: previous ? { ...previous } : result.parsed,
      nextNeeded: [],
      assumptions: [],
    };
  }

  const incoming = result.parsed;
  const parsed: TripContext = !previous || fresh ? incoming : {
    ...previous,
    ...incoming,
    days: incoming.days ?? previous.days,
    nights: incoming.nights ?? previous.nights,
    adults: incoming.adults ?? previous.adults,
    children: incoming.children ?? previous.children,
    budgetVnd: incoming.budgetVnd ?? previous.budgetVnd,
    interests: revisedInterests(previous.interests, input, incoming.interests),
    stayPreferences: unique([...previous.stayPreferences, ...incoming.stayPreferences]),
    mentionedZone: incoming.mentionedZone ?? previous.mentionedZone,
    mentionedPlace: incoming.mentionedPlace ?? previous.mentionedPlace,
    language: incoming.language === "vi" && /^[a-z\s.!?]+$/i.test(input) && previous.language !== "vi"
      ? previous.language as TripLanguage : incoming.language,
    raw: incoming.raw,
  };

  const nextNeeded: string[] = [];
  if (parsed.mode === "trip_plan") {
    if (!parsed.days || parsed.nights === undefined) nextNeeded.push("duration");
    if (!parsed.interests.length && !parsed.stayPreferences.length) nextNeeded.push("interests");
    nextNeeded.push("travel_dates");
  }
  return {
    action: fresh ? "new_trip" : "request",
    parsed,
    nextNeeded,
    assumptions: parsed.adults === undefined && parsed.children === undefined
      ? result.assumptions : [],
  };
}
