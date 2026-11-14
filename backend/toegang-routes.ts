// Routes voor «Способи входу» rond toegangssleutels in context (§13.10): privénotities, één wijziging bekijken (link uit de
// melding «Це були ви?») en «Це був не я — скасувати та захистити акаунт» (terugdraaien wat technisch kan + de sessie die de
// wijziging deed intrekken). Zie backend/toegang-context.ts.
import { error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import type { RouterMiddleware } from '../server/platform/router';
import { meld } from './melder';
import { isEigenaarGebruiker, passkeyHerstellen, type PasskeyAuth } from './toegangssleutels';
import { ToegangFout, notitieOpslaan, notitiesLijst, sessieInfo, sessieIntrekken, sterkeStapOpFout, wijzigingMetHerstel, wijzigingOngedaanMaken, wijzigingenVoor } from './toegang-context';
import { UitrolFout, aanmeldingSchrijven, intrekkenAnnuleren, intrekkenLopend, leesSleutels, sshOpdracht } from './uitrol-goedkeuring';
import { alsGebruiker } from './ai-toestemmingen';

type SessionOk = PasskeyAuth;
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Resp = ReturnType<typeof json>;
type Ctx = { event: Record<string, unknown>; body: unknown };
export type ToegangRouteDeps = { requireSession: RequireSession; sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const DIENSTEN = new Set(['identity', 'admin', 'hub']);
const fout = (code: string, status = 400, retryAfter?: number): never => { throw new ToegangFout(code, status, retryAfter); };

/** Huidige stand van een goedkeur-sleutel (voor de pagina met de wijziging). */
async function stand(userId: string, fp: string) {
  if (!/^[0-9a-f]{64}$/.test(fp)) return null;
  const [b, lopend, rij] = await Promise.all([leesSleutels(), intrekkenLopend(fp),
    alsGebruiker(userId, async (q) => (await q('SELECT id, naam FROM app.passkeys WHERE user_id = $1 AND vingerafdruk = $2', [userId, fp])).rows[0] as { id: string; naam: string } | undefined)]);
  const inRoot = b.sleutels.some((s) => s.vingerafdruk === fp);
  return { recht: lopend ? 'wordt-ingetrokken' : inRoot ? 'kan-goedkeuren' : 'ingetrokken', passkeyAanwezig: !!rij, passkeyId: rij ? String(rij.id) : null, sshOpdracht: sshOpdracht(fp) };
}

/** «Це був не я»: terugdraaien wat kan, de sessie van de wijziging intrekken, alles vastleggen en melden. */
export async function wijzigingTerugdraaien(auth: SessionOk, id: unknown) {
  const { rij, herstel, sessies } = await wijzigingMetHerstel(auth.user.id, id);
  if (rij.ongedaanOp) fout('AL_TERUGGEDRAAID', 409);
  if (rij.soort === 'goedkeur-recht-aangevraagd') fout('NIET_TERUG_TE_DRAAIEN', 409);
  // Een voorbereider-recht geeft alleen de eigenaar (opnieuw) — de getroffen gebruiker kan het niet zelf terugzetten.
  if (rij.soort === 'voorbereider-ingetrokken') fout('ALLEEN_EIGENAAR_KAN_HERSTELLEN', 409);
  if (!isEigenaarGebruiker(auth.user)) fout('OWNER_REQUIRED', 403);
  const fp = rij.vingerafdruk;
  const uitkomst: Record<string, unknown> = {};
  // 1. Heeft root het intrekverzoek nog niet verwerkt? Dan weghalen: het recht blijft gewoon bestaan.
  const geannuleerd = fp ? await intrekkenAnnuleren(fp) : false;
  // 2. Verwijderde passkey terugzetten (publieke sleutel; dezelfde id).
  if (rij.soort === 'goedkeur-passkey-verwijderd' && herstel) uitkomst.passkeyTerug = await passkeyHerstellen(auth.user.id, herstel);
  // 3. Al door root verwerkt: opnieuw aanmelden; root neemt een via de app ingetrokken sleutel ALLEEN via SSH terug.
  const nu = await stand(auth.user.id, fp);
  if (geannuleerd || nu?.recht === 'kan-goedkeuren') uitkomst.recht = 'behouden';
  else if (fp && nu?.passkeyAanwezig) {
    const p = await alsGebruiker(auth.user.id, async (q) => (await q('SELECT credential_id, alg, jwk, naam, aaguid FROM app.passkeys WHERE user_id = $1 AND vingerafdruk = $2', [auth.user.id, fp])).rows[0]);
    try {
      if (p) await aanmeldingSchrijven({ id: auth.user.id, email: auth.user.email }, { credentialId: p.credential_id, alg: p.alg, jwk: p.jwk, label: p.naam, aaguid: p.aaguid });
      uitkomst.recht = 'ssh-nodig'; uitkomst.sshOpdracht = sshOpdracht(fp);
    } catch (e) { uitkomst.recht = (e as UitrolFout).code === 'PASSKEY_BESTAAT_AL' ? 'behouden' : 'niet-hersteld'; }
  } else uitkomst.recht = 'niet-hersteld';
  // 4. De sessie die de wijziging deed intrekken (niet de huidige).
  const s = await sessieIntrekken(auth.user.id, sessies, sessieInfo(auth));
  uitkomst.sessie = s.overgeslagen ? 'huidige-sessie' : (s.tab || s.anker || s.grant) ? 'ingetrokken' : 'al-beeindigd';
  if (!(await wijzigingOngedaanMaken(rij.id, auth.user.email || auth.user.id, uitkomst))) fout('AL_TERUGGEDRAAID', 409);
  await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'toegang_wijziging_ongedaan', type: 'beveiliging', result: 'success', service: auth.service,
    details: { wijziging: rij.id, soort: rij.soort, vingerafdruk: fp.slice(0, 16), label: rij.label, recht: uitkomst.recht, teruggezet: uitkomst.passkeyTerug ?? null, sessieVanWijziging: rij.sessieId, sessieIngetrokken: uitkomst.sessie } }).catch(() => undefined);
  await meld(auth.user.id, 'security', 'Зміну скасовано / Wijziging teruggedraaid',
    `«${rij.label}»: ${uitkomst.recht === 'behouden' ? 'право збережено' : uitkomst.recht === 'ssh-nodig' ? 'повернути право можна лише через SSH-команду' : 'право не відновлено'}; сесію, що зробила зміну, ${uitkomst.sessie === 'ingetrokken' ? 'завершено' : 'не змінено'}. / «${rij.label}»: ${uitkomst.recht === 'behouden' ? 'recht behouden' : uitkomst.recht === 'ssh-nodig' ? 'het recht terugzetten kan alleen met de SSH-opdracht' : 'recht niet teruggezet'}; de sessie die de wijziging deed is ${uitkomst.sessie === 'ingetrokken' ? 'beëindigd' : 'niet gewijzigd'}.`,
    `https://id.tarasevych.com/methods?wijziging=${rij.id}`);
  return { ok: true, uitkomst, wijziging: (await wijzigingMetHerstel(auth.user.id, rij.id)).rij, stand: await stand(auth.user.id, fp) };
}

export function toegangRoutes(deps: ToegangRouteDeps): Record<string, RouterMiddleware[]> {
  const route = (opts: { sterk?: boolean }, run: (auth: SessionOk, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    if (!DIENSTEN.has(auth.service)) return error('SERVICE_NOT_ALLOWED', 403);
    if (opts.sterk) {
      const su = deps.sterkeStapOp ? await deps.sterkeStapOp(ctx, auth) : await (async () => { const f = await sterkeStapOpFout(auth); return f ? error(f, 403) : null; })();
      if (su) return su;
    }
    try { return json(await run(auth, lichaam(ctx.body))); }
    catch (err) {
      if (err instanceof ToegangFout) return error(err.code, err.status, err.retryAfter ? { retryAfter: err.retryAfter } : undefined);
      if (err instanceof UitrolFout) return error(err.code, err.status);
      console.error('[toegang]', (err as Error).message);
      return error('TOEGANG_FOUT', 500);
    }
  }) as RouterMiddleware;
  const A = '/api/owner/access';
  return {
    [`POST ${A}/notities/lijst`]: [route({}, async (a) => ({ notities: await notitiesLijst(a.user.id) }))],
    [`POST ${A}/notities/opslaan`]: [route({}, async (a, b) => {
      const limiet = await rateLimit(`toegang-notitie:${a.user.id}`, 60, 600);
      if (!limiet.ok) fout('RATE_LIMITED', 429, limiet.retryAfter);
      return { notitie: await notitieOpslaan(a.user.id, b) };
    })],
    [`POST ${A}/toegang/wijzigingen`]: [route({}, async (a) => ({ wijzigingen: await wijzigingenVoor(a.user.id) }))],
    [`POST ${A}/toegang/wijziging`]: [route({}, async (a, b) => {
      const { rij } = await wijzigingMetHerstel(a.user.id, b.id);
      return { wijziging: rij, stand: rij.vingerafdruk ? await stand(a.user.id, rij.vingerafdruk) : null, kanTerugdraaien: !rij.ongedaanOp && rij.soort !== 'goedkeur-recht-aangevraagd' && rij.soort !== 'voorbereider-ingetrokken' && isEigenaarGebruiker(a.user) };
    })],
    [`POST ${A}/toegang/wijziging/terugdraaien`]: [route({ sterk: true }, async (a, b) => {
      const limiet = await rateLimit(`toegang-terug:${a.user.id}`, 10, 600);
      if (!limiet.ok) fout('RATE_LIMITED', 429, limiet.retryAfter);
      return wijzigingTerugdraaien(a, b.id);
    })],
  };
}
