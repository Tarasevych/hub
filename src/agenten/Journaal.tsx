// Журнал: één tijdlijn van alles rond agents (tokens, apparaten, extensie, toestemmingen, AI aan/uit, noodstop), uit app.audit.
// Dicht: één zin + onderwerp + relatieve tijd (exacte tijd bij aanwijzen). Open: actiecode, id's, ip-hash, apparaat, ruwe details.
import { duur as duurVan } from '../../shared/ai-verbinding';
import { useMemo, useState, type ReactElement } from 'react';
import { Bot, Boxes, Calendar, Camera, CircleHelp, Compass, Container, Eye, FilePen, FileText, Fingerprint, Gauge, GitBranch, Globe, HardDrive, Kanban, KeyRound, Mail, Monitor, MousePointerClick, OctagonX, Rocket, Search, Server, ShieldCheck, Sparkles, Stethoscope, Terminal, Wrench } from 'lucide-react';
import { SOORT_INFO, actieSoort, actieZin, groepeerWerk, telling, type ActieSoort, type WerkSessie } from '../../shared/mcp-acties';
import type { Tr } from '../mcp-ui';
import { CAP_TEXT } from '../AiToestemmingen';
import { datum, Knop, Rij, Tech, Tijd, exact } from './ui';
import { foutTekst } from './fouten';
import { useJournaal, type JournaalItem } from './data';

export const SOORTEN: Array<[string, string, string]> = [
  ['', 'Усі події', 'Alle gebeurtenissen'], ['werk', 'Дії ШІ (що робив агент)', 'Acties van AI (wat de agent deed)'], ['ai', 'Підключення ШІ', 'AI-verbindingen'], ['token', 'Токени', 'Tokens'], ['apparaat', 'Пристрої', 'Apparaten'],
  ['browser', 'Браузер (ШІ увімк./вимк.)', 'Browser (AI aan/uit)'], ['toestemming', 'Дозволи', 'Toestemmingen'], ['noodstop', 'Стоп і блокування', 'Stop en blokkeren'], ['hulpmiddelen', 'Інструменти', 'Hulpmiddelen'],
  ['toegang', 'Права й ключі', 'Rechten en sleutels'],
];
const ICOON: Record<string, ReactElement> = { werk: <Bot />, ai: <Sparkles />, token: <KeyRound />, apparaat: <Monitor />, browser: <Globe />, toestemming: <ShieldCheck />, noodstop: <OctagonX />, hulpmiddelen: <Wrench />, toegang: <Fingerprint /> };
const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
/** Icoon per soort actie van een AI (zelfde soorten als shared/mcp-acties.ts). */
const ACTIE_ICOON: Record<ActieSoort, ReactElement> = {
  bekijken: <Eye />, screenshot: <Camera />, diagnose: <Stethoscope />, navigeren: <Compass />, invoer: <MousePointerClick />, lezen: <FileText />, schrijven: <FilePen />,
  commando: <Terminal />, docker: <Container />, apps: <Boxes />, meten: <Gauge />, mail: <Mail />, agenda: <Calendar />, schijf: <HardDrive />, github: <GitBranch />, bord: <Kanban />,
  server: <Server />, zoeken: <Search />, uitrol: <Rocket />, onbekend: <CircleHelp />,
};
const soortVan = (d: Record<string, unknown>): ActieSoort => (s(d.soort) in SOORT_INFO ? s(d.soort) as ActieSoort : actieSoort(s(d.tool)));
const capNaam = (c: unknown, tr: Tr) => { const t = CAP_TEXT[s(c) as keyof typeof CAP_TEXT]; return t ? tr(t[0], t[1]) : s(c); };
const REDEN: Record<string, [string, string]> = {
  user: ['вами', 'door u'], client: ['самим клієнтом', 'door de client zelf'], refresh_reuse: ['автоматично: повторне використання токена (можлива крадіжка)', 'automatisch: hergebruik van een token (mogelijke diefstal)'],
  repaired: ['перевстановлення (новий токен)', 'herinstallatie (nieuw token)'], blocked: ['блокування доступу ШІ', 'blokkade van AI-toegang'], ui: ['вами', 'door u'],
};

// Gastscopes (§13.11) leesbaar in het journaal.
const GAST_SCOPE: Record<string, [string, string]> = { 'profiel.lezen': ['профіль', 'profiel'], 'apparaten.lezen': ['пристрої та агенти', 'apparaten en agents'], 'journaal.lezen': ['журнал агентів', 'journaal van agents'] };
const duurTekst = (id: string, tr: Tr) => { const x = duurVan(id); return tr(x.uk, x.nl); };
/** Eén zin in gewone taal voor een journaalregel. */
export function zin(e: JournaalItem, tr: Tr): string {
  const d = e.details, n = e.onderwerp?.naam || s(d.name) || s(d.clientName) || '—';
  const reden = (r: unknown) => { const x = REDEN[s(r)] ?? (s(r).startsWith('preset:') ? ['замінено набором', 'vervangen door een set'] as [string, string] : null); return x ? ` (${tr(x[0], x[1])})` : ''; };
  switch (e.actie) {
    case 'owner.mcp.tool': return `«${n}»: ${actieZin(s(d.tool), s(d.doel) || undefined, tr('uk', 'nl') as 'uk' | 'nl')}`;
    case 'owner.mcp.grant.approved': return tr('Ви дозволили ШІ-клієнту підключитися', 'U stond een AI-client toe te verbinden');
    case 'owner.mcp.grant.denied': return tr('Ви відхилили запит ШІ на підключення', 'U weigerde een verzoek van een AI om te verbinden');
    case 'owner.mcp.grant.connected': return tr(`Підключено ШІ «${n}» (OAuth)`, `AI «${n}» verbonden (OAuth)`);
    case 'owner.mcp.grant.revoked': return tr(`Відкликано доступ «${n}»`, `Toegang van «${n}» ingetrokken`) + reden(d.reason);
    case 'owner.mcp.deur.approved': return tr(`Ви дозволили «${s(d.klant) || n}» двері ${s(d.deur) ? `/${s(d.deur)}` : 'сервера'}${s(d.duur) ? ` (${duurTekst(s(d.duur), tr)})` : ''}`, `U gaf «${s(d.klant) || n}» toegang tot de deur ${s(d.deur) ? `/${s(d.deur)}` : 'van de server'}${s(d.duur) ? ` (${duurTekst(s(d.duur), tr)})` : ''}`);
    case 'owner.mcp.deur.denied': return tr(`Ви відхилили запит «${s(d.klant) || n}» до дверей сервера`, `U weigerde «${s(d.klant) || n}» toegang tot de serverdeur`);
    case 'owner.mcp.deur.revoked': return tr(`Відкликано доступ «${s(d.klant) || n}» до дверей ${s(d.deur) ? `/${s(d.deur)}` : 'сервера'}`, `Toegang van «${s(d.klant) || n}» tot de deur ${s(d.deur) ? `/${s(d.deur)}` : 'van de server'} ingetrokken`);
    case 'owner.mcp.duur.setting': return tr(`Термін доступу для ${s(d.klant)}: ${duurTekst(s(d.duur), tr)}`, `Toegangsduur voor ${s(d.klant)}: ${duurTekst(s(d.duur), tr)}`);
    case 'owner.tech.geactiveerd': return tr(`Увімкнено технічний профіль на ${s(d.minuten)} хв: ${s(d.reden)}`, `Technisch profiel aangezet voor ${s(d.minuten)} min: ${s(d.reden)}`);
    case 'owner.tech.beeindigd': return tr('Технічний профіль вимкнено', 'Technisch profiel uitgezet');
    case 'owner.tech.toegekend': return s(d.aan) ? tr(`Видано технічний профіль ${s(d.aan)}`, `Technisch profiel gegeven aan ${s(d.aan)}`) : tr(`Отримано технічний профіль${s(d.door) ? ` від ${s(d.door)}` : ''}`, `Technisch profiel ontvangen${s(d.door) ? ` van ${s(d.door)}` : ''}`);
    case 'owner.tech.ingetrokken': return s(d.van) ? tr(`Відкликано технічний профіль ${s(d.van)}`, `Technisch profiel van ${s(d.van)} ingetrokken`) : tr('Ваш технічний профіль відкликано', 'Uw technisch profiel is ingetrokken');
    case 'owner.terminal.geopend': return tr(`Відкрито термінал на «${s(d.apparaat)}» (${d.schrijven ? 'запис' : 'лише читання'}, ${s(d.minuten)} хв): ${s(d.reden)}`, `Terminal geopend op «${s(d.apparaat)}» (${d.schrijven ? 'schrijven' : 'alleen lezen'}, ${s(d.minuten)} min): ${s(d.reden)}`);
    case 'owner.terminal.gesloten': return tr(`Термінал закрито (${s(d.seconden)} с)`, `Terminal gesloten (${s(d.seconden)} s)`);
    case 'owner.terminal.opname.bekeken': return tr('Переглянуто запис термінала', 'Terminalopname bekeken');
    case 'owner.ssh-ca.uitgegeven': return tr(`Видано сертифікат SSH на ${s(d.minuten)} хв (вхід як ${s(d.principal)}), відбиток ${s(d.vinger).slice(0, 19)}…`, `SSH-certificaat uitgegeven voor ${s(d.minuten)} min (aanmelden als ${s(d.principal)}), vingerafdruk ${s(d.vinger).slice(0, 19)}…`);
    case 'owner.ssh-ca.geweigerd': return tr(`Сертифікат SSH не видано (${s(d.code)})`, `SSH-certificaat niet uitgegeven (${s(d.code)})`);
    case 'owner.flags.gewijzigd': return tr(`Прапорець «${s(d.sleutel)}» ${d.nieuw ? 'створено' : 'змінено'}: ${d.aan ? 'увімкнено' : 'вимкнено'}${Number(d.percentage) ? `, ${s(d.percentage)}%` : ''}`, `Vlag «${s(d.sleutel)}» ${d.nieuw ? 'aangemaakt' : 'gewijzigd'}: ${d.aan ? 'aan' : 'uit'}${Number(d.percentage) ? `, ${s(d.percentage)}%` : ''}`);
    case 'owner.flags.verwijderd': return tr(`Прапорець «${s(d.sleutel)}» видалено`, `Vlag «${s(d.sleutel)}» verwijderd`);
    case 'owner.flags.getest': return tr(`Тест прапорця «${s(d.sleutel)}» для себе: ${d.waarde === null ? 'знято' : d.waarde ? 'увімкнено' : 'вимкнено'}`, `Test van vlag «${s(d.sleutel)}» voor uzelf: ${d.waarde === null ? 'weg' : d.waarde ? 'aan' : 'uit'}`);
    case 'owner.ondersteuning.gevraagd': return s(d.aan) ? tr(`Запит на підтримку надіслано ${s(d.aan)} (${s(d.minuten)} хв)`, `Verzoek om ondersteuning naar ${s(d.aan)} (${s(d.minuten)} min)`) : tr(`${s(d.door)} просить дозволу переглянути ваш простір: ${s(d.reden)}`, `${s(d.door)} vraagt uw ruimte te bekijken: ${s(d.reden)}`);
    case 'owner.ondersteuning.nood': return s(d.aan) ? tr(`Термінова підтримка: ${s(d.aan)}`, `Noodtoegang: ${s(d.aan)}`) : tr(`Термінова підтримка від ${s(d.door)}: ${s(d.reden)}`, `Noodtoegang door ${s(d.door)}: ${s(d.reden)}`);
    case 'owner.ondersteuning.toegestaan': return s(d.aan) ? tr(`Ви дозволили підтримці ${s(d.aan)} перегляд на ${s(d.minuten)} хв`, `U gaf ${s(d.aan)} ${s(d.minuten)} min toegang`) : tr(`${s(d.door)} дозволив перегляд`, `${s(d.door)} gaf toestemming`);
    case 'owner.ondersteuning.geweigerd': return s(d.aan) ? tr(`Ви відхилили запит ${s(d.aan)}`, `U weigerde ${s(d.aan)}`) : tr(`${s(d.door)} відхилив запит`, `${s(d.door)} weigerde`);
    case 'owner.ondersteuning.beeindigd': return tr('Доступ підтримки завершено', 'Toegang van ondersteuning beëindigd');
    case 'owner.ondersteuning.bekeken': return tr(`${s(d.door)} переглянув огляд вашого облікового запису`, `${s(d.door)} bekeek het overzicht van uw account`);
    case 'owner.diagnose.gemeld': return tr(`Надіслано звіт перевірки «Щось не працює?» (${s(d.dienst)})`, `Controleverslag «Werkt iets niet?» verstuurd (${s(d.dienst)})`);
    case 'owner.diagnose.gelezen': return tr(`Переглянуто звіти користувачів (${s(d.aantal)})`, `Verslagen van gebruikers bekeken (${s(d.aantal)})`);
    case 'owner.tech.band': return tr('Змінено колір технічної смуги', 'Kleur van de technische band gewijzigd');
    case 'owner.mcp.grant.expired': return tr(`Закінчився строк доступу «${n}»`, `Toegang van «${n}» verlopen`);
    case 'mcp_console_token_issued': return tr(`Випущено токен «${n}»`, `Token «${n}» uitgegeven`);
    case 'mcp_console_token_revoked': return tr(`Відкликано токен «${n}»`, `Token «${n}» ingetrokken`);
    case 'owner.agent.paired': {
      const r = Number(d.replaced || 0), browser = s(d.platform) === 'browser' || e.onderwerp?.platform === 'browser';
      if (r > 0) return tr(`Перевстановлено «${n}»: новий токен, старе підключення відкликано`, `«${n}» opnieuw geïnstalleerd: nieuw token, oude koppeling ingetrokken`);
      return browser ? tr(`Розширення підключено в браузері «${n}»`, `Extensie gekoppeld in browser «${n}»`) : tr(`Підключено пристрій «${n}»`, `Apparaat «${n}» gekoppeld`);
    }
    case 'owner.agent.revoked': return tr(`Відключено «${n}»`, `«${n}» losgekoppeld`) + reden(d.reason);
    case 'owner.agent.updated': return tr(`Оновлено «${n}»: ${s(d.from)} → ${s(d.to)}`, `«${n}» bijgewerkt: ${s(d.from)} → ${s(d.to)}`);
    case 'owner.agent.policy': return tr(`Змінено, що «${n}» виконує без кліку`, `Gewijzigd wat «${n}» zonder klik uitvoert`);
    case 'owner.agent.pairing_code': return tr('Створено одноразовий код підключення', 'Eenmalige koppelcode gemaakt');
    case 'owner.browser.enabled': return tr(`ШІ ввімкнено для браузера «${n}»`, `AI aangezet voor browser «${n}»`);
    case 'owner.browser.disabled': return tr(`ШІ вимкнено для браузера «${n}»`, `AI uitgezet voor browser «${n}»`);
    case 'ai_grant_added': return tr(`Дозвіл «${capNaam(d.capability, tr)}» для «${n}» до ${datum(Date.parse(s(d.expiresAt)))}`, `Toestemming "${capNaam(d.capability, tr)}" voor «${n}» tot ${datum(Date.parse(s(d.expiresAt)))}`);
    case 'ai_grant_always_enabled': return tr(`Дозвіл «${capNaam(d.capability, tr)}» «завжди» для «${n}» до ${datum(Date.parse(s(d.expiresAt)))}`, `Toestemming "${capNaam(d.capability, tr)}" "altijd" voor «${n}» tot ${datum(Date.parse(s(d.expiresAt)))}`);
    case 'ai_grant_expired': return tr(`Закінчився дозвіл «${capNaam(d.capability, tr)}» для «${n}»`, `Toestemming "${capNaam(d.capability, tr)}" voor «${n}» verlopen`);
    case 'ai_grants_revoked': return (e.onderwerp ? tr(`Забрано дозволів у «${n}»: ${s(d.count)}`, `Toestemmingen van «${n}» ingetrokken: ${s(d.count)}`) : tr(`Забрано дозволів: ${s(d.count)}`, `Toestemmingen ingetrokken: ${s(d.count)}`)) + reden(d.reason);
    case 'ai_capabilities_changed': return tr('Змінено загальні межі ШІ', 'Algemene grenzen van de AI gewijzigd');
    case 'ai_stop_all': return tr(`Стоп: забрано дозволів ${s(d.grants) || 0}, вимкнено браузерів ${s(d.agents) || 0}, відкликано MCP-доступів ${s(d.mcpTokens) || 0}`, `Stop: ${s(d.grants) || 0} toestemmingen ingetrokken, ${s(d.agents) || 0} browsers uitgezet, ${s(d.mcpTokens) || 0} MCP-toegangen ingetrokken`);
    case 'ai_user_blocked': return tr('Доступ ШІ заблоковано', 'AI-toegang geblokkeerd');
    case 'ai_user_unblocked': return tr('Доступ ШІ розблоковано', 'AI-toegang gedeblokkeerd');
    case 'owner.mcp.tool.setting': return tr(`Інструмент «${s(d.tool)}»: ${s(d.mode)}`, `Hulpmiddel «${s(d.tool)}»: ${s(d.mode)}`);
    case 'owner.mcp.tool.setting_all': return tr(`Усі інструменти (${s(d.group)}): ${s(d.mode)}`, `Alle hulpmiddelen (${s(d.group)}): ${s(d.mode)}`);
    // §13.10: rechten om updates goed te keuren / voor te bereiden — welke sleutel, waarom (reden), en «Це був не я».
    case 'goedkeur_recht_ingetrokken': return tr(`Відкликано право схвалювати оновлення в ключа «${s(d.label)}»`, `Recht om updates goed te keuren ingetrokken voor sleutel «${s(d.label)}»`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '');
    case 'goedkeur_passkey_verwijderd': return tr(`Видалено passkey «${s(d.label)}», що міг схвалювати оновлення`, `Passkey «${s(d.label)}» verwijderd die updates mocht goedkeuren`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '');
    case 'uitrol_passkey_intrekken_gevraagd': return tr('Серверу передано запит відкликати ключ', 'Verzoek om een sleutel in te trekken aan de server doorgegeven');
    case 'uitrol_voorbereider_gegeven': return tr(`Надано право готувати оновлення: «${s(d.label) || s(d.onderwerp)}»`, `Recht om updates voor te bereiden gegeven: «${s(d.label) || s(d.onderwerp)}»`);
    case 'uitrol_voorbereider_ingetrokken': return tr(`Відкликано право готувати оновлення: «${s(d.label) || s(d.onderwerp)}»`, `Recht om updates voor te bereiden ingetrokken: «${s(d.label) || s(d.onderwerp)}»`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '');
    // §13.11 toegangscodes voor anderen en gastsessies
    case 'toegangscode_aangemaakt': return tr(`Створено код доступу «${s(d.naam)}»`, `Toegangscode «${s(d.naam)}» aangemaakt`);
    case 'toegangscode_ingewisseld': return tr(`Код доступу «${s(d.naam)}» використано для гостьового входу`, `Toegangscode «${s(d.naam)}» gebruikt voor gasttoegang`) + (Number(d.gebruik) > 0 ? tr(` (${Number(d.gebruik)}-й раз)`, ` (${Number(d.gebruik)}e keer)`) : '');
    case 'toegangscode_gewijzigd': return tr(`Змінено строк коду доступу «${s(d.naam)}»${d.verlenging ? ' (продовжено)' : ' (скорочено)'}`, `Looptijd van toegangscode «${s(d.naam)}» gewijzigd${d.verlenging ? ' (verlengd)' : ' (ingekort)'}`);
    case 'toegangscode_ingetrokken': return tr(`Відкликано код доступу «${s(d.naam)}»`, `Toegangscode «${s(d.naam)}» ingetrokken`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '') + (Number(d.sessies) > 0 ? tr(`; завершено гостьових сесій: ${Number(d.sessies)}`, `; gastsessies beëindigd: ${Number(d.sessies)}`) : '');
    case 'gast_sessie_ingetrokken': return tr(`Завершено гостьових сесій: ${Number(d.aantal) || 1}`, `Gastsessies beëindigd: ${Number(d.aantal) || 1}`);
    case 'gast_actie': return tr(`Гість за кодом «${s(d.naam)}» переглянув: ${GAST_SCOPE[s(d.scope)]?.[0] || s(d.scope)}`, `Gast met code «${s(d.naam)}» bekeek: ${GAST_SCOPE[s(d.scope)]?.[1] || s(d.scope)}`);
    case 'gast_geweigerd': return tr(`Гостю за кодом «${s(d.naam)}» відмовлено: ${GAST_SCOPE[s(d.wat)]?.[0] || s(d.wat)}`, `Gast met code «${s(d.naam)}» geweigerd: ${GAST_SCOPE[s(d.wat)]?.[1] || s(d.wat)}`);
    case 'toegang_wijziging_ongedaan': return tr(`«Це був не я»: зміну скасовано (${s(d.recht) === 'behouden' ? 'право збережено' : s(d.recht) === 'ssh-nodig' ? 'право — лише через SSH' : 'право не відновлено'})`, `«Dit was ik niet»: wijziging teruggedraaid (${s(d.recht) === 'behouden' ? 'recht behouden' : s(d.recht) === 'ssh-nodig' ? 'recht alleen via SSH' : 'recht niet teruggezet'})`);
    default: return e.actie;
  }
}
/** Eén werksessie van een AI: «Claude працював: 12 дій — 6 читань файлів чи тек · 3 перевірки стану». */
function sessieTitel(r: WerkSessie<JournaalItem>, tr: Tr): string {
  const taal = tr('uk', 'nl') as 'uk' | 'nl';
  const naam = r.items[0]?.onderwerp?.naam || r.klant || '—';
  const n = r.items.length;
  const kop = tr(`«${naam}» працював: ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'дія' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дії' : 'дій'}`, `«${naam}» werkte: ${n} ${n === 1 ? 'actie' : 'acties'}`);
  const delen = r.tellingen.slice(0, 4).map((t) => telling(t.aantal, t.soort, taal));
  const rest = r.tellingen.length > 4 ? tr(` та ще ${r.tellingen.length - 4} види`, ` en nog ${r.tellingen.length - 4} soorten`) : '';
  return `${kop} — ${delen.join(' · ')}${rest}${r.mislukt ? tr(` · невдалих: ${r.mislukt}`, ` · mislukt: ${r.mislukt}`) : ''}`;
}
const tijdKort = (ms: number) => { try { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(11, 16); } };

const toon = (e: JournaalItem) => (/revoked|stop_all|blocked|expired|disabled|denied|ingetrokken|verwijderd/.test(e.actie) ? 'bad' : /paired|connected|issued|enabled|added|approved|updated/.test(e.actie) ? 'ok' : 'info');

/** Etap E: context van de regel (details._ctx, onder de hashketen). */
const ctxVan = (e: JournaalItem): { profiel?: string; namens?: string; ruimte?: string } => { const c = (e.details as Record<string, unknown>)._ctx; return c && typeof c === 'object' ? c as { profiel?: string; namens?: string; ruimte?: string } : {}; };

export function JournaalLijst({ tr, items, compact = false }: { tr: Tr; items: JournaalItem[]; compact?: boolean }) {
  const [open, setOpen] = useState('');
  const regels = useMemo(() => groepeerWerk(items), [items]);
  if (!items.length) return <p className='ag-leeg'>{tr('Поки що подій немає.', 'Nog geen gebeurtenissen.')}</p>;
  const taal = tr('uk', 'nl') as 'uk' | 'nl';
  return (
    <ul className={`ag-lijst ag-journaal${compact ? ' is-compact' : ''}`} data-journaal={items.length}>
      {regels.map((r) => r.soort === 'sessie' && r.items.length > 1 ? (
        <Rij key={r.id} id={r.id} open={open === r.id} onToggle={() => setOpen(open === r.id ? '' : r.id)} data={{ actie: 'werksessie', soort: 'werk', toon: r.mislukt ? 'bad' : 'info', acties: String(r.items.length) }}
          logo={<span className='ag-journaal-icoon ag-info'><Bot /></span>}
          titel={sessieTitel(r, tr)}
          status={<><span className='ag-chip' title={tr('Підключення ШІ, від імені якого виконано дії', 'AI-verbinding namens welke de acties liepen')}>{r.items[0]?.onderwerp?.naam || r.klant}</span><time className='ag-tijd' dateTime={new Date(r.tot).toISOString()} title={`${exact(r.van)} — ${exact(r.tot)}`}>{tijdKort(r.van)}–{tijdKort(r.tot)}</time></>}>
          <ol className='ag-werkstappen' aria-label={tr('Дії по черзі', 'Acties op volgorde')}>
            {r.stappen.map(({ item, keer }) => (
              <li key={item.id} className={item.resultaat === 'failure' ? 'is-mislukt' : ''} data-tool={s(item.details.tool)}>
                <span className='ag-werkstap-icoon' aria-hidden='true'>{ACTIE_ICOON[soortVan(item.details)]}</span>
                <span className='ag-werkstap-tekst'>{actieZin(s(item.details.tool), s(item.details.doel) || undefined, taal)}{keer > 1 ? <b className='ag-werkstap-keer'> ×{keer}</b> : null}{item.resultaat === 'failure' ? <em className='ag-werkstap-fout'>{tr(' — не вдалося', ' — mislukt')}</em> : null}</span>
                <time className='ag-tijd' dateTime={new Date(item.at).toISOString()} title={exact(item.at)}>{tijdKort(item.at)}</time>
              </li>
            ))}
          </ol>
          <Tech rijen={[
            [tr('Підключення ШІ', 'AI-verbinding'), <><code>{s(r.items[0]?.details.grantId) || '—'}</code>{r.klant ? ` · ${r.klant}` : ''}</>],
            [tr('Проміжок', 'Periode'), `${exact(r.van)} — ${exact(r.tot)}`],
            [tr('Записів журналу', 'Logregels'), String(r.items.length)],
          ]} />
        </Rij>
      ) : (() => { const e = r.soort === 'sessie' ? r.items[0] : r.item; return (
        <Rij key={e.id} id={e.id} open={open === e.id} onToggle={() => setOpen(open === e.id ? '' : e.id)} data={{ actie: e.actie, soort: e.soort, toon: toon(e) }}
          logo={<span className={`ag-journaal-icoon ag-${toon(e)}`}>{e.actie === 'owner.mcp.tool' ? ACTIE_ICOON[soortVan(e.details)] : ICOON[e.soort] ?? <Monitor />}</span>}
          titel={zin(e, tr)}
          status={<>{ctxVan(e).profiel ? <span className='ag-chip ag-chip-tech' title={tr(`Дію виконано з технічного профілю ${ctxVan(e).profiel}`, `Actie vanuit technisch profiel ${ctxVan(e).profiel}`)} data-journaal-ctx='profiel'>{tr('ТЕХ', 'TECH')}</span> : null}{ctxVan(e).namens ? <span className='ag-chip ag-chip-namens' title={tr('Переглянуто від імені користувача (підтримка за згодою)', 'Bekeken namens de gebruiker (ondersteuning met toestemming)')} data-journaal-ctx='namens'>{tr('від імені', 'namens')}</span> : null}{e.onderwerp ? <span className='ag-chip'>{e.onderwerp.naam || e.onderwerp.id.slice(0, 8)}</span> : null}<Tijd ms={e.at} tr={tr} /></>}>
          <Tech rijen={[
            [tr('Подія', 'Gebeurtenis'), <code>{e.actie}</code>],
            [tr('Час', 'Tijd'), exact(e.at)],
            [tr('Результат', 'Resultaat'), e.resultaat || '—'],
            e.onderwerp ? [tr('Об’єкт', 'Onderwerp'), <><code>{e.onderwerp.id}</code> · {e.onderwerp.soort}{e.onderwerp.platform ? ` · ${e.onderwerp.platform}` : ''}</>] : null,
            e.ipHash ? [tr('IP (хеш)', 'IP (hash)'), <code>{e.ipHash}</code>] : null,
            e.apparaat ? [tr('Пристрій входу', 'Apparaat van aanmelding'), e.apparaat] : null,
            e.dienst ? [tr('Сервіс', 'Dienst'), e.dienst] : null,
            ctxVan(e).profiel ? [tr('Технічний профіль', 'Technisch profiel'), <code>{ctxVan(e).profiel}</code>] : null,
            ctxVan(e).namens ? [tr('Від імені (запит підтримки)', 'Namens (ondersteuningsverzoek)'), <code>{ctxVan(e).namens}</code>] : null,
            ctxVan(e).ruimte ? [tr('Простір', 'Werkruimte'), <code>{ctxVan(e).ruimte}</code>] : null,
            [tr('Запис журналу', 'Logregel'), <code>{e.id}</code>],
          ]} />
          {Object.keys(e.details).length ? <pre className='ag-ruw' aria-label={tr('Технічні дані', 'Technische gegevens')}>{JSON.stringify(e.details, null, 2)}</pre> : null}
        </Rij>
      ); })())}
    </ul>
  );
}

export default function Journaal({ tr, onderwerpen, versie, actief }: { tr: Tr; onderwerpen: Array<{ id: string; naam: string; groep: string }>; versie: number; actief: boolean }) {
  const [soort, setSoort] = useState('');
  const [onderwerp, setOnderwerp] = useState('');
  const filter = useMemo(() => ({ soort, onderwerp }), [soort, onderwerp]);
  const j = useJournaal(filter, actief, versie);
  const groepen = [...new Set(onderwerpen.map((o) => o.groep))];
  return (
    <div className='ag-journaal-wrap ag-tab' data-tab-inhoud='journaal'>
      <div className='ag-werkbalk' role='group' aria-label={tr('Фільтри журналу', 'Filters van het logboek')}>
        <label className='ag-veld'><span>{tr('Тип', 'Soort')}</span>
          <select value={soort} onChange={(e) => setSoort(e.target.value)} data-filter='soort'>{SOORTEN.map(([id, uk, nl]) => <option key={id} value={id}>{tr(uk, nl)}</option>)}</select>
        </label>
        <label className='ag-veld'><span>{tr('Агент або пристрій', 'Agent of apparaat')}</span>
          <select value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} data-filter='onderwerp'>
            <option value=''>{tr('Усі', 'Alle')}</option>
            {groepen.map((g) => <optgroup key={g} label={g}>{onderwerpen.filter((o) => o.groep === g).map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}</optgroup>)}
          </select>
        </label>
        <small className='hub-meta ag-werkbalk-info'>{tr('Час — відносний; точний час із часовим поясом — при наведенні.', 'Relatieve tijd; de exacte tijd met tijdzone bij aanwijzen.')}</small>
      </div>
      {j.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(j.fout, tr, ['Не вдалося завантажити журнал', 'Logboek laden mislukt'])}</p> : null}
      {j.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : <JournaalLijst tr={tr} items={j.items} />}
      {j.volgende ? <div className='ag-meer'><Knop bezig={j.bezig} onClick={() => void j.laad(j.volgende ?? undefined)}>{tr('Показати старіші', 'Oudere tonen')}</Knop></div> : null}
    </div>
  );
}
