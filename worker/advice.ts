import type { TripLanguage } from "./scenario";
import type { StayPreference } from "./engine/stayContext";

export type AdviceInput = {
  language: TripLanguage;
  days?: number;
  nights?: number;
  adults?: number;
  children?: number;
  interests?: string[];
  stayPreferences?: StayPreference[];
  topArea?: string | null;
  mode?: string;
};

const areaLabel: Record<string, Record<TripLanguage, string>> = {
  north: {
    vi:"Bắc đảo", en:"the north", ko:"북부", ru:"север острова", zh:"北岛",
  },
  south: {
    vi:"Nam đảo", en:"the south", ko:"남부", ru:"юг острова", zh:"南岛",
  },
  duong_dong: {
    vi:"Dương Đông", en:"Duong Dong", ko:"즈엉동", ru:"Зыонгдонг", zh:"阳东",
  },
  long_beach: {
    vi:"Bãi Trường", en:"Long Beach", ko:"롱비치", ru:"Лонг-Бич", zh:"长滩",
  },
  north_central: {
    vi:"Ông Lang", en:"Ong Lang", ko:"옹랑", ru:"Онг Ланг", zh:"翁朗",
  },
  east: {
    vi:"Đông đảo", en:"the east", ko:"동부", ru:"восток острова", zh:"东部",
  },
};

function localArea(area:string|undefined|null, lang:TripLanguage){
  return area ? areaLabel[area]?.[lang] || area : "";
}

export function buildAdvice(input:AdviceInput): string[] {
  const lang=input.language || "vi";
  const interests=input.interests || [];
  const preferences=input.stayPreferences || [];
  const tips:string[]=[];
  const area=localArea(input.topArea,lang);
  const shortTrip=Boolean(input.days && input.days <= 3);
  const hasNorth=interests.some(x=>["VinWonders","Safari"].includes(x));
  const hasSouth=interests.some(x=>["Hòn Thơm","Sunset Town"].includes(x));

  if(lang==="vi"){
    if(shortTrip && hasNorth && hasSouth){
      tips.push("Chuyến ngắn mà chạy cả Bắc lẫn Nam đảo sẽ mất khá nhiều thời gian trên xe. Mình sẽ ưu tiên gom điểm cùng hướng.");
    } else if(shortTrip){
      tips.push("Với chuyến ngắn, đừng cố nhét quá nhiều điểm. Một lịch ít chặng nhưng đúng hướng thường dễ chịu hơn.");
    }
    if(area){
      tips.push(`Mình đang nghiêng về ${area}. Đừng chỉ nhìn giá phòng - xem buổi tối quanh đó có tiện ăn uống, đi bộ và gọi xe không.`);
    }
    if(preferences.includes("food") || interests.includes("Ăn uống")){
      tips.push("Quán nổi tiếng chưa chắc hợp lịch. JoTrip ưu tiên món đáng thử trước, rồi mới chọn quán đúng khu và còn đủ dữ liệu.");
    }
    if(preferences.includes("cafe") || interests.includes("Cà phê")){
      tips.push("Nếu đi cà phê, mình ưu tiên quán cùng khu hoặc cùng hướng đi thay vì bắt bạn vòng xa chỉ để check-in.");
    }
    if(input.children){
      tips.push("Có trẻ em thì nên chừa khoảng nghỉ và hạn chế đổi khu liên tục trong ngày.");
    }
    if(!tips.length){
      tips.push("Mình sẽ nhìn cả thời gian di chuyển, nhịp sống quanh chỗ ở và chi phí tổng - không chỉ nhìn một giá phòng.");
    }
  }

  if(lang==="en"){
    if(shortTrip) tips.push("For a short trip, fewer stops in the same direction usually work better than crossing the island repeatedly.");
    if(area) tips.push(`I’m leaning toward ${area}. Check the life around the hotel too - food, evenings, walking and car time matter as much as room price.`);
    if(preferences.includes("food") || interests.includes("Ăn uống")) tips.push("I’ll start with what is worth eating, then narrow it to places that fit your area and have usable current data.");
    if(!tips.length) tips.push("I’ll compare the whole trip - travel time, the stay area and total cost - not just one room rate.");
  }

  if(lang==="ko"){
    if(shortTrip) tips.push("짧은 일정은 섬을 여러 번 가로지르기보다 같은 방향의 일정을 묶는 편이 훨씬 편합니다.");
    if(area) tips.push(`지금은 ${area} 쪽이 더 맞아 보여요. 객실 가격뿐 아니라 저녁, 식사, 도보 이동과 차량 시간도 같이 볼게요.`);
    if(preferences.includes("food") || interests.includes("Ăn uống")) tips.push("먼저 이 지역에서 무엇을 먹을지 정한 뒤, 최신 정보가 충분한 실제 식당으로 좁혀볼게요.");
    if(!tips.length) tips.push("객실 가격 하나보다 이동 시간, 숙소 주변 생활과 여행 전체 비용을 같이 비교할게요.");
  }

  if(lang==="ru"){
    if(shortTrip) tips.push("Для короткой поездки лучше объединять места по направлению, чем несколько раз пересекать остров.");
    if(area) tips.push(`Сейчас я бы смотрел ${area}. Важна не только цена номера, но и еда, вечер, пешая доступность и время в машине.`);
    if(preferences.includes("food") || interests.includes("Ăn uống")) tips.push("Сначала определим, что стоит попробовать, а потом выберем конкретные места с достаточно свежими данными.");
    if(!tips.length) tips.push("Я сравню всю поездку: дорогу, район проживания и общую стоимость, а не только цену номера.");
  }

  if(lang==="zh"){
    if(shortTrip) tips.push("短途行程最好把同方向的景点放在一起，不要一天里反复穿越全岛。");
    if(area) tips.push(`我现在更偏向${area}。别只看房价，晚上吃饭、步行方便度和坐车时间也很重要。`);
    if(preferences.includes("food") || interests.includes("Ăn uống")) tips.push("我会先判断这个区域值得吃什么，再缩小到资料足够新的具体餐厅。");
    if(!tips.length) tips.push("我会比较整趟旅行的交通、住宿区域和总成本，不只看一间房的价格。");
  }

  return Array.from(new Set(tips)).slice(0,3);
}
