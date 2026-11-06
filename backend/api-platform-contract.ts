export type ApiPlatformCapability={id:string;status:'published'|'planned'|'forbidden';actor:'owner-session'|'machine-token'|'none';surface:string;descriptionUk:string;descriptionNl:string};
export const API_PLATFORM_VERSION='p4-connections';
export const API_PLATFORM_CAPABILITIES:ApiPlatformCapability[]=[
  {id:'identity.session.read',status:'published',actor:'owner-session',surface:'/access',descriptionUk:'Читати власний контракт доступу з owner-сесії.',descriptionNl:'Het eigen toegangscontract lezen vanuit de owner-sessie.'},
  {id:'identity.me.read',status:'published',actor:'machine-token',surface:'/api/v1/me',descriptionUk:'Machine token читає owner id та власні scopes через GET /api/v1/me.',descriptionNl:'Machinetoken leest owner-id en eigen scopes via GET /api/v1/me.'},
  {id:'vault.owner.manage',status:'published',actor:'owner-session',surface:'/vault',descriptionUk:'Owner-сесія зберігає, перейменовує і видаляє інтеграційні секрети. Значення в UI не повертається.',descriptionNl:'Owner-sessie slaat integratiegeheimen op, hernoemt en verwijdert ze. De waarde keert niet terug in de UI.'},
  {id:'connections.owner.read',status:'published',actor:'owner-session',surface:'/connections',descriptionUk:'Owner-сесія читає реєстр підключень і next step картки. Google — лише посилання на наявний конектор.',descriptionNl:'Owner-sessie leest het koppelingenregister en de volgende stap per kaart. Google is alleen een verwijzing naar de bestaande connector.'},
  {id:'mail.read',status:'planned',actor:'machine-token',surface:'/access',descriptionUk:'Машинне читання пошти. Scope ще не видається у PAT.',descriptionNl:'Machinelezen van e-mail. Scope wordt nog niet in PAT uitgegeven.'},
  {id:'calendar.read',status:'planned',actor:'machine-token',surface:'/access',descriptionUk:'Машинне читання календаря. Scope ще не видається у PAT.',descriptionNl:'Machinelezen van de agenda. Scope wordt nog niet in PAT uitgegeven.'},
  {id:'files.metadata.read',status:'planned',actor:'machine-token',surface:'/access',descriptionUk:'Машинне читання метаданих файлів. Scope ще не видається у PAT.',descriptionNl:'Machinelezen van bestandsmetadata. Scope wordt nog niet in PAT uitgegeven.'},
  {id:'site.deploy',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Деплой сайту через зовнішній API заборонено.',descriptionNl:'Site-deploy via externe API is verboden.'},
  {id:'source.write',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Запис у source через зовнішній API заборонено.',descriptionNl:'Source-write via externe API is verboden.'},
  {id:'vault.write',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Запис у сховище секретів через machine token заборонено.',descriptionNl:'Schrijven naar de geheimenkluis via een machinetoken is verboden.'},
  {id:'device.command',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Команди Smart Home/ІoT через зовнішній API заборонені.',descriptionNl:'Smart Home-/IoT-commando’s via externe API zijn verboden.'}
];
export function apiPlatformContractPayload(user:{id:string;email:string;role:string},extras:{tokenCount?:number;vaultCount?:number;vaultReady?:boolean;connectionsConfigured?:number}={}){
  const tokenCount=Math.max(0,Number(extras.tokenCount||0));
  const vaultCount=Math.max(0,Number(extras.vaultCount||0));
  const connectionsConfigured=Math.max(0,Number(extras.connectionsConfigured||0));
  return{
    version:API_PLATFORM_VERSION,
    tokenIssuance:'hash-only' as const,
    tokenCount,
    vaultCount,
    vaultReady:Boolean(extras.vaultReady),
    vaultEnabled:true,
    connectionsEnabled:true,
    connectionsConfigured,
    createTokenEnabled:true,
    machineTokensIssued:tokenCount>0,
    writeScopesEnabled:false,
    publicBasePath:'/api/v1',
    publicBasePathStatus:'live' as const,
    actors:[
      {id:'owner-session',status:'active',noteUk:'Браузерна owner-сесія. Create/list/revoke PAT лише тут.',noteNl:'Browsersessie van de eigenaar. PAT aanmaken/lijsten/intrekken alleen hier.'},
      {id:'machine-token',status:'issuable',noteUk:'PAT tsv_... Bearer лише для /api/v1. Plaintext показується один раз.',noteNl:'PAT tsv_... Bearer alleen voor /api/v1. Plaintext wordt één keer getoond.'}
    ],
    capabilities:API_PLATFORM_CAPABILITIES,
    forbidden:API_PLATFORM_CAPABILITIES.filter(item=>item.status==='forbidden').map(item=>item.id),
    user:{id:user.id,email:user.email,role:user.role}
  };
}
