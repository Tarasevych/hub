// SEC-002 · завершальний крок «B» (12.11.2026): інтерфейс, тексти, сповіщення, тести.
// Перевіряє доробки, які групи g02…g11 відклали, бо вони потребували файлів інтерфейсу:
//   1. тексти uk/nl для нових кодів відмов (замість «Не вдалося (КОД)» — що сталося й що робити далі);
//   2. нові види сповіщень і їхнє розгорнуте пояснення в центрі сповіщень;
//   3. «Запрошення для вас» на стартовому екрані оселі, нагадування на «Огляді», стирання чернеток нотаток при виході;
//   4. «Захист»: стан аварійного вимкнення підтверджень; перемикач логотипів невідомих відправників;
//   5. кнопки, що дають ШІ права, — лише справжній клік людини; одноразові секрети — поза читанням ШІ;
//   6. тести, що закріплювали старі вади (версія розширення 0.9.3).
// Режим «основа» (AFWERKING_B_BASIS=1): ті самі перевірки на коді ДО доробок — вихідні тексти читаються з основи 11e0aad8
// (git show), а модулі — з копії дерева основи, у якій запускають цей тест.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { taalFouten } from './hulp/taalcontrole';

const BASIS = '11e0aad8b641b62412d2efcf1382d117339d251f';
const opBasis = process.env.AFWERKING_B_BASIS === '1';
/** Bron van een bestand: nu, of (modus «основа») zoals in de basis; een bestand dat toen nog niet bestond → ''. */
const lees = (pad: string): string => {
  if (opBasis) { try { return execFileSync('git', ['show', `${BASIS}:${pad}`], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch { return ''; } }
  return existsSync(pad) ? readFileSync(pad, 'utf8') : '';
};
type Mod = Record<string, unknown>;
const laad = async (p: Promise<Mod>): Promise<Mod> => { try { return await p; } catch { return {}; } };
const fn = <T extends (...a: never[]) => unknown>(m: Mod, naam: string): T | null => (typeof m[naam] === 'function' ? (m[naam] as T) : null);
const algemeen = (s: string) => !s || /^(Не вдалося|Mislukt|Het lukte niet)/.test(s) || /\([A-Z][A-Z0-9_]{3,}\)\.?$/.test(s);

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-afwerking-b-20261112');
  const taal: string[] = [];
  const paar = (waar: string, uk: string, nl: string) => { taal.push(...taalFouten(waar, uk, nl)); };

  // ------------------------------------------------------------------ 1. тексти відмов
  {
    const af = await laad(import('../../src/agenda/abonnement-fouten'));
    const tekst = fn<(c: string, l: 'uk' | 'nl') => string>(af, 'foutCodeTekst');
    const codes = ['CALDAV_AFGEKAPT', 'AGENDA_TE_VAAK', 'RATE_LIMITED', 'CALDAV_AL_BEZIG', 'CALDAV_AANBIEDER_FOUT', 'ICS_AANBIEDER_FOUT'];
    const zonder = codes.filter((c) => !tekst || algemeen(tekst(c, 'uk')) || algemeen(tekst(c, 'nl')));
    check('agenda (g08): eigen uk/nl-tekst voor CALDAV_AFGEKAPT, AGENDA_TE_VAAK, CALDAV_AL_BEZIG, *_AANBIEDER_FOUT en 429 RATE_LIMITED', !zonder.length, zonder.join(', '));
    if (tekst) for (const c of codes) paar(`agenda ${c}`, tekst(c, 'uk'), tekst(c, 'nl'));
    const code = fn<(e: unknown, s?: string) => string>(af, 'agendaFoutCode');
    check('agenda: 429 {error: RATE_LIMITED, fout: AGENDA_TE_VAAK} → de agendacode, geen kale RATE_LIMITED',
      !!code && code({ message: 'RATE_LIMITED', response: { data: { error: 'RATE_LIMITED', fout: 'AGENDA_TE_VAAK' } } }) === 'AGENDA_TE_VAAK' && code(new Error('NETWORK_ERROR')) === 'NETWORK_ERROR');
    const ag = lees('src/agenda/Agenda.tsx');
    check('agenda: «Оновити» (ICS en CalDAV) heeft een .catch en toont CALDAV_AL_BEZIG — geen stille .then(laad) meer',
      !/Vernieuwen\(rij\.id\)\.then\(laad\)/.test(ag) && ag.includes("vernieuw('ics', rij.id)") && ag.includes("vernieuw('caldav', rij.id)") && /\.catch\(\(e: unknown\) => zet\(agendaFoutCode\(e/.test(ag) && ag.includes("haal.fout === 'CALDAV_AL_BEZIG'"));
    check('agenda v3: synchronisatiefout leest de agendacode (AGENDA_TE_VAAK) en toont de tekst',
      lees('src/agenda/v3/haken/gebruikAgendaGegevens.ts').includes("setSyncFout(agendaFoutCode(e, 'SYNC_MISLUKT'))") && lees('src/agenda/v3/onderdelen/Terugkoppeling.tsx').includes('ABONNEMENT_FOUT[syncFout] ? foutCodeTekst(syncFout, lang)'));

    const nt = await laad(import('../../src/notities/tekst'));
    const nf = fn<(l: 'uk' | 'nl', c: string) => string>(nt, 'foutTekst');
    check('notities (g04): ZOEKEN_TE_ZWAAR heeft een eigen tekst met advies (preciezer zoeken)', !!nf && !algemeen(nf('uk', 'ZOEKEN_TE_ZWAAR')) && /Уточніть/.test(nf('uk', 'ZOEKEN_TE_ZWAAR')) && /preciezer/.test(nf('nl', 'ZOEKEN_TE_ZWAAR')));
    if (nf) paar('notities ZOEKEN_TE_ZWAAR', nf('uk', 'ZOEKEN_TE_ZWAAR'), nf('nl', 'ZOEKEN_TE_ZWAAR'));

    const jw = await laad(import('../../src/audit/journaal-weigering'));
    const jt = fn<(l: 'uk' | 'nl', e: unknown, s: 'export' | 'keten') => string>(jw, 'journaalWeigeringTekst');
    const ex = jt ? jt('uk', { message: 'RATE_LIMITED', status: 429, retryAfter: 125 }, 'export') : '';
    const kt = jt ? jt('nl', { message: 'RATE_LIMITED', status: 429, response: { data: { retryAfter: 3600 } } }, 'keten') : '';
    check('journaal (g10i): 429 bij export → «забагато експортів», met wachttijd (~3 хв); ketencontrole → eigen tekst (~60 min)', /експортів/.test(ex) && ex.includes('~3 хв') && /ketencontroles/.test(kt) && kt.includes('~60 min'), `${ex} | ${kt}`);
    check('journaal: STAP_OP_NIET_BESCHIKBAAR en een geweigerde bevestiging hebben uitleg; een gewone fout → \'\' (eigen tekst van de pagina)',
      !!jt && !!jt('uk', { message: 'STAP_OP_NIET_BESCHIKBAAR' }, 'export') && !!jt('nl', { message: 'STEP_UP_REQUIRED' }, 'export') && jt('uk', { message: 'HTTP_500' }, 'export') === '');
    if (jt) for (const [e, s] of [[{ message: 'RATE_LIMITED', retryAfter: 60 }, 'export'], [{ message: 'RATE_LIMITED' }, 'keten'], [{ message: 'STAP_OP_NIET_BESCHIKBAAR' }, 'export'], [{ message: 'STEP_UP_REQUIRED' }, 'export']] as const) paar(`journaal ${JSON.stringify(e)}`, jt('uk', e, s), jt('nl', e, s));
    const ap = lees('src/audit/AuditPagina.tsx');
    check('journaal: AuditPagina gebruikt de uitleg in export én ketencontrole', (ap.match(/journaalWeigeringTekst\(lang, e, '(export|keten)'\)/g) || []).length === 2);

    const ct = await laad(import('../../src/cloud-vnext/tekst'));
    const cf = fn<(l: 'uk' | 'nl', c: string, d?: unknown) => string>(ct, 'foutTekst');
    const cloudCodes = ['RBAC_FORBIDDEN', 'RBAC_PENDING_CANNOT_MUTATE', 'CLOUD_ITEM_TE_GROOT', 'QUOTA_BEREIKT', 'SCHIJF_VOL', 'CLOUD_VNEXT_FOUT', 'CLOUD_SESSIE_AANMAKEN_MISLUKT', 'CLOUD_VNEXT_UIT', 'LADE_GESLOTEN', 'CLOUD_GOOGLE_FILE_BUSY'];
    const cz = cloudCodes.filter((c) => !cf || algemeen(cf('uk', c)) || algemeen(cf('nl', c)) || /Доступно лише після входу/.test(cf('uk', c)));
    check('hmara (g03, g10d): eigen tekst voor alleen-lezen, wachten op goedkeuring, te groot om te openen, quotum, schijf vol, interne fout, sessie, vlag uit, lade dicht, Google bezet', !cz.length, cz.join(', '));
    if (cf) for (const c of cloudCodes) paar(`hmara ${c}`, cf('uk', c), cf('nl', c));
    const q = cf ? cf('uk', 'QUOTA_BEREIKT', { quotaBytes: 2_000_000_000, gebruiktBytes: 1_500_000_000, openBytes: 300_000_000 }) : '';
    const inc = cf ? cf('nl', 'CLOUD_VNEXT_FOUT', { incident: 'a1b2c3d4' }) : '';
    const kwaad = cf ? cf('uk', 'CLOUD_VNEXT_FOUT', { incident: '<img src=x onerror=alert(1)>' }) : '';
    check('hmara: quotum noemt de getallen (1.5 ГБ з 2.0 ГБ, 300 МБ open); interne fout toont het incidentnummer, maar alleen een veilig nummer',
      q.includes('1.5 ГБ') && q.includes('2.0 ГБ') && q.includes('300 МБ') && inc.includes('#a1b2c3d4') && !kwaad.includes('<') && !kwaad.includes('#'), `${q} | ${inc}`);
    check('hmara: het antwoordlichaam gaat mee naar de tekst (cloudFoutTekst, Bron, Integraties)',
      lees('src/cloud-vnext/hulp.ts').includes('foutTekst(lang, code, e instanceof CloudFout ? e.data : undefined)') && lees('src/cloud-vnext/onderdelen/Bron.tsx').includes("e instanceof CloudFout ? e.data : undefined)"));
    const cfw = lees('src/CloudFunctioneelWeergave.tsx');
    check('hmara (oude weergave): weigeringen met uitleg in plaats van «Спробуйте ще раз» bij alle schrijfacties (≥ 9 plekken)',
      /WEIGERING_MET_UITLEG = \/\^\(RBAC_FORBIDDEN\|RBAC_PENDING_CANNOT_MUTATE\|CLOUD_ITEM_TE_GROOT\)\$\//.test(cfw) && (cfw.match(/weigeringTekst\(lang, caught\) \|\|/g) || []).length >= 9
      && cfw.includes("setCaptureError(weigeringTekst(lang, caught) || (code === 'FILE_TOO_LARGE'"));
    const fp = lees('src/foto/FotoPagina.tsx');
    check('foto (g10d): UPLOAD_TE_VEEL, SCHIJF_VOL, BEZIG (ordenen) en alleen-lezen hebben een eigen tekst', ['UPLOAD_TE_VEEL:', 'SCHIJF_VOL:', 'BEZIG:', 'RBAC_FORBIDDEN:'].every((s) => fp.includes(s)));

    const mv = lees('src/McpToestemmingVenster.tsx');
    const i409 = mv.indexOf("else if (status === 409 || code.includes('GRANT_LIMIT'))"), iElders = mv.indexOf("if (code === 'CONSENT_ANDERE_BROWSER') setPhase('elders')");
    check('MCP-toestemming (ai-mcp-14): 409 CONSENT_ANDERE_BROWSER → eigen uitleg «in een andere browser begonnen», vóór «limiet bereikt» (ook 409)',
      iElders > 0 && i409 > iElders && mv.includes("if (codeOf(e) === 'CONSENT_ANDERE_BROWSER') setPhase('elders')") && mv.includes("phase === 'elders'") && /andere browser gestart/.test(mv));
    check('MCP-toestemming: het volledige terugkeeradres (redirectAdres) staat naast de host', mv.includes('redirectAdres?: string') && mv.includes('data-consent-redirect-adres') && mv.includes('{info.redirectAdres}'));
    const tg = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
    check('Telegram (aanmelden-04): tg_fout=ANDERE_BROWSER heeft een eigen tekst (andere browser, niets gewijzigd, niet bevestigen)', tg.includes("terugFout === 'ANDERE_BROWSER'") && /іншому браузері/.test(tg) && /andere browser begonnen/.test(tg));

    const wg = await laad(import('../../src/weigeringen'));
    const dw = fn<(e: unknown) => readonly [string, string] | null>(wg, 'deelWeigering');
    const bw = fn<(e: unknown) => readonly [string, string] | null>(wg, 'beheerWeigering');
    const d = dw ? dw({ message: 'RATE_LIMITED', retryAfter: 600 }) : null;
    check('delen (g02 opm. 13): grens van uitnodigingen → «забагато запрошень», niet verstuurd, ~10 хв', !!d && /Забагато запрошень/.test(d[0]) && d[0].includes('~10 хв') && /niet verstuurd/.test(d[1]));
    const beheerCodes = ['ADMIN_ACCESS_REQUEST_NOT_PENDING', 'ADMIN_ACCESS_REQUEST_TARGET_LOCKED', 'ADMIN_OWNER_ACCOUNT_PROTECTED', 'RBAC_ROLE_FORBIDDEN', 'ADMIN_ACCESS_REQUEST_UPDATE_FAILED', 'ADMIN_USER_UPDATE_FAILED'];
    check('beheer (g11, g10c): eigen tekst voor elk nieuw weigeringscode bij toegangsaanvragen en gebruikers; onbekend → null',
      !!bw && beheerCodes.every((c) => !!bw({ message: c })) && bw({ message: 'HTTP_500' }) === null);
    if (dw) for (const c of ['RATE_LIMITED', 'SHARE_SELF', 'RBAC_ROLE_FORBIDDEN', 'SCOPE_BLOCKS_INVALID']) { const p = dw({ message: c }); if (p) paar(`delen ${c}`, p[0], p[1]); }
    if (bw) for (const c of beheerCodes) { const p = bw({ message: c }); if (p) paar(`beheer ${c}`, p[0], p[1]); }
    const vd = lees('src/VerenigdDienstApp.tsx'), app = lees('src/App.tsx');
    check('delen en beheer: de drie schermen gebruiken de uitleg (App.tsx, VerenigdDienstApp: delen + runAdmin)',
      app.includes('const w = deelWeigering(e); if (w) { setMessage(') && vd.includes('const w=deelWeigering(e);if(w){say(w[0],w[1]);return}') && vd.includes('const w=beheerWeigering(e);if(w){say(w[0],w[1])'));
    const agf = lees('src/agenten/fouten.ts');
    check('MCP-console (toets-g10d №5): TOOL_FAILED toont het incidentnummer (alleen een veilig nummer) en zegt wat te doen', agf.includes("if (code === 'TOOL_FAILED')") && agf.includes('/^[A-Za-z0-9-]{1,40}$/.test(nr)') && /номер для власника/.test(agf));
    const huisInt = lees('src/huis/onderdelen/Integraties.tsx');
    check('oselя (g02): ontdekken meldt eerlijk dat de lijst op 2000 is afgekapt (veld afgekapt)', huisInt.includes('data-hv-ontdekt-afgekapt') && huisInt.includes('afgekapt: Number(d.afgekapt) || 0'));
    check('overige nieuwe codes: ACCOUNT_NOT_APPROVED_FORBIDDEN (bevestigen vanaf ander apparaat), GITHUB_TAK_ONGELDIG, Google-bestand bezet (429)',
      lees('src/apparaat-bevestiging/teksten.ts').includes('ACCOUNT_NOT_APPROVED_FORBIDDEN:') && lees('src/github/github-client.tsx').includes('GITHUB_TAK_ONGELDIG: [') && lees('src/DriveBrowser.tsx').includes('status===429?t('));
  }

  // ------------------------------------------------------------------ 2. сповіщення
  {
    const ms = await laad(import('../../shared/melding-soorten'));
    const bekend = fn<(k: unknown) => boolean>(ms, 'isBekendeSoort');
    check('meldingen (g10c): mail_queue_refused en mail_queue_cancelled staan in de tabel (type post)', !!bekend && bekend('mail_queue_refused') && bekend('mail_queue_cancelled'));
    const ur = await laad(import('../../shared/meldingen-v2/uitleg-register'));
    const uitleg = fn<(m: Record<string, unknown>) => { id: string; wat: readonly [string, string]; waarom: readonly [string, string]; doen: readonly [string, string] }>(ur, 'uitlegVoor');
    const m = (x: Record<string, unknown>) => ({ id: 'x', ernst: 'info', titel: '', dienst: 'site', ...x });
    const verwacht: Array<[string, Record<string, unknown>]> = [
      ['beveiliging-zekering', { soort: 'beveiliging.zekering', titel: 'Захист «RLS» автоматично вимкнено' }],
      ['notities-zoeken-te-zwaar', { soort: 'security', titel: 'Пошук у нотатках зупинено: надто важкий / Zoeken in notities gestopt: te zwaar' }],
      ['mail-wachtrij', { soort: 'mail_queue_refused', dienst: 'post', titel: 'Запланований лист не надіслано' }],
      ['cloud-alleen-lezen', { soort: 'cloud_alleen_lezen', dienst: 'cloud', titel: 'x' }],
      ['agenda-grens', { soort: 'agenda', dienst: 'agenda', titel: 'Забагато оновлень календаря / Te veel agenda-verversingen' }],
      ['grens-uitnodigingen', { soort: 'security_warning', titel: 'Ліміт запрошень до оселі вичерпано / Limiet voor uitnodigingen voor een woning bereikt' }],
    ];
    const mis = verwacht.filter(([id, x]) => !uitleg || uitleg(m(x)).id !== id).map(([id]) => id);
    check('meldingencentrum: nieuwe weigeringen en zekeringen hebben een eigen, uitgebreide uitleg (wat, waarom, gevolg, wat te doen)', !mis.length, mis.join(', '));
    check('meldingencentrum: een gewone beveiligingsmelding valt niet in de nieuwe uitleg', !!uitleg && !['notities-zoeken-te-zwaar', 'grens-uitnodigingen'].includes(uitleg(m({ soort: 'security', titel: 'Passkey toegevoegd' })).id));
    if (uitleg) for (const [, x] of verwacht) { const u = uitleg(m(x)); for (const k of ['wat', 'waarom', 'doen'] as const) paar(`uitleg ${u.id}.${k}`, u[k][0], u[k][1]); }
  }

  // ------------------------------------------------------------------ 3. оселя й локальні сліди
  {
    const hp = lees('src/huis/HuisPagina.tsx');
    const iStart = hp.indexOf("data-hv-start='1'"), iUitn = hp.indexOf('<UitnodigingenVoorMij'), iMaak = hp.indexOf("'Створити оселю'");
    check('oselя (g02): «Запрошення для вас» op het startscherm zonder eigen woning (tussen de kop en «Створити оселю»)', iStart > 0 && iUitn > iStart && iMaak > iUitn && hp.includes("import UitnodigingenVoorMij from './onderdelen/UitnodigingenVoorMij'"));
    const ov = lees('src/huis/onderdelen/Overzicht.tsx');
    check('oselя (g02 opm. 12): «Огляд» herinnert aan open uitnodigingen en leidt naar «Налаштування»', ov.includes('huisClient.uitnodigingenVoorMij()') && ov.includes('data-hv-uitnodigingen-herinnering') && ov.includes("naarTab('settings')"));

    const ls = await laad(import('../../src/lokale-sporen'));
    const ak = await laad(import('../../src/account-sleutel'));
    const wis = fn<(id: string, o: unknown) => number>(ls, 'wisLokaleSporen');
    const wisAlles = fn<(o: unknown) => number>(ls, 'wisAlleLokaleSporen');
    const sleutel = fn<(v: unknown) => string>(ak, 'cacheAccountKey');
    const opslag = (keys: string[]) => { const m = new Map(keys.map((k) => [k, '{}'])); return { m, o: { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => { m.delete(k); }, getItem: (k: string) => m.get(k) ?? null } }; };
    let ok = false, okAlles = false;
    if (wis && wisAlles && sleutel) {
      const a = sleutel('user-a'), b = sleutel('user-b');
      const s = opslag([`mr-notitie-klad:${a}:prive:n1`, `mr-notitie-klad:${a}:technisch:nieuw`, `mr-notitie-klad:${b}:prive:n2`, 'iets-anders']);
      wis('user-a', s.o);
      ok = !s.m.has(`mr-notitie-klad:${a}:prive:n1`) && !s.m.has(`mr-notitie-klad:${a}:technisch:nieuw`) && s.m.has(`mr-notitie-klad:${b}:prive:n2`) && s.m.has('iets-anders');
      const s2 = opslag([`mr-notitie-klad:${a}:prive:n1`, `mr-notitie-klad:${b}:prive:n2`, 'iets-anders']);
      wisAlles(s2.o);
      okAlles = s2.m.size === 1 && s2.m.has('iets-anders');
    }
    check('lokale sporen (g11 aanv-ronde1-07): afmelden wist de notitieconcepten van DIT account (korte accountsleutel), andere accounts blijven', ok);
    check('lokale sporen: «overal afmelden» wist de notitieconcepten van alle accounts', okAlles);
    check('notities: één voorvoegsel voor schrijven en wissen (notities-client neemt het van lokale-sporen)', lees('src/notities/notities-client.ts').includes("import { NOTITIE_KLAD_VOORVOEGSEL } from '../lokale-sporen'"));
  }

  // ------------------------------------------------------------------ 4. «Захист» і пошта
  {
    const bv = lees('src/beveiliging/Beveiliging.tsx');
    check('Захист (g07): de noodschakelaar van de herbevestiging (stapOp uit /beveiliging/stand) staat boven de kaarten, rood of oranje, met de tekst van de server',
      bv.includes('setStapOp(d.stapOp ?? null)') && bv.includes('<StapOpStrook lang={lang} stand={stapOp} />') && bv.includes("data-stapop-ernst={stand.ernst}") && bv.includes("lang === 'uk' ? stand.tekst[0] : stand.tekst[1]"));
    const af = lees('src/afzenders/AfzenderBeeldInstellingen.tsx');
    check('post (post-06): keuze «Логотипи невідомих відправників» — «Вимкнено» tenzij uitdrukkelijk «Завжди (!)», met uitleg van het risico en bevestiging',
      af.includes("value={v?.onbekendeAfzenders === true ? 'altijd' : 'uit'}") && af.includes('Завжди (!)') && af.includes('void laden({ onbekendeAfzenders: altijd })') && af.includes('window.confirm(') && /стеження/.test(af));
  }

  // ------------------------------------------------------------------ 5. лише людина / не читати ШІ
  {
    const knoppen: Array<[string, string[]]> = [
      ['src/AiToestemmingen.tsx', ['onClick={alleenMens(() => void act(`preset:${id}`', 'onSubmit={alleenMens((e: { preventDefault: () => void }) =>']],
      ['src/ai-bevestiging/BevestigingenPaneel.tsx', ['onClick={alleenMens(() => void besluit(item, true))}', 'onClick={alleenMens(() => void besluit(item, false))}']],
      ['src/agenten/AiToegangTab.tsx', ['onClick={alleenMens(() => schakel(s.id))}', 'onClick={alleenMens(bevestigJa)}', 'onClick={alleenMens(() => void bewaar())}']],
      ['src/agenten/SiteSchakelaars.tsx', ['zet(r.sleutel, e.target.checked))}']],
      ['src/agenten/AiVerbinden.tsx', ['onClick={alleenMens(eenKlik)}', 'onClick={alleenMens(() => void handmatig())}', 'void zetDuur(e.target.value as DuurId))}']],
      ['src/agenten/AgentBord.tsx', ['onClick={alleenMens(() => maakToken())}', 'zetCap(c.id, e.target.checked))}']],
    ];
    const mis = knoppen.filter(([f, s]) => { const t = lees(f); return !t.includes('{...geenAi}') || !/import \{ alleenMens, geenAi(, verborgenVoorAi)? \} from '\.\.?\/menselijke-actie'/.test(t) || !s.every((x) => t.includes(x)); }).map(([f]) => f);
    check('extensie-02 (g10a-2): knoppen die een AI rechten geven — zone data-ai-geen-actie én alleen een echte klik (6 schermen)', !mis.length, mis.join(', '));
    const geheimen = ['src/agenten/AiVerbinden.tsx', 'src/agenten/AgentBord.tsx', 'src/Toegangscodes.tsx', 'src/ApiPlatformWeergave.tsx', 'src/toegangslaag-panelen.tsx', 'src/HerstelcodesSectie.tsx', 'src/aanmeld-vnext/onderdelen/MethodeDetail.tsx', 'src/SleutelkluisSectie.tsx'];
    const zonder = geheimen.filter((f) => !lees(f).includes('{...verborgenVoorAi}'));
    check('extensie-09 (g10a-3): eenmalige geheimen expliciet met data-ai-verborgen (niet alleen via de klassenlijst van de extensie)', !zonder.length, zonder.join(', '));
    const tl = lees('src/toegangslaag-panelen.tsx');
    check('extensie-09: TOTP-geheim én tijdelijk wachtwoord in toegangslaag-panelen', (tl.match(/\{\.\.\.verborgenVoorAi\}/g) || []).length >= 2);
  }

  // ------------------------------------------------------------------ 5b. на прохання координатора (файли g10f вільні)
  {
    const sb = lees('src/ssh/SshBeheer.tsx');
    check('SSH (geheimen-03, g10f): de kaart «SSH-сертифікати» geeft uit via uitdaging → passkey → uitgifte (sshCertificaatAanvragen), niet meer rechtstreeks',
      /import \{ (FOUTEN as UITGIFTE_FOUTEN, )?sshCertificaatAanvragen \} from '\.\/SshCertificaat'/.test(sb) && sb.includes('await sshCertificaatAanvragen(basis(), publiek.trim(), minuten)') && !sb.includes("api.post('/api/ssh-ca/uitgifte', { ...basis(), publiek: publiek.trim(), minuten })"));
    check('SSH (g10f, origin): kaart gebruikt de teksten van de uitgifte (SSH_CA_ORIGIN, PASSKEY_ORIGIN_ONJUIST) en zegt buiten admin/id waar uitgeven wel kan; de tegel in de technische laag ook',
      sb.includes('SSH_FOUTEN[code] ?? UITGIFTE_FOUTEN[code]') && sb.includes('data-ssh-elders') && /export const FOUTEN/.test(lees('src/ssh/SshCertificaat.tsx')) && lees('src/ssh/SshCertificaat.tsx').includes('SSH_CA_ORIGIN:')
      && lees('src/tech/TechLaag.tsx').includes('const SSH_HIER = ') && lees('src/tech/TechLaag.tsx').includes('видача — на admin.tarasevych.com'));
    const tgs = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
    check('Telegram (aanmelden-04, symbool): het symbool van het verzoek staat bij «Відкрити Telegram» met uitleg uk/nl (zelfde symbool in de bot, anders «Це не я»)',
      tgs.includes('symbool?: Symbool') && tgs.includes('data-tg-symbool={lopend.symbool.id}') && tgs.includes('{lopend.symbool.emoji}') && tgs.includes('«Це не я»') && tgs.includes('«Dit ben ik niet»'));
    const msr = await laad(import('../../shared/meldingen-soorten'));
    const msi = await laad(import('../../shared/melding-soorten'));
    const sinfo = fn<(k: unknown) => { type: string; ernst: string }>(msi, 'soortInfo');
    const svv = fn<(k: unknown) => string>(msr, 'sfeerVolgensVoorvoegsel');
    check('cloud_alleen_lezen (afwerking A): type cloud, ernst info, sfeer prive — ook volgens het voorvoegsel van 0107, dus zonder migratie',
      !!sinfo && sinfo('cloud_alleen_lezen').type === 'cloud' && sinfo('cloud_alleen_lezen').ernst === 'info' && ((msr.SFEER_PER_SOORT || {}) as Record<string, string>).cloud_alleen_lezen === 'prive' && !!svv && svv('cloud_alleen_lezen') === 'prive');
    const md = lees('src/McpDienstWeergave.tsx');
    check('bord (integraties-08, g10f): kaarten van derden uit GitHub — kolom «Вхідні» (status inkomend) vóór de wachtrij en een zichtbare waarschuwing op de kaart',
      md.includes('const KOLOMMEN = [INKOMEND, ...statuses] as const;') && md.includes('KOLOMMEN.map((status)') && md.includes('data-board-derden') && md.includes('thirdParty?: boolean'));
    const ms = await laad(import('../../shared/meldingen-soorten'));
    const reg = (ms.SFEER_PER_SOORT || {}) as Record<string, string>;
    const prive = (ms.PRIVE_SOORTEN || []) as string[];
    const vv = fn<(k: unknown) => string>(ms, 'sfeerVolgensVoorvoegsel');
    check('sferen: mail_queue_* geregistreerd als prive, niet in de letterlijke lijst van 0107, en de voorvoegselregel van 0107 geeft ook prive (geen migratie nodig)',
      reg.mail_queue_refused === 'prive' && reg.mail_queue_cancelled === 'prive' && !prive.includes('mail_queue_refused') && !!vv && vv('mail_queue_refused') === 'prive' && vv('mail_queue_cancelled') === 'prive');
  }

  // ------------------------------------------------------------------ 6. версія розширення
  {
    const m = JSON.parse(lees('extension/manifest.json') || '{}') as { version?: string };
    check('extensie: versie 0.9.3 (bridge/shared/background veranderd door SEC-002)', m.version === '0.9.3', String(m.version));
  }

  check('мовний закон: усі нові тексти — українська без латиниці та нідерландська без англійських слів', !taal.length, taal.slice(0, 6).join(' | '));
  return einde();
}
