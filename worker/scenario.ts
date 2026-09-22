export type TripLanguage = "vi" | "en" | "ko" | "ru" | "zh";

export type AdvisorMode =
  | "trip_plan"
  | "food"
  | "cafe"
  | "things_to_do"
  | "where_to_stay"
  | "compare"
  | "contact";

type ParsedTrip = {
  days?: number;
  nights?: number;
  adults?: number;
  children?: number;
  budgetVnd?: number;
  interests: string[];
  stayPreferences: string[];
  language: TripLanguage;
  mode: AdvisorMode;
  mentionedZone?: string;
  mentionedPlace?: string;
  raw: string;
};

const interestRules: Array<[RegExp, string]> = [
  [/\bvin\b|vinwonders|빈원더스|винвандерс|珍珠乐园|珍珠樂園/i, "VinWonders"],
  [/safari|사파리|сафари|野生动物园|野生動物園/i, "Safari"],
  [/hòn\s*thơm|hon\s*thom|cáp\s*treo|cap\s*treo|hon\s*thom|혼\s*똠|혼똠|케이블카|хон\s*тхом|канатн|香岛|香島|缆车|纜車/i, "Hòn Thơm"],
  [/sunset\s*town|thị\s*trấn\s*hoàng\s*hôn|선셋\s*타운|закат|日落小镇|日落小鎮|夕阳小镇|夕陽小鎮/i, "Sunset Town"],
  [/biển|beach|пляж|해변|바다|海滩|海灘/i, "Biển"],
  [/chợ\s*đêm|cho\s*dem|night\s*market|ночн\w*\s+рын|야시장|夜市/i, "Chợ đêm"],
  [/cà\s*phê|ca\s*phe|cafe|coffee|кофе|카페|커피|咖啡/i, "Cà phê"],
  [/ăn\s*gì|an\s*gi|ăn\s*ngon|an\s*ngon|ẩm\s*thực|am\s*thuc|quán\s*ăn|quan\s*an|nhà\s*hàng|nha\s*hang|hải\s*sản|hai\s*san|food|eat|restaurant|seafood|еда|ресторан|морепродукт|맛집|음식|식당|해산물|美食|吃什么|吃甚麼|餐厅|餐廳|海鲜|海鮮/i, "Ăn uống"],
];

const stayPreferenceRules: Array<[RegExp, string]> = [
  [/ăn\s*gì|an\s*gi|ăn\s*ngon|an\s*ngon|ẩm\s*thực|am\s*thuc|quán\s*ăn|quan\s*an|nhà\s*hàng|nha\s*hang|food|restaurant|seafood|еда|ресторан|맛집|음식|식당|美食|餐厅|餐廳/i, "food"],
  [/cà\s*phê|ca\s*phe|cafe|coffee|кофе|카페|커피|咖啡/i, "cafe"],
  [/buổi\s*tối|buoi\s*toi|tối\s*có\s*gì|toi\s*co\s*gi|nightlife|evening|night\s*show|вечер|ночн|밤|저녁|夜生活|晚上|晚间|晚間/i, "evening"],
  [/đi\s*bộ|di\s*bo|walkable|walking|walk\s+around|пешком|прогул|도보|걷|산책|步行|散步/i, "walkable"],
  [/yên\s*tĩnh|yen\s*tinh|nghỉ\s*dưỡng|nghi\s*duong|thư\s*giãn|thu\s*gian|relax|quiet|peaceful|тих|спокой|отдых|조용|휴양|휴식|安静|安靜|放松|放鬆/i, "quiet"],
  [/địa\s*phương|dia\s*phuong|bản\s*địa|ban\s*dia|local\s*life|local|местн|현지|로컬|当地|當地|本地/i, "local"],
  [/gia\s*đình|gia\s*dinh|family|kids?|children|trẻ\s*em|tre\s*em|bé|be|семь|ребен|дет|아이|아기|가족|家庭|儿童|兒童|孩子/i, "family"],
  [/gần\s*sân\s*bay|gan\s*san\s*bay|bay\s*sớm|bay\s*som|airport|early\s*flight|аэропорт|ранн\w*\s+рейс|공항|이른\s*비행|机场|機場|早班机|早班機/i, "airport"],
];


const zoneRules: Array<[RegExp, string, string]> = [
  [/vinwonders|safari|grand\s*world|bãi\s*dài|bai\s*dai|gành\s*dầu|ganh\s*dau|빈원더스|사파리|그랜드\s*월드|сафари|винвандерс|珍珠乐园|珍珠樂園|野生动物园|野生動物園/i, "north", "Bắc đảo"],
  [/sunset\s*town|hòn\s*thơm|hon\s*thom|an\s*thới|an\s*thoi|bãi\s*khem|bai\s*khem|bãi\s*sao|bai\s*sao|선셋\s*타운|혼똠|안토이|хон\s*тхом|日落小镇|日落小鎮|香岛|香島/i, "south", "Nam đảo"],
  [/dương\s*đông|duong\s*dong|chợ\s*đêm|night\s*market|즈엉동|야시장|зуонг\s*донг|ночн\w*\s+рын|阳东|陽東|夜市/i, "duong_dong", "Dương Đông"],
  [/bãi\s*trường|bai\s*truong|long\s*beach|dương\s*tơ|duong\s*to|롱비치|лонг\s*бич|长滩|長灘/i, "long_beach", "Bãi Trường"],
  [/ông\s*lang|ong\s*lang|cửa\s*dương|cua\s*duong|옹랑|онг\s*ланг|翁朗/i, "north_central", "Ông Lang"],
  [/hàm\s*ninh|ham\s*ninh|함닌|хам\s*нинь|咸宁|咸寧/i, "east", "Hàm Ninh"],
];

function detectMentionedZone(text:string) {
  for (const [pattern,zone,place] of zoneRules) {
    if (pattern.test(text)) return {zone,place};
  }
  return {};
}

function detectAdvisorMode(text:string, interests:string[], stayPreferences:string[]): AdvisorMode {
  if (/liên\s*hệ|lien\s*he|đặt\s*phòng|dat\s*phong|booking|book\s*(?:it|this|room)|reserve|예약|брони|预订|預訂/i.test(text)) return "contact";
  if (/so\s*sánh|so\s*sanh|hơn\s*thua|hon\s*thua|compare|vs\.?|versus|비교|сравн|对比|比較/i.test(text)) return "compare";
  if (/ở\s*đâu|o\s*dau|khu\s*nào|khu\s*nao|where\s*(?:should|to)\s*stay|which\s*area|숙소|어디.*묵|где\s*(?:жить|останов)|住哪里|住哪裡|哪个区域|哪個區域/i.test(text)) return "where_to_stay";
  if (interests.includes("Cà phê") && /ở\s*đâu|o\s*dau|where|추천|где|哪里|哪裡|咖啡/i.test(text)) return "cafe";
  if (interests.includes("Ăn uống") && /ăn\s*gì|an\s*gi|ở\s*đâu|o\s*dau|where|what\s*to\s*eat|추천|что\s*есть|где\s*поесть|吃什么|吃甚麼|哪里吃|哪裡吃/i.test(text)) return "food";
  if (/chơi\s*gì|choi\s*gi|có\s*gì|co\s*gi|what\s*to\s*do|things?\s*to\s*do|뭐.*할|что\s*делать|有什么|有什麼/i.test(text)) return "things_to_do";
  if ((!/\d+\s*(?:ngày|ngay|days?|박|일|дн|ноч|天|晚)/i.test(text)) && (interests.length || stayPreferences.length)) {
    if (interests.includes("Cà phê")) return "cafe";
    if (interests.includes("Ăn uống")) return "food";
  }
  return "trip_plan";
}

function detectLanguage(text: string): TripLanguage {
  if (/[가-힣]/.test(text)) return "ko";
  if (/[一-龥]/.test(text)) return "zh";
  if (/[А-Яа-яЁё]/.test(text)) return "ru";
  if (/\b(?:days?|nights?|adults?|children|family|beach|hotel|budget|restaurant|coffee|airport|want|stay|trip)\b/i.test(text)) return "en";
  return "vi";
}

function parseStay(text: string) {
  const patterns: Array<{re:RegExp; map:(m:RegExpMatchArray)=>{days:number;nights:number}}> = [
    { re: /(\d+)\s*(?:ngày|ngay)\s*(\d+)\s*(?:đêm|dem)/i, map:m=>({days:Number(m[1]),nights:Number(m[2])}) },
    { re: /(\d+)\s*days?\s*(?:and|,|-)?\s*(\d+)\s*nights?/i, map:m=>({days:Number(m[1]),nights:Number(m[2])}) },
    { re: /(\d+)\s*(?:дн(?:я|ей)?|день)\s*(\d+)\s*(?:ноч(?:ь|и|ей))/i, map:m=>({days:Number(m[1]),nights:Number(m[2])}) },
    { re: /(\d+)\s*(?:天|日)\s*(\d+)\s*(?:晚|夜)/, map:m=>({days:Number(m[1]),nights:Number(m[2])}) },
    { re: /(\d+)\s*박\s*(\d+)\s*일/, map:m=>({days:Number(m[2]),nights:Number(m[1])}) },
    { re: /(\d+)\s*일\s*(\d+)\s*박/, map:m=>({days:Number(m[1]),nights:Number(m[2])}) },
  ];
  for (const p of patterns) {
    const m=text.match(p.re);
    if (m) return p.map(m);
  }
  return {};
}

function firstNumber(text:string, patterns:RegExp[]) {
  for (const pattern of patterns) {
    const m=text.match(pattern);
    if (m) return Number(m[1] || m[2]);
  }
  return undefined;
}

function parseBudgetVnd(text:string) {
  let m=text.match(/(?:khoảng|tầm|dưới|duoi|ngân\s*sách|ngan\s*sach|budget|under|around|до|бюджет)?\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|million|mio|млн)\s*(?:vnd|đ|dong|₫)?/i);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 1_000_000);

  m=text.match(/(\d+(?:[.,]\d+)?)\s*만\s*(?:동|vnd)?/i);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 10_000);

  m=text.match(/(\d+(?:[.,]\d+)?)\s*万\s*(?:越南盾|盾|vnd)?/i);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 10_000);

  return undefined;
}

const noPeopleText:Record<TripLanguage,string>={
  vi:"Chưa có số khách nên mình mới tính ở mức tham khảo.",
  en:"You have not given the party size yet, so prices are still indicative.",
  ko:"인원 수가 아직 없어서 가격은 우선 참고 수준으로 계산해요.",
  ru:"Количество гостей пока не указано, поэтому цены будут ориентировочными.",
  zh:"你还没有填写人数，所以价格暂时只做参考。",
};

export function parseTripText(raw: string): ParsedTrip {
  const text = raw.trim();
  const language=detectLanguage(text);
  const stay=parseStay(text);

  const adults = firstNumber(text,[
    /(\d+)\s*(?:người\s*lớn|nguoi\s*lon|adults?|grownups?)/i,
    /(?:성인|어른)\s*(\d+)\s*명?/i,
    /(\d+)\s*(?:명)?\s*(?:성인|어른)/i,
    /(\d+)\s*(?:взросл(?:ых|ый|ые))/i,
    /(\d+)\s*(?:位|个|個)?\s*(?:成人|大人)/i,
  ]) ?? firstNumber(text,[
    /(\d+)\s*(?:người|nguoi)(?!\s*(?:lớn|lon))/i,
    /(\d+)\s*(?:people|persons?)/i,
    /(\d+)\s*(?:человек|чел\.?)/i,
    /(\d+)\s*명/i,
    /(\d+)\s*(?:位|人)(?!\s*(?:儿童|兒童|孩子))/i,
  ]);

  const children = firstNumber(text,[
    /(\d+)\s*(?:trẻ|tre|bé|be|children|child|kids?)/i,
    /(?:아이|아기|어린이)\s*(\d+)\s*명?/i,
    /(\d+)\s*(?:명)?\s*(?:아이|아기|어린이)/i,
    /(\d+)\s*(?:детей|ребен(?:ок|ка|ка?))/i,
    /(\d+)\s*(?:位|个|個)?\s*(?:儿童|兒童|孩子|小孩)/i,
  ]);

  const interests = Array.from(new Set(
    interestRules.filter(([pattern])=>pattern.test(text)).map(([,label])=>label),
  ));

  const stayPreferences = Array.from(new Set(
    stayPreferenceRules.filter(([pattern])=>pattern.test(text)).map(([,label])=>label),
  ));

  if (children && !stayPreferences.includes("family")) stayPreferences.push("family");

  const mentioned=detectMentionedZone(text);
  const mode=detectAdvisorMode(text,interests,stayPreferences);

  return {
    ...stay,
    adults,
    children,
    budgetVnd: parseBudgetVnd(text),
    interests,
    stayPreferences,
    language,
    mode,
    mentionedZone:mentioned.zone,
    mentionedPlace:mentioned.place,
    raw:text,
  };
}

export function buildParseResponse(raw: string) {
  const parsed = parseTripText(raw);
  const assumptions: string[] = [];
  const nextNeeded: string[] = [];

  if (!parsed.adults && !parsed.children) assumptions.push(noPeopleText[parsed.language]);
  if (parsed.mode === "trip_plan") {
    if (!parsed.days || parsed.nights === undefined) nextNeeded.push("duration");
    if (!parsed.interests.length && !parsed.stayPreferences.length) nextNeeded.push("interests");
    nextNeeded.push("travel_dates");
  }

  return { ok: Boolean(parsed.raw), parsed, assumptions, nextNeeded };
}
