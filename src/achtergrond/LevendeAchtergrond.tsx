// ACHTERGROND-001: «Живий фон» сторінок — великі розмиті плями непропорційних форм, що повільно переливаються з відтінку у відтінок
// від краю до краю сторінки. Монтується в оболонці (CanoniekOmlijsting) першою дитиною main.canonical-chrome, тож діє на всіх сервісах
// з оболонкою, зокрема в адмін-панелі. Налаштування — «Налаштування → Теми → Живий фон» (src/achtergrond/AchtergrondInstellingen.tsx).
// Ощадливість (досвід ZAVYSANNIA-001): малюємо в окремому потоці на полотні ≈1/8 вікна, браузер лише розтягує готовий малюнок;
// жодних filter/backdrop-перемальовувань у основному потоці; пауза на прихованій вкладці; «Зменшити рух» — один нерухомий кадр;
// на телефоні/планшеті в стані «Авто» — полегшений режим (до 4 плям, ≤ 24 кадри/с, ще менше полотно); слабкий пристрій сам
// переходить у полегшений режим і пише про це в центр сповіщень.
// Levende achtergrond: getekend in een eigen thread op een klein canvas; pauze bij verborgen tabblad; respecteert «minder beweging».
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThemaStand } from '../thema/useThema';
import { minderBeweging } from '../thema/weergave-stijl';
import { achtergrondVolledig } from '../../shared/uiterlijk';
import { maakPlan, polotno, teken, tintVan, type Omgeving, type Plan } from './levende-kern';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import './levende-achtergrond.css';

type Motor = { plan(p: Plan): void; maat(w: number, h: number): void; loop(aan: boolean): void; stop(): void };

let kleurCtx: CanvasRenderingContext2D | null | undefined;
const kleurCache = new Map<string, string>();
function normaliseerKleur(ruw: string): string {
  const hit = kleurCache.get(ruw);
  if (hit !== undefined) return hit;
  let norm = '';
  try {
    if (kleurCtx === undefined) kleurCtx = document.createElement('canvas').getContext('2d');
    if (kleurCtx) { kleurCtx.fillStyle = '#000'; kleurCtx.fillStyle = ruw; norm = String(kleurCtx.fillStyle); }
  } catch { /* geen accent: standaardtint */ }
  if (kleurCache.size > 64) kleurCache.clear();
  kleurCache.set(ruw, norm);
  return norm;
}

/** Середовище сторінки: тема, акцент, «слабкий» пристрій. Omgeving van de pagina. */
function leesOmgeving(el: HTMLElement | null, zuinig: boolean): Omgeving {
  const chrome = (el?.closest('.canonical-chrome') as HTMLElement | null) || document.documentElement;
  const donker = /\btheme-(dark|plum-dark)\b/.test(`${chrome.className} ${document.documentElement.className}`) && !/\btheme-(light|plum-light)\b/.test(chrome.className);
  let accent = '';
  try {
    const ruw = getComputedStyle(chrome).getPropertyValue('--accent').trim();
    if (ruw) accent = normaliseerKleur(ruw);
  } catch { /* geen accent: standaardtint */ }
  return { licht: !donker, accentTint: tintVan(accent), zuinig };
}

const aanraak = () => { try { return matchMedia('(pointer: coarse)').matches || window.innerWidth < 900; } catch { return false; } };

function hoofdMotor(doek: HTMLCanvasElement, plan0: Plan, w0: number, h0: number, opMeting?: (ms: number) => void): Motor {
  // Запасний шлях без OffscreenCanvas (старий Safari): той самий малюнок в основному потоці, кадри й вимірювання так само обмежені.
  const ctx = doek.getContext('2d');
  let plan = plan0, vw = w0, vh = h0, t = 0, vorige = 0, laatste = 0, id = 0, loopt = false;
  let meetSom = 0, meetN = 0, meetVan = performance.now();
  const maat = () => { const p = polotno(vw, vh, plan); if (doek.width !== p.w) doek.width = p.w; if (doek.height !== p.h) doek.height = p.h; };
  const beeld = (meten: boolean) => {
    if (!ctx) return;
    const a = meten ? performance.now() : 0;
    teken(ctx, doek.width, doek.height, t, plan);
    if (meten && opMeting) {
      meetSom += performance.now() - a; meetN += 1;
      if (a - meetVan > 4000) { opMeting(meetN ? meetSom / meetN : 0); meetSom = 0; meetN = 0; meetVan = a; }
    }
  };
  const lus = (nu: number) => {
    id = 0;
    if (!loopt || (typeof document !== 'undefined' && document.hidden)) { vorige = 0; return; }
    const stap = 1000 / Math.max(1, Math.min(plan.fps, 45));
    if (nu - laatste >= stap - 2) { t += Math.min(0.25, Math.max(0, (nu - (vorige || nu)) / 1000)); vorige = nu; laatste = nu; beeld(true); }
    id = requestAnimationFrame(lus);
  };
  maat(); beeld(false);
  return {
    plan(p) { plan = p; maat(); beeld(false); },
    maat(w, h) { vw = w; vh = h; maat(); beeld(false); },
    loop(aan) { loopt = aan; vorige = 0; if (aan && !id) id = requestAnimationFrame(lus); if (!aan && id) { cancelAnimationFrame(id); id = 0; } },
    stop() { loopt = false; if (id) cancelAnimationFrame(id); },
  };
}

function werkerMotor(doek: HTMLCanvasElement, plan0: Plan, w: number, h: number, opMeting: (ms: number) => void): Motor | null {
  if (typeof Worker === 'undefined' || typeof (doek as HTMLCanvasElement & { transferControlToOffscreen?: unknown }).transferControlToOffscreen !== 'function') return null;
  let werker: Worker;
  try { werker = new Worker(new URL('./levende-werker.ts', import.meta.url), { type: 'module', name: 'levende-achtergrond' }); }
  catch { return null; }
  const offscreen = doek.transferControlToOffscreen();
  werker.postMessage({ soort: 'start', doek: offscreen, plan: plan0, w, h, t: 0, loopt: false }, [offscreen]);
  werker.onmessage = (e: MessageEvent<{ soort: string; ms?: number }>) => { if (e.data?.soort === 'meting' && typeof e.data.ms === 'number') opMeting(e.data.ms); };
  return {
    plan(p) { werker.postMessage({ soort: 'plan', plan: p }); },
    maat(w2, h2) { werker.postMessage({ soort: 'maat', w: w2, h: h2 }); },
    loop(aan) { werker.postMessage({ soort: 'loop', loopt: aan }); },
    stop() { werker.terminate(); },
  };
}

/** Чи прихований фон самою сторінкою: власне фото «Робочого столу» не перекриваємо. Eigen foto van het bureaublad niet bedekken. */
function verborgenDoorPagina(el: HTMLElement | null): boolean {
  const chrome = el?.closest('.canonical-chrome') as HTMLElement | null;
  return chrome?.dataset.achtergrond === 'eigen';
}

const ZWAK_SLEUTEL = 'tsv:levende-achtergrond:zwak';
const ZWAK_MS = 7;

export default function LevendeAchtergrond({ lang }: { lang: 'uk' | 'nl' }) {
  const { achtergrond } = useThemaStand();
  const inst = achtergrondVolledig(achtergrond);
  const doekRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const [omgevingSleutel, setOmgevingSleutel] = useState(0);
  const [zwak, setZwak] = useState(() => { try { return sessionStorage.getItem(ZWAK_SLEUTEL) === '1'; } catch { return false; } });
  const [isAanraak, setIsAanraak] = useState(aanraak);
  const [verborgen, setVerborgen] = useState(false);
  const [stil, setStil] = useState(() => minderBeweging());
  const [zichtbaar, setZichtbaar] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const actief = inst.stand !== 'uit' && !verborgen;
  const zuinig = inst.stand === 'auto' && (isAanraak || zwak);
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const achtergrondSleutel = JSON.stringify(achtergrond || {});
  const plan = useMemo(
    () => (actief ? maakPlan(achtergrond, leesOmgevingVeilig(doekRef.current, zuinig)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actief, achtergrondSleutel, zuinig, omgevingSleutel],
  );

  // Тема, акцент, «Макет», «менше руху», сенсорний екран — стежимо за атрибутами <html>, оболонки і медіазапитами.
  useEffect(() => {
    const el = doekRef.current?.parentElement || null;
    const ververs = () => { setVerborgen(verborgenDoorPagina(doekRef.current)); setStil(minderBeweging()); setIsAanraak(aanraak()); setOmgevingSleutel((n) => n + 1); };
    const mo = new MutationObserver(ververs);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-identiteit-maquette', 'data-beweging', 'data-accent'] });
    const chrome = el?.closest('.canonical-chrome');
    if (chrome) mo.observe(chrome, { attributes: true, attributeFilter: ['class', 'data-achtergrond'] });
    let mq: MediaQueryList | null = null;
    let mqCoarse: MediaQueryList | null = null;
    try { mq = matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener('change', ververs); } catch { /* oude browser */ }
    try { mqCoarse = matchMedia('(pointer: coarse)'); mqCoarse.addEventListener('change', ververs); } catch { /* oude browser */ }
    const zicht = () => setZichtbaar(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', zicht);
    ververs();
    return () => { mo.disconnect(); mq?.removeEventListener('change', ververs); mqCoarse?.removeEventListener('change', ververs); document.removeEventListener('visibilitychange', zicht); };
  }, []);

  // <html data-levende-achtergrond="aan">: робоча область стає прозорою, щоб фон було видно від краю до краю.
  useEffect(() => {
    const root = document.documentElement;
    if (actief) root.dataset.levendeAchtergrond = 'aan'; else delete root.dataset.levendeAchtergrond;
    return () => { delete root.dataset.levendeAchtergrond; };
  }, [actief]);

  // Запуск/зупинка рушія. Motor starten en stoppen.
  useEffect(() => {
    const doek = doekRef.current;
    if (!actief || !doek || !plan) return;
    let gemeld = false;
    const opMeting = (ms: number) => {
      // Слабкий пристрій: кадр довший за 7 мс у стані «Авто» — полегшений режим до кінця сеансу вкладки + запис у центр сповіщень.
      if (ms <= ZWAK_MS || gemeld || inst.stand !== 'auto' || zuinig) return;
      gemeld = true;
      try { sessionStorage.setItem(ZWAK_SLEUTEL, '1'); } catch { /* privémodus */ }
      setZwak(true);
      emitCanonicalNotice({
        text: tr('Живий фон перейшов у полегшений режим: пристрій малював кадри повільно', 'Levende achtergrond staat in de lichte modus: dit apparaat tekende de beelden traag'),
        kind: 'info', source: 'systeem.achtergrond', alleenPaneel: true, dedupeSeconds: 3600,
        details: [{ title: tr('Що змінилося', 'Wat is er veranderd'), items: [
          { icon: 'duration', label: tr('Причина', 'Reden'), value: tr(`середній кадр ${ms.toFixed(1)} мс (межа ${ZWAK_MS} мс)`, `gemiddeld beeld ${ms.toFixed(1)} ms (grens ${ZWAK_MS} ms)`) },
          { icon: 'saved', label: tr('Тепер', 'Nu'), value: tr('до 4 плям, до 24 кадрів/с — менше навантаження й батареї', 'hoogstens 4 vlekken, 24 beelden/s — minder belasting en batterij') },
          { icon: 'scope', label: tr('Як повернути', 'Terugzetten'), value: tr('Налаштування → Теми → Живий фон → «Завжди повний»', 'Instellingen → Thema\'s → Levende achtergrond → «Altijd volledig»') },
        ] }],
      });
    };
    // Полотно можна передати в потік лише раз — тому новий рушій отримує новий елемент (ключ нижче).
    const motor = werkerMotor(doek, plan, window.innerWidth, window.innerHeight, opMeting) || hoofdMotor(doek, plan, window.innerWidth, window.innerHeight, opMeting);
    motorRef.current = motor;
    let rt = 0;
    const opMaat = () => {
      if (rt) return;
      rt = window.setTimeout(() => {
        rt = 0;
        setIsAanraak(aanraak());
        motor.maat(window.innerWidth, window.innerHeight);
      }, 150);
    };
    window.addEventListener('resize', opMaat);
    return () => { window.removeEventListener('resize', opMaat); if (rt) clearTimeout(rt); motor.stop(); motorRef.current = null; };
    // Рушій перезапускається лише при ввімкненні/вимкненні; решта змін іде через motor.plan().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actief]);

  // Нові налаштування / тема — новий план без перезапуску (плями не стрибають: той самий «зерновий» порядок).
  useEffect(() => {
    if (!actief || !motorRef.current || !plan) return;
    motorRef.current.plan(plan);
  }, [actief, plan]);

  // Рух лише на видимій вкладці й без «менше руху». Alleen bewegen als het tabblad zichtbaar is.
  useEffect(() => { motorRef.current?.loop(actief && zichtbaar && !stil); }, [actief, zichtbaar, stil, omgevingSleutel]);

  const dekking = plan?.dekking ?? 0;
  return <canvas key={actief ? 'aan' : 'uit'} ref={doekRef} className='levende-achtergrond' aria-hidden='true' data-levende-achtergrond={actief ? (zuinig ? 'zuinig' : 'vol') : 'uit'}
    data-stil={stil ? 'ja' : undefined} hidden={!actief} style={{ ['--la-dekking' as string]: String(dekking) }} />;
}

function leesOmgevingVeilig(el: HTMLElement | null, zuinig: boolean): Omgeving {
  try { return leesOmgeving(el, zuinig); } catch { return { licht: false, accentTint: 262, zuinig }; }
}
