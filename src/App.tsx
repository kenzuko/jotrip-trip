import { FormEvent, useMemo, useRef, useState } from "react";
import type {
  AdvisorResponse,
  DestinationContext,
  PlanningHotel,
  TripBuildResponse,
  TripParseResponse,
} from "./types";
import { directGuide } from "./guideDirector";

const examples = [
  { label: "VI", text: "3 ngày 2 đêm, 2 người, chơi Vin, thích ăn ngon và cà phê" },
  { label: "EN", text: "Where should we stay for Safari, coffee and quiet evenings?" },
  { label: "한국어", text: "선셋타운 근처에서 저녁에 뭐 하고 어디서 먹어요?" },
  { label: "RU", text: "Где лучше жить, если хотим Сафари и хорошие кафе?" },
  { label: "中文", text: "住在日落小镇附近有什么好吃的和可以玩的？" },
];

const languageNames: Record<string, string> = {
  vi: "VI",
  en: "EN",
  ko: "KO",
  ru: "RU",
  zh: "中文",
};

function voiceLocale(lang = "vi") {
  return {
    vi: "vi-VN",
    en: "en-US",
    ko: "ko-KR",
    ru: "ru-RU",
    zh: "zh-CN",
  }[lang] || "vi-VN";
}

function voiceRate(lang = "vi") {
  if (lang === "vi") return 1.18;
  if (lang === "ko" || lang === "zh") return 1.1;
  return 1.14;
}

function pickVoice(lang: string) {
  if (!("speechSynthesis" in window)) return null;

  const locale = voiceLocale(lang).toLowerCase();
  const base = locale.split("-")[0];
  const preferredNames =
    lang === "vi"
      ? /linh|hoai|mai|siri|natural|premium|enhanced|neural/i
      : /siri|natural|premium|enhanced|neural|google|microsoft/i;

  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => {
      const value = String(voice.lang || "").toLowerCase();
      return value === locale || value.startsWith(base);
    });

  const score = (voice: SpeechSynthesisVoice) => {
    let value = voice.lang.toLowerCase() === locale ? 40 : 15;
    if (preferredNames.test(voice.name)) value += 40;
    if (/apple|google|microsoft/i.test(voice.name)) value += 12;
    if (voice.localService) value += 5;
    return value;
  };

  return voices.sort((a, b) => score(b) - score(a))[0] || null;
}

function speak(text: string, lang = "vi") {
  if (!("speechSynthesis" in window)) return;

  const engine = window.speechSynthesis;
  engine.cancel();

  const compact = text
    .replace(/\s+/g, " ")
    .replace(/\s*[-:]+\s*/g, ", ")
    .trim()
    .slice(0, 165);

  if (!compact) return;

  const utterance = new SpeechSynthesisUtterance(compact);
  utterance.lang = voiceLocale(lang);
  utterance.rate = voiceRate(lang);
  utterance.pitch = 1.02;
  utterance.volume = 0.94;

  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;

  engine.speak(utterance);
}

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

  if (lang === "en") return "I’d look at " + label + " first for this trip. Before you choose dates, I’m comparing the area, travel time and what life around the hotel is like.";
  if (lang === "ko") return "이 일정은 우선 " + label + " 쪽부터 볼게요. 날짜를 정하기 전에는 객실 가격보다 위치, 이동 시간, 숙소 주변 생활을 먼저 비교합니다.";
  if (lang === "ru") return "Для этой поездки я бы сначала посмотрел район " + label + ". До выбора дат сравниваю расположение, дорогу и то, насколько удобно жить вокруг отеля.";
  if (lang === "zh") return "这趟行程我会先看" + label + "。在你选日期之前，我先比较区域、交通时间和酒店周边是否方便。";
  return "Với chuyến này, mình sẽ nhìn " + label + " trước. Chưa có ngày thì mình chưa vội dùng giá phòng, mà so khu ở, thời gian đi xe và sống quanh khách sạn có tiện không.";
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
  const [voiceOn, setVoiceOn] = useState(true);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [leadContact, setLeadContact] = useState("");
  const [leadConsent, setLeadConsent] = useState(false);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [replyText, setReplyText] = useState("");
  const [turns, setTurns] = useState<LocalTurn[]>([]);

  const guideCue = useMemo(() => directGuide(result, plan), [result, plan]);
  const mascotSrc =
    guideCue.action === "point" ||
    guideCue.action === "compare" ||
    guideCue.state === "warning"
      ? "/assets/jotrip-guide-point.webp"
      : "/assets/jotrip-guide-short.webp";
  const assistantText =
    replyText ||
    advisor?.answerText ||
    result?.assistantText ||
    guideCue.text;

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

  async function submit(text = input) {
    const value = text.trim();
    if (!value) return;

    const previousResult = result;
    const previousPlan = plan;
    const previousAdvisor = advisor;

    setBusy(true);
    setHandoffOpen(false);
    setLeadStatus("idle");
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

      const json = (await res.json()) as TripParseResponse;
      setResult(json);

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
        undefined;

      let spoken = json.assistantText || "";

      if (json.ok && json.parsed.mode === "trip_plan") {
        setAdvisor(null);
        const planRes = await fetch("/api/trip/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            adults: json.parsed.adults || previousResult?.parsed.adults,
            children: json.parsed.children ?? previousResult?.parsed.children,
            interests: inheritedInterests,
            stayPreferences: inheritedPreferences,
            budgetVnd: json.parsed.budgetVnd || previousResult?.parsed.budgetVnd,
          }),
        });
        const nextPlan = (await planRes.json()) as TripBuildResponse;
        setPlan(nextPlan);
        spoken = planningReply(json, nextPlan) || spoken;
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
        const nextAdvisor = (await advisorRes.json()) as AdvisorResponse;

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
        window.setTimeout(() => speak(spoken, json.parsed.language), 60);
      }
    } finally {
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
      <header className="topbar">
        <a className="brand" href="/" aria-label="JoTrip">
          <img src="/assets/jotrip-logo.webp" alt="JoTrip" />
        </a>

        <div className="top-actions">
          <span className="language-line">VI · EN · KO · RU · 中文</span>
          <button
            className={voiceOn ? "quiet active" : "quiet"}
            onClick={() => setVoiceOn((value) => !value)}
            type="button"
          >
            {voiceOn ? "Giọng nói bật" : "Giọng nói tắt"}
          </button>
        </div>
      </header>

      <div className="page-shell">
        <section className="conversation-hero">
          <div className="hero-copy">
            <span className="eyebrow">JOTRIP · PHÚ QUỐC</span>
            <h1>Hỏi như đang nói với một người ở đảo.</h1>
            <p>
              Giá phòng, khu ở, xe, vé, ăn gì, cà phê ở đâu, hôm đó nên đi đâu.
              JoTrip trả lời trước. Khi thấy phương án ổn thì mới chuyển sang booking.
            </p>
          </div>

          <div className="assistant-stage">
            <div className={`mascot-shell mascot-${guideCue.state}`}>
              <img src={mascotSrc} alt="JoTrip Guide" />
            </div>
            <div className="assistant-bubble">
              <span>JoTrip Guide</span>
              <p>{assistantText || "Bạn cứ hỏi. Mình tính phần khó."}</p>
            </div>
          </div>

          <form className="prompt" onSubmit={onSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ví dụ: 3 ngày 2 đêm chơi Vin thì nên ở đâu? Tối muốn đi bộ và ăn ngon."
              rows={3}
              aria-label="Hỏi JoTrip"
            />
            <button type="submit" disabled={busy}>
              {busy ? "Đang xem..." : "Hỏi JoTrip"}
            </button>
          </form>

          <div className="example-chips" aria-label="Ví dụ đa ngôn ngữ">
            {examples.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setInput(example.text);
                  void submit(example.text);
                }}
              >
                <b>{example.label}</b>
                <span>{example.text}</span>
              </button>
            ))}
          </div>

          <div className="trust-line">
            <span>Không đủ dữ liệu thì nói chưa đủ</span>
            <span>Không tự bịa giá, quán hay tồn phòng</span>
          </div>
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
                    <div className="message-avatar">J</div>
                    <div>
                      <span>JoTrip</span>
                      <p>{turn.text}</p>
                    </div>
                  </div>
                ),
              )}

              {summaryBits.length > 0 && (
                <div className="conversation-context">
                  <span className="language-pill">
                    {languageNames[result.parsed.language] || result.parsed.language}
                  </span>
                  {summaryBits.map((bit) => <span key={bit}>{bit}</span>)}
                </div>
              )}
            </div>

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
                  <span className="label">MUỐN TÍNH GIÁ THẬT</span>
                  <h2>Cho mình ngày đi.</h2>
                  <p>
                    Chưa có ngày, JoTrip chỉ so khu ở và cách đi. Có ngày mới mở lớp giá phòng,
                    vé và tổng chi phí.
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
              <section className="answer-surface">
                <div className="section-heading">
                  <span className="label">Ở ĐÂU HỢP HƠN</span>
                  <h2>JoTrip đang so vị trí trước giá.</h2>
                  <p>
                    Một phòng rẻ chưa chắc làm chuyến đi rẻ hơn nếu phải đổi lại bằng nhiều giờ trên xe.
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
