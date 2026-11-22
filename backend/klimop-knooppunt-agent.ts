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

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  berekenKnooppuntId,
  canoniekeJson,
  verifieerKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopMachtDomein,
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
} from '../shared/klimop/drempelsleutels';
import {
  berekenVerversingBesluitId,
  maakDrempelOntvangstSleutel,
  ontsleutelDkgPakketVoorOntvanger,
  ontsleutelNulBijdrageVoorOntvanger,
  verifieerDrempelSamenstelling,
  versleutelDkgPakket,
  versleutelNulBijdrage,
  type KlimopDrempelDeelnemer,
  type KlimopDrempelOntvangstSleutel,
  type VersleuteldDkgRondePakket,
  type VersleuteldeNulBijdrage,
} from '../shared/klimop/drempel-vervoer';
import { bewaarDrempelStaat, laadDrempelStaat, legeDrempelStaat as laadLegeStaat } from './klimop-knooppunt-staat';
import {
  heeftGeldigGemeenschappelijkRotatieVoorvoegsel,
  verifieerApparaatIntrekking,
  verifieerPersoonsStaat,
  type KlimopApparaatIntrekking,
  type KlimopHerstelAanvraag,
  type KlimopPersoonsStaat,
} from '../shared/klimop/identiteit';
import {
  beoordeelUitrolGezondheid,
  berekenGrondwetWijzigingSha256,
  verifieerAanvankelijkeGrondwetFrostHandtekening,
  verifieerBestuursBesluitLogboek,
  verifieerBestuursGrondwetVorm,
  verifieerUitgaveBundel,
  type KlimopBekrachtigdBestuursBesluit,
  type KlimopBestuursGrondwet,
  type KlimopUitrolGezondheidsMeting,
  type KlimopVolledigeUitgaveBundel,
} from '../shared/klimop/bestuur';
import {
  berekenBlindeIntegriteitBewijs,
  type KlimopBlindeIntegriteitAntwoord,
} from '../shared/klimop/immuunsysteem';
import {
  maakLegeDienstCrdtStaat,
  voegCrdtStatenSamen,
  type KlimopDienstCrdtStaat,
  type KlimopDienstId,
} from '../shared/klimop/diensten';
import {
  beoordeelUitvoeringUitgesteldeOperatie,
  verifieerUitgesteldeKritiekeOperatie,
  type KlimopOperatieAnnulering,
  type KlimopUitgesteldeKritiekeOperatie,
  type OnopvallendSignaalPakket,
} from '../shared/klimop/mensbescherming';
import {
  beoordeelSybilEnSpreidingsWeerstand,
  berekenEerlijkeMiddelenBalans,
  verifieerHechtrankToetredingsBewijs,
  verifieerMiddelenBijdrageKwitantie,
  verifieerVeiligeKnooppuntUittreding,
  type EerlijkeVoedingBalans,
  type HechtrankToetredingsBewijs,
  type KlimopMiddelenBijdrageKwitantie,
  type SybilWeerstandVerslag,
  type VeiligeKnooppuntUittredingBewijs,
} from '../shared/klimop/hechtranken';
import {
  verifieerOnafhankelijkAuditRapport,
  type KlimopOnafhankelijkAuditRapport,
} from '../shared/klimop/beveiligingsaudit';
import {
  verifieerKlimopZaadPakket,
  verifieerOpvolgingsOverdracht,
  type KlimopOpvolgingsOverdracht,
  type KlimopZaadPakket,
} from '../shared/klimop/zaden';

export type KnooppuntOpdracht =
  | { actie: 'ping'; bericht: string }
  | { actie: 'bewaar_blok'; blokSha256: string; cijfertekstB64u: string; mandaat: KlimopOndertekendMandaat }
  | { actie: 'haal_blok'; blokSha256: string; mandaat: KlimopOndertekendMandaat }
  | { actie: 'wis_blok'; blokSha256: string; mandaat: KlimopOndertekendMandaat }
  | {
      actie: 'controleer_blok_integriteit';
      blokSha256: string;
      uitdagingNonceHex: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'dkg_maak_ontvangstsleutel';
      setId: string;
      deelnemerIndex: number;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'dkg_maak_bijdrage';
      setId: string;
      deelnemerIndex: number;
      drempel: number;
      totaal: number;
      /** KLIMOP-019: повний склад із підписаними ключами отримання — вузол перевіряє його сам. */
      deelnemers: readonly KlimopDrempelDeelnemer[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'dkg_voltooi_sleutel';
      setId: string;
      deelnemerIndex: number;
      alleBijdragen: readonly VersleuteldDkgRondePakket[];
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
      actie: 'frost_annuleer_ronde1';
      setId: string;
      sessieTekenId: string;
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
      bijdragen: readonly VersleuteldeNulBijdrage[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'ververs_afronden';
      setId: string;
      /** KLIMOP-019: відбиток рішення робить підтвердження ідемпотентним і прив'язаним до конкретної підготовки. */
      besluitId: string;
      besluit: 'bevestig' | 'afbreken';
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'ververs_status';
      setId: string;
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
      aanvankelijkeFrostHandtekeningHex?: string;
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
      actie: 'draai_laatste_uitgave_terug';
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_uitgave_staat';
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'synchroniseer_dienst_crdt';
      inkomendeStaat: KlimopDienstCrdtStaat;
      toegestaneApparaatPubSleutels?: readonly string[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_dienst_crdt';
      dienstId: KlimopDienstId;
      dienstPsid: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'ontvang_onopvallend_signaal';
      pakket: OnopvallendSignaalPakket;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'haal_voogd_signalen_op';
      voogdId: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'registreer_uitgestelde_operatie';
      operatie: KlimopUitgesteldeKritiekeOperatie;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'annuleer_uitgestelde_operatie';
      annulering: KlimopOperatieAnnulering;
      toegestaneAnnuleerPubSleutels: readonly string[];
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'controleer_uitvoering_uitgestelde_operatie';
      operatieId: string;
      toegestaneAnnuleerPubSleutels: readonly string[];
      actiefStilDwangAlarm: boolean;
      nuIso: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'registreer_knooppunt_toetreding';
      bewijs: HechtrankToetredingsBewijs;
      erkendeSponsorPubSleutels: readonly string[];
      nuIso?: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'registreer_middelen_kwitantie';
      kwitantie: KlimopMiddelenBijdrageKwitantie;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'registreer_veilige_uittreding';
      uittreding: VeiligeKnooppuntUittredingBewijs;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_uitbreiding_en_voeding';
      deelnemerId: string;
      vereisteDrempel: number;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'registreer_beveiligingsaudit_rapport';
      rapport: KlimopOnafhankelijkAuditRapport;
      erkendeAuditorSleutels: ReadonlyArray<{
        auditorKnooppuntId: string;
        ed25519PubliekDerB64u: string;
        mlDsa65PubliekSpkiB64u: string;
      }>;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_beveiligingsaudit_staat';
      auditId: string;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'bewaar_gevalideerd_zaad_pakket';
      pakket: KlimopZaadPakket;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'registreer_opvolgings_overdracht';
      overdracht: KlimopOpvolgingsOverdracht;
      mandaat: KlimopOndertekendMandaat;
    }
  | {
      actie: 'raadpleeg_zaad_en_opvolging';
      zaadId: string;
      mandaat: KlimopOndertekendMandaat;
    };

export interface KlimopIdentiteitRegisterInvoer {
  staat: KlimopPersoonsStaat;
  intrekkingen: readonly KlimopApparaatIntrekking[];
  herstelAanvraag: KlimopHerstelAanvraag | null;
}

export type KnooppuntOpdrachtAntwoord =
  | { ok: true; actie: 'pong'; knooppuntId: string; echo: string; vertrouwensModus?: 'streng' | 'open_proef' }
  | { ok: true; actie: 'opgeslagen'; blokSha256: string; grootteBytes: number }
  | { ok: true; actie: 'opgehaald'; blokSha256: string; cijfertekstB64u: string }
  | { ok: true; actie: 'gewist'; blokSha256: string; bestond: boolean }
  | { ok: true; actie: 'blok_integriteit_bewijs'; bewijs: KlimopBlindeIntegriteitAntwoord }
  | { ok: true; actie: 'dkg_ontvangstsleutel'; ontvangstSleutel: KlimopDrempelOntvangstSleutel }
  | { ok: true; actie: 'dkg_bijdrage'; pakket: VersleuteldDkgRondePakket; samenstellingHex: string }
  | {
      ok: true;
      actie: 'dkg_voltooid';
      setId: string;
      epoche: number;
      deelnemerIndex: number;
      samenstellingHex: string;
      groepsPubliekeSleutelHex: string;
      groepsPubliekeSleutelSpkiB64u: string;
      deelnemerPubliekeSleutelsHex: Record<number, string>;
    }
  | { ok: true; actie: 'frost_ronde1_toezegging'; toezegging: FrostRonde1PubliekeToezegging; epoche: number }
  | { ok: true; actie: 'frost_ronde2_deel'; deelHandtekening: FrostRonde2DeelHandtekening; epoche: number }
  | { ok: true; actie: 'frost_ronde1_geannuleerd'; bestond: boolean }
  | { ok: true; actie: 'ververs_nulbijdrage'; bijdrage: VersleuteldeNulBijdrage }
  | { ok: true; actie: 'ververs_voorbereid'; vanEpoche: number; naarEpoche: number; besluitId: string; herhaald: boolean }
  | { ok: true; actie: 'ververs_afgerond'; actieveEpoche: number; besluitId: string; herhaald: boolean }
  | {
      ok: true;
      actie: 'ververs_status';
      actieveEpoche: number;
      voorbereidBesluitId: string | null;
      voorbereidNaarEpoche: number | null;
    }
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
      actie: 'uitgave_teruggedraaid';
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
  | {
      ok: true;
      actie: 'dienst_crdt_staat';
      staat: KlimopDienstCrdtStaat;
      aantalElementen: number;
    }
  | {
      ok: true;
      actie: 'onopvallend_signaal_ontvangen';
      pakketId: string;
      vasteCijfertekstBytes: 256;
    }
  | {
      ok: true;
      actie: 'voogd_signalen_opgehaald';
      pakketten: readonly OnopvallendSignaalPakket[];
    }
  | {
      ok: true;
      actie: 'uitgestelde_operatie_geregistreerd';
      operatieId: string;
      uitvoerbaarVanaf: string;
    }
  | {
      ok: true;
      actie: 'uitgestelde_operatie_geannuleerd';
      operatieId: string;
    }
  | {
      ok: true;
      actie: 'uitgestelde_operatie_uitvoerbaarheid';
      operatieId: string;
      magUitvoeren: boolean;
      redenIndienGeweigerd: string | null;
    }
  | {
      ok: true;
      actie: 'knooppunt_toetreding_geregistreerd';
      toetredingId: string;
      knooppuntId: string;
      actieveToetredingen: number;
    }
  | {
      ok: true;
      actie: 'middelen_kwitantie_geregistreerd';
      kwitantieId: string;
      totaalKwitanties: number;
    }
  | {
      ok: true;
      actie: 'veilige_uittreding_geregistreerd';
      uittredingId: string;
      uitgetredenKnooppuntId: string;
      actieveToetredingen: number;
    }
  | {
      ok: true;
      actie: 'uitbreiding_en_voeding_overzicht';
      sybilVerslag: SybilWeerstandVerslag;
      voedingBalans: EerlijkeVoedingBalans;
      actieveKnooppuntIds: readonly string[];
      uitgetredenKnooppuntIds: readonly string[];
    }
  | {
      ok: true;
      actie: 'beveiligingsaudit_rapport_geregistreerd';
      auditId: string;
      vrijgegevenVoorEtappe12: boolean;
    }
  | {
      ok: true;
      actie: 'beveiligingsaudit_staat';
      rapport: KlimopOnafhankelijkAuditRapport;
    }
  | {
      ok: true;
      actie: 'zaad_pakket_opgeslagen';
      zaadId: string;
      merkleWortelSha256: string;
      geverifieerdeModules: number;
      grondwetIngesteld?: boolean;
    }
  | {
      ok: true;
      actie: 'opvolgings_overdracht_geregistreerd';
      overdrachtId: string;
      nieuweGrondwetVersie: number;
    }
  | {
      ok: true;
      actie: 'zaad_en_opvolging_staat';
      pakket: KlimopZaadPakket | null;
      opvolgingen: readonly KlimopOpvolgingsOverdracht[];
    }
  | { ok: false; fout: string; details?: string[] };

export interface EstafetteVerzoek {
  schema: 1;
  vanKnooppuntId: string;
  doelKnooppuntId: string;
  doelPad: '/klimop/v1/handdruk' | '/klimop/v1/kader';
  verpakteInhoud: StengelHanddrukAanvraag | StengelVersleuteldKader;
  /** KLIMOP-022: залишковий маршрут після поточного проміжного вузла (дозволяє >= 2 проміжних вузлів). */
  resterendPad?: readonly string[];
  /** KLIMOP-022: паспорт та підпис Ed25519 відправника конверта проти підробки vanKnooppuntId. */
  afzenderIdentiteit?: KlimopKnooppuntIdentiteit;
  handtekeningB64u?: string;
  hopTeller?: number;
}

const ESTAFETTE_DOMEIN = 'klimop-estafette-v1|';

function maakEstafetteHandtekeningBoodschap(verzoek: {
  schema: 1;
  vanKnooppuntId: string;
  doelKnooppuntId: string;
  doelPad: string;
  verpakteInhoud: unknown;
}): Buffer {
  const inhoudSha256 = createHash('sha256').update(canoniekeJson(verzoek.verpakteInhoud), 'utf8').digest('hex');
  return Buffer.from(
    ESTAFETTE_DOMEIN
      + canoniekeJson({
        schema: verzoek.schema,
        vanKnooppuntId: verzoek.vanKnooppuntId,
        doelKnooppuntId: verzoek.doelKnooppuntId,
        doelPad: verzoek.doelPad,
        inhoudSha256,
      }),
    'utf8',
  );
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
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(lichaam),
    });
    const data = await r.json();
    return { status: r.status, data };
  } catch {
    return { status: 503, data: { ok: false, fout: 'KNOOPPUNT_ONBEREIKBAAR' } };
  }
}

export interface KlimopProefKnooppunt {
  readonly identiteit: KlimopKnooppuntIdentiteit;
  readonly basisUrl: string;
  readonly poort: number;
  registreerBuurAdres(knooppuntId: string, basisUrl: string): void;
  plaatsKnooppuntInQuarantaine(knooppuntId: string): void;
  trekMandaatIn(mandaatId: string): void;
  stelLokaalStilDwangAlarmIn(actief: boolean, persoonsId?: string): void;
  aantalOpgeslagenBlokken(): number;
  leesRuwOpgeslagenBlok(blokSha256: string): Buffer | undefined;
  simuleerSchijfBeschadigingVoorProef(blokSha256: string): boolean;
  actieveDrempelEpoche(setId: string): number | null;
  aantalGeregistreerdeIdentiteiten(): number;
  actiefUitgaveVolgnummer(): number;
  aantalUitgaveTerugdraaiingen(): number;
  aantalActieveSessies(): number;
  aantalOpenFrostNonces(): number;
  aantalDienstCrdtRuimtes(): number;
  aantalUitgesteldeOperaties(): number;
  aantalActieveToetredingen(): number;
  aantalAuditRapporten(): number;
  aantalZaadPakketten(): number;
  /** KLIMOP-020: `streng` — є довірений реєстр видавців; `open_proef` — лише для короткочасних штучних випробувань. */
  vertrouwensModus(): 'streng' | 'open_proef';
  estafetteTeller(): number;
  sluit(): Promise<void>;
}

/** Піднімає живий локальний вузол випробувальної мережі «Плюща» на `127.0.0.1` (або заданій адресі полігона). */
export async function startKlimopProefKnooppunt(config: {
  knooppunt: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
  luisterHost?: string;
  poort?: number;
  /**
   * KLIMOP-019: шлях до зашифрованого файла порогового стану (частки, ключі отримання, підготовлені й
   * завершені переходи епох). Без нього стан живе лише в пам'яті процесу (як у короткочасних випробуваннях).
   */
  staatBestand?: string;
  /**
   * KLIMOP-020: довірений реєстр видавців мандатів (ідентифікатори вузлів). Якщо задано — суворий режим:
   * видавець і зараховані підписанти мають бути в реєстрі, мандат мусить мати явний перелік дозволених дій,
   * об'єкт дії перевіряється за переліком `objectIds`, а сеанс подає лише видавець, підписант або вповноважений
   * відправник. Без реєстру вузол працює в явному режимі `open_proef` (лише для штучних випробувань).
   */
  vertrouwdeUitgevers?: readonly string[];
  /**
   * KLIMOP-020 / KLIMOP-022: зовнішній початковий якір довіри для конституції, «Насіння» та актів спадкоємності.
   */
  beginAnker?: {
    frostGroepsPubliekeSleutelHex: string;
    zaadBewaarderEd25519PubDerB64u?: string;
    zaadBewaarderMlDsa65PubSpkiB64u?: string;
    erkendeDoelenRolPubDerB64u?: string;
    erkendeTijdstempelRolPubDerB64u?: string;
  };
  /** KLIMOP-020: локальні довірені корені на вузлі замість сліпої довіри полям мережевого запиту. */
  toegestaneSynchronisatieApparaatPubSleutels?: readonly string[];
  toegestaneAnnuleerPubSleutels?: readonly string[];
  erkendeSponsorPubSleutels?: readonly string[];
  erkendeAuditorSleutels?: ReadonlyArray<{
    auditorKnooppuntId: string;
    ed25519PubliekDerB64u: string;
    mlDsa65PubliekSpkiB64u: string;
  }>;
  /** KLIMOP-022: локальний авторитетний стан тихої тривоги примусу на вузлі (не скидається мережевим запитом). */
  initieelActiefStilDwangAlarm?: boolean;
  actieveStilDwangAlarmPersoonsIds?: readonly string[];
  /** KLIMOP-021: межа одночасних сеансів Стебел, час життя сеансу та час життя одноразових станів FROST. */
  maxActieveSessies?: number;
  sessieLevensduurMs?: number;
  frostNonceTtlMs?: number;
  /** Авторитетний годинник вузла одержувача (типово `new Date().toISOString()`). */
  klok?: () => string;
}): Promise<KlimopProefKnooppunt> {
  const { knooppunt } = config;
  const host = config.luisterHost ?? '127.0.0.1';
  const klok = config.klok ?? (() => new Date().toISOString());
  const maxActieveSessies = Math.max(1, config.maxActieveSessies ?? 1024);
  const frostNonceTtlMs = Math.max(1_000, config.frostNonceTtlMs ?? 5 * 60 * 1000);
  const MAX_FROST_NONCES = 1024;
  const sessies = new Map<string, KlimopStengelSessie>();
  const blokOpslag = new Map<string, Buffer>();
  const drempelStaat = config.staatBestand ? laadDrempelStaat(config.staatBestand, knooppunt) : laadLegeStaat();
  function bewaarDrempel(): void {
    if (config.staatBestand) bewaarDrempelStaat(config.staatBestand, knooppunt, drempelStaat);
  }
  const frostNonces = new Map<string, { staat: FrostGeheimeNonceStaat; verlooptOpMs: number }>();

  function ruimVerlopenSessiesOp(nuMs: number): void {
    if (!Number.isFinite(nuMs)) return;
    for (const [sid, s] of [...sessies.entries()]) {
      if (s.gesloten || nuMs > s.verlooptOpMs) {
        sluitStengelSessie(s);
        sessies.delete(sid);
      }
    }
  }

  function ruimVerlopenFrostNoncesOp(nuMs: number): void {
    if (!Number.isFinite(nuMs)) return;
    for (const [sleutel, invoer] of [...frostNonces.entries()]) {
      if (nuMs > invoer.verlooptOpMs) {
        invoer.staat.dScalairBuf.fill(0);
        invoer.staat.eScalairBuf.fill(0);
        frostNonces.delete(sleutel);
      }
    }
  }

  const identiteitRegister = new Map<string, KlimopIdentiteitRegisterInvoer>();
  const dienstCrdtRuimtes = new Map<string, KlimopDienstCrdtStaat>();
  const voogdSignaalBussen = new Map<string, OnopvallendSignaalPakket[]>();
  const uitgesteldeOperaties = new Map<string, KlimopUitgesteldeKritiekeOperatie>();
  const operatieAnnuleringen = new Map<string, KlimopOperatieAnnulering>();
  const actieveToetredingen = new Map<string, HechtrankToetredingsBewijs>();
  const ingetrokkenToetredingIds = new Set<string>();
  const middelenKwitanties = new Map<string, KlimopMiddelenBijdrageKwitantie>();
  const veiligeUittredingen = new Map<string, VeiligeKnooppuntUittredingBewijs>();
  const auditRapporten = new Map<string, KlimopOnafhankelijkAuditRapport>();
  const zaadPakketten = new Map<string, KlimopZaadPakket>();
  const opvolgingsOverdrachten: KlimopOpvolgingsOverdracht[] = [];
  const toegepasteBesluitSha256s = new Set<string>();
  const toegepasteOpvolgingIds = new Set<string>();
  const buurAdressen = new Map<string, string>();
  const quarantaineKnooppunten = new Set<string>();
  const ingetrokkenMandaten = new Set<string>();
  let lokaalActiefStilDwangAlarm = Boolean(config.initieelActiefStilDwangAlarm);
  const actieveDwangAlarmPersonen = new Set<string>(config.actieveStilDwangAlarmPersoonsIds ?? []);
  let actieveGrondwet: KlimopBestuursGrondwet | null = null;
  let erkendeDoelenRolPub = '';
  let erkendeTijdstempelRolPub = '';
  let huidigUitgaveVolgnummer = 1;
  let huidigeVersieLabel = 'klimop-basis-1.0.0';
  let huidigMinCompatibelVolgnummer = 1;
  let laatsteOmkeerbareUitgave: {
    pakket: Buffer;
    webClient: Buffer;
    staatJson: string;
    pakketSha: string;
    volgnummer: number;
    versieLabel: string;
    minCompatibelVolgnummer: number;
  } | null = null;
  let aantalTerugdraaiingen = 0;
  let aantalEstafettes = 0;
  // KLIMOP-021: ізольований тимчасовий носій вузла для господарського запису й перевіреного відкату випусків
  const uitrolWerkMap = mkdtempSync(join(tmpdir(), 'klimop-uitrol-'));
  const uitrolActiefPakketPad = join(uitrolWerkMap, 'actief-pakket.bin');
  const uitrolActieveWebClientPad = join(uitrolWerkMap, 'actieve-webclient.js');
  const uitrolActieveStaatPad = join(uitrolWerkMap, 'actieve-staat.json');
  writeFileSync(uitrolActiefPakketPad, Buffer.from('klimop-basis-pakket-1.0.0', 'utf8'));
  writeFileSync(uitrolActieveWebClientPad, Buffer.from('export const versie = "1.0.0";', 'utf8'));
  writeFileSync(
    uitrolActieveStaatPad,
    JSON.stringify({ volgnummer: 1, versieLabel: 'klimop-basis-1.0.0', minCompatibelVolgnummer: 1, grondwetId: null }),
    'utf8',
  );
  const vertrouwdeUitgevers: ReadonlySet<string> | null = config.vertrouwdeUitgevers
    ? new Set(config.vertrouwdeUitgevers)
    : null;
  const vertrouwensModus: 'streng' | 'open_proef' = vertrouwdeUitgevers ? 'streng' : 'open_proef';
  const lokaleSyncApparaten: ReadonlySet<string> | null = config.toegestaneSynchronisatieApparaatPubSleutels
    ? new Set(config.toegestaneSynchronisatieApparaatPubSleutels)
    : null;
  const lokaleAnnuleerSleutels: ReadonlySet<string> | null = config.toegestaneAnnuleerPubSleutels
    ? new Set(config.toegestaneAnnuleerPubSleutels)
    : null;
  const lokaleSponsors: ReadonlySet<string> | null = config.erkendeSponsorPubSleutels
    ? new Set(config.erkendeSponsorPubSleutels)
    : null;
  const lokaleAuditors = config.erkendeAuditorSleutels ?? null;

  /** KLIMOP-020 / KLIMOP-022: витягує точний об'єкт дії для всіх плоских і вкладених команд вузла. */
  function objectIdVanOpdracht(opdracht: KnooppuntOpdracht): string | undefined {
    switch (opdracht.actie) {
      case 'ping':
      case 'raadpleeg_uitgave_staat':
      case 'draai_laatste_uitgave_terug':
        return undefined;
      case 'bewaar_blok':
      case 'haal_blok':
      case 'wis_blok':
      case 'controleer_blok_integriteit':
        return opdracht.blokSha256;
      case 'dkg_maak_ontvangstsleutel':
      case 'dkg_maak_bijdrage':
      case 'dkg_voltooi_sleutel':
      case 'frost_ronde1':
      case 'frost_ronde2':
      case 'frost_annuleer_ronde1':
      case 'ververs_maak_nulbijdrage':
      case 'ververs_voorbereiden':
      case 'ververs_afronden':
      case 'ververs_status':
        return opdracht.setId;
      case 'publiceer_identiteit_staat':
        return opdracht.staat?.oprichting?.persoonsId;
      case 'raadpleeg_identiteit_staat':
        return opdracht.persoonsId;
      case 'stel_bestuursgrondwet_in':
        return opdracht.grondwet?.grondwetId;
      case 'pas_uitgave_toe':
        return opdracht.bundel?.momentopname?.grondwetId;
      case 'synchroniseer_dienst_crdt':
        return opdracht.inkomendeStaat?.dienstPsid;
      case 'raadpleeg_dienst_crdt':
        return opdracht.dienstPsid;
      case 'ontvang_onopvallend_signaal':
        return opdracht.pakket?.ontvangerVoogdId;
      case 'haal_voogd_signalen_op':
        return opdracht.voogdId;
      case 'registreer_uitgestelde_operatie':
        return opdracht.operatie?.operatieId;
      case 'annuleer_uitgestelde_operatie':
        return opdracht.annulering?.operatieId;
      case 'controleer_uitvoering_uitgestelde_operatie':
        return opdracht.operatieId;
      case 'registreer_knooppunt_toetreding':
        return opdracht.bewijs?.knooppuntIdentiteit?.knooppuntId;
      case 'registreer_middelen_kwitantie':
        return opdracht.kwitantie?.deelnemerId;
      case 'registreer_veilige_uittreding':
        return opdracht.uittreding?.uittredendKnooppuntId;
      case 'raadpleeg_uitbreiding_en_voeding':
        return opdracht.deelnemerId;
      case 'registreer_beveiligingsaudit_rapport':
        return opdracht.rapport?.auditId;
      case 'raadpleeg_beveiligingsaudit_staat':
        return opdracht.auditId;
      case 'bewaar_gevalideerd_zaad_pakket':
        return opdracht.pakket?.zaadId;
      case 'registreer_opvolgings_overdracht':
        return opdracht.overdracht?.overdrachtId;
      case 'raadpleeg_zaad_en_opvolging':
        return opdracht.zaadId;
      default:
        return undefined;
    }
  }

  /** KLIMOP-022: відокремлює особисті дії власника від системних дій оператора вузла та керування правилами. */
  function toegestaneMachtDomeinenVanOpdracht(opdracht: KnooppuntOpdracht): readonly KlimopMachtDomein[] | undefined {
    switch (opdracht.actie) {
      case 'bewaar_blok':
      case 'haal_blok':
      case 'wis_blok':
      case 'controleer_blok_integriteit':
      case 'publiceer_identiteit_staat':
      case 'raadpleeg_identiteit_staat':
      case 'synchroniseer_dienst_crdt':
      case 'raadpleeg_dienst_crdt':
      case 'ontvang_onopvallend_signaal':
      case 'haal_voogd_signalen_op':
      case 'registreer_uitgestelde_operatie':
      case 'annuleer_uitgestelde_operatie':
      case 'controleer_uitvoering_uitgestelde_operatie':
        return ['persoonlijke_gegevens'];
      case 'stel_bestuursgrondwet_in':
      case 'pas_uitgave_toe':
      case 'draai_laatste_uitgave_terug':
      case 'raadpleeg_uitgave_staat':
      case 'registreer_knooppunt_toetreding':
      case 'registreer_middelen_kwitantie':
      case 'registreer_veilige_uittreding':
      case 'raadpleeg_uitbreiding_en_voeding':
      case 'registreer_beveiligingsaudit_rapport':
      case 'raadpleeg_beveiligingsaudit_staat':
      case 'bewaar_gevalideerd_zaad_pakket':
      case 'registreer_opvolgings_overdracht':
      case 'raadpleeg_zaad_en_opvolging':
        return ['knooppunt_beheer', 'netwerk_regels'];
      default:
        return undefined;
    }
  }

  function controleerRolEnMandaat(
    vereisteRol: 'opslag' | 'verificatie' | 'synchronisatie' | 'herstel' | 'verbinding',
    mandaat: KlimopOndertekendMandaat,
    sessie?: KlimopStengelSessie,
    opdracht?: KnooppuntOpdracht,
  ): { ok: true } | { ok: false; fout: string; details?: string[] } {
    if (!knooppunt.identiteit.rollen.includes(vereisteRol)) {
      return {
        ok: false,
        fout:
          vereisteRol === 'opslag'
            ? 'KNOOPPUNT_HEEFT_GEEN_OPSLAGROL'
            : vereisteRol === 'verificatie'
              ? 'KNOOPPUNT_HEEFT_GEEN_VERIFICATIEROL'
              : vereisteRol === 'synchronisatie'
                ? 'KNOOPPUNT_HEEFT_GEEN_SYNCHRONISATIEROL'
                : vereisteRol === 'herstel'
                  ? 'KNOOPPUNT_HEEFT_GEEN_HERSTELROL'
                  : 'KNOOPPUNT_HEEFT_GEEN_VERBINDINGSROL',
      };
    }
    const v = verifieerKlimopMandaat(mandaat, {
      ...(vertrouwensModus === 'streng' || config.klok ? { nuIso: klok() } : {}),
      ingetrokkenMandaatIds: ingetrokkenMandaten,
      ingetrokkenKnooppuntIds: quarantaineKnooppunten,
      toegestaneMachtDomeinen: opdracht ? toegestaneMachtDomeinenVanOpdracht(opdracht) : undefined,
      ...(vertrouwdeUitgevers
        ? {
            vertrouwdeUitgevers,
            vereisActieBereik: true,
            actie: opdracht?.actie,
            objectId: opdracht ? objectIdVanOpdracht(opdracht) : undefined,
            sessieAfzenderKnooppuntId: sessie?.tegenpartijIdentiteit.knooppuntId ?? '',
          }
        : {}),
    });
    if (!v.ok) return { ok: false, fout: 'MANDAAT_GEWEIGERD', details: v.fouten };
    if (
      mandaat.inhoud.ontvangerKnooppuntId !== knooppunt.identiteit.knooppuntId
      || !mandaat.inhoud.toegestaneRollen.includes(vereisteRol)
    ) {
      return {
        ok: false,
        fout:
          vereisteRol === 'opslag'
            ? 'MANDAAT_NIET_VOOR_DEZE_OPSLAGKNOOP'
            : vereisteRol === 'verificatie'
              ? 'MANDAAT_NIET_VOOR_DEZE_VERIFICATIEKNOOP'
              : vereisteRol === 'synchronisatie'
                ? 'MANDAAT_NIET_VOOR_DEZE_SYNCHRONISATIEKNOOP'
                : vereisteRol === 'herstel'
                  ? 'MANDAAT_NIET_VOOR_DEZE_HERSTELKNOOP'
                  : 'MANDAAT_NIET_VOOR_DEZE_VERBINDINGSKNOOP',
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
        vertrouwensModus,
      };
    }

    if (
      opdracht.actie === 'bewaar_blok'
      || opdracht.actie === 'haal_blok'
      || opdracht.actie === 'wis_blok'
      || opdracht.actie === 'controleer_blok_integriteit'
    ) {
      const mOk = controleerRolEnMandaat('opslag', opdracht.mandaat, sessie, opdracht);
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

      if (opdracht.actie === 'controleer_blok_integriteit') {
        const bew = berekenBlindeIntegriteitBewijs(gevonden, opdracht.uitdagingNonceHex);
        if (!bew.ok) return bew;
        return { ok: true, actie: 'blok_integriteit_bewijs', bewijs: bew.antwoord };
      }

      return { ok: true, actie: 'opgehaald', blokSha256: opdracht.blokSha256, cijfertekstB64u: gevonden.toString('base64url') };
    }

    if (
      opdracht.actie === 'dkg_maak_ontvangstsleutel'
      || opdracht.actie === 'dkg_maak_bijdrage'
      || opdracht.actie === 'dkg_voltooi_sleutel'
      || opdracht.actie === 'frost_ronde1'
      || opdracht.actie === 'frost_ronde2'
      || opdracht.actie === 'frost_annuleer_ronde1'
      || opdracht.actie === 'ververs_maak_nulbijdrage'
      || opdracht.actie === 'ververs_voorbereiden'
      || opdracht.actie === 'ververs_afronden'
      || opdracht.actie === 'ververs_status'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat, sessie, opdracht);
      if (!mOk.ok) return mOk;

      if (
        (opdracht.actie === 'dkg_maak_ontvangstsleutel' || opdracht.actie === 'dkg_maak_bijdrage' || opdracht.actie === 'dkg_voltooi_sleutel')
        && drempelStaat.drempelDelen[opdracht.setId]
      ) {
        // Жива частка ніколи не перезаписується новим DKG того самого набору
        return { ok: false, fout: 'DREMPEL_SLEUTELSET_BESTAAT_REEDS' };
      }

      if (opdracht.actie === 'dkg_maak_ontvangstsleutel') {
        const bestaand = drempelStaat.ontvangstGeheimen[opdracht.setId];
        if (bestaand) {
          if (bestaand.deelnemerIndex !== opdracht.deelnemerIndex) return { ok: false, fout: 'ONTVANGSTSLEUTEL_INDEX_VERSCHILT' };
          return { ok: true, actie: 'dkg_ontvangstsleutel', ontvangstSleutel: bestaand.publiek };
        }
        const nieuw = maakDrempelOntvangstSleutel({ setId: opdracht.setId, deelnemerIndex: opdracht.deelnemerIndex, knooppunt });
        drempelStaat.ontvangstGeheimen[opdracht.setId] = {
          deelnemerIndex: opdracht.deelnemerIndex,
          publiek: nieuw.publiek,
          geheimX25519Pkcs8B64u: nieuw.geheimX25519Pkcs8B64u,
        };
        bewaarDrempel();
        return { ok: true, actie: 'dkg_ontvangstsleutel', ontvangstSleutel: nieuw.publiek };
      }

      if (opdracht.actie === 'dkg_maak_bijdrage') {
        const eigen = drempelStaat.ontvangstGeheimen[opdracht.setId];
        if (!eigen || eigen.deelnemerIndex !== opdracht.deelnemerIndex) return { ok: false, fout: 'ONTVANGSTSLEUTEL_ONTBREEKT' };
        if (!Array.isArray(opdracht.deelnemers) || opdracht.deelnemers.length !== opdracht.totaal) {
          return { ok: false, fout: 'SAMENSTELLING_TOTAAL_VERSCHILT' };
        }
        const sv = verifieerDrempelSamenstelling(opdracht.setId, opdracht.deelnemers);
        if (!sv.ok) return sv;
        const eigenInSamenstelling = opdracht.deelnemers.find((d) => d.ontvangstSleutel.deelnemerIndex === opdracht.deelnemerIndex);
        if (
          !eigenInSamenstelling
          || eigenInSamenstelling.identiteit.knooppuntId !== knooppunt.identiteit.knooppuntId
          || eigenInSamenstelling.ontvangstSleutel.x25519PubliekB64u !== eigen.publiek.x25519PubliekB64u
        ) {
          // Координатор підмінив ключ отримання цього вузла — відмовляємо
          return { ok: false, fout: 'SAMENSTELLING_EIGEN_SLEUTEL_VERVALST' };
        }
        const open = maakDkgDeelnemerBijdrage({
          setId: opdracht.setId,
          afzenderIndex: opdracht.deelnemerIndex,
          drempel: opdracht.drempel,
          totaal: opdracht.totaal,
        });
        const pakket = versleutelDkgPakket({
          pakket: open,
          deelnemers: opdracht.deelnemers,
          samenstellingHex: sv.samenstellingHex,
          afzender: knooppunt,
        });
        drempelStaat.samenstellingen[opdracht.setId] = {
          deelnemers: [...opdracht.deelnemers],
          samenstellingHex: sv.samenstellingHex,
          deelnemerIndex: opdracht.deelnemerIndex,
        };
        bewaarDrempel();
        return { ok: true, actie: 'dkg_bijdrage', pakket, samenstellingHex: sv.samenstellingHex };
      }

      if (opdracht.actie === 'dkg_voltooi_sleutel') {
        const samenstelling = drempelStaat.samenstellingen[opdracht.setId];
        const eigen = drempelStaat.ontvangstGeheimen[opdracht.setId];
        if (!samenstelling || !eigen || samenstelling.deelnemerIndex !== opdracht.deelnemerIndex) {
          return { ok: false, fout: 'SAMENSTELLING_ONBEKEND' };
        }
        const openPakketten: DkgRondePakket[] = [];
        for (const vp of opdracht.alleBijdragen ?? []) {
          const o = ontsleutelDkgPakketVoorOntvanger({
            pakket: vp,
            deelnemers: samenstelling.deelnemers,
            samenstellingHex: samenstelling.samenstellingHex,
            ontvangerIndex: opdracht.deelnemerIndex,
            eigenGeheimX25519Pkcs8B64u: eigen.geheimX25519Pkcs8B64u,
          });
          if (!o.ok) return { ok: false, fout: o.fout };
          openPakketten.push(o.pakket);
        }
        const gecombineerd = combineerDkgBijdragenVoorDeelnemer(opdracht.deelnemerIndex, openPakketten);
        if (!gecombineerd.ok) return { ok: false, fout: gecombineerd.fout };
        drempelStaat.drempelDelen[opdracht.setId] = gecombineerd.deel;
        bewaarDrempel();
        return {
          ok: true,
          actie: 'dkg_voltooid',
          setId: opdracht.setId,
          epoche: gecombineerd.deel.epoche,
          deelnemerIndex: opdracht.deelnemerIndex,
          samenstellingHex: samenstelling.samenstellingHex,
          groepsPubliekeSleutelHex: gecombineerd.groepsPubliekeSleutelHex,
          groepsPubliekeSleutelSpkiB64u: gecombineerd.groepsPubliekeSleutelSpkiB64u,
          deelnemerPubliekeSleutelsHex: gecombineerd.deelnemerPubliekeSleutelsHex,
        };
      }

      const deel: FeldmanVssDeel | undefined = drempelStaat.drempelDelen[opdracht.setId];
      if (!deel) return { ok: false, fout: 'DREMPEL_SLEUTELSET_ONBEKEND' };

      const nuMsFrost = Date.parse(klok());
      ruimVerlopenFrostNoncesOp(nuMsFrost);

      if (opdracht.actie === 'frost_annuleer_ronde1') {
        const nonceSleutel = `${opdracht.setId}|${opdracht.sessieTekenId}`;
        const bestaand = frostNonces.get(nonceSleutel);
        if (bestaand) {
          bestaand.staat.dScalairBuf.fill(0);
          bestaand.staat.eScalairBuf.fill(0);
          frostNonces.delete(nonceSleutel);
          return { ok: true, actie: 'frost_ronde1_geannuleerd', bestond: true };
        }
        return { ok: true, actie: 'frost_ronde1_geannuleerd', bestond: false };
      }

      if (opdracht.actie === 'frost_ronde1') {
        const nonceSleutel = `${opdracht.setId}|${opdracht.sessieTekenId}`;
        if (frostNonces.has(nonceSleutel)) {
          return { ok: false, fout: 'FROST_TEKEN_SESSIE_BESTAAT_REEDS' };
        }
        if (frostNonces.size >= MAX_FROST_NONCES) {
          return { ok: false, fout: 'TE_VEEL_OPEN_FROST_NONCES' };
        }
        const r1 = frostRonde1MaakToezegging(deel);
        frostNonces.set(nonceSleutel, {
          staat: r1.geheimeNonceStaat,
          verlooptOpMs: (Number.isFinite(nuMsFrost) ? nuMsFrost : Date.now()) + frostNonceTtlMs,
        });
        return { ok: true, actie: 'frost_ronde1_toezegging', toezegging: r1.publiek, epoche: deel.epoche };
      }

      if (opdracht.actie === 'frost_ronde2') {
        const nonceSleutel = `${opdracht.setId}|${opdracht.sessieTekenId}`;
        const nonceInvoer = frostNonces.get(nonceSleutel);
        if (!nonceInvoer) return { ok: false, fout: 'FROST_NONCE_NIET_GEVONDEN' };
        frostNonces.delete(nonceSleutel);
        const r2 = frostRonde2TekenDeel({
          deel,
          geheimeNonceStaat: nonceInvoer.staat,
          boodschap: Buffer.from(opdracht.boodschapB64u, 'base64url'),
          toezeggingenLijst: opdracht.toezeggingenLijst,
          groepsPubliekeSleutelHex: opdracht.groepsPubliekeSleutelHex,
        });
        if (!r2.ok) return r2;
        return { ok: true, actie: 'frost_ronde2_deel', deelHandtekening: r2.deelHandtekening, epoche: deel.epoche };
      }

      const voorbereid = drempelStaat.voorbereideVerversingen[opdracht.setId];

      if (opdracht.actie === 'ververs_status') {
        return {
          ok: true,
          actie: 'ververs_status',
          actieveEpoche: deel.epoche,
          voorbereidBesluitId: voorbereid?.besluitId ?? null,
          voorbereidNaarEpoche: voorbereid?.staat.kandidaatNieuwDeel.epoche ?? null,
        };
      }

      const samenstelling = drempelStaat.samenstellingen[opdracht.setId];
      const eigen = drempelStaat.ontvangstGeheimen[opdracht.setId];
      if (!samenstelling || !eigen) return { ok: false, fout: 'SAMENSTELLING_ONBEKEND' };

      if (opdracht.actie === 'ververs_maak_nulbijdrage') {
        if (voorbereid) return { ok: false, fout: 'ANDERE_VERVERSING_IN_VOORBEREIDING' };
        const open = maakProactieveNulBijdrage({
          setId: deel.setId,
          vanEpoche: deel.epoche,
          afzenderIndex: deel.index,
          drempel: deel.drempel,
          totaal: deel.totaal,
        });
        const bijdrage = versleutelNulBijdrage({
          bijdrage: open,
          deelnemers: samenstelling.deelnemers,
          samenstellingHex: samenstelling.samenstellingHex,
          afzender: knooppunt,
        });
        return { ok: true, actie: 'ververs_nulbijdrage', bijdrage };
      }

      if (opdracht.actie === 'ververs_voorbereiden') {
        const besluitId = berekenVerversingBesluitId(opdracht.bijdragen ?? []);
        const reedsAfgerond = drempelStaat.afgerondeVerversingen[`${opdracht.setId}|${besluitId}`];
        if (reedsAfgerond) {
          return {
            ok: true,
            actie: 'ververs_voorbereid',
            vanEpoche: reedsAfgerond.besluit === 'bevestig' ? reedsAfgerond.actieveEpoche - 1 : reedsAfgerond.actieveEpoche,
            naarEpoche: reedsAfgerond.besluit === 'bevestig' ? reedsAfgerond.actieveEpoche : reedsAfgerond.actieveEpoche + 1,
            besluitId,
            herhaald: true,
          };
        }
        if (voorbereid) {
          if (voorbereid.besluitId !== besluitId) return { ok: false, fout: 'ANDERE_VERVERSING_IN_VOORBEREIDING' };
          return {
            ok: true,
            actie: 'ververs_voorbereid',
            vanEpoche: voorbereid.staat.huidigDeel.epoche,
            naarEpoche: voorbereid.staat.kandidaatNieuwDeel.epoche,
            besluitId,
            herhaald: true,
          };
        }
        const openBijdragen: ProactieveNulBijdrage[] = [];
        for (const vb of opdracht.bijdragen ?? []) {
          const o = ontsleutelNulBijdrageVoorOntvanger({
            bijdrage: vb,
            deelnemers: samenstelling.deelnemers,
            samenstellingHex: samenstelling.samenstellingHex,
            ontvangerIndex: deel.index,
            eigenGeheimX25519Pkcs8B64u: eigen.geheimX25519Pkcs8B64u,
          });
          if (!o.ok) return o;
          openBijdragen.push(o.bijdrage);
        }
        if (openBijdragen.length !== deel.totaal) return { ok: false, fout: 'NIET_ALLE_NULBIJDRAGEN_AANWEZIG' };
        const vb = bereidEpocheVerversingVoor(deel, openBijdragen);
        if (!vb.ok) return vb;
        drempelStaat.voorbereideVerversingen[opdracht.setId] = { besluitId, staat: vb.staat };
        bewaarDrempel();
        return {
          ok: true,
          actie: 'ververs_voorbereid',
          vanEpoche: vb.staat.huidigDeel.epoche,
          naarEpoche: vb.staat.kandidaatNieuwDeel.epoche,
          besluitId,
          herhaald: false,
        };
      }

      // ververs_afronden: ідемпотентне друге коло. Повтор того самого рішення повертає збережений результат;
      // протилежне рішення після завершення відхиляється, щоб група не розійшлася між епохами.
      const afgerondSleutel = `${opdracht.setId}|${opdracht.besluitId}`;
      const reedsAfgerond = drempelStaat.afgerondeVerversingen[afgerondSleutel];
      if (reedsAfgerond) {
        if (reedsAfgerond.besluit !== opdracht.besluit) return { ok: false, fout: 'VERVERSING_REEDS_ANDERS_AFGEROND' };
        return { ok: true, actie: 'ververs_afgerond', actieveEpoche: reedsAfgerond.actieveEpoche, besluitId: opdracht.besluitId, herhaald: true };
      }
      if (!voorbereid || voorbereid.besluitId !== opdracht.besluitId) return { ok: false, fout: 'GEEN_VOORBEREIDE_VERVERSING' };
      const gekozen = rondEpocheVerversingAf(voorbereid.staat, opdracht.besluit);
      drempelStaat.drempelDelen[opdracht.setId] = gekozen;
      drempelStaat.afgerondeVerversingen[afgerondSleutel] = {
        besluitId: opdracht.besluitId,
        besluit: opdracht.besluit,
        actieveEpoche: gekozen.epoche,
        afgerondOp: new Date().toISOString(),
      };
      delete drempelStaat.voorbereideVerversingen[opdracht.setId];
      // Стан записується до відповіді: втрата відповіді не втрачає рішення
      bewaarDrempel();
      return { ok: true, actie: 'ververs_afgerond', actieveEpoche: gekozen.epoche, besluitId: opdracht.besluitId, herhaald: false };
    }

    if (opdracht.actie === 'publiceer_identiteit_staat' || opdracht.actie === 'raadpleeg_identiteit_staat') {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat, sessie, opdracht);
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
        if (!heeftGeldigGemeenschappelijkRotatieVoorvoegsel(bestaand.staat, opdracht.staat)) {
          return { ok: false, fout: 'IDENTITEIT_GESCHIEDENIS_SPLITSING_GEWEIGERD' };
        }
        if (
          bestaand.herstelAanvraag?.staat === 'geblokkeerd_door_eigenaar'
          && opdracht.herstelAanvraag?.aanvraagId === bestaand.herstelAanvraag.aanvraagId
          && opdracht.herstelAanvraag.staat !== 'geblokkeerd_door_eigenaar'
        ) {
          return { ok: false, fout: 'HERSTEL_BLOKKADE_KAN_NIET_WORDEN_GEWIST' };
        }
      }

      const alleKandidaatIntrekkingen = [
        ...(bestaand?.intrekkingen ?? []),
        ...(opdracht.intrekkingen ?? []),
      ];
      const samengevoegdeIntrekkingen = new Map<string, KlimopApparaatIntrekking>();
      for (const oud of bestaand?.intrekkingen ?? []) {
        if (verifieerApparaatIntrekking(oud, opdracht.staat, alleKandidaatIntrekkingen).ok) {
          samengevoegdeIntrekkingen.set(oud.ingetrokkenApparaatId, oud);
        }
      }
      for (const intr of opdracht.intrekkingen ?? []) {
        const iv = verifieerApparaatIntrekking(intr, opdracht.staat, alleKandidaatIntrekkingen);
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
      || opdracht.actie === 'draai_laatste_uitgave_terug'
      || opdracht.actie === 'raadpleeg_uitgave_staat'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat, sessie, opdracht);
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

      if (opdracht.actie === 'draai_laatste_uitgave_terug') {
        if (!laatsteOmkeerbareUitgave) {
          return { ok: false, fout: 'GEEN_TERUGDRAAIBARE_UITGAVE_AANWEZIG' };
        }
        writeFileSync(uitrolActiefPakketPad, laatsteOmkeerbareUitgave.pakket);
        writeFileSync(uitrolActieveWebClientPad, laatsteOmkeerbareUitgave.webClient);
        writeFileSync(uitrolActieveStaatPad, laatsteOmkeerbareUitgave.staatJson, 'utf8');
        const hersteldSha = createHash('sha256').update(readFileSync(uitrolActiefPakketPad)).digest('hex');
        if (hersteldSha !== laatsteOmkeerbareUitgave.pakketSha) {
          return { ok: false, fout: 'UITGAVE_TERUGDRAAI_SCHIJFHERSTEL_MISLUKT' };
        }
        huidigUitgaveVolgnummer = laatsteOmkeerbareUitgave.volgnummer;
        huidigeVersieLabel = laatsteOmkeerbareUitgave.versieLabel;
        huidigMinCompatibelVolgnummer = laatsteOmkeerbareUitgave.minCompatibelVolgnummer;
        laatsteOmkeerbareUitgave = null;
        aantalTerugdraaiingen++;
        return {
          ok: true,
          actie: 'uitgave_teruggedraaid',
          actiefVolgnummer: huidigUitgaveVolgnummer,
          versieLabel: huidigeVersieLabel,
          minCompatibelVolgnummer: huidigMinCompatibelVolgnummer,
        };
      }

      if (opdracht.actie === 'stel_bestuursgrondwet_in') {
        const vorm = verifieerBestuursGrondwetVorm(opdracht.grondwet);
        if (
          !vorm.ok
          || !opdracht.erkendeDoelenRolPubDerB64u
          || !opdracht.erkendeTijdstempelRolPubDerB64u
          || opdracht.erkendeDoelenRolPubDerB64u === opdracht.erkendeTijdstempelRolPubDerB64u
        ) {
          return { ok: false, fout: vorm.ok ? 'GRONDWET_OF_ROLLENSCHEIDING_ONGELDIG' : vorm.fout };
        }
        if (!actieveGrondwet) {
          if (vertrouwensModus === 'streng' && !config.beginAnker) {
            return { ok: false, fout: 'GEEN_VERTROUWD_BEGINANKER' };
          }
          if (config.beginAnker) {
            if (
              opdracht.grondwet.frostGroepsPubliekeSleutelHex.toLowerCase()
              !== config.beginAnker.frostGroepsPubliekeSleutelHex.toLowerCase()
            ) {
              return { ok: false, fout: 'GRONDWET_KOMT_NIET_OVEREEN_MET_BEGINANKER' };
            }
            const rollenVerankerdInConfig =
              Boolean(config.beginAnker.erkendeDoelenRolPubDerB64u)
              && Boolean(config.beginAnker.erkendeTijdstempelRolPubDerB64u)
              && config.beginAnker.erkendeDoelenRolPubDerB64u === opdracht.erkendeDoelenRolPubDerB64u
              && config.beginAnker.erkendeTijdstempelRolPubDerB64u === opdracht.erkendeTijdstempelRolPubDerB64u;
            const frostBewijsOk = opdracht.aanvankelijkeFrostHandtekeningHex
              ? verifieerAanvankelijkeGrondwetFrostHandtekening({
                  grondwet: opdracht.grondwet,
                  erkendeDoelenRolPubDerB64u: opdracht.erkendeDoelenRolPubDerB64u,
                  erkendeTijdstempelRolPubDerB64u: opdracht.erkendeTijdstempelRolPubDerB64u,
                  frostGroepsPubliekeSleutelHex: config.beginAnker.frostGroepsPubliekeSleutelHex,
                  frostHandtekeningHex: opdracht.aanvankelijkeFrostHandtekeningHex,
                })
              : false;
            if (
              (vertrouwensModus === 'streng'
                || Boolean(opdracht.aanvankelijkeFrostHandtekeningHex)
                || Boolean(config.beginAnker.erkendeDoelenRolPubDerB64u))
              && !rollenVerankerdInConfig
              && !frostBewijsOk
            ) {
              return { ok: false, fout: 'GRONDWET_AANVANKELIJK_FROST_BEWIJS_VEREIST' };
            }
          }
        } else {
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
          if (toegepasteBesluitSha256s.has(laatste.besluitSha256)) {
            return { ok: false, fout: 'GRONDWET_BESLUIT_REEDS_TOEGEPAST' };
          }
          const nuMs = Date.parse(klok());
          const bekrachtigdMs = Date.parse(laatste.bekrachtigdOp);
          const maxGeldigheidMs = 30 * 24 * 3600 * 1000;
          if (
            !Number.isFinite(nuMs)
            || !Number.isFinite(bekrachtigdMs)
            || bekrachtigdMs > nuMs + 5 * 60_000
            || nuMs - bekrachtigdMs > maxGeldigheidMs
          ) {
            return { ok: false, fout: 'GRONDWET_BESLUIT_VERLOPEN_OF_TOEKOMSTIG' };
          }
          const verwachteInhoudSha = berekenGrondwetWijzigingSha256({
            vorigeGrondwet: actieveGrondwet,
            nieuweGrondwet: opdracht.grondwet,
            erkendeDoelenRolPubDerB64u: opdracht.erkendeDoelenRolPubDerB64u,
            erkendeTijdstempelRolPubDerB64u: opdracht.erkendeTijdstempelRolPubDerB64u,
          });
          if (laatste.voorstel.inhoudSha256 !== verwachteInhoudSha) {
            return { ok: false, fout: 'GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN' };
          }
          toegepasteBesluitSha256s.add(laatste.besluitSha256);
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

      const ontvangenPakketBuf = Buffer.from(opdracht.pakketInhoudB64u, 'base64url');
      const ontvangenWebClientBuf = Buffer.from(opdracht.webClientInhoudB64u, 'base64url');
      const vBundel = verifieerUitgaveBundel({
        grondwet: actieveGrondwet,
        bundel: opdracht.bundel,
        huidigGeinstalleerdVolgnummer: huidigUitgaveVolgnummer,
        ontvangenPakketInhoud: ontvangenPakketBuf,
        ontvangenWebClientInhoud: ontvangenWebClientBuf,
        erkendeDoelenRolPubDerB64u: erkendeDoelenRolPub,
        erkendeTijdstempelRolPubDerB64u: erkendeTijdstempelRolPub,
        nuIso: vertrouwensModus === 'streng' || config.klok ? klok() : opdracht.nuIso,
      });
      if (!vBundel.ok) return vBundel;

      // KLIMOP-021: справжнє збереження поточного знімка на тимчасовому носії, запис нового випуску на носій,
      // перечитування та господарська перевірка даних, прав і відсутності витоку таємних ключів
      const vorigPakket = readFileSync(uitrolActiefPakketPad);
      const vorigeWebClient = readFileSync(uitrolActieveWebClientPad);
      const vorigeStaatJson = readFileSync(uitrolActieveStaatPad, 'utf8');
      const vorigPakketSha = createHash('sha256').update(vorigPakket).digest('hex');

      writeFileSync(uitrolActiefPakketPad, ontvangenPakketBuf);
      writeFileSync(uitrolActieveWebClientPad, ontvangenWebClientBuf);
      const herlezenPakket = readFileSync(uitrolActiefPakketPad);
      const herlezenWebClient = readFileSync(uitrolActieveWebClientPad);
      const schijfPakketShaOk =
        herlezenPakket.length > 0
        && createHash('sha256').update(herlezenPakket).digest('hex') === opdracht.bundel.doelen.pakketSha256;
      const schijfWebShaOk =
        herlezenWebClient.length > 0
        && createHash('sha256').update(herlezenWebClient).digest('hex')
          === opdracht.bundel.doelen.webClientManifest.webClientBundelSha256;
      const samengevoegdTekst = `${herlezenPakket.toString('utf8')}\n${herlezenWebClient.toString('utf8')}`;
      const geenechtGeheimLek =
        !/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(samengevoegdTekst)
        && !/AGE-SECRET-KEY-1/.test(samengevoegdTekst);
      const echteMachtigingenOk =
        Boolean(actieveGrondwet)
        && Boolean(erkendeDoelenRolPub)
        && Boolean(erkendeTijdstempelRolPub)
        && erkendeDoelenRolPub !== erkendeTijdstempelRolPub;

      const meting: KlimopUitrolGezondheidsMeting = {
        procesGestart: herlezenPakket.length > 0 && (opdracht.gesimuleerdeMeting?.procesGestart ?? true),
        gegevensIntegriteitOk:
          schijfPakketShaOk && schijfWebShaOk && (opdracht.gesimuleerdeMeting?.gegevensIntegriteitOk ?? true),
        machtigingenGeldigOk: echteMachtigingenOk && (opdracht.gesimuleerdeMeting?.machtigingenGeldigOk ?? true),
        geenGeheimLekGedetecteerd:
          geenechtGeheimLek && (opdracht.gesimuleerdeMeting?.geenGeheimLekGedetecteerd ?? true),
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
        // Автоматичне безпечне повернення попередньої версії на тимчасовому носії зі звіркою відбитків даних і прав (§24)
        herlezenPakket.fill(0);
        herlezenWebClient.fill(0);
        writeFileSync(uitrolActiefPakketPad, vorigPakket);
        writeFileSync(uitrolActieveWebClientPad, vorigeWebClient);
        writeFileSync(uitrolActieveStaatPad, vorigeStaatJson, 'utf8');
        const hersteldPakketSha = createHash('sha256').update(readFileSync(uitrolActiefPakketPad)).digest('hex');
        if (hersteldPakketSha !== vorigPakketSha) {
          return { ok: false, fout: 'UITGAVE_TERUGDRAAI_SCHIJFHERSTEL_MISLUKT', details: oordeel.gefaaldeControles };
        }
        aantalTerugdraaiingen++;
        return {
          ok: false,
          fout: 'UITGAVE_GEZONDHEIDSCONTROLE_MISLUKT_TERUGGEDRAAID',
          details: oordeel.gefaaldeControles,
        };
      }

      laatsteOmkeerbareUitgave = opdracht.bundel.doelen.isOnomkeerbareMigratie
        ? null
        : {
            pakket: vorigPakket,
            webClient: vorigeWebClient,
            staatJson: vorigeStaatJson,
            pakketSha: vorigPakketSha,
            volgnummer: huidigUitgaveVolgnummer,
            versieLabel: huidigeVersieLabel,
            minCompatibelVolgnummer: huidigMinCompatibelVolgnummer,
          };
      huidigUitgaveVolgnummer = opdracht.bundel.doelen.uitgaveVolgnummer;
      huidigeVersieLabel = opdracht.bundel.doelen.versieLabel;
      huidigMinCompatibelVolgnummer = opdracht.bundel.doelen.minCompatibelVolgnummer;
      writeFileSync(
        uitrolActieveStaatPad,
        JSON.stringify({
          volgnummer: huidigUitgaveVolgnummer,
          versieLabel: huidigeVersieLabel,
          minCompatibelVolgnummer: huidigMinCompatibelVolgnummer,
          grondwetId: actieveGrondwet.grondwetId,
        }),
        'utf8',
      );
      return {
        ok: true,
        actie: 'uitgave_geactiveerd',
        actiefVolgnummer: huidigUitgaveVolgnummer,
        versieLabel: huidigeVersieLabel,
        minCompatibelVolgnummer: huidigMinCompatibelVolgnummer,
      };
    }

    if (opdracht.actie === 'synchroniseer_dienst_crdt' || opdracht.actie === 'raadpleeg_dienst_crdt') {
      const mOk = controleerRolEnMandaat('synchronisatie', opdracht.mandaat, sessie, opdracht);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'raadpleeg_dienst_crdt') {
        const sleutel = `${opdracht.dienstId}|${opdracht.dienstPsid}`;
        const staat = dienstCrdtRuimtes.get(sleutel) ?? maakLegeDienstCrdtStaat(opdracht.dienstId, opdracht.dienstPsid);
        return {
          ok: true,
          actie: 'dienst_crdt_staat',
          staat,
          aantalElementen: Object.keys(staat.elementen).length,
        };
      }

      const inkomend = opdracht.inkomendeStaat;
      if (!inkomend || !inkomend.dienstPsid.startsWith('psid1_')) {
        return { ok: false, fout: 'DIENST_CRDT_VEREIST_PSEUDONIEME_PSID' };
      }
      const sleutel = `${inkomend.dienstId}|${inkomend.dienstPsid}`;
      const bestaand = dienstCrdtRuimtes.get(sleutel) ?? maakLegeDienstCrdtStaat(inkomend.dienstId, inkomend.dienstPsid);
      // KLIMOP-020: у суворому режимі (або при наявності локального списку) довірені пристрої беруться лише з вузла, а не із запиту
      const gebruikLokaal = vertrouwensModus === 'streng' || lokaleSyncApparaten !== null;
      const toegestaanSet = gebruikLokaal
        ? lokaleSyncApparaten ?? undefined
        : opdracht.toegestaneApparaatPubSleutels
          ? new Set(opdracht.toegestaneApparaatPubSleutels)
          : undefined;
      const samengevoegd = voegCrdtStatenSamen(bestaand, inkomend, toegestaanSet, gebruikLokaal);
      if (!samengevoegd.ok) return samengevoegd;

      dienstCrdtRuimtes.set(sleutel, samengevoegd.samengevoegd);
      return {
        ok: true,
        actie: 'dienst_crdt_staat',
        staat: samengevoegd.samengevoegd,
        aantalElementen: Object.keys(samengevoegd.samengevoegd.elementen).length,
      };
    }

    if (
      opdracht.actie === 'ontvang_onopvallend_signaal'
      || opdracht.actie === 'haal_voogd_signalen_op'
      || opdracht.actie === 'registreer_uitgestelde_operatie'
      || opdracht.actie === 'annuleer_uitgestelde_operatie'
      || opdracht.actie === 'controleer_uitvoering_uitgestelde_operatie'
    ) {
      const mOk = controleerRolEnMandaat('herstel', opdracht.mandaat, sessie, opdracht);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'ontvang_onopvallend_signaal') {
        const ruwCt = Buffer.from(opdracht.pakket?.cijfertekstB64u ?? '', 'base64url');
        if (ruwCt.length !== 256 || !opdracht.pakket.ontvangerVoogdId) {
          return { ok: false, fout: 'SIGNAAL_PAKKET_AFWIJKENDE_LENGTE' };
        }
        const lijst = voogdSignaalBussen.get(opdracht.pakket.ontvangerVoogdId) ?? [];
        if (!lijst.some((p) => p.pakketId === opdracht.pakket.pakketId)) {
          lijst.push(opdracht.pakket);
          voogdSignaalBussen.set(opdracht.pakket.ontvangerVoogdId, lijst);
        }
        return {
          ok: true,
          actie: 'onopvallend_signaal_ontvangen',
          pakketId: opdracht.pakket.pakketId,
          vasteCijfertekstBytes: 256,
        };
      }

      if (opdracht.actie === 'haal_voogd_signalen_op') {
        return {
          ok: true,
          actie: 'voogd_signalen_opgehaald',
          pakketten: voogdSignaalBussen.get(opdracht.voogdId) ?? [],
        };
      }

      if (opdracht.actie === 'registreer_uitgestelde_operatie') {
        const vOp = verifieerUitgesteldeKritiekeOperatie(opdracht.operatie);
        if (!vOp.ok) return vOp;
        uitgesteldeOperaties.set(opdracht.operatie.operatieId, opdracht.operatie);
        return {
          ok: true,
          actie: 'uitgestelde_operatie_geregistreerd',
          operatieId: opdracht.operatie.operatieId,
          uitvoerbaarVanaf: opdracht.operatie.uitvoerbaarVanaf,
        };
      }

      const gebruikLokaleAnnuleer = vertrouwensModus === 'streng' || lokaleAnnuleerSleutels !== null;
      if (gebruikLokaleAnnuleer && (!lokaleAnnuleerSleutels || lokaleAnnuleerSleutels.size === 0)) {
        return { ok: false, fout: 'GEEN_LOKAAL_VERTROUWDE_ANNULEERSLEUTELS' };
      }
      const effectieveAnnuleerSleutels = gebruikLokaleAnnuleer
        ? lokaleAnnuleerSleutels!
        : new Set(opdracht.toegestaneAnnuleerPubSleutels);

      if (opdracht.actie === 'annuleer_uitgestelde_operatie') {
        const op = uitgesteldeOperaties.get(opdracht.annulering.operatieId);
        if (!op) return { ok: false, fout: 'UITGESTELDE_OPERATIE_NIET_GEVONDEN' };
        const proefBeoordeling = beoordeelUitvoeringUitgesteldeOperatie({
          operatie: op,
          annulering: opdracht.annulering,
          toegestaneAnnuleerPubSleutels: effectieveAnnuleerSleutels,
          actiefStilDwangAlarm: false,
          nuIso: op.uitvoerbaarVanaf,
        });
        if (proefBeoordeling.fout !== 'KRITIEKE_OPERATIE_GEANNULEERD_DOOR_EIGENAAR') {
          return { ok: false, fout: 'ANNULERING_HANDTEKENING_ONGELDIG' };
        }
        operatieAnnuleringen.set(op.operatieId, opdracht.annulering);
        return {
          ok: true,
          actie: 'uitgestelde_operatie_geannuleerd',
          operatieId: op.operatieId,
        };
      }

      const op = uitgesteldeOperaties.get(opdracht.operatieId);
      if (!op) return { ok: false, fout: 'UITGESTELDE_OPERATIE_NIET_GEVONDEN' };
      const lokaalAlarmVoorPersoon = lokaalActiefStilDwangAlarm || actieveDwangAlarmPersonen.has(op.persoonsId);
      const effectiefStilDwangAlarm =
        vertrouwensModus === 'streng'
          ? lokaalAlarmVoorPersoon
          : lokaalAlarmVoorPersoon || Boolean(opdracht.actiefStilDwangAlarm);
      const beoordeling = beoordeelUitvoeringUitgesteldeOperatie({
        operatie: op,
        annulering: operatieAnnuleringen.get(op.operatieId) ?? null,
        toegestaneAnnuleerPubSleutels: effectieveAnnuleerSleutels,
        actiefStilDwangAlarm: effectiefStilDwangAlarm,
        nuIso: vertrouwensModus === 'streng' || config.klok ? klok() : opdracht.nuIso,
      });
      return {
        ok: true,
        actie: 'uitgestelde_operatie_uitvoerbaarheid',
        operatieId: op.operatieId,
        magUitvoeren: beoordeling.magUitvoeren,
        redenIndienGeweigerd: beoordeling.fout,
      };
    }

    if (
      opdracht.actie === 'registreer_knooppunt_toetreding'
      || opdracht.actie === 'registreer_middelen_kwitantie'
      || opdracht.actie === 'registreer_veilige_uittreding'
      || opdracht.actie === 'raadpleeg_uitbreiding_en_voeding'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat, sessie, opdracht);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'registreer_knooppunt_toetreding') {
        const knId = opdracht.bewijs?.knooppuntIdentiteit?.knooppuntId ?? '';
        if (quarantaineKnooppunten.has(knId)) {
          return { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' };
        }
        const gebruikLokaleSponsors = vertrouwensModus === 'streng' || lokaleSponsors !== null;
        if (gebruikLokaleSponsors && (!lokaleSponsors || lokaleSponsors.size === 0)) {
          return { ok: false, fout: 'GEEN_LOKAAL_ERKENDE_SPONSORS' };
        }
        const vBew = verifieerHechtrankToetredingsBewijs({
          bewijs: opdracht.bewijs,
          erkendeSponsorPubSleutels: gebruikLokaleSponsors ? lokaleSponsors! : new Set(opdracht.erkendeSponsorPubSleutels),
          ingetrokkenToetredingIds,
          nuIso: vertrouwensModus === 'streng' || config.klok ? klok() : opdracht.nuIso,
        });
        if (!vBew.ok) return vBew;
        actieveToetredingen.set(knId, opdracht.bewijs);
        veiligeUittredingen.delete(knId);
        return {
          ok: true,
          actie: 'knooppunt_toetreding_geregistreerd',
          toetredingId: opdracht.bewijs.toetredingId,
          knooppuntId: knId,
          actieveToetredingen: actieveToetredingen.size,
        };
      }

      if (opdracht.actie === 'registreer_middelen_kwitantie') {
        const vKw = verifieerMiddelenBijdrageKwitantie(opdracht.kwitantie);
        if (!vKw.ok) return vKw;
        middelenKwitanties.set(opdracht.kwitantie.kwitantieId, opdracht.kwitantie);
        return {
          ok: true,
          actie: 'middelen_kwitantie_geregistreerd',
          kwitantieId: opdracht.kwitantie.kwitantieId,
          totaalKwitanties: middelenKwitanties.size,
        };
      }

      if (opdracht.actie === 'registreer_veilige_uittreding') {
        const vUit = verifieerVeiligeKnooppuntUittreding(opdracht.uittreding);
        if (!vUit.ok) return vUit;
        const uitId = opdracht.uittreding.uittredendKnooppuntId;
        const bestaand = actieveToetredingen.get(uitId);
        if (bestaand) {
          ingetrokkenToetredingIds.add(bestaand.toetredingId);
          actieveToetredingen.delete(uitId);
        }
        veiligeUittredingen.set(uitId, opdracht.uittreding);
        return {
          ok: true,
          actie: 'veilige_uittreding_geregistreerd',
          uittredingId: opdracht.uittreding.uittredingId,
          uitgetredenKnooppuntId: uitId,
          actieveToetredingen: actieveToetredingen.size,
        };
      }

      const actieveLijst = [...actieveToetredingen.values()];
      const sybilVerslag = beoordeelSybilEnSpreidingsWeerstand({
        toetredingen: actieveLijst,
        vereisteOnafhankelijkeDrempel: opdracht.vereisteDrempel,
        nuIso: klok(),
        ingetrokkenToetredingIds,
      });
      const voedingBalans = berekenEerlijkeMiddelenBalans(
        opdracht.deelnemerId,
        [...middelenKwitanties.values()],
      );
      return {
        ok: true,
        actie: 'uitbreiding_en_voeding_overzicht',
        sybilVerslag,
        voedingBalans,
        actieveKnooppuntIds: [...actieveToetredingen.keys()],
        uitgetredenKnooppuntIds: [...veiligeUittredingen.keys()],
      };
    }

    if (
      opdracht.actie === 'registreer_beveiligingsaudit_rapport'
      || opdracht.actie === 'raadpleeg_beveiligingsaudit_staat'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat, sessie, opdracht);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'registreer_beveiligingsaudit_rapport') {
        if (quarantaineKnooppunten.has(opdracht.rapport?.auditorKnooppuntId ?? '')) {
          return { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' };
        }
        const gebruikLokaleAuditors = vertrouwensModus === 'streng' || lokaleAuditors !== null;
        if (gebruikLokaleAuditors && (!lokaleAuditors || lokaleAuditors.length === 0)) {
          return { ok: false, fout: 'GEEN_LOKAAL_ERKENDE_AUDITORS' };
        }
        const vRap = verifieerOnafhankelijkAuditRapport({
          rapport: opdracht.rapport,
          erkendeAuditorSleutels: gebruikLokaleAuditors ? lokaleAuditors! : opdracht.erkendeAuditorSleutels,
        });
        if (!vRap.ok) return vRap;
        auditRapporten.set(opdracht.rapport.auditId, opdracht.rapport);
        return {
          ok: true,
          actie: 'beveiligingsaudit_rapport_geregistreerd',
          auditId: opdracht.rapport.auditId,
          vrijgegevenVoorEtappe12: opdracht.rapport.vrijgegevenVoorEtappe12,
        };
      }

      const gevondenRapport = auditRapporten.get(opdracht.auditId);
      if (!gevondenRapport) {
        return { ok: false, fout: 'AUDITRAPPORT_NIET_GEVONDEN' };
      }
      return {
        ok: true,
        actie: 'beveiligingsaudit_staat',
        rapport: gevondenRapport,
      };
    }

    if (
      opdracht.actie === 'bewaar_gevalideerd_zaad_pakket'
      || opdracht.actie === 'registreer_opvolgings_overdracht'
      || opdracht.actie === 'raadpleeg_zaad_en_opvolging'
    ) {
      const mOk = controleerRolEnMandaat('verificatie', opdracht.mandaat, sessie, opdracht);
      if (!mOk.ok) return mOk;

      if (opdracht.actie === 'bewaar_gevalideerd_zaad_pakket') {
        const verwachteFrostHex =
          actieveGrondwet?.frostGroepsPubliekeSleutelHex ?? config.beginAnker?.frostGroepsPubliekeSleutelHex;
        if (
          vertrouwensModus === 'streng'
          && (
            !verwachteFrostHex
            || !config.beginAnker?.zaadBewaarderEd25519PubDerB64u
            || !config.beginAnker?.zaadBewaarderMlDsa65PubSpkiB64u
          )
        ) {
          return { ok: false, fout: 'GEEN_VERTROUWD_BEGINANKER' };
        }
        const verwachteBewaarder = config.beginAnker?.zaadBewaarderEd25519PubDerB64u
          ? {
              ed25519PubliekDerB64u: config.beginAnker.zaadBewaarderEd25519PubDerB64u,
              mlDsa65PubliekSpkiB64u: config.beginAnker.zaadBewaarderMlDsa65PubSpkiB64u,
            }
          : undefined;
        const vZaad = verifieerKlimopZaadPakket(opdracht.pakket, verwachteFrostHex, verwachteBewaarder);
        if (!vZaad.ok) return vZaad;
        zaadPakketten.set(opdracht.pakket.zaadId, opdracht.pakket);
        let grondwetIngesteld = false;
        // KLIMOP-020: без зовнішнього якоря довіри пакет зберігається, але ніколи самовільно не встановлює конституцію
        if (!actieveGrondwet && config.beginAnker) {
          actieveGrondwet = opdracht.pakket.grondwet;
          grondwetIngesteld = true;
        }
        return {
          ok: true,
          actie: 'zaad_pakket_opgeslagen',
          zaadId: opdracht.pakket.zaadId,
          merkleWortelSha256: opdracht.pakket.merkleWortelSha256,
          geverifieerdeModules: vZaad.geverifieerdeModules,
          grondwetIngesteld,
        };
      }

      if (opdracht.actie === 'registreer_opvolgings_overdracht') {
        const huidigeFrostHex =
          actieveGrondwet?.frostGroepsPubliekeSleutelHex ?? config.beginAnker?.frostGroepsPubliekeSleutelHex;
        if (!huidigeFrostHex) {
          return { ok: false, fout: 'GEEN_VERTROUWD_BEGINANKER' };
        }
        if (
          actieveGrondwet
          && (
            opdracht.overdracht.vorigeGrondwet.grondwetId !== actieveGrondwet.grondwetId
            || opdracht.overdracht.vorigeGrondwet.versieVolgnummer !== actieveGrondwet.versieVolgnummer
          )
        ) {
          return { ok: false, fout: 'OPVOLGING_VORIGE_GRONDWET_KOMT_NIET_OVEREEN' };
        }
        if (toegepasteOpvolgingIds.has(opdracht.overdracht.overdrachtId)) {
          return { ok: false, fout: 'OPVOLGING_REEDS_TOEGEPAST' };
        }
        const nuMs = Date.parse(klok());
        const vanafMs = Date.parse(opdracht.overdracht.uitvoerbaarVanaf);
        if (!Number.isFinite(nuMs) || !Number.isFinite(vanafMs) || nuMs < vanafMs) {
          return { ok: false, fout: 'OPVOLGING_TIJDSLOT_72_UUR_NOG_ACTIEF' };
        }
        const vOpv = verifieerOpvolgingsOverdracht(opdracht.overdracht, huidigeFrostHex);
        if (!vOpv.ok) return vOpv;
        toegepasteOpvolgingIds.add(opdracht.overdracht.overdrachtId);
        opvolgingsOverdrachten.push(opdracht.overdracht);
        actieveGrondwet = opdracht.overdracht.nieuweGrondwet;
        return {
          ok: true,
          actie: 'opvolgings_overdracht_geregistreerd',
          overdrachtId: opdracht.overdracht.overdrachtId,
          nieuweGrondwetVersie: opdracht.overdracht.nieuweGrondwet.versieVolgnummer,
        };
      }

      return {
        ok: true,
        actie: 'zaad_en_opvolging_staat',
        pakket: zaadPakketten.get(opdracht.zaadId) ?? null,
        opvolgingen: [...opvolgingsOverdrachten],
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
          actieveToetredingen: actieveToetredingen.size,
          auditRapporten: auditRapporten.size,
          zaadPakketten: zaadPakketten.size,
          actiefUitgaveVolgnummer: huidigUitgaveVolgnummer,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/klimop/v1/handdruk') {
        const nuIsoHanddruk = klok();
        const nuMsHanddruk = Date.parse(nuIsoHanddruk);
        ruimVerlopenSessiesOp(nuMsHanddruk);
        if (sessies.size >= maxActieveSessies) {
          stuurJson(res, 429, { ok: false, fout: 'TE_VEEL_ACTIEVE_STENGEL_SESSIES' });
          return;
        }
        const aanvraag = (await leesJsonLichaam(req)) as StengelHanddrukAanvraag;
        const uit = beantwoordStengelHanddruk(knooppunt, aanvraag, {
          ingetrokkenKnooppuntIds: quarantaineKnooppunten,
          nuIso: config.klok ? nuIsoHanddruk : undefined,
          sessieTtlMs: config.sessieLevensduurMs,
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
        const nuMsKader = Date.parse(klok());
        const inkomendKader = (await leesJsonLichaam(req)) as StengelVersleuteldKader;
        const sessie = sessies.get(inkomendKader?.sessieId ?? '');
        if (!sessie) {
          stuurJson(res, 404, { ok: false, fout: 'STENGEL_SESSIE_ONBEKEND' });
          return;
        }
        if (sessie.gesloten || !Number.isFinite(nuMsKader) || nuMsKader > sessie.verlooptOpMs) {
          sluitStengelSessie(sessie);
          sessies.delete(sessie.sessieId);
          stuurJson(res, 401, { ok: false, fout: 'STENGEL_SESSIE_VERLOPEN' });
          return;
        }
        const geopend = ontsleutelStengelKader(sessie, inkomendKader, { nuMs: nuMsKader });
        if (!geopend.ok) {
          if (
            geopend.fout === 'STENGEL_SLEUTELWISSEL_VEREIST'
            || geopend.fout === 'STENGEL_SESSIE_GESLOTEN'
            || geopend.fout === 'STENGEL_SESSIE_VERLOPEN'
          ) {
            sluitStengelSessie(sessie);
            sessies.delete(sessie.sessieId);
          }
          stuurJson(res, 400, { ok: false, fout: geopend.fout });
          return;
        }
        const opdracht = JSON.parse(geopend.klareInhoud.toString('utf8')) as KnooppuntOpdracht;
        const resultaat = verwerkBinnenkomendeOpdracht(sessie, opdracht);
        const antwoordKader = versleutelStengelKader(
          sessie,
          Buffer.from(JSON.stringify(resultaat), 'utf8'),
          { nuMs: nuMsKader },
        );
        if (sessie.volgendZendNummer >= sessie.maxKadersTotSleutelWissel) {
          sluitStengelSessie(sessie);
          sessies.delete(sessie.sessieId);
        }
        stuurJson(res, 200, { ok: true, kader: antwoordKader });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/klimop/v1/estafette') {
        if (!knooppunt.identiteit.rollen.includes('verbinding')) {
          stuurJson(res, 403, { ok: false, fout: 'KNOOPPUNT_HEEFT_GEEN_VERBINDINGSROL' });
          return;
        }
        const verzoek = (await leesJsonLichaam(req)) as EstafetteVerzoek;
        if (!verzoek || verzoek.schema !== 1 || !verzoek.vanKnooppuntId || !verzoek.doelKnooppuntId) {
          stuurJson(res, 400, { ok: false, fout: 'ESTAFETTE_ONGELDIG' });
          return;
        }
        const hopTeller = verzoek.hopTeller ?? 1;
        if (!Number.isInteger(hopTeller) || hopTeller < 1 || hopTeller > 8) {
          stuurJson(res, 400, { ok: false, fout: 'ESTAFETTE_TE_VEEL_STAPPEN' });
          return;
        }
        if (verzoek.doelPad !== '/klimop/v1/handdruk' && verzoek.doelPad !== '/klimop/v1/kader') {
          stuurJson(res, 400, { ok: false, fout: 'ESTAFETTE_PAD_NIET_TOEGESTAAN' });
          return;
        }
        // KLIMOP-022: криптографічна перевірка справжності vanKnooppuntId за підписом Ed25519 відправника
        if (verzoek.afzenderIdentiteit && verzoek.handtekeningB64u) {
          if (berekenKnooppuntId(verzoek.afzenderIdentiteit.publiekeSleutelDerB64u) !== verzoek.vanKnooppuntId) {
            stuurJson(res, 403, { ok: false, fout: 'ESTAFETTE_AFZENDER_SLEUTEL_ONGELDIG' });
            return;
          }
          let estafetteHandtekeningOk = false;
          try {
            const pub = createPublicKey({
              key: Buffer.from(verzoek.afzenderIdentiteit.publiekeSleutelDerB64u, 'base64url'),
              format: 'der',
              type: 'spki',
            });
            estafetteHandtekeningOk = verify(
              null,
              maakEstafetteHandtekeningBoodschap(verzoek),
              pub,
              Buffer.from(verzoek.handtekeningB64u, 'base64url'),
            );
          } catch {
            estafetteHandtekeningOk = false;
          }
          if (!estafetteHandtekeningOk) {
            stuurJson(res, 403, { ok: false, fout: 'ESTAFETTE_HANDTEKENING_ONGELDIG' });
            return;
          }
        } else if (vertrouwensModus === 'streng') {
          stuurJson(res, 403, { ok: false, fout: 'ESTAFETTE_AFZENDER_ONBEWEZEN' });
          return;
        } else if (
          verzoek.doelPad === '/klimop/v1/handdruk'
          && (verzoek.verpakteInhoud as StengelHanddrukAanvraag)?.initiatiefnemer?.knooppuntId
          && (verzoek.verpakteInhoud as StengelHanddrukAanvraag).initiatiefnemer.knooppuntId !== verzoek.vanKnooppuntId
        ) {
          stuurJson(res, 403, { ok: false, fout: 'ESTAFETTE_AFZENDER_VERVALST' });
          return;
        }

        const resterend = Array.isArray(verzoek.resterendPad) ? verzoek.resterendPad : [verzoek.doelKnooppuntId];
        if (
          quarantaineKnooppunten.has(verzoek.vanKnooppuntId)
          || quarantaineKnooppunten.has(verzoek.doelKnooppuntId)
          || resterend.some((id) => quarantaineKnooppunten.has(id))
        ) {
          stuurJson(res, 403, { ok: false, fout: 'KNOOPPUNT_IN_QUARANTAINE' });
          return;
        }

        if (resterend.length >= 2) {
          const volgendeTussenId = resterend[0];
          if (
            !volgendeTussenId
            || volgendeTussenId === knooppunt.identiteit.knooppuntId
            || resterend[resterend.length - 1] !== verzoek.doelKnooppuntId
          ) {
            stuurJson(res, 400, { ok: false, fout: 'ESTAFETTE_ONGELDIGE_ROUTE' });
            return;
          }
          const volgendeBasis = buurAdressen.get(volgendeTussenId);
          if (!volgendeBasis) {
            stuurJson(res, 404, { ok: false, fout: 'ESTAFETTE_DOEL_ONBEKEND' });
            return;
          }
          aantalEstafettes++;
          const doorVerzoek: EstafetteVerzoek = {
            ...verzoek,
            resterendPad: resterend.slice(1),
            hopTeller: hopTeller + 1,
          };
          const doorgestuurdHop = await postJson(`${volgendeBasis}/klimop/v1/estafette`, doorVerzoek);
          stuurJson(res, doorgestuurdHop.status, doorgestuurdHop.data);
          return;
        }

        const doelBasis = buurAdressen.get(verzoek.doelKnooppuntId);
        if (!doelBasis) {
          stuurJson(res, 404, { ok: false, fout: 'ESTAFETTE_DOEL_ONBEKEND' });
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
      for (const [sid, s] of [...sessies.entries()]) {
        if (s.tegenpartijIdentiteit.knooppuntId === knooppuntId) {
          sluitStengelSessie(s);
          sessies.delete(sid);
        }
      }
    },
    trekMandaatIn(mandaatId: string) {
      ingetrokkenMandaten.add(mandaatId);
    },
    stelLokaalStilDwangAlarmIn(actief: boolean, persoonsId?: string) {
      if (persoonsId) {
        if (actief) actieveDwangAlarmPersonen.add(persoonsId);
        else actieveDwangAlarmPersonen.delete(persoonsId);
      } else {
        lokaalActiefStilDwangAlarm = actief;
      }
    },
    aantalOpgeslagenBlokken() {
      return blokOpslag.size;
    },
    leesRuwOpgeslagenBlok(blokSha256: string) {
      return blokOpslag.get(blokSha256);
    },
    simuleerSchijfBeschadigingVoorProef(blokSha256: string) {
      const buf = blokOpslag.get(blokSha256);
      if (!buf || buf.length === 0) return false;
      const kopie = Buffer.from(buf);
      kopie[0] ^= 0xff;
      blokOpslag.set(blokSha256, kopie);
      return true;
    },
    actieveDrempelEpoche(setId: string) {
      return drempelStaat.drempelDelen[setId]?.epoche ?? null;
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
    aantalActieveSessies() {
      ruimVerlopenSessiesOp(Date.parse(klok()));
      return sessies.size;
    },
    aantalOpenFrostNonces() {
      ruimVerlopenFrostNoncesOp(Date.parse(klok()));
      return frostNonces.size;
    },
    aantalDienstCrdtRuimtes() {
      return dienstCrdtRuimtes.size;
    },
    aantalUitgesteldeOperaties() {
      return uitgesteldeOperaties.size;
    },
    aantalActieveToetredingen() {
      return actieveToetredingen.size;
    },
    aantalAuditRapporten() {
      return auditRapporten.size;
    },
    vertrouwensModus() {
      return vertrouwensModus;
    },
    aantalZaadPakketten() {
      return zaadPakketten.size;
    },
    estafetteTeller() {
      return aantalEstafettes;
    },
    async sluit() {
      for (const s of sessies.values()) sluitStengelSessie(s);
      sessies.clear();
      for (const n of frostNonces.values()) {
        n.staat.dScalairBuf.fill(0);
        n.staat.eScalairBuf.fill(0);
      }
      frostNonces.clear();
      rmSync(uitrolWerkMap, { recursive: true, force: true });
      // Пам'ять очищується; зашифрований файл стану (якщо заданий) лишається для відновлення після перезапуску
      for (const k of Object.keys(drempelStaat.drempelDelen)) delete drempelStaat.drempelDelen[k];
      for (const k of Object.keys(drempelStaat.voorbereideVerversingen)) delete drempelStaat.voorbereideVerversingen[k];
      for (const k of Object.keys(drempelStaat.ontvangstGeheimen)) delete drempelStaat.ontvangstGeheimen[k];
      identiteitRegister.clear();
      dienstCrdtRuimtes.clear();
      voogdSignaalBussen.clear();
      uitgesteldeOperaties.clear();
      operatieAnnuleringen.clear();
      actieveToetredingen.clear();
      ingetrokkenToetredingIds.clear();
      middelenKwitanties.clear();
      veiligeUittredingen.clear();
      auditRapporten.clear();
      zaadPakketten.clear();
      opvolgingsOverdrachten.length = 0;
      toegepasteBesluitSha256s.clear();
      toegepasteOpvolgingIds.clear();
      actieveDwangAlarmPersonen.clear();
      lokaalActiefStilDwangAlarm = false;
      laatsteOmkeerbareUitgave = null;
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

    // Естафетний маршрут через один або кілька проміжних вузлів pad[1..pad.length-2] (наскрізні сеансові ключі лишаються лише між pad[0] і кінцевим вузлом!)
    const tussenKnoopId = pad[1];
    const tussenUrl = this.adressen.get(tussenKnoopId);
    if (!tussenUrl) return { status: 404, data: { ok: false, fout: 'TUSSENKNOOP_ADRES_ONBEKEND' }, gebruiktPad: pad };
    const kernVerzoek = {
      schema: 1 as const,
      vanKnooppuntId: this.afzender.identiteit.knooppuntId,
      doelKnooppuntId,
      doelPad,
      verpakteInhoud,
    };
    const priv = createPrivateKey({
      key: Buffer.from(this.afzender.geheimeSleutelPkcs8B64u, 'base64url'),
      format: 'der',
      type: 'pkcs8',
    });
    const handtekeningB64u = sign(null, maakEstafetteHandtekeningBoodschap(kernVerzoek), priv).toString('base64url');
    const estafette: EstafetteVerzoek = {
      ...kernVerzoek,
      resterendPad: pad.slice(2),
      afzenderIdentiteit: this.afzender.identiteit,
      handtekeningB64u,
      hopTeller: 1,
    };
    const r = await postJson(`${tussenUrl}/klimop/v1/estafette`, estafette);
    return { ...r, gebruiktPad: pad };
  }

  async openOfHergebruikSessie(
    doelKnooppuntId: string,
  ): Promise<{ ok: true; sessie: KlimopStengelSessie } | { ok: false; fout: string }> {
    const bestaand = this.sessiesNaarDoel.get(doelKnooppuntId);
    if (bestaand) {
      const verouderdOfVol =
        bestaand.gesloten
        || this.routeTabel.inQuarantaineSet().has(doelKnooppuntId)
        || Date.now() + 2_000 >= bestaand.verlooptOpMs
        || bestaand.volgendZendNummer + 2 >= bestaand.maxKadersTotSleutelWissel;
      if (!verouderdOfVol) {
        return { ok: true, sessie: bestaand };
      }
      sluitStengelSessie(bestaand);
      this.sessiesNaarDoel.delete(doelKnooppuntId);
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
    if (r.status === 401 && r.data?.fout === 'STENGEL_SESSIE_VERLOPEN') {
      sluitStengelSessie(s.sessie);
      this.sessiesNaarDoel.delete(doelKnooppuntId);
    }
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
