import {db} from '../server/platform';
import {heeftApiRecht} from './api-recht';
import {apiPlatformVaultItems} from './api-platform-vault';
import {googleSuiteOnboardingSnapshot} from './google-suite-onboarding';
import {createGoogleContourRoutes} from './google-contour';
import {createAccessPlaneRoutes} from './access-plane';

export const OWNER_CONNECTIONS_TABLE='owner_connections_v1';
export type ConnectionStatus='not_connected'|'configured'|'error'|'revoked';
export type ConnectionKind='google-link'|'vault-secret';
export type ConnectionId='google-identity'|'google-gmail'|'google-drive'|'home-assistant'|'telegram'|'github';
type SessionAuth={errorCode:string}|{user:{id:string;email:string;role:string;status:string};service:string};
type OverrideRecord={id:string;ownerUserId:string;connectorId:ConnectionId;status:ConnectionStatus;lastError:string;updatedAt:number;createdAt:number};

const STATUSES:ConnectionStatus[]=['not_connected','configured','error','revoked'];
const VAULT_PURPOSE:Partial<Record<ConnectionId,'home-assistant'|'telegram'|'github'>>={'home-assistant':'home-assistant',telegram:'telegram',github:'github'};
export const API_PLATFORM_CONNECTIONS:Array<{id:ConnectionId;kind:ConnectionKind;labelUk:string;labelNl:string;noteUk:string;noteNl:string}>=[
  {id:'google-identity',kind:'google-link',labelUk:'Google identity',labelNl:'Google-identiteit',noteUk:'Живий екосистемний вхід. Без другого OAuth.',noteNl:'Bestaande ecosysteeminlog. Geen tweede OAuth.'},
  {id:'google-gmail',kind:'google-link',labelUk:'Gmail',labelNl:'Gmail',noteUk:'Посилання на існуючий mail-grant. Без другого OAuth.',noteNl:'Verwijst naar de bestaande mail-grant. Geen tweede OAuth.'},
  {id:'google-drive',kind:'google-link',labelUk:'Google Drive',labelNl:'Google Drive',noteUk:'Посилання на існуючий Drive-grant. Без другого OAuth.',noteNl:'Verwijst naar de bestaande Drive-grant. Geen tweede OAuth.'},
  {id:'home-assistant',kind:'vault-secret',labelUk:'Home Assistant',labelNl:'Home Assistant',noteUk:'Long-lived token зберігається в owner vault.',noteNl:'Long-lived token wordt in de owner-kluis bewaard.'},
  {id:'telegram',kind:'vault-secret',labelUk:'Telegram',labelNl:'Telegram',noteUk:'Bot token зберігається в owner vault.',noteNl:'Bot-token wordt in de owner-kluis bewaard.'},
  {id:'github',kind:'vault-secret',labelUk:'GitHub PAT',labelNl:'GitHub-PAT',noteUk:'Окремо від UI github.tarasevych.com. PAT тільки в vault.',noteNl:'Apart van de UI github.tarasevych.com. PAT alleen in de kluis.'}
];

const nextStep=(id:ConnectionId,status:ConnectionStatus)=>{const vault='/?service=api&tab=vault&lang=uk';if(id==='google-identity')return{href:'/?service=identity&tab=security&lang=uk',labelUk:status==='configured'?'Відкрити налаштування identity':'Перевірити вхід Google',labelNl:status==='configured'?'Identity-instellingen openen':'Google-aanmelding controleren'};if(id==='google-gmail')return{href:status==='configured'?'/?service=mail&tab=inbox&lang=uk':'/?service=mail&tab=accounts&lang=uk',labelUk:status==='configured'?'Відкрити пошту':'Підключити Gmail на /accounts',labelNl:status==='configured'?'Mail openen':'Gmail koppelen via /accounts'};if(id==='google-drive')return{href:'/?service=cloud&tab=overview&lang=uk',labelUk:status==='configured'?'Відкрити Drive / cloud':'Підключити Drive у cloud',labelNl:status==='configured'?'Drive / cloud openen':'Drive koppelen in cloud'};if(id==='github'&&status==='configured')return{href:vault,labelUk:'Керувати GitHub PAT у vault',labelNl:'GitHub-PAT in de kluis beheren'};return{href:vault,labelUk:status==='configured'?'Керувати секрет у vault':'Зберегти секрет у vault',labelNl:status==='configured'?'Geheim in de kluis beheren':'Geheim in de kluis opslaan'};};

async function overridesFor(ownerUserId:string){const rows=await db.list<Omit<OverrideRecord,'id'>>(OWNER_CONNECTIONS_TABLE,{filter:{ownerUserId},limit:40});return rows.items as OverrideRecord[];}
async function suiteServices(ownerUserId:string,email:string){try{const snapshot=await googleSuiteOnboardingSnapshot(ownerUserId,email);const list=Array.isArray(snapshot.services)?snapshot.services:[];return{identityLinked:Boolean(snapshot.primaryAccount?.identityLinked||email),mail:list.find(item=>item.id==='mail'),drive:list.find(item=>item.id==='drive')};}catch{return{identityLinked:Boolean(email),mail:undefined,drive:undefined};}}
const googleStatus=(granted:boolean|undefined,suiteStatus:string|undefined):ConnectionStatus=>{if(suiteStatus==='configuration_missing')return 'error';if(granted||suiteStatus==='granted')return 'configured';return 'not_connected';};

export async function apiPlatformConnectionCards(ownerUserId:string,email:string){const[vault,overrides,suite]=await Promise.all([apiPlatformVaultItems(ownerUserId),overridesFor(ownerUserId),suiteServices(ownerUserId,email)]);return API_PLATFORM_CONNECTIONS.map(item=>{const override=overrides.find(row=>row.connectorId===item.id);const purpose=VAULT_PURPOSE[item.id];const vaultItem=purpose?vault.find(row=>row.purpose===purpose):undefined;let status:ConnectionStatus='not_connected';let source='catalog';if(item.id==='google-identity'){status=suite.identityLinked?'configured':'not_connected';source='google-identity';}else if(item.id==='google-gmail'){status=googleStatus(suite.mail?.granted,suite.mail?.status);source='google-suite-mail';}else if(item.id==='google-drive'){status=googleStatus(suite.drive?.granted,suite.drive?.status);source='google-suite-drive';}else{status=vaultItem?'configured':'not_connected';source=vaultItem?'owner-vault':'catalog';if(override&&(override.status==='error'||override.status==='revoked'||override.status==='not_connected')){status=override.status;source='owner-override';}}
    const step=nextStep(item.id,status);
    return{id:item.id,kind:item.kind,labelUk:item.labelUk,labelNl:item.labelNl,noteUk:item.noteUk,noteNl:item.noteNl,status,source,hasVaultSecret:Boolean(vaultItem),vaultName:vaultItem?.keyName||'',lastError:override?.lastError||'',updatedAt:override?.updatedAt||vaultItem?.updatedAt||0,nextStep:step,canMarkStatus:item.kind==='vault-secret',oauthSecondPass:false};});}
export async function apiPlatformConnectionsConfiguredCount(ownerUserId:string,email:string){return(await apiPlatformConnectionCards(ownerUserId,email)).filter(item=>item.status==='configured').length;}

export function createApiPlatformConnectionRoutes(deps:{requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;respond:(data:unknown,status?:number)=>unknown;fail:(message:string,status?:number)=>unknown;audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;body:(body:unknown)=>Record<string,unknown>}){
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{const auth=await deps.requireSession(event,body);if('errorCode'in auth||auth.service!=='api'||auth.user.status!=='approved')return null;if(!heeftApiRecht(auth.user as never))return null;return auth;};
  return{
    'POST /api/owner/api-platform/connections':[async(ctx)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);const items=await apiPlatformConnectionCards(auth.user.id,auth.user.email);return deps.respond({items,count:items.length,configuredCount:items.filter(item=>item.status==='configured').length,oauthSecondPass:false});}],
    'POST /api/owner/api-platform/connections/:id/status':[async(ctx)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);const connector=API_PLATFORM_CONNECTIONS.find(item=>item.id===ctx.params.id);if(!connector)return deps.fail('OWNER_CONNECTION_UNKNOWN',404);if(connector.kind!=='vault-secret')return deps.fail('OWNER_CONNECTION_STATUS_LINK_ONLY',400);const body=deps.body(ctx.body);const status=String(body.status||'') as ConnectionStatus;if(!STATUSES.includes(status))return deps.fail('OWNER_CONNECTION_STATUS_INVALID',400);const lastError=String(body.lastError||'').trim().slice(0,180);const existing=(await overridesFor(auth.user.id)).find(item=>item.connectorId===connector.id);const now=Date.now();if(existing?.id){const record={...existing,status,lastError,updatedAt:now};const{id,...stored}=record;const[ok]=await db.update(OWNER_CONNECTIONS_TABLE,[{id,record:stored}]);if(!ok)return deps.fail('OWNER_CONNECTION_WRITE_FAILED',500);}else{const[id]=await db.add(OWNER_CONNECTIONS_TABLE,[{ownerUserId:auth.user.id,connectorId:connector.id,status,lastError,createdAt:now,updatedAt:now}]);if(!id)return deps.fail('OWNER_CONNECTION_WRITE_FAILED',500);}await deps.audit(auth.user.id,'owner.api.connection.status','success',{connectorId:connector.id,status});const items=await apiPlatformConnectionCards(auth.user.id,auth.user.email);return deps.respond({ok:true,item:items.find(item=>item.id===connector.id),items});}],
    ...createGoogleContourRoutes(deps),
    ...createAccessPlaneRoutes(deps)
  };
}
