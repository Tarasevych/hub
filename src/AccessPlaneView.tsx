import {useEffect,useState} from 'react';
import {api} from './platform/client';
import {ecosystemTabContext} from './tab-context';
import './access-plane.css';

import {t,type Lang} from './access-plane-copy';
import {AccessPlanePanels} from './access-plane-panels';
import {passkeyStapOp} from './platform/stap-op';
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
  const[data,setData]=useState<Snapshot>(pending());
  const[notice,setNotice]=useState('');
  const[busy,setBusy]=useState(false);
  const[password,setPassword]=useState('');
  const[otpauth,setOtpauth]=useState('');
  const[secret,setSecret]=useState('');
  const[code,setCode]=useState('');
  const[recovery,setRecovery]=useState<string[]>([]);
  const[tempPassword,setTempPassword]=useState('');

  const load=async()=>{
    try{
      const[snap,contour]=await Promise.all([
        api.post('/api/owner/access/snapshot',sessionBody()),
        mode==='admin'?api.post('/api/owner/google-contour',sessionBody()).catch(()=>null):Promise.resolve(null)
      ]);
      if(snap?.data)setData({...blank(),...snap.data,contour:contour?.data?.contour||snap.data.contour});
      setNotice('');
    }catch{
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
      await load();
      setPassword('');
      setCode('');
    }catch(caught){
      const message=String((caught as{response?:{data?:{error?:string}}})?.response?.data?.error||'');
      setNotice(
        message==='LAST_LOGIN_METHOD_PROTECTED'?t(lang,'t14'):
        message==='GOOGLE_CONTOUR_LAST_SECRET_PROTECTED'?t(lang,'t15'):
        /TOTP|CODE/.test(message)?t(lang,'t20'):
        message==='RATE_LIMITED'||message==='LOGIN_RATE_LIMITED'?t(lang,'t21'):
        t(lang,'t16')
      );
    }
    setBusy(false);
  };

  // Nieuwe herstelcodes met een verse passkey-bevestiging in plaats van de TOTP-code (de server controleert dat zelf).
  const rotateWithPasskey=async()=>{
    setNotice('');
    const ok=await passkeyStapOp(String(sessionBody().service),sessionBody().tabContext,(url,body)=>api.post(url,body));
    if(!ok){setNotice(t(lang,'t19'));return;}
    await write('/api/owner/access/recovery/rotate',{});
  };
  const recoverySaved=async()=>{await write('/api/owner/access/recovery/bekeken');setRecovery([]);};
  return <AccessPlanePanels tab={tab} lang={lang} data={data} busy={busy} notice={notice} password={password} setPassword={setPassword} otpauth={otpauth} secret={secret} code={code} setCode={setCode} recovery={recovery} tempPassword={tempPassword} context={sessionBody()} load={load} write={write} rotateWithPasskey={rotateWithPasskey} recoverySaved={recoverySaved}/>;
}
