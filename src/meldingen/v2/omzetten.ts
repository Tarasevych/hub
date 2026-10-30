// Meldingen v2 — de drie bestaande bronnen van het centrum (lokale meldingen, servermeldingen, activiteiten van agenten/browser/
// site) omzetten naar één V2Melding. GEEN nieuwe gegevensbron: precies dezelfde lijsten die CanoniekMeldingencentrum al heeft.
// Niets verzinnen: aanbieder en account alleen als de bron ze echt opgeeft (bron "mail:microsoft", velden account/accountLabel/
// provider op de rij). Het oude paneel gokte «Google» voor elke mail/cloud-melding; dat doen we hier niet.
import { activityCause, activityLink, activityTitle, sourceLabel, statusInfo, type ActivityEvent } from '../../connector-activiteit';
import { soortInfo } from '../../../shared/melding-soorten';
import { isKritiekType } from '../../../shared/melding-typen';
import type { Ernst, V2Melding } from '../../../shared/meldingen-v2/groepering';

type Lang = 'uk' | 'nl';
export type LokaleRij = { id: string; text: string; kind: 'info' | 'success' | 'warning' | 'error'; createdAt: number; source: string; read: boolean; link?: { href: string; label: string }; action?: unknown };
export type ServerRij = { id: string; kind: string; title: string; message: string; createdAt: number; read?: boolean; link?: string; sfeer?: 'prive' | 'technisch'; [k: string]: unknown };

const DIENST_VAN_SECTIE: Array<[RegExp, string]> = [
  [/^(mail|post|gmail|smtp|imap)/, 'post'], [/^(cloud|drive|bestand|onedrive|dropbox|workspace_share|delen|share)/, 'cloud'], [/^(calendar|agenda)/, 'agenda'],
  [/^(huis|home|ha[._])/, 'huis'], [/^github/, 'github'], [/^(ai|chat|claude|mcp|agent)/, 'ai'], [/^(identity|passkey|login|security|beveiliging|sessie|session|toegang|access|herstel|recovery|inzage)/, 'identity'],
  [/^browser/, 'browser'],
];
export const dienstVan = (bron: string): string => { const b = String(bron || '').toLowerCase(); for (const [re, d] of DIENST_VAN_SECTIE) if (re.test(b)) return d; return 'site'; };
const aanbiederUitBron = (bron: string) => { const p = String(bron || '').toLowerCase().split(':')[1]; return p && /^[a-z0-9-]{2,30}$/.test(p) ? p : undefined; };
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);

/** Proces-id: expliciet van de server, anders de soort zonder fase-achtervoegsel (adrescontrole.start / .einde → één item). */
const FASE = /[._-](start|begin|gestart|started|bezig|voortgang|progress|einde|klaar|done|finished|voltooid|mislukt|failed)$/i;
export function procesVan(kind: string, expliciet?: unknown): { procesId?: string; fase?: V2Melding['fase'] } {
  const e = str(expliciet);
  const m = String(kind || '').match(FASE);
  const fase = m ? (/start|begin|gestart|started/i.test(m[1]) ? 'start' : /bezig|voortgang|progress/i.test(m[1]) ? 'bezig' : 'einde') : undefined;
  if (e) return { procesId: e, fase };
  return m ? { procesId: String(kind).toLowerCase().replace(FASE, ''), fase } : {};
}
const ernstVanSoort = (kind: string): Ernst => (/error|fail|mislukt|fout/i.test(kind) ? 'fout' : /warn|attent|verzoek|request/i.test(kind) ? 'aandacht' : /success|ok|klaar|done|voltooid|einde/i.test(kind) ? 'succes' : 'info');

export function vanServer(r: ServerRij): V2Melding {
  const kind = String(r.kind || '');
  const { procesId, fase } = procesVan(kind, r.procesId);
  return {
    id: `s:${r.id}`, dienst: str(r.dienst) || dienstVan(kind), aanbieder: str(r.provider) || str(r.aanbieder), account: str(r.account), accountLabel: str(r.accountLabel),
    categorie: str(r.categorie) || kind.toLowerCase(), soort: kind.toLowerCase(), ernst: ernstVanSoort(kind), titel: r.title, tekst: r.message || undefined, tijd: Number(r.createdAt) || 0,
    gelezen: Boolean(r.read), toestand: r.opgelost ? 'opgelost' : r.gearchiveerd ? 'archief' : undefined, vraagtActie: /verzoek|request|bevestig|confirm/i.test(kind) || undefined,
    vraagtBevestiging: /bevestig|confirm/i.test(kind) || undefined, verplicht: r.verplicht === true || isKritiekType(soortInfo(kind).type) || undefined, procesId, fase, link: r.link, sfeer: r.sfeer, technischeTekst: kind, herkomst: 'server',
  };
}
export function vanLokaal(r: LokaleRij): V2Melding {
  const ernst: Ernst = r.kind === 'error' ? 'fout' : r.kind === 'warning' ? 'aandacht' : r.kind === 'success' ? 'succes' : 'info';
  return { id: `l:${r.id}`, dienst: dienstVan(r.source), aanbieder: aanbiederUitBron(r.source), categorie: String(r.source || '').toLowerCase(), soort: String(r.source || '').toLowerCase(), ernst, titel: r.text, tijd: r.createdAt, gelezen: r.read, link: r.link?.href, vraagtActie: r.action ? true : undefined, herkomst: 'lokaal' };
}
export function vanActiviteit(e: ActivityEvent, lang: Lang, gelezen: boolean): V2Melding {
  const st = statusInfo(e.status, lang);
  const ernst: Ernst = st.group === 'failed' ? 'fout' : st.group === 'waiting' ? 'aandacht' : st.group === 'done' || e.kind === 'grant' ? 'succes' : 'info';
  const dienst = e.kind === 'site' ? dienstVan(e.source) : e.source === 'browser' ? 'browser' : 'ai';
  const l = activityLink(e, lang);
  return {
    id: `a:${e.id}`, dienst, categorie: `${e.kind}.${e.type}`.toLowerCase(), soort: `${e.kind}.${e.type}`.toLowerCase(), ernst, titel: activityTitle(e, lang), tekst: activityCause(e, lang) || undefined, tijd: e.createdAt, gelezen,
    vraagtActie: st.group === 'waiting' || undefined, toestand: st.group === 'done' ? 'opgelost' : undefined,
    // Eén proces per (bron, soort, onderwerp): tientallen «gestart/klaar» van dezelfde opdracht worden één item met geschiedenis.
    procesId: `${e.source}|${e.kind}|${e.type}|${e.subject || ''}`.toLowerCase(), link: l.href || undefined, sfeer: e.sfeer, technischeTekst: [e.type, e.code, e.reden, e.tool].filter(Boolean).join(' · ') || undefined,
    // UI-014: wie en waarop — rechtstreeks uit de bron (agentnaam, bestandspad, ruimte), niets verzonnen.
    herkomst: 'activiteit', wie: str(e.kind === 'command' ? `${sourceLabel(e.source, lang)} «${e.subject}»` : e.client || (e.kind === 'site' ? '' : sourceLabel(e.source, lang))),
    object: str(e.doel), eind: str(e.eind),
  };
}
