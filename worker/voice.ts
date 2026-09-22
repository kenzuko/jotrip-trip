type Env = {
  OPENAI_API_KEY?: string;
};

const LANG_STYLE: Record<string,string> = {
  vi: "Speak natural Vietnamese with a warm, friendly local travel-advisor tone. Use a light Southern Vietnamese rhythm, short phrases, small natural pauses, and conversational emphasis. Do not sound like an announcer or read punctuation mechanically.",
  en: "Speak like a warm, concise local travel advisor. Natural conversational pacing, short phrases and gentle emphasis. Do not sound like an announcer.",
  ko: "Speak natural Korean in a warm local travel-advisor tone, with conversational pacing and short phrases. Do not sound like an announcer.",
  ru: "Speak natural Russian in a warm local travel-advisor tone, with conversational pacing and short phrases. Do not sound like an announcer.",
  zh: "Speak natural Mandarin Chinese in a warm local travel-advisor tone, with conversational pacing and short phrases. Do not sound like an announcer.",
};

export async function createNaturalSpeech(env:Env,text:string,language:string){
  if(!env.OPENAI_API_KEY){
    return new Response(JSON.stringify({
      ok:false,
      error:"natural_voice_not_configured",
    }),{
      status:503,
      headers:{"content-type":"application/json","cache-control":"no-store"},
    });
  }

  const compact=String(text||"").replace(/\s+/g," ").trim().slice(0,900);
  if(!compact){
    return new Response(JSON.stringify({ok:false,error:"text_required"}),{
      status:400,
      headers:{"content-type":"application/json"},
    });
  }

  const response=await fetch("https://api.openai.com/v1/audio/speech",{
    method:"POST",
    headers:{
      "authorization":`Bearer ${env.OPENAI_API_KEY}`,
      "content-type":"application/json",
    },
    body:JSON.stringify({
      model:"gpt-4o-mini-tts",
      voice:"marin",
      input:compact,
      instructions:LANG_STYLE[language]||LANG_STYLE.vi,
      response_format:"mp3",
      speed:1.04,
    }),
  });

  if(!response.ok){
    const detail=await response.text().catch(()=>"");
    console.error("natural_voice_provider_failed",response.status,detail.slice(0,500));
    return new Response(JSON.stringify({
      ok:false,
      error:"natural_voice_provider_failed",
    }),{
      status:502,
      headers:{"content-type":"application/json","cache-control":"no-store"},
    });
  }

  return new Response(response.body,{
    status:200,
    headers:{
      "content-type":"audio/mpeg",
      "cache-control":"private, max-age=0, no-store",
      "x-jotrip-voice":"natural",
    },
  });
}
