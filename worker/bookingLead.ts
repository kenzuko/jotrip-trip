type Env = { DB?: D1Database };

export type BookingLeadPayload = {
  sessionId?: string | null;
  contact: string;
  contactChannel?: "phone" | "email" | "whatsapp" | "other";
  language?: string;
  note?: string;
  tripContext?: unknown;
  consent?: boolean;
  website?: string;
};

export async function saveBookingLead(env:Env,payload:BookingLeadPayload){
  if(!env.DB)return {ok:false,error:"db_not_bound"};
  if(payload.website)return {ok:true,status:"ignored"};
  if(!payload.consent)return {ok:false,error:"consent_required"};
  const contact=String(payload.contact||"").trim();
  if(contact.length<5||contact.length>160)return {ok:false,error:"contact_invalid"};

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS booking_leads(
      id TEXT PRIMARY KEY,
      session_id TEXT,
      contact TEXT NOT NULL,
      contact_channel TEXT,
      language TEXT,
      note TEXT,
      trip_context_json TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  const id=crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO booking_leads
      (id,session_id,contact,contact_channel,language,note,trip_context_json,status)
     VALUES(?,?,?,?,?,?,?,'NEW')`
  ).bind(
    id,
    payload.sessionId||null,
    contact,
    payload.contactChannel||"other",
    payload.language||"vi",
    String(payload.note||"").slice(0,1000)||null,
    payload.tripContext==null?null:JSON.stringify(payload.tripContext).slice(0,20000),
  ).run();

  return {ok:true,id,status:"NEW"};
}
