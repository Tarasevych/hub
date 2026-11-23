/** Складники середовища виконання M10 для читання тек (M8) та захищеного перегляду байтів (M11)
 * поверх перевірених підключень Google Диску та сховища OAuth M4 у межах простору користувача.
 * Samenstelling van de lees- en voorbeeldweergave (M8/M10/M11) per gebruikersruimte.
 */
import {hkdfSync,randomBytes} from 'node:crypto';
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

let procesCursorSleutel:Uint8Array|null=null;

function cursorSecret():Uint8Array|null{
 const value=process.env.CLOUD_M8_CURSOR_KEY_V1||'';
 if(/^[0-9a-f]{64}$/i.test(value))return Buffer.from(value,'hex');
 if(/^[A-Za-z0-9_-]{43,44}$/.test(value)){
  const bytes=Buffer.from(value,'base64url');return bytes.length===32?bytes:null;
 }
 return null;
}

function cursorSecretAltijd():Uint8Array{
 const expliciet=cursorSecret();
 if(expliciet)return expliciet;
 const zaad=(
  process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1||
  process.env.RUIMTE_BINDING_SLEUTEL_V1||
  process.env.SESSION_SECRET||
  process.env.TOTP_ENCRYPTION_KEY_V1||
  ''
 ).trim();
 if(zaad.length>=16){
  return new Uint8Array(hkdfSync('sha256',Buffer.from(zaad,'utf8'),'mijn-ruimte-cloud-m8','cloud-m8-cursor-sleutel-v1',32));
 }
 procesCursorSleutel??=new Uint8Array(randomBytes(32));
 return procesCursorSleutel;
}

function bouwWorkspace(secret:Uint8Array):CloudMultiAccountWorkspace{
 const store=new PostgresCloudConnections();
 return new CloudMultiAccountWorkspace({
  async find(principal:Viewer,id:string):Promise<DirectoryAccount|null>{
   const connected=await store.list({owner:principal.owner,space:principal.space});
   const account=connected.find(a=>a.id===id&&a.status==='connected');
   if(account){
    const permitted=['onedrive-personal','onedrive-business','dropbox','box'];
    if(!permitted.includes(account.provider))return null;
    return{id:account.id,owner:principal.owner,space:principal.space,provider:account.provider,
     status:'connected',label:account.label||account.displayName};
   }
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

function bouwPreview(workspace:M11Workspace):CloudM11PreviewService{
 return new CloudM11PreviewService(workspace,[
  new GoogleDriveTransport(cloudTransportToken),
  new MicrosoftGraphTransport('onedrive-personal',cloudTransportToken),
  new MicrosoftGraphTransport('onedrive-business',cloudTransportToken),
  new DropboxTransport(cloudTransportToken),
  new BoxTransport(cloudTransportToken)
 ]);
}

let luieWorkspace:CloudMultiAccountWorkspace|null=null;
let luiePreview:CloudM11PreviewService|null=null;

export function ensureM10DirectoryRuntime():CloudMultiAccountWorkspace{
 luieWorkspace??=bouwWorkspace(cursorSecretAltijd());
 return luieWorkspace;
}

export function ensureM11PreviewRuntime(workspace?:M11Workspace):CloudM11PreviewService{
 if(workspace)return bouwPreview(workspace);
 luiePreview??=bouwPreview(ensureM10DirectoryRuntime());
 return luiePreview;
}

export function createM10StagingDirectoryRuntime():CloudMultiAccountWorkspace|undefined{
 if(process.env.CLOUD_M10_STAGING_RUNTIME!=='enabled'||process.env.CLOUD_M8_DIRECTORY_STAGING!=='enabled')return undefined;
 const secret=cursorSecret();if(!secret)return undefined;
 return bouwWorkspace(secret);
}

export function createM11StagingPreviewRuntime(workspace:M11Workspace|undefined):CloudM11PreviewService|undefined{
 if(!workspace||process.env.CLOUD_M11_PREVIEW_STAGING!=='enabled'||process.env.CLOUD_M10_STAGING_RUNTIME!=='enabled')return undefined;
 return bouwPreview(workspace);
}
