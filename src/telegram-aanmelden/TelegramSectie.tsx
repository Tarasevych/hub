// «Способи входу» → Telegram (gebruiker). Alles wat u over uw eigen Telegram-koppelingen moet weten en kunnen, op één plek:
//   • koppelingen met de VOLLEDIGE identiteit (nummer tot het laatste cijfer, @nickname, naam, foto, Telegram-id) — niets gemaskeerd;
//   • koppelen in 3 stappen, met bij elke stap waarom het gevraagd wordt (eigen nummer delen is verplicht);
//   • gewijzigde gegevens: kaart met oud → nieuw, «Ні, це не я» meteen, «Так, це я» pas na aftelling (+ vinkje bij ernstig) en passkey;
//   • de bevestigingstabel (welke methode bevestigt welke handeling) en de geheime code met sterktemeter en alarmcode.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { foutTekst, identiteitCtx, tgPost, type Ctx } from './api';
import { AftelKnop, useBevestiging, useEenmalig } from './Bevestigen';
import TelegramLogo from './TelegramLogo';
import { KEUZE_IDS, KEUZE_NAMEN, eisVan, keuzeToegestaan, type ActieSoort, type KeuzeId } from '../../shared/telegram-aanmelden/beleid';
import { KOPPEL_RECHTEN, tekstIn, type KoppelRecht } from '../../shared/telegram-aanmelden/model';
import { VELD_NAMEN } from '../../shared/telegram-aanmelden/teksten';
import { codeRedenTekst, codeZwakte } from '../../shared/telegram-aanmelden/code-sterkte';
import './telegram.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Vinger = { telegramId: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string; fotoId: string };
type Koppeling = { id: string; naam: string; rechten: KoppelRecht[]; stand: string; reden: string; kleur: string; vingerafdruk: Vinger; aangemaaktOp: string; laatstGebruiktOp: string | null };
type Wijziging = { id: string; koppelingId: string; ernst: 'vervalsing' | 'ernstig' | 'gewoon'; verschillen: Array<{ veld: string; oud: string; nieuw: string }>; status: string; aangemaaktOp: string };
type MatrixRij = { sleutel: string; naam: readonly [string, string]; minimum: KeuzeId; standaard: KeuzeId; gevoelig: boolean; keuze: KeuzeId; eis: string[][] };
type Mijn = {
  mag: string; bot: string; limiet: number; aftel: { gewoon: number; ernstig: number }; onbeantwoordUren: number;
  code: { ingesteld: boolean; alarm: boolean; uitgeschakeld: boolean; reden: string; pauzeTot: string | null; mislukt: number; minLengte: number; maxLengte: number };
  koppelingen: Koppeling[]; wijzigingen: Wijziging[]; matrix: MatrixRij[]; beschikbaar: string[]; geblokkeerd: Array<{ apparaat: string; op: string }>; status: { stand: string; soort: string };
};

const RECHT_NAMEN: Record<KoppelRecht, [string, string, string, string]> = {
  aanmelden: ['Вхід', 'Aanmelden', 'Входити в Мій простір через цей Telegram.', 'Aanmelden bij Mijn Ruimte met deze Telegram.'],
  bevestigen: ['Підтвердження', 'Bevestigen', 'Підтверджувати дії кнопкою в Telegram (за вашою таблицею нижче).', 'Handelingen bevestigen met een knop in Telegram (volgens uw tabel hieronder).'],
  meldingen: ['Сповіщення', 'Meldingen', 'Отримувати сповіщення про входи та зміни безпеки.', 'Meldingen ontvangen over aanmeldingen en beveiligingswijzigingen.'],
};
const STAND_NAMEN: Record<string, [string, string, string, string]> = {
  actief: ['Працює', 'Actief', '', ''],
  gepauzeerd: ['Призупинено', 'Gepauzeerd', 'Дані Telegram змінилися — підтвердіть зміни нижче, щоб знову користуватися.', 'Telegram-gegevens zijn gewijzigd — bevestig de wijziging hieronder om weer te gebruiken.'],
  geblokkeerd: ['Заблоковано', 'Geblokkeerd', 'Змінився номер телефону. З міркувань безпеки — лише повторне прив’язування з новим номером.', 'Het telefoonnummer is gewijzigd. Uit veiligheid alleen opnieuw koppelen met het nieuwe nummer.'],
  uitgeschakeld: ['Вимкнено', 'Uitgeschakeld', 'Цю прив’язку вимкнено. Щоб користуватися знову — прив’яжіть з нуля.', 'Deze koppeling is uitgeschakeld. Om opnieuw te gebruiken — koppel vanaf nul.'],
};
const tijd = (iso: string | null, lang: Lang) => (iso ? new Date(iso).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { timeZone: 'Europe/Brussels', dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function TelegramSectie({ lang }: { lang: Lang }) {
  const ctx = useMemo<Ctx>(() => identiteitCtx(), []);
  const [mijn, setMijn] = useState<Mijn | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [wizard, setWizard] = useState(false);
  const { uitvoeren, venster } = useBevestiging(ctx, lang);
  const laden = useCallback(async () => { try { setMijn(await tgPost<Mijn>(ctx, '/api/owner/telegram/mijn')); setFout(''); } catch (e) { setFout(foutTekst(lang, e)); } }, [ctx, lang]);
  useEffect(() => { void laden(); }, [laden]);
  const doeMet = async (fn: () => Promise<unknown>, ok: string) => {
    setMelding(''); setFout('');
    try { await uitvoeren(fn); setMelding(ok); await laden(); } catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  };

  if (!mijn) return fout ? null : <section className='tga-sectie' aria-busy='true'><p><span className='tga-draai' aria-hidden='true' /> {tr(lang, 'Завантажуємо Telegram…', 'Telegram laden…')}</p></section>;
  const storing = mijn.status.stand === 'storing';
  return <section className='tga-sectie' data-telegram-aanmelden>
    {venster}
    <header className='tga-sectie-kop'>
      <TelegramLogo maat={36} />
      <div><h2>Telegram</h2><p>{tr(lang, `Вхід і підтвердження через ваш власний Telegram (бот @${mijn.bot}).`, `Aanmelden en bevestigen via uw eigen Telegram (bot @${mijn.bot}).`)}</p></div>
      <span className={`tga-stand tga-stand-${storing ? 'storing' : mijn.status.stand}`}>{storing ? tr(lang, 'Тимчасово не працює', 'Tijdelijk buiten werking') : mijn.status.stand === 'werkt' ? tr(lang, 'Працює', 'Werkt') : mijn.status.stand === 'traag' ? tr(lang, 'Повільно', 'Traag') : tr(lang, 'Не налаштовано', 'Niet ingesteld')}</span>
    </header>
    {storing && <p className='tga-let'>{mijn.status.soort === 'lang' ? tr(lang, 'Telegram не відповідає вже понад 10 хвилин. Ваші дії підтверджуються іншими способами (ключ доступу) — нічого не заблоковано.', 'Telegram antwoordt al meer dan 10 minuten niet. Uw handelingen worden met andere methoden (passkey) bevestigd — niets is geblokkeerd.')
      : tr(lang, 'Telegram тимчасово не відповідає. Зазвичай це минає за кілька хвилин.', 'Telegram antwoordt tijdelijk niet. Meestal is dat binnen enkele minuten voorbij.')}</p>}
    {melding && <p className='tga-ok' role='status'>{melding}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}

    {mijn.wijzigingen.map((w) => <WijzigingKaart key={w.id} ctx={ctx} lang={lang} w={w} k={mijn.koppelingen.find((x) => x.id === w.koppelingId)} klaar={laden} />)}

    <h3>{tr(lang, 'Ваші прив’язки', 'Uw koppelingen')} <small>({mijn.koppelingen.filter((k) => k.stand !== 'uitgeschakeld').length}/{mijn.limiet})</small></h3>
    {mijn.koppelingen.length === 0 && <p className='tga-klein'>{tr(lang, 'Ще немає жодного прив’язаного Telegram.', 'Er is nog geen Telegram gekoppeld.')}</p>}
    {mijn.koppelingen.map((k) => <KoppelingKaart key={k.id} ctx={ctx} lang={lang} k={k}
      opslaan={(naam, rechten) => doeMet(() => tgPost(ctx, '/api/owner/telegram/koppeling', { koppelingId: k.id, naam, rechten }), tr(lang, 'Збережено.', 'Opgeslagen.'))}
      ontkoppelen={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/ontkoppelen', { koppelingId: k.id }), tr(lang, 'Telegram відв’язано. Бот більше не має доступу до вашого акаунта.', 'Telegram ontkoppeld. De bot heeft geen toegang meer tot uw account.'))} />)}

    {!mijn.mag ? (wizard ? <KoppelWizard ctx={ctx} lang={lang} bot={mijn.bot} aftel={mijn.aftel.gewoon} uitvoeren={uitvoeren} klaar={(ok) => { setWizard(false); if (ok) { setMelding(tr(lang, 'Telegram прив’язано. Ми надіслали підтвердження у чат.', 'Telegram gekoppeld. We stuurden een bevestiging in de chat.')); } void laden(); }} />
      : <button type='button' className='tga-aanmeld-knop' onClick={() => setWizard(true)} disabled={storing}><TelegramLogo maat={20} /><span>{tr(lang, 'Прив’язати Telegram', 'Telegram koppelen')}</span></button>)
      : <p className='tga-let'>{mijn.mag === 'UITGESCHAKELD' ? tr(lang, 'Адміністратор тимчасово вимкнув Telegram для всіх. Наявні прив’язки збережено.', 'De beheerder heeft Telegram tijdelijk voor iedereen uitgezet. Bestaande koppelingen blijven bewaard.') : tr(lang, 'Адміністратор не дозволив прив’язувати Telegram до цього акаунта.', 'De beheerder staat het koppelen van Telegram aan dit account niet toe.')}</p>}

    {mijn.geblokkeerd.length > 0 && <div className='tga-blok'>
      <h3>{tr(lang, 'Заблоковані пристрої', 'Geblokkeerde apparaten')}</h3>
      <p className='tga-waarom'>{tr(lang, 'З цих пристроїв вхід через Telegram неможливий, бо на них відхилили вхід («Ні, це не я») або зміну. Розблокуйте, лише якщо це справді ваш пристрій.', 'Vanaf deze apparaten kan niemand met Telegram aanmelden, omdat daar een aanmelding («Nee, dit ben ik niet») of wijziging werd geweigerd. Hef de blokkade alleen op als het echt uw apparaat is.')}</p>
      <ul className='tga-stap-lijst'>{mijn.geblokkeerd.map((g) => <li key={g.apparaat} className='tga-rij'><span>⛔ {g.apparaat} · {tijd(g.op, lang)}</span>
        <button type='button' className='tga-knop' onClick={() => void doeMet(() => tgPost(ctx, '/api/owner/telegram/deblokkeren', { apparaat: g.apparaat }), tr(lang, 'Пристрій розблоковано.', 'Apparaat gedeblokkeerd.'))}>{tr(lang, 'Розблокувати (ключ доступу)', 'Deblokkeren (passkey)')}</button></li>)}</ul>
    </div>}

    <Matrix ctx={ctx} lang={lang} rijen={mijn.matrix} beschikbaar={mijn.beschikbaar} opslaan={(body) => doeMet(() => tgPost(ctx, '/api/owner/telegram/matrix', body), tr(lang, 'Таблицю підтверджень збережено.', 'Bevestigingstabel opgeslagen.'))} />
    <GeheimeCode lang={lang} code={mijn.code} telefoons={mijn.koppelingen.map((k) => k.vingerafdruk.telefoon).join(' ')}
      instellen={(code, alarmCode) => doeMet(() => tgPost(ctx, '/api/owner/telegram/code/instellen', { code, alarmCode }), tr(lang, 'Таємний код збережено.', 'Geheime code opgeslagen.'))}
      verwijderen={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/code/verwijderen'), tr(lang, 'Таємний код видалено.', 'Geheime code verwijderd.'))}
      herstellen={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/code/herstellen'), tr(lang, 'Таємний код знову працює.', 'De geheime code werkt weer.'))} />
  </section>;
}

// ------------------------------------------------------------------------------------------------ identiteit (niets gemaskeerd)
function Identiteit({ lang, v, foto }: { lang: Lang; v: Partial<Vinger>; foto?: string }) {
  const naam = [v.voornaam, v.achternaam].filter(Boolean).join(' ');
  return <div className='tga-identiteit'>
    {foto ? <img src={foto} alt={tr(lang, 'Фото профілю Telegram', 'Telegram-profielfoto')} width={56} height={56} /> : <span className='tga-geen-foto' aria-hidden='true'>{(naam || '?').slice(0, 1)}</span>}
    <dl>
      <dt>{tr(lang, 'Телефон', 'Telefoon')}</dt><dd className='tga-mono'>{v.telefoon ? `+${String(v.telefoon).replace(/^\+/, '')}` : '—'}</dd>
      <dt>{tr(lang, 'Нікнейм', 'Gebruikersnaam')}</dt><dd>{v.gebruikersnaam ? `@${v.gebruikersnaam}` : tr(lang, 'немає', 'geen')}</dd>
      <dt>{tr(lang, 'Ім’я', 'Naam')}</dt><dd>{naam || '—'}</dd>
      <dt>{tr(lang, 'ID Telegram', 'Telegram-ID')}</dt><dd className='tga-mono'>{v.telegramId || '—'}</dd>
    </dl>
  </div>;
}

function KoppelingKaart({ ctx, lang, k, opslaan, ontkoppelen }: { ctx: Ctx; lang: Lang; k: Koppeling; opslaan: (naam: string, rechten: KoppelRecht[]) => Promise<void>; ontkoppelen: () => Promise<void> }) {
  const [foto, setFoto] = useState('');
  const [naam, setNaam] = useState(k.naam);
  const [rechten, setRechten] = useState<KoppelRecht[]>(k.rechten);
  const [zeker, setZeker] = useState(false);
  const { bezig, doe } = useEenmalig();
  useEffect(() => { if (k.vingerafdruk.fotoId) void tgPost<{ foto: string }>(ctx, '/api/owner/telegram/foto', { koppelingId: k.id }).then((r) => setFoto(r.foto)).catch(() => undefined); }, [ctx, k.id, k.vingerafdruk.fotoId]);
  const s = STAND_NAMEN[k.stand] ?? [k.stand, k.stand, '', ''];
  const gewijzigd = naam !== k.naam || rechten.join() !== k.rechten.join();
  return <article className={`tga-kaart tga-kaart-${k.stand}`}>
    <header><span aria-hidden='true'>{k.kleur}</span> <strong>{k.naam}</strong> <span className={`tga-stand tga-stand-${k.stand}`}>{lang === 'nl' ? s[1] : s[0]}</span></header>
    {(lang === 'nl' ? s[3] : s[2]) && <p className='tga-let'>{lang === 'nl' ? s[3] : s[2]}</p>}
    <Identiteit lang={lang} v={k.vingerafdruk} foto={foto} />
    <p className='tga-klein'>{tr(lang, 'Прив’язано', 'Gekoppeld')}: {tijd(k.aangemaaktOp, lang)} · {tr(lang, 'Востаннє', 'Laatst gebruikt')}: {tijd(k.laatstGebruiktOp, lang)}</p>
    {k.stand !== 'uitgeschakeld' && <>
      <label className='tga-veld'>{tr(lang, 'Назва (бачите лише ви)', 'Naam (alleen voor u)')}<input value={naam} maxLength={40} onChange={(e) => setNaam(e.target.value)} /></label>
      <fieldset className='tga-rechten'><legend>{tr(lang, 'Що дозволено цьому Telegram', 'Wat deze Telegram mag')}</legend>
        {KOPPEL_RECHTEN.map((r) => <label key={r}><input type='checkbox' checked={rechten.includes(r)} onChange={(e) => setRechten(e.target.checked ? [...rechten, r] : rechten.filter((x) => x !== r))} /> <strong>{lang === 'nl' ? RECHT_NAMEN[r][1] : RECHT_NAMEN[r][0]}</strong> — {lang === 'nl' ? RECHT_NAMEN[r][3] : RECHT_NAMEN[r][2]}</label>)}
      </fieldset>
      <div className='tga-rij'>
        <button type='button' className='tga-knop tga-knop-hoofd' disabled={!gewijzigd || bezig || rechten.length === 0} onClick={() => void doe(() => opslaan(naam, rechten))}>{tr(lang, 'Зберегти', 'Opslaan')}</button>
      </div>
    </>}
    <div className='tga-rij'>
      {!zeker ? <button type='button' className='tga-knop tga-knop-gevaar' onClick={() => setZeker(true)}>{tr(lang, 'Відв’язати', 'Ontkoppelen')}</button>
        : <><span className='tga-klein'>{tr(lang, 'Бот одразу втратить доступ; вхід і підтвердження через цей Telegram перестануть працювати.', 'De bot verliest meteen toegang; aanmelden en bevestigen met deze Telegram stoppen.')}</span>
          <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void doe(ontkoppelen)}>{tr(lang, 'Так, відв’язати', 'Ja, ontkoppelen')}</button>
          <button type='button' className='tga-knop' onClick={() => setZeker(false)}>{tr(lang, 'Ні', 'Nee')}</button></>}
    </div>
  </article>;
}

// ------------------------------------------------------------------------------------------------ koppelen in 3 stappen
function KoppelWizard({ ctx, lang, bot, aftel, uitvoeren, klaar }: { ctx: Ctx; lang: Lang; bot: string; aftel: number; uitvoeren: <T>(fn: () => Promise<T>) => Promise<T>; klaar: (ok: boolean) => void }) {
  const [stap, setStap] = useState<1 | 2 | 3>(1);
  const [naam, setNaam] = useState(tr(lang, 'Особистий', 'Persoonlijk'));
  const [verzoek, setVerzoek] = useState<{ id: string; deeplink: string; verlooptOp: string } | null>(null);
  const [stand, setStand] = useState('');
  const [id, setId] = useState<{ telegramId: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string; foto: string } | null>(null);
  const [rechten, setRechten] = useState<KoppelRecht[]>(['aanmelden', 'bevestigen', 'meldingen']);
  const [mijn, setMijnTg] = useState(false);
  const [fout, setFout] = useState('');
  const { bezig, doe } = useEenmalig();

  const starten = () => doe(async () => {
    setFout('');
    try { const r = await tgPost<{ id: string; deeplink: string; verlooptOp: string }>(ctx, '/api/owner/telegram/koppelen/start', { naam, locale: lang }); setVerzoek(r); setStap(2); }
    catch (e) { setFout(foutTekst(lang, e)); }
  });
  useEffect(() => {
    if (stap !== 2 || !verzoek) return;
    let actief = true; let t = 0;
    const kijk = async () => {
      if (!actief) return;
      try {
        const s = await tgPost<{ stand: string; identiteit?: typeof id & { heeftFoto: boolean } }>(ctx, '/api/owner/telegram/koppelen/status', { id: verzoek.id });
        setStand(s.stand);
        if (s.stand === 'wacht-passkey' && s.identiteit) { setId(s.identiteit); setStap(3); return; }
        if (['verlopen', 'geweigerd', 'geannuleerd'].includes(s.stand)) return;
      } catch (e) { setFout(foutTekst(lang, e)); }
      t = window.setTimeout(kijk, 2000);
    };
    t = window.setTimeout(kijk, 1500);
    return () => { actief = false; window.clearTimeout(t); };
  }, [stap, verzoek]); // eslint-disable-line react-hooks/exhaustive-deps

  const annuleren = () => { if (verzoek) void tgPost(ctx, '/api/owner/telegram/koppelen/annuleren', { id: verzoek.id }).catch(() => undefined); klaar(false); };
  const bevestigen = () => doe(async () => {
    if (!verzoek) return;
    setFout('');
    try { await uitvoeren(() => tgPost(ctx, '/api/owner/telegram/koppelen/bevestigen', { id: verzoek.id, rechten })); klaar(true); }
    catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  });

  return <div className='tga-wizard' aria-live='polite'>
    <ol className='tga-wizard-stappen' aria-label={tr(lang, 'Кроки', 'Stappen')}>
      {[tr(lang, 'Назва', 'Naam'), tr(lang, 'Telegram і номер', 'Telegram en nummer'), tr(lang, 'Перевірка й ключ доступу', 'Controle en passkey')].map((s, i) => <li key={s} aria-current={stap === i + 1 ? 'step' : undefined} className={stap > i ? 'klaar' : ''}>{i + 1}. {s}</li>)}
    </ol>
    {stap === 1 && <div className='tga-blok'>
      <label className='tga-veld'>{tr(lang, 'Як назвати цей Telegram (бачите лише ви)', 'Hoe heet deze Telegram (alleen voor u)')}<input value={naam} maxLength={40} onChange={(e) => setNaam(e.target.value)} /></label>
      <p className='tga-waarom'>{tr(lang, 'Навіщо: якщо прив’яжете кілька Telegram (особистий, робочий), у кожному повідомленні буде видно, для якого це.', 'Waarom: koppelt u meerdere Telegrams (persoonlijk, werk), dan ziet u in elk bericht voor welke het is.')}</p>
      <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig || naam.trim().length < 1} onClick={() => void starten()}>{tr(lang, 'Далі', 'Verder')}</button>
    </div>}
    {stap === 2 && verzoek && <div className='tga-blok'>
      <a className='tga-aanmeld-knop' href={verzoek.deeplink} target='_blank' rel='noopener noreferrer'><TelegramLogo maat={20} /><span>{tr(lang, `Відкрити @${bot} у Telegram`, `@${bot} openen in Telegram`)}</span></a>
      <ol className='tga-stappen'>
        <li>{tr(lang, 'Натисніть «Почати» (Start) у чаті з ботом.', 'Tik «Start» in de chat met de bot.')}</li>
        <li>{tr(lang, 'Натисніть кнопку «📱 Поділитися моїм номером». Ввести номер вручну не можна.', 'Tik de knop «📱 Mijn nummer delen». Een nummer typen kan niet.')}</li>
        <li>{tr(lang, 'Поверніться сюди — ми покажемо, що отримали.', 'Kom hier terug — we tonen wat we ontvingen.')}</li>
      </ol>
      <p className='tga-waarom'>{tr(lang, 'Навіщо номер: Telegram надсилає лише ВАШ власний номер, підтверджений ним самим. Якщо колись хтось захопить ваш Telegram і змінить номер, прив’язку буде одразу заблоковано — він не отримає доступу.',
        'Waarom het nummer: Telegram stuurt alleen UW eigen nummer, door Telegram zelf bevestigd. Neemt iemand ooit uw Telegram over en wijzigt het nummer, dan wordt de koppeling meteen geblokkeerd — hij krijgt geen toegang.')}</p>
      <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {stand === 'wacht-telefoon' ? tr(lang, 'Бот отримав «Почати». Чекаємо на ваш номер…', 'De bot kreeg «Start». Wachten op uw nummer…') : tr(lang, 'Чекаємо на Telegram…', 'Wachten op Telegram…')}</p>
      {stand === 'verlopen' && <p className='tga-fout'>{tr(lang, 'Час (10 хв) вийшов. Почніть знову.', 'De tijd (10 min) is om. Begin opnieuw.')}</p>}
    </div>}
    {stap === 3 && id && <div className='tga-blok'>
      <p><strong>{tr(lang, 'Перевірте: це ваш Telegram? Показано все повністю, без приховування.', 'Controleer: is dit uw Telegram? Alles staat er volledig, niets verborgen.')}</strong></p>
      <Identiteit lang={lang} v={id} foto={id.foto} />
      <fieldset className='tga-rechten'><legend>{tr(lang, 'Що дозволити', 'Wat toestaan')}</legend>
        {KOPPEL_RECHTEN.map((r) => <label key={r}><input type='checkbox' checked={rechten.includes(r)} onChange={(e) => setRechten(e.target.checked ? [...rechten, r] : rechten.filter((x) => x !== r))} /> <strong>{lang === 'nl' ? RECHT_NAMEN[r][1] : RECHT_NAMEN[r][0]}</strong> — {lang === 'nl' ? RECHT_NAMEN[r][3] : RECHT_NAMEN[r][2]}</label>)}
      </fieldset>
      <label className='tga-vinkje'><input type='checkbox' checked={mijn} onChange={(e) => setMijnTg(e.target.checked)} /> {tr(lang, 'Це мій номер і мій акаунт Telegram, і лише я маю до нього доступ.', 'Dit is mijn nummer en mijn Telegram-account, en alleen ik heb er toegang toe.')}</label>
      <p className='tga-waarom'>{tr(lang, 'Наступний крок попросить ваш ключ доступу (passkey) — так ніхто з доступом лише до цього браузера не зможе прив’язати свій Telegram.', 'De volgende stap vraagt uw passkey — zo kan niemand met alleen toegang tot deze browser zijn eigen Telegram koppelen.')}</p>
      <AftelKnop lang={lang} seconden={aftel} bezig={bezig} uit={!mijn || rechten.length === 0} onClick={() => void bevestigen()}>{tr(lang, 'Так, це мій Telegram — прив’язати', 'Ja, dit is mijn Telegram — koppelen')}</AftelKnop>
      <button type='button' className='tga-knop tga-knop-gevaar' onClick={annuleren}>{tr(lang, 'Ні, це не мій', 'Nee, dit is niet de mijne')}</button>
    </div>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
    {stap !== 3 && <button type='button' className='tga-knop' onClick={annuleren}>{tr(lang, 'Скасувати', 'Annuleren')}</button>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ gewijzigde gegevens
function WijzigingKaart({ ctx, lang, w, k, klaar }: { ctx: Ctx; lang: Lang; w: Wijziging; k?: Koppeling; klaar: () => void }) {
  const [aftel, setAftel] = useState<number | null>(null);
  const [begrepen, setBegrepen] = useState(false);
  const [uitkomst, setUitkomst] = useState('');
  const [fout, setFout] = useState('');
  const { bezig, doe } = useEenmalig();
  useEffect(() => { void tgPost<{ aftelSeconden: number }>(ctx, '/api/owner/telegram/wijziging/getoond', { id: w.id }).then((r) => setAftel(r.aftelSeconden)).catch(() => setAftel(10)); }, [ctx, w.id]);
  const ernstig = w.ernst !== 'gewoon';
  const antwoord = (a: 'ja' | 'nee') => doe(async () => {
    setFout('');
    try {
      const r = await tgPost<{ status: string; conflict: boolean; opnieuwKoppelen: boolean }>(ctx, '/api/owner/telegram/wijziging/antwoord', { id: w.id, antwoord: a, begrepen });
      setUitkomst(r.conflict ? tr(lang, '⚠️ Конфлікт: в одному місці підтвердили, в іншому — ні. Діє «Ні»: прив’язку вимкнено. Якщо це були ви — прив’яжіть знову.', '⚠️ Conflict: op de ene plek bevestigd, op de andere niet. «Nee» wint: de koppeling is uitgeschakeld. Was u het wel — koppel opnieuw.')
        : r.opnieuwKoppelen ? tr(lang, 'Потрібне повторне прив’язування (новий номер + ключ доступу).', 'Opnieuw koppelen is nodig (nieuw nummer + passkey).')
          : a === 'ja' ? tr(lang, 'Зміну підтверджено — Telegram знову працює.', 'Wijziging bevestigd — Telegram werkt weer.') : tr(lang, 'Прив’язку вимкнено, сесії через цей Telegram завершено.', 'Koppeling uitgeschakeld, sessies via deze Telegram beëindigd.'));
      window.setTimeout(klaar, 2500);
    } catch (e) { setFout(foutTekst(lang, e)); }
  });
  return <article className={`tga-kaart tga-wijziging tga-ernst-${w.ernst}`} role='alert'>
    <header><strong>{w.ernst === 'vervalsing' ? tr(lang, '⛔ Підозріла зміна', '⛔ Verdachte wijziging') : ernstig ? tr(lang, '⚠️ Важлива зміна даних Telegram', '⚠️ Belangrijke wijziging van Telegram-gegevens') : tr(lang, 'Змінилися дані Telegram', 'Telegram-gegevens gewijzigd')}</strong> {k && <span>{k.kleur} {k.naam}</span>}</header>
    <p className='tga-waarom'>{tr(lang, 'Навіщо питаємо: якщо хтось захопив ваш Telegram, він спершу змінює нікнейм, ім’я, фото чи номер. Доки ви не підтвердите, цей Telegram нічого не може робити у вашому акаунті.',
      'Waarom we het vragen: wie uw Telegram overneemt, wijzigt eerst de gebruikersnaam, naam, foto of het nummer. Tot u bevestigt, kan deze Telegram niets in uw account doen.')}</p>
    <table className='tga-verschil'><thead><tr><th>{tr(lang, 'Що', 'Wat')}</th><th>{tr(lang, 'Було', 'Was')}</th><th>{tr(lang, 'Стало', 'Nu')}</th></tr></thead>
      <tbody>{w.verschillen.map((v) => <tr key={v.veld}><td>{VELD_NAMEN[v.veld]?.[lang] ?? v.veld}</td><td className='tga-mono'>{v.oud || '—'}</td><td className='tga-mono tga-nieuw'>{v.nieuw || '—'}</td></tr>)}</tbody></table>
    {uitkomst ? <p className='tga-ok'>{uitkomst}</p> : <>
      {ernstig && <label className='tga-vinkje'><input type='checkbox' checked={begrepen} onChange={(e) => setBegrepen(e.target.checked)} /> {tr(lang, 'Я сам(а) зробив(ла) цю зміну і розумію: якщо це не так, підтвердження дасть доступ чужій людині.', 'Ik heb deze wijziging zelf gedaan en begrijp: is dat niet zo, dan geeft bevestigen een vreemde toegang.')}</label>}
      <div className='tga-rij'>
        <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void antwoord('nee')}>{tr(lang, 'Ні, це не я', 'Nee, dit ben ik niet')}</button>
        {w.ernst !== 'vervalsing' && aftel !== null && <AftelKnop lang={lang} seconden={aftel} bezig={bezig} uit={ernstig && !begrepen} onClick={() => void antwoord('ja')}>{tr(lang, 'Так, це я (ключ доступу)', 'Ja, dit ben ik (passkey)')}</AftelKnop>}
      </div>
      <p className='tga-klein'>{tr(lang, '«Ні» діє одразу й завжди переважає — навіть якщо в Telegram натиснули «Так».', '«Nee» werkt meteen en wint altijd — ook als in Telegram «Ja» werd getikt.')}</p>
    </>}
    {fout && <p className='tga-fout'>{fout}</p>}
  </article>;
}

// ------------------------------------------------------------------------------------------------ bevestigingstabel
function Matrix({ lang, rijen, beschikbaar, opslaan }: { ctx: Ctx; lang: Lang; rijen: MatrixRij[]; beschikbaar: string[]; opslaan: (body: Record<string, unknown>) => Promise<void> }) {
  const [keuzes, setKeuzes] = useState<Record<string, KeuzeId>>(() => Object.fromEntries(rijen.map((r) => [r.sleutel, r.keuze])));
  useEffect(() => setKeuzes(Object.fromEntries(rijen.map((r) => [r.sleutel, r.keuze]))), [rijen]);
  const { bezig, doe } = useEenmalig();
  const gewijzigd = rijen.some((r) => keuzes[r.sleutel] !== r.keuze);
  const haalbaar = (k: KeuzeId) => eisVan(k).some((alt) => alt.every((m) => beschikbaar.includes(m)));
  return <div className='tga-matrix'>
    <h3>{tr(lang, 'Чим підтверджувати дії', 'Waarmee handelingen bevestigen')}</h3>
    <p className='tga-waarom'>{tr(lang, 'Ви обираєте, чим підтверджувати кожну дію. Мінімум задає адміністратор; найчутливіші дії завжди потребують ключа доступу — навіть якщо хтось заволодіє вашим Telegram, цього не вистачить.',
      'U kiest waarmee elke handeling bevestigd wordt. Het minimum zet de beheerder; de gevoeligste handelingen vragen altijd een passkey — wie uw Telegram overneemt, komt daarmee niet verder.')}</p>
    <div className='tga-rij'>
      {(['standaard', 'veiligst', 'telegram-overal'] as const).map((v) => <button key={v} type='button' className='tga-knop' disabled={bezig} onClick={() => void doe(() => opslaan({ voorinstelling: v }))}>
        {v === 'standaard' ? tr(lang, 'Як радить адміністратор', 'Zoals de beheerder aanraadt') : v === 'veiligst' ? tr(lang, 'Найбезпечніше', 'Veiligst') : tr(lang, 'Telegram скрізь, де можна', 'Telegram waar het mag')}</button>)}
    </div>
    <table><thead><tr><th>{tr(lang, 'Дія', 'Handeling')}</th><th>{tr(lang, 'Чим підтверджувати', 'Bevestigen met')}</th></tr></thead><tbody>
      {rijen.map((r) => {
        const soort = { sleutel: r.sleutel, naam: r.naam, minimum: r.minimum, standaard: r.standaard, gevoelig: r.gevoelig, ingebouwd: true } as ActieSoort;
        return <tr key={r.sleutel}><td>{tekstIn(r.naam, lang)}{r.gevoelig && <small className='tga-klein'> · {tr(lang, 'завжди + ключ доступу', 'altijd + passkey')}</small>}</td>
          <td><select value={keuzeToegestaan(soort, keuzes[r.sleutel]) ? keuzes[r.sleutel] : soort.minimum} onChange={(e) => setKeuzes({ ...keuzes, [r.sleutel]: e.target.value as KeuzeId })} aria-label={tekstIn(r.naam, lang)}>
            {KEUZE_IDS.filter((k) => keuzeToegestaan(soort, k)).map((k) => <option key={k} value={k} disabled={!haalbaar(k)}>{tekstIn(KEUZE_NAMEN[k], lang)}{!haalbaar(k) ? tr(lang, ' (спершу налаштуйте)', ' (eerst instellen)') : ''}</option>)}
          </select></td></tr>;
      })}
    </tbody></table>
    <button type='button' className='tga-knop tga-knop-hoofd' disabled={!gewijzigd || bezig} onClick={() => void doe(() => opslaan({ keuzes }))}>{tr(lang, 'Зберегти таблицю', 'Tabel opslaan')}</button>
  </div>;
}

// ------------------------------------------------------------------------------------------------ geheime code
function GeheimeCode({ lang, code, telefoons, instellen, verwijderen, herstellen }: { lang: Lang; code: Mijn['code']; telefoons: string; instellen: (c: string, a: string) => Promise<void>; verwijderen: () => Promise<void>; herstellen: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [c1, setC1] = useState(''); const [c2, setC2] = useState(''); const [alarm, setAlarm] = useState('');
  const { bezig, doe } = useEenmalig();
  const zwak = c1 ? codeZwakte(c1, { min: code.minLengte, max: code.maxLengte, telefoon: telefoons }) : null;
  const alarmZwak = alarm ? codeZwakte(alarm, { min: code.minLengte, max: code.maxLengte, telefoon: telefoons }) : null;
  const sterkte = !c1 ? 0 : zwak ? 1 : c1.length >= code.minLengte + 4 && /\D/.test(c1) ? 3 : 2;
  const klaar = c1 && !zwak && c1 === c2 && (!alarm || (!alarmZwak && alarm !== c1));
  return <div className='tga-code'>
    <h3>{tr(lang, 'Таємний код', 'Geheime code')}</h3>
    <p className='tga-waarom'>{tr(lang, 'Додатковий захист: навіть з вашим Telegram ніхто не увійде без коду, який знаєте лише ви. Код вводиться лише на сайті — ніколи в чаті.', 'Extra bescherming: ook met uw Telegram komt niemand binnen zonder de code die alleen u kent. De code typt u alleen op de site — nooit in de chat.')}</p>
    <p>{code.ingesteld ? (code.uitgeschakeld ? tr(lang, `Вимкнено (${code.reden || 'безпека'}).`, `Uitgeschakeld (${code.reden || 'beveiliging'}).`) : code.pauzeTot && new Date(code.pauzeTot).getTime() > Date.now() ? tr(lang, `Призупинено до ${tijd(code.pauzeTot, lang)} після невдалих спроб.`, `Gepauzeerd tot ${tijd(code.pauzeTot, lang)} na mislukte pogingen.`) : tr(lang, `Налаштовано${code.alarm ? ' · є тривожний код' : ''}.`, `Ingesteld${code.alarm ? ' · alarmcode aanwezig' : ''}.`)) : tr(lang, 'Не налаштовано.', 'Niet ingesteld.')}</p>
    {code.ingesteld && code.uitgeschakeld && <button type='button' className='tga-knop' disabled={bezig} onClick={() => void doe(herstellen)}>{tr(lang, 'Відновити код (ключ доступу)', 'Code herstellen (passkey)')}</button>}
    {!open ? <div className='tga-rij'>
      <button type='button' className='tga-knop' onClick={() => setOpen(true)}>{code.ingesteld ? tr(lang, 'Змінити код', 'Code wijzigen') : tr(lang, 'Налаштувати код', 'Code instellen')}</button>
      {code.ingesteld && <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void doe(verwijderen)}>{tr(lang, 'Видалити код', 'Code verwijderen')}</button>}
    </div> : <form className='tga-blok' onSubmit={(e) => { e.preventDefault(); if (klaar) void doe(async () => { await instellen(c1, alarm); setOpen(false); setC1(''); setC2(''); setAlarm(''); }); }}>
      <label className='tga-veld'>{tr(lang, `Код (${code.minLengte}–${code.maxLengte} символів)`, `Code (${code.minLengte}–${code.maxLengte} tekens)`)}<input type='password' autoComplete='new-password' value={c1} maxLength={code.maxLengte} onChange={(e) => setC1(e.target.value)} /></label>
      <meter min={0} max={3} low={1.5} high={2.5} optimum={3} value={sterkte} aria-label={tr(lang, 'Надійність коду', 'Sterkte van de code')} />
      {zwak && <p className='tga-fout'>{codeRedenTekst(zwak, lang, code.minLengte, code.maxLengte)}</p>}
      <label className='tga-veld'>{tr(lang, 'Повторіть код', 'Herhaal de code')}<input type='password' autoComplete='new-password' value={c2} maxLength={code.maxLengte} onChange={(e) => setC2(e.target.value)} /></label>
      {c2 && c1 !== c2 && <p className='tga-fout'>{tr(lang, 'Коди не збігаються.', 'De codes zijn niet gelijk.')}</p>}
      <label className='tga-veld'>{tr(lang, 'Тривожний код (необов’язково)', 'Alarmcode (optioneel)')}<input type='password' autoComplete='off' value={alarm} maxLength={code.maxLengte} onChange={(e) => setAlarm(e.target.value)} /></label>
      <p className='tga-klein'>{tr(lang, 'Якщо вас змушують увійти — введіть тривожний код. Код буде «прийнято» без жодного попередження, але вхід не відкриється (виглядатиме як звичайна невдача), усі прив’язки Telegram буде вимкнено, а адміністратор отримає тривогу.', 'Wordt u gedwongen aan te melden — typ de alarmcode. De code wordt zonder waarschuwing «aanvaard», maar de aanmelding opent niet (het lijkt een gewone mislukking), alle Telegram-koppelingen worden uitgezet en de beheerder krijgt een alarm.')}</p>
      {alarmZwak && <p className='tga-fout'>{codeRedenTekst(alarmZwak, lang, code.minLengte, code.maxLengte)}</p>}
      {alarm && alarm === c1 && <p className='tga-fout'>{tr(lang, 'Тривожний код має відрізнятися від основного.', 'De alarmcode moet anders zijn dan de gewone code.')}</p>}
      <div className='tga-rij'><button type='submit' className='tga-knop tga-knop-hoofd' disabled={!klaar || bezig}>{tr(lang, 'Зберегти (ключ доступу)', 'Opslaan (passkey)')}</button><button type='button' className='tga-knop' onClick={() => setOpen(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button></div>
    </form>}
  </div>;
}
