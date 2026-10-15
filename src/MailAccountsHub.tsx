import { Mail, Zap, Settings2, MoreHorizontal } from 'lucide-react';

type Lang = 'uk' | 'nl';
type Props = {
  lang: Lang;
  userName?: string;
  accounts?: Array<{ id: string; email: string; provider: string; status: string; lastSync?: string }>;
  onConnect?: (provider: string) => void;
};

const providers = [
  { id: 'gmail', name: 'Gmail', sub: 'Google Workspace', color: '#ea4335' },
  { id: 'outlook', name: 'Outlook', sub: 'Microsoft 365', color: '#0078d4' },
  { id: 'icloud', name: 'iCloud Mail', sub: 'Apple', color: '#007aff' },
  { id: 'ukrnet', name: 'Ukr.net', sub: 'Українська пошта', color: '#ff6b00' },
  { id: 'yahoo', name: 'Yahoo! Mail', sub: 'Yahoo', color: '#6001d2' },
  { id: 'onlineua', name: 'Online.ua', sub: 'Українська пошта', color: '#00a3e0' },
  { id: 'iua', name: 'I.ua', sub: 'Українська пошта', color: '#1a73e8' },
  { id: 'proton', name: 'Protonmail', sub: 'Безпека та приватність', color: '#6d4aff' },
];

export default function MailAccountsHub({ lang, userName = 'Власник', accounts = [], onConnect }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);

  return (
    <div className="mail-accounts-hub" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: '#64748b', fontSize: 14 }}>{t('Вітаємо, ', 'Welkom, ')}{userName}! 👋</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '4px 0 8px' }}>{t('Підключіть свої поштові акаунти', 'Koppel uw e-mailaccounts')}</h1>
          <p style={{ color: '#64748b', margin: 0 }}>{t('Об’єднайте всі свої поштові скриньки в одному місці. Керуйте, налаштовуйте та працюйте з усіма листами, не перемикаючись між сервісами.', 'Bundel al uw mailboxen op één plek. Beheer, configureer en werk met alle berichten zonder van dienst te wisselen.')}</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mail size={20} /></div>
              <div>
                <div style={{ fontWeight: 600 }}>{t('Додати новий акаунт', 'Nieuw account toevoegen')}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{t('Оберіть сервіс, з якого хочете підключити пошту', 'Kies de dienst waarvan u e-mail wilt koppelen')}</div>
              </div>
            </div>
            <button type="button" style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>{t('Порівняння методів підключення', 'Vergelijking van koppelmethoden')} →</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {providers.map(p => (
              <button key={p.id} type="button" onClick={() => onConnect?.(p.id)} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: p.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: p.color, fontWeight: 700 }}>{p.name[0]}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{p.sub}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>
            <span><Zap size={14} style={{ verticalAlign: 'middle' }} /> {t('1 клік — найпростіший спосіб', '1 klik — eenvoudigste manier')}</span>
            <span><Settings2 size={14} style={{ verticalAlign: 'middle' }} /> {t('Ручне налаштування IMAP/SMTP', 'Handmatige IMAP/SMTP-instelling')}</span>
            <span><MoreHorizontal size={14} style={{ verticalAlign: 'middle' }} /> {t('Інші методи', 'Andere methoden')}</span>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 600 }}>{t('Підключені акаунти', 'Gekoppelde accounts')} <span style={{ background: '#f1f5f9', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>{accounts.length}</span></div>
            <select style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
              <option>{t('Сортувати: За алфавітом', 'Sorteren: Alfabetisch')}</option>
            </select>
          </div>
          {accounts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>{t('Ще немає підключених акаунтів', 'Nog geen gekoppelde accounts')}</div>
          ) : accounts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{a.provider[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{a.email}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a.provider}</div>
              </div>
              <span style={{ fontSize: 12, color: '#16a34a' }}>● {t('Активний', 'Actief')}</span>
              <div style={{ width: 36, height: 20, borderRadius: 999, background: '#22c55e', position: 'relative' }}><div style={{ width: 16, height: 16, borderRadius: 999, background: '#fff', position: 'absolute', right: 2, top: 2 }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #e0f2fe, #f0f9ff)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{t('Усі ваші листи в одному місці', 'Al uw berichten op één plek')}</div>
          <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>{t('Підключайте, керуйте, зберігайте час. Tarasevych Mail — це зручно, безпечно і сучасно.', 'Koppel, beheer, bespaar tijd. Tarasevych Mail is handig, veilig en modern.')}</p>
          <button type="button" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{t('Дізнатися більше', 'Meer informatie')} →</button>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>💡 {t('Поради', 'Tips')}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            <li>{t('Використовуйте OAuth для безпечного підключення Google та Microsoft.', 'Gebruik OAuth voor veilige koppeling van Google en Microsoft.')}</li>
            <li>{t('Для старих акаунтів можна використати App Password.', 'Voor oude accounts kunt u een App Password gebruiken.')}</li>
            <li>{t('Щоб налаштувати пошту вручну, перейдіть у розділ «Інші методи».', 'Voor handmatige instelling gaat u naar «Andere methoden».')}</li>
          </ul>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>✓ {t('Переваги', 'Voordelen')}</div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
            <li>✓ {t('Підтримка всіх популярних поштових сервісів', 'Ondersteuning van alle populaire e-maildiensten')}</li>
            <li>✓ {t('Безпечне зберігання даних', 'Veilige opslag van gegevens')}</li>
            <li>✓ {t('Швидка синхронізація', 'Snelle synchronisatie')}</li>
            <li>✓ {t('Зручне керування акаунтами', 'Handig accountbeheer')}</li>
            <li>✓ {t('Сучасний та простий інтерфейс', 'Moderne en eenvoudige interface')}</li>
          </ul>
        </div>

        <div style={{ background: '#f0fdf4', borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>🛡️ {t('Ваші дані під захистом', 'Uw gegevens zijn beschermd')}</div>
          <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>{t('Ми використовуємо сучасні методи шифрування та безпеки для захисту ваших акаунтів.', 'We gebruiken moderne versleutelings- en beveiligingsmethoden om uw accounts te beschermen.')}</p>
        </div>
      </div>
    </div>
  );
}
