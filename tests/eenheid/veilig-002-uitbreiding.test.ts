// Модульні регресійні перевірки VEILIG-002 (частина 2):
//  1) veiligeWebUrl та schoonAppLijst (захист від javascript:/data:/vbscript:/file: і облікових даних в URL);
//  2) XSS-захист посилань у TechMeldingenPaneel, MeldingenV2 та McpAppsWeergave;
//  3) перевірка схваленого статусу в telegramRoutes та alleenGoedgekeurd;
//  4) ізоляція сфер/видимості site_notifications, екранування ILIKE та справжній HTTP 429 + Retry-After у meldingEcosysteemRoutes;
//  5) маскування приватних деталей інших користувачів у adminBootstrapData (maskeerDetailsVoorKijker) та перевірка baseUrl каталогів.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';
import { veiligeWebUrl } from '../../shared/adres-controle';
import { legeRegels } from '../../shared/meldingen-v2/beleid';
import { zichtbaarVoor } from '../../shared/melding-soorten';
import { sfeerVanRij } from '../../shared/meldingen-soorten';
import { maskeerDetailsVoorKijker } from '../../backend/beheer-journaal';
import { schoonAppLijst } from '../../backend/connectors-routes';
import { alleenGoedgekeurd } from '../../backend/goedgekeurd-poort';
import { meldingEcosysteemRoutes } from '../../backend/meldingen-ecosysteem';
import { telegramRoutes } from '../../backend/telegram-aanmelden/routes';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

const nepCtx = (body: unknown = {}) => ({
  body,
  query: {},
  params: {},
  event: {
    headers: { host: 'hub.tarasevych.com', origin: 'https://hub.tarasevych.com' },
    body: JSON.stringify(body),
    isBase64Encoded: false as const,
    rawPath: '/test',
    rawQueryString: '',
    queryStringParameters: {},
    requestContext: { http: { method: 'POST', path: '/test', sourceIp: '198.51.100.1', userAgent: 'eenheidstest' } },
  },
});

export async function main(): Promise<number> {
  const { check, einde } = checker('veilig-002-uitbreiding');

  // 1. veiligeWebUrl і schoonAppLijst
  check(
    '1a veiligeWebUrl дозволяє https/http без облікових даних і відкидає javascript:, data:, vbscript:, file: та керувальні символи',
    veiligeWebUrl('https://app.tarasevych.com/pad?x=1') === 'https://app.tarasevych.com/pad?x=1' &&
      veiligeWebUrl('http://127.0.0.1:4123/', { lokaalHttp: true }) === 'http://127.0.0.1:4123/' &&
      veiligeWebUrl('http://extern.voorbeeld.test/', { lokaalHttp: true }) === undefined &&
      veiligeWebUrl('http://192.0.2.10:8080/app', { alleHttp: true }) === 'http://192.0.2.10:8080/app' &&
      veiligeWebUrl('javascript:alert(1)') === undefined &&
      veiligeWebUrl('JAVASCRIPT:void(0)', { alleHttp: true }) === undefined &&
      veiligeWebUrl('data:text/html,<script>1</script>', { alleHttp: true }) === undefined &&
      veiligeWebUrl('vbscript:msgbox(1)', { alleHttp: true }) === undefined &&
      veiligeWebUrl('file:///etc/passwd', { alleHttp: true }) === undefined &&
      veiligeWebUrl('https://gebruiker:geheim@voorbeeld.test/') === undefined &&
      veiligeWebUrl('https://voorbeeld.test/\nboom') === undefined &&
      veiligeWebUrl(`https://voorbeeld.test/${'a'.repeat(500)}`, { max: 100 }) === undefined,
  );

  const gereinigdeApps = schoonAppLijst([
    { name: 'kwaad', url: 'javascript:alert(document.cookie)', localUrl: 'data:text/html,xss', domain: 'kwaad.tarasevych.com' },
    { name: 'goed', url: 'https://goed-app.tarasevych.com', localUrl: 'http://127.0.0.1:4555', domain: 'goed-app.tarasevych.com' },
  ]) as Array<{ name: string; url: string; localUrl: string }>;
  check(
    '1b schoonAppLijst видаляє небезпечні url/localUrl від агента і зберігає коректні адреси',
    gereinigdeApps.length === 2 &&
      gereinigdeApps[0].url === '' &&
      gereinigdeApps[0].localUrl === '' &&
      gereinigdeApps[1].url === 'https://goed-app.tarasevych.com/' &&
      gereinigdeApps[1].localUrl === 'http://127.0.0.1:4555/',
  );

  // 2. Санітаризація посилань у TechMeldingenLijst, MeldingenV2 та McpAppsWeergave
  nepBrowser('https://hub.tarasevych.com', 'uk');
  const { TechMeldingenLijst } = await import('../../src/meldingen/TechMeldingen');
  const { default: MeldingenV2 } = await import('../../src/meldingen/v2/MeldingenV2');
  const nu = Date.now();
  const techHtml = renderToStaticMarkup(
    createElement(TechMeldingenLijst, {
      uk: true,
      lijst: [
        { id: 'tm-xss', kind: 'uitrol', title: 'Небезпечне посилання', message: 'Перевірка', createdAt: nu, link: 'javascript:alert(1)' },
        { id: 'tm-ok', kind: 'uitrol', title: 'Безпечне посилання', message: 'Гаразд', createdAt: nu - 100, link: '/instellingen?tab=uitrol' },
      ],
    }),
  );
  const v2Html = renderToStaticMarkup(
    createElement(MeldingenV2, {
      lang: 'uk',
      local: [],
      server: [
        { id: 'srv-xss', kind: 'mail', title: 'XSS пастка', message: 'Перевірка', createdAt: nu, link: 'javascript:alert(2)', ruimte: 'prive' },
        { id: 'srv-ok', kind: 'mail', title: 'Коректний лист', message: 'Опис', createdAt: nu - 50, link: 'https://mail.tarasevych.com/postvak-in', ruimte: 'prive' },
      ],
      events: [],
      readEvents: new Set<string>(),
      regels: legeRegels(),
      onReadLocal: () => undefined,
      onReadEvent: () => undefined,
      onMarkAll: () => undefined,
      geluid: true,
      onGeluid: () => undefined,
      onSluiten: () => undefined,
      nu,
    }),
  );
  const appsTsx = lees('src/McpAppsWeergave.tsx');
  check(
    '2a TechMeldingenPaneel і MeldingenV2 блокують javascript:-посилання, а McpAppsWeergave використовує veiligeWebUrl і noopener',
    !techHtml.includes('javascript:') &&
      techHtml.includes('href="/instellingen?tab=uitrol"') &&
      !v2Html.includes('javascript:') &&
      v2Html.includes('href="https://mail.tarasevych.com/postvak-in"') &&
      appsTsx.includes('veiligeWebUrl(app.url') &&
      appsTsx.includes("rel='noopener noreferrer'"),
  );

  // 3. telegramRoutes і alleenGoedgekeurd блокують несхвалені облікові записи (HTTP 403)
  const tgStatus = async (status: string | undefined) => {
    const routes = telegramRoutes({
      requireSession: async () => ({ user: { id: 'u-tg', status, role: 'member' } }),
      aanmeldStart: async () => ({ fout: 'X' }),
      aanmeldVoltooien: async () => {
        throw new Error('x');
      },
      sessiesIntrekken: async () => 0,
      vlagAan: async () => true,
    } as never);
    const mijn = routes['POST /api/owner/telegram/mijn'];
    const matrix = routes['POST /api/owner/telegram/matrix'];
    const r1 = await mijn[mijn.length - 1](nepCtx({}) as never);
    const r2 = await matrix[matrix.length - 1](nepCtx({}) as never);
    return { r1, r2 };
  };

  const nieuwRes = await tgStatus('new');
  const wachtRes = await tgStatus('pending');
  const leegRes = await tgStatus(undefined);
  const poortNieuw = await alleenGoedgekeurd(async () => ({ user: { id: 'u1', status: 'new' } }))({}, {});
  const poortGoed = await alleenGoedgekeurd(async () => ({ user: { id: 'u1', status: 'approved' } }))({}, {});
  const backendIdx = lees('backend/index.ts');

  check(
    '3a telegramRoutes і alleenGoedgekeurd відхиляють несхвалені акаунти (403 ACCOUNT_NOT_APPROVED_FORBIDDEN)',
    nieuwRes.r1?.statusCode === 403 &&
      JSON.parse(nieuwRes.r1.body).error === 'ACCOUNT_NOT_APPROVED_FORBIDDEN' &&
      nieuwRes.r2?.statusCode === 403 &&
      wachtRes.r1?.statusCode === 403 &&
      leegRes.r1?.statusCode === 403 &&
      'errorCode' in poortNieuw &&
      poortNieuw.errorCode === 'ACCOUNT_NOT_APPROVED_FORBIDDEN' &&
      !('errorCode' in poortGoed) &&
      backendIdx.includes('telegramRoutes({ requireSession: /* SEC-002 (autorisatie-09): niet-goedgekeurde accounts komen hier niet */ alleenGoedgekeurd(ownerRequireSession)'),
  );

  // 4. meldingEcosysteemRoutes: HTTP 429 + Retry-After, сфера/видимість site_notifications та екранування ILIKE
  const ecoRoutes = meldingEcosysteemRoutes({
    requireSession: async () => ({ user: { id: 'u-eco', status: 'approved', role: 'member', email: 'gebruiker@voorbeeld.test' }, tab: 'prive' }),
    rateLimit: async () => ({ ok: false, hits: 61, limit: 60, retryAfter: 19 }),
  });
  const aiHandler = ecoRoutes['POST /api/owner/meldingen/ecosysteem/ai-ontleden'][0];
  const gebHandler = ecoRoutes['POST /api/owner/meldingen/ecosysteem/gebeurtenis'][0];
  const ai429 = await aiHandler(nepCtx({ ruimte: 'prive', gebeurtenisId: 'g-1', modus: 'intern' }) as never);
  const geb429 = await gebHandler(nepCtx({ ruimte: 'prive', titel: 'Спам' }) as never);

  const ecoOnbevoegd = meldingEcosysteemRoutes({
    requireSession: async () => ({ user: { id: 'u-eco', status: 'pending', role: 'member' } }),
  });
  const unapprovedEco = await ecoOnbevoegd['POST /api/owner/meldingen/ecosysteem/stroom'][0](nepCtx({}) as never);
  const ecoBron = lees('backend/meldingen-ecosysteem.ts');

  check(
    '4a meldingEcosysteemRoutes повертає справжній HTTP 429 + Retry-After для ai-ontleden і gebeurtenis та блокує несхвалений акаунт',
    ai429?.statusCode === 429 &&
      ai429.headers['Retry-After'] === '19' &&
      JSON.parse(ai429.body).error === 'RATE_LIMITED' &&
      geb429?.statusCode === 429 &&
      geb429.headers['Retry-After'] === '19' &&
      unapprovedEco?.statusCode === 401 &&
      sfeerVanRij({ kind: 'uitrol.mislukt' }) === 'technisch' &&
      sfeerVanRij({ kind: 'siem' }) === 'technisch' &&
      !zichtbaarVoor('access_request', { eigenaar: false, techProfiel: true, mogelijkheden: ['diagnose.lezen'] }) &&
      zichtbaarVoor('access_request', { eigenaar: false, techProfiel: true, mogelijkheden: ['users.manage'] }) &&
      ecoBron.includes('sfeerVanRij(s)') &&
      ecoBron.includes('zichtbaarVoor(s.kind, opties.ontvanger)') &&
      ecoBron.includes("ESCAPE '\\\\'") &&
      backendIdx.includes('meldingEcosysteemRoutes({ requireSession: ownerRequireSession as never, ontvanger: meldingOntvanger as never })'),
  );

  // 5. Маскування деталей аудиту в adminBootstrapData і перевірка URL у directory-connectors/save
  const priveAuditItem = {
    userId: 'gebruiker-anders',
    action: 'owner.mcp.tool',
    details: {
      tool: 'fs_read',
      path: '/Users/alice/geheim.txt',
      doel: { pad: '/Users/alice/geheim.txt' },
      reden: 'Звичайне читання',
    },
  };
  const voorSupport = maskeerDetailsVoorKijker(priveAuditItem, { id: 'beheerder-1', rol: 'support_viewer' }) as Record<string, unknown>;
  const voorEigenaar = maskeerDetailsVoorKijker(priveAuditItem, { id: 'eigenaar-1', rol: 'super_admin' }) as Record<string, unknown>;

  check(
    '5a adminBootstrapData застосовує maskeerDetailsVoorKijker і gate magAudit, а directory-connectors/save перевіряє baseUrl',
    voorSupport._priveVerborgen === true &&
      voorSupport.tool === 'fs_read' &&
      !('path' in voorSupport) &&
      !('doel' in voorSupport) &&
      voorEigenaar.path === '/Users/alice/geheim.txt' &&
      backendIdx.includes('magAudit?auditVoorWeergave({limit:300})') &&
      backendIdx.includes('adminSafeDetails(maskeerDetailsVoorKijker(item,{id:auth.user.id,rol:auth.adminRole}))') &&
      backendIdx.includes("ADMIN_DIRECTORY_URL_INVALID"),
  );

  return einde();
}
