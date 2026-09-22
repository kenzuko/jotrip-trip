import { loadDestinationKnowledge } from "./openPqSource";
import { loadOpenPqVenues } from "./openPqVenueSource";

type Env = { DB?: D1Database };

export type DestinationContextRequest = {
  zoneCode?: string;
  latitude?: number;
  longitude?: number;
  intents?: string[];
  daypart?: "morning" | "afternoon" | "evening" | "night";
  limitPerGroup?: number;
};

type KnowledgeItem = {
  id: string;
  title: string;
  type: "FOOD" | "PLACE";
  canonicalEntityId: string | null;
  zones: string[];
  intents: string[];
  summary: string | null;
  practical: string | null;
  expectation: string | null;
  beforeYouGo: string[];
  map: { lat:number; lon:number; precision?:string|null } | null;
  address: string | null;
  updatedAt?: string;
};

type VenueRow = {
  id: string;
  name: string;
  category: string;
  zone_code: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  phone: string | null;
  tags_json: string | null;
  opening_hours_json: string | null;
  price_level: string | null;
  verified_at: string | null;
  status: string;
};

function haversineKm(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function zoneMatches(item:KnowledgeItem, zone?:string) {
  if (!zone) return item.zones.includes("islandwide");
  return item.zones.includes(zone) || item.zones.includes("islandwide");
}

function rankKnowledge(items:KnowledgeItem[], req:DestinationContextRequest) {
  const intents=new Set(req.intents||[]);
  return items
    .filter(item=>zoneMatches(item,req.zoneCode))
    .map(item=>{
      let score=item.zones.includes(req.zoneCode||"") ? 30 : 10;
      for (const intent of item.intents||[]) if (intents.has(intent)) score+=10;
      if (req.latitude!=null && req.longitude!=null && item.map) {
        score += Math.max(0, 20 - haversineKm(req.latitude,req.longitude,item.map.lat,item.map.lon));
      }
      return {item,score};
    })
    .sort((a,b)=>b.score-a.score || a.item.title.localeCompare(b.item.title,"vi"))
    .map(x=>x.item);
}

function venueDistance(row:VenueRow, req:DestinationContextRequest) {
  if (
    req.latitude==null || req.longitude==null ||
    row.latitude==null || row.longitude==null
  ) return null;
  return haversineKm(req.latitude,req.longitude,row.latitude,row.longitude);
}

function toVenue(row:VenueRow, req:DestinationContextRequest) {
  let tags:string[]=[];
  try { tags=JSON.parse(row.tags_json||"[]"); } catch {}
  const verifiedMs = Date.parse(row.verified_at || "");
  const ageDays = Number.isFinite(verifiedMs)
    ? Math.max(0, Math.floor((Date.now() - verifiedMs) / 86_400_000))
    : null;

  return {
    id:row.id,
    name:row.name,
    category:row.category,
    zoneCode:row.zone_code,
    address:row.address,
    phone:row.phone,
    priceLevel:row.price_level,
    tags,
    verifiedAt:row.verified_at,
    freshness: ageDays == null ? "unknown" : ageDays <= 90 ? "current" : "stale",
    distanceKm:venueDistance(row,req),
  };
}

async function loadVenues(env:Env, req:DestinationContextRequest) {
  const canonical = await loadOpenPqVenues();
  const canonicalRows: VenueRow[] = canonical.rows
    .filter((row) => (row.status || "REVIEW") === "ACTIVE")
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      zone_code: row.zone_code || null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      address: row.address || null,
      phone: row.phone || null,
      tags_json: JSON.stringify(row.tags || []),
      opening_hours_json: row.opening_hours == null ? null : JSON.stringify(row.opening_hours),
      price_level: row.price_level || null,
      verified_at: row.verified_at || null,
      status: row.status || "REVIEW",
    }));

  if (!env.DB) return canonicalRows;

  try {
  const result=await env.DB.prepare(
    `SELECT id,name,category,zone_code,latitude,longitude,address,phone,tags_json,
            opening_hours_json,price_level,verified_at,status
       FROM destination_venues
      WHERE status='ACTIVE'
        AND category IN ('LOCAL_FOOD','RESTAURANT','CAFE','ATTRACTION')
        AND (? IS NULL OR zone_code = ? OR zone_code IS NULL)
      ORDER BY
        CASE WHEN zone_code = ? THEN 0 ELSE 1 END,
        COALESCE(verified_at,'') DESC,
        name ASC
      LIMIT 200`
  ).bind(req.zoneCode||null,req.zoneCode||null,req.zoneCode||null).all<VenueRow>();

  const d1Rows = result.results || [];
  const byId = new Map<string, VenueRow>();
  for (const row of d1Rows) byId.set(row.id, row);
  // Open Phu Quoc CMS is canonical for editorial/operational venue state.
  // It overrides same-id rows from the local D1 cache/import layer.
  for (const row of canonicalRows) byId.set(row.id, row);
  return Array.from(byId.values());
  } catch (error) {
    // Migration 0008 may not have been applied yet. Canonical Open Phu Quoc
    // venue data should still work without the local D1 acceleration layer.
    console.warn("destination_venues_unavailable", error);
    return canonicalRows;
  }
}

function groupVenue(rows:VenueRow[], req:DestinationContextRequest, category:string, limit:number) {
  return rows
    .filter(r=>r.category===category)
    .map(r=>toVenue(r,req))
    .sort((a,b)=>{
      const freshnessRank=(value:string)=>value==="current"?0:value==="unknown"?1:2;
      const freshnessDelta=freshnessRank(a.freshness)-freshnessRank(b.freshness);
      if(freshnessDelta!==0)return freshnessDelta;
      if (a.distanceKm!=null && b.distanceKm!=null) return a.distanceKm-b.distanceKm;
      if (a.distanceKm!=null) return -1;
      if (b.distanceKm!=null) return 1;
      return a.name.localeCompare(b.name,"vi");
    })
    .slice(0,limit);
}

export async function buildDestinationContext(env:Env, req:DestinationContextRequest) {
  const limit=Math.max(1,Math.min(8,req.limitPerGroup||4));
  const knowledge = await loadDestinationKnowledge();
  const allKnowledge=(knowledge.items||[]) as KnowledgeItem[];
  const ranked=rankKnowledge(allKnowledge,req);
  const venues=await loadVenues(env,req);

  const eatKnowledge=ranked.filter(x=>x.type==="FOOD").slice(0,limit);
  const doKnowledge=ranked.filter(x=>x.type==="PLACE").slice(0,limit);

  const cafes=groupVenue(venues,req,"CAFE",limit);
  const restaurants=[
    ...groupVenue(venues,req,"LOCAL_FOOD",limit),
    ...groupVenue(venues,req,"RESTAURANT",limit),
  ].slice(0,limit);
  const attractions=groupVenue(venues,req,"ATTRACTION",limit);

  return {
    ok:true,
    knowledgeSource: knowledge.sourceState,
    venueSource: venues.length ? "openpq_or_d1" : "none",
    zoneCode:req.zoneCode||null,
    daypart:req.daypart||null,
    groups:{
      eat:{
        knowledge:eatKnowledge,
        venues:restaurants,
        dataState:restaurants.length
          ? (restaurants.some((x)=>x.freshness==="current") ? "venue_data_current" : "venue_data_stale")
          : "knowledge_only",
      },
      cafe:{
        venues:cafes,
        dataState:cafes.length
          ? (cafes.some((x)=>x.freshness==="current") ? "venue_data_current" : "venue_data_stale")
          : "needs_venue_sync",
      },
      do:{
        knowledge:doKnowledge,
        venues:attractions,
        dataState:attractions.length
          ? (attractions.some((x)=>x.freshness==="current") ? "venue_data_current" : "venue_data_stale")
          : "knowledge_only",
      },
    },
  };
}
