// LEZER-FOUT-BLIJFT-OPEN v1 (vlag `lezer-fout-blijft-open-v1`, migratie 0307, standaard UIT).
// Vroeger: kon een brief niet geladen worden, dan zette openMessageById (src/GoogleMailWerkruimte.tsx) het leesvenster op null;
// LeesVenster verdween, zijn opruiming deed history.back() en de mens zag alleen een flits van «Підвантажуємо вміст листа…».
// Nu, met de vlag aan: het venster blijft open en toont hier de reden (soort fout naar HTTP-status, in het Oekraïens of Nederlands)
// met de knop «Спробувати ще раз». Geen history.back(): het venster wordt niet ontkoppeld.
// Укр.: якщо лист не відкрився, вікно лишається відкритим, показує причину й кнопку «Спробувати ще раз».
import { AlertTriangle, RotateCw } from 'lucide-react';
import './lezer-fout.css';

export const LEZER_FOUT_VLAG = 'lezer-fout-blijft-open-v1';
// MAQUETTE-ZWEVEND-RAIL-VERBERGEN v1 (migratie 0307, standaard UIT): de ankerrail van «Макет» niet tonen bij een zwevend leesvenster.
export const MAQUETTE_ZWEVEND_RAIL_VLAG = 'maquette-zwevend-rail-verbergen-v1';

export type LezerFoutSoort = 'netwerk' | 'sessie' | 'toegang' | 'niet-gevonden' | 'postbus' | 'te-veel' | 'tijd' | 'server' | 'onbekend';
export type LezerFout = { berichtId: string; accountId: string; draad: string; status: number; code: string; soort: LezerFoutSoort };

/** Status en veilige code uit een fout van api.post (ApiError) of een netwerkfout; nooit tekst van buiten tonen. */
export function lezerFoutUit(fout: unknown): { status: number; code: string; soort: LezerFoutSoort } {
  const f = (fout && typeof fout === 'object' ? fout : {}) as { status?: unknown; message?: unknown; response?: { data?: { error?: unknown } } };
  const status = Number.isFinite(Number(f.status)) ? Math.max(0, Math.trunc(Number(f.status))) : 0;
  const ruw = String(f.response?.data?.error ?? f.message ?? '');
  const code = /^[A-Z][A-Z0-9_]{2,80}$/.test(ruw) ? ruw : '';
  return { status, code, soort: soortVan(status, code) };
}

export function soortVan(status: number, code = ''): LezerFoutSoort {
  if (code === 'MAIL_BRIEF_TIJD_OM' || status === 504 || status === 408) return 'tijd';
  if (code === 'MAIL_BRIEF_TE_VEEL_VERZOEKEN' || status === 429) return 'te-veel';
  if (code === 'MAIL_BRIEF_POSTBUS_NIET_GEKOPPELD' || code === 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED' || status === 409) return 'postbus';
  if (status === 401) return 'sessie';
  if (status === 403) return 'toegang';
  if (status === 404 || status === 410) return 'niet-gevonden';
  if (status >= 500) return 'server';
  if (status === 0) return 'netwerk';
  return 'onbekend';
}

/** Vaste tekst per soort: [Oekraïens, Nederlands]. */
export const LEZER_FOUT_TEKST: Record<LezerFoutSoort, [string, string]> = {
  netwerk: ['Немає зв’язку із сервером. Перевірте інтернет.', 'Geen verbinding met de server. Controleer het internet.'],
  sessie: ['Ваш сеанс входу завершився. Увійдіть знову.', 'Uw aanmeldsessie is verlopen. Meld u opnieuw aan.'],
  toegang: ['Google не дав доступу до листа. Можливо, треба знову під’єднати пошту.', 'Google gaf geen toegang tot het bericht. Mogelijk moet de mailbox opnieuw gekoppeld worden.'],
  'niet-gevonden': ['Лист не знайдено: можливо, його вже видалено.', 'Bericht niet gevonden: misschien is het al verwijderd.'],
  postbus: ['Ця поштова скринька зараз не під’єднана.', 'Deze mailbox is nu niet gekoppeld.'],
  'te-veel': ['Забагато запитів до Google. Спробуйте за хвилину.', 'Te veel verzoeken aan Google. Probeer het over een minuut.'],
  tijd: ['Google відповідав надто довго.', 'Google antwoordde te traag.'],
  server: ['Помилка на боці сервера пошти.', 'Fout aan de kant van de mailserver.'],
  onbekend: ['Лист не вдалося завантажити.', 'Het bericht kon niet worden geladen.'],
};

/** Soort fout naar HTTP-statusklasse, kort: «HTTP 504 · сервер». */
export function statusKlasse(status: number, lang: 'uk' | 'nl'): string {
  const uk = lang !== 'nl';
  if (!status) return uk ? 'без відповіді' : 'geen antwoord';
  const k = status >= 500 ? (uk ? 'помилка сервера' : 'serverfout') : status >= 400 ? (uk ? 'відмова запиту' : 'verzoek geweigerd') : (uk ? 'інша відповідь' : 'ander antwoord');
  return `HTTP ${status} · ${k}`;
}

export function LezerFoutPaneel({ lang, fout, onOpnieuw }: { lang: 'uk' | 'nl'; fout: LezerFout; onOpnieuw: () => void }) {
  const uk = lang !== 'nl';
  const [tekstUk, tekstNl] = LEZER_FOUT_TEKST[fout.soort];
  return (
    <section className='mail-reader-content-loading mail-lezer-fout' role='alert' data-soort={fout.soort} data-status={fout.status || 0}>
      <AlertTriangle aria-hidden='true' className='mail-lezer-fout-teken' />
      <strong>{uk ? 'Лист не відкрився' : 'Het bericht is niet geopend'}</strong>
      <span>{uk ? tekstUk : tekstNl}</span>
      <small className='mail-lezer-fout-code'>{statusKlasse(fout.status, lang)}{fout.code ? ` · ${fout.code}` : ''}</small>
      <button type='button' className='mail-lezer-fout-knop' onClick={onOpnieuw}>
        <RotateCw aria-hidden='true' />
        {uk ? 'Спробувати ще раз' : 'Opnieuw proberen'}
      </button>
    </section>
  );
}
