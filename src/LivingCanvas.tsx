import type { PlanningHotel } from "./types";

/**
 * Living Trip V2: purely presentational controls. No model call is made by
 * opening a story or comparing two areas. The existing submit() owns requests.
 */
const stories = [
  {
    id: "family",
    eyebrow: "ĐI CÙNG GIA ĐÌNH",
    title: "Để các bé vui, cả nhà đỡ mệt",
    description: "Ưu tiên lịch nhẹ và thời gian nghỉ.",
    prompt: "Nhà mình đi Phú Quốc có trẻ nhỏ. Gợi ý lịch trình nhẹ nhàng, ít di chuyển, có thời gian nghỉ.",
  },
  {
    id: "islands",
    eyebrow: "KHÁM PHÁ BIỂN ĐẢO",
    title: "Một ngày thật đáng nhớ trên biển",
    description: "Cùng tìm cách đi đảo hợp thời tiết.",
    prompt: "Mình muốn khám phá biển đảo Phú Quốc. Hãy hỏi mình những điều cần biết trước khi gợi ý hành trình.",
  },
  {
    id: "slow",
    eyebrow: "NGHỈ DƯỠNG",
    title: "Không cần đi nhiều, vẫn thấy Phú Quốc",
    description: "Biển, đồ ăn và những buổi chiều thong thả.",
    prompt: "Mình muốn nghỉ dưỡng ở Phú Quốc, thích biển đẹp, ăn ngon và không muốn lịch trình quá dày.",
  },
] as const;

export function LivingWelcome({
  onExplore,
  onWrite,
  disabled,
}: {
  onExplore: (prompt: string) => void;
  onWrite: () => void;
  disabled: boolean;
}) {
  return (
    <section className="living-welcome" aria-labelledby="living-welcome-title">
      <div className="living-section-heading">
        <span>CHỌN CẢM HỨNG HOẶC KỂ CHUYẾN ĐI CỦA BẠN</span>
        <h2 id="living-welcome-title">Bạn muốn Phú Quốc của mình như thế nào?</h2>
      </div>
      <div className="living-stories">
        {stories.map((story, index) => (
          <button
            className={"living-story living-story--" + story.id}
            key={story.id}
            type="button"
            disabled={disabled}
            onClick={() => onExplore(story.prompt)}
            aria-label={story.title + ". " + story.description}
          >
            <span className="living-story-art" aria-hidden="true">
              <span className="living-story-sun" />
              <span className="living-story-island" />
              <span className="living-story-sea" />
            </span>
            <span className="living-story-copy">
              <small>0{index + 1} / {story.eyebrow}</small>
              <strong>{story.title}</strong>
              <span>{story.description}</span>
              <em>Khám phá hướng này <span aria-hidden="true">↗</span></em>
            </span>
          </button>
        ))}
      </div>
      <button className="living-write" type="button" onClick={onWrite}>
        Hoặc mình kể chuyến đi theo cách riêng <span aria-hidden="true">↗</span>
      </button>
    </section>
  );
}

function areaLabel(area: string) {
  const names: Record<string, string> = {
    north: "Bắc đảo",
    south: "Nam đảo",
    duong_dong: "Dương Đông",
    long_beach: "Bãi Trường",
    north_central: "Ông Lang",
    east: "Đông đảo",
  };
  return names[area] || area;
}

export function TripPulse({
  summary,
  aiSignals = [],
  hotels,
  selectedArea,
  tradeoff,
  onSelectArea,
}: {
  summary: string[];
  aiSignals?: string[];
  hotels: PlanningHotel[];
  selectedArea: string | null;
  tradeoff?: { gain: string; trade: string } | null;
  onSelectArea: (area: string) => void;
}) {
  const areas: PlanningHotel[] = [];
  const seen = new Set<string>();
  for (const item of hotels) {
    if (!seen.has(item.hotel.area_code)) {
      areas.push(item);
      seen.add(item.hotel.area_code);
    }
    if (areas.length === 2) break;
  }
  const active = areas.find((item) => item.hotel.area_code === selectedArea);
  return (
    <section className="trip-pulse" aria-label="Chuyến đi đang hình thành">
      <div className="trip-pulse-heading">
        <div>
          <span>CHUYẾN ĐI CỦA BẠN</span>
          <h2>Mình đang cùng bạn ráp chuyến đi này</h2>
        </div>
        <span className="trip-pulse-live"><i aria-hidden="true" /> Đang khám phá</span>
      </div>
      {summary.length > 0 && (
        <div className="trip-pulse-facts" aria-label="Những điều JoTrip đã hiểu">
          {summary.map((fact) => <span key={fact}>{fact}</span>)}
        </div>
      )}
      {aiSignals.length > 0 && (
        <div className="trip-pulse-inferred">
          <strong>JoTrip đang hiểu thêm từ câu bạn nói - chưa xác nhận</strong>
          <div className="trip-pulse-facts">{aiSignals.map((signal) => <span key={signal}>{signal}</span>)}</div>
        </div>
      )}
      {areas.length > 0 && (
        <div className="trip-pulse-directions">
          <div className="trip-pulse-intro">
            <strong>Hai hướng để mình cùng cân nhắc</strong>
            <span>Chạm để xem ưu và nhược điểm ở phần bên dưới. Chưa phải đặt phòng.</span>
          </div>
          <div className="trip-pulse-options">
            {areas.map((item, index) => (
              <button
                key={item.hotel.area_code}
                type="button"
                className={"trip-pulse-option" + (selectedArea === item.hotel.area_code ? " is-selected" : "")}
                onClick={() => onSelectArea(item.hotel.area_code)}
                aria-pressed={selectedArea === item.hotel.area_code}
              >
                <span className={"trip-pulse-mini-art trip-pulse-mini-art--" + item.hotel.area_code} aria-hidden="true" />
                <span className="trip-pulse-option-copy">
                  <small>HƯỚNG {index + 1}</small>
                  <strong>{areaLabel(item.hotel.area_code)}</strong>
                  <span>{item.stayContext.summary}</span>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {active && (
        <div className="trip-pulse-detail" aria-live="polite">
          <div className="trip-pulse-detail-heading">
            <span>ĐANG XEM: {areaLabel(active.hotel.area_code)}</span>
            <h3>{active.hotel.canonical_name}</h3>
            <p>{active.stayContext.summary}</p>
          </div>
          {tradeoff && (
            <div className="trip-pulse-tradeoffs">
              <div><span>Điểm thuận</span><strong>{tradeoff.gain}</strong></div>
              <div><span>Cần cân nhắc</span><strong>{tradeoff.trade}</strong></div>
            </div>
          )}
          {active.routeFacts?.length ? (
            <div className="trip-pulse-routes">
              {active.routeFacts.slice(0, 3).map((fact) => (
                <div key={fact.destinationId}>
                  <span>{fact.label}</span>
                  <strong>~{fact.minutes} phút · {fact.distanceKm.toFixed(1)} km</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="trip-pulse-route-note">Chưa có thời gian di chuyển đủ tin cậy cho hướng này.</p>
          )}
        </div>
      )}
      <p className="trip-pulse-disclaimer">Đây là các hướng để cùng cân nhắc, chưa phải xác nhận đặt chỗ. Giá, giờ hoạt động và lịch di chuyển cần được kiểm tra theo ngày đi.</p>
    </section>
  );
}
