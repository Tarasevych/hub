import {useEffect,useRef} from 'react';
import {api} from './platform/client';
import {ecosystemTabContext} from './tab-context';
import {redirectStartReason,startPrimaryRedirectLogin} from './redirect-login';

type Lang='uk'|'nl';
type Intent='login'|'replace-tab';
type Options={lang:Lang;onAuthorized:(data:Record<string,unknown>)=>void;onMessage:(uk:string,nl:string)=>void;onChooserClose:()=>void};
export const hubTabContext=ecosystemTabContext;
export const hubAuthBody=(extra:Record<string,unknown>={})=>({...extra,service:'hub',tabContext:hubTabContext(),sourceOrigin:location.origin});
export default function useCanonicalHubAuth(options:Options){
  const callbacks=useRef(options);callbacks.current=options;
  const loginStartInFlight=useRef(false);
  const technicalQaHold=location.hostname.endsWith('.v2.appdeploy.ai')&&new URLSearchParams(location.search).get('qa_auth_hold')==='1';
  const clear=()=>{loginStartInFlight.current=false};
  useEffect(()=>{const restore=()=>{loginStartInFlight.current=false};window.addEventListener('pageshow',restore);return()=>window.removeEventListener('pageshow',restore)},[]);
  const bootstrap=async()=>{const response=await api.post('/api/owner/session/bootstrap',hubAuthBody());return response.data as Record<string,unknown>};
  const connect=async(intent:Intent='replace-tab')=>{if(loginStartInFlight.current)return;loginStartInFlight.current=true;callbacks.current.onChooserClose();try{const result=await startPrimaryRedirectLogin({service:'hub',tabContext:hubTabContext(),sourceOrigin:location.origin,locale:callbacks.current.lang,intent,qaHoldAtAttached:technicalQaHold});if(result.held){clear();callbacks.current.onMessage('Технічна перевірка підтвердила один redirect-create до Google у цій вкладці.','De technische controle bevestigde één redirect-create naar Google in dit tabblad.')}}catch(caught){const reason=redirectStartReason(caught);clear();callbacks.current.onMessage(`Не вдалося розпочати вхід (${reason}). Кнопка вже активна; можна одразу спробувати ще раз.`,`Aanmelden kon niet worden gestart (${reason}). De knop is opnieuw actief; u kunt meteen opnieuw proberen.`)}};
  const cancel=async()=>{clear()};
  const logout=async(forgetBrowser=false)=>{const response=await api.post('/api/owner/session/logout-current',hubAuthBody({forgetBrowser}));return response.data as Record<string,unknown>};
  const reset=()=>clear();return{bootstrap,connect,cancel,logout,reset}
}
