// TRACE-001 · Alleen vaste GitHub API-adressen worden opgevraagd (geen URL uit het pakket wordt opgevolgd).
// Zowel het op een commit vastgezette ontwikkeldossier als de exacte release-asset moeten bestaan.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  type OntwikkelArchief, ontwikkelArchiefApi, ontwikkelReleaseApi,
  valideerOntwikkelDossier, ONTWIKKELARCHIEF_REPO
} from '../shared/ontwikkelarchief';

export type ArchiefControle = { ok: boolean; code: string; reden: string; url?: string; handmatig?: { uploader: string; auteur: string } };
const fout = (code: string, reden: string): ArchiefControle => ({ok:false,code,reden});
/** De vaste bot-identiteit waarmee GitHub Actions (GITHUB_TOKEN) releases en assets aanmaakt. */
export const GITHUB_ACTIONS_BOT = Object.freeze({ login: 'github-actions[bot]', id: 41898282, type: 'Bot' });
export const doorGithubActions = (wie: unknown): boolean => {
  const w = wie as { login?: unknown; id?: unknown; type?: unknown } | null | undefined;
  return !!w && w.login === GITHUB_ACTIONS_BOT.login && w.id === GITHUB_ACTIONS_BOT.id && w.type === GITHUB_ACTIONS_BOT.type;
};
type Net = typeof fetch;

export async function sha256VanBestand(pad: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash=createHash('sha256');
    const stream=createReadStream(pad);
    stream.on('data',(b)=>hash.update(b));
    stream.on('error',reject);
    stream.on('end',()=>resolve(hash.digest('hex')));
  });
}

export async function controleerOntwikkelArchiefOnline(
  ref: OntwikkelArchief, pakketSha: string,
  opties: { ophalen?: Net; token?: string; timeoutMs?: number } = {}
): Promise<ArchiefControle> {
  if (!/^[0-9a-f]{64}$/.test(pakketSha)) return fout('ONTWIKKELARCHIEF_ONGELDIG','SHA-256 van het pakket ontbreekt');
  const ophalen=opties.ophalen || fetch;
  const headers:Record<string,string>={
    Accept:'application/vnd.github+json','User-Agent':'Mijn-Ruimte-Uitrol-TRACE-001','X-GitHub-Api-Version':'2022-11-28'
  };
  if (opties.token) headers.Authorization='Bearer '+opties.token;
  async function gh(url:string):Promise<any>{
    const res=await ophalen(url,{headers,redirect:'error',signal:AbortSignal.timeout(opties.timeoutMs??12000)});
    if(res.status===404) throw new Error('404');
    if(!res.ok) throw new Error('HTTP_'+res.status);
    const raw=await res.text();
    if(raw.length>800_000) throw new Error('TE_GROOT');
    return JSON.parse(raw);
  }
  try {
    const content=await gh(ontwikkelArchiefApi(ref));
    if(content.type!=='file' || content.encoding!=='base64' || typeof content.content!=='string') return fout('ONTWIKKELARCHIEF_ONGELDIG','Geen GitHub-bestand');
    const bytes=Buffer.from(content.content.replace(/\s+/g,''),'base64');
    if(bytes.length>256_000 || bytes.length===0) return fout('ONTWIKKELARCHIEF_ONGELDIG','Dossier is leeg of te groot');
    if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256) return fout('ONTWIKKELARCHIEF_SHA_VERSCHILT','Commitbestand heeft andere SHA-256');
    let dossier: unknown;
    try{dossier=JSON.parse(bytes.toString('utf8'));}catch{return fout('ONTWIKKELARCHIEF_ONGELDIG','Dossier-JSON ongeldig');}
    const fouten=valideerOntwikkelDossier(dossier,ref.taakId);
    if(fouten.length) return fout('ONTWIKKELARCHIEF_ONGELDIG',fouten.join(', ').slice(0,230));

    const branch=await gh(`https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/branches/${ref.tak.split('/').map(encodeURIComponent).join('/')}`);
    const head=String(branch?.commit?.sha||'');
    if(!/^[0-9a-f]{40}$/.test(head)) return fout('ONTWIKKELARCHIEF_TAK_ONGELDIG','GitHub-tak heeft geen geldige HEAD');
    const vergelijking=await gh(`https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/compare/${ref.commit}...${head}`);
    if(!['ahead','identical'].includes(vergelijking?.status)) return fout('ONTWIKKELARCHIEF_TAK_ONGELDIG','Dossiercommit hoort niet bij de taak-tak');

    const release=await gh(ontwikkelReleaseApi(ref));
    const asset=Array.isArray(release?.assets)?release.assets.find((a:any)=>a?.name===ref.pakket):null;
    if(!asset || asset.state!=='uploaded') return fout('ONTWIKKELARCHIEF_PAKKET_ONTBREEKT','Exacte tar.gz ontbreekt op GitHub Release');
    if(asset.digest!==`sha256:${pakketSha}`) return fout('ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT','Release-asset wijkt af van het geüploade tar.gz');
    // SEC-PAKKET-001 (16.11.2026): wie het archief in de release zette. Normaal is dat GitHub Actions zelf (bot). Een archief dat met de
    // hand is geüpload (de eigenaar doet dat soms; een dief met een gestolen token zou het ook zo doen) wordt NIET geweigerd — het is een
    // rode vlag: de voorcontrole toont wie uploadde en de goedkeuring vraagt een apart vinkje vóór de passkey. Root logt het.
    // Архів, завантажений у випуск вручну, не відхиляється (власник теж так робить), а стає червоним прапорцем з окремим підтвердженням.
    const bot=doorGithubActions(asset?.uploader) && doorGithubActions(release?.author);
    const naam=(w:any)=>String(w?.login||'onbekend').replace(/[^A-Za-z0-9_.\[\]-]/g,'').slice(0,40)||'onbekend';
    return {ok:true,code:'OK',reden:'Vastgelegd dossier, taak-tak en exact GitHub Release-archief bevestigd',url:ref.url,
      ...(bot?{}:{handmatig:{uploader:naam(asset?.uploader),auteur:naam(release?.author)}})};
  } catch (e) {
    const probleem=e instanceof Error?e.message:'netwerk';
    return fout(probleem==='404'?'ONTWIKKELARCHIEF_NIET_GEVONDEN':'ONTWIKKELARCHIEF_ONBEREIKBAAR',
      probleem==='404'?'GitHub-dossier, tak of Release bestaat niet':'GitHub kon niet veilig worden geverifieerd: '+probleem.slice(0,50));
  }
}
