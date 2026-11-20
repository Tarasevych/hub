// MAILAI-003 (16.11.2026): спільні рушії ШІ «для всіх» (ключ сайту, LibreTranslate, Ollama), згода людини, денна межа на людину,
// лічильник і залишок за заголовками постачальника, орієнтовні ціни, «Що від вас потрібно?» локально, причина вимкнення політикою.
// Draaien: node scripts/eenheidstests.mjs mailai-003-20261116.test.ts
//  A. модель: перевірка форми власника, адреса сервера, згода прив'язана до того, куди йде текст, ризики (Gemini/ЄЕЗ, Китай).
//  B. маршрути власника: лише власник; новий рушій вимкнений; увімкнення лише з ключем і з підтвердженням; зміна адресата вимикає й
//     скидає згоди; ключ ніколи не повертається; сповіщення; перевірка шле лише тестове речення.
//  C. пошта: рушій видно лише ввімкнений; без згоди — 403 і жодного запиту назовні; зі згодою — запит ключем САЙТУ (не особистим);
//     межа на людину (третій запит → 429, постачальника не питали); вимкнений → 409; явний вибір зниклого рушія не підмінюється.
//  D. власний сервер: LibreTranslate (лише переклад, функція «підсумок» → 400) і Ollama (JSON), збій сервера → чесна відмова,
//     одиниця лічильника повертається, власникові сповіщення.
//  E. лічильник: особистий ключ рахується без межі; залишок із заголовків Anthropic/OpenAI; Gemini без заголовків — лише «сьогодні N».
//  F. ціни: розбір переліку OpenRouter, типові моделі, прапорець вимкнено → назовні не ходимо; текст із джерелом і датою.
//  G. картки й інтерфейс: стани «потрібна згода» / «ліміт вичерпано», «авто» не бере рушій без згоди; локальні «дії» лише з promptRauw;
//     причина й ім'я адміністратора при beleid-uit; схема й системна інструкція в межах контракту розширення; міграція 0295.
import { readFileSync } from 'node:fs';
import { type AiVertalingAgentInfo } from '../../shared/ai-vertaling';
import {
  akkoordSleutel, dienstFuncties, dienstPubliek, dienstRisicos, dienstWaarheen, isDienstAgentId, normaliseerDienstInvoer, normaliseerDienstUrl,
  type DienstMotor, type DienstMotorPubliek,
} from '../../shared/ai-dienst-motor';
import {
  gebruikTekst, kiesMotor, LOKAAL_MOTOR_ID, lokaalBeleidVan, lokaalPromptVan, MOTOR_AUTO, motorenVoorPost, prijsTekst, verwerktDoor,
} from '../../shared/mail-ai-motor';
import { ACTIES_JSON_SCHEMA, actiesLokaalSysteem, actiesLokaalTekst, actiesPunten, actiesUitTekst } from '../../shared/ai-acties-model';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVolgensVoorvoegsel } from '../../shared/meldingen-soorten';
import { aiDienstMotorenRoutes, geheugenOpslag, leesLimietKoppen, setDienstOpslag } from '../../backend/ai-dienst-motoren';
import { modelSleutel, prijzenNu, prijzenUitLijst, setPrijzenDeps } from '../../backend/ai-prijzen';
import { clearAiVertalingCache, createAiVertalingRoutes, executeAiVertalingRun, setAiVertalingDeps } from '../../backend/ai-vertaling-routes';
import { registreerMelder } from '../../backend/melder';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const UID = 'user-mailai-003';
const EIGENAAR = 'owner-mailai-003';
const SITE_SLEUTEL = 'nep-sleutel-van-de-site';
const EIGEN_SLEUTEL = 'nep-eigen-sleutel';
const agent = (over: Partial<AiVertalingAgentInfo> = {}): AiVertalingAgentInfo => ({
  id: 'prive:vault-anthropic', name: 'Claude', platform: 'anthropic', source: 'vault', ruimte: 'prive', scopes: ['mail.read'],
  allowedMailRead: true, allowedFilesRead: false, statusUk: 'Активний', heeftSleutel: true, ...over,
});
const pub = (over: Partial<DienstMotorPubliek> = {}): DienstMotorPubliek => ({
  id: 'gedeeld', soort: 'aanbieder', naam: 'Спільний Claude', aanbieder: 'anthropic', functies: dienstFuncties('aanbieder'), limietPerDag: 30, vandaag: 0,
  beheerder: 'Павло', akkoord: false, akkoordSleutel: 'gedeeld@x', ...over,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('mailai-003-20261116');
  // UPD-003: власні налаштування тестової людини з попереднього прогону прибрати — інакше «згоди ще немає» залежить від історії бази.
  // Eigen voorkeuren van de testgebruiker uit een vorige run weghalen, zodat «nog geen akkoord» niet van de databasegeschiedenis afhangt.
  try {
    const { getPool } = await import('../../server/platform/pg');
    await getPool('systeem').query(`DELETE FROM app.records WHERE owner_id = $1 AND tbl = 'ai_vertaling_preferences_v1'`, [UID]);
  } catch { /* zonder database: niets op te ruimen */ }

  // ================================================================ A
  {
    const goed = normaliseerDienstInvoer({ id: 'Gedeeld', soort: 'aanbieder', naam: '  Спільний   Claude ', aanbieder: 'anthropic', limietPerDag: 20 });
    check('A форма: ключ сайту в постачальника — назву підчищено, id малими літерами, межа збережена',
      goed.ok && goed.waarde.id === 'gedeeld' && goed.waarde.naam === 'Спільний Claude' && goed.waarde.limietPerDag === 20 && goed.waarde.url === undefined);
    const fout = (r: ReturnType<typeof normaliseerDienstInvoer>) => (r.ok ? 'ok' : r.code);
    check('A форма: відмови з поясненням обома мовами (id, вид, назва, межа, постачальник, адреса, модель Ollama)',
      fout(normaliseerDienstInvoer({ id: '1x', soort: 'aanbieder', naam: 'a', aanbieder: 'anthropic' })) === 'DIENST_ID_ONGELDIG'
      && fout(normaliseerDienstInvoer({ id: 'ab', soort: 'x', naam: 'a' })) === 'DIENST_SOORT_ONGELDIG'
      && fout(normaliseerDienstInvoer({ id: 'ab', soort: 'aanbieder', naam: ' ', aanbieder: 'anthropic' })) === 'DIENST_NAAM_LEEG'
      && fout(normaliseerDienstInvoer({ id: 'ab', soort: 'aanbieder', naam: 'a', aanbieder: 'anthropic', limietPerDag: 0 })) === 'DIENST_LIMIET_ONGELDIG'
      && fout(normaliseerDienstInvoer({ id: 'ab', soort: 'aanbieder', naam: 'a', aanbieder: 'mistral' })) === 'DIENST_AANBIEDER_ONGELDIG'
      && fout(normaliseerDienstInvoer({ id: 'ab', soort: 'libretranslate', naam: 'a', url: 'ftp://x' })) === 'DIENST_URL_ONGELDIG'
      && fout(normaliseerDienstInvoer({ id: 'ab', soort: 'ollama', naam: 'a', url: 'http://127.0.0.1:11434' })) === 'DIENST_MODEL_NODIG'
      && (() => { const r = normaliseerDienstInvoer({ id: 'ab', soort: 'x', naam: 'a' }); return !r.ok && /[а-яіїє]/i.test(r.uk) && /[a-z]/i.test(r.nl); })());
    check('A адреса власного сервера: http(s), без логіна/параметрів, без службових адрес хмар; кінцева риска прибирається',
      normaliseerDienstUrl('http://127.0.0.1:5000/') === 'http://127.0.0.1:5000' && normaliseerDienstUrl('https://vertaal.example.org/lt/') === 'https://vertaal.example.org/lt'
      && normaliseerDienstUrl('http://user:pw@host/') === null && normaliseerDienstUrl('http://host/?a=1') === null && normaliseerDienstUrl('http://169.254.169.254/') === null
      && normaliseerDienstUrl('http://metadata.google.internal') === null && normaliseerDienstUrl('javascript:alert(1)') === null && normaliseerDienstUrl('') === null);
    const basis = { id: 'gedeeld', soort: 'aanbieder' as const, aanbieder: 'anthropic' as const };
    check('A згода прив\'язана до того, куди йде текст: інший постачальник, адреса чи модель → інший ключ згоди; назва й межа — ні',
      akkoordSleutel(basis) === akkoordSleutel({ ...basis }) && akkoordSleutel(basis) !== akkoordSleutel({ ...basis, aanbieder: 'gemini' })
      && akkoordSleutel(basis) !== akkoordSleutel({ ...basis, model: 'claude-x' })
      && akkoordSleutel({ id: 'lt', soort: 'libretranslate', url: 'http://a:5000' }) !== akkoordSleutel({ id: 'lt', soort: 'libretranslate', url: 'http://b:5000' })
      && /^gedeeld@[a-z0-9]+$/.test(akkoordSleutel(basis)));
    check('A ризики для власника: кошти й обліковий запис; Gemini — ЄЕЗ і безкоштовний рівень; Z.ai — Китай; власний сервер — журнали й http',
      dienstRisicos({ soort: 'aanbieder', aanbieder: 'anthropic' }).length === 2 && /ЄЕЗ/.test(dienstRisicos({ soort: 'aanbieder', aanbieder: 'gemini' }).join(' '))
      && /EER/.test(dienstRisicos({ soort: 'aanbieder', aanbieder: 'gemini' }, true).join(' ')) && /Кита/.test(dienstRisicos({ soort: 'aanbieder', aanbieder: 'autoclaw' }).join(' '))
      && /журналював/.test(dienstRisicos({ soort: 'ollama' }).join(' ')) && /http:\/\//.test(dienstRisicos({ soort: 'libretranslate' }).join(' ')));
    check('A «куди піде текст» чесно: ключ сайту (платить адміністратор, постачальник бачить текст) / власний сервер (хто керує — може бачити)',
      /ключем сайту/.test(dienstWaarheen(pub())) && /Павло/.test(dienstWaarheen(pub())) && /Постачальник бачить текст/.test(dienstWaarheen(pub()))
      && /власний сервер сайту \(lt\.example\)/.test(dienstWaarheen(pub({ soort: 'libretranslate', aanbieder: undefined, host: 'lt.example' }))) && /технічно може бачити/.test(dienstWaarheen(pub({ soort: 'ollama', aanbieder: undefined })))
      && /sleutel van de site/.test(dienstWaarheen(pub(), true)));
    check('A ідентифікатор рушія в пошті: «dienst:<id>», сміття не проходить', isDienstAgentId('dienst:gedeeld') && !isDienstAgentId('dienst:') && !isDienstAgentId('dienst:../x') && !isDienstAgentId('prive:vault-anthropic'));
  }

  // ================================================================ B–E: сервер
  const meldingen: Array<{ uid: string; kind: string; title: string; message: string; link?: string }> = [];
  registreerMelder(async (uid, _email, kind, title, message, link) => { meldingen.push({ uid: String(uid), kind, title, message, link }); });
  const kluis = new Map<string, string>();
  const opslag = geheugenOpslag();
  setDienstOpslag(opslag, {
    lezer: async (eigenaar, naam) => kluis.get(`${eigenaar}|${naam}`) ?? null,
    schrijver: async (eigenaar, naam, _door, waarde) => { kluis.set(`${eigenaar}|${naam}`, waarde); },
    wisser: async (eigenaar, naam) => { kluis.delete(`${eigenaar}|${naam}`); },
  });
  const oudeEigenaar = process.env.OWNER_EMAIL;
  process.env.OWNER_EMAIL = 'eigenaar@example.org';
  let wie: { id: string; email: string; role: string; name: string; status: string } = { id: EIGENAAR, email: 'eigenaar@example.org', role: 'owner', name: 'Павло', status: 'approved' };
  let dienst = 'mcp';
  let stapOpGevraagd = 0;
  let stapOpWeiger = false;
  const audit: string[] = [];
  const verzoeken: Array<{ url: string; sleutel: string; body: string }> = [];
  let antwoord: (url: string) => Response = () => new Response('{}', { status: 500 });
  const nepFetch = (async (url: unknown, init?: RequestInit) => {
    const h = (init?.headers || {}) as Record<string, string>;
    verzoeken.push({ url: String(url), sleutel: h['x-goog-api-key'] || h['x-api-key'] || h.authorization || '', body: String(init?.body || '') });
    return antwoord(String(url));
  }) as unknown as typeof fetch;
  type Route = Record<string, Array<(ctx: unknown) => Promise<{ statusCode: number; body: string }>>>;
  const beheer = aiDienstMotorenRoutes({
    requireSession: async () => ({ user: wie, service: dienst }),
    audit: async (_uid, action) => { audit.push(action); },
    stepUp: async () => { stapOpGevraagd += 1; return stapOpWeiger ? { statusCode: 403, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } : null; },
    fetch: nepFetch,
  }) as unknown as Route;
  const post = async (routes: Route, pad: string, body: Record<string, unknown>) => {
    const res = await routes[pad][0]({ event: {}, body });
    return { status: res.statusCode, data: JSON.parse(res.body) };
  };
  const B = 'POST /api/owner/ai-dienst-motoren/';
  const mail = createAiVertalingRoutes({
    requireSession: async () => ({ user: { id: UID, status: 'approved' }, service: 'mail' }),
    audit: async (_uid, action) => { audit.push(action); },
  }) as unknown as Route;
  const anthropicOk = (tekst: Record<string, unknown>, koppen: Record<string, string> = {}) => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(tekst) }] }), { status: 200, headers: koppen });
  const vertaal = (agentId: string, id: string, mode: 'translate' | 'summary' = 'translate') => executeAiVertalingRun({ userId: UID, mode, targetLang: 'uk', agentId, messageId: id, subject: '', bodyText: `Hallo ${id}`, segments: [{ id: 's0', text: `Hallo ${id}` }] });

  try {
    setAiVertalingDeps({
      fetch: nepFetch,
      getApiKeyForProvider: async (_uid, a) => (a === 'anthropic' ? EIGEN_SLEUTEL : null),
      loadAgents: async () => [agent()],
      loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
    });

    // ---------------------------------------------------------------- B
    wie = { ...wie, role: 'admin' };
    const nietEigenaar = await post(beheer, `${B}overzicht`, {});
    wie = { ...wie, role: 'owner', email: 'iemand@example.org' };
    const anderAdres = await post(beheer, `${B}bewaar`, { id: 'gedeeld', soort: 'aanbieder', naam: 'X', aanbieder: 'anthropic', sleutel: 'x' });
    wie = { ...wie, email: 'eigenaar@example.org' }; dienst = 'mail';
    const verkeerdeDienst = await post(beheer, `${B}overzicht`, {});
    dienst = 'mcp';
    check('B лише власник сервера на сторінці керування: адміністратор, чужа адреса, поштова сторінка → 403, нічого не збережено',
      nietEigenaar.status === 403 && anderAdres.status === 403 && verkeerdeDienst.status === 403 && (await opslag.lijst()).length === 0 && kluis.size === 0);

    stapOpWeiger = true;
    const zonderStap = await post(beheer, `${B}bewaar`, { id: 'gedeeld', soort: 'aanbieder', naam: 'Спільний Claude', aanbieder: 'anthropic', limietPerDag: 2, sleutel: SITE_SLEUTEL });
    stapOpWeiger = false;
    check('B збереження без підтвердження passkey → відмова; ні рушія, ні ключа', zonderStap.status === 403 && (await opslag.lijst()).length === 0 && kluis.size === 0);

    const zonderSleutel = await post(beheer, `${B}bewaar`, { id: 'gedeeld', soort: 'aanbieder', naam: 'Спільний Claude', aanbieder: 'anthropic', limietPerDag: 2 });
    const aanZonder = await post(beheer, `${B}zet`, { id: 'gedeeld', aan: true });
    check('B новий рушій завжди вимкнений; без ключа ввімкнути не можна (DIENST_NIET_KLAAR)',
      zonderSleutel.status === 200 && zonderSleutel.data.motoren[0].aan === false && zonderSleutel.data.motoren[0].heeftSleutel === false && aanZonder.status === 400 && aanZonder.data.error === 'DIENST_NIET_KLAAR');

    const bewaard = await post(beheer, `${B}bewaar`, { id: 'gedeeld', soort: 'aanbieder', naam: 'Спільний Claude', aanbieder: 'anthropic', limietPerDag: 2, sleutel: SITE_SLEUTEL });
    check('B ключ лежить у сховищі власника під «gedeeld-<id>» і НІКОЛИ не повертається у відповіді; рушій лишається вимкненим',
      bewaard.status === 200 && kluis.get(`${EIGENAAR}|gedeeld-gedeeld`) === SITE_SLEUTEL && !JSON.stringify(bewaard.data).includes(SITE_SLEUTEL)
      && bewaard.data.motoren[0].heeftSleutel === true && bewaard.data.motoren[0].aan === false && !('eigenaarUserId' in bewaard.data.motoren[0]) && bewaard.data.motoren[0].beheerder === 'Павло');

    // вимкнений рушій: пошта його не бачить і не виконує
    const stUit = await post(mail, 'POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    const runUit = await vertaal('dienst:gedeeld', 'uit');
    check('B/C вимкнений рушій: у пошті його немає, запит → 409 DIENST_UIT, назовні нічого не пішло',
      stUit.data.dienstMotoren.length === 0 && runUit.status === 409 && (runUit.body as { error?: string }).error === 'DIENST_UIT' && verzoeken.length === 0);

    const stapVoor = stapOpGevraagd; const meldVoor = meldingen.length;
    const aan = await post(beheer, `${B}zet`, { id: 'gedeeld', aan: true });
    const m = meldingen.slice(meldVoor);
    check('B увімкнення: з підтвердженням passkey, запис у центрі сповіщень власника (технічний, обидві мови, з межею)',
      aan.status === 200 && aan.data.motoren[0].aan === true && stapOpGevraagd === stapVoor + 1 && m.length === 1 && m[0].uid === EIGENAAR && m[0].kind === 'beheer.ai_motor'
      && /увімкнено для всіх/.test(m[0].title) && /aangezet voor iedereen/.test(m[0].title) && /не більше 2 запитів/.test(m[0].message));
    check('B види сповіщень зареєстровано: власникові — технічне, людині — особисте (через префікс, без нової міграції)',
      (MELDING_SOORTEN as Record<string, { type: string }>)['beheer.ai_motor']?.type === 'tech.integraties' && (MELDING_SOORTEN as Record<string, { type: string }>).mail_ai_motor?.type === 'post'
      && SFEER_PER_SOORT['beheer.ai_motor'] === 'technisch' && SFEER_PER_SOORT.mail_ai_motor === 'prive' && sfeerVolgensVoorvoegsel('beheer.ai_motor') === 'technisch' && sfeerVolgensVoorvoegsel('mail_ai_motor') === 'prive'
      && NA_0107_VIA_VOORVOEGSEL.has('beheer.ai_motor') && NA_0107_VIA_VOORVOEGSEL.has('mail_ai_motor'));

    // ---------------------------------------------------------------- C
    const st = await post(mail, 'POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    const d0 = st.data.dienstMotoren[0] as DienstMotorPubliek;
    check('C /state: увімкнений рушій видно всім — назва, межа, хто ввімкнув, згоди ще немає; ключа й адреси власника немає',
      st.data.dienstMotoren.length === 1 && d0.id === 'gedeeld' && d0.akkoord === false && d0.limietPerDag === 2 && d0.beheerder === 'Павло' && d0.vandaag === 0
      && !JSON.stringify(st.data).includes(SITE_SLEUTEL) && !JSON.stringify(st.data).includes(EIGENAAR) && st.data.settings.dienstAkkoord.length === 0);

    const zonderAkkoord = await vertaal('dienst:gedeeld', 'a0');
    check('C без згоди людини: 403 DIENST_AKKOORD_NODIG з поясненням, куди піде текст; назовні нічого',
      zonderAkkoord.status === 403 && (zonderAkkoord.body as { error?: string }).error === 'DIENST_AKKOORD_NODIG' && /ключем сайту/.test(String((zonderAkkoord.body as { messageUk?: string }).messageUk)) && verzoeken.length === 0);

    const meldVoor2 = meldingen.length;
    const akkoord = await post(mail, 'POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', dienstAkkoord: { id: 'gedeeld', aan: true } });
    const vals = await post(mail, 'POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', dienstAkkoord: { id: 'bestaat-niet', aan: true } });
    const m2 = meldingen.slice(meldVoor2);
    check('C згода: сервер сам обчислює, на що вона (клієнт не може «погодитися» на інше); запис у центрі сповіщень людини; неіснуючий рушій → 409',
      akkoord.status === 200 && akkoord.data.settings.dienstAkkoord.length === 1 && akkoord.data.settings.dienstAkkoord[0] === d0.akkoordSleutel
      && vals.status === 409 && m2.length === 1 && m2[0].uid === UID && m2[0].kind === 'mail_ai_motor' && /Ви дозволили спільний рушій/.test(m2[0].title) && /ключем сайту/.test(m2[0].message) && /^(https:\/\/mail\.[a-z0-9.-]+)?\/(mail)?$/.test(String(m2[0].link)) /* UPD-003 (#138): absolute link */);

    antwoord = () => anthropicOk({ detectedSourceLang: 'nl', translations: { s0: 'Привіт' } }, { 'anthropic-ratelimit-requests-remaining': '48', 'anthropic-ratelimit-requests-limit': '50' });
    clearAiVertalingCache(UID);
    const r1 = await vertaal('dienst:gedeeld', 'a1');
    const b1 = r1.body as { translations?: Record<string, string>; dienstId?: string; aanbiederId?: string; motorNaam?: string; gebruik?: { vandaag: number; limietPerDag?: number; resterend?: number; limiet?: number } };
    check('C зі згодою: запит іде в Anthropic ключем САЙТУ — не особистим ключем людини; відповідь називає спільний рушій',
      r1.status === 200 && b1.translations?.s0 === 'Привіт' && verzoeken.length === 1 && /api\.anthropic\.com/.test(verzoeken[0].url) && verzoeken[0].sleutel === SITE_SLEUTEL
      && b1.dienstId === 'gedeeld' && b1.aanbiederId === 'anthropic' && /спільний рушій сайту/.test(String(b1.motorNaam)), JSON.stringify({ s: r1.status, v: verzoeken.map((x) => x.sleutel) }));
    check('C лічильник у відповіді: «сьогодні 1 із 2» і залишок за заголовками постачальника (48 із 50)',
      b1.gebruik?.vandaag === 1 && b1.gebruik.limietPerDag === 2 && b1.gebruik.resterend === 48 && b1.gebruik.limiet === 50, JSON.stringify(b1.gebruik));

    const r1b = await vertaal('dienst:gedeeld', 'a1');
    check('C повтор того самого листа — з кешу сеансу: постачальника не питали, межа не зменшилась', r1b.status === 200 && (r1b.body as { cached?: boolean }).cached === true && verzoeken.length === 1);
    const r2 = await vertaal('dienst:gedeeld', 'a2');
    const r3 = await vertaal('dienst:gedeeld', 'a3');
    const b3 = r3.body as { error?: string; messageUk?: string; messageNl?: string; gebruik?: { vandaag: number } };
    check('C денна межа на людину: третій запит → 429 DIENST_LIMIET, постачальника НЕ питали, порада обрати інший рушій (обидві мови)',
      r2.status === 200 && r3.status === 429 && b3.error === 'DIENST_LIMIET' && verzoeken.length === 2 && /2 запитів на людину на день/.test(String(b3.messageUk)) && /локальний ШІ Chrome/.test(String(b3.messageUk)) && /per persoon per dag/.test(String(b3.messageNl)) && b3.gebruik?.vandaag === 2);
    const stat = await post(beheer, `${B}overzicht`, {});
    const s0 = (stat.data.statistiek as Array<{ motor: string; aantal: number; geweigerd: number; gebruikers: number }>).find((x) => x.motor === 'dienst:gedeeld');
    check('C власник бачить лише числа: 2 запити, 1 людина, 1 відмова через межу — без тексту й без імен', s0?.aantal === 2 && s0.gebruikers === 1 && s0.geweigerd === 1 && !JSON.stringify(stat.data).includes(UID) && !JSON.stringify(stat.data).includes('Hallo'));

    const eigen = await vertaal('prive:vault-anthropic', 'e1');
    check('C/E особистий ключ і далі працює окремо: запит особистим ключем, лічильник без межі, спільний ключ не чіпається',
      eigen.status === 200 && verzoeken[verzoeken.length - 1].sleutel === EIGEN_SLEUTEL && (eigen.body as { dienstId?: string }).dienstId === undefined
      && (eigen.body as { gebruik?: { vandaag: number; limietPerDag?: number } }).gebruik?.vandaag === 1 && (eigen.body as { gebruik?: { limietPerDag?: number } }).gebruik?.limietPerDag === undefined);
    const weg = await vertaal('prive:vault-gemini', 'e2');
    check('C явний вибір рушія, якого вже немає, НЕ підмінюється іншим: 409 MOTOR_NIET_BESCHIKBAAR, назовні нічого',
      weg.status === 409 && (weg.body as { error?: string }).error === 'MOTOR_NIET_BESCHIKBAAR' && verzoeken.length === 3);

    // зміна того, куди йде текст → вимкнено, згода більше не діє
    const meldVoor3 = meldingen.length;
    const gewijzigd = await post(beheer, `${B}bewaar`, { id: 'gedeeld', soort: 'aanbieder', naam: 'Спільний Claude', aanbieder: 'anthropic', model: 'claude-ander-model', limietPerDag: 50 });
    await post(beheer, `${B}zet`, { id: 'gedeeld', aan: true });
    const naWijziging = await vertaal('dienst:gedeeld', 'a4');
    check('B/C власник змінив модель: рушій вимкнено зі сповіщенням, стара згода людини більше не діє (знову 403), ключ лишився',
      gewijzigd.data.motoren[0].aan === false && gewijzigd.data.motoren[0].heeftSleutel === true && meldingen.slice(meldVoor3).some((x) => /вимкнено після зміни/.test(x.title))
      && naWijziging.status === 403 && (naWijziging.body as { error?: string }).error === 'DIENST_AKKOORD_NODIG' && verzoeken.length === 3);
    const alleenNaam = await post(beheer, `${B}bewaar`, { id: 'gedeeld', soort: 'aanbieder', naam: 'Claude для всіх', aanbieder: 'anthropic', model: 'claude-ander-model', limietPerDag: 50 });
    check('B зміна лише назви чи межі рушій не вимикає', alleenNaam.data.motoren[0].aan === true && alleenNaam.data.motoren[0].naam === 'Claude для всіх');

    // збій ключа сайту → людині чесно, власникові сповіщення
    await post(mail, 'POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', dienstAkkoord: { id: 'gedeeld', aan: true } });
    antwoord = () => new Response('{}', { status: 401 });
    const meldVoor4 = meldingen.length;
    const afgewezen = await vertaal('dienst:gedeeld', 'a5');
    const stNa = await post(mail, 'POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    check('C постачальник не прийняв ключ САЙТУ: людині не радять «перевірити свій ключ», власника сповіщено, невдалий запит межу не зменшив',
      afgewezen.status === 503 && (afgewezen.body as { error?: string }).error === 'DIENST_ONBEREIKBAAR' && !/ваш ключ/i.test(String((afgewezen.body as { messageUk?: string }).messageUk)) && /Адміністратора сповіщено/.test(String((afgewezen.body as { messageUk?: string }).messageUk))
      && meldingen.slice(meldVoor4).some((x) => x.uid === EIGENAAR && x.kind === 'beheer.ai_motor' && /не прийняв ключ сайту/.test(x.message) && !/Hallo/.test(x.message))
      && (stNa.data.dienstMotoren[0] as DienstMotorPubliek).vandaag === 2);

    // ---------------------------------------------------------------- D
    await post(beheer, `${B}bewaar`, { id: 'lt', soort: 'libretranslate', naam: 'Перекладач сайту', url: 'http://127.0.0.1:5000/', limietPerDag: 5 });
    await post(beheer, `${B}bewaar`, { id: 'oll', soort: 'ollama', naam: 'Ollama сайту', url: 'http://10.0.0.5:11434', model: 'gemma3:4b', limietPerDag: 5 });
    await post(beheer, `${B}zet`, { id: 'lt', aan: true });
    await post(beheer, `${B}zet`, { id: 'oll', aan: true });
    await post(mail, 'POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', dienstAkkoord: { id: 'lt', aan: true } });
    await post(mail, 'POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', dienstAkkoord: { id: 'oll', aan: true } });
    const stD = await post(mail, 'POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    const lt = (stD.data.dienstMotoren as DienstMotorPubliek[]).find((x) => x.id === 'lt');
    check('D власний сервер у пошті: видно лише назву вузла (без порту й шляху), LibreTranslate вміє лише переклад, Ollama — усе',
      lt?.host === '127.0.0.1' && JSON.stringify(lt.functies) === '["translate"]' && lt.akkoord === true
      && (stD.data.dienstMotoren as DienstMotorPubliek[]).find((x) => x.id === 'oll')?.functies.length === 5 && !JSON.stringify(stD.data).includes(':11434'));

    const n0 = verzoeken.length;
    antwoord = () => new Response(JSON.stringify({ translatedText: ['Привіт lt'], detectedLanguage: [{ language: 'nl', confidence: 90 }] }), { status: 200 });
    const viaLt = await vertaal('dienst:lt', 'lt1');
    const vLt = verzoeken[verzoeken.length - 1];
    check('D LibreTranslate: POST <адреса>/translate з масивом фрагментів, без ключів постачальників; переклад повертається за фрагментами',
      viaLt.status === 200 && (viaLt.body as { translations?: Record<string, string> }).translations?.s0 === 'Привіт lt' && verzoeken.length === n0 + 1 && vLt.url === 'http://127.0.0.1:5000/translate' && vLt.sleutel === ''
      && JSON.parse(vLt.body).target === 'uk' && Array.isArray(JSON.parse(vLt.body).q) && (viaLt.body as { dienstId?: string; aanbiederId?: string }).dienstId === 'lt' && (viaLt.body as { aanbiederId?: string }).aanbiederId === undefined
      && (viaLt.body as { gebruik?: { vandaag: number; limietPerDag?: number } }).gebruik?.vandaag === 1);
    const ltSamen = await vertaal('dienst:lt', 'lt2', 'summary');
    check('D LibreTranslate + «підсумок» → 400 DIENST_FUNCTIE: текст нікуди не йде', ltSamen.status === 400 && (ltSamen.body as { error?: string }).error === 'DIENST_FUNCTIE' && verzoeken.length === n0 + 1);

    antwoord = () => new Response(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify({ detectedSourceLang: 'nl', translations: { s0: 'Привіт ollama' } }) } }), { status: 200 });
    const viaOll = await vertaal('dienst:oll', 'o1');
    const vOll = verzoeken[verzoeken.length - 1];
    check('D Ollama: POST <адреса>/api/chat з моделлю власника, format=json, без потоку; відповідь розібрано',
      viaOll.status === 200 && (viaOll.body as { translations?: Record<string, string> }).translations?.s0 === 'Привіт ollama' && vOll.url === 'http://10.0.0.5:11434/api/chat'
      && JSON.parse(vOll.body).model === 'gemma3:4b' && JSON.parse(vOll.body).format === 'json' && JSON.parse(vOll.body).stream === false);

    antwoord = () => new Response('weg', { status: 502 });
    const meldVoor5 = meldingen.length;
    const ollStuk = await vertaal('dienst:oll', 'o2');
    const stD2 = await post(mail, 'POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    check('D власний сервер не відповів: чесна відмова («оригінал не змінено»), одиниця лічильника повернулась, власникові сповіщення',
      ollStuk.status === 503 && (ollStuk.body as { error?: string }).error === 'DIENST_ONBEREIKBAAR' && /Власний сервер сайту/.test(String((ollStuk.body as { messageUk?: string }).messageUk))
      && (stD2.data.dienstMotoren as DienstMotorPubliek[]).find((x) => x.id === 'oll')?.vandaag === 1 && meldingen.slice(meldVoor5).some((x) => x.uid === EIGENAAR && /не обробив запит/.test(x.title)));

    antwoord = () => new Response(JSON.stringify({ translatedText: ['Доброго ранку'] }), { status: 200 });
    const test = await post(beheer, `${B}test`, { id: 'lt' });
    const vTest = verzoeken[verzoeken.length - 1];
    check('B «Перевірити»: надсилається лише фіксоване тестове речення, результат із прикладом; текстів користувачів немає',
      test.status === 200 && test.data.geslaagd === true && test.data.voorbeeld === 'Доброго ранку' && JSON.parse(vTest.body).q[0] === 'Goedemorgen, dit is een testzin.');

    const stapVoor2 = stapOpGevraagd;
    const verwijderd = await post(beheer, `${B}verwijder`, { id: 'gedeeld' });
    check('B «Прибрати»: з підтвердженням passkey; рушій зникає, ключ сайту прибрано зі сховища; особисті ключі не чіпаються',
      verwijderd.status === 200 && stapOpGevraagd === stapVoor2 + 1 && !(verwijderd.data.motoren as DienstMotor[]).some((x) => x.id === 'gedeeld') && !kluis.has(`${EIGENAAR}|gedeeld-gedeeld`));

    // ---------------------------------------------------------------- E
    check('E заголовки ліміту: Anthropic і OpenAI-сумісні читаються; Gemini (без заголовків) і сміття → нічого',
      JSON.stringify(leesLimietKoppen(new Headers({ 'anthropic-ratelimit-requests-remaining': '7', 'anthropic-ratelimit-requests-limit': '50' }))) === '{"resterend":7,"limiet":50}'
      && JSON.stringify(leesLimietKoppen(new Headers({ 'x-ratelimit-remaining-requests': '199', 'x-ratelimit-limit-requests': '200' }))) === '{"resterend":199,"limiet":200}'
      && leesLimietKoppen(new Headers({})) === null && leesLimietKoppen(new Headers({ 'x-ratelimit-remaining-requests': 'abc' })) === null && leesLimietKoppen(null) === null);
    check('E текст лічильника: зі спільною межею, без межі, із залишком у постачальника; порожньо, доки не користувалися',
      gebruikTekst({ vandaag: 4, limietPerDag: 30 })?.[0] === 'сьогодні 4 із 30 запитів' && gebruikTekst({ vandaag: 3 })?.[0] === 'сьогодні запитів: 3'
      && /лишилося 48 із 50/.test(String(gebruikTekst({ vandaag: 1, resterend: 48, limiet: 50 })?.[0])) && /nog 48 van 50/.test(String(gebruikTekst({ vandaag: 1, resterend: 48, limiet: 50 })?.[1]))
      && gebruikTekst({ vandaag: 0 }) === null && gebruikTekst(null) === null);
  } finally {
    setAiVertalingDeps(null);
    setDienstOpslag(null);
    if (oudeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = oudeEigenaar;
  }

  // ================================================================ F
  {
    const lijst = { data: [
      { id: 'anthropic/claude-haiku-4.5', pricing: { prompt: '0.000001', completion: '0.000005' } },
      { id: 'google/gemini-2.5-flash', pricing: { prompt: '0.0000003', completion: '0.0000025' } },
      { id: 'google/gemini-2.5-flash:free', pricing: { prompt: '0', completion: '0' } },
      { id: 'openai/gpt-5-mini', pricing: { prompt: '0.00000025', completion: '0.000002' } },
      { id: 'z-ai/glm-4.6', pricing: { prompt: '0.0000005', completion: '0.00000175' } },
      { id: 'x-ai/grok-4-fast', pricing: { prompt: '-1', completion: '-1' } },
      { id: 'kwaad/model', pricing: { prompt: '5', completion: '5' } },
      null, 'rommel',
    ] };
    const pr = prijzenUitLijst(lijst);
    check('F ціни з переліку OpenRouter: типова модель кожного постачальника, долари за 1 млн токенів; «glm-4.6-flash» → найближча «glm-4.6»; сміття й від\'ємні ціни відкинуто',
      modelSleutel('claude-haiku-4-5-20251001') === 'claude-haiku-4.5' && pr.anthropic?.invoerPerMln === 1 && pr.anthropic.uitvoerPerMln === 5 && pr.gemini?.invoerPerMln === 0.3 && pr.openai?.uitvoerPerMln === 2
      && pr.autoclaw?.model === 'z-ai/glm-4.6' && pr.grok === undefined && Object.keys(prijzenUitLijst(null)).length === 0, JSON.stringify(pr));
    let gehaald = 0;
    setPrijzenDeps({ fetch: (async () => { gehaald += 1; return new Response(JSON.stringify(lijst), { status: 200 }); }) as unknown as typeof fetch, vlag: async () => false });
    const uit = await prijzenNu();
    setPrijzenDeps({ fetch: (async () => { gehaald += 1; return new Response(JSON.stringify(lijst), { status: 200 }); }) as unknown as typeof fetch, vlag: async () => true });
    const aan = await prijzenNu();
    const nogmaals = await prijzenNu();
    setPrijzenDeps(null);
    check('F прапорець вимкнено → назовні не ходимо й цін немає; увімкнено → один запит на добу (другий виклик з кешу)',
      uit === null && aan?.perAanbieder.anthropic?.invoerPerMln === 1 && nogmaals !== null && gehaald === 1 && aan.bron === 'https://openrouter.ai/api/v1/models');
    const tekst = prijsTekst({ opgehaaldOp: Date.UTC(2026, 10, 16), bron: 'x', perAanbieder: pr }, 'anthropic');
    check('F текст ціни чесний: «орієнтовно», за 1 млн токенів, оцінка за типовий лист, джерело й дата, «точна ціна — на офіційній сторінці» (обидві мови)',
      !!tekst && /Орієнтовно \$1 за 1 млн токенів на вхід і \$5 на вихід/.test(tekst[0]) && /близько \$0\.0075 за типовий лист/.test(tekst[0]) && /OpenRouter 16\.11\.2026/.test(tekst[0]) && /офіційній сторінці/.test(tekst[0])
      && /Richtprijs/.test(tekst[1]) && /officiële pagina/.test(tekst[1]) && prijsTekst(null, 'anthropic') === null && prijsTekst({ opgehaaldOp: 1, bron: 'x', perAanbieder: {} }, 'grok') === null, tekst?.[0]);
  }

  // ================================================================ G
  {
    const d = pub();
    const k0 = motorenVoorPost([agent()], 'geen-extensie', { dienst: [d] });
    const kaart0 = k0.find((x) => x.id === 'dienst:gedeeld')!;
    check('G картка спільного рушія без згоди: стан «потрібна згода», платить власник, сказано чий ключ і що ваші ключі не використовуються',
      kaart0.staat === 'akkoord' && kaart0.kosten === 'eigenaar' && kaart0.soort === 'dienst-eigenaar' && /ключ сайту/.test(kaart0.sleutelUk) && /Ваші ключі не використовуються/.test(kaart0.sleutelUk)
      && /Павло/.test(kaart0.sleutelUk) && /Потрібна ваша згода/.test(kaart0.stapUk) && /Uw akkoord is nodig/.test(kaart0.stapNl) && /не більше 30 запитів на день/.test(kaart0.kostenUk)
      && !k0.some((x) => x.staat === 'nog-niet'));
    check('G «авто» НІКОЛИ не бере спільний рушій без згоди; явний вибір без згоди → нічого не надсилається',
      kiesMotor(k0, MOTOR_AUTO, 'translate')?.id === 'prive:vault-anthropic' && kiesMotor(k0, 'dienst:gedeeld', 'translate') === null);
    const k1 = motorenVoorPost([agent()], 'geen-extensie', { dienst: [pub({ akkoord: true, vandaag: 4 })], gebruik: { 'dienst:gedeeld': { vandaag: 4 } } });
    const kaart1 = k1.find((x) => x.id === 'dienst:gedeeld')!;
    check('G зі згодою: готовий, «сьогодні 4 із 30»; «авто» бере його перед платним особистим ключем (для людини безкоштовно)',
      kaart1.staat === 'klaar' && kaart1.gebruikUk === 'сьогодні 4 із 30 запитів' && kiesMotor(k1, MOTOR_AUTO, 'translate')?.id === 'dienst:gedeeld');
    const k2 = motorenVoorPost([agent()], 'geen-extensie', { dienst: [pub({ akkoord: true, vandaag: 30 })] });
    check('G межу вичерпано: стан «ліміт на сьогодні», «авто» переходить на інший рушій, явний вибір нічого не надсилає',
      k2.find((x) => x.id === 'dienst:gedeeld')!.staat === 'op' && kiesMotor(k2, MOTOR_AUTO, 'translate')?.id === 'prive:vault-anthropic' && kiesMotor(k2, 'dienst:gedeeld', 'translate') === null);
    const k3 = motorenVoorPost([], 'klaar', { dienst: [pub({ id: 'lt', soort: 'libretranslate', aanbieder: undefined, host: 'lt.example', functies: ['translate'], akkoord: true })] });
    const kLt = k3.find((x) => x.id === 'dienst:lt')!;
    check('G власний сервер: безкоштовно, «без ключа постачальника», вузол названо; локальний ШІ лишається першим в «авто»; підсумок він не бере',
      kLt.soort === 'eigen-server' && kLt.kosten === 'gratis' && /lt\.example/.test(kLt.wegUk) && /без ключа постачальника/.test(kLt.sleutelUk) && kiesMotor(k3, MOTOR_AUTO, 'translate')?.id === LOKAAL_MOTOR_ID
      && kiesMotor(k3, 'dienst:lt', 'summary') === null);
    check('G без спільних рушіїв — чесно «адміністратор ще не ввімкнув» (без «етапів плану»)',
      motorenVoorPost([], 'klaar').filter((x) => x.staat === 'nog-niet').length === 2 && motorenVoorPost([], 'klaar').every((x) => !/етап/.test(x.stapUk) && !/fase/.test(x.stapNl)));
    const metPrijs = motorenVoorPost([agent()], 'klaar', { prijzen: { opgehaaldOp: Date.UTC(2026, 10, 16), bron: 'x', perAanbieder: { anthropic: { model: 'anthropic/claude-haiku-4.5', invoerPerMln: 1, uitvoerPerMln: 5 } } }, gebruik: { 'sleutel:anthropic': { vandaag: 3, resterend: 47, limiet: 50 } } });
    const eigen = metPrijs.find((x) => x.id === 'prive:vault-anthropic')!;
    check('G картка особистого ключа: орієнтовна ціна з джерелом і лічильник із залишком у постачальника',
      /Орієнтовно \$1/.test(String(eigen.prijsUk)) && /сьогодні запитів: 3/.test(String(eigen.gebruikUk)) && /лишилося 47 із 50/.test(String(eigen.gebruikUk)));
    check('G підпис «хто обробив»: ключ сайту (не ваш) / власний сервер сайту без ШІ-компаній',
      /ключем сайту \(не вашим\)/.test(verwerktDoor({ dienst: pub() }, false)) && /sleutel van de site \(niet de uwe\)/.test(verwerktDoor({ dienst: pub() }, true))
      && /власний сервер сайту \(lt\.example\), без ШІ-компаній/.test(verwerktDoor({ dienst: pub({ soort: 'libretranslate', aanbieder: undefined, host: 'lt.example' }) }, false)));

    // локальний ШІ: «Що від вас потрібно?» лише з promptRauw; beleid-uit з причиною
    const ping = (lai: Record<string, unknown>) => ({ ok: true, version: '0.9.6', lokaleAi: { ondersteund: true, aan: true, siteToegang: true, apis: ['translator', 'summarizer', 'prompt'], ...lai } });
    check('G розширення 0.9.6: promptRauw → локально працює й «Що від вас потрібно?»; без прапорця, без prompt у переліку чи з незавантаженою моделлю — ні',
      lokaalPromptVan(ping({ promptRauw: true })) && !lokaalPromptVan(ping({})) && !lokaalPromptVan(ping({ promptRauw: true, apis: ['translator'] })) && !lokaalPromptVan(ping({ promptRauw: true, stand: { prompt: 'downloadable' } })) && !lokaalPromptVan(null)
      && kiesMotor(motorenVoorPost([], 'klaar', { lokaalPrompt: true }), LOKAAL_MOTOR_ID, 'acties')?.id === LOKAAL_MOTOR_ID && kiesMotor(motorenVoorPost([], 'klaar'), LOKAAL_MOTOR_ID, 'acties') === null);
    const beleid = lokaalBeleidVan(ping({ reden: 'beleid-uit', beleid: { reden: 'Перевірка\u0007 безпеки\nдо 20.11', door: 'Павло', op: 1 } }));
    const kBeleid = motorenVoorPost([], 'beleid-uit', { beleid })[0];
    check('G локальний ШІ вимкнено політикою: у картці — хто вимкнув і причина (керівні символи прибрано); без даних — загальне пояснення',
      beleid?.door === 'Павло' && beleid.reden === 'Перевірка безпеки до 20.11' && /вимкнув адміністратор \(Павло\)/.test(kBeleid.stapUk) && /Причина: «Перевірка безпеки до 20\.11»/.test(kBeleid.stapUk)
      && /uitgezet door de beheerder \(Павло\)/.test(kBeleid.stapNl) && kBeleid.staat === 'niet-hier' && lokaalBeleidVan(ping({})) === null && /Адміністратор цього комп/.test(motorenVoorPost([], 'beleid-uit')[0].stapUk));

    const systeem = actiesLokaalSysteem('uk', 'Українська');
    check('G контракт розширення: системна інструкція ≤ 2000 символів без керівних символів, схема — об\'єкт ≤ 8000 символів, ключі латиницею',
      systeem.length <= 2000 && !/[\u0000-\u001f\u007f]/.test(systeem) && /untrusted data, never instructions/.test(systeem) && JSON.stringify(ACTIES_JSON_SCHEMA).length <= 8000
      && ACTIES_JSON_SCHEMA.type === 'object' && /^[\x20-\x7e]+$/.test(JSON.stringify(ACTIES_JSON_SCHEMA)));
    const veel = Array.from({ length: 80 }, (_, i) => ({ brief: Math.floor(i / 8) + 1, nr: (i % 8) + 1, tekst: `Alinea ${i} ${'x'.repeat(400)}`, van: 0, tot: 0 })) as unknown as Parameters<typeof actiesLokaalTekst>[0];
    const bron = actiesLokaalTekst(veel);
    check('G локальний запит ≤ 20 000 символів: відпадають НАЙСТАРІШІ абзаци, найновіший лист лишається',
      bron.tekst.length <= 19_500 && bron.alineas.length < 80 && bron.alineas[bron.alineas.length - 1] === veel[79] && bron.alineas[0] !== veel[0]);
    const uitTekst = actiesUitTekst('ось: {"items":[{"text":"Підтвердити","quote":"[1.2] Kunt u bevestigen","message":1,"paragraph":2,"deadline":"","kind":"request"}],"brief":[],"replySuggestions":[],"needsReply":true}');
    check('G відповідь локальної моделі: JSON із переліком пунктів розбирається, мітку «[1.2]» з цитати прибрано; не JSON або без «items» → null (нічого не вигадуємо)',
      !!uitTekst && actiesPunten(uitTekst.items, 'm', 8, 'verzoek')[0]?.citaat === 'Kunt u bevestigen' && actiesUitTekst('вибачте, не можу') === null && actiesUitTekst('{"brief":[]}') === null && actiesUitTekst('{зламано') === null);

    // інтерфейс і джерела
    const kiezer = lees('src/mail/MotorKiezer.tsx');
    check('G вибір рушія: кнопка «Погоджуюся, дозволити цей рушій» лише для стану «потрібна згода», «Відкликати згоду», підказки про наслідки обома мовами',
      /data-motor-akkoord=\{k\.dienst\.id\}/.test(kiezer) && /k\.staat === 'akkoord' && onAkkoord/.test(kiezer) && /data-motor-akkoord-weg/.test(kiezer) && /t\('Погоджуюся', 'Ik ga akkoord'\)/.test(kiezer)
      && /data-motor-meer/.test(kiezer) && /data-motor-kort/.test(kiezer) && /Запис про згоду з’явиться в центрі сповіщень/.test(kiezer) && /data-motor-prijs/.test(kiezer) && /data-motor-gebruik/.test(kiezer));
    const balk = lees('src/mail/AiVertalingBalk.tsx');
    check('G панель: лічильник активного рушія в рядку «Обробляє», «платить власник сайту», відмови спільного рушія пропонують інший рушій',
      /data-testid="ai-vb-wie-gebruik"/.test(balk) && /платить власник сайту/.test(balk) && /'DIENST_LIMIET'/.test(balk) && /'DIENST_AKKOORD_NODIG'/.test(balk) && /ключем сайту \(не вашим\)/.test(balk) && /onAkkoord=\{dienstAkkoord\}/.test(balk));
    const blok = lees('src/mail/WatNodigBlok.tsx');
    check('G «Що від вас потрібно?» бере рушій, обраний у панелі (не типового агента), локально — через actiesLokaal, і звіряє кожну цитату з оригіналом',
      /kiesMotor\(kaarten, voorkeur, 'acties'\)/.test(blok) && /agentId: motor\.agentId \|\| motor\.id/.test(blok) && /actiesLokaal\(alineas/.test(blok) && /controleerPunten\(actiesPunten\(r\.antwoord\.items/.test(blok) && !/agentId: ai\.agent\.id/.test(blok));
    const beheerUi = lees('src/agenten/DienstMotoren.tsx');
    check('G сторінка власника: блок у «Технічних підключеннях», ризики зі знаком «!», поле ключа — пароль без автозаповнення, обидві мови',
      /<DienstMotoren/.test(lees('src/agenten/TechVerbindingen.tsx')) && /data-testid=['"]dienst-risico['"]/.test(beheerUi) && /type=['"]password['"]/.test(beheerUi) && /autoComplete=['"](off|new-password)['"]/.test(beheerUi)
      && /ai-dienst-motoren\/bewaar/.test(beheerUi) && /risicosNl/.test(beheerUi));
    const mig = lees('migrations/0295_ai_dienst_motoren.sql');
    check('G міграція 0295: типово вимкнено, значення ключа в таблиці немає, обидві таблиці закриті для ролі застосунку, повторюваність, опис прапорця ≤ 300',
      /aan\s+boolean\s+NOT NULL DEFAULT false/.test(mig) && !/sleutel_waarde|api_key|ciphertext/.test(mig) && (mig.match(/current_user::text <> 'mijnruimte_app'/g) || []).length === 4
      && (mig.match(/CREATE TABLE IF NOT EXISTS/g) || []).length === 2 && (mig.match(/DROP POLICY IF EXISTS/g) || []).length === 2 && /ON CONFLICT \(sleutel\) DO NOTHING/.test(mig)
      && (/VALUES \('ai-prijzen-ophalen', '([^']+)'/.exec(mig)?.[1].length || 999) <= 300);
    const kern = lees('backend/ai-dienst-motoren.ts');
    check('G сервер: спільний ключ має призначення «other» (особистий пошук за постачальником його не знайде); власний сервер — без перенаправлень',
      /GEDEELD_DOEL = 'other'/.test(kern) && /redirect: 'error'/.test(kern) && !/console\.log/.test(kern));
  }

  return einde();
}
