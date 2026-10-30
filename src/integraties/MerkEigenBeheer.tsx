// admin → Інтеграції → «Майстер підключень»: ВЛАСНІ ЛОГОТИПИ сервісів (BYOS, 21.10.2026).
// De site tekent geen logo's na (regel van de eigenaar). Voor merken zonder vorm met echte herkomst staat er een neutrale plaat; hier
// kan de eigenaar het OFFICIËLE bestand (SVG/PNG ≤ 200 KB, zelf van de merkpagina van de dienst gehaald) opladen. De server controleert
// en ontsmet het (shared/merk-eigen.ts) en vraagt een verse passkey-bevestiging (de api-client opent dat venster zelf en herhaalt).
// Hetzelfde kan zonder site: het bestand in de map op de server leggen (deploy/LEESMIJ.md, «Eigen logo's»).
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import Merk from '../merk/Merk';
import HulpVraag from '../hulp/HulpVraag';
import { MERKEN } from '../merk/merk-tabel';
import { _eigenMerkenOpnieuw, registreerEigenMerken, type EigenMerk } from '../merk/merk-register';
import { MERK_EIGEN_MAX_BYTES, merkEigenRedenTekst } from '../../shared/merk-eigen';

type Lang = 'uk' | 'nl';
type Lijst = { merken: EigenMerk[]; geweigerd?: Array<{ bestand: string; reden: string }>; map?: string };

/** Merken die nu de neutrale plaat tonen: daar is een eigen bestand het nuttigst. */
const NEUTRAAL = Object.entries(MERKEN).filter(([, d]) => d.neutraal).map(([k, d]) => ({ sleutel: k, naam: d.naam })).sort((a, b) => a.naam.localeCompare(b.naam));

export default function MerkEigenBeheer({ lang, context }: { lang: Lang; context: Record<string, unknown> }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [sleutel, setSleutel] = useState(NEUTRAAL[0]?.sleutel || '');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  const laden = async () => {
    try { const r = await api.post('/api/owner/merk-eigen/lijst', context); const d = r.data as Lijst; setLijst(d); _eigenMerkenOpnieuw(); registreerEigenMerken(d.merken || []); }
    catch { setLijst({ merken: [] }); }
  };
  useEffect(() => { void laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const opladen = async (bestand: File | undefined) => {
    if (!bestand || !sleutel) return;
    setMelding(null);
    const soort = /\.png$/i.test(bestand.name) || bestand.type === 'image/png' ? 'png' : /\.svg$/i.test(bestand.name) || bestand.type === 'image/svg+xml' ? 'svg' : '';
    if (!soort) { setMelding({ fout: true, tekst: t('Лише SVG або PNG.', 'Alleen SVG of PNG.') }); return; }
    if (bestand.size > MERK_EIGEN_MAX_BYTES) { setMelding({ fout: true, tekst: merkEigenRedenTekst('TE_GROOT', lang) }); return; }
    setBezig(true);
    try {
      const data = await new Promise<string>((ok, nee) => { const r = new FileReader(); r.onload = () => ok(String(r.result || '').split(',')[1] || ''); r.onerror = () => nee(new Error('LEZEN')); r.readAsDataURL(bestand); });
      await api.post('/api/owner/admin/merk-eigen/zetten', { ...context, sleutel, soort, data });
      setMelding({ fout: false, tekst: t('Логотип збережено. Він уже показується замість нейтральної плитки.', 'Logo bewaard. Het staat al op de plaats van de neutrale plaat.') });
      await laden();
    } catch (gevangen) {
      const code = String((gevangen as { message?: string } | null)?.message || '');
      setMelding({ fout: true, tekst: code.startsWith('MERK_EIGEN_') ? merkEigenRedenTekst(code.slice(11), lang) : `${t('Не збережено. Код сервера:', 'Niet bewaard. Servercode:')} ${code || 'HTTP'}` });
    } finally { setBezig(false); }
  };

  const wissen = async (s: string) => {
    setBezig(true); setMelding(null);
    try { await api.post('/api/owner/admin/merk-eigen/wissen', { ...context, sleutel: s }); await laden(); }
    catch (gevangen) { setMelding({ fout: true, tekst: `${t('Не видалено. Код сервера:', 'Niet gewist. Servercode:')} ${String((gevangen as { message?: string } | null)?.message || 'HTTP')}` }); }
    finally { setBezig(false); }
  };

  return (
    <section className='il-sectie' data-merk-eigen-beheer style={{ marginTop: 24, display: 'grid', gap: 12 }}>
      <h3 className='il-sectiekop'>{t('Власні логотипи сервісів', 'Eigen logo\'s van diensten')}</h3>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{t(
        'Сайт не малює чужих логотипів. Там, де немає логотипа з чесним походженням, стоїть нейтральна плитка з літерами назви. Якщо хочете офіційний логотип — завантажте файл, який ви самі взяли з офіційної сторінки бренду сервісу (SVG або PNG до 200 КБ). SVG перевіряється й очищується: без скриптів і без посилань назовні. Потрібне підтвердження passkey.',
        'De site tekent geen logo\'s van anderen na. Waar geen logo met eerlijke herkomst is, staat een neutrale plaat met letters van de naam. Wilt u het officiële logo, laad dan het bestand op dat u zelf van de officiële merkpagina van de dienst haalde (SVG of PNG tot 200 KB). Een SVG wordt gecontroleerd en ontsmet: geen scripts en geen verwijzingen naar buiten. Een passkey-bevestiging is nodig.')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('Сервіс', 'Dienst')} <HulpVraag k='integraties.merk-eigen' /></span>
          <select data-hulp='integraties.merk-eigen' value={sleutel} onChange={(e) => setSleutel(e.target.value)} style={{ minHeight: 'var(--tik-hoogte)' }} disabled={bezig}>
            {NEUTRAAL.map((m) => <option key={m.sleutel} value={m.sleutel}>{m.naam}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('Офіційний файл (SVG/PNG)', 'Officieel bestand (SVG/PNG)')}</span>
          <input data-hulp='integraties.merk-eigen' type='file' accept='.svg,.png,image/svg+xml,image/png' disabled={bezig} onChange={(e) => { void opladen(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {melding ? <p role={melding.fout ? 'alert' : 'status'} style={{ margin: 0, color: melding.fout ? 'var(--fout)' : 'inherit' }}>{melding.tekst}</p> : null}
      {lijst?.merken?.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {lijst.merken.map((m) => (
            <li key={m.sleutel} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Merk merk={m.sleutel} maat={32} />
              <span style={{ flex: 1, minWidth: 0 }}>{MERKEN[m.sleutel]?.naam || m.sleutel} <small style={{ color: 'var(--muted)' }}>{m.soort.toUpperCase()} · {m.hash}</small></span>
              <button type='button' disabled={bezig} onClick={() => void wissen(m.sleutel)} style={{ minHeight: 'var(--tik-hoogte)' }}>{t('Видалити', 'Wissen')}</button>
            </li>
          ))}
        </ul>
      ) : <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{t('Власних логотипів ще немає.', 'Er zijn nog geen eigen logo\'s.')}</p>}
      {lijst?.geweigerd?.length ? (
        <div role='status' style={{ fontSize: 13 }}>
          <strong>{t('Файли в теці, які не прийнято:', 'Bestanden in de map die niet aanvaard zijn:')}</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{lijst.geweigerd.map((g) => <li key={g.bestand}><code>{g.bestand}</code> — {g.reden === 'NAAM' ? t('назва має бути <ключ>.svg або <ключ>.png малими літерами', 'de naam moet <sleutel>.svg of <sleutel>.png in kleine letters zijn') : merkEigenRedenTekst(g.reden, lang)}</li>)}</ul>
          {lijst.map ? <small style={{ color: 'var(--muted)' }}>{t('Тека:', 'Map:')} <code>{lijst.map}</code></small> : null}
        </div>
      ) : null}
    </section>
  );
}
