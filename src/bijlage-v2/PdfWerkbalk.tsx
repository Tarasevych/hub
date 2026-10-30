// Bijlageviewer v2 — compacte PDF-balk (vlag `bijlage-viewer-v2`): [↑ [3]/12 ↓] | [Ширина | Сторінка | 100%] | [− 135% +] | [⌃]
// De paginateller is een invoerveld (Enter springt). Handmatig zoomen verlaat het automatisch passend maken: dan is de modus
// «actual» met de gekozen factor en is geen segment actief — er is nooit een conflict tussen passend maken en zoomen.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUp, Columns2, MoveHorizontal, RectangleVertical } from 'lucide-react';
import { IconKnop, Segmenten, ZoomGroep } from './Knoppen';
import { schrijfVoorkeur } from './vlag';
import './bijlage-v2.css';

type Fit = 'width' | 'page' | 'actual';
export default function PdfWerkbalk({ lang, pagina, totaal, fit, zoom, effectief, onSpring, onFit, onZoom, ingeklapt, onInklappen }: {
  lang: 'uk' | 'nl'; pagina: number; totaal: number; fit: Fit; zoom: number; effectief: number;
  onSpring: (n: number) => void; onFit: (f: Fit) => void; onZoom: (fit: Fit, zoom: number) => void; ingeklapt: boolean; onInklappen: (v: boolean) => void;
}) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [invoer, setInvoer] = useState(String(pagina));
  const balk = useRef<HTMLElement | null>(null);
  const naarBegin = () => { const h = balk.current?.closest('.mail-viewer-preview-cache') as HTMLElement | null; if (!h) { onSpring(1); return; } h.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  useEffect(() => setInvoer(String(pagina)), [pagina]);
  const procent = Math.round(effectief * 100);
  const segment: Fit | null = fit === 'actual' ? (Math.abs(zoom - 1) < 0.001 ? 'actual' : null) : fit;
  const zetProcent = (v: number) => onZoom('actual', Math.min(4, Math.max(0.25, v / 100)));
  const stap = (d: number) => zetProcent(Math.round((procent + d) / 10) * 10);
  useEffect(() => { schrijfVoorkeur({ fit, zoom }); }, [fit, zoom]);

  if (ingeklapt) return <nav className='bv2-pdfbalk is-ingeklapt' role='toolbar' aria-label={t('Керування PDF', 'PDF-bediening')} data-bv2='pdfbalk'>
    <span className='bv2-teller'>{pagina}/{totaal}</span>
    <IconKnop label={t('Показати інструменти PDF', 'PDF-gereedschap tonen')} onClick={() => { onInklappen(false); schrijfVoorkeur({ balkIngeklapt: false }); }} data='pdf-uitklappen'><ChevronDown size={16} /></IconKnop>
  </nav>;

  return <nav ref={balk} className='bv2-pdfbalk' role='toolbar' aria-label={t('Керування PDF', 'PDF-bediening')} data-bv2='pdfbalk'>
    <div className='bv2-groep' role='group' aria-label={t('Сторінки', 'Pagina’s')}>
      <IconKnop label={t('Попередня сторінка', 'Vorige pagina')} uit={pagina <= 1} onClick={() => onSpring(pagina - 1)} data='pdf-vorige'><ChevronUp size={18} /></IconKnop>
      <form className='bv2-pagina' onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(invoer)); if (n >= 1 && n <= totaal) onSpring(n); else setInvoer(String(pagina)); }}>
        <input aria-label={t(`Сторінка ${pagina} з ${totaal}. Введіть номер`, `Pagina ${pagina} van ${totaal}. Typ een nummer`)} inputMode='numeric' value={invoer}
          onChange={(e) => setInvoer(e.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => setInvoer(String(pagina))} onFocus={(e) => e.currentTarget.select()} data-bv2='pdf-pagina' />
        <span aria-hidden='true'>/ {totaal}</span>
      </form>
      <IconKnop label={t('Наступна сторінка', 'Volgende pagina')} uit={pagina >= totaal} onClick={() => onSpring(pagina + 1)} data='pdf-volgende'><ChevronDown size={18} /></IconKnop>
    </div>
    <Segmenten<Fit> label={t('Режим масштабу', 'Zoommodus')} waarde={segment} onKies={onFit} data='pdf-modus' keuzes={[
      { waarde: 'width', label: t('По ширині', 'Breedte'), pict: <MoveHorizontal size={17} /> },
      { waarde: 'page', label: t('Вся сторінка', 'Hele pagina'), pict: <RectangleVertical size={17} /> },
      { waarde: 'actual', label: t('Справжній розмір 100%', 'Werkelijke grootte 100%'), pict: <span className='bv2-pict-tekst'>1:1</span> },
    ]} />
    <ZoomGroep lang={lang} procent={procent} onZet={zetProcent} onMin={() => stap(-10)} onPlus={() => stap(10)} onPassend={() => onFit('width')} data='pdf-zoom' />
    <div className='bv2-groep bv2-pdf-extra'>
      <IconKnop label={t('На початок документа', 'Naar het begin')} uit={pagina <= 1} onClick={naarBegin} data='pdf-begin'><ChevronsUp size={17} /></IconKnop>
      <IconKnop label={t('Сховати інструменти PDF', 'PDF-gereedschap verbergen')} onClick={() => { onInklappen(true); schrijfVoorkeur({ balkIngeklapt: true }); }} data='pdf-inklappen'><Columns2 size={16} /></IconKnop>
    </div>
  </nav>;
}
