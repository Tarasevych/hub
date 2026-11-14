// «Підключити iCloud» (21.10.2026, recht «Події з iCloud» van connector v2): een eigen venster in de agenda, zoals MailKoppelVenster
// voor de post. Apple kent voor derden geen OAuth: de koppeling gaat met uw Apple ID en een APP-WACHTWOORD (appleid.apple.com →
// «Вхід і безпека» → «Паролі застосунків»), nooit met uw hoofdwachtwoord. De server meldt zich ECHT aan bij caldav.icloud.com en zoekt
// uw agenda's (PROPFIND) voordat er iets bewaard wordt (backend/agenda-caldav.ts); het wachtwoord staat daarna alleen versleuteld op de
// server (sleutelkluis als die aan staat). Een AI ziet de afspraken pas als u het recht «Події з iCloud» aan die AI geeft.
// Het wachtwoord staat alleen in de staat van dit venster en verdwijnt bij sluiten (ook als het koppelen mislukte).
import { useEffect, useId, useState } from 'react';
import { CalendarCheck, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Venster } from '../platform/vensters';
import * as client from './agenda-client';
import GeheimInvoer from '../geheim/GeheimInvoer';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const ICLOUD_CALDAV = 'https://caldav.icloud.com/';
const knop = (hoofd: boolean): React.CSSProperties => ({
  minHeight: 40, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
  border: hoofd ? 'none' : '1px solid var(--line,#d7dee8)',
  background: hoofd ? 'var(--accent,#2f6f73)' : 'transparent', color: hoofd ? 'var(--text-on-accent,#fff)' : 'inherit',
});
const veld: React.CSSProperties = { width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line,#d7dee8)', background: 'var(--panel,#fff)', color: 'inherit' };

export default function ICloudVenster({ lang, onSluit, onKlaar, foutTekst }: { lang: Lang; onSluit: () => void; onKlaar: () => void; foutTekst: (code: string, lang: Lang) => string }) {
  const [appleId, setAppleId] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [klaar, setKlaar] = useState<{ agendas: number } | null>(null);
  const idVeld = useId(), wwVeld = useId();
  // Bij sluiten of na het koppelen: het wachtwoord weg uit het geheugen van deze pagina.
  useEffect(() => () => setWachtwoord(''), []);
  const koppel = async () => {
    setBezig(true); setFout('');
    try {
      const uit = await client.caldavKoppelen(ICLOUD_CALDAV, appleId.trim(), wachtwoord.replace(/\s+/g, ''), 'iCloud');
      setWachtwoord('');
      if (!uit.ok) { setFout(uit.fout || 'CALDAV_OPSLAAN_MISLUKT'); return; }
      setKlaar({ agendas: uit.account?.agendas.length ?? 0 });
      void client.caldavVernieuwen(uit.account?.id || '').catch(() => undefined).then(onKlaar);
    } catch (e) { setWachtwoord(''); setFout(String((e as Error)?.message || 'CALDAV_OPSLAAN_MISLUKT')); }
    finally { setBezig(false); }
  };
  return (
    <div className='agenda-icloud-anker' style={{ display: 'contents' }} data-mq-laag-open='1'>
      <Venster id='agenda-icloud' titel={tr(lang, 'Підключити календар iCloud', 'iCloud-agenda koppelen')} breedte={520} modaal={false} onSluit={() => { setWachtwoord(''); onSluit(); }} lang={lang}>
        <div style={{ padding: 16, display: 'grid', gap: 12 }} data-agenda-icloud='1' data-mq-laag-open='1'>
          {klaar ? (
            <div role='status' data-agenda-icloud-klaar={klaar.agendas} style={{ display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><CalendarCheck size={18} aria-hidden='true' /><b>{tr(lang, `iCloud підключено: календарів знайдено — ${klaar.agendas}.`, `iCloud gekoppeld: ${klaar.agendas} agenda’s gevonden.`)}</b></p>
              <p style={{ margin: 0 }}>{tr(lang, 'Події з’являться тут після першого оновлення. Щоб ШІ міг їх читати, увімкніть для нього дозвіл «Події з iCloud» (Підключення ШІ → потрібний ШІ → Дозволи). Змінювати події в iCloud ні сайт, ні ШІ не можуть.',
                'De afspraken verschijnen hier na de eerste verversing. Wil een AI ze lezen, geef die AI dan het recht «Afspraken uit iCloud» (AI-verbindingen → die AI → Rechten). Afspraken in iCloud wijzigen kunnen de site en de AI niet.')}</p>
              <button type='button' style={knop(true)} onClick={onSluit}>{tr(lang, 'Готово', 'Klaar')}</button>
            </div>
          ) : (
            <>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
                <li>{tr(lang, 'Відкрийте appleid.apple.com → «Вхід і безпека» → «Паролі застосунків» і створіть пароль, наприклад «Мій простір».', 'Open appleid.apple.com → «Aanmelden en beveiliging» → «App-specifieke wachtwoorden» en maak er een, bijvoorbeeld «Mijn Ruimte».')}
                  {' '}<a href='https://appleid.apple.com/account/manage' target='_blank' rel='noopener noreferrer'>appleid.apple.com <ExternalLink size={12} aria-hidden='true' /></a></li>
                <li>{tr(lang, 'Введіть нижче свій Apple ID (адресу пошти) і цей пароль застосунку — не основний пароль Apple.', 'Vul hieronder uw Apple ID (e-mailadres) en dat app-wachtwoord in — niet uw hoofdwachtwoord van Apple.')}</li>
                <li>{tr(lang, 'Сайт перевірить вхід на caldav.icloud.com і знайде ваші календарі. Лише читання.', 'De site controleert het aanmelden bij caldav.icloud.com en zoekt uw agenda’s. Alleen lezen.')}</li>
              </ol>
              <label htmlFor={idVeld} style={{ display: 'grid', gap: 4 }}>{tr(lang, 'Apple ID', 'Apple ID')}
                <input id={idVeld} type='email' value={appleId} autoComplete='username' style={veld} data-agenda-icloud-id='1' onChange={(e) => setAppleId(e.target.value)} placeholder='naam@icloud.com' />
              </label>
              <label htmlFor={wwVeld} style={{ display: 'grid', gap: 4 }}>{tr(lang, 'Пароль застосунку', 'App-wachtwoord')}
                <GeheimInvoer lang={lang} id={wwVeld} value={wachtwoord} onChange={setWachtwoord} autoComplete='off' style={veld} placeholder='xxxx-xxxx-xxxx-xxxx' max={64} soort='icloud' data={{ 'agenda-icloud-wachtwoord': '1' }} />
              </label>
              <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '.9rem' }}><ShieldCheck size={16} aria-hidden='true' />{tr(lang, 'Пароль зберігається лише зашифрованим. Відкликати його можна будь-коли на appleid.apple.com.', 'Het wachtwoord wordt alleen versleuteld bewaard. U kunt het altijd intrekken op appleid.apple.com.')}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type='button' style={knop(true)} data-agenda-icloud-koppelen='1' disabled={bezig || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(appleId.trim()) || wachtwoord.replace(/\s+/g, '').length < 8} onClick={() => void koppel()}>
                  {bezig ? <Loader2 size={16} aria-hidden='true' /> : null}{tr(lang, 'Підключити iCloud', 'iCloud koppelen')}
                </button>
                <button type='button' style={knop(false)} onClick={() => { setWachtwoord(''); onSluit(); }}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
              </div>
            </>
          )}
          {fout ? <p role='alert' data-agenda-icloud-fout={fout} style={{ margin: 0, color: 'var(--fout,#b42318)' }}>{foutTekst(fout, lang)}</p> : null}
        </div>
      </Venster>
    </div>
  );
}
