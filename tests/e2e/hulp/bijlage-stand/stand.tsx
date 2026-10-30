// Ontwikkelstand voor tests/e2e/bijlage-viewer-v2.e2e.ts: de bijlagewerkbank van mail.* in isolatie (geen server, geen Google).
// ?modus=oud  → de OUDE kop (letterlijke kopie van de markup in GoogleMailWerkruimte.tsx, voor vergelijking/voor-schermafdrukken)
// ?modus=nieuw→ de nieuwe kop (src/bijlage-v2/BijlageWerkbalk) + BijlageV2Context (PDF-balk v2), precies zoals de werkruimte met vlag.
// De inhoud is in beide gevallen de ECHTE MailAttachmentPreviewBody (PDF-engine, afbeelding, video, audio, tekst).
import { StrictMode, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronLeft, ChevronRight, Download, LoaderCircle, Minimize2, PenLine, Printer, Save, Share2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { loadMailAttachmentPreviewFromBlob, MailAttachmentPreviewBody, formatMailAttachmentSize, type MailAttachmentPreview } from '../../../../src/MailBijlageVoorbeeld';
import { resolveMailAttachmentWorkbench, mailAttachmentViewModeLabel, mailAttachmentEditSemanticsLabel } from '../../../../src/mail-bijlage-werkbank';
import BijlageWerkbalk from '../../../../src/bijlage-v2/BijlageWerkbalk';
import { BijlageV2Context } from '../../../../src/bijlage-v2/vlag';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/index.css';
import '../../../../src/google-mail-werkruimte.css';
import '../../../../src/mail-qa-2026-10.css';
import '../../../../src/mail-lezer-verbeteringen.css';
import '../../../../src/mail-bijlage-strook.css';
import '../../../../src/mail-overlay-oppervlak.css';
import '../../../../src/mail-bijlage-werkbank.css';
import '../../../../src/mail-mobiel-passend.css';
import '../../../../src/mail-vaste-indeling.css';

const zoek = new URLSearchParams(location.search);
const lang = (zoek.get('lang') === 'nl' ? 'nl' : 'uk') as 'uk' | 'nl';
const modus = zoek.get('modus') === 'nieuw' ? 'nieuw' : 'oud';
if (zoek.get('zonderfix') === '1') { const s = document.createElement('style'); s.textContent = '.google-mail-attachment-preview .mail-viewer-scaled-content .mail-pdf-preview:not(.mail-pdf-preview-miniature){height:100%;overflow:auto;overscroll-behavior:contain}.google-mail-attachment-preview .mail-viewer-preview-cache{touch-action:auto}'; document.head.appendChild(s); }
document.documentElement.lang = lang;
document.documentElement.classList.add(zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light');
const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
type Bestand = { naam: string; type: string; url: string };
const BESTANDEN: Bestand[] = JSON.parse(zoek.get('bestanden') || '[]');

function Stand() {
  const [index, setIndex] = useState(Number(zoek.get('index') || 0));
  const [preview, setPreview] = useState<MailAttachmentPreview | null>(null);
  const [zoom, setZoom] = useState(1);
  const [weg, setWeg] = useState<'' | 'min' | 'dicht'>('');
  const [log, setLog] = useState<string[]>([]);
  const meld = (s: string) => { setLog((l) => [...l, s]); (window as any).__standLog = [...((window as any).__standLog || []), s]; };
  useEffect(() => {
    const b = BESTANDEN[index]; if (!b) return;
    void fetch(b.url).then((r) => r.blob()).then((blob) => loadMailAttachmentPreviewFromBlob({ blob, filename: b.naam, contentType: b.type })).then(setPreview);
  }, [index]);
  if (weg) return <p data-stand-weg={weg}>{weg}</p>;
  if (!preview) return <LoaderCircle className='spin' />;
  const kind = preview.embeddedPdf ? 'pdf' : preview.descriptor.kind;
  const editorMode: 'edit' | 'annotate' | 'none' = kind === 'pdf' || kind === 'image' ? 'annotate' : 'none';
  const wb = resolveMailAttachmentWorkbench(kind, editorMode);
  const viewMode = mailAttachmentViewModeLabel(lang, wb, zoom), badge = mailAttachmentEditSemanticsLabel(lang, wb.edit);
  const nav = { index, items: BESTANDEN };
  const bewerkLabel = kind === 'pdf' ? t('PDF: анотації / форми', 'PDF: annotaties / formulieren') : t('Підписати / анотувати', 'Ondertekenen / annoteren');
  const oudeKop = <header>
    <div className='mail-workbench-title'><strong>{preview.filename}</strong><span className='mail-workbench-edit-badge' title={t('Тип результату редагування цього формату', 'Type bewerkingsresultaat voor dit formaat')}>{badge}</span></div>
    <div className='mail-viewer-nav'>
      <button type='button' aria-label={t('Попереднє вкладення', 'Vorige bijlage')} disabled={index <= 0} onClick={() => setIndex(index - 1)}><ChevronLeft /></button>
      <span>{`${index + 1} / ${nav.items.length}`}</span>
      <button type='button' aria-label={t('Наступне вкладення', 'Volgende bijlage')} disabled={index >= nav.items.length - 1} onClick={() => setIndex(index + 1)}><ChevronRight /></button>
    </div>
    <div className='mail-viewer-tools' role='toolbar' aria-label={t('Дії вкладення', 'Bijlageacties')} data-mail-viewer-toolbar='content'>
      {wb.zoom === 'canvas' ? <>
        <button type='button' aria-label={t('Зменшити масштаб', 'Uitzoomen')} onClick={() => setZoom((v) => Math.max(0.5, Math.round((v - 0.1) * 10) / 10))}><ZoomOut /></button>
        <button type='button' className='mail-viewer-zoom-value' onClick={() => setZoom(1)}>{viewMode}</button>
        <button type='button' aria-label={t('Збільшити масштаб', 'Inzoomen')} onClick={() => setZoom((v) => Math.min(2.5, Math.round((v + 0.1) * 10) / 10))}><ZoomIn /></button>
      </> : <span className='mail-workbench-fit-status'>{viewMode}</span>}
      {kind === 'image' && <button className='mail-viewer-secondary-action' onClick={() => meld('delen')}><Share2 /><span>{t('Поділитися', 'Delen')}</span></button>}
      {editorMode !== 'none' && <button onClick={() => meld('bewerk')}><PenLine /><span>{bewerkLabel}</span></button>}
      <button className='mail-viewer-secondary-action' onClick={() => meld('print')}><Printer /><span>{t('Друк', 'Afdrukken')}</span></button>
      <button className='mail-viewer-secondary-action' onClick={() => meld('opslaan')}><Save /><span>{t('Зберегти', 'Opslaan')}</span></button>
      <a className='mail-viewer-secondary-action' href={preview.url} download={preview.filename}><Download /><span>{t('Завантажити', 'Downloaden')}</span></a>
      <details className='mail-viewer-overflow'><summary aria-label={t('Більше дій вкладення', 'Meer bijlageacties')}><span aria-hidden='true'>•••</span></summary>
        <div className='mail-viewer-overflow-menu'>
          <button type='button' onClick={() => meld('print')}><Printer /><span>{t('Друк', 'Afdrukken')}</span></button>
          <button type='button' onClick={() => meld('opslaan')}><Save /><span>{t('Зберегти', 'Opslaan')}</span></button>
          <a href={preview.url} download={preview.filename}><Download /><span>{t('Завантажити', 'Downloaden')}</span></a>
        </div></details>
      <button type='button' aria-label={t('Згорнути перегляд', 'Weergave minimaliseren')} onClick={() => setWeg('min')}><Minimize2 /><span>{t('Згорнути', 'Minimaliseren')}</span></button>
      <button type='button' onClick={() => setWeg('dicht')}><X /><span>{t('Закрити', 'Sluiten')}</span></button>
    </div>
  </header>;
  const nieuweKop = <BijlageWerkbalk lang={lang} bestandsnaam={preview.filename} contentType={preview.contentType} grootte={formatMailAttachmentSize(preview.sizeBytes)}
    bewerkBadge={badge} weergaveLabel={viewMode} nav={{ index, totaal: nav.items.length }} onVorige={() => setIndex(index - 1)} onVolgende={() => setIndex(index + 1)}
    canvasZoom={wb.zoom === 'canvas'} zoom={zoom} onZoom={setZoom} downloadUrl={preview.url} onPrint={() => meld('print')} onOpslaan={() => meld('opslaan')}
    onDelen={kind === 'image' ? () => meld('delen') : undefined} bewerkLabel={editorMode !== 'none' ? bewerkLabel : undefined} onBewerk={editorMode !== 'none' ? () => meld('bewerk') : undefined}
    onMinimaliseer={() => setWeg('min')} onSluit={() => setWeg('dicht')} />;
  return <BijlageV2Context.Provider value={modus === 'nieuw'}>
    <div className='google-mail-workspace' data-google-mail-workspace='classic'>
      <div className='google-mail-attachment-backdrop' role='presentation'>
        <article tabIndex={-1} className='google-mail-attachment-preview' role='dialog' aria-modal='true' aria-label={preview.filename}
          data-workbench-layout={wb.layout} data-workbench-scroll={wb.scrollOwner} data-workbench-edit={wb.edit} data-workbench-zoom={wb.zoom}
          data-bijlage-v2={modus === 'nieuw' ? '1' : undefined}>
          {modus === 'nieuw' ? nieuweKop : oudeKop}
          <section className='mail-viewer-stage'>
            <div className='mail-viewer-preview-cache' onMouseDown={(e) => { if (!(e.target as Element).closest('.mail-viewer-scaled-content')) setWeg('min'); }}>
              <div className='mail-viewer-cache-panel'>
                <div className={`mail-viewer-scaled-content kind-${kind}`} style={wb.zoom === 'canvas' ? ({ zoom } as CSSProperties) : undefined} onMouseDown={(e) => e.stopPropagation()}>
                  <Suspense fallback={<LoaderCircle className='spin' />}><MailAttachmentPreviewBody preview={preview} lang={lang} /></Suspense>
                </div>
              </div>
            </div>
          </section>
        </article>
      </div>
    </div>
    <output hidden data-stand-log>{log.join(',')}</output>
  </BijlageV2Context.Provider>;
}
const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
createRoot(root).render(<StrictMode><Stand /></StrictMode>);
