// MAILAI-003 (16.11.2026): сховище спільних рушіїв ШІ й лічильника на СПРАВЖНІЙ базі PostgreSQL (міграція 0295).
// Перевіряє справжні запити pgOpslag: запис і оновлення рушія, атомарну денну межу (зокрема 20 одночасних запитів),
// повернення запиту після збою, відмови, статистику власника, вилучення. Без бази — пропускається.
// Echte database: opslag van gedeelde AI-motoren en de gebruiksteller; zonder database overgeslagen.
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { pgOpslag } from '../../backend/ai-dienst-motoren';
import { closePool, getPool } from '../../server/platform/pg';

export async function main(): Promise<number> {
  const { check, einde } = checker('mailai-003-db-20261116');
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN mailai-003-db (integratie): geen database'); return einde(); }
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const id = `proef-${sfx}`, id2 = `proef-o-${sfx}`;
  const motor = `dienst:${id}`;
  const A = `mailai-a-${sfx}`, B = `mailai-b-${sfx}`;
  const dag = '2026-11-16', gisteren = '2026-11-15';
  try {
    // Рушій: запис, читання, оновлення тим самим id (ON CONFLICT).
    await pgOpslag.bewaar({ id, soort: 'aanbieder', naam: 'Claude сайту', aanbieder: 'anthropic', aan: false, limietPerDag: 3, heeftSleutel: true, beheerder: 'Павло', bijgewerktOp: 0, eigenaarUserId: A });
    await pgOpslag.bewaar({ id: id2, soort: 'ollama', naam: 'Модель', url: 'https://ollama.test.invalid', model: 'gemma3:12b', aan: false, limietPerDag: 20, heeftSleutel: false, beheerder: 'Павло', bijgewerktOp: 0, eigenaarUserId: A });
    let rij = (await pgOpslag.lijst()).find((r) => r.id === id);
    check('рушій записано й прочитано з усіма полями', !!rij && rij.soort === 'aanbieder' && rij.aanbieder === 'anthropic' && rij.aan === false && rij.limietPerDag === 3 && rij.heeftSleutel === true && rij.beheerder === 'Павло' && rij.eigenaarUserId === A && rij.url === undefined && rij.bijgewerktOp > 0);
    const o = (await pgOpslag.lijst()).find((r) => r.id === id2);
    check('рушій на власному сервері: адреса й модель, без постачальника', !!o && o.url === 'https://ollama.test.invalid' && o.model === 'gemma3:12b' && o.aanbieder === undefined && o.heeftSleutel === false);
    await pgOpslag.bewaar({ ...rij!, aan: true, limietPerDag: 5, naam: 'Claude сайту 2' });
    rij = (await pgOpslag.lijst()).find((r) => r.id === id);
    check('оновлення тим самим id змінює рядок, а не додає новий', !!rij && rij.aan === true && rij.limietPerDag === 5 && rij.naam === 'Claude сайту 2' && (await pgOpslag.lijst()).filter((r) => r.id === id).length === 1);
    let geweigerd = false;
    try { await pgOpslag.bewaar({ ...rij!, id: `fout-${sfx}`, soort: 'ollama' }); } catch { geweigerd = true; }
    check('база відхиляє неможливу форму (Ollama з постачальником і без адреси)', geweigerd);

    // Денна межа: атомарно, з відмовами.
    const r1 = await pgOpslag.reserveer(A, motor, dag, 3), r2 = await pgOpslag.reserveer(A, motor, dag, 3), r3 = await pgOpslag.reserveer(A, motor, dag, 3);
    const r4 = await pgOpslag.reserveer(A, motor, dag, 3), r5 = await pgOpslag.reserveer(A, motor, dag, 3);
    check('межа 3: три запити проходять, четвертий і п’ятий — ні', r1 === 1 && r2 === 2 && r3 === 3 && r4 === null && r5 === null);
    check('лічильник людини не перевищує межу', (await pgOpslag.gebruikVan(A, dag))[motor] === 3);
    await pgOpslag.geefTerug(A, motor, dag);
    check('збій рушія повертає запит (3 → 2), і він знову доступний', (await pgOpslag.gebruikVan(A, dag))[motor] === 2 && (await pgOpslag.reserveer(A, motor, dag, 3)) === 3);
    // 20 одночасних запитів іншої людини при межі 5: рівно 5 проходять.
    const gelijk = await Promise.all(Array.from({ length: 20 }, () => pgOpslag.reserveer(B, motor, dag, 5)));
    const door = gelijk.filter((x) => x !== null) as number[];
    check('20 одночасних запитів при межі 5: проходять рівно 5, без дублів', door.length === 5 && new Set(door).size === 5 && Math.max(...door) === 5 && (await pgOpslag.gebruikVan(B, dag))[motor] === 5);
    check('лічильники людей незалежні', (await pgOpslag.gebruikVan(A, dag))[motor] === 3);
    // Особистий ключ: без межі.
    const eigen = `sleutel:gemini`;
    for (let i = 0; i < 7; i += 1) await pgOpslag.reserveer(A, eigen, gisteren, null);
    check('особистий ключ рахується без межі', (await pgOpslag.gebruikVan(A, gisteren))[eigen] === 7);
    for (let i = 0; i < 9; i += 1) await pgOpslag.geefTerug(B, motor, gisteren);
    check('повернення не робить лічильник від’ємним і не створює рядків', (await pgOpslag.gebruikVan(B, gisteren))[motor] === undefined);

    // Статистика власника: лише спільні рушії, без імен людей.
    const st = (await pgOpslag.statistiek(gisteren)).filter((s) => s.motor === motor);
    check('статистика: запити, відмови й число людей за день', st.length === 1 && st[0].dag === dag && st[0].aantal === 8 && st[0].geweigerd === 2 + 15 && st[0].gebruikers === 2);
    check('статистика не містить особистих ключів і ідентифікаторів людей', (await pgOpslag.statistiek(gisteren)).every((s) => s.motor.startsWith('dienst:') && !('user_id' in s) && !JSON.stringify(s).includes(A)));

    check('вилучення рушія: так один раз, удруге — ні', (await pgOpslag.verwijder(id)) === true && (await pgOpslag.verwijder(id)) === false);
  } finally {
    await sys.query('DELETE FROM app.ai_dienst_motoren WHERE id = ANY($1::text[])', [[id, id2, `fout-${sfx}`]]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_motor_gebruik WHERE user_id = ANY($1::text[])', [[A, B]]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
