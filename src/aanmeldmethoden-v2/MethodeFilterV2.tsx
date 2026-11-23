// Віха M2 (UI-015A): смуга категорій та двомовне поле пошуку із затримкою 250 мс.
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORIEEN, type Categorie, type Taal } from './aanmeldmethoden-model';

export function MethodeFilterV2({
  lang,
  categorie,
  onCategorie,
  onZoek,
}: {
  lang: Taal;
  categorie: 'alle' | Categorie;
  onCategorie: (c: 'alle' | Categorie) => void;
  onZoek: (q: string) => void;
}) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => onZoek(q), 250);
    return () => window.clearTimeout(t);
  }, [q, onZoek]);

  return (
    <div className='amv2-filter'>
      <div className='amv2-chips' role='toolbar' aria-label={tr('Категорії способів входу', 'Categorieën van aanmeldmethoden')}>
        {CATEGORIEEN.map((c) => (
          <button
            key={c.id}
            type='button'
            className={`amv2-chip${categorie === c.id ? ' actief' : ''}`}
            data-amv2-categorie={c.id}
            aria-pressed={categorie === c.id}
            onClick={() => onCategorie(c.id)}
          >
            {c.titel[lang]}
          </button>
        ))}
      </div>
      <label className='amv2-zoek'>
        <Search aria-hidden='true' />
        <input
          type='search'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('Пошук способу', 'Methode zoeken')}
          aria-label={tr('Пошук способу входу', 'Aanmeldmethode zoeken')}
          maxLength={60}
        />
        {q ? (
          <button
            type='button'
            className='amv2-zoek-wis'
            onClick={() => {
              setQ('');
              onZoek('');
            }}
            aria-label={tr('Очистити пошук', 'Zoekopdracht wissen')}
          >
            <X aria-hidden='true' />
          </button>
        ) : null}
      </label>
    </div>
  );
}
