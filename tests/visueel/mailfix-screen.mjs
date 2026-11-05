// MAILFIX-001: echte Chromium-asserties. Een PNG-bestand op zichzelf is GEEN bewijs
// dat React überhaupt heeft gerenderd; de eerste CI leverde lege beelden op.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('uitvoer', { recursive: true });
const browser = await chromium.launch({ headless: true });
const problemen = [];

try {
  for (const [breedte, hoogte] of [[320, 640], [390, 844], [1280, 800]]) {
    const page = await browser.newPage({ viewport: { width: breedte, height: hoogte }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => problemen.push(`${breedte}: ${error.stack || error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') problemen.push(`${breedte} console: ${message.text()}`); });
    await page.goto('http://127.0.0.1:4179/tests/visueel/mailfix-preview.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1600);
    const geometrie = await page.evaluate(() => {
      const root = document.getElementById('root');
      const wrapper = document.querySelector('.mail-functional');
      const orbit = document.querySelector('[data-mail-accounts-empty="true"]');
      const boven = document.querySelector('.mail-functional > .is2');
      const intro = document.querySelector('.mail-orbit-intro');
      const rect = (el) => el?.getBoundingClientRect();
      return {
        rootHtmlLength: root?.innerHTML.length || 0,
        functional: Boolean(wrapper),
        orbit: Boolean(orbit),
        topStripDisplay: boven ? getComputedStyle(boven).display : 'absent',
        introWidth: Math.round(rect(intro)?.width || 0),
        parentWidth: Math.round(rect(wrapper)?.width || 0),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        title: document.title,
      };
    });
    await page.screenshot({ path: `uitvoer/mailfix-full-${breedte}.png`, fullPage: true });
    console.log(`MAILFIX_SCREEN_${breedte}: ${JSON.stringify(geometrie)}`);
    if (geometrie.rootHtmlLength < 500 || !geometrie.functional || !geometrie.orbit)
      problemen.push(`${breedte}: React missing or empty; full-page proof is invalid`);
    if (geometrie.topStripDisplay !== 'none')
      problemen.push(`${breedte}: duplicate integrations strip still visible (${geometrie.topStripDisplay})`);
    if (breedte <= 620 && geometrie.introWidth < breedte * 0.85)
      problemen.push(`${breedte}: intro remains too narrow (${geometrie.introWidth}px)`);
    if (geometrie.scrollWidth > breedte + 2)
      problemen.push(`${breedte}: horizontal viewport overflow (${geometrie.scrollWidth}px)`);
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync('uitvoer/mailfix-browser-errors.log', problemen.length ? problemen.join('\n\n') + '\n' : 'Geen browserfouten; alle afmetingen en zichtbaarheid gecontroleerd.\n');
}
if (problemen.length) {
  for (const p of problemen) console.error('MAILFIX_VISUAL_FAIL:', p);
  process.exitCode = 1;
}
