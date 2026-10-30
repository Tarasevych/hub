/** Actual Drive metadata probe reuses the existing canonical B+ grant; NEVER returns access tokens. */
import { googleSuiteDriveProviderSnapshot, googleSuitePrincipalAccessToken } from './google-suite-inrichting';
import { googleBestandMogelijkheden, type CloudMogelijkhedenAntwoord, type GoogleDriveMetadata, type CloudRuimte } from '../shared/cloud-integratie-contract';

type ProviderAccount = { id: string; principalId: string; status: string };
type ProviderSnapshot = { id: string; accounts: ProviderAccount[] };
const VALID_ID=/^[A-Za-z0-9_-]{3,300}$/;
export class CloudIntegratieFout extends Error {
  constructor(public readonly code:string, public readonly status:number){super(code);this.name='CloudIntegratieFout';}
}
export async function googleDriveLiveMogelijkheden(ownerUserId:string, ruimte:CloudRuimte, accountId:string, fileId:string):Promise<CloudMogelijkhedenAntwoord> {
  if (!VALID_ID.test(accountId) || !VALID_ID.test(fileId)) throw new CloudIntegratieFout('CLOUD_RESOURCE_REF_INVALID',400);
  // Snapshot is filtered by the active cloud lade (AsyncLocalStorage) before looking up account.
  const snapshots=await googleSuiteDriveProviderSnapshot(ownerUserId) as ProviderSnapshot[];
  const account=snapshots.find(item=>item.id==='google')?.accounts.find(item=>item.id===accountId && item.status==='connected');
  if (!account || !VALID_ID.test(account.principalId)) throw new CloudIntegratieFout('CLOUD_GOOGLE_ACCOUNT_NOT_CONNECTED_IN_SPACE',404);
  let token:string;
  try { token=await googleSuitePrincipalAccessToken(ownerUserId,account.principalId,'drive'); }
  catch { throw new CloudIntegratieFout('CLOUD_GOOGLE_GRANT_UNAVAILABLE',403); }
  const ctrl=new AbortController(); const timeout=setTimeout(()=>ctrl.abort(),12000);
  let response:Response;
  try {
    const fields='id,name,mimeType,size,version,md5Checksum,trashed,capabilities(canDownload,canCopy,canEdit,canRename,canDelete,canTrash,canMoveItemWithinDrive,canShare,canAddChildren,canReadRevisions)';
    response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`,{
      method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:ctrl.signal,redirect:'error'
    });
  } catch {throw new CloudIntegratieFout('CLOUD_GOOGLE_METADATA_NETWORK_FAILED',502);}
  finally {clearTimeout(timeout);}
  if (response.status===404) throw new CloudIntegratieFout('CLOUD_GOOGLE_FILE_NOT_FOUND',404);
  if (response.status===401||response.status===403) throw new CloudIntegratieFout('CLOUD_GOOGLE_FILE_NOT_AUTHORIZED',403);
  if (!response.ok) throw new CloudIntegratieFout('CLOUD_GOOGLE_METADATA_PROVIDER_ERROR',502);
  const file=await response.json() as GoogleDriveMetadata;
  if (file.id!==fileId) throw new CloudIntegratieFout('CLOUD_GOOGLE_METADATA_ID_MISMATCH',502);
  const isMap=file.mimeType==='application/vnd.google-apps.folder';
  const parsedSize=file.size!==undefined?Number(file.size):null;
  const size=parsedSize!==null&&Number.isSafeInteger(parsedSize)&&parsedSize>=0?parsedSize:null;
  return {bron:{aanbieder:'google-drive',accountId,bestandId:fileId,ruimte,revisie:String(file.version||'')},
    bestand:{naam:String(file.name||'').slice(0,500),mimeType:String(file.mimeType||'').slice(0,200),grootte:size,isMap,revisie:String(file.version||'')},
    acties:googleBestandMogelijkheden(file),checkedAt:new Date().toISOString(),freshness:'live'};
}
