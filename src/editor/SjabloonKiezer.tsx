import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { SJABLOON_CATEGORIEEN, sjabloonKaarten, type SjabloonCategorie } from '../mail-sjablonen';

type Props = { lang: 'uk' | 'nl'; onKies: (html: string) => void; knopTekst?: string };

/** «Вставити»: пошук, категорії, мініатюри, стрілки. Той самий insert, що й кнопки шаблонів. */
export default function SjabloonKiezer({ lang, onKies, knopTekst }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState('');
  const [cat, setCat] = useState<SjabloonCategorie | ''>('');
  const [actief, setActief] = useState(0);
  const kaarten = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return sjabloonKaarten(lang).filter((kaart) => (!cat || kaart.categorie === cat) && (!q || `${kaart.naam} ${kaart.uitleg}`.toLowerCase().includes(q)));
  }, [lang, zoek, cat]);
  useEffect(() => { setActief(0); }, [zoek, cat, open]);
  const kies = (html: string) => { onKies(html); setOpen(false); };
  const toets = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); setOpen(true); }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); setActief((i) => Math.min(kaarten.length - 1, i + 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); setActief((i) => Math.max(0, i - 1)); return; }
    if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); setActief(0); return; }
    if (event.key === 'End') { event.preventDefault(); event.stopPropagation(); setActief(Math.max(0, kaarten.length - 1)); return; }
    if (event.key === 'Enter' && kaarten[actief]) { event.preventDefault(); event.stopPropagation(); kies(kaarten[actief].html); }
  };
  return (
    <div className="sjabloon-kiezer" data-sjabloon-kiezer="1" onKeyDown={toets}>
      <button type="button" aria-expanded={open} aria-controls="sjabloon-kiezer-paneel" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((value) => !value)}>
        {knopTekst || t('Вставити', 'Invoegen')}
      </button>
      {open && (
        <div id="sjabloon-kiezer-paneel" className="sjabloon-kiezer-paneel" role="group" aria-label={t('Вставити шаблон', 'Sjabloon invoegen')}>
          <input value={zoek} onChange={(event) => setZoek(event.target.value)} placeholder={t('Пошук шаблону', 'Sjabloon zoeken')} aria-label={t('Пошук шаблону', 'Sjabloon zoeken')} />
          <div className="sjabloon-kiezer-cats" role="group" aria-label={t('Категорії', 'Categorieën')}>
            <button type="button" aria-pressed={cat === ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setCat('')}>{t('Усі', 'Alles')}</button>
            {SJABLOON_CATEGORIEEN.map((item) => (
              <button key={item.id} type="button" aria-pressed={cat === item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => setCat(item.id)}>{lang === 'uk' ? item.uk : item.nl}</button>
            ))}
          </div>
          <div className="sjabloon-kiezer-lijst">
            {kaarten.map((kaart, index) => (
              <button key={kaart.id} type="button" data-menu-sluit className="sjabloon-kaart" data-actief={index === actief ? '1' : undefined} onMouseEnter={() => setActief(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => kies(kaart.html)}>
                <span className="sjabloon-miniatuur" data-sjabloon-miniatuur="1" style={{ background: kaart.voorbeeld }} aria-hidden="true">{kaart.naam.slice(0, 1)}</span>
                <span>{kaart.naam}</span>
                <small>{kaart.uitleg}</small>
              </button>
            ))}
            {!kaarten.length && <p>{t('Нічого не знайдено', 'Niets gevonden')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
