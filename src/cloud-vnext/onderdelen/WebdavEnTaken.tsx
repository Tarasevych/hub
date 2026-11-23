// Компоненти підключення власних сховищ WebDAV (Nextcloud / NAS) та керування правилами автоматизацій
// перенесення файлів у Хмарному сховищі (uk + nl).
// WebDAV-koppelpaneel (Nextcloud / NAS) en beheer van automatiseringsregels in Cloud vNext.

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderSync,
  Link2,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  CLOUD_SOORT_LABEL,
  cloudTekst,
  type CloudAutomatiseringRegel,
  type CloudAutomatiseringRichting,
  type CloudSoort,
  type CloudWebdavAanbieder,
  type CloudWebdavIngang,
  type CloudWebdavKoppeling,
} from '../../../shared/cloud-vnext-model';
import type { CloudTaak } from '../../../shared/cloud-overdracht-model';
import { cloudClient } from '../cloud-client';
import { cloudVnextUitbreidingClient, webdavFoutTekst } from '../cloud-vnext-client';
import { locale, tr, type Lang } from '../tekst';

const formatGrootte = (lang: Lang, bytes: number | null): string => {
  if (bytes === null || !Number.isFinite(bytes)) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} ${tr(lang, 'ГБ', 'GB')}`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} ${tr(lang, 'МБ', 'MB')}`;
  if (bytes >= 1e3) return `${Math.max(1, Math.round(bytes / 1e3))} ${tr(lang, 'КБ', 'KB')}`;
  return `${bytes} ${tr(lang, 'Б', 'B')}`;
};

export function WebdavAanbiederVeld({
  lang,
  aanbieder,
  koppelingen,
  opGewijzigd,
}: {
  lang: Lang;
  aanbieder: CloudWebdavAanbieder;
  koppelingen: CloudWebdavKoppeling[];
  opGewijzigd: () => Promise<void> | void;
}) {
  const eigenKoppelingen = koppelingen.filter((k) => k.aanbieder === aanbieder && k.status !== 'revoked');
  const [naam, setNaam] = useState('');
  const [adres, setAdres] = useState('');
  const [gebruikersnaam, setGebruikersnaam] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [fout, setFout] = useState('');

  const [openId, setOpenId] = useState<string | null>(null);
  const [pad, setPad] = useState('/');
  const [ingangen, setIngangen] = useState<CloudWebdavIngang[]>([]);
  const [mapLaden, setMapLaden] = useState(false);
  const [bevestigId, setBevestigId] = useState<string | null>(null);

  const laadMap = async (id: string, doelPad: string) => {
    setMapLaden(true);
    setFout('');
    try {
      const r = await cloudVnextUitbreidingClient.webdavMappen(id, doelPad);
      setOpenId(id);
      setPad(r.pad);
      setIngangen(r.ingangen);
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setMapLaden(false);
    }
  };

  const testNieuw = async () => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const r = await cloudVnextUitbreidingClient.webdavTesten({
        aanbieder,
        naam: naam.trim() || undefined,
        adres: adres.trim(),
        gebruikersnaam: gebruikersnaam.trim(),
        wachtwoord,
      });
      setMelding(
        tr(
          lang,
          `З’єднання успішне: у кореневій теці знайдено елементів: ${r.aantalIngangen}.`,
          `Verbinding geslaagd: ${r.aantalIngangen} onderdelen in de hoofdmap gevonden.`,
        ),
      );
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const koppelNieuw = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await cloudVnextUitbreidingClient.webdavKoppelen({
        aanbieder,
        naam: naam.trim() || undefined,
        adres: adres.trim(),
        gebruikersnaam: gebruikersnaam.trim(),
        wachtwoord,
      });
      setWachtwoord('');
      setAdres('');
      setNaam('');
      setGebruikersnaam('');
      setMelding(tr(lang, 'Сховище WebDAV успішно підключено.', 'WebDAV-opslag is gekoppeld.'));
      await opGewijzigd();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const testBestaand = async (id: string) => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const r = await cloudVnextUitbreidingClient.webdavTesten({ id });
      setMelding(
        tr(
          lang,
          `Зв’язок підтверджено (елементів у корені: ${r.aantalIngangen}).`,
          `Verbinding bevestigd (${r.aantalIngangen} onderdelen in de hoofdmap).`,
        ),
      );
      await opGewijzigd();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const ontkoppel = async (id: string) => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await cloudVnextUitbreidingClient.webdavOntkoppelen(id);
      if (openId === id) {
        setOpenId(null);
        setIngangen([]);
      }
      setBevestigId(null);
      setMelding(tr(lang, 'Підключення WebDAV від’єднано.', 'WebDAV-koppeling is verwijderd.'));
      await opGewijzigd();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const kruimels = pad.split('/').filter(Boolean);

  return (
    <div className='cvi-webdav' data-cvi-webdav={aanbieder}>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='cvn-melding is-info' role='status'>{melding}</p> : null}

      {eigenKoppelingen.length > 0 ? (
        <ul className='cvi-accounts'>
          {eigenKoppelingen.map((k) => (
            <li key={k.id} data-cvi-webdav-account={k.id}>
              <span className={`cvi-stip is-${k.status === 'connected' ? 'ok' : 'uit'}`} aria-hidden='true' />
              <div className='cvi-webdav-kop'>
                <span className='cvi-account-mail'>{k.naam}</span>
                <small className='cvn-hint'>{k.origin}{k.padVoorvoegsel} · {k.gebruikersnaam}</small>
              </div>
              <div className='cvi-acties'>
                <button type='button' className='cvn-knop is-klein' disabled={bezig || mapLaden} onClick={() => void laadMap(k.id, '/')}>
                  <Folder aria-hidden='true' />
                  {tr(lang, 'Теки', 'Mappen')}
                </button>
                <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => void testBestaand(k.id)}>
                  <RefreshCw aria-hidden='true' />
                  {tr(lang, 'Перевірити', 'Controleren')}
                </button>
                {bevestigId === k.id ? (
                  <>
                    <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => void ontkoppel(k.id)}>
                      <Trash2 aria-hidden='true' />
                      {tr(lang, 'Підтвердити від’єднання', 'Loskoppelen bevestigen')}
                    </button>
                    <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => setBevestigId(null)}>
                      {tr(lang, 'Скасувати', 'Annuleren')}
                    </button>
                  </>
                ) : (
                  <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => setBevestigId(k.id)}>
                    {tr(lang, 'Від’єднати', 'Loskoppelen')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {openId ? (
        <div className='cvi-webdav-mappen' data-cvi-webdav-mappen={openId}>
          <nav className='cvi-kruimels' aria-label={tr(lang, 'Шлях теки WebDAV', 'WebDAV-mappad')}>
            <span className='cvi-kruimel'>
              <button type='button' disabled={kruimels.length === 0 || mapLaden} onClick={() => void laadMap(openId, '/')}>
                {tr(lang, 'Корінь', 'Hoofdmap')}
              </button>
            </span>
            {kruimels.map((deel, idx) => {
              const deelPad = `/${kruimels.slice(0, idx + 1).join('/')}/`;
              return (
                <span key={deelPad} className='cvi-kruimel'>
                  <ChevronRight aria-hidden='true' />
                  <button type='button' disabled={idx === kruimels.length - 1 || mapLaden} onClick={() => void laadMap(openId, deelPad)}>
                    {deel}
                  </button>
                </span>
              );
            })}
          </nav>
          {mapLaden ? (
            <p className='cvn-hint' role='status'><LoaderCircle className='cvi-draai' aria-hidden='true' /> {tr(lang, 'Читаємо вміст теки…', 'Mapinhoud lezen…')}</p>
          ) : ingangen.length === 0 ? (
            <p className='cvn-hint'>{tr(lang, 'У цій теці порожньо.', 'Deze map is leeg.')}</p>
          ) : (
            <div className='cvi-bestanden'>
              {ingangen.map((it) => (
                <div key={it.pad} className={`cvi-bestand${it.map ? ' is-map' : ''}`}>
                  <span className='cvi-bestand-icoon' aria-hidden='true'>
                    {it.map ? <Folder /> : <FileText />}
                  </span>
                  {it.map ? (
                    <button type='button' className='cvn-knop is-klein' onClick={() => void laadMap(openId, it.pad)}>
                      {it.naam}
                    </button>
                  ) : (
                    <strong>{it.naam}</strong>
                  )}
                  <small>{it.map ? tr(lang, 'тека', 'map') : formatGrootte(lang, it.bytes)}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <form className='cvi-webdav-form' onSubmit={(e) => void koppelNieuw(e)}>
        <strong>{tr(lang, 'Підключити сервер HTTPS WebDAV', 'HTTPS-WebDAV-server koppelen')}</strong>
        <div className='cvi-webdav-velden'>
          <label className='cvi-veld'>
            <span>{tr(lang, 'Назва підключення', 'Naam van koppeling')}</span>
            <input
              type='text'
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              maxLength={120}
              placeholder={aanbieder === 'nextcloud' ? 'Nextcloud' : 'Synology / TrueNAS'}
            />
          </label>
          <label className='cvi-veld'>
            <span>{tr(lang, 'Адреса сервера (лише https://)', 'Serveradres (alleen https://)')}</span>
            <input
              type='url'
              required
              value={adres}
              onChange={(e) => setAdres(e.target.value)}
              placeholder={aanbieder === 'nextcloud' ? 'https://wolk.voorbeeld.nl/' : 'https://nas.voorbeeld.nl:5006/'}
            />
          </label>
          <label className='cvi-veld'>
            <span>{tr(lang, 'Ім’я користувача', 'Gebruikersnaam')}</span>
            <input
              type='text'
              required
              autoComplete='username'
              value={gebruikersnaam}
              onChange={(e) => setGebruikersnaam(e.target.value)}
            />
          </label>
          <label className='cvi-veld'>
            <span>{tr(lang, 'Пароль застосунку', 'Toepassingswachtwoord')}</span>
            <input
              type='password'
              required
              autoComplete='new-password'
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
            />
          </label>
        </div>
        <p className='cvn-hint'>
          {tr(
            lang,
            'Створіть окремий пароль застосунку в налаштуваннях безпеки вашого сервера. Пароль шифрується сховищем ключів і ніколи не повертається в оглядач.',
            'Maak een afzonderlijk toepassingswachtwoord aan in de beveiligingsinstellingen van uw server. Het wachtwoord wordt in de sleutelkluis versleuteld en komt nooit terug naar de browser.',
          )}
        </p>
        <div className='cvi-acties'>
          <button
            type='button'
            className='cvn-knop'
            disabled={bezig || !adres.trim() || !gebruikersnaam.trim() || !wachtwoord}
            onClick={() => void testNieuw()}
          >
            <Check aria-hidden='true' />
            {tr(lang, 'Перевірити з’єднання', 'Verbinding controleren')}
          </button>
          <button
            type='submit'
            className='cvn-knop is-hoofd'
            disabled={bezig || !adres.trim() || !gebruikersnaam.trim() || !wachtwoord}
          >
            <Link2 aria-hidden='true' />
            {tr(lang, 'Підключити WebDAV', 'WebDAV koppelen')}
          </button>
        </div>
      </form>
    </div>
  );
}

const FILTER_SOORTEN: ReadonlyArray<CloudSoort | 'alle'> = [
  'alle',
  'afbeelding',
  'document',
  'pdf',
  'werkblad',
  'presentatie',
  'archief',
  'video',
  'audio',
  'tekst',
];

export function AutomatiseringenSectie({
  lang,
  googleAccounts,
  opRegelsAantal,
}: {
  lang: Lang;
  googleAccounts: Array<{ id: string; email: string; status: string }>;
  opRegelsAantal?: (actieveAantal: number) => void;
}) {
  const verbondenDrive = googleAccounts.filter((a) => a.status === 'connected');
  const [regels, setRegels] = useState<CloudAutomatiseringRegel[]>([]);
  const [taken, setTaken] = useState<CloudTaak[]>([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');

  const [naam, setNaam] = useState('');
  const [richting, setRichting] = useState<CloudAutomatiseringRichting>('eigen-naar-drive');
  const [soortActie, setSoortActie] = useState<'kopie' | 'verplaats'>('kopie');
  const [filterSoort, setFilterSoort] = useState<CloudSoort | 'alle'>('alle');
  const [driveAccountId, setDriveAccountId] = useState('');

  useEffect(() => {
    if (!driveAccountId && verbondenDrive[0]?.id) {
      setDriveAccountId(verbondenDrive[0].id);
    }
  }, [driveAccountId, verbondenDrive]);

  const laadAlles = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        cloudVnextUitbreidingClient.automatiseringLijst(),
        cloudClient.taken({ actie: 'lijst' }).catch(() => ({ taken: [] as CloudTaak[] })),
      ]);
      setRegels(r.regels);
      setTaken(t.taken || []);
      opRegelsAantal?.(r.regels.filter((x) => x.actief).length);
      setFout('');
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setLaden(false);
    }
  }, [lang, opRegelsAantal]);

  useEffect(() => {
    void laadAlles();
  }, [laadAlles]);

  const maakRegel = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!naam.trim() || !driveAccountId) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await cloudVnextUitbreidingClient.automatiseringBewaren({
        naam: naam.trim(),
        richting,
        soortActie,
        filterSoort,
        driveAccountId,
        actief: true,
      });
      setNaam('');
      setMelding(tr(lang, 'Правило перенесення збережено.', 'Overdrachtsregel opgeslagen.'));
      await laadAlles();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const wisselActief = async (regel: CloudAutomatiseringRegel) => {
    setBezig(true);
    setFout('');
    try {
      await cloudVnextUitbreidingClient.automatiseringSchakelen(regel.id, !regel.actief);
      await laadAlles();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const voerUit = async (regel: CloudAutomatiseringRegel) => {
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      const uit = await cloudVnextUitbreidingClient.automatiseringUitvoeren(regel.id);
      setMelding(
        tr(
          lang,
          `Правило виконано: поставлено в чергу фонових передач: ${uit.aangemaakt}.`,
          `Regel uitgevoerd: ${uit.aangemaakt} achtergrondoverdrachten in de wachtrij geplaatst.`,
        ),
      );
      await laadAlles();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  const verwijderRegel = async (id: string) => {
    setBezig(true);
    setFout('');
    try {
      await cloudVnextUitbreidingClient.automatiseringVerwijderen(id);
      await laadAlles();
    } catch (e) {
      setFout(webdavFoutTekst(lang, e));
    } finally {
      setBezig(false);
    }
  };

  return (
    <section className='cvn-blok cvi-auto' aria-labelledby='cvi-automatiseringen-kop' data-cvi-automatiseringen=''>
      <h4 id='cvi-automatiseringen-kop' className='cvi-subkop'>
        <FolderSync aria-hidden='true' />
        {tr(lang, 'Правила автоматизацій і черги перенесення', 'Automatiseringsregels en overdrachtswachtrij')}
      </h4>
      <p className='cvn-hint'>
        {tr(
          lang,
          'Створюйте правила копіювання чи переміщення файлів між власним сховищем та підключеним Google Диском у межах поточного простору.',
          'Stel regels in om bestanden te kopiëren of verplaatsen tussen uw eigen opslag en gekoppelde Google Drive binnen de huidige ruimte.',
        )}
      </p>

      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='cvn-melding is-info' role='status'>{melding}</p> : null}

      {laden ? (
        <p className='cvn-hint' role='status'>
          <LoaderCircle className='cvi-draai' aria-hidden='true' /> {tr(lang, 'Завантаження правил…', 'Regels laden…')}
        </p>
      ) : (
        <>
          {regels.length > 0 ? (
            <ul className='cvi-accounts'>
              {regels.map((r) => (
                <li key={r.id} data-cvi-regel={r.id}>
                  <span className={`cvi-stip is-${r.actief ? 'ok' : 'uit'}`} aria-hidden='true' />
                  <div className='cvi-webdav-kop'>
                    <span className='cvi-account-mail'>{r.naam}</span>
                    <small className='cvn-hint'>
                      {r.richting === 'eigen-naar-drive'
                        ? tr(lang, 'Власне сховище → Google Диск', 'Eigen opslag → Google Drive')
                        : tr(lang, 'Google Диск → Власне сховище', 'Google Drive → Eigen opslag')}
                      {' · '}
                      {r.soortActie === 'verplaats' ? tr(lang, 'переміщення', 'verplaatsen') : tr(lang, 'копіювання', 'kopiëren')}
                      {' · '}
                      {r.filterSoort === 'alle'
                        ? tr(lang, 'усі види файлів', 'alle bestandstypen')
                        : cloudTekst(CLOUD_SOORT_LABEL[r.filterSoort], lang)}
                      {r.laatstUitgevoerdOp
                        ? ` · ${tr(lang, 'востаннє', 'laatst')}: ${new Date(r.laatstUitgevoerdOp).toLocaleString(locale(lang))} (${r.laatstTakenAantal})`
                        : ''}
                    </small>
                  </div>
                  <div className='cvi-acties'>
                    <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => void voerUit(r)}>
                      <Play aria-hidden='true' />
                      {tr(lang, 'Запустити зараз', 'Nu uitvoeren')}
                    </button>
                    <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => void wisselActief(r)}>
                      {r.actief ? tr(lang, 'Призупинити', 'Pauzeren') : tr(lang, 'Увімкнути', 'Inschakelen')}
                    </button>
                    <button type='button' className='cvn-knop is-klein' disabled={bezig} onClick={() => void verwijderRegel(r.id)}>
                      <Trash2 aria-hidden='true' />
                      {tr(lang, 'Видалити', 'Verwijderen')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className='cvn-hint'>
              {tr(lang, 'Правил перенесення у цьому просторі ще не створено.', 'Er zijn nog geen overdrachtsregels in deze ruimte ingesteld.')}
            </p>
          )}

          {verbondenDrive.length > 0 ? (
            <form className='cvi-webdav-form' onSubmit={(e) => void maakRegel(e)}>
              <strong>{tr(lang, 'Нове правило перенесення', 'Nieuwe overdrachtsregel')}</strong>
              <div className='cvi-webdav-velden'>
                <label className='cvi-veld'>
                  <span>{tr(lang, 'Назва правила', 'Naam van regel')}</span>
                  <input
                    type='text'
                    required
                    maxLength={120}
                    value={naam}
                    onChange={(e) => setNaam(e.target.value)}
                    placeholder={tr(lang, 'Наприклад: Копія документів на Диск', 'Bijv.: Kopie van documenten naar Drive')}
                  />
                </label>
                <label className='cvi-veld'>
                  <span>{tr(lang, 'Напрямок', 'Richting')}</span>
                  <select value={richting} onChange={(e) => setRichting(e.target.value as CloudAutomatiseringRichting)}>
                    <option value='eigen-naar-drive'>{tr(lang, 'Власне сховище → Google Диск', 'Eigen opslag → Google Drive')}</option>
                    <option value='drive-naar-eigen'>{tr(lang, 'Google Диск → Власне сховище', 'Google Drive → Eigen opslag')}</option>
                  </select>
                </label>
                <label className='cvi-veld'>
                  <span>{tr(lang, 'Дія', 'Handeling')}</span>
                  <select value={soortActie} onChange={(e) => setSoortActie(e.target.value as 'kopie' | 'verplaats')}>
                    <option value='kopie'>{tr(lang, 'Копіювати файли', 'Bestanden kopiëren')}</option>
                    <option value='verplaats'>{tr(lang, 'Переміщувати файли', 'Bestanden verplaatsen')}</option>
                  </select>
                </label>
                <label className='cvi-veld'>
                  <span>{tr(lang, 'Вид файлів', 'Bestandstype')}</span>
                  <select value={filterSoort} onChange={(e) => setFilterSoort(e.target.value as CloudSoort | 'alle')}>
                    {FILTER_SOORTEN.map((s) => (
                      <option key={s} value={s}>
                        {s === 'alle' ? tr(lang, 'Усі файли', 'Alle bestanden') : cloudTekst(CLOUD_SOORT_LABEL[s], lang)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='cvi-veld'>
                  <span>{tr(lang, 'Обліковий запис Google Диску', 'Google Drive-account')}</span>
                  <select value={driveAccountId} onChange={(e) => setDriveAccountId(e.target.value)}>
                    {verbondenDrive.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.email || acc.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className='cvi-acties'>
                <button type='submit' className='cvn-knop is-hoofd' disabled={bezig || !naam.trim() || !driveAccountId}>
                  <Plus aria-hidden='true' />
                  {tr(lang, 'Зберегти правило', 'Regel opslaan')}
                </button>
              </div>
            </form>
          ) : (
            <p className='cvn-hint'>
              {tr(
                lang,
                'Щоб додати правило міжслужбового перенесення, спершу підключіть обліковий запис Google Диску вище.',
                'Koppel hierboven eerst een Google Drive-account om een overdrachtsregel in te stellen.',
              )}
            </p>
          )}

          {taken.length > 0 ? (
            <div className='cvi-auto-taken'>
              <strong>{tr(lang, 'Останні фонові завдання перенесення', 'Recente achtergrondoverdrachten')}</strong>
              <ul className='cvi-accounts'>
                {taken.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <span className={`cvi-stip is-${t.stand === 'klaar' ? 'ok' : 'uit'}`} aria-hidden='true' />
                    <span className='cvi-account-mail'>{t.naam}</span>
                    <span className='cvi-account-status'>{t.stand}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
