// TELEGRAM-002 — één pictogramtegel (vaste kleur bij het beeld + vectorpictogram + naam), exact zoals in het beveiligde Telegram-venster:
// vorm, kleur en opmaak komen uit dezelfde gegevens (shared/apparaat-bevestiging/symbolen.ts → pictogramTegel/tegelStijlen).
import { createElement } from 'react';
import { pictogramTegel, tegelStijlen } from '../../shared/apparaat-bevestiging/symbolen';
import './pictogram-tegel.css';

export default function PictogramTegel({ index, lang, groot = false }: { index: number; lang: 'uk' | 'nl'; groot?: boolean }) {
  const t = pictogramTegel(index, lang);
  if (!t) return null;
  const s = tegelStijlen(t.kleur, groot);
  return <span className='tg2-tegel' style={s.tegel} data-pictogram={t.id} role='img' aria-label={t.naam}>
    <svg viewBox='0 0 24 24' fill='none' stroke={t.inkt} strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' style={s.vorm}>
      {t.vorm.map(([tag, a], i) => createElement(tag, { key: i, ...a }))}
    </svg>
    <b style={s.naam}>{t.naam}</b>
  </span>;
}
