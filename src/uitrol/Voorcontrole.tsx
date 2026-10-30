// Uitslag van de voorcontrole van de site (backend/uitrol-voorcontrole.ts) als overzichtelijke lijst met pictogrammen, per controle uitleg en details.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileCheck2, FileText, FlaskConical, KeyRound, Layers, Package, ScrollText, Tag, TerminalSquare, XCircle, type LucideIcon, GitCommitHorizontal, Languages, Copy } from 'lucide-react';
import { tr, type ControleNiveau, type Lang, type VoorcontroleUit } from './types';

const ICOON: Record<string, [LucideIcon, string, string, string, string]> = {
  structuur: [Package, 'Структура архіву', 'Archiefstructuur', 'Одна тека, лише звичайні файли, жодних посилань чи шляхів поза текою.', 'Eén map, alleen gewone bestanden, geen links of paden buiten de map.'],
  versie: [Tag, 'Версія', 'Versie', 'UITROL-VERSIE збігається із заявленою й новіша за встановлену.', 'UITROL-VERSIE klopt met de opgegeven versie en is nieuwer dan de geïnstalleerde.'],
  metadata: [FileText, 'Автор, агент, опис змін', 'Auteur, agent, beschrijving', 'AUTEUR, AGENT і SAMENVATTING (опис змін) — без них сервер відхиляє пакет.', 'AUTEUR, AGENT en SAMENVATTING (beschrijving) — zonder deze weigert de server het pakket.'],
  commit: [GitCommitHorizontal, 'Коміт (BRON-COMMIT)', 'Commit (BRON-COMMIT)', 'Повний git-коміт або явне «zonder-git:<причина>» — інакше не видно, який код працює, і сервер відхиляє пакет.', 'Volledige git-commit of uitdrukkelijk «zonder-git:<reden>» — anders is niet te zien welke code draait en weigert de server het pakket.'],
  scripts: [TerminalSquare, 'Скрипти встановлення', 'Installatiescripts', 'Синтаксис усіх shell-скриптів (вони виконуються від root).', 'Syntaxis van alle shell-scripts (ze draaien als root).'],
  bouwen: [Layers, 'Файли для збірки', 'Bouwbestanden', 'package.json, lock-файл, vite та серверна збірка — без них збірка на сервері впаде.', 'package.json, lockbestand, vite en serverbundel — zonder deze faalt de build op de server.'],
  migraties: [ScrollText, 'Міграції бази', 'Databasemigraties', 'Нумерація та руйнівні команди в НОВИХ міграціях (при відкаті вони не відкочуються).', 'Nummering en ingrijpende opdrachten in NIEUWE migraties (bij terugdraaien worden ze niet teruggedraaid).'],
  geheimen: [KeyRound, 'Секрети в пакеті', 'Geheimen in het pakket', 'Приватні ключі, токени чи .env у пакеті (показуємо лише назви файлів).', 'Privésleutels, tokens of .env in het pakket (we tonen alleen bestandsnamen).'],
  manifest: [Languages, 'Опис uk/nl і учасники', 'Beschrijving uk/nl en deelnemers', 'UITROL-MANIFEST.json: назва й опис українською та нідерландською, автор, кожен ШІ-агент з платформою, моделлю (підтверджена чи зі слів автора) і роллю.', 'UITROL-MANIFEST.json: titel en beschrijving in het Oekraïens en Nederlands, auteur, elke AI-agent met platform, model (bevestigd of volgens de auteur) en rol.'],
  tests: [FlaskConical, 'Тести підготовника', 'Tests van de voorbereider', 'Скільки автоматичних перевірок коду пройшло й не пройшло на комп’ютері того, хто зібрав пакет. Нижче — які саме файли тестів мали помилки: «ook op basis» означає, що ця помилка була й до змін (стара, не через цей випуск), «NIEUW» — з’явилась у цьому випуску. Сайт ці тести сам не запускає.', 'Hoeveel automatische codecontroles slaagden en faalden op de computer van wie het pakket bouwde. Hieronder welke testbestanden fouten hadden: «ook op basis» = de fout bestond al vóór de wijzigingen, «NIEUW» = ontstaan in deze release. De site voert deze tests zelf niet uit.'],
  voorcontrole: [FileCheck2, 'Перевірка пакета', 'Voorcontrole', 'Перевірку не вдалося виконати.', 'De voorcontrole kon niet worden uitgevoerd.'],
};
const NIVEAU_ICOON: Record<ControleNiveau, LucideIcon> = { ok: CheckCircle2, waarschuwing: AlertTriangle, fout: XCircle };

export default function Voorcontrole({ lang, v, compact = false }: { lang: Lang; v: VoorcontroleUit | null | undefined; compact?: boolean }) {
  const [open, setOpen] = useState<string>('');
  if (!v) return <p className='ut-hint'>{tr(lang, 'Для цього пакета немає результату перевірки сайту (його завантажили раніше).', 'Voor dit pakket is geen voorcontrole van de site bewaard (het is eerder geüpload).')}</p>;
  return <div className='ut-vc' data-ut-voorcontrole data-ok={v.ok}>
    <p className='ut-vc-kop' data-niveau={v.ok ? (v.waarschuwingen ? 'waarschuwing' : 'ok') : 'fout'}>
      {v.ok ? (v.waarschuwingen ? <AlertTriangle aria-hidden='true' /> : <CheckCircle2 aria-hidden='true' />) : <XCircle aria-hidden='true' />}
      <b>{v.ok ? (v.waarschuwingen ? tr(lang, `Перевірка пройдена, є зауваження: ${v.waarschuwingen}`, `Voorcontrole geslaagd, ${v.waarschuwingen} opmerking(en)`) : tr(lang, 'Усі перевірки пройдено', 'Alle controles geslaagd'))
        : tr(lang, `Пакет не пройшов перевірку: помилок ${v.fouten}`, `Pakket afgekeurd: ${v.fouten} fout(en)`)}</b>
    </p>
    <ul className='ut-vc-lijst'>
      {v.controles.map((c) => {
        const [Icoon, uk, nl, helpUk, helpNl] = ICOON[c.id] ?? ICOON.voorcontrole; const N = NIVEAU_ICOON[c.niveau]; const uitgeklapt = open === c.id;
        return <li key={c.id} data-niveau={c.niveau}>
          <button type='button' className='ut-vc-rij' aria-expanded={uitgeklapt} onClick={() => setOpen(uitgeklapt ? '' : c.id)}>
            <span className='ut-vc-pict'><Icoon aria-hidden='true' /></span>
            <span className='ut-vc-tekst'><b>{tr(lang, uk, nl)}</b><small>{lang === 'uk' ? c.uk : c.nl}</small></span>
            <N aria-hidden='true' className='ut-vc-niveau' /><ChevronDown aria-hidden='true' className='ut-vc-pijl' />
          </button>
          {uitgeklapt && <div className='ut-vc-uitleg'><p><b>{tr(lang, 'Що перевіряється: ', 'Wat wordt gecontroleerd: ')}</b>{tr(lang, helpUk, helpNl)}</p>
            {c.details?.length ? <><ul className='ut-vc-details'>{c.details.map((d, i) => <li key={i} data-nieuw={d.startsWith('[NIEUW]') || undefined}><code>{d}</code></li>)}</ul>
              <button type='button' className='ut-knop ut-knop-klein' onClick={() => { void navigator.clipboard?.writeText(c.details!.join('\n')).catch(() => undefined); }}><Copy aria-hidden='true' />{tr(lang, 'Копіювати список', 'Lijst kopiëren')}</button></> : null}</div>}
          {compact ? null : null}
        </li>;
      })}
    </ul>
  </div>;
}
