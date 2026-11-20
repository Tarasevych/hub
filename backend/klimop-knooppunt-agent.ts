// KLIMOP-003 (20.11.2026, Етап 2 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Ізольований мережевий вузол випробувальної мережі «Плюща» (лише локальний контур 127.0.0.1 або ізольована мережа полігона;
// ніколи не під'єднується до бойового сервера і не торкається робочої бази даних PostgreSQL).
// Реалізує:
//   - взаємне рукостискання за паспортами Ed25519 + X25519 + HKDF-SHA-256 (/klimop/v1/handdruk);
//   - обмін наскрізно зашифрованими й вирівняними за розміром кадрами ChaCha20-Poly1305 (/klimop/v1/kader);
//   - естафетну пересилку наскрізно зашифрованих конвертів через проміжний вузол (/klimop/v1/estafette) без доступу
//     проміжного вузла до сеансових ключів чи відкритого вмісту;
//   - зберігання та видачу зашифрованих блоків за відбитком SHA-256 суворо за підписаними мандатами Ed25519;
//   - негайний карантин скомпрометованих вузлів та відкликаних мандатів.

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  verifieerKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopOndertekendMandaat,
} from '../shared/klimop/kern';
import {
  KlimopRouteTabel,
  beantwoordStengelHanddruk,
  maakStengelHanddrukAanvraag,
  ontsleutelStengelKader,
  sluitStengelSessie,
  versleutelStengelKader,
  voltooiStengelHanddruk,
  type KlimopStengelSessie,
  type StengelHanddrukAanvraag,
  type StengelHanddrukAntwoord,
  type StengelVersleuteldKader,
} from '../shared/klimop/stengels';

export type KnooppuntOpdracht =
  | { actie: 'ping'; bericht: string }
  | { actie: 'bewaar_blok'; blokSha256: string; cijfertekstB64u: string; mandaat: KlimopOndertekendMandaat }
  | { actie: 'haal_blok'; blokSha256: string; mandaat: KlimopOndertekendMandaat };

export type KnooppuntOpdrachtAntwoord =
  | { ok: true; actie: 'pong'; knooppuntId: string; echo: string }
  | { ok: true; actie: 'opgeslagen'; blokSha256: string; grootteBytes: number }
  | { ok: true; actie: 'opgehaald'; blokSha256: string; cijfertekstB64u: string }
  | { ok: false; fout: string; details?: string[] };

export interface EstafetteVerzoek {
  schema: 1;
  vanKnooppuntId: string;
  doelKnooppuntId: string;
  doelPad: '/klimop/v1/handdruk' | '/klimop/v1/kader';
  verpakteInhoud: StengelHanddrukAanvraag | StengelVersleuteldKader;
}

const MAX_LICHAAM_BYTES = 2 * 1024 * 1024;

function leesJsonLichaam(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const stukken: Buffer[] = [];
    let totaal = 0;
    req.on('data', (chunk: Buffer) => {
      totaal += chunk.length;
      if (totaal > MAX_LICHAAM_BYTES) {
        rejectPromise(new Error('LICHAAM_TE_GROOT'));
        req.destroy();
        return;
      }
      stukken.push(chunk);
    });
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(stukken).toString('utf8')));
      } catch {
        rejectPromise(new Error('ONGELDIGE_JSON'));
      }
    });
    req.on('error', rejectPromise);
  });
}

function stuurJson(res: ServerResponse, status: number, waarde: unknown): void {
  const tekst = JSON.stringify(waarde);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(tekst),
    'cache-control': 'no-store',
  });
  res.end(tekst);
}

async function postJson(url: string, lichaam: unknown): Promise<{ status: number; data: any }> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lichaam),
  });
  const data = await r.json();
  return { status: r.status, data };
}

export interface KlimopProefKnooppunt {
  readonly identiteit: KlimopKnooppuntIdentiteit;
  readonly basisUrl: string;
  readonly poort: number;
  registreerBuurAdres(knooppuntId: string, basisUrl: string): void;
  plaatsKnooppuntInQuarantaine(knooppuntId: string): void;
  trekMandaatIn(mandaatId: string): void;
  aantalOpgeslagenBlokken(): number;
  leesRuwOpgeslagenBlok(blokSha256: string): Buffer | undefined;
  estafetteTeller(): number;
  sluit(): Promise<void>;
}

/** Піднімає живий локальний вузол випробувальної мережі «Плюща» на `127.0.0.1` (або заданій адресі полігона). */
export async function startKlimopProefKnooppunt(config: {
  knooppunt: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
  luisterHost?: string;
  poort?: number;
}): Promise<KlimopProefKnooppunt> {
  const { knooppunt } = config;
  const host = config.luisterHost ?? '127.0.0.1';
  const sessies = new Map<string, KlimopStengelSessie>();
  const blokOpslag = new Map<string, Buffer>();
  const buurAdressen = new Map<string, string>();
  const quarantaineKnooppunten = new Set<string>();
  const ingetrokkenMandaten = new Set<string>();
  let aantalEstafettes = 0;

  function verwerkBinnenkomendeOpdracht(
    sessie: KlimopStengelSessie,
    opdracht: KnooppuntOpdracht,
  ): KnooppuntOpdrachtAntwoord {
    if (quarantaineKnooppunten.has(sessie.tegenpartijIdentiteit.knooppuntId)) {
      return { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' };
    }
    if (!opdracht || typeof opdracht !== 'object') return { ok: false, fout: 'OPDRACHT_ONGELDIG' };

    if (opdracht.actie === 'ping') {
      return {
        ok: true,
        actie: 'pong',
        knooppuntId: knooppunt.identiteit.knooppuntId,
        echo: String(opdracht.bericht ?? '').slice(0, 256),
      };
    }

    if (opdracht.actie === 'bewaar_blok' || opdracht.actie === 'haal_blok') {
      if (!knooppunt.identiteit.rollen.includes('opslag')) {
        return { ok: false, fout: 'KNOOPPUNT_HEEFT_GEEN_OPSLAGROL' };
      }
      const v = verifieerKlimopMandaat(opdracht.mandaat, {
        ingetrokkenMandaatIds: ingetrokkenMandaten,
        ingetrokkenKnooppuntIds: quarantaineKnooppunten,
      });
      if (!v.ok) return { ok: false, fout: 'MANDAAT_GEWEIGERD', details: v.fouten };
      if (
        opdracht.mandaat.inhoud.ontvangerKnooppuntId !== knooppunt.identiteit.knooppuntId
        || !opdracht.mandaat.inhoud.toegestaneRollen.includes('opslag')
      ) {
        return { ok: false, fout: 'MANDAAT_NIET_VOOR_DEZE_OPSLAGKNOOP' };
      }

      if (opdracht.actie === 'bewaar_blok') {
        const ruw = Buffer.from(opdracht.cijfertekstB64u, 'base64url');
        const berekendSha = createHash('sha256').update(ruw).digest('hex');
        if (berekendSha !== opdracht.blokSha256) {
          return { ok: false, fout: 'BLOK_SHA256_KOMT_NIET_OVEREEN' };
        }
        blokOpslag.set(berekendSha, ruw);
        return { ok: true, actie: 'opgeslagen', blokSha256: berekendSha, grootteBytes: ruw.length };
      }

      const gevonden = blokOpslag.get(opdracht.blokSha256);
      if (!gevonden) return { ok: false, fout: 'BLOK_NIET_GEVONDEN' };
      return { ok: true, actie: 'opgehaald', blokSha256: opdracht.blokSha256, cijfertekstB64u: gevonden.toString('base64url') };
    }

    return { ok: false, fout: 'ONBEKENDE_ACTIE' };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);

      if (req.method === 'GET' && url.pathname === '/klimop/v1/gezondheid') {
        stuurJson(res, 200, {
          ok: true,
          knooppuntId: knooppunt.identiteit.knooppuntId,
          type: knooppunt.identiteit.type,
          rollen: knooppunt.identiteit.rollen,
          juridischeRegio: knooppunt.identiteit.juridischeRegio,
          aanbieder: knooppunt.identiteit.aanbieder,
          actieveStengels: sessies.size,
          opgeslagenBlokken: blokOpslag.size,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/klimop/v1/handdruk') {
        const aanvraag = (await leesJsonLichaam(req)) as StengelHanddrukAanvraag;
        const uit = beantwoordStengelHanddruk(knooppunt, aanvraag, {
          ingetrokkenKnooppuntIds: quarantaineKnooppunten,
        });
        if (!uit.ok) {
          stuurJson(res, 403, { ok: false, fout: uit.fout });
          return;
        }
        sessies.set(uit.sessie.sessieId, uit.sessie);
        stuurJson(res, 200, { ok: true, antwoord: uit.antwoord });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/klimop/v1/kader') {
        const inkomendKader = (await leesJsonLichaam(req)) as StengelVersleuteldKader;
        const sessie = sessies.get(inkomendKader?.sessieId ?? '');
        if (!sessie) {
          stuurJson(res, 404, { ok: false, fout: 'STENGEL_SESSIE_ONBEKEND' });
          return;
        }
        const geopend = ontsleutelStengelKader(sessie, inkomendKader);
        if (!geopend.ok) {
          stuurJson(res, 400, { ok: false, fout: geopend.fout });
          return;
        }
        const opdracht = JSON.parse(geopend.klareInhoud.toString('utf8')) as KnooppuntOpdracht;
        const resultaat = verwerkBinnenkomendeOpdracht(sessie, opdracht);
        const antwoordKader = versleutelStengelKader(sessie, Buffer.from(JSON.stringify(resultaat), 'utf8'));
        stuurJson(res, 200, { ok: true, kader: antwoordKader });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/klimop/v1/estafette') {
        if (!knooppunt.identiteit.rollen.includes('verbinding')) {
          stuurJson(res, 403, { ok: false, fout: 'KNOOPPUNT_HEEFT_GEEN_VERBINDINGSROL' });
          return;
        }
        const verzoek = (await leesJsonLichaam(req)) as EstafetteVerzoek;
        if (!verzoek || verzoek.schema !== 1) {
          stuurJson(res, 400, { ok: false, fout: 'ESTAFETTE_ONGELDIG' });
          return;
        }
        if (
          quarantaineKnooppunten.has(verzoek.vanKnooppuntId)
          || quarantaineKnooppunten.has(verzoek.doelKnooppuntId)
        ) {
          stuurJson(res, 403, { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' });
          return;
        }
        const doelBasis = buurAdressen.get(verzoek.doelKnooppuntId);
        if (!doelBasis) {
          stuurJson(res, 404, { ok: false, fout: 'ESTAFETTE_DOEL_ONBEKEND' });
          return;
        }
        if (verzoek.doelPad !== '/klimop/v1/handdruk' && verzoek.doelPad !== '/klimop/v1/kader') {
          stuurJson(res, 400, { ok: false, fout: 'ESTAFETTE_PAD_NIET_TOEGESTAAN' });
          return;
        }
        aantalEstafettes++;
        const doorgestuurd = await postJson(`${doelBasis}${verzoek.doelPad}`, verzoek.verpakteInhoud);
        stuurJson(res, doorgestuurd.status, doorgestuurd.data);
        return;
      }

      stuurJson(res, 404, { ok: false, fout: 'NIET_GEVONDEN' });
    } catch (err) {
      stuurJson(res, 400, { ok: false, fout: (err as Error).message || 'FOUT' });
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(config.poort ?? 0, host, () => resolveListen());
  });
  const adres = server.address() as AddressInfo;
  const basisUrl = `http://${host}:${adres.port}`;

  return {
    identiteit: knooppunt.identiteit,
    basisUrl,
    poort: adres.port,
    registreerBuurAdres(knooppuntId: string, url: string) {
      buurAdressen.set(knooppuntId, url.replace(/\/+$/, ''));
    },
    plaatsKnooppuntInQuarantaine(knooppuntId: string) {
      quarantaineKnooppunten.add(knooppuntId);
      for (const s of sessies.values()) {
        if (s.tegenpartijIdentiteit.knooppuntId === knooppuntId) sluitStengelSessie(s);
      }
    },
    trekMandaatIn(mandaatId: string) {
      ingetrokkenMandaten.add(mandaatId);
    },
    aantalOpgeslagenBlokken() {
      return blokOpslag.size;
    },
    leesRuwOpgeslagenBlok(blokSha256: string) {
      return blokOpslag.get(blokSha256);
    },
    estafetteTeller() {
      return aantalEstafettes;
    },
    async sluit() {
      for (const s of sessies.values()) sluitStengelSessie(s);
      sessies.clear();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

/**
 * Клієнтський маршрутизатор «Стебел» для вузла або особистого пристрою власника:
 * автоматично обирає живий маршрут за `KlimopRouteTabel` (прямий або через довірений естафетний вузол),
 * встановлює наскрізний сеанс `X25519 + Ed25519` з кінцевим вузлом та передає зашифровані кадри `ChaCha20-Poly1305`.
 */
export class KlimopNetwerkClient {
  private readonly sessiesNaarDoel = new Map<string, KlimopStengelSessie>();

  constructor(
    private readonly afzender: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
    private readonly adressen: ReadonlyMap<string, string>,
    private readonly routeTabel: KlimopRouteTabel,
  ) {}

  private async vervoerNaarDoel(
    doelKnooppuntId: string,
    doelPad: '/klimop/v1/handdruk' | '/klimop/v1/kader',
    verpakteInhoud: StengelHanddrukAanvraag | StengelVersleuteldKader,
  ): Promise<{ status: number; data: any; gebruiktPad: string[] }> {
    const pad = this.routeTabel.kiesBesteRoute(this.afzender.identiteit.knooppuntId, doelKnooppuntId);
    if (!pad || pad.length < 2) {
      return { status: 503, data: { ok: false, fout: 'GEEN_GEZONDE_STENGEL_ROUTE' }, gebruiktPad: [] };
    }

    if (pad.length === 2) {
      const doelUrl = this.adressen.get(doelKnooppuntId);
      if (!doelUrl) return { status: 404, data: { ok: false, fout: 'DOEL_ADRES_ONBEKEND' }, gebruiktPad: pad };
      const r = await postJson(`${doelUrl}${doelPad}`, verpakteInhoud);
      return { ...r, gebruiktPad: pad };
    }

    // Естафетний маршрут через проміжний вузол pad[1] (наскрізні сеансові ключі лишаються лише між pad[0] і кінцевим вузлом!)
    const tussenKnoopId = pad[1];
    const tussenUrl = this.adressen.get(tussenKnoopId);
    if (!tussenUrl) return { status: 404, data: { ok: false, fout: 'TUSSENKNOOP_ADRES_ONBEKEND' }, gebruiktPad: pad };
    const estafette: EstafetteVerzoek = {
      schema: 1,
      vanKnooppuntId: this.afzender.identiteit.knooppuntId,
      doelKnooppuntId,
      doelPad,
      verpakteInhoud,
    };
    const r = await postJson(`${tussenUrl}/klimop/v1/estafette`, estafette);
    return { ...r, gebruiktPad: pad };
  }

  async openOfHergebruikSessie(
    doelKnooppuntId: string,
  ): Promise<{ ok: true; sessie: KlimopStengelSessie } | { ok: false; fout: string }> {
    const bestaand = this.sessiesNaarDoel.get(doelKnooppuntId);
    if (bestaand && !bestaand.gesloten && !this.routeTabel.inQuarantaineSet().has(doelKnooppuntId)) {
      return { ok: true, sessie: bestaand };
    }

    const pakket = maakStengelHanddrukAanvraag(this.afzender, doelKnooppuntId);
    const r = await this.vervoerNaarDoel(doelKnooppuntId, '/klimop/v1/handdruk', pakket.aanvraag);
    if (r.status !== 200 || !r.data?.ok) {
      return { ok: false, fout: r.data?.fout ?? 'HANDDRUK_MISLUKT' };
    }

    const voltooid = voltooiStengelHanddruk(
      this.afzender,
      pakket,
      r.data.antwoord as StengelHanddrukAntwoord,
      { ingetrokkenKnooppuntIds: this.routeTabel.inQuarantaineSet() },
    );
    if (!voltooid.ok) return voltooid;

    this.sessiesNaarDoel.set(doelKnooppuntId, voltooid.sessie);
    return { ok: true, sessie: voltooid.sessie };
  }

  async roepOpdrachtAan(
    doelKnooppuntId: string,
    opdracht: KnooppuntOpdracht,
  ): Promise<{ antwoord: KnooppuntOpdrachtAntwoord; gebruiktPad: string[] }> {
    const s = await this.openOfHergebruikSessie(doelKnooppuntId);
    if (!s.ok) return { antwoord: { ok: false, fout: s.fout }, gebruiktPad: [] };

    const kader = versleutelStengelKader(s.sessie, Buffer.from(JSON.stringify(opdracht), 'utf8'));
    const r = await this.vervoerNaarDoel(doelKnooppuntId, '/klimop/v1/kader', kader);
    if (r.status !== 200 || !r.data?.ok || !r.data.kader) {
      return { antwoord: { ok: false, fout: r.data?.fout ?? 'KADER_VERZENDING_MISLUKT' }, gebruiktPad: r.gebruiktPad };
    }

    const geopend = ontsleutelStengelKader(s.sessie, r.data.kader as StengelVersleuteldKader);
    if (!geopend.ok) {
      return { antwoord: { ok: false, fout: geopend.fout }, gebruiktPad: r.gebruiktPad };
    }
    return {
      antwoord: JSON.parse(geopend.klareInhoud.toString('utf8')) as KnooppuntOpdrachtAntwoord,
      gebruiktPad: r.gebruiktPad,
    };
  }

  sluitAlleSessies(): void {
    for (const s of this.sessiesNaarDoel.values()) sluitStengelSessie(s);
    this.sessiesNaarDoel.clear();
  }
}
