// ВІКНО ВІДХИЛЕННЯ (SEC-PAKKET-001, власник 16.11.2026): готові причини одним дотиком, підказки за перевіркою сайту, правило причини.
// AFWIJSVENSTER: snelle redenen met één tik (nog eens tikken haalt weg), suggesties uit de voorcontrole, dezelfde regel als de server.
import { afwijsReden } from '../../backend/uitrol-goedkeuring';
import { afwijsRedenGeldig, snelleRedenen, wisselReden } from '../../src/uitrol/AfwijsVenster';
import { checker } from './hulp/nep-google';

const vc = (vlaggen: unknown[]) => ({ versie: 1, tijd: '', ok: true, fouten: 0, waarschuwingen: 1, controles: [{ id: 'risico', niveau: 'fout', uk: '', nl: '', details: [], vlaggen }] }) as any;
const zonder = (pad: string) => ({ pad, soort: 'root', leesbaar: { uitlegNodig: true } });

export async function main(): Promise<number> {
  const { check, einde } = checker('afwijs-venster-20261116');
  // Те саме правило, що й на сервері: що приймає вікно, те приймає сервер, і навпаки.
  for (const r of ['', '  ', '!!!', 'a', '— ; …', 'ok', 'ні', 'не замовляв', 'rm -rf', '42']) {
    let server = true; try { afwijsReden(r); } catch { server = false; }
    check(`правило як на сервері: «${r}»`, afwijsRedenGeldig(r) === server);
  }
  // Вставка і прибирання. Invoegen en weghalen.
  const a = wisselReden('', 'Не замовляв це оновлення');
  check('дотик вставляє в порожнє поле', a === 'Не замовляв це оновлення');
  const b = wisselReden(a, 'Чекаю пояснення від автора');
  check('другий дотик додає через «; »', b === 'Не замовляв це оновлення; Чекаю пояснення від автора');
  check('повторний дотик прибирає лише своє', wisselReden(b, 'Не замовляв це оновлення') === 'Чекаю пояснення від автора');
  check('власний текст лишається', wisselReden('мій текст', 'Дублікат уже надісланого пакета') === 'мій текст; Дублікат уже надісланого пакета');
  check('регістр не важить при прибиранні', wisselReden('не замовляв це оновлення', 'Не замовляв це оновлення') === '');
  check('не довше 500 знаків', [...wisselReden('я'.repeat(495), 'Не замовляв це оновлення')].length === 500);
  check('результат вставки завжди проходить правило', afwijsRedenGeldig(wisselReden('', 'Не зараз, нехай автор надішле пізніше')));

  // Підказки за перевіркою. Suggesties uit de voorcontrole.
  const leeg = snelleRedenen({ tests: { geslaagd: 10, mislukt: 0 }, voorcontrole: null });
  check('без знахідок — жодної підказки «за перевіркою»', leeg.every((s) => !s.voorstel));
  check('без знахідок є загальна «Ризиковані зміни»', leeg.some((s) => s.id === 'risico'));
  check('загальні причини на місці', ['niet-besteld', 'uitleg', 'oud', 'dubbel', 'later', 'tests'].every((id) => leeg.some((s) => s.id === id)));
  const twee = snelleRedenen({ tests: { geslaagd: 10, mislukt: 3 }, voorcontrole: vc([zonder('a.sh'), zonder('b.sh'), { pad: 'c.yml', leesbaar: { uitlegNodig: true }, auteur: { uk: 'пояснено' } }]) });
  const zu = twee.find((s) => s.id === 'zonder-uitleg');
  check('рахує лише зміни без пояснення (2 з 3)', !!zu && zu.voorstel === true && zu.tekst[0].includes('(2)') && zu.label[0] === '2 зміни без пояснення', zu?.label[0]);
  check('нідерландською — множина', zu?.label[1] === '2 wijzigingen zonder uitleg');
  check('тести з помилками — підказка з числом', twee.some((s) => s.id === 'tests' && s.voorstel && s.tekst[0].includes('(3 з помилками)')));
  check('коли є підказка про прапорці, загальної «Ризиковані зміни» немає (без дублю)', !twee.some((s) => s.id === 'risico'));
  check('підказки йдуть першими', twee[0].voorstel === true && twee[1].voorstel === true);
  const een = snelleRedenen({ tests: {}, voorcontrole: vc([zonder('a.sh')]) });
  check('1 зміна / 5 змін', een.find((s) => s.id === 'zonder-uitleg')?.label[0] === '1 зміна без пояснення'
    && snelleRedenen({ tests: {}, voorcontrole: vc([1, 2, 3, 4, 5].map((i) => zonder(`${i}.sh`))) }).find((s) => s.id === 'zonder-uitleg')?.label[0] === '5 змін без пояснення');
  check('кожна причина має пояснення для підказки обома мовами', [...leeg, ...twee].every((s) => s.uitleg[0].length > 10 && s.uitleg[1].length > 10));
  check('ідентифікатори без повторів', new Set(twee.map((s) => s.id)).size === twee.length);
  return einde();
}
