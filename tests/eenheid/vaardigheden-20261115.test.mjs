// VAARD-001: самостійні випробування добору та читання навичок.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kiesVaardigheden, laadCatalogus, leesVaardigheid } from '../../scripts/vaardigheden/kies.mjs';

const catalogus = laadCatalogus();

test('п’ять різних навичок мають правильні вихідні файли', () => {
  assert.equal(catalogus.vaardigheden.length, 5);
  const namen = new Set(catalogus.vaardigheden.map((item) => item.naam));
  assert.equal(namen.size, 5);
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

test('перевірка безпеки випуску не плутається з його підготовкою', () => {
  const uit = kiesVaardigheden('Перевір новий випуск на безпеку');
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

test('прохання зберегти ідею знаходить навичку пам’яті розвитку', () => {
  const uit = kiesVaardigheden('Зафіксуй ідею в пам’яті розвитку');
  assert.equal(uit[0]?.naam, 'ontwikkelgeheugen-bewaken');
});

test('пошук давніх файлів добирає навичку пам’яті', () => {
  const uit = kiesVaardigheden('Знайди попередній файл і не створюй заново');
  assert.equal(uit[0]?.naam, 'ontwikkelgeheugen-bewaken');
});

test('передавання між агентами добирає спільну пам’ять', () => {
  const uit = kiesVaardigheden('Передай іншому агенту історію роботи');
  assert.equal(uit[0]?.naam, 'ontwikkelgeheugen-bewaken');
});

test('повторна несправність з посиланням на старе виправлення не плутається з перевіркою', () => {
  const uit = kiesVaardigheden('Знайди попереднє виправлення: знову помилка');
  assert.equal(uit[0]?.naam, 'ontwikkelgeheugen-bewaken');
});

test('нідерландське прохання передати роботу знаходить пам’ять', () => {
  const uit = kiesVaardigheden('Gebruik het ontwikkelgeheugen en draag het werk over');
  assert.equal(uit[0]?.naam, 'ontwikkelgeheugen-bewaken');
});

test('усі навички доступні за назвою та мають початкові відомості', () => {
  const namen = catalogus.vaardigheden.map((item) => item.naam);
  assert.ok(namen.includes('ontwikkelgeheugen-bewaken'));
  const inhoud = leesVaardigheid('ontwikkelgeheugen-bewaken');
  assert.match(inhoud, /Пам’ять розвитку/);
  assert.match(inhoud, /WERKOVERDRACHT\.uk\.md/);
});

test('звичайна перевірка помилки й далі добирає перевірку змін', () => {
  const uit = kiesVaardigheden('Перевір помилку та безпеку');
  assert.equal(uit[0]?.naam, 'wijziging-controleren');
});
