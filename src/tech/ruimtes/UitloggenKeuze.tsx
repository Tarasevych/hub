// Drie duidelijke keuzes om te stoppen (vlag tech-ruimtes-v2), elk met één regel gevolg. «Вийти з технічного сеансу» meldt NOOIT af
// van de site; afmelden op de site sluit ALTIJD ook de technische sessie; één tabblad sluiten laat lange extensie-ontgrendelingen staan
// (besluit t330u). Afmelden op de site / overal loopt via het accountmenu (gebeurtenis «mr-ruimtes-uitloggen»), dat de echte logout doet.
import { useState } from 'react';
import { LogOut, ShieldOff, Users } from 'lucide-react';
import { Venster } from '../../platform/vensters';
import { canonicalNavigationUrl } from '../../canoniek-navigatie';
import { UITLOG_KEUZES, VKLADKA_REGEL, type Taal, type UitlogKeuze } from './teksten';
import { beeindigen, useRuimtes } from './ruimtes-opslag';
import './ruimtes.css';

export const UITLOG_GEBEURTENIS = 'mr-ruimtes-uitloggen';
const ICOON = { technisch: ShieldOff, site: LogOut, overal: Users } as const;

export default function UitloggenKeuze({ taal, sluit }: { taal: Taal; sluit: () => void }) {
  const uk = taal === 'uk';
  const r = useRuimtes();
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bevestig, setBevestig] = useState<UitlogKeuze['id'] | ''>('');
  const heeftSessie = !!r.status?.sessie;
  const doe = async (k: UitlogKeuze) => {
    setMelding(null);
    if (k.id === 'technisch') {
      try { await beeindigen(); setMelding({ ok: true, tekst: uk ? 'Готово: технічний сеанс завершено. Ви на сайті у звичайному просторі.' : 'Klaar: technische sessie beëindigd. U bent aangemeld in de gewone ruimte.' }); }
      catch (e) { setMelding({ ok: false, tekst: `${uk ? 'Не вдалося' : 'Mislukt'} (${String((e as Error)?.message || 'FOUT')}).` }); }
      return;
    }
    if (bevestig !== k.id) { setBevestig(k.id); return; }
    if (k.id === 'overal') {
      // «Вийти всюди» = alle sessies op alle apparaten intrekken: de bestaande, bevestigde knop in Безпека → Сесії.
      setMelding({ ok: true, tekst: uk ? 'Відкриваю «Безпека → Сесії», там підтвердіть «Вийти всюди»…' : '«Beveiliging → Sessies» openen; bevestig daar «Overal afmelden»…' });
      location.assign(canonicalNavigationUrl('identity', 'sessions', taal));
      return;
    }
    setMelding({ ok: true, tekst: uk ? 'Виходжу з акаунта на сайті…' : 'Afmelden op de site…' });
    window.dispatchEvent(new CustomEvent(UITLOG_GEBEURTENIS, { detail: k.id }));
  };
  return (
    <Venster id='tech-ruimte-uitloggen' titel={uk ? 'Вийти' : 'Afmelden'} breedte={520} onSluit={sluit}>
      <div className='tech-venster ru' data-tech-venster='uitloggen'>
        <ul className='ru-keuzes'>
          {UITLOG_KEUZES.map((k) => {
            const I = ICOON[k.id];
            const uit = k.id === 'technisch' && !heeftSessie;
            return (
              <li key={k.id} data-uitlog={k.id}>
                <button type='button' className={`ru-knop${k.gevaar ? ' is-gevaar' : ''}`} disabled={uit || r.bezig === 'beeindigen'} aria-describedby={`ru-${k.id}`} onClick={() => void doe(k)} data-uitlog-knop={k.id}>
                  <I aria-hidden='true' />{bevestig === k.id ? (uk ? `Так, ${k.naam.uk.toLowerCase()}` : `Ja, ${k.naam.nl.toLowerCase()}`) : k.id === 'technisch' && r.bezig === 'beeindigen' ? (uk ? 'Завершую…' : 'Beëindigen…') : k.naam[taal]}
                </button>
                <small id={`ru-${k.id}`} className='ru-gevolg'>{uit ? (uk ? 'Технічний сеанс зараз не відкритий.' : 'Er is nu geen technische sessie.') : k.gevolg[taal]}</small>
              </li>
            );
          })}
        </ul>
        <p className='tech-meta' data-ru-vkladka='1'>{VKLADKA_REGEL[taal]}</p>
        {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'} data-ru-melding='1'>{melding.tekst}</p> : null}
        <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div>
      </div>
    </Venster>
  );
}
