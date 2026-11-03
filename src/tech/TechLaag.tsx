// Laag van het technisch profiel: de band bovenaan (alleen als het profiel in DIT tabblad loopt) en de vensters «Увімкнути»,
// «Колір смуги» en «Технічні профілі». Eigen React-root (main.tsx), los van de dienst die eronder draait, zodat de band op elke
// pagina van elk subdomein hetzelfde is.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ToetsEvent, type ReactElement } from 'react';
import { AppWindow, Bot, Clock, Flag, Home, KeyRound, LifeBuoy, LogOut, Menu, MonitorUp, Network, Palette, Rocket, Search, ShieldCheck, SlidersHorizontal, SquareTerminal, Timer, Users } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { canonicalNavigationUrl, routeLang } from '../canoniek-navigatie';
import { HELP_TECH, contrast, maxMinutenVoor, openEindeToegestaan, rolInfo, type BandKleur, type BandPatroon, type TechRol } from '../../shared/tech-rollen';
import { SSH_CA_VLAG } from '../../shared/ssh-ca';
import { koppelHeadroom } from './band-inschuiven';
import { neemOpgespaardVenster, openTechVenster, startTech, techActief, techActiveren, techBand, techBeeindigen, techBody, techErfNieuweTabbladen, techErven, techMag, useTech, type TechStatus, type TechVenster } from './tech-opslag';
import Vraag from './Vraag';
import DiagnoseLaag from '../diagnose/Diagnose';
import { OndersteuningVenster, ToestemmingLaag } from '../ondersteuning/Ondersteuning';
import { ImpersonatieGebruiker, ImpersonatieKnop } from '../impersonatie/Impersonatie';
import { Suspense } from 'react';
import { TechBundelGrens, lazyTech } from './tech-bundel';
const TerminalOpenen = lazyTech(() => import('../terminal/Terminal').then((m) => ({ default: m.TerminalOpenen })));
const RemoteBureaublad = lazyTech(() => import('../extern/ExternBureaublad'));
import { useRemoteAantal } from '../extern/extern-opslag';
const VlaggenVenster = lazyTech(() => import('../vlaggen/Vlaggen'));
// Kaart «SSH-сертифікати» (18.10.2026): stand, voorbereiden/aan/uit, uitgeven 5–60 min, lijst en intrekken. Vervangt het losse venster.
const SshCertificaat = lazyTech(() => import('../ssh/SshBeheer'));
import './tech.css';
import HulpVraag from '../hulp/HulpVraag';
import { TechMeldingenKnop } from '../meldingen/TechMeldingen';
// Statusregel van de browserextensie (0.5): live, alleen met een gekoppelde browser en alleen zolang de band loopt.
import { useExtensieRegel } from '../extensie/extensie-live';
import '../extensie/ExtensieOntgrendeling.css';
// Twee ruimtes van één account (vlag tech-ruimtes-v2, standaard UIT = precies de oude weergave hieronder).
import { laadRuimtesVlag, ruimtesV2Nu, useRuimtesV2 } from './ruimtes/ruimtes-vlag';
import { startRuimtes } from './ruimtes/ruimtes-opslag';
import { WOORDEN } from './ruimtes/teksten';
// 03.11.2026: via lazyTech (zoals terminal/vlaggen/ssh) in plaats van kaal React.lazy — tech-bundels.test.ts eist «nooit kaal lazy» in
// TechLaag; bij een mislukte lading eerst de status vernieuwen en één keer opnieuw proberen. Alle vijf staan al binnen TechBundelGrens.
const RuimteWissel = lazyTech(() => import('./ruimtes/RuimteWissel'));
const RuimteStart = lazyTech(() => import('./ruimtes/StartVenster'));
const RuimteToegang = lazyTech(() => import('./ruimtes/ToegangPagina'));
const RuimteUitloggen = lazyTech(() => import('./ruimtes/UitloggenKeuze'));
const RuimteDok = lazyTech(() => import('./ruimtes/RuimteDok'));
import { ChevronDown, ChevronUp } from 'lucide-react';
import { bewaarVoorkeur, leesVoorkeur, STROOK_NAMEN, STROOK_STANDAARD_KNOPPEN, verplaats, volgendeModus, zetAan, type StrookVoorkeur } from './strook-voorkeur';
import { StrookInstelPaneel, StrookKnopMenu, type KnopMenuItem } from './StrookPaneel';
import './strook.css';
import { zetTabbladMerk } from './ruimtes/tabblad-pictogram';

const fout = (e: unknown) => String((e as Error)?.message || 'FOUT');
const FOUTEN: Record<string, [string, string]> = {
  DUUR_ONGELDIG: ['Такий термін недоступний для ваших ролей.', 'Deze duur is niet beschikbaar voor uw rollen.'],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  GEEN_TECH_PROFIEL: ['У вас немає технічного профілю.', 'U hebt geen technisch profiel.'],
  TECH_NIET_ACTIEF: ['Спершу увімкніть технічний профіль у цій вкладці.', 'Zet eerst het technisch profiel in dit tabblad aan.'],
  DELEGEREN_NIET_TOEGESTAAN: ['Ваші ролі не дозволяють призначати профілі.', 'Uw rollen staan toekennen niet toe.'],
  ROLLEN_BOVEN_EIGEN: ['Можна давати чи забирати лише ролі, які маєте самі.', 'U kunt alleen rollen geven of intrekken die u zelf hebt.'],
  EIGENAAR_ONAANTASTBAAR: ['Профіль власника сервера не змінюється через сайт.', 'Het profiel van de eigenaar wijzigt niet via de site.'],
  NIET_AAN_JEZELF: ['Собі змінювати профіль не можна.', 'Uw eigen profiel wijzigen kan niet.'],
  EMAIL_NIET_UNIEK: ['З цією поштою є кілька активних облікових записів. Оберіть користувача інакше (за id) або розв’яжіть конфлікт акаунтів.', 'Er zijn meerdere actieve accounts met dit e-mailadres. Los eerst het accountconflict op.'],
  GEBRUIKER_NIET_GEVONDEN: ['Користувача з такою поштою не знайдено.', 'Geen gebruiker met dit e-mailadres.'],
  GEBRUIKER_NIET_GOEDGEKEURD: ['Цей обліковий запис ще не схвалено.', 'Dit account is nog niet goedgekeurd.'],
  EMAIL_ONGELDIG: ['Перевірте адресу пошти.', 'Controleer het e-mailadres.'],
  ROLLEN_ONGELDIG: ['Оберіть хоча б одну роль.', 'Kies minstens één rol.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = fout(e); const f = FOUTEN[c]; if (f) return uk ? f[0] : f[1]; if (/STEP_UP|STAP_OP/.test(c)) return uk ? 'Вхід не підтверджено — нічого не змінено.' : 'Aanmelding niet bevestigd — niets gewijzigd.'; return `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };

const resterend = (t: TechStatus, nu: number) => Math.max(0, (t.activatie?.eind ?? 0) - (nu + t.scheef));
const mmss = (ms: number, uk: boolean) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} ${uk ? 'год' : 'u'} ${m % 60} ${uk ? 'хв' : 'min'}` : `${m} ${uk ? 'хв' : 'min'}`; };
const rolNaam = (r: string, uk: boolean) => { const i = rolInfo(r); return i ? (uk ? i.naam[0] : i.naam[1]) : r; };

export default function TechLaag() {
  const t = useTech();
  const remoteN = useRemoteAantal();
  const uk = routeLang() !== 'nl';
  const [venster, setVenster] = useState<TechVenster | ''>('');
  const [meer, setMeer] = useState(false);
  // Lijst «⋯» (18.10.2026): gegroepeerd, met korte uitleg, zoeken en toetsenbord (zie bandMenu hieronder).
  const [zoek, setZoek] = useState('');
  const zoekRef = useRef<HTMLInputElement | null>(null);
  const meerRef = useRef<HTMLButtonElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const [sshZichtbaar, setSshZichtbaar] = useState(false);
  const kies = (v: TechVenster) => { setMeer(false); setVenster(v); };
  const [nu, setNu] = useState(Date.now());
  const actief = techActief(t);
  const v2 = useRuimtesV2();
  const taal = uk ? 'uk' as const : 'nl' as const;
  useEffect(() => { if (v2) startRuimtes(); }, [v2]);
  // Technische strook (strook-voorkeur.ts): modus, grootte, tekst en volgorde van de knoppen. Standaard uitgeklapt, zoals vroeger.
  const [voorkeur, setVoorkeur] = useState<StrookVoorkeur>(() => leesVoorkeur());
  const zetVoorkeur = (v: StrookVoorkeur) => { setVoorkeur(v); bewaarVoorkeur(v); };
  const modus = voorkeur.modus;
  // Ingeklapt (ook automatisch, zolang de muis niet bij de band is): de smalle strook. Alleen met de vlag tech-ruimtes-v2, zoals vroeger.
  const bandIngeklapt = v2 && modus !== 'uitgeklapt';
  // Automatisch: tijdelijk open als de muis tegen de bovenrand komt, of de focus of een paneel bij de band is.
  const [piek, setPiek] = useState(false);
  const volledig = !bandIngeklapt || (modus === 'auto' && piek);
  const [strookMenu, setStrookMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [instelOpen, setInstelOpen] = useState(false);
  const instelRef = useRef<HTMLButtonElement | null>(null);
  const sluitInstel = useCallback(() => { setInstelOpen(false); window.setTimeout(() => instelRef.current?.focus(), 0); }, []);
  const langDruk = useRef(0);
  const stopLangDruk = () => window.clearTimeout(langDruk.current);
  // Verbergen bij scrollen naar beneden, tonen bij scrollen naar boven (band-inschuiven.ts): alleen translate, nooit geometrie →
  // geen terugkoppeling, geen knipperen. Niet verbergen zolang de lijst «⋯» of een venster van de band open is.
  const vastRef = useRef(false);
  vastRef.current = meer || venster !== '' || instelOpen || strookMenu !== null;
  const bandAan = actief && !!t.activatie;
  const extRegel = useExtensieRegel(bandAan, uk);
  useEffect(() => (bandAan ? koppelHeadroom({ band: () => bandRef.current, vast: () => vastRef.current }) : undefined), [bandAan]);
  // Automatisch: de band opent als de muis tegen de bovenrand komt (of de band zelf raakt) en klapt weer in als de muis wegglijdt.
  // Een open menu of paneel houdt hem open (vastRef). Alleen zolang de band ingeklapt is en de modus «automatisch» staat.
  useEffect(() => {
    if (!(actief && bandIngeklapt && modus === 'auto')) { setPiek(false); return; }
    let timer = 0;
    const binnen = (x: number, y: number) => {
      if (y <= 4) return true;
      const r = bandRef.current?.getBoundingClientRect();
      return !!r && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 4 && y <= r.bottom + 8;
    };
    const beweeg = (e: PointerEvent) => {
      window.clearTimeout(timer);
      if (vastRef.current || binnen(e.clientX, e.clientY)) setPiek(true);
      else timer = window.setTimeout(() => setPiek(false), 500);
    };
    document.addEventListener('pointermove', beweeg);
    return () => { document.removeEventListener('pointermove', beweeg); window.clearTimeout(timer); };
  }, [actief, bandIngeklapt, modus]);

  useEffect(() => { startTech(); }, []);
  useEffect(() => {
    if (!techMag('ssh.host', t)) { setSshZichtbaar(false); return; }
    let stop = false;
    api.post(`/api/ofrep/v1/evaluate/flags/${SSH_CA_VLAG}`, techBody()).then((r) => { if (!stop) setSshZichtbaar(r.data?.value === true); }).catch(() => { if (!stop) setSshZichtbaar(false); });
    return () => { stop = true; };
  }, [t.activatie?.id, t.activatie?.eind, t.activatie?.mogelijkheden]);
  useEffect(() => {
    const op = (e: Event) => { neemOpgespaardVenster(); setVenster((e as CustomEvent<TechVenster>).detail); };
    window.addEventListener('mr-tech-venster', op);
    if (ruimtesV2Nu()) { const v = neemOpgespaardVenster(); if (v) setVenster(v); }
    return () => window.removeEventListener('mr-tech-venster', op);
  }, []);
  useEffect(() => { if (!actief) return; const i = window.setInterval(() => setNu(Date.now()), 15_000); return () => window.clearInterval(i); }, [actief]);

  // Band zichtbaar = kenmerk op <html> + kleuren als CSS-variabelen + [ТЕХ] in de titel van het tabblad (WCAG 1.4.1: niet alleen kleur).
  const kleur = t.profiel && t.catalogus ? t.catalogus.kleuren[t.profiel.band.kleur] : null;
  useEffect(() => {
    const html = document.documentElement;
    if (!actief) { delete html.dataset.tech; if (v2) zetTabbladMerk(false); return; }
    html.dataset.tech = 'aan';
    if (v2) zetTabbladMerk(true, kleur?.bg || '#f5b400');
    html.dataset.techPatroon = t.profiel?.band.patroon || 'strepen';
    if (kleur) { html.style.setProperty('--tech-band-bg', kleur.bg); html.style.setProperty('--tech-band-fg', kleur.fg); }
    const prefix = uk ? '[ТЕХ] ' : '[TECH] ';
    const titel = () => { if (!document.title.startsWith(prefix)) document.title = prefix + document.title.replace(/^\[(ТЕХ|TECH)\] /, ''); };
    titel();
    const el = document.querySelector('title');
    const mo = el ? new MutationObserver(titel) : null;
    if (el && mo) mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => { mo?.disconnect(); document.title = document.title.replace(/^\[(ТЕХ|TECH)\] /, ''); delete html.dataset.tech; if (v2) zetTabbladMerk(false); };
  }, [actief, kleur?.bg, kleur?.fg, t.profiel?.band.patroon, uk, v2]);
  useEffect(() => { const h = document.documentElement; if (bandIngeklapt && actief) h.dataset.techIngeklapt = '1'; else delete h.dataset.techIngeklapt; }, [bandIngeklapt, actief]);
  useEffect(() => { const h = document.documentElement; if (actief) h.dataset.techGrootte = voorkeur.grootte; else delete h.dataset.techGrootte; }, [actief, voorkeur.grootte]);

  // Past de band niet? Stap voor stap versmallen: 0 = alles met tekst, 1 = alleen pictogrammen, 2 = ook zonder «tot uitloggen»-tekst, 3 = knoppen achter «⋯».
  // De stand staat als kenmerk op de band zelf (data-pas) zodat React hem niet overschrijft; CSS in tech.css.
  const bandStatus = actief && t.activatie ? `${t.activatie.id}|${t.activatie.modus}|${t.activatie.reden}|${(t.activatie.rollen || []).join(',')}|${sshZichtbaar}|${uk}|${Math.round(resterend(t, nu) / 60000)}|${extRegel?.tekst ?? ''}` : '';
  useLayoutEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    el.querySelectorAll<HTMLButtonElement>('.tech-band-extra button, .tech-band-knoppen > button.is-uit').forEach((b) => {
      const tekst = b.querySelector('span')?.textContent?.trim();
      if (tekst && !b.title) b.title = tekst;
    });
    let bezigMeten = false;
    const redenBreedte = () => { const r = el.querySelector<HTMLElement>('.tech-band-reden'); return r && getComputedStyle(r).display !== 'none' ? r.clientWidth : 9999; };
    const MIN_REDEN = [120, 100, 80];
    const meet = () => {
      if (bezigMeten) return;
      bezigMeten = true;
      let stand = 0;
      for (; stand < 3; stand++) {
        el.dataset.pas = String(stand);
        if (el.scrollWidth <= el.clientWidth + 1 && redenBreedte() >= MIN_REDEN[stand]) break;
      }
      el.dataset.pas = String(stand);
      // Alleen sluiten als «⋯» echt weg is (breed genoeg): op de telefoon (≤ 760px) blijft «⋯» staan, ook bij stand 0, en elke meting
      // (ResizeObserver, lettertypen) sloot de lijst anders meteen weer (18.10.2026).
      const meerKnop = el.querySelector<HTMLElement>('.tech-band-meer');
      if (stand < 3 && (!meerKnop || getComputedStyle(meerKnop).display === 'none')) setMeer(false);
      bezigMeten = false;
    };
    meet();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(meet) : null;
    ro?.observe(el);
    el.querySelectorAll('.tech-band-merk, .tech-band-id, .tech-band-tijd, .tech-band-knoppen').forEach((k) => ro?.observe(k));
    window.addEventListener('resize', meet);
    void document.fonts?.ready.then(meet);
    const laat = window.setTimeout(meet, 800);
    // Zijbalk open/dicht (of thema/taal) verandert klassen op <html>/<body>: opnieuw meten, ook als de band zelf even breed blijft.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => window.requestAnimationFrame(meet)) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'lang', 'data-theme'] });
    if (document.body) mo?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => { ro?.disconnect(); mo?.disconnect(); window.removeEventListener('resize', meet); window.clearTimeout(laat); };
  }, [bandStatus, actief]);
  useEffect(() => {
    if (!meer) return;
    const buiten = (e: Event) => { const x = e.target as Element | null; if (x && !x.closest('.tech-band-extra, .tech-band-meer')) setMeer(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMeer(false); meerRef.current?.focus(); } };
    window.requestAnimationFrame(() => zoekRef.current?.focus({ preventScroll: true }));
    document.addEventListener('pointerdown', buiten); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', buiten); document.removeEventListener('keydown', esc); setZoek(''); };
  }, [meer]);

  const rest = resterend(t, nu);
  const lang = uk ? 'uk' : 'nl';
  const naar = (dienst: 'admin' | 'api' | 'mcp' | 'hub', tab: string) => { setMeer(false); location.assign(canonicalNavigationUrl(dienst, tab, lang)); };
  // Huidige plek: zelfde host en pad als het doel van de knop (taalvoorvoegsel en schuine streep aan het eind tellen niet).
  const pad = (u: string) => { try { const x = new URL(u, location.href); return `${x.host}${x.pathname.replace(/^\/(uk|nl)(?=\/|$)/, '').replace(/\/+$/, '')}`; } catch { return u; } };
  const hier = (dienst: 'admin' | 'api' | 'mcp' | 'hub', tab: string) => typeof location !== 'undefined' && pad(canonicalNavigationUrl(dienst, tab, lang)) === pad(location.href);
  type MenuItem = { k: string; icoon: ReactElement; naam: string; uitleg: string; doe?: () => void; hier?: boolean; aria?: string; alleenMobiel?: boolean; el?: ReactElement };
  const groep = (id: string, naam: string, items: Array<MenuItem | false>) => ({ id, naam, items: items.filter(Boolean) as MenuItem[] });
  const erven = techErfNieuweTabbladen(t);
  const bandMenu = actief && t.activatie ? [
    groep('naar', uk ? 'Розділи' : 'Onderdelen', [
      { k: 'beheer', icoon: <ShieldCheck aria-hidden='true' />, naam: uk ? 'Адміністрування' : 'Beheer', uitleg: uk ? 'Користувачі, оновлення, журнал' : 'Gebruikers, updates, logboek', doe: () => naar('admin', 'overview'), hier: hier('admin', 'overview') },
      { k: 'api', icoon: <Network aria-hidden='true' />, naam: 'API', uitleg: uk ? 'Ключі, OAuth, вебхуки' : 'Sleutels, OAuth, webhooks', doe: () => naar('api', 'access'), hier: hier('api', 'access') },
      { k: 'uitrol', icoon: <Rocket aria-hidden='true' />, naam: uk ? 'Розгортання' : 'Uitrol', uitleg: uk ? 'Випуски й стан сервера' : 'Releases en serverstand', doe: () => naar('mcp', 'dashboard'), hier: hier('mcp', 'dashboard') },
      { k: 'ai-beleid', icoon: <Bot aria-hidden='true' />, naam: uk ? 'Доступ ШІ' : 'AI-toegang', uitleg: uk ? 'Що можуть агенти ШІ' : 'Wat AI-agents mogen', doe: () => naar('admin', 'ai'), hier: hier('admin', 'ai') },
      { k: 'account', icoon: <Home aria-hidden='true' />, naam: uk ? 'Обліковий запис' : 'Account', uitleg: uk ? 'Ваш простір (клієнтський)' : 'Uw ruimte (klantprofiel)', doe: () => naar('hub', 'overview'), hier: hier('hub', 'overview') },
    ]),
    groep('hulpmiddelen', uk ? 'Інструменти' : 'Hulpmiddelen', [
      (techMag('terminal.test', t) || techMag('terminal.servers', t)) && { k: 'terminal', icoon: <SquareTerminal aria-hidden='true' />, naam: uk ? 'Термінал' : 'Terminal', uitleg: uk ? 'Командний рядок із записом' : 'Opdrachtregel met opname', doe: () => kies('terminal') },
      techMag('terminal.servers', t) && { k: 'remote', icoon: <MonitorUp aria-hidden='true' />, naam: uk ? 'Віддалений стіл' : 'Extern bureaublad', uitleg: uk ? 'Екран сервера в браузері' : 'Scherm van de server in de browser', doe: () => kies('remote') },
      sshZichtbaar && techMag('ssh.host', t) && { k: 'ssh', icoon: <KeyRound aria-hidden='true' />, naam: uk ? 'SSH-сертифікати' : 'SSH-certificaten', uitleg: uk ? 'Короткі сертифікати 5–60 хв' : 'Korte certificaten 5–60 min', doe: () => kies('ssh') },
      (techMag('flags.test', t) || techMag('diensten.beheren', t)) && { k: 'vlaggen', icoon: <Flag aria-hidden='true' />, naam: uk ? 'Перемикачі функцій' : 'Functieschakelaars', uitleg: uk ? 'Нові можливості: спробувати для себе' : 'Nieuwe mogelijkheden voor uzelf proberen', doe: () => kies('vlaggen') },
    ]),
    groep('mensen', uk ? 'Люди й підтримка' : 'Mensen en ondersteuning', [
      techMag('impersonatie.aanvragen', t) && { k: 'ondersteuning', icoon: <LifeBuoy aria-hidden='true' />, naam: uk ? 'Підтримка' : 'Ondersteuning', uitleg: uk ? 'Запити на допомогу' : 'Hulpvragen', doe: () => kies('ondersteuning') },
      techMag('impersonatie.aanvragen', t) && { k: 'impersonatie', icoon: <span />, naam: uk ? 'Подивитися як користувач' : 'Bekijken als gebruiker', uitleg: '', el: <ImpersonatieKnop uk={uk} /> },
      techMag('roles.delegate', t) && { k: 'profielen', icoon: <Users aria-hidden='true' />, naam: uk ? 'Профілі' : 'Profielen', uitleg: uk ? 'Хто має технічний доступ' : 'Wie technische toegang heeft', doe: () => kies('profielen') },
    ]),
    groep('sessie', uk ? 'Цей сеанс' : 'Deze sessie', [
      v2 ? { k: 'verlengen', icoon: <Clock aria-hidden='true' />, naam: WOORDEN.wijzigTermijn[taal], uitleg: WOORDEN.wijzigUitleg[taal], doe: () => kies('activeren') }
        : { k: 'verlengen', icoon: <Clock aria-hidden='true' />, naam: uk ? 'Подовжити' : 'Verlengen', uitleg: uk ? 'Новий термін (з підтвердженням)' : 'Nieuwe duur (met bevestiging)', doe: () => kies('activeren') },
      v2 && { k: 'toegang', icoon: <KeyRound aria-hidden='true' />, naam: WOORDEN.toegangPagina[taal], uitleg: uk ? 'Усі дозволи й терміни в одному місці' : 'Alle toegang en termijnen op één plek', doe: () => kies('toegang') },
      !!extRegel && { k: 'extensie', icoon: <i className='tech-ext-stip' data-tech-ext={extRegel.staat} aria-hidden='true' />, naam: extRegel.tekst, uitleg: extRegel.uitleg, doe: () => { setMeer(false); location.assign(extRegel.url); }, hier: false },
      // Migratie 0080: nieuwe tabbladen technisch of gebruiker. Standaard GEBRUIKER — anders is elk nieuw tabblad technisch en
      // mag de AI in de privéruimte er niets doen (een technisch tabblad raakt alleen het technische slot van de extensie).
      { k: 'erven', icoon: <AppWindow aria-hidden='true' />,
        naam: erven ? (uk ? 'Нові вкладки: технічні' : 'Nieuwe tabbladen: technisch') : (uk ? 'Нові вкладки: користувацькі' : 'Nieuwe tabbladen: gebruiker'),
        uitleg: erven ? (uk ? 'ШІ користувача там не працює' : 'De AI van de gebruiker werkt daar niet') : (uk ? 'Технічний профіль — лише тут' : 'Technisch profiel alleen hier'),
        doe: () => { setMeer(false); void techErven(!erven); },
        aria: uk ? 'Чи відкриваються нові вкладки в технічному профілі' : 'Openen nieuwe tabbladen in het technische profiel' },
      { k: 'band', icoon: <Palette aria-hidden='true' />, naam: uk ? 'Колір смуги' : 'Kleur van de band', uitleg: uk ? 'Колір і візерунок' : 'Kleur en patroon', doe: () => kies('band'), aria: uk ? 'Колір смуги' : 'Kleur van de band', alleenMobiel: true },
    ]),
  ] : [];
  // De knoppen die op de strook kunnen staan (strook-voorkeur.ts): dezelfde acties als in de ⋯-lijst. Meldingen, ruimte, in- en uitklappen
  // en afmelden hebben hun eigen weergave. Een knop die voor deze rollen niet mag, wordt overgeslagen.
  const knopData: Record<string, MenuItem> = {};
  for (const g of bandMenu) for (const i of g.items) knopData[i.k] = i;
  const inklapTekst = bandIngeklapt ? (uk ? 'Розгорнути' : 'Uitklappen') : (uk ? 'Згорнути' : 'Inklappen');
  const uitTekst = v2 ? (uk ? 'Вийти…' : 'Afmelden…') : (uk ? 'Вийти з технічного' : 'Technisch verlaten');
  const naamVan = (id: string): string => { const m = STROOK_NAMEN[id]; return m ? (uk ? m.uk : m.nl) : id; };
  const labelVan = (id: string): string => (id === 'inklap' ? inklapTekst : id === 'uit' ? uitTekst : knopData[id] ? knopData[id].naam : naamVan(id));
  const stripKnop = (id: string): ReactElement | null => {
    if (id === 'meldingen') return <TechMeldingenKnop uk={uk} />;
    if (id === 'wissel') return v2 ? <TechBundelGrens><Suspense fallback={null}><RuimteWissel taal={taal} compact /></Suspense></TechBundelGrens> : null;
    if (id === 'inklap') return v2 ? <button type='button' className='tech-band-inklap' data-tech-knop='inklappen' aria-expanded={!bandIngeklapt} onClick={() => zetVoorkeur({ ...voorkeur, modus: volgendeModus(modus) })}
      title={bandIngeklapt ? (uk ? 'Розгорнути технічну смугу' : 'Technische band uitklappen') : (uk ? 'Згорнути технічну смугу (запам’ятовується на цьому пристрої)' : 'Technische band inklappen (onthouden op dit apparaat)')}
      aria-label={bandIngeklapt ? (uk ? 'Розгорнути технічну смугу' : 'Technische band uitklappen') : (uk ? 'Згорнути технічну смугу' : 'Technische band inklappen')}>{bandIngeklapt ? <ChevronDown aria-hidden='true' /> : <ChevronUp aria-hidden='true' />}<span>{inklapTekst}</span></button> : null;
    if (id === 'uit') return v2
      ? <button type='button' className='is-uit' onClick={() => setVenster('uitloggen')} data-tech-knop='uitloggen'><LogOut aria-hidden='true' /><span>{uitTekst}</span></button>
      : <button type='button' className='is-uit' onClick={() => void techBeeindigen()} data-tech-knop='uit'><LogOut aria-hidden='true' /><span>{uitTekst}</span></button>;
    const m = knopData[id];
    if (!m) return null;
    return <button type='button' onClick={m.doe} data-tech-knop={m.k} aria-label={m.aria} aria-current={m.hier ? 'page' : undefined} className={m.hier ? 'is-hier' : undefined}>{m.icoon}<span>{m.naam}</span></button>;
  };
  const strookItems = voorkeur.knoppen.map(id => ({ id, el: stripKnop(id) })).filter((x): x is { id: string; el: ReactElement } => x.el !== null);
  // Snelmenu van één knop: verplaatsen, van de strook halen, of de instellingen openen.
  const menuVoor = (id: string): KnopMenuItem[] => {
    const i = voorkeur.knoppen.indexOf(id);
    return [
      { label: uk ? 'Ліворуч' : 'Naar links', disabled: i <= 0, onKies: () => zetVoorkeur(verplaats(voorkeur, id, -1)) },
      { label: uk ? 'Праворуч' : 'Naar rechts', disabled: i < 0 || i >= voorkeur.knoppen.length - 1, onKies: () => zetVoorkeur(verplaats(voorkeur, id, 1)) },
      { label: uk ? 'Прибрати зі смуги' : 'Van de strook halen', onKies: () => zetVoorkeur(zetAan(voorkeur, id, false)) },
      { label: uk ? 'Налаштування смуги…' : 'Instellingen van de strook…', onKies: () => setInstelOpen(true) },
    ];
  };
  const z = zoek.trim().toLocaleLowerCase();
  const past = (i: MenuItem) => !meer || !z || `${i.naam} ${i.uitleg} ${i.k}`.toLocaleLowerCase().includes(z);
  // Toetsenbord in de lijst: ↑/↓ tussen zichtbare knoppen (↓ vanuit het zoekveld naar de eerste), Home/End, Enter = de knop zelf.
  const menuToets = (e: ToetsEvent<HTMLElement>) => {
    const knoppen = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([hidden])')).filter((b) => !b.closest('[hidden]'));
    if (!knoppen.length) return;
    const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
    const naarKnop = (n: number) => { e.preventDefault(); knoppen[(n + knoppen.length) % knoppen.length].focus(); };
    if (e.key === 'ArrowDown') naarKnop(i < 0 ? 0 : i + 1);
    else if (e.key === 'ArrowUp') { if (i <= 0) { e.preventDefault(); zoekRef.current?.focus(); } else naarKnop(i - 1); }
    else if (e.key === 'Home' && i >= 0) naarKnop(0);
    else if (e.key === 'End' && i >= 0) naarKnop(knoppen.length - 1);
    else if (e.key === 'Enter' && document.activeElement === zoekRef.current) { e.preventDefault(); knoppen[0].click(); }
  };
  return (
    <>
      {actief && t.activatie ? (
        <div ref={bandRef} className={`tech-band${bandIngeklapt && !volledig ? ' is-ingeklapt' : ''}${modus === 'auto' && bandIngeklapt && piek ? ' is-piek' : ''}`} data-tech-ingeklapt={bandIngeklapt ? '1' : '0'} data-tech-label={voorkeur.label} data-tech-grootte={voorkeur.grootte} data-tech-modus={modus} role='region' aria-label={uk ? 'Технічний режим' : 'Technische modus'} data-tech-band='1'
          onFocus={() => { if (modus === 'auto') setPiek(true); }} onBlur={(e) => { if (modus === 'auto' && !e.currentTarget.contains(e.relatedTarget as Node | null)) setPiek(false); }}>
          <span className='tech-band-merk'><ShieldCheck aria-hidden='true' />{uk ? 'ТЕХНІЧНИЙ' : 'TECHNISCH'}{remoteN > 0 ? <i className='tech-remote-actief' data-tech-remote={remoteN} role='status' title={uk ? 'активний віддалений сеанс' : 'actieve externe sessie'}>●<span className='tech-remote-tekst'>{uk ? 'активний віддалений сеанс' : 'actieve externe sessie'}</span></i> : null}</span>
          <span className='tech-band-id' title={t.activatie.profielId}>{t.activatie.rollen.map((r) => rolNaam(r, uk)).join(' · ')}</span>
          <span className={`tech-band-tijd${rest < 5 * 60000 ? ' is-bijna' : ''}`} data-tech-rest={Math.round(rest / 60000)}><Timer aria-hidden='true' />{t.activatie.modus === 'tot-uitloggen' ? <span className='tech-band-nog'>{v2 ? WOORDEN.bandTotUitloggen[taal] : uk ? 'до виходу з акаунта' : 'tot uitloggen'}</span> : t.activatie.modus === 'tot-verlaten' ? <span className='tech-band-nog'>{v2 ? WOORDEN.bandTotVerlaten[taal] : uk ? 'до виходу з профілю' : 'tot verlaten profiel'}</span> : <><span className='tech-band-nog'>{uk ? 'ще' : 'nog'} </span>{mmss(rest, uk)}</>}</span>
          {/* E-03 (audit fase 2): met label «Причина:», anders leest de activeringsreden («встановлення оновлень : Пакет …») als een (verouderde) status van een update. */}
          <span className='tech-band-reden' title={`${uk ? 'Причина' : 'Reden'}: ${t.activatie.reden}`}><span className='tech-band-reden-label'>{uk ? 'Причина:' : 'Reden:'}</span> <q className='tech-band-reden-tekst'>{t.activatie.reden}</q></span>
          <span className='tech-band-knoppen'>
            <span className={`tech-band-extra${meer ? ' is-open' : ''}`} id='tech-band-extra' aria-label={meer ? (uk ? 'Дії технічного профілю' : 'Acties van het technisch profiel') : undefined} role={meer ? 'group' : undefined} onKeyDown={meer ? menuToets : undefined}>
              {meer && v2 ? <span className='tech-mobiel-wissel' data-tech-mobiel='wissel'><TechBundelGrens><Suspense fallback={null}><RuimteWissel taal={taal} compact /></Suspense></TechBundelGrens></span> : null}
              {meer ? <label className='tech-menu-zoek'><Search aria-hidden='true' /><input ref={zoekRef} type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={uk ? 'Знайти дію…' : 'Actie zoeken…'} aria-label={uk ? 'Знайти дію' : 'Actie zoeken'} data-tech-zoek='1' autoComplete='off' /></label> : null}
              {bandMenu.map((g) => {
                const zichtbaar = g.items.filter((i) => past(i));
                return (
                  <span key={g.id} className='tech-menu-groep' data-tech-groep={g.id} role={meer ? 'group' : undefined} aria-label={meer ? g.naam : undefined} hidden={meer && zichtbaar.length === 0}>
                    {meer ? <span className='tech-menu-kop' aria-hidden='true'>{g.naam}</span> : null}
                    {g.items.map((i) => i.el
                      ? <span key={i.k} className='tech-menu-los' hidden={meer && !past(i)}>{i.el}</span>
                      : <button key={i.k} type='button' onClick={i.doe} data-tech-knop={i.k} hidden={meer && !past(i)} aria-label={i.aria} aria-current={i.hier ? 'page' : undefined} className={i.hier ? 'is-hier' : undefined}>
                          {i.icoon}<span className={i.alleenMobiel ? 'tech-alleen-mobiel' : undefined}>{i.naam}</span><small className='tech-menu-uitleg' aria-hidden='true'>{i.uitleg}</small>
                        </button>)}
                  </span>
                );
              })}
              {meer && bandMenu.every((g) => !g.items.some(past)) ? <span className='tech-menu-leeg' role='status'>{uk ? 'Нічого не знайдено' : 'Niets gevonden'}</span> : null}
              {meer ? (
                <span className='tech-mobiel-onder' data-tech-mobiel='acties'>
                  <TechMeldingenKnop uk={uk} />
                  {v2 ? <button type='button' onClick={() => { setMeer(false); zetVoorkeur({ ...voorkeur, modus: volgendeModus(modus) }); }} data-tech-mobiel='inklappen'>{bandIngeklapt ? <ChevronDown aria-hidden='true' /> : <ChevronUp aria-hidden='true' />}<span>{bandIngeklapt ? (uk ? 'Розгорнути смугу' : 'Band uitklappen') : (uk ? 'Згорнути смугу' : 'Band inklappen')}</span></button> : null}
                  {v2
                    ? <button type='button' className='is-uit' onClick={() => { setMeer(false); setVenster('uitloggen'); }} data-tech-mobiel='uitloggen'><LogOut aria-hidden='true' /><span>{uk ? 'Вийти з технічного…' : 'Technisch verlaten…'}</span></button>
                    : <button type='button' className='is-uit' onClick={() => { setMeer(false); void techBeeindigen(); }} data-tech-mobiel='uit'><LogOut aria-hidden='true' /><span>{uk ? 'Вийти з технічного' : 'Technisch verlaten'}</span></button>}
                </span>
              ) : null}
            </span>
            {strookItems.map(({ id, el }) => (
              <span key={id} className={`tech-strook-item ${STROOK_STANDAARD_KNOPPEN.includes(id) ? 'tech-band-breed' : 'tech-strook-extra'}`} data-strook-id={id} data-label={labelVan(id)}
                onContextMenu={(e) => { e.preventDefault(); setStrookMenu({ id, x: e.clientX, y: e.clientY }); }}
                onPointerDown={(e) => { if (e.pointerType !== 'touch') return; const x = e.clientX; const y = e.clientY; stopLangDruk(); langDruk.current = window.setTimeout(() => setStrookMenu({ id, x, y }), 500); }}
                onPointerUp={stopLangDruk} onPointerLeave={stopLangDruk} onPointerCancel={stopLangDruk} onPointerMove={stopLangDruk}>{el}</span>
            ))}
            <button ref={meerRef} type='button' className='tech-band-meer' aria-expanded={meer} aria-controls='tech-band-extra' aria-label={uk ? 'Меню технічного простору' : 'Menu van de technische ruimte'} onClick={() => setMeer((m) => !m)} data-tech-knop='meer'><Menu aria-hidden='true' /></button>
            <button ref={instelRef} type='button' className='tech-strook-instel' aria-label={uk ? 'Налаштування технічної смуги' : 'Instellingen van de technische strook'} title={uk ? 'Налаштування смуги: вигляд, розмір, текст і порядок кнопок' : 'Instellingen van de strook: weergave, grootte, tekst en volgorde van de knoppen'} aria-expanded={instelOpen} aria-haspopup='dialog' data-strook-instel-knop='' data-tech-knop='strook-instellingen' onClick={() => setInstelOpen(o => !o)}><SlidersHorizontal aria-hidden='true' /></button>
          </span>
        </div>
      ) : null}
      {actief && t.activatie && strookMenu ? <StrookKnopMenu label={uk ? 'Дії для кнопки' : 'Acties voor knop'} items={menuVoor(strookMenu.id)} x={strookMenu.x} y={strookMenu.y} onSluit={() => setStrookMenu(null)} /> : null}
      {actief && t.activatie && instelOpen ? <StrookInstelPaneel uk={uk} voorkeur={voorkeur} onWijzig={zetVoorkeur} top={(bandRef.current?.getBoundingClientRect().bottom ?? 40) + 4} onSluit={sluitInstel} /> : null}
      {venster === 'activeren' && !v2 ? <Activeren uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      {venster === 'activeren' && v2 ? <TechBundelGrens><Suspense fallback={null}><RuimteStart taal={taal} sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {venster === 'toegang' && v2 ? <TechBundelGrens><Suspense fallback={null}><RuimteToegang taal={taal} sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {venster === 'uitloggen' && v2 ? <TechBundelGrens><Suspense fallback={null}><RuimteUitloggen taal={taal} sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {venster === 'toegang' && !v2 ? <Profielen uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      {venster === 'band' ? <BandKeuze uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      {venster === 'profielen' ? <Profielen uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      {venster === 'ondersteuning' ? <OndersteuningVenster sluit={() => setVenster('')} /> : null}
      {venster === 'terminal' ? <TechBundelGrens><Suspense fallback={null}><TerminalOpenen sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {venster === 'remote' ? <TechBundelGrens><Suspense fallback={null}><RemoteBureaublad sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {venster === 'ssh' ? <TechBundelGrens><Suspense fallback={null}><SshCertificaat sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {venster === 'vlaggen' ? <TechBundelGrens><Suspense fallback={null}><VlaggenVenster sluit={() => setVenster('')} /></Suspense></TechBundelGrens> : null}
      {v2 ? <TechBundelGrens><Suspense fallback={null}><RuimteDok taal={taal} /></Suspense></TechBundelGrens> : null}
      <DiagnoseLaag />
      <ToestemmingLaag />
      <ImpersonatieGebruiker />
    </>
  );
}

function Activeren({ uk, t, sluit }: { uk: boolean; t: TechStatus; sluit: () => void }) {
  const p = t.profiel;
  const max = p ? maxMinutenVoor(p.rollen, p.maxMinuten) : 60;
  const openMag = !!p && openEindeToegestaan(p.rollen);
  const keuzes = (t.catalogus?.duren ?? [15, 30, 60]).filter((d) => d <= max);
  const [minuten, setMinuten] = useState(keuzes.includes(60) ? 60 : keuzes[keuzes.length - 1] ?? 15);
  const [modus, setModus] = useState<'tijd'|'tech'|'account'>('tijd');
  const [reden, setReden] = useState(t.activatie?.reden ?? '');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [erfAan, setErfAan] = useState(techErfNieuweTabbladen(t));
  const verlengen = techActief(t);
  if (!p) {
    return (
      <Venster id='tech-activeren' titel={uk ? 'Технічний профіль' : 'Technisch profiel'} breedte={460} onSluit={sluit}>
        <div className='tech-venster'><p>{uk ? 'У вас немає технічного профілю. Його може дати власник сервера або адміністратор.' : 'U hebt geen technisch profiel. De eigenaar of een beheerder kan het geven.'}</p>
          <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div></div>
      </Venster>
    );
  }
  const doe = async () => {
    setBezig(true); setMelding('');
    try { await techActiveren(modus === 'account' ? 0 : modus === 'tech' ? -1 : minuten, reden); sluit(); } catch (e) {
      // Fix 28.10: de server zegt «vlag tech-ruimtes-v2 staat AAN» terwijl deze weergave nog de oude stand had (vlag nog niet geladen of
      // OFREP mislukt) → vlag opnieuw laden; TechLaag toont dan in hetzelfde venster meteen «Вхід у технічний простір».
      if (fout(e) === 'GEBRUIK_RUIMTES_V2') { const aan = await laadRuimtesVlag(true); if (aan) return; }
      setMelding(foutTekst(e, uk)); } finally { setBezig(false); }
  };
  return (
    <Venster id='tech-activeren' titel={verlengen ? (uk ? 'Подовжити технічний профіль' : 'Technisch profiel verlengen') : (uk ? 'Увімкнути технічний профіль' : 'Technisch profiel aanzetten')} breedte={520} onSluit={sluit}>
      <form className='tech-venster' data-tech-venster='activeren' onSubmit={(e) => { e.preventDefault(); if (!bezig) void doe(); }}>
        <p className='tech-lead'>{modus === 'tijd'
          ? (uk ? 'На обраний час — у цій вкладці й у вкладках, які ви відкриєте з неї (той самий кінець). Інші вкладки лишаються клієнтськими.' : 'Voor de gekozen tijd — in dit tabblad en in tabbladen die u vanuit hier opent (zelfde einde). Andere tabbladen blijven klantprofiel.')
          : (uk ? 'У всіх вкладках цього входу в цьому браузері, доки ви не вийдете. Вийти з профілю в будь-якій вкладці — вийти в усіх.' : 'In alle tabbladen van deze aanmelding in deze browser, tot u stopt. Het profiel verlaten in één tabblad = overal verlaten.')} <Vraag help={HELP_TECH.activeren} uk={uk} label={uk ? 'Увімкнути' : 'Aanzetten'} /></p>
        <div className='tech-rij'><span className='tech-label'>{uk ? 'Ваш профіль' : 'Uw profiel'}</span><code>{p.profielId}</code></div>
        <ul className='tech-rollen'>{p.rollen.map((r) => <li key={r}><b>{rolNaam(r, uk)}</b> <small>{(() => { const i = rolInfo(r); return i ? (uk ? i.kort[0] : i.kort[1]) : ''; })()}</small> {rolInfo(r) ? <Vraag help={rolInfo(r)!.help} uk={uk} label={rolNaam(r, uk)} /> : null}</li>)}</ul>
        <label className='tech-veld'><span>{uk ? 'Термін' : 'Duur'} <HulpVraag k='tech.duur' uk={uk} label={uk ? 'Термін' : 'Duur'} /></span>
          <select data-hulp='tech.duur' value={modus === 'tijd' ? String(minuten) : modus} onChange={(e) => { const v = e.target.value; if (v === 'account') { setModus('account'); } else if (v === 'tech') { setModus('tech'); } else { setModus('tijd'); setMinuten(Number(v)); } }} data-tech-duur='1'>
            {keuzes.map((d) => <option key={d} value={d}>{d >= 60 ? `${d / 60} ${uk ? 'год' : 'u'}` : `${d} ${uk ? 'хв' : 'min'}`}</option>)}
            {openMag ? <option value='tech'>{uk ? 'До виходу з технічного профілю' : 'Tot verlaten technisch profiel'}</option> : null}
            {openMag ? <option value='account'>{uk ? 'До виходу з акаунта' : 'Tot uitloggen'}</option> : null}
          </select>
          <small>{modus === 'account' ? (uk ? 'Без обмеження за часом: профіль вимкнеться, коли ви вийдете з акаунта.' : 'Zonder tijdsgrens: het profiel gaat uit zodra u uitlogt.') : modus === 'tech' ? (uk ? 'Без обмеження за часом: профіль діє, доки ви самі не вийдете з нього (або з акаунта).' : 'Zonder tijdsgrens: het profiel blijft aan tot u het zelf verlaat (of uitlogt).') : (uk ? `Найдовше для ваших ролей: ${max >= 60 ? `${max / 60} год` : `${max} хв`}` : `Maximaal voor uw rollen: ${max >= 60 ? `${max / 60} u` : `${max} min`}`)}</small></label>
        <label className='tech-veld'><span>{uk ? 'Причина' : 'Reden'} <Vraag help={HELP_TECH.reden} uk={uk} label={uk ? 'Причина' : 'Reden'} /></span>
          <input value={reden} onChange={(e) => setReden(e.target.value)} maxLength={300} required minLength={3} placeholder={uk ? 'напр. запит №42: пошта не синхронізується' : 'bijv. melding #42: mail synchroniseert niet'} data-tech-reden='1' /></label>
        {/* Migratie 0080: nieuwe tabbladen technisch of gebruiker. Hier (instellingen) en in de technische balk; standaard GEBRUIKER. */}
        <label className='tech-veld tech-veld-aanvink'><span>{uk ? 'Нові вкладки' : 'Nieuwe tabbladen'} <HulpVraag k='tech.erven' uk={uk} label={uk ? 'Нові вкладки' : 'Nieuwe tabbladen'} /></span>
          <label className='tech-aanvink'><input type='checkbox' checked={erfAan} data-hulp='tech.erven' data-tech-erven='1'
            onChange={(e) => { const aan = e.target.checked; setErfAan(aan); void techErven(aan).catch((err) => { setErfAan(!aan); setMelding(foutTekst(err, uk)); }); }} />
            <span>{uk ? 'Відкривати нові вкладки теж у технічному профілі' : 'Nieuwe tabbladen ook in het technische profiel openen'}</span></label>
          <small>{erfAan
            ? (uk ? 'Увага: у технічній вкладці ШІ у вашому приватному просторі не працює — він ніколи не читає й не керує технічною вкладкою. Вимкніть це, якщо ваш ШІ має бачити звичайні сторінки.' : 'Let op: in een technisch tabblad werkt de AI in uw privéruimte niet — die leest of bedient een technisch tabblad nooit. Zet dit uit als uw AI gewone pagina\u2019s moet zien.')
            : (uk ? 'Нові вкладки — звичайні (користувацькі). Технічний профіль вмикаєте в кожній вкладці окремо; вкладка, відкрита з технічної, усе одно може отримати копію.' : 'Nieuwe tabbladen zijn gewone (gebruikers)tabbladen. Het technische profiel zet u per tabblad aan; een tabblad dat u vanuit een technisch tabblad opent kan nog wel een kopie krijgen.')}</small></label>
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <p className='tech-meta'>{modus === 'account' ? (uk ? 'Сайт попросить підтвердити вхід ще раз. Профіль вимкнеться при виході з акаунта.' : 'De site vraagt de aanmelding nog eens te bevestigen. Het profiel gaat uit bij uitloggen.') : modus === 'tech' ? (uk ? 'Сайт попросить підтвердити вхід ще раз. Профіль діє, доки ви його не залишите.' : 'De site vraagt de aanmelding nog eens te bevestigen. Het profiel blijft aan tot u het verlaat.') : (uk ? 'Сайт попросить підтвердити вхід ще раз.' : 'De site vraagt de aanmelding nog eens te bevestigen.')}</p>
        <div className='tech-knoppen'>
          <button type='button' onClick={sluit}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='submit' className='is-hoofd' disabled={bezig || reden.trim().length < 3} aria-busy={bezig || undefined} data-tech-knop='activeren'>{bezig ? (uk ? 'Зачекайте…' : 'Even geduld…') : modus === 'account' ? (uk ? 'Увімкнути до виходу з акаунта' : 'Aanzetten tot uitloggen') : modus === 'tech' ? (uk ? 'Увімкнути до виходу з профілю' : 'Aanzetten tot verlaten profiel') : verlengen ? (uk ? `Подовжити на ${duurTekst(minuten, uk)}` : `Verlengen met ${duurTekst(minuten, uk)}`) : (uk ? `Увімкнути на ${duurTekst(minuten, uk)}` : `Aanzetten voor ${duurTekst(minuten, uk)}`)}</button>
        </div>
      </form>
    </Venster>
  );
}

/** Zelfde notatie als de keuzelijst («1 год», niet «60 хв»). */
const duurTekst = (d: number, uk: boolean) => (d >= 60 ? `${d / 60} ${uk ? 'год' : 'u'}` : `${d} ${uk ? 'хв' : 'min'}`);

function BandKeuze({ uk, t, sluit }: { uk: boolean; t: TechStatus; sluit: () => void }) {
  const [kleur, setKleur] = useState<BandKleur>(t.profiel?.band.kleur ?? 'amber');
  const [patroon, setPatroon] = useState<BandPatroon>(t.profiel?.band.patroon ?? 'strepen');
  const [melding, setMelding] = useState('');
  const kleuren = t.catalogus?.kleuren;
  const patronen = t.catalogus?.patronen;
  if (!kleuren || !patronen || !t.profiel) return null;
  const k = kleuren[kleur];
  return (
    <Venster id='tech-band' titel={uk ? 'Колір смуги технічного режиму' : 'Kleur van de band'} breedte={520} onSluit={sluit}>
      <div className='tech-venster' data-tech-venster='band'>
        <p className='tech-lead'>{uk ? 'Оберіть, що вам приємно бачити. Напис «ТЕХНІЧНИЙ» лишається завжди.' : 'Kies wat u prettig vindt. De tekst «TECHNISCH» blijft altijd.'} <HulpVraag k='tech.band' uk={uk} label={uk ? 'Колір смуги' : 'Kleur'} /></p>
        <div className='tech-kleuren' role='radiogroup' aria-label={uk ? 'Колір' : 'Kleur'}>
          {(Object.keys(kleuren) as BandKleur[]).map((id) => (
            <button data-hulp='tech.band' key={id} type='button' role='radio' aria-checked={kleur === id} className='tech-kleur' onClick={() => setKleur(id)} data-tech-kleur={id}
              style={{ background: kleuren[id].bg, color: kleuren[id].fg }} title={`${uk ? kleuren[id].naam[0] : kleuren[id].naam[1]} · ${contrast(kleuren[id].bg, kleuren[id].fg).toFixed(1)}:1`}>
              {uk ? kleuren[id].naam[0] : kleuren[id].naam[1]}</button>
          ))}
        </div>
        <div className='tech-patronen' role='radiogroup' aria-label={uk ? 'Візерунок' : 'Patroon'}>
          {(Object.keys(patronen) as BandPatroon[]).map((id) => <button data-hulp='tech.band' key={id} type='button' role='radio' aria-checked={patroon === id} onClick={() => setPatroon(id)} data-tech-patroon={id}>{uk ? patronen[id][0] : patronen[id][1]}</button>)}
        </div>
        <div className='tech-band-voorbeeld' data-patroon={patroon} style={{ ['--tech-band-bg' as string]: k.bg, ['--tech-band-fg' as string]: k.fg }}><ShieldCheck aria-hidden='true' />{uk ? 'ТЕХНІЧНИЙ · приклад' : 'TECHNISCH · voorbeeld'}</div>
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <div className='tech-knoppen'>
          <button type='button' onClick={sluit}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='button' className='is-hoofd' data-tech-knop='band-opslaan' onClick={() => { void techBand(kleur, patroon).then(sluit).catch((e) => setMelding(foutTekst(e, uk))); }}>{uk ? 'Зберегти' : 'Opslaan'}</button>
        </div>
      </div>
    </Venster>
  );
}

type Rij = { userId: string; profielId: string; rollen: TechRol[]; maxMinuten: number; email: string; naam: string; actiefTot: number | null; ingetrokkenOp: number | null; toegekendOp: number; notitie: string };
function Profielen({ uk, t, sluit }: { uk: boolean; t: TechStatus; sluit: () => void }) {
  const [lijst, setLijst] = useState<Rij[] | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [email, setEmail] = useState('');
  const [rollen, setRollen] = useState<TechRol[]>(['ondersteuning']);
  const [max, setMax] = useState(60);
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState('');
  const [bevestig, setBevestig] = useState('');
  const eigen = useMemo(() => (t.activatie?.rollen.includes('eigenaar') ? ['ondersteuning', 'tester', 'ontwikkelaar', 'beheerder', 'auditor'] : (t.activatie?.rollen ?? []).filter((r) => r !== 'eigenaar')) as TechRol[], [t.activatie]);
  const laad = async () => { try { setLijst((await api.post('/api/owner/tech/profielen', techBody())).data?.profielen ?? []); } catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); setLijst([]); } };
  useEffect(() => { void laad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const geven = async () => {
    setBezig('geven'); setMelding(null);
    try {
      const r = await api.post('/api/owner/tech/toekennen', { ...techBody(), email, rollen, maxMinuten: max, notitie });
      setLijst(r.data?.profielen ?? lijst); setEmail(''); setNotitie('');
      setMelding({ ok: true, tekst: uk ? `Профіль видано: ${email}. Права з'являться лише після його активації.` : `Profiel gegeven: ${email}. Rechten pas na zijn activering.` });
    } catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  const nemen = async (r: Rij) => {
    setBezig(r.userId); setMelding(null); setBevestig('');
    try { const x = await api.post('/api/owner/tech/intrekken', { ...techBody(), userId: r.userId, reden: 'via de site' }); setLijst(x.data?.profielen ?? lijst); setMelding({ ok: true, tekst: uk ? `Профіль ${r.email} відкликано; активні вкладки втратили права.` : `Profiel van ${r.email} ingetrokken; actieve tabbladen verloren hun rechten.` }); }
    catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  return (
    <Venster id='tech-profielen' titel={uk ? 'Технічні профілі' : 'Technische profielen'} breedte={720} onSluit={sluit}>
      <div className='tech-venster' data-tech-venster='profielen'>
        <form className='tech-geven' onSubmit={(e) => { e.preventDefault(); if (!bezig) void geven(); }}>
          <h3>{uk ? 'Видати профіль' : 'Profiel geven'} <Vraag help={HELP_TECH.toekennen} uk={uk} label={uk ? 'Видати профіль' : 'Profiel geven'} /></h3>
          <label className='tech-veld'><span>{uk ? 'Пошта користувача' : 'E-mail van de gebruiker'}</span><input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required data-tech-email='1' /></label>
          <fieldset className='tech-rolkeuze'><legend>{uk ? 'Ролі (лише ті, що маєте самі)' : 'Rollen (alleen die u zelf hebt)'}</legend>
            {eigen.map((r) => <label key={r}><input data-hulp={`tech.rol.${r}`} type='checkbox' checked={rollen.includes(r)} onChange={(e) => setRollen((o) => (e.target.checked ? [...o, r] : o.filter((x) => x !== r)))} data-tech-rol={r} />{rolNaam(r, uk)} <HulpVraag k={`tech.rol.${r}`} uk={uk} label={rolNaam(r, uk)} /></label>)}
          </fieldset>
          <label className='tech-veld'><span>{uk ? 'Найдовша активація' : 'Langste activering'} <HulpVraag k='tech.max' uk={uk} /></span>
            <select data-hulp='tech.max' value={max} onChange={(e) => setMax(Number(e.target.value))}>{[15, 30, 60, 120, 240, 480].map((d) => <option key={d} value={d}>{d >= 60 ? `${d / 60} ${uk ? 'год' : 'u'}` : `${d} ${uk ? 'хв' : 'min'}`}</option>)}</select>
            <small>{uk ? 'Найсильніша роль усе одно обмежує (адмін ≤ 1 год).' : 'De sterkste rol beperkt toch (beheerder ≤ 1 u).'}</small></label>
          <label className='tech-veld'><span>{uk ? 'Нотатка (навіщо)' : 'Notitie (waarom)'}</span><input value={notitie} onChange={(e) => setNotitie(e.target.value)} maxLength={300} /></label>
          <div className='tech-knoppen'><button type='submit' className='is-hoofd' disabled={!!bezig || !email || !rollen.length} aria-busy={bezig === 'geven' || undefined} data-tech-knop='geven'>{bezig === 'geven' ? (uk ? 'Зачекайте…' : 'Even geduld…') : (uk ? 'Видати' : 'Geven')}</button></div>
        </form>
        {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
        <h3>{uk ? 'Видані профілі' : 'Gegeven profielen'}</h3>
        {lijst === null ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : (
          <ul className='tech-lijst' data-tech-lijst='1'>{lijst.map((r) => (
            <li key={r.userId} className={r.ingetrokkenOp ? 'is-weg' : ''} data-tech-profiel={r.email}>
              <span className='tech-lijst-wie'><b>{r.naam || r.email}</b><small>{r.email} · <code>{r.profielId}</code></small></span>
              <span className='tech-lijst-rollen'>{r.rollen.map((x) => rolNaam(x, uk)).join(' · ')}</span>
              <span className='tech-lijst-stand'>{r.ingetrokkenOp ? (uk ? 'відкликано' : 'ingetrokken') : r.actiefTot ? (uk ? `активний до ${new Date(r.actiefTot).toLocaleTimeString()}` : `actief tot ${new Date(r.actiefTot).toLocaleTimeString()}`) : (uk ? 'неактивний' : 'inactief')}</span>
              {!r.ingetrokkenOp && !r.rollen.includes('eigenaar') && r.userId !== t.profiel?.userId ? (bevestig === r.userId
                ? <span className='tech-knoppen'><button type='button' className='is-gevaar' onClick={() => void nemen(r)} data-tech-knop={`intrekken-ja:${r.email}`}>{uk ? 'Так, відкликати' : 'Ja, intrekken'}</button><button type='button' onClick={() => setBevestig('')}>{uk ? 'Ні' : 'Nee'}</button></span>
                : <span className='tech-knoppen'><button type='button' className='is-gevaar' disabled={bezig === r.userId} onClick={() => setBevestig(r.userId)} data-tech-knop={`intrekken:${r.email}`}>{uk ? 'Відкликати' : 'Intrekken'}</button><Vraag help={HELP_TECH.intrekken} uk={uk} label={uk ? 'Відкликати' : 'Intrekken'} /></span>) : null}
            </li>
          ))}</ul>
        )}
        <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div>
      </div>
    </Venster>
  );
}

export { openTechVenster };
