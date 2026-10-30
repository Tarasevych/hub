import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { serviceFromLocation, sessieDienst } from './canoniek-navigatie';
import type { CanonicalNoticeInput } from './canoniek-meldingen';
import { COMMAND_LABELS } from './agenten-gegevens';
import { textOf } from './mcp-teksten';
import { siteToolOorzaak, siteToolStatus, siteToolTitel } from '../shared/mcp-acties';
import { activiteitNaamUitJournaal } from '../shared/meldingen-soorten';
import { abonneerGelezen, stuurGelezen } from './meldingen/gelezen-sync';

export type ActivityEvent = {
  id: string; source: string; kind: 'command' | 'tool' | 'grant' | 'site'; type: string; subject: string;
  status: string; createdAt: number; finishedAt: number | null; platform?: string;
  /** AI-actie op de site (owner.mcp.tool): hulpmiddel, doel, client en bij mislukking de foutcode/reden. */
  tool?: string; doel?: string; client?: string; geweigerd?: boolean; code?: string; reden?: string; eind?: string;
  /** 22.10.2026: sfeer van de regel (shared/meldingen-soorten.ts) — de server zet hem en levert alleen de sfeer van dit tabblad. */
  sfeer?: 'prive' | 'technisch';
};
type Lang = 'uk' | 'nl';

const STATUS: Record<string, { uk: string; nl: string; group: 'waiting' | 'active' | 'done' | 'failed' | 'rejected' | 'expired' }> = {
  pending_approval: { uk: 'чекає вашого рішення', nl: 'wacht op uw beslissing', group: 'waiting' },
  approved: { uk: 'виконується', nl: 'wordt uitgevoerd', group: 'active' },
  sent: { uk: 'виконується', nl: 'wordt uitgevoerd', group: 'active' },
  active: { uk: 'активний', nl: 'actief', group: 'active' },
  succeeded: { uk: 'виконано', nl: 'uitgevoerd', group: 'done' },
  failed: { uk: 'помилка', nl: 'mislukt', group: 'failed' },
  rejected: { uk: 'відхилено', nl: 'geweigerd', group: 'rejected' },
  timeout: { uk: 'час вийшов', nl: 'verlopen', group: 'expired' },
};
export const statusInfo = (status: string, lang: Lang) => {
  const s = STATUS[status] ?? { uk: status, nl: status, group: 'active' as const };
  return { text: lang === 'uk' ? s.uk : s.nl, group: s.group };
};


/** Namen van sitegebeurtenissen (auditacties) in de taal van de site. Onbekende acties krijgen een nette algemene naam. */
const SITE_LABELS: Record<string, [string, string]> = {
  'owner.mail.send.committed': ['Лист надіслано', 'Bericht verzonden'], 'owner.mail.account.disconnected': ['Поштовий акаунт відключено', 'Mailaccount ontkoppeld'], 'owner.mail.labels.modified': ['Мітки листа змінено', 'Labels van bericht gewijzigd'],
  'owner.github.issue_create': ['Створено issue на GitHub', 'Issue aangemaakt op GitHub'], 'owner.github.issue_comment': ['Коментар додано на GitHub', 'Reactie geplaatst op GitHub'],
  'owner.mcp.grant.approved': ['Claude отримав доступ', 'Claude kreeg toegang'], 'owner.mcp.grant.denied': ['Доступ для Claude відхилено', 'Toegang voor Claude geweigerd'], 'owner.mcp.grant.revoked': ['Доступ Claude відкликано', 'Toegang van Claude ingetrokken'],
  'owner.browser.grant.created': ['Браузер підключено', 'Browser gekoppeld'], 'owner.browser.grant.revoked': ['Доступ браузера відкликано', 'Browsertoegang ingetrokken'], 'owner.browser.account.logout': ['Вихід у браузері', 'Afgemeld in de browser'],
  'owner.agent.paired': ['Пристрій або браузер підключено', 'Apparaat of browser gekoppeld'], 'owner.agent.revoked': ['Пристрій або браузер відключено', 'Apparaat of browser losgekoppeld'],
  'owner.browser.enabled': ['ШІ отримав доступ до браузера', 'AI kreeg toegang tot de browser'], 'owner.browser.disabled': ['Доступ ШІ до браузера вимкнено', 'Toegang van de AI tot de browser uitgeschakeld'],
  'owner.agent.policy': ['Змінено автоматичні дозволи пристрою', 'Automatische rechten van apparaat gewijzigd'],
  'owner.identity.account.delete': ['Обліковий запис позначено на видалення', 'Account gemarkeerd voor verwijdering'], 'owner.identity.workspace.restored': ['Робочий простір відновлено', 'Werkruimte hersteld'],
  'owner.privacy.export': ['Експорт даних створено', 'Gegevensexport gemaakt'], 'owner.privacy.analytics_consent': ['Змінено згоду на аналітику', 'Toestemming voor analyse gewijzigd'], 'owner.profile.photo.updated': ['Фото профілю оновлено', 'Profielfoto bijgewerkt'],
  'owner.session.revoked.one': ['Сеанс завершено', 'Sessie beëindigd'], 'owner.auth.transaction.completed': ['Вхід виконано', 'Aanmelding voltooid'], 'owner.step_up.google': ['Додаткове підтвердження через Google', 'Extra bevestiging via Google'],
  'owner.admin.role.updated': ['Змінено роль користувача', 'Rol van gebruiker gewijzigd'], 'owner.admin.user.updated': ['Користувача змінено', 'Gebruiker gewijzigd'], 'owner.admin.user.deleted': ['Користувача видалено', 'Gebruiker verwijderd'], 'owner.admin.user.recovered': ['Користувача відновлено', 'Gebruiker hersteld'], 'owner.admin.bootstrap': ['Початкове налаштування адміністратора', 'Eerste beheerinstelling'],
  'owner.access.requested': ['Запит на доступ', 'Toegangsverzoek'],
  // 21.10 рецензія UX: події пошти показувалися в панелі сповіщень як «Дія на сайті: mail contacten scan gestart» —
  // внутрішній нідерландський ідентифікатор в українському інтерфейсі.
  'owner.mail.contacten.scan.gestart': ['Почалася перевірка адрес у пошті', 'Controle van de adressen in de mail gestart'], 'owner.mail.contacten.scan.klaar': ['Перевірку адрес у пошті завершено', 'Controle van de adressen in de mail voltooid'],
  'owner.mail.contacten.scan.beleid': ['Змінено, що робити при помилках перевірки адрес', 'Gedrag bij fouten van de adrescontrole gewijzigd'],
  'owner.mail.afzender.audit.gestart': ['Почалася перевірка відправників', 'Controle van de afzenders gestart'], 'owner.mail.afzender.audit.klaar': ['Перевірку відправників завершено', 'Controle van de afzenders voltooid'],
  'owner.mail.afzender.geverifieerd': ['Відправника позначено перевіреним', 'Afzender als geverifieerd gemarkeerd'], 'owner.mail.afzender.verdacht': ['Відправника позначено підозрілим', 'Afzender als verdacht gemarkeerd'],
  'owner.mail.afzender.ingetrokken': ['Перевірку відправника відкликано', 'Verificatie van afzender ingetrokken'], 'owner.mail.afzender.markering-opgeheven': ['Позначку відправника знято', 'Markering van afzender opgeheven'], 'owner.mail.afzender.bijgewerkt': ['Дані відправника оновлено', 'Gegevens van afzender bijgewerkt'],
  'owner.mail.afzender.vervangen': ['Адресу відправника замінено', 'Adres van afzender vervangen'], 'owner.mail.afzender.verwijderd': ['Відправника видалено зі списку', 'Afzender uit de lijst verwijderd'],
  'owner.mail.afzender.contact': ['Відправника додано до контактів', 'Afzender aan de contacten toegevoegd'], 'owner.mail.afzender.geen-contact': ['Відправника прибрано з контактів', 'Afzender uit de contacten gehaald'],
  'owner.mail.compose.send': ['Лист надіслано', 'Bericht verzonden'], 'owner.mail.compose.scheduled': ['Лист заплановано', 'Bericht ingepland'], 'owner.mail.compose.cancelled': ['Заплановане надсилання скасовано', 'Geplande verzending geannuleerd'],
  'owner.mail.send.prepared': ['Лист підготовлено до надсилання', 'Bericht klaargezet voor verzending'], 'owner.mail.item.updated': ['Лист змінено', 'Bericht gewijzigd'], 'owner.mail.item.imported': ['Листи імпортовано', 'Berichten geïmporteerd'],
  'owner.mail.ai_vertaling.settings': ['Змінено налаштування панелі ШІ в пошті', 'Instellingen van het AI-paneel in de mail gewijzigd'],
  'owner.mail.google-oauth.completed': ['Gmail підключено', 'Gmail gekoppeld'], 'owner.mail.google-account.disconnected': ['Gmail відключено', 'Gmail ontkoppeld'],
  'owner.mail.microsoft-oauth.started': ['Почато підключення Outlook', 'Koppelen van Outlook gestart'], 'owner.mail.microsoft-oauth.completed': ['Outlook підключено', 'Outlook gekoppeld'],
  'owner.mail.primary-identity-linked': ['Основну пошту пов’язано з обліковим записом', 'Hoofdmailbox aan het account gekoppeld'], 'owner.mail.additional-account-recorded': ['Додано ще одну поштову скриньку', 'Extra mailbox toegevoegd'],
  'owner.mail.provider-connect.requested': ['Запит на підключення пошти', 'Verzoek om een mailbox te koppelen'], 'owner.mail.notification-threshold.updated': ['Змінено поріг сповіщень пошти', 'Drempel voor mailmeldingen gewijzigd'],
  // UI-014: extensie-gebeurtenissen kwamen als «Дія на сайті: extensie vernieuwing-geblokkeerd» (Nederlandse code in het Oekraïense paneel).
  'owner.extensie.ontgrendeld': ['Розширення браузера розблоковано', 'Browserextensie ontgrendeld'], 'owner.extensie.vernieuwd': ['Доступ розширення браузера поновлено', 'Toegang van de browserextensie vernieuwd'],
  'owner.extensie.vernieuwing-geblokkeerd': ['Доступ розширення браузера не вдалося поновити', 'Toegang van de browserextensie kon niet vernieuwd worden'],
  'owner.extensie.ingetrokken': ['Доступ розширення браузера закрито', 'Toegang van de browserextensie gesloten'], 'owner.extensie.geweigerd': ['Розширенню браузера відмовлено в доступі', 'Browserextensie geweigerd'],
  'owner.extensie.caps-herzien': ['Дозволи розширення браузера звужено', 'Rechten van de browserextensie beperkt'], 'owner.extensie.beleid': ['Змінено правила розширення браузера', 'Regels van de browserextensie gewijzigd'],
  'owner.extensie.verlengd': ['Доступ розширення браузера продовжено', 'Toegang van de browserextensie verlengd'], 'owner.extensie.beheer.ingetrokken': ['Адміністратор закрив доступ розширення', 'Beheerder sloot de toegang van de extensie'],
};
const siteTitle = (e: ActivityEvent, lang: Lang): string => {
  // Een AI-actie noemt wat ze deed en waarop («Прочитав файл …»), niet het algemene «mcp tool».
  if (e.type === 'owner.mcp.tool' && e.tool) return siteToolTitel(e, lang);
  const hit = SITE_LABELS[e.type];
  if (hit) return lang === 'uk' ? hit[0] : hit[1];
  // 22.10.2026: technische acties (tech, siem, diagnose, uitrol, …) hebben hun naam al in het beheerlogboek (shared/beheer-journaal.ts):
  // nooit «Дія на сайті: tech geactiveerd» in het paneel «Технічні сповіщення».
  // Technische actie zonder eigen label: de rubriek van het beheerlogboek («Діагностика», «Оновлення сайту», …), nooit de interne code.
  const uitJournaal = activiteitNaamUitJournaal(e.type, lang, e.sfeer === 'technisch');
  if (uitJournaal) return uitJournaal;
  // UI-014: nooit de interne code als titel (die staat onder «Технічні подробиці»); wel de rubriek als die bekend is.
  return lang === 'uk' ? 'Інша дія на сайті' : 'Andere actie op de site';
};

/** Naam van de actie in de taal van de site (nooit de Engelse beschrijving). */
export function activityTitle(e: ActivityEvent, lang: Lang): string {
  if (e.kind === 'site') return siteTitle(e, lang);
  if (e.kind === 'grant') return lang === 'uk' ? `Claude підключено: ${e.subject}` : `Claude verbonden: ${e.subject}`;
  if (e.kind === 'tool') return textOf(e.type, lang)?.title || e.type;
  const label = COMMAND_LABELS[e.type];
  return label ? (lang === 'uk' ? label[0] : label[1]) : e.type;
}
/** Waar de gebruiker heen moet om te handelen: een wachtende vraag leidt naar het beslisvenster, de rest naar het overzicht. */
export function activityLink(e: ActivityEvent, lang: Lang): { href: string; label: string } {
  const pending = e.status === 'pending_approval';
  if (e.kind === 'site') return { href: '', label: '' };
  return { href: `https://mcp.tarasevych.com/agents#${pending ? 'pending' : 'overview'}`, label: pending ? (lang === 'uk' ? 'Прийняти рішення' : 'Beslissen') : (lang === 'uk' ? 'Відкрити' : 'Openen') };
}
export const sourceLabel = (source: string, lang: Lang): string => ({
  claude: 'Claude', agent: lang === 'uk' ? 'Пристрій' : 'Apparaat', browser: lang === 'uk' ? 'Браузер' : 'Browser',
} as Record<string, string>)[source] || source;

/** Hoe lang het duurde of al duurt, in mensentaal ("3 с", "2 хв"). */
export function durationText(e: ActivityEvent, lang: Lang, now = Date.now()): string {
  const end = e.finishedAt ?? now;
  const s = Math.max(0, Math.round((end - e.createdAt) / 1000));
  if (s < 60) return lang === 'uk' ? `${s} с` : `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return lang === 'uk' ? `${m} хв` : `${m} min`;
  const h = Math.round(m / 60);
  return lang === 'uk' ? `${h} год` : `${h} uur`;
}

const READ_KEY = (scope: string) => `tsv:activity-read-v1:${scope || 'anon'}`;
const loadRead = (scope: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(READ_KEY(scope)) || '[]') as string[]); } catch { return new Set(); } };
/**
 * UI-014 (bug «позначене прочитаним лишається непрочитаним»): vroeger schreef elk tabblad zijn EIGEN set weg (laatste wint), zodat wat
 * een ander tabblad intussen gelezen had weer «ongelezen» werd; en `slice(-300)` gooide willekeurig ids weg. Nu: altijd samenvoegen met
 * wat er al staat, de nieuwste (laatst toegevoegde) 600 bewaren, en andere tabbladen volgen via het `storage`-event.
 */
export const READ_MAX = 600;
export const mergeRead = (a: Iterable<string>, b: Iterable<string>, max = READ_MAX): Set<string> => { const all = [...new Set([...a, ...b])]; return new Set(all.slice(Math.max(0, all.length - max))); };
const saveRead = (scope: string, ids: Set<string>): Set<string> => { const merged = mergeRead(loadRead(scope), ids); try { localStorage.setItem(READ_KEY(scope), JSON.stringify([...merged])); } catch { /* geen opslag */ } return merged; };

/**
 * Pollt het overzicht van wat Claude en uw apparaten of browsers doen, op elke pagina van de site (ook als u op een andere dienst zit),
 * en geeft een pop-up bij elk nieuw verzoek of elke nieuwe uitkomst. Stopt na een 401/403 (geen recht of geen sessie) tot de gebruiker wisselt.
 */
export function useConnectorActivity(scope: string, lang: Lang, toast: (notice: CanonicalNoticeInput) => void) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [read, setRead] = useState<Set<string>>(() => loadRead(scope));
  const [available, setAvailable] = useState(false);
  const known = useRef<Map<string, string> | null>(null);
  const stopped = useRef(false);
  const baselined = useRef(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const ref = useRef({ lang, toast });
  ref.current = { lang, toast };

  useEffect(() => { setRead(loadRead(scope)); known.current = null; baselined.current = false; stopped.current = !scope || scope === 'anon'; setEvents([]); setAvailable(false); }, [scope]);

  const poll = useCallback(async () => {
    if (stopped.current) return;
    try {
      const res = await api.post('/api/owner/agents/activity', { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
      const list: ActivityEvent[] = res.data?.events ?? [];
      setEvents(list); setAvailable(true);
      // De allereerste keer op dit apparaat geldt alles wat er al was als gelezen: alleen wat daarna gebeurt telt als nieuw.
      if (!baselined.current) { baselined.current = true; try { if (localStorage.getItem(READ_KEY(scopeRef.current)) === null) { const all = new Set(list.map((e) => e.id)); saveRead(scopeRef.current, all); setRead(all); } } catch { /* geen opslag */ } }
      const { lang: l, toast: say } = ref.current;
      if (known.current) {
        for (const e of list) {
          const before = known.current.get(e.id);
          if (before === e.status) continue;
          if (e.kind === 'site' && e.status !== 'failed') continue;
          const title = activityTitle(e, l);
          const st = statusInfo(e.status, l);
          const cause = activityCause(e, l);
          const stText = activityStatusText(e, l);
          if (e.status === 'pending_approval') {
            const who = `${sourceLabel(e.source, l)}${e.kind === 'command' ? `, ${e.subject}` : ''}`;
            say({ text: l === 'uk' ? `Очікує вашого рішення: ${title} (${who})` : `Wacht op uw beslissing: ${title} (${who})`, kind: 'warning', source: 'mcp', transient: true, link: activityLink(e, l) });
          } else if (e.kind === 'grant') say({ text: title, kind: 'success', source: 'mcp', transient: true });
          else if (st.group !== 'active' && st.group !== 'waiting') say({ text: `${title}: ${stText}${cause ? ` — ${cause}` : ''}`, kind: st.group === 'done' ? 'success' : st.group === 'failed' ? 'error' : 'info', source: e.kind === 'site' ? e.source : 'mcp', transient: true });
        }
      }
      known.current = new Map(list.map((e) => [e.id, e.status]));
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) { stopped.current = true; setAvailable(false); }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive && !document.hidden) void poll(); };
    tick();
    // Op de MCP-pagina (waar de gebruiker op beslissingen wacht) elke 10 s (HUB-04: nooit sneller); elders (bijv. de mail op een telefoon) zeldzamer: minder netwerk, batterij en CPU.
    const timer = window.setInterval(tick, serviceFromLocation() === 'mcp' ? 10000 : 30000);
    const visible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [poll, scope]);

  // Andere tabbladen (zelfde subdomein) en de server (alle subdomeinen/apparaten, src/meldingen/gelezen-sync.ts) houden dit gelijk.
  useEffect(() => {
    const opOpslag = (ev: StorageEvent) => { if (ev.key === READ_KEY(scope)) setRead((current) => mergeRead(current, loadRead(scope))); };
    window.addEventListener('storage', opOpslag);
    const stop = abonneerGelezen((ids) => setRead((current) => { const next = mergeRead(current, ids); if (next.size === current.size) return current; saveRead(scope, next); return next; }));
    return () => { window.removeEventListener('storage', opOpslag); stop(); };
  }, [scope]);
  const markRead = (id: string) => { stuurGelezen([id]); setRead((current) => { if (current.has(id)) return current; const next = new Set(current); next.add(id); return saveRead(scope, next); }); };
  const markAllRead = () => { stuurGelezen(events.map((e) => e.id)); setRead((current) => { const next = new Set(current); for (const e of events) next.add(e.id); return saveRead(scope, next); }); };
  return { events, read, available, markRead, markAllRead, refresh: poll };
}

/** Waarom een AI-actie op de site mislukte of geweigerd werd, in gewone woorden (leeg bij andere meldingen). */
export const activityCause = (e: ActivityEvent, lang: Lang): string => (e.kind === 'site' && e.type === 'owner.mcp.tool' ? siteToolOorzaak(e, lang) : '');
/** Status zoals de gebruiker hem moet lezen: geweigerd ≠ mislukt. */
export const activityStatusText = (e: ActivityEvent, lang: Lang): string =>
  (e.kind === 'site' && e.type === 'owner.mcp.tool' ? siteToolStatus(e, lang) : undefined) ?? statusInfo(e.status, lang).text;
