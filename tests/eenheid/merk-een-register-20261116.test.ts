// REESTR-LOGO-001 (16.11.2026) — сторож правила «усі логотипи лише з одного реєстру» (AGENTS.md, розділ «Логотипи»).
// Bewaker van de regel «elk logo komt uit het ene merkregister (src/merk)»:
//   1. geen kopie van een merkvorm (pad uit src/merk/officieel/*.svg of src/merk/merk-tabel.ts) buiten src/merk en de toegestane,
//      gegenereerde bestanden; geen eigen *Logo-component met getekende paden;
//   2. «Макет» tekent zijn merktekens uit het register (data-merk-officieel / data-merk-vorm, inhoud gelijk aan het bestand);
//   3. de grote tabel draagt geen merk dat een officieel bestand heeft; merk-officieel neemt Google/Telegram uit shared/merk-direct;
//   4. de vlaggen gaan één keer mee (geen index.js-bundels van country-flag-icons);
//   5. de laag van de gebruiker: gaat vóór alles, alleen voor dit account (scope), wissen = systeemlogo terug;
//   6. AGENTS.md beschrijft de regel; de serverpagina van Telegram gebruikt het register.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { OFFICIEEL_SLEUTELS } from '../../src/merk/officieel-sleutels';
import { LOGOS } from '../../src/merk/merk-logos';
import { MERK_DIRECT } from '../../shared/merk-direct';
import {
  gebruikerMerk, gebruikerMerkScope, laadGebruikerMerken, merkLaag, merkLaagZonderGebruiker, registreerGebruikerMerken,
} from '../../src/merk/merk-register';
import Merk from '../../src/merk/Merk';
import { widgetPagina } from '../../backend/telegram-aanmelden/routes';

/** Bestanden die een merkvorm MOGEN dragen: het register zelf, wat de generator schrijft en wat zijn eigen bewaker heeft. */
const TOEGESTAAN = [
  /^src\/merk\//,
  /^shared\/merk-direct\.ts$/, // gegenereerd door scripts/merk-officieel-maken.mjs
  /^src\/identiteit\/maquette\/maquette-motor\.ts$/, // gegenereerd door bouw.mjs; inhoud hieronder tegen het register gecontroleerd
];
const MAPPEN = ['src', 'shared', 'backend', 'server', 'public'];
const lopen = (d: string, uit: string[] = []): string[] => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (/node_modules|(^|\/)dist(\/|$)/.test(p)) continue;
    if (statSync(p).isDirectory()) lopen(p, uit); else if (/\.(ts|tsx|css|html|mjs|js|svg)$/.test(p)) uit.push(p);
  }
  return uit;
};

export async function main() {
  const { check, einde } = checker('merk-een-register-20261116');

  // ------------------------------------------------------------ 1. Geen kopieën van merkvormen
  const officieelDir = 'src/merk/officieel';
  const officieel = readdirSync(officieelDir).filter((f) => f.endsWith('.svg'));
  const paden = new Map<string, string>();
  for (const f of officieel) for (const m of readFileSync(join(officieelDir, f), 'utf8').matchAll(/\sd="([^"]{40,})"/g)) paden.set(m[1].slice(0, 40), `officieel/${f}`);
  const tabel = readFileSync('src/merk/merk-tabel.ts', 'utf8');
  // Alleen merken: "icoon-…" zijn gewone pictogrammen (lucide), die mogen ook elders staan.
  for (const m of tabel.matchAll(/"([a-z0-9-]+)":\s*\{[^}]*?\bd: "([^"]{40,})"/g)) if (!m[1].startsWith('icoon-')) paden.set(m[2].slice(0, 40), `merk-tabel:${m[1]}`);
  // De grote tabel van de koppelingen (src/merk/merk-logos.ts, simple-icons) hoort ook bij het register.
  for (const [k, [d]] of Object.entries(LOGOS)) if (d.length >= 40) paden.set(d.slice(0, 40), `merk-logos:${k}`);
  const kopieen: string[] = [];
  for (const f of MAPPEN.flatMap((d) => lopen(d))) {
    if (TOEGESTAAN.some((r) => r.test(f))) continue;
    const s = readFileSync(f, 'utf8');
    for (const [p, waar] of paden) if (s.includes(p)) { kopieen.push(`${f} ← ${waar}`); break; }
  }
  check(`1: жодної копії форми логотипа поза src/merk (перевірено ${paden.size} форм)`, paden.size > 100 && kopieen.length === 0, kopieen.join('; '));

  const logoComponenten = lopen('src').filter((f) => /Logo\.tsx$/.test(f) && !f.startsWith('src/merk/'));
  const getekend = logoComponenten.filter((f) => /<path\s/.test(readFileSync(f, 'utf8')));
  check('1: жоден компонент *Logo поза src/merk не малює власних контурів (TelegramLogo, AgentLogo — лише через реєстр)',
    logoComponenten.length >= 2 && getekend.length === 0
    && readFileSync('src/telegram-aanmelden/TelegramLogo.tsx', 'utf8').includes("merk='telegram'"), getekend.join(', '));

  // ------------------------------------------------------------ 2. «Макет»
  const motor = readFileSync('src/identiteit/maquette/maquette-motor.ts', 'utf8');
  const symbolen = [...motor.matchAll(/<svg class="brand-symbol brand-([a-z]+)"([^>]*)>([\s\S]*?)<\/svg>/g)];
  const fout2: string[] = [];
  for (const [, naam, attrs, binnen] of symbolen) {
    const off = /data-merk-officieel="([a-z]+)"/.exec(attrs)?.[1];
    const vorm = /data-merk-vorm="([a-z]+)"/.exec(attrs)?.[1];
    if (off) {
      const bestand = readFileSync(join(officieelDir, `${off}.svg`), 'utf8');
      const d = [...binnen.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
      if (!d.length || !d.every((x) => bestand.includes(x))) fout2.push(`${naam}: inhoud ≠ officieel/${off}.svg`);
    } else if (vorm) {
      const d = /\sd="([^"]+)"/.exec(binnen)?.[1] || '';
      if (!d || !tabel.includes(d)) fout2.push(`${naam}: vorm ≠ merk-tabel:${vorm}`);
    } else fout2.push(`${naam}: geen herkomst`);
  }
  check('2: усі знаки брендів у «Макеті» взято з реєстру (data-merk-officieel / data-merk-vorm, контури збігаються з файлом)',
    symbolen.length >= 6 && fout2.length === 0, fout2.join('; '));

  // ------------------------------------------------------------ 3. Eén plaats per merk
  const dubbel = Object.keys(LOGOS).filter((k) => OFFICIEEL_SLEUTELS.has(k));
  const mo = readFileSync('src/merk/merk-officieel.ts', 'utf8');
  check('3: велика таблиця не дублює бренди, що мають офіційний файл', dubbel.length === 0, dubbel.join(', '));
  check('3: Google і Telegram першого екрана — один файл shared/merk-direct.ts (браузер і сервер), без вбудованих копій',
    mo.includes('MERK_DIRECT["google"]') && mo.includes('MERK_DIRECT["telegram"]') && !/^\s*"(google|telegram)":\s*\{/m.test(mo)
    && Object.keys(MERK_DIRECT).sort().join() === 'google,telegram'
    && readFileSync('src/merk/google-g-officieel.ts', 'utf8').includes('MERK_DIRECT.google'));
  const herkomst = JSON.parse(readFileSync(join(officieelDir, 'HERKOMST.json'), 'utf8')) as Record<string, unknown>;
  const herkomstLijst = JSON.stringify(herkomst);
  check('3: кожен офіційний файл має походження й ліцензію в HERKOMST.json',
    officieel.every((f) => herkomstLijst.includes(f.replace(/\.svg$/, ''))) && /CC0/.test(herkomstLijst));

  // ------------------------------------------------------------ 4. Vlaggen
  const iconen = readFileSync('src/sessies/SessieIconen.tsx', 'utf8');
  check('4: прапори в збірці один раз — шаблон бере лише файли країн, не index.js/index.cjs.js/index.commonjs.js',
    iconen.includes("country-flag-icons/string/3x2/[A-Z]*.js") && !/3x2\/\*\.js/.test(iconen));

  // ------------------------------------------------------------ 5. Laag van de gebruiker
  const eigenSvg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#123456"/></svg>').toString('base64')}`;
  registreerGebruikerMerken([], '');
  const voor = merkLaag('telegram');
  registreerGebruikerMerken([{ sleutel: 'telegram', soort: 'svg', data: eigenSvg, hash: 'x' }, { sleutel: 'kwaad', soort: 'svg', data: 'javascript:alert(1)', hash: 'y' }], 'scope-a');
  const met = merkLaag('telegram'), zonder = merkLaagZonderGebruiker('telegram'), naZonder = merkLaag('telegram');
  check('5: власний логотип іде перед системним; «без власного» показує системний шар і нічого не псує; підробку data-URI відкинуто',
    voor !== 'gebruiker' && met === 'gebruiker' && zonder === voor && naZonder === 'gebruiker' && !gebruikerMerk('kwaad'));

  const html = renderToString(createElement(Merk, { merk: 'telegram', naam: 'Telegram', vorm: 'gliefje', maat: 24 } as never));
  const htmlZonder = renderToString(createElement(Merk, { merk: 'telegram', naam: 'Telegram', vorm: 'gliefje', maat: 24, zonderGebruiker: true } as never));
  check('5: <Merk> малює власний логотип користувача по всьому сайту, а з zonderGebruiker — системний (для порівняння)',
    html.includes('data-merk-laag="gebruiker"') && html.includes(eigenSvg.slice(0, 60)) && !htmlZonder.includes('data-merk-laag="gebruiker"'));

  let opgehaald = 0;
  await laadGebruikerMerken('scope-b', async () => { opgehaald++; return { merken: [] }; });
  const naWissel = gebruikerMerk('telegram');
  await laadGebruikerMerken('scope-b', async () => { opgehaald++; return { merken: [] }; });
  check('5: інший обліковий запис або простір (інший scope) — попередній список одразу зникає; той самий scope не тягне вдруге',
    naWissel === null && gebruikerMerkScope() === 'scope-b' && opgehaald === 1 && merkLaag('telegram') === voor);

  // ------------------------------------------------------------ 6. Regel en serverpagina
  const agents = readFileSync('AGENTS.md', 'utf8');
  check('6: правило записано в AGENTS.md (реєстр src/merk, генератор, без ручних копій, власний логотип користувача)',
    /REESTR-LOGO-001/.test(agents) && agents.includes('src/merk') && agents.includes('merk-officieel-maken.mjs') && agents.includes('merk-een-register-20261116'));
  const pagina = widgetPagina('testbot', 'v1', 'uk', 'https://example.invalid/');
  check('6: серверна сторінка входу через Telegram показує логотип із реєстру, а не намальований вручну',
    pagina.includes('data-merk-officieel="telegram"') && pagina.includes(encodeURIComponent(MERK_DIRECT.telegram.inhoud).slice(0, 80)) && !pagina.includes('#2AABEE'));

  return einde();
}
