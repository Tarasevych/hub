// Voortgang van de volledige controle van alle adressen («Перевірка всіх адрес»), met uitleg welke bronnen gebruikt worden.
// Gedeeld door «Контакти й відправники», de instellingen (Безпека → Відправники) en de zwevende melding (compact).
//
// Punt 15 (19.10.2026): na «Не вдалося (HTTP_502)» bleef er niets anders over dan ≈101 keer met de hand op «Продовжити» te
// klikken. Nu herhaalt de browser zelf met een groeiende pauze (shared/mail-scan-beleid.ts — dezelfde ladder als de server),
// toont «Повторюю через N с · спроба X з Y» en bewaart de keuze van de gebruiker op de server («запам'ятати вибір»).
import { AlertTriangle, Pause, Play, RefreshCw, RotateCcw, Square, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  SCAN_BELEID_TEKST, SCAN_BELEIDEN, SCAN_MAX_POGINGEN, scanHerhaalPlan, scanHerhaalZin, STANDAARD_SCAN_BELEID, type ScanBeleid,
} from '../../shared/mail-scan-beleid';
import { SCAN_INTERVAL_MINUTEN, type ScanVoorkeur } from '../../shared/contacten-scan-voorkeuren';
import { contactenApi, foutCode, zetScanStand, type ScanStand } from './api';
import { eenStart, hervattenKlaar, hervattenTerug, reserveerHervatten } from './scan-weergave';
import './contacten.css';

type Lang = 'uk' | 'nl';
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const I = { width: 16, height: 16 } as const;
export const getal = (lang: Lang, n: number) => n.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE');
export const datumTijd = (lang: Lang, v: string | number | null | undefined) => (v ? new Date(v).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const FOUT: Record<string, [string, string]> = {
  SLEUTELKLUIS_GESLOTEN: ['Ключ даних закритий. Розблокуйте його в розділі «Способи входу → Шифрування моїх даних», перш ніж перевіряти скриньку.', 'De gegevenssleutel is gesloten. Ontgrendel hem bij Aanmeldmethoden → Versleuteling van mijn gegevens voordat u de mailbox controleert.'],
  GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED: ['Поштовий акаунт Google не підключено.', 'Geen Google-mailaccount gekoppeld.'],
  GOOGLE_MAIL_RATE_LIMITED: ['Gmail тимчасово обмежив запити. Продовжіть пізніше — перевірка почнеться з місця зупинки.', 'Gmail beperkt tijdelijk de verzoeken. Ga later verder — de controle hervat waar hij stopte.'],
  GOOGLE_MAIL_REAUTH_REQUIRED: ['Потрібно знову підключити Gmail.', 'Gmail moet opnieuw gekoppeld worden.'],
  GOOGLE_MAIL_SCOPE_REQUIRED: ['Бракує дозволу Gmail на читання заголовків.', 'Gmail-toestemming om koppen te lezen ontbreekt.'],
  GOOGLE_MAIL_PROVIDER_UNAVAILABLE: ['Gmail зараз недоступний. Спробуйте пізніше.', 'Gmail is nu niet bereikbaar. Probeer het later.'],
  HTTP_502: ['Власний сервер відповів 502 (шлюз). Перевірка нічого не втратила — вона продовжиться з місця зупинки.', 'De eigen server antwoordde 502 (gateway). De controle verliest niets — hij gaat verder waar hij stopte.'],
  HTTP_503: ['Власний сервер зараз перезавантажується (503). Перевірка продовжиться з місця зупинки.', 'De eigen server herstart nu (503). De controle gaat verder waar hij stopte.'],
  HTTP_504: ['Шлюз не дочекався відповіді (504). Перевірка продовжиться з місця зупинки.', 'De gateway wachtte te lang (504). De controle gaat verder waar hij stopte.'],
};
export const scanFoutTekst = (lang: Lang, code: string) => (FOUT[code] || [`Не вдалося (${code}).`, `Mislukt (${code}).`])[lang === 'uk' ? 0 : 1];
export const scanProcent = (s: ScanStand | null) => (s && s.schatting > 0 ? Math.min(100, Math.round((s.verwerkt / s.schatting) * 100)) : s?.staat === 'klaar' ? 100 : 0);

/** «Перевірених N з M. Решта — не підтверджені.» — решта не «неперевірені» в оманливому сенсі. */
export function bevestigdZin(lang: Lang, geverifieerd: number, totaal: number): string {
  return t(lang, `Перевірених ${getal(lang, geverifieerd)} з ${getal(lang, totaal)}. Решта — не підтверджені.`, `${getal(lang, geverifieerd)} van ${getal(lang, totaal)} bevestigd. De rest is niet bevestigd.`);
}

/** Eén zin over de stand (ook voor de compacte melding). */
export function scanZin(lang: Lang, s: ScanStand | null): string {
  if (!s || s.staat === 'nooit') return t(lang, 'Перевірка вимкнена, доки ви самі не дозволите її для вибраної скриньки.', 'De controle blijft uit totdat u haar zelf voor een gekozen mailbox toestaat.');
  const bijwerken = s.accounts.some((a) => a.fase === 'bijwerken' && a.staat !== 'klaar');
  const voortgang = s.schatting > 0 ? t(lang, `${getal(lang, s.verwerkt)} з ≈${getal(lang, s.schatting)} листів`, `${getal(lang, s.verwerkt)} van ≈${getal(lang, s.schatting)} berichten`) : t(lang, `${getal(lang, s.verwerkt)} листів`, `${getal(lang, s.verwerkt)} berichten`);
  if (s.staat === 'bezig') return bijwerken ? t(lang, `Перевіряються нові листи: ${voortgang}.`, `Nieuwe berichten worden gecontroleerd: ${voortgang}.`) : t(lang, `Перевірено ${voortgang} · знайдено ${getal(lang, s.tellers.contacten)} адрес.`, `${voortgang} gecontroleerd · ${getal(lang, s.tellers.contacten)} adressen gevonden.`);
  if (s.staat === 'gepauzeerd') return t(lang, `На паузі після ${voortgang}. Можна продовжити з місця зупинки.`, `Gepauzeerd na ${voortgang}. U kunt verdergaan waar hij stopte.`);
  if (s.staat === 'gestopt') return t(lang, `Зупинено після ${voortgang}. Автоматичні перевірки вимкнено, доки ви не продовжите.`, `Gestopt na ${voortgang}. Automatische controles staan uit tot u verdergaat.`);
  if (s.staat === 'onderbroken') return t(lang, 'Перевірку перервано (наприклад, перезапуском сервера). Вона продовжиться з місця зупинки.', 'De controle werd onderbroken (bv. door een herstart van de server). Ze gaat verder waar ze stopte.');
  if (s.staat === 'fout') return scanFoutTekst(lang, s.accounts.find((a) => a.fout)?.fout || 'SCAN_MISLUKT');
  const overgeslagen = s.accounts.filter((a) => a.staat === 'overgeslagen');
  const staart = overgeslagen.length ? t(lang, ` Пропущено скриньок: ${overgeslagen.length}.`, ` Overgeslagen mailboxen: ${overgeslagen.length}.`) : '';
  return t(lang, `Адреси перевірено ${datumTijd(lang, s.eersteKlaarOp)}. ${bevestigdZin(lang, s.tellers.geverifieerd, s.tellers.contacten)} Підозрілих ${getal(lang, s.tellers.verdacht)}. Подальша перевірка залежить від вибору для кожної скриньки.${staart}`,
    `Adressen gecontroleerd ${datumTijd(lang, s.eersteKlaarOp)}. ${bevestigdZin(lang, s.tellers.geverifieerd, s.tellers.contacten)} ${getal(lang, s.tellers.verdacht)} verdacht. Nieuwe controles volgen alleen de keuze per mailbox.${staart}`);
}

/** «Повторюю через N с · спроба X з Y» uit de stand die de SERVER bewaarde (overleeft het herladen van de pagina). */
export function scanServerHerhaal(lang: Lang, s: ScanStand | null, nu = Date.now()): string {
  const rij = s?.accounts.find((a) => Number(a.poging || 0) > 0 && a.wachtTot && Date.parse(a.wachtTot) > nu - 1000);
  if (!rij) return '';
  return scanHerhaalZin(lang, (Date.parse(rij.wachtTot || '') - nu) / 1000, Number(rij.poging || 1), s?.maxPogingen || SCAN_MAX_POGINGEN);
}

export type ScanActies = ReturnType<typeof useScanActies>;

/**
 * Acties van de controle, met automatisch herhalen. Een tijdelijke fout (HTTP_429/5xx van de eigen server of de proxy, een
 * Gmail-quotum, een time-out) wordt zelf opnieuw geprobeerd met een groeiende pauze; niemand hoeft te klikken. Bij het beleid
 * «питати щоразу» blijft het oude gedrag: de knop «Продовжити» wacht op de gebruiker.
 */
export function useScanActies(lang: Lang, beleid: ScanBeleid = STANDAARD_SCAN_BELEID) {
  const [bezig, setBezig] = useState(false), [fout, setFout] = useState('');
  const [herhaal, setHerhaal] = useState<{ poging: number; tot: number; code: string } | null>(null);
  const [, tik] = useState(0);
  const timer = useRef(0), levend = useRef(true), beleidRef = useRef(beleid);
  beleidRef.current = beleid;
  useEffect(() => { levend.current = true; return () => { levend.current = false; window.clearTimeout(timer.current); }; }, []);
  // Aftellen voor de tekst «через N с» (alleen zolang er echt gewacht wordt).
  useEffect(() => {
    if (!herhaal) return;
    const id = window.setInterval(() => tik((v) => v + 1), 500);
    return () => window.clearInterval(id);
  }, [herhaal]);

  const doe = (f: () => Promise<ScanStand>, poging = 0) => {
    setBezig(true); setFout('');
    return f().then((s) => {
      if (!levend.current) return;
      zetScanStand(s); setHerhaal(null); setBezig(false);
    }).catch((e: unknown) => {
      if (!levend.current) return;
      const code = foutCode(e), plan = scanHerhaalPlan(code, poging + 1, beleidRef.current);
      setBezig(false);
      if (plan.soort === 'herhaal') {
        setHerhaal({ poging: plan.poging, tot: Date.now() + plan.wachtMs, code });
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { if (levend.current) void doe(f, plan.poging); }, plan.wachtMs);
        return;
      }
      setHerhaal(null);
      setFout(plan.soort === 'overslaan'
        ? t(lang, `Проблемну скриньку пропущено після ${SCAN_MAX_POGINGEN} спроб (${code}). Решту перевірено.`, `De problematische mailbox is na ${SCAN_MAX_POGINGEN} pogingen overgeslagen (${code}). De rest is gecontroleerd.`)
        : scanFoutTekst(lang, code));
    });
  };
  const stopHerhalen = () => { window.clearTimeout(timer.current); setHerhaal(null); setFout(''); };
  return {
    bezig, fout, herhaal,
    /** Tekst van het automatische herhalen in de browser («» als er niet gewacht wordt). */
    herhaalZin: herhaal ? scanHerhaalZin(lang, (herhaal.tot - Date.now()) / 1000, herhaal.poging) : '',
    stopHerhalen,
    pauze: () => { stopHerhalen(); hervattenTerug(); return doe(contactenApi.scanPauze); },
    stop: () => { stopHerhalen(); hervattenTerug(); return doe(contactenApi.scanStop); },
    // BUG-002: starten loopt via eenStart — twee panelen (melding + «Контакти»/instellingen) of een dubbele klik geven één verzoek.
    verder: () => { hervattenTerug(); return doe(() => eenStart(() => contactenApi.scanStart())); },
    /** Automatisch hervatten (useAutoHervatten): telt WEL mee voor het maximum. */
    verderAuto: () => doe(() => eenStart(() => contactenApi.scanStart())),
    bijwerken: () => { hervattenTerug(); return doe(() => eenStart(() => contactenApi.scanStart({ bijwerken: true }))); },
    opnieuw: () => { hervattenTerug(); return doe(() => eenStart(() => contactenApi.scanStart({ opnieuw: true }))); },
  };
}

/**
 * Hervatten zonder klik: na het herladen van de pagina (of een herstart van de server) gaat een onderbroken of met een tijdelijke
 * fout gestopte controle zelf verder — de server kent het paginatoken, dus het is echt «з місця зупинки». Bij «питати щоразу»
 * gebeurt dit niet. Hoogstens één keer per stand, zodat er nooit een lus ontstaat.
 */
export function useAutoHervatten(s: ScanStand | null, a: ScanActies, beleid: ScanBeleid) {
  const gedaan = useRef('');
  useEffect(() => {
    if (!s || beleid === 'vragen' || s.loopt || a.bezig || a.herhaal) return;
    if (s.staat !== 'onderbroken' && s.staat !== 'fout') return;
    const tijdelijk = s.staat === 'onderbroken' || s.accounts.some((x) => x.fout && scanHerhaalPlan(x.fout, 1, beleid).soort === 'herhaal');
    if (!tijdelijk) return;
    const sleutel = `${s.staat}|${s.bijgewerktOp || ''}`;
    if (gedaan.current === sleutel) return;
    // BUG-002: één hervatting tegelijk voor ALLE panelen samen, hoogstens SCAN_MAX_AUTO_HERVAT per bezoek, met pauze ertussen.
    // Vroeger kreeg elke nieuwe «fout» (nieuwe bijgewerktOp) een nieuwe hervatting, bovenop de 12 pogingen van de server: eindeloos.
    if (!reserveerHervatten()) return;
    gedaan.current = sleutel;
    void a.verderAuto().finally(hervattenKlaar);
  }, [s?.staat, s?.bijgewerktOp, s?.loopt, a.bezig, !!a.herhaal, beleid]);
}

export function ScanKnoppen({ lang, s, a, compact = false }: { lang: Lang; s: ScanStand | null; a: ScanActies; compact?: boolean }) {
  if (!s) return null;
  if (a.herhaal) return <div className='ctv-scan-knoppen'>
    <button type='button' className='afz-knop' onClick={() => { a.stopHerhalen(); void a.pauze(); }}><Pause aria-hidden='true' style={I} />{t(lang, 'Пауза', 'Pauze')}</button>
    <button type='button' className='afz-knop' onClick={() => { a.stopHerhalen(); void a.verder(); }}><RefreshCw aria-hidden='true' style={I} />{t(lang, 'Повторити зараз', 'Nu opnieuw')}</button>
  </div>;
  if (s.loopt) return <div className='ctv-scan-knoppen'>
    <button type='button' className='afz-knop' disabled={a.bezig} onClick={() => void a.pauze()}><Pause aria-hidden='true' style={I} />{t(lang, 'Пауза', 'Pauze')}</button>
    <button type='button' className='afz-knop' disabled={a.bezig} onClick={() => void a.stop()}><Square aria-hidden='true' style={I} />{t(lang, 'Зупинити', 'Stoppen')}</button>
  </div>;
  return <div className='ctv-scan-knoppen'>
    {['gepauzeerd', 'gestopt', 'fout', 'onderbroken', 'nooit'].includes(s.staat) && <button type='button' className='afz-knop afz-knop-hoofd' disabled={a.bezig} onClick={() => void a.verder()}><Play aria-hidden='true' style={I} />{s.staat === 'nooit' ? t(lang, 'Почати перевірку', 'Controle starten') : t(lang, 'Продовжити', 'Verdergaan')}</button>}
    {/* Melding van de eigenaar: in het venster stond geen «пропустити». Nu staat die keuze er — en als beleid die het onthoudt. */}
    {s.staat === 'fout' && <button type='button' className='afz-knop' disabled={a.bezig} onClick={() => void a.bijwerken()}><AlertTriangle aria-hidden='true' style={I} />{t(lang, 'Пропустити проблемне', 'Problematische overslaan')}</button>}
    {s.staat === 'klaar' && <button type='button' className='afz-knop' disabled={a.bezig} onClick={() => void a.bijwerken()}><RefreshCw aria-hidden='true' style={I} />{t(lang, 'Перевірити нові листи', 'Nieuwe berichten controleren')}</button>}
    {!compact && s.staat !== 'nooit' && <button type='button' className='afz-knop' disabled title={t(lang, 'Тимчасово недоступно: спільні лічильники кількох скриньок потребують безпечного перерахунку.', 'Tijdelijk niet beschikbaar: gedeelde tellingen van meerdere mailboxen vereisen een veilige hertelling.')}><RotateCcw aria-hidden='true' style={I} />{t(lang, 'Перевірити все заново', 'Alles opnieuw')}</button>}
    {!compact && !s.loopt && <>
      <button type='button' className='afz-knop' data-taak='onbekend' disabled={a.bezig} onClick={() => void contactenApi.taakStart('onbekend')}><Play aria-hidden='true' style={I} />{t(lang, 'Продовжити неперевірені', 'Onbevestigde hervatten')}</button>
      <button type='button' className='afz-knop' data-taak='rest' disabled={a.bezig} onClick={() => void contactenApi.taakStart('rest')}><RefreshCw aria-hidden='true' style={I} />{t(lang, 'Перевірити решту', 'De rest controleren')}</button>
      <button type='button' className='afz-knop' data-taak='verdacht' disabled={a.bezig} onClick={() => void contactenApi.taakStart('verdacht')}><AlertTriangle aria-hidden='true' style={I} />{t(lang, 'Повторити підозрілі', 'Verdachte opnieuw')}</button>
    </>}
  </div>;
}

/** «Повторюю через N с · спроба X з Y» — uit de browser (a.herhaalZin) of uit de bewaarde stand van de server. */
export function ScanHerhaalRegel({ lang, s, a }: { lang: Lang; s: ScanStand | null; a: ScanActies }) {
  const zin = a.herhaalZin || scanServerHerhaal(lang, s);
  if (!zin) return null;
  return <p className='ctv-scan-herhaal' role='status' aria-live='polite' data-scan-herhaal><Timer aria-hidden='true' style={I} />{zin}</p>;
}

/** «Запам'ятати вибір»: wat er na een fout gebeurt. Bewaard op de server, dus ook op een andere computer hetzelfde. */
export function ScanBeleidKeuze({ lang, beleid, onKies, bezig }: { lang: Lang; beleid: ScanBeleid; onKies: (b: ScanBeleid) => void; bezig?: boolean }) {
  const i = lang === 'uk' ? 0 : 1;
  return <fieldset className='ctv-scan-beleid' data-scan-beleid={beleid}>
    <legend>{t(lang, 'Запам’ятати вибір при помилках', 'Keuze bij fouten onthouden')}</legend>
    {SCAN_BELEIDEN.map((b) => <label key={b} className='ctv-scan-beleid-optie'>
      <input type='radio' name='ctv-scan-beleid' value={b} checked={beleid === b} disabled={bezig} onChange={() => onKies(b)} />
      <span><strong>{SCAN_BELEID_TEKST[b].titel[i]}</strong><small>{SCAN_BELEID_TEKST[b].uitleg[i]}</small></span>
    </label>)}
  </fieldset>;
}

export function BronnenUitleg({ lang }: { lang: Lang }) {
  return <details className='ctv-bronnen'>
    <summary>{t(lang, 'Які джерела використовуються', 'Welke bronnen worden gebruikt')}</summary>
    <ul>
      <li><strong>{t(lang, 'Ваш поштовий сервер', 'Uw mailserver')}</strong> — {t(lang, 'результати перевірки, які Gmail додає до кожного листа (Authentication-Results): підпис DKIM (d= має збігатися з доменом відправника), SPF, DMARC, ARC.', 'de controle-uitslag die Gmail aan elk bericht toevoegt (Authentication-Results): DKIM-handtekening (d= moet het afzenderdomein zijn), SPF, DMARC, ARC.')}</li>
      <li><strong>DNS</strong> — {t(lang, 'публічні записи самого домену: MX (чи приймає пошту), SPF, DMARC і його політика (reject / quarantine / none), BIMI із сертифікатом торговельної марки (VMC). Запит робить ваш власний сервер; результат зберігається 24 години.', 'de openbare records van het domein zelf: MX (ontvangt het mail), SPF, DMARC en het beleid (reject / quarantine / none), BIMI met merkcertificaat (VMC). De vraag gaat via uw eigen server; het resultaat blijft 24 uur bewaard.')}</li>
      <li><strong>{t(lang, 'Перелік офіційних доменів', 'Lijst officiële domeinen')}</strong> — {t(lang, 'банки, державні органи (gov.ua, overheid.nl, belastingdienst.nl, digid.nl, belgium.be …), платіжні й технічні сервіси. Перевіреним такий відправник стає лише разом із пройденим DMARC.', 'banken, overheden (gov.ua, overheid.nl, belastingdienst.nl, digid.nl, belgium.be …), betaal- en techdiensten. Zo’n afzender wordt alleen bevestigd samen met een geslaagde DMARC.')}</li>
      <li><strong>{t(lang, 'Перевірка на підробку', 'Controle op imitatie')}</strong> — {t(lang, 'схожі домени (paypa1.com), змішані алфавіти (кирилиця в латинському домені), назва бренду в імені при чужому домені, ім’я вашого контакту з іншою адресою.', 'lijkende domeinen (paypa1.com), gemengde alfabetten (Cyrillisch in een Latijns domein), een merknaam in de naam bij een vreemd domein, de naam van een contact met een ander adres.')}</li>
      <li><strong>{t(lang, 'Ваша пошта', 'Uw mail')}</strong> — {t(lang, 'усі скриньки й теки (також архів і надіслані): кому ви писали самі.', 'alle mailboxen en mappen (ook archief en verzonden): naar wie u zelf schreef.')}</li>
    </ul>
    <p>{t(lang, 'Читаються лише заголовки From, To, Cc, Bcc, дата й результати перевірок — ніколи вміст листів. Усе зберігається лише у вашому акаунті.', 'Alleen de koppen From, To, Cc, Bcc, de datum en de controle-uitslagen worden gelezen — nooit de inhoud. Alles blijft alleen in uw account.')}</p>
  </details>;
}

/** De keuze bewaren en de verse stand meteen delen (zodat de melding en de pagina hetzelfde tonen). */
export function useScanBeleid(s: ScanStand | null) {
  const beleid: ScanBeleid = s?.beleid || STANDAARD_SCAN_BELEID;
  const [bezig, setBezig] = useState(false);
  const kies = (b: ScanBeleid) => {
    setBezig(true);
    void contactenApi.scanBeleid(b).then((r) => zetScanStand(r.scan)).catch(() => undefined).finally(() => setBezig(false));
  };
  return { beleid, bezig, kies };
}

export default function ScanPaneel({ lang, s }: { lang: Lang; s: ScanStand | null }) {
  const b = useScanBeleid(s), a = useScanActies(lang, b.beleid), pct = scanProcent(s);
  const [bewaren, zetBewaren] = useState(''), [fout, zetFout] = useState('');
  const gekozen = s?.gekoppeld || [];
  const wijzig = (accountId: string, vorige: ScanVoorkeur, waarde: Partial<ScanVoorkeur>) => {
    zetBewaren(accountId); zetFout('');
    void contactenApi.scanVoorkeur(accountId, { ...vorige, ...waarde }).then(zetScanStand)
      .catch((e) => zetFout(scanFoutTekst(lang, foutCode(e)))).finally(() => zetBewaren(''));
  };
  const controleer = (accountId: string) => {
    zetFout('');
    void contactenApi.scanStart({ accountIds: [accountId], bijwerken: true }).then(zetScanStand)
      .catch((e) => zetFout(scanFoutTekst(lang, foutCode(e))));
  };
  return <section className='ctv-scan' data-staat={s?.staat || 'nooit'} aria-labelledby='ctv-scan-titel'>
    <div className='ctv-scan-tekst'>
      <h2 id='ctv-scan-titel'>{t(lang, 'Перевірка всіх адрес', 'Controle van alle adressen')}</h2>
      <p aria-live='polite'>{scanZin(lang, s)}</p>
      <ScanHerhaalRegel lang={lang} s={s} a={a} />
      {s && (s.loopt || s.staat === 'gepauzeerd' || s.staat === 'gestopt') && <div className='afz-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t(lang, 'Хід перевірки', 'Voortgang van de controle')}><span style={{ width: `${pct}%` }} /></div>}
      {s && s.accounts.length > 1 && <ul className='ctv-scan-accounts'>{s.accounts.map((x) => <li key={x.accountId}><span className='afz-mono'>{x.email || x.accountId}</span> · {x.staat === 'klaar' ? t(lang, 'готово', 'klaar') : x.staat === 'overgeslagen' ? t(lang, 'пропущено', 'overgeslagen') : x.schatting ? `${getal(lang, x.verwerkt)} / ≈${getal(lang, x.schatting)}` : getal(lang, x.verwerkt)}{x.fout ? ` · ${scanFoutTekst(lang, x.fout)}` : ''}</li>)}</ul>}
      {a.fout && <p className='afz-fout' role='alert'>{a.fout}</p>}
      {fout && <p className='afz-fout' role='alert'>{fout}</p>}
    </div>
    <div className='ctv-scan-voorkeuren'>
      <h3>{t(lang, 'Перевірка за вашою згодою', 'Controle alleen met uw toestemming')}</h3>
      {!gekozen.length && <p>{t(lang, 'Підключених поштових скриньок немає. Перевірка не виконується.', 'Er zijn geen gekoppelde mailboxen. Er vindt geen controle plaats.')}</p>}
      {gekozen.map((x) => {
        const v = x.voorkeur, bezig = bewaren === x.accountId;
        return <fieldset key={x.accountId} className='ctv-scan-skrinka' disabled={bezig}>
          <legend className='afz-mono'>{x.email}</legend>
          <label className='ctv-scan-schakelaar'><input type='checkbox' checked={v.aan} onChange={(e) => wijzig(x.accountId, v, { aan: e.target.checked })} />
            <strong>{v.aan ? t(lang, 'Перевірку дозволено', 'Controle toegestaan') : t(lang, 'Перевірку вимкнено', 'Controle uitgeschakeld')}</strong></label>
          {v.aan && <div className='ctv-scan-keuzen'>
            <label>{t(lang, 'Спосіб перевірки', 'Manier van controleren')}
              <select value={v.werkwijze} onChange={(e) => wijzig(x.accountId, v, { werkwijze: e.target.value as ScanVoorkeur['werkwijze'] })}>
                <option value='handmatig'>{t(lang, 'Тільки вручну', 'Alleen handmatig')}</option>
                <option value='bij-openen'>{t(lang, 'Коли відкриваю пошту', 'Bij het openen van de mail')}</option>
                <option value='periodiek'>{t(lang, 'Через обрані проміжки часу', 'Met gekozen tussenpozen')}</option>
              </select>
            </label>
            {v.werkwijze === 'periodiek' && <label>{t(lang, 'Як часто', 'Hoe vaak')}
              <select value={v.intervalMinuten} onChange={(e) => wijzig(x.accountId, v, { intervalMinuten: Number(e.target.value) })}>
                {SCAN_INTERVAL_MINUTEN.map((n) => <option key={n} value={n}>{n === 15 ? t(lang, 'Кожні 15 хвилин', 'Elke 15 minuten') : n === 60 ? t(lang, 'Щогодини', 'Elk uur') : n === 360 ? t(lang, 'Кожні 6 годин', 'Elke 6 uur') : n === 1440 ? t(lang, 'Щодня', 'Dagelijks') : t(lang, 'Щотижня', 'Wekelijks')}</option>)}
              </select>
            </label>}
            {v.werkwijze !== 'handmatig' && <label>{t(lang, 'За яких умов', 'Onder welke voorwaarden')}
              <select value={v.voorwaarde} onChange={(e) => wijzig(x.accountId, v, { voorwaarde: e.target.value as ScanVoorkeur['voorwaarde'] })}>
                <option value='zichtbaar'>{t(lang, 'Лише коли сторінка відкрита на екрані', 'Alleen wanneer de pagina zichtbaar is')}</option>
                <option value='verbonden'>{t(lang, 'Поки пошта відкрита в браузері', 'Zolang de mail in de browser openstaat')}</option>
              </select>
            </label>}
            <label>{t(lang, 'Спливне повідомлення', 'Kort bericht op het scherm')}
              <select value={v.melding} onChange={(e) => wijzig(x.accountId, v, { melding: e.target.value as ScanVoorkeur['melding'] })}>
                <option value='geen'>{t(lang, 'Ніколи', 'Nooit')}</option>
                <option value='begin'>{t(lang, 'На 2 секунди на початку', '2 seconden bij het begin')}</option>
                <option value='fout'>{t(lang, 'На 2 секунди лише за помилки', '2 seconden alleen bij een fout')}</option>
              </select>
            </label>
          </div>}
          {v.aan && <button type='button' className='afz-knop' disabled={!!s?.loopt || bezig} onClick={() => controleer(x.accountId)}><Play aria-hidden='true' style={I} />{t(lang, 'Перевірити цю скриньку зараз', 'Deze mailbox nu controleren')}</button>}
        </fieldset>;
      })}
      <p>{t(lang, 'Без вашої згоди жодна скринька не перевіряється. Заплановані перевірки запускаються, коли сайт відкритий; після початку обробка може тривати у фоновому режимі. Хід роботи доступний у сповіщеннях.', 'Zonder uw toestemming wordt geen mailbox gecontroleerd. Geplande controles beginnen wanneer de site openstaat; daarna kan het werk op de achtergrond doorgaan. De voortgang staat bij de meldingen.')}</p>
    </div>
    {s?.loopt && <ScanKnoppen lang={lang} s={s} a={a} compact />}
    {gekosenBeleid(gekozen) && <ScanBeleidKeuze lang={lang} beleid={b.beleid} onKies={b.kies} bezig={b.bezig} />}
    <BronnenUitleg lang={lang} />
  </section>;
}

function gekosenBeleid(gekoppeld: NonNullable<ScanStand['gekoppeld']>): boolean {
  return gekoppeld.some((a) => a.voorkeur.aan);
}
