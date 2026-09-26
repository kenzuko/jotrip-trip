import { FormEvent, useMemo, useRef, useState } from "react";
import type {
  AdvisorResponse,
  DestinationContext,
  PlanningHotel,
  TripBuildResponse,
  TripParseResponse,
} from "./types";
import { directGuide } from "./guideDirector";
import { LivingWelcome, TripPulse } from "./LivingCanvas";
import { resolveMascotState, runtimeMascotPath } from "./mascotState";

const languageNames: Record<string, string> = {
  vi: "VI",
  en: "EN",
  ko: "KO",
  ru: "RU",
  zh: "中文",
};

function getSessionId() {
  const key = "jotrip_trip_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function preferenceLabel(value: string) {
  const labels: Record<string, string> = {
    food: "ăn uống",
    cafe: "cà phê",
    evening: "buổi tối",
    walkable: "đi bộ",
    quiet: "yên tĩnh",
    local: "địa phương",
    family: "gia đình",
    airport: "gần sân bay",
  };
  return labels[value] || value;
}

function signalLabel(value: string) {
  const labels: Record<string, string> = {
    food: "Ăn uống",
    cafe: "Cà phê",
    evening: "Buổi tối",
    walkable: "Đi bộ",
    quiet: "Yên tĩnh",
    local: "Local",
    family: "Gia đình",
    airport: "Sân bay",
  };
  return labels[value] || value;
}

function levelLabel(value: string) {
  if (value === "strong") return "tốt";
  if (value === "moderate") return "khá";
  return "hạn chế";
}

function areaDisplay(value: string) {
  const labels: Record<string, string> = {
    north: "Bắc đảo",
    south: "Nam đảo",
    duong_dong: "Dương Đông",
    long_beach: "Bãi Trường",
    north_central: "Ông Lang",
    east: "Đông đảo",
  };
  return labels[value] || value;
}

function money(value?: number) {
  if (!value) return "Chưa tính";
  return new Intl.NumberFormat("vi-VN").format(value) + "đ";
}

type LocalTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  language?: string;
};

function planningReply(result: TripParseResponse, plan: TripBuildResponse) {
  const lang = result.parsed.language;
  const top = plan.planningHotels?.[0];
  if (!top) return result.assistantText || "";

  const area = top.hotel.area_code;
  const areaNames: Record<string, Record<string, string>> = {
    north: { vi: "Bắc đảo", en: "the north", ko: "북부", ru: "север острова", zh: "北岛" },
    south: { vi: "Nam đảo", en: "the south", ko: "남부", ru: "юг острова", zh: "南岛" },
    duong_dong: { vi: "Dương Đông", en: "Duong Dong", ko: "즈엉동", ru: "Зыонгдонг", zh: "阳东" },
    long_beach: { vi: "Bãi Trường", en: "Long Beach", ko: "롱비치", ru: "Лонг-Бич", zh: "长滩" },
    north_central: { vi: "Ông Lang", en: "Ong Lang", ko: "옹랑", ru: "Онг Ланг", zh: "翁朗" },
  };
  const label = areaNames[area]?.[lang] || area;

  if (lang === "en") return "I’d look at " + label + " first for this trip. I’ll compare what you gain there with the extra travel or evening convenience before we get into room prices.";
  if (lang === "ko") return "이 일정은 우선 " + label + " 쪽부터 볼게요. 객실 가격보다 먼저, 그 지역에서 편해지는 점과 이동·저녁 활동에서 생기는 차이를 같이 볼게요.";
  if (lang === "ru") return "Для этой поездки я бы сначала посмотрел " + label + ". Сначала сравню, что этот район упрощает и чем за это приходится платить во времени или вечерней мобильности.";
  if (lang === "zh") return "这趟行程我会先看" + label + "。我先比较住这里能省下什么，以及交通和晚上活动会多出什么，再看房价。";

  const p = result.parsed;
  const hasNorth = p.interests.includes("VinWonders") || p.interests.includes("Safari");
  const hasSouth = p.interests.includes("Hòn Thơm") || p.interests.includes("Sunset Town");
  const likesEvening =
    p.stayPreferences.includes("evening") ||
    p.stayPreferences.includes("walkable") ||
    p.stayPreferences.includes("food") ||
    p.stayPreferences.includes("cafe");

  if (area === "north" && hasNorth && likesEvening) {
    return "Nếu VinWonders với Safari là hai điểm chính thì mình hơi nghiêng về phía Bắc hơn, đi ban ngày sẽ nhẹ cho cả nhà. Nhưng nếu tối nhà mình hay ra ngoài ăn uống, cafe hay đi dạo thì Dương Đông dễ hơn; ở phía Bắc mà tối chạy xuống trung tâm thì tiền xe với thời gian cũng nên tính vào. Mình đặt hai hướng cạnh nhau cho bạn dễ chọn nha.";
  }

  if (area === "north" && hasNorth) {
    return "Nếu VinWonders với Safari là phần chính của chuyến đi thì mình hơi nghiêng về phía Bắc hơn. Đi lại ban ngày nhẹ hơn khá nhiều. Mình vẫn sẽ để ý phần buổi tối với tiền xe trước khi nói nhà mình nên chọn khu nào.";
  }

  if (area === "south" && hasSouth && likesEvening) {
    return "Nếu Hòn Thơm với Sunset Town là phần chính thì mình hơi nghiêng về phía Nam hơn. Ban ngày đỡ chạy xe, buổi tối cũng có nhiều thứ để làm quanh khu này. Mình sẽ đặt thêm một lựa chọn khác cạnh bên để nhà mình nhìn rõ được - mất gì trước khi chọn.";
  }

  return "Với chuyến này mình hơi nghiêng về " + label + " trước. Mình muốn nhìn cả cách đi, buổi tối quanh chỗ ở và tiền xe chứ chưa chọn theo giá phòng ngay. Tuỳ nhà mình thích kiểu nào hơn, mình đặt các hướng cạnh nhau cho dễ nhìn nha.";
}

function compactBubbleText(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "";
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const picked = sentences.slice(0, 2).join(" ");
  return picked.length <= 240 ? picked : picked.slice(0, 237).trimEnd() + "...";
}

function decisionTradeoffs(
  item: PlanningHotel,
  interests: string[],
  stayPreferences: string[],
) {
  const area = item.hotel.area_code;
  const likesEvening = stayPreferences.some((value) =>
    ["evening", "walkable", "food", "cafe"].includes(value),
  );
  const hasNorth = interests.some((value) => ["VinWonders", "Safari"].includes(value));
  const hasSouth = interests.some((value) => ["Hòn Thơm", "Sunset Town"].includes(value));
  const center = item.routeFacts?.find((fact) => fact.destinationId === "center:duong-dong");

  if (area === "north") {
    return {
      gain: hasNorth ? "Ban ngày đi Vin/Safari nhẹ hơn" : "Thuận các điểm phía Bắc",
      trade: likesEvening
        ? center
          ? `Tối xuống Dương Đông khoảng ${center.minutes} phút/lượt`
          : "Tối xuống Dương Đông phải tính thêm xe"
        : "Ít linh hoạt hơn nếu tối hay ra trung tâm",
    };
  }

  if (area === "duong_dong") {
    return {
      gain: likesEvening
        ? "Tối dễ ăn uống, cafe và đi dạo"
        : "Thuận sinh hoạt và trung tâm",
      trade: hasNorth
        ? "Đi Vin/Safari sẽ dài hơn"
        : hasSouth
          ? "Đi Nam đảo vẫn cần thêm thời gian xe"
          : "Không sát hẳn một cụm vui chơi lớn",
    };
  }

  if (area === "south") {
    return {
      gain: hasSouth ? "Hòn Thơm/Sunset Town nhẹ hơn" : "Thuận lịch Nam đảo",
      trade: hasNorth
        ? "Nếu còn đi Bắc đảo thì quãng xe tăng đáng kể"
        : "Xa trung tâm hơn nếu tối hay lên Dương Đông",
    };
  }

  if (area === "long_beach") {
    return {
      gain: "Cân giữa hơn khi lịch chia nhiều hướng",
      trade: "Không sát hẳn cụm Bắc hay Nam đảo",
    };
  }

  return {
    gain: "Có một vài điểm hợp với lịch của nhà mình",
    trade: "Mình vẫn cần nhìn thêm cách đi trước khi chốt",
  };
}

function decisionGuideText(
  item: PlanningHotel,
  interests: string[],
  stayPreferences: string[],
) {
  const area = item.hotel.area_code;
  const facts = item.routeFacts || [];
  const findFact = (id: string) => facts.find((fact) => fact.destinationId === id);
  const vin = findFact("activity:vinwonders");
  const safari = findFact("activity:safari");
  const center = findFact("center:duong-dong");
  const likesEvening = stayPreferences.some((value) =>
    ["evening", "walkable", "food", "cafe"].includes(value),
  );
  const hasNorth = interests.some((value) => ["VinWonders", "Safari"].includes(value));

  if (area === "north" && hasNorth) {
    const dayBits = [
      vin ? `VinWonders khoảng ${vin.minutes} phút` : "",
      safari ? `Safari khoảng ${safari.minutes} phút` : "",
    ].filter(Boolean);

    if (dayBits.length && center && likesEvening) {
      return `Ở hướng Bắc thì phần ban ngày nhẹ hơn: ${dayBits.join(", ")}. Đổi lại nếu tối xuống Dương Đông thì khoảng ${center.minutes} phút một chiều. Nhà mình coi phần nào quan trọng hơn thì chọn theo phần đó nha.`;
    }

    if (dayBits.length) {
      return `Ở hướng Bắc thì ${dayBits.join(", ")} từ mốc này. Mình thích hướng này nếu Vin với Safari là phần chính, nhưng vẫn nên nhìn phần buổi tối trước khi chốt.`;
    }

    return "Hướng Bắc làm lịch Vin với Safari gọn hơn. Mình chưa có đủ số km/phút cho mốc này nên chưa dùng con số để thuyết phục nhà mình.";
  }

  if (area === "duong_dong") {
    if (likesEvening && (vin || safari)) {
      const farBits = [
        vin ? `VinWonders khoảng ${vin.minutes} phút` : "",
        safari ? `Safari khoảng ${safari.minutes} phút` : "",
      ].filter(Boolean);
      return `Ở Dương Đông thì buổi tối linh hoạt hơn. Đổi lại phần đi Bắc đảo sẽ dài hơn: ${farBits.join(", ")} từ mốc đang so. Nếu nhà mình hay ra ngoài buổi tối thì hướng này đáng cân nhắc.`;
    }

    return "Dương Đông dễ xoay xở hơn cho ăn uống và buổi tối. Đổi lại, nếu lịch chính nằm ở Bắc hoặc Nam đảo thì sẽ có thêm thời gian trên xe.";
  }

  if (area === "south") {
    return "Ở phía Nam thì lịch Hòn Thơm và Sunset Town sẽ nhẹ hơn. Nếu nhà mình còn nhiều điểm phía Bắc thì mình sẽ đặt phần di chuyển cạnh nhau trước khi chọn.";
  }

  if (area === "long_beach") {
    return "Bãi Trường là kiểu ở cân giữa hơn. Không sát hẳn một cụm vui chơi, nhưng dễ chia lịch theo nhiều hướng hơn nếu chuyến đi của nhà mình không nghiêng hẳn về Bắc hay Nam.";
  }

  return `${areaDisplay(area)} là một hướng có thể cân nhắc. Mình sẽ nhìn cách đi và sinh hoạt quanh chỗ ở trước rồi mới bàn tới giá phòng.`;
}

function Discovery({
  context,
  compact = false,
}: {
  context?: DestinationContext;
  compact?: boolean;
}) {
  if (!context) return null;

  const eat = context.groups.eat;
  const cafe = context.groups.cafe;
  const things = context.groups.do;

  return (
    <div className={compact ? "discovery discovery--compact" : "discovery"}>
      <article>
        <span className="discovery-kicker">Ăn gì</span>
        {eat.venues.slice(0, compact ? 2 : 4).map((venue) => (
          <div className="discovery-row" key={venue.id}>
            <strong>{venue.name}</strong>
            {venue.distanceKm != null && <small>~{venue.distanceKm.toFixed(1)} km</small>}
          </div>
        ))}
        {eat.knowledge.slice(0, compact ? 2 : 3).map((item) => (
          <div className="discovery-row discovery-row--knowledge" key={item.id}>
            <strong>{item.title}</strong>
            {!compact && item.summary && <p>{item.summary}</p>}
          </div>
        ))}
      </article>

      <article>
        <span className="discovery-kicker">Cà phê</span>
        {cafe.venues.length ? (
          cafe.venues.slice(0, compact ? 2 : 4).map((venue) => (
            <div className="discovery-row" key={venue.id}>
              <strong>{venue.name}</strong>
              {venue.distanceKm != null && <small>~{venue.distanceKm.toFixed(1)} km</small>}
            </div>
          ))
        ) : (
          <p className="empty-note">Chưa có quán đủ dữ liệu trong lớp test này.</p>
        )}
      </article>

      <article>
        <span className="discovery-kicker">Có gì làm</span>
        {things.venues.slice(0, compact ? 2 : 4).map((venue) => (
          <div className="discovery-row" key={venue.id}>
            <strong>{venue.name}</strong>
            {venue.distanceKm != null && <small>~{venue.distanceKm.toFixed(1)} km</small>}
          </div>
        ))}
        {things.knowledge.slice(0, compact ? 2 : 3).map((item) => (
          <div className="discovery-row discovery-row--knowledge" key={item.id}>
            <strong>{item.title}</strong>
            {!compact && item.summary && <p>{item.summary}</p>}
          </div>
        ))}
      </article>
    </div>
  );
}

function HotelCard({
  item,
  stayPreferences,
}: {
  item: PlanningHotel;
  stayPreferences: string[];
}) {
  return (
    <article className="hotel-card">
      <div className="hotel-card-head">
        <span className={`fit-pill fit-${item.spatialFit}`}>
          {item.spatialFit === "direct"
            ? "Đúng hướng đi"
            : item.spatialFit === "balanced"
              ? "Cân bằng"
              : "Có thể cân nhắc"}
        </span>
        <small>{item.hotel.area_code}</small>
      </div>

      <h3>{item.hotel.canonical_name}</h3>
      {item.hotel.address && <p className="hotel-address">{item.hotel.address}</p>}
      <p className="stay-summary">{item.stayContext.summary}</p>

      {stayPreferences.length > 0 && (
        <div className="stay-signal-row">
          {item.stayContext.signals
            .filter((signal) => stayPreferences.includes(signal.key))
            .slice(0, 4)
            .map((signal) => (
              <span
                className={`stay-signal stay-signal--${signal.level}`}
                key={signal.key}
                title={signal.note}
              >
                {signalLabel(signal.key)} {levelLabel(signal.level)}
              </span>
            ))}
        </div>
      )}

      {item.routeFacts?.length ? (
        <div className="route-evidence">
          <div className="route-evidence-head">
            <strong>Đi lại từ đây</strong>
            <span>Dữ liệu tuyến đường</span>
          </div>
          {item.routeFacts.slice(0, 3).map((fact) => (
            <div className="route-evidence-row" key={fact.destinationId}>
              <span>{fact.label}</span>
              <b>~{fact.minutes} phút · {fact.distanceKm.toFixed(1)} km</b>
            </div>
          ))}
        </div>
      ) : null}

      <Discovery context={item.nearby} compact />
    </article>
  );
}

export default function App() {
  const sessionIdRef = useRef<string | null>(null);
  if (!sessionIdRef.current) sessionIdRef.current = getSessionId();

  const [input, setInput] = useState("");
  const [result, setResult] = useState<TripParseResponse | null>(null);
  const [plan, setPlan] = useState<TripBuildResponse | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorResponse | null>(null);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [apiError, setApiError] = useState("");
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [leadContact, setLeadContact] = useState("");
  const [leadConsent, setLeadConsent] = useState(false);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [replyText, setReplyText] = useState("");
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [activeDecisionArea, setActiveDecisionArea] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inFlightRef = useRef(false);
  const voiceRequestRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const guideCue = useMemo(() => directGuide(result, plan), [result, plan]);
  const firstGreeting =
    "Chào bạn. Mình là JoTrip. Bạn đang tính chuyến đi Phú Quốc thế nào?";

  const summaryBits = useMemo(() => {
    if (!result) return [];
    const p = result.parsed;
    return [
      p.days && p.nights ? `${p.days} ngày / ${p.nights} đêm` : "",
      p.adults ? `${p.adults} người lớn` : "",
      p.children ? `${p.children} trẻ em` : "",
      p.interests.length ? p.interests.join(" + ") : "",
      p.stayPreferences.length
        ? p.stayPreferences.map(preferenceLabel).join(" + ")
        : "",
    ].filter(Boolean);
  }, [result]);

  const preAdvice =
    advisor?.advice?.length
      ? advisor.advice
      : plan?.advice?.length
        ? plan.advice
        : [];

  const compareDirections = useMemo(() => {
    const hotels = plan?.planningHotels || [];
    const picked: typeof hotels = [];
    const areas = new Set<string>();

    for (const item of hotels) {
      if (!areas.has(item.hotel.area_code)) {
        areas.add(item.hotel.area_code);
        picked.push(item);
      }
      if (picked.length === 2) break;
    }

    return picked;
  }, [plan]);

  const activeDecision =
    activeDecisionArea
      ? compareDirections.find((item) => item.hotel.area_code === activeDecisionArea) || null
      : null;

  const activeDecisionText =
    activeDecision && result
      ? decisionGuideText(
          activeDecision,
          result.parsed.interests,
          result.parsed.stayPreferences,
        )
      : "";

  const assistantText =
    !result
      ? firstGreeting
      : busy
        ? "Để mình xem cách đi, khu ở và mấy phần ảnh hưởng tới chuyến này một chút nha."
        : activeDecisionText
          ? compactBubbleText(activeDecisionText)
          : compactBubbleText(
              replyText ||
              advisor?.answerText ||
              result.assistantText ||
              guideCue.text,
            ) ||
            "Mình đang theo chuyến này cùng bạn. Chỗ nào còn lăn tăn thì cứ hỏi tiếp.";

  const mascotState = resolveMascotState({
    hasResponse: Boolean(result),
    inputFocused,
    busy,
    speaking,
    comparing: Boolean(activeDecision) || guideCue.state === "compare",
    // Keep this false until a real review/live-data check is wired.
    checking: false,
    confirming: leadStatus === "sent",
    guiding:
      guideCue.target.startsWith("map:") ||
      guideCue.target.startsWith("discovery:"),
  });
  const mascotSrc = runtimeMascotPath(mascotState);

  async function speakResponse(text: string, lang: string) {
    const requestId = ++voiceRequestRef.current;
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
    setVoiceError("");

    // Read a brief answer, never the entire comparison or evidence cards.
    const compact = text.replace(/\s+/g, " ").trim()
      .split(/(?<=[.!?])\s+/u).slice(0, 2).join(" ").slice(0, 240);
    if (!compact) return;

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: compact, language: lang }),
      });

      if (!response.ok || !response.headers.get("content-type")?.includes("audio")) {
        throw new Error("natural_tts_unavailable");
      }

      const blob = await response.blob();
      // A newer answer or a manual voice-off action cancels pending playback.
      if (requestId !== voiceRequestRef.current) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      let released = false;
      const cleanup = () => {
        if (released) return;
        released = true;
        if (requestId === voiceRequestRef.current) setSpeaking(false);
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onplay = () => { if (requestId === voiceRequestRef.current) setSpeaking(true); };
      audio.onended = cleanup;
      audio.onpause = cleanup;
      audio.onerror = () => {
        cleanup();
        if (requestId === voiceRequestRef.current) {
          setVoiceOn(false);
          setVoiceError("Giọng đọc tự nhiên đang chưa sẵn sàng. Bạn vẫn có thể chat bằng chữ.");
        }
      };
      try {
        await audio.play();
      } catch {
        cleanup();
        throw new Error("audio_play_failed");
      }
    } catch {
      if (requestId === voiceRequestRef.current) {
        setSpeaking(false);
        setVoiceOn(false);
        setVoiceError("Giọng đọc tự nhiên đang chưa sẵn sàng. Bạn vẫn có thể chat bằng chữ.");
      }
    }
  }

  async function submit(text = input) {
    const value = text.trim();
    if (!value || inFlightRef.current) return;
    inFlightRef.current = true;
    setApiError("");
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    voiceRequestRef.current += 1;
    audioRef.current?.pause();
    setSpeaking(false);

    const previousResult = result;
    const previousPlan = plan;
    const previousAdvisor = advisor;

    setBusy(true);
    setHandoffOpen(false);
    setLeadStatus("idle");
    setActiveDecisionArea(null);
    setTurns((items) => [
      ...items,
      { id: crypto.randomUUID(), role: "user", text: value },
    ].slice(-12));

    try {
      const res = await fetch("/api/trip/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: value,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!res.ok) throw new Error("parse_failed");
      const json = (await res.json()) as TripParseResponse;
      if (!json.ok) throw new Error("parse_failed");

      if (json.conversationAction === "acknowledgement") {
        // A short "a"/"ừ"/"ok" is a continuation, not a fresh planning request.
        // Keep the existing result, compared options and context exactly as they were.
        if (!previousResult) setResult(json);
        const reply = json.assistantText || "Ừ, mình đang nghe. Bạn cứ nói tiếp nha.";
        setReplyText(reply);
        setTurns((items) => [...items, {
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply,
          language: previousResult?.parsed.language || json.parsed.language,
        }].slice(-12));
        if (voiceOn) void speakResponse(reply, previousResult?.parsed.language || json.parsed.language);
        return;
      }

      // The upcoming response must not sit beside a stale plan from the prior turn.
      setPlan(null);
      setAdvisor(null);
      const isFreshTrip = Boolean(json.parsed.days || json.parsed.nights);
      const inheritedInterests =
        previousResult && !isFreshTrip
          ? Array.from(new Set([
              ...previousResult.parsed.interests,
              ...json.parsed.interests,
            ]))
          : json.parsed.interests;
      const inheritedPreferences =
        previousResult && !isFreshTrip
          ? Array.from(new Set([
              ...previousResult.parsed.stayPreferences,
              ...json.parsed.stayPreferences,
            ]))
          : json.parsed.stayPreferences;
      const inheritedZone =
        json.parsed.mentionedZone ||
        previousPlan?.planningHotels?.[0]?.hotel.area_code ||
        previousAdvisor?.hotels?.[0]?.hotel.area_code ||
        previousAdvisor?.context?.zoneCode ||
        previousResult?.parsed.mentionedZone ||
        undefined;

      const contextualResult: TripParseResponse =
        previousResult && !isFreshTrip
          ? {
              ...json,
              aiSignals: Array.from(new Set([...(previousResult.aiSignals || []), ...(json.aiSignals || [])])),
              parsed: {
                ...previousResult.parsed,
                ...json.parsed,
                days: json.parsed.days ?? previousResult.parsed.days,
                nights: json.parsed.nights ?? previousResult.parsed.nights,
                adults: json.parsed.adults ?? previousResult.parsed.adults,
                children: json.parsed.children ?? previousResult.parsed.children,
                budgetVnd: json.parsed.budgetVnd ?? previousResult.parsed.budgetVnd,
                interests: inheritedInterests,
                stayPreferences: inheritedPreferences,
                mentionedZone: inheritedZone,
                raw: json.parsed.raw,
                language: json.parsed.language,
                mode: json.parsed.mode,
              },
            }
          : json;

      setResult(contextualResult);

      let spoken = json.assistantText || "";

      if (json.ok && json.parsed.mode === "trip_plan") {
        setAdvisor(null);
        const planRes = await fetch("/api/trip/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            adults: contextualResult.parsed.adults,
            children: contextualResult.parsed.children,
            interests: inheritedInterests,
            stayPreferences: inheritedPreferences,
            language: contextualResult.parsed.language,
            days: contextualResult.parsed.days,
            nights: contextualResult.parsed.nights,
            budgetVnd: contextualResult.parsed.budgetVnd,
          }),
        });
        if (!planRes.ok) throw new Error("build_failed");
        const nextPlan = (await planRes.json()) as TripBuildResponse;
        if (!nextPlan.ok) throw new Error("build_failed");
        setPlan(nextPlan);
        spoken = planningReply(contextualResult, nextPlan) || spoken;
      } else if (json.ok) {
        const advisorRes = await fetch("/api/advisor/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rawText: json.parsed.raw,
            language: json.parsed.language,
            mode: json.parsed.mode,
            interests: inheritedInterests,
            stayPreferences: inheritedPreferences,
            mentionedZone: inheritedZone,
          }),
        });
        if (!advisorRes.ok) throw new Error("advisor_failed");
        const nextAdvisor = (await advisorRes.json()) as AdvisorResponse;
        if (!nextAdvisor.ok) throw new Error("advisor_failed");

        if (json.parsed.mode === "contact") {
          setHandoffOpen(true);
          spoken = nextAdvisor.answerText || spoken;
        } else if (json.parsed.mode === "compare") {
          spoken =
            json.parsed.language === "vi" && previousPlan?.insights?.[0]?.body
              ? previousPlan.insights[0].body
              : nextAdvisor.answerText || spoken;
        } else {
          setAdvisor(nextAdvisor);
          spoken = nextAdvisor.answerText || spoken;
        }
      }

      setReplyText(spoken);
      if (spoken) {
        setTurns((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: spoken,
            language: json.parsed.language,
          },
        ].slice(-12));
      }

      if (voiceOn && json.ok && spoken) {
        void speakResponse(spoken, contextualResult.parsed.language);
      }
    } catch {
      // Network failures are UI status, not fabricated assistant transcript entries.
      setApiError("Kết nối đang gián đoạn. Bạn gửi lại câu vừa rồi giúp mình nhé.");
      setInput((current) => current || value);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  async function repriceWithDates() {
    if (!result || !checkin || !checkout) return;

    setBusy(true);
    try {
      const res = await fetch("/api/trip/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkin,
          checkout,
          adults: result.parsed.adults,
          children: result.parsed.children,
          interests: result.parsed.interests,
          stayPreferences: result.parsed.stayPreferences,
          language: result.parsed.language,
          days: result.parsed.days,
          nights: result.parsed.nights,
          budgetVnd: result.parsed.budgetVnd,
        }),
      });
      setPlan((await res.json()) as TripBuildResponse);
    } finally {
      setBusy(false);
    }
  }

  async function sendLead(event: FormEvent) {
    event.preventDefault();
    if (!result || !leadContact.trim() || !leadConsent) return;

    setLeadStatus("sending");
    try {
      const res = await fetch("/api/booking/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          contact: leadContact.trim(),
          language: result.parsed.language,
          consent: leadConsent,
          tripContext: {
            query: result.parsed.raw,
            parsed: result.parsed,
            checkin,
            checkout,
            plan,
            advisorMode: advisor?.mode,
          },
        }),
      });
      const json = await res.json();
      setLeadStatus(json.ok ? "sent" : "error");
    } catch {
      setLeadStatus("error");
    }
  }

  // Only the unanswered phone welcome needs a shorter hint; desktop copy stays unchanged.
  const isPhoneWelcome = typeof window !== "undefined" &&
    window.matchMedia("(max-width: 560px)").matches;
  const hasResponse = Boolean(result);
  const canHandoff = Boolean(
    result &&
      (plan?.planningHotels?.length ||
        plan?.scenarios?.length ||
        advisor?.context ||
        advisor?.hotels?.length),
  );

  return (
    <main className={hasResponse ? "app app--active" : "app"}>
      <div className="mascot-preload" aria-hidden="true">
        {(["greeting","listening","thinking","speaking"] as const).map((state) => (
          <img src={runtimeMascotPath(state)} alt="" key={state} />
        ))}
      </div>
      <header className="topbar">
        <a className="brand" href="/" aria-label="JoTrip">
          {hasResponse ? (
            <img src="/assets/jotrip-logo.webp" alt="JoTrip" />
          ) : (
            <picture>
              <source media="(max-width: 560px)" srcSet="/assets/approved-jo-trip-intro.png" />
              <img src="/assets/jotrip-logo.webp" alt="JoTrip" />
            </picture>
          )}
        </a>

        <div className="top-actions"><span className="language-line">VI · EN · KO · RU · 中文</span></div>
      </header>

      <div className="page-shell">
        <section className={hasResponse ? "conversation-hero conversation-hero--active" : "conversation-hero conversation-hero--fresh"}>
          {!hasResponse && <div className="warm-island-scene" aria-hidden="true" />}
          <div className="hero-copy">
            <span className="eyebrow">JOTRIP · PHÚ QUỐC</span>
            <h1>{hasResponse ? "Cứ hỏi tiếp, mình đang theo chuyến này." : <>Tri thức <span className="welcome-destination">Phú Quốc</span><br className="welcome-mobile-break" />{" "}biết trò chuyện.</>}</h1>
            {!hasResponse && (
              <p>
                Cứ kể chuyến đi như bạn vẫn nói với một người ở đảo. JoTrip sẽ hiểu hoàn cảnh,
                nói trước điều đáng cân nhắc rồi mới mở dữ liệu chi tiết khi cần.
              </p>
            )}
          </div>

          {!hasResponse && <div className="assistant-stage">
            <div
              className={[
                "mascot-shell",
                `mascot-state-${mascotState}`,
                speaking ? "mascot-is-talking" : "",
                busy ? "mascot-is-thinking" : "",
              ].filter(Boolean).join(" ")}
              data-mascot-state={mascotState}
            >
              <img
                key={mascotSrc}
                className="mascot-frame mascot-frame--state"
                src={mascotSrc}
                alt={hasResponse ? "JoTrip Guide" : "JoTrip đang vẫy tay chào bạn"}
              />
              <div className="voice-bars" aria-hidden="true">
                <i></i><i></i><i></i><i></i>
              </div>
            </div>
            <div className="assistant-bubble" aria-live="polite">
              <span>JoTrip</span>
              <p>{assistantText}</p>
              {busy && (
                <div className="working-line" aria-live="polite">
                  <i></i><span>Đang đọc ngữ cảnh chuyến đi và ráp các phần liên quan</span>
                </div>
              )}
            </div>
          </div>}

          <form className="prompt" onSubmit={onSubmit}>
            {hasResponse && <img className="composer-mascot" src={mascotSrc} data-state={mascotState} alt="" aria-hidden="true" />}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onInput={(event) => {
                event.currentTarget.style.height = "auto";
                event.currentTarget.style.height = Math.min(event.currentTarget.scrollHeight, 132) + "px";
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={
                hasResponse
                  ? "Hỏi tiếp JoTrip..."
                  : isPhoneWelcome
                    ? "Ví dụ: 3 ngày 2 đêm, có bé..."
                    : "Cứ nói tự nhiên, ví dụ: nhà mình 3 ngày 2 đêm, có bé, muốn chơi Vin nhưng tối vẫn thích ra ngoài ăn."
              }
              rows={1}
              aria-label="Hỏi JoTrip"
            />
            <button type="submit" disabled={busy}>
              {busy ? "Đang xem..." : hasResponse ? "Gửi" : "Hỏi JoTrip"}
            </button>
          </form>
          {apiError && <p className="composer-error" role="alert">{apiError}</p>}
          {voiceError && <p className="composer-error" role="status">{voiceError}</p>}

          {!hasResponse && (
            <LivingWelcome
              onExplore={(prompt) => void submit(prompt)}
              onWrite={() => textareaRef.current?.focus()}
              disabled={busy}
            />
          )}

          <div className="prompt-note">
            Bạn không cần điền form. Cứ nói như đang hỏi một người ở đảo.
          </div>

          <div className="trust-line">
            <span>Chưa chắc thì nói chưa chắc</span>
            <span>Không bịa giá, quán hay tồn phòng</span>
            <span>Thấy ổn rồi mới chuyển sang booking</span>
          </div>
          {!hasResponse && <div className="warm-brand-whisper" aria-hidden="true">PHÚ QUỐC · NHIỀU HƠN MỘT CHUYẾN ĐI</div>}
        </section>

        {result && (
          <section className="workspace">
            <div className="conversation-thread">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div className="message message--user" key={turn.id}>
                    <span>Bạn</span>
                    <p>{turn.text}</p>
                  </div>
                ) : (
                  <div className="message message--assistant" key={turn.id}>
                    <div className="message-avatar message-avatar--mascot">
                      <img src={runtimeMascotPath("speaking")} alt="" aria-hidden="true" />
                    </div>
                    <div>
                      <span>JoTrip</span>
                      <p>{turn.text}</p>
                    </div>
                  </div>
                ),
              )}

              {busy && (
                <div className="message message--assistant message--pending" role="status">
                  <div className="message-avatar message-avatar--mascot">
                    <img src={runtimeMascotPath("thinking")} alt="" aria-hidden="true" />
                  </div>
                  <div><span>JoTrip</span><p>Đang xem câu hỏi của bạn...</p></div>
                </div>
              )}

              <div className="conversation-language" aria-label="Ngôn ngữ hội thoại">
                {languageNames[result.parsed.language] || result.parsed.language}
              </div>
            </div>

            <TripPulse
              summary={summaryBits}
              aiSignals={(result.aiSignals || []).map((signal) => ({
                slow_pace: "Muốn ít di chuyển",
                family_focus: "Ưu tiên gia đình",
                food_focus: "Quan tâm ăn uống",
                beach_focus: "Thích biển",
                evening_focus: "Thích hoạt động buổi tối",
                quiet_focus: "Thích không gian yên tĩnh",
              })[signal])}
              hotels={plan?.planningHotels || []}
              selectedArea={activeDecisionArea}
              onSelectArea={setActiveDecisionArea}
            />

            {preAdvice.length > 0 && (
              <section className="pre-advice">
                <div className="pre-advice-head">
                  <span className="label">TRƯỚC KHI XEM CHI TIẾT</span>
                  <h2>Mình nghĩ bạn nên để ý mấy điều này.</h2>
                </div>
                <div className="pre-advice-list">
                  {preAdvice.map((tip, index) => (
                    <article key={tip}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>{tip}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {result.parsed.mode === "trip_plan" && compareDirections.length >= 2 && (
              <section className="decision-canvas" aria-label="So sánh hai cách ở">
                <div className="decision-canvas-head">
                  <span className="label">MÌNH ĐẶT HAI HƯỚNG CẠNH NHAU</span>
                  <h2>Nhà mình thích kiểu nào hơn?</h2>
                  <p>
                    Không có hướng nào thắng tuyệt đối. Mỗi chỗ sẽ nhẹ ở một phần và đổi lại ở một phần khác.
                  </p>
                </div>

                <div className="decision-hint">Chạm từng hướng - JoTrip sẽ nói phần được và phần đổi lại.</div>

                <div className="decision-cards">
                  {compareDirections.map((item) => {
                    const isActive = activeDecision?.hotel.area_code === item.hotel.area_code;
                    return (
                      <button
                        className={isActive ? "decision-card decision-card--active" : "decision-card"}
                        key={item.hotel.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setActiveDecisionArea(item.hotel.area_code);
                          const text = decisionGuideText(
                            item,
                            result.parsed.interests,
                            result.parsed.stayPreferences,
                          );
                          if (voiceOn && text) void speakResponse(text, result.parsed.language);
                        }}
                      >
                        <div className="decision-card-top">
                          <span>{areaDisplay(item.hotel.area_code)}</span>
                          <small>{isActive ? "JoTrip đang nói về hướng này" : "Chạm để nghe"}</small>
                        </div>
                        <h3>{item.hotel.canonical_name}</h3>
                        <p>{item.stayContext.summary}</p>

                        {(() => {
                          const tradeoff = decisionTradeoffs(
                            item,
                            result.parsed.interests,
                            result.parsed.stayPreferences,
                          );
                          return (
                            <div className="decision-tradeoffs">
                              <div>
                                <span>Được</span>
                                <b>{tradeoff.gain}</b>
                              </div>
                              <div>
                                <span>Đổi lại</span>
                                <b>{tradeoff.trade}</b>
                              </div>
                            </div>
                          );
                        })()}

                        {item.routeFacts?.length ? (
                          <div className="decision-route-list">
                            {item.routeFacts.slice(0, 3).map((fact) => (
                              <div key={fact.destinationId}>
                                <span>{fact.label}</span>
                                <b>~{fact.minutes} phút · {fact.distanceKm.toFixed(1)} km</b>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="decision-route-pending">
                            Mình chưa có đủ số km/phút cho mốc này, nên chưa dùng con số để thuyết phục bạn.
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {advisor?.context && (
              <section className="answer-surface">
                <Discovery context={advisor.context} />
              </section>
            )}

            {advisor?.hotels?.length ? (
              <section className="answer-surface">
                <div className="section-heading">
                  <span className="label">Ở KHU NÀO HỢP HƠN</span>
                  <h2>So cách sống quanh khách sạn, không chỉ nhìn phòng.</h2>
                </div>
                <div className="hotel-grid">
                  {advisor.hotels.map((item) => (
                    <article className="hotel-card" key={item.hotel.id}>
                      <div className="hotel-card-head">
                        <span className={`fit-pill fit-${item.spatialFit}`}>
                          {item.spatialFit === "direct" ? "Đúng hướng đi" : "Cân nhắc"}
                        </span>
                        <small>{item.hotel.area_code}</small>
                      </div>
                      <h3>{item.hotel.canonical_name}</h3>
                      <p className="stay-summary">{item.stayContext.summary}</p>
                      <div className="stay-signal-row">
                        {item.stayContext.signals
                          .filter((signal) => result.parsed.stayPreferences.includes(signal.key))
                          .slice(0, 4)
                          .map((signal) => (
                            <span
                              className={`stay-signal stay-signal--${signal.level}`}
                              key={signal.key}
                            >
                              {signalLabel(signal.key)} {levelLabel(signal.level)}
                            </span>
                          ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {result.parsed.mode === "trip_plan" && (
              <section className="trip-controls">
                <div className="trip-controls-copy">
                  <span className="label">NẾU MUỐN TÍNH TIẾP</span>
                  <h2>Cho mình ngày đi nha.</h2>
                  <p>
                    Có ngày cụ thể thì mình mới kiểm tra tiếp phần phòng, vé và tổng chi phí cho đúng chuyến của nhà mình.
                  </p>
                </div>

                <div className="date-row">
                  <label>
                    <span>Nhận phòng</span>
                    <input
                      type="date"
                      value={checkin}
                      onChange={(event) => setCheckin(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Trả phòng</span>
                    <input
                      type="date"
                      value={checkout}
                      onChange={(event) => setCheckout(event.target.value)}
                    />
                  </label>
                  <button
                    disabled={!checkin || !checkout || busy}
                    onClick={() => void repriceWithDates()}
                    type="button"
                  >
                    Tính theo ngày này
                  </button>
                </div>
              </section>
            )}

            {plan?.mode === "planning" && plan.planningHotels?.length ? (
              <details className="evidence-drawer">
                <summary>
                  <span>
                    <small>CHI TIẾT PHÍA SAU LỜI KHUYÊN</small>
                    <b>Xem các chỗ ở mình đang dùng để so</b>
                  </span>
                  <em>Xem</em>
                </summary>
                <section className="answer-surface answer-surface--inside">
                  <div className="section-heading">
                    <span className="label">Ở ĐÂU HỢP HƠN</span>
                    <h2>Mình đang nhìn vị trí trước giá.</h2>
                    <p>
                      Giá phòng là một phần. Mình còn nhìn cách đi, thời gian trên xe và buổi tối quanh chỗ ở.
                    </p>
                  </div>

                  <div className="hotel-grid">
                    {plan.planningHotels.map((item) => (
                      <HotelCard
                        item={item}
                        stayPreferences={result.parsed.stayPreferences}
                        key={item.hotel.id}
                      />
                    ))}
                  </div>
                </section>
              </details>
            ) : null}

            {plan?.insights?.length ? (
              <section className="insight-list">
                {plan.insights.map((insight) => (
                  <article className="insight-card" key={insight.title}>
                    <span className="label">JOTRIP NHẬN THẤY</span>
                    <h3>{insight.title}</h3>
                    <p>{insight.body}</p>
                  </article>
                ))}
              </section>
            ) : null}

            {plan?.scenarios?.length ? (
              <section className="answer-surface">
                <div className="section-heading">
                  <span className="label">SO PHƯƠNG ÁN</span>
                  <h2>Tổng tiền và thời gian đặt cạnh nhau.</h2>
                </div>

                <div className="scenario-list">
                  {plan.scenarios.map((scenario) => (
                    <article className="scenario-card" key={scenario.id}>
                      <div className="scenario-card-head">
                        <div>
                          <span>PHƯƠNG ÁN</span>
                          <h3>{scenario.hotelName}</h3>
                        </div>
                        <strong>{money(scenario.metrics.totalCostVnd)}</strong>
                      </div>

                      <div className="scenario-lines">
                        <span>Phòng <b>{money(scenario.hotelCostVnd)}</b></span>
                        <span>Xe <b>{money(scenario.mobilityCostVnd)}</b></span>
                        <span>Vé <b>{money(scenario.activityCostVnd)}</b></span>
                        <span>Di chuyển <b>~{scenario.driveMinutes} phút</b></span>
                      </div>

                      {scenario.stayContext && (
                        <div className="stay-context-block">
                          <strong>Sống quanh đây</strong>
                          <span>{scenario.stayContext.summary}</span>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {plan?.destinationContext && result.parsed.mode === "trip_plan" && (
              <section className="answer-surface">
                <div className="section-heading">
                  <span className="label">QUANH KHU NÀY</span>
                  <h2>Ăn gì, cà phê ở đâu, còn gì để làm?</h2>
                </div>
                <Discovery context={plan.destinationContext} />
              </section>
            )}

            {canHandoff && (
              <section className="handoff-card">
                <div>
                  <span className="label">KHI BẠN THẤY ỔN</span>
                  <h2>Chuyển phương án này cho JoTrip kiểm tra booking.</h2>
                  <p>
                    Chưa thanh toán ở đây. JoTrip sẽ kiểm tra lại phòng, vé và xe rồi mới liên hệ xác nhận.
                  </p>
                </div>

                {!handoffOpen ? (
                  <button className="handoff-button" onClick={() => setHandoffOpen(true)} type="button">
                    Tôi muốn JoTrip kiểm tra
                  </button>
                ) : (
                  <form className="handoff-form" onSubmit={sendLead}>
                    <input
                      value={leadContact}
                      onChange={(event) => setLeadContact(event.target.value)}
                      placeholder="Số điện thoại, email hoặc WhatsApp"
                      aria-label="Thông tin liên hệ"
                    />
                    <label className="consent-row">
                      <input
                        type="checkbox"
                        checked={leadConsent}
                        onChange={(event) => setLeadConsent(event.target.checked)}
                      />
                      <span>Tôi đồng ý để JoTrip liên hệ về chuyến đi này.</span>
                    </label>
                    <button
                      type="submit"
                      disabled={!leadContact.trim() || !leadConsent || leadStatus === "sending"}
                    >
                      {leadStatus === "sending" ? "Đang gửi..." : "Gửi cho JoTrip"}
                    </button>
                    {leadStatus === "sent" && (
                      <p className="lead-success">Đã nhận. JoTrip sẽ dùng đúng phương án bạn vừa xem để kiểm tra lại.</p>
                    )}
                    {leadStatus === "error" && (
                      <p className="lead-error">Chưa gửi được. Thử lại sau một chút.</p>
                    )}
                  </form>
                )}
              </section>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
