import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["worker/advisor.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const advisor = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

const NOW = Date.parse("2026-09-27T06:10:00+00:00");
const vietnamToday = "2026-09-27";

const weatherBundle = {
  schema_version: "weather-current-v3",
  generated_at: "2026-09-27T06:10:00+00:00",
  groundtruth: {
    status: "READY",
    atmosphere: {
      vvpq: {
        status: "FRESH", data_class: "ACTUAL",
        observed_at: "2026-09-27T06:00:00+00:00",
        temperature_c: 28, wind_speed_kmh: 7.4,
      },
    },
  },
  local_now: {
    points: {
      duong_dong: {
        name: "Dương Đông", temperature_c: 27.3, wind_kmh: 16.5,
        rain: { rain_rate_mm_h: 0.44, data_class: "ESTIMATED_NOW", imminence: { level: "HIGH", not_probability: true } },
      },
      an_thoi: {
        name: "An Thới", temperature_c: 28.2, wind_kmh: 26.8,
        rain: { rain_rate_mm_h: 0, data_class: "ESTIMATED_NOW", imminence: { level: "HIGH", not_probability: true } },
      },
    },
  },
  model_72h: {
    points: {
      duong_dong: [{
        time: "2026-09-27T16:00:00+07:00",
        temperature_c: 28.7, wind_kmh: 12, gust_kmh: 29,
        rain_3h_mm: 0.5, data_class: "MODEL_ONLY",
      }],
      an_thoi: [{
        time: "2026-09-27T16:00:00+07:00",
        temperature_c: 27.6, wind_kmh: 23.2, gust_kmh: 31.4,
        rain_3h_mm: 1.35, data_class: "MODEL_ONLY",
      }],
    },
  },
};

const flightPayload = {
  latest: {
    report_state: "REPORT_READY",
    source_date: vietnamToday,
    collected_at_vn: "2026-09-27T13:08:00+07:00",
    records: [
      { direction: "departure", operating_flight_number: "VN1232", station: "HA NOI", route: "PQC-HAN", scheduled_time: "13:55", status: "LÀM THỦ TỤC LÚC" },
      { direction: "departure", operating_flight_number: "VJ452", station: "HA NOI", route: "PQC-HAN", scheduled_time: "15:40", status: "LÀM THỦ TỤC LÚC" },
      { direction: "departure", operating_flight_number: "9G1230", station: "HA NOI", route: "PQC-HAN", scheduled_time: "17:45", status: "LÀM THỦ TỤC LÚC" },
      { direction: "departure", operating_flight_number: "VJ442", station: "HA NOI", route: "PQC-HAN", scheduled_time: "19:20", status: "LÀM THỦ TỤC LÚC" },
      { direction: "departure", operating_flight_number: "VJ440", station: "HA NOI", route: "PQC-HAN", scheduled_time: "10:55", status: "ĐÃ CẤT CÁNH" },
      { direction: "departure", operating_flight_number: "VJ412", station: "HO CHI MINH", route: "PQC-SGN", scheduled_time: "16:20", status: "LÀM THỦ TỤC LÚC" },
    ],
  },
  health: {
    state: "REPORT_READY",
    status: "REPORT_READY",
    source_date: vietnamToday,
    collected_at_vn: "2026-09-27T13:08:00+07:00",
    fallback_used: false,
  },
};

async function withFeed(payload, run) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "raw.githubusercontent.com");
    assert.match(url.pathname, /data-weather\/data\/weather-current\/latest\.json/);
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  Date.now = () => NOW;
  try { return await run(); }
  finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
}

async function withFlightFeed(payload, run) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "jotrip-airport-live.kenzuko.workers.dev");
    assert.equal(url.searchParams.get("date"), vietnamToday);
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  Date.now = () => NOW;
  try { return await run(); }
  finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
}

test("weather questions use fresh Weather Lab observations and forecast with provenance", async () => {
  await withFeed(weatherBundle, async () => {
    const result = await advisor.answerAdvisor({}, {
      rawText: "Thời tiết Phú Quốc chiều nay thế nào?",
      language: "vi",
      mode: "weather",
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "weather");
    assert.match(result.answerText, /METAR.*13:00.*28°C.*7,4 km\/h/);
    assert.match(result.answerText, /16:00.*28,7°C.*12 km\/h.*0,5 mm\/3 giờ/);
    assert.match(result.answerText, /Weather Lab cập nhật lúc 27\/09 13:10/);
    assert.match(result.answerText, /tín hiệu đối lưu cao/);
    assert.match(result.answerText, /Nowcast hiện tại \(ước tính\): Dương Đông: 27,3°C, gió 16,5 km\/h, mưa ước tính 0,44 mm\/giờ/);
    assert.doesNotMatch(result.answerText, /khách sạn|Bắc đảo/);

    const south = await advisor.answerAdvisor({}, {
      rawText: "Thời tiết An Thới chiều nay thế nào?",
      language: "vi",
      mode: "weather",
    });
    assert.match(south.answerText, /Nowcast hiện tại \(ước tính\): An Thới:/);
    assert.doesNotMatch(south.answerText, /Dương Đông/);
  });
});

test("Weather Lab data stays usable through one scheduled 30-minute cycle plus delay margin", async () => {
  const delayed = structuredClone(weatherBundle);
  delayed.generated_at = "2026-09-27T05:35:00+00:00";
  delayed.groundtruth.atmosphere.vvpq.observed_at = "2026-09-27T05:25:00+00:00";
  await withFeed(delayed, async () => {
    const result = await advisor.answerAdvisor({}, {
      rawText: "Thời tiết Phú Quốc chiều nay thế nào?",
      language: "vi",
      mode: "weather",
    });
    assert.doesNotMatch(result.answerText, /còn mới trong 40 phút/i);
    assert.match(result.answerText, /Weather Lab cập nhật lúc 27\/09 12:35/);
    assert.match(result.answerText, /Dự báo mô hình/);
  });
});

test("stale Weather Lab snapshots fail closed instead of being presented as current", async () => {
  const stale = structuredClone(weatherBundle);
  stale.generated_at = "2026-09-27T05:25:00+00:00";
  await withFeed(stale, async () => {
    const result = await advisor.answerAdvisor({}, {
      rawText: "Thời tiết Phú Quốc chiều nay thế nào?",
      language: "vi",
      mode: "weather",
    });
    assert.match(result.answerText, /chưa lấy được gói thời tiết Weather Lab còn mới trong 40 phút/i);
    assert.doesNotMatch(result.answerText, /28,7°C/);
  });
});

test("flight questions use the fresh airport board and never replay the old trip answer", async () => {
  await withFlightFeed(flightPayload, async () => {
    const result = await advisor.answerAdvisor({}, {
      rawText: "Chiều nay còn bao nhiêu chuyến bay đi Hà Nội?",
      language: "vi",
      mode: "flight_status",
    });
    assert.equal(result.mode, "flight_status");
    assert.match(result.answerText, /3 chuyến bay.*Hà Nội/);
    assert.match(result.answerText, /VN1232 13:55/);
    assert.match(result.answerText, /VJ452 15:40/);
    assert.match(result.answerText, /9G1230 17:45/);
    assert.doesNotMatch(result.answerText, /19:20|khách sạn|Bắc đảo/);
  });
});

test("stale flight boards do not produce a misleading current count", async () => {
  const stale = structuredClone(flightPayload);
  stale.latest.collected_at_vn = "2026-09-27T12:10:00+07:00";
  stale.health.collected_at_vn = "2026-09-27T12:10:00+07:00";
  await withFlightFeed(stale, async () => {
    const result = await advisor.answerAdvisor({}, {
      rawText: "Chiều nay còn bao nhiêu chuyến bay đi Hà Nội?",
      language: "vi",
      mode: "flight_status",
    });
    assert.match(result.answerText, /chưa đọc được bảng bay trực tiếp đủ mới/i);
    assert.match(result.answerText, /airport\.openphuquoc\.com/);
    assert.doesNotMatch(result.answerText, /3 chuyến/);
  });
});
