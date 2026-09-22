import { FormEvent, useMemo, useState } from "react";
import type { TripParseResponse } from "./types";

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

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TripParseResponse | null>(null);
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
        body: JSON.stringify({ text: value }),
      });
      const json = (await res.json()) as TripParseResponse;
      setResult(json);
      if (voiceOn && json.ok) {
        const p = json.parsed;
        const spokenBits = [
          p.days && p.nights ? `${p.days} ngày ${p.nights} đêm` : "",
          p.adults ? `${p.adults} người lớn` : "",
          p.children ? `${p.children} trẻ em` : "",
          p.interests.length ? p.interests.join(" và ") : "",
        ].filter(Boolean);
        const spoken = spokenBits.length
          ? `Mình hiểu rồi. ${spokenBits.join(", ")}.`
          : "Mình hiểu rồi. Mình sẽ dựng phương án chuyến đi từ dữ liệu thật.";
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
              <span className="label">Trip Scenario Engine</span>
              <h2>Đã sẵn sàng dựng phương án từ dữ liệu thật</h2>
              <p>
                Hotel commercial data được khóa ở private core. Xe 7 chỗ đang dùng rule tạm
                15.000đ/km. Vé công khai được lưu theo ngày hiệu lực.
              </p>
            </div>
            <div className="status-grid">
              <div><b>Hotel</b><span>private - ALL MARKET + discount</span></div>
              <div><b>Xe 7 chỗ</b><span>15.000đ/km</span></div>
              <div><b>Vé</b><span>date-aware</span></div>
              <div><b>CMS</b><span>Open Phu Quoc</span></div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
