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

    return {
      ok:true,
      mode:req.mode,
      language,
      answerText:req.mode==="food"?text.food:req.mode==="cafe"?text.cafe:text.do,
      context,
    };
  }

  if(req.mode==="where_to_stay"){
    const base=matchPlanningHotels(interests,10);
    const hotels=await Promise.all(base.map(async item=>({
      ...item,
      stayContext:await buildStayContext(env,item.hotel.area_code,stayPreferences),
    })));
    hotels.sort((a,b)=>b.stayContext.fitScore-a.stayContext.fitScore);
    return {
      ok:true,
      mode:req.mode,
      language,
      answerText:text.stay,
      hotels:hotels.slice(0,4),
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
