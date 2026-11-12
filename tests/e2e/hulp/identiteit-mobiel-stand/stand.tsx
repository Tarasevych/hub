import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IdentiteitAtelier } from '../../../../src/identiteit/IdentiteitAtelier';
import type { IdentiteitSectie } from '../../../../src/identiteit/IdentiteitAccountPagina';

const ids = ['personalization', 'menu', 'themes', 'languages', 'widgets', 'sharing', 'identity', 'account', 'sessions', 'methods', 'security', 'recovery'];

function Proef() {
  const [actief, setActief] = useState('menu');
  const secties: IdentiteitSectie[] = ids.map(id => ({
    id,
    titel: id,
    inhoud: <div className='settings-center ia-inline' data-proef={id}>
      {id === 'menu' ? <div className='settings-menu-editor'>
        <article><span>☰</span><div><strong>Огляд</strong><small>Видимий пункт</small></div><button>◉</button><button>✎</button><button>⚙</button><select aria-label='Піктограма'><option>Меню</option></select></article>
      </div> : id === 'languages' ? <div className='settings-choice-grid language'>
        <button><strong>🇺🇦 Українська</strong></button><button><strong>🇧🇪 Nederlands</strong></button>
      </div> : <div className='settings-card-grid'>
        <button className='settings-card'><span>◈</span><span><strong>Керування налаштуваннями</strong><small>Наявна дія та її докладне пояснення.</small></span></button>
      </div>}
    </div>,
  }));
  return <IdentiteitAtelier lang='uk' actief={actief} inBeeld={actief} secties={secties} onKies={setActief}/>;
}

createRoot(document.getElementById('root')!).render(<Proef/>);
