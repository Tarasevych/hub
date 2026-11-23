export type Relatietaal = 'uk' | 'nl'
export type Hulpsoort = 'notitie' | 'antwoord' | 'oefening'
export type Relatiebron = { datum: string | number; tekst: string }
export type Hulpmotor = { id: string; naam: string; model: string; akkoord: string }
export const HULP_GRENS = 4000

const etmaal = 86_400_000
const tijdstip = (datum: string | number) => typeof datum === 'number' ? datum : Date.parse(datum)

export function verloopVanContact(bronnen: readonly Relatiebron[], nu = Date.now()) {
  const tijden = bronnen.map(bron => tijdstip(bron.datum)).filter(tijd => Number.isFinite(tijd) && tijd <= nu)
  const dagen = [...new Set(tijden.map(tijd => Math.floor(tijd / etmaal)))].sort((a, b) => a - b)
  if (!dagen.length) return null
  const tussenpozen = dagen.slice(1).map((dag, i) => dag - dagen[i]).sort((a, b) => a - b)
  const verstreken = Math.floor(nu / etmaal) - dagen[dagen.length - 1]
  const midden = Math.floor(tussenpozen.length / 2)
  const gebruikelijk = tussenpozen.length >= 3
    ? (tussenpozen[midden] + tussenpozen[Math.floor((tussenpozen.length - 1) / 2)]) / 2
    : null
  return { verstreken, gebruikelijk, langerStil: gebruikelijk !== null && verstreken >= Math.max(7, gebruikelijk * 2) }
}

export function arbeidsbijdrage(opbrengst: number, kosten: number, minuten: number, uurtarief: number) {
  const waarden = [opbrengst, kosten, minuten, uurtarief]
  if (waarden.some(n => !Number.isFinite(n) || n < 0 || n > 100_000_000)) return null
  const arbeidskosten = Math.round(minuten * uurtarief / 60)
  return { arbeidskosten, bijdrage: Math.round(opbrengst - kosten - arbeidskosten) }
}

export function taakUitNotitie(tekst: string, taal: Relatietaal) {
  const zinnen = tekst.trim().split(/(?:[!?;.](?=\s)|\n)+/u).map(zin => zin.trim()).filter(Boolean)
  const actiewoord = /(?:\b(?:bellen|bel|stuur|sturen|maken|bezorgen|plannen|bevestigen|opvolgen|navragen)\b|зателефон|надішл|надісл|підгот|узгод|домови|нагад|перевір)/iu
  const zin = zinnen.find(deel => actiewoord.test(deel)) ?? zinnen[0]
  if (!zin) return null
  const dag = tekst.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|[.,;!?)\]]|$)/u)?.[1]
  const datum = dag && !Number.isNaN(Date.parse(dag)) && new Date(dag).toISOString().slice(0, 10) === dag ? dag : ''
  const titel = zin.length > 160 ? zin.slice(0, 157) + '…' : zin
  return { titel, datum, bron: taal === 'uk' ? 'Витяг із нотатки' : 'Uit de notitie' }
}

export function antwoordopzet(tekst: string, naam: string, taal: Relatietaal, stijl: 'kort' | 'warm') {
  const onderwerp = tekst.trim()
  if (!onderwerp) return ''
  if (taal === 'uk') {
    const aanhef = stijl === 'warm' ? 'Добрий день!' : 'Вітаю!'
    return aanhef + (naam && stijl === 'warm' ? '\n\nДякую за нашу розмову.' : '') +
      '\n\n' + onderwerp + '\n\n' + (stijl === 'warm' ? 'Підкажіть, будь ласка, чи вам підходить такий наступний крок?' : 'Чи погоджуєтеся з наступним кроком?')
  }
  const aanhef = naam ? 'Beste ' + naam + ',' : 'Goedendag,'
  return aanhef + (stijl === 'warm' ? '\n\nDank voor ons gesprek.' : '') +
    '\n\n' + onderwerp + '\n\n' + (stijl === 'warm' ? 'Ik hoor graag of dit voor u een prettige vervolgstap is.' : 'Past deze vervolgstap voor u?')
}

export function oefenvraag(antwoord: string, taal: Relatietaal) {
  const prijs = /prijs|korting|kosten|tarief|цін[аиу]|вартіст|знижк|кошту/iu.test(antwoord)
  const termijn = /termijn|datum|lever|planning|строк|термін|дат[ауи]|постач|вівтор/iu.test(antwoord)
  if (prijs) return taal === 'uk' ? 'Що саме входить у цю ціну й за яких умов вона зміниться?' : 'Wat is bij deze prijs inbegrepen en wanneer verandert hij?'
  if (termijn) return taal === 'uk' ? 'Які строки ви можете підтвердити та що потрібно узгодити заздалегідь?' : 'Welke termijn kunt u toezeggen en wat spreken we vooraf af?'
  return taal === 'uk' ? 'Чим ви можете підтвердити цю пропозицію та який наступний крок пропонуєте?' : 'Hoe kunt u dit voorstel onderbouwen en welke vervolgstap stelt u voor?'
}
