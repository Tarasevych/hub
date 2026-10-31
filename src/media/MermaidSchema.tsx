// Een Mermaid-schema (.mmd uit de hmara, gemaakt door het hulpmiddel diagram_generate) tekenen — in de browser, met de EIGEN
// gebundelde Mermaid (npm-pakket «mermaid», lui geladen: alleen wie een schema opent laadt het). Geen CDN, geen extern adres.
//
// Veiligheid in drie lagen:
//   1. dezelfde controle als de server (shared/mermaid-schema.ts): geen init-directives, geen HTML, geen javascript:/data:, geen callbacks;
//   2. Mermaid met securityLevel 'strict' en zonder HTML-labels (dus geen foreignObject);
//   3. de SVG die terugkomt nog eens door DOMPurify (alleen het SVG-profiel) vóór hij in de pagina komt.
// Lukt tekenen niet, dan staat de code er gewoon met de fout erbij — nooit iets half.
import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { controleerMermaid } from '../../shared/mermaid-schema';
import './mermaid.css';

type Lang = 'uk' | 'nl';
let teller = 0;
const donker = () => typeof document !== 'undefined' && /\btheme-(plum-)?dark\b/.test(document.documentElement.className);

/** Tekent `code` als SVG-tekst, of gooit een Error met een korte uitleg. */
export async function tekenMermaid(code: string): Promise<string> {
  const o = controleerMermaid(code);
  if (!o.ok) throw new Error(`${o.code}${o.regel ? ` · ${o.regel}` : ''}: ${o.uitleg}`);
  const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([import('mermaid'), import('dompurify')]);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: donker() ? 'dark' : 'default', htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: 'inherit' });
  await mermaid.parse(o.code);
  const { svg } = await mermaid.render(`mr-mermaid-${Date.now().toString(36)}-${teller++}`, o.code);
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'animate', 'set', 'animateMotion', 'animateTransform'],
    FORBID_ATTR: ['xlink:href'],
  });
}

export default function MermaidSchema({ titel, code, lang, onClose }: { titel: string; code: string; lang: Lang; onClose: () => void }) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [svg, setSvg] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(true);
  const sluit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let weg = false;
    setBezig(true); setFout(''); setSvg('');
    tekenMermaid(code).then((s) => { if (!weg) setSvg(s); }, (e) => { if (!weg) setFout(String((e as Error)?.message || e).slice(0, 400)); }).finally(() => { if (!weg) setBezig(false); });
    return () => { weg = true; };
  }, [code]);
  useEffect(() => { sluit.current?.focus(); const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  const downloadSvg = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a'); a.href = url; a.download = `${titel.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'schema'}.svg`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div className='cloud-dialog-backdrop' role='presentation' onMouseDown={onClose}>
      <section className='cloud-note-dialog mr-mermaid-venster' role='dialog' aria-modal='true' aria-labelledby='mr-mermaid-titel' onMouseDown={(e) => e.stopPropagation()} data-mermaid-schema='v1'>
        <header>
          <div><span>{tr('Схема Mermaid', 'Mermaid-schema')}</span><h2 id='mr-mermaid-titel'>{titel}</h2></div>
          <div className='mr-mermaid-acties'>
            <button type='button' onClick={downloadSvg} disabled={!svg} title={tr('Завантажити як SVG', 'Downloaden als SVG')} aria-label={tr('Завантажити як SVG', 'Downloaden als SVG')}><Download aria-hidden /></button>
            <button type='button' ref={sluit} onClick={onClose} aria-label={tr('Закрити', 'Sluiten')}><X aria-hidden /></button>
          </div>
        </header>
        {bezig ? <p className='mr-mermaid-stand' aria-busy='true'>{tr('Малюємо схему…', 'Schema tekenen…')}</p> : null}
        {fout ? <p className='mr-mermaid-fout' role='alert'>{tr('Схему не вдалося намалювати. Код нижче без змін.', 'Het schema kon niet getekend worden. De code staat hieronder ongewijzigd.')} <small>{fout}</small></p> : null}
        {svg ? <div className='mr-mermaid-beeld' role='img' aria-label={titel} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        <details className='mr-mermaid-code' open={!!fout}>
          <summary>{tr('Код Mermaid', 'Mermaid-code')}</summary>
          <pre>{code}</pre>
        </details>
      </section>
    </div>
  );
}
