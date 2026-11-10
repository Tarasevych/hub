// MAILSCAN-002 · Повна сторінка, межі налаштувань і справжнє полотно на вузькому екрані.
// Самого знімка екрана недостатньо: перевіряємо елементи, геометрію та перемикачі.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('uitvoer', { recursive: true });
const fouten = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const [breedte, hoogte] of [[320, 640], [390, 844], [740, 960], [1280, 800]]) {
    const pagina = await browser.newPage({ viewport: { width: breedte, height: hoogte }, deviceScaleFactor: 1, hasTouch: true, isMobile: breedte < 500 });
    pagina.on('pageerror', (e) => fouten.push(`${breedte}: ${e.message}`));
    pagina.on('console', (m) => { if (m.type() === 'error') fouten.push(`${breedte}: ${m.text()}`); });
    await pagina.goto('http://127.0.0.1:4179/tests/visueel/mailfix-voorbeeld.html', { waitUntil: 'networkidle' });
    await pagina.waitForTimeout(1300);

    const begin = await pagina.evaluate(() => {
      const doek = document.querySelector('.mail-achtergrond-doek');
      const k = doek?.getContext('2d');
      const gegevens = k && doek.width > 0 && doek.height > 0 ? k.getImageData(0, 0, doek.width, doek.height).data : null;
      let zichtbarePixels = 0;
      if (gegevens) for (let i = 3; i < gegevens.length; i += 4) if (gegevens[i] > 0) zichtbarePixels++;
      return { doekBreed: doek?.width || 0, doekHoog: doek?.height || 0, zichtbarePixels,
        breedte: document.documentElement.scrollWidth, venster: innerWidth,
        onderdelen: document.querySelectorAll('[data-mail-achtergrond="accounts"]').length };
    });
    if (!begin.onderdelen || begin.zichtbarePixels < 100 || begin.doekBreed < 100 || begin.doekHoog < 100)
      fouten.push(`${breedte}: живе полотно не відмальоване: ${JSON.stringify(begin)}`);
    if (begin.breedte > begin.venster + 2)
      fouten.push(`${breedte}: сторінка виходить за ширину вікна: ${JSON.stringify(begin)}`);

    const knop = pagina.getByRole('button', { name: 'Налаштувати тло' }).first();
    await knop.click();
    const paneel = pagina.locator('.mail-achtergrond-instellingen-portaal');
    await paneel.waitFor({ state: 'visible' });
    const grenzen = await paneel.boundingBox();
    if (!grenzen || grenzen.x < -1 || grenzen.x + grenzen.width > breedte + 1 || grenzen.y < -1 || grenzen.y + grenzen.height > hoogte + 2)
      fouten.push(`${breedte}: обрізане вікно налаштувань: ${JSON.stringify(grenzen)}`);

    await paneel.getByRole('button', { name: 'Малювання пальцем' }).click();
    const tekenen = await pagina.locator('[data-mail-achtergrond="accounts"]').first().getAttribute('data-tekenen');
    if (tekenen !== 'ja') fouten.push(`${breedte}: не вмикається малювання пальцем`);
    await paneel.getByRole('button', { name: 'Закрити налаштування' }).click();
    await pagina.screenshot({ path: `uitvoer/mailscan-002-${breedte}.png`, fullPage: true });
    console.log(`MAILSCAN-002 ${breedte}: ${JSON.stringify({ ...begin, grenzen, tekenen })}`);
    await pagina.close();
  }
} finally {
  await browser.close();
  writeFileSync('uitvoer/mailscan-002-schermfouten.txt', fouten.length ? fouten.join('\n') + '\n' : 'Усі перевірки геометрії, полотна та налаштувань пройдено.\n');
}

if (fouten.length) {
  for (const fout of fouten) console.error('MAILSCAN-002:', fout);
  process.exitCode = 1;
}
