import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdvisorResponse,
  DestinationContext,
  PlanningHotel,
  TripBuildResponse,
  TripParseResponse,
  TripTurnResponse,
} from "./types";
import { directGuide } from "./guideDirector";
import { LivingWelcome, TripPulse } from "./LivingCanvas";
import { resolveMascotState, runtimeMascotPath } from "./mascotState";

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
  const [apiError, setApiError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [leadContact, setLeadContact] = useState("");
  const [leadConsent, setLeadConsent] = useState(false);
  const [tripIdentity, setTripIdentity] = useState<{ tripId: string; version: number } | null>(null);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "error" | "stale">("idle");
  const [replyText, setReplyText] = useState("");
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [activeDecisionArea, setActiveDecisionArea] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const retryTurnRef = useRef<{ text: string; id: string; dates?: { checkin: string; checkout: string } } | null>(null);
  const hasSentRef = useRef(false);
  const leadRetryRef = useRef<{ id: string; contact: string; tripId: string; version: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    void fetch("/api/trip/session", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async response => {
        if (response.status === 410 && !hasSentRef.current) {
          localStorage.removeItem("jotrip_trip_session_id");
          sessionIdRef.current = getSessionId();
          return null;
        }
        if (!response.ok) return null;
        return response.json() as Promise<{
          ok: boolean; tripId: string; version: number;
          parsed: TripParseResponse["parsed"];
          plan: TripBuildResponse | null; advisor: AdvisorResponse | null;
          history: LocalTurn[];
        }>;
      })
      .then(snapshot => {
        if (!snapshot?.ok || cancelled || hasSentRef.current) return;
        const lastReply = [...snapshot.history].reverse().find(item => item.role === "assistant")?.text || "";
        setResult({
          ok: true, parsed: snapshot.parsed, assumptions: [], nextNeeded: [],
          assistantText: lastReply,
        });
        setTripIdentity({ tripId: snapshot.tripId, version: snapshot.version });
        setPlan(snapshot.plan);
        setAdvisor(snapshot.advisor);
        setCheckin(snapshot.parsed.checkin || "");
        setCheckout(snapshot.parsed.checkout || "");
        setReplyText(lastReply);
        setTurns(snapshot.history.slice(-12));
      })
      .catch(() => {
        // New visitor or temporary offline state: do not fabricate a recovered trip.
      });
    return () => { cancelled = true; };
  }, []);

  const guideCue = useMemo(() => directGuide(result, plan), [result, plan]);
  const firstGreeting =
    "Chào bạn. Mình là JoTrip. Bạn đang tính chuyến đi Phú Quốc thế nào?";

  const summaryBits = useMemo(() => {
    if (!result) return [];
    const p = result.parsed;
    return [
      p.days && p.nights ? `${p.days} ngày / ${p.nights} đêm` : "",
      p.checkin && p.checkout ? `${p.checkin} - ${p.checkout}` : "",
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
    speaking: false,
    comparing: Boolean(activeDecision) || guideCue.state === "compare",
    // Keep this false until a real review/live-data check is wired.
    checking: false,
    confirming: leadStatus === "sent",
    guiding:
      guideCue.target.startsWith("map:") ||
      guideCue.target.startsWith("discovery:"),
  });
  const mascotSrc = runtimeMascotPath(mascotState);

  async function submit(text = input, selectedDates?: { checkin: string; checkout: string }) {
    const value = text.trim();
    if (!value || inFlightRef.current) return;
    inFlightRef.current = true;
    hasSentRef.current = true;
    setApiError("");
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const previousResult = result;
    const previousPlan = plan;
    const previousAdvisor = advisor;
    const pending = retryTurnRef.current?.text === value &&
      JSON.stringify(retryTurnRef.current.dates || null) === JSON.stringify(selectedDates || null)
      ? retryTurnRef.current
      : { text: value, id: crypto.randomUUID(), dates: selectedDates };
    retryTurnRef.current = pending;

    setBusy(true);
    setHandoffOpen(false);
    setLeadStatus("idle");
    setActiveDecisionArea(null);
    setTurns((items) => [
      ...items.filter((item) => item.id !== pending.id),
      { id: pending.id, role: "user" as const, text: value },
    ].slice(-12));

    try {
      const res = await fetch("/api/trip/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: value,
          sessionId: sessionIdRef.current,
          clientTurnId: pending.id,
          ...(selectedDates || {}),
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "turn_failed");
      }
      const json = (await res.json()) as TripTurnResponse;
      if (!json.ok) throw new Error("turn_failed");
      retryTurnRef.current = null;
      leadRetryRef.current = null;
      setTripIdentity({ tripId: json.tripId, version: json.version });

      setCheckin(json.parsed.checkin || "");
      setCheckout(json.parsed.checkout || "");
      if (json.action !== "acknowledgement") {
        setResult(json);
        setPlan(json.plan || (json.action === "new_trip" ? null :
          json.parsed.mode === "compare" || json.parsed.mode === "contact" ? previousPlan : null));
        setAdvisor(json.advisor || (json.action === "new_trip" ? null :
          json.parsed.mode === "compare" || json.parsed.mode === "contact" ? previousAdvisor : null));
        setHandoffOpen(json.parsed.mode === "contact");
      } else if (!previousResult) {
        setResult(json);
      }

      const reply = json.assistantText || "Mình đang theo chuyến này cùng bạn.";
      setReplyText(reply);
      setTurns((items) => [...items, {
        id: json.clientTurnId + ":assistant",
        role: "assistant" as const,
        text: reply,
        language: json.parsed.language,
      }].slice(-12));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "session_deleted") {
        localStorage.removeItem("jotrip_trip_session_id");
        sessionIdRef.current = getSessionId();
        retryTurnRef.current = null;
        leadRetryRef.current = null;
        setTripIdentity(null);
        setResult(null); setPlan(null); setAdvisor(null); setTurns([]);
        setReplyText(""); setCheckin(""); setCheckout("");
        setInput(value);
      }
      setApiError(code === "session_deleted"
        ? "Chuyến trước đã được xóa ở một tab khác. Mình đã mở phiên mới, bạn gửi lại câu vừa rồi nha."
        : code === "invalid_travel_dates"
        ? "Ngày đi chưa hợp lệ. Bạn chọn ngày nhận phòng từ hôm nay và thời gian ở từ 1 đến 30 đêm nha."
        : code === "trip_state_unavailable" || code === "trip_turn_unavailable"
        ? "Phần lưu chuyến đi đang gián đoạn. Mình chưa ghi nhận tin này, bạn thử lại sau nha."
        : code === "concurrent_turn_retry"
          ? "Có hai tin gửi sát nhau. Bạn thử gửi lại tin vừa rồi nha."
          : "Kết nối đang gián đoạn. Bạn gửi lại câu vừa rồi giúp mình nhé.");
      if (!selectedDates) setInput((current) => current || value);
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
    if (!result || !checkin || !checkout || busy) return;
    await submit("Tính chuyến từ " + checkin + " đến " + checkout, { checkin, checkout });
  }

  async function deleteCurrentTrip() {
    if (!sessionIdRef.current || busy) return;
    setBusy(true);
    setApiError("");
    try {
      const response = await fetch("/api/trip/session", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await response.json() as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error("delete_failed");
      localStorage.removeItem("jotrip_trip_session_id");
      sessionIdRef.current = getSessionId();
      hasSentRef.current = false;
      retryTurnRef.current = null;
      leadRetryRef.current = null;
      setTripIdentity(null);
      setResult(null); setPlan(null); setAdvisor(null); setTurns([]);
      setReplyText(""); setInput(""); setCheckin(""); setCheckout("");
      setLeadContact(""); setLeadConsent(false); setLeadStatus("idle");
      setHandoffOpen(false); setActiveDecisionArea(null); setDeleteConfirm(false);
    } catch {
      setApiError("Chưa xóa được lịch sử trên máy chủ. Bạn thử lại sau nha.");
    } finally {
      setBusy(false);
    }
  }

  async function sendLead(event: FormEvent) {
    event.preventDefault();
    if (!result || !tripIdentity || !leadContact.trim() || !leadConsent ||
      leadStatus === "sending" || leadStatus === "sent" ||
      checkin !== (result.parsed.checkin || "") ||
      checkout !== (result.parsed.checkout || "")) return;

    const contact = leadContact.trim();
    const pending = leadRetryRef.current?.contact === contact &&
      leadRetryRef.current.tripId === tripIdentity.tripId &&
      leadRetryRef.current.version === tripIdentity.version
      ? leadRetryRef.current
      : { id: crypto.randomUUID(), contact,
          tripId: tripIdentity.tripId, version: tripIdentity.version };
    leadRetryRef.current = pending;
    setLeadStatus("sending");
    try {
      const res = await fetch("/api/booking/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          clientLeadId: pending.id,
          expectedTripId: pending.tripId,
          expectedVersion: pending.version,
          contact,
          consent: leadConsent,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; status?: string };
      if (res.status === 409 && json.error === "stale_trip_refresh_required") {
        leadRetryRef.current = null;
        setLeadStatus("stale");
      } else if (res.ok && json.ok && json.status !== "ignored") {
        setLeadStatus("sent");
        leadRetryRef.current = null;
      } else {
        setLeadStatus("error");
      }
    } catch {
      // A network failure may occur after the server has committed. Retain
      // clientLeadId so a retry cannot create a second booking request.
      setLeadStatus("error");
    }
  }

  // Only the unanswered phone welcome needs a shorter hint; desktop copy stays unchanged.
  const isPhoneWelcome = typeof window !== "undefined" &&
    window.matchMedia("(max-width: 560px)").matches;
  const hasResponse = Boolean(result);
  const datesPending = Boolean(result &&
    (checkin !== (result.parsed.checkin || "") ||
     checkout !== (result.parsed.checkout || "")));
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

        <div className="top-actions">
          <span className="topbar-promise">Lên kế hoạch theo cách của bạn</span>
          {result && <button type="button" className="reset-trip-button"
            disabled={busy} onClick={() => setDeleteConfirm(true)}>Xóa lịch sử</button>}
        </div>
      </header>

      {deleteConfirm && <div className="delete-confirm" role="region" aria-label="Xác nhận xóa lịch sử">
        <p>Xóa lịch sử tư vấn và chuyến đi này khỏi JoTrip? Yêu cầu liên hệ hoặc booking đã gửi riêng sẽ không bị xóa tại đây.</p>
        <div>
          <button type="button" disabled={busy} onClick={() => setDeleteConfirm(false)}>Giữ lại</button>
          <button type="button" disabled={busy} onClick={() => void deleteCurrentTrip()}>Xóa chuyến này</button>
        </div>
      </div>}
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

          {!hasResponse && (
            <LivingWelcome
              onExplore={(prompt) => void submit(prompt)}
              onWrite={() => textareaRef.current?.focus()}
              disabled={busy}
            />
          )}

          <div className="prompt-note">
            Bạn không cần điền form. Cứ nói như đang hỏi một người ở đảo.
            <small>JoTrip lưu cuộc trò chuyện để nhớ chuyến đi. Bạn có thể xóa lịch sử bất cứ lúc nào.</small>
          </div>

          <div className="trust-line">
            <span>Chưa chắc thì nói chưa chắc</span>
            <span>Không bịa giá, quán hay tồn phòng</span>
            <span>Thấy ổn rồi mới chuyển sang booking</span>
          </div>
          {!hasResponse && <div className="warm-brand-whisper" aria-hidden="true">PHÚ QUỐC · NHIỀU HƠN MỘT CHUYẾN ĐI</div>}
        </section>

        {(result || busy || turns.length > 0) && (
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

            </div>

            {result && (<>
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
              tradeoff={activeDecision && result ? decisionTradeoffs(activeDecision, result.parsed.interests, result.parsed.stayPreferences) : null}
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
                  <span className="label">{result.parsed.checkin && result.parsed.checkout ? "NGÀY ĐI ĐÃ LƯU" : "NẾU MUỐN TÍNH TIẾP"}</span>
                  <h2>{result.parsed.checkin && result.parsed.checkout ? "Ngày đi của nhà mình" : "Cho mình ngày đi nha."}</h2>
                  <p>{result.parsed.checkin && result.parsed.checkout
                    ? "Mình đã lưu khoảng ngày này vào chuyến đi. Nếu đổi ngày, mình sẽ tính lại theo dữ liệu đang có, không tự nhận là đã giữ phòng hay vé."
                    : "Có ngày cụ thể thì mình mới kiểm tra tiếp phần phòng, vé và tổng chi phí cho đúng chuyến của nhà mình."}</p>
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
                    disabled={!checkin || !checkout || busy ||
                      (checkin === result.parsed.checkin && checkout === result.parsed.checkout)}
                    onClick={() => void repriceWithDates()}
                    type="button"
                  >
                    {result.parsed.checkin && result.parsed.checkout ? "Cập nhật ngày đi" : "Tính theo ngày này"}
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
                      onChange={(event) => { setLeadContact(event.target.value); leadRetryRef.current = null; setLeadStatus("idle"); }}
                      placeholder="Số điện thoại, email hoặc WhatsApp"
                      aria-label="Thông tin liên hệ"
                    />
                    <label className="consent-row">
                      <input
                        type="checkbox"
                        checked={leadConsent}
                        onChange={(event) => setLeadConsent(event.target.checked)}
                      />
                      <span>Tôi đồng ý để JoTrip lưu thông tin liên hệ và tóm tắt chuyến đi, nhằm kiểm tra dịch vụ và liên hệ với tôi. Yêu cầu này được lưu riêng với lịch sử chat.</span>
                    </label>
                    <button
                      type="submit"
                      disabled={!tripIdentity || !leadContact.trim() || !leadConsent || datesPending ||
                        leadStatus === "sending" || leadStatus === "sent"}
                    >
                      {leadStatus === "sending" ? "Đang gửi..." : "Gửi cho JoTrip"}
                    </button>
                    {datesPending && <p className="lead-error">Bạn cập nhật ngày đi ở phía trên trước khi gửi để JoTrip nhận đúng chuyến nha.</p>}
                    <p className="lead-privacy-note">Bạn có thể yêu cầu JoTrip xoá thông tin liên hệ qua kênh đã trao đổi. Xoá lịch sử chat không tự xoá yêu cầu này.</p>
                    {leadStatus === "sent" && (
                      <p className="lead-success">JoTrip đã nhận thông tin liên hệ và tóm tắt chuyến đi. Nhân viên sẽ kiểm tra dịch vụ trước khi xác nhận với bạn.</p>
                    )}
                    {leadStatus === "stale" && (
                      <p className="lead-error">Chuyến đi đã thay đổi ở tab khác. Bạn tải lại chuyến để kiểm tra trước khi gửi nha. <button type="button" onClick={() => window.location.reload()}>Tải lại chuyến</button></p>
                    )}
                    {leadStatus === "error" && (
                      <p className="lead-error">Chưa gửi được. Thử lại sau một chút.</p>
                    )}
                  </form>
                )}
              </section>
            )}
            </>)}
          </section>
        )}
      </div>
    </main>
  );
}
