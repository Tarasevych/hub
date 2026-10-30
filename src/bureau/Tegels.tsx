// Inhoud van de tegels op het bureaublad. Elke tegel leest ECHTE gegevens van een route die de hub mag aanroepen
// (zie src/bureau/gegevens.ts). Lukt dat niet, dan staat er wat er mis is — nooit een nagemaakt lijstje.
import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, CheckSquare, FolderOpen, Mail, NotebookPen, Activity, ExternalLink } from 'lucide-react';
import { haalBord, haalDiensten, loadHubBlockData, readHubBlockDataCache, type Bord, type HubBlockDataPayload } from './gegevens';
import { HUB_ETIKET, VAST_ETIKET, lijstAf, lijstUitTekst, ordenNotities, vormUitEtiketten } from '../../shared/notities-model';
import { bureauTekst, bureauWidget, type BureauWidgetId } from '../../shared/bureau-indeling';
import type { TabelRij } from '../../shared/diagnostiek-account';

export type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const locale = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-NL');
const stip = (lang: Lang, ms: number) => (ms ? new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '');

const Leeg = ({ tekst }: { tekst: string }) => <p className='bureau-tegel-leeg'>{tekst}</p>;
const Fout = ({ lang, code }: { lang: Lang; code: string }) => (
  <p className='bureau-tegel-fout' role='alert'><AlertCircle aria-hidden='true' />
    {/^(OWNER_|MCP_|ACCOUNT_)/.test(code) || /401|403/.test(code)
      ? tr(lang, 'Ці дані доступні лише після входу у ваш акаунт.', 'Deze gegevens zijn alleen beschikbaar na aanmelden in uw account.')
      : tr(lang, `Не вдалося завантажити дані (${code}).`, `Gegevens laden mislukt (${code}).`)}
  </p>
);

/** Eén lader per bron per tegel, met de cache uit gegevens.ts eronder. */
function useBron<T>(laad: () => Promise<T>, begin: T | null = null) {
  const [waarde, setWaarde] = useState<T | null>(begin);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(true);
  useEffect(() => {
    let actief = true;
    setBezig(true);
    laad().then((v) => { if (actief) { setWaarde(v); setFout(''); } })
      .catch((e: unknown) => { if (actief) setFout(String((e as Error)?.message || 'FOUT')); })
      .finally(() => { if (actief) setBezig(false); });
    return () => { actief = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { waarde, fout, bezig };
}

// ------------------------------------------------------------------ post / agenda / bestanden (hub/blocks/data)
function BlokBron({ lang, soort, widget, ownerUserId }: { lang: Lang; soort: 'mail' | 'files' | 'calendar'; widget: BureauWidgetId; ownerUserId: string }) {
  const { waarde, fout, bezig } = useBron<HubBlockDataPayload>(() => loadHubBlockData(ownerUserId), readHubBlockDataCache(ownerUserId));
  if (fout) return <Fout lang={lang} code={fout} />;
  const bron = waarde?.sources?.[soort];
  if (!bron) return <Leeg tekst={bezig ? tr(lang, 'Завантаження…', 'Laden…') : tr(lang, 'Дані цього джерела зараз недоступні.', 'Gegevens van deze bron zijn nu niet beschikbaar.')} />;
  if (bron.gekoppeld === false) {
    const waar = soort === 'calendar'
      ? tr(lang, 'Календар не підключено. Відкрийте вкладку «Календар» — там є магазин календарів.', 'De agenda is niet gekoppeld. Open het tabblad «Agenda» — daar staat de agendawinkel.')
      : soort === 'mail'
        ? tr(lang, 'Пошту не підключено. Відкрийте «Пошта» → «Акаунти».', 'E-mail is niet gekoppeld. Open «E-mail» → «Accounts».')
        : tr(lang, 'Диск не підключено. Відкрийте «Хмара» → «Акаунти».', 'Drive is niet gekoppeld. Open «Cloud» → «Accounts».');
    return <p className='bureau-tegel-leeg' data-bureau-niet-gekoppeld={soort}>{waar}</p>;
  }
  if (widget === 'post-tellers') {
    return (
      <div className='bureau-tellers'>
        <span><strong>{bron.total}{bron.bounded ? '+' : ''}</strong><small>{tr(lang, 'листів у проєкції', 'berichten in projectie')}</small></span>
        <span><strong>{Number(bron.unread || 0)}</strong><small>{tr(lang, 'непрочитаних', 'ongelezen')}</small></span>
      </div>
    );
  }
  const nu = Date.now();
  const items = widget === 'agenda-vandaag' ? bron.items.filter((i) => i.updatedAt >= nu && i.updatedAt <= nu + 86_400_000) : bron.items;
  if (!items.length) {
    return <Leeg tekst={widget === 'agenda-vandaag'
      ? tr(lang, 'Найближчої доби подій немає.', 'In de komende 24 uur staan er geen afspraken.')
      : soort === 'mail' ? tr(lang, 'У проєкції ще немає листів.', 'De projectie bevat nog geen berichten.')
        : soort === 'files' ? tr(lang, 'У проєкції ще немає файлів.', 'De projectie bevat nog geen bestanden.')
          : tr(lang, 'Майбутніх подій немає.', 'Er zijn geen aankomende afspraken.')} />;
  }
  return (
    <ul className='bureau-rijen'>
      {items.slice(0, 12).map((item) => (
        <li key={item.id}>
          {item.url ? <a href={item.url} target='_blank' rel='noreferrer'><span className='bureau-rij-titel'>{item.title}</span><ExternalLink aria-hidden='true' /></a>
            : <span className='bureau-rij-titel'>{item.title}</span>}
          {item.subtitle ? <small>{item.subtitle}</small> : null}
          {item.updatedAt ? <time dateTime={new Date(item.updatedAt).toISOString()}>{stip(lang, item.updatedAt)}</time> : null}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ taken en notities (bord)
const OPEN_STANDEN = ['backlog', 'doing', 'blocked'];
function BordTegel({ lang, widget }: { lang: Lang; widget: BureauWidgetId }) {
  const { waarde, fout, bezig } = useBron<Bord>(() => haalBord());
  if (fout) return <Fout lang={lang} code={fout} />;
  if (!waarde) return <Leeg tekst={bezig ? tr(lang, 'Завантаження…', 'Laden…') : '—'} />;
  if (widget === 'taken-tellers') {
    const tel = (s: string) => waarde.taken.filter((t) => t.status === s).length;
    return (
      <div className='bureau-tellers'>
        <span><strong>{tel('backlog')}</strong><small>{tr(lang, 'у черзі', 'in de wachtrij')}</small></span>
        <span><strong>{tel('doing')}</strong><small>{tr(lang, 'у роботі', 'in bewerking')}</small></span>
        <span><strong>{tel('blocked')}</strong><small>{tr(lang, 'заблоковано', 'geblokkeerd')}</small></span>
        <span><strong>{tel('done')}</strong><small>{tr(lang, 'готово', 'klaar')}</small></span>
      </div>
    );
  }
  if (widget === 'taken-volgende') {
    const open = waarde.taken.filter((t) => OPEN_STANDEN.includes(t.status)).slice(0, 12);
    if (!open.length) return <Leeg tekst={tr(lang, 'Відкритих завдань немає. Додайте завдання у вкладці «Завдання».', 'Er zijn geen open taken. Voeg een taak toe in het tabblad «Taken».')} />;
    return <ul className='bureau-rijen'>{open.map((t) => <li key={t.id}><span className='bureau-rij-titel'>{t.title}</span><small>{t.status}</small></li>)}</ul>;
  }
  const hub = ordenNotities(waarde.notities.filter((n) => (n.tags ?? []).includes(HUB_ETIKET)));
  const lijst = widget === 'notities-vast' ? hub.filter((n) => (n.tags ?? []).includes(VAST_ETIKET)) : hub;
  if (!lijst.length) {
    return <Leeg tekst={widget === 'notities-vast'
      ? tr(lang, 'Ви ще нічого не закріпили. Закріпити нотатку можна у вкладці «Нотатки».', 'U hebt nog niets vastgezet. Een notitie vastzetten kan in het tabblad «Notities».')
      : tr(lang, 'Нотаток ще немає. Додайте першу у вкладці «Нотатки».', 'Nog geen notities. Voeg de eerste toe in het tabblad «Notities».')} />;
  }
  return (
    <ul className='bureau-rijen'>
      {lijst.slice(0, 12).map((n) => {
        const vorm = vormUitEtiketten(n.title, n.body, n.tags);
        const regels = vorm.soort === 'lijst' ? lijstUitTekst(n.body) : [];
        return (
          <li key={n.id} data-bureau-notitie-soort={vorm.soort}>
            <span className='bureau-rij-titel'>{n.title}</span>
            <small>{vorm.soort === 'lijst' && regels.length ? `${lijstAf(regels)}/${regels.length}` : stip(lang, Date.parse(n.updatedAt || n.createdAt) || 0)}</small>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ stand van de eigen diensten
function DienstenTegel({ lang }: { lang: Lang }) {
  const { waarde, fout, bezig } = useBron<TabelRij[]>(() => haalDiensten());
  if (fout) return <Fout lang={lang} code={fout} />;
  if (!waarde) return <Leeg tekst={bezig ? tr(lang, 'Завантаження…', 'Laden…') : '—'} />;
  if (!waarde.length) return <Leeg tekst={tr(lang, 'Перевірок ще не було. Запустіть перевірку в «Налаштування» → «Акаунт».', 'Er zijn nog geen controles geweest. Start een controle bij «Instellingen» → «Account».')} />;
  return (
    <ul className='bureau-diensten'>
      {waarde.map((r) => (
        <li key={r.dienst} data-bureau-dienst-conclusie={r.conclusie}>
          <span className='bureau-rij-titel'>{bureauTekst(r.naam as unknown as readonly [string, string], lang)}</span>
          <small>{r.account ? r.account.stand : tr(lang, 'ще не перевіряли', 'nog niet gecontroleerd')}</small>
        </li>
      ))}
    </ul>
  );
}

export const TEGEL_ICOON = { post: Mail, agenda: CalendarDays, bestanden: FolderOpen, taken: CheckSquare, notities: NotebookPen, diensten: Activity } as const;

/** De inhoud van één tegel. Alleen tegels met stand 'klaar' komen hier: de rest ligt nooit op het bureaublad. */
export default function TegelInhoud({ lang, widget, ownerUserId }: { lang: Lang; widget: BureauWidgetId; ownerUserId: string }) {
  const def = bureauWidget(widget);
  if (!def || def.stand !== 'klaar') return <Leeg tekst={tr(lang, 'Цей блок ще не працює.', 'Dit blok werkt nog niet.')} />;
  if (def.cat === 'post') return <BlokBron lang={lang} soort='mail' widget={widget} ownerUserId={ownerUserId} />;
  if (def.cat === 'agenda') return <BlokBron lang={lang} soort='calendar' widget={widget} ownerUserId={ownerUserId} />;
  if (def.cat === 'bestanden') return <BlokBron lang={lang} soort='files' widget={widget} ownerUserId={ownerUserId} />;
  if (def.cat === 'taken' || def.cat === 'notities') return <BordTegel lang={lang} widget={widget} />;
  if (def.cat === 'diensten') return <DienstenTegel lang={lang} />;
  return <Leeg tekst='—' />;
}
