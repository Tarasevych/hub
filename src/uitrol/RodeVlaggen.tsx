// Червоні прапорці перед схваленням (SEC-PAKKET-001): окремий блок зі змінами, які дають найбільшу владу над сервером, і окреме
// підтвердження. Без позначки кнопка «Схвалити» неактивна; сервер так само відхиляє схвалення без неї (RISICO_NIET_BEVESTIGD).
// Rode vlaggen vóór het goedkeuren: een apart blok met de wijzigingen die de meeste macht over de server geven, en een eigen bevestiging.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Code2, Flag, Info } from 'lucide-react';
import { tr, type Lang, type RisicoItemUit, type VoorcontroleUit } from './types';

/** Прапорці з поясненнями; для старих записів перевірки (лише рядки) — прапорці без пояснень. */
export const rodeVlaggen = (vc: VoorcontroleUit | null | undefined): RisicoItemUit[] | null => {
  const c = vc?.controles?.find((x) => x.id === 'risico');
  if (!c || c.niveau === 'ok') return null;
  return c.vlaggen?.length ? c.vlaggen : (c.details ?? []).map((vlag) => ({ vlag, wat: { uk: '', nl: '' }, wijziging: { uk: '', nl: '' }, let: { uk: '', nl: '' } }));
};

const SOORT: Record<string, [string, string, string, string]> = {
  root: ['Root', 'Root', 'Файл у deploy/: його виконує або встановлює root (скрипти, служби, sudoers). Шкідлива зміна тут = повний контроль над сервером.', 'Bestand in deploy/: root voert het uit of installeert het. Een kwaadaardige wijziging hier = volledige controle over de server.'],
  npm: ['npm', 'npm', 'Новий або змінений пакет npm чи скрипт встановлення: чужий код потрапляє у збірку на сервері.', 'Nieuw of gewijzigd npm-pakket of installatiescript: vreemde code komt in de build op de server.'],
  lock: ['Джерело', 'Bron', 'Пакет завантажується не з офіційного реєстру npm.', 'Een pakket komt niet uit het officiële npm-register.'],
  GitHub: ['Вручну', 'Handmatig', 'Архів у випуску на GitHub завантажила людина, а не GitHub Actions. Якщо це зробили ви — усе гаразд. Якщо ні — відхиліть: так виглядає підробка з украденим токеном.', 'Het archief in de GitHub-release is door een mens geüpload, niet door GitHub Actions. Deed u dat zelf, dan is het goed. Zo niet: afwijzen — zo ziet een vervalsing met een gestolen token eruit.'],
  CI: ['GitHub', 'GitHub', 'Змінено процес GitHub Actions, який збирає випуск.', 'Een GitHub Actions-werkstroom die de release bouwt is gewijzigd.'],
  SQL: ['База', 'Database', 'Нова міграція змінює права в базі (функції з правами власника, ролі, RLS, доступ до файлів).', 'Een nieuwe migratie wijzigt rechten in de database (functies met eigenaarsrechten, rollen, RLS, bestandstoegang).'],
  '!': ['Увага', 'Let op', 'Не вдалося порівняти з встановленою версією.', 'Vergelijken met de geïnstalleerde versie lukte niet.'],
};

/** Різниця «було → стане»: червоні рядки були, зелені з’являться. Нумерація не потрібна — це не редактор. */
function Verschil({ tekst, afgekapt, lang }: { tekst: string; afgekapt?: boolean; lang: Lang }) {
  return <div className='ut-rv-diff' role='region' aria-label={tr(lang, 'Різниця: було → стане', 'Verschil: voorheen → straks')}>
    <p className='ut-rv-legenda'><span data-r='-'>− {tr(lang, 'було', 'voorheen')}</span><span data-r='+'>+ {tr(lang, 'стане', 'straks')}</span></p>
    <pre>{tekst.split('\n').map((r, i) => <span key={i} data-r={r.startsWith('+++') || r.startsWith('---') ? 'kop' : r.startsWith('@@') ? 'blok' : r[0] === '+' ? '+' : r[0] === '-' ? '-' : undefined}>{r || ' '}{'\n'}</span>)}</pre>
    {afgekapt && <p className='ut-hint'>{tr(lang, 'Показано лише початок — повну різницю дивіться в коміті на GitHub.', 'Alleen het begin wordt getoond — het volledige verschil staat in de commit op GitHub.')}</p>}
  </div>;
}

const RANG: Record<string, number> = { aandacht: 0, gewoon: 1, veiliger: 2 };
const OORDEEL: Record<string, [string, string, string]> = {
  veiliger: ['Безпечніше', 'Veiliger', 'ok'], gewoon: ['Звичайна зміна', 'Gewone wijziging', 'gewoon'], aandacht: ['Потребує уваги', 'Aandacht nodig', 'let'],
};

function Item({ it, lang }: { it: RisicoItemUit; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(it.vlag); const s = SOORT[m?.[1] ?? ''] ?? SOORT['!'];
  const t = (x: { uk: string; nl: string }) => (lang === 'uk' ? x.uk : x.nl);
  const l = it.leesbaar; const o = OORDEEL[l?.oordeel ?? 'aandacht'];
  const OIcoon = l?.oordeel === 'veiliger' ? CheckCircle2 : l?.oordeel === 'gewoon' ? Info : AlertTriangle;
  const heeftUitleg = !!(l || t(it.wat) || it.verschil);
  return <li data-open={open || undefined} data-oordeel={l?.oordeel ?? 'aandacht'}>
    <button type='button' className='ut-rv-rij' aria-expanded={open} disabled={!heeftUitleg} onClick={() => setOpen(!open)} title={tr(lang, s[2], s[3])}>
      <span className='ut-rv-oordeel' data-o={o[2]}><OIcoon aria-hidden='true' />{tr(lang, o[0], o[1])}</span>
      <span className='ut-rv-kort'><span>{l ? t(l.kort) : (m ? m[2] : it.vlag)}</span>{l && <small><code>{m ? m[2] : it.vlag}</code></small>}</span>
      {heeftUitleg && <ChevronDown aria-hidden='true' className='ut-rv-pijl' />}
    </button>
    {open && <div className='ut-rv-uitleg'>
      {l && <p className='ut-rv-doen' data-o={o[2]}><b>{tr(lang, 'Що робити: ', 'Wat te doen: ')}</b>{t(l.doen)}</p>}
      {l?.voorNa.length ? <ul className='ut-rv-voorna'>{l.voorNa.map((p, i) => <li key={i}>
        <span data-k='voor'><b>{tr(lang, 'Було: ', 'Was: ')}</b>{p.voor ? t(p.voor) : tr(lang, 'не було', 'bestond niet')}</span>
        <span data-k='na'><b>{tr(lang, 'Стане: ', 'Wordt: ')}</b>{p.na ? t(p.na) : tr(lang, 'прибрано', 'verwijderd')}</span>{p.keer && p.keer > 1 ? <small>{tr(lang, `у ${p.keer} місцях файла`, `op ${p.keer} plekken in het bestand`)}</small> : null}</li>)}</ul> : null}
      {l?.overig ? <p className='ut-hint'>{tr(lang, `Ще змінено рядків логіки програми: ${l.overig}. Їх словами не перекласти — потрібне пояснення автора або опис оновлення.`, `Nog ${l.overig} regel(s) programmalogica gewijzigd. Die zijn niet in woorden te vertalen — daarvoor is uitleg van de maker of de beschrijving van de update nodig.`)}</p> : null}
      {it.opvallend?.length ? <ul className='ut-rv-opvallend'>{it.opvallend.map((x, i) => <li key={i}><AlertTriangle aria-hidden='true' />{t(x)}</li>)}</ul> : null}
      {(t(it.wat) || it.betekenis?.length) && <details className='ut-rv-meer'><summary>{tr(lang, 'Докладніше', 'Meer uitleg')}</summary>
        {t(it.wat) && <p><b>{tr(lang, 'Що це: ', 'Wat is dit: ')}</b>{t(it.wat)}</p>}
        {t(it.wijziging) && <p><b>{tr(lang, 'Що змінилося: ', 'Wat verandert: ')}</b>{t(it.wijziging)}</p>}
        {it.betekenis?.length ? <ul className='ut-rv-betekenis'>{it.betekenis.map((x, i) => <li key={i}><CheckCircle2 aria-hidden='true' />{t(x)}</li>)}</ul> : null}
        {t(it.let) && <p><b>{tr(lang, 'На що звернути увагу: ', 'Waar op letten: ')}</b>{t(it.let)}</p>}
      </details>}
      {it.verschil && <details className='ut-rv-meer'><summary><Code2 aria-hidden='true' />{tr(lang, 'Для програміста: код змін', 'Voor de programmeur: code van de wijziging')}</summary>
        <Verschil tekst={it.verschil} afgekapt={it.verschilAfgekapt} lang={lang} /></details>}
    </div>}
  </li>;
}

/** Загальний підсумок угорі: скільки безпечніших, звичайних і тих, що потребують уваги, і одна порада. */
function Samenvatting({ vlaggen, lang }: { vlaggen: RisicoItemUit[]; lang: Lang }) {
  const n = (o: string) => vlaggen.filter((v) => (v.leesbaar?.oordeel ?? 'aandacht') === o).length;
  const a = n('aandacht'); const g = n('gewoon'); const v = n('veiliger');
  return <div className='ut-rv-samen' data-o={a ? 'let' : 'ok'}>
    <p className='ut-rv-tellers'>
      {a > 0 && <span data-o='let'><AlertTriangle aria-hidden='true' />{tr(lang, `Потребують уваги: ${a}`, `Aandacht nodig: ${a}`)}</span>}
      {g > 0 && <span data-o='gewoon'><Info aria-hidden='true' />{tr(lang, `Звичайні: ${g}`, `Gewoon: ${g}`)}</span>}
      {v > 0 && <span data-o='ok'><CheckCircle2 aria-hidden='true' />{tr(lang, `Безпечніше: ${v}`, `Veiliger: ${v}`)}</span>}
    </p>
    <p>{a ? tr(lang, 'Відкрийте пункти «Потребує уваги»: у кожному написано, що робити. Якщо сумніваєтеся — натисніть «Відхилити», нічого не зламається.', 'Open de punten «Aandacht nodig»: bij elk staat wat te doen. Twijfelt u, kies dan «Afwijzen» — er gaat niets stuk.')
      : tr(lang, 'Підозрілого не знайдено. Можна схвалювати, якщо ви очікували це оновлення.', 'Niets verdachts gevonden. U kunt goedkeuren als u deze update verwachtte.')}</p>
  </div>;
}

export default function RodeVlaggen({ lang, vlaggen, bevestigd, onBevestig, id, disabled }: { lang: Lang; vlaggen: RisicoItemUit[]; bevestigd: boolean; onBevestig: (b: boolean) => void; id: string; disabled?: boolean }) {
  return <div className='ut-rode-vlaggen' role='group' aria-labelledby={`rv-kop-${id}`} data-ut-rode-vlaggen data-bevestigd={bevestigd || undefined}>
    <p className='ut-rv-kop' id={`rv-kop-${id}`}><Flag aria-hidden='true' /><b>{tr(lang, `Червоні прапорці: ${vlaggen.length}`, `Rode vlaggen: ${vlaggen.length}`)}</b></p>
    <Samenvatting vlaggen={vlaggen} lang={lang} />
    <details open>
      <summary>{tr(lang, 'Усі зміни (натисніть пункт — що було, що стане і що робити)', 'Alle wijzigingen (klik een punt — wat was, wat wordt en wat te doen)')}</summary>
      <ul className='ut-rv-lijst'>{[...vlaggen].sort((x, y) => RANG[x.leesbaar?.oordeel ?? 'aandacht'] - RANG[y.leesbaar?.oordeel ?? 'aandacht']).map((it, i) => <Item key={i} it={it} lang={lang} />)}</ul>
    </details>
    <label className='ut-rv-bevestig' title={tr(lang, 'Без цієї позначки сервер не прийме схвалення. Якщо ви не очікували таких змін — відхиліть пакет: можливо, хтось отримав доступ до GitHub.', 'Zonder dit vinkje neemt de server de goedkeuring niet aan. Verwachtte u deze wijzigingen niet, wijs het pakket dan af: misschien heeft iemand toegang tot GitHub gekregen.')}>
      <input type='checkbox' checked={bevestigd} disabled={disabled} onChange={(e) => onBevestig(e.target.checked)} />
      <span>{tr(lang, 'Я переглянув ці зміни й очікував їх', 'Ik heb deze wijzigingen bekeken en verwachtte ze')}</span>
    </label>
  </div>;
}
