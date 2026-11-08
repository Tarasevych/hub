// Збирає вигляд «Макет» (IDENTITEIT-007) з джерел макета власника: docs/ontwerp/identiteit-account/maquette-bron → src/identiteit/maquette.
// Порядок важливий: стилі дають пороги ширини, які потрібні правкам двигуна. Запуск: node scripts/identiteit-maquette/bouw.mjs
// Bouwt de weergave «Ontwerp» uit de bronbestanden van het ontwerp van de eigenaar; de gegenereerde bestanden niet met de hand bewerken.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const hier = path.dirname(fileURLToPath(import.meta.url));
for (const stap of ['stijlen.mjs', 'motor.mjs', 'motor-aanpassingen.mjs', 'sjabloon.mjs']) {
  process.stdout.write(stap + ': ');
  execFileSync(process.execPath, [path.join(hier, stap)], { stdio: 'inherit' });
}
