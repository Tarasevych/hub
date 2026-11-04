// MAILPOLISH-001 · Vite/Chromium-pagina met ECHTE React-componenten, uitsluitend fictieve data.
// Dit is geen tweede implementatie of productiepagina. OAuth blijft een simulatie in de preview.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MailKoppelVenster from '../../src/mail/MailKoppelVenster';
import MailOrbitIntro from '../../src/mail/MailOrbitIntro';

function Preview() {
  const [aanbieder, setAanbieder] = useState<string | null>(() => new URLSearchParams(location.search).get('provider'));
  return <main className='mailpolish-preview'>
    <p className='mailpolish-preview-label'>Mijn Ruimte · ontwerpcontrole</p>
    <MailOrbitIntro lang='uk' onSelect={(a) => setAanbieder(a.id)} />
    {aanbieder ? <MailKoppelVenster lang='uk' id='mail-koppelen:preview' aanbieder={aanbieder}
      adres='' stap='adres' klein={false} onStap={() => {}} onSluit={() => setAanbieder(null)} huidigeDienst='mail' /> : null}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
