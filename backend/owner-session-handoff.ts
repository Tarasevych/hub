import {createHash,randomBytes} from 'node:crypto';
import {db} from '../server/platform';
import {API_COOKIE_PATH, ECOSYSTEM_COOKIE} from './deployment-identity';

const HANDOFF_MS=120000;
const OWNER_SESSION_TABLE='owner_service_sessions_v1';
const OWNER_TAB_SESSION_TABLE='owner_tab_sessions_v1';
const OWNER_IDLE_MS=7*24*60*60*1000;
const OWNER_ABSOLUTE_MS=30*24*60*60*1000;
const SERVICE_ORIGINS={hub:'https://hub.tarasevych.com',identity:'https://id.tarasevych.com',ai:'https://ai.tarasevych.com',mail:'https://mail.tarasevych.com',cloud:'https://cloud.tarasevych.com',github:'https://github.tarasevych.com',huis:'https://huis.tarasevych.com',api:'https://api.tarasevych.com',admin:'https://admin.tarasevych.com'} as const;
type ServiceId=keyof typeof SERVICE_ORIGINS;
type SessionAuth={errorCode:string}|{user:{id:string;status:string};session?:{grantId?:string};tabSession?:{grantId?:string}|null};
type HandoffRecord={id:string;codeHash:string;userId:string;service:string;expiresAt:number;browserGrantId?:string};

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const headers=(event:Record<string,unknown>)=>{const raw=((event.headers||{})as Record<string,unknown>);const out:Record<string,string>={};for(const[key,value]of Object.entries(raw))out[key.toLowerCase()]=String(value||'');return out};
const hostOf=(event:Record<string,unknown>)=>String(headers(event)['x-forwarded-host']||headers(event).host||'').split(':')[0].toLowerCase();
const asService=(value:unknown):ServiceId|null=>{const candidate=String(value||'') as ServiceId;return candidate in SERVICE_ORIGINS?candidate:null};
const serviceOfHost=(event:Record<string,unknown>)=>asService((Object.entries(SERVICE_ORIGINS).find(([,origin])=>new URL(origin).hostname===hostOf(event))||[])[0]||'');
const cookie=(token:string,maxAge:number,sessionId:string)=>`${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${sessionId}.${token}`)}; Path=${API_COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`;

export function createOwnerHandoffRoutes(deps:{
  requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;
  respond:(data:unknown,status?:number)=>unknown;
  fail:(message:string,status?:number)=>unknown;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  return{
    'POST /api/owner/session/handoff/create':[async(ctx)=>{
      const auth=await deps.requireSession(ctx.event,ctx.body);
      if('errorCode'in auth)return deps.fail(auth.errorCode,auth.errorCode.includes('EXPIRED')?410:401);
      const target=asService(deps.body(ctx.body).target);
      if(!target)return deps.fail('Unsupported target service',400);
      if(auth.user.status!=='approved'&&target!=='identity')return deps.fail('Approved access required',403);
      const tab=String(deps.body(ctx.body).tab||'');
      const safeTab=/^[a-z][a-z0-9_-]{0,40}$/.test(tab)?tab:'';
      const code=randomBytes(32).toString('base64url');
      const grantId=auth.session?.grantId||auth.tabSession?.grantId||'';
      const[id]=await db.add('service_handoffs',[{codeHash:sha(code),userId:auth.user.id,service:target,expiresAt:Date.now()+HANDOFF_MS,createdAt:Date.now(),browserGrantId:grantId}]);
      if(!id)return deps.fail('Unable to create service handoff',500);
      const url=new URL(SERVICE_ORIGINS[target]);
      url.searchParams.set('handoff',code);
      if(safeTab)url.searchParams.set('tab',safeTab);
      await deps.audit(auth.user.id,'service_handoff_created','success',{service:target});
      return deps.respond({url:url.toString(),expiresInMs:HANDOFF_MS});
    }],
    'POST /api/owner/session/handoff/redeem':[async(ctx)=>{
      const service=serviceOfHost(ctx.event)||asService(deps.body(ctx.body).service);
      if(!service)return deps.fail('OWNER_SESSION_CONTEXT_REQUIRED',400);
      const bound=serviceOfHost(ctx.event);
      if(bound&&bound!==service)return deps.fail('OWNER_SESSION_ORIGIN_INVALID',403);
      const code=String(deps.body(ctx.body).code||'');
      if(!code)return deps.fail('OWNER_HANDOFF_INVALID',400);
      const rows=await db.list<Omit<HandoffRecord,'id'>>('service_handoffs',{filter:{codeHash:sha(code),service},limit:5});
      const handoff=(rows.items as HandoffRecord[])[0];
      if(!handoff||handoff.expiresAt<=Date.now())return deps.fail('OWNER_HANDOFF_INVALID',401);
      await db.delete('service_handoffs',[handoff.id]);
      const existing=await deps.requireSession(ctx.event,ctx.body);
      if(!('errorCode'in existing)&&existing.user.id===handoff.userId){
        await deps.audit(existing.user.id,'owner.session.handoff.reused','success',{service});
        return deps.respond({ok:true,reused:true,user:existing.user});
      }
      const[raw]=await db.get<{email:string;name?:string;role:string;status:string}>('users',[handoff.userId]);
      if(!raw)return deps.fail('OWNER_USER_NOT_FOUND',404);
      const now=Date.now();
      const token=randomBytes(32).toString('base64url');
      const sessionRecord={tokenHash:sha(token),userId:handoff.userId,service,sourceOrigin:SERVICE_ORIGINS[service],tabHash:sha('ecosystem'),grantId:handoff.browserGrantId||'',createdAt:now,authenticatedAt:now,lastSeenAt:now,idleExpiresAt:now+OWNER_IDLE_MS,absoluteExpiresAt:now+OWNER_ABSOLUTE_MS,rotation:0,version:1,revocationEpoch:0,authMethod:'google',scope:'ecosystem' as const};
      const[sessionId]=await db.add(OWNER_SESSION_TABLE,[sessionRecord]);
      if(!sessionId)return deps.fail('OWNER_SESSION_CREATE_FAILED',500);
      const tab=String(deps.body(ctx.body).tabContext||'');
      if(/^[a-f0-9]{48}$/.test(tab)){
        try{await db.add(OWNER_TAB_SESSION_TABLE,[{anchorSessionId:sessionId,tabHash:sha(tab),userId:handoff.userId,service,sourceOrigin:SERVICE_ORIGINS[service],grantId:handoff.browserGrantId||'',authMethod:'google',status:'active',createdAt:now,authenticatedAt:now,lastSeenAt:now,idleExpiresAt:now+OWNER_IDLE_MS,absoluteExpiresAt:now+OWNER_ABSOLUTE_MS,revokedAt:0,revocationEpoch:0}]);}catch{}
      }
      await deps.audit(handoff.userId,'owner.session.handoff.redeemed','success',{service,sessionId,sharedAcrossServices:true});
      return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':cookie(token,Math.floor(OWNER_ABSOLUTE_MS/1000),sessionId)},body:JSON.stringify({ok:true,user:{id:handoff.userId,...raw}})};
    }]
  };
}
