// /api/version: backend/release-info.ts leest de releasemetadata (versie, commit, auteur, agent, samenvatting) uit de
// bestanden in de wortel van de release (één niveau boven dist). Правило 2 (PRAVYLA-ADRESY-I-VYPUSKY.md).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { releaseInfo, _resetReleaseInfo } from '../../backend/release-info';

export async function main(): Promise<number> {
  const { check, einde } = checker('release-info');
  const wortel = mkdtempSync(join(tmpdir(), 'rel-'));
  const dist = join(wortel, 'dist');
  mkdirSync(dist);
  writeFileSync(join(wortel, 'UITROL-VERSIE'), '20261015-181500\n');
  writeFileSync(join(wortel, 'BRON-COMMIT'), 'abc1234def5678\n');
  writeFileSync(join(wortel, 'AUTEUR'), 'eigenaar@example.test\n');
  writeFileSync(join(wortel, 'AGENT'), 'claude\n');
  writeFileSync(join(wortel, 'SAMENVATTING'), 'Нова архітектура адрес і governance випусків.\n');
  const oud = process.env.DIST_DIR;
  process.env.DIST_DIR = dist;
  try {
    _resetReleaseInfo();
    const i = releaseInfo();
    check('leest versie, commit, auteur, agent, samenvatting', i.versie === '20261015-181500' && i.commit === 'abc1234def5678' && i.auteur === 'eigenaar@example.test' && i.agent === 'claude' && !!i.samenvatting && i.samenvatting.length > 10, JSON.stringify(i));
    check('tweede aanroep komt uit de cache (zelfde waarden)', releaseInfo().versie === '20261015-181500');
    // ontbrekende bestanden → null, nooit een crash
    _resetReleaseInfo();
    process.env.DIST_DIR = join(wortel, 'leeg', 'dist');
    const leeg = releaseInfo();
    check('ontbrekende metadata → null (geen crash)', leeg.versie === null && leeg.auteur === null && leeg.agent === null);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    process.env.DIST_DIR = oud; _resetReleaseInfo();
    rmSync(wortel, { recursive: true, force: true });
  }
  return einde();
}
