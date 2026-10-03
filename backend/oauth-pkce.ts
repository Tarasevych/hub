// Willekeurige PKCE-verifier en OIDC-nonce per OAuth-start (fase B).
// Vroeger werden verifier en nonce deterministisch afgeleid uit HMAC(clientSecret, state). Nu worden ze
// per start met randomBytes(32) gemaakt en server-side bewaard (tabel oauth_pkce_v1, sleutel = hash van
// doel + state). Bij de callback worden ze atomisch en eenmalig opgehaald (db.takeOne); daarna bestaan ze
// niet meer. Verlopen rijen ruimt de opruimjob op (server/cron.ts, taak "opruimen").
import {createHash,randomBytes} from 'node:crypto';
import {db} from '../server/platform';

export const OAUTH_PKCE_TABLE='oauth_pkce_v1';
const TTL_MS=20*60*1000;
export type OAuthPurpose='owner-google'|'mail-google'|'mail-microsoft'|'google-suite';
export type OAuthMaterial={verifier:string;challenge:string;nonce:string};

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const key=(purpose:OAuthPurpose,state:string)=>sha(`${purpose}:${state}`);
const challengeOf=(verifier:string)=>createHash('sha256').update(verifier).digest('base64url');

/** Maak nieuw materiaal voor `state`, bewaar het server-side en geef het terug. */
export async function createOAuthMaterial(purpose:OAuthPurpose,state:string):Promise<OAuthMaterial>{
  const verifier=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),now=Date.now();
  const[id]=await db.add(OAUTH_PKCE_TABLE,[{stateKey:key(purpose,state),purpose,verifier,nonce,createdAt:now,expiresAt:now+TTL_MS}]);
  if(!id)throw new Error('OAUTH_PKCE_STORE_FAILED');
  return{verifier,challenge:challengeOf(verifier),nonce};
}

/** Haal het materiaal voor `state` eenmalig op (atomisch verwijderd). null als onbekend of verlopen. */
export async function takeOAuthMaterial(purpose:OAuthPurpose,state:string):Promise<OAuthMaterial|null>{
  const row=await db.takeOne<{verifier:string;nonce:string;expiresAt:number}>(OAUTH_PKCE_TABLE,{stateKey:key(purpose,state)});
  if(!row||!row.verifier||Number(row.expiresAt||0)<=Date.now())return null;
  return{verifier:row.verifier,challenge:challengeOf(row.verifier),nonce:row.nonce};
}

/** Zoals takeOAuthMaterial, maar gooit `code` als er niets (geldigs) is. */
export async function requireOAuthMaterial(purpose:OAuthPurpose,state:string,code='OAUTH_PKCE_MATERIAL_MISSING'):Promise<OAuthMaterial>{
  const material=await takeOAuthMaterial(purpose,state);
  if(!material)throw new Error(code);
  return material;
}
