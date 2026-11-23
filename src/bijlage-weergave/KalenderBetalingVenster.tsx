// Спільний перегляд вкладень, етап 3, розділ 15.3: «Додати оплату в Календар».
// Виконавець: Claude Opus 5.5 (High) через Google Antigravity (antigravity), на основі чистих функцій Grok
// (kalender-betaling.ts). Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений.
//
// Рішення Павла (питання 2, 22.11.2026): «Нехай людина щоразу вибирає календар». Тому:
//   • типової цілі НЕМАЄ: кнопка «Додати» неактивна, доки людина не вибере ціль;
//   • нічого не пишемо без натискання «Додати»; «Скасувати» та Esc нічого не записують;
//   • повторне натискання не множить подію: ключ betalingSleutelKort іде на сервер як idempotentieSleutel,
//     а пристрій пам’ятає, що вже зроблено (betalingSpoor), і показує це людині.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarCheck, CalendarPlus, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { kies, type Taal } from './soort';
import {
  BETALING_DOELEN, BETALING_DOEL_LABEL, BETALING_DOEL_UITLEG, BETALING_TOELICHTING,
  betalingSleutelKort, betalingSpoor, bewaarBetalingSpoor, geldigeIsoDag, googleAgendaAdres, herinneringenVoor, maakBetalingOntwerp,
  type BetalingBron, type BetalingDoel, type BetalingSpoor,
} from './kalender-betaling';
import { opysBedrag, opysTermijn } from './snelkaart';

type Fase =
  | { soort: 'keuze' }
  | { soort: 'bezig' }
  | { soort: 'klaar'; doel: BetalingDoel; al?: boolean }
  | { soort: 'toestemming'; authUrl: string }
  | { soort: 'fout'; code: string };

function foutUitleg(code: string): readonly [string, string] {
  if (code === 'AGENDA_BEZIG') return ['Попередній запис цієї оплати ще триває. Зачекайте кілька секунд і натисніть ще раз — другої події не буде.', 'De vorige schrijfactie voor deze betaling loopt nog. Wacht enkele seconden en klik opnieuw — er komt geen tweede afspraak.'];
  if (/SESSIE|403|OWNER_AGENDA/i.test(code)) return ['Немає права запису в Календар для цього облікового запису.', 'Geen schrijfrecht in de Agenda voor dit account.'];
  if (/NETWORK|Network|Failed to fetch|offline/i.test(code)) return ['Немає зв’язку із сервером. Нічого не записано, спробуйте ще раз.', 'Geen verbinding met de server. Er is niets geschreven, probeer opnieuw.'];
  if (/ONGELDIG|VORM/i.test(code)) return ['Календар не прийняв дату чи назву. Перевірте поля.', 'De Agenda accepteerde de datum of titel niet. Controleer de velden.'];
  return ['Календар не відповів як слід. Нічого не втрачено, спробуйте ще раз.', 'De Agenda antwoordde niet zoals verwacht. Er is niets verloren, probeer opnieuw.'];
}

export function KalenderBetalingVenster(p: { taal: Taal; bron: BetalingBron; onSluit: () => void }) {
  const t = (uk: string, nl: string) => kies(p.taal, [uk, nl]);
  const kopId = useId();
  const termijn = p.bron.velden.termijn?.iso || '';
  const sleutel = useMemo(() => betalingSleutelKort(p.bron), [p.bron]);
  const [spoor, setSpoor] = useState<BetalingSpoor | null>(() => betalingSpoor(sleutel));
  // ВАЖЛИВО: жодної типової цілі — людина вибирає щоразу (рішення Павла).
  const [doel, setDoel] = useState<BetalingDoel | null>(null);
  const eerste = useMemo(() => maakBetalingOntwerp({ ...p.bron, taal: p.taal }, 'onze-agenda'), [p.bron, p.taal]);
  const [titel, setTitel] = useState(() => (eerste.ok ? eerste.ontwerp.vorm.titel : ''));
  const [datum, setDatum] = useState(termijn);
  const [dagVoor, setDagVoor] = useState(true);
  const [opDag, setOpDag] = useState(true);
  const [fase, setFase] = useState<Fase>({ soort: 'keuze' });
  const vensterRef = useRef<HTMLDivElement | null>(null);
  const sluitRef = useRef(p.onSluit);
  sluitRef.current = p.onSluit;

  useEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    vensterRef.current?.querySelector<HTMLElement>('input[type="radio"]')?.focus({ preventScroll: true });
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); sluitRef.current(); } };
    document.addEventListener('keydown', toets, true);
    return () => { document.removeEventListener('keydown', toets, true); if (vorige?.isConnected) vorige.focus({ preventScroll: true }); };
  }, []);

  const datumGoed = geldigeIsoDag(datum);
  const kanToevoegen = Boolean(doel) && datumGoed && titel.trim().length > 0 && fase.soort !== 'bezig';

  const ontwerpNu = () => {
    if (!doel) return null;
    const bron: BetalingBron = { ...p.bron, taal: p.taal, velden: { ...p.bron.velden, termijn: { iso: datum, bron: p.bron.velden.termijn?.bron || 'людина' } } };
    const uit = maakBetalingOntwerp(bron, doel);
    if (!uit.ok) return null;
    const vorm = { ...uit.ontwerp.vorm, titel: titel.trim().slice(0, 300), herinneringen: herinneringenVoor([...(dagVoor ? [1440] : []), ...(opDag ? [0] : [])]) };
    return { vorm, meld: uit.ontwerp.meldDeelnemers };
  };

  const toevoegen = async () => {
    if (!kanToevoegen || !doel) return;
    const o = ontwerpNu();
    if (!o) { setFase({ soort: 'fout', code: 'VORM_ONGELDIG' }); return; }
    if (doel === 'google-agenda') {
      const adres = googleAgendaAdres(o.vorm);
      if (!adres) { setFase({ soort: 'fout', code: 'VORM_ONGELDIG' }); return; }
      window.open(adres, '_blank', 'noopener,noreferrer');
      const s: BetalingSpoor = { doel, wanneer: Date.now(), datum };
      bewaarBetalingSpoor(sleutel, s); setSpoor(s);
      setFase({ soort: 'klaar', doel });
      return;
    }
    setFase({ soort: 'bezig' });
    try {
      const { maakGebeurtenis } = await import('../agenda/agenda-client');
      const r = await maakGebeurtenis(sleutel, o.vorm, o.meld);
      if (r?.uitbreiding?.nodig) {
        const { startUitbreiding } = await import('../agenda/agenda-client');
        const u = await startUitbreiding().catch(() => null);
        if (u?.authUrl) { setFase({ soort: 'toestemming', authUrl: u.authUrl }); return; }
        setFase({ soort: 'fout', code: 'OWNER_AGENDA_TOESTEMMING' }); return;
      }
      if (r?.uitslag === 'bezig') { setFase({ soort: 'fout', code: 'AGENDA_BEZIG' }); return; } // той самий ключ ще в дорозі: повтор безпечний
      if (!r?.ok && r?.uitslag !== 'herhaald') { setFase({ soort: 'fout', code: String(r?.fout || r?.uitslag || 'AGENDA_SCHRIJVEN_MISLUKT') }); return; }
      const s: BetalingSpoor = { doel, wanneer: Date.now(), datum, gebeurtenisId: r.gebeurtenisId, agendaId: r.agendaId };
      bewaarBetalingSpoor(sleutel, s); setSpoor(s);
      // backend/agenda-google.ts: 'herhaald' — сервер уже бачив цей ключ і другої події не створив
      setFase({ soort: 'klaar', doel, al: r.uitslag === 'herhaald' });
    } catch (e: unknown) {
      setFase({ soort: 'fout', code: e instanceof Error ? e.message : 'AGENDA_SCHRIJVEN_MISLUKT' });
    }
  };

  const bedrag = p.bron.velden.bedrag ? opysBedrag(p.bron.velden.bedrag.centen, p.bron.velden.bedrag.valuta, p.taal) : '';

  return (
    <div className='weergave-dialoog-laag' role='presentation' onMouseDown={(e) => { if (e.target === e.currentTarget) p.onSluit(); }}>
      <div className='weergave-dialoog' role='dialog' aria-modal='true' aria-labelledby={kopId} ref={vensterRef}>
        <header>
          <CalendarPlus aria-hidden='true' />
          <strong id={kopId}>{t('Додати оплату в Календар', 'Betaling aan Agenda toevoegen')}</strong>
          <button type='button' className='weergave-knop rond' aria-label={t('Закрити', 'Sluiten')} onClick={p.onSluit}><X aria-hidden='true' /></button>
        </header>

        {fase.soort === 'klaar' ? (
          <section className='weergave-dialoog-klaar' role='status'>
            <CalendarCheck aria-hidden='true' />
            <p>{fase.doel === 'onze-agenda'
              ? (fase.al ? t('Цю оплату вже було додано раніше — другої події не створено.', 'Deze betaling stond er al — er is geen tweede afspraak gemaakt.') : t(`Додано в Календар на ${opysTermijn(datum, 'uk')}.`, `Toegevoegd aan de Agenda op ${opysTermijn(datum, 'nl')}.`))
              : t('Вікно Google Календаря відкрито в новій вкладці. Збережіть подію там.', 'Het venster van Google Agenda is in een nieuw tabblad geopend. Sla de afspraak daar op.')}</p>
            <div className='weergave-dialoog-knoppen'><button type='button' className='weergave-hoofd' onClick={p.onSluit}>{t('Готово', 'Klaar')}</button></div>
          </section>
        ) : fase.soort === 'toestemming' ? (
          <section role='alert'>
            <p>{t('Щоб записувати в Календар, Google має дати дозвіл на запис. Нічого ще не записано.', 'Om in de Agenda te schrijven moet Google schrijfrecht geven. Er is nog niets geschreven.')}</p>
            <div className='weergave-dialoog-knoppen'>
              <a className='weergave-hoofd' href={fase.authUrl}><ExternalLink aria-hidden='true' />{t('Дати дозвіл', 'Toestemming geven')}</a>
              <button type='button' className='weergave-knop' onClick={p.onSluit}>{t('Скасувати', 'Annuleren')}</button>
            </div>
          </section>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void toevoegen(); }}>
            <p className='weergave-dialoog-uitleg'>{kies(p.taal, BETALING_TOELICHTING)}</p>
            {spoor && (
              <p className='weergave-dialoog-spoor' role='note'>
                {spoor.doel === 'onze-agenda'
                  ? t(`Ви вже додавали цю оплату в Календар (${opysTermijn(spoor.datum, 'uk')}). Повторне додавання не створить другу подію.`, `U heeft deze betaling al aan de Agenda toegevoegd (${opysTermijn(spoor.datum, 'nl')}). Opnieuw toevoegen maakt geen tweede afspraak.`)
                  : t('Ви вже відкривали Google Календар для цієї оплати. Перевірте, чи подію збережено там.', 'U heeft Google Agenda al geopend voor deze betaling. Controleer of de afspraak daar is opgeslagen.')}
              </p>
            )}
            <fieldset className='weergave-dialoog-doelen'>
              <legend>{t('Куди записати (щоразу вибираєте самі)', 'Waar schrijven (u kiest elke keer zelf)')}</legend>
              {BETALING_DOELEN.map((d) => (
                <label key={d} data-gekozen={doel === d ? 'ja' : undefined}>
                  <input type='radio' name='weergave-betaling-doel' value={d} checked={doel === d} onChange={() => setDoel(d)} />
                  <span><b>{kies(p.taal, BETALING_DOEL_LABEL[d])}</b><small>{kies(p.taal, BETALING_DOEL_UITLEG[d])}</small></span>
                </label>
              ))}
            </fieldset>
            <label className='weergave-dialoog-veld'><span>{t('Назва', 'Titel')}</span><input value={titel} maxLength={300} onChange={(e) => setTitel(e.currentTarget.value)} /></label>
            <label className='weergave-dialoog-veld'><span>{t('Дата сплати', 'Betaaldatum')}</span><input type='date' value={datum} onChange={(e) => setDatum(e.currentTarget.value)} aria-invalid={!datumGoed} /></label>
            {bedrag && <p className='weergave-dialoog-feit'>{t('Сума в описі події', 'Bedrag in de beschrijving')}: <b>{bedrag}</b></p>}
            <fieldset className='weergave-dialoog-herinneringen'>
              <legend>{t('Нагадування', 'Herinneringen')}</legend>
              <label><input type='checkbox' checked={dagVoor} onChange={(e) => setDagVoor(e.currentTarget.checked)} />{t('за день', 'een dag ervoor')}</label>
              <label><input type='checkbox' checked={opDag} onChange={(e) => setOpDag(e.currentTarget.checked)} />{t('у день сплати', 'op de betaaldag')}</label>
            </fieldset>
            {fase.soort === 'fout' && <p className='weergave-dialoog-fout' role='alert'>{kies(p.taal, foutUitleg(fase.code))}</p>}
            <div className='weergave-dialoog-knoppen'>
              <button type='submit' className='weergave-hoofd' disabled={!kanToevoegen} aria-disabled={!kanToevoegen}>
                {fase.soort === 'bezig' ? <LoaderCircle className='spin' aria-hidden='true' /> : <CalendarPlus aria-hidden='true' />}
                {doel === 'google-agenda' ? t('Відкрити в Google Календарі', 'Openen in Google Agenda') : t('Додати', 'Toevoegen')}
              </button>
              <button type='button' className='weergave-knop' onClick={p.onSluit}>{t('Скасувати', 'Annuleren')}</button>
            </div>
            {!doel && <p className='weergave-dialoog-noot'>{t('Спершу виберіть календар.', 'Kies eerst een agenda.')}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
