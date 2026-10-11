// 3.2: вкладення в окремому вікні, яке можна переміщувати, змінювати розмір і згортати (спільне вікно сайту — Venster).
// Можна відкрити кілька поруч із листом. Вікно відкривається подією window 'mail:bijlage-venster' {blob, filename, contentType}.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { Venster } from './platform/vensters';

const MailPdfPreview = lazy(() => import('./MailPdfPreview'));
type Item = { id: string; blob: Blob; url: string; filename: string; contentType: string };

export default function MailBijlageVensters({ lang }: { lang: 'uk' | 'nl' }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const op = (e: Event) => {
      const d = (e as CustomEvent<{ blob?: Blob; filename?: string; contentType?: string }>).detail;
      if (!d?.blob) return;
      const id = `bv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setItems((o) => [...o.slice(-3), { id, blob: d.blob!, url: URL.createObjectURL(d.blob!), filename: d.filename || 'bijlage', contentType: d.contentType || d.blob!.type || '' }]);
    };
    window.addEventListener('mail:bijlage-venster', op);
    return () => window.removeEventListener('mail:bijlage-venster', op);
  }, []);
  const sluit = (id: string) => setItems((o) => { const x = o.find((i) => i.id === id); if (x) window.setTimeout(() => URL.revokeObjectURL(x.url), 500); return o.filter((i) => i.id !== id); });
  return <>{items.map((it) => {
    const type = it.contentType.toLowerCase();
    const inhoud = type.startsWith('image/') ? <img src={it.url} alt={it.filename} className='mail-bv-beeld' />
      : type === 'application/pdf' ? <Suspense fallback={<LoaderCircle className='spin' />}><MailPdfPreview blob={it.blob} filename={it.filename} lang={lang} /></Suspense>
      : type.startsWith('video/') ? <video src={it.url} controls className='mail-bv-beeld' />
      : type.startsWith('audio/') ? <audio src={it.url} controls />
      : type.startsWith('text/') && type !== 'text/html' ? <TekstInhoud blob={it.blob} />
      : <p className='mail-bv-geen'>{t('Для цього типу файла перегляду немає — завантажте його.', 'Geen voorvertoning voor dit bestandstype — download het.')}</p>;
    return <Venster key={it.id} id={it.id} titel={it.filename} modaal={false} breedte={640} hoogte={560} onSluit={() => sluit(it.id)} lang={lang} className='mail-bijlage-venster'>
      <div className='mail-bv' data-bijlage-venster>
        <div className='mail-bv-inhoud'>{inhoud}</div>
        <a className='mail-bv-download' href={it.url} download={it.filename}><Download aria-hidden='true' />{t('Завантажити', 'Downloaden')}</a>
      </div>
    </Venster>;
  })}</>;
}

function TekstInhoud({ blob }: { blob: Blob }) {
  const [tekst, setTekst] = useState('');
  useEffect(() => { void blob.slice(0, 200_000).text().then(setTekst); }, [blob]);
  return <pre className='mail-bv-tekst'>{tekst}</pre>;
}
