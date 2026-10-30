// Overdrachtbeheer van cloud vNext — een module-singleton BUITEN React, zodat uploads en downloads gewoon doorlopen
// terwijl de mens door de clouddienst navigeert. Het protocol staat in shared/cloud-overdracht-model.ts:
//   • stukken gaan met PARALLEL_STUKKEN tegelijk en in willekeurige volgorde;
//   • een netwerkbreuk is een toestand, geen fout: zachte herhalingen met oplopende pauze (HERVAT_PAUZE_MS), daarna
//     «wacht op netwerk» tot het online-signaal of een klik op «Продовжити»;
//   • na herladen van het tabblad kan een upload verder vanaf precies de ontbrekende stukken ('zoek' + 'status');
//   • de sha256 wordt INCREMENTEEL berekend door het bestand in stukken te lezen — nooit heel in het geheugen.
// Dit bestand importeert bewust GEEN cloud-client: het vervoer wordt geregistreerd (registreerVervoer) zodat tests een
// nagebootst vervoer kunnen geven en Node geen browsermodules hoeft te laden.
import { CLOUD_VNEXT_LIMIETEN } from '../../shared/cloud-vnext-model';
import { HERVAT_PAUZE_MS, HERVAT_POGINGEN, PARALLEL_STUKKEN, overdrachtGrens, stukTotaal, type OverdrachtGrens } from '../../shared/cloud-overdracht-model';
import type { CloudBestand } from '../../shared/cloud-vnext-model';

// ---------------------------------------------------------------- incrementele SHA-256 (FIPS 180-4), zonder afhankelijkheden
const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export class Sha256Stroom {
  private h0 = 0x6a09e667 | 0; private h1 = 0xbb67ae85 | 0; private h2 = 0x3c6ef372 | 0; private h3 = 0xa54ff53a | 0;
  private h4 = 0x510e527f | 0; private h5 = 0x9b05688c | 0; private h6 = 0x1f83d9ab | 0; private h7 = 0x5be0cd19 | 0;
  private rest = new Uint8Array(64);
  private restLen = 0;
  private totaal = 0; // bytes, als Number (ruim genoeg: < 2^53)
  private w = new Int32Array(64);
  private klaarGemaakt = false;

  voeg(data: Uint8Array): this {
    if (this.klaarGemaakt) throw new Error('SHA_AL_AFGEROND');
    this.totaal += data.length;
    let i = 0;
    if (this.restLen) {
      const nodig = Math.min(64 - this.restLen, data.length);
      this.rest.set(data.subarray(0, nodig), this.restLen);
      this.restLen += nodig; i = nodig;
      if (this.restLen === 64) { this.blok(this.rest, 0); this.restLen = 0; }
    }
    for (; i + 64 <= data.length; i += 64) this.blok(data, i);
    if (i < data.length) { this.rest.set(data.subarray(i), 0); this.restLen = data.length - i; }
    return this;
  }
  private blok(p: Uint8Array, off: number): void {
    const w = this.w;
    for (let t = 0; t < 16; t++) w[t] = (p[off] << 24) | (p[off + 1] << 16) | (p[off + 2] << 8) | p[off + 3], off += 4;
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15], b = w[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = this.h0, b = this.h1, c = this.h2, d = this.h3, e = this.h4, f = this.h5, g = this.h6, h = this.h7;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    this.h0 = (this.h0 + a) | 0; this.h1 = (this.h1 + b) | 0; this.h2 = (this.h2 + c) | 0; this.h3 = (this.h3 + d) | 0;
    this.h4 = (this.h4 + e) | 0; this.h5 = (this.h5 + f) | 0; this.h6 = (this.h6 + g) | 0; this.h7 = (this.h7 + h) | 0;
  }
  hex(): string {
    if (!this.klaarGemaakt) {
      this.klaarGemaakt = true;
      const bitsHoog = Math.floor(this.totaal / 0x20000000), bitsLaag = (this.totaal << 3) >>> 0;
      const staart = new Uint8Array(((this.restLen + 8) >> 6 << 6) + 64 - this.restLen);
      staart[0] = 0x80;
      const eind = staart.length;
      staart[eind - 8] = (bitsHoog >>> 24) & 0xff; staart[eind - 7] = (bitsHoog >>> 16) & 0xff;
      staart[eind - 6] = (bitsHoog >>> 8) & 0xff; staart[eind - 5] = bitsHoog & 0xff;
      staart[eind - 4] = (bitsLaag >>> 24) & 0xff; staart[eind - 3] = (bitsLaag >>> 16) & 0xff;
      staart[eind - 2] = (bitsLaag >>> 8) & 0xff; staart[eind - 1] = bitsLaag & 0xff;
      // voeg() mag niet meer: rechtstreeks de blokken draaien
      const alles = new Uint8Array(this.restLen + staart.length);
      alles.set(this.rest.subarray(0, this.restLen), 0); alles.set(staart, this.restLen);
      for (let i = 0; i < alles.length; i += 64) this.blok(alles, i);
    }
    return [this.h0, this.h1, this.h2, this.h3, this.h4, this.h5, this.h6, this.h7]
      .map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
}

// ---------------------------------------------------------------- bronnen en vervoer
/** Een leesbare bron: het bestand wordt ALTIJD in stukken gelezen (lees), nooit heel in het geheugen. */
export type OverdrachtBron = { naam: string; bytes: number; mime: string; lees: (offset: number, lengte: number) => Promise<ArrayBuffer> };
export const bronVanFile = (f: File): OverdrachtBron => ({
  naam: f.name, bytes: f.size, mime: f.type || 'application/octet-stream',
  lees: (offset, lengte) => f.slice(offset, Math.min(offset + lengte, f.size)).arrayBuffer(),
});
/** sha256 van een bron, incrementeel in stukken van 4 MiB. */
export async function shaVanBron(bron: OverdrachtBron, stap = CLOUD_VNEXT_LIMIETEN.stukMaxBytes): Promise<string> {
  const s = new Sha256Stroom();
  for (let o = 0; o < bron.bytes; o += stap) s.voeg(new Uint8Array(await bron.lees(o, Math.min(stap, bron.bytes - o))));
  return s.hex();
}
/** Base64 van een stuk zonder de stack te laten overlopen (eigen kopie: dit bestand kent cloud-client bewust niet). */
export function stukNaarB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Het vervoer naar de server — geregistreerd door de UI (cloud-client) of nagebootst door tests. */
export type Vervoer = {
  begin: (naam: string, mime: string, bytes: number, mapId: string | null) => Promise<{ id: string; stukMax: number }>;
  stuk: (id: string, offset: number, data: string) => Promise<{ ontvangen: number }>;
  status: (id: string) => Promise<{ id: string; naam: string; bytes: number; stukMax: number; ontvangen: number; ontbreekt: number[] }>;
  zoek: (naam: string, bytes: number, mapId: string | null) => Promise<{ sessie: { id: string; ontvangen: number } | null }>;
  klaar: (id: string, sha256: string) => Promise<CloudBestand>;
  afbreken: (id: string) => Promise<unknown>;
  downloadDeel: (v: { id: string; versie?: string; offset: number; lengte: number }) => Promise<{ naam: string; mime: string; bytes: number; sha256: string; offset: number; data: string }>;
};

export type OverdrachtStaat = 'wacht' | 'bezig' | 'gepauzeerd' | 'wacht-netwerk' | 'hervatbaar' | 'klaar' | 'fout' | 'afgebroken';
export type OverdrachtRij = {
  sleutel: string; soort: 'upload' | 'download'; naam: string; bytes: number; mapId: string | null;
  staat: OverdrachtStaat; klaarBytes: number; parallel: number; snelheidBps: number; foutCode: string;
};
export type HervatBeschrijving = { naam: string; bytes: number; mime: string; mapId: string | null };

const HERVAT_SLEUTEL = 'cvn-overdrachten';
/** Is deze mislukking iets voorbijgaands (netwerk, server even weg) — dus herhalen, niet opgeven?
 *  Een 500/501 is een echte serverfout en wordt níét eindeloos herhaald: dat zou een bug verbergen. */
export function voorbijgaand(e: unknown): boolean {
  const status = Number((e as { status?: unknown })?.status ?? NaN);
  if (Number.isFinite(status) && status !== 0) return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
  return true; // status 0 of een gegooide TypeError('failed to fetch') en soortgenoten: netwerk
}
/** Preflight tegen de grenzen per dienst: mag dit bestand naar die dienst, en zo nee — waarom (bron + suggestie)? */
export function preflightNaarDienst(dienst: string, bytes: number): { ok: boolean; grens: OverdrachtGrens | null } {
  const grens = overdrachtGrens(dienst);
  if (!grens || grens.uploadMaxBytes == null) return { ok: true, grens };
  return { ok: bytes <= grens.uploadMaxBytes, grens };
}

type Deps = {
  vervoer: Vervoer;
  wacht?: (ms: number) => Promise<void>;
  nu?: () => number;
  bewaar?: (waarde: string) => void;       // descriptoren van hervattbare uploads (standaard sessionStorage)
  leesBewaard?: () => string;
  venster?: (Pick<Window, 'addEventListener' | 'removeEventListener'>) | null;
};
const standaardWacht = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const veiligBewaar = (w: string) => { try { if (w) sessionStorage.setItem(HERVAT_SLEUTEL, w); else sessionStorage.removeItem(HERVAT_SLEUTEL); } catch { /* privémodus: hervatten na herladen vervalt, uploads zelf niet */ } };
const veiligLees = () => { try { return sessionStorage.getItem(HERVAT_SLEUTEL) || ''; } catch { return ''; } };

type Intern = {
  rij: OverdrachtRij;
  bron?: OverdrachtBron;
  sessieId?: string;
  stukMax: number;
  gepauzeerd: boolean;
  gestopt: boolean;
  wekkers: Set<() => void>;             // lossen de wacht-netwerk/pauze-slaap op (één per slapende werker)
  onKlaar?: (b: CloudBestand) => void;
  onBlob?: (blob: { bytes: Uint8Array; mime: string; naam: string }) => void;
  versie?: string;
};

export class OverdrachtBeheer {
  private d: Required<Pick<Deps, 'vervoer'>> & Deps;
  private items = new Map<string, Intern>();
  private luisteraars = new Set<() => void>();
  private klaarLuisteraars = new Set<(b: CloudBestand) => void>();
  private kiekje: OverdrachtRij[] = [];
  private vuil = true;
  private teller = 0;
  private losVenster: (() => void) | null = null;

  constructor(deps: Deps) {
    this.d = { wacht: standaardWacht, nu: () => Date.now(), bewaar: veiligBewaar, leesBewaard: veiligLees, venster: typeof window !== 'undefined' ? window : null, ...deps };
    // Hervatbare uploads van vóór het herladen: als rijen tonen zodat de mens het bestand opnieuw kan aanwijzen.
    for (const h of this.bewaard()) {
      const sleutel = this.nieuweSleutel();
      this.items.set(sleutel, { rij: { sleutel, soort: 'upload', naam: h.naam, bytes: h.bytes, mapId: h.mapId, staat: 'hervatbaar', klaarBytes: 0, parallel: 0, snelheidBps: 0, foutCode: '' }, stukMax: CLOUD_VNEXT_LIMIETEN.stukMaxBytes, gepauzeerd: false, gestopt: false, wekkers: new Set() });
    }
  }

  // ---- abonnement (useSyncExternalStore): stabiel kiekje, melding bij elke wijziging
  abonneer = (f: () => void): (() => void) => { this.luisteraars.add(f); return () => this.luisteraars.delete(f); };
  stand = (): OverdrachtRij[] => {
    if (this.vuil) { this.kiekje = [...this.items.values()].map((x) => ({ ...x.rij })); this.vuil = false; }
    return this.kiekje;
  };
  opKlaar = (f: (b: CloudBestand) => void): (() => void) => { this.klaarLuisteraars.add(f); return () => this.klaarLuisteraars.delete(f); };
  private meld(): void { this.vuil = true; for (const f of this.luisteraars) f(); this.bewaakVenster(); }
  private nieuweSleutel(): string { return `ov-${++this.teller}-${Math.random().toString(36).slice(2, 8)}`; }
  private zet(it: Intern, deel: Partial<OverdrachtRij>): void { Object.assign(it.rij, deel); this.meld(); }

  actieveUploads(): number { return [...this.items.values()].filter((x) => x.rij.soort === 'upload' && (x.rij.staat === 'bezig' || x.rij.staat === 'wacht' || x.rij.staat === 'wacht-netwerk' || x.rij.staat === 'gepauzeerd')).length; }
  private bewaakVenster(): void {
    const v = this.d.venster; if (!v) return;
    const actief = this.actieveUploads() > 0 || [...this.items.values()].some((x) => x.rij.soort === 'download' && (x.rij.staat === 'bezig' || x.rij.staat === 'wacht-netwerk'));
    if (actief && !this.losVenster) {
      const waarschuw = (e: BeforeUnloadEvent) => { e.preventDefault(); };
      const online = () => this.netwerkTerug();
      v.addEventListener('beforeunload', waarschuw as EventListener);
      v.addEventListener('online', online);
      this.losVenster = () => { v.removeEventListener('beforeunload', waarschuw as EventListener); v.removeEventListener('online', online); };
    } else if (!actief && this.losVenster) { this.losVenster(); this.losVenster = null; }
  }
  /** Het netwerk is terug (online-signaal of knop): alles wat op het netwerk wacht gaat verder. */
  netwerkTerug(): void { for (const it of this.items.values()) if (it.rij.staat === 'wacht-netwerk') this.wek(it); }
  private wek(it: Intern): void { const w = [...it.wekkers]; it.wekkers.clear(); for (const f of w) f(); }

  // ---- hervat-descriptoren (sessionStorage): na herladen weet de pagina wélke upload verder kan
  private bewaard(): HervatBeschrijving[] {
    try { const d = JSON.parse(this.d.leesBewaard!() || '[]'); return Array.isArray(d) ? d.filter((x) => x && typeof x.naam === 'string' && Number.isFinite(x.bytes)) : []; } catch { return []; }
  }
  private schrijfBewaard(): void {
    const actief = [...this.items.values()].filter((x) => x.rij.soort === 'upload' && ['wacht', 'bezig', 'gepauzeerd', 'wacht-netwerk', 'hervatbaar'].includes(x.rij.staat));
    this.d.bewaar!(actief.length ? JSON.stringify(actief.map((x) => ({ naam: x.rij.naam, bytes: x.rij.bytes, mime: x.bron?.mime || 'application/octet-stream', mapId: x.rij.mapId }))) : '');
  }

  // ---- upload: begin (of hervat) → parallelle stukken in elke volgorde → stromende sha → klaar
  voegUploadToe(bron: OverdrachtBron, mapId: string | null, onKlaar?: (b: CloudBestand) => void): string {
    const sleutel = this.nieuweSleutel();
    const it: Intern = { rij: { sleutel, soort: 'upload', naam: bron.naam, bytes: bron.bytes, mapId, staat: 'wacht', klaarBytes: 0, parallel: 0, snelheidBps: 0, foutCode: '' }, bron, stukMax: CLOUD_VNEXT_LIMIETEN.stukMaxBytes, gepauzeerd: false, gestopt: false, wekkers: new Set(), onKlaar };
    this.items.set(sleutel, it); this.schrijfBewaard(); this.meld();
    void this.draaiUpload(it);
    return sleutel;
  }
  /** Na herladen: de mens wijst hetzelfde bestand aan; 'zoek' vindt de serversessie en alleen de ontbrekende stukken gaan nog. */
  hervatMet(sleutel: string, file: File): boolean {
    const it = this.items.get(sleutel);
    if (!it || it.rij.staat !== 'hervatbaar') return false;
    if (file.name !== it.rij.naam || file.size !== it.rij.bytes) return false; // eerlijk: alleen exact hetzelfde bestand
    it.bron = bronVanFile(file);
    this.zet(it, { staat: 'wacht', foutCode: '' });
    void this.draaiUpload(it, true);
    return true;
  }
  private async draaiUpload(it: Intern, viaZoek = false): Promise<void> {
    const bron = it.bron!;
    try {
      let ontbreekt: number[] | null = null;
      if (viaZoek) {
        const z = await this.metHerhaling(it, () => this.d.vervoer.zoek(bron.naam, bron.bytes, it.rij.mapId));
        if (z.sessie) { it.sessieId = z.sessie.id; }
      }
      if (!it.sessieId) {
        const b = await this.metHerhaling(it, () => this.d.vervoer.begin(bron.naam, bron.mime, bron.bytes, it.rij.mapId));
        it.sessieId = b.id; it.stukMax = Math.min(Math.max(1, Math.floor(b.stukMax) || CLOUD_VNEXT_LIMIETEN.stukMaxBytes), CLOUD_VNEXT_LIMIETEN.stukMaxBytes);
        ontbreekt = Array.from({ length: stukTotaal(bron.bytes, it.stukMax) }, (_, i) => i);
      } else {
        const st = await this.metHerhaling(it, () => this.d.vervoer.status(it.sessieId!));
        it.stukMax = Math.min(Math.max(1, Math.floor(st.stukMax) || it.stukMax), CLOUD_VNEXT_LIMIETEN.stukMaxBytes);
        it.rij.klaarBytes = st.ontvangen; ontbreekt = st.ontbreekt;
      }
      this.zet(it, { staat: 'bezig' });

      // Stukkenpomp: tot PARALLEL_STUKKEN werkers trekken indexen uit de wachtrij; 'status' vult de wachtrij bij
      // (het antwoord is tot 64 indexen gekapt) tot de server alles heeft.
      const wachtrij: number[] = [...(ontbreekt || [])];
      let begonMs = this.d.nu!(); let begonBytes = it.rij.klaarBytes;
      let vorigeOntvangen = -1; let zonderVooruitgang = 0;
      while (!it.gestopt) {
        if (it.gepauzeerd) { await this.slaap(it, 'gepauzeerd'); begonMs = this.d.nu!(); begonBytes = it.rij.klaarBytes; continue; }
        if (!wachtrij.length) {
          const st = await this.metHerhaling(it, () => this.d.vervoer.status(it.sessieId!));
          it.rij.klaarBytes = st.ontvangen;
          if (st.ontvangen >= bron.bytes || !st.ontbreekt.length) break;
          zonderVooruitgang = st.ontvangen === vorigeOntvangen ? zonderVooruitgang + 1 : 0;
          vorigeOntvangen = st.ontvangen;
          if (zonderVooruitgang >= 5) throw Object.assign(new Error('OVERDRACHT_VASTGELOPEN'), { code: 'OVERDRACHT_VASTGELOPEN', status: 409 });
          wachtrij.push(...st.ontbreekt);
        }
        const werkers: Promise<void>[] = [];
        const aantal = Math.min(PARALLEL_STUKKEN, wachtrij.length);
        for (let w = 0; w < aantal; w++) {
          werkers.push((async () => {
            for (;;) {
              if (it.gestopt || it.gepauzeerd) return;
              const index = wachtrij.shift();
              if (index === undefined) return;
              const offset = index * it.stukMax;
              const lengte = Math.min(it.stukMax, bron.bytes - offset);
              try {
                it.rij.parallel += 1; this.meld();
                const deel = await bron.lees(offset, lengte);
                await this.metHerhaling(it, () => this.d.vervoer.stuk(it.sessieId!, offset, stukNaarB64(deel)));
                it.rij.klaarBytes = Math.min(bron.bytes, it.rij.klaarBytes + lengte);
                const sec = Math.max(0.2, (this.d.nu!() - begonMs) / 1000);
                it.rij.snelheidBps = Math.round((it.rij.klaarBytes - begonBytes) / sec);
                this.meld();
              } catch (e) {
                wachtrij.unshift(index);     // het stuk gaat terug in de rij; metHerhaling besliste al: dit is blijvend of stop
                if (!it.gestopt && !it.gepauzeerd && it.rij.staat !== 'wacht-netwerk') throw e;
                return;
              } finally { it.rij.parallel = Math.max(0, it.rij.parallel - 1); this.meld(); }
            }
          })());
        }
        await Promise.all(werkers);
      }
      if (it.gestopt) return;
      // Alles staat op de server → stromende sha over het LOKALE bestand en afronden.
      const sha = await shaVanBron(bron, it.stukMax);
      const bestand = await this.metHerhaling(it, () => this.d.vervoer.klaar(it.sessieId!, sha));
      this.zet(it, { staat: 'klaar', klaarBytes: bron.bytes, parallel: 0 });
      this.schrijfBewaard();
      it.onKlaar?.(bestand);
      for (const f of this.klaarLuisteraars) f(bestand);
    } catch (e) {
      if (it.gestopt) return;
      this.zet(it, { staat: 'fout', parallel: 0, foutCode: String((e as { code?: string })?.code || (e as Error)?.message || 'FOUT') });
      this.schrijfBewaard();
    }
  }

  /** Eén aanroep met zachte herhalingen: oplopende pauze (HERVAT_PAUZE_MS); na HERVAT_POGINGEN → «wacht op netwerk». */
  private async metHerhaling<T>(it: Intern, roep: () => Promise<T>): Promise<T> {
    let poging = 0;
    for (;;) {
      if (it.gestopt) throw new Error('AFGEBROKEN');
      try { const uit = await roep(); return uit; }
      catch (e) {
        if (!voorbijgaand(e)) throw e;
        poging += 1;
        if (poging >= HERVAT_POGINGEN) {
          this.zet(it, { staat: 'wacht-netwerk' });
          await this.slaap(it, 'wacht-netwerk');
          if (it.gestopt) throw new Error('AFGEBROKEN');
          this.zet(it, { staat: 'bezig' });
          poging = 0;
          continue;
        }
        await this.d.wacht!(HERVAT_PAUZE_MS[Math.min(poging - 1, HERVAT_PAUZE_MS.length - 1)]);
      }
    }
  }
  /** Slapen tot een wekker afgaat (online-signaal, «Продовжити», of stop). Meerdere slapers tegelijk kan. */
  private slaap(it: Intern, staat: OverdrachtStaat): Promise<void> {
    this.zet(it, { staat });
    return new Promise<void>((los) => { it.wekkers.add(los); });
  }

  pauzeer(sleutel: string): void { const it = this.items.get(sleutel); if (it && (it.rij.staat === 'bezig' || it.rij.staat === 'wacht')) { it.gepauzeerd = true; this.zet(it, { staat: 'gepauzeerd' }); } }
  verder(sleutel: string): void {
    const it = this.items.get(sleutel); if (!it) return;
    if (it.rij.staat === 'gepauzeerd') { it.gepauzeerd = false; this.wek(it); }
    else if (it.rij.staat === 'wacht-netwerk') this.wek(it);
  }
  stop(sleutel: string): void {
    const it = this.items.get(sleutel); if (!it) return;
    it.gestopt = true; it.gepauzeerd = false; this.wek(it);
    this.zet(it, { staat: 'afgebroken', parallel: 0 });
    if (it.sessieId && it.rij.soort === 'upload') void this.d.vervoer.afbreken(it.sessieId).catch(() => undefined);
    this.schrijfBewaard();
  }
  ruimOp(): void {
    for (const [k, it] of this.items) if (['klaar', 'fout', 'afgebroken'].includes(it.rij.staat)) this.items.delete(k);
    this.schrijfBewaard(); this.meld();
  }
  vergeetHervatbaar(sleutel: string): void { const it = this.items.get(sleutel); if (it?.rij.staat === 'hervatbaar') { this.items.delete(sleutel); this.schrijfBewaard(); this.meld(); } }

  // ---- download in delen: herhaald per deel, incrementele sha-controle, daarna één Blob
  voegDownloadToe(b: { id: string; naam: string; bytes: number; versie?: string; deelBytes?: number }, onBlob: (blob: { bytes: Uint8Array; mime: string; naam: string }) => void): string {
    const sleutel = this.nieuweSleutel();
    const it: Intern = { rij: { sleutel, soort: 'download', naam: b.naam, bytes: b.bytes, mapId: null, staat: 'wacht', klaarBytes: 0, parallel: 0, snelheidBps: 0, foutCode: '' }, stukMax: Math.min(Math.max(1, Math.floor(b.deelBytes || CLOUD_VNEXT_LIMIETEN.downloadDeelBytes)), CLOUD_VNEXT_LIMIETEN.downloadDeelBytes), gepauzeerd: false, gestopt: false, wekkers: new Set(), onBlob, versie: b.versie };
    this.items.set(sleutel, it); this.meld();
    void this.draaiDownload(it, b.id);
    return sleutel;
  }
  private async draaiDownload(it: Intern, id: string): Promise<void> {
    try {
      this.zet(it, { staat: 'bezig' });
      const delen: Uint8Array[] = [];
      const sha = new Sha256Stroom();
      let mime = 'application/octet-stream'; let naam = it.rij.naam; let verwacht = ''; let totaal = it.rij.bytes;
      for (let offset = 0; offset === 0 || offset < totaal; offset += it.stukMax) {
        if (it.gestopt) return;
        const deel = await this.metHerhaling(it, () => this.d.vervoer.downloadDeel({ id, versie: it.versie, offset, lengte: it.stukMax }));
        const bytes = Uint8Array.from(atob(deel.data), (c) => c.charCodeAt(0));
        delen.push(bytes); sha.voeg(bytes);
        mime = deel.mime || mime; naam = deel.naam || naam; verwacht = deel.sha256 || verwacht; totaal = deel.bytes;
        it.rij.bytes = totaal; it.rij.klaarBytes += bytes.length; this.meld();
        if (!bytes.length) break; // defensief: de server is klaar
      }
      if (verwacht && sha.hex() !== verwacht) throw Object.assign(new Error('SHA_MISMATCH'), { code: 'SHA_MISMATCH', status: 422 });
      const alles = new Uint8Array(it.rij.klaarBytes);
      let p = 0; for (const d of delen) { alles.set(d, p); p += d.length; }
      this.zet(it, { staat: 'klaar' });
      it.onBlob?.({ bytes: alles, mime, naam });
    } catch (e) {
      if (it.gestopt) return;
      this.zet(it, { staat: 'fout', foutCode: String((e as { code?: string })?.code || (e as Error)?.message || 'FOUT') });
    }
  }
}

// ---------------------------------------------------------------- de singleton voor de pagina (vervoer komt uit cloud-client)
let geregistreerd: Vervoer | null = null;
let enkeling: OverdrachtBeheer | null = null;
export function registreerVervoer(v: Vervoer): void { geregistreerd = v; }
export function overdrachten(): OverdrachtBeheer {
  if (!enkeling) {
    if (!geregistreerd) throw new Error('OVERDRACHT_VERVOER_ONTBREEKT'); // de UI registreert cloud-client vóór gebruik
    enkeling = new OverdrachtBeheer({ vervoer: geregistreerd });
  }
  return enkeling;
}
