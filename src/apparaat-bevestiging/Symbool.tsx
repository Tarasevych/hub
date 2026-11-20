// APPARAAT-001 / UPD-006 — один символ на екрані: усі 96 із 96 векторних піктограм із shared/apparaat-bevestiging/pictogram-vormen.ts
// у кольорових плитках за змістом (Варіант А — єдиний вигляд на сайті й у Telegram), або велика цифра/літера.
// NL: één symbool op het scherm — alle 96 vectorpictogrammen in kleurtegels (Variant A, gelijk aan Telegram), of een groot cijfer/letter.
import { createElement, type CSSProperties } from 'react';
import { pictogramTegel, symbool, type VasteSoort } from '../../shared/apparaat-bevestiging/symbolen';

/** Стильові змінні кольорової плитки (Варіант А) для обгортки .apb-tegel при soort === 'pictogrammen'. */
export function tegelKleurStijl(soort: VasteSoort, index: number, lang: 'uk' | 'nl'): CSSProperties | undefined {
  if (soort !== 'pictogrammen') return undefined;
  const t = pictogramTegel(index, lang);
  if (!t) return undefined;
  return { '--apb-tegel-kleur': t.kleur, '--apb-tegel-inkt': t.inkt } as CSSProperties;
}

export type SymboolProps = { soort: VasteSoort; index: number; lang: 'uk' | 'nl'; uitgelicht?: boolean; klein?: boolean };
/** Суто відображення (без кнопки): зовнішня кнопка чи плитка визначає дію натискання. */
export default function Symbool({ soort, index, lang, uitgelicht = false, klein = false }: SymboolProps) {
  if (soort === 'pictogrammen') {
    const t = pictogramTegel(index, lang);
    if (!t) return null;
    return <span className={`apb-symbool is-kleur${uitgelicht ? ' is-uitgelicht' : ''}${klein ? ' is-klein' : ''}`} data-soort={soort} data-index={index} data-pictogram={t.id} aria-label={t.naam}>
      <svg className='apb-symbool-icoon' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
        {t.vorm.map(([tag, a], i) => createElement(tag, { key: i, ...a }))}
      </svg>
      <span className='apb-symbool-naam'>{t.naam}</span>
    </span>;
  }
  const s = symbool(soort, index, lang);
  if (!s) return null;
  return <span className={`apb-symbool${uitgelicht ? ' is-uitgelicht' : ''}${klein ? ' is-klein' : ''}`} data-soort={soort} data-index={index} aria-label={s.tekst}>
    <span className='apb-symbool-teken' aria-hidden='true'>{s.tekst}</span>
  </span>;
}
