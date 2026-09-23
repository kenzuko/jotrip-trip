import { chromium, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.JOTRIP_QA_URL || 'https://jotrip-trip.kenzuko.workers.dev';
const out = 'qa-output';
mkdirSync(out, { recursive: true });
const cases = [
  { browser: chromium, name: 'chromium', width: 320, height: 700 },
  { browser: chromium, name: 'chromium', width: 390, height: 844 },
  { browser: chromium, name: 'chromium', width: 430, height: 932 },
  { browser: webkit, name: 'webkit', width: 375, height: 667 },
  { browser: webkit, name: 'webkit', width: 390, height: 844 },
];
const results = [];
let failures = 0;
for (const item of cases) {
  const id = item.name + '-' + item.width + 'x' + item.height;
  let browser;
  try {
    browser = await item.browser.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const issues = [];
    page.on('pageerror', error => issues.push(error.message));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!response?.ok()) throw Error('Homepage HTTP ' + (response?.status() ?? 'no response'));
    await page.locator('.conversation-hero--fresh .mascot-frame--state').waitFor({ timeout: 16000 });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.mascot-state-greeting .mascot-frame--state').evaluate(
      async img => { if (!img.complete) await img.decode(); }
    );
    // iPhone 320 px can race the responsive <picture> decode even after the mascot loads.
    // Wait for the official logo's actual resource before checking currentSrc/naturalWidth.
    await page.locator('.brand img').evaluate(async img => {
      if (!img.complete) await img.decode();
      if (!img.naturalWidth) throw new Error('Official logo failed to decode');
    });
    let initial = await page.evaluate(() => {
      const image = document.querySelector('.conversation-hero--fresh .mascot-frame--state');
      const logo = document.querySelector('.brand img');
      const scene = document.querySelector('.warm-island-scene');
      const prompt = document.querySelector('.conversation-hero--fresh .prompt');
      const suggestions = document.querySelector('.conversation-hero--fresh .example-chips');
      const bubble = document.querySelector('.conversation-hero--fresh .assistant-bubble');
      const visible = element => { const r = element?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; };
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        state: document.querySelector('.mascot-shell')?.dataset.mascotState,
        mascotSrc: image?.currentSrc,
        mascotWidth: image?.naturalWidth,
        mascotHeight: image?.naturalHeight,
        logoSrc: logo?.currentSrc,
        logoWidth: logo?.naturalWidth,
        logoHeight: logo?.naturalHeight,
        background: scene && getComputedStyle(scene).backgroundImage,
        promptVisible: visible(prompt),
        suggestionsVisible: visible(suggestions),
        speechBubbleVisible: visible(bubble),
        promptTop: Math.round(prompt?.getBoundingClientRect().top ?? -1),
        bubbleBottom: Math.round(bubble?.getBoundingClientRect().bottom ?? -1),
      };
    });
    if (initial.scrollWidth > initial.width + 2) issues.push('Horizontal overflow: ' + initial.scrollWidth);
    if (initial.state !== 'greeting') issues.push('Wrong initial mascot state: ' + initial.state);
    if (initial.mascotWidth !== 720 || initial.mascotHeight !== 900) issues.push('Mascot not HD: ' + initial.mascotWidth + 'x' + initial.mascotHeight);
    if (!initial.mascotSrc?.includes('01_greeting_wave_hd.webp')) issues.push('Old greeting asset still used');
    if (!initial.logoSrc?.includes('approved-jo-trip-intro.png') || !initial.logoWidth) issues.push('Approved logo not shown');
    if (!initial.background?.includes('warm-island-scene.svg')) issues.push('Warm Island background missing');
    if (!initial.promptVisible || !initial.suggestionsVisible || !initial.speechBubbleVisible) issues.push('Welcome control hidden');
    if (initial.promptTop < initial.bubbleBottom - 5) issues.push('Prompt overlaps speech bubble');
    await page.screenshot({ path: join(out, id + '-welcome.png'), fullPage: true, animations: 'disabled' });
    await page.locator('textarea[aria-label="Hỏi JoTrip"]').focus();
    await page.waitForTimeout(180);
    let focus = await page.evaluate(() => {
      const image = document.querySelector('.mascot-frame--state');
      return {
        state: document.querySelector('.mascot-shell')?.dataset.mascotState,
        mascotSrc: image?.currentSrc,
        mascotWidth: image?.naturalWidth,
        mascotHeight: image?.naturalHeight,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    if (focus.state !== 'listening') issues.push('Focus state did not switch: ' + focus.state);
    if (!focus.mascotSrc?.includes('02_listening_hd.webp')) issues.push('Listening asset not HD');
    if (focus.mascotWidth !== 720 || focus.mascotHeight !== 900) {
      await page.locator('.mascot-state-listening .mascot-frame--state').evaluate(
        async img => { if (!img.complete) await img.decode(); }
      );
      focus = await page.evaluate(() => {
        const image = document.querySelector('.mascot-frame--state');
        return { state: document.querySelector('.mascot-shell')?.dataset.mascotState, mascotSrc: image?.currentSrc, mascotWidth: image?.naturalWidth, mascotHeight: image?.naturalHeight, scrollWidth: document.documentElement.scrollWidth };
      });
      if (focus.mascotWidth !== 720 || focus.mascotHeight !== 900) issues.push('Listening image is low-res');
    }
    if (focus.scrollWidth > initial.width + 2) issues.push('Horizontal overflow on focus');
    await page.screenshot({ path: join(out, id + '-listening.png'), fullPage: true, animations: 'disabled' });
    const verdict = issues.length ? 'FAIL' : 'PASS';
    results.push({ id, verdict, issues, initial, focus });
    console.log(verdict + ' ' + id + ' ' + JSON.stringify({ image: initial.mascotWidth + 'x' + initial.mascotHeight, state: focus.state, overflow: initial.scrollWidth - initial.width, issues }));
    if (issues.length) failures++;
  } catch (error) {
    failures++;
    results.push({ id, verdict: 'ERROR', message: String(error) });
    console.error('ERROR ' + id + ' ' + String(error));
  } finally {
    await browser?.close();
  }
}
writeFileSync(join(out, 'results.json'), JSON.stringify({ url, results, failures }, null, 2));
console.log('Live iPhone QA: ' + (cases.length - failures) + '/' + cases.length + ' passed.');
if (failures) process.exitCode = 1;
