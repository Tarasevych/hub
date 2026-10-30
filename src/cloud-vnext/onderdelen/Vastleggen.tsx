// Vastleggen («Швидко зберегти»): notitie / link / bestand ≤ 6 MB via de BESTAANDE route /api/owner/cloud/capture
// (cloudClient.capture — velden kind, text, url, fileName, mimeType, fileData(base64), workspaceId, geverifieerd tegen
// backend/cloud-platform.ts). Eerlijk over de grenzen: hier 6 MB en de witte lijst van typen; grotere bestanden gaan
// via «Мої файли» (tot 64 MB in stukken). Na succes: melding + overzicht verversen. Dit onderdeel werkt al vandaag —
// het hangt niet op de vNext-routes die nog in aanbouw zijn.
import { useRef, useState } from 'react';
import { Link2, NotebookPen, Upload } from 'lucide-react';
import { cloudTekst } from '../../../shared/cloud-vnext-model';
import { OVERDRACHT_GRENZEN } from '../../../shared/cloud-overdracht-model';
import { CloudFout, cloudClient } from '../cloud-client';
import type { OnderdeelProps } from '../CloudPagina';
import { bytesTekst, tr, type Lang } from '../tekst';

const CAPTURE_MAX = 6 * 1024 * 1024;      // backend/cloud-platform.ts: MAX_FILE_BYTES
const NOTITIE_MAX = 50_000;               // backend/cloud-platform.ts: MAX_NOTE_CHARS
const TYPES_HINT: [string, string] = [
  'JPEG/PNG/WebP/GIF, MP4, PDF, ZIP, DOCX/XLSX/PPTX, ODT/ODS/ODP, TXT/CSV/MD',
  'JPEG/PNG/WebP/GIF, MP4, PDF, ZIP, DOCX/XLSX/PPTX, ODT/ODS/ODP, TXT/CSV/MD',
];

function foutNaarTekst(lang: Lang, e: unknown): string {
  const code = e instanceof CloudFout ? e.code : String((e as Error)?.message || 'FOUT');
  const t: Record<string, [string, string]> = {
    CLOUD_CAPTURE_TEXT_REQUIRED: ['Нотатка порожня.', 'De notitie is leeg.'],
    CLOUD_CAPTURE_URL_INVALID: ['Посилання має починатися з http(s)://.', 'De link moet met http(s):// beginnen.'],
    CLOUD_CAPTURE_FILE_UNSUPPORTED: [`Цей тип файлу тут не приймається. Дозволено: ${TYPES_HINT[0]}.`, `Dit bestandstype wordt hier niet aangenomen. Toegestaan: ${TYPES_HINT[1]}.`],
    CLOUD_CAPTURE_FILE_INVALID: ['Файл не вдалося прочитати.', 'Het bestand kon niet gelezen worden.'],
    CLOUD_CAPTURE_FILE_SIZE: ['Файл більший за 6 МБ — завантажте його через «Мої файли».', 'Het bestand is groter dan 6 MB — upload het via «Mijn bestanden».'],
    CLOUD_WORKSPACE_NOT_FOUND: ['Такого простору немає.', 'Die werkruimte bestaat niet.'],
  };
  const p = t[code]; if (p) return tr(lang, p[0], p[1]);
  return tr(lang, `Не вдалося (${code}).`, `Mislukt (${code}).`);
}

export default function Vastleggen({ lang, ov, vernieuw, toon, naarTab }: OnderdeelProps) {
  const [soort, setSoort] = useState<'note' | 'link' | 'file'>('note');
  const [tekst, setTekst] = useState('');
  const [url, setUrl] = useState('');
  const [werkruimte, setWerkruimte] = useState('');
  const [gekozen, setGekozen] = useState<File | null>(null);
  const [besig, setBesig] = useState(false);
  const [mis, setMis] = useState('');
  const invoer = useRef<HTMLInputElement | null>(null);

  const stuur = async () => {
    setMis('');
    if (soort === 'note' && !tekst.trim()) { setMis(tr(lang, 'Нотатка порожня.', 'De notitie is leeg.')); return; }
    if (soort === 'link' && !/^https?:\/\/.+/i.test(url.trim())) { setMis(tr(lang, 'Посилання має починатися з http(s)://.', 'De link moet met http(s):// beginnen.')); return; }
    if (soort === 'file') {
      if (!gekozen) { setMis(tr(lang, 'Оберіть файл.', 'Kies een bestand.')); return; }
      if (gekozen.size > CAPTURE_MAX) { setMis(tr(lang, `Файл більший за ${bytesTekst(lang, CAPTURE_MAX)} — завантажте його через «Мої файли» (там без штучної межі, частинами і з відновленням).`, `Groter dan ${bytesTekst(lang, CAPTURE_MAX)} — upload het via «Mijn bestanden» (daar zonder kunstmatige grens, in stukken en hervattbaar).`)); return; }
    }
    setBesig(true);
    try {
      let velden: Record<string, unknown>;
      if (soort === 'note') velden = { kind: 'note', text: tekst.trim().slice(0, NOTITIE_MAX) };
      else if (soort === 'link') velden = { kind: 'link', url: url.trim() };
      else {
        const f = gekozen as File;
        const b64 = await new Promise<string>((los, breek) => {
          const lezer = new FileReader();
          lezer.onerror = () => breek(new Error('CLOUD_CAPTURE_FILE_INVALID'));
          lezer.onload = () => los(String(lezer.result || '').split(',')[1] || '');
          lezer.readAsDataURL(f);
        });
        velden = { kind: 'file', fileName: f.name, mimeType: f.type || 'application/octet-stream', fileData: b64 };
      }
      if (werkruimte) velden.workspaceId = werkruimte;
      await cloudClient.capture(velden);
      toon(tr(lang, 'Збережено. Чернетка лежить у «Швидкий вхід», поки ви її не розкладете.', 'Bewaard. Het concept ligt in «Snelle invoer» tot u het opruimt.'));
      setTekst(''); setUrl(''); setGekozen(null); if (invoer.current) invoer.current.value = '';
      await vernieuw();
    } catch (e) { setMis(foutNaarTekst(lang, e)); }
    finally { setBesig(false); }
  };

  const Soorten: Array<['note' | 'link' | 'file', typeof NotebookPen, string, string]> = [
    ['note', NotebookPen, 'Нотатка', 'Notitie'], ['link', Link2, 'Посилання', 'Link'], ['file', Upload, 'Файл', 'Bestand'],
  ];
  return (
    <section className='cvn-blok cvn-vastleggen' data-cvn-vastleggen='' aria-label={tr(lang, 'Швидко зберегти', 'Snel opslaan')}>
      <div className='cvn-chips' role='group' aria-label={tr(lang, 'Що зберігаємо', 'Wat bewaren we')}>
        {Soorten.map(([s, Icoon, uk, nl]) => (
          <button key={s} type='button' className={`cvn-knop is-klein${soort === s ? ' is-actief' : ''}`} aria-pressed={soort === s} data-cvn-soort={s} onClick={() => { setSoort(s); setMis(''); }}>
            <Icoon aria-hidden='true' />{tr(lang, uk, nl)}
          </button>
        ))}
      </div>
      {mis ? <p className='cvn-melding is-fout' role='alert'>{mis}</p> : null}
      <form className='cvn-vast-vorm' onSubmit={(e) => { e.preventDefault(); void stuur(); }}>
        {soort === 'note' ? (
          <label>{tr(lang, 'Текст нотатки', 'Tekst van de notitie')}
            <textarea value={tekst} maxLength={NOTITIE_MAX} rows={6} data-cvn-eerste='' onChange={(e) => setTekst(e.target.value)} placeholder={tr(lang, 'Думка, список, чернетка…', 'Een gedachte, lijstje, concept…')} />
          </label>
        ) : null}
        {soort === 'link' ? (
          <label>{tr(lang, 'Адреса (http/https)', 'Adres (http/https)')}
            <input type='url' value={url} onChange={(e) => setUrl(e.target.value)} placeholder='https://…' inputMode='url' />
          </label>
        ) : null}
        {soort === 'file' ? (
          <label>{tr(lang, 'Файл (до 6 МБ)', 'Bestand (tot 6 MB)')}
            <input ref={invoer} type='file' data-cvn-upload='vastleggen' onChange={(e) => { setGekozen(e.target.files?.[0] || null); setMis(''); }} />
            {gekozen ? <span className='cvn-hint'>{gekozen.name} · {bytesTekst(lang, gekozen.size)}</span> : null}
          </label>
        ) : null}
        <label>{tr(lang, 'Простір (не обов’язково — ШІ запропонує сам)', 'Werkruimte (niet verplicht — de AI stelt zelf voor)')}
          <select value={werkruimte} onChange={(e) => setWerkruimte(e.target.value)} data-cvn-ws-filter='vastleggen'>
            <option value=''>{tr(lang, '— без простору —', '— zonder werkruimte —')}</option>
            {(ov?.workspaces || []).map((w) => <option key={w.id} value={w.id}>{w.titel}</option>)}
          </select>
        </label>
        <button type='submit' className='cvn-knop is-hoofd' disabled={besig}>{besig ? tr(lang, 'Збереження…', 'Bewaren…') : tr(lang, 'Зберегти', 'Bewaren')}</button>
      </form>
      <p className='cvn-hint'>
        {tr(lang,
          `Чесно про межі: сюди влазить файл до ${bytesTekst(lang, CAPTURE_MAX)} з білого списку типів (${TYPES_HINT[0]}), нотатка до 50 000 знаків, посилання лише http(s). ${cloudTekst(OVERDRACHT_GRENZEN.eigen.bron, lang)} Більші файли — через `,
          `Eerlijk over de grenzen: hier past een bestand tot ${bytesTekst(lang, CAPTURE_MAX)} uit de witte lijst (${TYPES_HINT[1]}), een notitie tot 50.000 tekens, links alleen http(s). ${cloudTekst(OVERDRACHT_GRENZEN.eigen.bron, lang)} Grotere bestanden gaan via `)}
        <button type='button' className='cvn-knop is-klein is-stil' onClick={() => naarTab('files')}>{tr(lang, '«Мої файли»', '«Mijn bestanden»')}</button>
      </p>
    </section>
  );
}
