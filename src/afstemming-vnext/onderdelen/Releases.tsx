// Afstemming vNext — «Випуски» (uitvoerder D3, §7): de ECHTE uitrolgeschiedenis (read-only via de kern), per release de
// gekoppelde kaarten en ongeregistreerde wijzigingen. De gouden regel van scenario 4 staat hier letterlijk op het scherm:
// «Розгорнуто, не підтверджено» — een gelukte uitrol bewijst alleen de uitrol; bevestigen doen productiecontroles.
// Deze pagina rolt NOOIT iets uit en keurt niets goed; koppelen gebeurt met benoemde zekerheid, nooit op gok.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link2, RefreshCcw, Rocket } from 'lucide-react';
import { afstemmingTekst, type Kaart } from '../../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type ReleasesUit } from '../afstemming-client';
import { postflightLabel, preflightLabel, type PostflightStand } from '../zvirka-kern';
import { datumTekst, foutTekst, tr } from '../tekst';
import type { OnderdeelProps } from '../AfstemmingPagina';

type Release = ReleasesUit['releases'][number];
const S: Record<string, CSSProperties> = {
  badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999, fontSize: 'var(--tekst-mini)', fontWeight: 650 },
  rij: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--panel)', flexWrap: 'wrap' },
  kop: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer', listStyle: 'none', minHeight: 44 },
};
const badge = (kleur: 'ok' | 'warn' | 'fout' | 'info' | 'muted'): CSSProperties =>
  kleur === 'muted' ? { ...S.badge, background: 'var(--surface)', color: 'var(--muted)' } : { ...S.badge, background: `var(--${kleur}-zacht)`, color: `var(--${kleur})` };

export default function Releases({ lang, openKaart, toon }: OnderdeelProps) {
  const [uit, setUit] = useState<ReleasesUit | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bouw, setBouw] = useState(false);
  const [externIds, setExternIds] = useState<Map<string, string>>(new Map()); // kaartId → externId, lui opgebouwd
  const [postUit, setPostUit] = useState<Record<string, { gecontroleerd: number; regressies: string[]; onbevestigd: string[] }>>({});
  const [postBezig, setPostBezig] = useState('');

  const laad = useCallback(async () => {
    setLaden(true);
    try { setUit(await afstemmingClient.releases()); setFout(''); }
    catch (e) { const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; if (code === 'NOG_NIET_GEBOUWD') setBouw(true); else setFout(foutTekst(lang, code)); }
    finally { setLaden(false); }
  }, [lang]);
  useEffect(() => { void laad(); }, [laad]);

  // De namen (externId) van gekoppelde kaarten: één keer lui ophalen, zodat de tabel mensentaal toont in plaats van UUID's.
  useEffect(() => {
    if (!uit || externIds.size || !uit.releases.some((r) => r.kaarten.length)) return;
    let weg = false;
    afstemmingClient.kaarten({}).then((k) => { if (!weg) setExternIds(new Map(k.kaarten.map((x: Kaart) => [x.id, x.externId]))); }).catch(() => undefined);
    return () => { weg = true; };
  }, [uit, externIds.size]);

  const postflight = useCallback(async (versie: string) => {
    setPostBezig(versie);
    try { const r = await afstemmingClient.postflight(versie); setPostUit((p) => ({ ...p, [versie]: r })); setFout(''); }
    catch (e) { setFout(foutTekst(lang, e instanceof AfstemmingFout ? e.code : 'FOUT')); }
    finally { setPostBezig(''); }
  }, [lang]);

  if (laden) return <p className='afv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження випусків…', 'Releases laden…')}</p>;
  if (bouw) return <section className='afv-leeg' data-afv-bouw='Releases'><p>{tr(lang, 'Серверна частина випусків ще збирається.', 'De serverkant van de releases is nog in aanbouw.')}</p></section>;

  return (
    <div style={{ display: 'grid', gap: 'var(--ruimte-4)', minWidth: 0 }} data-afv-releases=''>
      {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
      <p className='afv-hint'>{tr(lang,
        'Список читається з реальної історії встановлень сайту (read-only). Успішне встановлення доводить лише встановлення: «підтверджено» картка стає тільки після перевірок на production.',
        'De lijst komt uit de echte installatiegeschiedenis van de site (read-only). Een gelukte installatie bewijst alleen de installatie: «bevestigd» wordt een kaart pas na productiecontroles.')}</p>
      {!uit || uit.releases.length === 0 ? (
        <section className='afv-leeg'>
          <p>{tr(lang, 'Випусків ще не зафіксовано.', 'Nog geen releases vastgelegd.')}</p>
          <p className='afv-hint'>{tr(lang, 'Щойно на сервері з’явиться історія встановлень, вона стане видимою тут — без ручного ведення.', 'Zodra de server een installatiegeschiedenis heeft, verschijnt die hier — zonder handmatig bijhouden.')}</p>
        </section>
      ) : uit.releases.map((r) => (
        <ReleaseBlok key={r.versie} lang={lang} release={r} externIds={externIds}
          post={postUit[r.versie]} postBezig={postBezig === r.versie}
          onPostflight={() => void postflight(r.versie)} onOpen={openKaart}
          onGekoppeld={() => { toon(tr(lang, 'Картку прив’язано до випуску.', 'Kaart aan de release gekoppeld.')); void laad(); }}
          zegFout={(c) => setFout(foutTekst(lang, c))} />
      ))}
    </div>
  );
}

function ReleaseBlok({ lang, release, externIds, post, postBezig, onPostflight, onOpen, onGekoppeld, zegFout }: {
  lang: 'uk' | 'nl'; release: Release; externIds: Map<string, string>;
  post?: { gecontroleerd: number; regressies: string[]; onbevestigd: string[] }; postBezig: boolean;
  onPostflight: () => void; onOpen: (id: string) => void; onGekoppeld: () => void; zegFout: (code: string) => void;
}) {
  const [zoek, setZoek] = useState('');
  const [treffers, setTreffers] = useState<Kaart[]>([]);
  const [gekozen, setGekozen] = useState<Kaart | null>(null);
  const [zekerheid, setZekerheid] = useState('0.8');
  const [bezig, setBezig] = useState(false);

  const zoekKaart = async () => {
    if (zoek.trim().length < 2) return;
    try { setTreffers((await afstemmingClient.kaarten({ zoek: zoek.trim() })).kaarten.slice(0, 5)); }
    catch (e) { zegFout(e instanceof AfstemmingFout ? e.code : 'FOUT'); }
  };
  const koppel = async () => {
    if (!gekozen) return;
    setBezig(true);
    try { await afstemmingClient.releaseKoppel(gekozen.id, release.versie, Number(zekerheid)); setGekozen(null); setTreffers([]); setZoek(''); onGekoppeld(); }
    catch (e) { zegFout(e instanceof AfstemmingFout ? e.code : 'FOUT'); }
    finally { setBezig(false); }
  };

  return (
    <details className='afv-blok' data-afv-release={release.versie}>
      <summary style={S.kop}>
        <Rocket aria-hidden='true' /><strong>{release.versie}</strong>
        <span className='afv-hint'>{datumTekst(lang, release.op)}</span>
        <span className='afv-hint' style={{ flex: 1, minWidth: 120, overflowWrap: 'anywhere' }}>{release.samenvatting}</span>
        <span style={badge('info')}>{tr(lang, `карток: ${release.kaarten.length}`, `kaarten: ${release.kaarten.length}`)}</span>
        {release.ongeregistreerd.length ? <span style={badge('warn')}>{tr(lang, `без картки: ${release.ongeregistreerd.length}`, `zonder kaart: ${release.ongeregistreerd.length}`)}</span> : null}
      </summary>
      {release.kaarten.length ? (
        <div style={{ display: 'grid', gap: 6 }} role='list'>
          {release.kaarten.map((k) => { const pf = postflightLabel(k.postflight as PostflightStand); const vf = preflightLabel(k.preflight); return (
            <div key={k.id} style={S.rij} role='listitem'>
              <button type='button' className='afv-knop is-klein' onClick={() => onOpen(k.kaartId)}><Link2 aria-hidden='true' />{externIds.get(k.kaartId) || `${k.kaartId.slice(0, 8)}…`}</button>
              <span className='afv-hint'>{tr(lang, `впевненість ${Math.round(k.zekerheid * 100)}%`, `zekerheid ${Math.round(k.zekerheid * 100)}%`)}</span>
              <span style={badge(vf.kleur)}>{tr(lang, vf.uk, vf.nl)}</span>
              <span style={badge(pf.kleur)} data-afv-postflight-stand={k.postflight}>{tr(lang, pf.uk, pf.nl)}</span>
              {k.stand === 'voorgesteld' ? <span style={badge('muted')}>{tr(lang, 'запропоновано', 'voorgesteld')}</span> : null}
            </div>
          ); })}
        </div>
      ) : <p className='afv-hint'>{tr(lang, 'До цього випуску ще не прив’язано жодної картки.', 'Aan deze release is nog geen kaart gekoppeld.')}</p>}
      {release.ongeregistreerd.length ? (
        <div className='afv-melding is-fout' role='status' style={{ background: 'var(--warn-zacht)', color: 'var(--warn)' }}>
          <strong>{tr(lang, 'Незареєстровані зміни:', 'Ongeregistreerde wijzigingen:')}</strong>
          <span style={{ overflowWrap: 'anywhere' }}>{release.ongeregistreerd.join(' · ')}</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type='button' className='afv-knop' data-afv-postflight={release.versie} disabled={postBezig} onClick={onPostflight}>
          <RefreshCcw aria-hidden='true' />{postBezig ? tr(lang, 'Звірка…', 'Afstemmen…') : tr(lang, 'Постфлайт-звірка', 'Postflight-afstemming')}
        </button>
        {post ? (
          <span className='afv-hint' data-afv-postflight-uit={release.versie}>
            {tr(lang, `Перевірено: ${post.gecontroleerd}`, `Gecontroleerd: ${post.gecontroleerd}`)}
            {post.regressies.length ? tr(lang, ` · Регресії: ${post.regressies.join(', ')}`, ` · Regressies: ${post.regressies.join(', ')}`) : ''}
            {post.onbevestigd.length ? tr(lang, ` · Не підтверджено: ${post.onbevestigd.join(', ')}`, ` · Onbevestigd: ${post.onbevestigd.join(', ')}`) : ''}
          </span>
        ) : null}
      </div>
      <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); void zoekKaart(); }}>
        <input value={zoek} data-afv-release-zoek={release.versie} placeholder={tr(lang, 'Прив’язати картку: ID або назва…', 'Kaart koppelen: ID of titel…')} aria-label={tr(lang, 'Пошук картки для прив’язки', 'Kaart zoeken om te koppelen')} onChange={(e) => setZoek(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button type='submit' className='afv-knop is-klein'>{tr(lang, 'Знайти', 'Zoeken')}</button>
        {gekozen ? (
          <>
            <span style={badge('info')}>{gekozen.externId}</span>
            <label className='afv-hint'>{tr(lang, 'впевненість', 'zekerheid')}{' '}
              <select value={zekerheid} onChange={(e) => setZekerheid(e.target.value)} aria-label={tr(lang, 'Впевненість прив’язки', 'Zekerheid van de koppeling')}>
                <option value='1'>100%</option><option value='0.8'>80%</option><option value='0.5'>50%</option><option value='0.3'>30%</option>
              </select>
            </label>
            <button type='button' className='afv-knop is-klein is-hoofd' data-afv-release-koppel={release.versie} disabled={bezig} onClick={() => void koppel()}>{tr(lang, 'Прив’язати', 'Koppelen')}</button>
          </>
        ) : null}
      </form>
      {treffers.length && !gekozen ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {treffers.map((t) => <button key={t.id} type='button' className='afv-knop is-klein' onClick={() => setGekozen(t)}>{t.externId} · {afstemmingTekst(t.titel, lang)}</button>)}
        </div>
      ) : null}
    </details>
  );
}
