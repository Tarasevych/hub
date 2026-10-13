// Venster «Щось не працює?»: controleert server (voor iedereen) en deze browser (alleen u), geeft één oordeel met concrete stappen,
// en laat — alleen na een klik, met voorbeeld van wat er meegaat — een verslag naar beheer sturen. In een actief technisch profiel met
// 'diagnose.lezen' ook de tab «Звіти користувачів».
import { useEffect, useState, type ReactElement } from 'react';
import { CheckCircle2, CircleAlert, CircleHelp, CircleX, RefreshCw, Send } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang } from '../canonical-navigation';
import Vraag from '../tech/Vraag';
import { techMag, useTech } from '../tech/tech-store';
import { CONTROLES, HELP_DIAGNOSE, OORDEEL_TEKST, oordeel, type Oordeel, type Stand, type Uitslag } from '../../shared/diagnose';
import { browserNaam, diagnoseBody, diagnoseUitvoeren } from './diagnose-client';
import { HELP_RLS, RLS_GROEP_NAAM } from '../../shared/rls-groepen';
import './diagnose.css';


const ICOON: Record<Stand, ReactElement> = { ok: <CheckCircle2 aria-hidden='true' />, 'let-op': <CircleAlert aria-hidden='true' />, fout: <CircleX aria-hidden='true' />, onbekend: <CircleHelp aria-hidden='true' /> };
const STAND_TEKST: Record<Stand, [string, string]> = { ok: ['гаразд', 'in orde'], 'let-op': ['увага', 'let op'], fout: ['не працює', 'werkt niet'], onbekend: ['невідомо', 'onbekend'] };

export default function DiagnoseLaag() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('mr-diagnose-venster', f); return () => window.removeEventListener('mr-diagnose-venster', f); }, []);
  return open ? <DiagnoseVenster sluit={() => setOpen(false)} /> : null;
}

function DiagnoseVenster({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const t = useTech();
  const magLezen = techMag('diagnose.lezen', t);
  const magBeheer = techMag('diensten.beheren', t);
  const [blad, setBlad] = useState<'ik' | 'verslagen' | 'isolatie'>('ik');
  const [bezig, setBezig] = useState(false);
  const [uitslagen, setUitslagen] = useState<Uitslag[] | null>(null);
  const [beschrijving, setBeschrijving] = useState('');
  const [toon, setToon] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  const doe = async () => {
    setBezig(true); setMelding(null);
    try { setUitslagen((await diagnoseUitvoeren()).uitslagen); } finally { setBezig(false); }
  };
  useEffect(() => { void doe(); }, []);

  const o = uitslagen ? oordeel(uitslagen) : null;
  const browser = browserNaam();
  const verslag = uitslagen ? { uitslagen: uitslagen.filter((u) => CONTROLES[u.id].bereik === 'browser'), beschrijving: beschrijving.trim(), browser } : null;
  const versturen = async () => {
    if (!verslag) return;
    setBezig(true);
    try {
      const r = await api.post('/api/diagnose/melden', { ...diagnoseBody(), ...verslag });
      setMelding({ ok: true, tekst: uk ? `Звіт надіслано (${String(r.data?.id || '').slice(0, 8)}). Адміністратор побачить його в «Звітах користувачів».` : `Verslag verstuurd (${String(r.data?.id || '').slice(0, 8)}). De beheerder ziet het bij «Verslagen van gebruikers».` });
      setToon(false);
    } catch (e) {
      const c = String((e as Error)?.message || '');
      setMelding({ ok: false, tekst: /NIET_AANGEMELD|AUTH|SESSION|401/.test(c) ? (uk ? 'Щоб надіслати звіт, потрібно увійти. Скопіюйте текст і передайте адміністратору іншим шляхом.' : 'Om een verslag te sturen moet u aangemeld zijn. Kopieer de tekst en geef hem op een andere manier door.') : (uk ? `Не вдалося надіслати (${c}).` : `Versturen mislukt (${c}).`) });
    } finally { setBezig(false); }
  };
  const tekstVerslag = () => [
    `${uk ? 'Перевірка' : 'Controle'}: ${new Date().toLocaleString()} · ${location.host} · ${browser}`,
    o ? `${uk ? 'Висновок' : 'Oordeel'}: ${tx(OORDEEL_TEKST[o.oordeel].kop)}` : '',
    ...(uitslagen ?? []).map((u) => `- ${tx(CONTROLES[u.id].naam)}: ${tx(STAND_TEKST[u.stand])}${u.code ? ` (${u.code})` : ''}${u.ms !== undefined && u.id !== 'klok' ? ` · ${u.ms} ms` : ''}`),
    beschrijving.trim() ? `${uk ? 'Опис' : 'Beschrijving'}: ${beschrijving.trim()}` : '',
  ].filter(Boolean).join('\n');

  return (
    <Venster id='diagnose' titel={uk ? 'Щось не працює? Перевірка' : 'Werkt iets niet? Controle'} breedte={620} onSluit={sluit}>
      <div className='diag' data-diagnose='1'>
        {magLezen || magBeheer ? (
          <div className='diag-bladen' role='tablist' aria-label={uk ? 'Розділи' : 'Onderdelen'}>
            <button type='button' role='tab' aria-selected={blad === 'ik'} onClick={() => setBlad('ik')} data-diag-blad='ik'>{uk ? 'Мій пристрій' : 'Mijn apparaat'}</button>
            {magLezen ? <button type='button' role='tab' aria-selected={blad === 'verslagen'} onClick={() => setBlad('verslagen')} data-diag-blad='verslagen'>{uk ? 'Звіти користувачів' : 'Verslagen van gebruikers'}</button> : null}
            {magBeheer ? <button type='button' role='tab' aria-selected={blad === 'isolatie'} onClick={() => setBlad('isolatie')} data-diag-blad='isolatie'>{uk ? 'Ізоляція даних' : 'Isolatie'}</button> : null}
          </div>
        ) : null}
        {blad === 'isolatie' && magBeheer ? <Isolatie uk={uk} /> : blad === 'verslagen' && magLezen ? <Verslagen uk={uk} /> : (
          <>
            <p className='diag-lead'>{uk ? 'Перевіряємо сервер (однаковий для всіх) і цей браузер (лише ваш).' : 'We controleren de server (voor iedereen gelijk) en deze browser (alleen van u).'} <Vraag help={HELP_DIAGNOSE} uk={uk} label={uk ? 'Як працює перевірка' : 'Hoe de controle werkt'} /></p>
            {!uitslagen ? <p className='diag-bezig' aria-busy='true'><RefreshCw className='spin' aria-hidden='true' />{uk ? 'Перевіряємо…' : 'Bezig met controleren…'}</p> : (
              <>
                {o ? <Oordeelkaart o={o.oordeel} uk={uk} slecht={o.browser} /> : null}
                <div className='diag-kolommen'>
                  {(['server', 'browser'] as const).map((bereik) => (
                    <section key={bereik} className='diag-kolom' data-diag-bereik={bereik} aria-label={bereik === 'server' ? (uk ? 'Сервер — для всіх' : 'Server — voor iedereen') : (uk ? 'Цей браузер — лише ви' : 'Deze browser — alleen u')}>
                      <h3>{bereik === 'server' ? (uk ? 'Сервер · для всіх' : 'Server · voor iedereen') : (uk ? 'Цей браузер · лише ви' : 'Deze browser · alleen u')}</h3>
                      <ul>{uitslagen.filter((u) => CONTROLES[u.id].bereik === bereik).map((u) => (
                        <li key={u.id} className={`is-${u.stand}`} data-diag-controle={u.id} data-diag-stand={u.stand}>
                          {ICOON[u.stand]}<span className='diag-naam'>{tx(CONTROLES[u.id].naam)}</span>
                          <span className='diag-stand'>{tx(STAND_TEKST[u.stand])}{u.id === 'snelheid' && u.ms !== undefined ? ` · ${u.ms} ms` : ''}</span>
                          {t.activatie && u.code ? <code className='diag-code'>{u.code}</code> : null}
                        </li>
                      ))}</ul>
                    </section>
                  ))}
                </div>
                <label className='diag-veld'><span>{uk ? 'Що саме не працює? (необов’язково, до 500 символів)' : 'Wat werkt er precies niet? (optioneel, tot 500 tekens)'}</span>
                  <textarea value={beschrijving} onChange={(e) => setBeschrijving(e.target.value)} maxLength={500} rows={3} data-diag-beschrijving='1' /></label>
                {toon && verslag ? (
                  <div className='diag-voorbeeld' data-diag-voorbeeld='1'>
                    <p><b>{uk ? 'Що буде надіслано адміністратору:' : 'Wat naar de beheerder gaat:'}</b> {uk ? 'результати перевірок (коди й час), назва браузера, ваш опис і ваш обліковий запис. Без вмісту, паролів чи адрес.' : 'uitslagen (codes en tijden), browsernaam, uw beschrijving en uw account. Geen inhoud, wachtwoorden of adressen.'}</p>
                    <pre>{tekstVerslag()}</pre>
                    <div className='diag-knoppen'><button type='button' className='is-hoofd' onClick={() => void versturen()} disabled={bezig} data-diag-knop='versturen'><Send aria-hidden='true' />{uk ? 'Так, надіслати' : 'Ja, versturen'}</button><button type='button' onClick={() => setToon(false)}>{uk ? 'Ні' : 'Nee'}</button></div>
                  </div>
                ) : null}
                {melding ? <p className={`diag-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
                <div className='diag-knoppen'>
                  <button type='button' onClick={() => void doe()} disabled={bezig} data-diag-knop='opnieuw'><RefreshCw aria-hidden='true' />{uk ? 'Перевірити ще раз' : 'Opnieuw controleren'}</button>
                  {!toon ? <button type='button' onClick={() => { setMelding(null); setToon(true); }} disabled={bezig} data-diag-knop='verslag'><Send aria-hidden='true' />{uk ? 'Надіслати звіт адміністратору…' : 'Verslag naar beheerder…'}</button> : null}
                  <button type='button' onClick={() => { void navigator.clipboard?.writeText(tekstVerslag()).then(() => setMelding({ ok: true, tekst: uk ? 'Текст звіту скопійовано.' : 'Tekst van het verslag gekopieerd.' }), () => setMelding({ ok: false, tekst: uk ? 'Не вдалося скопіювати.' : 'Kopiëren mislukt.' })); }} data-diag-knop='kopieren'>{uk ? 'Копіювати текст' : 'Tekst kopiëren'}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Venster>
  );
}

function Oordeelkaart({ o, uk, slecht }: { o: Oordeel; uk: boolean; slecht: Uitslag[] }) {
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const tekst = OORDEEL_TEKST[o];
  return (
    <section className={`diag-oordeel is-${o}`} role='status' data-diag-oordeel={o}>
      <h3>{tx(tekst.kop)}</h3>
      <p>{tx(tekst.uitleg)}</p>
      {slecht.length ? <ol className='diag-stappen'>{slecht.map((u) => CONTROLES[u.id].advies ? <li key={u.id} data-diag-advies={u.id}>{tx(CONTROLES[u.id].advies!)}</li> : null)}</ol> : null}
    </section>
  );
}

type Verslag = { id: string; dienst: string; oordeel: Oordeel; uitslagen: Uitslag[]; beschrijving: string; browser: string; email: string; op: number; gelezen: boolean };
function Verslagen({ uk }: { uk: boolean }) {
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const [lijst, setLijst] = useState<Verslag[] | null>(null);
  const [fout, setFout] = useState('');
  const laad = () => api.post('/api/diagnose/meldingen', diagnoseBody()).then((r) => setLijst(r.data?.meldingen ?? []), (e) => setFout(String(e?.message || 'FOUT')));
  useEffect(() => { void laad(); }, []);
  if (fout) return <p className='diag-melding' role='alert'>{fout === 'TECH_DIAGNOSE_VEREIST' ? (uk ? 'Потрібен активний технічний профіль із правом читати діагностику.' : 'Een actief technisch profiel met recht op diagnose is nodig.') : fout}</p>;
  if (!lijst) return <p className='diag-bezig' aria-busy='true'><RefreshCw className='spin' aria-hidden='true' />{uk ? 'Завантаження…' : 'Laden…'}</p>;
  if (!lijst.length) return <p className='diag-lead'>{uk ? 'Звітів поки немає.' : 'Nog geen verslagen.'}</p>;
  return (
    <ul className='diag-verslagen' data-diag-verslagen='1'>{lijst.map((v) => (
      <li key={v.id} className={v.gelezen ? 'is-gelezen' : ''} data-diag-verslag={v.id}>
        <div className='diag-verslag-kop'><b>{tx(OORDEEL_TEKST[v.oordeel].kop)}</b><span>{new Date(v.op).toLocaleString()} · {v.email || '—'} · {v.dienst} · {v.browser}</span></div>
        {v.beschrijving ? <p className='diag-verslag-tekst'>{v.beschrijving}</p> : null}
        <p className='diag-verslag-codes'>{v.uitslagen.filter((u) => u.stand !== 'ok').map((u) => `${tx(CONTROLES[u.id]?.naam ?? [u.id, u.id])}: ${u.code || u.stand}`).join(' · ') || (uk ? 'усі перевірки гаразд' : 'alle controles in orde')}</p>
        {!v.gelezen ? <button type='button' onClick={() => void api.post('/api/diagnose/gelezen', { ...diagnoseBody(), id: v.id }).then(laad)} data-diag-knop={`gelezen:${v.id}`}>{uk ? 'Позначити переглянутим' : 'Als bekeken markeren'}</button> : <span className='diag-meta'>{uk ? 'переглянуто' : 'bekeken'}</span>}
      </li>
    ))}</ul>
  );
}

type RlsGroep = { groep: string; volgorde: number; tabellen: string[]; afdwingen: 'uit' | 'aan'; toelichting: string; overtredingen: number; laatst: number | null; routes: Array<{ route: string; tbl: string; actie: string; aantal: number }>; gereed: boolean };
type RlsStand = { globaal: string; auditSinds: number | null; script: string; groepen: RlsGroep[] };
export function Isolatie({ uk }: { uk: boolean }) {
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const [s, setS] = useState<RlsStand | null>(null);
  const [fout, setFout] = useState('');
  const [gekopieerd, setGekopieerd] = useState('');
  useEffect(() => { void api.post('/api/beheer/rls/groepen', diagnoseBody()).then((r) => setS(r.data as RlsStand), (e) => setFout(String(e?.message || 'FOUT'))); }, []);
  if (fout) return <p className='diag-melding' role='alert'>{fout === 'TECH_BEHEER_VEREIST' ? (uk ? 'Потрібен активний технічний профіль адміністратора або власника.' : 'Een actief technisch profiel van beheerder of eigenaar is nodig.') : fout}</p>;
  if (!s) return <p className='diag-bezig' aria-busy='true'><RefreshCw className='spin' aria-hidden='true' />{uk ? 'Завантаження…' : 'Laden…'}</p>;
  const volgende = s.globaal === 'aan' ? null : s.groepen.find((g) => g.afdwingen === 'uit');
  const kopieer = (cmd: string) => { void navigator.clipboard?.writeText(cmd).then(() => setGekopieerd(cmd), () => undefined); };
  return (
    <div className='diag-rls' data-diag-rls='1'>
      <p className='diag-lead'>{uk ? 'Ізоляція даних у базі (RLS) — по групах, від найменшого ризику. Сайт лише показує стан; вмикає тільки власник сервера командою.' : 'Isolatie in de database (RLS) — per groep, van laag naar hoog risico. De site toont alleen; aanzetten doet de servereigenaar met een opdracht.'} <Vraag help={HELP_RLS} uk={uk} label={uk ? 'Ізоляція даних' : 'Isolatie'} /></p>
      <p className='diag-meta'>{uk ? 'Загальний перемикач' : 'Algemene schakelaar'}: <b>{s.globaal === 'aan' ? (uk ? 'увімкнено для всього' : 'aan voor alles') : (uk ? 'аудит' : 'audit')}</b>{s.auditSinds ? ` · ${uk ? 'аудит рахує з' : 'audit telt sinds'} ${new Date(s.auditSinds).toLocaleDateString()}` : ` · ${uk ? 'порушень ще не зафіксовано' : 'nog geen overtredingen geteld'}`}</p>
      <ol className='diag-rls-lijst'>{s.groepen.map((g) => {
        const cmd = `sudo bash ${s.script} rls-groep ${g.groep} ${g.afdwingen === 'aan' ? 'uit' : 'aan'}`;
        return (
          <li key={g.groep} className={`is-${g.afdwingen}${volgende?.groep === g.groep ? ' is-volgende' : ''}`} data-rls-groep={g.groep} data-rls-stand={g.afdwingen} data-rls-gereed={g.gereed ? '1' : '0'}>
            <div className='diag-rls-kop'><b>{g.volgorde}. {tx(RLS_GROEP_NAAM[g.groep] ?? [g.groep, g.groep])}</b>
              <span className='diag-rls-stand'>{g.afdwingen === 'aan' || s.globaal === 'aan' ? (uk ? 'увімкнено' : 'afgedwongen') : (uk ? 'аудит' : 'audit')}</span>
              {volgende?.groep === g.groep ? <span className='diag-rls-volgende'>{uk ? 'наступна за порядком' : 'volgende in de rij'}</span> : null}</div>
            <p className='diag-meta'>{g.tabellen.join(', ')}</p>
            {g.afdwingen === 'uit' && s.globaal !== 'aan' ? (g.overtredingen === 0
              ? <p className='diag-rls-oordeel is-ok'>{uk ? 'Порушень не зафіксовано — можна вмикати.' : 'Geen overtredingen — kan aan.'}</p>
              : <><p className='diag-rls-oordeel is-let-op'>{uk ? `Ще є порушення: ${g.overtredingen} (останнє ${g.laatst ? new Date(g.laatst).toLocaleString() : '—'}). Спершу виправити маршрути:` : `Nog overtredingen: ${g.overtredingen} (laatste ${g.laatst ? new Date(g.laatst).toLocaleString() : '—'}). Eerst de routes oplossen:`}</p>
                <ul className='diag-rls-routes'>{g.routes.map((r) => <li key={`${r.route}|${r.tbl}|${r.actie}`}><code>{r.route}</code> · {r.tbl} · {r.actie} · {r.aantal}×</li>)}</ul></>)
              : null}
            {s.globaal !== 'aan' && (g.afdwingen === 'aan' || g.gereed) ? (
              <div className='diag-rls-cmd'><code>{cmd}</code><button type='button' onClick={() => kopieer(cmd)} data-rls-kopieer={g.groep}>{gekopieerd === cmd ? (uk ? 'Скопійовано' : 'Gekopieerd') : (uk ? 'Копіювати' : 'Kopiëren')}</button></div>
            ) : null}
          </li>
        );
      })}</ol>
    </div>
  );
}
