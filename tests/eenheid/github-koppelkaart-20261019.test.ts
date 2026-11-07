// Koppelkaart van GitHub (github.*/accounts, punt 6 van de eigenaar 19.10.2026: «досі немає кнопки інтеграції/підключення»).
//
// Wat hier wordt vastgezet:
//  1. de staat van de kaart volgt uit de FEITEN van de server (login uit /user, sleutelnaam/doel/termijn uit de kluis) — niets geraden;
//  2. het veld «Server-URL» staat standaard op https://api.githubcopilot.com/mcp/x/all en wordt als https gevalideerd;
//  3. de tokenwaarde komt nooit in het antwoord van /api/owner/github/koppeling en nooit in een logregel;
//  4. de wegen die de server nog niet kan lopen zijn gemarkeerd en krijgen geen werkende knop.
import { readFileSync } from 'node:fs';
import { ghKoppeling, githubSleutelInfo, setGithubDeps } from '../../backend/github-platform';
import {
  GITHUB_MCP_URL, GITHUB_RECHTEN, KOPPEL_PADEN, geldigeMcpUrl, koppelKaartStaat, padKnopActief,
  type GithubKoppelingFeiten, type KaartInvoer,
} from '../../shared/github-koppeling';
import { leegMeta, vandaag } from '../../shared/kluis-meta';
import { checker } from './hulp/nep-google';

const TOKEN = 'ghp_geheimetokenwaarde0123456789';
const dag = (verschuiving: number) => {
  const d = new Date(`${vandaag()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + verschuiving);
  return d.toISOString().slice(0, 10);
};
/** Rij uit de kluis zoals de echte kluis hem geeft: mét versleutelde velden, die er dus uit moeten blijven. */
const kluisRij = (purpose: string, geldigTot: string) => ({
  keyName: 'GITHUB_PAT', purpose, createdAt: 1_700_000_000_000, updatedAt: 1_760_000_000_000,
  meta: { ...leegMeta(), geldigVan: dag(-30), geldigTot, soort: 'service', van: 'GitHub', notitie: 'scope: repo' },
  ciphertext: Buffer.from(TOKEN).toString('base64url'), iv: 'aaaa', authTag: 'bbbb', ownerUserId: 'u1', algorithm: 'AES-256-GCM', keyVersion: 1, keySource: 'env',
});
const mock = (routes: Record<string, unknown>, kluis: unknown[], calls: { url: string; auth?: string }[] = []) => {
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.Authorization });
    const key = Object.keys(routes).find((k) => String(url).startsWith(`https://api.github.com${k}`));
    if (!key) return new Response('{}', { status: 404 });
    const v = routes[key];
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: 200, headers: { 'x-ratelimit-remaining': '4998', 'x-ratelimit-reset': '1800000000' } });
  }) as unknown as typeof fetch;
  setGithubDeps({ fetch: fn, token: async () => TOKEN, kluis: async () => kluis as never });
  return calls;
};
const invoer = (feiten: GithubKoppelingFeiten | null, fout = '', laden = false): KaartInvoer => ({ laden, fout, feiten });
const ME = { login: 'pavlo', name: 'Pavlo', avatar_url: 'https://avatars.githubusercontent.com/u/1', html_url: 'https://github.com/pavlo', public_repos: 7, total_private_repos: 3, followers: 5 };

export async function main(): Promise<number> {
  const { check, einde } = checker('github-koppelkaart-20261019');

  // ---------------------------------------------------------------- 2. Server-URL
  check('URL типово саме https://api.githubcopilot.com/mcp/x/all', GITHUB_MCP_URL === 'https://api.githubcopilot.com/mcp/x/all' && geldigeMcpUrl(GITHUB_MCP_URL));
  check('Server-URL валідується як https без логіна, параметрів і сміття',
    ['http://api.githubcopilot.com/mcp/x/all', 'https://user:pw@api.githubcopilot.com/mcp', 'https://api.githubcopilot.com/mcp?token=x', 'https://localhost/mcp', 'ftp://a.b/c', 'api.githubcopilot.com/mcp', '', '   ', null, 42, `https://a.b/${'x'.repeat(400)}`]
      .every((waarde) => geldigeMcpUrl(waarde) === false)
    && ['https://api.githubcopilot.com/mcp/x/all', 'https://mcp.tarasevych.com/ai/claude'].every((waarde) => geldigeMcpUrl(waarde) === true));

  // ---------------------------------------------------------------- 1. staat uit feiten van de server
  const geenSleutel = koppelKaartStaat(invoer({ connected: false, sleutel: null, fout: 'GITHUB_TOKEN_MISSING' }));
  check('без ключа: «не підключено», без причини-помилки, кнопка «Підключити» активна',
    geenSleutel.soort === 'geen-sleutel' && geenSleutel.toon === 'neutraal' && geenSleutel.reden === '' && geenSleutel.login === ''
    && geenSleutel.kanVerbinden === true && geenSleutel.kanOntkoppelen === false);

  const laadt = koppelKaartStaat(invoer(null, '', true));
  check('поки вантажиться — жодної активної кнопки', laadt.soort === 'laden' && laadt.kanVerbinden === false && laadt.kanOntkoppelen === false);

  const sleutel = { keyName: 'GITHUB_PAT', purpose: 'github', meta: { ...leegMeta(), geldigTot: dag(200) }, staat: 'actief' as const, dagenOver: 200, bijgewerktOp: 1, aangemaaktOp: 1 };
  const verbonden = koppelKaartStaat(invoer({ connected: true, login: 'pavlo', sleutel }));
  check('підключено: «@user» беремо з /user, ключ і термін — зі сховища',
    verbonden.soort === 'gekoppeld' && verbonden.toon === 'ok' && verbonden.login === 'pavlo'
    && verbonden.sleutelNaam === 'GITHUB_PAT' && verbonden.doel === 'github' && verbonden.termijn === 'actief' && verbonden.dagenOver === 200 && verbonden.kanOntkoppelen === true);

  const bijna = koppelKaartStaat(invoer({ connected: true, login: 'pavlo', sleutel: { ...sleutel, staat: 'bijna', dagenOver: 3 } }));
  const verlopen = koppelKaartStaat(invoer({ connected: true, login: 'pavlo', sleutel: { ...sleutel, staat: 'verlopen', dagenOver: -2 } }));
  check('термін дії токена зі сховища дає окремі стани (скоро / вийшов)',
    bijna.soort === 'sleutel-bijna' && bijna.toon === 'waarschuwing' && bijna.login === 'pavlo'
    && verlopen.soort === 'sleutel-verlopen' && verlopen.toon === 'fout' && verlopen.dagenOver === -2);

  const afgewezen = koppelKaartStaat(invoer({ connected: false, sleutel, fout: 'GITHUB_TOKEN_INVALID' }));
  const limiet = koppelKaartStaat(invoer(null, 'GITHUB_RATE_LIMITED'));
  const stil = koppelKaartStaat(invoer({ connected: false, sleutel }));
  check('помилка показується з конкретною причиною (код сервера), а не загальним «не підключено»',
    afgewezen.soort === 'sleutel-ongeldig' && afgewezen.reden === 'GITHUB_TOKEN_INVALID' && afgewezen.toon === 'fout'
    && limiet.soort === 'fout' && limiet.reden === 'GITHUB_RATE_LIMITED'
    && stil.soort === 'sleutel-ongeldig' && stil.reden === 'GITHUB_TOKEN_INVALID');

  // ---------------------------------------------------------------- 3. token nooit in het antwoord of in een logregel
  try {
    let calls = mock({ '/user': ME }, [kluisRij('github', dag(40))]);
    const uit: any = await ghKoppeling('u1');
    const tekst = JSON.stringify(uit);
    check('koppeling: стан + ключ зі сховища в одному запиті, значення токена — ніде',
      uit.ok && uit.data.connected === true && uit.data.login === 'pavlo' && uit.data.sleutel.keyName === 'GITHUB_PAT' && uit.data.sleutel.purpose === 'github'
      && uit.data.sleutel.staat === 'actief' && uit.data.sleutel.dagenOver === 40 && uit.data.sleutel.meta.notitie === 'scope: repo'
      && !tekst.includes(TOKEN) && !tekst.includes('ciphertext') && !tekst.includes('authTag') && !tekst.includes(Buffer.from(TOKEN).toString('base64url'))
      && calls[0].auth === `Bearer ${TOKEN}` && !calls[0].url.includes(TOKEN), JSON.stringify(uit.data.sleutel));

    const info: any = await githubSleutelInfo('u1');
    check('відомості про ключ — лише назва, призначення, термін і метадані (без будь-яких шифрованих полів)',
      Object.keys(info).sort().join(',') === 'aangemaaktOp,bijgewerktOp,dagenOver,keyName,meta,purpose,staat'
      && Object.keys(info.meta).sort().join(',') === 'geldigTot,geldigVan,notitie,soort,van,verantwoordelijke');

    mock({ '/user': new Response('{}', { status: 401 }) }, [kluisRij('github', dag(40))]);
    const weg: any = await ghKoppeling('u1');
    check('відхилений токен — це стан картки з причиною, а не 500: ключ видно, значення ні',
      weg.ok && weg.data.connected === false && weg.data.fout === 'GITHUB_TOKEN_INVALID' && weg.data.sleutel.keyName === 'GITHUB_PAT' && !JSON.stringify(weg).includes(TOKEN));

    mock({ '/user': ME }, []);
    const leeg: any = await ghKoppeling('u1');
    check('порожнє сховище: sleutel = null, картка знає, що ключа немає', leeg.ok && leeg.data.sleutel === null);

    calls = mock({ '/user': ME }, [kluisRij('github-app', '')]);
    const app: any = await ghKoppeling('u1');
    check('альтернативне призначення «github-app» теж читається зі сховища', app.data.sleutel.purpose === 'github-app' && app.data.sleutel.staat === 'zonder-termijn');
  } finally { setGithubDeps(null); }

  const backend = readFileSync('backend/github-platform.ts', 'utf8');
  const view = readFileSync('src/GitHubWeergave.tsx', 'utf8');
  const kaart = readFileSync('shared/github-koppeling.ts', 'utf8');
  check('маршрут koppeling зареєстрований і це читання (без запису в журнал значень)',
    /'POST \/api\/owner\/github\/koppeling': route\('koppeling', false, \(u\) => ghKoppeling\(u\)\)/.test(backend));
  check('токен ніде не журналюється: ні console, ні audit-поле зі значенням',
    !/console\.(log|info|warn|error|debug)/.test(backend) && !/console\.(log|info|warn|error|debug)/.test(kaart)
    && !/token:\s*token|details.*token\b/.test(backend) && /Authorization: `Bearer \$\{token\}`/.test(backend)
    && !/value|plaintext|readOwnerVaultPlaintext\(/.test(kaart));
  check('картка не малює токен: жодного поля введення значення на сторінці GitHub',
    !/type=['"]password['"]/.test(view) && !/revealedValue|readOwnerVaultPlaintext/.test(view)
    && /onClick=\{openVault\}/.test(view));

  // ---------------------------------------------------------------- 4. niet-gebouwde wegen: gemarkeerd, zonder knop
  //
  // Bijgewerkt 20.10.2026: OAuth en GitHub App zijn echte wegen geworden (backend/github-oauth.ts, backend/github-app.ts,
  // test github-oauth-20261020). Wat NIET veranderde is de regel zelf: een weg die de server niet kan lopen blijft
  // gemarkeerd staan en krijgt nooit een knop. Vandaag is dat alleen nog de externe MCP-server van GitHub.
  const uitPaden = KOPPEL_PADEN.filter((pad) => !pad.beschikbaar);
  check('нереалізовані шляхи позначені причиною і не дають активної кнопки',
    uitPaden.length === 1 && uitPaden.map((pad) => pad.id).join(',') === 'mcp-server'
    && uitPaden.every((pad) => pad.actie === 'geen' && padKnopActief(pad) === false && !!pad.ontbreekt && pad.ontbreekt[0].length > 20 && pad.ontbreekt[1].length > 20));
  check('реалізовані шляхи: PAT у сховищі, OAuth-застосунок і GitHub App — кожен зі своєю дією',
    KOPPEL_PADEN.filter((pad) => pad.beschikbaar).map((pad) => `${pad.id}:${pad.actie}`).join(',') === 'pat:kluis,oauth:oauth,github-app:app'
    && KOPPEL_PADEN.filter((pad) => pad.beschikbaar).every(padKnopActief));
  check('у кожного шляху є двомовна назва й пояснення', KOPPEL_PADEN.every((pad) => pad.naam[0] && pad.naam[1] && pad.uitleg[0] && pad.uitleg[1]));
  check('кнопка в рядку шляху з’являється лише коли padKnopActief', /const actief = padKnopActief\(pad\);/.test(view) && /\{actief \? <button type='button'/.test(view) && /ще не реалізовано/.test(view));
  check('перелік прав збігається з тим, що справді викликає сервер',
    GITHUB_RECHTEN.map((r) => r.code).join(',') === 'repo,read:org,read:project'
    && GITHUB_RECHTEN.filter((r) => r.verplicht).length === 1
    && GITHUB_RECHTEN.every((r) => r.waarvoor[0] && r.waarvoor[1]));
  check('картка намальована з єдиного реєстру логотипів (src/merk) і показує Server-URL з кнопкою копіювання',
    /import Merk from '\.\/merk\/Merk';/.test(view) && /<Merk merk='github'/.test(view)
    && /GITHUB_MCP_URL/.test(view) && /navigator\.clipboard\?\.writeText\(adres\)/.test(view) && /Server-URL/.test(view));
  check('порожній стан вкладки пояснює, що дає підключення', /gh-koppel-leeg/.test(view) && /Що дає підключення:/.test(view));

  return einde();
}
