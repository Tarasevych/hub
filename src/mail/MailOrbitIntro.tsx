// MAILORBIT-001 · Levend leeg scherm voor e-mail, zonder nieuwe OAuth- of IMAP-paden.
// Alle namen, logo's en echte koppelwijzen komen uitsluitend uit het bestaande register.
// Een niet-beschikbare dienst wordt nooit als koppelknop getekend.
import { useId, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleHelp, LockKeyhole, MousePointer2, ShieldCheck, Sparkles } from 'lucide-react';
import Logo from '../merk/MerkLogo';
import { MAIL_AANBIEDERS, mailAanbiederHeeftKnop, type MailAanbieder } from '../../shared/mail-aanbieders';
import './mail-orbit-intro.css';

type Taal = 'uk' | 'nl';
type Eigenschappen = {
  lang: Taal;
  onSelect: (aanbieder: MailAanbieder) => void;
  variant?: 'accounts' | 'inbox';
  onManage?: () => void;
};

const KOPPELBAAR = MAIL_AANBIEDERS.filter(mailAanbiederHeeftKnop);
const NIET_KOPPELBAAR = MAIL_AANBIEDERS.filter((a) => !mailAanbiederHeeftKnop(a));

export default function MailOrbitIntro({ lang, onSelect, variant = 'accounts', onManage }: Eigenschappen) {
  const t = (uk: string, nl: string) => lang === 'uk' ? uk : nl;
  const [hover, setHover] = useState<string | null>(null);
  const [catalogus, setCatalogus] = useState(false);
  const catalogusId = useId();
  const actief = KOPPELBAAR.find((a) => a.id === hover) || null;
  const oauth = actief?.wijze === 'oauth-google' || actief?.wijze === 'oauth-microsoft';
  const hoofdDienst = actief || KOPPELBAAR[0]!;

  return (
    <section className={'mail-orbit-intro' + (variant === 'inbox' ? ' is-inbox' : '')} data-mail-orbit-intro={variant} aria-label={t('Вибір поштового сервісу', 'Een e-maildienst kiezen')}>
      <div className='mail-orbit-kop'>
        <span className='mail-orbit-kicker'><Sparkles aria-hidden='true' size={15} /> {t('Пошта · Нове підключення', 'E-mail · Nieuwe koppeling')}</span>
        <h2>{variant === 'inbox' ? t('Ваша пошта починається тут.', 'Uw e-mail begint hier.') : t('Уся пошта. Один простір.', 'Al uw e-mail. Eén ruimte.')}</h2>
        <p>{variant === 'inbox'
          ? t('Підключіть скриньку та керуйте всією поштою в одному просторі.', 'Koppel uw mailbox en beheer al uw e-mail op één plek.')
          : t('Підключіть першу скриньку. Листи різних сервісів і керування акаунтами будуть в одному місці.', 'Koppel uw eerste mailbox. E-mail van meerdere diensten en accountbeheer komen samen op één plek.')}</p>
        {variant === 'inbox' && KOPPELBAAR[0] ? (
          <button type='button' className='mail-orbit-desktop-hoofdknop' onClick={() => onSelect(KOPPELBAAR[0])}
            aria-label={t('Підключити ', 'Koppelen: ') + KOPPELBAAR[0].naam}>
            <Logo id={KOPPELBAAR[0].id} naam={KOPPELBAAR[0].naam} logo={KOPPELBAAR[0].merk} maat={24} />
            <span>{t('Підключити Gmail', 'Gmail koppelen')}</span>
            <ArrowRight size={19} aria-hidden='true' />
          </button>
        ) : null}
      </div>

      <div className='mail-orbit-stage' data-mail-orbit-active={actief ? 'ja' : 'nee'}
        onMouseLeave={() => setHover(null)}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null); }}>
        <div className='mail-orbit-baan' aria-hidden='true'><span /><span /></div>
        <div className='mail-orbit-lichtpunten' aria-hidden='true'><i /><i /><i /><i /><i /><i /></div>
        <div className='mail-orbit-kern' aria-hidden='true'>
          <span className='mail-orbit-kern-brief'><Logo id={hoofdDienst.id} naam={hoofdDienst.naam} logo={hoofdDienst.merk} maat={61} /></span>
          <span className='mail-orbit-kern-schaduw' />
        </div>

        <ul className='mail-orbit-diensten' aria-label={t('Сервіси для підключення', 'Diensten om te koppelen')}>
          {KOPPELBAAR.map((a) => (
            <li key={a.id} className='mail-orbit-positie' data-mail-orbit-provider={a.id}
              data-mail-orbit-gekozen={actief?.id === a.id ? 'ja' : 'nee'}>
              <button type='button' className='mail-orbit-dienst' data-mail-orbit-knop={a.id}
                onMouseEnter={() => setHover(a.id)} onFocus={() => setHover(a.id)}
                onClick={() => onSelect(a)}
                aria-label={t('Підключити ', 'Koppelen: ') + a.naam}
                aria-describedby={catalogusId + '-hint'}>
                <span className='mail-orbit-envelop' aria-hidden='true'>
                  <span className='mail-orbit-envelop-vouw' />
                  <span className='mail-orbit-merk'><Logo id={a.id} naam={a.naam} logo={a.merk} maat={42} /></span>
                </span>
                <span className='mail-orbit-dienst-naam'>{a.naam}</span>
              </button>
            </li>
          ))}
        </ul>

        {actief ? (
          <div className='mail-orbit-informatie' data-mail-orbit-voorbeeld={actief.id}>
            <div className='mail-orbit-informatie-kop'>
              <Logo id={actief.id} naam={actief.naam} logo={actief.merk} maat={30} />
              <span><strong>{actief.naam}</strong><small>{t(actief.onder[0], actief.onder[1])}</small></span>
            </div>
            <p>{oauth
              ? t('Увійдіть на стороні постачальника. Пароль тут не вводиться.', 'Meld u aan bij uw aanbieder. U vult hier geen wachtwoord in.')
              : t('Підключення через IMAP/SMTP з перевіркою пароля застосунку.', 'Koppelen via IMAP/SMTP met controle van het app-wachtwoord.')}</p>
            <button type='button' className='mail-orbit-cta' onClick={() => onSelect(actief)}>
              {t('Підключити ', 'Koppelen: ') + actief.naam}<ArrowRight size={16} aria-hidden='true' />
            </button>
          </div>
        ) : null}
      </div>

      <p className='mail-orbit-mobiel-aanwijzing'><MousePointer2 size={14} aria-hidden='true' /> {t('Торкніться конверта, щоб підключити пошту', 'Tik op een envelop om e-mail te koppelen')}</p>
      {!actief && hoofdDienst ? <button type='button' className='mail-orbit-mobiel-hoofdknop' onClick={() => onSelect(hoofdDienst)}
        aria-label={t('Підключити ', 'Koppelen: ') + hoofdDienst.naam}>
        {t('Підключити ', 'Koppelen: ') + hoofdDienst.naam} <ArrowRight size={19} aria-hidden='true' />
      </button> : null}
      <div className='mail-orbit-mobiel-snel' aria-label={t('Популярні поштові сервіси', 'Populaire e-maildiensten')}>
        <h3>{t('Оберіть поштовий сервіс', 'Kies een e-maildienst')}</h3>
        <div className='mail-orbit-mobiel-snel-raster'>
          {KOPPELBAAR.slice(0, 4).map((a) => (
            <button key={a.id} type='button' className='mail-orbit-mobiel-snel-item' onClick={() => onSelect(a)} aria-label={t('Підключити ', 'Koppelen: ') + a.naam}>
              <Logo id={a.id} naam={a.naam} logo={a.merk} maat={28} />
              <span>{a.naam}</span>
              <ChevronRight size={16} aria-hidden='true' />
            </button>
          ))}
        </div>
      </div>
      <div className='mail-orbit-onder'>
        <p id={catalogusId + '-hint'}><MousePointer2 size={16} aria-hidden='true' /> {t('Наведіть курсор або натисніть на конверт', 'Beweeg uw aanwijzer naar een envelop of tik erop')}</p>
        <div className='mail-orbit-knoppen'>
          <button type='button' className='mail-orbit-catalogus-knop' aria-expanded={catalogus} aria-controls={catalogusId} onClick={() => setCatalogus((v) => !v)}>
            {catalogus ? t('Згорнути каталог', 'Catalogus sluiten') : t('Увесь каталог', 'Volledige catalogus')} <ChevronRight size={17} aria-hidden='true' />
          </button>
          {onManage ? <button type='button' className='mail-orbit-beheer-knop' onClick={onManage}>{t('Керування акаунтами', 'Accounts beheren')} <ArrowRight size={15} aria-hidden='true' /></button> : null}
        </div>
      </div>

      <div id={catalogusId} className='mail-orbit-catalogus' hidden={!catalogus}>
        <h3>{t('Доступні підключення', 'Beschikbare koppelingen')}</h3>
        <div className='mail-orbit-catalogus-raster'>
          {KOPPELBAAR.map((a) => (
            <button key={a.id} type='button' className='mail-orbit-catalogus-item' data-mail-catalogus-knop={a.id} onClick={() => onSelect(a)}>
              <Logo id={a.id} naam={a.naam} logo={a.merk} maat={32} />
              <span><strong>{a.naam}</strong><small>{t(a.onder[0], a.onder[1])}</small></span>
              <ChevronRight size={16} aria-hidden='true' />
            </button>
          ))}
        </div>
        {NIET_KOPPELBAAR.length ? (
          <>
            <h3 className='mail-orbit-nog-niet-kop'><CircleHelp size={16} aria-hidden='true' /> {t('Ще недоступні', 'Nog niet beschikbaar')}</h3>
            <div className='mail-orbit-onbeschikbaar'>
              {NIET_KOPPELBAAR.map((a) => (
                <details key={a.id} data-mail-orbit-onbeschikbaar={a.id}>
                  <summary><Logo id={a.id} naam={a.naam} logo={a.merk} maat={28} /><span>{a.naam}</span><span className='mail-orbit-status'>{t('Поки не підключається', 'Nog niet te koppelen')}</span><ChevronRight size={16} aria-hidden='true' /></summary>
                  <ul>{(a.ontbreekt || []).map((u, i) => <li key={i}>{t(u[0], u[1])}</li>)}</ul>
                </details>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className='mail-orbit-vertrouwen'>
        <span><ShieldCheck size={16} aria-hidden='true' /> {t('Підключення пошти не змінює ваш вхід до Mijn Ruimte.', 'Een mailkoppeling verandert uw aanmelding bij Mijn Ruimte niet.')}</span>
        <span><LockKeyhole size={16} aria-hidden='true' /> {t('Google/Microsoft — офіційний OAuth; IMAP — зашифрований пароль застосунку.', 'Google/Microsoft — officiële OAuth; IMAP — versleuteld app-wachtwoord.')}</span>
      </div>
      <p className='mail-orbit-beperking'><Check size={14} aria-hidden='true' /> {t('Для IMAP зараз перевіряються вхід і надсилання; завантаження листів ще не ввімкнене.', 'Voor IMAP worden aanmelden en verzenden nu gecontroleerd; het ophalen van berichten is nog niet actief.')}</p>
    </section>
  );
}
