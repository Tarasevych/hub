// MIGRATIES TERUGDRAAIBAAR (UPD-003, 17.11.2026). Een migratie wordt bij terugdraaien van een uitgave NIET teruggedraaid:
// de vorige versie van de code moet met het nieuwe schema blijven werken. De voorcontrole op de site (backend/uitrol-voorcontrole.ts,
// SQL_RISICO) waarschuwt daarom bij verwijderende of hernoemende SQL. Deze test laat zo'n waarschuwing al vóór het pakketten zien,
// met DEZELFDE patronen, voor elke migratie vanaf 0286 (de eerste na de geïnstalleerde lijn UPD-002).
// Aanleiding: 0299 bevatte een blok dat een (nooit uitgebrachte) kolom verwijderde; de site meldde «руйнівні команди» bij het installeren.
// Міграції після 0286 не мають містити видалення чи перейменування — стара версія коду мусить працювати з новою схемою.
// Een bewuste uitzondering hoort in UITZONDERINGEN, met reden, en in risicoUitleg van het dossier.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { SQL_RISICO } from '../../backend/uitrol-voorcontrole';

const EERSTE = '0286';
const UITZONDERINGEN: Record<string, string> = {};

export async function main(): Promise<number> {
  const { check, einde } = checker('migraties-terugdraaibaar-20261117');
  const map = join(process.cwd(), 'migrations');
  const nieuwe = readdirSync(map).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f.slice(0, 4) >= EERSTE).sort();
  check('er zijn migraties vanaf 0286 om te controleren', nieuwe.length > 0, String(nieuwe.length));
  for (const f of nieuwe) {
    const sql = readFileSync(join(map, f), 'utf8');
    const treffers = SQL_RISICO.filter(([re]) => re.test(sql)).map(([, , nl]) => nl);
    const naam = f.replace(/\.sql$/, '');
    check(`${naam}: geen verwijderende/hernoemende SQL (zoals de voorcontrole van de site)`, treffers.length === 0 || naam in UITZONDERINGEN, treffers.join(', '));
  }

  // De patronen zelf: de oude vorm van 0299 moest gevonden worden, de nieuwe (alleen toevoegen) niet.
  const oud = 'DO $$ BEGIN\n  ALTER TABLE app.tg_matrix DROP ' + 'COLUMN geo_verplicht;\nEND $$;';
  check('patroon vindt een kolomverwijdering', SQL_RISICO.some(([re]) => re.test(oud)));
  check('patroon laat DROP CONSTRAINT + ADD CONSTRAINT (CHECK verruimen) door',
    !SQL_RISICO.some(([re]) => re.test('ALTER TABLE app.x DROP CONSTRAINT IF EXISTS x_check;\nALTER TABLE app.x ADD CONSTRAINT x_check CHECK (a IN (1,2));')));

  // 0299 inhoudelijk: alleen toevoegen, met standaardwaarden, zodat oude code (die de kolommen niet kent) kan blijven invoegen.
  const m0299 = readFileSync(join(map, '0299_tg_plaats_verplicht.sql'), 'utf8');
  check('0299: plaats_eis met standaardwaarde', /ADD COLUMN IF NOT EXISTS plaats_eis text\[\] NOT NULL DEFAULT '\{\}'/.test(m0299));
  check('0299: geo_vereist met standaardwaarde', /ADD COLUMN IF NOT EXISTS geo_vereist boolean NOT NULL DEFAULT false/.test(m0299));
  check('0299: geen verwijzing meer naar de nooit uitgebrachte kolom geo_verplicht in SQL', !m0299.split('\n').filter((r) => !r.trim().startsWith('--')).some((r) => r.includes('geo_verplicht')));
  // De ruimere CHECK bevat alle redenen van 0276 (de vorige vorm, in UPD-002; oude code schrijft alleen die).
  const m0276 = readFileSync(join(map, '0276_telegram_venster.sql'), 'utf8');
  const redenen = (s: string) => { const m = /tg_inlog_verzoeken_reden_check\s+CHECK\s*\(reden IN \(([^)]*)\)\)/.exec(s); return m ? m[1].split(',').map((x) => x.trim()) : null; };
  const oudR = redenen(m0276); const nieuwR = redenen(m0299);
  check('0299: CHECK op reden is een uitbreiding van die van 0276', !!oudR && !!nieuwR && oudR.every((r) => nieuwR.includes(r)), `${oudR?.join(' ')} ⊆ ${nieuwR?.join(' ')}`);
  return einde();
}
