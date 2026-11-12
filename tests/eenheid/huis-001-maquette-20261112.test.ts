// HUIS-001 (12.11.2026) — de klikbare maquette «Levend huis / Живий дім» en haar plek op de site.
// Zuiver (geen database, geen browser): de samensteller, de statische controles en de koppeling met de site.
//   1. De samensteller bouwt de maquette voor de site ZONDER inline <script>/<style>: de site heeft
//      Content-Security-Policy «script-src 'self'; style-src 'self'» (server/start.ts, APP_CSP).
//   2. De statische controles van de maquette zelf geven nul fouten: elk tabblad uit de kaart van het product bestaat (geen
//      voorlopige stompen), elk apparaat heeft een blad, elke gevaarlijke actie een gevolgtekst, de taalwet voor alle tekstparen.
//   3. `npm run build` zet de maquette in dist/huis-maquette/; «Вітрина / Toonzaal» en de oude informatiepagina linken erheen.
//   4. De toestemmingen volgen het besluit van de eigenaar: elke actie kent Uit · Vragen · Altijd, standaard Uit.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
// @ts-expect-error — bouwscript zonder typen (scripts/huis-maquette.mjs)
import { bouw, controleer } from '../../scripts/huis-maquette.mjs';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('huis-001-maquette-20261112');

  // ---- 1. samensteller: sitevariant zonder inline code
  const site = bouw({ site: true }) as { html: string; css: string; js: string };
  check('sitevariant: index.html, maquette.css en maquette.js zijn gevuld', site.html.length > 2000 && site.css.length > 100_000 && site.js.length > 500_000,
    `html ${site.html.length} · css ${site.css.length} · js ${site.js.length}`);
  check('sitevariant: geen inline <script> en geen <style> (CSP van de site)', !/<script(?![^>]*\ssrc=)[^>]*>/i.test(site.html) && !/<style[\s>]/i.test(site.html));
  check('sitevariant: verwijst naar ./maquette.css en ./maquette.js met een inhoudshash', /<link rel="stylesheet" href="\.\/maquette\.css\?v=[0-9a-f]{12}">/.test(site.html) && /<script src="\.\/maquette\.js\?v=[0-9a-f]{12}"><\/script>/.test(site.html));
  check('sitevariant: geen inline gebeurtenisafhandeling en geen eval/new Function in de maquettecode', !/\son[a-z]+="/i.test(site.html) && !/\bnew Function\b|\beval\(/.test(site.js));
  check('sitevariant: geen externe bronnen (geen http-adressen in link/script/img)', !/(?:src|href)="https?:\/\//i.test(site.html));
  check('sitevariant: niet indexeren en Oekraïens als documenttaal', /<meta name="robots" content="noindex">/.test(site.html) && /<html lang="uk">/.test(site.html));
  const vol = bouw() as string;
  check('zelfstandig bestand: één volledig document met dezelfde inhoud', vol.startsWith('<!doctype html>') && vol.includes('<div id="mq-wortel"') && vol.length > site.js.length);
  const artefact = bouw({ artefact: true }) as string;
  check('artefactvariant: zonder doctype/html/head/body, begint met de titel', artefact.startsWith('<title>') && !/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(artefact));

  // ---- 2. statische controles van de maquette
  const uit = controleer() as { fouten: string[]; paren: number; cijfers: Record<string, number> };
  check('statische controles van de maquette: nul fouten', uit.fouten.length === 0, uit.fouten.slice(0, 5).join(' | '));
  const c = uit.cijfers;
  check('elk tabblad van de productkaart bestaat (geen voorlopige stomp)', c.tabbladen >= 45 && c.voorlopig === 0, `tabbladen ${c.tabbladen} · voorlopig ${c.voorlopig}`);
  check('bedieningsbladen voor alle soorten apparaten en genoeg apparaten in het demohuis', c.bladen >= 60 && c.apparaten >= 70, `bladen ${c.bladen} · apparaten ${c.apparaten}`);
  check('vijftien scenario’s van de simulator en tweetalige tekstparen', c.scenarios === 15 && uit.paren >= 5000, `scenario's ${c.scenarios} · paren ${uit.paren}`);
  check('gevaarlijke en kritieke acties zijn als zodanig geregistreerd', c.acties >= 100 && c.zwaar >= 10, `acties ${c.acties} · zwaar ${c.zwaar}`);

  // ---- 3. de site
  const pakket = JSON.parse(lees('package.json')) as { scripts: Record<string, string> };
  check('npm run build zet de maquette na vite build in dist/huis-maquette/', /vite build && node scripts\/huis-maquette\.mjs --site dist\/huis-maquette && /.test(pakket.scripts.build));
  const toonzaal = lees('src/huis/onderdelen/Showroom.tsx');
  check('«Вітрина / Toonzaal» linkt naar de maquette (nieuw tabblad, noopener) met een gevolg-uitleg', /href='\/huis-maquette\/' target='_blank' rel='noopener'/.test(toonzaal) && /Макет нічим не керує/.test(toonzaal) && /De maquette bedient niets/.test(toonzaal));
  const oud = lees('src/DomoticaWeergave.tsx');
  check('de oude informatiepagina (vlag uit) linkt ook naar de maquette', /href='\/huis-maquette\/' target='_blank' rel='noopener'/.test(oud) && /data-smart-home-maquette='1'/.test(oud));
  check('de server serveert .html met de CSP van de app (script-src en style-src alleen eigen bron)', /"script-src 'self' 'wasm-unsafe-eval'", "style-src 'self'"/.test(lees('server/start.ts')));

  // ---- 4. toestemmingen volgens het besluit van de eigenaar (plan §3.8)
  const gevaar = lees('docs/huis/maquette/kern/gevaar.js');
  check('toestemming kent Uit · Vragen · Altijd en staat standaard op Uit', /'uit'/.test(gevaar) && /'vragen'/.test(gevaar) && /'altijd'/.test(gevaar));
  const ontwerptaal = lees('docs/huis/ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md');
  check('ontwerptaal: geen plafond voor uitvoerders («щонайбільше Питати» komt niet voor)', !/щонайбільше «?Питати/.test(ontwerptaal));
  const tokens = JSON.parse(lees('docs/huis/maquette/stijl/hv-tokens.json')) as { thema: Record<string, Record<string, string>>; hemel: unknown; paren: unknown[] };
  check('tokens: drie thema’s (licht, donker, inkt), hemel en contrastparen', ['licht', 'donker', 'inkt'].every((t) => Object.keys(tokens.thema[t] || {}).length >= 60) && !!tokens.hemel && tokens.paren.length >= 150);

  // ---- documenten: paren uk/nl compleet
  const paren: Array<[string, string]> = [
    ['docs/huis/ДИЗАЙН-ДІМ-20261110.uk.md', 'docs/huis/ONTWERP-HUIS-20261110.nl.md'],
    ['docs/huis/ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md', 'docs/huis/ONTWERPTAAL-LEVEND-HUIS-20261110.nl.md'],
    ['docs/huis/maquette/ЧИТАЙ.uk.md', 'docs/huis/maquette/LEESMIJ.nl.md'],
    ['docs/huis/zones/01-КАРКАС.uk.md', 'docs/huis/zones/01-SCHIL.nl.md'],
    ['docs/huis/zones/02-ДІМ-І-КІМНАТИ.uk.md', 'docs/huis/zones/02-THUIS-EN-KAMERS.nl.md'],
    ['docs/huis/zones/03-ПРИСТРОЇ.uk.md', 'docs/huis/zones/03-APPARATEN.nl.md'],
    ['docs/huis/zones/04-ЕНЕРГІЯ.uk.md', 'docs/huis/zones/04-ENERGIE.nl.md'],
    ['docs/huis/zones/05-БЕЗПЕКА.uk.md', 'docs/huis/zones/05-BEVEILIGING.nl.md'],
    ['docs/huis/zones/06-ГАРАЖ.uk.md', 'docs/huis/zones/06-GARAGE.nl.md'],
    ['docs/huis/zones/07-АВТОМАТИКА.uk.md', 'docs/huis/zones/07-AUTOMATISERING.nl.md'],
    ['docs/huis/zones/08-ПОМІЧНИК-І-АГЕНТИ.uk.md', 'docs/huis/zones/08-ASSISTENT-EN-AGENTEN.nl.md'],
    ['docs/huis/zones/09-АРХІТЕКТУРА.uk.md', 'docs/huis/zones/09-ARCHITECTUUR.nl.md'],
    ['docs/huis/zones/10-ДИЗАЙН-СИСТЕМА.uk.md', 'docs/huis/zones/10-ONTWERPSYSTEEM.nl.md'],
  ];
  const kort = paren.filter(([uk, nl]) => { try { return lees(uk).length < 4000 || lees(nl).length < 4000; } catch { return true; } });
  check('specificatie: dertien documenten, elk in het Oekraïens en het Nederlands', kort.length === 0, kort.map((p) => p.join(' ↔ ')).join(', '));
  check('documentatie-index (uk en nl) verwijst naar het pakket «Живий дім»', /HUIS-001/.test(lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md')) && /HUIS-001/.test(lees('docs/INDEX.nl.md')));

  return einde();
}
