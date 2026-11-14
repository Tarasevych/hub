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
    // IDENTITEIT-014: перемикач нагадування про резервний доступ і блок «Типи сповіщень» — як у ZijbalkInstellingen.
    case 'menu': return <><Blok id='menu-snel' kop='Швидкий доступ' /><details id='menu-meldingen'><summary>Сповіщення</summary><label data-meld-schakel='reserve'><input type='checkbox' role='switch' defaultChecked />Нагадувати про резервний доступ</label></details><Blok id='menu-meldingtypen' kop='Типи сповіщень' /><Blok id='menu-snelheid' kop='Швидкодія' /><Blok id='menu-zichtbaarheid' kop='Видимість' /></>;
    case 'themes': return <><h3 id='thema-modus-kop'>Режим</h3><h3 id='thema-auto-kop'>Автоматично</h3><h3 id='thema-kleur-kop'>Палітра</h3></>;
    case 'widgets': return <form className='settings-form' onSubmit={(e) => e.preventDefault()}><input aria-label='Назва' /></form>;
    case 'sharing': return <div className='settings-sharing'><section id='delen-uitnodigen'><input type='email' aria-label='Адреса' data-proef-invoer /></section><section id='delen-leden'>Хто має доступ</section></div>;
    case 'account': return <><section id='gegevensuitvoer'>Вивантаження</section><div className='settings-danger'>Видалення</div></>;
    case 'methods': return <><section id='aanmeldmethoden-google'>Вхід</section><div id='aanmeldmethoden-wachtwoord' data-access-method='password'>Пароль</div><section id='aanmeldmethoden-catalogus'>Інші способи</section></>;
    case 'security': return <><section id='aanmeldmethoden-sleutels'>Ключі</section><section id='aanmeldmethoden-2fa'>2FA</section><section id='aanmeldmethoden-sleutelkluis'>Сховище</section><section id='toegangscodes'>Коди</section></>;
    // IDENTITEIT-014: справжній розділ має ще огляд резерву, сценарії й наслідки втрати ключа (на них веде жива карта).
    case 'recovery': return <><section id='herstel-overzicht'>Огляд резерву</section><section id='aanmeldmethoden-herstel'>Коди відновлення</section><section id='herstel-scenarios'>Що робити, якщо…<details data-scenario='apparaat'><summary>Пристрій</summary></details><details data-scenario='codes-op'><summary>Коди закінчилися</summary></details></section><section id='herstel-sleutelverlies'>Наслідки втрати ключа</section></>;
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
