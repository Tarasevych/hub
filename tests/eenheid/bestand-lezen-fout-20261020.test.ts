// Eigenaar 20.10.2026: het uploaden van een pakket op admin.tarasevych.com/updates eindigde met
//   «Причина невідома: цього коду сайт не знає. Сервер повернув NotReadableError без пояснення … pakket · спроба 2».
// Twee keer fout: de server gaf die code NIET (NotReadableError is een DOMException van de File API van de BROWSER), en de
// oorzaak is wél bekend — de browser kon het gekozen bestand niet meer van de schijf lezen (verplaatst, hernoemd, overschreven,
// «op aanvraag» in OneDrive/Google Drive, netwerkschijf, virusscanner).
//
// Deze test bewijst:
//   1. elk lezen van een bestand gaat door shared/bestand-lezen.ts (geen rauwe arrayBuffer/FileReader meer op gekozen bestanden);
//   2. NotReadableError en de andere namen van de File API geven een CONCRETE tweetalige tekst met oorzaak én handeling;
//   3. een ONBEKENDE naam van een DOMException geeft een eerlijke algemene tekst (wat er gebeurde + wat te doen), maar nooit
//      «сервер повернув …» en nooit «Причина невідома»;
//   4. de voortgang van een upload blijft bewaard en hervatten gebeurt bij dezelfde offset;
//   5. deze codes gelden in shared/foutuitleg.ts NIET als servercodes (geen HTTP-label, geen «onbekende oorzaak»).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  BESTAND_FOUTNAMEN, BESTAND_LEZEN, bestandFoutNaam, bestandLeesNaam, bestandLeesUitleg, bestandLeesfoutCode, codeLabel,
  isBestandLeesfout, legUit, regelTekst, type Feiten,
} from '../../shared/foutuitleg';
import { BestandLeesfout, bestandLeesfout, isLeesfout, leesAlles, leesDeel, leesKop, leesSha256, metLeesfout } from '../../shared/bestand-lezen';
import { foutTekst as uitrolFoutTekst } from '../../src/uitrol/fouten';

const lees = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Alleen wat de gebruiker kan zien: commentaarregels eruit (daar mag de naam van een DOMException als uitleg staan). */
const zonderCommentaar = (p: string) => lees(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((r) => !/^\s*(\/\/|\*)/.test(r)).join('\n');
/** Een DOMException zoals de browser hem werpt (naam + boodschap). */
const domFout = (naam: string) => { const e = new Error(`The requested file could not be read (${naam})`); e.name = naam; return e; };
/**
 * Een bestand dat vanaf `faalVanaf` niet meer te lezen is: precies wat er gebeurt als het bestand tijdens de upload wordt
 * verplaatst, hernoemd of door OneDrive «gedehydrateerd».
 */
const kapotBestand = (grootte: number, faalVanaf: number, naam = 'NotReadableError') => ({
  name: 'mijn-ruimte-20261020-153026.tar.gz', size: grootte,
  slice: (van = 0, tot = grootte) => ({
    size: tot - van,
    arrayBuffer: async () => { if (van >= faalVanaf) throw domFout(naam); return new ArrayBuffer(Math.max(0, tot - van)); },
  }),
  arrayBuffer: async () => { if (faalVanaf <= grootte) throw domFout(naam); return new ArrayBuffer(grootte); },
} as unknown as File);
const heelBestand = (grootte: number) => kapotBestand(grootte, grootte + 1);

export async function main(): Promise<number> {
  const { check, einde } = checker('bestand-lezen-fout-20261020');

  // ---------------------------------------------------------------- 1. elk lezen door één poort
  const poort = lees('shared/bestand-lezen.ts');
  check('shared/bestand-lezen.ts is de poort: elke leesfunctie gaat door metLeesfout en werpt een BestandLeesfout',
    /export async function metLeesfout/.test(poort) && /export class BestandLeesfout/.test(poort)
    && ['leesDeel', 'leesKop', 'leesAlles', 'leesSha256', 'leesBase64', 'leesDataUrl', 'leesTekst'].every((n) => new RegExp(`export const ${n}`).test(poort)));

  // Geen rauw lezen meer van een bestand dat de GEBRUIKER koos (dit zijn de plekken die een File/Blob van de schijf lezen).
  const gekozenBestand = [
    'src/uitrol/Upload.tsx', 'src/uitrol/PakketActies.tsx', 'src/platform/tar-lezen.ts', 'src/platform/client.ts',
    'src/DriveBrowser.tsx', 'src/CloudFunctioneelWeergave.tsx', 'src/MailNieuwBerichtDialoog.tsx', 'src/MailSnelleInstellingen.tsx',
    'src/CanoniekAccountMenu.tsx',
  ];
  const rauw = gekozenBestand.filter((p) => { const s = lees(p); return /new FileReader/.test(s) || /\.arrayBuffer\(\)/.test(s) || /(?<!metLeesfout\(file,\s*\(\)\s*=>\s*)createImageBitmap\(/.test(s.replace(/metLeesfout\(file,\(\)=>createImageBitmap\(file\)\)/g, '')); });
  check(`alle ${gekozenBestand.length} plekken die een gekozen bestand lezen, doen dat via shared/bestand-lezen.ts`, rauw.length === 0, rauw.join(', '));
  const zonderPoort = gekozenBestand.filter((p) => !/shared\/bestand-lezen/.test(lees(p)));
  check('die plekken importeren de poort ook echt', zonderPoort.length === 0, zonderPoort.join(', '));

  // de poort zet elke browserfout om in één code
  const code = bestandLeesfoutCode(domFout('NotReadableError'));
  check('een DOMException wordt één code: BESTAND_LEZEN|<naam>', code === `${BESTAND_LEZEN}|NotReadableError` && isBestandLeesfout(code) && bestandLeesNaam(code) === 'NotReadableError', code);
  check('een al omgezette fout verandert niet meer (geen dubbele voorvoegsels)', bestandLeesfoutCode(new Error(code)) === code && bestandLeesfoutCode(bestandLeesfout(domFout('NotFoundError'))) === `${BESTAND_LEZEN}|NotFoundError`);
  check('bestandFoutNaam leest de naam uit de fout én uit de code', bestandFoutNaam(domFout('SecurityError')) === 'SecurityError' && bestandFoutNaam(new Error(`${BESTAND_LEZEN}|AbortError`)) === 'AbortError');
  const fout = bestandLeesfout(domFout('NotReadableError'), { name: 'pakket.tar.gz' });
  check('BestandLeesfout bewaart de naam van het bestand, de naam van de DOMException en de oorspronkelijke fout',
    fout instanceof BestandLeesfout && fout.bestand === 'pakket.tar.gz' && fout.bestandsnaamFout === 'NotReadableError' && isLeesfout(fout) && !isLeesfout(new Error('HTTP_502')));

  // de leesfuncties zelf: wat de browser werpt, komt er als BestandLeesfout uit
  const kapot = kapotBestand(1024, 0);
  for (const [naam, run] of [['leesDeel', () => leesDeel(kapot, 0, 512)], ['leesKop', () => leesKop(kapot)], ['leesAlles', () => leesAlles(kapot)], ['leesSha256', () => leesSha256(kapot)], ['metLeesfout', () => metLeesfout(kapot, async () => { throw domFout('NotReadableError'); })]] as Array<[string, () => Promise<unknown>]>) {
    let gevangen: unknown = null;
    try { await run(); } catch (e) { gevangen = e; }
    check(`${naam}: een DOMException van de schijf komt eruit als BestandLeesfout met de juiste code`,
      gevangen instanceof BestandLeesfout && (gevangen as Error).message === `${BESTAND_LEZEN}|NotReadableError`, String((gevangen as Error | null)?.message));
  }
  const goed = heelBestand(16);
  check('een leesbaar bestand wordt gewoon gelezen (de poort verandert niets aan het geslaagde pad)', (await leesKop(goed, 8)).length === 8 && (await leesAlles(goed)).length === 16);

  // ---------------------------------------------------------------- 2. concrete tekst per naam, in beide talen
  const verwacht: Array<[string, string, string]> = [
    ['NotReadableError', 'NotReadableError', 'OneDrive'],
    ['NotFoundError', 'NotFoundError', 'verplaatst'],
    ['SecurityError', 'SecurityError', 'netwerkschijf'],
    ['AbortError', 'AbortError', 'afgebroken'],
    ['EncodingError', 'EncodingError', 'decoderen'],
    ['InvalidStateError', 'InvalidStateError', 'gewijzigd'],
  ];
  const zwak: string[] = [];
  for (const [naam, inUk, inNl] of verwacht) {
    const u = bestandLeesUitleg('uk', `${BESTAND_LEZEN}|${naam}`), n = bestandLeesUitleg('nl', naam);
    const ok = u.bekend && n.bekend && u.naam === naam
      && u.waarom.includes(inUk) && n.waarom.includes(inNl)
      && u.waarom.length > 60 && n.waarom.length > 60
      // de handeling noemt een echte stap (opnieuw kiezen / naar een lokale map kopiëren), niet «надішліть у підтримку»
      && /оберіть|Оберіть|Скопіюйте|Знайдіть/.test(u.doen) && /[Kk]ies|Kopieer|Zoek/.test(n.doen)
      // geen servertaal: de server had hier geen deel in
      && !/Сервер повернув|сервер повернув/.test(u.waarom) && !/De server gaf/.test(n.waarom)
      && !/Причина невідома/.test(u.waarom) && !/oorzaak is onbekend/.test(n.waarom);
    if (!ok) zwak.push(naam);
  }
  check(`elk van de ${verwacht.length} namen van de File API krijgt een concrete tweetalige tekst met oorzaak én handeling`, zwak.length === 0, zwak.join(', '));
  check('BESTAND_FOUTNAMEN noemt precies die namen (één bron, ook voor overzichten)',
    verwacht.every(([n]) => BESTAND_FOUTNAMEN.includes(n)) && BESTAND_FOUTNAMEN.length === verwacht.length, BESTAND_FOUTNAMEN.join(', '));
  const nr = bestandLeesUitleg('uk', `${BESTAND_LEZEN}|NotReadableError`);
  check('NotReadableError noemt de ECHTE oorzaken (переміщено/перейменовано/хмарна тека/антивірус) en de lokale map als oplossing',
    /перемістили/.test(nr.waarom) && /перейменували/.test(nr.waarom) && /OneDrive/.test(nr.waarom) && /антивірус/.test(nr.waarom) && /Downloads/.test(nr.doen), `${nr.waarom} | ${nr.doen}`);

  // ---------------------------------------------------------------- 3. onbekende naam: eerlijk, maar niet «сервер»
  const vreemd = bestandLeesUitleg('uk', `${BESTAND_LEZEN}|HeelNieuweFout`), vreemdNl = bestandLeesUitleg('nl', `${BESTAND_LEZEN}|HeelNieuweFout`);
  check('onbekende naam van een DOMException: eerlijke algemene tekst die zegt WAT er gebeurde, met de rauwe naam erin',
    !vreemd.bekend && vreemd.waarom.includes('HeelNieuweFout') && /не зміг прочитати/.test(vreemd.waarom) && vreemd.doen.length > 20
    && !vreemdNl.bekend && vreemdNl.waarom.includes('HeelNieuweFout') && /niet volledig lezen/.test(vreemdNl.waarom), `${vreemd.waarom} | ${vreemd.doen}`);
  check('onbekende naam: NOOIT «Сервер повернув …» en nooit «Причина невідома» (de oorzaak is bekend: de browser kon niet lezen)',
    !/Сервер повернув/.test(vreemd.waarom) && !/Причина невідома/.test(vreemd.waarom) && !/сервер повернув/i.test(vreemd.doen)
    && !/De server gaf \S+ zonder uitleg/.test(vreemdNl.waarom) && !/oorzaak is onbekend/.test(vreemdNl.waarom), vreemd.waarom);
  check('onbekende naam: de tekst zegt uitdrukkelijk dat de SERVER deze code niet gaf',
    /сервер цього коду не повертав/.test(vreemd.waarom) && /de server gaf deze code niet/.test(vreemdNl.waarom), vreemd.waarom);

  // ---------------------------------------------------------------- 4. voortgang blijft bewaard, hervatten bij dezelfde offset
  // Dit is precies de lus van src/uitrol/Upload.tsx: lezen → stuk versturen → offset van de server onthouden.
  const STUK = 256, GROOTTE = 1024;
  const server = { ontvangen: 0 };
  const upload = async (f: File) => {
    let offset = server.ontvangen;
    while (offset < f.size) {
      let deel: Uint8Array;
      try { deel = await leesDeel(f, offset, Math.min(f.size, offset + STUK)); }
      catch (e) { return { gestopt: offset, procent: Math.round((offset / f.size) * 100), code: bestandLeesfoutCode(e) }; }
      server.ontvangen = offset + deel.length; offset = server.ontvangen;
    }
    return { gestopt: offset, procent: 100, code: '' };
  };
  const eerste = await upload(kapotBestand(GROOTTE, 512));
  check('leesfout halverwege: de upload stopt bij de offset die de server al heeft (niets verloren) en meldt de leescode',
    eerste.gestopt === 512 && server.ontvangen === 512 && eerste.procent === 50 && eerste.code === `${BESTAND_LEZEN}|NotReadableError`, JSON.stringify(eerste));
  const tweede = await upload(heelBestand(GROOTTE));
  check('dezelfde keuze daarna: hervatten begint bij DEZELFDE offset (512) en de upload loopt af',
    tweede.gestopt === GROOTTE && tweede.procent === 100 && server.ontvangen === GROOTTE, JSON.stringify(tweede));

  // de wizard zelf: lezen binnen de bescherming, voortgang bewaren, en de knop «Обрати файл ще раз»
  const upl = lees('src/uitrol/Upload.tsx');
  check('Upload.tsx: het lezen van een stuk staat BINNEN try/catch (hier vloog de DOMException er rauw uit)',
    /try \{ deel = await leesDeel\(f, offset, Math\.min\(f\.size, offset \+ stuk\)\); \}/.test(upl) && /catch \(e\) \{\s*\n\s*if \(!isLeesfout\(e\)\) throw e;/.test(upl), '');
  check('Upload.tsx: bij een leesfout wordt de voortgang (procent + verstuurde bytes) vastgelegd en de stand opnieuw geladen',
    /setLeesfout\(\{ code: bestandLeesfoutCode\(e\), procent: Math\.round\(\(offset \/ f\.size\) \* 100\), verstuurd: offset \}\)/.test(upl) && /setLeesfout\([\s\S]{0,200}?\);\s*\n\s*await laden\(\);/.test(upl), '');
  check('Upload.tsx: de melding zegt meteen dat het hervatten bij het stoppunt verdergaat',
    /продовжиться з місця зупинки/.test(upl) && /gaat verder waar hij stopte/.test(upl), '');
  check('Upload.tsx: er is een knop «Обрати файл ще раз» die het bestandsvenster opent en daarna zelf hervat',
    /Обрати файл ще раз/.test(upl) && /Bestand opnieuw kiezen/.test(upl) && /data-ut-opnieuw-kiezen/.test(upl)
    && /invoer\.current\?\.click\(\)/.test(upl) && /setHervatWens/.test(upl) && /if \(!hervatWens \|\| !hervatbaar/.test(upl), '');
  check('Upload.tsx: goedkope leescontrole (512 bytes) vóór «voorstel/begin», zodat er geen half voorstel op de server blijft',
    upl.indexOf('await leesKop(f, 512)') > 0 && upl.indexOf('await leesKop(f, 512)') < upl.indexOf('/api/uitrol/voorstel/begin'), '');
  check('Upload.tsx: ook het kiezen van een bestand vangt leesfouten (anders bleef «Читаю архів…» staan)',
    /const s = herkenBestand\(f\.name, await bestandKop\(f\)\);/.test(upl) && /if \(!isLeesfout\(e\)\) throw e;\s*\n\s*\/\//.test(upl) && /setBezigLezen\(false\); setSoort\(null\); setAnalyse\(null\);/.test(upl), '');
  const tar = lees('src/platform/tar-lezen.ts');
  check('tar-lezen.ts: een LEESfout wordt niet meer «архів пошкоджений» (TAR_ONGELDIG), maar gaat ongewijzigd door',
    /if \(isLeesfout\(e\)\)/.test(tar) && /throw e;/.test(tar) && /leesSha256\(bestand\)/.test(tar) && /leesDeel\(bestand, 0, 2\)/.test(tar), '');
  const pakket = zonderCommentaar('src/uitrol/PakketActies.tsx');
  check('PakketActies.tsx: een leesfout bij de sha256-controle zegt dat er NIET gecontroleerd is (geen stil «sha256 збігається»)',
    !/catch\(\(\) => ''\)/.test(pakket) && /sha256 НЕ перевірено/.test(pakket) && /NIET gecontroleerd/.test(pakket), '');

  // ---------------------------------------------------------------- 5. in foutuitleg.ts gelden deze codes niet als servercodes
  check('codeLabel: een leesfout toont de naam van de DOMException, nooit een HTTP-getal',
    codeLabel({ code: `${BESTAND_LEZEN}|NotReadableError` }) === 'NotReadableError' && !/HTTP/.test(codeLabel({ code: `${BESTAND_LEZEN}|NotReadableError` })), codeLabel({ code: `${BESTAND_LEZEN}|NotReadableError` }));
  check('regelTekst kent deze codes (dus geen «onbekende code»-pad), ook een nieuwe naam',
    !!regelTekst('uk', `${BESTAND_LEZEN}|NotReadableError`)?.waarom.includes('NotReadableError') && !!regelTekst('nl', `${BESTAND_LEZEN}|ZomaarNieuw`)?.doen);
  const feiten = (code: string): Feiten => ({ operatie: ['Завантаження пакета', 'Pakket uploaden'], dienst: 'admin', route: 'pakket', code, status: 0, tijd: Date.UTC(2026, 9, 20, 13, 27, 7), poging: 2, uitrol: null, zone: 'UTC' });
  const u = legUit('uk', feiten(`${BESTAND_LEZEN}|NotReadableError`));
  check('legUit: een leesfout is ZEKER (de oorzaak is bekend) en de tekst noemt het bestand, niet de server',
    u.zeker && u.codeLabel === 'NotReadableError' && u.waarom.includes('не може прочитати цей файл')
    && !/Причина невідома/.test(u.waarom) && !/Сервер повернув/.test(u.waarom), u.waarom);
  const uOnbekend = legUit('uk', feiten(`${BESTAND_LEZEN}|ZomaarNieuw`));
  check('legUit: ook een onbekende naam blijft zeker en eerlijk, zonder «Сервер повернув»',
    uOnbekend.zeker && uOnbekend.waarom.includes('ZomaarNieuw') && !/Сервер повернув/.test(uOnbekend.waarom) && !/Причина невідома/.test(uOnbekend.waarom), uOnbekend.waarom);
  const melding = uitrolFoutTekst('uk', `${BESTAND_LEZEN}|NotReadableError`, { dienst: 'admin', route: 'pakket', tijd: Date.UTC(2026, 9, 20, 13, 27, 7), poging: 2, zone: 'UTC' });
  check('het meldingsvak van «Оновлення сервера» geeft nu de echte oorzaak + handeling (en geen «цього коду сайт не знає»)',
    melding.includes('не може прочитати цей файл') && melding.includes('Downloads') && !melding.includes('Причина невідома')
    && !melding.includes('Сервер повернув') && melding.includes('NotReadableError') && melding.includes('спроба 2'), melding);
  const bron = lees('shared/foutuitleg.ts');
  check('shared/foutuitleg.ts blijft de enige bron: de teksten van de File API staan daar, niet in de pagina’s',
    /BESTAND_REGELS/.test(bron) && /export function bestandLeesUitleg/.test(bron) && /if \(isBestandLeesfout\(c\)\) return bestandRegel/.test(bron), '');
  const kopieen = ['src/uitrol/Upload.tsx', 'src/uitrol/fouten.ts', 'src/DriveBrowser.tsx', 'src/CloudFunctioneelWeergave.tsx', 'src/MailNieuwBerichtDialoog.tsx', 'src/MailSnelleInstellingen.tsx', 'src/CanoniekAccountMenu.tsx']
    .filter((p) => /NotReadableError|NotFoundError|EncodingError/.test(zonderCommentaar(p)));
  check('geen tweede tabel: geen enkele pagina schrijft zelf een tekst per naam van de File API', kopieen.length === 0, kopieen.join(', '));

  return einde();
}
