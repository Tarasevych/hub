// KLUIS-APPARAAT-001 (14.11.2026) — «Розшифровувати пошту одразу на місці» · ontsleutelen waar de mens is.
//
// KLACHT VAN DE EIGENAAR: na aanmelden (of na een update van de server) toonde post «geen post»; de reden (de gegevenssleutel is
// dicht) en de knop zaten diep in Instellingen → Способи входу → Шифрування. Nu:
//   1. Elk antwoord met SLEUTELKLUIS_GESLOTEN (client.ts) komt hier. Het verzoek WACHT: eerst stil «dit apparaat ken ik»
//      (kluis-apparaat.ts, helft X in de browser + helft S op de server), anders een kaart bovenaan de pagina met de uitleg en één
//      knop (passkey; herstelcode als tweede weg). Na het ontsleutelen gaat het wachtende verzoek opnieuw — de pagina krijgt gewoon
//      haar gegevens, zonder herladen en zonder instellingen.
//   2. Bij het openen van een dienst (VerenigdDienstApp) dezelfde controle vooraf: staat de sleutel dicht en kent dit apparaat
//      hem, dan gaat hij stil open (melding alleen in het meldingencentrum); anders verschijnt de kaart meteen.
//   3. Niets wordt verzwakt: de DEK verlaat de browser alleen zoals vroeger (over TLS naar de sessie die hem vasthoudt); de
//      apparaatsleutel is niet-exporteerbaar; «Пізніше» laat de wachtende verzoeken gewoon falen zoals vroeger.
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Check, ChevronDown, Copy, Download, Fingerprint, KeyRound, Lock, LockOpen, MonitorSmartphone, X } from 'lucide-react';
import { KLUIS_FOUT, KLUIS_TEKST, opmaakHerstelcode } from '../../shared/sleutelkluis';
import { apparaatBewaren, apparaatDeel, apparaatOpruimen } from './kluis-apparaat';
import { kanPrf, kekUitPrf, omslagOpenen, passkeyMetPrf, type PrfAssertieOpties } from './sleutelkluis-client';
import './kluis-poort.css';

type Lang = 'uk' | 'nl';
export type KluisContext = { service?: string; tabContext?: string; sourceOrigin?: string };
type Post = (url: string, data: unknown) => Promise<{ data: any }>;
type Stand = {
  ruimte: 'prive' | 'technisch'; stand: 'uit' | 'gesloten' | 'open';
  omslagen: { herstelcode: unknown | null; passkeys: Array<{ passkeyId: string; prf: boolean }>; apparaten?: Array<{ id: string; label: string }> };
};
const P = '/api/owner/sleutelkluis';
const ONTHOUDEN_KEUZE = 'mr-kluis-apparaat-onthouden';
export const KLUIS_OPEN_GEBEURTENIS = 'mr-kluis-open';

const AUTO_VRAAG = 'mr-kluis-passkey-auto';
const autoGevraagd = () => { try { return sessionStorage.getItem(AUTO_VRAAG) === '1'; } catch { return true; } };
const zetAutoGevraagd = () => { try { sessionStorage.setItem(AUTO_VRAAG, '1'); } catch { /* niets */ } };
const taal = (): Lang => (typeof document !== 'undefined' && document.documentElement?.lang === 'nl' ? 'nl' : 'uk');
const tr = (uk: string, nl: string) => (taal() === 'nl' ? nl : uk);
const leesKeuze = (): boolean => { try { return localStorage.getItem(ONTHOUDEN_KEUZE) !== '0'; } catch { return true; } };
const zetKeuze = (v: boolean) => { try { localStorage.setItem(ONTHOUDEN_KEUZE, v ? '1' : '0'); } catch { /* niets */ } };
const foutCode = (e: unknown): string => {
  const x = e as { name?: string; message?: string; response?: { data?: { error?: string } } };
  return String(x?.response?.data?.error || (x?.name && x.name !== 'Error' && x.name !== 'ApiError' ? x.name : '') || x?.message || '');
};
const foutTekst = (code: string): string => {
  const f = KLUIS_FOUT[code];
  if (f && (f.uk || f.nl)) return taal() === 'nl' ? f.nl : f.uk;
  if (code === 'NotAllowedError' || code === 'AbortError') return tr('Скасовано. Можна спробувати ще раз.', 'Geannuleerd. U kunt het opnieuw proberen.');
  if (code === 'RATE_LIMITED') return tr('Забагато спроб. Зачекайте кілька хвилин.', 'Te veel pogingen. Wacht een paar minuten.');
  return tr('Не вдалося розшифрувати. ', 'Ontsleutelen mislukt. ') + (code || tr('Немає зв’язку.', 'Geen verbinding.'));
};
const melden = (text: string, kind: 'success' | 'info' | 'warning', explain?: string) => {
  void import('../canoniek-meldingen').then(({ emitCanonicalNotice }) => emitCanonicalNotice({ text, kind, source: 'sleutelkluis', alleenPaneel: kind !== 'warning', topic: 'sleutelkluis|ontgrendelen', explain, dedupeSeconds: 30 })).catch(() => undefined);
};

// ------------------------------------------------------------------------------------------------ toestand van de poort
let post: Post | null = null;
let ctx: KluisContext = {};
let lopend: Promise<boolean> | null = null;
let wachtOpMens: ((ok: boolean) => void) | null = null;
let afgewezen = 0;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let zichtbaar: 'weg' | 'kaart' | 'chip' = 'weg';
let laatsteStand: Stand | null = null;
let teken: (() => void) | null = null;

const lichaam = (extra: Record<string, unknown> = {}) => ({ service: ctx.service, tabContext: ctx.tabContext, sourceOrigin: ctx.sourceOrigin, ...extra });
async function postNu(url: string, data: unknown) {
  if (!post) { const { api } = await import('./client'); post = (u, d) => api.post(u, d); }
  return post(url, data);
}
const toon = (stand: 'weg' | 'kaart' | 'chip') => { zichtbaar = stand; monteer(); teken?.(); };

/** Context bijwerken (dienst + tabblad): de sleutelkluis-routes hebben dezelfde sessiegegevens nodig als de pagina. */
export function kluisContext(c: KluisContext) { if (c.service && c.tabContext) ctx = { ...ctx, ...c }; }

/** Stand ophalen; geeft null als de route niet beschikbaar is (afgemeld, geen rechten). */
async function standLezen(): Promise<Stand | null> {
  try { laatsteStand = (await postNu(`${P}/stand`, lichaam())).data as Stand; return laatsteStand; } catch { return null; }
}
/** Stil met het onthouden apparaat; true = open. */
async function stilMetApparaat(s: Stand): Promise<boolean> {
  const ids = (s.omslagen.apparaten || []).map((a) => a.id);
  await apparaatOpruimen(ids, s.ruimte);
  const deel = await apparaatDeel(ids, s.ruimte);
  if (!deel) return false;
  try {
    await postNu(`${P}/apparaat/ontgrendelen`, lichaam(deel));
    const label = s.omslagen.apparaten?.find((a) => a.id === deel.apparaatId)?.label || '';
    melden(tr('Дані розшифровано автоматично на цьому пристрої.', 'Gegevens automatisch ontsleuteld op dit apparaat.'), 'success',
      tr(`Цей браузер${label ? ` (${label})` : ''} уже розшифровував ваші дані, тож повторний вхід чи оновлення сервера не вимагають passkey. Забути пристрій можна в Налаштування → Способи входу → Шифрування моїх даних.`,
        `Deze browser${label ? ` (${label})` : ''} ontsleutelde uw gegevens al eerder, dus opnieuw aanmelden of een serverupdate vraagt geen passkey. Het apparaat vergeten kan bij Instellingen → Aanmeldmethoden → Versleuteling van mijn gegevens.`));
    return true;
  } catch { return false; }
}
function geopend(handmatig: boolean) {
  const opnieuwNodig = afgewezen > 0;
  afgewezen = 0;
  const w = wachtOpMens; wachtOpMens = null; w?.(true);
  try { window.dispatchEvent(new CustomEvent(KLUIS_OPEN_GEBEURTENIS, { detail: { handmatig } })); } catch { /* geen venster */ }
  return opnieuwNodig;
}

/**
 * De kern: de sleutel is (volgens de server) dicht. Eén lopende afhandeling tegelijk; elk wachtend verzoek krijgt dezelfde uitkomst.
 * `wachten` = er wacht een verzoek (client.ts); zonder (vooraf bij het openen van een dienst) blijft alleen de kaart staan.
 */
export function kluisGesloten(c: KluisContext, wachten = true): Promise<boolean> {
  kluisContext(c);
  if (!ctx.service || !ctx.tabContext) return Promise.resolve(false);
  if (!lopend) {
    lopend = (async () => {
      const s = await standLezen();
      if (!s || s.stand === 'uit') return false;
      if (s.stand === 'open') { geopend(false); return true; }
      if (await stilMetApparaat(s)) { geopend(false); if (zichtbaar !== 'weg') toon('weg'); return true; }
      return new Promise<boolean>((ok) => { wachtOpMens = ok; if (zichtbaar !== 'kaart') toon('kaart'); });
    })().finally(() => { lopend = null; });
  }
  const p = lopend;
  return wachten ? p.then((ok) => { if (!ok) afgewezen++; return ok; }) : p.then(() => false);
}
/** Vooraf (bij het openen van een dienst): stil proberen, anders de kaart tonen; nooit een verzoek ophouden. */
export function kluisVoorbereiden(c: KluisContext): void { void kluisGesloten(c, false).catch(() => undefined); }
/** Een pagina meldt «dicht» zonder dat er iets herhaald kan worden (bv. {ok:false,fout:'SLEUTELKLUIS_GESLOTEN'} in een 200). */
export function kluisGeslotenGezien(c: KluisContext = {}): void { afgewezen++; kluisVoorbereiden(c); }

// ------------------------------------------------------------------------------------------------ de kaart
function monteer() {
  if (typeof document === 'undefined') return;
  if (!host) { host = document.createElement('div'); host.className = 'kluis-poort-host'; document.body.appendChild(host); }
  if (!root) { root = createRoot(host); root.render(<KluisKaart />); }
}

function KluisKaart() {
  const [, setN] = useState(0);
  useEffect(() => { teken = () => setN((n) => n + 1); return () => { teken = null; }; }, []);
  const [bezig, setBezig] = useState('');
  const [fout, setFout] = useState('');
  const [code, setCode] = useState('');
  const [toonCode, setToonCode] = useState(false);
  const [onthouden, setOnthouden] = useState(leesKeuze());
  const [nieuweCode, setNieuweCode] = useState('');
  const [bewaard, setBewaard] = useState(false);
  const [klaar, setKlaar] = useState<{ herladen: boolean; onthouden: boolean } | null>(null);
  const [meer, setMeer] = useState(false);
  const knop = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (zichtbaar === 'kaart') window.setTimeout(() => knop.current?.focus({ preventScroll: true }), 50); }, [zichtbaar]);

  const s = laatsteStand;
  const passkeys = (s?.omslagen.passkeys || []).filter((p) => p.prf !== false);
  const metPasskey = passkeys.length > 0 && kanPrf();
  const metCode = !!s?.omslagen.herstelcode;
  // Wens van de eigenaar (14.11.2026): geen dubbel werk. Op een nieuw apparaat of na het wissen van cookies vraagt de pagina de passkey
  // METEEN (één keer per tabblad), zonder eerst een knop te zoeken. Weigert de browser een vraag zonder klik (Safari), dan blijft
  // gewoon de knop staan, zonder foutmelding. Одразу питаємо passkey; якщо браузер вимагає натискання, лишається кнопка.
  useEffect(() => {
    if (zichtbaar !== 'kaart' || !metPasskey || autoGevraagd()) return;
    zetAutoGevraagd();
    void ontgrendelPasskey(true);
  }, [zichtbaar, metPasskey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (zichtbaar === 'weg') return null;

  const naOpenen = async () => {
    let onthoudenGelukt = false;
    if (onthouden) {
      try {
        const r = (await postNu(`${P}/apparaat/onthouden`, lichaam())).data as { apparaatId: string; deel: string };
        onthoudenGelukt = await apparaatBewaren(r.apparaatId, s?.ruimte || 'prive', r.deel);
        if (!onthoudenGelukt) void postNu(`${P}/apparaat/vergeten`, lichaam({ apparaatId: r.apparaatId })).catch(() => undefined);
      } catch { onthoudenGelukt = false; }
    }
    melden(tr('Дані розшифровано.', 'Gegevens ontsleuteld.'), 'success',
      onthoudenGelukt ? tr('Цей пристрій запам’ятано на 30 днів: повторний вхід і оновлення сервера більше не питатимуть passkey.', 'Dit apparaat is 30 dagen onthouden: opnieuw aanmelden en serverupdates vragen geen passkey meer.')
        : tr('Ключ відкрито до виходу з акаунта або перезапуску сервера.', 'De sleutel is open tot afmelden of een herstart van de server.'));
    const herladen = geopend(true);
    setKlaar({ herladen, onthouden: onthoudenGelukt });
  };
  const doe = async (naam: string, fn: () => Promise<void>, stil = false) => {
    setBezig(naam); setFout('');
    try { await fn(); } catch (e) { const c = foutCode(e); if (!(stil && (c === 'NotAllowedError' || c === 'AbortError' || c === 'SecurityError'))) setFout(foutTekst(c)); } finally { setBezig(''); }
  };
  const ontgrendelPasskey = (stil = false) => doe('passkey', async () => {
    const opt = (await postNu(`${P}/passkey/ontgrendelen/opties`, lichaam())).data as { uitdagingId: string; omslagen: Array<{ credentialId: string; envelop: string; aad: string }>; publicKey: PrfAssertieOpties };
    const a = await passkeyMetPrf(opt.publicKey);
    if (!a.prf) { setFout(taal() === 'nl' ? KLUIS_TEKST.geenPrf.nl : KLUIS_TEKST.geenPrf.uk); setToonCode(true); return; }
    const omslag = opt.omslagen.find((x) => x.credentialId === a.credentialId);
    if (!omslag) throw Object.assign(new Error('SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG'), { name: 'SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG' });
    const dek = await omslagOpenen(await kekUitPrf(a.prf), omslag.envelop, omslag.aad);
    const { prf: _p, ...assertie } = a;
    await postNu(`${P}/passkey/ontgrendelen`, lichaam({ uitdagingId: opt.uitdagingId, assertie, dek }));
    await naOpenen();
  }, stil);
  const ontgrendelCode = () => doe('code', async () => {
    const r = (await postNu(`${P}/ontgrendelen/herstelcode`, lichaam({ code }))).data as { herstelcode: string };
    setCode(''); setToonCode(false);
    if (r.herstelcode) { setNieuweCode(r.herstelcode); setBewaard(false); }
    await naOpenen();
  });
  const later = () => { const w = wachtOpMens; wachtOpMens = null; w?.(false); toon('chip'); };
  const sluiten = () => { setKlaar(null); toon('weg'); };
  const kopieren = async () => { try { await navigator.clipboard.writeText(opmaakHerstelcode(nieuweCode)); } catch { setFout(tr('Не вдалося скопіювати. Завантажте файл.', 'Kopiëren lukte niet. Download het bestand.')); } };
  const downloaden = () => {
    const tekst = [tr('Mijn Ruimte — код відновлення ключа даних', 'Mijn Ruimte — herstelcode van de gegevenssleutel'), new Date().toLocaleString(taal() === 'nl' ? 'nl-BE' : 'uk-UA'), '', opmaakHerstelcode(nieuweCode), ''].join('\n');
    const url = URL.createObjectURL(new Blob([tekst], { type: 'text/plain;charset=utf-8' }));
    const el = document.createElement('a'); el.href = url; el.download = 'mijn-ruimte-sleutel-herstelcode.txt'; document.body.appendChild(el); el.click(); el.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (zichtbaar === 'chip') {
    return <div className='kluis-poort kluis-poort-chip' role='status' data-kluis-poort='chip'>
      <Lock aria-hidden='true' />
      <span>{tr('Ваші дані зашифровані', 'Uw gegevens zijn versleuteld')}</span>
      <button type='button' className='kluis-poort-primair' onClick={() => toon('kaart')} title={tr('Відкриває картку розшифрування тут, без переходу в налаштування.', 'Opent de ontsleutelkaart hier, zonder naar de instellingen te gaan.')}><LockOpen aria-hidden='true' />{tr('Розшифрувати', 'Ontsleutelen')}</button>
    </div>;
  }

  return <section className='kluis-poort' role='region' aria-labelledby='kluis-poort-titel' data-kluis-poort={klaar ? 'klaar' : 'kaart'}>
    <div className='kluis-poort-kop'>
      <span className='kluis-poort-icoon' data-open={!!klaar} aria-hidden='true'>{klaar ? <LockOpen /> : <Lock />}</span>
      <div className='kluis-poort-tekst'>
        <h2 id='kluis-poort-titel'>{klaar ? tr('Дані розшифровано', 'Gegevens ontsleuteld') : tr('Ваші дані зараз зашифровані', 'Uw gegevens zijn nu versleuteld')}</h2>
        {!klaar && <p>{tr('Тому пошта, хмара та інші розділи поки порожні: нічого не зникло. Ключ ваших даних закривається, коли ви виходите з акаунта або сервер перезапускається після оновлення. Розшифруйте тут, і сторінка одразу дочитає дані.',
          'Daarom zijn mail, cloud en andere onderdelen nu leeg: er is niets verdwenen. De sleutel van uw gegevens sluit wanneer u zich afmeldt of de server na een update herstart. Ontsleutel hier en de pagina laadt meteen verder.')}</p>}
        {klaar && <p>{klaar.onthouden ? tr('Цей пристрій запам’ятано: наступного разу після входу чи оновлення дані розшифруються самі.', 'Dit apparaat is onthouden: na een volgende aanmelding of update worden de gegevens vanzelf ontsleuteld.')
          : tr('Ключ відкрито до виходу з акаунта або перезапуску сервера.', 'De sleutel is open tot afmelden of een herstart van de server.')}</p>}
      </div>
      {!klaar && !nieuweCode && <button type='button' className='kluis-poort-sluit' onClick={later} aria-label={tr('Пізніше', 'Later')} title={tr('Сховати картку. Розділи лишаться порожніми, поки дані не розшифровано; кнопка «Розшифрувати» залишиться внизу екрана.', 'Kaart verbergen. Onderdelen blijven leeg tot de gegevens ontsleuteld zijn; de knop «Ontsleutelen» blijft onderaan het scherm.')}><X /></button>}
    </div>

    {!klaar && <>
      <div className='kluis-poort-knoppen'>
        {metPasskey && <button ref={knop} type='button' className='kluis-poort-primair' disabled={!!bezig} onClick={() => void ontgrendelPasskey(false)}
          title={tr('Ваш passkey відкриває ключ прямо в браузері; сервер ніколи не бачить секрет passkey.', 'Uw passkey opent de sleutel in de browser zelf; de server ziet het geheim van de passkey nooit.')}>
          <Fingerprint aria-hidden='true' />{bezig === 'passkey' ? tr('Чекаємо на passkey…', 'Wachten op passkey…') : tr('Розшифрувати passkey', 'Ontsleutelen met passkey')}</button>}
        {metCode && <button ref={metPasskey ? undefined : knop} type='button' className={metPasskey ? 'kluis-poort-tweede' : 'kluis-poort-primair'} disabled={!!bezig} aria-expanded={toonCode} onClick={() => setToonCode((v) => !v)}
          title={tr('Код із 20 символів, який ви зберегли при ввімкненні шифрування. Після використання він заміниться новим.', 'De code van 20 tekens die u bewaarde bij het inschakelen. Na gebruik wordt hij vervangen door een nieuwe.')}>
          <KeyRound aria-hidden='true' />{tr('Код відновлення', 'Herstelcode')}</button>}
        {!metPasskey && !metCode && <p className='kluis-poort-fout'>{tr('Для цього простору немає жодного способу відкрити ключ у браузері. Відкрийте Налаштування → Способи входу → Шифрування моїх даних.', 'Voor deze ruimte is er geen manier om de sleutel in de browser te openen. Open Instellingen → Aanmeldmethoden → Versleuteling van mijn gegevens.')}</p>}
      </div>
      {toonCode && <form className='kluis-poort-code' onSubmit={(e) => { e.preventDefault(); void ontgrendelCode(); }}>
        <input type='text' autoComplete='off' spellCheck={false} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder='XXXX-XXXX-XXXX-XXXX-XXXX' aria-label={tr('Код відновлення', 'Herstelcode')} />
        <button type='submit' className='kluis-poort-primair' disabled={!!bezig || code.replace(/[^A-Za-z2-9]/g, '').length < 20}><LockOpen aria-hidden='true' />{bezig === 'code' ? tr('Перевіряємо…', 'Controleren…') : tr('Розшифрувати', 'Ontsleutelen')}</button>
      </form>}
      <label className='kluis-poort-onthoud' title={tr('Браузер збереже свою половину ключа (неекспортовану), сервер — другу. Окремо жодна не відкриває дані. Діє 30 днів без використання (не довше 90), забути можна в налаштуваннях; «Вийти всюди» забуває всі пристрої.',
        'De browser bewaart zijn helft van de sleutel (niet-exporteerbaar), de server de andere. Apart opent geen van beide iets. Geldt 30 dagen zonder gebruik (hoogstens 90); vergeten kan in de instellingen; «Overal afmelden» vergeet alle apparaten.')}>
        <input type='checkbox' checked={onthouden} onChange={(e) => { setOnthouden(e.target.checked); zetKeuze(e.target.checked); }} />
        <MonitorSmartphone aria-hidden='true' />
        <span>{tr('Пам’ятати цей пристрій: після повторного входу й оновлень розшифровувати самостійно', 'Dit apparaat onthouden: na opnieuw aanmelden en updates vanzelf ontsleutelen')}</span>
      </label>
      <button type='button' className='kluis-poort-meer' aria-expanded={meer} onClick={() => setMeer((v) => !v)}><ChevronDown aria-hidden='true' data-open={meer} />{tr('Чому так і хто може прочитати мої дані', 'Waarom dit en wie mijn gegevens kan lezen')}</button>
      {meer && <div className='kluis-poort-uitleg'>
        <p>{tr('Ваші дані зашифровані ключем, який є лише у вас. Сервер тримає його в пам’яті тільки поки ви в сесії, тому адміністратор сервера чи резервна копія бази прочитати їх не можуть.', 'Uw gegevens zijn versleuteld met een sleutel die alleen u hebt. De server houdt hem alleen in het geheugen zolang u een sessie hebt, dus de serverbeheerder of een back-up van de database kan ze niet lezen.')}</p>
        <p>{tr('На новому пристрої розшифрування потрібне один раз. На знайомому (якщо ви дозволили його запам’ятати) воно відбувається саме. Ваші дані не змінюються й не видаляються, поки ключ закритий.', 'Op een nieuw apparaat is ontsleutelen één keer nodig. Op een bekend apparaat (als u toestond het te onthouden) gebeurt het vanzelf. Uw gegevens veranderen niet en worden niet verwijderd zolang de sleutel dicht is.')}</p>
      </div>}
      {fout && <p className='kluis-poort-fout' role='alert'>{fout}</p>}
    </>}

    {nieuweCode && <div className='kluis-poort-nieuw' data-kluis-nieuwe-code>
      <strong>{tr('Збережіть новий код відновлення', 'Bewaar de nieuwe herstelcode')}</strong>
      <small>{tr('Використаний код більше не діє. Новий показуємо лише зараз: без нього й без passkey дані не відновити.', 'De gebruikte code werkt niet meer. De nieuwe tonen we alleen nu: zonder hem én zonder passkey zijn de gegevens niet terug te halen.')}</small>
      <code>{opmaakHerstelcode(nieuweCode)}</code>
      <div className='kluis-poort-knoppen'>
        <button type='button' className='kluis-poort-tweede' onClick={downloaden}><Download aria-hidden='true' />{tr('Завантажити', 'Downloaden')}</button>
        <button type='button' className='kluis-poort-tweede' onClick={() => void kopieren()}><Copy aria-hidden='true' />{tr('Копіювати', 'Kopiëren')}</button>
      </div>
      <label className='kluis-poort-onthoud'><input type='checkbox' checked={bewaard} onChange={(e) => setBewaard(e.target.checked)} /><span>{tr('Я зберіг код', 'Ik heb de code bewaard')}</span></label>
    </div>}

    {klaar && <div className='kluis-poort-knoppen'>
      {klaar.herladen && <button type='button' className='kluis-poort-primair' disabled={!!nieuweCode && !bewaard} onClick={() => location.reload()} title={tr('Частина сторінки вже показала «порожньо» до розшифрування; оновлення дочитає все.', 'Een deel van de pagina toonde al «leeg» vóór het ontsleutelen; herladen haalt alles op.')}><Check aria-hidden='true' />{tr('Показати мої дані', 'Mijn gegevens tonen')}</button>}
      <button type='button' className={klaar.herladen ? 'kluis-poort-tweede' : 'kluis-poort-primair'} disabled={!!nieuweCode && !bewaard} onClick={() => { setNieuweCode(''); sluiten(); }}><Check aria-hidden='true' />{tr('Готово', 'Klaar')}</button>
    </div>}
  </section>;
}

/** Alleen voor tests: de toestand terugzetten. */
export function kluisPoortReset() { lopend = null; wachtOpMens = null; afgewezen = 0; zichtbaar = 'weg'; laatsteStand = null; ctx = {}; post = null; }
export function kluisPoortTestPost(p: Post | null) { post = p; }
