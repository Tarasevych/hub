// Eenheidstest 25.10.2026 (blok 1, 8.6) — venster «Підтвердіть доступ» en de chips in de toestemming: niets buiten het venster,
// leesbare uitleg. Statische scan van de CSS + contrast uit de echte paletwaarden (geen browser nodig; de stand meet het in Chrome:
// tests/e2e/hulp/stand-blok1-toegang.ts → blok1-toegang-stapop / -chips).
//
// Wat er mis was (onderzoek H, 25.10.2026):
//   • `.bevestig-toegang-kaart input{width:100%;…monospace}` trof ook het vinkje «Запам’ятати цей браузер (не питати знову до
//     виходу)»: vinkje 324 px breed, label 58 px buiten het venster (1280 en 390 px, licht en donker);
//   • de uitleg eronder had `opacity:.8`: 3.1–4.3:1 in de lichte paletten;
//   • `.v2-chip{white-space:nowrap}` liep in de stap «Дозволи» op 390 px buiten het toestemmingsvenster.
// Plus een veegronde: geen enkel ander toestemmings-/goedkeuringsvenster van de site heeft een kale `input{width:100%}`-regel die
// een vinkje kan oprekken, of een nowrap-label zonder afkapping.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { contrast, kleurWaarden, meng, PUUR, SECTIES } from '../../src/thema/paletten';

const lees = (p: string) => readFileSync(p, 'utf8');
type Regel = { sel: string[]; decl: string; tekst: string };
/** Binnenste regels (ook binnen @media), zonder commentaar. */
const regels = (css: string): Regel[] => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].split(',').map((s) => s.trim()).filter(Boolean), decl: m[2].trim(), tekst: `${m[1].trim()}{${m[2].trim()}}` }))
  // `:not([type=checkbox],[type=radio])` bevat zelf een komma: selectorlijst opnieuw samenvoegen binnen haakjes
  .map((r) => { const delen: string[] = []; let diep = 0, huidig = ''; for (const ch of r.sel.join(',')) { if (ch === '(') diep++; if (ch === ')') diep--; if (ch === ',' && !diep) { delen.push(huidig.trim()); huidig = ''; } else huidig += ch; } if (huidig.trim()) delen.push(huidig.trim()); return { ...r, sel: delen }; });
/** Het onderwerp van een selector (laatste samengestelde deel). */
const onderwerp = (s: string) => s.split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
/** Een regel met een kale `input` als onderwerp (zonder uitsluiting van vinkjes) die de breedte zet: rekt een vinkje op. */
const rektVinkje = (r: Regel) => /(^|;)\s*width\s*:\s*100%/.test(r.decl) && r.sel.some((s) => { const o = onderwerp(s); return /^input(?![-\w])/.test(o) && !/\[type=['"]?(text|email|search|password|number|tel|url)['"]?\]/.test(o) && !/:not\([^)]*checkbox[^)]*\)/.test(o); })
  || r.sel.some((s) => /:is\([^)]*\binput\b(?!\[)[^)]*\)\s*$/.test(s) && /(^|;)\s*width\s*:\s*100%/.test(r.decl));
const decl = (css: string, selector: string) => regels(css).filter((r) => r.sel.includes(selector)).map((r) => r.decl).join(';');

export async function main(): Promise<number> {
  const { check, einde } = checker('bevestig-toegang-opmaak-20261025');
  const css = lees('src/platform/bevestig-toegang.css');
  const R = regels(css);

  // ------------------------------------------------------------------ 1. vinkje en label
  check('geen invoerregel in het venster rekt een vinkje of keuzerondje op (kale input + width:100%)', !R.some(rektVinkje), R.filter(rektVinkje).map((r) => r.tekst.slice(0, 120)).join(' | '));
  const veld = R.find((r) => r.sel.some((s) => s.startsWith('.bevestig-toegang-kaart input')));
  check('het codeveld (monospace, 100%) geldt alleen voor tekstvelden: :not([type=checkbox],[type=radio])',
    !!veld && veld.sel.includes('.bevestig-toegang-kaart input:not([type=checkbox],[type=radio])') && /width:100%/.test(veld.decl) && /monospace/.test(veld.decl), veld?.tekst.slice(0, 140));
  check('het vinkje zelf: vaste maat van de browser (flex:0 0 auto, width:auto)', /flex:0 0 auto/.test(decl(css, '.bevestig-toegang-onthoud input')) && /width:auto/.test(decl(css, '.bevestig-toegang-onthoud input')));
  check('het label krimpt en breekt binnen het venster: span{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}', decl(css, '.bevestig-toegang-onthoud span') === 'flex:1 1 auto;min-width:0;overflow-wrap:anywhere');
  check('de rij van het vinkje blijft flex met de tekst ernaast (align-items:flex-start)', /display:flex;align-items:flex-start/.test(decl(css, '.bevestig-toegang-onthoud')));

  // ------------------------------------------------------------------ 2. de uitleg: geen opacity, gewone gedempte kleur
  const noot = decl(css, ".bevestig-toegang-uitleg[data-onthoud-uitleg]");
  check('uitleg onder het vinkje: geen opacity meer, kleur var(--muted)', !!noot && !/opacity/.test(noot) && /color:var\(--muted/.test(noot), noot);
  check('alle uitleg in het venster in var(--muted) (hoort bij --panel, de achtergrond van het venster)', /color:var\(--muted,var\(--boot-muted/.test(decl(css, '.bevestig-toegang-uitleg')));
  const opac = R.filter((r) => /(^|;)\s*opacity\s*:\s*(0?\.\d+|0)\s*(;|$)/.test(r.decl));
  check('opacity < 1 alleen nog op uitgeschakelde knoppen (WCAG 1.4.3: uitgeschakeld is uitgezonderd)', opac.every((r) => r.sel.every((s) => /:disabled/.test(s))), opac.map((r) => r.tekst.slice(0, 90)).join(' | '));

  // ------------------------------------------------------------------ 3. contrast in elk palet (uit de echte waarden)
  // Venster: .venster{background:var(--panel)}; de kaart legt rgba(127,127,127,.04) erover; label = --text, uitleg = --muted.
  const tokens = lees('src/ontwerp/tokens.css');
  const blok = (kop: string) => { const m = new RegExp(`^${kop.replace(/[.()]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(tokens); const v = (n: string) => new RegExp(`--${n}:(#[0-9a-f]{3,6})`, 'i').exec(m?.[1] || '')?.[1] || ''; return { panel: v('panel'), muted: v('muted'), text: v('text') }; };
  const lang = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toLowerCase();
  const paletten: Array<[string, { panel: string; muted: string; text: string }]> = [
    ['grifel licht', blok(':root, .theme-light')], ['grifel donker', blok('.theme-dark')],
    ['violet licht', blok('.theme-plum-light')], ['violet donker', blok('.theme-plum-dark')],
    ['puur licht', PUUR.licht], ['puur donker', PUUR.donker],
    ...SECTIES.flatMap((s) => { const w = kleurWaarden(s); return [[`kleur ${s} licht`, w.licht], [`kleur ${s} donker`, w.donker]] as Array<[string, { panel: string; muted: string; text: string }]>; }),
  ];
  const laag: string[] = [], oudLaag: string[] = [];
  for (const [naam, p] of paletten) {
    if (!p.panel || !p.muted || !p.text) { laag.push(`${naam}: waarden ontbreken`); continue; }
    const kaart = meng('#7f7f7f', lang(p.panel), 0.04);
    const uitleg = contrast(lang(p.muted), kaart), label = contrast(lang(p.text), kaart);
    if (uitleg < 4.5 || label < 4.5) laag.push(`${naam}: uitleg ${uitleg.toFixed(2)}, label ${label.toFixed(2)}`);
    // Ter vergelijking het oude: --muted met opacity .8 (in de lichte paletten onder AA).
    const oud = contrast(meng(lang(p.muted), kaart, 0.8), kaart);
    if (oud < 4.5) oudLaag.push(`${naam} ${oud.toFixed(2)}`);
  }
  check(`uitleg en label ≥ 4.5:1 op de kaart in alle ${paletten.length} paletten (grifel, violet, puur, kleur × 10 secties; licht en donker)`, !laag.length && paletten.length === 26, laag.join(' | '));
  check('ter controle: met de oude opacity .8 zakte de uitleg in de lichte paletten onder 4.5:1', oudLaag.some((x) => x.startsWith('grifel licht')) && oudLaag.some((x) => x.startsWith('violet licht')), oudLaag.slice(0, 4).join(', '));

  // ------------------------------------------------------------------ 4. chips in de toestemming (connector-v2.css)
  const v2 = lees('src/connector-v2/connector-v2.css');
  const chip = decl(v2, '.v2-chip'), chipsRij = decl(v2, '.v2-chips');
  check('.v2-chip loopt om binnen het venster: geen nowrap, white-space:normal, overflow-wrap, max-width:100%', !/nowrap/.test(chip) && /white-space:normal/.test(chip) && /overflow-wrap:break-word/.test(chip) && /max-width:100%/.test(chip), chip);
  check('.v2-chips mag krimpen (min-width:0;max-width:100%) en het pictogram in een chip krimpt niet mee', /min-width:0;max-width:100%/.test(chipsRij) && decl(v2, '.v2-chip svg') === 'flex:none');

  // ------------------------------------------------------------------ 5. veegronde over de andere toestemmings-/goedkeuringsvensters
  const VENSTERS = ['src/platform/bevestig-toegang.css', 'src/connector-v2/connector-v2.css', 'src/connector-v2/koppel-wizard-plaats.css', 'src/mcp-toestemming-venster.css',
    'src/ai-bevestiging/bevestigingen.css', 'src/extensie/BrowserEnAgenten.css', 'src/extensie/ExtensieOntgrendeling.css'];
  for (const f of VENSTERS) {
    const r = regels(lees(f));
    const rek = r.filter(rektVinkje);
    // nowrap mag alleen met afkapping (overflow:hidden + text-overflow:ellipsis) of als schermlezertekst (1 px, clip)
    const nowrap = r.filter((x) => /white-space\s*:\s*nowrap/.test(x.decl) && !(/overflow:hidden/.test(x.decl) && /text-overflow:ellipsis/.test(x.decl)) && !/clip:rect|clip-path/.test(x.decl));
    check(`${f}: geen opgerekt vinkje en geen nowrap-label zonder afkapping`, !rek.length && !nowrap.length, [...rek, ...nowrap].map((x) => x.tekst.slice(0, 100)).join(' | '));
  }
  return einde();
}
