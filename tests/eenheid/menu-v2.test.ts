// Menu v2 (stage 1 + datamodel stage 2): normalisatie van zijbalkvoorkeuren, terugzetten, samenstellen, scrollrichtingen,
// unieke iconen, migratie van oude standaardiconen, en dat het gedeelde paginamodel gelijk loopt met canonical-service.js.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  MENU_PAGINAS, DIENST_IDS, DIENST_ACCENT, ACCENTEN, ACCENT_KLEUREN, HOOFD_DIENSTEN, itemAccent, MAX_OVERRIDES, menuNodes, normaliseerZijbalk, standaardZijbalk,
  itemTerugzetten, allesTerugzetten, menuSamenstellen, isMenuItemId,
} from '../../shared/menu-model';
import { ACHTERGROND, contrast, deltaE2000, lch } from './hulp/kleur';
import { scrollRichtingen } from '../../src/zijbalk-scroll';
import { MENU_CATALOG, defaultMenuPreferences, localTabIcon, menuIconComponent, normalizeMenuPreferences } from '../../src/menu-voorkeuren';

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-v2');

  // ---- paginamodel = canonical-service.js
  const bron = readFileSync('public/canonical-service.js', 'utf8');
  const m = /const tabs=(\{[^;]*?\})[,;]/.exec(bron);
  const tabs = m ? (new Function(`return ${m[1]}`)() as Record<string, string[]>) : {};
  check('MENU_PAGINAS is gelijk aan `tabs` in public/canonical-service.js', !!m && JSON.stringify(Object.keys(tabs).sort()) === JSON.stringify(Object.keys(MENU_PAGINAS).sort()) && Object.keys(tabs).every((k) => JSON.stringify(tabs[k]) === JSON.stringify(MENU_PAGINAS[k])), m ? '' : 'tabs niet gevonden');
  // Audit 19.10.2026 (A10): api oauth/webhooks/events/logs/import toonden hetzelfde paneel als «access» → weg uit menu; oude adressen → access.
  const alias = /const LEGACY_ALIAS=(\{[^}]*\})/.exec(bron); const aliassen = alias ? (new Function(`return ${alias[1]}`)() as Record<string, string>) : {};
  check('A10: api heeft alleen verbindingen/vault/access/reconciliation; oude tab-ids en slugs landen op access', JSON.stringify(MENU_PAGINAS.api) === JSON.stringify(['verbindingen', 'vault', 'access', 'reconciliation'])
    && ['oauth', 'webhooks', 'events', 'gebeurtenissen', 'logs', 'logboeken', 'import', 'importeren'].every((t) => aliassen[t] === 'access') && !/\{id:'webhooks'/.test(readFileSync('src/VerenigdDienstApp.tsx', 'utf8')));
  check('elke dienst heeft een accent uit het palet; accenten uniek', DIENST_IDS.every((d) => ACCENTEN.includes(DIENST_ACCENT[d])) && new Set(DIENST_IDS.map((d) => DIENST_ACCENT[d])).size === DIENST_IDS.length);
  const nodes = menuNodes();
  check('menuNodes: stabiele, unieke ids (svc:… / pg:…/…) met ouder', new Set(nodes.map((n) => n.id)).size === nodes.length && nodes.every((n) => isMenuItemId(n.id) && (n.soort === 'dienst' ? !n.ouder : n.ouder === `svc:${n.dienst}`)));

  // ---- normaliseren
  check('rommel → standaard', JSON.stringify(normaliseerZijbalk('x')) === JSON.stringify(standaardZijbalk()) && JSON.stringify(normaliseerZijbalk(null)) === JSON.stringify(standaardZijbalk()));
  const n1 = normaliseerZijbalk({ versie: 9, modus: 'dicht', icoonStijl: 'kleur', dock: { positie: 'onder', transparantie: 999, vergroting: 'ja' }, items: { 'svc:mail': { zichtbaar: false, volgorde: -5, plaats: 'snelbalk', icoon: 'mail', extra: 1 }, 'pg:identity/sessions': { ouder: 'svc:hub' }, 'svc:x y': { zichtbaar: false }, 'pg:a/b': { ouder: 'pg:a/c', icoon: '<script>' }, '__proto__': { zichtbaar: false } }, kopieen: [{ id: 'k-een1', item: 'svc:mail', plaats: 'start', volgorde: 2 }, { id: 'k-een1', item: 'svc:ai', plaats: 'start' }, { id: 'bad', item: 'svc:ai', plaats: 'start' }, { id: 'k-2', item: 'svc:ai', plaats: 'maan' }] });
  check('geldige velden blijven, ongeldige vallen weg / worden begrensd', n1.versie === 1 && n1.modus === 'dicht' && n1.icoonStijl === 'kleur' && n1.dock.positie === 'onder' && n1.dock.transparantie === 60 && n1.dock.vergroting === false
    && JSON.stringify(n1.items['svc:mail']) === JSON.stringify({ zichtbaar: false, volgorde: 0, plaats: 'snelbalk', icoon: 'mail' })
    && n1.items['pg:identity/sessions']?.ouder === 'svc:hub' && !('svc:x y' in n1.items) && !('pg:a/b' in n1.items) && Object.keys(n1.items).length === 2
    && n1.kopieen.length === 1 && n1.kopieen[0].id === 'k-een1', JSON.stringify(n1));
  check('onbekende modus/stijl → auto/klassiek', normaliseerZijbalk({ modus: 'groot', icoonStijl: 'neon' }).modus === 'auto' && normaliseerZijbalk({ icoonStijl: 'neon' }).icoonStijl === 'klassiek');
  const veel: Record<string, unknown> = {}; for (let i = 0; i < 500; i++) veel[`pg:hub/p${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`] = { zichtbaar: false };
  const kop = Array.from({ length: 80 }, (_, i) => ({ id: `k-${String(i).padStart(4, '0')}`, item: 'svc:hub', plaats: 'start', volgorde: i }));
  const n2 = normaliseerZijbalk({ items: veel, kopieen: kop });
  check(`limieten: max ${MAX_OVERRIDES} overrides en 50 kopieën`, Object.keys(n2.items).length === MAX_OVERRIDES && n2.kopieen.length === 50);
  check('idempotent', JSON.stringify(normaliseerZijbalk(n1)) === JSON.stringify(n1));

  // ---- terugzetten
  const t1 = itemTerugzetten(n1, 'svc:mail');
  check('item terugzetten: override én kopieën van dat item weg, rest blijft', !('svc:mail' in t1.items) && t1.kopieen.length === 0 && !!t1.items['pg:identity/sessions'] && t1.modus === 'dicht');
  const t2 = allesTerugzetten(n1);
  check('alles terugzetten: indeling/kopieën/dock standaard, modus en icoonstijl blijven', Object.keys(t2.items).length === 0 && t2.kopieen.length === 0 && t2.dock.positie === 'links' && t2.modus === 'dicht' && t2.icoonStijl === 'kleur');

  // ---- samenstellen
  const std = menuSamenstellen(standaardZijbalk(), nodes);
  check('standaard: alles in de zijbalk, niets elders', std.zijbalk.length === nodes.length && std.snelbalk.length === 0 && std.start.length === 0);
  const s = menuSamenstellen(normaliseerZijbalk({ items: { 'svc:identity': { zichtbaar: false }, 'svc:hub': { volgorde: 50 }, 'svc:ai': { plaats: 'snelbalk' }, 'pg:mail/inbox': { ouder: 'svc:hub' } }, kopieen: [{ id: 'k-aaaa', item: 'pg:mail/sent', plaats: 'start', volgorde: 1 }, { id: 'k-bbbb', item: 'svc:github', plaats: 'start', volgorde: 0 }] }), nodes);
  check('verborgen item en zijn pagina\'s vallen weg', !s.zijbalk.some((x) => x.id === 'svc:identity' || x.ouder === 'svc:identity'));
  check('plaats + ouder + volgorde-overrides werken', s.snelbalk.length === 1 && s.snelbalk[0].id === 'svc:ai' && s.zijbalk.find((x) => x.id === 'pg:mail/inbox')?.ouder === 'svc:hub' && s.zijbalk.find((x) => x.id === 'svc:hub')?.volgorde === 50);
  check('kopieën: extra verwijzing (origineel blijft), gesorteerd', s.start.map((x) => x.id).join(',') === 'k-bbbb:svc:github,k-aaaa:pg:mail/sent' && s.zijbalk.some((x) => x.id === 'pg:mail/sent'));

  // ---- scrollpijlen
  check('scrollRichtingen: boven/onder alleen als er meer is', JSON.stringify(scrollRichtingen(0, 1000, 400)) === '{"boven":false,"onder":true}' && JSON.stringify(scrollRichtingen(300, 1000, 400)) === '{"boven":true,"onder":true}' && JSON.stringify(scrollRichtingen(600, 1000, 400)) === '{"boven":true,"onder":false}' && JSON.stringify(scrollRichtingen(0, 400, 400)) === '{"boven":false,"onder":false}');

  // ---- iconen
  const hoofd = defaultMenuPreferences();
  const MERKEN = ['google', 'microsoft', 'drive', 'onedrive', 'dropbox']; // merkglyphs (MenuGlyph), geen lucide
  const comp = (icon: string): unknown => menuIconComponent(icon) ?? (MERKEN.includes(icon) ? `merk:${icon}` : undefined);
  check('alle hoofd- en subiconen bestaan', hoofd.every((h) => !!comp(h.icon)) && Object.entries(MENU_PAGINAS).every(([d, ps]) => ps.every((p) => !!comp(localTabIcon(d, p)))));
  check('hoofditems: geen twee met hetzelfde icoon', new Set(hoofd.map((h) => comp(h.icon))).size === hoofd.length, hoofd.map((h) => h.icon).join(','));
  const hoofdComp = new Map(hoofd.map((h) => [comp(h.icon), h.id]));
  const zelfdeBestemming = new Set(['hub/tasks', 'hub/calendar', 'hub/notes', 'github/overview']);
  const fout: string[] = [];
  for (const [d, ps] of Object.entries(MENU_PAGINAS)) {
    const c = ps.map((p) => comp(localTabIcon(d, p)));
    if (new Set(c).size !== c.length) fout.push(`${d}: dubbel binnen submenu`);
    ps.forEach((p, i) => { const h = hoofdComp.get(c[i]); if (h && !zelfdeBestemming.has(`${d}/${p}`)) fout.push(`${d}/${p} = hoofditem ${h}`); });
  }
  check('submenu\'s: iconen uniek per submenu en nooit gelijk aan een hoofditem (behalve dezelfde bestemming)', fout.length === 0, fout.join(' | '));
  const sleutelEnSchild = ['identity', 'api', 'admin'].map((d) => MENU_CATALOG.find((x) => x.id === d)?.icon);
  check('geen schild/sleutel-dubbels meer tussen Налаштування/API/Адмін', new Set(sleutelEnSchild).size === 3 && !sleutelEnSchild.includes('key' as never), sleutelEnSchild.join(','));

  // ---- migratie oude standaardiconen
  const mig = normalizeMenuPreferences([{ id: 'identity', visible: true, order: 0, icon: 'key' }, { id: 'mcp', visible: true, order: 1, icon: 'network' }, { id: 'admin', visible: true, order: 2, icon: 'key' }]);
  check('migratie: onaangeroerde oude standaard (identity key, mcp network) → nieuw; bewuste keuze blijft', mig.find((x) => x.id === 'identity')?.icon === 'settings' && mig.find((x) => x.id === 'mcp')?.icon === 'cable' && mig.find((x) => x.id === 'admin')?.icon === 'key', JSON.stringify(mig.map((x) => `${x.id}:${x.icon}`)));

  // ---- kleuren per onderdeel (menu v2, fase A): duidelijk verschillend, leesbaar, gebonden aan de herkomst
  const css = readFileSync('src/menu-v2.css', 'utf8');
  check('ACCENT_KLEUREN heeft precies de accenten uit ACCENTEN', JSON.stringify(Object.keys(ACCENT_KLEUREN)) === JSON.stringify([...ACCENTEN]));
  const cssFout: string[] = [];
  for (const a of ACCENTEN) {
    const l = new RegExp(`\\.canonical-chrome \\[data-accent='${a}'\\][^{]*\\{--a:(#[0-9a-f]{6});--a2:(#[0-9a-f]{6})\\}`).exec(css);
    const d = new RegExp(`theme-plum-dark\\) \\[data-accent='${a}'\\]\\{--a:(#[0-9a-f]{6});--a2:(#[0-9a-f]{6})\\}`).exec(css);
    const k = ACCENT_KLEUREN[a];
    if (!l || !d || l[1] !== k.licht.hoofd || l[2] !== k.licht.sub || d[1] !== k.donker.hoofd || d[2] !== k.donker.sub) cssFout.push(a);
  }
  check('palet in src/menu-v2.css (licht + donker) is gelijk aan ACCENT_KLEUREN', cssFout.length === 0, cssFout.join(','));
  for (const thema of ['licht', 'donker'] as const) {
    const laag: string[] = [];
    for (const a of ACCENTEN) for (const soort of ['hoofd', 'sub'] as const) {
      const min = Math.min(...ACHTERGROND[thema].map((b) => contrast(ACCENT_KLEUREN[a][thema][soort], b)));
      if (min < 3) laag.push(`${a}.${soort}=${min.toFixed(2)}`);
    }
    check(`${thema}: elk hoofd- en subicoon ≥ 3:1 contrast op alle achtergronden (WCAG 1.4.11)`, laag.length === 0, laag.join(' '));
    const afstand = (lijst: readonly string[]) => { let min = 999, paar = ''; for (let i = 0; i < lijst.length; i++) for (let j = i + 1; j < lijst.length; j++) { const d = deltaE2000(ACCENT_KLEUREN[DIENST_ACCENT[lijst[i] as keyof typeof DIENST_ACCENT]][thema].hoofd, ACCENT_KLEUREN[DIENST_ACCENT[lijst[j] as keyof typeof DIENST_ACCENT]][thema].hoofd); if (d < min) { min = d; paar = `${lijst[i]}/${lijst[j]}`; } } return { min, paar }; };
    const h = afstand(HOOFD_DIENSTEN), alle = afstand(DIENST_IDS);
    check(`${thema}: hoofdonderdelen duidelijk verschillend (CIEDE2000 ≥ 12)`, h.min >= 12, `${h.min.toFixed(1)} ${h.paar}`);
    check(`${thema}: alle 14 onderdelen onderscheidbaar (CIEDE2000 ≥ 7)`, alle.min >= 7, `${alle.min.toFixed(1)} ${alle.paar}`);
    const tint: string[] = [];
    for (const a of ACCENTEN) { const k = ACCENT_KLEUREN[a][thema], x = lch(k.hoofd), y = lch(k.sub), dh = Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h)); if (k.hoofd === k.sub || deltaE2000(k.hoofd, k.sub) < 4 || (x.c > 12 && dh > 15)) tint.push(`${a}:${dh.toFixed(0)}°/${deltaE2000(k.hoofd, k.sub).toFixed(1)}`); }
    check(`${thema}: subitem = zelfde kleurtoon (≤ 15°) maar zichtbaar anders (ΔE ≥ 4)`, tint.length === 0, tint.join(' '));
  }
  check('conventies: e-mail blauw, AI violet, cloud hemelsblauw, slim huis oranje, MCP groen, instellingen grijs', (() => { const t = (d: keyof typeof DIENST_ACCENT) => lch(ACCENT_KLEUREN[DIENST_ACCENT[d]].licht.hoofd); return t('mail').h > 270 && t('mail').h < 310 && t('ai').h > 300 && t('ai').h < 330 && t('cloud').h > 240 && t('cloud').h < 275 && t('huis').h > 40 && t('huis').h < 70 && t('mcp').h > 120 && t('mcp').h < 160 && t('identity').c < 12 && t('github').c < 8; })(),
    JSON.stringify(Object.fromEntries((['mail', 'ai', 'cloud', 'huis', 'mcp', 'identity', 'github'] as const).map((d) => [d, Math.round(lch(ACCENT_KLEUREN[DIENST_ACCENT[d]].licht.hoofd).h)]))));
  check('herkomst: itemAccent geeft de kleur van de dienst, ook voor pagina\'s en kopieën', itemAccent('svc:mail') === 'blauw' && itemAccent('pg:mail/sent') === 'blauw' && itemAccent('k-abcd:pg:cloud/photos') === 'hemel' && itemAccent('k-x1y2:svc:github') === 'grafiet' && itemAccent('svc:onbekend') === undefined && itemAccent('rommel') === undefined && nodes.every((n) => itemAccent(n.id) === n.accent));
  const verplaatst = menuSamenstellen(normaliseerZijbalk({ items: { 'pg:mail/sent': { ouder: 'svc:cloud' } }, kopieen: [{ id: 'k-kopi', item: 'pg:mail/inbox', plaats: 'start', volgorde: 0 }] }), nodes);
  check('verplaatst of gekopieerd item houdt zijn eigen kleur (niet die van de nieuwe ouder)', verplaatst.zijbalk.find((x) => x.id === 'pg:mail/sent')?.node.accent === 'blauw' && verplaatst.start[0]?.node.accent === 'blauw' && itemAccent(verplaatst.start[0].id) === 'blauw');
  check('smal: CSS verbergt alleen tekst/tellers van subitems, nooit het icoon (ook e-mailiconen)', /\.canonical-chrome:not\(\.sidebar-expanded\) \.canonical-local-page-button>:not\(\.canonical-menu-icon-slot\):not\(\.mail-sidebar-icon-state\):not\(svg\)/.test(css) && /:not\(\.sidebar-expanded\) \.mail-compose-pill\{[^}]*border-radius:50%[^}]*font-size:0/.test(css));

  return einde();
}
