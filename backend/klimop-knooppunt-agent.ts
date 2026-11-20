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
import {
  bereidEpocheVerversingVoor,
  combineerDkgBijdragenVoorDeelnemer,
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  maakDkgDeelnemerBijdrage,
  maakProactieveNulBijdrage,
  rondEpocheVerversingAf,
  type DkgRondePakket,
  type FeldmanVssDeel,
  type FrostGeheimeNonceStaat,
  type FrostRonde1PubliekeToezegging,
  type FrostRonde2DeelHandtekening,
  type ProactieveNulBijdrage,
  type VoorbereideEpocheStaat,
} from '../shared/klimop/drempelsleutels';
import {
  verifieerApparaatIntrekking,
  verifieerPersoonsStaat,
  type KlimopApparaatIntrekking,
  type KlimopHerstelAanvraag,
  type KlimopPersoonsStaat,
} from '../shared/klimop/identiteit';
import {
  beoordeelUitrolGezondheid,
  verifieerBestuursBesluitLogboek,
  verifieerUitgaveBundel,
  type KlimopBekrachtigdBestuursBesluit,
  type KlimopBestuursGrondwet,
  type KlimopUitrolGezondheidsMeting,
  type KlimopVolledigeUitgaveBundel,
} from '../shared/klimop/bestuur';

export type KnooppuntOpdracht =
  | { actie: 'ping'; bericht: string }
  | { actie: 'bewaar_blok'; blokSha256: string; cijfertekstB64u: string; mandaat: KlimopOndertekendMandaat }
  | { actie: 'haal_blok'; blokSha256: string; mandaat: KlimopOndertekendMandaat }
  | { actie: 'wis_blok'; blokSha256: string; mandaat: KlimopOndertekendMandaat }
  | {
      actie: 'dkg_maak_bijdrage';
      setId: string;
      deelnemerIndex: number;
      drempel: number;
      totaal: number;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'dkg_voltooi_sleutel';
      setId: string;
      deelnemerIndex: number;
      alleBijdragen: readonly DkgRondePakket[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'frost_ronde1';
      setId: string;
      sessieTekenId: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'frost_ronde2';
      setId: string;
      sessieTekenId: string;
      boodschapB64u: string;
      toezeggingenLijst: readonly FrostRonde1PubliekeToezegging[];
      groepsPubliekeSleutelHex: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'ververs_maak_nulbijdrage';
      setId: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'ververs_voorbereiden';
      setId: string;
      bijdragen: readonly ProactieveNulBijdrage[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'ververs_afronden';
      setId: string;
      besluit: 'bevestig' | 'afbreken';
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'publiceer_identiteit_staat';
      staat: KlimopPersoonsStaat;
      intrekkingen: readonly KlimopApparaatIntrekking[];
      herstelAanvraag: KlimopHerstelAanvraag | null;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_identiteit_staat';
      persoonsId: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'stel_bestuursgrondwet_in';
      grondwet: KlimopBestuursGrondwet;
      erkendeDoelenRolPubDerB64u: string;
      erkendeTijdstempelRolPubDerB64u: string;
      bekrachtigdLogboek?: readonly KlimopBekrachtigdBestuursBesluit[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'pas_uitgave_toe';
      bundel: KlimopVolledigeUitgaveBundel;
      pakketInhoudB64u: string;
      webClientInhoudB64u: string;
      gesimuleerdeMeting?: Partial<KlimopUitrolGezondheidsMeting>;
      nuIso?: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_uitgave_staat';
      mandaat: KlimopOndertekendMandaat;
    };

export interface KlimopIdentiteitRegisterInvoer {
  staat: KlimopPersoonsStaat;
  intrekkingen: readonly KlimopApparaatIntrekking[];
  herstelAanvraag: KlimopHerstelAanvraag | null;
}

export type KnooppuntOpdrachtAntwoord =
  | { ok: true; actie: 'pong'; knooppuntId: string; echo: string }
  | { ok: true; actie: 'opgeslagen'; blokSha256: string; grootteBytes: number }
  | { ok: true; actie: 'opgehaald'; blokSha256: string; cijfertekstB64u: string }
  | { ok: true; actie: 'gewist'; blokSha256: string; bestond: boolean }
  | { ok: true; actie: 'dkg_bijdrage'; pakket: DkgRondePakket }
  | {
      ok: true;
      actie: 'dkg_voltooid';
      setId: string;
      epoche: number;
      deelnemerIndex: number;
      groepsPubliekeSleutelHex: string;
      groepsPubliekeSleutelSpkiB64u: string;
      deelnemerPubliekeSleutelsHex: Record<number, string>;
    }
  | { ok: true; actie: 'frost_ronde1_toezegging'; toezegging: FrostRonde1PubliekeToezegging; epoche: number }
  | { ok: true; actie: 'frost_ronde2_deel'; deelHandtekening: FrostRonde2DeelHandtekening; epoche: number }
  | { ok: true; actie: 'ververs_nulbijdrage'; bijdrage: ProactieveNulBijdrage }
  | { ok: true; actie: 'ververs_voorbereid'; vanEpoche: number; naarEpoche: number }
  | { ok: true; actie: 'ververs_afgerond'; actieveEpoche: number }
  | {
      ok: true;
      actie: 'identiteit_gepubliceerd';
      persoonsId: string;
      actieveEpoche: number;
      aantalIntrekkingen: number;
    }
  | {
      ok: true;
      actie: 'identiteit_geraadpleegd';
      invoer: KlimopIdentiteitRegisterInvoer;
    }
  | {
      ok: true;
      actie: 'bestuursgrondwet_ingesteld';
      grondwetId: string;
      versieVolgnummer: number;
    }
  | {
      ok: true;
      actie: 'uitgave_geactiveerd';
      actiefVolgnummer: number;
      versieLabel: string;
      minCompatibelVolgnummer: number;
    }
  | {
      ok: true;
      actie: 'uitgave_staat';
      actiefVolgnummer: number;
      versieLabel: string;
      minCompatibelVolgnummer: number;
      aantalTerugdraaiingen: number;
    }
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
  actieveDrempelEpoche(setId: string): number | null;
  aantalGeregistreerdeIdentiteiten(): number;
  actiefUitgaveVolgnummer(): number;
  aantalUitgaveTerugdraaiingen(): number;
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
  const drempelDelen = new Map<string, FeldmanVssDeel>();
  const voorbereideVerversingen = new Map<string, VoorbereideEpocheStaat>();
  const frostNonces = new Map<string, FrostGeheimeNonceStaat>();
  const identiteitRegister = new Map<string, KlimopIdentiteitRegisterInvoer>();
  const buurAdressen = new Map<string, string>();
  const quarantaineKnooppunten = new Set<string>();
  const ingetrokkenMandaten = new Set<string>();
  let actieveGrondwet: KlimopBestuursGrondwet | null = null;
  let erkendeDoelenRolPub = '';
  let erkendeTijdstempelRolPub = '';
  let huidigUitgaveVolgnummer = 1;
  let huidigeVersieLabel = 'klimop-basis-1.0.0';
  let huidigMinCompatibelVolgnummer = 1;
  let aantalTerugdraaiingen = 0;
  let aantalEstafettes = 0;

  function controleerRolEnMandaat(
    vereisteRol: 'opslag' | 'verificatie',
    mandaat: KlimopOndertekendMandaat,
  ): { ok: true } | { ok: false; fout: string; details?: string[] } {
    if (!knooppunt.identiteit.rollen.includes(vereisteRol)) {
      return {
        ok: false,
        fout: vereisteRol === 'opslag' ? 'KNOOPPUNT_HEEFT_GEEN_OPSLAGROL' : 'KNOOPPUNT_HEEFT_GEEN_VERIFICATIEROL',
      };
    }
    const v = verifieerKlimopMandaat(mandaat, {
      ingetrokkenMandaatIds: ingetrokkenMandaten,
      ingetrokkenKnooppuntIds: quarantaineKnooppunten,
    });
    if (!v.ok) return { ok: false, fout: 'MANDAAT_GEWEIGERD', details: v.fouten };
    if (
      mandaat.inhoud.ontvangerKnooppuntId !== knooppunt.identiteit.knooppuntId
      || !mandaat.inhoud.toegestaneRollen.includes(vereisteRol)
    ) {
      return {
        ok: false,
        fout: vereisteRol === 'opslag' ? 'MANDAAT_NIET_VOOR_DEZE_OPSLAGKNOOP' : 'MANDAAT_NIET_VOOR_DEZE_VERIFICATIEKNOOP',
      };
    }
    return { ok: true };
  }

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

    if (opdracht.actie === 'bewaar_blok' || opdracht.actie === 'haal_blok' || opdracht.actie === 'wis_blok') {
      const mOk = controleerRolEnMandaat('opslag', opdracht.mandaat);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'bewaar_blok') {
        const ruw = Buffer.from(opdracht.cijfertekstB64u, 'base64url');
        const berekendSha = createHash('sha256').update(ruw).digest('hex');
        if (berekendSha !== opdracht.blokSha256) {
          return { ok: false, fout: 'BLOK_SHA256_KOMT_NIET_OVEREEN' };
        }
        blokOpslag.set(berekendSha, ruw);
        return { ok: true, actie: 'opgeslagen', blokSha256: berekendSha, grootteBytes: ruw.length };
      }

      if (opdracht.actie === 'wis_blok') {
        const bestaand = blokOpslag.get(opdracht.blokSha256);
        if (bestaand) {
          bestaand.fill(0);
          blokOpslag.delete(opdracht.blokSha256);
        }
        return { ok: true, actie: 'gewist', blokSha256: opdracht.blokSha256, bestond: Boolean(bestaand) };
      }

      const gevonden = blokOpslag.get(opdracht.blokSha256);
      if (!gevonden) return { ok: false, fout: 'BLOK_NIET_GEVONDEN' };
      return { ok: true, actie: 'opgehaald', blokSha256: opdracht.blokSha256, cijfertekstB64u: gevonden.toString('base64url') };
    }

    if (
      opdracht.actie === 'dkg_maak_bijdrage'
      || opdracht.actie === 'dkg_voltooi_sleutel'
      || opdracht.actie === 'frost_ronde1'
      || opdracht.actie === 'frost_ronde2'
      || opdracht.actie === 'ververs_maak_nulbijdrage'
      || opdracht.actie === 'ververs_voorbereiden'
      || opdracht.actie === 'ververs_afronden'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'dkg_maak_bijdrage') {
        const pakket = maakDkgDeelnemerBijdrage({
          setId: opdracht.setId,
          afzenderIndex: opdracht.deelnemerIndex,
          drempel: opdracht.drempel,
          totaal: opdracht.totaal,
        });
        return { ok: true, actie: 'dkg_bijdrage', pakket };
      }

      if (opdracht.actie === 'dkg_voltooi_sleutel') {
        const gecombineerd = combineerDkgBijdragenVoorDeelnemer(opdracht.deelnemerIndex, opdracht.alleBijdragen);
        if (!gecombineerd.ok) return { ok: false, fout: gecombineerd.fout };
        drempelDelen.set(opdracht.setId, gecombineerd.deel);
        return {
          ok: true,
          actie: 'dkg_voltooid',
          setId: opdracht.setId,
          epoche: gecombineerd.deel.epoche,
          deelnemerIndex: opdracht.deelnemerIndex,
          groepsPubliekeSleutelHex: gecombineerd.groepsPubliekeSleutelHex,
          groepsPubliekeSleutelSpkiB64u: gecombineerd.groepsPubliekeSleutelSpkiB64u,
          deelnemerPubliekeSleutelsHex: gecombineerd.deelnemerPubliekeSleutelsHex,
        };
      }

      const deel = drempelDelen.get(opdracht.setId);
      if (!deel) return { ok: false, fout: 'DREMPEL_SLEUTELSET_ONBEKEND' };

      if (opdracht.actie === 'frost_ronde1') {
        const nonceSleutel = `${opdracht.setId}|${opdracht.sessieTekenId}`;
        if (frostNonces.has(nonceSleutel)) {
          return { ok: false, fout: 'FROST_TEKEN_SESSIE_BESTAAT_REEDS' };
        }
        const r1 = frostRonde1MaakToezegging(deel.index);
        frostNonces.set(nonceSleutel, r1.geheimeNonceStaat);
        return { ok: true, actie: 'frost_ronde1_toezegging', toezegging: r1.publiek, epoche: deel.epoche };
      }

      if (opdracht.actie === 'frost_ronde2') {
        const nonceSleutel = `${opdracht.setId}|${opdracht.sessieTekenId}`;
        const nonceStaat = frostNonces.get(nonceSleutel);
        if (!nonceStaat) return { ok: false, fout: 'FROST_NONCE_NIET_GEVONDEN' };
        frostNonces.delete(nonceSleutel);
        const r2 = frostRonde2TekenDeel({
          deel,
          geheimeNonceStaat: nonceStaat,
          boodschap: Buffer.from(opdracht.boodschapB64u, 'base64url'),
          toezeggingenLijst: opdracht.toezeggingenLijst,
          groepsPubliekeSleutelHex: opdracht.groepsPubliekeSleutelHex,
        });
        if (!r2.ok) return r2;
        return { ok: true, actie: 'frost_ronde2_deel', deelHandtekening: r2.deelHandtekening, epoche: deel.epoche };
      }

      if (opdracht.actie === 'ververs_maak_nulbijdrage') {
        const bijdrage = maakProactieveNulBijdrage({
          setId: deel.setId,
          vanEpoche: deel.epoche,
          afzenderIndex: deel.index,
          drempel: deel.drempel,
          totaal: deel.totaal,
        });
        return { ok: true, actie: 'ververs_nulbijdrage', bijdrage };
      }

      if (opdracht.actie === 'ververs_voorbereiden') {
        const vb = bereidEpocheVerversingVoor(deel, opdracht.bijdragen);
        if (!vb.ok) return vb;
        voorbereideVerversingen.set(opdracht.setId, vb.staat);
        return {
          ok: true,
          actie: 'ververs_voorbereid',
          vanEpoche: vb.staat.huidigDeel.epoche,
          naarEpoche: vb.staat.kandidaatNieuwDeel.epoche,
        };
      }

      const voorbereid = voorbereideVerversingen.get(opdracht.setId);
      if (!voorbereid) return { ok: false, fout: 'GEEN_VOORBEREIDE_VERVERSING' };
      voorbereideVerversingen.delete(opdracht.setId);
      const gekozen = rondEpocheVerversingAf(voorbereid, opdracht.besluit);
      drempelDelen.set(opdracht.setId, gekozen);
      return { ok: true, actie: 'ververs_afgerond', actieveEpoche: gekozen.epoche };
    }

    if (opdracht.actie === 'publiceer_identiteit_staat' || opdracht.actie === 'raadpleeg_identiteit_staat') {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'raadpleeg_identiteit_staat') {
        const gevonden = identiteitRegister.get(opdracht.persoonsId);
        if (!gevonden) return { ok: false, fout: 'IDENTITEIT_NIET_GEVONDEN' };
        return { ok: true, actie: 'identiteit_geraadpleegd', invoer: gevonden };
      }

      const sv = verifieerPersoonsStaat(opdracht.staat);
      if (!sv.ok) return sv;
      const persoonsId = opdracht.staat.oprichting.persoonsId;
      const bestaand = identiteitRegister.get(persoonsId);

      if (bestaand) {
        if (bestaand.staat.oprichting.handtekeningB64u !== opdracht.staat.oprichting.handtekeningB64u) {
          return { ok: false, fout: 'IDENTITEIT_OPRICHTING_VERSCHILT' };
        }
        if (
          opdracht.staat.actieveEpoche < bestaand.staat.actieveEpoche
          || (opdracht.staat.actieveEpoche === bestaand.staat.actieveEpoche
            && opdracht.staat.actieveWortelPubDerB64u !== bestaand.staat.actieveWortelPubDerB64u)
        ) {
          return { ok: false, fout: 'IDENTITEIT_EPOCHE_TERUGDRAAI_GEWEIGERD' };
        }
        if (
          bestaand.herstelAanvraag?.staat === 'geblokkeerd_door_eigenaar'
          && opdracht.herstelAanvraag?.aanvraagId === bestaand.herstelAanvraag.aanvraagId
          && opdracht.herstelAanvraag.staat !== 'geblokkeerd_door_eigenaar'
        ) {
          return { ok: false, fout: 'HERSTEL_BLOKKADE_KAN_NIET_WORDEN_GEWIST' };
        }
      }

      const samengevoegdeIntrekkingen = new Map<string, KlimopApparaatIntrekking>();
      for (const oud of bestaand?.intrekkingen ?? []) {
        samengevoegdeIntrekkingen.set(oud.ingetrokkenApparaatId, oud);
      }
      for (const intr of opdracht.intrekkingen ?? []) {
        const iv = verifieerApparaatIntrekking(intr, opdracht.staat);
        if (!iv.ok) return iv;
        samengevoegdeIntrekkingen.set(intr.ingetrokkenApparaatId, intr);
      }

      if (opdracht.herstelAanvraag && opdracht.herstelAanvraag.persoonsId !== persoonsId) {
        return { ok: false, fout: 'HERSTELAANVRAAG_PERSOON_KOMT_NIET_OVEREEN' };
      }

      const intrekkingenLijst = [...samengevoegdeIntrekkingen.values()];
      identiteitRegister.set(persoonsId, {
        staat: opdracht.staat,
        intrekkingen: intrekkingenLijst,
        herstelAanvraag: opdracht.herstelAanvraag ?? bestaand?.herstelAanvraag ?? null,
      });

      return {
        ok: true,
        actie: 'identiteit_gepubliceerd',
        persoonsId,
        actieveEpoche: opdracht.staat.actieveEpoche,
        aantalIntrekkingen: intrekkingenLijst.length,
      };
    }

    if (
      opdracht.actie === 'stel_bestuursgrondwet_in'
      || opdracht.actie === 'pas_uitgave_toe'
      || opdracht.actie === 'raadpleeg_uitgave_staat'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'raadpleeg_uitgave_staat') {
        return {
          ok: true,
          actie: 'uitgave_staat',
          actiefVolgnummer: huidigUitgaveVolgnummer,
          versieLabel: huidigeVersieLabel,
          minCompatibelVolgnummer: huidigMinCompatibelVolgnummer,
          aantalTerugdraaiingen,
        };
      }

      if (opdracht.actie === 'stel_bestuursgrondwet_in') {
        if (opdracht.grondwet.drempel < 2 || opdracht.erkendeDoelenRolPubDerB64u === opdracht.erkendeTijdstempelRolPubDerB64u) {
          return { ok: false, fout: 'GRONDWET_OF_ROLLENSCHEIDING_ONGELDIG' };
        }
        if (actieveGrondwet) {
          if (opdracht.grondwet.versieVolgnummer <= actieveGrondwet.versieVolgnummer) {
            return { ok: false, fout: 'GRONDWET_VERSIE_TERUGDRAAI_GEWEIGERD' };
          }
          const logboek = opdracht.bekrachtigdLogboek ?? [];
          const laatste = logboek[logboek.length - 1];
          if (
            !laatste
            || laatste.voorstel.categorie !== 'ecosysteem_regels_wijziging'
            || !verifieerBestuursBesluitLogboek(actieveGrondwet, logboek).ok
          ) {
            return { ok: false, fout: 'GRONDWET_WIJZIGING_VEREIST_FROST_BESLUIT_72U' };
          }
        }
        actieveGrondwet = opdracht.grondwet;
        erkendeDoelenRolPub = opdracht.erkendeDoelenRolPubDerB64u;
        erkendeTijdstempelRolPub = opdracht.erkendeTijdstempelRolPubDerB64u;
        return {
          ok: true,
          actie: 'bestuursgrondwet_ingesteld',
          grondwetId: actieveGrondwet.grondwetId,
          versieVolgnummer: actieveGrondwet.versieVolgnummer,
        };
      }

      if (!actieveGrondwet) {
        return { ok: false, fout: 'GEEN_BESTUURSGRONDWET_OP_KNOOPPUNT' };
      }

      const vBundel = verifieerUitgaveBundel({
        grondwet: actieveGrondwet,
        bundel: opdracht.bundel,
        huidigGeinstalleerdVolgnummer: huidigUitgaveVolgnummer,
        ontvangenPakketInhoud: Buffer.from(opdracht.pakketInhoudB64u, 'base64url'),
        ontvangenWebClientInhoud: Buffer.from(opdracht.webClientInhoudB64u, 'base64url'),
        erkendeDoelenRolPubDerB64u: erkendeDoelenRolPub,
        erkendeTijdstempelRolPubDerB64u: erkendeTijdstempelRolPub,
        nuIso: opdracht.nuIso,
      });
      if (!vBundel.ok) return vBundel;

      const meting: KlimopUitrolGezondheidsMeting = {
        procesGestart: opdracht.gesimuleerdeMeting?.procesGestart ?? true,
        gegevensIntegriteitOk: opdracht.gesimuleerdeMeting?.gegevensIntegriteitOk ?? true,
        machtigingenGeldigOk: opdracht.gesimuleerdeMeting?.machtigingenGeldigOk ?? true,
        geenGeheimLekGedetecteerd: opdracht.gesimuleerdeMeting?.geenGeheimLekGedetecteerd ?? true,
      };
      const oordeel = beoordeelUitrolGezondheid(meting);
      if (!oordeel.gezond) {
        if (opdracht.bundel.doelen.isOnomkeerbareMigratie) {
          return {
            ok: false,
            fout: 'ONOMKEERBARE_UITGAVE_VEREIST_HERSTELPROCEDURE',
            details: [opdracht.bundel.doelen.onomkeerbareHerstelProcedureId!, ...oordeel.gefaaldeControles],
          };
        }
        // Автоматичне безпечне повернення попередньої версії при порушенні показників (§24 маніфесту)
        aantalTerugdraaiingen++;
        return {
          ok: false,
          fout: 'UITGAVE_GEZONDHEIDSCONTROLE_MISLUKT_TERUGGEDRAAID',
          details: oordeel.gefaaldeControles,
        };
      }

      huidigUitgaveVolgnummer = opdracht.bundel.doelen.uitgaveVolgnummer;
      huidigeVersieLabel = opdracht.bundel.doelen.versieLabel;
      huidigMinCompatibelVolgnummer = opdracht.bundel.doelen.minCompatibelVolgnummer;
      return {
        ok: true,
        actie: 'uitgave_geactiveerd',
        actiefVolgnummer: huidigUitgaveVolgnummer,
        versieLabel: huidigeVersieLabel,
        minCompatibelVolgnummer: huidigMinCompatibelVolgnummer,
      };
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
          geregistreerdeIdentiteiten: identiteitRegister.size,
          actiefUitgaveVolgnummer: huidigUitgaveVolgnummer,
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
    actieveDrempelEpoche(setId: string) {
      return drempelDelen.get(setId)?.epoche ?? null;
    },
    aantalGeregistreerdeIdentiteiten() {
      return identiteitRegister.size;
    },
    actiefUitgaveVolgnummer() {
      return huidigUitgaveVolgnummer;
    },
    aantalUitgaveTerugdraaiingen() {
      return aantalTerugdraaiingen;
    },
    estafetteTeller() {
      return aantalEstafettes;
    },
    async sluit() {
      for (const s of sessies.values()) sluitStengelSessie(s);
      sessies.clear();
      for (const n of frostNonces.values()) {
        n.dScalairBuf.fill(0);
        n.eScalairBuf.fill(0);
      }
      frostNonces.clear();
      drempelDelen.clear();
      voorbereideVerversingen.clear();
      identiteitRegister.clear();
      actieveGrondwet = null;
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
