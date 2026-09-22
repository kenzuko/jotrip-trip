type ParsedTrip = {
  days?: number;
  nights?: number;
  adults?: number;
  children?: number;
  budgetVnd?: number;
  interests: string[];
  raw: string;
};

const interestRules: Array<[RegExp, string]> = [
  [/\bvin\b|vinwonders/i, "VinWonders"],
  [/safari/i, "Safari"],
  [/hòn\s*thơm|hon\s*thom|cáp\s*treo|cap\s*treo/i, "Hòn Thơm"],
  [/sunset\s*town|thị\s*trấn\s*hoàng\s*hôn/i, "Sunset Town"],
  [/biển|beach/i, "Biển"],
  [/chợ\s*đêm|cho\s*dem/i, "Chợ đêm"],
  [/cà\s*phê|ca\s*phe|cafe|coffee/i, "Cà phê"],
  [/ăn\s*gì|an\s*gi|ăn\s*ngon|an\s*ngon|ẩm\s*thực|am\s*thuc|quán\s*ăn|quan\s*an|nhà\s*hàng|nha\s*hang|hải\s*sản|hai\s*san/i, "Ăn uống"],
];

export function parseTripText(raw: string): ParsedTrip {
  const text = raw.trim();
  const stay = text.match(/(\d+)\s*(?:ngày|ngay|n)\s*(\d+)\s*(?:đêm|dem|đ|d)/i);
  const adults = text.match(/(\d+)\s*(?:người\s*lớn|nguoi\s*lon|adult|nl)/i) ?? text.match(/(\d+)\s*(?:người|nguoi)(?!\s*(?:lớn|lon))/i);
  const children = text.match(/(\d+)\s*(?:trẻ|tre|bé|be|child)/i);
  const budgetMillion = text.match(/(?:khoảng|tầm|dưới|duoi|ngân\s*sách|ngan\s*sach)?\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu)/i);

  const interests = interestRules
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);

  return {
    days: stay ? Number(stay[1]) : undefined,
    nights: stay ? Number(stay[2]) : undefined,
    adults: adults ? Number(adults[1]) : undefined,
    children: children ? Number(children[1]) : undefined,
    budgetVnd: budgetMillion ? Math.round(Number(budgetMillion[1].replace(",", ".")) * 1_000_000) : undefined,
    interests,
    raw: text,
  };
}

export function buildParseResponse(raw: string) {
  const parsed = parseTripText(raw);
  const assumptions: string[] = [];
  const nextNeeded: string[] = [];

  if (!parsed.adults && !parsed.children) assumptions.push("Chưa có số khách, JoTrip sẽ chỉ dùng giá khoảng cho đến khi bạn bổ sung.");
  if (!parsed.days || parsed.nights === undefined) nextNeeded.push("duration");
  if (!parsed.interests.length) nextNeeded.push("interests");
  nextNeeded.push("travel_dates");

  return { ok: Boolean(parsed.raw), parsed, assumptions, nextNeeded };
}
