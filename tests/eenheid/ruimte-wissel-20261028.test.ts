// Eenheidstests wissel van ruimte (28.10.2026): sneltoets, ruimteSleutel, ruimte uit status, seintje bij wissel. Geen DB nodig.
// Draaien: node scripts/eenheidstests.mjs ruimte-wissel
import { checker } from './hulp/nep-google';
import { sneltoetsRuimte } from '../../src/tech/ruimtes/sneltoets';
import { ruimteSleutel, sleutelVanRuimte } from '../../src/tech/ruimtes/ruimte-sleutel';
import { wisselFoutTekst } from '../../src/tech/ruimtes/teksten';
import { huidigeRuimte, meldRuimte, ruimteVanStatus, RUIMTE_WISSEL_GEBEURTENIS } from '../../src/tech/ruimtes/ruimte-signaal';

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-wissel');
  const k = (x: Partial<Parameters<typeof sneltoetsRuimte>[0]>) => sneltoetsRuimte({ ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, code: 'Digit1', ...x });
  check('Ctrl+Alt+1 → prive', k({}) === 'prive');
  check('Ctrl+Alt+2 → technisch', k({ code: 'Digit2' }) === 'technisch');
  check('numeriek blok 2 → technisch', k({ code: 'Numpad2' }) === 'technisch');
  check('AltGr (typt een teken) → niets', k({ getModifierState: (m) => m === 'AltGraph' }) === null);
  check('zonder Ctrl → niets', k({ ctrlKey: false }) === null);
  check('met Shift → niets', k({ shiftKey: true }) === null);
  check('herhaling (toets ingedrukt) → niets', k({ repeat: true }) === null);
  check('Ctrl+Alt+3 → niets', k({ code: 'Digit3' }) === null);
  check('ruimteSleutel: twee ruimtes nooit dezelfde sleutel', ruimteSleutel('prive', 'u1') !== ruimteSleutel('technisch', 'u1'));
  check('sleutelVanRuimte herkent eigen ruimte', sleutelVanRuimte(ruimteSleutel('technisch', 'u1'), 'technisch') && !sleutelVanRuimte(ruimteSleutel('technisch', 'u1'), 'prive'));
  check('ruimteVanStatus: vlag uit → prive', ruimteVanStatus({ aan: false, actief: 'technisch' }) === 'prive');
  check('ruimteVanStatus: null → prive', ruimteVanStatus(null) === 'prive');
  check('ruimteVanStatus: aan+technisch → technisch', ruimteVanStatus({ aan: true, actief: 'technisch' }) === 'technisch');
  const f403 = Object.assign(new Error('SITE_SESSIE_WEG'), { response: { data: { error: 'SITE_SESSIE_WEG', uitleg: { uk: 'Ви вийшли з акаунта на сайті.', nl: 'U bent afgemeld op de site.' } } } });
  check('403-uitleg van de server getoond (UA)', wisselFoutTekst(f403, 'uk') === 'Ви вийшли з акаунта на сайті. Ви лишилися там, де були.');
  check('403-uitleg van de server getoond (NL)', wisselFoutTekst(f403, 'nl').startsWith('U bent afgemeld op de site.'));
  check('zonder uitleg: code + «лишилися»', wisselFoutTekst(new Error('NETWERK'), 'uk').includes('(NETWERK)') && wisselFoutTekst(new Error('X'), 'uk').endsWith('там, де були.'));
  // Seintje: nep-window/document
  const gebeurtenissen: any[] = [];
  (globalThis as any).CustomEvent ??= class { type: string; detail: unknown; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } };
  (globalThis as any).window = { dispatchEvent: (e: any) => { gebeurtenissen.push(e); return true; } };
  (globalThis as any).document = { documentElement: { dataset: {} as Record<string, string> } };
  check('begin prive', huidigeRuimte() === 'prive');
  check('zelfde ruimte → geen seintje', meldRuimte('prive') === false && gebeurtenissen.length === 0);
  check('wissel naar technisch → één seintje met van/naar', meldRuimte('technisch') === true && gebeurtenissen.length === 1 && gebeurtenissen[0].type === RUIMTE_WISSEL_GEBEURTENIS && gebeurtenissen[0].detail.van === 'prive' && gebeurtenissen[0].detail.naar === 'technisch');
  check('html[data-ruimte] gezet', (globalThis as any).document.documentElement.dataset.ruimte === 'technisch');
  check('terug naar prive → tweede seintje', meldRuimte('prive') === true && gebeurtenissen.length === 2 && gebeurtenissen[1].detail.naar === 'prive');
  delete (globalThis as any).window; delete (globalThis as any).document;
  return einde();
}
