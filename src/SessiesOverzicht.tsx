// «Сесії та пристрої» (RUNBOOK §13.11): de bestaande sessiekaarten van het account + de gastsessies uit toegangscodes, in ÉÉN overzicht.
// Per sessie: aanmeldmethode (Google / passkey / toegangscode «naam»), apparaat/browser, gestart, laatst actief, duur; los intrekken of
// «Завершити всі інші» (eigen andere sessies + alle gastsessies; deze sessie blijft). Alleen UA + NL.
import {useCallback,useEffect,useRef,useState} from 'react';
import {LogOut,Ticket,Trash2} from 'lucide-react';
import {api} from './platform/client';
import {swrPost} from './lees-cache';
import {foutCode} from './platform/webauthn';
import {ecosystemTabContext} from './tab-context';
import {leesAanmeldenOnthouden,zetAanmeldenOnthouden} from './aanmelden-onthouden';
import SecuritySessionsPanel,{type SecuritySession} from './BeveiligingSessiesPaneel';
import './toegangslaag.css';

type Tr=(uk:string,nl:string)=>string;
type GastSessie={id:string;codeId:string;codeNaam:string;gestartOp:string;laatstActiefOp:string;verlooptOp:string;apparaat:string|null;ipKort:string|null;actief:boolean};
type Props={tr:Tr;lang:'uk'|'nl';sessions:SecuritySession[];loading:boolean;busy:boolean;onRefresh:()=>void;onRevoke:(s:SecuritySession)=>void|Promise<void>;onRevokeAll:()=>void};
const context=()=>({service:'identity',tabContext:ecosystemTabContext(),sourceOrigin:location.origin});
export const duurTekst=(tr:Tr,ms:number)=>{const m=Math.max(0,Math.round(ms/60000));if(m<60)return tr(`${m} хв`,`${m} min`);const u=Math.floor(m/60);if(u<48)return tr(`${u} год ${m%60} хв`,`${u} u ${m%60} min`);const d=Math.floor(u/24);return tr(`${d} дн ${u%24} год`,`${d} d ${u%24} u`);};

export default function SessiesOverzicht(p:Props){
  const{tr}=p;
  const[gasten,setGasten]=useState<GastSessie[]|null>(null);
  const[bezig,setBezig]=useState(false);
  const[melding,setMelding]=useState('');
  const[bevestig,setBevestig]=useState(false);
  // «Зберегти цей акаунт для наступних сесій» — de keuze van het aanmeldscherm, nu ook HIER zichtbaar en te wijzigen (per apparaat).
  const[onthouden,setOnthouden]=useState(leesAanmeldenOnthouden);
  const eersteLading=useRef(false);
  // Fase B1: bewaarde lijst meteen, dan vers (alleen geheugen, per account); afbreken als de pagina verdwijnt.
  const laden=useCallback(async(o:{signal?:AbortSignal;alleenVers?:boolean}={alleenVers:true})=>{try{await swrPost<{beschikbaar?:boolean;sessies?:GastSessie[]}>('/api/owner/access/gast-sessies/lijst',context(),d=>setGasten(d.beschikbaar===false?null:(d.sessies||[])),o);}catch(e){if(foutCode(e)==='OWNER_REQUIRED')setGasten(null);}},[]);
  useEffect(()=>{if(!eersteLading.current){eersteLading.current=true;if(!p.sessions.length&&!p.loading)p.onRefresh();}const a=new AbortController();void laden({signal:a.signal});return()=>a.abort();},[laden]);// eslint-disable-line react-hooks/exhaustive-deps
  const vernieuw=()=>{p.onRefresh();void laden();};
  const gastIntrekken=async(id:string)=>{setBezig(true);setMelding('');try{await api.post('/api/owner/access/gast-sessies/intrekken',{...context(),id});await laden();setMelding(tr('Гостьову сесію завершено.','De gastsessie is beëindigd.'));}catch{setMelding(tr('Не вдалося завершити гостьову сесію.','De gastsessie kon niet worden beëindigd.'));}finally{setBezig(false);}};
  const alleAndere=async()=>{setBezig(true);setMelding('');try{const r=(await api.post('/api/owner/identity/security/revoke-others',{...context(),gast:true})).data as {sessions:number;tabs:number;grants:number;gast:number};setBevestig(false);p.onRefresh();await laden();setMelding(tr(`Завершено інших входів: ${r.sessions+r.tabs}, забутих браузерів: ${r.grants}, гостьових сесій: ${r.gast}. Цей вхід залишився.`,`Andere aanmeldingen beëindigd: ${r.sessions+r.tabs}, vergeten browsers: ${r.grants}, gastsessies: ${r.gast}. Deze aanmelding blijft actief.`));}catch{setMelding(tr('Не вдалося завершити інші сесії. Дані не втрачено.','De andere sessies konden niet worden beëindigd. Er zijn geen gegevens verloren.'));}finally{setBezig(false);}};
  // IDENTITEIT-013: вимкнення одразу забуває цей браузер на сервері (відкликає його грант), а не лише «з наступного входу».
  const wisselOnthouden=async(aan:boolean)=>{setOnthouden(zetAanmeldenOnthouden(aan));if(aan)return;const g=p.sessions.find(s=>s.kind==='remembered'&&s.current);if(!g)return;setBezig(true);setMelding('');try{await api.post(`/api/owner/identity/security/items/${encodeURIComponent(g.id)}/revoke`,{...context(),kind:'grant'});setMelding(tr('Цей браузер забуто: наступного разу потрібно буде увійти знову.','Deze browser is vergeten: de volgende keer moet u opnieuw aanmelden.'));p.onRefresh();}catch{setMelding(tr('Не вдалося забути цей браузер на сервері. Вибір збережено локально; спробуйте ще раз.','Deze browser kon op de server niet worden vergeten. De keuze is lokaal bewaard; probeer het opnieuw.'));}finally{setBezig(false);}};
  const tijd=(v:string)=>new Date(v).toLocaleString(p.lang==='uk'?'uk-UA':'nl-BE');
  return <div className='sessies-overzicht' data-sessies-overzicht>
    <section className='sessies-acties'>
      {!bevestig?<button type='button' className='identity-danger' data-sessies-alle-andere onClick={()=>setBevestig(true)} disabled={bezig||p.busy}><LogOut/>{tr('Завершити всі інші','Alle andere beëindigen')}</button>
      :<div className='sessies-bevestig' data-bevestig='alle-andere'><p>{tr('Завершити всі інші входи (інші браузери, вкладки, запам’ятовані пристрої) і всі гостьові сесії? Цей вхід залишиться.','Alle andere aanmeldingen (andere browsers, tabbladen, onthouden apparaten) en alle gastsessies beëindigen? Deze aanmelding blijft.')}</p>
        <button type='button' className='identity-danger' onClick={()=>void alleAndere()} disabled={bezig}><LogOut/>{tr('Так, завершити','Ja, beëindigen')}</button>
        <button type='button' className='sessies-secundair' onClick={()=>setBevestig(false)} disabled={bezig}>{tr('Скасувати','Annuleren')}</button></div>}
      {melding&&<p className='sessies-melding' role='status'>{melding}</p>}
    </section>
    <section className='sessies-onthouden' data-sessies-onthouden={onthouden?'aan':'uit'}>
      <h3>{tr('Збереження акаунта на цьому пристрої','Dit account op dit apparaat bewaren')}</h3>
      {/* ID-06 (klacht 20.10): dezelfde schakelaar als elders op de site (.zijbalk-schakel, zie src/ZijbalkInstellingen.tsx),
          niet het reuzen-vinkje van de browser. role='switch' + de eigen spoor/knop; het vinkje zelf is onzichtbaar maar bedienbaar. */}
      <label className='zijbalk-schakel' data-sessies-onthoud-schakel='1'>
        <input type='checkbox' role='switch' checked={onthouden} disabled={bezig} onChange={event=>void wisselOnthouden(event.target.checked)}/>
        <span className='zijbalk-schakel-spoor' aria-hidden='true'><i/></span>
        <span><strong>{tr('Зберегти цей акаунт для наступних сесій','Dit account bewaren voor volgende sessies')}</strong>
        <small>{tr('Цей вибір діє на цьому пристрої й показується на екрані входу. Якщо вимкнути, сервер одразу забуде цей браузер: наступного разу потрібно буде увійти знову, приватний локальний кеш пошти буде видалено після виходу, а акаунт не залишиться у списку для швидкого входу.','Deze keuze geldt op dit apparaat en is zichtbaar op het aanmeldscherm. Uitzetten laat de server deze browser meteen vergeten: de volgende keer meldt u opnieuw aan, de privé lokale mailcache wordt na afmelden gewist en het account blijft niet in de lijst voor snel aanmelden.')}</small></span>
      </label>
    </section>
    <SecuritySessionsPanel tr={tr} sessions={p.sessions} loading={p.loading} busy={p.busy||bezig} onRefresh={vernieuw} onRevoke={p.onRevoke} onRevokeAll={p.onRevokeAll} onShareLocation={()=>{}}/>
    {gasten&&<section className='sessies-gasten' data-gast-sessies>
      <h3><Ticket/>{tr('Гостьові сесії','Gastsessies')}</h3>
      <p className='settings-honest-note'>{tr('Входи за кодами доступу для інших. Гість бачить лише дозволене кодом і лише для читання; це не ваш обліковий запис.','Aanmeldingen met toegangscodes voor anderen. Een gast ziet alleen wat de code toestaat en alleen-lezen; dit is niet uw account.')}</p>
      {gasten.length?<div className='security-session-list'>{gasten.map(g=><article key={g.id} data-gast-sessie={g.id}>
        <div className='security-session-head'><span className='security-device-icon'><Ticket/></span><div><strong>{g.apparaat||tr('Невідомий пристрій','Onbekend apparaat')}</strong><small>{tr(`Вхід за кодом доступу «${g.codeNaam}»`,`Aangemeld met toegangscode «${g.codeNaam}»`)}</small></div></div>
        <dl><div><dt>{tr('Почато','Gestart')}</dt><dd>{tijd(g.gestartOp)}</dd></div><div><dt>{tr('Остання активність','Laatste activiteit')}</dt><dd>{tijd(g.laatstActiefOp)}</dd></div><div><dt>{tr('Тривалість','Duur')}</dt><dd>{duurTekst(tr,new Date(g.laatstActiefOp).getTime()-new Date(g.gestartOp).getTime())}</dd></div><div><dt>{tr('Діє до','Geldig tot')}</dt><dd>{tijd(g.verlooptOp)}</dd></div>{g.ipKort&&<div><dt>{tr('IP (хеш)','IP (hash)')}</dt><dd><code>{g.ipKort}</code></dd></div>}</dl>
        <button type='button' className='security-revoke' onClick={()=>void gastIntrekken(g.id)} disabled={bezig}><Trash2/>{tr('Завершити гостьову сесію','Gastsessie beëindigen')}</button>
      </article>)}</div>:<div className='security-empty'>{tr('Активних гостьових сесій немає.','Geen actieve gastsessies.')}</div>}
    </section>}
  </div>;
}
