// Gescheiden GEGEVENSRUIMTES (opdracht van de eigenaar, 20.10.2026): «технічний профіль і профіль користувача мають спільний
// простір — як от пошту, ШІ, хмару та інші сервіси сайту».
//
// WAT ER TOT NU WAS EN WAAROM DAT TE WEINIG IS
//   • shared/ai-ruimte.ts (AiRuimte = 'prive' | 'technisch') scheidt alleen WELKE HULPMIDDELEN een AI ziet. Dat is geen
//     scheiding van GEGEVENS: wie in het technische profiel zijn mail opende, zag exact dezelfde mailbox.
//   • Alle persoonlijke gegevens hangen nog uitsluitend aan `ownerUserId` (backend/cloud-platform.ts, backend/mail-*.ts,
//     backend/mcp-console.ts). Eén mens = één lade, voor beide profielen.
//   • Vigljad en menu zijn al wél per ruimte (shared/menu-model.ts → ZijbalkRuimtes, shared/uiterlijk.ts). Dit bestand volgt
//     EXACT diezelfde mechaniek — geen tweede waarheid: de ruimte wordt live berekend door backend/ai-ruimte-poort.ts
//     (effectieveRuimte) en hier wordt alleen beslist UIT WELKE LADE er gelezen en geschreven mag worden.
//
// HET MODEL IN ÉÉN ALINEA
//   Een gegevenssleutel is (userId, ruimte). Elke bestaande rij hoort bij ruimte 'prive' — er gaat NIETS verloren en er
//   verandert niets voor wie geen technisch profiel heeft. De technische ruimte begint LEEG. Per dienst kiest de mens zelf:
//     'eigen'    — de technische ruimte heeft haar eigen lade (eigen mail, eigen hmara, eigen notities);
//     'gedeeld'  — de technische ruimte gebruikt de PERSOONLIJKE lade (bewuste samenvoeging, step-up + logboek);
//     'uit'      — deze dienst bestaat niet in de technische ruimte (standaard, en de veilige richting);
//     'bevroren' — de mens verloor zijn technische rechten: alles ingetrokken, de gegevens blijven heel maar zijn
//                  ONBEREIKBAAR tot de eigenaar van de server beslist (teruggeven / overnemen / verwijderen).
//   Onbekend of leeg → 'uit'. Nooit stil terugvallen op 'gedeeld': dat zou persoonlijke gegevens in de technische ruimte
//   laten zien zonder dat iemand daarvoor koos.
//
// Puur: geen React, geen DOM, geen Node. Server, browser en tests gebruiken dezelfde regels.
import type { AiRuimte } from './ai-ruimte';
import { TECH_ROLLEN, mogelijkhedenVan, type TechMogelijkheid, type TechRol } from './tech-rollen';

// ------------------------------------------------------------------------------------------------ wie krijgt een eigen lade
// TWEE VERSCHILLENDE VRAGEN, die tot 20.10.2026 in één functie zaten (backend/ai-ruimte-poort.ts → effectieveRuimte):
//
//   (a) HEEFT DEZE MENS TECHNISCHE TOEGANG?  — een geldig technisch profiel (app.tech_profielen) met een rol die in de
//       technische ruimte werkt. Dit beslist of zij een EIGEN GEGEVENSLADE mag hebben. De opdracht van de eigenaar gaat
//       hierover: «користувачі, які на сайті мають технічний доступ, мають розділятися», niet alleen de servereigenaar.
//   (b) WAT MAG ZIJ DAAR DOEN? — releases, serverdeur, terminals, SSH, gebruikersbeheer. Dat blijft onveranderd staan waar
//       het stond: shared/tech-rollen.ts (mogelijkheden per rol) en de poorten die die mogelijkheden afdwingen. Een eigen
//       lade geeft NUL nieuwe mogelijkheden: alleen een plek waar de eigen gegevens van die mens staan.
//
// Welke rollen een eigen lade mogen, leiden we AF uit de catalogus in plaats van een tweede lijst bij te houden: een rol
// krijgt een lade als zij in de technische ruimte WERKT — iets voorbereidt, beheert of uitvoert. Alleen-lezen rollen
// (ondersteuning: diagnose + journaalmetadata; auditor: journaal + opnames) maken daar geen eigen gegevens en krijgen er dus
// ook geen lade voor: minste rechten, kleinste oppervlak. Vandaag levert dat: tester, ontwikkelaar, beheerder, eigenaar.
export const EIGEN_LADE_MOGELIJKHEDEN: readonly TechMogelijkheid[] = Object.freeze([
  'testruimtes', 'uitrol.voorbereiden', 'logboeken.diensten', 'terminal.test', 'terminal.servers', 'diensten.beheren', 'users.manage', 'ssh.host',
]);
/** Mag een profiel met deze rollen een eigen technische lade hebben? Leeg of alleen-lezen → nee. */
export const magEigenLade = (rollen: readonly unknown[] | null | undefined): boolean => {
  const r = (rollen ?? []).map((x) => String(x));
  if (!r.length) return false;
  const m = mogelijkhedenVan(r);
  return EIGEN_LADE_MOGELIJKHEDEN.some((x) => m.includes(x));
};
/** De rollen die vandaag een eigen lade krijgen — afgeleid, nooit met de hand bijgehouden (de eenheidstest vergelijkt het). */
export const ROLLEN_MET_EIGEN_LADE: readonly TechRol[] = Object.freeze(TECH_ROLLEN.filter((r) => magEigenLade([r.id])).map((r) => r.id));
/** Alleen de eigenaar van de server beslist over BEVROREN gegevens — dat verandert niet (beslissing 3 van de eigenaar). */
export const BESLUIT_ALLEEN_EIGENAAR = true;

// ------------------------------------------------------------------------------------------------ diensten
/**
 * Diensten die ECHT een eigen lade per ruimte kunnen hebben — geverifieerd tegen de code, niet tegen een wensenlijst:
 *   mail       backend/mail-platform.ts, mail-gmail/microsoft/afzenders (accounts + berichten per ownerUserId)
 *   cloud      backend/cloud-platform.ts (cloud_workspaces / cloud_items / cloud_audit per ownerUserId)
 *   agenda     backend/agenda-*.ts (app.agenda_externe_gebeurtenis, app.agenda_koppeling per user_id)
 *   contacten  backend/mail-afzenders.ts + app.mail_contacten (migratie 0074)
 *   ai         backend/ai-toestemmingen.ts, connector-v2, mcp-klant (app.ai_grants, app.mcp_oauth_tokens,
 *              app.mcp_console_tokens, app.agents, app.externe_mcp_verbinding)
 *   bord       backend/mcp-console.ts (app.mcp_console_items) — TAKEN ÉN NOTITIES staan in diezelfde tabel
 *   github     backend/github-koppeling-opslag.ts (github_koppeling_v1) + github-platform tokens
 *
 * «notities» is daarom GEEN eigen lade: de hub-notities (src/HubNotities.tsx) zijn rijen met etiket 'hub' in app.mcp_console_items,
 * dus ze volgen de stand van 'bord'. DIENST_ALIAS maakt dat expliciet in plaats van het te verzwijgen; zo vraagt een agent die
 * 'notities' of 'notes' zegt nooit per ongeluk een lade die niet bestaat.
 */
export const DEELBARE_DIENSTEN = ['mail', 'cloud', 'agenda', 'contacten', 'ai', 'bord', 'github'] as const;
export type DeelbareDienst = typeof DEELBARE_DIENSTEN[number];
const DIENST_SET = new Set<string>(DEELBARE_DIENSTEN);

/** Namen die hetzelfde bedoelen (menu-id's, Engelse namen, onderdelen van één lade). */
export const DIENST_ALIAS: Readonly<Record<string, DeelbareDienst>> = Object.freeze({
  notities: 'bord', notes: 'bord', taken: 'bord', tasks: 'bord', board: 'bord',
  calendar: 'agenda', agenda_: 'agenda', contacts: 'contacten', drive: 'cloud', hmara: 'cloud', post: 'mail', email: 'mail',
});
/** Dienstnaam normaliseren; onbekend → null (de poort weigert dan met DIENST_ONBEKEND: minste rechten). */
export const dienstOf = (v: unknown): DeelbareDienst | null => {
  const s = String(v ?? '').trim().toLowerCase();
  if (DIENST_SET.has(s)) return s as DeelbareDienst;
  return DIENST_ALIAS[s] ?? null;
};

export const DIENST_NAAM: Readonly<Record<DeelbareDienst, { uk: string; nl: string }>> = Object.freeze({
  mail: { uk: 'Пошта', nl: 'E-mail' },
  cloud: { uk: 'Хмара', nl: 'Cloud' },
  agenda: { uk: 'Календар', nl: 'Agenda' },
  contacten: { uk: 'Контакти', nl: 'Contacten' },
  ai: { uk: 'Підключення ШІ', nl: 'AI-verbindingen' },
  bord: { uk: 'Дошка: завдання й нотатки', nl: 'Bord: taken en notities' },
  github: { uk: 'GitHub', nl: 'GitHub' },
});

// ------------------------------------------------------------------------------------------------ standen
export const DIENST_STANDEN = ['eigen', 'gedeeld', 'uit', 'bevroren'] as const;
export type DienstStand = typeof DIENST_STANDEN[number];
/** Onbekend, leeg of kapot → 'uit': de technische ruimte ziet dan niets. NOOIT 'gedeeld' (dat zou persoonlijke data openen). */
export const standOf = (v: unknown): DienstStand => ((DIENST_STANDEN as readonly string[]).includes(String(v ?? '')) ? String(v) as DienstStand : 'uit');

export const STAND_NAAM: Readonly<Record<DienstStand, { uk: string; nl: string }>> = Object.freeze({
  eigen: { uk: 'Окремі дані', nl: 'Eigen gegevens' },
  gedeeld: { uk: 'Спільне з особистим', nl: 'Gedeeld met persoonlijk' },
  uit: { uk: 'Вимкнено', nl: 'Uit' },
  bevroren: { uk: 'Заморожено', nl: 'Bevroren' },
});
export const STAND_UITLEG: Readonly<Record<DienstStand, { uk: string; nl: string }>> = Object.freeze({
  eigen: {
    uk: 'У технічному просторі ця служба має власні дані: власні підключення, власні записи. Особисте лишається осторонь і звідси не видно.',
    nl: 'In de technische ruimte heeft deze dienst eigen gegevens: eigen verbindingen, eigen records. Het persoonlijke blijft erbuiten en is hier niet te zien.',
  },
  gedeeld: {
    uk: 'Технічний простір користується вашим ОСОБИСТИМ підключенням цієї служби. Це свідоме об’єднання: його видно в журналі й можна роз’єднати будь-коли, одразу.',
    nl: 'De technische ruimte gebruikt uw PERSOONLIJKE verbinding van deze dienst. Dat is een bewuste samenvoeging: hij staat in het logboek en u kunt hem altijd meteen losmaken.',
  },
  uit: {
    uk: 'У технічному просторі цієї служби немає. Нічого не видно й не записується — доки ви самі її не під’єднаєте.',
    nl: 'In de technische ruimte bestaat deze dienst niet. Er is niets te zien en er wordt niets geschreven — tot u hem zelf verbindt.',
  },
  bevroren: {
    uk: 'Технічні права зникли, тому всі підключення цієї служби відкликано. Дані цілі, але недосяжні, доки власник сервера не вирішить: повернути, передати собі чи видалити.',
    nl: 'De technische rechten zijn weg, dus alle verbindingen van deze dienst zijn ingetrokken. De gegevens zijn heel maar onbereikbaar tot de servereigenaar beslist: teruggeven, overnemen of verwijderen.',
  },
});

// ------------------------------------------------------------------------------------------------ de keuze, één keer
/**
 * Beslissing 2 van de eigenaar: bij de EERSTE activering van het technische profiel één keer vragen. Tot er gekozen is, is de
 * technische ruimte leeg en weigert elke dienst met een eerlijke uitleg (nooit een leeg scherm).
 *   'apart'      — роздільно: elke dienst krijgt een eigen lade;
 *   'samen'      — спільно: elke dienst gebruikt de persoonlijke lade;
 *   'per_dienst' — обидва окремо: twee ruimtes naast elkaar, en per dienst beslist de mens zelf (begint op 'uit').
 * De keuze vult alleen de BEGINSTAND; daarna blijft elke dienst los te verbinden en los te ontkoppelen (beslissing 4).
 */
export const KEUZES = ['apart', 'samen', 'per_dienst'] as const;
export type Keuze = typeof KEUZES[number];
export const keuzeOf = (v: unknown): Keuze | null => ((KEUZES as readonly string[]).includes(String(v ?? '')) ? String(v) as Keuze : null);
export const STAND_BIJ_KEUZE: Readonly<Record<Keuze, DienstStand>> = Object.freeze({ apart: 'eigen', samen: 'gedeeld', per_dienst: 'uit' });

export const KEUZE_NAAM: Readonly<Record<Keuze, { uk: string; nl: string }>> = Object.freeze({
  apart: { uk: 'Роздільно', nl: 'Gescheiden' },
  samen: { uk: 'Спільно', nl: 'Samen' },
  per_dienst: { uk: 'Обидва окремо — вирішувати щоразу', nl: 'Beide apart — per dienst beslissen' },
});
export const KEUZE_UITLEG: Readonly<Record<Keuze, { uk: string; nl: string }>> = Object.freeze({
  apart: {
    uk: 'Технічний простір отримує власні дані в усіх службах: свою пошту, свою хмару, свої підключення ШІ, свою дошку. Нічого особистого тут не видно. Будь-яку службу потім можна об’єднати з особистою — окремо, з підтвердженням.',
    nl: 'De technische ruimte krijgt in alle diensten eigen gegevens: eigen mail, eigen cloud, eigen AI-verbindingen, eigen bord. Niets persoonlijks is hier te zien. Elke dienst kunt u later apart samenvoegen, met een bevestiging.',
  },
  samen: {
    uk: 'Технічний простір користується вашими особистими підключеннями в усіх службах — як було досі. Простір один, лише технічні інструменти додаються. Будь-яку службу можна роз’єднати будь-коли, одразу.',
    nl: 'De technische ruimte gebruikt in alle diensten uw persoonlijke verbindingen — zoals het tot nu was. Eén ruimte, met de technische hulpmiddelen erbij. Elke dienst kunt u altijd meteen losmaken.',
  },
  per_dienst: {
    uk: 'Два простори стоять поруч і технічний починається порожнім. Для кожної служби ви самі кажете: власні дані, спільне з особистим, або вимкнено. Нічого не відкривається саме собою.',
    nl: 'Twee ruimtes naast elkaar; de technische begint leeg. Voor elke dienst zegt u zelf: eigen gegevens, gedeeld met persoonlijk, of uit. Er gaat niets vanzelf open.',
  },
});

// ------------------------------------------------------------------------------------------------ overgangen
/**
 * Beslissing 4: samenvoegen en losmaken is PER DIENST, elk met een eigen bevestiging en een eigen logboekregel.
 *  - verbinden ('verbind-eigen' / 'verbind-gedeeld') is een bewuste daad → step-up (backend/stap-op.ts, en in de lijst
 *    «altijd vragen»: een onthouden browser is hier nooit genoeg);
 *  - ontkoppelen ('ontkoppel') gaat ONMIDDELLIJK, zonder bevestiging — veiligheid mag nooit op een extra klik wachten;
 *  - 'bevries' is geen keuze van de mens maar het gevolg van het verliezen van rechten (backend/ruimte-scheiding.ts);
 *  - uit 'bevroren' komt men alleen via een besluit van de SERVEREIGENAAR: teruggeven / overdragen / verwijderen.
 */
export const ACTIES = ['verbind-eigen', 'verbind-gedeeld', 'ontkoppel', 'bevries', 'teruggeven', 'overdragen', 'verwijderen'] as const;
export type Actie = typeof ACTIES[number];
/** Alleen de eigenaar van de server mag deze drie, en alleen op een bevroren dienst. */
export const EIGENAARSBESLUITEN: readonly Actie[] = Object.freeze(['teruggeven', 'overdragen', 'verwijderen']);
export const isEigenaarsBesluit = (a: unknown): a is 'teruggeven' | 'overdragen' | 'verwijderen' => (EIGENAARSBESLUITEN as readonly string[]).includes(String(a ?? ''));
export const actieOf = (v: unknown): Actie | null => ((ACTIES as readonly string[]).includes(String(v ?? '')) ? String(v) as Actie : null);

export type OvergangFoutCode = 'ACTIE_ONBEKEND' | 'BEVROREN' | 'NIET_BEVROREN' | 'AL_ZO' | 'KEUZE_ONTBREEKT';
export type Overgang =
  | { ok: true; actie: Actie; van: DienstStand; naar: DienstStand; stapOp: boolean; verwijdert: boolean; eigenaarsBesluit: boolean }
  | { ok: false; fout: OvergangFoutCode };

/**
 * Pure overgangsregel. `keuzeGemaakt` = heeft deze mens de eenmalige keuze al gemaakt (zonder keuze bestaat de technische
 * ruimte niet en mag er niets verbonden worden); `naStand` = waar 'teruggeven' naartoe gaat (de stand van vóór het bevriezen,
 * standaard 'eigen' — nooit 'gedeeld', want persoonlijke gegevens teruggeven vraagt een nieuwe bewuste daad).
 */
export function overgang(huidig: unknown, actie: unknown, opties: { keuzeGemaakt?: boolean; naStand?: unknown } = {}): Overgang {
  const van = standOf(huidig);
  const a = actieOf(actie);
  if (!a) return { ok: false, fout: 'ACTIE_ONBEKEND' };
  if (isEigenaarsBesluit(a)) {
    if (van !== 'bevroren') return { ok: false, fout: 'NIET_BEVROREN' };
    const terug = standOf(opties.naStand);
    const naar: DienstStand = a === 'teruggeven' ? (terug === 'gedeeld' || terug === 'bevroren' || terug === 'uit' ? 'eigen' : terug) : 'uit';
    return { ok: true, actie: a, van, naar, stapOp: true, verwijdert: a === 'verwijderen', eigenaarsBesluit: true };
  }
  if (a === 'bevries') return van === 'bevroren' ? { ok: false, fout: 'AL_ZO' } : { ok: true, actie: a, van, naar: 'bevroren', stapOp: false, verwijdert: false, eigenaarsBesluit: false };
  if (van === 'bevroren') return { ok: false, fout: 'BEVROREN' };
  if (a === 'ontkoppel') return van === 'uit' ? { ok: false, fout: 'AL_ZO' } : { ok: true, actie: a, van, naar: 'uit', stapOp: false, verwijdert: false, eigenaarsBesluit: false };
  if (opties.keuzeGemaakt !== true) return { ok: false, fout: 'KEUZE_ONTBREEKT' };
  const naar: DienstStand = a === 'verbind-eigen' ? 'eigen' : 'gedeeld';
  if (van === naar) return { ok: false, fout: 'AL_ZO' };
  return { ok: true, actie: a, van, naar, stapOp: true, verwijdert: false, eigenaarsBesluit: false };
}

// ------------------------------------------------------------------------------------------------ de lade (gegevenssleutel)
/** Waar gelezen en geschreven wordt: één mens, twee laden. `ruimte` is nooit 'onbekend' — de poort beslist of er iets mag. */
export type Lade = { userId: string; ruimte: AiRuimte };
export type LadeWeigering = 'DIENST_ONBEKEND' | 'KEUZE_ONTBREEKT' | 'DIENST_UIT' | 'BEVROREN' | 'GEEN_GEBRUIKER';
export type LadeBesluit =
  | { ok: true; lade: Lade; dienst: DeelbareDienst; stand: DienstStand; gedeeld: boolean }
  | { ok: false; code: LadeWeigering; uitleg: { uk: string; nl: string } };

export const WEIGERING_UITLEG: Readonly<Record<LadeWeigering, { uk: string; nl: string }>> = Object.freeze({
  GEEN_GEBRUIKER: { uk: 'Немає користувача для цього запиту.', nl: 'Geen gebruiker voor dit verzoek.' },
  DIENST_ONBEKEND: { uk: 'Невідома служба: простір для неї не визначено, тому доступу немає.', nl: 'Onbekende dienst: er is geen ruimte voor bepaald, dus geen toegang.' },
  KEUZE_ONTBREEKT: {
    uk: 'Технічний простір ще порожній: ви не обрали, чи має він власні дані, чи користується особистими. Зробіть вибір один раз — і служби з’являться.',
    nl: 'De technische ruimte is nog leeg: u koos nog niet of hij eigen gegevens krijgt of de persoonlijke gebruikt. Maak die keuze één keer en de diensten verschijnen.',
  },
  DIENST_UIT: {
    uk: 'Ця служба вимкнена в технічному просторі. Під’єднайте її окремо — з підтвердженням — або працюйте з нею в особистому просторі.',
    nl: 'Deze dienst staat uit in de technische ruimte. Verbind hem apart — met een bevestiging — of werk ermee in de persoonlijke ruimte.',
  },
  BEVROREN: {
    uk: 'Технічний простір заморожено після втрати технічних прав. Дані цілі, але недосяжні, доки власник сервера не вирішить, що з ними робити.',
    nl: 'De technische ruimte is bevroren na het verlies van de technische rechten. De gegevens zijn heel maar onbereikbaar tot de servereigenaar beslist wat ermee gebeurt.',
  },
});
const weiger = (code: LadeWeigering): LadeBesluit => ({ ok: false, code, uitleg: WEIGERING_UITLEG[code] });

/**
 * DE KERN. Uit welke lade mag dit verzoek lezen en schrijven?
 *   ruimte 'prive'     → altijd de persoonlijke lade; hier verandert niets voor niemand.
 *   ruimte 'technisch' → de keuze en de stand van DEZE dienst beslissen; 'gedeeld' leidt naar de persoonlijke lade,
 *                        'eigen' naar de technische, en 'uit'/'bevroren'/onbekend naar een weigering met uitleg.
 * Puur: de aanroeper geeft de live berekende ruimte (backend/ai-ruimte-poort.ts) en de opgeslagen stand mee.
 */
export function ladeVoor(input: { userId: string; ruimte: AiRuimte; dienst: unknown; stand: unknown; keuzeGemaakt: boolean }): LadeBesluit {
  if (!input.userId) return weiger('GEEN_GEBRUIKER');
  const dienst = dienstOf(input.dienst);
  if (!dienst) return weiger('DIENST_ONBEKEND');
  if (input.ruimte !== 'technisch') return { ok: true, lade: { userId: input.userId, ruimte: 'prive' }, dienst, stand: 'eigen', gedeeld: false };
  if (!input.keuzeGemaakt) return weiger('KEUZE_ONTBREEKT');
  const stand = standOf(input.stand);
  if (stand === 'bevroren') return weiger('BEVROREN');
  if (stand === 'uit') return weiger('DIENST_UIT');
  if (stand === 'gedeeld') return { ok: true, lade: { userId: input.userId, ruimte: 'prive' }, dienst, stand, gedeeld: true };
  return { ok: true, lade: { userId: input.userId, ruimte: 'technisch' }, dienst, stand, gedeeld: false };
}

// ------------------------------------------------------------------------------------------------ de lade in de opslag
/**
 * Hoe een dienst zijn rijen aan een lade hangt. Twee regels, en ze zijn niet onderhandelbaar:
 *  1. de kolom/het veld heet `ruimte`;
 *  2. ONTBREEKT die waarde, dan is de rij 'prive'. Daarom gaat er bij de overstap geen enkele bestaande rij verloren en
 *     blijft alles wat er nu staat persoonlijk — ook zonder migratie van de gegevens zelf.
 */
export const RUIMTE_VELD = 'ruimte' as const;
/** Filter voor db.list()-achtige opslag (records met velden). 'prive' matcht ook rijen zonder veld; vergelijk met `hoortBij`. */
export const ladeFilter = (lade: Lade) => (lade.ruimte === 'technisch' ? { ownerUserId: lade.userId, ruimte: 'technisch' } : { ownerUserId: lade.userId });
/** Hoort deze rij bij die lade? Voor opslag die niet op een leeg veld kan filteren (records: `ruimte` ontbreekt = 'prive'). */
export const hoortBij = (rij: { ownerUserId?: unknown; userId?: unknown; ruimte?: unknown } | null | undefined, lade: Lade): boolean => {
  if (!rij) return false;
  const eigenaar = String(rij.ownerUserId ?? rij.userId ?? '');
  return eigenaar === lade.userId && (String(rij.ruimte ?? 'prive') === 'technisch' ? 'technisch' : 'prive') === lade.ruimte;
};
/** Velden die een NIEUWE rij meekrijgt. 'prive' schrijft de waarde ook expliciet, zodat nieuwe rijen zelfverklarend zijn. */
export const ladeVelden = (lade: Lade) => ({ ownerUserId: lade.userId, ruimte: lade.ruimte });
/**
 * SQL-voorwaarde voor tabellen met een `ruimte`-kolom (PostgreSQL). `kolom` is de kolomnaam, `param` het nummer van de
 * user_id-parameter. Voor 'prive' telt NULL mee, zodat rijen van vóór migratie 0082 persoonlijk blijven.
 *   await q(`SELECT * FROM app.mcp_console_items WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId])
 */
export const sqlLadeWaar = (kolom: string, lade: Lade, param = 1): string => {
  const k = /^[a-z_][a-z0-9_]{0,40}$/.test(kolom) ? kolom : 'ruimte';
  return lade.ruimte === 'technisch' ? `user_id = $${param} AND ${k} = 'technisch'` : `user_id = $${param} AND COALESCE(${k}, 'prive') = 'prive'`;
};

// ------------------------------------------------------------------------------------------------ waarom rechten weg zijn
/** Elke weg waarlangs technische rechten kunnen verdwijnen; alle vier leiden naar precies dezelfde bevriezing. */
export const OORZAKEN = ['rol-weg', 'profiel-ingetrokken', 'account-geblokkeerd', 'account-verwijderd'] as const;
export type Oorzaak = typeof OORZAKEN[number];
export const oorzaakOf = (v: unknown): Oorzaak => ((OORZAKEN as readonly string[]).includes(String(v ?? '')) ? String(v) as Oorzaak : 'rol-weg');
export const OORZAAK_NAAM: Readonly<Record<Oorzaak, { uk: string; nl: string }>> = Object.freeze({
  'rol-weg': { uk: 'Змінено роль', nl: 'Rol gewijzigd' },
  'profiel-ingetrokken': { uk: 'Відкликано технічний профіль', nl: 'Technisch profiel ingetrokken' },
  'account-geblokkeerd': { uk: 'Акаунт заблоковано', nl: 'Account geblokkeerd' },
  'account-verwijderd': { uk: 'Акаунт видалено', nl: 'Account verwijderd' },
});

// ------------------------------------------------------------------------------------------------ logboekcodes
/** Dezelfde weg als elke andere beheerhandeling: shared/beheer-journaal.ts (categorie «tech»). */
export const JOURNAAL = Object.freeze({
  keuze: 'owner.ruimte.keuze',
  verbonden: 'owner.ruimte.verbonden',
  ontkoppeld: 'owner.ruimte.ontkoppeld',
  bevroren: 'owner.ruimte.bevroren',
  besluit: 'owner.ruimte.besluit',
  geweigerd: 'owner.ruimte.geweigerd',
});
