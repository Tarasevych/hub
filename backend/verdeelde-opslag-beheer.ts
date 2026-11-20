// UPD-013: Серверне керування вузлами розподіленого зашифрованого зберігання Шаміра (k-з-n).
// У базі зберігаються лише очищені метадані вузлів, контрольні суми SHA-256 та журнал перевірок/ротацій —
// жодних сирих часток, ключів шифрування чи таємниць.
// Serverbeheer voor verdeelde versleutelde opslag (Shamir k-van-n): uitsluitend metadata en controlesommen, geen geheimen.
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import {
  bouwVerdeelManifest,
  controleerSpreiding,
  KNOOP_SOORTEN,
  KNOOP_STATUSSEN,
  knoopSoortNaarPlatform,
  oefenHerstelTest,
  zuiverBestemmingHint,
  type KnoopSoort,
  type KnoopStatus,
  type OefenHerstelResultaat,
  type OpslagKnoop,
  type RotatieSoort,
  type SpreidingOordeel,
  type VerdeelManifestDocument,
} from '../shared/verdeelde-opslag';

const sys = () => getPool('systeem');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const LAND = /^[A-Z0-9_-]{2,16}$/;
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

async function auditeer(
  eigenaar: { id: string; email?: string },
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await auditToevoegen({
    ownerId: eigenaar.id,
    actorId: eigenaar.id,
    action,
    type: 'beveiliging',
    result: 'success',
    details,
    service: 'admin',
  }).catch((err) => {
    console.error(`[verdeelde-opslag] AUDIT MISLUKT (${action}):`, (err as Error).message);
  });
}

export class VerdeeldeOpslagFout extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(code: string, status = 400, details?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type EigenaarRef = { id: string; email?: string };

export type KnoopUit = {
  id: string;
  naam: string;
  landCode: string;
  platform: string;
  soort: KnoopSoort;
  bestemmingHint: string;
  status: KnoopStatus;
  laatsteSha256: string;
  laatsteControleOp: string;
  actief: boolean;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type RotatieUit = {
  id: string;
  soort: RotatieSoort;
  aantalDelen: number;
  drempelK: number;
  geslaagd: boolean;
  samenvatting: string;
  details: Record<string, unknown>;
  uitgevoerdOp: string;
};

export type OverzichtKleur = 'groen' | 'geel' | 'rood';

export type VerdeeldeOpslagOverzicht = {
  kleur: OverzichtKleur;
  statusTekstUk: string;
  statusTekstNl: string;
  drempelK: number;
  aantalDelen: number;
  actiefAantal: number;
  knopen: KnoopUit[];
  spreiding: SpreidingOordeel;
  perLand: Record<string, number>;
  perPlatform: Record<string, number>;
  rotaties: RotatieUit[];
};

function knoopUit(r: any): KnoopUit {
  const soort: KnoopSoort = KNOOP_SOORTEN.includes(r.soort) ? r.soort : 'eigen-server';
  const status: KnoopStatus = KNOOP_STATUSSEN.includes(r.status) ? r.status : 'onbekend';
  return {
    id: String(r.id),
    naam: String(r.naam || ''),
    landCode: String(r.land_code || '').toUpperCase(),
    platform: String(r.platform || ''),
    soort,
    bestemmingHint: zuiverBestemmingHint(r.bestemming_hint),
    status,
    laatsteSha256: SHA256.test(String(r.laatste_sha256 || '').trim()) ? String(r.laatste_sha256).trim().toLowerCase() : '',
    laatsteControleOp: iso(r.laatste_controle_op),
    actief: Boolean(r.actief),
    aangemaaktOp: iso(r.aangemaakt_op),
    bijgewerktOp: iso(r.bijgewerkt_op),
  };
}

function rotatieUit(r: any): RotatieUit {
  const soort: RotatieSoort = r.soort === 'rotatie' || r.soort === 'oefen-herstel' || r.soort === 'controle' ? r.soort : 'controle';
  return {
    id: String(r.id),
    soort,
    aantalDelen: Number(r.aantal_delen || 0),
    drempelK: Number(r.drempel_k || 0),
    geslaagd: Boolean(r.geslaagd),
    samenvatting: String(r.samenvatting || ''),
    details: r.details_json && typeof r.details_json === 'object' ? (r.details_json as Record<string, unknown>) : {},
    uitgevoerdOp: iso(r.uitgevoerd_op),
  };
}

function naarOpslagKnopen(knopen: readonly KnoopUit[]): OpslagKnoop[] {
  return knopen.map((k) => ({
    id: k.id,
    label: k.naam,
    landCode: k.landCode,
    platform: knoopSoortNaarPlatform(k.soort),
    aanbieder: k.platform.trim().toLowerCase() || k.soort,
    actief: k.actief,
  }));
}

function bepaalDrempel(invoer?: { drempelK?: unknown; aantalDelen?: unknown }, actiefAantal = 0): { drempelK: number; aantalDelen: number } {
  const rawK = Number(invoer?.drempelK);
  const drempelK = Number.isInteger(rawK) && rawK >= 2 && rawK <= 15 ? rawK : 3;
  const rawN = Number(invoer?.aantalDelen);
  const basisN = Number.isInteger(rawN) && rawN >= drempelK && rawN <= 30 ? rawN : Math.max(5, actiefAantal, drempelK);
  return { drempelK, aantalDelen: Math.max(drempelK, basisN) };
}

function berekenOverzichtStand(
  knopen: readonly KnoopUit[],
  rotaties: readonly RotatieUit[],
  drempelK: number,
  aantalDelen: number,
): VerdeeldeOpslagOverzicht {
  const actief = knopen.filter((k) => k.actief);
  const spreiding = controleerSpreiding(naarOpslagKnopen(knopen), drempelK, aantalDelen);
  const perLand: Record<string, number> = {};
  const perPlatform: Record<string, number> = {};
  for (const k of actief) {
    const land = k.landCode || 'ONBEKEND';
    const plat = k.platform.trim().toLowerCase() || k.soort;
    perLand[land] = (perLand[land] || 0) + 1;
    perPlatform[plat] = (perPlatform[plat] || 0) + 1;
  }

  const heeftConcentratieFout = spreiding.fouten.some((f) => f.code === 'LAND_CONCENTRATIE' || f.code === 'AANBIEDER_CONCENTRATIE');
  const heeftFoutKnoop = actief.some((k) => k.status === 'fout');
  const heeftWaarschuwingOfOnbekend = actief.some((k) => k.status === 'waarschuwing' || k.status === 'onbekend');
  const heeftGeslaagdeOefening = rotaties.some((r) => r.soort === 'oefen-herstel' && r.geslaagd);

  let kleur: OverzichtKleur = 'groen';
  let statusTekstUk = `Усі ${actief.length} активних вузлів справні, політика ${drempelK}-з-${aantalDelen} дотримана без концентрації в одній країні чи платформі.`;
  let statusTekstNl = `Alle ${actief.length} actieve knopen zijn gezond en voldoen aan het ${drempelK}-van-${aantalDelen}-beleid zonder concentratie in één land of platform.`;

  if (actief.length < drempelK || heeftConcentratieFout || heeftFoutKnoop) {
    kleur = 'rood';
    if (heeftConcentratieFout) {
      statusTekstUk = `Порушено правило незалежності ${drempelK}-з-${aantalDelen}: занадто багато часток в одній країні або платформі.`;
      statusTekstNl = `Onafhankelijkheidsregel ${drempelK}-van-${aantalDelen} geschonden: te veel delen in één land of op één platform.`;
    } else if (heeftFoutKnoop) {
      statusTekstUk = 'Один або кілька активних вузлів мають стан помилки — потрібна перевірка цілісності.';
      statusTekstNl = 'Een of meer actieve knopen hebben een foutstatus — integriteitscontrole vereist.';
    } else {
      statusTekstUk = `Активних вузлів (${actief.length}) менше порогу відновлення ${drempelK}. Додайте незалежні вузли в різних країнах.`;
      statusTekstNl = `Aantal actieve knopen (${actief.length}) ligt onder hersteldrempel ${drempelK}. Voeg onafhankelijke knopen in verschillende landen toe.`;
    }
  } else if (actief.length < aantalDelen || heeftWaarschuwingOfOnbekend || !heeftGeslaagdeOefening) {
    kleur = 'geel';
    if (actief.length < aantalDelen) {
      statusTekstUk = `Поріг ${drempelK} досягнуто, але для повної відмовостійкості ${drempelK}-з-${aantalDelen} бракує ще ${aantalDelen - actief.length} вузл.`;
      statusTekstNl = `Drempel ${drempelK} is bereikt, maar voor volledige fouttolerantie ${drempelK}-van-${aantalDelen} ontbreken nog ${aantalDelen - actief.length} knopen.`;
    } else if (heeftWaarschuwingOfOnbekend) {
      statusTekstUk = 'Частина вузлів потребує перевірки контрольних сум або ще не проходила звірку цілісності.';
      statusTekstNl = 'Een deel van de knopen heeft waarschuwingen of is nog niet op controlesommen geverifieerd.';
    } else {
      statusTekstUk = 'Вузли готові, проте ще не виконано навчальне відновлення й ротацію на вигаданому ключі.';
      statusTekstNl = 'Knopen zijn gereed, maar er is nog geen oefenherstel en rotatie op een fictieve sleutel uitgevoerd.';
    }
  }

  return {
    kleur,
    statusTekstUk,
    statusTekstNl,
    drempelK,
    aantalDelen,
    actiefAantal: actief.length,
    knopen: [...knopen],
    spreiding,
    perLand,
    perPlatform,
    rotaties: [...rotaties],
  };
}

async function leesKnopenEnRotaties(gebruikerId: string): Promise<{ knopen: KnoopUit[]; rotaties: RotatieUit[] }> {
  try {
    const [knopenRes, rotatiesRes] = await Promise.all([
      sys().query(
        `SELECT * FROM app.verdeelde_opslag_knopen
          WHERE gebruiker_id = $1
          ORDER BY actief DESC, bijgewerkt_op DESC
          LIMIT 100`,
        [gebruikerId],
      ),
      sys().query(
        `SELECT * FROM app.verdeelde_opslag_rotaties
          WHERE gebruiker_id = $1
          ORDER BY uitgevoerd_op DESC
          LIMIT 15`,
        [gebruikerId],
      ),
    ]);
    return {
      knopen: knopenRes.rows.map(knoopUit),
      rotaties: rotatiesRes.rows.map(rotatieUit),
    };
  } catch {
    return { knopen: [], rotaties: [] };
  }
}

/** Огляд усіх вузлів, розрахунок зеленого/жовтого/червоного стану та останніх 15 перевірок і ротацій. */
export async function verdeeldeOpslagOverzicht(
  gebruikerId: string,
  opties?: { drempelK?: unknown; aantalDelen?: unknown },
): Promise<VerdeeldeOpslagOverzicht> {
  const { knopen, rotaties } = await leesKnopenEnRotaties(gebruikerId);
  const actiefAantal = knopen.filter((k) => k.actief).length;
  const { drempelK, aantalDelen } = bepaalDrempel(opties, actiefAantal);
  return berekenOverzichtStand(knopen, rotaties, drempelK, aantalDelen);
}

/** Додавання або оновлення вузла з миттєвою перевіркою політики незалежності k-з-n. */
export async function verdeeldeOpslagKnoopOpslaan(
  eigenaar: EigenaarRef,
  invoer: Record<string, unknown>,
): Promise<{ knoop: KnoopUit; overzicht: VerdeeldeOpslagOverzicht }> {
  const id = tekst(invoer.id, 60);
  if (id && !UUID.test(id)) throw new VerdeeldeOpslagFout('KNOOP_ID_ONGELDIG', 400);

  const naam = tekst(invoer.naam, 120);
  const landCode = tekst(invoer.landCode, 16).toUpperCase();
  const platform = tekst(invoer.platform, 80);
  const soortRuw = tekst(invoer.soort, 32) as KnoopSoort;
  const bestemmingHint = zuiverBestemmingHint(invoer.bestemmingHint);
  const shaRuw = tekst(invoer.laatsteSha256, 64).toLowerCase();
  const actief = invoer.actief === undefined ? true : Boolean(invoer.actief);
  const statusRuw = tekst(invoer.status, 24) as KnoopStatus;

  if (naam.length < 2) throw new VerdeeldeOpslagFout('KNOOP_NAAM_ONGELDIG', 400);
  if (!LAND.test(landCode)) throw new VerdeeldeOpslagFout('LAND_CODE_ONGELDIG', 400);
  if (platform.length < 2) throw new VerdeeldeOpslagFout('PLATFORM_ONGELDIG', 400);
  if (!KNOOP_SOORTEN.includes(soortRuw)) throw new VerdeeldeOpslagFout('SOORT_ONGELDIG', 400);
  if (shaRuw && !SHA256.test(shaRuw)) throw new VerdeeldeOpslagFout('SHA256_ONGELDIG', 400);

  const status: KnoopStatus = KNOOP_STATUSSEN.includes(statusRuw)
    ? statusRuw
    : (shaRuw ? 'gezond' : 'onbekend');

  const { knopen: bestaand } = await leesKnopenEnRotaties(eigenaar.id);
  const { drempelK, aantalDelen } = bepaalDrempel(
    { drempelK: invoer.drempelK, aantalDelen: invoer.aantalDelen },
    bestaand.filter((k) => k.actief).length + (id ? 0 : (actief ? 1 : 0)),
  );

  // Миттєва перевірка політики k-з-n: не дозволяємо концентрацію >= k активних вузлів в одній країні чи платформі.
  if (actief) {
    const kandidaatLijst: KnoopUit[] = bestaand.filter((k) => k.id !== id);
    kandidaatLijst.push({
      id: id || 'nieuw',
      naam,
      landCode,
      platform,
      soort: soortRuw,
      bestemmingHint,
      status,
      laatsteSha256: shaRuw,
      laatsteControleOp: '',
      actief: true,
      aangemaaktOp: '',
      bijgewerktOp: '',
    });
    const kandidaatSpreiding = controleerSpreiding(naarOpslagKnopen(kandidaatLijst), drempelK, Math.max(aantalDelen, kandidaatLijst.filter((k) => k.actief).length));
    const schendingen = kandidaatSpreiding.fouten.filter(
      (f) => f.code === 'LAND_CONCENTRATIE' || f.code === 'AANBIEDER_CONCENTRATIE',
    );
    if (schendingen.length > 0) {
      throw new VerdeeldeOpslagFout('SPREIDING_BELEID_SCHENDING', 409, {
        drempelK,
        fouten: schendingen,
        spreiding: kandidaatSpreiding,
      });
    }
  }

  let row: any;
  if (id) {
    const upd = await sys().query(
      `UPDATE app.verdeelde_opslag_knopen
          SET naam = $3,
              land_code = $4,
              platform = $5,
              soort = $6,
              bestemming_hint = $7,
              status = $8,
              laatste_sha256 = $9,
              actief = $10,
              bijgewerkt_op = now()
        WHERE id = $1 AND gebruiker_id = $2
        RETURNING *`,
      [id, eigenaar.id, naam, landCode, platform, soortRuw, bestemmingHint, status, shaRuw, actief],
    );
    if (!upd.rows[0]) throw new VerdeeldeOpslagFout('KNOOP_NIET_GEVONDEN', 404);
    row = upd.rows[0];
  } else {
    const ins = await sys().query(
      `INSERT INTO app.verdeelde_opslag_knopen
         (gebruiker_id, naam, land_code, platform, soort, bestemming_hint, status, laatste_sha256, actief)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [eigenaar.id, naam, landCode, platform, soortRuw, bestemmingHint, status, shaRuw, actief],
    );
    row = ins.rows[0];
  }

  const knoop = knoopUit(row);
  await auditeer(eigenaar, id ? 'verdeelde_opslag.knoop.bijgewerkt' : 'verdeelde_opslag.knoop.toegevoegd', {
    knoopId: knoop.id,
    naam: knoop.naam,
    landCode: knoop.landCode,
    platform: knoop.platform,
    soort: knoop.soort,
    actief: knoop.actief,
  });

  const overzicht = await verdeeldeOpslagOverzicht(eigenaar.id, { drempelK, aantalDelen });
  return { knoop, overzicht };
}

/** Видалення або вимкнення вузла розподіленого зберігання. */
export async function verdeeldeOpslagKnoopVerwijderen(
  eigenaar: EigenaarRef,
  idRuw: unknown,
  opties?: { modus?: string },
): Promise<{ verwijderdId: string; modus: 'verwijderd' | 'uitgeschakeld'; overzicht: VerdeeldeOpslagOverzicht }> {
  const id = tekst(idRuw, 60);
  if (!UUID.test(id)) throw new VerdeeldeOpslagFout('KNOOP_ID_ONGELDIG', 400);

  const modus = opties?.modus === 'uit' ? 'uitgeschakeld' : 'verwijderd';
  const res = modus === 'uitgeschakeld'
    ? await sys().query(
      `UPDATE app.verdeelde_opslag_knopen
          SET actief = false, bijgewerkt_op = now()
        WHERE id = $1 AND gebruiker_id = $2
        RETURNING id, naam, land_code, platform`,
      [id, eigenaar.id],
    )
    : await sys().query(
      `DELETE FROM app.verdeelde_opslag_knopen
        WHERE id = $1 AND gebruiker_id = $2
        RETURNING id, naam, land_code, platform`,
      [id, eigenaar.id],
    );

  if (!res.rows[0]) throw new VerdeeldeOpslagFout('KNOOP_NIET_GEVONDEN', 404);
  const r = res.rows[0];
  await auditeer(eigenaar, modus === 'uitgeschakeld' ? 'verdeelde_opslag.knoop.uitgeschakeld' : 'verdeelde_opslag.knoop.verwijderd', {
    knoopId: String(r.id),
    naam: String(r.naam || ''),
    landCode: String(r.land_code || ''),
    platform: String(r.platform || ''),
  });

  const overzicht = await verdeeldeOpslagOverzicht(eigenaar.id);
  return { verwijderdId: String(r.id), modus, overzicht };
}

/**
 * Перевірка цілісності конфігурації й контрольних сум вузлів без збирання ключа.
 * Оновлює стан вузлів та зберігає запис у app.verdeelde_opslag_rotaties.
 */
export async function verdeeldeOpslagControleer(
  eigenaar: EigenaarRef,
  invoer: Record<string, unknown> = {},
): Promise<{
  geslaagd: boolean;
  gecontroleerd: number;
  gezond: number;
  waarschuwingen: number;
  fouten: number;
  rotatie: RotatieUit;
  overzicht: VerdeeldeOpslagOverzicht;
}> {
  const { knopen } = await leesKnopenEnRotaties(eigenaar.id);
  const actief = knopen.filter((k) => k.actief);
  const { drempelK, aantalDelen } = bepaalDrempel(invoer, actief.length);
  const spreiding = controleerSpreiding(naarOpslagKnopen(knopen), drempelK, aantalDelen);

  const perLand = new Map<string, number>();
  const perPlatform = new Map<string, number>();
  for (const k of actief) {
    perLand.set(k.landCode, (perLand.get(k.landCode) || 0) + 1);
    const p = k.platform.trim().toLowerCase() || k.soort;
    perPlatform.set(p, (perPlatform.get(p) || 0) + 1);
  }

  let gezond = 0;
  let waarschuwingen = 0;
  let fouten = 0;
  const knoopResultaten: Array<{ id: string; naam: string; landCode: string; status: KnoopStatus; reden: string }> = [];

  for (const k of actief) {
    const plat = k.platform.trim().toLowerCase() || k.soort;
    const landTeVeel = (perLand.get(k.landCode) || 0) >= drempelK;
    const platTeVeel = (perPlatform.get(plat) || 0) >= drempelK;

    let nieuwStatus: KnoopStatus = 'gezond';
    let reden = 'ok';
    if (landTeVeel || platTeVeel) {
      nieuwStatus = 'fout';
      reden = landTeVeel ? 'LAND_CONCENTRATIE' : 'AANBIEDER_CONCENTRATIE';
      fouten += 1;
    } else if (!k.laatsteSha256) {
      nieuwStatus = 'waarschuwing';
      reden = 'SHA256_ONTBREEKT';
      waarschuwingen += 1;
    } else if (!SHA256.test(k.laatsteSha256)) {
      nieuwStatus = 'fout';
      reden = 'SHA256_ONGELDIG';
      fouten += 1;
    } else if (!k.bestemmingHint && k.soort !== 'offline-qr') {
      nieuwStatus = 'waarschuwing';
      reden = 'BESTEMMING_ONTBREEKT';
      waarschuwingen += 1;
    } else {
      gezond += 1;
    }

    await sys().query(
      `UPDATE app.verdeelde_opslag_knopen
          SET status = $3,
              laatste_controle_op = now(),
              bijgewerkt_op = now()
        WHERE id = $1 AND gebruiker_id = $2`,
      [k.id, eigenaar.id, nieuwStatus],
    );
    knoopResultaten.push({ id: k.id, naam: k.naam, landCode: k.landCode, status: nieuwStatus, reden });
  }

  const geslaagd = spreiding.ok && fouten === 0 && actief.length >= aantalDelen && waarschuwingen === 0;
  const samenvatting = `Перевірка цілісності без збирання ключа (${drempelK}-з-${aantalDelen}): перевірено ${actief.length}, справних ${gezond}, попереджень ${waarschuwingen}, помилок ${fouten}.`;

  const rotRes = await sys().query(
    `INSERT INTO app.verdeelde_opslag_rotaties
       (gebruiker_id, soort, aantal_delen, drempel_k, geslaagd, samenvatting, details_json)
     VALUES ($1, 'controle', $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      eigenaar.id,
      actief.length,
      drempelK,
      geslaagd,
      samenvatting,
      JSON.stringify({
        zonderSleutelSamenstelling: true,
        spreidingOk: spreiding.ok,
        spreidingFouten: spreiding.fouten.map((f) => f.code),
        gezond,
        waarschuwingen,
        fouten,
        knopen: knoopResultaten,
      }),
    ],
  );

  const rotatie = rotatieUit(rotRes.rows[0]);
  await auditeer(eigenaar, 'verdeelde_opslag.controle', {
    rotatieId: rotatie.id,
    drempelK,
    aantalDelen,
    geslaagd,
    actief: actief.length,
    gezond,
    waarschuwingen,
    fouten,
  });

  const overzicht = await verdeeldeOpslagOverzicht(eigenaar.id, { drempelK, aantalDelen });
  return { geslaagd, gecontroleerd: actief.length, gezond, waarschuwingen, fouten, rotatie, overzicht };
}

/**
 * Навчальне відновлення та проактивна ротація на вигаданому ключі (`oefenHerstelTest`).
 * Записує очищений результат у app.verdeelde_opslag_rotaties без жодних сирих часток.
 */
export async function verdeeldeOpslagOefenHerstel(
  eigenaar: EigenaarRef,
  invoer: Record<string, unknown> = {},
): Promise<{ test: OefenHerstelResultaat; rotatie: RotatieUit; overzicht: VerdeeldeOpslagOverzicht }> {
  const { knopen } = await leesKnopenEnRotaties(eigenaar.id);
  const actiefAantal = knopen.filter((k) => k.actief).length;
  const { drempelK, aantalDelen } = bepaalDrempel(invoer, actiefAantal);

  const test = oefenHerstelTest(aantalDelen, drempelK);
  const rotRes = await sys().query(
    `INSERT INTO app.verdeelde_opslag_rotaties
       (gebruiker_id, soort, aantal_delen, drempel_k, geslaagd, samenvatting, details_json)
     VALUES ($1, 'oefen-herstel', $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      eigenaar.id,
      test.aantalDelen,
      test.drempelK,
      test.geslaagd,
      test.samenvattingUk,
      JSON.stringify({
        fictieveSleutel: true,
        oorspronkelijkSha256: test.oorspronkelijkSha256,
        herstelVoorRotatieSha256: test.herstelVoorRotatieSha256,
        herstelNaRotatieSha256: test.herstelNaRotatieSha256,
        teWeinigDelenGeweigerd: test.teWeinigDelenGeweigerd,
        polynoomVernieuwd: test.polynoomVernieuwd,
        stappen: test.stappen,
      }),
    ],
  );

  const rotatie = rotatieUit(rotRes.rows[0]);
  await auditeer(eigenaar, 'verdeelde_opslag.oefen_herstel', {
    rotatieId: rotatie.id,
    drempelK: test.drempelK,
    aantalDelen: test.aantalDelen,
    geslaagd: test.geslaagd,
    polynoomVernieuwd: test.polynoomVernieuwd,
    sha256Prefix: test.oorspronkelijkSha256.slice(0, 12),
  });

  const overzicht = await verdeeldeOpslagOverzicht(eigenaar.id, { drempelK, aantalDelen });
  return { test, rotatie, overzicht };
}

/** Формує очищений документ VERDEELDE-OPSLAG-MANIFEST.json без жодних таємниць. */
export async function verdeeldeOpslagManifest(
  gebruikerId: string,
  invoer: Record<string, unknown> = {},
): Promise<VerdeelManifestDocument> {
  const { knopen, rotaties } = await leesKnopenEnRotaties(gebruikerId);
  const actiefAantal = knopen.filter((k) => k.actief).length;
  const { drempelK, aantalDelen } = bepaalDrempel(invoer, actiefAantal);
  const revisie = Math.max(1, rotaties.filter((r) => r.soort === 'rotatie').length + 1);

  return bouwVerdeelManifest({
    setId: tekst(invoer.setId, 80) || 'mijn-ruimte-verdeeld-v2',
    revisie,
    drempel: drempelK,
    aantal: aantalDelen,
    knopen: knopen.map((k) => ({
      id: k.id,
      naam: k.naam,
      landCode: k.landCode,
      platform: k.platform,
      soort: k.soort,
      bestemmingHint: k.bestemmingHint,
      status: k.status,
      laatsteSha256: k.laatsteSha256,
      laatsteControleOp: k.laatsteControleOp,
      actief: k.actief,
    })),
    objectHash: tekst(invoer.objectHash, 64),
  });
}
