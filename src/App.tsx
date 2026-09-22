import { FormEvent, useMemo, useRef, useState } from "react";
import type { TripBuildResponse, TripParseResponse } from "./types";
import { directGuide } from "./guideDirector";

const examples = [
  "3 ngày 2 đêm, 2 người, chơi Vin",
  "Gia đình 2 người lớn 2 bé, 4 ngày, Vin và biển",
  "15 triệu thì ở đâu và chơi gì?",
  "Tôi đã biết khách sạn",
];

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "vi-VN";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function getSessionId() {
  const key = "jotrip_trip_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
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

  const summary = useMemo(() => {
    if (!result) return "";
    const p = result.parsed;
    const bits = [
      p.days && p.nights ? `${p.days} ngày ${p.nights} đêm` : "",
      p.adults ? `${p.adults} người lớn` : "",
      p.children ? `${p.children} trẻ em` : "",
      p.interests.length ? p.interests.join(" + ") : "",
      p.stayPreferences.length ? p.stayPreferences.map(preferenceLabel).join(" + ") : "",
    ].filter(Boolean);
    return bits.join(" • ");
  }, [result]);

  async function submit(text = input) {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
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
        const spoken =
          json.assistantText ||
          "Mình hiểu rồi. Mình sẽ dựng phương án chuyến đi từ dữ liệu thật.";
        setTimeout(() => speak(spoken), 50);
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

  return (
    <main className={result ? "app app--active" : "app"}>
      <header className="topbar">
        <div className="brand-fallback" aria-label="JoTrip">JoTrip</div>
        <div className="top-actions">
          <button className="quiet" onClick={() => setVoiceOn((v) => !v)}>
            {voiceOn ? "Giọng nói: bật" : "Giọng nói: tắt"}
          </button>
          <button className="quiet">Đăng nhập</button>
        </div>
      </header>

      <section className="hero">
        <div className={`guide-wrap guide-${guideCue.state}`} aria-label="JoTrip Guide">
          <div className="guide-bubble">{guideCue.text}</div>
          <div
            className="guide-fallback show"
            data-action={guideCue.action}
            data-target={guideCue.target}
            title={guideCue.target}
          >
            Jo
          </div>
        </div>

        <div className="conversation">
          <p className="eyebrow">JoTrip Guide</p>
          <h1>Bạn định đi Phú Quốc thế nào?</h1>
          <p className="subhead">Nói như bình thường. JoTrip sẽ tính phần còn lại.</p>

          <form className="prompt" onSubmit={onSubmit}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ví dụ: 3 ngày 2 đêm, 2 người, muốn chơi Vin..."
              rows={2}
            />
            <button type="submit" disabled={busy}>{busy ? "Đang hiểu..." : "Lên chuyến đi"}</button>
          </form>

          <div className="chips">
            {examples.map((example) => (
              <button key={example} onClick={() => { setInput(example); void submit(example); }}>
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      {result && (
        <section className="workspace">
          <div className="understood">
            <span className="label">Mình đã hiểu</span>
            <strong>{summary || result.parsed.raw}</strong>
            {result.assumptions.length > 0 && <p>{result.assumptions.join(" ")}</p>}
          </div>

          <div className="scenario-shell">
            <div>
              <span className="label">JoTrip đang tính chuyến</span>
              <h2>{plan?.mode === "priced" ? "Các phương án cho đúng ngày bạn chọn" : "Mình tính trước phần đã biết"}</h2>
              <p>
                {plan?.mode === "planning"
                  ? "Chọn ngày đi để mình kiểm tra giá phòng và so tổng chi phí chính xác hơn."
                  : "Giá phòng, vé và phần di chuyển được tách riêng để thấy rõ hơn - thua của từng phương án."}
              </p>

              <div className="date-row">
                <label>
                  <span>Nhận phòng</span>
                  <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
                </label>
                <label>
                  <span>Trả phòng</span>
                  <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
                </label>
                <button disabled={!checkin || !checkout || busy} onClick={() => void repriceWithDates()}>
                  Kiểm tra ngày này
                </button>
              </div>
            </div>
            <div className="status-grid">
              <div><b>Vé tạm tính</b><span>{money(plan?.activityCostVnd)}</span></div>
              <div><b>Giá phòng</b><span>{plan?.mode === "priced" ? (plan.hotelOfferCount ? `${plan.hotelOfferCount} lựa chọn đã kiểm tra` : "Đang chờ offer phù hợp") : "Chọn ngày để kiểm tra"}</span></div>
              <div><b>Xe riêng</b><span>tính theo lịch trình thực tế</span></div>
              <div><b>Dữ liệu</b><span>giá theo ngày hiệu lực</span></div>
            </div>
          </div>

          {plan?.mode === "planning" && plan.planningHotels && plan.planningHotels.length > 0 && (
            <div className="planning-hotels">
              <div className="section-heading">
                <span className="label">Ở đâu hợp với ý định này?</span>
                <h3>Mình xem vị trí trước, chưa dùng giá phòng khi bạn chưa chọn ngày</h3>
              </div>
              <div className="scenario-list">
                {plan.planningHotels.map((item) => (
                  <article className="scenario-card planning-card" key={item.hotel.id}>
                    <div>
                      <span className="fit-pill">
                        {item.spatialFit === "direct"
                          ? "Đúng khu hoạt động"
                          : item.spatialFit === "balanced"
                            ? "Vị trí cân bằng"
                            : "Có thể cân nhắc"}
                      </span>
                      <h3>{item.hotel.canonical_name}</h3>
                      {item.hotel.address && <p className="hotel-address">{item.hotel.address}</p>}
                    </div>
                    <p>{item.stayContext.summary}</p>
                    <div className="stay-signal-row">
                      {item.stayContext.signals
                        .filter((signal) => result.parsed.stayPreferences.includes(signal.key))
                        .slice(0, 4)
                        .map((signal) => (
                          <span
                            className={`stay-signal stay-signal--${signal.level}`}
                            key={signal.key}
                            title={signal.note}
                          >
                            {signalLabel(signal.key)}: {levelLabel(signal.level)}
                          </span>
                        ))}
                    </div>
                    <div className="hotel-nearby-preview">
                      {item.nearby.groups.eat.knowledge[0] && (
                        <span><b>Ăn:</b> {item.nearby.groups.eat.knowledge[0].title}</span>
                      )}
                      {item.nearby.groups.cafe.venues[0] && (
                        <span><b>Cà phê:</b> {item.nearby.groups.cafe.venues[0].name}</span>
                      )}
                      {(item.nearby.groups.do.venues[0] || item.nearby.groups.do.knowledge[0]) && (
                        <span><b>Chơi:</b> {item.nearby.groups.do.venues[0]?.name || item.nearby.groups.do.knowledge[0]?.title}</span>
                      )}
                    </div>
                    {item.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                    {item.cautions.map((warning) => <p className="caution" key={warning}>{warning}</p>)}
                  </article>
                ))}
              </div>
            </div>
          )}

          {plan?.destinationContext && (
            <section className="discover-panel">
              <div className="section-heading">
                <span className="label">Quanh khu này</span>
                <h3>Ăn gì, uống cà phê ở đâu, có gì để chơi?</h3>
              </div>

              <div className="discover-grid">
                <article className="discover-column">
                  <div className="discover-title">Ăn gì</div>
                  {plan.destinationContext.groups.eat.venues.map((venue) => (
                    <div className="discover-item venue" key={venue.id}>
                      <strong>{venue.name}</strong>
                      {venue.address && <span>{venue.address}</span>}
                      {venue.distanceKm != null && <small>~{venue.distanceKm.toFixed(1)} km</small>}
                      {venue.freshness === "stale" && <small>Cần kiểm tra lại thông tin hiện hành</small>}
                    </div>
                  ))}
                  {plan.destinationContext.groups.eat.knowledge.slice(0,4).map((item) => (
                    <div className="discover-item" key={item.id}>
                      <strong>{item.title}</strong>
                      {item.summary && <span>{item.summary}</span>}
                    </div>
                  ))}
                </article>

                <article className="discover-column">
                  <div className="discover-title">Cà phê</div>
                  {plan.destinationContext.groups.cafe.venues.length > 0 ? (
                    plan.destinationContext.groups.cafe.venues.map((venue) => (
                      <div className="discover-item venue" key={venue.id}>
                        <strong>{venue.name}</strong>
                        {venue.address && <span>{venue.address}</span>}
                        {venue.distanceKm != null && <small>~{venue.distanceKm.toFixed(1)} km</small>}
                      {venue.freshness === "stale" && <small>Cần kiểm tra lại thông tin hiện hành</small>}
                      </div>
                    ))
                  ) : (
                    <p className="discover-empty">Chưa có quán cà phê đã kiểm tra đủ dữ liệu trong khu này.</p>
                  )}
                </article>

                <article className="discover-column">
                  <div className="discover-title">Có gì để chơi</div>
                  {plan.destinationContext.groups.do.venues.map((venue) => (
                    <div className="discover-item venue" key={venue.id}>
                      <strong>{venue.name}</strong>
                      {venue.address && <span>{venue.address}</span>}
                      {venue.distanceKm != null && <small>~{venue.distanceKm.toFixed(1)} km</small>}
                      {venue.freshness === "stale" && <small>Cần kiểm tra lại thông tin hiện hành</small>}
                    </div>
                  ))}
                  {plan.destinationContext.groups.do.knowledge.slice(0,4).map((item) => (
                    <div className="discover-item" key={item.id}>
                      <strong>{item.title}</strong>
                      {item.summary && <span>{item.summary}</span>}
                    </div>
                  ))}
                </article>
              </div>
            </section>
          )}

          {plan?.insights && plan.insights.length > 0 && (
            <div className="insight-list">
              {plan.insights.map((insight) => (
                <article className="insight-card" key={insight.title}>
                  <span className="label">JoTrip nhận thấy</span>
                  <h3>{insight.title}</h3>
                  <p>{insight.body}</p>
                </article>
              ))}
            </div>
          )}

          {plan?.scenarios && plan.scenarios.length > 0 && (
            <div className="scenario-list">
              {plan.scenarios.map((scenario) => (
                <article className="scenario-card" key={scenario.id}>
                  <div>
                    <span className="label">Phương án</span>
                    <h3>{scenario.hotelName}</h3>
                  </div>
                  <strong>{money(scenario.metrics.totalCostVnd)}</strong>
                  <div className="scenario-lines">
                    <span>Phòng {money(scenario.hotelCostVnd)}</span>
                    <span>Xe {money(scenario.mobilityCostVnd)}</span>
                    <span>Vé {money(scenario.activityCostVnd)}</span>
                    <span>Di chuyển ~{scenario.driveMinutes} phút</span>
                  </div>
                  {scenario.stayContext && (
                    <div className="stay-context-block">
                      <strong>Sống quanh đây</strong>
                      <span>{scenario.stayContext.summary}</span>
                      <div className="stay-signal-row">
                        {scenario.stayContext.signals
                          .filter((signal) => result.parsed.stayPreferences.includes(signal.key))
                          .slice(0, 4)
                          .map((signal) => (
                            <span
                              className={`stay-signal stay-signal--${signal.level}`}
                              key={signal.key}
                              title={signal.note}
                            >
                              {signalLabel(signal.key)}: {levelLabel(signal.level)}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {scenario.guestReasons.map((reason) => <p key={reason}>{reason}</p>)}
                  {scenario.cautions.map((warning) => <p className="caution" key={warning}>{warning}</p>)}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
