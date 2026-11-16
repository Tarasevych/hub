// Червоні прапорці перед схваленням (SEC-PAKKET-001): окремий блок зі змінами, які дають найбільшу владу над сервером, і окреме
// підтвердження. Без позначки кнопка «Схвалити» неактивна; сервер так само відхиляє схвалення без неї (RISICO_NIET_BEVESTIGD).
// Rode vlaggen vóór het goedkeuren: een apart blok met de wijzigingen die de meeste macht over de server geven, en een eigen bevestiging.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Flag } from 'lucide-react';
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

function Item({ it, lang }: { it: RisicoItemUit; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(it.vlag); const s = SOORT[m?.[1] ?? ''] ?? SOORT['!'];
  const t = (x: { uk: string; nl: string }) => (lang === 'uk' ? x.uk : x.nl);
  const heeftUitleg = !!(t(it.wat) || it.verschil);
  return <li data-open={open || undefined} data-opvallend={it.opvallend?.length ? true : undefined}>
    <button type='button' className='ut-rv-rij' aria-expanded={open} disabled={!heeftUitleg} onClick={() => setOpen(!open)} title={tr(lang, s[2], s[3])}>
      <span className='ut-rv-soort'>{tr(lang, s[0], s[1])}</span><code>{m ? m[2] : it.vlag}</code>
      {it.opvallend?.length ? <AlertTriangle aria-label={tr(lang, 'є підозрілі рядки', 'verdachte regels')} className='ut-rv-let' /> : null}
      {heeftUitleg && <ChevronDown aria-hidden='true' className='ut-rv-pijl' />}
    </button>
    {open && <div className='ut-rv-uitleg'>
      {t(it.wat) && <p><b>{tr(lang, 'Що це: ', 'Wat is dit: ')}</b>{t(it.wat)}</p>}
      {t(it.wijziging) && <p><b>{tr(lang, 'Що змінилося: ', 'Wat verandert: ')}</b>{t(it.wijziging)}</p>}
      {it.betekenis?.length ? <><p><b>{tr(lang, 'Що означають зміни: ', 'Wat de wijzigingen betekenen: ')}</b></p><ul className='ut-rv-betekenis'>{it.betekenis.map((o, i) => <li key={i}><CheckCircle2 aria-hidden='true' />{t(o)}</li>)}</ul></> : null}
      {it.opvallend?.length ? <ul className='ut-rv-opvallend'>{it.opvallend.map((o, i) => <li key={i}><AlertTriangle aria-hidden='true' />{t(o)}</li>)}</ul> : null}
      {t(it.let) && <p><b>{tr(lang, 'На що звернути увагу: ', 'Waar op letten: ')}</b>{t(it.let)}</p>}
      {it.verschil && <Verschil tekst={it.verschil} afgekapt={it.verschilAfgekapt} lang={lang} />}
    </div>}
  </li>;
}

export default function RodeVlaggen({ lang, vlaggen, bevestigd, onBevestig, id, disabled }: { lang: Lang; vlaggen: RisicoItemUit[]; bevestigd: boolean; onBevestig: (b: boolean) => void; id: string; disabled?: boolean }) {
  return <div className='ut-rode-vlaggen' role='group' aria-labelledby={`rv-kop-${id}`} data-ut-rode-vlaggen data-bevestigd={bevestigd || undefined}>
    <p className='ut-rv-kop' id={`rv-kop-${id}`}><Flag aria-hidden='true' /><b>{tr(lang, `Червоні прапорці: ${vlaggen.length}`, `Rode vlaggen: ${vlaggen.length}`)}</b></p>
    <p className='ut-rv-intro'>{tr(lang, 'Ці зміни дають найбільшу владу над сервером. Відкрийте кожну: що це, що саме змінилося, на що звернути увагу.', 'Deze wijzigingen geven de meeste macht over de server. Open elke regel: wat het is, wat er verandert en waar u op moet letten.')}</p>
    <details open>
      <summary>{tr(lang, 'Що саме змінено (натисніть рядок — пояснення й різниця «було → стане»)', 'Wat er precies verandert (klik een regel — uitleg en verschil «voorheen → straks»)')}</summary>
      <ul className='ut-rv-lijst'>{vlaggen.map((it, i) => <Item key={i} it={it} lang={lang} />)}</ul>
    </details>
    <label className='ut-rv-bevestig' title={tr(lang, 'Без цієї позначки сервер не прийме схвалення. Якщо ви не очікували таких змін — відхиліть пакет: можливо, хтось отримав доступ до GitHub.', 'Zonder dit vinkje neemt de server de goedkeuring niet aan. Verwachtte u deze wijzigingen niet, wijs het pakket dan af: misschien heeft iemand toegang tot GitHub gekregen.')}>
      <input type='checkbox' checked={bevestigd} disabled={disabled} onChange={(e) => onBevestig(e.target.checked)} />
      <span>{tr(lang, 'Я переглянув ці зміни й очікував їх', 'Ik heb deze wijzigingen bekeken en verwachtte ze')}</span>
    </label>
  </div>;
}
