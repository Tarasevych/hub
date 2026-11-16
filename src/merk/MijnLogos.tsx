// Налаштування → Теми → «Логотипи сервісів» (REESTR-LOGO-001, 16.11.2026). Instellingen → Thema's → «Logo's van diensten».
//
// Павло: «щоб користувач міг там призначити свій логотип навіть якщо системний є … діє той, який встановив користувач, доки не буде
// видалено користувацький або не замінено». Hier kiest de mens voor elk merk uit het ENE merkregister zijn eigen bestand. Het geldt
// meteen op de hele site (elk <Merk> tekent het), alleen voor hem en alleen in deze ruimte. Rij = logo + menselijke naam + compacte
// knoppen met uitleg in de tooltip; uitleg over bescherming staat ingeklapt. Elke wijziging komt in het meldingencentrum.
import { ChevronDown, Info, RotateCcw, Search, Shapes, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { MERK_EIGEN_MAX_BYTES, merkEigenRedenTekst } from '../../shared/merk-eigen';
import MerkLogo from './MerkLogo';
import Wenk from '../hulp/Wenk';
import { gebruikerMerkenLijst, gebruikerMerkenZetten, merkGebruikerPost, type GebruikerMerkenAntwoord } from './merk-gebruiker-laden';
import { laadMerken, merkDef, opMerken } from './merk-register';
import { laadGalerij, OFFICIEEL_NAMEN, type GalerijRij as Rij } from './merk-galerij';
import './mijn-logos.css';

type Tr = (uk: string, nl: string) => string;

const leesBestand = (f: File) => new Promise<string>((ok, nee) => { const r = new FileReader(); r.onload = () => ok(String(r.result || '').split(',')[1] || ''); r.onerror = () => nee(new Error('LEZEN')); r.readAsDataURL(f); });

export default function MijnLogos({ tr, lang }: { tr: Tr; lang: 'uk' | 'nl' }) {
  const [lijst, setLijst] = useState<GebruikerMerkenAntwoord | null>(null);
  const [alle, setAlle] = useState<Rij[]>([]);
  const [zoek, setZoek] = useState('');
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);
  const [, hertel] = useState(0);
  const invoer = useRef<HTMLInputElement>(null);
  const doel = useRef('');

  useEffect(() => {
    const af = opMerken(() => hertel((n) => n + 1));
    void gebruikerMerkenLijst().then((r) => { if (r) { setLijst(r); gebruikerMerkenZetten(r); } else setLijst({ merken: [] }); }).catch(() => setLijst({ merken: [] }));
    // Mislukt het laden van een bundelstuk (netwerk, nieuwe versie), dan nog één keer na 2 s — anders bleef het zoeken voorgoed leeg.
    let weg = false;
    void laadMerken();
    void laadGalerij().catch(() => new Promise<Rij[]>((ok, nee) => setTimeout(() => void laadGalerij().then(ok, nee), 2000))).then((r) => { if (!weg) setAlle(r); }).catch(() => undefined);
    return () => { weg = true; af(); };
  }, []);

  const naamVan = (k: string) => alle.find((r) => r.sleutel === k)?.naam || merkDef(k)?.naam || OFFICIEEL_NAMEN[k] || k;
  const eigen = lijst?.merken || [];
  const eigenSet = useMemo(() => new Set(eigen.map((m) => m.sleutel)), [eigen]);
  // Павло (16.11): «де кнопка показати логотипи? … один рядок розгортається до більшої кількості». Галерея всіх логотипів сайту:
  // згорнуто — рівно один ряд (скільки влазить у ширину), кнопка «Показати всі» розгортає решту. Пошук фільтрує ту саму галерею.
  // Galerij van alle merken: ingeklapt precies één rij, «Alle tonen» klapt de rest uit; zoeken filtert dezelfde galerij.
  const [uitgeklapt, setUitgeklapt] = useState(false);
  const [kolommen, setKolommen] = useState(6);
  const galerijRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = galerijRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const meet = () => { const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length; if (n > 0) setKolommen(n); };
    meet(); const ro = new ResizeObserver(meet); ro.observe(el); return () => ro.disconnect();
  }, [alle.length > 0]);
  const zoekQ = zoek.trim().toLowerCase();
  const gefilterd = useMemo(() => (zoekQ ? alle.filter((r) => r.naam.toLowerCase().includes(zoekQ) || r.sleutel.includes(zoekQ)) : alle), [zoekQ, alle]);
  const open = uitgeklapt || !!zoekQ;
  const zichtbaar = open ? gefilterd : gefilterd.slice(0, kolommen);

  const kiesBestand = (sleutel: string) => { doel.current = sleutel; setMelding(null); invoer.current?.click(); };

  const opladen = async (f: File | undefined) => {
    const sleutel = doel.current;
    if (!f || !sleutel) return;
    const soort = /\.png$/i.test(f.name) || f.type === 'image/png' ? 'png' : /\.svg$/i.test(f.name) || f.type === 'image/svg+xml' ? 'svg' : '';
    if (!soort) { setMelding({ fout: true, tekst: tr('Лише SVG або PNG.', 'Alleen SVG of PNG.') }); return; }
    if (f.size > MERK_EIGEN_MAX_BYTES) { setMelding({ fout: true, tekst: merkEigenRedenTekst('TE_GROOT', lang) }); return; }
    const naam = naamVan(sleutel), vervangen = eigenSet.has(sleutel);
    setBezig(sleutel);
    try {
      const data = await leesBestand(f);
      const r = await merkGebruikerPost('zetten', { sleutel, soort, data });
      setLijst(r); gebruikerMerkenZetten(r); setZoek('');
      const tekst = vervangen ? tr(`Логотип «${naam}» замінено.`, `Logo «${naam}» vervangen.`) : tr(`Тепер для «${naam}» скрізь ваш логотип.`, `Voor «${naam}» staat nu overal uw logo.`);
      setMelding({ fout: false, tekst });
      emitCanonicalNotice({ text: tekst, kind: 'success', source: 'instellingen', context: naam, topic: `merk-gebruiker|${sleutel}`,
        explain: tr('Діє лише для вас і лише в цьому просторі. Щоб повернути системний логотип, натисніть «Повернути» біля нього в Налаштуваннях → Теми.', 'Geldt alleen voor u en alleen in deze ruimte. Het systeemlogo komt terug met «Terugzetten» in Instellingen → Thema\'s.') });
    } catch (e) {
      const code = String((e as { message?: string } | null)?.message || '');
      const tekst = code === 'SLEUTELKLUIS_GESLOTEN'
        ? tr('Ваш ключ даних зараз закритий, тому логотип не збережено (без ключа ми нічого не зберігаємо відкрито). Відкрийте ключ і спробуйте ще раз.', 'Uw gegevenssleutel is nu dicht, dus het logo is niet bewaard (zonder sleutel bewaren we niets onversleuteld). Open de sleutel en probeer opnieuw.')
        : code.startsWith('MERK_EIGEN_') ? merkEigenRedenTekst(code.slice(11), lang) : `${tr('Не збережено. Код сервера:', 'Niet bewaard. Servercode:')} ${code || 'HTTP'}`;
      setMelding({ fout: true, tekst });
      emitCanonicalNotice({ text: tr(`Логотип «${naam}» не збережено`, `Logo «${naam}» niet bewaard`), kind: 'error', source: 'instellingen', context: naam, topic: `merk-gebruiker|${sleutel}`, explain: tekst });
    } finally { setBezig(''); }
  };

  // Скинути всі свої логотипи — піктограма в заголовку цього блоку. Дія відчутна, тож у два кроки: перше натискання лише «озброює»
  // кнопку на 5 с (червоний натяк і інша підказка), друге — виконує. Alle eigen logo's wissen: twee stappen.
  const [alleKlaar, setAlleKlaar] = useState(false);
  useEffect(() => { if (!alleKlaar) return; const t = window.setTimeout(() => setAlleKlaar(false), 5000); return () => window.clearTimeout(t); }, [alleKlaar]);
  const allesTerug = async () => {
    if (!alleKlaar) { setAlleKlaar(true); return; }
    setAlleKlaar(false); setBezig('*'); setMelding(null);
    const sleutels = eigen.map((m) => m.sleutel);
    let r: GebruikerMerkenAntwoord | null = null, mis = 0;
    for (const k of sleutels) { try { r = await merkGebruikerPost('wissen', { sleutel: k }); } catch { mis++; } }
    if (r) { setLijst(r); gebruikerMerkenZetten(r); }
    const tekst = mis ? tr(`Не вдалося скинути ${mis} з ${sleutels.length}. Спробуйте ще раз.`, `${mis} van ${sleutels.length} niet teruggezet. Probeer opnieuw.`)
      : tr(`Усі ваші логотипи (${sleutels.length}) скинуто — знову системні.`, `Al uw logo's (${sleutels.length}) teruggezet — weer de systeemlogo's.`);
    setMelding({ fout: mis > 0, tekst });
    emitCanonicalNotice({ text: tekst, kind: mis ? 'error' : 'info', source: 'instellingen', context: tr('Логотипи сервісів', 'Logo\'s van diensten'), topic: 'merk-gebruiker|*',
      explain: tr('Ваші файли видалено з сервера; скрізь на сайті знову логотипи сайту. Будь-коли можна призначити нові.', 'Uw bestanden zijn van de server gewist; overal staan weer de logo\'s van de site. U kunt altijd nieuwe kiezen.') });
    setBezig('');
  };

  const terugzetten = async (sleutel: string) => {
    const naam = naamVan(sleutel);
    setBezig(sleutel); setMelding(null);
    try {
      const r = await merkGebruikerPost('wissen', { sleutel });
      setLijst(r); gebruikerMerkenZetten(r);
      const tekst = tr(`Для «${naam}» знову системний логотип.`, `Voor «${naam}» staat weer het systeemlogo.`);
      setMelding({ fout: false, tekst });
      emitCanonicalNotice({ text: tekst, kind: 'info', source: 'instellingen', context: naam, topic: `merk-gebruiker|${sleutel}`,
        explain: tr('Ваш файл видалено з сервера. Будь-коли можна призначити новий.', 'Uw bestand is van de server gewist. U kunt altijd een nieuw kiezen.') });
    } catch (e) {
      const tekst = `${tr('Не вдалося повернути. Код сервера:', 'Terugzetten mislukt. Servercode:')} ${String((e as { message?: string } | null)?.message || 'HTTP')}`;
      setMelding({ fout: true, tekst });
      emitCanonicalNotice({ text: tr(`Логотип «${naam}» не повернуто`, `Logo «${naam}» niet teruggezet`), kind: 'error', source: 'instellingen', context: naam, explain: tekst });
    } finally { setBezig(''); }
  };

  // Павло (16.11): блок як сусідні картки («Кадри й батарея»): на всю ширину, згортається, вміст по центру. Een eigen kaart zoals de buren.
  return <details className='mijn-logos' open={eigen.length > 0 || undefined} data-mijn-logos>
    <summary><Shapes aria-hidden /><h3 id='mijn-logos-kop' className='mijn-logos-kop'>{tr('Логотипи сервісів', 'Logo\'s van diensten')}</h3>{eigen.length > 0 && <small className='mijn-logos-teller'>{eigen.length}</small>}
      {eigen.length > 0 && <Wenk tekst={alleKlaar ? tr('Натисніть ще раз, щоб скинути всі свої логотипи. Ваші файли буде видалено, повернуться системні.', 'Klik nog eens om al uw logo\'s terug te zetten. Uw bestanden worden gewist, de systeemlogo\'s komen terug.') : tr(`Скинути всі мої логотипи (${eigen.length}): скрізь на сайті знову будуть системні. Потрібне підтвердження.`, `Al mijn logo's terugzetten (${eigen.length}): overal weer de systeemlogo's. Bevestiging nodig.`)}>
        <button type='button' className={`mijn-logos-knop mijn-logos-alles is-zacht-gevaar${alleKlaar ? ' is-klaar' : ''}`} disabled={!!bezig} data-mijn-logos-alles
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void allesTerug(); }}
          aria-label={alleKlaar ? tr('Підтвердити: скинути всі мої логотипи', 'Bevestigen: al mijn logo\'s terugzetten') : tr('Скинути всі мої логотипи', 'Al mijn logo\'s terugzetten')}><RotateCcw aria-hidden /></button>
      </Wenk>}<ChevronDown className='mijn-logos-pijl' aria-hidden /></summary>
    <div className='mijn-logos-binnen'>
    <p className='mijn-logos-noot'>{tr('Свій логотип для будь-якого сервісу. Бачите його лише ви.', 'Uw eigen logo voor elke dienst. Alleen u ziet het.')}</p>

    {eigen.length > 0 && <ul className='mijn-logos-lijst' aria-label={tr('Ваші логотипи', 'Uw logo\'s')}>
      {eigen.map((m) => {
        const naam = naamVan(m.sleutel);
        return <li key={m.sleutel} className='mijn-logos-rij is-eigen' data-mijn-logo={m.sleutel}>
          <MerkLogo id={m.sleutel} naam={naam} logo={m.sleutel} maat={36} />
          <span className='mijn-logos-naam'><strong>{naam}</strong><small>{tr('ваш логотип', 'uw logo')}</small></span>
          <Wenk tekst={tr('Системний логотип — повернеться, якщо прибрати ваш', 'Systeemlogo — komt terug als u het uwe wist')}><span className='mijn-logos-systeem'>
            <MerkLogo id={m.sleutel} naam={naam} logo={m.sleutel} maat={22} zonderGebruiker />
          </span></Wenk>
          <Wenk tekst={tr(`Замінити: новий файл одразу замінить ваш логотип «${naam}» скрізь на сайті`, `Vervangen: een nieuw bestand vervangt meteen uw logo «${naam}» op de hele site`)}><button type='button' className='mijn-logos-knop' disabled={!!bezig} onClick={() => kiesBestand(m.sleutel)} data-mijn-logo-vervang={m.sleutel}
            aria-label={tr(`Замінити логотип ${naam}`, `Logo ${naam} vervangen`)}><Upload aria-hidden /></button></Wenk>
          <Wenk tekst={tr(`Повернути системний: ваш файл буде видалено, і для «${naam}» знову з'явиться логотип сайту`, `Terugzetten: uw bestand wordt gewist en voor «${naam}» staat weer het logo van de site`)}><button type='button' className='mijn-logos-knop is-zacht-gevaar' disabled={!!bezig} onClick={() => void terugzetten(m.sleutel)} data-mijn-logo-terug={m.sleutel}
            aria-label={tr(`Повернути системний логотип ${naam}`, `Systeemlogo ${naam} terugzetten`)}><RotateCcw aria-hidden /></button></Wenk>
        </li>;
      })}
    </ul>}
    {lijst?.gesloten ? <p className='mijn-logos-noot' role='status' data-mijn-logos-gesloten>{tr(`Ще ${lijst.gesloten} ваших логотипів зашифровано вашим ключем — вони з'являться, щойно ключ відкриється.`, `Nog ${lijst.gesloten} van uw logo's zijn versleuteld met uw sleutel — ze verschijnen zodra de sleutel open is.`)}</p> : null}

    <div className='mijn-logos-zoek' role='search'>
      <Search aria-hidden />
      <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('Знайти сервіс серед логотипів…', 'Zoek een dienst tussen de logo\'s…')}
        aria-label={tr('Знайти сервіс', 'Dienst zoeken')} data-mijn-logos-zoek />
    </div>
    {alle.length > 0 && <ul ref={galerijRef} className='mijn-logos-galerij' id='mijn-logos-galerij' aria-label={tr('Усі логотипи сайту', 'Alle logo\'s van de site')} data-mijn-logos-galerij data-open={open || undefined}>
      {zichtbaar.map((r) => {
        const is = eigenSet.has(r.sleutel);
        return <li key={r.sleutel}><Wenk tekst={is
          ? tr(`«${r.naam}»: зараз ваш логотип. Натисніть, щоб замінити його іншим файлом.`, `«${r.naam}»: nu uw logo. Klik om het door een ander bestand te vervangen.`)
          : tr(`«${r.naam}»: системний логотип. Натисніть і виберіть свій файл (SVG або PNG) — він замінить цей логотип скрізь на сайті, лише для вас.`, `«${r.naam}»: systeemlogo. Klik en kies uw bestand (SVG of PNG) — het vervangt dit logo op de hele site, alleen voor u.`)}>
          <button type='button' className={`mijn-logos-tegel${is ? ' is-eigen' : ''}`} disabled={!!bezig} onClick={() => kiesBestand(r.sleutel)} data-mijn-logo-kies={r.sleutel}
            aria-label={is ? tr(`Замінити свій логотип ${r.naam}`, `Eigen logo ${r.naam} vervangen`) : tr(`Призначити свій логотип для ${r.naam}`, `Eigen logo kiezen voor ${r.naam}`)}>
            <MerkLogo id={r.sleutel} naam={r.naam} logo={r.sleutel} maat={32} /><span>{r.naam}</span>
          </button></Wenk></li>;
      })}
    </ul>}
    {zoekQ && !gefilterd.length && alle.length > 0 && <p className='mijn-logos-noot'>{tr('Такого сервісу на сайті немає.', 'Deze dienst komt op de site niet voor.')}</p>}
    {!zoekQ && alle.length > kolommen && <button type='button' className='mijn-logos-meer' aria-expanded={uitgeklapt} aria-controls='mijn-logos-galerij' data-mijn-logos-meer
      onClick={() => setUitgeklapt((v) => !v)}>
      {uitgeklapt ? tr('Згорнути до одного ряду', 'Inklappen tot één rij') : tr(`Показати всі логотипи (${alle.length})`, `Alle logo's tonen (${alle.length})`)}<ChevronDown aria-hidden />
    </button>}

    {melding && <p className={`mijn-logos-melding${melding.fout ? ' is-fout' : ''}`} role={melding.fout ? 'alert' : 'status'}>{melding.tekst}</p>}

    <details className='mijn-logos-uitleg'>
      <summary><Info aria-hidden />{tr('Як це працює', 'Hoe het werkt')}</summary>
      <ul>
        <li>{tr('Ваш логотип показується всюди, де на сайті є цей сервіс: у меню, пошті, підключеннях, способах входу.', 'Uw logo staat overal waar de dienst op de site voorkomt: menu, post, koppelingen, aanmeldmethoden.')}</li>
        <li>{tr('Інші люди на цьому сервері, і навіть його власник, вашого файла не бачать. Якщо ввімкнено ваш ключ даних, файл зашифровано ним.', 'Andere mensen op deze server, ook de eigenaar, zien uw bestand niet. Staat uw gegevenssleutel aan, dan is het daarmee versleuteld.')}</li>
        <li>{tr('Особистий і технічний простори мають окремі логотипи.', 'De persoonlijke en de technische ruimte hebben elk hun eigen logo\'s.')}</li>
        <li>{tr(`Файл SVG або PNG до 200 КБ. SVG без скриптів і зовнішніх посилань (такий файл буде відхилено). До ${lijst?.max ?? 64} логотипів.`, `Bestand SVG of PNG tot 200 KB. SVG zonder scripts of externe verwijzingen (zo'n bestand wordt geweigerd). Tot ${lijst?.max ?? 64} logo's.`)}</li>
        <li>{tr('Прибрали свій — одразу повертається системний логотип.', 'Uw logo gewist — het systeemlogo staat meteen terug.')}</li>
      </ul>
    </details>
    <input ref={invoer} type='file' hidden accept='.svg,.png,image/svg+xml,image/png' onChange={(e) => { void opladen(e.target.files?.[0]); e.target.value = ''; }} data-mijn-logos-bestand />
    </div>
  </details>;
}
