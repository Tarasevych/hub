// «Спільний доступ · Gedeeld» (CLOUD-001, https://cloud.tarasevych.com/gedeeld):
// Centraal overzicht en beheer van alle aangemaakte deellinks, gedetailleerde weergave- en downloadstatistieken per link
// (14-daagse grafiek + gebeurtenissenlog), bewerken van naam/termijn/rechten/wachtwoord, pauzeren, intrekken én het tabblad
// «Відкриті для мене · Met mij gedeeld» voor onderdelen die andere geregistreerde accounts met u deelden.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, BarChart3, CalendarClock, Check, Copy, Download, ExternalLink, Eye,
  FileText, Folder, FolderOpen, Globe, KeyRound, Link2, LoaderCircle, Pause, Play, QrCode,
  RefreshCw, RotateCcw, Scissors, Search, Share2, Trash2, UserCheck, Users,
} from 'lucide-react';
import {
  CLOUD_VNEXT_LIMIETEN, schoneNaam,
  type CloudDeelDagStat, type CloudDeelDoelSoort, type CloudDeelGebeurtenis,
  type CloudDeelKoppeling, type CloudDeelRechten, type CloudGedeeldMetMij,
} from '../../../shared/cloud-vnext-model';
import { cloudClient, type DelenOverzichtUit } from '../cloud-client';
import type { OnderdeelProps } from '../CloudPagina';
import { DeelQrSvg, isoNaarLokaalInvoer, kopieerNaarKlembord, lokaalInvoerNaarIso, statusLabel } from '../DeelVenster';
import { cloudFoutTekst } from '../hulp';
import Laag from '../Laag';
import { datumTekst, geledenTekst, tr, type Lang } from '../tekst';
import '../cloud-delen-maquette.css';

type SubTab = 'mijn' | 'met-mij';
type FilterStand = 'alle' | 'actief' | 'accounts' | 'termijn' | 'gepauzeerd' | 'ingetrokken';

function doelSoortIcoon(soort: CloudDeelDoelSoort) {
  if (soort === 'map') return Folder;
  if (soort === 'bestand_deel') return Scissors;
  if (soort === 'archief_pad') return Archive;
  if (soort === 'selectie') return FolderOpen;
  return FileText;
}

function doelSoortTekst(lang: Lang, soort: CloudDeelDoelSoort): string {
  switch (soort) {
    case 'map': return tr(lang, 'Тека', 'Map');
    case 'bestand': return tr(lang, 'Файл', 'Bestand');
    case 'bestand_deel': return tr(lang, 'Частина файла', 'Bestandsdeel');
    case 'archief_pad': return tr(lang, 'Частина архіву', 'Archiefdeel');
    case 'selectie': return tr(lang, 'Вибірка', 'Selectie');
  }
}

function gebeurtenisLabel(lang: Lang, soort: CloudDeelGebeurtenis['soort']): string {
  switch (soort) {
    case 'weergave': return tr(lang, 'Відкриття посилання', 'Koppeling geopend');
    case 'inhoud': return tr(lang, 'Перегляд вмісту', 'Inhoud bekeken');
    case 'download': return tr(lang, 'Завантаження файла', 'Bestand gedownload');
    case 'map_archief': return tr(lang, 'Завантаження архіву .zip', 'Zip-bundel gedownload');
    case 'geweigerd': return tr(lang, 'Відхилена спроба входу', 'Geweigerde poging');
  }
}

export default function Gedeeld({ lang, smal, toon, naarTab }: OnderdeelProps) {
  const [subTab, setSubTab] = useState<SubTab>('mijn');
  const [filter, setFilter] = useState<FilterStand>('alle');
  const [zoek, setZoek] = useState('');
  const [overzicht, setOverzicht] = useState<DelenOverzichtUit | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [gekopieerdId, setGekopieerdId] = useState('');
  const [qrKoppeling, setQrKoppeling] = useState<CloudDeelKoppeling | null>(null);

  // Actief detail-/statistiekpaneel
  const [actief, setActief] = useState<CloudDeelKoppeling | null>(null);
  const [perDag, setPerDag] = useState<CloudDeelDagStat[]>([]);
  const [gebeurtenissen, setGebeurtenissen] = useState<CloudDeelGebeurtenis[]>([]);
  const [statLaden, setStatLaden] = useState(false);

  // Bewerkvelden in het detailpaneel
  const [bewNaam, setBewNaam] = useState('');
  const [bewNotitie, setBewNotitie] = useState('');
  const [bewRechten, setBewRechten] = useState<CloudDeelRechten>('downloaden');
  const [bewActiefVanaf, setBewActiefVanaf] = useState('');
  const [bewVerlooptOp, setBewVerlooptOp] = useState('');
  const [bewMaxWeergaven, setBewMaxWeergaven] = useState('');
  const [bewMaxDownloads, setBewMaxDownloads] = useState('');
  const [bewNieuwWachtwoord, setBewNieuwWachtwoord] = useState('');
  const [bewOntvangersTekst, setBewOntvangersTekst] = useState('');

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const r = await cloudClient.delenOverzicht();
      setOverzicht(r);
      setFout('');
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setLaden(false);
    }
  }, [lang]);

  useEffect(() => { void laad(); }, [laad]);

  const vulBewerkVelden = (k: CloudDeelKoppeling) => {
    setBewNaam(k.naam);
    setBewNotitie(k.notitie);
    setBewRechten(k.rechten);
    setBewActiefVanaf(isoNaarLokaalInvoer(k.actiefVanaf));
    setBewVerlooptOp(isoNaarLokaalInvoer(k.verlooptOp));
    setBewMaxWeergaven(k.maxWeergaven != null ? String(k.maxWeergaven) : '');
    setBewMaxDownloads(k.maxDownloads != null ? String(k.maxDownloads) : '');
    setBewNieuwWachtwoord('');
    setBewOntvangersTekst(k.ontvangers.map((o) => o.email).join(', '));
  };

  const openStatistiek = async (k: CloudDeelKoppeling) => {
    setActief(k);
    vulBewerkVelden(k);
    setStatLaden(true);
    setPerDag([]);
    setGebeurtenissen([]);
    try {
      const st = await cloudClient.delenStatistiek(k.id);
      setActief(st.koppeling);
      vulBewerkVelden(st.koppeling);
      setPerDag(st.perDag);
      setGebeurtenissen(st.gebeurtenissen);
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setStatLaden(false);
    }
  };

  const kopieer = async (id: string, url: string) => {
    if (!url) return;
    const ok = await kopieerNaarKlembord(url);
    if (ok) {
      setGekopieerdId(id);
      window.setTimeout(() => setGekopieerdId((h) => (h === id ? '' : h)), 2400);
      toon(tr(lang, 'Посилання скопійовано до буфера обміну.', 'Koppeling gekopieerd naar het klembord.'));
    }
  };

  const schakelPauze = async (k: CloudDeelKoppeling) => {
    setBezig(true);
    setFout('');
    try {
      const bij = await cloudClient.delenBijwerken({ id: k.id, gepauzeerd: !k.gepauzeerd });
      if (actief?.id === bij.id) { setActief(bij); vulBewerkVelden(bij); }
      await laad();
      toon(bij.gepauzeerd ? tr(lang, 'Дію посилання тимчасово призупинено.', 'Koppeling gepauzeerd.') : tr(lang, 'Дію посилання відновлено.', 'Koppeling hervat.'));
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const trekIn = async (k: CloudDeelKoppeling) => {
    setBezig(true);
    setFout('');
    try {
      await cloudClient.delenIntrekken({ id: k.id });
      if (actief?.id === k.id) setActief(null);
      await laad();
      toon(tr(lang, `Посилання «${k.naam}» відкликано.`, `Koppeling «${k.naam}» ingetrokken.`));
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const verwijderUitGeschiedenis = async (k: CloudDeelKoppeling) => {
    setBezig(true);
    setFout('');
    try {
      await cloudClient.delenIntrekken({ id: k.id, verwijder: true });
      if (actief?.id === k.id) setActief(null);
      await laad();
      toon(tr(lang, 'Запис посилання остаточно прибрано зі списку.', 'Koppeling definitief uit het overzicht verwijderd.'));
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const bewaarWijzigingen = async (wisWachtwoord = false) => {
    if (!actief) return;
    const naamSchoon = schoneNaam(bewNaam);
    if (!naamSchoon) {
      setFout(tr(lang, 'Назва посилання не може бути порожньою.', 'De naam van de koppeling mag niet leeg zijn.'));
      return;
    }
    setBezig(true);
    setFout('');
    try {
      const ontvangerLijst = actief.modus === 'accounts'
        ? bewOntvangersTekst.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
        : undefined;
      const bij = await cloudClient.delenBijwerken({
        id: actief.id,
        naam: naamSchoon,
        notitie: bewNotitie.trim(),
        rechten: bewRechten,
        actiefVanaf: bewActiefVanaf.trim() ? lokaalInvoerNaarIso(bewActiefVanaf) : null,
        verlooptOp: bewVerlooptOp.trim() ? lokaalInvoerNaarIso(bewVerlooptOp) : null,
        maxWeergaven: bewMaxWeergaven.trim() ? Number(bewMaxWeergaven.trim()) : null,
        maxDownloads: bewMaxDownloads.trim() ? Number(bewMaxDownloads.trim()) : null,
        ...(ontvangerLijst !== undefined ? { ontvangers: ontvangerLijst } : {}),
        ...(wisWachtwoord ? { wachtwoordWissen: true } : bewNieuwWachtwoord.trim() ? { wachtwoord: bewNieuwWachtwoord.trim() } : {}),
      });
      setActief(bij);
      vulBewerkVelden(bij);
      await laad();
      toon(tr(lang, 'Налаштування посилання збережено.', 'Instellingen van de koppeling bewaard.'));
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const gefilterdeKoppelingen = useMemo(() => {
    const lijst = overzicht?.koppelingen || [];
    const z = zoek.trim().toLowerCase();
    return lijst.filter((k) => {
      if (filter === 'actief' && k.status !== 'actief' && k.status !== 'gepland') return false;
      if (filter === 'accounts' && k.modus !== 'accounts') return false;
      if (filter === 'termijn' && !k.verlooptOp && !k.actiefVanaf) return false;
      if (filter === 'gepauzeerd' && k.status !== 'gepauzeerd') return false;
      if (filter === 'ingetrokken' && k.status !== 'ingetrokken' && k.status !== 'verlopen' && k.status !== 'limiet_bereikt') return false;
      if (z) {
        const hooi = `${k.naam}\n${k.doelNaam}\n${k.notitie}\n${k.ontvangers.map((o) => o.email).join(' ')}`.toLowerCase();
        if (!hooi.includes(z)) return false;
      }
      return true;
    });
  }, [overzicht, filter, zoek]);

  const maxDagWaarde = useMemo(
    () => Math.max(1, ...perDag.map((d) => d.weergaven + d.downloads)),
    [perDag],
  );

  const sam = overzicht?.samenvatting || { totaal: 0, actief: 0, weergaven: 0, downloads: 0, uniekeBezoekers: 0 };
  const metMij = overzicht?.gedeeldMetMij || [];

  return (
    <section className='cvn-gedeeld-pagina' data-cvn-gedeeld-overzicht='' aria-label={tr(lang, 'Спільний доступ і статистика посилань', 'Gedeelde koppelingen en statistiek')}>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}

      {/* SAMENVATTINGSTEGELS */}
      <div className='cvn-gedeeld-statgrid'>
        <article className='cvn-gedeeld-statkaart'>
          <span className='cvn-gedeeld-staticoon'><Link2 aria-hidden='true' /></span>
          <div>
            <small>{tr(lang, 'Активні посилання', 'Actieve koppelingen')}</small>
            <strong>{sam.actief}</strong>
            <span>{tr(lang, `Усього створено: ${sam.totaal}`, `Totaal aangemaakt: ${sam.totaal}`)}</span>
          </div>
        </article>
        <article className='cvn-gedeeld-statkaart'>
          <span className='cvn-gedeeld-staticoon'><Eye aria-hidden='true' /></span>
          <div>
            <small>{tr(lang, 'Усього переглядів', 'Totaal weergaven')}</small>
            <strong>{sam.weergaven}</strong>
            <span>{tr(lang, 'За всіма вашими посиланнями', 'Over al uw koppelingen')}</span>
          </div>
        </article>
        <article className='cvn-gedeeld-statkaart'>
          <span className='cvn-gedeeld-staticoon'><Download aria-hidden='true' /></span>
          <div>
            <small>{tr(lang, 'Завантажень', 'Downloads')}</small>
            <strong>{sam.downloads}</strong>
            <span>{tr(lang, 'Файлів, частин та архівів', 'Bestanden, delen en bundels')}</span>
          </div>
        </article>
        <article className='cvn-gedeeld-statkaart'>
          <span className='cvn-gedeeld-staticoon'><Users aria-hidden='true' /></span>
          <div>
            <small>{tr(lang, 'Унікальних відвідувачів', 'Unieke bezoekers')}</small>
            <strong>{sam.uniekeBezoekers}</strong>
            <span>{tr(lang, `Відкрито для вас: ${metMij.length}`, `Met u gedeeld: ${metMij.length}`)}</span>
          </div>
        </article>
      </div>

      {/* HOOFDWERKBALK */}
      <div className='cvn-gedeeld-werkbalk'>
        <div className='cvn-chips' role='tablist' aria-label={tr(lang, 'Напрямок спільного доступу', 'Richting van gedeelde toegang')}>
          <button type='button' role='tab' aria-selected={subTab === 'mijn'} className={`cvn-knop${subTab === 'mijn' ? ' is-actief' : ''}`} onClick={() => setSubTab('mijn')}>
            <Share2 aria-hidden='true' />{tr(lang, `Мої посилання (${sam.totaal})`, `Mijn koppelingen (${sam.totaal})`)}
          </button>
          <button type='button' role='tab' aria-selected={subTab === 'met-mij'} className={`cvn-knop${subTab === 'met-mij' ? ' is-actief' : ''}`} onClick={() => setSubTab('met-mij')}>
            <UserCheck aria-hidden='true' />{tr(lang, `Відкриті для мене (${metMij.length})`, `Met mij gedeeld (${metMij.length})`)}
          </button>
        </div>

        <div className='cvn-gedeeld-werkbalk-rechts'>
          <button type='button' className='cvn-knop' onClick={() => naarTab('files')}>
            <FolderOpen aria-hidden='true' />{tr(lang, 'Обрати файл або теку для поширення', 'Bestand of map kiezen om te delen')}
          </button>
          <button type='button' className='cvn-icoonknop' disabled={laden} onClick={() => void laad()} aria-label={tr(lang, 'Оновити статистику', 'Statistiek vernieuwen')}>
            <RefreshCw className={laden ? 'cvn-draai' : ''} aria-hidden='true' />
          </button>
        </div>
      </div>

      {subTab === 'mijn' ? (
        <>
          <div className='cvn-filters'>
            <div className='cvn-zoekveld'>
              <Search aria-hidden='true' />
              <input
                type='search'
                value={zoek}
                placeholder={tr(lang, 'Пошук за назвою посилання, файлом або отримувачем…', 'Zoek op naam van koppeling, bestand of ontvanger…')}
                aria-label={tr(lang, 'Пошук серед посилань', 'Zoeken in koppelingen')}
                onChange={(e) => setZoek(e.target.value)}
              />
            </div>
            <div className='cvn-chips' role='group' aria-label={tr(lang, 'Фільтр за станом посилання', 'Filter op status')}>
              {([
                ['alle', tr(lang, 'Усі', 'Alle')],
                ['actief', tr(lang, 'Активні', 'Actief')],
                ['accounts', tr(lang, 'За обліковими записами', 'Op account')],
                ['termijn', tr(lang, 'З терміном дії', 'Met termijn')],
                ['gepauzeerd', tr(lang, 'Призупинені', 'Gepauzeerd')],
                ['ingetrokken', tr(lang, 'Завершені / відкликані', 'Verlopen / ingetrokken')],
              ] as Array<[FilterStand, string]>).map(([sleutel, tekst]) => (
                <button key={sleutel} type='button' className={`cvn-knop is-klein${filter === sleutel ? ' is-actief' : ''}`} onClick={() => setFilter(sleutel)}>
                  {tekst}
                </button>
              ))}
            </div>
          </div>

          {laden && !overzicht ? (
            <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Завантажуємо посилання та статистику…', 'Koppelingen en statistiek laden…')}</p>
          ) : null}

          {!laden && !gefilterdeKoppelingen.length ? (
            <div className='cvn-leeg'>
              <Share2 aria-hidden='true' />
              <p>
                {sam.totaal === 0
                  ? tr(lang, 'Ви ще не створювали спільних посилань. Перейдіть у «Мої файли» та натисніть значок поширення на будь-якій теці, файлі чи архіві.', 'U hebt nog geen gedeelde koppelingen aangemaakt. Open «Mijn bestanden» en kies «Delen» op een map, bestand of archief.')
                  : tr(lang, 'За обраним фільтром посилань не знайдено.', 'Geen koppelingen gevonden voor dit filter.')}
              </p>
              <button type='button' className='cvn-knop is-hoofd' onClick={() => naarTab('files')}>
                <FolderOpen aria-hidden='true' />{tr(lang, 'Перейти до «Моїх файлів»', 'Naar «Mijn bestanden»')}
              </button>
            </div>
          ) : (
            <div className='cvn-gedeeld-lijst' role='list'>
              {gefilterdeKoppelingen.map((k) => {
                const Icoon = doelSoortIcoon(k.doelSoort);
                return (
                  <article key={k.id} className='cvn-gedeeld-kaart' role='listitem' data-cvn-gedeeld-kaart={k.id}>
                    <div className='cvn-gedeeld-kaart-hoofd'>
                      <span className='cvn-gedeeld-doelicoon' aria-hidden='true'><Icoon /></span>
                      <div className='cvn-gedeeld-kern'>
                        <div className='cvn-gedeeld-titelrij'>
                          <strong>{k.naam}</strong>
                          <span className={`cvn-deel-status is-${k.status}`}>{statusLabel(lang, k.status)}</span>
                          <span className='cvn-deel-pil'>
                            {k.modus === 'accounts' ? <><UserCheck aria-hidden='true' />{tr(lang, `Облікових записів: ${k.ontvangers.length}`, `Accounts: ${k.ontvangers.length}`)}</> : <><Globe aria-hidden='true' />{tr(lang, 'За посиланням', 'Koppeling')}</>}
                          </span>
                          {k.heeftWachtwoord ? <span className='cvn-deel-pil'><KeyRound aria-hidden='true' />{tr(lang, 'Із паролем', 'Wachtwoord')}</span> : null}
                        </div>
                        <p className='cvn-gedeeld-sub'>
                          <span>{doelSoortTekst(lang, k.doelSoort)}: <b>{k.doelNaam}</b></span>
                          <span>· {k.rechten === 'downloaden' ? tr(lang, 'Перегляд і завантаження', 'Bekijken + downloaden') : tr(lang, 'Лише перегляд', 'Alleen bekijken')}</span>
                          {k.verlooptOp ? <span>· <CalendarClock aria-hidden='true' />{tr(lang, `До ${datumTekst(lang, k.verlooptOp)}`, `Tot ${datumTekst(lang, k.verlooptOp)}`)}</span> : <span>· {tr(lang, 'Безстроково', 'Onbeperkt')}</span>}
                        </p>
                      </div>
                    </div>

                    <div className='cvn-gedeeld-tellers'>
                      <div title={tr(lang, 'Кількість відкриттів посилання', 'Aantal weergaven')}>
                        <Eye aria-hidden='true' />
                        <b>{k.weergavenAantal}{k.maxWeergaven ? `/${k.maxWeergaven}` : ''}</b>
                        <small>{tr(lang, 'переглядів', 'weergaven')}</small>
                      </div>
                      <div title={tr(lang, 'Кількість завантажень', 'Aantal downloads')}>
                        <Download aria-hidden='true' />
                        <b>{k.downloadsAantal}{k.maxDownloads ? `/${k.maxDownloads}` : ''}</b>
                        <small>{tr(lang, 'завантажень', 'downloads')}</small>
                      </div>
                      <div>
                        <Users aria-hidden='true' />
                        <b>{k.uniekeBezoekers}</b>
                        <small>{tr(lang, 'відвідувачів', 'bezoekers')}</small>
                      </div>
                      <div className='cvn-verberg-smal'>
                        <Activity aria-hidden='true' />
                        <b>{geledenTekst(lang, k.laatstBekekenOp)}</b>
                        <small>{tr(lang, 'останній перегляд', 'laatst bekeken')}</small>
                      </div>
                    </div>

                    <div className='cvn-gedeeld-acties'>
                      {k.status !== 'ingetrokken' && k.url ? (
                        <>
                          <button type='button' className='cvn-knop is-klein is-hoofd' onClick={() => void kopieer(k.id, k.url)}>
                            {gekopieerdId === k.id ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
                            {gekopieerdId === k.id ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}
                          </button>
                          <button type='button' className='cvn-knop is-klein' onClick={() => setQrKoppeling(k)}>
                            <QrCode aria-hidden='true' />QR
                          </button>
                          <a className='cvn-knop is-klein' href={k.url} target='_blank' rel='noreferrer noopener'>
                            <ExternalLink aria-hidden='true' />{tr(lang, 'Відкрити', 'Openen')}
                          </a>
                        </>
                      ) : null}
                      <button type='button' className='cvn-knop is-klein' data-cvn-statistiek={k.id} onClick={() => void openStatistiek(k)}>
                        <BarChart3 aria-hidden='true' />{tr(lang, 'Статистика й налаштування', 'Statistiek en beheer')}
                      </button>
                      {k.status !== 'ingetrokken' ? (
                        <>
                          <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => void schakelPauze(k)}>
                            {k.gepauzeerd ? <Play aria-hidden='true' /> : <Pause aria-hidden='true' />}
                            {k.gepauzeerd ? tr(lang, 'Відновити', 'Hervatten') : tr(lang, 'Пауза', 'Pauze')}
                          </button>
                          <button type='button' className='cvn-knop is-klein is-stil' disabled={bezig} onClick={() => void trekIn(k)}>
                            <RotateCcw aria-hidden='true' />{tr(lang, 'Відкликати', 'Intrekken')}
                          </button>
                        </>
                      ) : (
                        <button type='button' className='cvn-knop is-klein is-stil' disabled={bezig} onClick={() => void verwijderUitGeschiedenis(k)}>
                          <Trash2 aria-hidden='true' />{tr(lang, 'Прибрати зі списку', 'Uit lijst wissen')}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* MET MIJ GEDEELD */
        !metMij.length ? (
          <div className='cvn-leeg'>
            <UserCheck aria-hidden='true' />
            <p>{tr(lang, 'Поки ніхто не відкривав персонального доступу для вашої електронної адреси.', 'Er zijn nog geen onderdelen persoonlijk met uw e-mailadres gedeeld.')}</p>
          </div>
        ) : (
          <div className='cvn-gedeeld-lijst' role='list'>
            {metMij.map((m: CloudGedeeldMetMij) => {
              const Icoon = doelSoortIcoon(m.doelSoort);
              return (
                <article key={m.id} className='cvn-gedeeld-kaart' role='listitem'>
                  <div className='cvn-gedeeld-kaart-hoofd'>
                    <span className='cvn-gedeeld-doelicoon' aria-hidden='true'><Icoon /></span>
                    <div className='cvn-gedeeld-kern'>
                      <div className='cvn-gedeeld-titelrij'>
                        <strong>{m.naam}</strong>
                        <span className='cvn-deel-pil'>{doelSoortTekst(lang, m.doelSoort)}</span>
                      </div>
                      <p className='cvn-gedeeld-sub'>
                        <span>{tr(lang, 'Від:', 'Van:')} <b>{m.eigenaarNaam}</b> {m.eigenaarEmail ? `(${m.eigenaarEmail})` : ''}</span>
                        <span>· {m.doelNaam}</span>
                        {m.verlooptOp ? <span>· {tr(lang, `До ${datumTekst(lang, m.verlooptOp)}`, `Tot ${datumTekst(lang, m.verlooptOp)}`)}</span> : null}
                      </p>
                      {m.notitie ? <p className='cvn-hint'>{m.notitie}</p> : null}
                    </div>
                  </div>
                  <div className='cvn-gedeeld-acties'>
                    <a className='cvn-knop is-hoofd is-klein' href={`/gedeeld/${encodeURIComponent(m.code)}`}>
                      <ExternalLink aria-hidden='true' />{tr(lang, 'Переглянути спільний матеріал', 'Gedeeld onderdeel openen')}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* QR-MODAAL */}
      {qrKoppeling && qrKoppeling.url ? (
        <Laag lang={lang} soort='venster' titel={`QR — ${qrKoppeling.naam}`} onSluit={() => setQrKoppeling(null)}>
          <div className='cvn-deel-qr-vak'>
            <DeelQrSvg url={qrKoppeling.url} grootte={196} />
            <p className='cvn-hint'>{qrKoppeling.url}</p>
            <div className='cvn-laag-knoppen'>
              <button type='button' className='cvn-knop is-hoofd' onClick={() => void kopieer(qrKoppeling.id, qrKoppeling.url)}>
                <Copy aria-hidden='true' />{tr(lang, 'Скопіювати адресу', 'Adres kopiëren')}
              </button>
              <button type='button' className='cvn-knop' onClick={() => setQrKoppeling(null)}>{tr(lang, 'Закрити', 'Sluiten')}</button>
            </div>
          </div>
        </Laag>
      ) : null}

      {/* STATISTIEK & BEHEER PANEEL */}
      {actief ? (
        <Laag
          lang={lang}
          soort={smal ? 'scherm' : 'paneel'}
          titel={tr(lang, `Статистика й керування — ${actief.naam}`, `Statistiek en beheer — ${actief.naam}`)}
          onSluit={() => setActief(null)}
          data={{ 'cvn-statistiek-paneel': actief.id }}
        >
          <div className='cvn-deel-omhulsel'>
            <section className='cvn-deel-kaart'>
              <div className='cvn-gedeeld-tellers'>
                <div><Eye aria-hidden='true' /><b>{actief.weergavenAantal}</b><small>{tr(lang, 'переглядів', 'weergaven')}</small></div>
                <div><Download aria-hidden='true' /><b>{actief.downloadsAantal}</b><small>{tr(lang, 'завантажень', 'downloads')}</small></div>
                <div><Users aria-hidden='true' /><b>{actief.uniekeBezoekers}</b><small>{tr(lang, 'відвідувачів', 'bezoekers')}</small></div>
              </div>

              <h3 className='cvn-gedeeld-sectietitel'><BarChart3 aria-hidden='true' />{tr(lang, 'Динаміка за останні 14 днів', 'Activiteit afgelopen 14 dagen')}</h3>
              {statLaden ? (
                <p className='cvn-hint'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Оновлюємо графік…', 'Grafiek laden…')}</p>
              ) : (
                <div className='cvn-gedeeld-grafiek' role='img' aria-label={tr(lang, 'Стовпчиковий графік переглядів і завантажень за 14 днів', 'Staafgrafiek van weergaven en downloads over 14 dagen')}>
                  {perDag.map((d) => {
                    const som = d.weergaven + d.downloads;
                    const pct = Math.max(6, Math.round((som / maxDagWaarde) * 100));
                    return (
                      <div key={d.dag} className='cvn-gedeeld-staafkolom' title={`${d.dag}: ${tr(lang, 'переглядів', 'weergaven')} ${d.weergaven}, ${tr(lang, 'завантажень', 'downloads')} ${d.downloads}`}>
                        <span className='cvn-gedeeld-staafwaarde'>{som > 0 ? som : ''}</span>
                        <div className='cvn-gedeeld-staafspoor'>
                          <div className={`cvn-gedeeld-staaf${som > 0 ? ' is-gevuld' : ''}`} style={{ height: `${som > 0 ? pct : 4}%` }} />
                        </div>
                        <small>{d.dag.slice(5)}</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {actief.status !== 'ingetrokken' ? (
              <section className='cvn-deel-kaart' aria-label={tr(lang, 'Редагування параметрів посилання', 'Koppelingsinstellingen bewerken')}>
                <h3 className='cvn-gedeeld-sectietitel'>{tr(lang, 'Назва, терміни та обмеження', 'Naam, termijnen en limieten')}</h3>
                <div className='cvn-deel-velden-grid'>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Назва посилання', 'Naam van de koppeling')}</span>
                    <input type='text' value={bewNaam} maxLength={CLOUD_VNEXT_LIMIETEN.naamMax} onChange={(e) => setBewNaam(e.target.value)} />
                  </label>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Нотатка для отримувача', 'Notitie voor ontvanger')}</span>
                    <input type='text' value={bewNotitie} maxLength={600} onChange={(e) => setBewNotitie(e.target.value)} />
                  </label>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Права доступу', 'Toegangsrechten')}</span>
                    <select value={bewRechten} onChange={(e) => setBewRechten(e.target.value as CloudDeelRechten)}>
                      <option value='downloaden'>{tr(lang, 'Перегляд і завантаження', 'Bekijken en downloaden')}</option>
                      <option value='bekijken'>{tr(lang, 'Лише перегляд', 'Alleen bekijken')}</option>
                    </select>
                  </label>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Діє з (відкладений старт)', 'Actief vanaf')}</span>
                    <input type='datetime-local' value={bewActiefVanaf} onChange={(e) => setBewActiefVanaf(e.target.value)} />
                  </label>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Діє до (порожньо = безстроково)', 'Verloopt op (leeg = onbeperkt)')}</span>
                    <input type='datetime-local' value={bewVerlooptOp} onChange={(e) => setBewVerlooptOp(e.target.value)} />
                  </label>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Межа переглядів', 'Max. weergaven')}</span>
                    <input type='number' min={1} max={1000000} placeholder={tr(lang, 'Без межі', 'Onbeperkt')} value={bewMaxWeergaven} onChange={(e) => setBewMaxWeergaven(e.target.value)} />
                  </label>
                  <label className='cvn-deel-veld'>
                    <span>{tr(lang, 'Межа завантажень', 'Max. downloads')}</span>
                    <input type='number' min={1} max={1000000} placeholder={tr(lang, 'Без межі', 'Onbeperkt')} value={bewMaxDownloads} onChange={(e) => setBewMaxDownloads(e.target.value)} />
                  </label>
                  {actief.modus === 'accounts' ? (
                    <label className='cvn-deel-veld'>
                      <span>{tr(lang, 'Електронні адреси отримувачів (через кому)', 'E-mailadressen ontvangers (kommagescheiden)')}</span>
                      <input type='text' value={bewOntvangersTekst} onChange={(e) => setBewOntvangersTekst(e.target.value)} />
                    </label>
                  ) : (
                    <label className='cvn-deel-veld'>
                      <span>{actief.heeftWachtwoord ? tr(lang, 'Змінити пароль (залиште порожнім, щоб не змінювати)', 'Nieuw wachtwoord (leeg = behouden)') : tr(lang, 'Встановити пароль посилання', 'Wachtwoord instellen')}</span>
                      <input type='password' value={bewNieuwWachtwoord} placeholder='••••••' onChange={(e) => setBewNieuwWachtwoord(e.target.value)} />
                    </label>
                  )}
                </div>
                <div className='cvn-deel-hoofdknoppen'>
                  <button type='button' className='cvn-knop is-hoofd' disabled={bezig} onClick={() => void bewaarWijzigingen(false)}>
                    <Check aria-hidden='true' />{tr(lang, 'Зберегти зміни', 'Wijzigingen bewaren')}
                  </button>
                  {actief.heeftWachtwoord && actief.modus === 'link' ? (
                    <button type='button' className='cvn-knop' disabled={bezig} onClick={() => void bewaarWijzigingen(true)}>
                      <KeyRound aria-hidden='true' />{tr(lang, 'Прибрати пароль', 'Wachtwoord wissen')}
                    </button>
                  ) : null}
                  <button type='button' className='cvn-knop is-stil' disabled={bezig} onClick={() => void trekIn(actief)}>
                    <RotateCcw aria-hidden='true' />{tr(lang, 'Відкликати посилання', 'Koppeling intrekken')}
                  </button>
                </div>
              </section>
            ) : null}

            <section className='cvn-deel-kaart' aria-label={tr(lang, 'Журнал звернень за посиланням', 'Gebeurtenissenlogboek')}>
              <h3 className='cvn-gedeeld-sectietitel'><Activity aria-hidden='true' />{tr(lang, 'Останні перегляди та події', 'Recente gebeurtenissen')}</h3>
              {!gebeurtenissen.length ? (
                <p className='cvn-hint'>{tr(lang, 'За цим посиланням ще не зафіксовано звернень.', 'Er zijn nog geen gebeurtenissen voor deze koppeling vastgelegd.')}</p>
              ) : (
                <ul className='cvn-gedeeld-loglijst'>
                  {gebeurtenissen.map((g) => (
                    <li key={g.id} className={`cvn-gedeeld-logrij is-${g.soort}`}>
                      <div>
                        <strong>{gebeurtenisLabel(lang, g.soort)}</strong>
                        {g.doelPad ? <span> · {g.doelPad}</span> : null}
                      </div>
                      <div className='cvn-gedeeld-logmeta'>
                        {g.ontvangerEmail ? <span>{g.ontvangerEmail}</span> : null}
                        {g.apparaat ? <span>{g.apparaat}</span> : null}
                        <time dateTime={g.aangemaaktOp}>{datumTekst(lang, g.aangemaaktOp)}</time>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Laag>
      ) : null}
    </section>
  );
}
