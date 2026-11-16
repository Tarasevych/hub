// Повний робочий центр розумного потоку розгортання: інтелектуальний аналіз ризиків, контекстний контрольний список,
// автоматичні докази перевірок із криптографічною перевіркою хеш-ланцюга, нотатки та експорт звітів.
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  Download,
  FileCheck2,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import {
  bewijsInhoudVoorHash,
  type ControlelijstGroep,
  type ControlelijstItem,
  type ControlelijstStatus,
  type StroomBewijs,
  type StroomNotitie,
  type StroomOverzicht,
  type StroomRisico,
} from '../../shared/uitrol-stroom';
import HulpVraag from '../hulp/HulpVraag';
import { foutTekst } from './fouten';
import { risicoTekst } from './UitrolStroomKaart';
import { datumLang, tr, type Lang } from './types';
import './stroom.css';

type Props = {
  lang: Lang;
  context: Record<string, unknown>;
  versie: string;
  onVersie: (v: string) => void;
};

const GROEP_NAAM: Record<ControlelijstGroep, { uk: string; nl: string }> = {
  voorbereiding: { uk: 'Підготовка', nl: 'Voorbereiding' },
  veiligheid: { uk: 'Безпека', nl: 'Beveiliging' },
  migraties: { uk: 'Міграції БД', nl: 'Databasemigraties' },
  goedkeuring: { uk: 'Схвалення', nl: 'Goedkeuring' },
  nazorg: { uk: 'Після встановлення', nl: 'Nazorg' },
  eigen: { uk: 'Власні пункти', nl: 'Eigen punten' },
};

const STATUS_NAAM: Record<ControlelijstStatus, { uk: string; nl: string }> = {
  open: { uk: 'Очікує', nl: 'Open' },
  geslaagd: { uk: 'Пройдено авто', nl: 'Automatisch geslaagd' },
  afgevinkt: { uk: 'Підтверджено', nl: 'Afgevinkt' },
  waarschuwing: { uk: 'Попередження', nl: 'Waarschuwing' },
  mislukt: { uk: 'Помилка', nl: 'Mislukt' },
  overgeslagen: { uk: 'Пропущено', nl: 'Overgeslagen' },
};

const GEBIED_NAAM: Record<string, { uk: string; nl: string }> = {
  'database-migraties': { uk: 'БД і міграції', nl: 'DB en migraties' },
  'beveiliging-rls': { uk: 'Безпека і RLS', nl: 'Beveiliging en RLS' },
  'backend-routes': { uk: 'Серверні маршрути', nl: 'Serverroutes' },
  'frontend-ui': { uk: 'Інтерфейс', nl: 'Interface' },
  'deploy-scripts': { uk: 'Скрипти розгортання', nl: 'Uitrolscripts' },
  tests: { uk: 'Тести', nl: 'Tests' },
  algemeen: { uk: 'Загальне', nl: 'Algemeen' },
};

async function sha256HexBrowser(tekst: string): Promise<string> {
  const bytes = new TextEncoder().encode(tekst);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function UitrolStroom({ lang, context, versie, onVersie }: Props) {
  const [stand, setStand] = useState<StroomOverzicht | null>(null);
  const [laden, setLaden] = useState(false);
  const [actie, setActie] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  // Фільтр контрольного списку
  const [groepFilter, setGroepFilter] = useState<ControlelijstGroep | 'alle'>('alle');
  const [skipItem, setSkipItem] = useState<{ id: string; reden: string } | null>(null);
  const [nieuwControle, setNieuwControle] = useState({ open: false, titel: '', toelichting: '', verplicht: false });

  // Нотатки
  const [notitieForm, setNotitieForm] = useState<{
    open: boolean;
    id: string;
    titel: string;
    inhoud: string;
    risico: StroomRisico;
    vastgepind: boolean;
  }>({ open: false, id: '', titel: '', inhoud: '', risico: 'normaal', vastgepind: false });

  // Незалежна клієнтська перевірка криптографічного ланцюжка в браузері
  const [klantKeten, setKlantKeten] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [rapportPreview, setRapportPreview] = useState<{ markdown: string; jsonTekst: string } | null>(null);
  const [gekopieerd, setGekopieerd] = useState('');

  const laad = useCallback(async (gevraagdeVersie?: string) => {
    setLaden(true);
    try {
      const v = gevraagdeVersie !== undefined ? gevraagdeVersie : versie;
      const r = await api.post('/api/owner/uitrol/stroom/stand', { ...context, ...(v ? { versie: v } : {}) });
      const d = r.data as StroomOverzicht;
      setStand(d);
      if (!versie && d.versie) onVersie(d.versie);
      setMelding((m) => (m && !m.ok ? null : m));
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setLaden(false);
    }
  }, [context, versie, lang, onVersie]);

  useEffect(() => {
    void laad();
  }, [laad]);

  const kopieer = (sleutel: string, tekst: string) => {
    void navigator.clipboard?.writeText(tekst).then(() => {
      setGekopieerd(sleutel);
      window.setTimeout(() => setGekopieerd(''), 1800);
    }).catch(() => undefined);
  };

  const verzamelBewijs = async () => {
    if (!stand) return;
    setActie('bewijs');
    setMelding(null);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/bewijs-verzamelen', { ...context, versie: stand.versie });
      setStand(r.data as StroomOverzicht);
      setKlantKeten(null);
      setMelding({ ok: true, tekst: tr(lang, 'Автоматичні докази зібрано й перевірено.', 'Automatisch bewijs opnieuw verzameld en gecontroleerd.') });
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const verifieerInBrowser = async () => {
    if (!stand) return;
    if (!crypto?.subtle) {
      setKlantKeten({ ok: false, tekst: tr(lang, 'Браузер не підтримує Web Crypto API на цьому зʼєднанні.', 'De browser ondersteunt geen Web Crypto API op deze verbinding.') });
      return;
    }
    const fouten: string[] = [];
    let vorig = '';
    for (let i = 0; i < stand.bewijzen.length; i++) {
      const b = stand.bewijzen[i];
      const inhoud = bewijsInhoudVoorHash({
        versie: b.versie,
        soort: b.soort,
        bron: b.bron,
        status: b.status,
        pakketSha256: b.pakketSha256,
        bewijsData: b.bewijsData,
        vorigeHash: b.vorigeHash,
      });
      const berekend = await sha256HexBrowser(inhoud);
      if (berekend !== b.bewijsHash) fouten.push(`${b.soort} (${b.id.slice(0, 8)})`);
      if (i > 0 && b.vorigeHash !== vorig) fouten.push(`vorige_hash @ ${b.soort}`);
      vorig = b.bewijsHash;
    }
    setKlantKeten(
      fouten.length === 0
        ? {
            ok: true,
            tekst: tr(
              lang,
              `Незалежна перевірка в браузері підтвердила всі ${stand.bewijzen.length} хешів SHA-256 і безперервність ланцюга.`,
              `Onafhankelijke controle in de browser bevestigde alle ${stand.bewijzen.length} SHA-256-hashes en de volledige keten.`,
            ),
          }
        : {
            ok: false,
            tekst: tr(lang, `Виявлено розбіжність хешів: ${fouten.join(', ')}`, `Hashafwijking gevonden: ${fouten.join(', ')}`),
          },
    );
  };

  const zetControle = async (id: string, status: 'open' | 'afgevinkt' | 'overgeslagen', reden = '') => {
    setActie(`ctrl-${id}`);
    setMelding(null);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/controle-status', { ...context, id, status, reden });
      const d = r.data as { overzicht: StroomOverzicht };
      setStand(d.overzicht);
      setSkipItem(null);
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const voegControleToe = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!stand) return;
    setActie('ctrl-nieuw');
    setMelding(null);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/controle-status', {
        ...context,
        nieuw: true,
        versie: stand.versie,
        titel: nieuwControle.titel,
        toelichting: nieuwControle.toelichting,
        verplicht: nieuwControle.verplicht,
      });
      const d = r.data as { overzicht: StroomOverzicht };
      setStand(d.overzicht);
      setNieuwControle({ open: false, titel: '', toelichting: '', verplicht: false });
      setMelding({ ok: true, tekst: tr(lang, 'Пункт додано до контрольного списку.', 'Onderdeel aan de controlelijst toegevoegd.') });
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const verwijderControle = async (id: string) => {
    if (!stand) return;
    setActie(`del-c-${id}`);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/controle-verwijderen', { ...context, id, versie: stand.versie });
      const d = r.data as { overzicht?: StroomOverzicht };
      if (d.overzicht) setStand(d.overzicht);
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const bewaarNotitie = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!stand) return;
    setActie('notitie');
    setMelding(null);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/notitie-opslaan', {
        ...context,
        ...(notitieForm.id ? { id: notitieForm.id } : {}),
        versie: stand.versie,
        titel: notitieForm.titel,
        inhoud: notitieForm.inhoud,
        risico: notitieForm.risico,
        vastgepind: notitieForm.vastgepind,
      });
      const d = r.data as { overzicht: StroomOverzicht };
      setStand(d.overzicht);
      setNotitieForm({ open: false, id: '', titel: '', inhoud: '', risico: 'normaal', vastgepind: false });
      setMelding({ ok: true, tekst: tr(lang, 'Нотатку збережено (таємниці автоматично приховуються).', 'Notitie opgeslagen (geheimen automatisch opgeschoond).') });
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const pinNotitie = async (n: StroomNotitie) => {
    setActie(`pin-${n.id}`);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/notitie-opslaan', {
        ...context,
        id: n.id,
        versie: n.versie,
        titelUk: n.titelUk,
        titelNl: n.titelNl,
        inhoudUk: n.inhoudUk,
        inhoudNl: n.inhoudNl,
        risico: n.risico,
        vastgepind: !n.vastgepind,
        onderdelen: n.onderdelen,
      });
      setStand((r.data as { overzicht: StroomOverzicht }).overzicht);
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const verwijderNotitie = async (n: StroomNotitie) => {
    setActie(`del-n-${n.id}`);
    try {
      const r = await api.post('/api/owner/uitrol/stroom/notitie-verwijderen', { ...context, id: n.id, versie: n.versie });
      const d = r.data as { overzicht?: StroomOverzicht };
      if (d.overzicht) setStand(d.overzicht);
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const maakRapport = async () => {
    if (!stand) return;
    setActie('rapport');
    try {
      const r = await api.post('/api/owner/uitrol/stroom/rapport', { ...context, versie: stand.versie, lang });
      const d = r.data as { markdown: string; rapport: StroomOverzicht };
      setStand(d.rapport);
      setRapportPreview({ markdown: d.markdown, jsonTekst: JSON.stringify(d.rapport, null, 2) });
    } catch (e) {
      setMelding({ ok: false, tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setActie('');
    }
  };

  const downloadBestand = (naam: string, inhoud: string, mime: string) => {
    const blob = new Blob([inhoud], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = naam;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!stand && laden) {
    return (
      <div className='admin-laden' role='status' aria-busy='true'>
        <RefreshCw className='spin' aria-hidden='true' />
        <p>{tr(lang, 'Збираємо розумний потік розгортання та докази перевірок…', 'Slimme uitrolstroom en bewijs van controles worden verzameld…')}</p>
      </div>
    );
  }

  if (!stand) {
    return (
      <section className='ut-kaart'>
        <p className='ut-notice' data-ok={false}><span>{melding?.tekst || tr(lang, 'Не вдалося завантажити потік.', 'Stroom kon niet worden geladen.')}</span></p>
        <button type='button' className='ut-knop' onClick={() => void laad()}>{tr(lang, 'Спробувати ще раз', 'Opnieuw proberen')}</button>
      </section>
    );
  }

  const g = stand.gereedheid;
  const gefilterdeControles = groepFilter === 'alle'
    ? stand.controlelijst
    : stand.controlelijst.filter((c) => c.groep === groepFilter);
  const groepenAanwezig = [...new Set(stand.controlelijst.map((c) => c.groep))];

  return (
    <div className='ut-stroom-kolommen' data-ut-stroom={stand.versie}>
      {/* Верхня картка керування версією та зведеним станом */}
      <section className='ut-kaart' aria-labelledby='ut-stroom-hoofd-titel'>
        <header className='ut-kaart-kop'>
          <div>
            <h2 id='ut-stroom-hoofd-titel'><ClipboardCheck aria-hidden='true' /> {tr(lang, 'Розумний потік розгортання', 'Slimme uitrolstroom')}</h2>
            <p className='ut-sub'>
              {tr(lang, 'Єдиний доказовий журнал випуску: аналіз ризику, адаптивний контрольний список і криптографічно зв’язані результати перевірок.', 'Het vaste bewijsdossier van de release: risicoanalyse, contextuele controlelijst en cryptografisch gekoppelde controleresultaten.')}
            </p>
          </div>
          <div className='ut-stroom-kop-acties'>
            <label className='ut-stroom-kies-versie'>
              <span>{tr(lang, 'Версія:', 'Versie:')}</span>
              <select
                data-hulp-vrij='keuze'
                value={stand.versie}
                onChange={(e) => {
                  const v = e.target.value;
                  onVersie(v);
                  setRapportPreview(null);
                  setKlantKeten(null);
                  void laad(v);
                }}
              >
                {stand.versies.map((v) => (
                  <option key={v.versie} value={v.versie}>
                    {v.versie}{v.isActief ? ` (${tr(lang, 'активна', 'actief')})` : ` · ${v.status}`}
                  </option>
                ))}
              </select>
            </label>
            <button type='button' className='ut-knop' disabled={laden || !!actie} onClick={() => void verzamelBewijs()}>
              <RefreshCw size={15} className={actie === 'bewijs' ? 'ut-draai' : undefined} aria-hidden='true' />
              {tr(lang, 'Перезібрати докази', 'Bewijs verzamelen')}
            </button>
            <button type='button' className='ut-knop ut-knop-primair' disabled={!!actie} onClick={() => void maakRapport()}>
              <Download size={15} aria-hidden='true' />
              {tr(lang, 'Доказовий звіт', 'Bewijsrapport')}
            </button>
          </div>
        </header>

        {melding && (
          <p className='ut-notice' data-ok={melding.ok} role='status'>
            <span>{melding.tekst}</span>
          </p>
        )}

        <div className='ut-stroom-overzicht-balk'>
          <div className='ut-stroom-tegel'>
            <span className='ut-stroom-tegel-label'>{tr(lang, 'Інтелектуальний ризик', 'Intelligent risico')}</span>
            <div className='ut-stroom-tegel-waarde'>
              <span className='ut-stroom-risico' data-risico={stand.duiding.risico}>
                {stand.duiding.risico === 'kritiek' ? <ShieldAlert size={14} aria-hidden='true' /> : <ShieldCheck size={14} aria-hidden='true' />}
                {risicoTekst(lang, stand.duiding.risico)}
              </span>
              <span>{stand.duiding.score}/100</span>
            </div>
          </div>

          <div className='ut-stroom-tegel'>
            <span className='ut-stroom-tegel-label'>{tr(lang, 'Готовність контрольного списку', 'Gereedheid controlelijst')}</span>
            <div className='ut-stroom-tegel-waarde'>
              <span>{g.afgerond}/{g.totaal} ({g.voortgangPct}%)</span>
              {g.geblokkeerd && <small data-fout='1'>{tr(lang, `відкрито обов’язкових: ${g.openVerplicht}`, `open verplicht: ${g.openVerplicht}`)}</small>}
            </div>
            <div className='ut-stroom-voortgang' data-ok={!g.geblokkeerd && g.voortgangPct === 100} data-fout={g.mislukt > 0}>
              <span style={{ width: `${g.voortgangPct}%` }} />
            </div>
          </div>

          <div className='ut-stroom-tegel'>
            <span className='ut-stroom-tegel-label'>{tr(lang, 'Ланцюжок доказів SHA-256', 'SHA-256-bewijsketen')}</span>
            <div className='ut-stroom-tegel-waarde'>
              {stand.ketenIntegriteit.ok ? <CheckCircle2 size={16} aria-hidden='true' /> : <XCircle size={16} aria-hidden='true' />}
              <span>{stand.bewijzen.length} · {stand.ketenIntegriteit.ok ? tr(lang, 'Цілісний', 'Onbeschadigd') : tr(lang, 'Порушений', 'Geschonden')}</span>
            </div>
          </div>

          <div className='ut-stroom-tegel'>
            <span className='ut-stroom-tegel-label'>{tr(lang, 'Поточний стан випуску', 'Status van deze versie')}</span>
            <div className='ut-stroom-tegel-waarde'>
              <code className='ut-mono'>{stand.voorstel?.status || stand.run?.staat || (stand.versie === stand.actieveVersie ? tr(lang, 'активна на сервері', 'actief op server') : '—')}</code>
            </div>
          </div>
        </div>

        {rapportPreview && (
          <div className='ut-stroom-rapport-box' data-ut-stroom-rapport>
            <div className='ut-stroom-compact-kop'>
              <strong>{tr(lang, `Звіт готовий (${stand.versie}, секрети приховано)`, `Rapport gereed (${stand.versie}, zonder geheimen)`)}</strong>
              <div className='ut-stroom-punt-acties'>
                <button type='button' className='ut-knop' onClick={() => kopieer('md', rapportPreview.markdown)}>
                  {gekopieerd === 'md' ? <Check size={14} aria-hidden='true' /> : <ClipboardCopy size={14} aria-hidden='true' />}
                  {tr(lang, 'Копіювати Markdown', 'Markdown kopiëren')}
                </button>
                <button type='button' className='ut-knop' onClick={() => downloadBestand(`uitrol-bewijs-${stand.versie}.md`, rapportPreview.markdown, 'text/markdown;charset=utf-8')}>
                  <Download size={14} aria-hidden='true' />
                  .md
                </button>
                <button type='button' className='ut-knop' onClick={() => downloadBestand(`uitrol-bewijs-${stand.versie}.json`, rapportPreview.jsonTekst, 'application/json;charset=utf-8')}>
                  <Download size={14} aria-hidden='true' />
                  .json
                </button>
                <button type='button' className='ut-knop' onClick={() => setRapportPreview(null)}>{tr(lang, 'Сховати', 'Sluiten')}</button>
              </div>
            </div>
            <pre>{rapportPreview.markdown}</pre>
          </div>
        )}
      </section>

      {/* Блок 1: Інтелектуальний аналіз ризиків */}
      <section className='ut-stroom-sectie' aria-labelledby='ut-stroom-duiding-titel'>
        <div className='ut-stroom-sectie-kop'>
          <h3 id='ut-stroom-duiding-titel'><Bot size={18} aria-hidden='true' /> {lang === 'uk' ? stand.duiding.titelUk : stand.duiding.titelNl}</h3>
          <span className='ut-stroom-risico' data-risico={stand.duiding.risico}>{risicoTekst(lang, stand.duiding.risico)} · {stand.duiding.score}/100</span>
        </div>

        <p>{lang === 'uk' ? stand.duiding.samenvattingUk : stand.duiding.samenvattingNl}</p>

        <div className='ut-stroom-gebieden'>
          {stand.duiding.gebieden.map((gb) => (
            <span key={gb} className='ut-stroom-tag'>{GEBIED_NAAM[gb] ? tr(lang, GEBIED_NAAM[gb].uk, GEBIED_NAAM[gb].nl) : gb}</span>
          ))}
        </div>

        {stand.duiding.factoren.length > 0 && (
          <ul className='ut-stroom-factoren'>
            {stand.duiding.factoren.map((f, i) => (
              <li key={i} data-ernst={f.ernst}>
                {f.ernst === 'kritiek' && <AlertTriangle size={14} aria-hidden='true' />}{' '}
                {lang === 'uk' ? f.uk : f.nl}
              </li>
            ))}
          </ul>
        )}

        <details style={{ marginTop: 10 }}>
          <summary>{tr(lang, 'Очищений контекст для ШІ-помічника (без секретів)', 'Opgeschoonde instructie voor AI-assistent (zonder geheimen)')}</summary>
          <div className='ut-stroom-rapport-box'>
            <div className='ut-stroom-compact-kop'>
              <small>{tr(lang, 'Усі паролі, секретні коди й ключі автоматично видалені перед формуванням запиту.', 'Alle wachtwoorden, tokens en sleutels zijn vooraf verwijderd.')}</small>
              <button type='button' className='ut-knop' onClick={() => kopieer('prompt', `${stand.duiding.aiPrompt.systeem}\n\n${stand.duiding.aiPrompt.vraag}`)}>
                {gekopieerd === 'prompt' ? <Check size={14} aria-hidden='true' /> : <ClipboardCopy size={14} aria-hidden='true' />}
                {tr(lang, 'Копіювати підказку', 'Instructie kopiëren')}
              </button>
            </div>
            <pre>{stand.duiding.aiPrompt.vraag}</pre>
          </div>
        </details>
      </section>

      {/* Блок 2: Контекстний контрольний список розгортання */}
      <section className='ut-stroom-sectie' aria-labelledby='ut-stroom-ctrl-titel'>
        <div className='ut-stroom-sectie-kop'>
          <h3 id='ut-stroom-ctrl-titel'><ClipboardCheck size={18} aria-hidden='true' /> {tr(lang, 'Контекстний контрольний список', 'Contextafhankelijke controlelijst')} ({g.afgerond}/{g.totaal}) <HulpVraag k='uitrol.stroom-verplicht' lang={lang} /></h3>
          <button type='button' className='ut-knop' onClick={() => setNieuwControle((c) => ({ ...c, open: !c.open }))}>
            <Plus size={15} aria-hidden='true' />
            {tr(lang, 'Додати пункт', 'Punt toevoegen')}
          </button>
        </div>

        <div className='ut-stroom-chips' role='group' aria-label={tr(lang, 'Фільтр груп контрольного списку', 'Filter van groepen')}>
          <button type='button' className='ut-stroom-chip' aria-pressed={groepFilter === 'alle'} onClick={() => setGroepFilter('alle')}>
            {tr(lang, 'Усі', 'Alle')} ({stand.controlelijst.length})
          </button>
          {groepenAanwezig.map((grp) => (
            <button key={grp} type='button' className='ut-stroom-chip' aria-pressed={groepFilter === grp} onClick={() => setGroepFilter(grp)}>
              {tr(lang, GROEP_NAAM[grp].uk, GROEP_NAAM[grp].nl)}
            </button>
          ))}
        </div>

        {nieuwControle.open && (
          <form className='ut-stroom-form' onSubmit={(e) => void voegControleToe(e)}>
            <div className='ut-stroom-form-rij'>
              <label>
                <span>{tr(lang, 'Назва перевірки', 'Naam van de controle')}</span>
                <input
                  type='text'
                  required
                  maxLength={200}
                  value={nieuwControle.titel}
                  onChange={(e) => setNieuwControle((c) => ({ ...c, titel: e.target.value }))}
                  placeholder={tr(lang, 'Наприклад: Перевірено сповіщення в Telegram після рестарту', 'Bijv.: Telegram-meldingen na herstart gecontroleerd')}
                />
              </label>
              <label>
                <span>{tr(lang, 'Пояснення (необов’язково)', 'Toelichting (optioneel)')}</span>
                <input
                  type='text'
                  maxLength={500}
                  value={nieuwControle.toelichting}
                  onChange={(e) => setNieuwControle((c) => ({ ...c, toelichting: e.target.value }))}
                />
              </label>
            </div>
            <label className='ut-stroom-check'>
              <input data-hulp='uitrol.stroom-verplicht' type='checkbox' checked={nieuwControle.verplicht} onChange={(e) => setNieuwControle((c) => ({ ...c, verplicht: e.target.checked }))} />
              <span>{tr(lang, 'Обов’язковий блокувальний пункт', 'Verplicht blokkerend punt')}</span>
            </label>
            <div className='ut-stroom-punt-acties'>
              <button type='submit' className='ut-knop ut-knop-primair' disabled={actie === 'ctrl-nieuw'}>{tr(lang, 'Зберегти пункт', 'Punt opslaan')}</button>
              <button type='button' className='ut-knop' onClick={() => setNieuwControle({ open: false, titel: '', toelichting: '', verplicht: false })}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            </div>
          </form>
        )}

        <ul className='ut-stroom-lijst'>
          {gefilterdeControles.map((item: ControlelijstItem) => {
            const kanHandmatigAfvinken = item.handmatigBevestigen || (item.status !== 'mislukt' && item.status !== 'geslaagd');
            const isAfgerond = item.status === 'geslaagd' || item.status === 'afgevinkt' || item.status === 'overgeslagen';
            return (
              <li key={item.id} className='ut-stroom-punt' data-status={item.status} data-controle-sleutel={item.sleutel}>
                <div className='ut-stroom-punt-boven'>
                  <div className='ut-stroom-punt-titel'>
                    <strong>{lang === 'uk' ? item.titelUk : item.titelNl}</strong>
                    <small>{lang === 'uk' ? item.toelichtingUk : item.toelichtingNl}</small>
                    {item.reden && <small><b>{tr(lang, 'Причина:', 'Reden:')}</b> {item.reden}</small>}
                  </div>
                  <div className='ut-stroom-punt-labels'>
                    <span className='ut-stroom-status-pil' data-status={item.status}>
                      {tr(lang, STATUS_NAAM[item.status].uk, STATUS_NAAM[item.status].nl)}
                    </span>
                    <span className='ut-stroom-tag'>{tr(lang, GROEP_NAAM[item.groep].uk, GROEP_NAAM[item.groep].nl)}</span>
                    {item.verplicht && <span className='ut-stroom-tag'>{tr(lang, 'Обов’язковий', 'Verplicht')}</span>}
                    {item.handmatigBevestigen && <span className='ut-stroom-tag'>{tr(lang, 'Ручне підтвердження', 'Handmatig')}</span>}
                  </div>
                </div>
                <div className='ut-stroom-punt-acties'>
                  {kanHandmatigAfvinken && item.status !== 'afgevinkt' && (
                    <button type='button' className='ut-knop' disabled={!!actie} onClick={() => void zetControle(item.id, 'afgevinkt')}>
                      <Check size={14} aria-hidden='true' />
                      {tr(lang, 'Підтвердити', 'Bevestigen')}
                    </button>
                  )}
                  {(item.status === 'afgevinkt' || item.status === 'overgeslagen') && (
                    <button type='button' className='ut-knop' disabled={!!actie} onClick={() => void zetControle(item.id, 'open')}>
                      <RotateCcw size={14} aria-hidden='true' />
                      {tr(lang, 'Скинути', 'Heropenen')}
                    </button>
                  )}
                  {!isAfgerond && skipItem?.id !== item.id && (
                    <button type='button' className='ut-knop' disabled={!!actie} onClick={() => setSkipItem({ id: item.id, reden: '' })}>
                      {tr(lang, 'Пропустити', 'Overslaan')}
                    </button>
                  )}
                  {item.herkomst === 'eigenaar' && (
                    <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!actie} onClick={() => void verwijderControle(item.id)}>
                      <Trash2 size={14} aria-hidden='true' />
                      {tr(lang, 'Видалити', 'Verwijderen')}
                    </button>
                  )}
                </div>

                {skipItem?.id === item.id && (
                  <div className='ut-stroom-form'>
                    <label>
                      <span>{item.verplicht ? tr(lang, 'Обґрунтована причина пропуску (мін. 10 символів)', 'Onderbouwde reden voor overslaan (min. 10 tekens)') : tr(lang, 'Причина пропуску (необов’язково)', 'Reden voor overslaan (optioneel)')}</span>
                      <input
                        type='text'
                        maxLength={500}
                        value={skipItem.reden}
                        onChange={(e) => setSkipItem({ id: item.id, reden: e.target.value })}
                      />
                    </label>
                    <div className='ut-stroom-punt-acties'>
                      <button type='button' className='ut-knop ut-knop-primair' disabled={!!actie} onClick={() => void zetControle(item.id, 'overgeslagen', skipItem.reden)}>
                        {tr(lang, 'Підтвердити пропуск', 'Overslaan opslaan')}
                      </button>
                      <button type='button' className='ut-knop' onClick={() => setSkipItem(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Блок 3: Автоматичні докази перевірок і криптографічний ланцюжок */}
      <section className='ut-stroom-sectie' aria-labelledby='ut-stroom-bewijs-titel'>
        <div className='ut-stroom-sectie-kop'>
          <h3 id='ut-stroom-bewijs-titel'><FileCheck2 size={18} aria-hidden='true' /> {tr(lang, 'Автоматичні докази перевірок', 'Automatisch bewijs van controles')} ({stand.bewijzen.length})</h3>
          <button type='button' className='ut-knop' disabled={stand.bewijzen.length === 0} onClick={() => void verifieerInBrowser()}>
            <ShieldCheck size={15} aria-hidden='true' />
            {tr(lang, 'Перевірити хеші у браузері', 'Hashes in browser controleren')}
          </button>
        </div>

        {klantKeten && (
          <p className='ut-notice' data-ok={klantKeten.ok} role='status'>
            <span>{klantKeten.tekst}</span>
          </p>
        )}

        {stand.bewijzen.length === 0 ? (
          <p className='ut-leeg'>{tr(lang, 'Поки що для цієї версії немає записаних доказів. Натисніть «Перезібрати докази» або запустіть перевірку вимог/завантаження.', 'Nog geen bewijs vastgelegd voor deze versie. Klik op «Bewijs verzamelen» of start een vereistencontrole.')}</p>
        ) : (
          <ul className='ut-stroom-lijst'>
            {stand.bewijzen.map((b: StroomBewijs) => (
              <li key={b.id} className='ut-stroom-punt' data-status={b.status} data-bewijs-soort={b.soort}>
                <div className='ut-stroom-punt-boven'>
                  <div className='ut-stroom-punt-titel'>
                    <strong>{b.soort} · <span className='ut-mono'>{b.bron}</span></strong>
                    <small>{lang === 'uk' ? b.samenvattingUk : b.samenvattingNl}</small>
                  </div>
                  <div className='ut-stroom-punt-labels'>
                    <span className='ut-stroom-status-pil' data-status={b.status}>{b.status}</span>
                    {b.integriteitOk === false && <span className='ut-stroom-status-pil' data-status='mislukt'>{tr(lang, 'ПОМИЛКА_ХЕШУ', 'HASH_FOUT')}</span>}
                  </div>
                </div>
                <div className='ut-stroom-bewijs-meta'>
                  <span>{datumLang(lang, b.aangemaaktOp)}</span>
                  {b.pakketSha256 && <span>sha256: <code>{b.pakketSha256.slice(0, 16)}…</code></span>}
                  <span>bewijs_hash: <code>{b.bewijsHash.slice(0, 16)}…</code></span>
                  {b.vorigeHash && <span>vorige_hash: <code>{b.vorigeHash.slice(0, 12)}…</code></span>}
                  <button type='button' className='ut-knop' onClick={() => kopieer(`h-${b.id}`, b.bewijsHash)}>
                    {gekopieerd === `h-${b.id}` ? <Check size={13} aria-hidden='true' /> : <ClipboardCopy size={13} aria-hidden='true' />}
                    {tr(lang, 'Хеш', 'Hash')}
                  </button>
                </div>
                <details>
                  <summary>{tr(lang, 'Технічні деталі доказу (очищені)', 'Technische bewijsgegevens (opgeschoond)')}</summary>
                  <pre className='ut-pre'>{JSON.stringify(b.bewijsData, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Блок 4: Нотатки розгортання */}
      <section className='ut-stroom-sectie' aria-labelledby='ut-stroom-notities-titel'>
        <div className='ut-stroom-sectie-kop'>
          <h3 id='ut-stroom-notities-titel'>{tr(lang, 'Нотатки та інженерний журнал випуску', 'Uitrolnotities en bevindingen')} ({stand.notities.length}) <HulpVraag k='uitrol.stroom-vastpinnen' lang={lang} /></h3>
          <button
            type='button'
            className='ut-knop'
            onClick={() => setNotitieForm({ open: !notitieForm.open, id: '', titel: '', inhoud: '', risico: 'normaal', vastgepind: false })}
          >
            <Plus size={15} aria-hidden='true' />
            {tr(lang, 'Додати нотатку', 'Notitie toevoegen')}
          </button>
        </div>

        {notitieForm.open && (
          <form className='ut-stroom-form' onSubmit={(e) => void bewaarNotitie(e)}>
            <div className='ut-stroom-form-rij'>
              <label>
                <span>{tr(lang, 'Заголовок нотатки', 'Titel van de notitie')}</span>
                <input
                  type='text'
                  required
                  maxLength={220}
                  value={notitieForm.titel}
                  onChange={(e) => setNotitieForm((f) => ({ ...f, titel: e.target.value }))}
                  placeholder={tr(lang, 'Короткий висновок або нагадування', 'Korte samenvatting of aandachtspunt')}
                />
              </label>
              <label>
                <span>{tr(lang, 'Важливість', 'Risico / ernst')}</span>
                <select data-hulp-vrij='keuze' value={notitieForm.risico} onChange={(e) => setNotitieForm((f) => ({ ...f, risico: e.target.value as StroomRisico }))}>
                  <option value='laag'>{risicoTekst(lang, 'laag')}</option>
                  <option value='normaal'>{risicoTekst(lang, 'normaal')}</option>
                  <option value='verhoogd'>{risicoTekst(lang, 'verhoogd')}</option>
                  <option value='kritiek'>{risicoTekst(lang, 'kritiek')}</option>
                </select>
              </label>
            </div>
            <label>
              <span>{tr(lang, 'Текст нотатки (таємниці, ключі та паролі очищуються автоматично)', 'Inhoud van de notitie (geheimen, sleutels en wachtwoorden worden automatisch verwijderd)')}</span>
              <textarea
                required
                rows={3}
                maxLength={6000}
                value={notitieForm.inhoud}
                onChange={(e) => setNotitieForm((f) => ({ ...f, inhoud: e.target.value }))}
              />
            </label>
            <label className='ut-stroom-check'>
              <input data-hulp='uitrol.stroom-vastpinnen' type='checkbox' checked={notitieForm.vastgepind} onChange={(e) => setNotitieForm((f) => ({ ...f, vastgepind: e.target.checked }))} />
              <span>{tr(lang, 'Закріпити вгорі списку', 'Bovenaan vastpinnen')}</span>
            </label>
            <div className='ut-stroom-punt-acties'>
              <button type='submit' className='ut-knop ut-knop-primair' disabled={actie === 'notitie'}>{tr(lang, 'Зберегти нотатку', 'Notitie opslaan')}</button>
              <button type='button' className='ut-knop' onClick={() => setNotitieForm({ open: false, id: '', titel: '', inhoud: '', risico: 'normaal', vastgepind: false })}>
                {tr(lang, 'Скасувати', 'Annuleren')}
              </button>
            </div>
          </form>
        )}

        <ul className='ut-stroom-lijst'>
          {stand.notities.map((n: StroomNotitie) => (
            <li key={n.id} className='ut-stroom-notitie' data-gepind={n.vastgepind}>
              <div className='ut-stroom-punt-boven'>
                <div className='ut-stroom-punt-titel'>
                  <strong>{n.vastgepind ? '📌 ' : ''}{lang === 'uk' ? n.titelUk : n.titelNl}</strong>
                  <small>{n.soort === 'ai-duiding' ? tr(lang, 'Автоматичний аналіз системи', 'Automatische systeemanalyse') : `${n.auteur} · ${datumLang(lang, n.bijgewerktOp)}`}</small>
                </div>
                <span className='ut-stroom-risico' data-risico={n.risico}>{risicoTekst(lang, n.risico)}</span>
              </div>
              <p className='ut-stroom-notitie-inhoud'>{lang === 'uk' ? n.inhoudUk : n.inhoudNl}</p>
              {n.soort !== 'ai-duiding' && (
                <div className='ut-stroom-punt-acties'>
                  <button type='button' className='ut-knop' disabled={!!actie} onClick={() => void pinNotitie(n)}>
                    <Pin size={14} aria-hidden='true' />
                    {n.vastgepind ? tr(lang, 'Відкріпити', 'Losmaken') : tr(lang, 'Закріпити', 'Vastpinnen')}
                  </button>
                  <button
                    type='button'
                    className='ut-knop'
                    onClick={() =>
                      setNotitieForm({
                        open: true,
                        id: n.id,
                        titel: lang === 'uk' ? n.titelUk : n.titelNl,
                        inhoud: lang === 'uk' ? n.inhoudUk : n.inhoudNl,
                        risico: n.risico,
                        vastgepind: n.vastgepind,
                      })
                    }
                  >
                    {tr(lang, 'Редагувати', 'Bewerken')}
                  </button>
                  <button type='button' className='ut-knop ut-knop-gevaar' disabled={!!actie} onClick={() => void verwijderNotitie(n)}>
                    <Trash2 size={14} aria-hidden='true' />
                    {tr(lang, 'Видалити', 'Verwijderen')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
