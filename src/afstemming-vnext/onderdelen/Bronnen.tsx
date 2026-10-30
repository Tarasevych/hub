// Afstemming vNext — «Джерела» (uitvoerder D3, §2.8 + §13): een EERLIJKE read-only staat van de automatisering. Wat vandaag
// echt werkt (het agent-API: dezelfde routes als deze pagina gebruikt) heet «werkt»; wat alleen bedacht is (MCP-wrappers,
// GitHub/CI-diff-afstemming, semantisch zoeken) heet «gepland» — geen verzonnen koppelingen, geen knoppen die zouden liegen.
// Plus de rapporten op aanvraag (§9): week of maand, cijfers mét de leesbare samenvatting van de server.
import { useState, type CSSProperties } from 'react';
import { Bot, FileClock, Plug2 } from 'lucide-react';
import { afstemmingTekst } from '../../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type RapportUit } from '../afstemming-client';
import { foutTekst, tr } from '../tekst';
import type { OnderdeelProps } from '../AfstemmingPagina';

const S: Record<string, CSSProperties> = {
  rij: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--panel)', flexWrap: 'wrap' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999, fontSize: 'var(--tekst-mini)', fontWeight: 650, flex: 'none' },
  cijfers: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  cijfer: { display: 'grid', justifyItems: 'center', gap: 2, padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--surface)' },
};
const werkt = { ...S.badge, background: 'var(--ok-zacht)', color: 'var(--ok)' };
const gepland = { ...S.badge, background: 'var(--info-zacht)', color: 'var(--info)' };

export default function Bronnen({ lang }: OnderdeelProps) {
  const [rapport, setRapport] = useState<RapportUit | null>(null);
  const [periode, setPeriode] = useState<'week' | 'maand' | ''>('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const haalRapport = async (p: 'week' | 'maand') => {
    setBezig(true); setPeriode(p);
    try { setRapport(await afstemmingClient.rapport(p)); setFout(''); }
    catch (e) { const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; setRapport(null); setFout(foutTekst(lang, code)); }
    finally { setBezig(false); }
  };

  const bron = (naam: string, uitleg: string, stand: 'werkt' | 'gepland', attr: string, detail?: string) => (
    <div style={S.rij} role='listitem' data-afv-bron={attr} data-afv-bron-stand={stand}>
      <span style={stand === 'werkt' ? werkt : gepland}>{stand === 'werkt' ? tr(lang, 'працює', 'werkt') : tr(lang, 'заплановано', 'gepland')}</span>
      <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 2 }}>
        <strong>{naam}</strong>
        <span className='afv-hint' style={{ overflowWrap: 'anywhere' }}>{uitleg}</span>
        {detail ? <code style={{ fontSize: 11 }}>{detail}</code> : null}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--ruimte-4)', minWidth: 0 }} data-afv-bronnen=''>
      <section className='afv-blok'>
        <h3><Bot aria-hidden='true' />{tr(lang, 'Агентський доступ', 'Agent-toegang')}</h3>
        <p className='afv-hint'>{tr(lang,
          'Агенти працюють через ті САМІ маршрути, що й ця сторінка — одна картотека, два способи дивитися. Агент може пропонувати, аналізувати й додавати докази; схвалення, приймання і розгортання — лише людина (сервер відповідає AGENT_MAG_NIET).',
          'Agents werken via DEZELFDE routes als deze pagina — één kartotheek, twee manieren van kijken. Een agent mag voorstellen, analyseren en bewijs aandragen; goedkeuren, aanvaarden en uitrollen doet alleen een mens (de server antwoordt AGENT_MAG_NIET).')}</p>
        <div style={{ display: 'grid', gap: 8 }} role='list'>
          {bron(tr(lang, 'Пропозиція картки', 'Kaartvoorstel'), tr(lang, 'Агент створює чернетку з ідемпотентним ключем — повторне надсилання не плодить дублікатів.', 'Een agent maakt een concept met idempotentiesleutel — opnieuw sturen maakt geen duplicaten.'), 'werkt', 'voorstel', 'POST /api/owner/afstemming/voorstel')}
          {bron(tr(lang, 'Додавання доказів', 'Bewijs aanhechten'), tr(lang, 'Тест/скриншот/CI-результат з посиланням і хешем; сам по собі доказ не підвищує етап.', 'Test/screenshot/CI-resultaat met verwijzing en hash; bewijs alleen verhoogt nooit de fase.'), 'werkt', 'bewijs', 'POST /api/owner/afstemming/bewijs')}
          {bron(tr(lang, 'Пропозиція зв’язку', 'Koppelvoorstel'), tr(lang, 'Кандидат «дублює/конфліктує/залежить» зі ступенем впевненості; рішення — за власником.', 'Kandidaat «dupliceert/conflicteert/hangt af» met benoemde zekerheid; het besluit blijft bij de eigenaar.'), 'werkt', 'koppel', "POST /api/owner/afstemming/koppel { actie: 'stel-voor' }")}
        </div>
      </section>
      <section className='afv-blok'>
        <h3><Plug2 aria-hidden='true' />{tr(lang, 'Підключення і плани', 'Koppelingen en plannen')}</h3>
        <div style={{ display: 'grid', gap: 8 }} role='list'>
          {bron(tr(lang, 'MCP-інструменти afstemming.*', 'MCP-gereedschap afstemming.*'), tr(lang, 'Окремі MCP-обгортки для агентів (afstemming.search, submit_proposal, attach_evidence) — заплановано; сьогодні агенти йдуть через HTTP-API вище.', 'Aparte MCP-wrappers voor agents (afstemming.search, submit_proposal, attach_evidence) — gepland; vandaag gaan agents via het HTTP-API hierboven.'), 'gepland', 'mcp')}
          {bron(tr(lang, 'GitHub/CI-звірка змін', 'GitHub/CI-afstemming van wijzigingen'), tr(lang, 'Автоматичне зіставлення PR/комітів/шляхів із картками перед випуском — заплановано; сьогодні прив’язка до випуску робиться вручну зі ступенем впевненості.', 'Automatische koppeling van PR’s/commits/paden aan kaarten vóór de release — gepland; vandaag gebeurt de releasekoppeling handmatig met benoemde zekerheid.'), 'gepland', 'github')}
          {bron(tr(lang, 'Семантичний пошук схожих вимог', 'Semantisch zoeken naar verwante eisen'), tr(lang, 'Пошук схожих формулювань поза лексикою і графом — заплановано; кандидати сьогодні лексичні та графові.', 'Zoeken op verwante formuleringen voorbij lexicon en graf — gepland; kandidaten zijn vandaag lexicaal en grafgebaseerd.'), 'gepland', 'semantisch')}
          {bron(tr(lang, 'Живі проби production', 'Live productie-probes'), tr(lang, 'Read-only перевірки маршрутів/кнопок на живому сайті за окремим дозволом — заплановано (ТЗ, етап P3).', 'Read-only controles van routes/knoppen op de live site met aparte toestemming — gepland (dossier, fase P3).'), 'gepland', 'probes')}
        </div>
      </section>
      <section className='afv-blok'>
        <h3><FileClock aria-hidden='true' />{tr(lang, 'Звіт на вимогу', 'Rapport op aanvraag')}</h3>
        <p className='afv-hint'>{tr(lang, 'Без розсилок і спаму (§9): звіт з’являється тут, коли ви просите.', 'Zonder mailtjes of spam (§9): het rapport verschijnt hier wanneer u erom vraagt.')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type='button' className={`afv-knop${periode === 'week' ? ' is-actief' : ''}`} data-afv-rapport='week' disabled={bezig} onClick={() => void haalRapport('week')}>{tr(lang, 'За тиждень', 'Per week')}</button>
          <button type='button' className={`afv-knop${periode === 'maand' ? ' is-actief' : ''}`} data-afv-rapport='maand' disabled={bezig} onClick={() => void haalRapport('maand')}>{tr(lang, 'За місяць', 'Per maand')}</button>
        </div>
        {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
        {rapport ? (
          <div style={{ display: 'grid', gap: 10 }} data-afv-rapport-uit=''>
            <div style={S.cijfers}>
              {([[rapport.nieuw, tr(lang, 'нових', 'nieuw')], [rapport.veranderd, tr(lang, 'змінених', 'veranderd')], [rapport.zonderEigenaar, tr(lang, 'без відповідального', 'zonder eigenaar')], [rapport.conflicten, tr(lang, 'конфліктів', 'conflicten')], [rapport.verouderd, tr(lang, 'застарілих перевірок', 'verouderde controles')]] as Array<[number, string]>).map(([n, l]) => (
                <div key={l} style={S.cijfer}><strong style={{ fontSize: 20 }}>{n}</strong><span className='afv-hint'>{l}</span></div>
              ))}
            </div>
            <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{afstemmingTekst(rapport.tekst, lang)}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
