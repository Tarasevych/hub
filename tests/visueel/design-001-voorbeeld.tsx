// Огляд справжніх компонентів із вигаданими даними; жодних запитів до облікового запису.
import { createRoot } from 'react-dom/client';
import { CalendarDays, ListTodo, Mail } from 'lucide-react';
import { Begroeting, SnelToegang, SnelleActies, Tip } from '../../src/werkblad/widgets/Start';
import type { WidgetProps } from '../../src/werkblad/soorten';
import '../../src/index.css';
import '../../src/ontwerp/fundament.css';
import '../../src/werkblad/werkblad.css';

const donker = new URLSearchParams(location.search).has('donker');
document.documentElement.className = donker ? 'theme-dark' : 'theme-light';
const acties = { dienst() {}, hubTab() {}, zoek() {}, catalogus() {}, instellen() {} };
const props = { lang: 'uk', naam: 'Користувач', acties, item: { tid: 'voorbeeld', r: 2 }, kolommen: 12, techProfiel: false, apiPlatform: false, eigenaar: true, ownerUserId: '', zichtbaar: false } as unknown as WidgetProps;

function Voorbeeld() {
  return <main className={`canonical-chrome ${donker ? 'theme-dark' : 'theme-light'}`} style={{ position: 'relative', minHeight: '100vh', padding: '16px', overflow: 'auto' }}>
    <div className='canonical-content'>
      <h1 className='hub-workspace-title'>Робочий стіл</h1>
      <div className='werkblad' style={{ margin: 0 }}><div className='wb-raster'>
        <article className='wb-tegel is-kaal' style={{ gridColumn: 'span 12' }}><Begroeting {...props} /></article>
        <article className='wb-tegel is-kaart' style={{ gridColumn: 'span 8', gridRow: 'span 2' }}><header className='wb-tegel-kop'><Mail className='wb-tegel-icoon' /><span className='wb-tegel-titel'>Швидкий доступ</span></header><div className='wb-tegel-inhoud'><SnelToegang {...props} /></div></article>
        <article className='wb-tegel is-kaart' style={{ gridColumn: 'span 4', gridRow: 'span 2' }}><header className='wb-tegel-kop'><ListTodo className='wb-tegel-icoon' /><span className='wb-tegel-titel'>Швидкі дії</span></header><div className='wb-tegel-inhoud'><SnelleActies {...props} /></div></article>
        <article className='wb-tegel is-kaart' style={{ gridColumn: 'span 6', gridRow: 'span 2' }}><header className='wb-tegel-kop'><CalendarDays className='wb-tegel-icoon' /><span className='wb-tegel-titel'>Календар</span></header><div className='wb-tegel-inhoud'><p className='wb-leeg'>Ваші події з’являться тут.</p><button type='button' className='knop-secundair'>Відкрити календар</button></div></article>
        <article className='wb-tegel is-kaart' style={{ gridColumn: 'span 6', gridRow: 'span 2' }}><header className='wb-tegel-kop'><Mail className='wb-tegel-icoon' /><span className='wb-tegel-titel'>Пошта</span></header><div className='wb-tegel-inhoud'><p className='wb-leeg'>Підключіть пошту до свого простору.</p><button type='button' className='knop-primair'>Підключити</button></div></article>
        <article className='wb-tegel is-kaal' style={{ gridColumn: 'span 12' }}><Tip {...props} /></article>
      </div></div>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Voorbeeld />);
