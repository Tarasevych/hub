import { BESTANDSFORMATEN, FORMAAT_FAMILIES, formaatVan } from '../../shared/bestandsformaten';
import { voorbeeldBreedte, voorbeeldHoogte } from '../../shared/bijlage-voorbeeld-maat';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean) => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}`); };

export async function main() {
  check('кожна позначка ≤ 5 знаків', BESTANDSFORMATEN.every((r) => r.label.length <= 5 && r.label.length > 0));
  const ext = BESTANDSFORMATEN.flatMap((r) => r.extensies);
  check('розширення унікальні', new Set(ext).size === ext.length);
  check('усі 13 родин присутні', FORMAAT_FAMILIES.every((f) => f === 'overig' || BESTANDSFORMATEN.some((r) => r.familie === f)));
  check('pdf за назвою і mime', formaatVan('a.PDF', '').familie === 'pdf' && formaatVan('x', 'application/pdf').id === 'pdf');
  check('невідоме → FILE', formaatVan('zonder', '').label === 'FILE' && formaatVan('zonder', '').familie === 'overig');
  check('S як раніше: 320, на вузькому екрані не ширше за вікно', voorbeeldBreedte('S', 1280) === 320 && voorbeeldBreedte('S', 200) === 220);
  check('колесо піднімає S до L (720), але не ширше за вікно', voorbeeldBreedte('S', 1280, true) === 720 && voorbeeldBreedte('S', 400, true) === 384);
  check('екран не вищий за вікно мінус запас', voorbeeldHoogte('scherm', 800) <= 750);
  const mis = resultaten.filter((r) => !r.ok);
  console.log(`${resultaten.length - mis.length}/${resultaten.length} geslaagd (bestandsformaten-20261026)`);
  return mis.length ? 1 : 0;
}
