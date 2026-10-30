// Mappenkiezer (in een Laag): de wortel + lui uitgeklapte submappen via cloudClient.bestanden({ mapId }).
// Gebruikt bij «verplaatsen» in Bestanden en «naar een map» in Postvak In. Kiezen = één doel (wortel mag), dan bevestigen.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, LoaderCircle } from 'lucide-react';
import type { CloudMap } from '../../shared/cloud-vnext-model';
import { cloudClient } from './cloud-client';
import { cloudFoutTekst } from './hulp';
import { tr, type Lang } from './tekst';

type Knoop = { map: CloudMap; diepte: number; open: boolean; geladen: boolean; kinderen: Knoop[] };
const knoop = (map: CloudMap, diepte: number): Knoop => ({ map, diepte, open: false, geladen: false, kinderen: [] });
const plat = (ks: Knoop[]): Knoop[] => ks.flatMap((k) => [k, ...(k.open ? plat(k.kinderen) : [])]);

export default function MapKiezer({ lang, uitgesloten = [], onKies, bezig = false, knopTekst }: {
  lang: Lang; uitgesloten?: string[]; onKies: (mapId: string | null) => void; bezig?: boolean; knopTekst?: string;
}) {
  const [wortel, setWortel] = useState<Knoop[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [doel, setDoel] = useState<string | null | undefined>(undefined); // undefined = nog niets gekozen; null = wortel

  useEffect(() => {
    let weg = false;
    (async () => {
      try { const r = await cloudClient.bestanden({}); if (!weg) setWortel(r.mappen.map((m) => knoop(m, 1))); }
      catch (e) { if (!weg) setFout(cloudFoutTekst(lang, e)); }
      finally { if (!weg) setLaden(false); }
    })();
    return () => { weg = true; };
  }, [lang]);

  const klap = async (k: Knoop) => {
    if (!k.geladen) {
      try { const r = await cloudClient.bestanden({ mapId: k.map.id }); k.kinderen = r.mappen.map((m) => knoop(m, k.diepte + 1)); k.geladen = true; }
      catch (e) { setFout(cloudFoutTekst(lang, e)); return; }
    }
    k.open = !k.open;
    setWortel((w) => [...w]);
  };

  const rijen = plat(wortel).filter((k) => !uitgesloten.includes(k.map.id));
  return (
    <div className='cvn-mapkiezer' data-cvn-mapkiezer=''>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      <ul role='listbox' aria-label={tr(lang, 'Оберіть теку', 'Kies een map')}>
        <li>
          <button type='button' role='option' aria-selected={doel === null} className={`cvn-mapkiezer-rij${doel === null ? ' is-doel' : ''}`} onClick={() => setDoel(null)} data-cvn-eerste=''>
            <Folder aria-hidden='true' /><span>{tr(lang, 'Корінь (Мої файли)', 'Wortel (Mijn bestanden)')}</span>{doel === null ? <Check aria-hidden='true' /> : null}
          </button>
        </li>
        {laden ? <li className='cvn-hint'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Завантаження тек…', 'Mappen laden…')}</li> : null}
        {rijen.map((k) => (
          <li key={k.map.id} style={{ paddingInlineStart: `${k.diepte * 14}px` }}>
            <span className='cvn-mapkiezer-tak'>
              <button type='button' className='cvn-icoonknop' onClick={() => void klap(k)} aria-expanded={k.open}
                aria-label={tr(lang, `Підтеки «${k.map.naam}»`, `Submappen van «${k.map.naam}»`)}>
                {k.open ? <ChevronDown aria-hidden='true' /> : <ChevronRight aria-hidden='true' />}
              </button>
              <button type='button' role='option' aria-selected={doel === k.map.id} className={`cvn-mapkiezer-rij${doel === k.map.id ? ' is-doel' : ''}`} onClick={() => setDoel(k.map.id)}>
                <Folder aria-hidden='true' /><span>{k.map.naam}</span>{doel === k.map.id ? <Check aria-hidden='true' /> : null}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type='button' className='cvn-knop is-hoofd' disabled={doel === undefined || bezig} onClick={() => onKies(doel === undefined ? null : doel)}>
        {bezig ? tr(lang, 'Переміщення…', 'Verplaatsen…') : knopTekst || tr(lang, 'Перемістити сюди', 'Hierheen verplaatsen')}
      </button>
    </div>
  );
}
