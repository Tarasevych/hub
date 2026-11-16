// «Як приходять сповіщення» — keuzes per type (18.10.2026; INTEG-001 03.11.2026; MELDINGEN-UX-001 15.11.2026).
// In de gewone meldingenbel («Типи сповіщень»), in meldingen v2 bovenaan «Правила сповіщень», in het zwevende venster en op /melding.
//
// MELDINGEN-UX-001 (eigenaar: «бугалтерський список»): geen drie keuzelijsten meer in elke rij. Bovenaan één kaart «Загальне»
// (hoe tonen + hoe lang), daaronder per groep een inklapbare kaart met per type een piktogram van de dienst, een schakelaar
// «Показувати» en een korte samenvatting. Wie voor één type iets anders wil, klapt die rij open en kiest daar.
// Opslag ONGEWIJZIGD: zijbalkvoorkeuren `meldingen.soorten` (shared/melding-typen.ts; server owner_ui_preferences_v1). «Загальне»
// is geen nieuw veld: het is de meest gekozen instelling; een wijziging daar geldt voor elk type dat «як загальне» volgt, types met
// een eigen keuze blijven zoals ze zijn. Kritieke types: geluid en opduiken mogen uit, verbergen niet (schakelaar disabled).
// Opdelen: «Типи сповіщень» → «Загальне»; per type «Як показувати» (4 knoppen) en «Скільки тримати» (2/5/10/30 с of «доки не закрию»).
import { useState, type ReactNode } from 'react';
import {
  Bell, BellRing, Bot, CalendarDays, ChevronDown, Cloud, DoorOpen, Download, Globe, Inbox, KeyRound, Lock, Mail, MessageSquare,
  MonitorPlay, MonitorSmartphone, OctagonAlert, Pin, Play, Plug, RotateCcw, ScanEye, ScrollText, Server, Share2, ShieldCheck,
  ShieldHalf, Stethoscope, Terminal, UserCog, VenetianMask, Volume2, VolumeX, Wrench,
} from 'lucide-react';
import { MELDING_TYPE_IDS, isKritiekType, metWeergave, typeInfo, voorkeurVoor, weergaveVan, type MeldingType, type MeldingWeergave, type TypeVoorkeur } from '../../shared/melding-typen';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { useZijbalkVoorkeuren, zetZijbalk } from '../zijbalk-voorkeuren';
import './meldingen.css';

type Lang = 'uk' | 'nl';
type Props = {
  lang: Lang; techTypen: boolean;
  /** Algemene geluidsschakelaar (alle types); alleen waar het paneel hem heeft (meldingen v2). */
  geluid?: boolean; onGeluid?: () => void;
};
type Veld = Exclude<keyof TypeVoorkeur, 'seconden' | 'vastGekozen'>;
import { ZICHTBAAR, algemeneInstelling, duurVan, metDuur, volgtAlgemeen, type Duur, type Zichtbaar } from './voorkeur-algemeen';
export { algemeneInstelling, duurVan, volgtAlgemeen } from './voorkeur-algemeen';

export function zetTypeVoorkeur(type: MeldingType, veld: Veld, waarde: boolean): void {
  if (veld === 'tonen' && isKritiekType(type) && !waarde) return; // kritiek: nooit helemaal verbergen
  // INTEG-001: «vast» geldt alleen als de gebruiker het zelf kiest (vastGekozen); zie shared/melding-typen.ts.
  const extra = veld === 'vast' ? { vastGekozen: waarde } : {};
  zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, soorten: { ...cur.meldingen.soorten, [type]: { ...voorkeurVoor(cur.meldingen.soorten, type), [veld]: waarde, ...extra } } } }));
}
/** «Як показувати» in één keuze (zet geluid, opduiken en tonen samen; kritiek kan niet «uit»). */
export function zetTypeWeergave(type: MeldingType, weergave: MeldingWeergave): void {
  zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, soorten: { ...cur.meldingen.soorten, [type]: metWeergave(voorkeurVoor(cur.meldingen.soorten, type), weergave, type) } } }));
}
/** Hoe lang de pop-up van dit type staat (0 = standaard 2 s, anders 2–60 s); zonder «висить». */
export function zetTypeSeconden(type: MeldingType, seconden: number): void {
  const veilig = seconden <= 0 ? 0 : Math.min(60, Math.max(2, Math.round(seconden)));
  zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, soorten: { ...cur.meldingen.soorten, [type]: { ...voorkeurVoor(cur.meldingen.soorten, type), seconden: veilig } } } }));
}
export function zetAlleTypen(typen: readonly MeldingType[], veld: Veld, waarde: boolean): void {
  zetZijbalk((cur) => {
    const soorten = { ...cur.meldingen.soorten };
    for (const t of typen) {
      if (veld === 'tonen' && isKritiekType(t) && !waarde) continue;
      soorten[t] = { ...voorkeurVoor(soorten, t), [veld]: waarde, ...(veld === 'vast' ? { vastGekozen: waarde } : {}) };
    }
    return { ...cur, meldingen: { ...cur.meldingen, soorten } };
  });
}

/** «Загальне» wijzigen: alleen de types die het volgen, krijgen de nieuwe waarde; eigen keuzes blijven. */
export function zetAlgemeen(ids: readonly MeldingType[], wijziging: { weergave?: Zichtbaar; duur?: Duur }): void {
  zetZijbalk((cur) => {
    const soorten = { ...cur.meldingen.soorten };
    const alg = algemeneInstelling(soorten, ids);
    for (const id of ids) {
      let v = voorkeurVoor(soorten, id);
      if (!volgtAlgemeen(v, alg)) continue;
      if (wijziging.weergave && weergaveVan(v) !== 'uit') v = metWeergave(v, wijziging.weergave, id);
      if (wijziging.duur) v = metDuur(v, wijziging.duur);
      soorten[id] = v;
    }
    return { ...cur, meldingen: { ...cur.meldingen, soorten } };
  });
}
/** Eén type: eigen keuze, of terug naar «Загальне» (`terug`). */
function zetType(id: MeldingType, ids: readonly MeldingType[], w: { weergave?: MeldingWeergave; duur?: Duur; terug?: boolean }): void {
  zetZijbalk((cur) => {
    const alg = algemeneInstelling(cur.meldingen.soorten, ids);
    let v = voorkeurVoor(cur.meldingen.soorten, id);
    if (w.terug) v = metDuur(metWeergave(v, alg.weergave, id), alg.duur);
    if (w.weergave) v = metWeergave(v, w.weergave, id);
    if (w.duur) v = metDuur(v, w.duur);
    return { ...cur, meldingen: { ...cur.meldingen, soorten: { ...cur.meldingen.soorten, [id]: v } } };
  });
}

// ------------------------------------------------------------------------------------------------ teksten en piktogrammen
const WEERGAVE_NAAM: Record<MeldingWeergave, readonly [string, string]> = {
  beide: ['Спливає зі звуком', 'Pop-up met geluid'],
  popup: ['Лише спливає (без звуку)', 'Alleen pop-up (zonder geluid)'],
  geluid: ['Лише звук (без спливання)', 'Alleen geluid (geen pop-up)'],
  paneel: ['Лише в панелі (тихо)', 'Alleen in het paneel (stil)'],
  uit: ['Не показувати', 'Niet tonen'],
};
const WEERGAVE_KORT: Record<Zichtbaar, readonly [string, string]> = {
  beide: ['Спливає і звук', 'Pop-up + geluid'], popup: ['Без звуку', 'Zonder geluid'], geluid: ['Лише звук', 'Alleen geluid'], paneel: ['Тихо', 'Stil'],
};
const WEERGAVE_GEVOLG: Record<Zichtbaar, readonly [string, string]> = {
  beide: ['Вікно з’являється вгорі екрана, лунає короткий звук. Потім сповіщення лишається в панелі.', 'Er verschijnt een venster bovenaan met een kort geluid. Daarna blijft de melding in het paneel.'],
  popup: ['Вікно з’являється без звуку — добре для зустрічей і ночі.', 'Er verschijnt een venster zonder geluid — handig tijdens vergaderingen en ’s nachts.'],
  geluid: ['Лише короткий звук, без вікна; саме сповіщення — у панелі біля дзвіночка.', 'Alleen een kort geluid, geen venster; de melding zelf staat in het paneel bij de bel.'],
  paneel: ['Нічого не спливає й не звучить; ви побачите сповіщення, коли відкриєте дзвіночок.', 'Er verschijnt en klinkt niets; u ziet de melding wanneer u de bel opent.'],
};
const WEERGAVE_ICOON: Record<Zichtbaar, typeof Bell> = { beide: BellRing, popup: MessageSquare, geluid: Volume2, paneel: Inbox };
const DUUR_KEUZES: readonly Duur[] = ['0', '5', '10', '30', 'vast'];
const duurTekst = (d: Duur, uk: boolean) => (d === 'vast' ? (uk ? 'Доки не закрию' : 'Tot ik sluit') : d === '0' ? (uk ? '2 с' : '2 s') : `${d} ${uk ? 'с' : 's'}`);

type Stijl = { Icon: typeof Bell; kleur: string };
const TYPE_STIJL: Record<MeldingType, Stijl> = {
  post: { Icon: Mail, kleur: 'blauw' }, agenda: { Icon: CalendarDays, kleur: 'oranje' }, cloud: { Icon: Cloud, kleur: 'hemel' },
  beveiliging: { Icon: ShieldCheck, kleur: 'rood' }, toegang: { Icon: KeyRound, kleur: 'amber' }, delen: { Icon: Share2, kleur: 'groen' },
  ai: { Icon: Bot, kleur: 'paars' }, apparaten: { Icon: MonitorSmartphone, kleur: 'teal' }, inzage: { Icon: ScanEye, kleur: 'rood' },
  systeem: { Icon: Globe, kleur: 'grijs' },
  'tech.toegang': { Icon: DoorOpen, kleur: 'amber' }, 'tech.uitrol': { Icon: Download, kleur: 'blauw' }, 'tech.uitrol-mislukt': { Icon: OctagonAlert, kleur: 'rood' },
  'tech.server': { Icon: Server, kleur: 'teal' }, 'tech.diagnose': { Icon: Stethoscope, kleur: 'groen' }, 'tech.audit': { Icon: ScrollText, kleur: 'grijs' },
  'tech.grants': { Icon: UserCog, kleur: 'paars' }, 'tech.geheimen': { Icon: KeyRound, kleur: 'amber' }, 'tech.integraties': { Icon: Plug, kleur: 'hemel' },
  'tech.bescherming': { Icon: ShieldHalf, kleur: 'rood' }, 'tech.ssh': { Icon: Terminal, kleur: 'grijs' }, 'tech.remote': { Icon: MonitorPlay, kleur: 'teal' },
  'tech.impersonatie': { Icon: VenetianMask, kleur: 'paars' },
};
export const typeStijl = (id: MeldingType): Stijl => TYPE_STIJL[id] || { Icon: Bell, kleur: 'grijs' };

// ------------------------------------------------------------------------------------------------ onderdelen
function Segment<T extends string>({ label, waarde, opties, onKies, uitgeschakeld }: {
  label: string; waarde: T; uitgeschakeld?: boolean;
  opties: ReadonlyArray<{ w: T; tekst: string; uitleg: string; Icon?: typeof Bell }>; onKies: (w: T) => void;
}) {
  return (
    <div className='mvk-segment' role='radiogroup' aria-label={label} aria-disabled={uitgeschakeld || undefined}>
      {opties.map(({ w, tekst, uitleg, Icon }) => (
        <button key={w} type='button' role='radio' aria-checked={waarde === w} disabled={uitgeschakeld} title={uitleg} data-mvk-keuze={w} onClick={() => onKies(w)}>
          {Icon ? <Icon aria-hidden='true' /> : null}<span>{tekst}</span>
        </button>
      ))}
    </div>
  );
}
function Schakelaar({ aan, onWissel, label, uitgeschakeld, uitleg }: { aan: boolean; onWissel: (aan: boolean) => void; label: string; uitgeschakeld?: boolean; uitleg?: string }) {
  return (
    <button type='button' role='switch' className='mvk-schakel' aria-checked={aan} aria-label={label} title={uitleg || label} disabled={uitgeschakeld} onClick={() => onWissel(!aan)}>
      <span aria-hidden='true' />
    </button>
  );
}

export default function MeldingVoorkeurenPaneel({ lang, techTypen, geluid, onGeluid }: Props) {
  const uk = lang === 'uk', t = (a: string, b: string) => (uk ? a : b);
  const soorten = useZijbalkVoorkeuren().meldingen.soorten;
  const prive = MELDING_TYPE_IDS.filter((id) => typeInfo(id).ruimte === 'prive');
  const tech = MELDING_TYPE_IDS.filter((id) => typeInfo(id).ruimte === 'technisch');
  const alleIds = techTypen ? [...prive, ...tech] : prive;
  const alg = algemeneInstelling(soorten, alleIds);
  const [open, setOpen] = useState<MeldingType | null>(null);
  const eigen = alleIds.filter((id) => !volgtAlgemeen(voorkeurVoor(soorten, id), alg));
  const popupAlg = alg.weergave === 'beide' || alg.weergave === 'popup';

  /** Een voorbeeld-pop-up van dit type: de gebruiker ziet meteen wat zijn keuze doet (geluid, pop-up, duur, vast). */
  const voorbeeld = (id: MeldingType, naam: string) => {
    const v = voorkeurVoor(soorten, id);
    const hoe = v.vast ? t('висить, доки ви не закриєте', 'blijft staan tot u sluit') : t(`зникне за ${v.seconden || 2} с`, `verdwijnt na ${v.seconden || 2} s`);
    emitCanonicalNotice({
      text: t(`Приклад: «${naam}»`, `Voorbeeld: «${naam}»`), kind: 'info', type: id, transient: true, voorbeeld: true, source: 'voorbeeld',
      explain: t(`Так виглядатиме сповіщення цього типу. Воно ${hoe}; наведіть курсор або затисніть пальцем — відлік зупиниться.`, `Zo ziet een melding van dit type eruit. Ze ${hoe}; houd de aanwijzer of uw vinger erop — dan stopt de aftelling.`),
    });
  };
  const weergaveOpties = ZICHTBAAR.map((w) => ({ w, tekst: t(...WEERGAVE_KORT[w]), uitleg: `${t(...WEERGAVE_NAAM[w])}. ${t(...WEERGAVE_GEVOLG[w])}`, Icon: WEERGAVE_ICOON[w] }));
  const duurOpties = (extra?: Duur) => [...new Set([...DUUR_KEUZES.filter((d) => d !== 'vast'), ...(extra && extra !== 'vast' ? [extra] : []), 'vast'])]
    .sort((a, b) => (a === 'vast' ? 1 : b === 'vast' ? -1 : Number(a) - Number(b)))
    .map((d) => ({ w: d, tekst: duurTekst(d, uk), Icon: d === 'vast' ? Pin : undefined, uitleg: d === 'vast'
      ? t('Вікно не зникне само — закриєте його ви. Потім сповіщення лишається в панелі.', 'Het venster verdwijnt niet vanzelf — u sluit het. Daarna blijft de melding in het paneel.')
      : d === '0' ? t('Типово: 2 секунди. Поки курсор чи палець на сповіщенні, відлік стоїть.', 'Standaard: 2 seconden. Zolang de aanwijzer of uw vinger erop staat, staat de aftelling stil.')
      : t(`Вікно зникне через ${d} с; поки курсор чи палець на ньому, відлік стоїть.`, `Het venster verdwijnt na ${d} s; zolang de aanwijzer of uw vinger erop staat, staat de aftelling stil.`) }));

  const samenvatting = (v: TypeVoorkeur): string => {
    const w = weergaveVan(v);
    if (w === 'uit') return t('Не показується', 'Wordt niet getoond');
    if (volgtAlgemeen(v, alg)) return t('Як загальне', 'Zoals algemeen');
    const popup = w === 'beide' || w === 'popup';
    return `${t('Своє', 'Eigen')}: ${t(...WEERGAVE_KORT[w]).toLowerCase()}${popup ? ` · ${duurTekst(duurVan(v), uk).toLowerCase()}` : ''}`;
  };

  const rij = (id: MeldingType) => {
    const v = voorkeurVoor(soorten, id), info = typeInfo(id), kritiek = isKritiekType(id), naam = uk ? info.naam[0] : info.naam[1];
    const w = weergaveVan(v), zichtbaar = w !== 'uit', isOpen = open === id, volgt = volgtAlgemeen(v, alg);
    const { Icon, kleur } = typeStijl(id);
    const popup = w === 'beide' || w === 'popup';
    const detailId = `mvk-d-${id.replace(/\W/g, '-')}`;
    return (
      <li key={id} className={`mvk-rij${zichtbaar ? '' : ' is-uit'}${isOpen ? ' is-open' : ''}${volgt ? '' : ' is-eigen'}`} data-mv-type={id} data-mv-kritiek={kritiek ? '1' : undefined} data-mv-weergave={w}>
        <div className='mvk-rij-kop'>
          <span className='mvk-tegel' data-kleur={kleur} aria-hidden='true'><Icon /></span>
          <button type='button' className='mvk-rij-hoofd' aria-expanded={isOpen} aria-controls={detailId} onClick={() => setOpen(isOpen ? null : id)}
            title={t('Налаштувати окремо для цього типу', 'Apart instellen voor dit soort')}>
            <span className='mvk-naam'>{naam}{kritiek ? <span className='mvk-slot' title={t('Безпека: звук і спливання можна вимкнути, приховати — ні.', 'Beveiliging: geluid en pop-up kunnen uit, verbergen niet.')}><Lock aria-hidden='true' />{t('захищене', 'beschermd')}</span> : null}</span>
            <span className='mvk-samenvatting' data-mvk-samenvatting={volgt ? 'algemeen' : zichtbaar ? 'eigen' : 'uit'}>{samenvatting(v)}</span>
            <ChevronDown className='mvk-pijl' aria-hidden='true' />
          </button>
          <Schakelaar aan={zichtbaar} uitgeschakeld={kritiek} label={t(`Показувати «${naam}»`, `«${naam}» tonen`)}
            uitleg={kritiek ? t('Сповіщення безпеки приховати не можна — лише зробити тихими.', 'Beveiligingsmeldingen kunnen niet verborgen worden — alleen stil.') : zichtbaar ? t('Вимкнути: такі сповіщення не з’являтимуться ніде, навіть у панелі.', 'Uitzetten: zulke meldingen verschijnen nergens meer, ook niet in het paneel.') : t('Увімкнути: знову показувати, як у загальному налаштуванні.', 'Aanzetten: weer tonen zoals bij algemeen.')}
            onWissel={(aan) => zetType(id, alleIds, { weergave: aan ? alg.weergave : 'uit' })} />
        </div>
        {isOpen ? (
          <div className='mvk-detail' id={detailId}>
            {kritiek ? <p className='mvk-noot'><ShieldCheck aria-hidden='true' />{t('Безпека: звук і спливання можна вимкнути, приховати — ні.', 'Beveiliging: geluid en pop-up kunnen uit, verbergen niet.')}</p> : null}
            <span className='mvk-label'>{t('Як показувати', 'Hoe tonen')}</span>
            <Segment label={t(`${naam}: як показувати`, `${naam}: hoe tonen`)} waarde={(zichtbaar ? w : '') as Zichtbaar} opties={weergaveOpties} onKies={(x) => zetType(id, alleIds, { weergave: x })} />
            <span className='mvk-label'>{t('Скільки тримати спливне вікно', 'Hoe lang de pop-up blijft')}</span>
            <Segment label={t(`${naam}: тривалість`, `${naam}: duur`)} waarde={duurVan(v)} uitgeschakeld={!popup} opties={duurOpties(duurVan(v))} onKies={(d) => zetType(id, alleIds, { duur: d })} />
            {!popup && zichtbaar ? <p className='mvk-noot'>{t('Тривалість діє лише для спливного вікна.', 'De duur geldt alleen voor een pop-up.')}</p> : null}
            <div className='mvk-detail-voet'>
              <button type='button' className='mvk-knop' data-mv-voorbeeld={id} disabled={!zichtbaar} onClick={() => voorbeeld(id, naam)} title={t('Показати приклад сповіщення з цими налаштуваннями', 'Een voorbeeld tonen met deze instellingen')}><Play aria-hidden='true' />{t('Приклад', 'Voorbeeld')}</button>
              {!volgt ? <button type='button' className='mvk-knop' data-mvk-terug={id} onClick={() => zetType(id, alleIds, { terug: true })} title={t('Прибрати окреме налаштування: тип знову діятиме за загальним', 'Eigen instelling weghalen: dit soort volgt weer de algemene')}><RotateCcw aria-hidden='true' />{t('Як загальне', 'Zoals algemeen')}</button> : null}
            </div>
          </div>
        ) : null}
      </li>
    );
  };

  const groep = (titel: string, sub: string, ids: MeldingType[], sleutel: string, Icon: typeof Bell, standaardOpen: boolean): ReactNode => {
    const nEigen = ids.filter((id) => eigen.includes(id)).length;
    const nUit = ids.filter((id) => !voorkeurVoor(soorten, id).tonen).length;
    return (
      <details className='mvk-kaart mvk-groep' data-mv-groep={sleutel} open={standaardOpen}>
        <summary>
          <span className='mvk-tegel is-groot' data-kleur={sleutel === 'technisch' ? 'amber' : 'blauw'} aria-hidden='true'><Icon /></span>
          <span className='mvk-kaart-titel'><strong>{titel}</strong><small>{sub}</small></span>
          <span className='mvk-tellers'>
            {nEigen ? <span className='mvk-chip is-eigen' title={t('Типи з окремим налаштуванням', 'Soorten met een eigen instelling')}>{t(`своє: ${nEigen}`, `eigen: ${nEigen}`)}</span> : null}
            {nUit ? <span className='mvk-chip is-uit' title={t('Вимкнені типи', 'Uitgezette soorten')}>{t(`вимк.: ${nUit}`, `uit: ${nUit}`)}</span> : null}
          </span>
          <ChevronDown className='mvk-pijl' aria-hidden='true' />
        </summary>
        <ul className='mvk-lijst'>{ids.map(rij)}</ul>
      </details>
    );
  };

  return (
    <div className='mvk' data-melding-voorkeuren>
      <section className='mvk-kaart mvk-algemeen' aria-labelledby='mvk-alg-titel'>
        <header className='mvk-kaart-kop'>
          <span className='mvk-tegel is-groot' data-kleur='accent' aria-hidden='true'><Bell /></span>
          <span className='mvk-kaart-titel'><strong id='mvk-alg-titel'>{t('Загальне', 'Algemeen')}</strong><small>{t('Для всіх типів, крім тих, де ви вибрали своє. Діє на всіх ваших пристроях.', 'Voor alle soorten, behalve waar u iets eigens koos. Geldt op al uw apparaten.')}</small></span>
          {onGeluid ? <span className='mvk-geluid-hoofd'>{geluid ? <Volume2 aria-hidden='true' /> : <VolumeX aria-hidden='true' />}<span>{t('Звук', 'Geluid')}</span><Schakelaar aan={!!geluid} onWissel={() => onGeluid()} label={t('Звук сповіщень', 'Geluid van meldingen')}
            uitleg={geluid ? t('Вимкнути звук для всіх сповіщень на цьому сайті одразу (налаштування типів лишаються).', 'Geluid voor alle meldingen tegelijk uitzetten (de keuzes per soort blijven).') : t('Увімкнути звук знову — для типів, де він вибраний.', 'Geluid weer aanzetten — voor de soorten waar het gekozen is.')} /></span> : null}
        </header>
        {onGeluid && !geluid ? <p className='mvk-noot'><VolumeX aria-hidden='true' />{t('Звук вимкнено для всіх сповіщень.', 'Geluid staat uit voor alle meldingen.')}</p> : null}
        <span className='mvk-label'>{t('Як показувати', 'Hoe tonen')}</span>
        <Segment label={t('Загальне: як показувати', 'Algemeen: hoe tonen')} waarde={alg.weergave} opties={weergaveOpties} onKies={(w) => zetAlgemeen(alleIds, { weergave: w })} />
        <span className='mvk-label'>{t('Скільки тримати спливне вікно', 'Hoe lang de pop-up blijft')}</span>
        <Segment label={t('Загальне: тривалість', 'Algemeen: duur')} waarde={alg.duur} uitgeschakeld={!popupAlg} opties={duurOpties(alg.duur)} onKies={(d) => zetAlgemeen(alleIds, { duur: d })} />
        <p className='mvk-noot'><Wrench aria-hidden='true' />{eigen.length
          ? t(`Окреме налаштування мають ${eigen.length} з ${alleIds.length} типів — вони позначені «Своє».`, `${eigen.length} van de ${alleIds.length} soorten hebben een eigen instelling — gemarkeerd met «Eigen».`)
          : t('Усі типи діють за загальним. Окремий тип можна налаштувати, розгорнувши його нижче.', 'Alle soorten volgen het algemene. Een soort apart instellen: klap hem hieronder open.')}</p>
      </section>
      {groep(t('Мої сповіщення', 'Mijn meldingen'), t('Пошта, календар, файли, безпека акаунта', 'E-mail, agenda, bestanden, accountbeveiliging'), prive, 'prive', Bell, true)}
      {techTypen ? groep(t('Технічні', 'Technisch'), t('Лише з технічним профілем і для ваших ролей', 'Alleen met een technisch profiel en voor uw rollen'), tech, 'technisch', Server, false) : null}
    </div>
  );
}
