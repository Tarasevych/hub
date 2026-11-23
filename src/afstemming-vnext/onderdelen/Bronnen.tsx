// Afstemming vNext — «Джерела» (§2.8 + §13): живий стан автоматизації та зіставлення джерел без бутафорських заглушок.
// Агенти працюють через ті самі маршрути сервера (схвалення належить виключно людині — AGENT_MAG_NIET); автоматичне зіставлення
// читає orchestratie/taken/, orchestratie/verwijzingen/ і реєстр випусків, формуючи перевірювані пропозиції без автозлиття.
import { useState, type CSSProperties } from 'react';
import { Bot, FileClock, GitMerge, Plug2 } from 'lucide-react';
import { afstemmingTekst, type OrchestratieKoppelingUit } from '../../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type RapportUit } from '../afstemming-client';
import { foutTekst, geledenTekst, tr } from '../tekst';
import type { OnderdeelProps } from '../AfstemmingPagina';

const S: Record<string, CSSProperties> = {
  rij: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--panel)', flexWrap: 'wrap' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999, fontSize: 'var(--tekst-mini)', fontWeight: 650, flex: 'none' },
  cijfers: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  cijfer: { display: 'grid', justifyItems: 'center', gap: 2, padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--surface)' },
};
const werkt = { ...S.badge, background: 'var(--ok-zacht)', color: 'var(--ok)' };
const infoBadge = { ...S.badge, background: 'var(--info-zacht)', color: 'var(--info)' };

export default function Bronnen({ lang, openKaart, toon }: OnderdeelProps) {
  const [rapport, setRapport] = useState<RapportUit | null>(null);
  const [periode, setPeriode] = useState<'week' | 'maand' | ''>('');
  const [bezig, setBezig] = useState(false);
  const [orchUit, setOrchUit] = useState<OrchestratieKoppelingUit | null>(null);
  const [orchBezig, setOrchBezig] = useState(false);
  const [fout, setFout] = useState('');

  const haalRapport = async (p: 'week' | 'maand') => {
    setBezig(true); setPeriode(p);
    try { setRapport(await afstemmingClient.rapport(p)); setFout(''); }
    catch (e) { const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; setRapport(null); setFout(foutTekst(lang, code)); }
    finally { setBezig(false); }
  };

  const draaiOrchestratie = async (vastleggen: boolean) => {
    setOrchBezig(true);
    try {
      const uit = await afstemmingClient.orchestratieKoppeling(vastleggen);
      setOrchUit(uit);
      setFout('');
      if (vastleggen) {
        toon(tr(lang, `Збережено пропозицій зіставлення: ${uit.aangemaakt}.`, `Voorstellen uit orchestratie bewaard: ${uit.aangemaakt}.`));
      }
    } catch (e) {
      const code = e instanceof AfstemmingFout ? e.code : 'FOUT';
      setFout(foutTekst(lang, code));
    } finally {
      setOrchBezig(false);
    }
  };

  const bron = (naam: string, uitleg: string, stand: 'werkt', attr: string, detail?: string) => (
    <div style={S.rij} role='listitem' data-afv-bron={attr} data-afv-bron-stand={stand}>
      <span style={werkt}>{tr(lang, 'працює', 'werkt')}</span>
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
          {bron(tr(lang, 'Пропозиція картки', 'Kaartvoorstel'), tr(lang, 'Агент створює чернетку з повторостійким ключем — повторне надсилання не плодить дублікатів.', 'Een agent maakt een concept met idempotentiesleutel — opnieuw sturen maakt geen duplicaten.'), 'werkt', 'voorstel', 'POST /api/owner/afstemming/voorstel')}
          {bron(tr(lang, 'Додавання доказів', 'Bewijs aanhechten'), tr(lang, 'Випробування, знімок екрана або результат перевірки з посиланням і контрольним відбитком SHA-256; сам по собі доказ не підвищує етап.', 'Test, schermafdruk of controleresultaat met verwijzing en SHA-256; bewijs alleen verhoogt nooit de fase.'), 'werkt', 'bewijs', 'POST /api/owner/afstemming/bewijs')}
          {bron(tr(lang, 'Пропозиція зв’язку', 'Koppelvoorstel'), tr(lang, 'Кандидат «дублює/конфліктує/залежить» зі ступенем впевненості; рішення — за власником.', 'Kandidaat «dupliceert/conflicteert/hangt af» met benoemde zekerheid; het besluit blijft bij de eigenaar.'), 'werkt', 'koppel', "POST /api/owner/afstemming/koppel { actie: 'stel-voor' }")}
        </div>
      </section>
      <section className='afv-blok'>
        <h3><Plug2 aria-hidden='true' />{tr(lang, 'Автоматичне розпізнавання та перевірка джерел', 'Automatische herkenning en bronafstemming')}</h3>
        <div style={{ display: 'grid', gap: 8 }} role='list'>
          {bron(tr(lang, 'Розбір чернетки та вкладень PDF/зображень', 'Ontleding van concepten en PDF-/beeldbijlagen'), tr(lang, 'Структурування задуму за згодою людини з очищенням таємниць і читання тексту PDF/зображень у пам’яті без тимчасових файлів.', 'Structureren van ideeën met menselijke toestemming en geheugenextractie uit PDF en afbeeldingen zonder tijdelijke bestanden.'), 'werkt', 'ontleed', 'POST /api/owner/afstemming/ontleed · /bijlage-tekst')}
          {bron(tr(lang, 'Зіставлення з координацією orchestratie/ та випусками', 'Afstemming met orchestratie/ en uitrolgeschiedenis'), tr(lang, 'Автоматичне зіставлення завдань orchestratie/taken/, записів спадкоємності orchestratie/verwijzingen/ і встановлених випусків із картками.', 'Automatische koppeling van orchestratie/taken/, orchestratie/verwijzingen/ en geïnstalleerde releases aan kaarten.'), 'werkt', 'orchestratie', 'POST /api/owner/afstemming/orchestratie-koppeling')}
          {bron(tr(lang, 'Внутрішні проби маршрутів та пошук схожих вимог', 'Interne routecontroles en verwante eisen'), tr(lang, 'Безпечні проби готовності служб у режимі лише читання та лексико-графовий пошук кандидатів на зв’язок.', 'Alleen-lezen routecontroles van diensten en lexicaal-grafgebaseerde kandidaatselectie.'), 'werkt', 'proef', 'POST /api/owner/afstemming/proef · /kandidaten')}
        </div>
      </section>
      <section className='afv-blok' data-afv-orch-blok=''>
        <h3><GitMerge aria-hidden='true' />{tr(lang, 'Зіставлення з координацією orchestratie/', 'Afstemming met orchestratie/')}</h3>
        <p className='afv-hint'>{tr(lang,
          'Сервер у режимі лише читання звіряє orchestratie/taken/, orchestratie/verwijzingen/ та історію встановлених випусків з вашими картками. Знайдені збіги можна зберегти як пропозиції без автоматичного злиття.',
          'De server vergelijkt alleen-lezen orchestratie/taken/, orchestratie/verwijzingen/ en geïnstalleerde releases met uw kaarten. Gevonden overeenkomsten kunnen als voorstel worden bewaard zonder automatische samenvoeging.')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type='button' className='afv-knop' data-afv-orch-scan='' disabled={orchBezig} onClick={() => void draaiOrchestratie(false)}>
            {orchBezig ? tr(lang, 'Звіряємо…', 'Vergelijken…') : tr(lang, 'Перевірити збіги з orchestratie/', 'Overeenkomsten met orchestratie/ zoeken')}
          </button>
          {orchUit && orchUit.matches.length > 0 ? (
            <button type='button' className='afv-knop is-hoofd' data-afv-orch-vastleggen='' disabled={orchBezig} onClick={() => void draaiOrchestratie(true)}>
              {tr(lang, 'Зберегти знайдені пропозиції', 'Gevonden voorstellen bewaren')}
            </button>
          ) : null}
        </div>
        {orchUit ? (
          <div style={{ display: 'grid', gap: 8 }} data-afv-orch-uit=''>
            <p className='afv-hint'>
              {tr(
                lang,
                `Прочитано: завдань ${orchUit.gelezen.taken}, записів спадкоємності ${orchUit.gelezen.verwijzingen}, випусків ${orchUit.gelezen.releases} · збігів ${orchUit.matches.length} · ${geledenTekst(lang, orchUit.op)}`,
                `Gelezen: ${orchUit.gelezen.taken} taken, ${orchUit.gelezen.verwijzingen} verwijzingen, ${orchUit.gelezen.releases} releases · ${orchUit.matches.length} overeenkomsten · ${geledenTekst(lang, orchUit.op)}`,
              )}
            </p>
            {orchUit.matches.slice(0, 12).map((m) => (
              <div key={`${m.bronSoort}-${m.sleutel}-${m.kaartId}`} style={S.rij} data-afv-orch-match={m.bronSoort}>
                <span style={infoBadge}>{m.bronSoort}</span>
                <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 2 }}>
                  <strong>{m.externId} · {afstemmingTekst(m.kaartTitel, lang)}</strong>
                  <span className='afv-hint'>{m.titel} — {m.reden} ({Math.round(m.zekerheid * 100)}%)</span>
                  <code style={{ fontSize: 11 }}>{m.sleutel}</code>
                </div>
                <button type='button' className='afv-knop is-klein' onClick={() => openKaart(m.kaartId)}>{tr(lang, 'Відкрити картку', 'Kaart openen')}</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className='afv-blok'>
        <h3><FileClock aria-hidden='true' />{tr(lang, 'Звіт на вимогу', 'Rapport op aanvraag')}</h3>
        <p className='afv-hint'>{tr(lang, 'Без розсилок і нав’язливих листів (§9): звіт формується тут лише тоді, коли ви просите.', 'Zonder ongevraagde berichten (§9): het rapport verschijnt hier wanneer u erom vraagt.')}</p>
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
