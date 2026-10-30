// UI-014 fase 2B (vlag meldingen-uitleg-v3): «Уся історія» — elke afzonderlijke melding (ook opgeruimde, uitgestelde en
// verborgen), met zoeken, filters (soort, bron, ernst, periode) en export van PRECIES de getoonde lijst als CSV of JSON,
// zonder geheimen (shared/meldingen-v2/status.ts zonderGeheimen; technische tekst en links gaan nooit mee).
import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { Ernst, V2Melding } from '../../../shared/meldingen-v2/groepering';
import { BEWAARDAGEN_KEUZES, exportRijen, historieLijst, naarCsv, type HistorieFilters, type StatusStand } from '../../../shared/meldingen-v2/status';
import { zetBewaarDagen } from './status-opslag';
import { soortInfo } from '../../../shared/melding-soorten';
import { MELDING_TYPES } from '../../../shared/melding-typen';

/** Filter «Тип» in mensentaal (geen interne codes zoals security_warning). */
const typeVan = (m: V2Melding) => soortInfo(m.categorie || m.soort || '').type;

type Lang = 'uk' | 'nl';
const ERNST_NAAM: Record<Ernst, [string, string]> = { fout: ['Помилка', 'Fout'], aandacht: ['Увага', 'Aandacht'], succes: ['Успіх', 'Gelukt'], info: ['Інформація', 'Info'] };
const STATUS_NAAM: Record<string, [string, string]> = { nieuw: ['Нове', 'Nieuw'], gelezen: ['Прочитане', 'Gelezen'], opgelost: ['Вирішено', 'Opgelost'], archief: ['Архів', 'Archief'], uitgesteld: ['Відкладено', 'Uitgesteld'], opgeruimd: ['Архів (прибрано)', 'Archief (opgeruimd)'] };

export default function HistorieV3(p: { lang: Lang; meldingen: V2Melding[]; stand: StatusStand; nu: number; dienstNaam: (d: string) => string }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [f, setF] = useState<HistorieFilters>({});
  const lijst = useMemo(() => historieLijst(p.meldingen, f, typeVan), [p.meldingen, f]);
  const rijen = useMemo(() => exportRijen(lijst, p.stand), [lijst, p.stand]);
  const diensten = [...new Set(p.meldingen.map((m) => m.dienst))];
  const soorten = [...new Set(p.meldingen.map(typeVan))];
  const wissel = <K extends 'dienst' | 'ernst' | 'soort'>(k: K, w: string) => setF((c) => { const l = (c[k] || []) as string[]; return { ...c, [k]: l.includes(w) ? l.filter((x) => x !== w) : [...l, w] }; });
  const chips = (k: 'dienst' | 'ernst' | 'soort', opties: Array<[string, string]>) => <div className='mv2-chips' role='group'>{opties.map(([w, l]) => <button key={w} type='button' aria-pressed={((f[k] || []) as string[]).includes(w)} onClick={() => wissel(k, w)}>{l}</button>)}</div>;
  const download = (soort: 'csv' | 'json') => {
    const inhoud = soort === 'csv' ? naarCsv(rijen) : JSON.stringify({ gemaakt: new Date(p.nu).toISOString(), aantal: rijen.length, meldingen: rijen }, null, 2);
    const url = URL.createObjectURL(new Blob([inhoud], { type: soort === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `meldingen-${new Date(p.nu).toISOString().slice(0, 10)}.${soort}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const tijd = (x: number) => new Date(x).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className='mv2-historie' data-mv2-historie={lijst.length}>
      <div className='mv2-zoek'><Search aria-hidden='true' /><input type='search' value={f.zoek || ''} placeholder={t('Пошук в історії', 'Zoeken in de geschiedenis')} aria-label={t('Пошук в історії', 'Zoeken in de geschiedenis')} onChange={(e) => setF((c) => ({ ...c, zoek: e.target.value }))} /></div>
      <details className='mv2-historie-filters'>
        <summary>{t('Фільтри', 'Filters')}</summary>
        <span className='mv2-label'>{t('Джерело', 'Bron')}</span>{chips('dienst', diensten.map((d) => [d, p.dienstNaam(d)]))}
        <span className='mv2-label'>{t('Важливість', 'Ernst')}</span>{chips('ernst', (Object.keys(ERNST_NAAM) as Ernst[]).map((e) => [e, t(...ERNST_NAAM[e])]))}
        {soorten.length ? <><span className='mv2-label'>{t('Тип', 'Soort')}</span>{chips('soort', soorten.map((s) => [s, MELDING_TYPES[s].naam[p.lang === 'uk' ? 0 : 1]]))}</> : null}
        <span className='mv2-label'>{t('Період', 'Periode')}</span>
        <div className='mv2-chips'>{([[0, t('Будь-коли', 'Altijd')], [86400_000, t('Доба', 'Dag')], [7 * 86400_000, t('Тиждень', 'Week')], [30 * 86400_000, t('Місяць', 'Maand')]] as Array<[number, string]>).map(([ms, l]) => <button key={ms} type='button' aria-pressed={ms ? f.vanaf === p.nu - ms : !f.vanaf} onClick={() => setF((c) => ({ ...c, vanaf: ms ? p.nu - ms : undefined }))}>{l}</button>)}</div>
      </details>
      <div className='mv2-regelbalk is-export'>
        <span className='mv2-uitleg'>{t(`Знайдено: ${lijst.length}`, `Gevonden: ${lijst.length}`)}</span>
        <button type='button' className='mv2-tekstknop' data-export='csv' disabled={!lijst.length} onClick={() => download('csv')}><Download aria-hidden='true' />CSV</button>
        <button type='button' className='mv2-tekstknop' data-export='json' disabled={!lijst.length} onClick={() => download('json')}><Download aria-hidden='true' />JSON</button>
      </div>
      <p className='mv2-uitleg'>{t('Експорт містить лише те, що видно в списку. Паролі, коди, ключі й технічні подробиці не експортуються.', 'De export bevat alleen wat in de lijst staat. Wachtwoorden, codes, sleutels en technische details gaan niet mee.')}</p>
      <ul className='mv2-lijst' aria-label={t('Уся історія', 'Volledige geschiedenis')}>
        {rijen.slice(0, 500).map((r, i) => (
          <li key={r.id} className={`mv2-rij mv2-hrij e-${r.ernst}`} data-status={r.status}>
            <span className='mv2-hoofd is-plat'>
              <span className='mv2-titel'>{lijst[i].titel}</span>
              <span className='mv2-meta'><span className='mv2-bron'>{p.dienstNaam(r.dienst)}</span><span className={`mv2-toestand t-${r.status}`}>{t(...(STATUS_NAAM[r.status] || STATUS_NAAM.nieuw))}</span><time dateTime={r.tijd}>{tijd(lijst[i].tijd)}</time></span>
            </span>
          </li>
        ))}
        {!rijen.length ? <li className='mv2-leeg'><span>{t('Нічого не знайдено', 'Niets gevonden')}</span></li> : null}
      </ul>
    </div>
  );
}

/** Bewaartermijn: вирішені → архів na N dagen; beveiliging blijft altijd in het archief. */
export function BewaarTermijn(p: { lang: Lang; dagen: number }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [fout, setFout] = useState(false);
  return (
    <fieldset className='mv2-regel' data-mv2-bewaar={p.dagen}>
      <legend>{t('Автоматичне архівування', 'Automatisch archiveren')}<small>{t('Вирішені переходять в архів через', 'Opgeloste gaan naar het archief na')}</small></legend>
      <div className='mv2-segment is-klein' role='radiogroup' aria-label={t('Термін', 'Termijn')}>
        {BEWAARDAGEN_KEUZES.map((d) => <button key={d} type='button' role='radio' aria-checked={p.dagen === d} onClick={() => void zetBewaarDagen(d).then((ok) => setFout(!ok))}>{t(`${d} дн`, `${d} d`)}</button>)}
      </div>
      <p className='mv2-uitleg'>{t('Ще через такий самий термін архівні прибираються з вкладки «Архів», але лишаються в «Уся історія». Сповіщення безпеки ніколи не прибираються — лише архівуються.', 'Na nog eens dezelfde termijn verdwijnen ze uit de tab «Archief», maar ze blijven in «Volledige geschiedenis». Beveiligingsmeldingen worden nooit opgeruimd, alleen gearchiveerd.')}</p>
      {fout ? <p className='mv2-toast' role='status'>{t('Не вдалося зберегти. Спробуйте ще раз.', 'Opslaan mislukt. Probeer opnieuw.')}</p> : null}
    </fieldset>
  );
}
