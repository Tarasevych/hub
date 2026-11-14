// Per type: hoe tonen / gedrag / duur (18.10.2026; INTEG-001 03.11.2026). In de gewone meldingenbel (CanonicalNotificationCenter →
// «Типи сповіщень») en in meldingen v2 bovenaan «Правила сповіщень». Eén systeem: dezelfde velden (geluid, opduiken, tonen, vast,
// seconden) in shared/melding-typen.ts, alleen in gewone woorden gekozen:
//   «Як показувати»: спливає зі звуком / лише спливає / лише звук / лише в панелі / не показувати
//   «Поведінка»: зникає за таймером / висить, доки не закрию
//   «Тривалість»: авто (за типом і довжиною тексту) of 3–60 с
// «Приклад» toont meteen een pop-up van dit type met de gekozen instellingen.
// Opslag: zijbalkvoorkeuren `meldingen.soorten` (server, owner_ui_preferences_v1; localStorage alleen als cache) via zetZijbalk.
// Technische types alleen voor een account met technisch profiel. Kritieke types: geluid en opduiken mogen uit, verbergen niet.
import { BellOff, Play, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { MELDING_TYPE_IDS, MELDING_WEERGAVEN, TOAST_SECONDEN_KEUZES, isKritiekType, metWeergave, typeInfo, voorkeurVoor, weergaveVan, type MeldingType, type MeldingWeergave, type TypeVoorkeur } from '../../shared/melding-typen';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { useZijbalkVoorkeuren, zetZijbalk } from '../zijbalk-voorkeuren';
import './meldingen.css';

type Props = { lang: 'uk' | 'nl'; techTypen: boolean };
type Veld = Exclude<keyof TypeVoorkeur, 'seconden' | 'vastGekozen'>;

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

const WEERGAVE_NAAM: Record<MeldingWeergave, readonly [string, string]> = {
  beide: ['Спливає зі звуком', 'Pop-up met geluid'],
  popup: ['Лише спливає (без звуку)', 'Alleen pop-up (zonder geluid)'],
  geluid: ['Лише звук (без спливання)', 'Alleen geluid (geen pop-up)'],
  paneel: ['Лише в панелі (тихо)', 'Alleen in het paneel (stil)'],
  uit: ['Не показувати', 'Niet tonen'],
};

export default function MeldingVoorkeurenPaneel({ lang, techTypen }: Props) {
  const uk = lang === 'uk', t = (a: string, b: string) => (uk ? a : b);
  const soorten = useZijbalkVoorkeuren().meldingen.soorten;
  const prive = MELDING_TYPE_IDS.filter((id) => typeInfo(id).ruimte === 'prive');
  const tech = MELDING_TYPE_IDS.filter((id) => typeInfo(id).ruimte === 'technisch');
  /** Een voorbeeld-pop-up van dit type: de gebruiker ziet meteen wat zijn keuze doet (geluid, pop-up, duur, vast). */
  const voorbeeld = (id: MeldingType, naam: string) => {
    const v = voorkeurVoor(soorten, id);
    const hoe = v.vast ? t('висить, доки ви не закриєте', 'blijft staan tot u sluit') : t(`зникне за ${v.seconden || 2} с`, `verdwijnt na ${v.seconden || 2} s`);
    emitCanonicalNotice({
      text: t(`Приклад: «${naam}»`, `Voorbeeld: «${naam}»`), kind: 'info', type: id, transient: true, voorbeeld: true, source: 'voorbeeld',
      explain: t(`Так виглядатиме сповіщення цього типу. Воно ${hoe}; наведіть курсор або затисніть пальцем — відлік зупиниться.`, `Zo ziet een melding van dit type eruit. Ze ${hoe}; houd de aanwijzer of uw vinger erop — dan stopt de aftelling.`),
    });
  };
  const rij = (id: MeldingType) => {
    const v = voorkeurVoor(soorten, id), info = typeInfo(id), kritiek = isKritiekType(id), naam = uk ? info.naam[0] : info.naam[1];
    const w = weergaveVan(v);
    const popup = v.tonen && v.opduiken;
    return (
      <div key={id} className={`mv-rij${!v.tonen ? ' is-verborgen' : ''}`} data-mv-type={id} data-mv-kritiek={kritiek ? '1' : undefined} data-mv-weergave={w}>
        <span className='mv-naam'>{kritiek ? <ShieldAlert aria-hidden='true' /> : null}<span>{naam}{kritiek ? <small id={`mv-k-${id}`}>{t('Безпека: звук і спливання можна вимкнути, приховати — ні.', 'Beveiliging: geluid en pop-up kunnen uit, verbergen niet.')}</small> : null}</span></span>
        <label className='mv-veld'>
          <span>{t('Як показувати', 'Hoe tonen')}</span>
          <select data-mv-veld='weergave' value={w} onChange={(e) => zetTypeWeergave(id, e.target.value as MeldingWeergave)} aria-label={`${naam}: ${t('як показувати', 'hoe tonen')}`} aria-describedby={kritiek ? `mv-k-${id}` : undefined}>
            {MELDING_WEERGAVEN.map((x) => (x === 'uit'
              ? <option key={x} value={x} disabled={kritiek}>{t(...WEERGAVE_NAAM[x])}</option>
              : <option key={x} value={x}>{t(...WEERGAVE_NAAM[x])}</option>))}
          </select>
        </label>
        <label className='mv-veld'>
          <span>{t('Поведінка', 'Gedrag')}</span>
          <select data-mv-veld='gedrag' value={v.vast ? 'vast' : 'timer'} disabled={!popup} onChange={(e) => zetTypeVoorkeur(id, 'vast', e.target.value === 'vast')} aria-label={`${naam}: ${t('поведінка спливного вікна', 'gedrag van de pop-up')}`}>
            <option value='timer'>{t('Зникає за таймером', 'Verdwijnt na de tijd')}</option>
            <option value='vast'>{t('Висить, доки не закрию', 'Blijft staan tot ik sluit')}</option>
          </select>
        </label>
        <label className='mv-veld'>
          <span>{t('Тривалість', 'Duur')}</span>
          <select className='mv-duur' data-mv-veld='seconden' value={v.seconden} disabled={!popup || v.vast} onChange={(e) => zetTypeSeconden(id, Number(e.target.value))} aria-label={`${naam}: ${t('скільки секунд показувати спливне вікно', 'duur van de pop-up in seconden')}`}>
            {[...new Set([0, ...TOAST_SECONDEN_KEUZES, v.seconden])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s === 0 ? t('2 с (типово)', '2 s (standaard)') : `${s} ${t('с', 's')}`}</option>)}
          </select>
        </label>
        <button type='button' className='mv-voorbeeld' data-mv-voorbeeld={id} disabled={!v.tonen} onClick={() => voorbeeld(id, naam)}
          aria-label={t(`Приклад сповіщення «${naam}»`, `Voorbeeld van «${naam}»`)} title={t('Показати приклад з цими налаштуваннями', 'Een voorbeeld tonen met deze instellingen')}>
          <Play aria-hidden='true' />
        </button>
      </div>
    );
  };
  const groep = (titel: string, uitleg: string, ids: MeldingType[], sleutel: string) => {
    const allesStil = ids.every((id) => !voorkeurVoor(soorten, id).geluid);
    const geenPopups = ids.every((id) => !voorkeurVoor(soorten, id).opduiken);
    return (
      <fieldset className='mv-groep' data-mv-groep={sleutel}>
        <legend>{titel}</legend>
        <p className='mv-uitleg'>{uitleg}</p>
        {ids.map(rij)}
        <div className='mv-acties'>
          <button type='button' data-mv-alles={`${sleutel}-geluid`} onClick={() => zetAlleTypen(ids, 'geluid', allesStil)}>{allesStil ? <Volume2 aria-hidden='true' /> : <VolumeX aria-hidden='true' />}{allesStil ? t('Увімкнути звук для всіх', 'Geluid voor alles aan') : t('Без звуку для всіх', 'Alles zonder geluid')}</button>
          <button type='button' data-mv-alles={`${sleutel}-opduiken`} onClick={() => zetAlleTypen(ids, 'opduiken', geenPopups)}><BellOff aria-hidden='true' />{geenPopups ? t('Спливні для всіх', 'Pop-ups voor alles') : t('Без спливних', 'Geen pop-ups')}</button>
        </div>
      </fieldset>
    );
  };
  return (
    <div className='mv-paneel' data-melding-voorkeuren>
      <p className='mv-uitleg'>{t('Зберігається у вашому акаунті й діє в усіх вкладках і на всіх пристроях.', 'Wordt in uw account bewaard en geldt in alle tabbladen en op alle apparaten.')}</p>
      <p className='mv-uitleg'>{t('Спливне вікно типово показується 2 с (або обраний вами час). Поки курсор чи палець утримує сповіщення, відлік стоїть. Після закриття сповіщення лишається в панелі.', 'De pop-up verschijnt standaard 2 s (of de door u gekozen tijd). Zolang de aanwijzer of uw vinger op de melding rust, staat de aftelling stil. Na het sluiten blijft de melding in het paneel.')}</p>
      {groep(t('Мої сповіщення', 'Mijn meldingen'), t('Пошта, безпека акаунта, спільний доступ та інше, що стосується лише вас.', 'E-mail, beveiliging van uw account, delen en andere zaken die alleen u aangaan.'), prive, 'prive')}
      {techTypen ? groep(t('Технічна панель', 'Technisch paneel'), t('Видно лише з технічним профілем і лише те, що стосується ваших ролей. Самі сповіщення — у смузі технічного режиму.', 'Alleen zichtbaar met een technisch profiel en alleen wat uw rollen aangaat. De meldingen zelf staan in de band van de technische modus.'), tech, 'technisch') : null}
    </div>
  );
}
