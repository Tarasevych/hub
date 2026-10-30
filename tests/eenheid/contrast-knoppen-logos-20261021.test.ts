// Eenheidstest 21.10.2026 — contrastronde «кнопки, логотипи, псевдо-логотипи, міні-палітри» (stand ВЕРСИЯ-ДО: 368 unieke
// contrastfouten).
//
// WAT ER MIS WAS (oorzaak):
//  1. Hoofdknoppen in het donker: WIT op het accent of op een statuskleur, terwijl het accent in een donker palet LICHT is —
//     «Дозволити» wit op #4ade80 = 1,74:1, «Підключити» (Пошта) wit op #82acff = 2,25:1, .settings-primary wit op #acacb4,
//     cloud «Звично» wit op #67e8f9 = 1,44:1, avatar-letters wit op #8d7535 = 4,44:1. De juiste tekst op het accent is
//     var(--text-on-accent) (= --accentText, per palet berekend en door scripts/kleur-contrast-controle.mjs voor alle 26 paletten
//     nagerekend), op een statusvlak var(--text-on-vlak).
//  2. Monochrome merken (GitHub, Anthropic, MCP, Apple, X …): zwart gliefje op het donkere grafietpaneel = 1,15–1,38:1.
//  3. Monogrammen «RA», «S2», «IS» (REST API, SCIM, IMAP/SMTP) en letter-«logo's» in «Секрети й ключі» (G, GH, HA, CF): geen
//     merk, of een merk dat wél een logo heeft.
//  4. Lokale mini-paletten (--aj-*, --ut-*, --hub-*, --ag-*, --v2-*, --eo-*, --vm-* …) met eigen hex per modus.
//
// Deze test REKENT: elke merkkleur × elk van de 26 paletten (tegel én los gliefje), monogram × 360 tinten × 26 paletten,
// avatarkleuren × 360 tinten, categorie-iconen × 26 paletten; en bewaakt de regels in de bron (geen wit op accent/status-vlak,
// geen hex in de mini-paletten, de ene merkregel in Merk.tsx/merk.css).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { DIENSTEN, type DienstId } from '../../shared/geheimen';
import { MERKEN } from '../../src/merk/merk-tabel';
import { LOGOS } from '../../src/merk/merk-logos';
import { DIENST_MERK } from '../../src/geheimen/logos';
import {
  MERK_GRENZEN, MERK_MIN, MERK_TINT, merkContrast, merkDef, merkKleuren, merkLuminantie, merkMeng, merkNeutraal, merkVolgt, type MerkDef,
} from '../../src/merk/merk-register';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const bestanden = (d: string, ext: string, uit: string[] = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) bestanden(p, ext, uit); else if (p.endsWith(ext)) uit.push(p.replace(/\\/g, '/')); } return uit.sort(); };
const hsl = (h: number, s: number, l: number) => { s /= 100; l /= 100; const k = (n: number) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`; };

type Palet = { naam: string; donker: boolean; w: Record<string, string> };

export async function main(): Promise<number> {
  const { check, einde } = checker('contrast-knoppen-logos-20261021');
  const { allePaletten, controleer } = await import('../../scripts/kleur-contrast-controle.mjs') as unknown as {
    allePaletten: () => Promise<{ vlakken: Palet[] }>; controleer: () => Promise<{ fouten: string[]; paren: unknown[]; vlakken: number }>;
  };
  const { vlakken } = await allePaletten();
  check(`26 paletten gevonden (grifel, violet, puur, 10 × kleur; licht + donker) — ${vlakken.length}`, vlakken.length === 26);
  const OPP = ['--bg', '--panel', '--surface', '--surface2'];

  // ------------------------------------------------------------------ 0. contrastcontrole van de tokens blijft groen
  const r = await controleer();
  check(`kleur-contrast-controle: 0 fouten (${r.paren.length} paren × ${r.vlakken} paletten), incl. accentText/accent in elk palet`, r.fouten.length === 0, r.fouten.slice(0, 4).join(' | '));
  const minAccent = Math.min(...vlakken.map((v) => merkContrast(v.w['--accentText'], v.w['--accent'])));
  check(`tekst-op-accent haalt in alle 26 paletten ≥ 4,5:1 (laagste ${minAccent.toFixed(2)})`, minAccent >= 4.5);
  const witOpAccentDonker = vlakken.filter((v) => v.donker && merkContrast('#ffffff', v.w['--accent']) < 4.5).length;
  check(`WIT op het accent faalt in ${witOpAccentDonker} van 13 donkere paletten — dáárom nergens #fff op het accent`, witOpAccentDonker >= 10);

  // ------------------------------------------------------------------ 1. de grenzen van het merkregister kloppen
  const ext = (donker: boolean, sleutels: string[]) => { const w = vlakken.filter((v) => v.donker === donker).flatMap((v) => sleutels.map((k) => v.w[k])); const s = [...w].sort((a, b) => merkLuminantie(a) - merkLuminantie(b)); return [s[0], s[s.length - 1]]; };
  const gelijk = (a: readonly string[], b: string[]) => a[0].toLowerCase() === b[0].toLowerCase() && a[1].toLowerCase() === b[1].toLowerCase();
  check('MERK_GRENZEN.licht = donkerste/lichtste paneel en oppervlak van de 13 lichte paletten', gelijk(MERK_GRENZEN.licht.panel, ext(false, ['--panel'])) && gelijk(MERK_GRENZEN.licht.vlak, ext(false, OPP)), `${ext(false, ['--panel'])} / ${ext(false, OPP)}`);
  check('MERK_GRENZEN.donker = donkerste/lichtste paneel en oppervlak van de 13 donkere paletten', gelijk(MERK_GRENZEN.donker.panel, ext(true, ['--panel'])) && gelijk(MERK_GRENZEN.donker.vlak, ext(true, OPP)), `${ext(true, ['--panel'])} / ${ext(true, OPP)}`);

  // ------------------------------------------------------------------ 2. elk merk × elk palet, tegel en los gliefje
  const alle: Array<[string, MerkDef]> = [...Object.entries(MERKEN)];
  for (const [slug, [d, hex]] of Object.entries(LOGOS)) if (!merkDef(slug)) alle.push([slug, { naam: slug, kleur: `#${hex}`, d }]);
  const mislukt: string[] = []; let gemeten = 0; const tekst = new Set<string>(), toon = new Set<string>(); let voorMin = 99, naMin = 99;
  for (const [slug, def] of alle) {
    if (def.verloop || def.lijn) continue;
    for (const vorm of ['tegel', 'gliefje'] as const) {
      const k = merkKleuren(def, vorm);
      for (const p of vlakken) {
        const keuze = p.donker ? k.donker : k.licht;
        if (keuze === 'var(--text)') tekst.add(slug); else if (keuze !== def.kleur) toon.add(slug);
        const vul = keuze === 'var(--text)' ? p.w['--text'] : keuze;
        const achter = vorm === 'tegel' ? (def.vlak ? [def.vlak] : [merkMeng(def.kleur, p.w['--panel'], MERK_TINT)]) : OPP.map((x) => p.w[x]);
        for (const a of achter) {
          gemeten++; const c = merkContrast(vul, a); naMin = Math.min(naMin, c); voorMin = Math.min(voorMin, merkContrast(def.kleur, a));
          if (c < MERK_MIN) mislukt.push(`${slug} ${vorm} ${p.naam}: ${c.toFixed(2)}`);
        }
      }
    }
  }
  check(`ELK merkgliefje ≥ 3:1 in ELK palet (${alle.length} merken × 26 paletten × tegel/gliefje = ${gemeten} metingen; laagste vóór ${voorMin.toFixed(2)}, na ${naMin.toFixed(2)})`, mislukt.length === 0, mislukt.slice(0, 6).join(' | '));
  console.log(`  info: tekstkleur (monochroom) in minstens één modus: ${tekst.size} — ${[...tekst].sort().join(', ')}`);
  console.log(`  info: eigen toon verschoven tot 3:1 in minstens één modus: ${toon.size} — ${[...toon].sort().join(', ')}`);
  const neutraalMetToon = [...toon].filter((s) => { const d = merkDef(s) ?? (LOGOS[s] ? { kleur: `#${LOGOS[s][1]}` } : null); return d && merkNeutraal(d.kleur) && !(d as MerkDef).vlak; });
  check('monochrome merken krijgen de tekstkleur, nooit een «verschoven grijs»', neutraalMetToon.length === 0, neutraalMetToon.join(', '));
  for (const s of ['github', 'anthropic', 'modelcontextprotocol', 'apple', 'x', 'vercel']) {
    const def = merkDef(s) ?? (LOGOS[s] ? { naam: s, kleur: `#${LOGOS[s][1]}`, d: LOGOS[s][0] } : null);
    if (!def) { check(`${s}: in het register of de grote tabel`, false); continue; }
    check(`${s} (${def.kleur}) wordt in het donker var(--text) (tegel én gliefje) en blijft in het licht zijn merkkleur — was 1,15–1,49:1`, merkKleuren(def, 'tegel').donker === 'var(--text)' && merkKleuren(def, 'gliefje').donker === 'var(--text)' && merkKleuren(def, 'tegel').licht === def.kleur);
  }
  const gpt = merkDef('gpt')!;
  check('een merk met eigen merkvlak dat 3:1 haalt (ChatGPT wit op #10A37F) houdt zijn kleuren', !merkVolgt(gpt, 'tegel').donker && !merkVolgt(gpt, 'tegel').licht);
  const google = merkDef('google')!;
  check('een gekleurd merk dat overal 3:1 haalt (Google #4285F4) houdt zijn kleur in de tegel', !merkVolgt(google, 'tegel').donker && !merkVolgt(google, 'tegel').licht);

  // ------------------------------------------------------------------ 3. de ene regel in de bron
  const merkTsx = lees('src/merk/Merk.tsx'), merkCss = zonderCommentaar(lees('src/merk/merk.css'));
  check('Merk.tsx tekent elk gliefje via merkKleuren + merkVulling + merkKleurStijl (één regel voor alle merken)', /merkKleuren\(m, vorm\)/.test(merkTsx) && /merkVulling\(m\.kleur, kleuren\)/.test(merkTsx) && /merkKleurStijl\(kleuren\)/.test(merkTsx));
  check('merk.css: spatie-schakelaar — --merk-in-donker leeg in het donker en ongeldig in het licht (en omgekeerd)', /\.theme-dark,\s*\.theme-plum-dark\s*\{\s*--merk-in-donker:\s*;\s*--merk-in-licht:\s*initial;?\s*\}/.test(merkCss) && /:root,\s*\.theme-light,\s*\.theme-plum-light\s*\{\s*--merk-in-licht:\s*;\s*--merk-in-donker:\s*initial;?\s*\}/.test(merkCss));
  check('monogram: letters in var(--text), de tint alleen als achtergrond', /span\.merk-mono\s*\{[^}]*\bcolor:\s*var\(--text\)/.test(merkCss));

  // ------------------------------------------------------------------ 4. monogram (onbekend merk) × 360 tinten × 26 paletten
  const tintL = Number(merkTsx.match(/hsl\(\$\{h\} 55% (\d+)%\)/)?.[1] ?? NaN);
  let monoMin = 99, monoWaar = '';
  for (let h = 0; h < 360; h++) for (const p of vlakken) { const c = merkContrast(p.w['--text'], merkMeng(hsl(h, 55, tintL), p.w['--panel'], 0.12)); if (c < monoMin) { monoMin = c; monoWaar = `${h}° ${p.naam}`; } }
  check(`monogram-letters ≥ 4,5:1 op de tint bij elke toon en elk palet (laagste ${monoMin.toFixed(2)} bij ${monoWaar})`, monoMin >= 4.5);

  // ------------------------------------------------------------------ 5. categorie-iconen i.p.v. pseudo-logo's
  const lijnen = Object.entries(MERKEN).filter(([, d]) => d.lijn);
  check(`categorie-iconen in het register (lijn) — ${lijnen.map(([k]) => k).join(', ')}`, lijnen.length >= 6 && lijnen.every(([k, d]) => k.startsWith('icoon-') && typeof d.d === 'string' && /^M/.test(d.d!)));
  const verwacht: Record<string, string> = { 'rest-api': 'icoon-api', scim: 'icoon-scim', imap: 'icoon-mail' };
  for (const [id, slug] of Object.entries(verwacht)) {
    const i = INTEGRATIES.find((x) => x.id === id);
    check(`koppeling ${id}: categorie-icoon ${slug} (was monogram «${id === 'rest-api' ? 'RA' : id === 'scim' ? 'S2' : 'IS'}»)`, i?.logo === slug && !!merkDef(slug)?.lijn);
  }
  const zonder = INTEGRATIES.filter((i) => !i.logo || (!merkDef(i.logo) && !LOGOS[i.logo]));
  check(`geen enkele koppeling (${INTEGRATIES.length}) valt nog terug op een monogram`, zonder.length === 0, zonder.map((i) => i.id).join(', '));
  let icoonMin = 99; for (const p of vlakken) icoonMin = Math.min(icoonMin, merkContrast(p.w['--text'], merkMeng(p.w['--accent'], p.w['--panel'], MERK_TINT)));
  check(`categorie-icoon (tekstkleur op accenttint) ≥ 3:1 in alle paletten (laagste ${icoonMin.toFixed(2)})`, icoonMin >= 3);
  const geheimZonder = (Object.keys(DIENSTEN) as DienstId[]).filter((d) => { const s = DIENST_MERK[d]; return !s || (!merkDef(s) && !LOGOS[s]); });
  check(`«Секрети й ключі»: elke dienst (${Object.keys(DIENSTEN).length}) heeft een merk of categorie-icoon uit het register — geen lettertegels meer`, geheimZonder.length === 0, geheimZonder.join(', '));
  check('geheimen/logos.tsx tekent geen letters meer (d.letters ongebruikt)', !/d\.letters/.test(lees('src/geheimen/logos.tsx')));

  // ------------------------------------------------------------------ 6. avatars met kleurtoon: wit ≥ 4,5 bij elke toon
  const avatars: Array<[string, RegExp]> = [
    ['src/audit/Mensen.tsx', /hsl\(\$\{[^}]+\} (\d+)% (\d+)%\)/g], ['src/uitrol/Voorbereiders.tsx', /hsl\(\$\{[^}]+\} (\d+)% (\d+)%\)/g],
    ['src/uitrol/Persoon.tsx', /hsl\(\$\{[^}]+\} (\d+)% (\d+)%\)/g], ['src/overzicht/widgets.tsx', /hsl\(\$\{[^}]+\} (\d+)% (\d+)%\)/g],
  ];
  for (const [f, rx] of avatars) {
    const stops = [...lees(f).matchAll(rx)].map((m) => [Number(m[1]), Number(m[2])]);
    let min = 99; for (const [s, l] of stops) for (let h = 0; h < 360; h++) min = Math.min(min, merkContrast('#ffffff', hsl(h, s, l)));
    check(`${f}: witte letters op de avatar ≥ 4,5:1 bij elke toon (${stops.length} stop(s), laagste ${min.toFixed(2)}; was 3,0–4,4)`, stops.length > 0 && min >= 4.5);
  }

  // ------------------------------------------------------------------ 7. bron: geen wit op accent- of statusvlak
  const VLAK = /background(?:-color)?\s*:\s*var\(--(?:accent|canonical-accent|[a-z0-9]+-acc(?:ent)?|ok-vlak|warn-vlak|fout-vlak|info-vlak|good|danger|boot-accent|[a-z0-9]+-(?:ok|warn|bad|err|fout|info|kritiek|laag|midden|hoog|off|uit))\b/;
  const WIT = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i;
  const fout: string[] = [];
  for (const f of bestanden('src', '.css')) {
    zonderCommentaar(lees(f)).replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel: string, body: string) => { if (VLAK.test(body) && WIT.test(body)) fout.push(`${f}: ${sel.trim().slice(-60)}`); return ''; });
  }
  check('geen CSS-regel met wit op een accent- of statusvlak (was o.a. .settings-primary, .cloud-energy, .hub-seg, .ut-knop-primair, .aj-knop-hoofd, .gast button, .tm-chip)', fout.length === 0, fout.slice(0, 6).join(' | '));
  const tsxFout = bestanden('src', '.tsx').filter((f) => /var\(--accent[^']*\)'[^}\n]{0,80}'#fff(?:fff)?'/.test(lees(f)));
  check('geen inline-stijl met #fff naast var(--accent) (was MailKoppelVenster «Підключити»: wit op #82acff = 2,25:1)', tsxFout.length === 0, tsxFout.join(', '));
  const kv = lees('src/mail/MailKoppelVenster.tsx');
  check('MailKoppelVenster: hoofdknop tekst = var(--text-on-accent)', /color: hoofd \? 'var\(--text-on-accent/.test(kv));

  // ------------------------------------------------------------------ 8. mini-paletten op de statustokens
  const MINI = /--(?:aj|ut|hub|ag|v2|gm|adg|il|eo|aib|vm|rb|afz|ov)-(?:ok|warn|err|bad|info|laag|midden|kritiek|g|b|op|bijna|off|uit|unk)(?:-bg|-zacht)?\s*:\s*(?:#|rgba?\(|color-mix)/;
  const miniFout = bestanden('src', '.css').filter((f) => MINI.test(zonderCommentaar(lees(f))));
  check('mini-paletten (--aj/--ut/--hub/--ag/--v2/--gm/--adg/--il/--eo/--aib/--vm/--rb/--afz/--ov) verwijzen naar --ok/--warn/--fout/--info, geen eigen hex', miniFout.length === 0, miniFout.join(', '));
  const cloud = zonderCommentaar(lees('src/cloud-functioneel.css'));
  check('cloud: geen halfdoorzichtige tekst (color-mix met transparent) meer — was #656e77 op #e3ecf2 = 4,33:1', !/(?<![-\w])color:\s*color-mix\([^;]*transparent\)/.test(cloud));
  const ap = zonderCommentaar(lees('src/toegangslaag.css'));
  check('id «Активний»-badge (.tone-good) op --ok/--ok-zacht — was 2,24:1 in het donker', /\.access-plane-badge\.tone-good\{background:var\(--ok-zacht\);color:var\(--ok\)\}/.test(ap));

  return einde();
}
