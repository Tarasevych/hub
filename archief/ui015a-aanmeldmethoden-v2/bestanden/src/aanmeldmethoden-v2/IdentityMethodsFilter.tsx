// UI-015: filterchips (Усі • Вхід • Passkey • Захист • Доступ іншим) + zoekveld met debounce. Filter = vinden, nooit iets wijzigen.
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CATEGORIEEN, type Categorie, type Taal } from '../../shared/aanmeldmethoden-model';

export function IdentityMethodsFilter({ lang, categorie, onCategorie, onZoek }: { lang: Taal; categorie: 'alle' | Categorie; onCategorie: (c: 'alle' | Categorie) => void; onZoek: (q: string) => void }) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [q, setQ] = useState('');
  useEffect(() => { const t = window.setTimeout(() => onZoek(q), 200); return () => window.clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className='amv2-filter'>
    <div className='amv2-chips' role='toolbar' aria-label={tr('Категорії', 'Categorieën')}>
      {CATEGORIEEN.map((c) => <button key={c.id} type='button' className={`amv2-chip${categorie === c.id ? ' actief' : ''}`} aria-pressed={categorie === c.id} onClick={() => onCategorie(c.id)}>{c.titel[lang]}</button>)}
    </div>
    <label className='amv2-zoek'>
      <Search aria-hidden='true' />
      <input type='search' value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Пошук способу', 'Methode zoeken')} aria-label={tr('Пошук способу входу', 'Aanmeldmethode zoeken')} maxLength={60} />
      {q && <button type='button' className='amv2-zoek-wis' onClick={() => setQ('')} aria-label={tr('Очистити пошук', 'Zoekopdracht wissen')}><X aria-hidden='true' /></button>}
    </label>
  </div>;
}
