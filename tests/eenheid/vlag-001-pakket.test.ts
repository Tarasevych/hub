// VLAG-001 (B-027): перевірка обов'язкових прапорців нововведень під час складання пакета.
// Тест перевіряє поведінку controleerFunctievlaggen (що саме відхиляється й чому) на штучних зразках, без git і без бази.
// VLAG-001: gedrag van de verplichte-vlaggencontrole bij het verpakken, met kunstmatige voorbeelden.
import { readFileSync } from 'node:fs';
import { controleerFunctievlaggen } from '../../scripts/orch/pakket.mjs';
import { checker } from './hulp/nep-google';

type Zaak = { code: string; ernst: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('vlag-001-pakket');
  const beleid = JSON.parse(readFileSync('orchestratie/beleid.json', 'utf8'));
  const versie = '20261124-100000';
  const goedeMigratie = "INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard) VALUES ('proef-functie-v1', 'Proef', false, false) ON CONFLICT (sleutel) DO NOTHING;";
  const bestanden: Record<string, string> = {
    'migrations/0999_proef.sql': goedeMigratie,
    'migrations/0998_aan.sql': "INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard) VALUES ('proef-aan-v1', 'Proef', true, true) ON CONFLICT (sleutel) DO NOTHING;",
    'src/proef/Functie.tsx': "const v = useVlag('proef-functie-v1', false);",
  };
  const lees = (p: string) => bestanden[p] ?? null;
  const codes = (z: Zaak[]) => z.map((x) => `${x.ernst}:${x.code}`).join(',');
  const heeftFout = (z: Zaak[], code: string) => z.some((x) => x.ernst === 'fout' && x.code === code);

  check('beleid: functievlaggen verplicht en gekoppeld aan B-027', beleid.functievlaggen?.verplicht === true && beleid.functievlaggen?.besluit === 'B-027', String(beleid.functievlaggen?.besluit));

  // 1. Пакет змінює код без прапорця → відмова VLAG_ONTBREEKT.
  const z1 = controleerFunctievlaggen({ beleid, manifest: {}, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('gedragswijziging zonder vlag → VLAG_ONTBREEKT', heeftFout(z1, 'VLAG_ONTBREEKT'), codes(z1));

  // 2. Лише документація й тести → без вимоги.
  const z2 = controleerFunctievlaggen({ beleid, manifest: {}, paden: ['docs/a.md', 'tests/eenheid/x.test.ts', 'README.md'], lees, versie }) as Zaak[];
  check('alleen documentatie en tests → geen eis', z2.length === 0, codes(z2));

  // 3. Старі пакети (до vanafVersie) не перевіряються.
  const z3 = controleerFunctievlaggen({ beleid, manifest: {}, paden: ['src/proef/Functie.tsx'], lees, versie: '20261122-120000' }) as Zaak[];
  check('oudere versie dan vanafVersie → niet gecontroleerd', z3.length === 0, codes(z3));

  // 4. Правильний прапорець: типово вимкнений, ON CONFLICT, використовується в коді → без зауважень.
  const z4 = controleerFunctievlaggen({ beleid, manifest: { functievlaggen: [{ sleutel: 'proef-functie-v1', migratie: '0999_proef.sql' }] }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('juiste vlag (standaard uit, ON CONFLICT, gebruikt) → geen zaken', z4.length === 0, codes(z4));

  // 5. Прапорець типово ввімкнений → VLAG_STANDAARD_AAN.
  const z5 = controleerFunctievlaggen({ beleid, manifest: { functievlaggen: [{ sleutel: 'proef-aan-v1', migratie: '0998_aan.sql' }] }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('vlag standaard aan → VLAG_STANDAARD_AAN', heeftFout(z5, 'VLAG_STANDAARD_AAN'), codes(z5));

  // 6. Міграції немає → VLAG_ZONDER_MIGRATIE.
  const z6 = controleerFunctievlaggen({ beleid, manifest: { functievlaggen: [{ sleutel: 'proef-functie-v1', migratie: '0997_ontbreekt.sql' }] }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('ontbrekende migratie → VLAG_ZONDER_MIGRATIE', heeftFout(z6, 'VLAG_ZONDER_MIGRATIE'), codes(z6));

  // 7. Недійсна назва прапорця → VLAG_SLEUTEL_ONGELDIG.
  const z7 = controleerFunctievlaggen({ beleid, manifest: { functievlaggen: [{ sleutel: 'Proef_Functie', migratie: '0999_proef.sql' }] }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('ongeldige sleutel → VLAG_SLEUTEL_ONGELDIG', heeftFout(z7, 'VLAG_SLEUTEL_ONGELDIG'), codes(z7));

  // 8. Вузький виняток із дозволеною причиною й поясненням → лише попередження.
  const z8 = controleerFunctievlaggen({ beleid, manifest: { zonderVlag: { reden: 'herstel', toelichting: 'Виправлення вади без нової поведінки' } }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('zonderVlag herstel met toelichting → alleen waarschuwing', z8.length === 1 && z8[0].ernst === 'waarschuwing' && z8[0].code === 'VLAG_UITZONDERING', codes(z8));

  // 9. Виняток із недозволеною причиною або без пояснення → відмова.
  const z9 = controleerFunctievlaggen({ beleid, manifest: { zonderVlag: { reden: 'haast', toelichting: 'Немає часу на прапорець' } }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  const z9b = controleerFunctievlaggen({ beleid, manifest: { zonderVlag: { reden: 'herstel', toelichting: 'коротко' } }, paden: ['src/proef/Functie.tsx'], lees, versie }) as Zaak[];
  check('zonderVlag met ongeldige reden of te korte toelichting → VLAG_ONTBREEKT', heeftFout(z9, 'VLAG_ONTBREEKT') && heeftFout(z9b, 'VLAG_ONTBREEKT'), `${codes(z9)} | ${codes(z9b)}`);

  // 10. Архівний прапорець (> 30 днів), який досі згадується у змінених файлах коду → лише попередження VLAG_OPRUIMEN (не блокує випуск).
  const oudBestanden: Record<string, string> = {
    ...bestanden,
    'migrations/0996_archief.sql': "UPDATE app.feature_flags SET gearchiveerd_op = '2026-10-01T00:00:00Z' WHERE sleutel = 'oude-archief-vlag';",
    'src/proef/Oud.tsx': "const v = useVlag('proef-functie-v1', false) || useVlag('oude-archief-vlag', false);",
  };
  const z10 = controleerFunctievlaggen({
    beleid,
    manifest: { functievlaggen: [{ sleutel: 'proef-functie-v1', migratie: '0999_proef.sql' }] },
    paden: ['src/proef/Oud.tsx', 'migrations/0996_archief.sql'],
    lees: (p: string) => oudBestanden[p] ?? null,
    versie: '20261124-100000',
  }) as Zaak[];
  check(
    'gearchiveerde vlag (> 30 dagen) nog in gewijzigde code → niet-blokkerende waarschuwing VLAG_OPRUIMEN',
    z10.length === 1 && z10[0].ernst === 'waarschuwing' && z10[0].code === 'VLAG_OPRUIMEN' && !heeftFout(z10, 'VLAG_OPRUIMEN'),
    codes(z10),
  );

  return einde();
}
