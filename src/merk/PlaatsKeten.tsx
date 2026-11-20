// МІСЦЕ ВХОДУ «ЛАНЦЮЖОК» (PLAATS-TEKENS-001, вибір Павла 18.11.2026, варіант C). Один рядок: країна › область › місто.
// Країна — кружечок-прапор; кожен інший рівень — пара «прапор + герб» ПОРУЧ (ніколи один на одному: кольори не зливаються).
// Якщо знака немає — порожнє пунктирне місце з підказкою, нічого не домальовується. Праворуч — мітка «IP»/«GPS» (звідки відомо
// місце й наскільки точно). ▸ розгортає вертикальний ланцюжок з назвою кожного рівня. На телефоні середні назви ховаються.
// PLAATSKETEN: land › regio › stad; vlag en wapen naast elkaar; IP/GPS-label; uitklapbaar. Alleen bestanden uit src/merk.
import { useId, useState } from 'react';
import type { PlaatsAntwoord, PlaatsNiveau } from '../../shared/plaats-teken';
import MerkPlaats, { plaatsBeeldUrl } from './MerkPlaats';

type Taal = 'uk' | 'nl';
const T = {
  uk: {
    land: 'країна', regio: 'область', stad: 'місто', geenVlag: 'прапора немає', geenWapen: 'герба немає', vlag: 'Прапор', wapen: 'Герб',
    ip: 'Визначено за IP-адресою: точність до міста. VPN або мобільна мережа можуть показати інше місто.',
    gps: 'Місце, яке ви самі дозволили визначити браузеру (геолокація): точність до вулиці.',
    open: 'Показати весь ланцюжок: країна, область, місто', dicht: 'Згорнути ланцюжок',
  },
  nl: {
    land: 'land', regio: 'regio', stad: 'stad', geenVlag: 'geen vlag', geenWapen: 'geen wapen', vlag: 'Vlag', wapen: 'Wapen',
    ip: 'Bepaald via het IP-adres: nauwkeurig tot op de stad. Een VPN of mobiel netwerk kan een andere stad tonen.',
    gps: 'Plaats die u de browser zelf liet bepalen (geolocatie): nauwkeurig tot op de straat.',
    open: 'Hele keten tonen: land, regio, stad', dicht: 'Keten inklappen',
  },
} as const;

export type PlaatsKetenProps = {
  antwoord: PlaatsAntwoord;
  /** Waar de plaats vandaan komt. */
  bron?: 'ip' | 'gps';
  taal?: Taal;
  /** Naam van het land als de index er geen heeft (bv. uit Intl.DisplayNames). */
  landNaam?: string;
  open?: boolean;
  className?: string;
};

const naamVan = (n: PlaatsNiveau, taal: Taal, landNaam?: string) => n.naam?.[taal] || n.naam?.uk || (n.soort === 'land' ? landNaam || n.code || '' : n.code || '');

function Vlag({ n, taal, klein }: { n: PlaatsNiveau; taal: Taal; klein?: boolean }) {
  const t = T[taal];
  const naam = naamVan(n, taal);
  if (!n.vlag) return <span className={`plaats-keten-vlag plaats-keten-leeg${klein ? ' klein' : ''}`} title={`${naam}: ${t.geenVlag}`} />;
  if (n.soort === 'land') return <MerkPlaats keten={[n.vlag]} vorm='tegel' maat={klein ? 13 : 18} titel={`${t.vlag}: ${naam}`} className='plaats-keten-landvlag' />;
  return <img className={`plaats-keten-vlag${klein ? ' klein' : ''}`} src={plaatsBeeldUrl(n.vlag)} alt='' title={`${t.vlag}: ${naam}`} draggable={false} decoding='async' loading='lazy' />;
}
function Wapen({ n, taal, klein }: { n: PlaatsNiveau; taal: Taal; klein?: boolean }) {
  const t = T[taal];
  const naam = naamVan(n, taal);
  if (!n.wapen) return <span className={`plaats-keten-wapen plaats-keten-leeg${klein ? ' klein' : ''}`} title={`${naam}: ${t.geenWapen}`} />;
  return <img className={`plaats-keten-wapen${klein ? ' klein' : ''}`} src={plaatsBeeldUrl(n.wapen)} alt='' title={`${t.wapen}: ${naam}`} draggable={false} decoding='async' loading='lazy' />;
}

export default function PlaatsKeten({ antwoord, bron = 'ip', taal = 'uk', landNaam, open: openStart = false, className }: PlaatsKetenProps) {
  const [open, setOpen] = useState(openStart);
  const id = useId();
  const t = T[taal];
  const niveaus = antwoord.niveaus || [];
  if (!niveaus.length) return null;
  const laatste = niveaus.length - 1;
  return (
    <div className={`plaats-keten${className ? ` ${className}` : ''}`} data-plaats-bron={bron}>
      <div className='plaats-keten-rij'>
        {niveaus.map((n, i) => (
          <span key={`${n.soort}-${n.code || i}`} className={`plaats-keten-stap${i === laatste ? ' hoofd' : i ? ' midden' : ''}`}>
            {i > 0 && <span className='plaats-keten-sep' aria-hidden='true'>›</span>}
            {n.soort === 'land'
              ? <MerkPlaats keten={n.vlag ? [n.vlag] : []} vorm='rond' maat={16} naam={naamVan(n, taal, landNaam)} titel={`${t.land}: ${naamVan(n, taal, landNaam)}`} />
              : <span className='plaats-keten-paar'><Vlag n={n} taal={taal} klein /><Wapen n={n} taal={taal} klein /></span>}
            <span className='plaats-keten-naam'>{i === laatste ? <b>{naamVan(n, taal, landNaam)}</b> : naamVan(n, taal, landNaam)}</span>
          </span>
        ))}
        <span className='plaats-keten-bron' title={bron === 'gps' ? t.gps : t.ip}>
          <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z' /></svg>
          {bron === 'gps' ? 'GPS' : 'IP'}
        </span>
        <button type='button' className='plaats-keten-pijl' aria-expanded={open} aria-controls={id} title={open ? t.dicht : t.open} onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && (
        <div className='plaats-keten-lijst' id={id}>
          {niveaus.map((n, i) => (
            <div key={`${n.soort}-${n.code || i}`} className='plaats-keten-niveau' style={{ ['--diepte' as string]: i }}>
              <span className='plaats-keten-paar'><Vlag n={n} taal={taal} /><Wapen n={n} taal={taal} /></span>
              <span className='plaats-keten-naam'>{naamVan(n, taal, landNaam)}</span>
              <span className='plaats-keten-soort'>{t[n.soort]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
