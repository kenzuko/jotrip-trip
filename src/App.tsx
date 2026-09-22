import { FormEvent, useMemo, useRef, useState } from "react";
import type { TripBuildResponse, TripParseResponse } from "./types";
import { directGuide } from "./guideDirector";

const examples = [
  { label: "VI", text: "3 ngày 2 đêm, 2 người, muốn ăn ngon và chơi Vin" },
  { label: "EN", text: "3 days 2 nights, 2 adults, beach, coffee and Safari" },
  { label: "한국어", text: "성인 2명, 3박 4일, 사파리와 카페, 조용한 숙소" },
  { label: "RU", text: "4 дня 3 ночи, 2 взрослых, пляж, кафе и Сафари" },
  { label: "中文", text: "4天3晚，2位成人，想去海滩、咖啡店和Safari" },
];

const languageNames: Record<string, string> = {
  vi: "Tiếng Việt",
  en: "English",
  ko: "한국어",
  ru: "Русский",
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
  return lang === "vi" ? 1.1 : lang === "zh" || lang === "ko" ? 1.04 : 1.06;
}

function pickVoice(lang: string) {
  if (!("speechSynthesis" in window)) return null;
  const locale = voiceLocale(lang).toLowerCase();
  const base = locale.split("-")[0];
  const voices = window.speechSynthesis.getVoices();
  const candidates = voices.filter((voice) => {
    const value = String(voice.lang || "").toLowerCase();
    return value === locale || value.startsWith(base);
  });

  const quality = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    let score = voice.lang.toLowerCase() === locale ? 30 : 10;
    if (/premium|enhanced|natural|neural|siri/.test(name)) score += 30;
    if (/google|microsoft|apple/.test(name)) score += 10;
    if (voice.localService) score += 4;
    return score;
  };

  return candidates.sort((a, b) => quality(b) - quality(a))[0] || null;
}

function speak(text: string, lang = "vi") {
  if (!("speechSynthesis" in window)) return;
  const engine = window.speechSynthesis;
  engine.cancel();

  const compact = text.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!compact) return;

  const utterance = new SpeechSynthesisUtterance(compact);
  utterance.lang = voiceLocale(lang);
  utterance.rate = voiceRate(lang);
  utterance.pitch = 1;
  utterance.volume = 0.95;

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
  if (value === "strong") return "Tốt";
  if (value === "moderate") return "Khá";
  return "Hạn chế";
}

function money(value?: number) {
  if (!value) return "Chưa tính";
  return new Intl.NumberFormat("vi-VN").format(value) + "đ";
}

export default function App() {
  const sessionIdRef = useRef<string | null>(null);
  if (!sessionIdRef.current) sessionIdRef.current = getSessionId();

  const [input, setInput] = useState("");
  const [result, setResult] = useState<TripParseResponse | null>(null);
  const [plan, setPlan] = useState<TripBuildResponse | null>(null);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);

  const guideCue = useMemo(() => directGuide(result, plan), [result, plan]);
  const guideText =
    result && result.parsed.language !== "vi"
      ? result.assistantText || guideCue.text
      : guideCue.text;

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

    setBusy(true);
    setPlan(null);

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

      if (json.ok) {
        const planRes = await fetch("/api/trip/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            adults: json.parsed.adults,
            children: json.parsed.children,
            interests: json.parsed.interests,
            stayPreferences: json.parsed.stayPreferences,
            budgetVnd: json.parsed.budgetVnd,
          }),
        });
        setPlan((await planRes.json()) as TripBuildResponse);
      }

      if (voiceOn && json.ok) {
        const spoken = json.assistantText || "Mình hiểu rồi. Để mình tính tiếp nha.";
        window.setTimeout(() => speak(spoken, json.parsed.language), 80);
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

  return (
    <main className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="JoTrip">
          <img src="/assets/jotrip-logo.webp" alt="JoTrip" />
        </a>
        <div className="top-actions">
          <span className="engine-badge">ENGINE TEST</span>
          <button
            className={voiceOn ? "quiet active" : "quiet"}
            onClick={() => setVoiceOn((value) => !value)}
            type="button"
          >
            {voiceOn ? "Âm thanh bật" : "Âm thanh tắt"}
          </button>
        </div>
      </header>

      <div className="page-shell">
        <section className="hero">
          <aside className={`guide-card guide-${guideCue.state}`}>
            <div className="guide-photo">
              <img src="/assets/jotrip-guide-short.webp" alt="JoTrip Guide" />
            </div>
            <div className="guide-copy">
              <span>JOTRIP GUIDE</span>
              <p>{guideText}</p>
            </div>
          </aside>

          <div className="search-panel">
            <div className="search-heading">
              <span>TRIP ENGINE · PHÚ QUỐC</span>
              <h1>Bạn cứ nói chuyến đi mình muốn.</h1>
              <p>
                Mình sẽ tính giúp khu ở, thời gian đi xe, vé và giá phòng - rồi cho bạn thấy
                phương án nào hợp hơn. Có thể gõ bằng Tiếng Việt, English, 한국어, Русский hoặc 中文.
              </p>
            </div>

            <form className="prompt" onSubmit={onSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Ví dụ: 3 ngày 2 đêm, 2 người, thích ăn ngon, cà phê và biển..."
                rows={3}
                aria-label="Mô tả chuyến đi"
              />
              <button type="submit" disabled={busy}>
                {busy ? "Đang tính..." : "Lên chuyến đi"}
              </button>
            </form>

            <div className="examples" aria-label="Ví dụ đa ngôn ngữ">
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

            <div className="engine-notes">
              <span>Dữ liệu test hiện dùng snapshot + D1 hiện có</span>
              <span>Không tự bịa giá hoặc quán khi thiếu dữ liệu</span>
            </div>
          </div>
        </section>

        {result && (
          <section className="workspace">
            <div className="understood card">
              <div>
                <span className="label">JOTRIP ĐÃ HIỂU</span>
                <h2>{result.parsed.raw}</h2>
              </div>
              <div className="understood-meta">
                <span className="language-pill">
                  {languageNames[result.parsed.language] || result.parsed.language}
                </span>
                {summaryBits.map((bit) => <span key={bit}>{bit}</span>)}
              </div>
              {result.assumptions.length > 0 && (
                <p className="soft-note">{result.assumptions.join(" ")}</p>
              )}
            </div>

            <section className="scenario-shell card">
              <div className="scenario-heading">
                <span className="label">TÍNH THEO ĐÚNG NGÀY</span>
                <h2>
                  {plan?.mode === "priced"
                    ? "Các phương án cho ngày bạn chọn"
                    : "Chọn ngày để mở lớp giá phòng"}
                </h2>
                <p>
                  Engine giữ riêng giá phòng, vé và xe để nhìn rõ trade-off, thay vì
                  gom thành một con số khó kiểm tra.
                </p>

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
                    Kiểm tra ngày này
                  </button>
                </div>
              </div>

              <div className="status-grid">
                <article>
                  <span>Vé tạm tính</span>
                  <strong>{money(plan?.activityCostVnd)}</strong>
                  <small>Theo ngày hiệu lực</small>
                </article>
                <article>
                  <span>Giá phòng</span>
                  <strong>
                    {plan?.mode === "priced"
                      ? plan.hotelOfferCount
                        ? `${plan.hotelOfferCount} mức giá`
                        : "Chưa có giá phù hợp"
                      : "Chờ ngày"}
                  </strong>
                  <small>Không dùng giá cũ để lấp chỗ trống</small>
                </article>
                <article>
                  <span>Xe riêng</span>
                  <strong>Theo tuyến</strong>
                  <small>Tính từ các chặng đã biết</small>
                </article>
                <article>
                  <span>Nguồn test</span>
                  <strong>Snapshot + D1</strong>
                  <small>CMS sync để giai đoạn sau</small>
                </article>
              </div>
            </section>

            {plan?.mode === "planning" && plan.planningHotels?.length ? (
              <section className="content-section">
                <div className="section-heading">
                  <span className="label">Ở ĐÂU HỢP HƠN?</span>
                  <h2>So vị trí trước khi so giá.</h2>
                  <p>
                    Chưa có ngày thì chỉ đánh giá khu ở, nhịp sống quanh khách sạn và
                    quãng đường - chưa dùng giá phòng.
                  </p>
                </div>

                <div className="hotel-grid">
                  {plan.planningHotels.map((item) => (
                    <article className="hotel-card" key={item.hotel.id}>
                      <div className="hotel-card-head">
                        <span className={`fit-pill fit-${item.spatialFit}`}>
                          {item.spatialFit === "direct"
                            ? "Đúng khu"
                            : item.spatialFit === "balanced"
                              ? "Cân bằng"
                              : "Cân nhắc"}
                        </span>
                        <small>{item.hotel.area_code}</small>
                      </div>

                      <h3>{item.hotel.canonical_name}</h3>
                      {item.hotel.address && <p>{item.hotel.address}</p>}
                      <p className="stay-summary">{item.stayContext.summary}</p>

                      {result.parsed.stayPreferences.length > 0 && (
                        <div className="stay-signal-row">
                          {item.stayContext.signals
                            .filter((signal) =>
                              result.parsed.stayPreferences.includes(signal.key),
                            )
                            .slice(0, 4)
                            .map((signal) => (
                              <span
                                className={`stay-signal stay-signal--${signal.level}`}
                                key={signal.key}
                                title={signal.note}
                              >
                                {signalLabel(signal.key)} · {levelLabel(signal.level)}
                              </span>
                            ))}
                        </div>
                      )}

                      <div className="hotel-nearby-preview">
                        {item.nearby.groups.eat.knowledge[0] && (
                          <span>
                            <b>Ăn:</b> {item.nearby.groups.eat.knowledge[0].title}
                          </span>
                        )}
                        {item.nearby.groups.cafe.venues[0] && (
                          <span>
                            <b>Cà phê:</b> {item.nearby.groups.cafe.venues[0].name}
                          </span>
                        )}
                        {(item.nearby.groups.do.venues[0] ||
                          item.nearby.groups.do.knowledge[0]) && (
                          <span>
                            <b>Chơi:</b>{" "}
                            {item.nearby.groups.do.venues[0]?.name ||
                              item.nearby.groups.do.knowledge[0]?.title}
                          </span>
                        )}
                      </div>

                      {item.cautions.slice(0, 2).map((warning) => (
                        <p className="caution" key={warning}>{warning}</p>
                      ))}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {plan?.destinationContext && (
              <section className="discover-panel card">
                <div className="section-heading compact">
                  <span className="label">SỐNG QUANH KHU NÀY</span>
                  <h2>Ăn gì, cà phê ở đâu, chơi gì?</h2>
                  <p>
                    Mục nào chưa đủ dữ liệu venue thì engine chỉ dùng kiến thức khu vực
                    để gợi ý hướng đi, không dựng tên quán giả.
                  </p>
                </div>

                <div className="discover-grid">
                  <article className="discover-column">
                    <div className="discover-title">Ăn gì</div>
                    {plan.destinationContext.groups.eat.venues.map((venue) => (
                      <div className="discover-item venue" key={venue.id}>
                        <strong>{venue.name}</strong>
                        {venue.address && <span>{venue.address}</span>}
                        {venue.distanceKm != null && (
                          <small>~{venue.distanceKm.toFixed(1)} km</small>
                        )}
                        {venue.freshness === "stale" && (
                          <small>Cần kiểm tra lại thông tin hiện hành</small>
                        )}
                      </div>
                    ))}
                    {plan.destinationContext.groups.eat.knowledge
                      .slice(0, 3)
                      .map((item) => (
                        <div className="discover-item knowledge" key={item.id}>
                          <strong>{item.title}</strong>
                          {item.summary && <span>{item.summary}</span>}
                        </div>
                      ))}
                  </article>

                  <article className="discover-column">
                    <div className="discover-title">Cà phê</div>
                    {plan.destinationContext.groups.cafe.venues.length ? (
                      plan.destinationContext.groups.cafe.venues.map((venue) => (
                        <div className="discover-item venue" key={venue.id}>
                          <strong>{venue.name}</strong>
                          {venue.address && <span>{venue.address}</span>}
                          {venue.distanceKm != null && (
                            <small>~{venue.distanceKm.toFixed(1)} km</small>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="discover-empty">
                        Chưa có quán cà phê đủ dữ liệu trong lớp test này.
                      </p>
                    )}
                  </article>

                  <article className="discover-column">
                    <div className="discover-title">Chơi gì</div>
                    {plan.destinationContext.groups.do.venues.map((venue) => (
                      <div className="discover-item venue" key={venue.id}>
                        <strong>{venue.name}</strong>
                        {venue.address && <span>{venue.address}</span>}
                        {venue.distanceKm != null && (
                          <small>~{venue.distanceKm.toFixed(1)} km</small>
                        )}
                      </div>
                    ))}
                    {plan.destinationContext.groups.do.knowledge
                      .slice(0, 3)
                      .map((item) => (
                        <div className="discover-item knowledge" key={item.id}>
                          <strong>{item.title}</strong>
                          {item.summary && <span>{item.summary}</span>}
                        </div>
                      ))}
                  </article>
                </div>
              </section>
            )}

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
              <section className="content-section">
                <div className="section-heading">
                  <span className="label">SO PHƯƠNG ÁN</span>
                  <h2>Nhìn tổng tiền và thời gian cạnh nhau.</h2>
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

                      {scenario.cautions.map((warning) => (
                        <p className="caution" key={warning}>{warning}</p>
                      ))}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
