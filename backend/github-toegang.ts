// ENIGE plek waar de rest van de server een GitHub-token vandaan haalt.
//
// Waarom één punt: er zijn nu drie wegen (OAuth-app, GitHub App, persoonlijke token) en twee ervan leveren een token dat
// verloopt. Zou elke aanroeper zelf kiezen en vernieuwen, dan werkt de ene pagina wel en de andere niet. Daarom kiest dit
// bestand de weg, vernieuwt het zelf wat verlopen is, en geeft het alleen de token terug plus het feit langs welke weg hij
// kwam. De token gaat van hier uitsluitend naar de Authorization-header van api.github.com.
//
// Volgorde van de wegen (de bewustste keuze van de eigenaar eerst):
//   1. OAuth  — de eigenaar heeft zelf op «Aanmelden met GitHub» geklikt en rechten toegekend;
//   2. App    — een GitHub App op gekozen repositories (korte installatietokens);
//   3. PAT    — de persoonlijke token uit de kluis (doel «github»), de weg die er altijd al was.
// Een weg die er niet is wordt stil overgeslagen: wie alleen een PAT heeft, merkt van dit bestand niets.
import { GITHUB_PAT_DOEL, type GithubVia } from '../shared/github-koppeling';
import { appToken } from './github-app';
import { oauthToken } from './github-oauth';
import { koppelingLezen } from './github-koppeling-opslag';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

export type GithubToegang = {
  token: string;
  via: Exclude<GithubVia, ''>;
  /** 0 = zonder termijn. */
  verlooptOp: number;
  /** @login (OAuth) of het account waarop de app staat (App); '' bij een PAT (die weet de login niet uit zichzelf). */
  login: string;
  scopes: string[];
};

/** Alleen voor tests en voor github-platform.ts: hoe een PAT uit de kluis komt. */
let patLezen: (userId: string) => Promise<string | null> = async () => null;
export const setPatLezer = (lezer: (userId: string) => Promise<string | null>) => { patLezen = lezer; };

/**
 * De token waarmee deze gebruiker nu met GitHub kan praten, of null als er geen enkele weg is. Verlopen tokens worden hier
 * vernieuwd, dus een aanroeper hoeft daar niets van te weten.
 */
export async function githubToegang(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<GithubToegang | null> {
  if (!userId) return null;
  const ruimte = ruimteOf(ruimteIn);

  const oauth = await oauthToken(userId, ruimte).catch(() => null);
  if (oauth) return { token: oauth.token, via: 'oauth', verlooptOp: oauth.record.verlooptOp, login: oauth.record.login, scopes: oauth.record.scopes };

  const app = await appToken(userId, ruimte).catch(() => null);
  if (app) return { token: app.token, via: 'app', verlooptOp: app.record.verlooptOp, login: app.record.login, scopes: app.record.scopes };

  // DE PAT IS PERSOONLIJK, EN BLIJFT DAT. Hij staat in de kluis van de mens zelf (doel «github»), waar geen tweede lade
  // bestaat. In de technische ruimte met EIGEN gegevens zou hem gebruiken dus betekenen: stil een persoonlijke verbinding
  // openen in een ruimte die juist gescheiden hoort te zijn. Daarom: nooit. Wie zijn persoonlijke GitHub in de technische
  // ruimte wil, zet die dienst op «gedeeld» — dan is de lade persoonlijk en komt de PAT hier gewoon langs.
  if (ruimte === 'technisch') return null;

  const pat = await patLezen(userId).catch(() => null);
  if (pat) return { token: pat, via: 'pat', verlooptOp: 0, login: '', scopes: [] };

  return null;
}

/** Alleen de token — wat github-platform.ts nodig heeft op de plek waar vroeger de kluis stond. */
export async function githubTokenVoor(userId: string, ruimte: AiRuimte = 'prive'): Promise<string | null> {
  return (await githubToegang(userId, ruimte))?.token ?? null;
}

/**
 * Welke weg de server nu zou nemen, zonder een token te halen of te vernieuwen. Voor de koppelkaart: die wil weten «langs
 * welke weg praten we», niet «geef me de token».
 */
export async function githubWeg(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<{ via: GithubVia; verlooptOp: number; login: string; scopes: string[]; installatie: number; repos: string[]; bijgewerktOp: number } | null> {
  const ruimte = ruimteOf(ruimteIn);
  const oauth = await koppelingLezen(userId, 'oauth', ruimte).catch(() => null);
  if (oauth?.tokenZegel) return { via: 'oauth', verlooptOp: oauth.verlooptOp, login: oauth.login, scopes: oauth.scopes, installatie: 0, repos: [], bijgewerktOp: oauth.bijgewerktOp };
  const app = await koppelingLezen(userId, 'app', ruimte).catch(() => null);
  if (app?.tokenZegel) return { via: 'app', verlooptOp: app.verlooptOp, login: app.login, scopes: app.scopes, installatie: app.installatie, repos: app.repos, bijgewerktOp: app.bijgewerktOp };
  if (ruimte === 'technisch') return null; // de PAT is persoonlijk (zie githubToegang)
  const pat = await patLezen(userId).catch(() => null);
  if (pat) return { via: 'pat', verlooptOp: 0, login: '', scopes: [], installatie: 0, repos: [], bijgewerktOp: 0 };
  return null;
}

export { GITHUB_PAT_DOEL };
