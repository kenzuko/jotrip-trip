import { buildDestinationContext } from "./destinationContext";
import { matchPlanningHotels } from "./publicHotels";
import { buildStayContext, type StayPreference } from "./engine/stayContext";
import type { TripLanguage } from "./scenario";

type Env = { DB?: D1Database };

export type AdvisorMode =
  | "trip_plan"
  | "food"
  | "cafe"
  | "things_to_do"
  | "where_to_stay"
  | "compare"
  | "contact";

export type AdvisorRequest = {
  rawText: string;
  language: TripLanguage;
  mode: AdvisorMode;
  interests?: string[];
  stayPreferences?: StayPreference[];
  mentionedZone?: string | null;
};

const copy: Record<TripLanguage, {
  food:string;cafe:string;do:string;stay:string;compare:string;contact:string;fallback:string;
}> = {
  vi: {
    food:"Nếu ở khu này, mình sẽ nhìn hai lớp: món đáng thử trước, rồi mới tới quán cụ thể đã đủ dữ liệu.",
    cafe:"Mình ưu tiên quán trong đúng khu bạn ở hoặc cùng hướng đi, không bắt chạy xa chỉ vì đang nổi.",
    do:"Mình xem những gì thật sự hợp khu này và thời gian của bạn, không liệt kê cả đảo.",
    stay:"Mình so khu ở trước: đi lại, ăn uống, buổi tối và nhịp sống quanh khách sạn.",
    compare:"Mình sẽ so tổng chuyến đi chứ không chỉ nhìn giá phòng.",
    contact:"Khi bạn thấy phương án ổn, JoTrip sẽ kiểm tra lại phòng, vé và xe trước khi chốt.",
    fallback:"Hỏi mình như hỏi một người ở Phú Quốc nha. Mình sẽ trả lời theo dữ liệu đang có.",
  },
  en: {
    food:"I look at two layers: what is worth eating in this area, then specific places with enough current data.",
    cafe:"I prioritize cafes in your area or along your route, not a famous place that sends you far out of the way.",
    do:"I’ll focus on what actually fits this area and your available time, not list the whole island.",
    stay:"I compare the stay area first: travel time, food, evenings and what life around the hotel feels like.",
    compare:"I compare the whole trip, not just the room rate.",
    contact:"Once the option feels right, JoTrip can recheck the room, tickets and car before you confirm.",
    fallback:"Ask me the way you would ask a local in Phu Quoc. I’ll answer from the data I have.",
  },
  ko: {
    food:"이 지역에서는 먼저 무엇을 먹을지 보고, 그다음 최신 정보가 충분한 실제 식당을 골라볼게요.",
    cafe:"유명하다는 이유만으로 멀리 보내지 않고, 숙소나 동선에 맞는 카페를 먼저 볼게요.",
    do:"섬 전체를 나열하지 않고 지금 지역과 일정에 맞는 것만 골라볼게요.",
    stay:"객실 가격보다 먼저 이동, 식사, 저녁 분위기와 호텔 주변 생활을 같이 비교해볼게요.",
    compare:"객실 가격만이 아니라 여행 전체 비용과 시간을 같이 비교할게요.",
    contact:"마음에 드는 안이 생기면 JoTrip이 객실, 티켓, 차량을 다시 확인한 뒤 예약을 도와드릴게요.",
    fallback:"푸꾸옥 현지인에게 묻듯 편하게 물어보세요. 지금 가진 데이터로 답해볼게요.",
  },
  ru: {
    food:"Сначала я смотрю, что стоит попробовать в этом районе, а потом — конкретные места с достаточно свежими данными.",
    cafe:"Я сначала ищу кафе рядом с вашим районом или по пути, а не отправляю далеко только из-за популярности.",
    do:"Я покажу то, что реально подходит этому району и вашему времени, а не весь остров сразу.",
    stay:"Сначала сравню район проживания: дорогу, еду, вечерние активности и жизнь вокруг отеля.",
    compare:"Я сравниваю всю поездку, а не только стоимость номера.",
    contact:"Когда вариант вам понравится, JoTrip перепроверит номер, билеты и машину перед бронированием.",
    fallback:"Спрашивайте так, как спросили бы местного жителя Фукуока. Я отвечу по доступным данным.",
  },
  zh: {
    food:"我会先看这个区域值得吃什么，再看哪些具体餐厅有足够新的资料。",
    cafe:"我优先找住处附近或顺路的咖啡店，不会只因为网红就让你跑很远。",
    do:"我只挑这个区域和你的时间真正合适的体验，不会把全岛清单都塞给你。",
    stay:"我先比较住哪个区域：交通、吃饭、晚上活动，以及酒店周边好不好生活。",
    compare:"我比较的是整趟旅行，不只是房价。",
    contact:"当你觉得方案合适时，JoTrip会再确认房间、门票和用车后再帮你预订。",
    fallback:"你可以像问富国岛当地人一样直接问我，我会按现有数据回答。",
  },
};


function zoneLabel(zone?:string|null, language:TripLanguage="vi") {
  const labels:Record<string,Record<TripLanguage,string>>={
    north:{vi:"Bắc đảo",en:"the north of the island",ko:"북부",ru:"север острова",zh:"北岛"},
    south:{vi:"Nam đảo",en:"the south of the island",ko:"남부",ru:"юг острова",zh:"南岛"},
    duong_dong:{vi:"Dương Đông",en:"Duong Dong",ko:"즈엉동",ru:"Зыонгдонг",zh:"阳东"},
    long_beach:{vi:"Bãi Trường",en:"Long Beach",ko:"롱비치",ru:"Лонг-Бич",zh:"长滩"},
    north_central:{vi:"Ông Lang",en:"Ong Lang",ko:"옹랑",ru:"Онг Ланг",zh:"翁朗"},
    east:{vi:"Hàm Ninh",en:"Ham Ninh",ko:"함닌",ru:"Хамнинь",zh:"咸宁"},
  };
  return labels[zone||""]?.[language] || zone || "";
}

function joinNames(names:string[], language:TripLanguage) {
  const clean=names.filter(Boolean).slice(0,3);
  if(clean.length<=1)return clean[0]||"";
  const last=clean.pop()!;
  const connector=language==="vi"?" và ":language==="en"?" and ":language==="ko"?"와 ":language==="ru"?" и ":"、";
  return clean.join(", ")+connector+last;
}

function contextualAnswer(
  language:TripLanguage,
  mode:"food"|"cafe"|"things_to_do",
  zone:string|undefined,
  names:string[],
  fallback:string,
) {
  const area=zoneLabel(zone,language);
  const list=joinNames(names,language);
  if(!list)return fallback;

  if(language==="en"){
    if(mode==="food")return "Around "+(area||"this area")+", I’d start with "+list+". I separate local food ideas from specific venues so an old listing does not become a fake recommendation.";
    if(mode==="cafe")return "For coffee around "+(area||"this area")+", the current test data points to "+list+". I keep nearby or on-route options ahead of a famous detour.";
    return "Around "+(area||"this area")+", I’d start with "+list+". I’m keeping the answer local instead of listing the whole island.";
  }
  if(language==="ko"){
    if(mode==="food")return (area||"이 지역")+"에서는 우선 "+list+"부터 볼게요. 음식 자체와 실제 식당 정보를 분리해서 오래된 목록을 추천처럼 보이지 않게 해요.";
    if(mode==="cafe")return (area||"이 지역")+" 카페는 현재 테스트 데이터 기준으로 "+list+"부터 볼 만해요. 멀리 돌아가는 유명 카페보다 동선에 맞는 곳을 먼저 봅니다.";
    return (area||"이 지역")+"에서는 "+list+"부터 보는 게 좋아요. 섬 전체를 나열하지 않고 이 지역에 맞는 것만 보여드릴게요.";
  }
  if(language==="ru"){
    if(mode==="food")return "В районе "+(area||"здесь")+" я бы сначала посмотрел "+list+". Я отдельно храню идеи блюд и конкретные заведения, чтобы старый список не выглядел как актуальная рекомендация.";
    if(mode==="cafe")return "Для кофе в районе "+(area||"здесь")+" тестовые данные сейчас дают "+list+". Сначала беру варианты рядом или по пути, а не дальний объезд ради популярного места.";
    return "В районе "+(area||"здесь")+" я бы начал с "+list+". Не буду выдавать список всего острова, если вы спрашиваете про один район.";
  }
  if(language==="zh"){
    if(mode==="food")return "在"+(area||"这个区域")+"，我会先看"+list+"。我把“值得吃什么”和“具体去哪家店”分开，避免旧名单变成假的实时推荐。";
    if(mode==="cafe")return "在"+(area||"这个区域")+"喝咖啡，当前测试资料先看"+list+"。我会优先顺路和附近的选择，不会只因为网红就让你绕很远。";
    return "在"+(area||"这个区域")+"，我会先看"+list+"。你问一个区域，我就不会把全岛清单都塞给你。";
  }

  if(mode==="food")return "Nếu ở "+(area||"khu này")+", mình sẽ xem "+list+" trước. Mình tách “nên ăn gì” khỏi “ăn ở quán nào” để dữ liệu cũ không biến thành gợi ý giả.";
  if(mode==="cafe")return "Nếu tìm cà phê ở "+(area||"khu này")+", lớp test hiện có "+list+". Mình ưu tiên đúng khu hoặc cùng hướng đi, không bắt chạy xa chỉ vì một quán đang nổi.";
  return "Ở "+(area||"khu này")+", mình sẽ xem "+list+" trước. Bạn hỏi một khu thì mình trả lời đúng khu đó, không xổ danh sách cả đảo.";
}

function stayAnswer(
  language:TripLanguage,
  hotelName:string|undefined,
  contextReason:string|undefined,
  fallback:string,
){
  if(!hotelName)return fallback;
  const reason=(contextReason||"").replace(/[.]$/,"");
  if(language==="en")return "I’d look at "+hotelName+" first for this request"+(reason?", mainly because "+reason.charAt(0).toLowerCase()+reason.slice(1):"")+". I’ll still keep alternatives when they trade lower price for more travel time.";
  if(language==="ko")return "이 조건에서는 "+hotelName+"부터 볼게요"+(reason?". 이유는 "+reason:"")+". 더 저렴하지만 이동이 늘어나는 대안도 같이 남겨둘게요.";
  if(language==="ru")return "Для этого запроса я бы сначала посмотрел "+hotelName+(reason?". Причина: "+reason:"")+". Более дешёвые варианты оставлю, если у них есть понятный компромисс по дороге.";
  if(language==="zh")return "按这个需求，我会先看"+hotelName+(reason?"，主要因为"+reason:"")+"。如果其他酒店更便宜但要多花交通时间，我也会保留给你比较。";
  return "Với nhu cầu này, mình sẽ xem "+hotelName+" trước"+(reason?" vì "+reason.charAt(0).toLowerCase()+reason.slice(1):"")+". Phương án rẻ hơn nhưng đổi lại nhiều thời gian đi xe vẫn sẽ được giữ để bạn tự so.";
}

export async function answerAdvisor(env:Env, req:AdvisorRequest) {
  const language=req.language||"vi";
  const text=copy[language];
  const interests=req.interests||[];
  const stayPreferences=req.stayPreferences||[];

  if(req.mode==="food" || req.mode==="cafe" || req.mode==="things_to_do"){
    const intent=req.mode==="food"?"eat":req.mode==="cafe"?"cafe":"do";
    const context=await buildDestinationContext(env,{
      zoneCode:req.mentionedZone||undefined,
      intents:[intent],
      limitPerGroup:5,
    });

    const names =
      req.mode==="food"
        ? [
            ...context.groups.eat.knowledge.map((x)=>x.title),
            ...context.groups.eat.venues.map((x)=>x.name),
          ]
        : req.mode==="cafe"
          ? context.groups.cafe.venues.map((x)=>x.name)
          : [
              ...context.groups.do.venues.map((x)=>x.name),
              ...context.groups.do.knowledge.map((x)=>x.title),
            ];

    const fallback=req.mode==="food"?text.food:req.mode==="cafe"?text.cafe:text.do;

    return {
      ok:true,
      mode:req.mode,
      language,
      answerText:contextualAnswer(language,req.mode,req.mentionedZone||undefined,names,fallback),
      context,
    };
  }

  if(req.mode==="where_to_stay"){
    const base=matchPlanningHotels(interests,10);
    const hotels=await Promise.all(base.map(async item=>({
      ...item,
      stayContext:await buildStayContext(env,item.hotel.area_code,stayPreferences),
    })));
    const hasGeoAnchor=interests.some((x)=>
      ["VinWonders","Safari","Hòn Thơm","Sunset Town","Chợ đêm"].includes(x),
    );
    const spatialWeight=(value:string)=>value==="direct"?100:value==="balanced"?45:0;

    hotels.sort((a,b)=>{
      if(hasGeoAnchor){
        const spatial=spatialWeight(b.spatialFit)-spatialWeight(a.spatialFit);
        if(spatial!==0)return spatial;
      }
      return b.stayContext.fitScore-a.stayContext.fitScore;
    });

    const selected=hotels.slice(0,4);
    return {
      ok:true,
      mode:req.mode,
      language,
      answerText:stayAnswer(
        language,
        selected[0]?.hotel.canonical_name,
        selected[0]?.stayContext.reasons?.[0] || selected[0]?.stayContext.summary,
        text.stay,
      ),
      hotels:selected,
    };
  }

  if(req.mode==="compare"){
    return {ok:true,mode:req.mode,language,answerText:text.compare};
  }

  if(req.mode==="contact"){
    return {ok:true,mode:req.mode,language,answerText:text.contact};
  }

  return {ok:true,mode:req.mode,language,answerText:text.fallback};
}
