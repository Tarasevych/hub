// POSTA-LEZER (21.11.2026, migratie 0307): leesvenster blijft open bij een laadfout, UTF-8-terugval, ankerrail bij zwevend venster.
// Alle drie de vlaggen staan standaard UIT; deze tests controleren beide standen.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';
import { decodeMailPartText, isEnkelbyteTekenset, mailUtf8TerugvalAan, strikteUtf8MetMeerbyte, zetMailUtf8Terugval } from '../../backend/mail-tekst-normalisatie';
import { mailUtf8TerugvalVerversen, zetMailUtf8VlagLezer } from '../../backend/mail-utf8-terugval-vlag';
import { lezerFoutAntwoord } from '../../backend/google-suite-mail-browser';
import { LEZER_FOUT_TEKST, lezerFoutUit, soortVan, statusKlasse } from '../../src/mail/lezer-fout';

const b64 = (b: Buffer) => b.toString('base64url');
const VERBODEN = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const DEELWOORD = /[а-яіїєґ]+(уч|юч|ач|яч)(ий|а|е|і|ого|ої|им|их|ому|ій|у)\b/iu;

export async function main(): Promise<number> {
  const { check, einde } = checker('posta-lezer');

  // 1) UTF-8-terugval
  const utf8 = Buffer.from('Wir möchten Ihnen danken — ß, ü, €', 'utf8');
  const latijn = Buffer.from('Wir m\u00f6chten Ihnen danken, Gr\u00fc\u00dfe', 'latin1');
  zetMailUtf8Terugval(false);
  check('vlag uit (standaard): oud gedrag, utf-8-bytes met iso-8859-1 geven «mÃ¶chten»', mailUtf8TerugvalAan() === false && decodeMailPartText(b64(utf8), 'text/plain; charset=iso-8859-1').includes('mÃ¶chten'));
  check('vlag uit: us-ascii ongewijzigd (oud gedrag)', decodeMailPartText(b64(utf8), 'text/plain; charset=us-ascii') === new TextDecoder('us-ascii').decode(utf8));
  zetMailUtf8Terugval(true);
  check('vlag aan: iso-8859-1 met utf-8-bytes → «möchten»', decodeMailPartText(b64(utf8), 'text/plain; charset=iso-8859-1') === 'Wir möchten Ihnen danken — ß, ü, €');
  check('vlag aan: windows-1252 en "us-ascii" tussen aanhalingstekens → utf-8', decodeMailPartText(b64(utf8), 'text/html; charset=windows-1252').includes('möchten') && decodeMailPartText(b64(utf8), 'text/plain; charset="us-ascii"').includes('möchten'));
  check('vlag aan: echte Latijn-1 blijft Latijn-1 (geen geldige utf-8)', decodeMailPartText(b64(latijn), 'text/plain; charset=iso-8859-1') === 'Wir möchten Ihnen danken, Grüße');
  check('vlag aan: zuivere ASCII ongewijzigd', decodeMailPartText(b64(Buffer.from('Hallo wereld')), 'text/plain; charset=us-ascii') === 'Hallo wereld');
  check('vlag aan: andere tekenset (koi8-r) niet aangeraakt', decodeMailPartText(b64(Buffer.from([0xf0, 0xd2, 0xc9])), 'text/plain; charset=koi8-r') === new TextDecoder('koi8-r').decode(Buffer.from([0xf0, 0xd2, 0xc9])));
  check('vlag aan: opgegeven utf-8 blijft utf-8', decodeMailPartText(b64(utf8), 'text/plain; charset=utf-8').includes('möchten'));
  check('optie per aanroep wint van de schakelaar', decodeMailPartText(b64(utf8), 'text/plain; charset=iso-8859-1', { utf8Terugval: false }).includes('mÃ¶chten'));
  check('hulpfuncties: enkelbyte-labels en strikte utf-8', isEnkelbyteTekenset('ISO-8859-1') && isEnkelbyteTekenset('cp1252') && !isEnkelbyteTekenset('utf-8') && strikteUtf8MetMeerbyte(Buffer.from('abc')) === null && strikteUtf8MetMeerbyte(Buffer.from([0xc3, 0x28])) === null);
  zetMailUtf8VlagLezer(async () => true);
  const aan = await mailUtf8TerugvalVerversen();
  zetMailUtf8VlagLezer(async () => { throw new Error('geen db'); });
  const uitBijFout = await mailUtf8TerugvalVerversen();
  check('vlaglezer: aan zet de schakelaar, fout = uit', aan === true && uitBijFout === false && mailUtf8TerugvalAan() === false);

  // 2) Leesvenster-fout: server
  const fout = (m: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(m), extra);
  const abort = Object.assign(new Error('afgebroken'), { name: 'AbortError' });
  check('server: Google 401 → 403 MAIL_BRIEF_GEEN_TOEGANG (bewust geen 401)', lezerFoutAntwoord(fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 401 }))?.status === 403);
  check('server: Google 403 → 403', lezerFoutAntwoord(fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 403 }))?.code === 'MAIL_BRIEF_GEEN_TOEGANG');
  check('server: ontbrekende of ingetrokken toestemming → 403', lezerFoutAntwoord(fout('GOOGLE_SUITE_REFRESH_TOKEN_MISSING'))?.status === 403 && lezerFoutAntwoord(fout('GOOGLE_SUITE_SCOPE_INCOMPLETE'))?.status === 403);
  check('server: afgebroken na wachttijd → 424 MAIL_BRIEF_TIJD_OM (geen 504: geen strook «server ligt eruit»)', lezerFoutAntwoord(abort)?.status === 424 && lezerFoutAntwoord(abort)?.code === 'MAIL_BRIEF_TIJD_OM');
  check('server: postbus niet gekoppeld → 409', lezerFoutAntwoord(fout('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED'))?.status === 409);
  check('server: 404 van Google → 404', lezerFoutAntwoord(fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 404 }))?.status === 404);
  check('server: overige fout bij Google → 424 MAIL_BRIEF_DIENST_FOUT, 429 → 424 MAIL_BRIEF_TE_VEEL_VERZOEKEN', lezerFoutAntwoord(fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 500 }))?.code === 'MAIL_BRIEF_DIENST_FOUT' && lezerFoutAntwoord('x')?.status === 424 && lezerFoutAntwoord(fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 429 }))?.code === 'MAIL_BRIEF_TE_VEEL_VERZOEKEN');
  const statussen = [abort, fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 500 }), fout('GOOGLE_MAIL_MESSAGE_FAILED', { httpStatus: 401 }), fout('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED'), 'x'].map((f) => lezerFoutAntwoord(f)?.status || 0);
  check('server: met de vlag nooit 401, 502, 503 of 504', statussen.every((n) => ![401, 502, 503, 504].includes(n)), statussen.join(','));
  check('server: kluis en extra bevestiging blijven ongewijzigd (null)', lezerFoutAntwoord(fout('SLEUTELKLUIS_GESLOTEN')) === null && lezerFoutAntwoord(fout('STEP_UP_REQUIRED')) === null);
  const uitlegUk = ['GOOGLE_MAIL_MESSAGE_FAILED', 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED'].map((m) => lezerFoutAntwoord(fout(m, { httpStatus: 403 }))?.uitleg || '').join(' ') + lezerFoutAntwoord(abort)?.uitleg;
  check('server: uitleg in zuiver Oekraïens', !VERBODEN.test(uitlegUk) && !/[A-Za-z]{2,}/.test(uitlegUk.replace(/Google/g, '')));
  const route = readFileSync('backend/google-suite-mail-browser.ts', 'utf8');
  check('server: met de vlag uit blijft het oude antwoord (409/502) bestaan', route.includes("if(fout)return json({error:fout.code,uitleg:fout.uitleg},fout.status)}return error(code,code==='GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED'?409:502)"));
  const idx = readFileSync('backend/index.ts', 'utf8');
  check('server: vlag per gebruiker via flagsBerekenen in backend/index.ts', idx.includes("lezerFoutVlag:async(u)=>(await flagsBerekenen(u as never,['lezer-fout-blijft-open-v1']))[0]?.value===true"));

  // 3) Leesvenster-fout: client
  check('client: ApiError-vorm → status en code', JSON.stringify(lezerFoutUit({ status: 424, message: 'MAIL_BRIEF_TIJD_OM', response: { data: { error: 'MAIL_BRIEF_TIJD_OM' } } })) === JSON.stringify({ status: 424, code: 'MAIL_BRIEF_TIJD_OM', soort: 'tijd' }));
  check('client: 424 zonder bekende code → «google»', soortVan(424) === 'google' && soortVan(424, 'MAIL_BRIEF_TE_VEEL_VERZOEKEN') === 'te-veel');
  check('client: netwerkfout zonder status → «netwerk», geen vreemde tekst als code', lezerFoutUit(new TypeError('verbinding weg')).soort === 'netwerk' && lezerFoutUit(new TypeError('verbinding weg')).code === '');
  check('client: soorten per status', soortVan(401) === 'sessie' && soortVan(403) === 'toegang' && soortVan(404) === 'niet-gevonden' && soortVan(409) === 'postbus' && soortVan(429) === 'te-veel' && soortVan(502) === 'server' && soortVan(418) === 'onbekend');
  check('client: statusklasse in het Oekraïens', statusKlasse(424, 'uk') === 'HTTP 424 · збій служби Google' && statusKlasse(504, 'uk') === 'HTTP 504 · помилка сервера' && statusKlasse(403, 'uk') === 'HTTP 403 · відмова запиту' && statusKlasse(0, 'uk') === 'без відповіді');
  const uk = Object.values(LEZER_FOUT_TEKST).map((t) => t[0]).join(' ');
  check('client: teksten zuiver Oekraïens (geen verboden letters, geen deelwoorden op -учий)', !VERBODEN.test(uk) && !DEELWOORD.test(uk) && !/[A-Za-z]{2,}/.test(uk.replace(/Google/g, '')));
  const gmw = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('client: met de vlag aan geen setDetail(null) maar setLezerFout; zonder vlag het oude pad', gmw.includes('if(lezerFoutVlagRef.current){setLezerFout({...lezerFoutUit(fout),berichtId:messageId,accountId:targetAccountId,draad:knownThreadId})}else{setDetail(null);setThreadMessages([]);setFailure('));
  check('client: foutpaneel met «Спробувати ще раз» opent dezelfde brief opnieuw', gmw.includes('<LezerFoutPaneel lang={lang===\'nl\'?\'nl\':\'uk\'} fout={lezerFout} onOpnieuw={()=>void openMessageById(lezerFout.berichtId,lezerFout.accountId,lezerFout.draad)}/>') && readFileSync('src/mail/lezer-fout.tsx', 'utf8').includes("'Спробувати ще раз'"));
  check('client: nieuwe poging wist de vorige fout', gmw.includes("setDetailLoading(true);setFailure('');setLezerFout(null);"));

  // 4) Ankerrail bij zwevend venster
  check('rail: verborgen bij zwevend alleen met de vlag; rechts/onder ongewijzigd', gmw.includes("maquetteLeesModus!=='rechts'&&maquetteLeesModus!=='onder'&&!(zwevendRailVerbergen&&maquetteLeesModus==='zwevend')&&!voorbeeld"));

  // 5) Migratie en uitleg
  const mig = readFileSync('migrations/0308_posta_lezer_vlaggen.sql', 'utf8');
  for (const sleutel of ['lezer-fout-blijft-open-v1', 'mail-tekst-utf8-terugval-v1', 'maquette-zwevend-rail-verbergen-v1']) {
    const m = new RegExp(`VALUES \\('${sleutel}',\\n  '([^']+)',\\n  false, false\\)\\nON CONFLICT \\(sleutel\\) DO NOTHING;`).exec(mig);
    check(`migratie 0308: ${sleutel} standaard UIT, herhaalbaar, omschrijving ≤ 300`, Boolean(m) && m![1].length <= 300, String(m?.[1].length));
    const u = VLAG_UITLEG[sleutel];
    check(`uitleg in twee talen: ${sleutel}`, Boolean(u) && [u.naam, u.wat, u.wanneer, u.gevolg].every((p) => p[0].length > 5 && p[1].length > 5));
    const ukr = [u.naam[0], u.wat[0], u.wanneer[0], u.gevolg[0], m?.[1].split(' | ')[0] || ''].join(' ');
    check(`uitleg zuiver Oekraïens: ${sleutel}`, !VERBODEN.test(ukr) && !DEELWOORD.test(ukr));
  }
  return einde();
}
