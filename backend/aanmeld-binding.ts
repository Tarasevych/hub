// Browserbinding voor de Google-aanmelding (redirect- en popup-flow), tegen login-CSRF.
//
// Probleem: een aanvaller start zelf een aanmelding, laat Google een code voor ZIJN account uitgeven en
// stuurt het slachtoffer naar https://id.tarasevych.com/?state=…&code=…. Zonder binding zou de
// callbackpagina in de browser van het slachtoffer die transactie afronden en het slachtoffer stil op
// het account van de aanvaller aanmelden (alles wat het slachtoffer daarna invoert, belandt bij de aanvaller).
//
// Oplossing: `transactions/create` zet (of hergebruikt) een willekeurige cookie
// `__Secure-tsv_aanmeld_binding` (HttpOnly, Secure, SameSite=Lax, Domain=.tarasevych.com, kort geldig).
// De transactie bewaart alleen de SHA-256 ervan. De Google-callback (POST, en de oude GET-variant)
// rondt alleen af als dezelfde browser die cookie meestuurt (tijdconstante vergelijking) en wist de
// cookie daarna. Een andere browser kan de cookie niet lezen of zetten, dus een ondergeschoven
// state/code is daar waardeloos. Ontbreekt de hash in de transactie (oude rij), dan faalt het dicht.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {COOKIE_SCOPE} from './deployment-identity';

export const AANMELD_BINDING_COOKIE='__Secure-tsv_aanmeld_binding';
/** Even lang als de langste aanmeldtransactie (redirect: 10 min) plus marge. */
const MAX_AGE_S=15*60;
const FORMAAT=/^[A-Za-z0-9_-]{43}$/;
const HASH=/^[a-f0-9]{64}$/;

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function cookieWaarde(event:Record<string,unknown>):string{
  const headers=(event.headers||{})as Record<string,unknown>;
  const raw=String(headers.cookie||headers.Cookie||'');
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===AANMELD_BINDING_COOKIE){
      const waarde=part.slice(i+1).trim();
      return FORMAAT.test(waarde)?waarde:'';
    }
  }
  return '';
}
const zetCookie=(waarde:string,maxAge:number)=>`${AANMELD_BINDING_COOKIE}=${waarde}; ${COOKIE_SCOPE}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

/**
 * Bij `transactions/create`: bestaande bindingscookie van deze browser hergebruiken (twee tabbladen die
 * tegelijk aanmelden blijven werken) of een nieuwe maken. Bewaar `bindingHash` in de transactie en
 * stuur `setCookie` mee in het antwoord.
 */
export function aanmeldBindingVoorAanmaken(event:Record<string,unknown>):{bindingHash:string;setCookie:string}{
  const waarde=cookieWaarde(event)||randomBytes(32).toString('base64url');
  return{bindingHash:sha(waarde),setCookie:zetCookie(waarde,MAX_AGE_S)};
}

/** In de callback: klopt de bindingscookie van deze browser met de hash in de transactie? (tijdconstant) */
export function aanmeldBindingKlopt(event:Record<string,unknown>,opgeslagenHash:unknown):boolean{
  const verwacht=String(opgeslagenHash||'');
  const waarde=cookieWaarde(event);
  if(!waarde||!HASH.test(verwacht))return false;
  const a=Buffer.from(sha(waarde),'utf8'),b=Buffer.from(verwacht,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}

/** Set-Cookie die de bindingscookie wist (na een geslaagde callback). */
export const aanmeldBindingWissen=()=>zetCookie('',0);
