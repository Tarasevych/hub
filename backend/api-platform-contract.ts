export type ApiPlatformCapability={id:string;status:'published'|'planned'|'forbidden';actor:'owner-session'|'machine-token'|'none';surface:string;descriptionUk:string;descriptionNl:string};
export const API_PLATFORM_VERSION='p4-connections';
export const API_PLATFORM_LEES_VLAG='api-platform-lees-v1' as const;
export const API_PLATFORM_CAPABILITIES:ApiPlatformCapability[]=[
  {id:'identity.session.read',status:'published',actor:'owner-session',surface:'/access',descriptionUk:'Читати власний контракт доступу з сеансу власника.',descriptionNl:'Het eigen toegangscontract lezen vanuit de eigenaarssessie.'},
  {id:'identity.me.read',status:'published',actor:'machine-token',surface:'/api/v1/me',descriptionUk:'Машинний ключ доступу читає ідентифікатор власника та власні області через GET /api/v1/me.',descriptionNl:'Machinesleutel leest eigenaar-id en eigen scopes via GET /api/v1/me.'},
  {id:'vault.owner.manage',status:'published',actor:'owner-session',surface:'/vault',descriptionUk:'Сеанс власника зберігає, перейменовує і видаляє інтеграційні таємниці. Значення в інтерфейсі не повертається.',descriptionNl:'Eigenaarssessie slaat integratiegeheimen op, hernoemt en verwijdert ze. De waarde keert niet terug in de interface.'},
  {id:'connections.owner.read',status:'published',actor:'owner-session',surface:'/connections',descriptionUk:'Сеанс власника читає реєстр підключень і наступний крок картки. Google — лише посилання на наявний з’єднувач.',descriptionNl:'Eigenaarssessie leest het koppelingenregister en de volgende stap per kaart. Google is alleen een verwijzing naar de bestaande koppeling.'},
  {id:'mail.read',status:'published',actor:'machine-token',surface:'/api/v1/mail/messages',descriptionUk:'Машинне читання пошти власника у приватному просторі через GET /api/v1/mail/messages.',descriptionNl:'Machinelezen van e-mail van de eigenaar in de privéruimte via GET /api/v1/mail/messages.'},
  {id:'calendar.read',status:'published',actor:'machine-token',surface:'/api/v1/calendar/events',descriptionUk:'Машинне читання подій календаря у приватному просторі через GET /api/v1/calendar/events.',descriptionNl:'Machinelezen van agenda-afspraken in de privéruimte via GET /api/v1/calendar/events.'},
  {id:'files.metadata.read',status:'published',actor:'machine-token',surface:'/api/v1/files/metadata',descriptionUk:'Машинне читання метаданих файлів (без вмісту і шляхів зберігання) через GET /api/v1/files/metadata.',descriptionNl:'Machinelezen van bestandsmetadata (zonder inhoud en opslagpaden) via GET /api/v1/files/metadata.'},
  {id:'site.deploy',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Розгортання сайту через зовнішній програмний інтерфейс заборонено.',descriptionNl:'Site-uitrol via externe programmaverbinding is verboden.'},
  {id:'source.write',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Запис вихідного коду через зовнішній програмний інтерфейс заборонено.',descriptionNl:'Schrijven van broncode via externe programmaverbinding is verboden.'},
  {id:'vault.write',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Запис у сховище таємниць через машинний ключ доступу заборонено.',descriptionNl:'Schrijven naar de geheimenkluis via een machinesleutel is verboden.'},
  {id:'device.command',status:'forbidden',actor:'none',surface:'/access',descriptionUk:'Команди розумного дому та пристроїв через зовнішній програмний інтерфейс заборонені.',descriptionNl:'Opdrachten voor slimme woning en apparaten via externe programmaverbinding zijn verboden.'}
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
