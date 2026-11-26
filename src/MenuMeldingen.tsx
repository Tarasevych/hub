// «Levend» menu (fase B2): badge op een menu-item + «sms-bellen» bij aanwijzen. Inhoud komt uitsluitend uit de bel-meldingen van het
// eigen (goedgekeurde) account en uit tellers (alleen getallen); alles als tekst gerenderd (React escapet), niets in aria-label of
// URL's behalve het aantal. Bellen verschijnen alleen bij aanwijzen/focus; × verbergt (server: gelezen; teller: tot er meer is).
//
// INTEG-001 (eigenaar: «Червона точка на пункті меню сайту горить без пояснення. Наведення або клік мають відкривати вікно з
// поясненням, до чого точка, з переходом до місця і кнопкою «очистити» одразу»):
//  • ook een KLIK/TIK op de stip opent het venster (vroeger alleen aanwijzen met de muis — op de telefoon nooit), en het venster
//    sluit bij een tik ernaast;
//  • bovenaan in gewone woorden wat de stip betekent (hoeveel, welk soort, waar), per melding «Відкрити» (naar de plek) en
//    «Очистити» als tekstknop (niet alleen ×), en altijd «Очистити все тут» (ook bij één melding);
//  • «Усі сповіщення» opent het meldingenpaneel aan de bel.
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type FocusEvent as RFocusEvent,type KeyboardEvent as RKeyboardEvent,type MouseEvent as RMouseEvent,type PointerEvent as RPointerEvent} from 'react';
import {Bell,Calendar,Check,CheckCheck,Cloud,Cpu,ExternalLink,Info,KeyRound,Mail,ShieldAlert,ShieldCheck,Sparkles,Users,X} from 'lucide-react';
import {MELDINGEN,MELDING_SCHEMAS,type MeldingSchemaId} from '../shared/meldingen-catalogus';
import {CATEGORIE_TEKST,badgeTekst,type Badge,type BadgeStijl,type MenuMelding} from '../shared/menu-meldingen';
import {MELDINGEN_OPENEN_EVENT} from './canoniek-meldingen';
import MerkLogo from './merk/MerkLogo';
import {merkSleutel} from './merk/merk-register';

type Lang='uk'|'nl';
export type BelStaat='goed'|'let'|'fout'|'info';
export type BelIcoonSoort='schild-goed'|'schild-let'|'sleutel'|'post'|'wolk'|'agenda'|'ai'|'systeem'|'leden';

const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
export const badgeLabel=(lang:Lang,n:number)=>lang==='uk'?`${n} ${n%10>=1&&n%10<=4&&!(n%100>=11&&n%100<=14)?'сповіщення':'сповіщень'}`:`${n} ${n===1?'melding':'meldingen'}`;

/** Wat de stip betekent, in één zin: hoeveel, welk soort (kleur), waar. */
export function stipUitleg(lang:Lang,label:string,badge:Badge):string{
  const soorten=badge.categorieen.map(c=>CATEGORIE_TEKST[c][lang==='uk'?0:1].toLowerCase()).join(', ');
  return lang==='uk'
    ?`Позначка на «${label}» означає: тут ${badge.aantal===1?'є 1 непрочитане сповіщення':`є непрочитані сповіщення — ${badgeLabel(lang,badge.aantal)}`} (${soorten}). Колір — вид сповіщення. Відкрийте, щоб виправити, або очистіть — позначка зникне.`
    :`De stip op «${label}» betekent: hier ${badge.aantal===1?'staat 1 ongelezen melding':`staan ongelezen meldingen — ${badgeLabel(lang,badge.aantal)}`} (${soorten}). De kleur is het soort melding. Open om het op te lossen, of ruim op — dan verdwijnt de stip.`;
}

export function MenuBadge({badge,stijl,knipper,herinner,onOpen}:{badge:Badge;stijl:BadgeStijl;knipper:boolean;herinner:boolean;onOpen?:(el:HTMLElement)=>void}){
  const getal=stijl==='getal';
  // Klik/tik op de stip: het venster met uitleg opent; het menu-item zelf navigeert dan NIET (stopPropagation + preventDefault).
  const klik=onOpen?(e:RMouseEvent<HTMLSpanElement>)=>{e.preventDefault();e.stopPropagation();onOpen(e.currentTarget)}:undefined;
  return <span className={`menu-badge${getal?' getal':' punt'}`} data-menu-badge={badge.item} data-categorie={badge.categorieen[0]} data-meer-categorieen={badge.categorieen.length>1?'ja':undefined} data-knipper={knipper?'ja':undefined} data-herinner={herinner?'ja':undefined} data-klik={onOpen?'ja':undefined} aria-hidden='true' onClick={klik}>{getal?badgeTekst(badge.aantal):null}</span>;
}

const tijd=(lang:Lang,op:number)=>{if(!op)return'';const s=Math.max(0,Math.round((Date.now()-op)/1000));if(s<60)return tr(lang,'щойно','zojuist');const m=Math.round(s/60);if(m<60)return tr(lang,`${m} хв тому`,`${m} min geleden`);const u=Math.round(m/60);if(u<48)return tr(lang,`${u} год тому`,`${u} u geleden`);return new Date(op).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short'})};

const RUWE_EMOJI_VOORVOEGSEL=/^(?:[\s\uFE0F\u200D]|🚨|✅|⚠️|⛔|📍|🖼️|❗|❕|🔔|🔒|🔑|🛡️)+/u;

/** Очищує відображуваний заголовок від грубих початкових емодзі, зберігаючи зміст повідомлення. */
export function schoonMeldingTitel(titel:string):string{
  return String(titel||'').replace(RUWE_EMOJI_VOORVOEGSEL,'').trim();
}

const MERK_PATRONEN:ReadonlyArray<{re:RegExp;merk:string;naam:readonly[uk:string,nl:string]}>=[
  {re:/(?:^|[^\p{L}])(telegram|телеграм)(?:$|[^\p{L}])/iu,merk:'telegram',naam:['Telegram','Telegram']},
  {re:/\bclaude\b/i,merk:'claude',naam:['Claude','Claude']},
  {re:/\bcodex\b/i,merk:'codex',naam:['Codex','Codex']},
  {re:/\b(?:chatgpt|openai|gpt-[456])\b/i,merk:'openai',naam:['OpenAI','OpenAI']},
  {re:/\bgemini\b/i,merk:'gemini',naam:['Gemini','Gemini']},
  {re:/\bgrok\b/i,merk:'grok',naam:['Grok','Grok']},
  {re:/\bantigravity\b/i,merk:'antigravity',naam:['Antigravity','Antigravity']},
  {re:/\b(?:autoclaw|openclaw)\b/i,merk:'autoclaw',naam:['AutoClaw','AutoClaw']},
  {re:/\b(?:mscopilot|microsoft\s*(?:365\s*)?copilot|copilot\s*studio)\b/i,merk:'mscopilot',naam:['Microsoft Copilot','Microsoft Copilot']},
  {re:/\bcopilot\b/i,merk:'copilot',naam:['Copilot','Copilot']},
  {re:/\bcursor\b/i,merk:'cursor',naam:['Cursor','Cursor']},
  {re:/\b(?:google\s*drive|googledrive)\b|google\s*диск/i,merk:'googledrive',naam:['Google Диск','Google Drive']},
  {re:/\bgmail\b/i,merk:'gmail',naam:['Gmail','Gmail']},
  {re:/\b(?:onedrive|microsoftonedrive)\b/i,merk:'microsoftonedrive',naam:['OneDrive','OneDrive']},
  {re:/\b(?:microsoft|outlook|microsoftoutlook)\b/i,merk:'microsoft',naam:['Microsoft','Microsoft']},
  {re:/\bdropbox\b/i,merk:'dropbox',naam:['Dropbox','Dropbox']},
  {re:/\bfastmail\b/i,merk:'fastmail',naam:['Fastmail','Fastmail']},
  {re:/\bgithub\b/i,merk:'github',naam:['GitHub','GitHub']},
  {re:/\bgoogle\b/i,merk:'google',naam:['Google','Google']},
  {re:/\b(?:passkey|webauthn|toegangssleutel)\b|ключ(?:і|а|ем)?\s+(?:входу|доступу)/i,merk:'passkey',naam:['Ключ входу','Passkey']},
  {re:/\boauth\b|єдин(?:ий|ого|ому)\s+вх(?:ід|оду|оді)|eenmalige\s+aanmelding/i,merk:'oauth',naam:['Єдиний вхід','Eenmalige aanmelding']},
  {re:/\bwebhook(?:s)?\b/i,merk:'webhook',naam:['Зовнішній виклик','Webhook']},
];

function zoekMerkInTekst(bronTekst:string,m:MenuMelding,badgeItem:string,lang:Lang):{merk:string;naam:string}|null{
  const idx=lang==='uk'?0:1;
  const zonderEmail=bronTekst.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,' ');
  for(const p of MERK_PATRONEN){
    if(!p.re.test(zonderEmail))continue;
    let ruw=p.merk;
    let naam=p.naam[idx];
    if(ruw==='google'){
      if(m.categorie==='post'||badgeItem.includes('mail')){ruw='gmail';naam='Gmail'}
      else if(badgeItem.includes('cloud')){ruw='googledrive';naam=lang==='uk'?'Google Диск':'Google Drive'}
    }
    const sleutel=merkSleutel(ruw)||ruw;
    return {merk:sleutel,naam};
  }
  return null;
}

const CATALOGUS_KERN=MELDINGEN.filter(x=>x.kanaal==='bel').map(x=>({
  schema:x.schema,
  niveau:x.niveau,
  ukKern:schoonMeldingTitel(x.titel[0]).replace(/\s*\([^)]*\)\s*/g,' ').replace(/[«»…]/g,'').trim().toLowerCase(),
  nlKern:schoonMeldingTitel(x.titel[1]).replace(/\s*\([^)]*\)\s*/g,' ').replace(/[«»…]/g,'').trim().toLowerCase(),
}));

function vindCatalogusTreffer(schoonTitel:string){
  const t=schoonTitel.toLowerCase();
  if(!t)return null;
  for(const item of CATALOGUS_KERN){
    if((item.ukKern.length>=8&&t.startsWith(item.ukKern))||(item.nlKern.length>=8&&t.startsWith(item.nlKern)))return item;
  }
  return null;
}

export type BelKaartVerrijking={
  schoonTitel:string;
  merk:string|null;
  merkNaam:string;
  icoon:BelIcoonSoort;
  staat:BelStaat;
  schemaId:MeldingSchemaId;
  soortTekst:string;
};

/**
 * Розпізнає офіційний логотип з єдиного реєстру src/merk/, очищує сирі емодзі, визначає семантичний стан
 * за src/thema/staat-kleuren.css та людський тип події за MELDING_SCHEMAS (shared/meldingen-catalogus.ts).
 */
export function verrijkMenuMelding(m:MenuMelding,badgeItem:string,sectieLabel:string,lang:Lang):BelKaartVerrijking{
  const idx=lang==='uk'?0:1;
  const schoonTitel=schoonMeldingTitel(m.titel)||tr(lang,`Сповіщення: ${CATEGORIE_TEKST[m.categorie][0].toLowerCase()}`,`Melding: ${CATEGORIE_TEKST[m.categorie][1].toLowerCase()}`);
  const inhoudTekst=`${schoonTitel} ${m.tekst||''}`;
  const contextTekst=`${m.link||''} ${m.id} ${badgeItem}`;

  let merkHit=m.bron==='teller'?null:zoekMerkInTekst(inhoudTekst,m,badgeItem,lang);
  if(!merkHit&&m.bron!=='teller'){
    if(/(?:svc|pg):github\b|github\.tarasevych\.com/i.test(contextTekst))merkHit={merk:'github',naam:'GitHub'};
    else if(/\/sso(?:$|[/?#])/i.test(m.link||'')&&/(вхід|входу|сеанс|aanmeld|sessie)/i.test(inhoudTekst))merkHit={merk:'oauth',naam:tr(lang,'Єдиний вхід','Eenmalige aanmelding')};
    else merkHit=zoekMerkInTekst(`${m.id} ${badgeItem}`,m,badgeItem,lang);
  }

  const treffer=vindCatalogusTreffer(schoonTitel);
  const heeftOpmerking=/(зауважен|opmerking|мало кодів|weinig herstelcodes)/i.test(inhoudTekst);
  const vraagtBesluit=/(запит|підтвердьте|підтвердження адміністратора|очікує|просить|verzoek|bevestig\b|beheerdersbevestiging|wacht op)/i.test(schoonTitel);
  const isHersteldOfGoed=!heeftOpmerking&&!/(не працює|не відновлено|не вдалося|заблоковано|відхилено|werkt niet|niet hersteld|mislukt|geblokkeerd|geweigerd)/i.test(inhoudTekst)&&/(знову працює|зв['’]язок відновлено|відновлено|прив['’]язано|пройдена|успішно|позначено як ваш|позначено довіреним|прийнято|werkt weer|verbinding hersteld|hersteld|gekoppeld|geslaagd|gemarkeerd|aanvaard)/i.test(inhoudTekst);
  const heeftFoutSignaal=/(заблоковано|відхилено|зламан|не вдалося|не надав|далеко від місця|конфлікт|іншим входом|інший google-акаунт|підозріл|скасовано:\s*інша|вимкнено.*totp|забрано|geblokkeerd|geweigerd|gekaapt|mislukt|conflict|verdacht|ingetrokken)/i.test(inhoudTekst)||(/(тривога|beveiligingsalarm|beveiligingsmelding|\balarm\b)/i.test(inhoudTekst)&&!isHersteldOfGoed);

  let staat:BelStaat;
  if(heeftOpmerking||vraagtBesluit)staat='let';
  else if(isHersteldOfGoed)staat='goed';
  else if(heeftFoutSignaal)staat='fout';
  else if(treffer?.niveau==='gevaar')staat='fout';
  else if(treffer?.niveau==='besluit'||m.categorie==='toegang')staat='let';
  else if(m.categorie==='beveiliging'&&/(перевірте|controleer|увага|let op|зміна|wijziging)/i.test(inhoudTekst))staat='let';
  else staat='info';

  let schemaId:MeldingSchemaId;
  if(isHersteldOfGoed&&/(знову працює|зв['’]язок відновлено|werkt weer|verbinding hersteld)/i.test(inhoudTekst))schemaId='S15';
  else if(treffer)schemaId=treffer.schema;
  else if(m.bron==='teller'||m.categorie==='post'||/(непрочитані листи|лист|пошт|e-mail|inbox)/i.test(inhoudTekst))schemaId='S8';
  else if(/(календар|зустріч|agenda|afspraak)/i.test(inhoudTekst))schemaId='S9';
  else if(/(спільн|поділил|запрошен|простір «|осел[іюя]|delen|uitnodiging|ruimte)/i.test(inhoudTekst)&&m.categorie==='delen')schemaId='S6';
  else if(m.categorie==='ai'||/\b(claude|gemini|grok|codex|chatgpt|openai|antigravity|autoclaw|copilot|cursor|mcp)\b/i.test(inhoudTekst))schemaId=/(просить|запит|дозвол|мандат|vraagt|toestemm|verzoek)/i.test(inhoudTekst)?'S11':'S12';
  else if(vraagtBesluit||m.categorie==='toegang')schemaId='S5';
  else if(/(хмар|файл|диск|onedrive|dropbox|googledrive|cloud|bestand)/i.test(inhoudTekst))schemaId='S10';
  else if(/(оновлення сайту|випуск|пакунок|uitrol|nieuwe versie|update van de site)/i.test(inhoudTekst))schemaId='S14';
  else if(/(сховищ[еі] ключів|секрет|sleutelkluis|geheim)/i.test(inhoudTekst))schemaId='S16';
  else if(/(код(?:и|ів)? відновлення|код доступу|herstelcode|toegangscode)/i.test(inhoudTekst))schemaId='S3';
  else if(/(конфлікт|інший google-акаунт|іншим входом|адресу акаунта|адресу облікового|conflict|ander google-account)/i.test(inhoudTekst))schemaId='S4';
  else if(/(спосіб входу|passkey|totp|автентифікатор|парол|прив['’]язано|відв['’]язано|другий крок|aanmeldmethode|wachtwoord|gekoppeld|ontkoppeld)/i.test(inhoudTekst))schemaId='S2';
  else if(m.categorie==='beveiliging'||/(вхід|входу|сеанс|пристр|aanmeld|sessie|apparaat)/i.test(inhoudTekst))schemaId='S1';
  else schemaId='S13';

  const schemaNaam=(isHersteldOfGoed&&schemaId==='S15'&&/(вхід|входу|aanmeld)/i.test(inhoudTekst))
    ?tr(lang,'Відновлення входу','Herstel van aanmelding')
    :MELDING_SCHEMAS[schemaId].naam[idx];

  const bronVoorvoegsel=merkHit?.naam||sectieLabel;
  const soortTekst=bronVoorvoegsel&&bronVoorvoegsel.toLowerCase()!==schemaNaam.toLowerCase()
    ?`${bronVoorvoegsel} · ${schemaNaam}`
    :schemaNaam;

  let icoon:BelIcoonSoort;
  if(schemaId==='S3'||schemaId==='S16')icoon='sleutel';
  else if(schemaId==='S5'||schemaId==='S6'||schemaId==='S7'||m.categorie==='delen'||m.categorie==='toegang')icoon='leden';
  else if(schemaId==='S8'||m.categorie==='post')icoon='post';
  else if(schemaId==='S9')icoon='agenda';
  else if(schemaId==='S10')icoon='wolk';
  else if(schemaId==='S11'||schemaId==='S12'||m.categorie==='ai')icoon='ai';
  else if(schemaId==='S13'||schemaId==='S14'||schemaId==='S15'||schemaId==='S18'||schemaId==='S20'||m.categorie==='systeem')icoon=staat==='goed'&&m.categorie==='beveiliging'?'schild-goed':'systeem';
  else icoon=staat==='goed'?'schild-goed':'schild-let';

  const weergaveTitel=(isHersteldOfGoed&&/^telegram:\s*(?:тривога безпеки|beveiligingsalarm)/i.test(schoonTitel)&&/(знову працює|werkt weer)/i.test(m.tekst||''))
    ?tr(lang,'Telegram: зв’язок відновлено','Telegram: verbinding hersteld')
    :schoonTitel;

  return {
    schoonTitel:weergaveTitel,
    merk:merkHit?.merk||null,
    merkNaam:merkHit?.naam||'',
    icoon,
    staat,
    schemaId,
    soortTekst,
  };
}

function BelAnkerIcoon({icoon}:{icoon:BelIcoonSoort}){
  switch(icoon){
    case 'schild-goed':return <ShieldCheck aria-hidden='true'/>;
    case 'schild-let':return <ShieldAlert aria-hidden='true'/>;
    case 'sleutel':return <KeyRound aria-hidden='true'/>;
    case 'post':return <Mail aria-hidden='true'/>;
    case 'wolk':return <Cloud aria-hidden='true'/>;
    case 'agenda':return <Calendar aria-hidden='true'/>;
    case 'ai':return <Sparkles aria-hidden='true'/>;
    case 'leden':return <Users aria-hidden='true'/>;
    default:return <Cpu aria-hidden='true'/>;
  }
}

const STAAT_LEGENDA:Readonly<Record<Exclude<BelStaat,'info'>,readonly[uk:string,nl:string]>>={
  goed:['Відновлено','Hersteld'],
  let:['Потребує уваги','Vraagt aandacht'],
  fout:['Тривога','Alarm'],
};

const AANRAAK_TIP_MS=2800;
const AANRAAK_LANG_DRUK_MS=420;
type ZweeftipStaat={sleutel:string;tekst:string;modus:'mouse'|'touch';anker:HTMLElement};
type BellenPlaatsing='rechts'|'links'|'onder'|'boven';

const APPARAAT_UUID_RE=/[?&]apparaat=([0-9a-f-]{36})/i;
function haalApparaatUuidUitMelding(m:MenuMelding):string{
  const uitLink=APPARAAT_UUID_RE.exec(m.link||'')?.[1];
  if(uitLink)return uitLink;
  if(/^[0-9a-f-]{36}$/i.test(m.id)&&/(новий вхід на новому пристрої|nieuwe aanmelding op een nieuw apparaat)/i.test(m.titel))return m.id;
  return '';
}

function apparaatGroepSleutel(m:MenuMelding,info:BelKaartVerrijking):string{
  const toestel=/(?:пристрій|apparaat)\s*«([^»]+)»/i.exec(m.tekst||'')?.[1]?.trim().toLowerCase()||'';
  return `${info.schoonTitel.toLowerCase()}|${info.merk||''}|${toestel}`;
}

export async function bevestigApparaatBekend(ids:readonly string[]):Promise<void>{
  const unieke=[...new Set(ids.filter(id=>/^[0-9a-f-]{36}$/i.test(id)))];
  if(!unieke.length||typeof fetch!=='function')return;
  await Promise.allSettled(unieke.map(id=>fetch('/api/meldingen/apparaat-bekend',{
    method:'POST',
    credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id}),
  })));
}

const ukOngelezenVorm=(n:number)=>{
  const r10=n%10,r100=n%100;
  if(r10===1&&r100!==11)return 'непрочитаний лист';
  if(r10>=2&&r10<=4&&!(r100>=12&&r100<=14))return 'непрочитані листи';
  return 'непрочитаних листів';
};

type BellenProps={lang:Lang;label:string;badge:Badge;anker:DOMRect;onSluit:(m:MenuMelding)=>void;onOpen:(m:MenuMelding)=>void;onAllesWeg:()=>void;onBinnen:(binnen:boolean)=>void;onEsc:()=>void;paneelRef:(el:HTMLDivElement|null)=>void;
  /** Het menu-item waaraan het venster hangt: een tik daarop sluit het niet (dat doet het item zelf). */
  ankerEl?:HTMLElement|null;
  kant?:'left'|'right';
  /** Vastgezet via klik of aanraking: sluit niet door aanwijzer-verlaten of verlies van focus, alleen door een tik erbuiten, ✕, Escape of navigatie. */
  vastgezet?:boolean;
  /** Uitdrukkelijke sluitactie voor klik erbuiten of knop ✕. */
  onSluitVenster?:()=>void};
export function MeldingBellen({lang,label,badge,anker,onSluit,onOpen,onAllesWeg,onBinnen,onEsc,paneelRef,ankerEl,kant,vastgezet,onSluitVenster}:BellenProps){
  const ref=useRef<HTMLDivElement|null>(null);
  const tipRef=useRef<HTMLDivElement|null>(null);
  const tipTimerRef=useRef<number|null>(null);
  const langDrukTimerRef=useRef<number|null>(null);
  const langDrukGeopendRef=useRef<string|null>(null);
  const uitlegId=useId();
  const[uitlegOpen,setUitlegOpen]=useState(false);
  const[zweeftip,setZweeftip]=useState<ZweeftipStaat|null>(null);
  const[tipPos,setTipPos]=useState<{left:number;top:number;richting:'boven'|'onder'}>({left:8,top:8,richting:'boven'});
  const zweeftipRef=useRef<ZweeftipStaat|null>(null);
  zweeftipRef.current=zweeftip;

  const wisLangDrukTimer=useCallback(()=>{
    if(langDrukTimerRef.current!==null){window.clearTimeout(langDrukTimerRef.current);langDrukTimerRef.current=null}
  },[]);

  const sluitZweeftip=useCallback(()=>{
    wisLangDrukTimer();
    if(tipTimerRef.current!==null){window.clearTimeout(tipTimerRef.current);tipTimerRef.current=null}
    setZweeftip(null);
  },[wisLangDrukTimer]);

  const toonZweeftip=useCallback((sleutel:string,tekst:string,knopEl:HTMLElement,modus:'mouse'|'touch')=>{
    if(tipTimerRef.current!==null){window.clearTimeout(tipTimerRef.current);tipTimerRef.current=null}
    setZweeftip({sleutel,tekst,modus,anker:knopEl});
    if(modus==='touch'){
      tipTimerRef.current=window.setTimeout(()=>{tipTimerRef.current=null;setZweeftip(h=>h?.sleutel===sleutel?null:h)},AANRAAK_TIP_MS);
    }
  },[]);

  useEffect(()=>()=>{wisLangDrukTimer();if(tipTimerRef.current!==null)window.clearTimeout(tipTimerRef.current)},[wisLangDrukTimer]);

  useEffect(()=>{
    const doel=ankerEl;
    if(!doel)return;
    doel.setAttribute('data-menu-bellen-anker','actief');
    return()=>{doel.removeAttribute('data-menu-bellen-anker')};
  },[ankerEl]);

  const[pos,setPos]=useState<{left:number;top:number;maxHeight?:number;plaatsing:BellenPlaatsing;pijlX:number;pijlY:number}>({
    left:kant==='left'?Math.max(10,anker.left-390):anker.right+10,
    top:anker.top-6,
    plaatsing:kant==='left'?'links':'rechts',
    pijlX:24,
    pijlY:22,
  });
  useLayoutEffect(()=>{
    const plaats=()=>{
      const el=ref.current;if(!el)return;
      const rect=ankerEl?.isConnected?ankerEl.getBoundingClientRect():anker;
      const vw=window.innerWidth||360,vh=window.innerHeight||800;
      const w=el.offsetWidth||Math.min(380,vw-20);
      const rand=vw<=700?10:12;
      const voorkeur=kant==='left'?rect.left-w-10:rect.right+10;
      const alternatief=kant==='left'?rect.right+10:rect.left-w-10;
      const past=(x:number)=>x>=rand&&x+w<=vw-rand;

      if(past(voorkeur)||past(alternatief)){
        const h=el.offsetHeight||220;
        const gekozenLeft=past(voorkeur)?voorkeur:alternatief;
        const left=Math.max(rand,Math.min(gekozenLeft,vw-w-rand));
        const top=Math.max(rand,Math.min(rect.top-6,vh-h-rand));
        const plaatsing:BellenPlaatsing=left>=rect.right-2?'rechts':'links';
        const pijlY=Math.round(Math.max(16,Math.min(Math.max(24,h-16),(rect.top+rect.height/2)-top)));
        setPos(p=>p.left===left&&p.top===top&&p.maxHeight===undefined&&p.plaatsing===plaatsing&&p.pijlY===pijlY?p:{left,top,maxHeight:undefined,plaatsing,pijlX:24,pijlY});
        return;
      }

      const rawLeft=vw<=700?Math.round((vw-w)/2):voorkeur;
      const left=Math.max(rand,Math.min(rawLeft,vw-w-rand));
      const pijlX=Math.round(Math.max(18,Math.min(Math.max(24,w-18),(rect.left+rect.width/2)-left)));
      const ruimteOnder=vh-rect.bottom-rand-10;
      const ruimteBoven=rect.top-rand-10;

      if(ruimteOnder>=180||ruimteOnder>=ruimteBoven){
        const maxHeight=Math.max(120,Math.min(Math.round(vh*0.74),Math.round(ruimteOnder)));
        const top=Math.max(rand,Math.round(rect.bottom+10));
        setPos(p=>p.left===left&&p.top===top&&p.maxHeight===maxHeight&&p.plaatsing==='onder'&&p.pijlX===pijlX?p:{left,top,maxHeight,plaatsing:'onder',pijlX,pijlY:18});
        return;
      }

      const maxHeight=Math.max(120,Math.min(Math.round(vh*0.74),Math.round(ruimteBoven)));
      const gemetenH=el.offsetHeight||220;
      const effH=Math.min(gemetenH,maxHeight);
      const top=Math.max(rand,Math.round(rect.top-effH-10));
      setPos(p=>p.left===left&&p.top===top&&p.maxHeight===maxHeight&&p.plaatsing==='boven'&&p.pijlX===pijlX?p:{left,top,maxHeight,plaatsing:'boven',pijlX,pijlY:18});
    };
    plaats();
    const raf=requestAnimationFrame(plaats);
    window.addEventListener('resize',plaats);
    window.addEventListener('scroll',plaats,true);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',plaats);window.removeEventListener('scroll',plaats,true)};
  },[anker,ankerEl,kant,badge.meldingen.length,uitlegOpen]);

  useLayoutEffect(()=>{
    if(!zweeftip||!ref.current||!tipRef.current||!zweeftip.anker.isConnected)return;
    const vr=ref.current.getBoundingClientRect();
    const kr=zweeftip.anker.getBoundingClientRect();
    const tw=tipRef.current.offsetWidth;
    const th=tipRef.current.offsetHeight;
    const cx=(kr.left-vr.left)+kr.width/2;
    const minLeft=Math.max(6,6-vr.left);
    const maxLeft=Math.max(minLeft,Math.min(vr.width-tw-6,window.innerWidth-6-vr.left-tw));
    const left=Math.round(Math.max(minLeft,Math.min(cx-tw/2,maxLeft)));
    const topBoven=Math.round((kr.top-vr.top)-th-7);
    const topOnder=Math.round((kr.bottom-vr.top)+7);
    const onder=vr.top+topBoven<6;
    const top=onder?topOnder:topBoven;
    const richting:'boven'|'onder'=onder?'onder':'boven';
    setTipPos(oud=>oud.left===left&&oud.top===top&&oud.richting===richting?oud:{left,top,richting});
  },[zweeftip,pos.left,pos.top]);

  useEffect(()=>{paneelRef(ref.current);return()=>paneelRef(null)},[paneelRef]);
  // Tik/klik naast het venster (en naast het menu-item): dicht — ook op een aanraakscherm, waar geen «muis weg» bestaat.
  useEffect(()=>{const weg=(e:PointerEvent)=>{const doel=e.target as Node|null;if(!doel||ref.current?.contains(doel)||ankerEl?.contains(doel))return;if(onSluitVenster)onSluitVenster();else onBinnen(false)};document.addEventListener('pointerdown',weg,true);return()=>document.removeEventListener('pointerdown',weg,true)},[ankerEl,onBinnen,onSluitVenster]);
  // Escape sluit altijd eerst het open meldingenvenster (ook zonder focus erin), zonder de mobiele menulade mee te sluiten.
  useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();onEsc()}};window.addEventListener('keydown',esc,true);return()=>window.removeEventListener('keydown',esc,true)},[onEsc]);
  const toets=(e:RKeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onEsc()}};

  // На комп’ютері — спливна назва при наведенні миші або фокусі клавіатури; на смартфоні — миттєве виконання дії з першого дотику + підказка за довгим утримуванням (420 мс).
  const icoonKnopHandlers=(sleutel:string,tipTekst:string,actie:()=>void)=>({
    'data-tip-sleutel':sleutel,
    'data-tip-actief':zweeftip?.sleutel===sleutel&&zweeftip.modus==='touch'?'ja':undefined,
    onPointerDown:(e:RPointerEvent<HTMLButtonElement>)=>{
      wisLangDrukTimer();
      langDrukGeopendRef.current=null;
      if(e.pointerType==='touch'||e.pointerType==='pen'){
        const knopEl=e.currentTarget;
        langDrukTimerRef.current=window.setTimeout(()=>{
          langDrukTimerRef.current=null;
          langDrukGeopendRef.current=sleutel;
          toonZweeftip(sleutel,tipTekst,knopEl,'touch');
        },AANRAAK_LANG_DRUK_MS);
      }
    },
    onPointerUp:()=>{wisLangDrukTimer()},
    onPointerCancel:()=>{wisLangDrukTimer()},
    onPointerEnter:(e:RPointerEvent<HTMLButtonElement>)=>{
      if(e.pointerType==='mouse')toonZweeftip(sleutel,tipTekst,e.currentTarget,'mouse');
    },
    onPointerLeave:(e:RPointerEvent<HTMLButtonElement>)=>{
      wisLangDrukTimer();
      if(e.pointerType==='mouse'&&zweeftipRef.current?.modus==='mouse'&&zweeftipRef.current.sleutel===sleutel)sluitZweeftip();
    },
    onFocus:(e:RFocusEvent<HTMLButtonElement>)=>{
      if(zweeftipRef.current?.modus==='touch')return;
      if(e.currentTarget.matches?.(':focus-visible'))toonZweeftip(sleutel,tipTekst,e.currentTarget,'mouse');
    },
    onBlur:()=>{
      if(zweeftipRef.current?.modus==='mouse'&&zweeftipRef.current.sleutel===sleutel)sluitZweeftip();
    },
    onClick:(e:RMouseEvent<HTMLButtonElement>)=>{
      wisLangDrukTimer();
      if(langDrukGeopendRef.current===sleutel){
        langDrukGeopendRef.current=null;
        e.preventDefault();
        return;
      }
      sluitZweeftip();
      actie();
    },
  });

  const kaarten=useMemo(()=>{
    const uit:Array<{m:MenuMelding;info:BelKaartVerrijking;groepLeden:MenuMelding[];apparaatIds:string[]}>=[];
    for(const m of badge.meldingen){
      const info=verrijkMenuMelding(m,badge.item,label,lang);
      const uuid=haalApparaatUuidUitMelding(m);
      if(uuid){
        const grSleutel=apparaatGroepSleutel(m,info);
        const bestaand=uit.find(x=>x.apparaatIds.length>0&&apparaatGroepSleutel(x.m,x.info)===grSleutel&&Math.abs((x.m.op||0)-(m.op||0))<=30*60_000);
        if(bestaand){
          bestaand.groepLeden.push(m);
          if(!bestaand.apparaatIds.includes(uuid))bestaand.apparaatIds.push(uuid);
          continue;
        }
        uit.push({m,info,groepLeden:[m],apparaatIds:[uuid]});
        continue;
      }
      uit.push({m,info,groepLeden:[m],apparaatIds:[]});
    }
    return uit;
  },[badge.meldingen,badge.item,label,lang]);

  const aanwezigeStaten=useMemo(()=>{
    const gezien=new Set<Exclude<BelStaat,'info'>>();
    for(const k of kaarten){if(k.info.staat!=='info')gezien.add(k.info.staat)}
    return (['fout','let','goed'] as const).filter(s=>gezien.has(s));
  },[kaarten]);
  const losseCategorieen=useMemo(()=>[...new Set(kaarten.filter(k=>k.info.staat==='info').map(k=>k.m.categorie))],[kaarten]);

  const allesTekst=badge.meldingen.length>1?tr(lang,'Очистити все тут','Alles hier opruimen'):tr(lang,'Очистити','Opruimen');
  const voetStatus=useMemo(()=>{
    if(badge.meldingen.length>0&&badge.meldingen.every(m=>m.bron === 'teller')){
      const n=Math.max(1,badge.aantal);
      return tr(lang,`У «Вхідних»: ${n} ${ukOngelezenVorm(n)}`,`In «Inbox»: ${n} ongelezen`);
    }
    const tellerSom=badge.meldingen.reduce((som,m)=>som+(m.bron === 'teller'?(m.aantal??1):0),0);
    const tellerKaarten=badge.meldingen.filter(m=>m.bron === 'teller').length;
    const losseGetoond=badge.meldingen.length-tellerKaarten;
    const losseTotaal=Math.max(losseGetoond,badge.aantal-tellerSom);
    const totaalKaarten=losseTotaal+tellerKaarten;
    if(totaalKaarten>badge.meldingen.length){
      return tr(lang,`Показано ${badge.meldingen.length} із ${totaalKaarten}`,`${badge.meldingen.length} van ${totaalKaarten} getoond`);
    }
    return badgeLabel(lang,badge.aantal);
  },[badge.aantal,badge.meldingen,lang]);

  return <div ref={ref} className='menu-bellen' role='region' aria-label={`${label}: ${badgeLabel(lang,badge.aantal)}`} aria-describedby={uitlegId} data-menu-bellen={badge.item} data-plaatsing={pos.plaatsing} data-kant={kant} data-vastgezet={vastgezet?'ja':undefined} style={{left:pos.left,top:pos.top,...(pos.maxHeight?{maxHeight:pos.maxHeight}:{})}} onPointerDownCapture={e=>{if(zweeftipRef.current?.modus==='touch'&&!(e.target as Element|null)?.closest?.('[data-tip-sleutel]'))sluitZweeftip()}} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onPointerEnter={e=>{if(e.pointerType==='mouse')onBinnen(true)}} onPointerLeave={e=>{if(vastgezet||e.pointerType!=='mouse')return;if(e.relatedTarget instanceof Node&&e.currentTarget.contains(e.relatedTarget))return;onBinnen(false)}} onFocus={()=>onBinnen(true)} onBlur={e=>{if(vastgezet)return;if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node))onBinnen(false)}} onKeyDown={toets}>
    <span className='menu-bellen-anker-pijl' data-menu-bellen-anker={pos.plaatsing} style={pos.plaatsing==='boven'||pos.plaatsing==='onder'?{left:pos.pijlX}:{top:pos.pijlY}} aria-hidden='true'/>
    <div className='menu-bellen-kop'>
      <div className='menu-bellen-kop-titel'><strong>{label}</strong><span className='menu-bellen-aantal'>{badgeLabel(lang,badge.aantal)}</span></div>
      <div className='menu-bellen-kop-knoppen'>
        <button type='button' className={`menu-bellen-info is-icoon${uitlegOpen?' is-actief':''}`} data-menu-bellen-info='1' aria-expanded={uitlegOpen} aria-controls={uitlegId} aria-label={tr(lang,'Що означає позначка','Wat betekent de stip')} {...icoonKnopHandlers('kop:info',tr(lang,'Пояснення позначки','Uitleg van de stip'),()=>setUitlegOpen(v=>!v))}><Info aria-hidden='true'/></button>
        <button type='button' className='menu-bellen-sluit is-icoon' data-menu-bellen-sluit='1' aria-label={tr(lang,'Закрити вікно сповіщень','Meldingenvenster sluiten')} {...icoonKnopHandlers('kop:sluit',tr(lang,'Закрити','Sluiten'),()=>{(onSluitVenster||onEsc)()}) }><X aria-hidden='true'/></button>
      </div>
    </div>
    <p id={uitlegId} className={`menu-bellen-uitleg${uitlegOpen?' is-open':''}`} data-menu-bellen-uitleg='1'>{stipUitleg(lang,label,badge)}</p>
    <div className='menu-bellen-legenda' aria-hidden='true'>
      {aanwezigeStaten.map(s=><span key={`s:${s}`} className='menu-bellen-legenda-item' data-staat={s}><i/>{STAAT_LEGENDA[s][lang==='uk'?0:1]}</span>)}
      {losseCategorieen.map(c=><span key={`c:${c}`} className='menu-bellen-legenda-item' data-categorie={c}><i/>{CATEGORIE_TEKST[c][lang==='uk'?0:1]}</span>)}
    </div>
    <ul onScroll={()=>{if(zweeftipRef.current)sluitZweeftip()}}>{kaarten.map(({m,info,groepLeden,apparaatIds},i)=><li key={m.id} className='menu-bel' data-categorie={m.categorie} data-staat={info.staat} data-schema={info.schemaId} data-merk={info.merk||undefined} data-melding-id={m.id} style={{animationDelay:`${i*45}ms`}}>
      <span className='menu-bel-anker' aria-hidden='true'>
        {info.merk?<MerkLogo id={info.merk} logo={info.merk} naam={info.merkNaam} maat={22}/>:<BelAnkerIcoon icoon={info.icoon}/>}
        <i className='menu-bel-staat-stip'/>
      </span>
      <div className='menu-bel-inhoud'>
        <div className='menu-bel-boven'>
          <small className='menu-bel-soort'>{info.soortTekst}{groepLeden.length>1?` · ×${groepLeden.length}`:''}{m.op?` · ${tijd(lang,m.op)}`:''}</small>
          <div className='menu-bel-acties'>
            <button type='button' className='menu-bel-openen is-icoon' data-menu-bel-openen='1' aria-label={tr(lang,`Відкрити: ${info.schoonTitel}`,`Openen: ${info.schoonTitel}`)} {...icoonKnopHandlers(`open:${m.id}`,tr(lang,'Відкрити сповіщення','Melding openen'),()=>onOpen(m))}><span className='mr-sr'>{tr(lang,'Відкрити','Openen')}</span><ExternalLink aria-hidden='true'/></button>
            <button type='button' className='menu-bel-weg is-icoon' data-menu-bel-weg='1' aria-label={tr(lang,`Очистити: ${info.schoonTitel}`,`Opruimen: ${info.schoonTitel}`)} {...icoonKnopHandlers(`weg:${m.id}`,tr(lang,'Очистити (позначити прочитаним)','Opruimen (als gelezen markeren)'),()=>{for(const lid of groepLeden)onSluit(lid)})}>{tr(lang,'Очистити','Opruimen')}<Check aria-hidden='true'/></button>
          </div>
        </div>
        <div className='menu-bel-tekst'>
          <button type='button' className='menu-bel-titel' onClick={()=>onOpen(m)}>{info.schoonTitel}</button>
          {m.tekst&&<p>{m.tekst}</p>}
        </div>
        {apparaatIds.length>0&&<div className='menu-bel-bevestig'>
          <a className='menu-bel-keuze is-fout' href={m.link||'https://id.tarasevych.com/sessions'} data-menu-bel-niet-ik='1' onClick={()=>(onSluitVenster||onEsc)()}><ShieldAlert aria-hidden='true'/><span>{tr(lang,'Це не я','Dit was ik niet')}</span></a>
          <button type='button' className='menu-bel-keuze is-goed' data-menu-bel-was-ik='1' onClick={()=>{void bevestigApparaatBekend(apparaatIds);for(const lid of groepLeden)onSluit(lid)}}><ShieldCheck aria-hidden='true'/><span>{tr(lang,'Це був я','Dit was ik')}</span></button>
        </div>}
      </div>
    </li>)}</ul>
    <div className='menu-bellen-voet'>
      <span className='menu-bellen-voet-status' aria-hidden='true'>{voetStatus}</span>
      <button type='button' className='menu-bellen-alles is-icoon' data-menu-bellen-alles='1' aria-label={allesTekst} {...icoonKnopHandlers('voet:alles',allesTekst,onAllesWeg)}><span className='mr-sr'>{allesTekst}</span><CheckCheck aria-hidden='true'/></button>
      <button type='button' className='menu-bellen-paneel is-icoon' data-menu-bellen-paneel='1' aria-label={tr(lang,'Усі сповіщення (Пульт уваги)','Alle meldingen (Aandachtspaneel)')} {...icoonKnopHandlers('voet:paneel',tr(lang,'Усі сповіщення (Пульт уваги)','Alle meldingen (Aandachtspaneel)'),()=>{window.dispatchEvent(new CustomEvent(MELDINGEN_OPENEN_EVENT));(onSluitVenster||onEsc)()})}><Bell aria-hidden='true'/><span className='mr-sr'>{tr(lang,'Усі сповіщення','Alle meldingen')}</span></button>
    </div>
    {zweeftip&&<div ref={tipRef} className='menu-bellen-zweeftip' role='status' aria-live='polite' data-menu-bellen-zweeftip={zweeftip.sleutel} data-modus={zweeftip.modus} data-richting={tipPos.richting} style={{left:tipPos.left,top:tipPos.top}}>
      {zweeftip.modus==='touch'&&<i aria-hidden='true'/>}
      <span>{zweeftip.tekst}</span>
    </div>}
  </div>;
}
