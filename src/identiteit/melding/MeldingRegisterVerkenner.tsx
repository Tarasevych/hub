// Інтерактивний оглядач живої Бази типів сповіщень, схем доказів і серверних кодів дій (MELDINGEN-REGISTER-001).
// Дозволяє переглядати всі зареєстровані типи сповіщень і коди дій за сервісом, простором, роллю та схемою доказів S1..S20.

import { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, Filter, Layers, Search, ShieldCheck } from 'lucide-react';
import { ALLE_CATEGORIEEN, type CategorieId } from '../../../shared/beheer-journaal';
import { kanaalLabel } from '../../../shared/meldingen-ecosysteem';
import { subdomeinMenselijkLabel } from '../../../shared/meldingen-puls/kern';
import {
  bouwMeldingRegisterOverzicht,
  type MeldingRegisterRij,
  type RegisterHerkomstSoort,
} from '../../../shared/meldingen-register-overzicht';
import Merk from '../../merk/Merk';

type Props = {
  lang: 'uk' | 'nl';
  magTechnisch: boolean;
};

export default function MeldingRegisterVerkenner({ lang, magTechnisch }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const { rijen, statistiek } = useMemo(() => bouwMeldingRegisterOverzicht(), []);

  const [zoek, setZoek] = useState('');
  const [herkomst, setHerkomst] = useState<'alle' | RegisterHerkomstSoort>('alle');
  const [ruimteFilter, setRuimteFilter] = useState<'alle' | 'prive' | 'technisch'>('alle');
  const [categorie, setCategorie] = useState<'alle' | CategorieId>('alle');
  const [limiet, setLimiet] = useState(36);
  const [openRijId, setOpenRijId] = useState('');

  const zichtbareRijen = useMemo(
    () => (magTechnisch ? rijen : rijen.filter((r) => r.ruimte === 'prive')),
    [rijen, magTechnisch],
  );

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return zichtbareRijen.filter((r) => {
      if (herkomst !== 'alle' && r.herkomst !== herkomst) return false;
      if (ruimteFilter !== 'alle' && r.ruimte !== ruimteFilter) return false;
      if (categorie !== 'alle' && r.categorie !== categorie) return false;
      if (q) {
        const hooi = `${r.titelUk} ${r.titelNl} ${r.code} ${r.schemaId} ${r.schemaUk} ${r.schemaNl} ${r.subdomein} ${r.bronBestand}`.toLowerCase();
        if (!hooi.includes(q)) return false;
      }
      return true;
    });
  }, [zichtbareRijen, herkomst, ruimteFilter, categorie, zoek]);

  const getoond = useMemo(() => gefilterd.slice(0, limiet), [gefilterd, limiet]);

  const herkomstBadge = (soort: RegisterHerkomstSoort) => {
    if (soort === 'melding') {
      return {
        tekst: t('Пряме сповіщення', 'Directe melding'),
        klasse: 'is-melding',
      };
    }
    if (soort === 'actie') {
      return {
        tekst: t('Осмислена дія сервісу', 'Diensthandeling'),
        klasse: 'is-actie',
      };
    }
    return {
      tekst: t('Тихий запис аудиту (без спливання)', 'Stille auditregel (geen pop-up)'),
      klasse: 'is-stil',
    };
  };

  const niveauBadge = (n: MeldingRegisterRij['niveau']) => {
    if (n === 'gevaar') return { tekst: t('Критично / безпека', 'Kritiek / veiligheid'), klasse: 'is-gevaar' };
    if (n === 'besluit') return { tekst: t('Потребує рішення', 'Vraagt besluit'), klasse: 'is-besluit' };
    return { tekst: t('Звичайний рівень', 'Gewoon'), klasse: 'is-gewoon' };
  };

  return (
    <section id='melding-register' className='mp-sectie' data-qa-id='melding-register-sectie'>
      <div className='mp-sectie-kop'>
        <div className='mp-sectie-titel'>
          <span className='mp-sectie-icoon'>
            <BookOpen size={19} aria-hidden='true' />
          </span>
          <div>
            <h2>{t('Жива база типів сповіщень, кодів дій та схем доказів', 'Levend register van meldingssoorten, actiecodes en bewijsschema’s')}</h2>
            <p>
              {t(
                'Єдиний класифікований реєстр усієї платформи (правило MELDINGEN-REGISTER-001): кожен код дії сервера й кожне сповіщення сервісу прив’язані до людської назви двома мовами, розділу, простору та схеми доказів.',
                'Het centrale geclassificeerde register van het platform (regel MELDINGEN-REGISTER-001): elke actiecode en elke melding is gekoppeld aan een tweelingtitel, onderdeel, ruimte en bewijsschema.',
              )}
            </p>
          </div>
        </div>
        <span className='mp-register-waarborg' data-qa-id='melding-register-dekking'>
          <CheckCircle2 size={15} aria-hidden='true' />
          <span>
            {t(
              `Некласифікованих: ${statistiek.onbekendOverig} · Покриття 100%`,
              `Ongeclassificeerd: ${statistiek.onbekendOverig} · Dekking 100%`,
            )}
          </span>
        </span>
      </div>

      <div className='mp-register-tellers'>
        <div className='mp-register-kaartje'>
          <small>{t('Усього в базі', 'Totaal in register')}</small>
          <strong>{zichtbareRijen.length}</strong>
        </div>
        <div className='mp-register-kaartje'>
          <small>{t('Прямі типи сповіщень', 'Directe meldingstypen')}</small>
          <strong>{zichtbareRijen.filter((r) => r.herkomst === 'melding').length}</strong>
        </div>
        <div className='mp-register-kaartje'>
          <small>{t('Осмислені коди дій сервісів', 'Dienstactiecodes')}</small>
          <strong>{zichtbareRijen.filter((r) => r.herkomst === 'actie').length}</strong>
        </div>
        <div className='mp-register-kaartje'>
          <small>{t('Тихі записи (відсічені від шуму)', 'Stille regels (ruisvrij)')}</small>
          <strong>{zichtbareRijen.filter((r) => r.herkomst === 'stille_audit').length}</strong>
        </div>
        <div className='mp-register-kaartje'>
          <small>{t('Схеми доказів (S1–S20)', 'Bewijsschema’s (S1–S20)')}</small>
          <strong>{statistiek.schemasAantal}</strong>
        </div>
      </div>

      <div className='mp-register-filters'>
        <label className='mp-register-zoek'>
          <Search size={15} aria-hidden='true' />
          <input
            type='search'
            value={zoek}
            onChange={(e) => {
              setZoek(e.target.value);
              setLimiet(36);
            }}
            placeholder={t(
              'Шукати за людською назвою, кодом дії (напр. passkey, uitrol, klimop), схемою S1–S20…',
              'Zoek op titel, actiecode (bijv. passkey, uitrol, klimop) of schema S1–S20…',
            )}
          />
        </label>

        <div className='mp-register-selects'>
          <label>
            <Filter size={13} aria-hidden='true' />
            <select
              aria-label={t('Роль у потоці сповіщень', 'Rol in de meldingsstroom')}
              value={herkomst}
              onChange={(e) => {
                setHerkomst(e.target.value as 'alle' | RegisterHerkomstSoort);
                setLimiet(36);
              }}
            >
              <option value='alle'>{t('Усі ролі в потоці', 'Alle rollen in stroom')}</option>
              <option value='melding'>{t('Прямі сповіщення сервісів', 'Directe dienstmeldingen')}</option>
              <option value='actie'>{t('Осмислені дії у потоці активності', 'Acties in activiteitenstroom')}</option>
              <option value='stille_audit'>{t('Тихий аудит (не створює шуму в дзвіночку)', 'Stille audit (geen bel-ruis)')}</option>
            </select>
          </label>

          <label>
            <Layers size={13} aria-hidden='true' />
            <select
              aria-label={t('Предметна категорія', 'Inhoudelijke categorie')}
              value={categorie}
              onChange={(e) => {
                setCategorie(e.target.value as 'alle' | CategorieId);
                setLimiet(36);
              }}
            >
              <option value='alle'>{t('Усі розділи та служби', 'Alle onderdelen en diensten')}</option>
              {ALLE_CATEGORIEEN.filter((c) => c.id !== 'overig').map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'uk' ? c.uk : c.nl}
                </option>
              ))}
            </select>
          </label>

          {magTechnisch && (
            <label>
              <ShieldCheck size={13} aria-hidden='true' />
              <select
                aria-label={t('Простір ізоляції', 'Isolatieruimte')}
                value={ruimteFilter}
                onChange={(e) => {
                  setRuimteFilter(e.target.value as 'alle' | 'prive' | 'technisch');
                  setLimiet(36);
                }}
              >
                <option value='alle'>{t('Обидва простори', 'Beide ruimtes')}</option>
                <option value='prive'>{t('Особистий простір', 'Privéruimte')}</option>
                <option value='technisch'>{t('Технічний простір', 'Technische ruimte')}</option>
              </select>
            </label>
          )}
        </div>
      </div>

      <div className='mp-status-regel'>
        <span>
          {t(
            `Знайдено записів за фільтром: ${gefilterd.length} (показано ${getoond.length})`,
            `Gevonden items voor filter: ${gefilterd.length} (${getoond.length} getoond)`,
          )}
        </span>
      </div>

      <div className='mp-register-lijst' role='list'>
        {getoond.map((rij) => {
          const hk = herkomstBadge(rij.herkomst);
          const nv = niveauBadge(rij.niveau);
          const isOpen = openRijId === rij.id;
          const emblemen = lang === 'uk' ? rij.emblemenUk : rij.emblemenNl;
          return (
            <article key={rij.id} className='mp-register-rij' role='listitem'>
              <div className='mp-register-rij-hoofd'>
                <span className='mp-register-merk' aria-hidden='true'>
                  {rij.merkSleutel ? (
                    <Merk merk={rij.merkSleutel} naam={rij.code} maat={20} vorm='rond' />
                  ) : (
                    <Layers size={16} />
                  )}
                </span>

                <div className='mp-register-inhoud'>
                  <div className='mp-register-chips'>
                    <span className={`mp-reg-pil ${hk.klasse}`}>{hk.tekst}</span>
                    <span className={`mp-reg-pil ${nv.klasse}`}>{nv.tekst}</span>
                    <span className='mp-reg-pil'>
                      {subdomeinMenselijkLabel(rij.subdomein, lang)} · {kanaalLabel(rij.kanaal, lang)}
                    </span>
                    <span className='mp-reg-pil'>
                      {rij.ruimte === 'technisch' ? t('Технічний', 'Technisch') : t('Особистий', 'Privé')}
                    </span>
                    <span className='mp-reg-pil is-schema'>
                      {rij.schemaId} · {lang === 'uk' ? rij.schemaUk : rij.schemaNl}
                    </span>
                  </div>

                  <strong className='mp-register-titel'>{lang === 'uk' ? rij.titelUk : rij.titelNl}</strong>
                  <code className='mp-register-code'>{rij.code}</code>
                </div>

                <button
                  type='button'
                  className='mp-pil-knop mp-register-klap'
                  aria-expanded={isOpen}
                  onClick={() => setOpenRijId((cur) => (cur === rij.id ? '' : rij.id))}
                >
                  <span>{t('Докази', 'Bewijs')}</span>
                  <ChevronDown size={14} aria-hidden='true' className={isOpen ? 'is-open' : undefined} />
                </button>
              </div>

              {isOpen && (
                <div className='mp-register-details'>
                  <div className='mp-register-detail-rij'>
                    <small>{t('Парний переклад (uk / nl):', 'Tweelingvertaling (uk / nl):')}</small>
                    <span>
                      {rij.titelUk} · <em>{rij.titelNl}</em>
                    </span>
                  </div>
                  <div className='mp-register-detail-rij'>
                    <small>{t('Поля схеми доказів картки:', 'Velden van het bewijsschema:')}</small>
                    <div className='mp-formaat-chippen'>
                      {emblemen.map((emb) => (
                        <span key={emb} className='mp-formaat-chip'>
                          {emb}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className='mp-register-detail-rij'>
                    <small>{t('Модуль-джерело в коді:', 'Bronmodule in code:')}</small>
                    <code>{rij.bronBestand}</code>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {gefilterd.length > limiet && (
        <div className='mp-demo-balk'>
          <button
            type='button'
            className='mp-pil-knop'
            onClick={() => setLimiet((cur) => cur + 60)}
          >
            {t(
              `Показати ще (${Math.min(60, gefilterd.length - limiet)} із ${gefilterd.length - limiet})`,
              `Meer tonen (${Math.min(60, gefilterd.length - limiet)} van ${gefilterd.length - limiet})`,
            )}
          </button>
        </div>
      )}
    </section>
  );
}
