// SEC-002 (integraties-10, 12.11.2026): een taknaam die met «-» begint werd een optie van git op het apparaat van de gebruiker
// (`git push origin --mirror` wist op GitHub alle takken en tags die lokaal ontbreken; `--force` overschrijft).
// Bewijs: veiligTakNaam weigert zulke namen, ghApparaatActie weigert ze vóór er iets naar een apparaat gaat, en de opdrachten
// zetten de tak nooit los als argument.
import { readFileSync } from 'node:fs';
import { veiligTakNaam } from '../../shared/github-werkruimte';
import { geldigeBranch } from '../../shared/github-pr';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('github-werkruimte-tak-20261112');

  const opties = ['--mirror', '--force', '-f', '--all', '--delete', '--prune', '--tags', '-d', '--receive-pack=/tmp/x', '--upload-pack=touch'];
  const door = opties.filter((t) => veiligTakNaam(t) !== '');
  check('integraties-10: veiligTakNaam weigert namen die met «-» beginnen (--mirror, --force, -f, --all, --delete, …)', door.length === 0, door.join(' '));
  const raar = ['.verborgen', 'a/.b', 'a/', 'HEAD', '/a', 'a//b', 'a..b', 'a.lock', 'a@{1}', 'a b', 'a~1', 'a^', 'a:b'];
  const raarDoor = raar.filter((t) => veiligTakNaam(t) !== '');
  check('integraties-10: ook delen met «.» vooraan, «/» achteraan en «HEAD» worden geweigerd (zoals geldigeBranch)', raarDoor.length === 0, raarDoor.join(' '));
  const gewoon = ['main', 'develop', 'feature/nieuw-scherm', 'release/2026.11', 'v1.2.3', 'fix_123', 'a-b/c-d'];
  check('integraties-10: gewone taknamen blijven geldig', gewoon.every((t) => veiligTakNaam(t) === t), gewoon.filter((t) => veiligTakNaam(t) !== t).join(' '));
  const verschil = [...opties, ...raar, ...gewoon].filter((t) => !!veiligTakNaam(t) && !geldigeBranch(t));
  check('integraties-10: veiligTakNaam laat niets door wat geldigeBranch (PR-werkstroom) weigert', verschil.length === 0, verschil.join(' '));

  // De route zelf: een ongeldige tak is een fout (geen stille terugval op main) en er gaat niets naar een apparaat.
  const { ghApparaatActie } = await import('../../backend/github-werkruimte');
  const wie = { userId: 'u-test', ruimte: 'prive' } as never;
  const fouten: string[] = [];
  for (const actie of ['push', 'pull', 'clone', 'deploy']) {
    const r = await ghApparaatActie(wie, { repo: 'voorbeeld/repo', apparaatId: 'app-1', actie, tak: '--mirror' }).catch((e) => ({ ok: false, error: `GOOIT:${(e as Error).message}` }));
    if (r.ok || (r as { error?: string }).error !== 'GITHUB_TAK_ONGELDIG') fouten.push(`${actie}=${JSON.stringify(r).slice(0, 120)}`);
  }
  check('integraties-10: ghApparaatActie met tak «--mirror» → GITHUB_TAK_ONGELDIG, vóór het apparaat wordt opgezocht', fouten.length === 0, fouten.join(' | '));

  // Diepte-verdediging: de opdrachtregels zetten de tak achter «refs/heads/» of «--branch=», en het adres achter «--».
  const bron = readFileSync('backend/github-werkruimte.ts', 'utf8');
  const blok = bron.slice(bron.indexOf('export async function ghApparaatActie'), bron.indexOf('// 6. HTTP-routes'));
  check('integraties-10: push/pull/clone zetten de tak nooit los als argument',
    blok.includes('git push origin refs/heads/${tak}:refs/heads/${tak}') && blok.includes('git pull --ff-only origin refs/heads/${tak}')
    && blok.includes('git clone --branch=${tak} -- https://github.com/') && !/origin \$\{tak\}/.test(blok) && !/--branch \$\{tak\}/.test(blok));
  return einde();
}
