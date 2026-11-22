import assert from 'node:assert/strict';
import { leesHonderdsten, maakBegroting } from '../../shared/klantrelatie-begroting';

export function main() {
  assert.equal(leesHonderdsten(' 12,3 '), 1230);
  assert.equal(leesHonderdsten('0.05'), 5);
  for (const invoer of ['12.123', '', '-3', '1e2', '1,234.56']) assert.equal(leesHonderdsten(invoer), null);
  assert.deepEqual(maakBegroting(50, 1000, 500, 2100),
    { bruto: 50000, kortingbedrag: 2500, netto: 47500, belastingbedrag: 9975, totaal: 57475 });
  assert.equal(maakBegroting(1, 5, 1000, 0)?.kortingbedrag, 1);
  assert.equal(maakBegroting(1, 125, 10000, 2100)?.totaal, 0);
  assert.equal(maakBegroting(1.2, 125, 0, 0), null);
  assert.equal(maakBegroting(10, 1000, 10001, 0), null);
  assert.equal(maakBegroting(1_000_000, Number.MAX_SAFE_INTEGER, 0, 0), null);
  return 0;
}
