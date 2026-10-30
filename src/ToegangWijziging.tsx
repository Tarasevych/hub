// Pagina-paneel bij de melding «Це були ви? / Was u dit?» (link https://id.tarasevych.com/methods?wijziging=<id>), zoals Google
// «Was this you?»: wat er veranderd is (welk recht, welke sleutel), wie, wanneer, waarom, vanaf welk apparaat/IP-hash, en de knop
// «Це був не я — скасувати та захистити акаунт». Die vraagt een sterke bevestiging, draait terug wat technisch kan (intrekverzoek
// dat root nog niet verwerkte weghalen; verwijderde passkey terugzetten) en beëindigt de sessie die de wijziging deed. Eerlijk:
// heeft root het recht al weggehaald, dan kan alleen root het teruggeven (SSH-opdracht hieronder). RUNBOOK §13.10.
import {useEffect,useState} from 'react';
import {ShieldAlert,ShieldCheck,TriangleAlert,X} from 'lucide-react';
import {api} from './platform/client';
import {foutCode} from './platform/webauthn';
import {WIJZIGING_TEKST,WijzigingDetails,type Wijziging} from './ToegangContext';
import type {Lang} from './toegangslaag-teksten';

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
type Stand={recht:'kan-goedkeuren'|'wordt-ingetrokken'|'ingetrokken';passkeyAanwezig:boolean;passkeyId:string|null;sshOpdracht:string}|null;
type Antwoord={wijziging:Wijziging;stand:Stand;kanTerugdraaien:boolean};
type Uitkomst={recht?:'behouden'|'ssh-nodig'|'niet-hersteld';sshOpdracht?:string;passkeyTerug?:boolean;sessie?:'ingetrokken'|'huidige-sessie'|'al-beeindigd'};
const FOUT:Record<string,[string,string]>={
  NIET_GEVONDEN:['Цю зміну не знайдено у вашому акаунті.','Deze wijziging is niet gevonden in uw account.'],
  AL_TERUGGEDRAAID:['Цю зміну вже скасовано.','Deze wijziging is al teruggedraaid.'],
  ALLEEN_EIGENAAR_KAN_HERSTELLEN:['Повернути це право може лише власник. Зверніться до нього.','Alleen de eigenaar kan dit recht teruggeven. Neem contact met hem op.'],
  NIET_TERUG_TE_DRAAIEN:['Цю зміну не потрібно скасовувати.','Deze wijziging hoeft niet teruggedraaid te worden.'],
  OWNER_REQUIRED:['Це може лише власник.','Dit kan alleen de eigenaar.'],
  STEP_UP_STRONG_REQUIRED:['Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.','Bevestiging met passkey, app-code of herstelcode is nodig.'],
  STEP_UP_REQUIRED:['Потрібне додаткове підтвердження. Спробуйте ще раз.','Extra bevestiging is nodig. Probeer het opnieuw.'],
  RATE_LIMITED:['Забагато спроб. Зачекайте кілька хвилин.','Te veel pogingen. Wacht een paar minuten.'],
};
const foutTekst=(lang:Lang,c:string)=>FOUT[c]?tr(lang,FOUT[c][0],FOUT[c][1]):tr(lang,`Не вдалося (${c||'немає зв’язку'}).`,`Mislukt (${c||'geen verbinding'}).`);
export const wijzigingUitUrl=()=>{try{const v=new URLSearchParams(location.search).get('wijziging')||'';return /^[0-9a-f-]{36}$/i.test(v)?v:'';}catch{return '';}};

export function ToegangWijziging({lang,context,id,onChange}:{lang:Lang;context:Record<string,unknown>;id:string;onChange?:()=>void}){
  const[a,setA]=useState<Antwoord|null>(null);
  const[fout,setFout]=useState('');
  const[bezig,setBezig]=useState(false);
  const[uitkomst,setUitkomst]=useState<Uitkomst|null>(null);
  const[weg,setWeg]=useState(false);
  const laden=async()=>{try{setA((await api.post('/api/owner/access/toegang/wijziging',{...context,id})).data as Antwoord);}catch(c){setFout(foutTekst(lang,foutCode(c)));}};
  useEffect(()=>{void laden();},[id]);// eslint-disable-line react-hooks/exhaustive-deps
  const sluiten=()=>{setWeg(true);try{const u=new URL(location.href);u.searchParams.delete('wijziging');history.replaceState(history.state,'',u.toString());}catch{/* negeren */}};
  const terugdraaien=async()=>{
    setBezig(true);setFout('');
    try{
      const r=(await api.post('/api/owner/access/toegang/wijziging/terugdraaien',{...context,id})).data as {uitkomst:Uitkomst;wijziging:Wijziging;stand:Stand};
      setUitkomst(r.uitkomst);setA(x=>x?{...x,wijziging:r.wijziging,stand:r.stand,kanTerugdraaien:false}:x);onChange?.();
    }catch(c){setFout(foutTekst(lang,foutCode(c)));}
    finally{setBezig(false);}
  };
  if(weg)return null;
  const w=a?.wijziging;
  const t=w?WIJZIGING_TEKST[w.soort]:null;
  const ssh=uitkomst?.sshOpdracht||(a?.stand&&a.stand.recht==='ingetrokken'?a.stand.sshOpdracht:'');
  return <section className='access-plane-section toegang-wijziging' data-toegang-wijziging={id} aria-labelledby='toegang-wijziging-titel'>
    <header className='access-plane-section-head'><h2 id='toegang-wijziging-titel'><ShieldAlert aria-hidden='true'/>{tr(lang,'Це були ви?','Was u dit?')}</h2>
      <button type='button' className='secondary toegang-sluit' aria-label={tr(lang,'Закрити','Sluiten')} onClick={sluiten}><X/></button></header>
    <div className='access-plane-box'>
      {!a&&!fout&&<p className='access-plane-subrow'>{tr(lang,'Завантаження…','Laden…')}</p>}
      {w&&<div className='access-plane-subrow'>
        <p className='toegang-wijziging-wat'><strong>{t?tr(lang,t[0],t[1]):w.soort}</strong>{w.ongedaanOp&&<span className='access-plane-badge tone-info'>{tr(lang,'Скасовано','Teruggedraaid')}</span>}</p>
        <WijzigingDetails lang={lang} w={w}/>
        {a?.stand&&<p className='toegang-wijziging-stand' data-stand={a.stand.recht}>{
          a.stand.recht==='kan-goedkeuren'?tr(lang,'Зараз: ключ може схвалювати оновлення.','Nu: de sleutel mag updates goedkeuren.')
          :a.stand.recht==='wordt-ingetrokken'?tr(lang,'Зараз: сервер ще не обробив відкликання — його можна скасувати, і право залишиться.','Nu: de server heeft het intrekken nog niet verwerkt — terugdraaien kan, en het recht blijft.')
          :tr(lang,'Зараз: сервер уже відкликав право цього ключа.','Nu: de server heeft het recht van deze sleutel al ingetrokken.')}</p>}
      </div>}
      {uitkomst&&<div className='access-plane-subrow toegang-uitkomst' data-uitkomst={uitkomst.recht||''} role='status'>
        <p><ShieldCheck aria-hidden='true'/>{uitkomst.recht==='behouden'
          ?tr(lang,'Зміну скасовано: право схвалювати оновлення збережено.','Wijziging teruggedraaid: het recht om updates goed te keuren is behouden.')
          :uitkomst.recht==='ssh-nodig'?tr(lang,'Сервер уже відкликав право. Автоматично повернути його неможливо: це робиться лише на сервері командою нижче (через SSH).','De server had het recht al ingetrokken. Automatisch teruggeven kan niet: dat gebeurt alleen op de server met de opdracht hieronder (via SSH).')
          :tr(lang,'Право не відновлено.','Het recht is niet teruggezet.')}</p>
        {uitkomst.passkeyTerug&&<p>{tr(lang,'Видалений passkey повернуто до вашого акаунта.','De verwijderde passkey staat weer in uw account.')}</p>}
        <p>{uitkomst.sessie==='ingetrokken'?tr(lang,'Сесію, з якої зробили зміну, завершено.','De sessie waarmee de wijziging gedaan is, is beëindigd.')
          :uitkomst.sessie==='huidige-sessie'?tr(lang,'Зміну зроблено з цієї ж сесії, тому її не завершено.','De wijziging is vanuit deze zelfde sessie gedaan; die is daarom niet beëindigd.')
          :tr(lang,'Сесія, з якої зробили зміну, уже завершена.','De sessie waarmee de wijziging gedaan is, was al beëindigd.')}</p>
      </div>}
      {ssh&&<p className='access-plane-subrow'><small>{tr(lang,'Повернути право може лише сервер (root). Виконайте через SSH і звірте відбиток:','Alleen de server (root) kan het recht teruggeven. Voer via SSH uit en vergelijk de vingerafdruk:')}</small> <code className='access-plane-mono access-plane-ssh'>{ssh}</code></p>}
      {w&&w.soort==='voorbereider-ingetrokken'&&<p className='access-plane-subrow access-plane-hint-line'>{tr(lang,'Повернути право готувати оновлення може лише власник. Якщо це помилка — зверніться до нього.','Alleen de eigenaar kan het recht om updates voor te bereiden teruggeven. Is dit een vergissing, neem dan contact met hem op.')}</p>}
      {a?.kanTerugdraaien&&!uitkomst&&<div className='access-plane-subrow toegang-niet-ik'>
        <p className='access-plane-hint-line'><TriangleAlert aria-hidden='true'/>{tr(lang,'Якщо це зробили не ви: ми скасуємо зміну, де це технічно можливо, і завершимо сесію, з якої її зробили. Якщо сервер уже відкликав право, повернути його можна лише SSH-командою (ми її покажемо). Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.','Was u dit niet: we draaien de wijziging terug waar dat technisch kan en beëindigen de sessie waarmee ze gedaan is. Heeft de server het recht al ingetrokken, dan kan alleen een SSH-opdracht het teruggeven (we tonen die). Bevestiging met passkey, app-code of herstelcode is nodig.')}</p>
        <div className='access-plane-actions'>
          <button type='button' className='danger' data-niet-ik disabled={bezig} onClick={()=>void terugdraaien()}><ShieldAlert/>{tr(lang,'Це був не я — скасувати та захистити акаунт','Dit was ik niet — terugdraaien en mijn account beveiligen')}</button>
          <button type='button' className='secondary' disabled={bezig} onClick={sluiten}>{tr(lang,'Так, це був я','Ja, dit was ik')}</button>
        </div>
      </div>}
      {fout&&<p className='access-plane-notice access-plane-subrow' data-ok='false' role='alert'>{fout}</p>}
    </div>
  </section>;
}
