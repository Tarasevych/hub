// Реальні компоненти з вигаданими даними: перевірка адаптивності, тем і дій.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const url = 'http://127.0.0.1:4179/tests/visueel/design-002-ruimtes.html';
const delen = [
  { naam: 'agenda', selector: '.agv-leeg', knop: '[data-agenda-v3-koppelen]', actie: 'agenda' },
  { naam: 'mail-accounts', selector: '.mail-orbit-intro', knop: '.mail-orbit-mobiel-hoofdknop:visible, [data-mail-orbit-knop="gmail"]:visible, .mail-orbit-desktop-hoofdknop:visible', actie: 'gmail' },
  { naam: 'mail-inbox', selector: '.mail-orbit-intro', knop: '.mail-orbit-mobiel-hoofdknop:visible, [data-mail-orbit-knop="gmail"]:visible, .mail-orbit-desktop-hoofdknop:visible', actie: 'gmail' },
  { naam: 'cloud', selector: '.cvn-leeg', knop: '.cvn-leeg button.is-hoofd', actie: 'files' },
  { naam: 'notities', selector: '.vn-kaart', knop: '.vn-kaart-klik', actie: 'notitie' },
  { naam: 'zoek', selector: '.zk-kaart' },
  { naam: 'instellingen', selector: '.settings-card', knop: '.settings-card:not(:disabled)', actie: 'menu' },
];
const situaties = [
  { naam: 'smal-licht', breedte: 320, hoogte: 640, thema: 'light' },
  { naam: 'telefoon-donker', breedte: 390, hoogte: 844, thema: 'dark' },
  { naam: 'computer-licht', breedte: 1280, hoogte: 800, thema: 'light' },
  { naam: 'computer-donker', breedte: 1280, hoogte: 800, thema: 'dark' },
];
await mkdir('uitvoer/design-002', { recursive: true });
try {
  for (const deel of delen) {
    for (const g of situaties) {
      const pagina = await browser.newPage({ viewport: { width: g.breedte, height: g.hoogte }, reducedMotion: 'reduce' });
      const fouten = [];
      pagina.on('pageerror', error => fouten.push(error.message));
      try {
        await pagina.goto(url + '?deel=' + deel.naam + '&thema=' + g.thema, { waitUntil: 'networkidle' });
        await pagina.locator(deel.selector).first().waitFor();
        const stand = await pagina.evaluate((selector) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          return {
            breedte: document.documentElement.clientWidth,
            scrollbreedte: document.documentElement.scrollWidth,
            x: box.left, rechts: box.right, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
            animatie: getComputedStyle(element).animationName,
            lettertype: selector === '.zk-kaart' ? getComputedStyle(element.querySelector('h3')).fontFamily : null,
            omgevingLettertype: selector === '.zk-kaart' ? getComputedStyle(element).fontFamily : null,
          };
        }, deel.selector);
        await pagina.screenshot({ path: 'uitvoer/design-002/' + deel.naam + '-' + g.naam + '.png', fullPage: true });
        if (fouten.length || stand.radius < 10 || stand.scrollbreedte > stand.breedte + 1 || stand.x < -1 || stand.rechts > stand.breedte + 1 || (stand.lettertype && stand.lettertype !== stand.omgevingLettertype)) {
          throw new Error(JSON.stringify({ stand, fouten }));
        }
        if (deel.knop) {
          await pagina.locator(deel.knop).first().click();
          const actie = await pagina.locator('[data-test-actie]').innerText();
          if (actie.trim() !== deel.actie) throw new Error('Кнопка: очікувано ' + deel.actie + ', отримано ' + actie);
        }
        console.log('OK ' + deel.naam + ' ' + g.naam + ': ' + JSON.stringify(stand));
      } catch (error) {
        await pagina.screenshot({ path: 'uitvoer/design-002/' + deel.naam + '-' + g.naam + '-fout.png', fullPage: true }).catch(() => {});
        console.error('Діагностика:', JSON.stringify({ fouten, body: (await pagina.locator('body').innerText().catch(() => '')).slice(0, 1000) }));
        throw error;
      } finally {
        await pagina.close();
      }
    }
  }
  // Додатково: нідерландська, сливова тема та системний високий контраст.
  for (const thema of ['plum-light', 'plum-dark']) {
    const pagina = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', forcedColors: 'active' });
    await pagina.goto(url + '?deel=agenda&lang=nl&thema=' + thema, { waitUntil: 'networkidle' });
    const paneel = pagina.locator('.agv-leeg');
    await paneel.waitFor();
    const stand = await paneel.evaluate(el => ({ radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), border: getComputedStyle(el).borderTopStyle, text: el.textContent }));
    if (stand.radius < 10 || stand.border === 'none' || !stand.text.includes('Koppel')) throw new Error('Контраст / мова: ' + JSON.stringify(stand));
    await pagina.screenshot({ path: 'uitvoer/design-002/agenda-' + thema + '-contrast.png', fullPage: true });
    await pagina.close();
    console.log('OK agenda ' + thema + ' hoog contrast');
  }
} finally {
  await browser.close();
}
