/** Provider credential configuration is fixed by server deployment, never HTTP Host. */
import type {OAuthProvider,OAuthConfig}from'./cloud-verbinding-m4';
import{CloudConnectionError}from'./cloud-verbinding-m4';
const ALLOWED=['https://api.tarasevych.com','https://cloud.tarasevych.com'];
export const CALLBACK_PATH='/api/owner/cloud/oauth/m4/callback';
export function cloudOAuthM4Config(provider:OAuthProvider):OAuthConfig{
 const prefix=provider.startsWith('onedrive')||provider==='sharepoint'?'CLOUD_MICROSOFT':provider==='dropbox'?'CLOUD_DROPBOX':'CLOUD_BOX';
 const clientId=process.env[prefix+'_CLIENT_ID']||'',clientSecret=process.env[prefix+'_CLIENT_SECRET']||'';
 const redirectUri=process.env.CLOUD_OAUTH_M4_REDIRECT_URI||'';
 let uri:URL;try{uri=new URL(redirectUri);}catch{throw new CloudConnectionError('CLOUD_OAUTH_CALLBACK_NOT_CONFIGURED',503);}
 if(!ALLOWED.includes(uri.origin)||uri.pathname!==CALLBACK_PATH||uri.search||uri.hash)
  throw new CloudConnectionError('CLOUD_OAUTH_CALLBACK_NOT_ALLOWLISTED',503);
 return{clientId,clientSecret,redirectUri};
}
