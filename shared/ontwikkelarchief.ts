// TRACE-001 · Verplichte, onveranderlijke herkomst van iedere volgende uitrol.
// Geen ruwe keten-van-gedachten, geheimen of ongetoetste auditclaims in een pakket.
export const ONTWIKKELARCHIEF_BESTAND = 'ONTWIKKELARCHIEF.json';
export const ONTWIKKELARCHIEF_VERPLICHT_VANAF = '20261103-211555';
export const ONTWIKKELARCHIEF_MAX = 8_192;
export const ONTWIKKELARCHIEF_REPO = 'Tarasevych/hub';
const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const VERSIE = /^\d{8}-\d{6}$/;
const TAAK = /^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/;
// TELEGRAM-001: naast de oude Engelse voorvoegsels ook Nederlandse (functie/herstel/controle); oude namen blijven geldig.
export const TAK = /^(functie|herstel|controle|feature|fix|audit|release)\/[a-z0-9]+(?:-[a-z0-9]+)*-\d{8}-\d{6}$/;

export type OntwikkelArchief = {
  schema: 1;
  taakId: string;
  repo: string;
  tak: string;
  commit: string;
  pad: string;
  sha256: string;
  url: string;
  release: string;
  pakket: string;
};

export const ontwikkelArchiefVerplicht = (v: string) => VERSIE.test(v) && v >= ONTWIKKELARCHIEF_VERPLICHT_VANAF;
export const ontwikkelArchiefPad = (id: string) => `orchestratie/ontwikkelarchieven/${id}.json`;
export const ontwikkelArchiefUrl = (commit: string, pad: string) => `https://github.com/${ONTWIKKELARCHIEF_REPO}/blob/${commit}/${pad}`;
export const ontwikkelArchiefRelease = (versie: string) => `https://github.com/${ONTWIKKELARCHIEF_REPO}/releases/tag/${versie}`;
export const ontwikkelArchiefApi = (ref: OntwikkelArchief) =>
  `https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/contents/${ref.pad}?ref=${ref.commit}`;
export const ontwikkelReleaseApi = (ref: OntwikkelArchief) =>
  `https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/releases/tags/${ref.release.split('/').pop()}`;

export function leesOntwikkelArchief(ruw: string | null | undefined, versie: string, bronCommit: string): { ref: OntwikkelArchief | null; fouten: string[] } {
  const fouten: string[] = [];
  if (!ruw || BufferByteLengte(ruw) > ONTWIKKELARCHIEF_MAX) return { ref: null, fouten: ['bestand ontbreekt of overschrijdt 8192 bytes'] };
  let o: Record<string, unknown>;
  try { const j = JSON.parse(ruw); if (!j || typeof j !== 'object' || Array.isArray(j)) throw Error('object'); o = j; }
  catch { return { ref: null, fouten: ['geen geldig JSON-object'] }; }
  const veld = (k: string) => typeof o[k] === 'string' ? String(o[k]) : '';
  const taakId = veld('taakId'), repo = veld('repo'), tak = veld('tak'), commit = veld('commit');
  const pad = veld('pad'), sha256 = veld('sha256'), url = veld('url'), release = veld('release'), pakket = veld('pakket');
  if (o.schema !== 1) fouten.push('schema');
  if (!TAAK.test(taakId)) fouten.push('taakId');
  if (repo !== ONTWIKKELARCHIEF_REPO) fouten.push('repo');
  if (!TAK.test(tak)) fouten.push('tak');
  if (!SHA.test(commit) || commit !== bronCommit) fouten.push('commit / BRON-COMMIT');
  if (pad !== ontwikkelArchiefPad(taakId)) fouten.push('pad');
  if (!HASH.test(sha256)) fouten.push('sha256');
  if (url !== ontwikkelArchiefUrl(commit,pad)) fouten.push('url');
  if (!VERSIE.test(versie) || release !== ontwikkelArchiefRelease(versie)) fouten.push('release');
  if (pakket !== `mijn-ruimte-${versie}.tar.gz`) fouten.push('pakket');
  return fouten.length ? { ref: null, fouten } : { ref: o as OntwikkelArchief, fouten };
}

// Zonder Node Buffer op moduleniveau: ook bruikbaar bij de browser-voorcontrole.
function BufferByteLengte(s: string) { return new TextEncoder().encode(s).byteLength; }

export function valideerOntwikkelDossier(ruw: unknown, taakId: string): string[] {
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) return ['dossier: object ontbreekt'];
  const d = ruw as Record<string, unknown>;
  const fout: string[] = [];
  if (d.schema !== 1 || d.taakId !== taakId) fout.push('dossier.schema/taakId');
  if (typeof d.opdracht !== 'string' || d.opdracht.trim().length < 40) fout.push('dossier.opdracht');
  for (const veld of ['tijdlijn','keuzes','wijzigingen','controles','bronnen','beperkingen']) {
    if (!Array.isArray(d[veld]) || !(d[veld] as unknown[]).length) fout.push(`dossier.${veld}`);
  }
  if (!d.privacy || typeof d.privacy !== 'object' || (d.privacy as any).geheimenUitgesloten !== true) fout.push('dossier.privacy');
  return fout;
}
