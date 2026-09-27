import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["worker/advisor.ts"], bundle: true, format: "esm",
  platform: "browser", target: "es2022", write: false,
});
const advisor = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

test("weather answers disclose that Trip has no live forecast instead of inventing one", async () => {
  const result = await advisor.answerAdvisor({}, {
    rawText: "Thời tiết Phú Quốc chiều nay thế nào?",
    language: "vi",
    mode: "weather",
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "weather");
  assert.match(result.answerText, /chưa có dữ liệu dự báo thời tiết trực tiếp/i);
});
