/** Налаштування ключів постачальників задаються виключно середовищем сервера, ніколи заголовком запиту.
 * Aanbiedergegevens staan vast in de serveromgeving, nooit uit een HTTP-kop. */
import type {OAuthProvider,OAuthConfig}from'./cloud-verbinding-m4';
import{CloudConnectionError}from'./cloud-verbinding-m4';
const ALLOWED=['https://api.tarasevych.com','https://cloud.tarasevych.com'];
export const CALLBACK_PATH='/api/owner/cloud/oauth/m4/callback';
export function cloudOAuthM4Config(provider:OAuthProvider):OAuthConfig{
 const isMs=provider.startsWith('onedrive')||provider==='sharepoint';
 const prefix=isMs?'CLOUD_MICROSOFT':provider==='dropbox'?'CLOUD_DROPBOX':'CLOUD_BOX';
 const clientId=(isMs?process.env.ONEDRIVE_CLIENT_ID:'')||process.env[prefix+'_CLIENT_ID']||'';
 const clientSecret=(isMs?process.env.ONEDRIVE_CLIENT_SECRET:'')||process.env[prefix+'_CLIENT_SECRET']||'';
 const redirectUri=process.env.CLOUD_OAUTH_M4_REDIRECT_URI||'';
 let uri:URL;try{uri=new URL(redirectUri);}catch{throw new CloudConnectionError('CLOUD_OAUTH_CALLBACK_NOT_CONFIGURED',503);}
 if(!ALLOWED.includes(uri.origin)||uri.pathname!==CALLBACK_PATH||uri.search||uri.hash)
  throw new CloudConnectionError('CLOUD_OAUTH_CALLBACK_NOT_ALLOWLISTED',503);
 return{clientId,clientSecret,redirectUri};
}
