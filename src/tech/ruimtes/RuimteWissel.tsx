// Eén TUMBLER «Технічний простір» (vlag tech-ruimtes-v2). INTEG-001 (03.11.2026), wens van de eigenaar: «Кнопка „Увійти в технічний
// простір“ виглядає як дві окремі кнопки. Має бути тумблер, який виглядає так само, як коли технічний профіль увімкнено.»
// Vroeger: een gesegmenteerde keuze «Звичайний простір | Технічний простір» (twee helften met elk een pictogram en naam) — in het
// accountmenu las dat als twee losse knoppen. Nu: één schakelaar (role=switch) met spoor en bolletje, in BEIDE standen dezelfde
// vorm en plaats; alleen het bolletje schuift (links = uit/gewone ruimte, rechts = aan/technische ruimte) en het spoor kleurt mee.
// Gedrag ongewijzigd (kiesRuimte): wisselt IN PLAATS — geen herladen, getypte tekst en open vensters blijven; zonder technische sessie
// opent «aan» het startvenster («Вхід у технічний простір»); zonder recht blijft hij uit en zegt hij waarom.
// Toetsenbord: Spatie/Enter schakelt, ←/Home = uit (gewone ruimte), →/End = aan (technische ruimte). Sneltoetsen Ctrl+Alt+1/2 blijven.
// RUIMTE-WEERGAVE-001 (16.11.2026), wens van de eigenaar: «доступ», «увімкнений сеанс» і «простір у вкладці» — три різні речі.
// De schakelaar verandert nu ALLEEN wat dit tabblad toont; de technische sessie, AI-verbindingen en andere tabbladen lopen door.
// Stoppen gebeurt bewust: «Пауза» / «Продовжити» en «Завершити» (met bevestiging) staan als eigen knoppen onder de schakelaar.
// RuimteSchakelaar is de pure weergave (eenheidstest met react-dom/server); RuimteWissel koppelt hem aan de opslag.
import { useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Home, Lock, Pause, Play, Power, ShieldCheck } from 'lucide-react';
import { canonicalNavigationUrl, sessieDienst } from '../../canoniek-navigatie';
import { openTechVenster } from '../tech-opslag';
import type { RuimtesStatus } from '../ruimtes-contract';
import { RUIMTE_NAAM, standTekst, wisselFoutTekst, type Taal } from './teksten';
import { beeindigen, pauzeer, ruimtesToestand, useRuimtes, wissel } from './ruimtes-opslag';
import { SNELTOETS_TEKST } from './sneltoets';
import Vraag from '../Vraag';
import './ruimtes.css';

const HELP = {
  wat: ['Тумблер технічного простору цього облікового запису. Технічний простір — це той самий звичайний простір (ті самі дані й розкладки) плюс технічні сторінки.', 'Schakelaar voor de technische ruimte van dit account. De technische ruimte is dezelfde gewone ruimte (zelfde gegevens en indeling) plus technische pagina’s.'],
  gevolg: ['Перемикач змінює лише те, що показує ця вкладка: технічний сеанс, підключення ШІ та інші вкладки працюють далі. Зупинити їх можна окремими кнопками «Пауза» (повернення — «Продовжити», без нового входу) і «Завершити» (далі потрібен новий вхід із ключем доступу). Швидкі клавіші: Ctrl+Alt+1 — звичайний, Ctrl+Alt+2 — технічний; набраний текст і відкриті вікна лишаються.', 'De schakelaar verandert alleen wat dit tabblad toont: de technische sessie, AI-verbindingen en andere tabbladen lopen door. Stoppen doet u met de eigen knoppen «Pauze» (terug met «Doorgaan», zonder opnieuw aan te melden) en «Beëindigen» (daarna opnieuw aanmelden met Passkey). Sneltoetsen: Ctrl+Alt+1 — gewone, Ctrl+Alt+2 — technische; getypte tekst en open vensters blijven.'],
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
    return { ok: true, tekst: naar === 'technisch' ? (uk ? 'Готово: ви в технічному просторі.' : 'Klaar: u bent in de technische ruimte.') : (uk ? 'Готово: ця вкладка у звичайному просторі. Технічний сеанс і ШІ працюють далі.' : 'Klaar: dit tabblad toont de gewone ruimte. De technische sessie en de AI lopen door.') };
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
  /** «Пауза» (true) / «Продовжити» (false) van de hele sessie; zonder: geen knoppen. */
  onPauze?: (aan: boolean) => void;
  /** «Завершити»: eerste klik vraagt bevestiging (bevestig=true), tweede klik beëindigt. */
  onEinde?: () => void;
  bevestigEinde?: boolean;
};

/** De tumbler zelf, zonder opslag. */
export function RuimteSchakelaar({ status: s, nu, taal, compact = false, bezig = false, uitkomst = null, onKies, knopRef, onPauze, onEinde, bevestigEinde = false }: RuimteSchakelaarProps) {
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
      {s.sessie && (onPauze || onEinde) ? (
        <div className='rw-acties' data-ruimte-acties='1'>
          {onPauze ? (s.pauze
            ? <button type='button' className='rw-actie' data-ruimte-pauze-knop='uit' disabled={bezig} onClick={() => onPauze(false)}
                title={uk ? 'Продовжити технічний сеанс: технічні сторінки, служби й ШІ знову працюють, без нового входу, доки діє термін.' : 'De technische sessie hervatten: technische pagina’s, diensten en AI werken weer, zonder opnieuw aan te melden zolang de termijn loopt.'}>
                <Play aria-hidden='true' /><span>{uk ? 'Продовжити' : 'Doorgaan'}</span></button>
            : <button type='button' className='rw-actie' data-ruimte-pauze-knop='aan' disabled={bezig} onClick={() => onPauze(true)}
                title={uk ? 'Пауза для всього технічного сеансу цього входу: технічні сторінки в усіх вкладках закриваються, ШІ поводиться за своїм правилом «під час паузи». Термін не зупиняється. «Продовжити» — без нового входу.' : 'Pauze voor de hele technische sessie van deze aanmelding: technische pagina’s in alle tabbladen sluiten, de AI volgt zijn regel «bij pauze». De termijn loopt door. «Doorgaan» kan zonder opnieuw aan te melden.'}>
                <Pause aria-hidden='true' /><span>{uk ? 'Пауза' : 'Pauze'}</span></button>) : null}
          {onEinde ? (
            <button type='button' className={`rw-actie is-gevaar${bevestigEinde ? ' is-bevestig' : ''}`} data-ruimte-einde-knop={bevestigEinde ? 'bevestig' : '1'} disabled={bezig} onClick={onEinde}
              title={uk ? 'Завершити технічний доступ цього входу: сеанс закривається в усіх вкладках, ШІ втрачає дозволи, прив’язані до цього сеансу. Щоб повернутися, потрібен новий вхід із ключем доступу. Дані не видаляються.' : 'De technische toegang van deze aanmelding beëindigen: de sessie sluit in alle tabbladen, de AI verliest toestemmingen die aan deze sessie hangen. Terugkomen vraagt een nieuwe aanmelding met Passkey. Er worden geen gegevens gewist.'}>
              <Power aria-hidden='true' /><span>{bevestigEinde ? (uk ? 'Так, завершити' : 'Ja, beëindigen') : (uk ? 'Завершити' : 'Beëindigen')}</span></button>) : null}
        </div>
      ) : null}
      {geenRecht && !compact ? <small className='rw-reden' data-ruimte-reden='1'>{GEEN_RECHT[taal]}</small> : null}
      {uitkomst ? <small className={`rw-uitkomst${uitkomst.ok ? ' is-ok' : ' is-fout'}`} role={uitkomst.ok ? 'status' : 'alert'} data-ruimte-uitkomst='1'>{uitkomst.tekst}</small> : null}
    </div>
  );
}

/** acties: knoppen «Пауза/Продовжити» en «Завершити» tonen (standaard niet in de smalle balk bovenaan, wel in menu’s en «Доступ і терміни»). */
export default function RuimteWissel({ taal, compact = false, acties = !compact }: { taal: Taal; compact?: boolean; acties?: boolean }) {
  const r = useRuimtes();
  const s = r.status;
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bevestig, setBevestig] = useState(false);
  const knop = useRef<HTMLButtonElement | null>(null);
  if (!s || !s.aan) return null;
  const kies = async (naar: 'prive' | 'technisch') => {
    setUitkomst(null); setBevestig(false);
    const u = await kiesRuimte(naar, taal);
    if (u) { setUitkomst(u); if (u.ok) knop.current?.focus(); }
  };
  const uk = taal === 'uk';
  const pauze = async (aan: boolean) => {
    setUitkomst(null); setBevestig(false);
    try {
      await pauzeer(aan);
      setUitkomst({ ok: true, tekst: aan ? (uk ? 'Технічний доступ на паузі в усіх вкладках. «Продовжити» — без нового входу.' : 'Technische toegang gepauzeerd in alle tabbladen. «Doorgaan» kan zonder opnieuw aan te melden.') : (uk ? 'Технічний доступ знову працює.' : 'De technische toegang werkt weer.') });
    } catch (e) { setUitkomst({ ok: false, tekst: wisselFoutTekst(e, taal) }); }
  };
  const einde = async () => {
    if (!bevestig) {
      setBevestig(true);
      setUitkomst({ ok: true, tekst: uk ? 'Натисніть «Так, завершити», щоб закрити технічний сеанс в усіх вкладках. Будь-яка інша дія це скасовує.' : 'Klik op «Ja, beëindigen» om de technische sessie in alle tabbladen te sluiten. Elke andere actie annuleert dit.' });
      return;
    }
    setBevestig(false); setUitkomst(null);
    try { await beeindigen(); setUitkomst({ ok: true, tekst: uk ? 'Технічний доступ завершено. Ви у звичайному просторі; щоб повернутися, потрібен новий вхід.' : 'Technische toegang beëindigd. U bent in de gewone ruimte; terugkomen vraagt een nieuwe aanmelding.' }); }
    catch (e) { setUitkomst({ ok: false, tekst: wisselFoutTekst(e, taal) }); }
  };
  const nietOpBeheer = typeof location !== 'undefined' && !['admin', 'api'].includes(sessieDienst());
  return (
    <>
      <RuimteSchakelaar status={s} nu={r.nu} taal={taal} compact={compact} bezig={r.bezig === 'wisselen' || r.bezig === 'pauzeren' || r.bezig === 'beeindigen'} uitkomst={uitkomst}
        onKies={(naar) => void kies(naar)} knopRef={knop} onPauze={acties ? (aan) => void pauze(aan) : undefined} onEinde={acties ? () => void einde() : undefined} bevestigEinde={bevestig} />
      {uitkomst?.ok && s.actief === 'technisch' && nietOpBeheer ? (
        <a className='rw-admin-link' href={canonicalNavigationUrl('admin', 'overview', taal)}>
          {taal === 'uk' ? 'Відкрити адмін-панель →' : 'Beheer openen →'}
        </a>
      ) : null}
    </>
  );
}
