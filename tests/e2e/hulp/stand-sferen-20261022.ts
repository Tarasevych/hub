// Стенд (22.10.2026, зона C) — сфери сповіщень: prive | technisch. Скарга власника: технічні сповіщення (аудит, збої діагностики, дії
// агентів, звірка) досі в панелі користувача (99+/120). Кроки «sferen-*»:
//   sferen-bel-prive         — hub.*/overzicht БЕЗ технічного профілю: засіяно 4 особисті + 6 технічних сповіщень (з них 3 «старі» рядки
//                              без `ruimte`/`sfeer`, як до 20.10) + 3 записи аудиту (admin, siem, mail). Відкритий дзвоник: лише особисті
//                              лічильник = особисті, у списку жодного технічного заголовка й жодної технічної дії (admin, діагностика,
//                              дія ШІ через технічне підключення).
//   sferen-band-technisch    — той самий акаунт з технічним профілем (fase tech): панель «Технічні сповіщення» у смузі: лише технічні
//                              сповіщення + розділ «Дії в технічному просторі» (адміністрування, діагностика, дія ШІ через технічне
//                              підключення, активація профілю) з назвами з журналу; особистих (пошта) немає, сирих кодів «Дія на сайті: …» немає.
// Усе локально: сповіщення через backend/melder і прямі рядки в app.records (той самий процес, що й сервер стенду); аудит через
// server/platform/audit.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { meld } from '../../../backend/melder';
import { auditToevoegen } from '../../../server/platform/audit';
import { getPool } from '../../../server/platform/pg';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech' };
export type SferenCtx = { hubUrl: string; uid: () => string; uit: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

export const PRIVE_TITELS = ['Новий вхід з Pixel (Київ)', 'Доступ до теки «Фото 2026»', 'Ваш запит на доступ схвалено', 'ШІ просить підтвердити надсилання листа'];
export const TECH_TITELS = ['Збій встановлення оновлення 20261022-1', 'SIEM: 12 невдалих входів за годину', 'Ключ сховища закінчується за 3 дні', 'Виявлено збій сервісу: пошта (старе)', 'Звірка: 2 порушення RLS (старе)', 'Новий запит на доступ (старе)'];
let gezaaid = false;
/** Засів: особисті + технічні (3 «старі» без ruimte/sfeer) + аудит. Один раз на процес стенду. */
export async function zaaiSferen(uid: string, zeg: (s: string) => void): Promise<boolean> {
  if (gezaaid || !uid) return false;
  gezaaid = true;
  const pool = getPool('systeem');
  const nu = Date.now();
  const oude: Array<[string, string]> = [['server', TECH_TITELS[3]], ['siem', TECH_TITELS[4]], ['access_request', TECH_TITELS[5]]];
  for (const [kind, title] of oude) await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['site_notifications', randomUUID(), { recipientUserId: uid, recipientEmail: '', kind, title, message: 'Рядок від 19.10.2026 без поля ruimte/sfeer — до 22.10 стояв у дзвонику користувача.', read: false, createdAt: nu - 86_400_000 }]);
  await meld(uid, 'uitrol.mislukt', TECH_TITELS[0], 'Інсталятор зупинився на кроці «активація»; попередній випуск повернуто.');
  await meld(uid, 'siem', TECH_TITELS[1], 'Джерело: 203.0.113.0/24. Деталі в журналі.');
  await meld(uid, 'vault_key_expiring', TECH_TITELS[2], 'Поверніть ключ до 25.10.2026.');
  await meld(uid, 'security_warning', PRIVE_TITELS[0], 'Це були ви? Якщо ні — завершіть сеанс.', '/overzicht');
  await meld(uid, 'workspace_share', PRIVE_TITELS[1], 'Марія поділилася текою з вами.');
  await meld(uid, 'access_decision', PRIVE_TITELS[2], 'Простір створено, ласкаво просимо.');
  await meld(uid, 'ai_bevestiging', PRIVE_TITELS[3], 'Claude хоче надіслати відповідь Петрові.');
  // Echte actiecodes: beheer (admin), diagnose (backend/diagnose.ts), een AI-actie via de TECHNISCHE koppeling (backend/mcp-connector.ts
  // werkDetails: ruimte + v2-naam «…_beheer») en — ter controle — een persoonlijke postactie die alleen in de bel mag staan.
  const audits: Array<[string, string, Record<string, unknown>]> = [
    ['owner.admin.user.updated', 'success', {}],
    ['owner.diagnose.gemeld', 'success', { oordeel: 'storing', dienst: 'mail' }],
    ['owner.mcp.tool', 'success', { tool: 'machine_exec', doel: 'systemctl status mijn-ruimte', client: 'Claude', ruimte: 'technisch', soort: 'schrijven', v2: 'uitvoeren_opdracht_claude_mcp_tarasevych_com_beheer', agent: 'claude' }],
    ['owner.mail.send.committed', 'success', {}],
  ];
  for (const [action, result, details] of audits) {
    await auditToevoegen({ ownerId: uid, actorId: uid, action, result, details }).catch((e) => zeg(`   audit ${action}: ${(e as Error).message}`));
  }
  // Після «старих» рядків: міграція 0107 у стенді вже застосована? Якщо ні — сервер сам класифікує за соортом (sfeerVanRij); етикетка на старих рядках не потрібна для панелі.
  return true;
}

const openBel = async (p: Page) => {
  const bel = p.locator("[data-qa-id='canonical-notification-bell']").first();
  // 25.10.2026: op de telefoon staat de bel in de kop van het menu (zones, shared/plaatsing.ts) — eerst de lade openen
  if (!(await bel.isVisible().catch(() => false))) { const m = p.locator(".canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']").first(); if (await m.isVisible().catch(() => false)) { await m.click({ timeout: 5000 }); await p.waitForTimeout(500); } }
  await bel.waitFor({ timeout: 15000 });
  if ((await bel.getAttribute('aria-expanded')) !== 'true') await bel.click({ timeout: 5000 }).catch(() => bel.evaluate((el) => (el as HTMLElement).click()));
  await p.locator('.canonical-notification-panel').first().waitFor({ timeout: 5000 });
  await p.waitForTimeout(900);
};
const paneelTekst = (p: Page) => p.evaluate(() => ({
  rijen: [...document.querySelectorAll('.canonical-notification-panel .cnc-row')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140)),
  sferen: [...document.querySelectorAll('.canonical-notification-panel .cnc-row')].map((e) => `${e.getAttribute('data-origin') || '?'}:${e.getAttribute('data-sfeer') || '-'}`),
  kop: (document.querySelector('.canonical-notification-panel>header')?.textContent || '').replace(/\s+/g, ' ').trim(),
  badge: (document.querySelector("[data-qa-id='canonical-notification-bell'] small")?.textContent || '').trim(),
  techRegel: (document.querySelector('.canonical-notification-panel .cnc-tech-regel, .canonical-notification-panel [data-qa-id="melding-tech-regel"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
  scrollWidth: document.documentElement.scrollWidth, vw: innerWidth,
}));

export function sferenStappen(c: SferenCtx): Stap[] {
  const belPrive = async (p: Page) => {
    if (await zaaiSferen(c.uid(), c.zeg)) { await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500); }
    await openBel(p);
    await p.waitForFunction(() => document.querySelectorAll('.canonical-notification-panel .cnc-row').length >= 3, null, { timeout: 15000 }).catch(() => undefined);
    const m = await paneelTekst(p);
    const v = p.viewportSize();
    writeFileSync(join(c.uit, `meting-sferen-bel-prive-${v?.width}.json`), JSON.stringify(m, null, 1));
    const alles = m.rijen.join(' | ');
    const slecht = [
      ...TECH_TITELS.filter((t) => alles.includes(t.replace(' (старе)', ''))).map((t) => `technisch in de bel: ${t}`),
      // Elke rij in de bel draagt de sfeer van de server (data-sfeer); geen enkele mag 'technisch' zijn — meldingen noch activiteiten.
      ...(m.sferen.some((x) => x.endsWith(':technisch')) ? [`technische rijen in de bel: ${m.sferen.filter((x) => x.endsWith(':technisch')).length}`] : []),
      ...(m.sferen.filter((x) => x.startsWith('server:') || x.startsWith('activity:')).some((x) => x.endsWith(':-')) ? ['serverrij zonder sfeer'] : []),
      ...(/Дія на сайті|Користувача змінено|Дія в розділі|SIEM:/i.test(alles) ? ['technische activiteit (tekst) in de bel'] : []),
      ...(PRIVE_TITELS.filter((t) => alles.includes(t)).length < 4 ? [`persoonlijke titels gevonden: ${PRIVE_TITELS.filter((t) => alles.includes(t)).length}/4`] : []),
      ...(m.scrollWidth > m.vw ? [`horizontale overloop ${m.scrollWidth} > ${m.vw}`] : []),
    ].join('; ');
    c.meting('sferen-bel-prive', p, slecht, JSON.stringify(m));
  };
  const bandTech = async (p: Page) => {
    await zaaiSferen(c.uid(), c.zeg);
    await p.waitForTimeout(1500);
    const knop = p.locator('[data-tech-knop="meldingen"]').first();
    if (!(await knop.isVisible().catch(() => false))) { const meer = p.locator('[data-tech-knop="meer"]').first(); if (await meer.count()) { await meer.click({ timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(400); } }
    await knop.click({ timeout: 8000 }).catch(() => knop.evaluate((el) => (el as HTMLElement).click()));
    await p.locator('[data-tech-meldingen-paneel]').first().waitFor({ timeout: 8000 });
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => ({
      items: [...document.querySelectorAll('[data-tech-meldingen-paneel] .tm-item')].map((e) => ({ kind: e.getAttribute('data-tm-kind') || '', act: e.getAttribute('data-tm-activiteit-id') || '', tekst: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) })),
      teller: document.querySelector('[data-tech-meldingen-teller]')?.getAttribute('data-tech-meldingen-teller') || '0',
      activiteit: !!document.querySelector('[data-tm-activiteit]'),
      scrollWidth: document.documentElement.scrollWidth, vw: innerWidth,
    }));
    const v = p.viewportSize();
    writeFileSync(join(c.uit, `meting-sferen-band-technisch-${v?.width}.json`), JSON.stringify(m, null, 1));
    const alles = m.items.map((i) => i.tekst).join(' | ');
    const slecht = [
      ...PRIVE_TITELS.filter((t) => alles.includes(t)).map((t) => `persoonlijk in de band: ${t}`),
      ...(TECH_TITELS.filter((t) => alles.includes(t.replace(' (старе)', ''))).length < 6 ? [`technische titels gevonden: ${TECH_TITELS.filter((t) => alles.includes(t.replace(' (старе)', ''))).length}/6`] : []),
      ...(!m.activiteit ? ['geen sectie «Дії в технічному просторі»'] : []),
      ...(m.items.filter((i) => i.act).length < 3 ? [`technische activiteiten: ${m.items.filter((i) => i.act).length} (< 3)`] : []),
      // Nooit de interne code als naam (review 21.10: «Дія на сайті: mail contacten scan gestart»).
      ...(m.items.some((i) => i.act && /Дія на сайті:|Actie op de site:/.test(i.tekst)) ? [`ruwe actiecode in de band: ${m.items.filter((i) => i.act && /Дія на сайті:|Actie op de site:/.test(i.tekst)).map((i) => i.tekst.slice(0, 60)).join(' / ')}`] : []),
      ...(alles.includes('Лист надіслано') || alles.includes('Bericht verzonden') ? ['persoonlijke activiteit (post) in de band'] : []),
      ...(m.scrollWidth > m.vw ? [`horizontale overloop ${m.scrollWidth} > ${m.vw}`] : []),
    ].join('; ');
    c.meting('sferen-band-technisch', p, slecht, JSON.stringify(m));
  };
  return [
    { naam: 'sferen-bel-prive', url: `${c.hubUrl}/overzicht`, na: belPrive },
    { naam: 'sferen-band-technisch', url: `${c.hubUrl}/overzicht`, fase: 'tech', na: bandTech },
  ];
}
