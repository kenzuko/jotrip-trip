import type { TripLanguage } from "./scenario";

type FlightRecord = {
  direction?: string;
  operating_flight_number?: string;
  station?: string;
  route?: string;
  scheduled_time?: string | null;
  estimated_time?: string | null;
  actual_time?: string | null;
  status?: string;
  status_code?: string;
};

type FlightPayload = {
  latest?: {
    report_state?: string;
    source_date?: string;
    collected_at_vn?: string;
    records?: FlightRecord[];
    quality?: { source_mode?: string };
  };
  health?: {
    live_proxy?: boolean;
    source_mode?: string;
    state?: string;
    status?: string;
    source_date?: string;
    collected_at_vn?: string;
    last_successful_run?: string;
    fallback_used?: boolean;
  };
};

type OfficialFlightItem = {
  flightNo?: string;
  cityName?: string;
  route?: string;
  scheduledTime?: string | null;
  estimatedTime?: string | null;
  actualTime?: string | null;
  notesVn?: string;
  notesEn?: string;
  status?: string;
  remarks?: string;
};

type OfficialFlightResponse = {
  success?: boolean;
  data?: OfficialFlightItem[];
};

const LIVE_URL = "https://jotrip-airport-live.kenzuko.workers.dev";
const OFFICIAL_API_URL = "https://sunairport.com/phuquoc/cms/api/flights";
// The live proxy caches for 30s and may revalidate stale responses for 90s.
// Accept only a three-minute live response; if the proxy is stale, use the
// same official JSON API directly instead of counting an archived snapshot.
const MAX_AGE_MS = 3 * 60 * 1000;
const FLIGHT_FETCH_TIMEOUT_MS = 12_000;
const LIVE_PROXY_TIMEOUT_MS = 2_500;
const TZ = "Asia/Ho_Chi_Minh";

function localPart(value: number, key: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: TZ })
    .formatToParts(new Date(value))
    .find((item) => item.type === key)?.value || "";
}

function localDateKey(value: number): string {
  return localPart(value, "year", { year: "numeric" }) + "-" +
    localPart(value, "month", { month: "2-digit" }) + "-" +
    localPart(value, "day", { day: "2-digit" });
}

function localMinute(value: number): number {
  return Number(localPart(value, "hour", { hour: "2-digit", hourCycle: "h23" })) * 60 +
    Number(localPart(value, "minute", { minute: "2-digit" }));
}

function parseVietnamTime(value: string | undefined): number {
  if (!value) return Number.NaN;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return Date.parse(hasZone ? normalized : normalized + "+07:00");
}

function clock(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  if (parts[0] > 23 || parts[1] > 59) return null;
  return parts[0] * 60 + parts[1];
}

function sourceClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const colon = text.match(/^(\d{1,2}):(\d{2})$/);
  const compact = text.match(/^(\d{2})(\d{2})(?:\d{2})?$/);
  const hour = colon ? Number(colon[1]) : compact ? Number(compact[1]) : Number.NaN;
  const minute = colon ? Number(colon[2]) : compact ? Number(compact[2]) : Number.NaN;
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) return null;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function vietnamTimestamp(value: number): string {
  return localPart(value, "year", { year: "numeric" }) + "-" +
    localPart(value, "month", { month: "2-digit" }) + "-" +
    localPart(value, "day", { day: "2-digit" }) + "T" +
    localPart(value, "hour", { hour: "2-digit", hourCycle: "h23" }) + ":" +
    localPart(value, "minute", { minute: "2-digit" }).padStart(2, "0") + ":" +
    localPart(value, "second", { second: "2-digit" }).padStart(2, "0") + "+07:00";
}

function clockLabel(minutes: number): string {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
    String(minutes % 60).padStart(2, "0");
}

function flightTime(record: FlightRecord): number | null {
  return clock(record.estimated_time) ?? clock(record.scheduled_time);
}

function stampLabel(value: number, language: TripLanguage): string {
  const day = localPart(value, "day", { day: "2-digit" });
  const month = localPart(value, "month", { month: "2-digit" });
  const hour = localPart(value, "hour", { hour: "2-digit", hourCycle: "h23" });
  const minute = localPart(value, "minute", { minute: "2-digit" });
  const time = hour.padStart(2, "0") + ":" + minute.padStart(2, "0");
  return language === "vi" ? day + "/" + month + " lúc " + time : day + "/" + month + " at " + time;
}

function normalize(value: string | undefined): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D").toUpperCase();
}

const destinations = [
  { label: "Hà Nội", code: "HAN", names: ["HA NOI", "HANOI"] },
  { label: "TP. Hồ Chí Minh", code: "SGN", names: ["HO CHI MINH", "SAI GON", "SAIGON"] },
  { label: "Đà Nẵng", code: "DAD", names: ["DA NANG"] },
  { label: "Hải Phòng", code: "HPH", names: ["HAI PHONG"] },
  { label: "Cần Thơ", code: "VCA", names: ["CAN THO"] },
  { label: "Rạch Giá", code: "VKG", names: ["RACH GIA"] },
];

function currentDestination(text: string) {
  const value = normalize(text);
  return destinations.find((destination) =>
    value.includes(normalize(destination.label)) ||
    destination.names.some((name) => value.includes(name)) ||
    new RegExp("\\b" + destination.code + "\\b").test(value),
  );
}

function freshnessTime(payload: FlightPayload): number {
  const values = [
    payload.health?.last_successful_run,
    payload.health?.collected_at_vn,
    payload.latest?.collected_at_vn,
  ];
  const stamps = values.map(parseVietnamTime).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : Number.NaN;
}

function readyState(value: string | undefined): boolean {
  const state = (value || "").toUpperCase();
  return /READY|PASS|LIVE/.test(state) &&
    !/NOT_READY|NOT-READY|FAIL|STALE|DEGRADED|FALLBACK/.test(state);
}

function isArrivalQuestion(text: string): boolean {
  return /(?:từ\s+(?:hà\s*nội|hanoi)|đến\s+(?:phú\s*quốc|phu\s*quoc)|chuyến\s+đến|arrival|landing|landed|도착|到达|抵达)/iu.test(text);
}

function timeWindow(text: string, nowMinute: number) {
  const value = text.toLocaleLowerCase();
  const morning = /sáng|morning|아침|上午|утром/iu.test(value);
  const afternoon = /chiều|afternoon|오후|下午|днём|днем/iu.test(value);
  const evening = /tối|đêm|evening|tonight|저녁|晚上|вечером/iu.test(value);
  if (morning) return { start: Math.max(6 * 60, nowMinute), end: 12 * 60, label: "06:00–12:00" };
  if (afternoon) return { start: Math.max(12 * 60, nowMinute), end: 18 * 60, label: "12:00–18:00" };
  if (evening) return { start: Math.max(18 * 60, nowMinute), end: 24 * 60, label: "18:00–24:00" };
  return { start: nowMinute, end: 24 * 60, label: "hôm nay" };
}

function unavailable(language: TripLanguage): string {
  const copy: Record<TripLanguage, string> = {
    vi: "Mình chưa đọc được bảng bay trực tiếp đủ mới để đếm chính xác, nên không lấy lịch chuyến đi cũ để đoán. Cậu xem bảng Sân bay Phú Quốc tại https://airport.openphuquoc.com nhé.",
    en: "I could not read a fresh live flight board, so I will not guess from an old trip. Check Phu Quoc Airport Live at https://airport.openphuquoc.com.",
    ko: "최신 실시간 항공편 정보를 읽지 못해 이전 여행 내용으로 추측하지 않을게요. 푸꾸옥 공항 실시간 운항표를 https://airport.openphuquoc.com 에서 확인해 주세요.",
    ru: "Не удалось прочитать свежую таблицу рейсов, поэтому я не буду угадывать по старой поездке. Проверьте табло аэропорта Фукуока: https://airport.openphuquoc.com.",
    zh: "暂时无法读取足够新的实时航班表，因此不会用旧行程来猜。请查看富国机场实时航班表：https://airport.openphuquoc.com。",
  };
  return copy[language];
}

function isFreshLivePayload(payload: FlightPayload, nowMs: number): boolean {
  const today = localDateKey(nowMs);
  const latest = payload.latest;
  const health = payload.health;
  const collectedAt = freshnessTime(payload);
  const states = [health?.state, health?.status, latest?.report_state].filter(Boolean);
  const hasReadyState = states.some((state) => readyState(state));
  const sourceMode = health?.source_mode;
  const liveSource =
    (sourceMode === "OFFICIAL_JSON_API_LIVE_PROXY" && health?.live_proxy === true) ||
    sourceMode === "OFFICIAL_JSON_API_DIRECT";
  const age = nowMs - collectedAt;
  return Boolean(
    latest &&
    Array.isArray(latest.records) &&
    hasReadyState &&
    liveSource &&
    latest.quality?.source_mode === sourceMode &&
    (latest.source_date === undefined || latest.source_date === today) &&
    (health?.source_date === undefined || health.source_date === today) &&
    health?.fallback_used !== true &&
    Number.isFinite(collectedAt) &&
    age >= -2 * 60 * 1000 &&
    age <= MAX_AGE_MS
  );
}

function answerFromPayload(
  rawText: string,
  language: TripLanguage,
  payload: FlightPayload,
  nowMs: number,
): string {
  const latest = payload.latest;
  const collectedAt = freshnessTime(payload);
  if (!latest || !Array.isArray(latest.records) || !isFreshLivePayload(payload, nowMs)) {
    return unavailable(language);
  }

  const text = rawText.toLocaleLowerCase();
  const arrival = isArrivalQuestion(text);
  const direction = arrival ? "arrival" : "departure";
  const destination = currentDestination(rawText);
  const window = timeWindow(rawText, localMinute(nowMs));
  const remainingOnly = /còn|remaining|left|아직|还剩|還剩/iu.test(text);
  const records = latest.records.filter((record) => {
    if ((record.direction || "").toLowerCase() !== direction) return false;
    const status = normalize((record.status_code || "") + " " + (record.status || ""));
    if (/CANCEL|HUY/.test(status)) return false;
    if (destination) {
      const station = normalize(record.station);
      const route = normalize(record.route);
      const stationMatch = destination.names.some((name) => station.includes(name));
      const routeMatch = arrival
        ? route.startsWith(destination.code + "-")
        : route.endsWith("-" + destination.code);
      if (!stationMatch && !routeMatch) return false;
    }
    const scheduled = flightTime(record);
    if (scheduled === null || scheduled < window.start || scheduled >= window.end) return false;
    if (remainingOnly && (record.actual_time || /DEPARTED|ARRIVED|ĐÃ\s*CẤT\s*CÁNH|ĐÃ\s*HẠ\s*CÁNH|ĐÃ\s*ĐẾN/iu.test((record.status_code || "") + " " + (record.status || "")))) return false;
    return true;
  });
  const unique = new Map<string, { flight: string; time: number }>();
  for (const record of records) {
    const scheduled = flightTime(record);
    if (scheduled === null) continue;
    const flight = record.operating_flight_number || "";
    const key = flight || record.route + "-" + scheduled;
    if (!unique.has(key)) unique.set(key, { flight, time: scheduled });
  }
  const flights = [...unique.values()].sort((a, b) => a.time - b.time);
  const destinationLabel = destination?.label || (language === "vi" ? "các điểm đến" : "destinations");
  const directionLabel = language === "vi"
    ? (arrival ? "đến từ " : "đi ")
    : (arrival ? "arriving from " : "departing to ");
  const times = flights.slice(0, 6).map((item) =>
    (item.flight ? item.flight + " " : "") + clockLabel(item.time),
  );
  const freshLabel = stampLabel(collectedAt, language);
  if (language === "vi") {
    if (!flights.length) {
      return "Bảng bay trực tiếp hiện không ghi nhận chuyến " + directionLabel + destinationLabel +
        " trong khung " + window.label + ". Bảng được cập nhật " + freshLabel +
        " giờ Việt Nam; lịch và trạng thái có thể thay đổi.";
    }
    return "Bảng bay trực tiếp ghi nhận " + flights.length + " chuyến bay " + directionLabel + destinationLabel +
      " còn theo lịch " + window.label + ": " + times.join(", ") +
      ". Cập nhật " + freshLabel + " giờ Việt Nam; giờ bay và trạng thái có thể thay đổi.";
  }
  if (!flights.length) {
    return "The live board shows no flights " + directionLabel + destinationLabel + " in " +
      window.label + ". Updated " + freshLabel + " Vietnam time; schedules and statuses can change.";
  }
  return "The live board shows " + flights.length + " flights " + directionLabel + destinationLabel +
    " still scheduled in " + window.label + ": " + times.join(", ") +
    ". Updated " + freshLabel + " Vietnam time; schedules and statuses can change.";
}

function officialRecord(item: OfficialFlightItem, direction: "arrival" | "departure"): FlightRecord {
  return {
    direction,
    operating_flight_number: item.flightNo?.trim() || "",
    station: item.cityName?.trim() || "",
    route: item.route?.trim() || "",
    scheduled_time: sourceClock(item.scheduledTime),
    estimated_time: sourceClock(item.estimatedTime),
    actual_time: sourceClock(item.actualTime),
    status: item.notesVn || item.notesEn || item.status || item.remarks || "",
  };
}

async function fetchOfficialBoard(
  type: "A" | "D",
  day: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  cacheBuster: number,
): Promise<OfficialFlightItem[]> {
  const url = new URL(OFFICIAL_API_URL);
  url.searchParams.set("type", type);
  url.searchParams.set("date", day);
  url.searchParams.set("limit", "100");
  url.searchParams.set("_t", String(cacheBuster));
  const response = await fetcher(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
      "user-agent": "JoTrip-Trip-Live/1.0",
    },
    signal,
  });
  if (!response.ok) throw new Error("official_flight_api_http_" + response.status);
  const body = await response.json() as OfficialFlightResponse;
  if (body.success !== true || !Array.isArray(body.data)) {
    throw new Error("official_flight_api_invalid_shape");
  }
  return body.data;
}

async function fetchOfficialPayload(
  fetcher: typeof fetch,
  day: string,
  signal: AbortSignal,
  cacheBuster: number,
): Promise<FlightPayload> {
  const [arrivals, departures] = await Promise.all([
    fetchOfficialBoard("A", day, fetcher, signal, cacheBuster),
    fetchOfficialBoard("D", day, fetcher, signal, cacheBuster),
  ]);
  if (!arrivals.length || !departures.length) throw new Error("official_flight_api_empty_board");
  const fetchedAt = Date.now();
  const timestamp = vietnamTimestamp(fetchedAt);
  const sourceMode = "OFFICIAL_JSON_API_DIRECT";
  return {
    latest: {
      report_state: "REPORT_READY",
      source_date: day,
      collected_at_vn: timestamp,
      quality: { source_mode: sourceMode },
      records: [
        ...arrivals.map((item) => officialRecord(item, "arrival")),
        ...departures.map((item) => officialRecord(item, "departure")),
      ],
    },
    health: {
      state: "REPORT_READY",
      source_date: day,
      collected_at_vn: timestamp,
      source_mode: sourceMode,
      fallback_used: false,
    },
  };
}

async function tryLiveProxy(
  fetcher: typeof fetch,
  nowMs: number,
  signal: AbortSignal,
): Promise<FlightPayload | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_PROXY_TIMEOUT_MS);
  const abortProxy = () => controller.abort();
  signal.addEventListener("abort", abortProxy, { once: true });
  try {
    const url = new URL(LIVE_URL);
    url.searchParams.set("date", localDateKey(nowMs));
    url.searchParams.set("t", String(nowMs));
    const response = await fetcher(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as FlightPayload;
    return isFreshLivePayload(payload, nowMs) ? payload : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abortProxy);
  }
}

export async function loadFlightAnswer(
  rawText: string,
  language: TripLanguage,
  fetcher: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLIGHT_FETCH_TIMEOUT_MS);
  try {
    const proxied = await tryLiveProxy(fetcher, nowMs, controller.signal);
    if (proxied) return answerFromPayload(rawText, language, proxied, nowMs);
    try {
      const payload = await fetchOfficialPayload(
        fetcher,
        localDateKey(nowMs),
        controller.signal,
        Date.now(),
      );
      return answerFromPayload(rawText, language, payload, Date.now());
    } catch {
      return unavailable(language);
    }
  } catch {
    return unavailable(language);
  } finally {
    clearTimeout(timer);
  }
}
