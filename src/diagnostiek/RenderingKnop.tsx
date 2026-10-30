// «Перевірити рендеринг» (zone A, 22.10.2026) — bij de controle «Рендеринг сторінок» in «Діагностика».
// De site start zelf geen browser: de knop zet (via de server) een leeg verzoekbestand neer; root (nazorg-timer, elke minuut) voert
// `mijn-ruimte-installeer rook-controle` uit en schrijft rook-controle.json. Daarna «Перевірити» op de kaart om de uitslag te lezen.
// Zonder browser op de server is de knop uitgeschakeld met de eerlijke uitleg (sudo mijn-ruimte-installeer browser-controle).
import { useCallback, useEffect, useState } from 'react';
import { Loader2, MonitorCheck, X } from 'lucide-react';
import { api } from '../platform/client';
import HulpVraag from '../hulp/HulpVraag';
import type { Lang } from './hulp';

type Laatste = { tijd: string; modus: string; kapot: boolean; uitgevoerd: boolean; samenvatting: { uk: string; nl: string }; paginas: Array<{ naam: string; stand: 'ok' | 'kapot'; fouten: string[]; http: number; ms: number }>; bundels: { aantal: number; ok: number; kapot: string[]; waarschuwingen: string[] } };
type Stand = { browser: boolean; wachtend: boolean; laatste: Laatste | null };
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

export default function RenderingKnop({ lang, ctx, onKlaar }: { lang: Lang; ctx: Record<string, unknown>; onKlaar?: () => void }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [toon, setToon] = useState(false);
  const laad = useCallback(async () => {
    try { const r = await api.post('/api/owner/admin/diagnostiek/rendering', ctx); setStand(r.data as Stand); } catch { setStand(null); }
  }, [ctx]);
  useEffect(() => { void laad(); }, [laad]);
  // Zolang er een verzoek wacht: elke 15 s kijken of root al klaar is.
  useEffect(() => {
    if (!stand?.wachtend) return;
    const t = window.setInterval(() => { void laad(); }, 15_000);
    return () => window.clearInterval(t);
  }, [stand?.wachtend, laad]);
  useEffect(() => { if (stand && !stand.wachtend && bezig) { setBezig(false); onKlaar?.(); } }, [stand, bezig, onKlaar]);

  const aanvragen = async () => {
    setMelding(''); setBezig(true);
    try {
      await api.post('/api/owner/admin/diagnostiek/rendering', { ...ctx, aanvragen: true });
      setMelding(tr(lang, 'Запит передано серверу: root виконає перевірку в браузері протягом хвилини (стенд із тестовим власником, 1–2 хв). Потім натисніть «Перевірити» на цій картці.', 'Verzoek doorgegeven: root voert de browsercontrole binnen een minuut uit (stand met testeigenaar, 1–2 min). Druk daarna op «Controleren» op deze kaart.'));
      await laad();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setBezig(false);
      setMelding(code === 'ROOK_GEEN_BROWSER'
        ? tr(lang, 'На сервері немає браузера: sudo mijn-ruimte-installeer browser-controle', 'Geen browser op de server: sudo mijn-ruimte-installeer browser-controle')
        : code === 'RATE_LIMITED' ? tr(lang, 'Забагато запитів: не частіше 3 разів на 10 хвилин.', 'Te veel verzoeken: hoogstens 3 keer per 10 minuten.')
          : tr(lang, 'Не вдалося передати запит (сервер не має доступу до теки goedkeur-inbox?).', 'Verzoek kon niet worden doorgegeven (geen toegang tot de map goedkeur-inbox?).'));
    }
  };
  const l = stand?.laatste ?? null;
  return (
    <div className='adg-rendering' data-adg-rendering data-browser={stand ? (stand.browser ? '1' : '0') : ''}>
      <div className='adg-details-knoppen'>
        <button type='button' className='adg-knop' data-adg-rendering-knop disabled={!stand || !stand.browser || bezig || stand.wachtend} onClick={() => void aanvragen()}
          title={stand && !stand.browser ? tr(lang, 'Немає браузера на сервері', 'Geen browser op de server') : undefined}>
          {bezig || stand?.wachtend ? <Loader2 className='adg-spin' /> : <MonitorCheck />}
          {stand?.wachtend ? tr(lang, 'Root виконує перевірку…', 'Root voert de controle uit…') : tr(lang, 'Перевірити рендеринг (браузер на сервері)', 'Rendering controleren (browser op de server)')}
        </button>
        <HulpVraag k='diagnostiek.rendering-aanvragen' lang={lang} />
        {l && <button type='button' className='adg-knop adg-knop-stil' onClick={() => setToon((v) => !v)}>{toon ? tr(lang, 'Сховати сторінки', 'Pagina’s verbergen') : tr(lang, `Сторінки останнього прогону (${l.paginas.length})`, `Pagina’s van de laatste run (${l.paginas.length})`)}</button>}
      </div>
      {stand && !stand.browser && <p className='adg-niet'>{tr(lang, 'Лише HTTP, рендеринг не перевірено: на сервері немає браузера. Установіть: sudo mijn-ruimte-installeer browser-controle (Chrome for Testing, закріплена версія, SHA-256, ~125 МБ).', 'Alleen HTTP, rendering niet gecontroleerd: er is geen browser op de server. Installeer: sudo mijn-ruimte-installeer browser-controle (Chrome for Testing, vastgepinde versie, SHA-256, ~125 MB).')}</p>}
      {melding && <p className='adg-melding' data-soort='let-op' role='status'>{melding}<button type='button' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={() => setMelding('')}><X /></button></p>}
      {toon && l && (
        <ul className='adg-rendering-lijst'>
          {l.paginas.map((p) => <li key={p.naam} data-stand={p.stand}><code>{p.naam}</code> <span>{p.stand === 'ok' ? tr(lang, 'рендериться', 'rendert') : tr(lang, 'ЗЛАМАНО', 'KAPOT')}{p.http ? ` · HTTP ${p.http}` : ''}{p.ms ? ` · ${p.ms} ${tr(lang, 'мс', 'ms')}` : ''}</span>{p.fouten.length > 0 && <small>{p.fouten.join(' | ')}</small>}</li>)}
          <li data-stand={l.bundels.kapot.length ? 'kapot' : 'ok'}><code>{tr(lang, 'бандли', 'bundels')}</code> <span>{l.bundels.ok}/{l.bundels.aantal}</span>{l.bundels.kapot.length > 0 && <small>{l.bundels.kapot.join(' | ')}</small>}{l.bundels.waarschuwingen.length > 0 && <small>{tr(lang, 'попередження: ', 'waarschuwing: ')}{l.bundels.waarschuwingen.join(' | ')}</small>}</li>
        </ul>
      )}
    </div>
  );
}
