// DESIGN-001 / AUDIT-001 · Перевірка оновлених дизайн-токенів, modern.css, fundament.css та vensters.css.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('design-001');
  const tokens = readFileSync('src/ontwerp/tokens.css', 'utf8');
  const fundament = readFileSync('src/ontwerp/fundament.css', 'utf8');
  const modern = readFileSync('src/ontwerp/modern.css', 'utf8');
  const vensters = readFileSync('src/platform/vensters.css', 'utf8');
  const dossier = JSON.parse(readFileSync('orchestratie/ontwikkelarchieven/DESIGN-001.json', 'utf8'));

  check('tokens.css задає оновлені радіуси --straal-s/m/l/xl (10px/14px/20px/26px)',
    tokens.includes('--straal-s:10px; --straal-m:14px; --straal-l:20px; --straal-xl:26px;'));

  check('fundament.css підключає tokens.css, primitieven.css, mobiel.css та modern.css',
    fundament.includes("@import './tokens.css';")
    && fundament.includes("@import './primitieven.css';")
    && fundament.includes("@import './mobiel.css';")
    && fundament.includes("@import './modern.css';"));

  check('modern.css містить оновлені поверхні карток, кнопок, робочого столу (.werkblad, .wb-begroeting) та мобільні правила',
    modern.includes('--ruimte-oppervlak:')
    && modern.includes('.canonical-content .werkblad')
    && modern.includes('.canonical-content .wb-begroeting')
    && modern.includes('@media (max-width: 700px)'));

  check('vensters.css використовує оновлений радіус var(--straal-xl,26px) та розмиття фону',
    vensters.includes('border-radius:var(--straal-xl,26px)')
    && vensters.includes('backdrop-filter:blur(3px)'));

  check('TRACE-001 досьє DESIGN-001 присутнє та валідне',
    dossier.schema === 1
    && dossier.taakId === 'DESIGN-001'
    && dossier.privacy?.geheimenUitgesloten === true
    && typeof dossier.opdracht === 'string'
    && dossier.opdracht.trim().length >= 40);

  return einde();
}
