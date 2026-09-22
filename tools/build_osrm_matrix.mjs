import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OSRM_BASE_URL = String(process.env.OSRM_BASE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const OUTPUT_DIR = path.join(ROOT, "private-data");
const POINTS_FILE = path.join(ROOT, "data", "route-points-v0.json");
const HOTELS_FILE = path.join(ROOT, "data", "public-hotels-v0.json");

function isCoord(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function haversineKm(a, b) {
  const rad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function quality(origin, destination, distanceKm, minutes) {
  const straightKm = haversineKm(origin, destination);
  const detourRatio = straightKm > 0 ? distanceKm / straightKm : 1;
  const avgKph = minutes > 0 ? distanceKm / (minutes / 60) : 0;
  const reasons = [];

  if (distanceKm + 0.05 < straightKm) {
    reasons.push("road_distance_shorter_than_straight_line");
  }
  if (detourRatio > 4.5) {
    reasons.push("detour_ratio_high");
  }
  if (avgKph > 100) {
    reasons.push("average_speed_implausibly_high");
  }
  if (distanceKm > 2 && avgKph < 6) {
    reasons.push("average_speed_implausibly_low");
  }

  return {
    state: reasons.length ? "REVIEW" : "ACCEPT",
    straightKm: Math.round(straightKm * 10) / 10,
    detourRatio: Math.round(detourRatio * 100) / 100,
    avgKph: Math.round(avgKph * 10) / 10,
    reasons,
  };
}

async function route(origin, destination) {
  const coords =
    `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=false&steps=false&alternatives=false`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`OSRM HTTP ${response.status}`);
  }

  const body = await response.json();
  const best = body?.routes?.[0];

  if (!best || !Number.isFinite(best.distance) || !Number.isFinite(best.duration)) {
    throw new Error("OSRM route missing distance/duration");
  }

  return {
    distanceKm: Math.round((best.distance / 1000) * 10) / 10,
    normalMinutes: Math.max(1, Math.round(best.duration / 60)),
  };
}

async function main() {
  const [routePointDoc, hotelDoc] = await Promise.all([
    fs.readFile(POINTS_FILE, "utf8").then(JSON.parse),
    fs.readFile(HOTELS_FILE, "utf8").then(JSON.parse),
  ]);

  const targets = (routePointDoc.points || [])
    .filter((p) => p.routing_ok === true)
    .filter((p) => isCoord(p.latitude) && isCoord(p.longitude))
    .filter((p) => ["activity", "center", "airport"].includes(p.kind));

  const unresolvedTargets = (routePointDoc.points || [])
    .filter((p) => !isCoord(p.latitude) || !isCoord(p.longitude))
    .map((p) => ({ ref: p.ref, label: p.label, address: p.address || null }));

  const acceptedHotelPrecisions = new Set(["site_centroid", "route_anchor"]);
  const origins = (hotelDoc.hotels || [])
    .filter((h) => acceptedHotelPrecisions.has(h.route_precision))
    .filter((h) => isCoord(h.latitude) && isCoord(h.longitude))
    .map((h) => ({
      ref: `hotel:${h.id}`,
      label: h.canonical_name,
      latitude: h.latitude,
      longitude: h.longitude,
    }));

  const unresolvedHotels = (hotelDoc.hotels || [])
    .filter((h) => !isCoord(h.latitude) || !isCoord(h.longitude))
    .map((h) => ({
      ref: `hotel:${h.id}`,
      label: h.canonical_name,
      address: h.address || null,
    }));

  if (!origins.length) {
    console.error(
      "No hotels have exact coordinates yet. Add latitude/longitude to the canonical hotel catalog before routing."
    );
  }

  if (!targets.length) {
    console.error("No resolved route targets.");
  }

  const accepted = [];
  const review = [];
  const failures = [];
  const checkedAt = new Date().toISOString();

  for (const origin of origins) {
    for (const destination of targets) {
      const directions = [
        { from: origin, to: destination },
        { from: destination, to: origin },
      ];

      for (const direction of directions) {
        try {
          const result = await route(direction.from, direction.to);
          const q = quality(
            direction.from,
            direction.to,
            result.distanceKm,
            result.normalMinutes,
          );
          const row = {
            fromRef: direction.from.ref,
            toRef: direction.to.ref,
            distanceKm: result.distanceKm,
            normalMinutes: result.normalMinutes,
            source: "osm_osrm_driving_v1",
            checkedAt,
          };

          if (q.state === "ACCEPT") {
            accepted.push(row);
          } else {
            review.push({ ...row, quality: q });
          }
        } catch (error) {
          failures.push({
            fromRef: direction.from.ref,
            toRef: direction.to.ref,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(OUTPUT_DIR, "route-matrix-osrm.json"),
      JSON.stringify({ rows: accepted }, null, 2) + "\n",
    ),
    fs.writeFile(
      path.join(OUTPUT_DIR, "route-matrix-osrm-review.json"),
      JSON.stringify(
        {
          review,
          failures,
          unresolvedHotels,
          unresolvedTargets,
          osrmBaseUrl: OSRM_BASE_URL,
          generatedAt: checkedAt,
        },
        null,
        2,
      ) + "\n",
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        osrmBaseUrl: OSRM_BASE_URL,
        origins: origins.length,
        targets: targets.length,
        accepted: accepted.length,
        review: review.length,
        failures: failures.length,
        unresolvedHotels: unresolvedHotels.length,
        unresolvedTargets: unresolvedTargets.length,
        output: "private-data/route-matrix-osrm.json",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
