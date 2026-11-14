// IDENTITEIT-015 (крок «sleutels-gasten», етапи 3.4 і 2.5 плану): довіра до ключа доступу (міграція 0274, маршрути passkeys/vertrouwen
// і vertrouwen-intrekken з посиленим підтвердженням, аудит, сповіщення, ідемпотентність, чужий ключ — 404), стан ключа «Вхід і
// підтвердження» / «Лише підтвердження» (прапорець aanmelden-passkey), гостьові коди для схвалених не-власників за прапорцем
// gastcodes-iedereen (типово «Тільки я»; сервер перевіряє власника коду; гість бачить лише дані власника коду; вимкнення прапорця гасить
// коди й гостьові сеанси), «Що робити, якщо…» з переходами до точного місця і перемикачем нагадування про резервний доступ.
// Поведінка — через справжні маршрути backend/index.ts проти тестової бази й підробленого Google (tests/eenheid/hulp). Лише вигадані дані.
// Vertrouwen in een toegangssleutel en gastcodes voor anderen — via de echte routes; niets gaat naar buiten.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-sleutels-gasten.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { ipHash } from '../../server/platform/audit';
import { checker, nepGoogle } from './hulp/nep-google';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVolgensVoorvoegsel } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { NOOIT_ONTHOUDEN } from '../../backend/stap-op';
import { ScenariosWeergave } from '../../src/herstel/Scenarios';
import { ReserveHerinneringWeergave } from '../../src/herstel/ReserveHerinnering';
import type { AccessPlanePanels } from '../../src/toegangslaag-panelen';
import type { KluisKern } from '../../src/herstel/reserve';

type Basis = Parameters<typeof AccessPlanePanels>[0];
const kyr = /[А-Яа-яІіЇїЄєҐґ]/;
const ORIGIN = 'https://id.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-sleutels-gasten');

  // ================================================================ (а) статичні частини
  {
    const mig = readFileSync('migrations/0274_sleutels_vertrouwen_gastcodes.sql', 'utf8');
    check('міграція 0274: повторювана (ADD COLUMN IF NOT EXISTS, обмеження з перевіркою існування, ON CONFLICT DO NOTHING), прапорець «Тільки я»',
      ['vertrouwd_op', 'vertrouwd_wie', 'vertrouwd_sessie'].every((k) => mig.includes(`ADD COLUMN IF NOT EXISTS ${k}`)) && mig.includes('IF NOT EXISTS (SELECT 1 FROM pg_constraint')
      && mig.includes('ON CONFLICT (sleutel) DO NOTHING') && /'gastcodes-iedereen',[\s\S]*true, false, 0, ARRAY\(SELECT id FROM app\.records WHERE tbl = 'users' AND data->>'role' = 'owner'/.test(mig));
    const v = VLAG_UITLEG['gastcodes-iedereen'];
    check('прапорець gastcodes-iedereen: «!» і пояснення ризику обома мовами (що, коли, наслідок)', !!v && v.naam[0].startsWith('!') && v.naam[1].startsWith('!') && /Ризик/.test(v.wanneer[0]) && /Risico/.test(v.wanneer[1]) && !!v.gevolg[0] && !!v.wat[1]);
    const soorten = ['passkey_vertrouwd', 'passkey_vertrouwen_ingetrokken'];
    check('сповіщення: два нові типи безпеки, сфера «prive», правило префікса 0107 дає те саме',
      soorten.every((k) => MELDING_SOORTEN[k]?.type === 'beveiliging' && SFEER_PER_SOORT[k] === 'prive' && sfeerVolgensVoorvoegsel(k) === 'prive' && NA_0107_VIA_VOORVOEGSEL.has(k)));
    check('сповіщення: власне пояснення «sleutel-vertrouwen» (а не загальне «безпека»)',
      soorten.every((k) => uitlegVoor({ id: k, dienst: 'identity', soort: k, ernst: 'info', titel: 't', tijd: 0, gelezen: false } as never).id === 'sleutel-vertrouwen'));
    check('посилене підтвердження: обидва шляхи довіри = дія «passkey-vertrouwen», яку ніколи не «запам’ятовують»',
      actieVoorPad('/api/owner/access/passkeys/vertrouwen') === 'passkey-vertrouwen' && actieVoorPad('/api/owner/access/passkeys/vertrouwen-intrekken') === 'passkey-vertrouwen' && NOOIT_ONTHOUDEN.includes('passkey-vertrouwen'));
    const ui = readFileSync('src/ToegangssleutelsSectie.tsx', 'utf8');
    check('UI ключів: позначки «Довірений» і «Вхід і підтвердження»/«Лише підтвердження», вікно BevestigDialoog перед довірою, пояснення різниці',
      ui.includes('data-passkey-vertrouwd') && ui.includes("data-passkey-gebruik={metAanmelden?'aanmelden':'bevestigen'}") && ui.includes("<BevestigDialoog open={!!vv} id='passkey-vertrouwen'") && ui.includes('data-verschil-vertrouwen') && ui.includes("data-passkey-stand="));
    const tc = readFileSync('src/Toegangscodes.tsx', 'utf8');
    check('UI кодів: без права — пояснення з переходом до «Доступу до простору» (а не порожнє місце); перемикач «Усі дозволені / Лише вибрані»',
      tc.includes('data-toegangscodes-niet-beschikbaar') && tc.includes("href='/sharing'") && tc.includes("data-scope-modus='alle'") && tc.includes("data-scope-modus='gekozen'") && !/if\(geenToegang\)return null;/.test(tc));
    check('UI сесій: без гостьових кодів — пояснення замість порожнечі', readFileSync('src/SessiesOverzicht.tsx', 'utf8').includes('data-gast-sessies-uit'));
  }

  // ================================================================ (б) сценарії відновлення: переходи до точного місця, перемикач нагадування
  {
    const snap = (o: { totp?: boolean; rest?: number } = {}): Basis['data'] => ({
      architecture: 'access-plane-v1',
      contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 },
      policy: { enabled: {}, mfa: 'optional' },
      methods: [{ id: 'google', enabled: true, configured: true, bound: true, status: 'active' }],
      factors: [
        { id: 'totp', enabled: true, enrolled: !!o.totp, status: o.totp ? 'active' : 'not_enrolled' },
        { id: 'recovery', enabled: true, enrolled: (o.rest || 0) > 0, status: 'active', remaining: o.rest || 0, createdAt: 1, bekekenOp: 1 },
        { id: 'passkey', enabled: true, enrolled: false, status: 'not_enrolled', count: 0 },
      ],
      bindings: [], usableCount: 1, lockout: { protected: false, reason: '' }, password: { configured: false, mustChange: false }, totp: { enrolled: !!o.totp },
    } as never);
    const kluis = (stand: KluisKern['stand']): KluisKern => ({ stand, omslagen: { herstelcode: { aangemaaktOp: 1 }, passkeys: [{ prf: true }] } } as KluisKern);
    const r = (lang: 'uk' | 'nl', k: KluisKern, aan = true) => renderToStaticMarkup(createElement(ScenariosWeergave, { lang, data: snap({ totp: true, rest: 5 }), kluis: k, busy: false, onKies: () => {}, totpUitschakelen: async () => {}, nieuweHerstelcodes: async () => {},
      herinnering: createElement(ReserveHerinneringWeergave, { lang, aan, onZet: () => {} }) }));
    const html = r('uk', kluis('gesloten'));
    const ankers = [...html.matchAll(/data-ga-anker="([^"]+)"/g)].map((m) => m[1]);
    check('сценарії: кнопки переходу до точного місця — ключі доступу, автентифікатор, сховище ключів (коли ввімкнене)',
      ['aanmeldmethoden-passkeys', 'aanmeldmethoden-2fa', 'aanmeldmethoden-sleutelkluis'].every((a) => ankers.includes(a)), ankers.join(','));
    check('сценарії: «Додати новий passkey» і «Налаштувати автентифікатор» — кнопками, а не лише текстом', html.includes('Додати новий passkey') && html.includes('Налаштувати автентифікатор'));
    const zonderKluis = r('uk', kluis('uit'));
    check('сценарії: при вимкненому сховищі переходу до сховища немає (немає що відкривати)', !zonderKluis.includes('data-ga-anker="aanmeldmethoden-sleutelkluis"') && zonderKluis.includes('data-ga-anker="aanmeldmethoden-2fa"'));
    check('«Відновлення»: перемикач «Нагадувати про резервний доступ» прямо тут, типово увімкнено, вимкнення — через вікно (закрите до натискання)',
      html.includes('data-herstel-herinnering="aan"') && html.includes('data-meld-schakel="reserve"') && /role="switch" checked=""/.test(html) && !html.includes('data-bevestig="reserve-herinnering-uit"')
      && readFileSync('src/herstel/ReserveHerinnering.tsx', 'utf8').includes("<BevestigDialoog open={vraag} id='reserve-herinnering-uit' lang={lang} gevaarlijk"));
    const uit = r('uk', kluis('gesloten'), false);
    check('«Відновлення»: вимкнений перемикач чесно каже «!» і наслідок; прив’язка — до тієї самої настройки меню (reserveHerinnering)',
      uit.includes('data-herstel-herinnering="uit"') && uit.includes('! Вимкнено') && readFileSync('src/herstel/ReserveHerinneringKoppeling.tsx', 'utf8').includes('reserveHerinnering: x')
      && readFileSync('src/herstel/Scenarios.tsx', 'utf8').includes("lazy(() => import('./ReserveHerinneringKoppeling'))"));
    check('сценарії нідерландською — без кирилиці', !kyr.test(r('nl', kluis('gesloten'))));
  }

  // ================================================================ (в) маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const ENV = ['PASSKEY_RP_ID', 'PASSKEY_ORIGINS', 'AUDIT_IP_PEPPER'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  if (String(process.env.AUDIT_IP_PEPPER || '').length < 32) process.env.AUDIT_IP_PEPPER = `eenheidstest-i015s-pepper-${randomBytes(16).toString('hex')}`;
  delete process.env.PASSKEY_RP_ID; delete process.env.PASSKEY_ORIGINS;
  const eigenaar = `i015s-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool(), sys = getPool('systeem');
  const VLAGGEN = ['gastcodes-iedereen', 'aanmelden-passkey'];
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows;
  const vlagZet = (sleutel: string, gebruikers: string[]) => pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [sleutel, gebruikers]);
  type B = ReturnType<typeof G.browser>;
  const id = (b: B, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
  const ips: string[] = [];
  const ip = () => { const v = `198.51.100.${30 + ips.length + Math.floor(Math.random() * 100)}`; ips.push(v); return v; };
  const gast = (b: B, pad: string, body: Record<string, unknown> = {}, adres?: string) => b.verzoek('id.tarasevych.com', `/api/gast/${pad}`, body, adres ? { ip: adres } : {});
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const meldingen = async (uid: string, kind: string) => (await pool.query("select 1 from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2", [uid, kind])).rowCount || 0;
  const audits = async (uid: string, actie: string) => (await pool.query('SELECT 1 FROM app.audit WHERE owner_id=$1 AND action=$2', [uid, actie])).rowCount || 0;
  const wacht = () => new Promise((r) => setTimeout(r, 150));
  const maak = async (naam: string, email: string) => {
    const b = G.browser();
    await b.aanmelden(`sub-i015s-${naam}-${T}`, email, { service: 'identity' });
    const uid = await idRij(email);
    if (naam !== 'o') await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [uid, JSON.stringify({ status: 'approved', name: `Проба ${naam.toUpperCase()}` })]);
    // Ключ — тим самим ядром, що й сервер (kern.verifieerRegistratie), як після «Додати passkey».
    const pk = nieuwePasskey('es256', 1);
    const ch = randomBytes(32).toString('base64url');
    const reg = kern.verifieerRegistratie({ ...registreer(pk, ch, { origin: ORIGIN }), verwachteUitdaging: ch, rpId: 'tarasevych.com', origins: [ORIGIN] }) as Record<string, any>;
    const pkId = (await pool.query('INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,false,false,1) RETURNING id',
      [uid, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk, `Ключ ${naam}`, '', []])).rows[0].id as string;
    return { b, uid, pk, pkId, email };
  };
  const stapOp = async (b: B, pk: NepPasskey, actie: string) => {
    const opt = await id(b, '/api/owner/access/stap-op/passkey/opties', { actie });
    return id(b, '/api/owner/access/stap-op/passkey', { uitdagingId: opt.data.uitdagingId, actie, assertie: bevestig(pk, opt.data.publicKey.challenge, { origin: ORIGIN }) });
  };

  try {
    const O = await maak('o', eigenaar), A = await maak('a', `i015s-a-${T}@example.test`), Bb = await maak('b', `i015s-b-${T}@example.test`);
    await vlagZet('aanmelden-passkey', [O.uid]);
    await vlagZet('gastcodes-iedereen', [O.uid]); // «Тільки я»

    // ---------------------------------------------------------------- стан ключа: вхід чи лише підтвердження
    const l0 = await id(A.b, '/api/owner/access/passkeys/lijst');
    check('ключ: без прапорця aanmelden-passkey — «лише підтвердження» (aanmelden=false); старий рядок без довіри — vertrouwdOp=null',
      l0.status === 200 && l0.data.aanmelden === false && l0.data.passkeys.length === 1 && l0.data.passkeys[0].vertrouwdOp === null, l0.body.slice(0, 200));
    await vlagZet('aanmelden-passkey', [O.uid, A.uid]);
    check('ключ: з прапорцем для A — «вхід і підтвердження» (aanmelden=true)', (await id(A.b, '/api/owner/access/passkeys/lijst')).data.aanmelden === true);

    // ---------------------------------------------------------------- довіра до ключа
    const zonder = await id(A.b, '/api/owner/access/passkeys/vertrouwen', { id: A.pkId });
    check('довіра: без посиленого підтвердження → 403 STEP_UP_STRONG_REQUIRED, нічого не змінено',
      zonder.status === 403 && zonder.data.error === 'STEP_UP_STRONG_REQUIRED' && (await pool.query('select vertrouwd_op from app.passkeys where id=$1', [A.pkId])).rows[0].vertrouwd_op === null, `${zonder.status} ${zonder.body.slice(0, 120)}`);
    const su = await stapOp(A.b, A.pk, 'passkey-vertrouwen');
    const v1 = await id(A.b, '/api/owner/access/passkeys/vertrouwen', { id: A.pkId });
    await wacht();
    const rij1 = (await pool.query('select vertrouwd_op, vertrouwd_wie, vertrouwd_sessie from app.passkeys where id=$1', [A.pkId])).rows[0];
    check('довіра: після підтвердження ключем → 200, vertrouwd_op/хто/сеанс записано', su.status === 200 && v1.status === 200 && v1.data.vertrouwd === true && v1.data.gewijzigd === true
      && !!rij1.vertrouwd_op && rij1.vertrouwd_wie === A.email && /^[\w-]{1,8}$/.test(String(rij1.vertrouwd_sessie || '')), `${su.status} ${v1.status} ${v1.body.slice(0, 160)}`);
    check('довіра: аудит passkey_vertrouwd і одне сповіщення passkey_vertrouwd', (await audits(A.uid, 'passkey_vertrouwd')) === 1 && (await meldingen(A.uid, 'passkey_vertrouwd')) === 1);
    const v2 = await id(A.b, '/api/owner/access/passkeys/vertrouwen', { id: A.pkId });
    await wacht();
    check('довіра: повторне натискання → той самий стан, без нового запису й сповіщення (ідемпотентно)',
      v2.status === 200 && v2.data.vertrouwd === true && v2.data.gewijzigd === false && v2.data.vertrouwdOp === v1.data.vertrouwdOp && (await audits(A.uid, 'passkey_vertrouwd')) === 1 && (await meldingen(A.uid, 'passkey_vertrouwd')) === 1);
    const l1 = await id(A.b, '/api/owner/access/passkeys/lijst');
    check('довіра: перелік показує позначку після перезавантаження (vertrouwdOp)', l1.data.passkeys[0].vertrouwdOp === v1.data.vertrouwdOp);
    await stapOp(Bb.b, Bb.pk, 'passkey-vertrouwen');
    const vreemd = await id(Bb.b, '/api/owner/access/passkeys/vertrouwen-intrekken', { id: A.pkId });
    check('довіра: чужий ключ (B про ключ A) → 404 NIET_GEVONDEN, ключ A лишився довіреним', vreemd.status === 404 && vreemd.data.error === 'NIET_GEVONDEN' && !!(await pool.query('select vertrouwd_op from app.passkeys where id=$1', [A.pkId])).rows[0].vertrouwd_op);
    const ii = await id(A.b, '/api/owner/access/passkeys/vertrouwen-intrekken', { id: A.pkId });
    const ii2 = await id(A.b, '/api/owner/access/passkeys/vertrouwen-intrekken', { id: A.pkId });
    await wacht();
    check('відкликання довіри: позначка зникла (і «хто/сеанс» теж), ключ лишився; повтор — без нового сповіщення',
      ii.status === 200 && ii.data.vertrouwd === false && ii.data.gewijzigd === true && ii2.data.gewijzigd === false && (await pool.query('select vertrouwd_op, vertrouwd_wie from app.passkeys where id=$1', [A.pkId])).rows[0].vertrouwd_wie === null
      && (await meldingen(A.uid, 'passkey_vertrouwen_ingetrokken')) === 1 && (await audits(A.uid, 'passkey_vertrouwen_ingetrokken')) === 1 && (await pool.query('select 1 from app.passkeys where id=$1', [A.pkId])).rowCount === 1);

    // ---------------------------------------------------------------- гостьові коди для схвалених не-власників
    const TC = '/api/owner/access/toegangscodes';
    const MAAK = { naam: 'Для сусідки', scopes: ['profiel.lezen', 'apparaten.lezen'], verloop: { soort: 'preset', preset: '1d' } };
    const lUit = await id(A.b, `${TC}/lijst`);
    const mUit = await id(A.b, `${TC}/maken`, MAAK);
    const gsUit = await id(A.b, '/api/owner/access/gast-sessies/lijst');
    check('гостьові коди «Тільки я»: A бачить «недоступно» з причиною (без даних), створення → OWNER_REQUIRED, гостьові сесії — «недоступно»',
      lUit.data.beschikbaar === false && lUit.data.reden === 'GASTCODES_ALLEEN_EIGENAAR' && !('codes' in lUit.data) && mUit.status === 403 && mUit.data.error === 'OWNER_REQUIRED' && gsUit.data.beschikbaar === false);
    await vlagZet('gastcodes-iedereen', [O.uid, A.uid]); // «Вибрані»: власник сайту і A
    const lAan = await id(A.b, `${TC}/lijst`);
    check('прапорець для A: перелік доступний (порожній, зі списком дозволених розділів); B без прапорця — і далі «недоступно»',
      lAan.data.beschikbaar === true && Array.isArray(lAan.data.codes) && lAan.data.codes.length === 0 && lAan.data.scopes.length >= 3 && (await id(Bb.b, `${TC}/lijst`)).data.beschikbaar === false);
    await stapOp(A.b, A.pk, 'toegangscode-maken');
    const mA = await id(A.b, `${TC}/maken`, MAAK);
    check('A створює код після посиленого підтвердження → код показано один раз', mA.status === 200 && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(String(mA.data.code || '')), mA.body.slice(0, 160));
    await stapOp(O.b, O.pk, 'toegangscode-maken');
    const mO = await id(O.b, `${TC}/maken`, { ...MAAK, naam: 'Код власника' });
    const codesO = (await id(O.b, `${TC}/lijst`)).data.codes.map((c: { id: string }) => c.id);
    const codesA = (await id(A.b, `${TC}/lijst`)).data.codes.map((c: { id: string }) => c.id);
    check('кожен бачить лише свої коди (A — без коду власника сайту, власник — без коду A)', codesA.length === 1 && codesA[0] === mA.data.item.id && !codesA.includes(mO.data.item.id) && !codesO.includes(mA.data.item.id));
    const chuzhij = await id(A.b, `${TC}/intrekken`, { id: mO.data.item.id, reden: 'Спроба відкликати чужий код' });
    check('сервер перевіряє власника коду: A не відкликає код власника сайту (404)', chuzhij.status === 404 && chuzhij.data.error === 'NIET_GEVONDEN');
    await sys.query("insert into app.agents (user_id, name, platform, token_hash) values ($1, 'Ноутбук A', 'linux', $2)", [A.uid, randomBytes(32).toString('hex')]);
    const Gst = G.browser(); const ipG = ip();
    const iw = await gast(Gst, 'inwisselen', { code: mA.data.code }, ipG);
    const prof = await gast(Gst, 'bekijk', { scope: 'profiel.lezen' });
    const app = await gast(Gst, 'bekijk', { scope: 'apparaten.lezen' });
    check('гість за кодом A бачить ЛИШЕ дані A (ім’я A, пристрої A), а не власника сайту',
      iw.status === 200 && iw.data.eigenaar === 'Проба A' && prof.status === 200 && prof.data.data.naam === 'Проба A'
      && Array.isArray(app.data.data?.apparaten) && app.data.data.apparaten.length === 1 && app.data.data.apparaten.every((x: { naam: string }) => x.naam === 'Ноутбук A'), `${iw.status} ${iw.body.slice(0, 120)} ${prof.body.slice(0, 120)}`);
    const gsA = await id(A.b, '/api/owner/access/gast-sessies/lijst');
    check('A бачить свою гостьову сесію в «Сесіях»', gsA.data.beschikbaar === true && gsA.data.sessies.length === 1);
    await wacht();
    check('аудит і сповіщення для A: toegangscode_aangemaakt + «Створено код доступу», перше використання', (await audits(A.uid, 'toegangscode_aangemaakt')) === 1 && (await audits(A.uid, 'toegangscode_ingewisseld')) === 1);

    // вимкнути прапорець для A: код і гостьовий сеанс гаснуть
    await vlagZet('gastcodes-iedereen', [O.uid]);
    const naUit = await gast(Gst, 'bekijk', { scope: 'profiel.lezen' });
    const Gst2 = G.browser();
    const opnieuw = await gast(Gst2, 'inwisselen', { code: mA.data.code }, ip());
    const gebruikt = Number((await sys.query('select gebruikt from app.toegangscodes where id=$1', [mA.data.item.id])).rows[0].gebruikt);
    check('прапорець вимкнено: гостьовий сеанс A більше нічого не бачить (401), новий вхід за кодом A → CODE_ONGELDIG, лічильник використань не зріс',
      naUit.status === 401 && opnieuw.status === 400 && opnieuw.data.error === 'CODE_ONGELDIG' && gebruikt === 1, `${naUit.status} ${opnieuw.status} ${opnieuw.data.error} ${gebruikt}`);
    const GstO = G.browser();
    const iwO = await gast(GstO, 'inwisselen', { code: mO.data.code }, ip());
    check('коди власника сайту діють незалежно від прапорця', iwO.status === 200 && (await gast(GstO, 'bekijk', { scope: 'profiel.lezen' })).status === 200);
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015s-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await sys.query('delete from app.toegangscodes where user_id = any($1)', [ids]).catch(() => undefined);
      await sys.query('delete from app.agents where user_id = any($1)', [ids]).catch(() => undefined);
      for (const t of ['passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities']) await sys.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
      await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]).catch(() => undefined);
    }
    await pool.query('delete from app.login_lockouts where subject = any($1)', [ips.map((v) => `gast-inwisselen:${ipHash(v) || v}`)]).catch(() => undefined);
    for (const k of ENV) { const v = vorige[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }
  await closePool().catch(() => undefined);
  return einde();
}
