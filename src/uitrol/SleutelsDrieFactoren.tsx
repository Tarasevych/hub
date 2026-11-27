// UPD-011: Персональні відкличні ключі адміністраторів і 3-чинникова довіра оновлень
// (GitHub ↔ MCP-з’єднувач ШІ ↔ Обліковий запис і права на сайті) + одноразовий обмін ключами.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Link2, RefreshCw, RotateCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { tr, type Lang, type Overzicht } from './types';
import type { DrieFactorenOordeel, SleutelRol, SleutelToegang, UitwisselPakket } from '../../shared/uitrol-drie-factoren';

type SleutelItem = {
  id: string;
  userId: string;
  label: string;
  rol: SleutelRol;
  prefix: string;
  githubKoppeling: string;
  githubGeverifieerdOp: string;
  mcpKoppelingId: string;
  mcpAgentSlug: string;
  mcpGeverifieerdOp: string;
  siteGrantId: string;
  regelsVersie: string;
  toegangNiveau: SleutelToegang;
  gesynchroniseerdOp: string;
  ingetrokkenOp: string;
  ingetrokkenReden: string;
  status: 'actief' | 'ingetrokken';
  drieFactoren: DrieFactorenOordeel;
  toegangOordeel: { toegestaan: boolean; code: string; redenUk: string; redenNl: string };
};

type EenmaligResultaat = {
  sleutel: SleutelItem;
  eenmaligeSleutel: string;
  uitwisselCode: string;
  uitwisselPakket: UitwisselPakket;
};

type Props = {
  lang: Lang;
  context: Record<string, unknown>;
  data: Overzicht;
};

export default function SleutelsDrieFactoren({ lang, context, data }: Props) {
  const [sleutels, setSleutels] = useState<SleutelItem[]>([]);
  const [regelsVersie, setRegelsVersie] = useState('');
  const [laadt, setLaadt] = useState(false);
  const [bezig, setBezig] = useState('');
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [eenmalig, setEenmalig] = useState<EenmaligResultaat | null>(null);
  const [gekopieerd, setGekopieerd] = useState('');

  // Форма створення нового ключа
  const [label, setLabel] = useState('');
  const [userId, setUserId] = useState(data.ik?.id || '');
  const [rol, setRol] = useState<SleutelRol>('beheerder');
  const [toegangNiveau, setToegangNiveau] = useState<SleutelToegang>('uploaden');
  const [githubKoppeling, setGithubKoppeling] = useState('Tarasevych/hub');
  const [mcpAgentSlug, setMcpAgentSlug] = useState('gemini');
  const [githubBevestigd, setGithubBevestigd] = useState(true);
  const [mcpBevestigd, setMcpBevestigd] = useState(true);

  // Форма відкликання
  const [intrekId, setIntrekId] = useState('');
  const [intrekReden, setIntrekReden] = useState('');

  const laden = useCallback(async () => {
    setLaadt(true);
    try {
      const r = (await api.post('/api/owner/uitrol/sleutels', context)).data as {
        sleutels: SleutelItem[];
        regelsLock?: { versie: string };
      };
      setSleutels(r.sleutels || []);
      setRegelsVersie(r.regelsLock?.versie || '');
      setFout('');
    } catch {
      setFout(tr(lang, 'Не вдалося завантажити персональні ключі довіри.', 'Persoonlijke vertrouwenssleutels konden niet worden geladen.'));
    } finally {
      setLaadt(false);
    }
  }, [context, lang]);

  useEffect(() => { void laden(); }, [laden]);

  const kopieer = (sleutelNaam: string, waarde: string) => {
    void navigator.clipboard?.writeText(waarde).then(() => {
      setGekopieerd(sleutelNaam);
      window.setTimeout(() => setGekopieerd(''), 2500);
    }).catch(() => undefined);
  };

  const aanmaken = async () => {
    if (label.trim().length < 3) {
      setFout(tr(lang, 'Вкажіть зрозумілу назву ключа (від 3 символів).', 'Geef een duidelijke naam voor de sleutel (minstens 3 tekens).'));
      return;
    }
    setBezig('nieuw'); setFout(''); setMelding('');
    try {
      const r = (await api.post('/api/owner/uitrol/sleutels/aanmaken', {
        ...context,
        userId: userId || data.ik?.id || '',
        label: label.trim(),
        rol,
        toegangNiveau,
        githubKoppeling: githubKoppeling.trim(),
        mcpAgentSlug: mcpAgentSlug.trim(),
        githubBevestigd,
        mcpBevestigd,
      })).data as EenmaligResultaat;
      setEenmalig(r);
      setLabel('');
      setMelding(tr(lang, 'Персональний ключ створено. Збережіть його зараз — повторно він не показується.', 'Persoonlijke sleutel aangemaakt. Bewaar hem nu — hij wordt niet opnieuw getoond.'));
      await laden();
    } catch {
      setFout(tr(lang, 'Не вдалося створити ключ. Перевірте підтвердження доступу.', 'Sleutel aanmaken mislukt. Controleer de toegangsbevestiging.'));
    } finally {
      setBezig('');
    }
  };

  const synchroniseren = async (s: SleutelItem) => {
    setBezig(`sync-${s.id}`); setFout(''); setMelding('');
    try {
      await api.post('/api/owner/uitrol/sleutels/synchroniseren', {
        ...context,
        id: s.id,
        githubKoppeling: s.githubKoppeling || 'Tarasevych/hub',
        mcpAgentSlug: s.mcpAgentSlug || 'gemini',
        githubBevestigd: true,
        mcpBevestigd: true,
      });
      setMelding(tr(lang, `Ключ «${s.label}» синхронізовано з 3 чинниками та правилами ${regelsVersie || ''}.`, `Sleutel «${s.label}» gesynchroniseerd met 3 factoren en regels ${regelsVersie || ''}.`));
      await laden();
    } catch {
      setFout(tr(lang, 'Синхронізація не вдалася.', 'Synchronisatie mislukt.'));
    } finally {
      setBezig('');
    }
  };

  const roteren = async (s: SleutelItem) => {
    setBezig(`rot-${s.id}`); setFout(''); setMelding('');
    try {
      const r = (await api.post('/api/owner/uitrol/sleutels/roteren', { ...context, id: s.id })).data as EenmaligResultaat;
      setEenmalig(r);
      setMelding(tr(lang, `Ключ «${s.label}» перевипущено. Старе значення більше не діє.`, `Sleutel «${s.label}» vernieuwd. De vorige waarde werkt niet meer.`));
      await laden();
    } catch {
      setFout(tr(lang, 'Не вдалося перевипустити ключ.', 'Sleutel vernieuwen mislukt.'));
    } finally {
      setBezig('');
    }
  };

  const intrekken = async (s: SleutelItem) => {
    if (intrekReden.trim().length < 4) {
      setFout(tr(lang, 'Вкажіть причину відкликання (від 4 символів).', 'Geef een reden voor intrekking (minstens 4 tekens).'));
      return;
    }
    setBezig(`del-${s.id}`); setFout(''); setMelding('');
    try {
      await api.post('/api/owner/uitrol/sleutels/intrekken', { ...context, id: s.id, reden: intrekReden.trim() });
      setIntrekId('');
      setIntrekReden('');
      setMelding(tr(lang, `Персональний ключ «${s.label}» відкликано.`, `Persoonlijke sleutel «${s.label}» ingetrokken.`));
      await laden();
    } catch {
      setFout(tr(lang, 'Не вдалося відкликати ключ.', 'Sleutel intrekken mislukt.'));
    } finally {
      setBezig('');
    }
  };

  const accounts = data.kandidaten?.accounts || [];
  const agents = data.kandidaten?.agents || [];

  return (
    <section className='ut-kaart ut-3f-kaart' id='ut-sleutels-3f-anker' data-ut-sleutels-3f aria-labelledby='ut-3f-titel'>
      <header className='ut-kaart-kop'>
        <div>
          <h2 id='ut-3f-titel'><KeyRound aria-hidden='true' /> {tr(lang, 'Персональні ключі та 3-чинникова довіра (GitHub ↔ MCP ШІ ↔ Сайт)', 'Persoonlijke sleutels en driefactorvertrouwen (GitHub ↔ MCP AI ↔ Site)')}</h2>
          <p className='ut-sub'>
            {tr(
              lang,
              'Кожен адміністратор чи делегована особа має власний відкличний ключ. Для повного права «Завантаження + встановлення» потрібна взаємна синхронізація всіх 3 чинників: компрометація одного облікового запису не дає встановити підроблене оновлення.',
              'Elke beheerder of gedelegeerde heeft een eigen intrekbare sleutel. Voor «Uploaden + installeren» is wederzijdse synchronisatie van alle 3 factoren vereist: inbraak op één account laat geen vervalste update toe.',
            )}
          </p>
        </div>
        <button type='button' className='ut-knop' disabled={laadt} onClick={() => void laden()}>
          <RefreshCw aria-hidden='true' className={laadt ? 'spin' : undefined} />
          {tr(lang, 'Оновити', 'Vernieuwen')}
        </button>
      </header>

      {regelsVersie && (
        <p className='ut-3f-lock'>
          <ShieldCheck aria-hidden='true' />
          <span>{tr(lang, `Чинні правила оркестрації для синхронізації: версія ${regelsVersie}`, `Geldende coördinatieregels voor synchronisatie: versie ${regelsVersie}`)}</span>
        </p>
      )}

      {fout && <p className='ut-fout' role='alert'>{fout}</p>}
      {melding && <p className='ut-ok-tekst' role='status'>{melding}</p>}

      {eenmalig && (
        <div className='ut-3f-eenmalig' role='region' aria-label={tr(lang, 'Одноразовий обмін ключем', 'Eenmalige sleuteluitwisseling')}>
          <div className='ut-3f-eenmalig-kop'>
            <strong>{tr(lang, 'Одноразовий персональний ключ і код обміну', 'Eenmalige persoonlijke sleutel en uitwisselcode')}</strong>
            <button type='button' className='ut-knop' onClick={() => setEenmalig(null)}>{tr(lang, 'Я зберіг, сховати', 'Bewaard, verbergen')}</button>
          </div>
          <p className='ut-sub'>{lang === 'nl' ? eenmalig.uitwisselPakket.instructieNl : eenmalig.uitwisselPakket.instructieUk}</p>
          <div className='ut-3f-code-rij'>
            <label>{tr(lang, 'Персональний ключ (GitHub / MCP)', 'Persoonlijke sleutel (GitHub / MCP)')}</label>
            <code>{eenmalig.eenmaligeSleutel}</code>
            <button type='button' className='ut-knop' onClick={() => kopieer('sleutel', eenmalig.eenmaligeSleutel)}>
              <Copy aria-hidden='true' />{gekopieerd === 'sleutel' ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}
            </button>
          </div>
          <div className='ut-3f-code-rij'>
            <label>{tr(lang, 'Код одноразового обміну (30 хв)', 'Eenmalige uitwisselcode (30 min)')}</label>
            <code>{eenmalig.uitwisselCode}</code>
            <button type='button' className='ut-knop' onClick={() => kopieer('code', eenmalig.uitwisselCode)}>
              <Copy aria-hidden='true' />{gekopieerd === 'code' ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}
            </button>
          </div>
        </div>
      )}

      <div className='ut-3f-form' data-ut-3f-form>
        <h3>{tr(lang, 'Створити персональний ключ і прив’язати канали', 'Persoonlijke sleutel aanmaken en kanalen koppelen')}</h3>
        <div className='ut-3f-grid'>
          <label>
            <span>{tr(lang, 'Назва ключа', 'Naam van de sleutel')}</span>
            <input type='text' value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120}
              placeholder={tr(lang, 'Наприклад: Павло · Основний GitHub+MCP', 'Bijv.: Pavlo · Hoofd GitHub+MCP')} />
          </label>
          <label>
            <span>{tr(lang, 'Адміністратор / обліковий запис', 'Beheerder / account')}</span>
            <select data-hulp-vrij='keuze' value={userId} onChange={(e) => setUserId(e.target.value)}>
              {data.ik?.id && <option value={data.ik.id}>{data.ik.naam || data.ik.email || data.ik.id}</option>}
              {accounts.filter((a) => a.id !== data.ik?.id).map((a) => (
                <option key={a.id} value={a.id}>{a.naam ? `${a.naam} (${a.label})` : a.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{tr(lang, 'Роль ключа', 'Rol van de sleutel')}</span>
            <select data-hulp-vrij='keuze' value={rol} onChange={(e) => setRol(e.target.value as SleutelRol)}>
              <option value='eigenaar'>{tr(lang, 'Власник', 'Eigenaar')}</option>
              <option value='beheerder'>{tr(lang, 'Адміністратор', 'Beheerder')}</option>
              <option value='gedelegeerde'>{tr(lang, 'Делегована особа', 'Gedelegeerde')}</option>
              <option value='agent'>{tr(lang, 'ШІ-агент', 'AI-agent')}</option>
            </select>
          </label>
          <label>
            <span>{tr(lang, 'Рівень доступу', 'Toegangsniveau')}</span>
            <select data-hulp-vrij='keuze' value={toegangNiveau} onChange={(e) => setToegangNiveau(e.target.value as SleutelToegang)}>
              <option value='uploaden'>{tr(lang, 'Лише завантаження в чергу (перевірка сайтом)', 'Alleen uploaden naar wachtrij (sitecontrole)')}</option>
              <option value='installeren'>{tr(lang, 'Завантаження + встановлення (суворо 3 чинники)', 'Uploaden + installeren (strikt 3 factoren)')}</option>
            </select>
          </label>
          <label>
            <span>{tr(lang, 'Сховище / ключ GitHub', 'GitHub-opslagplaats / sleutel')}</span>
            <input type='text' value={githubKoppeling} onChange={(e) => setGithubKoppeling(e.target.value)} maxLength={140} placeholder='Tarasevych/hub' />
          </label>
          <label>
            <span>{tr(lang, 'Прив’язаний MCP-з’єднувач ШІ', 'Gekoppelde MCP AI-connector')}</span>
            <select data-hulp-vrij='keuze' value={mcpAgentSlug} onChange={(e) => setMcpAgentSlug(e.target.value)}>
              <option value=''>{tr(lang, 'Не прив’язано', 'Niet gekoppeld')}</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <div className='ut-3f-checks'>
          <label>
            <input type='checkbox' data-hulp-vrij='keuze' checked={githubBevestigd} onChange={(e) => setGithubBevestigd(e.target.checked)} />
            <span>{tr(lang, 'Підтвердити прив’язку GitHub + TRACE-001', 'GitHub-koppeling + TRACE-001 bevestigen')}</span>
          </label>
          <label>
            <input type='checkbox' data-hulp-vrij='keuze' checked={mcpBevestigd} onChange={(e) => setMcpBevestigd(e.target.checked)} />
            <span>{tr(lang, 'Підтвердити MCP-з’єднувач ШІ та чинні правила', 'MCP AI-koppeling en geldende regels bevestigen')}</span>
          </label>
        </div>
        <div className='ut-pakket-knoppen'>
          <button type='button' className='ut-knop ut-knop-primair' disabled={bezig === 'nieuw'} onClick={() => void aanmaken()}>
            <KeyRound aria-hidden='true' />
            {tr(lang, 'Створити персональний ключ', 'Persoonlijke sleutel aanmaken')}
          </button>
        </div>
      </div>

      <ul className='ut-3f-lijst' data-ut-3f-lijst={sleutels.length}>
        {sleutels.length === 0 && (
          <li className='ut-leeg'>{tr(lang, 'Персональних ключів ще не створено. Створіть перший ключ вище для 3-чинникової синхронізації.', 'Nog geen persoonlijke sleutels aangemaakt. Maak hierboven de eerste sleutel voor driefactorsynchronisatie.')}</li>
        )}
        {sleutels.map((s) => (
          <li key={s.id} className='ut-3f-item' data-status={s.status} data-volledig={s.drieFactoren.volledig ? 'ja' : 'nee'}>
            <div className='ut-3f-item-kop'>
              <div>
                <strong>{s.label}</strong>
                <span className='ut-mono ut-3f-prefix'>{s.prefix}…</span>
                <i className='ut-badge' data-staat={s.status === 'actief' ? (s.drieFactoren.volledig ? 'klaar' : 'bezig') : 'geweigerd'}>
                  {s.status === 'ingetrokken'
                    ? tr(lang, 'Відкликано', 'Ingetrokken')
                    : `${s.drieFactoren.aantalOk}/3 ${tr(lang, 'чинники', 'factoren')}`}
                </i>
              </div>
              <small className='ut-sub'>
                {s.toegangNiveau === 'installeren'
                  ? tr(lang, 'Право: завантаження + встановлення', 'Recht: uploaden + installeren')
                  : tr(lang, 'Право: лише завантаження в чергу', 'Recht: alleen uploaden naar wachtrij')}
                {s.regelsVersie ? ` · ${tr(lang, 'правила', 'regels')} ${s.regelsVersie}` : ''}
              </small>
            </div>

            <div className='ut-3f-factoren'>
              <span className='ut-3f-pill' data-ok={s.drieFactoren.github.ok}>
                {s.drieFactoren.github.ok ? <CheckCircle2 aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
                <span>GitHub: {s.githubKoppeling || '—'}</span>
              </span>
              <span className='ut-3f-pill' data-ok={s.drieFactoren.mcp.ok}>
                {s.drieFactoren.mcp.ok ? <CheckCircle2 aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
                <span>MCP: {s.mcpAgentSlug || s.mcpKoppelingId || '—'}</span>
              </span>
              <span className='ut-3f-pill' data-ok={s.drieFactoren.site.ok}>
                {s.drieFactoren.site.ok ? <CheckCircle2 aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}
                <span>{tr(lang, 'Сайт + ключ', 'Site + sleutel')}</span>
              </span>
            </div>

            <p className='ut-sub'>{lang === 'nl' ? s.toegangOordeel.redenNl : s.toegangOordeel.redenUk}</p>
            {s.ingetrokkenReden && (
              <p className='ut-fout'>{tr(lang, 'Причина відкликання: ', 'Reden van intrekking: ')}{s.ingetrokkenReden}</p>
            )}

            {s.status === 'actief' && (
              <div className='ut-pakket-knoppen'>
                <button type='button' className='ut-knop' disabled={Boolean(bezig)} onClick={() => void synchroniseren(s)}>
                  <Link2 aria-hidden='true' />{tr(lang, 'Синхронізувати 3 чинники', '3 factoren synchroniseren')}
                </button>
                <button type='button' className='ut-knop' disabled={Boolean(bezig)} onClick={() => void roteren(s)}>
                  <RotateCw aria-hidden='true' />{tr(lang, 'Перевипустити ключ', 'Sleutel vernieuwen')}
                </button>
                {intrekId === s.id ? (
                  <span className='ut-3f-intrek-rij'>
                    <input type='text' value={intrekReden} onChange={(e) => setIntrekReden(e.target.value)} maxLength={200}
                      placeholder={tr(lang, 'Причина відкликання…', 'Reden van intrekking…')} />
                    <button type='button' className='ut-knop ut-knop-gevaar' disabled={Boolean(bezig)} onClick={() => void intrekken(s)}>
                      {tr(lang, 'Підтвердити відкликання', 'Intrekking bevestigen')}
                    </button>
                    <button type='button' className='ut-knop' onClick={() => { setIntrekId(''); setIntrekReden(''); }}>
                      {tr(lang, 'Скасувати', 'Annuleren')}
                    </button>
                  </span>
                ) : (
                  <button type='button' className='ut-knop ut-knop-gevaar' disabled={Boolean(bezig)} onClick={() => setIntrekId(s.id)}>
                    <Trash2 aria-hidden='true' />{tr(lang, 'Відкликати', 'Intrekken')}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
