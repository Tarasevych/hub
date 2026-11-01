// Канонічна адаптивна форма «Сховище секретів» (UX-AI-VAULT-001):
// єдиний компонент для admin.tarasevych.com/contour, api.tarasevych.com/vault та github.tarasevych.com/accounts.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ClipboardCopy, Dices, Lock, RefreshCw } from 'lucide-react';
import { domains } from '../canoniek-dienst';
import { sessieDienst } from '../canoniek-navigatie';
import GeheimInvoer from '../geheim/GeheimInvoer';
import HulpVraag from '../hulp/HulpVraag';
import { VaultMetaVelden } from '../KluisMeta';
import { api } from '../platform/client';
import { Venster } from '../platform/vensters';
import { ecosystemTabContext } from '../tab-context';
import { DIENSTEN, DOEL_INFO, GEHEIM_GROEPEN, GROEP_NAAM, VAULT_DOELEN, isVaultDoel, type Tekst, type VaultDoel } from '../../shared/geheimen';
import {
  PLACEHOLDER_PER_DOEL,
  STANDAARD_NAAM_PER_DOEL,
  foutVeldVoorServerCode,
  standaardVaultMeta,
  valideerEnPakGeheimIn,
  type GeheimFormulierVeld,
} from '../../shared/geheimen-formulier';
import { githubInstelWaarden } from '../../shared/github-koppeling';
import type { VaultMeta } from '../../shared/kluis-meta';
import { foutTekst, genereerGeheim, kies, tr, type Lang } from './hulp';
import './geheimen.css';

export type VasteGeheimItem = {
  id: string;
  naam: string;
  doel: VaultDoel;
  meta?: VaultMeta;
};

export type OpgeslagenGeheim = {
  id: string;
  naam: string;
  doel: VaultDoel;
  rotated: boolean;
};

export type GeheimFormulierProps = {
  lang: Lang;
  beginDoel?: VaultDoel;
  vasteItem?: VasteGeheimItem | null;
  githubHost?: string;
  verantwoordelijke?: string;
  vaultKlaar?: boolean;
  context?: { service: string; tabContext: string; sourceOrigin: string };
  formulierNaam?: string;
  onOpgeslagen?: (uit: OpgeslagenGeheim) => void | Promise<void>;
  onAnnuleer?: () => void;
};

const apiFoutCode = (e: unknown): string => {
  const v = e as { response?: { data?: { error?: unknown; reasonCode?: unknown } }; message?: unknown };
  return String(v?.response?.data?.error || v?.response?.data?.reasonCode || v?.message || '').trim();
};

const KAN_GENEREREN = new Set<VaultDoel>(['webhook', 'database', 'other', 'home-assistant']);

export function GeheimFormulier({
  lang,
  beginDoel = 'github',
  vasteItem = null,
  githubHost,
  verantwoordelijke = '',
  vaultKlaar = true,
  context,
  formulierNaam = 'toevoegen',
  onOpgeslagen,
  onAnnuleer,
}: GeheimFormulierProps) {
  const startDoel: VaultDoel = vasteItem?.doel ?? (isVaultDoel(beginDoel) ? beginDoel : 'github');
  const [doel, setDoel] = useState<VaultDoel>(startDoel);
  const [naam, setNaam] = useState<string>(() => vasteItem?.naam ?? STANDAARD_NAAM_PER_DOEL[startDoel]);
  const [naamAangepast, setNaamAangepast] = useState<boolean>(!!vasteItem);
  const [meta, setMeta] = useState<VaultMeta>(() => vasteItem?.meta ?? standaardVaultMeta(startDoel, verantwoordelijke));
  const [metaAangepast, setMetaAangepast] = useState<boolean>(!!vasteItem?.meta);
  const [waarde, setWaarde] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [extraOpen, setExtraOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [gekopieerd, setGekopieerd] = useState<'' | 'homepage' | 'callback'>('');
  const [veldFouten, setVeldFouten] = useState<Partial<Record<GeheimFormulierVeld, Tekst>>>({});
  const [algemeneFout, setAlgemeneFout] = useState<{ code: string; tekst: string } | null>(null);
  const [succesMelding, setSuccesMelding] = useState('');

  useEffect(() => {
    if (vasteItem) {
      setDoel(vasteItem.doel);
      setNaam(vasteItem.naam);
      setNaamAangepast(true);
      setMeta(vasteItem.meta ?? standaardVaultMeta(vasteItem.doel, verantwoordelijke));
      setMetaAangepast(!!vasteItem.meta);
      return;
    }
    if (isVaultDoel(beginDoel)) {
      setDoel(beginDoel);
      setNaam(STANDAARD_NAAM_PER_DOEL[beginDoel]);
      setNaamAangepast(false);
      setMeta(standaardVaultMeta(beginDoel, verantwoordelijke));
      setMetaAangepast(false);
    }
  }, [beginDoel, vasteItem, verantwoordelijke]);

  const wisFout = (veld: GeheimFormulierVeld) => {
    setAlgemeneFout(null);
    setSuccesMelding('');
    setVeldFouten((huidig) => {
      if (!huidig[veld]) return huidig;
      const kopie = { ...huidig };
      delete kopie[veld];
      return kopie;
    });
  };

  const wisselDoel = (nieuw: VaultDoel) => {
    setDoel(nieuw);
    setVeldFouten({});
    setAlgemeneFout(null);
    setSuccesMelding('');
    if (!vasteItem && !naamAangepast) setNaam(STANDAARD_NAAM_PER_DOEL[nieuw]);
    if (!vasteItem && !metaAangepast) setMeta(standaardVaultMeta(nieuw, verantwoordelijke));
  };

  const doelenPerGroep = useMemo(
    () => GEHEIM_GROEPEN
      .map((groep) => ({ groep, doelen: VAULT_DOELEN.filter((d) => DOEL_INFO[d].groep === groep) }))
      .filter((g) => g.doelen.length > 0),
    [],
  );

  const ghInstel = useMemo(() => {
    const host = (githubHost || domains.github || 'github.tarasevych.com').trim();
    const w = githubInstelWaarden(host);
    return {
      homepageUrl: w.homepageUrl.replace(/\/$/, '') || `https://${host}`,
      callbackUrl: w.callbackUrl || `https://${host}/api/owner/github/oauth/callback`,
    };
  }, [githubHost]);

  const kopieerAdres = async (sleutel: 'homepage' | 'callback', tekst: string) => {
    try {
      await navigator.clipboard?.writeText(tekst);
      setGekopieerd(sleutel);
      window.setTimeout(() => setGekopieerd((h) => (h === sleutel ? '' : h)), 1800);
    } catch {
      setAlgemeneFout({
        code: 'CLIPBOARD_BLOCKED',
        tekst: tr(lang, 'Браузер не дозволив автоматичне копіювання — виділіть і скопіюйте адресу вручну.', 'De browser stond automatisch kopiëren niet toe — kopieer het adres handmatig.'),
      });
    }
  };

  const verstuur = async (e: FormEvent) => {
    e.preventDefault();
    if (bezig || !vaultKlaar) return;
    setAlgemeneFout(null);
    setSuccesMelding('');

    const controle = valideerEnPakGeheimIn({
      doel,
      naam: vasteItem ? vasteItem.naam : naam,
      waarde,
      clientId,
      clientSecret,
      appId,
      privateKey,
      meta,
      verantwoordelijke,
    });

    if (!controle.ok) {
      setVeldFouten(controle.veldFouten);
      if (controle.veldFouten.naam || controle.veldFouten.meta) setExtraOpen(true);
      return;
    }

    setVeldFouten({});
    setBezig(true);
    try {
      const reqBody = {
        ...(context ?? { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin }),
        ...(vasteItem?.id ? { id: vasteItem.id } : {}),
        name: controle.naam,
        purpose: controle.doel,
        usedBy: controle.doel,
        value: controle.waarde,
        meta: controle.meta,
      };
      const res = await api.post('/api/owner/api-platform/vault/save', reqBody);
      if (res?.data?.plaintext || res?.data?.value || res?.data?.secret) {
        throw new Error('OWNER_VAULT_RESPONSE_LEAK');
      }
      setWaarde('');
      setClientId('');
      setClientSecret('');
      setAppId('');
      setPrivateKey('');
      const opgeslagenId = String(res?.data?.item?.id || vasteItem?.id || '');
      const rotated = Boolean(res?.data?.rotated);
      setSuccesMelding(
        rotated
          ? tr(lang, `Секрет «${controle.naam}» оновлено й зашифровано (AES-256-GCM).`, `Geheim «${controle.naam}» bijgewerkt en versleuteld (AES-256-GCM).`)
          : tr(lang, `Секрет «${controle.naam}» збережено зашифровано (AES-256-GCM).`, `Geheim «${controle.naam}» versleuteld opgeslagen (AES-256-GCM).`),
      );
      if (onOpgeslagen) {
        await onOpgeslagen({ id: opgeslagenId, naam: controle.naam, doel: controle.doel, rotated });
      }
    } catch (err) {
      const code = apiFoutCode(err);
      const leesbaar = foutTekst(code, lang);
      const doelVeld = foutVeldVoorServerCode(code, doel);
      if (doelVeld) {
        setVeldFouten({ [doelVeld]: [foutTekst(code, 'uk'), foutTekst(code, 'nl')] });
        if (doelVeld === 'naam' || doelVeld === 'meta') setExtraOpen(true);
      } else {
        setAlgemeneFout({ code: code || 'FOUT', tekst: leesbaar });
      }
    } finally {
      setBezig(false);
    }
  };

  const samenvattingNaam = (vasteItem ? vasteItem.naam : naam.trim()) || STANDAARD_NAAM_PER_DOEL[doel];
  const samenvattingDienst = meta.van || DIENSTEN[DOEL_INFO[doel].dienst].naam[lang === 'uk' ? 0 : 1];
  const samenvattingTermijn = meta.geldigTot
    ? `${tr(lang, 'діє до ', 'geldig tot ')}${meta.geldigTot}`
    : tr(lang, 'Без строку', 'Zonder einde');

  return (
    <form className='gm-formulier gm-kluis-formulier' data-gm-formulier={formulierNaam} data-kluis-doel={doel} onSubmit={(e) => void verstuur(e)} noValidate>
      {!vaultKlaar ? (
        <p className='gm-banner is-bad' role='alert'>
          <AlertTriangle aria-hidden='true' />
          <span>{tr(lang, 'Шифрування сховища зараз недоступне на сервері (перевірте OWNER_VAULT_ENCRYPTION_KEY_V1).', 'Kluisversleuteling is nu niet beschikbaar op de server (controleer OWNER_VAULT_ENCRYPTION_KEY_V1).')}</span>
        </p>
      ) : null}

      {vasteItem ? (
        <div className='gm-vaste-kop' data-kluis-vaste-item={vasteItem.naam}>
          <strong>{vasteItem.naam}</strong>
          <span className='gm-chip'>{kies(lang, DOEL_INFO[doel].naam)}</span>
        </div>
      ) : (
        <label>
          <span>{tr(lang, 'Тип секрету / сервіс', 'Type geheim / dienst')} <HulpVraag k='geheimen.doel' lang={lang} /></span>
          <select
            data-kluis-veld='doel'
            data-hulp='geheimen.doel'
            value={doel}
            onChange={(e) => wisselDoel(e.target.value as VaultDoel)}
          >
            {doelenPerGroep.map(({ groep, doelen }) => (
              <optgroup key={groep} label={kies(lang, GROEP_NAAM[groep])}>
                {doelen.map((d) => (
                  <option key={d} value={d}>{kies(lang, DOEL_INFO[d].naam)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {doel === 'github-oauth' ? (
        <>
          <div className='gm-github-urls' data-kluis-github-urls='1'>
            <strong>{tr(lang, 'Адреси для реєстрації OAuth-застосунку на GitHub', 'Adressen voor uw OAuth-app op GitHub')}</strong>
            <small>{tr(lang, 'Скопіюйте ці два значення у форму github.com → Settings → Developer settings → OAuth Apps:', 'Kopieer deze twee waarden naar github.com → Settings → Developer settings → OAuth Apps:')}</small>
            <div className='gm-kopieer-rij'>
              <span className='gm-kopieer-label'>Homepage URL</span>
              <div className='gm-kopieer-invoer'>
                <input value={ghInstel.homepageUrl} readOnly spellCheck={false} data-kluis-url='homepage' aria-label='Homepage URL' onFocus={(e) => e.currentTarget.select()} />
                <button type='button' className='gm-knop' data-kluis-kopieer='homepage' onClick={() => void kopieerAdres('homepage', ghInstel.homepageUrl)}>
                  {gekopieerd === 'homepage' ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}
                  {gekopieerd === 'homepage' ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}
                </button>
              </div>
            </div>
            <div className='gm-kopieer-rij'>
              <span className='gm-kopieer-label'>Redirect URI (Authorization callback URL)</span>
              <div className='gm-kopieer-invoer'>
                <input value={ghInstel.callbackUrl} readOnly spellCheck={false} data-kluis-url='callback' aria-label='Redirect URI' onFocus={(e) => e.currentTarget.select()} />
                <button type='button' className='gm-knop' data-kluis-kopieer='callback' onClick={() => void kopieerAdres('callback', ghInstel.callbackUrl)}>
                  {gekopieerd === 'callback' ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}
                  {gekopieerd === 'callback' ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}
                </button>
              </div>
            </div>
          </div>

          <label>
            <span>Client ID</span>
            <input
              data-kluis-veld='client-id'
              name='github-client-id'
              autoComplete='off'
              spellCheck={false}
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); wisFout('clientId'); }}
              placeholder='Ov23li...'
              aria-invalid={!!veldFouten.clientId}
            />
            {veldFouten.clientId ? <small className='gm-veld-fout' data-kluis-fout='clientId' role='alert'>{kies(lang, veldFouten.clientId)}</small> : null}
          </label>

          <label>
            <span>Client Secret</span>
            <GeheimInvoer
              lang={lang}
              name='github-client-secret'
              autoComplete='off'
              spellCheck={false}
              value={clientSecret}
              onChange={(v) => { setClientSecret(v); wisFout('clientSecret'); }}
              placeholder={tr(lang, 'Секрет клієнта OAuth-застосунку GitHub', 'Client Secret van uw GitHub OAuth-app')}
              max={400}
              soort='kluis'
              data={{ 'kluis-veld': 'client-secret' }}
            />
            {veldFouten.clientSecret ? <small className='gm-veld-fout' data-kluis-fout='clientSecret' role='alert'>{kies(lang, veldFouten.clientSecret)}</small> : null}
          </label>
        </>
      ) : doel === 'github-app' ? (
        <>
          <label>
            <span>App ID</span>
            <input
              data-kluis-veld='app-id'
              name='github-app-id'
              inputMode='numeric'
              autoComplete='off'
              spellCheck={false}
              value={appId}
              onChange={(e) => { setAppId(e.target.value); wisFout('appId'); }}
              placeholder='123456'
              aria-invalid={!!veldFouten.appId}
            />
            {veldFouten.appId ? <small className='gm-veld-fout' data-kluis-fout='appId' role='alert'>{kies(lang, veldFouten.appId)}</small> : null}
          </label>

          <label>
            <span>Private Key (PEM)</span>
            <GeheimInvoer
              lang={lang}
              name='github-private-key'
              autoComplete='off'
              spellCheck={false}
              rijen={6}
              max={8192}
              soort='pem'
              value={privateKey}
              onChange={(v) => { setPrivateKey(v); wisFout('privateKey'); }}
              placeholder={'-----BEGIN RSA PRIVATE' + ' KEY-----\n...\n-----END RSA PRIVATE' + ' KEY-----'}
              data={{ 'kluis-veld': 'private-key' }}
            />
            {veldFouten.privateKey ? <small className='gm-veld-fout' data-kluis-fout='privateKey' role='alert'>{kies(lang, veldFouten.privateKey)}</small> : null}
          </label>
        </>
      ) : (
        <>
          <label>
            <span>{vasteItem ? tr(lang, 'Новий ключ / токен', 'Nieuwe sleutel / token') : tr(lang, 'Ключ / токен', 'Sleutel / token')}</span>
            <GeheimInvoer
              lang={lang}
              name='vault-value'
              autoComplete='off'
              spellCheck={false}
              rijen={doel === 'ssh' ? 4 : 2}
              max={8192}
              soort={doel === 'ssh' ? 'pem' : 'kluis'}
              verborgen={doel !== 'ssh'}
              value={waarde}
              onChange={(v) => { setWaarde(v); wisFout('waarde'); }}
              placeholder={kies(lang, PLACEHOLDER_PER_DOEL[doel])}
              data={{ 'kluis-veld': 'waarde' }}
            />
            {veldFouten.waarde ? <small className='gm-veld-fout' data-kluis-fout='waarde' role='alert'>{kies(lang, veldFouten.waarde)}</small> : null}
          </label>
          {KAN_GENEREREN.has(doel) || vasteItem ? (
            <button
              type='button'
              className='gm-knop gm-genereer'
              data-gm-genereer
              onClick={() => { setWaarde(genereerGeheim()); wisFout('waarde'); }}
            >
              <Dices aria-hidden='true' />
              {tr(lang, 'Згенерувати надійне значення', 'Sterke waarde genereren')}
            </button>
          ) : null}
        </>
      )}

      <details
        className='gm-extra'
        data-kluis-extra='1'
        open={extraOpen}
        onToggle={(e) => setExtraOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span>{tr(lang, 'Додаткові параметри', 'Aanvullende instellingen')}</span>
          <small className='gm-extra-samenvatting'>{samenvattingNaam} · {samenvattingDienst} · {samenvattingTermijn}</small>
        </summary>
        <div className='gm-extra-inhoud'>
          {!vasteItem ? (
            <label>
              <span>{tr(lang, 'Назва (код латиницею)', 'Naam (Latijnse code)')}</span>
              <input
                data-kluis-veld='naam'
                name='vault-name'
                autoComplete='off'
                spellCheck={false}
                value={naam}
                onChange={(e) => {
                  const v = e.target.value;
                  setNaam(v);
                  setNaamAangepast(v.trim() !== '' && v.trim() !== STANDAARD_NAAM_PER_DOEL[doel]);
                  wisFout('naam');
                }}
                placeholder={STANDAARD_NAAM_PER_DOEL[doel]}
                aria-invalid={!!veldFouten.naam}
              />
              {veldFouten.naam ? <small className='gm-veld-fout' data-kluis-fout='naam' role='alert'>{kies(lang, veldFouten.naam)}</small> : null}
            </label>
          ) : null}
          <VaultMetaVelden
            lang={lang}
            waarde={meta}
            onChange={(volgende) => {
              setMeta(volgende);
              setMetaAangepast(true);
              wisFout('meta');
            }}
          />
          {veldFouten.meta ? <small className='gm-veld-fout' data-kluis-fout='meta' role='alert'>{kies(lang, veldFouten.meta)}</small> : null}
        </div>
      </details>

      {algemeneFout ? (
        <p className='gm-banner is-bad' data-kluis-algemene-fout={algemeneFout.code} role='alert'>
          <AlertTriangle aria-hidden='true' />
          <span>{algemeneFout.tekst}</span>
        </p>
      ) : null}

      {succesMelding ? (
        <p className='gm-banner is-ok' data-kluis-succes='1' role='status'>
          <Check aria-hidden='true' />
          <span>{succesMelding}</span>
        </p>
      ) : null}

      <p className='gm-klein'>
        <Lock aria-hidden='true' />
        {tr(
          lang,
          'Значення шифрується на сервері (AES-256-GCM) після підтвердження Passkey або кодом і ніколи не передається відкритим текстом.',
          'De waarde wordt op de server versleuteld (AES-256-GCM) na bevestiging met Passkey of code en nooit onversleuteld teruggegeven.',
        )}
      </p>

      <div className='gm-formulier-acties'>
        {onAnnuleer ? (
          <button type='button' className='gm-knop' onClick={onAnnuleer}>
            {tr(lang, 'Скасувати', 'Annuleren')}
          </button>
        ) : null}
        <button
          type='submit'
          className='gm-knop is-primair'
          data-kluis-opslaan='1'
          disabled={bezig || !vaultKlaar}
        >
          {bezig ? <RefreshCw className='spin' aria-hidden='true' /> : <Lock aria-hidden='true' />}
          {tr(lang, 'Зберегти зашифровано (Passkey)', 'Versleuteld opslaan (Passkey)')}
        </button>
      </div>
    </form>
  );
}

export function GeheimVenster({
  id = 'gm-kluis-venster',
  titel,
  lang,
  onSluit,
  ...rest
}: GeheimFormulierProps & { id?: string; titel?: string; onSluit: () => void }) {
  const kop = titel ?? (rest.vasteItem
    ? `${tr(lang, 'Замінити секрет', 'Geheim vervangen')}: ${rest.vasteItem.naam}`
    : tr(lang, 'Додати секрет у сховище', 'Geheim toevoegen aan kluis'));
  return (
    <Venster id={id} titel={kop} breedte={620} lang={lang} onSluit={onSluit} className='gm-venster'>
      <GeheimFormulier
        {...rest}
        lang={lang}
        onAnnuleer={onSluit}
      />
    </Venster>
  );
}

export default GeheimFormulier;
