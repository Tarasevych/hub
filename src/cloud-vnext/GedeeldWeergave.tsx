// GedeeldWeergave (CLOUD-001, https://cloud.tarasevych.com/gedeeld/<code>):
// Publieke en accountgebonden ontvangersweergave voor gedeelde mappen, bestanden, archiefselecties én exacte bestandsdelen
// (regelbereik met regelnummers, uitgesneden pdf-pagina's of bytebereik). Toont nette toegangsschermen bij wachtwoord,
// vereist geregistreerd account, geplande start, pauze, verlopen termijn of intrekking.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowLeft, CalendarClock, Check, Copy, Download, ExternalLink, Eye, FileText,
  Folder, FolderArchive, Globe, KeyRound, LoaderCircle, Lock, Scissors, Search, ShieldAlert,
  UserCheck,
} from 'lucide-react';
import type { CloudArchiefIngang, CloudSoort } from '../../shared/cloud-vnext-model';
import type { MailAttachmentPreview } from '../MailBijlageVoorbeeld';
import { CloudFout, cloudClient, type GedeeldInfoUit, type GedeeldInhoudUit } from './cloud-client';
import { kopieerNaarKlembord } from './DeelVenster';
import { SOORT_ICOON, bewaarBlob, cloudFoutTekst, vanB64 } from './hulp';
import { MaquetteHeld, useIsKlassiekMaquette, type MaquetteHeldStatistiek } from '../maquette-kern';
import { isKlassiekPalet, leesKeuze } from '../thema/kern';
import { useIsMaquette, useThemaStand } from '../thema/useThema';
import { bytesTekst, datumTekst, foutTekst, tr, type Lang } from './tekst';
import './cloud-vnext.css';
import './cloud-vnext-delen.css';
import './cloud-delen-maquette.css';

const PreviewBody = lazy(() => import('../MailBijlageVoorbeeld').then((m) => ({ default: m.MailAttachmentPreviewBody })));
const voorbeeldMotor = () => import('../MailBijlageVoorbeeld');

type Props = {
  code: string;
  lang: Lang;
  aangemeldEmail: string;
  onAanmelden: () => void;
  onNaarBestanden: () => void;
  onSluitKoppeling: () => void;
};

type PoortStaat =
  | { soort: 'laden' }
  | { soort: 'wachtwoord'; naam: string; foutMelding: string }
  | { soort: 'account_vereist'; naam: string }
  | { soort: 'account_geweigerd'; aangemeldEmail: string }
  | { soort: 'nog_niet_actief'; naam: string; actiefVanaf: string | null }
  | { soort: 'gesloten'; code: string; melding: string }
  | { soort: 'open'; info: GedeeldInfoUit };

export default function GedeeldWeergave({ code, lang, aangemeldEmail, onAanmelden, onNaarBestanden, onSluitKoppeling }: Props) {
  const isMaquette = useIsMaquette();
  const isKlassiek = useIsKlassiekMaquette();
  const themaStand = useThemaStand();
  const toonStudioHeld = isMaquette && !isKlassiek;
  const [poort, setPoort] = useState<PoortStaat>({ soort: 'laden' });

  useEffect(() => {
    if (typeof document === 'undefined' || document.documentElement.dataset.maquetteStijl) return;
    const wortel = document.documentElement;
    const gekozenPalet = leesKeuze(themaStand.theme, themaStand.palet).palet;
    if (isKlassiekPalet(gekozenPalet)) {
      wortel.classList.remove('palet-klassiek-wit', 'palet-klassiek-zwart');
      wortel.classList.add(`palet-${gekozenPalet}`, 'palet-maquette');
      wortel.dataset.maquetteStijl = 'klassiek';
    } else if (wortel.classList.contains('palet-klassiek-wit') || wortel.classList.contains('palet-klassiek-zwart')) {
      wortel.classList.add('palet-maquette');
      wortel.dataset.maquetteStijl = 'klassiek';
    } else if (gekozenPalet === 'maquette' || wortel.classList.contains('palet-maquette')) {
      wortel.classList.add('palet-maquette');
      wortel.dataset.maquetteStijl = 'studio';
    }
  }, [themaStand.theme, themaStand.palet]);
  const [wachtwoord, setWachtwoord] = useState('');
  const [wachtwoordInvoer, setWachtwoordInvoer] = useState('');

  // Inhoud & navigatie voor map / selectie / archief / bestand
  const [huidigeMapId, setHuidigeMapId] = useState<string | null>(null);
  const [zoek, setZoek] = useState('');
  const [gekozenItem, setGekozenItem] = useState<{ bestandId?: string; archiefPad?: string; label: string } | null>(null);
  const [inhoud, setInhoud] = useState<GedeeldInhoudUit | null>(null);
  const [voorbeeld, setVoorbeeld] = useState<MailAttachmentPreview | null>(null);
  const [inhoudLaden, setInhoudLaden] = useState(false);
  const [actieBezig, setActieBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [tekstGekopieerd, setTekstGekopieerd] = useState(false);

  const laadInfo = useCallback(async (ww: string, telWeergave = true) => {
    setPoort({ soort: 'laden' });
    setFout('');
    try {
      const info = await cloudClient.gedeeldInfo(code, { ...(ww ? { wachtwoord: ww } : {}), telWeergave });
      setWachtwoord(ww);
      setPoort({ soort: 'open', info });
    } catch (e) {
      if (e instanceof CloudFout) {
        const extra = (e.data && typeof e.data === 'object' ? (e.data as Record<string, unknown>) : {}) || {};
        if (e.code === 'WACHTWOORD_VEREIST' || e.code === 'WACHTWOORD_ONJUIST') {
          setPoort({
            soort: 'wachtwoord',
            naam: String(extra.naam || ''),
            foutMelding: e.code === 'WACHTWOORD_ONJUIST' ? foutTekst(lang, 'WACHTWOORD_ONJUIST') : '',
          });
          return;
        }
        if (e.code === 'ACCOUNT_VEREIST') {
          setPoort({ soort: 'account_vereist', naam: String(extra.naam || '') });
          return;
        }
        if (e.code === 'ACCOUNT_GEWEIGERD') {
          setPoort({ soort: 'account_geweigerd', aangemeldEmail: String(extra.aangemeldEmail || aangemeldEmail || '') });
          return;
        }
        if (e.code === 'KOPPELING_NOG_NIET_ACTIEF') {
          setPoort({
            soort: 'nog_niet_actief',
            naam: String(extra.naam || ''),
            actiefVanaf: extra.actiefVanaf ? String(extra.actiefVanaf) : null,
          });
          return;
        }
        setPoort({ soort: 'gesloten', code: e.code, melding: foutTekst(lang, e.code) });
        return;
      }
      setPoort({ soort: 'gesloten', code: 'FOUT', melding: cloudFoutTekst(lang, e) });
    }
  }, [code, lang, aangemeldEmail]);

  useEffect(() => {
    setHuidigeMapId(null);
    setGekozenItem(null);
    setInhoud(null);
    void laadInfo('', true);
  }, [code, aangemeldEmail, laadInfo]);

  // Laad automatisch de voorvertoning wanneer het doel één bestand of een bestandsdeel is, of wanneer de gebruiker in een map klikt
  useEffect(() => {
    if (poort.soort !== 'open') return;
    const { doelSoort } = poort.info.koppeling;
    const enkel = doelSoort === 'bestand' || doelSoort === 'bestand_deel';
    if (!enkel && !gekozenItem) {
      setInhoud(null);
      setVoorbeeld(null);
      return;
    }
    if (doelSoort === 'bestand' && poort.info.bestand && poort.info.bestand.bytes > 32 * 1024 * 1024) {
      setInhoud(null);
      setVoorbeeld(null);
      return;
    }

    let actief = true;
    let geladenPreview: MailAttachmentPreview | null = null;
    setInhoudLaden(true);
    setFout('');
    (async () => {
      try {
        const uit = await cloudClient.gedeeldInhoud(code, {
          ...(wachtwoord ? { wachtwoord } : {}),
          ...(gekozenItem?.bestandId ? { bestandId: gekozenItem.bestandId } : {}),
          ...(gekozenItem?.archiefPad ? { archiefPad: gekozenItem.archiefPad } : {}),
        });
        if (!actief) return;
        setInhoud(uit);
        if (uit.tekst === undefined && uit.data !== undefined && !uit.url) {
          const motor = await voorbeeldMotor();
          const blob = new Blob([vanB64(uit.data) as unknown as BlobPart], { type: uit.mime || 'application/octet-stream' });
          const p = await motor.loadMailAttachmentPreviewFromBlob({
            blob,
            filename: uit.naam,
            contentType: uit.mime || 'application/octet-stream',
          });
          if (!actief) { motor.revokeMailAttachmentPreview(p); return; }
          geladenPreview = p;
          setVoorbeeld(p);
        } else {
          setVoorbeeld(null);
        }
      } catch (e) {
        if (actief) setFout(cloudFoutTekst(lang, e));
      } finally {
        if (actief) setInhoudLaden(false);
      }
    })();

    return () => {
      actief = false;
      if (geladenPreview) {
        const p = geladenPreview;
        void voorbeeldMotor().then((m) => m.revokeMailAttachmentPreview(p));
      }
    };
  }, [poort, code, wachtwoord, gekozenItem, lang]);

  const startDownload = async (opties: { bestandId?: string; archiefPad?: string; allesZip?: boolean } = {}) => {
    setActieBezig(true);
    setFout('');
    try {
      const d = await cloudClient.gedeeldDownload(code, {
        ...(wachtwoord ? { wachtwoord } : {}),
        ...opties,
      });
      bewaarBlob(d.naam, new Blob([vanB64(d.data) as unknown as BlobPart], { type: d.mime || 'application/octet-stream' }));
      // Werk de teller stil bij zonder extra weergave te tellen
      if (poort.soort === 'open') {
        void cloudClient.gedeeldInfo(code, { ...(wachtwoord ? { wachtwoord } : {}), telWeergave: false })
          .then((fris) => setPoort({ soort: 'open', info: fris }))
          .catch(() => undefined);
      }
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setActieBezig(false);
    }
  };

  const deelBereikOmschrijving = useMemo(() => {
    if (poort.soort !== 'open') return '';
    const { koppeling, deelInfo } = poort.info;
    if (koppeling.doelSoort === 'bestand_deel' && deelInfo) {
      if (deelInfo.deelSoort === 'regels') return tr(lang, `Частина файла · рядки ${deelInfo.vanRegel}–${deelInfo.totRegel}`, `Bestandsdeel · regels ${deelInfo.vanRegel}–${deelInfo.totRegel}`);
      if (deelInfo.deelSoort === 'paginas') return tr(lang, `Частина PDF · сторінки ${deelInfo.vanPagina}–${deelInfo.totPagina}`, `PDF-deel · pagina’s ${deelInfo.vanPagina}–${deelInfo.totPagina}`);
      if (deelInfo.deelSoort === 'bytes') return tr(lang, `Частина файла · байти ${deelInfo.vanByte}–${deelInfo.totByte}`, `Bestandsdeel · bytes ${deelInfo.vanByte}–${deelInfo.totByte}`);
    }
    if (koppeling.doelSoort === 'map') return tr(lang, 'Спільна тека', 'Gedeelde map');
    if (koppeling.doelSoort === 'selectie') return tr(lang, 'Вибірка файлів і тек', 'Gedeelde selectie');
    if (koppeling.doelSoort === 'archief_pad') return tr(lang, 'Вибрані елементи з архіву', 'Gedeelde archiefselectie');
    return tr(lang, 'Спільний файл', 'Gedeeld bestand');
  }, [poort, lang]);

  const poortSchilKlas = isMaquette ? 'cvn cvn-gedeeld-scherm mq-schil' : 'cvn cvn-gedeeld-scherm';
  const openSchilKlas = isMaquette ? 'cvn cvn-gedeeld-weergave mq-schil' : 'cvn cvn-gedeeld-weergave';
  const mqDienstAttr = isMaquette ? ({ 'data-mq-dienst': 'cloud' } as const) : {};

  // ---------------- POORTSCHERMEN ----------------
  if (poort.soort === 'laden') {
    return (
      <section className={poortSchilKlas} aria-busy='true' {...mqDienstAttr}>
        <div className='cvn-gedeeld-poortkaart'>
          <LoaderCircle className='cvn-draai' aria-hidden='true' />
          <h2>{tr(lang, 'Перевіряємо спільне посилання…', 'Gedeelde koppeling controleren…')}</h2>
        </div>
      </section>
    );
  }

  if (poort.soort === 'wachtwoord') {
    return (
      <section className={poortSchilKlas} data-cvn-gedeeld-poort='wachtwoord' {...mqDienstAttr}>
        {toonStudioHeld ? (
          <MaquetteHeld
            lang={lang}
            dienst='cloud'
            modus='volledig'
            bovenregel={tr(lang, 'ХМАРА · ЗАХИЩЕНЕ ПОСИЛАННЯ', 'CLOUD · BEVEILIGDE KOPPELING')}
            titelVoor={tr(lang, 'Спільний простір.', 'Gedeelde ruimte.')}
            titelCursief={poort.naam || tr(lang, 'Вхід за паролем', 'Toegang met wachtwoord')}
            beschrijving={tr(
              lang,
              'Матеріал передано через захищене хмарне посилання. Підтвердьте пароль нижче, щоб переглянути дозволений власником обсяг.',
              'Dit onderdeel wordt gedeeld via een beveiligde cloudkoppeling. Bevestig hieronder het wachtwoord om de vrijgegeven inhoud te openen.',
            )}
            secundair={{ label: tr(lang, 'До хмарного сховища', 'Naar cloudopslag'), onClick: onSluitKoppeling }}
          />
        ) : null}
        <form className='cvn-gedeeld-poortkaart' onSubmit={(e) => { e.preventDefault(); if (wachtwoordInvoer.trim()) void laadInfo(wachtwoordInvoer.trim(), true); }}>
          <span className='cvn-gedeeld-poorticoon'><KeyRound aria-hidden='true' /></span>
          <h2>{poort.naam || tr(lang, 'Захищене посилання', 'Beveiligde koppeling')}</h2>
          <p>{tr(lang, 'Власник захистив цей матеріал паролем. Введіть пароль, щоб переглянути вміст.', 'De eigenaar heeft dit onderdeel beveiligd met een wachtwoord. Voer het wachtwoord in om verder te gaan.')}</p>
          {poort.foutMelding ? <p className='cvn-melding is-fout' role='alert'>{poort.foutMelding}</p> : null}
          <input
            type='password'
            value={wachtwoordInvoer}
            autoFocus
            placeholder={tr(lang, 'Пароль посилання…', 'Wachtwoord…')}
            aria-label={tr(lang, 'Пароль посилання', 'Wachtwoord van koppeling')}
            onChange={(e) => setWachtwoordInvoer(e.target.value)}
          />
          <div className='cvn-deel-hoofdknoppen'>
            <button type='submit' className='cvn-knop is-hoofd'>{tr(lang, 'Відкрити доступ', 'Toegang openen')}</button>
            <button type='button' className='cvn-knop' onClick={onSluitKoppeling}>{tr(lang, 'До хмарного сховища', 'Naar cloudopslag')}</button>
          </div>
        </form>
      </section>
    );
  }

  if (poort.soort === 'account_vereist' || poort.soort === 'account_geweigerd') {
    return (
      <section className={poortSchilKlas} data-cvn-gedeeld-poort={poort.soort} {...mqDienstAttr}>
        {toonStudioHeld ? (
          <MaquetteHeld
            lang={lang}
            dienst='cloud'
            modus='volledig'
            bovenregel={tr(lang, 'ХМАРА · ПЕРСОНАЛЬНИЙ ДОСТУП', 'CLOUD · ACCOUNTTOEGANG')}
            titelVoor={tr(lang, 'Іменний доступ.', 'Persoonlijke toegang.')}
            titelCursief={poort.soort === 'account_vereist' && poort.naam ? poort.naam : tr(lang, 'Перевірка профілю', 'Accountcontrole')}
            beschrijving={tr(
              lang,
              'Власник відкрив цей матеріал лише для визначених зареєстрованих облікових записів.',
              'De eigenaar heeft dit onderdeel uitsluitend vrijgegeven voor aangewezen geregistreerde accounts.',
            )}
            primair={{
              label: poort.soort === 'account_vereist' ? tr(lang, 'Увійти в обліковий запис', 'Aanmelden') : tr(lang, 'Змінити обліковий запис', 'Ander account kiezen'),
              onClick: onAanmelden,
            }}
          />
        ) : null}
        <div className='cvn-gedeeld-poortkaart'>
          <span className='cvn-gedeeld-poorticoon'><UserCheck aria-hidden='true' /></span>
          <h2>{poort.soort === 'account_vereist' && poort.naam ? poort.naam : tr(lang, 'Доступ за зареєстрованим обліковим записом', 'Toegang op geregistreerd account')}</h2>
          <p>
            {poort.soort === 'account_vereist'
              ? tr(lang, 'Власник відкрив цей матеріал для конкретних зареєстрованих облікових записів. Увійдіть, щоб підтвердити вашу адресу.', 'De eigenaar deelt dit onderdeel alleen met specifieke geregistreerde accounts. Meld u aan om door te gaan.')
              : tr(lang, `Поточний обліковий запис (${poort.aangemeldEmail}) не входить до списку отримувачів цього посилання. Перемкніться на потрібний профіль.`, `Het huidige account (${poort.aangemeldEmail}) staat niet bij de ontvangers van deze koppeling. Kies een ander account.`)}
          </p>
          <div className='cvn-deel-hoofdknoppen'>
            <button type='button' className='cvn-knop is-hoofd' onClick={onAanmelden}>
              <UserCheck aria-hidden='true' />{poort.soort === 'account_vereist' ? tr(lang, 'Увійти в обліковий запис', 'Aanmelden') : tr(lang, 'Змінити обліковий запис', 'Ander account kiezen')}
            </button>
            <button type='button' className='cvn-knop' onClick={onSluitKoppeling}>{tr(lang, 'Назад', 'Terug')}</button>
          </div>
        </div>
      </section>
    );
  }

  if (poort.soort === 'nog_niet_actief') {
    return (
      <section className={poortSchilKlas} data-cvn-gedeeld-poort='gepland' {...mqDienstAttr}>
        {toonStudioHeld ? (
          <MaquetteHeld
            lang={lang}
            dienst='cloud'
            modus='compact'
            opslagSleutel='cloud-gedeeld-poort'
            bovenregel={tr(lang, 'ХМАРА · ВІДКЛАДЕНИЙ СТАРТ', 'CLOUD · GEPLANDE START')}
            titelVoor={tr(lang, 'Спільний доступ:', 'Gedeelde toegang:')}
            titelCursief={poort.naam || tr(lang, 'очікує часу відкриття', 'wacht op starttijd')}
            beschrijving={tr(
              lang,
              'Посилання створено власником із відкладеним початком дії.',
              'Deze koppeling is door de eigenaar aangemaakt met een geplande starttijd.',
            )}
          />
        ) : null}
        <div className='cvn-gedeeld-poortkaart'>
          <span className='cvn-gedeeld-poorticoon'><CalendarClock aria-hidden='true' /></span>
          <h2>{poort.naam || tr(lang, 'Доступ заплановано на пізніший час', 'Toegang staat gepland')}</h2>
          <p>
            {poort.actiefVanaf
              ? tr(lang, `Це посилання почне діяти ${datumTekst(lang, poort.actiefVanaf)}.`, `Deze koppeling wordt actief op ${datumTekst(lang, poort.actiefVanaf)}.`)
              : tr(lang, 'Це посилання ще не набуло чинності.', 'Deze koppeling is nog niet actief.')}
          </p>
          <div className='cvn-deel-hoofdknoppen'>
            <button type='button' className='cvn-knop is-hoofd' onClick={() => void laadInfo(wachtwoord, true)}>{tr(lang, 'Перевірити ще раз', 'Opnieuw controleren')}</button>
            <button type='button' className='cvn-knop' onClick={onSluitKoppeling}>{tr(lang, 'До хмарного сховища', 'Naar cloudopslag')}</button>
          </div>
        </div>
      </section>
    );
  }

  if (poort.soort === 'gesloten') {
    return (
      <section className={poortSchilKlas} data-cvn-gedeeld-poort={poort.code} {...mqDienstAttr}>
        {toonStudioHeld ? (
          <MaquetteHeld
            lang={lang}
            dienst='cloud'
            modus='compact'
            opslagSleutel='cloud-gedeeld-poort'
            bovenregel={tr(lang, 'ХМАРА · СТАН ПОСИЛАННЯ', 'CLOUD · KOPPELINGSSTATUS')}
            titelVoor={tr(lang, 'Спільне посилання', 'Gedeelde koppeling')}
            titelCursief={tr(lang, 'завершено', 'gesloten')}
            beschrijving={poort.melding}
          />
        ) : null}
        <div className='cvn-gedeeld-poortkaart'>
          <span className='cvn-gedeeld-poorticoon is-waarschuwing'><ShieldAlert aria-hidden='true' /></span>
          <h2>{tr(lang, 'Посилання недоступне', 'Koppeling niet beschikbaar')}</h2>
          <p>{poort.melding}</p>
          <div className='cvn-deel-hoofdknoppen'>
            <button type='button' className='cvn-knop is-hoofd' onClick={onSluitKoppeling}>{tr(lang, 'Перейти до «Спільного доступу»', 'Naar «Gedeeld»')}</button>
            {aangemeldEmail ? <button type='button' className='cvn-knop' onClick={onNaarBestanden}>{tr(lang, 'Мої файли', 'Mijn bestanden')}</button> : null}
          </div>
        </div>
      </section>
    );
  }

  // ---------------- OPEN WEERGAVE ----------------
  const { info } = poort;
  const { koppeling, bestand, deelInfo, mappen, bestanden, archiefIngangen } = info;
  const magDownloaden = koppeling.rechten === 'downloaden' && (koppeling.maxDownloads === null || koppeling.downloadsAantal < koppeling.maxDownloads);
  const isBoom = koppeling.doelSoort === 'map' || koppeling.doelSoort === 'selectie';
  const isArchief = koppeling.doelSoort === 'archief_pad';
  const zoekLaag = zoek.trim().toLowerCase();

  // Kruimelpad binnen gedeelde map
  const mapKaart = new Map(mappen.map((m) => [m.id, m]));
  const mapKruimels: Array<{ id: string; naam: string }> = [];
  let curMap = huidigeMapId ? mapKaart.get(huidigeMapId) : undefined;
  while (curMap) {
    mapKruimels.unshift({ id: curMap.id, naam: curMap.naam });
    curMap = curMap.ouderId ? mapKaart.get(curMap.ouderId) : undefined;
  }

  const zichtbareMappen = isBoom
    ? mappen.filter((m) => (zoekLaag ? m.naam.toLowerCase().includes(zoekLaag) : m.ouderId === huidigeMapId))
    : [];
  const zichtbareBestanden = isBoom
    ? bestanden.filter((b) => (zoekLaag ? b.pad.toLowerCase().includes(zoekLaag) : b.mapId === huidigeMapId))
    : [];
  const zichtbareArchief = isArchief
    ? archiefIngangen.filter((i) => !i.map && (!zoekLaag || i.pad.toLowerCase().includes(zoekLaag)))
    : [];

  const regelStartNr = deelInfo?.deelSoort === 'regels' && deelInfo.vanRegel ? deelInfo.vanRegel : 1;
  const heldStatistieken: MaquetteHeldStatistiek[] = [
    {
      waarde: koppeling.rechten === 'bekijken' ? tr(lang, 'Лише перегляд', 'Alleen bekijken') : tr(lang, 'Завантаження', 'Downloaden'),
      label: tr(lang, 'права', 'rechten'),
    },
    {
      waarde: koppeling.maxWeergaven ? `${koppeling.weergavenAantal}/${koppeling.maxWeergaven}` : koppeling.weergavenAantal,
      label: tr(lang, 'переглядів', 'weergaven'),
    },
    ...(isBoom
      ? [{ waarde: bestanden.length, label: tr(lang, 'файлів', 'bestanden') }]
      : isArchief
        ? [{ waarde: zichtbareArchief.length, label: tr(lang, 'елементів', 'onderdelen') }]
        : bestand
          ? [{ waarde: bytesTekst(lang, bestand.bytes), label: tr(lang, 'обсяг', 'grootte') }]
          : []),
  ];

  return (
    <section className={openSchilKlas} data-cvn-gedeeld-open={koppeling.doelSoort} {...mqDienstAttr}>
      {toonStudioHeld ? (
        <MaquetteHeld
          lang={lang}
          dienst='cloud'
          modus='compact'
          opslagSleutel='cloud-gedeeld'
          bovenregel={`${tr(lang, 'ХМАРА', 'CLOUD')} · ${deelBereikOmschrijving}`}
          titelVoor={tr(lang, 'Спільний матеріал:', 'Gedeeld onderdeel:')}
          titelCursief={koppeling.naam}
          beschrijving={
            koppeling.notitie
            || tr(
              lang,
              `Надав(ла): ${koppeling.eigenaarNaam}. Відкрито виключно дозволений власником обсяг.`,
              `Gedeeld door ${koppeling.eigenaarNaam}. Uitsluitend de door de eigenaar vrijgegeven omvang wordt getoond.`,
            )
          }
          statistieken={heldStatistieken}
        />
      ) : null}
      {/* BOVENBALK VAN DE GEDEELDE KOPPELING */}
      <header className='cvn-gedeeld-held'>
        <div className='cvn-gedeeld-held-links'>
          <span className='cvn-gedeeld-held-icoon'>
            {koppeling.doelSoort === 'map' || koppeling.doelSoort === 'selectie' ? <Folder aria-hidden='true' /> : koppeling.doelSoort === 'bestand_deel' ? <Scissors aria-hidden='true' /> : koppeling.doelSoort === 'archief_pad' ? <Archive aria-hidden='true' /> : <FileText aria-hidden='true' />}
          </span>
          <div>
            <div className='cvn-gedeeld-held-badges'>
              <span className='cvn-deel-pil'>{deelBereikOmschrijving}</span>
              <span className='cvn-deel-pil'>
                {koppeling.modus === 'accounts' ? <><UserCheck aria-hidden='true' />{tr(lang, 'Персональний доступ', 'Accounttoegang')}</> : <><Globe aria-hidden='true' />{tr(lang, 'Спільне посилання', 'Deellink')}</>}
              </span>
              {koppeling.rechten === 'bekijken' ? (
                <span className='cvn-deel-pil'><Lock aria-hidden='true' />{tr(lang, 'Лише перегляд', 'Alleen bekijken')}</span>
              ) : null}
            </div>
            <h2>{koppeling.naam}</h2>
            <p className='cvn-gedeeld-held-meta'>
              <span>{tr(lang, `Надав(ла): ${koppeling.eigenaarNaam}`, `Gedeeld door: ${koppeling.eigenaarNaam}`)}</span>
              {koppeling.verlooptOp ? <span>· {tr(lang, `Діє до ${datumTekst(lang, koppeling.verlooptOp)}`, `Geldig tot ${datumTekst(lang, koppeling.verlooptOp)}`)}</span> : null}
              <span>· <Eye aria-hidden='true' /> {koppeling.weergavenAantal}{koppeling.maxWeergaven ? `/${koppeling.maxWeergaven}` : ''}</span>
            </p>
            {koppeling.notitie ? <p className='cvn-gedeeld-held-notitie'>{koppeling.notitie}</p> : null}
          </div>
        </div>

        <div className='cvn-gedeeld-held-acties'>
          {magDownloaden ? (
            isBoom || isArchief ? (
              <button type='button' className='cvn-knop is-hoofd' data-cvn-gedeeld-download='zip' disabled={actieBezig} onClick={() => void startDownload({ allesZip: true })}>
                <FolderArchive aria-hidden='true' />{tr(lang, 'Завантажити все (.zip)', 'Alles downloaden (.zip)')}
              </button>
            ) : (
              <button type='button' className='cvn-knop is-hoofd' data-cvn-gedeeld-download='enkel' disabled={actieBezig} onClick={() => void startDownload()}>
                <Download aria-hidden='true' />
                {koppeling.doelSoort === 'bestand_deel' ? tr(lang, 'Завантажити дозволену частину', 'Toegestaan deel downloaden') : tr(lang, 'Завантажити файл', 'Bestand downloaden')}
              </button>
            )
          ) : null}
          {aangemeldEmail ? (
            <button type='button' className='cvn-knop' onClick={onSluitKoppeling}>
              <ArrowLeft aria-hidden='true' />{tr(lang, 'До мого простору', 'Naar mijn cloud')}
            </button>
          ) : null}
        </div>
      </header>

      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}

      {/* BOOM- OF ARCHIEFVERKENNER */}
      {isBoom || isArchief ? (
        <div className='cvn-gedeeld-werkruimte'>
          <div className='cvn-gedeeld-kolom'>
            <div className='cvn-werkbalk'>
              {isBoom ? (
                <nav className='cvn-kruimels' aria-label={tr(lang, 'Шлях у спільній теці', 'Pad in gedeelde map')}>
                  <button type='button' className={`cvn-kruimel${!huidigeMapId ? ' is-hier' : ''}`} onClick={() => setHuidigeMapId(null)}>
                    {koppeling.doelNaam}
                  </button>
                  {mapKruimels.map((m) => (
                    <span key={m.id} className='cvn-kruimel-paar'>
                      <span aria-hidden='true'>/</span>
                      <button type='button' className={`cvn-kruimel${huidigeMapId === m.id ? ' is-hier' : ''}`} onClick={() => setHuidigeMapId(m.id)}>
                        {m.naam}
                      </button>
                    </span>
                  ))}
                </nav>
              ) : (
                <strong>{bestand?.naam || koppeling.doelNaam}</strong>
              )}
              <div className='cvn-zoekveld'>
                <Search aria-hidden='true' />
                <input
                  type='search'
                  value={zoek}
                  placeholder={tr(lang, 'Пошук серед відкритих файлів…', 'Zoek in gedeelde bestanden…')}
                  aria-label={tr(lang, 'Пошук серед відкритих файлів', 'Zoek in gedeelde bestanden')}
                  onChange={(e) => setZoek(e.target.value)}
                />
              </div>
            </div>

            {zichtbareMappen.length ? (
              <ul className='cvn-mappen' role='list'>
                {zichtbareMappen.map((m) => (
                  <li key={m.id}>
                    <button type='button' className='cvn-map' onClick={() => { setZoek(''); setHuidigeMapId(m.id); }}>
                      <Folder aria-hidden='true' /><span className='cvn-map-naam'>{m.naam}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className='cvn-gedeeld-bestandenlijst' role='list'>
              {isBoom ? zichtbareBestanden.map((b) => {
                const Icoon = SOORT_ICOON[b.soort as CloudSoort] || FileText;
                const geselecteerd = gekozenItem?.bestandId === b.id;
                return (
                  <div key={b.id} className={`cvn-gedeeld-bestandrij${geselecteerd ? ' is-actief' : ''}`} role='listitem'>
                    <button type='button' className='cvn-gedeeld-bestandknop' onClick={() => setGekozenItem({ bestandId: b.id, label: b.naam })}>
                      <Icoon aria-hidden='true' />
                      <span>{zoekLaag ? b.pad : b.naam}</span>
                      <small>{bytesTekst(lang, b.bytes)}</small>
                    </button>
                    {magDownloaden ? (
                      <button type='button' className='cvn-knop is-klein' disabled={actieBezig} onClick={() => void startDownload({ bestandId: b.id })}>
                        <Download aria-hidden='true' />{tr(lang, 'Завантажити', 'Downloaden')}
                      </button>
                    ) : null}
                  </div>
                );
              }) : zichtbareArchief.map((ing: CloudArchiefIngang) => {
                const Icoon = SOORT_ICOON[ing.soort] || FileText;
                const geselecteerd = gekozenItem?.archiefPad === ing.pad;
                return (
                  <div key={ing.pad} className={`cvn-gedeeld-bestandrij${geselecteerd ? ' is-actief' : ''}`} role='listitem'>
                    <button type='button' className='cvn-gedeeld-bestandknop' onClick={() => setGekozenItem({ archiefPad: ing.pad, label: ing.naam })}>
                      <Icoon aria-hidden='true' />
                      <span>{ing.pad}</span>
                      <small>{bytesTekst(lang, ing.bytes)}</small>
                    </button>
                    {magDownloaden ? (
                      <button type='button' className='cvn-knop is-klein' disabled={actieBezig} onClick={() => void startDownload({ archiefPad: ing.pad })}>
                        <Download aria-hidden='true' />{tr(lang, 'Завантажити', 'Downloaden')}
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {!zichtbareMappen.length && !zichtbareBestanden.length && !zichtbareArchief.length ? (
                <p className='cvn-hint'>{tr(lang, 'У цій частині немає файлів за обраним запитом.', 'Geen bestanden gevonden in deze weergave.')}</p>
              ) : null}
            </div>
          </div>

          {/* RECHTER VOORBEELDKOLOM BIJ KEUZE */}
          {gekozenItem ? (
            <aside className='cvn-gedeeld-voorbeeldpaneel' aria-label={tr(lang, 'Перегляд обраного файла', 'Voorvertoning van gekozen bestand')}>
              <header className='cvn-gedeeld-voorbeeldkop'>
                <strong>{gekozenItem.label}</strong>
                <button type='button' className='cvn-knop is-klein' onClick={() => setGekozenItem(null)}>{tr(lang, 'Закрити', 'Sluiten')}</button>
              </header>
              <InhoudWeergaveBlok
                lang={lang}
                laden={inhoudLaden}
                inhoud={inhoud}
                voorbeeld={voorbeeld}
                regelStartNr={1}
                tekstGekopieerd={tekstGekopieerd}
                onKopieerTekst={async (t) => { if (await kopieerNaarKlembord(t)) { setTekstGekopieerd(true); window.setTimeout(() => setTekstGekopieerd(false), 2000); } }}
              />
            </aside>
          ) : null}
        </div>
      ) : (
        /* ENKEL BESTAND OF BESTANDSDEEL */
        <div className='cvn-deel-kaart'>
          {bestand?.url && /^https?:\/\//i.test(bestand.url) ? (
            <p className='cvn-hint'>
              <a href={bestand.url} target='_blank' rel='noreferrer noopener'><ExternalLink aria-hidden='true' /> {bestand.url}</a>
            </p>
          ) : null}
          {bestand && koppeling.doelSoort === 'bestand' && bestand.bytes > 32 * 1024 * 1024 ? (
            <p className='cvn-melding is-info'>
              {tr(lang, `Файл (${bytesTekst(lang, bestand.bytes)}) завеликий для вбудованого перегляду в оглядачі.`, `Dit bestand (${bytesTekst(lang, bestand.bytes)}) is te groot voor voorvertoning in de browser.`)}
            </p>
          ) : (
            <InhoudWeergaveBlok
              lang={lang}
              laden={inhoudLaden}
              inhoud={inhoud}
              voorbeeld={voorbeeld}
              regelStartNr={regelStartNr}
              tekstGekopieerd={tekstGekopieerd}
              onKopieerTekst={async (t) => { if (await kopieerNaarKlembord(t)) { setTekstGekopieerd(true); window.setTimeout(() => setTekstGekopieerd(false), 2000); } }}
            />
          )}
        </div>
      )}
    </section>
  );
}

function InhoudWeergaveBlok({
  lang, laden, inhoud, voorbeeld, regelStartNr, tekstGekopieerd, onKopieerTekst,
}: {
  lang: Lang;
  laden: boolean;
  inhoud: GedeeldInhoudUit | null;
  voorbeeld: MailAttachmentPreview | null;
  regelStartNr: number;
  tekstGekopieerd: boolean;
  onKopieerTekst: (tekst: string) => void;
}) {
  if (laden) {
    return <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Завантажуємо дозволений вміст…', 'Toegestane inhoud laden…')}</p>;
  }
  if (!inhoud) return null;

  if (inhoud.tekst !== undefined) {
    const regels = inhoud.tekst.replace(/\r\n/g, '\n').split('\n');
    return (
      <div className='cvn-gedeeld-codeblok' data-cvn-gedeeld-tekst=''>
        <div className='cvn-gedeeld-codekop'>
          <span>{inhoud.naam} · {bytesTekst(lang, inhoud.bytes)}</span>
          <button type='button' className='cvn-knop is-klein' onClick={() => onKopieerTekst(inhoud.tekst || '')}>
            {tekstGekopieerd ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
            {tekstGekopieerd ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Скопіювати текст', 'Tekst kopiëren')}
          </button>
        </div>
        <div className='cvn-deel-code-voorbeeld is-groot'>
          {regels.map((r, i) => (
            <div key={regelStartNr + i} className='cvn-deel-code-regel'>
              <i>{regelStartNr + i}</i>
              <code>{r || ' '}</code>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (voorbeeld) {
    return (
      <Suspense fallback={<p className='cvn-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>
        <PreviewBody preview={voorbeeld} lang={lang} />
      </Suspense>
    );
  }

  return (
    <p className='cvn-hint'>
      {tr(lang, `Двійковий фрагмент «${inhoud.naam}» (${bytesTekst(lang, inhoud.bytes)}, SHA-256: ${inhoud.sha256.slice(0, 16)}…).`, `Binair onderdeel «${inhoud.naam}» (${bytesTekst(lang, inhoud.bytes)}, SHA-256: ${inhoud.sha256.slice(0, 16)}…).`)}
    </p>
  );
}
