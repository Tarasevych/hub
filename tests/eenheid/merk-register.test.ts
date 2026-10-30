// Het ENE merkregister (src/merk/): elk logo precies één keer, elk merk dat de code noemt bestaat, en <Merk> valt nooit om.
// Achtergrond: punt 9 van de eigenaar (19.10.2026) — dezelfde merken werden op vier plaatsen opnieuw getekend
// (src/agenten/logos.ts, src/sessies/merk-iconen.ts, het Logo-blok van src/mcp-ui.tsx en src/merk/merk-logos.ts).
// Deze test houdt die vier plaatsen dicht: komt er een kopie terug, dan valt ze hier door de mand.
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { LOGOS } from '../../src/merk/merk-logos';
import { MERKEN } from '../../src/merk/merk-tabel';
import { MERK_ALIAS, merkDef, merkSleutel, merkSleutels, monogram, registreerMerken } from '../../src/merk/merk-register';
import Merk from '../../src/merk/Merk';
import { checker } from './hulp/nep-google';

/** Padstructuur: elk commando heeft een veelvoud van zijn argumenten en de vlaggen van een boog zijn 0 of 1. */
const ARG: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
function padGeldig(d: string): boolean {
  const delen = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
  let cmd = '', args: number[] = [];
  const klaar = () => {
    const n = ARG[cmd.toLowerCase()];
    if (n === undefined) return false;
    if (n === 0) return args.length === 0;
    if (args.length === 0 || args.length % n !== 0) return false;
    if (cmd.toLowerCase() === 'a') for (let k = 0; k < args.length; k += 7) if (![0, 1].includes(args[k + 3]) || ![0, 1].includes(args[k + 4])) return false;
    return true;
  };
  for (const t of delen) { if (/[a-zA-Z]/.test(t)) { if (cmd && !klaar()) return false; cmd = t; args = []; } else args.push(Number(t)); }
  return klaar() && (delen[0] ?? '').toLowerCase() === 'm';
}

const padenVan = (slug: string): string[] => {
  const m = MERKEN[slug];
  return m.paden ? m.paden.map((p) => p.d) : m.d ? [m.d] : [];
};
/** Alle slugs die in de broncode als merk gebruikt worden (uit de bestanden zelf, niet uit een lijstje hier). */
const uitBron = (pad: string, re: RegExp): string[] => {
  const s = readFileSync(pad, 'utf8');
  return [...s.matchAll(re)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/['"]/g, ''))).filter(Boolean);
};

export async function main(): Promise<number> {
  const { check, einde } = checker('merk-register');
  const slugs = Object.keys(MERKEN);

  // ---------------------------------------------------------------- de tabel zelf
  check(`de tabel bestaat en is bevroren (${slugs.length} merken)`, slugs.length >= 40 && Object.isFrozen(MERKEN));
  check('slugs zijn kleine letters en lossen naar zichzelf op', slugs.every((s) => /^[a-z0-9.+-]+$/.test(s) && merkSleutel(s) === s),
    slugs.filter((s) => merkSleutel(s) !== s).join());

  // 1. Elk merk heeft een vorm; wat géén vorm heeft, moet een monogram opleveren (dat doet <Merk> en nooit een leeg vlak).
  // 21.10.2026: een merk ZONDER vorm met echte herkomst is een NEUTRALE PLAAT (geen pad, wel 1–2 letters + merkvlak) — de regel
  // van de eigenaar «не малювати й не вигадувати чужі логотипи кодом». Al het andere heeft een pad.
  const zonderVorm = slugs.filter((s) => padenVan(s).length === 0 && !(MERKEN[s].neutraal && /^.{1,2}$/u.test(String(MERKEN[s].letter || '')) && MERKEN[s].vlak));
  check('elk merk heeft een pad óf is een neutrale plaat (letters + vlak, zonder pad) — en nooit zowel d als paden', zonderVorm.length === 0 && slugs.every((s) => !(MERKEN[s].d && MERKEN[s].paden)) && slugs.every((s) => !(MERKEN[s].neutraal && (MERKEN[s].d || MERKEN[s].paden))), zonderVorm.join());
  check('elk merk heeft een naam en een hexkleur', slugs.every((s) => {
    const m = MERKEN[s];
    return m.naam.length > 1 && /^#[0-9A-Fa-f]{6}$/.test(m.kleur) && (!m.vlak || /^#[0-9A-Fa-f]{6}$/.test(m.vlak))
      && (!m.verloop || m.verloop.every((k) => /^#[0-9A-Fa-f]{6}$/.test(k))) && (m.paden ?? []).every((p) => !p.vul || /^#[0-9A-Fa-f]{6}$/.test(p.vul));
  }));
  check('elke naam zonder gliefje levert een monogram van 1-2 tekens', ['', 'x', 'Acme Corp', '???', 'Мій простір'].every((n) => /^.{1,2}$/u.test(monogram(n))));

  const alle = slugs.flatMap(padenVan);
  check(`alle ${alle.length} paden geldig (tekens, argumenttelling, boogvlaggen, doos 0 0 24 24)`,
    alle.every((d) => /^[Mm][0-9. ,\-a-zA-Z]+$/.test(d) && padGeldig(d)), alle.filter((d) => !padGeldig(d)).map((d) => d.slice(0, 40)).join(' | '));

  // 2. Geen duplicaten: niet binnen de tabel, en niet tussen de tabel en de grote merkentabel van de koppelingenpagina.
  const vingerafdruk = new Map<string, string[]>();
  for (const s of slugs) {
    if (MERKEN[s].neutraal) continue; // de neutrale plaat heeft bewust GEEN vorm (en is voor elk zulk merk dezelfde)
    const k = padenVan(s).join('|').replace(/\s+/g, ' ');
    vingerafdruk.set(k, [...(vingerafdruk.get(k) ?? []), s]);
  }
  const dubbel = [...vingerafdruk.values()].filter((v) => v.length > 1);
  check('geen twee merken met dezelfde vorm', dubbel.length === 0, dubbel.map((v) => v.join('=')).join(', '));
  const grootPaden = new Set(Object.values(LOGOS).map(([p]) => p.replace(/\s+/g, ' ')));
  const kruis = slugs.filter((s) => padenVan(s).some((d) => grootPaden.has(d.replace(/\s+/g, ' '))));
  check('geen pad staat zowel in het register als in de grote tabel', kruis.length === 0, kruis.join());
  const dubbeleSleutel = Object.keys(LOGOS).filter((k) => merkDef(k));
  check('geen merk staat twee keer (register ↔ grote tabel)', dubbeleSleutel.length === 0, dubbeleSleutel.join());

  // 3. Elke slug die de code gebruikt, bestaat.
  const ontbreekt = (lijst: readonly string[]) => lijst.filter((s) => !merkDef(s));
  const agents = V2_AGENTEN.map((a) => a.slug);
  check('elke connector-v2-agent heeft een logo', ontbreekt(agents).length === 0, ontbreekt(agents).join());
  const hub = [
    ...uitBron('src/mcp-ui.tsx', /const MERK_TEGEL = new Set<string>\(\[([^\]]*)\]/g),
    ...uitBron('src/mcp-ui.tsx', /const MERK_GLIEFJE = new Set<string>\(\[([^\]]*)\]/g),
  ];
  check(`elk merk van de hub-pictogrammen bestaat (${hub.length} uit src/mcp-ui.tsx)`, hub.length >= 20 && ontbreekt(hub).length === 0, ontbreekt(hub).join());
  const sessie = uitBron('src/sessies/SessieIconen.tsx', /return '([a-z0-9]+)'/g);
  check(`elk browser-/OS-merk van de sessiepagina bestaat (${sessie.length})`, sessie.length >= 14 && ontbreekt(sessie).length === 0, ontbreekt(sessie).join());
  const metSlug = INTEGRATIES.filter((i) => i.logo);
  const zonderEmbleem = metSlug.filter((i) => !LOGOS[i.logo] && !merkDef(i.logo));
  check(`elke koppeling met een merk heeft een embleem (${metSlug.length} merken)`, zonderEmbleem.length === 0, zonderEmbleem.map((i) => `${i.naam}(${i.logo})`).join(', '));

  // 4. Aliassen wijzen altijd naar een merk dat bestaat (anders verdwijnt een logo stil).
  const kapot = Object.entries(MERK_ALIAS).filter(([, doel]) => !MERKEN[doel]);
  check(`alle ${Object.keys(MERK_ALIAS).length} aliassen wijzen naar een bestaand merk`, kapot.length === 0, kapot.map(([a, d]) => `${a}→${d}`).join());
  check('alias lost op: openai/chatgpt→gpt, googlegemini→gemini, macos→apple, githubcopilot→copilot',
    merkSleutel('openai') === 'gpt' && merkSleutel('ChatGPT') === 'gpt' && merkSleutel('googlegemini') === 'gemini'
    && merkSleutel('macOS') === 'apple' && merkSleutel('githubcopilot') === 'copilot');
  check('rommel levert geen merk op', [null, undefined, '', '  ', '???', 'bestaat-echt-niet'].every((v) => merkDef(v) === null));

  // 5. Het register houdt de eerste (beste) vorm; een tweede aanmelding overschrijft niets.
  const voor = MERKEN.claude.d;
  registreerMerken({ claude: { naam: 'Nep', kleur: '#000000', d: 'M0 0h1v1H0z' }, nieuwmerk: { naam: 'Nieuw', kleur: '#123456', d: 'M2 2h4v4H2z' } });
  check('een tweede aanmelding overschrijft een bestaand merk niet, maar voegt wel toe',
    merkDef('claude')?.d === voor && merkDef('nieuwmerk')?.naam === 'Nieuw' && merkSleutels().includes('nieuwmerk'));

  // 6. <Merk> tekent, en valt niet om op een onbekend merk.
  const teken = (p: Record<string, unknown>) => renderToString(createElement(Merk, p as never));
  const tegel = teken({ merk: 'claude', maat: 40, titel: 'Claude' });
  check('<Merk> tekent een tegel met merkvlak, maat en tekstalternatief',
    tegel.includes('<svg') && tegel.includes('width="40"') && tegel.includes('aria-label="Claude"') && tegel.includes('role="img"') && tegel.includes('rx="6.5"'));
  check('<Merk> tekent rond, en zonder vlak als dat gevraagd wordt',
    teken({ merk: 'claude', maat: 24, vorm: 'rond' }).includes('rx="12"') && !teken({ merk: 'chrome', maat: 24, vorm: 'gliefje' }).includes('<rect'));
  check('<Merk> zonder titel is decoratief (aria-hidden, geen role)',
    teken({ merk: 'gpt', maat: 20 }).includes('aria-hidden="true"') && !teken({ merk: 'gpt', maat: 20 }).includes('role="img"'));
  check('<Merk> zonder maat zet geen breedte (dan bepaalt de CSS-klasse de maat)',
    !teken({ merk: 'chrome', vorm: 'gliefje', className: 'sessie-icoon' }).includes('width:') && teken({ merk: 'chrome', vorm: 'gliefje', className: 'sessie-icoon' }).includes('sessie-icoon'));
  // 21.10.2026: «volgt de tekstkleur» gaat sinds de contrastronde via de ene regel merkKleuren (per modus, spatie-schakelaar in
  // merk.css) in plaats van currentColor alleen voor een los gliefje — zie tests/eenheid/contrast-knoppen-logos-20261021.
  const appel = teken({ merk: 'apple', maat: 30, vorm: 'gliefje' });
  check('<Merk> maakt een verloop voor Gemini en volgt de tekstkleur voor een bijna zwart merk',
    teken({ merk: 'gemini', maat: 30 }).includes('linearGradient') && appel.includes('--merk-vul-d:var(--merk-in-donker) var(--text)') && appel.includes('var(--merk-vul-d, var(--merk-vul-l, #000000))'));
  for (const kapotte of [undefined, null, '', 'bestaat-niet', 42, {}, [], 'Acme Corporation']) {
    let uit = '';
    try { uit = teken({ merk: kapotte, naam: typeof kapotte === 'string' ? kapotte : undefined, maat: 32 }); } catch (e) { uit = `FOUT: ${String(e)}`; }
    check(`<Merk> valt niet om op ${JSON.stringify(kapotte)} en geeft een monogram`, uit.includes('merk-mono') && !uit.startsWith('FOUT'), uit.slice(0, 90));
  }
  check('<Merk> gebruikt een aangeleverde definitie zonder het register', teken({ def: { naam: 'Eigen', kleur: '#112233', d: 'M3 3h18v18H3z' }, maat: 20 }).includes('M3 3h18v18H3z'));
  check('<Merk> valt terug op wat de pagina meegeeft i.p.v. een monogram', teken({ merk: 'bestaat-niet', terugval: createElement('i', { className: 'leeg' }), maat: 16 }) === '<i class="leeg"></i>');

  // 7. De oude kopieën zijn weg en komen niet terug.
  const oud = ['src/agenten/logos.ts', 'src/sessies/merk-iconen.ts', 'public/agent-logos', 'scripts/agent-logos-maken.mjs'];
  check('de vier oude logokopieën bestaan niet meer', oud.every((p) => !existsSync(p)), oud.filter((p) => existsSync(p)).join());
  check('geen bron verwijst nog naar public/agent-logos', !['src/mcp-ui.tsx', 'src/merk/Merk.tsx', 'src/merk/merk-tabel.ts', 'src/agenten/AgentLogo.tsx', 'src/sessies/SessieIconen.tsx', 'src/merk/MerkLogo.tsx']
    .some((p) => readFileSync(p, 'utf8').includes('agent-logos')));
  check('de tabel blijft licht (< 40 kB) en geen merk groter dan 8 kB',
    readFileSync('src/merk/merk-tabel.ts').length < 40_000 && slugs.every((s) => padenVan(s).join('').length < 8000));
  check('het register zelf heeft geen padgegevens (mag dus in de hoofdbundel)', !/ d: "M/.test(readFileSync('src/merk/merk-register.ts', 'utf8')));
  check('de grote tabel wordt lui geladen (dynamic import, niet statisch)', (() => {
    const s = readFileSync('src/merk/MerkLogo.tsx', 'utf8');
    return s.includes("import('./merk-logos')") && !/^import .*'\.\/merk-logos'/m.test(s);
  })());
  check('de merkentabel wordt lui geladen (alleen via import() in het register)', (() => {
    const s = readFileSync('src/merk/merk-register.ts', 'utf8');
    return s.includes("import('./merk-tabel')") && !/^import .*merk-tabel/m.test(s);
  })());

  console.log(`  (${slugs.length} merken in het register, ${Object.keys(LOGOS).length} in de grote tabel, ${Object.keys(MERK_ALIAS).length} aliassen, 0 duplicaten)`);
  return einde();
}
