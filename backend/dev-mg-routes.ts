// Routes van de rechten die op 21.10.2026 uit «in ontwikkeling» kwamen (besluit van de eigenaar) en GEEN GitHub-route zijn:
//
//   POST /api/owner/media/afbeelding        image_generate     lokale generator → hmara (achtergrondopdracht, `job_id`)
//   POST /api/owner/media/diagram           diagram_generate   Mermaid controleren → .mmd in de hmara
//   POST /api/owner/media/ontwerp-context   screenshot_design  tokens, palet van deze mens, primitieven — alleen stijlen
//   POST /api/owner/betalingen/stripe       payments_list      Stripe, alleen lezen, beperkte sleutel uit de kluis
//   POST /api/owner/apps/eigen-domein       app_domain         voorstel → bevestiging op de site (passkey) → Caddy-route
//   POST /api/owner/admin/media-generator/{stand,opslaan,controleer}   instelling van de lokale generator (alleen de eigenaar)
//
// De AI komt hier ALLEEN via de hulpmiddelen (backend/site-hulpmiddelen.ts → backend/site-aanroep.ts, gedelegeerde sessie van precies deze
// mens); de mens zelf kan de media-routes ook vanaf de site gebruiken. De hmara-routes lopen door de lade-poort van de dienst
// «cloud» (backend/ruimte-cloud-agenda.ts → ladePoort): uit / bevroren / niet gekozen = geen schrijven, met uitleg.
import { error, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import type { RouterMiddleware } from '../server/platform/router';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { ladePoort } from './ruimte-cloud-agenda';
import { cloudAiBestandOpslaan } from './cloud-platform';
import { controleerMermaid, mermaidBestandsnaam } from '../shared/mermaid-schema';
import { normaliseerGenerator } from '../shared/media-generator';
import {
  beeldVraag, controleerGenerator, genereer, leesGeneratorInstelling, opdrachtStand, startOpdracht, zetGeneratorInstelling,
} from './media-generator';
import { ontwerpContext } from './ontwerp-context';
import { stripeLijst } from './betalingen-stripe';
import { huidigeRuimte } from './mcp-namens';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { metStapOpEenmalig, passkeyStapOpGeldig, type StapOpAuth } from './stap-op';
import { denyMutation } from './rbac';
import { isEigenaar } from './tech-profiel';

type Gebruiker = { id: string; email: string; role?: string; status: string };
type SessieOk = StapOpAuth & { service: string; user: Gebruiker };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessieOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const lijf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const openLink = (id: string) => `https://${SERVICE_HOSTS.cloud}/?open_item_id=${encodeURIComponent(id)}`;
const slug = (t: string) => String(t || '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'afbeelding';

export function devMgRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  /** Sessie (ook de gedelegeerde van een AI), goedgekeurd account, een van de toegestane diensten, en een limiet. */
  const mens = (diensten: readonly string[], emmer: string, max: number, run: (auth: SessieOk, b: Record<string, unknown>, ctx: Ctx) => Promise<ReturnType<typeof json>>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('OWNER_APPROVED_SESSION_REQUIRED', 403);
    if (!diensten.includes(auth.service)) return error('DIENST_NIET_TOEGESTAAN', 403);
    if (!(await rateLimit(`dev-mg:${emmer}:${auth.user.id}`, max, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
    try { return await run(auth, lijf(ctx.body), ctx); }
    catch (e) { const c = (e as Error).message || ''; if (/^[A-Z][A-Z0-9_]{2,60}$/.test(c)) return error(c, 400); console.error('[dev-mg]', c); return error('DEV_MG_FOUT', 500); }
  }) as RouterMiddleware;

  // ---- de hmara: beeld en schema (door de lade-poort van «cloud») ----
  const hmara = ladePoort('cloud', deps.requireSession as never, ({
    'POST /api/owner/media/afbeelding': [mens(['cloud'], 'beeld', 20, async (auth, b) => {
      if (typeof b.job_id === 'string' && b.job_id) return json(opdrachtStand(auth.user.id, b.job_id.slice(0, 40)));
      // SEC-002 (g03, afwerking A): schrijfrecht op de hmara VÓÓR het (dure) genereren weigeren, niet pas bij het opslaan.
      { const geweigerd = denyMutation(auth.user as never, 'cloud.write'); if (geweigerd) return geweigerd; }
      const inst = await leesGeneratorInstelling();
      if (!inst.url) return error('MEDIA_GENERATOR_NIET_INGESTELD', 409);
      if (!inst.aan) return error('MEDIA_GENERATOR_UIT', 409);
      const v = beeldVraag(b, inst);
      if (!v.ok) return error(`MEDIA_INVOER:${v.fout}`, 400);
      const titel = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : v.vraag.prompt.slice(0, 80);
      const userId = auth.user.id;
      const stand = await startOpdracht(userId, async () => {
        const beeld = await genereer(inst, v.vraag);
        const ext = beeld.mime === 'image/png' ? 'png' : beeld.mime === 'image/webp' ? 'webp' : 'jpg';
        const item = await cloudAiBestandOpslaan(userId, {
          filename: `${slug(titel)}.${ext}`, mimeType: beeld.mime, bytes: beeld.bytes, titel, bron: 'image_generate',
          beschrijving: `Локальний генератор / lokale generator · ${v.vraag.width}×${v.vraag.height}${beeld.seed !== null ? ` · seed ${beeld.seed}` : ''} · ${v.vraag.prompt}`.slice(0, 500),
          tags: ['ai-afbeelding'], tekst: v.vraag.prompt,
        });
        return { itemId: (item as { id: string }).id, title: titel, mimeType: beeld.mime, bytes: beeld.bytes.length, width: v.vraag.width, height: v.vraag.height, seed: beeld.seed, model: beeld.model || null, open: openLink((item as { id: string }).id), savedTo: 'cloud' };
      });
      if (!('job_id' in stand)) return error(stand.error, 429);
      return json(stand);
    })],
    'POST /api/owner/media/diagram': [mens(['cloud'], 'schema', 60, async (auth, b) => {
      { const geweigerd = denyMutation(auth.user as never, 'cloud.write'); if (geweigerd) return geweigerd; }
      const o = controleerMermaid(b.code);
      if (!o.ok) return json({ error: o.code, regel: o.regel, uitleg: o.uitleg }, 400);
      const titel = (typeof b.title === 'string' && b.title.trim() ? b.title.trim() : o.titel || `Mermaid ${o.type}`).slice(0, 120);
      const item = await cloudAiBestandOpslaan(auth.user.id, {
        filename: mermaidBestandsnaam(titel), mimeType: 'text/plain', bytes: Buffer.from(o.code, 'utf8'), titel, bron: 'diagram_generate',
        beschrijving: typeof b.summary === 'string' ? b.summary.slice(0, 500) : `Mermaid · ${o.type}`, tags: ['mermaid', 'schema'], tekst: o.code,
      }) as { id: string };
      return json({ itemId: item.id, title: titel, type: o.type, lines: o.regels, file: mermaidBestandsnaam(titel), open: openLink(item.id), savedTo: 'cloud', rendered: 'in the browser by the site (bundled Mermaid, securityLevel strict)' });
    })],
  }) as never) as unknown as Record<string, RouterMiddleware[]>;

  return {
    ...hmara,
    'POST /api/owner/media/ontwerp-context': [mens(['hub', 'cloud', 'ai', 'mcp'], 'ontwerp', 120, async (auth, b) => json(await ontwerpContext(auth.user.id, { sectie: typeof b.sectie === 'string' ? b.sectie : undefined })))],
    'POST /api/owner/betalingen/stripe': [mens(['hub', 'api'], 'stripe', 120, async (auth, b) => {
      const r = await stripeLijst(auth.user.id, b);
      return r.ok ? json(r.data) : error(r.error, r.status);
    })],
    'POST /api/owner/apps/eigen-domein': [mens(['mcp', 'admin'], 'domein', 20, async (auth, b) => {
      const { domeinVoorstelRoute } = await import('./dev-mg-bevestiging');
      const r = await domeinVoorstelRoute(auth.user.id, huidigeRuimte(), b);
      return r.ok ? json(r.data) : error(r.error, r.status);
    })],

    // ---- instelling van de lokale generator: alleen de eigenaar; opslaan met een verse passkey ----
    'POST /api/owner/admin/media-generator/stand': [beheer(deps, false, async () => ({ instelling: await leesGeneratorInstelling() }))],
    'POST /api/owner/admin/media-generator/controleer': [beheer(deps, false, async (_a, b) => {
      const n = normaliseerGenerator({ ...b, aan: true });
      if (!n.ok) return { ok: false, code: n.code, detail: '' };
      return controleerGenerator(n.instelling);
    })],
    'POST /api/owner/admin/media-generator/opslaan': [beheer(deps, true, async (a, b) => {
      const n = normaliseerGenerator(b);
      if (!n.ok) throw new Error(n.code);
      await zetGeneratorInstelling(n.instelling, a.user.email || a.user.id);
      await schrijfBeheerAudit({ actor: { id: a.user.id, email: a.user.email }, doel: { soort: 'integratie', id: 'media-generator', naam: 'Локальний генератор зображень' }, actie: 'integration.media-generator.opgeslagen', na: n.instelling.aan ? 'aan' : 'uit', resultaat: 'success', details: { soort: n.instelling.soort, aan: n.instelling.aan } }).catch(() => undefined);
      return { ok: true, instelling: await leesGeneratorInstelling() };
    })],
  };
}

/** Eigenaar op admin.*, en voor `passkey` een verse passkey (één keer te gebruiken). */
function beheer(deps: { requireSession: RequireSession }, passkey: boolean, run: (auth: SessieOk, b: Record<string, unknown>) => Promise<unknown>): RouterMiddleware {
  return (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!isEigenaar(auth.user as never)) return error('OWNER_REQUIRED', 403);
    try {
      // SEC-002 (g06): controleren en verbruiken ondeelbaar; bij een fout van run() teruggezet.
      const stap = await metStapOpEenmalig(auth, passkey ? passkeyStapOpGeldig : null, () => run(auth, lijf(ctx.body)));
      if (!stap.ok) return json({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED', methods: ['passkey'], maxAgeSeconds: 300 }, 403);
      return json(stap.uit);
    } catch (e) {
      const c = (e as Error).message || '';
      if (/^[A-Z][A-Z0-9_]{2,60}$/.test(c)) return error(c, 400);
      console.error('[media-generator]', c); return error('MEDIA_GENERATOR_FOUT', 500);
    }
  }) as RouterMiddleware;
}
