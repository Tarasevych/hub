// Віддалений стіл (RDP/VNC/SSH через Apache Guacamole) — zuivere regels, gedeeld door server en browser.
// Getest in tests/eenheid/extern-bureaublad.test.ts. Zie deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.md (uitvoerder D).
//
// Waarom zo:
//  - guacd draait apart op de server (127.0.0.1:4822) en spreekt RDP/VNC/SSH met het doel. De browser praat nooit met guacd:
//    alleen met onze server via WSS, met een eenmalig ticket (60 s) dat geen wachtwoord bevat. Het wachtwoord komt op de server
//    uit de kluis (owner_vault_v1) op het moment dat de verbinding opent.
//  - Doelen: alleen privénetwerken / localhost, of hosts die de eigenaar UITDRUKKELIJK heeft toegestaan. De server lost de naam
//    zelf op, controleert ELK gevonden adres en geeft guacd het IP (niet de naam) — zo kan DNS-rebinding geen ander doel opleveren.
//  - Bestandsoverdracht staat standaard uit; klembord per verbinding.

export const REMOTE_PROTOCOLLEN = ['rdp', 'vnc', 'ssh'] as const;
export type RemoteProtocol = typeof REMOTE_PROTOCOLLEN[number];
export const STANDAARD_POORT: Record<RemoteProtocol, number> = { rdp: 3389, vnc: 5900, ssh: 22 };
export const REMOTE_TICKET_MS = 60_000;
export const REMOTE_INACTIEF_MS = 15 * 60_000;
export const REMOTE_MAX_MINUTEN = 8 * 60;
export const REMOTE_MAX_SESSIES = 3;

export type RemoteInstellingen = {
  breedte: number; hoogte: number; dpi: number;
  klembord: boolean;          // kopiëren/plakken tussen browser en doel
  bestanden: boolean;         // up- en download (standaard UIT)
  opnemen: boolean;           // sessie-opname in /srv/data/guac-opnames (guacd schrijft)
  certNegeren: boolean;       // RDP: zelfondertekend certificaat accepteren (typisch in een LAN)
  beveiliging: 'any' | 'nla' | 'tls' | 'rdp';
};
export const STANDAARD_INSTELLINGEN: RemoteInstellingen = { breedte: 1280, hoogte: 800, dpi: 96, klembord: true, bestanden: false, opnemen: false, certNegeren: true, beveiliging: 'any' };

export function instellingenNormaliseren(v: unknown): RemoteInstellingen {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const getal = (x: unknown, min: number, max: number, std: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= min && n <= max ? n : std; };
  const beveiliging = ['any', 'nla', 'tls', 'rdp'].includes(String(o.beveiliging)) ? o.beveiliging as RemoteInstellingen['beveiliging'] : 'any';
  return {
    breedte: getal(o.breedte, 640, 3840, STANDAARD_INSTELLINGEN.breedte),
    hoogte: getal(o.hoogte, 480, 2160, STANDAARD_INSTELLINGEN.hoogte),
    dpi: getal(o.dpi, 72, 240, STANDAARD_INSTELLINGEN.dpi),
    klembord: o.klembord !== false,
    bestanden: o.bestanden === true,
    opnemen: o.opnemen === true,
    certNegeren: o.certNegeren !== false,
    beveiliging,
  };
}

// ---------------------------------------------------------------- adressen (SSRF)
/** IPv4 als getal, of null. Alleen de gewone vier-delen-vorm (geen octaal/hex/kortschrift: die kunnen een filter misleiden). */
export function ipv4Getal(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const d = m.slice(1).map(Number);
  if (d.some((x, i) => x > 255 || (m[i + 1].length > 1 && m[i + 1].startsWith('0')))) return null;
  return ((d[0] << 24) >>> 0) + (d[1] << 16) + (d[2] << 8) + d[3];
}
const inV4 = (n: number, basis: string, bits: number) => { const b = ipv4Getal(basis)!; const masker = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return ((n & masker) >>> 0) === ((b & masker) >>> 0); };

/** IPv6 uitschrijven naar 8 groepen (ook met ingebed IPv4, «::»-kortschrift); null als het geen geldig IPv6 is. */
export function ipv6Groepen(ipIn: string): number[] | null {
  let s = ipIn.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!s.includes(':')) return null;
  const laatste = s.slice(s.lastIndexOf(':') + 1);
  if (laatste.includes('.')) {
    const n = ipv4Getal(laatste);
    if (n === null) return null;
    s = s.slice(0, s.lastIndexOf(':') + 1) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  if ((s.match(/::/g) || []).length > 1) return null;
  const [links, rechts] = s.includes('::') ? s.split('::') : [s, null];
  const deel = (x: string) => (x === '' ? [] : x.split(':'));
  const l = deel(links), r = rechts === null ? [] : deel(rechts);
  if (rechts === null && l.length !== 8) return null;
  if (rechts !== null && l.length + r.length > 7) return null;
  const groepen = [...l, ...Array(8 - l.length - r.length).fill('0'), ...r];
  if (groepen.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groepen.map((g) => parseInt(g, 16));
}

/** Uitpakken van «IPv4 in IPv6» (::ffff:a.b.c.d, ::ffff:7f00:1, ::ffff:0:a.b.c.d, ::a.b.c.d, 2002:a.b.c.d::) — anders kan een filter op IPv4 omzeild worden. */
export function ipv4UitV6(ip: string): string | null {
  const g = ipv6Groepen(ip);
  if (!g) return null;
  // 6to4 (2002::/16): groepen 1 en 2 dragen het IPv4-adres.
  if (g[0] === 0x2002) return `${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`;
  // SIIT IPv4-translated (::ffff:0:a.b.c.d, RFC 2765): 0:0:0:0:ffff:0:xxxx:yyyy
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) {
    return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  }
  if (g.slice(0, 5).some((x) => x !== 0) || !(g[5] === 0xffff || (g[5] === 0 && (g[6] !== 0 || g[7] > 1)))) return null;
  return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
}

export type AdresSoort = 'loopback' | 'prive' | 'cgnat' | 'publiek' | 'verboden';
/** Soort van een IP-adres. 'verboden' = nooit een doel (link-local/metadata 169.254.*, 0.0.0.0, multicast, broadcast, gereserveerd). */
export function adresSoort(ipIn: string): AdresSoort {
  const ip = ipIn.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = ipv4UitV6(ip) ?? ip;
  const n = ipv4Getal(v4);
  if (n !== null) {
    if (inV4(n, '127.0.0.0', 8)) return 'loopback';
    if (inV4(n, '0.0.0.0', 8) || inV4(n, '169.254.0.0', 16) || inV4(n, '224.0.0.0', 4) || inV4(n, '240.0.0.0', 4) || inV4(n, '192.0.0.0', 24) || inV4(n, '198.18.0.0', 15)) return 'verboden';
    if (inV4(n, '10.0.0.0', 8) || inV4(n, '172.16.0.0', 12) || inV4(n, '192.168.0.0', 16)) return 'prive';
    if (inV4(n, '100.64.0.0', 10)) return 'cgnat'; // o.a. Tailscale/WireGuard-overlay
    return 'publiek';
  }
  const g = ipv6Groepen(ip);
  if (!g) return 'verboden'; // geen geldig IP
  if (g.every((x, i) => (i < 7 ? x === 0 : x === 1))) return 'loopback'; // ::1 / 0:0:0:0:0:0:0:1
  if (g.every((x) => x === 0) || (g[0] & 0xff00) === 0xff00) return 'verboden'; // ::, multicast ff00::/8
  if ((g[0] & 0xffc0) === 0xfe80) return 'verboden';   // link-local fe80::/10
  if ((g[0] & 0xfe00) === 0xfc00) return 'prive';      // unique local fc00::/7
  // NAT64 (64:ff9b::/96 en 64:ff9b:1::/48), Teredo (2001:0000::/32), benchmarking (2001:2::/48), documentatie (2001:db8::/32), discard (100::/64)
  if ((g[0] === 0x64 && g[1] === 0xff9b) || (g[0] === 0x2001 && (g[1] === 0x0000 || (g[1] === 0x0002 && g[2] === 0) || g[1] === 0xdb8)) || (g[0] === 0x100 && g.slice(1, 4).every((x) => x === 0))) return 'verboden';
  return 'publiek';
}

/**
 * Mag de server naar dit (opgeloste) adres verbinden? Privé/loopback/CGNAT altijd; publiek alleen als de naam waarmee het werd
 * gevonden uitdrukkelijk op de lijst van de eigenaar staat. 'verboden' nooit, ook niet via de lijst.
 */
export function adresToegestaan(ip: string, naam: string, toegestaan: readonly string[]): boolean {
  const soort = adresSoort(ip);
  if (soort === 'verboden') return false;
  if (soort !== 'publiek') return true;
  const n = naam.trim().toLowerCase().replace(/\.$/, '');
  return toegestaan.map((h) => h.trim().toLowerCase().replace(/\.$/, '')).includes(n);
}

/** Hostnaam of IP zoals de eigenaar hem invult: alleen letters/cijfers/punt/streep/dubbelepunt (IPv6), geen schema of pad. */
export function hostGeldig(host: string): boolean {
  const h = host.trim();
  if (!h || h.length > 253) return false;
  if (/^\[?[0-9a-f:]+\]?$/i.test(h) && h.includes(':')) return true;
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(h);
}

// ---------------------------------------------------------------- Guacamole-protocol
/** Eén instructie coderen: lengte in Unicode-codepunten («7.connect,…;»), zoals guacd verwacht. */
export function guacInstructie(opcode: string, ...args: Array<string | number>): string {
  const el = (v: string | number) => { const s = String(v); return `${[...s].length}.${s}`; };
  return [opcode, ...args].map(el).join(',') + ';';
}

/** Meer elementen heeft geen echte instructie («args»/«connect» van guacd voor RDP: ruim honderd). */
export const GUAC_MAX_ELEMENTEN = 1024;
/**
 * Volledige instructies uit een buffer halen (codepunt-telling). Geeft de instructies (als tekst én ontleed) en de rest terug.
 * Gooit bij een kapotte stroom (geen lengte, verkeerd scheidingsteken, te groot element).
 * SEC-002 (server-uitrol-03): ook één INSTRUCTIE is begrensd — in aantal elementen en in lengte (UTF-16-eenheden, standaard twee
 * maximale elementen plus 64 KiB). Vroeger bleef een instructie zonder afsluitende «;» («1.a,1.a,…») onbeperkt als «rest» staan en
 * werd ze bij elk volgend bericht opnieuw van voren ontleed: geheugen en rekentijd zonder grens. Nu: GUAC_TE_GROOT.
 * Одна інструкція теж має межу (кількість елементів і довжина): незавершена інструкція більше не може накопичуватися.
 */
export function guacOntleed(buffer: string, maxElement = 1024 * 1024, grenzen: { maxInstructie?: number; maxElementen?: number } = {}): { instructies: Array<{ tekst: string; opcode: string; args: string[] }>; rest: string } {
  const uit: Array<{ tekst: string; opcode: string; args: string[] }> = [];
  const maxInstructie = grenzen.maxInstructie ?? 2 * maxElement + 64 * 1024;
  const maxElementen = grenzen.maxElementen ?? GUAC_MAX_ELEMENTEN;
  // Een onvoltooide instructie die al boven de grens zit, wordt nooit meer geldig: meteen weigeren in plaats van bewaren.
  const teGroot = (vanaf: number) => { if (buffer.length - vanaf > maxInstructie) throw new Error('GUAC_TE_GROOT'); };
  let start = 0;
  // Werk op codepunten: een array van tekens is duur bij grote buffers, dus stap door de string met surrogaat-paren.
  outer: while (start < buffer.length) {
    let i = start; const els: string[] = [];
    for (;;) {
      const punt = buffer.indexOf('.', i);
      if (punt === -1) { if (buffer.length - i > 12) throw new Error('GUAC_LENGTE'); teGroot(start); break outer; }
      const lenTekst = buffer.slice(i, punt);
      if (!/^\d{1,8}$/.test(lenTekst)) throw new Error('GUAC_LENGTE');
      const len = Number(lenTekst);
      if (len > maxElement) throw new Error('GUAC_TE_GROOT');
      let j = punt + 1, n = 0;
      while (n < len && j < buffer.length) { const c = buffer.charCodeAt(j); j += c >= 0xd800 && c <= 0xdbff ? 2 : 1; n++; }
      if (n < len || j >= buffer.length) { teGroot(start); break outer; } // onvolledig: wachten op meer
      if (els.length >= maxElementen || j - start > maxInstructie) throw new Error('GUAC_TE_GROOT');
      els.push(buffer.slice(punt + 1, j));
      const t = buffer[j];
      if (t === ',') { i = j + 1; continue; }
      if (t === ';') { uit.push({ tekst: buffer.slice(start, j + 1), opcode: els[0], args: els.slice(1) }); start = j + 1; continue outer; }
      throw new Error('GUAC_SCHEIDING');
    }
  }
  return { instructies: uit, rest: buffer.slice(start) };
}

/** Instructies van de browser die nooit doorgaan als bestandsoverdracht uit staat (upload naar het doel). */
export const BESTAND_OPCODES = new Set(['file', 'put', 'pipe']);
/** Invoer die «activiteit» is (voor de 15-minuten-inactiviteit). */
export const ACTIVITEIT_OPCODES = new Set(['mouse', 'key', 'touch', 'size', 'clipboard']);

/** Argumentwaarden voor «connect» in de volgorde die guacd in «args» vroeg; onbekende namen krijgen ''. */
export function connectWaarden(gevraagd: string[], p: { protocol: RemoteProtocol; ip: string; poort: number; gebruiker: string; wachtwoord: string; sleutel?: string; instellingen: RemoteInstellingen; opnamePad?: string; opnameNaam?: string }): string[] {
  const s = p.instellingen;
  const vast: Record<string, string> = {
    hostname: p.ip, port: String(p.poort), username: p.gebruiker, password: p.wachtwoord,
    'private-key': p.protocol === 'ssh' ? (p.sleutel || '') : '',
    width: String(s.breedte), height: String(s.hoogte), dpi: String(s.dpi),
    'ignore-cert': p.protocol === 'rdp' && s.certNegeren ? 'true' : '', security: p.protocol === 'rdp' ? s.beveiliging : '',
    'disable-copy': s.klembord ? '' : 'true', 'disable-paste': s.klembord ? '' : 'true',
    'enable-drive': '', 'enable-sftp': p.protocol === 'ssh' && s.bestanden ? 'true' : '',
    'disable-download': s.bestanden ? '' : 'true', 'disable-upload': s.bestanden ? '' : 'true',
    'enable-printing': '', 'enable-audio-input': '', 'enable-touch': 'true', 'resize-method': p.protocol === 'rdp' ? 'display-update' : '',
    'recording-path': s.opnemen && p.opnamePad ? p.opnamePad : '', 'recording-name': s.opnemen && p.opnameNaam ? p.opnameNaam : '',
    'create-recording-path': s.opnemen && p.opnamePad ? 'true' : '', 'recording-include-keys': '',
  };
  return gevraagd.map((naam) => (/^VERSION_\d+_\d+_\d+$/.test(naam) ? naam : (vast[naam] ?? '')));
}

// ---------------------------------------------------------------- teksten
type T = [string, string];
export const REMOTE_FOUTEN: Record<string, T> = {
  REMOTE_UIT: ['Віддалений стіл вимкнено на сервері (перемикач «guacamole» у /etc/mijn-ruimte/mcp-rechten.json).', 'Extern bureaublad staat uit op de server (schakelaar «guacamole» in /etc/mijn-ruimte/mcp-rechten.json).'],
  REMOTE_ALLEEN_EIGENAAR: ['Віддалений стіл доступний лише власнику.', 'Extern bureaublad is alleen voor de eigenaar.'],
  TECH_PROFIEL_VEREIST: ['Спершу увімкніть технічний профіль у цій вкладці.', 'Zet eerst het technisch profiel aan in dit tabblad.'],
  STEP_UP_REQUIRED: ['Підтвердіть дію passkey.', 'Bevestig met uw passkey.'],
  HOST_ONGELDIG: ['Неправильна адреса хоста.', 'Ongeldig hostadres.'],
  HOST_NIET_GEVONDEN: ['Не вдалося знайти хост (DNS).', 'Host niet gevonden (DNS).'],
  HOST_NIET_TOEGESTAAN: ['Цей хост не в приватній мережі й не у вашому списку дозволених.', 'Deze host is niet privé en staat niet op uw lijst van toegestane hosts.'],
  HOST_VERBODEN: ['Ця адреса заборонена завжди (link-local, метадані хмари, multicast).', 'Dit adres is altijd verboden (link-local, cloud-metadata, multicast).'],
  POORT_ONGELDIG: ['Неправильний порт.', 'Ongeldige poort.'],
  PROTOCOL_ONGELDIG: ['Невідомий протокол.', 'Onbekend protocol.'],
  NAAM_ONGELDIG: ['Назва 1–60 символів.', 'Naam 1–60 tekens.'],
  VERBINDING_NIET_GEVONDEN: ['Підключення не знайдено.', 'Verbinding niet gevonden.'],
  TE_VEEL_SESSIES: ['Забагато відкритих сеансів (максимум 3).', 'Te veel open sessies (maximaal 3).'],
  GUACD_ONBEREIKBAAR: ['Служба guacd не відповідає на сервері.', 'De dienst guacd antwoordt niet op de server.'],
  KLUIS_NIET_KLAAR: ['Сховище секретів не налаштоване (OWNER_VAULT_ENCRYPTION_KEY_V1).', 'De geheimenkluis is niet ingericht (OWNER_VAULT_ENCRYPTION_KEY_V1).'],
  SESSIE_NIET_GEVONDEN: ['Сеанс не знайдено.', 'Sessie niet gevonden.'],
  TCP_DICHT: ['Хост не відповідає на цьому порту.', 'De host antwoordt niet op deze poort.'],
  TAB_ONGELDIG: ['Вкладку не впізнано — оновіть сторінку.', 'Tabblad niet herkend — vernieuw de pagina.'],
  GEHEIM_TE_GROOT: ['Пароль або ключ задовгий.', 'Wachtwoord of sleutel te lang.'],
  KLUIS_VOL: ['У сховищі секретів немає місця.', 'De geheimenkluis is vol.'],
  TE_VEEL_VERBINDINGEN: ['Забагато підключень (максимум 50).', 'Te veel verbindingen (maximaal 50).'],
};
/** Waarom een sessie eindigde (app.remote_sessies.einde_reden, «mr-einde»). */
export const REMOTE_EINDE: Record<string, T> = {
  gesloten: ['завершено вами', 'door u beëindigd'],
  tijd: ['вичерпано час сеансу', 'sessietijd op'],
  inactief: ['15 хв без дій', '15 min zonder invoer'],
  'tech-uit': ['технічний профіль завершено', 'technisch profiel beëindigd'],
  'browser-weg': ['вкладку закрито або зв’язок обірвано', 'tabblad gesloten of verbinding weg'],
  'geen-browser': ['квиток не використано за 60 с', 'ticket niet gebruikt binnen 60 s'],
  'doel-weigert': ['віддалений комп’ютер відмовив (логін/пароль/безпека)', 'doelcomputer weigerde (login/wachtwoord/beveiliging)'],
  'doel-gesloten': ['віддалений комп’ютер закрив з’єднання', 'doelcomputer sloot de verbinding'],
  'guacd-onbereikbaar': ['guacd недоступний', 'guacd onbereikbaar'],
  'guacd-fout': ['помилка guacd', 'fout in guacd'],
  'guacd-protocol': ['помилка протоколу guacd', 'protocolfout guacd'],
  'browser-protocol': ['помилка протоколу браузера', 'protocolfout browser'],
  'verbinding-verwijderd': ['підключення видалено', 'verbinding verwijderd'],
};
export const remoteEindeTekst = (reden: string | null | undefined, lang: 'uk' | 'nl') => (reden ? (REMOTE_EINDE[reden]?.[lang === 'uk' ? 0 : 1] ?? reden) : '—');
export const remoteFoutTekst = (code: string, lang: 'uk' | 'nl') => (REMOTE_FOUTEN[code]?.[lang === 'uk' ? 0 : 1]) ?? code;
