// IDENTITEIT-014 (фаза 3, крок «aanmelden», 14.11.2026): стара панель способів входу.
// (а) каталог інших способів (id aanmeldmethoden-catalogus) і стан Telegram; (б) рядок пароля є завжди (id aanmeldmethoden-wachtwoord),
// без пароля — «Задати пароль» у межах сервера; (в) автентифікатор: QR (спільний компонент, прихований від ШІ), «Замінити автентифікатор»,
// попередження про нові коди відновлення, зрозумілі тексти відмов. Поведінка сервера — через справжні маршрути проти одноразової бази
// й підробленого Google (tests/eenheid/hulp). Лише вигадані дані; назовні не йде нічого.
// Oud aanmeldpaneel: catalogus, wachtwoordrij altijd, QR + authenticator vervangen, waarschuwing over herstelcodes, echte serverroutes.
// Запуск: . <testenv> && node scripts/eenheidstests.mjs identiteit-014-aanmelden.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';
import { AccessPlanePanels, WACHTWOORD_MAX, WACHTWOORD_MIN } from '../../src/toegangslaag-panelen';
import { Qr, qrPad } from '../../src/platform/Qr';
import { foutNaarTekst } from '../../src/weigeringen';
import { AndereMethodenWeergave } from '../../src/AndereAanmeldMethoden';

type Basis = Parameters<typeof AccessPlanePanels>[0];
const kyr = /[А-Яа-яІіЇїЄєҐґ]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-014-aanmelden');

  // ================================================================ QR: спільний компонент
  {
    const otp = 'otpauth://totp/MijProstir:a%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=MijProstir&algorithm=SHA1&digits=6&period=30';
    const pad = qrPad(otp);
    const modules = (pad.d.match(/M/g) || []).length;
    check('QR: модулі для otpauth (версія ≥3, тихе поле 4 модулі), без innerHTML', pad.n >= 29 + 8 && modules > 200 && /^M\d+ \d+h1v1h-1z/.test(pad.d), `n=${pad.n} m=${modules}`);
    const svg = renderToStaticMarkup(createElement(Qr, { tekst: otp, label: 'QR' }));
    check('QR: svg role=img з підписом і data-ai-verborgen (ШІ-розширення не читає ключ)', svg.startsWith('<svg') && svg.includes('role="img"') && svg.includes('aria-label="QR"') && svg.includes('data-ai-verborgen="1"') && !svg.includes('secret='), svg.slice(0, 120));
    const codes = readFileSync('src/Toegangscodes.tsx', 'utf8');
    check('QR: Toegangscodes бере той самий компонент (жодної другої копії qrcode у файлі)', codes.includes("import {Qr} from './platform/Qr'") && !codes.includes('qrcode(') && !codes.includes('function Qr('));
  }

  // ================================================================ тексти відмов (src/weigeringen.ts, ALGEMEEN)
  {
    const fout = (code: string) => ({ response: { data: { error: code } } });
    const codes = ['ACCESS_TOTP_REUSED', 'ACCESS_TOTP_INVALID', 'ACCESS_TOTP_CODE_REQUIRED', 'ACCESS_TOTP_REPLACE_EXPIRED', 'ACCESS_TOTP_NOT_STARTED', 'ACCESS_TOTP_ALREADY_ENROLLED', 'ACCESS_TOTP_KEY_MISSING', 'ACCESS_RECOVERY_PEPPER_MISSING', 'ACCESS_LOCKED_TEMPORARILY', 'ACCESS_PASSWORD_TOO_SHORT', 'ACCESS_PASSWORD_TOO_LONG'];
    const zonder = codes.filter((c) => { const p = foutNaarTekst(fout(c)); return !p || !kyr.test(p[0]) || kyr.test(p[1]) || p[1].length < 15; });
    check('відмови автентифікатора й пароля: зрозумілий текст uk/nl для кожного коду', !zonder.length, zonder.join(','));
    const hergebruikt = foutNaarTekst(fout('ACCESS_TOTP_REUSED'));
    check('ACCESS_TOTP_REUSED каже, що робити (чекати наступний код), а не «код не підходить»', !!hergebruikt && /30/.test(hergebruikt[0]) && /наступного коду/.test(hergebruikt[0]));
    check('невідомий код і далі null (екран показує свій загальний текст)', foutNaarTekst(fout('IETS_ONBEKENDS_014')) === null);
    const w = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
    check('контролер: foutNaarTekst стоїть перед загальним «Код не підходить» (/TOTP|CODE/)', w.indexOf('paar?(lang===\'nl\'?paar[1]:paar[0]):') > 0 && w.indexOf('paar?(lang===\'nl\'?paar[1]:paar[0]):') < w.indexOf("/TOTP|CODE/.test(message)?t(lang,'t20'):"));
  }

  // ================================================================ панель (справжній рендер)
  const data = (extra: Partial<Basis['data']> = {}): Basis['data'] => ({
    architecture: 'access-plane-v1',
    contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 },
    policy: { enabled: {}, mfa: 'optional' },
    methods: [{ id: 'google', enabled: true, configured: true, status: 'active' }, { id: 'password', enabled: true, configured: false, bound: false, status: 'not_configured' }],
    factors: [{ id: 'totp', enabled: true, enrolled: false, status: 'not_enrolled' }],
    bindings: [], usableCount: 1, lockout: { protected: false, reason: '' },
    password: { configured: false, mustChange: false }, totp: { enrolled: false },
    ...extra,
  });
  const basis: Basis = {
    tab: 'methods', lang: 'uk', data: data(), busy: false, notice: '', password: '', setPassword: () => {},
    otpauth: '', secret: '', code: '', setCode: () => {}, recovery: [], tempPassword: '', context: {},
    write: async () => {}, load: async () => {}, nieuweHerstelcodes: async () => {}, totpUitschakelen: async () => {}, recoverySaved: async () => {},
  };
  const html = (p: Partial<Basis>) => renderToStaticMarkup(createElement(AccessPlanePanels, { ...basis, ...p }));
  const telAantal = (s: string, deel: string) => s.split(deel).length - 1;

  {
    const zonder = html({ alleen: 'methods' });
    check('пароль: без пароля рядок є (id aanmeldmethoden-wachtwoord) і пропонує «Задати пароль», без «Прибрати пароль»',
      zonder.includes('id="aanmeldmethoden-wachtwoord"') && zonder.includes('data-wachtwoord="geen"') && zonder.includes('Задати пароль') && !zonder.includes('Прибрати пароль') && zonder.includes('data-wachtwoord-uitleg'));
    const geenMethode = html({ alleen: 'methods', data: data({ methods: [{ id: 'google', enabled: true, configured: true, status: 'active' }] }) });
    check('пароль: рядок існує навіть коли сервер не прислав метод «password»', geenMethode.includes('id="aanmeldmethoden-wachtwoord"'));
    const met = html({ alleen: 'methods', data: data({ password: { configured: true, mustChange: false }, methods: [{ id: 'password', enabled: true, configured: true, bound: true, status: 'active' }] }) });
    check('пароль: заданий пароль → «Керувати», без «Задати пароль»', met.includes('data-wachtwoord="ingesteld"') && met.includes('Керувати') && !met.includes('Задати пароль'));
    const uit = html({ alleen: 'methods', data: data({ methods: [{ id: 'password', enabled: false, configured: false, bound: false, status: 'disabled' }] }) });
    check('пароль: вимкнений власником → пояснення, жодної кнопки задати', uit.includes('data-wachtwoord="uit"') && !uit.includes('data-wachtwoord-knop') && uit.includes('вимкнув власник'));
    check('пароль: межі — ті самі, що на сервері (10..1024)', WACHTWOORD_MIN === 10 && WACHTWOORD_MAX === 1024);
    check('інші способи: блок aanmeldmethoden-catalogus у розділі «Вхід» (Telegram і каталог вантажаться ліниво)', zonder.includes('id="aanmeldmethoden-catalogus"') && zonder.includes('data-aanmeld-catalogus'));
    const bev = html({ alleen: 'security', tab: 'security' });
    check('каталог і рядок пароля не з’являються на сторінці «Безпека»', !bev.includes('aanmeldmethoden-catalogus') && !bev.includes('aanmeldmethoden-wachtwoord'));
    const panelen = readFileSync('src/toegangslaag-panelen.tsx', 'utf8');
    check('панель передає в «Інші способи» роль власника з знімка і ознаку повної секції Telegram; каталог — той самий компонент, що у vNext',
      panelen.includes('admin={!!data.admin} telegramSectie={!!p.telegramSectie}') && panelen.includes("import('./aanmeld-vnext/onderdelen/CatalogusMetStijl')") && readFileSync('src/aanmeld-vnext/onderdelen/CatalogusMetStijl.tsx', 'utf8').includes("export { default } from './AanbiederCatalogus';"));
  }

  // ================================================================ «Інші способи»: Telegram і розміщення (усі стани конфігу)
  {
    // Вигляд — без запитів і без модулів, що читають window під час завантаження; дані дає AndereAanmeldMethodenLaden.
    check('«Інші способи»: лінивий завантажувач бере спільний useAanmeldConfig (без другого запиту)',
      readFileSync('src/AndereAanmeldMethodenLaden.tsx', 'utf8').includes('cfg={useAanmeldConfig()}') && readFileSync('src/toegangslaag-panelen.tsx', 'utf8').includes("lazy(()=>import('./AndereAanmeldMethodenLaden'))"));
    type Cfg = Parameters<typeof AndereMethodenWeergave>[0]['cfg'];
    const am = (cfg: Cfg, admin = false, telegramSectie = false) => renderToStaticMarkup(createElement(AndereMethodenWeergave, { lang: 'uk', admin, telegramSectie, cfg }));
    const aan = { zichtbaar: true, bot: 'x', botId: '1', stand: 'werkt', soort: 'x', status: { stand: 'werkt', soort: 'x' }, plaatsing: { versie: 1 } as never };
    const laden = am(undefined), fout = am(null), uit = am({ ...aan, zichtbaar: false, plaatsing: null }), werkt = am(aan);
    check('Telegram: завантаження / недоступно / не ввімкнено / працює — кожен стан своїм текстом',
      laden.includes('Завантаження…') && fout.includes('Стан недоступний') && uit.includes('Не ввімкнено') && werkt.includes('Працює') && werkt.includes('tone-good') && werkt.includes('data-telegram-stand="werkt"'));
    check('Telegram: з повною секцією на сторінці — лише кнопка переходу до неї', am(aan, false, true).includes('Налаштувати Telegram') && !werkt.includes('Налаштувати Telegram'));
    check('власник: посилання на розміщення (admin.tarasevych.com/sso) лише власнику й лише з увімкненим розміщенням',
      am(aan, true).includes('href="https://admin.tarasevych.com/sso"') && !werkt.includes('data-plaatsing-beheer') && !am({ ...aan, plaatsing: null }, true).includes('data-plaatsing-beheer'));
  }

  {
    const ingesteld = data({ factors: [{ id: 'totp', enabled: true, enrolled: true, status: 'active' }], totp: { enrolled: true } });
    const knop = html({ alleen: 'security', tab: 'security', data: ingesteld, totpVervangen: async () => {} });
    check('автентифікатор: «Замінити автентифікатор» поруч із «Вимкнути», коли контролер дає totpVervangen', knop.includes('data-totp-vervangen') && knop.includes('Замінити автентифікатор') && knop.includes('Вимкнути'));
    const geenKnop = html({ alleen: 'security', tab: 'security', data: ingesteld });
    check('автентифікатор: без totpVervangen (vNext) кнопки немає — поведінка як раніше', !geenKnop.includes('data-totp-vervangen'));
    const otp = 'otpauth://totp/MijProstir:x?secret=JBSWY3DPEHPK3PXP&issuer=MijProstir';
    const vervang = html({ alleen: 'security', tab: 'security', data: ingesteld, otpauth: otp, secret: 'JBSWY3DPEHPK3PXP', totpVervangen: async () => {}, totpVervangenStoppen: () => {} });
    check('заміна: блок нового ключа з QR (прихований від ШІ), старий діє до підтвердження, попередження про коди, «Скасувати заміну»',
      vervang.includes('data-totp-vervanging="1"') && /<svg[^>]*data-ai-verborgen="1"/.test(vervang) && vervang.includes('data-totp-oud-geldig') && vervang.includes('data-totp-herstel-waarschuwing') && vervang.includes('Скасувати заміну') && !vervang.includes('data-totp-vervangen'));
    const zonderVervang = html({ alleen: 'security', tab: 'security', data: ingesteld, otpauth: otp, secret: 'X' });
    check('заміна: без totpVervangen блок нового ключа для налаштованого автентифікатора не показується', !zonderVervang.includes('access-plane-totp-setup'));
    const eerste = html({ alleen: 'security', tab: 'security', otpauth: otp, secret: 'JBSWY3DPEHPK3PXP' });
    check('перше налаштування: QR + попередження про коди відновлення, без «Скасувати заміну»', eerste.includes('access-plane-totp-setup') && eerste.includes('toegangscode-qr') && eerste.includes('data-totp-herstel-waarschuwing') && !eerste.includes('Скасувати заміну'));
    const codes = html({ alleen: 'security', tab: 'security', data: ingesteld, recovery: ['aaaabbbbcc', 'ccccddddee'] });
    const oud = html({ data: ingesteld, recovery: ['aaaabbbbcc', 'ccccddddee'] });
    check('нові коди відновлення видно одразу і на «Безпеці», і в старій формі — рівно одна копія розділу',
      telAantal(codes, 'data-access-section="recovery"') === 1 && codes.includes('aaaa-bbbb-cc') && telAantal(oud, 'data-access-section="recovery"') === 1 && telAantal(oud, 'aaaa-bbbb-cc') >= 1,
      `${telAantal(codes, 'data-access-section="recovery"')} ${telAantal(oud, 'data-access-section="recovery"')}`);
    // Давня вада поруч: «Копіювати» нові коди йшов напряму в navigator.clipboard, без запасного шляху й без спільного тексту відмови.
    const herstel = readFileSync('src/HerstelcodesSectie.tsx', 'utf8');
    check('коди відновлення копіюються через спільний kopieerTekst (запасний шлях), а не напряму через navigator.clipboard',
      herstel.includes("await kopieerTekst(codes.map(opmaak).join('\\n'))") && herstel.includes('KOPIEER_MISLUKT') && !herstel.includes('navigator.clipboard'));
    const w = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
    check('контролер: заміна через totp/start з currentCode після вікна з codeTerug; ключ стирається після confirm/disable',
      w.includes("write('/api/owner/access/totp/start',{currentCode:uit.code})") && w.includes("toegestaan:['totp','herstelcode'],codeTerug:true,actie:'totp-wijzigen'") && w.includes("if(/\\/totp\\/(confirm|disable)$/.test(route)){setOtpauth('');setSecret('');}"));
  }

  // ================================================================ сервер: межі пароля, заміна автентифікатора, старі коди
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `i14a-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  if (Date.now() % 30000 > 20000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
  const stap = Math.floor(Date.now() / 30000);
  try {
    const O = G.browser();
    await O.aanmelden(`sub-i14a-${T}`, eigenaar, { authTime: oud });
    const id = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('id.tarasevych.com', pad, O.ctxBody('identity', extra));
    const oId = await idRij(eigenaar);

    const kort = await id('/api/owner/access/password/set', { password: 'a'.repeat(WACHTWOORD_MIN - 1) });
    const lang = await id('/api/owner/access/password/set', { password: 'a'.repeat(WACHTWOORD_MAX + 1) });
    const grens = await id('/api/owner/access/password/set', { password: 'a'.repeat(WACHTWOORD_MAX) });
    check('сервер: пароль коротший за 10 → ACCESS_PASSWORD_TOO_SHORT, довший за 1024 → ACCESS_PASSWORD_TOO_LONG (до будь-якого підтвердження)',
      kort.status === 400 && kort.data.error === 'ACCESS_PASSWORD_TOO_SHORT' && lang.status === 400 && lang.data.error === 'ACCESS_PASSWORD_TOO_LONG', `${kort.status}/${kort.data.error} ${lang.status}/${lang.data.error}`);
    check('сервер: пароль рівно 1024 без сильного підтвердження → 403 (форма покладається на вікно «Підтвердіть доступ»)', grens.status === 403 && /STEP_UP/.test(String(grens.data.error)), `${grens.status} ${grens.data.error}`);

    // Перше налаштування (як у audit-toegang): свіжий вхід Google → totp/start → confirm.
    await O.aanmelden(`sub-i14a-${T}`, eigenaar, { intent: 'step-up' });
    const s1 = await id('/api/owner/access/totp/start');
    const c1 = await id('/api/owner/access/totp/confirm', { code: totpCode(s1.data.secret, stap - 1) });
    const oudeCodes: string[] = c1.data.recoveryCodes || [];
    check('перше налаштування: відповідь містить otpauth для QR і коди відновлення', s1.status === 200 && String(s1.data.otpauth).startsWith('otpauth://totp/') && c1.status === 200 && oudeCodes.length > 2, `${s1.status} ${c1.status}`);

    // Сильне підтвердження кодом застосунку, а потім той самий код як currentCode → ACCESS_TOTP_REUSED (про це попереджає діалог).
    const so = await id('/api/owner/access/stap-op', { code: totpCode(s1.data.secret, stap) });
    const dubbel = await id('/api/owner/access/totp/start', { currentCode: totpCode(s1.data.secret, stap) });
    check('заміна: той самий код застосунку вдруге → ACCESS_TOTP_REUSED (текст радить чекати наступний код)', so.status === 200 && dubbel.status === 400 && dubbel.data.error === 'ACCESS_TOTP_REUSED' && !!foutNaarTekst({ response: { data: dubbel.data } }), `${so.status} ${dubbel.status} ${dubbel.data.error}`);
    const s2 = await id('/api/owner/access/totp/start', { currentCode: oudeCodes[0] });
    check('заміна: з кодом відновлення сервер видає новий ключ і otpauth для QR', s2.status === 200 && !!s2.data.secret && s2.data.secret !== s1.data.secret && String(s2.data.otpauth).includes(s2.data.secret), `${s2.status} ${s2.body.slice(0, 80)}`);
    const c2 = await id('/api/owner/access/totp/confirm', { code: totpCode(s2.data.secret, stap + 1) });
    const nieuweCodes: string[] = c2.data.recoveryCodes || [];
    const melding = (await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'='access_totp_replaced'", [oId])).rows[0].n;
    check('заміна підтверджена: нові коди відновлення в тій самій відповіді + сповіщення access_totp_replaced', c2.status === 200 && nieuweCodes.length > 2 && !nieuweCodes.includes(oudeCodes[1]) && melding === 1, `${c2.status} melding=${melding}`);
    const oudeCode = await id('/api/owner/access/stap-op', { methode: 'herstelcode', code: oudeCodes[1] });
    const nieuweCode = await id('/api/owner/access/stap-op', { methode: 'herstelcode', code: nieuweCodes[0] });
    check('попередження правдиве: старий код відновлення більше не діє, новий — діє', oudeCode.status === 400 && oudeCode.data.error === 'ACCESS_RECOVERY_INVALID' && nieuweCode.status === 200, `${oudeCode.status}/${oudeCode.data.error} ${nieuweCode.status}`);
    const gezet = await id('/api/owner/access/password/set', { password: `Wachtwoord-${T}` });
    check('пароль: після сильного підтвердження «Задати пароль» працює і знімок каже configured', gezet.status === 200 && gezet.data.password?.configured === true, `${gezet.status} ${gezet.body.slice(0, 80)}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i14a-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
