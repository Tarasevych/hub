// Beheerpaneel → «Користувачі та доступ» → Telegram. Eén plek voor alles van de Telegram-aanmelding:
// stand en cijfers, de botsleutel (beschermd veld, alleen ingeven — nooit tonen), «Налаштувати бота» met elke stap eerlijk,
// waarschuwing als de sleutel bij een ANDERE bot hoort dan @MijnRuimte_Bot, instellingen met 10 min ongedaan maken,
// noodschakelaar, eigen handelingen, alle koppelingen (volledige identiteit) en het journaal.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { foutTekst, tgPost, type Ctx } from './api';
import { useBevestiging, useEenmalig } from './Bevestigen';
import TelegramLogo from './TelegramLogo';
import { ecosystemTabContext } from '../tab-context';
import { KEUZE_IDS, KEUZE_NAMEN, type KeuzeId } from '../../shared/telegram-aanmelden/beleid';
import { isBotGebruikersnaam, tekstIn, type TelegramInstellingen } from '../../shared/telegram-aanmelden/model';
import PlaatsingBeheer from './PlaatsingBeheer';
import './telegram.css';

import { bronNaam, koppelStandNaam, redenNaam, resultaatNaam, statusNaam } from './namen';
type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Actie = { sleutel: string; naam: readonly [string, string]; minimum: KeuzeId; standaard: KeuzeId; gevoelig: boolean; ingebouwd: boolean };
type Overzicht = {
  vlagAan: boolean; instellingen: TelegramInstellingen; ongedaanTot: string | null;
  sleutel: { aanwezig: boolean; bron: string; masker: string; wisselLoopt: boolean }; webhookGeheim: boolean; peper: boolean;
  status: { stand: string; soort: string; oorzaak: string; laatsteControle: string | null; reeks: Array<{ t: number; ok: boolean; ms: number }> };
  cijfers: Array<{ soort: string; ok: boolean; d1: number; d7: number; d30: number }>;
  koppelingen: { actief: number; gepauzeerd: number; geblokkeerd: number; accounts: number; telegrams: number }; openWijzigingen: number; codes: { n: number; geblokkeerd: number };
  acties: Actie[]; webhookUrl: string;
};
type Stap = { stap: string; ok: boolean; fout?: string; info?: string };
const tijd = (iso: string | null | number, lang: Lang) => (iso ? new Date(iso).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { timeZone: 'Europe/Brussels', dateStyle: 'short', timeStyle: 'short' }) : '—');
const STAP_NAMEN: Record<string, [string, string]> = {
  sleutel: ['Ключ бота', 'Botsleutel'], getMe: ['Перевірка ключа в Telegram', 'Sleutel controleren bij Telegram'], kluis: ['Збереження у сховище', 'Opslaan in de kluis'],
  webhook: ['Адреса зворотного виклику (з таємним заголовком)', 'Terugroepadres (met geheime kop)'], menuknop: ['Кнопка меню', 'Menuknop'],
};
const stapNaam = (s: string, lang: Lang) => STAP_NAMEN[s]?.[lang === 'nl' ? 1 : 0] ?? s.replace(/^opdrachten-/, lang === 'nl' ? 'Opdrachten · ' : 'Команди · ').replace(/^naam-/, lang === 'nl' ? 'Naam · ' : 'Назва · ').replace(/^omschrijving-/, lang === 'nl' ? 'Omschrijving · ' : 'Опис · ').replace(/^kort-/, lang === 'nl' ? 'Korte omschrijving · ' : 'Короткий опис · ');

export default function TelegramBeheer({ lang }: { lang: Lang }) {
  const ctx = useMemo<Ctx>(() => ({ service: 'admin', tabContext: ecosystemTabContext(), sourceOrigin: location.origin }), []);
  const [o, setO] = useState<Overzicht | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const { uitvoeren, venster } = useBevestiging(ctx, lang);
  const laden = useCallback(async () => { try { setO(await tgPost<Overzicht>(ctx, '/api/owner/telegram/beheer/overzicht')); } catch (e) { setFout(foutTekst(lang, e)); } }, [ctx, lang]);
  useEffect(() => { void laden(); }, [laden]);
  const doeMet = async (fn: () => Promise<unknown>, ok: string) => {
    setMelding(''); setFout('');
    try { await uitvoeren(fn); setMelding(ok); await laden(); } catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  };
  if (!o) return fout ? <section className='admin-section tga-sectie'><p className='tga-fout'>{fout}</p></section> : null;
  const tel = (soort: string, ok: boolean, k: 'd1' | 'd7' | 'd30') => o.cijfers.find((c) => c.soort === soort && c.ok === ok)?.[k] ?? 0;
  return <section className='admin-section tga-sectie tga-beheer' data-telegram-beheer>
    {venster}
    <header className='tga-sectie-kop'><TelegramLogo maat={36} /><div><h2>{tr(lang, 'Вхід через Telegram', 'Aanmelden met Telegram')}</h2>
      <p>{tr(lang, `Бот @${o.instellingen.botGebruikersnaam}. Прапорець telegram-aanmelden-v1: ${o.vlagAan ? 'увімкнено' : 'вимкнено'} (керується в меню «Перемикачі функцій»).`, `Bot @${o.instellingen.botGebruikersnaam}. Vlag telegram-aanmelden-v1: ${o.vlagAan ? 'aan' : 'uit'} (beheer via het menu «Functieschakelaars»).`)}</p></div>
      <span className={`tga-stand tga-stand-${o.status.stand}`}>{statusNaam(lang, o.status.stand)}</span></header>
    {melding && <p className='tga-ok' role='status'>{melding}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}

    <Noodschakelaar lang={lang} aan={o.instellingen.aan} uit={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/beheer/nood-uit'), tr(lang, 'Вхід через Telegram вимкнено для всіх.', 'Aanmelden met Telegram staat voor iedereen uit.'))}
      weerAan={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/beheer/nood-aan'), tr(lang, 'Увімкнено знову.', 'Weer aangezet.'))} />

    <div className='tga-raster'>
      <div className='tga-tegel'><strong>{o.koppelingen.actief}</strong><span>{tr(lang, 'активних прив’язок', 'actieve koppelingen')}</span></div>
      <div className='tga-tegel'><strong>{o.koppelingen.accounts}</strong><span>{tr(lang, 'облікових записів', 'accounts')} · {o.koppelingen.telegrams} Telegram</span></div>
      <div className='tga-tegel'><strong>{o.koppelingen.gepauzeerd + o.koppelingen.geblokkeerd}</strong><span>{tr(lang, 'призупинено / заблоковано', 'gepauzeerd / geblokkeerd')}</span></div>
      <div className='tga-tegel'><strong>{o.openWijzigingen}</strong><span>{tr(lang, 'відкритих змін', 'open wijzigingen')}</span></div>
      <div className='tga-tegel'><strong>{tel('aanmelden', true, 'd1')} / {tel('aanmelden', false, 'd1')}</strong><span>{tr(lang, 'входів сьогодні (успіх / відмова)', 'aanmeldingen vandaag (gelukt / geweigerd)')}</span></div>
      <div className='tga-tegel'><strong>{tel('aanmelden', true, 'd30')}</strong><span>{tr(lang, 'входів за 30 днів', 'aanmeldingen 30 dagen')}</span></div>
      <div className='tga-tegel'><strong>{o.codes.n}</strong><span>{tr(lang, 'таємних кодів', 'geheime codes')} · {o.codes.geblokkeerd} {tr(lang, 'вимк.', 'uit')}</span></div>
    </div>
    <div className='tga-reeks' aria-label={tr(lang, 'Перевірки за 24 год', 'Controles 24 uur')}>{o.status.reeks.slice(-96).map((r) => <span key={r.t} className={r.ok ? 'ok' : 'nee'} title={`${tijd(r.t, lang)} · ${r.ms} ms`} />)}</div>
    <p className='tga-klein'>{tr(lang, 'Остання перевірка', 'Laatste controle')}: {tijd(o.status.laatsteControle, lang)} {o.status.oorzaak && `· ${o.status.oorzaak}`}</p>

    <BotInstellen ctx={ctx} lang={lang} o={o} uitvoeren={uitvoeren} klaar={laden} />
    <Instellingen lang={lang} o={o} opslaan={(inst) => doeMet(() => tgPost(ctx, '/api/owner/telegram/beheer/instellingen', { instellingen: inst }), tr(lang, 'Збережено. Протягом 10 хвилин можна скасувати.', 'Opgeslagen. U kunt 10 minuten ongedaan maken.'))}
      ongedaan={() => doeMet(() => tgPost(ctx, '/api/owner/telegram/beheer/ongedaan'), tr(lang, 'Попередні налаштування відновлено.', 'Vorige instellingen hersteld.'))} />
    <PlaatsingBeheer ctx={ctx} lang={lang} uitvoeren={uitvoeren} />
    <Acties lang={lang} acties={o.acties} opslaan={(body) => doeMet(() => tgPost(ctx, '/api/owner/telegram/beheer/actie', body), tr(lang, 'Дії оновлено.', 'Handelingen bijgewerkt.'))} />
    <Koppelingen ctx={ctx} lang={lang} uit={(id) => doeMet(() => tgPost(ctx, '/api/owner/telegram/beheer/koppeling-uit', { koppelingId: id }), tr(lang, 'Прив’язку вимкнено, власника сповіщено.', 'Koppeling uitgezet, eigenaar op de hoogte gebracht.'))} />
    <Journaal ctx={ctx} lang={lang} />
  </section>;
}

function Noodschakelaar({ lang, aan, uit, weerAan }: { lang: Lang; aan: boolean; uit: () => Promise<void>; weerAan: () => Promise<void> }) {
  const { bezig, doe } = useEenmalig();
  return <div className={`tga-nood ${aan ? '' : 'tga-nood-uit'}`}>
    <strong>{aan ? tr(lang, 'Вхід через Telegram працює', 'Aanmelden met Telegram werkt') : tr(lang, '⛔ Вхід через Telegram вимкнено для всіх', '⛔ Aanmelden met Telegram staat voor iedereen uit')}</strong>
    <p className='tga-klein'>{aan ? tr(lang, 'Аварійний вимикач: одразу зупиняє вхід і підтвердження через Telegram для всіх. Вимкнути можна завжди, без ключа доступу.', 'Noodschakelaar: stopt meteen aanmelden en bevestigen met Telegram voor iedereen. Uitzetten kan altijd, zonder toegangssleutel.')
      : tr(lang, 'Користувачі входять іншими способами. Увімкнення потребує ключа доступу.', 'Gebruikers melden zich op een andere manier aan. Weer aanzetten vraagt een toegangssleutel.')}</p>
    {aan ? <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void doe(uit)}>{tr(lang, 'Вимкнути для всіх зараз', 'Nu voor iedereen uitzetten')}</button>
      : <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig} onClick={() => void doe(weerAan)}>{tr(lang, 'Увімкнути знову', 'Weer aanzetten')}</button>}
  </div>;
}

function BotInstellen({ ctx, lang, o, uitvoeren, klaar }: { ctx: Ctx; lang: Lang; o: Overzicht; uitvoeren: <T>(fn: () => Promise<T>) => Promise<T>; klaar: () => Promise<void> }) {
  const [sleutel, setSleutel] = useState('');
  const [stappen, setStappen] = useState<Stap[]>([]);
  const [andere, setAndere] = useState('');
  const [fout, setFout] = useState('');
  const [webhook, setWebhook] = useState<{ url: string; wachtend: number; laatsteFout: string; laatsteFoutOp: string | null; juist: boolean } | null>(null);
  const { bezig, doe } = useEenmalig();
  const vorm = !sleutel || /^\d{5,12}:[A-Za-z0-9_-]{30,50}$/.test(sleutel.trim());
  const verwacht = o.instellingen.botGebruikersnaam;
  const instellen = (toch = false) => doe(async () => {
    setFout(''); setStappen([]);
    try {
      const r = await uitvoeren(() => tgPost<{ stappen: Stap[]; waarschuwing?: string; bot?: { username: string } }>(ctx, '/api/owner/telegram/beheer/bot', { sleutel: sleutel.trim() || undefined, toch }));
      setStappen(r.stappen);
      if (r.waarschuwing === 'ANDERE_BOT') setAndere(r.bot?.username || r.stappen.find((s) => s.fout === 'ANDERE_BOT')?.info || '?');
      else setAndere('');
      if (r.stappen.some((s) => s.stap === 'kluis' && s.ok)) setSleutel('');
      await klaar();
    } catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  });
  const proef = () => doe(async () => { try { const r = await tgPost<{ verstuurd: number }>(ctx, '/api/owner/telegram/beheer/proef'); setFout(''); setStappen([{ stap: 'proef', ok: r.verstuurd > 0, info: String(r.verstuurd), fout: r.verstuurd ? undefined : 'GEEN_EIGEN_KOPPELING' }]); } catch (e) { setFout(foutTekst(lang, e)); } });
  const controle = () => doe(async () => { try { await tgPost(ctx, '/api/owner/telegram/beheer/controle'); setWebhook(await tgPost(ctx, '/api/owner/telegram/beheer/webhook')); await klaar(); } catch (e) { setFout(foutTekst(lang, e)); } });
  return <div className='tga-blok tga-bot'>
    <h3>{tr(lang, 'Бот і ключ', 'Bot en sleutel')}</h3>
    <dl className='tga-dl'>
      <dt>{tr(lang, 'Очікуваний бот', 'Verwachte bot')}</dt><dd>@{verwacht}</dd>
      <dt>{tr(lang, 'Ключ', 'Sleutel')}</dt><dd>{o.sleutel.aanwezig ? `${o.sleutel.masker} · ${bronNaam(lang, o.sleutel.bron)}` : tr(lang, 'ще не введено', 'nog niet ingegeven')}{o.sleutel.wisselLoopt && ` · ${tr(lang, 'заміна триває', 'wissel loopt')}`}</dd>
      <dt>{tr(lang, 'Таємний заголовок адреси зворотного виклику', 'Geheime kop van het terugroepadres')}</dt><dd>{o.webhookGeheim ? '✓' : '—'}</dd>
      <dt>{tr(lang, 'Сіль кодів', 'Codepeper')}</dt><dd>{o.peper ? '✓' : '—'}</dd>
      <dt>{tr(lang, 'Адреса зворотного виклику', 'Terugroepadres')}</dt><dd className='tga-mono'>{o.webhookUrl}</dd>
    </dl>
    <label className='tga-veld'>{tr(lang, `Ключ бота від @BotFather (для @${verwacht})`, `Botsleutel van @BotFather (voor @${verwacht})`)}
      <input type='password' autoComplete='off' spellCheck={false} value={sleutel} onChange={(e) => setSleutel(e.target.value)} placeholder={o.sleutel.aanwezig ? tr(lang, 'залиште порожнім, щоб лише оновити налаштування', 'leeg laten om alleen de instellingen bij te werken') : '1234567890:AA…'} />
    </label>
    <p className='tga-klein'>{tr(lang, 'Ключ одразу йде в захищене сховище і більше ніколи не показується — ні тут, ні в журналі. Перед збереженням ми перевіряємо запитом до Telegram, що ключ належить саме цьому боту.', 'De sleutel gaat meteen de beveiligde kluis in en wordt nooit meer getoond — niet hier, niet in het journaal. Vóór opslaan controleren we bij Telegram dat de sleutel bij precies deze bot hoort.')}</p>
    {!vorm && <p className='tga-fout'>{tr(lang, 'Це не схоже на ключ бота (формат 123456789:ABC…).', 'Dit lijkt geen botsleutel (vorm 123456789:ABC…).')}</p>}
    {andere && <div className='tga-let' role='alert'>
      <p><strong>{tr(lang, `⚠️ Цей ключ належить боту @${andere.replace(/^@/, '')}, а не @${verwacht}.`, `⚠️ Deze sleutel hoort bij bot @${andere.replace(/^@/, '')}, niet bij @${verwacht}.`)}</strong></p>
      <p>{tr(lang, 'Користувачі бачитимуть інше ім’я бота, а старі посилання t.me перестануть працювати. Перевірте, чи скопіювали ключ правильного бота.', 'Gebruikers zien dan een andere botnaam en oude t.me-links werken niet meer. Controleer of u de sleutel van de juiste bot kopieerde.')}</p>
      <div className='tga-rij'><button type='button' className='tga-knop' onClick={() => setAndere('')}>{tr(lang, 'Ні, перевірю ключ', 'Nee, ik controleer de sleutel')}</button>
        {sleutel && <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void instellen(true)}>{tr(lang, 'Все одно використати цього бота', 'Toch deze bot gebruiken')}</button>}</div>
    </div>}
    <div className='tga-rij'>
      <button type='button' className='tga-aanmeld-knop' disabled={bezig || !vorm || (!sleutel && !o.sleutel.aanwezig)} onClick={() => void instellen(false)}><TelegramLogo maat={18} /><span>{tr(lang, 'Налаштувати бота', 'Bot instellen')}</span>{bezig && <span className='tga-draai' aria-hidden='true' />}</button>
      <button type='button' className='tga-knop' disabled={bezig || !o.sleutel.aanwezig} onClick={() => void controle()}>{tr(lang, 'Перевірити зараз', 'Nu controleren')}</button>
      <button type='button' className='tga-knop' disabled={bezig || !o.sleutel.aanwezig} onClick={() => void proef()}>{tr(lang, 'Пробне повідомлення мені', 'Proefbericht naar mij')}</button>
      {o.sleutel.wisselLoopt && <button type='button' className='tga-knop' disabled={bezig} onClick={() => void doe(async () => { await uitvoeren(() => tgPost(ctx, '/api/owner/telegram/beheer/sleutel-annuleren')); await klaar(); })}>{tr(lang, 'Скасувати заміну ключа', 'Sleutelwissel annuleren')}</button>}
    </div>
    {stappen.length > 0 && <ul className='tga-stap-lijst'>{stappen.map((s) => <li key={s.stap} className={s.ok ? 'ok' : 'nee'}>{s.ok ? '✓' : '✗'} {s.stap === 'proef' ? tr(lang, 'Пробне повідомлення', 'Proefbericht') : stapNaam(s.stap, lang)}{s.info ? ` · ${s.info}` : ''}{s.fout && s.fout !== 'ANDERE_BOT' ? ` · ${s.fout}` : ''}</li>)}</ul>}
    {webhook && <p className={webhook.juist ? 'tga-ok' : 'tga-fout'}>{webhook.juist ? tr(lang, `Адреса зворотного виклику правильна, у черзі ${webhook.wachtend}.`, `Terugroepadres klopt, ${webhook.wachtend} in de wachtrij.`) : tr(lang, `Адреса зворотного виклику вказує на «${webhook.url || '—'}». Натисніть «Налаштувати бота».`, `Terugroepadres wijst naar «${webhook.url || '—'}». Tik «Bot instellen».`)}{webhook.laatsteFout && ` · ${webhook.laatsteFout} (${tijd(webhook.laatsteFoutOp, lang)})`}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
  </div>;
}

function Instellingen({ lang, o, opslaan, ongedaan }: { lang: Lang; o: Overzicht; opslaan: (i: TelegramInstellingen) => Promise<void>; ongedaan: () => Promise<void> }) {
  const [i, setI] = useState<TelegramInstellingen>(o.instellingen);
  useEffect(() => setI(o.instellingen), [o.instellingen]);
  const { bezig, doe } = useEenmalig();
  const getal = (label: string, waarde: number, zet: (n: number) => void, min: number, max: number, uitleg: string) => <label className='tga-veld'>{label}<input type='number' min={min} max={max} value={waarde} onChange={(e) => zet(Math.max(min, Math.min(max, Number(e.target.value) || min)))} /><small className='tga-klein'>{uitleg}</small></label>;
  const tekst = (veld: 'naam' | 'kort' | 'omschrijving', taal: string, max: number) => <input value={i.bot[veld][taal] || ''} maxLength={max} onChange={(e) => setI({ ...i, bot: { ...i.bot, [veld]: { ...i.bot[veld], [taal]: e.target.value } } })} />;
  const naamOk = isBotGebruikersnaam(i.botGebruikersnaam);
  return <form className='tga-blok' onSubmit={(e) => { e.preventDefault(); if (naamOk) void doe(() => opslaan({ ...i, botGebruikersnaam: i.botGebruikersnaam.replace(/^@/, '') })); }}>
    <h3>{tr(lang, 'Налаштування', 'Instellingen')}</h3>
    <label className='tga-veld'>{tr(lang, 'Ім’я користувача бота', 'Gebruikersnaam van de bot')}<input value={i.botGebruikersnaam} maxLength={33} onChange={(e) => setI({ ...i, botGebruikersnaam: e.target.value.replace(/^@/, '') })} />
      <small className='tga-klein'>{naamOk ? tr(lang, 'Використовується в посиланнях t.me, офіційному вікні входу Telegram та перевірці ключа.', 'Gebruikt in t.me-verwijzingen, het officiële aanmeldvenster van Telegram en de sleutelcontrole.') : tr(lang, 'Має закінчуватися на «bot», 5–32 символи.', 'Moet op «bot» eindigen, 5–32 tekens.')}</small></label>
    <label className='tga-veld'>{tr(lang, 'Кому дозволено', 'Wie mag')}<select value={i.wieMag} onChange={(e) => setI({ ...i, wieMag: e.target.value as TelegramInstellingen['wieMag'] })}>
      <option value='eigenaar'>{tr(lang, 'Лише власник і адміністратори', 'Alleen eigenaar en beheerders')}</option><option value='eigenaar-en-gasten'>{tr(lang, 'Власник, адміністратори й гості', 'Eigenaar, beheerders en gasten')}</option><option value='niemand'>{tr(lang, 'Нікому (нові прив’язки закрито)', 'Niemand (nieuwe koppelingen dicht)')}</option></select></label>
    <label className='tga-vinkje'><input type='checkbox' checked={i.afbeeldingen} onChange={(e) => setI({ ...i, afbeeldingen: e.target.checked })} /> {tr(lang, 'Картки-зображення в повідомленнях', 'Kaarten als afbeelding in berichten')}</label>
    <label className='tga-vinkje'><input type='checkbox' checked={i.animatie} onChange={(e) => setI({ ...i, animatie: e.target.checked })} /> {tr(lang, 'Коротка анімація після успішного входу', 'Korte animatie na een gelukte aanmelding')}</label>
    <div className='tga-raster'>
      {getal(tr(lang, 'Прив’язок на обліковий запис', 'Koppelingen per account'), i.koppelLimiet, (n) => setI({ ...i, koppelLimiet: n }), 1, 5, '')}
      {getal(tr(lang, 'Відлік «Так, це я», с', 'Aftellen «Ja, dit ben ik», s'), i.aftelSeconden, (n) => setI({ ...i, aftelSeconden: n }), 3, 30, tr(lang, 'Звичайні зміни', 'Gewone wijzigingen'))}
      {getal(tr(lang, 'Відлік для важливих змін, с', 'Aftellen ernstige wijzigingen, s'), i.aftelSecondenErnstig, (n) => setI({ ...i, aftelSecondenErnstig: n }), 5, 60, '')}
      {getal(tr(lang, 'Без відповіді → вимкнути, год', 'Geen antwoord → uit, uur'), i.onbeantwoordUren, (n) => setI({ ...i, onbeantwoordUren: n }), 1, 168, '')}
      {getal(tr(lang, 'Життя кнопки, с', 'Levensduur knop, s'), i.knopTokenSeconden, (n) => setI({ ...i, knopTokenSeconden: n }), 120, 300, '')}
      {getal(tr(lang, 'Спроб за хвилину', 'Pogingen per minuut'), i.pogingenPerMinuut, (n) => setI({ ...i, pogingenPerMinuut: n }), 3, 60, '')}
      {getal(tr(lang, 'Код: мін. довжина', 'Code: min. lengte'), i.code.minLengte, (n) => setI({ ...i, code: { ...i.code, minLengte: n } }), 4, 32, '')}
      {getal(tr(lang, 'Код: пауза після помилок', 'Code: pauze na fouten'), i.code.pauzeNa, (n) => setI({ ...i, code: { ...i.code, pauzeNa: n } }), 2, 20, '')}
      {getal(tr(lang, 'Код: вимкнути після помилок', 'Code: uit na fouten'), i.code.uitNa, (n) => setI({ ...i, code: { ...i.code, uitNa: n } }), 3, 50, '')}
    </div>
    <p className='tga-klein'>{tr(lang, 'Поділитися власним номером телефону — завжди обов’язково (не вимикається).', 'Het eigen telefoonnummer delen is altijd verplicht (niet uit te zetten).')}</p>
    <h4>{tr(lang, 'Назви й описи бота', 'Namen en omschrijvingen van de bot')}</h4>
    <table className='tga-talen'><thead><tr><th /><th>Українська</th><th>Nederlands</th></tr></thead><tbody>
      <tr><td>{tr(lang, 'Назва', 'Naam')}</td><td>{tekst('naam', 'uk', 64)}</td><td>{tekst('naam', 'nl', 64)}</td></tr>
      <tr><td>{tr(lang, 'Короткий опис', 'Korte omschrijving')}</td><td>{tekst('kort', 'uk', 120)}</td><td>{tekst('kort', 'nl', 120)}</td></tr>
      <tr><td>{tr(lang, 'Опис', 'Omschrijving')}</td><td>{tekst('omschrijving', 'uk', 512)}</td><td>{tekst('omschrijving', 'nl', 512)}</td></tr>
    </tbody></table>
    <p className='tga-klein'>{tr(lang, 'Після збереження натисніть «Налаштувати бота», щоб надіслати назви й описи в Telegram.', 'Tik na opslaan op «Bot instellen» om namen en omschrijvingen naar Telegram te sturen.')}</p>
    <div className='tga-rij'><button type='submit' className='tga-knop tga-knop-hoofd' disabled={bezig || !naamOk}>{tr(lang, 'Зберегти', 'Opslaan')}</button>
      {o.ongedaanTot && <button type='button' className='tga-knop' disabled={bezig} onClick={() => void doe(ongedaan)}>{tr(lang, `Скасувати останню зміну (до ${tijd(o.ongedaanTot, lang)})`, `Laatste wijziging ongedaan maken (tot ${tijd(o.ongedaanTot, lang)})`)}</button>}</div>
  </form>;
}

function Acties({ lang, acties, opslaan }: { lang: Lang; acties: Actie[]; opslaan: (b: Record<string, unknown>) => Promise<void> }) {
  const [n, setN] = useState({ sleutel: '', naam_uk: '', naam_nl: '', minimum: 'telegram' as KeuzeId, standaard: 'telegram' as KeuzeId, gevoelig: false });
  const { bezig, doe } = useEenmalig();
  return <div className='tga-blok'>
    <h3>{tr(lang, 'Дії та мінімальний захист', 'Handelingen en minimale bescherming')}</h3>
    <table><thead><tr><th>{tr(lang, 'Дія', 'Handeling')}</th><th>{tr(lang, 'Мінімум', 'Minimum')}</th><th>{tr(lang, 'Типово', 'Standaard')}</th><th /></tr></thead><tbody>
      {acties.map((a) => <tr key={a.sleutel}><td>{tekstIn(a.naam, lang)} <small className='tga-mono'>{a.sleutel}</small>{a.gevoelig && ' 🔑'}</td><td>{tekstIn(KEUZE_NAMEN[a.minimum], lang)}</td><td>{tekstIn(KEUZE_NAMEN[a.standaard], lang)}</td>
        <td>{!a.ingebouwd && <button type='button' className='tga-knop' disabled={bezig} onClick={() => void doe(() => opslaan({ sleutel: a.sleutel, verwijderen: true }))}>{tr(lang, 'Видалити', 'Verwijderen')}</button>}</td></tr>)}
    </tbody></table>
    <form className='tga-rij' onSubmit={(e) => { e.preventDefault(); void doe(() => opslaan(n)); }}>
      <input placeholder='sleutel' value={n.sleutel} onChange={(e) => setN({ ...n, sleutel: e.target.value.toLowerCase() })} pattern='[a-z][a-z0-9-]{1,40}' required aria-label='sleutel' />
      <input placeholder='Назва' value={n.naam_uk} onChange={(e) => setN({ ...n, naam_uk: e.target.value })} required aria-label='uk' />
      <input placeholder='Naam' value={n.naam_nl} onChange={(e) => setN({ ...n, naam_nl: e.target.value })} required aria-label='nl' />
      <select value={n.minimum} onChange={(e) => setN({ ...n, minimum: e.target.value as KeuzeId })} aria-label={tr(lang, 'Мінімум', 'Minimum')}>{KEUZE_IDS.map((k) => <option key={k} value={k}>{tekstIn(KEUZE_NAMEN[k], lang)}</option>)}</select>
      <select value={n.standaard} onChange={(e) => setN({ ...n, standaard: e.target.value as KeuzeId })} aria-label={tr(lang, 'Типово', 'Standaard')}>{KEUZE_IDS.map((k) => <option key={k} value={k}>{tekstIn(KEUZE_NAMEN[k], lang)}</option>)}</select>
      <label className='tga-vinkje'><input type='checkbox' checked={n.gevoelig} onChange={(e) => setN({ ...n, gevoelig: e.target.checked })} /> {tr(lang, 'чутлива (завжди ключ доступу)', 'gevoelig (altijd toegangssleutel)')}</label>
      <button type='submit' className='tga-knop' disabled={bezig}>{tr(lang, 'Додати', 'Toevoegen')}</button>
    </form>
  </div>;
}

type BeheerKoppeling = { id: string; email: string; accountNaam: string; naam: string; stand: string; reden: string; telegramId: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string; aangemaaktOp: string; laatstGebruiktOp: string | null };
function Koppelingen({ ctx, lang, uit }: { ctx: Ctx; lang: Lang; uit: (id: string) => Promise<void> }) {
  const [zoek, setZoek] = useState('');
  const [items, setItems] = useState<BeheerKoppeling[]>([]);
  const { bezig, doe } = useEenmalig();
  const laden = useCallback(() => tgPost<{ items: BeheerKoppeling[] }>(ctx, '/api/owner/telegram/beheer/koppelingen', { zoek }).then((r) => setItems(r.items)).catch(() => undefined), [ctx, zoek]);
  useEffect(() => { void laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className='tga-blok'>
    <h3>{tr(lang, 'Усі прив’язки', 'Alle koppelingen')}</h3>
    <form className='tga-rij' onSubmit={(e) => { e.preventDefault(); void laden(); }}><input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr(lang, 'Пошук: пошта, номер, @нік', 'Zoeken: e-mail, nummer, @naam')} /><button type='submit' className='tga-knop'>{tr(lang, 'Шукати', 'Zoeken')}</button></form>
    <table><thead><tr><th>{tr(lang, 'Обліковий запис', 'Account')}</th><th>Telegram</th><th>{tr(lang, 'Стан', 'Stand')}</th><th /></tr></thead><tbody>
      {items.map((k) => <tr key={k.id}><td>{k.email}<br /><small>{k.accountNaam} · {k.naam}</small></td>
        <td className='tga-mono'>+{String(k.telefoon).replace(/^\+/, '')}<br />{k.gebruikersnaam ? `@${k.gebruikersnaam}` : '—'} · {[k.voornaam, k.achternaam].filter(Boolean).join(' ')}<br />ID {k.telegramId}</td>
        <td>{koppelStandNaam(lang, k.stand)}{k.reden && <><br /><small>{redenNaam(lang, k.reden)}</small></>}<br /><small>{tijd(k.laatstGebruiktOp, lang)}</small></td>
        <td>{k.stand !== 'uitgeschakeld' && <button type='button' className='tga-knop tga-knop-gevaar' disabled={bezig} onClick={() => void doe(async () => { await uit(k.id); await laden(); })}>{tr(lang, 'Вимкнути', 'Uitzetten')}</button>}</td></tr>)}
      {items.length === 0 && <tr><td colSpan={4} className='tga-klein'>{tr(lang, 'Немає прив’язок.', 'Geen koppelingen.')}</td></tr>}
    </tbody></table>
  </div>;
}

function Journaal({ ctx, lang }: { ctx: Ctx; lang: Lang }) {
  const [items, setItems] = useState<Array<{ id: string; actie: string; resultaat: string; op: number; actorId?: string; details?: Record<string, unknown> }>>([]);
  useEffect(() => { void tgPost<{ items: typeof items }>(ctx, '/api/owner/telegram/beheer/journaal', { limiet: 100 }).then((r) => setItems(r.items)).catch(() => undefined); }, [ctx]);
  return <details className='tga-blok'><summary><h3>{tr(lang, 'Журнал', 'Journaal')} ({items.length})</h3></summary>
    <table><tbody>{items.map((j) => <tr key={j.id}><td>{tijd(j.op, lang)}</td><td className='tga-mono'>{j.actie}</td><td>{resultaatNaam(lang, j.resultaat)}</td><td className='tga-mono tga-klein'>{j.details ? JSON.stringify(j.details).slice(0, 160) : ''}</td></tr>)}</tbody></table>
  </details>;
}
