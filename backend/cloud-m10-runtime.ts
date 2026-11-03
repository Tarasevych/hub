/** M10 read-only STAGING composition for already-scoped Google Suite / M4 OAuth.
 * Explicitly NOT the first-wave production registry: SharePoint, Nextcloud,
 * S3/B2, pCloud and GitHub need independently verified scoped resolvers.
 * No browser-selected credential, URL or user id is trusted here.
 */
import {CloudMultiAccountWorkspace,CloudOpaqueCursors,type DirectoryAccount,type Viewer} from './cloud-m8-werkruimte';
import {GoogleDriveDirectory,GraphDirectory,DropboxDirectory,BoxDirectory} from './cloud-m8-directory';
import {PostgresCloudConnections} from './cloud-verbinding-m4-pg';
import {cloudTransportToken} from './cloud-overdracht-credentials';
import {GoogleDriveTransport,MicrosoftGraphTransport,DropboxTransport} from './cloud-overdracht-adapters';
import {BoxTransport} from './cloud-overdracht-m3-providers';
import {CloudM11PreviewService} from './cloud-m11-voorbeeld';
import type {CloudMultiAccountWorkspace as M11Workspace} from './cloud-m8-werkruimte';
import {assertCloudProviderEnabled} from './cloud-m6-aanbieder-gate';
import {googleSuiteDriveProviderSnapshot} from './google-suite-inrichting';

function cursorSecret():Uint8Array|null{
 const value=process.env.CLOUD_M8_CURSOR_KEY_V1||'';
 if(/^[0-9a-f]{64}$/i.test(value))return Buffer.from(value,'hex');
 if(/^[A-Za-z0-9_-]{43}$/.test(value)){
  const bytes=Buffer.from(value,'base64url');return bytes.length===32?bytes:null;
 }
 return null;
}

/** Only register after conscious staging opt-in and separately protected secret.
 * Every operation subsequently checks account, space and provider policy.
 */
export function createM10StagingDirectoryRuntime():CloudMultiAccountWorkspace|undefined{
 if(process.env.CLOUD_M10_STAGING_RUNTIME!=='enabled'||process.env.CLOUD_M8_DIRECTORY_STAGING!=='enabled')return undefined;
 const secret=cursorSecret();if(!secret)return undefined;
 const store=new PostgresCloudConnections();
 return new CloudMultiAccountWorkspace({
  async find(principal:Viewer,id:string):Promise<DirectoryAccount|null>{
   // M4 list deliberately returns no tokens. One account is selected by exact id.
   const connected=await store.list({owner:principal.owner,space:principal.space});
   const account=connected.find(a=>a.id===id&&a.status==='connected');
   if(account){
    const permitted=['onedrive-personal','onedrive-business','dropbox','box'];
    if(!permitted.includes(account.provider))return null;
    return{id:account.id,owner:principal.owner,space:principal.space,provider:account.provider,
     status:'connected',label:account.label||account.displayName};
   }
   // Preserve original canonical Google account model and grant (B+), without
   // treating an M4 token as a Google token or switching any tab's primary.
   const sources=await googleSuiteDriveProviderSnapshot(principal.owner) as Array<{id:string;accounts:Array<{id:string;email:string;displayName?:string;status:string}>}>;
   const google=sources.find(p=>p.id==='google')?.accounts.find(a=>a.id===id&&a.status==='connected');
   return google?{id:google.id,provider:'google-drive',owner:principal.owner,space:principal.space,status:'connected',label:google.displayName||google.email}:null;
  }
 },async(provider)=>assertCloudProviderEnabled(provider,'operate'),new CloudOpaqueCursors(secret),[
  new GoogleDriveDirectory(cloudTransportToken),
  new GraphDirectory('onedrive-personal',cloudTransportToken,undefined),
  new GraphDirectory('onedrive-business',cloudTransportToken,undefined),
  new DropboxDirectory(cloudTransportToken),new BoxDirectory(cloudTransportToken)
 ]);
}

/** Bounded preview for the four verified transport families only. Additional
 * providers (incl. SharePoint) remain fail-closed until their exact drives,
 * credential resolvers, and download-redirect behavior have live E2E proof.
 */
export function createM11StagingPreviewRuntime(workspace:M11Workspace|undefined):CloudM11PreviewService|undefined{
 if(!workspace||process.env.CLOUD_M11_PREVIEW_STAGING!=='enabled'||process.env.CLOUD_M10_STAGING_RUNTIME!=='enabled')return undefined;
 return new CloudM11PreviewService(workspace,[
  new GoogleDriveTransport(cloudTransportToken),
  new MicrosoftGraphTransport('onedrive-personal',cloudTransportToken),
  new MicrosoftGraphTransport('onedrive-business',cloudTransportToken),
  new DropboxTransport(cloudTransportToken),
  new BoxTransport(cloudTransportToken)
 ]);
}
