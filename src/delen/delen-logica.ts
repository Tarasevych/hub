// IDENTITEIT-014 (фаза 3, крок «delen»): чиста логіка спільного доступу для hub-модалки й центру налаштувань.
// Zuivere logica voor delen (hub-venster én instellingencentrum): staat van een lid, welke rollen deze gebruiker mag kiezen,
// de tekst van het bevestigingsvenster «Надати доступ», en of een weigering bij aansluiten definitief is.
// Без DOM, без fetch: права лише з shared/werkruimte-rechten.ts (та сама таблиця, що на сервері) — власних перевірок ролей тут немає.
import { ROL_TEKST, magDelen, magRolBeheren, werkruimteRol, type WerkruimteRol } from '../../shared/werkruimte-rechten';

type Lang = 'uk' | 'nl';
export type Paar = readonly [string, string];
const kies = (lang: Lang, p: Paar) => (lang === 'uk' ? p[0] : p[1]);

/** Een lid zoals /api/share/members het geeft (e-mail kan voor een kijker gemaskeerd zijn). */
export type Lid = { id: string; email: string; userId?: string; permission: string; workspaceRole?: string; status: string; expired?: boolean };
export type LidStaat = 'actief' | 'uitgenodigd' | 'verlopen';

/** Стан учасника: активний; запрошений, але ще не прийняв; запрошення прострочене (сервер позначає expired). */
export function lidStaat(lid: Pick<Lid, 'status' | 'expired'>): LidStaat {
  if (lid.status === 'active') return 'actief';
  return lid.expired ? 'verlopen' : 'uitgenodigd';
}
export const STAAT_TEKST: Readonly<Record<LidStaat, Paar>> = Object.freeze({
  actief: ['Активний', 'Actief'],
  uitgenodigd: ['Запрошено — ще не прийнято', 'Uitgenodigd — nog niet aanvaard'],
  verlopen: ['Запрошення прострочене', 'Uitnodiging verlopen'],
});
/** Підказка біля стану: що це означає для людини і що можна зробити. */
export const STAAT_UITLEG: Readonly<Record<LidStaat, Paar>> = Object.freeze({
  actief: ['Бачить простір із цією роллю.', 'Ziet de werkruimte met deze rol.'],
  uitgenodigd: ['Доступ з’явиться, щойно людина увійде з цією адресою (протягом 7 днів).', 'De toegang begint zodra deze persoon zich met dit adres aanmeldt (binnen 7 dagen).'],
  verlopen: ['Запрошення вже не діє — доступу немає. Надішліть його ще раз.', 'De uitnodiging werkt niet meer — er is geen toegang. Stuur ze opnieuw.'],
});
export const staatTekst = (lang: Lang, lid: Pick<Lid, 'status' | 'expired'>) => kies(lang, STAAT_TEKST[lidStaat(lid)]);

/** Rol van een lid in de ruimte (zelfde regel als de server: editor zonder rol → member). */
export const rolVanLid = (lid: Pick<Lid, 'permission' | 'workspaceRole'>): WerkruimteRol => werkruimteRol(lid) || 'viewer';
export const rolNaam = (lang: Lang, rol: WerkruimteRol) => kies(lang, ROL_TEKST[rol]);

/** Rollen in het formulier «Надати доступ» (bij de server: editor = member). */
export type KeuzeRol = 'viewer' | 'editor' | 'admin';
export const keuzeNaarRol = (k: KeuzeRol): WerkruimteRol => (k === 'editor' ? 'member' : k);
export const rolNaarKeuze = (r: WerkruimteRol): KeuzeRol => (r === 'admin' ? 'admin' : r === 'viewer' ? 'viewer' : 'editor');
/** Welke niveaus deze gebruiker in deze ruimte mag geven. «Адміністратор» alleen als magRolBeheren(rol,'admin'). */
export function rolKeuzes(rol: WerkruimteRol | null | undefined): KeuzeRol[] {
  if (!magDelen(rol)) return [];
  return (['viewer', 'editor', 'admin'] as const).filter((k) => magRolBeheren(rol, keuzeNaarRol(k)));
}
/** Een gekozen niveau dat in een andere ruimte niet mag, valt terug op «Перегляд». */
export const geldigeKeuze = (rol: WerkruimteRol | null | undefined, k: KeuzeRol): KeuzeRol => (rolKeuzes(rol).includes(k) ? k : 'viewer');

/** Waarom de knoppen uit staan (of null als deze gebruiker hier mag delen). */
export function waaromNiet(lang: Lang, rol: WerkruimteRol | null | undefined): string | null {
  if (magDelen(rol)) return null;
  if (!rol) return kies(lang, ['Немає простору, яким ви можете ділитися. Ділитися може власник простору або той, кого він зробив адміністратором.', 'Er is geen werkruimte die u kunt delen. Delen kan de eigenaar van de werkruimte of iemand die hij beheerder maakte.']);
  return kies(lang, [`У цьому просторі ваша роль — «${ROL_TEKST[rol][0]}». Надавати доступ, змінювати ролі й створювати посилання можуть лише власник або адміністратор ЦЬОГО простору. Попросіть їх.`, `In deze werkruimte is uw rol «${ROL_TEKST[rol][1]}». Toegang geven, rollen wijzigen en links maken kan alleen de eigenaar of een beheerder van DEZE werkruimte. Vraag het hun.`]);
}

/** Tekst van het venster «Надати доступ?» (id deel-toegang-geven): adres, ruimte, rol; «beheerder» is gevaarlijk. */
export function toegangGevenVraag(lang: Lang, v: { email: string; ruimte: string; keuze: KeuzeRol }) {
  const rol = keuzeNaarRol(v.keuze);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const gevolgen: string[] = [
    t('Якщо в людини ще немає облікового запису, запрошення діє 7 днів; доступ з’явиться після входу з цією адресою.', 'Heeft deze persoon nog geen account, dan is de uitnodiging 7 dagen geldig; de toegang begint na aanmelden met dit adres.'),
    t('Людина отримає сповіщення, а дію буде записано в журнал.', 'Deze persoon krijgt een melding en de handeling komt in het logboek.'),
    t('Доступ можна будь-коли відкликати в розділі «Хто має доступ».', 'De toegang kan altijd worden ingetrokken onder «Wie heeft toegang».'),
  ];
  if (rol === 'viewer') gevolgen.unshift(t('Лише перегляд: змінювати нічого не зможе.', 'Alleen bekijken: kan niets wijzigen.'));
  if (rol === 'member') gevolgen.unshift(t('Зможе додавати й змінювати блоки в цьому просторі.', 'Kan blokken in deze werkruimte toevoegen en wijzigen.'));
  if (rol === 'admin') gevolgen.unshift(
    t('Зможе запрошувати інших, змінювати їхні ролі (зокрема робити адміністраторами) і відкликати доступ — так само, як ви.', 'Kan anderen uitnodigen, hun rol wijzigen (ook tot beheerder) en toegang intrekken — net als u.'),
    t('Перед збереженням сайт попросить підтвердити, що це ви (passkey, код або повторний вхід).', 'Vóór het opslaan vraagt de site te bevestigen dat u het bent (passkey, code of opnieuw aanmelden).'),
  );
  return {
    titel: t('Надати доступ?', 'Toegang geven?'),
    uitleg: t(`${v.email} отримає доступ до «${v.ruimte}» з роллю «${ROL_TEKST[rol][0]}».`, `${v.email} krijgt toegang tot «${v.ruimte}» als «${ROL_TEKST[rol][1]}».`),
    gevolgen,
    gevaarlijk: rol === 'admin',
    bevestigTekst: rol === 'admin' ? t('Так, зробити адміністратором', 'Ja, beheerder maken') : t('Надати доступ', 'Toegang geven'),
  };
}

/** Tekst van het venster bij het wijzigen van een rol naar «beheerder» (id deel-rol-beheerder). */
export function beheerderMakenVraag(lang: Lang, email: string) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  return {
    titel: t('Зробити адміністратором?', 'Beheerder maken?'),
    uitleg: t(`${email} стане адміністратором цього простору.`, `${email} wordt beheerder van deze werkruimte.`),
    gevolgen: [
      t('Зможе запрошувати інших, змінювати їхні ролі й відкликати доступ.', 'Kan anderen uitnodigen, hun rol wijzigen en toegang intrekken.'),
      t('Сайт попросить підтвердити, що це ви. Людина отримає сповіщення.', 'De site vraagt te bevestigen dat u het bent. Deze persoon krijgt een melding.'),
    ],
    bevestigTekst: t('Так, зробити адміністратором', 'Ja, beheerder maken'),
  };
}

const codeVan = (e: unknown): string => {
  const f = (e ?? {}) as { message?: unknown; response?: { data?: { error?: unknown } } };
  const uitLichaam = f.response?.data && typeof f.response.data === 'object' ? f.response.data.error : undefined;
  return String(uitLichaam || f.message || '');
};
/**
 * Is de weigering bij aansluiten definitief (de code werkt nooit meer)? Dan moet de code uit sessionStorage weg, anders probeert
 * de hub hem bij elke aanmelding opnieuw. Netwerkfouten zijn niet definitief. / Остаточна відмова: код прибрати зі sessionStorage.
 */
export function uitnodigingAfgewezen(e: unknown): boolean {
  const c = codeVan(e);
  return /^invite_/.test(c) || c === 'INVITE_INVITER_NOT_ALLOWED' || c === 'Invalid invitation' || c === 'Unsupported invitation';
}
