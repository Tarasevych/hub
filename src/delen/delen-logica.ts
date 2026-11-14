// IDENTITEIT-014 (фаза 3, крок «delen»): чиста логіка спільного доступу для hub-модалки й центру налаштувань.
// Zuivere logica voor delen (hub-venster én instellingencentrum): staat van een lid, welke rollen deze gebruiker mag kiezen,
// de tekst van het bevestigingsvenster «Надати доступ», en of een weigering bij aansluiten definitief is.
// Без DOM, без fetch: права лише з shared/werkruimte-rechten.ts (та сама таблиця, що на сервері) — власних перевірок ролей тут немає.
import { ROL_TEKST, magDelen, magRolBeheren, werkruimteRol, type WerkruimteRol } from '../../shared/werkruimte-rechten';
import { STANDAARD_LINK_DAGEN, dagenTekst, vervalTekst } from '../../shared/deel-links';

type Lang = 'uk' | 'nl';
export type Paar = readonly [string, string];
const kies = (lang: Lang, p: Paar) => (lang === 'uk' ? p[0] : p[1]);

/** Een lid zoals /api/share/members het geeft (e-mail kan voor een kijker gemaskeerd zijn). */
export type Lid = { id: string; email: string; userId?: string; permission: string; workspaceRole?: string; status: string; expired?: boolean; /** Alleen voor wie deelt: de blokken waartoe de uitnodiging beperkt is (leeg/afwezig = de hele ruimte). */ scopeBlockIds?: string[] };
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
export function toegangGevenVraag(lang: Lang, v: { email: string; ruimte: string; keuze: KeuzeRol; /** Aantal gekozen blokken; 0/afwezig = de hele ruimte. */ blokken?: number }) {
  const rol = keuzeNaarRol(v.keuze);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const gevolgen: string[] = [
    t('Якщо в людини ще немає облікового запису, запрошення діє 7 днів; доступ з’явиться після входу з цією адресою.', 'Heeft deze persoon nog geen account, dan is de uitnodiging 7 dagen geldig; de toegang begint na aanmelden met dit adres.'),
    // IDENTITEIT-014 (herstel): сервер сповіщає лише наявний обліковий запис і лише коли доступ новий або змінився — не обіцяємо більше.
    MELDING_PER_ADRES[lang === 'uk' ? 0 : 1],
    bereikTekst(lang, v.blokken),
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

/** Обсяг доступу словами: увесь простір або лише N вибраних блоків. / Bereik: de hele ruimte of alleen N blokken. */
export function bereikTekst(lang: Lang, blokken?: number): string {
  const n = Math.max(0, Math.floor(Number(blokken) || 0));
  return n ? (lang === 'uk' ? `Обсяг: лише вибрані блоки (${n}); решту простору людина не побачить.` : `Bereik: alleen de gekozen blokken (${n}); de rest van de werkruimte ziet deze persoon niet.`)
    : (lang === 'uk' ? 'Обсяг: увесь простір — усі блоки, зокрема ті, що з’являться пізніше.' : 'Bereik: de hele werkruimte — alle blokken, ook die later bijkomen.');
}
/** Wat de server echt doet na «per adres» (backend/index.ts, POST /api/share/email): melding alleen aan een bestaand account, en alleen bij nieuwe of gewijzigde toegang. */
export const MELDING_PER_ADRES: Paar = [
  'Якщо в людини вже є обліковий запис, вона отримає сповіщення (коли доступ новий або змінився). Якщо облікового запису ще немає, сайт нікого не сповіщає — повідомте людину самі. Дію буде записано в журнал.',
  'Heeft deze persoon al een account, dan krijgt zij een melding (als de toegang nieuw is of wijzigde). Zonder account meldt de site niemand iets — laat het de persoon zelf weten. De handeling komt in het logboek.',
];
/** Melding na een geslaagd «Надати доступ» — hub en instellingencentrum gebruiken dezelfde tekst. */
export const PER_ADRES_GELUKT: Paar = [
  'Доступ збережено. Сповіщення отримає лише наявний обліковий запис з цією адресою; інакше адресат побачить запрошення після входу з цією адресою (протягом 7 днів). Листа сайт не надсилає — повідомте людину самі.',
  'Toegang opgeslagen. Alleen een bestaand account met dit adres krijgt een melding; anders ziet de geadresseerde de uitnodiging na aanmelden met dit adres (binnen 7 dagen). De site stuurt geen e-mail — laat het de persoon zelf weten.',
];
/**
 * IDENTITEIT-015: чому немає листа-запрошення. Сайт не має власної поштової служби (відправника від імені сайту): поштові
 * з'єднання в «Пошті» — це скриньки самих людей, і від імені сайту вони не пишуть. Тож адресат без облікового запису
 * дізнається про запрошення лише від вас, а побачить простір після входу з цією адресою.
 * Waarom er geen e-mail gaat: de site heeft geen eigen verzendende postdienst.
 */
export const GEEN_UITNODIGINGSMAIL: Paar = [
  'Лист-запрошення сайт не надсилає: власної поштової служби для листів від імені сайту немає (поштові з’єднання в «Пошті» — це особисті скриньки). Адресат побачить запрошення після входу з цією адресою.',
  'De site verstuurt geen uitnodigingsmail: er is geen eigen postdienst om namens de site te mailen (de postkoppelingen in «Mail» zijn persoonlijke postvakken). De geadresseerde ziet de uitnodiging na aanmelden met dit adres.',
];
/** Melding na een rolwijziging: alleen een ACTIEF lid krijgt een melding (zelfde regel als POST /api/share/role). */
export const rolGewijzigdTekst = (actief: boolean): Paar => actief
  ? ['Роль змінено. Людина отримає сповіщення.', 'Rol gewijzigd. Deze persoon krijgt een melding.']
  : ['Роль у запрошенні змінено. Сповіщення немає: людина ще не прийняла запрошення — нова роль почне діяти після її входу.', 'De rol in de uitnodiging is gewijzigd. Er gaat geen melding uit: de uitnodiging is nog niet aanvaard — de nieuwe rol geldt na aanmelden.'];

/**
 * Venster bij ELKE rolwijziging in «Хто має доступ» (id deel-rol-beheerder voor «beheerder», anders deel-rol-wijzigen). Een native
 * <select> wijzigt met ↑/↓ meteen (Chrome/Edge op Windows/Linux) — zonder venster ging één pijltjestoets als POST naar de server.
 * Вікно з наслідками для кожної зміни ролі; сповіщення обіцяємо лише активному учаснику.
 */
export function rolWijzigenVraag(lang: Lang, v: { email: string; van: WerkruimteRol; naar: WerkruimteRol; actief: boolean }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (v.naar === 'admin') return { ...beheerderMakenVraag(lang, v.email, v.actief), gevaarlijk: true };
  const gevolgen: string[] = [];
  if (v.naar === 'member') gevolgen.push(t('Зможе додавати й змінювати блоки в цьому просторі, але не запрошувати інших.', 'Kan blokken in deze werkruimte toevoegen en wijzigen, maar niemand uitnodigen.'));
  if (v.naar === 'viewer') gevolgen.push(t('Зможе лише переглядати простір.', 'Kan de werkruimte alleen nog bekijken.'));
  const omlaagNaarKijker = v.naar === 'viewer' && v.van !== 'viewer';
  if (omlaagNaarKijker) gevolgen.push(t('Блоки, які створила ця людина, переходять власнику простору.', 'Blokken die deze persoon maakte, gaan over naar de eigenaar van de werkruimte.'));
  gevolgen.push(v.actief
    ? t('Нова роль діє одразу; людина отримає сповіщення.', 'De nieuwe rol geldt meteen; deze persoon krijgt een melding.')
    : t('Запрошення ще не прийнято, тож сповіщення не буде; нова роль почне діяти після входу.', 'De uitnodiging is nog niet aanvaard, dus er gaat geen melding uit; de nieuwe rol geldt na aanmelden.'));
  return {
    titel: t('Змінити роль?', 'Rol wijzigen?'),
    uitleg: t(`${v.email}: «${ROL_TEKST[v.van][0]}» → «${ROL_TEKST[v.naar][0]}».`, `${v.email}: «${ROL_TEKST[v.van][1]}» → «${ROL_TEKST[v.naar][1]}».`),
    gevolgen,
    gevaarlijk: omlaagNaarKijker,
    bevestigTekst: t('Так, змінити роль', 'Ja, rol wijzigen'),
  };
}

/** Venster vóór het maken van een privélink (id deel-link-maken): de link is een geheim dat de rol geeft aan wie hem als eerste opent. */
export function linkMakenVraag(lang: Lang, v: { ruimte: string; keuze: KeuzeRol; blokken?: number; /** IDENTITEIT-015 */ dagen?: number; email?: string }) {
  const dagen = v.dagen || STANDAARD_LINK_DAGEN;
  const rol = keuzeNaarRol(v.keuze);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const gevolgen = [
    v.email
      ? t(`Посилання спрацює лише для того, хто ввійде з адресою ${v.email}; іншим воно доступу не дасть.`, `De link werkt alleen voor wie zich aanmeldt met ${v.email}; anderen krijgt er geen toegang mee.`)
      : t('Хто першим відкриє посилання й увійде, отримає цю роль — будь-хто, до кого воно потрапить, не лише той, кому ви його надіслали.', 'Wie de link als eerste opent en zich aanmeldt, krijgt deze rol — iedereen die hem in handen krijgt, niet alleen aan wie u hem stuurde.'),
    t(`Посилання одноразове й діє ${dagenTekst('uk', dagen)}. Надсилайте його лише особисто.`, `De link is eenmalig en ${dagenTekst('nl', dagen)} geldig. Stuur hem alleen persoonlijk.`),
    bereikTekst(lang, v.blokken),
    t('Запис про створене посилання з’явиться у вашому центрі сповіщень і в журналі.', 'Een spoor van de gemaakte link komt in uw meldingencentrum en in het logboek.'),
  ];
  if (rol === 'admin') gevolgen.unshift(
    t('Роль «Адміністратор»: людина зможе запрошувати інших, змінювати їхні ролі й відкликати доступ — так само, як ви.', 'Rol «Beheerder»: deze persoon kan anderen uitnodigen, hun rol wijzigen en toegang intrekken — net als u.'),
    t('Перед створенням сайт попросить підтвердити, що це ви.', 'Vóór het maken vraagt de site te bevestigen dat u het bent.'),
  );
  return {
    titel: t('Створити посилання-запрошення?', 'Uitnodigingslink maken?'),
    uitleg: t(`Посилання до «${v.ruimte}» з роллю «${ROL_TEKST[rol][0]}».`, `Link naar «${v.ruimte}» met de rol «${ROL_TEKST[rol][1]}».`),
    gevolgen,
    gevaarlijk: rol === 'admin',
    bevestigTekst: t('Створити посилання', 'Link maken'),
  };
}
/** Melding na het maken van een link. */
export const LINK_GEMAAKT: Paar = [
  'Посилання створено. Воно одноразове й діє 7 днів; запис є у вашому центрі сповіщень.',
  'De link is gemaakt. Hij is eenmalig en 7 dagen geldig; er staat een spoor in uw meldingencentrum.',
];

/** IDENTITEIT-015: melding na het maken met de gekozen looptijd en de echte einddatum van de server. */
export function linkGemaakt(dagen: number, vervaltOp: string | null | undefined): Paar {
  return [
    `Посилання створено. Воно одноразове й діє ${dagenTekst('uk', dagen)} — до ${vervalTekst('uk', vervaltOp)}; запис є у вашому центрі сповіщень.`,
    `De link is gemaakt. Hij is eenmalig en ${dagenTekst('nl', dagen)} geldig — tot ${vervalTekst('nl', vervaltOp)}; er staat een spoor in uw meldingencentrum.`,
  ];
}

/** IDENTITEIT-015: een open link zoals POST /api/share/link/lijst hem geeft (zonder de code zelf). */
export type OpenLink = { id: string; code: string; workspaceRole: WerkruimteRol; email: string; expiresAt: string | null; createdAt: string; eigen: boolean; blokken: number };

/** Venster vóór het intrekken van een link (id deel-link-intrekken). */
export function linkIntrekkenVraag(lang: Lang, l: Pick<OpenLink, 'code' | 'workspaceRole' | 'email' | 'expiresAt'>) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  return {
    titel: t('Відкликати посилання?', 'Link intrekken?'),
    uitleg: t(`Посилання ${l.code} з роллю «${ROL_TEKST[l.workspaceRole][0]}»${l.email ? ` для ${l.email}` : ''} перестане діяти одразу.`, `De link ${l.code} met de rol «${ROL_TEKST[l.workspaceRole][1]}»${l.email ? ` voor ${l.email}` : ''} werkt meteen niet meer.`),
    gevolgen: [
      t('Хто відкриє його після цього, доступу не отримає.', 'Wie hem daarna opent, krijgt geen toegang.'),
      t('Учасників, які вже приєдналися, це не змінює — їх відкликають у списку «Хто має доступ».', 'Leden die al aansloten, blijven; die trekt u in via «Wie heeft toegang».'),
      t('Скасувати відкликання не можна — за потреби створіть нове посилання.', 'Intrekken kan niet ongedaan worden — maak zo nodig een nieuwe link.'),
    ],
    bevestigTekst: t('Так, відкликати', 'Ja, intrekken'),
  };
}

/** Venster vóór «Вийти з простору» (id deel-vertrekken) — eigen rij in «Хто має доступ». */
export function vertrekkenVraag(lang: Lang) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  return {
    titel: t('Вийти з простору?', 'Werkruimte verlaten?'),
    uitleg: t('Ви більше не бачитимете цей простір і його блоки.', 'U ziet deze werkruimte en haar blokken dan niet meer.'),
    gevolgen: [
      t('Блоки, які ви додали, залишаться у власника простору.', 'Blokken die u toevoegde, blijven bij de eigenaar van de werkruimte.'),
      t('Власник отримає сповіщення, що ви вийшли.', 'De eigenaar krijgt een melding dat u vertrok.'),
      t('Повернутися можна лише за новим запрошенням.', 'Terugkeren kan alleen met een nieuwe uitnodiging.'),
    ],
    bevestigTekst: t('Так, вийти', 'Ja, verlaten'),
  };
}

/** Tekst van het venster bij het wijzigen van een rol naar «beheerder» (id deel-rol-beheerder). */
export function beheerderMakenVraag(lang: Lang, email: string, actief = true) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  return {
    titel: t('Зробити адміністратором?', 'Beheerder maken?'),
    uitleg: t(`${email} стане адміністратором цього простору.`, `${email} wordt beheerder van deze werkruimte.`),
    gevolgen: [
      t('Зможе запрошувати інших, змінювати їхні ролі й відкликати доступ.', 'Kan anderen uitnodigen, hun rol wijzigen en toegang intrekken.'),
      t('Сайт попросить підтвердити, що це ви.', 'De site vraagt te bevestigen dat u het bent.'),
      actief ? t('Людина отримає сповіщення.', 'Deze persoon krijgt een melding.') : t('Запрошення ще не прийнято, тож сповіщення не буде; роль почне діяти після входу.', 'De uitnodiging is nog niet aanvaard, dus er gaat geen melding uit; de rol geldt na aanmelden.'),
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
