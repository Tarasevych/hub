import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {GEEN_RECHT,heeftApiRecht,weigerCode} from './api-recht';
import {db,error,json} from '../server/platform';
import {getPool} from '../server/platform/pg';
import {sessieGeverifieerd,zetGebruiker} from '../server/platform/context';
import {apiPlatformContractPayload} from './api-platform-contract';
import {apiPlatformVaultCount,vaultEncryptionReady} from './api-platform-kluis';
import {apiPlatformConnectionsConfiguredCount} from './api-platform-verbindingen';
import {createOwnerHandoffRoutes} from './eigenaar-sessie-overdracht';

export const API_MACHINE_TOKEN_TABLE='api_machine_tokens_v1';
export const API_PAT_PREFIX='tsv_';
export const API_PAT_ISSUABLE_SCOPES=['identity.me.read'] as const;
export const API_PAT_FORBIDDEN_SCOPES=['site.deploy','source.write','vault.write','device.command'] as const;
const MAX_LIVE=8;
const DEFAULT_TTL_MS=90*24*60*60*1000;
const MAX_TTL_MS=365*24*60*60*1000;
const RATE_WINDOW_MS=60_000;
const RATE_MAX=60;

type PatRecord={id:string;ownerUserId:string;prefix:string;tokenHash:string;scopes:string[];label:string;createdAt:number;expiresAt:number;lastUsedAt:number;revokedAt:number;rateWindowStart:number;rateCount:number};
type SessionAuth={errorCode:string}|{user:{id:string;email:string;role:string;status:string};service:string};

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const sameHash=(a:string,b:string)=>{const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)};
const headerMap=(event:Record<string,unknown>)=>{const raw=((event.headers||{})as Record<string,unknown>);const out:Record<string,string>={};for(const[key,value]of Object.entries(raw))out[key.toLowerCase()]=String(value||'');return out};
const bearerToken=(event:Record<string,unknown>)=>{const match=/^Bearer\s+(tsv_[A-Za-z0-9_-]+)$/i.exec(headerMap(event).authorization||'');return match?.[1]||''};
const publicToken=(item:PatRecord)=>({id:item.id,prefix:item.prefix,display:`${API_PAT_PREFIX}${item.prefix}_…`,scopes:item.scopes,label:item.label,createdAt:item.createdAt,expiresAt:item.expiresAt,lastUsedAt:item.lastUsedAt||null,revokedAt:item.revokedAt||null,status:item.revokedAt?'revoked':item.expiresAt<=Date.now()?'expired':'active'});

export async function apiPlatformTokensForOwner(ownerUserId:string){const rows=await db.list<Omit<PatRecord,'id'>>(API_MACHINE_TOKEN_TABLE,{filter:{ownerUserId},limit:100});return(rows.items as PatRecord[]).sort((a,b)=>b.createdAt-a.createdAt)}
export async function apiPlatformLiveTokenCount(ownerUserId:string){const now=Date.now();return(await apiPlatformTokensForOwner(ownerUserId)).filter(item=>!item.revokedAt&&item.expiresAt>now).length}

function normalizeScopes(input:unknown){const requested=[...new Set((Array.isArray(input)?input:[input]).map(item=>String(item||'').trim()).filter(Boolean))];if(!requested.length)return [...API_PAT_ISSUABLE_SCOPES];if(requested.some(scope=>API_PAT_FORBIDDEN_SCOPES.includes(scope as typeof API_PAT_FORBIDDEN_SCOPES[number])||scope.endsWith('.write')||scope==='device.command'))throw new Error('API_TOKEN_SCOPE_FORBIDDEN');if(requested.some(scope=>!(API_PAT_ISSUABLE_SCOPES as readonly string[]).includes(scope)))throw new Error('API_TOKEN_SCOPE_NOT_ISSUABLE');return requested}

async function findByHash(tokenHash:string){const rows=await db.list<Omit<PatRecord,'id'>>(API_MACHINE_TOKEN_TABLE,{filter:{tokenHash},limit:5});return(rows.items as PatRecord[])[0]||null}

// SEC-002 / autorisatie-03 (12.11.2026): elk gebruik van een sleutel schreef het HELE record terug uit een eerder gelezen
// momentopname. (1) Viel «відкликати ключ» tussen dat lezen en schrijven, dan stond revokedAt daarna weer op 0: wie een gelekte
// sleutel in een lus bleef gebruiken, maakte de intrekking zelf ongedaan. (2) Gelijktijdige verzoeken lazen dezelfde teller en
// schreven elk «+1»: de grens van 60 per minuut gold niet. Nu één opdracht: alleen de drie gebruiksvelden, alleen als de sleutel
// op dat moment niet ingetrokken is, en de teller wordt in de database zelf verhoogd (de rij is dan vergrendeld).
type GebruikGeteld={lastUsedAt:number;rateWindowStart:number;rateCount:number};
async function telGebruik(id:string,now:number):Promise<GebruikGeteld|'ingetrokken'|'limiet'|null>{
  const pool=getPool('systeem');
  const r=await pool.query(
    `UPDATE app.records SET updated_at = now(), data = data || jsonb_build_object(
        'lastUsedAt', $3::bigint,
        'rateWindowStart', CASE WHEN jsonb_typeof(data->'rateWindowStart') = 'number' AND (data->>'rateWindowStart')::numeric > 0 AND $3::numeric - (data->>'rateWindowStart')::numeric < $4::numeric
                                THEN (data->>'rateWindowStart')::numeric ELSE $3::numeric END,
        'rateCount', CASE WHEN jsonb_typeof(data->'rateWindowStart') = 'number' AND (data->>'rateWindowStart')::numeric > 0 AND $3::numeric - (data->>'rateWindowStart')::numeric < $4::numeric
                          THEN (CASE WHEN jsonb_typeof(data->'rateCount') = 'number' THEN (data->>'rateCount')::numeric ELSE 0 END) + 1 ELSE 1 END)
      WHERE tbl = $1 AND id = $2
        AND (jsonb_typeof(data->'revokedAt') = 'number' AND (data->>'revokedAt')::numeric > 0) IS NOT TRUE
        AND (jsonb_typeof(data->'rateWindowStart') = 'number' AND (data->>'rateWindowStart')::numeric > 0 AND $3::numeric - (data->>'rateWindowStart')::numeric < $4::numeric
                 AND (CASE WHEN jsonb_typeof(data->'rateCount') = 'number' THEN (data->>'rateCount')::numeric ELSE 0 END) >= $5::numeric) IS NOT TRUE
      RETURNING (data->>'lastUsedAt')::float8 AS gebruikt, (data->>'rateWindowStart')::float8 AS venster, (data->>'rateCount')::float8 AS aantal`,
    [API_MACHINE_TOKEN_TABLE,id,now,RATE_WINDOW_MS,RATE_MAX]);
  if(r.rows[0])return{lastUsedAt:Number(r.rows[0].gebruikt),rateWindowStart:Number(r.rows[0].venster),rateCount:Number(r.rows[0].aantal)};
  // Niets bijgewerkt: ingetrokken, de grens bereikt, of de sleutel bestaat niet meer.
  const nu=await pool.query(`SELECT (jsonb_typeof(data->'revokedAt') = 'number' AND (data->>'revokedAt')::numeric > 0) IS TRUE AS ingetrokken FROM app.records WHERE tbl = $1 AND id = $2`,[API_MACHINE_TOKEN_TABLE,id]);
  if(!nu.rows[0])return null;
  return nu.rows[0].ingetrokken===true?'ingetrokken':'limiet';
}

export async function resolveApiMachineToken(event:Record<string,unknown>,query:Record<string,string>={}){
  const token=bearerToken(event);
  if(!token)return{errorCode:'API_TOKEN_REQUIRED',status:401} as const;
  const record=await findByHash(sha(token));
  if(!record||!sameHash(record.tokenHash,sha(token)))return{errorCode:'API_TOKEN_INVALID',status:401} as const;
  const now=Date.now();
  if(record.revokedAt)return{errorCode:'API_TOKEN_REVOKED',status:401} as const;
  if(record.expiresAt<=now)return{errorCode:'API_TOKEN_EXPIRED',status:401} as const;
  // Fase 3: token werkt alleen zolang de maker goedgekeurd is, nog recht op het API-platform heeft en niet geblokkeerd of gewist is.
  {const[maker]=await db.get<{role?:string;email?:string;status?:string;retiredAt?:number;entitlements?:unknown}>('users',[record.ownerUserId]);if(!maker||maker.status!=='approved'||Number(maker.retiredAt||0)>0||!heeftApiRecht(maker))return{errorCode:'API_TOKEN_ENTITLEMENT_REVOKED',status:403} as const;}
  // SEC-002 (autorisatie-03): het gebruik wordt in ÉÉN atomische opdracht geteld, en alleen als de sleutel op DAT moment niet
  // ingetrokken is (zie telGebruik). Vroeger werd hier het hele record uit de momentopname van hierboven teruggeschreven.
  const geteld=await telGebruik(record.id,now);
  if(geteld==='ingetrokken')return{errorCode:'API_TOKEN_REVOKED',status:401} as const;
  if(geteld==='limiet')return{errorCode:'API_TOKEN_RATE_LIMITED',status:429} as const;
  if(!geteld)return{errorCode:'API_TOKEN_INVALID',status:401} as const;
  const workspaceId=String(query.workspaceId||'');
  if(workspaceId){
    const[workspace]=await db.get<{ownerUserId?:string}>('workspaces',[workspaceId]);
    if(!workspace||workspace.ownerUserId!==record.ownerUserId)return{errorCode:'API_TOKEN_FOREIGN_WORKSPACE',status:403} as const;
  }
  const next={...record,...geteld};
  zetGebruiker(record.ownerUserId,'api',undefined,`pat:${record.id}`);
  sessieGeverifieerd();// audit-fix 8: geldig API-token = gecontroleerde referentie voor het vangnet
  return{token:next} as const;
}

export function apiPlatformMePayload(token:PatRecord){return{actor:'machine-token',ownerId:token.ownerUserId,scopes:token.scopes,prefix:token.prefix,expiresAt:token.expiresAt,tokenId:token.id}}

export function createApiPlatformRoutes(deps:{requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;respond:(data:unknown,status?:number)=>any;fail:(message:string,status?:number)=>any;audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;body:(body:unknown)=>Record<string,unknown>}){
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{const auth=await deps.requireSession(event,body);if('errorCode'in auth||auth.service!=='api'||auth.user.status!=='approved')return null;if(!heeftApiRecht(auth.user as never))return GEEN_RECHT;return auth};
  return{
    'GET /api/v1/me':[async(ctx: any)=>{const resolved=await resolveApiMachineToken(ctx.event,ctx.query||{});if('errorCode'in resolved)return error(resolved.errorCode as string,resolved.status);if(!resolved.token.scopes.includes('identity.me.read'))return error('API_TOKEN_SCOPE_MISSING',403);return json(apiPlatformMePayload(resolved.token))}],
    'POST /api/owner/api-platform/tokens':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const items=await apiPlatformTokensForOwner(auth.user.id);return deps.respond({items:items.map(publicToken),liveCount:items.filter(item=>!item.revokedAt&&item.expiresAt>Date.now()).length})} ],
    'POST /api/owner/api-platform/tokens/create':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const body=deps.body(ctx.body);let scopes:string[];try{scopes=normalizeScopes(body.scopes)}catch(caught){return deps.fail(caught instanceof Error?caught.message:'API_TOKEN_SCOPE_INVALID',403)}const live=await apiPlatformLiveTokenCount(auth.user.id);if(live>=MAX_LIVE)return deps.fail('API_TOKEN_LIMIT_REACHED',400);const days=Number(body.expiresInDays);const ttl=Number.isFinite(days)&&days>0?Math.min(MAX_TTL_MS,Math.max(24*60*60*1000,Math.floor(days)*24*60*60*1000)):DEFAULT_TTL_MS;const prefix=randomBytes(4).toString('hex');const secret=randomBytes(32).toString('base64url');const plaintext=`${API_PAT_PREFIX}${prefix}_${secret}`;const now=Date.now();const record={ownerUserId:auth.user.id,prefix,tokenHash:sha(plaintext),scopes,label:String(body.label||'Ключ API').trim().slice(0,80)||'Ключ API',createdAt:now,expiresAt:now+ttl,lastUsedAt:0,revokedAt:0,rateWindowStart:0,rateCount:0};const[id]=await db.add(API_MACHINE_TOKEN_TABLE,[record]);if(!id)return deps.fail('API_TOKEN_CREATE_FAILED',500);await deps.audit(auth.user.id,'owner.api.token.created','success',{tokenId:id,prefix,scopes,expiresAt:record.expiresAt});return deps.respond({plaintext,shownOnce:true,item:publicToken({id,...record})})} ],
    'POST /api/owner/api-platform/tokens/:id/revoke':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const[raw]=await db.get<Omit<PatRecord,'id'>>(API_MACHINE_TOKEN_TABLE,[ctx.params.id]);if(!raw||raw.ownerUserId!==auth.user.id)return deps.fail('API_TOKEN_NOT_FOUND',404);if(raw.ownerUserId!==auth.user.id)return deps.fail('API_TOKEN_FOREIGN_WORKSPACE',403);const now=Date.now();if(!raw.revokedAt){await db.update(API_MACHINE_TOKEN_TABLE,[{id:ctx.params.id,record:{...raw,revokedAt:now}}]);await deps.audit(auth.user.id,'owner.api.token.revoked','success',{tokenId:ctx.params.id,prefix:raw.prefix})}return deps.respond({ok:true,item:publicToken({id:ctx.params.id,...raw,revokedAt:raw.revokedAt||now})})} ],
    'POST /api/owner/api-platform/tokens/verify':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const plaintext=String(deps.body(ctx.body).plaintext||'');if(!plaintext.startsWith(API_PAT_PREFIX))return deps.fail('API_TOKEN_INVALID',401);const record=await findByHash(sha(plaintext));if(!record||record.ownerUserId!==auth.user.id)return deps.fail('API_TOKEN_INVALID',401);if(record.revokedAt)return deps.fail('API_TOKEN_REVOKED',401);if(record.expiresAt<=Date.now())return deps.fail('API_TOKEN_EXPIRED',401);return deps.respond({ok:true,...apiPlatformMePayload(record)})}],
    ...createOwnerHandoffRoutes(deps)
  };
}

export async function apiPlatformOwnerContract(user:{id:string;email:string;role:string}){const[tokenCount,vaultCount,vaultReady,connectionsConfigured]=await Promise.all([apiPlatformLiveTokenCount(user.id),apiPlatformVaultCount(user.id),vaultEncryptionReady(),apiPlatformConnectionsConfiguredCount(user.id,user.email)]);return apiPlatformContractPayload(user,{tokenCount,vaultCount,vaultReady,connectionsConfigured});}
