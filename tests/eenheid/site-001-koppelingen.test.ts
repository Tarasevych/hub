// SITE-001 (пункт 16): сторож битих посилань без мережі.
// 1) Спільні складники src/platform/** показуються на всіх службах (hub, id, mcp, api, …), тож відносні href="/…" у них
//    ведуть на різні служби й легко стають 404. Дозволено лише абсолютні адреси https://<служба>.tarasevych.com/….
// 2) Кожна адреса в public/sitemap.xml і рядок Sitemap у robots.txt вказують на наявну сторінку чи файл.
// 3) Файли, на які посилаються index.html і юридичні сторінки (значки, прев'ю, стилі), справді є в public/.
// 4) Відносні посилання юридичних сторінок ведуть лише на /, /privacy, /terms (+ #uk/#nl).
// nl: bewaking van kapotte koppelingen zonder netwerk.
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { PRIVACY_HTML, TERMS_HTML } from '../../backend/juridisch';

async function bestanden(map: string): Promise<string[]> {
  const uit: string[] = [];
  for (const e of await readdir(map, { withFileTypes: true })) {
    const p = join(map, e.name);
    if (e.isDirectory()) uit.push(...(await bestanden(p)));
    else if (/\.tsx?$/.test(e.name)) uit.push(p);
  }
  return uit;
}
const bestaat = (p: string) => access(p).then(() => true, () => false);

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-koppelingen');
  const root = process.cwd();
  try {
    const relatief: string[] = [];
    for (const f of await bestanden(join(root, 'src/platform'))) {
      const t = await readFile(f, 'utf8');
      for (const m of t.matchAll(/href=\{?['"`](\/[^'"`]*)['"`]/g)) relatief.push(`${f.slice(root.length + 1)}: ${m[1]}`);
    }
    check('src/platform: geen relatieve href="/…" (gedeelde onderdelen draaien op alle diensten)', relatief.length === 0, relatief.join('; '));
    const bev = await readFile(join(root, 'src/platform/bevestig-toegang.tsx'), 'utf8');
    check('bevestig-toegang: koppeling naar aanmeldmethoden is absoluut (id.tarasevych.com)', bev.includes("href='https://id.tarasevych.com/aanmeldmethoden'"));

    const sitemap = await readFile(join(root, 'public/sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const bekend = new Set(['https://hub.tarasevych.com/privacy', 'https://hub.tarasevych.com/terms']);
    check('sitemap.xml: elke <loc> is een bestaande publieke pagina', locs.length > 0 && locs.every((l) => bekend.has(l)), locs.join(', '));
    const robots = await readFile(join(root, 'public/robots.txt'), 'utf8');
    const sm = robots.match(/^Sitemap:\s*(\S+)/m)?.[1] || '';
    check('robots.txt: Sitemap-regel wijst naar het bestaande public/sitemap.xml', sm === 'https://hub.tarasevych.com/sitemap.xml', sm);

    const index = await readFile(join(root, 'index.html'), 'utf8');
    const statisch = new Set<string>();
    for (const bron of [index, PRIVACY_HTML, TERMS_HTML]) {
      for (const m of bron.matchAll(/(?:href|content|src)="(?:https:\/\/hub\.tarasevych\.com)?\/([a-z0-9\-_.]+\.(?:png|svg|ico|css|webmanifest|json|xml|txt))"/gi)) statisch.add(m[1]);
    }
    const ontbreekt: string[] = [];
    for (const s of statisch) if (!(await bestaat(join(root, 'public', s))) && !(await bestaat(join(root, s)))) ontbreekt.push(s);
    check('index.html + juridische pagina\'s: elk verwezen statisch bestand bestaat in public/', statisch.size >= 4 && ontbreekt.length === 0, `${statisch.size} bestanden; ontbreekt: ${ontbreekt.join(', ')}`);

    const jurRel = [...(PRIVACY_HTML + TERMS_HTML).matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => !/\.(png|svg|ico|css)$/.test(h));
    check('juridische pagina\'s: relatieve koppelingen alleen naar /, /privacy, /terms (+ #uk/#nl)', jurRel.length > 0 && jurRel.every((h) => /^\/(privacy|terms)?(#(uk|nl))?$/.test(h)), jurRel.join(', '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  }
  return einde();
}
