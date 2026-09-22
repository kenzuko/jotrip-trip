import { FormEvent, useMemo, useRef, useState } from "react";
import type { TripBuildResponse, TripParseResponse } from "./types";

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

  const summary = useMemo(() => {
    if (!result) return "";
    const p = result.parsed;
    const bits = [
      p.days && p.nights ? `${p.days} ngày ${p.nights} đêm` : "",
      p.adults ? `${p.adults} người lớn` : "",
      p.children ? `${p.children} trẻ em` : "",
      p.interests.length ? p.interests.join(" + ") : "",
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
          budgetVnd: result.parsed.budgetVnd,
        }),
      });
      setPlan((await res.json()) as TripBuildResponse);
    } finally {
      setBusy(false);
    }
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
        <div className="guide-wrap" aria-label="JoTrip Guide">
          <div className="guide-fallback show">Jo</div>
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
