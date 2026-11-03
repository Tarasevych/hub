// Eén TUMBLER «Технічний простір» (vlag tech-ruimtes-v2). INTEG-001 (03.11.2026), wens van de eigenaar: «Кнопка „Увійти в технічний
// простір“ виглядає як дві окремі кнопки. Має бути тумблер, який виглядає так само, як коли технічний профіль увімкнено.»
// Vroeger: een gesegmenteerde keuze «Звичайний простір | Технічний простір» (twee helften met elk een pictogram en naam) — in het
// accountmenu las dat als twee losse knoppen. Nu: één schakelaar (role=switch) met spoor en bolletje, in BEIDE standen dezelfde
// vorm en plaats; alleen het bolletje schuift (links = uit/gewone ruimte, rechts = aan/technische ruimte) en het spoor kleurt mee.
// Gedrag ongewijzigd (kiesRuimte): wisselt IN PLAATS — geen herladen, getypte tekst en open vensters blijven; zonder technische sessie
// opent «aan» het startvenster («Вхід у технічний простір»); zonder recht blijft hij uit en zegt hij waarom.
// Toetsenbord: Spatie/Enter schakelt, ←/Home = uit (gewone ruimte), →/End = aan (technische ruimte). Sneltoetsen Ctrl+Alt+1/2 blijven.
// RuimteSchakelaar is de pure weergave (eenheidstest met react-dom/server); RuimteWissel koppelt hem aan de opslag.
import { useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Home, Lock, ShieldCheck } from 'lucide-react';
import { openTechVenster } from '../tech-opslag';
import type { RuimtesStatus } from '../ruimtes-contract';
import { RUIMTE_NAAM, standTekst, wisselFoutTekst, type Taal } from './teksten';
import { ruimtesToestand, useRuimtes, wissel } from './ruimtes-opslag';
import { SNELTOETS_TEKST } from './sneltoets';
import Vraag from '../Vraag';
import './ruimtes.css';

const HELP = {
  wat: ['Тумблер технічного простору цього акаунта. Технічний простір — це той самий звичайний простір (ті самі дані й розкладки) плюс технічні сторінки.', 'Schakelaar voor de technische ruimte van dit account. De technische ruimte is dezelfde gewone ruimte (zelfde gegevens en indeling) plus technische pagina’s.'],
  gevolg: ['Вимкнення повертає у звичайний простір і ставить технічний сеанс на паузу; повторне ввімкнення — без нового входу, доки діє термін. Швидкі клавіші: Ctrl+Alt+1 — звичайний, Ctrl+Alt+2 — технічний; набраний текст і відкриті вікна лишаються.', 'Uitzetten brengt u terug naar de gewone ruimte en pauzeert de technische sessie; weer aanzetten kan zonder opnieuw aan te melden zolang de termijn loopt. Sneltoetsen: Ctrl+Alt+1 — gewone, Ctrl+Alt+2 — technische; getypte tekst en open vensters blijven.'],
} as const;
const GEEN_RECHT = { uk: 'Немає дозволу на технічний простір. Його дає власник сервера.', nl: 'Geen toestemming voor de technische ruimte. De servereigenaar geeft die.' } as const;

/** Eén plek voor klik én sneltoets (Ctrl+Alt+1/2). Geeft de uitkomst als tekst, of null als er niets te doen was. */
export async function kiesRuimte(naar: 'prive' | 'technisch', taal: Taal): Promise<{ ok: boolean; tekst: string } | null> {
  const r = ruimtesToestand(); const s = r.status; const uk = taal === 'uk';
  if (!s || !s.aan || naar === s.actief || r.bezig) return null;
  if (naar === 'technisch' && !s.technischToegestaan) return { ok: false, tekst: GEEN_RECHT[taal] };
  if (naar === 'technisch' && !s.sessie) { openTechVenster('activeren'); return null; }
  try {
    await wissel(naar);
    return { ok: true, tekst: naar === 'technisch' ? (uk ? 'Готово: ви в технічному просторі.' : 'Klaar: u bent in de technische ruimte.') : (uk ? 'Готово: звичайний простір, технічний сеанс на паузі.' : 'Klaar: gewone ruimte, technische sessie gepauzeerd.') };
  } catch (e) { return { ok: false, tekst: wisselFoutTekst(e, taal) }; }
}

export type RuimteSchakelaarProps = {
  status: Pick<RuimtesStatus, 'actief' | 'pauze' | 'sessie' | 'technischToegestaan'>;
  nu: number;
  taal: Taal;
  compact?: boolean;
  bezig?: boolean;
  uitkomst?: { ok: boolean; tekst: string } | null;
  onKies: (naar: 'prive' | 'technisch') => void;
  knopRef?: Ref<HTMLButtonElement>;
};

/** De tumbler zelf, zonder opslag. */
export function RuimteSchakelaar({ status: s, nu, taal, compact = false, bezig = false, uitkomst = null, onKies, knopRef }: RuimteSchakelaarProps) {
  const uk = taal === 'uk';
  const aan = s.actief === 'technisch';
  const geenRecht = !s.technischToegestaan;
  const naar: 'prive' | 'technisch' = aan ? 'prive' : 'technisch';
  const toets = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowLeft', 'Home'].includes(e.key)) { e.preventDefault(); if (aan) onKies('prive'); }
    else if (['ArrowRight', 'End'].includes(e.key)) { e.preventDefault(); if (!aan) onKies('technisch'); }
  };
  const titel = geenRecht && !aan ? GEEN_RECHT[taal]
    : aan ? `${uk ? 'Вимкнути — перейти у звичайний простір' : 'Uitzetten — naar de gewone ruimte'} (${SNELTOETS_TEKST.prive})`
      : `${uk ? 'Увімкнути технічний простір' : 'De technische ruimte aanzetten'} (${SNELTOETS_TEKST.technisch})`;
  return (
    <div className={`rw${compact ? ' rw-compact' : ''}`} data-ruimte-wissel={s.actief} data-ruimte-pauze={s.pauze ? '1' : '0'}>
      <div className='rw-rij'>
        <button ref={knopRef} type='button' role='switch' aria-checked={aan} className='rw-schakel' data-ruimte-schakel={s.actief} data-naar={naar}
          aria-disabled={(geenRecht && !aan) || undefined} aria-busy={bezig || undefined} title={titel}
          aria-keyshortcuts={aan ? 'Control+Alt+1' : 'Control+Alt+2'} onKeyDown={toets} onClick={() => onKies(naar)}>
          <span className='rw-spoor' aria-hidden='true'>
            <span className='rw-bol'>{aan ? <ShieldCheck /> : geenRecht ? <Lock /> : <Home />}</span>
          </span>
          <span className='rw-label'>
            <span className='rw-naam'>{RUIMTE_NAAM.technisch[taal]}</span>
            <span className='rw-aanuit' data-ruimte-aanuit={aan ? 'aan' : 'uit'}>{aan ? (uk ? 'увімкнено' : 'aan') : (uk ? 'вимкнено' : 'uit')}</span>
          </span>
        </button>
        {!compact ? <Vraag help={HELP} uk={uk} label={RUIMTE_NAAM.technisch[taal]} /> : null}
      </div>
      <small className='rw-stand' data-ruimte-stand='1'>{bezig ? (uk ? 'перемикаю…' : 'wisselen…') : standTekst(s, nu, taal)}</small>
      {geenRecht && !compact ? <small className='rw-reden' data-ruimte-reden='1'>{GEEN_RECHT[taal]}</small> : null}
      {uitkomst ? <small className={`rw-uitkomst${uitkomst.ok ? ' is-ok' : ' is-fout'}`} role={uitkomst.ok ? 'status' : 'alert'} data-ruimte-uitkomst='1'>{uitkomst.tekst}</small> : null}
    </div>
  );
}

export default function RuimteWissel({ taal, compact = false }: { taal: Taal; compact?: boolean }) {
  const r = useRuimtes();
  const s = r.status;
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; tekst: string } | null>(null);
  const knop = useRef<HTMLButtonElement | null>(null);
  if (!s || !s.aan) return null;
  const kies = async (naar: 'prive' | 'technisch') => {
    setUitkomst(null);
    const u = await kiesRuimte(naar, taal);
    if (u) { setUitkomst(u); if (u.ok) knop.current?.focus(); }
  };
  return <RuimteSchakelaar status={s} nu={r.nu} taal={taal} compact={compact} bezig={r.bezig === 'wisselen'} uitkomst={uitkomst} onKies={(naar) => void kies(naar)} knopRef={knop} />;
}
