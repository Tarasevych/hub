// CONSOL-001 / M4 Блок А (23.11.2026): перевірка повного закриття незавершених частин робочого столу, Бюро та служби «Соціальні мережі».
// Охоплює:
//   1. відсутність «binnenkort» у WERKBLAD_WIDGETS і BUREAU_WIDGETS та розблокування svc:social → identity/netwerken;
//   2. міграції 0319 і 0320: чистий адитивний SQL (без SQL_RISICO), двомірний ENABLE + FORCE RLS та прапорці можливостей;
//   3. диспетчер ?actie= (actie-doel.ts): явне зчитування searchParams.get('actie') за білим списком без руйнівних дій;
//   4. перейменування тек на робочому столі v3 та двомовний статичний рендеринг SocialOverzicht (uk + nl, без витоку мов);
//   5. живі маршрути /api/owner/hub/werkblad/{github,ai-toegang}, v3/persoonlijk та createSocialRoutes із ізоляцією користувачів і просторів.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SQL_RISICO } from '../../backend/uitrol-voorcontrole';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import { createSocialRoutes, isVeiligeSocialUrl, SOCIAL_ACTIE_CODES, SOCIAL_OVERZICHT_VLAG } from '../../backend/social-routes';
import { v3Laden, v3PersoonlijkBewaren, WERKBLAD_SNELKOPPELINGEN_FLAG } from '../../backend/werkblad-v3';
import { appRolActief, getPool } from '../../server/platform/pg';
import { metVerzoek } from '../../server/platform/context';
import { BUREAU_WIDGETS } from '../../shared/bureau-indeling';
import { MENU_PAGINAS } from '../../shared/menu-model';
import { WERKBLAD_WIDGETS } from '../../shared/werkblad-indeling';
import { REGISTER_V3_HAKEN, launchDoel, registerItem, toegestaanVoor } from '../../shared/werkblad-register';
import { MENU_CATALOG } from '../../src/menu-voorkeuren';
import SocialOverzicht from '../../src/social/SocialOverzicht';
import { actieUitUrl, TOEGESTANE_ACTIES } from '../../src/werkblad/bibliotheek/actie-doel';
import { checker, nepGoogle } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-001-werkblad-social-20261123');

  // ---------------------------------------------------------------- 1. Каталоги без binnenkort / planned
  check(
    '1a WERKBLAD_WIDGETS: нуль binnenkort і нуль ontbreekt; github та ai мають живі маршрути',
    WERKBLAD_WIDGETS.every((w) => w.stand === 'klaar' && !w.ontbreekt) &&
      WERKBLAD_WIDGETS.find((w) => w.id === 'github')?.bron === 'POST /api/owner/hub/werkblad/github' &&
      WERKBLAD_WIDGETS.find((w) => w.id === 'ai')?.bron === 'POST /api/owner/ai/werkruimte/overzicht',
  );
  check(
    '1b BUREAU_WIDGETS: нуль binnenkort і нуль ontbreekt; github-activiteit та ai-toegang мають живі маршрути',
    BUREAU_WIDGETS.every((w) => w.stand === 'klaar' && !w.ontbreekt) &&
      BUREAU_WIDGETS.find((w) => w.id === 'github-activiteit')?.bron === 'POST /api/owner/hub/werkblad/github' &&
      BUREAU_WIDGETS.find((w) => w.id === 'ai-toegang')?.bron === 'POST /api/owner/hub/werkblad/ai-toegang',
  );
  const socialMenu = MENU_CATALOG.find((m) => m.id === 'social');
  const socialReg = registerItem('svc:social');
  check(
    '1c svc:social розблоковано: веде на identity/netwerken без planned',
    !!socialMenu &&
      !socialMenu.planned &&
      socialMenu.target === 'identity' &&
      socialMenu.tab === 'netwerken' &&
      MENU_PAGINAS.identity.includes('netwerken') &&
      !!socialReg &&
      socialReg.beschikbaarheid === 'ready' &&
      toegestaanVoor(socialReg, { ruimte: 'prive', rechten: { apiPlatform: false, eigenaar: false } }).ok &&
      JSON.stringify(launchDoel(socialReg)) === '{"dienst":"identity","tab":"netwerken"}',
  );

  // ---------------------------------------------------------------- 2. Міграції 0319 та 0320 і прив'язка у клієнті
  const sql0319 = lees('migrations/0319_werkblad_snelkoppelingen.sql');
  const sql0320 = lees('migrations/0320_social_overzicht_vlag.sql');
  check(
    '2a міграції 0319 та 0320 не містять жодного виразу з SQL_RISICO',
    SQL_RISICO.every(([re]) => !re.test(sql0319) && !re.test(sql0320)),
  );
  check(
    '2b міграції 0319 та 0320 вмикають ENABLE + FORCE ROW LEVEL SECURITY з перевіркою app.user_id та app.ruimte',
    /ENABLE ROW LEVEL SECURITY/.test(sql0319) &&
      /FORCE ROW LEVEL SECURITY/.test(sql0319) &&
      sql0319.includes("current_setting('app.ruimte', true)") &&
      sql0319.includes(WERKBLAD_SNELKOPPELINGEN_FLAG) &&
      /ENABLE ROW LEVEL SECURITY/.test(sql0320) &&
      /FORCE ROW LEVEL SECURITY/.test(sql0320) &&
      sql0320.includes("current_setting('app.ruimte', true)") &&
      sql0320.includes(SOCIAL_OVERZICHT_VLAG),
  );
  const v3Tsx = lees('src/werkblad/WerkbladV3.tsx');
  const apiV3 = lees('src/werkblad/api-v3.ts');
  check(
    '2c WerkbladV3 використовує серверну синхронізацію eigenSnelkoppelingen та підтримує перейменування тек',
    !v3Tsx.includes('const [lokaalUsr, zetLokaalUsr] = useState') &&
      apiV3.includes('eigenSnelkoppelingen') &&
      v3Tsx.includes('eigenSnelkoppelingen') &&
      v3Tsx.includes('hernoemMap') &&
      lees('src/werkblad/bibliotheek/MapTegel.tsx').includes('onHernoem'),
  );

  // ---------------------------------------------------------------- 3. Диспетчер ?actie= та безпека URL
  const actieBron = lees('src/werkblad/bibliotheek/actie-doel.ts');
  check(
    '3a actie-doel.ts зчитує searchParams.get(\'actie\') і приймає лише 7 безпечних дій з білого списку',
    actieBron.includes("searchParams.get('actie')") &&
      TOEGESTANE_ACTIES.length === 7 &&
      TOEGESTANE_ACTIES.every((id) => actieUitUrl(`?actie=${id}`) === id) &&
      actieUitUrl('?actie=verwijder-alles') === '' &&
      actieUitUrl('?actie=javascript:alert(1)') === '',
  );
  const cmdDoel = launchDoel(registerItem('cmd:bericht-schrijven'), { ruimte: 'prive' });
  check(
    '3b cmd:bericht-schrijven передає actionId у starten.ts (?actie=...) та підключено в CanoniekOmlijsting',
    cmdDoel?.dienst === 'mail' &&
      cmdDoel?.tab === 'inbox' &&
      cmdDoel?.actionId === 'bericht-schrijven' &&
      lees('src/werkblad/bibliotheek/starten.ts').includes("searchParams.set('actie'") &&
      lees('src/CanoniekOmlijsting.tsx').includes('werkbladActieStarten'),
  );
  check(
    '3c isVeiligeSocialUrl пропускає лише публічні https:// без облікових даних і відхиляє локальні/внутрішні вузли',
    isVeiligeSocialUrl('') &&
      isVeiligeSocialUrl('https://mastodon.social/@tarasevych') &&
      !isVeiligeSocialUrl('http://mastodon.social/@tarasevych') &&
      !isVeiligeSocialUrl('https://gebruiker:geheim@mastodon.social/') &&
      !isVeiligeSocialUrl('https://localhost/test') &&
      !isVeiligeSocialUrl('https://127.0.0.1/ pad') &&
      !isVeiligeSocialUrl('https://192.168.1.10/intern') &&
      !isVeiligeSocialUrl('https://10.0.0.5/intern') &&
      !isVeiligeSocialUrl('https://[::1]/intern'),
  );

  // ---------------------------------------------------------------- 4. Двомовний SSR SocialOverzicht та єдиний реєстр марок
  const htmlUk = renderToStaticMarkup(createElement(SocialOverzicht, { lang: 'uk' }));
  const htmlNl = renderToStaticMarkup(createElement(SocialOverzicht, { lang: 'nl' }));
  const tekstUk = htmlUk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const tekstNl = htmlNl.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  check(
    '4a SocialOverzicht рендериться українською (> 200 символів, з переліком мереж і переходами, без росіїзмів)',
    tekstUk.length > 200 &&
      tekstUk.includes('Соціальні мережі та канали') &&
      tekstUk.includes('Архіви у «Фото»') &&
      !/[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/.test(tekstUk),
  );
  check(
    '4b SocialOverzicht рендериться нідерландською (> 200 символів, без жодної кирилиці)',
    tekstNl.length > 200 &&
      tekstNl.includes('Sociale netwerken en kanalen') &&
      tekstNl.includes('Archieven in «Foto’s»') &&
      !/[\u0400-\u04FF]/.test(tekstNl),
  );
  check(
    '4c у GitHubWidget та SocialOverzicht немає власних марок <svg>: використовується <Merk />',
    !/<svg\b/i.test(lees('src/werkblad/widgets/GitHubWidget.tsx')) &&
      lees('src/werkblad/widgets/GitHubWidget.tsx').includes('<Merk ') &&
      !/<svg\b/i.test(lees('src/social/SocialOverzicht.tsx')) &&
      lees('src/social/SocialOverzicht.tsx').includes('<Merk '),
  );

  // ---------------------------------------------------------------- 5. Жива база даних, ізоляція просторів та FORCE RLS
  const pool = getPool('systeem');
  const regCheck = (
    await pool.query("SELECT to_regclass('app.werkblad_usr_items') AS usr, to_regclass('app.sociale_netwerken') AS soc")
  ).rows[0];
  check('5.0 таблиці app.werkblad_usr_items (0319) та app.sociale_netwerken (0320) змонтовані в базі даних', !!regCheck?.usr && !!regCheck?.soc);

  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const emailA = `consol-a-${T}@example.test`, subA = `sub-consol-a-${T}`;
  const emailB = `consol-b-${T}@example.test`, subB = `sub-consol-b-${T}`;
  const G = await nepGoogle({ ownerEmail: emailA });
  let A = '', B = '';
  try {
    type Br = {
      verzoek: (host: string, pad: string, body?: unknown) => Promise<{ status: number; data: Record<string, any>; body: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
      aanmelden: (sub: string, email: string, o?: Record<string, unknown>) => Promise<unknown>;
      ctxBody: (s?: string, e?: Record<string, unknown>) => Record<string, unknown>;
    };
    const Ba = G.browser() as unknown as Br;
    await Ba.aanmelden(subA, emailA, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 600 });
    A = String((await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [emailA])).rows[0]?.id || '');
    const Bb = G.browser() as unknown as Br;
    await Bb.aanmelden(subB, emailB, { service: 'hub' });
    B = String((await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [emailB])).rows[0]?.id || '');
    await pool.query(`UPDATE app.records SET data = data || '{"status":"approved"}'::jsonb WHERE tbl='users' AND id = ANY($1)`, [[A, B]]);
    check('5a підготовка двох облікових записів A і B у PostgreSQL', !!A && !!B && A !== B);

    // 5b. Маршрути /api/owner/hub/werkblad/github та /ai-toegang на живому сервері
    const ghA = await Ba.verzoek('hub.tarasevych.com', '/api/owner/hub/werkblad/github', Ba.ctxBody('hub'));
    const aiA = await Ba.verzoek('hub.tarasevych.com', '/api/owner/hub/werkblad/ai-toegang', Ba.ctxBody('hub'));
    const verbodenGeheimSleutels = /(tokenHash|token_hash|ciphertext|refreshToken|refresh_token|clientSecret|client_secret|tokenZegel|verversZegel)/i;
    check(
      '5b маршрути werkblad/github та werkblad/ai-toegang відповідають 200 у сесії hub без жодних таємних полів',
      ghA.status === 200 &&
        ghA.data.ruimte === 'prive' &&
        Array.isArray(ghA.data.accounts) &&
        !verbodenGeheimSleutels.test(ghA.body) &&
        aiA.status === 200 &&
        aiA.data.ruimte === 'prive' &&
        typeof aiA.data.samenvatting?.toestemmingen === 'number' &&
        !verbodenGeheimSleutels.test(aiA.body),
      `gh=${ghA.status} ai=${aiA.status}`,
    );

    // 5c. Серверна синхронізація власних ярликів (0319 app.werkblad_usr_items) між пристроями й просторами
    const ctxPrive = { ruimte: 'prive' as const, ...REGISTER_V3_HAKEN };
    const ctxTech = { ruimte: 'technisch' as const, ...REGISTER_V3_HAKEN };
    const bewaardUsr = await v3PersoonlijkBewaren({ userId: A, ruimte: 'prive' }, ctxPrive, [
      { id: 'usr:mijn-post', basis: 'pg:mail/inbox', titel: 'Моя вхідна пошта', icoon: 'star' },
      { id: 'usr:kwaad', basis: 'https://kwaad.test', titel: 'Злам' },
    ]);
    const geladenPriveA = await v3Laden({ userId: A, ruimte: 'prive' }, ctxPrive, 'telefoon');
    const geladenTechA = await v3Laden({ userId: A, ruimte: 'technisch' }, ctxTech, 'computer');
    const geladenPriveB = await v3Laden({ userId: B, ruimte: 'prive' }, ctxPrive, 'computer');
    check(
      '5c v3PersoonlijkBewaren зберігає дійсні ярлики usr:*, відкидає URL-підробки й ізолює простори та користувачів',
      bewaardUsr.length === 1 &&
        bewaardUsr[0].id === 'usr:mijn-post' &&
        bewaardUsr[0].icoon === 'star' &&
        geladenPriveA.persoonlijk.length === 1 &&
        geladenPriveA.persoonlijk[0].titel === 'Моя вхідна пошта' &&
        geladenTechA.persoonlijk.length === 0 &&
        geladenPriveB.persoonlijk.length === 0,
    );

    // 5d. Перевірка маршрутів createSocialRoutes (прапорець, збереження, відмова на таємниці, ізоляція A/B та prive/technisch)
    let vlagActief = false;
    let actieveSessie: { service: string; user: { id: string; status: string; role: string } } = {
      service: 'identity',
      user: { id: A, status: 'approved', role: 'owner' },
    };
    const socialRoutes = createSocialRoutes({
      requireSession: async () => actieveSessie,
      vlagAan: async () => vlagActief,
    });
    const roepSocial = async (pad: string, body: Record<string, unknown> = {}) => {
      const fn = socialRoutes[`POST ${pad}`]?.[0];
      const event = {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        isBase64Encoded: false as const,
        rawPath: pad,
        rawQueryString: '',
        queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: pad, sourceIp: '127.0.0.1', userAgent: 'consol-test/1.0' } },
      };
      const r = await metVerzoek(`POST ${pad}`, async () => fn({ body, query: {}, params: {}, event }), {
        ip: '127.0.0.1',
        ua: 'consol-test/1.0',
      });
      const tekst = typeof r?.body === 'string' ? r.body : '';
      return { status: r?.statusCode || 500, data: tekst ? JSON.parse(tekst) : {}, body: tekst };
    };

    const uitAntw = await roepSocial('/api/owner/social/overzicht', {});
    check('5d при вимкненому прапорці social-overzicht-v1 маршрут повертає 404 SOCIAL_DIENST_UIT', uitAntw.status === 404 && (uitAntw.data.code === 'SOCIAL_DIENST_UIT' || uitAntw.data.error === 'SOCIAL_DIENST_UIT'));

    vlagActief = true;
    const nepToken = ['ghp', 'A'.repeat(38)].join('_');
    const geheimAntw = await roepSocial('/api/owner/social/bericht/opslaan', {
      netwerk: 'github',
      titel: 'Спроба зберегти ключ',
      inhoud: `Мій секрет ${nepToken}`,
      status: 'concept',
    });
    check('5e geheimenIn блокує спробу зберегти таємний маркер у чернетці (400 SOCIAL_GEHEIM_GEWEIGERD)', geheimAntw.status === 400 && (geheimAntw.data.code === 'SOCIAL_GEHEIM_GEWEIGERD' || geheimAntw.data.error === 'SOCIAL_GEHEIM_GEWEIGERD'));

    const slechteUrlAntw = await roepSocial('/api/owner/social/profiel/opslaan', {
      netwerk: 'mastodon',
      titel: 'Внутрішня адреса',
      url: 'https://127.0.0.1/geheim',
    });
    check('5f внутрішня адреса 127.0.0.1 відхиляється (400 SOCIAL_URL_ONGELDIG)', slechteUrlAntw.status === 400 && (slechteUrlAntw.data.code === 'SOCIAL_URL_ONGELDIG' || slechteUrlAntw.data.error === 'SOCIAL_URL_ONGELDIG'));

    const profielAntw = await roepSocial('/api/owner/social/profiel/opslaan', {
      netwerk: 'mastodon',
      titel: 'Щоденник Плюща',
      handvat: '@klimop@mastodon.social',
      url: 'https://mastodon.social/@klimop',
      inhoud: 'Публічні нотатки про розподілену архітектуру',
      status: 'actief',
    });
    const berichtAntw = await roepSocial('/api/owner/social/bericht/opslaan', {
      netwerk: 'telegram',
      titel: 'Оголошення оновлення M4',
      inhoud: 'Сьогодні завершено консолідацію робочого столу та соціальних каналів.',
      status: 'concept',
    });
    const ovzA = await roepSocial('/api/owner/social/overzicht', {});
    check(
      '5g збереження профілю та чернетки в особистому просторі A повертає їх в огляді без таємних полів',
      profielAntw.status === 200 &&
        berichtAntw.status === 200 &&
        ovzA.status === 200 &&
        ovzA.data.profielen.length === 1 &&
        ovzA.data.berichten.length === 1 &&
        ovzA.data.profielen[0].titel === 'Щоденник Плюща',
    );

    const auditRijen = (
      await pool.query(
        `SELECT action, details::text AS details_tekst FROM app.audit WHERE owner_id = $1 AND action = ANY($2)`,
        [A, Object.values(SOCIAL_ACTIE_CODES)],
      )
    ).rows;
    check(
      '5h аудит фіксує коди owner.social.* без витоку тексту чернетки чи назви каналу в details',
      auditRijen.length >= 2 &&
        auditRijen.every((r) => !String(r.details_tekst).includes('Щоденник Плюща') && !String(r.details_tekst).includes('Оголошення оновлення M4')),
    );

    // Ізоляція користувача B
    actieveSessie = { service: 'identity', user: { id: B, status: 'approved', role: 'member' } };
    const ovzB = await roepSocial('/api/owner/social/overzicht', {});
    const wisVreemd = await roepSocial('/api/owner/social/profiel/verwijderen', { id: profielAntw.data.profiel.id });
    check(
      '5i АТАКА між користувачами: B бачить 0 записів A і не може видалити профіль A (404)',
      ovzB.status === 200 && ovzB.data.profielen.length === 0 && ovzB.data.berichten.length === 0 && wisVreemd.status === 404,
    );

    // 5j. Двомірний FORCE RLS на рівні PostgreSQL (app.user_id + app.ruimte)
    if (appRolActief()) {
      const zonderRuimte = await alsGebruiker(A, async (q) => {
        const u1 = Number((await q('SELECT count(*)::int AS n FROM app.werkblad_usr_items')).rows[0]?.n || 0);
        const u2 = Number((await q('SELECT count(*)::int AS n FROM app.sociale_netwerken')).rows[0]?.n || 0);
        return u1 + u2;
      });
      const andereRuimte = await alsGebruiker(A, async (q) => {
        await q("SELECT set_config('app.ruimte', 'technisch', true)");
        const u1 = Number((await q('SELECT count(*)::int AS n FROM app.werkblad_usr_items')).rows[0]?.n || 0);
        const u2 = Number((await q('SELECT count(*)::int AS n FROM app.sociale_netwerken')).rows[0]?.n || 0);
        return u1 + u2;
      });
      const eigenRuimte = await alsGebruiker(A, async (q) => {
        await q("SELECT set_config('app.ruimte', 'prive', true)");
        const u1 = Number((await q('SELECT count(*)::int AS n FROM app.werkblad_usr_items')).rows[0]?.n || 0);
        const u2 = Number((await q('SELECT count(*)::int AS n FROM app.sociale_netwerken')).rows[0]?.n || 0);
        return { u1, u2 };
      });
      const andereGebruiker = await alsGebruiker(B, async (q) => {
        await q("SELECT set_config('app.ruimte', 'prive', true)");
        const u1 = Number((await q('SELECT count(*)::int AS n FROM app.werkblad_usr_items')).rows[0]?.n || 0);
        const u2 = Number((await q('SELECT count(*)::int AS n FROM app.sociale_netwerken')).rows[0]?.n || 0);
        return u1 + u2;
      });
      check(
        '5j двомірний FORCE RLS: без app.ruimte = 0, у technisch = 0, у чужого користувача B = 0, у власному (A, prive) = 1 ярлик + 2 записи соцмереж',
        zonderRuimte === 0 && andereRuimte === 0 && andereGebruiker === 0 && eigenRuimte.u1 === 1 && eigenRuimte.u2 === 2,
        `zonder=${zonderRuimte} tech=${andereRuimte} B=${andereGebruiker} eigen=${JSON.stringify(eigenRuimte)}`,
      );
    }
  } finally {
    if (A || B) {
      await pool.query('DELETE FROM app.sociale_netwerken WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
      await pool.query('DELETE FROM app.werkblad_v3_lade WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
      await pool.query('DELETE FROM app.werkblad_indeling WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
      await pool.query('DELETE FROM app.audit WHERE owner_id = ANY($1)', [[A, B]]).catch(() => undefined);
      await pool.query('DELETE FROM app.records WHERE (data->>\'ownerUserId\') = ANY($1) OR id = ANY($1)', [[A, B]]).catch(() => undefined);
    }
    G.herstel();
  }

  return einde();
}
