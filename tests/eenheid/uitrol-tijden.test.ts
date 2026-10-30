// Audit 18.10.2026, punt 6: «час очікування результату має бути не меншим, ніж час, який система дозволяє на встановлення».
// Reproduceert het oude probleem (GOEDGEKEURD_WACHT 30 min < systemd 45 min → «прострочено» bij een levende installatie) en bewaakt dat de
// constanten in shared/uitrol-tijden.ts en de service-bestanden in de pas blijven.
import { readFileSync } from 'node:fs';
import { GOEDGEKEURD_WACHT_MINUTEN, RUN_STIL_MINUTEN, UITROL_SYSTEMD_LIMIET_MINUTEN } from '../../shared/uitrol-tijden';
import { checker } from './hulp/nep-google';
import { datumInZone, isOnbepaaldEinde } from '../../src/uitrol/tijdzone';

const timeoutMin = (pad: string) => {
  const m = /^TimeoutStartSec=(\d+)(min|s)?$/m.exec(readFileSync(pad, 'utf8'));
  if (!m) return NaN;
  return m[2] === 'min' ? Number(m[1]) : Number(m[1]) / 60;
};

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-tijden');
  const uitrol = timeoutMin('deploy/mijn-ruimte-uitrol.service'), goedkeuring = timeoutMin('deploy/mijn-ruimte-goedkeuring.service');
  check('UITROL_SYSTEMD_LIMIET_MINUTEN = TimeoutStartSec van mijn-ruimte-uitrol.service', uitrol === UITROL_SYSTEMD_LIMIET_MINUTEN, `${uitrol} vs ${UITROL_SYSTEMD_LIMIET_MINUTEN}`);
  check('… en van mijn-ruimte-goedkeuring.service (passkey-weg)', goedkeuring === UITROL_SYSTEMD_LIMIET_MINUTEN, `${goedkeuring} vs ${UITROL_SYSTEMD_LIMIET_MINUTEN}`);
  check('oude fout: 30 min wachten was korter dan de 45 min die systemd toestaat', 30 < UITROL_SYSTEMD_LIMIET_MINUTEN);
  check('GOEDGEKEURD_WACHT_MINUTEN > systemd-limiet (geen «прострочено» bij een levende installatie)', GOEDGEKEURD_WACHT_MINUTEN > Math.max(uitrol, goedkeuring), String(GOEDGEKEURD_WACHT_MINUTEN));
  check('RUN_STIL_MINUTEN > systemd-limiet', RUN_STIL_MINUTEN > Math.max(uitrol, goedkeuring), String(RUN_STIL_MINUTEN));
  // De app gebruikt de gedeelde constanten (geen eigen, uiteenlopende getallen meer).
  const goedk = readFileSync('backend/uitrol-goedkeuring.ts', 'utf8'), runs = readFileSync('backend/uitrol-runs.ts', 'utf8');
  check('backend/uitrol-goedkeuring.ts importeert GOEDGEKEURD_WACHT_MINUTEN uit shared (geen eigen const)', /import \{[^}]*GOEDGEKEURD_WACHT_MINUTEN[^}]*\} from '\.\.\/shared\/uitrol-tijden'/.test(goedk) && !/const GOEDGEKEURD_WACHT_MINUTEN\s*=/.test(goedk));
  check('backend/uitrol-runs.ts importeert RUN_STIL_MINUTEN uit shared (geen eigen const)', /import \{[^}]*RUN_STIL_MINUTEN[^}]*\} from '\.\.\/shared\/uitrol-tijden'/.test(runs) && !/const RUN_STIL_MINUTEN\s*=/.test(runs));
  // Audit 19.10.2026 (A7): ONBEPAALD_EINDE (9999-12-31) wordt nergens als «до 31.12.99» getoond maar als «до відкликання» / «tot intrekking».
  check('A7: 9999-12-31 → «відкликання»/«intrekking», gewone datum blijft een datum', datumInZone('9999-12-31T00:00:00.000Z', 'uk', 'short', 'UTC') === 'відкликання' && datumInZone('9999-12-31T00:00:00.000Z', 'nl', 'medium', 'UTC') === 'intrekking'
    && /19\.10\.26/.test(datumInZone('2026-10-19T10:00:00.000Z', 'uk', 'short', 'UTC')) && isOnbepaaldEinde(new Date('9999-12-31T00:00:00Z')) && !isOnbepaaldEinde(new Date('2030-01-01T00:00:00Z')));
  check('A7: Zijkant en Voorbereiders tonen «до відкликання» voor een grant zonder einddatum', /g\.onbepaald \? tr\(lang, 'до відкликання'/.test(readFileSync('src/uitrol/Zijkant.tsx', 'utf8')) && /getUTCFullYear\(\) >= 9999\) return tr\(lang, 'до відкликання'/.test(readFileSync('src/uitrol/Voorbereiders.tsx', 'utf8')));
  return einde();
}
