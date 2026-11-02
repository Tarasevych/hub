// Per type: звук / спливаючі / показувати (18.10.2026). In de gewone meldingenbel (CanonicalNotificationCenter → «Типи сповіщень»).
// Opslag: zijbalkvoorkeuren `meldingen.soorten` (server, owner_ui_preferences_v1; localStorage alleen als cache) via zetZijbalk.
// Technische types alleen voor een account met technisch profiel. Kritieke types: geluid en opduiken mogen uit, verbergen niet.
import { BellOff, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { MELDING_TYPE_IDS, TOAST_SECONDEN_KEUZES, isKritiekType, typeInfo, voorkeurVoor, type MeldingType, type TypeVoorkeur } from '../../shared/melding-typen';
import { useZijbalkVoorkeuren, zetZijbalk } from '../zijbalk-voorkeuren';
import './meldingen.css';

type Props = { lang: 'uk' | 'nl'; techTypen: boolean };
type Veld = Exclude<keyof TypeVoorkeur, 'seconden'>;

export function zetTypeVoorkeur(type: MeldingType, veld: Veld, waarde: boolean): void {
  if (veld === 'tonen' && isKritiekType(type) && !waarde) return; // kritiek: nooit helemaal verbergen
  zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, soorten: { ...cur.meldingen.soorten, [type]: { ...voorkeurVoor(cur.meldingen.soorten, type), [veld]: waarde } } } }));
}
/** Hoe lang de pop-up van dit type staat (3–60 s); zonder «blijft staan». */
export function zetTypeSeconden(type: MeldingType, seconden: number): void {
  const veilig = Math.min(60, Math.max(3, Math.round(seconden)));
  zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, soorten: { ...cur.meldingen.soorten, [type]: { ...voorkeurVoor(cur.meldingen.soorten, type), seconden: veilig } } } }));
}
export function zetAlleTypen(typen: readonly MeldingType[], veld: Veld, waarde: boolean): void {
  zetZijbalk((cur) => {
    const soorten = { ...cur.meldingen.soorten };
    for (const t of typen) { if (veld === 'tonen' && isKritiekType(t) && !waarde) continue; soorten[t] = { ...voorkeurVoor(soorten, t), [veld]: waarde }; }
    return { ...cur, meldingen: { ...cur.meldingen, soorten } };
  });
}

export default function MeldingVoorkeurenPaneel({ lang, techTypen }: Props) {
  const uk = lang === 'uk', t = (a: string, b: string) => (uk ? a : b);
  const soorten = useZijbalkVoorkeuren().meldingen.soorten;
  const prive = MELDING_TYPE_IDS.filter((id) => typeInfo(id).ruimte === 'prive');
  const tech = MELDING_TYPE_IDS.filter((id) => typeInfo(id).ruimte === 'technisch');
  const groep = (titel: string, uitleg: string, ids: MeldingType[], sleutel: string) => {
    const allesStil = ids.every((id) => !voorkeurVoor(soorten, id).geluid);
    return (
      <fieldset className='mv-groep' data-mv-groep={sleutel}>
        <legend>{titel}</legend>
        <p className='mv-uitleg'>{uitleg}</p>
        <div className='mv-kop' aria-hidden='true'><span /><span>{t('Звук', 'Geluid')}</span><span>{t('Спливає', 'Pop-up')}</span><span>{t('Видно', 'Tonen')}</span><span>{t('Лишається', 'Blijft staan')}</span><span>{t('Час', 'Duur')}</span></div>
        {ids.map((id) => {
          const v = voorkeurVoor(soorten, id), info = typeInfo(id), kritiek = isKritiekType(id), naam = uk ? info.naam[0] : info.naam[1];
          return (
            <div key={id} className={`mv-rij${!v.tonen ? ' is-verborgen' : ''}`} data-mv-type={id} data-mv-kritiek={kritiek ? '1' : undefined}>
              <span className='mv-naam'>{kritiek ? <ShieldAlert aria-hidden='true' /> : null}<span>{naam}{kritiek ? <small id={`mv-k-${id}`}>{t('Безпека: звук і спливання можна вимкнути, приховати — ні.', 'Beveiliging: geluid en pop-up kunnen uit, verbergen niet.')}</small> : null}</span></span>
              <label className='mv-schakel'><input type='checkbox' checked={v.geluid} disabled={!v.tonen} data-mv-veld='geluid' onChange={(e) => zetTypeVoorkeur(id, 'geluid', e.target.checked)} aria-label={`${naam}: ${t('звук', 'geluid')}`} /><span aria-hidden='true' /></label>
              <label className='mv-schakel'><input type='checkbox' checked={v.opduiken} disabled={!v.tonen} data-mv-veld='opduiken' onChange={(e) => zetTypeVoorkeur(id, 'opduiken', e.target.checked)} aria-label={`${naam}: ${t('спливаючі сповіщення', 'pop-upmeldingen')}`} /><span aria-hidden='true' /></label>
              <label className='mv-schakel'><input type='checkbox' checked={v.tonen} disabled={kritiek} data-mv-veld='tonen' onChange={(e) => zetTypeVoorkeur(id, 'tonen', e.target.checked)} aria-label={`${naam}: ${t('показувати', 'tonen')}`} aria-describedby={kritiek ? `mv-k-${id}` : undefined} /><span aria-hidden='true' /></label>
              <label className='mv-schakel'><input type='checkbox' checked={v.vast} disabled={!v.tonen} data-mv-veld='vast' onChange={(e) => zetTypeVoorkeur(id, 'vast', e.target.checked)} aria-label={`${naam}: ${t('blijft staan tot ik sluit', 'blijft staan tot ik sluit')}`} /><span aria-hidden='true' /></label>
              <select className='mv-duur' data-mv-veld='seconden' value={v.seconden} disabled={!v.tonen || v.vast} onChange={(e) => zetTypeSeconden(id, Number(e.target.value))} aria-label={`${naam}: ${t('duur van de pop-up in seconden', 'duur van de pop-up in seconden')}`}>
                {[...new Set([...TOAST_SECONDEN_KEUZES, v.seconden])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s} {t('с', 's')}</option>)}
              </select>
            </div>
          );
        })}
        <div className='mv-acties'>
          <button type='button' data-mv-alles={`${sleutel}-geluid`} onClick={() => zetAlleTypen(ids, 'geluid', allesStil)}>{allesStil ? <Volume2 aria-hidden='true' /> : <VolumeX aria-hidden='true' />}{allesStil ? t('Увімкнути звук для всіх', 'Geluid voor alles aan') : t('Без звуку для всіх', 'Alles zonder geluid')}</button>
          <button type='button' data-mv-alles={`${sleutel}-opduiken`} onClick={() => zetAlleTypen(ids, 'opduiken', ids.every((id) => !voorkeurVoor(soorten, id).opduiken))}><BellOff aria-hidden='true' />{ids.every((id) => !voorkeurVoor(soorten, id).opduiken) ? t('Спливаючі для всіх', 'Pop-ups voor alles') : t('Без спливаючих', 'Geen pop-ups')}</button>
        </div>
      </fieldset>
    );
  };
  return (
    <div className='mv-paneel' data-melding-voorkeuren>
      <p className='mv-uitleg'>{t('Зберігається у вашому акаунті й діє в усіх вкладках і на всіх пристроях.', 'Wordt in uw account bewaard en geldt in alle tabbladen en op alle apparaten.')}</p>
      <p className='mv-uitleg'>{t('Спливаюче вікно зникає саме після вказаного часу. Наведіть мишу або клацніть у ньому — воно лишається відкритим. «Лишається» — доки ви не закриєте його.', 'De pop-up verdwijnt na de ingestelde tijd. Houd de muis erop of klik erin, dan blijft hij staan. «Blijft staan» = tot u hem sluit.')}</p>
      {groep(t('Мої сповіщення', 'Mijn meldingen'), t('Пошта, безпека акаунта, спільний доступ та інше, що стосується лише вас.', 'E-mail, beveiliging van uw account, delen en andere zaken die alleen u aangaan.'), prive, 'prive')}
      {techTypen ? groep(t('Технічна панель', 'Technisch paneel'), t('Видно лише з технічним профілем і лише те, що стосується ваших ролей. Самі сповіщення — у смузі технічного режиму.', 'Alleen zichtbaar met een technisch profiel en alleen wat uw rollen aangaat. De meldingen zelf staan in de band van de technische modus.'), tech, 'technisch') : null}
    </div>
  );
}
