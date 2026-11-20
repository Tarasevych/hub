import {useEffect,useRef} from 'react';
import {api} from './platform/client';
import {ecosystemTabContext} from './tab-context';
import {startPrimaryRedirectLogin} from './aanmeld-omleiding';
import {leesAanmeldenOnthouden} from './aanmelden-onthouden';
import {aanmeldPauzeBericht,aanmeldStartFoutTekst,leesAanmeldPauze,leesActieveAanmeldPauze,wisAanmeldPauze,zetAanmeldPauze} from './aanmeld-pauze';

type Lang='uk'|'nl';
type Intent='login'|'replace-tab';
export type ConnectResult={ok:boolean;foutUk?:string;foutNl?:string};
type Options={lang:Lang;onAuthorized:(data:Record<string,unknown>)=>void;onMessage:(uk:string,nl:string)=>void;onChooserClose:()=>void};
export const hubTabContext=ecosystemTabContext;
export const hubAuthBody=(extra:Record<string,unknown>={})=>({...extra,service:'hub',tabContext:hubTabContext(),sourceOrigin:location.origin});
export default function useCanonicalHubAuth(options:Options){
  const callbacks=useRef(options);callbacks.current=options;
  const loginStartInFlight=useRef(false);
  const clear=()=>{loginStartInFlight.current=false};
  useEffect(()=>{const restore=()=>{loginStartInFlight.current=false};window.addEventListener('pageshow',restore);return()=>window.removeEventListener('pageshow',restore)},[]);
  const bootstrap=async()=>{const response=await api.post('/api/owner/session/bootstrap',hubAuthBody());return response.data as Record<string,unknown>};
  const connect=async(intent:Intent='replace-tab',hintGrantId?:string):Promise<ConnectResult>=>{
    if(loginStartInFlight.current)return{ok:false,foutUk:'Вхід уже виконується…',foutNl:'Aanmelden is al bezig…'};
    const wacht=leesActieveAanmeldPauze();
    if(wacht.actief){
      const foutUk=aanmeldPauzeBericht(wacht.resterend,'uk','google',wacht.limiet).melding;
      const foutNl=aanmeldPauzeBericht(wacht.resterend,'nl','google',wacht.limiet).melding;
      callbacks.current.onChooserClose();
      if(intent!=='login')callbacks.current.onMessage(foutUk,foutNl);
      return{ok:false,foutUk,foutNl};
    }
    loginStartInFlight.current=true;
    callbacks.current.onChooserClose();
    try{
      const result=await startPrimaryRedirectLogin({
        service:'hub',
        tabContext:hubTabContext(),
        sourceOrigin:location.origin,
        locale:callbacks.current.lang,
        intent,
        /* De keuze «dit account bewaren» staat op het APPARAAT; de hub stuurde hem niet mee en kreeg dus altijd de standaard. */
        remember:leesAanmeldenOnthouden(),
        hintGrantId,
      });
      wisAanmeldPauze();
      void result;
      return{ok:true};
    }catch(caught){
      clear();
      const pauze=leesAanmeldPauze(caught);
      if(pauze.isPauze){
        const limiet={maxAttempts:pauze.maxAttempts,windowSec:pauze.windowSec};
        const foutUk=aanmeldPauzeBericht(pauze.seconden,'uk','google',limiet).melding;
        const foutNl=aanmeldPauzeBericht(pauze.seconden,'nl','google',limiet).melding;
        zetAanmeldPauze(pauze.seconden,'google',pauze.code,limiet);
        if(intent==='login')callbacks.current.onMessage('','');
        else callbacks.current.onMessage(foutUk,foutNl);
        return{ok:false,foutUk,foutNl};
      }
      const foutUk=aanmeldStartFoutTekst(caught,'uk'),foutNl=aanmeldStartFoutTekst(caught,'nl');
      callbacks.current.onMessage(foutUk,foutNl);
      return{ok:false,foutUk,foutNl};
    }
  };
  const cancel=async()=>{clear()};
  const logout=async(forgetBrowser=false)=>{const response=await api.post('/api/owner/session/logout-current',hubAuthBody({forgetBrowser}));return response.data as Record<string,unknown>};
  const reset=()=>clear();return{bootstrap,connect,cancel,logout,reset}
}
