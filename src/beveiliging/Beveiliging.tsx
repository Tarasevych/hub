// /diagnostiek → «Захист»: auth-poort, OPA fail-closed en RLS. Per bescherming: stand (вимкнено / тінь / увімкнено), gereedheid
// (controles die de SERVER op de echte database en dienst uitvoert), «Увімкнути» (alleen de eigenaar in een technisch profiel, met
// passkey: de server antwoordt STEP_UP_REQUIRED en client.ts opent het venster «Підтвердіть доступ») en «Вимкнути» (meteen).
// De browser beslist niets: knoppen zijn alleen hulp, de server controleert alles opnieuw (backend/beveiliging-schakelaars.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Database, Fingerprint, KeyRound, Power, RefreshCw, Shield, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { api } from '../platform/client';
import './beveiliging.css';
import HulpVraag from '../hulp/HulpVraag';
import { redenFoutcode } from './reden';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
type Controle = { id: string; ok: boolean; uk: string; nl: string; detail?: string; info?: boolean; lijst?: Array<{ naam: string; aantal: number }> };
type Kaart = {
  sleutel: 'auth-poort' | 'opa-afdwingen' | 'rls'; stand: 'uit' | 'schaduw' | 'aan'; aan: boolean; bron: 'site' | 'env' | 'root'; geforceerd: 'aan' | 'uit' | null;
  klaar: boolean; controles: Controle[]; uren: number; laatst: { op: number; door: string; reden: string } | null; bewakingTot: number | null; automatischUit: { op: number; reden: string } | null;
};
type Ctx = { service: string; sourceOrigin: string; tabContext: string };

const INFO: Record<Kaart['sleutel'], { icoon: typeof Shield; naam: [string, string]; wat: [string, string] }> = {
  'auth-poort': { icoon: KeyRound, naam: ['Шлюз автентифікації', 'Toegangspoort'], wat: ['Маршрут поза списком публічних, що відповів би анонімному запиту 2xx, отримає 401. Зараз такі випадки лише записуються.', 'Een route buiten de publieke lijst die een anoniem verzoek met 2xx zou beantwoorden, krijgt 401. Nu wordt dat alleen geteld.'] },
  'opa-afdwingen': { icoon: ShieldCheck, naam: ['OPA fail-closed · адмінка лише в тех. профілі', 'OPA fail-closed · beheer alleen in technisch profiel'], wat: ['Права адміністрування діють лише в активному технічному профілі; якщо OPA не відповідає — відмова. Зараз OPA лише порівнює в тіні.', 'Beheerrechten gelden alleen in een actief technisch profiel; antwoordt OPA niet, dan weigeren. Nu vergelijkt OPA alleen in de schaduw.'] },
  rls: { icoon: Database, naam: ['RLS через роль застосунку', 'RLS via de rol van de app'], wat: ['База даних сама не віддає застосунку чужих рядків (політики на рівні рядків для mijnruimte_app). Зараз — режим аудиту.', 'De database geeft de app zelf geen rijen van anderen (rijbeveiliging voor mijnruimte_app). Nu: audit-modus.'] },
};
const FOUT: Record<string, [string, string]> = {
  STEP_UP_REQUIRED: ['Потрібне підтвердження passkey.', 'Bevestiging met passkey nodig.'],
  TECH_PROFIEL_VEREIST: ['Спершу активуйте технічний профіль у цій вкладці.', 'Activeer eerst een technisch profiel in dit tabblad.'],
  OWNER_REQUIRED: ['Лише власник.', 'Alleen de eigenaar.'],
  NIET_KLAAR: ['Не всі перевірки готовності пройдено — увімкнення відхилено сервером.', 'Niet alle gereedheidscontroles slagen — de server weigert het aanzetten.'],
  REDEN_VEREIST: ['Вкажіть причину (щонайменше 3 символи).', 'Geef een reden (minstens 3 tekens).'],
  GEFORCEERD: ['Стан задано примусово (змінна середовища або root-файл) — змінити тут не можна.', 'De stand is geforceerd (omgevingsvariabele of root-bestand) — hier niet te wijzigen.'],
  APP_ROL_START_MISLUKT: ['Не вдалося запустити службу створення ролі (polkit?).', 'Dienst voor het maken van de rol kon niet starten (polkit?).'],
  AGENT_NIET_TOEGESTAAN: ['Агент не може змінювати захист.', 'Een agent kan de bescherming niet wijzigen.'],
};
const fout = (lang: Lang, e: unknown) => { const c = String((e as { message?: string })?.message || ''); const t = FOUT[c]; return t ? tr(lang, t[0], t[1]) : tr(lang, 'Помилка: ', 'Fout: ') + (c || tr(lang, 'немає звʼязку', 'geen verbinding')); };
const tijd = (lang: Lang, ms: number) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' });
const UREN = [1, 6, 24, 72, 168];

export default function Beveiliging({ lang, ctx }: { lang: Lang; ctx: Ctx }) {
  const [kaarten, setKaarten] = useState<Kaart[] | null>(null);
  const [uren, setUren] = useState(24);
  const [laden, setLaden] = useState(false);
  const [bezig, setBezig] = useState('');
  const [reden, setReden] = useState<Record<string, string>>({});
  const [redenFout, setRedenFout] = useState<Record<string, string>>({});
  const redenVeld = useRef<Record<string, HTMLInputElement | null>>({});
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null);
  const [nu, setNu] = useState(Date.now());

  const lees = useCallback(async () => {
    setLaden(true);
    try { setKaarten(((await api.post('/api/owner/beveiliging/stand', { ...ctx, uren })).data as { kaarten: Kaart[] }).kaarten); }
    catch (e) { setMelding({ soort: 'fout', tekst: fout(lang, e) }); }
    setLaden(false);
  }, [ctx, uren, lang]);
  useEffect(() => { void lees(); }, [lees]);
  // Tijdens de bewaking (10 min) elke 20 s verversen: zo is een automatische uitschakeling meteen te zien.
  const bewaakt = !!kaarten?.some((k) => k.bewakingTot);
  useEffect(() => { const t = window.setInterval(() => { setNu(Date.now()); if (bewaakt) void lees(); }, bewaakt ? 20_000 : 60_000); return () => window.clearInterval(t); }, [bewaakt, lees]);

  const actie = async (k: Kaart, soort: 'aan' | 'uit' | 'rol') => {
    if (soort === 'aan') {
      const code = redenFoutcode(reden[k.sleutel]);
      if (code) { setRedenFout((r) => ({ ...r, [k.sleutel]: tr(lang, FOUT[code][0], FOUT[code][1]) })); redenVeld.current[k.sleutel]?.focus(); return; }
    }
    setBezig(`${k.sleutel}:${soort}`); setMelding(null);
    try {
      const pad = soort === 'aan' ? 'aanzetten' : soort === 'uit' ? 'uitzetten' : 'app-rol-maken';
      await api.post(`/api/owner/beveiliging/${pad}`, { ...ctx, sleutel: k.sleutel, reden: reden[k.sleutel] || '', uren });
      setMelding({ soort: 'ok', tekst: soort === 'aan' ? tr(lang, 'Увімкнено. Наступні 10 хв запобіжник стежить за помилками й сам вимкне захист, якщо щось зламається.', 'Aangezet. De zekering bewaakt de komende 10 min de fouten en zet de bescherming zelf uit als er iets breekt.')
        : soort === 'uit' ? tr(lang, 'Вимкнено. Діє одразу.', 'Uitgezet. Werkt meteen.')
        : tr(lang, 'Службу запущено: роль створюється, сайт перезапуститься (до 1 хв). Потім натисніть «Оновити».', 'Dienst gestart: de rol wordt gemaakt, de site herstart (tot 1 min). Klik daarna «Vernieuwen».') });
      setReden((r) => ({ ...r, [k.sleutel]: '' }));
      await lees();
    } catch (e) { setMelding({ soort: 'fout', tekst: fout(lang, e) }); }
    setBezig('');
  };

  return (
    <section className='bvs' aria-label={tr(lang, 'Захист', 'Bescherming')}>
      <div className='bvs-kop'>
        <p>{tr(lang, 'Три захисти, які досі вмикалися лише через SSH. Кожен можна безпечно увімкнути одним рішенням: спершу сервер перевіряє готовність на живій базі й службах, після увімкнення 10 хвилин стежить за помилками і в разі сплеску сам вимикає. Вимкнути можна будь-коли, без passkey.',
          'Drie beschermingen die tot nu toe alleen via SSH aan konden. Elk kan veilig met één beslissing aan: eerst controleert de server de gereedheid op de echte database en diensten, na het aanzetten bewaakt hij 10 minuten de fouten en zet hij bij een piek zelf uit. Uitzetten kan altijd, zonder passkey.')}</p>
        <div className='bvs-kop-knoppen'>
          <label>{tr(lang, 'Період', 'Periode')}
            <select data-hulp-vrij='filter' value={uren} onChange={(e) => setUren(Number(e.target.value))}>{UREN.map((u) => <option key={u} value={u}>{u < 24 ? tr(lang, `${u} год`, `${u} u`) : tr(lang, `${u / 24} дн`, `${u / 24} d`)}</option>)}</select>
          </label>
          <button type='button' className='adg-knop' onClick={() => void lees()} disabled={laden}><RefreshCw className={laden ? 'adg-spin' : ''} />{tr(lang, 'Оновити', 'Vernieuwen')}</button>
        </div>
      </div>
      {melding && <p className='adg-melding' data-soort={melding.soort === 'ok' ? 'ok' : 'fout'} role='status'><span>{melding.tekst}</span><button type='button' onClick={() => setMelding(null)} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X /></button></p>}
      {!kaarten && <p className='adg-laden'><RefreshCw className='adg-spin' />{tr(lang, 'Перевіряю…', 'Controleren…')}</p>}
      <div className='bvs-kaarten'>
        {kaarten?.map((k) => {
          const I = INFO[k.sleutel], Icoon = I.icoon;
          const vast = !!k.geforceerd || k.bron === 'root';
          const blok = k.controles.filter((x) => !x.info && !x.ok).length;
          const rest = k.bewakingTot ? Math.max(0, Math.ceil((k.bewakingTot - nu) / 60000)) : 0;
          return (
            <article key={k.sleutel} className='bvs-kaart' data-stand={k.stand} data-bvs={k.sleutel}>
              <header>
                <span className='bvs-ico'><Icoon /></span>
                <div><h3>{tr(lang, I.naam[0], I.naam[1])} <HulpVraag k={`beveiliging.${k.sleutel}`} lang={lang} /></h3><p>{tr(lang, I.wat[0], I.wat[1])}</p></div>
              </header>
              <div className='bvs-pillen'>
                <span className='adg-pil' data-stand={k.stand === 'aan' ? 'ok' : k.stand === 'schaduw' ? 'let-op' : 'nooit'}>
                  {k.stand === 'aan' ? <ShieldCheck /> : k.stand === 'schaduw' ? <Shield /> : <ShieldOff />}
                  {k.stand === 'aan' ? tr(lang, 'увімкнено', 'aan') : k.stand === 'schaduw' ? tr(lang, 'тінь', 'schaduw') : tr(lang, 'вимкнено', 'uit')}
                </span>
                {!k.aan && <span className='adg-pil' data-stand={k.klaar ? 'ok' : 'fout'}>{k.klaar ? <Check /> : <AlertTriangle />}{k.klaar ? tr(lang, 'готово до увімкнення', 'klaar om aan te zetten') : tr(lang, `не готово: ${blok}`, `niet klaar: ${blok}`)}</span>}
                {vast && <span className='adg-pil' data-stand='let-op'>{k.bron === 'root' ? tr(lang, 'примусово: root-файл', 'geforceerd: root-bestand') : tr(lang, `примусово: середовище (${k.geforceerd})`, `geforceerd: omgeving (${k.geforceerd})`)}</span>}
                {k.bewakingTot && <span className='adg-pil' data-stand='let-op'><Clock />{tr(lang, `запобіжник: ще ${rest} хв`, `zekering: nog ${rest} min`)}</span>}
              </div>
              {k.automatischUit && !k.aan && <p className='adg-melding' data-soort='let-op'><span>{tr(lang, `Автоматично вимкнено запобіжником ${tijd(lang, k.automatischUit.op)} (${k.automatischUit.reden}).`, `Automatisch uitgezet door de zekering op ${tijd(lang, k.automatischUit.op)} (${k.automatischUit.reden}).`)}</span></p>}
              <ul className='bvs-controles' aria-label={tr(lang, 'Готовність', 'Gereedheid')}>
                {k.controles.map((x) => (
                  <li key={x.id} data-ok={x.ok ? '1' : x.info ? 'info' : '0'}>
                    <span className='bvs-teken' aria-hidden='true'>{x.ok ? <Check /> : x.info ? <AlertTriangle /> : <X />}</span>
                    <div>
                      <span>{tr(lang, x.uk, x.nl)}</span>
                      {x.detail && <small>{x.detail}</small>}
                      {!!x.lijst?.length && <ul className='bvs-lijst'>{x.lijst.slice(0, 12).map((l) => <li key={l.naam}><code>{l.naam}</code><b>{l.aantal}</b></li>)}{x.lijst.length > 12 && <li>… +{x.lijst.length - 12}</li>}</ul>}
                    </div>
                  </li>
                ))}
              </ul>
              {k.laatst && k.laatst.door && <p className='bvs-laatst'>{tr(lang, 'Остання зміна', 'Laatste wijziging')}: {tijd(lang, k.laatst.op)} · {k.laatst.door}{k.laatst.reden ? ` · «${k.laatst.reden}»` : ''}</p>}
              <div className='bvs-acties'>
                {!k.aan && !vast && <input type='text' ref={(el) => { redenVeld.current[k.sleutel] = el; }} value={reden[k.sleutel] || ''} maxLength={300} onChange={(e) => { setReden((r) => ({ ...r, [k.sleutel]: e.target.value })); setRedenFout((r) => ({ ...r, [k.sleutel]: '' })); }} placeholder={tr(lang, 'Причина (для журналу)', 'Reden (voor het journaal)')} aria-label={tr(lang, 'Причина', 'Reden')} aria-invalid={redenFout[k.sleutel] ? true : undefined} aria-describedby={redenFout[k.sleutel] ? `bvs-reden-fout-${k.sleutel}` : undefined} />}
                {!k.aan && !vast && redenFout[k.sleutel] && <p id={`bvs-reden-fout-${k.sleutel}`} className='bvs-veld-fout' role='alert'>{redenFout[k.sleutel]}</p>}
                {k.sleutel === 'rls' && !k.aan && k.controles.some((x) => x.id === 'app-url' && !x.ok) && (
                  <button type='button' className='adg-knop' disabled={!!bezig} onClick={() => void actie(k, 'rol')}><Fingerprint />{tr(lang, 'Створити роль застосунку', 'Rol van de app maken')}</button>
                )}
                {!k.aan && !vast && <button type='button' className='adg-knop adg-knop-hoofd' disabled={!!bezig || !k.klaar} onClick={() => void actie(k, 'aan')} title={!k.klaar ? tr(lang, 'Спершу всі перевірки мають пройти', 'Eerst moeten alle controles slagen') : ''}><Fingerprint />{tr(lang, 'Увімкнути', 'Aanzetten')}</button>}
                {k.aan && k.bron === 'site' && !k.geforceerd && <button type='button' className='adg-knop bvs-uit' disabled={!!bezig} onClick={() => void actie(k, 'uit')}><Power />{tr(lang, 'Вимкнути', 'Uitzetten')}</button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
