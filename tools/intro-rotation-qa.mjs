import { chromium, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.JOTRIP_QA_URL || 'http://127.0.0.1:4173';
const ids = ['warm','future','editorial'];
const assetNames = {
  warm: 'warm-island-scene.svg',
  future: 'intro-ai-horizon.svg',
  editorial: 'intro-editorial-coast.svg',
};
const out = 'qa-intro-rotation';
mkdirSync(out, { recursive: true });
const reports = [];
let failed = 0;

async function validateScene(browser, browserName, width, height, scene) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const name = browserName + '-' + width + '-' + scene;
  const errors = [];
  page.on('pageerror', e => errors.push('JavaScript: ' + e.message));
  try {
    const response = await page.goto(base + '/?intro=' + scene, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!response?.ok()) throw Error('Homepage HTTP ' + (response?.status() ?? 'unknown'));
    await page.locator('.conversation-hero--fresh .mascot-frame--state').waitFor({timeout:16000});
    await page.locator('.mascot-frame--state').evaluate(async img => { if (!img.complete) await img.decode(); });
    await page.locator('.brand img').evaluate(async img => { if (!img.complete) await img.decode(); });
    const before = await page.evaluate(() => {
      const root = document.querySelector('.app');
      const mascot = document.querySelector('.mascot-frame--state');
      const logo = document.querySelector('.brand img');
      const scenery = document.querySelector('.warm-island-scene');
      const bubble = document.querySelector('.assistant-bubble');
      const prompt = document.querySelector('.prompt');
      const r = el => el?.getBoundingClientRect();
      return {
        scene: root?.getAttribute('data-intro-scene'),
        title: document.querySelector('.hero-copy h1')?.textContent,
        mascot: mascot?.currentSrc,
        mascotSize: [mascot?.naturalWidth, mascot?.naturalHeight],
        logo: logo?.currentSrc,
        logoSize: [logo?.naturalWidth, logo?.naturalHeight],
        background: scenery && getComputedStyle(scenery).backgroundImage,
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bubbleBottom: r(bubble)?.bottom,
        promptTop: r(prompt)?.top,
        suggestions: document.querySelectorAll('.example-chips button').length,
      };
    });
    if (before.scene !== scene) errors.push('Wrong scene ' + before.scene);
    if (!before.background?.includes(assetNames[scene])) errors.push('Scene asset missing');
    if (!before.title?.includes('Tri thức Phú Quốc')) errors.push('Headline changed');
    if (!before.logo?.includes('approved-jo-trip-intro.png') || before.logoSize[0] < 100) errors.push('Official logo missing');
    if (!before.mascot?.includes('01_greeting_wave_hd.webp') || before.mascotSize.join('x') !== '720x900') errors.push('Canonical greeting mascot not HD');
    if (before.scrollWidth > width+2) errors.push('Horizontal overflow '+before.scrollWidth);
    if (before.bubbleBottom > before.promptTop + 5) errors.push('Bubble overlaps prompt');
    if (before.suggestions !== 3) errors.push('Suggestion structure changed');
    await page.screenshot({ path: join(out,name+'.png'), fullPage:true, animations:'disabled' });
    await page.locator('textarea[aria-label="Hỏi JoTrip"]').focus();
    await page.locator('.mascot-state-listening .mascot-frame--state').waitFor({timeout:10000});
    await page.locator('.mascot-state-listening .mascot-frame--state').evaluate(async img => { if (!img.complete) await img.decode(); });
    const after = await page.evaluate(() => ({
      scene: document.querySelector('.app')?.getAttribute('data-intro-scene'),
      state: document.querySelector('.mascot-shell')?.getAttribute('data-mascot-state'),
      mascot: document.querySelector('.mascot-frame--state')?.currentSrc,
      size: [document.querySelector('.mascot-frame--state')?.naturalWidth,document.querySelector('.mascot-frame--state')?.naturalHeight],
    }));
    if (after.scene !== scene) errors.push('Scene changed when focusing');
    if (after.state !== 'listening' || !after.mascot?.includes('02_listening_hd.webp') || after.size.join('x') !== '720x900') errors.push('Locked listening mascot mismatch');
    reports.push({ name, status: errors.length?'FAIL':'PASS', errors, before, after });
    if (errors.length) failed++;
    console.log((errors.length?'FAIL ':'PASS ')+name+' '+JSON.stringify(errors));
  } catch(e) {
    failed++;
    reports.push({name,status:'ERROR',error:String(e),errors});
    console.error('ERROR '+name+' '+String(e));
  } finally { await context.close(); }
}

for (const [engine, browserName, width, height] of [
  [webkit,'webkit',390,844], [chromium,'chromium',320,700]
]) {
  const browser = await engine.launch({headless:true});
  try {
    for (const scene of ids) await validateScene(browser,browserName,width,height,scene);

    const context = await browser.newContext({viewport:{width,height},isMobile:true});
    const sequence = [];
    for (let i=0;i<4;i++) {
      const page = await context.newPage();
      await page.goto(base+'/',{waitUntil:'domcontentloaded'});
      await page.locator('.conversation-hero--fresh').waitFor();
      const scene = await page.locator('.app').getAttribute('data-intro-scene');
      sequence.push(scene);
      if (i===0) {
        await page.reload({waitUntil:'domcontentloaded'});
        const again = await page.locator('.app').getAttribute('data-intro-scene');
        if (again !== scene) { failed++; console.error('Refresh rotated an active session'); }
      }
      await page.close();
    }
    if (sequence.join(',') !== 'warm,future,editorial,warm') {
      failed++; console.error('Rotation order incorrect: '+sequence);
    } else console.log('PASS '+browserName+' session rotation: '+sequence.join(' → '));
    reports.push({name:browserName+'-visit-rotation',sequence});
    await context.close();
  } finally { await browser.close(); }
}
writeFileSync(join(out,'results.json'),JSON.stringify({base,failed,reports},null,2));
console.log('Intro rotation QA: '+(failed?'FAIL':'PASS')+'; '+(6-failed)+'/6 scene layouts, both browsers with visit rotation.');
if(failed) process.exitCode=1;
