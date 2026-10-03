import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {db,secrets} from '../server/platform';
import {TECH_ORIGIN} from './deployment-identity';

// Zelf gehost: géén hardcoded standaard-client-ID meer. Client-ID en -secret komen alleen uit env
// (GOOGLE_OAUTH_CLIENT_ID/GOOGLE_SUITE_CLIENT_ID en GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_SUITE_CLIENT_SECRET).
// Ontbreken ze, dan is Google-login/koppelen uitgeschakeld (connectEnabled=false), zonder crash.
export const GOOGLE_REDIRECT_URI='https://id.tarasevych.com/';
export const GOOGLE_CLIENT_REF='google_suite_web_oauth_client';
export const GOOGLE_SECRET_ALIASES=['GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_SUITE_CLIENT_SECRET'] as const;
export const GOOGLE_CLIENT_ID_ALIASES=['GOOGLE_SUITE_CLIENT_ID','GOOGLE_OAUTH_CLIENT_ID'] as const;
export const GRANT_KEY_ALIASES=['GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1','OWNER_VAULT_ENCRYPTION_KEY_V1'] as const;
export const CONTOUR_TABLE='credential_contours_v1';
const REVEAL_CONFIRM='REVEAL_SECRET';
const CONTOUR_REVEAL_DISABLED=true;
const KNOWN_PLATFORM_KEYS=[
  'GOOGLE_SUITE_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_SUITE_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_SUITE_REDIRECT_URI',
  'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1',
  'OWNER_VAULT_ENCRYPTION_KEY_V1',
  'MAIL_TOKEN_ENCRYPTION_KEY_V1'
] as const;

export type ContourProvider='google'|'microsoft'|'apple'|'facebook'|'sms';
export type GoogleContour={
  clientId:string;
  clientSecret:string;
  redirectUri:string;
  grantKey:string;
  credentialsConfigured:boolean;
  encryptionConfigured:boolean;
  redirectConfigured:boolean;
  connectEnabled:boolean;
  source:'vault'|'platform'|'mixed'|'missing';
  missing:string[];
  hasVaultOverride:boolean;
  hasPlatformSecret:boolean;
  lockProtected:boolean;
  publicClientId:string;
  updatedAt:number;
};
export type AdminKeyCard={
  id:string;
  name:string;
  group:'google'|'platform'|'vault';
  aliases:string[];
  configured:boolean;
  working:boolean;
  source:string;
  masked:string;
  revealable:boolean;
  editable:boolean;
  deletable:boolean;
  locked:boolean;
  noteUk:string;
  noteNl:string;
};
type ContourRecord={
  id:string;
  ownerScope:string;
  provider:ContourProvider;
  clientId:string;
  redirectUri:string;
  algorithm:'AES-256-GCM';
  keyVersion:number;
  ciphertext:string;
  iv:string;
  authTag:string;
  status:'active'|'disabled';
  createdAt:number;
  updatedAt:number;
};
type SessionAuth={errorCode:string}|{user:{id:string;email:string;role:string;status:string};service:string};

const aad=(provider:string,clientId:string)=>`credential-contour-v1|${provider}|${clientId}`;
const keyFrom=(secret:string)=>{
  const n=secret.trim();
  if(/^[a-f0-9]{64}$/i.test(n))return Buffer.from(n,'hex');
  try{const d=Buffer.from(n,'base64');if(d.length===32)return d;}catch{/* ignore */}
  if(n.length>=16)return createHash('sha256').update(n).digest();
  throw new Error('CONTOUR_KEY_INVALID');
};
const encryptSecret=(plaintext:string,secret:string,provider:string,clientId:string)=>{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFrom(secret),iv);
  cipher.setAAD(Buffer.from(aad(provider,clientId),'utf8'));
  const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
  return{algorithm:'AES-256-GCM' as const,keyVersion:1,ciphertext:ciphertext.toString('base64url'),iv:iv.toString('base64url'),authTag:cipher.getAuthTag().toString('base64url')};
};
const decryptSecret=(record:Pick<ContourRecord,'ciphertext'|'iv'|'authTag'|'algorithm'>,secret:string,provider:string,clientId:string)=>{
  const decipher=createDecipheriv('aes-256-gcm',keyFrom(secret),Buffer.from(record.iv,'base64url'));
  decipher.setAAD(Buffer.from(aad(provider,clientId),'utf8'));
  decipher.setAuthTag(Buffer.from(record.authTag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64url')),decipher.final()]).toString('utf8');
};
const mask=(value:string)=>{
  const n=String(value||'');
  if(!n)return '';
  if(n.length<=6)return '\u2022'.repeat(n.length);
  return '\u2022'.repeat(Math.max(8,n.length-4))+n.slice(-4);
};
const REVEAL_ALLOWED_ORIGINS=new Set(['https://admin.tarasevych.com',TECH_ORIGIN,'http://localhost:5173','http://localhost:3000']);
const revealHostAllowed=(event:Record<string,unknown>)=>{
  const headers=(event.headers||{}) as Record<string,string>;
  const origin=String(headers.origin||headers.Origin||'').trim();
  if(origin)return REVEAL_ALLOWED_ORIGINS.has(origin);
  const referer=String(headers.referer||headers.Referer||'').trim();
  if(!referer)return false;
  try{return REVEAL_ALLOWED_ORIGINS.has(new URL(referer).origin);}catch{return false;}
};

async function platformNames(){try{return await secrets.listSecretNames();}catch{return [] as string[];}}
async function readNamed(names:string[],aliases:readonly string[]){
  for(const name of aliases){
    if(!names.includes(name))continue;
    try{const value=await secrets.readSecret(name);if(value&&value.trim())return{name,value:value.trim()};}catch{continue;}
  }
  return null;
}
async function wrapKey(names:string[],clientSecret=''){
  const dedicated=await readNamed(names,GRANT_KEY_ALIASES);
  if(dedicated)return dedicated.value;
  // SECURITY: no fallback that derives the grant-wrapping key from the OAuth client secret.
  // A dedicated GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 must be configured.
  void clientSecret;
  return '';
}
async function latestContour(provider:ContourProvider){
  try{
    const rows=await db.list<Omit<ContourRecord,'id'>>(CONTOUR_TABLE,{filter:{provider,status:'active'},limit:20});
    return(rows.items as ContourRecord[]).sort((a,b)=>b.updatedAt-a.updatedAt)[0]||null;
  }catch{return null;}
}

export async function resolveGoogleContour():Promise<GoogleContour>{
  const names=await platformNames();
  const platformSecret=await readNamed(names,GOOGLE_SECRET_ALIASES);
  const platformClient=await readNamed(names,GOOGLE_CLIENT_ID_ALIASES);
  const wrap=await wrapKey(names,platformSecret?.value||'');
  // Zelf gehost: een in de database opgeslagen "contour" (client-ID/secret) wordt genegeerd;
  // alleen env telt. latestContour() blijft bestaan voor diagnose/opruimen.
  void wrap;
  const vaultSecret='';
  const clientSecret=(platformSecret?.value||'').trim();
  const clientId=(platformClient?.value||'').trim();
  const redirectUri=GOOGLE_REDIRECT_URI;
  const grantKey=await wrapKey(names,clientSecret);
  const credentialsConfigured=Boolean(clientSecret&&clientId);
  const encryptionConfigured=Boolean(grantKey);
  const redirectConfigured=redirectUri===GOOGLE_REDIRECT_URI;
  const missing:string[]=[];
  if(!clientId)missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if(!clientSecret)missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if(!encryptionConfigured)missing.push('GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1');
  const hasVaultOverride=Boolean(vaultSecret);
  const hasPlatformSecret=Boolean(platformSecret);
  const source=!credentialsConfigured?'missing':hasVaultOverride&&hasPlatformSecret?'mixed':hasVaultOverride?'vault':'platform';
  return{clientId,clientSecret,redirectUri,grantKey,credentialsConfigured,encryptionConfigured,redirectConfigured,connectEnabled:credentialsConfigured&&encryptionConfigured&&redirectConfigured,source,missing,hasVaultOverride,hasPlatformSecret,lockProtected:hasPlatformSecret||hasVaultOverride,publicClientId:clientId,updatedAt:0};
}

// Zelf gehost: de vroegere globale override van secrets.readSecret (secret uit de database)
// is verwijderd. Secrets komen uitsluitend uit env via server/platform/secrets.ts.

export function publicGoogleContour(contour:GoogleContour){
  return{
    clientId:contour.publicClientId,
    redirectUri:contour.redirectUri,
    clientRef:GOOGLE_CLIENT_REF,
    credentialsConfigured:contour.credentialsConfigured,
    encryptionConfigured:contour.encryptionConfigured,
    redirectConfigured:contour.redirectConfigured,
    connectEnabled:contour.connectEnabled,
    source:contour.source,
    missing:contour.missing,
    hasVaultOverride:contour.hasVaultOverride,
    hasPlatformSecret:contour.hasPlatformSecret,
    lockProtected:contour.lockProtected,
    updatedAt:contour.updatedAt,
    secretName:'GOOGLE_OAUTH_CLIENT_SECRET',
    aliases:[...GOOGLE_SECRET_ALIASES],
    identityAndSuiteShareClient:true,
    plaintextReturned:false
  };
}

export async function googleContourKeyCards(){
  const contour=await resolveGoogleContour();
  const names=await platformNames();
  const grantNamed=names.includes('GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1')||names.includes('OWNER_VAULT_ENCRYPTION_KEY_V1');
  const cards:AdminKeyCard[]=[
    {
      id:'google-client-id',
      name:'GOOGLE_SUITE_CLIENT_ID',
      group:'google',
      aliases:[...GOOGLE_CLIENT_ID_ALIASES],
      configured:Boolean(contour.clientId),
      working:Boolean(contour.clientId),
      source:contour.publicClientId?'platform':'missing',
      masked:mask(contour.publicClientId),
      revealable:true,
      editable:true,
      deletable:false,
      locked:false,
      noteUk:'Web Client ID для identity і Google Suite. Один контур.',
      noteNl:'Web Client ID voor identity en Google Suite. Eén contour.'
    },
    {
      id:'google-client-secret',
      name:'GOOGLE_SUITE_CLIENT_SECRET',
      group:'google',
      aliases:[...GOOGLE_SECRET_ALIASES],
      configured:contour.credentialsConfigured,
      working:contour.connectEnabled,
      source:contour.source,
      masked:contour.credentialsConfigured?'\u2022'.repeat(12):'',
      revealable:contour.credentialsConfigured,
      editable:true,
      deletable:contour.hasVaultOverride,
      locked:contour.lockProtected&&!contour.hasVaultOverride,
      noteUk:'Client secret зберігається зашифровано (AES-256-GCM). GOOGLE_OAUTH_CLIENT_SECRET є псевдонімом цього ключа.',
      noteNl:'Client secret wordt versleuteld bewaard (AES-256-GCM). GOOGLE_OAUTH_CLIENT_SECRET is een alias van deze sleutel.'
    },
    {
      id:'google-redirect',
      name:'GOOGLE_SUITE_REDIRECT_URI',
      group:'google',
      aliases:[],
      configured:contour.redirectConfigured,
      working:contour.redirectConfigured,
      source:'locked',
      masked:GOOGLE_REDIRECT_URI,
      revealable:true,
      editable:false,
      deletable:false,
      locked:true,
      noteUk:'Зафіксовано на https://id.tarasevych.com/ — зміна зламає Google-вхід.',
      noteNl:'Vastgezet op https://id.tarasevych.com/ — wijzigen breekt Google-aanmelding.'
    },
    {
      id:'google-grant-key',
      name:'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1',
      group:'google',
      aliases:[...GRANT_KEY_ALIASES],
      configured:contour.encryptionConfigured,
      working:contour.encryptionConfigured,
      source:grantNamed?'platform':'derived',
      masked:contour.encryptionConfigured?'\u2022'.repeat(12):'',
      revealable:contour.encryptionConfigured,
      editable:false,
      deletable:false,
      locked:true,
      noteUk:'Ключ обгортки vault і contour. Не видаляється з адмінки.',
      noteNl:'Wrap-sleutel voor kluis en contour. Wordt niet verwijderd vanuit beheer.'
    }
  ];
  const covered=new Set(cards.flatMap(item=>[item.name,...item.aliases]));
  for(const name of names){
    if(covered.has(name))continue;
    cards.push({
      id:`platform-${name.toLowerCase()}`,
      name,
      group:'platform',
      aliases:[],
      configured:true,
      working:true,
      source:'platform',
      masked:'\u2022'.repeat(12),
      revealable:false,
      editable:false,
      deletable:false,
      locked:true,
      noteUk:'Платформний секрет. Значення не повертається в UI.',
      noteNl:'Platformgeheim. De waarde wordt niet in de UI getoond.'
    });
  }
  for(const name of KNOWN_PLATFORM_KEYS){
    if(covered.has(name)||names.includes(name)||cards.some(item=>item.name===name))continue;
    if(name==='GOOGLE_OAUTH_CLIENT_SECRET'||name==='GOOGLE_OAUTH_CLIENT_ID')continue;
    cards.push({
      id:`missing-${name.toLowerCase()}`,
      name,
      group:'platform',
      aliases:[],
      configured:false,
      working:name==='OWNER_VAULT_ENCRYPTION_KEY_V1'||name==='MAIL_TOKEN_ENCRYPTION_KEY_V1'?contour.encryptionConfigured:false,
      source:'missing',
      masked:'',
      revealable:false,
      editable:false,
      deletable:false,
      locked:true,
      noteUk:name==='OWNER_VAULT_ENCRYPTION_KEY_V1'||name==='MAIL_TOKEN_ENCRYPTION_KEY_V1'?'Не обов’язковий: використовується GRANT-ключ.':'Секрет не прив’язаний у платформі.',
      noteNl:name==='OWNER_VAULT_ENCRYPTION_KEY_V1'||name==='MAIL_TOKEN_ENCRYPTION_KEY_V1'?'Niet verplicht: de GRANT-sleutel wordt gebruikt.':'Geheim is niet gekoppeld op het platform.'
    });
  }
  return cards;
}

export async function revealGoogleContourKey(name:string){
  const requested=String(name||'').trim();
  const contour=await resolveGoogleContour();
  const names=await platformNames();
  if(requested==='GOOGLE_SUITE_CLIENT_ID'||requested==='GOOGLE_OAUTH_CLIENT_ID'||requested==='google-client-id'){
    return{name:'GOOGLE_SUITE_CLIENT_ID',value:contour.publicClientId};
  }
  if((GOOGLE_SECRET_ALIASES as readonly string[]).includes(requested)||requested==='google-client-secret'){
    if(!contour.clientSecret)throw new Error('GOOGLE_CONTOUR_SECRET_MISSING');
    return{name:'GOOGLE_SUITE_CLIENT_SECRET',value:contour.clientSecret};
  }
  if(requested==='GOOGLE_SUITE_REDIRECT_URI'||requested==='google-redirect'){
    return{name:'GOOGLE_SUITE_REDIRECT_URI',value:GOOGLE_REDIRECT_URI};
  }
  if((GRANT_KEY_ALIASES as readonly string[]).includes(requested)||requested==='google-grant-key'){
    const dedicated=await readNamed(names,GRANT_KEY_ALIASES);
    if(dedicated?.value)return{name:requested==='OWNER_VAULT_ENCRYPTION_KEY_V1'?requested:'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1',value:dedicated.value};
    if(contour.grantKey)return{name:'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1',value:contour.grantKey};
    throw new Error('GOOGLE_CONTOUR_GRANT_KEY_MISSING');
  }
  throw new Error('GOOGLE_CONTOUR_KEY_UNKNOWN');
}

export const googleContourPolicySelfTest=()=>[
  {id:'google-one-contour-secret-name',passed:GOOGLE_SECRET_ALIASES[0]==='GOOGLE_OAUTH_CLIENT_SECRET'},
  {id:'google-suite-secret-is-alias',passed:GOOGLE_SECRET_ALIASES.includes('GOOGLE_SUITE_CLIENT_SECRET')},
  {id:'google-redirect-is-identity-root',passed:GOOGLE_REDIRECT_URI==='https://id.tarasevych.com/'},
  {id:'google-client-id-env-only',passed:!/\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com/.test(String(resolveGoogleContour))},
  {id:'google-identity-and-suite-share-client-ref',passed:GOOGLE_CLIENT_REF==='google_suite_web_oauth_client'}
];

export async function saveGoogleContour(input:{clientId?:string;clientSecret?:string;redirectUri?:string}){
  // Zelf gehost: Google-client wordt alleen via env geconfigureerd, niet via de UI/database.
  void input;
  throw new Error('GOOGLE_CONTOUR_ENV_ONLY');
}
async function legacySaveGoogleContour(input:{clientId?:string;clientSecret?:string;redirectUri?:string}){
  const current=await resolveGoogleContour();
  const clientId=String(input.clientId||current.clientId||'').trim();
  const redirectUri=GOOGLE_REDIRECT_URI;
  const nextSecret=String(input.clientSecret||'').trim()||current.clientSecret;
  if(!nextSecret)throw new Error('GOOGLE_CONTOUR_SECRET_REQUIRED');
  if(clientId.length<12)throw new Error('GOOGLE_CONTOUR_CLIENT_ID_INVALID');
  const names=await platformNames();
  const wrap=await wrapKey(names,nextSecret);
  if(!wrap)throw new Error('GOOGLE_CONTOUR_WRAP_KEY_UNAVAILABLE');
  const envelope=encryptSecret(nextSecret,wrap,'google',clientId);
  const existing=await latestContour('google');
  const now=Date.now();
  const record={ownerScope:'global',provider:'google' as const,clientId,redirectUri,status:'active' as const,...envelope,createdAt:existing?.createdAt||now,updatedAt:now};
  if(existing?.id){const[ok]=await db.update(CONTOUR_TABLE,[{id:existing.id,record}]);if(!ok)throw new Error('GOOGLE_CONTOUR_WRITE_FAILED');}
  else{const[id]=await db.add(CONTOUR_TABLE,[record]);if(!id)throw new Error('GOOGLE_CONTOUR_WRITE_FAILED');}
  return resolveGoogleContour();
}

export async function deleteGoogleContour(force=false){
  const current=await resolveGoogleContour();
  if(!current.hasVaultOverride)return current;
  if(!current.hasPlatformSecret&&!force)throw new Error('GOOGLE_CONTOUR_LAST_SECRET_PROTECTED');
  const existing=await latestContour('google');
  if(existing?.id)await db.delete(CONTOUR_TABLE,[existing.id]);
  return resolveGoogleContour();
}

export function createGoogleContourRoutes(deps:{
  requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;
  respond:(data:unknown,status?:number)=>unknown;
  fail:(message:string,status?:number)=>unknown;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  const owner=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await deps.requireSession(event,body);
    if('errorCode'in auth||auth.user.status!=='approved'||auth.user.role!=='owner')return null;
    return auth;
  };
  return{
    'POST /api/owner/google-contour':[async(ctx)=>{
      const auth=await owner(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_CONTOUR_FORBIDDEN',403);
      const contour=await resolveGoogleContour();
      const keys=await googleContourKeyCards();
      return deps.respond({ok:true,contour:publicGoogleContour(contour),keys,selfTests:googleContourPolicySelfTest(),plaintextReturned:false});
    }],
    'POST /api/owner/google-contour/keys':[async(ctx)=>{
      const auth=await owner(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_CONTOUR_FORBIDDEN',403);
      const contour=await resolveGoogleContour();
      const keys=await googleContourKeyCards();
      return deps.respond({ok:true,contour:publicGoogleContour(contour),keys,plaintextReturned:false});
    }],
    'POST /api/owner/google-contour/reveal':[async(ctx)=>{
      const auth=await owner(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_CONTOUR_FORBIDDEN',403);
      // SECURITY: never return platform secrets (OAuth client secret, grant-wrapping key) to a browser.
      // Read them in the AppDeploy secrets console instead.
      if(CONTOUR_REVEAL_DISABLED)return deps.fail('OWNER_CONTOUR_REVEAL_DISABLED',403);
      if(!revealHostAllowed(ctx.event))return deps.fail('OWNER_CONTOUR_REVEAL_HOST_FORBIDDEN',403);
      const body=deps.body(ctx.body);
      if(String(body.confirm||'')!==REVEAL_CONFIRM)return deps.fail('OWNER_CONTOUR_REVEAL_CONFIRM_REQUIRED',400);
      const name=String(body.name||body.secretName||body.id||'');
      try{
        const revealed=await revealGoogleContourKey(name);
        await deps.audit(auth.user.id,'access.google-contour.reveal','success',{name:revealed.name,length:revealed.value.length,plaintextLogged:false});
        return deps.respond({ok:true,name:revealed.name,revealedValue:revealed.value,plaintextReturned:true,once:true,ttlSeconds:12});
      }catch(caught){
        const code=caught instanceof Error?caught.message:'GOOGLE_CONTOUR_REVEAL_FAILED';
        await deps.audit(auth.user.id,'access.google-contour.reveal','rejected',{reason:code,name});
        return deps.fail(code,code.includes('UNKNOWN')||code.includes('MISSING')?404:500);
      }
    }],
    'POST /api/owner/google-contour/save':[async(ctx)=>{
      const auth=await owner(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_CONTOUR_FORBIDDEN',403);
      const body=deps.body(ctx.body);
      try{
        const contour=await saveGoogleContour({clientId:String(body.clientId||''),clientSecret:String(body.clientSecret||body.secret||body.value||'')});
        const keys=await googleContourKeyCards();
        await deps.audit(auth.user.id,'access.google-contour.save','success',{source:contour.source,hasVaultOverride:contour.hasVaultOverride,clientId:contour.publicClientId});
        return deps.respond({ok:true,rotated:true,contour:publicGoogleContour(contour),keys,plaintextReturned:false});
      }catch(caught){
        const code=caught instanceof Error?caught.message:'GOOGLE_CONTOUR_SAVE_FAILED';
        await deps.audit(auth.user.id,'access.google-contour.save','rejected',{reason:code});
        return deps.fail(code,code.includes('PROTECTED')||code.includes('REQUIRED')||code.includes('INVALID')?400:500);
      }
    }],
    'POST /api/owner/google-contour/delete':[async(ctx)=>{
      const auth=await owner(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_CONTOUR_FORBIDDEN',403);
      try{
        const contour=await deleteGoogleContour(deps.body(ctx.body).force===true);
        const keys=await googleContourKeyCards();
        await deps.audit(auth.user.id,'access.google-contour.delete','success',{source:contour.source,hasPlatformSecret:contour.hasPlatformSecret});
        return deps.respond({ok:true,contour:publicGoogleContour(contour),keys,plaintextReturned:false});
      }catch(caught){
        const code=caught instanceof Error?caught.message:'GOOGLE_CONTOUR_DELETE_FAILED';
        await deps.audit(auth.user.id,'access.google-contour.delete','rejected',{reason:code});
        return deps.fail(code,code.includes('PROTECTED')?409:500);
      }
    }]
  };
}
void legacySaveGoogleContour;
void decryptSecret;
