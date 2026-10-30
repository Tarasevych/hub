/** Cloud M5 provider matrix (API existence is NOT implementation or live readiness).
 * Provider-level capabilities are an upper bound. Actual operations require a checked
 * connection grant + live file permissions + deployed transport + user/space policy.
 * Never use this catalog to enable a destructive operation by itself.
 */
export const FIRST_WAVE_PROVIDERS = [
 'google-drive','onedrive-personal','onedrive-business','sharepoint','dropbox','box',
 'nextcloud','s3','backblaze-b2','pcloud','github'
] as const;
export type WaveOneProvider = typeof FIRST_WAVE_PROVIDERS[number];
export type ProviderAuthType = 'canonical-google'|'oauth-pkce'|'oauth-code'|'github-app'|'nextcloud-login-flow'|'s3-iam'|'s3-b2-key';
export type FileOperation = 'list'|'read'|'upload'|'download'|'delete'|'move'|'share'|'versions'|'restore'|'search';
export type FeatureState = 'not-built'|'coded-unverified'|'staging-verified'|'live-verified';
export type ProviderBlueprint = Readonly<{
 id:WaveOneProvider; title:string; family:'drive'|'business'|'self-hosted'|'object'|'repository';
 authentication:ProviderAuthType; apiReference:string; constraints:readonly string[];
 nativeCapabilities:readonly FileOperation[];
 }>;
const D:readonly FileOperation[]=['list','read','upload','download','delete','move','share','versions','restore','search'];
const O:readonly FileOperation[]=['list','read','upload','download','delete','versions','restore','search'];
export const CLOUD_M5_BLUEPRINTS:readonly ProviderBlueprint[] = [
 {id:'google-drive',title:'Google Drive',family:'drive',authentication:'canonical-google',apiReference:'https://developers.google.com/workspace/drive/api/reference/rest/v3',nativeCapabilities:D,constraints:['Google Workspace files require export rather than binary download','Google drive.file scope limits discoverable files']},
 {id:'onedrive-personal',title:'OneDrive Personal',family:'drive',authentication:'oauth-pkce',apiReference:'https://learn.microsoft.com/en-us/graph/api/resources/driveitem',nativeCapabilities:D,constraints:['Some invite operations are unavailable on root folders']},
 {id:'onedrive-business',title:'OneDrive for Business',family:'business',authentication:'oauth-pkce',apiReference:'https://learn.microsoft.com/en-us/graph/api/resources/driveitem',nativeCapabilities:D,constraints:['Tenant consent and sharing policy may deny an action']},
 {id:'sharepoint',title:'SharePoint',family:'business',authentication:'oauth-pkce',apiReference:'https://learn.microsoft.com/en-us/graph/api/resources/driveitem',nativeCapabilities:D,constraints:['Drive and site identifiers must be resolved under the authenticated tenant']},
 {id:'dropbox',title:'Dropbox',family:'drive',authentication:'oauth-pkce',apiReference:'https://www.dropbox.com/developers/documentation/http/documentation',nativeCapabilities:D,constraints:['App folder and full Dropbox permissions differ','Team resources require team-aware scoping']},
 {id:'box',title:'Box',family:'business',authentication:'oauth-code',apiReference:'https://developer.box.com/reference/',nativeCapabilities:D,constraints:['Enterprise policy and app access restrictions apply','Shared link and collaboration features vary']},
 {id:'nextcloud',title:'Nextcloud',family:'self-hosted',authentication:'nextcloud-login-flow',apiReference:'https://docs.nextcloud.com/server/stable/developer_manual/client_apis/',nativeCapabilities:D,constraints:['Version and installed apps determine OCS and WebDAV features','Network egress and host verification mandatory']},
 {id:'s3',title:'Amazon S3',family:'object',authentication:'s3-iam',apiReference:'https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html',nativeCapabilities:O,constraints:['Object storage has no true folders or per-user sharing invitations','Object versioning requires bucket configuration']},
 {id:'backblaze-b2',title:'Backblaze B2',family:'object',authentication:'s3-b2-key',apiReference:'https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api',nativeCapabilities:O,constraints:['Backblaze application key, not master key','No per-object ACL overrides or AWS IAM roles','B2 S3 compatible subset differs from AWS S3']},
 {id:'pcloud',title:'pCloud',family:'drive',authentication:'oauth-code',apiReference:'https://docs.pcloud.com/',nativeCapabilities:D,constraints:['OAuth redirect determines US/EU API endpoint','Authentication is not equivalent to Microsoft/Dropbox refresh-token flow']},
 {id:'github',title:'GitHub repositories',family:'repository',authentication:'github-app',apiReference:'https://docs.github.com/en/rest/repos/contents',nativeCapabilities:['list','read','upload','download','delete','versions','search'],constraints:['Repository contents are version-controlled source files, not general cloud storage','Commit creation differs from direct file upload','Private repo installation access must be checked']}
] as const;
export type ProviderReadiness={provider:WaveOneProvider;driver:FeatureState;onboarding:FeatureState;permissions:FeatureState;transfer:FeatureState;sharing:FeatureState;recovery:FeatureState;passedContractTests:boolean;liveEvidence?:string};
export const NOT_READY:Omit<ProviderReadiness,'provider'>={driver:'not-built',onboarding:'not-built',permissions:'not-built',transfer:'not-built',sharing:'not-built',recovery:'not-built',passedContractTests:false};
const needed:readonly (keyof ProviderReadiness)[]=['driver','onboarding','permissions','transfer','recovery'];
export function resolveProviderReadiness(provider:WaveOneProvider, proofs:readonly ProviderReadiness[]){
 const info=CLOUD_M5_BLUEPRINTS.find(x=>x.id===provider);if(!info)throw Error('CLOUD_M5_UNKNOWN_PROVIDER');
 const rec=proofs.find(x=>x.provider===provider);
 const complete=!!rec&&rec.passedContractTests&&needed.every(k=>rec[k]==='live-verified')&&
  (info.nativeCapabilities.includes('share')?rec.sharing==='live-verified':true)&&!!rec.liveEvidence?.startsWith('ci://');
 return {id:provider,title:info.title,authentication:info.authentication,ready:complete,
  status:complete?'verified-live':'not-ready',missing:complete?[]:!rec?['NO_EVIDENCE']:['NOT_ALL_LIVE_GATES_PASSED'],
  supportedByProvider:[...info.nativeCapabilities],constraints:[...info.constraints]};
}
export function providerOperationDecision(provider:WaveOneProvider,operation:FileOperation,readiness:readonly ProviderReadiness[],grant:boolean,fileAcl:boolean){
 const providerInfo=CLOUD_M5_BLUEPRINTS.find(x=>x.id===provider);
 if(!providerInfo||!providerInfo.nativeCapabilities.includes(operation))return {allowed:false,reason:'PROVIDER_DOES_NOT_SUPPORT'};
 if(!resolveProviderReadiness(provider,readiness).ready)return {allowed:false,reason:'DRIVER_NOT_LIVE_VERIFIED'};
 if(!grant)return {allowed:false,reason:'ACCOUNT_GRANT_MISSING'};
 if(!fileAcl)return {allowed:false,reason:'FILE_PERMISSION_MISSING'};
 return {allowed:true,reason:'OK'};
}
