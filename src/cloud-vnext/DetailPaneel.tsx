// Detailpaneel van één bestand (laag rechts; op de telefoon een volledig scherm): voorbeeld via de BESTAANDE
// voorbeeldmotor van de mail/Drive (src/MailBijlageVoorbeeld.tsx, lui geladen — dezelfde weg als src/DriveBrowser.tsx),
// metadata, labels bewerken, versies (terugzetten/bewaren) en de handelingen. Groter dan de downloadgrens → eerlijk
// «geen voorbeeld», zonder te doen alsof. Alle teksten uk/nl; sluiten met Esc regelt Laag.
import { Suspense, lazy, useEffect, useState } from 'react';
import { Check, Download, History, LoaderCircle, Pencil, RotateCcw, Star, Trash2, X } from 'lucide-react';
import { CLOUD_VNEXT_LIMIETEN, schoneNaam, schoneTag, type CloudBestand, type CloudMap, type CloudVersie } from '../../shared/cloud-vnext-model';
import type { MailAttachmentPreview } from '../MailBijlageVoorbeeld';
import { CloudFout, cloudClient } from './cloud-client';
import { SOORT_ICOON, bewaarBlob, cloudFoutTekst, vanB64 } from './hulp';
import Laag from './Laag';
import { bytesTekst, datumTekst, soortTekst, tr, type Lang } from './tekst';

const PreviewBody = lazy(() => import('../MailBijlageVoorbeeld').then((m) => ({ default: m.MailAttachmentPreviewBody })));
const voorbeeldMotor = () => import('../MailBijlageVoorbeeld');

type Props = {
  lang: Lang; smal: boolean; bestand: CloudBestand; pad: CloudMap[]; wsTitel?: string; prullenbak: boolean;
  onSluit: () => void; onBijgewerkt: (b: CloudBestand | null) => void; toon: (t: string) => void;
};

export default function DetailPaneel({ lang, smal, bestand: b, pad, wsTitel, prullenbak, onSluit, onBijgewerkt, toon }: Props) {
  const [voorbeeld, setVoorbeeld] = useState<MailAttachmentPreview | null>(null);
  const [voorbeeldFout, setVoorbeeldFout] = useState('');
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [besig, setBesig] = useState(false);
  const [hernoem, setHernoem] = useState('');          // '' = niet aan het hernoemen
  const [hernoemAan, setHernoemAan] = useState(false);
  const [tagInvoer, setTagInvoer] = useState('');
  const [versies, setVersies] = useState<CloudVersie[] | null>(null);
  const [versiesOpen, setVersiesOpen] = useState(false);
  const [wisVraag, setWisVraag] = useState(false);      // bevestiging «definitief» — in het paneel, nooit een browser-popup
  const teGroot = b.kind !== 'link' && b.bytes > CLOUD_VNEXT_LIMIETEN.downloadMaxBytes;
  const grootTekst = tr(lang,
    `Передперегляд недоступний: файл більший за ${bytesTekst(lang, CLOUD_VNEXT_LIMIETEN.downloadMaxBytes)} — ліміт одного завантаження в цьому випуску (без стрімів).`,
    `Geen voorvertoning: het bestand is groter dan ${bytesTekst(lang, CLOUD_VNEXT_LIMIETEN.downloadMaxBytes)} — de grens van één download in deze release (geen stream).`);

  useEffect(() => {
    let actief = true; let geladen: MailAttachmentPreview | null = null;
    setVoorbeeld(null); setVoorbeeldFout(''); setVersies(null); setVersiesOpen(false); setWisVraag(false); setHernoemAan(false);
    if (b.kind === 'link' || teGroot) return;
    setLaden(true);
    (async () => {
      try {
        const d = await cloudClient.download(b.id);
        const motor = await voorbeeldMotor();
        const blob = new Blob([vanB64(d.data) as unknown as BlobPart], { type: d.mime || 'application/octet-stream' });
        const p = await motor.loadMailAttachmentPreviewFromBlob({ blob, filename: d.naam || b.naam, contentType: d.mime || 'application/octet-stream' });
        if (!actief) { motor.revokeMailAttachmentPreview(p); return; }
        geladen = p; setVoorbeeld(p);
      } catch (e) {
        if (!actief) return;
        if (e instanceof CloudFout && e.code === 'TE_GROOT') setVoorbeeldFout(grootTekst);
        else setVoorbeeldFout(cloudFoutTekst(lang, e));
      } finally { if (actief) setLaden(false); }
    })();
    return () => { actief = false; if (geladen) { const p = geladen; void voorbeeldMotor().then((m) => m.revokeMailAttachmentPreview(p)); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id]);

  const doe = async (werk: () => Promise<void>) => {
    setBesig(true); setFout('');
    try { await werk(); } catch (e) { setFout(cloudFoutTekst(lang, e)); }
    finally { setBesig(false); }
  };
  const downloadHeel = (versie?: string) => doe(async () => {
    const d = await cloudClient.download(b.id, versie);
    bewaarBlob(d.naam || b.naam, new Blob([vanB64(d.data) as unknown as BlobPart], { type: d.mime || 'application/octet-stream' }));
  });
  const favoriet = () => doe(async () => { await cloudClient.bestandFavoriet([b.id], !b.favoriet); onBijgewerkt({ ...b, favoriet: !b.favoriet }); });
  const hernoemBewaar = () => {
    const naam = schoneNaam(hernoem);
    if (!naam) { setFout(tr(lang, 'Назва порожня або задовга.', 'De naam is leeg of te lang.')); return; }
    void doe(async () => { const n = await cloudClient.bestandHernoem(b.id, naam); setHernoemAan(false); onBijgewerkt(n); toon(tr(lang, 'Перейменовано.', 'Hernoemd.')); });
  };
  const tagsBewaar = (tags: string[]) => doe(async () => { const n = await cloudClient.bestandTags(b.id, tags); onBijgewerkt(n); });
  const tagToe = () => {
    const t = schoneTag(tagInvoer);
    if (!t) { setFout(tr(lang, 'Теґ порожній або задовгий (до 40 символів).', 'Het label is leeg of te lang (tot 40 tekens).')); return; }
    if (b.tags.includes(t)) { setTagInvoer(''); return; }
    if (b.tags.length >= CLOUD_VNEXT_LIMIETEN.tagsMax) { setFout(tr(lang, `До ${CLOUD_VNEXT_LIMIETEN.tagsMax} теґів на файл.`, `Tot ${CLOUD_VNEXT_LIMIETEN.tagsMax} labels per bestand.`)); return; }
    setTagInvoer(''); void tagsBewaar([...b.tags, t]);
  };
  const versiesLaad = () => doe(async () => { setVersies(await cloudClient.versies(b.id)); setVersiesOpen(true); });

  const Icoon = SOORT_ICOON[b.soort];
  // Het kruimelpad hoort bij de lijst waaruit het paneel opende; klopt het niet met de map van het bestand (bv. geopend
  // vanuit het Overzicht), dan zeggen we dat eerlijk in plaats van een verkeerd pad te tonen.
  const padKlopt = (pad.length ? pad[pad.length - 1].id : null) === (b.mapId || null);
  const mapTekst = !b.mapId ? tr(lang, 'Корінь', 'Wortel') : padKlopt ? pad.map((m) => m.naam).join(' / ') : tr(lang, 'у теці (видно в «Мої файли»)', 'in een map (zichtbaar in «Mijn bestanden»)');
  const koppeling = b.kind === 'link' && /^https?:\/\//i.test(b.url || '') ? b.url : '';

  return (
    <Laag lang={lang} soort={smal ? 'scherm' : 'paneel'} titel={b.naam} onSluit={onSluit} data={{ 'cvn-detail': b.id }}>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}

      <div className='cvn-detail-acties' data-cvn-acties='detail' role='group' aria-label={tr(lang, 'Дії з файлом', 'Acties met het bestand')}>
        {b.kind !== 'link' ? <button type='button' className='cvn-knop' disabled={besig} onClick={() => void downloadHeel()}><Download aria-hidden='true' />{tr(lang, 'Завантажити', 'Downloaden')}</button> : null}
        <button type='button' className={`cvn-knop${b.favoriet ? ' is-actief' : ''}`} data-cvn-favoriet={b.id} aria-pressed={b.favoriet} disabled={besig} onClick={() => void favoriet()}><Star aria-hidden='true' />{b.favoriet ? tr(lang, 'В обраному', 'Favoriet') : tr(lang, 'До обраного', 'Favoriet maken')}</button>
        {!prullenbak ? <button type='button' className='cvn-knop' disabled={besig} onClick={() => { setHernoemAan(true); setHernoem(b.naam); }}><Pencil aria-hidden='true' />{tr(lang, 'Перейменувати', 'Hernoemen')}</button> : null}
        {!prullenbak
          ? <button type='button' className='cvn-knop is-stil' data-cvn-prullenbak={b.id} disabled={besig} onClick={() => void doe(async () => { await cloudClient.naarPrullenbak([b.id]); onBijgewerkt(null); toon(tr(lang, 'Переміщено в кошик (30 днів).', 'Naar de prullenbak (30 dagen).')); })}><Trash2 aria-hidden='true' />{tr(lang, 'У кошик', 'Prullenbak')}</button>
          : <>
            <button type='button' className='cvn-knop' data-cvn-herstel={b.id} disabled={besig} onClick={() => void doe(async () => { await cloudClient.herstel([b.id]); onBijgewerkt(null); toon(tr(lang, 'Відновлено.', 'Hersteld.')); })}><RotateCcw aria-hidden='true' />{tr(lang, 'Відновити', 'Herstellen')}</button>
            <button type='button' className='cvn-knop is-stil' data-cvn-definitief={b.id} disabled={besig} onClick={() => setWisVraag(true)}><Trash2 aria-hidden='true' />{tr(lang, 'Видалити назавжди', 'Definitief wissen')}</button>
          </>}
      </div>
      {wisVraag ? (
        <div className='cvn-melding is-fout' role='alertdialog' aria-label={tr(lang, 'Підтвердження видалення', 'Bevestiging van wissen')}>
          <span>{tr(lang, `Видалити «${b.naam}» назавжди? Це незворотно.`, `«${b.naam}» definitief wissen? Dit kan niet terug.`)}</span>
          <button type='button' className='cvn-knop is-klein' onClick={() => void doe(async () => { await cloudClient.definitiefWeg([b.id]); onBijgewerkt(null); toon(tr(lang, 'Видалено назавжди.', 'Definitief gewist.')); })}>{tr(lang, 'Так, видалити', 'Ja, wissen')}</button>
          <button type='button' className='cvn-knop is-klein is-stil' onClick={() => setWisVraag(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </div>
      ) : null}
      {hernoemAan ? (
        <form className='cvn-detail-hernoem' onSubmit={(e) => { e.preventDefault(); hernoemBewaar(); }}>
          <input value={hernoem} maxLength={CLOUD_VNEXT_LIMIETEN.naamMax} onChange={(e) => setHernoem(e.target.value)} aria-label={tr(lang, 'Нова назва', 'Nieuwe naam')} data-cvn-eerste='' />
          <button type='submit' className='cvn-icoonknop' disabled={besig} aria-label={tr(lang, 'Зберегти назву', 'Naam bewaren')}><Check aria-hidden='true' /></button>
          <button type='button' className='cvn-icoonknop' onClick={() => setHernoemAan(false)} aria-label={tr(lang, 'Скасувати', 'Annuleren')}><X aria-hidden='true' /></button>
        </form>
      ) : null}

      <section className='cvn-detail-voorbeeld' data-cvn-detail={b.id} aria-label={tr(lang, 'Передперегляд', 'Voorvertoning')}>
        {koppeling ? <p className='cvn-hint'><a href={koppeling} target='_blank' rel='noreferrer noopener'>{koppeling}</a></p> : null}
        {b.kind === 'link' && !koppeling ? <p className='cvn-hint'>{tr(lang, 'Посилання без адреси http(s) — відкривати нічого.', 'Een link zonder http(s)-adres — niets te openen.')}</p> : null}
        {teGroot ? <p className='cvn-melding is-info' role='status'>{grootTekst}</p> : null}
        {voorbeeldFout ? <p className='cvn-melding is-info' role='status'>{voorbeeldFout}</p> : null}
        {laden ? <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvn-draai' aria-hidden='true' />{tr(lang, 'Готуємо передперегляд…', 'Voorvertoning laden…')}</p> : null}
        {voorbeeld ? (
          <Suspense fallback={<p className='cvn-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>
            <PreviewBody preview={voorbeeld} lang={lang} />
          </Suspense>
        ) : null}
      </section>

      <section className='cvn-detail-meta' aria-label={tr(lang, 'Відомості', 'Gegevens')}>
        <h3><Icoon aria-hidden='true' />{soortTekst(lang, b.soort)}</h3>
        <dl>
          <div><dt>{tr(lang, 'Розмір', 'Grootte')}</dt><dd>{bytesTekst(lang, b.bytes)}</dd></div>
          <div><dt>MIME</dt><dd>{b.mime || '—'}</dd></div>
          <div><dt>SHA-256</dt><dd><code title={b.sha256}>{b.sha256 ? `${b.sha256.slice(0, 12)}…` : '—'}</code></dd></div>
          <div><dt>{tr(lang, 'Створено', 'Aangemaakt')}</dt><dd>{datumTekst(lang, b.aangemaaktOp)}</dd></div>
          <div><dt>{tr(lang, 'Змінено', 'Gewijzigd')}</dt><dd>{datumTekst(lang, b.bijgewerktOp)}</dd></div>
          <div><dt>{tr(lang, 'Тека', 'Map')}</dt><dd>{mapTekst}</dd></div>
          {wsTitel ? <div><dt>{tr(lang, 'Простір', 'Werkruimte')}</dt><dd>{wsTitel}</dd></div> : null}
          {b.bron ? <div><dt>{tr(lang, 'Джерело', 'Bron')}</dt><dd>{b.bron}</dd></div> : null}
          {b.verwijderdOp ? <div><dt>{tr(lang, 'У кошику з', 'In de prullenbak sinds')}</dt><dd>{datumTekst(lang, b.verwijderdOp)}</dd></div> : null}
        </dl>
      </section>

      <section className='cvn-detail-tags' aria-label={tr(lang, 'Теґи', 'Labels')}>
        <h3>{tr(lang, 'Теґи', 'Labels')}</h3>
        <div className='cvn-tags'>
          {b.tags.map((t) => (
            <span key={t} className='cvn-tag' data-cvn-tag={t}>#{t}
              <button type='button' disabled={besig} aria-label={tr(lang, `Прибрати теґ ${t}`, `Label ${t} weghalen`)} onClick={() => void tagsBewaar(b.tags.filter((x) => x !== t))}><X aria-hidden='true' /></button>
            </span>
          ))}
          {!b.tags.length ? <span className='cvn-hint'>{tr(lang, 'Поки без теґів.', 'Nog zonder labels.')}</span> : null}
        </div>
        <form className='cvn-tag-vorm' onSubmit={(e) => { e.preventDefault(); tagToe(); }}>
          <input value={tagInvoer} maxLength={CLOUD_VNEXT_LIMIETEN.tagMax} onChange={(e) => setTagInvoer(e.target.value)} placeholder={tr(lang, 'новий теґ + Enter', 'nieuw label + Enter')} aria-label={tr(lang, 'Новий теґ', 'Nieuw label')} />
          <button type='submit' className='cvn-knop is-klein' disabled={besig}>{tr(lang, 'Додати', 'Toevoegen')}</button>
        </form>
      </section>

      {b.kind === 'file' ? (
        <section className='cvn-detail-versies' aria-label={tr(lang, 'Версії', 'Versies')}>
          <h3><History aria-hidden='true' />{tr(lang, 'Версії', 'Versies')}
            <button type='button' className='cvn-knop is-klein' data-cvn-versies={b.id} disabled={besig} onClick={() => (versiesOpen ? setVersiesOpen(false) : void versiesLaad())}>
              {versiesOpen ? tr(lang, 'Сховати', 'Verbergen') : tr(lang, `Показати (${b.versies})`, `Tonen (${b.versies})`)}
            </button>
          </h3>
          {versiesOpen ? (
            versies && versies.length ? (
              <ul className='cvn-versie-rijen'>
                {versies.map((v) => (
                  <li key={v.pad}>
                    <span>{datumTekst(lang, v.op)}</span><span>{bytesTekst(lang, v.bytes)}</span>
                    <span className='cvn-versie-acties'>
                      <button type='button' className='cvn-knop is-klein' disabled={besig} onClick={() => void doe(async () => { const n = await cloudClient.versieHerstel(b.id, v.pad); onBijgewerkt(n); setVersiesOpen(false); toon(tr(lang, 'Версію відновлено (поточна збережена як версія).', 'Versie teruggezet (de huidige is als versie bewaard).')); })}><RotateCcw aria-hidden='true' />{tr(lang, 'Відновити', 'Terugzetten')}</button>
                      <button type='button' className='cvn-knop is-klein is-stil' disabled={besig} onClick={() => void downloadHeel(v.pad)}><Download aria-hidden='true' />{tr(lang, 'Завантажити', 'Downloaden')}</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className='cvn-hint'>{tr(lang, 'Попередніх версій ще немає — вони з’являться після заміни файлу.', 'Nog geen eerdere versies — die ontstaan zodra het bestand vervangen wordt.')}</p>
          ) : null}
        </section>
      ) : null}
    </Laag>
  );
}
