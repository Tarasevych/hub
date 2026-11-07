// Browserbinding voor de Google-aanmelding (redirect- en popup-flow), tegen login-CSRF.
//
// Probleem: een aanvaller start zelf een aanmelding, laat Google een code voor ZIJN account uitgeven en
// stuurt het slachtoffer naar https://id.tarasevych.com/?state=…&code=…. Zonder binding zou de
// callbackpagina in de browser van het slachtoffer die transactie afronden en het slachtoffer stil op
// het account van de aanvaller aanmelden (alles wat het slachtoffer daarna invoert, belandt bij de aanvaller).
//
// Oplossing: `transactions/create` zet per transactie een eigen willekeurige cookie
// `__Secure-tsv_aanmeld_binding_<16 hex van de transactiehash>` (HttpOnly, Secure, SameSite=Lax,
// Domain=.tarasevych.com, Max-Age 15 min). De transactie bewaart alleen
// SHA-256("tsv-aanmeld-binding-v2|transactiehash|tabhash|waarde"), dus de cookie hoort bij precies deze
// transactie én het tabblad (tab-id) dat haar startte. De Google-callback (POST, en de oude GET-variant)
// rondt alleen af als dezelfde browser die cookie meestuurt (tijdconstante vergelijking) en wist daarna
// alleen díé cookie. Omdat elke transactie een eigen cookienaam heeft, overschrijven parallelle
// aanmeldingen in meerdere tabbladen (ook voor verschillende accounts) elkaar niet. Een andere browser
// kan de cookie niet lezen of zetten, dus een ondergeschoven state/code is daar waardeloos.
// Ontbreekt de hash in de transactie (oude rij of v1-binding), dan faalt het dicht.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {COOKIE_SCOPE} from './deployment-identiteit';

export const AANMELD_BINDING_PREFIX='__Secure-tsv_aanmeld_binding_';
/** Even lang als de langste aanmeldtransactie (redirect: 10 min) plus marge. */
const MAX_AGE_S=15*60;
const FORMAAT=/^[A-Za-z0-9_-]{43}$/;
const HASH=/^[a-f0-9]{64}$/;

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const bindingVan=(transactionHash:string,tabHash:string,waarde:string)=>sha(`tsv-aanmeld-binding-v2|${transactionHash}|${tabHash}|${waarde}`);

/** Cookienaam voor één transactie: vast voorvoegsel + eerste 16 hex van de transactiehash. */
export function aanmeldBindingCookieNaam(transactionHash:unknown):string{
  const hash=String(transactionHash||'');
  if(!HASH.test(hash))throw new Error('LOGIN_BINDING_TRANSACTION_INVALID');
  return `${AANMELD_BINDING_PREFIX}${hash.slice(0,16)}`;
}

function cookieWaarde(event:Record<string,unknown>,naam:string):string{
  const headers=(event.headers||{})as Record<string,unknown>;
  const raw=String(headers.cookie||headers.Cookie||'');
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===naam){
      const waarde=part.slice(i+1).trim();
      return FORMAAT.test(waarde)?waarde:'';
    }
  }
  return '';
}
const zetCookie=(naam:string,waarde:string,maxAge:number)=>`${naam}=${waarde}; ${COOKIE_SCOPE}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

/**
 * Bij `transactions/create`: nieuwe bindingscookie voor déze transactie (naam afgeleid van de
 * transactiehash) gebonden aan het tabblad. Bewaar `bindingHash` in de transactie en stuur
 * `setCookie` mee in het antwoord.
 */
export function aanmeldBindingVoorAanmaken(transactionHash:string,tabHash:string):{bindingHash:string;setCookie:string;cookieNaam:string}{
  const naam=aanmeldBindingCookieNaam(transactionHash);
  if(!HASH.test(String(tabHash||'')))throw new Error('LOGIN_BINDING_TAB_INVALID');
  const waarde=randomBytes(32).toString('base64url');
  return{bindingHash:bindingVan(transactionHash,tabHash,waarde),setCookie:zetCookie(naam,waarde,MAX_AGE_S),cookieNaam:naam};
}

/**
 * In de callback: stuurt deze browser de bindingscookie van precies deze transactie mee, en klopt die
 * samen met de transactie- en tabhash uit de transactie? (tijdconstant; faalt dicht)
 */
export function aanmeldBindingKlopt(event:Record<string,unknown>,record:{transactionHash?:unknown;tabHash?:unknown;bindingHash?:unknown}|null|undefined):boolean{
  if(!record)return false;
  const transactionHash=String(record.transactionHash||''),tabHash=String(record.tabHash||''),verwacht=String(record.bindingHash||'');
  if(!HASH.test(transactionHash)||!HASH.test(tabHash)||!HASH.test(verwacht))return false;
  const waarde=cookieWaarde(event,aanmeldBindingCookieNaam(transactionHash));
  if(!waarde)return false;
  const a=Buffer.from(bindingVan(transactionHash,tabHash,waarde),'utf8'),b=Buffer.from(verwacht,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}

/** Set-Cookie die alleen de bindingscookie van deze transactie wist (na de callback). */
export const aanmeldBindingWissen=(transactionHash:unknown)=>zetCookie(aanmeldBindingCookieNaam(transactionHash),'',0);
