// Перевірки виправлення GITHUB-011 (12.11.2026):
//  1. Чисте двомовне опрацювання закритого сховища ключів (SLEUTELKLUIS_GESLOTEN) та збереження підключення без винятку HTTP 500;
//  2. Коректне визначення прав доступу (scopeVoldoet) для користувацьких маркерів застосунку GitHub App із порожнім полем scope;
//  3. Побудова адреси переходу до розблокування особистого сховища ключів (sleutelkluisOntgrendelAdres) із будь-якого домену;
//  4. Повний наскрізний сценарій зі сховищем ключів у PostgreSQL: закрите сховище на старті й на зворотному виклику OAuth,
//     повторне відкриття та успішне підключення застосунку GitHub App (Iv23… / ghu_…).
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { CLIENT_SECRET, nepGithub } from './hulp/nep-github';
import {
  GITHUB_OAUTH_CALLBACK_PAD,
  GITHUB_OAUTH_DOEL,
  GITHUB_OAUTH_FOUTEN,
  scopeVoldoet,
  sleutelkluisOntgrendelAdres,
} from '../../shared/github-koppeling';
import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { createGithubRoutes, ghStatus } from '../../backend/github-platform';
import { SleutelkluisFout } from '../../backend/sleutelkluis';

const bron = (pad: string) => readFileSync(pad, 'utf8');
const nieuweGebruiker = () => `eenheid-gh011-${randomBytes(8).toString('hex')}`;

export async function main(): Promise<number> {
  const { check, einde } = checker('github-011-oauth-sleutelkluis');

  // ---------------------------------------------------------------- 1. Спільна логіка та адреси без прив'язки до домену
  check(
    'двомовні пояснення SLEUTELKLUIS_GESLOTEN та GITHUB_KOPPELING_BEWAREN_MISLUKT наявні в обох мовах',
    Boolean(GITHUB_OAUTH_FOUTEN.SLEUTELKLUIS_GESLOTEN?.[0])
      && Boolean(GITHUB_OAUTH_FOUTEN.SLEUTELKLUIS_GESLOTEN?.[1])
      && Boolean(GITHUB_OAUTH_FOUTEN.GITHUB_KOPPELING_BEWAREN_MISLUKT?.[0])
      && Boolean(GITHUB_OAUTH_FOUTEN.GITHUB_KOPPELING_BEWAREN_MISLUKT?.[1]),
  );

  check(
    'sleutelkluisOntgrendelAdres будує адресу піддомену id для будь-якого власного домену',
    sleutelkluisOntgrendelAdres('https://github.voorbeeld.nl')
      === 'https://id.voorbeeld.nl/aanmeldmethoden#aanmeldmethoden-sleutelkluis'
      && sleutelkluisOntgrendelAdres('https://voorbeeld.nl:8443')
        === 'https://id.voorbeeld.nl:8443/aanmeldmethoden#aanmeldmethoden-sleutelkluis'
      && sleutelkluisOntgrendelAdres('http://localhost:5173')
        === '/aanmeldmethoden#aanmeldmethoden-sleutelkluis'
      && sleutelkluisOntgrendelAdres('')
        === '/aanmeldmethoden#aanmeldmethoden-sleutelkluis',
  );

  check(
    'scopeVoldoet приймає порожній scope для користувацького маркера застосунку GitHub App, але вимагає repo для класичного OAuth',
    scopeVoldoet('', { githubAppUserToken: true }).ok === true
      && scopeVoldoet('', { githubAppUserToken: true }).scopes.join(',') === 'repo'
      && scopeVoldoet('repo,read:org', { githubAppUserToken: true }).scopes.join(',') === 'repo,read:org'
      && scopeVoldoet('').ok === false
      && scopeVoldoet('').mist.join(',') === 'repo',
  );

  // ---------------------------------------------------------------- 2. Маршрути зворотного виклику ніколи не віддають HTTP 500
  const routesGesloten = createGithubRoutes({
    requireSession: async () => ({ errorCode: 'NONE' }),
    audit: async () => {
      throw new Error('audit-onbereikbaar');
    },
    anchor: async () => {
      throw new SleutelkluisFout('SLEUTELKLUIS_GESLOTEN', 423);
    },
    sessieCookie: 'mr_sessie',
  });

  // Перевіримо як оброблений .catch(() => null) у anchor, так і внутрішній перехват SleutelkluisFout
  const oauthCbZonderSessie = await routesGesloten['GET /api/owner/github/oauth/callback'][0]({
    event: { headers: { host: SERVICE_HOSTS.github } },
    query: { code: 'geheim_code_123', state: 'geheim_state_456', iss: 'https://github.com/login/oauth' },
  });
  check(
    'зворотний виклик OAuth без сеансу перенаправляє на картку без витоку code чи state',
    oauthCbZonderSessie.statusCode === 303
      && oauthCbZonderSessie.headers.Location === `https://${SERVICE_HOSTS.github}/accounts?github=OWNER_GITHUB_SESSION_REQUIRED`
      && !oauthCbZonderSessie.headers.Location.includes('geheim_code_123'),
  );

  const eenklikCbZonderSessie = await routesGesloten['GET /api/owner/github/eenklik/callback'][0]({
    event: { headers: { host: SERVICE_HOSTS.github } },
    query: { code: 'manifest_code_789', state: 'manifest_state_012' },
  });
  check(
    'зворотний виклик одноклікового маніфесту без сеансу перенаправляє без помилки 500',
    eenklikCbZonderSessie.statusCode === 302
      && eenklikCbZonderSessie.headers.Location === `https://${SERVICE_HOSTS.github}/accounts?github=OWNER_GITHUB_SESSION_REQUIRED`
      && !eenklikCbZonderSessie.headers.Location.includes('manifest_code_789'),
  );

  // ---------------------------------------------------------------- 3. Статичні інваріанти інтерфейсу та мовного закону
  const gewijzigdeBestanden = [
    'shared/github-koppeling.ts',
    'backend/github-koppeling-opslag.ts',
    'backend/github-oauth.ts',
    'backend/github-app.ts',
    'backend/github-eenklik.ts',
    'backend/github-platform.ts',
    'backend/github-werkruimte.ts',
    'src/GitHubWeergave.tsx',
    'src/github/EenklikKoppelPaneel.tsx',
  ];
  check(
    'жоден змінений файл не містить літер російської абетки',
    gewijzigdeBestanden.every((pad) => !/[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/.test(bron(pad))),
  );
  check(
    'обидві панелі підключення ведуть до розблокування сховища ключів при SLEUTELKLUIS_GESLOTEN',
    bron('src/GitHubWeergave.tsx').includes('sleutelkluisOntgrendelAdres')
      && bron('src/github/EenklikKoppelPaneel.tsx').includes('sleutelkluisOntgrendelAdres'),
  );

  // ---------------------------------------------------------------- 4. Повний наскрізний сценарій із PostgreSQL
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_SYSTEM) {
    console.log('OVERGESLAGEN database-scenario: geen database');
    return einde();
  }
  process.env.GITHUB_KOPPELING_SLEUTEL_V1 = randomBytes(32).toString('base64');
  process.env.SLEUTELKLUIS_SLEUTEL_V1 = randomBytes(32).toString('base64');

  const { oauthStarten, oauthTerugkeer } = await import('../../backend/github-oauth');
  const { eenklikStarten, apparaatCodeStarten } = await import('../../backend/github-eenklik');
  const { isKoppelingKluisGesloten, setKoppelingKluis } = await import('../../backend/github-koppeling-opslag');
  const { inschakelen, ontgrendelMetHerstelcode, sleutelVergrendelen } = await import('../../backend/sleutelkluis');

  const HOST = SERVICE_HOSTS.github;
  const SESSIE = `sessie-011-${randomBytes(12).toString('hex')}`;
  const u1 = nieuweGebruiker();
  const lade = { userId: u1, ruimte: 'prive' as const };

  let nep = nepGithub();
  try {
    setKoppelingKluis({
      rijen: async () => [{ keyName: 'GITHUB_OAUTH', purpose: GITHUB_OAUTH_DOEL }],
      waarde: async () => nep.oauthKluisWaarde(),
    });

    // Вмикаємо особисте сховище ключів (воно одразу відкрите для нашого сеансу)
    const { herstelcode } = await inschakelen(lade, { soort: 'intern', id: SESSIE });
    check('після ввімкнення сховище ключів відкрите', (await isKoppelingKluisGesloten(u1, 'prive')) === false);

    // Починаємо вхід через GitHub при відкритому сховищі ключів
    const gestart = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST, ruimte: 'prive' });
    check('oauthStarten успішно видає адресу підтвердження при відкритому сховищі', gestart.ok);
    if (!gestart.ok) return einde();

    const authUrl = new URL(gestart.data.authUrl);
    const state = String(authUrl.searchParams.get('state') || '');
    const code = nep.codeVoor(gestart.data.authUrl);

    // Імітуємо перезапуск сервера (проміжне встановлення оновлення): особистий ключ зникає з пам'яті сервера
    sleutelVergrendelen(lade);
    check('після блокування в пам’яті сховище ключів має стан gesloten', (await isKoppelingKluisGesloten(u1, 'prive')) === true);

    // Повернення з GitHub при закритому сховищі НЕ падає винятком, а повертає чистий код SLEUTELKLUIS_GESLOTEN (423)
    const terugGesloten = await oauthTerugkeer({
      state,
      code,
      fout: '',
      host: HOST,
      sessieToken: SESSIE,
      userId: u1,
    });
    check(
      'oauthTerugkeer при закритому сховищі ключів повертає 423 SLEUTELKLUIS_GESLOTEN замість збою 500',
      !terugGesloten.ok && terugGesloten.fout === 'SLEUTELKLUIS_GESLOTEN' && terugGesloten.status === 423,
    );

    // Також перевіримо сам HTTP-маршрут зворотного виклику з реальною БД та відмовою журналу аудиту
    const echteRoutes = createGithubRoutes({
      requireSession: async () => ({ service: 'github', user: { id: u1, status: 'approved' } }),
      audit: async () => Promise.reject(new Error('audit-storing')),
      anchor: async () => ({ user: { id: u1 } }),
      sessieCookie: 'mr_sessie',
    });
    const cbAntwoord = await echteRoutes['GET /api/owner/github/oauth/callback'][0]({
      event: { headers: { host: HOST, cookie: `mr_sessie=${SESSIE}` } },
      query: { state: 'reeds-gebruikt', code: 'x', iss: 'https://github.com/login/oauth' },
    });
    check(
      'HTTP-маршрут GET /api/owner/github/oauth/callback витримує збій audit і перенаправляє кодом 303',
      cbAntwoord.statusCode === 303 && cbAntwoord.headers.Location.startsWith(`https://${HOST}/accounts?github=`),
    );

    // Спроба нового старту при закритому сховищі одразу зупиняється з 423 SLEUTELKLUIS_GESLOTEN
    const startGesloten = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST, ruimte: 'prive' });
    const eenklikGesloten = await eenklikStarten(u1, { sessieToken: SESSIE, host: HOST, ruimte: 'prive' });
    const deviceGesloten = await apparaatCodeStarten(u1, 'prive');
    check(
      'oauthStarten, eenklikStarten і apparaatCodeStarten зупиняються зі SLEUTELKLUIS_GESLOTEN (423) ще до переходу на GitHub',
      !startGesloten.ok && startGesloten.fout === 'SLEUTELKLUIS_GESLOTEN' && startGesloten.status === 423
        && !eenklikGesloten.ok && eenklikGesloten.fout === 'SLEUTELKLUIS_GESLOTEN' && eenklikGesloten.status === 423
        && !deviceGesloten.ok && deviceGesloten.fout === 'SLEUTELKLUIS_GESLOTEN' && deviceGesloten.status === 423,
    );

    // Розблоковуємо сховище ключів і перевіряємо підключення застосунку GitHub App (Iv23… + ghu_… + порожній scope)
    nep.herstel();
    await ontgrendelMetHerstelcode(lade, herstelcode, { soort: 'intern', id: SESSIE });

    const appClientId = 'Iv23liEenklikBrug001';
    setKoppelingKluis({
      rijen: async () => [{ keyName: 'GITHUB_OAUTH', purpose: GITHUB_OAUTH_DOEL }],
      waarde: async () => `client_id: ${appClientId}\nclient_secret: ${CLIENT_SECRET}`,
    });

    const echteFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(
            JSON.stringify({ access_token: 'ghu_eenheidstestgebruikerstoken012345', token_type: 'bearer', scope: '' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url === 'https://api.github.com/user') {
          return new Response(
            JSON.stringify({ login: 'tarasevych-test', name: 'Тестовий простір', public_repos: 2, total_private_repos: 5, followers: 1 }),
            { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4995', 'x-ratelimit-reset': '1800000000' } },
          );
        }
        return new Response('{}', { status: 404 });
      }) as typeof fetch;

      const appStart = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST, ruimte: 'prive' });
      check('старт OAuth для застосунку GitHub App (Iv23…) успішний', appStart.ok);
      if (appStart.ok) {
        const st2 = String(new URL(appStart.data.authUrl).searchParams.get('state') || '');
        const appTerug = await oauthTerugkeer({
          state: st2,
          code: 'eenmalige_app_code',
          fout: '',
          host: HOST,
          sessieToken: SESSIE,
          userId: u1,
        });
        check(
          'зворотний виклик із користувацьким маркером GitHub App (ghu_… та порожнім scope) успішно зберігає підключення під ключем користувача',
          appTerug.ok && appTerug.data.login === 'tarasevych-test' && appTerug.data.scopes.includes('repo'),
        );

        // Якщо тепер знову закрити сховище ключів, ghStatus чесно повідомляє SLEUTELKLUIS_GESLOTEN (423), а не GITHUB_TOKEN_INVALID
        sleutelVergrendelen(lade);
        const statusBijDicht = await ghStatus({ userId: u1, ruimte: 'prive' });
        check(
          'ghStatus повертає SLEUTELKLUIS_GESLOTEN (423), коли підключення існує, але сховище ключів закрите',
          !statusBijDicht.ok && statusBijDicht.error === 'SLEUTELKLUIS_GESLOTEN' && statusBijDicht.status === 423,
        );
      }
    } finally {
      globalThis.fetch = echteFetch;
    }
  } finally {
    nep.herstel();
    setKoppelingKluis(null);
    sleutelVergrendelen(lade);
  }

  return einde();
}
