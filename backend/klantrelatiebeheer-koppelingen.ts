import { createHash } from 'node:crypto';
import { error, json } from '../server/platform';
import { geldigeTijdzone, legeVorm, vormFouten } from '../shared/agenda-model';
import { vastAfspraakId, zelfdeKlantlade, type Klantbron, type Koppeltoestand } from '../shared/klantrelatie-koppelingen';
import type { DeelbareDienst, Lade } from '../shared/ruimte-scheiding';
import { DIEPE_PARAMS } from '../shared/zoek-diepe-link';
import type { ZoekBron } from '../shared/zoek-model';
import { gebeurtenisAanmaken } from './agenda-google';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { googleSuiteAgendaScopeStatusVoorEmail } from './google-suite-inrichting';
import { leesKlant, schrijfKlantopdracht } from './klantrelatiebeheer-opslag';
import { can } from './rbac';
import { metLade, ruimtePoort } from './ruimte-cloud-agenda';
import { zoekInLaden } from './zoek-index';
import { koppelFeit } from './zoek/bronnen';

type Herkomst = {
  lade: Lade;
  user: { id: string; email?: string; role?: string; status?: string; accessLevel?: string };
  tabContext: unknown;
};
type Opdracht = 'afspraak' | 'bronnen' | 'koppelstand';

async function toegankelijkeLade(h: Herkomst, dienst: DeelbareDienst) {
  const besluit = await ruimtePoort({ userId: h.user.id, rol: h.user.role, tabContext: h.tabContext }, dienst);
  return zelfdeKlantlade(h.lade, besluit);
}

async function standVoor(h: Herkomst, dienst: 'mail' | 'cloud' | 'agenda', bron: ZoekBron): Promise<Koppeltoestand> {
  if (!can(h.user, dienst === 'mail' ? 'mail.read' : dienst === 'cloud' ? 'cloud.read' : 'calendar.read')) return 'afgeschermd';
  if (!await toegankelijkeLade(h, dienst)) return 'afgeschermd';
  if (dienst === 'agenda') {
    const recht = await metLade(h.lade, 'agenda', () => googleSuiteAgendaScopeStatusVoorEmail(h.user.id, h.user.email || ''));
    if (recht.schrijven && can(h.user, 'calendar.write') && can(h.user, 'workspace.write')) return 'beschikbaar';
    return recht.lezen || recht.schrijven ? 'alleen-lezen' : 'ontbreekt';
  }
  const feit = await koppelFeit(bron, h.lade);
  return feit.fout ? 'onbekend' : feit.verbonden ? 'beschikbaar' : 'ontbreekt';
}

async function koppelstanden(h: Herkomst) {
  const [post, bestanden, schijf, agenda] = await Promise.all([
    standVoor(h, 'mail', 'mail'), standVoor(h, 'cloud', 'cloud'), standVoor(h, 'cloud', 'drive'), standVoor(h, 'agenda', 'agenda'),
  ].map(stand => stand.catch((): Koppeltoestand => 'onbekend')));
  return json({ post, bestanden, schijf, agenda });
}

async function klantbronnen(h: Herkomst, klantId: string) {
  const klant = await leesKlant(h.lade, klantId);
  const [postOpen, bestandenOpen] = await Promise.all([
    can(h.user, 'mail.read') && toegankelijkeLade(h, 'mail'),
    can(h.user, 'cloud.read') && toegankelijkeLade(h, 'cloud'),
  ]);
  const zoek = (q: string, bronnen: ZoekBron[]) => zoekInLaden([{ lade: h.lade, bronnen }], {
    q, bronnen, perPagina: 16, vaag: false, synoniemen: false, facets: false,
  }).then(uit => uit.items);
  const [brieven, stukken] = await Promise.all([
    postOpen && klant.mail ? zoek(klant.mail, ['mail']) : [],
    bestandenOpen ? zoek(klant.organisatie || klant.naam, ['cloud', 'drive']) : [],
  ]);
  const post: Klantbron[] = [];
  for (const brief of brieven) {
    const route = brief.route;
    if (String(brief.extra.afzender || '').trim().toLowerCase() === klant.mail.toLowerCase()
      && route?.host === 'mail' && route.params?.[DIEPE_PARAMS.bericht] && route.params?.[DIEPE_PARAMS.mailAccount]) {
      post.push({ id: brief.id, titel: brief.titel, soort: 'post', route });
    }
  }
  const bestanden: Klantbron[] = [];
  for (const stuk of stukken) {
    const route = stuk.route;
    if (route?.host === 'cloud' && (route.params?.[DIEPE_PARAMS.item] || route.params?.[DIEPE_PARAMS.bestand])) {
      bestanden.push({ id: stuk.id, titel: stuk.titel, soort: 'bestand', route });
    }
  }
  return json({ post, bestanden });
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function afspraak(h: Herkomst, b: Record<string, unknown>) {
  if (!can(h.user, 'calendar.write') || !can(h.user, 'workspace.write') || !await toegankelijkeLade(h, 'agenda')) {
    return error('KLANT_AGENDA_AFGESCHERMD', 403);
  }
  const klantId = String(b.klantId || ''), sleutel = String(b.sleutel || '');
  const titel = typeof b.titel === 'string' ? b.titel.trim() : '';
  const tijdzone = geldigeTijdzone(b.tijdzone, '');
  if (!uuid.test(sleutel) || !uuid.test(klantId) || !tijdzone || !titel || titel.length > 180) {
    return error('KLANT_AFSPRAAK_ONGELDIG', 400);
  }
  const klant = await leesKlant(h.lade, klantId);
  const verwijzing = new URL('/klanten', `https://${SERVICE_HOSTS.crm}`);
  verwijzing.searchParams.set('klant', klant.id);
  const vorm = { ...legeVorm(tijdzone), titel, begin: b.begin, einde: b.einde, beschrijving: verwijzing.toString() };
  if (vormFouten(vorm).length) return error('KLANT_AFSPRAAK_ONGELDIG', 400);
  // De klant en de lade horen bij de sleutel. De agenda bewaart zelf het resultaat van een eerdere poging.
  const afdruk = createHash('sha256').update([h.lade.ruimte, klant.id, sleutel].join('|')).digest('hex');
  const agendakop = `klant-${afdruk}`;
  const uit = await metLade(h.lade, 'agenda', () => gebeurtenisAanmaken({ ownerUserId: h.user.id, email: h.user.email || '' }, {
    sleutel: agendakop, lokaalId: agendakop, vorm, meldDeelnemers: 'none',
  }));
  if (!uit.ok || !uit.gebeurtenisId) {
    if (uit.uitslag === 'bezig') return error('KLANT_AGENDA_BEZIG', 409);
    return error(uit.uitslag === 'geen-recht' ? 'KLANT_AGENDA_AFGESCHERMD' : 'KLANT_AGENDA_MISLUKT', uit.uitslag === 'geen-recht' ? 403 : 502);
  }
  const afspraakId = vastAfspraakId(uit.agendaId || 'primary', uit.gebeurtenisId);
  const ontvangst = `${afdruk.slice(0, 8)}-${afdruk.slice(8, 12)}-5${afdruk.slice(13, 16)}-a${afdruk.slice(17, 20)}-${afdruk.slice(20, 32)}`;
  await schrijfKlantopdracht(h.lade, 'contact', {
    sleutel: ontvangst, klantId: klant.id, kanaal: 'agenda', richting: 'intern', tekst: titel, afspraakId,
  });
  return json({ afspraakId });
}

export async function voerKlantkoppeling(soort: Opdracht, h: Herkomst, b: Record<string, unknown>) {
  if (!h.user.id || h.user.status !== 'approved' || h.user.id !== h.lade.userId) return error('KLANT_SESSIE_VEREIST', 403);
  if (soort === 'koppelstand') return koppelstanden(h);
  if (soort === 'afspraak') return afspraak(h, b);
  return klantbronnen(h, String(b.klantId || ''));
}
