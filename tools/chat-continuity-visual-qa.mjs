import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = "http://127.0.0.1:4173";
const server = spawn("node", ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", chunk => { serverOutput += String(chunk); });
}

async function ready() {
  for (let i = 0; i < 70; i++) {
    if (server.exitCode !== null) throw Error("Vite exited early: " + serverOutput);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch { /* server still starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error("Vite did not start: " + serverOutput);
}

const knowledge = {
  north: {
    hotel: { id: "qa-north", canonical_name: "Khách sạn giả lập Bắc đảo", area_code: "north", slug: "qa-north", address: null, fit_tags: [] },
    spatialFit: "direct", reasons: [], cautions: [],
    stayContext: { zoneCode: "north", summary: "Thuận lịch VinWonders và Safari.", signals: [], verifiedVenueCounts: null, fitScore: 0.9, confidence: 0.5, reasons: [], cautions: [] },
    nearby: { ok: true, zoneCode: "north", daypart: null, groups: { eat: { knowledge: [], venues: [], dataState: "unknown" }, cafe: { venues: [], dataState: "unknown" }, do: { knowledge: [], venues: [], dataState: "unknown" } } },
    routeFacts: [],
  },
  duong_dong: {
    hotel: { id: "qa-duong-dong", canonical_name: "Khách sạn giả lập Dương Đông", area_code: "duong_dong", slug: "qa-duong-dong", address: null, fit_tags: [] },
    spatialFit: "balanced", reasons: [], cautions: [],
    stayContext: { zoneCode: "duong_dong", summary: "Thuận bữa tối và dạo phố.", signals: [], verifiedVenueCounts: null, fitScore: 0.75, confidence: 0.5, reasons: [], cautions: [] },
    nearby: { ok: true, zoneCode: "duong_dong", daypart: null, groups: { eat: { knowledge: [], venues: [], dataState: "unknown" }, cafe: { venues: [], dataState: "unknown" }, do: { knowledge: [], venues: [], dataState: "unknown" } } },
    routeFacts: [],
  },
};
const plan = {
  ok: true, mode: "planning", planningHotels: [knowledge.north, knowledge.duong_dong],
  insights: [], advice: [], scenarios: [], assumptions: [], nextNeeded: ["travel_dates"],
};
const parseResponse = text => {
  const acknowledgement = /^(?:a|ừ|ok|okay)$/iu.test(text.trim());
  return {
    ok: true, conversationAction: acknowledgement ? "acknowledgement" : "request",
    parsed: {
      raw: text, language: "vi", mode: "trip_plan",
      days: acknowledgement ? undefined : 3, nights: acknowledgement ? undefined : 2,
      interests: acknowledgement ? [] : ["VinWonders", "Safari"],
      stayPreferences: acknowledgement ? [] : ["family"],
    },
    assumptions: [], nextNeeded: acknowledgement ? [] : ["travel_dates"],
    assistantText: acknowledgement
      ? "Ừ, mình nghe đây. Bạn muốn xem tiếp phần nào của chuyến đi?"
      : "Mình đang xem Bắc đảo và Dương Đông cho nhà mình.",
  };
};

const cases = [
  { engine: "chromium", browser: chromium, width: 320, height: 700 },
  { engine: "webkit", browser: webkit, width: 390, height: 844 },
];
mkdirSync("qa-output", { recursive: true });
const results = [];
try {
  await ready();
  for (const item of cases) {
    let browser;
    try {
      browser = await item.browser.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: item.width, height: item.height },
        deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce",
      });
      const errors = [];
      const requests = { parse: 0, plan: 0, voice: 0, deleted: 0 };
      page.on("pageerror", e => errors.push(String(e)));
      await page.route("**/api/trip/turn", async route => {
        requests.parse++;
        const body = route.request().postDataJSON();
        const parsed = parseResponse(body.text);
        const ack = parsed.conversationAction === "acknowledgement";
        const dated = Boolean(body.checkin && body.checkout);
        if (dated) {
          parsed.parsed.checkin = body.checkin;
          parsed.parsed.checkout = body.checkout;
          parsed.nextNeeded = [];
          parsed.assistantText = "Mình đã lưu ngày đi của bạn.";
        }
        if (!ack) requests.plan++;
        await new Promise(resolve => setTimeout(resolve, 450));
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            ...parsed, action: dated ? "set_dates" : ack ? "acknowledgement" : "request",
            tripId: "qa-trip-1", clientTurnId: body.clientTurnId,
            version: requests.parse, plan: ack ? null : plan, advisor: null,
          }),
        });
      });
      await page.route("**/api/trip/session", async route => {
        if (route.request().method() === "DELETE") {
          requests.deleted++;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: true }) });
        } else {
          await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "trip_session_not_found" }) });
        }
      });
      await page.route("**/api/trip/build", async route => {
        requests.plan++;
        await new Promise(resolve => setTimeout(resolve, 450));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plan) });
      });
      await page.route("**/api/voice", async route => {
        requests.voice++;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "natural_tts_unavailable" }) });
      });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator(".conversation-hero--fresh .assistant-bubble").waitFor();
      assert.equal(await page.locator(".assistant-bubble").count(), 1);
      assert.equal(await page.locator(".living-story").count(), 3);
      assert.equal(await page.getByRole("button", { name: "Giọng nói tắt" }).count(), 0);
      const viewportCheck = async () => {
        const data = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(data.scrollWidth <= data.width + 2, "horizontal overflow: " + JSON.stringify(data));
      };
      await viewportCheck();
      await page.screenshot({ path: `qa-output/${item.engine}-welcome.png`, animations: "disabled" });

      const input = page.locator('textarea[aria-label="Hỏi JoTrip"]');
      const sample = "3 ngày 2 đêm, nhà có bé, muốn đi VinWonders và Safari";
      await input.fill(sample);
      await page.screenshot({ path: `qa-output/${item.engine}-question.png`, animations: "disabled" });
      await page.locator("form.prompt button[type=submit]").click();
      await page.locator(".message--pending").waitFor({ timeout: 8000 });
      assert.equal(await page.locator(".mascot-shell").getAttribute("data-mascot-state"), "thinking");
      await page.screenshot({ path: `qa-output/${item.engine}-thinking.png`, animations: "disabled" });
      await page.locator(".message--pending").waitFor({ state: "detached", timeout: 8000 });
      assert.equal(await page.locator(".conversation-hero--active .assistant-bubble").count(), 0);
      assert.equal(await page.locator(".conversation-thread .message--assistant:not(.message--pending)").count(), 1);
      assert.equal(requests.plan, 1);
      await page.screenshot({ path: `qa-output/${item.engine}-advice.png`, animations: "disabled" });

      const activeInput = page.locator("form.prompt textarea");
      await activeInput.fill("a");
      await page.locator("form.prompt button[type=submit]").click();
      await page.locator(".conversation-thread .message--assistant:not(.message--pending)").nth(1).waitFor();
      assert.equal(requests.plan, 1, "acknowledgement unexpectedly rebuilt the plan");
      assert.equal(requests.parse, 2);
      assert.match(await page.locator(".conversation-thread .message--assistant:not(.message--pending)").nth(1).innerText(), /muốn xem tiếp phần nào/);
      assert.ok(Number.parseFloat(await activeInput.evaluate(el => getComputedStyle(el).fontSize)) >= 16);
      await page.locator(".trip-pulse-option").first().click();
      assert.equal(await page.locator(".composer-mascot").getAttribute("data-state"), "compare");
      await page.screenshot({ path: `qa-output/${item.engine}-compare.png`, animations: "disabled" });

      // V2 is text-first: a short follow-up must not call paid voice.
      await activeInput.fill("ok");
      await page.locator("form.prompt button[type=submit]").click();
      await page.locator(".conversation-thread .message--assistant:not(.message--pending)").nth(2).waitFor();
      assert.equal(requests.voice, 0);
      assert.equal(await page.getByRole("button", { name: "Giọng nói tắt" }).count(), 0);
      await viewportCheck();
      await page.screenshot({ path: `qa-output/${item.engine}-text-only.png`, animations: "disabled" });

      // Selecting dates must use the same saved trip turn, never the legacy builder.
      await page.locator(".trip-controls input[type=date]").first().fill("2030-01-10");
      await page.locator(".trip-controls input[type=date]").nth(1).fill("2030-01-12");
      await page.getByRole("button", { name: "Tính theo ngày này" }).click();
      await page.locator(".conversation-thread .message--assistant:not(.message--pending)").nth(3).waitFor();
      assert.equal(requests.plan, 2, "date selection did not use the canonical turn");
      assert.equal(await page.locator(".trip-controls input[type=date]").first().inputValue(), "2030-01-10");
      assert.equal(await page.locator(".trip-controls input[type=date]").nth(1).inputValue(), "2030-01-12");
      await viewportCheck();
      await page.screenshot({ path: `qa-output/${item.engine}-saved-dates.png`, animations: "disabled" });

      await page.getByRole("button", { name: "Xóa lịch sử" }).click();
      await page.getByRole("button", { name: "Xóa chuyến này" }).click();
      await page.locator(".living-story").first().waitFor();
      assert.equal(requests.deleted, 1);
      assert.equal(await page.locator(".conversation-thread").count(), 0);
      await viewportCheck();

      // V2 discovery is a real conversational entry, not a decorative card.
      const parseBeforeStory = requests.parse;
      const planBeforeStory = requests.plan;
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator(".living-story").first().waitFor();
      assert.equal(await page.locator(".living-story").count(), 3);
      await page.locator(".living-story").nth(1).click();
      await page.locator(".trip-pulse-option").first().waitFor({ timeout: 8000 });
      assert.equal(requests.parse, parseBeforeStory + 1);
      assert.equal(requests.plan, planBeforeStory + 1);
      assert.equal(await page.locator(".trip-pulse-option").count(), 2);
      await page.locator(".trip-pulse-option").first().click();
      assert.equal(await page.locator(".trip-pulse-option").first().getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".trip-pulse-detail").count(), 1);
      assert.equal(requests.voice, 0);
      await viewportCheck();
      await page.screenshot({ path: `qa-output/${item.engine}-living-canvas.png`, animations: "disabled" });
      assert.deepEqual(errors, []);
      results.push({ engine: item.engine, width: item.width, height: item.height, result: "PASS", requests });
      console.log("PASS " + item.engine + " " + item.width + "x" + item.height + " seven mobile states + saved dates and deletion");
    } catch (error) {
      results.push({ engine: item.engine, width: item.width, height: item.height, result: "FAIL", error: String(error) });
      console.error("FAIL " + item.engine + ": " + error);
    } finally {
      await browser?.close();
    }
  }
} finally {
  server.kill();
}
writeFileSync("qa-output/chat-continuity-result.json", JSON.stringify(results, null, 2));
if (results.some(x => x.result !== "PASS")) process.exitCode = 1;
