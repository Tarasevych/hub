// SEC-002 interface-01 / interface-02 / extensie-02 (12.11.2026): één weergave van een verzoek dat op «Дозволити» wacht.
//   - ALLE parameters, in betekenisvolle volgorde, niets afgekapt (src/goedkeuring-beschrijving.ts);
//   - een lange waarde toont eerst een begin met «показано N із M знаків»; «Дозволити» blijft uit tot de mens alles opengeklapt heeft;
//   - WIE het vraagt (naam van de klant, agent, stukje verbindings-id) in plaats van een vaste «Claude»;
//   - de beslisknoppen reageren alleen op een echte klik en staan in een zone die de browserextensie niet bedient.
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { aanvragerTekst, beschrijfParams, kernVan, LANG_VANAF, type Aanvrager } from './goedkeuring-beschrijving';
import { alleenMens, geenAi } from './menselijke-actie';

type Tr = (uk: string, nl: string) => string;

/** Wie vraagt: pil met de echte naam; onbekend = waarschuwing. */
export function AanvragerPill({ tr, aanvrager }: { tr: Tr; aanvrager: Aanvrager }) {
  const a = aanvragerTekst(aanvrager, tr);
  return (
    <span className={`hub-pill ${a.onbekend ? 'warn' : a.site ? 'ok' : 'warn'}`} data-aanvrager={a.onbekend ? 'onbekend' : a.site ? 'site' : 'ai'}
      title={a.onbekend ? tr('Сайт не знає, яке підключення надіслало цей запит. Якщо ви його не очікували — відхиліть.', 'De site weet niet welke verbinding dit verzoek stuurde. Verwachtte u het niet, weiger het dan.') : tr('Хто просить: назва клієнта ШІ з його підключення', 'Wie vraagt: de naam van de AI-klant uit zijn verbinding')}>
      {a.onbekend ? <AlertTriangle size={12} aria-hidden='true' /> : null}{tr('Просить', 'Vraagt')}: {a.tekst}
    </span>
  );
}

/**
 * Alle parameters van één verzoek. `onGezien(true)` zodra niets meer verborgen is (geen lange waarden, of alles opengeklapt): pas
 * dan mag «Дозволити» aan.
 */
export function GoedkeuringInhoud({ tr, params, onGezien }: { tr: Tr; params: unknown; onGezien?: (gezien: boolean) => void }) {
  const b = beschrijfParams(params, tr);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const verborgenNog = b.velden.filter((v) => v.lang && !open[v.sleutel]).length;
  useEffect(() => { onGezien?.(verborgenNog === 0); }, [verborgenNog, onGezien]);
  const kern = kernVan(params, tr);
  return (
    <div className='hub-goedkeuring' data-goedkeuring-velden={String(b.velden.length)} data-goedkeuring-verborgen={String(verborgenNog)}>
      {kern ? <p className='hub-meta' data-goedkeuring-kern='1' style={{ overflowWrap: 'anywhere' }}><b>{tr('Що саме', 'Wat precies')}:</b> {kern}</p> : null}
      {b.leeg ? <small className='hub-meta'>{tr('Без параметрів.', 'Zonder parameters.')}</small> : (
        <dl style={{ margin: '6px 0', display: 'grid', gap: 4 }}>
          {b.velden.map((v) => (
            <div key={v.sleutel || '_'} data-goedkeuring-veld={v.sleutel || '_'} style={{ minWidth: 0 }}>
              <dt style={{ fontWeight: 600 }}>{v.label}{v.lang ? <small className='hub-meta'> · {tr(`${v.tekens} знаків`, `${v.tekens} tekens`)}</small> : null}</dt>
              <dd style={{ margin: 0, minWidth: 0 }}>
                <pre className='hub-code' style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: v.lang && open[v.sleutel] ? 320 : undefined, overflow: 'auto', margin: 0 }}>
                  {v.lang && !open[v.sleutel] ? `${v.waarde.slice(0, LANG_VANAF)}…` : v.waarde}
                </pre>
                {v.lang ? (
                  <span className='hub-row start' style={{ gap: 8 }}>
                    <small className='hub-meta' data-goedkeuring-getoond={open[v.sleutel] ? 'alles' : 'begin'}>
                      {open[v.sleutel] ? tr(`показано всі ${v.tekens} знаків`, `alle ${v.tekens} tekens getoond`) : tr(`показано ${Math.min(LANG_VANAF, v.tekens)} із ${v.tekens} знаків`, `${Math.min(LANG_VANAF, v.tekens)} van ${v.tekens} tekens getoond`)}
                    </small>
                    {open[v.sleutel] ? null : <button type='button' className='hub-btn' onClick={() => setOpen((o) => ({ ...o, [v.sleutel]: true }))}>{tr('Показати повністю', 'Alles tonen')}</button>}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {b.verborgen ? <p className='hub-note warn' role='note' data-goedkeuring-onzichtbaar={String(b.verborgen)}><AlertTriangle size={14} aria-hidden='true' /> {tr(`У параметрах є ${b.verborgen} невидимих або оманливих символів (показано як ⟦U+…⟧). Так часто ховають справжній зміст — якщо не розумієте навіщо, відхиліть.`, `In de parameters staan ${b.verborgen} onzichtbare of misleidende tekens (getoond als ⟦U+…⟧). Zo wordt vaak de echte inhoud verborgen — begrijpt u niet waarom, weiger dan.`)}</p> : null}
      {verborgenNog ? <p className='hub-note warn' role='note' data-goedkeuring-eerst-lezen='1'>{tr('Спершу розгорніть увесь текст — до того кнопка «Дозволити» неактивна.', 'Klap eerst alle tekst open — tot dan staat «Toestaan» uit.')}</p> : null}
    </div>
  );
}

/** Beslisknop in de stijl van IconButton, maar alleen voor een echte klik en in een zone die de extensie niet bedient. */
export function MensKnop({ icon, children, onKlik, disabled, tone = 'default', title, className }: {
  icon?: ReactNode; children: ReactNode; onKlik: () => void; disabled?: boolean; tone?: 'default' | 'primary' | 'danger'; title?: string; className?: string;
}) {
  return (
    <button type='button' className={className ?? `hub-btn tone-${tone}`} disabled={disabled} title={title} {...geenAi} onClick={alleenMens(() => onKlik())}>
      {icon ? <span className='hub-btn-icon' aria-hidden='true'>{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
