// Beveiliging: EERLIJK. Geen gecertificeerd alarmsysteem achter deze pagina (gecertificeerd: false van de server); alleen wat de
// gateway waarneemt (contact, beweging, water, rook, gas, slot, alarmpaneel, aanwezigheid) met tijd en versheid. Sloten en het
// alarmpaneel zijn alleen door een mens met step-up te bedienen (ApparaatBediening); de AI, scènes en regels raken ze nooit.
import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { VERSHEID_LABEL, versheid, type Apparaat } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import ApparaatBediening from '../ApparaatBediening';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, hoofdTekst, soortTekst, toestandVan, tr } from '../tekst';

type Uit = Awaited<ReturnType<typeof huisClient.beveiliging>>;
const GROEPEN: Array<{ id: string; soorten: string[]; naam: [string, string] }> = [
  { id: 'alarm', soorten: ['alarm', 'vergrendeld'], naam: ['Охорона й замки (лише людина, з підтвердженням)', 'Alarm en sloten (alleen een mens, met bevestiging)'] },
  { id: 'gevaar', soorten: ['rook', 'gas', 'water'], naam: ['Дим, газ, вода', 'Rook, gas, water'] },
  { id: 'toegang', soorten: ['contact', 'beweging'], naam: ['Двері, вікна, рух', 'Deuren, ramen, beweging'] },
  { id: 'aanwezig', soorten: ['aanwezigheid'], naam: ['Присутність', 'Aanwezigheid'] },
];

export default function Beveiliging({ lang, woningId, ov, vernieuw, toon }: OnderdeelProps) {
  const [uit, setUit] = useState<Uit | null>(null);
  const laad = async () => { try { setUit(await huisClient.beveiliging(woningId)); } catch (e) { toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout'); } };
  useEffect(() => { void laad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [woningId, ov]);
  const magCmd = ov.lid.magSchrijven && ov.integraties.some((i) => i.schrijven);
  const apparaten = uit?.apparaten ?? [];
  const alarmen = apparaten.filter((a) => ['rook', 'gas', 'water'].some((k) => toestandVan(a, k)?.waarde === true && versheid(toestandVan(a, k)) === 'vers'));
  return (
    <div className='hv-beveiliging'>
      <p className='hv-melding is-info' data-hv-gecertificeerd={String(uit?.gecertificeerd ?? false)}><ShieldAlert aria-hidden='true' />{tr(lang, 'Ця сторінка — не охоронна система. Вона лише показує, що бачить шлюз, і не замінює сертифіковану сигналізацію з власним застосунком. ШІ, сцени та правила ніколи не керують охороною, замками чи сиренами.', 'Deze pagina is geen alarmsysteem. Ze toont alleen wat de gateway waarneemt en vervangt geen gecertificeerd alarm met eigen app. AI, scènes en regels bedienen nooit alarm, sloten of sirenes.')}</p>
      {alarmen.length ? <p className='hv-melding is-fout' role='alert' data-hv-gevaar={alarmen.length}><AlertTriangle aria-hidden='true' />{tr(lang, `Датчик повідомляє про небезпеку: ${alarmen.map((a) => a.naam).join(', ')}. Перевірте на місці.`, `Een sensor meldt gevaar: ${alarmen.map((a) => a.naam).join(', ')}. Controleer ter plaatse.`)}</p> : null}
      {uit && !apparaten.length ? <section className='hv-leeg'><ShieldCheck aria-hidden='true' /><h3>{tr(lang, 'Немає датчиків безпеки', 'Geen beveiligingssensoren')}</h3><p>{tr(lang, 'Після імпорту з Home Assistant тут з’являться контактні датчики, датчики руху, диму, газу й протікання, замки та панель охорони — з реальним станом і часом.', 'Na import uit Home Assistant verschijnen hier contact-, bewegings-, rook-, gas- en lekdetectoren, sloten en het alarmpaneel — met echte toestand en tijd.')}</p></section> : null}
      {GROEPEN.map((g) => { const lijst = apparaten.filter((a) => a.mogelijkheden.some((m) => g.soorten.includes(m.soort))); if (!lijst.length) return null; return (
        <section key={g.id} className='hv-blok' aria-labelledby={`hv-bev-${g.id}`} data-hv-bev-groep={g.id}>
          <h3 id={`hv-bev-${g.id}`}>{tr(lang, g.naam[0], g.naam[1])} <small>{lijst.length}</small></h3>
          <div className='hv-raster'>
            {lijst.map((a) => <Kaart key={a.id} lang={lang} a={a} woningId={woningId} magCmd={magCmd && g.id === 'alarm'} onVernieuw={() => { void vernieuw(); void laad(); }} />)}
          </div>
        </section>
      ); })}
      <p className='hv-hint'>{tr(lang, 'Сторінка показує лише спостережувані стани; коли шлюз мовчить понад 15 хвилин, значення позначаються як застарілі, а не як «усе гаразд».', 'De pagina toont alleen waargenomen toestanden; zwijgt de gateway langer dan 15 minuten, dan heten de waarden verouderd, niet «alles in orde».')}</p>
    </div>
  );
}

function Kaart({ lang, a, woningId, magCmd, onVernieuw }: { lang: 'uk' | 'nl'; a: Apparaat; woningId: string; magCmd: boolean; onVernieuw: () => void }) {
  const h = hoofdTekst(lang, a); const t = a.toestanden[0];
  return (
    <article className={`hv-kaart is-${h.vers}${a.kritiek ? ' is-kritiek' : ''}`} data-hv-bev-kaart={a.id} data-hv-versheid={h.vers}>
      <small>{soortTekst(lang, a.soort)}{a.kritiek ? ` · ${tr(lang, 'критично', 'kritiek')}` : ''}</small>
      <strong>{a.naam}</strong>
      <span className='hv-waarde'>{h.tekst}</span>
      <em>{tr(lang, VERSHEID_LABEL[h.vers][0], VERSHEID_LABEL[h.vers][1])} · {datumTekst(lang, t?.waargenomenOp || t?.ontvangenOp || null)}</em>
      {a.kritiek && a.mogelijkheden.some((m) => m.schrijven) ? <ApparaatBediening lang={lang} woningId={woningId} apparaat={a} magSchrijven={magCmd} compact onVernieuw={onVernieuw} /> : null}
    </article>
  );
}
