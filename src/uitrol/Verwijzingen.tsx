// VERWIJZING-001: посилання з людською назвою, підсумком і станом замість голого номера чи «404».
// Verwijzingen met titel, samenvatting en staat. Zonder browserafhankelijkheden, zodat ook de servertest het kan tonen.
import type { ReactElement } from 'react';
import type { ManifestVerwijzing, VerwijzingSoort, VerwijzingStaat } from '../../shared/uitrol-manifest';
import { tr, type Lang } from './types';

export const GH = 'https://github.com/Tarasevych/hub';
export const PR_ADRES = `${GH}/pull/`;

const ICOON: Record<VerwijzingSoort, ReactElement> = {
  pr: <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'><circle cx='4' cy='3.5' r='1.8' /><circle cx='4' cy='12.5' r='1.8' /><circle cx='12' cy='12.5' r='1.8' /><path d='M4 5.3v5.4M12 10.7V6.5a2 2 0 0 0-2-2H7.5M9 3l-1.5 1.5L9 6' /></svg>,
  tak: <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'><circle cx='4' cy='3.5' r='1.8' /><circle cx='4' cy='12.5' r='1.8' /><circle cx='12' cy='4.5' r='1.8' /><path d='M4 5.3v5.4M12 6.3c0 3-8 2-8 4.4' /></svg>,
  commit: <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'><circle cx='8' cy='8' r='2.6' /><path d='M1 8h4.4M10.6 8H15' /></svg>,
  migratie: <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'><ellipse cx='8' cy='3.5' rx='5' ry='2' /><path d='M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9M3 8c0 1.1 2.2 2 5 2s5-.9 5-2' /></svg>,
  taak: <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'><rect x='2.5' y='2' width='11' height='12' rx='2' /><path d='M5 6h6M5 9h6M5 12h3' /></svg>,
};
const STAAT_NAAM: Record<VerwijzingStaat, [string, string]> = {
  open: ['відкрито', 'open'], samengevoegd: ['злито', 'samengevoegd'], gesloten: ['закрито', 'gesloten'], verwijderd: ['гілку видалено', 'tak verwijderd'], onbekend: ['стан невідомий', 'staat onbekend'],
};
const STAAT_UITLEG: Record<VerwijzingStaat, [string, string]> = {
  open: ['Ще в роботі: посилання веде на живу гілку чи запит.', 'Nog in uitvoering: de link gaat naar de levende tak of PR.'],
  samengevoegd: ['Роботу влито в іншу гілку. Посилання ведуть на запит і коміт злиття, вони не зникають.', 'Samengevoegd. De links gaan naar de PR en de merge-commit; die verdwijnen niet.'],
  gesloten: ['Запит закрито без окремого злиття. Показано, куди ввійшла робота.', 'PR gesloten zonder eigen merge. Te zien is waar het werk in zit.'],
  verwijderd: ['Гілки вже немає. Показано, хто, коли й чому її видалив, і останній коміт, за яким її можна відкрити й відновити.', 'De tak bestaat niet meer. Te zien is wie, wanneer en waarom, en de laatste commit om haar te herstellen.'],
  onbekend: ['Гілки немає, а запису про її видалення не знайдено. Перевірте історію запитів на GitHub.', 'De tak ontbreekt en er is geen registratie van verwijdering.'],
};
const k7 = (sha?: string) => (sha ? sha.slice(0, 8) : '');
const datum = (lang: Lang, t?: string) => { if (!t) return ''; const d = new Date(t); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'nl' ? 'nl-NL' : 'uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const prLink = (s?: string) => { const m = String(s ?? '').match(/^[#№]?\s*(\d{1,6})$/); return m ? `${PR_ADRES}${m[1]}` : null; };

/** Текст стану людськими словами: коли й куди злито, хто й чому закрив чи видалив, куди ввійшла робота. */
export function staatTekst(lang: Lang, v: ManifestVerwijzing): string {
  const d = datum(lang, v.tijd); const waarom = (v.waarom ? (lang === 'nl' ? v.waarom.nl || v.waarom.uk : v.waarom.uk) : '').replace(/[.!…\s]+$/, '');
  if (v.soort === 'migratie') return tr(lang, `Входить у цей випуск${d ? `, додано ${d}` : ''}${v.commit ? `, коміт ${k7(v.commit)}` : ''}.`, `Hoort bij deze release${d ? `, toegevoegd ${d}` : ''}${v.commit ? `, commit ${k7(v.commit)}` : ''}.`);
  switch (v.staat) {
    case 'samengevoegd': return tr(lang, `Злито${d ? ` ${d}` : ''}${v.in ? ` у гілку ${v.in}` : ''}${v.commit ? `, коміт ${k7(v.commit)}` : ''}.${v.takWeg ? ' Саму гілку після злиття прибрано, її останній коміт лишається доступним.' : ''}`,
      `Samengevoegd${d ? ` ${d}` : ''}${v.in ? ` in ${v.in}` : ''}${v.commit ? `, commit ${k7(v.commit)}` : ''}.${v.takWeg ? ' De tak zelf is na de merge opgeruimd; de laatste commit blijft bereikbaar.' : ''}`);
    case 'gesloten': return tr(lang, `Закрито${d ? ` ${d}` : ''}${v.wie ? `, закрив ${v.wie}` : ''}${v.opgenomenIn ? `. Робота ввійшла в ${v.opgenomenIn}` : ''}.${waarom ? ` Причина: «${waarom}».` : ''}`,
      `Gesloten${d ? ` ${d}` : ''}${v.wie ? ` door ${v.wie}` : ''}${v.opgenomenIn ? `. Het werk zit in ${v.opgenomenIn}` : ''}.${waarom ? ` Reden: «${waarom}».` : ''}`);
    case 'verwijderd': return tr(lang, `Гілку видалив ${v.wie || 'невідомо хто'}${d ? ` ${d}` : ''}.${waarom ? ` Причина: «${waarom}».` : ''}${v.opgenomenIn ? ` Робота ввійшла в ${v.opgenomenIn}.` : ''}${v.laatsteCommit ? ` Останній коміт ${k7(v.laatsteCommit)} лишається доступним.` : ''}`,
      `Tak verwijderd door ${v.wie || 'onbekend'}${d ? ` ${d}` : ''}.${waarom ? ` Reden: «${waarom}».` : ''}${v.opgenomenIn ? ` Het werk zit in ${v.opgenomenIn}.` : ''}${v.laatsteCommit ? ` Laatste commit ${k7(v.laatsteCommit)} blijft bereikbaar.` : ''}`);
    case 'open': return tr(lang, v.soort === 'pr' ? 'Ще відкрито, у цю версію не злито.' : 'Гілка жива, роботу можна продовжити.', v.soort === 'pr' ? 'Nog open, niet in deze versie samengevoegd.' : 'De tak bestaat nog; het werk kan verder.');
    case 'onbekend': return tr(lang, `Гілки немає, і запису про її видалення не знайдено.${v.laatsteCommit ? ` Останній відомий коміт ${k7(v.laatsteCommit)}.` : ''}`, `De tak ontbreekt zonder registratie van verwijdering.${v.laatsteCommit ? ` Laatst bekende commit ${k7(v.laatsteCommit)}.` : ''}`);
    default: return '';
  }
}

type Knop = { t: string; uitleg: string; href: string };
/** Кнопки-посилання, що працюють і після злиття, закриття чи видалення гілки (коміти й запити не зникають). */
export function verwijzingKnoppen(lang: Lang, v: ManifestVerwijzing): Knop[] {
  const k: Knop[] = []; const add = (uk: string, nl: string, uitUk: string, uitNl: string, href: string | null) => { if (href && !k.some((x) => x.href === href)) k.push({ t: tr(lang, uk, nl), uitleg: tr(lang, uitUk, uitNl), href }); };
  const pr = v.soort === 'pr' ? Number(v.id) : v.pr;
  if (v.soort === 'taak') add('Досьє задачі', 'Taakdossier', 'Опис задачі: хто працював, що лишилось і на чому зупинились', 'Beschrijving van de taak: wie, wat nog open is, waar men stopte', v.pad ? `${GH}/blob/${v.bron || 'HEAD'}/${v.pad}` : null);
  if (v.soort === 'migratie') add('Файл міграції', 'Migratiebestand', 'Текст зміни бази даних саме в тій версії, що ввійшла у випуск', 'De databasewijziging zoals ze in deze release zit', v.pad ? `${GH}/blob/${v.bron || 'HEAD'}/${v.pad}` : null);
  if (pr) add('Запит на GitHub', 'PR op GitHub', 'Повна історія змін, обговорення й перевірки. Запит лишається доступним і після злиття чи закриття', 'Volledige geschiedenis, bespreking en controles; blijft bestaan na merge of sluiten', `${PR_ADRES}${pr}`);
  if (v.soort === 'tak' && v.staat === 'open') add('Гілка', 'Tak', 'Жива гілка: можна переглянути файли й продовжити роботу', 'Levende tak: bestanden bekijken en verder werken', `${GH}/tree/${encodeURI(String(v.id))}`);
  if (v.commit) add(v.soort === 'migratie' ? 'Коміт' : 'Коміт злиття', v.soort === 'migratie' ? 'Commit' : 'Merge-commit', v.soort === 'migratie' ? 'Зміна, якою міграцію додано' : 'Точне місце, де робота ввійшла в спільну гілку', v.soort === 'migratie' ? 'De commit die de migratie toevoegde' : 'Precies waar het werk in de gezamenlijke tak kwam', `${GH}/commit/${v.commit}`);
  if (v.laatsteCommit && v.staat !== 'open') add(v.staat === 'verwijderd' || v.staat === 'onbekend' ? 'Останній коміт' : 'Остання версія гілки', v.staat === 'verwijderd' || v.staat === 'onbekend' ? 'Laatste commit' : 'Laatste versie van de tak', 'Знімок гілки в останню мить. Працює навіть після видалення гілки, за ним її можна відновити', 'Momentopname van de tak; werkt ook na verwijdering en laat herstel toe', `${GH}/tree/${v.laatsteCommit}`);
  const opg = prLink(v.opgenomenIn); if (opg) add(`Куди ввійшло: ${v.opgenomenIn}`, `Opgenomen in ${v.opgenomenIn}`, 'Запит, у якому тепер ця робота', 'De PR waarin dit werk nu zit', opg);
  return k;
}

/** Команди для програміста: відкрити гілку чи відновити її з останнього коміту й продовжити задачу з повною картиною. */
function techniek(v: ManifestVerwijzing): string {
  const taak = v.taken[0]; const verder = taak ? `node scripts/orch.mjs begin --agent <id> --taak ${taak}` : '';
  const tak = v.soort === 'tak' ? String(v.id) : v.tak;
  if (v.soort === 'migratie' || v.soort === 'taak') return verder;
  if (tak && v.staat === 'open') return [`git switch ${tak}`, verder].filter(Boolean).join('  ·  ');
  if (v.laatsteCommit) return [`git switch -c ${tak || 'herstel'} ${k7(v.laatsteCommit)}`, verder].filter(Boolean).join('  ·  ');
  return verder;
}

export function VerwijzingRij({ lang, v }: { lang: Lang; v: ManifestVerwijzing }) {
  const titel = lang === 'nl' ? v.titel.nl || v.titel.uk : v.titel.uk;
  const sv = v.samenvatting ? (lang === 'nl' ? v.samenvatting.nl || v.samenvatting.uk : v.samenvatting.uk) : '';
  const st = staatTekst(lang, v); const knoppen = verwijzingKnoppen(lang, v); const cmd = techniek(v);
  return <details className='ut-vw' data-ut-verwijzing={`${v.soort}:${v.id}`}>
    <summary title={`${titel}. ${v.staat ? tr(lang, STAAT_UITLEG[v.staat][0], STAAT_UITLEG[v.staat][1]) : ''} ${tr(lang, 'Натисніть, щоб побачити підсумок і посилання.', 'Klik voor samenvatting en links.')}`}>
      <span className='ut-vw-ic'>{ICOON[v.soort]}</span><b>{v.label}</b><span className='ut-vw-titel'>{titel}</span>
      {v.staat ? <span className={`ut-vw-staat ut-vw-${v.staat}`}>{tr(lang, STAAT_NAAM[v.staat][0], STAAT_NAAM[v.staat][1])}</span> : null}
    </summary>
    <div className='ut-vw-kaart'>
      {sv && sv !== titel ? <p>{sv}</p> : null}
      {st ? <p className='ut-vw-stand'>{st}</p> : null}
      {knoppen.length ? <div className='ut-vw-knoppen'>{knoppen.map((x) => <a key={x.href} href={x.href} target='_blank' rel='noreferrer noopener' title={x.uitleg}>{x.t} ↗</a>)}</div> : null}
      <small className='ut-hint'>{tr(lang, 'Назву, підсумок і стан збережено у випуску, тож їх видно й без GitHub.', 'Titel, samenvatting en staat zitten in de release; ook zonder GitHub zichtbaar.')}</small>
      {cmd ? <details className='ut-vw-tech'><summary title={tr(lang, 'Як відкрити чи відновити гілку й продовжити задачу з повною історією', 'Hoe de tak openen of herstellen en de taak voortzetten')}>{tr(lang, 'Для програміста', 'Voor de programmeur')}</summary><code>{cmd}</code></details> : null}
    </div>
  </details>;
}

