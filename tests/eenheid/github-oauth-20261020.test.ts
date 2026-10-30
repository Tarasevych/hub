// Echte GitHub-koppeling (20.10.2026): «досить кнопок-пустушок».
//
// Wat deze test vastzet — niet dat er code staat, maar dat de WEG werkt en dat niets uitlekt:
//  1. de volledige OAuth-flow tegen een nagebootst GitHub (hulp/nep-github.ts), inclusief PKCE en scope-controle;
//  2. een verwisselde, herhaalde of verlopen `state` wordt geweigerd — en een terugkeer in een ANDERE sessie ook;
//  3. het client secret en elke token komen nergens voor: niet in een URL, niet in een antwoord van de API;
//  4. de keuze van de weg is OAuth → GitHub App → PAT, en een verlopen token wordt zelf vernieuwd;
//  5. ontkoppelen trekt de token bij GitHub ECHT in (de nep-GitHub accepteert hem daarna niet meer);
//  6. het callback-adres wordt uit het DOMEIN van de installatie gerekend (BYOS), niet uit een vaste naam in de code.
import { readFileSync } from 'node:fs';
import { createVerify, generateKeyPairSync, randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { APP_ID, CLIENT_ID, CLIENT_SECRET, LOGIN, nepGithub } from './hulp/nep-github';
import {
  GITHUB_APP_DOEL, GITHUB_OAUTH_CALLBACK_PAD, GITHUB_OAUTH_DOEL, GITHUB_OAUTH_FOUTEN, KOPPEL_PADEN,
  githubInstelWaarden, githubOauthScopeTekst, koppelPad, leesAppSleutel, leesOauthApp, padKnopActief, scopeVoldoet,
} from '../../shared/github-koppeling';
import { appJwt } from '../../backend/github-app';

const bron = (pad: string) => readFileSync(pad, 'utf8');
const nieuweGebruiker = () => `eenheid-gh-${randomBytes(8).toString('hex')}`;

export async function main(): Promise<number> {
  const { check, einde } = checker('github-oauth-20261020');

  // =============================================================== 6. BYOS: alles uit het eigen domein
  const eigen = githubInstelWaarden('github.voorbeeld.nl');
  const ander = githubInstelWaarden('git.example.org');
  check('callback-URL wordt uit het domein van DEZE installatie gerekend, niet uit een vaste naam',
    eigen.callbackUrl === `https://github.voorbeeld.nl${GITHUB_OAUTH_CALLBACK_PAD}` && eigen.homepageUrl === 'https://github.voorbeeld.nl/'
    && ander.callbackUrl === `https://git.example.org${GITHUB_OAUTH_CALLBACK_PAD}` && eigen.callbackUrl !== ander.callbackUrl);
  check('de kaart en de gedeelde laag noemen geen enkel vast domein (BYOS)',
    !/tarasevych/.test(bron('shared/github-koppeling.ts')) && !/tarasevych/.test(bron('backend/github-oauth.ts')) && !/tarasevych/.test(bron('backend/github-app.ts')));
  check('backend rekent het adres uit SERVICE_HOSTS.github (één bron voor de identiteit van de deployment)',
    /githubInstelWaarden\(SERVICE_HOSTS\.github\)/.test(bron('backend/github-platform.ts')) && /PUBLIC_DOMAIN/.test(bron('backend/deployment-identity.ts')));
  check('leeg of onzinnig domein geeft geen half adres', githubInstelWaarden('').callbackUrl === '' && githubInstelWaarden(null).homepageUrl === '');

  // =============================================================== scopes en invoer van de eigenaar
  check('gevraagde scopes zijn precies de rechten die de server gebruikt', githubOauthScopeTekst() === 'repo read:org read:project');
  check('scope-controle: «repo» is verplicht, de rest optioneel',
    scopeVoldoet('repo,read:org,read:project').ok && scopeVoldoet('repo').ok && scopeVoldoet('read:org').ok === false
    && scopeVoldoet('repo').mist.length === 0 && scopeVoldoet('').mist.join(',') === 'repo');

  check('client id + secret worden gelezen uit JSON, uit regels en uit «id:secret»',
    leesOauthApp(`client_id: ${CLIENT_ID}\nclient_secret: ${CLIENT_SECRET}`)?.clientId === CLIENT_ID
    && leesOauthApp(JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }))?.clientSecret === CLIENT_SECRET
    && leesOauthApp(`${CLIENT_ID}:${CLIENT_SECRET}`)?.clientId === CLIENT_ID);
  check('onzin wordt niet voor een app aangezien', [null, '', 'hallo', 'client_id: x', `client_secret: ${CLIENT_SECRET}`, 'x'.repeat(5000)].every((w) => leesOauthApp(w) === null));

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const proefPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const gelezen = leesAppSleutel(`app_id: ${APP_ID}\n${proefPem}`);
  check('App ID + PEM worden gelezen; zonder PEM of zonder id niet',
    gelezen?.appId === APP_ID && gelezen.privateKey.includes('BEGIN PRIVATE KEY')
    && leesAppSleutel(`app_id: ${APP_ID}`) === null && leesAppSleutel(proefPem) === null);

  // =============================================================== app-JWT: echt RS256 en binnen de grens van GitHub
  const jwt = appJwt(APP_ID, proefPem);
  const [kop, inhoud, sig] = jwt.split('.');
  const k = JSON.parse(Buffer.from(kop, 'base64url').toString());
  const i = JSON.parse(Buffer.from(inhoud, 'base64url').toString());
  const nu = Math.floor(Date.now() / 1000);
  check('app-JWT: RS256, iss = App ID, iat in het verleden, exp binnen 10 minuten, handtekening klopt',
    k.alg === 'RS256' && i.iss === APP_ID && i.iat <= nu - 50 && i.exp - nu <= 600 && i.exp > nu
    && createVerify('RSA-SHA256').update(`${kop}.${inhoud}`).verify(publicKey.export({ type: 'spki', format: 'pem' }), Buffer.from(sig, 'base64url')));

  // =============================================================== de wegen op de kaart
  const uit = KOPPEL_PADEN.filter((p) => !p.beschikbaar);
  check('OAuth en GitHub App zijn nu echte wegen met een werkende knop',
    padKnopActief(koppelPad('oauth')) && koppelPad('oauth').actie === 'oauth' && koppelPad('oauth').doel === GITHUB_OAUTH_DOEL
    && padKnopActief(koppelPad('github-app')) && koppelPad('github-app').actie === 'app' && koppelPad('github-app').doel === GITHUB_APP_DOEL
    && padKnopActief(koppelPad('pat')) && koppelPad('pat').actie === 'kluis');
  check('wat de server nog niet kan, houdt zijn reden en krijgt geen knop',
    uit.length === 1 && uit[0].id === 'mcp-server' && uit[0].actie === 'geen' && padKnopActief(uit[0]) === false && !!uit[0].ontbreekt);
  check('elke foutcode die de flow kan geven heeft een tweetalige uitleg',
    ['bad_verification_code', 'incorrect_client_credentials', 'redirect_uri_mismatch', 'bad_refresh_token',
      'GITHUB_OAUTH_STATE_ONBEKEND', 'GITHUB_OAUTH_STATE_ANDERE_SESSIE', 'GITHUB_OAUTH_HOST_ONJUIST', 'GITHUB_OAUTH_SCOPE_TE_KLEIN',
      'GITHUB_APP_SLEUTEL_ONGELDIG', 'GITHUB_APP_GEEN_INSTALLATIE'].every((code) => !!GITHUB_OAUTH_FOUTEN[code]?.[0] && !!GITHUB_OAUTH_FOUTEN[code]?.[1]));

  // =============================================================== geen geheim in een journaalregel
  const nieuweBestanden = ['backend/github-oauth.ts', 'backend/github-app.ts', 'backend/github-toegang.ts', 'backend/github-koppeling-opslag.ts'].map(bron).join('\n');
  check('geen enkel nieuw bestand journaliseert iets (console) en geen enkele route geeft een token terug',
    !/console\.(log|info|warn|error|debug)/.test(nieuweBestanden)
    && !/json\(\{[^}]*\btoken\b\s*[:,}]/.test(bron('backend/github-platform.ts')));
  check('het client secret gaat alleen als POST-veld mee, nooit in een URL',
    /body: new URLSearchParams\(velden\)/.test(bron('backend/github-oauth.ts')) && !/client_secret=\$\{/.test(bron('backend/github-oauth.ts')));
  check('de terugkeer zet alleen een resultaatcode in de adresbalk',
    /Location: `https:\/\/\$\{host\}\/accounts\?github=\$\{encodeURIComponent\(code/.test(bron('backend/github-platform.ts')));
  check('start en terugkeer gebruiken de host van de deployment, niet de Host-kop van het verzoek',
    /host: SERVICE_HOSTS\.github/.test(bron('backend/github-platform.ts'))
    && /if \(hostVan\(ctx\.event\) !== SERVICE_HOSTS\.github\) return error\('GITHUB_OAUTH_HOST_ONJUIST'/.test(bron('backend/github-platform.ts'))
    && /const veiligeHost = host === SERVICE_HOSTS\.github \? host : SERVICE_HOSTS\.github;/.test(bron('backend/github-platform.ts')));

  // =============================================================== vanaf hier is een database nodig
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_SYSTEM) { console.log('OVERGESLAGEN volledige flow: geen database'); return einde(); }
  process.env.GITHUB_KOPPELING_SLEUTEL_V1 = randomBytes(32).toString('base64');

  const { oauthOntkoppelen, oauthStarten, oauthTerugkeer, oauthToken, oauthVernieuwen } = await import('../../backend/github-oauth');
  const { appInstallaties, appRepos, appToken } = await import('../../backend/github-app');
  const { githubToegang, setPatLezer } = await import('../../backend/github-toegang');
  const { koppelingBewaren, koppelingLezen, setKoppelingKluis } = await import('../../backend/github-koppeling-opslag');

  const HOST = 'github.voorbeeld.nl';
  const SESSIE = `sessie-${randomBytes(12).toString('hex')}`;
  /** De kluis van de eigenaar nabootsen: welke doelen erin staan, en wat de waarde is. */
  const kluis = (waarden: Record<string, string>) => setKoppelingKluis({
    rijen: async () => Object.keys(waarden).map((purpose) => ({ keyName: purpose.toUpperCase(), purpose })),
    waarde: async (_u, _n, purpose) => { const w = waarden[purpose]; if (w === undefined) throw new Error('OWNER_VAULT_NOT_FOUND'); return w; },
  });

  let nep = nepGithub();
  try {
    // ---------------------------------------------------------- 1. de volledige flow
    const u1 = nieuweGebruiker();
    kluis({});
    const zonderApp = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST });
    check('zonder OAuth-app in de kluis kan de flow niet starten — met die reden, niet met een lege knop',
      !zonderApp.ok && zonderApp.fout === 'GITHUB_OAUTH_APP_ONTBREEKT' && zonderApp.status === 409);

    kluis({ [GITHUB_OAUTH_DOEL]: 'dit is geen app' });
    const kapot = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST });
    check('een onleesbare waarde in de kluis geeft een eigen reden', !kapot.ok && kapot.fout === 'GITHUB_OAUTH_APP_ONLEESBAAR');

    kluis({ [GITHUB_OAUTH_DOEL]: nep.oauthKluisWaarde() });
    const gestart = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST });
    check('start geeft het adres van GitHub met client id, het eigen callback-adres, de scopes, een state en PKCE', gestart.ok);
    if (!gestart.ok) return einde();
    const authUrl = new URL(gestart.data.authUrl);
    check('authorize-URL: juiste host, client id, redirect_uri uit ONS domein, scope en S256-uitdaging',
      authUrl.origin + authUrl.pathname === 'https://github.com/login/oauth/authorize'
      && authUrl.searchParams.get('client_id') === CLIENT_ID
      && authUrl.searchParams.get('redirect_uri') === `https://${HOST}${GITHUB_OAUTH_CALLBACK_PAD}`
      && authUrl.searchParams.get('scope') === 'repo read:org read:project'
      && (authUrl.searchParams.get('state') || '').length >= 40
      && authUrl.searchParams.get('code_challenge_method') === 'S256'
      && (authUrl.searchParams.get('code_challenge') || '').length >= 40,
      authUrl.search.slice(0, 120));
    check('het client secret staat NIET in het adres waar de browser naartoe gaat', !gestart.data.authUrl.includes(CLIENT_SECRET));

    const state = String(authUrl.searchParams.get('state'));

    // ---------------------------------------------------------- 2. state: vervalst, andere sessie, andere host, herhaald
    const vervalst = await oauthTerugkeer({ state: 'nagemaakte-state-die-nooit-bestond', code: 'x', host: HOST, sessieToken: SESSIE, userId: u1 });
    check('een state die de server niet uitgaf wordt geweigerd', !vervalst.ok && vervalst.fout === 'GITHUB_OAUTH_STATE_ONBEKEND');

    const andereSessie = await oauthTerugkeer({ state, code: nep.codeVoor(gestart.data.authUrl), host: HOST, sessieToken: 'sessie-van-iemand-anders', userId: u1 });
    check('dezelfde state in een ANDERE sessie wordt geweigerd', !andereSessie.ok && andereSessie.fout === 'GITHUB_OAUTH_STATE_ANDERE_SESSIE');
    // Die poging heeft de state verbruikt — precies de bedoeling: eenmalig is eenmalig.
    const herhaald = await oauthTerugkeer({ state, code: 'x', host: HOST, sessieToken: SESSIE, userId: u1 });
    check('een state is EENMALIG: na de eerste terugkeer (ook een mislukte) vindt een tweede niets meer',
      !herhaald.ok && herhaald.fout === 'GITHUB_OAUTH_STATE_ONBEKEND');

    const tweede = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST });
    if (!tweede.ok) { check('tweede start lukt', false); return einde(); }
    const state2 = String(new URL(tweede.data.authUrl).searchParams.get('state'));
    const andereHost = await oauthTerugkeer({ state: state2, code: nep.codeVoor(tweede.data.authUrl), host: 'kwaadaardig.example', sessieToken: SESSIE, userId: u1 });
    check('een terugkeer op een ander domein dan waar de flow begon wordt geweigerd', !andereHost.ok && andereHost.fout === 'GITHUB_OAUTH_HOST_ONJUIST');

    // ---------------------------------------------------------- 3. geslaagde terugkeer
    const derde = await oauthStarten(u1, { sessieToken: SESSIE, host: HOST });
    if (!derde.ok) { check('derde start lukt', false); return einde(); }
    const code = nep.codeVoor(derde.data.authUrl);
    const goed = await oauthTerugkeer({ state: String(new URL(derde.data.authUrl).searchParams.get('state')), code, host: HOST, sessieToken: SESSIE, userId: u1 });
    check('de code wordt ingewisseld, de scope gecontroleerd en de koppeling bewaard als @login',
      goed.ok && goed.data.login === LOGIN && goed.data.scopes.includes('repo'), goed.ok ? '' : goed.fout);

    const hergebruik = await oauthTerugkeer({ state: String(new URL(derde.data.authUrl).searchParams.get('state')), code, host: HOST, sessieToken: SESSIE, userId: u1 });
    check('dezelfde code een tweede keer inwisselen kan niet (state al weg)', !hergebruik.ok);

    // ---------------------------------------------------------- 4. keuze van de weg + niets lekt
    setPatLezer(async () => null);
    const viaOauth = await githubToegang(u1);
    check('de rest van de server krijgt de token via één punt, met de weg erbij',
      !!viaOauth && viaOauth.via === 'oauth' && viaOauth.login === LOGIN && nep.tokens.has(viaOauth.token));

    const bewaard = await koppelingLezen(u1, 'oauth');
    check('in de database staat de token alleen als zegel, niet leesbaar',
      !!bewaard && bewaard.tokenZegel.startsWith('v1.') && !JSON.stringify(bewaard).includes(viaOauth!.token));
    const alleUrls = nep.verzoeken.map((v) => v.url).join(' ');
    check('geen geheim in een URL: niet het client secret, niet een token',
      !alleUrls.includes(CLIENT_SECRET) && ![...nep.tokens].some((t) => alleUrls.includes(t)));

    // Het antwoord van de koppelkaart mag de client id tonen (publiek) maar nooit de secret of een token.
    const { ghKoppeling, setGithubDeps } = await import('../../backend/github-platform');
    setGithubDeps({ kluis: async () => [] });
    const kaart: any = await ghKoppeling(u1);
    const kaartTekst = JSON.stringify(kaart);
    check('koppelkaart: weg, termijn en rechten — maar geen secret en geen token',
      kaart.ok && kaart.data.verbinding?.via === 'oauth' && kaart.data.oauthKlaar === true && kaart.data.oauthClientId === CLIENT_ID
      && kaart.data.instel.callbackUrl.endsWith(GITHUB_OAUTH_CALLBACK_PAD)
      && !kaartTekst.includes(CLIENT_SECRET) && ![...nep.tokens].some((t) => kaartTekst.includes(t)),
      kaart.ok ? JSON.stringify(kaart.data.verbinding) : kaart.error);
    setGithubDeps(null);

    // ---------------------------------------------------------- 5. ontkoppelen trekt echt in
    const teVerliezen = String(viaOauth!.token);
    const weg = await oauthOntkoppelen(u1);
    check('ontkoppelen trekt de token bij GitHub ECHT in en laat niets achter',
      weg.ok && weg.data.ingetrokken === true && !nep.tokens.has(teVerliezen) && (await koppelingLezen(u1, 'oauth')) === null);
    check('na ontkoppelen is er geen weg meer', (await githubToegang(u1)) === null);

    // ---------------------------------------------------------- 6. vernieuwen van een verlopen token
    nep.herstel();
    nep = nepGithub({ expiration: true });
    kluis({ [GITHUB_OAUTH_DOEL]: nep.oauthKluisWaarde() });
    const u2 = nieuweGebruiker();
    const start2 = await oauthStarten(u2, { sessieToken: SESSIE, host: HOST });
    if (!start2.ok) { check('start met expiration lukt', false); return einde(); }
    const terug2 = await oauthTerugkeer({ state: String(new URL(start2.data.authUrl).searchParams.get('state')), code: nep.codeVoor(start2.data.authUrl), host: HOST, sessieToken: SESSIE, userId: u2 });
    check('een app met «expiration» levert een termijn en een vernieuwingstoken', terug2.ok && terug2.data.verlooptOp > Date.now());

    const oudeToken = String((await githubToegang(u2))?.token || '');
    // De termijn met de hand bijna op nu zetten: zo valt het volgende verzoek binnen de vernieuwmarge.
    await koppelingBewaren(u2, 'oauth', { verlooptOp: Date.now() + 1000 });
    const na = await githubToegang(u2);
    check('een (bijna) verlopen token wordt bij het gebruik zelf vernieuwd, zonder de eigenaar lastig te vallen',
      !!na && na.via === 'oauth' && na.token !== oudeToken && nep.tokens.has(na.token) && na.verlooptOp > Date.now() + 60_000,
      `oud=${oudeToken.slice(0, 8)}… nieuw=${String(na?.token).slice(0, 8)}…`);
    const nogmaals = await oauthVernieuwen(u2);
    check('vernieuwen blijft werken met de verse vernieuwingstoken', nogmaals.ok, nogmaals.ok ? '' : nogmaals.fout);
    check('een verzonnen vernieuwingstoken wordt geweigerd met de code van GitHub',
      await (async () => {
        await koppelingBewaren(u2, 'oauth', { verversZegel: '' });
        const r = await oauthVernieuwen(u2);
        return !r.ok && r.fout === 'bad_refresh_token';
      })());

    // ---------------------------------------------------------- 7. GitHub App
    const u3 = nieuweGebruiker();
    kluis({ [GITHUB_APP_DOEL]: nep.appKluisWaarde() });
    const inst = await appInstallaties(u3);
    check('met de sleutel in de kluis ziet de kaart de installaties (de nep-GitHub controleert de JWT echt)',
      inst.ok && inst.data.appId === APP_ID && inst.data.installaties[0]?.id === 42 && inst.data.installaties[0]?.account === LOGIN,
      inst.ok ? '' : inst.fout);
    const appTok = await appToken(u3);
    check('de JWT wordt ingewisseld voor een installatietoken met een termijn van ongeveer een uur',
      !!appTok && nep.tokens.has(appTok.token) && appTok.record.verlooptOp > Date.now() + 50 * 60_000 && appTok.record.installatie === 42);
    const repos = await appRepos(u3);
    check('de kaart kan de repositories van de installatie laten zien', repos.ok && repos.data.repos.includes(`${LOGIN}/mijn-ruimte`));

    const tellerVoor = nep.installatieTokenTeller();
    await appToken(u3);
    check('een geldig installatietoken wordt hergebruikt (geen nieuw token per verzoek)', nep.installatieTokenTeller() === tellerVoor);
    await koppelingBewaren(u3, 'app', { verlooptOp: Date.now() + 1000 });
    const vers = await appToken(u3);
    check('een installatietoken dat bijna om is, wordt vóór het verlopen vervangen',
      nep.installatieTokenTeller() === tellerVoor + 1 && !!vers && vers.record.verlooptOp > Date.now() + 50 * 60_000);

    // ---------------------------------------------------------- 8. orde van de wegen: OAuth → App → PAT
    const u4 = nieuweGebruiker();
    setPatLezer(async (id) => (id === u4 ? 'ghp_persoonlijke_token_uit_de_kluis' : null));
    kluis({ [GITHUB_OAUTH_DOEL]: nep.oauthKluisWaarde(), [GITHUB_APP_DOEL]: nep.appKluisWaarde() });
    const start4 = await oauthStarten(u4, { sessieToken: SESSIE, host: HOST });
    if (start4.ok) await oauthTerugkeer({ state: String(new URL(start4.data.authUrl).searchParams.get('state')), code: nep.codeVoor(start4.data.authUrl), host: HOST, sessieToken: SESSIE, userId: u4 });
    const eerste = await githubToegang(u4);
    check('met alle drie beschikbaar kiest de server OAuth', eerste?.via === 'oauth');
    await oauthOntkoppelen(u4);
    const tweedeKeus = await githubToegang(u4);
    check('zonder OAuth valt de server terug op de GitHub App', tweedeKeus?.via === 'app', String(tweedeKeus?.via));
    kluis({});
    await (await import('../../backend/github-app')).appOntkoppelen(u4);
    const derdeKeus = await githubToegang(u4);
    check('zonder OAuth en zonder App blijft de persoonlijke token werken (niets is gebroken)',
      derdeKeus?.via === 'pat' && derdeKeus.token === 'ghp_persoonlijke_token_uit_de_kluis');
    setPatLezer(async () => null);
    check('zonder enige weg is er geen token — en geen uitzondering', (await githubToegang(nieuweGebruiker())) === null);

    // ---------------------------------------------------------- 9. app zonder installatie
    const u5 = nieuweGebruiker();
    nep.zonderInstallaties();
    kluis({ [GITHUB_APP_DOEL]: nep.appKluisWaarde() });
    const geen = await appInstallaties(u5);
    check('een app die nog nergens is geïnstalleerd zegt dat, met de stap die de eigenaar moet doen',
      geen.ok && geen.data.installaties.length === 0 && !!GITHUB_OAUTH_FOUTEN.GITHUB_APP_GEEN_INSTALLATIE);
  } finally {
    nep.herstel();
    setKoppelingKluis(null);
  }

  return einde();
}
