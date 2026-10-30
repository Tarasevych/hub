// Tabel «Сервер (для всіх) / Цей акаунт» (shared/diagnostiek-account.ts). Openbaar onderdeel: gebruikt door «Стан моїх служб» in de
// instellingen (alleen kolom «Мій акаунт») en door Діагностика (beide kolommen). Alleen standen en korte codes — nooit inhoud.
import { AlertTriangle, Check, CircleHelp, Minus, XCircle } from 'lucide-react';
import type { Stand, Tekst } from '../../shared/beheer-diagnostiek';
import { CONCLUSIE_TEKST, adviesVoor, schoonAccountUitslag, isAccountDienst, type Conclusie, type TabelRij } from '../../shared/diagnostiek-account';
import './mijn-diensten.css';

export type Lang = 'uk' | 'nl';
const t = (lang: Lang, x: Tekst) => (lang === 'uk' ? x[0] : x[1]);
const STAND: Record<Stand | 'nooit', Tekst> = { ok: ['Справно', 'In orde'], 'let-op': ['Увага', 'Let op'], fout: ['Збій', 'Fout'], onbekend: ['Невідомо', 'Onbekend'], nooit: ['Не перевірено', 'Niet gecontroleerd'] };
const Icoon = ({ s }: { s: Stand | 'nooit' }) => s === 'ok' ? <Check aria-hidden='true' /> : s === 'fout' ? <XCircle aria-hidden='true' /> : s === 'let-op' ? <AlertTriangle aria-hidden='true' /> : s === 'nooit' ? <Minus aria-hidden='true' /> : <CircleHelp aria-hidden='true' />;
export const tijdKort = (lang: Lang, ms: number) => (ms ? new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Antwoord van de server → veilige rijen (alles wat vreemd is valt weg). */
export function rijenUit(raw: unknown): TabelRij[] {
  const lijst = Array.isArray(raw) ? raw : [];
  const uit: TabelRij[] = [];
  for (const r of lijst) {
    const o = r && typeof r === 'object' ? r as Record<string, unknown> : {};
    if (!isAccountDienst(o.dienst)) continue;
    const s = o.server && typeof o.server === 'object' ? o.server as Record<string, unknown> : null;
    const naam = Array.isArray(o.naam) && o.naam.length === 2 ? [String(o.naam[0]).slice(0, 60), String(o.naam[1]).slice(0, 60)] as unknown as Tekst : ['', ''] as unknown as Tekst;
    const sStand = s && ['ok', 'let-op', 'fout', 'onbekend', 'nooit'].includes(String(s.stand)) ? s.stand as Stand | 'nooit' : 'nooit';
    const conclusies: Conclusie[] = ['alles-ok', 'server', 'account', 'beide', 'onbekend'];
    uit.push({
      dienst: o.dienst, naam,
      server: s ? { stand: sStand, op: Number(s.op) || 0, controles: [] } : null,
      account: schoonAccountUitslag(o.account),
      conclusie: conclusies.includes(o.conclusie as Conclusie) ? o.conclusie as Conclusie : 'onbekend',
    });
  }
  return uit;
}

export default function DienstenTabel({ lang, rijen, metServer }: { lang: Lang; rijen: TabelRij[]; metServer: boolean }) {
  const kolom = metServer ? (lang === 'uk' ? 'Цей акаунт' : 'Dit account') : (lang === 'uk' ? 'Мій акаунт' : 'Mijn account');
  return (
    <div className='mdt-wrap'>
      <table className={`mdt${metServer ? ' mdt-twee' : ''}`}>
        <thead><tr>
          <th scope='col'>{lang === 'uk' ? 'Служба' : 'Dienst'}</th>
          {metServer && <th scope='col'>{lang === 'uk' ? 'Сервер (для всіх)' : 'Server (voor iedereen)'}</th>}
          <th scope='col'>{kolom}</th>
        </tr></thead>
        <tbody>
          {rijen.map((r) => {
            const a = r.account, adv = a ? adviesVoor(a.code) : null;
            return (
              <tr key={r.dienst} data-mdt-dienst={r.dienst} data-mdt-conclusie={r.conclusie}>
                <th scope='row'>{t(lang, r.naam)}</th>
                {metServer && <td data-label={lang === 'uk' ? 'Сервер (для всіх)' : 'Server (voor iedereen)'}>
                  <span className={`mdt-stand is-${r.server?.stand ?? 'nooit'}`}><Icoon s={r.server?.stand ?? 'nooit'} />{t(lang, STAND[r.server?.stand ?? 'nooit'])}</span>
                  {r.server?.op ? <small>{tijdKort(lang, r.server.op)}</small> : null}
                </td>}
                <td data-label={kolom}>
                  <span className={`mdt-stand is-${a?.stand ?? 'nooit'}`}><Icoon s={a?.stand ?? 'nooit'} />{t(lang, STAND[a?.stand ?? 'nooit'])}</span>
                  {a?.op ? <small>{tijdKort(lang, a.op)}</small> : null}
                  {adv && a && a.stand !== 'ok' && <p className='mdt-advies'><b>{t(lang, adv.wat)}</b> {t(lang, adv.doe)}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {metServer && <ul className='mdt-conclusies'>
        {rijen.filter((r) => r.conclusie === 'server' || r.conclusie === 'account' || r.conclusie === 'beide').map((r) => (
          <li key={r.dienst} className={`is-${r.conclusie}`}><b>{t(lang, r.naam)}:</b> {t(lang, CONCLUSIE_TEKST[r.conclusie])}</li>
        ))}
      </ul>}
    </div>
  );
}
