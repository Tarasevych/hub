// UI-015 — het detailpaneel van één methode. KERNREGEL (dossier §8.4): de ECHTE flows blijven de bestaande componenten en
// routes — PasskeysSection, HerstelcodesSectie, SleutelkluisSectie, Toegangscodes en de TOTP-aanroepen van de controller
// worden hier ongewijzigd gerenderd; dit paneel is alleen de omlijsting (zijpaneel op breed, volledig scherm op smal).
// Geheimen (TOTP-sleutel, herstelcodes) verschijnen uitsluitend hier, nooit op de kaart of in het overzicht.
import { Check, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import {verborgenVoorAi} from '../../menselijke-actie'; // SEC-002 extensie-09 (g10a-3): eenmalige geheimen leest de AI-extensie niet
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { STAAT_LABEL, aanmeldTekst, type MethodeUi } from '../../../shared/aanmeld-vnext-model';
import type { AccessPlanePanels } from '../../toegangslaag-panelen';
import { PasskeysSection } from '../../ToegangssleutelsSectie';
import { HerstelcodesSectie } from '../../HerstelcodesSectie';
import { SleutelkluisSectie } from '../../SleutelkluisSectie';
import { Toegangscodes } from '../../Toegangscodes';
import GeheimInvoer from '../../geheim/GeheimInvoer';
import type { Lang } from '../../toegangslaag-teksten';
import Laag from '../Laag';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type PaneelProps = ComponentProps<typeof AccessPlanePanels>;

type Props = { lang: Lang; kaart: MethodeUi; p: PaneelProps; smal: boolean; onSluit: () => void };
export default function MethodeDetail({ lang, kaart: k, p, smal, onSluit }: Props) {
  const { data, busy, write } = p;
  const [wachtwoordWeg, setWachtwoordWeg] = useState(false);
  const totp = data.factors.find((f) => f.id === 'totp');
  const binding = data.bindings.find((b) => b.method === 'google');

  const inhoud = () => {
    switch (k.id) {
      case 'google': return (
        <div className='amv-detail-google'>
          <p className='amv-rij'><strong>{tr(lang, 'Акаунт', 'Account')}</strong><span>{binding?.email || tr(lang, 'Google-акаунт', 'Google-account')}</span></p>
          <p className='amv-rij'><strong>{tr(lang, 'Стан', 'Status')}</strong><span>{aanmeldTekst(STAAT_LABEL[k.staat], lang)}</span></p>
          {data.lockout.protected ? <p className='amv-melding is-info' data-google-enige=''>{tr(lang, 'Google — зараз ваш єдиний спосіб входу, тому його не можна вимкнути. Passkey поки що лише підтверджує важливі дії.', 'Google is nu uw enige aanmeldmethode en kan daarom niet worden uitgeschakeld. Een passkey bevestigt voorlopig alleen belangrijke acties.')}</p> : null}
          <a className='amv-knop' href='https://myaccount.google.com/security' target='_blank' rel='noopener noreferrer'><ExternalLink aria-hidden='true' />{tr(lang, 'Керувати в Google', 'Beheren bij Google')}</a>
          <small className='amv-hint'>{tr(lang, 'Адресу можна змінити лише в Google.', 'Het adres wijzigen kan alleen bij Google.')}</small>
        </div>
      );
      case 'password': return (
        <div className='amv-detail-wachtwoord'>
          {data.password.mustChange ? <p className='amv-melding is-fout'>{tr(lang, 'Тимчасовий пароль — потрібно змінити.', 'Tijdelijk wachtwoord — wijzigen vereist.')}</p> : null}
          <GeheimInvoer lang={lang} value={p.password} onChange={p.setPassword} autoComplete='new-password' autoFocus placeholder={tr(lang, 'Новий пароль, мін. 10 символів', 'Nieuw wachtwoord, min. 10 tekens')} minLength={10} max={1024} soort='wachtwoord' />
          <div className='amv-rij'>
            <button type='button' className='amv-knop is-hoofd' disabled={busy || p.password.length < 10} onClick={() => void write('/api/owner/access/password/set', { password: p.password })}><Check aria-hidden='true' />{tr(lang, 'Зберегти', 'Opslaan')}</button>
            {!wachtwoordWeg
              ? <button type='button' className='amv-knop' disabled={busy || data.lockout.protected} onClick={() => setWachtwoordWeg(true)}><Trash2 aria-hidden='true' />{tr(lang, 'Прибрати пароль', 'Wachtwoord verwijderen')}</button>
              : <button type='button' className='amv-knop is-gevaar' disabled={busy} onClick={() => { setWachtwoordWeg(false); void write('/api/owner/access/password/remove'); }}><Trash2 aria-hidden='true' />{tr(lang, 'Так, прибрати', 'Ja, verwijderen')}</button>}
            {wachtwoordWeg ? <button type='button' className='amv-knop is-stil' onClick={() => setWachtwoordWeg(false)}><X aria-hidden='true' />{tr(lang, 'Скасувати', 'Annuleren')}</button> : null}
          </div>
          {data.lockout.protected ? <small className='amv-hint'>{tr(lang, 'Останній спосіб входу захищено — прибрати пароль не можна.', 'De laatste aanmeldweg is beschermd — het wachtwoord verwijderen kan niet.')}</small> : null}
        </div>
      );
      case 'passkey': return <PasskeysSection lang={lang} context={p.context} onChange={() => void p.load()} />;
      case 'totp': return (
        <div className='amv-detail-totp'>
          {!totp?.enrolled && !p.otpauth ? (
            <>
              <p>{tr(lang, 'Коди з застосунку на кшталт Google Authenticator, Microsoft Authenticator або 1Password. Без SMS.', 'Codes uit een app zoals Google Authenticator, Microsoft Authenticator of 1Password. Zonder sms.')}</p>
              <button type='button' className='amv-knop is-hoofd' disabled={busy || totp?.status === 'loading'} onClick={() => void write('/api/owner/access/totp/start')}><Plus aria-hidden='true' />{tr(lang, 'Налаштувати', 'Instellen')}</button>
            </>
          ) : null}
          {p.otpauth && !totp?.enrolled ? (
            <div className='amv-totp-setup'>
              <strong>{tr(lang, 'Додайте ключ у застосунок і введіть код', 'Voeg de sleutel toe in de app en voer de code in')}</strong>
              <code className='amv-geheim' {...verborgenVoorAi}>{p.secret}</code>
              <small>{tr(lang, 'Ключ показано один раз.', 'De sleutel wordt eenmalig getoond.')}</small>
              <div className='amv-rij'>
                <input inputMode='numeric' autoComplete='one-time-code' autoFocus value={p.code} maxLength={6}
                  placeholder={tr(lang, '6-значний код', '6-cijferige code')} aria-label={tr(lang, 'Код підтвердження', 'Bevestigingscode')}
                  onChange={(e) => p.setCode(e.target.value.replace(/\D+/g, ''))} />
                <button type='button' className='amv-knop is-hoofd' disabled={busy || p.code.length !== 6} onClick={() => void write('/api/owner/access/totp/confirm', { code: p.code })}><Check aria-hidden='true' />{tr(lang, 'Підтвердити', 'Bevestigen')}</button>
              </div>
            </div>
          ) : null}
          {totp?.enrolled ? (
            <>
              <p>{tr(lang, 'Застосунок-автентифікатор налаштовано. Коди потрібні для важливих дій.', 'De authenticator-app is ingesteld. De codes bevestigen belangrijke acties.')}</p>
              <button type='button' className='amv-knop' disabled={busy} onClick={() => void p.totpUitschakelen()}><Trash2 aria-hidden='true' />{tr(lang, 'Вимкнути', 'Uitschakelen')}</button>
              <small className='amv-hint'>{tr(lang, 'Вимкнення підтверджується чинним кодом або кодом відновлення.', 'Uitschakelen wordt bevestigd met de huidige code of een herstelcode.')}</small>
            </>
          ) : null}
        </div>
      );
      case 'recovery': return <HerstelcodesSectie lang={lang} context={p.context} codes={p.recovery} busy={busy} nieuweHerstelcodes={p.nieuweHerstelcodes} recoverySaved={p.recoverySaved} onChange={() => void p.load()} />;
      case 'vault': return <SleutelkluisSectie lang={lang} context={p.context} />;
      default: return <Toegangscodes lang={lang} context={p.context} />;
    }
  };

  return (
    <Laag lang={lang} soort={smal ? 'scherm' : 'paneel'} titel={aanmeldTekst(k.titel, lang)} onSluit={onSluit} data={{ 'amv-detail': k.id }}>
      {inhoud()}
    </Laag>
  );
}
