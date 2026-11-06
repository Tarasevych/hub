// Visuele controle donkere mailweergave (28.10.2026, agent 3; herbruikbaar voor agent 4 — zie docs/ontwerp/MAIL-DONKER.md).
// Rendert elke brief uit tests/hulp/mails/ in een echte Chrome (zelfde sandbox-iframe als de app, geen scripts, geen netwerk)
// op 390/768/1440 px, licht en donker; maakt schermafdrukken, meet WCAG-contrast en vergelijkt de opmaak (vakken) licht ↔ donker,
// en vergelijkt met een basislijn (pixelverschil).
//
// Gebruik:
//   node scripts/visueel-mail.mjs                       meten + vergelijken met de basislijn
//   node scripts/visueel-mail.mjs --bijwerken           basislijn (opnieuw) vastleggen
//   opties: --breedtes 390,768,1440  --themas licht,donker  --filter 05-knop  --uit /workspace/audit-ruimtes
//           --basislijn <map> (standaard <uit>/mail-basislijn)  --drempel 0.5 (% afwijkende pixels)  --json <bestand>
// Exitcode 0 = alles goed; 1 = contrast-, opmaak-, snelheids- of beeldverschil.
// Alleen lokaal: elk verzoek buiten data:/blob:/about: wordt geblokkeerd (nooit *.tarasevych.com of de buitenwereld).
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// PLAYWRIGHT_CORE = map van playwright-core (zoals de andere browserscripts, bv. scripts/werkblad-plekken-stand.mjs); zonder die
// variabele het oude vaste pad van de ontwikkelmachine.
const PW = join(process.env.PLAYWRIGHT_CORE || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core', 'index.mjs');
const CHROME = process.env.CHROME_PAD || '/usr/bin/google-chrome';
const MAILS = 'tests/hulp/mails';

function opties(argv) {
  const o = { breedtes: [390, 768, 1440], themas: ['licht', 'donker'], filter: '', uit: '/workspace/audit-ruimtes', basislijn: '', drempel: 0.5, bijwerken: false, json: '', schermafdrukken: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--breedtes') o.breedtes = v().split(',').map(Number);
    else if (a === '--themas') o.themas = v().split(',');
    else if (a === '--filter') o.filter = v();
    else if (a === '--uit') o.uit = v();
    else if (a === '--basislijn') o.basislijn = v();
    else if (a === '--drempel') o.drempel = Number(v());
    else if (a === '--json') o.json = v();
    else if (a === '--bijwerken') o.bijwerken = true;
    else if (a === '--zonder-afdrukken') o.schermafdrukken = false;
  }
  o.basislijn ||= join(o.uit, 'mail-basislijn');
  return o;
}

export async function bouwProefbank() {
  await mkdir('rapporten', { recursive: true });
  const uit = resolve('rapporten/mail-proefbank.js');
  await build({ entryPoints: ['src/mail-donker/proefbank.ts'], bundle: true, format: 'iife', outfile: uit, loader: { '.css': 'empty' }, logLevel: 'warning' });
  return uit;
}

/** Hoofdroutine; geeft { fouten, resultaten, snelheid } terug (ook gebruikt door tests/eenheid/mail-donker-browser.test.ts). */
export async function meet(o = opties([])) {
  const { chromium } = await import(pathToFileURL(PW).href);
  const bank = await bouwProefbank();
  const namen = (await readdir(MAILS)).filter((n) => n.endsWith('.html') && n.includes(o.filter)).sort();
  await mkdir(o.uit, { recursive: true }); await mkdir(o.basislijn, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const fouten = [], resultaten = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route('**/*', (r) => (/^(data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort()));
    await page.setContent('<!doctype html><html><body style="margin:0;background:#1e2026"><div id="k"></div></body></html>');
    await page.addScriptTag({ path: bank });
    for (const naam of namen) {
      const html = await readFile(join(MAILS, naam), 'utf8');
      for (const breedte of o.breedtes) {
        await page.setViewportSize({ width: breedte, height: 900 });
        const meting = await page.evaluate(async ({ html, themas }) => {
          const k = document.getElementById('k'); k.innerHTML = '';
          const laad = (src, donker) => new Promise((ok) => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin'); f.style.cssText = `display:block;width:100%;border:0;background:${donker ? 'transparent' : '#fff'};color-scheme:${donker ? 'dark' : 'light'}`; f.onload = () => { f.style.height = f.contentDocument.documentElement.scrollHeight + 'px'; ok(f); }; f.srcdoc = src; k.append(f); });
          const pb = window.mailProefbank, uit = {};
          const licht = await laad(pb.licht(html), false); uit.vakkenLicht = pb.vakken(licht.contentDocument); uit.contrastLicht = pb.meetContrast(licht.contentDocument);
          let donker = null;
          if (themas.includes('donker')) { donker = await laad(pb.donker(html), true); pb.volgLogos(donker.contentDocument); uit.vakkenDonker = pb.vakken(donker.contentDocument); uit.contrastDonker = pb.meetContrast(donker.contentDocument); }
          if (!themas.includes('licht')) licht.remove();
          return uit;
        }, { html, themas: o.themas });
        const id = `${naam.replace(/\.html$/, '')}-${breedte}`;
        if (meting.vakkenDonker) {
          const zelfde = JSON.stringify(meting.vakkenLicht) === JSON.stringify(meting.vakkenDonker);
          if (!zelfde) fouten.push(`${id}: opmaak verschilt tussen licht en donker`);
          const slecht = meting.contrastDonker.filter((c) => !c.beeld && c.ratio + 0.01 < c.doel);
          for (const c of slecht) fouten.push(`${id}: contrast ${c.ratio} < ${c.doel} «${c.tekst}» (${c.kleur} op ${c.achter})`);
          resultaten.push({ id, opmaakGelijk: zelfde, teksten: meting.contrastDonker.length, laagste: Math.min(...meting.contrastDonker.map((c) => c.ratio)) });
        }
        if (o.schermafdrukken) {
          const frames = await page.$$('#k iframe');
          for (const [i, thema] of o.themas.entries()) {
            const f = frames[i]; if (!f) continue;
            const bestand = join(o.uit, `mail-${id}-${thema}.png`), basis = join(o.basislijn, `mail-${id}-${thema}.png`);
            const buf = await f.screenshot({ path: bestand });
            if (o.bijwerken) { await writeFile(basis, buf); continue; }
            let bestaat = true; try { await access(basis); } catch { bestaat = false; }
            if (!bestaat) { fouten.push(`${id}-${thema}: geen basislijn (draai met --bijwerken)`); continue; }
            const verschil = await vergelijk(page, buf, await readFile(basis));
            if (verschil > o.drempel) fouten.push(`${id}-${thema}: ${verschil.toFixed(2)} % pixels anders dan de basislijn`);
          }
        }
      }
    }
    // snelheid: ±1 MB nieuwsbrief, alleen de omzetting (maakMailDonker) en de hele voorbereiding
    const groot = (await readFile(join(MAILS, '01-nieuwsbrief-tabellen.html'), 'utf8'));
    const binnen = groot.slice(groot.indexOf('<table'), groot.lastIndexOf('</table>') + 8);
    const snelheid = await page.evaluate((binnen) => {
      let s = ''; while (s.length < 1_000_000) s += binnen;
      const html = `<html><body bgcolor="#ffffff">${s}</body></html>`, pb = window.mailProefbank;
      const doc = new DOMParser().parseFromString(html, 'text/html'), v = pb.maakMailDonker(doc, { oppervlak: '#1e2026' });
      const t0 = performance.now(); pb.donker(html); const geheel = performance.now() - t0;
      return { grootte: html.length, omzetting: v.ms, geheel, achtergronden: v.achtergronden };
    }, binnen);
    if (snelheid.omzetting > 300) fouten.push(`snelheid: omzetting van ${(snelheid.grootte / 1e6).toFixed(2)} MB duurde ${snelheid.omzetting.toFixed(0)} ms (> 300 ms)`);
    const verslag = { fouten, resultaten, snelheid };
    if (o.json) await writeFile(o.json, JSON.stringify(verslag, null, 2));
    return verslag;
  } finally { await browser.close(); }
}

/** Percentage afwijkende pixels tussen twee PNG's (in de browser via canvas; andere maat = 100 %). */
async function vergelijk(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const lees = async (s) => { const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: img.width, h: img.height, d: x.getImageData(0, 0, img.width, img.height).data }; };
    const p = await lees(a), q = await lees(b);
    if (p.w !== q.w || p.h !== q.h) return 100;
    let n = 0; for (let i = 0; i < p.d.length; i += 4) if (Math.abs(p.d[i] - q.d[i]) + Math.abs(p.d[i + 1] - q.d[i + 1]) + Math.abs(p.d[i + 2] - q.d[i + 2]) > 30) n += 1;
    return (n / (p.w * p.h)) * 100;
  }, [a.toString('base64'), b.toString('base64')]);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const o = opties(process.argv.slice(2));
  const v = await meet(o);
  for (const r of v.resultaten) console.log(`${r.opmaakGelijk ? 'OK  ' : 'FOUT'} ${r.id}: ${r.teksten} teksten, laagste contrast ${r.laagste}`);
  console.log(`snelheid: ${(v.snelheid.grootte / 1e6).toFixed(2)} MB → omzetting ${v.snelheid.omzetting.toFixed(0)} ms, hele voorbereiding ${v.snelheid.geheel.toFixed(0)} ms`);
  for (const f of v.fouten) console.log('FOUT ' + f);
  console.log(v.fouten.length ? `\n${v.fouten.length} fouten` : '\nalles goed');
  process.exit(v.fouten.length ? 1 : 0);
}
