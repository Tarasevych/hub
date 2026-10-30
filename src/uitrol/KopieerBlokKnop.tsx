// Hoofd3: kleine kopieerknop (pictogram) rechtsboven in een blok, bv. «Що змінено». Visueel 28px, klikvlak ≥44px via ::before.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Copy } from 'lucide-react';
import { tr, type Lang } from './types';
import { blokTekst, kopieerNaarKlembord } from './kopieer';

export default function KopieerBlokKnop({ lang, blok }: { lang: Lang; blok: RefObject<HTMLElement | null> }) {
  const [staat, setStaat] = useState<'' | 'ok' | 'fout'>('');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const klik = async () => {
    const ok = await kopieerNaarKlembord(blokTekst(blok.current));
    setStaat(ok ? 'ok' : 'fout');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStaat(''), 1600);
  };
  const label = tr(lang, 'Копіювати текст блоку', 'Tekst van het blok kopiëren');
  return <span className='ut-blok-kopie' data-kopieer-negeer>
    <button type='button' className='ut-blok-kopie-knop' data-staat={staat || undefined} aria-label={label} title={label} onClick={() => { void klik(); }}>
      {staat === 'ok' ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
    </button>
    <span className='ut-blok-kopie-melding' role='status' aria-live='polite'>{staat === 'ok' ? tr(lang, 'Скопійовано', 'Gekopieerd') : staat === 'fout' ? tr(lang, 'Не вдалося', 'Mislukt') : ''}</span>
  </span>;
}
