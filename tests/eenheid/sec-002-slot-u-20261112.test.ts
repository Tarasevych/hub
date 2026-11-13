// SEC-002 · останнє виправлення, інженер «u» (інтерфейс і документація), 12.11.2026.
// Перевіряє висновки наскрізної перевірки перед випуском:
//   1. відмова ролі «лише перегляд» (RBAC_FORBIDDEN) поза хмарою — зрозумілий текст uk/nl у нотатках, оселі, календарі, агентах тощо,
//      розгорнуте пояснення в центрі сповіщень для виду toegang_alleen_lezen;
//   2. нові коди відмов без тексту (межі тіла запиту, JSON_VEREIST, JOURNAAL_NIET_BESCHIKBAAR …) — тексти з порадою;
//   3. документація: нові змінні середовища, вимога passkey для SSH-сертифікатів; дрібниці мовного закону (префікс «ШІ «…»»,
//      workspace_share лише українською, явна реєстрація виду agenda), текст відмови перевірки ланцюжка журналу.
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { taalFouten } from './hulp/taalcontrole';

const lees = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const algemeen = (s: string) => !s || /^(Не вдалося|Mislukt|Het lukte niet)/.test(s) || /\([A-Z][A-Z0-9_]{3,}\)\.?$/.test(s) || /Причина невідома|oorzaak is onbekend/.test(s);

/**
 * Нові коди відмов (diff від основи 11e0aad8 у backend/ і server/), яких до цього кроку не було в жодному тексті src/ і shared/
 * (25 штук; знайдено так: усі коди відмов, нові в diff від основи, шукали в текстах src/, shared/ і extension/). PG_STATEMENT_TIMEOUT_MS і PG_IDLE_IN_TRANSACTION_TIMEOUT_MS — назви змінних
 * середовища, а не відмови: їх описано в документах змінних середовища (п. 3 нижче).
 */
const NIEUWE_CODES = ['APPARAAT_COOKIE_ONGELDIG', 'ARGON2_ONTBREEKT', 'BINDING_RID_ONGELDIG', 'BODY_ABORTED', 'BODY_LENGTH_INVALID', 'BODY_TIMEOUT',
  'CAP_ONBEKEND', 'DNS_TIJD', 'JOURNAAL_NIET_BESCHIKBAAR', 'JSON_VEREIST', 'KIJKER_ALLEEN_LEZEN', 'PROEF_URL_ONGELDIG', 'REMOTE_STATUS_INVALID',
  'REMOTE_STREAM_FAILED', 'SERVER_BUSY', 'SLEUTELKLUIS_KDF_PARAMETERS', 'STORAGE_MOVE_ROLLBACK_FAILED', 'STORAGE_MOVE_SAME_PATH',
  'STORAGE_MOVE_TARGET_EXISTS', 'TOO_MANY_BODIES', 'TOO_MANY_BODY_BYTES', 'WEBHOOK_KOPPELING_WEG', 'WEBHOOK_TIJDELIJK_ONBESLIST',
  // паралельно з цим кроком додав інженер «s»:
  'INVOER_NUL', 'NIEUW_APPARAAT_ANDERE_WEG', 'WEBHOOKS_OPRUIMEN_MISLUKT'];

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-slot-u-20261112');
  const taal: string[] = [];
  const paar = (waar: string, uk: string, nl: string) => { taal.push(...taalFouten(waar, uk, nl)); };

  // ------------------------------------------------------------------ 2. нові коди відмов
  const wt = await import('../../shared/weigering-tekst');
  {
    const zonder = NIEUWE_CODES.filter((c) => !wt.weigeringZin('uk', c) || !wt.weigeringZin('nl', c));
    check('усі 26 нових кодів відмов мають текст uk і nl (що сталося + що робити)', !zonder.length, zonder.join(', '));
    for (const c of [...NIEUWE_CODES, 'RBAC_FORBIDDEN']) { const r = wt.weigeringRegel(c); if (r) { paar(c, r.uk, r.nl); paar(`${c} (doen)`, r.doenUk, r.doenNl); } }
    const druk = wt.weigeringZin('uk', 'SERVER_BUSY', 7) || '';
    check('SERVER_BUSY: «сервер зараз зайнятий, спробуйте за N секунд» з N із Retry-After (7) і типово 5',
      /Сервер зараз зайнятий/.test(druk) && druk.includes('за 7 секунд') && (wt.weigeringZin('uk', 'SERVER_BUSY') || '').includes('за 5 секунд') && (wt.weigeringZin('nl', 'TOO_MANY_BODIES', 3) || '').includes('over 3 seconden'), druk);
    check('weigeringZinUitFout: код і Retry-After беруться з ApiError (message + retryAfter)',
      (wt.weigeringZinUitFout('uk', { message: 'TOO_MANY_BODY_BYTES', retryAfter: 12 }) || '').includes('12 секунд') && wt.weigeringZinUitFout('uk', { message: 'IETS_ANDERS' }) === null);
    check('невідомий код → null (екран лишає власний текст, нічого не вигадуємо)', wt.weigeringZin('uk', 'ONBEKEND_X') === null);
  }
  {
    const fu = await import('../../shared/foutuitleg');
    const codes = ['RBAC_FORBIDDEN', 'JOURNAAL_NIET_BESCHIKBAAR', 'JSON_VEREIST', 'SERVER_BUSY', 'TOO_MANY_BODIES', 'BODY_TIMEOUT'];
    const zonder = codes.filter((c) => !fu.regelTekst('uk', c) || !fu.regelTekst('nl', c));
    check('shared/foutuitleg.ts (одне джерело для «Деталі», агентів, пошти, диска): знає нові коди і HTTP 415', !zonder.length && !!fu.regelTekst('uk', '', 415), zonder.join(', '));
    const u = fu.legUit('uk', { operatie: ['Видати токен', 'Token uitgeven'], dienst: 'mcp', code: 'JOURNAAL_NIET_BESCHIKBAAR', status: 503 });
    check('JOURNAAL_NIET_BESCHIKBAAR (503): пояснення про журнал аудиту, а не хибне «проксі… процес не приймає запитів»',
      u.zeker && /журнал аудиту/.test(u.waarom) && !/Проксі сервера/.test(u.waarom) && /хвилину/.test(u.doen), u.waarom);
    const ag = await import('../../src/agenten/fouten');
    const tr = (uk: string) => uk;
    const t = ag.foutTekst({ message: 'JOURNAAL_NIET_BESCHIKBAAR', status: 503, response: { status: 503, data: { error: 'JOURNAAL_NIET_BESCHIKBAAR' } } }, tr, ['Не вдалося видати токен', 'Token niet uitgegeven']);
    check('сторінка «Підключити ШІ»: токен не видано через журнал → текст про журнал аудиту з порадою', /журнал аудиту/.test(t) && !/Причина невідома/.test(t), t.slice(0, 160));
  }

  // ------------------------------------------------------------------ 1. «лише перегляд» поза хмарою
  {
    const nt = await import('../../src/notities/tekst');
    const ht = await import('../../src/huis/tekst');
    const av = await import('../../src/agenda/AgendaVenster');
    const af = await import('../../src/agenda/abonnement-fouten');
    const st = await import('../../src/afstemming-vnext/tekst');
    const teksten: Array<[string, string, string]> = [
      ['нотатки', nt.foutTekst('uk', 'RBAC_FORBIDDEN'), nt.foutTekst('nl', 'RBAC_FORBIDDEN')],
      ['оселя', ht.foutTekst('uk', 'RBAC_FORBIDDEN'), ht.foutTekst('nl', 'RBAC_FORBIDDEN')],
      ['календар', av.foutTekst('RBAC_FORBIDDEN', 'uk'), av.foutTekst('RBAC_FORBIDDEN', 'nl')],
      ['календар (підписки)', af.foutCodeTekst('RBAC_FORBIDDEN', 'uk'), af.foutCodeTekst('RBAC_FORBIDDEN', 'nl')],
      ['звірка', st.foutTekst('uk', 'RBAC_FORBIDDEN'), st.foutTekst('nl', 'RBAC_FORBIDDEN')],
    ];
    const slecht = teksten.filter(([, uk, nl]) => algemeen(uk) || algemeen(nl) || !/лише перегляд/.test(uk) || !/Змінювати можуть/.test(uk) || !/alleen-lezen/.test(nl) || /RBAC_FORBIDDEN/.test(uk + nl));
    check('RBAC_FORBIDDEN поза хмарою: «ваша роль — лише перегляд; змінювати можуть …» без сирого коду (нотатки, оселя, календар, звірка)',
      !slecht.length, slecht.map(([w, uk]) => `${w}: ${uk}`).join(' | '));
    check('нотатки/оселя: звичайні власні коди не змінено (VERSIE_VEROUDERD, ROL_ALLEEN_LEZEN)',
      /іншому місці/.test(nt.foutTekst('uk', 'VERSIE_VEROUDERD')) && /лише переглядати/.test(ht.foutTekst('uk', 'ROL_ALLEEN_LEZEN')));
    check('оселя: SERVER_BUSY → «сервер зараз зайнятий…», не «Не вдалося (SERVER_BUSY)»', /Сервер зараз зайнятий/.test(ht.foutTekst('uk', 'SERVER_BUSY')));
    const bron = ['src/Toegangscodes.tsx', 'src/ToegangWijziging.tsx', 'src/GastToegang.tsx', 'src/ai-bevestiging/BevestigingenPaneel.tsx', 'src/afzenders/ScanPaneel.tsx',
      'src/afzenders/ContactenWeergave.tsx', 'src/werkblad/WerkbladV3.tsx', 'src/extensie/ExtensieOntgrendeling.tsx', 'src/cloud-vnext/onderdelen/Vastleggen.tsx',
      'src/cloud-vnext/onderdelen/Werkruimtes.tsx', 'src/cloud-vnext/tekst.ts', 'src/agenda/Agenda.tsx'].filter((f) => !/weigeringZin/.test(lees(f)));
    check('інші екрани з запасним «Не вдалося (КОД)» спершу питають shared/weigering-tekst.ts', !bron.length, bron.join(', '));
    // eind-regressie midden-2 (сервер — «s»): людина без ключа доступу бачить пояснення сервера (advies + uitleg), а не загальне «потрібен ключ».
    const tg = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
    check('вхід через Телеграм: при advies NIEUW_APPARAAT_ANDERE_WEG показується uitleg {uk, nl} зі статусу (рядки, обрізані до 600)',
      /s\.advies === 'NIEUW_APPARAAT_ANDERE_WEG' && typeof s\.uitleg\?\.uk === 'string' && typeof s\.uitleg\?\.nl === 'string'/.test(tg)
      && tg.includes("reden === 'passkey-nodig' && andereWeg ? tr(lang, andereWeg.uk, andereWeg.nl)") && tg.includes('slice(0, 600)'));
    const nul = wt.weigeringZin('uk', 'INVOER_NUL') || '';
    check('INVOER_NUL: що сталося (невидимий символ у назві/ідентифікаторі/шляху) і як виправити (набрати заново)', /невидимий символ/.test(nul) && /Наберіть/.test(nul), nul);

    const ur = await import('../../shared/meldingen-v2/uitleg-register');
    const m = { id: '1', dienst: 'hub', soort: 'toegang_alleen_lezen', ernst: 'info', titel: 'Зміну відхилено / Wijziging geweigerd', tijd: Date.now() } as unknown as Parameters<typeof ur.uitlegVoor>[0];
    const u = ur.uitlegVoor(m);
    check('центр сповіщень: вид toegang_alleen_lezen → розгорнуте пояснення (хто, чому, наслідок, що робити, права), не «загальне»',
      u.id === 'rol-alleen-lezen' && /лише перегляд/.test(u.wat[0]) && /роль/.test(u.doen[0]) && !!u.rechten && u.acties.length > 0, u.id);
    check('центр сповіщень: cloud_alleen_lezen лишається своїм поясненням', ur.uitlegVoor({ ...m, soort: 'cloud_alleen_lezen' }).id === 'cloud-alleen-lezen');
    for (const k of ['wat', 'waarom', 'gevolg', 'doen'] as const) paar(`uitleg rol-alleen-lezen ${k}`, u[k][0], u[k][1]);
    // Нові сповіщення безпеки від «s» (вид security): форма без JSON і згода ШІ в іншому браузері — власні картки, не загальна «безпека».
    const jv = ur.uitlegVoor({ ...m, soort: 'security', titel: 'Відхилено запит-форму з вашим сеансом / Formulierverzoek met uw sessie geweigerd' });
    const cb = ur.uitlegVoor({ ...m, soort: 'security', titel: 'Запит на підключення ШІ відкрито в іншому браузері — доступ не видано / Verzoek voor een AI-koppeling geopend in een andere browser — geen toegang gegeven' });
    check('центр сповіщень: «json-vereist» і «consent-andere-browser» мають власне розгорнуте пояснення', jv.id === 'json-vereist' && cb.id === 'consent-andere-browser', `${jv.id}, ${cb.id}`);
    for (const x of [jv, cb]) for (const k of ['wat', 'waarom', 'gevolg', 'doen'] as const) paar(`uitleg ${x.id} ${k}`, x[k][0], x[k][1]);

    const ms = await import('../../shared/melding-soorten');
    const sf = await import('../../shared/meldingen-soorten');
    check('вид toegang_alleen_lezen зареєстровано (тип «toegang», сфера prive, і за префіксом 0107 теж prive — без міграції)',
      !!ms.MELDING_SOORTEN.toegang_alleen_lezen && sf.SFEER_PER_SOORT.toegang_alleen_lezen === 'prive' && sf.NA_0107_VIA_VOORVOEGSEL.has('toegang_alleen_lezen') && sf.sfeerVolgensVoorvoegsel('toegang_alleen_lezen') === 'prive'
      && ms.soortInfo('toegang_alleen_lezen').type === 'toegang');
    check('interface п.9: вид agenda зареєстровано явно (MELDING_SOORTEN, SFEER_PER_SOORT, NA_0107_VIA_VOORVOEGSEL)',
      ms.MELDING_SOORTEN.agenda?.type === 'agenda' && sf.SFEER_PER_SOORT.agenda === 'prive' && sf.NA_0107_VIA_VOORVOEGSEL.has('agenda') && sf.sfeerVolgensVoorvoegsel('agenda') === 'prive');
  }

  // ------------------------------------------------------------------ 3. дрібниці мовного закону, журнал
  {
    const gb = await import('../../src/goedkeuring-beschrijving');
    const nl = (uk: string, n: string) => n; const uk = (u: string) => u;
    const a = { client: 'ШІ «site:jan»', agent: '', verbinding: '' } as Parameters<typeof gb.aanvragerTekst>[0];
    check('interface п.9: префікс «ШІ «…»» показується нідерландською як «AI «…»», українською — без змін',
      gb.aanvragerTekst(a, nl).tekst.startsWith('AI «site:jan»') && gb.aanvragerTekst(a, uk).tekst.startsWith('ШІ «site:jan»') && gb.aanvragerTekst({ ...a, client: 'Claude' }, nl).tekst.startsWith('Claude'));
    const cm = await import('../../src/canoniek-meldingen');
    check('interface п.9: старі українські сповіщення workspace_share показуються нідерландською (заголовок і текст)',
      cm.taalDeel('Новий спільний простір', 'nl') === 'Nieuwe gedeelde ruimte' && cm.taalDeel('Олена надав вам доступ.', 'nl') === 'Олена gaf u toegang.'
      && cm.taalDeel('Спільний доступ: Звіт', 'nl') === 'Gedeelde toegang: Звіт' && cm.taalDeel('Новий спільний простір', 'uk') === 'Новий спільний простір'
      && cm.taalDeel('Новий простір / Nieuwe ruimte', 'nl') === 'Nieuwe ruimte');
    const jw = await import('../../src/audit/journaal-weigering');
    const k = jw.journaalWeigeringTekst('uk', { message: 'STAP_OP_NIET_BESCHIKBAAR' }, 'keten');
    const e = jw.journaalWeigeringTekst('nl', { message: 'STAP_OP_NIET_BESCHIKBAAR' }, 'export');
    check('interface п.5: перевірка ланцюжка має власний текст («Перевірка ланцюжка…»), експорт — свій', /^Перевірка ланцюжка/.test(k) && /^Exporteren/.test(e));
    paar('journaal keten', k, jw.journaalWeigeringTekst('nl', { message: 'STAP_OP_NIET_BESCHIKBAAR' }, 'keten'));
  }

  // ------------------------------------------------------------------ 3. документація
  {
    const docs = ['ЗМІННІ-СЕРЕДОВИЩА.uk.md', 'ЗМІННІ-СЕРЕДОВИЩА.md', 'OMGEVINGSVARIABELEN.nl.md'];
    const mis = docs.flatMap((d) => ['PG_STATEMENT_TIMEOUT_MS', 'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', 'API_LIMIT_GEHEUGEN_MAX'].filter((v) => !new RegExp(`\\| \`${v}\` \\|`).test(lees(d))).map((v) => `${d}:${v}`));
    check('interface п.6: PG_STATEMENT_TIMEOUT_MS, PG_IDLE_IN_TRANSACTION_TIMEOUT_MS, API_LIMIT_GEHEUGEN_MAX описано в обох мовних документах', !mis.length, mis.join(', '));
    check('interface п.6: для PG_* сказано «0 = вимкнено / 0 = uit»', /`0` = вимкнено/.test(lees('ЗМІННІ-СЕРЕДОВИЩА.uk.md')) && /`0` = uit/.test(lees('OMGEVINGSVARIABELEN.nl.md')));
    const ssh = ['deploy/SSH-CA.nl.md', 'deploy/ЦЕНТР-СЕРТИФІКАЦІЇ-БЕЗПЕЧНОЇ-ОБОЛОНКИ.uk.md', 'deploy/ЦЕНТР-СЕРТИФІКАЦІЇ-БЕЗПЕЧНОЇ-ОБОЛОНКИ.md',
      'deploy/DRAAIBOEK-VEILIGE-UITROL.nl.md', 'deploy/ІНСТРУКЦІЯ-БЕЗПЕЧНОГО-РОЗГОРТАННЯ.uk.md', 'deploy/ІНСТРУКЦІЯ-БЕЗПЕЧНОГО-РОЗГОРТАННЯ.md']
      .filter((d) => { const s = lees(d); return !(s.includes('ssh-ca-teken-passkey') && s.includes('goedkeur-passkeys.json') && s.includes('mijn-ruimte-passkey toevoegen') && /\*\*!\*\*|\(!\)/.test(s)); });
    check('interface п.7: вимогу passkey для SSH-сертифікатів, як додати ключ і небезпечне «ssh-ca-teken-passkey: false» (!) описано uk/nl', !ssh.length, ssh.join(', '));
    check('interface п.7: застарілий рядок «Een verse bevestiging van de aanmelding (passkey of Google).» оновлено', !/\(passkey of Google\)\.\n/.test(lees('deploy/SSH-CA.nl.md')));
  }

  check('мовний закон: нові тексти — українська без латиниці, нідерландська без англійських слів', !taal.length, taal.slice(0, 6).join(' | '));
  return einde();
}
