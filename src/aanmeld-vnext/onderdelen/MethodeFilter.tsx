// UI-015 — zoeken + categoriechips (dossier §4, §7): een filter VINDT kaarten en verandert nooit een stand; het zoekveld
// debouncet ≥250 ms en doet géén netwerkverzoeken; de chips zijn echte groepen (geen «Соцмережі» uit het referentiebeeld).
import { useEffect, useState } from 'react';
import { Fingerprint, LayoutGrid, LogIn, Search, Share2, ShieldCheck } from 'lucide-react';
import { AANMELD_GROEPEN, GROEP_LABEL, aanmeldTekst, type AanmeldGroep } from '../../../shared/aanmeld-vnext-model';
import type { Lang } from '../../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
const ICOON: Record<AanmeldGroep, typeof LayoutGrid> = { alles: LayoutGrid, inloggen: LogIn, passkey: Fingerprint, bescherming: ShieldCheck, delegatie: Share2 };

type Props = { lang: Lang; groep: AanmeldGroep; onGroep: (g: AanmeldGroep) => void; onZoek: (z: string) => void };
export default function MethodeFilter({ lang, groep, onGroep, onZoek }: Props) {
  const [veld, setVeld] = useState('');
  useEffect(() => { const t = window.setTimeout(() => onZoek(veld), 280); return () => window.clearTimeout(t); }, [veld, onZoek]);
  return (
    <div className='amv-filter'>
      <label className='amv-zoek'>
        <Search aria-hidden='true' />
        <input value={veld} data-amv-zoek='' type='search' placeholder={tr(lang, 'Пошук способу входу…', 'Zoek een aanmeldmethode…')}
          aria-label={tr(lang, 'Пошук способу входу', 'Aanmeldmethode zoeken')} onChange={(e) => setVeld(e.target.value)} />
      </label>
      <div className='amv-chips' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
        {AANMELD_GROEPEN.map((g) => { const I = ICOON[g]; return (
          <button key={g} type='button' className={`amv-chip${groep === g ? ' is-actief' : ''}`} aria-pressed={groep === g}
            data-amv-groep={g} onClick={() => onGroep(g)}>
            <I aria-hidden='true' />{aanmeldTekst(GROEP_LABEL[g], lang)}
          </button>
        ); })}
      </div>
    </div>
  );
}
