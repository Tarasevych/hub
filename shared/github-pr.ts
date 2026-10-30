// «Створювати pull request» (21.10.2026, besluit van de eigenaar: de dev-rechten die «in ontwikkeling» stonden, echt bouwen).
//
// Wat een AI hier mag: een NIEUWE branch maken vanaf een basisbranch, daarop één commit met de bestanden die zij voorstelt, en
// een pull request openen. Wat zij NOOIT mag: samenvoegen (er bestaat geen merge-weg in deze code), een bestaande branch
// overschrijven (een bestaande naam = weigeren, nooit «force»), op de basisbranch zelf schrijven, of iets aanraken onder
// .github/workflows en .github/actions — die bestanden draaien in CI met de geheimen van de repository, ook vóór samenvoegen.
// En niets gebeurt zonder dat de eigenaar het voorstel op de site bevestigt (backend/ai-bevestiging.ts).
//
// Dit bestand is PUUR (geen Node, geen DOM): de server controleert ermee wat de AI stuurt, de bevestigingskaart toont ermee
// een eerlijke samenvatting, en de test leest dezelfde regels.

export const PR_MAX_BESTANDEN = 50;
/** Totaal van alle bestanden samen (gedecodeerd), zodat een voorstel nooit een opslag- of geheugenbom wordt. */
export const PR_MAX_BYTES = 1_000_000;
export const PR_MAX_BESTAND_BYTES = 400_000;

export type PrBestand = { path: string; content?: string; encoding?: 'utf8' | 'base64'; delete?: boolean };
export type PrVoorstel = {
  repo: string; base: string; branch: string; title: string; body: string; commitMessage: string; draft: boolean;
  files: PrBestand[];
};
export type PrSamenvatting = { repo: string; base: string; branch: string; title: string; bestanden: Array<{ path: string; soort: 'nieuw-of-gewijzigd' | 'verwijderd'; bytes: number }>; bytes: number };

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
/** Een veilige deelverzameling van git check-ref-format: geen «..», geen «//», niet beginnen met «-» of «/», geen «.lock». */
export function geldigeBranch(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const b = v.trim();
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(b)) return false;
  if (b.startsWith('-') || b.startsWith('/') || b.endsWith('/') || b.endsWith('.') || b.endsWith('.lock')) return false;
  if (b.includes('..') || b.includes('//') || b.includes('@{') || b.split('/').some((d) => !d || d.startsWith('.'))) return false;
  return b !== 'HEAD';
}
/** Pad in de repository: relatief, zonder «..», niet in .git en niet in de CI-mappen (die draaien met geheimen). */
export function geldigPad(v: unknown): string | null {
  if (typeof v !== 'string') return 'PAD_ONGELDIG';
  const p = v.trim();
  if (!p || p.length > 300 || p.startsWith('/') || p.includes('\\') || p.includes('\0')) return 'PAD_ONGELDIG';
  const delen = p.split('/');
  if (delen.some((d) => !d || d === '.' || d === '..')) return 'PAD_ONGELDIG';
  if (!/^[A-Za-z0-9._@+ ()\[\]{}#,=~-]+(?:\/[A-Za-z0-9._@+ ()\[\]{}#,=~-]+)*$/.test(p)) return 'PAD_ONGELDIG';
  if (delen[0].toLowerCase() === '.git') return 'PAD_GIT';
  const laag = p.toLowerCase();
  if (laag.startsWith('.github/workflows/') || laag.startsWith('.github/actions/') || laag === '.github/workflows' || laag === '.github/actions') return 'PAD_CI';
  return null;
}
const bytesVan = (f: PrBestand) => (f.delete ? 0 : f.encoding === 'base64' ? Math.floor(String(f.content ?? '').replace(/=+$/, '').length * 3 / 4) : new TextEncoder().encode(String(f.content ?? '')).length);

/** Standaardnaam voor de nieuwe branch: ai/<korte titel>-<JJJJMMDD-UUMMSS> (UTC). Altijd een geldige, nieuwe naam. */
export function standaardBranch(titel: string, nu = Date.now()): string {
  const d = new Date(nu).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const kort = String(titel || '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'wijziging';
  return `ai/${kort}-${d}`;
}

/**
 * Wat de AI stuurt → een gecontroleerd voorstel, of een foutcode (Engels voor het model, zoals de andere weigeringen).
 * `base` mag leeg zijn: dan kiest de server de standaardbranch van de repository.
 */
export function leesPrVoorstel(a: Record<string, unknown>, nu = Date.now()): { ok: true; voorstel: PrVoorstel } | { ok: false; fout: string } {
  const repo = typeof a.repo === 'string' ? a.repo.trim() : '';
  if (!REPO.test(repo)) return { ok: false, fout: 'Invalid "repo": use "owner/name".' };
  const title = typeof a.title === 'string' ? a.title.trim() : '';
  if (title.length < 3 || title.length > 250) return { ok: false, fout: 'Invalid "title": 3-250 characters.' };
  if (a.body !== undefined && (typeof a.body !== 'string' || a.body.length > 20_000)) return { ok: false, fout: 'Invalid "body": at most 20000 characters.' };
  const base = a.base === undefined || a.base === '' ? '' : String(a.base).trim();
  if (base && !geldigeBranch(base)) return { ok: false, fout: 'Invalid "base": a branch name such as "main".' };
  const branch = a.branch === undefined || a.branch === '' ? standaardBranch(title, nu) : String(a.branch).trim();
  if (!geldigeBranch(branch)) return { ok: false, fout: 'Invalid "branch": letters, digits, ".", "_", "-" and "/", no "..", not starting with "-" or "/".' };
  if (base && branch === base) return { ok: false, fout: 'The new "branch" must differ from "base": a pull request never writes to the base branch directly.' };
  const commitMessage = a.commit_message === undefined || a.commit_message === '' ? title : String(a.commit_message).trim();
  if (!commitMessage || commitMessage.length > 500) return { ok: false, fout: 'Invalid "commit_message": 1-500 characters.' };
  if (a.draft !== undefined && typeof a.draft !== 'boolean') return { ok: false, fout: 'Invalid "draft": true or false.' };
  if (!Array.isArray(a.files) || !a.files.length || a.files.length > PR_MAX_BESTANDEN) return { ok: false, fout: `Invalid "files": 1 to ${PR_MAX_BESTANDEN} items of {path, content, encoding?} or {path, delete: true}.` };
  const files: PrBestand[] = [];
  const gezien = new Set<string>();
  let totaal = 0;
  for (const raw of a.files as unknown[]) {
    const f = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const padFout = geldigPad(f.path);
    if (padFout === 'PAD_CI') return { ok: false, fout: `Refused "${String(f.path).slice(0, 80)}": files under .github/workflows and .github/actions run in CI with the repository secrets, so an AI never proposes them. Ask the owner to change them by hand.` };
    if (padFout === 'PAD_GIT') return { ok: false, fout: 'Refused: paths inside ".git" are not files of the repository.' };
    if (padFout) return { ok: false, fout: `Invalid file path "${String(f.path ?? '').slice(0, 80)}": a relative path inside the repository, without "..".` };
    const path = String(f.path).trim();
    if (gezien.has(path)) return { ok: false, fout: `Duplicate file path "${path.slice(0, 80)}".` };
    gezien.add(path);
    if (f.delete === true) { files.push({ path, delete: true }); continue; }
    if (f.delete !== undefined && f.delete !== false) return { ok: false, fout: 'Invalid "delete": true or leave it out.' };
    if (typeof f.content !== 'string') return { ok: false, fout: `File "${path.slice(0, 80)}" needs "content" (or "delete": true).` };
    if (f.encoding !== undefined && f.encoding !== 'utf8' && f.encoding !== 'base64') return { ok: false, fout: 'Invalid "encoding": "utf8" or "base64".' };
    if (f.encoding === 'base64' && !/^[A-Za-z0-9+/]*={0,2}$/.test(f.content)) return { ok: false, fout: `File "${path.slice(0, 80)}": invalid base64.` };
    const bestand: PrBestand = { path, content: f.content, encoding: f.encoding === 'base64' ? 'base64' : 'utf8' };
    const n = bytesVan(bestand);
    if (n > PR_MAX_BESTAND_BYTES) return { ok: false, fout: `File "${path.slice(0, 80)}" is larger than ${PR_MAX_BESTAND_BYTES} bytes.` };
    totaal += n;
    files.push(bestand);
  }
  if (totaal > PR_MAX_BYTES) return { ok: false, fout: `All files together are larger than ${PR_MAX_BYTES} bytes. Split the change into smaller pull requests.` };
  return { ok: true, voorstel: { repo, base, branch, title, body: typeof a.body === 'string' ? a.body : '', commitMessage, draft: a.draft === true, files } };
}

/** Wat de eigenaar op de bevestigingskaart ziet: geen inhoud, wel elk pad, of het nieuw/gewijzigd of verwijderd is, en de grootte. */
export function prSamenvatting(v: PrVoorstel): PrSamenvatting {
  const bestanden = v.files.map((f) => ({ path: f.path, soort: f.delete ? 'verwijderd' as const : 'nieuw-of-gewijzigd' as const, bytes: bytesVan(f) }));
  return { repo: v.repo, base: v.base, branch: v.branch, title: v.title, bestanden, bytes: bestanden.reduce((s, b) => s + b.bytes, 0) };
}
