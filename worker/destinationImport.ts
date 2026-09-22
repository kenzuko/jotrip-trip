type Env = { DB?: D1Database };

export type DestinationVenueInput = {
  id:string;
  name:string;
  category:"LOCAL_FOOD"|"RESTAURANT"|"CAFE"|"ATTRACTION";
  zoneCode?:string|null;
  latitude?:number|null;
  longitude?:number|null;
  address?:string|null;
  phone?:string|null;
  tags?:string[];
  openingHours?:unknown;
  priceLevel?:string|null;
  sourceRef?:string|null;
  sourceType?:string|null;
  verifiedAt?:string|null;
  status?:"ACTIVE"|"CLOSED"|"REVIEW";
};

export async function importDestinationVenues(env:Env, rows:DestinationVenueInput[]) {
  if (!env.DB) return {ok:false,error:"db_not_bound"};
  if (!Array.isArray(rows)||!rows.length) return {ok:false,error:"rows_required"};
  if (rows.length>2000) return {ok:false,error:"batch_too_large",maxRows:2000};

  const valid=rows.filter(row=>
    row.id && row.name &&
    ["LOCAL_FOOD","RESTAURANT","CAFE","ATTRACTION"].includes(row.category) &&
    (row.latitude==null || (Number.isFinite(row.latitude)&&row.latitude>=-90&&row.latitude<=90)) &&
    (row.longitude==null || (Number.isFinite(row.longitude)&&row.longitude>=-180&&row.longitude<=180))
  );

  const statements=valid.map(row=>env.DB!.prepare(
    `INSERT INTO destination_venues
      (id,name,category,zone_code,latitude,longitude,address,phone,tags_json,
       opening_hours_json,price_level,source_ref,source_type,verified_at,status,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       category=excluded.category,
       zone_code=excluded.zone_code,
       latitude=excluded.latitude,
       longitude=excluded.longitude,
       address=excluded.address,
       phone=excluded.phone,
       tags_json=excluded.tags_json,
       opening_hours_json=excluded.opening_hours_json,
       price_level=excluded.price_level,
       source_ref=excluded.source_ref,
       source_type=excluded.source_type,
       verified_at=excluded.verified_at,
       status=excluded.status,
       updated_at=CURRENT_TIMESTAMP`
  ).bind(
    row.id,row.name,row.category,row.zoneCode||null,row.latitude??null,row.longitude??null,
    row.address||null,row.phone||null,JSON.stringify(row.tags||[]),
    row.openingHours==null?null:JSON.stringify(row.openingHours),row.priceLevel||null,
    row.sourceRef||null,row.sourceType||null,row.verifiedAt||null,row.status||"ACTIVE"
  ));

  await env.DB.batch(statements);
  return {ok:true,received:rows.length,imported:valid.length,rejected:rows.length-valid.length};
}
