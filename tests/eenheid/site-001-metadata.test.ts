// SITE-001 (пункти 6–9): заголовки вкладок, прев'ю для соцмереж, значки сайту, sitemap.xml і robots.txt.
// nl: paginatitels, voorbeeldafbeelding voor sociale netwerken, sitepictogrammen, sitemap.xml en robots.txt.
import { readFile } from 'node:fs/promises';
import { inflateSync, crc32 } from 'node:zlib';
import { checker } from './hulp/nep-google';

/** Повна перевірка PNG: підпис, CRC кожного блоку, розпакування IDAT і точний обсяг рядків. Повертає розмір або null. */
function pngGeldig(b: Buffer): { w: number; h: number } | null {
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let i = 8, w = 0, h = 0, kleurtype = 0, diepte = 8, einde = false; const idat: Buffer[] = [];
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i), soort = b.toString('latin1', i + 4, i + 8);
    if (i + 12 + len > b.length) return null;
    const data = b.subarray(i + 8, i + 8 + len);
    if (crc32(b.subarray(i + 4, i + 8 + len)) !== b.readUInt32BE(i + 8 + len)) return null;
    if (soort === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); diepte = data[8]; kleurtype = data[9]; }
    if (soort === 'IDAT') idat.push(data);
    if (soort === 'IEND') { einde = true; break; }
    i += 12 + len;
  }
  if (!einde || !w || !h || !idat.length) return null;
  const kanalen = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[kleurtype] || 0;
  try {
    const ruw = inflateSync(Buffer.concat(idat));
    return ruw.length === h * (1 + Math.ceil((w * kanalen * diepte) / 8)) ? { w, h } : null;
  } catch { return null; }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-metadata');
  const html = await readFile('index.html', 'utf8');
  const jur = await readFile('backend/juridisch.ts', 'utf8');

  // Пункт 6: заголовки вкладок однакові за будовою «<розділ> — Мій простір» / «<onderdeel> — Mijn Ruimte».
  const uk = [...html.matchAll(/([a-z]+):\['([^']+) — ([^']+)','([^']+)'\]/g)];
  // Мову визначає блок мапи: спершу uk:{…}, потім nl:{…} (назва «GitHub» однакова в обох мовах).
  const nlStart = html.indexOf('},nl:{');
  const ukTitels = uk.filter((m) => (m.index ?? 0) < nlStart);
  const nlTitels = uk.filter((m) => (m.index ?? 0) > nlStart);
  check('Oekraïense titels eindigen op «— Мій простір»', ukTitels.length >= 9 && ukTitels.every((m) => m[3] === 'Мій простір'), ukTitels.filter((m) => m[3] !== 'Мій простір').map((m) => m[1]).join(','));
  check('Nederlandse titels eindigen op «— Mijn Ruimte»', nlTitels.length >= 9 && nlTitels.every((m) => m[3] === 'Mijn Ruimte'), nlTitels.filter((m) => m[3] !== 'Mijn Ruimte').map((m) => m[1]).join(','));
  check('geen titel «— Tarasevych» of «Tarasevych-beheer» meer', !html.includes("— Tarasevych'") && !html.includes('Tarasevych-beheer'));
  check('beschrijvingen 20–160 tekens', uk.every((m) => m[4].length >= 20 && m[4].length <= 160));
  // Екран входу на id.tarasevych.com/ (без відомого сеансу) — «Вхід», а не «Налаштування».
  check('aanmeldscherm: «Вхід — Мій простір» / «Aanmelden — Mijn Ruimte» zonder bekende sessie',
    html.includes("route.service==='identity'&&session!=='known'") && html.includes("'Вхід — Мій простір'") && html.includes("'Aanmelden — Mijn Ruimte'"));
  const gast = await readFile('src/GastToegang.tsx', 'utf8');
  check('gasttoegang: «Гостьовий доступ — Мій простір»', gast.includes("'Гостьовий доступ — Мій простір'") && gast.includes("'Gasttoegang — Mijn Ruimte'"));

  // Пункт 7: прев'ю для соцмереж.
  for (const [naam, bron] of [['index.html', html], ['juridische pagina\'s', jur]] as const) {
    check(`${naam}: og:image 1200×630 met alt-tekst en twitter:card`, bron.includes('property="og:image" content="https://hub.tarasevych.com/og-afbeelding.png"')
      && bron.includes('og:image:width" content="1200"') && bron.includes('og:image:height" content="630"') && bron.includes('og:image:alt') && bron.includes('name="twitter:card" content="summary_large_image"'));
  }
  const og = pngGeldig(await readFile('public/og-afbeelding.png'));
  check('og-afbeelding.png is een geldige PNG van 1200×630', og?.w === 1200 && og?.h === 630);
  check('og-afbeelding.png kleiner dan 300 kB', (await readFile('public/og-afbeelding.png')).length < 300_000);

  // Пункт 8: значки (на робочому сайті favicon-192/512 були пошкоджені).
  for (const [f, n] of [['favicon-16.png', 16], ['favicon-32.png', 32], ['favicon-192.png', 192], ['favicon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    const r = pngGeldig(await readFile(`public/${f}`));
    check(`${f}: geldige PNG ${n}×${n}`, r?.w === n && r?.h === n);
  }
  const ico = await readFile('public/favicon.ico');
  check('favicon.ico: ICO met 16, 32 en 48 px', ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3 && [0, 1, 2].map((k) => ico[6 + k * 16] || 256).sort((a, b) => a - b).join(',') === '16,32,48');
  const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8')) as { icons: Array<{ src: string; purpose: string }> };
  check('manifest: iconen voor «any» én «maskable»', manifest.icons.some((i) => i.purpose === 'any') && manifest.icons.some((i) => i.purpose === 'maskable'));
  check('index.html verwijst naar favicon.ico', html.includes('href="./favicon.ico"'));

  // Пункт 9: sitemap.xml і robots.txt.
  const sitemap = await readFile('public/sitemap.xml', 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check('sitemap.xml bevat alleen /privacy en /terms', sitemap.startsWith('<?xml') && sitemap.includes('http://www.sitemaps.org/schemas/sitemap/0.9') && locs.join(' ') === 'https://hub.tarasevych.com/privacy https://hub.tarasevych.com/terms');
  const robots = await readFile('public/robots.txt', 'utf8');
  check('robots.txt: Sitemap-regel, privé-rest blijft Disallow', /^Sitemap: https:\/\/hub\.tarasevych\.com\/sitemap\.xml$/m.test(robots) && /^Disallow: \/$/m.test(robots) && /^Allow: \/og-afbeelding\.png\$$/m.test(robots));
  const verboden = new RegExp('[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]');
  check('geen verboden letters in robots.txt, sitemap.xml en titels', !verboden.test(robots) && !verboden.test(sitemap) && !verboden.test(ukTitels.map((m) => m[0]).join('')));
  return einde();
}
