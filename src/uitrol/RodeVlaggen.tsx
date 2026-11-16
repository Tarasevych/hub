// Червоні прапорці перед схваленням (SEC-PAKKET-001): окремий блок зі змінами, які дають найбільшу владу над сервером, і окреме
// підтвердження. Без позначки кнопка «Схвалити» неактивна; сервер так само відхиляє схвалення без неї (RISICO_NIET_BEVESTIGD).
// Rode vlaggen vóór het goedkeuren: een apart blok met de wijzigingen die de meeste macht over de server geven, en een eigen bevestiging.
import { Flag } from 'lucide-react';
import { tr, type Lang, type VoorcontroleUit } from './types';

export const rodeVlaggen = (vc: VoorcontroleUit | null | undefined): string[] | null => {
  const c = vc?.controles?.find((x) => x.id === 'risico');
  return c && c.niveau !== 'ok' ? (c.details ?? []) : null;
};

const SOORT: Record<string, [string, string, string, string]> = {
  root: ['Root', 'Root', 'Файл у deploy/: його виконує або встановлює root (скрипти, служби, sudoers). Шкідлива зміна тут = повний контроль над сервером.', 'Bestand in deploy/: root voert het uit of installeert het. Een kwaadaardige wijziging hier = volledige controle over de server.'],
  npm: ['npm', 'npm', 'Новий або змінений пакет npm чи скрипт встановлення: чужий код потрапляє у збірку на сервері.', 'Nieuw of gewijzigd npm-pakket of installatiescript: vreemde code komt in de build op de server.'],
  lock: ['Джерело', 'Bron', 'Пакет завантажується не з офіційного реєстру npm.', 'Een pakket komt niet uit het officiële npm-register.'],
  CI: ['GitHub', 'GitHub', 'Змінено процес GitHub Actions, який збирає випуск.', 'Een GitHub Actions-werkstroom die de release bouwt is gewijzigd.'],
  SQL: ['База', 'Database', 'Нова міграція змінює права в базі (функції з правами власника, ролі, RLS, доступ до файлів).', 'Een nieuwe migratie wijzigt rechten in de database (functies met eigenaarsrechten, rollen, RLS, bestandstoegang).'],
  '!': ['Увага', 'Let op', 'Не вдалося порівняти з встановленою версією.', 'Vergelijken met de geïnstalleerde versie lukte niet.'],
};

export default function RodeVlaggen({ lang, vlaggen, bevestigd, onBevestig, id, disabled }: { lang: Lang; vlaggen: string[]; bevestigd: boolean; onBevestig: (b: boolean) => void; id: string; disabled?: boolean }) {
  return <div className='ut-rode-vlaggen' role='group' aria-labelledby={`rv-kop-${id}`} data-ut-rode-vlaggen data-bevestigd={bevestigd || undefined}>
    <p className='ut-rv-kop' id={`rv-kop-${id}`}><Flag aria-hidden='true' /><b>{tr(lang, `Червоні прапорці: ${vlaggen.length}`, `Rode vlaggen: ${vlaggen.length}`)}</b></p>
    <details>
      <summary>{tr(lang, 'Що саме змінено', 'Wat er precies verandert')}</summary>
      <ul className='ut-rv-lijst'>
        {vlaggen.map((v, i) => {
          const m = /^\[([^\]]+)\]\s*(.*)$/.exec(v); const s = SOORT[m?.[1] ?? ''] ?? SOORT['!'];
          return <li key={i} title={tr(lang, s[2], s[3])}><span className='ut-rv-soort'>{tr(lang, s[0], s[1])}</span><code>{m ? m[2] : v}</code></li>;
        })}
      </ul>
    </details>
    <label className='ut-rv-bevestig' title={tr(lang, 'Без цієї позначки сервер не прийме схвалення. Якщо ви не очікували таких змін — відхиліть пакет: можливо, хтось отримав доступ до GitHub.', 'Zonder dit vinkje neemt de server de goedkeuring niet aan. Verwachtte u deze wijzigingen niet, wijs het pakket dan af: misschien heeft iemand toegang tot GitHub gekregen.')}>
      <input type='checkbox' checked={bevestigd} disabled={disabled} onChange={(e) => onBevestig(e.target.checked)} />
      <span>{tr(lang, 'Я переглянув ці зміни й очікував їх', 'Ik heb deze wijzigingen bekeken en verwachtte ze')}</span>
    </label>
  </div>;
}
