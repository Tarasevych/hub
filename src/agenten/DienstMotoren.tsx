// MAILAI-003 (16.11.2026): «Спільні рушії ШІ для всіх» — технічна поверхня власника сайту (backend/ai-dienst-motoren.ts).
// Окремо від особистих ключів («для себе» — Сховище ключів; «для всіх» — тут). Типово все вимкнено; кожен користувач сам
// погоджується на кожен рушій. Збереження, увімкнення й прибирання вимагають підтвердження: сервер відповідає 403
// STEP_UP_REQUIRED, а platform/client.ts сам показує вікно «Підтвердіть доступ» і один раз повторює запит (тому в кожному
// запиті йде sessionBody('mcp') — без service/tabContext вікно не відкриється).
// Gedeelde AI-motoren voor iedereen: beheer door de eigenaar; standaard uit; de sleutel staat nooit in de React-staat.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Activity, ChevronDown, Loader2, Pencil, Plus, Trash2, TriangleAlert, Users } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import { InfoTip } from '../InfoTip';
import { AI_AANBIEDERS, AI_AANBIEDER_BIJ_ID, type AiAanbiederId } from '../../shared/ai-aanbieders';
import {
  DIENST_LIMIET, DIENST_SOORTEN, dienstRisicos, dienstSoortNaam, dienstWaarheen, gebruikSleutelDienst, hostVan, normaliseerDienstInvoer,
  type DienstMotor, type DienstSoort,
} from '../../shared/ai-dienst-motor';
import { foutTekst } from './fouten';
import { Badge } from './ui';
// Як у SiteSchakelaars: те, що відкриває ШІ всім користувачам, натискає лише людина (зона без дій ШІ + лише справжній клік).
import { alleenMens, geenAi } from '../menselijke-actie';
import './dienst-motoren.css';

type MotorRij = DienstMotor & {
  klaar: boolean; akkoordSleutel: string; soortNaamUk: string; soortNaamNl: string; risicosUk: string[]; risicosNl: string[]; standaardModel?: string;
};
type Stat = { motor: string; dag: string; aantal: number; geweigerd: number; gebruikers: number };
type Overzicht = { motoren: MotorRij[]; statistiek: Stat[]; vandaag: string; max: number };
type TestUitkomst = { geslaagd: boolean; status: number; ms: number; voorbeeld: string };
type Formulier = { modus: 'nieuw' | 'wijzig'; id: string; soort: DienstSoort; naam: string; aanbieder: AiAanbiederId; url: string; model: string; limiet: string };
type Melding = { ok: boolean; tekst: string } | null;
type Klik = { preventDefault: () => void };

const LEEG: Formulier = { modus: 'nieuw', id: '', soort: 'aanbieder', naam: '', aanbieder: 'anthropic', url: '', model: '', limiet: String(DIENST_LIMIET.standaard) };

/** Пояснення кожного виду у формі: хто платить і що вміє. */
const SOORT_UITLEG: Record<DienstSoort, [string, string]> = {
  aanbieder: ['Запити йдуть до постачальника ШІ вашим ключем — платите ви. Усі функції.', 'Verzoeken gaan met uw sleutel naar de AI-aanbieder — u betaalt. Alle functies.'],
  libretranslate: ['Ваш власний сервер LibreTranslate. Лише переклад, безкоштовно.', 'Uw eigen LibreTranslate-server. Alleen vertalen, gratis.'],
  ollama: ['Ваш власний сервер Ollama. Усі функції, безкоштовно.', 'Uw eigen Ollama-server. Alle functies, gratis.'],
};

/** Статистика одного рушія за 7 днів (рядки сервера: рушій × день). */
function statVan(data: Overzicht, id: string) {
  const rijen = data.statistiek.filter((s) => s.motor === gebruikSleutelDienst(id));
  const vandaag = rijen.filter((s) => s.dag === data.vandaag);
  const som = (r: Stat[], veld: 'aantal' | 'geweigerd' | 'gebruikers') => r.reduce((n, s) => n + Number(s[veld] || 0), 0);
  return {
    vandaag: som(vandaag, 'aantal'), week: som(rijen, 'aantal'), geweigerd: som(rijen, 'geweigerd'),
    mensenVandaag: som(vandaag, 'gebruikers'), mensenMax: rijen.reduce((n, s) => Math.max(n, Number(s.gebruikers || 0)), 0),
  };
}

/** Кнопка-піктограма: назва — в aria-label, наслідок дії — у власній підказці (без native title). */
function PictoKnop({ naam, gevolg, onClick, bezig, disabled, gevaar, testid, icoon, expanded }: {
  naam: string; gevolg: string; onClick: (e: Klik) => void; bezig?: boolean; disabled?: boolean; gevaar?: boolean; testid: string; icoon: ReactNode; expanded?: boolean;
}) {
  const tip = useId();
  return (
    <span className='dm-picto'>
      <button type='button' className={`dm-picto-knop${gevaar ? ' is-gevaar' : ''}`} aria-label={naam} aria-describedby={tip} aria-busy={bezig || undefined}
        aria-expanded={expanded} disabled={disabled || bezig} onClick={onClick} data-testid={testid}>
        {bezig ? <Loader2 className='ag-spin' aria-hidden='true' /> : icoon}
      </button>
      <span id={tip} role='tooltip' className='dm-tip'><b>{naam}.</b> {gevolg}</span>
    </span>
  );
}

export default function DienstMotoren({ tr }: { tr: Tr }) {
  const nl = tr('uk', 'nl') === 'nl';
  const [data, setData] = useState<Overzicht | null>(null);
  const [melding, setMelding] = useState<Melding>(null);
  const [bezig, setBezig] = useState('');
  const [risicoVoor, setRisicoVoor] = useState('');
  const [verwijderVoor, setVerwijderVoor] = useState('');
  const [tests, setTests] = useState<Record<string, TestUitkomst>>({});
  const [formulier, setFormulier] = useState<Formulier | null>(null);
  const [formFout, setFormFout] = useState('');
  // Ключ НЕ лежить у стані React: некероване поле, значення читається лише в момент надсилання й одразу стирається.
  const sleutelVeld = useRef<HTMLInputElement>(null);
  const veld = useId();
  const [open, setOpen] = useState(false);

  /** Сервер дає готові тексти (messageUk/messageNl) для власних кодів; решта — спільний foutTekst сторінки. */
  const foutVan = (e: unknown, wat: [string, string]) => {
    const d = (e as { response?: { data?: { messageUk?: unknown; messageNl?: unknown } } })?.response?.data;
    if (d && typeof d.messageUk === 'string' && d.messageUk) return tr(d.messageUk, typeof d.messageNl === 'string' && d.messageNl ? d.messageNl : d.messageUk);
    return foutTekst(e, tr, wat);
  };
  const neem = (r: { data?: unknown }) => {
    const d = r.data as Partial<Overzicht> | undefined;
    if (d && Array.isArray(d.motoren)) setData({ motoren: d.motoren, statistiek: Array.isArray(d.statistiek) ? d.statistiek : [], vandaag: String(d.vandaag || ''), max: Number(d.max || 0) });
  };

  useEffect(() => {
    let actief = true;
    api.post('/api/owner/ai-dienst-motoren/overzicht', sessionBody('mcp'))
      .then((r) => { if (actief) neem(r); })
      .catch((e) => { if (actief) setMelding({ ok: false, tekst: foutVan(e, ['Не вдалося прочитати спільні рушії', 'Gedeelde motoren laden mislukt']) }); });
    return () => { actief = false; };
  }, [tr]); // eslint-disable-line react-hooks/exhaustive-deps

  const zet = (m: MotorRij, aan: boolean) => {
    setBezig(`zet:${m.id}`); setMelding(null); setRisicoVoor('');
    api.post('/api/owner/ai-dienst-motoren/zet', { ...sessionBody('mcp'), id: m.id, aan })
      .then((r) => {
        neem(r);
        setMelding({ ok: true, tekst: aan
          ? tr(`«${m.naam}» увімкнено для всіх. Користувачі побачать рушій у пошті й зможуть користуватися ним після власної згоди.`, `«${m.naam}» staat aan voor iedereen. Gebruikers zien de motor in de post en kunnen hem na eigen akkoord gebruiken.`)
          : tr(`«${m.naam}» вимкнено. Запити користувачів цим рушієм одразу відхиляються.`, `«${m.naam}» staat uit. Verzoeken via deze motor worden meteen geweigerd.`) });
      })
      .catch((e) => setMelding({ ok: false, tekst: foutVan(e, aan ? ['Не вдалося увімкнути', 'Aanzetten mislukt'] : ['Не вдалося вимкнути', 'Uitzetten mislukt']) }))
      .finally(() => setBezig(''));
  };

  const test = (m: MotorRij) => {
    setBezig(`test:${m.id}`); setMelding(null);
    api.post('/api/owner/ai-dienst-motoren/test', { ...sessionBody('mcp'), id: m.id })
      .then((r) => {
        const d = (r.data || {}) as Partial<TestUitkomst>;
        setTests((t) => ({ ...t, [m.id]: { geslaagd: d.geslaagd === true, status: Number(d.status || 0), ms: Number(d.ms || 0), voorbeeld: String(d.voorbeeld || '') } }));
      })
      .catch((e) => setMelding({ ok: false, tekst: foutVan(e, ['Не вдалося перевірити рушій', 'Motor testen mislukt']) }))
      .finally(() => setBezig(''));
  };

  const verwijder = (m: MotorRij) => {
    setBezig(`weg:${m.id}`); setMelding(null); setVerwijderVoor('');
    api.post('/api/owner/ai-dienst-motoren/verwijder', { ...sessionBody('mcp'), id: m.id })
      .then((r) => {
        neem(r);
        setTests((t) => { const { [m.id]: _weg, ...rest } = t; return rest; });
        if (formulier?.modus === 'wijzig' && formulier.id === m.id) setFormulier(null);
        setMelding({ ok: true, tekst: tr(`«${m.naam}» прибрано. Його ключ прибрано зі «Сховища ключів»; лічильник за минулі дні лишається.`, `«${m.naam}» is verwijderd. De sleutel is uit de «Sleutelkluis» gehaald; de teller van eerdere dagen blijft.`) });
      })
      .catch((e) => setMelding({ ok: false, tekst: foutVan(e, ['Не вдалося прибрати', 'Verwijderen mislukt']) }))
      .finally(() => setBezig(''));
  };

  const openNieuw = () => { setFormFout(''); setFormulier({ ...LEEG }); };
  const openWijzig = (m: MotorRij) => {
    setFormFout('');
    setFormulier({ modus: 'wijzig', id: m.id, soort: m.soort, naam: m.naam, aanbieder: m.aanbieder ?? 'anthropic', url: m.url ?? '', model: m.model ?? '', limiet: String(m.limietPerDag) });
  };
  const sluitFormulier = () => { if (sleutelVeld.current) sleutelVeld.current.value = ''; setFormulier(null); setFormFout(''); };
  const wijzig = (deel: Partial<Formulier>) => setFormulier((f) => (f ? { ...f, ...deel } : f));

  const bewaar = () => {
    if (!formulier) return;
    const f = formulier;
    // Та сама перевірка, що й на сервері (shared/ai-dienst-motor.ts) — помилку видно ще до запиту й до вікна підтвердження.
    const n = normaliseerDienstInvoer({ id: f.id, soort: f.soort, naam: f.naam, aanbieder: f.aanbieder, url: f.url, model: f.model, limietPerDag: f.limiet === '' ? Number.NaN : Number(f.limiet) });
    if (!n.ok) { setFormFout(tr(n.uk, n.nl)); return; }
    const oud = data?.motoren.find((m) => m.id === n.waarde.id) || null;
    if (f.modus === 'nieuw' && oud) { setFormFout(tr('Рушій із такою короткою назвою вже є. Оберіть іншу або змініть наявний.', 'Er bestaat al een motor met deze korte naam. Kies een andere of wijzig de bestaande.')); return; }
    const sleutel = n.waarde.soort === 'aanbieder' ? (sleutelVeld.current?.value ?? '').trim() : '';
    if (sleutelVeld.current) sleutelVeld.current.value = '';   // значення ключа живе далі лише в тілі цього одного запиту
    setBezig('bewaar'); setFormFout(''); setMelding(null);
    api.post('/api/owner/ai-dienst-motoren/bewaar', { ...sessionBody('mcp'), ...n.waarde, ...(sleutel ? { sleutel } : {}) })
      .then((r) => {
        neem(r);
        setFormulier(null);
        const nieuw = ((r.data as Partial<Overzicht> | undefined)?.motoren || []).find((m) => m.id === n.waarde.id);
        const uitgezet = oud?.aan === true && nieuw?.aan !== true;
        setMelding({ ok: true, tekst: uitgezet
          ? tr(`«${n.waarde.naam}» збережено й вимкнено: змінилося, куди йде текст, тож згоди користувачів скинуто. Перевірте рушій і ввімкніть його знову.`, `«${n.waarde.naam}» is bewaard en uitgezet: waar de tekst heen gaat is gewijzigd, dus de akkoorden zijn vervallen. Test de motor en zet hem weer aan.`)
          : nieuw?.aan
            ? tr(`«${n.waarde.naam}» збережено; рушій лишився увімкненим.`, `«${n.waarde.naam}» is bewaard; de motor blijft aan.`)
            : tr(`«${n.waarde.naam}» збережено. Рушій вимкнений, доки ви самі не ввімкнете його для всіх.`, `«${n.waarde.naam}» is bewaard. De motor staat uit tot u hem zelf voor iedereen aanzet.`) });
      })
      .catch((e) => setFormFout(foutVan(e, ['Не вдалося зберегти рушій', 'Motor bewaren mislukt'])))
      .finally(() => setBezig(''));
  };

  const motoren = data?.motoren ?? [];
  const aantalAan = motoren.filter((m) => m.klaar).length;
  const vol = data !== null && data.max > 0 && motoren.length >= data.max;
  // Попередження саме цього постачальника (Gemini, Z.ai): те, чого немає серед загальних ризиків ключа постачальника.
  const eigenRisicos = formulier?.soort === 'aanbieder'
    ? dienstRisicos({ soort: 'aanbieder', aanbieder: formulier.aanbieder }, nl).filter((r) => !dienstRisicos({ soort: 'aanbieder', aanbieder: 'anthropic' }, nl).includes(r))
    : [];
  const naamVan = (a: AiAanbiederId) => (nl ? AI_AANBIEDER_BIJ_ID[a].naamNl : AI_AANBIEDER_BIJ_ID[a].naamUk);

  return (
    <section className='ag-blok dm' data-ag-blok='dienst-motoren' data-testid='dienst-motoren' aria-labelledby={`${veld}-kop`} {...geenAi}>
      {/* Контракт блоків сторінки (agenten-pagina.css): h3.ag-blok-titel, .ag-knoppen і p.ag-blok-uitleg — прямі діти .ag-blok-kop. */}
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id={`${veld}-kop`}><Users aria-hidden='true' /> {tr('Спільні рушії ШІ для всіх', 'Gedeelde AI-motoren voor iedereen')}
          <span className='ag-teller' data-dienst-teller='1'>{tr(`увімкнено ${aantalAan} з ${motoren.length}`, `${aantalAan} van ${motoren.length} aan`)}</span>
        </h3>
        <div className='ag-knoppen'>
          <button type='button' className='ag-knop ag-blok-klap dm-knop' aria-expanded={open} aria-controls={`${veld}-inhoud`} data-testid='dienst-klap' onClick={() => setOpen((o) => !o)}>
            <span>{open ? tr('Згорнути', 'Inklappen') : tr('Розгорнути', 'Uitklappen')}</span><ChevronDown className='ag-chevron' aria-hidden='true' />
          </button>
        </div>
        <p className='ag-blok-uitleg'>{tr('Рушії ШІ, які ви відкриваєте всім користувачам сайту — окремо від особистих ключів; типово все вимкнено.', 'AI-motoren die u voor alle gebruikers van de site openzet — los van persoonlijke sleutels; standaard staat alles uit.')}</p>
      </header>

      <div className='dm-inhoud' id={`${veld}-inhoud`} hidden={!open}>
        <p className='dm-inleiding'>
          {tr('Це окремо від ваших особистих ключів: «для себе» — у «Сховищі ключів», «для всіх» — тут. Кожен користувач сам погоджується на кожен рушій і бачить, куди піде текст. Текст листів сайт не зберігає — є лише лічильник запитів.',
            'Dit staat los van uw persoonlijke sleutels: «voor uzelf» — in de «Sleutelkluis», «voor iedereen» — hier. Elke gebruiker geeft zelf akkoord per motor en ziet waar de tekst heen gaat. De site bewaart de tekst van brieven niet — er is alleen een teller van verzoeken.')}
        </p>

        {melding ? <p className={`ag-melding ag-melding-${melding.ok ? 'ok' : 'fout'}`} role={melding.ok ? 'status' : 'alert'} data-testid={melding.ok ? 'dienst-melding' : 'dienst-fout'}>{melding.tekst}</p> : null}

        {data === null ? (melding ? null : <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>) : motoren.length === 0 ? (
          <p className='ag-leeg'>{tr('Спільних рушіїв ще немає. Користувачі працюють лише з власними ключами та локальним ШІ.', 'Er zijn nog geen gedeelde motoren. Gebruikers werken alleen met eigen sleutels en lokale AI.')}</p>
        ) : (
          <ul className='dm-lijst'>
            {motoren.map((m) => {
              const s = statVan(data, m.id);
              const zonderSleutel = m.soort === 'aanbieder' && !m.heeftSleutel;
              const t = tests[m.id];
              const risicos = nl ? m.risicosNl : m.risicosUk;
              const risicoId = `${veld}-risico-${m.id}`;
              const bezigHier = bezig.endsWith(`:${m.id}`);
              return (
                <li key={m.id} className='dm-kaart' data-testid='dienst-kaart' data-dienst-id={m.id} data-aan={String(m.aan)}>
                  <div className='dm-kaart-kop'>
                    <div className='dm-kaart-naam'>
                      <b>{m.naam}</b>
                      <small>{nl ? m.soortNaamNl : m.soortNaamUk}</small>
                    </div>
                    {m.klaar ? <Badge toon='ok' data='dienst-staat'>{tr('увімкнено', 'aan')}</Badge>
                      : zonderSleutel ? <Badge toon='warn' data='dienst-staat'>{tr('немає ключа', 'geen sleutel')}</Badge>
                        : <Badge toon='off' data='dienst-staat'>{tr('вимкнено', 'uit')}</Badge>}
                  </div>

                  <dl className='dm-feiten'>
                    <div><dt>{m.soort === 'aanbieder' ? tr('Постачальник', 'Aanbieder') : tr('Сервер', 'Server')}</dt><dd>{m.soort === 'aanbieder' ? (m.aanbieder ? naamVan(m.aanbieder) : '—') : (hostVan(m.url) || '—')}</dd></div>
                    <div><dt>{tr('Модель', 'Model')}</dt><dd>{m.model || (m.standaardModel ? tr(`типова: ${m.standaardModel}`, `standaard: ${m.standaardModel}`) : '—')}</dd></div>
                    <div><dt>{tr('Межа на людину', 'Limiet per persoon')}</dt><dd>{tr(`${m.limietPerDag} запитів на день`, `${m.limietPerDag} verzoeken per dag`)}</dd></div>
                    <div><dt>{tr('Коротка назва', 'Korte naam')}</dt><dd><code>{m.id}</code></dd></div>
                  </dl>
                  <p className='dm-waarheen'>{dienstWaarheen({ soort: m.soort, aanbieder: m.aanbieder, host: m.soort === 'aanbieder' ? undefined : hostVan(m.url), beheerder: m.beheerder }, nl)}</p>

                  <ul className='dm-stat' aria-label={tr('Використання за 7 днів', 'Gebruik in 7 dagen')}>
                    <li><b>{s.vandaag}</b><span>{tr('запитів сьогодні', 'verzoeken vandaag')}</span></li>
                    <li><b>{s.week}</b><span>{tr('за 7 днів', 'in 7 dagen')}</span></li>
                    <li><b>{s.mensenVandaag}</b><span>{tr(`людей сьогодні (найбільше за день: ${s.mensenMax})`, `mensen vandaag (hoogste per dag: ${s.mensenMax})`)}</span></li>
                    <li><b>{s.geweigerd}</b><span>{tr('відмов через межу', 'geweigerd door limiet')}</span></li>
                  </ul>

                  <div className='dm-kaart-acties'>
                    <button type='button' className='dm-schakel' aria-pressed={m.aan} aria-expanded={m.aan ? undefined : risicoVoor === m.id} aria-controls={m.aan ? undefined : risicoId}
                      disabled={!!bezig || (!m.aan && zonderSleutel)} data-testid='dienst-aan'
                      onClick={alleenMens<Klik>(() => { if (m.aan) zet(m, false); else { setVerwijderVoor(''); setRisicoVoor(risicoVoor === m.id ? '' : m.id); } })}>
                      <span className='dm-schakel-spoor' aria-hidden='true'><span /></span>
                      <span>{m.aan ? tr('Увімкнено для всіх', 'Aan voor iedereen') : tr('Увімкнути для всіх', 'Aanzetten voor iedereen')}</span>
                    </button>
                    <span className='dm-pictos'>
                      <PictoKnop testid='dienst-test' naam={tr('Перевірити', 'Testen')} bezig={bezig === `test:${m.id}`} disabled={!!bezig} icoon={<Activity aria-hidden='true' />}
                        gevolg={tr('Рушієві піде лише одне фіксоване тестове речення — жодного тексту користувачів. Ви побачите, чи він відповів і за який час.', 'De motor krijgt alleen één vaste testzin — geen tekst van gebruikers. U ziet of hij antwoordde en hoe snel.')}
                        onClick={alleenMens<Klik>(() => test(m))} />
                      <PictoKnop testid='dienst-wijzig' naam={tr('Змінити', 'Wijzigen')} disabled={!!bezig} icoon={<Pencil aria-hidden='true' />}
                        gevolg={tr('Відкриє форму. Якщо зміните постачальника, адресу, модель або ключ — рушій вимкнеться, а згоди користувачів скинуться.', 'Opent het formulier. Wijzigt u aanbieder, adres, model of sleutel, dan gaat de motor uit en vervallen de akkoorden.')}
                        onClick={alleenMens<Klik>(() => openWijzig(m))} />
                      <PictoKnop testid='dienst-verwijder' gevaar naam={tr('Прибрати', 'Verwijderen')} bezig={bezig === `weg:${m.id}`} disabled={!!bezig} icoon={<Trash2 aria-hidden='true' />} expanded={verwijderVoor === m.id}
                        gevolg={tr('Рушій зникне в усіх користувачів, а його ключ буде прибрано зі «Сховища ключів». Спершу запитаємо підтвердження.', 'De motor verdwijnt bij alle gebruikers en de sleutel wordt uit de «Sleutelkluis» gehaald. We vragen eerst om bevestiging.')}
                        onClick={alleenMens<Klik>(() => { setRisicoVoor(''); setVerwijderVoor(verwijderVoor === m.id ? '' : m.id); })} />
                    </span>
                  </div>
                  {!m.aan && zonderSleutel ? <p className='dm-hint'>{tr('Щоб увімкнути, спершу додайте ключ постачальника кнопкою «Змінити».', 'Voeg eerst via «Wijzigen» de sleutel van de aanbieder toe om aan te zetten.')}</p> : null}

                  {risicoVoor === m.id && !m.aan ? (
                    <div className='dm-risico' id={risicoId} role='group' aria-label={tr('Ризики перед увімкненням', 'Risico’s vóór het aanzetten')} data-testid='dienst-risico'>
                      <p className='dm-risico-kop'><span className='dm-uitroep' aria-hidden='true'>!</span>{tr(`Перш ніж увімкнути «${m.naam}» для всіх`, `Voordat u «${m.naam}» voor iedereen aanzet`)}</p>
                      <ul>{risicos.map((r) => <li key={r}>{r}</li>)}</ul>
                      <div className='dm-rij-knoppen'>
                        <button type='button' className='ag-knop ag-knop-primary dm-knop' disabled={bezigHier} data-testid='dienst-aan-bevestig' onClick={alleenMens<Klik>(() => zet(m, true))}>{tr('Увімкнути', 'Aanzetten')}</button>
                        <button type='button' className='ag-knop dm-knop' onClick={() => setRisicoVoor('')}>{tr('Скасувати', 'Annuleren')}</button>
                      </div>
                    </div>
                  ) : null}

                  {verwijderVoor === m.id ? (
                    <div className='dm-risico is-gevaar' role='group' aria-label={tr('Підтвердження прибирання', 'Verwijderen bevestigen')} data-testid='dienst-verwijder-vraag'>
                      <p>{tr(`Прибрати «${m.naam}»? Рушій зникне зі списку в пошті в усіх користувачів, його ключ буде прибрано зі «Сховища ключів». Лічильник за минулі дні лишиться.`, `«${m.naam}» verwijderen? De motor verdwijnt bij alle gebruikers uit de lijst in de post en de sleutel wordt uit de «Sleutelkluis» gehaald. De teller van eerdere dagen blijft.`)}</p>
                      <div className='dm-rij-knoppen'>
                        <button type='button' className='ag-knop ag-knop-danger dm-knop' disabled={bezigHier} data-testid='dienst-verwijder-bevestig' onClick={alleenMens<Klik>(() => verwijder(m))}>{tr('Так, прибрати', 'Ja, verwijderen')}</button>
                        <button type='button' className='ag-knop dm-knop' onClick={() => setVerwijderVoor('')}>{tr('Скасувати', 'Annuleren')}</button>
                      </div>
                    </div>
                  ) : null}

                  {t ? (
                    <p className={`dm-test ${t.geslaagd ? 'is-ok' : 'is-fout'}`} role='status' data-testid='dienst-test-uitkomst' data-geslaagd={String(t.geslaagd)}>
                      <b>{t.geslaagd ? tr('Рушій відповів.', 'De motor antwoordde.') : tr('Рушій не відповів.', 'De motor antwoordde niet.')}</b>{' '}
                      {t.status ? tr(`Стан ${t.status}`, `Status ${t.status}`) : tr('Немає зв’язку', 'Geen verbinding')} · {t.ms} {tr('мс', 'ms')}
                      {t.voorbeeld ? <span className='dm-test-voorbeeld'>{tr('Відповідь на тестове речення: ', 'Antwoord op de testzin: ')}<q>{t.voorbeeld}</q></span> : null}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {data !== null && !formulier ? (
          <div className='dm-rij-knoppen'>
            <button type='button' className='ag-knop dm-knop' disabled={vol || !!bezig} data-testid='dienst-nieuw' onClick={alleenMens<Klik>(openNieuw)}><Plus aria-hidden='true' /> {tr('Додати рушій', 'Motor toevoegen')}</button>
            {vol ? <span className='dm-hint'>{tr(`Досягнуто межі: не більше ${data.max} спільних рушіїв.`, `Limiet bereikt: niet meer dan ${data.max} gedeelde motoren.`)}</span> : null}
          </div>
        ) : null}

        {formulier ? (
          <form className='dm-formulier' data-testid='dienst-formulier' autoComplete='off' noValidate aria-labelledby={`${veld}-titel`} onSubmit={alleenMens<Klik>((e) => { e.preventDefault(); bewaar(); })}>
            <h4 id={`${veld}-titel`}>{formulier.modus === 'nieuw' ? tr('Додати рушій', 'Motor toevoegen') : tr(`Змінити «${formulier.id}»`, `«${formulier.id}» wijzigen`)}</h4>

            {formulier.modus === 'wijzig' ? (
              <p className='dm-let'><TriangleAlert aria-hidden='true' /><span>{tr('Зміна постачальника, адреси сервера, моделі або ключа вимикає рушій і скидає згоди користувачів: вони погоджувалися на те, куди йшов текст раніше. Назву й денну межу можна міняти без цього.', 'Wijzigt u aanbieder, serveradres, model of sleutel, dan gaat de motor uit en vervallen de akkoorden van gebruikers: zij stemden in met waar de tekst eerst heen ging. Naam en daglimiet wijzigt u zonder dat gevolg.')}</span></p>
            ) : null}

            <fieldset className='dm-soorten'>
              <legend>{tr('Вид рушія', 'Soort motor')}</legend>
              {DIENST_SOORTEN.map((soort) => (
                <label key={soort} className='dm-soort' data-gekozen={String(formulier.soort === soort)}>
                  <input type='radio' name={`${veld}-soort`} value={soort} checked={formulier.soort === soort} onChange={() => wijzig({ soort })} />
                  <span><b>{dienstSoortNaam(soort, nl)}</b><small>{tr(SOORT_UITLEG[soort][0], SOORT_UITLEG[soort][1])}</small></span>
                </label>
              ))}
            </fieldset>

            <div className='dm-velden'>
              <div className='dm-veld'>
                <span className='dm-veld-kop'>
                  <label htmlFor={`${veld}-id`}>{tr('Коротка назва-ідентифікатор', 'Korte naam (id)')}</label>
                  <InfoTip label={tr('Про коротку назву', 'Over de korte naam')}>{tr('Латинські літери, цифри й дефіс, 2–31 знак, починається з літери. За нею рушій упізнає система; після створення її не змінити.', 'Latijnse letters, cijfers en koppelteken, 2–31 tekens, begint met een letter. Hiermee herkent het systeem de motor; na het aanmaken niet te wijzigen.')}</InfoTip>
                </span>
                <input id={`${veld}-id`} type='text' value={formulier.id} readOnly={formulier.modus === 'wijzig'} aria-readonly={formulier.modus === 'wijzig'} maxLength={31}
                  autoCapitalize='none' autoCorrect='off' spellCheck={false} placeholder='claude-team' onChange={(e) => wijzig({ id: e.target.value.toLowerCase() })} />
              </div>
              <div className='dm-veld'>
                <span className='dm-veld-kop'><label htmlFor={`${veld}-naam`}>{tr('Назва для користувачів', 'Naam voor gebruikers')}</label></span>
                <input id={`${veld}-naam`} type='text' value={formulier.naam} maxLength={80} onChange={(e) => wijzig({ naam: e.target.value })} />
              </div>

              {formulier.soort === 'aanbieder' ? (
                <div className='dm-veld'>
                  <span className='dm-veld-kop'><label htmlFor={`${veld}-aanbieder`}>{tr('Постачальник', 'Aanbieder')}</label></span>
                  <select id={`${veld}-aanbieder`} value={formulier.aanbieder} onChange={(e) => wijzig({ aanbieder: e.target.value as AiAanbiederId })}>
                    {AI_AANBIEDERS.map((a) => <option key={a.id} value={a.id}>{nl ? a.naamNl : a.naamUk}</option>)}
                  </select>
                </div>
              ) : (
                <div className='dm-veld'>
                  <span className='dm-veld-kop'>
                    <label htmlFor={`${veld}-url`}>{tr('Адреса сервера', 'Serveradres')}</label>
                    <InfoTip label={tr('Про адресу сервера', 'Over het serveradres')}>{tr('Повна адреса з http:// або https://, без логіна й параметрів. Користувачі бачать лише назву вузла.', 'Volledig adres met http:// of https://, zonder login en parameters. Gebruikers zien alleen de hostnaam.')}</InfoTip>
                  </span>
                  <input id={`${veld}-url`} type='url' inputMode='url' value={formulier.url} maxLength={300} autoCapitalize='none' spellCheck={false}
                    placeholder={formulier.soort === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:5000'} onChange={(e) => wijzig({ url: e.target.value })} />
                </div>
              )}

              {formulier.soort !== 'libretranslate' ? (
                <div className='dm-veld'>
                  <span className='dm-veld-kop'>
                    <label htmlFor={`${veld}-model`}>{formulier.soort === 'ollama' ? tr('Модель (обов’язково)', 'Model (verplicht)') : tr('Модель (необов’язково)', 'Model (optioneel)')}</label>
                  </span>
                  <input id={`${veld}-model`} type='text' value={formulier.model} maxLength={120} autoCapitalize='none' spellCheck={false} aria-describedby={`${veld}-model-hint`}
                    placeholder={formulier.soort === 'ollama' ? 'gemma3:4b' : AI_AANBIEDER_BIJ_ID[formulier.aanbieder].standaardVertaalModel} onChange={(e) => wijzig({ model: e.target.value })} />
                  <small id={`${veld}-model-hint`}>{formulier.soort === 'ollama'
                    ? tr('Модель, яку вже завантажено на сервері.', 'Het model dat al op de server staat.')
                    : tr(`Порожньо — типова: ${AI_AANBIEDER_BIJ_ID[formulier.aanbieder].standaardVertaalModel}.`, `Leeg — standaard: ${AI_AANBIEDER_BIJ_ID[formulier.aanbieder].standaardVertaalModel}.`)}</small>
                </div>
              ) : null}

              <div className='dm-veld'>
                <span className='dm-veld-kop'>
                  <label htmlFor={`${veld}-limiet`}>{tr('Денна межа на людину', 'Daglimiet per persoon')}</label>
                  <InfoTip label={tr('Про денну межу', 'Over de daglimiet')}>{tr(`Скільки запитів цим рушієм одна людина може зробити за день (від ${DIENST_LIMIET.min} до ${DIENST_LIMIET.max}). Далі запити відхиляються до наступного дня — так обмежуються ваші витрати.`, `Hoeveel verzoeken één persoon per dag via deze motor kan doen (${DIENST_LIMIET.min} tot ${DIENST_LIMIET.max}). Daarna worden verzoeken geweigerd tot de volgende dag — zo begrenst u uw kosten.`)}</InfoTip>
                </span>
                <input id={`${veld}-limiet`} type='number' inputMode='numeric' min={DIENST_LIMIET.min} max={DIENST_LIMIET.max} step={1} value={formulier.limiet} onChange={(e) => wijzig({ limiet: e.target.value })} />
              </div>

              {formulier.soort === 'aanbieder' ? (
                <div className='dm-veld'>
                  <span className='dm-veld-kop'><label htmlFor={`${veld}-sleutel`}>{tr('Ключ постачальника', 'Sleutel van de aanbieder')}</label></span>
                  {/* Некероване поле: значення не потрапляє у стан React і ніколи не показується назад. */}
                  <input id={`${veld}-sleutel`} ref={sleutelVeld} type='password' autoComplete='off' spellCheck={false} aria-describedby={`${veld}-sleutel-hint`} data-testid='dienst-sleutel' />
                  <small id={`${veld}-sleutel-hint`}>{formulier.modus === 'wijzig'
                    ? tr('Порожньо — лишити наявний ключ. Збережений ключ тут ніколи не показується.', 'Leeg — de bestaande sleutel blijft. De bewaarde sleutel wordt hier nooit getoond.')
                    : tr('Ключ зберігається у вашому «Сховищі ключів» окремо від особистих і більше ніде не показується. Без ключа рушій не можна ввімкнути.', 'De sleutel komt in uw «Sleutelkluis», los van persoonlijke sleutels, en wordt nergens meer getoond. Zonder sleutel kan de motor niet aan.')}</small>
                </div>
              ) : null}
            </div>

            {eigenRisicos.length ? (
              <div className='dm-risico' role='note' data-testid='dienst-formulier-risico'>
                <p className='dm-risico-kop'><span className='dm-uitroep' aria-hidden='true'>!</span>{tr(`Зважте для «${naamVan(formulier.aanbieder)}»`, `Let op bij «${naamVan(formulier.aanbieder)}»`)}</p>
                <ul>{eigenRisicos.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            ) : null}

            {formFout ? <p className='ag-melding ag-melding-fout' role='alert' data-testid='dienst-fout'>{formFout}</p> : null}

            <div className='dm-rij-knoppen'>
              <button type='submit' className='ag-knop ag-knop-primary dm-knop' disabled={bezig === 'bewaar'} aria-busy={bezig === 'bewaar' || undefined} data-testid='dienst-bewaar'>
                {bezig === 'bewaar' ? <Loader2 className='ag-spin' aria-hidden='true' /> : null}{tr('Зберегти', 'Bewaren')}
              </button>
              <button type='button' className='ag-knop dm-knop' disabled={bezig === 'bewaar'} onClick={sluitFormulier}>{tr('Скасувати', 'Annuleren')}</button>
              <span className='dm-hint'>{tr('Збереження підтверджується вашим passkey.', 'Bewaren bevestigt u met uw passkey.')}</span>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
