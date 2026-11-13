// Instellingen van de woning: naam, tijdzone, verdiepingen (eigenaar); leden met rol (lid/gast/installateur/ondersteuning,
// tijdelijk voor de laatste twee); nieuwe woning. Toegang en rollen zijn RLS-gedekt (migratie 0128); hier alleen de bediening.
import { useEffect, useState } from 'react';
import { Home, LogOut, Plus, Trash2, Users, X } from 'lucide-react';
import { HUIS_UITLEG, TIJDZONES_VAAK, alleTijdzones, type Verdieping } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import { HuisFout, huisClient, kiesWoning, type LidUit, type Uitnodiging } from '../huis-client';
import { datumTekst, foutTekst, tr } from '../tekst';
import UitnodigingenVoorMij from './UitnodigingenVoorMij';

const ROL: Record<string, [string, string]> = { eigenaar: ['власник', 'eigenaar'], lid: ['мешканець (керує)', 'bewoner (bedient)'], gast: ['гість (лише перегляд)', 'gast (alleen kijken)'], installateur: ['інсталятор (тимчасово)', 'installateur (tijdelijk)'], ondersteuning: ['підтримка (тимчасово)', 'ondersteuning (tijdelijk)'] };
// HUIS-001: de volledige lijst van de browser (Intl), met de vaak gebruikte bovenaan — geen vaste lijst van 7 meer.
const ALLE_TIJDZONES = alleTijdzones();

export default function Instellingen({ lang, woningId, ov, vernieuw, toon, onWoningen }: OnderdeelProps & { onWoningen: () => Promise<void> }) {
  const [naam, setNaam] = useState(ov.woning.naam);
  const [tijdzone, setTijdzone] = useState(ov.woning.tijdzone);
  const [verdiepingen, setVerdiepingen] = useState<Verdieping[]>(ov.woning.verdiepingen);
  const [leden, setLeden] = useState<LidUit[] | null>(null);
  const [uitnodigingen, setUitnodigingen] = useState<Uitnodiging[]>([]);
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('lid');
  const [dagen, setDagen] = useState(7);
  const [nieuweWoning, setNieuweWoning] = useState('');
  const [bezig, setBezig] = useState(false);
  const eigenaar = ov.lid.rol === 'eigenaar';
  const fout = (e: unknown) => toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout');
  const laadLeden = async () => { try { const r = await huisClient.leden(woningId); setLeden(r.leden); setUitnodigingen(r.uitnodigingen); } catch (e) { fout(e); setLeden([]); setUitnodigingen([]); } };
  useEffect(() => { void laadLeden(); setNaam(ov.woning.naam); setTijdzone(ov.woning.tijdzone); setVerdiepingen(ov.woning.verdiepingen); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [woningId, ov.woning]);
  const doe = async (f: () => Promise<unknown>, ok?: string) => { setBezig(true); try { await f(); await vernieuw(); await onWoningen(); if (ok) toon(ok); } catch (e) { fout(e); } finally { setBezig(false); } };
  const veranderd = naam.trim() !== ov.woning.naam || tijdzone !== ov.woning.tijdzone || JSON.stringify(verdiepingen) !== JSON.stringify(ov.woning.verdiepingen);
  return (
    <div className='hv-instellingen'>
      <section className='hv-blok' aria-labelledby='hv-inst-woning'>
        <h3 id='hv-inst-woning'><Home aria-hidden='true' /> {tr(lang, 'Оселя', 'Woning')}</h3>
        <form onSubmit={(e) => { e.preventDefault(); if (eigenaar && veranderd) void doe(() => huisClient.woningWijzig(woningId, { naam: naam.trim(), tijdzone, verdiepingen }), tr(lang, 'Збережено.', 'Opgeslagen.')); }}>
          <label className='hv-veld'><span>{tr(lang, 'Назва', 'Naam')}</span><input value={naam} maxLength={80} disabled={!eigenaar} onChange={(e) => setNaam(e.target.value)} data-hv-inst-naam='1' /></label>
          <label className='hv-veld'><span>{tr(lang, 'Часовий пояс', 'Tijdzone')}</span><select value={tijdzone} disabled={!eigenaar} onChange={(e) => setTijdzone(e.target.value)}>{ALLE_TIJDZONES.includes(tijdzone) ? null : <option value={tijdzone}>{tijdzone}</option>}<optgroup label={tr(lang, 'Часто вживані', 'Veelgebruikt')}>{TIJDZONES_VAAK.map((z) => <option key={`v:${z}`} value={z}>{z}</option>)}</optgroup><optgroup label={tr(lang, 'Усі часові пояси', 'Alle tijdzones')}>{ALLE_TIJDZONES.filter((z) => !TIJDZONES_VAAK.includes(z)).map((z) => <option key={z} value={z}>{z}</option>)}</optgroup></select></label>
          <h4 className='hv-sub'>{tr(lang, 'Поверхи', 'Verdiepingen')}</h4>
          <ul className='hv-lijst is-dicht'>
            {verdiepingen.map((v, i) => <li key={v.id}><input value={v.naam} maxLength={40} disabled={!eigenaar} aria-label={tr(lang, `Поверх ${i + 1}`, `Verdieping ${i + 1}`)} onChange={(e) => setVerdiepingen(verdiepingen.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)))} data-hv-verdieping-naam={v.id} />{eigenaar && verdiepingen.length > 1 ? <button type='button' className='hv-icoonknop is-gevaar' disabled={ov.ruimtes.some((r) => r.verdieping === v.id)} title={ov.ruimtes.some((r) => r.verdieping === v.id) ? tr(lang, 'На поверсі є кімнати', 'Er staan kamers op deze verdieping') : ''} onClick={() => setVerdiepingen(verdiepingen.filter((_, j) => j !== i))} aria-label={tr(lang, 'Прибрати поверх', 'Verdieping weghalen')}><Trash2 /></button> : null}</li>)}
          </ul>
          {eigenaar ? <div className='hv-knoppen'>
            <button type='button' className='hv-knop is-klein' disabled={verdiepingen.length >= 12} onClick={() => setVerdiepingen([...verdiepingen, { id: String(Math.max(-1, ...verdiepingen.map((v) => Number(v.id) || 0)) + 1), naam: tr(lang, `Поверх ${verdiepingen.length}`, `Verdieping ${verdiepingen.length}`) }])} data-hv-verdieping-nieuw='1'><Plus aria-hidden='true' />{tr(lang, 'Додати поверх', 'Verdieping toevoegen')}</button>
            <button type='submit' className='hv-knop is-hoofd' disabled={bezig || !veranderd || !naam.trim()} data-hv-inst-bewaar='1'>{tr(lang, 'Зберегти', 'Opslaan')}</button>
          </div> : <p className='hv-hint'>{tr(lang, 'Змінювати оселю може лише власник.', 'Alleen de eigenaar kan de woning wijzigen.')}</p>}
        </form>
      </section>

      <section className='hv-blok' aria-labelledby='hv-inst-leden'>
        <h3 id='hv-inst-leden'><Users aria-hidden='true' /> {tr(lang, 'Учасники', 'Leden')}</h3>
        <ul className='hv-lijst is-dicht' data-hv-leden={leden?.length ?? 0}>
          {(leden ?? []).map((l) => <li key={l.userId} data-hv-lid={l.userId}><span><strong>{l.naam || l.email || l.userId}</strong> <small>{l.email} · {tr(lang, ROL[l.rol]?.[0] ?? l.rol, ROL[l.rol]?.[1] ?? l.rol)}{l.geldigTot ? ` · ${tr(lang, 'до', 'tot')} ${datumTekst(lang, l.geldigTot, false)}` : ''}</small></span>{eigenaar && l.userId !== ov.lid.userId ? <button type='button' className='hv-icoonknop is-gevaar' disabled={bezig} title={tr(lang, 'Учасник одразу втратить доступ до пристроїв і подій цієї оселі.', 'Het lid verliest meteen de toegang tot de apparaten en gebeurtenissen van deze woning.')} onClick={() => { if (window.confirm(tr(lang, 'Прибрати учасника? Він одразу втратить доступ до пристроїв і подій цієї оселі.', 'Lid weghalen? Het verliest meteen de toegang tot de apparaten en gebeurtenissen van deze woning.'))) void doe(async () => { await huisClient.lidVerwijder(woningId, l.userId); await laadLeden(); }, tr(lang, 'Учасника прибрано.', 'Lid weggehaald.')); }} aria-label={tr(lang, 'Прибрати', 'Weghalen')}><Trash2 /></button> : null}</li>)}
        </ul>
        {eigenaar && uitnodigingen.length ? (
          <>
            <h4 className='hv-sub'>{tr(lang, 'Надіслані запрошення (ще не прийняті)', 'Verstuurde uitnodigingen (nog niet aanvaard)')}</h4>
            <ul className='hv-lijst is-dicht' data-hv-uitnodigingen={uitnodigingen.length}>
              {uitnodigingen.map((u) => <li key={u.id} data-hv-uitnodiging={u.id}><span><strong>{u.email}</strong> <small>{tr(lang, ROL[u.rol]?.[0] ?? u.rol, ROL[u.rol]?.[1] ?? u.rol)} · {tr(lang, 'очікує на прийняття до', 'wacht op aanvaarding tot')} {datumTekst(lang, u.verlooptOp, false)}</small></span><button type='button' className='hv-knop is-klein' disabled={bezig} title={tr(lang, 'Відкликане запрошення вже не можна прийняти. Людині про це окремо не повідомляємо.', 'Een ingetrokken uitnodiging kan niet meer aanvaard worden. De persoon krijgt daar geen apart bericht over.')} onClick={() => { if (window.confirm(tr(lang, `Відкликати запрошення для ${u.email}? Прийняти його вже буде неможливо.`, `De uitnodiging voor ${u.email} intrekken? Ze kan daarna niet meer aanvaard worden.`))) void doe(async () => { await huisClient.uitnodigingIntrekken(woningId, u.id); await laadLeden(); }, tr(lang, 'Запрошення відкликано.', 'Uitnodiging ingetrokken.')); }} data-hv-uitnodiging-intrek={u.id}><X aria-hidden='true' />{tr(lang, 'Відкликати', 'Intrekken')}</button></li>)}
            </ul>
          </>
        ) : null}
        {eigenaar ? (
          <form className='hv-rij is-wrap' onSubmit={(e) => { e.preventDefault(); if (email.trim()) void doe(async () => { await huisClient.lidUitnodigen(woningId, email.trim(), rol, dagen); setEmail(''); await laadLeden(); }, tr(lang, HUIS_UITLEG.UITNODIGING_VERSTUURD[0], HUIS_UITLEG.UITNODIGING_VERSTUURD[1])); }}>
            <input type='email' value={email} maxLength={254} placeholder={tr(lang, 'e-mail людини, яку запрошуєте', 'e-mailadres van wie u uitnodigt')} aria-label={tr(lang, 'Електронна адреса', 'E-mailadres')} onChange={(e) => setEmail(e.target.value)} data-hv-lid-email='1' />
            <select value={rol} aria-label={tr(lang, 'Роль', 'Rol')} onChange={(e) => setRol(e.target.value)} data-hv-lid-rol='1'>{['lid', 'gast', 'installateur', 'ondersteuning'].map((r) => <option key={r} value={r}>{tr(lang, ROL[r][0], ROL[r][1])}</option>)}</select>
            {rol === 'installateur' || rol === 'ondersteuning' ? <label className='hv-veld is-rij'><span>{tr(lang, 'днів', 'dagen')}</span><input type='number' min={1} max={90} value={dagen} onChange={(e) => setDagen(Number(e.target.value))} /></label> : null}
            <button type='submit' className='hv-knop' disabled={bezig || !email.trim()} title={tr(lang, 'Буде записано запрошення. Учасником людина стане лише після того, як сама його прийме.', 'Er wordt een uitnodiging vastgelegd. Lid wordt de persoon pas nadat hij of zij ze zelf aanvaardt.')} data-hv-lid-toevoegen='1'><Plus aria-hidden='true' />{tr(lang, 'Запросити', 'Uitnodigen')}</button>
          </form>
        ) : null}
        {!eigenaar ? (
          <div className='hv-knoppen'>
            <button type='button' className='hv-knop is-klein' disabled={bezig} title={tr(lang, HUIS_UITLEG.LID_VERLATEN[0], HUIS_UITLEG.LID_VERLATEN[1])} onClick={() => { if (window.confirm(tr(lang, `Вийти з оселі «${ov.woning.naam}»? ${HUIS_UITLEG.LID_VERLATEN[0]}`, `De woning «${ov.woning.naam}» verlaten? ${HUIS_UITLEG.LID_VERLATEN[1]}`))) void (async () => { setBezig(true); try { await huisClient.lidVerlaten(woningId); kiesWoning(''); toon(tr(lang, 'Ви вийшли з оселі.', 'U hebt de woning verlaten.')); await onWoningen(); } catch (e) { fout(e); } finally { setBezig(false); } })(); }} data-hv-woning-verlaten='1'><LogOut aria-hidden='true' />{tr(lang, 'Вийти з оселі', 'Woning verlaten')}</button>
          </div>
        ) : null}
        <p className='hv-hint'>{tr(lang, 'Учасником стають лише після власної згоди: запрошена людина бачить блок «Запрошення для вас» у вкладці «Налаштування» (посилання є в її сповіщенні) і сама натискає «Прийняти». Вийти з оселі учасник може будь-коли сам. Запрошення діє 14 днів. Гість лише переглядає; мешканець керує пристроями; інсталятор і підтримка — тимчасово, доступ сам спливає.', 'Lid wordt men alleen met eigen toestemming: wie uitgenodigd is, ziet het blok «Uitnodigingen voor u» in de tab «Instellingen» (de link staat in de melding) en kiest zelf «Aanvaarden». Een lid kan de woning altijd zelf verlaten. Een uitnodiging geldt 14 dagen. Een gast kijkt alleen; een bewoner bedient de apparaten; installateur en ondersteuning zijn tijdelijk, de toegang verloopt vanzelf.')}</p>
      </section>

      <UitnodigingenVoorMij lang={lang} toon={toon} naAanvaarden={async (id) => { await onWoningen(); kiesWoning(id); }} />

      <section className='hv-blok' aria-labelledby='hv-inst-nieuw'>
        <h3 id='hv-inst-nieuw'>{tr(lang, 'Ще одна оселя', 'Nog een woning')}</h3>
        <form className='hv-rij' onSubmit={(e) => { e.preventDefault(); const n = nieuweWoning.trim(); if (n) void doe(async () => { const w = await huisClient.woningNieuw(n, lang); kiesWoning(w.id); setNieuweWoning(''); }, tr(lang, 'Оселю створено — виберіть її у заголовку.', 'Woning aangemaakt — kies ze in de kop.')); }}>
          <input value={nieuweWoning} maxLength={80} placeholder={tr(lang, 'Назва', 'Naam')} aria-label={tr(lang, 'Назва нової оселі', 'Naam van de nieuwe woning')} onChange={(e) => setNieuweWoning(e.target.value)} />
          <button type='submit' className='hv-knop' disabled={bezig || !nieuweWoning.trim()}><Plus aria-hidden='true' />{tr(lang, 'Створити', 'Aanmaken')}</button>
        </form>
      </section>
      <p className='hv-hint'>{tr(lang, 'Дані оселі ізольовані на рівні бази (RLS): інші користувачі сервера їх не бачать. Токени інтеграцій зашифровані ключем сервера.', 'De gegevens van de woning zijn op databankniveau geïsoleerd (RLS): andere gebruikers van de server zien ze niet. Tokens van integraties zijn versleuteld met de serversleutel.')}</p>
    </div>
  );
}
