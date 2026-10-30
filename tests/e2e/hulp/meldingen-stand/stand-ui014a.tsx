// UI-014 fase 2A: stand-ui014 + de nieuwe kaarten (nieuw apparaat, code vanaf ander apparaat, passkey, herstelcode) met exact de
// teksten van backend/nieuw-apparaat.ts, toegangscodes.ts, toegangssleutels.ts en toegangslaag.ts. Gebruikt door meldingen-ui014a.e2e.ts.
// UI-014: zelfde stand als stand.tsx, maar met de GLOBALE site-css (src/index.css — die lekte in de voet) en de drie kaarten uit de
// schermafbeeldingen van de eigenaar. Gebruikt door tests/e2e/meldingen-ui014.e2e.ts.
// Oorspronkelijk: stand voor tests/e2e/meldingen-v2-ui.e2e.ts: het ECHTE meldingencentrum (src/CanoniekMeldingencentrum.tsx) zonder server, met een
// realistische hoeveelheid meldingen (zoals op de live site: honderden regels, herhaalde procesmeldingen, twee Google-accounts,
// technische ruis). De vlag komt uit sessionStorage (zelfde sleutel als src/meldingen/v2/vlag.ts); /api beantwoordt de test.
import { StrictMode, useMemo, useState } from 'react';
import { PLAATSEN, indeling, standaardPlaatsing, zoneBestaat, type Indeling, type PaginaContext, type ZoneId } from '../../../../shared/plaatsing';
import { Gniezda, useKlasse, useZone } from '../../../../src/plaatsing/Plek';
import { createRoot } from 'react-dom/client';
import CanonicalNotificationCenter from '../../../../src/CanoniekMeldingencentrum';
import { meldingInTaal, type CanonicalServerNotification } from '../../../../src/canoniek-meldingen';
import '../../../../src/index.css';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/meldingenpaneel.css';

const zoek = new URLSearchParams(location.search);
const lang = location.pathname.startsWith('/nl/') ? 'nl' : 'uk';
const NU = Number(zoek.get('nu')) || Date.now();
try { sessionStorage.setItem('mr-vlag:meldingen-v2', zoek.get('v2') === '1' ? '1' : '0'); sessionStorage.setItem('mr-vlag:meldingen-uitleg-v3', zoek.get('v3') === '1' ? '1' : '0'); localStorage.setItem('tsv:activity-read-v1:stand', '[]'); } catch { /* geen opslag */ }
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
voeg({ kind: 'mail_sync_failed', title: 'Пошта не синхронізується / Mail synchroniseert niet', message: 'Google відкликав доступ. Увійдіть знову, щоб продовжити. / Google trok de toegang in. Meld opnieuw aan.', provider: 'google', account: 'pavlo.tarasevych@gmail.com', link: '/mail/accounts', createdAt: NU - 12 * 60_000 });
voeg({ kind: 'mail_sync_failed', title: 'Пошта не синхронізується / Mail synchroniseert niet', message: 'Google відкликав доступ. / Google trok de toegang in.', provider: 'google', account: 'pavlo.tarasevych@gmail.com', link: '/mail/accounts', createdAt: NU - 95 * 60_000 });
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
// 7) UI-014: de kaart uit de schermafbeelding van de eigenaar (19 dagen oud, twee keer)
for (const d of [19, 19.01]) voeg({ kind: 'security_warning', title: 'Право готувати оновлення відкликано / Recht om updates voor te bereiden ingetrokken', message: 'eigenaar@example.test відкликав право «Власник — з пристрою». Причина: «наданнно оновленні права розширені до 30 днів, Павлом». Якщо це несподівано — перегляньте зміну. / eigenaar@example.test heeft het recht «Власник — з пристрою» ingetrokken. Reden: «наданнно оновленні права розширені до 30 днів, Павлом». Onverwacht? Bekijk de wijziging.', link: 'https://id.tarasevych.com/methods?wijziging=w-1', createdAt: NU - d * 86400_000 });
// 8) UI-014 fase 2A: aanmeldingen en aanmeldmethoden (teksten zoals de backend ze maakt)
voeg({ kind: 'security_warning', title: 'Новий вхід на новому пристрої / Nieuwe aanmelding op een nieuw apparaat', message: 'Обліковий запис eigenaar@example.test · пристрій «Safari/iOS» · регіон за IP: Antwerpen, BE · 30 жовтня 2026 р. о 08:57 (Брюссель) · спосіб: Google. Якщо це були ви — натисніть «Це був я». Якщо ні — завершіть сеанс і змініть доступ. / Account eigenaar@example.test · apparaat «Safari/iOS» · regio volgens IP: Antwerpen, BE · 30 oktober 2026 om 08:57 (Brussel) · methode: Google. Was u dit: «Dit was ik». Zo niet: beëindig de sessie en wijzig de toegang.', link: 'https://id.tarasevych.com/sessions?apparaat=81a2a8ce-e8ab-4150-9a20-36f7365664e6', createdAt: NU - 3 * 60_000 });
voeg({ kind: 'security', title: 'Код доступу «Для Олени» використано з іншого пристрою / Toegangscode «Для Олени» gebruikt vanaf een ander apparaat', message: 'Код «Для Олени» щойно використано на пристрої «Chrome/Android», якого раніше з цим кодом не було · 30 жовтня 2026 р. о 08:40 (Брюссель). Якщо код міг потрапити до чужих рук — завершіть гостьовий сеанс і відкличте код. / Code «Для Олени» is net gebruikt op apparaat «Chrome/Android», dat deze code nog niet gebruikte · 30 oktober 2026 om 08:40 (Brussel). Kan de code in verkeerde handen zijn: beëindig de gastsessie en trek de code in.', link: 'https://id.tarasevych.com/methods?code=c-1#toegangscodes', createdAt: NU - 20 * 60_000 });
voeg({ kind: 'security', title: 'Новий passkey / Nieuwe passkey', message: '«YubiKey 5» додано до способів входу. / «YubiKey 5» is toegevoegd aan je aanmeldmethoden.', createdAt: NU - 2 * 3600_000 });
voeg({ kind: 'access_recovery_code_used', title: 'Використано код відновлення / Herstelcode gebruikt', message: 'Один код відновлення щойно використано (дія: inloggen) на пристрої «Firefox/Linux» · 30 жовтня 2026 р. о 06:10 (Брюссель). Цей код більше не діє. Якщо це були не ви — завершіть чужі сеанси й створіть нові коди. / Er is net een herstelcode gebruikt (actie: inloggen) op apparaat «Firefox/Linux» · 30 oktober 2026 om 06:10 (Brussel). Die code werkt niet meer. Was u dit niet: beëindig vreemde sessies en maak nieuwe codes.', createdAt: NU - 3 * 3600_000 });
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
