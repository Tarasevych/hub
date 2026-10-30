// Bestandskaart na de Nederlandse hernoeming (24.10.2026, pakket 1 «Adaptive Mail Canvas»). Draaien: node scripts/eenheidstests.mjs bestandskaart
// Wens van de eigenaar: «перейменувати всі файли нідерландською мовою, і щоб система знала де що».
//  A. kaart: elk nieuw pad bestaat, geen oud pad bestaat nog, geen dubbele of hoofdletterbotsende doelen, extensie ongewijzigd.
//  B. scripts/kaart-controle.mjs: 0 fouten op de echte boom; een nepbestand met een oud pad wordt WEL gevonden (ook zonder extensie).
//  C. sleutelbestanden die de eigenaar bij naam noemde (GoogleMailWorkspace, MailThreadContent, MailReaderToolbar, MailMessageBody,
//     dichtheidsprofielen) staan in de kaart, met hun componentnaam ongewijzigd (alleen het bestand heet anders).
//  D. uitzonderingen (door de installer bij naam gebruikt) houden hun naam en staan met reden in de kaart.
//  E. techregels: alle Beheer*-weergaven zijn technisch; geen gewoon bestand begint met «Beheer»/«beheer-» in src/.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { checker } from './hulp/nep-google';
// @ts-expect-error — .mjs zonder typen
import { controleer, woordenVan } from '../../scripts/kaart-controle.mjs';

type Kaart = { bestanden: { oud: string; nieuw: string }[]; behouden: { pad: string; reden: string }[]; mappen: Record<string, string>; woorden: Record<string, string>; toegevoegd?: { pad: string; wat: string; sinds: string }[] };

export async function main(): Promise<number> {
  const { check, einde } = checker('bestandskaart-20261024');
  const kaart: Kaart = JSON.parse(readFileSync('docs/kaart/bestandskaart.json', 'utf8'));
  const h = kaart.bestanden;

  // A
  check('A kaart heeft honderden hernoemingen', h.length > 400, String(h.length));
  check('A elk nieuw pad bestaat', h.every((x) => existsSync(x.nieuw)), h.filter((x) => !existsSync(x.nieuw)).slice(0, 3).map((x) => x.nieuw).join(', '));
  check('A geen oud pad bestaat nog', h.every((x) => !existsSync(x.oud)), h.filter((x) => existsSync(x.oud)).slice(0, 3).map((x) => x.oud).join(', '));
  const lager = h.map((x) => x.nieuw.toLowerCase());
  check('A geen dubbele of alleen-hoofdletter-verschillende doelen', new Set(lager).size === lager.length);
  const ext = (p: string) => (p.match(/(\.(test|e2e|d|generated))?\.[a-z0-9]+$/) || [''])[0];
  check('A extensie ongewijzigd', h.every((x) => ext(x.oud) === ext(x.nieuw)));
  check('A mappen: src/search → src/zoek, src/flags → src/vlaggen, src/remote → src/extern', kaart.mappen['src/search'] === 'src/zoek' && kaart.mappen['src/flags'] === 'src/vlaggen' && kaart.mappen['src/remote'] === 'src/extern' && !existsSync('src/search') && !existsSync('src/flags') && !existsSync('src/remote'));

  // B
  const echt = controleer(process.cwd());
  check('B kaart-controle: 0 fouten op de boom', echt.fouten.length === 0, echt.fouten.slice(0, 3).join(' · '));
  check('B kaart-controle: geen Engelse namen meer (waarschuwingen)', echt.waarschuwingen.length === 0, echt.waarschuwingen.slice(0, 3).join(' · '));
  const nep = controleer(process.cwd(), { extra: { 'tests/eenheid/__nep-kaart.ts': "import X from '../../src/GoogleMailWorkspace';\nconst p = 'src/MailReaderToolbar.tsx';" } }); // kaart:oud-toegestaan
  check('B nepbestand met oude paden: beide verwijzingen gevonden', nep.fouten.filter((f: string) => f.startsWith('tests/eenheid/__nep-kaart.ts')).length === 2, nep.fouten.join(' · '));
  check('B woordenVan splitst PascalCase en kebab-case', JSON.stringify(woordenVan('MailReaderToolbar.tsx')) === '["mail","reader","toolbar"]' && JSON.stringify(woordenVan('mail-density-profile.ts')) === '["mail","density","profile"]');

  // C
  const naar = (oud: string) => h.find((x) => x.oud === oud)?.nieuw || '';
  const sleutel: [string, string, RegExp][] = [
    ['src/GoogleMailWorkspace.tsx', 'src/GoogleMailWerkruimte.tsx', /export default function GoogleMailWorkspace\b/], // kaart:oud-toegestaan
    ['src/MailThreadContent.tsx', 'src/MailGesprekInhoud.tsx', /export default function MailThreadContent\b/], // kaart:oud-toegestaan
    ['src/MailReaderToolbar.tsx', 'src/MailLezerWerkbalk.tsx', /export default function MailReaderToolbar\b/], // kaart:oud-toegestaan
    ['src/MailMessageBody.tsx', 'src/MailBerichtTekst.tsx', /export default function MailMessageBody\b/], // kaart:oud-toegestaan
    ['src/mail-density-profile.ts', 'src/mail-dichtheid-profiel.ts', /export /], // kaart:oud-toegestaan
    ['src/MailDensityProfileEditor.tsx', 'src/MailDichtheidProfielBewerker.tsx', /export default function MailDensityProfileEditor\b/], // kaart:oud-toegestaan
  ];
  for (const [o, n, re] of sleutel) check(`C ${o} → ${n} (componentnaam blijft)`, naar(o) === n && re.test(readFileSync(n, 'utf8')));

  // D
  const beh = new Map(kaart.behouden.map((b) => [b.pad, b.reden]));
  for (const p of ['backend/deployment-identity.ts', 'scripts/rook-controle.mjs', 'server/pg-versie.ts', 'server/apparaat-koppelcode.ts', 'server/migrate.ts', 'scripts/build-server.mjs', 'scripts/installer/Install-MijnRuimte.cmd'])
    check(`D ${p} behouden met reden`, existsSync(p) && !!beh.get(p));
  check('D bouwingangen dist-server ongewijzigd (start, cron, migrate, zoek-werker, rook, apparaat-koppelcode)', /start: 'server\/start\.ts', cron: 'server\/cron\.ts', migrate: 'server\/migrate\.ts', 'zoek-werker': 'backend\/zoek\/tekst-werker\.ts', rook: 'server\/rook\.ts', 'apparaat-koppelcode': 'server\/apparaat-koppelcode\.ts'/.test(readFileSync('scripts/build-server.mjs', 'utf8')));

  // E
  const tb = readFileSync('shared/tech-bundels.ts', 'utf8');
  const beheerSrc = readdirSync('src').filter((f) => /^Beheer[A-Z]/.test(f) || /^beheer-/.test(f));
  check('E techregels op de nieuwe namen (Beheer*, beheer-*, src/vlaggen/, src/extern/)', tb.includes('/^src\\/Beheer[A-Z][A-Za-z]*\\.tsx$/') && tb.includes('/^src\\/beheer-[a-z0-9-]+\\.(tsx?|css)$/') && tb.includes("'src/vlaggen/'") && tb.includes("'src/extern/'") && !tb.includes("'src/flags/'"));
  check('E alle Beheer*/beheer-* in src waren Admin*/admin-* (geen gewoon bestand wordt technisch)', beheerSrc.every((f) => h.some((x) => x.nieuw === `src/${f}` && /^src\/(Admin[A-Z]|admin-)/.test(x.oud))), beheerSrc.join(', '));

  // ------------------------------------------------------------------ F. bijgekomen na de hernoeming (pakket 1 en later)
  const toe = kaart.toegevoegd || [];
  check('F «toegevoegd»: elk bijgekomen bestand bestaat, zegt wat erin staat en sinds wanneer (het kader van het leesvenster staat erbij)',
    toe.length >= 5 && toe.every((t) => existsSync(t.pad) && t.wat.length > 20 && !!t.sinds) && ['src/mail/LeesVenster.tsx', 'src/mail/lees-modus.ts', 'src/mail/lees-venster.css'].every((p) => toe.some((t) => t.pad === p)), toe.filter((t) => !existsSync(t.pad)).map((t) => t.pad).join(', '));
  const nepToe = controleer('.', { extra: {} });
  check('F kaart-controle kent «toegevoegd» (een ontbrekend bijgekomen bestand is een fout)', readFileSync('scripts/kaart-controle.mjs', 'utf8').includes('toegevoegd maar ontbreekt') && nepToe.fouten.length === 0);
  return einde();
}
