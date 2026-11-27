// AI-TERMIJN-001 (15.11.2026): kaart per AI-agent in «Доступ і терміни» → «Доступ ШІ». Vervangt de kale rij + native <select>
// («Змінити доступ…», «* instelling»). Eén kaart per agent (logo + naam), daaronder de verbindingen van die agent; de termijn en de
// regels gelden voor de AGENT (ook na herverbinden). Termijn: snelknoppen, exacte datum en tijd, tot einde technische sessie / tot
// afmelden van deze aanmelding / tot afmelden van het account / onbepaald. Regels: pauze, inactief, afmelden. Gevaarlijke keuzes
// zijn niet verboden: ze dragen «!» en de uitleg van het risico. De server beslist en vraagt de passkey (stap-op).
//
// Картка доступу ШІ: логотип, назва, живий стан, термін і правила скидання; ризиковані варіанти позначено «!» з поясненням.
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, Check, ChevronDown, Clock3, Hourglass, Infinity as Oneindig, LogOut, PauseCircle, ShieldCheck, ShieldOff, Users, Wrench } from 'lucide-react';
import AgentLogo from '../../agenten/AgentLogo';
import { AGENT_NAAM as GEDEELDE_AGENT_NAAM } from '../../../shared/markering-agenten';
import {
  AFMELDEN_NAAM, GEVAAR_UITLEG, INACTIEF_KEUZES, INTREK_REDEN, PAUZE_NAAM, PAUZE_UITLEG, SNELKNOPPEN, STANDAARD_REGELS, TERMIJN_NAAM, TERMIJN_UITLEG,
  gevaren, inactiefNaam, type AiRegels, type AiTermijn, type BijAfmelden, type BijPauze,
} from '../../../shared/ai-delegatie';
import type { AiDelegatieWeergave, ToegangRegel } from '../ruimtes-api';
import { restTekst, type Taal } from './teksten';
import './ai-toegang.css';

export type AiKaartGroep = { sleutel: string; agent: string | null; naam: string; verbindingen: ToegangRegel[]; delegatie: AiDelegatieWeergave | null };
export type AiOpslaan = { sleutel: string; naam: string; termijn: AiTermijn; minuten?: number; eindOp?: number | null; regels: AiRegels };

// Eén bron voor de namen (shared/markering-agenten.ts). De eigen lijst hier kende tot 16.11.2026 maar negen agenten, zodat
// Windsurf, Cline, Devin en OpenCode als kale code op de kaart stonden.
const AGENT_NAAM: Record<string, string> = GEDEELDE_AGENT_NAAM;

/** Rijen van het tabblad «Доступ ШІ» → één groep per agent; verbindingen zonder bekende agent elk apart; '*' als eigen groep. */
export function groepeerAi(regels: readonly ToegangRegel[]): AiKaartGroep[] {
  const uit = new Map<string, AiKaartGroep>();
  for (const r of regels) {
    if (r.soort !== 'ai') continue;
    const sleutel = r.id === '*' ? '*' : r.agent ? `agent:${r.agent}` : r.id;
    const g = uit.get(sleutel) ?? { sleutel, agent: r.id === '*' ? null : r.agent ?? null, naam: r.id === '*' ? '*' : r.agent ? AGENT_NAAM[r.agent] ?? r.agent : r.naam, verbindingen: [], delegatie: null };
    if (r.id !== '*' && !r.id.startsWith('agent:')) g.verbindingen.push(r);
    // De agentregel (of '*') wint als weergave; anders de eerste tokenregel.
    if (r.delegatie && (!g.delegatie || r.delegatie.sleutel === sleutel)) g.delegatie = r.delegatie;
    uit.set(sleutel, g);
  }
  return [...uit.values()].sort((a, b) => (a.sleutel === '*' ? 1 : b.sleutel === '*' ? -1 : a.naam.localeCompare(b.naam)));
}

const t = (uk: string, nl: string, taal: Taal) => (taal === 'uk' ? uk : nl);
const datumTijd = (ms: number, taal: Taal) => new Date(ms).toLocaleString(taal === 'uk' ? 'uk-UA' : 'nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const datumKort = (ms: number, taal: Taal) => new Date(ms).toLocaleDateString(taal === 'uk' ? 'uk-UA' : 'nl-BE', { day: '2-digit', month: '2-digit' });
/** ms → waarde voor <input type=datetime-local> in de lokale tijdzone. */
export const naarLokaal = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
/** Lange resttijd leesbaar: «ще 6 дн 3 год» / «nog 6 d 3 u». */
export function restLang(eind: number | null, nu: number, taal: Taal): string | null {
  if (!eind) return null;
  const m = Math.max(0, Math.round((eind - nu) / 60000));
  if (m < 48 * 60) return restTekst(eind, nu, taal);
  const d = Math.floor(m / 1440), u = Math.floor((m % 1440) / 60);
  return taal === 'uk' ? `ще ${d} дн${u ? ` ${u} год` : ''}` : `nog ${d} d${u ? ` ${u} u` : ''}`;
}

type Stand = { klasse: 'ok' | 'warn' | 'uit' | 'gevaar'; tekst: string; icoon: ReactNode };
export function standVan(d: AiDelegatieWeergave | null, nu: number, taal: Taal): Stand {
  if (!d || !d.technisch) return { klasse: 'uit', tekst: t('Лише звичайний простір', 'Alleen gewone ruimte', taal), icoon: <ShieldOff size={13} aria-hidden='true' /> };
  if (d.stand === 'ingetrokken' || d.ingetrokkenOp) {
    const reden = d.code && d.code in INTREK_REDEN ? INTREK_REDEN[d.code as keyof typeof INTREK_REDEN][taal] : '';
    return { klasse: 'uit', tekst: `${t('Знято', 'Ingetrokken', taal)}${reden ? ` · ${reden}` : ''}`, icoon: <ShieldOff size={13} aria-hidden='true' /> };
  }
  const rest = restLang(d.eindTijd, nu, taal);
  if (d.stand === 'actief') return { klasse: 'ok', tekst: `${t('Технічний доступ активний', 'Technische toegang actief', taal)}${rest ? ` · ${rest}` : ''}`, icoon: <ShieldCheck size={13} aria-hidden='true' /> };
  if (d.stand === 'doorwerken') return { klasse: 'gevaar', tekst: `${t('Працює, поки ви у звичайному профілі', 'Werkt terwijl u in de gewone ruimte zit', taal)}${rest ? ` · ${rest}` : ''}`, icoon: <AlertTriangle size={13} aria-hidden='true' /> };
  if (d.stand === 'wacht') {
    const w = d.code === 'AI_PAUZE' ? t('Чекає: ви на паузі', 'Wacht: u staat op pauze', taal)
      : d.code === 'AI_WACHT_OP_AANMELDING' ? t('Чекає вашого входу', 'Wacht op uw aanmelding', taal) : t('Чекає технічного сеансу', 'Wacht op een technische sessie', taal);
    return { klasse: 'warn', tekst: w, icoon: <PauseCircle size={13} aria-hidden='true' /> };
  }
  return { klasse: 'uit', tekst: t('Не дозволено', 'Niet toegestaan', taal), icoon: <ShieldOff size={13} aria-hidden='true' /> };
}

/** Eén regel samenvatting van termijn + regels, zoals de eigenaar ze leest. */
export function samenvatting(d: AiDelegatieWeergave, taal: Taal): string {
  const delen = [d.termijn === 'tijd' && d.eindTijd ? `${t('до', 'tot', taal)} ${datumTijd(d.eindTijd, taal)}` : TERMIJN_NAAM[d.termijn][taal]];
  delen.push(`${t('при перемиканні', 'bij wisselen', taal)}: ${PAUZE_NAAM[d.regels.bijPauze][taal].toLowerCase()}`);
  delen.push(d.regels.inactiefMinuten === null ? t('без скидання за неактивністю', 'zonder intrekken bij inactiviteit', taal) : `${t('скинути після', 'intrekken na', taal)} ${inactiefNaam(d.regels.inactiefMinuten)[taal]} ${t('без дій', 'zonder gebruik', taal)}`);
  return delen.join(' · ');
}

type TermijnKeuze = 'snel' | 'datum' | 'tot-technisch-einde' | 'tot-site-uitloggen' | 'tot-account-uitloggen' | 'onbepaald';
const KEUZES: Array<{ id: TermijnKeuze; icoon: ReactNode; naam: { uk: string; nl: string }; gevaar?: boolean }> = [
  { id: 'snel', icoon: <Clock3 size={15} aria-hidden='true' />, naam: { uk: 'На час', nl: 'Voor een tijd' } },
  { id: 'datum', icoon: <CalendarClock size={15} aria-hidden='true' />, naam: { uk: 'До дати й години', nl: 'Tot datum en uur' } },
  { id: 'tot-technisch-einde', icoon: <Wrench size={15} aria-hidden='true' />, naam: { uk: 'До кінця техн. сеансу', nl: 'Tot einde techn. sessie' } },
  { id: 'tot-site-uitloggen', icoon: <LogOut size={15} aria-hidden='true' />, naam: { uk: 'До виходу з цього входу', nl: 'Tot afmelden hier' } },
  { id: 'tot-account-uitloggen', icoon: <Users size={15} aria-hidden='true' />, naam: { uk: 'До виходу з облікового запису', nl: 'Tot afmelden account' } },
  { id: 'onbepaald', icoon: <Oneindig size={15} aria-hidden='true' />, naam: { uk: 'Безстроково', nl: 'Onbepaald' }, gevaar: true },
];

function Uitroep({ titel }: { titel: string }) {
  return <span className='ait-uitroep' role='img' aria-label={titel} title={titel}>!</span>;
}

export function AiEditor({ taal, groep, nu, bezig, onOpslaan, onAnnuleer }: { taal: Taal; groep: AiKaartGroep; nu: number; bezig: boolean; onOpslaan: (o: AiOpslaan) => void; onAnnuleer: () => void }) {
  const d = groep.delegatie && groep.delegatie.technisch && !groep.delegatie.ingetrokkenOp ? groep.delegatie : null;
  const [keuze, setKeuze] = useState<TermijnKeuze>(() => (d ? (d.termijn === 'tijd' ? 'datum' : d.termijn) : 'tot-account-uitloggen'));
  const [snel, setSnel] = useState<number>(480);
  const [datum, setDatum] = useState<string>(() => naarLokaal(d?.eindTijd ?? nu + 24 * 3600_000));
  const [bijPauze, setBijPauze] = useState<BijPauze>(d?.regels.bijPauze ?? STANDAARD_REGELS.bijPauze);
  const [inactief, setInactief] = useState<number | null>(d ? d.regels.inactiefMinuten : STANDAARD_REGELS.inactiefMinuten);
  const [bijAfmelden, setBijAfmelden] = useState<BijAfmelden>(d?.regels.bijAfmelden ?? STANDAARD_REGELS.bijAfmelden);
  const termijn: AiTermijn = keuze === 'snel' || keuze === 'datum' ? 'tijd' : keuze;
  const datumMs = Date.parse(datum);
  const eindOp = keuze === 'snel' ? nu + snel * 60_000 : keuze === 'datum' && Number.isFinite(datumMs) ? datumMs : null;
  const datumFout = keuze === 'datum' && (!Number.isFinite(datumMs) || datumMs < nu + 15 * 60_000) ? t('Виберіть момент щонайменше через 15 хв.', 'Kies een moment minstens 15 min vanaf nu.', taal) : '';
  const afmeldenTelt = termijn === 'tijd' || termijn === 'onbepaald';
  const regels: AiRegels = { bijPauze, inactiefMinuten: inactief, bijAfmelden: afmeldenTelt ? bijAfmelden : 'intrekken' };
  const risico = useMemo(() => gevaren({ termijn, eindOp, regels }, nu), [termijn, eindOp, bijPauze, inactief, bijAfmelden, nu]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = `ait-${groep.sleutel.replace(/[^a-z0-9]/gi, '')}`;
  const opslaan = () => onOpslaan({ sleutel: groep.sleutel, naam: groep.naam === '*' ? '' : groep.naam, termijn, ...(keuze === 'snel' ? { minuten: snel } : keuze === 'datum' ? { eindOp } : {}), regels });

  return (
    <div className='ait-editor' data-ait-editor={groep.sleutel}>
      <fieldset className='ait-groep'>
        <legend><Hourglass size={15} aria-hidden='true' />{t('Термін доступу до технічного простору', 'Termijn van toegang tot de technische ruimte', taal)}</legend>
        <div className='ait-segment' role='radiogroup' aria-label={t('Термін', 'Termijn', taal)}>
          {KEUZES.map((k) => (
            <button key={k.id} type='button' role='radio' aria-checked={keuze === k.id} className={`ait-seg${k.gevaar ? ' is-gevaar' : ''}`} data-ait-termijn={k.id} onClick={() => setKeuze(k.id)}>
              {k.icoon}<span>{k.naam[taal]}</span>{k.gevaar ? <Uitroep titel={GEVAAR_UITLEG.onbepaald[taal]} /> : null}
            </button>
          ))}
        </div>
        {keuze === 'snel' ? (
          <div className='ait-chips' role='radiogroup' aria-label={t('Швидкий вибір', 'Snelle keuze', taal)}>
            {SNELKNOPPEN.map((s) => (
              <button key={s.id} type='button' role='radio' aria-checked={snel === s.minuten} className={`ait-chip${s.gevaar ? ' is-gevaar' : ''}`} data-ait-snel={s.id} onClick={() => setSnel(s.minuten)}
                title={s.gevaar ? GEVAAR_UITLEG.lang[taal] : t(`Доступ сам закінчиться ${datumTijd(nu + s.minuten * 60_000, taal)}`, `Toegang stopt vanzelf op ${datumTijd(nu + s.minuten * 60_000, 'nl')}`, taal)}>
                {s.label[taal]}{s.gevaar ? <Uitroep titel={GEVAAR_UITLEG.lang[taal]} /> : null}
              </button>
            ))}
          </div>
        ) : null}
        {keuze === 'datum' ? (
          <div className='ait-datum'>
            <label htmlFor={`${id}-datum`}>{t('Діє до', 'Geldig tot', taal)}</label>
            <input id={`${id}-datum`} type='datetime-local' value={datum} min={naarLokaal(nu + 15 * 60_000)} max={naarLokaal(nu + 5 * 366 * 864e5)} onChange={(e) => setDatum(e.target.value)} aria-invalid={!!datumFout} data-ait-datum='1' />
            <small className={datumFout ? 'is-fout' : ''} role={datumFout ? 'alert' : undefined}>{datumFout || restLang(eindOp, nu, taal)}</small>
          </div>
        ) : null}
        <p className='ait-uitleg'>{keuze === 'snel' && eindOp ? `${t('Закінчиться', 'Stopt op', taal)} ${datumTijd(eindOp, taal)}. ` : ''}{TERMIJN_UITLEG[termijn][taal]}</p>
      </fieldset>

      <details className='ait-groep ait-regels' open>
        <summary><PauseCircle size={15} aria-hidden='true' />{t('Правила скидання', 'Regels voor intrekken', taal)}<ChevronDown size={15} className='ait-pijl' aria-hidden='true' /></summary>
        <div className='ait-regel'>
          <span className='ait-regel-naam' id={`${id}-pauze`}>{t('Коли ви перемикаєтеся у звичайний профіль', 'Als u naar de gewone ruimte overschakelt', taal)}</span>
          <div className='ait-segment ait-segment-3' role='radiogroup' aria-labelledby={`${id}-pauze`}>
            {(['pauzeren', 'intrekken', 'doorwerken'] as BijPauze[]).map((p) => (
              <button key={p} type='button' role='radio' aria-checked={bijPauze === p} className={`ait-seg${p === 'doorwerken' ? ' is-gevaar' : ''}`} data-ait-pauze={p} onClick={() => setBijPauze(p)} title={PAUZE_UITLEG[p][taal]}>
                <span>{PAUZE_NAAM[p][taal]}</span>{p === 'pauzeren' ? <small className='ait-typisch'>{t('типово', 'standaard', taal)}</small> : null}{p === 'doorwerken' ? <Uitroep titel={GEVAAR_UITLEG.doorwerken[taal]} /> : null}
              </button>
            ))}
          </div>
          <p className='ait-uitleg'>{PAUZE_UITLEG[bijPauze][taal]}</p>
        </div>
        <div className='ait-regel'>
          <span className='ait-regel-naam' id={`${id}-inactief`}>{t('Якщо ШІ нічого не робить у технічному просторі', 'Als de AI niets doet in de technische ruimte', taal)}</span>
          <div className='ait-chips' role='radiogroup' aria-labelledby={`${id}-inactief`}>
            {[...INACTIEF_KEUZES, null].map((m) => (
              <button key={String(m)} type='button' role='radio' aria-checked={inactief === m} className={`ait-chip${m === null ? ' is-gevaar' : ''}`} data-ait-inactief={String(m)} onClick={() => setInactief(m)}
                title={m === null ? GEVAAR_UITLEG['nooit-inactief'][taal] : t(`Скинути доступ після ${inactiefNaam(m).uk} без жодної технічної дії ШІ`, `Intrekken na ${inactiefNaam(m).nl} zonder technische actie van de AI`, taal)}>
                {m === null ? t('Ніколи', 'Nooit', taal) : inactiefNaam(m)[taal]}{m === STANDAARD_REGELS.inactiefMinuten ? <small className='ait-typisch'>{t('типово', 'standaard', taal)}</small> : null}{m === null ? <Uitroep titel={GEVAAR_UITLEG['nooit-inactief'][taal]} /> : null}
              </button>
            ))}
          </div>
        </div>
        {afmeldenTelt ? (
          <div className='ait-regel'>
            <span className='ait-regel-naam' id={`${id}-afm`}>{t('Коли ви виходите з облікового запису на всіх пристроях', 'Als u zich overal afmeldt', taal)}</span>
            <div className='ait-segment ait-segment-2' role='radiogroup' aria-labelledby={`${id}-afm`}>
              {(['intrekken', 'blijven'] as BijAfmelden[]).map((a) => (
                <button key={a} type='button' role='radio' aria-checked={bijAfmelden === a} className={`ait-seg${a === 'blijven' ? ' is-gevaar' : ''}`} data-ait-afmelden={a} onClick={() => setBijAfmelden(a)}>
                  <span>{AFMELDEN_NAAM[a][taal]}</span>{a === 'intrekken' ? <small className='ait-typisch'>{t('типово', 'standaard', taal)}</small> : <Uitroep titel={GEVAAR_UITLEG['na-afmelden'][taal]} />}
                </button>
              ))}
            </div>
          </div>
        ) : <p className='ait-uitleg'>{t('Вихід з облікового запису на всіх пристроях завжди знімає цей доступ.', 'Overal afmelden trekt deze toegang altijd in.', taal)}</p>}
      </details>

      {risico.length ? (
        <div className='ait-risico' role='note' data-ait-risico={risico.join(',')}>
          <AlertTriangle size={16} aria-hidden='true' />
          <div>
            <b>{t('Ви свідомо вибираєте ширший доступ', 'U kiest bewust voor ruimere toegang', taal)}</b>
            <ul>{risico.map((r) => <li key={r}>{GEVAAR_UITLEG[r][taal]}</li>)}</ul>
            <small>{t('Кожна видача, зміна й скидання записуються в журнал і центр сповіщень. Зберегти можна лише з підтвердженням ключ доступу.', 'Elke toekenning, wijziging en intrekking komt in het journaal en het meldingencentrum. Opslaan vraagt een Passkey-bevestiging.', taal)}</small>
          </div>
        </div>
      ) : null}

      <div className='ait-knoppen'>
        <button type='button' className='ait-knop' onClick={onAnnuleer} disabled={bezig}>{t('Скасувати', 'Annuleren', taal)}</button>
        <button type='button' className={`ait-knop ait-knop-hoofd${risico.length ? ' is-gevaar' : ''}`} onClick={opslaan} disabled={bezig || !!datumFout} data-ait-opslaan={groep.sleutel}>
          <Check size={15} aria-hidden='true' />{bezig ? t('Зберігаю…', 'Opslaan…', taal) : risico.length ? t('Зберегти попри ризик', 'Toch opslaan', taal) : t('Зберегти', 'Opslaan', taal)}
        </button>
      </div>
    </div>
  );
}

export default function AiToegangKaart({ taal, groep, nu, mag, magReden, bezig, open, onOpen, onOpslaan, onIntrekken }: {
  taal: Taal; groep: AiKaartGroep; nu: number; mag: boolean; magReden: string; bezig: boolean; open: boolean;
  onOpen: (open: boolean) => void; onOpslaan: (o: AiOpslaan) => void; onIntrekken: (sleutel: string, naam: string) => void;
}) {
  const d = groep.delegatie;
  const stand = standVan(d, nu, taal);
  const actief = !!d && d.technisch && !d.ingetrokkenOp && d.stand !== 'ingetrokken';
  const alle = groep.sleutel === '*';
  const naam = alle ? t('Усі інші підключення ШІ', 'Alle andere AI-verbindingen', taal) : groep.naam;
  const gev = d && actief ? gevaren({ termijn: d.termijn, eindOp: d.eindTijd, regels: d.regels }, nu) : [];
  return (
    <article className={`ait-kaart${open ? ' is-open' : ''}`} data-ait-kaart={groep.sleutel} data-ait-stand={d?.stand ?? 'geen'}>
      <header className='ait-kop'>
        <span className='ait-logo'>{alle ? <span className='ait-logo-alle'><Users size={20} aria-hidden='true' /></span> : <AgentLogo agent={groep.agent ?? groep.naam} naam={groep.naam} size={40} />}</span>
        <div className='ait-wie'>
          <b>{naam}</b>
          <small>
            {alle ? t('Типове правило для ШІ без власного правила. Краще давати доступ кожному ШІ окремо.', 'Standaard voor AI zonder eigen regel. Geef liever elke AI apart toegang.', taal)
              : groep.verbindingen.length
                ? groep.verbindingen.map((v) => `${v.naam || 'MCP'}${v.tokenTot ? ` · ${t('підключення до', 'koppeling tot', taal)} ${datumKort(v.tokenTot, taal)}` : ''}`).join(' · ')
                : t('Зараз не підключено. Правило подіє, щойно ви підключите цей ШІ.', 'Nu niet gekoppeld. De regel geldt zodra u deze AI koppelt.', taal)}
          </small>
        </div>
        <span className={`ait-stand is-${stand.klasse}`} data-ait-standtekst='1'>{stand.icoon}{stand.tekst}</span>
      </header>
      {actief && d ? (
        <p className='ait-samen'>{samenvatting(d, taal)}{gev.length ? <span className='ait-samen-gevaar'><Uitroep titel={gev.map((g) => GEVAAR_UITLEG[g][taal]).join(' ')} />{t(gev.length === 1 ? 'свідомий ризик' : `свідомих ризиків: ${gev.length}`, gev.length === 1 ? 'bewust risico' : `bewuste risico's: ${gev.length}`, taal)}</span> : null}</p>
      ) : null}
      {!open ? (
        <div className='ait-knoppen'>
          <button type='button' className='ait-knop ait-knop-hoofd' disabled={!mag || bezig} title={mag ? t('Вибрати термін і правила для цього ШІ', 'Termijn en regels voor deze AI kiezen', taal) : magReden} onClick={() => onOpen(true)} data-ait-wijzig={groep.sleutel}>
            <Hourglass size={15} aria-hidden='true' />{actief ? t('Змінити термін і правила', 'Termijn en regels wijzigen', taal) : t('Дозволити технічний простір…', 'Technische ruimte toestaan…', taal)}
          </button>
          {actief ? (
            <button type='button' className='ait-knop ait-knop-zacht-gevaar' disabled={bezig} onClick={() => onIntrekken(groep.sleutel, naam)} data-ait-intrekken={groep.sleutel}
              title={t('ШІ одразу втрачає технічні інструменти. Звичайний простір лишається. Повернути можна лише новим дозволом.', 'De AI verliest meteen de technische hulpmiddelen. De gewone ruimte blijft. Terug kan alleen met een nieuwe toestemming.', taal)}>
              <ShieldOff size={15} aria-hidden='true' />{t('Зняти доступ', 'Toegang intrekken', taal)}
            </button>
          ) : null}
        </div>
      ) : <AiEditor taal={taal} groep={groep} nu={nu} bezig={bezig} onOpslaan={onOpslaan} onAnnuleer={() => onOpen(false)} />}
    </article>
  );
}
