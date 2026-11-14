// SFEER VAN EEN MELDING: `prive` of `technisch` (22.10.2026, klacht van de eigenaar: «звіти технічних сповіщень досі показуються в панелі
// сповіщень користувача … аудит, збої діагностики, дії агентів, звірка — чомусь досі попадають у панель»).
//
// WAT ER WAS EN WAAROM DAT TE WEINIG WAS
//   • Sinds 20.10.2026 draagt elke NIEUWE melding haar lade (`ruimte`, shared/meldingen-ruimte.ts). Maar een rij van VÓÓR die dag heeft
//     geen veld en is per definitie persoonlijk — ook een «uitrol mislukt» of «siem»-melding van 19.10. Die bleef dus in de bel staan.
//   • De «дії на сайті» in de bel komen niet uit site_notifications maar uit het activiteitenoverzicht (/api/owner/agents/activity:
//     auditregels, opdrachten van apparaten, aanroepen van hulpmiddelen). Dat overzicht kende geen lade: alles (ook beheer, uitrol,
//     diagnose, SIEM, звірка) kwam in de persoonlijke bel, en de teller telde ze mee («99+»).
//
// HET MODEL: ÉÉN verplicht etiket `sfeer` per melding en per activiteit, in ÉÉN register (dit bestand):
//   • technisch = alles wat de SITE of de SERVER aangaat: beheer, звірка/audit, diagnose en storingen van diensten, uitrol en terugdraaien,
//     apparaten van de server, SIEM, geheimen, OPA/RLS, besluiten van de eigenaar (zone B), rook-controle (zone A), en elke actie die in
//     het TECHNISCHE profiel gebeurde (auditcontext `profiel`/`activatie`, apparaat met ruimte 'technisch', lade 'technisch').
//   • prive = wat de MENS aangaat: post, agenda, bord, hmara, beveiliging van het eigen account, eigen toegangsverzoek, delen, AI-bevestiging
//     voor de persoonlijke ruimte, eigen apparaten en browsers.
//   • De sfeer is een ETIKET, geen lade: de lade (`ruimte`) blijft beslissen over bevriezen/overdragen/wissen (0086/0091) en geen rij
//     verhuist. Migratie 0107 zet het etiket op bestaande rijen (op soort), nieuwe rijen krijgen het bij het aanmaken (sfeerBijAanmaak).
//   • LEZEN: de bel van de gebruiker krijgt van de server ALLEEN sfeer 'prive'; het paneel «Технічні сповіщення» in de band ALLEEN
//     'technisch', en dat alleen in een tabblad met actief technisch profiel (backend/meldingen-ruimte.ts → meldingenLade).
//   • ONBEKEND: een soort die hier niet staat, is 'technisch' (de bel van de gebruiker krijgt nooit iets dat niet aantoonbaar van
//     hemzelf is) én laat tests/eenheid/meldingen-sferen-20261022.test.ts falen: elke soort die backend/ maakt moet hier staan.
// Puur (geen React/DOM/DB): dezelfde regel in de browser, op de server, in de migratie-test en in de stand.
import { MELDING_SOORTEN } from './melding-soorten';
import { ACTIE_LABELS, actieLabel, categorieNaam, categorieVan } from './beheer-journaal';

export type MeldingSfeer = 'prive' | 'technisch';
export const SFEER_VELD = 'sfeer' as const;
export const SFEREN: readonly MeldingSfeer[] = ['prive', 'technisch'];
export const isSfeer = (v: unknown): v is MeldingSfeer => v === 'prive' || v === 'technisch';

/**
 * Sfeer per SOORT (kind) van site_notifications en notification_jobs. Expliciet, geen afleiding: de test eist dat elke soort uit
 * shared/melding-soorten.ts hier staat, dat beide registers dezelfde sfeer geven, en dat elke soort die backend/ gebruikt hier staat.
 */
export const SFEER_PER_SOORT: Readonly<Record<string, MeldingSfeer>> = Object.freeze({
  // ------------------------------------------------------------ prive: de mens zelf
  security: 'prive', security_warning: 'prive',
  access_method_unlinked: 'prive', access_method_restored: 'prive', access_recovery_code_used: 'prive', access_recovery_rotated: 'prive',
  access_recovery_revoked: 'prive', access_recovery_low: 'prive' /* IDENTITEIT-014, na 0107: voorvoegsel access_recovery → prive */, access_totp_enrolled: 'prive', access_totp_replaced: 'prive',
  account_email_conflict: 'prive', owner_identity_mismatch: 'prive',
  access_decision: 'prive', workspace_share: 'prive', impersonatie: 'prive', ondersteuning: 'prive', ai_bevestiging: 'prive',
  // SEC-002 (g10c): geplande brieven geweigerd/geannuleerd — na 0107 toegevoegd; zie NA_0107_VIA_VOORVOEGSEL.
  mail_queue_refused: 'prive', mail_queue_cancelled: 'prive',
  // SEC-002 (g03, afwerking A): schrijven in de hmara geweigerd voor «лише перегляд» — na 0107, sfeer volgens het voorvoegsel «cloud».
  cloud_alleen_lezen: 'prive',
  // SEC-002 (slot «u»): dezelfde weigering buiten de hmara (voorvoegsel «toegang_» → prive) en de agenda (voorvoegsel «agenda» → prive),
  // beide na 0107 en dus in NA_0107_VIA_VOORVOEGSEL.
  toegang_alleen_lezen: 'prive', agenda: 'prive',
  // IDENTITEIT-014: rechten in een gedeelde ruimte (rol gewijzigd, toegang ingetrokken, uitnodiging aangenomen) — na 0107, voorvoegsel «workspace» → prive.
  workspace_ownership_transferred: 'prive', // IDENTITEIT-015 (profiel-blokken): eigendom van een werkruimte overgedragen — na 0107, voorvoegsel «workspace» → prive.
  workspace_role_changed: 'prive', workspace_access_revoked: 'prive', workspace_invite_accepted: 'prive', workspace_share_link_created: 'prive',
  // IDENTITEIT-015 (aanmelden): aanmelding zonder Google en telefoon bevestigd — na 0107, voorvoegsel «access_method» → prive.
  access_method_login: 'prive', access_method_telefoon: 'prive',
  // ------------------------------------------------------------ technisch: de site en de server
  access_request: 'technisch', google_login_config: 'technisch', mcp_app_secret: 'technisch', vault_key_expiring: 'technisch',
  vault_key_expired: 'technisch', 'beveiliging.zekering': 'technisch', 'impersonatie.beheerder': 'technisch',
  'uitrol.mislukt': 'technisch', uitrol: 'technisch', uitrol_voorstel: 'technisch', release: 'technisch', server: 'technisch',
  deur: 'technisch', siem: 'technisch',
  // notification_jobs (kanalen e-mail/telegram naar de eigenaar) — dezelfde soorten als hierboven; vandaag alleen access_request.
});

/**
 * Voorvoegsels voor soorten die (nog) niet in de tabel staan — DEZELFDE tekst staat als POSIX-regex in migratie 0107
 * (app.melding_sfeer); de test vergelijkt beide letterlijk. Volgorde: technisch wint, dan aantoonbaar persoonlijk, de rest technisch.
 */
export const TECHNISCH_VOORVOEGSEL_BRON = '^(uitrol[._]|(server|deur)[._]|diag(nose)?[._]|(siem|audit)[._]|vault_|secret[._]|geheim|(integration|integratie)[._]|(beveiliging|bescherming)[._]|ssh[._-]|remote[._]|(agent[.]grant|grant)[._]|(tech|beheer|release)[._]|rook[._]|besluit[._])';
export const PRIVE_VOORVOEGSEL_BRON = '^(security|beveiliging_|passkey|login|session|sessie|herstel|recovery|access_(method|recovery|totp|decision)|toegang_|invite|uitnodig|mail|post|calendar|agenda|drive|cloud|photos|bestand|share|deel|workspace|ai_bevestiging|device|apparaat)';
const TECHNISCH_VOORVOEGSEL = new RegExp(TECHNISCH_VOORVOEGSEL_BRON);
const PRIVE_VOORVOEGSEL = new RegExp(PRIVE_VOORVOEGSEL_BRON);

/** Sfeer van een soort: tabel → expliciet; anders technisch voorvoegsel → persoonlijk voorvoegsel → 'technisch'. Zelfde regel als 0107. */
export function sfeerVanSoort(kind: unknown): MeldingSfeer {
  const k = String(kind || '').toLowerCase().slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(SFEER_PER_SOORT, k)) return SFEER_PER_SOORT[k];
  if (TECHNISCH_VOORVOEGSEL.test(k)) return 'technisch';
  return PRIVE_VOORVOEGSEL.test(k) ? 'prive' : 'technisch';
}
/** Staat de soort expliciet in het register? (De test eist dit voor elke soort die backend/ maakt.) */
export const isGeregistreerdeSoort = (kind: unknown) => Object.prototype.hasOwnProperty.call(SFEER_PER_SOORT, String(kind || '').toLowerCase());
/** Alle soorten uit shared/melding-soorten.ts die dit register NIET kent (moet leeg zijn — test). */
export const ontbrekendeSoorten = (): string[] => Object.keys(MELDING_SOORTEN).filter((k) => !isGeregistreerdeSoort(k));

/**
 * Sfeer van een NIEUWE melding: technische soort → technisch; persoonlijke soort in de TECHNISCHE lade (AI-bevestiging voor de
 * technische werkruimte, beveiligingsmelding uit een technisch tabblad) → technisch; anders prive. Dus: lade technisch ⇒ sfeer technisch.
 */
export const sfeerBijAanmaak = (kind: unknown, ladeRuimte?: unknown): MeldingSfeer =>
  sfeerVanSoort(kind) === 'technisch' || String(ladeRuimte ?? '') === 'technisch' ? 'technisch' : 'prive';

/**
 * Sfeer van een OPGESLAGEN melding: het veld `sfeer` als het er staat; anders (rij van vóór 0107, of een lokaal antwoord) dezelfde regel
 * als de migratie: lade technisch → technisch, anders de soort. Nooit undefined: elke rij hoort in precies één paneel.
 */
export function sfeerVanRij(rij: object | null | undefined): MeldingSfeer {
  const r = (rij || {}) as { sfeer?: unknown; ruimte?: unknown; kind?: unknown };
  if (isSfeer(r.sfeer)) return r.sfeer;
  if (String(r.ruimte ?? '') === 'technisch') return 'technisch';
  return sfeerVanSoort(r.kind);
}
/** Alleen de meldingen van deze sfeer (server én browser). */
export function meldingenVanSfeer<T extends object>(items: readonly T[] | null | undefined, sfeer: MeldingSfeer): T[] {
  return (Array.isArray(items) ? items : []).filter((m) => sfeerVanRij(m) === sfeer);
}

// ------------------------------------------------------------------------------------------------ activiteiten (bel «дії на сайті»)
/**
 * Auditacties die de SITE of de SERVER aangaan. Zelfde families als shared/beheer-journaal.ts (CATEGORIEEN) maar bewust als eigen lijst:
 * daar gaat het om de indeling van het logboek, hier om de vraag «mag dit in de bel van de MENS?». Alles wat hier niet staat en geen
 * technische context heeft, is persoonlijk (post, agenda, hmara, github, eigen sessies en toegang, eigen apparaten en browsers).
 */
// 23.10 (integratie): ook de matrix «Браузер і агенти» (zone E: owner.extensie.matrix, .modi) — wie welk browserslot mag gebruiken is
// beheer van AI-toegang; in de stand stonden ze als «Дія на сайті: extensie matrix» in de bel van de mens (precies de klacht van 22.10).
// SEC-002 (зауваження 4): mcp_console_token_* is een PRIVÉ AI-token van de mens zelf — niet technisch op naam (zijn token in de
// technische lade blijft technisch via details.ruimte). Postgres-regex (ARE) kent (?!…) ook: deze bron gaat ook naar de SQL-filter.
export const TECHNISCHE_ACTIE = /^(uitrol[._]|owner\.uitrol\.|goedkeur_|owner\.admin\.|admin[._]|owner\.tech\.|owner\.ruimte\.|owner\.flags\.|owner\.ondersteuning\.|owner\.impersonatie\.|impersonatie\.|secret\.|vault|google-contour|owner\.app\.|owner\.api\.|api-platform|mcp_(console_(?!token_)|backup|archive)|owner\.mcp\.(server|deur|duur)|owner\.terminal\.|owner\.ssh-ca\.|owner\.remote\.|diag[._]|owner\.diagnose|owner\.siem|siem[._]|owner\.system\.|owner\.server\.|rook[._]|besluit[._]|owner\.besluit|beheer\.|owner\.rls|owner\.audit|owner\.role\.|owner\.rol\.|owner_role|integration\.|tech[._]|owner\.extensie\.(beheer|matrix)|owner\.security\.emergency)/;
/** Ruis/eigen leesacties die nooit een melding zijn (zelfde idee als backend/site-activiteit.ts SKIP); hier alleen voor de sfeer-vraag. */
export type ActiviteitVoorSfeer = {
  kind?: unknown; type?: unknown; source?: unknown; ruimte?: unknown; sfeer?: unknown;
  /** Auditcontext (server/platform/audit.ts): `profiel`/`activatie` gezet = gedaan in het technische profiel. */
  context?: { profiel?: unknown; activatie?: unknown } | null;
  tool?: unknown;
};
/** Sfeer van een auditactie: technische context wint; anders de actiecode. */
export function sfeerVanAuditActie(action: unknown, context?: { profiel?: unknown; activatie?: unknown } | null): MeldingSfeer {
  if (context && (typeof context.profiel === 'string' && context.profiel || typeof context.activatie === 'string' && context.activatie)) return 'technisch';
  return TECHNISCHE_ACTIE.test(String(action || '')) ? 'technisch' : 'prive';
}
/**
 * Sfeer van één regel uit het activiteitenoverzicht (opdracht van een apparaat, aanroep van een hulpmiddel, toestemming, auditactie).
 * Een opgeslagen `sfeer` wint (de server zette hem); een apparaat met ruimte 'technisch' is technisch; een hulpmiddel van de beheerkant
 * (…_beheer, server./uitrol./admin.) ook; een auditactie volgt sfeerVanAuditActie.
 */
export function sfeerVanActiviteit(e: ActiviteitVoorSfeer | null | undefined): MeldingSfeer {
  if (!e) return 'technisch';
  if (isSfeer(e.sfeer)) return e.sfeer;
  if (String(e.ruimte ?? '') === 'technisch') return 'technisch';
  const kind = String(e.kind || ''), type = String(e.type || '');
  if (kind === 'site') return sfeerVanAuditActie(type, e.context);
  if (kind === 'tool') return /(_beheer$|^(beheer|server|uitrol|admin|siem|diag|tech)[._])/.test(type) || /(_beheer$)/.test(String(e.tool || '')) ? 'technisch' : 'prive';
  if (kind === 'command' || kind === 'grant') return 'prive';
  return 'technisch';
}
/**
 * Naam van een activiteit in de taal van de site, uit het beheerlogboek: het eigen label (ACTIE_LABELS), of — voor een TECHNISCHE
 * activiteit zonder label — de rubriek («Дія в розділі «Діагностика»»). Nooit de interne code («Дія на сайті: siem gelezen»: een
 * Nederlands identificatiewoord in de Oekraïense interface, review 21.10). null = geen naam uit het logboek (de bel valt terug op zijn eigen regel).
 */
export function activiteitNaamUitJournaal(type: unknown, lang: 'uk' | 'nl', technisch: boolean): string | null {
  const t = String(type || '').slice(0, 120);
  if (Object.prototype.hasOwnProperty.call(ACTIE_LABELS, t)) return actieLabel(t, lang);
  if (!technisch) return null;
  const c = categorieVan(t);
  if (c === 'overig') return lang === 'uk' ? 'Дія в технічному просторі' : 'Actie in de technische ruimte';
  return lang === 'uk' ? `Дія в розділі «${categorieNaam(c, 'uk')}»` : `Actie in «${categorieNaam(c, 'nl')}»`;
}

/** Alleen de activiteiten van deze sfeer. */
export function activiteitenVanSfeer<T extends ActiviteitVoorSfeer>(items: readonly T[] | null | undefined, sfeer: MeldingSfeer): T[] {
  return (Array.isArray(items) ? items : []).filter((e) => sfeerVanActiviteit(e) === sfeer);
}

/**
 * Soorten die NA migratie 0107 in het register kwamen en waarvan de sfeer al volgt uit de voorvoegsels van 0107 (PRIVE_VOORVOEGSEL_BRON /
 * TECHNISCH_VOORVOEGSEL_BRON, letterlijk ook in app.melding_sfeer). Ze staan niet in de letterlijke lijsten van 0107 (een toegepaste
 * migratie verandert niet), en een nieuwe migratie is niet nodig: de database geeft via het voorvoegsel dezelfde sfeer. De test
 * (meldingen-sferen) eist dat de voorvoegselregel voor elk van hen precies de geregistreerde sfeer geeft.
 */
export const NA_0107_VIA_VOORVOEGSEL: ReadonlySet<string> = new Set(['mail_queue_refused', 'mail_queue_cancelled', 'cloud_alleen_lezen', 'toegang_alleen_lezen', 'agenda', 'workspace_role_changed', 'workspace_ownership_transferred', 'workspace_access_revoked', 'workspace_invite_accepted', 'access_recovery_low', 'workspace_share_link_created', 'access_method_login', 'access_method_telefoon']);
/** Sfeer volgens alleen de voorvoegsels (de regel van 0107 voor een soort die niet in haar lijsten staat). */
export const sfeerVolgensVoorvoegsel = (kind: unknown): MeldingSfeer => {
  const k = String(kind || '').toLowerCase().slice(0, 80);
  if (TECHNISCH_VOORVOEGSEL.test(k)) return 'technisch';
  return PRIVE_VOORVOEGSEL.test(k) ? 'prive' : 'technisch';
};
/** Soorten per sfeer als gesorteerde lijsten voor migratie 0107 (de test vergelijkt de migratietekst letterlijk met dit register). */
export const TECHNISCHE_SOORTEN = Object.freeze(Object.keys(SFEER_PER_SOORT).filter((k) => SFEER_PER_SOORT[k] === 'technisch' && !NA_0107_VIA_VOORVOEGSEL.has(k)).sort());
export const PRIVE_SOORTEN = Object.freeze(Object.keys(SFEER_PER_SOORT).filter((k) => SFEER_PER_SOORT[k] === 'prive' && !NA_0107_VIA_VOORVOEGSEL.has(k)).sort());
/** De SQL-lijst zoals 0107 haar schrijft: 'a', 'b', … */
export const sqlLijst = (soorten: readonly string[]) => soorten.map((k) => `'${k.replace(/'/g, "''")}'`).join(', ');
