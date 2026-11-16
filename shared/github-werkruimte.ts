// Gedeeld contract en zuivere hulpfuncties voor de volledige tweerichtings-GitHub-werkruimte:
//  • éénkliks koppelen zonder handmatig sleutels te kopiëren (platform-OAuth, GitHub App Manifest Flow, apparaatcode);
//  • verkenner voor bestanden, mappen, takken, markeringen (tags) en ingebouwde webeditor met regel-voor-regel verschilweergave;
//  • volledige werkvensters voor vraagstukken (issues), samenvoegingsverzoeken (pull requests), CI-werkstromen en uitgaven;
//  • geïsoleerde tweerichtingsspiegel per accountruimte, brug naar het takenbord, gedeelde AI-context, verbonden apparaten
//    en éénkliks zelfstandige uitrol vanuit een gekoppelde opslagplaats.
//
// Zuiver (geen React, geen DOM, geen netwerk, geen vaste domeinnamen).

export type GithubEenklikModus = 'platform-oauth' | 'eigen-oauth' | 'eigen-app' | 'manifest';

export const GITHUB_EENKLIK_MANIFEST_PAD = '/api/owner/github/eenklik/callback';

export type GithubEenklikFeiten = {
  /** Welke éénkliks route nu direct klaarstaat zonder dat de gebruiker zelf een sleutel hoeft in te voeren. */
  modus: GithubEenklikModus;
  /** Kan de gebruiker direct met één klik starten? (Altijd waar: of via geregistreerde OAuth-app, of via App-manifest.) */
  directKlaar: boolean;
  /** Staat er een platformbrede OAuth-app ingesteld op de server? */
  platformOauthKlaar: boolean;
  /** Kan aanmelding met een korte apparaatcode (Device Flow) gestart worden? */
  apparaatCodeKlaar: boolean;
  /** Heeft deze eigen ruimte al een geregistreerde GitHub App uit een eerder éénkliks manifest? */
  eigenAppKlaar: boolean;
};

export type GithubBoomKnoop = {
  path: string;
  name: string;
  type: 'blob' | 'tree';
  size: number;
  sha: string;
};

export type GithubBestandInhoud = {
  repo: string;
  ref: string;
  path: string;
  name: string;
  sha: string;
  size: number;
  binair: boolean;
  afgekapt: boolean;
  inhoud: string;
  htmlUrl: string;
};

export type DiffRegelSoort = 'kop' | 'erbij' | 'eraf' | 'ongewijzigd';

export type DiffRegel = {
  soort: DiffRegelSoort;
  oudRegel: number | null;
  nieuwRegel: number | null;
  tekst: string;
};

export type GithubGewijzigdBestand = {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | string;
  additions: number;
  deletions: number;
  changes: number;
  previousFilename?: string;
  patch: string;
};

export type GithubTakInfo = {
  name: string;
  sha: string;
  protected: boolean;
  standaard: boolean;
};

export type GithubTagInfo = {
  name: string;
  sha: string;
};

export type GithubLabelInfo = {
  name: string;
  color: string;
  description: string;
};

export type GithubReactie = {
  id: number;
  author: string;
  avatar: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type GithubZaakDetail = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  isPull: boolean;
  author: string;
  avatar: string;
  body: string;
  labels: GithubLabelInfo[];
  assignees: string[];
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
  url: string;
  comments: GithubReactie[];
  bordItemId?: string;
};

export type GithubReview = {
  id: number;
  author: string;
  avatar: string;
  state: string;
  body: string;
  submittedAt: string;
};

export type GithubControleRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
};

export type GithubSamenvoegingDetail = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  draft: boolean;
  author: string;
  avatar: string;
  body: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string;
  url: string;
  labels: GithubLabelInfo[];
  files: GithubGewijzigdBestand[];
  reviews: GithubReview[];
  comments: GithubReactie[];
  checks: GithubControleRun[];
};

export type GithubWerkstroom = {
  id: number;
  name: string;
  path: string;
  state: string;
  url: string;
};

export type GithubUitgaveAsset = {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  downloadUrl: string;
  updatedAt: string;
};

export type GithubUitgave = {
  id: number;
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  author: string;
  createdAt: string;
  publishedAt: string;
  url: string;
  assets: GithubUitgaveAsset[];
};

export type GithubSpiegelRepo = {
  id: string;
  fullName: string;
  standaardTak: string;
  priveRepo: boolean;
  beschrijving: string;
  taal: string;
  sterren: number;
  openZaken: number;
  webhookActief: boolean;
  webhookId: number;
  webhookUrl: string;
  apparaatId: string;
  lokaalPad: string;
  bordSync: boolean;
  aiContextSync: boolean;
  uitrolConfig: Record<string, unknown>;
  samenvatting: Record<string, unknown>;
  laatstGesynchroniseerd: string | null;
  bijgewerktOp: string;
};

export type GithubSpiegelGebeurtenis = {
  id: string;
  fullName: string;
  richting: 'inkomend' | 'uitgaand';
  soort: string;
  samenvatting: string;
  details: Record<string, unknown>;
  aangemaaktOp: string;
};

const VEILIG_PAD_DEEL = /^[^\\\u0000-\u001f\u007f]+$/;
const VEILIG_TAK = /^(?!\/|.*\/\/|.*\.\.|.*@\{|.*[\\ ~^:?*[\]]|.*\.lock$|.*\.$)[A-Za-z0-9._/-]{1,120}$/;
const VEILIG_REPO_NAAM = /^[A-Za-z0-9._-]{1,100}$/;

/** Valideert en normaliseert een relatief bestandspad binnen een opslagplaats (geen traversal of nulbytes). */
export function veiligBestandPad(invoer: unknown): string {
  const rauw = String(invoer ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!rauw || rauw.length > 400) return '';
  const delen = rauw.split('/');
  if (delen.some((d) => !d || d === '.' || d === '..' || !VEILIG_PAD_DEEL.test(d))) return '';
  return delen.join('/');
}

/** Valideert een tak- of tagnaam volgens Git-regels. */
export function veiligTakNaam(invoer: unknown): string {
  const s = String(invoer ?? '').trim();
  if (!VEILIG_TAK.test(s)) return '';
  // SEC-002 (integraties-10): de naam komt ook in een git-opdracht op het apparaat van de gebruiker. Een naam die met «-» begint
  // werd daar een optie (`git push origin --mirror` wist alle takken op GitHub). Zoals geldigeBranch (shared/github-pr.ts):
  // niet met «-» beginnen, geen deel dat met «.» begint, niet eindigen op «/», niet «HEAD».
  if (s.startsWith('-') || s.endsWith('/') || s === 'HEAD' || s.split('/').some((d) => !d || d.startsWith('.'))) return '';
  return s;
}

/** Valideert een nieuwe opslagplaatsnaam (zonder eigenaar-voorvoegsel). */
export function veiligRepoNaam(invoer: unknown): string {
  const s = String(invoer ?? '').trim();
  if (!VEILIG_REPO_NAAM.test(s) || s === '.' || s === '..') return '';
  return s;
}

/**
 * Zet een unified-diff patch van GitHub om in gestructureerde regels met oude en nieuwe regelnummers
 * voor de ingebouwde verschilweergave.
 */
export function ontleedDiffPatch(patch: string, maxRegels = 600): DiffRegel[] {
  if (!patch || typeof patch !== 'string') return [];
  const regels = patch.split(/\r?\n/);
  const uit: DiffRegel[] = [];
  let oud = 0;
  let nieuw = 0;
  for (const r of regels) {
    if (uit.length >= maxRegels) break;
    const kop = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(r);
    if (kop) {
      oud = Number(kop[1]);
      nieuw = Number(kop[2]);
      uit.push({ soort: 'kop', oudRegel: null, nieuwRegel: null, tekst: r });
      continue;
    }
    if (r.startsWith('+')) {
      uit.push({ soort: 'erbij', oudRegel: null, nieuwRegel: nieuw++, tekst: r.slice(1) });
    } else if (r.startsWith('-')) {
      uit.push({ soort: 'eraf', oudRegel: oud++, nieuwRegel: null, tekst: r.slice(1) });
    } else if (r.startsWith('\\')) {
      uit.push({ soort: 'kop', oudRegel: null, nieuwRegel: null, tekst: r });
    } else {
      uit.push({ soort: 'ongewijzigd', oudRegel: oud || null, nieuwRegel: nieuw || null, tekst: r.startsWith(' ') ? r.slice(1) : r });
      if (oud > 0) oud++;
      if (nieuw > 0) nieuw++;
    }
  }
  return uit;
}

/**
 * Maakt een regel-voor-regel voorvertoning tussen de oorspronkelijke en de bewerkte tekst in de webeditor,
 * zodat de gebruiker vóór het vastleggen direct ziet wat er verandert.
 */
export function berekenTekstVerschil(oudTekst: string, nieuwTekst: string, maxRegels = 400): { erbij: number; eraf: number; regels: DiffRegel[] } {
  const a = oudTekst.replace(/\r\n/g, '\n').split('\n');
  const b = nieuwTekst.replace(/\r\n/g, '\n').split('\n');
  // Begrensde LCS op venster als het bestand compact is; voor zeer grote bestanden snelle voorloop/achterloop-vergelijking.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffixA = a.length - 1;
  let suffixB = b.length - 1;
  while (suffixA >= prefix && suffixB >= prefix && a[suffixA] === b[suffixB]) {
    suffixA--;
    suffixB--;
  }
  const regels: DiffRegel[] = [];
  let erbij = 0;
  let eraf = 0;
  const contextStart = Math.max(0, prefix - 3);
  if (contextStart > 0) {
    regels.push({ soort: 'kop', oudRegel: null, nieuwRegel: null, tekst: `@@ -${contextStart + 1} +${contextStart + 1} @@` });
  }
  for (let i = contextStart; i < prefix && regels.length < maxRegels; i++) {
    regels.push({ soort: 'ongewijzigd', oudRegel: i + 1, nieuwRegel: i + 1, tekst: a[i] });
  }
  const midA = a.slice(prefix, suffixA + 1);
  const midB = b.slice(prefix, suffixB + 1);
  if (midA.length * midB.length <= 90_000) {
    const dp: Uint16Array[] = Array.from({ length: midA.length + 1 }, () => new Uint16Array(midB.length + 1));
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while ((i < midA.length || j < midB.length) && regels.length < maxRegels) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        regels.push({ soort: 'ongewijzigd', oudRegel: prefix + i + 1, nieuwRegel: prefix + j + 1, tekst: midA[i] });
        i++;
        j++;
      } else if (j < midB.length && (i === midA.length || dp[i][j + 1] >= dp[i + 1][j])) {
        erbij++;
        regels.push({ soort: 'erbij', oudRegel: null, nieuwRegel: prefix + j + 1, tekst: midB[j] });
        j++;
      } else {
        eraf++;
        regels.push({ soort: 'eraf', oudRegel: prefix + i + 1, nieuwRegel: null, tekst: midA[i] });
        i++;
      }
    }
  } else {
    for (let i = 0; i < midA.length && regels.length < maxRegels; i++) {
      eraf++;
      regels.push({ soort: 'eraf', oudRegel: prefix + i + 1, nieuwRegel: null, tekst: midA[i] });
    }
    for (let j = 0; j < midB.length && regels.length < maxRegels; j++) {
      erbij++;
      regels.push({ soort: 'erbij', oudRegel: null, nieuwRegel: prefix + j + 1, tekst: midB[j] });
    }
  }
  const contextEind = Math.min(a.length, suffixA + 4);
  for (let k = suffixA + 1; k < contextEind && regels.length < maxRegels; k++) {
    const nieuwIdx = suffixB + 1 + (k - (suffixA + 1));
    regels.push({ soort: 'ongewijzigd', oudRegel: k + 1, nieuwRegel: nieuwIdx + 1, tekst: a[k] });
  }
  return { erbij, eraf, regels };
}

/**
 * Bouwt het officiële GitHub App Manifest voor éénkliks koppelen op het eigen domein van deze installatie,
 * zodat een gebruiker op zowel onze server als eigen ijzer zonder handmatige sleutels in één klik koppelt.
 */
export function bouwGithubAppManifest(githubHost: string, naamSuffix = ''): Record<string, unknown> | null {
  const host = String(githubHost ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!host || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return null;
  const basis = `https://${host}`;
  const kort = host.split('.')[0] === 'github' ? host.split('.').slice(1).join('.') : host;
  const ruweNaam = `Mijn Ruimte ${kort}${naamSuffix ? ` ${naamSuffix}` : ''}`.replace(/[^A-Za-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 34);
  return {
    name: ruweNaam || 'Mijn Ruimte Brug',
    url: `${basis}/`,
    hook_attributes: { active: false },
    redirect_url: `${basis}${GITHUB_EENKLIK_MANIFEST_PAD}`,
    callback_urls: [`${basis}/api/owner/github/oauth/callback`, `${basis}${GITHUB_EENKLIK_MANIFEST_PAD}`],
    setup_url: `${basis}/accounts?github=ok`,
    public: false,
    default_permissions: {
      contents: 'write',
      issues: 'write',
      pull_requests: 'write',
      actions: 'write',
      workflows: 'write',
      metadata: 'read',
      members: 'read',
    },
    default_events: ['push', 'issues', 'issue_comment', 'pull_request', 'pull_request_review', 'workflow_run', 'release'],
  };
}

/**
 * Genereert een kant-en-klaar recept voor zelfstandige uitrol vanuit een gekoppelde GitHub-opslagplaats
 * (zowel op een verbonden apparaat via onze site als op volledig eigen ijzer met Docker Compose).
 */
export function bouwGithubUitrolRecept(invoer: {
  repo: string;
  tak?: string;
  poort?: number;
  domein?: string;
  eigenHost?: string;
}): {
  appNaam: string;
  tak: string;
  poort: number;
  dockerCompose: string;
  opdrachtEigenServer: string;
} {
  const stuk = String(invoer.repo || 'mijn-app').split('/')[1] || 'mijn-app';
  const appNaam = stuk.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mijn-app';
  const tak = veiligTakNaam(invoer.tak) || 'main';
  const poort = Math.min(65535, Math.max(1024, Math.floor(Number(invoer.poort) || 3000)));
  const domeinRegel = invoer.domein ? `      - VIRTUAL_HOST=${invoer.domein}\n` : '';
  const hubRegel = invoer.eigenHost ? `      - MIJN_RUIMTE_HOST=https://${invoer.eigenHost}\n` : '';
  const dockerCompose = [
    'services:',
    `  ${appNaam}:`,
    `    build:`,
    `      context: https://github.com/${invoer.repo}.git#${tak}`,
    '    restart: unless-stopped',
    '    ports:',
    `      - "127.0.0.1:${poort}:${poort}"`,
    '    environment:',
    '      - NODE_ENV=production',
    `      - PORT=${poort}`,
    `${domeinRegel}${hubRegel}`.trimEnd(),
  ].filter(Boolean).join('\n');
  const opdrachtEigenServer = `git clone --branch ${tak} https://github.com/${invoer.repo}.git ${appNaam} && docker compose -f ${appNaam}/docker-compose.yml up -d --build`;
  return { appNaam, tak, poort, dockerCompose, opdrachtEigenServer };
}

export const GITHUB_WERKRUIMTE_TOOL_NAMEN = [
  'github_list_branches',
  'github_list_tree',
  'github_read_file',
  'github_compare',
  'github_list_releases',
  'github_save_file',
  'github_sync_mirror',
] as const;

export const GITHUB_WERKRUIMTE_SCHRIJF_TOOL_NAMEN = [
  'github_save_file',
  'github_sync_mirror',
] as const;

