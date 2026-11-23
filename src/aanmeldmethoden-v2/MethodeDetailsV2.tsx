// Віха M2 (UI-015A): бічна панель (на широких екранах) або повноекранний аркуш (на вузьких екранах) подробиць способу входу.
// Використовує спільний шар Laag (пастка фокуса, Escape, без нових правил position: fixed) і підключає 1:1 усі чинні
// секції безпеки (PasskeysSection, HerstelcodesSectie, SleutelkluisSectie, Toegangscodes, BevestigDialoog, verborgenVoorAi).
import { Check, ExternalLink, Plus, Trash2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import Laag from '../aanmeld-vnext/Laag';
import GeheimInvoer from '../geheim/GeheimInvoer';
import { HerstelcodesSectie } from '../HerstelcodesSectie';
import { verborgenVoorAi } from '../menselijke-actie';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { api } from '../platform/client';
import { SleutelkluisSectie } from '../SleutelkluisSectie';
import { Toegangscodes } from '../Toegangscodes';
import type { AccessPlanePanels } from '../toegangslaag-panelen';
import { PasskeysSection } from '../ToegangssleutelsSectie';
import { staatLabel, tekstVan, type MethodeKaart, type Taal } from './aanmeldmethoden-model';

type PaneelProps = ComponentProps<typeof AccessPlanePanels>;

export type DetailsV2Props = PaneelProps & {
  lang: Taal;
  lockout: boolean;
  mustChange: boolean;
  totpEnrolled: boolean;
  smal: boolean;
};

function Feiten({ rijen }: { rijen: Array<[string, string]> }) {
  return (
    <dl className='amv2-feiten'>
      {rijen
        .filter((r) => r[1])
        .map(([a, b]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{b}</dd>
          </div>
        ))}
    </dl>
  );
}

function WachtwoordDetailsV2({ p }: { p: DetailsV2Props }) {
  const tr = (uk: string, nl: string) => (p.lang === 'nl' ? nl : uk);
  const [wachtwoordWeg, setWachtwoordWeg] = useState(false);

  return (
    <>
      {p.mustChange ? <p className='amv2-let'>{tr('Тимчасовий пароль — потрібно змінити', 'Tijdelijk wachtwoord — wijzigen vereist')}</p> : null}
      <div className='amv2-formulier'>
        <GeheimInvoer
          lang={p.lang}
          value={p.password}
          onChange={p.setPassword}
          autoComplete='new-password'
          placeholder={tr('Новий пароль, щонайменше 10 символів', 'Nieuw wachtwoord, min. 10 tekens')}
          minLength={10}
          max={1024}
          soort='wachtwoord'
        />
        <div className='amv2-knoppen'>
          <button
            type='button'
            className='amv2-knop hoofd'
            disabled={p.busy || p.password.length < 10}
            onClick={() => void p.write('/api/owner/access/password/set', { password: p.password })}
          >
            <Check aria-hidden='true' />
            {tr('Зберегти', 'Opslaan')}
          </button>
          <button type='button' className='amv2-knop gevaar' disabled={p.busy || p.lockout} onClick={() => setWachtwoordWeg(true)}>
            <Trash2 aria-hidden='true' />
            {tr('Прибрати пароль', 'Wachtwoord verwijderen')}
          </button>
          <BevestigDialoog
            open={wachtwoordWeg}
            id='wachtwoord-verwijderen-v2'
            lang={p.lang}
            gevaarlijk
            bezig={p.busy}
            titel={tr('Прибрати пароль?', 'Wachtwoord verwijderen?')}
            uitleg={tr(
              'Пароль перестане діяти. Повернути його можна протягом 7 днів у цьому ж розділі.',
              'Het wachtwoord werkt dan niet meer. Terugzetten kan binnen 7 dagen in dit onderdeel.',
            )}
            gevolgen={[tr('Вхід через Google та інші способи не зміняться.', 'Aanmelden via Google en andere methoden verandert niet.')]}
            bevestigTekst={tr('Так, прибрати', 'Ja, verwijderen')}
            onAnnuleer={() => setWachtwoordWeg(false)}
            onBevestig={async () => {
              setWachtwoordWeg(false);
              await p.write('/api/owner/access/password/remove');
            }}
          />
        </div>
        {p.lockout ? (
          <small className='amv2-uitleg'>
            {tr('Прибрати не можна: це ваш єдиний спосіб входу.', 'Verwijderen kan niet: dit is uw laatste aanmeldmethode.')}
          </small>
        ) : null}
      </div>
    </>
  );
}

function TotpDetailsV2({ p }: { p: DetailsV2Props }) {
  const tr = (uk: string, nl: string) => (p.lang === 'nl' ? nl : uk);
  if (p.totpEnrolled) {
    return (
      <>
        <p className='amv2-uitleg'>
          {tr(
            'Коди з вашого застосунку-автентифікатора підтверджують важливі дії. Без SMS.',
            'Codes uit uw authenticator-app bevestigen belangrijke handelingen. Zonder sms.',
          )}
        </p>
        <div className='amv2-knoppen'>
          <button type='button' className='amv2-knop gevaar' disabled={p.busy} onClick={() => void p.totpUitschakelen()}>
            <Trash2 aria-hidden='true' />
            {tr('Вимкнути', 'Uitschakelen')}
          </button>
        </div>
        <small className='amv2-uitleg'>
          {tr('Вимкнення підтверджується чинним кодом або кодом відновлення.', 'Uitschakelen wordt bevestigd met de huidige code of een herstelcode.')}
        </small>
      </>
    );
  }
  if (!p.otpauth) {
    return (
      <>
        <ol className='amv2-stappen'>
          <li>
            {tr(
              'Відкрийте застосунок-автентифікатор (Google Authenticator, Microsoft Authenticator, 1Password).',
              'Open een authenticator-app (Google Authenticator, Microsoft Authenticator, 1Password).',
            )}
          </li>
          <li>{tr('Додайте ключ, який ми покажемо одноразово.', 'Voeg de eenmalig getoonde sleutel toe.')}</li>
          <li>{tr('Введіть 6-значний код підтвердження.', 'Voer de 6-cijferige bevestigingscode in.')}</li>
        </ol>
        <div className='amv2-knoppen'>
          <button type='button' className='amv2-knop hoofd' disabled={p.busy} onClick={() => void p.write('/api/owner/access/totp/start')}>
            <Plus aria-hidden='true' />
            {tr('Налаштувати', 'Instellen')}
          </button>
        </div>
      </>
    );
  }
  return (
    <div className='amv2-formulier access-plane-totp-setup'>
      <strong>{tr('Додайте ключ у застосунок-автентифікатор і введіть код', 'Voeg de sleutel toe in de authenticator-app en voer de code in')}</strong>
      <code className='access-plane-mono access-plane-secret' {...verborgenVoorAi}>
        {p.secret}
      </code>
      <small>{tr('Ключ показано лише один раз.', 'De sleutel wordt eenmalig getoond.')}</small>
      <input
        className='amv2-code'
        inputMode='numeric'
        autoComplete='one-time-code'
        value={p.code}
        onChange={(e) => p.setCode(e.target.value.replace(/\D+/g, ''))}
        placeholder={tr('6-значний код', '6-cijferige code')}
        aria-label={tr('6-значний код', '6-cijferige code')}
        maxLength={6}
      />
      <div className='amv2-knoppen'>
        <button
          type='button'
          className='amv2-knop hoofd'
          disabled={p.busy || p.code.length !== 6}
          onClick={() => void p.write('/api/owner/access/totp/confirm', { code: p.code })}
        >
          <Check aria-hidden='true' />
          {tr('Підтвердити', 'Bevestigen')}
        </button>
      </div>
    </div>
  );
}

function AanbiederDetailsV2({
  k,
  p,
  onClose,
  onStartKoppelen,
}: {
  k: MethodeKaart;
  p: DetailsV2Props;
  onClose: () => void;
  onStartKoppelen: (aanbiederId: string) => Promise<void>;
}) {
  const { lang } = p;
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const aanbiederId = k.id.slice('aanbieder:'.length);
  const naam = k.titel[lang];
  const datum =
    k.gekoppeldOp && !Number.isNaN(Date.parse(k.gekoppeldOp))
      ? new Date(k.gekoppeldOp).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' })
      : '';

  const losmaken = async () => {
    if (bezig) return;
    setBezig(true);
    setFout('');
    try {
      await api.post(k.losmaakUrl || '/api/owner/aanmeld/vnext/ontkoppel', { ...p.context, id: aanbiederId });
      await p.load();
      onClose();
    } catch (e) {
      const code = String((e as { message?: string })?.message || '');
      setFout(
        code.includes('LAST_LOGIN_METHOD_PROTECTED')
          ? tr('Від’єднати не можна: це останній спосіб входу.', 'Loskoppelen kan niet: dit is de laatste aanmeldmethode.')
          : tr('Не вдалося від’єднати цей спосіб входу.', 'Deze aanmeldmethode kon niet worden losgekoppeld.'),
      );
    } finally {
      setBezig(false);
    }
  };

  const koppelen = async () => {
    if (bezig) return;
    setBezig(true);
    setFout('');
    try {
      await onStartKoppelen(aanbiederId);
    } catch {
      setFout(tr('Не вдалося почати підключення. Спробуйте ще раз.', 'Het koppelen kon niet starten. Probeer het opnieuw.'));
    } finally {
      setBezig(false);
    }
  };

  return (
    <>
      <Feiten
        rijen={[
          [tr('Стан', 'Status'), staatLabel(k, lang)],
          [tr('Обліковий запис', 'Account'), k.accountLabel || ''],
          [tr('Підключено', 'Gekoppeld op'), datum],
        ]}
      />
      {k.staat === 'ready' ? (
        <>
          <p className='amv2-uitleg'>
            {tr(
              `Вас буде перенаправлено до ${naam}. Після входу там сервер прив’яже цей обліковий запис до вашого профілю.`,
              `U gaat naar ${naam}. Na het aanmelden daar koppelt de server dit account aan uw profiel.`,
            )}
          </p>
          <div className='amv2-knoppen'>
            <button type='button' className='amv2-knop hoofd' disabled={bezig} onClick={() => void koppelen()}>
              <Plus aria-hidden='true' />
              {tr('Підключити', 'Koppelen')}
            </button>
          </div>
        </>
      ) : null}
      {k.staat === 'not-configured' ? (
        <p className='amv2-uitleg'>
          {tr(
            `Щоб увімкнути ${naam}, власник сервера має додати ключі постачальника й виконати самоперевірку.`,
            `Om ${naam} in te schakelen moet de servereigenaar de sleutels van de aanbieder toevoegen en de zelftest uitvoeren.`,
          )}
        </p>
      ) : null}
      {k.staat === 'unavailable' || k.staat === 'unknown' ? <p className='amv2-uitleg'>{tekstVan(k.reden, lang)}</p> : null}
      {k.staat === 'active' ? (
        k.beschermd ? (
          <p className='amv2-let'>
            {tr(
              'Від’єднати не можна: це ваш єдиний спосіб входу або так вимагають правила захисту.',
              'Loskoppelen kan niet: dit is uw enige aanmeldmethode of de beveiligingsregels staan het niet toe.',
            )}
          </p>
        ) : k.losmaakUrl ? (
          <div className='amv2-knoppen'>
            <button type='button' className='amv2-knop gevaar' disabled={bezig} onClick={() => void losmaken()}>
              <Trash2 aria-hidden='true' />
              {tr('Від’єднати', 'Loskoppelen')}
            </button>
          </div>
        ) : null
      ) : null}
      {fout ? (
        <p className='amv2-melding' role='alert'>
          {fout}
        </p>
      ) : null}
    </>
  );
}

export function MethodeDetailsV2({
  k,
  p,
  onClose,
  onStartKoppelen,
}: {
  k: MethodeKaart;
  p: DetailsV2Props;
  onClose: () => void;
  onStartKoppelen: (aanbiederId: string) => Promise<void>;
}) {
  const { lang } = p;
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const titel = k.titel[lang];

  const inhoud = (() => {
    switch (k.id) {
      case 'google':
        return (
          <>
            <Feiten
              rijen={[
                [tr('Обліковий запис', 'Account'), k.accountLabel || tr('Обліковий запис Google', 'Google-account')],
                [tr('Стан', 'Status'), staatLabel(k, lang)],
              ]}
            />
            {p.lockout ? (
              <p className='amv2-let'>
                {tr(
                  'Це зараз ваш єдиний спосіб входу — захищено від вимкнення, щоб ви не втратили доступ.',
                  'Dit is nu uw enige aanmeldmethode — beschermd tegen uitschakelen zodat u de toegang niet verliest.',
                )}
              </p>
            ) : null}
            <p className='amv2-uitleg'>
              {tr(
                'Адресою електронної пошти та двоетапною перевіркою Google керують у налаштуваннях самого облікового запису Google.',
                'E-mailadres en tweestapsverificatie van Google beheert u in de instellingen van uw Google-account.',
              )}
            </p>
            <div className='amv2-knoppen'>
              <a className='amv2-knop' href='https://myaccount.google.com/security' target='_blank' rel='noopener noreferrer'>
                <ExternalLink aria-hidden='true' />
                {tr('Безпека в Google', 'Beveiliging bij Google')}
              </a>
            </div>
          </>
        );
      case 'password':
        return <WachtwoordDetailsV2 p={p} />;
      case 'passkey':
        return <PasskeysSection lang={lang} context={p.context} onChange={() => void p.load()} />;
      case 'totp':
        return <TotpDetailsV2 p={p} />;
      case 'recovery':
        return (
          <HerstelcodesSectie
            lang={lang}
            context={p.context}
            codes={p.recovery}
            busy={p.busy}
            nieuweHerstelcodes={p.nieuweHerstelcodes}
            recoverySaved={p.recoverySaved}
            onChange={() => void p.load()}
          />
        );
      case 'vault':
        return <SleutelkluisSectie lang={lang} context={p.context} />;
      case 'guest-code':
        return <Toegangscodes lang={lang} context={p.context} />;
      default:
        return <AanbiederDetailsV2 k={k} p={p} onClose={onClose} onStartKoppelen={onStartKoppelen} />;
    }
  })();

  return (
    <Laag lang={lang} soort={p.smal ? 'scherm' : 'paneel'} titel={titel} onSluit={onClose} data={{ 'amv2-detail': k.id }}>
      {p.notice ? (
        <p className='amv2-melding' role='alert'>
          {p.notice}
        </p>
      ) : null}
      <div className='amv2-paneel-inhoud access-plane'>{inhoud}</div>
    </Laag>
  );
}
