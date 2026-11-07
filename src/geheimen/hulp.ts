// Zuivere hulpfuncties voor «Секрети й ключі» (filteren, sorteren, tijd). Geen React, geen netwerk: eenvoudig te testen.
import { DIENSTEN, GROEP_NAAM, STAAT_NAAM, type Geheim, type GeheimGebeurtenis, type GeheimGroep, type GeheimStaat } from '../../shared/geheimen';

export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const kies = (lang: Lang, t: readonly [string, string]) => (lang === 'uk' ? t[0] : t[1]);

/** Volgorde bij sorteren: wat aandacht nodig heeft staat bovenaan. */
const PRIORITEIT: Record<GeheimStaat, number> = { verlopen: 0, bijna: 1, ontbreekt: 2, ingetrokken: 3, 'nog-niet': 4, ingesteld: 5 };
export const aandacht = (g: Pick<Geheim, 'staat'>) => g.staat === 'verlopen' || g.staat === 'bijna' || g.staat === 'ontbreekt';

export type Filters = { zoek: string; groep: GeheimGroep | 'alle'; staat: 'alle' | 'aandacht' | GeheimStaat; bron: 'alle' | Geheim['bron'] };
export const standaardFilters: Filters = { zoek: '', groep: 'alle', staat: 'alle', bron: 'alle' };

export function filterGeheimen(items: readonly Geheim[], f: Filters, lang: Lang): Geheim[] {
  const q = f.zoek.trim().toLowerCase();
  return items.filter((g) => {
    if (f.groep !== 'alle' && g.groep !== f.groep) return false;
    if (f.bron !== 'alle' && g.bron !== f.bron) return false;
    if (f.staat === 'aandacht' ? !aandacht(g) : f.staat !== 'alle' && g.staat !== f.staat) return false;
    if (!q) return true;
    const hooi = [g.naam, g.doel ?? '', kies(lang, DIENSTEN[g.dienst].naam), kies(lang, GROEP_NAAM[g.groep]), kies(lang, STAAT_NAAM[g.staat]), g.meta?.van ?? '', g.meta?.verantwoordelijke ?? ''].join(' ').toLowerCase();
    return q.split(/\s+/).every((deel) => hooi.includes(deel));
  });
}
export const sorteerGeheimen = (items: readonly Geheim[]) =>
  [...items].sort((a, b) => PRIORITEIT[a.staat] - PRIORITEIT[b.staat] || a.naam.localeCompare(b.naam, 'en', { sensitivity: 'base' }));

export function telStanden(items: readonly Geheim[]) {
  const per: Record<GeheimStaat, number> = { ingesteld: 0, ontbreekt: 0, bijna: 0, verlopen: 0, ingetrokken: 0, 'nog-niet': 0 };
  for (const g of items) per[g.staat]++;
  return { totaal: items.length, ...per, aandacht: per.verlopen + per.bijna + per.ontbreekt };
}

export function groepeer(items: readonly Geheim[]): Array<[GeheimGroep, Geheim[]]> {
  const kaart = new Map<GeheimGroep, Geheim[]>();
  for (const g of items) kaart.set(g.groep, [...(kaart.get(g.groep) ?? []), g]);
  return [...kaart.entries()];
}

/** «5 хв тому» / «5 min geleden». */
export function geleden(at: number, lang: Lang, nu = Date.now()): string {
  const s = Math.max(0, Math.round((nu - at) / 1000));
  const [n, uk, nl] = s < 60 ? [s, 'с', 's'] : s < 3600 ? [Math.round(s / 60), 'хв', 'min'] : s < 86400 ? [Math.round(s / 3600), 'год', 'u'] : [Math.round(s / 86400), 'дн', 'd'];
  if (s < 5) return tr(lang, 'щойно', 'zojuist');
  return lang === 'uk' ? `${n} ${uk} тому` : `${n} ${nl} geleden`;
}
export const datumTijd = (at: number, lang: Lang) => new Date(at).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
export const datum = (at: number, lang: Lang) => new Date(at).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium' });

/** Laatste gebeurtenis per geheimnaam (items staan nieuwste eerst). */
export function laatstePerNaam(gebeurtenissen: readonly GeheimGebeurtenis[]): Map<string, GeheimGebeurtenis> {
  const m = new Map<string, GeheimGebeurtenis>();
  for (const e of gebeurtenissen) if (e.naam && !m.has(e.naam)) m.set(e.naam, e);
  return m;
}

export type JournaalFilter = { zoek: string; actie: 'alle' | GeheimGebeurtenis['actie']; wie: 'alle' | string; van: string; tot: string };
export const standaardJournaal: JournaalFilter = { zoek: '', actie: 'alle', wie: 'alle', van: '', tot: '' };
export function filterJournaal(items: readonly GeheimGebeurtenis[], f: JournaalFilter): GeheimGebeurtenis[] {
  const q = f.zoek.trim().toLowerCase();
  const van = f.van ? Date.parse(`${f.van}T00:00:00`) : 0;
  const tot = f.tot ? Date.parse(`${f.tot}T23:59:59.999`) : Infinity;
  return items.filter((e) => (f.actie === 'alle' || e.actie === f.actie) && (f.wie === 'alle' || e.wie.id === f.wie) && e.at >= van && e.at <= tot
    && (!q || `${e.naam} ${e.wie.naam} ${e.wie.email} ${e.info}`.toLowerCase().includes(q)));
}

/** Initialen voor een avatar zonder foto. */
export const initialen = (naam: string, email: string) => {
  const bron = (naam || email.split('@')[0] || '?').trim();
  const delen = bron.split(/[\s@._-]+/).filter(Boolean);
  return ((delen[0]?.[0] ?? '?') + (delen.length > 1 ? delen[1][0] : '')).toUpperCase();
};

/** Backendfout → leesbare tekst. */
const FOUTEN: Record<string, readonly [string, string]> = {
  OWNER_VAULT_NAME_INVALID: ['Назва має містити 2–80 латинських літер, цифр або символів . _ - (наприклад, github-oauth).', 'Naam: 2–80 tekens, letters, cijfers, . _ -'],
  OWNER_VAULT_NAME_TAKEN: ['Секрет із такою назвою вже існує.', 'Deze naam bestaat al.'],
  OWNER_VAULT_LIMIT_REACHED: ['Досягнуто ліміт ключів у сховищі (40). Видаліть застарілий ключ.', 'Limiet van 40 sleutels bereikt.'],
  OWNER_VAULT_VALUE_EMPTY: ['Вставте ключ або токен у поле значення.', 'Voer een waarde in.'],
  OWNER_VAULT_VALUE_TOO_LARGE: ['Значення завелике (макс. 8 КБ).', 'Waarde te groot (max. 8 KB).'],
  OWNER_VAULT_ENCRYPTION_UNAVAILABLE: ['Шифрування сховища недоступне на сервері (перевірте OWNER_VAULT_ENCRYPTION_KEY_V1).', 'Kluisversleuteling is niet beschikbaar op de server.'],
  OWNER_VAULT_NOT_FOUND: ['Ключ не знайдено (можливо, вже видалений).', 'Sleutel niet gevonden (misschien al verwijderd).'],
  OWNER_VAULT_REVEAL_HOST_FORBIDDEN: ['Показ можливий лише на admin.tarasevych.com або api.tarasevych.com.', 'Tonen kan alleen op admin.tarasevych.com of api.tarasevych.com.'],
  OWNER_VAULT_REVEAL_FORBIDDEN: ['Показувати значення може лише власник.', 'Alleen de eigenaar mag waarden tonen.'],
  OWNER_VAULT_WRITE_FAILED: ['Не вдалося записати зашифрований секрет у базу даних.', 'Kon het versleutelde geheim niet opslaan.'],
  OWNER_VAULT_ENCRYPT_FAILED: ['Не вдалося зашифрувати секрет на сервері.', 'Kon het geheim niet versleutelen op de server.'],
  GITHUB_OAUTH_CLIENT_ID_ONGELDIG: ['Неправильний формат Client ID GitHub: очікується 8–80 латинських літер або цифр (наприклад, Ov23li...).', 'Ongeldig formaat GitHub Client ID (bijv. Ov23li...).'],
  GITHUB_OAUTH_CLIENT_SECRET_ONGELDIG: ['Неправильний формат Client Secret GitHub: очікується щонайменше 20 символів без пробілів.', 'Ongeldig formaat GitHub Client Secret (minimaal 20 tekens zonder spaties).'],
  GITHUB_OAUTH_APP_ONLEESBAAR: ['Не вдалося розпізнати Client ID і Client Secret OAuth-застосунку GitHub.', 'Client ID en Client Secret van de GitHub OAuth-app niet herkend.'],
  GITHUB_APP_ID_ONGELDIG: ['Введіть числовий App ID вашого GitHub App (наприклад, 123456).', 'Voer een numeriek App ID van uw GitHub App in (bijv. 123456).'],
  GITHUB_APP_PEM_ONGELDIG: ['Вставте повний приватний ключ PEM (блок -----BEGIN RSA PRIVATE' + ' KEY----- або -----BEGIN PRIVATE' + ' KEY-----).', 'Plak de volledige PEM-privésleutel (-----BEGIN RSA PRIVATE' + ' KEY----- of -----BEGIN PRIVATE' + ' KEY-----).'],
  GITHUB_APP_SLEUTEL_ONLEESBAAR: ['Ключ GitHub App не розпізнано: перевірте App ID та PEM-блок.', 'GitHub-App-sleutel niet herkend: controleer App ID en PEM-blok.'],
  STEP_UP_STRONG_REQUIRED: ['Підтвердження Passkey або кодом скасовано чи не виконано.', 'Bevestiging met passkey / code is geannuleerd.'],
  STEP_UP_REQUIRED: ['Підтвердження доступу скасовано.', 'Bevestiging geannuleerd.'],
  STAP_OP_VENSTER_FOUT: ['Не вдалося відкрити вікно підтвердження Passkey. Оновіть сторінку й спробуйте ще раз.', 'Het bevestigingsvenster kon niet worden geopend. Vernieuw de pagina.'],
  API_RECHT_VEREIST: ['Доступ до сховища секретів дозволено лише власнику.', 'Alleen de eigenaar heeft toegang tot de geheimenkluis.'],
  OWNER_SESSION_REQUIRED: ['Сесія завершилася. Увійдіть повторно.', 'De sessie is verlopen. Meld u opnieuw aan.'],
  NETWORK_ERROR: ['Немає зв’язку з сервером. Перевірте з’єднання і спробуйте ще раз.', 'Geen verbinding met de server. Probeer het opnieuw.'],
  OWNER_VAULT_META_DATE_INVALID: ['Неправильна дата у додаткових параметрах (очікується РРРР-ММ-ДД).', 'Ongeldige datum.'],
  OWNER_VAULT_META_RANGE_INVALID: ['Кінець терміну дії («Діє до») не може бути раніше за початок («Діє з»).', 'Einddatum ligt vóór de begindatum.'],
  OWNER_VAULT_META_KIND_INVALID: ['Оберіть коректний тип власника у додаткових параметрах.', 'Ongeldig eigenaarstype.'],
};
export function foutTekst(code: string, lang: Lang): string {
  const f = FOUTEN[code];
  return f ? kies(lang, f) : code || tr(lang, 'Невідома помилка.', 'Onbekende fout.');
}

/** Willekeurige sterke waarde (32 bytes, base64url) uit de browser-CSPRNG, voor «Згенерувати» bij toevoegen/vervangen. Verlaat de pagina niet. */
export function genereerGeheim(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bin = '';
  buf.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
