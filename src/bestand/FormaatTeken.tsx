import { formaatVan, type FormaatFamilie } from '../../shared/bestandsformaten';
import './formaat-teken.css';

/** Кольорова позначка формату без логотипів Adobe/Microsoft (блок 3, п. 6.5). */
export default function FormaatTeken({ naam = '', mime = '', tekst = true, taal = 'uk' }: { naam?: string; mime?: string; tekst?: boolean; taal?: 'uk' | 'nl' }) {
  const f = formaatVan(naam, mime);
  return (
    <span className='formaat-teken' data-familie={f.familie} data-formaat={f.id} title={taal === 'uk' ? f.uk : f.nl}>
      {tekst ? f.label : <span className='formaat-teken-stip' aria-hidden='true' />}
    </span>
  );
}

export type { FormaatFamilie };
