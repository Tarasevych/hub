// Import met VOORBEELD: bestanden kiezen (.md/.txt/.json, ook slepen), de server zegt wat er in komt, wat dubbel is en wat
// mislukt; pas na «Імпортувати» wordt er iets aangemaakt. Export: JSON (de export van deze pagina, terug te importeren) of
// Markdown (één bestand met frontmatter per notitie). Bestanden worden in de browser gelezen en als tekst gestuurd — nooit
// uitgevoerd, nooit als HTML getoond.
import { useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Upload } from 'lucide-react';
import { VN_IMPORT_MAX_BESTANDEN, VN_IMPORT_MAX_BYTES, exportJson, exportMarkdown, type NotitieMap } from '../../shared/notities-vnext-model';
import Laag from './Laag';
import { NotitiesFout, notitiesClient, type ImportVoorbeeldUit } from './notities-client';
import { SOORT_LABEL, foutTekst, tr, type Lang } from './tekst';

type Props = { lang: Lang; smal: boolean; mappen: NotitieMap[]; onSluit: () => void; onKlaar: (aantal: number) => void };
type Bestand = { naam: string; tekst: string };
const FORMAAT = /\.(md|markdown|txt|text|json)$/i;

export default function NotitiesImport({ lang, smal, mappen, onSluit, onKlaar }: Props) {
  const [bestanden, setBestanden] = useState<Bestand[]>([]);
  const [voorbeeld, setVoorbeeld] = useState<ImportVoorbeeldUit | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [ookDubbelen, setOokDubbelen] = useState(false);
  const [mapId, setMapId] = useState<string>('');
  const [etiket, setEtiket] = useState('');
  const [sleep, setSleep] = useState(false);
  const [exportBezig, setExportBezig] = useState(false);
  const invoer = useRef<HTMLInputElement | null>(null);

  const lees = async (lijst: FileList | File[]) => {
    setFout(''); setVoorbeeld(null);
    const files = Array.from(lijst).slice(0, VN_IMPORT_MAX_BESTANDEN);
    const uit: Bestand[] = []; let bytes = 0;
    for (const f of files) {
      if (!FORMAAT.test(f.name)) { uit.push({ naam: f.name, tekst: '' }); continue; }
      bytes += f.size;
      if (bytes > VN_IMPORT_MAX_BYTES) { setFout(tr(lang, 'Разом понад 4 МБ — виберіть менше файлів.', 'Samen meer dan 4 MB — kies minder bestanden.')); return; }
      uit.push({ naam: f.name, tekst: await f.text() });
    }
    setBestanden(uit);
    if (!uit.length) return;
    setBezig(true);
    try { setVoorbeeld(await notitiesClient.importVoorbeeld(uit)); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
    finally { setBezig(false); }
  };
  const voerUit = async () => {
    if (!voorbeeld || bezig) return;
    setBezig(true); setFout('');
    try {
      const uit = await notitiesClient.importUitvoeren(bestanden, { ookDubbelen, mapId: mapId || null, etiket });
      onKlaar(uit.aangemaakt.length);
    } catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); setBezig(false); }
  };
  const download = (naam: string, inhoud: string, type: string) => {
    const url = URL.createObjectURL(new Blob([inhoud], { type }));
    const a = document.createElement('a'); a.href = url; a.download = naam; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const exporteer = async (vorm: 'json' | 'md') => {
    setExportBezig(true); setFout('');
    try {
      const d = await notitiesClient.export(true);
      const stempel = new Date().toISOString().slice(0, 10);
      if (vorm === 'json') download(`mijn-ruimte-notities-${stempel}.json`, exportJson(d.notities, d.mappen), 'application/json');
      else download(`mijn-ruimte-notities-${stempel}.md`, exportMarkdown(d.notities), 'text/markdown');
    } catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
    finally { setExportBezig(false); }
  };
  const nieuw = voorbeeld ? voorbeeld.items.filter((i) => !i.dubbel).length + (ookDubbelen ? voorbeeld.items.filter((i) => i.dubbel).length : 0) : 0;

  return (
    <Laag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={tr(lang, 'Імпорт та експорт', 'Import en export')} onSluit={onSluit} data={{ 'vn-import': '1' }}>
      <section className='vn-import'>
        <h3><Upload aria-hidden='true' />{tr(lang, 'Імпортувати файли', 'Bestanden importeren')}</h3>
        <p className='vn-hint'>{tr(lang, 'Markdown (.md), текст (.txt) або JSON-експорт цієї сторінки. Спершу — попередній перегляд: що додасться, що вже є, що не прочиталось.', 'Markdown (.md), tekst (.txt) of de JSON-export van deze pagina. Eerst een voorbeeld: wat erbij komt, wat er al is, wat niet te lezen was.')}</p>
        <div className={`vn-sleepvak${sleep ? ' is-sleep' : ''}`} onDragOver={(e) => { e.preventDefault(); setSleep(true); }} onDragLeave={() => setSleep(false)} onDrop={(e) => { e.preventDefault(); setSleep(false); void lees(e.dataTransfer.files); }}>
          <FileText aria-hidden='true' />
          <span>{tr(lang, 'Перетягніть файли сюди або', 'Sleep bestanden hierheen of')}</span>
          <button type='button' className='vn-knop' onClick={() => invoer.current?.click()} data-vn-eerste data-vn-import-kies='1'>{tr(lang, 'Вибрати файли', 'Bestanden kiezen')}</button>
          <input ref={invoer} type='file' multiple accept='.md,.markdown,.txt,.text,.json,text/markdown,text/plain,application/json' className='vn-verborgen' onChange={(e) => { if (e.target.files) void lees(e.target.files); e.target.value = ''; }} aria-label={tr(lang, 'Файли для імпорту', 'Bestanden voor import')} />
        </div>
        {fout ? <p className='vn-melding is-fout' role='alert'><AlertCircle aria-hidden='true' />{fout}</p> : null}
        {bezig && !voorbeeld ? <p className='vn-hint' role='status'>{tr(lang, 'Перевіряю файли…', 'Bestanden controleren…')}</p> : null}
        {voorbeeld ? (
          <div className='vn-import-voorbeeld' data-vn-import-voorbeeld={String(voorbeeld.items.length)}>
            <p className='vn-import-telling'>
              <strong>{voorbeeld.items.length}</strong> {tr(lang, 'записів у', 'items in')} {voorbeeld.bestanden} {tr(lang, 'файлах', 'bestanden')} · <strong>{voorbeeld.nieuw}</strong> {tr(lang, 'нових', 'nieuw')} · <strong>{voorbeeld.dubbel}</strong> {tr(lang, 'дублікатів', 'dubbel')} · <strong>{voorbeeld.fouten.length}</strong> {tr(lang, 'помилок', 'fouten')}
            </p>
            <ul className='vn-import-lijst'>
              {voorbeeld.items.slice(0, 50).map((it, i) => (
                <li key={`${it.vingerafdruk}-${i}`} className={it.dubbel ? 'is-dubbel' : ''}>
                  <strong>{it.titel}</strong>
                  <small>{tr(lang, SOORT_LABEL[it.soort][0], SOORT_LABEL[it.soort][1])} · {it.bestand} · {it.inhoud.length} {tr(lang, 'симв.', 'tekens')}{it.etiketten.length ? ` · #${it.etiketten.join(' #')}` : ''}</small>
                  {it.dubbel ? <em>{it.dubbel === 'bestaand' ? tr(lang, 'вже є в нотатках', 'staat al in de notities') : tr(lang, 'дублікат у цьому імпорті', 'dubbel binnen deze import')}</em> : null}
                </li>
              ))}
              {voorbeeld.items.length > 50 ? <li><small>… {tr(lang, 'та ще', 'en nog')} {voorbeeld.items.length - 50}</small></li> : null}
              {voorbeeld.fouten.map((f, i) => <li key={`f${i}`} className='is-fout'><strong>{f.bestand}</strong><em><AlertCircle aria-hidden='true' />{foutTekst(lang, f.fout)}</em></li>)}
            </ul>
            <div className='vn-vorm-rij'>
              <label className='vn-veld'><span>{tr(lang, 'У теку', 'In map')}</span>
                <select value={mapId} onChange={(e) => setMapId(e.target.value)}><option value=''>{tr(lang, '— без теки —', '— geen map —')}</option>{mappen.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}</select></label>
              <label className='vn-veld'><span>{tr(lang, 'Додати тег', 'Etiket erbij')}</span><input value={etiket} maxLength={40} placeholder={tr(lang, 'напр. імпорт-2026', 'bv. import-2026')} onChange={(e) => setEtiket(e.target.value)} /></label>
            </div>
            {voorbeeld.dubbel ? <label className='vn-schakel'><input type='checkbox' checked={ookDubbelen} onChange={(e) => setOokDubbelen(e.target.checked)} />{tr(lang, 'Імпортувати й дублікати', 'Ook de dubbele importeren')}</label> : null}
            <div className='vn-knoppen'>
              <button type='button' className='vn-knop is-hoofd' disabled={bezig || nieuw === 0} onClick={() => void voerUit()} data-vn-import-uitvoeren='1'><Upload aria-hidden='true' />{tr(lang, `Імпортувати ${nieuw}`, `${nieuw} importeren`)}</button>
              <button type='button' className='vn-knop is-stil' onClick={() => { setVoorbeeld(null); setBestanden([]); }}>{tr(lang, 'Інші файли', 'Andere bestanden')}</button>
            </div>
          </div>
        ) : null}
      </section>
      <section className='vn-import'>
        <h3><Download aria-hidden='true' />{tr(lang, 'Експортувати', 'Exporteren')}</h3>
        <p className='vn-hint'>{tr(lang, 'Усі нотатки цього простору (разом з архівом; кошик — ні). JSON можна імпортувати назад; Markdown — читати будь-де.', 'Alle notities van deze ruimte (met archief; de prullenbak niet). JSON kunt u terug importeren; Markdown leest u overal.')}</p>
        <div className='vn-knoppen'>
          <button type='button' className='vn-knop' disabled={exportBezig} onClick={() => void exporteer('json')} data-vn-export='json'><Download aria-hidden='true' />JSON</button>
          <button type='button' className='vn-knop' disabled={exportBezig} onClick={() => void exporteer('md')} data-vn-export='md'><Download aria-hidden='true' />Markdown</button>
        </div>
      </section>
    </Laag>
  );
}
