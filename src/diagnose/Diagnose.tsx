// Venster «Щось не працює?»: controleert server (voor iedereen) en deze browser (alleen u), geeft één oordeel met concrete stappen,
// en laat — alleen na een klik, met voorbeeld van wat er meegaat — een verslag naar beheer sturen. In een actief technisch profiel met
// 'diagnose.lezen' ook de tab «Звіти користувачів».
import { useEffect, useState, type ReactElement } from 'react';
import { CheckCircle2, CircleAlert, CircleHelp, CircleX, RefreshCw, Send } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang } from '../canoniek-navigatie';
import Vraag from '../tech/Vraag';
import { techMag, useTech } from '../tech/tech-opslag';
import { CONTROLES, HELP_DIAGNOSE, OORDEEL_TEKST, codeTekst, oordeel, type Oordeel, type Stand, type Uitslag } from '../../shared/diagnose';
import { browserNaam, diagnoseBody, diagnoseUitvoeren } from './diagnose-client';
import { HELP_RLS, RLS_GROEP_NAAM } from '../../shared/rls-groepen';
import { BEHEER_ACTIE_NAAM, HELP_BELEID } from '../../shared/beleid';
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
  const magJournaal = techMag('journaal.lezen', t);
  const [blad, setBlad] = useState<'ik' | 'verslagen' | 'isolatie' | 'beleid' | 'siem'>('ik');
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
      // SEC-002 (toets-g10b #7): grens per mens (5 per 10 minuten, 30 per dag) — uitleg en wachttijd in plaats van een kale code.
      const fout = e as { status?: number; retryAfter?: number };
      if (fout?.status === 429) {
        const min = Math.max(1, Math.ceil(Number(fout.retryAfter || 600) / 60));
        setMelding({ ok: false, tekst: uk ? `Забагато звітів за короткий час. Спробуйте знову приблизно через ${min} хв. Текст звіту можна скопіювати й передати адміністратору іншим шляхом.` : `Te veel verslagen in korte tijd. Probeer het over ongeveer ${min} min opnieuw. U kunt de tekst ook kopiëren en op een andere manier doorgeven.` });
        return;
      }
      setMelding({ ok: false, tekst: /NIET_AANGEMELD|AUTH|SESSION|401/.test(c) ? (uk ? 'Щоб надіслати звіт, потрібно увійти. Скопіюйте текст і передайте адміністратору іншим шляхом.' : 'Om een verslag te sturen moet u aangemeld zijn. Kopieer de tekst en geef hem op een andere manier door.') : (uk ? `Не вдалося надіслати (${c}).` : `Versturen mislukt (${c}).`) });
    } finally { setBezig(false); }
  };
  const tekstVerslag = () => [
    `${uk ? 'Перевірка' : 'Controle'}: ${new Date().toLocaleString()} · ${location.host} · ${browser}`,
    o ? `${uk ? 'Висновок' : 'Oordeel'}: ${tx(OORDEEL_TEKST[o.oordeel].kop)}` : '',
    ...(uitslagen ?? []).map((u) => `- ${tx(CONTROLES[u.id].naam)}: ${tx(STAND_TEKST[u.stand])}${u.code ? ` (${codeTekst(u.code, uk)}; ${u.code})` : ''}${u.ms !== undefined && u.id !== 'klok' ? ` · ${u.ms} ms` : ''}`),
    beschrijving.trim() ? `${uk ? 'Опис' : 'Beschrijving'}: ${beschrijving.trim()}` : '',
  ].filter(Boolean).join('\n');

  return (
    <Venster id='diagnose' titel={uk ? 'Щось не працює? Перевірка' : 'Werkt iets niet? Controle'} breedte={620} onSluit={sluit}>
      <div className='diag' data-diagnose='1'>
        {magLezen || magBeheer || magJournaal ? (
          <div className='diag-bladen' role='tablist' aria-label={uk ? 'Розділи' : 'Onderdelen'}>
            <button type='button' role='tab' aria-selected={blad === 'ik'} onClick={() => setBlad('ik')} data-diag-blad='ik'>{uk ? 'Мій пристрій' : 'Mijn apparaat'}</button>
            {magLezen ? <button type='button' role='tab' aria-selected={blad === 'verslagen'} onClick={() => setBlad('verslagen')} data-diag-blad='verslagen'>{uk ? 'Звіти користувачів' : 'Verslagen van gebruikers'}</button> : null}
            {magBeheer ? <button type='button' role='tab' aria-selected={blad === 'isolatie'} onClick={() => setBlad('isolatie')} data-diag-blad='isolatie'>{uk ? 'Ізоляція даних' : 'Isolatie'}</button> : null}
            {magBeheer ? <button type='button' role='tab' aria-selected={blad === 'beleid'} onClick={() => setBlad('beleid')} data-diag-blad='beleid'>{uk ? 'Правила (OPA)' : 'Regels (OPA)'}</button> : null}
            {magJournaal ? <button type='button' role='tab' aria-selected={blad === 'siem'} onClick={() => setBlad('siem')} data-diag-blad='siem'>{uk ? 'Журнал і SIEM' : 'Logboek en SIEM'}</button> : null}
          </div>
        ) : null}
        {blad === 'siem' && magJournaal ? <Siem uk={uk} /> : blad === 'beleid' && magBeheer ? <Beleid uk={uk} /> : blad === 'isolatie' && magBeheer ? <Isolatie uk={uk} /> : blad === 'verslagen' && magLezen ? <Verslagen uk={uk} /> : (
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
                          {u.code && u.stand !== 'ok' ? <span className='diag-code-tekst'>{codeTekst(u.code, uk)}</span> : null}
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
        <p className='diag-verslag-codes'>{v.uitslagen.filter((u) => u.stand !== 'ok').map((u) => `${tx(CONTROLES[u.id]?.naam ?? [u.id, u.id])}: ${u.code ? codeTekst(u.code, uk) : tx(STAND_TEKST[u.stand])}`).join(' · ') || (uk ? 'усі перевірки гаразд' : 'alle controles in orde')}</p>
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

type BeleidRij = { actie: string; uitkomst: 'gelijk' | 'verschil' | 'doel-weigert' | 'onbereikbaar'; reden: string; aantal: number; laatst: number };
type BeleidStand = { gezond: boolean; ms: number; aan: boolean; afdwingen?: boolean; rijen: BeleidRij[] };
export function Beleid({ uk }: { uk: boolean }) {
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const [s, setS] = useState<BeleidStand | null>(null);
  const [fout, setFout] = useState('');
  const laad = () => api.post('/api/beheer/beleid/stand', diagnoseBody()).then((r) => setS(r.data as BeleidStand), (e) => setFout(String(e?.message || 'FOUT')));
  useEffect(() => { void laad(); }, []);
  if (fout) return <p className='diag-melding' role='alert'>{fout === 'TECH_BEHEER_VEREIST' ? (uk ? 'Потрібен активний технічний профіль адміністратора або власника.' : 'Een actief technisch profiel van beheerder of eigenaar is nodig.') : fout}</p>;
  if (!s) return <p className='diag-bezig' aria-busy='true'><RefreshCw className='spin' aria-hidden='true' />{uk ? 'Завантаження…' : 'Laden…'}</p>;
  const acties = [...new Set(s.rijen.map((r) => r.actie))];
  const som = (u: BeleidRij['uitkomst'], actie?: string) => s.rijen.filter((r) => r.uitkomst === u && (!actie || r.actie === actie)).reduce((a, r) => a + r.aantal, 0);
  const verschil = som('verschil'), doel = som('doel-weigert');
  return (
    <div className='diag-beleid' data-diag-beleid='1'>
      <p className='diag-lead'>{uk ? 'Служба правил (OPA) у тіньовому режимі: перевіряє кожну адмін-дію паралельно із сайтом, нічого не блокує.' : 'Regeldienst (OPA) in schaduw: controleert elke beheeractie naast de site, blokkeert niets.'} <Vraag help={HELP_BELEID} uk={uk} label='OPA' /></p>
      <p className={`diag-rls-oordeel ${s.gezond ? 'is-ok' : 'is-let-op'}`} data-beleid-gezond={s.gezond ? '1' : '0'}>{s.gezond ? (uk ? `Служба працює (${s.ms} мс).` : `Dienst werkt (${s.ms} ms).`) : (uk ? 'Служба недоступна — сайт працює як завжди; перевірте mijn-ruimte-opa.service на сервері.' : 'Dienst onbereikbaar — de site werkt zoals altijd; controleer mijn-ruimte-opa.service.')}{!s.aan ? (uk ? ' Тіньовий режим вимкнено (OPA_SCHADUW=uit).' : ' Schaduw uit (OPA_SCHADUW=uit).') : ''}</p>
      <p className={`diag-rls-oordeel ${s.afdwingen ? 'is-ok' : ''}`} data-beleid-afdwingen={s.afdwingen ? '1' : '0'}>{s.afdwingen
        ? (uk ? 'Перемикач «адмін-права лише в технічному профілі» УВІМКНЕНО: без активного профілю з потрібним правом адмін-дії відхиляються; якщо OPA недоступна — теж (fail-closed).' : 'Schakelaar «beheerrechten alleen in een technisch profiel» AAN: zonder actief profiel met het juiste recht worden beheeracties geweigerd; ook als OPA onbereikbaar is (fail-closed).')
        : (uk ? 'Перемикач «адмін-права лише в технічному профілі» вимкнено (лише тінь). Увімкнути, коли «Розбіжність» і «Без тех. профілю» довго 0: root у /etc/mijn-ruimte/mcp-rechten.json — "beheer-alleen-tech": true.' : 'Schakelaar «beheerrechten alleen in een technisch profiel» uit (alleen schaduw). Aanzetten als «Verschil» en «Zonder tech» lang 0 zijn: root in /etc/mijn-ruimte/mcp-rechten.json — "beheer-alleen-tech": true.')}</p>
      <section className={`diag-oordeel ${verschil ? 'is-iedereen' : doel ? 'is-alleen-ik' : 'is-alles-ok'}`} data-beleid-oordeel={verschil ? 'verschil' : doel ? 'doel' : 'ok'}>
        <h3>{verschil ? (uk ? 'Правила й сайт розходяться' : 'Regels en site wijken af') : doel ? (uk ? 'Майбутній перемикач заблокував би частину дій' : 'De toekomstige schakelaar zou acties weigeren') : (uk ? 'Розбіжностей немає' : 'Geen afwijkingen')}</h3>
        <p>{verschil ? (uk ? `${verschil} разів OPA вирішив інакше, ніж сайт. Нічого не вмикати, доки це не 0.` : `${verschil}× besliste OPA anders dan de site. Niets afdwingen tot dit 0 is.`)
          : doel ? (uk ? `${doel} адмін-дій виконано без активного технічного профілю. Перш ніж вмикати «адмін-права лише в технічному профілі», звикніть вмикати профіль перед адмін-роботою.` : `${doel} beheeracties zonder actief technisch profiel. Wen eraan het profiel aan te zetten vóór beheerwerk.`)
          : (s.rijen.length ? (uk ? 'Усі рішення збігаються.' : 'Alle besluiten komen overeen.') : (uk ? 'Ще немає даних: відкрийте адмін-консоль, і тут з’являться підрахунки.' : 'Nog geen gegevens: open de beheerconsole.'))}</p>
      </section>
      {acties.length ? (
        <table className='diag-beleid-tabel'>
          <thead><tr><th>{uk ? 'Дія' : 'Actie'}</th><th>{uk ? 'Збіг' : 'Gelijk'}</th><th>{uk ? 'Розбіжність' : 'Verschil'}</th><th>{uk ? 'Без тех. профілю' : 'Zonder tech'}</th><th>{uk ? 'Недоступна' : 'Onbereikbaar'}</th></tr></thead>
          <tbody>{acties.map((a) => (
            <tr key={a} data-beleid-actie={a}>
              <th scope='row'>{tx(BEHEER_ACTIE_NAAM[a] ?? [a, a])}</th>
              <td>{som('gelijk', a)}</td><td className={som('verschil', a) ? 'is-fout' : ''}>{som('verschil', a)}</td>
              <td title={s.rijen.filter((r) => r.actie === a && r.uitkomst === 'doel-weigert').map((r) => r.reden).join(', ')}>{som('doel-weigert', a)}</td><td>{som('onbereikbaar', a)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : null}
      <div className='diag-knoppen'><button type='button' onClick={() => void laad()} data-beleid-knop='vernieuwen'><RefreshCw aria-hidden='true' />{uk ? 'Оновити' : 'Vernieuwen'}</button></div>
    </div>
  );
}

type SiemDoel = { ingesteld: boolean; doel: string; gestart: boolean; achterstand: number | null; geexporteerd: number; fouten: number; laatsteFout: string | null; laatsteFoutOp: number | null; bijgewerkt: number | null };
type SiemStand = { aan: boolean; lokiGeweigerd: boolean; intervalS: number; bestand: SiemDoel; loki: SiemDoel };
/** Etap E: export van het journaal naar de eigen SIEM — alleen de stand (aan/uit, achterstand, laatste fout). Aanzetten doet root. */
export function Siem({ uk }: { uk: boolean }) {
  const [s, setS] = useState<SiemStand | null>(null);
  const [fout, setFout] = useState('');
  const laad = () => api.post('/api/beheer/siem/stand', diagnoseBody()).then((r) => setS(r.data as SiemStand), (e) => setFout(String(e?.message || 'FOUT')));
  useEffect(() => { void laad(); }, []);
  if (fout) return <p className='diag-melding' role='alert'>{fout === 'TECH_JOURNAAL_VEREIST' ? (uk ? 'Потрібен активний технічний профіль із правом читати журнал (Адміністратор, Аудитор, Власник).' : 'Een actief technisch profiel met logboekrecht is nodig.') : fout}</p>;
  if (!s) return <p className='diag-bezig' aria-busy='true'><RefreshCw className='spin' aria-hidden='true' />{uk ? 'Завантаження…' : 'Laden…'}</p>;
  const rij = (naam: string, d: SiemDoel) => !d.ingesteld ? null : (
    <tr key={naam} data-siem-doel={naam} data-siem-fouten={d.fouten}>
      <th scope='row'>{naam}<br /><small><code>{d.doel}</code></small></th>
      <td>{d.gestart ? d.geexporteerd : '—'}</td>
      <td className={(d.achterstand ?? 0) > 500 ? 'is-fout' : ''}>{d.achterstand ?? '—'}</td>
      <td className={d.fouten ? 'is-fout' : ''} title={d.laatsteFout ?? ''}>{d.fouten ? `${d.fouten} · ${d.laatsteFout ?? ''}` : '0'}</td>
    </tr>
  );
  const problemen = [s.bestand, s.loki].some((d) => d.ingesteld && (d.fouten > 0 || (d.achterstand ?? 0) > 500));
  return (
    <div className='diag-beleid' data-diag-siem='1'>
      <p className='diag-lead'>{uk ? 'Кожен запис журналу має поля «профіль», «від імені» і «простір» та може копіюватися у вашу систему SIEM на цьому ж сервері: файл NDJSON (Wazuh, Promtail, Vector) і/або Loki на 127.0.0.1. Назовні — нічого.' : 'Elke logregel heeft de velden «profiel», «namens» en «werkruimte» en kan naar uw eigen SIEM op deze server: NDJSON-bestand (Wazuh, Promtail, Vector) en/of Loki op 127.0.0.1. Niets naar buiten.'}</p>
      {s.lokiGeweigerd ? <p className='diag-melding' role='alert'>{uk ? 'Адресу Loki відхилено: дозволено лише http://127.0.0.1, localhost або [::1].' : 'Loki-adres geweigerd: alleen http://127.0.0.1, localhost of [::1].'}</p> : null}
      <section className={`diag-oordeel ${!s.aan ? 'is-alleen-ik' : problemen ? 'is-iedereen' : 'is-alles-ok'}`} data-siem-oordeel={!s.aan ? 'uit' : problemen ? 'let-op' : 'ok'}>
        <h3>{!s.aan ? (uk ? 'Експорт вимкнено' : 'Export uit') : problemen ? (uk ? 'Експорт відстає або має помилки' : 'Export loopt achter of heeft fouten') : (uk ? 'Експорт працює' : 'Export werkt')}</h3>
        <p>{!s.aan ? (uk ? 'Увімкнути (на сервері, як beheer): sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --bestand  (або --loki http://127.0.0.1:3100). Інструкція: deploy/SIEM.md.' : 'Aanzetten (op de server, als beheer): sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --bestand  (of --loki http://127.0.0.1:3100). Zie deploy/SIEM.md.')
          : (uk ? `Кожні ${s.intervalS} с нові записи йдуть у вибрані напрямки. Після збою — повтор із того ж місця.` : `Elke ${s.intervalS} s gaan nieuwe regels naar de gekozen bestemmingen. Na een storing: opnieuw vanaf dezelfde plek.`)}</p>
      </section>
      {s.aan ? (
        <table className='diag-beleid-tabel'>
          <thead><tr><th>{uk ? 'Куди' : 'Waarheen'}</th><th>{uk ? 'Надіслано' : 'Verstuurd'}</th><th>{uk ? 'Чекає' : 'Wacht'}</th><th>{uk ? 'Помилки' : 'Fouten'}</th></tr></thead>
          <tbody>{rij(uk ? 'Файл' : 'Bestand', s.bestand)}{rij('Loki', s.loki)}</tbody>
        </table>
      ) : null}
      <div className='diag-knoppen'><button type='button' onClick={() => void laad()} data-siem-knop='vernieuwen'><RefreshCw aria-hidden='true' />{uk ? 'Оновити' : 'Vernieuwen'}</button></div>
    </div>
  );
}
