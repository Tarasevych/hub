// VAARD-001: самостійні випробування добору та читання навичок.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kiesVaardigheden, laadCatalogus, leesVaardigheid } from '../../scripts/vaardigheden/kies.mjs';

const catalogus = laadCatalogus();

test('чотири різні навички мають правильні вихідні файли', () => {
  assert.equal(catalogus.vaardigheden.length, 4);
  const namen = new Set(catalogus.vaardigheden.map((item) => item.naam));
  assert.equal(namen.size, 4);
  for (const item of catalogus.vaardigheden) {
    assert.ok(leesVaardigheid(item.naam).startsWith(`---\nname: ${item.naam}\n`));
    assert.ok(item.samenvatting.uk && item.samenvatting.nl);
  }
});

test('запит про випуск знаходить навичку підготовки випусків', () => {
  const uit = kiesVaardigheden('Підготуй новий випуск і перевір архів');
  assert.equal(uit[0]?.naam, 'uitgave-voorbereiden');
});

test('запит про створення сторінки знаходить навичку розробки', () => {
  const uit = kiesVaardigheden('Розроби нову сторінку налаштувань');
  assert.equal(uit[0]?.naam, 'site-ontwikkelen');
});

test('запит про випробування знаходить навичку перевірки', () => {
  const uit = kiesVaardigheden('Перевір зміни та безпеку');
  assert.equal(uit[0]?.naam, 'wijziging-controleren');
});

test('нідерландський запит про будову знаходить огляд проєкту', () => {
  const uit = kiesVaardigheden('Verken de projectopbouw en diensten');
  assert.equal(uit[0]?.naam, 'project-verkennen');
});

test('порожній запит не створює випадкового вибору', () => {
  assert.deepEqual(kiesVaardigheden(''), []);
});

test('без відомостей про інструменти доступ невідомий', () => {
  const uit = kiesVaardigheden('випуск');
  assert.equal(uit[0].aansluiting, 'onbekend');
});

test('брак інструмента MCP не приховується', () => {
  const uit = kiesVaardigheden('випуск', { zichtbareHulpmiddelen: [] });
  assert.equal(uit[0].aansluiting, 'hulpmiddelen_ontbreken');
  assert.deepEqual(uit[0].ontbrekendeHulpmiddelen, ['uitrol_voorstel_begin']);
});

test('наявний інструмент не надає дозволу, лише показує технічну сумісність', () => {
  const uit = kiesVaardigheden('випуск', { zichtbareHulpmiddelen: ['uitrol_voorstel_begin'] });
  assert.equal(uit[0].aansluiting, 'hulpmiddelen_aanwezig');
  assert.deepEqual(uit[0].ontbrekendeHulpmiddelen, []);
});

test('вибіркове завантаження відхиляє невідому навичку', () => {
  assert.throws(() => leesVaardigheid('../../orchestratie/beleid.json'), /VAARD_NIET_GEVONDEN/);
});

test('обмеження кількості підказок не втрачає пріоритет', () => {
  const uit = kiesVaardigheden('підготуй випуск сайту та перевір архів', { maximum: 1 });
  assert.equal(uit.length, 1);
  assert.equal(uit[0]?.naam, 'uitgave-voorbereiden');
});
