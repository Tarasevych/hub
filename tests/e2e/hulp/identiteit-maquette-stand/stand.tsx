// IDENTITEIT-011: стенд вигляду «Макет» без сервера. Справжній двигун і справжній IdentiteitMaquette; у гнізда «Чинні налаштування»
// монтуються прості панелі з тими самими якорями, що й справжні (menu-snel, thema-auto-kop, aanmeldmethoden-*, settings-*).
// Proefstand van de weergave «Ontwerp»: echte motor en component, eenvoudige panelen met dezelfde ankers als de echte.
import React, { useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IdentiteitMaquette } from '../../../../src/identiteit/maquette/IdentiteitMaquette';
import { AtelierInhoud } from '../../../../src/identiteit/atelier-inhoud';

const ids = ['personalization', 'menu', 'themes', 'languages', 'widgets', 'sharing', 'identity', 'account', 'sessions', 'methods', 'security', 'recovery'];
const lang = (new URLSearchParams(location.search).get('lang') === 'nl' ? 'nl' : 'uk') as 'uk' | 'nl';

/** Показує, чи панель бачить межі розділу (як AccessPlaneView), і рахує монтування для перевірки «лише після відкриття». */
function Grens({ id }: { id: string }) {
  const binnen = useContext(AtelierInhoud);
  const [n] = useState(() => { const w = window as unknown as { mqMontages?: Record<string, number> }; w.mqMontages ||= {}; w.mqMontages[id] = (w.mqMontages[id] || 0) + 1; return w.mqMontages[id]; });
  return <span hidden data-grens={id} data-atelier={String(binnen)} data-montage={n} />;
}
const Blok = ({ id, kop }: { id: string; kop: string }) => <details id={id}><summary>{kop}</summary><p>{kop} — вміст</p></details>;

function inhoudVan(id: string) {
  switch (id) {
    case 'menu': return <><Blok id='menu-snel' kop='Швидкий доступ' /><Blok id='menu-meldingen' kop='Сповіщення' /><Blok id='menu-snelheid' kop='Швидкодія' /><Blok id='menu-zichtbaarheid' kop='Видимість' /></>;
    case 'themes': return <><h3 id='thema-modus-kop'>Режим</h3><h3 id='thema-auto-kop'>Автоматично</h3><h3 id='thema-kleur-kop'>Палітра</h3></>;
    case 'widgets': return <form className='settings-form' onSubmit={(e) => e.preventDefault()}><input aria-label='Назва' /></form>;
    case 'sharing': return <div className='settings-sharing'><input type='email' aria-label='Адреса' data-proef-invoer /></div>;
    case 'account': return <div className='settings-danger'>Видалення</div>;
    case 'methods': return <><section id='aanmeldmethoden-google'>Вхід</section><div data-access-method='password'>Пароль</div></>;
    case 'security': return <><section id='aanmeldmethoden-sleutels'>Ключі</section><section id='aanmeldmethoden-2fa'>2FA</section><section id='aanmeldmethoden-sleutelkluis'>Сховище</section><section id='toegangscodes'>Коди</section></>;
    case 'recovery': return <section id='aanmeldmethoden-herstel'>Коди відновлення</section>;
    default: return <p>{id}</p>;
  }
}

function Proef() {
  const [actief, setActief] = useState('personalization');
  const secties = ids.map((id) => ({ id, titel: id, inhoud: <div className='settings-center ia-inline' data-proef={id}><Grens id={id} />{inhoudVan(id)}</div> }));
  return <div className='canonical-workspace' style={{ height: '100vh', overflow: 'auto' }}>
    <IdentiteitMaquette lang={lang} actief={actief} secties={secties} onKies={setActief} gebruiker={{ naam: 'Проба', foto: '' }} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<Proef />);
