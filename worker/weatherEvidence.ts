import type { TripLanguage } from "./scenario";

type ForecastRow = {
  time?: string;
  time_iso?: string;
  temperature_c?: number | null;
  wind_kmh?: number | null;
  gust_kmh?: number | null;
  rain_3h_mm?: number | null;
};

type WeatherPoint = {
  name?: string;
  temperature_c?: number | null;
  wind_kmh?: number | null;
  rain?: {
    rain_rate_mm_h?: number | null;
    data_class?: string;
    imminence?: { level?: string; not_probability?: boolean };
  };
};

type WeatherBundle = {
  schema_version?: string;
  generated_at?: string;
  groundtruth?: {
    status?: string;
    atmosphere?: {
      vvpq?: {
        status?: string;
        data_class?: string;
        observed_at?: string;
        temperature_c?: number | null;
        wind_speed_kmh?: number | null;
      };
    };
  };
  local_now?: {
    points?: Record<string, WeatherPoint>;
  };
  model_72h?: {
    points?: Record<string, ForecastRow[]>;
  };
};

const WEATHER_URL =
  "https://raw.githubusercontent.com/kenzuko/Jotrip-Lab/data-weather/data/weather-current/latest.json";
const MAX_AGE_MS = 40 * 60 * 1000;
const TZ = "Asia/Ho_Chi_Minh";

function part(value: number, key: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: TZ })
    .formatToParts(new Date(value))
    .find((item) => item.type === key)?.value || "";
}

function localDateKey(value: number): string {
  return part(value, "year", { year: "numeric" }) + "-" +
    part(value, "month", { month: "2-digit" }) + "-" +
    part(value, "day", { day: "2-digit" });
}

function localMinute(value: number): number {
  return Number(part(value, "hour", { hour: "2-digit", hourCycle: "h23" })) * 60 +
    Number(part(value, "minute", { minute: "2-digit" }));
}

function localClock(value: string | number): string {
  const stamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(stamp)) return "";
  const hour = part(stamp, "hour", { hour: "2-digit", hourCycle: "h23" });
  const minute = part(stamp, "minute", { minute: "2-digit" });
  return hour.padStart(2, "0") + ":" + minute.padStart(2, "0");
}

function localStamp(value: string): string {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return "không rõ giờ";
  return part(stamp, "day", { day: "2-digit" }) + "/" +
    part(stamp, "month", { month: "2-digit" }) + " " + localClock(stamp);
}

function number(value: unknown, language: TripLanguage, maximumFractionDigits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const locale = language === "vi" ? "vi-VN" : language === "ru" ? "ru-RU" : language === "zh" ? "zh-CN" : language === "ko" ? "ko-KR" : "en-US";
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function unavailable(language: TripLanguage): string {
  const copy: Record<TripLanguage, string> = {
    vi: "Mình chưa lấy được gói thời tiết Weather Lab còn mới trong 40 phút, nên chưa thể kết luận chiều nay. Mình không dùng nội dung chuyến đi cũ để đoán thời tiết.",
    en: "I could not retrieve a Weather Lab update from the last 40 minutes, so I cannot verify this afternoon's conditions. I will not use old trip details to guess the weather.",
    ko: "최근 40분 이내의 Weather Lab 데이터를 가져오지 못해 오늘 오후 날씨를 확인할 수 없어요. 이전 여행 내용으로 날씨를 추측하지 않을게요.",
    ru: "Не удалось получить Weather Lab за последние 40 минут, поэтому я не могу подтвердить погоду на сегодня. Я не буду угадывать по старым данным поездки.",
    zh: "未能取得最近40分钟内的 Weather Lab 数据，因此无法确认今天下午的天气。我不会用旧行程内容来猜天气。",
  };
  return copy[language];
}

function targetWindow(rawText: string, nowMs: number) {
  const text = rawText.toLocaleLowerCase();
  const today = localDateKey(nowMs);
  const tomorrow = /tomorrow|ngày\s+mai|mai\b|내일|明天|завтра/iu.test(text);
  const targetDate = tomorrow
    ? localDateKey(nowMs + 24 * 60 * 60 * 1000)
    : today;
  const dayOffset = tomorrow ? 1 : 0;
  const current = dayOffset ? 0 : localMinute(nowMs);
  const morning = /sáng|morning|아침|上午|утром/iu.test(text);
  const afternoon = /chiều|afternoon|오후|下午|днём|днем/iu.test(text);
  const evening = /tối|đêm|evening|tonight|night|저녁|晚上|вечером/iu.test(text);
  let start = current;
  let end = Math.min(24 * 60, current + 12 * 60);
  if (morning) {
    start = Math.max(current, dayOffset ? 6 * 60 : current, 6 * 60);
    end = 12 * 60;
  } else if (afternoon) {
    start = Math.max(current, 12 * 60);
    end = 18 * 60;
  } else if (evening) {
    start = Math.max(current, 18 * 60);
    end = 24 * 60;
  }
  return { date: targetDate, start, end };
}

function pointIds(rawText: string): string[] {
  const text = rawText.toLocaleLowerCase();
  if (/dương\s*đông|duong\s*dong/iu.test(text)) return ["duong_dong"];
  if (/an\s*thới|an\s*thoi|nam\s*đảo|nam\s*dao|hòn\s*thơm|hon\s*thom/iu.test(text)) return ["an_thoi"];
  if (/gành\s*dầu|ganh\s*dau|bắc\s*đảo|bac\s*dao/iu.test(text)) return ["ganh_dau"];
  if (/cửa\s*cạn|cua\s*can/iu.test(text)) return ["cua_can"];
  if (/bãi\s*thơm|bai\s*thom/iu.test(text)) return ["bai_thom"];
  if (/bãi\s*sao|bai\s*sao/iu.test(text)) return ["bai_sao"];
  if (/hàm\s*ninh|ham\s*ninh/iu.test(text)) return ["ham_ninh"];
  if (/rạch\s*giá|rach\s*gia/iu.test(text)) return ["rach_gia"];
  return ["duong_dong", "an_thoi", "ganh_dau"];
}

const pointNames: Record<string, string> = {
  duong_dong: "Dương Đông",
  an_thoi: "An Thới",
  ganh_dau: "Gành Dầu",
  cua_can: "Cửa Cạn",
  bai_thom: "Bãi Thơm",
  bai_sao: "Bãi Sao",
  ham_ninh: "Hàm Ninh",
  rach_gia: "Rạch Giá",
};

function forecastLine(
  pointId: string,
  rows: ForecastRow[],
  window: { date: string; start: number; end: number },
  language: TripLanguage,
): string {
  const row = rows.find((item) => {
    const time = item.time_iso || item.time;
    if (!time) return false;
    const stamp = Date.parse(time);
    if (!Number.isFinite(stamp) || localDateKey(stamp) !== window.date) return false;
    const minutes = localMinute(stamp);
    return minutes >= window.start && minutes < window.end;
  });
  const forecastTime = row?.time_iso || row?.time;
  if (!row || !forecastTime) return "";
  const details: string[] = [];
  if (typeof row.temperature_c === "number") details.push(number(row.temperature_c, language) + "°C");
  if (typeof row.wind_kmh === "number") details.push(
    (language === "vi" ? "gió " : "wind ") + number(row.wind_kmh, language) + " km/h",
  );
  if (typeof row.rain_3h_mm === "number") details.push(
    (language === "vi" ? "mưa " : "rain ") + number(row.rain_3h_mm, language) + (language === "vi" ? " mm/3 giờ" : " mm/3h"),
  );
  if (typeof row.gust_kmh === "number") details.push(
    (language === "vi" ? "gió giật " : "gusts ") + number(row.gust_kmh, language) + " km/h",
  );
  return pointNames[pointId] + " " + localClock(forecastTime) + ": " + details.join(", ");
}

function localNowLine(
  pointId: string,
  point: WeatherPoint | undefined,
  language: TripLanguage,
): string {
  if (!point) return "";
  const details: string[] = [];
  if (typeof point.temperature_c === "number") details.push(number(point.temperature_c, language) + "°C");
  if (typeof point.wind_kmh === "number") {
    details.push((language === "vi" ? "gió " : "wind ") + number(point.wind_kmh, language) + " km/h");
  }
  const rain = point.rain;
  if (typeof rain?.rain_rate_mm_h === "number") {
    const label = rain.data_class === "MODEL_ONLY"
      ? (language === "vi" ? "mưa theo mô hình " : "model rain ")
      : (language === "vi" ? "mưa ước tính " : "estimated rain ");
    details.push(label + number(rain.rain_rate_mm_h, language, 2) + (language === "vi" ? " mm/giờ" : " mm/h"));
  }
  const imminence = rain?.imminence;
  if (imminence?.not_probability === true && imminence.level) {
    const level = imminence.level.toUpperCase();
    const signal = level === "HIGH"
      ? (language === "vi" ? "tín hiệu đối lưu cao" : "high convective signal")
      : level === "ELEVATED"
        ? (language === "vi" ? "tín hiệu đối lưu tăng" : "elevated convective signal")
        : "";
    if (signal) details.push(signal + (language === "vi" ? "; không phải xác suất mưa" : "; not a rain probability"));
  }
  if (!details.length) return "";
  return (pointNames[pointId] || point.name || pointId) + ": " + details.join(", ");
}

function formatWeather(
  bundle: WeatherBundle,
  rawText: string,
  language: TripLanguage,
  nowMs: number,
): string {
  const window = targetWindow(rawText, nowMs);
  const pointIdsToRead = pointIds(rawText);
  const modelPoints = bundle.model_72h?.points || {};
  const localPoints = bundle.local_now?.points || {};
  const localNowLines = pointIdsToRead
    .map((id) => localNowLine(id, localPoints[id], language))
    .filter(Boolean);
  const localNowText = localNowLines.length
    ? (language === "vi" ? "Nowcast hiện tại (ước tính): " : "Current local nowcast (estimated): ") +
      localNowLines.join("; ") + ". "
    : "";
  const forecasts = pointIdsToRead
    .map((id) => forecastLine(id, modelPoints[id] || [], window, language))
    .filter(Boolean);
  const updated = bundle.generated_at ? localStamp(bundle.generated_at) : "không rõ giờ";
  const observation = bundle.groundtruth?.atmosphere?.vvpq;
  const observationAge = observation?.observed_at
    ? nowMs - Date.parse(observation.observed_at)
    : Number.NaN;
  let observationText = "";
  if (
    observation?.status === "FRESH" &&
    observation.data_class === "ACTUAL" &&
    observation.observed_at &&
    Number.isFinite(observationAge) &&
    observationAge >= -60_000 &&
    observationAge <= 30 * 60 * 1000
  ) {
    const facts: string[] = [];
    if (typeof observation.temperature_c === "number") facts.push(number(observation.temperature_c, language) + "°C");
    if (typeof observation.wind_speed_kmh === "number") {
      facts.push((language === "vi" ? "gió " : "wind ") + number(observation.wind_speed_kmh, language) + " km/h");
    }
    if (facts.length) {
      observationText = language === "vi"
        ? "Quan trắc METAR tại sân bay Phú Quốc lúc " + localClock(observation.observed_at) + ": " + facts.join(", ") + " (chỉ đại diện khu vực sân bay). "
        : "Airport METAR at " + localClock(observation.observed_at) + ": " + facts.join(", ") + " (airport area only). ";
    }
  }
  const placeText = forecasts.length
    ? (language === "vi" ? "Dự báo mô hình: " : "Model forecast: ") + forecasts.join("; ") + ". "
    : (language === "vi"
      ? "Weather Lab chưa có bước dự báo mới trong khung giờ đó. "
      : "Weather Lab has no forecast step in that time window. ");
  const source = language === "vi"
    ? "Weather Lab cập nhật lúc " + updated + " giờ Việt Nam."
    : "Weather Lab updated at " + updated + " Vietnam time.";
  return observationText + localNowText + placeText + source;
}

export async function loadWeatherAnswer(
  rawText: string,
  language: TripLanguage,
  fetcher: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<string> {
  const unavailableText = unavailable(language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL(WEATHER_URL);
    url.searchParams.set("t", String(nowMs));
    const response = await fetcher(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: controller.signal,
    });
    if (!response.ok) return unavailableText;
    const bundle = await response.json() as WeatherBundle;
    const generatedAt = Date.parse(bundle.generated_at || "");
    const age = nowMs - generatedAt;
    if (
      bundle.schema_version !== "weather-current-v3" ||
      bundle.groundtruth?.status !== "READY" ||
      !bundle.local_now?.points ||
      !bundle.model_72h?.points ||
      !Number.isFinite(generatedAt) ||
      age < -60_000 ||
      age > MAX_AGE_MS
    ) return unavailableText;
    return formatWeather(bundle, rawText, language, nowMs);
  } catch {
    return unavailableText;
  } finally {
    clearTimeout(timer);
  }
}
