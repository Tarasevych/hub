import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes} from 'node:crypto';

export type MailProvider='google_gmail'|'microsoft_graph';
export type MailTokenContext={ownerUserId:string;mailAccountId:string;provider:MailProvider;tokenKind:'refresh_token'|'access_token_cache'};
export type MailTokenEnvelope={algorithm:'AES-256-GCM';keyVersion:number;ciphertext:string;iv:string;authTag:string};
export type MailProviderReadiness={provider:MailProvider;oauthConfigured:boolean;encryptionConfigured:boolean;pushConfigured:boolean;pushEndpointVerified:boolean;oauthImplemented:boolean;workersImplemented:boolean;runtimeEnabled:boolean;oauthStartAvailable:boolean;connectEnabled:boolean;syncEnabled:boolean;missing:string[];scopes:string[]};
export type MailJobType='token.refresh'|'provider.watch.renew'|'provider.webhook.ingest'|'provider.sync.initial'|'provider.sync.incremental'|'provider.message.fetch'|'provider.attachment.fetch'|'provider.labels.sync'|'provider.thread.rebuild'|'neuro.triage'|'neuro.summary'|'notification.evaluate'|'send.prepare'|'send.commit'|'provider.disconnect.cleanup';
export type MailJobRecord={id:string;ownerUserId:string;mailAccountId:string;type:MailJobType;idempotencyKey:string;status:'queued'|'leased'|'retry'|'succeeded'|'dead';priority:number;attemptCount:number;maxAttempts:number;availableAt:number;leaseOwner:string;leaseExpiresAt:number;payload:Record<string,unknown>;createdAt:number;updatedAt:number};export type MailStateAction='read'|'unread'|'star'|'unstar'|'archive'|'inbox'|'trash'|'untrash'|'spam'|'unspam'|'snooze'|'unsnooze';export type MailStateKey='unread'|'starred'|'inInbox'|'trashed'|'spam'|'snoozed';export type MailStateIntentStatus='queued'|'leased'|'retry'|'succeeded'|'failed'|'unsupported'|'superseded'|'local_succeeded';export type MailStateIntentRecord={id:string;ownerUserId:string;accountId:string;provider:'google_gmail';messageId:string;stateKey:MailStateKey;action:MailStateAction;desired:boolean;localUntil:number;previousState:boolean;source:string;intentId:string;idempotencyKey:string;status:MailStateIntentStatus;capability:'supported'|'unsupported';attemptCount:number;maxAttempts:number;availableAt:number;leaseOwner:string;leaseExpiresAt:number;acceptedAt:number;providerObservedAt:number;completedAt:number;updatedAt:number;errorCode:string;rollbackRequired:boolean;converged:boolean};

export const MAIL_PROVIDER_SCOPES:Record<MailProvider,string[]>={
 google_gmail:['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.labels'],
 microsoft_graph:['Mail.Read','Mail.ReadWrite','Mail.Send']
};
const MAIL_GOOGLE_STATE=/^mailg\.v1\.(uk|nl)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{20,})$/;
export const mailGoogleStateValue=(locale:'uk'|'nl',recordId:string)=>`mailg.v1.${locale}.${Buffer.from(recordId,'utf8').toString('base64url')}.${randomBytes(24).toString('base64url')}`;
export const mailGoogleStateParts=(state:string)=>{const match=MAIL_GOOGLE_STATE.exec(state);if(!match)return null;try{const recordId=Buffer.from(match[2],'base64url').toString('utf8');return recordId?{locale:match[1]as'uk'|'nl',recordId}:null}catch{return null}};
export const mailGoogleOAuthMaterial=(state:string,clientSecret:string)=>{const verifier=createHmac('sha256',clientSecret).update(`mail-pkce:${state}`).digest('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');return{verifier,challenge}};
export const mailGoogleAuthorizationUrl=(input:{clientId:string;redirectUri:string;state:string;clientSecret:string;locale:'uk'|'nl';loginHint:string})=>{const material=mailGoogleOAuthMaterial(input.state,input.clientSecret),params=new URLSearchParams({client_id:input.clientId,redirect_uri:input.redirectUri,response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:MAIL_PROVIDER_SCOPES.google_gmail.join(' '),state:input.state,code_challenge:material.challenge,code_challenge_method:'S256',hl:input.locale,login_hint:input.loginHint});const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=params.toString();return url.toString()};
export const MAIL_JOB_TYPES:MailJobType[]=['token.refresh','provider.watch.renew','provider.webhook.ingest','provider.sync.initial','provider.sync.incremental','provider.message.fetch','provider.attachment.fetch','provider.labels.sync','provider.thread.rebuild','neuro.triage','neuro.summary','notification.evaluate','send.prepare','send.commit','provider.disconnect.cleanup'];

const tokenAad=(value:MailTokenContext)=>`${value.ownerUserId}|${value.mailAccountId}|${value.provider}|${value.tokenKind}`;
const encryptionKey=(secret:string)=>{
 const normalized=secret.trim();
 const key=/^[a-f0-9]{64}$/i.test(normalized)?Buffer.from(normalized,'hex'):Buffer.from(normalized,'base64');
 if(key.length!==32)throw new Error('MAIL_TOKEN_ENCRYPTION_KEY_INVALID');
 return key;
};
export const encryptMailToken=(token:string,secret:string,context:MailTokenContext,keyVersion=1):MailTokenEnvelope=>{
 if(!token)throw new Error('MAIL_TOKEN_EMPTY');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(secret),iv),aad=Buffer.from(tokenAad(context),'utf8');
 cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return{algorithm:'AES-256-GCM',keyVersion,ciphertext:ciphertext.toString('base64url'),iv:iv.toString('base64url'),authTag:cipher.getAuthTag().toString('base64url')};
};
export const decryptMailToken=(envelope:MailTokenEnvelope,secret:string,context:MailTokenContext)=>{
 if(envelope.algorithm!=='AES-256-GCM'||envelope.keyVersion<1)throw new Error('MAIL_TOKEN_ENVELOPE_INVALID');
 const iv=Buffer.from(envelope.iv,'base64url'),tag=Buffer.from(envelope.authTag,'base64url'),ciphertext=Buffer.from(envelope.ciphertext,'base64url');
 if(iv.length!==12||tag.length!==16)throw new Error('MAIL_TOKEN_ENVELOPE_INVALID');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(secret),iv);
 decipher.setAAD(Buffer.from(tokenAad(context),'utf8'));
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
};
export const mailJobIdempotencyKey=(type:MailJobType,ownerUserId:string,mailAccountId:string,fingerprint:string)=>createHash('sha256').update(`${type}|${ownerUserId}|${mailAccountId}|${fingerprint}`).digest('hex');export const MAIL_STATE_ACTIONS:MailStateAction[]=['read','unread','star','unstar','archive','inbox','trash','untrash','spam','unspam','snooze','unsnooze'];export const mailStateActionSpec=(action:MailStateAction):{stateKey:MailStateKey;desired:boolean;capability:'supported'|'unsupported'}=>({read:{stateKey:'unread',desired:false,capability:'supported'},unread:{stateKey:'unread',desired:true,capability:'supported'},star:{stateKey:'starred',desired:true,capability:'supported'},unstar:{stateKey:'starred',desired:false,capability:'supported'},archive:{stateKey:'inInbox',desired:false,capability:'supported'},inbox:{stateKey:'inInbox',desired:true,capability:'supported'},trash:{stateKey:'trashed',desired:true,capability:'supported'},untrash:{stateKey:'trashed',desired:false,capability:'supported'},spam:{stateKey:'spam',desired:true,capability:'supported'},unspam:{stateKey:'spam',desired:false,capability:'supported'},snooze:{stateKey:'snoozed',desired:true,capability:'unsupported'},unsnooze:{stateKey:'snoozed',desired:false,capability:'unsupported'}}[action]);export const mailStateIntentIdempotencyKey=(ownerUserId:string,accountId:string,messageId:string,stateKey:MailStateKey,intentId:string)=>createHash('sha256').update(`mail-state-v1|${ownerUserId}|${accountId}|${messageId}|${stateKey}|${intentId}`).digest('hex');export const mailStateRetryDelay=(attempt:number)=>Math.min(6*60*60*1000,5000*2**Math.min(8,Math.max(0,attempt-1)))+randomBytes(2).readUInt16BE(0)%3000;

export const mailProviderReadiness=(secretNames:string[],implementation={googleOauth:true,microsoftOauth:true,workers:true,googleRuntimeEnabled:false,microsoftRuntimeEnabled:false,encryptionConfigured:false,googlePushEndpointVerified:false,microsoftPushEndpointVerified:false})=>{
 const names=new Set(secretNames),encryptionConfigured=names.has('MAIL_TOKEN_ENCRYPTION_KEY_V1')&&implementation.encryptionConfigured;
 const googleOauth=names.has('GOOGLE_OAUTH_CLIENT_SECRET'),googlePush=names.has('GOOGLE_GMAIL_PUBSUB_TOPIC')&&names.has('GOOGLE_GMAIL_PUBSUB_AUDIENCE')&&names.has('GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL'),googlePushVerified=implementation.googlePushEndpointVerified;
 const microsoftOauth=names.has('MICROSOFT_GRAPH_CLIENT_SECRET')&&names.has('MICROSOFT_GRAPH_CLIENT_ID')&&names.has('MICROSOFT_GRAPH_TENANT_ID'),microsoftPush=names.has('MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE')&&names.has('MICROSOFT_GRAPH_WEBHOOK_URL'),microsoftPushVerified=implementation.microsoftPushEndpointVerified;
 const row=(provider:MailProvider,oauthConfigured:boolean,pushConfigured:boolean,pushEndpointVerified:boolean,oauthImplemented:boolean,runtimeEnabled:boolean):MailProviderReadiness=>{const oauthStartAvailable=oauthConfigured&&encryptionConfigured&&oauthImplemented,connectEnabled=oauthStartAvailable&&pushConfigured&&pushEndpointVerified&&implementation.workers&&runtimeEnabled;return{provider,oauthConfigured,encryptionConfigured,pushConfigured,pushEndpointVerified,oauthImplemented,workersImplemented:implementation.workers,runtimeEnabled,oauthStartAvailable,connectEnabled,syncEnabled:connectEnabled,missing:[...(!oauthConfigured?['oauth_client']:[]),...(!encryptionConfigured?['token_encryption']:[]),...(!pushConfigured?['push_channel']:[]),...(!pushEndpointVerified?['push_endpoint_verification']:[]),...(!oauthImplemented?['implementation']:[]),...(!implementation.workers?['workers']:[]),...(pushEndpointVerified&&!runtimeEnabled?['runtime_enable']:[])],scopes:[...MAIL_PROVIDER_SCOPES[provider]]}};
 return{google:row('google_gmail',googleOauth,googlePush,googlePushVerified,implementation.googleOauth,implementation.googleRuntimeEnabled),microsoft:row('microsoft_graph',microsoftOauth,microsoftPush,microsoftPushVerified,implementation.microsoftOauth,implementation.microsoftRuntimeEnabled)};
};

export const mailPlatformPolicySelfTest=()=>{
 const secret=Buffer.alloc(32,7).toString('base64'),wrongSecret=Buffer.alloc(32,8).toString('base64'),context:MailTokenContext={ownerUserId:'owner-policy',mailAccountId:'account-policy',provider:'google_gmail',tokenKind:'refresh_token'},token='synthetic-refresh-token-never-persisted',envelope=encryptMailToken(token,secret,context),keyA=mailJobIdempotencyKey('provider.sync.incremental','owner-policy','account-policy','history-42'),keyB=mailJobIdempotencyKey('provider.sync.incremental','owner-policy','account-policy','history-42');
 let aadRejected=false,wrongKeyRejected=false;
 try{decryptMailToken(envelope,secret,{...context,mailAccountId:'other-account'})}catch{aadRejected=true}
 try{decryptMailToken(envelope,wrongSecret,context)}catch{wrongKeyRejected=true}
 const stateIntentKeyA=mailStateIntentIdempotencyKey('owner-policy','account-policy','message-policy','unread','intent-policy'),stateIntentKeyB=mailStateIntentIdempotencyKey('owner-policy','account-policy','message-policy','unread','intent-policy'),state=mailGoogleStateValue('nl','policy-state-record'),parts=mailGoogleStateParts(state),authUrl=new URL(mailGoogleAuthorizationUrl({clientId:'policy-client',redirectUri:'https://id.tarasevych.com/',state,clientSecret:'policy-client-secret',locale:'nl',loginHint:'owner@example.com'}));
 return[
  {id:'mail-google-state-direct-record-locale',passed:parts?.recordId==='policy-state-record'&&parts.locale==='nl'},
  {id:'mail-google-state-tamper-rejected',passed:mailGoogleStateParts(`${state}!`)===null},
  {id:'mail-google-offline-pkce-consent',passed:authUrl.searchParams.get('access_type')==='offline'&&authUrl.searchParams.get('prompt')==='consent'&&authUrl.searchParams.get('code_challenge_method')==='S256'},
  {id:'mail-google-exact-callback-and-scopes',passed:authUrl.searchParams.get('redirect_uri')==='https://id.tarasevych.com/'&&MAIL_PROVIDER_SCOPES.google_gmail.every(scope=>String(authUrl.searchParams.get('scope')).includes(scope))},
  {id:'mail-token-vault-aes-256-gcm-roundtrip',passed:decryptMailToken(envelope,secret,context)===token},
  {id:'mail-token-vault-no-plaintext-envelope',passed:!JSON.stringify(envelope).includes(token)},
  {id:'mail-token-vault-aad-owner-account-bound',passed:aadRejected},
  {id:'mail-token-vault-wrong-key-rejected',passed:wrongKeyRejected},
  {id:'mail-token-vault-random-96-bit-iv',passed:Buffer.from(envelope.iv,'base64url').length===12},
  {id:'mail-job-idempotency-deterministic',passed:keyA===keyB&&keyA.length===64},{id:'mail-state-intent-idempotency-deterministic',passed:stateIntentKeyA===stateIntentKeyB&&stateIntentKeyA.length===64},{id:'mail-snooze-provider-write-capability-blocked',passed:mailStateActionSpec('snooze').capability==='unsupported'},
  {id:'mail-google-required-scope-contract',passed:MAIL_PROVIDER_SCOPES.google_gmail.length===4&&MAIL_PROVIDER_SCOPES.google_gmail.every(scope=>scope.startsWith('https://www.googleapis.com/auth/gmail.'))},
  {id:'mail-microsoft-required-scope-contract',passed:['Mail.Read','Mail.ReadWrite','Mail.Send'].every(scope=>MAIL_PROVIDER_SCOPES.microsoft_graph.includes(scope))}
 ];
};
