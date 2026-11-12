import {useContext,useEffect,useRef,useState} from 'react';
import {api} from './platform/client';
import {leesVergeten,swrPost} from './lees-cache';
import {ecosystemTabContext} from './tab-context';
import './toegangslaag.css';

import {t,type Lang} from './toegangslaag-teksten';
import {AccessPlanePanels} from './toegangslaag-panelen';
import {lazy,Suspense} from 'react';
import {useAanmeldVnext} from './aanmeld-vnext/aanmeld-vlag'; /* UI-015: de vlag kiest alleen de PRESENTATIE van het methods-tabblad */
import {AtelierInhoud} from './identiteit/atelier-inhoud';
const AanmeldVnextPanelen=lazy(()=>import('./aanmeld-vnext/AanmeldVnextPanelen'));
const TelegramSectie=lazy(()=>import('./telegram-aanmelden/TelegramSectie')); /* TELEGRAM-AANMELDEN v1: alleen met vlag telegram-aanmelden-v1 */
const ApparaatSectie=lazy(()=>import('./apparaat-bevestiging/InstellingenSectie')); /* APPARAAT-001: alleen met vlag apparaat-bevestiging-v1 */
import {useTelegramVlag} from './telegram-aanmelden/vlag';
import {useApparaatVlag} from './apparaat-bevestiging/vlag'; /* APPARAAT-001 */
import {bevestigToegang,metHervat,neemHervat,stapOpUitleg} from './platform/stap-op';
import {aanmeldPauzeBericht,leesAanmeldPauze} from './aanmeld-pauze';
type Method={id:string;enabled:boolean;configured:boolean;bound?:boolean;status:string;honest?:string};
type Factor={id:string;enabled:boolean;enrolled:boolean;status:string;honest?:string;remaining?:number;phone?:string;count?:number;createdAt?:number;bekekenOp?:number};
type Binding={id:string;method:string;email:string;status:string;providerSubject?:string};
type Snapshot={
  architecture:string;
  contour:{clientId:string;redirectUri:string;credentialsConfigured:boolean;source:string;hasVaultOverride:boolean;hasPlatformSecret:boolean;missing:string[];lockProtected:boolean;updatedAt:number};
  policy:{enabled:Record<string,boolean>;mfa:'optional'|'required'};
  methods:Method[];
  factors:Factor[];
  bindings:Binding[];
  webauthn?:Array<{id:string;label:string}>;
  usableCount:number;
  lockout:{protected:boolean;reason:string};
  password:{configured:boolean;mustChange:boolean};
  phone?:{configured:boolean;verified:boolean;value:string};
  totp:{enrolled:boolean};
  admin?:boolean;
};

const blank=():Snapshot=>({
  architecture:'access-plane-v1',
  contour:{clientId:'',redirectUri:'https://id.tarasevych.com/',credentialsConfigured:false,source:'missing',hasVaultOverride:false,hasPlatformSecret:false,missing:['GOOGLE_OAUTH_CLIENT_SECRET'],lockProtected:false,updatedAt:0},
  policy:{enabled:{google:true,password:true},mfa:'optional'},
  methods:[
    {id:'google',enabled:true,configured:false,bound:false,status:'not_configured'},
    {id:'password',enabled:true,configured:false,bound:false,status:'not_configured'},
    {id:'microsoft',enabled:false,configured:false,bound:false,status:'not_configured',honest:'needs_provider_contour'},
    {id:'apple',enabled:false,configured:false,bound:false,status:'not_configured',honest:'needs_provider_contour'},
    {id:'facebook',enabled:false,configured:false,bound:false,status:'not_configured',honest:'needs_provider_contour'},
    {id:'phone',enabled:false,configured:false,bound:false,status:'not_configured',honest:'needs_sms_contour'}
  ],
  factors:[
    {id:'totp',enabled:true,enrolled:false,status:'not_enrolled'},
    {id:'recovery',enabled:true,enrolled:false,status:'not_enrolled',remaining:0},
    {id:'passkey',enabled:true,enrolled:false,status:'not_enrolled',count:0},
    {id:'sms',enabled:false,enrolled:false,status:'not_configured',honest:'needs_sms_contour'},
    {id:'push',enabled:false,enrolled:false,status:'not_configured',honest:'needs_push_channel'},
    {id:'webauthn',enabled:false,enrolled:false,status:'disabled_until_verified',honest:'webauthn_verification_not_implemented'}
  ],
  bindings:[],
  usableCount:0,
  lockout:{protected:true,reason:'LAST_LOGIN_METHOD_PROTECTED'},
  password:{configured:false,mustChange:false},
  totp:{enrolled:false}
});

// Before the snapshot arrives nothing is known yet, so the seed must not claim
// a method is missing. A failed first load falls back to blank() in the catch.
const pending=():Snapshot=>{
  const base=blank();
  return {...base,methods:base.methods.map(item=>({...item,status:'loading'})),factors:base.factors.map(item=>({...item,status:'loading'}))};
};

const sessionBody=()=>({service:new URLSearchParams(location.search).get('service')||'identity',tabContext:ecosystemTabContext(),sourceOrigin:location.origin});
export default function AccessPlaneView({tab,lang,mode='identity'}:{tab:string;lang:Lang;mode?:'identity'|'admin'}){
  const inAtelier=useContext(AtelierInhoud)&&mode==='identity';
  const alleen=inAtelier&&['methods','security','recovery'].includes(tab)?tab as 'methods'|'security'|'recovery':undefined;
  const telegramAan=useTelegramVlag();
  const apparaatAan=useApparaatVlag(); /* APPARAAT-001 */
  const aanmeldVnext=useAanmeldVnext(); /* alleen 'methods'; «Безпека» en «Відновлення» blijven op het bestaande formulier */
  const[data,setData]=useState<Snapshot>(pending());
  const[notice,setNotice]=useState('');
  const[busy,setBusy]=useState(false);
  const[password,setPassword]=useState('');
  const[otpauth,setOtpauth]=useState('');
  const[secret,setSecret]=useState('');
  const[code,setCode]=useState('');
  const[recovery,setRecovery]=useState<string[]>([]);
  const[tempPassword,setTempPassword]=useState('');

  const actiefRef=useRef(true);
  useEffect(()=>{actiefRef.current=true;return()=>{actiefRef.current=false;};},[]);

  const load=async(alleenVers=false)=>{
    try{
      if(mode==='identity'){
        await swrPost<Partial<Snapshot>>(
          '/api/owner/access/snapshot',
          sessionBody(),
          vers=>{if(actiefRef.current&&vers){setData({...blank(),...vers});setNotice('');}},
          {alleenVers}
        );
        return;
      }
      const[snap,contour]=await Promise.all([
        api.post('/api/owner/access/snapshot',sessionBody()),
        api.post('/api/owner/google-contour',sessionBody()).catch(()=>null)
      ]);
      if(!actiefRef.current)return;
      if(snap?.data)setData({...blank(),...snap.data,contour:contour?.data?.contour||snap.data.contour});
      setNotice('');
    }catch{
      if(!actiefRef.current)return;
      setData(current=>current.methods.some(item=>item.status==='loading')?blank():current);
      setNotice(t(lang,'t13'));
    }
  };

  useEffect(()=>{void load();},[tab,mode,lang]);

  const write=async(route:string,payload:Record<string,unknown>={})=>{
    setBusy(true);
    setNotice('');
    try{
      const response=await api.post(route,{...sessionBody(),...payload});
      if(response?.data?.otpauth){setOtpauth(String(response.data.otpauth));setSecret(String(response.data.secret||''));}
      if(Array.isArray(response?.data?.recoveryCodes))setRecovery(response.data.recoveryCodes);
      if(response?.data?.temporaryPassword)setTempPassword(String(response.data.temporaryPassword));
      if(response?.data?.methods||response?.data?.contour)setData(current=>({...current,...response.data,contour:response.data.contour||current.contour}));
      leesVergeten('/api/owner/access/snapshot');
      leesVergeten('/api/owner/access/recovery/overzicht');
      await load(true);
      setPassword('');
      setCode('');
    }catch(caught){
      const pauze=leesAanmeldPauze(caught);
      if(pauze.isPauze){
        setNotice(aanmeldPauzeBericht(pauze.seconden,lang,'bevestig',{maxAttempts:pauze.maxAttempts,windowSec:pauze.windowSec}).melding);
      }else{
        const message=String((caught as{response?:{data?:{error?:string}}})?.response?.data?.error||'');
        setNotice(
          message==='LAST_LOGIN_METHOD_PROTECTED'?t(lang,'t14'):
          message==='GOOGLE_CONTOUR_LAST_SECRET_PROTECTED'?t(lang,'t15'):
          /TOTP|CODE/.test(message)?t(lang,'t20'):
          message==='STEP_UP_REQUIRED'?stapOpUitleg():
          t(lang,'t16')
        );
      }
    }
    setBusy(false);
  };

  // Nieuwe herstelcodes. Met TOTP: venster «Підтвердіть доступ» met alleen passkey of de huidige TOTP-code (de server eist dat
  // zelf: Google of een herstelcode tellen hier niet). Zonder TOTP: gewone step-up via client.ts; kiest de gebruiker Google,
  // dan wordt «herstelcodes maken» na terugkeer automatisch hervat.
  const nieuweHerstelcodes=async()=>{
    setNotice('');
    const ctx=sessionBody();
    if(data.totp?.enrolled||data.factors.find(item=>item.id==='totp')?.enrolled){
      const uit=await bevestigToegang({service:ctx.service,tabContext:ctx.tabContext,post:(url,body)=>api.post(url,body),toegestaan:['passkey','totp'],codeTerug:true,actie:'herstelcodes-nieuw'});
      if(!uit.ok)return;
      await write('/api/owner/access/recovery/rotate',uit.methode==='totp'&&uit.code?{code:uit.code}:{});
      return;
    }
    await metHervat({actie:'herstelcodes-maken'},()=>write('/api/owner/access/recovery/rotate',{}));
  };
  // TOTP uitschakelen: de server eist de huidige TOTP-code of een ongebruikte herstelcode (geen passkey, geen Google).
  const totpUitschakelen=async()=>{
    setNotice('');
    const ctx=sessionBody();
    const uit=await bevestigToegang({service:ctx.service,tabContext:ctx.tabContext,post:(url,body)=>api.post(url,body),toegestaan:['totp','herstelcode'],codeTerug:true,actie:'totp-uitschakelen'});
    if(uit.ok&&uit.code)await write('/api/owner/access/totp/disable',{code:uit.code});
  };
  const hervat=useRef(false);
  useEffect(()=>{
    if(hervat.current||data.factors.some(item=>item.status==='loading'))return;
    hervat.current=true;
    if(neemHervat('herstelcodes-maken'))void nieuweHerstelcodes();
  },[data]);// eslint-disable-line react-hooks/exhaustive-deps
  const recoverySaved=async()=>{await write('/api/owner/access/recovery/bekeken');setRecovery([]);};
  const panelen=<AccessPlanePanels alleen={alleen} tab={tab} lang={lang} data={data} busy={busy} notice={notice} password={password} setPassword={setPassword} otpauth={otpauth} secret={secret} code={code} setCode={setCode} recovery={recovery} tempPassword={tempPassword} context={sessionBody()} load={load} write={write} nieuweHerstelcodes={nieuweHerstelcodes} totpUitschakelen={totpUitschakelen} recoverySaved={recoverySaved}/>;
  const telegram=tab==='methods'&&mode==='identity'&&(telegramAan||apparaatAan)?<Suspense fallback={null}>{telegramAan&&<TelegramSectie lang={lang}/>}{apparaatAan&&<ApparaatSectie lang={lang}/>}</Suspense>:null;
  if(tab==='methods'&&aanmeldVnext&&mode==='identity')return <>{<Suspense fallback={panelen}><AanmeldVnextPanelen alleen={alleen} tab={tab} lang={lang} data={data} busy={busy} notice={notice} password={password} setPassword={setPassword} otpauth={otpauth} secret={secret} code={code} setCode={setCode} recovery={recovery} tempPassword={tempPassword} context={sessionBody()} load={load} write={write} nieuweHerstelcodes={nieuweHerstelcodes} totpUitschakelen={totpUitschakelen} recoverySaved={recoverySaved}/></Suspense>}{telegram}</>;
  return telegram?<>{panelen}{telegram}</>:panelen;
}
