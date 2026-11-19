import{lazy,Suspense,useCallback,useEffect,useMemo,useState}from'react';
const CloudM10Governance=lazy(()=>import('./cloud/CloudBeheerM6').then(m=>({default:m.CloudBeheerM6})));
const CLOUD_M10_STAGE=(import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_CLOUD_FULL_STAGING === 'enabled';
import{api}from'./platform/client';
import{Activity,Bot,CalendarDays,Check,ClipboardCheck,Clock,CopyCheck,Eye,Filter,Fingerprint,History,KeyRound,Layers,LayoutDashboard,Link2,ListChecks,Lock,MonitorSmartphone,Network,PackageCheck,Pause,Play,Plus,Radio,RefreshCw,Rocket,ScrollText,Search,Settings2,ShieldCheck,Stethoscope,TriangleAlert,Upload,UserCheck,Users,Wrench,X,type LucideIcon}from'lucide-react';
import'./beheer-console.css';
import'./beheer-kern-maquette.css';
import'./beheer-laden.css';
import{canonicalNavigationUrl}from'./canoniek-navigatie';
import{MaquetteAnkerRail,MaquetteHeld,abonneerOpenLaag,type MaquetteAnkerItem,type MaquetteHeldStatistiek}from'./maquette-kern';
import{useIsMaquette}from'./thema/useThema';
import StableAvatar from'./StabielAvatar';
import{groepeerVergelijkbareGebruikers,redenLabel,type GebruikersGroep,type GroepReden}from'../shared/gebruikers-groepering';
import AuditPagina from'./audit/AuditPagina';import AdminDiagnosticsView from'./BeheerDiagnostiekWeergave';import AdminOverviewView from'./BeheerOverzichtWeergave';import Integraties from'./integraties/Integraties';
import AdminAiBeleidView from'./BeheerAiBeleidWeergave';import Geheimen from'./geheimen/Geheimen';import AdminUitrolView from'./BeheerUitrolWeergave';import{Term,fieldLabel}from'./beheer-termen';
import HulpVraag from'./hulp/HulpVraag';
import{useTelegramVlag}from'./telegram-aanmelden/vlag';
import{useApparaatVlag}from'./apparaat-bevestiging/vlag'; /* APPARAAT-001 */
const TelegramBeheer=lazy(()=>import('./telegram-aanmelden/TelegramBeheer')); /* TELEGRAM-AANMELDEN v1: onder «Система єдиного входу», alleen met vlag */
const ApparaatBeheer=lazy(()=>import('./apparaat-bevestiging/BeheerSectie')); /* APPARAAT-001: onder «Єдиний вхід», alleen met vlag apparaat-bevestiging-v1 */
type Lang='uk'|'nl';
type AdminRole='super_admin'|'security_admin'|'apps_admin'|'directory_admin'|'support_viewer'|'none';
const ADMIN_TABS=['overview','access','ai','apps','devices','sso','directories','roles','diagnostics','audit','contour','updates']as const;
type AdminTabId=typeof ADMIN_TABS[number];
const isAdminTab=(waarde:string):waarde is AdminTabId=>(ADMIN_TABS as readonly string[]).includes(waarde);
const ADMIN_MODAAL_SELECTOR='.admin-key-dialog, .ov-modal-schaduw, .ut-modal-schaduw, .ut-vr-scrim, .il-modal, .aj-schaduw, .venster-achter, .venster:not([hidden]), .aib-keuze, [data-mq-laag-open="1"], dialog[open], [role="dialog"][aria-modal="true"]';
const ADMIN_RAIL_TITEL_PER_TAB:Record<AdminTabId,readonly[string,string]>={
  overview:['Розділи огляду','Onderdelen van het overzicht'],
  access:['Учасники й доступ','Deelnemers en toegang'],
  ai:['Політика доступу ШІ','AI-toegangsbeleid'],
  apps:['Додатки й політика','Apps en beleid'],
  devices:['Події пристроїв','Apparaatgebeurtenissen'],
  sso:['Єдиний вхід','Eenmalige aanmelding'],
  directories:['Інтеграції й каталоги','Integraties en mappen'],
  roles:['Розподіл ролей','Rollenverdeling'],
  diagnostics:['Розділи діагностики','Onderdelen van diagnostiek'],
  audit:['Фільтри й журнал','Filters en logboek'],
  contour:['Таємниці й ключі','Geheimen en sleutels'],
  updates:['Розділи оновлень','Onderdelen van updates'],
};
const ADMIN_RAIL_SUB:readonly[string,string]=['Перетягніть до зручного краю','Sleep naar een gewenste rand'];
const ADMIN_STAT_LABELS={users:['Користувачі','Gebruikers']as const,sessions:['Активні сеанси','Actieve sessies']as const,devices:['Пристрої у пам’яті','Onthouden apparaten']as const,audit:['Події аудиту','Auditgebeurtenissen']as const};
const ADMIN_ANKER_TABS:ReadonlyArray<readonly[AdminTabId,string,string,LucideIcon]>=[
  ['overview','Огляд','Overzicht',LayoutDashboard],
  ['access','Доступ і люди','Toegang en personen',Users],
  ['ai','Доступ ШІ','AI-toegang',Bot],
  ['apps','Додатки та вхід','Toepassingen',Link2],
  ['devices','Пристрої','Apparaten',MonitorSmartphone],
  ['sso','Єдиний вхід','Eenmalige aanmelding',KeyRound],
  ['directories','Інтеграції й каталоги','Integraties en mappen',Network],
  ['roles','Ролі','Rollen',ShieldCheck],
  ['diagnostics','Діагностика','Diagnostiek',Activity],
  ['audit','Аудит','Audit',ScrollText],
  ['contour','Контур і таємниці','Omgeving en geheimen',Lock],
  ['updates','Оновлення','Uitgaven',Rocket],
];
const ADMIN_HELD_TEKSTEN:Record<AdminTabId,{boven:readonly[string,string];voor:readonly[string,string];cursief:readonly[string,string];beschrijving:readonly[string,string];status:readonly[string,string];primair:{tab:AdminTabId;label:readonly[string,string]};secundair:{tab:AdminTabId;label:readonly[string,string]}}>={
  overview:{boven:['КОНСОЛЬ КЕРУВАННЯ · ADMIN.TARASEVYCH.COM','BEHEERCONSOLE · ADMIN.TARASEVYCH.COM'],voor:['Наглядовий контур','Bestuurlijke kern'],cursief:['власного простору.','van uw eigen ruimte.'],beschrijving:['Єдиний рубіновий пульт повноважень, політик входу, прав штучного інтелекту, зовнішніх підключень і незмінного журналу подій вашого приватного маєтку.','Het centrale robijnrode besturingspaneel voor bevoegdheden, aanmeldbeleid, rechten van kunstmatige intelligentie, koppelingen en het onveranderlijke gebeurtenissenregister.'],status:['Захищений контур власника','Beschermde eigenaarsomgeving'],primair:{tab:'access',label:['Користувачі та запити','Gebruikers en aanvragen']},secundair:{tab:'ai',label:['Політика доступу ШІ','Toegangsbeleid voor AI']}},
  access:{boven:['ДОСТУП І УЧАСНИКИ · ADMIN.TARASEVYCH.COM','TOEGANG EN DEELNEMERS · ADMIN.TARASEVYCH.COM'],voor:['Люди, запити та','Personen, aanvragen en'],cursief:['межі участі.','deelnamegrenzen.'],beschrijving:['Розгляд нових звернень на вхід, призначення робочих рівнів, індивідуальні права на інженерний міст і прозора історія облікових записів із захистом власника.','Beoordeling van nieuwe toegangsverzoeken, toekenning van werkniveaus, individuele rechten voor de technische brug en inzichtelijke accountgeschiedenis met eigenaarsbescherming.'],status:['Власника захищено від змін','Eigenaar beschermd tegen wijziging'],primair:{tab:'roles',label:['Адміністративні ролі','Beheerdersrollen']},secundair:{tab:'audit',label:['Журнал рішень','Besluitenregister']}},
  ai:{boven:['ПРАВА ПОМІЧНИКІВ · ADMIN.TARASEVYCH.COM','ASSISTENTENRECHTEN · ADMIN.TARASEVYCH.COM'],voor:['Керовані межі для','Beheerste grenzen voor'],cursief:['штучного інтелекту.','kunstmatige intelligentie.'],beschrijving:['Виважене налаштування дозволів кожного агента за правилом найменших повноважень: тимчасові вікна дії, запит підтвердження щоразу та обов’язковий підпис ключем доступу.','Zorgvuldige afstemming van de rechten per assistent volgens minimale bevoegdheid: tijdelijke vensters, telkens bevestiging vragen en verplichte ondertekening met toegangssleutel.'],status:['Зміни чинні лише за підписом','Wijzigingen gelden pas na handtekening'],primair:{tab:'updates',label:['Оновлення платформи','Platformuitgaven']},secundair:{tab:'audit',label:['Перевірити журнал','Logboek inzien']}},
  apps:{boven:['ЗОВНІШНІ ДОДАТКИ · ADMIN.TARASEVYCH.COM','EXTERNE TOEPASSINGEN · ADMIN.TARASEVYCH.COM'],voor:['Правила довіри для','Vertrouwensregels voor'],cursief:['зовнішніх клієнтів.','externe klanten.'],beschrijving:['Визначення типового рішення для сторонніх програм, огляд дозволених меж доступу та непорушний захист основного клієнта посвідчення особи.','Vastlegging van de standaardbeslissing voor externe programma’s, overzicht van verleende reikwijdtes en onschendbare bescherming van de kernclient voor identiteit.'],status:['Ядро особи захищено','Identiteitskern beschermd'],primair:{tab:'sso',label:['Єдиний вхід','Eenmalige aanmelding']},secundair:{tab:'directories',label:['Каталог інтеграцій','Integratiecatalogus']}},
  devices:{boven:['ПОДІЇ ПРИСТРОЇВ · ADMIN.TARASEVYCH.COM','APPARAATGEBEURTENISSEN · ADMIN.TARASEVYCH.COM'],voor:['Справжні сліди сеансів','Werkelijke sessiesporen'],cursief:['і дозволів оглядача.','en browsertoestemmingen.'],beschrijving:['Достовірний перелік входів, середовищ та стану відповідності пристроїв без жодних вигаданих показників непідключених зовнішніх служб нагляду.','Betrouwbaar overzicht van aanmeldingen, besturingssystemen en nalevingsstatus per apparaat zonder verzonnen meldingen van niet-gekoppelde bewakingsdiensten.'],status:['Лише підтверджені записи','Uitsluitend bevestigde registraties'],primair:{tab:'audit',label:['Повний аудит','Volledige audit']},secundair:{tab:'sso',label:['Політика входу','Aanmeldbeleid']}},
  sso:{boven:['ЄДИНИЙ ВХІД · ADMIN.TARASEVYCH.COM','EENMALIGE AANMELDING · ADMIN.TARASEVYCH.COM'],voor:['Первинне посвідчення','Primaire identiteit'],cursief:['та зв’язок пошти.','en postkoppeling.'],beschrijving:['Керування первинним входом, правилами приєднання додаткових поштових скриньок та додатковими способами підтвердження особи без прихованого доступу до листів.','Beheer van de primaire aanmelding, regels voor extra postvakken en aanvullende bevestigingswijzen zonder stilzwijgende toegang tot berichten.'],status:['Пошта потребує окремої згоди','Postvak vereist afzonderlijke toestemming'],primair:{tab:'access',label:['Облікові записи','Gebruikersaccounts']},secundair:{tab:'apps',label:['Доступ додатків','Toepassingstoegang']}},
  directories:{boven:['ІНТЕГРАЦІЇ ТА КАТАЛОГИ · ADMIN.TARASEVYCH.COM','INTEGRATIES EN MAPPEN · ADMIN.TARASEVYCH.COM'],voor:['Зовнішні з’єднання','Externe koppelingen'],cursief:['та служби простору.','en ruimtediensten.'],beschrijving:['Єдина вітрина зовнішніх інтеграцій, покроковий майстер підключення, локальний генератор зображень і чесне налаштування зовнішніх каталогів користувачів.','Centrale etalage van externe koppelingen, stapsgewijze verbindingsassistent, lokale beeldgenerator en eerlijke inrichting van externe gebruikersmappen.'],status:['Чесний стан кожного з’єднання','Eerlijke staat van elke koppeling'],primair:{tab:'contour',label:['Сховище таємниць','Geheimenkluis']},secundair:{tab:'apps',label:['Політика додатків','Toepassingsbeleid']}},
  roles:{boven:['РОЗПОДІЛ ПОВНОВАЖЕНЬ · ADMIN.TARASEVYCH.COM','BEVOEGDHEIDSVERDELING · ADMIN.TARASEVYCH.COM'],voor:['Делеговані ролі та','Gedelegeerde rollen en'],cursief:['непорушний власник.','onschendbare eigenaar.'],beschrijving:['Призначення чітко окреслених адміністративних обов’язків для безпеки, додатків, каталогів або огляду підтримки за повного збереження першості власника.','Toewijzing van strikt afgebakende beheertaken voor beveiliging, toepassingen, mappen of ondersteuning met volledig behoud van het eigenaarsgezag.'],status:['Найменші достатні повноваження','Minimale toereikende rechten'],primair:{tab:'access',label:['Учасники простору','Deelnemers bekijken']},secundair:{tab:'audit',label:['Історія призначень','Toewijzingshistorie']}},
  diagnostics:{boven:['ТЕХНІЧНИЙ ОГЛЯД · ADMIN.TARASEVYCH.COM','TECHNISCHE CONTROLE · ADMIN.TARASEVYCH.COM'],voor:['Перевірка вузлів і','Controle van knooppunten en'],cursief:['життєздатності служб.','dienstgezondheid.'],beschrijving:['Прямі показники працездатності внутрішніх служб, сховища даних, правил політики та мережевої взаємодії домашнього сервера наживо.','Rechtstreekse gezondheidsmetingen van interne diensten, gegevensopslag, beleidsregels en netwerkverbindingen op de thuisserver.'],status:['Перевірка наживо із сервера','Rechtstreekse servermeting'],primair:{tab:'updates',label:['Стан випусків','Uitgavestatus']},secundair:{tab:'contour',label:['Ключі та контур','Sleutels en omgeving']}},
  audit:{boven:['ЖУРНАЛ ПОДІЙ · ADMIN.TARASEVYCH.COM','GEBEURTENISSENREGISTER · ADMIN.TARASEVYCH.COM'],voor:['Криптографічна цілісність','Cryptografische integriteit'],cursief:['кожного рішення.','van elk besluit.'],beschrijving:['Послідовний облік адміністративних дій, входів і змін політики з перевіркою цілісності ланцюжка записів у захищеному сховищі.','Opeenvolgende registratie van beheerhandelingen, aanmeldingen en beleidswijzigingen met integriteitscontrole van de vastleggingsketen.'],status:['Ланцюжок записів під наглядом','Registratieketen onder toezicht'],primair:{tab:'devices',label:['Події пристроїв','Apparaatgebeurtenissen']},secundair:{tab:'diagnostics',label:['Діагностика служб','Dienstdiagnostiek']}},
  contour:{boven:['ЗАХИЩЕНИЙ КОНТУР · ADMIN.TARASEVYCH.COM','BEVEILIGDE OMGEVING · ADMIN.TARASEVYCH.COM'],voor:['Сховище ключів та','Sleutelkluis en'],cursief:['шифровані таємниці.','versleutelde geheimen.'],beschrijving:['Керування серверними таємницями, станом ключів шифрування та захищеними змінними середовища без жодного розкриття чутливих значень у журналі.','Beheer van servergeheimen, versleutelingsstatus en afgeschermde omgevingswaarden zonder blootstelling van gevoelige inhoud in logboeken.'],status:['Значення зашифровано у сховищі','Waarden versleuteld in de kluis'],primair:{tab:'diagnostics',label:['Перевірити контур','Omgeving controleren']},secundair:{tab:'directories',label:['Майстер підключень','Koppelassistent']}},
  updates:{boven:['АТОМАРНІ ВИПУСКИ · ADMIN.TARASEVYCH.COM','ATOMAIRE UITGAVEN · ADMIN.TARASEVYCH.COM'],voor:['Узгоджене розгортання','Afgestemde uitrol'],cursief:['пакунків платформи.','van platformpakketten.'],beschrijving:['Передперевірка пакунків оновлення, звірка походження архіву та безпечне встановлення нової версії за особистим підтвердженням власника.','Voorcontrole van uitgavepakketten, herkomstverificatie van het archief en veilige installatie van een nieuwe versie na bevestiging door de eigenaar.'],status:['Встановлення лише після перевірки','Installatie uitsluitend na controle'],primair:{tab:'diagnostics',label:['Стан сервера','Serverstatus']},secundair:{tab:'ai',label:['Хто готує випуски','Wie uitgaven voorbereidt']}},
};
type AdminData={authority:{host:string;role:AdminRole;capabilities:string[]};summary:{users:number;activeSessions:number;rememberedDevices:number;auditEvents:number};oauth:{policy:{defaultExternalAccess:'blocked'|'review'|'allowed';updatedAt:number};clients:Array<{id:string;name:string;provider:string;scopes:string[];status:string;protected:boolean;mailboxAccess:string}>};deviceEvents:Array<{id:string;date:number;deviceId:string;event:string;description:string;email:string;deviceType:string;model:string;os:string;osVersion:string;browser:string;browserVersion:string;policyStatus:string;failedPasswordAttempts:number|null;failedPasswordSupported:boolean;credentialCompromise:string;compliance:string;maliciousApps:string;authMethod:string}>;ssoPolicy:{enabled:boolean;primaryProvider:'google';autoLinkPrimaryMail:boolean;allowAdditionalMailAccounts:boolean;mailboxAuthorization:'required';domainWideDelegation:false;updatedAt:number};directories:Array<{type:'microsoft_graph'|'scim_inbound';tenantId:string;baseUrl:string;status:string;credentialConfigured:boolean;updatedAt:number}>;requests:Array<{id:string;userId:string;email:string;name:string;status:string;requestedAt:number}>;users:Array<{id:string;email:string;name:string;avatarUrl?:string;status:string;accessLevel:'full'|'limited';workspaceRole?:'owner'|'admin'|'member'|'viewer';role?:string;owner:boolean;adminRole:AdminRole;/** Rechten (audit 19.10): 'api-platform' (ШІ-міст, extensie, tokens), 'plum-theme'. */entitlements?:string[];personRef?:string;createdAt?:number;lastLoginAt?:number;deletedAt?:number;recoverableUntil?:number;retiredAt?:number}>;retiredAccounts:Array<{id:string;email:string;name:string;personRef?:string;createdAt?:number;deletedAt?:number;retiredAt?:number}>;accountRecoveryDays:number;audit:{items:Array<{id:string;userId:string;email:string;action:string;result:string;createdAt:number;details:Record<string,unknown>}>;integrity:{valid:boolean;entries:number;roots:number;bounded:boolean}};limitations:Array<string|{uk:string;nl:string}>};
const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;const dayText=(lang:Lang,value:number)=>value?new Date(value).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE'):'—';const dateTimeText=(lang:Lang,value?:number)=>value?new Date(value).toLocaleString(lang==='uk'?'uk-UA':'nl-BE',{dateStyle:'medium',timeStyle:'short'}):tr(lang,'Ще не заходив','Nog niet aangemeld');const initialenVan=(naam?:string,email?:string)=>{const woorden=String(naam||'').trim().split(/\s+/).filter(Boolean);if(woorden.length>=2)return`${woorden[0][0]}${woorden[1][0]}`.toUpperCase();if(woorden.length===1)return woorden[0].slice(0,2).toUpperCase();const lokaal=String(email||'').split('@')[0]||'';return lokaal.slice(0,2).toUpperCase()||'?'};const recoveryNote=(lang:Lang,until:number,days:number,retired=0)=>{if(retired>0)return tr(lang,'стерто одразу, відновити не можна','meteen gewist, herstellen kan niet');if(!until)return tr(lang,'без обмеження часу','zonder tijdslimiet');const left=Math.ceil((until-Date.now())/86400000);return left>0?tr(lang,`відновити можна ще ${left} дн. із ${days}, до ${dayText(lang,until)}`,`nog ${left} van ${days} dagen te herstellen, tot ${dayText(lang,until)}`):tr(lang,'строк відновлення минув','hersteltermijn verlopen')};
const roleLabel=(lang:Lang,role:AdminRole)=>({super_admin:tr(lang,'Суперадміністратор','Superbeheerder'),security_admin:tr(lang,'Адміністратор безпеки','Beveiligingsbeheerder'),apps_admin:tr(lang,'Адміністратор додатків','Appbeheerder'),directory_admin:tr(lang,'Адміністратор каталогів','Directorybeheerder'),support_viewer:tr(lang,'Перегляд підтримки','Supportweergave'),none:tr(lang,'Без адміністративної ролі','Geen beheerdersrol')}[role]);
const blank:AdminData={authority:{host:'admin.tarasevych.com',role:'none',capabilities:[]},summary:{users:0,activeSessions:0,rememberedDevices:0,auditEvents:0},oauth:{policy:{defaultExternalAccess:'review',updatedAt:0},clients:[]},deviceEvents:[],ssoPolicy:{enabled:true,primaryProvider:'google',autoLinkPrimaryMail:true,allowAdditionalMailAccounts:true,mailboxAuthorization:'required',domainWideDelegation:false,updatedAt:0},directories:[],requests:[],users:[],retiredAccounts:[],accountRecoveryDays:30,audit:{items:[],integrity:{valid:true,entries:0,roots:0,bounded:true}},limitations:[]};const objectOf=(value:unknown)=>value&&typeof value==='object'?value as Record<string,unknown>:{};const arrayOf=<T,>(value:unknown)=>Array.isArray(value)?value as T[]:[];const normalizeAdminData=(value:unknown):AdminData=>{const raw=objectOf(value),authority=objectOf(raw.authority),summary=objectOf(raw.summary),oauth=objectOf(raw.oauth),policy=objectOf(oauth.policy),sso=objectOf(raw.ssoPolicy),audit=objectOf(raw.audit),integrity=objectOf(audit.integrity);return{authority:{...blank.authority,...authority,capabilities:arrayOf<string>(authority.capabilities)},summary:{...blank.summary,...summary}as AdminData['summary'],oauth:{policy:{...blank.oauth.policy,...policy}as AdminData['oauth']['policy'],clients:arrayOf<AdminData['oauth']['clients'][number]>(oauth.clients)},deviceEvents:arrayOf<AdminData['deviceEvents'][number]>(raw.deviceEvents),ssoPolicy:{...blank.ssoPolicy,...sso}as AdminData['ssoPolicy'],directories:arrayOf<AdminData['directories'][number]>(raw.directories),requests:arrayOf<AdminData['requests'][number]>(raw.requests),users:arrayOf<AdminData['users'][number]>(raw.users),retiredAccounts:arrayOf<AdminData['retiredAccounts'][number]>(raw.retiredAccounts),accountRecoveryDays:Number(raw.accountRecoveryDays||30),audit:{items:arrayOf<AdminData['audit']['items'][number]>(audit.items),integrity:{...blank.audit.integrity,...integrity}as AdminData['audit']['integrity']},limitations:arrayOf<string|{uk:string;nl:string}>(raw.limitations)}};
/** Etap B: duidelijke tekst als root «beheer-alleen-tech» aanzette (anders null → de gewone melding). */
const beleidFout=(lang:Lang,e:unknown):string|null=>{const c=String((e as Error)?.message||'');
  if(c==='OWNER_ADMIN_TECH_REQUIRED')return tr(lang,'Адмін-права діють лише в активному технічному профілі з потрібним правом. Меню облікового запису → «Технічний профіль» → увімкнути в цій вкладці.','Beheerrechten gelden alleen in een actief technisch profiel met het juiste recht. Accountmenu → «Technisch profiel» → aanzetten in dit tabblad.');
  if(c==='BELEID_ONBEREIKBAAR')return tr(lang,'Служба правил (OPA) не відповіла, тому адмін-дію заблоковано (так задумано). На сервері: sudo systemctl status mijn-ruimte-opa; або root вимикає «beheer-alleen-tech».','De regeldienst (OPA) antwoordde niet; de beheeractie is daarom geblokkeerd (zo bedoeld). Op de server: sudo systemctl status mijn-ruimte-opa; of root zet «beheer-alleen-tech» uit.');
  return null};
export default function AdminConsoleView({lang,tab,userId,sourceOrigin,tabContext}:{lang:Lang;tab:string;userId:string;sourceOrigin:string;tabContext:string}){
  const isMaquette=useIsMaquette();
  const actieveTab:AdminTabId=isAdminTab(tab)?tab:'overview';
  const taalIdx=lang==='uk'?0:1;
  const telegramAan=useTelegramVlag();
  const apparaatAan=useApparaatVlag();
  const[data,setData]=useState<AdminData>(blank),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[roleEmail,setRoleEmail]=useState(''),[roleValue,setRoleValue]=useState<AdminRole>('support_viewer');
  const[laagOpen,setLaagOpen]=useState(false);
  const[uitrolStand,setUitrolStand]=useState<{tab:string;wachtend:number;recentAantal:number;instellenAandacht?:boolean}>({tab:'overzicht',wachtend:0,recentAantal:0,instellenAandacht:false});
  const[overviewStand,setOverviewStand]=useState<{pauze:boolean;bewerken:boolean;zichtbaarIds:string[]}>({pauze:false,bewerken:false,zichtbaarIds:[]});
  const[diagStand,setDiagStand]=useState<{tab:string;filter:string;aandachtNu:number;totaalN:number}>({tab:'alle',filter:'alles',aandachtNu:0,totaalN:0});
  const[aiStand,setAiStand]=useState<{filter:string;agentAantal:number;timersTotaal:number;wachtrijAantal:number}>({filter:'alle',agentAantal:0,timersTotaal:0,wachtrijAantal:0});
  const[geheimenStand,setGeheimenStand]=useState<{weergave:'lijst'|'journaal';staat:string;totaal:number;aandacht:number;journaalAantal:number}>({weergave:'lijst',staat:'alle',totaal:0,aandacht:0,journaalAantal:0});
  const[integratiesStand,setIntegratiesStand]=useState<{weergave:'catalogus'|'mijn'|'mappen'|'wizard';mijnAantal:number;totaal:number;mappenAantal:number}>({weergave:'catalogus',mijnAantal:0,totaal:0,mappenAantal:0});
  const[auditStand,setAuditStand]=useState<{periode:string;live:boolean;totaal:number}>({periode:'7d',live:false,totaal:0});
  const[actiefSubAnker,setActiefSubAnker]=useState('');
  const[userZoek,setUserZoek]=useState('');
  const[userStatusFilter,setUserStatusFilter]=useState<'alle'|'approved'|'pending'|'blocked'|'deleted'>('alle');
  const[userRolFilter,setUserRolFilter]=useState<'alle'|'owner'|'admin'|'member'|'viewer'>('alle');
  const[userAlleenSamen,setUserAlleenSamen]=useState(false);
  const[userWeergave,setUserWeergave]=useState<'groepen'|'lijst'>('groepen');
  const[activeGroepId,setActiveGroepId]=useState('');

  const context=useMemo(()=>({service:'admin',tabContext,sourceOrigin}),[tabContext,sourceOrigin]);
  const gaNaarAdminTab=useCallback((doelId:string)=>{location.assign(canonicalNavigationUrl('admin',doelId,lang))},[lang]);

  useEffect(()=>{
    setActiefSubAnker('');
    const vraagMap:Partial<Record<AdminTabId,string>>={
      updates:'tsv:uitrol-vraag-stand',
      overview:'tsv:overview-vraag-stand',
      diagnostics:'tsv:diag-vraag-stand',
      ai:'tsv:ai-beleid-vraag-stand',
      contour:'tsv:geheimen-vraag-stand',
      directories:'tsv:integraties-vraag-stand',
      audit:'tsv:audit-vraag-stand',
    };
    const evNaam=vraagMap[actieveTab];
    if(evNaam)window.dispatchEvent(new Event(evNaam));
  },[actieveTab]);

  useEffect(()=>{
    const onUitrol=(e:Event)=>{const d=(e as CustomEvent<typeof uitrolStand>).detail;if(d)setUitrolStand(d);};
    const onOverview=(e:Event)=>{const d=(e as CustomEvent<typeof overviewStand>).detail;if(d)setOverviewStand(d);};
    const onDiag=(e:Event)=>{const d=(e as CustomEvent<typeof diagStand>).detail;if(d)setDiagStand(d);};
    const onAi=(e:Event)=>{const d=(e as CustomEvent<typeof aiStand>).detail;if(d)setAiStand(d);};
    const onGeheimen=(e:Event)=>{const d=(e as CustomEvent<typeof geheimenStand>).detail;if(d)setGeheimenStand(d);};
    const onIntegraties=(e:Event)=>{const d=(e as CustomEvent<typeof integratiesStand>).detail;if(d)setIntegratiesStand(d);};
    const onAudit=(e:Event)=>{const d=(e as CustomEvent<typeof auditStand>).detail;if(d)setAuditStand(d);};
    window.addEventListener('tsv:uitrol-tab',onUitrol);
    window.addEventListener('tsv:overview-stand',onOverview);
    window.addEventListener('tsv:diag-tab',onDiag);
    window.addEventListener('tsv:ai-beleid-stand',onAi);
    window.addEventListener('tsv:geheimen-stand',onGeheimen);
    window.addEventListener('tsv:integraties-stand',onIntegraties);
    window.addEventListener('tsv:audit-stand',onAudit);
    return()=>{
      window.removeEventListener('tsv:uitrol-tab',onUitrol);
      window.removeEventListener('tsv:overview-stand',onOverview);
      window.removeEventListener('tsv:diag-tab',onDiag);
      window.removeEventListener('tsv:ai-beleid-stand',onAi);
      window.removeEventListener('tsv:geheimen-stand',onGeheimen);
      window.removeEventListener('tsv:integraties-stand',onIntegraties);
      window.removeEventListener('tsv:audit-stand',onAudit);
    };
  },[]);

  useEffect(()=>{if(typeof document==='undefined'||!document.body){setLaagOpen(false);return}return abonneerOpenLaag(ADMIN_MODAAL_SELECTOR,setLaagOpen,{wortel:'body',attributeFilter:['open','hidden','class','aria-modal','data-mq-laag-open']})},[actieveTab]);
  const overviewStatistieken=useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(()=>[{waarde:data.summary.users,label:ADMIN_STAT_LABELS.users[taalIdx]},{waarde:data.summary.activeSessions,label:ADMIN_STAT_LABELS.sessions[taalIdx]},{waarde:data.summary.rememberedDevices,label:ADMIN_STAT_LABELS.devices[taalIdx]},{waarde:data.summary.auditEvents,label:ADMIN_STAT_LABELS.audit[taalIdx]}],[data.summary.activeSessions,data.summary.auditEvents,data.summary.rememberedDevices,data.summary.users,taalIdx]);

  const scrollToSelector=useCallback((selector:string)=>{
    window.setTimeout(()=>{document.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'start'});},40);
  },[]);

  const hostAllowed=location.hostname==='admin.tarasevych.com';
  const can=(value:string)=>data.authority.capabilities.includes(value);
  const load=useCallback(async()=>{setLoading(true);try{const response=await api.post('/api/owner/admin/bootstrap',context);setData(normalizeAdminData(response.data));setNotice('')}catch(e){setNotice(beleidFout(lang,e)||tr(lang,'Адміністративний доступ не підтверджено.','Beheerderstoegang is niet bevestigd.'))}setLoading(false)},[context,lang]);
  useEffect(()=>{void load()},[userId,lang,load]);
  const confirmWrite=()=>window.confirm(tr(lang,'Підтвердити зміну адміністративної політики?','Wijziging van het beheerbeleid bevestigen?'));
  const write=async(route:string,payload:Record<string,unknown>)=>{if(!confirmWrite())return;setBusy(true);try{await api.post(route,{...context,...payload,confirmation:'ADMIN_POLICY_CHANGE'});await load();setNotice(tr(lang,'Зміну збережено й додано до журналу.','De wijziging is opgeslagen en aan het logboek toegevoegd.'))}catch(e){setNotice(beleidFout(lang,e)||tr(lang,'Зміну відхилено або бракує повноважень.','De wijziging is geweigerd of de bevoegdheid ontbreekt.'))}setBusy(false)};

  const groepering=useMemo(()=>groepeerVergelijkbareGebruikers(data.users),[data.users]);
  const gekozenGroepId=activeGroepId&&groepering.groepen.some(g=>g.id===activeGroepId)?activeGroepId:'';
  const userFilterActief=userZoek.trim()!==''||userStatusFilter!=='alle'||userRolFilter!=='alle'||userAlleenSamen||gekozenGroepId!=='';
  const resetUserFilters=()=>{setUserZoek('');setUserStatusFilter('alle');setUserRolFilter('alle');setUserAlleenSamen(false);setActiveGroepId('');};
  const gefilterdeUsers=useMemo(()=>{
    const q=userZoek.trim().toLowerCase();
    return data.users.filter(item=>{
      const groep=groepering.groepPerUserId.get(item.id);
      if(gekozenGroepId&&groep?.id!==gekozenGroepId)return false;
      if(userAlleenSamen&&!groep)return false;
      if(userStatusFilter!=='alle'&&item.status!==userStatusFilter)return false;
      if(userRolFilter!=='alle'){
        const effRol=item.owner?'owner':(item.workspaceRole||(item.accessLevel==='limited'?'viewer':'member'));
        if(userRolFilter==='owner'&&!item.owner)return false;
        if(userRolFilter==='admin'&&!(!item.owner&&(effRol==='admin'||item.adminRole!=='none')))return false;
        if(userRolFilter==='member'&&!(!item.owner&&effRol==='member'))return false;
        if(userRolFilter==='viewer'&&!(!item.owner&&effRol==='viewer'))return false;
      }
      if(q){
        const hay=[item.name,item.email,item.personRef||'',groep?.titel||''].join(' ').toLowerCase();
        if(!hay.includes(q))return false;
      }
      return true;
    });
  },[data.users,gekozenGroepId,groepering.groepPerUserId,userAlleenSamen,userRolFilter,userStatusFilter,userZoek]);
  const{zichtbareGroepen,losseUsers}=useMemo(()=>{
    const idSet=new Set(gefilterdeUsers.map(u=>u.id));
    const groepenOut=groepering.groepen
      .map(g=>({groep:g,zichtbareLeden:g.leden.filter(l=>idSet.has(l.id))}))
      .filter(entry=>entry.zichtbareLeden.length>0);
    const los=gefilterdeUsers.filter(u=>!groepering.groepPerUserId.has(u.id));
    return{zichtbareGroepen:groepenOut,losseUsers:los};
  },[gefilterdeUsers,groepering.groepPerUserId,groepering.groepen]);

  const ankerItems=useMemo<ReadonlyArray<MaquetteAnkerItem>>(()=>{
    switch(actieveTab){
      case'updates':
        return[
          {
            id:'upd-tab:overzicht',
            label:tr(lang,'Огляд','Overzicht'),
            badge:uitrolStand.wachtend||undefined,
            icoon:Activity,
            openStandaard:true,
            kiesbaar:true,
            actiefBij:['upd-tab:overzicht','upd-anker:uitrol-upload-anchor','upd-anker:ut-live-titel','upd-anker:ut-recent-titel'],
            kinderen:[
              {id:'upd-anker:uitrol-upload-anchor',label:tr(lang,'Завантажити архів','Archief uploaden'),icoon:Upload},
              {id:'upd-anker:ut-live-titel',label:tr(lang,'Живий перебіг','Live voortgang'),icoon:Radio},
              {id:'upd-anker:ut-recent-titel',label:tr(lang,'Останні розгортання','Laatste uitrollen'),badge:uitrolStand.recentAantal||undefined,icoon:PackageCheck},
            ],
          },
          {id:'upd-tab:stroom',label:tr(lang,'Потік і докази','Stroom en bewijs'),icoon:ClipboardCheck},
          {id:'upd-tab:historie',label:tr(lang,'Історія','Geschiedenis'),icoon:History},
          {id:'upd-tab:log',label:tr(lang,'Журнал','Logboek'),icoon:ScrollText},
          {id:'upd-tab:diagnose',label:tr(lang,'Діагностика','Diagnose'),icoon:Stethoscope},
          {id:'upd-tab:instellen',label:tr(lang,'Налаштування','Instellingen'),badge:uitrolStand.instellenAandacht?'!':undefined,icoon:Settings2},
          {id:'upd-actie:vernieuw',label:tr(lang,'Оновити дані','Gegevens vernieuwen'),icoon:RefreshCw,soort:'actie'},
        ];
      case'overview':{
        const widgetLabels:Record<string,readonly[string,string,LucideIcon]>={
          users:['Користувачі','Gebruikers',Users],
          sessies:['Активні сеанси','Actieve sessies',UserCheck],
          devices:['Пристрої','Apparaten',MonitorSmartphone],
          aanvragen:['Запити доступу','Toegangsaanvragen',KeyRound],
          audit:['Події аудиту','Auditgebeurtenissen',ScrollText],
          diensten:['Сервіси','Diensten',Network],
        };
        const widgetKinderen:MaquetteAnkerItem[]=overviewStand.zichtbaarIds.slice(0,6).map(wid=>{
          const meta=widgetLabels[wid];
          return{
            id:`ov-widget:${wid}`,
            label:meta?tr(lang,meta[0],meta[1]):wid,
            icoon:meta?meta[2]:Layers,
          };
        });
        return[
          {
            id:'ov-sectie',
            label:tr(lang,'Панель огляду','Overzichtspaneel'),
            icoon:LayoutDashboard,
            openStandaard:true,
            kinderen:[
              {id:'ov-anker:.ov-balk',label:tr(lang,'Стан і керування','Status en besturing'),icoon:Activity},
              ...widgetKinderen,
            ],
          },
          {id:'ov-actie:vernieuw',label:tr(lang,'Оновити дані','Gegevens vernieuwen'),icoon:RefreshCw,soort:'actie'},
          {id:'ov-actie:pauze',label:overviewStand.pauze?tr(lang,'Продовжити оновлення','Hervatten'):tr(lang,'Пауза оновлення','Pauzeren'),icoon:overviewStand.pauze?Play:Pause,soort:'actie'},
          {id:'ov-actie:bewerken',label:overviewStand.bewerken?tr(lang,'Готово','Klaar'):tr(lang,'Налаштувати блоки','Blokken aanpassen'),icoon:Settings2,soort:'actie'},
        ];
      }
      case'access':
        return[
          {
            id:'acc-secties',
            label:tr(lang,'Розділи доступу','Onderdelen van toegang'),
            icoon:Users,
            openStandaard:true,
            kinderen:[
              {id:'anchor:#admin-access-requests',label:tr(lang,'Запити доступу','Toegangsaanvragen'),badge:data.requests.length||undefined,icoon:KeyRound},
              {id:'anchor:#admin-access-filters',label:tr(lang,'Пошук і фільтри','Zoeken en filters'),icoon:Filter},
              ...(groepering.groepen.length>0?[{id:'anchor:#admin-access-groepen',label:tr(lang,'Схожі облікові записи','Vergelijkbare accounts'),badge:groepering.groepen.length,icoon:CopyCheck}]:[]),
              {id:'anchor:#admin-access-users',label:tr(lang,'Учасники та права','Deelnemers en rechten'),badge:data.users.length||undefined,icoon:UserCheck},
              ...(data.retiredAccounts.length>0?[{id:'anchor:#admin-access-retired',label:tr(lang,'Історія облікових записів','Accountgeschiedenis'),badge:data.retiredAccounts.length,icoon:History}]:[]),
            ],
          },
          {id:'actie:reload',label:tr(lang,'Оновити список','Lijst vernieuwen'),icoon:RefreshCw,soort:'actie',onActie:()=>{void load();}},
        ];
      case'ai':
        return[
          {
            id:'ai-secties',
            label:tr(lang,'Розділи політики ШІ','Onderdelen AI-beleid'),
            icoon:Bot,
            openStandaard:true,
            kinderen:[
              {id:'ai-anker:.aib-stand',label:tr(lang,'Підписана версія','Getekende versie'),icoon:Lock},
              {id:'ai-anker:.asl-wortel',label:tr(lang,'Стан агентів','Status van agents'),badge:aiStand.agentAantal||undefined,icoon:Activity},
              {id:'ai-anker:[data-namens-sessies]',label:tr(lang,'Сеанси від імені','Sessies namens eigenaar'),icoon:Fingerprint},
              {id:'ai-anker:.aiz-balk',label:tr(lang,'Пошук і фільтри','Zoeken en filters'),icoon:Filter},
              {id:'ai-anker:[data-aiz-bulk]',label:tr(lang,'Групове керування','Groepsbeheer'),icoon:Layers},
              {id:'ai-anker:#aib-agentpaneel',label:tr(lang,'Права агента','Rechten van agent'),badge:aiStand.timersTotaal||undefined,icoon:Settings2},
              ...(aiStand.wachtrijAantal>0?[{id:'ai-anker:.aiz-wachtrij',label:tr(lang,'Черга на підпис','Wachtrij voor handtekening'),badge:aiStand.wachtrijAantal,icoon:Rocket}]:[]),
            ],
          },
          {
            id:'ai-filters',
            label:tr(lang,'Фільтр агентів','Filter agents'),
            icoon:Filter,
            kinderen:[
              {id:'ai-filter:alle',label:tr(lang,'Усі агенти','Alle agents'),icoon:Layers},
              {id:'ai-filter:aan',label:tr(lang,'Увімкнені','Ingeschakeld'),icoon:Check},
              {id:'ai-filter:deels',label:tr(lang,'Частково','Gedeeltelijk'),icoon:Clock},
              {id:'ai-filter:uit',label:tr(lang,'Вимкнені','Uitgeschakeld'),icoon:Lock},
            ],
          },
          {id:'ai-actie:nieuw',label:tr(lang,'Додати агента','Agent toevoegen'),icoon:Plus,soort:'actie'},
          {id:'ai-actie:vernieuw',label:tr(lang,'Оновити дані','Gegevens vernieuwen'),icoon:RefreshCw,soort:'actie'},
        ];
      case'apps':
        return[
          {
            id:'apps-secties',
            label:tr(lang,'Зовнішні додатки','Externe apps'),
            icoon:Link2,
            openStandaard:true,
            kinderen:[
              {id:'anchor:#admin-apps-policy',label:tr(lang,'Загальна політика доступу','Standaard toegangsbeleid'),icoon:Check},
              {id:'anchor:#admin-apps-clients',label:tr(lang,'Зареєстровані клієнти','Geregistreerde clients'),badge:data.oauth.clients.length||undefined,icoon:Layers},
            ],
          },
          {id:'actie:reload',label:tr(lang,'Оновити список','Lijst vernieuwen'),icoon:RefreshCw,soort:'actie',onActie:()=>{void load();}},
        ];
      case'devices':
        return[
          {
            id:'dev-secties',
            label:tr(lang,'Сеанси й пристрої','Sessies en apparaten'),
            icoon:MonitorSmartphone,
            openStandaard:true,
            kinderen:[
              {id:'anchor:#admin-devices-head',label:tr(lang,'Огляд подій','Overzicht gebeurtenissen'),badge:data.deviceEvents.length||undefined,icoon:Activity},
              {id:'anchor:#admin-devices-list',label:tr(lang,'Список записів','Lijst met records'),icoon:ScrollText},
            ],
          },
          {id:'actie:reload',label:tr(lang,'Оновити події','Gebeurtenissen vernieuwen'),icoon:RefreshCw,soort:'actie',onActie:()=>{void load();}},
        ];
      case'sso':
        return[
          {
            id:'sso-secties',
            label:tr(lang,'Налаштування входу','Aanmeldinstellingen'),
            icoon:KeyRound,
            openStandaard:true,
            kinderen:[
              {id:'anchor:#admin-sso-policy',label:tr(lang,'Політика єдиного входу','Beleid eenmalige aanmelding'),icoon:Fingerprint},
              ...(telegramAan?[{id:'anchor:.tga-sectie',label:tr(lang,'Вхід через Telegram','Aanmelden via Telegram'),icoon:ShieldCheck}]:[]),
              ...(apparaatAan?[{id:'anchor:.apb-sectie',label:tr(lang,'Підтвердження з пристрою','Apparaatbevestiging'),icoon:MonitorSmartphone}]:[]),
            ],
          },
          {id:'actie:reload',label:tr(lang,'Оновити політику','Beleid vernieuwen'),icoon:RefreshCw,soort:'actie',onActie:()=>{void load();}},
        ];
      case'directories':
        return[
          {
            id:'dir-tabs',
            label:tr(lang,'Підрозділи інтеграцій','Onderdelen integraties'),
            icoon:Network,
            openStandaard:true,
            kinderen:[
              {id:'dir-tab:catalogus',label:tr(lang,'Каталог сервісів','Dienstencatalogus'),badge:integratiesStand.totaal||undefined,icoon:Layers},
              {id:'dir-tab:mijn',label:tr(lang,'Мої підключення','Mijn koppelingen'),badge:integratiesStand.mijnAantal||undefined,icoon:Link2},
              {id:'dir-tab:mappen',label:tr(lang,'Зовнішні каталоги','Externe mappen'),badge:integratiesStand.mappenAantal||data.directories.length||undefined,icoon:Network},
              {id:'dir-tab:wizard',label:tr(lang,'Майстер підключень','Koppelwizard'),icoon:Wrench},
            ],
          },
          {id:'dir-anker:.il-werkbalk, #il-mappen',label:tr(lang,'Пошук і параметри','Zoeken en opties'),icoon:Search},
          {id:'dir-actie:vernieuw',label:tr(lang,'Оновити стан','Status vernieuwen'),icoon:RefreshCw,soort:'actie'},
        ];
      case'roles':
        return[
          {
            id:'rol-secties',
            label:tr(lang,'Ролі адміністрування','Beheerdersrollen'),
            icoon:ShieldCheck,
            openStandaard:true,
            kinderen:[
              {id:'anchor:#admin-roles-form',label:tr(lang,'Призначити роль','Rol toewijzen'),icoon:UserCheck},
              {id:'anchor:#admin-roles-list',label:tr(lang,'Користувачі й ролі','Gebruikers en rollen'),badge:data.users.length||undefined,icoon:Layers},
            ],
          },
          {id:'actie:reload',label:tr(lang,'Оновити ролі','Rollen vernieuwen'),icoon:RefreshCw,soort:'actie',onActie:()=>{void load();}},
        ];
      case'diagnostics':
        return[
          {
            id:'diag-overzicht',
            label:tr(lang,'Огляд перевірок','Overzicht controles'),
            icoon:Stethoscope,
            openStandaard:true,
            kinderen:[
              {id:'diag-anker:.adg-samenvatting',label:tr(lang,'Загальний стан','Algemene toestand'),badge:diagStand.totaalN||undefined,icoon:Stethoscope},
              {id:'diag-anker:#adg-aandacht-kop',label:tr(lang,'Потребує уваги','Heeft aandacht nodig'),badge:diagStand.aandachtNu||undefined,icoon:TriangleAlert},
              {id:'diag-anker:.adg-gereedschap',label:tr(lang,'Пошук і фільтр стану','Zoeken en filter'),icoon:Filter},
            ],
          },
          {
            id:'diag-tabs',
            label:tr(lang,'Категорії перевірок','Controlecategorieën'),
            icoon:ListChecks,
            kinderen:[
              {id:'diag-tab:alle',label:tr(lang,'Усі перевірки','Alle controles'),icoon:ListChecks},
              {id:'diag-tab:diensten',label:tr(lang,'Сервіси й маршрути','Diensten en routes'),icoon:Wrench},
              {id:'diag-tab:historie',label:tr(lang,'Історія збоїв','Storingsgeschiedenis'),icoon:History},
              {id:'diag-tab:account',label:tr(lang,'Для всіх / цей запис','Iedereen / dit account'),icoon:Users},
              {id:'diag-tab:zekering',label:tr(lang,'Захист і барʼєри','Bescherming'),icoon:ShieldCheck},
            ],
          },
          {id:'diag-actie:alles',label:tr(lang,'Перевірити все','Alles controleren'),icoon:Play,soort:'actie'},
          {id:'diag-actie:vernieuw',label:tr(lang,'Оновити результати','Resultaten vernieuwen'),icoon:RefreshCw,soort:'actie'},
        ];
      case'audit':
        return[
          {
            id:'aud-secties',
            label:tr(lang,'Розділи журналу','Onderdelen logboek'),
            icoon:ScrollText,
            openStandaard:true,
            kinderen:[
              {id:'aud-anker:.aj-kaarten',label:tr(lang,'Зведення й цілісність','Samenvatting en keten'),icoon:Activity},
              {id:'aud-anker:.aj-filters',label:tr(lang,'Пошук і фільтри','Zoeken en filters'),icoon:Filter},
              {id:'aud-anker:.aj-lijst',label:tr(lang,'Стрічка подій','Gebeurtenissenlijst'),badge:auditStand.totaal||undefined,icoon:ScrollText},
            ],
          },
          {
            id:'aud-perioden',
            label:tr(lang,'Період вибірки','Periode selectie'),
            icoon:Clock,
            kinderen:[
              {id:'aud-per:24u',label:tr(lang,'За 24 години','24 uur'),icoon:Clock},
              {id:'aud-per:7d',label:tr(lang,'За 7 днів','7 dagen'),icoon:Clock},
              {id:'aud-per:30d',label:tr(lang,'За 30 днів','30 dagen'),icoon:Clock},
              {id:'aud-per:alles',label:tr(lang,'Увесь час','Alle periodes'),icoon:Eye},
              {id:'aud-per:eigen',label:tr(lang,'Свій період','Eigen periode'),icoon:Settings2},
            ],
          },
          {id:'aud-actie:controle',label:tr(lang,'Перевірити цілісність','Keten controleren'),icoon:Fingerprint,soort:'actie'},
          {id:'aud-actie:live',label:auditStand.live?tr(lang,'Вимкнути «Наживо»','Live stoppen'):tr(lang,'Стежити наживо','Live volgen'),icoon:Radio,soort:'actie'},
          {id:'aud-actie:vernieuw',label:tr(lang,'Оновити журнал','Logboek verversen'),icoon:RefreshCw,soort:'actie'},
        ];
      case'contour':
        return[
          {
            id:'cnt-views',
            label:tr(lang,'Таємниці й журнал','Geheimen en logboek'),
            icoon:Lock,
            openStandaard:true,
            kinderen:[
              {id:'cnt-tab:lijst',label:tr(lang,'Секрети й ключі','Geheimen en sleutels'),badge:geheimenStand.totaal||undefined,icoon:Eye},
              {id:'cnt-tab:journaal',label:tr(lang,'Журнал дій','Actielogboek'),badge:geheimenStand.journaalAantal||undefined,icoon:History},
              {id:'cnt-staat:aandacht',label:tr(lang,'Потребують уваги','Vragen aandacht'),badge:geheimenStand.aandacht||undefined,icoon:TriangleAlert},
            ],
          },
          {id:'cnt-anker:.gm-balk',label:tr(lang,'Пошук і фільтри','Zoeken en filters'),icoon:Search},
          {id:'cnt-actie:toevoegen',label:tr(lang,'Додати секрет','Geheim toevoegen'),icoon:Plus,soort:'actie'},
          {id:'cnt-actie:vernieuw',label:tr(lang,'Оновити список','Lijst vernieuwen'),icoon:RefreshCw,soort:'actie'},
        ];
    }
  },[actieveTab,aiStand,apparaatAan,auditStand,data.deviceEvents.length,data.directories.length,data.oauth.clients.length,data.requests.length,data.retiredAccounts.length,data.users.length,diagStand,geheimenStand,groepering.groepen.length,integratiesStand,lang,load,overviewStand,telegramAan,uitrolStand]);

  const actiefAnker=useMemo(()=>{
    if(actiefSubAnker)return actiefSubAnker;
    switch(actieveTab){
      case'updates':return`upd-tab:${uitrolStand.tab}`;
      case'ai':return`ai-filter:${aiStand.filter}`;
      case'directories':return`dir-tab:${integratiesStand.weergave}`;
      case'diagnostics':return`diag-tab:${diagStand.tab}`;
      case'audit':return`aud-per:${auditStand.periode}`;
      case'contour':return geheimenStand.staat==='aandacht'?'cnt-staat:aandacht':`cnt-tab:${geheimenStand.weergave}`;
      case'access':return'anchor:#admin-access-users';
      case'apps':return'anchor:#admin-apps-clients';
      case'devices':return'anchor:#admin-devices-list';
      case'sso':return'anchor:#admin-sso-policy';
      case'roles':return'anchor:#admin-roles-list';
      case'overview':return'ov-anker:.ov-balk';
    }
  },[actiefSubAnker,actieveTab,aiStand.filter,auditStand.periode,diagStand.tab,geheimenStand.staat,geheimenStand.weergave,integratiesStand.weergave,uitrolStand.tab]);

  const gaNaarAdminAnker=useCallback((doelId:string)=>{
    setActiefSubAnker(doelId);
    if(doelId.startsWith('anchor:')){scrollToSelector(doelId.slice('anchor:'.length));return;}
    if(doelId.startsWith('upd-tab:')){window.dispatchEvent(new CustomEvent('tsv:uitrol-nav',{detail:{tab:doelId.slice('upd-tab:'.length)}}));return;}
    if(doelId.startsWith('upd-anker:')){window.dispatchEvent(new CustomEvent('tsv:uitrol-nav',{detail:{tab:'overzicht',anker:doelId.slice('upd-anker:'.length)}}));return;}
    if(doelId==='upd-actie:vernieuw'){window.dispatchEvent(new CustomEvent('tsv:uitrol-nav',{detail:{actie:'vernieuw'}}));return;}
    if(doelId.startsWith('ov-widget:')){window.dispatchEvent(new CustomEvent('tsv:overview-actie',{detail:{selector:`[data-widget-id="${doelId.slice('ov-widget:'.length)}"]`}}));return;}
    if(doelId.startsWith('ov-anker:')){window.dispatchEvent(new CustomEvent('tsv:overview-actie',{detail:{selector:doelId.slice('ov-anker:'.length)}}));return;}
    if(doelId.startsWith('ov-actie:')){window.dispatchEvent(new CustomEvent('tsv:overview-actie',{detail:{actie:doelId.slice('ov-actie:'.length)}}));return;}
    if(doelId.startsWith('ai-anker:')){window.dispatchEvent(new CustomEvent('tsv:ai-beleid-nav',{detail:{selector:doelId.slice('ai-anker:'.length)}}));return;}
    if(doelId.startsWith('ai-filter:')){window.dispatchEvent(new CustomEvent('tsv:ai-beleid-nav',{detail:{filter:doelId.slice('ai-filter:'.length)}}));return;}
    if(doelId.startsWith('ai-actie:')){window.dispatchEvent(new CustomEvent('tsv:ai-beleid-nav',{detail:{actie:doelId.slice('ai-actie:'.length)}}));return;}
    if(doelId.startsWith('dir-tab:')){window.dispatchEvent(new CustomEvent('tsv:integraties-tab',{detail:{weergave:doelId.slice('dir-tab:'.length)}}));return;}
    if(doelId.startsWith('dir-anker:')){window.dispatchEvent(new CustomEvent('tsv:integraties-tab',{detail:{selector:doelId.slice('dir-anker:'.length)}}));return;}
    if(doelId.startsWith('dir-actie:')){window.dispatchEvent(new CustomEvent('tsv:integraties-tab',{detail:{actie:doelId.slice('dir-actie:'.length)}}));return;}
    if(doelId.startsWith('diag-tab:')){window.dispatchEvent(new CustomEvent('tsv:diag-nav',{detail:{tab:doelId.slice('diag-tab:'.length)}}));return;}
    if(doelId.startsWith('diag-anker:')){window.dispatchEvent(new CustomEvent('tsv:diag-nav',{detail:{selector:doelId.slice('diag-anker:'.length)}}));return;}
    if(doelId.startsWith('diag-actie:')){window.dispatchEvent(new CustomEvent('tsv:diag-nav',{detail:{actie:doelId.slice('diag-actie:'.length)}}));return;}
    if(doelId.startsWith('aud-anker:')){window.dispatchEvent(new CustomEvent('tsv:audit-nav',{detail:{selector:doelId.slice('aud-anker:'.length)}}));return;}
    if(doelId.startsWith('aud-per:')){window.dispatchEvent(new CustomEvent('tsv:audit-nav',{detail:{periode:doelId.slice('aud-per:'.length)}}));return;}
    if(doelId.startsWith('aud-actie:')){window.dispatchEvent(new CustomEvent('tsv:audit-nav',{detail:{actie:doelId.slice('aud-actie:'.length)}}));return;}
    if(doelId.startsWith('cnt-tab:')){window.dispatchEvent(new CustomEvent('tsv:geheimen-nav',{detail:{weergave:doelId.slice('cnt-tab:'.length),staat:'alle'}}));return;}
    if(doelId==='cnt-staat:aandacht'){window.dispatchEvent(new CustomEvent('tsv:geheimen-nav',{detail:{weergave:'lijst',staat:'aandacht'}}));return;}
    if(doelId.startsWith('cnt-anker:')){window.dispatchEvent(new CustomEvent('tsv:geheimen-nav',{detail:{selector:doelId.slice('cnt-anker:'.length)}}));return;}
    if(doelId.startsWith('cnt-actie:')){window.dispatchEvent(new CustomEvent('tsv:geheimen-nav',{detail:{actie:doelId.slice('cnt-actie:'.length)}}));return;}
  },[scrollToSelector]);

  /* 15.11.2026: граничні стани — <div>, не <section>: загальне правило flat-content сплющувало <section> на всю ширину з гострими кутами. · Grenstoestanden als <div>, zodat flat-content ze niet plat slaat. */
  if(!hostAllowed)return <div className={isMaquette?'admin-boundary mq-admin-boundary':'admin-boundary'} data-admin-host-boundary='denied'><TriangleAlert/><h1>{tr(lang,'Адміністративна панель доступна лише на admin.tarasevych.com','Het beheerpaneel is alleen beschikbaar op admin.tarasevych.com')}</h1></div>;
  /* Завантаження: лише анімована піктограма з підписом по центру, без панелі (побажання власника 15.11.2026). · Laden: alleen een draaiend pictogram met tekst. */
  if(loading)return <div className='admin-laden' role='status' aria-busy='true' data-admin-laden><RefreshCw className='spin' aria-hidden='true'/><p>{tr(lang,'Завантажуємо адміністративний контекст…','Beheercontext wordt geladen…')}</p></div>;
  if(data.authority.role==='none')return <div className={isMaquette?'admin-boundary mq-admin-boundary':'admin-boundary'} data-admin-rbac='denied'><ShieldCheck/><h1>{tr(lang,'Потрібна адміністративна роль','Een beheerdersrol is vereist')}</h1><p>{notice}</p></div>;

  const overview=<AdminOverviewView lang={lang} context={context} bron={{summary:data.summary,role:data.authority.role,capabilities:data.authority.capabilities,limitations:data.limitations}}/>;
  const apps=<section className='admin-section' data-admin-oauth-policy><header><Link2/><div><h2>{tr(lang,'API та OAuth-доступ','API- en OAuth-toegang')}</h2><p>{tr(lang,'Політика визначає стандартне рішення для зовнішніх додатків. Основний клієнт ідентифікації (Core Identity) захищений.','Het beleid bepaalt de standaardbeslissing voor externe apps. De kernclient voor identiteit is beschermd.')}</p></div></header><label id='admin-apps-policy'>{tr(lang,'Стандартний доступ зовнішніх додатків','Standaardtoegang voor externe apps')} <HulpVraag k='admin.oauth.extern' lang={lang} /><select data-hulp='admin.oauth.extern' disabled={!can('apps.manage')||busy} value={data.oauth.policy.defaultExternalAccess} onChange={event=>setData(current=>({...current,oauth:{...current.oauth,policy:{...current.oauth.policy,defaultExternalAccess:event.target.value as'blocked'|'review'|'allowed'}}}))}><option value='blocked'>{tr(lang,'Блокувати','Blokkeren')}</option><option value='review'>{tr(lang,'Потребує перевірки','Beoordeling vereist')}</option><option value='allowed'>{tr(lang,'Дозволяти','Toestaan')}</option></select></label><button disabled={!can('apps.manage')||busy} onClick={()=>void write('/api/owner/admin/oauth-policy/save',{defaultExternalAccess:data.oauth.policy.defaultExternalAccess})}>{tr(lang,'Зберегти політику','Beleid opslaan')}</button><div id='admin-apps-clients' className='admin-cards'>{data.oauth.clients.map(client=><article key={client.id}><KeyRound/><div><strong>{client.name}</strong><span><Term lang={lang} raw={client.provider}/> · <Term lang={lang} raw={client.status}/></span><code>{client.id}</code><small>{client.scopes.join(' · ')}</small><small>{tr(lang,'Доступ до пошти','Toegang tot mailbox')}: <Term lang={lang} raw={client.mailboxAccess}/></small></div>{client.protected&&<b>{tr(lang,'Захищений','Beschermd')}</b>}</article>)}</div></section>;
  const devices=<section className='admin-section' data-admin-device-events><header id='admin-devices-head'><MonitorSmartphone/><div><h2>{tr(lang,'Події пристроїв','Apparaatgebeurtenissen')}</h2><p>{tr(lang,'Реальні записи сесій і дозволів браузера (browser grants). Сигнали систем керування пристроями (MDM/EDR), які не підключені, не вигадуються.','Echte sessie- en browsergrantrecords. Niet-gekoppelde MDM/EDR-signalen worden niet verzonnen.')}</p></div></header><div id='admin-devices-list' className='admin-table'><div className='admin-table-head'><span>{tr(lang,'Дата','Datum')}</span><span>ID</span><span>{tr(lang,'Подія / користувач','Gebeurtenis / gebruiker')}</span><span>{tr(lang,'Пристрій / ОС','Apparaat / OS')}</span><span>{tr(lang,'Політика','Beleid')}</span></div>{data.deviceEvents.map(item=><article key={item.id}><time>{new Date(item.date).toLocaleString(lang==='uk'?'uk-UA':'nl-BE')}</time><code>{item.deviceId}</code><span data-label={tr(lang,'Подія / користувач','Gebeurtenis / gebruiker')}><strong><Term lang={lang} raw={item.event}/></strong><small>{item.email}</small><small>{item.description}</small></span><span data-label={tr(lang,'Пристрій / ОС','Apparaat / OS')}><strong>{item.deviceType} · {item.model}</strong><small>{item.os} {item.osVersion}</small><small>{item.browser} {item.browserVersion}</small></span><span data-label={tr(lang,'Політика','Beleid')}><strong><Term lang={lang} raw={item.policyStatus}/></strong><small><Term lang={lang} raw={item.compliance}/> · <Term lang={lang} raw={item.maliciousApps}/></small><small>{tr(lang,'Невдалі паролі','Mislukte wachtwoorden')}: {item.failedPasswordSupported?item.failedPasswordAttempts:<Term lang={lang} raw='not_supported'/>}</small></span></article>)}</div></section>;
  const sso=<section id='admin-sso-policy' className='admin-section' data-admin-sso-policy><header><KeyRound/><div><h2>{tr(lang,'Система єдиного входу','Eenmalige aanmelding')} <HulpVraag k='admin.sso.aan' naam={['Увімкнути єдиний вхід','Eenmalige aanmelding inschakelen']} meer={[['admin.sso.koppel-mail','Автоматично звʼязувати з основною поштою','Automatisch koppelen aan de primaire mailbox'],['admin.sso.extra-mail','Додаткові поштові акаунти','Extra e-mailaccounts']]} label={tr(lang,'Система єдиного входу','Eenmalige aanmelding')} lang={lang} /></h2><p>{tr(lang,'Google Identity є первинним входом. Поштова скринька потребує окремого дозволу від постачальника пошти.','Google Identity is de primaire aanmelding. De mailbox vereist afzonderlijke providertoestemming.')}</p></div></header><div className='admin-checks'><label><input data-hulp='admin.sso.aan' type='checkbox' checked={data.ssoPolicy.enabled} disabled={!can('sso.manage')||busy} onChange={event=>setData(current=>({...current,ssoPolicy:{...current.ssoPolicy,enabled:event.target.checked}}))}/>{tr(lang,'Увімкнути єдиний вхід','Eenmalige aanmelding inschakelen')}</label><label><input data-hulp='admin.sso.koppel-mail' type='checkbox' checked={data.ssoPolicy.autoLinkPrimaryMail} disabled={!can('sso.manage')||busy} onChange={event=>setData(current=>({...current,ssoPolicy:{...current.ssoPolicy,autoLinkPrimaryMail:event.target.checked}}))}/>{tr(lang,'Автоматично звʼязувати особу з основною Google-поштою','Automatisch een identiteitskoppeling voor de primaire Google-mailbox maken')}</label><label><input data-hulp='admin.sso.extra-mail' type='checkbox' checked={data.ssoPolicy.allowAdditionalMailAccounts} disabled={!can('sso.manage')||busy} onChange={event=>setData(current=>({...current,ssoPolicy:{...current.ssoPolicy,allowAdditionalMailAccounts:event.target.checked}}))}/>{tr(lang,'Дозволити додаткові поштові акаунти','Extra e-mailaccounts toestaan')}</label></div><p className='admin-honest-state'>{tr(lang,'Делегування на весь домен (domain-wide delegation) вимкнено. Дозволи Gmail (scopes) не надані; читання або надсилання пошти не активується цією політикою.','Domeinbrede delegatie is uitgeschakeld. Gmail-scopes zijn niet verleend; lezen of verzenden van mail wordt niet door dit beleid geactiveerd.')}</p><button disabled={!can('sso.manage')||busy} onClick={()=>void write('/api/owner/admin/sso-policy/save',{enabled:data.ssoPolicy.enabled,autoLinkPrimaryMail:data.ssoPolicy.autoLinkPrimaryMail,allowAdditionalMailAccounts:data.ssoPolicy.allowAdditionalMailAccounts})}>{tr(lang,'Зберегти політику єдиного входу','Beleid voor eenmalige aanmelding opslaan')}</button></section>;
  const directories=<section className='admin-section' data-admin-directories><header><Network/><div><h2>{tr(lang,'Зовнішні каталоги','Externe directory’s')}</h2><p>{tr(lang,'Зберігається лише нечутлива конфігурація. Стан «Підключено» неможливий без справжніх облікових даних і перевірки.','Alleen niet-gevoelige configuratie wordt opgeslagen. De status connected is onmogelijk zonder echte referenties en verificatie.')}</p></div></header><div className='admin-directory-grid'>{data.directories.map((connector,index)=><article key={connector.type}><ListChecks/><h3>{connector.type==='microsoft_graph'?fieldLabel(lang,'Каталог Microsoft','Microsoft-directory','Microsoft Graph API'):fieldLabel(lang,'Вхідна синхронізація користувачів','Inkomende gebruikerssynchronisatie','SCIM 2.0 inbound')}</h3><span><Term lang={lang} raw={connector.status}/> · {tr(lang,'облікові дані','referenties')}: <Term lang={lang} raw={connector.credentialConfigured?'configured':'missing'}/></span>{connector.type==='microsoft_graph'?<label>{fieldLabel(lang,'Ідентифікатор орендаря','Tenant-id','Tenant ID')}<input value={connector.tenantId} disabled={!can('directories.manage')||busy} onChange={event=>setData(current=>({...current,directories:current.directories.map((item,position)=>position===index?{...item,tenantId:event.target.value}:item)}))}/></label>:<label>{fieldLabel(lang,'Базова адреса','Basis-URL','Base URL')}<input value={connector.baseUrl} disabled={!can('directories.manage')||busy} onChange={event=>setData(current=>({...current,directories:current.directories.map((item,position)=>position===index?{...item,baseUrl:event.target.value}:item)}))}/></label>}<button disabled={!can('directories.manage')||busy} onClick={()=>void write('/api/owner/admin/directory-connectors/save',{type:connector.type,tenantId:connector.tenantId,baseUrl:connector.baseUrl})}>{tr(lang,'Зберегти конфігурацію','Configuratie opslaan')}</button></article>)}</div></section>;
  const renderUserCard=(item:AdminData['users'][number],inGroep=false)=>{
    const groep=groepering.groepPerUserId.get(item.id);
    const eigenRedenen:GroepReden[]=groepering.redenenPerUserId.get(item.id)||(groep?groep.redenen:[]);
    const effRol=item.workspaceRole||(item.accessLevel==='limited'?'viewer':'member');
    const rechtenLijst=([['api-platform',tr(lang,'Доступ до ШІ-мосту (api-platform)','Toegang tot de AI-brug (api-platform)')],['plum-theme',tr(lang,'Сливова тема','Pruimthema')]] as Array<[string,string]>);
    return(
      <article key={item.id} className='admin-user-kaart' data-admin-owner-protected={item.owner?'true':'false'} data-user-groep={groep?.id||undefined}>
        <div className='admin-user-profiel'>
          <div className='admin-user-avatar' aria-hidden='true'>
            <StableAvatar src={item.avatarUrl} alt={item.name||item.email} fallback={<span>{initialenVan(item.name,item.email)}</span>}/>
          </div>
          <div className='admin-user-identiteit'>
            <div className='admin-user-titelrij'>
              <strong>{item.name||item.email}</strong>
              {item.owner&&(
                <span className='admin-owner-badge'>
                  <Lock aria-hidden='true'/>
                  {tr(lang,'Захищений власник','Beschermde eigenaar')}
                </span>
              )}
              {groep&&(!inGroep||userWeergave==='lijst')&&(
                <button
                  type='button'
                  className='admin-groep-badge'
                  data-sterkte={groep.sterkte}
                  onClick={()=>{setActiveGroepId(prev=>prev===groep.id?'':groep.id);setUserWeergave('groepen');}}
                  title={tr(lang,'Показати лише облікові записи цієї групи','Toon alleen accounts in deze groep')}
                >
                  <CopyCheck aria-hidden='true'/>
                  <span>{tr(lang,`Схожа група · ${groep.leden.length}`,`Vergelijkbare groep · ${groep.leden.length}`)}</span>
                </button>
              )}
            </div>
            <span className='admin-user-email'>{item.email}</span>
            <div className='admin-user-meta'>
              <span>
                {item.owner
                  ?tr(lang,'Суперадміністратор · Власник простору','Superbeheerder · Ruimte-eigenaar')
                  :<>{roleLabel(lang,item.adminRole)}{' · '}<Term lang={lang} raw={item.workspaceRole||item.role||'member'}/></>}
              </span>
              <span className='admin-person-ref'>
                {tr(lang,'Код особи','Persoons-id')}: <code>{item.personRef||'—'}</code>
              </span>
              <span>
                <CalendarDays aria-hidden='true'/>
                {tr(lang,'Реєстрація','Geregistreerd')}: {dayText(lang,item.createdAt||0)}
              </span>
              <span>
                <Clock aria-hidden='true'/>
                {tr(lang,'Останній вхід','Laatst aangemeld')}: {dateTimeText(lang,item.lastLoginAt)}
              </span>
            </div>
            {groep&&eigenRedenen.length>0&&(
              <div className='admin-user-redenen'>
                {eigenRedenen.map(r=><span key={r}>{redenLabel(lang,r)}</span>)}
              </div>
            )}
            {item.deletedAt?(
              <small className='admin-person-deleted'>
                {tr(lang,'Видалено','Verwijderd')} {dayText(lang,item.deletedAt)} · {recoveryNote(lang,item.recoverableUntil||0,data.accountRecoveryDays,item.retiredAt||0)}
              </small>
            ):null}
          </div>
        </div>
        <div className='admin-user-velden'>
          <label className='admin-user-veld' data-vergrendeld={item.owner?'true':undefined}>
            <span>{tr(lang,'Стан акаунта','Accountstatus')}</span>
            <select
              data-hulp='admin.user.status'
              disabled={item.owner||!can('users.manage')||busy}
              value={item.status}
              onChange={event=>setData(current=>({...current,users:current.users.map(user=>user.id===item.id?{...user,status:event.target.value}:user)}))}
            >
              <option value='approved'>{tr(lang,'Схвалено','Goedgekeurd')}</option>
              <option value='pending'>{tr(lang,'Очікує','In afwachting')}</option>
              <option value='blocked'>{tr(lang,'Заблоковано','Geblokkeerd')}</option>
            </select>
          </label>
          <label className='admin-user-veld' data-vergrendeld={item.owner?'true':undefined}>
            <span>{tr(lang,'Роль у просторі','Werkruimterol')}</span>
            <select
              data-hulp='admin.user.rol'
              disabled={item.owner||!can('users.manage')||busy}
              value={effRol}
              onChange={event=>setData(current=>({...current,users:current.users.map(user=>user.id===item.id?{...user,workspaceRole:event.target.value as'admin'|'member'|'viewer',accessLevel:event.target.value==='viewer'?'limited':'full'}:user)}))}
            >
              <option value='admin'>{tr(lang,'Адміністратор','Beheerder')}</option>
              <option value='member'>{tr(lang,'Учасник','Deelnemer')}</option>
              <option value='viewer'>{tr(lang,'Глядач','Kijker')}</option>
            </select>
          </label>
        </div>
        {item.owner&&(
          <p className='admin-user-lock-note'>
            <Lock aria-hidden='true'/>
            <span>{tr(lang,'Обліковий запис власника захищено: поля стану й ролі заблоковані для збереження доступу.','Het eigenaarsaccount is beschermd: status- en rolvelden zijn vergrendeld om de toegang te waarborgen.')}</span>
          </p>
        )}
        {/* Audit 19.10 (U-03/MCP-01): rechten per gebruiker hier, niet alleen in de oude IdentityAdminView. Opslaan via dezelfde route (step-up zoals de rest). */}
        {!item.owner&&(
          <div className='admin-user-rechten'>
            <span className='admin-user-rechten-titel'>{tr(lang,'Додаткові права','Extra rechten')}</span>
            <div className='admin-inline-actions' data-admin-rechten={item.id}>
              {rechtenLijst.map(([recht,label])=>{
                const actief=(item.entitlements||[]).includes(recht);
                return(
                  <label key={recht} className='admin-recht' data-recht={recht} data-actief={actief?'true':'false'}>
                    <input
                      type='checkbox'
                      data-hulp='admin.user.rechten'
                      disabled={!can('users.manage')||busy}
                      checked={actief}
                      onChange={event=>setData(current=>({...current,users:current.users.map(user=>user.id===item.id?{...user,entitlements:event.target.checked?[...new Set([...(user.entitlements||[]),recht])]:(user.entitlements||[]).filter(x=>x!==recht)}:user)}))}
                    />
                    <span className='admin-recht-schakelaar' aria-hidden='true'/>
                    <span className='admin-recht-tekst'>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {item.owner ? (
          <button type='button' className='admin-user-save' disabled>
            <Lock aria-hidden='true'/>{tr(lang,'Захищено','Beschermd')}
          </button>
        ) : (
          <button type='button' className='admin-user-save' disabled={!can('users.manage')||busy} onClick={()=>void write(`/api/owner/admin/users/${item.id}`,{status:item.status,accessLevel:item.accessLevel,role:item.workspaceRole,workspaceRole:item.workspaceRole,entitlements:item.entitlements||[]})}>{tr(lang,'Зберегти','Opslaan')}</button>
        )}
      </article>
    );
  };
  const access=(
    <section className='admin-section' data-admin-access-management>
      <header>
        <ShieldCheck/>
        <div>
          <h2>{tr(lang,'Користувачі та запити доступу','Gebruikers en toegangsaanvragen')} <HulpVraag k='admin.user.status' naam={['Стан акаунта','Accountstatus']} meer={[['admin.user.rol','Роль','Rol'],['admin.user.rechten','Права','Rechten']]} label={tr(lang,'Користувачі та запити доступу','Gebruikers en toegangsaanvragen')} lang={lang} /></h2>
          <p>{tr(lang,'Схвалення, рівні доступу, індивідуальні права й виявлення пов’язаних облікових записів. Власник захищений.','Goedkeuringen, toegangsniveaus, individuele rechten en detectie van verwante accounts. De eigenaar is beschermd.')}</p>
        </div>
      </header>
      <div id='admin-access-requests'>
        {data.requests.length?(
          <div className='admin-cards'>
            {data.requests.map(request=>(
              <article key={request.id}>
                <KeyRound/>
                <div>
                  <strong>{request.name}</strong>
                  <span>{request.email}</span>
                  <small>{new Date(request.requestedAt).toLocaleString(lang==='uk'?'uk-UA':'nl-BE')}</small>
                </div>
                <div className='admin-inline-actions'>
                  <button disabled={!can('users.manage')||busy} onClick={()=>void write(`/api/owner/admin/access-requests/${request.id}`,{decision:'admin'})}>{tr(lang,'Адміністратор','Beheerder')}</button>
                  <button disabled={!can('users.manage')||busy} onClick={()=>void write(`/api/owner/admin/access-requests/${request.id}`,{decision:'member'})}>{tr(lang,'Учасник','Deelnemer')}</button>
                  <button disabled={!can('users.manage')||busy} onClick={()=>void write(`/api/owner/admin/access-requests/${request.id}`,{decision:'viewer'})}>{tr(lang,'Глядач','Kijker')}</button>
                  <button disabled={!can('users.manage')||busy} onClick={()=>void write(`/api/owner/admin/access-requests/${request.id}`,{decision:'deny'})}>{tr(lang,'Відхилити','Weigeren')}</button>
                </div>
              </article>
            ))}
          </div>
        ):(
          <p className='admin-honest-state'>{tr(lang,'Немає запитів, що очікують рішення.','Er zijn geen aanvragen die op een beslissing wachten.')}</p>
        )}
      </div>
      {groepering.groepen.length>0&&(
        <div id='admin-access-groepen' className='admin-groups-banner'>
          <div className='admin-groups-banner-kop'>
            <CopyCheck aria-hidden='true'/>
            <div>
              <strong>
                {tr(
                  lang,
                  `Виявлено схожі облікові записи: ${groepering.groepen.length} ${groepering.groepen.length===1?'група':'групи'} (${groepering.groepPerUserId.size} зап.)`,
                  `Vergelijkbare accounts gedetecteerd: ${groepering.groepen.length} ${groepering.groepen.length===1?'groep':'groepen'} (${groepering.groepPerUserId.size} acc.)`,
                )}
              </strong>
              <p>{tr(lang,'Порівняння за іменем (у тому числі транслітерацією), поштовою адресою та кодом особи допомагає відрізнити дублікати однієї людини від різних користувачів.','Vergelijking op naam (inclusief transcriptie), e-mailadres en persoons-id helpt dubbele accounts van één persoon te herkennen.')}</p>
            </div>
          </div>
          <div className='admin-groups-chips'>
            <button
              type='button'
              className='admin-groep-chip'
              aria-pressed={!gekozenGroepId}
              onClick={()=>setActiveGroepId('')}
            >
              {tr(lang,'Усі облікові записи','Alle accounts')} ({data.users.length})
            </button>
            {groepering.groepen.map((g:GebruikersGroep<AdminData['users'][number]>)=>(
              <button
                key={g.id}
                type='button'
                className='admin-groep-chip'
                aria-pressed={gekozenGroepId===g.id}
                data-sterkte={g.sterkte}
                onClick={()=>{setActiveGroepId(prev=>prev===g.id?'':g.id);setUserWeergave('groepen');}}
              >
                <span>{g.titel}</span>
                <b>{g.leden.length}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      <div id='admin-access-filters' className='admin-access-filters'>
        <div className='admin-access-zoek'>
          <Search aria-hidden='true'/>
          <input
            type='search'
            value={userZoek}
            onChange={event=>setUserZoek(event.target.value)}
            placeholder={tr(lang,'Пошук за іменем, поштою або кодом особи…','Zoek op naam, e-mail of persoons-id…')}
            aria-label={tr(lang,'Пошук учасників','Deelnemers zoeken')}
          />
          {userZoek&&(
            <button type='button' className='admin-access-zoek-wis' onClick={()=>setUserZoek('')} aria-label={tr(lang,'Очистити пошук','Zoekopdracht wissen')}>
              <X aria-hidden='true'/>
            </button>
          )}
        </div>
        <div className='admin-access-filter-selects'>
          <label>
            <span>{tr(lang,'Стан','Status')}</span>
            <select data-hulp-vrij='filter' value={userStatusFilter} onChange={event=>setUserStatusFilter(event.target.value as typeof userStatusFilter)}>
              <option value='alle'>{tr(lang,'Усі стани','Alle statussen')}</option>
              <option value='approved'>{tr(lang,'Схвалено','Goedgekeurd')}</option>
              <option value='pending'>{tr(lang,'Очікує','In afwachting')}</option>
              <option value='blocked'>{tr(lang,'Заблоковано','Geblokkeerd')}</option>
              <option value='deleted'>{tr(lang,'Видалено','Verwijderd')}</option>
            </select>
          </label>
          <label>
            <span>{tr(lang,'Роль','Rol')}</span>
            <select data-hulp-vrij='filter' value={userRolFilter} onChange={event=>setUserRolFilter(event.target.value as typeof userRolFilter)}>
              <option value='alle'>{tr(lang,'Усі ролі','Alle rollen')}</option>
              <option value='owner'>{tr(lang,'Власник','Eigenaar')}</option>
              <option value='admin'>{tr(lang,'Адміністратор','Beheerder')}</option>
              <option value='member'>{tr(lang,'Учасник','Deelnemer')}</option>
              <option value='viewer'>{tr(lang,'Глядач','Kijker')}</option>
            </select>
          </label>
        </div>
        <div className='admin-access-toggles'>
          {groepering.groepen.length>0&&(
            <button
              type='button'
              className='admin-access-filter-knop'
              aria-pressed={userAlleenSamen}
              onClick={()=>setUserAlleenSamen(v=>!v)}
            >
              <CopyCheck aria-hidden='true'/>
              {tr(lang,'Лише схожі','Alleen vergelijkbare')} ({groepering.groepPerUserId.size})
            </button>
          )}
          <div className='admin-access-weergave' role='group' aria-label={tr(lang,'Спосіб показу','Weergavemodus')}>
            <button
              type='button'
              aria-pressed={userWeergave==='groepen'}
              onClick={()=>setUserWeergave('groepen')}
            >
              {tr(lang,'Групами схожих','Per groep')}
            </button>
            <button
              type='button'
              aria-pressed={userWeergave==='lijst'}
              onClick={()=>setUserWeergave('lijst')}
            >
              {tr(lang,'Усі списком','Alles als lijst')}
            </button>
          </div>
        </div>
        <div className='admin-access-filter-meta'>
          <span>
            {tr(lang,`Показано ${gefilterdeUsers.length} із ${data.users.length}`,`${gefilterdeUsers.length} van ${data.users.length} getoond`)}
          </span>
          {userFilterActief&&(
            <button type='button' className='admin-access-reset' onClick={resetUserFilters}>
              {tr(lang,'Скинути фільтри','Filters wissen')}
            </button>
          )}
        </div>
      </div>
      <div id='admin-access-users' className='admin-access-users-wrap'>
        {gefilterdeUsers.length===0?(
          <p className='admin-honest-state'>{tr(lang,'За поточними фільтрами не знайдено жодного облікового запису.','Geen accounts gevonden voor de huidige filters.')}</p>
        ):userWeergave==='groepen'&&zichtbareGroepen.length>0?(
          <div className='admin-user-groepen'>
            {zichtbareGroepen.map(({groep,zichtbareLeden})=>(
              <section key={groep.id} className='admin-user-group' data-sterkte={groep.sterkte}>
                <header className='admin-user-group-head'>
                  <div className='admin-user-group-titel'>
                    <CopyCheck aria-hidden='true'/>
                    <h3>{groep.titel}</h3>
                    <span className='admin-groep-teller'>
                      {zichtbareLeden.length===groep.leden.length
                        ?tr(lang,`${groep.leden.length} облікові записи`,`${groep.leden.length} accounts`)
                        :tr(lang,`${zichtbareLeden.length} з ${groep.leden.length} зап.`,`${zichtbareLeden.length} van ${groep.leden.length} acc.`)}
                    </span>
                    {groep.heeftEigenaar&&(
                      <span className='admin-owner-badge'>
                        <Lock aria-hidden='true'/>
                        {tr(lang,'Містить захищеного власника','Bevat beschermde eigenaar')}
                      </span>
                    )}
                  </div>
                  <div className='admin-user-group-redenen'>
                    {groep.redenen.map(r=><span key={r}>{redenLabel(lang,r)}</span>)}
                  </div>
                </header>
                <div className='admin-access-users'>
                  {zichtbareLeden.map(lid=>renderUserCard(lid,true))}
                </div>
              </section>
            ))}
            {losseUsers.length>0&&(
              <div className='admin-user-los'>
                <h3 className='admin-access-subkop'>{tr(lang,'Окремі облікові записи','Afzonderlijke accounts')} ({losseUsers.length})</h3>
                <div className='admin-access-users'>
                  {losseUsers.map(lid=>renderUserCard(lid,false))}
                </div>
              </div>
            )}
          </div>
        ):(
          <div className='admin-access-users'>
            {gefilterdeUsers.map(item=>renderUserCard(item,false))}
          </div>
        )}
      </div>
      {data.retiredAccounts.length>0&&(
        <div id='admin-access-retired' className='admin-retired-accounts'>
          <h3>{tr(lang,'Історія облікових записів','Accountgeschiedenis')}</h3>
          <p>{tr(lang,`Ці записи вже не можна відновити: минуло ${data.accountRecoveryDays} днів. Вони залишаються, щоб за ідентифікатором особи було видно всі облікові записи, що колись належали цій адресі. Після повторної реєстрації людина отримує повністю чистий простір.`,`Deze records kunnen niet meer worden hersteld: de termijn van ${data.accountRecoveryDays} dagen is verstreken. Ze blijven bewaard zodat per persoons-id zichtbaar is welke accounts ooit bij dit adres hoorden. Na een nieuwe registratie krijgt de persoon een volledig lege ruimte.`)}</p>
          {data.retiredAccounts.map(item=>(
            <article key={item.id}>
              <div>
                <strong>{item.email}</strong>
                <code>{item.personRef||'—'}</code>
              </div>
              <small>{tr(lang,'Створено','Aangemaakt')}: {dayText(lang,item.createdAt||0)}</small>
              <small>{tr(lang,'Видалено','Verwijderd')}: {dayText(lang,item.deletedAt||0)}</small>
              <small>{tr(lang,'Закрито остаточно','Definitief gesloten')}: {dayText(lang,item.retiredAt||0)}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
  const roles=<section className='admin-section' data-admin-roles><header><Users/><div><h2>{tr(lang,'Адміністративні ролі','Beheerdersrollen')} <HulpVraag k='admin.rol.rol' lang={lang} /></h2><p>{tr(lang,'Суперадміністратор-власник захищений. Делеговані ролі отримують лише визначені повноваження.','De superbeheerder-eigenaar is beschermd. Gedelegeerde rollen krijgen alleen vastgelegde bevoegdheden.')}</p></div></header><div id='admin-roles-form' className='admin-role-form'><select data-hulp-vrij='keuze' value={roleEmail} onChange={event=>setRoleEmail(event.target.value)} disabled={!can('roles.manage')||busy}><option value=''>{tr(lang,'Оберіть користувача','Kies een gebruiker')}</option>{data.users.filter(item=>!item.owner).map(item=><option value={item.email} key={item.id}>{item.name} · {item.email}</option>)}</select><select data-hulp='admin.rol.rol' value={roleValue} onChange={event=>setRoleValue(event.target.value as AdminRole)} disabled={!can('roles.manage')||busy}><option value='security_admin'>{roleLabel(lang,'security_admin')}</option><option value='apps_admin'>{roleLabel(lang,'apps_admin')}</option><option value='directory_admin'>{roleLabel(lang,'directory_admin')}</option><option value='support_viewer'>{roleLabel(lang,'support_viewer')}</option><option value='none'>{roleLabel(lang,'none')}</option></select><button disabled={!can('roles.manage')||!roleEmail||busy} onClick={()=>void write('/api/owner/admin/roles/save',{email:roleEmail,role:roleValue})}>{tr(lang,'Застосувати роль','Rol toepassen')}</button></div><div id='admin-roles-list' className='admin-cards'>{data.users.map(item=><article key={item.id}><Users/><div><strong>{item.name}</strong><span>{item.email}</span><small><Term lang={lang} raw={item.status}/> · {roleLabel(lang,item.adminRole)}</small></div>{item.owner&&<b>{tr(lang,'Захищений власник','Beschermde eigenaar')}</b>}</article>)}</div></section>;
  const heldTekst=ADMIN_HELD_TEKSTEN[actieveTab];
  const ActiefTabIcoon=ADMIN_ANKER_TABS.find(rij=>rij[0]===actieveTab)?.[3]||ShieldCheck;
  const diagnostics=<AdminDiagnosticsView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext}/>;
  const contour=<Geheimen lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext}/>;
  const updates=<AdminUitrolView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext}/>;
  const audit=<AuditPagina lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext}/>;
  const ai=<AdminAiBeleidView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} dienst='admin'/>;
  const pages:Record<string,import('react').JSX.Element>={
    overview,access,ai,apps,devices,
    sso:(telegramAan||apparaatAan)?<>{sso}<Suspense fallback={null}>{telegramAan&&<TelegramBeheer lang={lang}/>}{apparaatAan&&<ApparaatBeheer lang={lang}/>}</Suspense></>:sso,
    directories:<><Integraties lang={lang} context={context} ssoActief={data.ssoPolicy.enabled} directories={data.directories} mappen={directories}/>{CLOUD_M10_STAGE&&data.authority.role==='super_admin'&&<Suspense fallback={<p>Cloud governance…</p>}><CloudM10Governance tabContext={tabContext}/></Suspense>}</>,
    roles,diagnostics,audit,contour,updates,
  };
  return <main className='admin-console mq-schil' data-mq-dienst={isMaquette?'admin':undefined} data-admin-control-plane='v1' data-admin-role={data.authority.role}>{isMaquette?(<MaquetteHeld key={`admin-held-${actieveTab}`} id='admin-maquette-held' dienst='admin' lang={lang} modus={actieveTab==='overview'?'volledig':'compact'} opslagSleutel={`admin-${actieveTab}`} bovenregel={heldTekst.boven[taalIdx]} titelVoor={heldTekst.voor[taalIdx]} titelCursief={heldTekst.cursief[taalIdx]} beschrijving={heldTekst.beschrijving[taalIdx]} primair={{label:heldTekst.primair.label[taalIdx],onClick:()=>gaNaarAdminTab(heldTekst.primair.tab)}} secundair={{label:heldTekst.secundair.label[taalIdx],onClick:()=>gaNaarAdminTab(heldTekst.secundair.tab)}} statistieken={actieveTab==='overview'?overviewStatistieken:undefined} extraActies={<span className='mq-admin-held-status'><ActiefTabIcoon aria-hidden='true'/><span>{heldTekst.status[taalIdx]}</span></span>}/>):null}<header className='admin-title'><div><span>{tr(lang,'Приватний адміністративний контур','Privé beheeromgeving')}</span><h1>{tr(lang,'Адміністрування Tarasevych','Tarasevych-beheer')}</h1><p>{data.authority.host} · {roleLabel(lang,data.authority.role)}</p></div><div className='admin-title-actions'>{tab!=='updates'&&<button onClick={()=>void load()} disabled={busy}><RefreshCw/>{tr(lang,'Оновити','Vernieuwen')}</button>}</div></header>{notice&&<p className='admin-notice'>{notice}</p>}{pages[tab]||overview}{!laagOpen?(<MaquetteAnkerRail lang={lang} opslagSleutel='admin-anker' titel={ADMIN_RAIL_TITEL_PER_TAB[actieveTab][taalIdx]} ondertitel={ADMIN_RAIL_SUB[taalIdx]} items={ankerItems} actief={actiefAnker} onKies={gaNaarAdminAnker}/>):null}</main>;
}
