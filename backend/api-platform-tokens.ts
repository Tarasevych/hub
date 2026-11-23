import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {GEEN_RECHT,heeftApiRecht,weigerCode} from './api-recht';
import {db,error,json} from '../server/platform';
import {getPool} from '../server/platform/pg';
import {sessieGeverifieerd,zetGebruiker,zetRuimte} from '../server/platform/context';
import {apiPlatformContractPayload} from './api-platform-contract';
import {apiPlatformVaultCount,vaultEncryptionReady} from './api-platform-kluis';
import {apiPlatformConnectionsConfiguredCount} from './api-platform-verbindingen';
import {createOwnerHandoffRoutes} from './eigenaar-sessie-overdracht';
import {alsGebruiker} from './ai-toestemmingen';
import {hoortBij} from '../shared/ruimte-scheiding';
import {maskeerGeheimen} from '../shared/geheim-patronen';

export const API_MACHINE_TOKEN_TABLE='api_machine_tokens_v1';
export const API_PAT_PREFIX='tsv_';
export const API_PAT_ISSUABLE_SCOPES=['identity.me.read','mail.read','calendar.read','files.metadata.read'] as const;
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

function normalizeScopes(input:unknown){const requested=[...new Set((Array.isArray(input)?input:[input]).map(item=>String(item||'').trim()).filter(Boolean))];if(!requested.length)return ['identity.me.read'];if(requested.some(scope=>API_PAT_FORBIDDEN_SCOPES.includes(scope as typeof API_PAT_FORBIDDEN_SCOPES[number])||scope.endsWith('.write')||scope==='device.command'))throw new Error('API_TOKEN_SCOPE_FORBIDDEN');if(requested.some(scope=>!(API_PAT_ISSUABLE_SCOPES as readonly string[]).includes(scope)))throw new Error('API_TOKEN_SCOPE_NOT_ISSUABLE');return requested}

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
  zetRuimte('prive');
  sessieGeverifieerd();// audit-fix 8: geldig API-token = gecontroleerde referentie voor het vangnet
  return{token:next} as const;
}

export function apiPlatformMePayload(token:PatRecord){return{actor:'machine-token',ownerId:token.ownerUserId,scopes:token.scopes,prefix:token.prefix,expiresAt:token.expiresAt,tokenId:token.id}}

const begrensdeLimiet=(raw:unknown,standaard=25,max=50)=>{const n=Number(raw);return Number.isFinite(n)&&n>=1?Math.min(max,Math.floor(n)):standaard};
const schoonTekst=(raw:unknown,max=280)=>maskeerGeheimen(String(raw??'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)).tekst;
const veiligTijdstip=(raw:unknown)=>{const n=typeof raw==='number'?raw:Date.parse(String(raw??''));return Number.isFinite(n)&&n>0?Math.floor(n):0};
const lijstStrings=(raw:unknown,maxItems=20,maxLen=80)=>Array.isArray(raw)?raw.map(x=>schoonTekst(x,maxLen)).filter(Boolean).slice(0,maxItems):[];

async function leesMailBerichtenVoorToken(ownerUserId:string,query:Record<string,string>){
  const limit=begrensdeLimiet(query.limit);
  const zoek=String(query.q||'').trim().toLowerCase().slice(0,200);
  const lade={userId:ownerUserId,ruimte:'prive' as const};
  return alsGebruiker(ownerUserId,async(q)=>{
    await q('SET LOCAL transaction_read_only = on');
    await q("SELECT set_config('app.ruimte', 'prive', true)");
    const r=await q(
      `SELECT id, data FROM app.records
       WHERE tbl = 'mail_items_v1' AND data->>'ownerUserId' = $1
       ORDER BY updated_at DESC LIMIT 200`,
      [ownerUserId],
    );
    const items:Array<Record<string,unknown>>=[];
    for(const row of r.rows){
      const d=(row.data&&typeof row.data==='object'?row.data:{}) as Record<string,unknown>;
      if(!hoortBij(d,lade))continue;
      const subject=schoonTekst(d.subject,240);
      const senderName=schoonTekst(d.senderName,120);
      const senderEmail=schoonTekst(d.senderEmail,200);
      const snippet=schoonTekst(d.snippet??d.preview??d.body,280);
      if(zoek){
        const hooi=`${subject}\n${senderName}\n${senderEmail}\n${snippet}`.toLowerCase();
        if(!hooi.includes(zoek))continue;
      }
      const labelIds=lijstStrings(d.labelIds,20,60);
      items.push({
        id:String(row.id||d.id||'').slice(0,200),
        subject,
        senderName,
        senderEmail,
        receivedAt:veiligTijdstip(d.receivedAt)||veiligTijdstip(d.updatedAt),
        unread:typeof d.unread==='boolean'?d.unread:labelIds.includes('UNREAD'),
        labelIds,
        snippet,
      });
      if(items.length>=limit)break;
    }
    return items;
  });
}

async function leesAgendaGebeurtenissenVoorToken(ownerUserId:string,query:Record<string,string>){
  const limit=begrensdeLimiet(query.limit);
  const zoek=String(query.q||'').trim().toLowerCase().slice(0,200);
  const vanafMs=query.from?veiligTijdstip(query.from):0;
  const totMs=query.to?veiligTijdstip(query.to):0;
  const lade={userId:ownerUserId,ruimte:'prive' as const};
  return alsGebruiker(ownerUserId,async(q)=>{
    await q('SET LOCAL transaction_read_only = on');
    await q("SELECT set_config('app.ruimte', 'prive', true)");
    const googleRijen=await q(
      `SELECT id, data FROM app.records
       WHERE tbl = 'google_suite_calendar_events_v1' AND data->>'ownerUserId' = $1
       ORDER BY updated_at DESC LIMIT 200`,
      [ownerUserId],
    );
    let externeRijen:Array<Record<string,unknown>>=[];
    await q('SAVEPOINT api_v1_agenda_ext');
    try{
      const ext=await q(
        `SELECT uid, abonnement_id, titel, begin_waarde, eind_waarde, locatie, gewijzigd_op, gezien_op
         FROM app.agenda_externe_gebeurtenis
         WHERE user_id = $1 AND COALESCE(ruimte, 'prive') = 'prive'
         ORDER BY COALESCE(gewijzigd_op, gezien_op) DESC LIMIT 100`,
        [ownerUserId],
      );
      externeRijen=ext.rows;
      await q('RELEASE SAVEPOINT api_v1_agenda_ext');
    }catch{
      await q('ROLLBACK TO SAVEPOINT api_v1_agenda_ext').catch(()=>undefined);
    }
    const ruw:Array<{id:string;calendarId:string;summary:string;start:string;end:string;location:string;updatedAt:number;source:'google'|'extern'}>=[];
    for(const row of googleRijen.rows){
      const d=(row.data&&typeof row.data==='object'?row.data:{}) as Record<string,unknown>;
      if(!hoortBij(d,lade))continue;
      if(String(d.status||'').toLowerCase()==='cancelled')continue;
      ruw.push({
        id:String(row.id||d.id||'').slice(0,200),
        calendarId:schoonTekst(d.calendarId,160),
        summary:schoonTekst(d.summary,240),
        start:schoonTekst(d.start,80),
        end:schoonTekst(d.end,80),
        location:schoonTekst(d.location,200),
        updatedAt:veiligTijdstip(d.providerUpdatedAt)||veiligTijdstip(d.updatedAt),
        source:'google',
      });
    }
    for(const ext of externeRijen){
      ruw.push({
        id:`ext:${schoonTekst(ext.abonnement_id,80)}:${schoonTekst(ext.uid,160)}`.slice(0,240),
        calendarId:schoonTekst(ext.abonnement_id,120),
        summary:schoonTekst(ext.titel,240),
        start:schoonTekst(ext.begin_waarde,80),
        end:schoonTekst(ext.eind_waarde,80),
        location:schoonTekst(ext.locatie,200),
        updatedAt:veiligTijdstip(ext.gewijzigd_op)||veiligTijdstip(ext.gezien_op),
        source:'extern',
      });
    }
    const gefilterd=ruw.filter((ev)=>{
      if(zoek){
        const hooi=`${ev.summary}\n${ev.location}\n${ev.calendarId}`.toLowerCase();
        if(!hooi.includes(zoek))return false;
      }
      const startMs=ev.start?veiligTijdstip(ev.start):0;
      if(vanafMs>0&&startMs>0&&startMs<vanafMs)return false;
      if(totMs>0&&startMs>0&&startMs>totMs)return false;
      return true;
    });
    gefilterd.sort((a,b)=>(a.start||'').localeCompare(b.start||'')||b.updatedAt-a.updatedAt);
    return gefilterd.slice(0,limit);
  });
}

async function leesBestandMetadataVoorToken(ownerUserId:string,query:Record<string,string>){
  const limit=begrensdeLimiet(query.limit);
  const zoek=String(query.q||'').trim().toLowerCase().slice(0,200);
  const folderFilter=String(query.folderId||query.mapId||'').trim().slice(0,120);
  const lade={userId:ownerUserId,ruimte:'prive' as const};
  return alsGebruiker(ownerUserId,async(q)=>{
    await q('SET LOCAL transaction_read_only = on');
    await q("SELECT set_config('app.ruimte', 'prive', true)");
    const r=await q(
      `SELECT id, data FROM app.records
       WHERE tbl = 'cloud_items_v1' AND data->>'ownerUserId' = $1
       ORDER BY updated_at DESC LIMIT 250`,
      [ownerUserId],
    );
    const items:Array<Record<string,unknown>>=[];
    for(const row of r.rows){
      const d=(row.data&&typeof row.data==='object'?row.data:{}) as Record<string,unknown>;
      if(!hoortBij(d,lade))continue;
      if(String(d.verwijderdOp||'').trim())continue;
      const folderId=d.mapId?String(d.mapId).slice(0,120):null;
      if(folderFilter&&(folderId||'')!==folderFilter)continue;
      const name=schoonTekst(d.title||d.originalName,240);
      const tags=lijstStrings(d.tags,20,60);
      if(zoek){
        const hooi=`${name}\n${tags.join(' ')}`.toLowerCase();
        if(!hooi.includes(zoek))continue;
      }
      const sizeBytes=Math.max(0,Math.floor(Number(d.sizeBytes||0)||0));
      items.push({
        id:String(row.id||d.id||'').slice(0,200),
        name,
        kind:d.kind==='folder'||d.type==='folder'?'folder':d.kind==='note'?'note':d.kind==='link'?'link':'file',
        mimeType:schoonTekst(d.mimeType||'application/octet-stream',120),
        sizeBytes,
        sha256:/^[a-f0-9]{64}$/i.test(String(d.sha256||''))?String(d.sha256).toLowerCase():null,
        folderId,
        tags,
        favoriet:d.favoriet===true,
        updatedAt:veiligTijdstip(d.updatedAt)||veiligTijdstip(d.createdAt),
      });
      if(items.length>=limit)break;
    }
    return items;
  });
}

export function createApiPlatformRoutes(deps:{requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;respond:(data:unknown,status?:number)=>any;fail:(message:string,status?:number)=>any;audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;body:(body:unknown)=>Record<string,unknown>;leesScopesVlagAan?:(user:{id:string;email?:string;role?:string})=>Promise<boolean>}){
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{const auth=await deps.requireSession(event,body);if('errorCode'in auth||auth.service!=='api'||auth.user.status!=='approved')return null;if(!heeftApiRecht(auth.user as never))return GEEN_RECHT;return auth};
  const leesMag=async(user:{id:string;email?:string;role?:string})=>deps.leesScopesVlagAan?await deps.leesScopesVlagAan(user).catch(()=>false):true;
  return{
    'GET /api/v1/me':[async(ctx: any)=>{const resolved=await resolveApiMachineToken(ctx.event,ctx.query||{});if('errorCode'in resolved)return error(resolved.errorCode as string,resolved.status);if(!resolved.token.scopes.includes('identity.me.read'))return error('API_TOKEN_SCOPE_MISSING',403);return json(apiPlatformMePayload(resolved.token))}],
    'GET /api/v1/mail/messages':[async(ctx: any)=>{const resolved=await resolveApiMachineToken(ctx.event,ctx.query||{});if('errorCode'in resolved)return error(resolved.errorCode as string,resolved.status);if(!(await leesMag({id:resolved.token.ownerUserId})))return error('VLAG_UIT',404);if(!resolved.token.scopes.includes('mail.read'))return error('API_TOKEN_SCOPE_MISSING',403);const items=await leesMailBerichtenVoorToken(resolved.token.ownerUserId,ctx.query||{});return json({actor:'machine-token',scope:'mail.read',ownerId:resolved.token.ownerUserId,items,count:items.length})}],
    'GET /api/v1/calendar/events':[async(ctx: any)=>{const resolved=await resolveApiMachineToken(ctx.event,ctx.query||{});if('errorCode'in resolved)return error(resolved.errorCode as string,resolved.status);if(!(await leesMag({id:resolved.token.ownerUserId})))return error('VLAG_UIT',404);if(!resolved.token.scopes.includes('calendar.read'))return error('API_TOKEN_SCOPE_MISSING',403);const items=await leesAgendaGebeurtenissenVoorToken(resolved.token.ownerUserId,ctx.query||{});return json({actor:'machine-token',scope:'calendar.read',ownerId:resolved.token.ownerUserId,items,count:items.length})}],
    'GET /api/v1/files/metadata':[async(ctx: any)=>{const resolved=await resolveApiMachineToken(ctx.event,ctx.query||{});if('errorCode'in resolved)return error(resolved.errorCode as string,resolved.status);if(!(await leesMag({id:resolved.token.ownerUserId})))return error('VLAG_UIT',404);if(!resolved.token.scopes.includes('files.metadata.read'))return error('API_TOKEN_SCOPE_MISSING',403);const items=await leesBestandMetadataVoorToken(resolved.token.ownerUserId,ctx.query||{});return json({actor:'machine-token',scope:'files.metadata.read',ownerId:resolved.token.ownerUserId,items,count:items.length})}],
    'POST /api/owner/api-platform/tokens':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const items=await apiPlatformTokensForOwner(auth.user.id);return deps.respond({items:items.map(publicToken),liveCount:items.filter(item=>!item.revokedAt&&item.expiresAt>Date.now()).length})} ],
    'POST /api/owner/api-platform/tokens/create':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const body=deps.body(ctx.body);let scopes:string[];try{scopes=normalizeScopes(body.scopes)}catch(caught){const code=caught instanceof Error?caught.message:'API_TOKEN_SCOPE_INVALID';await deps.audit(auth.user.id,'owner.api.token.created','denied',{reason:code}).catch(()=>undefined);return deps.fail(code,403)}if(scopes.some(s=>s!=='identity.me.read')&&!(await leesMag(auth.user))){await deps.audit(auth.user.id,'owner.api.token.created','denied',{reason:'VLAG_UIT'}).catch(()=>undefined);return deps.fail('VLAG_UIT',403)}const live=await apiPlatformLiveTokenCount(auth.user.id);if(live>=MAX_LIVE)return deps.fail('API_TOKEN_LIMIT_REACHED',400);const days=Number(body.expiresInDays);const ttl=Number.isFinite(days)&&days>0?Math.min(MAX_TTL_MS,Math.max(24*60*60*1000,Math.floor(days)*24*60*60*1000)):DEFAULT_TTL_MS;const prefix=randomBytes(4).toString('hex');const secret=randomBytes(32).toString('base64url');const plaintext=`${API_PAT_PREFIX}${prefix}_${secret}`;const now=Date.now();const record={ownerUserId:auth.user.id,prefix,tokenHash:sha(plaintext),scopes,label:String(body.label||'Ключ API').trim().slice(0,80)||'Ключ API',createdAt:now,expiresAt:now+ttl,lastUsedAt:0,revokedAt:0,rateWindowStart:0,rateCount:0};const[id]=await db.add(API_MACHINE_TOKEN_TABLE,[record]);if(!id)return deps.fail('API_TOKEN_CREATE_FAILED',500);await deps.audit(auth.user.id,'owner.api.token.created','success',{tokenId:id,prefix,scopes,expiresAt:record.expiresAt});return deps.respond({plaintext,shownOnce:true,item:publicToken({id,...record})})} ],
    'POST /api/owner/api-platform/tokens/:id/revoke':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const[raw]=await db.get<Omit<PatRecord,'id'>>(API_MACHINE_TOKEN_TABLE,[ctx.params.id]);if(!raw||raw.ownerUserId!==auth.user.id)return deps.fail('API_TOKEN_NOT_FOUND',404);if(raw.ownerUserId!==auth.user.id)return deps.fail('API_TOKEN_FOREIGN_WORKSPACE',403);const now=Date.now();if(!raw.revokedAt){await db.update(API_MACHINE_TOKEN_TABLE,[{id:ctx.params.id,record:{...raw,revokedAt:now}}]);await deps.audit(auth.user.id,'owner.api.token.revoked','success',{tokenId:ctx.params.id,prefix:raw.prefix})}return deps.respond({ok:true,item:publicToken({id:ctx.params.id,...raw,revokedAt:raw.revokedAt||now})})} ],
    'POST /api/owner/api-platform/tokens/verify':[async(ctx: any)=>{const auth=await ownerGate(ctx.event,ctx.body);if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);const plaintext=String(deps.body(ctx.body).plaintext||'');if(!plaintext.startsWith(API_PAT_PREFIX))return deps.fail('API_TOKEN_INVALID',401);const record=await findByHash(sha(plaintext));if(!record||record.ownerUserId!==auth.user.id)return deps.fail('API_TOKEN_INVALID',401);if(record.revokedAt)return deps.fail('API_TOKEN_REVOKED',401);if(record.expiresAt<=Date.now())return deps.fail('API_TOKEN_EXPIRED',401);return deps.respond({ok:true,...apiPlatformMePayload(record)})}],
    ...createOwnerHandoffRoutes(deps)
  };
}

const LEES_VLAG_SCOPES=new Set(['mail.read','calendar.read','files.metadata.read']);
export async function apiPlatformOwnerContract(user:{id:string;email:string;role:string},opties?:{leesScopesAan?:boolean}){const[tokenCount,vaultCount,vaultReady,connectionsConfigured]=await Promise.all([apiPlatformLiveTokenCount(user.id),apiPlatformVaultCount(user.id),vaultEncryptionReady(),apiPlatformConnectionsConfiguredCount(user.id,user.email)]);const basis=apiPlatformContractPayload(user,{tokenCount,vaultCount,vaultReady,connectionsConfigured});if(opties?.leesScopesAan===false){return{...basis,capabilities:basis.capabilities.map(c=>LEES_VLAG_SCOPES.has(c.id)?{...c,status:'planned' as const}:c)};}return basis;}
