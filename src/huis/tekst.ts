// Teksten en hulpjes van de huis-pagina (uk/nl).
import { useEffect, useState } from 'react';
import { VERSHEID_LABEL, versheid, type Apparaat, type Toestand } from '../../shared/huis-model';

export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const locale = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-NL');
export function foutTekst(lang: Lang, code: string): string {
  const t: Record<string, [string, string]> = {
    HUIS_MIGRATIE_ONTBREEKT: ['На сервері ще не застосовано міграцію 0128.', 'Op de server is migratie 0128 nog niet uitgevoerd.'],
    GEEN_TOEGANG: ['Немає доступу до цієї оселі.', 'Geen toegang tot deze woning.'], ALLEEN_EIGENAAR: ['Це може лише власник оселі.', 'Alleen de eigenaar van de woning kan dit.'],
    ROL_ALLEEN_LEZEN: ['Ваша роль дозволяє лише переглядати.', 'Uw rol mag alleen kijken.'], STEP_UP_VEREIST: ['Критична дія: потрібне підтвердження входу.', 'Kritieke actie: bevestiging van de aanmelding nodig.'], STEP_UP_REQUIRED: ['Потрібне підтвердження входу.', 'Bevestiging van de aanmelding nodig.'],
    KRITIEK_ALLEEN_MENS: ['Замки, охорону й сирени вмикає лише людина, не сцена чи ШІ.', 'Sloten, alarm en sirenes bedient alleen een mens, geen scène of AI.'], SCHRIJVEN_NIET_TOEGESTAAN: ['Для цієї інтеграції ще не ввімкнено дозвіл на запис (Інтеграції → Дозволити команди).', 'Deze integratie heeft nog geen schrijftoestemming (Integraties → Opdrachten toestaan).'],
    GEEN_INTEGRATIE: ['Пристрій не має підключеного джерела.', 'Het apparaat heeft geen gekoppelde bron.'], MOGELIJKHEID_NIET_SCHRIJFBAAR: ['Це лише датчик — ним не керують.', 'Dit is alleen een sensor — niet te bedienen.'],
    WAARDE_BUITEN_BEREIK: ['Значення поза межами.', 'Waarde buiten het bereik.'], IDEMPOTENTIE_ONGELDIG: ['Внутрішня помилка ключа.', 'Interne sleutelfout.'],
    TOKEN_GEWEIGERD: ['Home Assistant відхилив токен.', 'Home Assistant weigerde het token.'], GEEN_ANTWOORD: ['Немає відповіді від адреси (мережа, VPN, вимкнено?).', 'Geen antwoord van het adres (netwerk, VPN, uit?).'], ADRES_ONGELDIG: ['Адреса має бути http(s)://хост[:порт] без параметрів.', 'Adres moet http(s)://host[:poort] zijn, zonder parameters.'], ADRES_GEWEIGERD: ['Локальні адреси сервера (localhost/127.x) не дозволені.', 'Loopback-adressen van de server (localhost/127.x) zijn niet toegestaan.'],
    ANTWOORD_ONGELDIG: ['Відповідь не схожа на Home Assistant.', 'Het antwoord lijkt niet op Home Assistant.'], TOKEN_ONGELDIG: ['Вставте довгостроковий токен доступу (без пробілів).', 'Plak een langlevend toegangstoken (zonder spaties).'], SLEUTEL_ONTBREEKT: ['На сервері немає ключа шифрування для токена.', 'De server mist de versleutelsleutel voor het token.'],
    NOG_NIET_UITVOERBAAR: ['У цьому випуску сайт ще не виконує правила — лише чернетка й симуляція.', 'In deze release voert de site regels nog niet uit — alleen concept en simulatie.'], NAAM_ONGELDIG: ['Потрібна назва (до 80 символів).', 'Een naam is nodig (hoogstens 80 tekens).'], GEBRUIKER_ONBEKEND: ['Такого підтвердженого користувача немає.', 'Zo’n goedgekeurde gebruiker is er niet.'],
    STAP_KRITIEK_NIET_TOEGESTAAN: ['Критичні пристрої не можна додавати до сцен.', 'Kritieke apparaten horen niet in een scène.'], DAN_KRITIEK_NIET_TOEGESTAAN: ['Критичні пристрої не можна вмикати автоматизацією.', 'Kritieke apparaten mogen niet door een automatisering bediend worden.'],
    WANNEER_VEREIST: ['Додайте хоча б одну умову «Коли».', 'Voeg minstens één «Wanneer» toe.'], DAN_VEREIST: ['Додайте хоча б одну дію «Тоді».', 'Voeg minstens één «Dan» toe.'],
    SERVER: ['Сервер тимчасово не впорався із запитом.', 'De server kon het verzoek even niet afhandelen.'], NETWERK: ['Немає зв’язку із сервером. Перевірте інтернет.', 'Geen verbinding met de server. Controleer het internet.'],
    HUIS_SERVER_FOUT: ['Сервер тимчасово не впорався із запитом.', 'De server kon het verzoek even niet afhandelen.'],
    HUIS_SERVICE_REQUIRED: ['Доступно лише після входу.', 'Alleen na aanmelden.'], ACCOUNT_NOT_APPROVED: ['Обліковий запис ще не підтверджено.', 'Het account is nog niet goedgekeurd.'],
  };
  const p = t[code]; if (p) return tr(lang, p[0], p[1]);
  if (/SESSION|401|403/.test(code)) return tr(lang, 'Доступно лише після входу.', 'Alleen na aanmelden.');
  // UI-005: nooit een ruwe servertekst («Internal server error», HTTP_500…) tonen; alleen bekende codes hierboven of een rustige zin.
  if (!/^[A-Z][A-Z0-9_]{2,40}$/.test(code) || /^HTTP_5/.test(code)) return tr(lang, 'Не вдалося. Спробуйте ще раз трохи згодом.', 'Mislukt. Probeer het straks opnieuw.');
  return tr(lang, `Не вдалося (${code}).`, `Mislukt (${code}).`);
}
/** 5xx of geen antwoord: een storing van de server, geen «geen woning». */
export const serverFout = (status: number) => status >= 500;
export function datumTekst(lang: Lang, iso: string | null, metTijd = true): string {
  if (!iso) return tr(lang, 'невідомо', 'onbekend');
  const ms = Date.parse(iso); if (Number.isNaN(ms)) return tr(lang, 'невідомо', 'onbekend');
  const d = new Date(ms); const nu = new Date();
  const zelfde = d.toDateString() === nu.toDateString();
  return (zelfde ? '' : d.toLocaleDateString(locale(lang), { day: '2-digit', month: 'short' }) + ' ') + (metTijd ? d.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' }) : '');
}
export function geledenTekst(lang: Lang, iso: string | null): string {
  if (!iso) return tr(lang, 'невідомо', 'onbekend');
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return tr(lang, `${s} с тому`, `${s} s geleden`);
  if (s < 3600) return tr(lang, `${Math.round(s / 60)} хв тому`, `${Math.round(s / 60)} min geleden`);
  if (s < 86400) return tr(lang, `${Math.round(s / 3600)} год тому`, `${Math.round(s / 3600)} u geleden`);
  return datumTekst(lang, iso);
}
export const toestandVan = (a: Pick<Apparaat, 'toestanden'>, kenmerk: string): Toestand | undefined => a.toestanden.find((t) => t.kenmerk === kenmerk);
/** Eén regel over een apparaat: de hoofdwaarde met eenheid + versheid. Nooit een waarde zonder meting. */
export function hoofdTekst(lang: Lang, a: Apparaat): { tekst: string; vers: ReturnType<typeof versheid> } {
  const v = (k: string) => toestandVan(a, k);
  const kies = v('aan') ?? v('temperatuur') ?? v('open') ?? v('vergrendeld') ?? v('alarm') ?? v('contact') ?? v('beweging') ?? v('water') ?? v('rook') ?? v('gas') ?? v('aanwezigheid') ?? v('energie') ?? v('vermogen') ?? v('vochtigheid') ?? v('meting') ?? a.toestanden[0];
  const vers = versheid(kies);
  if (!kies || vers === 'onbekend' || vers === 'onbeschikbaar' || kies.waarde === null || kies.waarde === undefined) return { tekst: tr(lang, VERSHEID_LABEL[vers][0], VERSHEID_LABEL[vers][1]), vers };
  const w = kies.waarde;
  const t = typeof w === 'boolean'
    ? ({ aan: [w ? 'увімкнено' : 'вимкнено', w ? 'aan' : 'uit'], open: [w ? 'відкрито' : 'закрито', w ? 'open' : 'dicht'], vergrendeld: [w ? 'замкнено' : 'відімкнено', w ? 'vergrendeld' : 'ontgrendeld'], contact: [w ? 'відкрито' : 'закрито', w ? 'open' : 'dicht'], beweging: [w ? 'рух' : 'тихо', w ? 'beweging' : 'rustig'], water: [w ? 'ВОДА!' : 'сухо', w ? 'WATER!' : 'droog'], rook: [w ? 'ДИМ!' : 'чисто', w ? 'ROOK!' : 'schoon'], gas: [w ? 'ГАЗ!' : 'чисто', w ? 'GAS!' : 'schoon'], aanwezigheid: [w ? 'вдома' : 'не вдома', w ? 'thuis' : 'niet thuis'] } as Record<string, [string, string]>)[kies.kenmerk] ?? [String(w), String(w)]
    : [`${w}${kies.eenheid ? ' ' + kies.eenheid : ''}`, `${w}${kies.eenheid ? ' ' + kies.eenheid : ''}`];
  return { tekst: tr(lang, t[0], t[1]), vers };
}
export function useSmal(px = 760): boolean {
  const [smal, setSmal] = useState(() => (typeof matchMedia === 'function' ? matchMedia(`(max-width:${px}px)`).matches : false));
  useEffect(() => { if (typeof matchMedia !== 'function') return; const mq = matchMedia(`(max-width:${px}px)`); const f = () => setSmal(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [px]);
  return smal;
}
export const SOORT_TEKST: Record<string, [string, string]> = { light: ['Світло', 'Licht'], switch: ['Вимикач', 'Schakelaar'], input_boolean: ['Перемикач', 'Schakelaar'], fan: ['Вентилятор', 'Ventilator'], sensor: ['Датчик', 'Sensor'], binary_sensor: ['Датчик', 'Sensor'], climate: ['Клімат', 'Klimaat'], cover: ['Штори/ролети', 'Rolluik'], lock: ['Замок', 'Slot'], alarm_control_panel: ['Охорона', 'Alarm'], person: ['Присутність', 'Aanwezigheid'], device_tracker: ['Присутність', 'Aanwezigheid'], siren: ['Сирена', 'Sirene'] };
export const soortTekst = (lang: Lang, soort: string) => { const p = SOORT_TEKST[soort]; return p ? tr(lang, p[0], p[1]) : soort; };
