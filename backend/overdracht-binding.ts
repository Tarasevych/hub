// Browserbinding voor sessie-handoffs (?handoff=<code>), tegen login-CSRF.
//
// Probleem: een aanvaller maakt in zijn eigen browser een handoff-code aan en schuift de link
// (https://<dienst>.tarasevych.com/?handoff=…) onder bij een afgemelde browser; die zou dan stil op
// het account van de aanvaller worden aangemeld.
//
// Oplossing: wie een handoff aanmaakt, krijgt (of heeft al) een willekeurige bindingscookie
// `tsv_handoff_binding` (HttpOnly, Secure, SameSite=Strict, Domain=.tarasevych.com). De handoff-rij
// bewaart alleen de SHA-256 van die waarde. Inwisselen lukt alleen met dezelfde cookie; de controle
// zit in het atomische `db.takeOne`-filter, zodat een verkeerde browser de code ook niet "opbrandt".
// Een andere browser kan de cookie niet lezen of zetten (HttpOnly, eigen domein), dus een
// ondergeschoven code is daar waardeloos.
import {createHash,randomBytes} from 'node:crypto';
import {COOKIE_SCOPE} from './deployment-identiteit';

export const HANDOFF_BINDING_COOKIE='tsv_handoff_binding';
const MAX_AGE_S=30*24*60*60;
const FORMAAT=/^[A-Za-z0-9_-]{43}$/;

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function cookieWaarde(event:Record<string,unknown>):string{
  const headers=(event.headers||{})as Record<string,unknown>;
  const raw=String(headers.cookie||headers.Cookie||'');
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===HANDOFF_BINDING_COOKIE){
      const waarde=part.slice(i+1).trim();
      return FORMAAT.test(waarde)?waarde:'';
    }
  }
  return '';
}
const setCookie=(waarde:string)=>`${HANDOFF_BINDING_COOKIE}=${waarde}; ${COOKIE_SCOPE}; Max-Age=${MAX_AGE_S}; HttpOnly; Secure; SameSite=Strict`;

/** Bij het aanmaken: bestaande bindingscookie hergebruiken (meerdere tabbladen tegelijk blijven werken) of een nieuwe maken. */
export function handoffBindingVoorAanmaken(event:Record<string,unknown>):{bindingHash:string;setCookie:string}{
  const waarde=cookieWaarde(event)||randomBytes(32).toString('base64url');
  return{bindingHash:sha(waarde),setCookie:setCookie(waarde)};
}

/** Bij het inwisselen: hash van de bindingscookie van deze browser, of '' als die ontbreekt. */
export function handoffBindingVanBrowser(event:Record<string,unknown>):string{
  const waarde=cookieWaarde(event);
  return waarde?sha(waarde):'';
}

/** Voeg een Set-Cookie toe aan een bestaande routerrespons (bestaande Set-Cookie blijft staan). */
export function metBindingCookie<T>(response:T,cookie:string):T{
  if(!cookie||!response||typeof response!=='object')return response;
  const r=response as unknown as {headers?:Record<string,string>};
  const headers={...(r.headers||{})};
  const bestaand=Object.keys(headers).find(key=>key.toLowerCase()==='set-cookie');
  if(bestaand){headers[bestaand]=`${headers[bestaand]}, ${cookie}`;}
  else headers['Set-Cookie']=cookie;
  return{...(response as object),headers}as T;
}
