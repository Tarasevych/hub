// admin → Інтеграції → «Майстер підключень»: LOGO'S VAN AFZENDERS VAN HUN EIGEN DOMEIN (21.10.2026, backend/merk-bron.ts).
// De eigenaar van de site beslist of de server logo's van domeinen ophaalt (BIMI-record in de DNS, pictogram van de officiële
// website van het domein). Standaard AAN; de uitleg zegt eerlijk wat het domein daarvan ziet (het IP van de server). Hier staat ook
// hoeveel logo's de database van de site al heeft, en per bron (BIMI / website / manifest / favicon).
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import HulpVraag from '../hulp/HulpVraag';
import { MERK_BRON_TEKST } from '../../shared/merk-bron-tekst';

type Lang = 'uk' | 'nl';
type Stand = { aan: boolean; totaal: number; met: number; zonder: number; perBron: Record<string, number>; wachtrij: number };
const BRON: Record<string, [string, string]> = { bimi: ['BIMI', 'BIMI'], favicon: ['значок сайту', 'pictogram van de website'], manifest: ['маніфест сайту', 'manifest van de website'] };

export default function MerkBronBeheer({ lang, context }: { lang: Lang; context: Record<string, unknown> }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const laden = async () => {
    try { setStand((await api.post('/api/owner/admin/merk-bron/stand', context)).data as Stand); setFout(''); }
    catch (e) { setFout(String((e as { message?: string } | null)?.message || 'HTTP')); }
  };
  useEffect(() => { void laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const zetten = async (aan: boolean) => {
    setBezig(true);
    try { await api.post('/api/owner/admin/merk-bron/zetten', { ...context, aan }); await laden(); }
    catch (e) { setFout(String((e as { message?: string } | null)?.message || 'HTTP')); }
    finally { setBezig(false); }
  };
  const L = lang === 'uk' ? 'uk' : 'nl';
  return (
    <section className='il-sectie' data-merk-bron-beheer style={{ marginTop: 24, display: 'grid', gap: 10 }}>
      <h3 className='il-sectiekop'>{t('Логотипи відправників', 'Logo\'s van afzenders')}</h3>
      <label style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 10, alignItems: 'start', minHeight: 'var(--tik-hoogte)' }}>
        <input data-hulp='integraties.merk-bron' type='checkbox' checked={stand?.aan === true} disabled={bezig || !stand} onChange={(e) => void zetten(e.target.checked)} style={{ width: 20, height: 20, marginTop: 3 }} />
        <span style={{ display: 'grid', gap: 4 }}>
          <strong>{MERK_BRON_TEKST.siteSchakelaar[L]} <HulpVraag k='integraties.merk-bron' /></strong>
          <small style={{ color: 'var(--muted)', fontSize: 13, maxWidth: '72ch' }}>{MERK_BRON_TEKST.siteUitleg[L]}</small>
        </span>
      </label>
      {stand ? <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        {t(`У базі сайту: ${stand.met} логотипів`, `In de database van de site: ${stand.met} logo's`)}
        {Object.entries(stand.perBron).length ? ` (${Object.entries(stand.perBron).map(([b, n]) => `${(BRON[b] || [b, b])[lang === 'uk' ? 0 : 1]}: ${n}`).join(', ')})` : ''}
        {stand.zonder ? t(` · без логотипа (перевірено, повтор через добу): ${stand.zonder}`, ` · zonder logo (gecontroleerd, opnieuw na een dag): ${stand.zonder}`) : ''}
        {stand.wachtrij ? t(` · у черзі: ${stand.wachtrij}`, ` · in de wachtrij: ${stand.wachtrij}`) : ''}
      </p> : null}
      {fout ? <p role='alert' style={{ margin: 0, color: 'var(--fout)' }}>{t('Не вдалося. Код сервера:', 'Mislukt. Servercode:')} {fout}</p> : null}
    </section>
  );
}
