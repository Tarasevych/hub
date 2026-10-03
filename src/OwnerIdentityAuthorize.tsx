import {useEffect,useRef} from 'react';
import {api} from './platform/client';
import type {OwnerLang} from './owner-test-i18n';import {TECH_ORIGIN} from '../backend/deployment-identity';

type Attach={type:'owner.identity.attach';transactionId:string;attachSecret:string;sourceOrigin:string};

export default function OwnerIdentityAuthorize({lang}:{lang:OwnerLang}){
  const attaching=useRef(false);
  const opener=window.opener;
  const qaHoldAtAttached=location.hostname===new URL(TECH_ORIGIN).hostname&&new URLSearchParams(location.search).get('qa_hold')==='1';

  useEffect(()=>{
    if(!opener){window.setTimeout(()=>window.close(),0);return}
    const fail=(sourceOrigin:string,transactionId='')=>{
      if(sourceOrigin)opener.postMessage({type:'owner.identity.failed',transactionId},sourceOrigin);
      window.close();
    };
    const receive=(event:MessageEvent<Attach>)=>{
      if(event.source!==opener||event.data?.type!=='owner.identity.attach'||attaching.current)return;
      const payload=event.data;
      if(!payload.transactionId||!payload.attachSecret||!payload.sourceOrigin||event.origin!==payload.sourceOrigin){fail(payload.sourceOrigin||'',payload.transactionId||'');return}
      attaching.current=true;
      void api.post('/api/owner/identity/transactions/attach',{service:'identity',authorityOrigin:location.origin,transactionId:payload.transactionId,attachSecret:payload.attachSecret,sourceOrigin:payload.sourceOrigin,locale:lang,remember:true}).then(response=>{
        const authUrl=String(response.data.authUrl||'');
        const redirectUri=String(response.data.redirectUri||'');
        const parsed=new URL(authUrl);
        if(parsed.origin!=='https://accounts.google.com'||redirectUri!=='https://id.tarasevych.com/')throw new Error('INVALID_GOOGLE_REDIRECT');
        opener.postMessage({type:'owner.identity.attached',transactionId:payload.transactionId},payload.sourceOrigin);
        if(!qaHoldAtAttached)location.replace(authUrl);
      }).catch(()=>fail(payload.sourceOrigin,payload.transactionId));
    };
    window.addEventListener('message',receive);
    return()=>window.removeEventListener('message',receive);
  },[lang,opener,qaHoldAtAttached]);

  return <main aria-hidden='true' style={{minHeight:'100vh',background:'transparent'}}/>;
}
