// Menu v2 fase 2: indeling (puur). Weergave uit standaard + overrides + kopieën, verplaatsen tussen plaatsen en secties,
// kopiëren (kleur van herkomst), kopie weg, stap omhoog/omlaag, reset per item (override + alle kopieën) en alles,
// diensten nooit in een sectie, geen toegang = nergens zichtbaar (ook niet via een kopie), normalisatie van kopie-secties.
import { checker } from './hulp/nep-google';
import { allesTerugzetten, itemAccent, itemTerugzetten, normaliseerZijbalk, standaardZijbalk, MENU_PAGINAS } from '../../shared/menu-model';
import { aangepasteItems, itemVanSleutel, kopieWeg, kopieren, lijst, menuWeergave, mogelijkeDoelen, nieuweKopieId, stap, verplaatsen, vindRij, type Basis } from '../../shared/menu-indeling';

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-indeling');
  const basis: Basis = { diensten: ['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'mcp', 'identity'], toegestaan: ['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'mcp', 'identity'] };
  const ids = (l: { sleutel: string }[]) => l.map((r) => r.sleutel).join(',');
  let v = standaardZijbalk();
  let w = menuWeergave(v, basis);
  check('standaard: diensten in basisvolgorde, secties met alle pagina\'s, snelbalk/start leeg',
    ids(w.zijbalk) === basis.diensten.map((d) => `svc:${d}`).join(',') && w.snelbalk.length === 0 && w.start.length === 0
    && ids(w.secties.mail) === MENU_PAGINAS.mail.map((p) => `pg:mail/${p}`).join(','), ids(w.zijbalk));
  check('admin/api zonder toegang: geen sectie', !w.secties.admin && !w.secties.api);

  // ---- verplaatsen binnen het hoofdmenu
  let u = verplaatsen(v, w, 'svc:mail', { plaats: 'zijbalk', ouder: null, voor: 'svc:hub' });
  check('verplaatsen: Пошта bovenaan', u.ok && ids(menuWeergave(u.v, basis).zijbalk).startsWith('svc:mail,svc:hub,svc:ai'));
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }
  check('verplaatsen: overrides alleen volgorde (geen plaats/ouder bij standaardplek)', JSON.stringify(v.items['svc:mail']) === '{"volgorde":0}' && JSON.stringify(v.items['svc:hub']) === '{"volgorde":1}');

  // ---- dienst naar Швидкий доступ; pagina naar een andere sectie en naar het hoofdmenu
  u = verplaatsen(v, w, 'svc:github', { plaats: 'snelbalk', ouder: null });
  check('dienst → snelbalk', u.ok && ids(menuWeergave(u.v, basis).snelbalk) === 'svc:github' && !menuWeergave(u.v, basis).zijbalk.some((r) => r.item === 'svc:github'));
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }
  check('dienst → sectie: geweigerd', !verplaatsen(v, w, 'svc:ai', { plaats: 'zijbalk', ouder: 'svc:hub' }).ok);
  u = verplaatsen(v, w, 'pg:mail/sent', { plaats: 'zijbalk', ouder: 'svc:hub', voor: 'pg:hub/recent' });
  check('pagina → andere sectie (op de plek vóór «recent»)', u.ok && ids(menuWeergave(u.v, basis).secties.hub).startsWith('pg:hub/overview,pg:mail/sent,pg:hub/recent') && !menuWeergave(u.v, basis).secties.mail.some((r) => r.item === 'pg:mail/sent'));
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }
  check('pagina in andere sectie: ouder-override, kleur van herkomst (E-mail)', v.items['pg:mail/sent'].ouder === 'svc:hub' && vindRij(w, 'pg:mail/sent')?.accent === 'blauw' && itemAccent('pg:mail/sent') === 'blauw');
  u = verplaatsen(v, w, 'pg:identity/sessions', { plaats: 'zijbalk', ouder: null, voor: 'svc:ai' });
  check('pagina → hoofdniveau (ouder null)', u.ok && u.v.items['pg:identity/sessions'].ouder === null && menuWeergave(u.v, basis).zijbalk.some((r) => r.item === 'pg:identity/sessions'));
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }

  // ---- kopiëren
  u = kopieren(v, w, 'svc:mail', { plaats: 'start', ouder: null }, 'k-aaaa1111');
  check('kopie van Пошта op de startpagina (origineel blijft)', u.ok && ids(menuWeergave(u.v, basis).start) === 'k-aaaa1111:svc:mail' && menuWeergave(u.v, basis).zijbalk.some((r) => r.item === 'svc:mail'));
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }
  check('kopie: kleur van herkomst', vindRij(w, 'k-aaaa1111:svc:mail')?.accent === 'blauw' && itemAccent('k-aaaa1111:svc:mail') === 'blauw');
  check('kopie op dezelfde plek nog eens: geweigerd (al-hier)', (() => { const x = kopieren(v, w, 'svc:mail', { plaats: 'start', ouder: null }, 'k-bbbb2222'); return !x.ok && x.fout === 'al-hier'; })());
  check('dienst-kopie in een sectie: geweigerd', !kopieren(v, w, 'svc:mail', { plaats: 'zijbalk', ouder: 'svc:hub' }, 'k-cccc3333').ok);
  u = kopieren(v, w, 'pg:mail/inbox', { plaats: 'zijbalk', ouder: 'svc:ai' }, 'k-dddd4444');
  check('pagina-kopie in een sectie (ouder op de kopie)', u.ok && u.v.kopieen.some((k) => k.id === 'k-dddd4444' && k.ouder === 'svc:ai') && menuWeergave(u.v, basis).secties.ai.some((r) => r.sleutel === 'k-dddd4444:pg:mail/inbox'));
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }
  u = verplaatsen(v, w, 'k-dddd4444:pg:mail/inbox', { plaats: 'snelbalk', ouder: null });
  check('kopie verplaatsen: ouder vervalt buiten de zijbalk', u.ok && u.v.kopieen.find((k) => k.id === 'k-dddd4444')?.plaats === 'snelbalk' && u.v.kopieen.find((k) => k.id === 'k-dddd4444')?.ouder === undefined);
  if (u.ok) { v = u.v; w = menuWeergave(v, basis); }
  check('origineel naar een lijst waar zijn kopie al staat: geweigerd', !verplaatsen(v, w, 'pg:mail/inbox', { plaats: 'snelbalk', ouder: null }).ok);

  // ---- stap omhoog/omlaag
  const snel = ids(w.snelbalk);
  u = stap(v, w, 'k-dddd4444:pg:mail/inbox', -1);
  check('stap omhoog in de snelbalk', u.ok && ids(menuWeergave(u.v, basis).snelbalk) === snel.split(',').reverse().join(','), `${snel} → ${u.ok ? ids(menuWeergave(u.v, basis).snelbalk) : u.fout}`);
  check('stap voorbij de rand: geweigerd', !stap(v, w, 'svc:mail', -1).ok);
  const z = ids(w.zijbalk), u2 = stap(v, w, 'svc:mail', 1);
  check('stap omlaag', u2.ok && ids(menuWeergave(u2.v, basis).zijbalk).split(',')[1] === 'svc:mail', `${z}`);

  // ---- doelen
  const dv = mogelijkeDoelen(w, 'svc:ai', ['hub', 'mail'], 'verplaats');
  check('doelen voor een dienst: geen secties, niet de huidige plek', dv.length === 2 && dv.every((d) => d.ouder === null) && !dv.some((d) => d.plaats === 'zijbalk'));
  const dp = mogelijkeDoelen(w, 'pg:mail/drafts', ['hub', 'mail', 'ai'], 'kopie');
  check('doelen voor een pagina: ook secties, niet de eigen sectie', dp.some((d) => d.ouder === 'svc:hub') && !dp.some((d) => d.ouder === 'svc:mail'));

  // ---- reset per item en alles
  const t = itemTerugzetten(v, 'svc:mail');
  const wt = menuWeergave(t, basis);
  check('reset Пошта: override + ALLE kopieën weg, terug in het hoofdmenu', !t.items['svc:mail'] && !t.kopieen.some((k) => k.item === 'svc:mail') && wt.zijbalk.some((r) => r.item === 'svc:mail') && wt.start.length === 0);
  const t2 = itemTerugzetten(v, 'pg:mail/sent');
  check('reset pagina: terug in de eigen sectie', menuWeergave(t2, basis).secties.mail.some((r) => r.item === 'pg:mail/sent') && !menuWeergave(t2, basis).secties.hub.some((r) => r.item === 'pg:mail/sent'));
  const vd = normaliseerZijbalk({ ...v, dock: { positie: 'onder', transparantie: 40, vergroting: true }, modus: 'dicht' });
  const a = allesTerugzetten(vd);
  check('alles terugzetten: indeling, kopieën en dock standaard; modus blijft', Object.keys(a.items).length === 0 && a.kopieen.length === 0 && a.dock.positie === 'links' && a.modus === 'dicht');
  check('kopie weg', !kopieWeg(v, 'k-aaaa1111').kopieen.some((k) => k.id === 'k-aaaa1111'));
  const ai = aangepasteItems(v);
  check('overzicht: verplaatste items en kopieën', ai.some((x) => x.item === 'svc:github' && x.verplaatst) && ai.some((x) => x.item === 'svc:mail' && x.kopieen === 1 && !x.verplaatst));

  // ---- toegang en normalisatie
  const metAdmin = normaliseerZijbalk({ kopieen: [{ id: 'k-eeee5555', item: 'svc:admin', plaats: 'snelbalk', volgorde: 0 }, { id: 'k-ffff6666', item: 'pg:admin/audit', plaats: 'zijbalk', ouder: 'svc:hub', volgorde: 0 }], items: { 'pg:admin/roles': { plaats: 'start' } } });
  const wa = menuWeergave(metAdmin, basis);
  check('geen toegang tot admin: kopieën en verplaatste admin-pagina\'s nergens zichtbaar', !JSON.stringify(wa).includes('admin'));
  const n = normaliseerZijbalk({ kopieen: [{ id: 'k-gggg7777', item: 'svc:mail', plaats: 'zijbalk', ouder: 'svc:hub', volgorde: 0 }, { id: 'k-hhhh8888', item: 'pg:mail/inbox', plaats: 'start', ouder: 'svc:hub', volgorde: 0 }, { id: 'k-iiii9999', item: 'pg:mail/inbox', plaats: 'zijbalk', ouder: 'pg:hub/recent', volgorde: 0 }, { id: 'k-jjjj0000', item: 'pg:mail/inbox', plaats: 'zijbalk', ouder: 'svc:ai', volgorde: 0 }] });
  check('normalisatie kopie-ouder: alleen pagina, alleen zijbalk, alleen svc:-ouder', n.kopieen.map((k) => k.ouder || '-').join(',') === '-,-,-,svc:ai', JSON.stringify(n.kopieen));
  check('itemVanSleutel', JSON.stringify(itemVanSleutel('k-abcd1234:pg:mail/sent')) === '{"item":"pg:mail/sent","kopie":"k-abcd1234"}' && JSON.stringify(itemVanSleutel('svc:mail')) === '{"item":"svc:mail"}');
  const kid = nieuweKopieId((k) => Uint8Array.from({ length: k }, (_, i) => i * 37));
  check('nieuweKopieId: geldig formaat', /^k-[a-z0-9]{8}$/.test(kid) && normaliseerZijbalk({ kopieen: [{ id: kid, item: 'svc:hub', plaats: 'start', volgorde: 0 }] }).kopieen.length === 1);
  check('lijst(): sectie via ouder', lijst(w, 'zijbalk', 'svc:hub') === w.secties.hub);
  check('server-opslag blijft binnen de limiet na veel bewegingen', JSON.stringify(v).length < 20000);
  return einde();
}
