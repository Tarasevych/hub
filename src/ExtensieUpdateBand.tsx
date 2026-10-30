// Strook «Доступне оновлення розширення X → Y» (audit 18.10.2026, punt 9). Eigen React-root (main.tsx), op elke pagina van de site.
// Bron: de extensie zelf (hello van bridge.js / PING via externally_connectable) en /downloads/extension-version.json.
// Knoppen: «Оновити автоматично» (alleen een CRX-installatie; vraagt Chrome om een controle), «Як оновити вручну» (stappen voor
// «Load unpacked»/zip), «Нагадати пізніше» (24 uur, localStorage; niet bij een verplichte update).
import { useEffect, useState } from 'react';
import { ArrowUpCircle, ChevronDown, ChevronUp, Clock, Download, RefreshCw, X } from 'lucide-react';
import { EXTENSION_ID_RE, sendToExtension } from './extensie-toestand';
import { LATER_MS, updateAdvies, EXT_MIN_VERSIE } from '../shared/extensie-update';
import { routeLang } from './canoniek-navigatie';
import './extensie-update-band.css';

const LATER_SLEUTEL = 'mr-ext-update-later-v1';
const FALLBACK_ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
type Release = { version?: string; minVersion?: string; crx?: { version?: string; extensionId?: string } | null; crxStatus?: string; file?: string };
type Ping = { ok?: boolean; version?: string; selfHosted?: boolean };

const leesLater = () => { try { return Number(localStorage.getItem(LATER_SLEUTEL) || 0) || 0; } catch { return 0; } };
const zetLater = (t: number) => { try { localStorage.setItem(LATER_SLEUTEL, String(t)); } catch { /* privévenster */ } };

export default function ExtensieUpdateBand() {
  const uk = routeLang() !== 'nl';
  const t = (a: string, b: string) => (uk ? a : b);
  const [release, setRelease] = useState<Release>({});
  const [heeft, setHeeft] = useState('');
  const [zelf, setZelf] = useState(false);
  const [id, setId] = useState('');
  const [later, setLater] = useState(leesLater());
  const [stappen, setStappen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');

  useEffect(() => {
    fetch('/downloads/extension-version.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => setRelease(j as Release)).catch(() => undefined);
    const op = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin || !e.data || e.data.mrExt !== true || e.data.type !== 'hello') return;
      if (typeof e.data.version === 'string') setHeeft(e.data.version);
      if (typeof e.data.extensionId === 'string' && EXTENSION_ID_RE.test(e.data.extensionId)) setId(e.data.extensionId);
    };
    window.addEventListener('message', op);
    window.postMessage({ mrExtPing: true }, location.origin);
    return () => window.removeEventListener('message', op);
  }, []);
  // Oudere extensies (0.3.x) melden hun versie niet in de hello: dan PING (externally_connectable).
  useEffect(() => {
    const ext = id || release.crx?.extensionId || FALLBACK_ID;
    let stop = false;
    void sendToExtension<Ping>(ext, { type: 'PING' }, 3000).then((p) => { if (stop || !p?.ok) return; if (p.version) setHeeft(p.version); setZelf(!!p.selfHosted); });
    return () => { stop = true; };
  }, [id, release.crx?.extensionId]);

  const advies = updateAdvies({ heeft, nieuwste: release.version, min: release.minVersion || EXT_MIN_VERSIE, crxVersie: release.crx?.version ?? null, zelfGehost: zelf, laterTot: later });
  if (!advies.toon) return null;

  const automatisch = async () => {
    setBezig(true); setMelding('');
    const r = await sendToExtension<{ ok?: boolean; status?: string; reason?: string }>(id || release.crx?.extensionId || FALLBACK_ID, { type: 'UPDATE_CHECK' }, 15000);
    setBezig(false);
    if (r?.ok && r.status === 'update_available') setMelding(t('Chrome завантажує оновлення; розширення перезапуститься саме.', 'Chrome downloadt de update; de extensie herstart vanzelf.'));
    else if (r?.ok && r.status === 'throttled') setMelding(t('Chrome щойно перевіряв — спробуйте за кілька хвилин.', 'Chrome controleerde net — probeer het over enkele minuten.'));
    else if (r?.ok) setMelding(t('Chrome ще не бачить нової версії. Скористайтеся кроками вручну.', 'Chrome ziet nog geen nieuwe versie. Gebruik de stappen hieronder.'));
    else { setMelding(r?.reason === 'UNPACKED' ? t('Це розширення встановлене вручну («Завантажити розпаковане») — Chrome не оновлює його сам. Кроки нижче.', 'Deze extensie is handmatig geladen («Uitgepakt laden») — Chrome werkt die niet zelf bij. Stappen hieronder.') : t('Розширення не відповіло.', 'De extensie antwoordde niet.')); setStappen(true); }
  };

  return <div className='ext-band' role='region' aria-label={t('Оновлення розширення', 'Update van de extensie')} data-verplicht={advies.verplicht || undefined} data-ext-update-band>
    <div className='ext-band-rij'>
      <ArrowUpCircle aria-hidden='true' />
      <p><b>{advies.verplicht ? t('Розширення застаріло', 'De extensie is verouderd') : t('Доступне оновлення розширення', 'Update van de extensie beschikbaar')}</b>
        <span className='ext-band-versie'>{advies.van} → {advies.naar}</span>
        {advies.verplicht && <span>{t(`Нижче ${advies.naar} ШІ не може керувати браузером.`, `Onder ${advies.naar} kan de AI de browser niet bedienen.`)}</span>}</p>
      <span className='ext-band-knoppen'>
        {advies.automatisch && <button type='button' className='is-hoofd' disabled={bezig} onClick={() => void automatisch()}>{bezig ? <RefreshCw className='spin' aria-hidden='true' /> : <RefreshCw aria-hidden='true' />}{t('Оновити автоматично', 'Automatisch bijwerken')}</button>}
        <button type='button' className={advies.automatisch ? '' : 'is-hoofd'} aria-expanded={stappen} onClick={() => setStappen((s) => !s)}>{stappen ? <ChevronUp aria-hidden='true' /> : <ChevronDown aria-hidden='true' />}{t('Як оновити вручну', 'Handmatig bijwerken')}</button>
        {!advies.verplicht && <button type='button' onClick={() => { const tot = Date.now() + LATER_MS; zetLater(tot); setLater(tot); }}><Clock aria-hidden='true' />{t('Нагадати пізніше', 'Later herinneren')}</button>}
        {!advies.verplicht && <button type='button' className='ext-band-x' aria-label={t('Закрити на 24 години', 'Sluiten voor 24 uur')} onClick={() => { const tot = Date.now() + LATER_MS; zetLater(tot); setLater(tot); }}><X aria-hidden='true' /></button>}
      </span>
    </div>
    {melding && <p className='ext-band-melding' role='status'>{melding}</p>}
    {stappen && <ol className='ext-band-stappen'>
      <li>{t('Завантажте новий пакет', 'Download het nieuwe pakket')}: <a href={`/downloads/${release.file || 'mijn-ruimte-extension.zip'}`} download><Download aria-hidden='true' />{release.file || 'mijn-ruimte-extension.zip'}</a></li>
      <li>{t('Розпакуйте його в ту саму теку, де лежить поточне розширення (замініть файли).', 'Pak het uit in dezelfde map als de huidige extensie (bestanden vervangen).')}</li>
      <li>{t('Відкрийте', 'Open')} <code>chrome://extensions</code> {t('і натисніть ↻ «Оновити» на картці Mijn Ruimte.', 'en klik op ↻ «Vernieuwen» op de kaart van Mijn Ruimte.')}</li>
      <li>{t('Поверніться сюди: смуга зникне, коли версія збігатиметься. Підключення лишається.', 'Kom terug: de strook verdwijnt zodra de versie klopt. De koppeling blijft.')}</li>
      {release.crxStatus && release.crxStatus !== 'actueel' && <li className='ext-band-noot'>{t('Автоматичне оновлення ще не доступне: підписаний пакет (CRX) не відповідає цій версії. Власник підписує його своїм ключем (deploy/EXTENSIE-BIJWERKEN.md).', 'Automatisch bijwerken is nog niet beschikbaar: het ondertekende pakket (CRX) hoort niet bij deze versie. De eigenaar ondertekent het met zijn sleutel (deploy/EXTENSIE-BIJWERKEN.md).')}</li>}
    </ol>}
  </div>;
}
