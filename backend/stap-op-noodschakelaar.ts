// SEC-002 (aanv-gat-a-04, 12.11.2026): de noodschakelaar van de step-up is nooit meer stil.
// Vroeger zette één regel STAP_OP_UIT=1 in /etc/mijn-ruimte/geheimen.env ALLE herbevestigingen (gewone en «sterke») uit, en nergens
// stond dat: geen regel bij de start, geen kaart in «Захист», niets in de diepe controle, geen journaalregel, geen melding. Wie de
// regel na een noodgeval vergat, had een site waarop een gestolen cookie genoeg was voor geheimen, rollen, SSH-certificaten enz.
// Nu, zolang de schakelaar aan staat:
//   - bij de start van de server een waarschuwing in het systeemlogboek en een regel in het beheerjournaal (admin.beveiliging.uit,
//     doel «stap-op»), en een melding aan de eigenaar in het meldingencentrum — elke 24 uur opnieuw, tot de schakelaar uit is;
//   - in «Захист» (POST /api/owner/beveiliging/stand, veld `stapOp`) en in de diepe gezondheidscontrole (veld `waarschuwingen`).
// Een ongeldig, verlopen of te ver STAP_OP_UIT_TOT wordt ook gemeld: dan staat de bevestiging AAN, maar de eigenaar denkt misschien van niet.
// Exploitatie-aanbeveling (deploy/DRAAIBOEK-*): STAP_OP_UIT_TOT=<tijdstip> (hoogstens 24 uur) in plaats van STAP_OP_UIT=1.
import { stapOpUitStand, STAP_OP_UIT_MAX_MS, type StapOpUitStand } from './stap-op';

export const STAP_OP_UIT_HERHAAL_MS = 24 * 60 * 60 * 1000;

/** Leesbare stand voor «Захист», de diepe controle en het logboek. `ernst`: 'rood' = bevestiging staat uit; 'oranje' = ingesteld maar genegeerd. */
export type StapOpUitKaart = StapOpUitStand & { ernst: '' | 'rood' | 'oranje'; tekst: [string, string]; totIso: string };
export function stapOpUitKaart(nu = Date.now(), env: Record<string, string | undefined> = process.env): StapOpUitKaart {
  const s = stapOpUitStand(nu, env);
  const totIso = s.tot > 0 ? new Date(s.tot).toISOString() : '';
  if (s.uit && s.bron === 'STAP_OP_UIT') return { ...s, ernst: 'rood', totIso, tekst: [
    '! Повторне підтвердження ВИМКНЕНО (STAP_OP_UIT=1) без кінцевого терміну: секрети, ролі, SSH-сертифікати, видалення акаунта й розблокування розширення виконуються з самим лише сеансом. Приберіть рядок із /etc/mijn-ruimte/geheimen.env і перезапустіть сервіс; на майбутнє — STAP_OP_UIT_TOT=<час> (не довше 24 год).',
    '! Herbevestiging staat UIT (STAP_OP_UIT=1) zonder einde: geheimen, rollen, SSH-certificaten, account verwijderen en de extensie ontgrendelen gaan met alleen een sessie. Haal de regel uit /etc/mijn-ruimte/geheimen.env en herstart de dienst; voortaan STAP_OP_UIT_TOT=<tijdstip> (hoogstens 24 uur).',
  ] };
  if (s.uit) return { ...s, ernst: 'rood', totIso, tekst: [
    `! Повторне підтвердження ВИМКНЕНО до ${totIso} (STAP_OP_UIT_TOT). Після цього часу воно ввімкнеться саме; приберіть рядок, щойно мине потреба.`,
    `! Herbevestiging staat UIT tot ${totIso} (STAP_OP_UIT_TOT). Daarna gaat ze vanzelf weer aan; haal de regel weg zodra het niet meer nodig is.`,
  ] };
  if (s.fout) {
    const reden: Record<string, [string, string]> = {
      ONGELDIG: ['значення не є повним часом ISO (наприклад, 2026-11-12T18:00:00Z)', 'de waarde is geen volledig ISO-tijdstip (bv. 2026-11-12T18:00:00Z)'],
      VERLOPEN: ['вказаний час уже минув', 'het opgegeven tijdstip is al voorbij'],
      TE_LANG: [`вказаний час далі ніж ${STAP_OP_UIT_MAX_MS / 3_600_000} год наперед`, `het opgegeven tijdstip ligt meer dan ${STAP_OP_UIT_MAX_MS / 3_600_000} uur vooruit`],
    };
    const [uk, nl] = reden[s.fout];
    return { ...s, ernst: 'oranje', totIso, tekst: [
      `STAP_OP_UIT_TOT задано, але не діє: ${uk}. Повторне підтвердження УВІМКНЕНО (STAP_OP_UIT=1 поруч теж не діє). Приберіть або виправте рядок.`,
      `STAP_OP_UIT_TOT staat ingesteld, maar werkt niet: ${nl}. Herbevestiging staat AAN (ook een STAP_OP_UIT=1 ernaast telt niet). Haal de regel weg of verbeter hem.`,
    ] };
  }
  return { ...s, ernst: '', totIso, tekst: ['', ''] };
}

type Deps = {
  log: (regel: string) => void;
  audit: (i: { actie: string; reden: string; na: Record<string, unknown> }) => Promise<unknown>;
  eigenaarId: () => Promise<string>;
  melden: (userId: string, titel: string, tekst: string) => Promise<unknown>;
};
const standaardDeps = (): Deps => ({
  log: (regel) => console.warn(regel),
  audit: async (i) => (await import('./audit-gebeurtenis')).schrijfBeheerAudit({ actor: null, doel: { soort: 'beveiliging', naam: 'stap-op' }, actie: i.actie, resultaat: 'success', reden: i.reden, na: i.na }),
  eigenaarId: async () => (await import('./integraties-kluis')).eigenaarUserId(),
  melden: async (userId, titel, tekst) => (await import('./melder')).meld(userId, 'beveiliging.zekering', titel, tekst, '/diagnostiek'),
});

/**
 * Eén ronde: meldt (logboek + journaal + eigenaar) als de schakelaar aan staat of een ingestelde tijdgrens niet werkt. Geeft terug wat er
 * gemeld is ('' = niets). Fouten in journaal of melding houden de waarschuwing in het logboek niet tegen. Tests geven eigen `deps` mee.
 */
export async function stapOpUitMelden(nu = Date.now(), env: Record<string, string | undefined> = process.env, deps: Partial<Deps> = {}): Promise<'' | 'rood' | 'oranje'> {
  const d = { ...standaardDeps(), ...deps };
  const k = stapOpUitKaart(nu, env);
  if (!k.ernst) return '';
  d.log(`[stap-op] ${k.tekst[1]}`);
  try {
    if (k.ernst === 'rood') await d.audit({ actie: 'admin.beveiliging.uit', reden: k.bron === 'STAP_OP_UIT' ? 'STAP_OP_UIT=1 (noodschakelaar zonder einde)' : `STAP_OP_UIT_TOT=${k.totIso}`, na: { stapOp: 'uit', bron: k.bron, tot: k.totIso || null } });
  } catch (e) { d.log(`[stap-op] journaalregel mislukt: ${(e as Error).message}`); }
  try {
    const id = await d.eigenaarId();
    if (id) await d.melden(id, k.ernst === 'rood' ? 'Повторне підтвердження вимкнено / Herbevestiging staat uit' : 'STAP_OP_UIT_TOT не діє / STAP_OP_UIT_TOT werkt niet', `${k.tekst[0]} / ${k.tekst[1]}`);
  } catch (e) { d.log(`[stap-op] melding mislukt: ${(e as Error).message}`); }
  return k.ernst;
}

/** Voor server/start.ts: één ronde kort na de start (database en melder klaar), daarna elke 24 uur zolang het proces loopt. */
export function stapOpUitBewaken(): void {
  const ronde = () => { void stapOpUitMelden().catch(() => undefined); };
  // Het logboek meteen (ook als de database niet bereikbaar is), de melding na 60 s.
  const k = stapOpUitKaart();
  if (k.ernst) console.warn(`[stap-op] ${k.tekst[1]}`);
  setTimeout(ronde, 60_000).unref();
  setInterval(ronde, STAP_OP_UIT_HERHAAL_MS).unref();
}
