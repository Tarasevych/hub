// Foutcodes van ICS/CalDAV in gewone woorden (verplaatst uit Agenda.tsx, ongewijzigd; gedeeld met Agenda v3).
import { foutTekst } from './AgendaVenster';
type Lang = 'uk' | 'nl';
/** Foutcodes van de abonnementen in gewone woorden. Onbekende codes worden niet verzonnen maar letterlijk getoond. */
export const ABONNEMENT_FOUT: Record<string, [string, string]> = {
  // Sleutelkluis (0092): de gegevenssleutel van de mens is dicht — geen fout van de koppeling, synchronisatie volgt na ontgrendelen.
  SLEUTELKLUIS_GESLOTEN: ['Ключ даних закритий: синхронізація продовжиться після входу або розблокування.', 'Gegevenssleutel gesloten: synchronisatie gaat verder na aanmelden of ontgrendelen.'],
  ICS_ADRES_LEEG: ['Введіть адресу .ics.', 'Vul een .ics-adres in.'],
  ICS_ADRES_ONGELDIG: ['Адреса не схожа на посилання.', 'Het adres lijkt geen link.'],
  ICS_SCHEMA_NIET_TOEGESTAAN: ['Дозволено лише https (webcal:// перетворюється на https автоматично).', 'Alleen https is toegestaan (webcal:// wordt automatisch https).'],
  ICS_ADRES_MET_WACHTWOORD: ['Адреса з логіном і паролем не приймається: це був би секрет в URL.', 'Een adres met inlognaam en wachtwoord wordt niet aangenomen: dat zou een geheim in een URL zijn.'],
  ICS_BESTAND_TE_GROOT: ['Файл календаря завеликий.', 'Het agendabestand is te groot.'],
  ICS_TIJD_OVERSCHREDEN: ['Сервіс не відповів у відведений час.', 'De dienst antwoordde niet binnen de tijd.'],
  ICS_ADRES_GEWEIGERD: ['Адреса вказує на внутрішню мережу — відмовлено.', 'Het adres wijst naar een intern netwerk — geweigerd.'],
  ICS_OMLEIDING_NIET_GEVOLGD: ['Сервіс переспрямовує; ми свідомо не йдемо за переспрямуваннями. Візьміть кінцеве посилання.', 'De dienst leidt om; omleidingen volgen wij bewust niet. Gebruik het uiteindelijke adres.'],
  ICS_GEEN_TOEGANG: ['Немає доступу до цього посилання.', 'Geen toegang tot deze link.'],
  ICS_NIET_GEVONDEN: ['Посилання не знайдено (404).', 'De link is niet gevonden (404).'],
  ICS_GEEN_AGENDA: ['За посиланням немає календаря .ics.', 'Op die link staat geen .ics-agenda.'],
  ICS_TE_VEEL_ABONNEMENTEN: ['Досягнуто межі кількості підписок.', 'De grens voor het aantal abonnementen is bereikt.'],
  CALDAV_ADRES_LEEG: ['Введіть адресу CalDAV.', 'Vul een CalDAV-adres in.'],
  CALDAV_SCHEMA_NIET_TOEGESTAAN: ['Дозволено лише https.', 'Alleen https is toegestaan.'],
  CALDAV_AANMELDGEGEVENS_VEREIST: ['Потрібні користувач і пароль застосунку.', 'Gebruiker en app-wachtwoord zijn nodig.'],
  CALDAV_AANMELDEN_GEWEIGERD: ['Сервер відмовив у вході: перевірте пароль застосунку.', 'De server weigerde het aanmelden: controleer het app-wachtwoord.'],
  CALDAV_GEEN_TOEGANG: ['Сервер відмовив у доступі.', 'De server weigerde de toegang.'],
  CALDAV_GEEN_AGENDAS: ['Календарів не знайдено за цією адресою.', 'Op dat adres zijn geen agenda’s gevonden.'],
  CALDAV_OMLEIDING_NIET_GEVOLGD: ['Сервер переспрямовує (так робить iCloud); цього наш клієнт свідомо не робить.', 'De server leidt om (zo doet iCloud dat); dat doet onze cliënt bewust niet.'],
  CALDAV_SLEUTEL_ONTBREEKT: ['На сервері немає ключа для шифрування пароля (AGENDA_ABONNEMENT_SLEUTEL_V1).', 'Op de server ontbreekt de sleutel om het wachtwoord te versleutelen (AGENDA_ABONNEMENT_SLEUTEL_V1).'],
  CALDAV_TIJD_OVERSCHREDEN: ['Сервер не відповів у відведений час.', 'De server antwoordde niet binnen de tijd.'],
  CALDAV_ADRES_GEWEIGERD: ['Адреса вказує на внутрішню мережу — відмовлено.', 'Het adres wijst naar een intern netwerk — geweigerd.'],
  // SEC-002 (g08): nieuwe codes van de server — zonder tekst toonde de pagina «Не вдалося (CODE)».
  CALDAV_AFGEKAPT: ['Календар завеликий: збережено не всі події (не більше 2000 на календар і 10 000 на обліковий запис). Приховайте або вилучіть зайві календарі, щоб бачити решту.', 'De agenda is te groot: niet alle afspraken zijn bewaard (hoogstens 2000 per agenda en 10 000 per account). Verberg of verwijder overbodige agenda’s om de rest te zien.'],
  AGENDA_TE_VAAK: ['Забагато оновлень календаря поспіль. Нічого не змінено — спробуйте ще раз за кілька хвилин.', 'Te veel agenda-verversingen na elkaar. Er is niets gewijzigd — probeer het over enkele minuten opnieuw.'],
  RATE_LIMITED: ['Забагато оновлень календаря поспіль. Нічого не змінено — спробуйте ще раз за кілька хвилин.', 'Te veel agenda-verversingen na elkaar. Er is niets gewijzigd — probeer het over enkele minuten opnieuw.'],
  CALDAV_AL_BEZIG: ['Цей обліковий запис саме оновлюється. Зачекайте хвилину й оновіть сторінку.', 'Dit account wordt nu al ververst. Wacht een minuut en ververs de pagina.'],
  CALDAV_AANBIEDER_FOUT: ['Сервер календаря відповів помилкою. Перевірте адресу або спробуйте пізніше; якщо так і лишиться — зверніться до постачальника календаря.', 'De agendaserver antwoordde met een fout. Controleer het adres of probeer het later; blijft het zo, neem dan contact op met de aanbieder van de agenda.'],
  ICS_AANBIEDER_FOUT: ['Сервер календаря відповів помилкою. Перевірте посилання .ics або спробуйте пізніше.', 'De agendaserver antwoordde met een fout. Controleer de .ics-link of probeer het later.'],
};
/**
 * Code uit een mislukte aanroep: eerst het eigen veld `fout` van de agenda-API (bv. 429 → error RATE_LIMITED, fout AGENDA_TE_VAAK),
 * dan de foutcode zelf. Zo ziet de mens de agendatekst in plaats van een algemene.
 */
export function agendaFoutCode(e: unknown, standaard = 'FOUT'): string {
  const data = (e as { response?: { data?: unknown } } | null)?.response?.data as { fout?: unknown } | undefined;
  if (data && typeof data === 'object' && typeof data.fout === 'string' && data.fout) return data.fout;
  const m = String((e as Error | null)?.message || '');
  return m || standaard;
}
export function foutCodeTekst(code: string, lang: Lang): string {
  const paar = ABONNEMENT_FOUT[code];
  return paar ? (lang === 'uk' ? paar[0] : paar[1]) : foutTekst(code, lang);
}
