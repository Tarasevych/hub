// «Нове оновлення» — покроковий майстер завантаження пакета (замінює колишній «крок 5»):
//   1 Файл → 2 Перевірка (вміст пакета, опис змін з архіву) → 3 Завантаження → 4 Схвалення passkey → 5 Встановлення.
// Кожен крок має стан (чекає / зараз / готово). Коли крок завершено, сторінка сама прокручується до наступного й підсвічує його головну кнопку.
// Стан майстра передається вгору (onFlow), щоб чотири етапи «Підготовка / Схвалення / Перевірки / Розгортання» починалися заново для нового файлу.
import UitgaveBeschrijving, { Deelnemers } from './UitgaveBeschrijving';
import KopieerBlokKnop from './KopieerBlokKnop';
import { nietNieuwerUitleg } from './versie-uitleg';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, ArrowRight, Bot, CalendarClock, CheckCircle2, Copy, File as FileIcoon, FileArchive, FileCode, FileImage, FileText, Files, Fingerprint, FolderArchive, GitCommitHorizontal, HardDrive, Loader2, Music, Package, PackageCheck, Rocket, RotateCcw, ShieldCheck, Tag, UploadCloud, UserRound, Video, X, XCircle, FileSpreadsheet, Cpu, DatabaseBackup, Activity, Undo2, LifeBuoy, type LucideIcon } from 'lucide-react';
import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import { leesPakket, naarBase64, type PakketInfo } from '../platform/tar-lezen';
import { isLeesfout, leesDeel, leesKop } from '../../shared/bestand-lezen';
import { bestandLeesUitleg, bestandLeesfoutCode } from '../../shared/foutuitleg';
import { meldAfbreking } from './poging-melden';
import Voorcontrole from './Voorcontrole';
import { commitWeergave } from '../../shared/bron-commit';
import { herkenBestand, type Pictogram, type Soort } from './bestandssoort';
import { datum, mb, tr, type Flow, type Lang, type Overzicht, type VoorcontroleUit } from './types';
import './upload.css';

type StapId = 'bestand' | 'controle' | 'upload' | 'goedkeuren' | 'installeren';
// kort: label op smalle schermen (≤ 640 px), zodat vijf stappen naast elkaar passen zonder aan elkaar te plakken (audit 18.10.2026, 8c).
const STAPPEN: Array<{ id: StapId; Icoon: LucideIcon; uk: string; nl: string; kortUk: string; kortNl: string }> = [
  { id: 'bestand', Icoon: FolderArchive, uk: 'Файл', nl: 'Bestand', kortUk: 'Файл', kortNl: 'Bestand' },
  { id: 'controle', Icoon: PackageCheck, uk: 'Перевірка', nl: 'Controle', kortUk: 'Перев.', kortNl: 'Contr.' },
  { id: 'upload', Icoon: UploadCloud, uk: 'Завантаження', nl: 'Uploaden', kortUk: 'Завант.', kortNl: 'Upload' },
  { id: 'goedkeuren', Icoon: Fingerprint, uk: 'Схвалення', nl: 'Goedkeuren', kortUk: 'Схвал.', kortNl: 'Akkoord' },
  { id: 'installeren', Icoon: Rocket, uk: 'Встановлення', nl: 'Installeren', kortUk: 'Встан.', kortNl: 'Install.' },
];
const PICT: Record<Pictogram, LucideIcon> = { archief: FileArchive, tekst: FileText, afbeelding: FileImage, code: FileCode, tabel: FileSpreadsheet, programma: Cpu, video: Video, audio: Music, onbekend: FileIcoon };

const PROBLEEM: Record<string, [string, string, string, string]> = {
  GEEN_GZIP: ['Це не архів .tar.gz.', 'Dit is geen .tar.gz-archief.', 'Оберіть файл mijn-ruimte-….tar.gz.', 'Kies het bestand mijn-ruimte-….tar.gz.'],
  TAR_ONGELDIG: ['Архів пошкоджений або це не tar.', 'Het archief is beschadigd of geen tar.', 'Завантажте файл ще раз або попросіть зібрати пакет заново.', 'Download het bestand opnieuw of laat het pakket opnieuw bouwen.'],
  GEEN_VERSIE: ['В архіві немає файлу UITROL-VERSIE.', 'Het archief bevat geen UITROL-VERSIE.', 'Такий архів можна встановити лише через SSH. Попросіть пакет «для схвалення з телефона».', 'Zo’n archief kan alleen via SSH. Vraag een pakket «voor goedkeuring via de telefoon».'],
  VERSIE_ONGELDIG: ['UITROL-VERSIE має вигляд РРРРММДД-ГГХХСС.', 'UITROL-VERSIE moet de vorm JJJJMMDD-UUMMSS hebben.', 'Виправте файл UITROL-VERSIE у пакеті.', 'Corrigeer het bestand UITROL-VERSIE in het pakket.'],
  MEER_MAPPEN: ['В архіві має бути рівно одна верхня тека.', 'Het archief moet precies één bovenmap hebben.', 'Зберіть пакет командою git archive --prefix=mijn-ruimte-ВЕРСІЯ/.', 'Bouw het pakket met git archive --prefix=mijn-ruimte-VERSIE/.'],
  ONVEILIG_PAD: ['Архів містить шляхи поза текою.', 'Het archief bevat paden buiten de map.', 'Такий пакет небезпечний — його не можна встановити.', 'Zo’n pakket is onveilig — het kan niet worden geïnstalleerd.'],
  GEEN_GEWOON_BESTAND: ['Архів містить посилання чи інші недозволені елементи.', 'Het archief bevat links of andere niet-toegestane onderdelen.', 'Дозволені лише звичайні файли та теки.', 'Alleen gewone bestanden en mappen zijn toegestaan.'],
  GEEN_INSTALLER: ['В архіві немає deploy/installeer-app.sh.', 'deploy/installeer-app.sh ontbreekt in het archief.', 'Це не пакет Mijn Ruimte.', 'Dit is geen Mijn Ruimte-pakket.'],
  TE_GROOT: ['Файл завеликий для завантаження з пристрою.', 'Het bestand is te groot om vanaf het apparaat te uploaden.', 'Максимум 300 МБ.', 'Maximaal 300 MB.'],
  GEEN_BRON_COMMIT: ['У пакеті немає дійсного BRON-COMMIT — встановлення неможливе.', 'Het pakket heeft geen geldige BRON-COMMIT — installeren is niet mogelijk.', 'Зберіть пакет із git (deploy/uitrol/maak-voorstelpakket.sh пише коміт сам) або вкажіть явно --zonder-git "причина". Без коміту неможливо сказати, який код працює (deploy/REGELS-UITROLPAKKET.md).', 'Bouw het pakket vanuit git (deploy/uitrol/maak-voorstelpakket.sh schrijft de commit zelf) of geef uitdrukkelijk --zonder-git "reden". Zonder commit is niet te zeggen welke code draait (deploy/REGELS-UITROLPAKKET.md).'],
  GEEN_SAMENVATTING: ['Опису змін немає — встановлення неможливе.', 'Er is geen beschrijving van de wijzigingen — installeren is niet mogelijk.', 'Додайте до архіву текстовий файл SAMENVATTING (що змінено і для чого, щонайменше 20 символів). Його заповнює той, хто збирає пакет.', 'Voeg een tekstbestand SAMENVATTING aan het archief toe (wat er verandert en waarom, minstens 20 tekens). Degene die het pakket bouwt vult het in.'],
  SAMENVATTING_KORT: ['Опис змін закороткий (мінімум 20 символів).', 'De beschrijving is te kort (minstens 20 tekens).', 'Доповніть файл SAMENVATTING в архіві.', 'Vul het bestand SAMENVATTING in het archief aan.'],
  GEEN_AUTEUR: ['В архіві немає файлу AUTEUR (хто автор випуску).', 'Het archief bevat geen AUTEUR (wie de auteur is).', 'Додайте файл AUTEUR.', 'Voeg het bestand AUTEUR toe.'],
  AUTEUR_KORT: ['AUTEUR закороткий (мінімум 3 символи).', 'AUTEUR is te kort (minstens 3 tekens).', '', ''],
  GEEN_AGENT: ['В архіві немає файлу AGENT (через якого агента зроблено).', 'Het archief bevat geen AGENT (via welke agent gemaakt).', 'Додайте файл AGENT, наприклад claude.', 'Voeg het bestand AGENT toe, bijv. claude.'],
  AGENT_ONGELDIG: ['AGENT має бути як-от claude / cursor / gpt (малі літери, цифри, дефіс).', 'AGENT moet bv. claude / cursor / gpt zijn (kleine letters, cijfers, streepje).', '', ''],
  GEEN_MANIFEST: ['У пакеті немає UITROL-MANIFEST.json (опис українською й нідерландською та учасники) — для нових випусків він обов’язковий.', 'Het pakket heeft geen UITROL-MANIFEST.json (beschrijving in het Oekraïens en Nederlands en deelnemers) — verplicht voor nieuwe releases.', 'Зберіть пакет скриптом deploy/uitrol/maak-voorstelpakket.sh з MANIFEST=шлях-до-файлу (див. deploy/REGELS-UITROLPAKKET.md §5).', 'Bouw het pakket met deploy/uitrol/maak-voorstelpakket.sh en MANIFEST=pad (zie deploy/REGELS-UITROLPAKKET.md §5).'],
  MANIFEST_ONGELDIG: ['UITROL-MANIFEST.json заповнено неповно або неправильно — поля нижче.', 'UITROL-MANIFEST.json is onvolledig of onjuist — zie de velden hieronder.', 'Виправте названі поля й зберіть пакет ще раз.', 'Herstel de genoemde velden en bouw het pakket opnieuw.'],
  NIET_NIEUWER: ['Версія не новіша за встановлену.', 'De versie is niet nieuwer dan de geïnstalleerde.', 'Сервер відхилить такий пакет. Потрібна новіша UITROL-VERSIE.', 'De server weigert zo’n pakket. Een nieuwere UITROL-VERSIE is nodig.'],
};
// Elk lezen van de schijf gaat via shared/bestand-lezen.ts (BestandLeesfout), nooit rauw: eigenaar 20.10.2026.
const bestandKop = (f: File) => leesKop(f, 512);
const versieDatum = (v: string, lang: Lang) => { const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(v); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : ''; };
const WACHT = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const GEEN_HERHALING = ['STATUS_ONGELDIG', 'NIET_GEVONDEN', 'DATA_ONGELDIG', 'TE_VEEL_DATA', 'GEEN_VOORBEREIDER_GRANT', 'STUK_TE_GROOT'];
const EINDE = ['geinstalleerd', 'mislukt', 'geweigerd', 'afgewezen', 'verlopen', 'afgebroken'];

function Tegel({ Icoon, label, waarde, mono = false, kopieer }: { Icoon: LucideIcon; label: string; waarde: string; mono?: boolean; kopieer?: boolean }) {
  const [ok, setOk] = useState(false);
  return <div className='ut-tegel'><span className='ut-tegel-pict'><Icoon aria-hidden='true' /></span>
    <span className='ut-tegel-tekst'><small>{label}</small><b className={mono ? 'ut-mono' : undefined} title={waarde}>{waarde || '—'}</b></span>
    {kopieer && waarde ? <button type='button' className='ut-tegel-kopie' aria-label={label} onClick={() => { void navigator.clipboard?.writeText(waarde).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1500); }).catch(() => undefined); }}>{ok ? <CheckCircle2 aria-hidden='true' /> : <Copy aria-hidden='true' />}</button> : null}
  </div>;
}

type Props = {
  lang: Lang; context: Record<string, unknown>; data: Overzicht; busy: string; klaar: boolean; kanPasskey: boolean;
  doe: (sleutel: string, run: () => Promise<string | void>) => Promise<void>; laden: () => Promise<void>; goedkeurenId: (id: string) => void;
  onFlow: (f: Flow) => void; onNieuwId: (id: string) => void; naarLive: () => void;
};

export default function Upload({ lang, context, data, busy, klaar, kanPasskey, doe, laden, goedkeurenId, onFlow, onNieuwId, naarLive }: Props) {
  const [bestand, setBestand] = useState<File | null>(null);
  const [soort, setSoort] = useState<Soort | null>(null);
  const [analyse, setAnalyse] = useState<{ info: PakketInfo; sha256: string } | null>(null);
  const [bezigLezen, setBezigLezen] = useState(false);
  const [voortgang, setVoortgang] = useState<number | null>(null);
  const [verzonden, setVerzonden] = useState(0);
  const [nieuwId, setNieuwId] = useState('');
  const [serverCheck, setServerCheck] = useState<VoorcontroleUit | null>(null);
  const [sleep, setSleep] = useState(false);
  // Leesfout van de schijf (File API): code `BESTAND_LEZEN|<naam>`, hoeveel procent er al verstuurd was, en of de gebruiker
  // «Обрати файл ще раз» koos (dan gaat de upload na de nieuwe keuze zelf verder waar hij stopte).
  const [leesfout, setLeesfout] = useState<{ code: string; procent: number | null; verstuurd: number } | null>(null);
  const [hervatWens, setHervatWens] = useState(false);
  const [puls, setPuls] = useState<StapId | ''>('');
  const invoer = useRef<HTMLInputElement>(null);
  // Wat er NU loopt, voor het geval het tabblad sluit of de pagina wordt verlaten: dan meldt de pagina de afbreking nog eerlijk
  // als «обірвано без причини» (de browser weet op dat moment echt niets meer). Zonder dit verdween zo'n poging uit de geschiedenis.
  const lopend = useRef<{ voorstelId: string; versie: string; sha256: string; bytes: number; verstuurd: number; bestand: string } | null>(null);
  const refs = useRef<Partial<Record<StapId, HTMLElement | null>>>({});
  const vorigeStap = useRef<StapId | null>(null);
  const maxBytes = data.limieten.maxBytes || 300 * 1024 * 1024;
  const actieveVersie = data.actieveVersie || '';
  const beschrijvingRef = useRef<HTMLDivElement | null>(null);
  const mijnGrant = data.voorbereiders.find((g) => g.status === 'actief' && g.soort === 'account' && !!data.ik && g.onderwerp === data.ik.id);

  const nieuw = useMemo(() => data.voorstellen.find((v) => v.id === nieuwId), [data.voorstellen, nieuwId]);
  const hervatbaar = useMemo(() => (analyse && bestand && !analyse.info.problemen.length
    ? data.voorstellen.find((v) => v.status === 'uploaden' && v.versie === analyse.info.versie && v.sha256 === analyse.sha256 && v.bytes === bestand.size) : undefined), [data.voorstellen, analyse, bestand]);
  const onvoltooid = data.voorstellen.filter((v) => v.status === 'uploaden' && v.id !== hervatbaar?.id);

  // Problemen: wat tar-lezen vond + «niet nieuwer dan de actieve versie» (root en de voorcontrole van de site weigeren dat ook).
  const problemen = useMemo(() => {
    const p = [...(analyse?.info.problemen || [])];
    if (analyse && analyse.info.versie && /^\d{8}-\d{6}$/.test(analyse.info.versie) && actieveVersie && !(analyse.info.versie > actieveVersie) && !p.includes('NIET_NIEUWER')) p.push('NIET_NIEUWER');
    return p;
  }, [analyse, actieveVersie]);

  const actief: StapId = !bestand || !soort || !soort.ok ? 'bestand'
    : bezigLezen || !analyse || problemen.length ? 'controle'
    : serverCheck && !serverCheck.ok ? 'upload'
    : !nieuw ? 'upload'
    : nieuw.status === 'wacht-op-goedkeuring' ? 'goedkeuren' : 'installeren';
  const idx = STAPPEN.findIndex((s) => s.id === actief);
  const eindStand = !!nieuw && EINDE.includes(nieuw.status);

  const wis = useCallback(() => {
    setBestand(null); setSoort(null); setAnalyse(null); setNieuwId(''); onNieuwId(''); setVoortgang(null); setServerCheck(null); setBezigLezen(false); setLeesfout(null);
    if (invoer.current) invoer.current.value = '';
  }, [onNieuwId]);

  // Tabblad gesloten of pagina verlaten tijdens het uploaden: de poging wordt nog gemeld, maar EERLIJK — zonder reden. De browser
  // weet op dat moment niets meer dan dat er is afgebroken; de geschiedenis mag daar geen oorzaak bij verzinnen (punt 6, eigenaar).
  useEffect(() => {
    const weg = () => { const l = lopend.current; if (!l) return; lopend.current = null; meldAfbreking(context, { etappe: 'uploaden', code: '', ...l }); };
    window.addEventListener('pagehide', weg);
    return () => { window.removeEventListener('pagehide', weg); };
  }, [context]);

  // Na afloop (geïnstalleerd, mislukt, afgewezen…) maakt de wizard zich na 30 s zelf leeg en wacht op het volgende bestand.
  useEffect(() => { if (!eindStand) return undefined; const t = window.setTimeout(wis, 30_000); return () => window.clearTimeout(t); }, [eindStand, nieuw?.id, wis]);

  const kies = useCallback(async (f: File | null) => {
    if (!f) { wis(); return; }
    setBestand(f); setSoort(null); setAnalyse(null); setNieuwId(''); onNieuwId(''); setVoortgang(null); setServerCheck(null); setLeesfout(null);
    try {
      const s = herkenBestand(f.name, await bestandKop(f));
      setSoort(s);
      if (!s.ok) return;
      if (f.size > maxBytes) { setAnalyse({ info: { versie: '', commit: '', bovenmap: '', bestanden: 0, installer: false, auteur: '', agent: '', samenvatting: '', tests: null, manifest: null, manifestFouten: [], problemen: ['TE_GROOT'] }, sha256: '' }); return; }
      setBezigLezen(true);
      try { setAnalyse(await leesPakket(f)); } finally { setBezigLezen(false); }
    } catch (e) {
      if (!isLeesfout(e)) throw e;
      // De browser kon het gekozen bestand niet (meer) lezen. Zonder dit bleef de stap «Перевірка» hangen en kwam de
      // DOMException als onbekende code bij de gebruiker terecht.
      setBezigLezen(false); setSoort(null); setAnalyse(null);
      setLeesfout({ code: bestandLeesfoutCode(e), procent: null, verstuurd: 0 });
      // Er is nog geen voorstel op de server (het lezen brak af vóór «voorstel/begin»), dus zonder deze melding bleef er NIETS
      // in de geschiedenis staan. Versie en sha256 zijn hier meestal nog onbekend; de etappe en de reden zijn dat niet.
      meldAfbreking(context, { etappe: 'lezen', code: bestandLeesfoutCode(e), bestand: f.name, bytes: f.size });
    }
  }, [maxBytes, onNieuwId, wis, context]);

  // ---- upload (stukken met herhaling; hervatten waar de server bleef)
  const stuurStuk = async (id: string, offset: number, deel: Uint8Array): Promise<number> => {
    for (let poging = 1; ; poging++) {
      try { return Number(((await api.post('/api/uitrol/voorstel/stuk', { ...context, id, offset, data: naarBase64(deel) })).data as { ontvangen: number }).ontvangen); }
      catch (e) {
        const code = foutCode(e);
        if (code === 'OFFSET_ONJUIST') {
          const st = (await api.post('/api/uitrol/voorstel/status', { ...context, id })).data as { voorstellen: Array<{ id: string; ontvangen: number }> };
          const n = st.voorstellen.find((v) => v.id === id)?.ontvangen;
          if (typeof n === 'number') return n;
        }
        if (poging >= 5 || GEEN_HERHALING.includes(code)) throw e;
        await WACHT(1000 * 2 ** (poging - 1));
      }
    }
  };
  const uploaden = () => { if (!bestand || !analyse || problemen.length || !data.ik) return; setHervatWens(false); void doe('pakket', async () => {
    const f = bestand, a = analyse; setServerCheck(null); setLeesfout(null);
    // Goedkope controle (512 bytes van de schijf, geen netwerk) vóór «voorstel/begin»: is het bestand NU nog leesbaar? Zonder
    // deze controle maakt de server eerst een voorstel aan (dat dan als «uploaden» blijft hangen, max. 3 open voorstellen) en
    // breekt het lezen pas daarna af. Hiermee hoort de eigenaar het vóór de eerste byte netwerkverkeer.
    try { await leesKop(f, 512); }
    catch (e) {
      if (!isLeesfout(e)) throw e;
      setLeesfout({ code: bestandLeesfoutCode(e), procent: hervatbaar && f.size ? Math.round(((hervatbaar.ontvangen || 0) / f.size) * 100) : null, verstuurd: hervatbaar?.ontvangen || 0 });
      // Versie en sha256 zijn hier WEL bekend (de browser las ze uit het archief), ook als er nog geen voorstel op de server is.
      meldAfbreking(context, { etappe: 'lezen', code: bestandLeesfoutCode(e), voorstelId: hervatbaar?.id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: hervatbaar?.ontvangen || 0, bestand: f.name });
      throw e;
    }
    if (!mijnGrant) await api.post('/api/owner/uitrol/voorbereiders/toevoegen', { ...context, soort: 'account', onderwerp: data.ik!.id, dagen: 1, label: tr(lang, 'Власник — з пристрою', 'Eigenaar — vanaf apparaat') });
    let id: string; let offset: number; let maxStuk: number;
    if (hervatbaar) { id = hervatbaar.id; offset = hervatbaar.ontvangen || 0; maxStuk = data.limieten.maxStuk || 512 * 1024; }
    else {
      let begin: { id: string; maxStuk: number };
      // tests komen uit TESTRESULTATEN in het pakket (src/platform/tar-lezen.ts); tot 29.10.2026 stond hier altijd «{}» en
      // waarschuwde de voorcontrole bij elke upload «de voorbereider meldde geen testresultaten».
      try { begin = (await api.post('/api/uitrol/voorstel/begin', { ...context, version: a.info.versie, bytes: f.size, sha256: a.sha256, commit: a.info.commit || undefined, changelog: a.info.samenvatting.slice(0, 8000), tests: a.info.tests ? { geslaagd: a.info.tests.geslaagd, mislukt: a.info.tests.mislukt, samenvatting: a.info.tests.samenvatting } : {} })).data as { id: string; maxStuk: number }; }
      // Ook een weigering vóór de eerste byte (TE_VEEL_OPEN, VERSIE_BESTAAT_AL, netwerk) is een poging: etappe «begin».
      catch (e) { meldAfbreking(context, { etappe: 'begin', code: foutCode(e) || '', versie: a.info.versie, sha256: a.sha256, bytes: f.size, bestand: f.name }); throw e; }
      id = begin.id; offset = 0; maxStuk = begin.maxStuk || 512 * 1024;
    }
    const stuk = Math.min(maxStuk, data.limieten.maxStuk || 512 * 1024);
    setVoortgang(Math.round((offset / f.size) * 100)); setVerzonden(offset);
    lopend.current = { voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name };
    try {
    while (offset < f.size) {
      // Lezen van de schijf staat BINNEN de bescherming: hier vloog de DOMException (NotReadableError) er vroeger rauw uit.
      // De voortgang blijft bewaard: de server houdt `ontvangen` vast, dus dezelfde keuze gaat verder bij dezelfde offset.
      let deel: Uint8Array;
      try { deel = await leesDeel(f, offset, Math.min(f.size, offset + stuk)); }
      catch (e) {
        if (!isLeesfout(e)) throw e;
        setLeesfout({ code: bestandLeesfoutCode(e), procent: Math.round((offset / f.size) * 100), verstuurd: offset });
        await laden();
        // Dit is precies het geval van 20.10.2026: de server heeft al een deel, maar zag de afbreking zelf NIET. Melden, met
        // het voorstel, de etappe en de bereikte offset — dan staat de poging in de geschiedenis en is «Продовжити» mogelijk.
        meldAfbreking(context, { etappe: 'uploaden', code: bestandLeesfoutCode(e), voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name });
        lopend.current = null;
        throw e;
      }
      try { offset = await stuurStuk(id, offset, deel); }
      catch (e) {
        meldAfbreking(context, { etappe: 'uploaden', code: foutCode(e) || '', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name });
        lopend.current = null;
        await laden(); throw new Error(`UPLOAD_ONDERBROKEN|${foutCode(e) || 'ONBEKEND'}|${Math.round((offset / f.size) * 100)}`);
      }
      setVoortgang(Math.round((offset / f.size) * 100)); setVerzonden(offset);
      lopend.current = { voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name };
    }
    let kl: { status: string; voorcontrole?: VoorcontroleUit };
    try { kl = (await api.post('/api/uitrol/voorstel/klaar', { ...context, id })).data as { status: string; voorcontrole?: VoorcontroleUit }; }
    catch (e) { meldAfbreking(context, { etappe: 'klaar', code: foutCode(e) || '', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: f.size, bestand: f.name }); throw e; }
    if (kl.status === 'afgebroken') {
      setServerCheck(kl.voorcontrole || null);
      // De site wees het pakket na het uploaden zelf af: ook dat is een poging die niet tot installatie kwam.
      meldAfbreking(context, { etappe: 'voorcontrole', code: 'VOORCONTROLE_MISLUKT', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: f.size, bestand: f.name });
      await laden(); throw new Error('VOORCONTROLE_MISLUKT');
    }
    setNieuwId(id); onNieuwId(id);
    await laden();
    return tr(lang, `Пакет ${a.info.versie} завантажено й перевірено сайтом. Він нічого не встановлює, доки ви не схвалите його passkey.`, `Pakket ${a.info.versie} geüpload en door de site gecontroleerd. Het installeert niets tot u het met uw passkey goedkeurt.`);
    } finally { lopend.current = null; }
  }).finally(() => setVoortgang(null)); };
  const annuleren = (id: string) => void doe(`annuleer-${id}`, async () => { await api.post('/api/uitrol/voorstel/annuleren', { ...context, id }); if (id === nieuwId) wis(); return tr(lang, 'Пакет скасовано.', 'Pakket geannuleerd.'); });

  // ---- stand naar boven (de vier fasen bovenaan beginnen opnieuw voor dit bestand)
  useEffect(() => {
    const versie = analyse?.info.versie || '';
    if (!bestand || !soort?.ok) onFlow({ fase: 'leeg', versie: '', detail: '' });
    else if (actief === 'goedkeuren') onFlow({ fase: 'goedkeuring', versie: nieuw?.versie || versie, detail: '' });
    else if (actief === 'installeren') onFlow({ fase: 'leeg', versie: nieuw?.versie || versie, detail: '' });
    else onFlow({ fase: 'voorbereiding', versie, detail: voortgang !== null ? `${tr(lang, 'завантаження', 'upload')} ${voortgang}%` : actief === 'controle' ? tr(lang, 'перевіряю вміст пакета', 'inhoud van het pakket controleren') : actief === 'upload' ? tr(lang, 'готово до завантаження', 'klaar om te uploaden') : '' });
  }, [bestand, soort, analyse, actief, nieuw?.versie, voortgang, lang, onFlow]);

  // ---- naar de volgende stap scrollen, de hoofdknop markeren en focus geven
  useEffect(() => {
    // Alleen VOORUIT scrollen (de gebruiker ging een stap verder). Het automatisch leegmaken na afloop (terug naar «Файл») mag de
    // pagina niet wegtrekken van wat de gebruiker leest (bv. de geschiedenis eronder) — 18.10.2026.
    const vooruit = (a: StapId, b: StapId) => STAPPEN.findIndex((s) => s.id === b) > STAPPEN.findIndex((s) => s.id === a);
    if (vorigeStap.current !== null && vorigeStap.current !== actief && vooruit(vorigeStap.current, actief)) {
      const el = refs.current[actief];
      const rust = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el?.scrollIntoView({ behavior: rust ? 'auto' : 'smooth', block: 'center' });
      setPuls(actief);
      const t1 = window.setTimeout(() => (el?.querySelector('[data-ut-hoofdactie]') as HTMLElement | null)?.focus({ preventScroll: true }), 500);
      const t2 = window.setTimeout(() => setPuls(''), 2400);
      vorigeStap.current = actief;
      return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    }
    vorigeStap.current = actief;
    return undefined;
  }, [actief]);

  // «Обрати файл ще раз»: het bestandsvenster opnieuw openen ZONDER de melding weg te gooien (de gebruiker kan het venster ook
  // sluiten). De melding verdwijnt pas als er echt een bestand gekozen is (kies()).
  const opnieuwKiezen = useCallback(() => {
    setHervatWens(!!leesfout && leesfout.procent !== null);
    setBestand(null); setSoort(null); setAnalyse(null); setBezigLezen(false); setVoortgang(null);
    if (invoer.current) invoer.current.value = '';
    window.setTimeout(() => invoer.current?.click(), 0);
  }, [leesfout]);
  // Dezelfde keuze na een leesfout: de upload gaat zelf verder bij de offset die de server bewaarde (`hervatbaar.ontvangen`).
  useEffect(() => {
    if (!hervatWens || !hervatbaar || !bestand || !analyse || problemen.length || busy || bezigLezen) return;
    setHervatWens(false);
    uploaden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hervatWens, hervatbaar?.id, bestand, analyse, problemen.length, busy, bezigLezen]);

  const drop = (e: DragEvent) => { e.preventDefault(); setSleep(false); if (!busy) void kies(e.dataTransfer.files?.[0] || null); };
  const info = analyse?.info;
  const samenvatting = info?.samenvatting || '';
  const stapStand = (i: number): 'klaar' | 'actief' | 'wacht' => (eindStand ? 'klaar' : i < idx ? 'klaar' : i === idx ? 'actief' : 'wacht');
  const Pict = soort ? PICT[soort.pictogram] : FileIcoon;
  const stapKop = (i: number) => { const s = STAPPEN[i]; const st = stapStand(i); const S = s.Icoon;
    return <header className='ut-wiz-kop'><span className='ut-wiz-nr' aria-hidden='true'>{st === 'klaar' ? <CheckCircle2 /> : st === 'actief' && busy === 'pakket' && s.id === 'upload' ? <Loader2 className='ut-draai' /> : i + 1}</span>
      <S aria-hidden='true' className='ut-wiz-pict' /><h3>{tr(lang, s.uk, s.nl)}</h3></header>; };

  return <section className='ut-kaart ut-wiz' id='uitrol-upload-anchor' data-ut-wizard data-actief={actief} aria-labelledby='ut-wiz-titel'>
    <header className='ut-kaart-kop'><div><h2 id='ut-wiz-titel'><Package aria-hidden='true' /> {tr(lang, 'Нове оновлення', 'Nieuwe update')}</h2>
      <p className='ut-sub'>{tr(lang, 'Оберіть пакет .tar.gz — сайт сам проведе вас крок за кроком: перевірить вміст, прочитає опис змін з архіву, завантажить і попросить схвалення passkey.', 'Kies een .tar.gz-pakket — de site leidt u stap voor stap: inhoud controleren, de beschrijving uit het archief lezen, uploaden en om uw passkey vragen.')}</p></div>
      {bestand && <button type='button' className='ut-knop' disabled={busy === 'pakket'} onClick={wis}><RotateCcw aria-hidden='true' />{tr(lang, 'Почати спочатку', 'Opnieuw beginnen')}</button>}
    </header>

    <ol className='ut-wiz-balk' aria-label={tr(lang, 'Кроки', 'Stappen')}>
      {STAPPEN.map((s, i) => <li key={s.id} data-stand={stapStand(i)} aria-current={stapStand(i) === 'actief' ? 'step' : undefined}><span>{stapStand(i) === 'klaar' ? <CheckCircle2 aria-hidden='true' /> : i + 1}</span><em className='ut-wiz-lang'>{tr(lang, s.uk, s.nl)}</em><em className='ut-wiz-kort' aria-hidden='true' title={tr(lang, s.uk, s.nl)}>{tr(lang, s.kortUk, s.kortNl)}</em></li>)}
    </ol>

    {/* Leesfout van de schijf (File API van de browser). Geen servercode: oorzaak + handeling komen uit shared/foutuitleg.ts. */}
    {leesfout && <div className='ut-probleem' role='alert' data-ut-leesfout={bestandLeesUitleg(lang, leesfout.code).naam || 'DOMException'}><AlertTriangle aria-hidden='true' /><div>
      <b>{tr(lang, 'Файл не прочитався з диска — на сервер нічого не пішло.', 'Het bestand kon niet van de schijf worden gelezen — er ging niets naar de server.')}</b>
      <p>{bestandLeesUitleg(lang, leesfout.code).waarom}</p>
      <p>{bestandLeesUitleg(lang, leesfout.code).doen}</p>
      {leesfout.procent !== null && <p className='ut-hint' data-ut-hervat={leesfout.procent}>{tr(lang,
        `Прогрес не втрачено: сервер уже має ${leesfout.procent}% (${mb(leesfout.verstuurd)}). Оберіть той самий файл — завантаження продовжиться з місця зупинки.`,
        `De voortgang is niet verloren: de server heeft al ${leesfout.procent}% (${mb(leesfout.verstuurd)}). Kies hetzelfde bestand — de upload gaat verder waar hij stopte.`)}</p>}
      <button type='button' className='ut-knop ut-knop-primair' data-ut-hoofdactie data-ut-opnieuw-kiezen disabled={busy === 'pakket'} onClick={opnieuwKiezen}><FolderArchive aria-hidden='true' />{tr(lang, 'Обрати файл ще раз', 'Bestand opnieuw kiezen')}</button>
    </div></div>}

    {/* 1. Файл */}
    <section className='ut-wiz-stap' ref={(el) => { refs.current.bestand = el; }} data-stap='bestand' data-stand={stapStand(0)} data-puls={puls === 'bestand' || undefined}>
      {stapKop(0)}
      {!bestand && <div className='ut-drop' data-sleep={sleep || undefined} onDragOver={(e) => { e.preventDefault(); setSleep(true); }} onDragLeave={() => setSleep(false)} onDrop={drop}>
        <UploadCloud aria-hidden='true' />
        <p><b>{tr(lang, 'Перетягніть пакет сюди', 'Sleep het pakket hierheen')}</b><span>{tr(lang, 'або натисніть кнопку (працює і з телефона)', 'of druk op de knop (werkt ook vanaf de telefoon)')}</span></p>
        {/* Geen accept-filter: Android-bestandskiezers grijzen «.tar.gz» vaak uit; het type wordt hieronder op de inhoud gecontroleerd. */}
        <input ref={invoer} type='file' hidden data-meester-bestand onChange={(e) => void kies(e.target.files?.[0] || null)} disabled={!!busy} />
        <button type='button' className='ut-knop ut-knop-primair' data-ut-hoofdactie disabled={!!busy} onClick={() => invoer.current?.click()}><FolderArchive aria-hidden='true' />{tr(lang, 'Обрати файл', 'Bestand kiezen')}</button>
        <ul className='ut-chips' aria-label={tr(lang, 'Підтримується', 'Ondersteund')}><li><FileArchive aria-hidden='true' />.tar.gz / .tgz</li><li><HardDrive aria-hidden='true' />{tr(lang, 'до', 'tot')} {mb(maxBytes)}</li><li><ShieldCheck aria-hidden='true' />{tr(lang, 'нічого не запускається без вашого passkey', 'niets draait zonder uw passkey')}</li></ul>
      </div>}
      {bestand && <div className='ut-bestand' data-ok={soort ? (soort.ok ? 'ja' : 'nee') : 'wacht'}>
        <span className='ut-bestand-pict'><Pict aria-hidden='true' /></span>
        <span className='ut-bestand-tekst'><b title={bestand.name}>{bestand.name}</b><small>{mb(bestand.size)}{bestand.lastModified ? ` · ${datum(lang, new Date(bestand.lastModified).toISOString())}` : ''}</small></span>
        {soort && <span className='ut-bestand-soort' data-ok={soort.ok}>{soort.ok ? <CheckCircle2 aria-hidden='true' /> : <XCircle aria-hidden='true' />}{soort.ok ? 'tar.gz' : soort.label}</span>}
        <button type='button' className='ut-bestand-x' aria-label={tr(lang, 'Скасувати вибір файлу', 'Keuze van het bestand wissen')} title={tr(lang, 'Скасувати вибір', 'Keuze wissen')} disabled={busy === 'pakket'} onClick={wis}><X aria-hidden='true' /></button>
      </div>}
      {soort && !soort.ok && <div className='ut-probleem' role='alert'><AlertTriangle aria-hidden='true' /><div><b>{tr(lang, `Цей файл — не пакет оновлення (${soort.label}).`, `Dit bestand is geen updatepakket (${soort.label}).`)}</b><p>{lang === 'uk' ? soort.tip.uk : soort.tip.nl}</p>
        <button type='button' className='ut-knop' data-ut-hoofdactie onClick={() => { wis(); window.setTimeout(() => invoer.current?.click(), 0); }}><FolderArchive aria-hidden='true' />{tr(lang, 'Обрати інший файл', 'Ander bestand kiezen')}</button></div></div>}
      {!bestand && onvoltooid.length > 0 && <ul className='ut-lijst' data-meester-onvoltooid>{onvoltooid.map((v) => <li key={v.id}><span>{tr(lang, `Незавершене завантаження ${v.versie}: ${v.bytes ? Math.round(((v.ontvangen || 0) / v.bytes) * 100) : 0}%. Оберіть той самий файл — завантаження продовжиться з місця зупинки.`, `Onvoltooide upload ${v.versie}: ${v.bytes ? Math.round(((v.ontvangen || 0) / v.bytes) * 100) : 0}%. Kies hetzelfde bestand — de upload gaat verder waar hij stopte.`)}</span>
        <button type='button' className='ut-knop' disabled={!!busy} onClick={() => annuleren(v.id)}>{tr(lang, 'Скасувати', 'Annuleren')}</button></li>)}</ul>}
    </section>

    {/* 2. Перевірка */}
    {bestand && soort?.ok && <section className='ut-wiz-stap' ref={(el) => { refs.current.controle = el; }} data-stap='controle' data-stand={stapStand(1)} data-puls={puls === 'controle' || undefined}>
      {stapKop(1)}
      {bezigLezen && <p role='status' className='ut-wacht'><Loader2 aria-hidden='true' className='ut-draai' />{tr(lang, 'Читаю архів і рахую sha256…', 'Archief lezen en sha256 berekenen…')}</p>}
      {analyse && info && <div data-meester-analyse>
        <div className='ut-tegels'>
          <Tegel Icoon={FileArchive} label={tr(lang, 'Файл і розмір', 'Bestand en grootte')} waarde={`${bestand.name} · ${mb(bestand.size)}`} />
          <Tegel Icoon={Tag} label={tr(lang, 'Версія', 'Versie')} waarde={info.versie} mono />
          <Tegel Icoon={CalendarClock} label={tr(lang, 'Зібрано', 'Samengesteld')} waarde={versieDatum(info.versie, lang)} />
          <Tegel Icoon={UserRound} label={tr(lang, 'Автор', 'Auteur')} waarde={info.auteur} />
          <Tegel Icoon={Bot} label={tr(lang, 'Агент', 'Agent')} waarde={info.agent} />
          <Tegel Icoon={GitCommitHorizontal} label={tr(lang, 'Коміт', 'Commit')} waarde={info.commit ? commitWeergave(lang, info.commit).kort : ''} mono={!commitWeergave(lang, info.commit).waarschuwing} kopieer={!commitWeergave(lang, info.commit).waarschuwing} />
          <Tegel Icoon={Files} label={tr(lang, 'Файлів у пакеті', 'Bestanden in pakket')} waarde={info.bestanden ? String(info.bestanden) : ''} />
          <Tegel Icoon={Fingerprint} label='sha256' waarde={analyse.sha256} mono kopieer />
          {actieveVersie ? <Tegel Icoon={Activity} label={tr(lang, 'Зараз працює', 'Nu actief')} waarde={actieveVersie} mono /> : null}
        </div>
        {info.commit && commitWeergave(lang, info.commit).waarschuwing && <p className='ut-commit-let-op ut-commit-blok' role='note'><AlertTriangle aria-hidden='true' />{commitWeergave(lang, info.commit).lang}. {tr(lang, 'Встановлення дозволене, але відтворити збірку з git не вийде.', 'Installeren mag, maar de build is niet uit git te herhalen.')}</p>}
        <div className='ut-beschrijving' ref={beschrijvingRef} data-aanwezig={samenvatting.length >= 20 || undefined}>
          {(info.manifest || samenvatting) ? <KopieerBlokKnop lang={lang} blok={beschrijvingRef} /> : null}
          <h4><FileText aria-hidden='true' />{tr(lang, 'Що змінено', 'Wat er verandert')} <span className='ut-badge ut-badge-verplicht' data-kopieer-negeer>{tr(lang, 'обов’язково · з файлу SAMENVATTING в архіві', 'verplicht · uit het bestand SAMENVATTING in het archief')}</span></h4>
          {info.manifest ? <><UitgaveBeschrijving lang={lang} manifest={info.manifest} samenvatting={samenvatting} /><Deelnemers lang={lang} m={info.manifest} /></> : samenvatting ? <><UitgaveBeschrijving lang={lang} manifest={null} samenvatting={samenvatting} kort={false} /></> : <p className='ut-fout'>{tr(lang, 'Опису в архіві немає. Без опису змін встановлення неможливе.', 'Het archief bevat geen beschrijving. Zonder beschrijving van de wijzigingen kan niet worden geïnstalleerd.')}</p>}
        </div>
        {problemen.length > 0 ? <div className='ut-probleem' role='alert'><XCircle aria-hidden='true' /><div><b>{tr(lang, 'Встановлення неможливе — виправте пакет:', 'Installeren is niet mogelijk — herstel het pakket:')}</b>
          <ul>{problemen.map((p) => <li key={p}>{PROBLEEM[p] ? <><b>{tr(lang, PROBLEEM[p][0], PROBLEEM[p][1])}</b>{tr(lang, PROBLEEM[p][2], PROBLEEM[p][3]) ? <> {tr(lang, PROBLEEM[p][2], PROBLEEM[p][3])}</> : null}{p === 'NIET_NIEUWER' ? <span className='ut-hint' data-ut-niet-nieuwer> {nietNieuwerUitleg(lang, info.versie, actieveVersie, data.stand)}</span> : null}</> : p}</li>)}</ul>
          {info.manifestFouten.length > 0 && <ul className='ut-manifest-fouten' data-ut-manifest-fouten>{info.manifestFouten.map((f, i) => <li key={i}><code>{f.veld}</code>: {lang === 'uk' ? f.uk : f.nl}</li>)}</ul>}
          <button type='button' className='ut-knop' data-ut-hoofdactie onClick={() => { wis(); window.setTimeout(() => invoer.current?.click(), 0); }}><FolderArchive aria-hidden='true' />{tr(lang, 'Обрати інший файл', 'Ander bestand kiezen')}</button></div></div>
          : <p className='ut-goed'><CheckCircle2 aria-hidden='true' />{tr(lang, 'Пакет виглядає правильно. Сайт ще раз перевірить його після завантаження.', 'Het pakket ziet er goed uit. De site controleert het na het uploaden nog eens.')}</p>}
      </div>}
    </section>}

    {/* 3. Завантаження */}
    {bestand && soort?.ok && analyse && !problemen.length && <section className='ut-wiz-stap' ref={(el) => { refs.current.upload = el; }} data-stap='upload' data-stand={stapStand(2)} data-puls={puls === 'upload' || undefined}>
      {stapKop(2)}
      {!nieuw && !(serverCheck && !serverCheck.ok) && <>
        <p className='ut-sub'>{tr(lang, 'Файл передається на сервер частинами; обрив мережі не страшний — завантаження продовжиться. Після цього сайт розпакує пакет у тимчасову теку й перевірить його (нічого не запускаючи).', 'Het bestand gaat in stukken naar de server; een netwerkonderbreking is niet erg — de upload gaat verder. Daarna pakt de site het pakket tijdelijk uit en controleert het (zonder iets uit te voeren).')}</p>
        <div className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-primair' data-ut-hoofdactie data-meester-uploaden disabled={!!busy || !data.ik} onClick={uploaden}><UploadCloud aria-hidden='true' />{busy === 'pakket' ? tr(lang, 'Завантажую…', 'Bezig met uploaden…') : hervatbaar ? tr(lang, 'Продовжити завантаження', 'Upload hervatten') : tr(lang, 'Завантажити на сервер', 'Uploaden naar de server')}</button>
        </div>
        {voortgang !== null && <div className='ut-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={voortgang} aria-label={tr(lang, 'Завантаження архіву', 'Archief uploaden')}><div className='ut-voortgang-balk'><i style={{ width: `${voortgang}%` }} /></div><b>{voortgang}%</b><small>{mb(verzonden)} / {mb(bestand.size)}</small></div>}
        {voortgang === 100 && busy === 'pakket' && <p className='ut-wacht' role='status'><Loader2 aria-hidden='true' className='ut-draai' />{tr(lang, 'Сайт перевіряє пакет…', 'De site controleert het pakket…')}</p>}
      </>}
      {serverCheck && !serverCheck.ok && <div className='ut-probleem' role='alert'><XCircle aria-hidden='true' /><div><b>{tr(lang, 'Сайт відхилив пакет після завантаження:', 'De site heeft het pakket na het uploaden afgekeurd:')}</b>
        <Voorcontrole lang={lang} v={serverCheck} />
        <button type='button' className='ut-knop' data-ut-hoofdactie onClick={() => { wis(); window.setTimeout(() => invoer.current?.click(), 0); }}><FolderArchive aria-hidden='true' />{tr(lang, 'Обрати інший файл', 'Ander bestand kiezen')}</button></div></div>}
      {nieuw && <p className='ut-goed'><CheckCircle2 aria-hidden='true' />{tr(lang, `Пакет ${nieuw.versie} на сервері й перевірений.`, `Pakket ${nieuw.versie} staat op de server en is gecontroleerd.`)}</p>}
    </section>}

    {/* 4. Схвалення */}
    {nieuw && <section className='ut-wiz-stap' ref={(el) => { refs.current.goedkeuren = el; }} data-stap='goedkeuren' data-stand={stapStand(3)} data-puls={puls === 'goedkeuren' || undefined}>
      {stapKop(3)}
      <h4 className='ut-wiz-onderkop'><ShieldCheck aria-hidden='true' />{tr(lang, 'Перевірка сайту перед схваленням', 'Voorcontrole van de site vóór de goedkeuring')}</h4>
      <Voorcontrole lang={lang} v={nieuw.voorcontrole} />
      <details className='ut-veilig'><summary><LifeBuoy aria-hidden='true' />{tr(lang, 'Що захищає сайт після схвалення', 'Wat de site na de goedkeuring beschermt')}</summary>
        <ul>
          <li><DatabaseBackup aria-hidden='true' />{tr(lang, 'Резервна копія бази перед міграціями; збірка ізольована — якщо вона падає, нічого не змінюється.', 'Back-up van de database vóór de migraties; de build is geïsoleerd — faalt hij, dan verandert er niets.')}</li>
          <li><Activity aria-hidden='true' />{tr(lang, 'Після активації 40 с перевіряється стан сайту; за збою — автоматичний відкат на попередню версію.', 'Na activering wordt de site 40 s bewaakt; bij een storing volgt automatisch terugdraaien naar de vorige versie.')}</li>
          <li><Undo2 aria-hidden='true' />{tr(lang, 'Ще 30 хвилин працює окрема сторожова служба root: якщо сайт «ляже» пізніше — вона сама відкотить версію, навіть коли вас немає поруч.', 'Nog 30 minuten bewaakt een aparte root-dienst de site: valt hij later alsnog om, dan draait ze zelf terug — ook als u er niet bent.')}</li>
          <li><AlertTriangle aria-hidden='true' />{tr(lang, 'Міграції бази при відкаті не відкочуються — тому сайт показує попередження про руйнівні міграції.', 'Databasemigraties worden bij terugdraaien niet teruggedraaid — daarom waarschuwt de site voor ingrijpende migraties.')}</li>
        </ul></details>
      {nieuw.status === 'wacht-op-goedkeuring' && <div className='ut-acties'>
        <button type='button' className='ut-knop ut-knop-primair' data-ut-hoofdactie disabled={!klaar || !kanPasskey || !!busy || (nieuw.voorcontrole ? !nieuw.voorcontrole.ok : false)} onClick={() => goedkeurenId(nieuw.id)}><Fingerprint aria-hidden='true' />{busy === `ok-${nieuw.id}` ? tr(lang, 'Підтвердіть на телефоні…', 'Bevestig op uw telefoon…') : tr(lang, 'Схвалити й встановити (passkey)', 'Goedkeuren en installeren (passkey)')}</button>
        <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!busy} onClick={() => annuleren(nieuw.id)}><X aria-hidden='true' />{tr(lang, 'Скасувати пакет', 'Pakket annuleren')}</button>
      </div>}
      {nieuw.status === 'wacht-op-goedkeuring' && !klaar && <p className='ut-hint'>{tr(lang, 'Щоб схвалити, налаштуйте passkey у вкладці «Налаштування». Пакет чекатиме до 7 днів.', 'Stel een passkey in via het tabblad «Instellingen» om goed te keuren. Het pakket wacht tot 7 dagen.')}</p>}
    </section>}

    {/* 5. Встановлення */}
    {nieuw && nieuw.status !== 'wacht-op-goedkeuring' && <section className='ut-wiz-stap' ref={(el) => { refs.current.installeren = el; }} data-stap='installeren' data-stand={stapStand(4)} data-puls={puls === 'installeren' || undefined} data-meester-nieuw={nieuw.status}>
      {stapKop(4)}
      {!eindStand ? <>
        <p className='ut-wacht' role='status'><Loader2 aria-hidden='true' className='ut-draai' />{nieuw.status === 'goedgekeurd' ? tr(lang, 'Схвалено. Сервер встановлює пакет — хід і термінал у реальному часі нижче.', 'Goedgekeurd. De server installeert het pakket — voortgang en terminal live hieronder.') : tr(lang, 'Стан: ', 'Status: ') + nieuw.status}</p>
        <div className='ut-acties'><button type='button' className='ut-knop' data-ut-hoofdactie onClick={naarLive}><ArrowRight aria-hidden='true' />{tr(lang, 'До ходу встановлення', 'Naar de voortgang')}</button></div></>
        : <div className='ut-uitkomst' data-staat={nieuw.status === 'geinstalleerd' ? 'klaar' : 'mislukt'}>
          {nieuw.status === 'geinstalleerd' ? <CheckCircle2 aria-hidden='true' /> : <XCircle aria-hidden='true' />}
          <div><b>{nieuw.status === 'geinstalleerd' ? tr(lang, `Версію ${nieuw.versie} встановлено`, `Versie ${nieuw.versie} is geïnstalleerd`) : tr(lang, `Версію ${nieuw.versie} не встановлено`, `Versie ${nieuw.versie} is niet geïnstalleerd`)}</b>
            {nieuw.uitkomst && (nieuw.uitkomst.uk || nieuw.uitkomst.nl) ? <p>{lang === 'uk' ? nieuw.uitkomst.uk : nieuw.uitkomst.nl}</p> : null}
            <button type='button' className='ut-knop ut-knop-primair' data-ut-hoofdactie onClick={wis}><RotateCcw aria-hidden='true' />{tr(lang, 'Нове оновлення', 'Nieuwe update')}</button>
            <small className='ut-sub' data-ut-wiz-opschonen>{tr(lang, 'Майстер сам очиститься через 30 с і чекатиме на наступний файл.', 'De wizard maakt zichzelf over 30 s leeg en wacht op het volgende bestand.')}</small></div>
        </div>}
    </section>}
  </section>;
}
