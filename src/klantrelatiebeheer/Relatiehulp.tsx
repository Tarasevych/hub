import { useEffect, useId, useState } from 'react'
import { api } from '../platform/client'
import { ecosystemTabContext } from '../tab-context'
import {
  antwoordopzet, arbeidsbijdrage, HULP_GRENS, oefenvraag, taakUitNotitie, verloopVanContact,
  type Hulpmotor, type Hulpsoort, type Relatiebron, type Relatietaal,
} from '../../shared/klantrelatie-hulp'
import './relatiehulp.css'

type Eigenschappen = {
  taal: Relatietaal
  klantnaam: string
  contacten: readonly Relatiebron[]
  openTaken: number
  minuten?: number
  magSchrijven?: boolean
  opTaak: (titel: string, datum?: string) => Promise<void>
}

const wortel = '/api/owner/klantrelatiebeheer/hulp/'
const sessie = () => ({ service: 'crm', tabContext: ecosystemTabContext(), sourceOrigin: location.origin })
const foutteksten: Record<string, [string, string]> = {
  HULP_DAGGRENS: ['Вичерпано денну кількість звернень до цього рушія.', 'De daggrens van deze motor is bereikt.'],
  HULP_GEEN_RECHT: ['Ваші дозволи не передбачають цього звернення.', 'Uw toestemming omvat dit verzoek niet.'],
  HULP_MOTOR_GEWIJZIGD: ['Налаштування рушія змінилися. Відкрийте картку знову.', 'De motorinstellingen zijn gewijzigd. Open het dossier opnieuw.'],
  HULP_GEEN_VOORSTEL: ['Рушій не повернув пропозиції. Уточніть домовленість.', 'De motor gaf geen voorstel. Verduidelijk de afspraak.'],
}

export default function Relatiehulp({ taal, klantnaam, contacten, openTaken, minuten = 0, magSchrijven = true, opTaak }: Eigenschappen) {
  const t = (uk: string, nl: string) => taal === 'uk' ? uk : nl
  const label = useId()
  const [soort, zetSoort] = useState<Hulpsoort>('notitie')
  const [bron, zetBron] = useState('')
  const [voorstel, zetVoorstel] = useState('')
  const [datum, zetDatum] = useState('')
  const [stijl, zetStijl] = useState<'kort' | 'warm'>('kort')
  const [motoren, zetMotoren] = useState<Hulpmotor[]>([])
  const [motorId, zetMotor] = useState('')
  const [motorfout, zetMotorfout] = useState(false)
  const [bezig, zetBezig] = useState(false)
  const [fout, zetFout] = useState('')
  const [melding, zetMelding] = useState('')
  const [opbrengst, zetOpbrengst] = useState('')
  const [kosten, zetKosten] = useState('')
  const [uurtarief, zetUurtarief] = useState('')
  const tijd = verloopVanContact(contacten)
  const motor = motoren.find(m => m.id === motorId)
  const taalstreek = taal === 'uk' ? 'uk-UA' : 'nl-BE'
  const geld = (centen: number) => (centen / 100).toLocaleString(taalstreek, { style: 'currency', currency: 'EUR' })
  const berekening = opbrengst !== '' && kosten !== '' && uurtarief !== ''
    ? arbeidsbijdrage(Number(opbrengst) * 100, Number(kosten) * 100, minuten, Number(uurtarief) * 100) : null
  const titels: Record<Hulpsoort, string> = {
    notitie: t('Нотатка й завдання', 'Notitie en taak'),
    antwoord: t('Чернетка відповіді', 'Conceptantwoord'),
    oefening: t('Вправа з переговорів', 'Gesprek oefenen'),
  }
  const laatsteBron = [...contacten].filter(item => item.tekst.trim()).sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())[0]

  useEffect(() => {
    const stop = new AbortController()
    void api.post(wortel + 'overzicht', sessie(), { signal: stop.signal })
      .then(res => { if (!stop.signal.aborted) zetMotoren(res.data.motoren) })
      .catch(() => { if (!stop.signal.aborted) zetMotorfout(true) })
    return () => stop.abort()
  }, [])

  function wisVoorstel() {
    zetVoorstel(''); zetDatum(''); zetFout(''); zetMelding('')
  }

  function kies(keuze: Hulpsoort) {
    zetSoort(keuze); zetBron(''); wisVoorstel()
  }

  async function voorbereiden() {
    if (bezig || !bron.trim()) return
    wisVoorstel()
    const notitie = taakUitNotitie(bron, taal)
    if (soort === 'notitie') zetDatum(notitie?.datum ?? '')
    if (!motor) {
      const tekst = soort === 'notitie' ? notitie?.titel : soort === 'antwoord'
        ? antwoordopzet(bron, klantnaam, taal, stijl) : oefenvraag(bron, taal)
      zetVoorstel(tekst ?? '')
      return
    }
    zetBezig(true)
    try {
      const res = await api.post(wortel + 'voorbereiden', {
        ...sessie(), taal, soort, tekst: bron, motor: motor.id, akkoord: motor.akkoord,
      })
      zetVoorstel(soort === 'notitie' ? String(res.data.tekst).slice(0, 160) : res.data.tekst)
    } catch (oorzaak) {
      const code = (oorzaak as { response?: { data?: { error?: string; message?: string } } })?.response?.data
      const uitleg = foutteksten[String(code?.error ?? code?.message)]
      zetFout(uitleg ? t(...uitleg) : t('Рушій не відповів. Спробуйте ще раз або оберіть опрацювання за правилами.', 'De motor geeft geen antwoord. Probeer opnieuw of kies vaste regels.'))
    } finally { zetBezig(false) }
  }

  async function bewaren() {
    if (bezig || !voorstel.trim() || !magSchrijven) return
    zetBezig(true); zetFout('')
    try {
      await opTaak(voorstel.trim(), datum || undefined)
      wisVoorstel(); zetBron(''); zetMelding(t('Завдання додано до картки.', 'Taak aan het dossier toegevoegd.'))
    } catch {
      zetFout(t('Не вдалося додати завдання. Ваша чернетка збережена в цьому вікні.', 'De taak is niet toegevoegd. Uw concept staat nog in dit venster.'))
    } finally { zetBezig(false) }
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(voorstel)
      zetMelding(t('Чернетку скопійовано.', 'Concept gekopieerd.'))
    } catch { zetFout(t('Виділіть текст чернетки та скопіюйте його.', 'Selecteer de concepttekst en kopieer hem.')) }
  }

  return <section className="relatiehulp" aria-labelledby={label}>
    <h3 id={label}>{t('Наступний крок', 'Volgende stap')}</h3>
    <div className="relatiehulp-feiten">
      {tijd && <span>{t('Днів від останнього зв’язку', 'Dagen sinds laatste contact')} <strong>{tijd.verstreken}</strong></span>}
      <span>{t('Відкриті завдання', 'Openstaande taken')} <strong>{openTaken}</strong></span>
    </div>
    {tijd?.langerStil && <p>{t(`Від останнього контакту минуло ${tijd.verstreken} дн. Звичний проміжок становив ${tijd.gebruikelijk} дн. Уточніть, коли клієнтові зручно поспілкуватися.`,
      `Het laatste contact was ${tijd.verstreken} dagen geleden. De gebruikelijke tussenpoos was ${tijd.gebruikelijk} dagen. Vraag wanneer verder overleg uitkomt.`)}</p>}
    <div className="relatiehulp-keuzen" role="group" aria-label={t('Вид допомоги', 'Soort hulp')}>
      {(Object.keys(titels) as Hulpsoort[]).map(keuze => <button type="button" key={keuze} aria-pressed={soort === keuze}
        disabled={bezig} onClick={() => kies(keuze)}>{titels[keuze]}</button>)}
    </div>
    <form onSubmit={e => { e.preventDefault(); void voorbereiden() }}>
      <label>{soort === 'notitie' ? t('Що ви узгодили?', 'Wat hebt u afgesproken?') : soort === 'antwoord'
        ? t('Які відомості включити у відповідь?', 'Wat wilt u in het antwoord opnemen?')
        : t('Який аргумент бажаєте випробувати?', 'Welk argument wilt u oefenen?')}
        <textarea required rows={3} maxLength={HULP_GRENS} value={bron} disabled={bezig} onChange={e => { zetBron(e.target.value); wisVoorstel() }} />
      </label>
      {laatsteBron && <button type="button" className="relatiehulp-bron" disabled={bezig} onClick={() => {
        zetBron(laatsteBron.tekst.slice(0, HULP_GRENS)); wisVoorstel()
      }}>{t('Взяти останній запис із картки', 'Laatste aantekening uit het dossier gebruiken')}</button>}
      {soort === 'antwoord' && !motor && <label>{t('Стиль відповіді', 'Schrijfstijl')}
        <select value={stijl} disabled={bezig} onChange={e => { zetStijl(e.target.value as 'kort' | 'warm'); wisVoorstel() }}>
          <option value="kort">{t('Стисло', 'Bondig')}</option><option value="warm">{t('Привітно', 'Hartelijk')}</option>
        </select></label>}
      {motoren.length > 0 && magSchrijven ? <label>{t('Спосіб підготовки', 'Manier van opstellen')}
        <select disabled={bezig} value={motorId} onChange={e => { zetMotor(e.target.value); wisVoorstel() }}>
          <option value="">{t('Правила на цьому пристрої', 'Vaste regels op dit toestel')}</option>
          {motoren.map(m => <option key={m.id} value={m.id}>{m.naam} · {m.model}</option>)}
        </select></label> : <small>{motorfout
          ? t('Перелік власних моделей недоступний. Діють правила на цьому пристрої.', 'De eigen modellen zijn niet bereikbaar. U werkt met regels op dit toestel.')
          : t('Опрацювання за правилами на цьому пристрої.', 'Verwerking met vaste regels op dit toestel.')}</small>}
      <button type="submit" disabled={bezig || !bron.trim()}>{bezig ? t('Зачекайте…', 'Even geduld…')
        : motor ? t('Передати цей текст власній моделі', 'Deze tekst aan het eigen model geven')
          : t('Підготувати пропозицію', 'Voorstel opstellen')}</button>
    </form>
    {voorstel && <div className="relatiehulp-voorstel">
      <label>{soort === 'oefening' ? t('Можливе заперечення для вправи', 'Mogelijke tegenvraag om te oefenen') : t('Перегляньте пропозицію', 'Voorstel nakijken')}
        <textarea rows={3} value={voorstel} disabled={bezig} maxLength={soort === 'notitie' ? 160 : HULP_GRENS}
          onChange={e => zetVoorstel(e.target.value)} /></label>
      {soort === 'notitie' ? <><label>{t('Строк виконання', 'Uiterste datum')}<input type="date" value={datum} disabled={bezig}
        onChange={e => zetDatum(e.target.value)} /></label><button type="button" disabled={bezig || !magSchrijven || !voorstel.trim()} onClick={() => void bewaren()}>
        {t('Підтвердити й додати завдання', 'Bevestigen en taak toevoegen')}</button></>
        : soort === 'antwoord' ? <button type="button" onClick={() => void kopieren()}>{t('Скопіювати чернетку', 'Concept kopiëren')}</button>
          : <button type="button" onClick={() => { zetBron(voorstel + '\n'); wisVoorstel() }}>{t('Підготувати наступну відповідь', 'Volgend antwoord oefenen')}</button>}
    </div>}
    {fout && <p role="alert">{fout}</p>}
    {melding && <p role="status">{melding}</p>}
    <details><summary>{t('Прибутковість роботи з клієнтом', 'Rendement van deze relatie')}</summary>
      <p>{t('Облікований час звернень', 'Geregistreerde contacttijd')} <strong>{minuten} {t('хв', 'min')}</strong></p>
      <div className="relatiehulp-bedragen">
        <label>{t('Дохід, €', 'Opbrengst, €')}<input type="number" min="0" step="0.01" value={opbrengst} onChange={e => zetOpbrengst(e.target.value)} /></label>
        <label>{t('Прямі витрати, €', 'Directe kosten, €')}<input type="number" min="0" step="0.01" value={kosten} onChange={e => zetKosten(e.target.value)} /></label>
        <label>{t('Вартість години, €', 'Kosten per uur, €')}<input type="number" min="0" step="0.01" value={uurtarief} onChange={e => zetUurtarief(e.target.value)} /></label>
      </div>
      {berekening && <p role="status">{t('Вартість часу', 'Arbeidskosten')} <strong>{geld(berekening.arbeidskosten)}</strong> · {t('Залишок після витрат', 'Bijdrage na kosten')} <strong>{geld(berekening.bijdrage)}</strong></p>}
    </details>
  </section>
}
