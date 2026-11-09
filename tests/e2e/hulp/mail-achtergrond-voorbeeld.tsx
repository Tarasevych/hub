// MAILBG-001 · Самостійна перевірка тла без справжнього входу чи підключення пошти.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MailOrbitIntro from '../../../src/mail/MailOrbitIntro';
import MailAchtergrond from '../../../src/mail/MailAchtergrond';
import '../../../src/mail/mail-orbit-intro.css';

function Voorbeeld() {
  const [pagina, zetPagina] = useState<'accounts' | 'aanmelden'>('accounts');
  return <main style={{ minHeight: '100dvh', background: '#e9eef5', color: '#223046', padding: '18px', fontFamily: 'system-ui' }}>
    <nav style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18 }}>
      <button type='button' onClick={() => zetPagina('accounts')}>Поштові облікові записи</button>
      <button type='button' onClick={() => zetPagina('aanmelden')}>Вхід у пошту</button>
    </nav>
    {pagina === 'accounts' ? <MailOrbitIntro lang='uk' onSelect={() => { /* Справжнє підключення вимкнено. */ }} /> :
      <section style={{ position: 'relative', isolation: 'isolate', overflow: 'hidden', borderRadius: 28, background: '#f6f8fc', minHeight: '78dvh', display: 'grid', placeItems: 'center' }}>
        <MailAchtergrond lang='uk' plaats='aanmelden' />
        <div style={{ position: 'relative', zIndex: 1, width: 'min(420px,88%)', textAlign: 'center' }}>
          <h1>Увійдіть у Мій простір</h1>
          <p>Єдиний обліковий запис для вашої роботи, файлів і сервісів.</p>
          <button type='button'>Увійти через Google</button>
        </div>
      </section>}
  </main>;
}

createRoot(document.getElementById('voorbeeld')!).render(<Voorbeeld />);
