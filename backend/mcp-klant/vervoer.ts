// Het VERVOER van de MCP-klant: hoe de JSON-RPC-berichten bij een vreemde server komen en terug.
//
// Twee vervoerwijzen uit de specificatie, en wij herkennen zelf welke de server spreekt:
//   1. «Streamable HTTP» (sinds 2025-03-26, het moderne): ÉÉN eindpunt. Elk bericht is een HTTP POST met
//      `Accept: application/json, text/event-stream`. De server antwoordt met één JSON-document óf met een
//      SSE-stroom waarin het antwoord als `event: message` staat. Een sessie krijgt `Mcp-Session-Id` bij
//      `initialize`; die kop gaat daarna mee, net als `MCP-Protocol-Version`. DELETE sluit de sessie.
//   2. «HTTP+SSE» (2024-11-05, het oude): GET opent een stroom; de eerste gebeurtenis is `endpoint` met het
//      adres waar de POST's heen moeten. De antwoorden komen op de open GET-stroom.
// Herkennen gaat zoals de specificatie het voorschrijft (Backwards Compatibility): eerst `initialize` POST'en;
// lukt dat, dan is het modern. Komt er een 4xx (405/404/…), dan GET'en en wachten op `endpoint`.
//
// VEILIGHEID — alles gaat door backend/veilige-fetch.ts en nergens anders langs:
//   • alleen https (het model weigert de rest al vóór dit bestand),
//   • DNS-pinning: het adres waarmee verbonden wordt is exact het gecontroleerde adres (geen DNS-rebinding),
//   • geen enkele omleiding wordt gevolgd (3xx = fout met een eigen code),
//   • een harde time-out, een harde grens op het aantal bytes,
//   • het token staat alleen in de `Authorization`-kop en komt nergens in een log, fout of melding terecht.
// Alles wat terugkomt is DATA, nooit een instructie.
import { pinnedFetch, pinnedStream } from '../veilige-fetch';
import {
  MCP_FOUT, MCP_GRENZEN, isRpcAntwoord, isRpcMelding, ontleedSse, rpcMelding, rpcVerzoek, sseEindpunt, sseJson,
  type McpVervoer, type RpcAntwoord, type RpcMelding, type RpcVerzoek, type SseGebeurtenis,
} from '../../shared/mcp-klant-model';

/** De HTTP-laag, injecteerbaar zodat een eenheidstest een nagebootste MCP-server kan bedienen zonder netwerk. */
export type HttpKop = { status: number; headers: Headers };
export type HttpAntwoord = HttpKop & { tekst: string };
export type StroomHaken = {
  onKop?: (status: number, headers: Headers) => void;
  onChunk?: (tekst: string) => boolean | void;
  onStart?: (stop: () => void) => void;
};
export type HttpInit = { method: string; headers: Record<string, string>; body?: string };
export type HttpHaler = {
  verzoek: (url: string, init: HttpInit, timeoutMs: number) => Promise<HttpAntwoord>;
  stroom: (url: string, init: HttpInit, haken: StroomHaken, grenzen: { stilteMs: number; maxTotaalMs: number }) => Promise<HttpKop>;
};

/** De ENIGE haler in productie: de veilige fetcher van de site. */
export const VEILIGE_HALER: HttpHaler = {
  verzoek: async (url, init, timeoutMs) => {
    const res = await pinnedFetch(url, { method: init.method, headers: init.headers, body: init.body }, timeoutMs, MCP_GRENZEN.maxBytes, MCP_FOUT.teGroot);
    return { status: res.status, headers: res.headers, tekst: await res.text() };
  },
  stroom: async (url, init, haken, grenzen) => {
    let status = 0; let headers = new Headers();
    const uit = await pinnedStream(url, {
      method: init.method, headers: init.headers, body: init.body,
      stilteMs: grenzen.stilteMs, maxTotaalMs: grenzen.maxTotaalMs, maxBytes: MCP_GRENZEN.maxBytes, tooLargeCode: MCP_FOUT.teGroot,
      onKop: (s, h) => { status = s; headers = h; haken.onKop?.(s, h); },
      onChunk: haken.onChunk, onStart: haken.onStart,
    });
    return { status: uit.status || status, headers: uit.headers || headers };
  },
};

export class McpFout extends Error {
  constructor(public code: string, public detail = '') { super(code); this.name = 'McpFout'; }
}

/** Netwerkfouten van de veilige fetcher omzetten in onze stabiele codes. */
export const vertaalFout = (err: unknown): McpFout => {
  if (err instanceof McpFout) return err;
  const bericht = err instanceof Error ? err.message : '';
  if (bericht === 'SSRF_ADRES_GEWEIGERD') return new McpFout(MCP_FOUT.adresGeweigerd);
  if (bericht === 'REMOTE_URL_INVALID') return new McpFout(MCP_FOUT.adresOngeldig);
  if (bericht === 'REMOTE_TIMEOUT') return new McpFout(MCP_FOUT.tijd);
  if (bericht === MCP_FOUT.teGroot) return new McpFout(MCP_FOUT.teGroot);
  return new McpFout(MCP_FOUT.onbekend);
};

export type VervoerOpties = {
  adres: string;
  /** Alleen `Authorization: Bearer …`; nooit in een log of een melding. */
  token?: string;
  haler?: HttpHaler;
  /** Bij elke melding van de server (bv. notifications/tools/list_changed). */
  onMelding?: (melding: RpcMelding) => void;
};

const JSON_SOORT = 'application/json';
const SSE_SOORT = 'text/event-stream';
const soortVan = (headers: Headers) => String(headers.get('content-type') || '').toLowerCase();

/** Wat elk vervoer kan. De klant (klant.ts) kent alleen deze vier dingen. */
export interface Vervoer {
  readonly soort: McpVervoer;
  sessieId: string;
  protocol: string;
  verstuur(verzoek: RpcVerzoek): Promise<RpcAntwoord>;
  meld(melding: RpcMelding): Promise<void>;
  sluit(): Promise<void>;
}

// ============================================================ 1. Streamable HTTP (modern)

export class StreamableVervoer implements Vervoer {
  readonly soort: McpVervoer = 'streamable';
  sessieId = '';
  protocol = '';
  private haler: HttpHaler;
  constructor(private opties: VervoerOpties) { this.haler = opties.haler ?? VEILIGE_HALER; }

  private koppen(extra: Record<string, string> = {}): Record<string, string> {
    const uit: Record<string, string> = {
      Accept: `${JSON_SOORT}, ${SSE_SOORT}`,
      'Content-Type': JSON_SOORT,
      ...extra,
    };
    if (this.opties.token) uit.Authorization = `Bearer ${this.opties.token}`;
    if (this.sessieId) uit['Mcp-Session-Id'] = this.sessieId;
    // Specificatie: na de onderhandeling MOET deze kop op elk volgend verzoek mee.
    if (this.protocol) uit['MCP-Protocol-Version'] = this.protocol;
    return uit;
  }

  /** Eén POST; het antwoord komt als JSON of als SSE-stroom. Stopt zodra het antwoord met ons id binnen is. */
  private async post(lichaam: unknown, wachtOpId: number | string | null): Promise<{ kop: HttpKop; antwoord: RpcAntwoord | null }> {
    const body = JSON.stringify(lichaam);
    let kop: HttpKop = { status: 0, headers: new Headers() };
    let buffer = '';
    let antwoord: RpcAntwoord | null = null;
    let jsonModus = false;
    const verwerk = (waarde: unknown) => {
      for (const bericht of Array.isArray(waarde) ? waarde : [waarde]) {
        if (isRpcAntwoord(bericht) && (wachtOpId === null || bericht.id === wachtOpId)) antwoord = bericht;
        else if (isRpcMelding(bericht)) this.opties.onMelding?.(bericht);
      }
    };
    try {
      await this.haler.stroom(this.opties.adres, { method: 'POST', headers: this.koppen(), body }, {
        onKop: (status, headers) => {
          kop = { status, headers };
          const sessie = headers.get('mcp-session-id');
          if (sessie && /^[\x21-\x7e]{1,200}$/.test(sessie)) this.sessieId = sessie;
          jsonModus = !soortVan(headers).includes(SSE_SOORT);
        },
        onChunk: (stuk) => {
          buffer += stuk;
          if (jsonModus) return buffer.length > MCP_GRENZEN.maxBytes;
          const { gebeurtenissen, rest } = ontleedSse(buffer);
          buffer = rest;
          for (const gebeurtenis of gebeurtenissen) verwerk(sseJson(gebeurtenis));
          // Specificatie: na het antwoord SHOULD de server de stroom sluiten. Wij wachten daar niet op.
          return antwoord !== null;
        },
      }, { stilteMs: MCP_GRENZEN.timeoutMs, maxTotaalMs: MCP_GRENZEN.timeoutMs });
    } catch (err) { throw vertaalFout(err); }
    if (jsonModus && buffer.trim()) {
      let waarde: unknown = null;
      try { waarde = JSON.parse(buffer); } catch { throw new McpFout(MCP_FOUT.antwoordOngeldig); }
      verwerk(waarde);
    }
    return { kop, antwoord };
  }

  async verstuur(verzoek: RpcVerzoek): Promise<RpcAntwoord> {
    const { kop, antwoord } = await this.post(verzoek, verzoek.id);
    this.controleerStatus(kop.status);
    if (!antwoord) throw new McpFout(MCP_FOUT.antwoordOngeldig);
    return antwoord;
  }

  async meld(melding: RpcMelding): Promise<void> {
    // Specificatie: op een melding antwoordt de server met 202 Accepted en een leeg lichaam.
    const { kop } = await this.post(melding, null);
    this.controleerStatus(kop.status);
  }

  /** Statussen met een eigen betekenis in de specificatie, en al het andere als serverfout. */
  private controleerStatus(status: number) {
    if (status >= 200 && status < 300) return;
    if (status >= 300 && status < 400) throw new McpFout(MCP_FOUT.omleiding);
    if (status === 401 || status === 403) throw new McpFout(MCP_FOUT.geenToegang);
    // 404 met een sessie-id: de server heeft de sessie beëindigd (dan hoort de klant opnieuw te initialiseren).
    if (status === 404 && this.sessieId) throw new McpFout(MCP_FOUT.sessieWeg);
    throw new McpFout(MCP_FOUT.serverFout, String(status));
  }

  /** Netjes afsluiten: DELETE met de sessie-kop. 405 betekent «dat mag je niet» en is geen fout. */
  async sluit(): Promise<void> {
    if (!this.sessieId) return;
    try { await this.haler.verzoek(this.opties.adres, { method: 'DELETE', headers: this.koppen() }, 5000); }
    catch { /* sluiten mag nooit een fout opleveren voor de aanroeper */ }
    this.sessieId = '';
  }
}

// ============================================================ 2. HTTP+SSE (2024-11-05, oud)

export class SseVervoer implements Vervoer {
  readonly soort: McpVervoer = 'sse';
  sessieId = '';
  protocol = '';
  private haler: HttpHaler;
  private eindpunt = '';
  private stop: (() => void) | null = null;
  private stroomKlaar: Promise<unknown> | null = null;
  private buffer = '';
  private wachtenden = new Map<string, { los: (a: RpcAntwoord) => void; mis: (e: Error) => void }>();
  private fout: McpFout | null = null;
  private volgnummer = 0;
  constructor(private opties: VervoerOpties) { this.haler = opties.haler ?? VEILIGE_HALER; }

  private koppen(extra: Record<string, string> = {}): Record<string, string> {
    const uit: Record<string, string> = { ...extra };
    if (this.opties.token) uit.Authorization = `Bearer ${this.opties.token}`;
    return uit;
  }

  /** Opent de GET-stroom en wacht tot het `endpoint`-bericht binnen is. Daarna loopt de stroom door. */
  async open(): Promise<void> {
    let gereed: (() => void) | null = null;
    let mislukt: ((e: Error) => void) | null = null;
    const wachten = new Promise<void>((los, mis) => { gereed = los; mislukt = mis; });
    const verwerkGebeurtenis = (gebeurtenis: SseGebeurtenis) => {
      if (gebeurtenis.event === 'endpoint') {
        const adres = sseEindpunt(this.opties.adres, gebeurtenis.data);
        // Een `endpoint` naar een ANDERE host is een poging ons weg te sturen: weigeren.
        if (!adres) { this.fout = new McpFout(MCP_FOUT.adresGeweigerd); mislukt?.(this.fout); return true; }
        this.eindpunt = adres;
        gereed?.();
        return false;
      }
      if (gebeurtenis.event !== 'message') return false;
      const waarde = sseJson(gebeurtenis);
      for (const bericht of Array.isArray(waarde) ? waarde : [waarde]) {
        if (isRpcAntwoord(bericht)) {
          const wachter = this.wachtenden.get(String(bericht.id));
          if (wachter) { this.wachtenden.delete(String(bericht.id)); wachter.los(bericht); }
        } else if (isRpcMelding(bericht)) this.opties.onMelding?.(bericht);
      }
      return false;
    };
    this.stroomKlaar = this.haler.stroom(this.opties.adres, { method: 'GET', headers: this.koppen({ Accept: SSE_SOORT }) }, {
      onKop: (status, headers) => {
        if (status === 401 || status === 403) { this.fout = new McpFout(MCP_FOUT.geenToegang); mislukt?.(this.fout); return; }
        if (status >= 300 && status < 400) { this.fout = new McpFout(MCP_FOUT.omleiding); mislukt?.(this.fout); return; }
        if (status < 200 || status >= 300) { this.fout = new McpFout(MCP_FOUT.geenVervoer, String(status)); mislukt?.(this.fout); return; }
        if (!soortVan(headers).includes(SSE_SOORT)) { this.fout = new McpFout(MCP_FOUT.geenVervoer, 'content-type'); mislukt?.(this.fout); }
      },
      onChunk: (stuk) => {
        this.buffer += stuk;
        const { gebeurtenissen, rest } = ontleedSse(this.buffer);
        this.buffer = rest;
        for (const gebeurtenis of gebeurtenissen) if (verwerkGebeurtenis(gebeurtenis)) return true;
        return false;
      },
      onStart: (stop) => { this.stop = stop; },
    }, { stilteMs: MCP_GRENZEN.sessieMs, maxTotaalMs: MCP_GRENZEN.sessieMs })
      .then((kop) => {
        // De stroom is dicht: iedereen die nog wacht, krijgt een eerlijke fout (nooit stil blijven hangen).
        const fout = this.fout ?? new McpFout(this.eindpunt ? MCP_FOUT.sessieWeg : MCP_FOUT.geenVervoer);
        mislukt?.(fout);
        for (const [, wachter] of this.wachtenden) wachter.mis(fout);
        this.wachtenden.clear();
        return kop;
      })
      .catch((err) => {
        const fout = this.fout ?? vertaalFout(err);
        this.fout = fout;
        mislukt?.(fout);
        for (const [, wachter] of this.wachtenden) wachter.mis(fout);
        this.wachtenden.clear();
        return { status: 0, headers: new Headers() };
      });
    await wachten;
  }

  async verstuur(verzoek: RpcVerzoek): Promise<RpcAntwoord> {
    if (this.fout) throw this.fout;
    if (!this.eindpunt) throw new McpFout(MCP_FOUT.geenVervoer);
    const sleutel = String(verzoek.id);
    const antwoord = new Promise<RpcAntwoord>((los, mis) => { this.wachtenden.set(sleutel, { los, mis }); });
    const tijd = new Promise<never>((_, mis) => { setTimeout(() => { this.wachtenden.delete(sleutel); mis(new McpFout(MCP_FOUT.tijd)); }, MCP_GRENZEN.timeoutMs).unref?.(); });
    await this.postNaarEindpunt(JSON.stringify(verzoek)).catch((err) => { this.wachtenden.delete(sleutel); throw err; });
    return Promise.race([antwoord, tijd]);
  }

  async meld(melding: RpcMelding): Promise<void> {
    if (this.fout) throw this.fout;
    if (!this.eindpunt) throw new McpFout(MCP_FOUT.geenVervoer);
    await this.postNaarEindpunt(JSON.stringify(melding));
  }

  private async postNaarEindpunt(body: string): Promise<void> {
    let res: HttpAntwoord;
    try { res = await this.haler.verzoek(this.eindpunt, { method: 'POST', headers: this.koppen({ 'Content-Type': JSON_SOORT }), body }, MCP_GRENZEN.timeoutMs); }
    catch (err) { throw vertaalFout(err); }
    if (res.status >= 300 && res.status < 400) throw new McpFout(MCP_FOUT.omleiding);
    if (res.status === 401 || res.status === 403) throw new McpFout(MCP_FOUT.geenToegang);
    if (res.status < 200 || res.status >= 300) throw new McpFout(MCP_FOUT.serverFout, String(res.status));
  }

  /** Oud vervoer kent geen DELETE: sluiten = de stroom verbreken (specificatie: «shutdown door de verbinding te sluiten»). */
  async sluit(): Promise<void> {
    try { this.stop?.(); } catch { /* al dicht */ }
    this.stop = null;
    await Promise.resolve(this.stroomKlaar).catch(() => undefined);
    this.stroomKlaar = null;
  }

  volgend(): number { this.volgnummer += 1; return this.volgnummer; }
}

// ============================================================ herkennen welke vervoerwijze het is

/**
 * Specificatie (Backwards Compatibility, klantzijde):
 *   1. `initialize` POST'en naar het opgegeven adres. Lukt dat → moderne Streamable HTTP.
 *   2. Komt er een 4xx → GET'en en op `endpoint` wachten → oud HTTP+SSE.
 * Het `initialize`-antwoord van de geslaagde poging geven we mee terug: dat scheelt een tweede ronde.
 */
export async function kiesVervoer(opties: VervoerOpties, initParams: unknown): Promise<{ vervoer: Vervoer; initAntwoord: RpcAntwoord }> {
  const modern = new StreamableVervoer(opties);
  const verzoek = rpcVerzoek(1, 'initialize', initParams);
  try {
    const antwoord = await modern.verstuur(verzoek);
    return { vervoer: modern, initAntwoord: antwoord };
  } catch (err) {
    const fout = err instanceof McpFout ? err : vertaalFout(err);
    // Alleen bij «dit eindpunt doet geen POST» verder zoeken. Een geweigerd adres, een time-out of geen
    // toegang is een echt probleem en wordt NIET weggepoetst met een tweede poging.
    const kanOud = fout.code === MCP_FOUT.serverFout && /^(400|404|405|406|501)$/.test(fout.detail);
    if (!kanOud) throw fout;
    const oud = new SseVervoer(opties);
    try {
      await oud.open();
      const antwoord = await oud.verstuur(rpcVerzoek(1, 'initialize', initParams));
      return { vervoer: oud, initAntwoord: antwoord };
    } catch (tweede) {
      await oud.sluit();
      throw tweede instanceof McpFout ? tweede : vertaalFout(tweede);
    }
  }
}

export { rpcMelding, rpcVerzoek };
