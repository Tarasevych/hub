// APPARAAT-001 — «Підтвердження з іншого пристрою»: pure controles zonder database.
//   A. symbolen: catalogus, trekking (uniek, geldige positie, «gemengd»), Telegram-knoptekst, letters zonder Cyrillische dubbelganger;
//   B. model: normaliseren van instellingen en voorkeuren (grenzen, onbekende velden weg);
//   C. bevestigingstabel: vierde methode «apparaat», handeling «stap-op», keuzes en voorinstellingen blijven consistent;
//   D. routes: elke route gemarkeerd (ALLEEN_SESSIE / MET_SLEUTEL); alles wat de beveiliging zelf verandert eist een verse toegangssleutel;
//      geen nieuwe openbare routes (PUBLIEKE_ROUTES ongewijzigd voor dit onderwerp);
//   E. bron: Telegram-knopletter «s», aftelling voor symboolknoppen, actielabels, vlaguitleg, migratie + terugdraaien, stroom in start.ts;
//   F. teksten en opmaak: alleen uk/nl in zichtbare teksten (geen Engelse woorden), CSS rekt geen vinkje op, opacity alleen op :disabled.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { CIJFERS, LETTERS, PICTOGRAMMEN, catalogusGrootte, keuzeGeldig, symbool, telegramKnopTekst, trek, trekkingGeldig } from '../../shared/apparaat-bevestiging/symbolen';
import { STANDAARD_INSTELLINGEN, STANDAARD_VOORKEUREN, effectieveSoort, instellingenNormaliseren, voorkeurenNormaliseren } from '../../shared/apparaat-bevestiging/model';
import { INGEBOUWDE_ACTIES, KEUZES, KEUZE_IDS, KEUZE_NAMEN, METHODEN, METHODE_NAMEN, beoordeel, eisVan, keuzeToegestaan, minstensZoStreng, voorinstellingToepassen, werkelijkeEis } from '../../shared/telegram-aanmelden/beleid';
import { ALLEEN_SESSIE, MET_SLEUTEL, apparaatRoutes } from '../../backend/apparaat-bevestiging/routes';
import { PUBLIEKE_ROUTES } from '../../server/platform/auth-poort';
import { KNOP_ACTIES } from '../../backend/telegram-aanmelden/cryptografie';
import { JA_LETTERS } from '../../backend/telegram-aanmelden/berichten';
import { TEKST } from '../../shared/telegram-aanmelden/teksten';
import { ACTIES } from '../../backend/toegang-context';
import { VLAG_UITLEG } from '../../shared/vlaggen';

const lees = (p: string) => readFileSync(p, 'utf8');
/** Deterministische «willekeur» voor de trekking. */
const reeks = (...w: number[]) => { let i = 0; return (n: number) => w[i++ % w.length] % n; };

export async function main(): Promise<number> {
  const { check, einde } = checker('apparaat-bevestiging-20261109');

  // ------------------------------------------------------------------ A. symbolen
  check('24 pictogrammen, elk met uniek id, lucide-naam, naam uk+nl en emoji', PICTOGRAMMEN.length === 24 && new Set(PICTOGRAMMEN.map((p) => p.id)).size === 24 && PICTOGRAMMEN.every((p) => p.icoon && p.naam[0] && p.naam[1] && p.emoji));
  check('namen van pictogrammen zijn uniek per taal (geen twee «Квітка»)', new Set(PICTOGRAMMEN.map((p) => p.naam[0])).size === 24 && new Set(PICTOGRAMMEN.map((p) => p.naam[1])).size === 24);
  check('cijfers 2–9 (geen 0/1: lijken op O/I)', CIJFERS.join('') === '23456789');
  const dubbelgangers = new Set(['A', 'B', 'C', 'E', 'H', 'I', 'K', 'M', 'O', 'P', 'T', 'X', 'Y']);
  check('letters: alleen Latijns zonder Cyrillische dubbelganger', LETTERS.every((l) => /^[A-Z]$/.test(l) && !dubbelgangers.has(l)) && LETTERS.length >= 10);
  const t1 = trek('pictogrammen', 3, reeks(5, 5, 5, 1));
  check('trekking: 3 verschillende kandidaten en een geldige positie', t1.kandidaten.length === 3 && new Set(t1.kandidaten).size === 3 && keuzeGeldig(t1.juist, 3) && trekkingGeldig(t1.soort, t1.kandidaten, t1.juist));
  const t5 = trek('letters', 5, reeks(0, 0, 0, 0, 0, 4));
  check('trekking met 5 kandidaten blijft binnen de catalogus en uniek', t5.kandidaten.length === 5 && new Set(t5.kandidaten).size === 5 && t5.kandidaten.every((k) => k < catalogusGrootte('letters')) && t5.juist === 4);
  const tg = trek('gemengd', 3, reeks(2, 0, 1, 2, 0));
  check('«gemengd» kiest eerst een vaste soort', ['pictogrammen', 'cijfers', 'letters'].includes(tg.soort) && tg.kandidaten.length === 3);
  check('aantal buiten 3–5 wordt begrensd', trek('cijfers', 9, reeks(0, 1, 2, 3, 4, 5, 6, 7, 0)).kandidaten.length === 5 && trek('cijfers', 1, reeks(0, 1, 2, 0)).kandidaten.length === 3);
  check('symbool(): ongeldige index → null (nooit een verkeerd symbool tonen)', symbool('cijfers', 99) === null && symbool('pictogrammen', -1) === null && symbool('letters', 0)?.tekst === 'D');
  check('Telegram-knoptekst: emoji + naam voor pictogrammen, kaal cijfer/letter anders', telegramKnopTekst('pictogrammen', 1, 'uk') === '🚲 Велосипед' && telegramKnopTekst('pictogrammen', 1, 'nl') === '🚲 Fiets' && telegramKnopTekst('cijfers', 0, 'uk') === '2');
  check('trekkingGeldig weigert dubbele of te grote indexen', !trekkingGeldig('cijfers', [1, 1, 2], 0) && !trekkingGeldig('cijfers', [1, 2, 99], 0) && !trekkingGeldig('cijfers', [1, 2, 3], 3));

  // ------------------------------------------------------------------ B. model
  const inst = instellingenNormaliseren({ wachtSeconden: 9999, aftelSeconden: 1, aantalKandidaten: 7, uitNa: 1, pauzeNa: 3, wieMag: 'iemand', onbekend: true, symbolenStandaard: 'runen' });
  check('instellingen: grenzen afgedwongen (wacht 300, aftel 3, kandidaten 5, uit > pauze, wieMag iedereen, soort standaard)',
    inst.wachtSeconden === 300 && inst.aftelSeconden === 3 && inst.aantalKandidaten === 5 && inst.uitNa === 4 && inst.pauzeNa === 3 && inst.wieMag === 'iedereen' && inst.symbolenStandaard === 'pictogrammen' && !('onbekend' in inst));
  check('instellingen: leeg = standaard (120 s, 5/10 s, 3 symbolen, totp uit, sterk aan, telegramSymbolen aan)', JSON.stringify(instellingenNormaliseren({})) === JSON.stringify(STANDAARD_INSTELLINGEN) && STANDAARD_INSTELLINGEN.wachtSeconden === 120 && !STANDAARD_INSTELLINGEN.totpToegestaan && STANDAARD_INSTELLINGEN.sterkBijPasskey && STANDAARD_INSTELLINGEN.telegramSymbolen);
  const vk = voorkeurenNormaliseren({ symbolen: 'letters', toonAls: 'anders', geluid: 'ja', totpOpApparaat: true });
  check('voorkeuren: onbekende waarden vallen terug op standaard', vk.symbolen === 'letters' && vk.toonAls === 'venster' && vk.geluid === false && vk.totpOpApparaat === true && vk.aan === true);
  check('effectieve soort: «standaard» volgt de beheerder, anders de gebruiker', effectieveSoort(STANDAARD_INSTELLINGEN, STANDAARD_VOORKEUREN) === 'pictogrammen' && effectieveSoort(STANDAARD_INSTELLINGEN, vk) === 'letters');

  // ------------------------------------------------------------------ C. bevestigingstabel
  check('vierde methode «apparaat» met naam uk/nl', (METHODEN as readonly string[]).includes('apparaat') && METHODE_NAMEN.apparaat[0] === 'інший пристрій' && METHODE_NAMEN.apparaat[1] === 'ander apparaat');
  check('nieuwe keuzes bestaan en hebben namen', ['apparaat', 'telegram-of-apparaat', 'telegram-of-apparaat-of-passkey', 'apparaat-en-code'].every((k) => (KEUZE_IDS as string[]).includes(k) && KEUZE_NAMEN[k as keyof typeof KEUZE_NAMEN]));
  check('alle keuzes hebben een eis (ook de nieuwe)', KEUZE_IDS.every((k) => eisVan(k).length > 0) && KEUZES['telegram-of-apparaat'].length === 2);
  const stapOp = INGEBOUWDE_ACTIES.find((a) => a.sleutel === 'stap-op');
  check('handeling «stap-op»: minimum en standaard «telegram-of-apparaat», niet gevoelig (anders zou de lokale sleutel verplicht zijn)', !!stapOp && stapOp.minimum === 'telegram-of-apparaat' && stapOp.standaard === 'telegram-of-apparaat' && !stapOp.gevoelig);
  check('«telegram» alleen is strenger dan «telegram-of-apparaat» (mag gekozen worden); «apparaat» alleen ook', minstensZoStreng(eisVan('telegram'), eisVan('telegram-of-apparaat')) && keuzeToegestaan(stapOp!, 'apparaat') && keuzeToegestaan(stapOp!, 'apparaat-en-code'));
  check('«telegram-of-apparaat-of-passkey» is ZWAKKER dan «telegram-of-apparaat» en mag dus niet voor stap-op', !keuzeToegestaan(stapOp!, 'telegram-of-apparaat-of-passkey'));
  check('elke ingebouwde standaard is minstens zo streng als het minimum (ook stap-op)', INGEBOUWDE_ACTIES.every((s) => keuzeToegestaan(s, s.standaard)));
  const veiligst = voorinstellingToepassen('veiligst', INGEBOUWDE_ACTIES);
  check('voorinstelling «veiligst» voor stap-op = ander apparaat + geheime code (niet «alles», dat de lokale sleutel eist)', veiligst['stap-op'] === 'apparaat-en-code' && INGEBOUWDE_ACTIES.every((a) => keuzeToegestaan(a, veiligst[a.sleutel])));
  const overal = voorinstellingToepassen('telegram-overal', INGEBOUWDE_ACTIES);
  check('voorinstelling «Telegram overal» kiest voor stap-op gewoon «telegram»', overal['stap-op'] === 'telegram' && INGEBOUWDE_ACTIES.every((a) => keuzeToegestaan(a, overal[a.sleutel])));
  const b1 = beoordeel(werkelijkeEis(stapOp!, undefined), new Set(), new Set(['apparaat']));
  check('poort: alleen «apparaat» beschikbaar → ontbreekt [apparaat], niet geblokkeerd', !b1.toegestaan && !b1.geblokkeerd && b1.ontbreekt.join() === 'apparaat' && b1.onbeschikbaar.join() === 'telegram');
  const b2 = beoordeel(werkelijkeEis(stapOp!, undefined), new Set(['apparaat']), new Set(['apparaat']));
  check('poort: bevestigd vanaf een ander apparaat → toegestaan', b2.toegestaan);
  const b3 = beoordeel(werkelijkeEis(stapOp!, 'apparaat-en-code'), new Set(['apparaat']), new Set(['apparaat', 'code']));
  check('poort: keuze «apparaat-en-code» vraagt na het apparaat nog de code', !b3.toegestaan && b3.ontbreekt.join() === 'code');
  check('gevoelige handelingen blijven ALTIJD toegangssleutel, ook met keuze «apparaat»', INGEBOUWDE_ACTIES.filter((a) => a.gevoelig).every((a) => werkelijkeEis(a, 'apparaat' as never).every((alt) => alt.includes('passkey'))));

  // ------------------------------------------------------------------ D. routes
  const r = apparaatRoutes({ requireSession: async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }), vlagAan: async () => true });
  const soort = (m: unknown) => m as unknown as Record<symbol, unknown>;
  const ongemarkeerd = Object.entries(r).filter(([, m]) => !soort(m)[ALLEEN_SESSIE] && !soort(m)[MET_SLEUTEL]).map(([k]) => k);
  check('elke route is gemarkeerd (ALLEEN_SESSIE / MET_SLEUTEL)', ongemarkeerd.length === 0, ongemarkeerd.join(', '));
  const metSleutel = ['POST /api/owner/bevestiging/apparaat/voorkeuren', 'POST /api/owner/bevestiging/apparaat/herstellen', 'POST /api/owner/bevestiging/apparaat/beheer/instellingen', 'POST /api/owner/bevestiging/apparaat/beheer/ongedaan'];
  check('alles wat de beveiliging zelf verandert eist een verse toegangssleutel', metSleutel.every((k) => soort(r[k])[MET_SLEUTEL]));
  check('noodschakelaar UIT kan altijd (alleen sessie + beheerder, geen sleutel)', !!soort(r['POST /api/owner/bevestiging/apparaat/beheer/nood-uit'])[ALLEEN_SESSIE]);
  check('de poort voor de klassieke step-up bestaat', !!r['POST /api/owner/access/stap-op/poort']);
  check('geen nieuwe openbare routes voor dit onderwerp', !Object.keys(PUBLIEKE_ROUTES).some((k) => /bevestiging\/apparaat|stap-op\/poort|owner\/stroom/.test(k)));
  const antwoord = await (r['POST /api/owner/bevestiging/apparaat/open'][0] as unknown as (rc: unknown) => Promise<{ statusCode: number }>)({ event: {}, body: {}, query: {}, params: {} });
  check('zonder sessie: 401, nooit een lijst', antwoord.statusCode === 401);

  // ------------------------------------------------------------------ E. bron
  check('Telegram-knopletter «s» (symbool) bestaat en telt als «Так» (aftelling)', KNOP_ACTIES.s === 'symbool' && JA_LETTERS.has('s'));
  check('Telegram-tekst voor de symboolkaart in uk en nl, met «одна спроба»', TEKST.bevestigVraagSymbool.uk.includes('одна спроба') && TEKST.bevestigVraagSymbool.nl.includes('één poging') && TEKST.symboolFout.uk.length > 10);
  check('actielabels voor de toegangssleutel op apparaat B en voor de instellingen', 'apparaat-bevestigen' in ACTIES && 'apparaat-instellingen' in ACTIES);
  check('vlag apparaat-bevestiging-v1 heeft uitleg in uk en nl', !!VLAG_UITLEG['apparaat-bevestiging-v1'] && VLAG_UITLEG['apparaat-bevestiging-v1'].naam[0].length > 5 && VLAG_UITLEG['apparaat-bevestiging-v1'].naam[1].length > 5);
  const migratie = lees('migrations/0204_apparaat_bevestiging.sql');
  check('migratie 0204: vlag standaard AAN, drie tabellen, kolommen op tg_bevestigingen, herhaalbaar', /apparaat-bevestiging-v1[\s\S]*true, true/.test(migratie) && ['app.bevestigingen_apparaat', 'app.apparaat_instellingen', 'app.apparaat_voorkeuren'].every((t) => migratie.includes(`CREATE TABLE IF NOT EXISTS ${t}`)) && /ALTER TABLE app\.tg_bevestigingen ADD COLUMN IF NOT EXISTS juist/.test(migratie));
  check('migratie: één poging en korte geldigheid staan in de tabel zelf (CHECK)', /juist < array_length\(kandidaten, 1\)/.test(migratie) && /verloopt_op <= aangemaakt_op \+ interval '6 minutes'/.test(migratie));
  const terug = lees('deploy/apparaat-bevestiging-terugdraaien.sql');
  check('terugdraaien verwijdert precies de drie tabellen, de kolommen en de vlag', ['app.bevestigingen_apparaat', 'app.apparaat_instellingen', 'app.apparaat_voorkeuren', 'DROP COLUMN IF EXISTS juist', "sleutel = 'apparaat-bevestiging-v1'"].every((s) => terug.includes(s)));
  const start = lees('server/start.ts');
  check('snelle stroom: GET /api/owner/stroom vóór de routering, met de verzoekcontext van de router', start.includes("url.pathname === '/api/owner/stroom'") && start.includes("metVerzoek('GET /api/owner/stroom'") && start.includes('sluitAlleStromenApparaat()'));
  const poort = lees('backend/telegram-aanmelden/beleid-poort.ts');
  check('de poort van TELEGRAM-001 kent «apparaat» (beschikbaar, voldaan, verbruik) — geen tweede poort', poort.includes("uit.add('apparaat')") && poort.includes('apparaatVoldaan(') && poort.includes('apparaatVerbruik('));
  const stapOpSrc = lees('backend/stap-op.ts');
  check('stapOpVoorSessieVastleggen: telegram nooit sterk, apparaat alleen sterk op verzoek, passkeySessies nooit', /methode === 'apparaat' && opties\.sterk === true/.test(stapOpSrc) && !/passkeySessies: \{ \.\.\.\(r\.passkeySessies \|\| \{\}\), \[sessieId\]/.test(stapOpSrc));
  const kern = lees('backend/apparaat-bevestiging/kern.ts');
  check('kern: het juiste symbool gaat alleen naar A (publiek(r, false) naar B en de stroom)', kern.includes("publiceer(auth.user.id, { soort: 'apparaat.verzoek', verzoek: publiek(rij, false) }") && kern.includes('return publiek(rij, true,'));
  check('kern: één atomische update wacht → bevestigd/geweigerd; aftelling en zelfde-anker op de server', kern.includes("WHERE id = $1 AND stand = 'wacht' RETURNING id`") && kern.includes("throw new Error('TE_SNEL')") && kern.includes("throw new Error('ZELFDE_APPARAAT')"));

  // ------------------------------------------------------------------ F. teksten en opmaak
  const bronnen = ['src/apparaat-bevestiging/StapOpKanaal.tsx', 'src/apparaat-bevestiging/Luisteraar.tsx', 'src/apparaat-bevestiging/InstellingenSectie.tsx', 'src/apparaat-bevestiging/BeheerSectie.tsx', 'src/apparaat-bevestiging/teksten.ts'].map(lees).join('\n');
  const zichtbaar = [...bronnen.matchAll(/tr\(lang,\s*'([^']*)',\s*'([^']*)'\)/g)].flatMap((m) => [m[1], m[2]]);
  check('zichtbare teksten gevonden (tr(lang, uk, nl))', zichtbaar.length > 60);
  const engels = zichtbaar.filter((s) => /\b(passkey|device|confirm|approve|login|settings|please|click here)\b/i.test(s));
  check('geen Engelse woorden in zichtbare teksten («ключ доступу / toegangssleutel», niet «passkey»)', engels.length === 0, engels.slice(0, 3).join(' | '));
  const css = lees('src/apparaat-bevestiging/apparaat.css');
  const regels = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), decl: m[2] }));
  check('CSS: geen kale input{width:100%} die een vinkje oprekt', !regels.some((r) => /(^|,)\s*[^,]*\binput\s*$/.test(r.sel) && !/:not\([^)]*checkbox/.test(r.sel) && /width:100%/.test(r.decl)));
  const opac = regels.filter((r) => /(^|;)\s*opacity\s*:\s*(0?\.\d+|0)\s*(;|$)/.test(r.decl));
  check('CSS: opacity < 1 alleen op :disabled (WCAG 1.4.3)', opac.every((r) => r.sel.split(',').every((s) => /:disabled/.test(s))), opac.map((r) => r.sel).join(' | '));
  check('CSS: kleuren via paletvariabelen (--panel/--text/--muted/--line/--accent), donker thema zonder eigen uitzondering nodig', /var\(--panel/.test(css) && /var\(--muted/.test(css) && /var\(--line/.test(css) && /var\(--accent/.test(css));
  const routesSrc = lees('backend/apparaat-bevestiging/routes.ts');
  check('routes: foutcodes met passende status (TE_SNEL 425, VERLOPEN 410, RATE_LIMITED 429)', /TE_SNEL: 425/.test(routesSrc) && /VERLOPEN: 410/.test(routesSrc) && /RATE_LIMITED: 429/.test(routesSrc));

  return einde();
}
