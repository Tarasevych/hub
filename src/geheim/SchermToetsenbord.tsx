import { useState } from 'react';
import { toetsRijen, type ToetsLaag, type ToetsTaal } from './toetsen';
import './scherm-toetsenbord.css';

type Props = {
  lang: 'uk' | 'nl';
  onTeken: (teken: string) => void;
  onWis: () => void;
};

/** Клавіатура поверх поля. Подія лише pointer: без клавіатурної активації ззовні. */
export default function SchermToetsenbord({ lang, onTeken, onWis }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [taal, setTaal] = useState<ToetsTaal>(lang === 'nl' ? 'nl' : 'uk');
  const [laag, setLaag] = useState<ToetsLaag>('letters');
  const [shift, setShift] = useState(false);
  const rijen = toetsRijen(taal, laag, shift);
  const tik = (teken: string) => {
    onTeken(teken);
    if (shift && laag === 'letters') setShift(false);
  };
  return (
    <div className='scherm-toetsenbord' role='group' aria-label={t('Екранна клавіатура', 'Schermtoetsenbord')} data-scherm-toetsenbord='1'>
      <div className='scherm-toetsenbord-lagen'>
        <button type='button' aria-pressed={taal === 'uk'} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); setTaal('uk'); }}>{t('УКР', 'UKR')}</button>
        <button type='button' aria-pressed={taal === 'nl'} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); setTaal('nl'); }}>NL</button>
        <button type='button' aria-pressed={laag === 'letters'} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); setLaag('letters'); }}>{t('АБВ', 'ABC')}</button>
        <button type='button' aria-pressed={laag === 'cijfers'} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); setLaag('cijfers'); }}>123</button>
        <button type='button' aria-pressed={laag === 'tekens'} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); setLaag('tekens'); }}>#+=</button>
      </div>
      {rijen.map((rij) => (
        <div className='scherm-toetsenbord-rij' key={rij.join('')}>
          {rij.map((teken) => (
            <button type='button' key={teken} tabIndex={-1} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); tik(teken); }}>{teken}</button>
          ))}
        </div>
      ))}
      <div className='scherm-toetsenbord-rij'>
        <button type='button' aria-pressed={shift} tabIndex={-1} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); setShift((v) => !v); }}>{t('Вел', 'Kap')}</button>
        <button type='button' tabIndex={-1} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); tik(' '); }}>{t('Пробіл', 'Spatie')}</button>
        <button type='button' tabIndex={-1} onPointerDown={(e) => { if (!e.isTrusted) return; e.preventDefault(); onWis(); }}>{t('Стерти', 'Wis')}</button>
      </div>
    </div>
  );
}
