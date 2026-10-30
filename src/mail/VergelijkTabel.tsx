// «Порівняти» (pakket 3 «Adaptive Mail Canvas», 24.10.2026): de brief als tabel per alinea — origineel links, vertaling rechts (op de
// telefoon onder elkaar). Макет: «таблиця абзаців nl ↔ uk (§1–§4) з виділеним абзацом-джерелом і позначкою «Джерело для 2 пунктів ШІ ·
// знайдено дослівно»». De alinea's zijn dezelfde als die van «Що від вас потрібно?» (shared/ai-bronnen.ts alineasVan), dus §3 is hier
// dezelfde §3 als op de bronchip. De vertaling vraagt de tabel zelf aan (één verzoek per brief en taal; het blijft in de cache van
// de server) — alleen met een privé-agent, alleen omdat u «Порівняти» koos.
import { LoaderCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { alineasVan } from '../../shared/ai-bronnen';
import { taalLabel } from '../../shared/ai-vertaling';
import { aiFoutVan, aiRun, type AiFout } from './ai-staat';
import './ai-blok.css';

type Props = {
  lang: 'uk' | 'nl';
  context: Record<string, string>;
  accountId: string;
  agentId: string;
  berichtId: string;
  tekst: string;
  bronTaal: string;
  doelTaal: string;
  /** Per alineanummer: hoeveel getoonde AI-punten hun bron hier hebben. */
  bronnen: Record<number, number>;
  /** Alinea die even oplicht (na «Показати абзац у листі» terwijl de tabel open is). */
  licht?: number;
};

export const MAX_VERGELIJK_ALINEAS = 60;

export default function VergelijkTabel(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const kopId = useId();
  const alineas = useMemo(() => alineasVan(p.tekst).slice(0, MAX_VERGELIJK_ALINEAS), [p.tekst]);
  const [vertaald, setVertaald] = useState<Record<string, string>>({});
  // meteen «…» (het verzoek start in het effect): anders stond bij de eerste weergave even «не перекладено» bij elke alinea
  const [bezig, setBezig] = useState(() => Boolean(p.agentId && alineas.length));
  const [fout, setFout] = useState<AiFout | null>(null);
  useEffect(() => {
    if (!p.agentId || !alineas.length) return;
    let actief = true;
    setBezig(true); setFout(null); setVertaald({});
    void aiRun(p.context, {
      mode: 'translate', targetLang: p.doelTaal, agentId: p.agentId, accountId: p.accountId, messageId: `${p.berichtId}:vergelijk`,
      subject: '', bodyText: '', segments: alineas.map((a, i) => ({ id: `p:${i + 1}`, text: a })),
    }).then((r) => { if (actief) setVertaald(r.translations || {}); }, (e) => { if (actief) setFout(aiFoutVan(e)); }).finally(() => { if (actief) setBezig(false); });
    return () => { actief = false; };
  }, [p.agentId, p.berichtId, p.doelTaal, alineas.join('\u001f')]);
  const meervoud = (n: number) => (p.lang === 'uk' ? (n === 1 ? 'пункту' : 'пунктів') : n === 1 ? 'punt' : 'punten');
  /** 1 абзац, 2–4 абзаци, 5+ абзаців (11–14 абзаців) */
  const abzaci = (n: number) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? 'абзац' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'абзаци' : 'абзаців'; };
  // zonder agent wordt er niets gevraagd: dan is er ook niets «niet vertaald door de motor»
  const onvertaald = p.agentId && !bezig && !fout ? alineas.filter((_, i) => !vertaald[`p:${i + 1}`]).length : 0;

  return (
    <div className='vergelijk' data-vergelijk-tabel data-mail-translation-skip='true'>
      {/* de kop staat boven de tabel, niet als <caption>: zodra de tabel geen display:table heeft (telefoon, smalle CSS) krimpt een
          caption tot een smalle kolom — gemeten in de stand op 360–640 px */}
      <div className='vergelijk-kop' id={kopId}>
        {t('Оригінал і переклад по абзацах', 'Origineel en vertaling per alinea')} · {taalLabel(p.lang, p.bronTaal) || p.bronTaal.toUpperCase()} ↔ {taalLabel(p.lang, p.doelTaal)}
        {bezig && <LoaderCircle className='spin' aria-label={t('Перекладаємо…', 'Bezig met vertalen…')} />}
      </div>
      <table aria-labelledby={kopId}>
        <thead><tr><th scope='col'>§</th><th scope='col'>{t('Оригінал', 'Origineel')}</th><th scope='col'>{t('Переклад ШІ', 'Vertaling door AI')}</th></tr></thead>
        <tbody>
          {alineas.map((a, i) => {
            const nr = i + 1, n = p.bronnen[nr] || 0, v = vertaald[`p:${nr}`];
            return (
              <tr key={nr} data-alinea={nr} data-bron={n ? 'ja' : undefined} data-licht={p.licht === nr ? 'ja' : undefined}>
                <th scope='row'>§{nr}</th>
                <td lang={p.bronTaal}>
                  {a}
                  {n > 0 && <span className='vergelijk-bron'>{t(`Джерело для ${n} ${meervoud(n)} · знайдено дослівно`, `Bron voor ${n} ${meervoud(n)} · letterlijk gevonden`)}</span>}
                </td>
                <td lang={p.doelTaal}>{v || (bezig ? <span className='vergelijk-wacht'>…</span> : <em>{t('не перекладено', 'niet vertaald')}</em>)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fout && <p className='ai-blok-fout' role='alert'>{t(fout.uk, fout.nl)}</p>}
      <small className='vergelijk-noot'>
        {t('Переклад ШІ — не частина листа. Дати, суми й терміни звіряйте з оригіналом (ліворуч).', 'De vertaling door AI is geen deel van het bericht. Controleer datums, bedragen en termijnen in het origineel (links).')}
        {onvertaald > 0 ? ` ${t(`${onvertaald} ${abzaci(onvertaald)} рушій не переклав — вони лишилися без перекладу.`, `${onvertaald === 1 ? '1 alinea' : `${onvertaald} alinea's`} heeft de motor niet vertaald — ${onvertaald === 1 ? 'die blijft' : 'die blijven'} zonder vertaling.`)}` : ''}
        {!p.agentId ? ` ${t('Переклад потребує ШІ-агента («Доступ ШІ»); без нього нічого не надсилається.', 'Vertalen vraagt een AI-agent («AI-toegang»); zonder agent wordt niets verzonden.')}` : ''}
        {alineas.length >= MAX_VERGELIJK_ALINEAS ? ` ${t(`Показано перші ${MAX_VERGELIJK_ALINEAS} абзаців.`, `De eerste ${MAX_VERGELIJK_ALINEAS} alinea's worden getoond.`)}` : ''}
      </small>
    </div>
  );
}
