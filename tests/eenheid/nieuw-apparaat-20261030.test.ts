// UI-014 fase 2A (30.10.2026): melding «Новий вхід / новий пристрій» (backend/nieuw-apparaat.ts), code vanaf ander apparaat,
// herstelcode gebruikt, en de nieuwe soorten in het uitlegregister. Vereist een gemigreerde DB (DATABASE_URL) zoals de andere tests.
import { readFileSync } from 'node:fs';
import { REGISTER, uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import type { V2Melding } from '../../shared/meldingen-v2/groepering';
import { registreerMelder } from '../../backend/melder';
import { alsBekendMarkeren, apparaatSleutel, naAanmelding, nieuwApparaatTekst, MELDING_SOORT_NIEUW_APPARAAT } from '../../backend/nieuw-apparaat';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

const NU = Date.parse('2026-10-30T09:00:00+01:00');
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const mk = (o: Partial<V2Melding>): V2Melding => ({ id: 's:1', dienst: 'identity', ernst: 'waarschuwing' as never, titel: 'x', tijd: NU, gelezen: false, ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('nieuw-apparaat-20261030');
  // ---- tekst (puur)
  const t = nieuwApparaatTekst({ email: 'eigenaar@example.com', label: 'Safari/iOS', methode: 'google', locatie: { city: 'Gent', country: 'BE' }, tijd: NU });
  check('tekst: wie, apparaat, regio, Brusselse tijd, methode (uk)', /eigenaar@example\.com/.test(t.tekst) && /Safari\/iOS/.test(t.tekst) && /Gent, BE/.test(t.tekst) && /Брюссель/.test(t.tekst) && /спосіб: Google/.test(t.tekst));
  check('tekst: 09:00 Europe/Brussels', /09:00/.test(t.tekst), t.tekst);
  check('tekst: geen IP en geen volledige user-agent', !/\d+\.\d+\.\d+\.\d+/.test(t.tekst) && !/Mozilla/.test(t.tekst));
  check('tekst: zonder regio eerlijk «регіон невідомий»', /регіон невідомий/.test(nieuwApparaatTekst({ email: 'a@b.c', label: 'x', methode: 'code', tijd: NU }).tekst));
  check('tekst: regio zonder rare tekens (geen injectie)', !/[<>]/.test(nieuwApparaatTekst({ email: 'a@b.c', label: 'x', methode: 'passkey', locatie: { city: '<script>' }, tijd: NU }).tekst));

  // ---- register
  const ids = REGISTER.map((r) => r.id);
  for (const id of ['nieuw-apparaat', 'code-ander-apparaat', 'herstelcode', 'passkey-gewijzigd']) check(`register bevat ${id}`, ids.includes(id));
  check('register: nieuw-apparaat vóór beveiliging', ids.indexOf('nieuw-apparaat') < ids.indexOf('beveiliging'));
  const na = uitlegVoor(mk({ soort: MELDING_SOORT_NIEUW_APPARAAT, titel: t.titel, tekst: t.tekst, link: 'https://id.tarasevych.com/sessions?apparaat=00000000-0000-0000-0000-000000000001' }));
  check('melding nieuw apparaat → soort nieuw-apparaat, risico hoog', na.id === 'nieuw-apparaat' && na.risico === 'hoog', na.id);
  check('… acties: «Це був я» + «Це не я — завершити сеанс…» (gevaarlijk, link naar /sessions)', na.acties.some((a) => a.soort === 'dit-was-ik' && a.label[0] === 'Це був я') && na.acties.some((a) => a.soort === 'niet-ik' && a.gevaarlijk && /\/sessions/.test(a.href!(mk({})) || '') && /завершити сеанс/.test(a.label[0])));
  check('passkey toegevoegd → passkey-gewijzigd', uitlegVoor(mk({ soort: 'security', titel: 'Новий passkey / Nieuwe passkey', tekst: '«YubiKey» додано до способів входу.' })).id === 'passkey-gewijzigd');
  check('passkey verwijderd → passkey-gewijzigd', uitlegVoor(mk({ soort: 'security', titel: 'Passkey видалено / Passkey verwijderd', tekst: '«X» більше не є способом входу.' })).id === 'passkey-gewijzigd');
  check('goedkeur-passkey (security_warning) blijft bij uitrol-recht/beveiliging', uitlegVoor(mk({ soort: 'security_warning', titel: 'Це були ви? Право схвалювати оновлення відкликано', tekst: 'відкликано оновлення' })).id === 'uitrol-recht-ingetrokken');
  check('herstelcodes vervangen → herstelcode', uitlegVoor(mk({ soort: 'access_recovery_rotated', titel: 'Коди відновлення замінено' })).id === 'herstelcode');
  check('herstelcode gebruikt → herstelcode', uitlegVoor(mk({ soort: 'access_recovery_code_used', titel: 'Використано код відновлення' })).id === 'herstelcode');
  check('code ander apparaat → code-ander-apparaat', uitlegVoor(mk({ soort: 'security', titel: 'Код доступу «Олена» використано з іншого пристрою' })).id === 'code-ander-apparaat');
  check('code voor het eerst gebruikt (security) valt NIET op code-ander-apparaat', uitlegVoor(mk({ soort: 'security', titel: 'Код доступу «Олена» використано вперше' })).id !== 'code-ander-apparaat');

  // ---- statisch: de inlogflow wacht nooit op de melding
  const idx = readFileSync('backend/index.ts', 'utf8');
  const hooks = idx.match(/void naAanmelding\(/g) || [];
  check('index.ts: 3 aanroepen na geslaagde aanmelding, alle «void … .catch»', hooks.length === 3 && !/await naAanmelding\(/.test(idx) && (idx.match(/void naAanmelding\([^;]*\.catch\(\(\)=>undefined\);/g) || []).length === 3);
  check('index.ts: hooks staan ná session.created / account.replaced / TRANSACTION_COMPLETE', /'owner\.redirect\.session\.created'[^;]*\);void naAanmelding/.test(idx) && /'owner\.redirect\.account\.replaced'[^;]*\);void naAanmelding/.test(idx) && /'TRANSACTION_COMPLETE','success'[^;]*flowMode:'popup'\}\);void naAanmelding/.test(idx));
  check('toegangscodes/toegangslaag: niet afgewacht', /void codeAnderApparaat\(/.test(readFileSync('backend/toegangscodes.ts', 'utf8')) && /if\(melden\)void herstelcodeGebruiktMelden\(/.test(readFileSync('backend/toegangslaag.ts', 'utf8')) && /auth\.service,false\);/.test(readFileSync('backend/toegangslaag.ts', 'utf8')));
  const mig = readFileSync('migrations/0192_bekende_apparaten.sql', 'utf8');
  check('migratie 0192: RLS + policy, geen user-agent/IP-kolom', /ENABLE ROW LEVEL SECURITY/.test(mig) && !/ip_hash|user_agent/.test(mig.replace(/--.*$/gm, '')));

  // ---- DB: dedupe en basis
  const meldingen: Array<{ userId: string; kind: string; title: string; message: string; link?: string }> = [];
  registreerMelder(async (userId, _e, kind, title, message, link) => { meldingen.push({ userId, kind, title, message, link }); });
  const uid = `test-na-${Date.now()}`;
  const aan = { vlagAan: async () => true, nu: () => NU };
  const sys = getPool('systeem');
  try {
    check('vlag uit → niets, geen rij', (await naAanmelding({ userId: uid, email: 'e@x.be', ua: CHROME_WIN, methode: 'google' }, { vlagAan: async () => false })) === 'uit'
      && Number((await sys.query('SELECT count(*)::int n FROM app.bekende_apparaten WHERE user_id=$1', [uid])).rows[0].n) === 0);
    check('eerste apparaat ooit → stille basis, geen melding', (await naAanmelding({ userId: uid, email: 'e@x.be', ua: CHROME_WIN, methode: 'google' }, aan)) === 'basis' && meldingen.length === 0);
    check('zelfde apparaat opnieuw → bekend, geen melding', (await naAanmelding({ userId: uid, email: 'e@x.be', ua: CHROME_WIN, methode: 'google' }, aan)) === 'bekend' && meldingen.length === 0);
    const r = await naAanmelding({ userId: uid, email: 'e@x.be', ua: SAFARI_IOS, locatie: { city: 'Antwerpen', country: 'BE' }, methode: 'google' }, aan);
    check('nieuw apparaat → één melding', r === 'gemeld' && meldingen.length === 1 && meldingen[0].kind === 'security_warning', r);
    const link = meldingen[0]?.link || '';
    check('… link naar sessiebeheer met apparaat-id', /^https:\/\/id\.tarasevych\.com\/sessions\?apparaat=[0-9a-f-]{36}$/.test(link), link);
    check('… tekst met Safari/iOS + Antwerpen', /Safari\/iOS/.test(meldingen[0]?.message || '') && /Antwerpen/.test(meldingen[0]?.message || ''));
    check('nieuw apparaat tweede keer → geen tweede melding', (await naAanmelding({ userId: uid, email: 'e@x.be', ua: SAFARI_IOS, methode: 'google' }, aan)) === 'bekend' && meldingen.length === 1);
    const id = link.split('apparaat=')[1];
    check('«Це був я»: eigen apparaat markeren', await alsBekendMarkeren(uid, id));
    check('«Це був я»: ander account kan het niet', !(await alsBekendMarkeren(`${uid}-ander`, id)));
    check('«Це був я»: ongeldige id → false', !(await alsBekendMarkeren(uid, "x' OR 1=1")));
    check('sleutel bevat geen leesbare UA', /^[0-9a-f]{32}$/.test(apparaatSleutel(uid, 'Chrome/Windows')));
    // faalt stil: kapotte vlagfunctie
    check('fout in vlag → «fout», gooit niet', (await naAanmelding({ userId: uid, email: '', ua: CHROME_WIN, methode: 'google' }, { vlagAan: async () => { throw new Error('kapot'); } })) === 'fout');
    await sys.query('DELETE FROM app.bekende_apparaten WHERE user_id LIKE $1', [`${uid}%`]);
  } finally { registreerMelder(null as never); await closePool(); }
  return einde();
}
