// «?» verplicht bij elke optie en schakelaar van het technisch profiel en het beheer (18.10.2026). Faalt met de LIJST van wat
// ontbreekt: (1) onvolledige registeritems, (2) bedieningselementen zonder data-hulp, (3) sleutels zonder «?» in hetzelfde
// bestand, (4) catalogi (rollen, root-schakelaars, beveiligingsschakelaars, SSH-CA) zonder registeritem.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

/** Mappen en bestanden van het technisch profiel en het beheer. Nieuwe map met opties → hier toevoegen. */
export const HULP_MAPPEN = ['src/tech', 'src/extensie', 'src/ssh', 'src/terminal', 'src/extern', 'src/vlaggen', 'src/impersonatie', 'src/ondersteuning', 'src/diagnose',
  'src/beveiliging', 'src/diagnostiek', 'src/uitrol', 'src/audit', 'src/geheimen', 'src/integraties', 'src/besluit',
  'src/zoek' /* zone D 22.10.2026: indexvenster (zoek.index.*); filters/sortering van /zoek zijn data-hulp-vrij */,
  'src/werkblad' /* zone F 22.10.2026: instelmodus van het werkblad (achtergrondkeuze, instellen, terugzetten) */];
export const HULP_BESTANDEN = ['src/BeheerConsoleWeergave.tsx', 'src/BeheerAiBeleidWeergave.tsx', 'src/BeheerUitrolWeergave.tsx', 'src/BeheerSleutelsWeergave.tsx', 'src/BeheerOverzichtWeergave.tsx',
  'src/BeheerDiagnostiekWeergave.tsx', 'src/IdentiteitBeheerWeergave.tsx', 'src/McpServerBeheerKaart.tsx'];

type Tag = { tag: string; tekst: string; regel: number };
/** JSX-openingstags met haakjes-, accolade- en stringbewustzijn (geen volledige parser, wel genoeg voor attributen). */
export function tags(src: string): Tag[] {
  const uit: Tag[] = [];
  const re = /<(input|select|button|div|span|li|label|a)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, diep = 0, q: string | null = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') diep++; else if (c === '}') diep--; else if (c === '>' && diep === 0) break;
    }
    uit.push({ tag: m[1], tekst: src.slice(m.index, i + 1), regel: src.slice(0, m.index).split('\n').length });
  }
  return uit;
}
export const isBediening = (t: Tag) => t.tag === 'select' || /\btype=\{?['"](checkbox|radio)['"]/.test(t.tekst) || /\brole=\{?['"](switch|radio|checkbox)['"]/.test(t.tekst);

export async function main(): Promise<number> {
  const { check, einde } = checker('hulp-register');
  const { HULP_REGISTER, HULP_VRIJ, hulpGebreken, hulpVan } = await import('../../shared/hulp-register');
  const { TECH_ROLLEN, HELP_TECH } = await import('../../shared/tech-rollen');
  const { HELP_SSH_BEHEER } = await import('../../shared/ssh-ca');

  // ------------------------------------------------------------------ 1. elk item volledig (4 lagen, uk/nl, lengte, uk ≠ nl, bron)
  const gebreken = Object.entries(HULP_REGISTER).flatMap(([k, h]) => hulpGebreken(k, h));
  check(`register: alle ${Object.keys(HULP_REGISTER).length} items volledig (wat/gevolg/risico/dev, uk/nl, min. lengte, uk ≠ nl, bron)`, gebreken.length === 0, gebreken.join('\n'));
  check('register: de controle zelf werkt (leeg, te kort, uk == nl en ontbrekend worden gevonden)',
    hulpGebreken('x', undefined).length === 1
    && hulpGebreken('x', { wat: ['коротко', 'kort'], gevolg: ['Однаковий текст для обох мов тут', 'Однаковий текст для обох мов тут'], risico: ['Ризик описано достатньо довго.', 'Risico lang genoeg beschreven hier.'], dev: ['' as string, ''], bron: 'nergens' } as never).length >= 5);

  // ------------------------------------------------------------------ 2+3. bedieningselementen in de mappen
  const bestanden = [...HULP_BESTANDEN];
  for (const d of HULP_MAPPEN) { try { for (const f of readdirSync(d)) if (f.endsWith('.tsx')) bestanden.push(`${d}/${f}`); } catch { /* map bestaat (nog) niet */ } }
  const zonder: string[] = [], onbekend: string[] = [], geenVraag: string[] = [], vrij: string[] = [];
  let aantal = 0;
  for (const f of bestanden) {
    let src = '';
    try { src = readFileSync(join(process.cwd(), f), 'utf8'); } catch { continue; }
    for (const t of tags(src).filter(isBediening)) {
      aantal++;
      const plek = `${f}:${t.regel} <${t.tag}>`;
      const v = /data-hulp-vrij=['"]([a-z]+)['"]/.exec(t.tekst);
      if (v) { if ((HULP_VRIJ as readonly string[]).includes(v[1])) vrij.push(`${plek} (${v[1]})`); else onbekend.push(`${plek}: data-hulp-vrij='${v[1]}' is geen toegestane reden (${HULP_VRIJ.join('|')})`); continue; }
      const vast = /data-hulp=['"]([a-z0-9.-]+)['"]/.exec(t.tekst);
      const dyn = /data-hulp=\{`([a-z0-9.-]+\.)\$\{/.exec(t.tekst);
      if (vast) {
        if (!hulpVan(vast[1])) onbekend.push(`${plek}: sleutel ${vast[1]} staat niet in shared/hulp-register.ts`);
        if (!new RegExp(`<HulpVraag k=['"]${vast[1].replace(/\./g, '\\.')}['"]`).test(src) && !new RegExp(`meer=\\{\\[[^]*?\\[\\s*['"]${vast[1].replace(/\./g, '\\.')}['"]\\s*,`).test(src) /* 29.10.2026: één (?) per kop — de sleutel staat in meer={[…]} van de (?) bij de kop */) geenVraag.push(`${plek}: geen <HulpVraag k='${vast[1]}' /> in dit bestand`);
      } else if (dyn) {
        if (!Object.keys(HULP_REGISTER).some((k) => k.startsWith(dyn[1]))) onbekend.push(`${plek}: geen sleutels met voorvoegsel ${dyn[1]}`);
        if (!src.includes(`<HulpVraag k={\`${dyn[1]}\${`)) geenVraag.push(`${plek}: geen <HulpVraag k={\`${dyn[1]}…\`} /> in dit bestand`);
      } else zonder.push(`${plek}: ${t.tekst.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
  check(`bediening: elk van de ${aantal} opties/schakelaars heeft data-hulp (of data-hulp-vrij met reden)`, zonder.length === 0, zonder.join('\n'));
  check('bediening: elke data-hulp-sleutel staat in het register', onbekend.length === 0, onbekend.join('\n'));
  check('bediening: naast elke sleutel staat een «?» (HulpVraag) in hetzelfde bestand', geenVraag.length === 0, geenVraag.join('\n'));
  check(`bediening: uitzonderingen (alleen filter/sortering/keuze uit een lijst) — ${vrij.length}`, vrij.length < aantal / 2, vrij.join('\n'));
  check('scanner vindt checkbox, radio, switch en select (zelftest)', tags(`<input type='checkbox' data-hulp='a.b'/><button role='switch' onClick={() => { x(); }}>x</button><select value={v}>`).filter(isBediening).length === 3);

  // ------------------------------------------------------------------ 4. catalogi
  const ontbreekt = (lijst: string[]) => lijst.filter((k) => !hulpVan(k));
  const rollen = ontbreekt(TECH_ROLLEN.map((r) => `tech.rol.${r.id}`));
  check('catalogus: elke technische rol (TECH_ROLLEN) heeft tech.rol.<id>', rollen.length === 0, rollen.join(', '));
  const tech = ontbreekt(Object.keys(HELP_TECH).map((k) => `tech.${k}`));
  check('catalogus: elk onderdeel van HELP_TECH heeft tech.<id>', tech.length === 0, tech.join(', '));
  const ssh = ontbreekt(Object.keys(HELP_SSH_BEHEER).map((k) => `ssh.${k}`));
  check('catalogus: elk onderdeel van de SSH-CA-kaart heeft ssh.<id>', ssh.length === 0, ssh.join(', '));
  // Root-schakelaars: precies de standaard van de installer (wie er een toevoegt, moet hier uitleg geven).
  const inst = readFileSync('deploy/installeer-app.sh', 'utf8');
  const m = /printf '%s\\n' '(\{"read".*?\})' > \/etc\/mijn-ruimte\/mcp-rechten\.json/.exec(inst);
  const standaard = m ? JSON.parse(m[1]) as Record<string, unknown> : {};
  const rootKeys = Object.entries(standaard).flatMap(([k, v]) => (v && typeof v === 'object' ? Object.keys(v as object).map((s) => `root.${k}.${s}`) : [`root.${k}`]));
  check('catalogus: standaard mcp-rechten.json uit de installer gevonden', rootKeys.length >= 8, String(rootKeys.length));
  const root = ontbreekt(rootKeys);
  check('catalogus: elke root-schakelaar in mcp-rechten.json heeft root.<sleutel>', root.length === 0, root.join(', '));
  const mig = (() => { try { return readFileSync('migrations/0066_beveiliging_schakelaars.sql', 'utf8'); } catch { return ''; } })();
  const bv = /sleutel\s+text PRIMARY KEY CHECK \(sleutel IN \(([^)]+)\)\)/.exec(mig);
  const bvKeys = bv ? bv[1].split(',').map((x) => `beveiliging.${x.trim().replace(/'/g, '')}`) : [];
  const bvMis = ontbreekt(bvKeys);
  check('catalogus: elke beveiligingsschakelaar (0066) heeft beveiliging.<sleutel>', !mig || (bvKeys.length >= 3 && bvMis.length === 0), bvMis.join(', '));

  // ------------------------------------------------------------------ component
  const vraag = readFileSync('src/tech/Vraag.tsx', 'utf8');
  const hv = readFileSync('src/hulp/HulpVraag.tsx', 'utf8');
  check('«?»: «Для розробників» ingeklapt (<details>) met sleutel en bestand', /<details className='tech-vraag-laag is-dev' data-tech-vraag-dev='1'/.test(vraag) && /<summary>/.test(vraag) && /data-tech-vraag-bron/.test(vraag) && !/<details[^>]*\bopen\b/.test(vraag));
  check('«?»: lagen wat/gevolg/risico zichtbaar, uk/nl', /Що це/.test(vraag) && /Wat is het/.test(vraag) && /Ризики/.test(vraag) && /help\.risico/.test(vraag));
  check('HulpVraag leest uit het register en geeft sleutel + bron door', /hulpVan\(k\)/.test(hv) && /sleutel=\{k\}/.test(hv) && /bron=\{h\.bron\}/.test(hv));
  check('register: Oekraïens en Nederlands verschillen in elk item (steekproef ssh.duur)', hulpVan('ssh.duur')!.wat[0] !== hulpVan('ssh.duur')!.wat[1]);
  return einde();
}
