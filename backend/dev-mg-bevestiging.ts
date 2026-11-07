// Twee rechten van connector v2 die iets BUITEN de site veranderen en daarom alleen bestaan MET de bevestiging op de site
// (de gedeelde wachtrij van backend/ai-bevestiging.ts, niet een tweede mechanisme):
//
//   github.pull-request  (recht github_pr, privéruimte, risico hoog)
//       De AI stelt een nieuwe branch + één commit + een pull request voor. Op de kaart ziet de eigenaar repository, branches,
//       titel en ELK pad met zijn grootte; pas na «Підтвердити» (verse passkey/app-code) maakt de server het via de Git Data API
//       (backend/github-platform.ts → ghCreatePr). Samenvoegen bestaat nergens in deze code.
//
//   apps.eigen-domein    (recht app_domain, technische ruimte, risico kritiek)
//       De AI stelt voor dat een app op de server een eigen hostnaam krijgt. De server weigert vooraf adressen van de site zelf en
//       alles onder het cookiedomein (shared/app-domein.ts), kijkt DNS na, en pas na de bevestiging met passkey zet hij de route op
//       de server-agent (deploy/agent/agent.mjs → apps.route, lokale Caddy) — de opdracht wordt dan namens de eigenaar meteen
//       goedgekeurd, want die gaf zojuist zijn passkey. Wat de site NIET kan (root): de hostnaam in de tunnel zetten; daarvoor geeft
//       het resultaat de ene installer-opdracht `mijn-ruimte-installeer app-domein …`.
//
// Dit bestand REGISTREERT de twee soorten bij het laden (backend/index.ts importeert het; de test ook).
import { resolve4, resolve6, resolveCname } from 'node:dns/promises';
import { getPool } from '../server/platform/pg';
import {
  agentTekst, bevestigingVoorAgent, registreerBevestigSoort, vraagEnWacht, type UitvoerUitslag,
} from './ai-bevestiging';
import { ID_RE, type AgentUitslag, type BevestigBeschrijving } from '../shared/ai-bevestiging';
import { leesPrVoorstel, prSamenvatting, type PrVoorstel } from '../shared/github-pr';
import { dnsUitleg, leesDomeinVoorstel, siteHosts, type DnsStand, type DomeinVoorstel } from '../shared/app-domein';
import { COOKIE_DOMAIN, DASHBOARD_HOST, SERVICE_HOSTS } from './deployment-identiteit';
import { ghCreatePr, type GhWie } from './github-platform';
import { apparaatInRuimte, ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import { agentOnline } from './connectors-gateway';

export const SOORT_PR = 'github.pull-request';
export const SOORT_DOMEIN = 'apps.eigen-domein';
const kb = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 102.4) / 10} KB`);

// ------------------------------------------------------------------------------------------------ pull request
/** Een al genormaliseerd voorstel opnieuw door dezelfde regels (bij het aanmaken van het verzoek). */
const prOpnieuw = (v: PrVoorstel) => leesPrVoorstel({ repo: v.repo, base: v.base, branch: v.branch, title: v.title, body: v.body, commit_message: v.commitMessage, draft: v.draft, files: v.files });

export function prBeschrijving(v: PrVoorstel): BevestigBeschrijving {
  const s = prSamenvatting(v);
  const lijst = s.bestanden.slice(0, 50).map((b) => `${b.soort === 'verwijderd' ? '− ' : '+ '}${b.path}${b.soort === 'verwijderd' ? '' : ` (${kb(b.bytes)})`}`).join('\n');
  return {
    titel: { uk: 'Створити pull request', nl: 'Pull request maken' },
    samenvatting: {
      uk: `${v.repo}: нова гілка «${v.branch}» від «${v.base || 'типової гілки'}», ${s.bestanden.length} файл(ів), ${kb(s.bytes)}. Без злиття.`,
      nl: `${v.repo}: nieuwe branch «${v.branch}» vanaf «${v.base || 'de standaardbranch'}», ${s.bestanden.length} bestand(en), ${kb(s.bytes)}. Zonder samenvoegen.`,
    },
    details: [
      { label: { uk: 'Репозиторій', nl: 'Repository' }, waarde: v.repo, nadruk: true },
      { label: { uk: 'Нова гілка', nl: 'Nieuwe branch' }, waarde: v.branch },
      { label: { uk: 'Базова гілка', nl: 'Basisbranch' }, waarde: v.base || '—' },
      { label: { uk: 'Заголовок', nl: 'Titel' }, waarde: v.title },
      { label: { uk: 'Повідомлення коміту', nl: 'Commitbericht' }, waarde: v.commitMessage.slice(0, 300) },
      { label: { uk: 'Файли (+ змінено, − видалено)', nl: 'Bestanden (+ gewijzigd, − verwijderd)' }, waarde: lijst, nadruk: true },
      { label: { uk: 'Чернетка', nl: 'Concept' }, waarde: v.draft ? 'так / ja' : 'ні / nee' },
    ],
    waarschuwing: {
      uk: 'Код потрапить у репозиторій як нова гілка й запит на злиття — від вашого імені. Зливаєте лише ви, на GitHub. Якщо в репозиторії є CI, він запуститься на цій гілці (зміни в .github/workflows ШІ не пропонує).',
      nl: 'De code komt in de repository als nieuwe branch en pull request — namens u. Samenvoegen doet alleen u, op GitHub. Heeft de repository CI, dan draait die op deze branch (wijzigingen in .github/workflows stelt de AI nooit voor).',
    },
  };
}

registreerBevestigSoort<PrVoorstel>({
  soort: SOORT_PR, dienst: 'github', ruimtes: ['prive'], risico: 'hoog',
  valideer: (ruw) => {
    const r = ruw && typeof ruw === 'object' ? prOpnieuw(ruw as PrVoorstel) : null;
    return r && r.ok ? { ok: true, params: r.voorstel } : { ok: false, fout: 'BEVESTIGING_PARAMETERS_ONGELDIG' };
  },
  beschrijf: prBeschrijving,
  voerUit: async ({ userId, lade, params }): Promise<UitvoerUitslag> => {
    const uit = await ghCreatePr({ userId, ruimte: lade.ruimte }, params);
    if (!uit.ok) return { ok: false, fout: uit.error };
    const d = uit.data as { number: number; url: string; branch: string; base: string; commit: string };
    return {
      ok: true, resultaat: d,
      uitkomst: [
        { label: { uk: 'Pull request', nl: 'Pull request' }, waarde: `#${d.number} ${d.url}`, nadruk: true },
        { label: { uk: 'Гілка', nl: 'Branch' }, waarde: `${d.branch} → ${d.base}` },
        { label: { uk: 'Коміт', nl: 'Commit' }, waarde: d.commit.slice(0, 12) },
      ],
    };
  },
});

export type DevAntwoord = { ok: true; data: AgentUitslag } | { ok: false; error: string; status: number };
const naarAntwoord = (u: AgentUitslag | { fout: string }): DevAntwoord => ('status' in u ? { ok: true, data: u } : { ok: false, error: u.fout, status: 409 });

/**
 * De route van het hulpmiddel github_pr (backend/github-platform.ts → POST /api/owner/github/pr/voorstel), al door de GitHub-poort
 * (gegevenslade) heen. Met alleen `bevestiging_id`: de stand van een eerder verzoek. Anders: controleren, verzoek maken, wachten.
 */
export async function prVoorstelRoute(wie: GhWie, b: Record<string, unknown>, opties: { wachtMs?: number } = {}): Promise<DevAntwoord> {
  const userId = typeof wie === 'string' ? wie : wie.userId;
  const ruimte: AiRuimte = 'prive';
  if (typeof b.bevestiging_id === 'string' && b.bevestiging_id) {
    if (!ID_RE.test(b.bevestiging_id)) return { ok: false, error: 'BEVESTIGING_ONBEKEND', status: 404 };
    return naarAntwoord(await bevestigingVoorAgent(userId, b.bevestiging_id, ruimte, { wachtMs: opties.wachtMs ?? 20_000 }));
  }
  const r = leesPrVoorstel(b);
  if (!r.ok) return { ok: false, error: `GITHUB_PR_INVOER:${r.fout}`, status: 400 };
  return naarAntwoord(await vraagEnWacht({ userId, ruimte, soort: SOORT_PR, params: r.voorstel, tool: 'github_pr', ...(opties.wachtMs !== undefined ? { wachtMs: opties.wachtMs } : {}) }));
}

// ------------------------------------------------------------------------------------------------ eigen domein voor een app
type DnsLezer = { cname: (h: string) => Promise<string[]>; a: (h: string) => Promise<string[]>; aaaa: (h: string) => Promise<string[]> };
let dnsLezer: DnsLezer = { cname: resolveCname, a: resolve4, aaaa: resolve6 };
/** Alleen voor tests. */
export const zetDnsLezer = (d: DnsLezer | null) => { dnsLezer = d ?? { cname: resolveCname, a: resolve4, aaaa: resolve6 }; };
const metTijd = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, nee) => setTimeout(() => nee(Object.assign(new Error('ETIMEOUT'), { code: 'ETIMEOUT' })), ms))]);

/** Waar wijst deze naam NU naar? Nooit een fout: wat niet lukt staat in `fout` (NXDOMAIN, ETIMEOUT, …). */
export async function dnsStand(host: string): Promise<DnsStand> {
  const leeg = (e: unknown) => { const c = String((e as { code?: string })?.code || ''); return c === 'ENODATA' || c === 'ENOTFOUND' ? [] : Promise.reject(e); };
  let fout = '';
  const neem = async (f: () => Promise<string[]>) => { try { return (await metTijd(f().catch(leeg), 4000)).map((x) => String(x).toLowerCase().replace(/\.$/, '')).slice(0, 8); } catch (e) { fout = fout || String((e as { code?: string })?.code || 'DNS_FOUT').slice(0, 20); return []; } };
  const [cname, a, aaaa] = await Promise.all([neem(() => dnsLezer.cname(host)), neem(() => dnsLezer.a(host)), neem(() => dnsLezer.aaaa(host))]);
  if (!cname.length && !a.length && !aaaa.length && !fout) fout = 'NXDOMAIN';
  return { cname, a, aaaa, tunnel: cname.some((c) => c.endsWith('.cfargotunnel.com')), fout };
}

const VERBODEN = () => siteHosts(SERVICE_HOSTS, [DASHBOARD_HOST]);
const COOKIE = () => String(COOKIE_DOMAIN || '').replace(/^\./, '');
/** De ene installer-opdracht voor de tunnel (root, op de server): de site kan /etc/cloudflared niet zelf wijzigen. */
export const tunnelOpdracht = (host: string) => `sudo /usr/local/sbin/mijn-ruimte-installeer app-domein ${host}`;

export function domeinBeschrijving(v: DomeinVoorstel): BevestigBeschrijving {
  const dns = dnsUitleg(v.dns);
  return {
    titel: { uk: 'Власний домен для додатка', nl: 'Eigen domein voor een app' },
    samenvatting: { uk: `Додаток «${v.app}» відповідатиме на https://${v.domain} (маршрут Caddy на сервері).`, nl: `De app «${v.app}» antwoordt op https://${v.domain} (Caddy-route op de server).` },
    details: [
      { label: { uk: 'Додаток', nl: 'App' }, waarde: v.app, nadruk: true },
      { label: { uk: 'Домен', nl: 'Domein' }, waarde: v.domain, nadruk: true },
      { label: { uk: 'Пристрій', nl: 'Apparaat' }, waarde: v.machine || '—' },
      { label: { uk: 'DNS зараз', nl: 'DNS nu' }, waarde: `${dns.uk} / ${dns.nl}` },
      { label: { uk: 'Тунель (на сервері, від root)', nl: 'Tunnel (op de server, als root)' }, waarde: tunnelOpdracht(v.domain) },
    ],
    waarschuwing: {
      uk: 'Змінюються DNS і тунель; помилка робить сайт або додаток недоступним. Адреси самого сайту й усе під його доменом сервер відхиляє заздалегідь.',
      nl: 'DNS en tunnel veranderen; een fout maakt de site of de app onbereikbaar. Adressen van de site zelf en alles onder haar domein weigert de server vooraf.',
    },
  };
}

type AgentRij = { id: string; name: string; platform: string | null; ruimte?: unknown; capabilities?: unknown };
type DomeinDeps = {
  agenten: (userId: string) => Promise<AgentRij[]>;
  online: (id: string) => boolean;
  /** Opdracht apps.route op het apparaat, namens de eigenaar die net met passkey bevestigde. */
  route: (userId: string, agent: AgentRij, params: { name: string; domain: string }) => Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; fout: string }>;
};
const echteDomeinDeps = (): DomeinDeps => ({
  agenten: async (userId) => (await import('./connectors-opslag')).listAgents(userId) as unknown as Promise<AgentRij[]>,
  online: (id) => agentOnline(id),
  route: async (userId, agent, params) => {
    const cmd = await import('./connectors-opdrachten');
    let res;
    try { res = await cmd.submitCommand(agent as never, userId, 'apps.route', params, { forceApproval: true }); }
    catch (e) { return { ok: false, fout: `APP_DOMEIN_GEWEIGERD_${String((e as { code?: string })?.code || 'ONBEKEND').replace(/[^A-Z_]/g, '').slice(0, 40)}` }; }
    // De eigenaar bevestigde dit voorstel zojuist met zijn passkey op de site: dat ÍS de goedkeuring van deze opdracht.
    if (res.command.status === 'pending_approval') await cmd.approveCommand(userId, res.command.id);
    const klaar = await cmd.waitForCommand(userId, res.command.id, 40_000);
    if (klaar?.status === 'succeeded') return { ok: true, data: (klaar.result?.data ?? {}) as Record<string, unknown> };
    if (klaar && (klaar.status === 'approved' || klaar.status === 'sent')) return { ok: false, fout: 'APP_DOMEIN_APPARAAT_BEZIG' };
    return { ok: false, fout: 'APP_DOMEIN_APPARAAT_FOUT' };
  },
});
let domeinDeps: DomeinDeps | null = null;
/** Alleen voor tests: een nagebootst apparaat. */
export const zetDomeinDeps = (d: Partial<DomeinDeps> | null) => { domeinDeps = d ? { ...echteDomeinDeps(), ...d } : null; };
const deps = () => domeinDeps ?? echteDomeinDeps();

const appsAan = (a: AgentRij) => (a.capabilities as { apps?: unknown } | null)?.apps === true;
/** Het apparaat van de technische lade met «Додатки» aan: het gevraagde, of het enige dat online is. */
async function serverApparaat(userId: string, lade: AiRuimte, machine: string): Promise<AgentRij | { fout: string }> {
  const d = deps();
  const alle = (await d.agenten(userId)).filter((a) => a.platform !== 'browser' && apparaatInRuimte(a, lade));
  const kandidaten = machine ? alle.filter((a) => a.id === machine || a.name.toLowerCase() === machine.toLowerCase()) : alle.filter((a) => d.online(a.id) && appsAan(a));
  if (kandidaten.length !== 1) return { fout: kandidaten.length ? 'APP_DOMEIN_APPARAAT_KIEZEN' : 'APP_DOMEIN_GEEN_APPARAAT' };
  if (!appsAan(kandidaten[0])) return { fout: 'APP_DOMEIN_APPS_UIT' };
  if (!d.online(kandidaten[0].id)) return { fout: 'APP_DOMEIN_APPARAAT_OFFLINE' };
  return kandidaten[0];
}

const sys = () => getPool('systeem');
registreerBevestigSoort<DomeinVoorstel>({
  soort: SOORT_DOMEIN, dienst: 'ai', ruimtes: ['technisch'], risico: 'kritiek',
  valideer: (ruw) => {
    const r = ruw && typeof ruw === 'object' ? ruw as DomeinVoorstel : null;
    if (!r) return { ok: false, fout: 'BEVESTIGING_PARAMETERS_ONGELDIG' };
    const g = leesDomeinVoorstel({ name: r.app, domain: r.domain, machine: r.machine || undefined }, VERBODEN(), COOKIE());
    if (!g.ok) return { ok: false, fout: 'BEVESTIGING_PARAMETERS_ONGELDIG' };
    const dns = r.dns && typeof r.dns === 'object' ? { cname: (r.dns.cname ?? []).slice(0, 8).map(String), a: (r.dns.a ?? []).slice(0, 8).map(String), aaaa: (r.dns.aaaa ?? []).slice(0, 8).map(String), tunnel: !!r.dns.tunnel, fout: String(r.dns.fout || '').slice(0, 20) } : null;
    return { ok: true, params: { ...g.voorstel, dns } };
  },
  beschrijf: domeinBeschrijving,
  voerUit: async ({ userId, lade, params, aanvraag }): Promise<UitvoerUitslag> => {
    // Opnieuw, op het moment van uitvoeren: de regels kunnen intussen niet veranderd zijn, maar het domein kan bezet geraakt zijn.
    const g = leesDomeinVoorstel({ name: params.app, domain: params.domain }, VERBODEN(), COOKIE());
    if (!g.ok) return { ok: false, fout: 'APP_DOMEIN_ONGELDIG' };
    const bezet = await sys().query(`SELECT app FROM app.app_eigen_domeinen WHERE host = $1 AND status = 'actief' AND NOT (user_id = $2 AND app = $3)`, [params.domain, userId, params.app]).catch(() => ({ rows: [] as Array<{ app: string }> }));
    if (bezet.rows.length) return { ok: false, fout: 'APP_DOMEIN_IN_GEBRUIK' };
    const apparaat = await serverApparaat(userId, ruimteOf(lade.ruimte), params.machine);
    if ('fout' in apparaat) return { ok: false, fout: apparaat.fout };
    const r = await deps().route(userId, apparaat, { name: params.app, domain: params.domain });
    if (!r.ok) return { ok: false, fout: r.fout };
    const dns = await dnsStand(params.domain);
    const routed = r.data.routed === true;
    await sys().query(`INSERT INTO app.app_eigen_domeinen (host, user_id, agent_id, app, status, dns, bevestiging_id, gezet_op)
        VALUES ($1, $2, $3, $4, 'actief', $5::jsonb, $6, now())
      ON CONFLICT (host) DO UPDATE SET user_id = EXCLUDED.user_id, agent_id = EXCLUDED.agent_id, app = EXCLUDED.app, status = 'actief', dns = EXCLUDED.dns, bevestiging_id = EXCLUDED.bevestiging_id, gezet_op = now()`,
      [params.domain, userId, apparaat.id, params.app, JSON.stringify(dns), ID_RE.test(aanvraag.id) ? aanvraag.id : null]);
    const uitleg = dnsUitleg(dns);
    return {
      ok: true,
      resultaat: { app: params.app, domain: params.domain, device: apparaat.name, routed, url: routed ? `https://${params.domain}` : String(r.data.url || ''), dns, tunnelCommand: tunnelOpdracht(params.domain),
        next: routed ? 'The Caddy route is set. Tell the user to run the tunnel command on the server once (as root, via the installer) and to check DNS; never try to change DNS or the tunnel yourself.' : 'No Caddy is configured on that device: the app stays local. Tell the user.' },
      uitkomst: [
        { label: { uk: 'Маршрут', nl: 'Route' }, waarde: routed ? `https://${params.domain} → ${params.app}` : `${params.app}: лише локально / alleen lokaal`, nadruk: true },
        { label: { uk: 'DNS', nl: 'DNS' }, waarde: `${uitleg.uk} / ${uitleg.nl}` },
        { label: { uk: 'Тунель: виконайте на сервері', nl: 'Tunnel: voer uit op de server' }, waarde: tunnelOpdracht(params.domain) },
      ],
    };
  },
});

/** De route van het hulpmiddel app_domain (technische ruimte). Met alleen `bevestiging_id`: de stand van het verzoek. */
export async function domeinVoorstelRoute(userId: string, ruimte: AiRuimte, b: Record<string, unknown>, opties: { wachtMs?: number } = {}): Promise<DevAntwoord> {
  if (ruimte !== 'technisch') return { ok: false, error: 'BEVESTIGING_RUIMTE_NIET_TOEGESTAAN', status: 403 };
  if (typeof b.bevestiging_id === 'string' && b.bevestiging_id) {
    if (!ID_RE.test(b.bevestiging_id)) return { ok: false, error: 'BEVESTIGING_ONBEKEND', status: 404 };
    return naarAntwoord(await bevestigingVoorAgent(userId, b.bevestiging_id, ruimte, { wachtMs: opties.wachtMs ?? 20_000 }));
  }
  const g = leesDomeinVoorstel(b, VERBODEN(), COOKIE());
  if (!g.ok) return { ok: false, error: `APP_DOMEIN_INVOER:${g.fout}`, status: 400 };
  const dns = await dnsStand(g.voorstel.domain);
  return naarAntwoord(await vraagEnWacht({ userId, ruimte, soort: SOORT_DOMEIN, params: { ...g.voorstel, dns }, tool: 'app_domain', ...(opties.wachtMs !== undefined ? { wachtMs: opties.wachtMs } : {}) }));
}

export { agentTekst };
