// Справжні компоненти з вигаданими даними: запитів до особистого облікового запису немає.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search } from 'lucide-react';
import AgendaLeeg from '../../src/agenda/v3/onderdelen/LegeToestand';
import MailOrbitIntro from '../../src/mail/MailOrbitIntro';
import CloudOverzicht from '../../src/cloud-vnext/onderdelen/Overzicht';
import NotitieKaart from '../../src/notities/NotitieKaart';
import ZoekKaart from '../../src/zoek/ZoekKaart';
import SettingsCenterView from '../../src/InstellingencentrumWeergave';
import type { Notitie } from '../../shared/notities-vnext-model';
import type { ZoekTreffer } from '../../shared/zoek-model';
import '../../src/index.css';
import '../../src/ontwerp/fundament.css';
import '../../src/agenda/v3/agenda-v3.css';
import '../../src/cloud-vnext/cloud-vnext.css';
import '../../src/notities/notities-vnext.css';
import '../../src/zoek/zoek.css';
import '../../src/instellingencentrum.css';

const query = new URLSearchParams(location.search);
const thema = query.get('thema') || 'light';
const lang = query.get('lang') === 'nl' ? 'nl' : 'uk';
document.documentElement.className = 'theme-' + thema;
const notitie: Notitie = {
  id: 'voorbeeld', titel: 'Нотатка для перевірки довгих назв у невеликому просторі',
  inhoud: 'Зберігайте важливі думки й повертайтеся до них тоді, коли зручно.',
  soort: 'tekst', kleur: 'blauw', etiketten: ['ідеї', 'плани'], mapId: null, vast: false,
  gearchiveerdOp: null, verwijderdOp: null, auteur: 'voorbeeld', herkomst: {}, versie: 1,
  aangemaaktOp: '2026-11-05T10:00:00Z', gewijzigdOp: '2026-11-05T10:00:00Z',
};
const treffer = {
  id: 'voorbeeld', bron: 'cloud', soort: 'bestand', titel: 'Важливий документ із довгою назвою',
  titels: { uk: 'Важливий документ із довгою назвою', nl: 'Een document met een lange naam' },
  omschrijving: 'Приклад результату пошуку в особистому просторі.', pad: 'Мої файли',
  route: null, taal: '', formaat: 'pdf', bijgewerktOp: 0, extra: {}, integratie: '',
  score: 1, percent: 92, uitleg: [], fragment: { bron: '', tekst: '', posities: [] },
} as unknown as ZoekTreffer;
const niets = () => {};
const asyncNiets = async () => {};

function Voorbeeld() {
  const [actie, setActie] = useState('');
  const deel = query.get('deel') || 'agenda';
  let inhoud;
  if (deel === 'agenda') {
    inhoud = <div className='agv'><AgendaLeeg lang={lang} onKoppel={() => setActie('agenda')} onIcs={() => setActie('ics')} onAlle={() => setActie('diensten')} /></div>;
  } else if (deel === 'mail-accounts' || deel === 'mail-inbox') {
    inhoud = <MailOrbitIntro lang={lang} variant={deel === 'mail-inbox' ? 'inbox' : 'accounts'} onSelect={(aanbieder) => setActie(aanbieder.id)} onManage={() => setActie('beheer')} />;
  } else if (deel === 'cloud') {
    inhoud = <div className='cvn'><CloudOverzicht lang={lang} smal={false} userEmail='' sourceOrigin='' tabContext=''
      ov={{ stats: { aantal: 0, bytes: 0, perSoort: {} }, recent: [], favorieten: [], prullenbak: 0, mappen: [], workspaces: [] } as never}
      vernieuw={asyncNiets} toon={niets} naarTab={(tab) => setActie(tab)} /></div>;
  } else if (deel === 'notities') {
    inhoud = <div className='vn'><h1>Нотатки</h1><NotitieKaart lang={lang} notitie={notitie} indeling='kaarten' mappen={[]} bezig={false} weergave='alle'
      onOpen={() => setActie('notitie')} onActie={niets} onVink={niets} onEtiket={niets} /></div>;
  } else if (deel === 'zoek') {
    inhoud = <div className='zk-pagina'><section className='zk-kop kaart'><div className='zk-kop-tekst'><span className='zk-kop-ic' aria-hidden='true'><Search /></span><div><h1 className='zk-h'>Пошук у вашому просторі</h1><p className='zk-sub'>Знаходьте файли й нотатки в одному місці.</p></div></div></section><div style={{ marginTop: 16 }}><ZoekKaart r={treffer} lang={lang} terms={[]} /></div></div>;
  } else {
    inhoud = <SettingsCenterView tab='personalization' embedded lang={lang} theme='light' plumEnabled={true}
      user={{ id: 'voorbeeld', email: 'voorbeeld@example.invalid', name: 'Користувач', picture: '', role: 'owner', status: 'active', accessLevel: 'full' }}
      activeWorkspaces={[]} archivedWorkspaces={[]} menuPreferences={[]} securitySessions={[]} securityLoading={false} busy={false}
      onNavigate={(tab) => setActie(tab)} onSaveMenuPreferences={asyncNiets} onLanguage={niets} onTheme={niets}
      onAddWidget={asyncNiets} onShareEmail={asyncNiets} onCreateShareLink={async () => ''} onDeleteSelf={niets}
      onRestoreWorkspace={niets} onRefreshSessions={niets} onRevokeSession={niets} onRevokeAll={niets} />;
  }
  return <main className={'canonical-chrome theme-' + thema} style={{ position: 'relative', minHeight: '100vh', padding: 16 }}>
    <div className='canonical-content'>{inhoud}<p data-test-actie='' aria-live='polite'>{actie}</p></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Voorbeeld />);
