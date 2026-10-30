import { useEffect, useState, type ChangeEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Download, FilePlus2, LoaderCircle, ShieldCheck, Info } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { CANONICAL_AUTH_CHANGE } from '../canoniek-gebeurtenissen';
import { MailAttachmentPreviewContent, loadMailAttachmentPreviewFromBlob, revokeMailAttachmentPreview,
  type MailAttachmentPreview } from '../MailBijlageVoorbeeld';
import { formaatVan } from '../../shared/bestandsformaten';
import { verbindUniverseelBestand, wisWachtendeBestanden, VOORBEELD_MAX_BYTES,
  MAX_OPEN_VENSTERS, openUniverseelBestand, type OpenBestand } from './universeel-bestand';
import './universeel-bestand.css';

type OpenVenster = OpenBestand & { id: string };
const huidigeTaal = (): 'uk'|'nl' => document.documentElement.lang.toLowerCase().startsWith('nl') ? 'nl' : 'uk';
const tekst = (lang:'uk'|'nl', uk:string, nl:string) => lang==='uk'?uk:nl;
let root: Root|null=null;
export function startUniverseelBestandVenster(): void {
  if(root) return;
  const host = document.createElement('div');
  host.id = 'universele-bestandsvensters';
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<UniverseleBestandsvensters />);
}

function UniverseleBestandsvensters() {
  const [items,setItems] = useState<OpenVenster[]>([]);
  const [lang,setLang] = useState<'uk'|'nl'>(huidigeTaal);
  useEffect(() => {
    const los = verbindUniverseelBestand((intent) => {
      const id = `ub-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`;
      setItems(old => [...old.slice(-(MAX_OPEN_VENSTERS-1)),{...intent,id}]);
    });
    // Clear all Blob references on session or account change. Never persist file bytes here.
    const wis = () => { wisWachtendeBestanden(); setItems([]); };
    window.addEventListener(CANONICAL_AUTH_CHANGE,wis);
    const observeer = new MutationObserver(()=>setLang(huidigeTaal()));
    observeer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    return () => { los(); observeer.disconnect(); window.removeEventListener(CANONICAL_AUTH_CHANGE,wis); };
  }, []);
  return <>{items.map(item => <UniverseelVenster key={item.id} item={item} lang={lang}
    onSluit={()=>setItems(current=>current.filter(x=>x.id!==item.id))}/>)}</>;
}

function UniverseelVenster({item,lang,onSluit}:{item:OpenVenster;lang:'uk'|'nl';onSluit:()=>void}) {
  const [preview,setPreview] = useState<MailAttachmentPreview|null>(null);
  const [bezig,setBezig] = useState(false);
  const [fout,setFout] = useState('');
  const [info,setInfo] = useState(false);
  const [importeer,setImporteer] = useState(false);
  const formaat = formaatVan(item.bestandsnaam,item.contentType);
  const groter = item.bestand.size > VOORBEELD_MAX_BYTES;
  useEffect(()=>{
    if (groter) return;
    let actief = true;
    setBezig(true);setFout('');setPreview(null);
    void loadMailAttachmentPreviewFromBlob({blob:item.bestand,filename:item.bestandsnaam,
      contentType:item.contentType||item.bestand.type||'application/octet-stream'})
      .then(result=>{ if(actief) setPreview(result); else revokeMailAttachmentPreview(result); })
      .catch(()=>{if(actief) setFout(tekst(lang,'Не вдалося підготувати безпечний перегляд. Оригінал можна завантажити.','Veilige voorvertoning mislukt. Download het origineel.'));})
      .finally(()=>{if(actief)setBezig(false)});
    return()=>{actief=false;};
  },[item.bestand,item.bestandsnaam,item.contentType,groter]);
  useEffect(()=>()=>{if(preview)revokeMailAttachmentPreview(preview)},[preview]);
  function download() {
    const url=URL.createObjectURL(item.bestand);
    const a=document.createElement('a');a.href=url;a.download=item.bestandsnaam;a.rel='noopener';
    document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const label = item.bronLabel || ({'mail':'Mail','microsoft-mail':'Outlook','google-drive':'Google Drive','onedrive':'OneDrive','dropbox':'Dropbox','private-cloud':'Cloud','github':'GitHub','gitlab':'GitLab','browser-file':'ПК','device-agent':'Локальний агент','notes':'Нотатки','tasks':'Завдання','ai':'ШІ','plugin':'Інтеграція'} satisfies Record<OpenBestand['bron'],string>)[item.bron];
  return <Venster id={item.id} titel={item.bestandsnaam} lang={lang} breedte={920} hoogte={690}
    modaal={false} onSluit={onSluit} className='universeel-bestand-venster'>
    <section className='universeel-bestand' data-universele-bron={item.bron}>
      <div className='universeel-bestand-balk'>
        <span className='universeel-bron'>{label}</span><span className='universeel-type'>{formaat.label}</span>
        <span className='universeel-grootte'>{(item.bestand.size/1024).toLocaleString(lang==='uk'?'uk-UA':'nl-BE',{maximumFractionDigits:0})} KB</span>
        <div className='universeel-spacer'/>
        <button type='button' onClick={()=>setInfo(v=>!v)} aria-expanded={info} title={tekst(lang,'Властивості','Eigenschappen')}><Info size={16}/></button>
        <button type='button' onClick={()=>setImporteer(v=>!v)} title={tekst(lang,'Відкрити локальний файл','Lokaal bestand openen')}><FilePlus2 size={16}/><span>{tekst(lang,'Інший файл','Ander bestand')}</span></button>
        <button type='button' onClick={download}><Download size={16}/><span>{tekst(lang,'Завантажити','Downloaden')}</span></button>
      </div>
      {importeer&&<label className='universeel-kies'>
        {tekst(lang,'Оберіть файл на цьому пристрої','Kies een bestand op dit apparaat')}
        <input type='file' onChange={(event:ChangeEvent<HTMLInputElement>)=>{
          const file=event.currentTarget.files?.[0];if(!file)return;
          openUniverseelBestand({bron:'browser-file',bestand:file,bestandsnaam:file.name,contentType:file.type});
          event.currentTarget.value='';setImporteer(false);
        }}/>
      </label>}
      {info&&<div className='universeel-bestand-info'><ShieldCheck size={16}/><span>{tekst(lang,'Рушій: наявна система перегляду Mijn Ruimte. Файл уже наданий джерелом; додаткових дозволів або завантаження на інший сервер немає.','Motor: bestaande Mijn Ruimte-voorvertoning. De bron heeft het bestand al geleverd; geen extra toegang of upload naar andere servers.')}</span><span>{item.contentType||'application/octet-stream'}</span></div>}
      <div className='universeel-bestand-werkvlak' role='region' aria-label={tekst(lang,'Область перегляду файла','Bestandsvoorbeeld')}>
        {groter?<div className='universeel-bestand-fallback'>{tekst(lang,'Файл перевищує ліміт перегляду 32 МБ. Завантаження оригіналу доступне.','Bestand groter dan de limiet van 32 MB. Het origineel kan worden gedownload.')}</div>
          :bezig?<div className='universeel-bestand-laden' role='status'><LoaderCircle className='spin'/>{tekst(lang,'Готуємо перегляд…','Voorvertoning voorbereiden…')}</div>
          :fout?<div className='universeel-bestand-fallback' role='alert'>{fout}</div>
          :preview?<div className="mail-viewer-preview-cache universeel-bestand-inhoud"><div className="mail-viewer-cache-panel"><div className={`mail-viewer-scaled-content kind-${preview.descriptor.kind}`}><MailAttachmentPreviewContent preview={preview} lang={lang}/></div></div></div>
          :<div className='universeel-bestand-fallback'>{tekst(lang,'Для цього файла немає доступного перегляду.','Geen voorvertoning beschikbaar.')}</div>}
      </div>
    </section>
  </Venster>;
}
