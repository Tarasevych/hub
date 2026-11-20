// UPD-013: Панель керування розподіленим зашифрованим зберіганням Шаміра (k-з-n).
// Показує стан вузлів (зелений/жовтий/червоний), покриття по країнах і платформах,
// дозволяє додавати вузли з миттєвою перевіркою політики k-з-n, перевіряти цілісність без збирання ключа,
// запускати навчальне відновлення й ротацію та завантажувати очищений VERDEELDE-OPSLAG-MANIFEST.json.
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe,
  HardDrive,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../platform/client';
import { datum, tr, type Lang } from './types';
import type {
  KnoopSoort,
  KnoopStatus,
  OefenHerstelResultaat,
  RotatieSoort,
  SpreidingOordeel,
} from '../../shared/verdeelde-opslag';

type OverzichtKleur = 'groen' | 'geel' | 'rood';

type KnoopItem = {
  id: string;
  naam: string;
  landCode: string;
  platform: string;
  soort: KnoopSoort;
  bestemmingHint: string;
  status: KnoopStatus;
  laatsteSha256: string;
  laatsteControleOp: string;
  actief: boolean;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

type RotatieItem = {
  id: string;
  soort: RotatieSoort;
  aantalDelen: number;
  drempelK: number;
  geslaagd: boolean;
  samenvatting: string;
  details: Record<string, unknown>;
  uitgevoerdOp: string;
};

type OverzichtData = {
  kleur: OverzichtKleur;
  statusTekstUk: string;
  statusTekstNl: string;
  drempelK: number;
  aantalDelen: number;
  actiefAantal: number;
  knopen: KnoopItem[];
  spreiding: SpreidingOordeel;
  perLand: Record<string, number>;
  perPlatform: Record<string, number>;
  rotaties: RotatieItem[];
};

type Props = {
  lang: Lang;
  context: Record<string, unknown>;
};

const SOORT_OPTIES: Array<{ waarde: KnoopSoort; uk: string; nl: string }> = [
  { waarde: 'r-schijf', uk: 'Диск R:\\ (локальний)', nl: 'R:\\-schijf (lokaal)' },
  { waarde: 's3', uk: 'S3-сховище', nl: 'S3-opslag' },
  { waarde: 'webdav', uk: 'WebDAV', nl: 'WebDAV' },
  { waarde: 'rclone', uk: 'rclone (шифроване)', nl: 'rclone (versleuteld)' },
  { waarde: 'nextcloud', uk: 'Nextcloud', nl: 'Nextcloud' },
  { waarde: 'offline-qr', uk: 'Офлайн-QR / папір', nl: 'Offline-QR / papier' },
  { waarde: 'eigen-server', uk: 'Власний сервер', nl: 'Eigen server' },
];

function soortNaam(lang: Lang, soort: KnoopSoort): string {
  const item = SOORT_OPTIES.find((x) => x.waarde === soort);
  return item ? (lang === 'nl' ? item.nl : item.uk) : soort;
}

function knoopStatusNaam(lang: Lang, status: KnoopStatus): string {
  switch (status) {
    case 'gezond': return tr(lang, 'Справний', 'Gezond');
    case 'waarschuwing': return tr(lang, 'Увага', 'Waarschuwing');
    case 'fout': return tr(lang, 'Помилка', 'Fout');
    default: return tr(lang, 'Не перевірено', 'Onbekend');
  }
}

function knoopStatusBadge(status: KnoopStatus): string {
  if (status === 'gezond') return 'klaar';
  if (status === 'fout') return 'mislukt';
  if (status === 'waarschuwing') return 'afgebroken';
  return 'bezig';
}

function kleurNaam(lang: Lang, kleur: OverzichtKleur): string {
  if (kleur === 'groen') return tr(lang, 'Зелений · захищено', 'Groen · beschermd');
  if (kleur === 'geel') return tr(lang, 'Жовтий · потребує уваги', 'Geel · aandacht nodig');
  return tr(lang, 'Червоний · ризик втрати чи розкриття', 'Rood · risico op verlies of concentratie');
}

function rotatieSoortNaam(lang: Lang, soort: RotatieSoort): string {
  if (soort === 'oefen-herstel') return tr(lang, 'Навчальне відновлення й ротація', 'Oefenherstel en rotatie');
  if (soort === 'rotatie') return tr(lang, 'Проактивна ротація', 'Proactieve rotatie');
  return tr(lang, 'Перевірка цілісності', 'Integriteitscontrole');
}

export default function VerdeeldeOpslagPaneel({ lang, context }: Props) {
  const [overzicht, setOverzicht] = useState<OverzichtData | null>(null);
  const [drempelK, setDrempelK] = useState(3);
  const [aantalDelen, setAantalDelen] = useState(5);
  const [laadt, setLaadt] = useState(false);
  const [bezig, setBezig] = useState('');
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [laatsteOefening, setLaatsteOefening] = useState<OefenHerstelResultaat | null>(null);

  // Форма додавання вузла
  const [naam, setNaam] = useState('');
  const [soort, setSoort] = useState<KnoopSoort>('r-schijf');
  const [landCode, setLandCode] = useState('NL');
  const [platform, setPlatform] = useState('');
  const [bestemmingHint, setBestemmingHint] = useState('');
  const [laatsteSha256, setLaatsteSha256] = useState('');

  const laden = useCallback(async (k = drempelK, n = aantalDelen) => {
    setLaadt(true);
    try {
      const r = (await api.get('/api/owner/verdeelde-opslag/overzicht', {
        ...context,
        drempelK: k,
        aantalDelen: n,
      })).data as OverzichtData;
      setOverzicht(r);
      setFout('');
    } catch {
      setFout(tr(lang, 'Не вдалося завантажити стан розподіленого зберігання.', 'Status van verdeelde opslag kon niet worden geladen.'));
    } finally {
      setLaadt(false);
    }
  }, [context, lang, drempelK, aantalDelen]);

  useEffect(() => {
    void laden(drempelK, aantalDelen);
  }, [laden, drempelK, aantalDelen]);

  const knoopToevoegen = async () => {
    const schoonNaam = naam.trim();
    const schoonLand = landCode.trim().toUpperCase();
    const schoonPlat = platform.trim();
    if (schoonNaam.length < 2) {
      setFout(tr(lang, 'Вкажіть назву вузла (щонайменше 2 символи).', 'Geef een knoopnaam op (minstens 2 tekens).'));
      return;
    }
    if (!/^[A-Z0-9_-]{2,16}$/.test(schoonLand)) {
      setFout(tr(lang, 'Вкажіть коректний код країни (наприклад: NL, DE, CH, UA або OFFLINE).', 'Geef een geldige landcode op (bijv. NL, DE, CH, UA of OFFLINE).'));
      return;
    }
    if (schoonPlat.length < 2) {
      setFout(tr(lang, 'Вкажіть платформу або постачальника (наприклад: eigen-pc, hetzner, nextcloud-ch).', 'Geef een platform of aanbieder op (bijv. eigen-pc, hetzner, nextcloud-ch).'));
      return;
    }
    const sha = laatsteSha256.trim().toLowerCase();
    if (sha && !/^[0-9a-f]{64}$/.test(sha)) {
      setFout(tr(lang, 'Контрольна сума SHA-256 має містити рівно 64 шістнадцяткові символи або бути порожньою.', 'SHA-256 moet precies 64 hexadecimale tekens bevatten of leeg blijven.'));
      return;
    }

    setBezig('toevoegen');
    setFout('');
    setMelding('');
    try {
      const r = (await api.post('/api/owner/verdeelde-opslag/knoop', {
        ...context,
        naam: schoonNaam,
        soort,
        landCode: schoonLand,
        platform: schoonPlat,
        bestemmingHint: bestemmingHint.trim(),
        laatsteSha256: sha,
        actief: true,
        drempelK,
        aantalDelen,
      })).data as { overzicht: OverzichtData };
      setOverzicht(r.overzicht);
      setNaam('');
      setPlatform('');
      setBestemmingHint('');
      setLaatsteSha256('');
      setMelding(tr(lang, `Вузол «${schoonNaam}» (${schoonLand}) додано з дотриманням політики ${drempelK}-з-${aantalDelen}.`, `Knoop «${schoonNaam}» (${schoonLand}) toegevoegd binnen het ${drempelK}-van-${aantalDelen}-beleid.`));
    } catch (err) {
      if (err instanceof ApiError && err.response?.data?.error === 'SPREIDING_BELEID_SCHENDING') {
        const lijst = Array.isArray(err.response.data.fouten)
          ? (err.response.data.fouten as Array<{ uk?: string; nl?: string }>)
          : [];
        const reden = lijst.map((f) => (lang === 'nl' ? f.nl : f.uk)).filter(Boolean).join(' ');
        setFout(reden || tr(lang, 'Збереження заблоковано політикою k-з-n: занадто багато вузлів в одній країні чи платформі.', 'Opslaan geblokkeerd door het k-van-n-beleid: te veel knopen in één land of platform.'));
      } else {
        setFout(tr(lang, 'Не вдалося додати вузол. Перевірте введені дані.', 'Knoop toevoegen is mislukt. Controleer de ingevoerde velden.'));
      }
    } finally {
      setBezig('');
    }
  };

  const knoopVerwijderen = async (k: KnoopItem) => {
    setBezig(`del-${k.id}`);
    setFout('');
    setMelding('');
    try {
      const r = (await api.delete(`/api/owner/verdeelde-opslag/knoop/${encodeURIComponent(k.id)}`, context)).data as { overzicht: OverzichtData };
      setOverzicht(r.overzicht);
      setMelding(tr(lang, `Вузол «${k.naam}» видалено з реєстру.`, `Knoop «${k.naam}» uit het register verwijderd.`));
    } catch {
      setFout(tr(lang, 'Не вдалося видалити вузол.', 'Knoop verwijderen is mislukt.'));
    } finally {
      setBezig('');
    }
  };

  const controleerIntegriteit = async () => {
    setBezig('controleer');
    setFout('');
    setMelding('');
    try {
      const r = (await api.post('/api/owner/verdeelde-opslag/controleer', {
        ...context,
        drempelK,
        aantalDelen,
      })).data as { gecontroleerd: number; gezond: number; waarschuwingen: number; fouten: number; overzicht: OverzichtData };
      setOverzicht(r.overzicht);
      setMelding(tr(
        lang,
        `Перевірку без збирання ключа завершено: перевірено ${r.gecontroleerd}, справних ${r.gezond}, попереджень ${r.waarschuwingen}, помилок ${r.fouten}.`,
        `Integriteitscontrole zonder sleutelsamenstelling voltooid: ${r.gecontroleerd} gecontroleerd, ${r.gezond} gezond, ${r.waarschuwingen} waarschuwingen, ${r.fouten} fouten.`,
      ));
    } catch {
      setFout(tr(lang, 'Перевірка цілісності не вдалася.', 'Integriteitscontrole is mislukt.'));
    } finally {
      setBezig('');
    }
  };

  const startOefenHerstel = async () => {
    setBezig('oefen');
    setFout('');
    setMelding('');
    try {
      const r = (await api.post('/api/owner/verdeelde-opslag/oefen-herstel', {
        ...context,
        drempelK,
        aantalDelen,
      })).data as { test: OefenHerstelResultaat; overzicht: OverzichtData };
      setOverzicht(r.overzicht);
      setLaatsteOefening(r.test);
      setMelding(lang === 'nl' ? r.test.samenvattingNl : r.test.samenvattingUk);
    } catch {
      setFout(tr(lang, 'Не вдалося виконати навчальне відновлення й ротацію.', 'Oefenherstel en rotatie konden niet worden uitgevoerd.'));
    } finally {
      setBezig('');
    }
  };

  const downloadManifest = async () => {
    setBezig('manifest');
    setFout('');
    setMelding('');
    try {
      const doc = (await api.get('/api/owner/verdeelde-opslag/manifest', {
        ...context,
        drempelK,
        aantalDelen,
      })).data;
      const tekstJson = JSON.stringify(doc, null, 2) + '\n';
      const blob = new Blob([tekstJson], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'VERDEELDE-OPSLAG-MANIFEST.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMelding(tr(lang, 'Очищений файл VERDEELDE-OPSLAG-MANIFEST.json завантажено (без таємниць і часток).', 'Geschoond bestand VERDEELDE-OPSLAG-MANIFEST.json gedownload (zonder geheimen of delen).'));
    } catch {
      setFout(tr(lang, 'Не вдалося сформувати маніфест JSON.', 'Manifest JSON kon niet worden samengesteld.'));
    } finally {
      setBezig('');
    }
  };

  const kleur: OverzichtKleur = overzicht?.kleur ?? 'geel';
  const landenEntries = Object.entries(overzicht?.perLand || {});
  const platformEntries = Object.entries(overzicht?.perPlatform || {});

  return (
    <section
      className='ut-kaart ut-vo-kaart'
      id='ut-verdeelde-opslag-anker'
      data-ut-verdeelde-opslag
      aria-labelledby='ut-vo-titel'
    >
      <header className='ut-kaart-kop'>
        <div>
          <h2 id='ut-vo-titel'>
            <HardDrive aria-hidden='true' />{' '}
            {tr(lang, 'Розподілене зашифроване зберігання (Шамір k-з-n)', 'Verdeelde versleutelde opslag (Shamir k-van-n)')}
          </h2>
          <p className='ut-sub'>
            {tr(
              lang,
              'Незалежні вузли по різних країнах і платформах (витрати 0 €). У базі зберігаються лише метадані та контрольні суми SHA-256 — жодних сирих часток чи ключів.',
              'Onafhankelijke knopen verspreid over landen en platformen (0 € kosten). In de database staan uitsluitend metadata en SHA-256-controlesommen — nooit ruwe delen of sleutels.',
            )}
          </p>
        </div>
        <button type='button' className='ut-knop' disabled={laadt} onClick={() => void laden(drempelK, aantalDelen)}>
          <RefreshCw aria-hidden='true' className={laadt ? 'spin' : undefined} />
          {tr(lang, 'Оновити', 'Vernieuwen')}
        </button>
      </header>

      <div className='ut-vo-status' data-kleur={kleur} role='status'>
        <div className='ut-vo-status-kop'>
          <span className='ut-vo-licht' data-kleur={kleur} aria-hidden='true' />
          {kleur === 'groen' ? <ShieldCheck aria-hidden='true' /> : kleur === 'geel' ? <AlertTriangle aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
          <strong>{kleurNaam(lang, kleur)}</strong>
          <span className='ut-vo-drempel-badge'>
            {tr(lang, `Поріг ${overzicht?.drempelK ?? drempelK}-з-${overzicht?.aantalDelen ?? aantalDelen}`, `Drempel ${overzicht?.drempelK ?? drempelK}-van-${overzicht?.aantalDelen ?? aantalDelen}`)}
          </span>
        </div>
        <p className='ut-sub'>
          {overzicht
            ? (lang === 'nl' ? overzicht.statusTekstNl : overzicht.statusTekstUk)
            : tr(lang, 'Завантаження стану вузлів…', 'Status van knopen wordt geladen…')}
        </p>
      </div>

      <div className='ut-vo-stat-grid'>
        <div className='ut-sel-stat'>
          <strong>{overzicht?.actiefAantal ?? 0} / {overzicht?.aantalDelen ?? aantalDelen}</strong>
          <span>{tr(lang, 'Активних вузлів', 'Actieve knopen')}</span>
        </div>
        <div className='ut-sel-stat'>
          <strong>{overzicht?.spreiding.uniekeLanden ?? 0}</strong>
          <span>{tr(lang, 'Країн / зон', 'Landen / zones')}</span>
        </div>
        <div className='ut-sel-stat'>
          <strong>{overzicht?.spreiding.uniekeAanbieders ?? 0}</strong>
          <span>{tr(lang, 'Незалежних платформ', 'Onafhankelijke platformen')}</span>
        </div>
        <div className='ut-vo-drempel-keuze'>
          <label>
            <span>{tr(lang, 'Поріг k', 'Drempel k')}</span>
            <input
              type='number'
              min={2}
              max={10}
              value={drempelK}
              onChange={(e) => {
                const k = Math.max(2, Math.min(10, Number(e.target.value) || 2));
                setDrempelK(k);
                if (aantalDelen < k) setAantalDelen(k);
              }}
            />
          </label>
          <label>
            <span>{tr(lang, 'Усього n', 'Totaal n')}</span>
            <input
              type='number'
              min={drempelK}
              max={20}
              value={aantalDelen}
              onChange={(e) => {
                const n = Math.max(drempelK, Math.min(20, Number(e.target.value) || drempelK));
                setAantalDelen(n);
              }}
            />
          </label>
        </div>
      </div>

      {(landenEntries.length > 0 || platformEntries.length > 0) && (
        <div className='ut-vo-dekking'>
          <div className='ut-vo-dekking-rij'>
            <span className='ut-sub'><Globe aria-hidden='true' /> {tr(lang, 'Країни:', 'Landen:')}</span>
            {landenEntries.map(([land, tel]) => (
              <span key={land} className='ut-3f-pill' data-ok={tel < (overzicht?.drempelK ?? drempelK)}>
                <span>{land} ×{tel}</span>
              </span>
            ))}
          </div>
          <div className='ut-vo-dekking-rij'>
            <span className='ut-sub'>{tr(lang, 'Платформи:', 'Platformen:')}</span>
            {platformEntries.map(([plat, tel]) => (
              <span key={plat} className='ut-3f-pill' data-ok={tel < (overzicht?.drempelK ?? drempelK)}>
                <span>{plat} ×{tel}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {overzicht && overzicht.spreiding.fouten.length > 0 && (
        <ul className='ut-vo-waarschuwingen' role='alert'>
          {overzicht.spreiding.fouten.map((f) => (
            <li key={f.code}>{lang === 'nl' ? f.nl : f.uk}</li>
          ))}
        </ul>
      )}

      {fout && <p className='ut-fout' role='alert'>{fout}</p>}
      {melding && <p className='ut-ok-tekst' role='status'>{melding}</p>}

      <div className='ut-acties'>
        <button
          type='button'
          className='ut-knop ut-knop-primair'
          disabled={Boolean(bezig)}
          onClick={() => void controleerIntegriteit()}
        >
          <ShieldCheck aria-hidden='true' />
          {tr(lang, 'Перевірити цілісність без збирання ключа', 'Integriteit controleren zonder sleutel samen te stellen')}
        </button>
        <button
          type='button'
          className='ut-knop'
          disabled={Boolean(bezig)}
          onClick={() => void startOefenHerstel()}
        >
          <RotateCw aria-hidden='true' />
          {tr(lang, 'Навчальне відновлення й ротація', 'Oefenherstel en rotatie')}
        </button>
        <button
          type='button'
          className='ut-knop'
          disabled={Boolean(bezig)}
          onClick={() => void downloadManifest()}
        >
          <Download aria-hidden='true' />
          {tr(lang, 'Завантажити маніфест JSON', 'Manifest JSON downloaden')}
        </button>
      </div>

      {laatsteOefening && (
        <div className='ut-vo-oefen' data-geslaagd={laatsteOefening.geslaagd}>
          <div className='ut-3f-eenmalig-kop'>
            <strong>
              {tr(
                lang,
                `Результат навчального відновлення ${laatsteOefening.drempelK}-з-${laatsteOefening.aantalDelen}`,
                `Resultaat oefenherstel ${laatsteOefening.drempelK}-van-${laatsteOefening.aantalDelen}`,
              )}
            </strong>
            <span className='ut-mono ut-3f-prefix'>SHA-256: {laatsteOefening.oorspronkelijkSha256.slice(0, 16)}…</span>
          </div>
          <ul className='ut-vo-stappen'>
            {laatsteOefening.stappen.map((s) => (
              <li key={s.stap} data-ok={s.ok}>
                {s.ok ? <CheckCircle2 aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
                <span>{lang === 'nl' ? s.nl : s.uk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className='ut-3f-form' data-ut-vo-form>
        <h3>{tr(lang, 'Додати незалежний вузол зберігання', 'Onafhankelijke opslagknoop toevoegen')}</h3>
        <div className='ut-3f-grid'>
          <label>
            <span>{tr(lang, 'Назва вузла', 'Naam van de knoop')}</span>
            <input
              type='text'
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              maxLength={120}
              placeholder={tr(lang, 'Наприклад: Диск R:\\ або S3 Німеччина', 'Bijv.: R:\\-schijf of S3 Duitsland')}
            />
          </label>
          <label>
            <span>{tr(lang, 'Тип вузла', 'Soort knoop')}</span>
            <select data-hulp-vrij='keuze' value={soort} onChange={(e) => setSoort(e.target.value as KnoopSoort)}>
              {SOORT_OPTIES.map((o) => (
                <option key={o.waarde} value={o.waarde}>{lang === 'nl' ? o.nl : o.uk}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{tr(lang, 'Код країни / зони', 'Landcode / zone')}</span>
            <input
              type='text'
              value={landCode}
              onChange={(e) => setLandCode(e.target.value.toUpperCase())}
              maxLength={16}
              placeholder='NL, DE, CH, UA, OFFLINE'
            />
          </label>
          <label>
            <span>{tr(lang, 'Платформа / постачальник', 'Platform / aanbieder')}</span>
            <input
              type='text'
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              maxLength={80}
              placeholder={tr(lang, 'Наприклад: eigen-pc, hetzner, nextcloud-ch', 'Bijv.: eigen-pc, hetzner, nextcloud-ch')}
            />
          </label>
          <label>
            <span>{tr(lang, 'Підказка розташування (без паролів)', 'Bestemmingshint (zonder geheimen)')}</span>
            <input
              type='text'
              value={bestemmingHint}
              onChange={(e) => setBestemmingHint(e.target.value)}
              maxLength={240}
              placeholder={tr(lang, 'Наприклад: R:\\mijn-ruimte-reservekopie\\verdeeld', 'Bijv.: R:\\mijn-ruimte-reservekopie\\verdeeld')}
            />
          </label>
          <label>
            <span>{tr(lang, 'SHA-256 останньої частки (необов’язково)', 'SHA-256 van het laatste deel (optioneel)')}</span>
            <input
              type='text'
              value={laatsteSha256}
              onChange={(e) => setLaatsteSha256(e.target.value)}
              maxLength={64}
              placeholder='64 hex…'
            />
          </label>
        </div>
        <div className='ut-acties'>
          <button
            type='button'
            className='ut-knop ut-knop-primair'
            disabled={bezig === 'toevoegen'}
            onClick={() => void knoopToevoegen()}
          >
            <Plus aria-hidden='true' />
            {tr(lang, 'Додати вузол із перевіркою k-з-n', 'Knoop toevoegen met k-van-n-controle')}
          </button>
        </div>
      </div>

      <ul className='ut-3f-lijst' data-ut-vo-knopen={overzicht?.knopen.length ?? 0}>
        {(!overzicht || overzicht.knopen.length === 0) && (
          <li className='ut-leeg'>
            {tr(
              lang,
              'Вузлів розподіленого зберігання ще не додано. Додайте щонайменше 3–5 незалежних майданчиків у різних країнах.',
              'Nog geen knopen voor verdeelde opslag toegevoegd. Voeg minstens 3–5 onafhankelijke locaties in verschillende landen toe.',
            )}
          </li>
        )}
        {(overzicht?.knopen || []).map((k) => (
          <li key={k.id} className='ut-3f-item' data-status={k.actief ? 'actief' : 'ingetrokken'}>
            <div className='ut-3f-item-kop'>
              <div>
                <strong>{k.naam}</strong>
                <span className='ut-3f-pill' data-ok='true'>{k.landCode}</span>
                <span className='ut-3f-pill' data-ok='true'>{soortNaam(lang, k.soort)}</span>
                <i className='ut-badge' data-staat={knoopStatusBadge(k.status)}>
                  {knoopStatusNaam(lang, k.status)}
                </i>
              </div>
              <button
                type='button'
                className='ut-knop ut-knop-gevaar'
                disabled={Boolean(bezig)}
                onClick={() => void knoopVerwijderen(k)}
              >
                <Trash2 aria-hidden='true' />
                {tr(lang, 'Видалити', 'Verwijderen')}
              </button>
            </div>
            <div className='ut-vo-meta'>
              <span>{tr(lang, 'Платформа:', 'Platform:')} <b>{k.platform}</b></span>
              {k.bestemmingHint && <span>{tr(lang, 'Місце:', 'Locatie:')} <code>{k.bestemmingHint}</code></span>}
              {k.laatsteSha256 && <span>SHA-256: <code className='ut-mono'>{k.laatsteSha256.slice(0, 16)}…</code></span>}
              {k.laatsteControleOp && <span>{tr(lang, 'Перевірено:', 'Gecontroleerd:')} {datum(lang, k.laatsteControleOp)}</span>}
            </div>
          </li>
        ))}
      </ul>

      {overzicht && overzicht.rotaties.length > 0 && (
        <details className='ut-sel-details'>
          <summary>
            {tr(lang, `Журнал перевірок і ротацій (${overzicht.rotaties.length})`, `Logboek van controles en rotaties (${overzicht.rotaties.length})`)}
          </summary>
          <ul className='ut-vo-rotaties'>
            {overzicht.rotaties.map((r) => (
              <li key={r.id}>
                <i className='ut-badge' data-staat={r.geslaagd ? 'klaar' : 'afgebroken'}>
                  {rotatieSoortNaam(lang, r.soort)}
                </i>
                <span className='ut-mono'>{r.drempelK}-з-{r.aantalDelen}</span>
                <span>{r.samenvatting}</span>
                <small className='ut-sub'>{datum(lang, r.uitgevoerdOp)}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
