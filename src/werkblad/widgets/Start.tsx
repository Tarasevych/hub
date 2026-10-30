// Widgets zonder serverbron (meteen in de hoofdbundel, want zij vormen de eerste indruk / LCP): begroeting, snelle toegang,
// snelle acties, de tip-strook en «ШІ для вас».
import { useEffect, useState } from 'react';
import { Bot, CalendarPlus, Languages, LayoutGrid, ListChecks, Mail, Moon, NotebookPen, PenLine, Search, SquareKanban, Sun, Sunrise, Sunset, Upload, X, type LucideIcon } from 'lucide-react';
import { STARTVRAGEN } from '../../../shared/ai-werkruimte';
import { haalBord, readHubBlockDataCache, loadHubBlockData, useBron } from '../gegevens';
import { MENU_CATALOG, MenuGlyph, type MenuItemId } from '../../menu-voorkeuren';
import { dienstToegestaan } from '../../account-rechten';
import { regelsVoor, tr, locale, type Acties, type WidgetProps } from '../soorten';

// ---------------------------------------------------------------- begroeting
const dagdeel = (uur: number): { uk: string; nl: string; Icoon: LucideIcon } =>
  uur < 6 ? { uk: 'Доброї ночі', nl: 'Goedenacht', Icoon: Moon }
    : uur < 11 ? { uk: 'Доброго ранку', nl: 'Goedemorgen', Icoon: Sunrise }
      : uur < 18 ? { uk: 'Доброго дня', nl: 'Goedemiddag', Icoon: Sun }
        : uur < 23 ? { uk: 'Доброго вечора', nl: 'Goedenavond', Icoon: Sunset } : { uk: 'Доброї ночі', nl: 'Goedenacht', Icoon: Moon };

export function Begroeting({ lang, naam }: WidgetProps) {
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 20_000); return () => clearInterval(t); }, []);
  const d = new Date(nu);
  const deel = dagdeel(d.getHours());
  // Een naam die een e-mailadres is (account zonder weergavenaam) is geen voornaam: dan groeten we zonder naam.
  const voornaam = /@/.test(naam) ? '' : naam.trim().split(/\s+/)[0] || '';
  const datum = new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const klok = new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(d);
  return (
    <div className='wb-begroeting' data-wb-begroeting={voornaam ? 'naam' : 'zonder'}>
      <deel.Icoon aria-hidden='true' className='wb-begroeting-icoon' />
      <div className='wb-begroeting-tekst'>
        <h2>{tr(lang, deel.uk, deel.nl)}{voornaam ? `, ${voornaam}` : ''}!</h2>
        <p>{tr(lang, 'Ваш простір. Ваші інструменти. Ваші можливості.', 'Uw ruimte. Uw gereedschap. Uw mogelijkheden.')}</p>
      </div>
      <div className='wb-begroeting-tijd'>
        <span className='wb-begroeting-datum'>{datum.charAt(0).toUpperCase() + datum.slice(1)}</span>
        <time className='wb-begroeting-klok' dateTime={d.toISOString()}>{klok}</time>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- snelle toegang (de diensten uit het menu, zonder verzonnen logo's)
type Tegel = { id: MenuItemId; uk: string; nl: string; icon: string; open: (a: Acties) => void };
const TEGELS: Tegel[] = [
  { id: 'mail', uk: 'Пошта', nl: 'E-mail', icon: 'mail', open: (a) => a.dienst('mail', 'inbox') },
  { id: 'calendar', uk: 'Календар', nl: 'Agenda', icon: 'calendar', open: (a) => a.hubTab('calendar') },
  { id: 'cloud', uk: 'Хмарне сховище', nl: 'Cloudopslag', icon: 'cloud', open: (a) => a.dienst('cloud', 'overview') },
  { id: 'github', uk: 'GitHub', nl: 'GitHub', icon: 'github', open: (a) => a.dienst('github', 'overview') },
  { id: 'tasks', uk: 'Завдання', nl: 'Taken', icon: 'tasks', open: (a) => a.hubTab('tasks') },
  { id: 'notes', uk: 'Нотатки', nl: 'Notities', icon: 'notes', open: (a) => a.hubTab('notes') },
  { id: 'ai', uk: 'ШІ для вас', nl: 'AI voor u', icon: 'bot', open: (a) => a.dienst('ai', 'workspace') },
  { id: 'mcp', uk: 'Дошка', nl: 'Bord', icon: 'cable', open: (a) => a.dienst('mcp', 'board') },
  { id: 'huis', uk: 'Розумний будинок', nl: 'Slim huis', icon: 'house', open: (a) => a.dienst('huis', 'overview') },
  { id: 'identity', uk: 'Налаштування', nl: 'Instellingen', icon: 'settings', open: (a) => a.dienst('identity', 'personalization') },
  { id: 'api', uk: 'API та інтеграції', nl: 'API en integraties', icon: 'network', open: (a) => a.dienst('api', 'access') },
  { id: 'admin', uk: 'Адміністрування', nl: 'Beheer', icon: 'shield', open: (a) => a.dienst('admin', 'overview') },
];
export function SnelToegang({ lang, acties, techProfiel, apiPlatform, eigenaar, ownerUserId, zichtbaar }: WidgetProps) {
  const r = { apiPlatform, eigenaar };
  // Visuele tellers (zoals in het voorbeeld): ongelezen post en open taken — uit dezelfde, gecachte bronnen als de widgets.
  const post = useBron((f) => loadHubBlockData(ownerUserId, f), readHubBlockDataCache(ownerUserId), zichtbaar);
  const bord = useBron((f) => haalBord(f), null, zichtbaar);
  const teller: Partial<Record<MenuItemId, { n: number; label: string }>> = {};
  const ongelezen = post.waarde?.sources?.mail?.status === 'ready' ? Number(post.waarde.sources.mail.unread || 0) : 0;
  if (ongelezen > 0) teller.mail = { n: ongelezen, label: tr(lang, `${ongelezen} непрочитаних`, `${ongelezen} ongelezen`) };
  const open = bord.waarde ? bord.waarde.taken.filter((t) => ['backlog', 'doing', 'blocked'].includes(t.status)).length : 0;
  if (open > 0) teller.tasks = { n: open, label: tr(lang, `${open} відкритих завдань`, `${open} open taken`) };
  const tegels = TEGELS.filter((t) => { const m = MENU_CATALOG.find((c) => c.id === t.id); return m && !m.planned && dienstToegestaan(m.target, r, techProfiel); });
  return (
    <ul className='wb-snel' data-wb-snel={String(tegels.length)}>
      {tegels.map((t) => {
        const m = MENU_CATALOG.find((c) => c.id === t.id)!;
        return (
          <li key={t.id}>
            <button type='button' className={`wb-snel-tegel accent-${t.id}`} onClick={() => t.open(acties)} data-wb-snel-tegel={t.id} aria-label={teller[t.id] ? `${tr(lang, t.uk, t.nl)}: ${teller[t.id]!.label}` : undefined}>
              <span className='wb-snel-icoon' aria-hidden='true'><MenuGlyph icon={m.icon} />{teller[t.id] ? <span className='wb-teller is-op-icoon'>{teller[t.id]!.n > 99 ? '99+' : teller[t.id]!.n}</span> : null}</span>
              <span className='wb-snel-naam'>{tr(lang, t.uk, t.nl)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- snelle acties
export function SnelleActies({ lang, acties, item, kolommen }: WidgetProps) {
  const lijst: Array<{ id: string; uk: string; nl: string; Icoon: LucideIcon; doe: () => void }> = [
    { id: 'notitie', uk: 'Створити нотатку', nl: 'Notitie maken', Icoon: NotebookPen, doe: () => acties.hubTab('notes') },
    { id: 'taak', uk: 'Нове завдання', nl: 'Nieuwe taak', Icoon: ListChecks, doe: () => acties.hubTab('tasks') },
    { id: 'afspraak', uk: 'Додати подію', nl: 'Afspraak toevoegen', Icoon: CalendarPlus, doe: () => acties.hubTab('calendar') },
    { id: 'bericht', uk: 'Написати лист', nl: 'Bericht schrijven', Icoon: PenLine, doe: () => acties.dienst('mail', 'inbox') },
    { id: 'bestand', uk: 'Завантажити файл', nl: 'Bestand uploaden', Icoon: Upload, doe: () => acties.dienst('cloud', 'capture') },
    { id: 'bord', uk: 'Відкрити дошку', nl: 'Bord openen', Icoon: SquareKanban, doe: () => acties.dienst('mcp', 'board') },
    { id: 'zoek', uk: 'Пошук по простору', nl: 'Zoeken in de ruimte', Icoon: Search, doe: () => acties.zoek() },
  ];
  return (
    <ul className='wb-acties'>
      {lijst.slice(0, regelsVoor(item.r, kolommen, 3, 2, lijst.length)).map((a) => <li key={a.id}><button type='button' onClick={a.doe} data-wb-actie={a.id}><a.Icoon aria-hidden='true' />{tr(lang, a.uk, a.nl)}</button></li>)}
    </ul>
  );
}

// ---------------------------------------------------------------- tip-strook
export function Tip({ lang, acties, item, weg }: WidgetProps) {
  return (
    <div className='wb-tip' data-wb-tip={item.tid}>
      <span className='wb-tip-icoon' aria-hidden='true'><Languages /></span>
      <div className='wb-tip-tekst'>
        <strong>{tr(lang, 'Використовуйте свій простір ще ефективніше', 'Haal meer uit uw ruimte')}</strong>
        <small>{tr(lang, 'Додавайте віджети, змінюйте розташування та створюйте власний робочий стіл.', 'Voeg widgets toe, verplaats ze en maak uw eigen werkblad.')}</small>
      </div>
      <span className='wb-tip-knoppen'>
        <button type='button' className='knop-secundair is-klein' onClick={acties.catalogus} data-wb-tip-widgets='1'><LayoutGrid aria-hidden='true' />{tr(lang, 'Мої віджети', 'Mijn widgets')}</button>
        <button type='button' className='knop-primair is-klein' onClick={acties.instellen}>{tr(lang, 'Налаштувати', 'Instellen')}</button>
      </span>
      {weg ? <button type='button' className='wb-tip-sluit' aria-label={tr(lang, 'Прибрати підказку зі столу (повернути можна з каталогу)', 'Tip van het werkblad halen (terug te zetten via de catalogus)')} onClick={weg}><X aria-hidden='true' /></button> : null}
    </div>
  );
}

// ---------------------------------------------------------------- ШІ для вас — de ECHTE startvragen van ai.* (shared/ai-werkruimte.ts), niets verzonnen.
// Of een vraag nu werkt (sleutel, model, hulpmiddelen) beslist het werkgebied zelf (POST /api/owner/ai/werkruimte/overzicht, alleen dienst ai).
const AI_KORT: Record<string, { uk: string; nl: string; Icoon: LucideIcon }> = {
  samenvatten: { uk: 'Пояснити текст', nl: 'Tekst uitleggen', Icoon: PenLine },
  'agenda-dag': { uk: 'Мій день', nl: 'Mijn dag', Icoon: CalendarPlus },
  zoeken: { uk: 'Пошук у просторі', nl: 'Zoeken in de ruimte', Icoon: Search },
  uitleg: { uk: 'Що вміє ШІ тут', nl: 'Wat AI hier kan', Icoon: Bot },
};
export function Ai({ lang, acties, apiPlatform, item, kolommen }: WidgetProps) {
  const vragen = Object.keys(AI_KORT).map((id) => STARTVRAGEN.find((v) => v.id === id)).filter((v): v is (typeof STARTVRAGEN)[number] => Boolean(v)).slice(0, regelsVoor(item.r, kolommen, 1, 0, 4));
  return (
    <div className='wb-ai'>
      <ul>{vragen.map((v) => { const k = AI_KORT[v.id]; return <li key={v.id} data-wb-ai-vraag={v.id}><k.Icoon aria-hidden='true' /><span><strong>{tr(lang, k.uk, k.nl)}</strong><small>{tr(lang, v.tekst[0], v.tekst[1])}</small></span></li>; })}</ul>
      {apiPlatform ? null : <small className='wb-ai-hint'><Mail aria-hidden='true' />{tr(lang, 'ШІ потребує права «api-platform» — попросіть власника.', 'AI vraagt het recht «api-platform» — vraag het de eigenaar.')}</small>}
      <button type='button' className='knop-primair' onClick={() => acties.dienst('ai', 'workspace')}><Bot aria-hidden='true' />{tr(lang, 'Відкрити ШІ', 'AI openen')}</button>
    </div>
  );
}
