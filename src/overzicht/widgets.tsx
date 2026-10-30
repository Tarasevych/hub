import { useEffect, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Clock3, Inbox, Pause, Play, Rocket, ShieldCheck, TriangleAlert, UserPlus, Users, XCircle } from 'lucide-react';
import { TermList } from '../beheer-termen';
import { tabSlug } from '../canoniek-dienst';
import type { WidgetId } from '../../shared/overzicht-widgets';
import { Donut, Gebied, getal, Spark, Staven } from './grafieken';
import { haalMomenten } from './api';
import type { Bron, Context, Gebeurtenis, Lang, MomentPunt, Overzicht, Punt } from './types';
import { tr } from './types';

export type WidgetCtx = {
  o: Overzicht; lang: Lang; bron: Bron; codes: boolean; nu: number;
  openGebruiker: (id: string) => void;
  pauze: boolean; zetPauze: (v: boolean) => void;
  context?: Context;
};

// ---------------------------------------------------------------------------------------------------------------- kleine delen
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const initialen = (n: string) => n.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || '?';

export function Avatar({ id, naam, foto, grootte = 28 }: { id: string; naam: string; foto?: string; grootte?: number }) {
  const [stuk, setStuk] = useState(false);
  const stijl = { width: grootte, height: grootte, fontSize: Math.round(grootte * 0.4) };
  if (foto && !stuk) return <img className="ov-avatar" style={stijl} src={foto} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setStuk(true)} />;
  return <span className="ov-avatar ov-avatar-letters" style={{ ...stijl, background: `hsl(${hue(id || naam)} 45% 32%)` }} aria-hidden="true">{initialen(naam)}</span>;
}

export function Geleden({ t, nu, lang }: { t: number; nu: number; lang: Lang }) {
  const sec = Math.max(0, Math.round((nu - t) / 1000));
  const rtf = new Intl.RelativeTimeFormat(lang === 'uk' ? 'uk' : 'nl', { numeric: 'auto', style: 'short' });
  const tekst = sec < 45 ? tr(lang, 'щойно', 'zojuist') : sec < 3600 ? rtf.format(-Math.round(sec / 60), 'minute') : sec < 86400 ? rtf.format(-Math.round(sec / 3600), 'hour') : rtf.format(-Math.round(sec / 86400), 'day');
  return <time dateTime={new Date(t).toISOString()} title={new Date(t).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE')}>{tekst}</time>;
}

const VAL: Record<string, string> = { access: 'toegang', updates: 'updates', diagnostics: 'diagnostiek', audit: 'audit' };
/** Adres van een beheertabblad via de gedeelde routetabel van de site (met een veilige terugval). */
export const padVan = (tab: string): string => { try { const s = tabSlug(tab); if (typeof s === 'string' && s) return `/${s}`; } catch { /* terugval */ } return `/${VAL[tab] ?? tab}`; };
const Leeg = ({ children }: { children: ReactNode }) => <p className="ov-leeg">{children}</p>;
const Groot = ({ waarde, eenheid, kleur }: { waarde: ReactNode; eenheid?: ReactNode; kleur?: 'bad' | 'ok' }) => (
  <div className={`ov-groot${kleur ? ` ov-groot-${kleur}` : ''}`}><strong>{waarde}</strong>{eenheid && <span>{eenheid}</span>}</div>
);

function Gebruikerknop({ g, ctx, children }: { g: { id: string; naam: string }; ctx: WidgetCtx; children: ReactNode }) {
  if (!g.id) return <span>{children}</span>;
  return <button type="button" className="ov-wie" onClick={() => ctx.openGebruiker(g.id)} title={tr(ctx.lang, 'Відкрити картку користувача', 'Gebruikerskaart openen')}>{children}</button>;
}

// ---------------------------------------------------------------------------------------------------------------- widgets
function Online({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  return (
    <>
      <Groot waarde={getal(lang, o.kpi.online)} eenheid={tr(lang, 'за останні 5 хв', 'laatste 5 min')} />
      {o.online.length === 0 ? <Leeg>{tr(lang, 'Зараз немає активних користувачів.', 'Op dit moment zijn er geen actieve gebruikers.')}</Leeg> : (
        <ul className="ov-lijst">
          {o.online.slice(0, 6).map((u) => (
            <li key={u.id}>
              <Gebruikerknop g={u} ctx={ctx}><Avatar id={u.id} naam={u.naam} foto={u.foto} /><span className="ov-wie-naam">{u.naam}</span></Gebruikerknop>
              <small>{tr(lang, u.dienstNaam.uk, u.dienstNaam.nl)}{u.apparaat ? ` · ${u.apparaat}` : ''} · <Geleden t={u.laatst} nu={ctx.nu} lang={lang} /></small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Sessies({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  return (
    <>
      <Groot waarde={getal(lang, o.kpi.actieveSessies)} eenheid={`${getal(lang, o.kpi.apparaten)} ${tr(lang, 'пристроїв', 'apparaten')}`} />
      <Staven lang={lang} rijen={o.sessiesPerDienst.map((s) => ({ sleutel: s.dienst, naam: tr(lang, s.uk, s.nl), n: s.n }))} leeg={tr(lang, 'Відкритих сесій немає.', 'Geen open sessies.')} />
    </>
  );
}

function Gebruikers({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  return (
    <>
      <Groot waarde={getal(lang, o.kpi.gebruikers)} eenheid={tr(lang, 'облікових записів', 'accounts')} />
      <ul className="ov-chips">
        <li><UserPlus aria-hidden="true" /><b>{getal(lang, o.kpi.nieuw24)}</b> {tr(lang, 'нових за добу', 'nieuw in 24 u')}</li>
        <li><Clock3 aria-hidden="true" /><b>{getal(lang, o.kpi.nieuw7)}</b> {tr(lang, 'нових за тиждень', 'nieuw in 7 dagen')}</li>
        <li className={o.kpi.wachtGoedkeuring ? 'ov-chip-warn' : ''}><Inbox aria-hidden="true" /><b>{getal(lang, o.kpi.wachtGoedkeuring)}</b> {tr(lang, 'чекають схвалення', 'wachten op goedkeuring')}</li>
      </ul>
    </>
  );
}

function Activiteit({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  const [periode, setPeriode] = useState<'uur' | 'dag'>('uur');
  const punten = periode === 'uur' ? o.uren : o.dagen;
  const totaal = punten.reduce((a, p) => a + p.n, 0);
  return (
    <>
      <div className="ov-seg" role="group" aria-label={tr(lang, 'Період', 'Periode')}>
        <button type="button" aria-pressed={periode === 'uur'} onClick={() => setPeriode('uur')}>{tr(lang, '24 години', '24 uur')}</button>
        <button type="button" aria-pressed={periode === 'dag'} onClick={() => setPeriode('dag')}>{tr(lang, '14 днів', '14 dagen')}</button>
        <span className="ov-seg-info">{getal(lang, o.kpi.events1u)} {tr(lang, 'за останню годину', 'in het laatste uur')}</span>
      </div>
      {totaal === 0
        ? <Leeg>{tr(lang, 'Даних поки немає: події з’являться тут, щойно хтось щось зробить на сайті.', 'Nog geen gegevens: gebeurtenissen verschijnen hier zodra iemand iets doet op de site.')}</Leeg>
        : <Gebied punten={punten} lang={lang} stap={periode} naamN={tr(lang, 'Події', 'Gebeurtenissen')} naamF={tr(lang, 'Збої', 'Storingen')} />}
    </>
  );
}

function Fouten({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  return (
    <>
      <Groot waarde={getal(lang, o.kpi.fouten24)} kleur={o.kpi.fouten24 ? 'bad' : 'ok'} eenheid={`${o.kpi.foutenPct}% ${tr(lang, 'від усіх подій за добу', 'van alle gebeurtenissen in 24 u')}`} />
      <Spark punten={o.uren.map((p) => p.f)} kleur="var(--ov-bad)" label={tr(lang, 'Збої за годинами', 'Storingen per uur')} />
      {o.beperkt ? <Leeg>{tr(lang, 'Список збоїв доступний із правом читання журналу.', 'De lijst met storingen vereist het recht om het logboek te lezen.')}</Leeg>
        : o.fouten.length === 0 ? <Leeg><CheckCircle2 aria-hidden="true" /> {tr(lang, 'Збоїв за останні події немає.', 'Geen storingen in de laatste gebeurtenissen.')}</Leeg> : (
          <ul className="ov-lijst">
            {o.fouten.slice(0, 5).map((e) => (
              <li key={e.id}>
                <Gebruikerknop g={{ id: e.gebruikerId, naam: e.naam }} ctx={ctx}><TriangleAlert className="ov-bad-ic" aria-hidden="true" /><span className="ov-wie-naam">{tr(lang, e.label.uk, e.label.nl)}</span></Gebruikerknop>
                <small>{e.naam} · <Geleden t={e.t} nu={ctx.nu} lang={lang} /></small>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

function Apparaten({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  const a = o.apparaten;
  return (
    <>
      <Donut lang={lang} delen={a.types} midden={getal(lang, o.kpi.apparaten)} leeg={tr(lang, 'Немає даних про пристрої активних сесій.', 'Geen apparaatgegevens van actieve sessies.')} />
      {(a.os.length > 0 || a.browsers.length > 0) && (
        <div className="ov-tweekol">
          <div><h4>{tr(lang, 'Системи', 'Systemen')}</h4><Staven lang={lang} rijen={a.os} kleur="var(--ov-s3)" leeg="—" /></div>
          <div><h4>{tr(lang, 'Браузери', 'Browsers')}</h4><Staven lang={lang} rijen={a.browsers} kleur="var(--ov-s2)" leeg="—" /></div>
        </div>
      )}
    </>
  );
}

const STAND_IC: Record<string, ReactNode> = { ok: <CheckCircle2 className="ov-ok-ic" aria-hidden="true" />, 'let-op': <AlertTriangle className="ov-warn-ic" aria-hidden="true" />, fout: <XCircle className="ov-bad-ic" aria-hidden="true" />, onbekend: <CircleDashed aria-hidden="true" /> };
const STAND_TXT = (lang: Lang, s: string) => ({ ok: tr(lang, 'Працює', 'In orde'), 'let-op': tr(lang, 'Увага', 'Let op'), fout: tr(lang, 'Збій', 'Storing'), onbekend: tr(lang, 'Невідомо', 'Onbekend') } as Record<string, string>)[s] ?? s;
const CONTROLE_NAAM: Record<string, [string, string]> = {
  database: ['База даних', 'Database'], schema: ['Міграції бази', 'Database-updates'], 'mcp-deur': ['Двері MCP', 'MCP-deur'], 'mail-onderhoud': ['Синхронізація пошти', 'Mailsynchronisatie'],
  schijf: ['Диск сервера', 'Serverschijf'], servertijd: ['Годинник сервера', 'Serverklok'],
};
function Diensten({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  const d = o.diensten;
  if (!d.lijst.length) return <Leeg>{tr(lang, 'Результатів серверних перевірок поки немає.', 'Nog geen uitslagen van servercontroles.')}</Leeg>;
  const probleem = d.lijst.filter((x) => x.stand !== 'ok');
  return (
    <>
      <ul className="ov-chips">
        <li><CheckCircle2 className="ov-ok-ic" aria-hidden="true" /><b>{d.ok}</b> {tr(lang, 'працює', 'in orde')}</li>
        <li className={d.letop ? 'ov-chip-warn' : ''}><AlertTriangle className="ov-warn-ic" aria-hidden="true" /><b>{d.letop}</b> {tr(lang, 'увага', 'let op')}</li>
        <li className={d.fout ? 'ov-chip-bad' : ''}><XCircle className="ov-bad-ic" aria-hidden="true" /><b>{d.fout}</b> {tr(lang, 'збій', 'storing')}</li>
      </ul>
      {probleem.length > 0 && (
        <ul className="ov-lijst">{probleem.slice(0, 4).map((x) => (
          <li key={x.id}><span className="ov-wie-naam">{STAND_IC[x.stand]}{CONTROLE_NAAM[x.id] ? tr(lang, CONTROLE_NAAM[x.id][0], CONTROLE_NAAM[x.id][1]) : x.id}</span><small>{STAND_TXT(lang, x.stand)}{x.ms !== undefined ? ` · ${x.ms} ms` : ''}</small></li>
        ))}</ul>
      )}
      <a className="ov-link" href={padVan('diagnostics')}>{tr(lang, 'Відкрити діагностику', 'Diagnostiek openen')} →</a>
    </>
  );
}

const RUN_IC: Record<string, ReactNode> = { klaar: <CheckCircle2 className="ov-ok-ic" aria-hidden="true" />, bezig: <Activity className="ov-info-ic" aria-hidden="true" />, mislukt: <XCircle className="ov-bad-ic" aria-hidden="true" />, geweigerd: <XCircle className="ov-bad-ic" aria-hidden="true" />, afgebroken: <AlertTriangle className="ov-warn-ic" aria-hidden="true" /> };
const RUN_TXT = (lang: Lang, s: string) => ({ klaar: tr(lang, 'Готово', 'Klaar'), bezig: tr(lang, 'Виконується', 'Bezig'), mislukt: tr(lang, 'Невдало', 'Mislukt'), geweigerd: tr(lang, 'Відхилено', 'Geweigerd'), afgebroken: tr(lang, 'Перервано', 'Afgebroken') } as Record<string, string>)[s] ?? s;
function Uitrol({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  return (
    <>
      {o.uitrol.wacht > 0 && <a className="ov-banner" href={padVan('updates')}><Rocket aria-hidden="true" /> {getal(lang, o.uitrol.wacht)} {tr(lang, 'оновлення чекає вашого схвалення', 'update(s) wachten op uw goedkeuring')} →</a>}
      {o.uitrol.runs.length === 0 ? <Leeg>{tr(lang, 'Розгортань ще не було.', 'Er zijn nog geen uitrol-runs.')}</Leeg> : (
        <ul className="ov-lijst">
          {o.uitrol.runs.map((r) => (
            <li key={r.id}>
              <span className="ov-wie-naam">{RUN_IC[r.staat] ?? null}<span className="ov-mono">{r.versie || r.id.slice(0, 8)}</span></span>
              <small>{RUN_TXT(lang, r.staat)}{r.wie ? ` · ${r.wie}` : ''} · <Geleden t={Date.parse(r.gestart) || 0} nu={ctx.nu} lang={lang} /></small>
              {r.samenvatting && <small className="ov-clip" title={r.samenvatting}>{r.samenvatting}</small>}
            </li>
          ))}
        </ul>
      )}
      <a className="ov-link" href={padVan('updates')}>{tr(lang, 'Уся історія', 'Volledige geschiedenis')} →</a>
    </>
  );
}

function Populariteit({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  const [soort, setSoort] = useState<'secties' | 'acties'>('secties');
  const rijen = o.populariteit[soort].map((r) => ({ sleutel: r.sleutel, naam: tr(lang, r.uk, r.nl), n: r.n }));
  return (
    <>
      <div className="ov-seg" role="group" aria-label={tr(lang, 'Що рахувати', 'Wat tellen')}>
        <button type="button" aria-pressed={soort === 'secties'} onClick={() => setSoort('secties')}>{tr(lang, 'Сервіси', 'Diensten')}</button>
        <button type="button" aria-pressed={soort === 'acties'} onClick={() => setSoort('acties')}>{tr(lang, 'Дії', 'Acties')}</button>
        <span className="ov-seg-info">{tr(lang, '7 днів · лише кількість', '7 dagen · alleen aantallen')}</span>
      </div>
      <Staven lang={lang} rijen={rijen} leeg={tr(lang, 'Даних поки немає.', 'Nog geen gegevens.')} />
    </>
  );
}

function Stroom({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  return (
    <>
      <div className="ov-stroom-kop">
        <span className={`ov-live${ctx.pauze ? ' ov-live-uit' : ''}`}><i aria-hidden="true" />{ctx.pauze ? tr(lang, 'Пауза', 'Gepauzeerd') : tr(lang, 'Наживо · кожні 15 с', 'Live · elke 15 s')}</span>
        <button type="button" className="ov-link" onClick={() => ctx.zetPauze(!ctx.pauze)} aria-pressed={ctx.pauze}>{ctx.pauze ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{ctx.pauze ? tr(lang, 'Продовжити', 'Hervatten') : tr(lang, 'Пауза', 'Pauze')}</button>
      </div>
      {o.beperkt ? <Leeg>{tr(lang, 'Потік подій потребує права читання журналу.', 'De gebeurtenissenstroom vereist het recht om het logboek te lezen.')}</Leeg>
        : o.stroom.length === 0 ? <Leeg>{tr(lang, 'Подій поки немає.', 'Nog geen gebeurtenissen.')}</Leeg> : (
          <ul className="ov-stroom">
            {o.stroom.map((e: Gebeurtenis) => (
              <li key={e.id} className={e.mislukt ? 'ov-mislukt' : ''}>
                <Gebruikerknop g={{ id: e.gebruikerId, naam: e.naam }} ctx={ctx}><Avatar id={e.gebruikerId} naam={e.naam} foto={e.foto} grootte={26} /><span className="ov-wie-naam">{e.naam}</span></Gebruikerknop>
                <span className="ov-stroom-wat">{e.mislukt && <TriangleAlert className="ov-bad-ic" aria-label={tr(lang, 'Невдало', 'Mislukt')} />}{tr(lang, e.label.uk, e.label.nl)}<em>{tr(lang, e.sectieNaam.uk, e.sectieNaam.nl)}</em></span>
                <small><Geleden t={e.t} nu={ctx.nu} lang={lang} /></small>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

function Wachtrij({ ctx }: { ctx: WidgetCtx }) {
  const { o, lang } = ctx;
  const rijen: Array<{ n: number; uk: string; nl: string; href: string }> = [
    { n: o.wachtrij.toegang, uk: 'Запити на доступ', nl: 'Toegangsaanvragen', href: padVan('access') },
    { n: o.wachtrij.uitrol, uk: 'Оновлення чекають схвалення', nl: 'Updates wachten op goedkeuring', href: padVan('updates') },
    { n: o.wachtrij.gebruikers, uk: 'Нові акаунти без схвалення', nl: 'Nieuwe accounts zonder goedkeuring', href: padVan('access') },
  ];
  const totaal = rijen.reduce((a, r) => a + r.n, 0);
  if (!totaal) return <Leeg><CheckCircle2 className="ov-ok-ic" aria-hidden="true" /> {tr(lang, 'Нічого не чекає на ваше рішення.', 'Er wacht niets op uw beslissing.')}</Leeg>;
  return <ul className="ov-lijst">{rijen.filter((r) => r.n > 0).map((r) => <li key={r.href + r.uk}><a className="ov-wie" href={r.href}><b className="ov-teller">{r.n}</b><span className="ov-wie-naam">{tr(lang, r.uk, r.nl)}</span></a></li>)}</ul>;
}

function Gezag({ ctx }: { ctx: WidgetCtx }) {
  const { bron, lang, codes } = ctx;
  return (
    <>
      <p className="ov-gezag"><ShieldCheck aria-hidden="true" /> <TermList lang={lang} values={bron.capabilities} codes={codes} /></p>
      <small className="ov-klein">{tr(lang, 'Робочий контур повноважень — admin.tarasevych.com. Технічний хост дозволений лише для ізольованої перевірочної сесії.', 'Productiebevoegdheid: admin.tarasevych.com. De technische host is alleen toegestaan voor een geïsoleerde QA-sessie.')}</small>
      {bron.limitations.map((l) => { const t = typeof l === 'string' ? l : (lang === 'uk' ? l.uk : l.nl); return <p className="admin-limitation" key={t}>{t}</p>; })}
    </>
  );
}

// ---- momentopnamen (tellers per uur/dag, 90 dagen bewaard): trend van één gekozen teller
type Teller = 'online' | 'actieveSessies' | 'gebruikers' | 'events24' | 'fouten24' | 't404' | 't401';
const TELLERS: Array<{ id: Teller; uk: string; nl: string }> = [
  { id: 'online', uk: 'Онлайн', nl: 'Online' }, { id: 'actieveSessies', uk: 'Сесії', nl: 'Sessies' }, { id: 'gebruikers', uk: 'Користувачі', nl: 'Gebruikers' },
  { id: 'events24', uk: 'Події за добу', nl: 'Gebeurtenissen/24u' }, { id: 'fouten24', uk: 'Збої за добу', nl: 'Storingen/24u' },
  { id: 't404', uk: '«Не знайдено» (404)', nl: '«Niet gevonden» (404)' }, { id: 't401', uk: '«Заборонено» (401/403)', nl: '«Geweigerd» (401/403)' },
];
// Toegangsfouten per routegroep (backend/toegangsfout-tellers.ts): leesbare namen, geen jargon.
const GROEP_NAAM: Record<string, [string, string]> = {
  'tech-bundels': ['Файли технічних сторінок', 'Bestanden van technische pagina’s'], 'tech-api': ['Технічний простір (запити)', 'Technische ruimte (verzoeken)'],
  'beheer-api': ['Керування сайтом (запити)', 'Sitebeheer (verzoeken)'], api: ['Інші запити сайту', 'Overige verzoeken van de site'],
  paginas: ['Сторінки', 'Pagina’s'], 'tech-melding': ['Повідомлення «Технічні модулі не завантажено»', 'Meldingen «Technische onderdelen niet geladen»'],
};
type GroepTelling = { n404: number; n401: number; n403: number };
type ToegangLive = { ditUur: Record<string, GroepTelling>; laatste24: Record<string, GroepTelling>; sindsStart: string };
function ToegangsFouten({ lang, live }: { lang: Lang; live?: ToegangLive }) {
  if (!live) return null;
  const rijen = Object.entries(live.laatste24).map(([g, t]) => ({ g, n404: t.n404, n401: t.n401 + t.n403, uur: (live.ditUur[g]?.n404 || 0) + (live.ditUur[g]?.n401 || 0) + (live.ditUur[g]?.n403 || 0) }));
  const alarm = (live.laatste24['tech-melding']?.n404 || 0) > 0 || (live.ditUur['tech-bundels']?.n404 || 0) >= 20;
  return <div className="ov-toegang" data-toegangsfouten={alarm ? 'alarm' : 'rustig'}>
    <p className={alarm ? 'ov-groot-bad' : undefined}><b>{tr(lang, 'Помилки доступу за 24 години', 'Toegangsfouten in 24 uur')}</b>{alarm ? ` — ${tr(lang, 'технічні сторінки не завантажуються, перевірте!', 'technische pagina’s laden niet, kijk na!')}` : ''}</p>
    <table className="ov-tabel"><thead><tr><th>{tr(lang, 'Де', 'Waar')}</th><th>404</th><th>401/403</th><th>{tr(lang, 'ця година', 'dit uur')}</th></tr></thead>
      <tbody>{rijen.map((r) => <tr key={r.g}><td>{tr(lang, ...(GROEP_NAAM[r.g] || [r.g, r.g]))}</td><td>{getal(lang, r.n404)}</td><td>{getal(lang, r.n401)}</td><td>{getal(lang, r.uur)}</td></tr>)}</tbody></table>
    <small>{tr(lang, 'Рахуються лише кількості, без адрес і людей. Після перезапуску служби лічба починається знову з ', 'Alleen aantallen, zonder adressen of personen. Na een herstart van de dienst begint het tellen opnieuw vanaf ')}{new Date(live.sindsStart).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE')}.</small>
  </div>;
}
function Momenten({ ctx }: { ctx: WidgetCtx }) {
  const { lang } = ctx;
  const [data, setData] = useState<{ uur: MomentPunt[]; dag: MomentPunt[]; toegangLive?: ToegangLive } | null>(null);
  const [fout, setFout] = useState(false);
  const [periode, setPeriode] = useState<'uur' | 'dag'>('dag');
  const [teller, setTeller] = useState<Teller>('online');
  useEffect(() => {
    let weg = false; const c = ctx.context;
    if (!c) return;
    const laad = () => { if (document.hidden) return; haalMomenten(c).then((d) => { if (!weg) { setData(d); setFout(false); } }).catch(() => { if (!weg) setFout(true); }); };
    laad();
    const iv = window.setInterval(laad, 300_000);
    return () => { weg = true; window.clearInterval(iv); };
  }, [ctx.context?.tabContext]);
  const reeks = data ? data[periode] : [];
  // Uur-opnamen van de toegangsfouten bevatten het VORIGE volle uur: één uur terugschuiven.
  const punten: Punt[] = reeks.map((p) => ({ t: (teller === 't404' || teller === 't401') && periode === 'uur' ? p.t - 3_600_000 : p.t, n: p.d[teller] ?? 0, f: 0 }));
  const laatste = reeks[reeks.length - 1]?.d[teller];
  return (
    <>
      <div className="ov-seg" role="group" aria-label={tr(lang, 'Період', 'Periode')}>
        <button type="button" aria-pressed={periode === 'dag'} onClick={() => setPeriode('dag')}>{tr(lang, '90 днів', '90 dagen')}</button>
        <button type="button" aria-pressed={periode === 'uur'} onClick={() => setPeriode('uur')}>{tr(lang, '48 годин', '48 uur')}</button>
        <span className="ov-seg-info">{laatste !== undefined ? `${getal(lang, laatste)} ${tr(lang, 'востаннє', 'laatst')}` : ''}</span>
      </div>
      <div className="ov-seg" role="group" aria-label={tr(lang, 'Лічильник', 'Teller')}>
        {TELLERS.map((t) => <button key={t.id} type="button" aria-pressed={teller === t.id} onClick={() => setTeller(t.id)}>{tr(lang, t.uk, t.nl)}</button>)}
      </div>
      {fout ? <Leeg>{tr(lang, 'Знімки тимчасово недоступні.', 'Momentopnamen zijn tijdelijk niet beschikbaar.')}</Leeg>
        : !data ? <Leeg>{tr(lang, 'Завантаження…', 'Laden…')}</Leeg>
        : punten.length < 2 ? <Leeg>{tr(lang, 'Знімки щойно почали збиратися: тренд з’явиться після кількох годин. Зберігається лише кількість, без імен.', 'De momentopnamen worden net verzameld: de trend verschijnt na enkele uren. Alleen aantallen, geen namen.')}</Leeg>
        : <Gebied punten={punten} lang={lang} stap={periode} naamN={tr(lang, TELLERS.find((t) => t.id === teller)!.uk, TELLERS.find((t) => t.id === teller)!.nl)} meting />}
      {(teller === 't404' || teller === 't401') && <ToegangsFouten lang={lang} live={data?.toegangLive} />}
    </>
  );
}

const INHOUD: Record<WidgetId, (p: { ctx: WidgetCtx }) => ReactNode> = {
  online: Online, sessies: Sessies, gebruikers: Gebruikers, activiteit: Activiteit, fouten: Fouten, apparaten: Apparaten,
  diensten: Diensten, uitrol: Uitrol, populariteit: Populariteit, stroom: Stroom, wachtrij: Wachtrij, gezag: Gezag, momenten: Momenten,
};
export const WIDGET_ICOON: Record<WidgetId, ReactNode> = {
  online: <Users aria-hidden="true" />, sessies: <Activity aria-hidden="true" />, gebruikers: <UserPlus aria-hidden="true" />, activiteit: <Activity aria-hidden="true" />, fouten: <TriangleAlert aria-hidden="true" />,
  apparaten: <Users aria-hidden="true" />, diensten: <CheckCircle2 aria-hidden="true" />, uitrol: <Rocket aria-hidden="true" />, populariteit: <Activity aria-hidden="true" />, stroom: <Activity aria-hidden="true" />,
  wachtrij: <Inbox aria-hidden="true" />, gezag: <ShieldCheck aria-hidden="true" />, momenten: <Clock3 aria-hidden="true" />,
};

export function WidgetInhoud({ id, ctx }: { id: WidgetId; ctx: WidgetCtx }) {
  const C = INHOUD[id];
  return <C ctx={ctx} />;
}
