// Client voor de Telegram-routes. Twee vervolgstappen die de server kan vragen:
//   403 STEP_UP_PASSKEY_REQUIRED   → venster «Підтвердіть доступ» met ALLEEN toegangssleutel (Google/TOTP tellen hier niet), daarna één keer opnieuw;
//   403 TELEGRAM_BEVESTIGING_NODIG → de aanroeper toont <Bevestigen> (Telegram-knop of geheime code) en probeert dan opnieuw.
import { api, ApiError } from '../platform/client';
import { bevestigToegang } from '../platform/stap-op';
import { ecosystemTabContext } from '../tab-context';

export type Ctx = { service: string; tabContext: string; sourceOrigin: string };
export const identiteitCtx = (): Ctx => ({ service: 'identity', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

export type Nodig = { actie: string; ontbreekt: string[]; onbeschikbaar: string[]; /** APPARAAT-001: de hele eis (alternatieven), zodat het venster ook «ander apparaat» kan aanbieden */ eis?: string[][] };
export class BevestigingNodig extends Error { constructor(public nodig: Nodig) { super('TELEGRAM_BEVESTIGING_NODIG'); } }

export const foutCode = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'NETWORK_ERROR');
const data = (e: unknown): Record<string, unknown> => (e instanceof ApiError && e.response?.data && typeof e.response.data === 'object' ? e.response.data as Record<string, unknown> : {});

export async function tgPost<T = unknown>(ctx: Ctx, pad: string, body: Record<string, unknown> = {}, opnieuw = false): Promise<T> {
  try {
    return (await api.post(pad, { ...ctx, ...body })).data as T;
  } catch (e) {
    const code = foutCode(e);
    if (code === 'STEP_UP_PASSKEY_REQUIRED' && !opnieuw) {
      const uit = await bevestigToegang({ service: ctx.service, tabContext: ctx.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey'], sterk: true });
      if (uit.ok) return tgPost<T>(ctx, pad, body, true);
      throw new Error('PASSKEY_GEANNULEERD');
    }
    if (code === 'TELEGRAM_BEVESTIGING_NODIG') {
      const d = data(e);
      throw new BevestigingNodig({ actie: String(d.actie || ''), ontbreekt: (d.ontbreekt as string[]) || [], onbeschikbaar: (d.onbeschikbaar as string[]) || [], eis: Array.isArray(d.eis) ? (d.eis as string[][]) : [] });
    }
    throw e;
  }
}

/** Openbaar (aanmeldscherm), zonder sessie. */
export async function openbaarPost<T = unknown>(pad: string, body: Record<string, unknown>): Promise<T> { return (await api.post(pad, body)).data as T; }
export async function openbaarGet<T = unknown>(pad: string): Promise<T> { return (await api.get(pad)).data as T; }

/** Leesbare tekst voor elke foutcode van de server; één taal tegelijk (de taal van de pagina). */
const FOUTEN: Record<string, [string, string]> = {
  VLAG_UIT: ['Вхід через Telegram ще не ввімкнено для вашого облікового запису.', 'Aanmelden met Telegram staat nog niet aan voor uw account.'],
  NIET_GEVONDEN: ['Вхід через Telegram ще не ввімкнено для вашого облікового запису.', 'Aanmelden met Telegram staat nog niet aan voor uw account.'],
  UITGESCHAKELD: ['Адміністратор тимчасово вимкнув вхід через Telegram для всіх.', 'De beheerder heeft aanmelden met Telegram tijdelijk voor iedereen uitgezet.'],
  TELEGRAM_UIT: ['Вхід через Telegram зараз вимкнено.', 'Aanmelden met Telegram staat nu uit.'],
  NIET_TOEGESTAAN: ['Для вашого облікового запису вхід через Telegram не дозволено.', 'Voor uw account is aanmelden met Telegram niet toegestaan.'],
  LIMIET_BEREIKT: ['Досягнуто ліміту прив’язок Telegram. Спершу відв’яжіть одну з наявних.', 'Het maximum aantal Telegram-koppelingen is bereikt. Ontkoppel eerst een bestaande.'],
  RATE_LIMITED: ['Забагато спроб. Зачекайте хвилину — ми не блокуємо вас назавжди.', 'Te veel pogingen. Wacht een minuut — u bent niet blijvend geblokkeerd.'],
  VERLOPEN: ['Час вийшов. Почніть знову — це безпечно.', 'De tijd is om. Begin opnieuw — dat is veilig.'],
  VERZOEK_ONBEKEND: ['Запит не знайдено або він уже завершився. Почніть знову.', 'Verzoek niet gevonden of al afgerond. Begin opnieuw.'],
  AL_GEKOPPELD: ['Цей Telegram уже прив’язано до вашого облікового запису.', 'Deze Telegram is al aan uw account gekoppeld.'],
  AL_GEBRUIKT: ['Цей запит уже використано. Почніть знову.', 'Dit verzoek is al gebruikt. Begin opnieuw.'],
  NOG_NIET_KLAAR: ['Спершу завершіть кроки в Telegram.', 'Rond eerst de stappen in Telegram af.'],
  KOPPELING_ONBEKEND: ['Прив’язку не знайдено.', 'Koppeling niet gevonden.'],
  LAATSTE_METHODE: ['Це ваш останній спосіб входу — спершу додайте інший.', 'Dit is uw laatste aanmeldmethode — voeg eerst een andere toe.'],
  PASSKEY_GEANNULEERD: ['Підтвердження ключем доступу скасовано — нічого не змінено.', 'Bevestiging met toegangssleutel geannuleerd — er is niets gewijzigd.'],
  TE_SNEL: ['Зачекайте, доки закінчиться відлік, і прочитайте пояснення.', 'Wacht tot het aftellen klaar is en lees de uitleg.'],
  NIET_BEGREPEN: ['Позначте, що ви розумієте наслідки.', 'Vink aan dat u de gevolgen begrijpt.'],
  CODE_ZWAK: ['Код надто простий.', 'De code is te eenvoudig.'],
  KEUZE_TE_ZWAK: ['Цей вибір слабший за мінімум, який задав адміністратор.', 'Deze keuze is zwakker dan het minimum van de beheerder.'],
  METHODE_NIET_INGESTELD: ['Спершу налаштуйте потрібний спосіб — інакше ви не зможете виконати цю дію.', 'Stel eerst de nodige methode in — anders kunt u deze handeling niet uitvoeren.'],
  METHODE_ONBESCHIKBAAR: ['Потрібний спосіб підтвердження зараз не працює. Скористайтеся іншим дозволеним способом.', 'De nodige bevestigingsmethode werkt nu niet. Gebruik een andere toegestane manier.'],
  TELEGRAM_NIET_BEREIKBAAR: ['Не вдалося надіслати запит у Telegram. Перевірте, що бот не заблоковано, або підтвердьте іншим способом.', 'Het verzoek kon niet naar Telegram. Controleer dat de bot niet geblokkeerd is, of bevestig op een andere manier.'],
  METHODE_STORING_LANG: ['Telegram не відповідає вже понад 10 хвилин. Увійдіть іншим способом — ми повідомимо, щойно запрацює.', 'Telegram antwoordt al meer dan 10 minuten niet. Meld u op een andere manier aan — we laten het weten zodra het werkt.'],
  METHODE_STORING_VAST: ['Вхід через Telegram зараз не працює, і повторна спроба не допоможе. Скористайтеся Google або ключем доступу.', 'Aanmelden met Telegram werkt nu niet en opnieuw proberen helpt niet. Gebruik Google of uw toegangssleutel.'],
  AANMELDEN_MISLUKT: ['Не вдалося завершити вхід. Спробуйте інший спосіб.', 'De aanmelding kon niet worden afgerond. Probeer een andere manier.'],
  LOGIN_BINDING_MISMATCH: ['Вхід почато в іншому браузері чи вкладці. Почніть знову тут.', 'De aanmelding begon in een andere browser of tab. Begin hier opnieuw.'],
  GEEN_EIGEN_KOPPELING: ['Спершу прив’яжіть власний Telegram у «Способах входу».', 'Koppel eerst uw eigen Telegram bij «Aanmeldmethoden».'],
  BEHEERDER_NODIG: ['Потрібні права адміністратора.', 'Beheerdersrechten vereist.'],
  NETWORK_ERROR: ['Немає з’єднання із сервером. Перевірте інтернет — спроба повториться сама.', 'Geen verbinding met de server. Controleer uw internet — er wordt vanzelf opnieuw geprobeerd.'],
};
export const foutTekst = (lang: 'uk' | 'nl', e: unknown): string => {
  const c = foutCode(e);
  const f = FOUTEN[c];
  return f ? f[lang === 'nl' ? 1 : 0] : lang === 'nl' ? `Er ging iets mis (${c}). Er is niets half gewijzigd.` : `Щось пішло не так (${c}). Нічого не змінено наполовину.`;
};
