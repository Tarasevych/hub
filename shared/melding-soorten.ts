// Eén tabel voor ELKE meldingssoort (kind) die de server maakt (18.10.2026, verzoek eigenaar: meldingen voor de gebruiker los van de
// beheermeldingen). Per soort: type (shared/melding-typen.ts: voorkeuren geluid/opduiken/tonen), ruimte (persoonlijk of technisch),
// ernst (filter in het technische paneel) en — voor technische soorten — welke technische mogelijkheid je nodig hebt om hem te zien.
//
// Regels:
//  • De server levert een technische melding ALLEEN aan een account met een technisch profiel dat de vereiste mogelijkheid heeft
//    (de eigenaar heeft ze allemaal). Een gewoon account krijgt ze nooit, ook niet als teller.
//  • Onbekende soorten: eerst de voorvoegsels (tech./uitrol./beheer./…), anders persoonlijk «Інше» (veilige richting).
//  • Nieuwe soort? Voeg hem hier toe. tests/eenheid/melding-soorten.test.ts zoekt alle notify()/meld()-aanroepen in backend/ en
//    faalt bij een soort die niet in deze tabel staat.
// Puur: dezelfde regel in de browser, op de server en in tests.
import type { TechMogelijkheid } from './tech-rollen';
import { MELDING_TYPES, voorkeurVoor, type MeldingErnst, type MeldingRuimteType, type MeldingType, type TypeVoorkeur } from './melding-typen';

export type SoortInfo = { type: MeldingType; ernst: MeldingErnst; vereist?: TechMogelijkheid };

/** Elke soort die backend/ vandaag maakt (zie test) + de vaste technische soorten van vroeger (shared/meldingen-ruimte.ts). */
export const MELDING_SOORTEN: Readonly<Record<string, SoortInfo>> = Object.freeze({
  // ------------------------------------------------------------ persoonlijk: eigen account
  security: { type: 'beveiliging', ernst: 'kritiek' },                     // passkey toegevoegd/verwijderd, toegangscode gebruikt, wijziging teruggedraaid
  security_warning: { type: 'beveiliging', ernst: 'kritiek' },             // nieuw apparaat, sessies ingetrokken, «Це були ви?»
  access_method_unlinked: { type: 'beveiliging', ernst: 'kritiek' },
  access_method_restored: { type: 'beveiliging', ernst: 'belangrijk' },
  access_recovery_code_used: { type: 'beveiliging', ernst: 'kritiek' },
  access_recovery_rotated: { type: 'beveiliging', ernst: 'belangrijk' },
  access_recovery_revoked: { type: 'beveiliging', ernst: 'belangrijk' },
  access_totp_enrolled: { type: 'beveiliging', ernst: 'belangrijk' },
  access_totp_replaced: { type: 'beveiliging', ernst: 'kritiek' },
  account_email_conflict: { type: 'beveiliging', ernst: 'kritiek' },
  owner_identity_mismatch: { type: 'beveiliging', ernst: 'kritiek' },
  access_decision: { type: 'toegang', ernst: 'belangrijk' },               // mijn eigen toegangsverzoek is beslist
  workspace_share: { type: 'delen', ernst: 'info' },
  cloud_alleen_lezen: { type: 'cloud', ernst: 'info' },                     // SEC-002 (g03, afwerking A): schrijven geweigerd — rol «лише перегляд»
  toegang_alleen_lezen: { type: 'toegang', ernst: 'info' },               // SEC-002 (slot «u»): schrijven buiten de hmara geweigerd — rol «лише перегляд»
  agenda: { type: 'agenda', ernst: 'info' },                             // agenda: grens bereikt, CalDAV afgekapt (backend/agenda-routes.ts, agenda-caldav.ts) — nu expliciet
  impersonatie: { type: 'inzage', ernst: 'kritiek' },                      // een beheerder vraagt mijn account in te zien
  ondersteuning: { type: 'inzage', ernst: 'belangrijk' },                  // ondersteuning vraagt een overzicht
  ai_bevestiging: { type: 'ai', ernst: 'belangrijk' },                    // een AI vraagt uw bevestiging op de site (backend/ai-bevestiging.ts)
  mail_queue_refused: { type: 'post', ernst: 'belangrijk' },               // SEC-002 (g10c): gepland bericht niet verzonden (ruimte mocht niet meer verzenden)
  mail_queue_cancelled: { type: 'post', ernst: 'info' },                   // SEC-002 (g10c): geplande berichten geannuleerd
  // ------------------------------------------------------------ technisch: beheer van de site
  access_request: { type: 'tech.toegang', ernst: 'belangrijk', vereist: 'users.manage' },
  google_login_config: { type: 'tech.integraties', ernst: 'kritiek', vereist: 'diensten.beheren' },
  mcp_app_secret: { type: 'tech.geheimen', ernst: 'belangrijk', vereist: 'diensten.beheren' },
  vault_key_expiring: { type: 'tech.geheimen', ernst: 'belangrijk', vereist: 'diensten.beheren' },
  vault_key_expired: { type: 'tech.geheimen', ernst: 'kritiek', vereist: 'diensten.beheren' },
  'beveiliging.zekering': { type: 'tech.bescherming', ernst: 'kritiek', vereist: 'diensten.beheren' },
  'impersonatie.beheerder': { type: 'tech.impersonatie', ernst: 'info', vereist: 'impersonatie.aanvragen' },
  'uitrol.mislukt': { type: 'tech.uitrol-mislukt', ernst: 'kritiek', vereist: 'uitrol.voorbereiden' },
  uitrol: { type: 'tech.uitrol', ernst: 'info', vereist: 'uitrol.voorbereiden' },
  uitrol_voorstel: { type: 'tech.uitrol', ernst: 'info', vereist: 'uitrol.voorbereiden' },
  release: { type: 'tech.uitrol', ernst: 'info', vereist: 'uitrol.voorbereiden' },
  server: { type: 'tech.server', ernst: 'belangrijk', vereist: 'diagnose.lezen' },
  deur: { type: 'tech.server', ernst: 'belangrijk', vereist: 'diagnose.lezen' },
  siem: { type: 'tech.audit', ernst: 'belangrijk', vereist: 'journaal.lezen' },
});

/** Voorvoegsels voor soorten die nog niet in de tabel staan (zelfde regel als vroeger in meldingen-ruimte.ts). */
const VOORVOEGSELS: Array<[RegExp, SoortInfo]> = [
  [/^uitrol[._]/, { type: 'tech.uitrol', ernst: 'info', vereist: 'uitrol.voorbereiden' }],
  [/^(server|deur)[._]/, { type: 'tech.server', ernst: 'belangrijk', vereist: 'diagnose.lezen' }],
  [/^diag(nose)?[._]/, { type: 'tech.diagnose', ernst: 'info', vereist: 'diagnose.lezen' }],
  [/^(siem|audit)[._]/, { type: 'tech.audit', ernst: 'info', vereist: 'journaal.lezen' }],
  [/^(vault_|secret[._]|geheim)/, { type: 'tech.geheimen', ernst: 'belangrijk', vereist: 'diensten.beheren' }],
  [/^(integration|integratie)[._]/, { type: 'tech.integraties', ernst: 'info', vereist: 'diensten.beheren' }],
  [/^(beveiliging|bescherming)[._]/, { type: 'tech.bescherming', ernst: 'kritiek', vereist: 'diensten.beheren' }],
  [/^ssh[._-]/, { type: 'tech.ssh', ernst: 'belangrijk', vereist: 'ssh.host' }],
  [/^remote[._]/, { type: 'tech.remote', ernst: 'belangrijk', vereist: 'terminal.servers' }],
  [/^(agent\.grant|grant)[._]/, { type: 'tech.grants', ernst: 'info', vereist: 'diensten.beheren' }],
  [/^(tech|beheer|release)[._]/, { type: 'tech.server', ernst: 'info', vereist: 'diagnose.lezen' }],
  // persoonlijk
  [/^(security|beveiliging_|passkey|login|session|sessie|herstel|recovery|access_(method|recovery|totp))/, { type: 'beveiliging', ernst: 'belangrijk' }],
  [/^(access|toegang|invite|uitnodig)/, { type: 'toegang', ernst: 'info' }],
  [/^(mail|post)/, { type: 'post', ernst: 'info' }],
  [/^(calendar|agenda)/, { type: 'agenda', ernst: 'info' }],
  [/^(drive|cloud|photos|bestand)/, { type: 'cloud', ernst: 'info' }],
  [/^(share|deel|workspace)/, { type: 'delen', ernst: 'info' }],
  [/^(ai|agent|mcp|connector)/, { type: 'ai', ernst: 'info' }],
  [/^(device|apparaat|extensie|extension)/, { type: 'apparaten', ernst: 'info' }],
];
const OVERIG: SoortInfo = { type: 'systeem', ernst: 'info' };

/** Bekend in de tabel of via een voorvoegsel? (Voor de test: elke serversoort moet expliciet in de tabel staan.) */
export const isBekendeSoort = (kind: unknown) => Object.prototype.hasOwnProperty.call(MELDING_SOORTEN, String(kind || '').toLowerCase());

export function soortInfo(kind: unknown): SoortInfo {
  const k = String(kind || '').toLowerCase().slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(MELDING_SOORTEN, k)) return MELDING_SOORTEN[k];
  for (const [re, info] of VOORVOEGSELS) if (re.test(k)) return info;
  return OVERIG;
}
export const ruimteVanType = (t: MeldingType): MeldingRuimteType => MELDING_TYPES[t].ruimte;
export const soortRuimte = (kind: unknown): MeldingRuimteType => ruimteVanType(soortInfo(kind).type);

/** Lokale meldingen (toasts van de diensten zelf, emitCanonicalNotice) hebben geen soort maar een bron: bron → type. */
export function typeVanBron(bron: unknown): MeldingType {
  const b = String(bron || '').toLowerCase();
  if (/^(mail|message|row_|reader|selection|concepten|body|action_undo|provider|initials|custom|missing|manual)/.test(b)) return 'post';
  if (/^calendar/.test(b)) return 'agenda';
  if (/^(drive|photos|cloud|binary-recovery)/.test(b)) return 'cloud';
  if (/^(mcp|agent|ai|connector)/.test(b)) return 'ai';
  if (/^(recovery|security|passkey)/.test(b)) return 'beveiliging';
  if (/^(uitrol|release)/.test(b)) return 'tech.uitrol';
  if (/^vault/.test(b)) return 'tech.geheimen';
  return 'systeem';
}

/** Wie ontvangt: eigenaar (alles) of een technisch profiel met deze mogelijkheden; zonder profiel: niets technisch. */
export type Ontvanger = { eigenaar?: boolean; techProfiel: boolean; mogelijkheden: readonly string[] };

/** Mag deze ontvanger deze melding zien? Persoonlijke meldingen: altijd. Technische: alleen met profiel én de vereiste mogelijkheid. */
export function zichtbaarVoor(kind: unknown, wie: Ontvanger): boolean {
  const s = soortInfo(kind);
  if (ruimteVanType(s.type) === 'prive') return true;
  if (wie.eigenaar) return true;
  if (!wie.techProfiel) return false;
  return !s.vereist || wie.mogelijkheden.includes(s.vereist);
}

export function filterVoorOntvanger<T extends object>(items: readonly T[], wie: Ontvanger): T[] {
  return items.filter((m) => zichtbaarVoor((m as { kind?: unknown } | null)?.kind, wie));
}

/** Effectieve voorkeur (geluid/opduiken/tonen) voor een serversoort, volgens de keuzes van de gebruiker. */
export const voorkeurVoorSoort = (kind: unknown, v: Partial<Record<MeldingType, TypeVoorkeur>> | undefined): TypeVoorkeur => voorkeurVoor(v, soortInfo(kind).type);
