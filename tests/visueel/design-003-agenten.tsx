// Справжні екрани агентів. Браузерний стенд підміняє відповіді API до відкриття сторінки.
import { createRoot } from 'react-dom/client';
import AgentBord from '../../src/agenten/AgentBord';
import AgentPagina from '../../src/agenten/AgentPagina';
import '../../src/index.css';
import '../../src/ontwerp/fundament.css';
import '../../src/agenten/agenten-pagina.css';

const query = new URLSearchParams(location.search);
const nl = query.get('lang') === 'nl';
const thema = 'theme-' + (query.get('thema') || 'light');
const tr = (uk: string, nederlands: string) => nl ? nederlands : uk;
const breedte = Number(query.get('paneel')) || 1100;
document.documentElement.lang = nl ? 'nl' : 'uk';
document.documentElement.className = thema;

createRoot(document.getElementById('root')!).render(
  <main className={'canonical-chrome ' + thema} style={{ position: 'relative', minHeight: '100vh', overflow: 'auto', padding: 12 }}>
    <div className='canonical-content' style={{ minWidth: 0, maxWidth: breedte, margin: '0 auto' }}>
      {query.get('deel') === 'profiel'
        ? <div className='ag ag-pagina'><AgentPagina tr={tr} slug='antigravity' terug={() => history.back()} /></div>
        : <AgentBord tr={tr} />}
    </div>
  </main>
);
