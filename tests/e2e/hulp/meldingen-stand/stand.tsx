// Stand voor tests/e2e/meldingen-v2-ui.e2e.ts: het ECHTE meldingencentrum (src/CanoniekMeldingencentrum.tsx) zonder server, met een
// realistische hoeveelheid meldingen (zoals op de live site: honderden regels, herhaalde procesmeldingen, twee Google-accounts,
// technische ruis). De vlag komt uit sessionStorage (zelfde sleutel als src/meldingen/v2/vlag.ts); /api beantwoordt de test.
import { StrictMode, useMemo, useState } from 'react';
import { PLAATSEN, indeling, standaardPlaatsing, zoneBestaat, type Indeling, type PaginaContext, type ZoneId } from '../../../../shared/plaatsing';
import { Gniezda, useKlasse, useZone } from '../../../../src/plaatsing/Plek';
import { createRoot } from 'react-dom/client';
import CanonicalNotificationCenter from '../../../../src/CanoniekMeldingencentrum';
import { meldingInTaal, type CanonicalServerNotification } from '../../../../src/canoniek-meldingen';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/meldingenpaneel.css';

const zoek = new URLSearchParams(location.search);
const lang = location.pathname.startsWith('/nl/') ? 'nl' : 'uk';
const NU = Number(zoek.get('nu')) || Date.now();
try { sessionStorage.setItem('mr-vlag:meldingen-v2', zoek.get('v2') === '1' ? '1' : '0'); } catch { /* geen opslag */ }
document.documentElement.lang = lang;
const thema = zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light';
document.documentElement.classList.add(thema);

const items: CanonicalServerNotification[] = [];
let i = 0;
const voeg = (o: Partial<CanonicalServerNotification> & Record<string, unknown>) => items.push({ id: `n${++i}`, kind: 'info', title: '', message: '', createdAt: NU - i * 7 * 60_000, read: false, ...o } as CanonicalServerNotification);
// 1) 60 rondes van de adrescontrole: start + einde (120 regels)
for (let r = 0; r < 60; r++) {
  voeg({ kind: 'adrescontrole.start', title: 'Перевірку всіх адрес розпочато / Controle van alle adressen gestart', message: `Ронда ${60 - r}`, createdAt: NU - (r * 30 + 3) * 60_000, read: r > 4 });
  voeg({ kind: 'adrescontrole.einde', title: 'Перевірку всіх адрес завершено / Controle van alle adressen klaar', message: `Перевірено ${1200 + r} адрес`, createdAt: NU - r * 30 * 60_000 - 60_000, read: r > 4 });
}
// 2) Twee Google-accounts: synchronisatiefout op het ene, succes op het andere
voeg({ kind: 'mail_sync_failed', title: 'Пошта не синхронізується / Mail synchroniseert niet', message: 'Google відкликав доступ. Увійдіть знову, щоб продовжити. / Google trok de toegang in. Meld opnieuw aan.', provider: 'google', account: 'eigenaar@example.test', link: '/mail/accounts', createdAt: NU - 12 * 60_000 });
voeg({ kind: 'mail_sync_failed', title: 'Пошта не синхронізується / Mail synchroniseert niet', message: 'Google відкликав доступ. / Google trok de toegang in.', provider: 'google', account: 'eigenaar@example.test', link: '/mail/accounts', createdAt: NU - 95 * 60_000 });
voeg({ kind: 'mail_import_done', title: 'Імпорт листів завершено / Import van berichten klaar', message: '342 листи', provider: 'google', account: 'werk@tarasevych.be', accountLabel: lang === 'uk' ? 'Робочий' : 'Werk', createdAt: NU - 40 * 60_000 });
// 3) Beveiliging en verzoeken
voeg({ kind: 'security_warning', title: 'Новий вхід з пристрою Pixel 9 / Nieuwe aanmelding vanaf Pixel 9', message: 'Брюссель, 14:02. Якщо це не ви — змініть ключ входу. / Brussel, 14:02.', link: '/identity/sessies', createdAt: NU - 25 * 60_000 });
voeg({ kind: 'access_request', title: 'Запит на доступ до теки «Сім’я» / Toegangsverzoek voor map «Familie»', message: 'Олена просить дозволу на перегляд. / Olena vraagt leesrechten.', link: '/cloud/delen', read: true, createdAt: NU - 3 * 3600_000 });
// 4) Cloud: fout gevolgd door succes (opgelost), en een gedeelde map
voeg({ kind: 'cloud_sync.mislukt', procesId: 'cloud-sync-onedrive', title: 'OneDrive: синхронізація не вдалася / OneDrive: synchronisatie mislukt', message: 'Немає з’єднання / Geen verbinding', provider: 'microsoft', createdAt: NU - 5 * 3600_000 });
voeg({ kind: 'cloud_sync.klaar', procesId: 'cloud-sync-onedrive', title: 'OneDrive синхронізовано / OneDrive gesynchroniseerd', message: '18 файлів / 18 bestanden', provider: 'microsoft', createdAt: NU - 4 * 3600_000 });
voeg({ kind: 'workspace_share', title: 'Анна поділилася файлом «Рахунки 2026.xlsx» / Anna deelde «Rekeningen 2026.xlsx»', message: '', link: '/cloud', createdAt: NU - 50 * 60_000 });
// 5) Technische ruis die niet in het gewone centrum hoort
for (let r = 0; r < 14; r++) voeg({ kind: 'extensie', title: r % 2 ? 'Розширення розблоковано / Extensie ontgrendeld' : 'Розширення відхилено / Extensie geweigerd', message: 'EXT_UNLOCK_GRANTED', createdAt: NU - (r * 45 + 7) * 60_000 });
for (let r = 0; r < 12; r++) voeg({ kind: 'huis_poll', title: `Повторна спроба ${r + 1} з 12 — Home Assistant / Herhaalpoging ${r + 1} van 12`, message: 'HA_POLL_TIMEOUT', createdAt: NU - (r * 20 + 9) * 60_000 });
// 6) Gewoon
voeg({ kind: 'calendar_reminder', title: 'Через 30 хв: дзвінок з бухгалтером / Over 30 min: gesprek met boekhouder', message: '', link: '/agenda', createdAt: NU - 2 * 60_000 });

function Zone({ zone, ind }: { zone: ZoneId; ind: Indeling }) {
  const props = useZone(zone, ind);
  return <div data-stand-zone={zone} {...props} style={{ ...(props as { style?: object }).style, display: 'flex', gap: 8, padding: 8, justifyContent: 'flex-end' }}><Gniezda zone={zone} ind={ind} /></div>;
}
function Stand() {
  const klasse = useKlasse();
  const ctx = useMemo<PaginaContext>(() => ({ klasse, dienst: 'hub', zoekInMenu: false }), [klasse]);
  const ind = useMemo(() => indeling(standaardPlaatsing(), ctx), [ctx]);
  const zones = (Object.keys(PLAATSEN) as ZoneId[]).filter((z) => zoneBestaat(z, ctx));
  const [lijst, setLijst] = useState(() => items.map((m) => meldingInTaal(m, lang)));
  return (
    <div className={`canonical-chrome ${thema}`} style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      {zones.map((z) => <Zone key={z} zone={z} ind={ind} />)}
      <CanonicalNotificationCenter lang={lang} scope='stand' serverItems={lijst} onReadServer={(id) => setLijst((l) => l.map((x) => (x.id === id ? { ...x, read: true } : x)))} onReadAllServer={() => setLijst((l) => l.map((x) => ({ ...x, read: true })))} />
    </div>
  );
}
const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
createRoot(root).render(<StrictMode><Stand /></StrictMode>);
