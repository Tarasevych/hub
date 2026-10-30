// Melding in de mail over de volledige controle van alle adressen: start die één keer automatisch (daarna incrementeel) en toont
// de voortgang met «Пауза» / «Зупинити» / «Відкрити». Op de pagina «Контакти й відправники» zelf niet (daar staat het paneel).
//
// Punt 15 (19.10.2026), melding van de eigenaar: «віконце не можна пересунути й згорнути, воно лізе під бічне меню», «немає
// вибору продовжити / пропустити», «немає запам'ятати мій вибір», «треба натискати вручну ~101 раз».
//   - Breed scherm: een echt venster uit de bestaande vensterbeheer (src/platform/vensters.tsx) — slepen aan de titelbalk,
//     «Згорнути» naar het dok, grootte wijzigen, en de gezamenlijke laag VENSTER_BASIS (100 000). Dat ligt boven de zijbalk:
//     die staat in de ladenstand op z-index 260 (met een scrim op 250) en de oude `.ctv-melding` stond op 240 — precies wat
//     eroverheen lag. `modaal={false}`: de pagina blijft bedienbaar, de controle loopt door.
//   - Smal scherm (< 560 px): een venster wordt daar schermvullend, wat voor een voortgangsmelding te veel is. Daar blijft de
//     compacte strook, nu inklapbaar en met een z-index boven de zijbalklade.
//   - Herhalen gaat automatisch (ScanPaneel: useScanActies + useAutoHervatten); «Продовжити» hoeft niemand meer te klikken.
import { BookUser, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Venster, useVensters, vensterBeheer } from '../platform/vensters';
import { contactenApi, openContacten, useScanStand, zetScanStand, type ScanStand } from './api';
import { ScanBeleidKeuze, ScanHerhaalRegel, ScanKnoppen, scanProcent, scanZin, useAutoHervatten, useScanActies, useScanBeleid, type ScanActies } from './ScanPaneel';
import { bewaarKeuze, eenmaligAuto, leesKeuze, scanVraagtAandacht, scanZichtbaar, SCAN_NAGLOEI_MS, type ScanKeuze } from './scan-weergave';
import './afzenders.css';
import './contacten.css';

type Lang = 'uk' | 'nl';
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const VENSTER_ID = 'mail-contacten-scan';
const BREED = () => typeof window !== 'undefined' && window.innerWidth >= 560;

function Inhoud({ lang, s, a, beleid }: { lang: Lang; s: ScanStand; a: ScanActies; beleid: ReturnType<typeof useScanBeleid> }) {
  const pct = scanProcent(s);
  return <div className='ctv-melding-inhoud'>
    <p>{scanZin(lang, s)}</p>
    <ScanHerhaalRegel lang={lang} s={s} a={a} />
    {s.loopt && <div className='afz-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t(lang, 'Хід перевірки', 'Voortgang van de controle')}><span style={{ width: `${pct}%` }} /></div>}
    {a.fout && <p className='afz-fout' role='alert'>{a.fout}</p>}
    <div className='ctv-melding-knoppen'>
      <ScanKnoppen lang={lang} s={s} a={a} compact />
      <button type='button' className='afz-knop' onClick={() => void openContacten('', lang)}>{t(lang, 'Відкрити', 'Openen')}</button>
    </div>
    <ScanBeleidKeuze lang={lang} beleid={beleid.beleid} onKies={beleid.kies} bezig={beleid.bezig} />
  </div>;
}

// BUG-002 (29.10.2026): het venster sprong vanzelf open en dicht. Nu:
//  - de keuze van de gebruiker (open / klein / weg) staat los van de controle (scan-weergave.ts, sessionStorage) en wordt bij elke
//    nieuwe mount teruggezet — ook na tabwissel, sessiecontrole, verversen en een nieuwe run;
//  - zichtbaar met naglooi: een korte wissel (fout → hervatten, poll mislukt) haalt het venster niet weg;
//  - het korte periodieke bijwerken opent het venster niet zelf; …/scan/auto één keer per paginabezoek.
function useZichtbaar(aandacht: boolean) {
  const [, tik] = useState(0);
  const was = useRef(false), sinds = useRef<number | null>(null);
  if (aandacht) sinds.current = null; else if (was.current && sinds.current === null) sinds.current = Date.now();
  const zicht = scanZichtbaar(aandacht, was.current, sinds.current);
  was.current = zicht;
  useEffect(() => {
    if (!zicht || aandacht) return;
    const id = window.setTimeout(() => tik((v) => v + 1), SCAN_NAGLOEI_MS + 50);
    return () => window.clearTimeout(id);
  }, [zicht, aandacht]);
  return zicht;
}

export default function ContactenScanMelding({ lang, actief }: { lang: Lang; actief: boolean }) {
  const s = useScanStand(), beleid = useScanBeleid(s), a = useScanActies(lang, beleid.beleid);
  const [keuze, setKeuzeState] = useState<ScanKeuze | null>(leesKeuze);
  const kies = (k: ScanKeuze) => { setKeuzeState(k); bewaarKeuze(k); };
  // 21.10 рецензія UX: на телефоні смуга починає згорнутою (лише заголовок, «⌃» розгортає; перевірка триває у фоні).
  // BUG-002: daarna geldt de keuze van de gebruiker, ook na een nieuwe mount.
  const [breed, setBreed] = useState(BREED);
  const ingeklapt = keuze ? keuze === 'klein' : !breed;
  useEffect(() => { eenmaligAuto(() => contactenApi.scanAuto().then(zetScanStand)); }, []);
  useEffect(() => {
    const op = () => setBreed(BREED());
    window.addEventListener('resize', op);
    return () => window.removeEventListener('resize', op);
  }, []);
  useAutoHervatten(s, a, beleid.beleid);
  const zicht = useZichtbaar(scanVraagtAandacht(s, !!a.herhaal));
  const toon = actief && keuze !== 'weg' && !!s && zicht;
  // Breed venster: «klein» terugzetten zodra het (opnieuw) geregistreerd is, en «Згорнути» / terughalen uit het dok onthouden.
  const vensters = useVensters(), item = vensters.find((v) => v.id === VENSTER_ID);
  const hersteld = useRef(false);
  useLayoutEffect(() => {
    if (!toon || !breed) { hersteld.current = false; return; }
    if (keuze === 'klein') vensterBeheer.minimaliseer(VENSTER_ID);
    hersteld.current = true;
  }, [toon, breed]); // eslint-disable-line react-hooks/exhaustive-deps
  const vorigKlein = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const k = item?.klein, vorig = vorigKlein.current;
    vorigKlein.current = k;
    // Alleen een echte wissel van een staand venster (Згорнути / terughalen uit het dok) is een keuze; (her)registreren niet.
    if (k === undefined || vorig === undefined || k === vorig || !hersteld.current || !breed) return;
    kies(k ? 'klein' : 'open');
  }, [item?.klein]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!toon || !s) return null;
  const titel = t(lang, 'Перевірка всіх адрес', 'Controle van alle adressen');
  const sluit = () => kies('weg');

  // Breed: het gezamenlijke venster (slepen, «Згорнути» naar het dok, boven de zijbalk).
  if (breed) return <Venster id={VENSTER_ID} titel={titel} modaal={false} breedte={380} className='ctv-melding-venster' lang={lang === 'uk' ? 'uk' : 'nl'}
    kop={<span className='ctv-melding-kop'><BookUser aria-hidden='true' style={{ width: 16, height: 16 }} /><strong>{titel}</strong></span>} onSluit={sluit}>
    <Inhoud lang={lang} s={s} a={a} beleid={beleid} />
  </Venster>;

  // Smal: compacte strook, inklapbaar, boven de zijbalklade.
  return <aside className='ctv-melding' role='status' aria-live='polite' aria-label={t(lang, 'Перевірка адрес у пошті', 'Controle van de adressen in de mail')} data-ingeklapt={ingeklapt ? 'ja' : 'nee'}>
    <div className='ctv-melding-kop'>
      <BookUser aria-hidden='true' style={{ width: 16, height: 16 }} />
      <strong>{titel}</strong>
      <button type='button' className='ctv-melding-weg' aria-expanded={!ingeklapt} aria-label={ingeklapt ? t(lang, 'Розгорнути', 'Uitklappen') : t(lang, 'Згорнути (перевірка триватиме)', 'Inklappen (de controle loopt door)')} onClick={() => kies(ingeklapt ? 'open' : 'klein')}>
        {ingeklapt ? <ChevronUp aria-hidden='true' style={{ width: 16, height: 16 }} /> : <ChevronDown aria-hidden='true' style={{ width: 16, height: 16 }} />}
      </button>
      <button type='button' className='ctv-melding-weg' aria-label={t(lang, 'Сховати (перевірка триватиме)', 'Verbergen (de controle loopt door)')} onClick={sluit}><X aria-hidden='true' style={{ width: 16, height: 16 }} /></button>
    </div>
    {!ingeklapt && <Inhoud lang={lang} s={s} a={a} beleid={beleid} />}
  </aside>;
}
