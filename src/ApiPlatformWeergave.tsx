import {useCallback,useEffect,useMemo,useState} from 'react';
import {KeyRound,Layers,Lock,Plug,Plus,RefreshCw,ShieldAlert,ShieldCheck,Sparkles} from 'lucide-react';
import {verborgenVoorAi} from './menselijke-actie'; // SEC-002 extensie-09 (g10a-3): eenmalige geheimen leest de AI-extensie niet
import IntegratieStrook from './integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import {useCatalogusV2} from './integraties/catalogus-vlag';
import {useVlag} from './functievlag-lezen';
import {api} from './platform/client';
import {API_PLATFORM_LEES_VLAG,API_PLATFORM_VERSION,apiPlatformContractPayload,type ApiPlatformCapability} from './api-platform-contract';
import {ecosystemTabContext} from './tab-context';
import {VaultMetaBewerker,VaultMetaRegel} from './KluisMeta';
import type {VaultMeta,VaultStaat} from '../shared/kluis-meta';
import {DOEL_INFO,isVaultDoel,type VaultDoel} from '../shared/geheimen';
// Kluisinvoer loopt via het canonieke GeheimFormulier (GeheimInvoer met schermtoetsenbord).
import {GeheimFormulier} from './geheimen/GeheimFormulier';
import {foutTekst,kies} from './geheimen/hulp';
import {canonicalNavigationUrl,serviceIds,type TargetService} from './canoniek-navigatie';
import {MaquetteAnkerRail,MaquetteHeld,abonneerOpenLaag,type MaquetteAnkerItem,type MaquetteHeldStatistiek} from './maquette-kern';
import {useIsMaquette} from './thema/useThema';
import './api-platform-weergave.css';
import './api-sleutels-maquette.css';
import './api-sleutels-klassiek.css';
type Tr=(uk:string,nl:string)=>string;
type ApiActieveTab='access'|'vault'|'verbindingen';
type Contract=ReturnType<typeof apiPlatformContractPayload>;
type TokenItem={id:string;prefix:string;display:string;scopes:string[];label:string;createdAt:number;expiresAt:number;lastUsedAt:number|null;revokedAt:number|null;status:'active'|'expired'|'revoked'};
type VaultItem={id:string;name:string;purpose:string;usedBy:string;updatedAt:number;createdAt:number;hasValue:boolean;meta?:VaultMeta;staat?:VaultStaat};
type ConnectionItem={id:string;kind:'google-link'|'vault-secret';labelUk:string;labelNl:string;noteUk:string;noteNl:string;status:'not_connected'|'configured'|'error'|'revoked';source:string;hasVaultSecret:boolean;vaultName:string;lastError:string;nextStep:{href:string;labelUk:string;labelNl:string};canMarkStatus:boolean;oauthSecondPass:boolean};
const LEES_SCOPES_KEUZES:ReadonlyArray<{id:string;pad:string;uk:string;nl:string;toelichtingUk:string;toelichtingNl:string}>=[
  {id:'identity.me.read',pad:'/api/v1/me',uk:'Профіль ключа (identity.me.read)',nl:'Sleutelprofiel (identity.me.read)',toelichtingUk:'Читає ідентифікатор власника та видані області.',toelichtingNl:'Leest eigenaar-id en verleende scopes.'},
  {id:'mail.read',pad:'/api/v1/mail/messages',uk:'Читання пошти (mail.read)',nl:'E-mail lezen (mail.read)',toelichtingUk:'Лише читання тем і коротких уривків у приватному просторі.',toelichtingNl:'Alleen lezen van onderwerpen en korte fragmenten in de privéruimte.'},
  {id:'calendar.read',pad:'/api/v1/calendar/events',uk:'Читання календаря (calendar.read)',nl:'Agenda lezen (calendar.read)',toelichtingUk:'Лише читання подій календаря у приватному просторі.',toelichtingNl:'Alleen lezen van agenda-afspraken in de privéruimte.'},
  {id:'files.metadata.read',pad:'/api/v1/files/metadata',uk:'Метадані файлів (files.metadata.read)',nl:'Bestandsmetadata (files.metadata.read)',toelichtingUk:'Назви, розмір і контрольна сума SHA-256 без вмісту файлів.',toelichtingNl:'Namen, grootte en SHA-256-controlesom zonder bestandsinhoud.'}
];
const canoniekeStapHref=(rawHref:string,lang:'uk'|'nl'):string=>{
  if(!rawHref)return rawHref;
  try{
    const base=typeof location!=='undefined'&&location.origin?location.origin:'https://api.tarasevych.com';
    const u=new URL(rawHref,base);
    const service=u.searchParams.get('service');
    const tabParam=u.searchParams.get('tab')||'';
    if(service&&(serviceIds as readonly string[]).includes(service)){
      return canonicalNavigationUrl(service as TargetService,tabParam,lang);
    }
  }catch{/* лишаємо вихідну адресу при некоректному URL */}
  return rawHref;
};
const API_MODAAL_SELECTOR=".venster-achter, .venster:not([hidden]), .afv-laag, [data-mq-laag-open='1'], dialog[open], [role='dialog'][aria-modal='true']";
const API_HELD_TEKSTEN:Record<ApiActieveTab,{
  boven:readonly[string,string];
  voor:readonly[string,string];
  cursief:readonly[string,string];
  beschrijving:readonly[string,string];
  primair:{tab:ApiActieveTab;label:readonly[string,string]};
  secundair:{tab:ApiActieveTab;label:readonly[string,string]};
}>={
  access:{
    boven:['ПРОГРАМНИЙ КОНТУР · API.TARASEVYCH.COM','PROGRAMMATISCHE POORT · API.TARASEVYCH.COM'],
    voor:['Машинні ключі та','Machinesleutels en'],
    cursief:['виважені межі прав.','afgebakende rechten.'],
    beschrijving:[
      'Захищений програмний вхід до маєтку: ключі доступу зберігаються лише як незворотний відбиток, видають чітко окреслені права читання й миттєво відкликаються власником.',
      'Beveiligde programmatische toegang tot het domein: toegangssleutels worden uitsluitend als onomkeerbare vingerafdruk bewaard, verlenen strikt afgebakende leesrechten en zijn direct intrekbaar door de eigenaar.'
    ],
    primair:{tab:'vault',label:['Сховище таємниць','Geheimenkluis']},
    secundair:{tab:'verbindingen',label:['Реєстр підключень','Koppelingenregister']}
  },
  vault:{
    boven:['ЗАШИФРОВАНЕ СХОВИЩЕ · API.TARASEVYCH.COM','VERSLEUTELDE KLUIS · API.TARASEVYCH.COM'],
    voor:['Таємниці власника під','Eigenaarsgeheimen achter'],
    cursief:['захистом AES-256-GCM.','AES-256-GCM-slot.'],
    beschrijving:[
      'Окреме зашифроване сховище ключів власника: відкрите значення ніколи не повертається у вікно оглядача після збереження і зчитується лише серверною частиною з’єднувача.',
      'Afzonderlijke versleutelde kluis voor sleutels van de eigenaar: na opslaan keert de open waarde nooit terug in het browservenster en leest uitsluitend de serverzijde van de koppeling.'
    ],
    primair:{tab:'verbindingen',label:['Реєстр підключень','Koppelingenregister']},
    secundair:{tab:'access',label:['Машинні ключі','Machinesleutels']}
  },
  verbindingen:{
    boven:['ЗОВНІШНІ СИСТЕМИ · API.TARASEVYCH.COM','EXTERNE SYSTEMEN · API.TARASEVYCH.COM'],
    voor:['Узгоджений реєстр','Afgestemd register van'],
    cursief:['зовнішніх з’єднань.','externe koppelingen.'],
    beschrijving:[
      'Прозорий перелік зовнішніх систем без повторного входу OAuth: кожна картка веде до точного наступного кроку та відображає живий стан підключення.',
      'Overzichtelijke lijst van externe systemen zonder dubbele OAuth-aanmelding: elke kaart opent de concrete volgende stap en toont de actuele koppelingsstaat.'
    ],
    primair:{tab:'vault',label:['Сховище таємниць','Geheimenkluis']},
    secundair:{tab:'access',label:['Машинні ключі','Machinesleutels']}
  }
};
const fallback=():Contract=>apiPlatformContractPayload({id:'',email:'',role:''});
const sessionBody=()=>({service:'api',tabContext:ecosystemTabContext(),sourceOrigin:location.origin});
const statusLabel=(status:ApiPlatformCapability['status'],tr:Tr)=>status==='published'?tr('Опубліковано','Gepubliceerd'):status==='planned'?tr('Заплановано','Gepland'):tr('Заборонено','Verboden');
const connectionStatusLabel=(status:ConnectionItem['status'],tr:Tr)=>status==='configured'?tr('Налаштовано','Geconfigureerd'):status==='error'?tr('Помилка','Fout'):status==='revoked'?tr('Відкликано','Ingetrokken'):tr('Не підключено','Niet gekoppeld');
const when=(value:number|null)=>value?new Date(value).toLocaleString():'—';
const apiFout=(e:unknown)=>String((e as {response?:{data?:{error?:unknown;reasonCode?:unknown}};message?:unknown})?.response?.data?.error||(e as {response?:{data?:{reasonCode?:unknown}}})?.response?.data?.reasonCode||(e as {message?:unknown})?.message||'');
export default function ApiPlatformView({tab,tr}:{tab:string;tr:Tr}){
  const isMaquette=useIsMaquette();
  const catalogusV2Aan=useCatalogusV2()===true;
  const apiLeesVlagAan=useVlag('api-platform-lees-v1',false);
  const zichtbareLeesScopes=useMemo(()=>apiLeesVlagAan?LEES_SCOPES_KEUZES:LEES_SCOPES_KEUZES.filter(k=>k.id==='identity.me.read'),[apiLeesVlagAan]);
  const actieveTab:ApiActieveTab=tab==='vault'?'vault':tab==='verbindingen'?'verbindingen':'access';
  const[actiefAnker,setActiefAnker]=useState<string>(() => actieveTab==='vault'?'api-vault-panel':actieveTab==='verbindingen'?'api-connections-panel':'api-access-panel');
  const[laagOpen,setLaagOpen]=useState(false);
  const[contract,setContract]=useState<Contract>(fallback);
  const[tokens,setTokens]=useState<TokenItem[]>([]);
  const[vault,setVault]=useState<VaultItem[]>([]);
  const[connections,setConnections]=useState<ConnectionItem[]>([]);
  const[vaultReady,setVaultReady]=useState(false);
  const[plaintext,setPlaintext]=useState('');
  const[gekozenScopes,setGekozenScopes]=useState<string[]>(['identity.me.read']);
  const[laatstUitgegevenScopes,setLaatstUitgegevenScopes]=useState<string[]>(['identity.me.read']);
  const lang=tr('uk','nl')==='uk'?'uk' as const:'nl' as const;
  const gaNaarApiTab=useCallback((doelTab:string)=>{
    location.assign(canonicalNavigationUrl('api',doelTab,lang));
  },[lang]);
  useEffect(()=>{
    setActiefAnker(actieveTab==='vault'?'api-vault-panel':actieveTab==='verbindingen'?'api-connections-panel':'api-access-panel');
  },[actieveTab]);
  const springNaarSectie=useCallback((id:string)=>{
    setActiefAnker(id);
    const el=document.getElementById(id);
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  },[]);
  useEffect(()=>{
    if(!isMaquette||typeof document==='undefined'){
      setLaagOpen(false);
      return;
    }
    return abonneerOpenLaag(API_MODAAL_SELECTOR,setLaagOpen,{
      wortel:'documentElement',
      attributeFilter:['open','hidden','class','aria-modal','data-mq-laag-open']
    });
  },[isMaquette,actieveTab]);
  const beginDoel=useMemo<VaultDoel>(()=>{
    try{const d=new URLSearchParams(location.search).get('doel');if(isVaultDoel(d))return d;}catch{/* ignore */}
    return 'github-oauth';
  },[tab]);
  const[renameDraft,setRenameDraft]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    const[contractRes,tokenRes,vaultRes,connectionRes]=await Promise.all([
      api.post('/api/owner/api-platform/contract',sessionBody()),
      api.post('/api/owner/api-platform/tokens',sessionBody()),
      api.post('/api/owner/api-platform/vault',sessionBody()),
      api.post('/api/owner/api-platform/connections',sessionBody())
    ]);
    if(contractRes?.data)setContract({...fallback(),...contractRes.data,writeScopesEnabled:false,version:API_PLATFORM_VERSION});
    if(Array.isArray(tokenRes?.data?.items))setTokens(tokenRes.data.items);
    if(Array.isArray(vaultRes?.data?.items))setVault(vaultRes.data.items);
    if(Array.isArray(connectionRes?.data?.items))setConnections(connectionRes.data.items);
    setVaultReady(Boolean(vaultRes?.data?.encryptionReady||contractRes?.data?.vaultReady));
  },[]);
  useEffect(()=>{let active=true;void load().catch(()=>{if(active){setContract(fallback());setTokens([]);setVault([]);setConnections([]);}});return()=>{active=false};},[tab,load]);
  const capabilities=contract.capabilities||[];
  const forbidden=contract.forbidden?.length?contract.forbidden:capabilities.filter(item=>item.status==='forbidden').map(item=>item.id);
  const liveCount=tokens.filter(item=>item.status==='active').length;
  const versleutelStaat=vaultReady?tr('Готове','Gereed'):tr('Очікує','Wacht');
  const statistieken=useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(()=>[
    {waarde:liveCount,label:lang==='uk'?'Живих ключів':'Actieve sleutels'},
    {waarde:vault.length,label:lang==='uk'?'Таємниць у сховищі':'Geheimen in kluis'},
    {waarde:connections.length,label:lang==='uk'?'Зовнішніх з’єднань':'Externe koppelingen'},
    {waarde:versleutelStaat,label:lang==='uk'?'Шифрування сховища':'Kluisversleuteling'}
  ],[connections.length,lang,liveCount,vault.length,versleutelStaat]);
  const held=API_HELD_TEKSTEN[actieveTab];
  const wisselScope=(scopeId:string)=>{
    setGekozenScopes(huidig=>{
      const heeft=huidig.includes(scopeId);
      const volgende=heeft?huidig.filter(s=>s!==scopeId):[...huidig,scopeId];
      return volgende.length?volgende:['identity.me.read'];
    });
  };
  const create=useCallback(async()=>{if(busy)return;setBusy(true);setNotice('');try{const toegestaan=gekozenScopes.filter(s=>apiLeesVlagAan||s==='identity.me.read');const scopes=toegestaan.length?toegestaan:['identity.me.read'];const response=await api.post('/api/owner/api-platform/tokens/create',{...sessionBody(),label:tr('Ключ API','API-sleutel'),scopes,expiresInDays:90});const key=String(response?.data?.plaintext||'');if(!key)throw new Error('empty');setPlaintext(key);setLaatstUitgegevenScopes(Array.isArray(response?.data?.item?.scopes)?response.data.item.scopes:scopes);setNotice(tr('Ключ показано один раз. Скопіюйте зараз. Сервер зберіг лише незворотний відбиток.','Sleutel één keer getoond. Kopieer nu. De server bewaart alleen de onomkeerbare vingerafdruk.'));await load();}catch{setNotice(tr('Не вдалося створити ключ.','Sleutel aanmaken mislukt.'))}setBusy(false);},[apiLeesVlagAan,busy,gekozenScopes,load,tr]);
  const ankerItems=useMemo<ReadonlyArray<MaquetteAnkerItem>>(()=>{
    const ververs:MaquetteAnkerItem={id:'api-actie-vernieuw',label:tr('Оновити дані','Gegevens verversen'),icoon:RefreshCw,soort:'actie',onActie:()=>void load()};
    if(actieveTab==='vault'){
      return[
        {
          id:'groep-api-vault',
          label:tr('Сховище таємниць','Geheimenkluis'),
          icoon:Lock,
          soort:'groep',
          openStandaard:true,
          kiesbaar:false,
          kinderen:[
            {id:'api-vault-panel',label:tr('Додавання секрету','Geheim toevoegen'),icoon:Plus},
            {id:'api-vault-list',label:tr('Збережені секрети','Bewaarde geheimen'),icoon:ShieldCheck,badge:vault.length||undefined}
          ]
        },
        {
          id:'groep-api-acties',
          label:tr('Швидкі дії','Snelle acties'),
          icoon:Sparkles,
          soort:'groep',
          openStandaard:true,
          kiesbaar:false,
          kinderen:[
            {
              id:'api-actie-focus-kluis',
              label:tr('Новий секрет','Nieuw geheim'),
              icoon:Plus,
              soort:'actie',
              onActie:()=>{
                const el=document.getElementById('api-vault-panel');
                el?.scrollIntoView({behavior:'smooth',block:'start'});
                el?.querySelector<HTMLElement>('input, select, button')?.focus();
              }
            },
            ververs
          ]
        }
      ];
    }
    if(actieveTab==='verbindingen'){
      const kinderen:MaquetteAnkerItem[]=[
        {id:'api-connections-panel',label:tr('Реєстр підключень','Koppelingenregister'),icoon:Plug,badge:connections.length||undefined}
      ];
      if(catalogusV2Aan){
        kinderen.push({id:'api-integrations-strip',label:tr('Стрічка з’єднань','Koppelingsstrook'),icoon:Layers});
      }
      return[
        {
          id:'groep-api-verbindingen',
          label:tr('Зовнішні системи','Externe systemen'),
          icoon:Plug,
          soort:'groep',
          openStandaard:true,
          kiesbaar:false,
          kinderen
        },
        ververs
      ];
    }
    return[
      {
        id:'groep-api-access',
        label:tr('Програмний доступ','Programmatische toegang'),
        icoon:KeyRound,
        soort:'groep',
        openStandaard:true,
        kiesbaar:false,
        kinderen:[
          {id:'api-access-panel',label:tr('Машинні токени','Machinetokens'),icoon:KeyRound,badge:liveCount||undefined},
          {id:'api-capabilities-panel',label:tr('Можливості','Mogelijkheden'),icoon:ShieldCheck,badge:capabilities.length||undefined},
          {id:'api-forbidden-panel',label:tr('Заборонені права','Verboden scopes'),icoon:ShieldAlert,badge:forbidden.length||undefined}
        ]
      },
      {
        id:'groep-api-acties',
        label:tr('Швидкі дії','Snelle acties'),
        icoon:Sparkles,
        soort:'groep',
        openStandaard:true,
        kiesbaar:false,
        kinderen:[
          {id:'api-actie-maak-sleutel',label:tr('Створити ключ','Sleutel maken'),icoon:Plus,soort:'actie',onActie:()=>void create()},
          ververs
        ]
      }
    ];
  },[actieveTab,capabilities.length,catalogusV2Aan,connections.length,create,forbidden.length,liveCount,load,tr,vault.length]);
  const revoke=async(id:string)=>{if(busy||!window.confirm(tr('Відкликати ключ одразу?','Sleutel nu intrekken?')))return;setBusy(true);try{await api.post(`/api/owner/api-platform/tokens/${id}/revoke`,sessionBody());if(plaintext)setPlaintext('');await load();setNotice(tr('Ключ відкликано. Маршрути /api/v1/* більше його не приймуть.','Sleutel ingetrokken. De routes onder /api/v1/* weigeren hem direct.'))}catch{setNotice(tr('Не вдалося відкликати.','Intrekken mislukt.'))}setBusy(false);};
  const verify=async()=>{if(!plaintext||busy)return;setBusy(true);try{const response=await api.post('/api/owner/api-platform/tokens/verify',{...sessionBody(),plaintext});setNotice(tr(`Перевірка успішна. Ідентифікатор власника: ${response.data.ownerId}. Області: ${(response.data.scopes||[]).join(', ')}`,`Controle geslaagd. Eigenaar-id: ${response.data.ownerId}. Scopes: ${(response.data.scopes||[]).join(', ')}`));}catch{setNotice(tr('Ключ недійсний, прострочений або відкликаний.','Sleutel ongeldig, verlopen of ingetrokken.'))}setBusy(false);};
  const proefLeesPad=async(pad:string)=>{if(!plaintext||busy)return;setBusy(true);try{const res=await fetch(pad,{method:'GET',headers:{Authorization:`Bearer ${plaintext}`}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(String((data as {error?:unknown})?.error||res.status));const aantal=typeof (data as {count?:unknown})?.count==='number'?Number((data as {count?:number}).count):null;setNotice(aantal!==null?tr(`Читання ${pad} успішне: записів у приватному просторі — ${aantal}.`,`Lezen van ${pad} geslaagd: ${aantal} items in de privéruimte.`):tr(`Читання ${pad} успішне.`,`Lezen van ${pad} geslaagd.`));}catch(e){const foutCode=String((e as Error)?.message||'');setNotice(`${tr(`Читання ${pad} відхилено: `,`Lezen van ${pad} geweigerd: `)}${foutCode}`);}setBusy(false);};
  const renameVault=async(id:string)=>{const name=String(renameDraft[id]||'').trim();if(busy||!name)return;setBusy(true);try{const response=await api.post(`/api/owner/api-platform/vault/${id}/rename`,{...sessionBody(),name});if(response?.data?.plaintext||response?.data?.value)throw new Error('leak');await load();setNotice(tr('Назву оновлено. Значення лишилось зашифрованим.','Naam bijgewerkt. De waarde blijft versleuteld.'));}catch(e){setNotice(`${tr('Не вдалося перейменувати: ','Hernoemen mislukt: ')}${foutTekst(apiFout(e),lang)}`)}setBusy(false);};
  const deleteVault=async(id:string,name:string)=>{if(busy||!window.confirm(tr(`Видалити секрет «${name}» без відновлення?`,`Geheim «${name}» definitief verwijderen?`)))return;setBusy(true);try{await api.post(`/api/owner/api-platform/vault/${id}/delete`,sessionBody());await load();setNotice(tr('Секрет видалено.','Geheim verwijderd.'));}catch(e){setNotice(`${tr('Не вдалося видалити: ','Verwijderen mislukt: ')}${foutTekst(apiFout(e),lang)}`)}setBusy(false);};
  const markConnection=async(id:string,status:ConnectionItem['status'])=>{if(busy)return;setBusy(true);try{await api.post(`/api/owner/api-platform/connections/${id}/status`,{...sessionBody(),status});await load();setNotice(tr('Статус підключення оновлено.','Koppelingsstatus bijgewerkt.'));}catch{setNotice(tr('Не вдалося оновити статус.','Status bijwerken mislukt.'))}setBusy(false);};
  const heading=tab==='vault'?tr('Сховище секретів','Geheimenkluis'):tab==='verbindingen'?tr('Реєстр підключень','Koppelingenregister'):tab==='access'?tr('API-доступ','API-toegang'):tr('API та інтеграції','API en integraties');
  const railTitel=actieveTab==='vault'?tr('Розділи сховища','Kluisonderdelen'):actieveTab==='verbindingen'?tr('Навігація підключень','Koppelingennavigatie'):tr('Розділи доступу','Toegangsonderdelen');
  return <section className={isMaquette?'api-platform mq-schil':'api-platform'} data-mq-dienst={isMaquette?'api':undefined} data-api-platform={API_PLATFORM_VERSION} data-api-tab={tab} data-api-token-count={String(liveCount)} data-api-create-token='enabled' data-api-vault={vaultReady?'ready':'blocked'} data-api-connections={String(connections.length)}>
    {isMaquette&&!laagOpen?(
      <MaquetteAnkerRail
        lang={lang}
        titel={railTitel}
        ondertitel='api.tarasevych.com'
        items={ankerItems}
        actief={actiefAnker}
        onKies={springNaarSectie}
        opslagSleutel={`api-${actieveTab}`}
      />
    ):null}
    {isMaquette?(
      <MaquetteHeld
        key={`api-held-${actieveTab}`}
        id='api-maquette-held'
        dienst='api'
        lang={lang}
        modus={actieveTab==='access'?'volledig':'compact'}
        opslagSleutel={`api-${actieveTab}`}
        bovenregel={tr(held.boven[0],held.boven[1])}
        titelVoor={tr(held.voor[0],held.voor[1])}
        titelCursief={tr(held.cursief[0],held.cursief[1])}
        beschrijving={tr(held.beschrijving[0],held.beschrijving[1])}
        statistieken={statistieken}
        primair={{
          label:tr(held.primair.label[0],held.primair.label[1]),
          onClick:()=>gaNaarApiTab(held.primair.tab)
        }}
        secundair={{
          label:tr(held.secundair.label[0],held.secundair.label[1]),
          onClick:()=>gaNaarApiTab(held.secundair.tab)
        }}
      />
    ):null}
    <header>
      <h1>{heading}</h1>
      <p>{tab==='verbindingen'?tr('Картка відкриває конкретний наступний крок. Google identity / Gmail / Drive — лише посилання на наявний конектор, без другого OAuth. GitHub PAT окремо від UI github.tarasevych.com.','Elke kaart opent een concrete volgende stap. Google identity / Gmail / Drive verwijzen alleen naar de bestaande connector, zonder tweede OAuth. GitHub-PAT is los van de UI github.tarasevych.com.'):tr('PAT зберігається як hash. Інтеграційні секрети власника — окреме encrypted vault. Це не AppDeploy platform secrets. Значення після збереження в UI не повертається. Немає «показати секрет». Machine token не пише у vault.','PAT wordt als hash bewaard. Integratiegeheimen van de eigenaar zitten in een aparte encrypted vault. Dit zijn geen AppDeploy-platformgeheimen. Na opslaan keert de waarde niet terug in de UI. Er is geen «toon geheim». Een machinetoken schrijft niet naar de kluis.')}</p>
    </header>
    <nav className='api-platform-tabs' aria-label={tr('Розділи API','API-onderdelen')}>
      <a href={canonicalNavigationUrl('api','access',lang)} data-api-tab-link='access' aria-current={actieveTab==='access'?'page':undefined}>{tr('Доступ','Toegang')}</a>
      <a href={canonicalNavigationUrl('api','vault',lang)} data-api-tab-link='vault' aria-current={actieveTab==='vault'?'page':undefined}>{tr('Сховище секретів','Geheimenkluis')}</a>
      <a href={canonicalNavigationUrl('api','verbindingen',lang)} data-api-tab-link='verbindingen' aria-current={actieveTab==='verbindingen'?'page':undefined}>{tr('Підключення','Koppelingen')}</a>
    </nav>
    {tab!=='vault'&&tab!=='verbindingen'?<article id='api-access-panel' className='api-platform-panel' data-api-access-panel='true' data-vlag={API_PLATFORM_LEES_VLAG}>
      <strong>{tr('Машинні ключі доступу','Machinesleutels')}</strong>
      <div className='api-platform-meta'>
        <span data-api-token-count-value={String(liveCount)}>{tr('Живі ключі','Actieve sleutels')}: {liveCount}</span>
        <span>{tr('Базовий шлях /api/v1 активний','Basispad /api/v1 actief')}</span>
        <span>{tr('Області лише для читання (запис заборонено)','Alleen-lezen scopes (schrijven verboden)')}</span>
      </div>
      <fieldset className='api-platform-scopes' data-api-scope-kiezer='true'>
        <legend>{tr('Області читання для нового ключа','Leesscopes voor nieuwe sleutel')}</legend>
        {zichtbareLeesScopes.map(keuze=>(
          <label key={keuze.id} data-api-scope-optie={keuze.id}>
            <input
              type='checkbox'
              checked={gekozenScopes.includes(keuze.id)}
              disabled={busy}
              onChange={()=>wisselScope(keuze.id)}
            />
            <span><b>{tr(keuze.uk,keuze.nl)}</b> — <small>{tr(keuze.toelichtingUk,keuze.toelichtingNl)}</small></span>
          </label>
        ))}
      </fieldset>
      <button type='button' onClick={()=>void create()} disabled={busy} data-api-create-token-button='enabled'>{tr('Створити ключ','Sleutel maken')}</button>
      {plaintext?<div className='api-platform-secret' data-api-plaintext-once='true' {...verborgenVoorAi}>
        <code>{plaintext}</code>
        <div className='api-platform-secret-actions'>
          <button type='button' onClick={()=>void navigator.clipboard?.writeText(plaintext)}>{tr('Скопіювати','Kopiëren')}</button>
          <button type='button' onClick={()=>void verify()}>{tr('Перевірити /api/v1/me','/api/v1/me controleren')}</button>
          {zichtbareLeesScopes.filter(k=>k.id!=='identity.me.read'&&laatstUitgegevenScopes.includes(k.id)).map(k=>(
            <button key={k.id} type='button' onClick={()=>void proefLeesPad(k.pad)} disabled={busy}>{tr(`Перевірити ${k.pad}`,`${k.pad} testen`)}</button>
          ))}
          <button type='button' onClick={()=>setPlaintext('')}>{tr('Приховати','Verbergen')}</button>
        </div>
        <small>{tr('Цей рядок більше не з’явиться. Для машини: Authorization: Bearer tsv_...','Deze waarde verschijnt niet opnieuw. Voor machines: Authorization: Bearer tsv_...')}</small>
      </div>:null}
      <ul className='api-platform-tokens'>{tokens.map(item=><li key={item.id} data-api-token-id={item.id} data-api-token-status={item.status}>
        <div><code>{item.display}</code> · {item.label} · {item.scopes.join(', ')}</div>
        <small>{tr('Статус','Status')}: {item.status} · {tr('Діє до','Geldig tot')}: {when(item.expiresAt)} · {tr('Останнє використання','Laatst gebruikt')}: {when(item.lastUsedAt)}</small>
        {item.status==='active'?<button type='button' onClick={()=>void revoke(item.id)} disabled={busy}>{tr('Відкликати','Intrekken')}</button>:null}
      </li>)}</ul>
    </article>:null}
    {tab==='verbindingen'?<article id='api-connections-panel' className='api-platform-panel' data-api-connections-panel='true'>
      <strong>{tr('Зовнішні системи','Externe systemen')}</strong>
      <div className='api-platform-meta'>
        <span data-api-connections-count={String(connections.length)}>{tr('Карток','Kaarten')}: {connections.length}</span>
        <span>{tr('Налаштовано','Geconfigureerd')}: {connections.filter(item=>item.status==='configured').length}</span>
      </div>
      <ul className='api-platform-connections'>{connections.map(item=><li key={item.id} data-api-connection-id={item.id} data-api-connection-status={item.status} data-api-connection-kind={item.kind}>
        <div><strong>{tr(item.labelUk,item.labelNl)}</strong> · <span data-api-connection-badge={item.status}>{connectionStatusLabel(item.status,tr)}</span></div>
        <small>{tr(item.noteUk,item.noteNl)}{item.vaultName?` · vault: ${item.vaultName}`:''}{item.lastError?` · ${item.lastError}`:''}</small>
        <div className='api-platform-secret-actions'>
          <a href={canoniekeStapHref(item.nextStep.href,lang)} data-api-connection-next={item.id}>{tr(item.nextStep.labelUk,item.nextStep.labelNl)}</a>
          {item.canMarkStatus?<>
            <button type='button' onClick={()=>void markConnection(item.id,'error')} disabled={busy}>{tr('Помилка','Fout')}</button>
            <button type='button' onClick={()=>void markConnection(item.id,'revoked')} disabled={busy}>{tr('Відкликано','Ingetrokken')}</button>
            <button type='button' onClick={()=>void markConnection(item.id,item.hasVaultSecret?'configured':'not_connected')} disabled={busy}>{tr('Зняти позначку','Markering wissen')}</button>
          </>:null}
        </div>
      </li>)}</ul>
    </article>:null}
    {tab==='verbindingen'&&catalogusV2Aan?<div id='api-integrations-strip'><IntegratieStrook lang={lang} dienst='api' overslaan={['telegram']}/></div>:null}
    {tab==='vault'?<article id='api-vault-panel' className='api-platform-panel' data-api-vault-panel='true'>
      <strong>{tr('Encrypted vault власника','Encrypted eigenaarskluis')}</strong>
      <div className='api-platform-meta'>
        <span data-api-vault-count={String(vault.length)}>{tr('Секретів','Geheimen')}: {vault.length}</span>
        <span data-api-vault-ready={vaultReady?'yes':'no'}>{vaultReady?tr('Шифрування AES-256-GCM готове','AES-256-GCM-versleuteling klaar'):tr('Ключ шифрування недоступний','Versleutelingsleutel ontbreekt')}</span>
        <span>{tr('Читає лише backend конектора','Alleen connector-backend leest')}</span>
      </div>
      <GeheimFormulier
        lang={lang}
        beginDoel={beginDoel}
        vaultKlaar={vaultReady}
        context={sessionBody()}
        formulierNaam='api-kluis'
        onOpgeslagen={async ({ naam, rotated }) => {
          await load();
          setNotice(rotated
            ? tr(`Секрет «${naam}» оновлено й зашифровано. Значення в UI не повертається.`, `Geheim «${naam}» bijgewerkt en versleuteld. De waarde keert niet terug in de UI.`)
            : tr(`Секрет «${naam}» збережено зашифровано. Значення в UI не повертається.`, `Geheim «${naam}» versleuteld opgeslagen. De waarde keert niet terug in de UI.`));
        }}
      />
      <small>{tr('Після збереження поле очищується. Значення ніколи не передається відкритим текстом.', 'Na opslaan wordt het veld leeggemaakt. De waarde wordt nooit onversleuteld verzonden.')}</small>
      <ul id='api-vault-list' className='api-platform-tokens' data-api-vault-list='true'>{vault.map(item=><li key={item.id} data-api-vault-id={item.id} data-api-vault-name={item.name}>
        <div><code>{item.name}</code> · {isVaultDoel(item.purpose)?kies(lang,DOEL_INFO[item.purpose].naam):(item.usedBy||item.purpose)} · {tr('оновлено','bijgewerkt')} {when(item.updatedAt)}<VaultMetaRegel lang={lang} meta={item.meta} staat={item.staat}/><VaultMetaBewerker lang={lang} id={item.id} meta={item.meta} context={sessionBody()} onOpgeslagen={load}/></div>
        <div className='api-platform-secret-actions'>
          <input aria-label={tr('Нова назва','Nieuwe naam')} value={renameDraft[item.id]??item.name} onChange={event=>setRenameDraft(current=>({...current,[item.id]:event.target.value}))} />
          <button type='button' onClick={()=>void renameVault(item.id)} disabled={busy}>{tr('Перейменувати','Hernoemen')}</button>
          <button type='button' onClick={()=>void deleteVault(item.id,item.name)} disabled={busy}>{tr('Видалити','Verwijderen')}</button>
        </div>
      </li>)}</ul>
    </article>:null}
    {notice?<p data-api-notice='true'>{notice}</p>:null}
    {tab!=='verbindingen'&&tab!=='vault'?<article id='api-capabilities-panel' className='api-platform-table'>
      <strong>{tr('Можливості','Mogelijkheden')}</strong>
      <table>
        <thead><tr><th>ID</th><th>{tr('Статус','Status')}</th><th>{tr('Актор','Actor')}</th><th>{tr('Опис','Beschrijving')}</th></tr></thead>
        <tbody>{capabilities.map(item=><tr key={item.id} data-api-capability={item.id} data-api-capability-status={item.status}><td><code>{item.id}</code></td><td>{statusLabel(item.status,tr)}</td><td>{item.actor}</td><td>{tr(item.descriptionUk,item.descriptionNl)}</td></tr>)}</tbody>
      </table>
    </article>:null}
    {tab!=='verbindingen'&&tab!=='vault'?<article id='api-forbidden-panel' className='api-platform-forbidden' data-api-forbidden-scopes={forbidden.join(' ')}>
      <strong>{tr('Заборонені scope','Verboden scopes')}</strong>
      <ul>{forbidden.map(id=><li key={id}><code>{id}</code></li>)}</ul>
    </article>:null}
  </section>;
}
