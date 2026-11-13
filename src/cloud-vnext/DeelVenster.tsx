// DeelVenster (CLOUD-001) — ontwerpgedreven dialoog voor het delen van mappen, bestanden, selecties, archief-onderdelen
// én exacte bestandsdelen (regels, pdf-pagina's of bytebereik). Alle modale lagen gebruiken <Laag> (nooit fixed of browser-popups).
import { useCallback, useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import {
  Archive, CalendarClock, Check, Copy, ExternalLink, Eye, EyeOff, FileCode2, FileSpreadsheet,
  FileText, Folder, Globe, KeyRound, Link2, LoaderCircle, Pause, Play, Plus, QrCode, RotateCcw,
  Scissors, Share2, ShieldAlert, Sparkles, Trash2, UserCheck, Users, X,
} from 'lucide-react';
import {
  CLOUD_VNEXT_LIMIETEN, schoneNaam,
  type CloudArchiefIngang, type CloudBestand, type CloudDeelBereik, type CloudDeelDeelSoort,
  type CloudDeelDoelSoort, type CloudDeelKoppeling, type CloudDeelModus, type CloudDeelOntvanger,
  type CloudDeelRechten, type CloudMap,
} from '../../shared/cloud-vnext-model';
import { cloudClient, type DelenVoorbereidenBestandUit, type DelenVoorbereidenMapUit } from './cloud-client';
import { cloudFoutTekst } from './hulp';
import Laag from './Laag';
import { bytesTekst, datumTekst, geledenTekst, tr, type Lang } from './tekst';

export type DeelVensterDoel =
  | { soort: 'bestand'; bestand: CloudBestand; beginModus?: 'heel' | 'deel' | 'archief'; beginDeelSoort?: CloudDeelDeelSoort; beginArchiefPaden?: string[] }
  | { soort: 'map'; map: CloudMap }
  | { soort: 'selectie'; bestandIds: string[]; mapIds?: string[]; label: string };

type TermijnKeuze = 'onbeperkt' | '1u' | '24u' | '7d' | '30d' | 'eigen';

export function DeelQrSvg({ url, grootte = 152 }: { url: string; grootte?: number }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    const aantal = q.getModuleCount();
    let pad = '';
    for (let r = 0; r < aantal; r += 1) {
      for (let k = 0; k < aantal; k += 1) {
        if (q.isDark(r, k)) pad += `M${k},${r}h1v1h-1z`;
      }
    }
    return { n: aantal, d: pad };
  }, [url]);

  return (
    <svg className='cvn-deel-qr-svg' width={grootte} height={grootte} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role='img' aria-label='QR'>
      <rect x={-2} y={-2} width={n + 4} height={n + 4} rx={1.5} fill='white' />
      <path d={d} fill='black' />
    </svg>
  );
}

export function isoNaarLokaalInvoer(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad2 = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function lokaalInvoerNaarIso(waarde: string): string | null {
  const s = waarde.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function statusLabel(lang: Lang, status: CloudDeelKoppeling['status']): string {
  switch (status) {
    case 'actief': return tr(lang, 'Активне', 'Actief');
    case 'gepland': return tr(lang, 'Заплановане', 'Gepland');
    case 'gepauzeerd': return tr(lang, 'Призупинене', 'Gepauzeerd');
    case 'verlopen': return tr(lang, 'Прострочене', 'Verlopen');
    case 'limiet_bereikt': return tr(lang, 'Вичерпане', 'Limiet bereikt');
    case 'ingetrokken': return tr(lang, 'Відкликане', 'Ingetrokken');
  }
}

export function kopieerNaarKlembord(tekst: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(tekst).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

type Props = {
  lang: Lang;
  smal: boolean;
  doel: DeelVensterDoel;
  onSluit: () => void;
  onVeranderd: () => void;
  toon: (melding: string) => void;
};

export default function DeelVenster({ lang, smal, doel, onSluit, onVeranderd, toon }: Props) {
  const basisTitel = doel.soort === 'bestand' ? doel.bestand.naam : doel.soort === 'map' ? doel.map.naam : doel.label;

  // Voorbereidingsgegevens (regels, pdf-pagina's, archief-ingangen of map-inhoud)
  const [ladenInfo, setLadenInfo] = useState(false);
  const [bestandVoorb, setBestandVoorb] = useState<DelenVoorbereidenBestandUit['deelOpties'] | null>(null);
  const [mapVoorb, setMapVoorb] = useState<DelenVoorbereidenMapUit | null>(null);
  const [bestaande, setBestaande] = useState<CloudDeelKoppeling[]>([]);

  // Wat delen (heel vs deel / selectie)
  const [bereikStand, setBereikStand] = useState<'heel' | 'deel' | 'archief'>(() => {
    if (doel.soort === 'bestand' && doel.beginModus) return doel.beginModus;
    return 'heel';
  });
  const [deelSoort, setDeelSoort] = useState<CloudDeelDeelSoort>(() => (doel.soort === 'bestand' && doel.beginDeelSoort ? doel.beginDeelSoort : 'regels'));
  const [vanRegel, setVanRegel] = useState('1');
  const [totRegel, setTotRegel] = useState('25');
  const [vanPagina, setVanPagina] = useState('1');
  const [totPagina, setTotPagina] = useState('1');
  const [vanByte, setVanByte] = useState('0');
  const [totByte, setTotByte] = useState('1023');

  // Subselectie in map of archief
  const [mapAlles, setMapAlles] = useState(true);
  const [gekozenSubMappen, setGekozenSubMappen] = useState<string[]>([]);
  const [gekozenMapBestanden, setGekozenMapBestanden] = useState<string[]>([]);
  const [gekozenArchiefPaden, setGekozenArchiefPaden] = useState<string[]>(() => (doel.soort === 'bestand' && doel.beginArchiefPaden ? doel.beginArchiefPaden : []));
  const [boomZoek, setBoomZoek] = useState('');

  // Eigenschappen van de nieuwe koppeling
  const [naam, setNaam] = useState(() => basisTitel);
  const [notitie, setNotitie] = useState('');
  const [modus, setModus] = useState<CloudDeelModus>('link');
  const [rechten, setRechten] = useState<CloudDeelRechten>('downloaden');
  const [wachtwoordAan, setWachtwoordAan] = useState(false);
  const [wachtwoord, setWachtwoord] = useState('');
  const [toonWw, setToonWw] = useState(false);

  // Ontvangers (voor modus === 'accounts')
  const [emailVeld, setEmailVeld] = useState('');
  const [ontvangers, setOntvangers] = useState<CloudDeelOntvanger[]>([]);
  const [zoekEmailBezig, setZoekEmailBezig] = useState(false);

  // Termijn & grenzen
  const [termijn, setTermijn] = useState<TermijnKeuze>('onbeperkt');
  const [eigenVerloopt, setEigenVerloopt] = useState('');
  const [extraGrenzenOpen, setExtraGrenzenOpen] = useState(false);
  const [actiefVanafVeld, setActiefVanafVeld] = useState('');
  const [maxWeergavenVeld, setMaxWeergavenVeld] = useState('');
  const [maxDownloadsVeld, setMaxDownloadsVeld] = useState('');

  // Status & zojuist aangemaakte koppeling
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [nieuwGemaakt, setNieuwGemaakt] = useState<CloudDeelKoppeling | null>(null);
  const [gekopieerdId, setGekopieerdId] = useState('');
  const [qrOpenId, setQrOpenId] = useState('');
  const [hernoemId, setHernoemId] = useState('');
  const [hernoemWaarde, setHernoemWaarde] = useState('');

  const doelSleutel = doel.soort === 'bestand' ? doel.bestand.id : doel.soort === 'map' ? doel.map.id : '';

  const laadBestaande = useCallback(async () => {
    if (!doelSleutel) return;
    try {
      const ov = await cloudClient.delenOverzicht(doelSleutel);
      setBestaande(ov.koppelingen.filter((k) => k.status !== 'ingetrokken'));
    } catch { /* overzicht is aanvullend */ }
  }, [doelSleutel]);

  useEffect(() => {
    let actief = true;
    setLadenInfo(true);
    setFout('');
    (async () => {
      try {
        if (doel.soort === 'bestand') {
          const [vb, ov] = await Promise.all([
            cloudClient.delenVoorbereidenBestand(doel.bestand.id),
            cloudClient.delenOverzicht(doel.bestand.id),
          ]);
          if (!actief) return;
          setBestandVoorb(vb.deelOpties);
          setBestaande(ov.koppelingen.filter((k) => k.status !== 'ingetrokken'));
          const opt = vb.deelOpties;
          if (opt.tekstRegelsTotaal != null) {
            setTotRegel(String(Math.min(opt.tekstRegelsTotaal, 40)));
            if (!doel.beginDeelSoort) setDeelSoort('regels');
          } else if (opt.pdfPaginasTotaal != null) {
            setTotPagina(String(Math.min(opt.pdfPaginasTotaal, 3)));
            if (!doel.beginDeelSoort) setDeelSoort('paginas');
          } else if (opt.kanBytes) {
            setTotByte(String(Math.max(0, Math.min(opt.totaalBytes - 1, 4095))));
            if (!doel.beginDeelSoort) setDeelSoort('bytes');
          }
        } else if (doel.soort === 'map') {
          const [vb, ov] = await Promise.all([
            cloudClient.delenVoorbereidenMap(doel.map.id),
            cloudClient.delenOverzicht(doel.map.id),
          ]);
          if (!actief) return;
          setMapVoorb(vb);
          setBestaande(ov.koppelingen.filter((k) => k.status !== 'ingetrokken'));
        }
      } catch (e) {
        if (actief) setFout(cloudFoutTekst(lang, e));
      } finally {
        if (actief) setLadenInfo(false);
      }
    })();
    return () => { actief = false; };
  }, [doel, lang]);

  const voegOntvangerToe = async () => {
    const rauw = emailVeld
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!rauw.length) return;
    setZoekEmailBezig(true);
    setFout('');
    try {
      const gevonden = await cloudClient.delenZoekAccounts(rauw);
      setOntvangers((oud) => {
        const kaart = new Map(oud.map((o) => [o.email, o]));
        for (const g of gevonden) kaart.set(g.email, g);
        return [...kaart.values()];
      });
      setEmailVeld('');
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setZoekEmailBezig(false);
    }
  };

  const berekendeVerlooptIso = (): string | null => {
    const nu = Date.now();
    if (termijn === 'onbeperkt') return null;
    if (termijn === '1u') return new Date(nu + 3_600_000).toISOString();
    if (termijn === '24u') return new Date(nu + 86_400_000).toISOString();
    if (termijn === '7d') return new Date(nu + 7 * 86_400_000).toISOString();
    if (termijn === '30d') return new Date(nu + 30 * 86_400_000).toISOString();
    return lokaalInvoerNaarIso(eigenVerloopt);
  };

  const maakKoppeling = async () => {
    setBezig(true);
    setFout('');
    try {
      let doelSoortUit: CloudDeelDoelSoort = 'bestand';
      let doelIdUit: string | undefined;
      let bereikUit: CloudDeelBereik = {};

      if (doel.soort === 'selectie') {
        doelSoortUit = 'selectie';
        bereikUit = { bestandIds: doel.bestandIds, mapIds: doel.mapIds || [] };
      } else if (doel.soort === 'map') {
        doelSoortUit = 'map';
        doelIdUit = doel.map.id;
        if (!mapAlles) {
          if (!gekozenSubMappen.length && !gekozenMapBestanden.length) {
            setFout(tr(lang, 'Оберіть принаймні один файл або підтеку всередині теки.', 'Kies minstens één bestand of submap binnen de map.'));
            setBezig(false);
            return;
          }
          bereikUit = { mapIds: gekozenSubMappen, bestandIds: gekozenMapBestanden };
        }
      } else {
        doelIdUit = doel.bestand.id;
        if (bereikStand === 'heel') {
          doelSoortUit = 'bestand';
        } else if (bereikStand === 'archief') {
          doelSoortUit = 'archief_pad';
          if (!gekozenArchiefPaden.length) {
            setFout(tr(lang, 'Позначте принаймні один елемент архіву для спільного доступу.', 'Vink minstens één onderdeel van het archief aan om te delen.'));
            setBezig(false);
            return;
          }
          bereikUit = { archiefPaden: gekozenArchiefPaden };
        } else {
          doelSoortUit = 'bestand_deel';
          if (deelSoort === 'regels') {
            bereikUit = { deelSoort: 'regels', vanRegel: Number(vanRegel), totRegel: Number(totRegel) };
          } else if (deelSoort === 'paginas') {
            bereikUit = { deelSoort: 'paginas', vanPagina: Number(vanPagina), totPagina: Number(totPagina) };
          } else {
            bereikUit = { deelSoort: 'bytes', vanByte: Number(vanByte), totByte: Number(totByte) };
          }
        }
      }

      if (termijn === 'eigen' && !lokaalInvoerNaarIso(eigenVerloopt)) {
        setFout(tr(lang, 'Вкажіть дату й час завершення дії посилання.', 'Kies de einddatum en -tijd voor de koppeling.'));
        setBezig(false);
        return;
      }

      let eindOntvangers = ontvangers.map((o) => o.email);
      if (modus === 'accounts' && emailVeld.trim()) {
        const extra = emailVeld.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
        eindOntvangers = [...new Set([...eindOntvangers, ...extra])];
      }

      const koppeling = await cloudClient.delenNieuw({
        doelSoort: doelSoortUit,
        doelId: doelIdUit,
        bereik: bereikUit,
        naam: schoneNaam(naam) || basisTitel,
        notitie: notitie.trim(),
        modus,
        rechten,
        ontvangers: modus === 'accounts' ? eindOntvangers : [],
        wachtwoord: modus === 'link' && wachtwoordAan && wachtwoord ? wachtwoord : undefined,
        actiefVanaf: lokaalInvoerNaarIso(actiefVanafVeld),
        verlooptOp: berekendeVerlooptIso(),
        maxWeergaven: maxWeergavenVeld.trim() ? Number(maxWeergavenVeld.trim()) : null,
        maxDownloads: maxDownloadsVeld.trim() ? Number(maxDownloadsVeld.trim()) : null,
      });

      setNieuwGemaakt(koppeling);
      const gekopieerd = koppeling.url ? await kopieerNaarKlembord(koppeling.url) : false;
      if (gekopieerd) setGekopieerdId(koppeling.id);
      toon(gekopieerd
        ? tr(lang, 'Посилання створено й одразу скопійовано.', 'Koppeling aangemaakt en direct gekopieerd.')
        : tr(lang, 'Посилання успішно створено.', 'Koppeling aangemaakt.'));
      onVeranderd();
      await laadBestaande();
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const kopieer = async (k: CloudDeelKoppeling) => {
    if (!k.url) return;
    const ok = await kopieerNaarKlembord(k.url);
    if (ok) {
      setGekopieerdId(k.id);
      window.setTimeout(() => setGekopieerdId((h) => (h === k.id ? '' : h)), 2400);
      toon(tr(lang, 'Посилання скопійовано до буфера обміну.', 'Koppeling gekopieerd naar het klembord.'));
    }
  };

  const schakelPauze = async (k: CloudDeelKoppeling) => {
    setBezig(true);
    setFout('');
    try {
      const bij = await cloudClient.delenBijwerken({ id: k.id, gepauzeerd: !k.gepauzeerd });
      setBestaande((lijst) => lijst.map((x) => (x.id === bij.id ? bij : x)));
      if (nieuwGemaakt?.id === bij.id) setNieuwGemaakt(bij);
      onVeranderd();
      toon(bij.gepauzeerd ? tr(lang, 'Дію посилання тимчасово призупинено.', 'Koppeling tijdelijk gepauzeerd.') : tr(lang, 'Дію посилання відновлено.', 'Koppeling hervat.'));
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const bewaarKoppelingNaam = async (id: string) => {
    const schoon = schoneNaam(hernoemWaarde);
    if (!schoon) { setFout(tr(lang, 'Назва посилання не може бути порожньою.', 'De naam van de koppeling mag niet leeg zijn.')); return; }
    setBezig(true);
    setFout('');
    try {
      const bij = await cloudClient.delenBijwerken({ id, naam: schoon });
      setBestaande((lijst) => lijst.map((x) => (x.id === bij.id ? bij : x)));
      if (nieuwGemaakt?.id === bij.id) setNieuwGemaakt(bij);
      setHernoemId('');
      onVeranderd();
      toon(tr(lang, 'Назву посилання оновлено.', 'Naam van de koppeling bijgewerkt.'));
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
      setBestaande((lijst) => lijst.filter((x) => x.id !== k.id));
      if (nieuwGemaakt?.id === k.id) setNieuwGemaakt(null);
      onVeranderd();
      toon(tr(lang, `Посилання «${k.naam}» миттєво відкликано.`, `Koppeling «${k.naam}» is onmiddellijk ingetrokken.`));
    } catch (e) {
      setFout(cloudFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  // Beschikbare deelopties voor een bestand
  const kanTekstDeel = Boolean(bestandVoorb && bestandVoorb.tekstRegelsTotaal !== null);
  const kanPdfDeel = Boolean(bestandVoorb && bestandVoorb.pdfPaginasTotaal !== null);
  const kanBytesDeel = Boolean(bestandVoorb && bestandVoorb.kanBytes);
  const kanBestandDeel = kanTekstDeel || kanPdfDeel || kanBytesDeel;
  const kanArchiefDeel = Boolean(bestandVoorb && bestandVoorb.archiefOndersteund && bestandVoorb.archiefIngangen.length > 0);

  // Voorvertoning van gekozen tekstregels
  const gekozenRegelsVoorbeeld = useMemo(() => {
    if (!bestandVoorb?.voorbeeldRegels.length) return [];
    const v = Math.max(1, Number(vanRegel) || 1);
    const t = Math.max(v, Number(totRegel) || v);
    const begin = Math.min(v - 1, bestandVoorb.voorbeeldRegels.length);
    const eind = Math.min(t, bestandVoorb.voorbeeldRegels.length, begin + 12);
    return bestandVoorb.voorbeeldRegels.slice(begin, eind).map((tekst, idx) => ({ nr: begin + idx + 1, tekst }));
  }, [bestandVoorb, vanRegel, totRegel]);

  const zoekFilter = boomZoek.trim().toLowerCase();

  return (
    <Laag
      lang={lang}
      soort={smal ? 'scherm' : 'paneel'}
      titel={tr(lang, `Спільний доступ — ${basisTitel}`, `Delen — ${basisTitel}`)}
      onSluit={onSluit}
      data={{ 'cvn-deel-venster': doelSleutel || 'selectie' }}
    >
      <div className='cvn-deel-omhulsel'>
        {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}

        {nieuwGemaakt && nieuwGemaakt.url ? (
          <section className='cvn-deel-succes' data-cvn-deel-gemaakt={nieuwGemaakt.id} aria-label={tr(lang, 'Готове посилання', 'Aangemaakte koppeling')}>
            <div className='cvn-deel-succes-kop'>
              <span className='cvn-deel-succes-badge'><Sparkles aria-hidden='true' />{tr(lang, 'Посилання активне', 'Koppeling is actief')}</span>
              <strong>{nieuwGemaakt.naam}</strong>
            </div>
            <div className='cvn-deel-url-balk'>
              <Link2 aria-hidden='true' />
              <input type='text' readOnly value={nieuwGemaakt.url} onFocus={(e) => e.currentTarget.select()} aria-label={tr(lang, 'Адреса спільного посилання', 'Adres van de gedeelde koppeling')} />
              <button type='button' className='cvn-knop is-hoofd is-klein' data-cvn-kopieer={nieuwGemaakt.id} onClick={() => void kopieer(nieuwGemaakt)}>
                {gekopieerdId === nieuwGemaakt.id ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
                {gekopieerdId === nieuwGemaakt.id ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Скопіювати', 'Kopiëren')}
              </button>
            </div>
            <div className='cvn-deel-succes-acties'>
              <button type='button' className='cvn-knop is-klein' onClick={() => setQrOpenId((id) => (id === nieuwGemaakt.id ? '' : nieuwGemaakt.id))}>
                <QrCode aria-hidden='true' />{tr(lang, 'QR-код', 'QR-code')}
              </button>
              <a className='cvn-knop is-klein' href={nieuwGemaakt.url} target='_blank' rel='noreferrer noopener'>
                <ExternalLink aria-hidden='true' />{tr(lang, 'Перевірити у вкладці', 'In nieuw tabblad openen')}
              </a>
              <button type='button' className='cvn-knop is-klein is-stil' onClick={() => void trekIn(nieuwGemaakt)}>
                <Trash2 aria-hidden='true' />{tr(lang, 'Відкликати', 'Intrekken')}
              </button>
            </div>
            {qrOpenId === nieuwGemaakt.id ? (
              <div className='cvn-deel-qr-vak'>
                <DeelQrSvg url={nieuwGemaakt.url} />
                <p className='cvn-hint'>{tr(lang, 'Наведіть камеру телефона, щоб миттєво відкрити це посилання.', 'Richt de telefooncamera op de code om de koppeling direct te openen.')}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* STAP 1: WAT PRECIES DELEN */}
        <section className='cvn-deel-kaart' aria-label={tr(lang, 'Обсяг спільного доступу', 'Omvang van het delen')}>
          <header className='cvn-deel-kaart-kop'>
            <Share2 aria-hidden='true' />
            <div>
              <h3>{tr(lang, 'Що саме відкрити', 'Wat wilt u delen')}</h3>
              <p>{tr(lang, 'Отримувач побачить виключно обраний вами обсяг — нічого зайвого.', 'De ontvanger ziet uitsluitend wat u hier vrijgeeft — niets erbuiten.')}</p>
            </div>
          </header>

          {ladenInfo ? (
            <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Аналізуємо структуру…', 'Structuur analyseren…')}</p>
          ) : null}

          {doel.soort === 'bestand' ? (
            <>
              <div className='cvn-deel-keuze-rij' role='radiogroup' aria-label={tr(lang, 'Рівень доступу до файла', 'Deelniveau voor bestand')}>
                <button type='button' role='radio' aria-checked={bereikStand === 'heel'} className={`cvn-deel-tegel${bereikStand === 'heel' ? ' is-actief' : ''}`} onClick={() => setBereikStand('heel')}>
                  <FileText aria-hidden='true' />
                  <strong>{tr(lang, 'Увесь файл', 'Volledig bestand')}</strong>
                  <span>{bytesTekst(lang, doel.bestand.bytes)}</span>
                </button>
                {kanBestandDeel ? (
                  <button type='button' role='radio' aria-checked={bereikStand === 'deel'} className={`cvn-deel-tegel${bereikStand === 'deel' ? ' is-actief' : ''}`} data-cvn-deel-stand='deel' onClick={() => setBereikStand('deel')}>
                    <Scissors aria-hidden='true' />
                    <strong>{tr(lang, 'Частина файла', 'Deel van bestand')}</strong>
                    <span>{tr(lang, 'Точний виріз на сервері', 'Exacte uitsnede op de server')}</span>
                  </button>
                ) : null}
                {kanArchiefDeel ? (
                  <button type='button' role='radio' aria-checked={bereikStand === 'archief'} className={`cvn-deel-tegel${bereikStand === 'archief' ? ' is-actief' : ''}`} data-cvn-deel-stand='archief' onClick={() => setBereikStand('archief')}>
                    <Archive aria-hidden='true' />
                    <strong>{tr(lang, 'Частина архіву', 'Deel van archief')}</strong>
                    <span>{tr(lang, `Елементів: ${bestandVoorb?.archiefIngangen.length || 0}`, `Onderdelen: ${bestandVoorb?.archiefIngangen.length || 0}`)}</span>
                  </button>
                ) : null}
              </div>

              {bereikStand === 'deel' && bestandVoorb ? (
                <div className='cvn-deel-subvak' data-cvn-deel-bereik=''>
                  <div className='cvn-chips' role='radiogroup' aria-label={tr(lang, 'Вид зрізу файла', 'Soort bestandsdeel')}>
                    {kanTekstDeel ? (
                      <button type='button' role='radio' aria-checked={deelSoort === 'regels'} className={`cvn-knop is-klein${deelSoort === 'regels' ? ' is-actief' : ''}`} onClick={() => setDeelSoort('regels')}>
                        <FileCode2 aria-hidden='true' />{tr(lang, `Рядки тексту (1–${bestandVoorb.tekstRegelsTotaal})`, `Tekstregels (1–${bestandVoorb.tekstRegelsTotaal})`)}
                      </button>
                    ) : null}
                    {kanPdfDeel ? (
                      <button type='button' role='radio' aria-checked={deelSoort === 'paginas'} className={`cvn-knop is-klein${deelSoort === 'paginas' ? ' is-actief' : ''}`} onClick={() => setDeelSoort('paginas')}>
                        <FileSpreadsheet aria-hidden='true' />{tr(lang, `Сторінки PDF (1–${bestandVoorb.pdfPaginasTotaal})`, `PDF-pagina’s (1–${bestandVoorb.pdfPaginasTotaal})`)}
                      </button>
                    ) : null}
                    {kanBytesDeel ? (
                      <button type='button' role='radio' aria-checked={deelSoort === 'bytes'} className={`cvn-knop is-klein${deelSoort === 'bytes' ? ' is-actief' : ''}`} onClick={() => setDeelSoort('bytes')}>
                        <Scissors aria-hidden='true' />{tr(lang, 'Діапазон байтів', 'Bytebereik')}
                      </button>
                    ) : null}
                  </div>

                  {deelSoort === 'regels' && kanTekstDeel ? (
                    <div className='cvn-deel-bereik-velden'>
                      <label>
                        <span>{tr(lang, 'З рядка', 'Vanaf regel')}</span>
                        <input type='number' min={1} max={bestandVoorb.tekstRegelsTotaal || 1} value={vanRegel} onChange={(e) => setVanRegel(e.target.value)} />
                      </label>
                      <label>
                        <span>{tr(lang, 'До рядка (включно)', 'Tot en met regel')}</span>
                        <input type='number' min={1} max={bestandVoorb.tekstRegelsTotaal || 1} value={totRegel} onChange={(e) => setTotRegel(e.target.value)} />
                      </label>
                      {gekozenRegelsVoorbeeld.length ? (
                        <div className='cvn-deel-code-voorbeeld' aria-label={tr(lang, 'Попередній перегляд обраних рядків', 'Voorbeeld van gekozen regels')}>
                          {gekozenRegelsVoorbeeld.map((r) => (
                            <div key={r.nr} className='cvn-deel-code-regel'>
                              <i>{r.nr}</i>
                              <code>{r.tekst || ' '}</code>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {deelSoort === 'paginas' && kanPdfDeel ? (
                    <div className='cvn-deel-bereik-velden'>
                      <label>
                        <span>{tr(lang, 'Зі сторінки', 'Vanaf pagina')}</span>
                        <input type='number' min={1} max={bestandVoorb.pdfPaginasTotaal || 1} value={vanPagina} onChange={(e) => setVanPagina(e.target.value)} />
                      </label>
                      <label>
                        <span>{tr(lang, 'До сторінки (включно)', 'Tot en met pagina')}</span>
                        <input type='number' min={1} max={bestandVoorb.pdfPaginasTotaal || 1} value={totPagina} onChange={(e) => setTotPagina(e.target.value)} />
                      </label>
                      <p className='cvn-hint'>{tr(lang, `У документі всього сторінок: ${bestandVoorb.pdfPaginasTotaal}. Сервер сформує новий PDF лише з обраних сторінок.`, `Totaal aantal pagina’s: ${bestandVoorb.pdfPaginasTotaal}. De server knipt een nieuwe pdf met alleen deze pagina’s.`)}</p>
                    </div>
                  ) : null}

                  {deelSoort === 'bytes' && kanBytesDeel ? (
                    <div className='cvn-deel-bereik-velden'>
                      <label>
                        <span>{tr(lang, 'Початковий байт (від 0)', 'Startbyte (vanaf 0)')}</span>
                        <input type='number' min={0} max={Math.max(0, bestandVoorb.totaalBytes - 1)} value={vanByte} onChange={(e) => setVanByte(e.target.value)} />
                      </label>
                      <label>
                        <span>{tr(lang, 'Кінцевий байт (включно)', 'Eindbyte (inclusief)')}</span>
                        <input type='number' min={0} max={Math.max(0, bestandVoorb.totaalBytes - 1)} value={totByte} onChange={(e) => setTotByte(e.target.value)} />
                      </label>
                      <p className='cvn-hint'>{tr(lang, `Загальний розмір: ${bestandVoorb.totaalBytes} Б (${bytesTekst(lang, bestandVoorb.totaalBytes)}). Жоден байт поза діапазоном не залишає сервер.`, `Totale grootte: ${bestandVoorb.totaalBytes} B (${bytesTekst(lang, bestandVoorb.totaalBytes)}). Geen enkele byte buiten dit bereik verlaat de server.`)}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {bereikStand === 'archief' && bestandVoorb ? (
                <div className='cvn-deel-subvak'>
                  <input type='search' value={boomZoek} onChange={(e) => setBoomZoek(e.target.value)} placeholder={tr(lang, 'Фільтр елементів архіву…', 'Filter onderdelen van archief…')} aria-label={tr(lang, 'Фільтр елементів архіву', 'Onderdelen filteren')} />
                  <div className='cvn-deel-boomlijst'>
                    {bestandVoorb.archiefIngangen
                      .filter((i) => !zoekFilter || i.pad.toLowerCase().includes(zoekFilter))
                      .slice(0, 250)
                      .map((ing: CloudArchiefIngang) => {
                        const aan = gekozenArchiefPaden.includes(ing.pad);
                        return (
                          <label key={ing.pad} className={`cvn-deel-boomrij${aan ? ' is-aan' : ''}`}>
                            <input type='checkbox' checked={aan} onChange={() => setGekozenArchiefPaden((oud) => (aan ? oud.filter((p) => p !== ing.pad) : [...oud, ing.pad]))} />
                            {ing.map ? <Folder aria-hidden='true' /> : <FileText aria-hidden='true' />}
                            <span className='cvn-deel-boompad'>{ing.pad}</span>
                            {!ing.map ? <small>{bytesTekst(lang, ing.bytes)}</small> : null}
                          </label>
                        );
                      })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {doel.soort === 'map' ? (
            <>
              <div className='cvn-deel-keuze-rij' role='radiogroup' aria-label={tr(lang, 'Рівень доступу до теки', 'Deelniveau voor map')}>
                <button type='button' role='radio' aria-checked={mapAlles} className={`cvn-deel-tegel${mapAlles ? ' is-actief' : ''}`} onClick={() => setMapAlles(true)}>
                  <Folder aria-hidden='true' />
                  <strong>{tr(lang, 'Уся тека цілком', 'Volledige map')}</strong>
                  <span>{tr(lang, 'Разом із вкладеними підтеками', 'Inclusief alle submappen')}</span>
                </button>
                <button type='button' role='radio' aria-checked={!mapAlles} className={`cvn-deel-tegel${!mapAlles ? ' is-actief' : ''}`} onClick={() => setMapAlles(false)}>
                  <Scissors aria-hidden='true' />
                  <strong>{tr(lang, 'Вибрані елементи теки', 'Gekozen onderdelen in map')}</strong>
                  <span>{tr(lang, 'Лише позначені підтеки чи файли', 'Alleen aangevinkte items')}</span>
                </button>
              </div>
              {!mapAlles && mapVoorb ? (
                <div className='cvn-deel-subvak'>
                  <input type='search' value={boomZoek} onChange={(e) => setBoomZoek(e.target.value)} placeholder={tr(lang, 'Пошук у цій теці…', 'Zoeken in deze map…')} aria-label={tr(lang, 'Пошук у теці', 'Zoeken in map')} />
                  <div className='cvn-deel-boomlijst'>
                    {mapVoorb.submappen
                      .filter((m) => !zoekFilter || m.naam.toLowerCase().includes(zoekFilter))
                      .map((m) => {
                        const aan = gekozenSubMappen.includes(m.id);
                        return (
                          <label key={`m-${m.id}`} className={`cvn-deel-boomrij${aan ? ' is-aan' : ''}`}>
                            <input type='checkbox' checked={aan} onChange={() => setGekozenSubMappen((oud) => (aan ? oud.filter((x) => x !== m.id) : [...oud, m.id]))} />
                            <Folder aria-hidden='true' />
                            <span className='cvn-deel-boompad'>{m.naam}</span>
                            <small>{tr(lang, 'підтека', 'submap')}</small>
                          </label>
                        );
                      })}
                    {mapVoorb.bestanden
                      .filter((b) => !zoekFilter || b.naam.toLowerCase().includes(zoekFilter))
                      .map((b) => {
                        const aan = gekozenMapBestanden.includes(b.id);
                        return (
                          <label key={`b-${b.id}`} className={`cvn-deel-boomrij${aan ? ' is-aan' : ''}`}>
                            <input type='checkbox' checked={aan} onChange={() => setGekozenMapBestanden((oud) => (aan ? oud.filter((x) => x !== b.id) : [...oud, b.id]))} />
                            <FileText aria-hidden='true' />
                            <span className='cvn-deel-boompad'>{b.naam}</span>
                            <small>{bytesTekst(lang, b.bytes)}</small>
                          </label>
                        );
                      })}
                    {!mapVoorb.submappen.length && !mapVoorb.bestanden.length ? (
                      <p className='cvn-hint'>{tr(lang, 'У теці наразі немає вкладених елементів.', 'Deze map bevat nog geen onderdelen.')}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {doel.soort === 'selectie' ? (
            <p className='cvn-hint'>
              {tr(lang, `Групове посилання охопить вибраних елементів: ${doel.bestandIds.length + (doel.mapIds?.length || 0)}.`, `Deze groepskoppeling deelt ${doel.bestandIds.length + (doel.mapIds?.length || 0)} geselecteerde onderdelen.`)}
            </p>
          ) : null}
        </section>

        {/* STAP 2: NAAM EN NOTITIE */}
        <section className='cvn-deel-kaart' aria-label={tr(lang, 'Назва та опис посилання', 'Naam en toelichting')}>
          <div className='cvn-deel-velden-grid'>
            <label className='cvn-deel-veld'>
              <span>{tr(lang, 'Назва посилання (для вас і отримувача)', 'Naam van de koppeling')}</span>
              <input
                type='text'
                value={naam}
                maxLength={CLOUD_VNEXT_LIMIETEN.naamMax}
                data-cvn-deel-naam=''
                placeholder={tr(lang, 'Наприклад: Документи для партнера — Листопад', 'Bijv.: Documenten voor klant — November')}
                onChange={(e) => setNaam(e.target.value)}
              />
            </label>
            <label className='cvn-deel-veld'>
              <span>{tr(lang, 'Супровідна нотатка (необов’язково)', 'Begeleidende notitie (optioneel)')}</span>
              <input
                type='text'
                value={notitie}
                maxLength={600}
                placeholder={tr(lang, 'Коротке пояснення на сторінці відкриття…', 'Korte uitleg bovenaan de deelpagina…')}
                onChange={(e) => setNotitie(e.target.value)}
              />
            </label>
          </div>
        </section>

        {/* STAP 3: HOE DELEN (MODUS + RECHTEN + WACHTWOORD / ACCOUNTS) */}
        <section className='cvn-deel-kaart' aria-label={tr(lang, 'Спосіб доступу та права', 'Toegangswijze en rechten')}>
          <header className='cvn-deel-kaart-kop'>
            <Users aria-hidden='true' />
            <div>
              <h3>{tr(lang, 'Спосіб надання доступу', 'Hoe wilt u delen')}</h3>
              <p>{tr(lang, 'Відкрите посилання або персональний доступ лише після входу в обліковий запис.', 'Een directe koppeling of uitsluitend toegang na aanmelden met een geregistreerd account.')}</p>
            </div>
          </header>

          <div className='cvn-deel-keuze-rij' role='radiogroup' aria-label={tr(lang, 'Режим поширення', 'Deelmodus')}>
            <button type='button' role='radio' aria-checked={modus === 'link'} className={`cvn-deel-tegel${modus === 'link' ? ' is-actief' : ''}`} data-cvn-deel-modus='link' onClick={() => setModus('link')}>
              <Globe aria-hidden='true' />
              <strong>{tr(lang, 'За посиланням', 'Met een koppeling')}</strong>
              <span>{tr(lang, 'Для кожного, кому ви передасте адресу', 'Voor iedereen met deze link')}</span>
            </button>
            <button type='button' role='radio' aria-checked={modus === 'accounts'} className={`cvn-deel-tegel${modus === 'accounts' ? ' is-actief' : ''}`} data-cvn-deel-modus='accounts' onClick={() => setModus('accounts')}>
              <UserCheck aria-hidden='true' />
              <strong>{tr(lang, 'Зареєстрованим обліковим записам', 'Geregistreerde accounts')}</strong>
              <span>{tr(lang, 'Перевірка особи за електронною поштою', 'Alleen na aanmelden met e-mailadres')}</span>
            </button>
          </div>

          {modus === 'accounts' ? (
            <div className='cvn-deel-subvak' data-cvn-deel-accounts=''>
              <div className='cvn-deel-account-invoer'>
                <input
                  type='email'
                  value={emailVeld}
                  placeholder={tr(lang, 'Електронна адреса отримувача…', 'E-mailadres van ontvanger…')}
                  aria-label={tr(lang, 'Електронна адреса отримувача', 'E-mailadres van ontvanger')}
                  onChange={(e) => setEmailVeld(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void voegOntvangerToe(); } }}
                />
                <button type='button' className='cvn-knop is-klein' disabled={zoekEmailBezig} onClick={() => void voegOntvangerToe()}>
                  <Plus aria-hidden='true' />{tr(lang, 'Додати отримувача', 'Ontvanger toevoegen')}
                </button>
              </div>
              {ontvangers.length ? (
                <ul className='cvn-deel-ontvangers'>
                  {ontvangers.map((o) => (
                    <li key={o.email}>
                      <span className='cvn-deel-ontvanger-kern'>
                        <strong>{o.naam || o.email}</strong>
                        <small>{o.email}</small>
                      </span>
                      <span className={`cvn-deel-badge ${o.geregistreerd ? 'is-ok' : 'is-warn'}`}>
                        {o.geregistreerd ? tr(lang, 'Зареєстрований на сайті', 'Geregistreerd account') : tr(lang, 'Очікує реєстрації', 'Nog niet geregistreerd')}
                      </span>
                      <button type='button' className='cvn-icoonknop' aria-label={tr(lang, `Прибрати ${o.email}`, `${o.email} verwijderen`)} onClick={() => setOntvangers((lijst) => lijst.filter((x) => x.email !== o.email))}>
                        <X aria-hidden='true' />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='cvn-hint'>{tr(lang, 'Зареєстровані отримувачі одразу отримають сповіщення і побачать матеріал у вкладці «Спільний доступ → Відкриті для мене».', 'Geregistreerde ontvangers krijgen direct een melding en zien dit onderdeel bij «Gedeeld → Met mij gedeeld».')}</p>
              )}
            </div>
          ) : (
            <div className='cvn-deel-subvak'>
              <label className='cvn-deel-schakel'>
                <input type='checkbox' checked={wachtwoordAan} onChange={(e) => setWachtwoordAan(e.target.checked)} />
                <KeyRound aria-hidden='true' />
                <span>{tr(lang, 'Додатково захистити посилання паролем', 'Koppeling extra beveiligen met een wachtwoord')}</span>
              </label>
              {wachtwoordAan ? (
                <div className='cvn-deel-ww-rij'>
                  <input
                    type={toonWw ? 'text' : 'password'}
                    value={wachtwoord}
                    minLength={4}
                    maxLength={128}
                    placeholder={tr(lang, 'Мінімум 4 символи…', 'Minimaal 4 tekens…')}
                    aria-label={tr(lang, 'Пароль для відкриття посилання', 'Wachtwoord voor de koppeling')}
                    onChange={(e) => setWachtwoord(e.target.value)}
                  />
                  <button type='button' className='cvn-icoonknop' onClick={() => setToonWw((v) => !v)} aria-label={toonWw ? tr(lang, 'Сховати пароль', 'Wachtwoord verbergen') : tr(lang, 'Показати пароль', 'Wachtwoord tonen')}>
                    {toonWw ? <EyeOff aria-hidden='true' /> : <Eye aria-hidden='true' />}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <div className='cvn-deel-rechten-rij' role='radiogroup' aria-label={tr(lang, 'Права отримувача', 'Rechten van ontvanger')}>
            <button type='button' role='radio' aria-checked={rechten === 'downloaden'} className={`cvn-knop is-klein${rechten === 'downloaden' ? ' is-actief' : ''}`} onClick={() => setRechten('downloaden')}>
              {tr(lang, 'Перегляд і завантаження', 'Bekijken en downloaden')}
            </button>
            <button type='button' role='radio' aria-checked={rechten === 'bekijken'} className={`cvn-knop is-klein${rechten === 'bekijken' ? ' is-actief' : ''}`} onClick={() => setRechten('bekijken')}>
              {tr(lang, 'Лише перегляд на сайті', 'Alleen online bekijken')}
            </button>
          </div>
        </section>

        {/* STAP 4: TIJD, TERMIJN EN LIMIETEN */}
        <section className='cvn-deel-kaart' aria-label={tr(lang, 'Термін дії та обмеження', 'Geldigheid en limieten')}>
          <header className='cvn-deel-kaart-kop'>
            <CalendarClock aria-hidden='true' />
            <div>
              <h3>{tr(lang, 'Керування часом і межами', 'Tijd en gebruikslimieten')}</h3>
              <p>{tr(lang, 'Автоматичне закриття доступу за часом або після заданої кількості переглядів.', 'Sluit toegang automatisch na een gekozen termijn of aantal weergaven.')}</p>
            </div>
          </header>

          <div className='cvn-chips' role='radiogroup' aria-label={tr(lang, 'Термін дії посилання', 'Vervaltermijn')}>
            {([
              ['onbeperkt', tr(lang, 'Безстроково', 'Onbeperkt')],
              ['1u', tr(lang, '1 година', '1 uur')],
              ['24u', tr(lang, '24 години', '24 uur')],
              ['7d', tr(lang, '7 днів', '7 dagen')],
              ['30d', tr(lang, '30 днів', '30 dagen')],
              ['eigen', tr(lang, 'Власна дата', 'Eigen datum')],
            ] as Array<[TermijnKeuze, string]>).map(([sleutel, tekst]) => (
              <button key={sleutel} type='button' role='radio' aria-checked={termijn === sleutel} className={`cvn-knop is-klein${termijn === sleutel ? ' is-actief' : ''}`} onClick={() => setTermijn(sleutel)}>
                {tekst}
              </button>
            ))}
          </div>

          {termijn === 'eigen' ? (
            <label className='cvn-deel-veld'>
              <span>{tr(lang, 'Діє до (дата й час)', 'Geldig tot (datum en tijd)')}</span>
              <input type='datetime-local' value={eigenVerloopt} onChange={(e) => setEigenVerloopt(e.target.value)} />
            </label>
          ) : null}

          <button type='button' className='cvn-deel-meer-knop' aria-expanded={extraGrenzenOpen} onClick={() => setExtraGrenzenOpen((v) => !v)}>
            {extraGrenzenOpen
              ? tr(lang, 'Згорнути відкладений старт і межі переглядів', 'Uitgestelde start en tellers verbergen')
              : tr(lang, 'Налаштувати початок дії та межі переглядів / завантажень', 'Starttijd en weergave-/downloadlimieten instellen')}
          </button>

          {extraGrenzenOpen ? (
            <div className='cvn-deel-velden-grid'>
              <label className='cvn-deel-veld'>
                <span>{tr(lang, 'Початок дії (відкладений доступ)', 'Actief vanaf (uitgestelde toegang)')}</span>
                <input type='datetime-local' value={actiefVanafVeld} onChange={(e) => setActiefVanafVeld(e.target.value)} />
              </label>
              <label className='cvn-deel-veld'>
                <span>{tr(lang, 'Межа переглядів (разів)', 'Maximaal aantal weergaven')}</span>
                <input type='number' min={1} max={1000000} placeholder={tr(lang, 'Без межі', 'Geen limiet')} value={maxWeergavenVeld} onChange={(e) => setMaxWeergavenVeld(e.target.value)} />
              </label>
              {rechten === 'downloaden' ? (
                <label className='cvn-deel-veld'>
                  <span>{tr(lang, 'Межа завантажень (разів)', 'Maximaal aantal downloads')}</span>
                  <input type='number' min={1} max={1000000} placeholder={tr(lang, 'Без межі', 'Geen limiet')} value={maxDownloadsVeld} onChange={(e) => setMaxDownloadsVeld(e.target.value)} />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className='cvn-deel-hoofdknoppen'>
            <button type='button' className='cvn-knop is-hoofd' data-cvn-deel-maak='' disabled={bezig} onClick={() => void maakKoppeling()}>
              {bezig ? <LoaderCircle className='cvn-draai' aria-hidden='true' /> : <Link2 aria-hidden='true' />}
              {tr(lang, 'Створити посилання та скопіювати', 'Koppeling maken en kopiëren')}
            </button>
            <button type='button' className='cvn-knop' onClick={onSluit}>{tr(lang, 'Закрити', 'Sluiten')}</button>
          </div>
        </section>

        {/* BESTAANDE KOPPELINGEN VOOR DIT DOEL */}
        {bestaande.length > 0 ? (
          <section className='cvn-deel-kaart' aria-label={tr(lang, 'Активні посилання цього об’єкта', 'Actieve koppelingen voor dit item')}>
            <header className='cvn-deel-kaart-kop'>
              <ShieldAlert aria-hidden='true' />
              <div>
                <h3>{tr(lang, `Чинні посилання (${bestaande.length})`, `Bestaande koppelingen (${bestaande.length})`)}</h3>
                <p>{tr(lang, 'Жива статистика переглядів і миттєве керування кожним посиланням.', 'Actuele weergavetellers en direct beheer per koppeling.')}</p>
              </div>
            </header>
            <ul className='cvn-deel-bestaande-lijst'>
              {bestaande.map((k) => (
                <li key={k.id} className='cvn-deel-bestaande-rij' data-cvn-koppeling={k.id}>
                  <div className='cvn-deel-bestaande-boven'>
                    {hernoemId === k.id ? (
                      <div className='cvn-deel-inline-hernoem'>
                        <input value={hernoemWaarde} maxLength={CLOUD_VNEXT_LIMIETEN.naamMax} onChange={(e) => setHernoemWaarde(e.target.value)} aria-label={tr(lang, 'Нова назва посилання', 'Nieuwe naam voor koppeling')} />
                        <button type='button' className='cvn-icoonknop' onClick={() => void bewaarKoppelingNaam(k.id)} aria-label={tr(lang, 'Зберегти назву', 'Naam opslaan')}><Check aria-hidden='true' /></button>
                        <button type='button' className='cvn-icoonknop' onClick={() => setHernoemId('')} aria-label={tr(lang, 'Скасувати', 'Annuleren')}><X aria-hidden='true' /></button>
                      </div>
                    ) : (
                      <strong className='cvn-deel-bestaande-naam' onClick={() => { setHernoemId(k.id); setHernoemWaarde(k.naam); }} title={tr(lang, 'Натисніть, щоб змінити назву посилання', 'Klik om de naam van de koppeling te wijzigen')}>
                        {k.naam}
                      </strong>
                    )}
                    <span className={`cvn-deel-status is-${k.status}`}>{statusLabel(lang, k.status)}</span>
                  </div>
                  <div className='cvn-deel-bestaande-cijfers'>
                    <span>{tr(lang, `Переглядів: ${k.weergavenAantal}`, `Weergaven: ${k.weergavenAantal}`)}{k.maxWeergaven ? `/${k.maxWeergaven}` : ''}</span>
                    <span>{tr(lang, `Завантажень: ${k.downloadsAantal}`, `Downloads: ${k.downloadsAantal}`)}{k.maxDownloads ? `/${k.maxDownloads}` : ''}</span>
                    <span>{tr(lang, `Відвідувачів: ${k.uniekeBezoekers}`, `Bezoekers: ${k.uniekeBezoekers}`)}</span>
                    {k.verlooptOp ? <span>{tr(lang, `До ${datumTekst(lang, k.verlooptOp)}`, `Tot ${datumTekst(lang, k.verlooptOp)}`)}</span> : <span>{tr(lang, 'Безстроково', 'Onbeperkt')}</span>}
                    {k.laatstBekekenOp ? <span>{tr(lang, `Востаннє: ${geledenTekst(lang, k.laatstBekekenOp)}`, `Laatst: ${geledenTekst(lang, k.laatstBekekenOp)}`)}</span> : null}
                  </div>
                  <div className='cvn-deel-bestaande-knoppen'>
                    {k.url ? (
                      <button type='button' className='cvn-knop is-klein' onClick={() => void kopieer(k)}>
                        {gekopieerdId === k.id ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
                        {gekopieerdId === k.id ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}
                      </button>
                    ) : null}
                    <button type='button' className='cvn-knop is-klein' onClick={() => void schakelPauze(k)}>
                      {k.gepauzeerd ? <Play aria-hidden='true' /> : <Pause aria-hidden='true' />}
                      {k.gepauzeerd ? tr(lang, 'Відновити', 'Hervatten') : tr(lang, 'Призупинити', 'Pauzeren')}
                    </button>
                    <button type='button' className='cvn-knop is-klein is-stil' onClick={() => void trekIn(k)}>
                      <RotateCcw aria-hidden='true' />{tr(lang, 'Відкликати', 'Intrekken')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Laag>
  );
}
