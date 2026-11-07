import { BIJLAGE_MATEN, bijlageMaatVan, type BijlageMaat } from '../../shared/bijlage-voorbeeld-maat';

const LABEL: Record<BijlageMaat, [string, string]> = {
  S: ['S', 'S'],
  M: ['M', 'M'],
  L: ['L', 'L'],
  XL: ['XL', 'XL'],
  scherm: ['Екран', 'Scherm'],
};

/** Швидкі налаштування: розмір спливного перегляду вкладення (блок 3, п. 6.2). */
export default function BijlageMaatKeuze({ waarde, onKies, lang }: { waarde: unknown; onKies: (maat: BijlageMaat) => void; lang: 'uk' | 'nl' }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const huidig = bijlageMaatVan(waarde);
  return (
    <section className='mail-compact-block mail-bijlage-maat'>
      <header><strong>{t('Вкладення', 'Bijlagen')}</strong></header>
      <div role='group' aria-label={t('Розмір перегляду вкладення', 'Grootte van de bijlagevoorvertoning')}>
        {BIJLAGE_MATEN.map((id) => (
          <button type='button' key={id} aria-pressed={huidig === id} data-bijlage-maat={id} onClick={() => onKies(id)}>
            {t(LABEL[id][0], LABEL[id][1])}
          </button>
        ))}
      </div>
      <p>{t('На дотик вкладення відкривається дотиком, не наведенням.', 'Op een aanraakscherm opent een bijlage met een tik, niet met aanwijzen.')}</p>
    </section>
  );
}
