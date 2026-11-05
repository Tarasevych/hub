// Візуальна перевірка використовує лише локальну сторінку з вигаданими даними.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const url = 'http://127.0.0.1:4179/tests/visueel/design-001-voorbeeld.html';
const gevallen = [
  { naam: 'telefoon-licht', breedte: 390, hoogte: 844, donker: false },
  { naam: 'telefoon-donker', breedte: 390, hoogte: 844, donker: true },
  { naam: 'smal-licht', breedte: 320, hoogte: 640, donker: false },
  { naam: 'computer-licht', breedte: 1280, hoogte: 800, donker: false },
  { naam: 'computer-donker', breedte: 1280, hoogte: 800, donker: true },
];
await mkdir('uitvoer/design-001', { recursive: true });
try {
  for (const g of gevallen) {
    const pagina = await browser.newPage({ viewport: { width: g.breedte, height: g.hoogte }, reducedMotion: 'reduce' });
    const fouten = [];
    pagina.on('pageerror', (error) => fouten.push(error.message));
    await pagina.goto(url + (g.donker ? '?donker=1' : ''), { waitUntil: 'networkidle' });
    await pagina.locator('.wb-begroeting').waitFor();
    const stand = await pagina.evaluate(() => {
      const begroeting = document.querySelector('.wb-begroeting');
      const kaart = document.querySelector('.wb-tegel.is-kaart');
      const leeg = document.querySelector('.product-empty-icon');
      return {
        breedte: document.documentElement.clientWidth,
        scrollbreedte: document.documentElement.scrollWidth,
        begroeting: Boolean(begroeting && begroeting.getBoundingClientRect().width > 0),
        radius: kaart ? parseFloat(getComputedStyle(kaart).borderTopLeftRadius) : 0,
        leegRadius: leeg ? parseFloat(getComputedStyle(leeg).borderTopLeftRadius) : 0,
        animatie: begroeting ? getComputedStyle(begroeting).animationName : '',
      };
    });
    await pagina.screenshot({ path: `uitvoer/design-001/${g.naam}.png`, fullPage: true });
    if (fouten.length || !stand.begroeting || stand.radius <= 0 || stand.leegRadius <= 0 || stand.animatie !== 'none' || stand.scrollbreedte > stand.breedte + 1) {
      throw new Error(`${g.naam}: ${JSON.stringify({ stand, fouten })}`);
    }
    console.log(`OK ${g.naam}: ${JSON.stringify(stand)}`);
    await pagina.close();
  }
} finally {
  await browser.close();
}
