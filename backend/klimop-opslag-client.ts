// KLIMOP-004 (20.11.2026, Етап 3 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Клієнтський розподільник зашифрованих об'єктів поверх захищених зв'язків «Стебла» (KlimopNetwerkClient):
//   - обов'язкова перевірка юрисдикційної та операторської незалежності вузлів зберігання перед записом;
//   - наскрізне клієнтське конвертне шифрування та кодування Ріда–Соломона (k + m) без передавання ключів вузлам;
//   - відновлення об'єкта після одночасної відмови до m вузлів або пошкодження окремих фрагментів;
//   - перевірювана добудова втраченого фрагмента на новому вузлі БЕЗ розшифрування та БЕЗ ключа власника;
//   - законне видалення всіх фрагментів за підписаними мандатами власника особистих даних (§11 маніфесту).

import { createHash } from 'node:crypto';
import {
  controleerKnooppuntOnafhankelijkheid,
  ondertekenKlimopMandaat,
  type KlimopKnooppuntIdentiteit,
  type KlimopMandaatInhoud,
  type KlimopOndertekendMandaat,
  type KlimopOpslagLaag,
} from '../shared/klimop/kern';
import {
  herbouwReedSolomonFragmentenZonderSleutel,
  herstelEnOntsleutelObject,
  verifieerObjectManifest,
  versleutelEnVerdeelObject,
  type KlimopObjectManifest,
  type KlimopVersleutelingProfiel,
  type ReedSolomonFragment,
} from '../shared/klimop/opslag';
import type { KlimopNetwerkClient } from './klimop-knooppunt-agent';

export interface KlimopPlaatsingsKaart {
  /** Відображення індексу смуги Ріда–Соломона (0 .. k+m-1) на ідентифікатор вузла зберігання. */
  knooppuntPerIndex: Record<number, KlimopKnooppuntIdentiteit>;
  mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat>;
}

function maakOpslagMandaatVoorKnooppunt(
  eigenaar: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string },
  ontvangerId: string,
  objectId: string,
  laag: KlimopOpslagLaag,
  nuIso: string,
  verlooptOpIso: string,
): KlimopOndertekendMandaat {
  const inhoud: KlimopMandaatInhoud = {
    schema: 1,
    mandaatId: `mnd_opslag_${objectId}_${ontvangerId.slice(5, 17)}`,
    uitgeverKnooppuntId: eigenaar.identiteit.knooppuntId,
    ontvangerKnooppuntId: ontvangerId,
    machtDomein: 'persoonlijke_gegevens',
    toegestaneRollen: ['opslag'],
    toegestaneOpslagLagen: [laag],
    alleenMetDrempelQuorum: false,
    drempelVereist: null,
    uitgegevenOp: nuIso,
    verlooptOp: verlooptOpIso,
  };
  return ondertekenKlimopMandaat(inhoud, eigenaar);
}

export class KlimopVerdeeldeOpslagClient {
  constructor(private readonly netwerkClient: KlimopNetwerkClient) {}

  /**
   * Шифрує об'єкт на пристрої власника, перевіряє незалежність (k + m) вузлів зберігання
   * та розсилає кожну смугу Ріда–Соломона на окремий незалежний вузол за окремим мандатом Ed25519.
   */
  async verdeelEnBewaarObject(opties: {
    inhoud: Buffer;
    objectId: string;
    eigenaar: { identiteit: KlimopKnooppuntIdentiteit; geheimeSleutelPkcs8B64u: string };
    kek: Buffer;
    doelKnooppunten: readonly KlimopKnooppuntIdentiteit[];
    k: number;
    m: number;
    segmentGrootte?: number;
    laag?: KlimopOpslagLaag;
    epoche?: number;
    profiel?: KlimopVersleutelingProfiel;
    nuIso?: string;
    verlooptOpIso?: string;
  }): Promise<
    | { ok: true; manifest: KlimopObjectManifest; plaatsing: KlimopPlaatsingsKaart; verzondenFragmenten: number }
    | { ok: false; fout: string; details?: string[] }
  > {
    const totaal = opties.k + opties.m;
    if (opties.doelKnooppunten.length !== totaal) {
      return { ok: false, fout: 'AANTAL_DOELKNOOPPUNTEN_ONGELIJK_AAN_K_PLUS_M' };
    }
    if (opties.doelKnooppunten.some((kn) => !kn.rollen.includes('opslag'))) {
      return { ok: false, fout: 'DOELKNOOPPUNT_MIST_OPSLAGROL' };
    }

    const spreiding = controleerKnooppuntOnafhankelijkheid(opties.doelKnooppunten, opties.k);
    if (!spreiding.ok) {
      return { ok: false, fout: 'ONAFHANKELIJKHEID_NIET_VOLDAAN', details: spreiding.fouten };
    }

    const laag = opties.laag ?? 'grote_versleutelde_objecten';
    const nuIso = opties.nuIso ?? new Date().toISOString();
    const verlooptOpIso = opties.verlooptOpIso ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const verdeeld = versleutelEnVerdeelObject({
      inhoud: opties.inhoud,
      objectId: opties.objectId,
      eigenaar: opties.eigenaar,
      kek: opties.kek,
      laag,
      epoche: opties.epoche,
      profiel: opties.profiel,
      k: opties.k,
      m: opties.m,
      segmentGrootte: opties.segmentGrootte,
      nuIso,
    });

    const knooppuntPerIndex: Record<number, KlimopKnooppuntIdentiteit> = {};
    const mandatenPerKnooppuntId: Record<string, KlimopOndertekendMandaat> = {};
    for (let r = 0; r < totaal; r++) {
      const kn = opties.doelKnooppunten[r];
      knooppuntPerIndex[r] = kn;
      mandatenPerKnooppuntId[kn.knooppuntId] = maakOpslagMandaatVoorKnooppunt(
        opties.eigenaar,
        kn.knooppuntId,
        opties.objectId,
        laag,
        nuIso,
        verlooptOpIso,
      );
    }

    let verzondenFragmenten = 0;
    for (const segFragmenten of verdeeld.fragmentenPerSegment) {
      for (const fr of segFragmenten) {
        const kn = knooppuntPerIndex[fr.index];
        const mandaat = mandatenPerKnooppuntId[kn.knooppuntId];
        const res = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
          actie: 'bewaar_blok',
          blokSha256: fr.sha256,
          cijfertekstB64u: fr.inhoudB64u,
          mandaat,
        });
        if (!res.antwoord.ok || res.antwoord.actie !== 'opgeslagen') {
          return {
            ok: false,
            fout: !res.antwoord.ok ? res.antwoord.fout : 'FRAGMENT_OPSLAG_MISLUKT',
          };
        }
        verzondenFragmenten++;
      }
    }

    return {
      ok: true,
      manifest: verdeeld.manifest,
      plaatsing: { knooppuntPerIndex, mandatenPerKnooppuntId },
      verzondenFragmenten,
    };
  }

  /**
   * Збирає щонайменше k непошкоджених зашифрованих фрагментів кожного сегмента з доступних вузлів
   * (автоматично ігноруючи вимкнені, карантинні чи пошкоджені вузли) та розшифровує об'єкт на пристрої власника.
   */
  async haalEnOntsleutelObject(opties: {
    manifest: KlimopObjectManifest;
    plaatsing: KlimopPlaatsingsKaart;
    kek: Buffer;
  }): Promise<
    | { ok: true; inhoud: Buffer; gebruikteKnooppuntIds: string[] }
    | { ok: false; fout: string }
  > {
    const mv = verifieerObjectManifest(opties.manifest);
    if (!mv.ok) return mv;

    const { manifest, plaatsing } = opties;
    const gebruikteKnooppunten = new Set<string>();
    const verzameldPerSegment: ReedSolomonFragment[][] = [];

    for (const segMeta of manifest.segmenten) {
      const geldige: ReedSolomonFragment[] = [];
      for (const ref of segMeta.fragmentRefs) {
        if (geldige.length >= manifest.reedSolomon.k) break;
        const kn = plaatsing.knooppuntPerIndex[ref.index];
        if (!kn) continue;
        const mandaat = plaatsing.mandatenPerKnooppuntId[kn.knooppuntId];
        if (!mandaat) continue;

        const res = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
          actie: 'haal_blok',
          blokSha256: ref.sha256,
          mandaat,
        });
        if (!res.antwoord.ok || res.antwoord.actie !== 'opgehaald') continue;

        const ruw = Buffer.from(res.antwoord.cijfertekstB64u, 'base64url');
        const berekendSha = createHash('sha256').update(ruw).digest('hex');
        if (berekendSha !== ref.sha256) continue;

        gebruikteKnooppunten.add(kn.knooppuntId);
        geldige.push({
          index: ref.index,
          soort: ref.soort,
          sha256: ref.sha256,
          inhoudB64u: res.antwoord.cijfertekstB64u,
        });
      }
      if (geldige.length < manifest.reedSolomon.k) {
        return { ok: false, fout: 'ONVOLDOENDE_BEREIKBARE_KNOOPPUNTEN_VOOR_SEGMENT' };
      }
      verzameldPerSegment.push(geldige);
    }

    const geopend = herstelEnOntsleutelObject({
      manifest,
      fragmentenPerSegment: verzameldPerSegment,
      kek: opties.kek,
    });
    if (!geopend.ok) return geopend;

    return {
      ok: true,
      inhoud: geopend.inhoud,
      gebruikteKnooppuntIds: [...gebruikteKnooppunten],
    };
  }

  /**
   * Відновлює втрачену смугу `verlorenIndex` на новому незалежному вузлі зберігання `vervangendKnooppunt`
   * виключно з k живих зашифрованих фрагментів — БЕЗ ключа власника KEK/DEK і БЕЗ розшифрування вмісту (§11, §22).
   */
  async herbouwVerlorenKnooppuntZonderSleutel(opties: {
    manifest: KlimopObjectManifest;
    plaatsing: KlimopPlaatsingsKaart;
    verlorenIndex: number;
    vervangendKnooppunt: KlimopKnooppuntIdentiteit;
    vervangendMandaat: KlimopOndertekendMandaat;
  }): Promise<
    | { ok: true; vernieuwdePlaatsing: KlimopPlaatsingsKaart; hersteldeSegmenten: number }
    | { ok: false; fout: string; details?: string[] }
  > {
    const mv = verifieerObjectManifest(opties.manifest);
    if (!mv.ok) return mv;
    if (!opties.vervangendKnooppunt.rollen.includes('opslag')) {
      return { ok: false, fout: 'VERVANGEND_KNOOPPUNT_MIST_OPSLAGROL' };
    }

    const { manifest, plaatsing, verlorenIndex } = opties;
    const totaal = manifest.reedSolomon.k + manifest.reedSolomon.m;
    if (verlorenIndex < 0 || verlorenIndex >= totaal) {
      return { ok: false, fout: 'ONGELDIGE_VERLOREN_INDEX' };
    }

    const nieuweKnopenLijst: KlimopKnooppuntIdentiteit[] = [];
    for (let r = 0; r < totaal; r++) {
      nieuweKnopenLijst.push(r === verlorenIndex ? opties.vervangendKnooppunt : plaatsing.knooppuntPerIndex[r]);
    }
    const spreiding = controleerKnooppuntOnafhankelijkheid(nieuweKnopenLijst, manifest.reedSolomon.k);
    if (!spreiding.ok) {
      return { ok: false, fout: 'VERVANGEND_KNOOPPUNT_SCHENDT_ONAFHANKELIJKHEID', details: spreiding.fouten };
    }

    let hersteldeSegmenten = 0;
    for (const segMeta of manifest.segmenten) {
      const levende: ReedSolomonFragment[] = [];
      for (const ref of segMeta.fragmentRefs) {
        if (ref.index === verlorenIndex) continue;
        if (levende.length >= manifest.reedSolomon.k) break;
        const kn = plaatsing.knooppuntPerIndex[ref.index];
        const mandaat = kn ? plaatsing.mandatenPerKnooppuntId[kn.knooppuntId] : undefined;
        if (!kn || !mandaat) continue;

        const res = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
          actie: 'haal_blok',
          blokSha256: ref.sha256,
          mandaat,
        });
        if (!res.antwoord.ok || res.antwoord.actie !== 'opgehaald') continue;
        const ruw = Buffer.from(res.antwoord.cijfertekstB64u, 'base64url');
        if (createHash('sha256').update(ruw).digest('hex') !== ref.sha256) continue;

        levende.push({
          index: ref.index,
          soort: ref.soort,
          sha256: ref.sha256,
          inhoudB64u: res.antwoord.cijfertekstB64u,
        });
      }

      const herbouwd = herbouwReedSolomonFragmentenZonderSleutel(
        levende,
        manifest.reedSolomon.k,
        manifest.reedSolomon.m,
        segMeta.versleuteldeLengte,
      );
      if (!herbouwd.ok) return herbouwd;

      const doelRef = segMeta.fragmentRefs.find((r) => r.index === verlorenIndex);
      const doelFrag = herbouwd.fragmenten.find((f) => f.index === verlorenIndex);
      if (!doelRef || !doelFrag || doelFrag.sha256 !== doelRef.sha256) {
        return { ok: false, fout: 'HERBOUWD_FRAGMENT_SHA256_KOMT_NIET_OVEREEN' };
      }

      const bewaarRes = await this.netwerkClient.roepOpdrachtAan(opties.vervangendKnooppunt.knooppuntId, {
        actie: 'bewaar_blok',
        blokSha256: doelFrag.sha256,
        cijfertekstB64u: doelFrag.inhoudB64u,
        mandaat: opties.vervangendMandaat,
      });
      if (!bewaarRes.antwoord.ok || bewaarRes.antwoord.actie !== 'opgeslagen') {
        return {
          ok: false,
          fout: !bewaarRes.antwoord.ok ? bewaarRes.antwoord.fout : 'HERBOUW_OPSLAG_MISLUKT',
        };
      }
      hersteldeSegmenten++;
    }

    const vernieuwdeKnooppuntPerIndex = {
      ...plaatsing.knooppuntPerIndex,
      [verlorenIndex]: opties.vervangendKnooppunt,
    };
    const vernieuwdeMandaten = {
      ...plaatsing.mandatenPerKnooppuntId,
      [opties.vervangendKnooppunt.knooppuntId]: opties.vervangendMandaat,
    };

    return {
      ok: true,
      vernieuwdePlaatsing: {
        knooppuntPerIndex: vernieuwdeKnooppuntPerIndex,
        mandatenPerKnooppuntId: vernieuwdeMandaten,
      },
      hersteldeSegmenten,
    };
  }

  /** Законне видалення всіх фрагментів об'єкта з усіх доступних вузлів за мандатами власника (§11 маніфесту). */
  async wisObjectVanKnooppunten(opties: {
    manifest: KlimopObjectManifest;
    plaatsing: KlimopPlaatsingsKaart;
  }): Promise<{ gewisteFragmenten: number; onbereikbareFragmenten: number }> {
    let gewisteFragmenten = 0;
    let onbereikbareFragmenten = 0;
    for (const segMeta of opties.manifest.segmenten) {
      for (const ref of segMeta.fragmentRefs) {
        const kn = opties.plaatsing.knooppuntPerIndex[ref.index];
        const mandaat = kn ? opties.plaatsing.mandatenPerKnooppuntId[kn.knooppuntId] : undefined;
        if (!kn || !mandaat) {
          onbereikbareFragmenten++;
          continue;
        }
        const res = await this.netwerkClient.roepOpdrachtAan(kn.knooppuntId, {
          actie: 'wis_blok',
          blokSha256: ref.sha256,
          mandaat,
        });
        if (res.antwoord.ok && res.antwoord.actie === 'gewist') {
          gewisteFragmenten++;
        } else {
          onbereikbareFragmenten++;
        }
      }
    }
    return { gewisteFragmenten, onbereikbareFragmenten };
  }
}
