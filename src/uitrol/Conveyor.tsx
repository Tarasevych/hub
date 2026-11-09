// UITROL-001 · «Конвеєр»: de acht knopen van een uitrol als geanimeerde pijplijn (Вимоги → … → Здоров’я). Elke knoop toont zijn stand,
// het lopende onderdeel en de duur; uitklappen geeft de onderdelen met tijdstip en duur (uit de echte logregels). De berekening
// staat los in conveyor-stand.ts (testbaar); hier alleen weergave. Beweging volgt prefers-reduced-motion (uitrol.css).
// Конвеєр етапів: стан, поточний підетап, тривалість; розгортається до підетапів із часом і тривалістю.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Fingerprint, HeartPulse, Loader2, MinusCircle, OctagonX, Package, Repeat, ShieldCheck, UploadCloud, Wrench, XCircle, Database as DatabaseIcoon } from 'lucide-react';
import { duur, tijdKort, tr, type Lang } from './types';
import type { Knoop, KnoopId, KnoopStand } from './conveyor-stand';

const ICOON: Record<KnoopId, typeof Package> = { vereisten: ShieldCheck, upload: UploadCloud, controle: Package, goedkeuring: Fingerprint, voorbereiding: Wrench, database: DatabaseIcoon, overschakelen: Repeat, gezondheid: HeartPulse };

function Stand({ stand }: { stand: KnoopStand }) {
  if (stand === 'ok') return <CheckCircle2 aria-hidden='true' />;
  if (stand === 'actief') return <Loader2 aria-hidden='true' className='ut-draai' />;
  if (stand === 'fout') return <XCircle aria-hidden='true' />;
  if (stand === 'gestopt') return <OctagonX aria-hidden='true' />;
  if (stand === 'overgeslagen') return <MinusCircle aria-hidden='true' />;
  return <CircleDashed aria-hidden='true' />;
}
const STAND_TEKST: Record<KnoopStand, [string, string]> = {
  wacht: ['очікує', 'wacht'], actief: ['виконується', 'bezig'], ok: ['готово', 'klaar'], fout: ['помилка', 'fout'], gestopt: ['зупинено', 'gestopt'], overgeslagen: ['не застосовно', 'n.v.t.'],
};

type Props = { lang: Lang; knopen: Knoop[]; /** geen uitklappen (compacte weergave) */ compact?: boolean };

export default function Conveyor({ lang, knopen, compact }: Props) {
  const [open, setOpen] = useState<KnoopId | null>(null);
  const actief = knopen.find((k) => k.stand === 'actief' || k.stand === 'fout' || k.stand === 'gestopt');
  const gekozen = open ? knopen.find((k) => k.id === open) : null;
  const pctKlaar = Math.round((knopen.filter((k) => k.stand === 'ok' || k.stand === 'overgeslagen').length / knopen.length) * 100);
  return <div className='ut-conv' data-ut-conveyor data-actief={actief?.id} data-stand={actief?.stand || (pctKlaar === 100 ? 'ok' : 'wacht')}>
    <ol className='ut-conv-rij' aria-label={tr(lang, 'Етапи розгортання', 'Fasen van de uitrol')} style={{ ['--ut-conv-vooruit' as string]: `${pctKlaar}%` }}>
      {knopen.map((k, i) => { const I = ICOON[k.id]; const isOpen = open === k.id; const kanOpen = !compact && (k.onderdelen.length > 0 || k.sub || k.stand !== 'wacht');
        return <li key={k.id} data-stand={k.stand} data-knoop={k.id} aria-current={k.stand === 'actief' ? 'step' : undefined} style={{ ['--ut-conv-i' as string]: i }}>
          <button type='button' className='ut-conv-knoop' disabled={!kanOpen} aria-expanded={kanOpen ? isOpen : undefined} aria-controls={kanOpen ? `ut-conv-detail-${k.id}` : undefined} onClick={() => setOpen(isOpen ? null : k.id)}
            title={`${tr(lang, k.hulpUk, k.hulpNl)}${kanOpen ? tr(lang, ' — натисніть, щоб розгорнути підетапи', ' — klik om de onderdelen te tonen') : ''}`}>
            <span className='ut-conv-bol'><I aria-hidden='true' className='ut-conv-pict' /><span className='ut-conv-stand'><Stand stand={k.stand} /></span></span>
            <span className='ut-conv-tekst'><b>{tr(lang, k.uk, k.nl)}</b>
              <small className='ut-conv-sub'>{k.stand === 'actief' && k.sub ? tr(lang, k.sub, k.subNl) : k.duurMs !== null && k.stand !== 'wacht' ? duur(k.duurMs) : tr(lang, STAND_TEKST[k.stand][0], STAND_TEKST[k.stand][1])}</small></span>
            {kanOpen && <ChevronDown aria-hidden='true' className='ut-conv-pijl' />}
          </button>
        </li>; })}
    </ol>
    {gekozen && <div className='ut-conv-detail' id={`ut-conv-detail-${gekozen.id}`} data-stand={gekozen.stand} role='region' aria-label={tr(lang, gekozen.uk, gekozen.nl)}>
      <div className='ut-conv-detail-kop'><Stand stand={gekozen.stand} /><div><b>{tr(lang, gekozen.uk, gekozen.nl)} · {tr(lang, STAND_TEKST[gekozen.stand][0], STAND_TEKST[gekozen.stand][1])}{gekozen.duurMs !== null ? ` · ${duur(gekozen.duurMs)}` : ''}</b><p>{tr(lang, gekozen.hulpUk, gekozen.hulpNl)}</p>{gekozen.sub && gekozen.stand !== 'actief' ? <p className='ut-conv-sub-tekst'>{tr(lang, gekozen.sub, gekozen.subNl)}</p> : null}</div></div>
      {gekozen.onderdelen.length > 0 ? <ol className='ut-conv-onderdelen'>
        {gekozen.onderdelen.map((o) => <li key={o.id} data-stand={o.stand}><Stand stand={o.stand} /><span className='ut-conv-ond-naam'>{tr(lang, o.uk, o.nl)}{typeof o.pct === 'number' && o.pct > 0 && o.id !== 'gestopt' ? <small> · {o.pct}%</small> : null}</span><span className='ut-conv-ond-tijd'>{o.tijd ? tijdKort(lang, o.tijd) : ''}{o.duurMs !== null ? <b> {duur(o.duurMs)}</b> : o.stand === 'actief' ? <b className='ut-conv-tikt'> …</b> : null}</span></li>)}
      </ol> : <p className='ut-conv-leeg'>{gekozen.stand === 'wacht' ? tr(lang, 'Цей етап ще не почався.', 'Deze fase is nog niet begonnen.') : gekozen.stand === 'overgeslagen' ? tr(lang, 'Для цього способу встановлення етап не застосовується (наприклад, SSH).', 'Voor deze installatiewijze is de fase niet van toepassing (bv. SSH).') : tr(lang, 'Деталей для цього етапу сервер не записав.', 'De server schreef geen details voor deze fase.')}</p>}
      {gekozen.id === 'overschakelen' && (gekozen.stand === 'actief' || gekozen.stand === 'ok') && <p className='ut-conv-let-op'><AlertTriangle aria-hidden='true' />{tr(lang, 'Від цього етапу зупинити встановлення вже не можна: сайт не можна лишати напівперемкненим. Якщо щось піде не так — автоматичний відкат.', 'Vanaf deze fase kan de installatie niet meer gestopt worden: de site mag niet half omgeschakeld blijven. Gaat er iets mis, dan draait de server automatisch terug.')}</p>}
    </div>}
  </div>;
}
