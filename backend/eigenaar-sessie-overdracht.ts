import {createHash,randomBytes} from 'node:crypto';
import {db} from '../server/platform';
import {COOKIE_SCOPE, ECOSYSTEM_COOKIE} from './deployment-identiteit';
import {handoffBindingVanBrowser, handoffBindingVoorAanmaken, metBindingCookie} from './overdracht-binding';

const HANDOFF_MS=120000;
const OWNER_SESSION_TABLE='owner_service_sessions_v1';
const OWNER_TAB_SESSION_TABLE='owner_tab_sessions_v1';
const OWNER_IDLE_MS=7*24*60*60*1000;
const OWNER_ABSOLUTE_MS=30*24*60*60*1000;
const SERVICE_ORIGINS={hub:'https://hub.tarasevych.com',identity:'https://id.tarasevych.com',ai:'https://ai.tarasevych.com',mail:'https://mail.tarasevych.com',cloud:'https://cloud.tarasevych.com',github:'https://github.tarasevych.com',huis:'https://huis.tarasevych.com',api:'https://api.tarasevych.com',admin:'https://admin.tarasevych.com',mcp:'https://mcp.tarasevych.com'} as const;
type ServiceId=keyof typeof SERVICE_ORIGINS;
type SessionAuth={errorCode:string}|{user:{id:string;status:string};session?:{grantId?:string};tabSession?:{grantId?:string}|null};
type HandoffRecord={id:string;codeHash:string;userId:string;service:string;expiresAt:number;createdAt?:number;browserGrantId?:string;bindingHash?:string};
const OWNER_REVOCATION_TABLE='owner_revocation_state_v1';
/** Audit-fix 10: huidige intrekkingsstand (epoch + tijdstip) van een account; nieuwe sessies krijgen die epoch. */
async function intrekkingsstand(userId:string):Promise<{epoch:number;updatedAt:number}>{
  const{items}=await db.list<{epoch?:number;updatedAt?:number}>(OWNER_REVOCATION_TABLE,{filter:{userId}});
  let beste={epoch:0,updatedAt:0};
  for(const i of items)if(Number(i.epoch||0)>beste.epoch)beste={epoch:Number(i.epoch||0),updatedAt:Number(i.updatedAt||0)};
  return beste;
}

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const headers=(event:Record<string,unknown>)=>{const raw=((event.headers||{})as Record<string,unknown>);const out:Record<string,string>={};for(const[key,value]of Object.entries(raw))out[key.toLowerCase()]=String(value||'');return out};
// Alleen de Host-header (server/start.ts verwijdert x-forwarded-host van de client).
const hostOf=(event:Record<string,unknown>)=>String(headers(event).host||'').split(':')[0].toLowerCase();
const asService=(value:unknown):ServiceId|null=>{const candidate=String(value||'') as ServiceId;return candidate in SERVICE_ORIGINS?candidate:null};
const serviceOfHost=(event:Record<string,unknown>)=>asService((Object.entries(SERVICE_ORIGINS).find(([,origin])=>new URL(origin).hostname===hostOf(event))||[])[0]||'');
const cookie=(token:string,maxAge:number,sessionId:string)=>`${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${sessionId}.${token}`)}; ${COOKIE_SCOPE}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export function createOwnerHandoffRoutes(deps:{
  requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;
  respond:(data:unknown,status?:number)=>any;
  fail:(message:string,status?:number)=>any;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  return{
    'POST /api/owner/session/handoff/create':[async(ctx: any)=>{
      const auth=await deps.requireSession(ctx.event,ctx.body);
      if('errorCode'in auth)return deps.fail(auth.errorCode,auth.errorCode.includes('EXPIRED')?410:401);
      const target=asService(deps.body(ctx.body).target);
      if(!target)return deps.fail('Unsupported target service',400);
      if(auth.user.status!=='approved'&&target!=='identity')return deps.fail('Approved access required',403);
      const tab=String(deps.body(ctx.body).tab||'');
      const safeTab=/^[a-z][a-z0-9_-]{0,40}$/.test(tab)?tab:'';
      const code=randomBytes(32).toString('base64url');
      const grantId=auth.session?.grantId||auth.tabSession?.grantId||'';
      // Login-CSRF: de code werkt alleen in de browser die hem aanmaakte (zie overdracht-binding.ts).
      const binding=handoffBindingVoorAanmaken(ctx.event);
      const[id]=await db.add('service_handoffs',[{codeHash:sha(code),userId:auth.user.id,service:target,expiresAt:Date.now()+HANDOFF_MS,createdAt:Date.now(),browserGrantId:grantId,bindingHash:binding.bindingHash}]);
      if(!id)return deps.fail('Unable to create service handoff',500);
      const url=new URL(SERVICE_ORIGINS[target]);
      url.searchParams.set('handoff',code);
      if(safeTab)url.searchParams.set('tab',safeTab);
      await deps.audit(auth.user.id,'service_handoff_created','success',{service:target});
      return metBindingCookie(deps.respond({url:url.toString(),expiresInMs:HANDOFF_MS}),binding.setCookie);
    }],
    'POST /api/owner/session/handoff/redeem':[async(ctx: any)=>{
      // De service wordt uitsluitend door de host bepaald; een afwijkende body.service wordt geweigerd.
      const service=serviceOfHost(ctx.event);
      if(!service)return deps.fail('OWNER_SESSION_CONTEXT_REQUIRED',400);
      const claimed=asService(deps.body(ctx.body).service);
      if(claimed&&claimed!==service)return deps.fail('OWNER_SESSION_ORIGIN_INVALID',403);
      const code=String(deps.body(ctx.body).code||'');
      if(!code)return deps.fail('OWNER_HANDOFF_INVALID',400);
      // Browserbinding (login-CSRF): zonder de bindingscookie van de aanmakende browser geen inwisseling.
      // De hash zit in het filter, zodat een vreemde browser de code ook niet verbruikt.
      const bindingHash=handoffBindingVanBrowser(ctx.event);
      if(!bindingHash){await deps.audit('anonymous','owner.session.handoff.unbound','denied',{service});return deps.fail('OWNER_HANDOFF_BINDING_MISSING',401);}
      // Atomisch eenmalig: DELETE … RETURNING in één statement; een tweede (gelijktijdige) inwisseling vindt niets.
      const handoff=await db.takeOne<Omit<HandoffRecord,'id'>>('service_handoffs',{codeHash:sha(code),service,bindingHash}) as HandoffRecord|null;
      if(!handoff||handoff.expiresAt<=Date.now())return deps.fail('OWNER_HANDOFF_INVALID',401);
      const existing=await deps.requireSession(ctx.event,ctx.body);
      if(!('errorCode'in existing)&&existing.user.id===handoff.userId){
        await deps.audit(existing.user.id,'owner.session.handoff.reused','success',{service});
        return deps.respond({ok:true,reused:true,user:existing.user});
      }
      // Geen stille accountwissel: een browser met een geldige sessie van een ánder account wisselt geen
      // handoff-code in (beperkt login-CSRF/sessiewissel via een ondergeschoven ?handoff=-link).
      if(!('errorCode'in existing))return deps.fail('OWNER_HANDOFF_ACCOUNT_MISMATCH',409);
      const[raw]=await db.get<{email:string;name?:string;role:string;status:string}>('users',[handoff.userId]);
      if(!raw)return deps.fail('OWNER_USER_NOT_FOUND',404);
      if(raw.status==='blocked'||raw.status==='deleted'||Number((raw as {retiredAt?:number}).retiredAt||0)>0)return deps.fail('OWNER_HANDOFF_INVALID',401);
      // Audit-fix 10: echte revocationEpoch (vroeger 0) en geen inwisseling van codes van vóór "overal afmelden".
      const stand=await intrekkingsstand(handoff.userId);
      if(stand.updatedAt&&Number(handoff.createdAt||0)<=stand.updatedAt)return deps.fail('OWNER_HANDOFF_INVALID',401);
      const now=Date.now();
      const token=randomBytes(32).toString('base64url');
      const sessionRecord={tokenHash:sha(token),userId:handoff.userId,service,sourceOrigin:SERVICE_ORIGINS[service],tabHash:sha('ecosystem'),grantId:handoff.browserGrantId||'',createdAt:now,authenticatedAt:now,lastSeenAt:now,idleExpiresAt:now+OWNER_IDLE_MS,absoluteExpiresAt:now+OWNER_ABSOLUTE_MS,rotation:0,version:1,revocationEpoch:stand.epoch,authMethod:'google',scope:'ecosystem' as const};
      const[sessionId]=await db.add(OWNER_SESSION_TABLE,[sessionRecord]);
      if(!sessionId)return deps.fail('OWNER_SESSION_CREATE_FAILED',500);
      const tab=String(deps.body(ctx.body).tabContext||'');
      if(/^[a-f0-9]{48}$/.test(tab)){
        try{await db.add(OWNER_TAB_SESSION_TABLE,[{anchorSessionId:sessionId,tabHash:sha(tab),userId:handoff.userId,service,sourceOrigin:SERVICE_ORIGINS[service],grantId:handoff.browserGrantId||'',authMethod:'google',status:'active',createdAt:now,authenticatedAt:now,lastSeenAt:now,idleExpiresAt:now+OWNER_IDLE_MS,absoluteExpiresAt:now+OWNER_ABSOLUTE_MS,revokedAt:0,revocationEpoch:stand.epoch}]);}catch{}
      }
      await deps.audit(handoff.userId,'owner.session.handoff.redeemed','success',{service,sessionId,sharedAcrossServices:true});
      return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':cookie(token,Math.floor(OWNER_ABSOLUTE_MS/1000),sessionId)},body:JSON.stringify({ok:true,user:{id:handoff.userId,...raw}})};
    }]
  };
}
